// EB-09: las garantías de acceso están en la ESTRUCTURA, no en la memoria de quien programa.
// Este test recorre el router REAL de Express (no una lista paralela) y lo compara con una tabla
// escrita a mano: toda ruta de /api tiene que aparecer aquí, con el permiso que se acordó. Una ruta
// nueva sin declaración de acceso —o con otro permiso— hace fallar el test (y en producción
// `contextoDe` se niega a operar sin la declaración). Para agregar una ruta: una línea en LAS_RUTAS.

import { test } from "node:test";
import assert from "node:assert/strict";
import { crearApp } from "../http/app.ts";
import { declaracionDe, type DeclaracionDeAcceso } from "./autorizar.ts";
import type { Permiso } from "./permisos.ts";
import { escucharSinReuso } from "../testutil/servidor.ts";

type Esperado = Permiso | "sesion" | "publica";

/** Todas las rutas de /api y su acceso, escritas A MANO. */
const LAS_RUTAS: Record<string, Esperado> = {
  "POST /api/sesion": "publica",
  "DELETE /api/sesion": "publica",
  "GET /api/yo": "sesion",
  "POST /api/yo/contrasena": "sesion",
  "GET /api/usuarios": "usuarios:administrar",
  "POST /api/usuarios": "usuarios:administrar",
  "PATCH /api/usuarios/:id": "usuarios:administrar",
  "POST /api/usuarios/:id/vincular-chatwoot": "usuarios:administrar",
  "DELETE /api/usuarios/:id/vincular-chatwoot": "usuarios:administrar",
  "GET /api/grupos": "grupos:leer",
  "POST /api/grupos": "catalogo:escribir",
  "PATCH /api/grupos/:id": "catalogo:escribir",
  "DELETE /api/grupos/:id": "catalogo:escribir",
  "GET /api/salones": "catalogo:leer",
  "GET /api/salones/:id": "catalogo:leer",
  "POST /api/salones": "catalogo:escribir",
  "PATCH /api/salones/:id": "catalogo:escribir",
  "DELETE /api/salones/:id": "catalogo:escribir",
  "GET /api/precios": "catalogo:leer",
  "GET /api/precios/:id": "catalogo:leer",
  "POST /api/precios": "catalogo:escribir",
  "PATCH /api/precios/:id": "catalogo:escribir",
  "DELETE /api/precios/:id": "catalogo:escribir",
  "GET /api/promociones": "catalogo:leer",
  "GET /api/promociones/:id": "catalogo:leer",
  "POST /api/promociones": "catalogo:escribir",
  "PATCH /api/promociones/:id": "catalogo:escribir",
  "DELETE /api/promociones/:id": "catalogo:escribir",
  "POST /api/promociones/:id/beneficios": "catalogo:escribir",
  "PATCH /api/promociones/:id/beneficios/:beneficio_id": "catalogo:escribir",
  "DELETE /api/promociones/:id/beneficios/:beneficio_id": "catalogo:escribir",
  "GET /api/instructores": "catalogo:leer",
  "GET /api/instructores/:id": "catalogo:leer",
  "POST /api/instructores": "catalogo:escribir",
  "PATCH /api/instructores/:id": "catalogo:escribir",
  "DELETE /api/instructores/:id": "catalogo:escribir",
  "GET /api/cotizador": "cotizador:leer",
  "GET /api/lista-espera": "lista_espera:leer",
  "PATCH /api/lista-espera/:id": "lista_espera:escribir",
  "DELETE /api/lista-espera/:id": "lista_espera:escribir",
  "GET /api/clases-muestra": "clases_muestra:leer",
  "GET /api/clases-muestra/sesiones": "clases_muestra:leer",
  "GET /api/clases-muestra/:id": "clases_muestra:leer",
  "POST /api/clases-muestra": "clases_muestra:escribir",
  "GET /api/clases-muestra/:id/registro": "registro_muestra:leer",
  "PATCH /api/clases-muestra/:id/registro": "registro_muestra:escribir",
  "POST /api/clases-muestra/:id/registro/completar": "registro_muestra:escribir",
  "POST /api/clases-muestra/:id/registro/cerrar": "registro_muestra:escribir",
  "POST /api/clases-muestra/:id/registro/reabrir": "registro_muestra:reabrir",
  "GET /api/documentos-legales/vigentes": "registro_muestra:leer",
  "GET /api/documentos-legales": "catalogo:leer",
  "GET /api/documentos-legales/:id": "catalogo:leer",
  "POST /api/documentos-legales": "catalogo:escribir",
  "GET /api/clases-muestra/:id/registro/aceptaciones": "registro_muestra:leer",
  "POST /api/clases-muestra/:id/registro/aceptaciones": "registro_muestra:escribir",
  "POST /api/clases-muestra/:id/reprogramar": "clases_muestra:escribir",
  "POST /api/clases-muestra/:id/cancelar": "clases_muestra:escribir",
  "PATCH /api/clases-muestra/:id/asistencia": "clases_muestra:asistencia",
  "GET /api/maestro/clases-muestra": "clases_muestra:leer",
  "GET /api/maestro/avisos": "avisos_maestro:leer",
  "PATCH /api/maestro/avisos/:id": "avisos_maestro:escribir",
  "GET /api/tareas": "tareas:leer",
  "PATCH /api/tareas/:id": "tareas:resolver",
  "GET /api/campanas": "catalogo:leer",
  "GET /api/campanas/:id": "catalogo:leer",
  "GET /api/campanas/:id/qr": "campanas:qr",
  "POST /api/campanas": "catalogo:escribir",
  "PATCH /api/campanas/:id": "catalogo:escribir",
  "DELETE /api/campanas/:id": "catalogo:escribir",
  "GET /api/codigos-rastreo": "catalogo:escribir",
  "POST /api/codigos-rastreo": "catalogo:escribir",
  "PATCH /api/codigos-rastreo/:id": "catalogo:escribir",
  "DELETE /api/codigos-rastreo/:id": "catalogo:escribir",
  "GET /api/leads/estancados": "leads:leer",
  "PATCH /api/leads/:id/etapa": "leads:escribir",
  "GET /api/leads/:id/historial": "leads:leer",
  "GET /api/motivos-perdida": "catalogo:leer",
  "POST /api/motivos-perdida": "catalogo:escribir",
  "PATCH /api/motivos-perdida/:id": "catalogo:escribir",
  "DELETE /api/motivos-perdida/:id": "catalogo:escribir",
  "GET /api/leads": "leads:leer",
  "GET /api/leads/:id": "leads:leer",
  "GET /api/leads/:id/cotizaciones": "leads:leer",
  "POST /api/leads/:id/cotizaciones": "leads:escribir",
  "GET /api/conversaciones": "conversaciones:leer",
  "GET /api/tutores": "tutores:leer",
  "GET /api/tutores/:id": "tutores:leer",
  "POST /api/tutores": "tutores:escribir",
  "PATCH /api/tutores/:id": "tutores:escribir",
  "DELETE /api/tutores/:id": "tutores:escribir",
  "GET /api/alumnos": "alumnos:leer",
  "GET /api/alumnos/:id": "alumnos:leer",
  "POST /api/alumnos": "alumnos:escribir",
  "PATCH /api/alumnos/:id": "alumnos:escribir",
  "POST /api/alumnos/:id/tutores": "alumnos:escribir",
  "PATCH /api/alumnos/:id/tutores/:tutor_id": "alumnos:escribir",
  "DELETE /api/alumnos/:id/tutores/:tutor_id": "alumnos:escribir",
  "GET /api/registro-cambios": "registro_cambios:leer",
  "GET /api/salud/:sujeto_tipo/:sujeto_id": "salud:leer",
  "PUT /api/salud/:sujeto_tipo/:sujeto_id": "salud:escribir",
  "GET /api/salud-accesos": "registro_cambios:leer",
};

/** Lo que no cuelga de /api: tiene su propia autenticación (firma o secreto) o es público a propósito, y no usa sesión. */
// /l/:vertical es la landing pública (E1): sin sesión a propósito; su protección (límite por IP, honeypot, tope de cuerpo) vive en src/http/landing.ts.
const FUERA_DE_API = ["GET /salud", "POST /webhooks/chatwoot", "POST /webhooks/twilio/entrantes", "POST /webhooks/twilio/estados", "GET /l/:vertical", "POST /l/:vertical"];

interface RutaReal {
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

/** Los problemas entre las rutas reales y la tabla acordada. Vacío = todo en orden. */
export function comparar(reales: RutaReal[], acordado: Record<string, Esperado>): string[] {
  const problemas: string[] = [];
  const vistas = new Set<string>();
  for (const r of reales) {
    vistas.add(r.clave);
    const esperado = acordado[r.clave];
    if (esperado === undefined) {
      problemas.push(`${r.clave}: no está en la tabla acordada`);
      continue;
    }
    if (esperado === "publica") {
      if (r.declaraciones.length > 0) problemas.push(`${r.clave}: es pública pero declara acceso`);
    } else if (esperado === "sesion") {
      if (!(r.declaraciones.length === 1 && r.declaraciones[0]!.tipo === "sesion")) problemas.push(`${r.clave}: debería declarar soloSesion()`);
    } else {
      const d = r.declaraciones;
      if (!(d.length === 1 && d[0]!.tipo === "permisos" && d[0]!.permisos.length === 1 && d[0]!.permisos[0] === esperado)) {
        problemas.push(`${r.clave}: debería declarar requierePermiso("${esperado}") y declara ${JSON.stringify(d)}`);
      }
    }
  }
  for (const clave of Object.keys(acordado)) if (!vistas.has(clave)) problemas.push(`${clave}: está en la tabla pero no existe en el router`);
  return problemas;
}

function appReal() {
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
const pilaDe = (app: unknown): any[] => (app as { router: { stack: any[] } }).router.stack;

test("las rutas de /api del router real son EXACTAMENTE las de la tabla acordada, cada una con su permiso", () => {
  const todas = recorrer(pilaDe(appReal()));
  const deApi = todas.filter((r) => r.clave.split(" ")[1]!.startsWith("/api/"));
  assert.deepEqual(comparar(deApi, LAS_RUTAS), []);
  assert.deepEqual(todas.filter((r) => !r.clave.split(" ")[1]!.startsWith("/api/")).map((r) => r.clave).sort(), [...FUERA_DE_API].sort(), "lo que no es /api tampoco crece sin que se decida");
});

test("el comparador SÍ detecta una ruta sin declaración, con otro permiso o ausente (control negativo)", () => {
  const reales = recorrer(pilaDe(appReal())).filter((r) => r.clave.split(" ")[1]!.startsWith("/api/"));
  assert.ok(comparar([...reales, { clave: "GET /api/nueva", declaraciones: [] }], LAS_RUTAS).some((p) => p.startsWith("GET /api/nueva: no está")));
  const cambiada = reales.map((r) => (r.clave === "GET /api/leads" ? { ...r, declaraciones: [{ tipo: "permisos", permisos: ["leads:escribir"] } as const] } : r));
  assert.ok(comparar(cambiada, LAS_RUTAS).some((p) => p.startsWith("GET /api/leads: debería declarar")));
  const sinDeclarar = reales.map((r) => (r.clave === "GET /api/tareas" ? { ...r, declaraciones: [] } : r));
  assert.ok(comparar(sinDeclarar, LAS_RUTAS).some((p) => p.startsWith("GET /api/tareas: debería declarar")));
  assert.ok(comparar(reales.filter((r) => r.clave !== "GET /api/grupos"), LAS_RUTAS).some((p) => p.includes("GET /api/grupos: está en la tabla")));
});

test("sin sesión, toda ruta que no es pública responde 401 (autenticar va una sola vez, antes de las rutas)", async () => {
  const app = appReal();
  const server = escucharSinReuso(app);
  const { port } = server.address() as { port: number };
  try {
    for (const [clave, esperado] of Object.entries(LAS_RUTAS)) {
      if (esperado === "publica") continue;
      const [metodo, ruta] = clave.split(" ") as [string, string];
      const url = `http://127.0.0.1:${port}${ruta.replace(":id", "00000000-0000-4000-8000-000000000001").replace(":sujeto_tipo", "prospecto").replace(":sujeto_id", "00000000-0000-4000-8000-000000000001")}`;
      const res = await fetch(url, { method: metodo, headers: { "x-requested-with": "prueba" } });
      await res.arrayBuffer();
      assert.equal(res.status, 401, clave);
    }
  } finally {
    server.close();
  }
});
