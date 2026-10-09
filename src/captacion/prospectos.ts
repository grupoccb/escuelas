// Los niños de un lead (V3, «segundo hijo»). El lead es el adulto que escribe; cada niño o alumno potencial es un `prospecto` (invariante 13). El bot captura UNO; el
// asesor agrega los demás desde la ficha o por la API, y la conversión (src/conversion/) los inscribe a todos en una sola operación sin volver a pedir nada.
//
// Aquí vive lo que no depende de HTTP: las reglas de validación (puras, con test unitario) y las tres operaciones sobre la base (agregar, corregir, quitar). Corren DENTRO de
// la transacción de quien llama y bajo el candado del lead (`bloquearLead`, el mismo que usa el cupo): dos altas simultáneas del mismo lead se forman en fila, así que el
// tope de niños y la regla de «el mismo niño no se duplica» no tienen carrera. Los índices únicos parciales de la migración `v3_segundo_hijo` son la red de seguridad.
//
// QUÉ SE GUARDA Y QUÉ NO. Nombre, apellidos, fecha de nacimiento o edad, y la disciplina de interés. NADA de salud (alergias, medicamentos…): eso lo captura el maestro en su
// registro y va cifrado por `src/sensibles/` (decisión 12). La API rechaza cualquier campo que no sea de esta lista, así que un dato de salud mandado aquí no se guarda
// en ningún lado ni llega a un log, a una nota o al registro de cambios.

import { aFecha, deFecha, type FechaISO } from "../catalogo/precios.ts";
import { edadParaPrograma } from "../cotizador/cotizar.ts";
import { problemaDeFechaDeNacimiento, EDAD_MAXIMA_ANIOS, EDAD_MINIMA_ANIOS } from "../clases-muestra/registro-reglas.ts";
import type { Consultas } from "../datos/alcance.ts";
import { altaConAlcance } from "../datos/alcance.ts";
import { bloquearLead } from "../embudo/etapas.ts";
import { edadCumplida } from "../lib/edad.ts";
import { fechaLocal } from "../lib/horario.ts";

/**
 * Tope de niños VIVOS (sin contar los quitados) en un lead. Una familia con más de 10 hijos en el mismo momento no es un caso real; el tope existe para que un reintento
 * en ciclo o un error de captura no llene la ficha. Si la escuela algún día necesita otro número, es un cambio de esta constante (no es una configuración por organización).
 */
export const MAXIMO_DE_NINOS_POR_LEAD = 10;

export interface DatosDeNino {
  nombre: string;
  apellidos?: string | null;
  /** `AAAA-MM-DD`. */
  fechaNacimiento?: FechaISO | null;
  /** Años cumplidos, cuando la familia no da la fecha. */
  edad?: number | null;
}

export interface ProblemaDeCampo {
  campo: string;
  mensaje: string;
}

// ── Reglas puras ──────────────────────────────────────────────────────────────────────────────────────────

/** El nombre con el que se compara a dos niños: sin acentos, sin mayúsculas y con los espacios colapsados. */
export function nombreNormalizado(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valida y normaliza lo que se captura de un niño. `hoy` es el día de calendario local. Devuelve los problemas (vacío = bien) y la edad que se guardará:
 * la cumplida a `hoy` si hay fecha de nacimiento, o la declarada.
 */
export function validarNino(d: DatosDeNino, hoy: FechaISO): { problemas: ProblemaDeCampo[]; edad: number | null } {
  const problemas: ProblemaDeCampo[] = [];
  const nombre = d.nombre.trim();
  if (nombre === "") problemas.push({ campo: "nombre", mensaje: "Escribe el nombre del niño" });
  const fecha = d.fechaNacimiento ?? null;
  const edadDicha = d.edad ?? null;
  if (fecha === null && edadDicha === null) problemas.push({ campo: "fecha_nacimiento", mensaje: "Escribe su fecha de nacimiento o, si no la saben, su edad" });
  let edad: number | null = edadDicha;
  if (fecha !== null) {
    const p = problemaDeFechaDeNacimiento(fecha, hoy);
    if (p) problemas.push({ campo: "fecha_nacimiento", mensaje: p });
    else {
      edad = edadCumplida(fecha, hoy);
      if (edadDicha !== null && edadDicha !== edad) problemas.push({ campo: "edad", mensaje: `La edad no coincide con la fecha de nacimiento: tiene ${edad} ${edad === 1 ? "año" : "años"}` });
    }
  } else if (edadDicha !== null && (!Number.isInteger(edadDicha) || edadDicha < EDAD_MINIMA_ANIOS || edadDicha > EDAD_MAXIMA_ANIOS)) {
    problemas.push({ campo: "edad", mensaje: `La edad debe estar entre ${EDAD_MINIMA_ANIOS} y ${EDAD_MAXIMA_ANIOS} años` });
  }
  return { problemas, edad: problemas.length === 0 ? edad : null };
}

/**
 * ¿Es el mismo niño? Mismo nombre (sin acentos ni mayúsculas) y misma fecha de nacimiento; si ninguno de los dos tiene fecha, la misma edad. Un niño con fecha y otro sin ella
 * no se consideran el mismo (no hay con qué compararlos): la regla nunca junta a dos niños por error.
 */
export function esElMismoNino(a: { nombre: string | null; fechaNacimiento: FechaISO | null; edad: number | null }, b: { nombre: string | null; fechaNacimiento: FechaISO | null; edad: number | null }): boolean {
  if (a.nombre === null || b.nombre === null || nombreNormalizado(a.nombre) !== nombreNormalizado(b.nombre)) return false;
  if (a.fechaNacimiento !== null || b.fechaNacimiento !== null) return a.fechaNacimiento === b.fechaNacimiento;
  return a.edad !== null && a.edad === b.edad;
}

/** Si por su edad no hay ningún programa (vivo, de esa disciplina y sucursal) para el niño, el aviso para el asesor; si hay alguno o no hay catálogo todavía, null. */
export function avisoDeEdadFueraDelCatalogo(
  programas: readonly { edadMin: number; edadMax: number; fechaCorteEdad: FechaISO | null }[],
  nino: { fechaNacimiento: FechaISO | null; edad: number | null },
  hoy: FechaISO,
): string | null {
  if (programas.length === 0) return null;
  for (const p of programas) {
    const e = edadParaPrograma({ fechaCorteEdad: p.fechaCorteEdad }, { edadDeclarada: nino.edad, fechaNacimiento: nino.fechaNacimiento }, hoy);
    if (e && e.edad >= p.edadMin && e.edad <= p.edadMax) return null;
  }
  const edad = nino.fechaNacimiento ? edadCumplida(nino.fechaNacimiento, hoy) : nino.edad;
  return `Por su edad${edad !== null ? ` (${edad} ${edad === 1 ? "año" : "años"})` : ""} no hay un programa para esa disciplina en esa sucursal. Se guardó igual: revísalo con la familia.`;
}

// ── La base ───────────────────────────────────────────────────────────────────────────────────────────────

export const SELECCION_DE_NINO = {
  id: true,
  lead_id: true,
  nombre: true,
  apellidos: true,
  fecha_nacimiento: true,
  edad_declarada: true,
  origen: true,
  alumno_id: true,
  vertical_interes_id: true,
  programa_sugerido_id: true,
  clave_idempotencia: true,
  creado_en: true,
  vertical_interes: { select: { id: true, nombre: true } },
  programa_sugerido: { select: { id: true, nombre: true } },
} as const;

export interface FilaDeNino {
  id: string;
  lead_id: string;
  nombre: string | null;
  apellidos: string | null;
  fecha_nacimiento: Date | null;
  edad_declarada: number | null;
  origen: "bot" | "asesor" | "landing";
  alumno_id: string | null;
  vertical_interes_id: string;
  programa_sugerido_id: string | null;
  clave_idempotencia: string | null;
  creado_en: Date;
  vertical_interes: { id: string; nombre: string };
  programa_sugerido: { id: string; nombre: string } | null;
}

/** Lo que sale por la API. `edad` es la cumplida hoy si hay fecha de nacimiento (la declarada se queda como la dijo la familia). El programa sugerido solo con el cotizador encendido. */
export function presentarNino(f: FilaDeNino, o: { hoy: FechaISO; cotizador: boolean }) {
  const fecha = f.fecha_nacimiento ? deFecha(f.fecha_nacimiento) : null;
  return {
    id: f.id,
    lead_id: f.lead_id,
    nombre: f.nombre,
    apellidos: f.apellidos,
    fecha_nacimiento: fecha,
    edad: fecha !== null && fecha <= o.hoy ? edadCumplida(fecha, o.hoy) : f.edad_declarada,
    edad_declarada: f.edad_declarada,
    origen: f.origen,
    alumno_id: f.alumno_id,
    vertical: f.vertical_interes,
    ...(o.cotizador ? { programa_sugerido: f.programa_sugerido } : {}),
    creado_en: f.creado_en,
  };
}

/** El día de calendario de hoy para el lead: en la zona de su sucursal; sin sucursal, en UTC. */
export async function hoyDelLead(tx: Consultas, sucursalInteresId: string | null, ahora: Date): Promise<FechaISO> {
  const zona = sucursalInteresId ? (await tx.sucursal.findFirst({ where: { id: sucursalInteresId }, select: { zona_horaria: true } }))?.zona_horaria : undefined;
  return fechaLocal(ahora, zona ?? "UTC");
}

export type RechazoDeNino =
  | { ok: false; motivo: "no_encontrado" }
  | { ok: false; motivo: "validacion"; problemas: ProblemaDeCampo[] }
  | { ok: false; motivo: "limite"; mensaje: string }
  | { ok: false; motivo: "clave_en_uso"; mensaje: string }
  | { ok: false; motivo: "repetido_en_otro"; mensaje: string }
  | { ok: false; motivo: "ya_es_alumno"; mensaje: string }
  | { ok: false; motivo: "tiene_pendientes"; mensaje: string }
  | { ok: false; motivo: "cambia_disciplina"; mensaje: string };

export type ResultadoDeNino = { ok: true; nino: FilaDeNino; creado: boolean; avisos: string[] } | RechazoDeNino;

export interface AltaDeNino extends DatosDeNino {
  verticalId?: string | null;
  claveIdempotencia?: string | null;
}

/** El mismo niño, escrito igual que como está guardado (para decidir si una clave repetida es un reintento o es otra cosa). */
function mismaCaptura(f: FilaDeNino, d: AltaDeNino, edad: number | null): boolean {
  const fecha = f.fecha_nacimiento ? deFecha(f.fecha_nacimiento) : null;
  return f.nombre !== null && nombreNormalizado(f.nombre) === nombreNormalizado(d.nombre) && fecha === (d.fechaNacimiento ?? null) && (fecha !== null || f.edad_declarada === edad);
}

async function programasDeLaDisciplina(tx: Consultas, verticalId: string, sucursalId: string | null) {
  const filas = await tx.programa.findMany({ where: { vertical_id: verticalId, activo: true, ...(sucursalId ? { sucursal_id: sucursalId } : {}) }, select: { edad_min: true, edad_max: true, fecha_corte_edad: true } });
  return filas.map((p) => ({ edadMin: p.edad_min, edadMax: p.edad_max, fechaCorteEdad: p.fecha_corte_edad ? deFecha(p.fecha_corte_edad) : null }));
}

/** La disciplina tiene que existir, estar activa y, si el lead ya eligió sucursal, ofrecerse ahí. Devuelve el problema o null. */
async function problemaDeDisciplina(tx: Consultas, verticalId: string, sucursalId: string | null): Promise<ProblemaDeCampo | null> {
  const v = await tx.vertical.findFirst({ where: { id: verticalId, activo: true }, select: { id: true } });
  if (!v) return { campo: "vertical_id", mensaje: "Esa disciplina no existe o ya no está activa" };
  if (sucursalId && !(await tx.sucursal_vertical.findFirst({ where: { sucursal_id: sucursalId, vertical_id: verticalId, activo: true }, select: { id: true } }))) {
    return { campo: "vertical_id", mensaje: "Esa disciplina no se ofrece en la sucursal de este lead" };
  }
  return null;
}

/**
 * Agrega un niño a un lead. IDEMPOTENTE: la misma clave con la misma captura (o el mismo niño sin clave) devuelve el que ya está (`creado: false`) en vez de crear otro; la misma
 * clave con otra captura es `clave_en_uso`. Dentro de la transacción de quien llama.
 */
export async function agregarNino(tx: Consultas, leadId: string, d: AltaDeNino, ahora: Date): Promise<ResultadoDeNino> {
  const lead = await tx.lead.findFirst({ where: { id: leadId }, select: { id: true, vertical_interes_id: true, sucursal_interes_id: true } });
  if (!lead) return { ok: false, motivo: "no_encontrado" };
  await bloquearLead(tx, lead.id);
  const hoy = await hoyDelLead(tx, lead.sucursal_interes_id, ahora);
  const valida = validarNino(d, hoy);
  const verticalId = d.verticalId ?? lead.vertical_interes_id;
  const problemas = [...valida.problemas];
  if (verticalId !== lead.vertical_interes_id || d.verticalId) {
    const p = await problemaDeDisciplina(tx, verticalId, lead.sucursal_interes_id);
    if (p) problemas.push(p);
  }
  if (problemas.length > 0) return { ok: false, motivo: "validacion", problemas };

  const vivos = await tx.prospecto.findMany({ where: { lead_id: lead.id, eliminado_en: null }, select: SELECCION_DE_NINO });
  const clave = d.claveIdempotencia ?? null;
  if (clave) {
    const previo = vivos.find((v) => v.clave_idempotencia === clave);
    if (previo) {
      return mismaCaptura(previo as FilaDeNino, d, valida.edad) ? { ok: true, nino: previo as FilaDeNino, creado: false, avisos: [] } : { ok: false, motivo: "clave_en_uso", mensaje: "Esa clave ya se usó para agregar a otro niño" };
    }
  }
  const nuevo = { nombre: d.nombre.trim(), fechaNacimiento: d.fechaNacimiento ?? null, edad: valida.edad };
  const igual = vivos.find((v) => esElMismoNino({ nombre: v.nombre, fechaNacimiento: v.fecha_nacimiento ? deFecha(v.fecha_nacimiento) : null, edad: v.edad_declarada }, nuevo));
  if (igual) return { ok: true, nino: igual as FilaDeNino, creado: false, avisos: [] };
  if (vivos.length >= MAXIMO_DE_NINOS_POR_LEAD) {
    return { ok: false, motivo: "limite", mensaje: `Una familia puede tener hasta ${MAXIMO_DE_NINOS_POR_LEAD} niños en la ficha. Quita a alguno que ya no aplique antes de agregar otro.` };
  }

  const creado = await tx.prospecto.create({
    data: altaConAlcance({
      lead_id: lead.id,
      vertical_interes_id: verticalId,
      nombre: nuevo.nombre,
      apellidos: d.apellidos?.trim() ? d.apellidos.trim() : null,
      fecha_nacimiento: nuevo.fechaNacimiento ? aFecha(nuevo.fechaNacimiento) : null,
      edad_declarada: valida.edad,
      origen: "asesor" as const,
      clave_idempotencia: clave,
    }),
    select: SELECCION_DE_NINO,
  });
  const aviso = avisoDeEdadFueraDelCatalogo(await programasDeLaDisciplina(tx, verticalId, lead.sucursal_interes_id), nuevo, hoy);
  return { ok: true, nino: creado as FilaDeNino, creado: true, avisos: aviso ? [aviso] : [] };
}

export interface CambioDeNino {
  nombre?: string;
  apellidos?: string | null;
  /** `null` la borra (y entonces hay que dar la edad). */
  fechaNacimiento?: FechaISO | null;
  edad?: number | null;
  verticalId?: string;
}

/** Corrige los datos de un niño que todavía no es alumno. Lo que no se manda no cambia. */
export async function corregirNino(tx: Consultas, leadId: string, prospectoId: string, c: CambioDeNino, ahora: Date): Promise<ResultadoDeNino> {
  const lead = await tx.lead.findFirst({ where: { id: leadId }, select: { id: true, sucursal_interes_id: true } });
  if (!lead) return { ok: false, motivo: "no_encontrado" };
  await bloquearLead(tx, lead.id);
  const actual = (await tx.prospecto.findFirst({ where: { id: prospectoId, lead_id: lead.id }, select: SELECCION_DE_NINO })) as FilaDeNino | null;
  if (!actual) return { ok: false, motivo: "no_encontrado" };
  if (actual.alumno_id) return { ok: false, motivo: "ya_es_alumno", mensaje: "Este niño ya es alumno: sus datos se corrigen desde su expediente" };
  const hoy = await hoyDelLead(tx, lead.sucursal_interes_id, ahora);

  const nombre = c.nombre ?? actual.nombre ?? "";
  const fechaActual = actual.fecha_nacimiento ? deFecha(actual.fecha_nacimiento) : null;
  const fecha = c.fechaNacimiento !== undefined ? c.fechaNacimiento : fechaActual;
  // Si se manda una fecha nueva, la edad vieja ya no cuenta; si se borra la fecha y no se da edad, se conserva la que se había calculado.
  const edadDicha = c.edad !== undefined ? c.edad : c.fechaNacimiento !== undefined && c.fechaNacimiento !== null ? null : fecha === null ? actual.edad_declarada : null;
  const valida = validarNino({ nombre, fechaNacimiento: fecha, edad: edadDicha }, hoy);
  const problemas = [...valida.problemas];
  const verticalId = c.verticalId ?? actual.vertical_interes_id;
  if (c.verticalId && c.verticalId !== actual.vertical_interes_id) {
    const p = await problemaDeDisciplina(tx, c.verticalId, lead.sucursal_interes_id);
    if (p) problemas.push(p);
    else if ((await tx.cotizacion.count({ where: { prospecto_id: actual.id } })) + (await tx.clase_muestra.count({ where: { prospecto_id: actual.id } })) + (await tx.lista_espera.count({ where: { prospecto_id: actual.id } })) > 0) {
      return { ok: false, motivo: "cambia_disciplina", mensaje: "Ya tiene cotizaciones, clase muestra o lista de espera en la disciplina anterior: no se puede cambiar de disciplina" };
    }
  }
  if (problemas.length > 0) return { ok: false, motivo: "validacion", problemas };

  const otros = await tx.prospecto.findMany({ where: { lead_id: lead.id, eliminado_en: null, id: { not: actual.id } }, select: { nombre: true, fecha_nacimiento: true, edad_declarada: true } });
  const nuevo = { nombre: nombre.trim(), fechaNacimiento: fecha, edad: valida.edad };
  if (otros.some((o) => esElMismoNino({ nombre: o.nombre, fechaNacimiento: o.fecha_nacimiento ? deFecha(o.fecha_nacimiento) : null, edad: o.edad_declarada }, nuevo))) {
    return { ok: false, motivo: "repetido_en_otro", mensaje: "Ya hay otro niño con ese nombre y esa fecha de nacimiento en esta familia" };
  }

  const guardado = await tx.prospecto.update({
    where: { id: actual.id },
    data: {
      nombre: nuevo.nombre,
      ...(c.apellidos !== undefined ? { apellidos: c.apellidos?.trim() ? c.apellidos.trim() : null } : {}),
      fecha_nacimiento: fecha ? aFecha(fecha) : null,
      edad_declarada: valida.edad,
      ...(c.verticalId ? { vertical_interes_id: verticalId } : {}),
    },
    select: SELECCION_DE_NINO,
  });
  const aviso = avisoDeEdadFueraDelCatalogo(await programasDeLaDisciplina(tx, verticalId, lead.sucursal_interes_id), nuevo, hoy);
  return { ok: true, nino: guardado as FilaDeNino, creado: false, avisos: aviso ? [aviso] : [] };
}

/**
 * Quita a un niño de la ficha (baja lógica, invariante 3). No se quita a quien ya es alumno ni a quien tiene una clase muestra agendada o un lugar en una lista de espera:
 * primero se cancelan. Sus cotizaciones vigentes pasan a vencidas (ya no hay a quién cotizarle).
 */
export async function quitarNino(tx: Consultas, leadId: string, prospectoId: string, ahora: Date): Promise<{ ok: true; cotizacionesVencidas: string[] } | RechazoDeNino> {
  const lead = await tx.lead.findFirst({ where: { id: leadId }, select: { id: true } });
  if (!lead) return { ok: false, motivo: "no_encontrado" };
  await bloquearLead(tx, lead.id);
  const actual = await tx.prospecto.findFirst({ where: { id: prospectoId, lead_id: lead.id }, select: { id: true, alumno_id: true } });
  if (!actual) return { ok: false, motivo: "no_encontrado" };
  if (actual.alumno_id) return { ok: false, motivo: "ya_es_alumno", mensaje: "Este niño ya es alumno: no se quita de la ficha" };
  if ((await tx.clase_muestra.count({ where: { prospecto_id: actual.id, estatus: "agendada" } })) > 0) {
    return { ok: false, motivo: "tiene_pendientes", mensaje: "Tiene una clase muestra agendada: cancélala antes de quitarlo" };
  }
  if ((await tx.lista_espera.count({ where: { prospecto_id: actual.id, estatus: { in: ["esperando", "ofrecido"] } } })) > 0) {
    return { ok: false, motivo: "tiene_pendientes", mensaje: "Está en una lista de espera: quítalo de ahí antes de quitarlo de la ficha" };
  }
  const vigentes = await tx.cotizacion.findMany({ where: { prospecto_id: actual.id, estatus: "vigente" }, select: { id: true } });
  if (vigentes.length > 0) await tx.cotizacion.updateMany({ where: { id: { in: vigentes.map((c) => c.id) }, estatus: "vigente" }, data: { estatus: "vencida" } });
  await tx.prospecto.updateMany({ where: { id: actual.id, alumno_id: null }, data: { eliminado_en: ahora } });
  return { ok: true, cotizacionesVencidas: vigentes.map((c) => c.id) };
}
