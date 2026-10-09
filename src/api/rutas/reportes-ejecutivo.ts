// Reporte ejecutivo (I3): activos por vertical y sucursal, altas y bajas del mes, deserción, ingreso mensual recurrente, cartera vencida y % de ocupación por grupo.
//
//   GET /api/reportes/ejecutivo?mes=AAAA-MM      (reportes:ejecutivo: administrador y asesor; el asesor solo ve lo de SUS sucursales; recepción y maestro 403: trae dinero)
//   GET /api/reportes/ocupacion                  (reportes:ocupacion: administrador, asesor, recepción y maestro; SIN importes; cada quien ve sus grupos: el maestro, los que imparte)
//
// Las definiciones de cada número viven en el encabezado de `src/reportes/ejecutivo.ts`; la ocupación sale de la FUENTE REAL (`FuenteOcupacion`: las inscripciones activas del grupo).

import { Router } from "express";
import { dondeGrupoVisible } from "../../asistencia/alcance.ts";
import { esPeriodo } from "../../lib/periodo.ts";
import { ocupacionPorGrupo, reporteEjecutivo } from "../../reportes/ejecutivo.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { validacion } from "../errores.ts";
import { objeto, opcional, parsearQuery, texto } from "../validar.ts";

const esquemaEjecutivo = objeto({ mes: opcional(texto({ patron: /^\d{4}-(0[1-9]|1[0-2])$/, mensajePatron: "Debe ser AAAA-MM" })) });
const esquemaOcupacion = objeto({});

export function rutasDeReporteEjecutivo(deps: DepsApi): Router {
  const r = Router();
  r.get("/reportes/ejecutivo", requierePermiso("reportes:ejecutivo"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaEjecutivo, req.query);
    if (q.mes && !esPeriodo(q.mes)) throw validacion([{ campo: "mes", mensaje: "Debe ser AAAA-MM" }]);
    const filtro = filtroDeSucursal(await ctx.alcance());
    res.json(await reporteEjecutivo(ctx.db, { ...(q.mes ? { mes: q.mes } : {}), ahora: ctx.ahora(), fuente: deps.fuenteOcupacion, sucursalesVisibles: filtro ? filtro.in : null }));
  });
  r.get("/reportes/ocupacion", requierePermiso("reportes:ocupacion"), async (req, res) => {
    const ctx = contextoDe(res);
    parsearQuery(esquemaOcupacion, req.query);
    res.json({ datos: await ocupacionPorGrupo(ctx.db, deps.fuenteOcupacion, await dondeGrupoVisible(ctx)) });
  });
  return r;
}
