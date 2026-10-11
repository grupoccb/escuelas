// Los datos de las gráficas del tablero (R3a): lo que el reporte ejecutivo, el de clases muestra y el de costo por campaña no entregan. Solo lectura.
//
//   GET /api/reportes/embudo?desde=&hasta=&sucursal_id=&vertical_id=        embudo de conversión, caída entre etapas y motivos de pérdida
//   GET /api/reportes/fuentes?desde=&hasta=&sucursal_id=&vertical_id=       leads, inscritos, conversión, gasto y costo por alumno por fuente y campaña
//   GET /api/reportes/evolucion?mes=AAAA-MM&sucursal_id=&vertical_id=       12 meses de altas, bajas, activos e ingreso recurrente, y retención por cohortes
//                                                                           (reportes:ejecutivo: administrador y asesor; el asesor solo ve lo de SUS sucursales)
//
// Las definiciones (qué cuenta como lead del rango, cómo se llega a una etapa, qué es activo a una fecha…) viven en el encabezado de `src/reportes/{embudo,fuentes,evolucion}.ts`.
// El gasto de campañas lo ve solo quien tiene el permiso de costos (`reportes:costos`: administrador); para los demás `gasto` y `costo_por_alumno` vienen null.
// Los filtros de sucursal y disciplina son opcionales y se intersectan con el alcance de quien pregunta; un id que no existe o no es suyo da un reporte vacío (nunca confirma que existe).

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { reporteDeEmbudo } from "../../reportes/embudo.ts";
import { reporteDeEvolucion } from "../../reportes/evolucion.ts";
import { reporteDeFuentes } from "../../reportes/fuentes.ts";
import { condicionDeLead, filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { validacion } from "../errores.ts";
import { tienePermiso } from "../permisos.ts";
import { fechaISO, objeto, opcional, parsearQuery, texto, uuid } from "../validar.ts";

const esquemaRango = objeto({ desde: opcional(fechaISO()), hasta: opcional(fechaISO()), sucursal_id: opcional(uuid()), vertical_id: opcional(uuid()) });
const esquemaEvolucion = objeto({ mes: opcional(texto({ patron: /^\d{4}-(0[1-9]|1[0-2])$/, mensajePatron: "Debe ser AAAA-MM" })), sucursal_id: opcional(uuid()), vertical_id: opcional(uuid()) });

function validarRango(q: { desde?: string | undefined; hasta?: string | undefined }): void {
  if (q.desde && q.hasta && q.desde > q.hasta) throw validacion([{ campo: "desde", mensaje: "No puede ser posterior a «hasta»" }]);
}

export function rutasDeReportesDelTablero(_deps: DepsApi): Router {
  const r = crearRouter();

  r.get("/reportes/embudo", requierePermiso("reportes:ejecutivo"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaRango, req.query);
    validarRango(q);
    res.json(await reporteDeEmbudo(ctx.db, { desde: q.desde, hasta: q.hasta, sucursalId: q.sucursal_id, verticalId: q.vertical_id, dondeLead: condicionDeLead(await ctx.alcance()) ?? {} }));
  });

  r.get("/reportes/fuentes", requierePermiso("reportes:ejecutivo"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaRango, req.query);
    validarRango(q);
    res.json(await reporteDeFuentes(ctx.db, { desde: q.desde, hasta: q.hasta, sucursalId: q.sucursal_id, verticalId: q.vertical_id, dondeLead: condicionDeLead(await ctx.alcance()) ?? {}, conGasto: tienePermiso(ctx.usuario.rol, "reportes:costos") }));
  });

  r.get("/reportes/evolucion", requierePermiso("reportes:ejecutivo"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaEvolucion, req.query);
    const filtro = filtroDeSucursal(await ctx.alcance());
    res.json(await reporteDeEvolucion(ctx.db, { ...(q.mes ? { mes: q.mes } : {}), ahora: ctx.ahora(), sucursalesVisibles: filtro ? filtro.in : null, ...(q.sucursal_id ? { sucursalId: q.sucursal_id } : {}), ...(q.vertical_id ? { verticalId: q.vertical_id } : {}) }));
  });

  return r;
}
