// Instructores (C1): quien imparte los grupos.
//
//   GET    /api/instructores?sucursal_id=&activo=&limite=&pagina=   (catalogo:leer; filtrado según el rol)
//   GET    /api/instructores/:id                                      (catalogo:leer)
//   POST   /api/instructores   { nombre, telefono?, correo?, sucursales?, usuario_id?, activo? }   (catalogo:escribir)
//   PATCH  /api/instructores/:id   { nombre?, telefono?|null, correo?|null, sucursales?, usuario_id?|null, activo? }
//   DELETE /api/instructores/:id   baja lógica (409 si todavía tiene grupos)
//
// `sucursales` = dónde da clases; vacío = sin restricción. Un grupo solo acepta a un instructor que trabaje
// en su sucursal (o que no tenga restricción). El teléfono se guarda normalizado con `normalizarTelefono()`
// (invariante 7). `usuario_id` liga al instructor con la persona que entra como maestro (a lo más uno por
// usuario): de ahí sale «sus grupos». Alcance de lectura: administrador todos; asesor y recepción, los de sus
// sucursales (y los sin restricción); maestro, solo el suyo.

import { Router } from "express";
import express from "express";
import { CANDADO_OCUPACION } from "../../catalogo/choques.ts";
import { altaConAlcance, type Consultas } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { normalizarTelefono } from "../../lib/telefono.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, correo, listaDe, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  nombre: true,
  telefono: true,
  correo: true,
  activo: true,
  usuario_id: true,
  creado_en: true,
  sucursales: { where: { eliminado_en: null }, select: { sucursal_id: true }, orderBy: { sucursal_id: "asc" } },
} as const;

interface FilaInstructor {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  activo: boolean;
  usuario_id: string | null;
  creado_en: Date;
  sucursales: { sucursal_id: string }[];
}

const presentar = (i: FilaInstructor) => ({ id: i.id, nombre: i.nombre, telefono: i.telefono, correo: i.correo, activo: i.activo, usuario_id: i.usuario_id, sucursales: i.sucursales.map((s) => s.sucursal_id), creado_en: i.creado_en });
const instantanea = (i: FilaInstructor): Instantanea => ({ nombre: i.nombre, telefono: i.telefono, correo: i.correo, activo: i.activo, usuario_id: i.usuario_id, sucursales: i.sucursales.map((s) => s.sucursal_id) });

const esquemaListado = objeto({ ...esquemaPaginacion, sucursal_id: opcional(uuid()), activo: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });
const esquemaAlta = objeto({
  nombre: texto({ max: 120 }),
  telefono: opcional(nulable(texto({ max: 30 }))),
  correo: opcional(nulable(correo())),
  sucursales: opcional(listaDe(uuid(), { max: 100, unicos: true })),
  usuario_id: opcional(nulable(uuid())),
  activo: opcional(booleano()),
});
const esquemaCambio = objeto({
  nombre: opcional(texto({ max: 120 })),
  telefono: opcional(nulable(texto({ max: 30 }))),
  correo: opcional(nulable(correo())),
  sucursales: opcional(listaDe(uuid(), { max: 100, unicos: true })),
  usuario_id: opcional(nulable(uuid())),
  activo: opcional(booleano()),
});

function telefonoNormalizado(t: string | null | undefined): string | null | undefined {
  if (t === undefined || t === null) return t;
  const n = normalizarTelefono(t);
  if (!n) throw validacion([{ campo: "telefono", mensaje: "No es un teléfono válido" }]);
  return n;
}

async function validarSucursales(tx: Consultas, ids: string[]): Promise<void> {
  if (ids.length > 0 && (await tx.sucursal.count({ where: { id: { in: ids } } })) !== ids.length) throw validacion([{ campo: "sucursales", mensaje: "Alguna sucursal no existe" }]);
}

async function validarUsuario(tx: Consultas, usuarioId: string): Promise<void> {
  const u = await tx.usuario.findFirst({ where: { id: usuarioId }, select: { rol: true } });
  if (!u) throw validacion([{ campo: "usuario_id", mensaje: "El usuario no existe" }]);
  if (u.rol !== "maestro") throw validacion([{ campo: "usuario_id", mensaje: "Solo se liga a un usuario con rol de maestro" }]);
}

async function fijarSucursales(tx: Consultas, instructorId: string, ids: string[], ahora: Date): Promise<void> {
  const vivas = await tx.instructor_sucursal.findMany({ where: { instructor_id: instructorId }, select: { id: true, sucursal_id: true } });
  const quedan = new Set(ids);
  const sobran = vivas.filter((v) => !quedan.has(v.sucursal_id)).map((v) => v.id);
  if (sobran.length > 0) await tx.instructor_sucursal.updateMany({ where: { id: { in: sobran } }, data: { eliminado_en: ahora } });
  const yaEstan = new Set(vivas.map((v) => v.sucursal_id));
  for (const sucursalId of ids) if (!yaEstan.has(sucursalId)) await tx.instructor_sucursal.create({ data: altaConAlcance({ instructor_id: instructorId, sucursal_id: sucursalId }) });
}

const usuarioOcupado = () => conflicto("Ese usuario ya tiene un instructor", [{ campo: "usuario_id", mensaje: "Ya está ligado a otro instructor" }]);

export function rutasDeInstructores(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** El `where` que limita lo que ve cada rol. */
  async function dondeVisible(ctx: ReturnType<typeof contextoDe>): Promise<Record<string, unknown>[]> {
    if (ctx.usuario.rol === "maestro") return [{ usuario_id: ctx.usuario.id }];
    const alcance = await ctx.alcanceCatalogo();
    if (alcance.todas) return [];
    return [{ OR: [{ sucursales: { none: { eliminado_en: null } } }, { sucursales: { some: { sucursal_id: { in: alcance.sucursalIds }, eliminado_en: null } } }] }];
  }

  r.get("/instructores", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const condiciones = await dondeVisible(ctx);
    if (q.sucursal_id) condiciones.push({ sucursales: { some: { sucursal_id: q.sucursal_id, eliminado_en: null } } });
    if (q.activo !== undefined) condiciones.push({ activo: q.activo });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};
    res.json(
      await paginar(
        pag,
        () => ctx.db.instructor.count({ where }),
        async (saltar, tomar) => (await ctx.db.instructor.findMany({ where, select: SELECCION, orderBy: [{ nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map(presentar),
      ),
    );
  });

  r.get("/instructores/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const i = await ctx.db.instructor.findFirst({ where: { AND: [{ id }, ...(await dondeVisible(ctx))] }, select: SELECCION });
    if (!i) throw noEncontrado();
    res.json(presentar(i));
  });

  r.post("/instructores", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAlta, req.body);
    const telefono = telefonoNormalizado(e.telefono);
    try {
      const creado = await ctx.db.$transaction(async (tx) => {
        await validarSucursales(tx, e.sucursales ?? []);
        if (e.usuario_id) {
          await validarUsuario(tx, e.usuario_id);
          if (await tx.instructor.findFirst({ where: { usuario_id: e.usuario_id }, select: { id: true } })) throw usuarioOcupado();
        }
        const i = await tx.instructor.create({
          data: altaConAlcance({ nombre: e.nombre, telefono: telefono ?? null, correo: e.correo ?? null, usuario_id: e.usuario_id ?? null, activo: e.activo ?? true }),
          select: { id: true },
        });
        await fijarSucursales(tx, i.id, e.sucursales ?? [], ctx.ahora());
        const fila = await tx.instructor.findFirstOrThrow({ where: { id: i.id }, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "instructor", entidadId: i.id, accion: "crear", despues: instantanea(fila) });
        return fila;
      });
      res.status(201).json(presentar(creado));
    } catch (err) {
      if (esViolacionUnica(err)) throw usuarioOcupado();
      throw err;
    }
  });

  r.patch("/instructores/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const cambios = parsear(esquemaCambio, req.body);
    if (Object.keys(cambios).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const telefono = telefonoNormalizado(cambios.telefono);
    try {
      const salida = await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
        const antes = await tx.instructor.findFirst({ where: { id }, select: SELECCION });
        if (!antes) throw noEncontrado();
        if (cambios.sucursales) await validarSucursales(tx, cambios.sucursales);
        if (cambios.usuario_id) {
          await validarUsuario(tx, cambios.usuario_id);
          if (await tx.instructor.findFirst({ where: { usuario_id: cambios.usuario_id, id: { not: id } }, select: { id: true } })) throw usuarioOcupado();
        }
        // No se deja a un instructor sin sucursal para grupos que ya da, ni inactivo con grupos activos.
        const sucursalesFinales = cambios.sucursales ?? antes.sucursales.map((s) => s.sucursal_id);
        if (cambios.sucursales !== undefined || cambios.activo === false) {
          const grupos = await tx.grupo.findMany({
            where: { instructor_id: id, ...(cambios.activo === false ? {} : { activo: true }) },
            select: { nombre: true, activo: true, programa: { select: { sucursal_id: true } } },
          });
          if (cambios.activo === false && grupos.some((g) => g.activo)) throw conflicto("El instructor tiene grupos activos: cámbiales el instructor antes de desactivarlo");
          if (cambios.sucursales !== undefined && sucursalesFinales.length > 0) {
            const fuera = grupos.filter((g) => g.activo && !sucursalesFinales.includes(g.programa.sucursal_id));
            if (fuera.length > 0) throw conflicto("El instructor da grupos en una sucursal que se le quitaría", [{ campo: "sucursales", mensaje: `Da el grupo «${fuera[0]!.nombre}» en una sucursal que no está en la lista` }]);
          }
        }
        const datos = {
          ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
          ...(cambios.telefono !== undefined ? { telefono: telefono ?? null } : {}),
          ...(cambios.correo !== undefined ? { correo: cambios.correo } : {}),
          ...(cambios.usuario_id !== undefined ? { usuario_id: cambios.usuario_id } : {}),
          ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
        };
        if (Object.keys(datos).length > 0) await tx.instructor.update({ where: { id }, data: datos });
        if (cambios.sucursales) await fijarSucursales(tx, id, cambios.sucursales, ctx.ahora());
        const despues = await tx.instructor.findFirstOrThrow({ where: { id }, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "instructor", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
        return despues;
      });
      res.json(presentar(salida));
    } catch (err) {
      if (esViolacionUnica(err)) throw usuarioOcupado();
      throw err;
    }
  });

  r.delete("/instructores/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
      const antes = await tx.instructor.findFirst({ where: { id }, select: SELECCION });
      if (!antes) throw noEncontrado();
      const grupos = await tx.grupo.count({ where: { instructor_id: id } });
      if (grupos > 0) throw conflicto(`El instructor tiene ${grupos} grupo(s): cámbiales el instructor antes de darlo de baja`);
      const ahora = ctx.ahora();
      await tx.instructor_sucursal.updateMany({ where: { instructor_id: id }, data: { eliminado_en: ahora } });
      await tx.instructor.update({ where: { id }, data: { eliminado_en: ahora } });
      await registrarCambio(tx, ctx, { entidad: "instructor", entidadId: id, accion: "eliminar", antes: instantanea(antes) });
    });
    res.status(204).end();
  });

  return r;
}
