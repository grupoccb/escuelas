// V1: módulos por organización, en navegador real. Una organización APARTE (`mundo.modulos`, con sus cuatro roles y un lead) para no tocar a las demás pruebas. Por cada uno de
// los seis módulos apagables: la barra no lo muestra, la dirección directa dice «No disponible» SIN hacer una sola petición de ese módulo, lo demás sigue funcionando, y encenderlo
// desde Administración vuelve a mostrarlo SIN recargar el servidor. Además, la pantalla de Módulos (interruptores, dependencias) y las capturas en docs/capturas/v1/.

import { request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { CONTRASENA_DE_PRUEBA, sembrarUsuario } from "../../src/testutil/api.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";
import { sembrarEmbudo, sembrarFamilia, sembrarOrganizacion } from "../../src/testutil/semilla.ts";
import { carpetaDeCapturas } from "./mundo.ts";
import { expect, mundo, test, VISTA_CELULAR, VISTA_ESCRITORIO, type Rol, contextoConReloj } from "./fixtura.ts";

// La organización de módulos NO vive en el mundo compartido: con una segunda escuela viva, «la escuela es opcional» (el inicio de sesión sin escribirla) y la landing de la
// vertical dejarían de resolver a una sola. Se siembra aquí, se usa y al terminar se da de baja (soft delete, invariante 3): para las demás pruebas nunca existió.
const M: { organizacion: { id: string; slug: string }; usuarios: Record<Rol, { correo: string; contrasena: string }>; lead: { leadId: string } } = {
  organizacion: { id: "", slug: "" },
  usuarios: { administrador: { correo: "", contrasena: "" }, asesor: { correo: "", contrasena: "" }, maestro: { correo: "", contrasena: "" }, recepcion: { correo: "", contrasena: "" } },
  lead: { leadId: "" },
};
let prisma: PrismaPruebas;
test.beforeAll(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 4);
  const org = await sembrarOrganizacion(prisma, "Escuela de módulos");
  await sembrarEmbudo(prisma, org);
  const norte = org.sucursales[0]!.id;
  M.organizacion = { id: org.organizacionId, slug: org.slug };
  for (const rol of ["administrador", "asesor", "maestro", "recepcion"] as const) {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, contrasena: CONTRASENA_DE_PRUEBA, sucursales: rol === "asesor" || rol === "recepcion" ? [norte] : [] });
    M.usuarios[rol] = { correo: u.correo, contrasena: u.contrasena };
  }
  M.lead = { leadId: (await sembrarFamilia(prisma, org, { sucursalId: norte, nombre: "Niña de módulos", edad: 7 })).leadId };
});

const TODOS = ["cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas", "tableros"] as const;
type Modulo = (typeof TODOS)[number];
const UUID = "00000000-0000-4000-8000-000000000001";

/** Una sesión en la organización de módulos: una API con cookie (para cambiar los módulos y comprobar) y un contexto de navegador por rol. */
async function sesionDe(rol: Rol) {
  const u = M.usuarios[rol];
  const api = await request.newContext({ baseURL: mundo.base, extraHTTPHeaders: { "x-requested-with": "prueba" } });
  const r = await api.post("/api/sesion", { data: { organizacion: M.organizacion.slug, correo: u.correo, contrasena: u.contrasena } });
  if (r.status() !== 201) throw new Error(`No se pudo iniciar sesión como ${rol} en la organización de módulos: ${r.status()}`);
  return { api, estado: await api.storageState() };
}
async function paginaDe(browser: Browser, rol: Rol, vista: { width: number; height: number } = VISTA_ESCRITORIO): Promise<{ context: BrowserContext; page: Page }> {
  const { estado } = await sesionDe(rol);
  const context = await contextoConReloj(browser, { baseURL: mundo.base, locale: "es-MX", timezoneId: "America/Mexico_City", viewport: vista, storageState: estado });
  return { context, page: await context.newPage() };
}

/** Lo que se apaga junto con un módulo (él y todo lo que lo necesita): la API rechaza otra cosa. */
const NECESITA: Record<Modulo, readonly string[]> = { cotizador: ["captacion"], clase_muestra: ["captacion"], inscripcion: ["captacion", "cotizador"], operacion: ["inscripcion"], finanzas: ["inscripcion"], tableros: ["inscripcion", "finanzas", "clase_muestra"] };
function conDependientes(m: Modulo): Modulo[] {
  const salida = new Set<Modulo>([m]);
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const x of TODOS) {
      if (!salida.has(x) && NECESITA[x].some((r) => salida.has(r as Modulo))) {
        salida.add(x);
        cambio = true;
      }
    }
  }
  return [...salida];
}

let admin: Awaited<ReturnType<typeof sesionDe>>["api"];
test.beforeAll(async () => {
  admin = (await sesionDe("administrador")).api;
});
test.afterAll(async () => {
  await admin.put("/api/modulos", { data: Object.fromEntries(TODOS.map((m) => [m, true])) });
  await admin.dispose();
  // La escuela de módulos se da de baja AL FINAL (sus sesiones ya no hacen falta): para las demás pruebas nunca existió.
  await prisma.organizacion.update({ where: { id: M.organizacion.id }, data: { eliminado_en: new Date() } });
  await prisma.$disconnect();
});
const fijar = async (apagados: readonly Modulo[]) => {
  const r = await admin.put("/api/modulos", { data: Object.fromEntries(TODOS.map((m) => [m, !apagados.includes(m)])) });
  expect(r.status(), await r.text()).toBe(200);
};

interface Caso {
  modulo: Modulo;
  rol: Rol;
  /** Direcciones directas del módulo (cualquier identificador sirve: el módulo se revisa antes de pedir nada). */
  rutas: string[];
  /** Secciones de la barra que desaparecen. */
  secciones: string[];
  /** Peticiones a la API que NO deben hacerse. */
  api: RegExp;
}
const CASOS: Caso[] = [
  { modulo: "clase_muestra", rol: "maestro", rutas: ["/hoy", `/clases/${UUID}/registro`], secciones: ["Hoy"], api: /\/api\/(clases-muestra|maestro)/ },
  { modulo: "operacion", rol: "maestro", rutas: ["/pase"], secciones: ["Pase de lista"], api: /\/api\/(grupos\/[^/]+\/pase|niveles|eventos|inscripciones\/[^/]+\/asistencia)/ },
  { modulo: "finanzas", rol: "recepcion", rutas: ["/pagos", "/cuenta", `/cuenta/${UUID}`, "/uniformes", "/ventas"], secciones: ["Registrar pago", "Estado de cuenta", "Uniformes", "Ventas"], api: /\/api\/(cargos|pagos|beneficios|productos|ventas|tutores\/[^/]+\/estado-cuenta)/ },
  { modulo: "inscripcion", rol: "recepcion", rutas: ["/alumnos", `/alumnos/${UUID}`, `/alumnos/${UUID}/salud`, "/familias", "/familias/un-solo-hijo", `/familias/${UUID}`, `/leads/${UUID}/convertir`], secciones: ["Alumnos", "Familias"], api: /\/api\/(tutores|alumnos|familias|inscripciones|reportes\/ocupacion|leads\/[^/]+\/(conversion|convertir))/ },
  { modulo: "tableros", rol: "asesor", rutas: ["/tableros"], secciones: ["Tableros"], api: /\/api\/(reportes|campanas\/[^/]+\/gastos)/ },
];

for (const c of CASOS) {
  test.describe(`${c.modulo} apagado`, () => {
    test(`la barra de ${c.rol} no muestra ${c.secciones.join(", ")}; la dirección directa dice «No disponible» sin pedir nada; encenderlo lo devuelve sin reiniciar`, async ({ browser }) => {
      test.setTimeout(120_000);
      const apagados = conDependientes(c.modulo);
      await fijar([]);
      const { context, page } = await paginaDe(browser, c.rol);
      try {
        // Encendido: la barra tiene sus secciones.
        await page.goto("/mas");
        for (const s of c.secciones) await expect(page.getByRole("link", { name: s, exact: true }).first()).toBeVisible();

        await fijar(apagados);
        const peticiones: string[] = [];
        page.on("request", (r) => {
          if (c.api.test(new URL(r.url()).pathname)) peticiones.push(`${r.method()} ${r.url()}`);
        });
        // La barra, con la sesión que ya estaba abierta: al volver a pedir /api/yo desaparecen.
        await page.goto("/mas");
        for (const s of c.secciones) await expect(page.getByRole("link", { name: s, exact: true })).toHaveCount(0);
        for (const ruta of c.rutas) {
          await page.goto(ruta);
          await expect(page.getByRole("heading", { name: "No disponible" }), ruta).toBeVisible();
          await expect(page.getByText("todavía no está activada en tu escuela")).toBeVisible();
        }
        expect(peticiones, "ninguna petición de un módulo apagado").toEqual([]);
        // Lo demás sigue funcionando: «Más» y la sesión.
        await page.goto("/mas");
        await expect(page.getByRole("heading", { name: "Más" })).toBeVisible();

        // Encenderlo: sin tocar el servidor, la barra y la pantalla vuelven.
        await fijar([]);
        await page.goto(c.rutas[0]!);
        await expect(page.getByRole("heading", { name: "No disponible" })).toHaveCount(0);
        await page.goto("/mas");
        for (const s of c.secciones) await expect(page.getByRole("link", { name: s, exact: true }).first()).toBeVisible();
      } finally {
        await context.close();
        await fijar([]);
      }
    });
  });
}

// V13-fix EV-15: el filtro «Tipo de tarea» ofrecía los 20 tipos aunque su módulo estuviera apagado (la lista sí venía filtrada del servidor).
test.describe("tareas: el filtro «Tipo de tarea» no ofrece los tipos de un módulo apagado", () => {
  const POR_MODULO: { modulo: Modulo; tipos: string[] }[] = [
    { modulo: "finanzas", tipos: ["Deuda vencida", "Beneficio en revisión", "Cobranza sin canal"] },
    { modulo: "cotizador", tipos: ["Nuevo en lista de espera"] },
    { modulo: "clase_muestra", tipos: ["Listo para cerrar"] },
    { modulo: "operacion", tipos: ["Faltas seguidas"] },
  ];
  for (const { modulo, tipos } of POR_MODULO) {
    test(`${modulo} apagado: no aparecen ${tipos.join(", ")}; encendido, sí`, async ({ browser }) => {
      test.setTimeout(90_000);
      await fijar([]);
      const { context, page } = await paginaDe(browser, "asesor");
      try {
        const opciones = async () => (await page.getByLabel("Tipo de tarea").locator("option").allTextContents()).map((t) => t.trim());
        await page.goto("/tareas");
        await expect(page.getByLabel("Tipo de tarea")).toBeVisible();
        const todas = await opciones();
        for (const t of tipos) expect(todas, `encendido: ${t}`).toContain(t);
        await fijar(conDependientes(modulo));
        await page.goto("/tareas");
        await expect(page.getByLabel("Tipo de tarea")).toBeVisible();
        const sin = await opciones();
        for (const t of tipos) expect(sin, `apagado: ${t}`).not.toContain(t);
        expect(sin).toContain("Todos los tipos");
        expect(sin.length).toBeLessThan(todas.length);
        expect(sin).toContain("Sin plantilla apta"); // lo de la captación sigue
      } finally {
        await context.close();
        await fijar([]);
      }
    });
  }
});

test.describe("cotizador y clase muestra apagados: la ficha del lead no los muestra ni los pide", () => {
  for (const modulo of ["cotizador", "clase_muestra"] as const) {
    test(`${modulo}: la ficha del asesor no trae su tarjeta y no hace ninguna de sus peticiones`, async ({ browser }) => {
      const tarjeta = modulo === "cotizador" ? "Cotizaciones" : "Clase muestra";
      const api = modulo === "cotizador" ? /\/api\/(cotizador|lista-espera|leads\/[^/]+\/cotizaciones)/ : /\/api\/clases-muestra/;
      const { context, page } = await paginaDe(browser, "asesor");
      try {
        await fijar([]);
        await page.goto(`/leads/${M.lead.leadId}`);
        await expect(page.getByRole("heading", { name: tarjeta, exact: true })).toBeVisible();
        await fijar(conDependientes(modulo));
        const peticiones: string[] = [];
        page.on("request", (r) => {
          if (api.test(new URL(r.url()).pathname)) peticiones.push(r.url());
        });
        await page.goto(`/leads/${M.lead.leadId}`);
        await expect(page.getByRole("heading", { name: "Mamá" }).or(page.getByText("Mamá").first())).toBeVisible();
        await expect(page.getByRole("heading", { name: tarjeta, exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: modulo === "cotizador" ? /Cotizar/ : /Agendar clase muestra/ })).toHaveCount(0);
        expect(peticiones).toEqual([]);
      } finally {
        await context.close();
        await fijar([]);
      }
    });
  }
});

test.describe("administración: los interruptores", () => {
  test.describe.configure({ mode: "serial" });

  test("la pantalla de módulos muestra los siete con su explicación; la captación no se mueve; encender sin la base y apagar con dependientes no se puede y se dice por qué", async ({ browser }) => {
    await fijar([]);
    const { context, page } = await paginaDe(browser, "administrador");
    try {
      await page.goto("/admin");
      await page.getByRole("link", { name: "Módulos" }).click();
      await expect(page.getByRole("heading", { name: "Módulos", exact: true })).toBeVisible();
      for (const nombre of ["Captación", "Cotizador", "Clase muestra", "Inscripción", "Operación diaria (asistencia, niveles y eventos)", "Finanzas", "Tableros"]) {
        await expect(page.getByRole("heading", { name: nombre, exact: true })).toBeVisible();
      }
      await expect(page.getByTestId("interruptor-captacion")).toBeDisabled();
      await expect(page.getByTestId("modulo-captacion")).toContainText("Siempre encendido");
      // Con todo encendido, la inscripción tiene dependientes y no se puede apagar todavía.
      await expect(page.getByTestId("interruptor-inscripcion")).toBeDisabled();
      await expect(page.getByTestId("modulo-inscripcion")).toContainText("Para apagarlo, primero apaga:");
      await expect(page.getByTestId("modulo-inscripcion")).toContainText("Finanzas");
      await expect(page.getByTestId("interruptor-tableros")).toBeEnabled();
      // El texto no trae identificadores técnicos ni inglés.
      const texto = await page.getByTestId("modulos").innerText();
      expect(texto).not.toMatch(/clase_muestra|inscripcion\b|modulo_|\bAPI\b|undefined/);
      await page.screenshot({ path: capturaDe("01-administracion-modulos-escritorio"), animations: "disabled", fullPage: true });
    } finally {
      await context.close();
    }
  });

  test("apagar y encender un interruptor surte efecto al instante: la barra cambia sin recargar y la API del módulo responde 404 y luego 200", async ({ browser }) => {
    await fijar([]);
    const { context, page } = await paginaDe(browser, "administrador");
    try {
      await page.goto("/admin/modulos");
      const nav = page.locator("nav.lateral");
      await expect(nav.getByRole("link", { name: "Tableros", exact: true })).toBeVisible();
      // La casilla es "controlada": cambia cuando el servidor contesta, así que se hace clic y se espera el resultado.
      await page.getByTestId("interruptor-tableros").click();
      // V7: apagar toca lo que ven otras personas, así que pide confirmación (y la casilla sigue encendida hasta confirmar).
      await expect(page.getByTestId("modulo-tableros")).toContainText("Encendido");
      await page.getByRole("dialog").getByRole("button", { name: "Apagar Tableros" }).click();
      await expect(page.getByTestId("modulo-tableros")).toContainText("Apagado");
      await expect(nav.getByRole("link", { name: "Tableros", exact: true })).toHaveCount(0);
      expect((await admin.get("/api/reportes/ejecutivo")).status()).toBe(404);
      await page.getByTestId("interruptor-tableros").click();
      await expect(page.getByTestId("modulo-tableros")).toContainText("Encendido");
      await expect(nav.getByRole("link", { name: "Tableros", exact: true })).toBeVisible();
      expect((await admin.get("/api/reportes/ejecutivo")).status()).toBe(200);

      // Se enciende en orden: sin la inscripción no se puede encender finanzas.
      await fijar(["inscripcion", "operacion", "finanzas", "tableros"]);
      await page.reload();
      await expect(page.getByTestId("interruptor-finanzas")).toBeDisabled();
      await expect(page.getByTestId("modulo-finanzas")).toContainText("Para encenderlo, primero enciende: Inscripción.");
      await page.getByTestId("interruptor-inscripcion").click();
      await expect(page.getByTestId("interruptor-finanzas")).toBeEnabled();
      await expect(nav.getByRole("link", { name: "Alumnos", exact: true })).toBeVisible();
    } finally {
      await context.close();
      await fijar([]);
    }
  });

  test("quien no administra no ve la pantalla de módulos: «Sin acceso» y ninguna petición", async ({ browser }) => {
    const { context, page } = await paginaDe(browser, "asesor");
    try {
      const peticiones: string[] = [];
      page.on("request", (r) => {
        if (/\/api\/modulos/.test(r.url())) peticiones.push(r.url());
      });
      await page.goto("/admin/modulos");
      await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
      expect(peticiones).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

test.describe("capturas: la barra con módulos apagados", () => {
  test("un asesor con solo la captación: la barra lateral (escritorio) y la inferior (celular), y la pantalla «No disponible»", async ({ browser }) => {
    await fijar(TODOS);
    try {
      let { context, page } = await paginaDe(browser, "asesor", VISTA_ESCRITORIO);
      await page.goto("/embudo");
      await expect(page.getByRole("heading", { name: "Embudo", exact: true })).toBeVisible();
      await expect(page.locator("nav.lateral").getByRole("link")).toHaveCount(2); // Embudo y Tareas
      await page.screenshot({ path: capturaDe("02-barra-asesor-solo-captacion-escritorio"), animations: "disabled" });
      await context.close();

      ({ context, page } = await paginaDe(browser, "asesor", VISTA_CELULAR));
      await page.goto("/embudo");
      await expect(page.getByRole("heading", { name: "Embudo", exact: true })).toBeVisible();
      await page.screenshot({ path: capturaDe("03-barra-asesor-solo-captacion-celular"), animations: "disabled" });
      await page.goto("/tableros");
      await expect(page.getByRole("heading", { name: "No disponible" })).toBeVisible();
      await page.screenshot({ path: capturaDe("04-no-disponible-celular"), animations: "disabled" });
      await context.close();

      // La administración, en celular, con casi todo apagado.
      ({ context, page } = await paginaDe(browser, "administrador", VISTA_CELULAR));
      await page.goto("/admin/modulos");
      await expect(page.getByTestId("modulo-finanzas")).toContainText("Apagado");
      await page.screenshot({ path: capturaDe("05-administracion-modulos-solo-captacion-celular"), animations: "disabled", fullPage: true });
      await context.close();
    } finally {
      await fijar([]);
    }
  });
});

function capturaDe(nombre: string): string {
  const carpeta = carpetaDeCapturas("v1");
  mkdirSync(carpeta, { recursive: true });
  return resolve(carpeta, `${nombre}.png`);
}
