// Costo por alumno inscrito por campaña (I2) y el gasto que el administrador captura a mano.
//
//   GET    /api/reportes/costo-por-alumno?desde=&hasta=&campana_id=&formato=       (reportes:costos: administrador)
//   GET    /api/campanas/:id/gastos?desde=&hasta=                          (gastos_campana:leer: administrador)
//   POST   /api/campanas/:id/gastos { fecha, monto, nota? }                (gastos_campana:escribir: administrador)
//   DELETE /api/campanas/:id/gastos/:gasto_id                              baja lógica (gastos_campana:escribir)
//
// Las definiciones (qué cuenta como lead, clase muestra e inscripción activa de una campaña, cómo se redondea cada cociente y por qué «—») viven en `src/reportes/costo-campana.ts`.
// Dinero siempre como texto con dos decimales. Sin divisor no hay división por cero: el valor es null y su `_texto` es «—».

import express, { Router } from "express";
import { aFecha, deFecha } from "../../catalogo/precios.ts";
import { altaConAlcance } from "../../datos/alcance.ts";
import { aTexto, deDecimal, sumar } from "../../lib/dinero.ts";
import { aCsv } from "../../exportacion/csv.ts";
import { enviarCsv } from "../../exportacion/http.ts";
import { reporteDeCostoPorCampana } from "../../reportes/costo-campana.ts";
import { COLUMNAS_DE_COSTO, filasDeCosto } from "../../reportes/csv-reportes.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { noEncontrado, validacion } from "../errores.ts";
import { registrarCambio } from "../registro.ts";
import { dinero, enumerado, fechaISO, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const esquemaCosto = objeto({ desde: opcional(fechaISO()), hasta: opcional(fechaISO()), campana_id: opcional(uuid()), formato: opcional(enumerado(["json", "csv"] as const)) });
const esquemaGastosLista = objeto({ desde: opcional(fechaISO()), hasta: opcional(fechaISO()) });
const esquemaGasto = objeto({ fecha: fechaISO(), monto: dinero(), nota: opcional(texto({ max: 300 })) });
const esquemaIdCampana = objeto({ id: uuid() });
const esquemaIdGasto = objeto({ id: uuid(), gasto_id: uuid() });
const SELECCION_GASTO = { id: true, campana_id: true, fecha: true, monto: true, nota: true, creado_en: true } as const;
const presentarGasto = (g: { id: string; campana_id: string; fecha: Date; monto: { toFixed(n: number): string }; nota: string | null; creado_en: Date }) => ({ id: g.id, campana_id: g.campana_id, fecha: deFecha(g.fecha), monto: aTexto(deDecimal(g.monto)), nota: g.nota, creado_en: g.creado_en });

function validarRango(q: { desde?: string | undefined; hasta?: string | undefined }): void {
  if (q.desde && q.hasta && q.desde > q.hasta) throw validacion([{ campo: "desde", mensaje: "No puede ser posterior a «hasta»" }]);
}

export function rutasDeCostoPorCampana(_deps: DepsApi): express.Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/reportes/costo-por-alumno", requierePermiso("reportes:costos"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaCosto, req.query);
    validarRango(q);
    const reporte = await reporteDeCostoPorCampana(ctx.db, { ...(q.desde ? { desde: q.desde } : {}), ...(q.hasta ? { hasta: q.hasta } : {}), ...(q.campana_id ? { campanaId: q.campana_id } : {}) });
    // I5: `?formato=csv` lo descarga como CSV.
    if (q.formato === "csv") return enviarCsv(res, `costo-por-alumno-${q.desde ?? "inicio"}-${q.hasta ?? "hoy"}`, aCsv(COLUMNAS_DE_COSTO, filasDeCosto(reporte)));
    res.json(reporte);
  });

  r.get("/campanas/:id/gastos", requierePermiso("gastos_campana:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaIdCampana, req.params);
    const q = parsearQuery(esquemaGastosLista, req.query);
    validarRango(q);
    if (!(await ctx.db.campana.findFirst({ where: { id }, select: { id: true } }))) throw noEncontrado("No se encontró la campaña");
    const gastos = await ctx.db.gasto_campana.findMany({ where: { campana_id: id, ...(q.desde || q.hasta ? { fecha: { ...(q.desde ? { gte: aFecha(q.desde) } : {}), ...(q.hasta ? { lte: aFecha(q.hasta) } : {}) } } : {}) }, orderBy: [{ fecha: "desc" }, { creado_en: "desc" }, { id: "asc" }], select: SELECCION_GASTO });
    res.json({ datos: gastos.map(presentarGasto), total: aTexto(sumar(...gastos.map((g) => deDecimal(g.monto)))) });
  });

  r.post("/campanas/:id/gastos", requierePermiso("gastos_campana:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaIdCampana, req.params);
    const e = parsear(esquemaGasto, req.body);
    if (e.monto <= 0n) throw validacion([{ campo: "monto", mensaje: "Debe ser mayor que cero" }]);
    if (e.fecha > deFecha(ctx.ahora())) throw validacion([{ campo: "fecha", mensaje: "No puede ser futura" }]);
    if (!(await ctx.db.campana.findFirst({ where: { id }, select: { id: true } }))) throw noEncontrado("No se encontró la campaña");
    const g = await ctx.db.$transaction(async (tx) => {
      const x = await tx.gasto_campana.create({ data: altaConAlcance({ campana_id: id, fecha: aFecha(e.fecha), monto: aTexto(e.monto), nota: e.nota ?? null, creado_por_usuario_id: ctx.usuario.id }), select: SELECCION_GASTO });
      await registrarCambio(tx, ctx, { entidad: "gasto_campana", entidadId: x.id, accion: "crear", despues: { campana_id: id, fecha: e.fecha, monto: aTexto(e.monto) } });
      return x;
    });
    res.status(201).json(presentarGasto(g));
  });

  r.delete("/campanas/:id/gastos/:gasto_id", requierePermiso("gastos_campana:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id, gasto_id } = parsear(esquemaIdGasto, req.params);
    const g = await ctx.db.gasto_campana.findFirst({ where: { id: gasto_id, campana_id: id }, select: SELECCION_GASTO });
    if (!g) throw noEncontrado();
    await ctx.db.$transaction(async (tx) => {
      await tx.gasto_campana.updateMany({ where: { id: gasto_id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "gasto_campana", entidadId: gasto_id, accion: "eliminar", antes: { campana_id: id, fecha: deFecha(g.fecha), monto: aTexto(deDecimal(g.monto)) } });
    });
    res.status(204).end();
  });

  return r;
}
