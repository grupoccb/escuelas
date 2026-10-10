// Salones de una sucursal (C1).
//
//   GET    /api/salones?sucursal_id=&activo=&limite=&pagina=   (catalogo:leer; filtrado por sucursal según el rol)
//   GET    /api/salones/:id                                      (catalogo:leer)
//   POST   /api/salones   { sucursal_id, nombre, capacidad?, activo? }   (catalogo:escribir)
//   PATCH  /api/salones/:id   { nombre?, capacidad? (null la quita), activo? }
//   DELETE /api/salones/:id   baja lógica (409 si algún grupo vivo lo usa)
//
// El nombre es único entre los salones vivos de la sucursal. La sucursal de un salón no cambia (sus
// grupos están atados a ella: el disparador `grupo_salon_misma_sucursal`). Los choques de horario no se
// resuelven aquí sino al asignar el salón a un grupo (`PATCH /api/grupos/:id`).

import { Router } from "express";
import express from "express";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { altaConAlcance, type Consultas } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { CANDADO_OCUPACION } from "../../catalogo/choques.ts";
import { claveDeSalon, nombreDeSalon } from "../../catalogo/salones.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { cantidad, segun } from "../../lib/cantidad.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, entero, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SELECCION = { id: true, sucursal_id: true, nombre: true, capacidad: true, activo: true, creado_en: true } as const;
type FilaSalon = { id: string; sucursal_id: string; nombre: string; capacidad: number | null; activo: boolean; creado_en: Date };

const instantanea = (s: FilaSalon): Instantanea => ({ sucursal_id: s.sucursal_id, nombre: s.nombre, capacidad: s.capacidad, activo: s.activo });

const esquemaListado = objeto({ ...esquemaPaginacion, sucursal_id: opcional(uuid()), activo: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });
const esquemaAlta = objeto({ sucursal_id: uuid(), nombre: texto({ max: 80 }), capacidad: opcional(nulable(entero({ min: 1, max: 1000 }))), activo: opcional(booleano()) });
const esquemaCambio = objeto({ nombre: opcional(texto({ max: 80 })), capacidad: opcional(nulable(entero({ min: 1, max: 1000 }))), activo: opcional(booleano()) });

const repetido = () => conflicto("Ya existe un salón con ese nombre en la sucursal", [{ campo: "nombre", mensaje: "Ya está en uso en esa sucursal (se ignoran mayúsculas, acentos y espacios de más)" }]);

/** EC-05: ¿hay en la sucursal otro salón que es «el mismo» salvo por la forma del nombre? */
async function hayRepetido(tx: Consultas, sucursalId: string, nombre: string, exceptoId?: string): Promise<boolean> {
  const clave = claveDeSalon(nombre);
  const vivos = await tx.salon.findMany({ where: { sucursal_id: sucursalId, ...(exceptoId ? { id: { not: exceptoId } } : {}) }, select: { nombre: true } });
  return vivos.some((v) => claveDeSalon(v.nombre) === clave);
}

export function rutasDeSalones(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/salones", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const filtro = filtroDeSucursal(await ctx.alcanceCatalogo());
    const condiciones: Record<string, unknown>[] = [];
    if (filtro) condiciones.push({ sucursal_id: filtro });
    if (q.sucursal_id) condiciones.push({ sucursal_id: q.sucursal_id });
    if (q.activo !== undefined) condiciones.push({ activo: q.activo });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};
    res.json(
      await paginar(
        pag,
        () => ctx.db.salon.count({ where }),
        (saltar, tomar) => ctx.db.salon.findMany({ where, select: SELECCION, orderBy: [{ nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar }),
      ),
    );
  });

  r.get("/salones/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const filtro = filtroDeSucursal(await ctx.alcanceCatalogo());
    const s = await ctx.db.salon.findFirst({ where: { id, ...(filtro ? { sucursal_id: filtro } : {}) }, select: SELECCION });
    if (!s) throw noEncontrado();
    res.json(s);
  });

  r.post("/salones", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAlta, req.body);
    const nombre = nombreDeSalon(e.nombre);
    try {
      const creado = await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
        if (!(await tx.sucursal.findFirst({ where: { id: e.sucursal_id }, select: { id: true } }))) throw validacion([{ campo: "sucursal_id", mensaje: "La sucursal no existe" }]);
        if (await hayRepetido(tx, e.sucursal_id, nombre)) throw repetido();
        const s = await tx.salon.create({
          data: altaConAlcance({ sucursal_id: e.sucursal_id, nombre, capacidad: e.capacidad ?? null, activo: e.activo ?? true }),
          select: SELECCION,
        });
        await registrarCambio(tx, ctx, { entidad: "salon", entidadId: s.id, accion: "crear", despues: instantanea(s) });
        return s;
      });
      res.status(201).json(creado);
    } catch (err) {
      if (esViolacionUnica(err)) throw repetido();
      throw err;
    }
  });

  r.patch("/salones/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const cambios = parsear(esquemaCambio, req.body);
    if (Object.keys(cambios).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const nombre = cambios.nombre !== undefined ? nombreDeSalon(cambios.nombre) : undefined;
    try {
      const salida = await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
        const antes = await tx.salon.findFirst({ where: { id }, select: SELECCION });
        if (!antes) throw noEncontrado();
        if (nombre !== undefined && nombre !== antes.nombre && (await hayRepetido(tx, antes.sucursal_id, nombre, id))) throw repetido();
        const despues = await tx.salon.update({
          where: { id },
          data: {
            ...(nombre !== undefined ? { nombre } : {}),
            ...(cambios.capacidad !== undefined ? { capacidad: cambios.capacidad } : {}),
            ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
          },
          select: SELECCION,
        });
        await registrarCambio(tx, ctx, { entidad: "salon", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
        return despues;
      });
      res.json(salida);
    } catch (err) {
      if (esViolacionUnica(err)) throw repetido();
      throw err;
    }
  });

  r.delete("/salones/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
      const antes = await tx.salon.findFirst({ where: { id }, select: SELECCION });
      if (!antes) throw noEncontrado();
      const grupos = await tx.grupo.count({ where: { salon_id: id } });
      if (grupos > 0) throw conflicto(`El salón ${segun(grupos, "lo usa", "lo usan")} ${cantidad(grupos, "grupo", "grupos")}: ${segun(grupos, "cámbiale", "cámbiales")} el salón antes de darlo de baja`);
      await tx.salon.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "salon", entidadId: id, accion: "eliminar", antes: instantanea(antes) });
    });
    res.status(204).end();
  });

  return r;
}
