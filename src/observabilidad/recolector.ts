// Las métricas que salen de la BASE (K4): lo que hay ahora, sumado sobre todas las organizaciones vivas. Cada consulta pasa por `conAlcance` (invariante 1):
// se recorre organización por organización y se suman los resultados. Un caché corto evita que un Prometheus que lee cada 15 segundos recorra la tabla de
// mensajes cada vez.
//
// Nunca sale un dato de una persona: solo conteos por estatus, motivo, tipo y origen (conjuntos cerrados).

import { conAlcance } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { estadoDelBarrido, metricas } from "./proceso.ts";
import type { RegistroDeMetricas } from "./registro.ts";

const DE_LA_BASE = [
  ["inscripciones_mensajes", "Mensajes por dirección y estatus (recibido, pendiente, enviando, enviado, entregado, leido, bloqueado, fallido)."],
  ["inscripciones_mensajes_bloqueados", "Mensajes bloqueados por MessagingProvider, por motivo (fuera_de_ventana, opt_out, atencion_humana, tope_frecuencia, fuera_de_horario…)."],
  ["inscripciones_entregas_fallidas", "Mensajes salientes cuya entrega falló."],
  ["inscripciones_ejecuciones_automatizacion", "Ejecuciones de automatizaciones por estatus (programado, enviado, omitido, descartado, fallido, cancelado)."],
  ["inscripciones_ejecuciones_omitidas", "Ejecuciones omitidas por motivo."],
  ["inscripciones_tareas_pendientes", "Tareas pendientes de los asesores por tipo."],
  ["inscripciones_cargos_vencidos", "Cargos con estatus vencido."],
  ["inscripciones_eventos_inesperados", "Eventos inesperados de webhooks que dejaron constancia (por origen)."],
  ["inscripciones_organizaciones", "Organizaciones vivas."],
] as const;

for (const [nombre, ayuda] of DE_LA_BASE) {
  metricas.declarar(nombre, "gauge", ayuda);
  if (!["inscripciones_entregas_fallidas", "inscripciones_cargos_vencidos", "inscripciones_organizaciones"].includes(nombre)) metricas.conEtiquetas(nombre);
}

type Cuenta = Map<string, number>;
const sumar = (m: Cuenta, llave: string, n: number): void => {
  m.set(llave, (m.get(llave) ?? 0) + n);
};

/** Recalcula las métricas de la base en `registro` (reemplaza lo anterior). */
export async function recolectarDeLaBase(prisma: PrismaRaiz, registro: RegistroDeMetricas = metricas, soloOrganizaciones?: readonly string[]): Promise<void> {
  const organizaciones = (await listarOrganizaciones(prisma)).filter((o) => soloOrganizaciones === undefined || soloOrganizaciones.includes(o.id));
  const mensajes: Cuenta = new Map();
  const bloqueados: Cuenta = new Map();
  const ejecuciones: Cuenta = new Map();
  const omitidas: Cuenta = new Map();
  const tareas: Cuenta = new Map();
  const inesperados: Cuenta = new Map();
  let fallidas = 0;
  let vencidos = 0;

  for (const o of organizaciones) {
    const db = conAlcance(prisma, o.id);
    for (const g of await db.mensaje.groupBy({ by: ["direccion", "estatus"], _count: { _all: true } })) {
      sumar(mensajes, `${g.direccion}|${g.estatus}`, g._count._all);
      if (g.direccion === "saliente" && g.estatus === "fallido") fallidas += g._count._all;
    }
    for (const g of await db.mensaje.groupBy({ by: ["motivo_bloqueo"], where: { estatus: "bloqueado" }, _count: { _all: true } })) sumar(bloqueados, g.motivo_bloqueo ?? "sin_motivo", g._count._all);
    for (const g of await db.automatizacion_ejecucion.groupBy({ by: ["estatus", "motivo_omision"], _count: { _all: true } })) {
      sumar(ejecuciones, g.estatus, g._count._all);
      if (g.estatus === "omitido") sumar(omitidas, g.motivo_omision ?? "sin_motivo", g._count._all);
    }
    for (const g of await db.tarea_asesor.groupBy({ by: ["tipo"], where: { estado: "pendiente" }, _count: { _all: true } })) sumar(tareas, g.tipo, g._count._all);
    vencidos += await db.cargo.count({ where: { estatus: "vencido" } });
    for (const g of await db.evento_inesperado.groupBy({ by: ["origen"], _count: { _all: true } })) sumar(inesperados, g.origen, g._count._all);
  }

  for (const [nombre] of DE_LA_BASE) registro.vaciar(nombre);
  for (const [llave, n] of mensajes) {
    const [direccion = "", estatus = ""] = llave.split("|");
    registro.fijar("inscripciones_mensajes", n, { direccion, estatus });
  }
  for (const [motivo, n] of bloqueados) registro.fijar("inscripciones_mensajes_bloqueados", n, { motivo });
  for (const [estatus, n] of ejecuciones) registro.fijar("inscripciones_ejecuciones_automatizacion", n, { estatus });
  for (const [motivo, n] of omitidas) registro.fijar("inscripciones_ejecuciones_omitidas", n, { motivo });
  for (const [tipo, n] of tareas) registro.fijar("inscripciones_tareas_pendientes", n, { tipo });
  for (const [origen, n] of inesperados) registro.fijar("inscripciones_eventos_inesperados", n, { origen });
  registro.fijar("inscripciones_entregas_fallidas", fallidas);
  registro.fijar("inscripciones_cargos_vencidos", vencidos);
  registro.fijar("inscripciones_organizaciones", organizaciones.length);
}

export interface RecolectorDeMetricas {
  /** El texto completo de `/metricas`. */
  texto(): Promise<string>;
}

export function crearRecolector(o: { prisma: PrismaRaiz; cacheMs?: number; reloj?: () => number; registro?: RegistroDeMetricas; /** Solo para pruebas: limita las organizaciones recorridas. */ soloOrganizaciones?: readonly string[] }): RecolectorDeMetricas {
  const registro = o.registro ?? metricas;
  const reloj = o.reloj ?? Date.now;
  const cacheMs = o.cacheMs ?? 15_000;
  let ultima = 0;
  let enCurso: Promise<void> | null = null;
  return {
    async texto() {
      const ahora = reloj();
      if (ahora - ultima >= cacheMs) {
        // Una sola recolección a la vez: lecturas simultáneas comparten la misma consulta.
        enCurso ??= recolectarDeLaBase(o.prisma, registro, o.soloOrganizaciones).then(() => {
          ultima = reloj();
        }).finally(() => {
          enCurso = null;
        });
        await enCurso;
      }
      // La edad del barrido se calcula en cada lectura, no se cachea.
      const b = estadoDelBarrido();
      registro.fijar("inscripciones_barrido_edad_segundos", Math.max(0, Math.round((reloj() - (b.ultimoCicloEn ?? b.iniciadoEn)) / 1000)));
      return registro.texto();
    },
  };
}
