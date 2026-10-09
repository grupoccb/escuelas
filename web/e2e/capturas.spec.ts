// Capturas de las pantallas principales, en celular (390×844) y escritorio (1280×800), para que Eduardo las revise en dispositivos reales.
// Salen en docs/capturas/ con los datos ficticios de las pruebas. Cada bloque de la etapa J agrega las suyas aquí.

import { capturar, comoRol, expect, mundo, test } from "./fixtura.ts";

test.describe("capturas: acceso y navegación", () => {
  test("acceso", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await capturar(page, "01-acceso", "celular");
    await capturar(page, "01-acceso", "escritorio");
  });

  test.describe("administrador", () => {
    test.use(comoRol("administrador"));
    test("más", async ({ page }) => {
      await page.goto("/mas");
      await expect(page.getByRole("heading", { name: "Más" })).toBeVisible();
      await capturar(page, "02-mas", "celular");
    });
  });

  test.describe("maestro sin acceso a recepción", () => {
    test.use(comoRol("maestro"));
    test("sin acceso", async ({ page }) => {
      await page.goto("/pagos");
      await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
      await expect(page.getByRole("alert")).toContainText(mundo.usuarios.maestro.nombre);
      await capturar(page, "03-sin-acceso", "celular");
    });
  });
});
