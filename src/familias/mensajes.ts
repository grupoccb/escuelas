// «Mensajes» de la ficha de la familia (R6b), de solo lectura: si acepta promociones, cuándo salió el último recordatorio de pago, qué asesor tiene su conversación y cómo abrirla.
//
// Todo sale de lo que el sistema ya guarda; lo que no existe se dice como `null`, no se inventa:
//   · promociones: el consentimiento vigente por teléfono (`consentimiento`, la fila más reciente por alcance: una baja «todo» también cubre marketing, como en `estaDadoDeBaja`);
//   · recordatorio de pago: la ejecución de cobranza (`automatizacion_ejecucion` con `entidad_tipo = cargo`) ya enviada más reciente de los cargos de la familia;
//   · asesor y conversación: la conversación de WhatsApp más reciente de los leads que se convirtieron en este tutor (`lead.tutor_id`).

import type { Consultas } from "../datos/alcance.ts";
import { fechaLocal } from "../lib/horario.ts";
import { estaDadoDeBaja } from "../mensajeria/consentimiento.ts";

export interface MensajesDeFamilia {
  /** «no_acepta»: pidió la baja; «acepta»: dio su consentimiento; «sin_registro»: no hay nada guardado. */
  promociones: "acepta" | "no_acepta" | "sin_registro";
  /** El día (calendario local de la sucursal del cargo, `AAAA-MM-DD`) en que salió el último recordatorio de pago, o null si ninguno ha salido (o la cobranza está apagada). */
  recordatorio_de_pago: string | null;
  asesor: string | null;
  conversacion: { id: string; chatwoot: { cuenta_id: number | null; bandeja_id: number | null; conversacion_id: number } } | null;
}

export async function mensajesDeFamilia(db: Consultas, tutor: { id: string; telefono: string }, o: { conCobranza: boolean }): Promise<MensajesDeFamilia> {
  const promociones: MensajesDeFamilia["promociones"] = (await estaDadoDeBaja(db, tutor.telefono, "marketing")) ? "no_acepta" : (await db.consentimiento.findFirst({ where: { telefono: tutor.telefono, estado: "opt_in" }, select: { id: true } })) ? "acepta" : "sin_registro";

  let recordatorio: string | null = null;
  if (o.conCobranza) {
    const cargos = await db.cargo.findMany({ where: { tutor_id: tutor.id }, select: { id: true, sucursal: { select: { zona_horaria: true } } } });
    if (cargos.length > 0) {
      const ultimo = await db.automatizacion_ejecucion.findFirst({
        where: { entidad_tipo: "cargo", entidad_id: { in: cargos.map((c) => c.id) }, estatus: "enviado", ejecutado_en: { not: null } },
        orderBy: [{ ejecutado_en: "desc" }, { id: "desc" }],
        select: { ejecutado_en: true, entidad_id: true },
      });
      if (ultimo?.ejecutado_en) recordatorio = fechaLocal(ultimo.ejecutado_en, cargos.find((c) => c.id === ultimo.entidad_id)?.sucursal.zona_horaria ?? "UTC");
    }
  }

  const conversacion = await db.conversacion.findFirst({
    where: { lead: { tutor_id: tutor.id } },
    orderBy: [{ ultimo_mensaje_entrante_en: { sort: "desc", nulls: "last" } }, { creado_en: "desc" }, { id: "desc" }],
    select: { id: true, chatwoot_conversacion_id: true, asignada_a: { select: { nombre: true } }, bandeja_chatwoot: { select: { chatwoot_account_id: true, chatwoot_inbox_id: true } } },
  });
  return {
    promociones,
    recordatorio_de_pago: recordatorio,
    asesor: conversacion?.asignada_a?.nombre ?? null,
    conversacion: conversacion
      ? { id: conversacion.id, chatwoot: { cuenta_id: conversacion.bandeja_chatwoot.chatwoot_account_id, bandeja_id: conversacion.bandeja_chatwoot.chatwoot_inbox_id, conversacion_id: conversacion.chatwoot_conversacion_id } }
      : null,
  };
}
