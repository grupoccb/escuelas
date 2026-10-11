// Lo que comparten los dos diálogos que agendan una clase muestra (el de la ficha del lead, `ClasesMuestraDeLead.tsx`, y el del embudo, R2b): los grupos activos de la disciplina del lead
// en su sucursal, las sesiones con lugar de cada grupo (las calcula el servidor) y el guardado (agendar o reprogramar). No cambia ninguna regla: son las mismas llamadas de siempre.

import { api, type Pagina } from "../../api/cliente.ts";
import type { ClaseMuestra, Grupo, LeadDetalle } from "../../api/tipos.ts";
import { useCarga } from "../../ui/hooks.ts";

export interface Sesion {
  fecha_hora: string;
  lugares: number;
  fecha: string;
  hora: string;
  completa: string;
}

/**
 * Los datos del diálogo: los niños por inscribir (a quién se agenda), los grupos de la disciplina del lead, el grupo en uso (el elegido, el de la clase que se reprograma o el primero) y las próximas
 * sesiones con lugar de ese grupo. Solo carga mientras el diálogo está abierto.
 */
export function useOfertaDeSesiones(o: { lead: LeadDetalle; clase: ClaseMuestra | null; abierto: boolean; prospectoId: string; grupoElegido: string }) {
  const { lead, clase, abierto } = o;
  const aspirantes = lead.prospectos.filter((p) => p.alumno_id === null);
  const grupos = useCarga((senal) => api.get<Pagina<Grupo>>("/api/grupos", { limite: 100, sucursal_id: lead.sucursal?.id }, senal), [lead.sucursal?.id], abierto);
  const delLead = (grupos.datos?.datos ?? []).filter((g) => g.activo && g.programa.vertical_id === lead.vertical.id);
  const grupoId = delLead.some((g) => g.id === o.grupoElegido) ? o.grupoElegido : (clase && delLead.some((g) => g.id === clase.grupo_id) ? clase.grupo_id : (delLead[0]?.id ?? ""));
  const sesiones = useCarga((senal) => api.get<{ datos: Sesion[] }>("/api/clases-muestra/sesiones", { grupo_id: grupoId, maximo: 8 }, senal).then((r) => r.datos), [grupoId], abierto && grupoId !== "");
  const prospecto = clase ? clase.prospecto_id : (o.prospectoId || aspirantes[0]?.id || "");
  return { aspirantes, grupos, delLead, grupoId, sesiones, prospecto };
}

/** Agenda la clase (o reprograma la que ya había): `POST /api/clases-muestra` o `POST /api/clases-muestra/:id/reprogramar`. */
export async function guardarClase(o: { clase: ClaseMuestra | null; prospecto: string; grupoId: string; fechaHora: string; notas: string }): Promise<void> {
  const notas = o.notas.trim() ? { notas: o.notas.trim() } : {};
  if (o.clase) await api.post(`/api/clases-muestra/${o.clase.id}/reprogramar`, { fecha_hora: o.fechaHora, grupo_id: o.grupoId, ...notas });
  else await api.post("/api/clases-muestra", { prospecto_id: o.prospecto, grupo_id: o.grupoId, fecha_hora: o.fechaHora, ...notas });
}
