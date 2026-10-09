// Reporte de clases muestra (I1): agendadas, asistidas, no asistidas, conversión (asistidas → inscritas) por FUENTE, VERTICAL y SUCURSAL, con rango de fechas.
//
//   GET /api/reportes/clases-muestra?desde=&hasta=&vertical_id=&sucursal_id=&formato=      (reportes:clases_muestra: administrador y asesor)
//
// Las definiciones (qué cuenta como agendada, asistida, inscrita…) viven en el encabezado de `src/reportes/clases-muestra.ts`. El asesor solo ve lo de SUS sucursales.
// También por comando: `npm run reporte:clases-muestra`.

import { Router } from "express";
import { aCsv } from "../../exportacion/csv.ts";
import { enviarCsv } from "../../exportacion/http.ts";
import { reporteDeClasesMuestra } from "../../reportes/clases-muestra.ts";
import { COLUMNAS_DE_CLASES, filasDeClasesMuestra } from "../../reportes/csv-reportes.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { validacion } from "../errores.ts";
import { enumerado, fechaISO, objeto, opcional, parsearQuery, uuid } from "../validar.ts";

const esquemaClases = objeto({ desde: opcional(fechaISO()), hasta: opcional(fechaISO()), vertical_id: opcional(uuid()), sucursal_id: opcional(uuid()), formato: opcional(enumerado(["json", "csv"] as const)) });

export function rutasDeReporteDeClasesMuestra(_deps: DepsApi): Router {
  const r = Router();
  r.get("/reportes/clases-muestra", requierePermiso("reportes:clases_muestra"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaClases, req.query);
    if (q.desde && q.hasta && q.desde > q.hasta) throw validacion([{ campo: "desde", mensaje: "No puede ser posterior a «hasta»" }]);
    const filtro = filtroDeSucursal(await ctx.alcance());
    const reporte = await reporteDeClasesMuestra(ctx.db, { ...(q.desde ? { desde: q.desde } : {}), ...(q.hasta ? { hasta: q.hasta } : {}), ...(q.vertical_id ? { verticalId: q.vertical_id } : {}), ...(q.sucursal_id ? { sucursalId: q.sucursal_id } : {}), sucursalesVisibles: filtro ? filtro.in : null });
    // I5: `?formato=csv` lo descarga como CSV (mismos permisos y alcance).
    if (q.formato === "csv") return enviarCsv(res, `clases-muestra-${q.desde ?? "inicio"}-${q.hasta ?? "hoy"}`, aCsv(COLUMNAS_DE_CLASES, filasDeClasesMuestra(reporte)));
    res.json(reporte);
  });
  return r;
}
