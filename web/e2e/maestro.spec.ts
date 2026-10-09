// J2: el maestro en su celular (390×844): «Hoy», el registro del alumno COMPLETO (con salud) y el pase de lista. Cada prueba comprueba además, por la API con otra
// sesión, que lo que se guardó en pantalla llegó al servidor.

import type { APIRequestContext } from "@playwright/test";
import { abrirSeccion, apiComo, ayerEnMexico, json, mananaEnMexico } from "./ayudas.ts";
import { capturar, comoRol, expect, mundo, test } from "./fixtura.ts";

test.use({ ...comoRol("maestro"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const { clase, claseFutura, claseAjena, alumnosDelPase } = mundo.maestro;
let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

test.describe("Hoy", () => {
  test("lista SUS clases con alumno, hora y grupo; sin lo ajeno y sin datos de contacto de la familia", async ({ page }) => {
    await page.goto("/hoy");
    await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
    // Con la hora cerca de la medianoche la clase empezada hace 90 minutos cae en «Ayer» y puede haber dos encabezados de día.
    await expect(page.getByRole("heading", { level: 2, name: /^(Hoy|Ayer) · \S+ \d+ de \S+$/ }).first()).toBeVisible();
    const tarjeta = page.getByTestId(`clase-${clase.id}`);
    await expect(tarjeta).toContainText(clase.prospecto);
    await expect(tarjeta).toContainText("Grupo A");
    await expect(tarjeta).toContainText("Agendada");
    await expect(tarjeta).toContainText(/\d{2}:\d{2}/);
    await expect(page.getByTestId(`clase-${claseFutura.id}`)).toContainText(claseFutura.prospecto);
    await expect(page.getByTestId(`clase-${claseAjena.id}`)).toHaveCount(0);
    await expect(page.getByText(claseAjena.prospecto)).toHaveCount(0);
    const texto = await page.locator("main").innerText();
    expect(texto, "el maestro no ve cómo contactar a la familia").not.toMatch(/\+52|Contacto:/);
    await capturar(page, "10-hoy", "celular");
    await capturar(page, "10-hoy", "escritorio");
  });

  test("la asistencia se marca desde la hora de la clase: la futura no se deja marcar", async ({ page }) => {
    await page.goto("/hoy");
    const futura = page.getByTestId(`clase-${claseFutura.id}`);
    await expect(futura.getByRole("button", { name: "Asistió", exact: true })).toBeDisabled();
    await expect(futura.getByRole("button", { name: "No asistió" })).toBeDisabled();
    await expect(futura).toContainText("desde la hora de la clase");
  });

  test("un maestro no abre la clase de otro grupo ni por URL directa", async ({ page }) => {
    await page.goto(`/clases/${claseAjena.id}/registro`);
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo cargar" })).toContainText(/No se encontr/);
  });
});

test.describe("registro del alumno (con salud y seguridad)", () => {
  test.describe.configure({ mode: "serial" });
  const ruta = `/clases/${clase.id}/registro`;
  const guardarSeccion = (s: import("@playwright/test").Locator) => s.getByRole("button", { name: /Guardar esta sección|Reintentar guardado/ });

  test("alumno: valida el formato, guarda y llega al servidor", async ({ page }) => {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { name: "Registro del alumno" })).toBeVisible();
    await expect(page.getByTestId("faltantes")).toContainText("Nombre del alumno");
    const s = await abrirSeccion(page, "alumno");
    await s.getByLabel("Nombre", { exact: false }).first().fill("Alumna");
    await s.getByLabel("Apellidos").fill("Uno");
    await s.getByLabel("Fecha de nacimiento (del acta)").fill("2018-05-04");
    await s.getByRole("radio", { name: "Femenino" }).check();
    await s.getByLabel("Escuela", { exact: true }).fill("Escuela de prueba");
    await s.getByLabel("Turno en la escuela").selectOption("matutino");
    await s.getByLabel("Talla de uniforme").fill("8");
    await expect(s).toContainText("Sin guardar");
    await guardarSeccion(s).click();
    await expect(s.getByRole("status")).toContainText("Guardado a las");
    const r = await json<{ alumno: Record<string, string>; estatus: string }>(admin, `/api/clases-muestra/${clase.id}/registro`);
    expect(r.estatus).toBe("borrador");
    expect(r.alumno).toMatchObject({ nombre: "Alumna", apellidos: "Uno", fecha_nacimiento: "2018-05-04", sexo: "femenino", escuela: "Escuela de prueba", turno_escolar: "matutino", talla_uniforme: "8" });
    await capturar(page, "11-registro-alumno", "celular", { completa: true });
  });

  test("adultos: filas con responsable de pago y quien recoge; un teléfono corto se rechaza en la pantalla (sin pedirle nada al servidor)", async ({ page }) => {
    await page.goto(ruta);
    const s = await abrirSeccion(page, "tutores");
    await s.getByRole("button", { name: "Agregar adulto" }).click();
    const a1 = s.getByTestId("adulto-0");
    await a1.getByLabel(/^Nombre/).fill("Rosa");
    await a1.getByLabel("Apellidos").fill("Mena");
    await a1.getByLabel("Parentesco").fill("madre");
    await a1.getByLabel("Teléfono").fill("123");
    await a1.getByLabel("Correo").fill("rosa@correo.test");
    await a1.getByLabel("Es el responsable de pago").check();
    await a1.getByLabel("Es quien lo lleva").check();
    const peticiones: string[] = [];
    page.on("request", (r) => r.method() === "PATCH" && peticiones.push(r.url()));
    await guardarSeccion(s).click();
    await expect(a1).toContainText("10 dígitos");
    expect(peticiones).toEqual([]);
    await a1.getByLabel("Teléfono").fill("55 1234 5678");
    await s.getByRole("button", { name: "Agregar adulto" }).click();
    const a2 = s.getByTestId("adulto-1");
    await a2.getByLabel(/^Nombre/).fill("Luis");
    await a2.getByLabel("Parentesco").fill("tío");
    await a2.getByLabel("Teléfono").fill("5598765432");
    await a2.getByLabel("Puede recogerlo").check();
    // Marcar al segundo como responsable de pago desmarca al primero: solo hay uno.
    await a2.getByLabel("Es el responsable de pago").check();
    await expect(a1.getByLabel("Es el responsable de pago")).not.toBeChecked();
    await a1.getByLabel("Es el responsable de pago").check();
    await expect(a2.getByLabel("Es el responsable de pago")).not.toBeChecked();
    await guardarSeccion(s).click();
    await expect(s.getByRole("status")).toContainText("Guardado a las");
    const r = await json<{ tutores: { nombre: string; telefono: string; es_responsable_pago: boolean; lo_lleva: boolean; puede_recoger: boolean; correo: string | null }[] }>(admin, `/api/clases-muestra/${clase.id}/registro`);
    expect(r.tutores).toHaveLength(2);
    expect(r.tutores[0]).toMatchObject({ nombre: "Rosa", telefono: "+525512345678", es_responsable_pago: true, lo_lleva: true, correo: "rosa@correo.test" });
    expect(r.tutores[1]).toMatchObject({ nombre: "Luis", telefono: "+525598765432", es_responsable_pago: false, puede_recoger: true });
  });

  test("salud y seguridad: se captura, llega cifrada al servidor, no queda en pantalla ni en el navegador, y verla deja constancia", async ({ page }) => {
    await page.goto(ruta);
    const s = await abrirSeccion(page, "salud");
    // El contacto de emergencia no puede ser uno de los adultos del registro: se avisa en la pantalla.
    await s.getByLabel("Nombre del contacto").fill("Rosa Mena");
    await s.getByLabel("Teléfono del contacto").fill("5511112222");
    await s.getByRole("button", { name: "Guardar salud y seguridad" }).click();
    await expect(s).toContainText("ya está en los adultos del registro");
    await s.getByLabel("Nombre del contacto").fill("Marta Pérez");
    await s.getByLabel("Alergias").fill("Ninguna");
    await s.getByLabel("Condiciones médicas").fill("Asma leve");
    await s.getByLabel("Medicamentos").fill("Ninguno");
    await s.getByLabel("Parentesco o relación (opcional)").fill("tía");
    await s.getByRole("radio", { name: "Sí" }).check();
    await s.getByRole("button", { name: "Guardar salud y seguridad" }).click();
    await expect(s.getByText("Guardado", { exact: true })).toBeVisible();
    // Lo escrito sale de la pantalla y nunca estuvo en el almacenamiento del navegador.
    await expect(s.getByLabel("Condiciones médicas")).toHaveValue("");
    const almacenado = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, sesion: { ...sessionStorage }, url: location.href }));
    expect(almacenado).not.toMatch(/Asma|Marta|5511112222/);
    // Llegó: la API (con permiso y motivo) lo devuelve, y esa lectura queda en el registro de accesos.
    const ficha = await json<{ campos: { alergias: string; condiciones_medicas: string; medicamentos: string; contacto_emergencia: { nombre: string; telefono: string; parentesco: string }; autorizacion_atencion_medica: boolean } }>(admin, `/api/salud/prospecto/${clase.prospectoId}?motivo=prueba%20de%20navegador`);
    expect(ficha.campos).toMatchObject({ alergias: "Ninguna", condiciones_medicas: "Asma leve", medicamentos: "Ninguno", contacto_emergencia: { nombre: "Marta Pérez", telefono: "+525511112222", parentesco: "tía" }, autorizacion_atencion_medica: true });
    // «Ver lo registrado» pide un motivo, muestra los valores en memoria y se pueden ocultar.
    await page.reload();
    const s2 = await abrirSeccion(page, "salud");
    await expect(s2.getByLabel("Condiciones médicas")).toHaveValue("");
    await s2.getByRole("button", { name: "Ver lo registrado" }).click();
    await expect(s2.getByLabel("Condiciones médicas")).toHaveValue("Asma leve");
    await s2.getByRole("button", { name: "Ocultar lo registrado" }).click();
    await expect(s2.getByLabel("Condiciones médicas")).toHaveValue("");
    const accesos = await json<{ datos: { accion: string; resultado: string; motivo: string; usuario?: unknown }[] }>(admin, `/api/salud-accesos?sujeto_id=${clase.prospectoId}`);
    expect(accesos.datos.some((a) => a.accion === "leer" && a.resultado === "permitido" && a.motivo.includes("Revisión del maestro"))).toBe(true);
    expect(JSON.stringify(accesos), "el registro de accesos nunca trae valores").not.toMatch(/Asma/);
    await capturar(page, "12-registro-salud", "celular");
  });

  test("antecedentes y observación del maestro: guardan; una nota con datos de salud la rechaza el servidor y se ve en el campo", async ({ page }) => {
    await page.goto(ruta);
    const a = await abrirSeccion(page, "antecedentes");
    await a.getByRole("radio", { name: "Sí" }).check();
    await a.getByLabel("¿Dónde practicó?").fill("Escuela X");
    await a.getByLabel("Nivel que alcanzó").fill("Intermedio");
    await a.getByLabel("¿Por qué quiere tomar la clase?").selectOption("otro");
    await a.getByLabel("Cuéntanos el motivo").fill("Se lo recomendó una amiga");
    await guardarSeccion(a).click();
    await expect(a.getByRole("status")).toContainText("Guardado a las");
    const o = await abrirSeccion(page, "observacion");
    await o.getByLabel("Nivel observado en la clase").fill("Básico");
    await o.getByLabel("Grupo recomendado").selectOption({ label: "Grupo A" });
    await o.getByRole("radio", { name: "Alto" }).check();
    await o.getByLabel("Notas del maestro").fill("Tiene alergia al polvo");
    await guardarSeccion(o).click();
    await expect(o.locator(".campo-error")).toContainText(/salud/i);
    await o.getByLabel("Notas del maestro").fill("Muy atenta y con ganas de aprender");
    await guardarSeccion(o).click();
    await expect(o.getByRole("status")).toContainText("Guardado a las");
    const r = await json<{ antecedentes: Record<string, unknown>; observacion: Record<string, unknown> }>(admin, `/api/clases-muestra/${clase.id}/registro`);
    expect(r.antecedentes).toMatchObject({ practico_antes: true, practico_donde: "Escuela X", practico_nivel: "Intermedio", motivo_clase: "otro", motivo_clase_detalle: "Se lo recomendó una amiga" });
    expect(r.observacion).toMatchObject({ nivel_observado: "Básico", interes_percibido: "alto", notas: "Muy atenta y con ganas de aprender" });
    expect(r.observacion["grupo_recomendado_id"]).toBe(mundo.grupos.a.id);
  });

  test("reglamento e imagen: se acepta con evidencia, se revoca la imagen y la frase del servidor lo cuenta", async ({ page }) => {
    await page.goto(ruta);
    const s = await abrirSeccion(page, "legal");
    const reglamento = s.getByTestId("documento-reglamento");
    await expect(reglamento).toContainText("Sin respuesta");
    await reglamento.getByLabel("¿Quién responde?").selectOption({ label: "Rosa (madre)" });
    await reglamento.getByLabel("Nota de evidencia (opcional)").fill("Firmó la hoja impresa");
    await reglamento.getByRole("button", { name: "Aceptan", exact: true }).click();
    await expect(reglamento.getByTestId("frase-legal")).toContainText("Aceptó el reglamento v1");
    const imagen = s.getByTestId("documento-uso_imagen");
    await imagen.getByLabel("¿Quién responde?").selectOption({ label: "Rosa (madre)" });
    await imagen.getByRole("button", { name: "Aceptan", exact: true }).click();
    await expect(imagen.getByTestId("frase-legal")).toContainText("Aceptó");
    await imagen.getByRole("button", { name: "Revocar autorización" }).click();
    await expect(imagen.getByTestId("frase-legal")).toContainText("Revocó");
    const e = await json<{ estado: { tipo: string; estado: string; al_corriente: boolean }[]; historial: { tipo: string; resultado: string; canal: string; evidencia: Record<string, string> | null }[] }>(admin, `/api/clases-muestra/${clase.id}/registro/aceptaciones`);
    expect(e.estado.find((x) => x.tipo === "reglamento")).toMatchObject({ estado: "aceptada", al_corriente: true });
    expect(e.estado.find((x) => x.tipo === "uso_imagen")?.estado).toBe("revocada");
    expect(e.historial.filter((h) => h.tipo === "uso_imagen").map((h) => h.resultado)).toEqual(["revocada", "aceptada"]);
    expect(e.historial.find((h) => h.tipo === "reglamento")).toMatchObject({ canal: "presencial", evidencia: { nota: "Firmó la hoja impresa" } });
  });

  test("sin red no se pierde lo escrito: avisa, conserva el campo y se reintenta", async ({ page }) => {
    await page.goto(ruta);
    const o = await abrirSeccion(page, "observacion");
    await o.getByLabel("Nivel observado en la clase").fill("Intermedio alto");
    await page.route("**/api/clases-muestra/*/registro", (r) => (r.request().method() === "PATCH" ? r.abort("failed") : r.continue()));
    await guardarSeccion(o).click();
    await expect(o).toContainText("No hay conexión con el servidor");
    await expect(o).toContainText("Lo que escribiste sigue aquí");
    await expect(o.getByLabel("Nivel observado en la clase")).toHaveValue("Intermedio alto");
    await page.unroute("**/api/clases-muestra/*/registro");
    await guardarSeccion(o).click();
    await expect(o.getByRole("status")).toContainText("Guardado a las");
    const r = await json<{ observacion: { nivel_observado: string } }>(admin, `/api/clases-muestra/${clase.id}/registro`);
    expect(r.observacion.nivel_observado).toBe("Intermedio alto");
  });

  test("completar y cerrar: ya no falta nada, se cierra con confirmación y el registro queda de solo lectura", async ({ page }) => {
    await page.goto(ruta);
    await expect(page.getByTestId("faltantes")).toHaveCount(0);
    await page.getByRole("button", { name: "Marcar registro como completo" }).click();
    await expect(page.getByText("Registro: Completo")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar registro" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, cerrar" }).click();
    await expect(page.getByText("Registro: Cerrado")).toBeVisible();
    await expect(page.getByText("Este registro está cerrado")).toBeVisible();
    const s = await abrirSeccion(page, "alumno");
    await expect(s.getByLabel("Apellidos")).toBeDisabled();
    await expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${clase.id}/registro`)).estatus).toBe("cerrado");
    await capturar(page, "13-registro-cerrado", "celular");
  });

  test("al completar, lo que falta se dice con palabras de una persona", async ({ page }) => {
    await page.goto(`/clases/${claseFutura.id}/registro`);
    await expect(page.getByTestId("faltantes")).toContainText("Nombre del alumno");
    await expect(page.getByRole("button", { name: "Marcar registro como completo" })).toBeDisabled();
    await capturar(page, "14-registro-vacio", "celular");
  });
});

test.describe("asistencia y cierre desde «Hoy»", () => {
  test("marca asistió, queda en el servidor y aparece «listo para cerrar» (una tarea para el asesor)", async ({ page }) => {
    await page.goto("/hoy");
    const tarjeta = page.getByTestId(`clase-${clase.id}`);
    await tarjeta.getByRole("button", { name: "Asistió", exact: true }).click();
    await expect(tarjeta).toContainText("Asistió");
    expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${clase.id}`)).estatus).toBe("asistio");
    await tarjeta.getByRole("button", { name: "Listo para cerrar la inscripción" }).click();
    await expect(tarjeta).toContainText("el asesor recibió el aviso");
    const tareas = await json<{ datos: { tipo: string; estado: string }[] }>(admin, `/api/tareas?tipo=listo_para_cerrar&lead_id=${clase.leadId}`);
    expect(tareas.datos).toHaveLength(1);
    expect(tareas.datos[0]).toMatchObject({ tipo: "listo_para_cerrar", estado: "pendiente" });
  });
});

test.describe("pase de lista", () => {
  test.describe.configure({ mode: "serial" });

  test("solo ofrece SUS grupos; ayer: marca, guarda, y guardar de nuevo no duplica nada", async ({ page }) => {
    await page.goto("/pase");
    const grupo = page.getByLabel("Grupo", { exact: true });
    await expect(grupo.locator("option")).toHaveCount(1);
    await expect(grupo).toContainText("Grupo A");
    await page.getByLabel("Fecha de la clase").fill(ayerEnMexico());
    for (const a of alumnosDelPase) await expect(page.getByTestId(`alumno-${a.alumnoId}`)).toContainText(a.nombre);
    await expect(page.getByTestId("resumen-pase")).toContainText("Sin marcar 3");
    await page.getByRole("button", { name: /Marcar presentes a todos/ }).click();
    const beto = page.getByRole("group", { name: "Beto Prueba" });
    const cira = page.getByRole("group", { name: "Cira Prueba" });
    await beto.getByRole("radio", { name: "Justificada" }).check();
    await cira.getByRole("radio", { name: "Falta" }).check();
    await expect(page.getByTestId("resumen-pase")).toContainText("Presentes 1");
    await expect(page.getByTestId("resumen-pase")).toContainText("Faltas 1");
    await expect(page.getByTestId("resumen-pase")).toContainText("Justificadas 1");
    await page.getByRole("button", { name: "Guardar pase de lista" }).click();
    await expect(page.getByTestId("resultado-pase")).toContainText("3 nuevas, 0 corregidas, 0 sin cambio");
    const lista = await json<{ pase_tomado: boolean; lista: { alumno: string; estatus: string }[] }>(admin, `/api/grupos/${mundo.grupos.a.id}/pase?fecha=${ayerEnMexico()}`);
    expect(lista.pase_tomado).toBe(true);
    expect(Object.fromEntries(lista.lista.map((f) => [f.alumno, f.estatus]))).toEqual({ "Ana Prueba": "presente", "Beto Prueba": "justificada", "Cira Prueba": "falta" });
    await capturar(page, "15-pase-de-lista", "celular");
    await capturar(page, "15-pase-de-lista", "escritorio");
    // Guardar lo mismo otra vez: idempotente.
    await cira.getByRole("radio", { name: "Presente" }).check();
    await cira.getByRole("radio", { name: "Falta" }).check();
    await page.getByRole("button", { name: "Guardar pase de lista" }).click();
    await expect(page.getByTestId("resultado-pase")).toContainText("0 nuevas, 0 corregidas, 3 sin cambio");
    const otra = await json<{ lista: unknown[] }>(admin, `/api/grupos/${mundo.grupos.a.id}/pase?fecha=${ayerEnMexico()}`);
    expect(otra.lista).toHaveLength(3);
  });

  test("corregir una falta: queda corregida", async ({ page }) => {
    await page.goto("/pase");
    await page.getByLabel("Fecha de la clase").fill(ayerEnMexico());
    await expect(page.getByTestId("resumen-pase")).toContainText("Pase ya tomado");
    await page.getByRole("group", { name: "Cira Prueba" }).getByRole("radio", { name: "Justificada" }).check();
    await page.getByRole("button", { name: "Guardar pase de lista" }).click();
    await expect(page.getByTestId("resultado-pase")).toContainText("0 nuevas, 1 corregidas, 2 sin cambio");
  });

  test("una fecha que todavía no llega no se puede pasar", async ({ page }) => {
    await page.goto("/pase");
    await page.getByLabel("Fecha de la clase").fill(mananaEnMexico());
    await expect(page.getByText("todavía no empieza")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar pase de lista" })).toHaveCount(0);
  });
});
