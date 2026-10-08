// Derivados de la asistencia (G2): el porcentaje de los últimos 30 días, la racha de faltas consecutivas y la tarea para el asesor al llegar al umbral.
// Determinista (invariante 10). Las cuentas son PURAS (`calcularDerivados`); `recalcularDerivados` las aplica a la base al registrar un pase.
//
// Reglas (decisiones de G2, anotadas en la bitácora):
// · La racha cuenta SESIONES CON PASE TOMADO, no días del calendario: solo hay fila de asistencia en las sesiones en que se pasó lista, así que una clase
//   que no se dio (feriado, maestro ausente) no suma ni rompe la racha. Va de la sesión más reciente hacia atrás: `falta` suma, `presente` la corta y
//   `justificada` no suma ni corta (una ausencia avisada no es la señal de abandono que se busca).
// · El porcentaje es presentes / (presentes + faltas) sobre las filas de los últimos 30 días (de `hoy − 29` a `hoy`, días locales de la sucursal): las
//   justificadas no cuentan ni a favor ni en contra. Sin ninguna fila que cuente, `null` (no hay dato; no es 0 %).
// · La tarea para el asesor (`faltas_consecutivas`) nace al llegar la racha al umbral de la organización (`umbral_faltas_consecutivas`, 3 por omisión): UNA
//   pendiente por inscripción y UNA por racha (una racha distinta es la que empieza otro día), de modo que repetir el pase, o resolverla a mano mientras la
//   racha sigue, no la vuelve a crear. Se resuelve sola (`hecha`) al volver a asistir, o al corregir el pase de modo que la racha ya no llegue al umbral.

import { altaConAlcance, type BaseDatos } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { dateAFecha, fechaADate, hoyEn, type EstatusDeAsistencia } from "./pase.ts";

export const VENTANA_DE_PORCENTAJE_DIAS = 30;

export interface FilaDeAsistencia {
  /** `AAAA-MM-DD`. */
  fecha: string;
  estatus: EstatusDeAsistencia;
}

export interface DerivadosDeAsistencia {
  /** De `desde` a `hasta`, ambos inclusive. */
  desde: string;
  hasta: string;
  presentes: number;
  faltas: number;
  justificadas: number;
  /** Presentes / (presentes + faltas), con un decimal; null si no hay ni presentes ni faltas en la ventana. */
  porcentaje: number | null;
  /** Faltas consecutivas, de la sesión más reciente hacia atrás. */
  rachaDeFaltas: number;
  /** La fecha de la PRIMERA falta de la racha actual (la más antigua); null sin racha. */
  inicioDeRacha: string | null;
}

const DIA_MS = 24 * 3_600_000;
const sumarDias = (fecha: string, dias: number): string => dateAFecha(new Date(fechaADate(fecha).getTime() + dias * DIA_MS));

/** Las cuentas puras. `filas` en cualquier orden y con cualquier cantidad de historia; `hoy` es el día local de la sucursal. */
export function calcularDerivados(filas: readonly FilaDeAsistencia[], hoy: string, ventanaDias = VENTANA_DE_PORCENTAJE_DIAS): DerivadosDeAsistencia {
  const desde = sumarDias(hoy, -(ventanaDias - 1));
  let presentes = 0;
  let faltas = 0;
  let justificadas = 0;
  for (const f of filas) {
    if (f.fecha < desde || f.fecha > hoy) continue;
    if (f.estatus === "presente") presentes++;
    else if (f.estatus === "falta") faltas++;
    else justificadas++;
  }
  const cuentan = presentes + faltas;
  // Las fechas son AAAA-MM-DD: el orden de texto es el cronológico.
  const recientes = [...filas].filter((f) => f.fecha <= hoy).sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  let racha = 0;
  let inicio: string | null = null;
  for (const f of recientes) {
    if (f.estatus === "presente") break;
    if (f.estatus === "falta") {
      racha++;
      inicio = f.fecha;
    }
  }
  return {
    desde,
    hasta: hoy,
    presentes,
    faltas,
    justificadas,
    porcentaje: cuentan === 0 ? null : Math.round((presentes * 1000) / cuentan) / 10,
    rachaDeFaltas: racha,
    inicioDeRacha: inicio,
  };
}

/** Los derivados como los devuelve la API. */
export function presentarDerivados(d: DerivadosDeAsistencia, umbral: number) {
  return {
    ventana: { desde: d.desde, hasta: d.hasta },
    porcentaje_30_dias: d.porcentaje,
    presentes: d.presentes,
    faltas: d.faltas,
    justificadas: d.justificadas,
    racha_de_faltas: d.rachaDeFaltas,
    inicio_de_racha: d.inicioDeRacha,
    umbral_de_faltas: umbral,
    en_riesgo: d.rachaDeFaltas >= umbral,
  };
}

export type AccionSobreLaTarea = "crear" | "resolver" | "nada";

/** Qué hacer con la tarea de faltas dada la racha: pura, para probar la regla sin base. */
export function accionSobreLaTarea(e: { racha: number; umbral: number; hayPendiente: boolean; yaHuboTareaDeEstaRacha: boolean }): AccionSobreLaTarea {
  if (e.racha >= e.umbral) return e.hayPendiente || e.yaHuboTareaDeEstaRacha ? "nada" : "crear";
  return e.hayPendiente ? "resolver" : "nada";
}

export interface AlertaDeFaltas {
  inscripcion_id: string;
  racha_de_faltas: number;
  umbral: number;
  accion: "tarea_creada" | "tarea_resuelta" | null;
  tarea_id: string | null;
}

/**
 * Recalcula la racha de cada inscripción y crea o resuelve su tarea. Se llama DESPUÉS de confirmar el pase. Cada inscripción va bajo su propio candado
 * (`racha:<id>`): dos pases de fechas distintas del mismo alumno no crean dos tareas. Devuelve solo las inscripciones con racha en el umbral o con una acción.
 */
export async function recalcularDerivados(db: BaseDatos, p: { organizacionId: string; inscripcionIds: readonly string[]; ahora: Date }): Promise<AlertaDeFaltas[]> {
  const alertas: AlertaDeFaltas[] = [];
  for (const inscripcionId of new Set(p.inscripcionIds)) {
    const alerta = await transaccionConBloqueo(db, p.organizacionId, `racha:${inscripcionId}`, async (tx) => {
      const insc = await tx.inscripcion.findFirst({
        where: { id: inscripcionId },
        select: { id: true, lead_id: true, alumno: { select: { nombre: true, apellidos: true } }, grupo: { select: { programa: { select: { sucursal: { select: { zona_horaria: true } } } } } } },
      });
      if (!insc) return null;
      const filas = (await tx.asistencia.findMany({ where: { inscripcion_id: inscripcionId }, select: { fecha: true, estatus: true } })).map((f) => ({ fecha: dateAFecha(f.fecha), estatus: f.estatus }));
      const { umbralFaltasConsecutivas: umbral } = await leerConfiguracion(tx);
      const d = calcularDerivados(filas, hoyEn(insc.grupo.programa.sucursal.zona_horaria, p.ahora));
      const pendiente = await tx.tarea_asesor.findFirst({ where: { inscripcion_id: inscripcionId, tipo: "faltas_consecutivas", estado: "pendiente" }, select: { id: true } });
      const previa = d.inicioDeRacha && !pendiente ? await tx.tarea_asesor.findFirst({ where: { inscripcion_id: inscripcionId, tipo: "faltas_consecutivas", referencia_fecha: fechaADate(d.inicioDeRacha) }, select: { id: true } }) : null;
      const accion = accionSobreLaTarea({ racha: d.rachaDeFaltas, umbral, hayPendiente: pendiente !== null, yaHuboTareaDeEstaRacha: previa !== null });
      if (accion === "crear") {
        const t = await tx.tarea_asesor.create({
          data: altaConAlcance({
            lead_id: insc.lead_id,
            inscripcion_id: inscripcionId,
            referencia_fecha: fechaADate(d.inicioDeRacha!),
            tipo: "faltas_consecutivas" as const,
            descripcion: `${insc.alumno.nombre} ${insc.alumno.apellidos} lleva ${d.rachaDeFaltas} faltas consecutivas (desde el ${d.inicioDeRacha}). Llama a la familia para saber qué pasó antes de que deje de venir.`,
          }),
          select: { id: true },
        });
        return { inscripcion_id: inscripcionId, racha_de_faltas: d.rachaDeFaltas, umbral, accion: "tarea_creada" as const, tarea_id: t.id };
      }
      if (accion === "resolver" && pendiente) {
        await tx.tarea_asesor.updateMany({ where: { id: pendiente.id, estado: "pendiente" }, data: { estado: "hecha", resuelta_en: p.ahora } });
        return { inscripcion_id: inscripcionId, racha_de_faltas: d.rachaDeFaltas, umbral, accion: "tarea_resuelta" as const, tarea_id: pendiente.id };
      }
      return d.rachaDeFaltas >= umbral ? { inscripcion_id: inscripcionId, racha_de_faltas: d.rachaDeFaltas, umbral, accion: null, tarea_id: pendiente?.id ?? previa?.id ?? null } : null;
    });
    if (alerta) alertas.push(alerta);
  }
  return alertas;
}
