// Catálogo editable de motivos de baja de una inscripción (F5), por organización:
//
//   GET    /api/motivos-baja?activo=                       (catalogo:leer)
//   POST   /api/motivos-baja { nombre, codigo?, orden? }    (catalogo:escribir)
//   PATCH  /api/motivos-baja/:id { nombre?, orden?, activo? }  ·  DELETE /api/motivos-baja/:id   (catalogo:escribir)  baja lógica
//
// Dar de baja un motivo no toca las inscripciones ya dadas de baja por él (conservan su referencia). Es el mismo patrón que los motivos de pérdida
// del embudo (D7). El seed trae un conjunto de ejemplo `[SUPUESTO]` que la escuela edita.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { registrarCambio } from "../registro.ts";
import { booleano, booleanoDeTexto, entero, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({ activo: opcional(booleanoDeTexto()) });
const esquemaNuevo = objeto({ nombre: texto({ max: 120 }), codigo: opcional(texto({ max: 40, patron: /^[a-z][a-z0-9_]*$/, mensajePatron: "Minúsculas, dígitos y guion bajo, empezando con letra" })), orden: opcional(entero({ min: 0, max: 1000 })) });
const esquemaCambio = objeto({ nombre: opcional(texto({ max: 120 })), orden: opcional(entero({ min: 0, max: 1000 })), activo: opcional(booleano()) });
const SELECCION = { id: true, codigo: true, nombre: true, orden: true, activo: true } as const;

const codigoDe = (nombre: string): string => {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(base) ? base : `m_${base}`.slice(0, 40);
};
const instantanea = (m: { codigo: string; nombre: string; orden: number; activo: boolean }) => ({ codigo: m.codigo, nombre: m.nombre, orden: m.orden, activo: m.activo });

export function rutasDeMotivosBaja(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/motivos-baja", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    res.json({ datos: await ctx.db.motivo_baja.findMany({ where: q.activo === undefined ? {} : { activo: q.activo }, orderBy: [{ orden: "asc" }, { nombre: "asc" }, { id: "asc" }], select: SELECCION }) });
  });

  r.post("/motivos-baja", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaNuevo, req.body);
    const codigo = e.codigo ?? codigoDe(e.nombre);
    try {
      const creado = await ctx.db.$transaction(async (tx) => {
        const m = await tx.motivo_baja.create({ data: altaConAlcance({ codigo, nombre: e.nombre, orden: e.orden ?? 0 }), select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "motivo_baja", entidadId: m.id, accion: "crear", despues: instantanea(m) });
        return m;
      });
      res.status(201).json(creado);
    } catch (err) {
      if (esViolacionUnica(err)) throw conflicto(`Ya hay un motivo de baja con el código «${codigo}»`, [{ campo: "codigo", mensaje: "Ya existe" }]);
      throw err;
    }
  });

  r.patch("/motivos-baja/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambio, req.body);
    if (Object.keys(e).length === 0) throw validacion([{ mensaje: "No hay ningún cambio" }]);
    const actual = await ctx.db.motivo_baja.findFirst({ where: { id }, select: SELECCION });
    if (!actual) throw noEncontrado();
    res.json(
      await ctx.db.$transaction(async (tx) => {
        const m = await tx.motivo_baja.update({ where: { id }, data: e, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "motivo_baja", entidadId: id, accion: "actualizar", antes: instantanea(actual), despues: instantanea(m) });
        return m;
      }),
    );
  });

  r.delete("/motivos-baja/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const actual = await ctx.db.motivo_baja.findFirst({ where: { id }, select: SELECCION });
    if (!actual) throw noEncontrado();
    await ctx.db.$transaction(async (tx) => {
      await tx.motivo_baja.update({ where: { id }, data: { eliminado_en: new Date(), activo: false } });
      await registrarCambio(tx, ctx, { entidad: "motivo_baja", entidadId: id, accion: "eliminar", antes: instantanea(actual) });
    });
    res.status(204).end();
  });

  return r;
}
