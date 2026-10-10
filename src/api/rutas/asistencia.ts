// Pase de lista (G1) y asistencia de una inscripción (G1/G2).
//
//   GET /api/grupos/:id/pase?fecha=AAAA-MM-DD     la lista del pase de esa sesión con lo ya registrado   (asistencia:leer)
//   PUT /api/grupos/:id/pase { fecha, asistencias: [{ inscripcion_id, estatus, metodo? }] }               (asistencia:registrar)
//
// Alcance: el maestro solo toma y ve el pase de SUS grupos (los de su instructor); asesor y recepción los de sus sucursales; el administrador todos. Lo
// ajeno es 404. La fecha tiene que ser una sesión del grupo (su `grupo_horario`, en la zona de la sucursal) que ya empezó: `no_es_sesion` / `fecha_futura`
// → 409 con `detalles: [{ campo: "motivo", mensaje: <código> }]`. Una inscripción que no está en la lista del pase o repetida → 400 con su índice. El
// guardado es TODO o nada, idempotente (una fila por inscripción y fecha) y serializado por (grupo, fecha); cada alta y cada corrección deja su registro de cambios.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { dondeGrupoVisible } from "../../asistencia/alcance.ts";
import { calcularDerivados, presentarDerivados, recalcularDerivados } from "../../asistencia/derivados.ts";
import { leerConfiguracion } from "../../configuracion/index.ts";
import { dondeInscripcionVisible } from "../../inscripciones/alcance.ts";
import { cargarGrupoDelPase, dateAFecha, ESTATUS_DE_ASISTENCIA, fechaADate, guardarPase, hoyEn, listaDelPase, METODOS_DE_ASISTENCIA, problemaDePase, sesionesDelDia } from "../../asistencia/pase.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { enumerado, fechaISO, listaDe, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });
const esquemaConsulta = objeto({ fecha: fechaISO() });
const esquemaHistorial = objeto({ ...esquemaPaginacion, desde: opcional(fechaISO()), hasta: opcional(fechaISO()) });
const esquemaPase = objeto({
  fecha: fechaISO(),
  asistencias: listaDe(objeto({ inscripcion_id: uuid(), estatus: enumerado(ESTATUS_DE_ASISTENCIA), metodo: opcional(enumerado(METODOS_DE_ASISTENCIA)) }), { max: 300 }),
});

export function rutasDeAsistencia(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/grupos/:id/pase", requierePermiso("asistencia:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { fecha } = parsearQuery(esquemaConsulta, req.query);
    const grupo = await cargarGrupoDelPase(ctx.db, id, await dondeGrupoVisible(ctx));
    if (!grupo) throw noEncontrado();
    const problema = problemaDePase(fecha, { horarios: grupo.horarios, zona: grupo.zona, ahora: ctx.ahora() });
    const { lista, paseTomado } = await listaDelPase(ctx.db, grupo.id, fecha);
    res.json({
      grupo: { id: grupo.id, nombre: grupo.nombre },
      fecha,
      hoy: hoyEn(grupo.zona, ctx.ahora()),
      es_sesion: problema !== "no_es_sesion",
      sesiones: sesionesDelDia(fecha, grupo.horarios, grupo.zona).map((s) => s.toISOString()),
      puede_registrar: problema === null,
      problema,
      pase_tomado: paseTomado,
      lista: lista.map((f) => ({ inscripcion_id: f.inscripcionId, alumno_id: f.alumnoId, alumno: f.alumno, activa: f.activa, estatus: f.estatus, metodo: f.metodo })),
    });
  });

  r.put("/grupos/:id/pase", requierePermiso("asistencia:registrar"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const cuerpo = parsear(esquemaPase, req.body);
    const grupo = await cargarGrupoDelPase(ctx.db, id, await dondeGrupoVisible(ctx));
    if (!grupo) throw noEncontrado();
    const problema = problemaDePase(cuerpo.fecha, { horarios: grupo.horarios, zona: grupo.zona, ahora: ctx.ahora() });
    if (problema === "no_es_sesion") throw conflicto("Ese día el grupo no da clase", [{ campo: "motivo", mensaje: problema }]);
    if (problema === "fecha_futura") throw conflicto("No se puede pasar lista de una clase que todavía no empieza", [{ campo: "motivo", mensaje: problema }]);

    const guardado = await guardarPase(ctx.db, {
      organizacionId: ctx.organizacionId,
      grupoId: grupo.id,
      fecha: cuerpo.fecha,
      usuarioId: ctx.usuario.id,
      entradas: cuerpo.asistencias.map((a) => ({ inscripcionId: a.inscripcion_id, estatus: a.estatus, metodo: a.metodo ?? "manual" })),
      alCambiar: (tx, c) => registrarCambio(tx, ctx, { entidad: "asistencia", entidadId: c.asistenciaId, accion: c.accion, antes: c.antes, despues: c.despues }),
    });
    if (!guardado.ok) {
      const campo = (i: number) => `asistencias[${i}].inscripcion_id`;
      throw validacion(guardado.detalles.map((d) => ({ campo: campo(d.indice), mensaje: guardado.motivo === "inscripcion_repetida" ? "La inscripción viene repetida" : "La inscripción no está en la lista de este pase" })));
    }
    // G2: con el pase ya confirmado se recalculan los derivados (racha de faltas y su tarea) de TODAS las inscripciones del pase, no solo de las que cambiaron (EG-04):
    // si el proceso se cortó o el recálculo falló después de confirmar el pase, el reintento (que ya no cambia nada) tiene que poder terminar el trabajo. Es idempotente.
    const cambiaron = new Set(guardado.inscripciones);
    // Contrato de siempre: repetir un pase que no cambió nada no reporta «racha en el umbral» (sin acción) de nadie; solo lo que de verdad se hizo (una tarea creada o resuelta).
    const alertas = (await recalcularDerivados(ctx.db, { organizacionId: ctx.organizacionId, inscripcionIds: cuerpo.asistencias.map((a) => a.inscripcion_id), ahora: ctx.ahora() })).filter((x) => cambiaron.has(x.inscripcion_id) || x.accion !== null);
    const { lista } = await listaDelPase(ctx.db, grupo.id, cuerpo.fecha);
    res.json({
      grupo_id: grupo.id,
      fecha: cuerpo.fecha,
      creadas: guardado.creadas,
      actualizadas: guardado.actualizadas,
      sin_cambio: guardado.sinCambio,
      alertas,
      lista: lista.map((f) => ({ inscripcion_id: f.inscripcionId, alumno_id: f.alumnoId, alumno: f.alumno, activa: f.activa, estatus: f.estatus, metodo: f.metodo })),
    });
  });

  // G2 — consultable por API: el historial de una inscripción con sus derivados, y los de todo un grupo.
  r.get("/inscripciones/:id/asistencia", requierePermiso("asistencia:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const q = parsearQuery(esquemaHistorial, req.query);
    const pag = leerPaginacion(q);
    const insc = await ctx.db.inscripcion.findFirst({
      where: { id, ...(await dondeInscripcionVisible(ctx)) },
      select: { id: true, alumno_id: true, estatus: true, grupo: { select: { programa: { select: { sucursal: { select: { zona_horaria: true } } } } } } },
    });
    if (!insc) throw noEncontrado();
    const todas = (await ctx.db.asistencia.findMany({ where: { inscripcion_id: id }, select: { fecha: true, estatus: true } })).map((f) => ({ fecha: dateAFecha(f.fecha), estatus: f.estatus }));
    const umbral = (await leerConfiguracion(ctx.db)).umbralFaltasConsecutivas;
    const hoy = hoyEn(insc.grupo.programa.sucursal.zona_horaria, ctx.ahora());
    const where = { inscripcion_id: id, ...(q.desde || q.hasta ? { fecha: { ...(q.desde ? { gte: fechaADate(q.desde) } : {}), ...(q.hasta ? { lte: fechaADate(q.hasta) } : {}) } } : {}) };
    const pagina = await paginar(
      pag,
      () => ctx.db.asistencia.count({ where }),
      async (saltar, tomar) =>
        (await ctx.db.asistencia.findMany({ where, orderBy: [{ fecha: "desc" }, { id: "desc" }], skip: saltar, take: tomar, select: { id: true, fecha: true, estatus: true, metodo: true, grupo_id: true } })).map((f) => ({ id: f.id, fecha: dateAFecha(f.fecha), estatus: f.estatus, metodo: f.metodo, grupo_id: f.grupo_id })),
    );
    res.json({ inscripcion_id: id, alumno_id: insc.alumno_id, derivados: presentarDerivados(calcularDerivados(todas, hoy), umbral), ...pagina });
  });

  r.get("/grupos/:id/asistencia/derivados", requierePermiso("asistencia:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const grupo = await cargarGrupoDelPase(ctx.db, id, await dondeGrupoVisible(ctx));
    if (!grupo) throw noEncontrado();
    const inscritos = await ctx.db.inscripcion.findMany({
      where: { grupo_id: grupo.id, estatus: "activa" },
      select: { id: true, alumno_id: true, alumno: { select: { nombre: true, apellidos: true } } },
      orderBy: [{ alumno: { apellidos: "asc" } }, { alumno: { nombre: "asc" } }, { id: "asc" }],
    });
    const filas = await ctx.db.asistencia.findMany({ where: { inscripcion_id: { in: inscritos.map((i) => i.id) } }, select: { inscripcion_id: true, fecha: true, estatus: true } });
    const porInscripcion = new Map<string, { fecha: string; estatus: (typeof filas)[number]["estatus"] }[]>();
    for (const f of filas) porInscripcion.set(f.inscripcion_id, [...(porInscripcion.get(f.inscripcion_id) ?? []), { fecha: dateAFecha(f.fecha), estatus: f.estatus }]);
    const umbral = (await leerConfiguracion(ctx.db)).umbralFaltasConsecutivas;
    const hoy = hoyEn(grupo.zona, ctx.ahora());
    res.json({
      grupo: { id: grupo.id, nombre: grupo.nombre },
      hoy,
      umbral_de_faltas: umbral,
      datos: inscritos.map((i) => ({ inscripcion_id: i.id, alumno_id: i.alumno_id, alumno: `${i.alumno.nombre} ${i.alumno.apellidos}`, ...presentarDerivados(calcularDerivados(porInscripcion.get(i.id) ?? [], hoy), umbral) })),
    });
  });

  return r;
}
