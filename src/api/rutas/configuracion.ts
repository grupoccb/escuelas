// Configuración de la organización (J8): los ajustes de la escuela que antes eran valores fijos — topes de mensajes, modo de cierre, política de sucursal sin
// programa, vigencias y umbrales. Solo el administrador la lee y la escribe. Cada cambio queda en el registro de cambios.
//
//   GET   /api/configuracion      (catalogo:escribir) — todos los ajustes (los que nunca se tocaron traen su valor por omisión) y sus límites
//   PATCH /api/configuracion      { …cualquier subconjunto de los ajustes }   (catalogo:escribir) — valida cada ajuste contra el MISMO rango que el CHECK de la base
//
// La lectura de cada ajuste en el resto del sistema sigue siendo `leerConfiguracion()` (src/configuracion/): este archivo solo la edita.

import { Router } from "express";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { MODOS_DE_CIERRE, POLITICAS_SUCURSAL_SIN_PROGRAMA } from "../../configuracion/index.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { validacion } from "../errores.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { entero, enumerado, objeto, opcional, parsear } from "../validar.ts";

/** Los ajustes, su rango (el mismo que el CHECK de la base) y cómo se llaman en pantalla. Una sola tabla: la API la valida y la interfaz la lee de `GET`. */
export const AJUSTES = {
  max_automaticos_por_dia: { min: 0, max: 100, etiqueta: "Mensajes automáticos por teléfono al día", ayuda: "Tope en una ventana móvil de 24 horas. 0 apaga los automáticos." },
  max_marketing_por_ventana: { min: 0, max: 100, etiqueta: "Mensajes de marketing por teléfono en la ventana", ayuda: "Cuántos mensajes de marketing puede recibir un teléfono dentro de la ventana de abajo." },
  ventana_marketing_dias: { min: 1, max: 365, etiqueta: "Días de la ventana de marketing", ayuda: "Por omisión 7: un mensaje de marketing cada 7 días." },
  cotizacion_vigencia_dias: { min: 1, max: 365, etiqueta: "Días que vale una cotización", ayuda: "A lo más; antes vence si lo cotizado vence (una promoción o el precio)." },
  lista_espera_oferta_horas: { min: 1, max: 720, etiqueta: "Horas para tomar un lugar de la lista de espera", ayuda: "Pasado ese tiempo el asesor decide si pasa al siguiente." },
  clase_muestra_anticipacion_min: { min: 0, max: 10080, etiqueta: "Anticipación mínima para agendar una clase muestra (minutos)", ayuda: "La clase debe empezar al menos este tiempo después de ahora." },
  clase_muestra_horizonte_dias: { min: 1, max: 365, etiqueta: "Días hacia adelante para agendar una clase muestra", ayuda: "Hasta cuántos días de anticipación se puede agendar." },
  clase_muestra_correccion_horas: { min: 1, max: 720, etiqueta: "Horas para corregir asistió / no asistió", ayuda: "Después de ese tiempo ya no se puede corregir." },
  umbral_faltas_consecutivas: { min: 1, max: 30, etiqueta: "Faltas seguidas que avisan al asesor", ayuda: "Cuenta sesiones con pase de lista tomado." },
  umbral_dias_deuda: { min: 1, max: 365, etiqueta: "Días de atraso que generan tarea de cobranza", ayuda: "Una familia con deuda vencida desde hace esos días genera su tarea." },
} as const;
type Clave = keyof typeof AJUSTES;
const CLAVES = Object.keys(AJUSTES) as Clave[];

const SELECCION = {
  max_automaticos_por_dia: true,
  max_marketing_por_ventana: true,
  ventana_marketing_dias: true,
  cotizacion_vigencia_dias: true,
  lista_espera_oferta_horas: true,
  clase_muestra_anticipacion_min: true,
  clase_muestra_horizonte_dias: true,
  clase_muestra_correccion_horas: true,
  umbral_faltas_consecutivas: true,
  umbral_dias_deuda: true,
  sucursal_sin_programa: true,
  modo_cierre: true,
} as const;

const rango = (k: Clave) => opcional(entero({ min: AJUSTES[k].min, max: AJUSTES[k].max }));
const esquemaCambio = objeto({
  max_automaticos_por_dia: rango("max_automaticos_por_dia"),
  max_marketing_por_ventana: rango("max_marketing_por_ventana"),
  ventana_marketing_dias: rango("ventana_marketing_dias"),
  cotizacion_vigencia_dias: rango("cotizacion_vigencia_dias"),
  lista_espera_oferta_horas: rango("lista_espera_oferta_horas"),
  clase_muestra_anticipacion_min: rango("clase_muestra_anticipacion_min"),
  clase_muestra_horizonte_dias: rango("clase_muestra_horizonte_dias"),
  clase_muestra_correccion_horas: rango("clase_muestra_correccion_horas"),
  umbral_faltas_consecutivas: rango("umbral_faltas_consecutivas"),
  umbral_dias_deuda: rango("umbral_dias_deuda"),
  sucursal_sin_programa: opcional(enumerado(POLITICAS_SUCURSAL_SIN_PROGRAMA)),
  modo_cierre: opcional(enumerado(MODOS_DE_CIERRE)),
});

type Fila = { [K in keyof typeof SELECCION]: K extends "sucursal_sin_programa" | "modo_cierre" ? string : number };
const instantanea = (f: Fila): Instantanea => ({ ...f });

/** Los límites y etiquetas, para que la pantalla no los repita. */
const LIMITES = Object.fromEntries(CLAVES.map((k) => [k, AJUSTES[k]]));

export function rutasDeConfiguracion(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  const leer = async (ctx: ReturnType<typeof contextoDe>): Promise<Fila> => {
    const fila = (await ctx.db.configuracion_organizacion.findFirst({ select: SELECCION })) as Fila | null;
    return fila ?? ({ max_automaticos_por_dia: 3, max_marketing_por_ventana: 1, ventana_marketing_dias: 7, cotizacion_vigencia_dias: 7, lista_espera_oferta_horas: 48, clase_muestra_anticipacion_min: 120, clase_muestra_horizonte_dias: 60, clase_muestra_correccion_horas: 48, umbral_faltas_consecutivas: 3, umbral_dias_deuda: 15, sucursal_sin_programa: "ofrecer_otra", modo_cierre: "asesor_whatsapp" } satisfies Fila);
  };

  r.get("/configuracion", requierePermiso("catalogo:escribir"), async (_req, res) => {
    const ctx = contextoDe(res);
    res.json({ ...(await leer(ctx)), limites: LIMITES, politicas_sucursal_sin_programa: POLITICAS_SUCURSAL_SIN_PROGRAMA, modos_de_cierre: MODOS_DE_CIERRE });
  });

  r.patch("/configuracion", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const salida = await ctx.db.$transaction(async (tx) => {
      const previa = (await tx.configuracion_organizacion.findFirst({ select: SELECCION })) as Fila | null;
      const antes = previa ?? (await leer(ctx));
      if (previa) await tx.configuracion_organizacion.updateMany({ data: c });
      else await tx.configuracion_organizacion.create({ data: altaConAlcance(c) });
      const fila = await tx.configuracion_organizacion.findFirst({ select: { id: true, ...SELECCION } });
      if (!fila) throw new Error("La configuración no quedó guardada");
      const { id, ...despues } = fila;
      await registrarCambio(tx, ctx, { entidad: "configuracion_organizacion", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues as Fila) });
      return despues as Fila;
    });
    res.json({ ...salida, limites: LIMITES, politicas_sucursal_sin_programa: POLITICAS_SUCURSAL_SIN_PROGRAMA, modos_de_cierre: MODOS_DE_CIERRE });
  });

  return r;
}
