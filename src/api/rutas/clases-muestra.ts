// Clase muestra (D1): agendar, reprogramar y cancelar, para el asesor y el administrador; el maestro solo lee las de sus grupos.
//
//   GET  /api/clases-muestra?lead_id=&prospecto_id=&grupo_id=&sucursal_id=&estatus=&desde=&hasta=&limite=&pagina=   (clases_muestra:leer)
//   GET  /api/clases-muestra/sesiones?grupo_id=&maximo=&incluir_llenas=                                            (clases_muestra:leer)
//   GET  /api/clases-muestra/:id                                                                                   (clases_muestra:leer)
//   POST /api/clases-muestra            { prospecto_id, grupo_id, fecha_hora, notas? }                             (clases_muestra:escribir)
//   POST /api/clases-muestra/:id/reprogramar  { fecha_hora, grupo_id?, notas? }                                    (clases_muestra:escribir)
//   POST /api/clases-muestra/:id/cancelar     { motivo? }                                                          (clases_muestra:escribir)
//
// La fecha (`fecha_hora`, con zona: «2026-10-12T16:00:00-06:00») tiene que ser una sesión del grupo —día de la semana y hora de
// inicio de un `grupo_horario`, en la zona de la sucursal—, futura con la anticipación mínima de la configuración, y la sesión
// tiene que tener lugar (cupo − ocupados − clases muestra de esa fecha). Alcance: el asesor, por la sucursal del grupo (y su lead
// tiene que ser suyo); el maestro, los grupos de su instructor. Lo ajeno responde 404.

import { Router } from "express";
import express from "express";
import { marcarAsistencia, type MotivoDeRechazoDeAsistencia } from "../../clases-muestra/asistencia.ts";
import { agendarClaseMuestra, cancelarClaseMuestra, proximasSesionesConLugar, reprogramarClaseMuestra, type MotivoDeRechazo } from "../../clases-muestra/agenda.ts";
import { describirSesion } from "../../clases-muestra/sesiones.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { MENSAJE_SIN_SALUD, mencionaSalud } from "../../sensibles/index.ts";
import { booleanoDeTexto, enteroDeTexto, enumerado, instanteISO, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const ESTATUS = ["agendada", "asistio", "no_asistio", "reagendada", "cancelada"] as const;

export const SELECCION_CLASE = {
  id: true,
  lead_id: true,
  prospecto_id: true,
  grupo_id: true,
  fecha_hora: true,
  estatus: true,
  agendada_por: true,
  agendada_por_usuario_id: true,
  reprogramada_de_id: true,
  motivo_cancelacion: true,
  notas: true,
  asistencia_marcada_en: true,
  creado_en: true,
  grupo: { select: { nombre: true, instructor_id: true, programa: { select: { id: true, nombre: true, sucursal_id: true, sucursal: { select: { nombre: true, zona_horaria: true } } } } } },
  prospecto: { select: { nombre: true, edad_declarada: true } },
  lead: { select: { nombre_contacto: true, telefono: true } },
} as const;

export interface FilaClase {
  id: string;
  lead_id: string;
  prospecto_id: string;
  grupo_id: string;
  fecha_hora: Date;
  estatus: (typeof ESTATUS)[number];
  agendada_por: "bot" | "usuario";
  agendada_por_usuario_id: string | null;
  reprogramada_de_id: string | null;
  motivo_cancelacion: string | null;
  notas: string | null;
  asistencia_marcada_en: Date | null;
  creado_en: Date;
  grupo: { nombre: string; instructor_id: string | null; programa: { id: string; nombre: string; sucursal_id: string; sucursal: { nombre: string; zona_horaria: string } } };
  prospecto: { nombre: string | null; edad_declarada: number | null };
  lead: { nombre_contacto: string | null; telefono: string | null };
}

/** Lo que ve cada quien. El maestro no ve cómo contactar a la familia: solo al alumno, el grupo y la fecha. */
export const presentarClase = (f: FilaClase, rol: string) => {
  const zona = f.grupo.programa.sucursal.zona_horaria;
  return {
    id: f.id,
    lead_id: f.lead_id,
    prospecto_id: f.prospecto_id,
    prospecto: f.prospecto.nombre,
    edad_declarada: f.prospecto.edad_declarada,
    grupo_id: f.grupo_id,
    grupo: f.grupo.nombre,
    programa_id: f.grupo.programa.id,
    programa: f.grupo.programa.nombre,
    sucursal_id: f.grupo.programa.sucursal_id,
    sucursal: f.grupo.programa.sucursal.nombre,
    zona_horaria: zona,
    fecha_hora: f.fecha_hora,
    sesion: { fecha: describirSesion(f.fecha_hora, zona).fecha, hora: describirSesion(f.fecha_hora, zona).hora },
    estatus: f.estatus,
    agendada_por: f.agendada_por,
    reprogramada_de_id: f.reprogramada_de_id,
    motivo_cancelacion: f.motivo_cancelacion,
    notas: f.notas,
    asistencia_marcada_en: f.asistencia_marcada_en,
    creado_en: f.creado_en,
    ...(rol === "maestro" ? {} : { contacto: f.lead.nombre_contacto, telefono: f.lead.telefono }),
  };
};

const instantanea = (c: { lead_id: string; prospecto_id: string; grupo_id: string; fecha_hora: Date; estatus: string; agendada_por: string; reprogramada_de_id: string | null; motivo_cancelacion: string | null; asistencia_marcada_en?: Date | null }): Instantanea => ({
  lead_id: c.lead_id,
  prospecto_id: c.prospecto_id,
  grupo_id: c.grupo_id,
  fecha_hora: c.fecha_hora,
  estatus: c.estatus,
  agendada_por: c.agendada_por,
  reprogramada_de_id: c.reprogramada_de_id,
  asistencia_marcada_en: c.asistencia_marcada_en ?? null,
});

const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({
  ...esquemaPaginacion,
  lead_id: opcional(uuid()),
  prospecto_id: opcional(uuid()),
  grupo_id: opcional(uuid()),
  sucursal_id: opcional(uuid()),
  estatus: opcional(enumerado(ESTATUS)),
  desde: opcional(instanteISO()),
  hasta: opcional(instanteISO()),
});
const esquemaSesiones = objeto({ grupo_id: uuid(), maximo: opcional(enteroDeTexto({ min: 1, max: 30 })), incluir_llenas: opcional(booleanoDeTexto()) });
const esquemaAgendar = objeto({ prospecto_id: uuid(), grupo_id: uuid(), fecha_hora: instanteISO(), notas: opcional(texto({ max: 1000 })) });
const esquemaReprogramar = objeto({ fecha_hora: instanteISO(), grupo_id: opcional(uuid()), notas: opcional(texto({ max: 1000 })) });
const esquemaCancelar = objeto({ motivo: opcional(texto({ max: 300 })) });
const esquemaAsistencia = objeto({ estatus: enumerado(["asistio", "no_asistio"] as const) });

/** Condición de alcance sobre la clase: el maestro, sus grupos; los demás, la sucursal del programa del grupo. */
export async function alcanceDeClases(ctx: ContextoApi) {
  if (ctx.usuario.rol === "maestro") return { grupo: { instructor: { usuario_id: ctx.usuario.id, eliminado_en: null } } };
  const filtro = filtroDeSucursal(await ctx.alcance());
  return filtro ? { grupo: { programa: { sucursal_id: filtro } } } : {};
}

/** ED-03: el texto libre no es para datos de salud (decisión 12): un freno a lo evidente, no una garantía. */
function exigirSinSalud(campo: string, texto: string | null | undefined): void {
  if (typeof texto === "string" && mencionaSalud(texto)) throw validacion([{ campo, mensaje: MENSAJE_SIN_SALUD }]);
}

/** Convierte un rechazo de las reglas en el error de la convención de la API. */
export function errorDeRechazo(motivo: MotivoDeRechazo): never {
  switch (motivo) {
    case "prospecto_inexistente":
    case "grupo_inexistente":
      throw noEncontrado();
    case "clase_no_vigente":
      throw conflicto("La clase ya no está agendada");
    case "grupo_de_otra_vertical":
      throw validacion([{ campo: "grupo_id", mensaje: "El grupo es de otra vertical que la del prospecto" }]);
    case "no_es_sesion":
      throw validacion([{ campo: "fecha_hora", mensaje: "No es una sesión del grupo: tiene que ser el día de la semana y la hora de inicio de uno de sus horarios, en la zona horaria de la sucursal" }]);
    case "sin_anticipacion":
      throw validacion([{ campo: "fecha_hora", mensaje: "La clase tiene que empezar con la anticipación mínima que marca la configuración (o ya pasó)" }]);
    case "fuera_de_horizonte":
      throw validacion([{ campo: "fecha_hora", mensaje: "La fecha queda más lejos de lo que permite la configuración" }]);
    case "sin_lugar":
      throw conflicto("Esa sesión ya no tiene lugares");
    case "ya_tiene_clase":
      throw conflicto("El prospecto ya tiene una clase muestra vigente en ese grupo");
    case "misma_sesion":
      throw conflicto("La clase ya está en esa sesión");
  }
}

export function rutasDeClasesMuestra(deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  async function visible(ctx: ContextoApi, id: string) {
    return ctx.db.clase_muestra.findFirst({ where: { id, ...(await alcanceDeClases(ctx)) }, select: { id: true, grupo_id: true } });
  }

  const releer = async (ctx: ContextoApi, id: string) => presentarClase((await ctx.db.clase_muestra.findFirstOrThrow({ where: { id }, select: SELECCION_CLASE })) as FilaClase, ctx.usuario.rol);

  /** Un asesor solo agenda a leads que ve (los de sus sucursales) en grupos de sus sucursales. */
  async function prospectoVisible(ctx: ContextoApi, prospectoId: string): Promise<boolean> {
    const filtro = filtroDeSucursal(await ctx.alcance());
    return (await ctx.db.prospecto.findFirst({ where: { id: prospectoId, ...(filtro ? { lead: { sucursal_interes_id: filtro } } : {}) }, select: { id: true } })) !== null;
  }
  async function grupoVisible(ctx: ContextoApi, grupoId: string): Promise<boolean> {
    const filtro = filtroDeSucursal(await ctx.alcance());
    return (await ctx.db.grupo.findFirst({ where: { id: grupoId, ...(filtro ? { programa: { sucursal_id: filtro } } : {}) }, select: { id: true } })) !== null;
  }

  r.get("/clases-muestra", requierePermiso("clases_muestra:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const filtro = await alcanceDeClases(ctx);
    const propios = {
      ...(q.lead_id ? { lead_id: q.lead_id } : {}),
      ...(q.prospecto_id ? { prospecto_id: q.prospecto_id } : {}),
      ...(q.grupo_id ? { grupo_id: q.grupo_id } : {}),
      ...(q.estatus ? { estatus: q.estatus } : {}),
      ...(q.desde || q.hasta ? { fecha_hora: { ...(q.desde ? { gte: q.desde } : {}), ...(q.hasta ? { lte: q.hasta } : {}) } } : {}),
    };
    // `sucursal_id` se SUMA al alcance (AND): pedir una sucursal ajena da una lista vacía, nunca la deja ver.
    const donde = { AND: [filtro, propios, ...(q.sucursal_id ? [{ grupo: { programa: { sucursal_id: q.sucursal_id } } }] : [])] };
    res.json(
      await paginar(
        pag,
        () => ctx.db.clase_muestra.count({ where: donde }),
        async (saltar, tomar) =>
          (await ctx.db.clase_muestra.findMany({ where: donde, select: SELECCION_CLASE, orderBy: [{ fecha_hora: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map((f) => presentarClase(f as FilaClase, ctx.usuario.rol)),
      ),
    );
  });

  r.get("/clases-muestra/sesiones", requierePermiso("clases_muestra:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaSesiones, req.query);
    const filtro = await alcanceDeClases(ctx);
    // El mismo alcance que las clases: el maestro ve las sesiones de sus grupos; los demás, las de las sucursales que ven.
    const grupo = await ctx.db.grupo.findFirst({
      where: { id: q.grupo_id, ...("grupo" in filtro ? (filtro as { grupo: object }).grupo : {}) },
      select: { id: true, nombre: true, programa: { select: { sucursal: { select: { zona_horaria: true } } } } },
    });
    if (!grupo) throw noEncontrado();
    const zona = grupo.programa.sucursal.zona_horaria;
    const sesiones = await proximasSesionesConLugar(ctx.db, deps.fuenteOcupacion, grupo.id, ctx.ahora(), { maximo: q.maximo ?? 10, incluirLlenas: q.incluir_llenas ?? false });
    res.json({ datos: sesiones.map((s) => ({ fecha_hora: s.fechaHora, lugares: s.lugares, ...describirSesion(s.fechaHora, zona) })), grupo_id: grupo.id, grupo: grupo.nombre, zona_horaria: zona });
  });

  r.get("/clases-muestra/:id", requierePermiso("clases_muestra:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    if (!(await visible(ctx, id))) throw noEncontrado();
    res.json(await releer(ctx, id));
  });

  r.post("/clases-muestra", requierePermiso("clases_muestra:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const entrada = parsear(esquemaAgendar, req.body);
    exigirSinSalud("notas", entrada.notas);
    if (!(await prospectoVisible(ctx, entrada.prospecto_id))) throw noEncontrado();
    if (!(await grupoVisible(ctx, entrada.grupo_id))) throw noEncontrado();
    const resultado = await ctx.db.$transaction(async (tx) => {
      const r = await agendarClaseMuestra(tx, { ahora: ctx.ahora(), fuente: deps.fuenteOcupacion, origen: { tipo: "usuario", usuarioId: ctx.usuario.id } }, { prospectoId: entrada.prospecto_id, grupoId: entrada.grupo_id, fechaHora: entrada.fecha_hora, notas: entrada.notas ?? null });
      if (!r.ok) return r;
      const fila = await tx.clase_muestra.findFirstOrThrow({ where: { id: r.clase.id }, select: SELECCION_CLASE });
      await registrarCambio(tx, ctx, { entidad: "clase_muestra", entidadId: r.clase.id, accion: "crear", despues: instantanea(fila) });
      return r;
    });
    if (!resultado.ok) errorDeRechazo(resultado.motivo);
    res.status(201).json(await releer(ctx, resultado.clase.id));
  });

  r.post("/clases-muestra/:id/reprogramar", requierePermiso("clases_muestra:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const entrada = parsear(esquemaReprogramar, req.body);
    exigirSinSalud("notas", entrada.notas);
    if (!(await visible(ctx, id))) throw noEncontrado();
    if (entrada.grupo_id && !(await grupoVisible(ctx, entrada.grupo_id))) throw noEncontrado();
    const resultado = await ctx.db.$transaction(async (tx) => {
      const antes = await tx.clase_muestra.findFirst({ where: { id }, select: SELECCION_CLASE });
      const r = await reprogramarClaseMuestra(tx, { ahora: ctx.ahora(), fuente: deps.fuenteOcupacion, origen: { tipo: "usuario", usuarioId: ctx.usuario.id } }, { claseId: id, fechaHora: entrada.fecha_hora, ...(entrada.grupo_id ? { grupoId: entrada.grupo_id } : {}), notas: entrada.notas ?? null });
      if (!r.ok || !antes) return r;
      const nueva = await tx.clase_muestra.findFirstOrThrow({ where: { id: r.clase.id }, select: SELECCION_CLASE });
      const vieja = await tx.clase_muestra.findFirstOrThrow({ where: { id }, select: SELECCION_CLASE });
      await registrarCambio(tx, ctx, { entidad: "clase_muestra", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(vieja) });
      await registrarCambio(tx, ctx, { entidad: "clase_muestra", entidadId: r.clase.id, accion: "crear", despues: instantanea(nueva) });
      return r;
    });
    if (!resultado.ok) errorDeRechazo(resultado.motivo);
    res.status(201).json(await releer(ctx, resultado.clase.id));
  });

  r.post("/clases-muestra/:id/cancelar", requierePermiso("clases_muestra:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { motivo } = parsear(esquemaCancelar, req.body ?? {});
    exigirSinSalud("motivo", motivo);
    if (!(await visible(ctx, id))) throw noEncontrado();
    const resultado = await ctx.db.$transaction(async (tx) => {
      const antes = await tx.clase_muestra.findFirst({ where: { id }, select: SELECCION_CLASE });
      const r = await cancelarClaseMuestra(tx, id, motivo ?? null, ctx.ahora());
      if (!r.ok || !antes) return r;
      const despues = await tx.clase_muestra.findFirstOrThrow({ where: { id }, select: SELECCION_CLASE });
      await registrarCambio(tx, ctx, { entidad: "clase_muestra", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
      return r;
    });
    if (!resultado.ok) errorDeRechazo(resultado.motivo);
    res.json(await releer(ctx, id));
  });

  r.patch("/clases-muestra/:id/asistencia", requierePermiso("clases_muestra:asistencia"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { estatus } = parsear(esquemaAsistencia, req.body);
    if (!(await visible(ctx, id))) throw noEncontrado();
    const resultado = await ctx.db.$transaction(async (tx) => {
      const antes = await tx.clase_muestra.findFirst({ where: { id }, select: SELECCION_CLASE });
      const r = await marcarAsistencia(tx, { claseId: id, estatus, usuarioId: ctx.usuario.id, ahora: ctx.ahora() });
      if (!r.ok || !r.cambio || !antes) return r;
      const despues = await tx.clase_muestra.findFirstOrThrow({ where: { id }, select: SELECCION_CLASE });
      await registrarCambio(tx, ctx, { entidad: "clase_muestra", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
      return r;
    });
    if (!resultado.ok) errorDeAsistencia(resultado.motivo);
    res.json(await releer(ctx, id));
  });

  return r;
}

/** Convierte un rechazo de la asistencia en el error de la convención de la API. */
export function errorDeAsistencia(motivo: MotivoDeRechazoDeAsistencia): never {
  switch (motivo) {
    case "clase_inexistente":
      throw noEncontrado();
    case "aun_no_empieza":
      throw conflicto("La clase todavía no empieza: la asistencia se marca desde la hora de la clase");
    case "no_se_puede_marcar":
      throw conflicto("La clase está cancelada o reagendada: ya no se le marca asistencia");
    case "fuera_de_la_ventana_de_correccion":
      throw conflicto("Ya pasó el tiempo para corregir la asistencia de esta clase");
    case "cambio_concurrente":
      throw conflicto("Otra persona marcó la asistencia de esta clase al mismo tiempo; revísala");
  }
}
