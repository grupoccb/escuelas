// Lo que vive fuera de React: lo que arma el SERVIDOR y que una persona puede llegar a ver en el navegador. Prefijo de ids: `fuera-`. Casi todo es anónimo.
//
//   · La landing pública `/l/<identificador>` (src/http/landing.ts + landing-html.ts): HTML con su propio CSS en línea, sin React ni base.css. Es lo más expuesto al público
//     (la familia llega desde un anuncio), así que se inventaría completa: vacía, con parámetros de anuncio, con cada error de validación, con el aviso abierto, «Enviando…»,
//     gracias y error. (No hay modo oscuro: el sistema tiene un solo tema, claro; las tres filas «en modo oscuro» se retiraron.)
//   · El ícono de la pestaña (`/favicon.svg`) y las respuestas «crudas» del servidor (404 de assets, 404 JSON de `/api/...`, `/salud`, el QR de una campaña).
//
// Qué se simula y qué es real:
//   · REAL (sin escribir en la base): GET de la landing, todos los envíos con errores de validación (422), el error «el aviso cambió» (el servidor lo contesta antes de guardar),
//     el 403 del origen (se reenvía la petición con `Sec-Fetch-Site: cross-site`), los 404 y las rutas de salud.
//   · SIMULADO (se dice en el título): una sola sucursal, el color y el logo de marca (el navegador de pruebas no sale a Internet y el logo debe ser https; se reescribe la respuesta
//     real del servidor), la página de gracias (el mundo siempre tiene número de WhatsApp: se arma con el mismo `paginaDeGracias` que usa el servidor), y los errores 429 y 503
//     (con `paginaDeError`). El envío bueno NO se hace nunca: terminaría en un 303 a wa.me (que el navegador de pruebas no visita) y crearía un lead.
//   · El único que escribe en la base es el QR (genera el código de la campaña si no existía): va AL FINAL y con el rol de administrador.

import type { Page, Route } from "@playwright/test";
import { esperarListo, irA, type Contexto, type Escena } from "./escenas.ts";

const GRUPO = "Fuera de React";
const LANDING_HTML = "src/http/landing-html.ts";
const LANDING = "src/http/landing.ts";
const WEB = "src/http/web.ts";
const APP = "src/http/app.ts";

const CODIGO_DE_ANUNCIO = "ABCD2345";
const SUCURSAL_FALSA = "00000000-0000-4000-8000-000000000000";

// ─── Ayudas propias ──────────────────────────────────────────────────────────────────────────

const rutaLanding = (c: Contexto): string => c.mundo.recorridos.rutaLanding;
const telefono = (c: Contexto): string => c.mundo.recorridos.por[c.vista].telefonoLanding;

interface Datos {
  alumno?: string;
  edad?: string;
  sucursal?: string;
  telefono?: string;
  contacto?: string;
  acepta?: boolean;
}

async function llenar(c: Contexto, d: Datos): Promise<void> {
  const p = c.page;
  if (d.alumno !== undefined) await p.getByLabel("¿Quién tomará la clase?").fill(d.alumno);
  if (d.edad !== undefined) await p.getByLabel("Edad").fill(d.edad);
  if (d.sucursal !== undefined) await p.getByLabel("¿En qué sucursal quieres la clase?").selectOption({ label: d.sucursal });
  if (d.telefono !== undefined) await p.getByLabel("Tu teléfono de contacto").fill(d.telefono);
  if (d.contacto !== undefined) await p.getByLabel("Tu nombre (opcional)").fill(d.contacto);
  if (d.acepta) await p.getByLabel(/He leído y acepto/).check();
}

/** Un formulario completo y válido (los datos son ficticios; nunca se envía de verdad). */
const completo = (c: Contexto): Datos => ({ alumno: "Sofía de prueba", edad: "7", sucursal: c.mundo.sucursales.norte.nombre, telefono: telefono(c), contacto: "Familia de prueba", acepta: true });

const ENVIAR = "Enviar y continuar a WhatsApp";

async function enviar(c: Contexto): Promise<void> {
  await c.page.getByRole("button", { name: ENVIAR }).click();
}

async function quieta(c: Contexto): Promise<void> {
  await esperarListo(c.page);
}

/** Llena, envía y espera el resumen de errores del servidor (la página se repinta con el 422). */
async function enviarConErrores(c: Contexto, d: Datos): Promise<void> {
  await irA(c, rutaLanding(c));
  await llenar(c, d);
  await enviar(c);
  await c.page.getByRole("alert").waitFor();
  await quieta(c);
}

/** Cambia el HTML de la respuesta REAL de la landing (solo el GET de la página). */
async function reescribirLanding(c: Contexto, cambiar: (html: string) => string, csp?: (csp: string) => string): Promise<void> {
  await c.page.route(
    (u) => u.pathname === rutaLanding(c),
    async (r: Route) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      const cabeceras = { ...resp.headers() };
      if (csp && cabeceras["content-security-policy"]) cabeceras["content-security-policy"] = csp(cabeceras["content-security-policy"]);
      delete cabeceras["content-length"];
      return r.fulfill({ status: resp.status(), headers: cabeceras, body: cambiar(await resp.text()) });
    },
  );
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 48"><rect width="96" height="48" rx="8" fill="#7b2d8b"/><circle cx="24" cy="24" r="11" fill="#fff"/><path d="M44 31V17h8a7 7 0 0 1 0 14zm5-10v6h3a3 3 0 0 0 0-6z" fill="#fff"/></svg>`;

/** Una página que el servidor arma con sus propias funciones (para lo que no se puede provocar de verdad). La CSP lleva el mismo `nonce` que la página. */
async function servir(c: Contexto, ruta: string, estado: number, armar: (nonce: string) => Promise<string>): Promise<void> {
  const nonce = "bm9uY2UtZGUtcHJ1ZWJh";
  const html = await armar(nonce);
  await c.page.route(
    (u) => u.pathname === ruta,
    (r: Route) => r.fulfill({ status: estado, contentType: "text/html; charset=utf-8", headers: { "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; script-src 'nonce-${nonce}'; img-src https:; frame-ancestors 'none'; base-uri 'none'`, "Cache-Control": "no-store" }, body: html }),
  );
}

async function modulo(): Promise<typeof import("../../src/http/landing-html.ts")> {
  return import("../../src/http/landing-html.ts");
}

interface DisciplinaSimulada {
  nombre: string;
  color: string | null;
  edades: [number, number] | null;
  sucursales: string[];
}

/**
 * SIMULADO: la página con VARIAS disciplinas. El mundo de pruebas tiene una sola vertical (y esta escena no escribe en la base), así que se arma la página con el mismo
 * `paginaDeFormulario` del servidor, con los datos reales de la página abierta (nombre, sucursales, aviso) y disciplinas inventadas con nombres genéricos. El servidor real
 * arma las tarjetas con las mismas tablas (lo prueba `src/http/landing.itest.ts`).
 */
async function servirConDisciplinas(c: Contexto, lista: DisciplinaSimulada[], actual: number, valores: Record<string, string> = {}): Promise<void> {
  await irA(c, rutaLanding(c));
  const { paginaDeFormulario } = await modulo();
  const sucursales = await c.page.locator("#sucursal_id option[value]:not([value=''])").evaluateAll((os) => os.map((o) => ({ id: (o as HTMLOptionElement).value, nombre: o.textContent ?? "" })));
  const aviso = { id: await c.page.locator("input[name=documento_id]").inputValue(), version: Number(await c.page.locator("input[name=version]").inputValue()), titulo: (await c.page.locator("summary").textContent()) ?? "Aviso de privacidad", texto: (await c.page.locator("details .texto").textContent()) ?? "" };
  const escuela = (await c.page.locator(".marca-texto strong").textContent()) ?? "Escuela";
  const disciplinas = lista.map((d, i) => ({ slug: `disciplina-${i + 1}`, nombre: d.nombre, colorMarca: d.color, esActual: i === actual, edadMin: d.edades?.[0] ?? null, edadMax: d.edades?.[1] ?? null, sucursales: d.sucursales }));
  const nonce = "bm9uY2UtZGUtcHJ1ZWJh";
  const landing = { organizacionId: "", verticalId: "", nombre: lista[actual]!.nombre, colorMarca: lista[actual]!.color, logoUrl: null, sucursales, aviso, organizacionNombre: escuela, organizacionSlug: null, disciplinas, sedes: sucursales.map((s) => ({ nombre: s.nombre, direccion: null })) };
  await c.page.route(
    (u) => u.pathname === rutaLanding(c),
    (r: Route) => {
      if (r.request().method() !== "GET") return r.fallback();
      return r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", headers: { "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; script-src 'nonce-${nonce}'; img-src https:; frame-ancestors 'none'; base-uri 'none'`, "Cache-Control": "no-store" }, body: paginaDeFormulario(landing as never, { codigo: null, sucursalId: null, utm: {} }, { nonce }, null, valores) });
    },
  );
  await irA(c, rutaLanding(c));
}

const TRES_DISCIPLINAS: DisciplinaSimulada[] = [
  { nombre: "Disciplina uno", color: "#c4532a", edades: [3, 17], sucursales: ["Norte", "Sur"] },
  { nombre: "Disciplina dos", color: "#c24a7e", edades: [3, 12], sucursales: ["Norte"] },
  { nombre: "Disciplina tres", color: "#1f9a8c", edades: [16, 70], sucursales: ["Sur"] },
];

/** Lo que el navegador muestra al abrir una dirección que no es una página (JSON, texto, imagen, una página en blanco). */
async function verCruda(c: Contexto, ruta: string): Promise<void> {
  await c.page.goto(ruta);
  await quieta(c);
}

async function hayCabecera(page: Page, texto: string): Promise<void> {
  await page.getByText(texto).first().waitFor();
}

// ─── Escenas ─────────────────────────────────────────────────────────────────────────────────

const ESCENAS_ANONIMAS: Escena[] = [
  // La landing pública
  {
    id: "fuera-landing-vacio",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing pública `/l/<vertical>`: formulario vacío (con dos sucursales: aparece el selector «¿En qué sucursal…?»)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => irA(c, rutaLanding(c)),
  },
  {
    id: "fuera-landing-anuncio",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing que llega desde un anuncio (`?c=` código, `utm_*` y `s=` sucursal sugerida): la sucursal ya viene elegida; el código y los utm viajan ocultos",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => irA(c, `${rutaLanding(c)}?c=${CODIGO_DE_ANUNCIO}&utm_source=facebook&utm_medium=anuncio&utm_campaign=otono&s=${c.mundo.sucursales.sur.id}`),
  },
  {
    id: "fuera-landing-anuncio-sucursal-invalida",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con una `s=` que no es de la vertical y un `c=` con basura: se ignoran en silencio y el selector queda en «Elige una sucursal»",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => irA(c, `${rutaLanding(c)}?c=%3Cscript%3E&s=${SUCURSAL_FALSA}&utm_source=%3Cb%3Efacebook%3C/b%3E`),
  },
  {
    id: "fuera-landing-una-sucursal",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing de una vertical con UNA sola sucursal (SIMULADO: el mundo tiene dos; se quita el selector de la respuesta real, como lo arma el servidor: la sucursal viaja oculta)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      await reescribirLanding(c, (html) => html.replace(/<div class="campo[^"]*"><label for="sucursal_id">[\s\S]*?<\/select><\/div>/, `<input type="hidden" name="sucursal_id" value="${c.mundo.sucursales.norte.id}">`));
      await irA(c, rutaLanding(c));
    },
  },
  {
    id: "fuera-landing-marca",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con el logo y el color de marca de la vertical (SIMULADO: color #7b2d8b y un logo propio; el botón y la línea de la cabecera toman el color, el texto del botón se elige por contraste)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname === "/logo-simulado.svg",
        (r: Route) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: LOGO_SVG }),
      );
      const { colorSobre } = await modulo();
      const color = "#7b2d8b";
      await reescribirLanding(
        c,
        (html) => html.replace(/--marca: #[0-9a-fA-F]{6}; --sobre-marca: #[0-9a-fA-F]{6};/, `--marca: ${color}; --sobre-marca: ${colorSobre(color)};`).replace(/<span class="monograma"[^>]*>[^<]*<\/span>/, `<img src="/logo-simulado.svg" alt="">`),
        (csp) => csp.replace("img-src https:", "img-src 'self' https:"),
      );
      await irA(c, rutaLanding(c));
      await c.page.locator("header img").evaluate((img) => (img as HTMLImageElement).decode());
    },
  },
  {
    id: "fuera-landing-marca-clara",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con un color de marca CLARO (SIMULADO: #f2c230): el texto del botón se vuelve casi negro por contraste",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      const { colorSobre } = await modulo();
      const color = "#f2c230";
      await reescribirLanding(c, (html) => html.replace(/--marca: #[0-9a-fA-F]{6}; --sobre-marca: #[0-9a-fA-F]{6};/, `--marca: ${color}; --sobre-marca: ${colorSobre(color)};`));
      await irA(c, rutaLanding(c));
    },
  },
  {
    id: "fuera-landing-disciplinas",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing de una escuela con TRES disciplinas (SIMULADO con `paginaDeFormulario`, datos reales de la página): franjas del héroe, una tarjeta por disciplina con su color (la elegida marcada «Esta es tu elección»), edades y sucursales, y el selector «Disciplina» del formulario",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => servirConDisciplinas(c, TRES_DISCIPLINAS, 0),
  },
  {
    id: "fuera-landing-disciplinas-otra",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing de la SEGUNDA de tres disciplinas (SIMULADO): el color de marca del botón y la elegida cambian; la marca no depende de un nombre, sale del dato de cada disciplina",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: (c) => servirConDisciplinas(c, TRES_DISCIPLINAS, 1),
  },
  {
    id: "fuera-landing-disciplinas-sin-datos",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con disciplinas SIN color ni programas (SIMULADO): las tarjetas caen al neutro del sistema y no muestran edades; la elegida toma el color de marca de la página",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: (c) =>
      servirConDisciplinas(c, [
        { nombre: "Disciplina uno", color: null, edades: null, sucursales: [] },
        { nombre: "Disciplina dos", color: null, edades: null, sucursales: [] },
      ], 0),
  },
  {
    id: "fuera-landing-disciplinas-foco",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con varias disciplinas y el foco del teclado en la primera tarjeta (SIMULADO: anillo de foco de 2 px)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      await servirConDisciplinas(c, TRES_DISCIPLINAS, 0);
      for (let i = 0; i < 3; i++) await c.page.keyboard.press("Tab");
      await quieta(c);
    },
  },
  {
    id: "fuera-landing-para-mi",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con «Para mí» elegido: el campo «Tu nombre» se esconde, la ayuda del nombre pasa a «Escribe tu nombre» y el segmento elegido lleva palomita (no se envía)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      await c.page.getByRole("radio", { name: "Para mí" }).check();
      await llenar(c, { alumno: "Persona de prueba", edad: "34", telefono: telefono(c) });
      await quieta(c);
    },
  },
  {
    id: "fuera-landing-llena",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con el formulario completo y válido, listo para enviar (el aviso aceptado; no se envía)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      await llenar(c, completo(c));
      await quieta(c);
    },
  },
  {
    id: "fuera-landing-aviso-desplegado",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con el aviso de privacidad desplegado (el `<details>` abierto con su texto, con scroll si es largo)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      await c.page.locator("details > summary").click();
      await quieta(c);
    },
  },
  {
    id: "fuera-landing-foco-visible",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con el foco del teclado en el primer campo (anillo de foco de 3 px con el color de marca)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      await c.page.keyboard.press("Tab");
      await c.page.getByLabel("¿Quién tomará la clase?").waitFor();
      await quieta(c);
    },
  },

  // Errores de validación (el servidor responde 422 con la página repintada; nada se guarda)
  {
    id: "fuera-landing-errores-vacio",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing enviada vacía: resumen «Revisa estos datos» con un enlace por campo y el mensaje bajo cada campo (nombre, edad, sucursal, teléfono, aviso)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => enviarConErrores(c, {}),
  },
  {
    id: "fuera-landing-errores-telefono",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con teléfono malo: solo ese campo con error; el resto de lo escrito se conserva",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => enviarConErrores(c, { ...completo(c), telefono: "123" }),
  },
  {
    id: "fuera-landing-errores-edad",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con la edad fuera de rango (150): error «de 1 a 99» solo en la edad",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => enviarConErrores(c, { ...completo(c), edad: "150" }),
  },
  {
    id: "fuera-landing-errores-sin-aviso",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing sin aceptar el aviso de privacidad: error «Para continuar necesitamos que aceptes…» bajo la casilla",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => enviarConErrores(c, { ...completo(c), acepta: false }),
  },
  {
    id: "fuera-landing-errores-nombre-con-direccion",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con un nombre que lleva una dirección web (rechazado): error del nombre y del nombre de contacto con símbolos raros",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => enviarConErrores(c, { ...completo(c), alumno: "Visita www.ejemplo.com", contacto: "<b>Hola</b>" }),
  },
  {
    id: "fuera-landing-error-general-aviso-cambio",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con error GENERAL sin errores por campo: «El aviso de privacidad cambió…» (el aviso vigente cambió mientras se llenaba el formulario)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      await llenar(c, completo(c));
      // El documento que se mostró ya no es el vigente: el servidor lo detecta antes de guardar nada.
      await c.page.locator("input[name=documento_id]").evaluate((el) => ((el as HTMLInputElement).value = "documento-anterior"));
      await enviar(c);
      await c.page.getByRole("alert").waitFor();
      await quieta(c);
    },
  },
  {
    id: "fuera-landing-error-general-inesperado",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con el error general de un dato inesperado (422): «No pudimos registrar tu solicitud. Escríbenos por WhatsApp…» (SIMULADO con el mismo HTML del servidor)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      await llenar(c, completo(c));
      const { paginaDeFormulario } = await modulo();
      const nombre = ((await c.page.locator("h1").textContent()) ?? "").trim();
      const norte = c.mundo.sucursales.norte;
      const sur = c.mundo.sucursales.sur;
      const aviso = { id: "doc", version: 1, titulo: (await c.page.locator("summary").textContent()) ?? "Aviso de privacidad", texto: (await c.page.locator("details .texto").textContent()) ?? "" };
      await c.page.route(
        (u) => u.pathname === rutaLanding(c),
        (r: Route) => {
          if (r.request().method() !== "POST") return r.fallback();
          const nonce = "bm9uY2UtZGUtcHJ1ZWJh";
          const html = paginaDeFormulario({ organizacionId: "", verticalId: "", nombre, colorMarca: null, logoUrl: null, sucursales: [norte, sur], aviso } as never, { codigo: null, sucursalId: null, utm: {} }, { nonce }, { campos: {}, general: "No pudimos registrar tu solicitud. Escríbenos por WhatsApp o inténtalo de nuevo más tarde." }, {});
          return r.fulfill({ status: 422, contentType: "text/html; charset=utf-8", headers: { "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; script-src 'nonce-${nonce}'; img-src https:; frame-ancestors 'none'; base-uri 'none'` }, body: html });
        },
      );
      await enviar(c);
      await c.page.getByRole("alert").waitFor();
      await quieta(c);
    },
  },
  {
    id: "fuera-landing-enviando",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing con el botón en «Enviando…» y deshabilitado (el servidor tarda en responder; se cancela la navegación del formulario para dejarlo en ese estado, no se envía nada)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      await llenar(c, completo(c));
      // Un envío que nunca termina deja la página "cargando" y el navegador de pruebas ya no atiende; se cancela la navegación del formulario (la ventana de «Enviando…» es la misma).
      await c.page.evaluate(() => window.addEventListener("submit", (e) => e.preventDefault(), true));
      await enviar(c);
      await c.page.getByRole("button", { name: "Enviando…" }).waitFor();
      await c.page.waitForTimeout(200);
    },
  },
  {
    id: "fuera-landing-gracias",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Página de gracias de la landing (cuando la vertical no tiene número de WhatsApp: «¡Gracias! Recibimos tus datos…»; SIMULADA con `paginaDeGracias`, porque el mundo siempre tiene número y el envío bueno termina en un 303 a wa.me)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      const nombre = ((await c.page.locator("h1").textContent()) ?? "").trim();
      const { paginaDeGracias } = await modulo();
      await c.page.route(
        (u) => u.pathname === rutaLanding(c),
        (r: Route) => {
          if (r.request().method() !== "POST") return r.fallback();
          const nonce = "bm9uY2UtZGUtcHJ1ZWJh";
          return r.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: { "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; script-src 'nonce-${nonce}'; img-src https:; frame-ancestors 'none'; base-uri 'none'` },
            body: paginaDeGracias({ organizacionId: "", verticalId: "", nombre, colorMarca: null, logoUrl: null, sucursales: [], aviso: null }, { nonce }, "Familia de prueba"),
          });
        },
      );
      await llenar(c, completo(c));
      await enviar(c);
      await hayCabecera(c.page, "Recibimos tus datos");
      await quieta(c);
    },
  },

  // Páginas de error de la landing
  {
    id: "fuera-landing-error-no-existe",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing: «Página no encontrada» (404) para una vertical que no existe, sin aviso vigente o ambigua (la misma página para las tres, sin revelar cuál)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => irA(c, "/l/inexistente"),
  },
  {
    id: "fuera-landing-error-enlace-malo",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing: «Página no encontrada» con un enlace mal escrito (mayúsculas y símbolos: no pasa el filtro del identificador)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: (c) => irA(c, "/l/Mala_Direccion!"),
  },
  {
    id: "fuera-landing-error-origen",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing: «No se pudo enviar» (403) cuando el envío no viene de la propia página (se reenvía la petición real con `Sec-Fetch-Site: cross-site`)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: async (c) => {
      await irA(c, rutaLanding(c));
      await llenar(c, completo(c));
      await c.page.route(
        (u) => u.pathname === rutaLanding(c),
        async (r: Route) => {
          if (r.request().method() !== "POST") return r.fallback();
          const resp = await r.fetch({ headers: { ...r.request().headers(), "sec-fetch-site": "cross-site" } });
          return r.fulfill({ response: resp });
        },
      );
      await enviar(c);
      await hayCabecera(c.page, "No se pudo enviar");
      await quieta(c);
    },
  },
  {
    id: "fuera-landing-error-demasiadas-solicitudes",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing: «Demasiadas solicitudes» (429, límite por IP; SIMULADA con `paginaDeError`, para no agotar el límite del servidor de pruebas)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: async (c) => {
      const { paginaDeError } = await modulo();
      await servir(c, rutaLanding(c), 429, async (nonce) => paginaDeError("Demasiadas solicitudes", "Intenta de nuevo en un momento.", { nonce }));
      await irA(c, rutaLanding(c));
    },
  },
  {
    id: "fuera-landing-error-no-disponible",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Landing: «No disponible por ahora» (503, falla transitoria de la base; SIMULADA con `paginaDeError`)",
    tipo: "fuera-de-react",
    ruta: "/l/:vertical",
    fuentes: [LANDING_HTML, LANDING],
    ir: async (c) => {
      const { paginaDeError } = await modulo();
      await servir(c, rutaLanding(c), 503, async (nonce) => paginaDeError("No disponible por ahora", "Intenta de nuevo en un momento.", { nonce }));
      await irA(c, rutaLanding(c));
    },
  },

  // Ícono de la pestaña y título
  {
    id: "fuera-favicon",
    completa: false,
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Ícono de la pestaña `/favicon.svg` abierto en su propia página (el SVG ampliado a la ventana; en la pestaña real se ve a 16 px; `web/index.html` lo declara con `<link rel=icon>`)",
    tipo: "fuera-de-react",
    fuentes: [WEB, "web/index.html", "web/public/favicon.svg"],
    ir: (c) => verCruda(c, "/favicon.svg"),
  },
  {
    id: "fuera-pestana-ventana-chica",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Ícono de la pestaña a tamaño real: el favicon a 16, 32 y 64 px sobre blanco y sobre oscuro, junto al título «Iniciar sesión · Gestión» (el título lo pone `useTitulo` con `document.title = «<pantalla> · Gestión»`; la pestaña del navegador no se captura)",
    tipo: "fuera-de-react",
    fuentes: ["web/index.html", "web/public/favicon.svg", "web/src/ui/hooks.ts"],
    ir: async (c) => {
      await irA(c, "/");
      const titulo = await c.page.title();
      // Una página mínima del mismo origen que muestra el favicon real en los tamaños de una pestaña y el título que la aplicación le puso. Se sirve con su propia política de
      // seguridad (la de la aplicación no deja estilos en línea): Figtree desde el propio origen, la escala de espacios y los colores del sistema (la fila clara es la superficie;
      // la oscura es el color de la barra lateral, que hace de pestaña oscura del navegador).
      const nonce = "bm9uY2UtZGUtcHJ1ZWJh";
      const fila = (clase: string): string => `<div class="fila ${clase}"><img src="/favicon.svg" width="16" height="16" alt=""><img src="/favicon.svg" width="32" height="32" alt=""><img src="/favicon.svg" width="64" height="64" alt=""><span>${titulo}</span></div>`;
      await c.page.route(
        (u) => u.pathname === "/pestana-simulada",
        (r: Route) =>
          r.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: { "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; img-src 'self'; base-uri 'none'`, "Cache-Control": "no-store" },
            body:
              `<!doctype html><html lang="es"><meta charset="utf-8"><title>${titulo}</title><style nonce="${nonce}">` +
              `@font-face { font-family: "Figtree"; font-weight: 300 900; src: url("/fuentes/figtree-latin-wght-normal.woff2") format("woff2-variations"); }` +
              `:root { --fondo: #f3f4f8; --superficie: #ffffff; --texto: #171a2c; --lateral: #171a2c; --primario-texto: #ffffff; }` +
              `body { margin: 0; padding: 32px; display: grid; gap: 16px; background: var(--fondo); color: var(--texto); font: 500 16px/22px "Figtree", sans-serif; }` +
              `.fila { display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: 12px; } .clara { background: var(--superficie); color: var(--texto); } .oscura { background: var(--lateral); color: var(--primario-texto); }` +
              `</style><body>${fila("clara")}${fila("oscura")}</body></html>`,
          }),
      );
      await c.page.goto("/pestana-simulada");
      await c.page.locator("img").last().evaluate((img) => (img as HTMLImageElement).decode());
      await c.page.evaluate(() => document.fonts.ready);
      await quieta(c);
    },
  },
  {
    id: "fuera-sin-javascript",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Aviso `<noscript>` de `index.html`: «Esta aplicación necesita JavaScript.» sin hoja de estilos (SIMULADO: el navegador de pruebas tiene JS; se muestra el contenido de `<noscript>` y se impide cargar el script)",
    tipo: "fuera-de-react",
    fuentes: ["web/index.html"],
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname === "/",
        async (r: Route) => {
          const resp = await r.fetch();
          const cabeceras = { ...resp.headers() };
          delete cabeceras["content-length"];
          const html = (await resp.text()).replace(/<script[^>]*><\/script>/g, "").replace("<noscript>", "<div>").replace("</noscript>", "</div>");
          return r.fulfill({ status: resp.status(), headers: cabeceras, body: html });
        },
      );
      await c.page.goto("/");
      await c.page.getByText("Esta aplicación necesita JavaScript.").waitFor();
      await quieta(c);
    },
  },

  // Respuestas «crudas» del servidor
  {
    id: "fuera-servidor-404-asset",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Un archivo de `/assets/` que no existe (404): el navegador muestra una página en blanco (el servidor responde sin cuerpo, nunca el HTML de la aplicación)",
    tipo: "fuera-de-react",
    fuentes: [WEB],
    ir: (c) => verCruda(c, "/assets/no-existe-abc123.js"),
  },
  {
    id: "fuera-servidor-404-extension",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Una dirección con extensión y sin archivo (`/no-existe.js`, 404): la página de error de Express «Cannot GET /no-existe.js» en texto sin estilo",
    tipo: "fuera-de-react",
    fuentes: [WEB, APP],
    ir: (c) => verCruda(c, "/no-existe.js"),
  },
  {
    id: "fuera-servidor-404-prefijo-landing",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "`/l` sin identificador (404 del servidor, no la aplicación): «Cannot GET /l» de Express",
    tipo: "fuera-de-react",
    fuentes: [WEB, APP],
    ir: (c) => verCruda(c, "/l"),
  },
  {
    id: "fuera-servidor-404-webhook-get",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Un GET a un webhook que solo acepta POST (`/webhooks/chatwoot`, 404): «Cannot GET /webhooks/chatwoot» de Express",
    tipo: "fuera-de-react",
    fuentes: [APP],
    ir: (c) => verCruda(c, "/webhooks/chatwoot"),
  },
  {
    id: "fuera-api-404-json",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Cualquier `/api/...` abierta a mano en el navegador SIN sesión (aquí `/api/no-existe`): el JSON de «no autenticado» (401) como texto plano; la API pide sesión antes de decir si la ruta existe",
    tipo: "fuera-de-react",
    fuentes: [APP],
    ir: (c) => verCruda(c, "/api/no-existe"),
  },
  {
    id: "fuera-api-404-json-mayusculas",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "`/API/...` en mayúsculas (404 JSON «Ruta no encontrada», no la aplicación): el navegador muestra el JSON como texto",
    tipo: "fuera-de-react",
    fuentes: [APP],
    ir: (c) => verCruda(c, "/API/no-existe"),
  },
  {
    id: "fuera-salud",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "`/salud` (liveness): el navegador muestra el JSON `{\"ok\":true}` como texto",
    tipo: "fuera-de-react",
    fuentes: [APP],
    ir: (c) => verCruda(c, "/salud"),
  },
  {
    id: "fuera-salud-lista",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "`/salud/lista` (readiness): el JSON con las comprobaciones (base, migraciones, barrido) como texto",
    tipo: "fuera-de-react",
    fuentes: [APP],
    ir: (c) => verCruda(c, "/salud/lista"),
  },
  {
    id: "fuera-metricas",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "`/metricas` sin token configurado (404 sin cuerpo) o sin el token (401): el navegador muestra una página en blanco",
    tipo: "fuera-de-react",
    fuentes: [APP],
    ir: (c) => verCruda(c, "/metricas"),
  },
];

// ─── El QR de una campaña (lo bajan el administrador y el asesor; escribe: genera el código de la campaña si aún no tiene) ─────

const ESCENAS_DE_QR: Escena[] = [
  {
    id: "fuera-api-404-json-con-sesion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "`/api/...` que no existe, CON sesión de administrador: el JSON 404 «Ruta no encontrada» como texto plano",
    tipo: "fuera-de-react",
    fuentes: [APP],
    ir: (c) => verCruda(c, "/api/no-existe"),
  },
  {
    id: "fuera-qr-svg",
    completa: false,
    rol: "administrador",
    grupo: GRUPO,
    titulo: "QR de una campaña servido como imagen SVG (`/api/campanas/:id/qr?formato=svg`): lo que el navegador muestra al abrir la descarga (negro sobre blanco con zona de silencio)",
    tipo: "fuera-de-react",
    fuentes: ["src/qr/render.ts", "src/qr/qr.ts"],
    ir: (c) => verCruda(c, `/api/campanas/${c.mundo.tableros.campana.id}/qr?formato=svg&sucursal_id=${c.mundo.sucursales.norte.id}&vertical_id=${c.mundo.verticalId}&mm=80`),
  },
  {
    id: "fuera-qr-png",
    completa: false,
    rol: "administrador",
    grupo: GRUPO,
    titulo: "QR de una campaña servido como imagen PNG (`formato=png&escala=8`): lo que el navegador muestra",
    tipo: "fuera-de-react",
    fuentes: ["src/qr/render.ts", "src/qr/qr.ts"],
    ir: (c) => verCruda(c, `/api/campanas/${c.mundo.tableros.campana.id}/qr?formato=png&escala=8&sucursal_id=${c.mundo.sucursales.norte.id}&vertical_id=${c.mundo.verticalId}`),
  },
  {
    id: "fuera-qr-url-json",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Datos del QR de una campaña (`formato=url`): el JSON con la dirección de la landing, el código y el código formateado, como texto",
    tipo: "fuera-de-react",
    fuentes: ["src/qr/qr.ts"],
    ir: (c) => verCruda(c, `/api/campanas/${c.mundo.tableros.campana.id}/qr?formato=url&sucursal_id=${c.mundo.sucursales.norte.id}&vertical_id=${c.mundo.verticalId}`),
  },
];

// ─── Cupo de la landing ──────────────────────────────────────────────────────────────────────
// La landing limita las peticiones por IP (30 por minuto, GET y POST, y también cuenta las páginas de error), y el servidor de pruebas no lo sube. Cada escena de la landing
// pide cupo antes de empezar (se cuentan 2 peticiones por escena: el GET y, en las que envían, el POST) y espera si el último minuto ya lleva 24. Así el inventario no depende de la velocidad
// de la máquina ni se topa con la página «Demasiadas solicitudes» que no es la escena que se quería.
const VENTANA_MS = 60_000;
const CUPO_MAXIMO = 24;
const COSTO_POR_ESCENA = 2;
const pedidas: number[] = [];

async function pedirCupo(n: number): Promise<void> {
  for (;;) {
    const ahora = Date.now();
    while (pedidas.length > 0 && ahora - pedidas[0]! >= VENTANA_MS) pedidas.shift();
    if (pedidas.length + n <= CUPO_MAXIMO) break;
    await new Promise((r) => setTimeout(r, Math.max(100, VENTANA_MS - (ahora - pedidas[0]!) + 100)));
  }
  const ahora = Date.now();
  for (let i = 0; i < n; i++) pedidas.push(ahora);
}

const conCupo = (e: Escena): Escena => (e.id.startsWith("fuera-landing") || e.id === "fuera-servidor-404-prefijo-landing" ? { ...e, ir: async (c) => (await pedirCupo(COSTO_POR_ESCENA), e.ir(c)) } : e);

export const ESCENAS: Escena[] = [...ESCENAS_ANONIMAS, ...ESCENAS_DE_QR].map(conCupo);
