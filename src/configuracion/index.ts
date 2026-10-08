// Configuración de la organización: UN lector (invariante 1: va por el scope) con valores por
// defecto cuando la organización no tiene fila. Todo lo que dependa de un ajuste de la escuela
// lo lee de aquí, nunca de una constante en el código.
//
// Para agregar un ajuste (los bloques siguientes lo harán):
//   1. columna tipada con default en `configuracion_organizacion` (prisma/schema.prisma) y migración;
//   2. el campo en `ConfiguracionOrganizacion` y su valor en `CONFIGURACION_POR_DEFECTO`
//      (debe coincidir con el default de la columna: un test lo comprueba);
//   3. una línea en `desdeFila`.

import type { Consultas } from "../datos/alcance.ts";

/** Qué hace el bot cuando la sucursal elegida no tiene programa para la edad (C7, decisión 8 del plan). */
export const POLITICAS_SUCURSAL_SIN_PROGRAMA = ["ofrecer_otra", "avisar_asesor"] as const;
export type PoliticaSucursalSinPrograma = (typeof POLITICAS_SUCURSAL_SIN_PROGRAMA)[number];

export interface ConfiguracionOrganizacion {
  /** Mensajes automáticos por teléfono en una ventana móvil de 24 h. */
  maxAutomaticosPorDia: number;
  /** Mensajes de marketing por teléfono dentro de la ventana de `ventanaMarketingDias`. */
  maxMarketingPorVentana: number;
  ventanaMarketingDias: number;
  /** `ofrecer_otra` (por defecto): el bot ofrece la(s) otra(s) sucursal(es) con programa; `avisar_asesor`: pasa directo. */
  sucursalSinPrograma: PoliticaSucursalSinPrograma;
  /** Días que vale una cotización, a lo más (antes vence si lo cotizado vence: una promoción o el precio). */
  cotizacionVigenciaDias: number;
}

/** Lo que vale cuando la organización no tiene fila. Mismos valores que los defaults de la columna. */
export const CONFIGURACION_POR_DEFECTO: Readonly<ConfiguracionOrganizacion> = Object.freeze({
  maxAutomaticosPorDia: 3,
  maxMarketingPorVentana: 1,
  ventanaMarketingDias: 7,
  sucursalSinPrograma: "ofrecer_otra",
  cotizacionVigenciaDias: 7,
});

interface FilaConfiguracion {
  max_automaticos_por_dia: number;
  max_marketing_por_ventana: number;
  ventana_marketing_dias: number;
  sucursal_sin_programa: PoliticaSucursalSinPrograma;
  cotizacion_vigencia_dias: number;
}

function desdeFila(f: FilaConfiguracion): ConfiguracionOrganizacion {
  return {
    maxAutomaticosPorDia: f.max_automaticos_por_dia,
    maxMarketingPorVentana: f.max_marketing_por_ventana,
    ventanaMarketingDias: f.ventana_marketing_dias,
    sucursalSinPrograma: f.sucursal_sin_programa,
    cotizacionVigenciaDias: f.cotizacion_vigencia_dias,
  };
}

/** La configuración de la organización del scope; los valores por defecto si no hay fila. */
export async function leerConfiguracion(db: Consultas): Promise<ConfiguracionOrganizacion> {
  const fila = await db.configuracion_organizacion.findFirst({
    select: { max_automaticos_por_dia: true, max_marketing_por_ventana: true, ventana_marketing_dias: true, sucursal_sin_programa: true, cotizacion_vigencia_dias: true },
  });
  return fila ? desdeFila(fila) : { ...CONFIGURACION_POR_DEFECTO };
}
