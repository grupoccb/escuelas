// La inscripción en 3 pasos del embudo (R2b), sin React: cuándo CABE en el diálogo y cuándo hay que mandar a la inscripción completa, cómo se ven los grupos con sus lugares reales y qué
// hacer con un rechazo del servidor. Es una vista más corta de lo mismo: usa los endpoints y la lógica de la conversión (`pantallas/conversion/*`); NO cambia ninguna regla.

import type { ErrorDeApi } from "../../api/cliente.ts";
import type { LeadDetalle } from "../../api/tipos.ts";
import type { Oferta, Vista } from "../conversion/datos.ts";
import { etiquetaDeFalta, type Falta } from "../conversion/faltantes.ts";

/** Por qué la inscripción no cabe en el diálogo (y se ofrece «Abrir la inscripción completa»), o si ya no hay nada que inscribir. */
export type TipoDeNoEncaje = "ya_inscrito" | "varios" | "sin_sucursal" | "reglamento" | "faltan_otros";

export type Encaje = { cabe: true; prospectoId: string } | { cabe: false; tipo: TipoDeNoEncaje; mensaje: string };

/** Lo que falta y SÍ se captura en el diálogo: datos del adulto y del alumno. El grupo y el precio se resuelven en el segundo paso. */
const SE_CAPTURA_EN_EL_DIALOGO = /^(tutor\.(parentesco|nombre)|prospectos\.[^.]+\.(alumno\.(nombre|apellidos|fecha_nacimiento)|grupo_id|precio))$/;

export const seCapturaEnElDialogo = (campo: string): boolean => SE_CAPTURA_EN_EL_DIALOGO.test(campo);

const esReglamento = (campo: string): boolean => /^prospectos\.[^.]+\.reglamento$/.test(campo);

/**
 * ¿La inscripción de este lead cabe en el diálogo de 3 pasos? Cabe cuando hay UN solo niño por inscribir, el lead tiene sucursal y lo que falta se puede capturar aquí (datos del adulto y del alumno,
 * y el grupo). No cabe con varios niños (se inscriben juntos, en una sola operación), con el reglamento sin aceptar (se registra con la clase muestra y la firma de la familia) ni con faltas
 * que solo se resuelven en la inscripción completa (un contacto sin teléfono válido…).
 */
export function encajeEnElDialogo(lead: Pick<LeadDetalle, "sucursal">, vista: Vista): Encaje {
  const pendientes = vista.prospectos.filter((p) => !p.ya_convertido);
  if (vista.ya_convertido || pendientes.length === 0) return { cabe: false, tipo: "ya_inscrito", mensaje: "Todo está convertido e inscrito: no queda nada por hacer en este lead." };
  if (pendientes.length > 1) return { cabe: false, tipo: "varios", mensaje: `Esta familia tiene ${pendientes.length} niños por inscribir. Se inscriben juntos, en una sola operación (entran todos o ninguno), y eso se hace en la inscripción completa.` };
  const prospectoId = pendientes[0]!.prospecto_id;
  if (!lead.sucursal) return { cabe: false, tipo: "sin_sucursal", mensaje: "Este lead no tiene sucursal: sin ella no se pueden ver los grupos. Elígela en la ficha del lead." };
  if (vista.faltantes.some((f) => esReglamento(f.campo))) return { cabe: false, tipo: "reglamento", mensaje: "Falta que la familia acepte el reglamento. Se registra en la inscripción completa, en el paso «Reglamento e imagen»." };
  const otras = vista.faltantes.filter((f) => !seCapturaEnElDialogo(f.campo));
  if (otras.length > 0) return { cabe: false, tipo: "faltan_otros", mensaje: `Falta algo que solo se captura en la inscripción completa: ${[...new Set(otras.map((f) => etiquetaDeFalta(f.campo)))].join(", ")}.` };
  return { cabe: true, prospectoId };
}

/** Un grupo con cupo, listo para mostrarse: de qué programa es, su horario, los lugares de HOY (los calcula el servidor) y si se puede elegir. */
export interface GrupoParaElegir {
  grupoId: string;
  nombre: string;
  programa: string;
  horario: string;
  lugares: number;
  lleno: boolean;
  /** El programa no tiene un precio vigente: no se puede inscribir en él. */
  sinPrecio: boolean;
}

/** Los grupos de la oferta (`GET /api/cotizador`) en una sola lista, en el orden en que llegan. */
export function gruposDeLaOferta(oferta: Oferta | null | undefined): GrupoParaElegir[] {
  return (oferta?.programas ?? []).flatMap((p) => p.grupos.map((g) => ({ grupoId: g.grupo_id, nombre: g.nombre, programa: p.nombre, horario: g.horario_texto, lugares: g.lugares_disponibles, lleno: g.lleno, sinPrecio: p.sin_precio || p.precio === null || p.promociones === null })));
}

export const seElige = (g: GrupoParaElegir): boolean => !g.lleno && !g.sinPrecio;

/** Por qué no hay nada que elegir (null si hay al menos un grupo que se puede elegir). */
export function problemaDeLaOferta(oferta: Oferta | null | undefined): string | null {
  if (!oferta) return "No se pudo calcular la oferta de esta edad. Falta la edad o la fecha de nacimiento del niño, o el cotizador está apagado.";
  const grupos = gruposDeLaOferta(oferta);
  if (grupos.length === 0) return "No hay programas para esta edad en la sucursal del lead.";
  if (!grupos.some(seElige)) return grupos.every((g) => g.lleno) ? "Todos los grupos de esta edad están llenos. En la inscripción completa puedes ponerlo en la lista de espera." : "Los programas de esta edad no tienen un precio vigente: no se puede inscribir hasta que el administrador lo publique.";
  return null;
}

/** El texto de los lugares de un grupo: «Lleno», «1 lugar» o «N lugares». */
export const textoDeCupo = (g: Pick<GrupoParaElegir, "lugares" | "lleno">): string => (g.lleno ? "Lleno" : g.lugares === 1 ? "1 lugar" : `${g.lugares} lugares`);

/** Qué hacer con un 409 de `POST /api/leads/:id/convertir` (`detalles[motivo]`): volver al paso del grupo, o mandar a la inscripción completa. */
export interface Rechazo {
  /** El código del servidor («grupo_lleno», «reglamento»…), si lo trae. */
  codigo: string | null;
  /** Volver al segundo paso (el grupo ya no sirve) o mandar a la inscripción completa. */
  salida: "grupo" | "completa";
  /** Las faltas que el servidor enumeró (solo con «faltan_datos»), en palabras de una persona. */
  faltas: string[];
}

export function rechazoDeConversion(error: Pick<ErrorDeApi, "detalles">): Rechazo {
  const codigo = error.detalles.find((d) => d.campo === "motivo")?.mensaje ?? null;
  const faltas = error.detalles.filter((d) => d.campo && !["motivo", "prospecto_id"].includes(d.campo)).map((d) => etiquetaDeFalta(d.campo ?? ""));
  const salida = codigo === "grupo_lleno" || codigo === "fuera_de_edad" || codigo === "ya_inscrito" ? "grupo" : "completa";
  return { codigo, salida, faltas };
}

/** Lo que se le dice a quien quiere pasar al segundo paso sin haber escrito lo que falta (`null` si ya puede). Con lo único que falta —los apellidos—, el texto del prototipo. */
export function textoDeFaltaParaSeguir(faltas: readonly Falta[]): string | null {
  if (faltas.length === 0) return null;
  if (faltas.length === 1 && /\.alumno\.apellidos$/.test(faltas[0]!.campo)) return "Escribe los apellidos del alumno para seguir.";
  return `Para seguir falta: ${[...new Set(faltas.map((f) => etiquetaDeFalta(f.campo)))].join(", ")}.`;
}
