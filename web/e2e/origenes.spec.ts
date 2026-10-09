// V2 (decisión 7): en desarrollo local la aplicación acepta `localhost` y `127.0.0.1`. El servidor de pruebas se configura como la demo (ORIGEN_PUBLICO = localhost) y las pruebas
// entran por LAS DOS direcciones: iniciar sesión (una escritura), guardar algo (otra) y cerrar sesión. Un origen ajeno, en cambio, no pasa.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { entrarPorPantalla, expect, mundo, test } from "./fixtura.ts";
import { RAIZ } from "./mundo.ts";

test.describe.configure({ mode: "serial" });

const puerto = new URL(mundo.base).port;
const ENTRADAS = [
  { nombre: "127.0.0.1", base: `http://127.0.0.1:${puerto}`, lead: mundo.asesor.beta, captura: "v2-01-entrada-por-127.0.0.1" },
  { nombre: "localhost", base: `http://localhost:${puerto}`, lead: mundo.asesor.gamma, captura: "v2-02-entrada-por-localhost" },
] as const;

let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

for (const e of ENTRADAS) {
  test(`entrar por http://${e.nombre}:${puerto}: iniciar sesión, guardar una cotización y cerrar sesión funcionan igual`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: e.base, locale: "es-MX", timezoneId: "America/Mexico_City", viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    try {
      const u = mundo.usuarios.asesor;
      await entrarPorPantalla(page, u.correo, u.contrasena);
      await expect(page).toHaveURL(new RegExp(`^${e.base.replace(/[.]/g, "\\.")}/embudo$`));
      await expect(page.getByTestId("usuario")).toHaveText(u.nombre);

      // Una escritura de verdad: cotizar a mano. El navegador manda `Origin: http://<este host>` y el servidor lo acepta.
      await page.goto(`/leads/${e.lead.leadId}`);
      await page.getByRole("button", { name: "Cotizar a mano" }).click();
      await page.getByRole("button", { name: "Guardar cotización" }).click();
      const tarjeta = page.locator("[data-prueba^='cotizacion-']").first();
      await expect(tarjeta).toContainText("Vigente");
      await expect(page.getByRole("alert")).toHaveCount(0);
      const guardadas = await json<{ datos: { origen: string }[] }>(admin, `/api/leads/${e.lead.leadId}/cotizaciones`);
      expect(guardadas.datos).toHaveLength(1);
      const carpeta = resolve(RAIZ, "docs/capturas/v1");
      mkdirSync(carpeta, { recursive: true });
      await page.screenshot({ path: resolve(carpeta, `${e.captura}-escritorio.png`), animations: "disabled" });

      // Cerrar sesión también es una escritura (DELETE): la sesión deja de servir.
      await page.getByRole("button", { name: "Salir" }).click();
      await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
      expect((await context.request.get("/api/yo")).status()).toBe(401);
    } finally {
      await context.close();
    }
  });
}

test("un origen ajeno NO pasa aunque lleve una sesión válida: el servidor lo rechaza con 403 y no guarda nada", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: mundo.base });
  const page = await context.newPage();
  try {
    const u = mundo.usuarios.asesor;
    await entrarPorPantalla(page, u.correo, u.contrasena);
    await expect(page).toHaveURL(/\/embudo$/);
    // Lo que haría una página de otro sitio: la misma petición con otro `Origin`. (Desde esta página el navegador no deja falsear el origen, así que se manda con la API del contexto.)
    const r = await context.request.post("/api/sesion", { data: { organizacion: mundo.organizacion.slug, correo: u.correo, contrasena: u.contrasena }, headers: { origin: "http://localhost.evil.example" } });
    expect(r.status()).toBe(403);
    const r2 = await context.request.post("/api/sesion", { data: { organizacion: mundo.organizacion.slug, correo: u.correo, contrasena: u.contrasena }, headers: { origin: "http://127.0.0.1:9" } });
    expect(r2.status(), "otro puerto de la máquina propia sí es local").toBe(201);
  } finally {
    await context.close();
  }
});
