// Leads «inscritos a mano» (V10b): con el módulo de inscripción apagado, una persona mueve al lead a la etapa de inscrito con una nota (`lead_etapa_historial.a_mano`).
// UNA sola definición para la regla de corrección, la ficha y los reportes (leads, costo por campaña y clases muestra):
//
//   un lead está INSCRITO A MANO si hoy está en una etapa ganada, la última vez que entró a ella fue por una marca a mano y NO tiene ninguna inscripción real (activa).
//
// En cuanto la escuela enciende la inscripción y la familia se inscribe de verdad, el lead tiene una inscripción: deja de ser «a mano» y cuenta una sola vez, por la
// inscripción (el historial conserva las dos cosas). Todo va por el scope de organización (invariante 1) y no cuenta lo borrado (invariante 3).

import type { Consultas } from "../datos/alcance.ts";

export interface InscritoAMano {
  /** Cuándo se marcó. */
  en: Date;
  /** Quién lo marcó. */
  usuarioId: string;
  historialId: string;
}

/** De estos leads (o de todos, sin lista), los que hoy están inscritos a mano. */
export async function inscritosAMano(db: Consultas, opciones: { leadIds?: readonly string[] } = {}): Promise<Map<string, InscritoAMano>> {
  const porLead = opciones.leadIds ? { lead_id: { in: [...opciones.leadIds] } } : {};
  // Las marcas a mano son pocas (las hace una persona, una por lead): se parte de ellas.
  const marcas = await db.lead_etapa_historial.findMany({ where: { a_mano: true, ...porLead }, select: { lead_id: true } });
  const candidatos = [...new Set(marcas.map((m) => m.lead_id))];
  if (candidatos.length === 0) return new Map();
  const [leads, filas, conInscripcion] = await Promise.all([
    db.lead.findMany({ where: { id: { in: candidatos } }, select: { id: true, etapa_id: true } }),
    db.lead_etapa_historial.findMany({ where: { lead_id: { in: candidatos } }, orderBy: [{ secuencia: "asc" }], select: { id: true, lead_id: true, etapa_nueva_id: true, a_mano: true, usuario_id: true, creado_en: true } }),
    // V13-fix (EV-31): una inscripción REAL es una ACTIVA (el mismo criterio con que el costo por campaña cuenta las inscripciones). Una dada de baja no cuenta: antes un lead que se inscribió, se dio de baja
    // y se volvía a marcar a mano no era «a mano» ni tenía inscripción activa, y no aparecía en ningún conteo.
    db.inscripcion.findMany({ where: { lead_id: { in: candidatos }, estatus: "activa" }, select: { lead_id: true } }),
  ]);
  const inscritos = new Set(conInscripcion.map((i) => i.lead_id));
  const etapaActual = new Map(leads.map((l) => [l.id, l.etapa_id]));
  const resultado = new Map<string, InscritoAMano>();
  // La última entrada a la etapa actual decide: si después de una marca a mano el lead volvió a entrar por otro camino, ya no es a mano.
  const ultima = new Map<string, (typeof filas)[number]>();
  for (const f of filas) if (f.etapa_nueva_id === etapaActual.get(f.lead_id)) ultima.set(f.lead_id, f);
  for (const [leadId, f] of ultima) {
    if (!f.a_mano || f.usuario_id === null || inscritos.has(leadId)) continue;
    resultado.set(leadId, { en: f.creado_en, usuarioId: f.usuario_id, historialId: f.id });
  }
  return resultado;
}

/** ¿Este lead está hoy inscrito a mano? (La regla de corrección y la ficha.) */
export async function estaInscritoAMano(db: Consultas, leadId: string): Promise<boolean> {
  return (await inscritosAMano(db, { leadIds: [leadId] })).has(leadId);
}
