// Exportación a CSV de las listas clave (I5). Cada una respeta el permiso y el alcance de su lista en pantalla: lo que no puedes ver, no lo puedes descargar.
//
//   GET /api/exportaciones/estado-cuenta?tutor_id=     (estado_cuenta:leer)   los cargos de la familia por hijo, con saldo y atraso, y una fila de total
//   GET /api/exportaciones/uniformes-por-entregar      (beneficios:leer)      lo liberado que recepción debe entregar
//   GET /api/exportaciones/leads?etapa_id=&sucursal_id= (leads:leer)           los leads con su etapa, campaña y fuente
//   GET /api/exportaciones/familias-un-solo-hijo?sucursal_id=  (tutores:leer)  R6b: la lista de venta cruzada (familias con un solo hijo inscrito), con lo que ya toman y lo que podrían probar
//
// Los reportes de I1 a I3 se descargan con `?formato=csv` en su propia ruta. Las listas grandes (leads, uniformes) se escriben por lotes con cursor, sin cargarlas enteras en memoria. Descarga con `Content-Disposition`, BOM UTF-8, escape correcto y protección
// contra inyección de fórmulas (`src/exportacion/csv.ts`); el dinero sale como texto decimal exacto.

import { leerModulos } from "../../modulos/index.ts";
import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { dondeTutorVisible } from "../../familias/alcance.ts";
import { familiasConUnHijo } from "../../familias/cross-sell.ts";
import { estadoDeCuentaDeFamilia } from "../../finanzas/estado-cuenta.ts";
import { dondePorEntregar, presentarPorEntregar, SELECCION_POR_ENTREGAR } from "../../finanzas/por-entregar.ts";
import { dondeInscripcionVisible } from "../../inscripciones/alcance.ts";
import { aCsv, type Columna } from "../../exportacion/csv.ts";
import { enviarCsv, enviarCsvPorLotes } from "../../exportacion/http.ts";
import { deFecha } from "../../catalogo/precios.ts";
import { fechaLocal } from "../../lib/horario.ts";
import { log } from "../../lib/log.ts";
import { inscritosAMano } from "../../embudo/inscrito-a-mano.ts";
import { fuenteDe } from "../../reportes/fuente.ts";
import { condicionDeLead } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { noEncontrado } from "../errores.ts";
import { objeto, opcional, parsearQuery, uuid } from "../validar.ts";

const esquemaCuenta = objeto({ tutor_id: uuid() });
const esquemaPorEntregar = objeto({ sucursal_id: opcional(uuid()) });
const esquemaUnSoloHijo = objeto({ sucursal_id: opcional(uuid()) });
const esquemaLeads = objeto({ etapa_id: opcional(uuid()), sucursal_id: opcional(uuid()) });

interface FilaDeCuenta {
  hijo: string;
  concepto: string;
  periodo: string | null;
  descripcion: string | null;
  vencimiento: string;
  monto_final: string;
  pagado: string;
  saldo: string;
  estatus: string;
  atraso: number | null;
}

const COLUMNAS_CUENTA: Columna<FilaDeCuenta>[] = [
  { titulo: "Hijo", valor: (f) => f.hijo },
  { titulo: "Concepto", valor: (f) => f.concepto },
  { titulo: "Periodo", valor: (f) => f.periodo },
  { titulo: "Descripción", valor: (f) => f.descripcion },
  { titulo: "Vencimiento", valor: (f) => f.vencimiento },
  { titulo: "Monto final", tipo: "dinero", valor: (f) => f.monto_final },
  { titulo: "Pagado", tipo: "dinero", valor: (f) => f.pagado },
  { titulo: "Saldo", tipo: "dinero", valor: (f) => f.saldo },
  { titulo: "Estatus", valor: (f) => f.estatus },
  { titulo: "Días de atraso", tipo: "entero", valor: (f) => f.atraso },
];

export function rutasDeExportaciones(_deps: DepsApi): Router {
  const r = crearRouter();

  r.get("/exportaciones/estado-cuenta", requierePermiso("estado_cuenta:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { tutor_id } = parsearQuery(esquemaCuenta, req.query);
    const tutor = await ctx.db.tutor.findFirst({ where: { id: tutor_id, ...(await dondeTutorVisible(ctx)) }, select: { id: true, nombre: true, apellidos: true } });
    if (!tutor) throw noEncontrado();
    const cuenta = await estadoDeCuentaDeFamilia(ctx.db, tutor_id, ctx.ahora());
    const filas: FilaDeCuenta[] = cuenta.hijos.flatMap((h) =>
      h.cargos.map((c) => ({ hijo: `${h.alumno.nombre} ${h.alumno.apellidos}`, concepto: c.concepto, periodo: c.periodo, descripcion: c.descripcion, vencimiento: c.fecha_vencimiento, monto_final: c.monto_final, pagado: c.monto_pagado, saldo: c.saldo, estatus: c.estatus_efectivo, atraso: c.dias_de_atraso })),
    );
    filas.push({ hijo: "TOTAL", concepto: "", periodo: null, descripcion: null, vencimiento: "", monto_final: cuenta.resumen.total_cargado, pagado: cuenta.resumen.total_pagado, saldo: cuenta.resumen.saldo, estatus: "", atraso: null });
    enviarCsv(res, `estado-de-cuenta-${tutor.nombre}-${tutor.apellidos ?? ""}`, aCsv(COLUMNAS_CUENTA, filas));
  });

  r.get("/exportaciones/uniformes-por-entregar", requierePermiso("beneficios:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaPorEntregar, req.query);
    const where = dondePorEntregar(await dondeInscripcionVisible(ctx), q.sucursal_id);
    // Por lotes con cursor: en memoria hay un lote, no toda la lista.
    const pedir = async (ultima: { id: string } | null, tamano: number) =>
      (await ctx.db.promocion_aplicacion.findMany({ where, select: SELECCION_POR_ENTREGAR, orderBy: [{ liberado_en: "asc" }, { id: "asc" }], take: tamano, ...(ultima ? { cursor: { id: ultima.id }, skip: 1 } : {}) })).map(presentarPorEntregar);
    const columnas: Columna<Awaited<ReturnType<typeof pedir>>[number]>[] = [
      { titulo: "Alumno", valor: (f) => `${f.alumno.nombre} ${f.alumno.apellidos}` },
      { titulo: "Talla", valor: (f) => f.alumno.talla_uniforme },
      { titulo: "Grupo", valor: (f) => f.grupo },
      { titulo: "Responsable de pago", valor: (f) => (f.tutor ? `${f.tutor.nombre} ${f.tutor.apellidos ?? ""}`.trim() : null) },
      { titulo: "Teléfono", valor: (f) => f.tutor?.telefono },
      { titulo: "Promoción", valor: (f) => f.promocion },
      { titulo: "Beneficio", valor: (f) => f.descripcion ?? f.tipo },
      { titulo: "Liberado", valor: (f) => (f.liberado_en ? deFecha(f.liberado_en) : null) },
    ];
    await enviarCsvPorLotes(res, "uniformes-por-entregar", columnas, pedir, { alFallar: (e) => log.error("exportacion_fallida", { ruta: "uniformes-por-entregar", error: e instanceof Error ? e.message : "desconocido" }) });
  });

  r.get("/exportaciones/familias-un-solo-hijo", requierePermiso("tutores:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaUnSoloHijo, req.query);
    const familias = await familiasConUnHijo(ctx.db, { visible: await dondeTutorVisible(ctx), hoy: ctx.ahora().toISOString().slice(0, 10), ...(q.sucursal_id ? { sucursalId: q.sucursal_id } : {}) });
    const columnas: Columna<(typeof familias)[number]>[] = [
      { titulo: "Familia", valor: (f) => `${f.nombre} ${f.apellidos ?? ""}`.trim() },
      { titulo: "Teléfono", valor: (f) => f.telefono },
      { titulo: "Hijo", valor: (f) => `${f.alumno.nombre} ${f.alumno.apellidos}` },
      { titulo: "Edad", tipo: "entero", valor: (f) => f.alumno.edad },
      { titulo: "Ya está en", valor: (f) => f.verticalesInscritas.map((v) => v.nombre).join(", ") },
      { titulo: "Podría probar", valor: (f) => f.verticalesSin.map((v) => `${v.nombre}${v.disponibleEnSuSucursal ? "" : " (otra sucursal)"}`).join(", ") },
    ];
    enviarCsv(res, "familias-con-un-solo-hijo", aCsv(columnas, familias));
  });

  r.get("/exportaciones/leads", requierePermiso("leads:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaLeads, req.query);
    const alcanceDeLeads = condicionDeLead(await ctx.alcance());
    const condiciones: Record<string, unknown>[] = [];
    if (alcanceDeLeads) condiciones.push(alcanceDeLeads);
    if (q.sucursal_id) condiciones.push({ sucursal_interes_id: q.sucursal_id });
    if (q.etapa_id) condiciones.push({ etapa_id: q.etapa_id });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};
    const pedir = async (ultima: { id: string } | null, tamano: number) => {
      const lote = await ctx.db.lead.findMany({
        where,
        orderBy: [{ creado_en: "desc" }, { id: "asc" }],
        take: tamano,
        ...(ultima ? { cursor: { id: ultima.id }, skip: 1 } : {}),
        select: { id: true, creado_en: true, nombre_contacto: true, telefono: true, anuncio_id: true, ctwa_clid: true, atribucion: true, etapa: { select: { nombre: true, es_ganado: true, tipo_sistema: true } }, sucursal_interes: { select: { nombre: true, zona_horaria: true } }, vertical_interes: { select: { nombre: true } }, campana: { select: { nombre: true, origen: true } } },
      });
      // V10b: cómo llegó a «inscrito» cada lead de este lote (a mano o por inscripción).
      const manos = await inscritosAMano(ctx.db, { leadIds: lote.map((l) => l.id) });
      return lote.map((l) => ({ ...l, inscrito: l.etapa.es_ganado || l.etapa.tipo_sistema === "inscrito", a_mano: manos.has(l.id) }));
    };
    // V13-fix (EV-21): con la inscripción apagada la escuela no tiene inscripciones: «Cómo se inscribió» solo dice «A mano» (lo que SÍ pasa con el módulo apagado, V10b) y nunca «Por inscripción».
    const conInscripcion = (await leerModulos(ctx.db)).inscripcion;
    const columnas: Columna<Awaited<ReturnType<typeof pedir>>[number]>[] = [
      { titulo: "Fecha", valor: (l) => fechaLocal(l.creado_en, l.sucursal_interes?.zona_horaria ?? "UTC") },
      { titulo: "Contacto", valor: (l) => l.nombre_contacto },
      { titulo: "Teléfono", valor: (l) => l.telefono },
      { titulo: "Vertical", valor: (l) => l.vertical_interes.nombre },
      { titulo: "Sucursal", valor: (l) => l.sucursal_interes?.nombre },
      { titulo: "Etapa", valor: (l) => l.etapa.nombre },
      { titulo: "Campaña", valor: (l) => l.campana?.nombre },
      { titulo: "Fuente", valor: (l) => fuenteDe(l) },
      { titulo: "Cómo se inscribió", valor: (l) => (!l.inscrito ? null : l.a_mano ? "A mano" : conInscripcion ? "Por inscripción" : null) },
    ];
    await enviarCsvPorLotes(res, "leads", columnas, pedir, { alFallar: (e) => log.error("exportacion_fallida", { ruta: "leads", error: e instanceof Error ? e.message : "desconocido" }) });
  });

  return r;
}
