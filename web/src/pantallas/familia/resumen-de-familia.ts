// Lo que no necesita React de «Familias» y de la «Ficha de la familia» (R6b): los tipos de `GET /api/familias/resumen` y `/mensajes`, las etiquetas de los hijos con su disciplina, el estado
// de la cuenta en palabras, las banderas por hijo («Marisol paga», «Recogen Marisol y Rodrigo»), los adultos de la familia con las suyas, y los textos de «Mensajes». Puro: se prueba con `node --test`.
// Las disciplinas y los colores son DATOS (`color_marca`); aquí no hay ningún nombre de disciplina ni de sucursal.

import { aCentavos, formatear } from "../../lib/dinero.ts";
import { formatearDiaYMes } from "../../lib/fechas.ts";
import { horarioDeGrupo } from "../maestro/linea-de-tiempo.ts";
import type { VinculoDeAlumno } from "./tipos.ts";
import { nombreCompleto } from "./vista.ts";

// ─── Lo que trae la API ──────────────────────────────────────────────────────────────────────

export type EstadoDeSaldo = "al_corriente" | "por_pagar" | "con_vencido";

export interface InscripcionDelHijo {
  inscripcion_id: string;
  grupo: { id: string; nombre: string };
  programa: { id: string; nombre: string };
  disciplina: { id: string; nombre: string; color_marca: string | null };
  sucursal: { id: string; nombre: string };
  horarios: { dia_semana: number; hora_inicio_min: number; hora_fin_min: number }[];
  promocion: { id: string; nombre: string } | null;
  descuento_mensualidad: string | null;
  meses_gratis: number;
}

export interface ResumenDeFamilia {
  tutor_id: string;
  saldo: { estado: EstadoDeSaldo; cargos_vencidos: number; vencido: string } | null;
  hijos: { alumno_id: string; inscripciones: InscripcionDelHijo[] }[];
}

export interface MensajesDeFamilia {
  promociones: "acepta" | "no_acepta" | "sin_registro";
  recordatorio_de_pago: string | null;
  asesor: string | null;
  conversacion: { id: string; chatwoot: { cuenta_id: number | null; bandeja_id: number | null; conversacion_id: number } } | null;
}

// ─── La lista ────────────────────────────────────────────────────────────────────────────────

/** Cuántas familias dice el subtítulo: «248 familias», «1 familia». Con una búsqueda, «N familias encontradas»; con el filtro de atraso, «N familias con atraso». */
export function textoDeConteoDeFamilias(total: number, buscando: boolean, conAtraso = false): string {
  if (total === 0) return buscando ? "Ninguna familia coincide" : conAtraso ? "Ninguna familia con atraso" : "Todavía no hay familias";
  const base = `${total} ${total === 1 ? "familia" : "familias"}${conAtraso ? " con atraso" : ""}`;
  return buscando ? `${base} ${total === 1 ? "encontrada" : "encontradas"}` : base;
}

/** El estado de la cuenta como se lee en la tarjeta: el texto del prototipo y su tono (el texto siempre dice el estado; el color es refuerzo). */
export function saldoEnPalabras(estado: EstadoDeSaldo): { texto: string; tono: "alerta" | "neutro" | "exito" } {
  if (estado === "con_vencido") return { texto: "Con vencido", tono: "alerta" };
  if (estado === "por_pagar") return { texto: "Por pagar", tono: "neutro" };
  return { texto: "Al corriente", tono: "exito" };
}

export interface EtiquetaDeHijoEnLista {
  clave: string;
  nombre: string;
  /** El `color_marca` de su disciplina; `null` = el neutro del sistema. */
  color: string | null;
  disciplina: string | null;
  /** «baja» o «congelado»: un hijo que ya no está activo lo dice con palabras. */
  nota: string | null;
}

const NOTAS_DE_ESTATUS: Record<string, string> = { baja: "baja", congelado: "congelado" };

/** Un hijo por etiqueta (uno en dos disciplinas lleva dos); sin inscripción activa o sin resumen, la etiqueta neutra con solo su nombre. */
export function etiquetasDeHijos(alumnos: readonly { alumno_id: string; nombre: string; estatus: string }[], resumen: ResumenDeFamilia | undefined): EtiquetaDeHijoEnLista[] {
  const salida: EtiquetaDeHijoEnLista[] = [];
  for (const a of alumnos) {
    const nota = NOTAS_DE_ESTATUS[a.estatus] ?? null;
    const inscripciones = resumen?.hijos.find((h) => h.alumno_id === a.alumno_id)?.inscripciones ?? [];
    if (inscripciones.length === 0) {
      salida.push({ clave: a.alumno_id, nombre: a.nombre, color: null, disciplina: null, nota });
      continue;
    }
    for (const i of inscripciones) salida.push({ clave: `${a.alumno_id}-${i.inscripcion_id}`, nombre: a.nombre, color: i.disciplina.color_marca, disciplina: i.disciplina.nombre, nota });
  }
  return salida;
}

/** Las sucursales donde están inscritos los hijos («Sucursal A · Sucursal B»); sin inscripciones, la de alta de la familia, si se conoce. */
export function sucursalesDeLaFamilia(resumen: ResumenDeFamilia | undefined, sucursalDeAlta: string | null): string {
  const nombres = [...new Set((resumen?.hijos ?? []).flatMap((h) => h.inscripciones.map((i) => i.sucursal.nombre)))].sort((a, b) => a.localeCompare(b, "es-MX"));
  if (nombres.length > 0) return nombres.join(" · ");
  return sucursalDeAlta ?? "";
}

// ─── La ficha ────────────────────────────────────────────────────────────────────────────────

const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] ?? nombre;

/** «Marisol», «Marisol y Rodrigo», «A, B y C». */
function enLista(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** «4 años», «1 año»; sin edad conocida, `null`. */
export function textoDeEdad(edad: number | null | undefined): string | null {
  if (edad === null || edad === undefined) return null;
  return `${edad} ${edad === 1 ? "año" : "años"}`;
}

/** Lo que dice el hijo de sus adultos: quién paga, quién lo recoge y quién lo lleva, por nombre («Marisol paga», «Recogen Marisol y Rodrigo», «Lo lleva Rodrigo»). */
export function banderasDelHijo(vinculos: readonly Pick<VinculoDeAlumno, "nombre" | "es_responsable_pago" | "puede_recoger" | "lo_lleva">[]): string[] {
  const salida: string[] = [];
  const quienPaga = vinculos.filter((v) => v.es_responsable_pago).map((v) => primerNombre(v.nombre));
  if (quienPaga.length > 0) salida.push(`${enLista(quienPaga)} paga`);
  const quienRecoge = vinculos.filter((v) => v.puede_recoger).map((v) => primerNombre(v.nombre));
  if (quienRecoge.length === 1) salida.push(`Recoge ${quienRecoge[0]}`);
  else if (quienRecoge.length > 1) salida.push(`Recogen ${enLista(quienRecoge)}`);
  const quienLoLleva = vinculos.filter((v) => v.lo_lleva).map((v) => primerNombre(v.nombre));
  if (quienLoLleva.length > 0) salida.push(`Lo lleva ${enLista(quienLoLleva)}`);
  return salida;
}

export interface AdultoDeLaFamilia {
  tutorId: string;
  nombre: string;
  parentesco: string;
  telefono: string | null;
  correo: string | null;
  banderas: string[];
}

const conInicialMayuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Los adultos de la familia: cada tutor de cualquiera de sus hijos, una sola vez (el de la ficha primero), con sus banderas con respecto a los hijos que tiene a su cargo:
 * «Responsable de pago», «Contacto de urgencia», «Recoge a Santino» y «Lo lleva a Santino» (con varios hijos, «Recoge a Santino y Valentina»).
 */
export function adultosDeLaFamilia(alumnos: readonly { id: string; nombre: string; tutores: readonly VinculoDeAlumno[] }[], tutorDeLaFicha: string): AdultoDeLaFamilia[] {
  const porTutor = new Map<string, { vinculo: VinculoDeAlumno; pagaDe: boolean; urgencia: boolean; recoge: string[]; lleva: string[] }>();
  for (const a of alumnos) {
    for (const v of a.tutores) {
      const acumulado = porTutor.get(v.tutor_id) ?? { vinculo: v, pagaDe: false, urgencia: false, recoge: [], lleva: [] };
      acumulado.pagaDe ||= v.es_responsable_pago;
      acumulado.urgencia ||= v.es_contacto_urgencia;
      if (v.puede_recoger) acumulado.recoge.push(a.nombre);
      if (v.lo_lleva) acumulado.lleva.push(a.nombre);
      porTutor.set(v.tutor_id, acumulado);
    }
  }
  const adultos = [...porTutor.entries()].map(([tutorId, x]) => ({
    tutorId,
    nombre: nombreCompleto(x.vinculo),
    parentesco: conInicialMayuscula(x.vinculo.parentesco),
    telefono: x.vinculo.telefono ?? null,
    correo: x.vinculo.correo ?? null,
    banderas: [x.pagaDe ? "Responsable de pago" : "", x.urgencia ? "Contacto de urgencia" : "", x.recoge.length > 0 ? `Recoge a ${enLista(x.recoge)}` : "", x.lleva.length > 0 ? `Lo lleva a ${enLista(x.lleva)}` : ""].filter(Boolean),
  }));
  return [...adultos.filter((a) => a.tutorId === tutorDeLaFicha), ...adultos.filter((a) => a.tutorId !== tutorDeLaFicha)];
}

/** «Disciplina Infantil · Lun y Mié 4:00 pm · Sucursal»: disciplina y grupo, horario y sucursal de una inscripción, sin huecos. */
export function lineaDeInscripcion(i: Pick<InscripcionDelHijo, "grupo" | "disciplina" | "sucursal" | "horarios">): string {
  const grupo = i.grupo.nombre.toLowerCase().includes(i.disciplina.nombre.toLowerCase()) ? i.grupo.nombre : `${i.disciplina.nombre} ${i.grupo.nombre}`;
  return [grupo, horarioDeGrupo(i.horarios), i.sucursal.nombre].filter((p) => p.trim() !== "").join(" · ");
}

/** «Promoción «Hermanos» activa: $100.00 menos al mes y 1 mes gratis para Santino.» Una por promoción e hijo; sin descuento ni meses gratis, solo que está activa. */
export function avisosDePromocion(hijos: readonly { alumno_id: string; nombre: string }[], resumen: ResumenDeFamilia | undefined): string[] {
  if (!resumen) return [];
  const avisos: string[] = [];
  for (const a of hijos) {
    const vistas = new Set<string>();
    for (const i of resumen.hijos.find((h) => h.alumno_id === a.alumno_id)?.inscripciones ?? []) {
      if (!i.promocion || vistas.has(i.promocion.id)) continue;
      vistas.add(i.promocion.id);
      const partes = [i.descuento_mensualidad !== null && aCentavos(i.descuento_mensualidad) > 0n ? `${formatear(i.descuento_mensualidad)} menos al mes` : "", i.meses_gratis > 0 ? `${i.meses_gratis} ${i.meses_gratis === 1 ? "mes" : "meses"} gratis` : ""].filter(Boolean);
      avisos.push(partes.length > 0 ? `Promoción «${i.promocion.nombre}» activa: ${partes.join(" y ")} para ${a.nombre}.` : `Promoción «${i.promocion.nombre}» activa en la inscripción de ${a.nombre}.`);
    }
  }
  return avisos;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;

/** «familia desde marzo 2026», del instante de alta (en la zona del dispositivo: solo importa el mes). */
export function textoDeFamiliaDesde(altaISO: string): string | null {
  const d = new Date(altaISO);
  if (Number.isNaN(d.getTime())) return null;
  return `familia desde ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Cuántos cargos vencidos con saldo tiene la familia (los de todos sus hijos). */
export function contarCargosVencidos(hijos: readonly { cargos: readonly { saldo: string; estatus_efectivo: string }[] }[]): number {
  return hijos.reduce((n, h) => n + h.cargos.filter((c) => c.estatus_efectivo === "vencido" && aCentavos(c.saldo) > 0n).length, 0);
}

/** «1 cargo vencido · $650.00» (el importe lo pone quien llama, ya con formato): cuántos cargos, en singular o plural. */
export function textoDeCargosVencidos(cargos: number): string {
  return `${cargos} ${cargos === 1 ? "cargo vencido" : "cargos vencidos"}`;
}

export interface FilaDeMensajes {
  etiqueta: string;
  valor: string;
}

/** Las filas de «Mensajes». El recordatorio de pago solo va con la cobranza (`conCobranza`); el asesor sin asignar y el consentimiento sin registro se dicen tal cual. */
export function filasDeMensajes(m: MensajesDeFamilia, o: { hoy: string; conCobranza: boolean }): FilaDeMensajes[] {
  const filas: FilaDeMensajes[] = [];
  if (o.conCobranza) filas.push({ etiqueta: "Recordatorio de pago", valor: m.recordatorio_de_pago ? `Salió el ${formatearDiaYMes(m.recordatorio_de_pago, o.hoy)}` : "Todavía no ha salido ninguno" });
  filas.push({ etiqueta: "Marketing", valor: m.promociones === "acepta" ? "Acepta promociones" : m.promociones === "no_acepta" ? "No acepta promociones" : "Sin registro de consentimiento" });
  filas.push({ etiqueta: "Asesor", valor: m.asesor ?? "Sin asesor asignado" });
  return filas;
}
