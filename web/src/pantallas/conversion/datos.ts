// Lo que el asistente junta de la API para MOSTRAR lo ya capturado (el bot, la landing, el registro del maestro, la cotización). Solo lee.

import { api, type Pagina } from "../../api/cliente.ts";
import type { ClaseMuestra, LeadDetalle, Modulos, ProgramaCotizado } from "../../api/tipos.ts";
import type { Registro } from "../maestro/tipos.ts";
import type { Falta } from "./faltantes.ts";

export interface Vista {
  lead_id: string;
  listo: boolean;
  ya_convertido: boolean;
  faltantes: Falta[];
  prospectos: { prospecto_id: string; ya_convertido: boolean }[];
}

export interface ResultadoDeConversion {
  ya_convertido: boolean;
  tutor_id: string | null;
  alumnos: { prospecto_id: string; alumno_id: string; creado: boolean; tutor_ids: string[]; inscripcion: { id: string; grupo_id: string; creada: boolean } | null }[];
}

export interface CotizacionDeLead {
  id: string;
  prospecto_id: string;
  estatus: "vigente" | "aceptada" | "vencida";
  grupo_elegido_id: string | null;
}

export interface CapturadoDeProspecto {
  /** La clase muestra más reciente que sigue vigente (agendada, asistió o no asistió), si la hay. */
  clase: ClaseMuestra | null;
  registro: Registro | null;
  /** El grupo que eligió la familia al cotizar (cotización vigente), si lo hay. */
  grupoElegido: string | null;
}

export interface Oferta {
  programas: ProgramaCotizado[];
}

export async function cargarCapturado(leadId: string, prospectoIds: readonly string[], senal: AbortSignal, modulos: Modulos): Promise<Record<string, CapturadoDeProspecto>> {
  // V1: lo que pertenece a un módulo apagado ni se pide (ni cotizaciones ni clases muestra): el asistente trabaja con lo que sí hay.
  const cotizaciones: Pagina<CotizacionDeLead> = modulos.cotizador ? await api.get<Pagina<CotizacionDeLead>>(`/api/leads/${leadId}/cotizaciones`, { limite: 50 }, senal) : { datos: [], paginacion: { pagina: 1, limite: 50, total: 0 } };
  const salida: Record<string, CapturadoDeProspecto> = {};
  for (const id of prospectoIds) {
    const clases: Pagina<ClaseMuestra> = modulos.clase_muestra ? await api.get<Pagina<ClaseMuestra>>("/api/clases-muestra", { prospecto_id: id, limite: 20 }, senal) : { datos: [], paginacion: { pagina: 1, limite: 20, total: 0 } };
    const vigentes = clases.datos.filter((c) => c.estatus === "agendada" || c.estatus === "asistio" || c.estatus === "no_asistio");
    const clase = vigentes[vigentes.length - 1] ?? null;
    const registro = clase ? await api.get<Registro>(`/api/clases-muestra/${clase.id}/registro`, undefined, senal).catch(() => null) : null;
    const cot = cotizaciones.datos.find((c) => c.prospecto_id === id && c.estatus === "vigente" && c.grupo_elegido_id !== null);
    salida[id] = { clase, registro, grupoElegido: cot?.grupo_elegido_id ?? null };
  }
  return salida;
}

/** Los programas de la edad (o de la fecha de nacimiento, si ya se conoce) en la sucursal del lead, con grupos, lugares reales, precio y promociones. */
export async function cargarOferta(lead: LeadDetalle, p: { edad: number | null; nacimiento: string | null }, senal: AbortSignal, modulos: Modulos): Promise<Oferta | null> {
  if (!modulos.cotizador || !lead.sucursal || (p.edad === null && !p.nacimiento)) return null;
  return api.get<Oferta>("/api/cotizador", { vertical_id: lead.vertical.id, sucursal_id: lead.sucursal.id, ...(p.nacimiento ? { fecha_nacimiento: p.nacimiento } : { edad: p.edad ?? undefined }) }, senal);
}
