// J5: recepción — registrar pago (reparto entre dos hijos, parcial, doble clic idempotente, cancelación), estado de cuenta, uniformes por entregar y ventas.
// Los importes se comprueban como TEXTO exacto contra la API.

import type { APIRequestContext } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { capturar, comoRol, expect, mundo, test, contextoConReloj } from "./fixtura.ts";

test.use(comoRol("recepcion"));
test.describe.configure({ mode: "serial" });

const { gomez, uniforme, productos } = mundo.recepcion;
let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

interface Cuenta {
  resumen: { saldo: string; vencido: string; total_pagado: string; antiguedad: Record<string, string> };
  hijos: { alumno: { id: string }; cargos: { id: string; concepto: string; saldo: string; descripcion: string | null }[] }[];
}
const cuenta = () => json<Cuenta>(admin, `/api/tutores/${gomez.tutorId}/estado-cuenta`);
const pagosDe = async () => (await json<{ datos: { id: string; estatus: string; monto: string; aplicaciones: { monto: string; alumno: { nombre: string } }[] }[] }>(admin, `/api/pagos?tutor_id=${gomez.tutorId}&limite=50`)).datos;

async function elegirFamilia(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/pagos");
  await page.getByLabel("Teléfono o nombre de la familia").fill("55 5501-0101");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByTestId(`familia-${gomez.tutorId}`).getByRole("button", { name: "Elegir" }).click();
}

test.describe("cambiar de familia (EK-UI-01)", () => {
  test("mientras carga la familia nueva NO se ve el saldo ni los cargos de la anterior, y el formulario de pago no está disponible", async ({ page }) => {
    const otros = (await json<{ datos: { id: string; telefono: string; nombre: string }[] }>(admin, "/api/tutores?limite=50")).datos.filter((t) => t.id !== gomez.tutorId);
    const otro = otros[0]!;
    await elegirFamilia(page);
    await expect(page.getByText("Hijo Uno").first()).toBeVisible();
    // El estado de cuenta de la nueva familia tarda: durante la espera no debe quedar nada de la anterior.
    let liberar: () => void = () => {};
    const espera = new Promise<void>((r) => (liberar = r));
    await page.route(`**/api/tutores/${otro.id}/estado-cuenta`, async (ruta) => {
      await espera;
      await ruta.continue();
    });
    await page.getByRole("button", { name: "Cambiar de familia" }).click();
    await page.getByLabel("Teléfono o nombre de la familia").fill(otro.telefono);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByTestId(`familia-${otro.id}`).getByRole("button", { name: "Elegir" }).click();
    await expect(page.getByText("Hijo Uno")).toHaveCount(0);
    await expect(page.getByText("Hija Dos")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);
    const llegó = page.waitForResponse((r) => r.url().includes(`/api/tutores/${otro.id}/estado-cuenta`));
    liberar();
    expect((await llegó).status()).toBe(200);
    await expect(page.getByText("Hijo Uno")).toHaveCount(0);
  });
});

test.describe("buscar a la familia", () => {
  test("por teléfono en cualquier formato y por nombre; lo que no existe se dice", async ({ page }) => {
    await page.goto("/pagos");
    const caja = page.getByLabel("Teléfono o nombre de la familia");
    await caja.fill("(55) 5501 0101");
    await page.getByRole("button", { name: "Buscar" }).click();
    const tarjeta = page.getByTestId(`familia-${gomez.tutorId}`);
    await expect(tarjeta).toContainText("Hijo Uno");
    await expect(tarjeta).toContainText("Hija Dos");
    await caja.fill("Gómez");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByTestId(`familia-${gomez.tutorId}`)).toBeVisible();
    await caja.fill("Zzzzzz");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("No encontré a esa familia")).toBeVisible();
    await capturar(page, "40-buscar-familia", "celular");
  });
});

test.describe("registrar pago", () => {
  test("lo adeudado con sus vencidos, el reparto que propone el servidor (primero lo que venció antes) y un excedente rechazado", async ({ page }) => {
    await elegirFamilia(page);
    await expect(page.getByTestId("saldo-total")).toHaveText("$3,800.00");
    await expect(page.getByTestId("saldo-vencido")).toHaveText("$800.00");
    await expect(page.getByTestId(`cargo-${gomez.cargoVencidoId}`)).toContainText("Examen anterior");
    await expect(page.getByTestId(`cargo-${gomez.cargoVencidoId}`)).toContainText("Vencido 40 d");
    await page.getByLabel(/^Monto recibido/).fill("1,000");
    const propuesta = page.getByTestId("propuesta");
    await expect(propuesta).toContainText("Examen anterior: $800.00");
    await expect(propuesta).toContainText("$200.00");
    await expect(propuesta).toContainText("Pago parcial");
    // Un importe con más de dos decimales o letras se rechaza en la pantalla.
    await page.getByLabel(/^Monto recibido/).fill("12.345");
    await expect(page.getByText("Escribe un importe válido")).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar pago" })).toBeDisabled();
    // Más de lo que adeuda: el servidor lo rechaza y la pantalla lo explica (no existe «saldo a favor»).
    await page.getByLabel(/^Monto recibido/).fill("4000");
    await expect(page.getByText("El pago pasa de lo que la familia adeuda")).toBeVisible();
    await expect(page.getByText(/sobran \$200\.00/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar pago" })).toBeDisabled();
    await capturar(page, "41-registrar-pago", "celular", { completa: true });
    await capturar(page, "41-registrar-pago", "escritorio");
  });

  test("un pago repartido a mano entre los cargos de DOS hijos: cuadra al centavo y los saldos lo reflejan", async ({ page }) => {
    await elegirFamilia(page);
    await page.getByLabel(/^Monto recibido/).fill("1500");
    await page.getByRole("radio", { name: "Transferencia" }).check();
    await page.getByLabel("Referencia (opcional)").fill("TRANS-0001");
    await page.getByRole("button", { name: "Ajustar el reparto a mano" }).click();
    const ajuste = page.getByTestId("ajuste");
    // El reparto a mano parte del que propuso el servidor; recepción lo rehace a su gusto.
    for (const campo of await ajuste.getByRole("textbox").all()) await campo.fill("");
    await ajuste.getByLabel(/Hijo Uno · Inscripción/).fill("500");
    await ajuste.getByLabel(/Hija Dos · Mensualidad/).fill("999.99");
    // Un centavo menos: no cuadra y lo dice.
    await expect(page.getByTestId("suma-del-reparto")).toContainText("faltan $0.01");
    await expect(page.getByRole("button", { name: "Registrar pago" })).toBeDisabled();
    await ajuste.getByLabel(/Hija Dos · Mensualidad/).fill("1000");
    await expect(page.getByTestId("suma-del-reparto")).toContainText("cuadra");
    // Un cargo no puede recibir más que su saldo.
    await ajuste.getByLabel(/Hija Dos · Inscripción/).fill("999");
    await expect(ajuste).toContainText("Pasa del saldo de este cargo");
    await ajuste.getByLabel(/Hija Dos · Inscripción/).fill("");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    const listo = page.getByTestId("pago-registrado");
    await expect(listo).toContainText("$1,500.00");
    await expect(listo).toContainText("Hijo Uno · Inscripción: $500.00");
    await expect(listo).toContainText("Hija Dos · Mensualidad");
    const pagos = await pagosDe();
    expect(pagos).toHaveLength(1);
    expect(pagos[0]?.aplicaciones.map((a) => `${a.alumno.nombre}:${a.monto}`).sort()).toEqual(["Hija Dos:1000.00", "Hijo Uno:500.00"]);
    const c = await cuenta();
    expect(c.resumen.saldo).toBe("2300.00");
    expect(c.resumen.total_pagado).toBe("1500.00");
    await expect(page.getByTestId("saldo-total")).toHaveText("$2,300.00");
    await capturar(page, "42-pago-registrado", "celular");
  });

  test("pago parcial: abona al cargo que venció primero y deja el resto pendiente", async ({ page }) => {
    await elegirFamilia(page);
    await page.getByLabel(/^Monto recibido/).fill("300");
    await expect(page.getByTestId("propuesta")).toContainText("Examen anterior: $300.00");
    await expect(page.getByTestId("propuesta")).toContainText("Pago parcial");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByTestId("pago-registrado")).toContainText("$300.00");
    const c = await cuenta();
    expect(c.resumen.saldo).toBe("2000.00");
    expect(c.resumen.vencido).toBe("500.00");
    expect(c.hijos.flatMap((h) => h.cargos).find((x) => x.id === gomez.cargoVencidoId)?.saldo).toBe("500.00");
  });

  test("un doble clic registra UN pago; y un reintento tras un corte de red, con la misma clave, tampoco lo duplica", async ({ page }) => {
    const antes = (await pagosDe()).length;
    await elegirFamilia(page);
    await page.getByLabel(/^Monto recibido/).fill("100");
    await expect(page.getByTestId("propuesta")).toBeVisible();
    await page.getByRole("button", { name: "Registrar pago" }).dblclick();
    await expect(page.getByTestId("pago-registrado")).toContainText("$100.00");
    expect((await pagosDe()).length).toBe(antes + 1);

    // Reintento: el servidor procesa el pago pero la respuesta no llega (corte de red). La persona vuelve a pulsar y el servidor reconoce la clave.
    await page.getByRole("button", { name: "Registrar otro pago" }).click();
    await page.getByLabel(/^Monto recibido/).fill("50");
    await expect(page.getByTestId("propuesta")).toBeVisible();
    await page.route("**/api/pagos", async (ruta) => {
      if (ruta.request().method() !== "POST") return ruta.continue();
      await ruta.fetch(); // el servidor lo procesa…
      return ruta.abort("failed"); // …pero la pantalla no se entera.
    });
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByText("No hay conexión con el servidor")).toBeVisible();
    await expect(page.getByText(/NO lo duplica/)).toBeVisible();
    expect((await pagosDe()).length).toBe(antes + 2);
    await page.unroute("**/api/pagos");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByText("Este pago ya estaba registrado: no se duplicó")).toBeVisible();
    expect((await pagosDe()).length, "el reintento no duplicó el pago").toBe(antes + 2);
  });

  test("cancelar un pago: no se borra, queda cancelado con su motivo y los cargos recuperan el saldo", async ({ page }) => {
    const antes = await cuenta();
    await elegirFamilia(page);
    const pagos = await pagosDe();
    const ultimo = pagos.find((p) => p.monto === "50.00" && p.estatus === "aplicado")!;
    await page.getByTestId(`pago-${ultimo.id}`).getByRole("button", { name: "Cancelar pago" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByRole("button", { name: "Cancelar el pago" })).toBeDisabled();
    await d.getByLabel(/^Motivo de la cancelación/).fill("Se cobró de más");
    await d.getByRole("button", { name: "Cancelar el pago" }).click();
    await expect(page.getByTestId(`pago-${ultimo.id}`)).toContainText("Cancelado");
    await expect(page.getByTestId(`pago-${ultimo.id}`)).toContainText("Se cobró de más");
    const despues = await cuenta();
    expect(despues.resumen.saldo).toBe(sumar(antes.resumen.saldo, "50.00"));
    const p = (await pagosDe()).find((x) => x.id === ultimo.id);
    expect(p?.estatus).toBe("cancelado");
  });
});

/** Suma exacta de dos importes de prueba (centavos enteros, sin flotantes). */
function sumar(a: string, b: string): string {
  const c = (t: string): bigint => BigInt(t.replace(".", ""));
  const total = c(a) + c(b);
  return `${total / 100n}.${(total % 100n).toString().padStart(2, "0")}`;
}

test.describe("estado de cuenta", () => {
  test("saldo, vencido con su antigüedad, cargos por hijo y pagos, iguales a los de la API", async ({ page }) => {
    await page.goto("/cuenta");
    await page.getByLabel("Teléfono o nombre de la familia").fill("5555010101");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByTestId(`familia-${gomez.tutorId}`).getByRole("button", { name: "Elegir" }).click();
    const api = await cuenta();
    const formato = (t: string): string => `$${(t.split(".")[0] ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${t.split(".")[1]}`;
    await expect(page.getByTestId("saldo")).toHaveText(formato(api.resumen.saldo));
    await expect(page.getByTestId("vencido")).toHaveText(formato(api.resumen.vencido));
    await expect(page.getByTestId("antiguedad")).toContainText(`31 a 60 días${formato(api.resumen.antiguedad["de_31_a_60"] ?? "0.00")}`);
    await expect(page.getByTestId("antiguedad")).toContainText(`1 a 30 días${formato(api.resumen.antiguedad["de_0_a_30"] ?? "0.00")}`);
    const hijoUno = page.getByTestId(`cargos-${gomez.hijos[0]!.alumnoId}`);
    await expect(hijoUno).toContainText("Examen anterior");
    await expect(hijoUno).toContainText("Vencido 40 d");
    await expect(page.getByTestId("pagos-de-la-cuenta")).toContainText("Cancelado");
    await expect(page.getByTestId("pagos-de-la-cuenta")).toContainText("$1,500.00");
    await capturar(page, "43-estado-de-cuenta", "escritorio", { completa: true });
    await capturar(page, "43-estado-de-cuenta", "celular", { completa: true });
  });

  test("un asesor puede leerlo, pero no registra pagos (ni ve esa sección ni entra por URL)", async ({ browser }) => {
    const contexto = await contextoConReloj(browser, { storageState: comoRol("asesor").storageState });
    const page = await contexto.newPage();
    await page.goto(`/cuenta/${gomez.tutorId}`);
    await expect(page.getByTestId("saldo")).toBeVisible();
    await page.goto("/pagos");
    await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    await contexto.close();
  });
});

test.describe("uniformes por entregar", () => {
  test("entregar descuenta UNA pieza de la talla del alumno, crea la venta promocional y sale de la lista", async ({ page }) => {
    await page.goto("/uniformes");
    const b = page.getByTestId(`beneficio-${uniforme.beneficioId}`);
    await expect(b).toContainText("Alumno Uniforme");
    await expect(b).toContainText("talla 8");
    await expect(b).toContainText("Uniforme de bienvenida");
    await expect(page.getByTestId("existencia")).toContainText("Uniforme · talla 8 · $350.00: 3 piezas");
    await capturar(page, "44-uniformes", "celular");
    await b.getByRole("button", { name: "Marcar entregado" }).click();
    const d = page.getByRole("dialog");
    // La talla del alumno primero: solo se ofrece la 8.
    await expect(d.getByLabel("Pieza que se entrega")).toContainText("Uniforme · talla 8 · 3 en existencia");
    await expect(d.getByLabel("Pieza que se entrega")).not.toContainText("talla 10");
    await d.getByRole("button", { name: "Marcar como entregado" }).click();
    await expect(b).toHaveCount(0);
    await expect(page.getByTestId("existencia")).toContainText("Uniforme · talla 8 · $350.00: 2 piezas");
    expect((await json<{ stock: number }>(admin, `/api/productos/${productos.uniforme8.id}`)).stock).toBe(2);
    expect((await json<{ stock: number }>(admin, `/api/productos/${productos.uniforme10.id}`)).stock).toBe(2);
    const ventas = await json<{ datos: { es_promocional: boolean; total: string; cantidad: number }[] }>(admin, `/api/ventas?producto_id=${productos.uniforme8.id}`);
    expect(ventas.datos).toHaveLength(1);
    expect(ventas.datos[0]).toMatchObject({ es_promocional: true, total: "0.00", cantidad: 1 });
    const pendientes = await json<{ datos: { id: string }[] }>(admin, "/api/beneficios/por-entregar?limite=100");
    expect(pendientes.datos.map((x) => x.id)).not.toContain(uniforme.beneficioId);
  });
});

test.describe("ventas", () => {
  test("vender con la existencia a la vista; la última pieza queda «agotada»; anular la devuelve", async ({ page }) => {
    await page.goto("/ventas");
    const playera = page.getByTestId(`producto-${productos.playera.id}`);
    await expect(playera).toContainText("Última pieza");
    await expect(playera.getByTestId("existencia-del-producto")).toHaveText("1");
    await page.getByLabel("Buscar al alumno por nombre").fill("Hijo");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByLabel("Alumno", { exact: true })).toContainText("Hijo Uno Gómez");
    await page.getByLabel("Producto").selectOption({ label: "Playera · $120.00 · 1 en existencia" });
    await page.getByLabel("Cantidad").fill("2");
    await expect(page.getByText("Solo hay 1 en existencia")).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar venta" })).toBeDisabled();
    await page.getByLabel("Cantidad").fill("1");
    await expect(page.getByTestId("total-de-la-venta")).toContainText("$120.00");
    await page.getByRole("button", { name: "Registrar venta" }).click();
    await expect(page.getByTestId("venta-registrada")).toContainText("1 × Playera");
    await expect(playera).toContainText("Agotado");
    await expect(playera.getByTestId("existencia-del-producto")).toHaveText("0");
    expect((await json<{ stock: number }>(admin, `/api/productos/${productos.playera.id}`)).stock).toBe(0);
    // El cargo de la venta quedó a nombre de la familia.
    const cargos = await json<{ datos: { concepto: string; monto_final: string }[] }>(admin, `/api/cargos?tutor_id=${gomez.tutorId}&concepto=producto`);
    expect(cargos.datos.map((c) => c.monto_final)).toContain("120.00");
    await capturar(page, "45-ventas", "celular", { completa: true });
    // Anular devuelve la pieza.
    await page.getByTestId("ventas-recientes").locator("li").filter({ hasText: "Playera" }).getByRole("button", { name: "Anular" }).click();
    await page.getByRole("dialog").getByLabel(/^Motivo de la anulación/).fill("Se equivocó de producto");
    await page.getByRole("dialog").getByRole("button", { name: "Anular la venta" }).click();
    await expect(page.getByTestId(`producto-${productos.playera.id}`).getByTestId("existencia-del-producto")).toHaveText("1");
    expect((await json<{ stock: number }>(admin, `/api/productos/${productos.playera.id}`)).stock).toBe(1);
  });

  test("dos ventas por la última pieza: gana una; la otra recibe el error, la pantalla lo explica y refresca la existencia", async ({ page }) => {
    await page.goto("/ventas");
    await page.getByLabel("Buscar al alumno por nombre").fill("Hija");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByLabel("Alumno", { exact: true })).toContainText("Hija Dos Gómez");
    await page.getByLabel("Producto").selectOption({ label: "Gorra · $80.00 · 1 en existencia" });
    // Mientras la pantalla está abierta, otra persona vende la última gorra (por la API).
    const alumno = await json<{ datos: { id: string }[] }>(admin, "/api/alumnos?nombre=Hijo");
    const otra = await admin.post("/api/ventas", { data: { alumno_id: alumno.datos[0]!.id, producto_id: productos.gorra.id, cantidad: 1 } });
    expect(otra.status()).toBe(201);
    await page.getByRole("button", { name: "Registrar venta" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByTestId(`producto-${productos.gorra.id}`).getByTestId("existencia-del-producto")).toHaveText("0");
    await expect(page.getByTestId(`producto-${productos.gorra.id}`)).toContainText("Agotado");
    // Se vendió una sola: no se descontó dos veces ni quedó negativa.
    expect((await json<{ stock: number }>(admin, `/api/productos/${productos.gorra.id}`)).stock).toBe(0);
    const ventas = await json<{ datos: { estatus: string }[] }>(admin, `/api/ventas?producto_id=${productos.gorra.id}`);
    expect(ventas.datos.filter((v) => v.estatus === "registrada")).toHaveLength(1);
  });
});
