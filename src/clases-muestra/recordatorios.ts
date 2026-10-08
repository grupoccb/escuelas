// Recordatorios de la clase muestra al lead (D3): «24 h antes» y «2 h antes» como automatizaciones del evento
// `clase_muestra_proxima`, con su `offset_minutos` NEGATIVO y configurable (-1440, -120) y su propia ventana horaria.
//
// Cómo funciona. Al agendar una clase se crea, en la misma transacción, UNA ejecución por automatización aplicable
// (`entidad_tipo = clase_muestra`, ocurrencia 1; idempotente por `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`).
// El motor (`motor.ts`) las ejecuta a su hora por MessagingProvider, que decide con TODAS sus reglas (baja, ventana de servicio y
// plantilla, horario 09:00–20:00 de la sucursal, frecuencia, atención humana). Reprogramar o cancelar la clase cancela las pendientes
// de la anterior (estatus `cancelado`) y programa las de la nueva.
//
// Reglas de tiempo (puras, `planearRecordatorios`):
//   · el momento nominal es `inicio + offset`. Si ya pasó cuando se agenda la clase, ese recordatorio NO existe: queda una ejecución
//     `descartado` con motivo `ya_paso_el_momento` (una clase agendada con menos de 24 h no tiene el de 24 h, y el de 2 h solo si alcanza);
//   · lo que cae fuera de la ventana horaria de la automatización (nunca más ancha que 09:00–20:00: invariante 14) se recorre al siguiente
//     horario válido;
//   · si ese horario válido es POSTERIOR O IGUAL al inicio de la clase, se descarta (`evento_pasado`): un recordatorio no sirve a la hora
//     en que empieza la clase ni después.

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { siguienteHorarioValido, type VentanaHoraria } from "../mensajeria/reglas.ts";

const MINUTO_MS = 60_000;

export interface AutomatizacionDeRecordatorio {
  id: string;
  /** Minutos respecto al inicio de la clase; negativo = antes. */
  offset_minutos: number;
  hora_inicio_min: number;
  hora_fin_min: number;
  dias_permitidos: readonly number[];
}

export type MotivoDeDescarte = "ya_paso_el_momento" | "evento_pasado";

export interface RecordatorioPlaneado {
  automatizacionId: string;
  /** Inicio de la clase + offset, sin recorrer. */
  nominal: Date;
  /** Cuándo saldrá; null si se descarta. */
  programadoPara: Date | null;
  motivo: MotivoDeDescarte | null;
}

/** Cuándo sale cada recordatorio de una clase que empieza en `inicio`, visto desde `ahora`. PURA. */
export function planearRecordatorios(e: { inicio: Date; zonaHoraria: string; ahora: Date; automatizaciones: readonly AutomatizacionDeRecordatorio[] }): RecordatorioPlaneado[] {
  return e.automatizaciones.map((a) => {
    const nominal = new Date(e.inicio.getTime() + a.offset_minutos * MINUTO_MS);
    if (nominal.getTime() < e.ahora.getTime()) return { automatizacionId: a.id, nominal, programadoPara: null, motivo: "ya_paso_el_momento" as const };
    const ventana: VentanaHoraria = { inicioMin: a.hora_inicio_min, finMin: a.hora_fin_min, dias: a.dias_permitidos };
    const programado = siguienteHorarioValido(nominal, e.zonaHoraria, ventana);
    // Posterior o IGUAL al inicio: se descarta.
    if (programado.getTime() >= e.inicio.getTime()) return { automatizacionId: a.id, nominal, programadoPara: null, motivo: "evento_pasado" as const };
    return { automatizacionId: a.id, nominal, programadoPara: programado, motivo: null };
  });
}

export interface ResumenDeProgramacion {
  programados: number;
  descartados: number;
  /** Ya existían (un reintento no duplica). */
  existentes: number;
}

/**
 * Crea las ejecuciones de los recordatorios de la clase. Dentro de la transacción del cambio. Idempotente: volver a llamarla
 * no duplica nada. Las automatizaciones aplicables son las activas del evento `clase_muestra_proxima` de la vertical y la sucursal de la clase
 * (las que no fijan vertical o sucursal valen para todas).
 */
export async function programarRecordatoriosDeClase(tx: Consultas, claseId: string, ahora: Date): Promise<ResumenDeProgramacion> {
  const clase = await tx.clase_muestra.findFirst({
    where: { id: claseId, estatus: "agendada" },
    select: { fecha_hora: true, grupo: { select: { programa: { select: { vertical_id: true, sucursal_id: true, sucursal: { select: { zona_horaria: true } } } } } } },
  });
  if (!clase) return { programados: 0, descartados: 0, existentes: 0 };
  const { vertical_id, sucursal_id, sucursal } = clase.grupo.programa;
  const automatizaciones = await tx.automatizacion.findMany({
    where: { activo: true, evento_disparador: "clase_muestra_proxima", AND: [{ OR: [{ vertical_id: null }, { vertical_id }] }, { OR: [{ sucursal_id: null }, { sucursal_id }] }] },
    select: { id: true, offset_minutos: true, hora_inicio_min: true, hora_fin_min: true, dias_permitidos: true },
    orderBy: [{ offset_minutos: "asc" }, { id: "asc" }],
  });
  const plan = planearRecordatorios({ inicio: clase.fecha_hora, zonaHoraria: sucursal.zona_horaria, ahora, automatizaciones });
  if (plan.length === 0) return { programados: 0, descartados: 0, existentes: 0 };
  const r = await tx.automatizacion_ejecucion.createMany({
    data: plan.map((p) =>
      altaConAlcance({
        automatizacion_id: p.automatizacionId,
        entidad_tipo: "clase_muestra",
        entidad_id: claseId,
        ocurrencia: 1,
        programado_para: p.programadoPara ?? p.nominal,
        estatus: p.programadoPara ? ("programado" as const) : ("descartado" as const),
        motivo_omision: p.motivo,
      }),
    ),
    skipDuplicates: true,
  });
  const descartados = plan.filter((p) => !p.programadoPara).length;
  return { programados: Math.max(0, r.count - descartados), descartados: Math.min(r.count, descartados), existentes: plan.length - r.count };
}

/**
 * Cancela los recordatorios que siguen pendientes de la clase (estatus `cancelado`, con el motivo). Idempotente. Una ejecución que el
 * motor ya reclamó no se toca aquí: el motor vuelve a comprobar que la clase siga agendada antes de mandar. Devuelve cuántos canceló.
 */
export async function cancelarRecordatoriosDeClase(tx: Consultas, claseId: string, motivo: "clase_cancelada" | "clase_reprogramada" | "clase_marcada"): Promise<number> {
  const r = await tx.automatizacion_ejecucion.updateMany({
    where: { entidad_tipo: "clase_muestra", entidad_id: claseId, estatus: "programado", ejecutado_en: null, automatizacion: { evento_disparador: "clase_muestra_proxima" } },
    data: { estatus: "cancelado", motivo_omision: motivo },
  });
  return r.count;
}
