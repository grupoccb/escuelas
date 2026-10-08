// Bienvenida de inscripción (F7): una automatización del evento `inscripcion_creada` sobre el motor (src/automatizaciones/motor.ts).
//
// Al inscribir se crea, en la MISMA transacción, una ejecución por automatización aplicable (activas del evento, de la vertical y la sucursal del
// programa o sin restricción): `automatizacion_ejecucion` con `entidad_tipo = inscripcion`, ocurrencia 1. Es idempotente por la llave de siempre
// `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)` (invariante 8): si la transacción se reintenta, no se programa dos veces; y si se
// revierte, la ejecución se revierte con ella. El motor la ejecuta a su hora y MessagingProvider decide con todas sus reglas (baja, ventana de
// servicio y plantilla aprobada, horario 09:00–20:00 de la sucursal, frecuencia, atención humana). Va al TUTOR RESPONSABLE DE PAGO (su conversación
// de WhatsApp; si no tiene, la del lead de origen), y NO lleva datos de salud: solo el nombre del alumno, el grupo, la sucursal y el primer día.
//
// La plantilla es de SERVICIO (`clase_mensaje = servicio`, INV-6): es un aviso sobre algo que la familia ya acordó, no marketing. Con una persona
// atendiendo la conversación (`en_atencion_humana`) SÍ sale: MessagingProvider solo frena el bot y el marketing.

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { siguienteHorarioValido } from "../mensajeria/reglas.ts";

const MINUTO_MS = 60_000;

/** Programa la bienvenida de una inscripción recién creada. Devuelve cuántas ejecuciones nuevas dejó (0 si ya estaban). */
export async function programarBienvenida(tx: Consultas, i: { inscripcionId: string; verticalId: string; sucursalId: string; zonaHoraria: string; ahora: Date }): Promise<number> {
  const automatizaciones = await tx.automatizacion.findMany({
    where: { activo: true, evento_disparador: "inscripcion_creada", AND: [{ OR: [{ vertical_id: null }, { vertical_id: i.verticalId }] }, { OR: [{ sucursal_id: null }, { sucursal_id: i.sucursalId }] }] },
    select: { id: true, offset_minutos: true, hora_inicio_min: true, hora_fin_min: true, dias_permitidos: true },
    orderBy: [{ creado_en: "asc" }, { id: "asc" }],
  });
  if (automatizaciones.length === 0) return 0;
  const r = await tx.automatizacion_ejecucion.createMany({
    data: automatizaciones.map((a) =>
      altaConAlcance({
        automatizacion_id: a.id,
        entidad_tipo: "inscripcion",
        entidad_id: i.inscripcionId,
        ocurrencia: 1,
        // Fuera de la ventana horaria se recorre al siguiente horario válido (invariante 14). No hay un evento al cual llegar tarde: nunca se descarta.
        programado_para: siguienteHorarioValido(new Date(i.ahora.getTime() + a.offset_minutos * MINUTO_MS), i.zonaHoraria, { inicioMin: a.hora_inicio_min, finMin: a.hora_fin_min, dias: a.dias_permitidos }),
      }),
    ),
    skipDuplicates: true,
  });
  return r.count;
}
