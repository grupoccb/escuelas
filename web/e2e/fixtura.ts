import { expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { cargarMundo, RAIZ, rutaDeEstado } from "./mundo.ts";

export { expect };
export const mundo = cargarMundo();

/**
 * `test` con una regla de la noche: el navegador de pruebas NUNCA sale a un servicio externo (ni wa.me, ni Chatwoot, ni una CDN, ni fuentes).
 * Todo lo que no sea el origen de la aplicación se aborta y, si algo lo intentó, la prueba falla.
 */
export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    await relojDelNavegador(context);
    const externas: string[] = [];
    const origen = new URL(baseURL ?? "http://127.0.0.1").origin;
    await context.route(
      (url) => url.protocol.startsWith("http") && url.origin !== origen,
      (ruta) => {
        externas.push(ruta.request().url());
        return ruta.abort("blockedbyclient");
      },
    );
    // Una redirección del servidor (por ejemplo el 303 a WhatsApp de la landing) NO pasa por `route`: el evento `request` sí la ve. Cualquier solicitud fuera del origen es un fallo.
    context.on("request", (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith("http") && u.origin !== origen) externas.push(`${r.url()} (redirección o carga directa)`);
    });
    await use(context);
    expect(externas, "peticiones a servicios externos (prohibidas)").toEqual([]);
  },
});

/**
 * V10b-fix: con el reloj simulado (PRUEBAS_AHORA, ver scripts/lib/reloj-simulado.ts) el navegador vive en el MISMO «ahora» que el servidor de pruebas: la pantalla decide
 * «hoy» y «ya empezó» con su propio reloj, y si fuera el real, la prueba volvería a depender de la hora de la máquina. `Date` de este proceso ya es la simulada; desde ahí
 * el reloj del navegador corre solo. Sin PRUEBAS_AHORA no hace nada. Todo contexto creado a mano (`browser.newContext`) pasa por `contextoConReloj`.
 */
export async function relojDelNavegador(context: BrowserContext): Promise<void> {
  if (process.env["PRUEBAS_DESFASE_MS"]) await context.clock.install({ time: new Date() });
}

/** Un contexto nuevo del navegador (con la sesión que se le pase) que vive en el mismo «ahora» que el servidor de pruebas. */
export async function contextoConReloj(browser: Browser, opciones?: Parameters<Browser["newContext"]>[0]): Promise<BrowserContext> {
  const context = await browser.newContext(opciones);
  await relojDelNavegador(context);
  return context;
}

export type Rol = "administrador" | "asesor" | "maestro" | "recepcion";

/** La prueba (o el bloque) corre con la sesión de ese rol ya iniciada. */
export const comoRol = (rol: Rol): { storageState: string } => ({ storageState: rutaDeEstado(rol) });

/** Inicia sesión por la pantalla de acceso (para probar el acceso mismo). */
export async function entrarPorPantalla(page: Page, correo: string, contrasena: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill(contrasena);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Lo que el servidor devuelve de `GET /api/yo` desde el contexto del navegador (con la cookie de la sesión). */
export async function llamadasAPi(page: Page): Promise<string[]> {
  return page.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.includes("/api/")));
}

export const VISTA_CELULAR = { width: 390, height: 844 } as const;
export const VISTA_ESCRITORIO = { width: 1366, height: 768 } as const;

/**
 * Una captura para la revisión de Eduardo en `docs/capturas/<nombre>-<celular|escritorio>.png`, con los datos ficticios del mundo de pruebas.
 * Cambia el tamaño de la ventana, captura y la deja como estaba.
 */
export async function capturar(page: Page, nombre: string, vista: "celular" | "escritorio", opciones: { completa?: boolean } = {}): Promise<void> {
  const original = page.viewportSize();
  const tamano = vista === "celular" ? VISTA_CELULAR : VISTA_ESCRITORIO;
  await page.setViewportSize(tamano);
  await page.waitForLoadState("networkidle");
  const carpeta = resolve(RAIZ, "docs/capturas");
  mkdirSync(carpeta, { recursive: true });
  if (opciones.completa) {
    // «Página completa» sin los artefactos de una captura por tramos (la barra lateral y la inferior son fijas): se agranda la ventana a lo que mide la página y se captura la ventana.
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: tamano.width, height: Math.min(Math.max(alto, tamano.height), 5000) });
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: resolve(carpeta, `${nombre}-${vista}.png`), animations: "disabled" });
  if (original) await page.setViewportSize(original);
}
export const VISTAS = { celular: { ...VISTA_CELULAR, esMovil: true }, escritorio: { ...VISTA_ESCRITORIO, esMovil: false } } as const;
export type Vista = keyof typeof VISTAS;

/**
 * Un contexto aparte para un recorrido con varias personas (la familia, el asesor, la maestra): con la sesión de un rol (o sin ella), el tamaño de la vista y la MISMA regla
 * de la noche que `test`: nada sale a un servicio externo. `cerrar()` falla si algo lo intentó.
 */
export async function contextoNuevo(browser: Browser, baseURL: string, vista: Vista, rol: Rol | null): Promise<{ context: BrowserContext; page: Page; cerrar: () => Promise<void> }> {
  const v = VISTAS[vista];
  const context = await contextoConReloj(browser, {
    baseURL,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    viewport: { width: v.width, height: v.height },
    hasTouch: v.esMovil,
    isMobile: v.esMovil,
    ...(rol ? { storageState: rutaDeEstado(rol) } : {}),
  });
  const externas: string[] = [];
  const origen = new URL(baseURL).origin;
  await context.route(
    (url) => url.protocol.startsWith("http") && url.origin !== origen,
    (ruta) => {
      externas.push(ruta.request().url());
      return ruta.abort("blockedbyclient");
    },
  );
  context.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.origin !== origen) externas.push(`${r.url()} (redirección o carga directa)`);
  });
  const page = await context.newPage();
  return {
    context,
    page,
    cerrar: async () => {
      await context.close();
      expect(externas, "peticiones a servicios externos (prohibidas)").toEqual([]);
    },
  };
}
