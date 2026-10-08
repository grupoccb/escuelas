// Pase de lista (G1) y asistencia de una inscripción (G1/G2).
//
//   GET /api/grupos/:id/pase?fecha=AAAA-MM-DD     la lista del pase de esa sesión con lo ya registrado   (asistencia:leer)
//   PUT /api/grupos/:id/pase { fecha, asistencias: [{ inscripcion_id, estatus, metodo? }] }               (asistencia:registrar)
//
// Alcance: el maestro solo toma y ve el pase de SUS grupos (los de su instructor); asesor y recepción los de sus sucursales; el administrador todos. Lo
// ajeno es 404. La fecha tiene que ser una sesión del grupo (su `grupo_horario`, en la zona de la sucursal) que ya empezó: `no_es_sesion` / `fecha_futura`
// → 409 con `detalles: [{ campo: "motivo", mensaje: <código> }]`. Una inscripción que no está en la lista del pase o repetida → 400 con su índice. El
// guardado es TODO o nada, idempotente (una fila por inscripción y fecha) y serializado por (grupo, fecha); cada alta y cada corrección deja su registro de cambios.

import { Router } from "express";
import express from "express";
import { dondeGrupoVisible } from "../../asistencia/alcance.ts";
import { cargarGrupoDelPase, ESTATUS_DE_ASISTENCIA, guardarPase, hoyEn, listaDelPase, METODOS_DE_ASISTENCIA, problemaDePase, sesionesDelDia } from "../../asistencia/pase.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { registrarCambio } from "../registro.ts";
import { enumerado, fechaISO, listaDe, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });
const esquemaConsulta = objeto({ fecha: fechaISO() });
const esquemaPase = objeto({
  fecha: fechaISO(),
  asistencias: listaDe(objeto({ inscripcion_id: uuid(), estatus: enumerado(ESTATUS_DE_ASISTENCIA), metodo: opcional(enumerado(METODOS_DE_ASISTENCIA)) }), { max: 300 }),
});

export function rutasDeAsistencia(_deps: DepsApi): Router {
  const r = Router();
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
    const { lista } = await listaDelPase(ctx.db, grupo.id, cuerpo.fecha);
    res.json({
      grupo_id: grupo.id,
      fecha: cuerpo.fecha,
      creadas: guardado.creadas,
      actualizadas: guardado.actualizadas,
      sin_cambio: guardado.sinCambio,
      lista: lista.map((f) => ({ inscripcion_id: f.inscripcionId, alumno_id: f.alumnoId, alumno: f.alumno, activa: f.activa, estatus: f.estatus, metodo: f.metodo })),
    });
  });

  return r;
}
