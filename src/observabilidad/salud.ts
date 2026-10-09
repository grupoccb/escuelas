// Salud del servicio (K4). Dos preguntas distintas, dos rutas:
//
//   GET /salud        «¿el proceso está vivo?»  Siempre 200 si el proceso atiende. NO toca la base: una caída de la base no debe hacer que el orquestador
//                     reinicie las tareas en bucle (no arreglaría nada y cortaría las peticiones en curso).
//   GET /salud/lista  «¿puede atender tráfico?»  Base responde, migraciones al día y el barrido corre: 503 si algo de eso falla. Es la que usa el balanceador
//                     para decidir a quién mandarle peticiones (y ECS reemplaza la tarea que se queda sin barrido).
//                     Chatwoot alcanzable (si está configurado) se REPORTA pero no tumba la lectura (`degradado: true`): una caída de Chatwoot no debe sacar
//                     del balanceador a todas las tareas del backend, que siguen recibiendo webhooks, atendiendo la interfaz y registrando todo (Twilio y
//                     el barrido reintentan lo que no se pudo entregar). Con `exigirChatwoot` sí lo exige.
//
// Ninguna de las dos devuelve datos sensibles: ni versiones, ni nombres de base, ni URLs, ni mensajes de error; solo «ok» / «falla» por comprobación.

import { readdirSync } from "node:fs";

export type Comprobacion = "ok" | "falla" | "no_aplica";

export interface EstadoDeMigraciones {
  /** Nombres de las migraciones terminadas. */
  aplicadas: string[];
  /** Nombres de las que empezaron y no terminaron (fallidas o a medias). */
  sinTerminar: string[];
}

export interface DepsDeSalud {
  pingDb(): Promise<void>;
  /** Estado real de la base. Sin él, la comprobación no aplica. */
  estadoDeMigraciones?: () => Promise<EstadoDeMigraciones>;
  /** Las migraciones que este código espera (los directorios de prisma/migrations). Sin ellas solo se exige que ninguna esté a medias. */
  migracionesEsperadas?: () => string[] | null;
  /** El barrido: cuándo arrancó el proceso y cuándo terminó el último ciclo. Sin él (los tests, scripts) no aplica. */
  barrido?: () => { iniciadoEn: number; ultimoCicloEn: number | null };
  /** Cuánto tolera sin ciclo antes de decir que el barrido está atrasado (el barrido corre cada minuto). */
  toleranciaBarridoMs?: number;
  /** Sonda de Chatwoot; null/ausente si no está configurado. */
  chatwoot?: (() => Promise<boolean>) | null;
  /** true: una Chatwoot inalcanzable también deja la lectura en «no lista». Por omisión solo la deja «degradada». */
  exigirChatwoot?: boolean;
  ahora?: () => number;
}

export interface ResultadoDeSalud {
  listo: boolean;
  /** Algo que no se necesita para atender (Chatwoot) está caído: se avisa sin sacar al servicio del balanceador. */
  degradado: boolean;
  comprobaciones: { base: Comprobacion; migraciones: Comprobacion; barrido: Comprobacion; chatwoot: Comprobacion };
}

/** Los directorios de prisma/migrations (sus nombres son los de las migraciones). null si no están (la imagen de producción los copia; un script suelto no). */
export function leerMigracionesEsperadas(directorio: string): string[] | null {
  try {
    return readdirSync(directorio, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return null;
  }
}

const TOLERANCIA_BARRIDO_POR_OMISION_MS = 5 * 60_000;

export async function revisarListo(d: DepsDeSalud): Promise<ResultadoDeSalud> {
  const ahora = (d.ahora ?? Date.now)();
  const c: ResultadoDeSalud["comprobaciones"] = { base: "ok", migraciones: "no_aplica", barrido: "no_aplica", chatwoot: "no_aplica" };

  try {
    await Promise.race([d.pingDb(), new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("tiempo")), 3000).unref())]);
  } catch {
    c.base = "falla";
  }

  if (d.estadoDeMigraciones && c.base === "ok") {
    try {
      const estado = await d.estadoDeMigraciones();
      const esperadas = d.migracionesEsperadas?.() ?? null;
      const faltan = esperadas ? esperadas.filter((m) => !estado.aplicadas.includes(m)) : [];
      c.migraciones = estado.sinTerminar.length === 0 && faltan.length === 0 ? "ok" : "falla";
    } catch {
      c.migraciones = "falla";
    }
  } else if (d.estadoDeMigraciones) {
    c.migraciones = "falla";
  }

  if (d.barrido) {
    const b = d.barrido();
    const referencia = b.ultimoCicloEn ?? b.iniciadoEn;
    c.barrido = ahora - referencia <= (d.toleranciaBarridoMs ?? TOLERANCIA_BARRIDO_POR_OMISION_MS) ? "ok" : "falla";
  }

  if (d.chatwoot) {
    try {
      c.chatwoot = (await d.chatwoot()) ? "ok" : "falla";
    } catch {
      c.chatwoot = "falla";
    }
  }

  const bloqueantes = d.exigirChatwoot ? Object.values(c) : [c.base, c.migraciones, c.barrido];
  return { listo: bloqueantes.every((x) => x !== "falla"), degradado: c.chatwoot === "falla", comprobaciones: c };
}
