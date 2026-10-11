// J3: el asesor (sucursal norte): embudo, tareas, ficha del lead con su cotización, clase muestra y enlace a Chatwoot. Lo que se hace en pantalla se comprueba por la API.

import type { APIRequestContext } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { capturar, comoRol, expect, mundo, test } from "./fixtura.ts";

test.use(comoRol("asesor"));
test.describe.configure({ mode: "serial" });

const { alfa, beta, gamma, delta, motivos } = mundo.asesor;
const etapa = (tipo: string): string => mundo.etapas[tipo] ?? "";
let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});
const leadApi = (id: string) => json<{ etapa: { id: string; nombre: string }; motivo_perdida_id: string | null; recuperaciones: number }>(admin, `/api/leads/${id}`);

test.describe("embudo", () => {
  test("tablero por etapa con los leads de SU sucursal (nunca los de otra) y alertas de estancados", async ({ page }) => {
    await page.goto("/embudo");
    await expect(page.getByRole("heading", { name: "Embudo" })).toBeVisible();
    await expect(page.getByTestId(`columna-${etapa("nuevo")}`).getByTestId(`lead-${alfa.leadId}`)).toContainText("Familia Alfa");
    await expect(page.getByTestId(`columna-${etapa("contactado")}`).getByTestId(`lead-${beta.leadId}`)).toBeVisible();
    await expect(page.getByTestId(`lead-${delta.leadId}`)).toHaveCount(0);
    await expect(page.getByText("Familia Delta")).toHaveCount(0);
    await expect(page.getByTestId(`lead-${gamma.leadId}`)).toContainText("Sin movimiento 10 d");
    await expect(page.getByTestId(`lead-${beta.leadId}`)).not.toContainText("Sin movimiento");
    // R2a: el indicador «Llevan días sin movimiento» lleva la cifra aparte (ya no es una frase con el número adentro).
    const estancados = page.getByTestId("indicador-estancados");
    await expect(estancados).toContainText("Llevan días sin movimiento");
    await expect(estancados.locator(".indicador-valor")).toHaveText("1");
    await capturar(page, "20-embudo", "escritorio");
    await capturar(page, "20-embudo", "celular");
  });

  test("filtros: solo estancados, por fuente, y la vista de lista", async ({ page }) => {
    await page.goto("/embudo");
    await page.getByRole("button", { name: "Ver solo estos" }).click();
    await expect(page.getByTestId(`lead-${gamma.leadId}`)).toBeVisible();
    await expect(page.getByTestId(`lead-${alfa.leadId}`)).toHaveCount(0);
    await page.getByLabel("Solo estancados").uncheck();
    await page.getByLabel("Fuente").selectOption({ label: "Facebook" });
    await expect(page.getByTestId(`lead-${alfa.leadId}`)).toBeVisible();
    await expect(page.getByTestId(`lead-${beta.leadId}`)).toHaveCount(0);
    await page.getByLabel("Fuente").selectOption({ label: "Todas las fuentes" });
    await page.getByRole("tab", { name: "Lista" }).click();
    const fila = page.getByRole("row").filter({ hasText: "Familia Gamma" });
    await expect(fila).toContainText("Estancado");
    await expect(fila).toContainText("Etapa B");
    await expect(fila).toContainText("Norte");
  });

  test("la ficha de un lead de otra sucursal no se abre ni por URL directa", async ({ page }) => {
    await page.goto(`/leads/${delta.leadId}`);
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo cargar" })).toContainText(/No se encontr/);
  });
});

test.describe("ficha del lead", () => {
  test("datos, atribución, alumnos y el enlace a su conversación en Chatwoot (sin visitarlo)", async ({ page }) => {
    await page.goto(`/leads/${alfa.leadId}`);
    await expect(page.getByRole("heading", { name: "Familia Alfa" })).toBeVisible();
    await expect(page.getByTestId("etapa-actual")).toContainText("Primera");
    await expect(page.getByText("Facebook", { exact: true })).toBeVisible();
    await expect(page.getByText(mundo.asesor.campanaNombre)).toBeVisible();
    await expect(page.getByText("ABCD2345")).toBeVisible();
    await expect(page.getByTestId(`prospecto-${alfa.prospectoId}`)).toContainText("Niña Alfa · 6 años");
    const enlace = page.getByTestId("enlace-chatwoot");
    const { cuentaId, bandejaId, conversacionId } = alfa.chatwoot;
    await expect(enlace).toHaveAttribute("href", `https://chatwoot.prueba.invalid/app/accounts/${cuentaId}/inbox/${bandejaId}/conversations/${conversacionId}`);
    await expect(enlace).toHaveAttribute("target", "_blank");
    await expect(enlace).toHaveAttribute("rel", /noopener/);
    await expect(page.getByText("Todavía no hay cambios de etapa registrados")).toBeVisible();
    await expect(page.getByTestId(`tarea-${alfa.tareaId}`)).toContainText("Revisar los datos de Familia Alfa");
    await capturar(page, "21-ficha-lead", "escritorio", { completa: true });
    await capturar(page, "21-ficha-lead", "celular", { completa: true });
  });

  test("cotizar a mano: el servidor calcula el precio y la cotización queda guardada", async ({ page }) => {
    await page.goto(`/leads/${alfa.leadId}`);
    await page.getByRole("button", { name: "Cotizar a mano" }).click();
    await expect(page.getByLabel("Programa")).toContainText("Programa de prueba · $1,000.00 al mes");
    await page.getByLabel("Hermanos ya inscritos (opcional)").fill("abc");
    await expect(page.getByText("Escribe un número entero")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar cotización" })).toBeDisabled();
    await page.getByLabel("Hermanos ya inscritos (opcional)").fill("");
    await page.getByRole("button", { name: "Guardar cotización" }).click();
    const tarjeta = page.locator("[data-prueba^='cotizacion-']").first();
    await expect(tarjeta).toContainText("Programa de prueba · Niña Alfa");
    await expect(tarjeta).toContainText("Inscripción $500.00 · Mensualidad $1,000.00");
    await expect(tarjeta).toContainText("A mano");
    await expect(tarjeta).toContainText("Vigente");
    const c = await json<{ datos: { origen: string; estatus: string; snapshot: { programa: { precio: { costo_mensualidad: string } } } }[] }>(admin, `/api/leads/${alfa.leadId}/cotizaciones`);
    expect(c.datos).toHaveLength(1);
    expect(c.datos[0]).toMatchObject({ origen: "asesor", estatus: "vigente" });
    expect(c.datos[0]?.snapshot.programa.precio.costo_mensualidad).toBe("1000.00");
  });

  test("clase muestra: agendar con lugares, reprogramar y cancelar", async ({ page }) => {
    await page.goto(`/leads/${alfa.leadId}`);
    await page.getByRole("button", { name: "Agendar clase muestra" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByLabel("Grupo")).toContainText("Grupo A");
    const sesiones = await json<{ datos: { fecha_hora: string; lugares: number; completa: string }[] }>(admin, `/api/clases-muestra/sesiones?grupo_id=${mundo.grupos.a.id}&maximo=8`);
    const primera = sesiones.datos[0]!;
    await expect(dialogo.getByRole("radio").first()).toBeAttached();
    await expect(dialogo.getByText(`${primera.completa} · ${primera.lugares} ${primera.lugares === 1 ? "lugar" : "lugares"}`)).toBeVisible();
    expect(primera.lugares).toBeLessThanOrEqual(5); // cupo 8 menos los 3 alumnos inscritos
    await dialogo.getByRole("radio").first().check();
    await dialogo.getByRole("button", { name: "Agendar", exact: true }).click();
    const clase = page.locator("[data-prueba^='clase-']").first();
    await expect(clase).toContainText("Agendada");
    await expect(clase).toContainText(primera.completa.replace(/ a las .*/, ""));
    // Agendar mueve al lead a «muestra agendada»: la ficha lo muestra.
    await expect(page.getByTestId("etapa-actual")).toContainText("Etapa C");
    let lista = await json<{ datos: { estatus: string; fecha_hora: string }[] }>(admin, `/api/clases-muestra?lead_id=${alfa.leadId}`);
    expect(lista.datos.filter((c) => c.estatus === "agendada")).toHaveLength(1);
    expect(new Date(lista.datos[0]!.fecha_hora).toISOString()).toBe(new Date(primera.fecha_hora).toISOString());

    await clase.getByRole("button", { name: "Reprogramar" }).click();
    const re = page.getByRole("dialog");
    await expect(re.getByText("Reprogramar clase muestra")).toBeVisible();
    await re.getByRole("radio").nth(1).check();
    await re.getByRole("button", { name: "Reprogramar", exact: true }).click();
    await expect(re).toBeHidden();
    await expect
      .poll(async () => ((await json<{ datos: { estatus: string }[] }>(admin, `/api/clases-muestra?lead_id=${alfa.leadId}&limite=50`)).datos.map((c) => c.estatus).sort()))
      .toEqual(["agendada", "reagendada"]);
    // La pantalla muestra solo la vigente: la reagendada es historial.
    await expect(page.locator("[data-prueba^='clase-']")).toHaveCount(1);
    lista = await json(admin, `/api/clases-muestra?lead_id=${alfa.leadId}&limite=50`);
    const nueva = lista.datos.find((c) => c.estatus === "agendada")!;
    expect(new Date(nueva.fecha_hora).toISOString()).not.toBe(new Date(primera.fecha_hora).toISOString());

    await page.locator("[data-prueba^='clase-']").filter({ hasText: "Agendada" }).getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("dialog").getByLabel("Motivo (opcional)").fill("Cambió de planes");
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar la clase" }).click();
    await expect(page.locator("[data-prueba^='clase-']").filter({ hasText: "Cancelada" })).toContainText("Motivo: Cambió de planes");
    // Cancelar la única clase vigente regresa al lead a «contactado».
    await expect(page.getByTestId("etapa-actual")).toContainText("Etapa B");
    expect((await leadApi(alfa.leadId)).etapa.id).toBe(etapa("contactado"));
  });
});

test.describe("tareas", () => {
  test("pendientes con su tipo explicado; resolver y descartar quedan en el servidor", async ({ page }) => {
    await page.goto("/tareas");
    const t1 = page.getByTestId(`tarea-${alfa.tareaId}`);
    await expect(t1).toContainText("Revisión manual");
    await expect(t1).toContainText("Revisar los datos de Familia Alfa");
    await expect(t1.getByRole("link", { name: "Abrir la ficha" })).toHaveAttribute("href", `/leads/${alfa.leadId}`);
    await capturar(page, "22-tareas", "celular");
    await t1.getByRole("button", { name: "Marcar como hecha" }).click();
    await expect(t1).toHaveCount(0);
    const t2 = page.getByTestId(`tarea-${gamma.tareaId}`);
    await expect(t2).toContainText("Lead sin movimiento");
    await t2.getByRole("button", { name: "Descartar" }).click();
    await expect(t2).toHaveCount(0);
    await page.getByRole("tab", { name: "Resueltas" }).click();
    await expect(page.getByTestId(`tarea-${alfa.tareaId}`)).toContainText("Hecha");
    await expect(page.getByTestId(`tarea-${gamma.tareaId}`)).toContainText("Descartada");
    const t = await json<{ datos: { id: string; estado: string }[] }>(admin, "/api/tareas?estado=hecha");
    expect(t.datos.map((x) => x.id)).toContain(alfa.tareaId);
    expect((await json<{ datos: { id: string }[] }>(admin, "/api/tareas?estado=descartada")).datos.map((x) => x.id)).toContain(gamma.tareaId);
  });
});

test.describe("mover de etapa", () => {
  test("con historial: avanzar, perder EXIGE motivo y recuperar EXIGE nota", async ({ page }) => {
    await page.goto("/embudo");
    const tarjeta = () => page.getByTestId(`lead-${beta.leadId}`);
    await tarjeta().getByRole("button", { name: "Mover de etapa" }).click();
    let d = page.getByRole("dialog");
    await expect(d).toContainText("Ahora está en: Etapa B");
    // A «inscrito» no se llega moviendo.
    await expect(d.getByRole("option", { name: "Etapa F (se llega inscribiendo)" })).toBeDisabled();
    await d.getByLabel(/^Nueva etapa/).selectOption({ label: "Etapa D" });
    await d.getByLabel("Nota (opcional)").fill("Ya vino a su clase");
    await d.getByRole("button", { name: "Mover", exact: true }).click();
    await expect(page.getByTestId(`columna-${etapa("muestra_asistida")}`).getByTestId(`lead-${beta.leadId}`)).toBeVisible();
    expect((await leadApi(beta.leadId)).etapa.id).toBe(etapa("muestra_asistida"));

    // Perderlo exige el motivo.
    await tarjeta().getByRole("button", { name: "Mover de etapa" }).click();
    d = page.getByRole("dialog");
    await d.getByLabel(/^Nueva etapa/).selectOption({ label: "Etapa G" });
    await expect(d.getByRole("button", { name: "Mover", exact: true })).toBeDisabled();
    await expect(d).toContainText("Elige el motivo de pérdida");
    await d.getByLabel(/^Motivo de pérdida/).selectOption({ label: "Precio" });
    await d.getByRole("button", { name: "Mover", exact: true }).click();
    await expect(page.getByTestId(`columna-${etapa("perdido")}`).getByTestId(`lead-${beta.leadId}`)).toBeVisible();
    let l = await leadApi(beta.leadId);
    expect(l.etapa.id).toBe(etapa("perdido"));
    expect(l.motivo_perdida_id).toBe(motivos.precio);

    // Recuperarlo exige una nota.
    await tarjeta().getByRole("button", { name: "Mover de etapa" }).click();
    d = page.getByRole("dialog");
    await d.getByLabel(/^Nueva etapa/).selectOption({ label: "Etapa B" });
    await expect(d.getByRole("button", { name: "Mover", exact: true })).toBeDisabled();
    await expect(d).toContainText("la nota es obligatoria");
    await d.getByLabel(/^Nota/).fill("Volvió a escribir");
    await d.getByRole("button", { name: "Mover", exact: true }).click();
    await expect(page.getByTestId(`columna-${etapa("contactado")}`).getByTestId(`lead-${beta.leadId}`)).toContainText("Recuperado 1×");
    l = await leadApi(beta.leadId);
    expect(l.recuperaciones).toBe(1);
    expect(l.motivo_perdida_id).toBeNull();
    // El historial (en la ficha) cuenta las cuatro etapas.
    await page.goto(`/leads/${beta.leadId}`);
    const h = page.getByTestId("historial");
    await expect(h).toContainText("Etapa B → Etapa D");
    await expect(h).toContainText("Etapa D → Etapa G");
    await expect(h).toContainText("Motivo de pérdida: Precio");
    await expect(h).toContainText("Etapa G → Etapa B");
    await expect(h).toContainText("Nota: Volvió a escribir");
  });

  test("si otra persona movió al lead mientras tanto, avisa y recarga (no pisa su cambio)", async ({ page }) => {
    await page.goto("/embudo");
    await page.getByTestId(`lead-${gamma.leadId}`).getByRole("button", { name: "Mover de etapa" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel(/^Nueva etapa/).selectOption({ label: "Etapa D" });
    // Mientras el diálogo está abierto, el administrador lo manda a «Etapa E».
    const r = await admin.patch(`/api/leads/${gamma.leadId}/etapa`, { data: { etapa_id: etapa("negociacion") } });
    expect(r.status()).toBe(200);
    await d.getByRole("button", { name: "Mover", exact: true }).click();
    await expect(d).toContainText("El lead cambió mientras lo veías");
    await d.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId(`columna-${etapa("negociacion")}`).getByTestId(`lead-${gamma.leadId}`)).toBeVisible();
    expect((await leadApi(gamma.leadId)).etapa.id).toBe(etapa("negociacion"));
  });
});
