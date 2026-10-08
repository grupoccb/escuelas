// Recuperación de quien NO llegó a su clase muestra (D4): la automatización `clase_muestra_no_asistio`.
//
// El evento es el momento en que se MARCA que no asistió. Cada intento sale `offset_minutos` después (el primero) y luego cada
// `espaciado_minutos` (por omisión, el mismo `offset_minutos`), hasta `max_intentos` (1–2), dentro del horario de envío de la sucursal
// (lo que cae fuera de la ventana horaria se recorre al siguiente horario válido; aquí no hay clase a la que llegar tarde, así que
// nunca se descarta por eso). Las ejecuciones de TODOS los intentos se crean al marcarlo (idempotentes por
// `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`); el motor revisa al ejecutar cada una si todavía tiene sentido: la
// clase sigue en `no_asistio`, el prospecto no volvió a agendar, y para el segundo intento en adelante que el anterior salió y el contacto
// no ha contestado desde entonces. Marcar asistencia por error, o volver a agendar, cancela las pendientes.

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { siguienteHorarioValido, type VentanaHoraria } from "../mensajeria/reglas.ts";

const MINUTO_MS = 60_000;

export interface AutomatizacionDeRecuperacion {
  id: string;
  offset_minutos: number;
  espaciado_minutos: number | null;
  max_intentos: number;
  hora_inicio_min: number;
  hora_fin_min: number;
  dias_permitidos: readonly number[];
}

export interface IntentoPlaneado {
  ocurrencia: number;
  nominal: Date;
  programadoPara: Date;
}

/** Cuándo sale cada intento de recuperación de una clase marcada «no asistió» en `marcadaEn`. PURA. */
export function planearRecuperacion(e: { marcadaEn: Date; zonaHoraria: string; automatizacion: AutomatizacionDeRecuperacion }): IntentoPlaneado[] {
  const a = e.automatizacion;
  const ventana: VentanaHoraria = { inicioMin: a.hora_inicio_min, finMin: a.hora_fin_min, dias: a.dias_permitidos };
  const espaciado = a.espaciado_minutos ?? a.offset_minutos;
  const intentos: IntentoPlaneado[] = [];
  for (let n = 1; n <= a.max_intentos; n++) {
    const nominal = new Date(e.marcadaEn.getTime() + (a.offset_minutos + (n - 1) * espaciado) * MINUTO_MS);
    intentos.push({ ocurrencia: n, nominal, programadoPara: siguienteHorarioValido(nominal, e.zonaHoraria, ventana) });
  }
  return intentos;
}

/**
 * Programa los intentos de recuperación de la clase (recién marcada `no_asistio` en `marcadaEn`). Dentro de la transacción del cambio;
 * idempotente. Automatizaciones aplicables: activas del evento, de la vertical y la sucursal de la clase o sin restricción.
 * Devuelve cuántas ejecuciones creó.
 */
export async function programarRecuperacionDeClase(tx: Consultas, claseId: string, marcadaEn: Date): Promise<number> {
  const clase = await tx.clase_muestra.findFirst({
    where: { id: claseId, estatus: "no_asistio" },
    select: { grupo: { select: { programa: { select: { vertical_id: true, sucursal_id: true, sucursal: { select: { zona_horaria: true } } } } } } },
  });
  if (!clase) return 0;
  const { vertical_id, sucursal_id, sucursal } = clase.grupo.programa;
  const automatizaciones = await tx.automatizacion.findMany({
    where: { activo: true, evento_disparador: "clase_muestra_no_asistio", AND: [{ OR: [{ vertical_id: null }, { vertical_id }] }, { OR: [{ sucursal_id: null }, { sucursal_id }] }] },
    select: { id: true, offset_minutos: true, espaciado_minutos: true, max_intentos: true, hora_inicio_min: true, hora_fin_min: true, dias_permitidos: true },
    orderBy: [{ offset_minutos: "asc" }, { id: "asc" }],
  });
  let creadas = 0;
  for (const a of automatizaciones) {
    const plan = planearRecuperacion({ marcadaEn, zonaHoraria: sucursal.zona_horaria, automatizacion: a });
    const r = await tx.automatizacion_ejecucion.createMany({
      data: plan.map((p) => altaConAlcance({ automatizacion_id: a.id, entidad_tipo: "clase_muestra", entidad_id: claseId, ocurrencia: p.ocurrencia, programado_para: p.programadoPara })),
      skipDuplicates: true,
    });
    creadas += r.count;
  }
  return creadas;
}

export type MotivoDeCancelacionDeRecuperacion = "asistencia_corregida" | "volvio_a_agendar";

/** Cancela los intentos de recuperación pendientes de una clase (asistencia corregida, o la familia volvió a agendar). Devuelve cuántos. */
export async function cancelarRecuperacionDeClase(tx: Consultas, claseId: string, motivo: MotivoDeCancelacionDeRecuperacion): Promise<number> {
  const r = await tx.automatizacion_ejecucion.updateMany({
    where: { entidad_tipo: "clase_muestra", entidad_id: claseId, estatus: "programado", ejecutado_en: null, automatizacion: { evento_disparador: "clase_muestra_no_asistio" } },
    data: { estatus: "cancelado", motivo_omision: motivo },
  });
  return r.count;
}
