// El router REAL de /api, recorrido capa por capa (internos de Express 5), para los tests que comparan las rutas contra una tabla escrita a mano (`rutas.test.ts`: permisos;
// `modulos-rutas.test.ts`: módulos) o que ejercitan todas las rutas de un módulo (`modulos.itest.ts`).

import { crearApp } from "../http/app.ts";
import { declaracionDe, type DeclaracionDeAcceso } from "../api/autorizar.ts";

export interface RutaReal {
  clave: string;
  declaraciones: DeclaracionDeAcceso[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- internos de Express 5 */
export function recorrer(stack: any[], prefijo = ""): RutaReal[] {
  const salida: RutaReal[] = [];
  for (const capa of stack) {
    if (capa.route) {
      for (const metodo of Object.keys(capa.route.methods)) {
        salida.push({
          clave: `${metodo.toUpperCase()} ${prefijo}${capa.route.path}`,
          declaraciones: (capa.route.stack as any[]).map((c) => declaracionDe(c.handle)).filter((d): d is DeclaracionDeAcceso => d !== undefined),
        });
      }
    } else if (capa.handle?.stack) {
      const golpe = (capa.matchers as ((p: string) => { path?: string } | false)[]).map((m) => m("/api/yo") || m("/l/x") || m("/x")).find(Boolean);
      salida.push(...recorrer(capa.handle.stack, prefijo + ((golpe && golpe.path) || "")));
    }
  }
  return salida;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function appReal() {
  return crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: "x",
    procesarEntrante: async () => ({ resultado: "x" }),
    registrarTomaDeConversacion: async () => "x",
    estadosEntrega: { interpretar: () => null },
    registrarEstadoEntrega: async () => "x",
    api: { prisma: {} as never },
    landing: { prisma: {} as never },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pilaDe = (app: unknown): any[] => (app as { router: { stack: any[] } }).router.stack;

/** Las rutas de /api del router real (método y patrón, tal como se declararon). */
export function rutasDeApiReales(): RutaReal[] {
  return recorrer(pilaDe(appReal())).filter((r) => r.clave.split(" ")[1]!.startsWith("/api/"));
}

export const UUID_DE_PRUEBA = "00000000-0000-4000-8000-000000000001";

/** Rutas concretas de un patrón de Express (`/api/x/:id`). El tipo del sujeto de salud se prueba con sus dos valores. */
export function concretas(patron: string): string[] {
  if (patron.includes(":sujeto_tipo")) return ["prospecto", "alumno"].map((t) => patron.replace(":sujeto_tipo", t).replace(/:[a-z_]+/g, UUID_DE_PRUEBA));
  return [patron.replace(/:[a-z_]+/g, UUID_DE_PRUEBA)];
}
