// Peldaños de la progresión de una vertical (G3). Son FILAS de catálogo, no términos del código (invariante 2): cómo se llama el avance en esa vertical vive en
// `vertical.etiqueta_progresion`.
//
//   GET    /api/niveles?vertical_id=                  (catalogo:leer)   del primer peldaño al último
//   POST   /api/niveles { vertical_id, nombre, orden, color_hex?, horas_minimas?, clases_minimas?, requisitos_texto? }   (catalogo:escribir)
//   PATCH  /api/niveles/:id { nombre?, orden?, color_hex?, horas_minimas?, clases_minimas?, requisitos_texto? }          (catalogo:escribir)
//   DELETE /api/niveles/:id                           (catalogo:escribir)  baja lógica; 409 si algún alumno lo tiene
//
// `orden` y `nombre` no se repiten entre los peldaños vivos de una vertical (índice único parcial): 409. `clases_minimas` son las asistencias `presente` que
// hacen falta desde el peldaño anterior para ser elegible a ESTE peldaño (G4).

import { Router } from "express";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { registrarCambio } from "../registro.ts";
import { entero, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const COLOR = /^#[0-9A-Fa-f]{6}$/;
const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({ vertical_id: opcional(uuid()) });
const campos = {
  nombre: texto({ max: 80 }),
  orden: entero({ min: 0, max: 1000 }),
  color_hex: opcional(nulable(texto({ patron: COLOR, mensajePatron: "Debe ser un color #RRGGBB" }))),
  horas_minimas: opcional(entero({ min: 0, max: 100_000 })),
  clases_minimas: opcional(entero({ min: 0, max: 100_000 })),
  requisitos_texto: opcional(nulable(texto({ max: 1000 }))),
};
const esquemaNuevo = objeto({ vertical_id: uuid(), ...campos });
const esquemaCambio = objeto({ nombre: opcional(campos.nombre), orden: opcional(campos.orden), color_hex: campos.color_hex, horas_minimas: campos.horas_minimas, clases_minimas: campos.clases_minimas, requisitos_texto: campos.requisitos_texto });

const SELECCION = { id: true, vertical_id: true, nombre: true, orden: true, color_hex: true, horas_minimas: true, clases_minimas: true, requisitos_texto: true } as const;
const instantanea = (n: { vertical_id: string; nombre: string; orden: number; color_hex: string | null; horas_minimas: number; clases_minimas: number; requisitos_texto: string | null }) => ({
  vertical_id: n.vertical_id,
  nombre: n.nombre,
  orden: n.orden,
  color_hex: n.color_hex,
  horas_minimas: n.horas_minimas,
  clases_minimas: n.clases_minimas,
  requisitos_texto: n.requisitos_texto,
});

export function rutasDeNiveles(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/niveles", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    res.json({ datos: await ctx.db.nivel_progresion.findMany({ where: q.vertical_id ? { vertical_id: q.vertical_id } : {}, orderBy: [{ vertical_id: "asc" }, { orden: "asc" }, { id: "asc" }], select: SELECCION }) });
  });

  r.post("/niveles", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaNuevo, req.body);
    if (!(await ctx.db.vertical.findFirst({ where: { id: e.vertical_id }, select: { id: true } }))) throw validacion([{ campo: "vertical_id", mensaje: "No se encontró la vertical" }]);
    try {
      const creado = await ctx.db.$transaction(async (tx) => {
        const n = await tx.nivel_progresion.create({
          data: altaConAlcance({ vertical_id: e.vertical_id, nombre: e.nombre, orden: e.orden, color_hex: e.color_hex ?? null, horas_minimas: e.horas_minimas ?? 0, clases_minimas: e.clases_minimas ?? 0, requisitos_texto: e.requisitos_texto ?? null }),
          select: SELECCION,
        });
        await registrarCambio(tx, ctx, { entidad: "nivel_progresion", entidadId: n.id, accion: "crear", despues: instantanea(n) });
        return n;
      });
      res.status(201).json(creado);
    } catch (err) {
      if (esViolacionUnica(err)) throw conflicto("Ya hay un nivel con ese orden o ese nombre en la vertical", [{ campo: "orden", mensaje: "El orden y el nombre no se repiten en una vertical" }]);
      throw err;
    }
  });

  r.patch("/niveles/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambio, req.body);
    if (Object.keys(e).length === 0) throw validacion([{ mensaje: "No hay ningún cambio" }]);
    const actual = await ctx.db.nivel_progresion.findFirst({ where: { id }, select: SELECCION });
    if (!actual) throw noEncontrado();
    try {
      res.json(
        await ctx.db.$transaction(async (tx) => {
          const n = await tx.nivel_progresion.update({ where: { id }, data: e, select: SELECCION });
          await registrarCambio(tx, ctx, { entidad: "nivel_progresion", entidadId: id, accion: "actualizar", antes: instantanea(actual), despues: instantanea(n) });
          return n;
        }),
      );
    } catch (err) {
      if (esViolacionUnica(err)) throw conflicto("Ya hay un nivel con ese orden o ese nombre en la vertical", [{ campo: "orden", mensaje: "El orden y el nombre no se repiten en una vertical" }]);
      throw err;
    }
  });

  r.delete("/niveles/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const actual = await ctx.db.nivel_progresion.findFirst({ where: { id }, select: SELECCION });
    if (!actual) throw noEncontrado();
    if (await ctx.db.alumno_progresion.findFirst({ where: { nivel_id: id }, select: { id: true } })) throw conflicto("Hay alumnos que ya obtuvieron este nivel", [{ campo: "motivo", mensaje: "nivel_en_uso" }]);
    await ctx.db.$transaction(async (tx) => {
      await tx.nivel_progresion.update({ where: { id }, data: { eliminado_en: new Date() } });
      await registrarCambio(tx, ctx, { entidad: "nivel_progresion", entidadId: id, accion: "eliminar", antes: instantanea(actual) });
    });
    res.status(204).end();
  });

  return r;
}
