// V2 (decisión 5): un lead sin sucursal lo ve y atiende cualquier asesor hasta que tenga una. En pantalla: aparece en el embudo del asesor del norte (que NO es «su» sucursal), su
// ficha abre y se puede mover de etapa; en cuanto se le pone sucursal del sur, desaparece del embudo del asesor del norte. El lead es de esta prueba y se da de baja al terminar
// (soft delete, invariante 3) para no mover los conteos de las demás.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { comoRol, expect, mundo, test } from "./fixtura.ts";
import { carpetaDeCapturas } from "./mundo.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";

test.use(comoRol("asesor"));
test.describe.configure({ mode: "serial" });

let prisma: PrismaPruebas;
let admin: APIRequestContext;
let leadId = "";
const etapa = (tipo: string): string => mundo.etapas[tipo] ?? "";

test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  admin = await apiComo("administrador");
  const org = mundo.organizacion.id;
  const lead = await prisma.lead.create({
    data: { organizacion_id: org, vertical_interes_id: (await prisma.vertical.findFirstOrThrow({ where: { organizacion_id: org } })).id, etapa_id: etapa("nuevo"), nombre_contacto: "Familia Sin Sucursal", telefono: "+525599990001" },
  });
  leadId = lead.id;
  await prisma.prospecto.create({ data: { organizacion_id: org, lead_id: leadId, vertical_interes_id: lead.vertical_interes_id, nombre: "Niña Sin Sucursal", edad_declarada: 7, origen: "asesor" } });
});
test.afterAll(async () => {
  await prisma.lead.update({ where: { id: leadId }, data: { eliminado_en: new Date() } });
  await prisma.$disconnect();
  await admin.dispose();
});

test("el asesor del norte ve en su embudo al lead sin sucursal, abre su ficha y lo mueve de etapa; el lead del sur sigue oculto", async ({ page }) => {
  await page.goto("/embudo");
  await expect(page.getByRole("heading", { name: "Embudo" })).toBeVisible();
  const tarjeta = page.getByTestId(`columna-${etapa("nuevo")}`).getByTestId(`lead-${leadId}`);
  await expect(tarjeta).toContainText("Familia Sin Sucursal");
  await expect(page.getByTestId(`lead-${mundo.asesor.delta.leadId}`)).toHaveCount(0);
  const carpeta = carpetaDeCapturas("v1");
  mkdirSync(carpeta, { recursive: true });
  await page.screenshot({ path: resolve(carpeta, "v2-03-embudo-lead-sin-sucursal-escritorio.png"), animations: "disabled" });

  await page.goto(`/leads/${leadId}`);
  await expect(page.getByRole("heading", { name: "Familia Sin Sucursal" })).toBeVisible();
  await expect(page.getByTestId(`prospecto-${(await prisma.prospecto.findFirstOrThrow({ where: { lead_id: leadId } })).id}`)).toContainText("Niña Sin Sucursal");

  await page.goto("/embudo");
  await page.getByTestId(`lead-${leadId}`).getByRole("button", { name: "Mover de etapa" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/^Nueva etapa/).selectOption({ label: "Etapa B" });
  await d.getByRole("button", { name: "Mover", exact: true }).click();
  await expect(page.getByTestId(`columna-${etapa("contactado")}`).getByTestId(`lead-${leadId}`)).toBeVisible();
  expect((await json<{ etapa: { id: string } }>(admin, `/api/leads/${leadId}`)).etapa.id).toBe(etapa("contactado"));
});

test("en cuanto el lead tiene sucursal del sur, el asesor del norte deja de verlo (ni en el embudo ni por dirección directa)", async ({ page }) => {
  await prisma.lead.update({ where: { id: leadId }, data: { sucursal_interes_id: (await prisma.sucursal.findFirstOrThrow({ where: { organizacion_id: mundo.organizacion.id, nombre: "Sur" } })).id } });
  await page.goto("/embudo");
  await expect(page.getByRole("heading", { name: "Embudo" })).toBeVisible();
  await expect(page.getByTestId(`lead-${leadId}`)).toHaveCount(0);
  await page.goto(`/leads/${leadId}`);
  await expect(page.getByRole("heading", { name: "Familia Sin Sucursal" })).toHaveCount(0);
  await expect(page.getByTestId(`lead-${leadId}`)).toHaveCount(0);
});
