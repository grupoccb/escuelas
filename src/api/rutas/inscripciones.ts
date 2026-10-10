// Inscripciones (F3).
//
//   GET  /api/inscripciones?alumno_id=&grupo_id=&estatus=&tutor_id=&lead_id=&limite=&pagina=   (inscripciones:leer)
//   GET  /api/inscripciones/:id                                                                  (inscripciones:leer)
//   POST /api/inscripciones { alumno_id, grupo_id, fecha_inicio?, dia_corte_pago?, meses_pagados_por_adelantado?, cotizacion_id?, permitir_fuera_de_edad? }   (inscripciones:escribir)
//
// Inscribir congela el precio vigente, aplica las promociones que corresponden (con los hermanos ya inscritos), exige el reglamento vigente
// aceptado y toma un lugar del cupo del grupo de forma atómica. Ver `src/inscripciones/inscribir.ts`. Rechazos de negocio → 409 con
// `detalles: [{ campo: "motivo", mensaje: <código> }, …]` (`grupo_lleno`, `sin_precio`, `reglamento`, `fuera_de_edad`, `ya_inscrito`).
//
// F5 — lo que le pasa a una inscripción después (`src/inscripciones/cambios.ts`), todo con permiso `inscripciones:escribir`:
//   POST /api/inscripciones/:id/cambiar-grupo { grupo_id }     otro grupo del MISMO programa; atómico (si no hay lugar, nada cambia)
//   POST /api/inscripciones/:id/congelar                       libera el lugar
//   POST /api/inscripciones/:id/reactivar                      necesita lugar (409 `grupo_lleno` si se llenó)
//   POST /api/inscripciones/:id/baja { motivo_baja_id }        libera el lugar; el motivo es del catálogo editable
//   GET  /api/inscripciones/:id/movimientos                    historial (de solo anexar): cambios de grupo, congelaciones, reactivaciones, baja
// Soltar un lugar activo (cambio de grupo, congelar, baja) avisa a la lista de espera del grupo con `ofrecerLugarLiberado` (tarea para el asesor).

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { cerrarEntradaDe, ofrecerLugarLiberado } from "../../lista-espera/lista-espera.ts";
import { dondeAlumnoVisible } from "../../familias/alcance.ts";
import { dondeInscripcionVisible } from "../../inscripciones/alcance.ts";
import { cambiarDeGrupo, congelarInscripcion, darDeBaja, reactivarInscripcion, type ResultadoDeCambio } from "../../inscripciones/cambios.ts";
import { inscribirAlumno, type MotivoDeRechazoDeInscripcion, type ResultadoDeInscripcion } from "../../inscripciones/inscribir.ts";
import { instantaneaDeCreada, presentarInscripcion, SELECCION_INSCRIPCION, type FilaDeInscripcion } from "../../inscripciones/presentar.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { ErrorApi, conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import type { Consultas } from "../../datos/alcance.ts";
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

const esquemaCambiarGrupo = objeto({ grupo_id: uuid() });
const esquemaBaja = objeto({ motivo_baja_id: uuid() });

/** Un rechazo de `cambios.ts` en el error de la convención. */
function errorDeCambio(r: Extract<ResultadoDeCambio, { ok: false }>): never {
  if (r.motivo === "inscripcion_inexistente" || r.motivo === "grupo_inexistente") throw noEncontrado(r.mensaje);
  if (r.motivo === "motivo_inexistente") throw validacion([{ campo: "motivo_baja_id", mensaje: r.mensaje }], r.mensaje);
  throw conflicto(r.mensaje, [{ campo: "motivo", mensaje: r.motivo }]);
}
const delCambio = (a: { estatus: string; grupoId: string; fechaBaja: string | null; motivoBajaId: string | null }): Instantanea => ({ estatus: a.estatus, grupo_id: a.grupoId, fecha_baja: a.fechaBaja, motivo_baja_id: a.motivoBajaId });

export function rutasDeInscripciones(_deps: DepsApi): Router {
  const r = crearRouter();
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
        async (saltar, tomar) => (await ctx.db.inscripcion.findMany({ where, select: SELECCION_INSCRIPCION, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((f) => presentarInscripcion(f as unknown as FilaDeInscripcion, ahora, ctx.usuario.rol)),
      ),
    );
  });

  r.get("/inscripciones/:id", requierePermiso("inscripciones:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const f = await leer(ctx, id);
    res.json(presentarInscripcion(f, ctx.ahora(), ctx.usuario.rol));
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
    res.status(201).json(presentarInscripcion(await leer(ctx, resultado.inscripcion.id), ctx.ahora(), ctx.usuario.rol));
  });

  /**
   * Corre un cambio de F5 en UNA transacción con su registro de cambios; ya confirmado, si soltó un lugar activo avisa a la lista de espera
   * (su propia transacción con candado). Devuelve la inscripción como queda y, si hubo, la tarea de «se liberó un lugar».
   */
  async function cambiar(ctx: ContextoApi, id: string, hacer: (tx: Consultas) => Promise<ResultadoDeCambio>) {
    await leer(ctx, id); // alcance: lo ajeno es 404
    const resultado = await ctx.db.$transaction(async (tx) => {
      const r = await hacer(tx);
      if (r.ok) await registrarCambio(tx, ctx, { entidad: "inscripcion", entidadId: id, accion: "actualizar", antes: delCambio(r.antes), despues: delCambio(r.despues) });
      return r;
    });
    if (!resultado.ok) errorDeCambio(resultado);
    const oferta = resultado.liberaLugarEn ? await ofrecerLugarLiberado(ctx.db, resultado.liberaLugarEn, { ahora: ctx.ahora() }) : null;
    return { ...presentarInscripcion(await leer(ctx, id), ctx.ahora(), ctx.usuario.rol), lista_espera: oferta ? { tarea_id: oferta.tareaId, prospecto_id: oferta.entrada.prospectoId, posicion: oferta.entrada.posicion } : null };
  }
  const actor = (ctx: ContextoApi) => ({ ahora: ctx.ahora(), usuarioId: ctx.usuario.id });

  r.post("/inscripciones/:id/cambiar-grupo", requierePermiso("inscripciones:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { grupo_id } = parsear(esquemaCambiarGrupo, req.body);
    // El grupo nuevo tiene que estar a la vista de quien lo cambia.
    const filtroGrupo = (await dondeInscripcionVisible(ctx))["grupo"];
    if (!(await ctx.db.grupo.findFirst({ where: { id: grupo_id, ...(filtroGrupo ? (filtroGrupo as Record<string, unknown>) : {}) }, select: { id: true } }))) throw noEncontrado("No se encontró el grupo");
    res.json(await cambiar(ctx, id, (tx) => cambiarDeGrupo(tx, actor(ctx), { inscripcionId: id, grupoNuevoId: grupo_id })));
  });

  r.post("/inscripciones/:id/congelar", requierePermiso("inscripciones:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    res.json(await cambiar(ctx, id, (tx) => congelarInscripcion(tx, actor(ctx), { inscripcionId: id })));
  });

  r.post("/inscripciones/:id/reactivar", requierePermiso("inscripciones:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    res.json(await cambiar(ctx, id, (tx) => reactivarInscripcion(tx, actor(ctx), { inscripcionId: id })));
  });

  r.post("/inscripciones/:id/baja", requierePermiso("inscripciones:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { motivo_baja_id } = parsear(esquemaBaja, req.body);
    res.json(await cambiar(ctx, id, (tx) => darDeBaja(tx, actor(ctx), { inscripcionId: id, motivoBajaId: motivo_baja_id })));
  });

  r.get("/inscripciones/:id/movimientos", requierePermiso("inscripciones:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await leer(ctx, id);
    const filas = await ctx.db.inscripcion_movimiento.findMany({
      where: { inscripcion_id: id },
      orderBy: [{ secuencia: "asc" }],
      select: { id: true, tipo: true, fecha: true, creado_en: true, grupo_anterior: { select: { id: true, nombre: true } }, grupo_nuevo: { select: { id: true, nombre: true } }, motivo_baja: { select: { id: true, codigo: true, nombre: true } }, usuario: { select: { id: true, nombre: true } } },
    });
    res.json({ datos: filas.map((m) => ({ id: m.id, tipo: m.tipo, fecha: m.fecha.toISOString().slice(0, 10), registrado_en: m.creado_en, grupo_anterior: m.grupo_anterior, grupo_nuevo: m.grupo_nuevo, ...(ctx.usuario.rol === "maestro" ? {} : { motivo_baja: m.motivo_baja, usuario: m.usuario }) })) });
  });

  return r;
}
