// V12: la demo levantada por `npm run demo:todo`, vista como la ve cada persona: entran los cuatro usuarios con la contraseña de la demo, llegan a su pantalla de inicio, ven
// SUS secciones y lo que la demo les dejó a la vista. Deja una captura de escritorio y otra de celular por rol en DEMO_CAPTURAS (por omisión docs/capturas/v1) con el
// prefijo DEMO_PREFIJO (por omisión «v12»). No toca datos: solo mira.

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const CONTRASENA = "Demo-local-2026!";
const DIR = resolve(import.meta.dirname, "..", "..", process.env["DEMO_CAPTURAS"] ?? "docs/capturas/v1");
const PREFIJO = process.env["DEMO_PREFIJO"] ?? "v12";
mkdirSync(DIR, { recursive: true });
// La demo limita los inicios de sesión (10 por minuto desde una misma IP): se entra UNA vez por rol y las demás pantallas reusan esa sesión.
const SESIONES = mkdtempSync(resolve(tmpdir(), "demo-sesiones-"));
const sesionDe = (id: string): string => resolve(SESIONES, `${id}.json`);

interface Rol {
  id: string;
  correo: string;
  nombre: string;
  inicio: RegExp;
  secciones: string[];
  /** Algo que la demo deja a la vista en su pantalla de inicio. */
  aLaVista: RegExp;
}
const ROLES: Rol[] = [
  { id: "administrador", correo: "admin@demo.test", nombre: "Administrador demo", inicio: /\/embudo$/, secciones: ["Embudo", "Tareas", "Tableros", "Administración", "Alumnos", "Familias", "Registrar pago"], aLaVista: /Nuevo/ },
  { id: "asesor", correo: "asesor@demo.test", nombre: "Asesor demo", inicio: /\/embudo$/, secciones: ["Embudo", "Tareas", "Familias"], aLaVista: /Nuevo/ },
  { id: "maestro", correo: "maestro@demo.test", nombre: "Maestro demo", inicio: /\/hoy$/, secciones: ["Hoy", "Pase de lista"], aLaVista: /.+/ },
  { id: "recepcion", correo: "recepcion@demo.test", nombre: "Recepción demo", inicio: /\/pagos$/, secciones: ["Registrar pago", "Estado de cuenta", "Uniformes", "Ventas"], aLaVista: /Buscar|familia/i },
];

async function entrar(page: Page, correo: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill(CONTRASENA);
  await page.getByRole("button", { name: "Entrar" }).click();
}

for (const r of ROLES) {
  test(`${r.id}: entra con su usuario de la demo, llega a su pantalla de inicio y ve sus secciones`, async ({ page }) => {
    await entrar(page, r.correo);
    await expect(page).toHaveURL(r.inicio);
    await expect(page.getByTestId("usuario")).toHaveText(r.nombre);
    const lateral = page.getByRole("navigation", { name: "Secciones" });
    for (const etiqueta of r.secciones) await expect(lateral.getByRole("link", { name: etiqueta })).toBeVisible();
    await expect(page.locator("main")).toContainText(r.aLaVista);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: resolve(DIR, `${PREFIJO}-${r.id}-escritorio.png`) });
    await page.context().storageState({ path: sesionDe(r.id) });
  });

  test(`${r.id}: lo mismo en el celular (390 × 844)`, async ({ browser }) => {
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-MX", timezoneId: "America/Mexico_City", baseURL: process.env["DEMO_URL"] ?? "http://localhost:3000", storageState: sesionDe(r.id) });
    const page = await contexto.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(r.inicio);
    await expect(page.getByTestId("usuario")).toHaveText(r.nombre);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: resolve(DIR, `${PREFIJO}-${r.id}-celular.png`) });
    await contexto.close();
  });
}

test("el asesor ve los leads que dejó la demo y recepción encuentra a la familia con cobros por teléfono", async ({ browser }) => {
  const como = async (id: string) => (await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: "es-MX", timezoneId: "America/Mexico_City", baseURL: process.env["DEMO_URL"] ?? "http://localhost:3000", storageState: sesionDe(id) })).newPage();
  const asesor = await como("asesor");
  await asesor.goto("/embudo");
  await expect(asesor.locator("main")).toContainText(/Olvera|Quiroz|Montes|Ibarra/);
  const page = await como("recepcion");
  await page.goto("/pagos");
  await page.getByLabel(/Teléfono o nombre/).fill("55 9901 0009");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.locator("main")).toContainText(/Vivanco/);
  await page.getByRole("button", { name: /Elegir/ }).first().click();
  await expect(page.locator("main")).toContainText(/Mensualidad|Uniforme|Playera|mensualidad/);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: resolve(DIR, `${PREFIJO}-recepcion-familia-con-cobros-escritorio.png`) });
});
