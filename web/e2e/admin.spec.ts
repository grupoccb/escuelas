// J7: administración del catálogo en el navegador — una disciplina y una sucursal NUEVAS dadas de alta solo por pantalla (programa, salón, grupo con horario, precio) hasta
// aparecer en el cotizador; el choque de salón mostrado como error claro; el traslape de edad; una nueva vigencia de precio; una promoción; el canal y la configuración.

import type { APIRequestContext, Page } from "@playwright/test";
import { apiComo, json } from "./ayudas.ts";
import { capturar, comoRol, expect, mundo, test } from "./fixtura.ts";

let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

const dialogo = (page: Page) => page.getByRole("dialog");

test.describe("quien no administra no ve la administración", () => {
  test.use(comoRol("asesor"));
  test("sin la sección en la barra y sin entrar por la dirección", async ({ page }) => {
    await page.goto("/embudo");
    await expect(page.getByRole("link", { name: "Administración" })).toHaveCount(0);
    const peticiones: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/(verticales|configuracion|canales)/.test(r.url())) peticiones.push(r.url());
    });
    for (const ruta of ["/admin", "/admin/verticales", "/admin/configuracion", "/admin/canales"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    }
    expect(peticiones).toEqual([]);
  });
});

test.describe("administrador", () => {
  test.use(comoRol("administrador"));
  test.describe.configure({ mode: "serial" });

  test("el menú lista las áreas que se editan sin tocar código", async ({ page }) => {
    await page.goto("/admin");
    for (const area of ["Disciplinas", "Sucursales", "Programas", "Grupos y horarios", "Instructores y salones", "Precios", "Promociones", "Canales de WhatsApp", "Configuración"]) {
      await expect(page.getByRole("link", { name: area, exact: true })).toBeVisible();
    }
    await capturar(page, "60-administracion", "celular");
    await capturar(page, "60-administracion", "escritorio");
  });

  test("dar de alta una disciplina: el identificador sale del nombre y no se puede repetir ni cambiar", async ({ page }) => {
    await page.goto("/admin/verticales");
    await page.getByRole("button", { name: "Nueva disciplina" }).click();
    await dialogo(page).getByLabel("Nombre de la disciplina").fill("Disciplina Pantalla");
    await dialogo(page).getByLabel(/Lleva progresión/).check();
    // Con progresión hace falta decir cómo se llama el avance.
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toContainText("Di cómo se llama el avance");
    await dialogo(page).getByLabel("Cómo se llama el avance").fill("Grado");
    await dialogo(page).getByLabel("Color de marca").fill("#12ab34");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    const tarjeta = page.getByTestId("vertical-disciplina-pantalla");
    await expect(tarjeta).toContainText("Disciplina Pantalla");
    await expect(tarjeta).toContainText("Avance: Grado");
    const v = await json<{ datos: { slug: string; color_marca: string; usa_progresion: boolean }[] }>(admin, "/api/verticales");
    const nueva = v.datos.find((x) => x.slug === "disciplina-pantalla")!;
    expect(nueva.color_marca).toBe("#12AB34");
    expect(nueva.usa_progresion).toBe(true);
    // Repetirla: el servidor lo rechaza y la pantalla lo dice.
    await page.getByRole("button", { name: "Nueva disciplina" }).click();
    await dialogo(page).getByLabel("Nombre de la disciplina").fill("Disciplina Pantalla");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page).getByRole("alert")).toContainText("Ya existe una vertical con ese identificador");
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
    // Editar: el identificador queda fijo.
    await tarjeta.getByRole("button", { name: "Editar" }).click();
    await expect(dialogo(page)).toContainText("disciplina-pantalla");
    await expect(dialogo(page).getByLabel(/Identificador/)).toHaveCount(0);
    await dialogo(page).getByLabel("Nombre de la disciplina").fill("Disciplina Pantalla Editada");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(tarjeta).toContainText("Disciplina Pantalla Editada");
    await capturar(page, "61-disciplinas", "celular");
  });

  test("dar de alta una sucursal con su zona horaria y marcar qué disciplina se imparte ahí", async ({ page }) => {
    await page.goto("/admin/sucursales");
    await page.getByRole("button", { name: "Nueva sucursal" }).click();
    await dialogo(page).getByLabel("Nombre de la sucursal").fill("Sede Pantalla");
    await dialogo(page).getByLabel("Dirección").fill("Calle de prueba 123");
    // V7: la zona horaria se ELIGE de una lista en palabras (ya no se escribe su nombre técnico, así que no hay forma de escribir una que no existe; el servidor lo sigue validando).
    await dialogo(page).getByLabel(/Zona horaria/).selectOption({ label: "Hora del centro de México (Mérida)" });
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    const tarjeta = page.locator('[data-prueba^="sucursal-"]', { hasText: "Sede Pantalla" });
    await expect(tarjeta).toContainText("Hora del centro de México (Mérida)");
    const guardada = (await json<{ datos: { nombre: string; zona_horaria: string }[] }>(admin, "/api/sucursales")).datos.find((x) => x.nombre === "Sede Pantalla");
    expect(guardada?.zona_horaria).toBe("America/Merida");
    await tarjeta.getByLabel("Disciplina Pantalla Editada").click();
    await expect(tarjeta.getByLabel("Disciplina Pantalla Editada")).toBeChecked();
    const s = await json<{ datos: { nombre: string; verticales: { nombre: string; activo: boolean }[] }[] }>(admin, "/api/sucursales");
    expect(s.datos.find((x) => x.nombre === "Sede Pantalla")?.verticales.map((v) => [v.nombre, v.activo])).toEqual([["Disciplina Pantalla Editada", true]]);
    await capturar(page, "62-sucursales", "celular", { completa: true });
  });

  test("programas: edades, fecha de corte y el traslape de edad se rechaza con su motivo", async ({ page }) => {
    await page.goto("/admin/programas");
    const nuevo = async (nombre: string, min: string, max: string) => {
      await page.getByRole("button", { name: "Nuevo programa" }).click();
      const d = dialogo(page);
      await d.getByLabel("Disciplina").selectOption({ label: "Disciplina Pantalla Editada" });
      await d.getByLabel("Sucursal").selectOption({ label: "Sede Pantalla" });
      await d.getByLabel("Nombre del programa").fill(nombre);
      await d.getByLabel(/Edad mínima/).fill(min);
      await d.getByLabel(/Edad máxima/).fill(max);
      await d.getByLabel(/Fecha de corte/).fill("2026-09-01");
      await d.getByRole("button", { name: "Guardar" }).click();
    };
    await nuevo("Pequeños Pantalla", "5", "9");
    await expect(page.locator('[data-prueba^="programa-"]', { hasText: "Pequeños Pantalla" })).toContainText("5 a 9 años");
    await nuevo("Se pisa Pantalla", "9", "12");
    await expect(dialogo(page).getByRole("alert")).toContainText("Las edades se traslapan con: Pequeños Pantalla");
    await expect(dialogo(page).getByRole("alert")).toContainText(/permite traslape/i);
    await capturar(page, "63-programa-traslape", "celular");
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
    await nuevo("Mayores Pantalla", "10", "14");
    await expect(page.locator('[data-prueba^="programa-"]', { hasText: "Mayores Pantalla" })).toBeVisible();
    const p = await json<{ datos: { nombre: string; fecha_corte_edad: string | null }[] }>(admin, "/api/programas?limite=100");
    expect(p.datos.find((x) => x.nombre === "Pequeños Pantalla")?.fecha_corte_edad).toBe("2026-09-01");
  });

  test("instructores y salones: un salón nuevo en la sucursal nueva", async ({ page }) => {
    await page.goto("/admin/instructores");
    await page.getByRole("button", { name: "Nuevo salón" }).click();
    await dialogo(page).getByLabel("Sucursal").selectOption({ label: "Sede Pantalla" });
    await dialogo(page).getByLabel("Nombre del salón").fill("Salón Pantalla");
    await dialogo(page).getByLabel(/Capacidad/).fill("20");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator('[data-prueba^="salon-"]', { hasText: "Salón Pantalla" })).toContainText("Capacidad 20");
    await page.getByRole("button", { name: "Nuevo instructor" }).click();
    await dialogo(page).getByRole("textbox", { name: /^Nombre/ }).fill("Instructora Pantalla");
    await dialogo(page).getByLabel("Sede Pantalla").check();
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator('[data-prueba^="instructor-"]', { hasText: "Instructora Pantalla" })).toContainText("Sede Pantalla");
  });

  test("grupos y horarios: un grupo con horario y salón; el choque de salón se muestra como error claro", async ({ page }) => {
    await page.goto("/admin/grupos");
    const nuevo = async (nombre: string, hora: string, fin: string) => {
      await page.getByRole("button", { name: "Nuevo grupo" }).click();
      const d = dialogo(page);
      await d.getByLabel("Programa").selectOption({ label: "Pequeños Pantalla" });
      await d.getByLabel("Nombre del grupo").fill(nombre);
      await d.getByLabel("Cupo máximo").fill("12");
      await d.getByLabel("Salón").selectOption({ label: "Salón Pantalla" });
      await d.getByRole("button", { name: "Agregar un horario" }).click();
      await d.getByLabel("Día 1").selectOption("2");
      await d.getByLabel("De", { exact: true }).fill(hora);
      await d.getByLabel("A", { exact: true }).fill(fin);
      await d.getByRole("button", { name: "Guardar" }).click();
    };
    await nuevo("Tarde Pantalla", "17:00", "18:00");
    const tarjeta = page.locator('[data-prueba^="grupo-"]', { hasText: "Tarde Pantalla" });
    await expect(tarjeta).toContainText("Mar 17:00–18:00");
    await expect(tarjeta).toContainText("Salón Pantalla");
    // El mismo salón, el mismo día, una franja que se traslapa.
    await nuevo("Choca Pantalla", "17:30", "18:30");
    const alerta = dialogo(page).getByRole("alert");
    await expect(alerta).toContainText("El salón o el instructor ya están ocupados en ese horario");
    await expect(alerta).toContainText("Tarde Pantalla");
    await capturar(page, "64-choque-de-salon", "celular");
    // Un horario que termina antes de empezar lo dice la pantalla sin ir al servidor.
    await dialogo(page).getByLabel("De", { exact: true }).fill("19:00");
    await dialogo(page).getByLabel("A", { exact: true }).fill("18:00");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toContainText("La hora de inicio debe ser antes que la de fin");
    // A otra hora ya cabe.
    await dialogo(page).getByLabel("De", { exact: true }).fill("18:00");
    await dialogo(page).getByLabel("A", { exact: true }).fill("19:00");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator('[data-prueba^="grupo-"]', { hasText: "Choca Pantalla" })).toContainText("Mar 18:00–19:00");
  });

  test("precios versionados: una vigencia nueva cierra la anterior y el cotizador ya ve al grupo con su precio", async ({ page }) => {
    await page.goto("/admin/precios");
    await page.getByLabel("Programa").selectOption({ label: "Pequeños Pantalla" });
    await expect(page.getByText("Este programa todavía no tiene precio")).toBeVisible();
    await page.getByRole("button", { name: "Nueva vigencia" }).click();
    await dialogo(page).getByLabel(/Inscripción/).fill("12.345");
    await dialogo(page).getByLabel(/Mensualidad/).fill("800");
    await dialogo(page).getByLabel("Rige desde").fill("2026-01-01");
    await dialogo(page).getByRole("button", { name: "Guardar la nueva vigencia" }).click();
    await expect(dialogo(page)).toContainText("Escribe un importe válido");
    await dialogo(page).getByLabel(/Inscripción/).fill("300");
    await dialogo(page).getByRole("button", { name: "Guardar la nueva vigencia" }).click();
    const tabla = page.getByTestId("historial-de-precios");
    await expect(tabla).toContainText("$300.00");
    await expect(tabla).toContainText("$800.00");
    await expect(tabla).toContainText("Vigente");
    // Un precio nuevo desde una fecha posterior cierra el anterior.
    await page.getByRole("button", { name: "Nueva vigencia" }).click();
    await dialogo(page).getByLabel(/Inscripción/).fill("350");
    await dialogo(page).getByLabel(/Mensualidad/).fill("900.50");
    await dialogo(page).getByLabel("Rige desde").fill("2026-06-01");
    await dialogo(page).getByRole("button", { name: "Guardar la nueva vigencia" }).click();
    await expect(tabla).toContainText("$900.50");
    const programas = await json<{ datos: { id: string; nombre: string }[] }>(admin, "/api/programas?limite=100");
    const programa = programas.datos.find((x) => x.nombre === "Pequeños Pantalla")!;
    const precios = await json<{ datos: { costo_mensualidad: string; vigencia_desde: string; vigencia_hasta: string | null }[] }>(admin, `/api/precios?programa_id=${programa.id}`);
    const porFecha = [...precios.datos].sort((a, b) => (a.vigencia_desde < b.vigencia_desde ? -1 : 1));
    expect(porFecha.map((p) => [p.costo_mensualidad, p.vigencia_desde, p.vigencia_hasta])).toEqual([
      ["800.00", "2026-01-01", "2026-05-31"],
      ["900.50", "2026-06-01", null],
    ]);
    await capturar(page, "65-precios", "celular");
    // El cotizador (la API que usa el bot) ya ofrece el grupo nuevo de la sucursal nueva con el precio vigente.
    const sucursales = await json<{ datos: { id: string; nombre: string; verticales: { vertical_id: string }[] }[] }>(admin, "/api/sucursales");
    const sede = sucursales.datos.find((s) => s.nombre === "Sede Pantalla")!;
    const cot = await json<{ programas: { programa_id: string; precio: { costo_mensualidad: string } | null; grupos: { nombre: string; lugares_disponibles: number }[] }[] }>(admin, `/api/cotizador?vertical_id=${sede.verticales[0]!.vertical_id}&sucursal_id=${sede.id}&edad=7`);
    const ofrecido = cot.programas.find((x) => x.programa_id === programa.id)!;
    expect(ofrecido.precio?.costo_mensualidad).toBe("900.50");
    expect(ofrecido.grupos.map((g) => g.nombre).sort()).toEqual(["Choca Pantalla", "Tarde Pantalla"]);
  });

  test("promociones: una promoción por hermanos con su descuento; el código no se repite", async ({ page }) => {
    await page.goto("/admin/promociones");
    const crear = async (codigo: string) => {
      await page.getByRole("button", { name: "Nueva promoción" }).click();
      const d = dialogo(page);
      await d.getByLabel("Nombre de la promoción").fill("Hermanos Pantalla");
      await d.getByLabel("Código").fill(codigo);
      await d.getByLabel("Vigente desde").fill("2026-01-01");
      await d.getByLabel("Condición").selectOption("min_hermanos");
      await d.getByLabel("Hermanos inscritos mínimos").fill("2");
      await d.getByLabel("Prioridad").fill("5");
      await d.getByRole("button", { name: "Guardar" }).click();
      return d;
    };
    let d = await crear("herm-pantalla");
    await expect(d).toContainText("Agrega al menos un beneficio");
    await d.getByLabel("Qué da").selectOption("mens_pct");
    await d.getByLabel("Porcentaje").fill("0");
    await d.getByRole("button", { name: "Agregar este beneficio" }).click();
    await expect(d).toContainText("Escribe un porcentaje de 0.01 a 100");
    await d.getByLabel("Porcentaje").fill("15");
    await d.getByRole("button", { name: "Agregar este beneficio" }).click();
    await expect(d.getByTestId("beneficios")).toContainText("Descuento en la mensualidad 15 %");
    await d.getByRole("button", { name: "Guardar" }).click();
    const tarjeta = page.getByTestId("promocion-HERM-PANTALLA");
    await expect(tarjeta).toContainText("Descuento en la mensualidad 15 %");
    await expect(tarjeta).toContainText("Por hermanos inscritos");
    const p = await json<{ datos: { codigo: string; prioridad: number; condicion_valor: { hermanos: number }; beneficios: { valor: string; modo: string }[] }[] }>(admin, "/api/promociones");
    const guardada = p.datos.find((x) => x.codigo === "HERM-PANTALLA")!;
    expect([guardada.prioridad, guardada.condicion_valor.hermanos, guardada.beneficios[0]!.modo, guardada.beneficios[0]!.valor]).toEqual([5, 2, "porcentaje", "15.00"]);
    // El mismo código otra vez: el servidor lo rechaza.
    d = await crear("herm-pantalla");
    await d.getByLabel("Qué da").selectOption("insc_gratis");
    await d.getByRole("button", { name: "Agregar este beneficio" }).click();
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d.getByRole("alert")).toContainText("Ya existe una promoción con ese código");
    await d.getByRole("button", { name: "Cerrar" }).click();
    await capturar(page, "66-promociones", "celular", { completa: true });
  });

  test("canales: el número se normaliza, no se repite y la bandeja de Chatwoot se liga al canal", async ({ page }) => {
    await page.goto("/admin/canales");
    await page.getByRole("button", { name: "Nuevo canal" }).click();
    await dialogo(page).getByLabel("Nombre del canal").fill("Línea Pantalla");
    await dialogo(page).getByLabel("Disciplina").selectOption({ label: "Disciplina Pantalla Editada" });
    await dialogo(page).getByLabel("Número de WhatsApp").fill("(55) 7777 0001");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    const tarjeta = page.locator('[data-prueba^="canal-"]', { hasText: "Línea Pantalla" });
    await expect(tarjeta).toContainText("whatsapp:+525577770001");
    await tarjeta.getByRole("button", { name: "Agregar bandeja" }).click();
    await dialogo(page).getByLabel("Nombre de la bandeja").fill("Bandeja Pantalla");
    await dialogo(page).getByLabel(/Cuenta de Chatwoot/).fill("9100");
    await dialogo(page).getByLabel(/Bandeja de Chatwoot \(número\)/).fill("55");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(tarjeta).toContainText("cuenta 9100, bandeja 55");
    // Otro canal con el mismo número: se rechaza.
    await page.getByRole("button", { name: "Nuevo canal" }).click();
    await dialogo(page).getByLabel("Nombre del canal").fill("Repetido");
    await dialogo(page).getByLabel("Disciplina").selectOption({ label: "Disciplina Pantalla Editada" });
    await dialogo(page).getByLabel("Número de WhatsApp").fill("+52 55 7777 0001");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page).getByRole("alert")).toContainText("ya está asignado a otro canal");
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
    await capturar(page, "67-canales", "celular");
  });

  test("configuración: los rangos se validan, el cambio llega a la API y al modo de cierre de toda la aplicación", async ({ page }) => {
    await page.goto("/admin/configuracion");
    await page.getByLabel(/Mensajes automáticos por teléfono al día/).fill("101");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText("Escribe un número de 0 a 100")).toBeVisible();
    await page.getByLabel(/Mensajes automáticos por teléfono al día/).fill("4");
    await page.getByLabel("Modo de cierre").selectOption("maestro_en_sitio");
    await page.getByLabel(/Faltas seguidas que avisan al asesor/).fill("5");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible();
    const c = await json<{ max_automaticos_por_dia: number; modo_cierre: string; umbral_faltas_consecutivas: number }>(admin, "/api/configuracion");
    expect([c.max_automaticos_por_dia, c.modo_cierre, c.umbral_faltas_consecutivas]).toEqual([4, "maestro_en_sitio", 5]);
    await capturar(page, "68-configuracion", "celular", { completa: true });
    // El aviso global de la primera escritura sigue a la vista unos segundos: se cierra para que el de la segunda sea el que se afirma.
    await page.getByRole("button", { name: "Cerrar este aviso" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeHidden();
    // Se deja como estaba para no alterar las demás pruebas.
    await page.getByLabel(/Mensajes automáticos por teléfono al día/).fill("3");
    await page.getByLabel("Modo de cierre").selectOption("asesor_whatsapp");
    await page.getByLabel(/Faltas seguidas que avisan al asesor/).fill("3");
    await page.getByRole("button", { name: "Guardar la configuración" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible();
    expect((await json<{ modo_cierre: string }>(admin, "/api/configuracion")).modo_cierre).toBe("asesor_whatsapp");
    expect(mundo.organizacion.slug).toBeTruthy();
  });
});
