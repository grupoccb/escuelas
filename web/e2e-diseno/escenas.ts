// Una «escena» es una fila de docs/diseno/INVENTARIO.md: algo que una persona puede llegar a ver. El inventario se GENERA de este registro (`npm run diseno:inventario -- --escribir`) y se cotejará
// con las rutas reales, los diálogos y las clases de base.css (`npm run diseno:inventario`). Cada escena se captura en escritorio (1366) y celular (390), «antes» y «despues» del rediseño.
//
// Para agregar una: una entrada en el archivo de su área (`escenas-<área>.ts`) con un id único. `ir` lleva la pantalla al estado que se quiere ver; las ayudas de abajo simulan
// cargando, vacío, error, sin conexión y módulo apagado interceptando la API (no tocan la base).

import type { Page, Route } from "@playwright/test";
import type { Mundo } from "../e2e/mundo.ts";

export type Vista = "escritorio" | "celular";
export type RolEscena = "administrador" | "asesor" | "maestro" | "recepcion" | "anonimo";
export type TipoDeEscena = "pantalla" | "estado" | "paso" | "formulario" | "flotante" | "impresion" | "fuera-de-react" | "global";

export interface Contexto {
  page: Page;
  mundo: Mundo;
  vista: Vista;
}

export interface Escena {
  /** Único, en minúsculas y con guiones: `asesor-embudo-tablero`. Es el nombre del archivo de la captura. */
  id: string;
  rol: RolEscena;
  /** El área (la sección de la galería): «Acceso», «Asesor», «Maestro»… */
  grupo: string;
  /** Una frase que dice qué se ve: «Embudo en tablero, con datos». */
  titulo: string;
  tipo: TipoDeEscena;
  /** La ruta de la aplicación (o de la página pública) que cubre, tal como está en `app.tsx` (`/leads/:id`). */
  ruta?: string;
  /** Archivos de `web/src` (o `src/http`) que esta escena cubre además de la ruta: sobre todo los de cada diálogo, aviso o barra. */
  fuentes?: string[];
  /** Solo en una de las dos vistas (por omisión, las dos). */
  vistas?: Vista[];
  /** Lleva la página al estado que se captura. Empieza en `about:blank` con la sesión del rol ya iniciada. */
  ir: (c: Contexto) => Promise<void>;
  /** Captura la página entera (hasta 4000 px de alto). Por omisión sí en pantallas, no en lo flotante. */
  completa?: boolean;
  /** Imprime a PDF en vez de captura de pantalla (vistas de impresión): se emula el medio `print`. */
  impresion?: boolean;
}

// ─── Ayudas de estado ────────────────────────────────────────────────────────────────────────

const esApi = (url: URL): boolean => url.pathname.startsWith("/api/");
const esYo = (url: URL): boolean => url.pathname === "/api/yo";

/** Espera a que la pantalla termine de cargar (ni giro ni «Cargando…»). */
export async function esperarListo(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.locator(".giro").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

/** Va a una ruta y espera a que cargue. */
export async function irA(c: Contexto, ruta: string): Promise<void> {
  await c.page.goto(ruta);
  await esperarListo(c.page);
}

/** Las peticiones GET a la API (menos `/api/yo`) nunca terminan: se ve el estado «cargando». */
export async function conCargando(c: Contexto, ruta: string): Promise<void> {
  await c.page.route((u) => esApi(u) && !esYo(u), (r: Route) => (r.request().method() === "GET" ? new Promise<void>(() => undefined) : r.continue()));
  await c.page.goto(ruta);
  await c.page.locator(".giro, .cargando").first().waitFor({ timeout: 8000 }).catch(() => undefined);
  await c.page.waitForTimeout(150);
}

/** Las peticiones GET a la API (menos `/api/yo`) fallan con un 500: se ve el error de carga. */
export async function conError(c: Contexto, ruta: string, estado = 500): Promise<void> {
  await c.page.route((u) => esApi(u) && !esYo(u), (r: Route) => (r.request().method() === "GET" ? r.fulfill({ status: estado, contentType: "application/json", body: JSON.stringify({ error: { codigo: "interno", mensaje: "Algo salió mal en el servidor. Inténtalo de nuevo." } }) }) : r.continue()));
  await c.page.goto(ruta);
  await esperarListo(c.page);
}

/** Todo lo que sea lista en las respuestas GET de la API llega vacío (arreglos vacíos, totales en cero): se ve el estado vacío. */
export async function conVacio(c: Contexto, ruta: string): Promise<void> {
  await c.page.route((u) => esApi(u) && !esYo(u), async (r: Route) => {
    if (r.request().method() !== "GET") return r.continue();
    const resp = await r.fetch();
    const texto = await resp.text();
    let cuerpo = texto;
    try {
      cuerpo = JSON.stringify(vaciar(JSON.parse(texto) as unknown));
    } catch {
      // No era JSON: se deja como vino.
    }
    return r.fulfill({ response: resp, body: cuerpo });
  });
  await c.page.goto(ruta);
  await esperarListo(c.page);
}

function vaciar(valor: unknown): unknown {
  if (Array.isArray(valor)) return [];
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (k === "paginacion" && v && typeof v === "object") salida[k] = { ...(v as object), total: 0, pagina: 1 };
      else if (typeof v === "number" && /^(total|cuenta|cantidad|n_|numero)/.test(k)) salida[k] = 0;
      else salida[k] = vaciar(v);
    }
    return salida;
  }
  return valor;
}

/** La API responde como si el módulo estuviera apagado (`/api/yo` lo dice). Con la ruta de una pantalla de ese módulo se ve «No disponible». */
export async function conModuloApagado(c: Contexto, ruta: string, modulo: string): Promise<void> {
  await c.page.route((u) => esYo(u), async (r: Route) => {
    const resp = await r.fetch();
    const yo = (await resp.json()) as { modulos: Record<string, boolean> };
    yo.modulos[modulo] = false;
    return r.fulfill({ response: resp, body: JSON.stringify(yo) });
  });
  await c.page.goto(ruta);
  await esperarListo(c.page);
}

/** Sin conexión: la pantalla carga con red y luego se corta; lo que `despues` haga con la API falla con «No hay conexión». */
export async function cortarLaRed(c: Contexto): Promise<void> {
  await c.page.context().setOffline(true);
}

/** Pantalla con muchos datos: lo que la API devuelva como lista se repite hasta `veces` veces (los ids se hacen únicos con un sufijo). */
export async function conMuchosDatos(c: Contexto, ruta: string, veces = 12): Promise<void> {
  await c.page.route((u) => esApi(u) && !esYo(u), async (r: Route) => {
    if (r.request().method() !== "GET") return r.continue();
    const resp = await r.fetch();
    let cuerpo = await resp.text();
    try {
      cuerpo = JSON.stringify(multiplicar(JSON.parse(cuerpo) as unknown, veces));
    } catch {
      // No era JSON.
    }
    return r.fulfill({ response: resp, body: cuerpo });
  });
  await c.page.goto(ruta);
  await esperarListo(c.page);
}

function multiplicar(valor: unknown, veces: number): unknown {
  if (Array.isArray(valor)) {
    if (valor.length === 0) return valor;
    const salida: unknown[] = [];
    for (let i = 0; i < veces; i++) for (const x of valor) salida.push(i === 0 ? multiplicar(x, veces) : sufijar(multiplicar(x, veces), i));
    return salida;
  }
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) salida[k] = multiplicar(v, veces);
    return salida;
  }
  return valor;
}

function sufijar(valor: unknown, i: number): unknown {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const o = { ...(valor as Record<string, unknown>) };
    if (typeof o["id"] === "string") o["id"] = `${o["id"]}-copia-${i}`;
    return o;
  }
  return valor;
}

/** Hace que la siguiente escritura (POST/PUT/PATCH/DELETE) a la API falle con ese estado y mensaje; sirve para ver el error de guardado. */
export async function fallarLaSiguienteEscritura(c: Contexto, estado: number, mensaje: string, detalles: { campo?: string; mensaje: string }[] = []): Promise<void> {
  await c.page.route((u) => esApi(u) && !esYo(u), (r: Route) => {
    if (r.request().method() === "GET") return r.fallback();
    return r.fulfill({ status: estado, contentType: "application/json", body: JSON.stringify({ error: { codigo: "error", mensaje, detalles } }) });
  });
}

/** Responde 401 a la siguiente petición a la API: la aplicación vuelve al acceso con el aviso de sesión vencida. */
export async function vencerLaSesion(c: Contexto): Promise<void> {
  await c.page.route((u) => esApi(u) && !esYo(u), (r: Route) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { codigo: "no_autenticado", mensaje: "Tu sesión terminó. Inicia sesión de nuevo." } }) }));
}
