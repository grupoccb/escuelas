// Registro de la clase muestra (D5): lo que el maestro (o el asesor, o el administrador) captura de una clase, 1:1 con ella.
//
//   alumno          nombre completo, fecha de nacimiento del acta, sexo, escuela y turno, talla         → columnas
//   tutores         una fila `registro_tutor` por adulto (quien lo lleva, quien paga, quien puede recoger) → filas
//   salud           contacto de emergencia (distinto de los tutores), alergias, condiciones, medicamentos
//                   y autorización de atención médica de urgencia                                       → SOLO `guardarSensible()`
//                   (src/sensibles/registro-salud.ts); aquí no hay ni un valor, solo si ya están
//   antecedentes    si practicó antes, dónde y qué nivel; el motivo por el que buscan la clase           → columnas
//   observación     asistió o no (es `clase_muestra.estatus`: una sola fuente), nivel observado, grupo recomendado,
//                   interés percibido y notas libres SIN salud                                          → columnas
//
// ESTRUCTURA PARA NO RECAPTURAR (invariante 13): F2 convierte el registro en `tutor`, `alumno` y `tutor_alumno` leyendo estas
// columnas y filas tal cual (`registroDeProspectoParaConversion`); nada de lo que el maestro tecleó se vuelve a pedir.
//
// Estados: `borrador` (se guarda a medias) → `completo` (acción explícita, solo si no falta nada) → `cerrado` (acción explícita;
// bloquea ediciones; solo un administrador lo reabre). Editar un registro completo al que le queda algo sin responder lo regresa a
// borrador. Escribir es serializado por un candado de la clase: dos capturas simultáneas se mezclan, no se pisan.
//
// Todo lo que cambia deja una fila en `registro_cambio` con SOLO campos no identificables (estatus, motivo, interés, banderas y
// QUÉ SECCIONES se tocaron): el registro de cambios es de solo anexar y nunca se purga, así que no guarda nombres, fechas de
// nacimiento, teléfonos ni nada de salud.

import { ErrorApi, conflicto, noEncontrado, prohibido, validacion, type DetalleDeError } from "../api/errores.ts";
import type { ContextoApi } from "../api/contexto.ts";
import { registrarCambio } from "../api/registro.ts";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import { bloquearLead } from "../embudo/etapas.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import { fechaLocal } from "../lib/horario.ts";
import {
  ErrorAccesoSensible,
  contactoDeEntradaEsTutor,
  contactoGuardadoEsTutor,
  ERROR_CONTACTO_ES_TUTOR,
  estadoDeSalud,
  guardarSaludDelRegistro,
  leerEntradaDeSalud,
  MENSAJE_SIN_SALUD,
  mencionaSalud,
  puedeEscribirSalud,
  rechazarEscrituraDeSalud,
  type EstadoDeSalud,
  type OpcionesSensibles,
  type PersonaDelRegistro,
} from "../sensibles/index.ts";
import { problemasDeReglamento } from "../legal/aceptaciones.ts";
import { marcarAsistencia, type MotivoDeRechazoDeAsistencia } from "./asistencia.ts";
import { faltantesDelRegistro, normalizarTutores, problemaDeFechaDeNacimiento, problemasDeAntecedentes, type Problema, type TutorEntrada, type TutorNormalizado } from "./registro-reglas.ts";

export type EstatusRegistro = "borrador" | "completo" | "cerrado";
export type Sexo = "femenino" | "masculino" | "otro";
export type TurnoEscolar = "matutino" | "vespertino" | "jornada_completa";
export type MotivoClase = "disciplina" | "condicion_fisica" | "socializacion" | "competencia" | "otro";
export type Interes = "alto" | "medio" | "bajo";

export const SEXOS = ["femenino", "masculino", "otro"] as const;
export const TURNOS_ESCOLARES = ["matutino", "vespertino", "jornada_completa"] as const;
/** El catálogo de motivos por los que buscan la clase (contexto, sección 8). Es un enum de la base. */
export const MOTIVOS_DE_CLASE = ["disciplina", "condicion_fisica", "socializacion", "competencia", "otro"] as const;
export const INTERESES = ["alto", "medio", "bajo"] as const;

/** Una sección con campos opcionales; `null` borra el valor. */
export interface EntradaDelRegistro {
  alumno?: { nombre?: string | null; apellidos?: string | null; fecha_nacimiento?: string | null; sexo?: Sexo | null; escuela?: string | null; turno_escolar?: TurnoEscolar | null; talla_uniforme?: string | null };
  /** La lista COMPLETA de adultos (reemplaza a la anterior; con `id` se conserva la fila). Omitida = sin cambios. */
  tutores?: TutorEntrada[];
  /** Objeto opaco: lo valida y lo guarda src/sensibles/ (este archivo no nombra los campos de salud). */
  salud?: unknown;
  antecedentes?: { practico_antes?: boolean | null; practico_donde?: string | null; practico_nivel?: string | null; motivo_clase?: MotivoClase | null; motivo_clase_detalle?: string | null };
  observacion?: { asistio?: boolean; nivel_observado?: string | null; grupo_recomendado_id?: string | null; interes_percibido?: Interes | null; notas?: string | null };
}

export interface DepsRegistro {
  sensibles: OpcionesSensibles;
  /** Ruta que queda en el registro de accesos a salud. */
  ruta: string;
}

const actorDe = (ctx: ContextoApi) => ({ usuarioId: ctx.usuario.id, organizacionId: ctx.organizacionId, rol: ctx.usuario.rol });
const claveDeCandado = (claseId: string): string => `registro_muestra:${claseId}`;
const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

// ── Lectura ────────────────────────────────────────────────────────────────────────────────────────────

const SELECCION_REGISTRO = {
  id: true,
  clase_muestra_id: true,
  prospecto_id: true,
  lead_id: true,
  estatus: true,
  alumno_nombre: true,
  alumno_apellidos: true,
  alumno_fecha_nacimiento: true,
  alumno_sexo: true,
  escuela_nombre: true,
  escuela_turno: true,
  talla_uniforme: true,
  practico_antes: true,
  practico_donde: true,
  practico_nivel: true,
  motivo_clase: true,
  motivo_clase_detalle: true,
  nivel_observado: true,
  grupo_recomendado_id: true,
  interes_percibido: true,
  notas_maestro: true,
  salud_contacto_registrado: true,
  salud_completa: true,
  completo_en: true,
  cerrado_en: true,
  cerrado_por_usuario_id: true,
  creado_por_usuario_id: true,
  creado_en: true,
  actualizado_en: true,
} as const;

type FilaRegistro = NonNullable<Awaited<ReturnType<Consultas["registro_clase_muestra"]["findFirst"]>>> & { alumno_fecha_nacimiento: Date | null };
const SELECCION_TUTOR = { id: true, posicion: true, nombre: true, apellidos: true, parentesco: true, telefono: true, correo: true, es_responsable_pago: true, lo_lleva: true, puede_recoger: true } as const;
type FilaTutor = { id: string; posicion: number; nombre: string; apellidos: string | null; parentesco: string; telefono: string; correo: string | null; es_responsable_pago: boolean; lo_lleva: boolean; puede_recoger: boolean };

async function cargarRegistro(tx: Consultas | BaseDatos, claseId: string): Promise<{ registro: FilaRegistro; tutores: FilaTutor[] } | null> {
  const registro = (await tx.registro_clase_muestra.findFirst({ where: { clase_muestra_id: claseId }, select: SELECCION_REGISTRO })) as FilaRegistro | null;
  if (!registro) return null;
  const tutores = (await tx.registro_tutor.findMany({ where: { registro_id: registro.id }, select: SELECCION_TUTOR, orderBy: [{ posicion: "asc" }, { id: "asc" }] })) as FilaTutor[];
  return { registro, tutores };
}

const comoPersonas = (t: readonly { nombre: string; apellidos: string | null; telefono: string }[]): PersonaDelRegistro[] =>
  t.map((x) => ({ nombre: [x.nombre, x.apellidos].filter(Boolean).join(" "), telefono: x.telefono }));

function datosParaFaltantes(r: FilaRegistro | null, tutores: readonly FilaTutor[], salud: EstadoDeSalud) {
  return {
    alumno_nombre: r?.alumno_nombre ?? null,
    alumno_apellidos: r?.alumno_apellidos ?? null,
    alumno_fecha_nacimiento: iso(r?.alumno_fecha_nacimiento ?? null),
    alumno_sexo: r?.alumno_sexo ?? null,
    practico_antes: r?.practico_antes ?? null,
    motivo_clase: r?.motivo_clase ?? null,
    tutores,
    saludFaltantes: salud.faltantes,
  };
}

export interface RegistroPresentado {
  existe: boolean;
  id: string | null;
  clase_muestra_id: string;
  prospecto_id: string;
  lead_id: string;
  clase: { estatus: string; fecha_hora: Date };
  estatus: EstatusRegistro | "sin_captura";
  alumno: { nombre: string | null; apellidos: string | null; fecha_nacimiento: string | null; sexo: string | null; escuela: string | null; turno_escolar: string | null; talla_uniforme: string | null };
  tutores: Omit<FilaTutor, "posicion">[];
  antecedentes: { practico_antes: boolean | null; practico_donde: string | null; practico_nivel: string | null; motivo_clase: string | null; motivo_clase_detalle: string | null };
  observacion: { asistio: boolean | null; nivel_observado: string | null; grupo_recomendado_id: string | null; interes_percibido: string | null; notas: string | null };
  /** Sin valores: si hay contacto, si está completa y qué falta. Los valores se leen con `GET /api/salud/prospecto/:id` (permiso `salud:leer`, motivo y constancia). */
  salud: { contacto_registrado: boolean; completa: boolean; faltantes: string[]; puedes_ver_valores: boolean };
  faltantes: string[];
  completo_en: Date | null;
  cerrado_en: Date | null;
  creado_en: Date | null;
  actualizado_en: Date | null;
}

/** La clase con lo que el registro necesita. null = no existe (o es de otra organización: el scope la oculta). */
async function cargarClase(tx: Consultas | BaseDatos, claseId: string) {
  return tx.clase_muestra.findFirst({
    where: { id: claseId },
    select: {
      id: true,
      estatus: true,
      fecha_hora: true,
      lead_id: true,
      prospecto_id: true,
      grupo: { select: { id: true, programa: { select: { vertical_id: true, sucursal: { select: { zona_horaria: true } } } } } },
      prospecto: { select: { vertical_interes_id: true } },
    },
  });
}

/** El registro de una clase (o el esqueleto «sin captura»). La visibilidad de la clase la comprueba quien llama. */
export async function leerRegistro(ctx: ContextoApi, claseId: string): Promise<RegistroPresentado> {
  const clase = await cargarClase(ctx.db, claseId);
  if (!clase) throw noEncontrado();
  const cargado = await cargarRegistro(ctx.db, claseId);
  const salud = await estadoDeSalud(ctx.db, clase.prospecto_id);
  const r = cargado?.registro ?? null;
  const tutores = cargado?.tutores ?? [];
  return {
    existe: r !== null,
    id: r?.id ?? null,
    clase_muestra_id: clase.id,
    prospecto_id: clase.prospecto_id,
    lead_id: clase.lead_id,
    clase: { estatus: clase.estatus, fecha_hora: clase.fecha_hora },
    estatus: r?.estatus ?? "sin_captura",
    alumno: { nombre: r?.alumno_nombre ?? null, apellidos: r?.alumno_apellidos ?? null, fecha_nacimiento: iso(r?.alumno_fecha_nacimiento ?? null), sexo: r?.alumno_sexo ?? null, escuela: r?.escuela_nombre ?? null, turno_escolar: r?.escuela_turno ?? null, talla_uniforme: r?.talla_uniforme ?? null },
    tutores: tutores.map(({ posicion: _p, ...t }) => t),
    antecedentes: { practico_antes: r?.practico_antes ?? null, practico_donde: r?.practico_donde ?? null, practico_nivel: r?.practico_nivel ?? null, motivo_clase: r?.motivo_clase ?? null, motivo_clase_detalle: r?.motivo_clase_detalle ?? null },
    observacion: {
      asistio: clase.estatus === "asistio" ? true : clase.estatus === "no_asistio" ? false : null,
      nivel_observado: r?.nivel_observado ?? null,
      grupo_recomendado_id: r?.grupo_recomendado_id ?? null,
      interes_percibido: r?.interes_percibido ?? null,
      notas: r?.notas_maestro ?? null,
    },
    salud: { contacto_registrado: salud.contactoRegistrado, completa: salud.completa, faltantes: salud.faltantes.map((c) => `salud.${c}`), puedes_ver_valores: ctx.usuario.rol === "administrador" || ctx.usuario.rol === "maestro" },
    faltantes: faltantesDelRegistro(datosParaFaltantes(r, tutores, salud)),
    completo_en: r?.completo_en ?? null,
    cerrado_en: r?.cerrado_en ?? null,
    creado_en: r?.creado_en ?? null,
    actualizado_en: r?.actualizado_en ?? null,
  };
}

// ── Escritura ──────────────────────────────────────────────────────────────────────────────────────────

const instantaneaDe = (r: { estatus: string; motivo_clase: string | null; practico_antes: boolean | null; interes_percibido: string | null; grupo_recomendado_id: string | null; salud_completa: boolean } | null) =>
  r
    ? { estatus: r.estatus, motivo_clase: r.motivo_clase, practico_antes: r.practico_antes, interes_percibido: r.interes_percibido, grupo_recomendado_id: r.grupo_recomendado_id, salud_completa: r.salud_completa }
    : null;

function lanzarSiHay(problemas: readonly Problema[]): void {
  if (problemas.length > 0) throw validacion(problemas.map((p): DetalleDeError => ({ campo: p.campo, mensaje: p.mensaje })));
}

function errorDeAsistencia(motivo: MotivoDeRechazoDeAsistencia): ErrorApi {
  switch (motivo) {
    case "clase_inexistente":
      return noEncontrado();
    case "aun_no_empieza":
      return conflicto("La clase todavía no empieza: la asistencia se marca desde la hora de la clase");
    case "no_se_puede_marcar":
      return conflicto("La clase está cancelada o reagendada: ya no se le marca asistencia");
    case "fuera_de_la_ventana_de_correccion":
      return conflicto("Ya pasó el tiempo para corregir la asistencia de esta clase");
    case "cambio_concurrente":
      return conflicto("Otra persona marcó la asistencia de esta clase al mismo tiempo; revísala");
  }
}

/** Las secciones que trae la entrada (para el registro de cambios y para saber qué se tocó). */
const seccionesDe = (e: EntradaDelRegistro): string[] => (["alumno", "tutores", "salud", "antecedentes", "observacion"] as const).filter((s) => e[s] !== undefined);

/**
 * Guarda (parcialmente) el registro de una clase: crea el registro si no existe. Valida TODO antes de escribir. La clase debe estar
 * vigente (agendada, asistió o no asistió). Lanza `ErrorApi`: 400 validación, 403 sin permiso de salud, 404, 409 cerrado o no vigente.
 */
export async function guardarRegistro(ctx: ContextoApi, deps: DepsRegistro, claseId: string, entrada: EntradaDelRegistro): Promise<RegistroPresentado> {
  const clase = await cargarClase(ctx.db, claseId);
  if (!clase) throw noEncontrado();
  if (clase.estatus === "cancelada" || clase.estatus === "reagendada") throw conflicto("La clase ya no está vigente: el registro se captura en la clase que la reemplazó");
  const actor = actorDe(ctx);
  const secciones = seccionesDe(entrada);
  if (secciones.length === 0) throw validacion([{ mensaje: "No hay ningún dato que guardar" }]);

  // 1. Permiso de la sección de salud, ANTES de tocar nada: el asesor puede capturar lo demás pero no la salud (decisión 12).
  if (entrada.salud !== undefined && !puedeEscribirSalud(actor)) {
    await rechazarEscrituraDeSalud(ctx.db, actor, { prospectoId: clase.prospecto_id, ruta: deps.ruta });
    throw prohibido("Tu rol no captura datos de salud: guarda lo demás y pídele al maestro o al administrador esa sección");
  }
  const salud = entrada.salud !== undefined ? leerEntradaDeSalud(entrada.salud) : null;

  // 2. Validación del contenido (sin escribir nada).
  const problemas: Problema[] = [];
  const previo = await cargarRegistro(ctx.db, claseId);
  if (previo?.registro.estatus === "cerrado") throw conflicto("El registro está cerrado: un administrador puede reabrirlo");
  const hoy = fechaLocal(ctx.ahora(), clase.grupo.programa.sucursal.zona_horaria);
  const fn = entrada.alumno?.fecha_nacimiento;
  if (typeof fn === "string") {
    const p = problemaDeFechaDeNacimiento(fn, hoy);
    if (p) problemas.push({ campo: "alumno.fecha_nacimiento", mensaje: p });
  }
  const notas = entrada.observacion?.notas;
  if (typeof notas === "string" && mencionaSalud(notas)) problemas.push({ campo: "observacion.notas", mensaje: MENSAJE_SIN_SALUD });
  for (const campo of ["nivel_observado"] as const) {
    const v = entrada.observacion?.[campo];
    if (typeof v === "string" && mencionaSalud(v)) problemas.push({ campo: `observacion.${campo}`, mensaje: MENSAJE_SIN_SALUD });
  }
  // ED-03: los demás textos narrativos tampoco son para salud (los nombres, la escuela y la talla no se filtran: un falso positivo bloquearía una inscripción).
  for (const campo of ["practico_donde", "practico_nivel", "motivo_clase_detalle"] as const) {
    const v = entrada.antecedentes?.[campo];
    if (typeof v === "string" && mencionaSalud(v)) problemas.push({ campo: `antecedentes.${campo}`, mensaje: MENSAJE_SIN_SALUD });
  }
  const antes = previo?.registro;
  const antecedentes = {
    practico_antes: entrada.antecedentes?.practico_antes !== undefined ? entrada.antecedentes.practico_antes : (antes?.practico_antes ?? null),
    practico_donde: entrada.antecedentes?.practico_donde !== undefined ? entrada.antecedentes.practico_donde : (antes?.practico_donde ?? null),
    practico_nivel: entrada.antecedentes?.practico_nivel !== undefined ? entrada.antecedentes.practico_nivel : (antes?.practico_nivel ?? null),
    motivo_clase: entrada.antecedentes?.motivo_clase !== undefined ? entrada.antecedentes.motivo_clase : (antes?.motivo_clase ?? null),
    motivo_clase_detalle: entrada.antecedentes?.motivo_clase_detalle !== undefined ? entrada.antecedentes.motivo_clase_detalle : (antes?.motivo_clase_detalle ?? null),
  };
  // Si ahora dice que no ha practicado, lo que quedara de «dónde» y «nivel» se limpia solo cuando él mismo lo manda; si no, es un error claro.
  problemas.push(...problemasDeAntecedentes(antecedentes));
  const grupoRecomendado = entrada.observacion?.grupo_recomendado_id;
  if (typeof grupoRecomendado === "string") {
    const g = await ctx.db.grupo.findFirst({ where: { id: grupoRecomendado, activo: true }, select: { programa: { select: { vertical_id: true } } } });
    if (!g) problemas.push({ campo: "observacion.grupo_recomendado_id", mensaje: "No es un grupo activo de la organización" });
    else if (g.programa.vertical_id !== clase.prospecto.vertical_interes_id) problemas.push({ campo: "observacion.grupo_recomendado_id", mensaje: "El grupo es de otra vertical que la del alumno" });
  }
  let tutoresNuevos: TutorNormalizado[] | null = null;
  if (entrada.tutores !== undefined) {
    const n = normalizarTutores(entrada.tutores);
    problemas.push(...n.problemas);
    tutoresNuevos = n.tutores;
    const ajenos = n.tutores.filter((t) => t.id !== undefined && !(previo?.tutores ?? []).some((v) => v.id === t.id));
    for (const t of ajenos) problemas.push({ campo: `tutores[${n.tutores.indexOf(t)}].id`, mensaje: "No es un adulto de este registro" });
  }
  lanzarSiHay(problemas);

  // 3. El contacto de emergencia no puede ser un tutor: con la lista que quedará (la nueva o la actual).
  const quedan = tutoresNuevos ?? previo?.tutores ?? [];
  if (salud && contactoDeEntradaEsTutor(salud, comoPersonas(quedan))) throw validacion([ERROR_CONTACTO_ES_TUTOR]);
  if (!salud && tutoresNuevos && (previo?.registro.salud_contacto_registrado ?? false) && (await contactoGuardadoEsTutor(ctx.db, actor, { prospectoId: clase.prospecto_id, ruta: deps.ruta }, comoPersonas(tutoresNuevos), deps.sensibles))) {
    throw validacion([{ campo: "tutores", mensaje: "Uno de los adultos es el contacto de emergencia: el contacto de emergencia debe ser una persona distinta de los tutores" }]);
  }

  // 4. Escribir, serializado por la clase: dos capturas simultáneas se mezclan.
  await transaccionConBloqueo(ctx.db, ctx.organizacionId, claveDeCandado(claseId), async (tx) => {
    // ED-16: la clase se leyó ANTES de abrir esta transacción; si alguien la reprogramó o la canceló en el hueco, el registro no se crea en la clase que ya no
    // está vigente. Orden de candados de la casa: lead → clase (reprogramar toma el lead primero), y entonces se vuelve a leer.
    await bloquearLead(tx, clase.lead_id);
    const vigente = await tx.clase_muestra.findFirst({ where: { id: claseId }, select: { estatus: true } });
    if (!vigente || vigente.estatus === "cancelada" || vigente.estatus === "reagendada") throw conflicto("La clase ya no está vigente: el registro se captura en la clase que la reemplazó");
    const actual = await cargarRegistro(tx, claseId);
    if (actual?.registro.estatus === "cerrado") throw conflicto("El registro está cerrado: un administrador puede reabrirlo");
    const datos: Record<string, unknown> = {};
    const a = entrada.alumno;
    if (a) {
      if (a.nombre !== undefined) datos["alumno_nombre"] = a.nombre;
      if (a.apellidos !== undefined) datos["alumno_apellidos"] = a.apellidos;
      if (a.fecha_nacimiento !== undefined) datos["alumno_fecha_nacimiento"] = a.fecha_nacimiento === null ? null : new Date(`${a.fecha_nacimiento}T00:00:00.000Z`);
      if (a.sexo !== undefined) datos["alumno_sexo"] = a.sexo;
      if (a.escuela !== undefined) datos["escuela_nombre"] = a.escuela;
      if (a.turno_escolar !== undefined) datos["escuela_turno"] = a.turno_escolar;
      if (a.talla_uniforme !== undefined) datos["talla_uniforme"] = a.talla_uniforme;
    }
    for (const k of ["practico_antes", "practico_donde", "practico_nivel", "motivo_clase", "motivo_clase_detalle"] as const) {
      const v = entrada.antecedentes?.[k];
      if (v !== undefined) datos[k] = v;
    }
    // Si el motivo deja de ser «otro», el detalle no sobrevive.
    if (entrada.antecedentes?.motivo_clase !== undefined && entrada.antecedentes.motivo_clase !== "otro" && entrada.antecedentes.motivo_clase_detalle === undefined) datos["motivo_clase_detalle"] = null;
    const o = entrada.observacion;
    if (o) {
      if (o.nivel_observado !== undefined) datos["nivel_observado"] = o.nivel_observado;
      if (o.grupo_recomendado_id !== undefined) datos["grupo_recomendado_id"] = o.grupo_recomendado_id;
      if (o.interes_percibido !== undefined) datos["interes_percibido"] = o.interes_percibido;
      if (o.notas !== undefined) datos["notas_maestro"] = o.notas;
    }

    let registroId: string;
    const salud0 = await estadoDeSalud(ctx.db, clase.prospecto_id);
    if (actual) {
      registroId = actual.registro.id;
      if (Object.keys(datos).length > 0) await tx.registro_clase_muestra.update({ where: { id: registroId }, data: datos });
    } else {
      const creado = await tx.registro_clase_muestra.create({
        data: altaConAlcance({ clase_muestra_id: claseId, prospecto_id: clase.prospecto_id, lead_id: clase.lead_id, creado_por_usuario_id: ctx.usuario.id, salud_contacto_registrado: salud0.contactoRegistrado, salud_completa: salud0.completa, ...datos }),
        select: { id: true },
      });
      registroId = creado.id;
    }

    if (tutoresNuevos) await reemplazarTutores(tx, registroId, tutoresNuevos);

    // Asistió o no: es el estatus de la clase (una sola fuente), con las reglas de D4.
    if (o?.asistio !== undefined) {
      const antesClase = clase.estatus;
      const r = await marcarAsistencia(tx, { claseId, estatus: o.asistio ? "asistio" : "no_asistio", usuarioId: ctx.usuario.id, ahora: ctx.ahora() });
      if (!r.ok) throw errorDeAsistencia(r.motivo);
      if (r.cambio) await registrarCambio(tx, ctx, { entidad: "clase_muestra", entidadId: claseId, accion: "actualizar", antes: { estatus: antesClase }, despues: { estatus: r.estatus } });
    }

    // Un registro completo al que ahora le falta algo vuelve a borrador.
    const despues = (await cargarRegistro(tx, claseId))!;
    const faltantes = faltantesDelRegistro(datosParaFaltantes(despues.registro, despues.tutores, salud0));
    let registroFinal = despues.registro;
    if (despues.registro.estatus === "completo" && faltantes.length > 0) {
      await tx.registro_clase_muestra.update({ where: { id: registroId }, data: { estatus: "borrador", completo_en: null } });
      registroFinal = { ...despues.registro, estatus: "borrador", completo_en: null };
    }
    await registrarCambio(tx, ctx, {
      entidad: "registro_clase_muestra",
      entidadId: registroId,
      accion: actual ? "actualizar" : "crear",
      antes: instantaneaDe(actual?.registro ?? null),
      despues: { ...instantaneaDe(registroFinal), secciones },
    });
  });

  // 5. La salud, con guardarSensible() y fuera de la transacción (tiene su propia, con su candado). Luego se actualizan las banderas.
  if (salud) {
    try {
      await guardarSaludDelRegistro(ctx.db, actor, { prospectoId: clase.prospecto_id, ruta: deps.ruta, entrada: salud }, deps.sensibles);
    } catch (e) {
      if (e instanceof ErrorAccesoSensible) throw e.motivo === "sin_permiso" ? prohibido() : noEncontrado();
      throw e;
    }
  }
  await sincronizarBanderasDeSalud(ctx, claseId, clase.prospecto_id);
  return leerRegistro(ctx, claseId);
}

/** Reemplaza el conjunto de adultos: lo que no viene se da de baja (soft delete), lo que trae `id` se actualiza y lo demás se crea. */
async function reemplazarTutores(tx: Consultas, registroId: string, nuevos: readonly TutorNormalizado[]): Promise<void> {
  const vivos = await tx.registro_tutor.findMany({ where: { registro_id: registroId }, select: { id: true } });
  const mantenidos = new Set(nuevos.filter((t) => t.id !== undefined).map((t) => t.id!));
  const sobran = vivos.filter((v) => !mantenidos.has(v.id)).map((v) => v.id);
  if (sobran.length > 0) await tx.registro_tutor.updateMany({ where: { id: { in: sobran } }, data: { eliminado_en: new Date() } });
  // Antes de reasignar banderas (a lo más un responsable y uno que lo lleva): se limpian las de los que se conservan.
  if (mantenidos.size > 0) await tx.registro_tutor.updateMany({ where: { id: { in: [...mantenidos] } }, data: { es_responsable_pago: false, lo_lleva: false } });
  try {
    for (const [posicion, t] of nuevos.entries()) {
      const { id, ...campos } = t;
      if (id !== undefined) await tx.registro_tutor.update({ where: { id }, data: { posicion, ...campos } });
      else await tx.registro_tutor.create({ data: altaConAlcance({ registro_id: registroId, posicion, ...campos }) });
    }
  } catch (e) {
    if (esViolacionUnica(e)) throw conflicto("Dos adultos del registro chocan (mismo teléfono o más de un responsable de pago); revisa la lista");
    throw e;
  }
}

/** Pone en el registro las banderas de presencia de la ficha de salud (sin valores) y, si ya no está completa, regresa a borrador. */
async function sincronizarBanderasDeSalud(ctx: ContextoApi, claseId: string, prospectoId: string): Promise<void> {
  const estado = await estadoDeSalud(ctx.db, prospectoId);
  await transaccionConBloqueo(ctx.db, ctx.organizacionId, claveDeCandado(claseId), async (tx) => {
    const c = await cargarRegistro(tx, claseId);
    if (!c) return;
    const r = c.registro;
    const cambia = r.salud_completa !== estado.completa || r.salud_contacto_registrado !== estado.contactoRegistrado;
    const regresa = r.estatus === "completo" && !estado.completa;
    if (!cambia && !regresa) return;
    await tx.registro_clase_muestra.update({
      where: { id: r.id },
      data: { salud_completa: estado.completa, salud_contacto_registrado: estado.contactoRegistrado, ...(regresa ? { estatus: "borrador" as const, completo_en: null } : {}) },
    });
    await registrarCambio(tx, ctx, {
      entidad: "registro_clase_muestra",
      entidadId: r.id,
      accion: "actualizar",
      antes: instantaneaDe(r),
      despues: { ...instantaneaDe({ ...r, estatus: regresa ? "borrador" : r.estatus, salud_completa: estado.completa }), secciones: ["salud"] },
    });
  });
}

// ── Completar, cerrar, reabrir ─────────────────────────────────────────────────────────────────────────

/** `borrador` → `completo`. 409 con la lista de lo que falta si no está todo. Idempotente si ya está completo. */
export async function completarRegistro(ctx: ContextoApi, deps: DepsRegistro, claseId: string): Promise<RegistroPresentado> {
  const clase = await cargarClase(ctx.db, claseId);
  if (!clase) throw noEncontrado();
  await sincronizarBanderasDeSalud(ctx, claseId, clase.prospecto_id);
  await transaccionConBloqueo(ctx.db, ctx.organizacionId, claveDeCandado(claseId), async (tx) => {
    const c = await cargarRegistro(tx, claseId);
    if (!c) throw conflicto("Todavía no hay nada capturado en este registro", [{ campo: "alumno.nombre", mensaje: "Falta" }]);
    if (c.registro.estatus !== "borrador") return; // completo (idempotente) o cerrado
    const salud = await estadoDeSalud(ctx.db, clase.prospecto_id);
    const faltantes = faltantesDelRegistro(datosParaFaltantes(c.registro, c.tutores, salud));
    if (faltantes.length > 0) throw conflicto("Al registro todavía le falta información para estar completo", faltantes.map((campo) => ({ campo, mensaje: "Falta" })));
    // El contacto de emergencia sigue siendo una persona distinta de los tutores (cambiaron los tutores después de capturarlo).
    if (salud.contactoRegistrado && (await contactoGuardadoEsTutor(ctx.db, actorDe(ctx), { prospectoId: clase.prospecto_id, ruta: deps.ruta }, comoPersonas(c.tutores), deps.sensibles))) {
      throw conflicto("Uno de los adultos del registro es el contacto de emergencia", [ERROR_CONTACTO_ES_TUTOR]);
    }
    const ahora = ctx.ahora();
    await tx.registro_clase_muestra.update({ where: { id: c.registro.id }, data: { estatus: "completo", completo_en: ahora } });
    await registrarCambio(tx, ctx, { entidad: "registro_clase_muestra", entidadId: c.registro.id, accion: "actualizar", antes: instantaneaDe(c.registro), despues: instantaneaDe({ ...c.registro, estatus: "completo" }) });
  });
  return leerRegistro(ctx, claseId);
}

/** `completo` → `cerrado`. Exige estar completo, el reglamento aceptado (D6) y, si la clase se dio, el interés percibido. */
export async function cerrarRegistro(ctx: ContextoApi, claseId: string): Promise<RegistroPresentado> {
  const clase = await cargarClase(ctx.db, claseId);
  if (!clase) throw noEncontrado();
  await transaccionConBloqueo(ctx.db, ctx.organizacionId, claveDeCandado(claseId), async (tx) => {
    const c = await cargarRegistro(tx, claseId);
    if (!c) throw conflicto("Todavía no hay nada capturado en este registro");
    if (c.registro.estatus === "cerrado") return; // idempotente
    if (c.registro.estatus !== "completo") throw conflicto("El registro tiene que estar completo antes de cerrarlo");
    const faltan: { campo: string; mensaje: string }[] = [];
    if (clase.estatus === "asistio" && !c.registro.interes_percibido) faltan.push({ campo: "observacion.interes_percibido", mensaje: "Falta el interés percibido del maestro (la clase se dio)" });
    // D6: sin la aceptación del reglamento (evidencia en `aceptacion_legal`) no hay cierre.
    faltan.push(...(await problemasDeReglamento(tx, clase.prospecto_id, clase.prospecto.vertical_interes_id, ctx.ahora())));
    if (faltan.length > 0) throw conflicto("El registro no se puede cerrar todavía", faltan);
    await tx.registro_clase_muestra.update({ where: { id: c.registro.id }, data: { estatus: "cerrado", cerrado_en: ctx.ahora(), cerrado_por_usuario_id: ctx.usuario.id } });
    await registrarCambio(tx, ctx, { entidad: "registro_clase_muestra", entidadId: c.registro.id, accion: "actualizar", antes: instantaneaDe(c.registro), despues: instantaneaDe({ ...c.registro, estatus: "cerrado" }) });
  });
  return leerRegistro(ctx, claseId);
}

/** `cerrado` → `completo` (solo el administrador, con permiso `registro_muestra:reabrir`). */
export async function reabrirRegistro(ctx: ContextoApi, claseId: string): Promise<RegistroPresentado> {
  if (!(await cargarClase(ctx.db, claseId))) throw noEncontrado();
  await transaccionConBloqueo(ctx.db, ctx.organizacionId, claveDeCandado(claseId), async (tx) => {
    const c = await cargarRegistro(tx, claseId);
    if (!c) throw noEncontrado();
    if (c.registro.estatus !== "cerrado") throw conflicto("El registro no está cerrado");
    await tx.registro_clase_muestra.update({ where: { id: c.registro.id }, data: { estatus: "completo", cerrado_en: null, cerrado_por_usuario_id: null } });
    await registrarCambio(tx, ctx, { entidad: "registro_clase_muestra", entidadId: c.registro.id, accion: "actualizar", antes: instantaneaDe(c.registro), despues: instantaneaDe({ ...c.registro, estatus: "completo" }) });
  });
  return leerRegistro(ctx, claseId);
}

// ── Reprogramar y conversión ───────────────────────────────────────────────────────────────────────────

/**
 * Reprogramar una clase mueve el registro a la nueva (los datos son del alumno, no de la fecha): un registro en borrador o completo
 * pasa a la clase que la reemplaza. Dentro de la transacción de reprogramar. Un registro cerrado se queda en la clase original.
 */
export async function trasladarRegistroDeClase(tx: Consultas, deClaseId: string, aClaseId: string): Promise<void> {
  await tx.registro_clase_muestra.updateMany({ where: { clase_muestra_id: deClaseId, estatus: { in: ["borrador", "completo"] } }, data: { clase_muestra_id: aClaseId } });
}

export interface RegistroParaConversion {
  registroId: string;
  claseMuestraId: string;
  prospectoId: string;
  leadId: string;
  alumno: { nombre: string; apellidos: string; fechaNacimiento: string; sexo: string; escuela: string | null; turnoEscolar: string | null; tallaUniforme: string | null };
  /** Los adultos tal cual se capturaron: F2 los vuelve `tutor` (uno por teléfono) y `tutor_alumno` con estas banderas. */
  tutores: { nombre: string; apellidos: string | null; parentesco: string; telefono: string; correo: string | null; esResponsableDePago: boolean; loLleva: boolean; puedeRecoger: boolean }[];
  antecedentes: { practicoAntes: boolean; practicoDonde: string | null; practicoNivel: string | null; motivoClase: string; motivoClaseDetalle: string | null };
  observacion: { nivelObservado: string | null; grupoRecomendadoId: string | null; interesPercibido: string | null };
}

/**
 * El registro COMPLETO o cerrado más reciente de un prospecto, en la forma que necesita la conversión (F2): todo estructurado, nada
 * que volver a preguntar. null si el prospecto no tiene un registro completo. La ficha de salud no viaja aquí: está ligada al
 * prospecto y F2 la pasa al alumno por el módulo de datos sensibles.
 */
export async function registroDeProspectoParaConversion(db: BaseDatos | Consultas, prospectoId: string): Promise<RegistroParaConversion | null> {
  const r = (await db.registro_clase_muestra.findFirst({ where: { prospecto_id: prospectoId, estatus: { in: ["completo", "cerrado"] } }, orderBy: [{ completo_en: "desc" }, { id: "desc" }], select: SELECCION_REGISTRO })) as FilaRegistro | null;
  if (!r || !r.alumno_nombre || !r.alumno_apellidos || !r.alumno_fecha_nacimiento || !r.alumno_sexo || r.practico_antes === null || !r.motivo_clase) return null;
  const tutores = (await db.registro_tutor.findMany({ where: { registro_id: r.id }, select: SELECCION_TUTOR, orderBy: [{ posicion: "asc" }, { id: "asc" }] })) as FilaTutor[];
  return {
    registroId: r.id,
    claseMuestraId: r.clase_muestra_id,
    prospectoId: r.prospecto_id,
    leadId: r.lead_id,
    alumno: { nombre: r.alumno_nombre, apellidos: r.alumno_apellidos, fechaNacimiento: iso(r.alumno_fecha_nacimiento)!, sexo: r.alumno_sexo, escuela: r.escuela_nombre, turnoEscolar: r.escuela_turno, tallaUniforme: r.talla_uniforme },
    tutores: tutores.map((t) => ({ nombre: t.nombre, apellidos: t.apellidos, parentesco: t.parentesco, telefono: t.telefono, correo: t.correo, esResponsableDePago: t.es_responsable_pago, loLleva: t.lo_lleva, puedeRecoger: t.puede_recoger })),
    antecedentes: { practicoAntes: r.practico_antes, practicoDonde: r.practico_donde, practicoNivel: r.practico_nivel, motivoClase: r.motivo_clase, motivoClaseDetalle: r.motivo_clase_detalle },
    observacion: { nivelObservado: r.nivel_observado, grupoRecomendadoId: r.grupo_recomendado_id, interesPercibido: r.interes_percibido },
  };
}
