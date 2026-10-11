// J8: administración de mensajería y usuarios en el navegador — plantillas (con su clase declarada), automatizaciones (encender, desfases, horario dentro de 09:00–20:00),
// usuarios y roles (alta, contraseña de otra persona, activar y desactivar) y la bandeja del administrador (eventos inesperados y tareas sin lead).

import { request, type APIRequestContext, type Page } from "@playwright/test";
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
const { plantillaServicio, plantillaMarketing, automatizaciones, evento, tareaSinLead } = mundo.mensajeria;

test.describe("quien no administra no entra a la mensajería ni a los usuarios", () => {
  test.use(comoRol("recepcion"));
  test("sin acceso por la dirección y sin una sola petición", async ({ page }) => {
    const peticiones: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/(plantillas|automatizaciones|usuarios|eventos-inesperados)/.test(r.url())) peticiones.push(r.url());
    });
    for (const ruta of ["/admin/plantillas", "/admin/automatizaciones", "/admin/usuarios", "/admin/bandeja"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    }
    expect(peticiones).toEqual([]);
  });
});

test.describe("administrador", () => {
  test.use(comoRol("administrador"));
  test.describe.configure({ mode: "serial" });

  test("plantillas: la clase se declara al darla de alta y una de servicio no puede ser de marketing", async ({ page }) => {
    await page.goto("/admin/plantillas");
    const servicio = page.getByTestId(`plantilla-${plantillaServicio.codigo}`);
    await expect(servicio).toContainText("Servicio");
    await expect(servicio).toContainText("Aprobada");
    await expect(servicio).toContainText("2 automatizaciones");
    const marketing = page.getByTestId(`plantilla-${plantillaMarketing.codigo}`);
    await expect(marketing).toContainText("Marketing");
    await expect(marketing).toContainText("Pendiente de aprobación");
    await capturar(page, "70-plantillas", "celular");
    await capturar(page, "70-plantillas", "escritorio");

    await page.getByRole("button", { name: "Nueva plantilla" }).click();
    const d = dialogo(page);
    await d.getByLabel("Código").fill("aviso_nuevo");
    await d.getByLabel(/Identificador en Twilio/).fill("HX00000000000000000000000000000003");
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d).toContainText("Declara si es de servicio o de marketing");
    // Servicio + categoría marketing: la pantalla lo dice antes de ir al servidor.
    await d.locator("label.opcion", { hasText: "Servicio" }).click();
    await d.getByLabel("Categoría ante Meta").selectOption("marketing");
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d).toContainText("no puede ser de categoría marketing");
    await d.getByLabel("Categoría ante Meta").selectOption("utility");
    await d.getByRole("button", { name: "Agregar una variable" }).click();
    await d.getByLabel("Nombre 1").fill("nombre_familia");
    await d.getByRole("button", { name: "Guardar" }).click();
    const nueva = page.getByTestId("plantilla-aviso_nuevo");
    await expect(nueva).toContainText("Servicio");
    await expect(nueva).toContainText("1=nombre_familia");
    const guardada = (await json<{ datos: { codigo: string; clase_mensaje: string; categoria: string; estado_aprobacion: string }[] }>(admin, "/api/plantillas?limite=100")).datos.find((p) => p.codigo === "aviso_nuevo")!;
    expect([guardada.clase_mensaje, guardada.categoria, guardada.estado_aprobacion]).toEqual(["servicio", "utility", "pendiente"]);
    // Aprobarla (por ahora a mano, sin sincronización con el proveedor).
    await nueva.getByRole("button", { name: "Editar" }).click();
    await dialogo(page).getByLabel("Estado de aprobación").selectOption("aprobada");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(nueva).toContainText("Aprobada");
    // Una plantilla en uso por una automatización no se da de baja.
    await servicio.getByRole("button", { name: "Dar de baja" }).click();
    await dialogo(page).getByRole("button", { name: "Dar de baja" }).click();
    await expect(dialogo(page).getByRole("alert")).toContainText("automatización");
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
  });

  test("automatizaciones: encender y apagar, el desfase respeta el sentido del evento y el horario nunca sale de 09:00 a 20:00", async ({ page }) => {
    await page.goto("/admin/automatizaciones");
    const tarjeta = page.getByTestId(`automatizacion-${automatizaciones.recordatorio.id}`);
    await expect(tarjeta).toContainText("1 día antes");
    // R7b: el estado lo dice el interruptor (rol «switch»; su nombre es la acción que hará: «Apagar …» / «Encender …»).
    await expect(tarjeta.getByRole("switch", { name: /^Apagar / })).toBeChecked();
    await tarjeta.getByRole("switch", { name: /^Apagar / }).click();
    await expect(tarjeta.getByRole("switch", { name: /^Encender / })).not.toBeChecked();
    expect((await json<{ activo: boolean }[] | { datos: { id: string; activo: boolean }[] }>(admin, "/api/automatizaciones?limite=50") as { datos: { id: string; activo: boolean }[] }).datos.find((a) => a.id === automatizaciones.recordatorio.id)?.activo).toBe(false);
    await tarjeta.getByRole("switch", { name: /^Encender / }).click();
    await expect(tarjeta.getByRole("switch", { name: /^Apagar / })).toBeChecked();

    await tarjeta.getByRole("button", { name: "Ajustar" }).click();
    const d = dialogo(page);
    // Un recordatorio ANTES de la clase no puede tener un desfase positivo.
    await d.getByLabel("Desfase (minutos)").fill("30");
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d).toContainText("Este aviso sale ANTES del evento");
    await d.getByLabel("Desfase (minutos)").fill("-180");
    // Fuera de horario: lo dice la pantalla.
    await d.getByLabel("Envía desde").fill("08:00");
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d).toContainText("solo salen entre las 09:00 y las 20:00");
    await d.getByLabel("Envía desde").fill("10:00");
    await d.getByLabel("Envía hasta").fill("21:00");
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d).toContainText("solo salen entre las 09:00 y las 20:00");
    await capturar(page, "71-automatizacion-horario", "celular");
    await d.getByLabel("Envía hasta").fill("19:00");
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(tarjeta).toContainText("3 horas antes");
    await expect(tarjeta).toContainText("de 10:00 a 19:00");
    const guardada = (await json<{ datos: { id: string; offset_minutos: number; hora_inicio_min: number; hora_fin_min: number }[] }>(admin, "/api/automatizaciones?limite=50")).datos.find((a) => a.id === automatizaciones.recordatorio.id)!;
    expect([guardada.offset_minutos, guardada.hora_inicio_min, guardada.hora_fin_min]).toEqual([-180, 600, 1140]);
  });

  test("usuarios: alta con contraseña, restablecer la de otra persona (su contraseña vieja deja de servir) y desactivar", async ({ page }) => {
    await page.goto("/admin/usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const d = dialogo(page);
    await d.getByLabel("Correo").fill("nueva.asesora@navegador.test");
    await d.getByRole("textbox", { name: /^Nombre/ }).fill("Nueva Asesora");
    await d.getByLabel("Contraseña inicial").fill("corta");
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d).toContainText("Debe tener al menos 10 caracteres");
    await d.getByLabel("Contraseña inicial").fill("Contrasena-inicial-2026");
    await d.getByLabel(mundo.sucursales.norte.nombre).check();
    await d.getByRole("button", { name: "Guardar" }).click();
    const tarjeta = page.getByTestId("usuario-nueva.asesora@navegador.test");
    await expect(tarjeta).toContainText("Asesor");
    await expect(tarjeta).toContainText(mundo.sucursales.norte.nombre);
    // Entra con la contraseña inicial...
    const entrar = async (contrasena: string) => {
      const c = await request.newContext({ baseURL: mundo.base });
      const r = await c.post("/api/sesion", { data: { organizacion: mundo.organizacion.slug, correo: "nueva.asesora@navegador.test", contrasena }, headers: { "x-requested-with": "prueba" } });
      await c.dispose();
      return r.status();
    };
    expect(await entrar("Contrasena-inicial-2026")).toBe(201);
    // ...el administrador se la restablece y la vieja ya no sirve.
    await tarjeta.getByRole("button", { name: "Editar" }).click();
    await dialogo(page).getByLabel(/Restablecer la contraseña/).fill("Contrasena-nueva-2026");
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page)).toHaveCount(0);
    expect(await entrar("Contrasena-inicial-2026")).toBe(401);
    expect(await entrar("Contrasena-nueva-2026")).toBe(201);
    // Desactivarla.
    await tarjeta.getByRole("button", { name: "Editar" }).click();
    await dialogo(page).getByLabel("Activo").uncheck();
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(tarjeta).toContainText("Inactivo");
    expect(await entrar("Contrasena-nueva-2026")).toBe(401);
    await capturar(page, "72-usuarios", "celular");
    await capturar(page, "72-usuarios", "escritorio");
  });

  test("usuarios: no puede desactivarse a sí mismo ni quitarse el rol; el agente de Chatwoot sin directorio se explica", async ({ page }) => {
    await page.goto("/admin/usuarios");
    const yo = page.getByTestId(`usuario-${mundo.usuarios.administrador.correo}`);
    await expect(yo).toContainText("(tú)");
    await yo.getByRole("button", { name: "Editar" }).click();
    await dialogo(page).getByLabel("Activo").uncheck();
    await dialogo(page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(page).getByRole("alert")).toBeVisible();
    const sigue = (await json<{ datos: { correo: string; activo: boolean; rol: string }[] }>(admin, "/api/usuarios?limite=100")).datos.find((u) => u.correo === mundo.usuarios.administrador.correo)!;
    expect([sigue.activo, sigue.rol]).toEqual([true, "administrador"]);
    await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
    const asesor = page.getByTestId(`usuario-${mundo.usuarios.asesor.correo}`);
    await asesor.getByRole("button", { name: "Agente de Chatwoot" }).click();
    await dialogo(page).getByRole("button", { name: "Vincular" }).click();
    await expect(dialogo(page).getByRole("alert")).toContainText("no está configurado");
  });

  test("bandeja: los eventos inesperados y las tareas sin lead se atienden aquí, sin contenido del evento", async ({ page }) => {
    await page.goto("/admin/bandeja");
    const ev = page.getByTestId(`evento-${evento.id}`);
    await expect(ev).toContainText("WhatsApp (mensaje entrante)");
    await expect(ev).toContainText("Faltaban datos o venían con otra forma");
    await expect(ev).toContainText(evento.detalle);
    await expect(ev).toContainText("Tarea pendiente");
    await expect(page.getByTestId(`tarea-${tareaSinLead.id}`)).toContainText(tareaSinLead.descripcion);
    await capturar(page, "73-bandeja-del-administrador", "celular", { completa: true });
    await ev.getByRole("button", { name: "Marcar atendido" }).click();
    await expect(page.getByTestId(`evento-${evento.id}`)).toHaveCount(0);
    expect((await json<{ datos: { id: string; estado: string }[] }>(admin, "/api/tareas?estado=hecha&limite=100")).datos.some((t) => t.id === evento.tareaId)).toBe(true);
    await page.getByTestId(`tarea-${tareaSinLead.id}`).getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByTestId(`tarea-${tareaSinLead.id}`)).toHaveCount(0);
    // Quitado el filtro, el evento atendido sigue como constancia.
    await page.getByLabel("Solo los que tienen una tarea pendiente").uncheck();
    await expect(page.getByTestId(`evento-${evento.id}`)).toContainText("Atendido");
  });
});
