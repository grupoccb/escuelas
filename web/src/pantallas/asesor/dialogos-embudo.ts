// Lo que deciden los diálogos que el embudo abre al mover un lead (R2b): el de «perdido» (botones con los motivos y nota opcional) y el de «recuperar» (nota obligatoria). Sin React: se prueba
// con `node --test`. Las reglas son las del servidor (`PATCH /api/leads/:id/etapa`): perder EXIGE el motivo, recuperar EXIGE una nota. Aquí solo se anticipan para no mandar lo que va a rechazar.

/** «Ana, Luis, Eva y 2 más»: hasta tres nombres completos. */
export function nombresResumidos(nombres: readonly string[]): string {
  if (nombres.length <= 3) return nombres.join(", ");
  return `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más`;
}

/** Qué falta para perder: el motivo (la nota es opcional). `null` si ya se puede. */
export const faltaDePerdido = (motivoId: string): string | null => (motivoId === "" ? "Elige el motivo de pérdida." : null);

/** Qué falta para recuperar: una nota que diga por qué. `null` si ya se puede. */
export const faltaDeRecuperar = (nota: string): string | null => (nota.trim() === "" ? "Escribe una nota: por qué se recupera." : null);

export const tituloDePerdido = (nombres: readonly string[]): string => (nombres.length === 1 ? `¿Por qué se perdió ${nombres[0] ?? "este lead"}?` : `¿Por qué se perdieron estos ${nombres.length} leads?`);

/** Con uno: en qué etapa está hoy; con varios: quiénes son. */
export const subtituloDePerdido = (nombres: readonly string[], etapaActual: string): string => (nombres.length === 1 ? `Ahora está en: ${etapaActual}` : nombresResumidos(nombres));

export const textoDeBotonDePerdido = (cantidad: number, etapaDestino: string): string => (cantidad === 1 ? `Mover a ${etapaDestino}` : `Mover ${cantidad} a ${etapaDestino}`);

export const tituloDeRecuperar = (nombres: readonly string[]): string => (nombres.length === 1 ? `Recuperar a ${nombres[0] ?? "este lead"}` : `Recuperar ${nombres.length} leads`);

/** «Pasa de Perdido a Contactado»: las etapas de las que salen (sin repetir) y la que reciben. */
export function subtituloDeRecuperar(etapasDeOrigen: readonly string[], etapaDestino: string): string {
  const origenes = [...new Set(etapasDeOrigen)].join(" y ");
  return `Pasa de ${origenes || "—"} a ${etapaDestino}`;
}

/** El cuerpo de `PATCH /api/leads/:id/etapa`: la etapa de la que se le vio salir (para detectar que otra persona lo movió), el motivo solo al perder y la nota si la hay. */
export function cuerpoDeMovimiento(o: { destinoId: string; desdeEtapaId: string; motivoId?: string; nota: string }): Record<string, string> {
  return { etapa_id: o.destinoId, desde_etapa_id: o.desdeEtapaId, ...(o.motivoId ? { motivo_perdida_id: o.motivoId } : {}), ...(o.nota.trim() ? { nota: o.nota.trim() } : {}) };
}
