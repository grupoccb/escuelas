// Inscripciones (F3).
//
//   GET  /api/inscripciones?alumno_id=&grupo_id=&estatus=&tutor_id=&lead_id=&limite=&pagina=   (inscripciones:leer)
//   GET  /api/inscripciones/:id                                                                  (inscripciones:leer)
//   POST /api/inscripciones { alumno_id, grupo_id, fecha_inicio?, dia_corte_pago?, meses_pagados_por_adelantado?, cotizacion_id?, permitir_fuera_de_edad? }   (inscripciones:escribir)
//
// Inscribir congela el precio vigente, aplica las promociones que corresponden (con los hermanos ya inscritos), exige el reglamento vigente
// aceptado y toma un lugar del cupo del grupo de forma atómica. Ver `src/inscripciones/inscribir.ts`. Rechazos de negocio → 409 con
// `detalles: [{ campo: "motivo", mensaje: <código> }, …]` (`grupo_lleno`, `sin_precio`, `reglamento`, `fuera_de_edad`, `ya_inscrito`).
// Los cambios de una inscripción existente (cambio de grupo, congelar, reactivar, baja) están en `inscripciones-cambios.ts` (F5).

import { Router } from "express";
import express from "express";
import { cerrarEntradaDe } from "../../lista-espera/lista-espera.ts";
import { dondeAlumnoVisible } from "../../familias/alcance.ts";
import { dondeInscripcionVisible } from "../../inscripciones/alcance.ts";
import { inscribirAlumno, type MotivoDeRechazoDeInscripcion, type ResultadoDeInscripcion } from "../../inscripciones/inscribir.ts";
import { instantaneaDeCreada, presentarInscripcion, SELECCION_INSCRIPCION, type FilaDeInscripcion } from "../../inscripciones/presentar.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { ErrorApi, conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { booleano, entero, enumerado, fechaISO, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

const ESTATUS = ["activa", "congelada", "baja"] as const;
const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({ ...esquemaPaginacion, alumno_id: opcional(uuid()), grupo_id: opcional(uuid()), estatus: opcional(enumerado(ESTATUS)), tutor_id: opcional(uuid()), lead_id: opcional(uuid()) });
const esquemaInscribir = objeto({
  alumno_id: uuid(),
  grupo_id: uuid(),
  fecha_inicio: opcional(fechaISO()),
  dia_corte_pago: opcional(entero({ min: 1, max: 31 })),
  meses_pagados_por_adelantado: opcional(entero({ min: 0, max: 24 })),
  cotizacion_id: opcional(uuid()),
  permitir_fuera_de_edad: opcional(booleano()),
});

/** Convierte un rechazo de negocio de `inscribirAlumno` en el error de la convención de la API. */
export function errorDeInscripcion(r: Extract<ResultadoDeInscripcion, { ok: false }>): never {
  const motivo: MotivoDeRechazoDeInscripcion = r.motivo;
  if (motivo === "alumno_inexistente" || motivo === "grupo_inexistente") throw noEncontrado(r.mensaje);
  if (motivo === "fecha_invalida" || motivo === "dia_de_corte_invalido" || motivo === "cotizacion_invalida") throw validacion(r.detalles ?? [{ mensaje: r.mensaje }], r.mensaje);
  throw conflicto(r.mensaje, [{ campo: "motivo", mensaje: motivo }, ...(r.detalles ?? []), ...(r.inscripcionId ? [{ campo: "inscripcion_id", mensaje: r.inscripcionId }] : [])]);
}

export function rutasDeInscripciones(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  async function leer(ctx: ContextoApi, id: string): Promise<FilaDeInscripcion> {
    const f = (await ctx.db.inscripcion.findFirst({ where: { id, ...(await dondeInscripcionVisible(ctx)) }, select: SELECCION_INSCRIPCION })) as unknown as FilaDeInscripcion | null;
    if (!f) throw noEncontrado();
    return f;
  }

  r.get("/inscripciones", requierePermiso("inscripciones:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const condiciones: Record<string, unknown>[] = [await dondeInscripcionVisible(ctx)];
    if (q.alumno_id) condiciones.push({ alumno_id: q.alumno_id });
    if (q.grupo_id) condiciones.push({ grupo_id: q.grupo_id });
    if (q.estatus) condiciones.push({ estatus: q.estatus });
    if (q.lead_id) condiciones.push({ lead_id: q.lead_id });
    if (q.tutor_id) condiciones.push({ alumno: { tutores: { some: { tutor_id: q.tutor_id, eliminado_en: null } } } });
    const where = { AND: condiciones };
    const ahora = ctx.ahora();
    res.json(
      await paginar(
        pag,
        () => ctx.db.inscripcion.count({ where }),
        async (saltar, tomar) => (await ctx.db.inscripcion.findMany({ where, select: SELECCION_INSCRIPCION, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((f) => presentarInscripcion(f as unknown as FilaDeInscripcion, ahora)),
      ),
    );
  });

  r.get("/inscripciones/:id", requierePermiso("inscripciones:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const f = await leer(ctx, id);
    res.json(presentarInscripcion(f, ctx.ahora()));
  });

  r.post("/inscripciones", requierePermiso("inscripciones:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaInscribir, req.body);
    if (e.permitir_fuera_de_edad && ctx.usuario.rol !== "administrador") throw new ErrorApi("prohibido", "Solo el administrador inscribe fuera del rango de edad");
    // El alumno y el grupo tienen que estar a la vista de quien inscribe.
    if (!(await ctx.db.alumno.findFirst({ where: { id: e.alumno_id, ...(await dondeAlumnoVisible(ctx)) }, select: { id: true } }))) throw noEncontrado("No se encontró el alumno");
    const filtroGrupo = (await dondeInscripcionVisible(ctx))["grupo"];
    if (!(await ctx.db.grupo.findFirst({ where: { id: e.grupo_id, ...(filtroGrupo ? (filtroGrupo as Record<string, unknown>) : {}) }, select: { id: true } }))) throw noEncontrado("No se encontró el grupo");

    const resultado = await ctx.db.$transaction(async (tx) => {
      const r = await inscribirAlumno(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, {
        alumnoId: e.alumno_id,
        grupoId: e.grupo_id,
        ...(e.fecha_inicio ? { fechaInicio: e.fecha_inicio } : {}),
        ...(e.dia_corte_pago !== undefined ? { diaCortePago: e.dia_corte_pago } : {}),
        ...(e.meses_pagados_por_adelantado !== undefined ? { mesesPagadosPorAdelantado: e.meses_pagados_por_adelantado } : {}),
        ...(e.cotizacion_id ? { cotizacionId: e.cotizacion_id } : {}),
        ...(e.permitir_fuera_de_edad ? { permitirFueraDeEdad: true } : {}),
      });
      if (r.ok) await registrarCambio(tx, ctx, { entidad: "inscripcion", entidadId: r.inscripcion.id, accion: "crear", despues: instantaneaDeCreada(r.inscripcion) });
      return r;
    });
    if (!resultado.ok) errorDeInscripcion(resultado);
    // Si la familia esperaba un lugar en este grupo, la entrada de la lista se cierra como inscrita (con su propio candado, ya confirmada la inscripción).
    if (resultado.inscripcion.listaDeEspera) await cerrarEntradaDe(ctx.db, resultado.inscripcion.listaDeEspera.grupoId, resultado.inscripcion.listaDeEspera.prospectoId, "inscrito");
    res.status(201).json(presentarInscripcion(await leer(ctx, resultado.inscripcion.id), ctx.ahora()));
  });

  return r;
}
