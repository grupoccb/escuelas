// Sucursales (J7) y qué vertical se imparte en cuál, administrados por pantalla (K1: dar de alta una sucursal nueva sin tocar código).
//
//   GET    /api/sucursales?activo=                              (catalogo:leer; cada rol ve las suyas) — con las verticales que ofrece cada una
//   GET    /api/sucursales/:id                                   (catalogo:leer)
//   POST   /api/sucursales   { nombre, direccion?, zona_horaria, activo? }   (catalogo:escribir)
//   PATCH  /api/sucursales/:id   { nombre?, direccion? (null la quita), zona_horaria?, activo? }
//   DELETE /api/sucursales/:id   baja lógica; 409 si algo la usa (programas, salones, canales, usuarios, leads, alumnos…): desactívala en su lugar
//   PUT    /api/sucursales/:id/verticales/:vertical_id   { activo? }   ofrece (o deja de ofrecer, con activo=false) esa vertical en la sucursal; idempotente
//   DELETE /api/sucursales/:id/verticales/:vertical_id   quita la relación; 409 si hay programas vivos de esa vertical en la sucursal
//
// La zona horaria decide el horario de envío (invariante 14: 09:00–20:00 LOCAL): debe ser un nombre IANA que el servidor conozca.

import { Router } from "express";
import express from "express";
import { zonaCanonica } from "../../catalogo/organizacion.ts";
import { CANDADO_OCUPACION } from "../../catalogo/choques.ts";
import { altaConAlcance } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { cantidad, segun } from "../../lib/cantidad.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  nombre: true,
  direccion: true,
  zona_horaria: true,
  activo: true,
  creado_en: true,
  sucursal_verticales: { where: { eliminado_en: null }, select: { vertical_id: true, activo: true, vertical: { select: { nombre: true } } }, orderBy: { vertical: { nombre: "asc" } } },
} as const;
type Fila = { id: string; nombre: string; direccion: string | null; zona_horaria: string; activo: boolean; creado_en: Date; sucursal_verticales: { vertical_id: string; activo: boolean; vertical: { nombre: string } }[] };

const presentar = (s: Fila) => ({
  id: s.id,
  nombre: s.nombre,
  direccion: s.direccion,
  zona_horaria: s.zona_horaria,
  activo: s.activo,
  creado_en: s.creado_en,
  verticales: s.sucursal_verticales.map((v) => ({ vertical_id: v.vertical_id, nombre: v.vertical.nombre, activo: v.activo })),
});
const instantanea = (s: Pick<Fila, "nombre" | "direccion" | "zona_horaria" | "activo">): Instantanea => ({ nombre: s.nombre, direccion: s.direccion, zona_horaria: s.zona_horaria, activo: s.activo });

const zona = () => texto({ max: 64 });
const esquemaAlta = objeto({ nombre: texto({ max: 120 }), direccion: opcional(nulable(texto({ max: 300 }))), zona_horaria: zona(), activo: opcional(booleano()) });
const esquemaCambio = objeto({ nombre: opcional(texto({ max: 120 })), direccion: opcional(nulable(texto({ max: 300 }))), zona_horaria: opcional(zona()), activo: opcional(booleano()) });
const esquemaListado = objeto({ activo: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });
const esquemaRelacion = objeto({ id: uuid(), vertical_id: uuid() });
const esquemaOfrece = objeto({ activo: opcional(booleano()) });

const repetido = () => conflicto("Ya existe una sucursal con ese nombre", [{ campo: "nombre", mensaje: "Ya está en uso" }]);
/** La zona con la escritura oficial (`america/mexico_city` se guarda como `America/Mexico_City`); 400 si no existe. */
function exigirZona<T extends string | undefined>(z: T): T {
  if (z === undefined) return z;
  const canonica = zonaCanonica(z);
  if (canonica === null) throw validacion([{ campo: "zona_horaria", mensaje: "No es una zona horaria conocida (por ejemplo, America/Mexico_City)" }]);
  return canonica as T;
}

export function rutasDeSucursales(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/sucursales", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const filtro = filtroDeSucursal(await ctx.alcanceCatalogo());
    const filas = await ctx.db.sucursal.findMany({ where: { ...(filtro ? { id: filtro } : {}), ...(q.activo === undefined ? {} : { activo: q.activo }) }, select: SELECCION, orderBy: [{ nombre: "asc" }, { id: "asc" }] });
    res.json({ datos: (filas as unknown as Fila[]).map(presentar) });
  });

  r.get("/sucursales/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const filtro = filtroDeSucursal(await ctx.alcanceCatalogo());
    const s = await ctx.db.sucursal.findFirst({ where: filtro ? { AND: [{ id }, { id: filtro }] } : { id }, select: SELECCION });
    if (!s) throw noEncontrado();
    res.json(presentar(s as unknown as Fila));
  });

  r.post("/sucursales", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = { ...parsear(esquemaAlta, req.body) };
    e.zona_horaria = exigirZona(e.zona_horaria);
    try {
      const creada = await ctx.db.$transaction(async (tx) => {
        const s = await tx.sucursal.create({ data: altaConAlcance({ nombre: e.nombre, direccion: e.direccion ?? null, zona_horaria: e.zona_horaria, activo: e.activo ?? true }), select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "sucursal", entidadId: s.id, accion: "crear", despues: instantanea(s) });
        return s;
      });
      res.status(201).json(presentar(creada as unknown as Fila));
    } catch (err) {
      if (esViolacionUnica(err)) throw repetido();
      throw err;
    }
  });

  r.patch("/sucursales/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = { ...parsear(esquemaCambio, req.body) };
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    if (c.zona_horaria !== undefined) c.zona_horaria = exigirZona(c.zona_horaria);
    try {
      const salida = await ctx.db.$transaction(async (tx) => {
        const antes = await tx.sucursal.findFirst({ where: { id }, select: SELECCION });
        if (!antes) throw noEncontrado();
        const despues = await tx.sucursal.update({ where: { id }, data: c, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "sucursal", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
        return despues;
      });
      res.json(presentar(salida as unknown as Fila));
    } catch (err) {
      if (esViolacionUnica(err)) throw repetido();
      throw err;
    }
  });

  r.delete("/sucursales/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    // K9 (EK-A4): bajo el candado del catálogo, el mismo de los programas: contar los usos y dar de baja es una sola cosa.
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
      const antes = await tx.sucursal.findFirst({ where: { id }, select: SELECCION });
      if (!antes) throw noEncontrado();
      const usos: [string, number][] = [
        ["programas", await tx.programa.count({ where: { sucursal_id: id } })],
        ["salones", await tx.salon.count({ where: { sucursal_id: id } })],
        ["verticales que ofrece", await tx.sucursal_vertical.count({ where: { sucursal_id: id } })],
        ["canales de WhatsApp", await tx.canal_whatsapp.count({ where: { sucursal_id: id } })],
        ["usuarios asignados", await tx.usuario_sucursal.count({ where: { sucursal_id: id } })],
        ["leads", await tx.lead.count({ where: { sucursal_interes_id: id } })],
        ["familias", await tx.tutor.count({ where: { sucursal_id: id } })],
        ["alumnos", await tx.alumno.count({ where: { sucursal_id: id } })],
        ["campañas", await tx.campana.count({ where: { sucursal_id: id } })],
        // K9 (EK-A3): lo demás que apunta a la sucursal (la llave foránea no frena una baja lógica).
        ["automatizaciones", await tx.automatizacion.count({ where: { sucursal_id: id } })],
        ["instructores", await tx.instructor_sucursal.count({ where: { sucursal_id: id } })],
        ["promociones", await tx.promocion_sucursal.count({ where: { sucursal_id: id } })],
        ["cotizaciones", await tx.cotizacion.count({ where: { sucursal_id: id } })],
        ["códigos de rastreo", await tx.codigo_rastreo.count({ where: { sucursal_id: id } })],
        ["eventos", await tx.evento.count({ where: { sucursal_id: id } })],
        ["cargos", await tx.cargo.count({ where: { sucursal_id: id } })],
        ["ventas", await tx.venta.count({ where: { sucursal_id: id } })],
      ];
      const enUso = usos.filter(([, n]) => n > 0);
      if (enUso.length > 0) throw conflicto(`La sucursal se usa en: ${enUso.map(([que, n]) => `${n} ${que}`).join(", ")}. Desactívala en lugar de darla de baja`);
      await tx.sucursal.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "sucursal", entidadId: id, accion: "eliminar", antes: instantanea(antes) });
    });
    res.status(204).end();
  });

  // ── Qué vertical se imparte en qué sucursal ──────────────────────────────────────────────────────

  r.put("/sucursales/:id/verticales/:vertical_id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id, vertical_id } = parsear(esquemaRelacion, req.params);
    const { activo } = parsear(esquemaOfrece, req.body);
    try {
      const fila = await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
        if (!(await tx.sucursal.findFirst({ where: { id }, select: { id: true } }))) throw noEncontrado("No se encontró la sucursal");
        if (!(await tx.vertical.findFirst({ where: { id: vertical_id }, select: { id: true } }))) throw noEncontrado("No se encontró la vertical");
        const previa = await tx.sucursal_vertical.findFirst({ where: { sucursal_id: id, vertical_id }, select: { id: true, activo: true } });
        const nuevoActivo = activo ?? true;
        if (previa) {
          if (previa.activo === nuevoActivo) return { id: previa.id, activo: previa.activo };
          const f = await tx.sucursal_vertical.update({ where: { id: previa.id }, data: { activo: nuevoActivo }, select: { id: true, activo: true } });
          await registrarCambio(tx, ctx, { entidad: "sucursal_vertical", entidadId: f.id, accion: "actualizar", antes: { sucursal_id: id, vertical_id, activo: previa.activo }, despues: { sucursal_id: id, vertical_id, activo: f.activo } });
          return f;
        }
        const f = await tx.sucursal_vertical.create({ data: altaConAlcance({ sucursal_id: id, vertical_id, activo: nuevoActivo }), select: { id: true, activo: true } });
        await registrarCambio(tx, ctx, { entidad: "sucursal_vertical", entidadId: f.id, accion: "crear", despues: { sucursal_id: id, vertical_id, activo: f.activo } });
        return f;
      });
      res.json({ sucursal_id: id, vertical_id, activo: fila.activo });
    } catch (err) {
      // Dos PUT simultáneos de la misma pareja: gana uno y el otro ve la fila ya creada (idempotente).
      if (esViolacionUnica(err)) {
        const f = await ctx.db.sucursal_vertical.findFirst({ where: { sucursal_id: id, vertical_id }, select: { activo: true } });
        if (f) return void res.json({ sucursal_id: id, vertical_id, activo: f.activo });
      }
      throw err;
    }
  });

  r.delete("/sucursales/:id/verticales/:vertical_id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id, vertical_id } = parsear(esquemaRelacion, req.params);
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
      const previa = await tx.sucursal_vertical.findFirst({ where: { sucursal_id: id, vertical_id }, select: { id: true, activo: true } });
      if (!previa) throw noEncontrado();
      const programas = await tx.programa.count({ where: { sucursal_id: id, vertical_id } });
      if (programas > 0) throw conflicto(`Hay ${cantidad(programas, "programa", "programas")} de esa disciplina en la sucursal: ${segun(programas, "desactívalo o dalo", "desactívalos o dalos")} de baja antes`);
      await tx.sucursal_vertical.update({ where: { id: previa.id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "sucursal_vertical", entidadId: previa.id, accion: "eliminar", antes: { sucursal_id: id, vertical_id, activo: previa.activo } });
    });
    res.status(204).end();
  });

  return r;
}
