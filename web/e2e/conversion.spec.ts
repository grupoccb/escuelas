// J4: el asistente de conversión e inscripción, SIN recaptura. Lo que el maestro ya capturó se ve con su valor y no se vuelve a pedir; solo hay campos para lo que
// falta; los rechazos del servidor (cupo, reglamento) se explican y llevan al paso que lo arregla; un doble clic no inscribe dos veces.

import type { APIRequestContext } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { capturar, comoRol, expect, mundo, test } from "./fixtura.ts";

test.use(comoRol("asesor"));
test.describe.configure({ mode: "serial" });

const { epsilon, zeta, grupoC, rellenoAlumnoId } = mundo.conversion;
let admin: APIRequestContext;
let asesor: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
  asesor = await apiComo("asesor");
});
test.afterAll(async () => {
  await admin.dispose();
  await asesor.dispose();
});

const siguiente = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /^(Siguiente|Revisar y confirmar)$/ });

test.describe("familia Épsilon: ya hay registro del maestro", () => {
  test("solo se pide lo que falta; lo capturado se ve y no se vuelve a pedir; un cupo que se llena se explica y se corrige; un doble clic inscribe UNA vez", async ({ page }) => {
    // La vista previa del servidor es la fuente: faltan exactamente los apellidos y el reglamento.
    const previa = await json<{ listo: boolean; faltantes: { campo: string }[] }>(asesor, `/api/leads/${epsilon.leadId}/conversion`);
    expect(previa.listo).toBe(false);
    expect(previa.faltantes.map((f) => f.campo).sort()).toEqual([`prospectos.${epsilon.prospectoId}.alumno.apellidos`, `prospectos.${epsilon.prospectoId}.reglamento`].sort());

    await page.goto(`/leads/${epsilon.leadId}/convertir`);
    await expect(page.getByRole("heading", { name: "Familia", exact: true })).toBeVisible();
    // Paso 1: el adulto sale del registro del maestro; no hay nada que escribir.
    await expect(page.getByTestId("adultos-capturados")).toContainText("Rosa Épsilon");
    await expect(page.getByTestId("adultos-capturados")).toContainText("madre");
    await expect(page.getByTestId("adultos-capturados")).toContainText("Responsable de pago");
    await expect(page.getByText("En este paso no hay nada por capturar")).toBeVisible();
    await expect(page.locator("main input:not([type=checkbox]):not([type=radio])")).toHaveCount(0); // ni un solo campo de texto: todo salió del registro
    await expect(page.getByLabel(/Parentesco/)).toHaveCount(0);
    await siguiente(page).click();

    // Paso 2: nombre y fecha de nacimiento ya capturados: se VEN, no se piden. Solo el campo de apellidos.
    const alumno = page.getByTestId(`alumno-${epsilon.prospectoId}`);
    await expect(alumno).toContainText("Nombre: Emilio");
    await expect(alumno).toContainText("Fecha de nacimiento: 2 mar 2018");
    await expect(alumno.getByTestId("dato-capturado")).toHaveCount(2);
    await expect(alumno.getByTestId("capturado-del-maestro")).toContainText("Masculino");
    await expect(alumno.getByTestId("capturado-del-maestro")).toContainText("Escuela Nueva");
    await expect(alumno.getByRole("textbox", { name: /^Nombre/ })).toHaveCount(0);
    await expect(alumno.locator("input[type=date]")).toHaveCount(0);
    await expect(alumno.getByRole("textbox")).toHaveCount(1); // solo los apellidos
    await expect(alumno.getByLabel(/^Apellidos/)).toBeVisible();
    await expect(siguiente(page)).toBeDisabled();
    await expect(page.getByTestId("falta-en-el-paso")).toContainText("Apellidos del alumno");
    await capturar(page, "30-conversion-alumno", "celular", { completa: true });
    await capturar(page, "30-conversion-alumno", "escritorio");
    await alumno.getByLabel(/^Apellidos/).fill("Épsilon Díaz");
    await expect(siguiente(page)).toBeEnabled();
    await siguiente(page).click();

    // Paso 3: el grupo que recomendó el maestro viene elegido y muestra sus lugares reales.
    const grupo = page.getByTestId(`grupo-${epsilon.prospectoId}`);
    await expect(grupo.getByRole("radio", { name: /Grupo C · 1 lugar · recomendado por el maestro/ })).toBeChecked();
    await expect(grupo.getByRole("radio", { name: /Grupo B · 8 lugares/ })).not.toBeChecked();
    await capturar(page, "31-conversion-grupo", "celular");
    await siguiente(page).click();

    // Paso 4: el precio y las promociones que calcula el servidor.
    const precio = page.getByTestId(`precio-${epsilon.prospectoId}`);
    await expect(precio).toContainText("Programa de prueba");
    await expect(precio).toContainText("Inscripción$500.00");
    await expect(precio).toContainText("Mensualidad$1,000.00");
    await expect(precio).toContainText("No aplica ninguna promoción hoy");
    await siguiente(page).click();

    // Paso 5: el reglamento falta: se registra con evidencia ahí mismo y el servidor deja de pedirlo.
    const reglamento = page.getByTestId(`reglamento-${epsilon.prospectoId}`);
    await expect(reglamento).toContainText("Falta que la familia acepte el reglamento vigente");
    const doc = reglamento.getByTestId("documento-reglamento");
    await doc.getByLabel("¿Quién responde?").selectOption({ label: "Rosa (madre)" });
    await doc.getByRole("button", { name: "Aceptan", exact: true }).click();
    await expect(reglamento).toContainText("La familia ya aceptó el reglamento vigente");
    await expect(page.getByRole("button", { name: "Revisar y confirmar" })).toBeEnabled();
    await page.getByRole("button", { name: "Revisar y confirmar" }).click();

    // Confirmación: nada falta y el resumen dice qué se va a crear.
    await expect(page.getByRole("heading", { name: "Confirmar" })).toBeVisible();
    await expect(page.getByTestId("lo-que-falta")).toHaveCount(0);
    await expect(page.getByTestId(`resumen-${epsilon.prospectoId}`)).toContainText("Emilio Épsilon Díaz");
    await expect(page.getByTestId(`resumen-${epsilon.prospectoId}`)).toContainText("Grupo C");
    await capturar(page, "32-conversion-confirmar", "celular", { completa: true });

    // Mientras la persona revisa, otra persona toma el único lugar del grupo C.
    const lleno = await admin.post("/api/inscripciones", { data: { alumno_id: rellenoAlumnoId, grupo_id: grupoC.id } });
    expect(lleno.status()).toBe(201);
    await page.getByRole("button", { name: "Convertir e inscribir" }).click();
    const aviso = page.getByRole("alert").filter({ hasText: /ya no tiene lugares/ });
    await expect(aviso).toBeVisible();
    // Nada quedó a medias: el servidor no creó al alumno.
    expect((await json<{ datos: unknown[] }>(admin, "/api/alumnos?nombre=Emilio")).datos).toHaveLength(0);
    await aviso.getByRole("button", { name: /Volver al paso «Grupo y horario»/ }).click();
    const grupo2 = page.getByTestId(`grupo-${epsilon.prospectoId}`);
    await expect(grupo2.getByRole("radio", { name: /Grupo C · Lleno/ })).toBeDisabled();
    await grupo2.getByRole("radio", { name: /Grupo B · 8 lugares/ }).check();
    await siguiente(page).click();
    await siguiente(page).click();
    await page.getByRole("button", { name: "Revisar y confirmar" }).click();
    await expect(page.getByTestId(`resumen-${epsilon.prospectoId}`)).toContainText("Grupo B");

    // Un doble clic no inscribe dos veces.
    await page.getByRole("button", { name: "Convertir e inscribir" }).dblclick();
    await expect(page.getByTestId("conversion-lista")).toContainText("Alumno creado · inscrito");

    const alumnos = await json<{ datos: { id: string; nombre: string; apellidos: string; fecha_nacimiento: string; sexo: string; escuela_nombre: string; tutores: { nombre: string; telefono: string; es_responsable_pago: boolean }[] }[] }>(admin, "/api/alumnos?nombre=Emilio");
    expect(alumnos.datos).toHaveLength(1);
    expect(alumnos.datos[0]).toMatchObject({ nombre: "Emilio", apellidos: "Épsilon Díaz", fecha_nacimiento: "2018-03-02", sexo: "masculino", escuela_nombre: "Escuela Nueva" });
    expect(alumnos.datos[0]?.tutores[0]).toMatchObject({ nombre: "Rosa", telefono: "+525544332211", es_responsable_pago: true });
    const insc = await json<{ datos: { grupo_id: string; estatus: string; precio_inscripcion_aplicado: string; precio_mensualidad_aplicado: string }[] }>(admin, `/api/inscripciones?alumno_id=${alumnos.datos[0]!.id}`);
    expect(insc.datos).toHaveLength(1);
    expect(insc.datos[0]).toMatchObject({ grupo_id: mundo.grupos.b.id, estatus: "activa", precio_inscripcion_aplicado: "500.00", precio_mensualidad_aplicado: "1000.00" });
    const tutor = (await json<{ datos: { id: string }[] }>(admin, "/api/tutores?telefono=5544332211")).datos;
    expect(tutor).toHaveLength(1);
    const cargos = await json<{ datos: { concepto: string; monto_final: string }[] }>(admin, `/api/cargos?tutor_id=${tutor[0]!.id}`);
    expect(cargos.datos.map((c) => c.concepto).sort()).toEqual(["inscripcion", "mensualidad"]);
    const lead = await json<{ etapa: { tipo_sistema: string } }>(admin, `/api/leads/${epsilon.leadId}`);
    expect(lead.etapa.tipo_sistema).toBe("inscrito");
    await capturar(page, "33-conversion-lista", "celular");
  });

  test("volver a abrir el asistente de un lead ya convertido no pide nada", async ({ page }) => {
    await page.goto(`/leads/${epsilon.leadId}/convertir`);
    await expect(page.getByText("Todo está convertido e inscrito")).toBeVisible();
    await expect(page.getByRole("button", { name: "Convertir e inscribir" })).toHaveCount(0);
  });
});

test.describe("familia Zeta: casi todo falta, y sin clase muestra", () => {
  test("pide solo lo que falta; sin clase muestra no hay dónde aceptar el reglamento y el servidor lo rechaza con el paso que lo arregla", async ({ page }) => {
    const previa = await json<{ faltantes: { campo: string }[] }>(asesor, `/api/leads/${zeta.leadId}/conversion`);
    expect(previa.faltantes.map((f) => f.campo).sort()).toEqual(["tutor.parentesco", `prospectos.${zeta.prospectoId}.alumno.apellidos`, `prospectos.${zeta.prospectoId}.alumno.fecha_nacimiento`, `prospectos.${zeta.prospectoId}.grupo_id`].sort());

    await page.goto(`/leads/${zeta.leadId}/convertir`);
    // Paso 1: el contacto (nombre y teléfono) ya está; solo falta el parentesco.
    await expect(page.getByRole("definition").filter({ hasText: "Familia Zeta" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Nombre del adulto/ })).toHaveCount(0);
    await expect(siguiente(page)).toBeDisabled();
    await page.getByLabel(/^Parentesco con el alumno/).fill("tía");
    await siguiente(page).click();
    // Paso 2: el nombre del alumno (de la landing o del bot) ya está; faltan apellidos y fecha.
    const alumno = page.getByTestId(`alumno-${zeta.prospectoId}`);
    await expect(alumno).toContainText("Nombre: Niña Zeta");
    await expect(alumno.getByRole("textbox", { name: /^Nombre/ })).toHaveCount(0);
    await alumno.getByLabel(/^Apellidos/).fill("Zeta Ruiz");
    await expect(siguiente(page)).toBeDisabled();
    await alumno.getByLabel(/^Fecha de nacimiento/).fill("2020-03-10");
    await siguiente(page).click();
    // Paso 3: elige grupo.
    const grupo = page.getByTestId(`grupo-${zeta.prospectoId}`);
    await expect(siguiente(page)).toBeDisabled();
    await grupo.getByRole("radio", { name: /Grupo B/ }).check();
    await siguiente(page).click();
    await expect(page.getByTestId(`precio-${zeta.prospectoId}`)).toContainText("Mensualidad$1,000.00");
    await siguiente(page).click();
    // Paso 5: sin clase muestra no hay dónde registrar la aceptación.
    await expect(page.getByTestId(`reglamento-${zeta.prospectoId}`)).toContainText("hace falta una clase muestra");
    await page.getByRole("button", { name: "Revisar y confirmar" }).click();
    await page.getByRole("button", { name: "Convertir e inscribir" }).click();
    const aviso = page.getByRole("alert").filter({ hasText: /reglamento/i });
    await expect(aviso).toBeVisible();
    await expect(aviso.getByRole("button", { name: /Volver al paso «Reglamento e imagen»/ })).toBeVisible();
    // El servidor no dejó nada a medias.
    expect((await json<{ datos: unknown[] }>(admin, "/api/alumnos?nombre=Zeta")).datos).toHaveLength(0);
    expect((await json<{ etapa: { tipo_sistema: string } }>(admin, `/api/leads/${zeta.leadId}`)).etapa.tipo_sistema).toBe("contactado");
  });

  test("un maestro no entra al asistente (con el modo de cierre por omisión) ni por URL directa", async ({ browser }) => {
    const contexto = await browser.newContext({ storageState: comoRol("maestro").storageState });
    const page = await contexto.newPage();
    await page.goto(`/leads/${zeta.leadId}/convertir`);
    await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    await contexto.close();
  });
});
