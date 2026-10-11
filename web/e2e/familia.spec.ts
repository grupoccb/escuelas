// J6: familia y expediente del alumno — buscar a la familia, su ficha, el expediente por rol (el maestro sin importes), la salud en una vista aparte
// (solo con permiso, nada en la URL, la consola ni el almacenamiento) y las acciones de F5 con confirmación (cambiar de grupo con el cupo real, congelar, reactivar, baja).

import type { APIRequestContext } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { capturar, comoRol, expect, mundo, test } from "./fixtura.ts";

const { rivera, grupoDeUnLugar, grupoDestino, motivoBaja, salud, rellenoAlumnoId } = mundo.familia;
const [mayor, menor] = rivera.hijos as [(typeof rivera.hijos)[number], (typeof rivera.hijos)[number]];

/** «3000.00» → «$3,000.00» (solo texto: nada de números flotantes). */
const pesos = (t: string): string => {
  const [entero = "0", dec = "00"] = t.split(".");
  return `$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
};

let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

const inscripcion = (id: string) => json<{ id: string; estatus: string; grupo_id: string}>(admin, `/api/inscripciones/${id}`);

test.describe("recepción: familias y acciones sobre la inscripción", () => {
  test.use(comoRol("recepcion"));
  test.describe.configure({ mode: "serial" });

  test("buscar por teléfono en cualquier formato, abrir la ficha con las banderas, el saldo y los hijos", async ({ page }) => {
    await page.goto("/familias");
    // La búsqueda es al escribir (R6b, como el prototipo): sin botón «Buscar».
    await page.getByLabel("Teléfono o nombre de la familia").fill("(55) 5503 0303");
    const tarjeta = page.getByTestId(`familia-${rivera.tutorId}`);
    await expect(tarjeta).toContainText("Hija Mayor");
    await expect(tarjeta).toContainText("Hijo Menor");
    await expect(tarjeta.getByRole("list", { name: "Hijos" }).getByRole("listitem")).toHaveCount(2);
    await capturar(page, "50-familias", "celular");
    await tarjeta.getByRole("link", { name: /Rosa Rivera/ }).click();
    await expect(page.getByRole("heading", { name: "Rosa Rivera" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rosa Rivera" }).locator("xpath=..")).toContainText("rivera@ejemplo.test");
    await expect(page.getByTestId(`adulto-${rivera.tutorId}`)).toContainText("Rosa Rivera");
    await expect(page.getByTestId(`hijo-${mayor.alumnoId}`)).toContainText("Rosa paga");
    await expect(page.getByTestId(`adulto-${rivera.tutorId}`)).toContainText("Responsable de pago");
    await expect(page.getByTestId(`hijo-${menor.alumnoId}`)).toContainText("Hijo Menor");
    const cuenta = await json<{ resumen: { saldo: string; vencido: string } }>(admin, `/api/tutores/${rivera.tutorId}/estado-cuenta`);
    await expect(page.getByTestId("saldo")).toHaveText(pesos(cuenta.resumen.saldo));
    if (/^0+\.0+$/.test(cuenta.resumen.vencido)) await expect(page.getByTestId("pildora-vencido")).toContainText("Nada vencido");
    else await expect(page.getByTestId("vencido")).toHaveText(pesos(cuenta.resumen.vencido));
    await capturar(page, "51-ficha-familia", "celular", { completa: true });
    await capturar(page, "51-ficha-familia", "escritorio");
  });

  test("el expediente muestra trayectoria, asistencia, económico y comercial; el saldo coincide con el estado de cuenta; recepción no ve la salud", async ({ page }) => {
    await page.goto(`/alumnos/${mayor.alumnoId}`);
    await expect(page.getByRole("heading", { name: "Hija Mayor Rivera" })).toBeVisible();
    await expect(page.getByTestId("grupo-actual")).toHaveText("Grupo D");
    await expect(page.getByTestId("antiguedad")).not.toHaveText("—");
    await page.getByRole("tab", { name: "Económico" }).click();
    const cuenta = await json<{ hijos: { alumno: { id: string }; saldo: string }[] }>(admin, `/api/tutores/${rivera.tutorId}/estado-cuenta`);
    const suyo = cuenta.hijos.find((h) => h.alumno.id === mayor.alumnoId)!;
    await expect(page.getByTestId("panel-economico").getByTestId("saldo")).toHaveText(pesos(suyo.saldo));
    await expect(page.getByTestId("mensualidad-total")).toHaveText("$1,000.00");
    await page.getByRole("tab", { name: "Asistencia" }).click();
    await expect(page.getByTestId("asistencia-30")).toBeVisible();
    await page.getByRole("tab", { name: "Comercial" }).click();
    await expect(page.getByTestId("panel-comercial")).toBeVisible();
    // Recepción no tiene el permiso de salud: ni el acceso en la pantalla (R6a: la salud es una pestaña) ni la petición.
    await expect(page.getByRole("tab", { name: "Salud" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Salud" })).toHaveCount(0);
    const pedidasASalud: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/salud")) pedidasASalud.push(r.url());
    });
    await page.goto(`/alumnos/${mayor.alumnoId}/salud`);
    await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    expect(pedidasASalud).toEqual([]);
  });

  test("cambiar de grupo: solo del mismo programa, con los lugares reales; el cambio queda en el historial", async ({ page }) => {
    await page.goto(`/alumnos/${mayor.alumnoId}`);
    await page.getByTestId(`acciones-${mayor.inscripcionId}`).getByRole("button", { name: "Cambiar de grupo" }).click();
    const dialogo = page.getByRole("dialog");
    // R6a: los grupos van en botones grandes (antes, un select «Grupo nuevo»); el que está lleno va apagado.
    const nuevoHorario = dialogo.getByRole("group", { name: /Nuevo horario/ });
    await expect(nuevoHorario).toContainText(`${grupoDeUnLugar.nombre} · 1 lugar`);
    await expect(nuevoHorario).toContainText(grupoDestino.nombre);
    await capturar(page, "52-cambiar-de-grupo", "celular");
    await nuevoHorario.getByRole("button", { name: `${grupoDestino.nombre} · ` }).click();
    await dialogo.getByRole("button", { name: "Confirmar el cambio" }).click();
    await expect(page.getByTestId("grupo-actual")).toHaveText(grupoDestino.nombre);
    await expect(page.getByTestId("historial-de-grupo")).toContainText(`de Grupo D a ${grupoDestino.nombre}`);
    expect((await inscripcion(mayor.inscripcionId)).grupo_id).toBe(grupoDestino.id);
    await capturar(page, "53-expediente", "celular");
    await capturar(page, "53-expediente", "escritorio");
  });

  test("el último lugar se ocupa mientras se mira la pantalla: el cambio se rechaza y la inscripción sigue donde estaba", async ({ page }) => {
    await page.goto(`/alumnos/${menor.alumnoId}`);
    await page.getByTestId(`acciones-${menor.inscripcionId}`).getByRole("button", { name: "Cambiar de grupo" }).click();
    const dialogo = page.getByRole("dialog");
    const nuevoHorario = dialogo.getByRole("group", { name: /Nuevo horario/ });
    await expect(nuevoHorario).toContainText(`${grupoDeUnLugar.nombre} · 1 lugar`);
    // Otra persona toma el último lugar por la API.
    const r = await admin.post("/api/inscripciones", { data: { alumno_id: rellenoAlumnoId, grupo_id: grupoDeUnLugar.id } });
    expect(r.status()).toBe(201);
    await nuevoHorario.getByRole("button", { name: `${grupoDeUnLugar.nombre} · ` }).click();
    await dialogo.getByRole("button", { name: "Confirmar el cambio" }).click();
    await expect(dialogo.getByRole("alert")).toContainText(/ya no tiene lugares/i);
    expect((await inscripcion(menor.inscripcionId)).grupo_id).not.toBe(grupoDeUnLugar.id);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("grupo-actual")).toHaveText("Grupo D");
  });

  test("congelar y reactivar, cada uno con su confirmación", async ({ page }) => {
    await page.goto(`/alumnos/${menor.alumnoId}`);
    const acciones = page.getByTestId(`acciones-${menor.inscripcionId}`);
    await acciones.getByRole("button", { name: "Congelar" }).click();
    await expect(page.getByRole("dialog")).toContainText("libera su lugar");
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    expect((await inscripcion(menor.inscripcionId)).estatus).toBe("activa");
    await acciones.getByRole("button", { name: "Congelar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Congelar" }).click();
    await expect(page.getByTestId(`inscripcion-${menor.inscripcionId}`)).toContainText("Congelada");
    expect((await inscripcion(menor.inscripcionId)).estatus).toBe("congelada");
    await acciones.getByRole("button", { name: "Reactivar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reactivar" }).click();
    await expect(page.getByTestId(`inscripcion-${menor.inscripcionId}`)).toContainText("Activa");
    expect((await inscripcion(menor.inscripcionId)).estatus).toBe("activa");
  });

  test("la baja pide un motivo del catálogo, avisa lo que implica y deja la inscripción en baja", async ({ page }) => {
    await page.goto(`/alumnos/${menor.alumnoId}`);
    await page.getByTestId(`acciones-${menor.inscripcionId}`).getByRole("button", { name: "Dar de baja" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("libera el lugar");
    await expect(dialogo.getByRole("button", { name: "Dar de baja" })).toBeDisabled();
    // R6a: los motivos van en botones grandes (antes, un select).
    await dialogo.getByRole("group", { name: "Motivo de la baja" }).getByRole("button", { name: motivoBaja.nombre, exact: true }).click();
    await dialogo.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByTestId(`inscripcion-${menor.inscripcionId}`)).toContainText("Baja");
    const despues = await inscripcion(menor.inscripcionId);
    expect(despues.estatus).toBe("baja");
    const movimientos = await json<{ datos: { tipo: string; motivo_baja: { id: string } | null }[] }>(admin, `/api/inscripciones/${menor.inscripcionId}/movimientos`);
    expect(movimientos.datos.find((m) => m.tipo === "baja")?.motivo_baja?.id).toBe(motivoBaja.id);
    await page.getByRole("tab", { name: "Comercial" }).click();
    await expect(page.getByTestId("motivo-de-baja")).toContainText(motivoBaja.nombre);
    const alumno = await json<{ estatus: string }>(admin, `/api/alumnos/${menor.alumnoId}`);
    expect(alumno.estatus).toBe("baja");
  });
});

test.describe("asesor: familias con un solo hijo", () => {
  test.use(comoRol("asesor"));
  test("la lista de venta cruzada muestra a las familias con un solo hijo inscrito y no a las de dos", async ({ page }) => {
    await page.goto("/familias");
    await page.getByRole("link", { name: "Con un solo hijo" }).click();
    await expect(page.getByTestId("lista-un-solo-hijo")).toBeVisible();
    await expect(page.getByTestId(`un-hijo-${mundo.recepcion.uniforme.tutorId}`)).toContainText("Alumno Uniforme");
    await expect(page.getByTestId(`un-hijo-${mundo.recepcion.gomez.tutorId}`)).toHaveCount(0);
    await capturar(page, "54-familias-un-solo-hijo", "celular");
  });
});

test.describe("maestro: sus alumnos, sin importes, y la salud solo con permiso", () => {
  test.use(comoRol("maestro"));
  test.describe.configure({ mode: "serial" });

  test("ve a sus alumnos y no a los de otros grupos; no entra a familias", async ({ page }) => {
    await page.goto("/alumnos");
    const lista = page.getByTestId("lista-de-alumnos");
    await expect(lista).toContainText("Ana Prueba");
    await expect(lista).toContainText("Beto Prueba");
    await expect(lista).not.toContainText("Hijo Uno");
    await expect(page.getByRole("link", { name: "Familias" })).toHaveCount(0);
    await page.goto("/familias");
    await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    await page.goto(`/alumnos/${rivera.hijos[0]!.alumnoId}`);
    await expect(page.getByText(/No se encontró/)).toBeVisible();
  });

  test("el expediente del maestro no trae importes ni la pestaña económica ni la comercial", async ({ page }) => {
    await page.goto(`/alumnos/${salud.alumnoId}`);
    await expect(page.getByRole("heading", { name: salud.nombre })).toBeVisible();
    // R6a: «Operativo» pasó a «Asistencia» y la salud es una pestaña (el maestro tiene el permiso).
    await expect(page.getByRole("tab")).toHaveText(["Trayectoria", "Asistencia", "Salud"]);
    await expect(page.locator("main")).not.toContainText("$");
    const respuesta = await (await page.request.get(`/api/alumnos/${salud.alumnoId}/expediente`)).json();
    expect(respuesta.economico).toBeNull();
    expect(respuesta.comercial).toBeNull();
    await capturar(page, "55-expediente-maestro", "celular");
  });

  test("la salud: pide un motivo, se ve y se oculta; nada en la URL, la consola, el almacenamiento ni la caché; queda en el registro de accesos", async ({ page }) => {
    const consola: string[] = [];
    page.on("console", (m) => consola.push(m.text()));
    page.on("pageerror", (e) => consola.push(e.message));
    await page.goto(`/alumnos/${salud.alumnoId}`);
    await page.getByRole("tab", { name: "Salud" }).click();
    await expect(page.getByRole("heading", { name: `Salud de ${salud.nombre}` })).toBeVisible();
    // Antes de dar un motivo, no se ha pedido nada.
    await expect(page.getByText(salud.centinela)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ver datos de salud" })).toBeDisabled();
    await page.getByLabel(/Motivo de la consulta/).fill("Clase de hoy");
    const respuesta = page.waitForResponse((r) => r.url().includes("/api/salud/alumno/") && r.request().method() === "GET");
    await page.getByRole("button", { name: "Ver datos de salud" }).click();
    expect((await respuesta).headers()["cache-control"]).toContain("no-store");
    await expect(page.getByTestId("ficha-de-salud")).toContainText(salud.centinela);
    await capturar(page, "56-salud", "celular");
    // Nada del dato en la URL, el almacenamiento ni la consola.
    expect(page.url()).not.toContain(salud.centinela);
    const almacenado = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]));
    expect(almacenado).not.toContain(salud.centinela);
    expect(consola.join("\n")).not.toContain(salud.centinela);
    // Ocultar lo borra de la pantalla.
    await page.getByRole("button", { name: "Ocultar" }).click();
    await expect(page.getByText(salud.centinela)).toHaveCount(0);
    // Al salir de la pantalla y volver, hay que pedirlo otra vez.
    await page.goto(`/alumnos/${salud.alumnoId}/salud`);
    await expect(page.getByText(salud.centinela)).toHaveCount(0);
    // La lectura quedó registrada: quién, a quién y por qué.
    const accesos = await json<{ datos: { usuario_id: string; resultado: string; motivo?: string }[] }>(admin, `/api/salud-accesos?sujeto_id=${salud.alumnoId}&resultado=permitido`);
    expect(accesos.datos.some((a) => a.usuario_id === mundo.usuarios.maestro.id && a.motivo === "Clase de hoy")).toBe(true);
    expect(JSON.stringify(accesos)).not.toContain(salud.centinela);
  });
});

test.describe("administrador: el expediente completo", () => {
  test.use(comoRol("administrador"));
  test("cinco secciones, la salud entre ellas", async ({ page }) => {
    await page.goto(`/alumnos/${salud.alumnoId}`);
    await expect(page.getByRole("tab")).toHaveText(["Trayectoria", "Asistencia", "Económico", "Comercial", "Salud"]);
    await expect(page.getByRole("tab", { name: "Salud" })).toBeVisible();
    await capturar(page, "57-expediente-administrador", "escritorio");
  });
});
