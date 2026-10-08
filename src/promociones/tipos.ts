// Vocabulario de las promociones (C3): una sola lista por concepto, la misma que los enums de la base.

export const CONDICIONES = ["sin_condicion", "al_pagar_primera_mensualidad", "min_hermanos", "pago_anticipado"] as const;
export type CondicionTipo = (typeof CONDICIONES)[number];

export const TIPOS_DE_BENEFICIO = ["descuento_inscripcion", "descuento_mensualidad", "producto_gratis", "meses_gratis"] as const;
export type TipoDeBeneficio = (typeof TIPOS_DE_BENEFICIO)[number];

export const MODOS_DE_BENEFICIO = ["porcentaje", "monto_fijo", "total"] as const;
export type ModoDeBeneficio = (typeof MODOS_DE_BENEFICIO)[number];

export const MOMENTOS_DE_DISPARO = ["inmediato", "al_cumplir_condicion"] as const;
export type MomentoDeDisparo = (typeof MOMENTOS_DE_DISPARO)[number];

/** Condición ya validada: lo que el resolver necesita para decidir. */
export type Condicion =
  | { tipo: "sin_condicion" }
  | { tipo: "al_pagar_primera_mensualidad" }
  | { tipo: "min_hermanos"; hermanos: number }
  | { tipo: "pago_anticipado"; meses: number };
