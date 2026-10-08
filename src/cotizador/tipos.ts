// Tipos del cotizador (C5). Todo en términos genéricos: los nombres de programas, grupos y sucursales salen de
// las tablas. El dinero va en centavos `bigint` (`src/lib/dinero.ts`); `json.ts` lo pasa a texto decimal.

import type { Cupo } from "../catalogo/cupo.ts";
import type { FechaISO } from "../catalogo/precios.ts";
import type { FranjaHoraria } from "../lib/horario.ts";
import type { Centavos } from "../lib/dinero.ts";
import type { PromocionDef, ResultadoPromociones } from "../promociones/resolver.ts";

// ── Lo que se carga de la base (el «catálogo cotizable») ──────────────────────────────────────────────────

export interface GrupoCotizable {
  id: string;
  nombre: string;
  cupoMaximo: number;
  permiteListaEspera: boolean;
  /** Lugares ocupados, de la `FuenteOcupacion` (hoy ninguno; F4 cuenta inscripciones activas). */
  ocupados: number;
  horarios: FranjaHoraria[];
}

export interface PrecioCotizable {
  id: string;
  costoInscripcion: Centavos;
  costoMensualidad: Centavos;
  moneda: string;
  desde: FechaISO;
  hasta: FechaISO | null;
}

export interface ProgramaCotizable {
  id: string;
  nombre: string;
  descripcionPublica: string | null;
  nivel: string | null;
  verticalId: string;
  sucursalId: string;
  edadMin: number;
  edadMax: number;
  /** Fecha a la que se mide la edad (p. ej. el inicio del ciclo). Nula = a la fecha de la consulta. */
  fechaCorteEdad: FechaISO | null;
  permiteTraslape: boolean;
  /** El precio vigente en la fecha de la consulta, o null si no hay (se dice «sin precio», no se inventa). */
  precio: PrecioCotizable | null;
  grupos: GrupoCotizable[];
}

export interface CatalogoCotizable {
  /** La fecha de la consulta (calendario local): rige para el precio y las promociones. */
  fecha: FechaISO;
  programas: ProgramaCotizable[];
  promociones: PromocionDef[];
}

// ── La entrada y la salida ────────────────────────────────────────────────────────────────────────────────

export interface EntradaCotizador {
  verticalId: string;
  sucursalId: string;
  /** La edad que dijo el contacto («como 6»). Se usa tal cual, sin recalcular. */
  edadDeclarada?: number | null;
  /**
   * La fecha de nacimiento, si se conoce. Con un programa que tiene `fecha_corte_edad`, la edad se calcula a esa
   * fecha; sin corte, a la fecha de la consulta. Manda sobre `edadDeclarada`.
   */
  fechaNacimiento?: FechaISO | null;
  /** Hermanos ya inscritos de la familia (para las promociones). Por omisión, 0. */
  hermanosInscritos?: number;
  /** Meses que pagaría por adelantado (para las promociones). Por omisión, 0. */
  mesesPagadosPorAdelantado?: number;
}

export type FuenteDeEdad = "declarada" | "nacimiento_a_corte" | "nacimiento_a_fecha";

export interface GrupoCotizado {
  grupoId: string;
  nombre: string;
  cupo: Cupo;
  horarios: FranjaHoraria[];
  /** «lunes y miércoles de 16:00 a 17:00». */
  horarioTexto: string;
}

export interface PrecioCotizado {
  precioId: string;
  costoInscripcion: Centavos;
  costoMensualidad: Centavos;
  moneda: string;
  vigenteDesde: FechaISO;
  vigenteHasta: FechaISO | null;
}

export interface ProgramaCotizado {
  programaId: string;
  nombre: string;
  descripcionPublica: string | null;
  nivel: string | null;
  verticalId: string;
  sucursalId: string;
  permiteTraslape: boolean;
  /** La edad con la que se comparó contra el rango del programa. */
  edad: number;
  fuenteEdad: FuenteDeEdad;
  fechaCorteEdad: FechaISO | null;
  /** null = no hay precio vigente en la fecha. */
  precio: PrecioCotizado | null;
  /** Grupos activos con horario, los de más lugares primero. */
  grupos: GrupoCotizado[];
  /** null si no hay precio (sin importes no hay qué descontar). */
  promociones: ResultadoPromociones | null;
}

export interface Cotizacion {
  fecha: FechaISO;
  verticalId: string;
  sucursalId: string;
  /** Más de un programa para la misma edad: alternativas entre las que el contacto elige (decisión 9). */
  programas: ProgramaCotizado[];
}
