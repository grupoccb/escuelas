// Reporte ejecutivo (I3): activos por vertical y sucursal, altas y bajas del mes, deserción, ingreso mensual recurrente, cartera vencida y % de ocupación por grupo.
//
//   GET /api/reportes/ejecutivo?mes=AAAA-MM&sucursal_id=&vertical_id=&seccion=&formato=      (reportes:ejecutivo: administrador y asesor; el asesor solo ve lo de SUS sucursales; recepción y maestro 403: trae dinero)
//   GET /api/reportes/ocupacion                  (reportes:ocupacion: administrador, asesor, recepción y maestro; SIN importes; cada quien ve sus grupos: el maestro, los que imparte)
//
// Las definiciones de cada número viven en el encabezado de `src/reportes/ejecutivo.ts`; la ocupación sale de la FUENTE REAL (`FuenteOcupacion`: las inscripciones activas del grupo).

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { aCsv } from "../../exportacion/csv.ts";
import { enviarCsv } from "../../exportacion/http.ts";
import { dondeGrupoVisible } from "../../asistencia/alcance.ts";
import { esPeriodo } from "../../lib/periodo.ts";
import { COLUMNAS_DE_ACTIVOS, COLUMNAS_DE_INDICADORES, COLUMNAS_DE_OCUPACION, indicadoresDelEjecutivo } from "../../reportes/csv-reportes.ts";
import { ocupacionPorGrupo, reporteEjecutivo } from "../../reportes/ejecutivo.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { validacion } from "../errores.ts";
import { enumerado, objeto, opcional, parsearQuery, texto, uuid } from "../validar.ts";

const esquemaEjecutivo = objeto({ mes: opcional(texto({ patron: /^\d{4}-(0[1-9]|1[0-2])$/, mensajePatron: "Debe ser AAAA-MM" })), sucursal_id: opcional(uuid()), vertical_id: opcional(uuid()), seccion: opcional(enumerado(["resumen", "activos", "ocupacion"] as const)), formato: opcional(enumerado(["json", "csv"] as const)) });
const esquemaOcupacion = objeto({});

export function rutasDeReporteEjecutivo(deps: DepsApi): Router {
  const r = crearRouter();
  r.get("/reportes/ejecutivo", requierePermiso("reportes:ejecutivo"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaEjecutivo, req.query);
    if (q.mes && !esPeriodo(q.mes)) throw validacion([{ campo: "mes", mensaje: "Debe ser AAAA-MM" }]);
    const filtro = filtroDeSucursal(await ctx.alcance());
    const reporte = await reporteEjecutivo(ctx.db, { ...(q.mes ? { mes: q.mes } : {}), ahora: ctx.ahora(), fuente: deps.fuenteOcupacion, sucursalesVisibles: filtro ? filtro.in : null, ...(q.sucursal_id ? { sucursalId: q.sucursal_id } : {}), ...(q.vertical_id ? { verticalId: q.vertical_id } : {}) });
    // I5: `?formato=csv` descarga una sección: `resumen` (los indicadores; por omisión), `activos` (por vertical y sucursal) u `ocupacion` (por grupo). Mismos permisos y alcance.
    if (q.formato === "csv") {
      if (q.seccion === "ocupacion") return enviarCsv(res, `ocupacion-por-grupo-${reporte.mes}`, aCsv(COLUMNAS_DE_OCUPACION, reporte.ocupacion_por_grupo));
      if (q.seccion === "activos") return enviarCsv(res, `alumnos-activos-${reporte.mes}`, aCsv(COLUMNAS_DE_ACTIVOS, reporte.activos.por_vertical_y_sucursal));
      return enviarCsv(res, `ejecutivo-${reporte.mes}`, aCsv(COLUMNAS_DE_INDICADORES, indicadoresDelEjecutivo(reporte)));
    }
    res.json(reporte);
  });
  r.get("/reportes/ocupacion", requierePermiso("reportes:ocupacion"), async (req, res) => {
    const ctx = contextoDe(res);
    parsearQuery(esquemaOcupacion, req.query);
    res.json({ datos: await ocupacionPorGrupo(ctx.db, deps.fuenteOcupacion, await dondeGrupoVisible(ctx)) });
  });
  return r;
}
