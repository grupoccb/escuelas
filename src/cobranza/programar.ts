// Programar los recordatorios de pago (H6): lo hace el motor de automatizaciones (`src/automatizaciones/motor.ts`) en su fase «programar», para las automatizaciones activas de
// los eventos `cargo_por_vencer` y `cargo_vencido`. Este módulo no manda nada: crea ejecuciones (`automatizacion_ejecucion`, entidad `cargo`) y MessagingProvider decide al enviar
// con TODAS sus reglas (baja total, ventana de servicio y plantilla aprobada, horario 09:00–20:00 de la sucursal, frecuencia de 3 al día, atención humana según la clase de la plantilla).
//
// IDEMPOTENTE por la llave de siempre `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)` (invariante 8): correr el motor dos veces, o dos motores a la vez, no programa dos
// veces. UNA ejecución por (automatización, cargo, ocurrencia); `max_intentos` es el tope. Solo se recuerdan cargos ABIERTOS (con saldo) de inscripciones que no estén dadas de baja.

import { aFecha } from "../catalogo/precios.ts";
import { altaConAlcance, type BaseDatos } from "../datos/alcance.ts";
import { diasQueCubren } from "../lib/periodo.ts";
import { estrechar, horarioDeEnvio } from "../mensajeria/horario-envio.ts";
import { recorrerODescartar, siguienteHorarioValido, type VentanaHoraria } from "../mensajeria/reglas.ts";
import { deFecha } from "../catalogo/precios.ts";
import { atrasoMaximoDias, DIA_MS, limiteDeRecordatorioPorVencer, nominalDeRecordatorio, ocurrenciaPorProgramar, type EventoDeCobranza } from "./plan.ts";

const CANDIDATOS_POR_CORRIDA = 500;

export interface AutomatizacionDeCobranza {
  id: string;
  evento_disparador: string;
  vertical_id: string | null;
  sucursal_id: string | null;
  offset_minutos: number;
  espaciado_minutos: number | null;
  max_intentos: number;
  condiciones: unknown;
  hora_inicio_min: number;
  hora_fin_min: number;
  dias_permitidos: number[];
}

export const esEventoDeCobranza = (e: string): e is EventoDeCobranza => e === "cargo_por_vencer" || e === "cargo_vencido";

/** Programa las ejecuciones de UNA automatización de cobranza. Devuelve cuántas creó. */
export async function programarCobranza(db: BaseDatos, a: AutomatizacionDeCobranza, ahora: Date): Promise<number> {
  if (!esEventoDeCobranza(a.evento_disparador)) return 0;
  const evento = a.evento_disparador;
  const atraso = atrasoMaximoDias(a.condiciones);
  // V5: la ventana de la automatización, recortada al horario de envío de la escuela.
  const propia = estrechar(a, await horarioDeEnvio(db));
  const ventana: VentanaHoraria = { inicioMin: propia.hora_inicio_min, finMin: propia.hora_fin_min, dias: a.dias_permitidos };
  // Ventana de vencimientos candidatos (holgada en ±2 días por las zonas horarias; el cálculo exacto lo hace `ocurrenciaPorProgramar` con la zona de cada cargo).
  const hoyUtc = ahora.toISOString().slice(0, 10);
  const dia = (n: number): Date => new Date(aFecha(hoyUtc).getTime() + n * DIA_MS);
  const rangoDeVencimiento =
    evento === "cargo_vencido"
      ? { gte: dia(-(atraso + 3 + diasQueCubren(a.max_intentos * (a.espaciado_minutos ?? 10080) + Math.max(0, a.offset_minutos)))), lte: dia(2) }
      : { gte: dia(-2), lte: dia(2 + diasQueCubren(Math.abs(Math.min(0, a.offset_minutos)))) };
  const cargos = await db.cargo.findMany({
    where: {
      estatus: { in: ["pendiente", "vencido"] },
      fecha_vencimiento: rangoDeVencimiento,
      ...(a.sucursal_id ? { sucursal_id: a.sucursal_id } : {}),
      ...(a.vertical_id ? { inscripcion: { grupo: { programa: { vertical_id: a.vertical_id } } } } : {}),
      OR: [{ inscripcion_id: null }, { inscripcion: { estatus: { not: "baja" } } }],
    },
    orderBy: [{ fecha_vencimiento: "asc" }, { id: "asc" }],
    take: CANDIDATOS_POR_CORRIDA,
    select: { id: true, fecha_vencimiento: true, sucursal: { select: { zona_horaria: true } } },
  });
  if (cargos.length === 0) return 0;
  const previas = await db.automatizacion_ejecucion.findMany({
    where: { automatizacion_id: a.id, entidad_tipo: "cargo", entidad_id: { in: cargos.map((c) => c.id) } },
    orderBy: { ocurrencia: "desc" },
    select: { entidad_id: true, ocurrencia: true, estatus: true },
  });
  const ultima = new Map<string, { ocurrencia: number; salio: boolean }>();
  for (const p of previas) if (!ultima.has(p.entidad_id)) ultima.set(p.entidad_id, { ocurrencia: p.ocurrencia, salio: p.estatus === "enviado" });

  let creadas = 0;
  for (const c of cargos) {
    const zona = c.sucursal.zona_horaria;
    const vence = deFecha(c.fecha_vencimiento);
    const n = ocurrenciaPorProgramar(evento, { vencimiento: vence, zona, ahora, maxIntentos: a.max_intentos, offsetMinutos: a.offset_minutos, espaciadoMinutos: a.espaciado_minutos, atrasoMaximoDias: atraso, previa: ultima.get(c.id) ?? null });
    if (n === null) continue;
    const nominal = nominalDeRecordatorio(evento, vence, zona, { offsetMinutos: a.offset_minutos, espaciadoMinutos: a.espaciado_minutos }, n);
    // Fuera del horario de envío se recorre al siguiente válido (invariante 14). «Por vencer» tiene un evento al cual no se debe llegar tarde (el final del día de vencimiento): si recorrerlo lo pasa, se descarta.
    const programado = evento === "cargo_por_vencer" ? recorrerODescartar(nominal, zona, limiteDeRecordatorioPorVencer(vence, zona), ventana, true) : siguienteHorarioValido(nominal, zona, ventana);
    if (programado === null) continue;
    const r = await db.automatizacion_ejecucion.createMany({
      data: [altaConAlcance({ automatizacion_id: a.id, entidad_tipo: "cargo", entidad_id: c.id, ocurrencia: n, programado_para: programado })],
      skipDuplicates: true,
    });
    creadas += r.count;
  }
  return creadas;
}
