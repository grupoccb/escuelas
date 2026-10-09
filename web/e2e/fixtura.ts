import { expect, test as base, type Page } from "@playwright/test";
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
    const externas: string[] = [];
    const origen = new URL(baseURL ?? "http://127.0.0.1").origin;
    await context.route(
      (url) => url.protocol.startsWith("http") && url.origin !== origen,
      (ruta) => {
        externas.push(ruta.request().url());
        return ruta.abort("blockedbyclient");
      },
    );
    await use(context);
    expect(externas, "peticiones a servicios externos (prohibidas)").toEqual([]);
  },
});

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
export const VISTA_ESCRITORIO = { width: 1280, height: 800 } as const;

/**
 * Una captura para la revisión de Eduardo en `docs/capturas/<nombre>-<celular|escritorio>.png`, con los datos ficticios del mundo de pruebas.
 * Cambia el tamaño de la ventana, captura y la deja como estaba.
 */
export async function capturar(page: Page, nombre: string, vista: "celular" | "escritorio", opciones: { completa?: boolean } = {}): Promise<void> {
  const original = page.viewportSize();
  await page.setViewportSize(vista === "celular" ? VISTA_CELULAR : VISTA_ESCRITORIO);
  await page.waitForLoadState("networkidle");
  const carpeta = resolve(RAIZ, "docs/capturas");
  mkdirSync(carpeta, { recursive: true });
  await page.screenshot({ path: resolve(carpeta, `${nombre}-${vista}.png`), fullPage: opciones.completa ?? false, animations: "disabled" });
  if (original) await page.setViewportSize(original);
}
