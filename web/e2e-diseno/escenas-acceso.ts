// Acceso y cuenta, y la estructura general (el marco de la aplicación). Prefijo de ids: `acceso-`.
//
// Casi todo aquí se ve con la API SIMULADA (rutas interceptadas del navegador): el inicio de sesión con 401, 429 o error de red, «Salir», la sesión vencida y el cambio de contraseña
// NO tocan la base ni revocan la sesión guardada del rol, así que ninguna escena de este archivo cambia lo que ven las de las demás áreas.

import type { Route } from "@playwright/test";
import { conError, conModuloApagado, conVacio, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena, type RolEscena } from "./escenas.ts";

const GRUPO = "Acceso y cuenta";
const ACCESO = "web/src/pantallas/acceso/Acceso.tsx";
const ERRORES = "web/src/pantallas/acceso/Errores.tsx";
const MAS = "web/src/pantallas/acceso/Mas.tsx";
const SHELL = "web/src/ui/Shell.tsx";
const AVISOS = "web/src/ui/avisos.tsx";
const BASICOS = "web/src/ui/basicos.tsx";
const DIALOGO = "web/src/ui/Dialogo.tsx";

const RUTAS_ADMIN = "/admin /admin/verticales /admin/sucursales /admin/programas /admin/grupos /admin/instructores /admin/precios /admin/promociones /admin/canales /admin/campanas /admin/configuracion /admin/plantillas /admin/automatizaciones /admin/usuarios /admin/modulos /admin/textos /admin/etapas /admin/catalogo /admin/motivos /admin/bandeja";

// ─── Ayudas propias ──────────────────────────────────────────────────────────────────────────

const CORREO = "persona@escuela.test";
const CONTRASENA_VIEJA = "contrasena-actual-1";
const CONTRASENA_NUEVA = "una-contrasena-nueva-1";

type Manejador = (r: Route) => Promise<void> | void;

/** Responde de mentira a `POST /api/sesion` (el inicio de sesión): no cuenta intentos fallidos ni toca la sesión de nadie. */
async function simularInicioDeSesion(c: Contexto, manejador: Manejador): Promise<void> {
  await c.page.route(
    (u) => u.pathname === "/api/sesion",
    (r) => (r.request().method() === "POST" ? manejador(r) : r.fallback()),
  );
}

function errorJson(estado: number, mensaje: string, cabeceras: Record<string, string> = {}): Manejador {
  return (r) => r.fulfill({ status: estado, contentType: "application/json", headers: cabeceras, body: JSON.stringify({ error: { codigo: "error", mensaje, detalles: [] } }) });
}

async function llenarYEntrar(c: Contexto): Promise<void> {
  await c.page.goto("/");
  await c.page.getByLabel("Correo").fill(CORREO);
  await c.page.getByLabel(/^Contraseña/).fill(CONTRASENA_VIEJA);
  await c.page.getByRole("button", { name: "Entrar" }).click();
}

async function accesoConError(c: Contexto, manejador: Manejador): Promise<void> {
  await simularInicioDeSesion(c, manejador);
  await llenarYEntrar(c);
  await c.page.getByRole("alert").waitFor();
  await esperarListo(c.page);
}

/** Todos los módulos apagados en `/api/yo` (la captación también): la barra queda sin secciones. */
async function sinNingunModulo(c: Contexto, ruta: string): Promise<void> {
  await c.page.route(
    (u) => u.pathname === "/api/yo",
    async (r) => {
      const resp = await r.fetch();
      const yo = (await resp.json()) as { modulos: Record<string, boolean> };
      for (const k of Object.keys(yo.modulos)) yo.modulos[k] = false;
      return r.fulfill({ response: resp, body: JSON.stringify(yo) });
    },
  );
  await irA(c, ruta);
}

async function abrirCambiarContrasena(c: Contexto): Promise<void> {
  await irA(c, "/mas");
  await c.page.getByRole("button", { name: "Cambiar mi contraseña" }).click();
  await c.page.locator("dialog[open]").waitFor();
  await esperarListo(c.page);
}

async function llenarContrasenas(c: Contexto, actual: string, nueva: string, repetida: string): Promise<void> {
  await c.page.getByLabel("Contraseña actual").fill(actual);
  await c.page.getByLabel(/^Contraseña nueva/).fill(nueva);
  await c.page.getByLabel("Repite la contraseña nueva").fill(repetida);
}

async function enviarCambioDeContrasena(c: Contexto): Promise<void> {
  await c.page.getByRole("button", { name: "Cambiar contraseña", exact: true }).click();
}

const ROLES_CON_SESION: { rol: Exclude<RolEscena, "anonimo">; etiqueta: string; inicio: string }[] = [
  { rol: "administrador", etiqueta: "administrador", inicio: "/embudo" },
  { rol: "asesor", etiqueta: "asesor", inicio: "/embudo" },
  { rol: "maestro", etiqueta: "maestro", inicio: "/hoy" },
  { rol: "recepcion", etiqueta: "recepción", inicio: "/pagos" },
];

// ─── Escenas ─────────────────────────────────────────────────────────────────────────────────

export const ESCENAS: Escena[] = [
  // Inicio de sesión
  {
    id: "acceso-inicio-de-sesion",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Inicio de sesión",
    tipo: "pantalla",
    ruta: "/",
    fuentes: [ACCESO],
    ir: (c) => irA(c, "/"),
  },
  {
    id: "acceso-inicio-de-sesion-con-datos",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Inicio de sesión con el correo y la contraseña escritos (el botón «Entrar» habilitado)",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: async (c) => {
      await irA(c, "/");
      await c.page.getByLabel("Correo").fill(CORREO);
      await c.page.getByLabel(/^Contraseña/).fill(CONTRASENA_VIEJA);
      await c.page.getByLabel("Escuela (opcional)").fill("mi-escuela");
    },
  },
  {
    id: "acceso-inicio-de-sesion-entrando",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Inicio de sesión con el botón «Entrar» ocupado (esperando al servidor)",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: async (c) => {
      await simularInicioDeSesion(c, () => new Promise<void>(() => undefined));
      await llenarYEntrar(c);
      await c.page.locator("button[aria-busy='true'], button .giro").first().waitFor({ timeout: 3000 }).catch(() => undefined);
      await c.page.waitForTimeout(200);
    },
  },
  {
    id: "acceso-inicio-de-sesion-error-401",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Inicio de sesión con error 401: «Correo o contraseña incorrectos.»",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: (c) => accesoConError(c, errorJson(401, "Correo o contraseña incorrectos.")),
  },
  {
    id: "acceso-inicio-de-sesion-error-429-minutos",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Inicio de sesión bloqueado por demasiados intentos (429): «Espera 10 minutos»",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: (c) => accesoConError(c, errorJson(429, "Demasiados intentos. Espera un momento.", { "Retry-After": "600" })),
  },
  {
    id: "acceso-inicio-de-sesion-error-429-segundos",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Inicio de sesión bloqueado por demasiados intentos (429): «Espera 45 segundos»",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: (c) => accesoConError(c, errorJson(429, "Demasiados intentos. Espera un momento.", { "Retry-After": "45" })),
  },
  {
    id: "acceso-inicio-de-sesion-error-servidor",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Inicio de sesión con error del servidor (500)",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: (c) => accesoConError(c, errorJson(500, "Algo salió mal en el servidor. Inténtalo de nuevo.")),
  },
  {
    id: "acceso-inicio-de-sesion-error-de-red",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Inicio de sesión sin conexión con el servidor («No hay conexión…»)",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: (c) => accesoConError(c, (r) => r.abort("connectionfailed")),
  },
  {
    id: "acceso-inicio-de-sesion-sesion-expirada",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Inicio de sesión con el aviso «Tu sesión terminó» (la sesión venció con la pantalla abierta)",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: async (c) => {
      await irA(c, "/tareas");
      // La sesión ya no vale en el servidor: al volver a la pestaña la aplicación lo confirma y regresa al acceso.
      await c.page.route(
        (u) => u.pathname === "/api/yo",
        (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { codigo: "no_autenticado", mensaje: "Tu sesión terminó. Inicia sesión de nuevo." } }) }),
      );
      await c.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await c.page.getByRole("heading", { name: "Iniciar sesión" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "acceso-inicio-de-sesion-cerro-sesion",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Inicio de sesión con el aviso «Cerraste tu sesión.» (después de pulsar «Salir»)",
    tipo: "estado",
    fuentes: [ACCESO],
    ir: async (c) => {
      await irA(c, "/tareas");
      // «Salir» de mentira: el DELETE real revocaría la sesión guardada del asesor y rompería las demás escenas.
      await c.page.route(
        (u) => u.pathname === "/api/sesion",
        (r) => (r.request().method() === "DELETE" ? r.fulfill({ status: 204, body: "" }) : r.fallback()),
      );
      await c.page.getByRole("button", { name: "Salir" }).click();
      await c.page.getByRole("heading", { name: "Iniciar sesión" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "acceso-abriendo-la-aplicacion",
    rol: "anonimo",
    grupo: GRUPO,
    titulo: "Pantalla inicial «Abriendo la aplicación…» (la sesión todavía se está comprobando)",
    tipo: "estado",
    fuentes: ["web/src/app.tsx", "web/src/sesion/SesionContext.tsx", BASICOS],
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname === "/api/yo",
        () => new Promise<void>(() => undefined),
      );
      await c.page.goto("/");
      await c.page.getByText("Abriendo la aplicación…").waitFor();
      await c.page.waitForTimeout(150);
    },
  },

  // Errores genéricos: sin acceso (por rol), módulo apagado (por módulo), no encontrada (por rol), error de carga
  {
    id: "acceso-sin-acceso-maestro",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "«Sin acceso» del maestro (ejemplo: /embudo; igual en las demás rutas que no son suyas)",
    tipo: "estado",
    ruta: `/embudo /tareas /leads/:id /leads/:id/convertir /pagos /cuenta /cuenta/:tutorId /uniformes /ventas /corte /familias /familias/un-solo-hijo /familias/:tutorId /tableros ${RUTAS_ADMIN}`,
    fuentes: [ERRORES],
    ir: (c) => irA(c, "/embudo"),
  },
  {
    id: "acceso-sin-acceso-asesor",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "«Sin acceso» del asesor (ejemplo: /pagos; igual en /pase /uniformes /ventas /corte /alumnos/:id/salud y la administración)",
    tipo: "estado",
    ruta: `/pase /pagos /uniformes /ventas /corte /alumnos/:id/salud ${RUTAS_ADMIN}`,
    fuentes: [ERRORES],
    ir: (c) => irA(c, "/pagos"),
  },
  {
    id: "acceso-sin-acceso-recepcion",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "«Sin acceso» de recepción (ejemplo: /embudo; igual en /hoy /clases/:id/registro /tareas /leads/:id /tableros /alumnos/:id/salud y la administración)",
    tipo: "estado",
    ruta: `/hoy /clases/:id/registro /embudo /tareas /leads/:id /leads/:id/convertir /alumnos/:id/salud /tableros ${RUTAS_ADMIN}`,
    fuentes: [ERRORES],
    ir: (c) => irA(c, "/embudo"),
  },
  {
    id: "acceso-modulo-apagado-captacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«No disponible» con el módulo de captación apagado (administrador: dice dónde activarlo)",
    tipo: "estado",
    ruta: `/embudo /tareas /leads/:id ${RUTAS_ADMIN}`,
    fuentes: [ERRORES],
    ir: (c) => conModuloApagado(c, "/embudo", "captacion"),
  },
  {
    id: "acceso-modulo-apagado-clase-muestra",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«No disponible» con el módulo de clase muestra apagado",
    tipo: "estado",
    ruta: "/hoy /clases/:id/registro",
    fuentes: [ERRORES],
    ir: (c) => conModuloApagado(c, "/hoy", "clase_muestra"),
  },
  {
    id: "acceso-modulo-apagado-operacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«No disponible» con el módulo de operación apagado (pase de lista)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: [ERRORES],
    ir: (c) => conModuloApagado(c, "/pase", "operacion"),
  },
  {
    id: "acceso-modulo-apagado-inscripcion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«No disponible» con el módulo de inscripción apagado (alumnos, familias, conversión)",
    tipo: "estado",
    ruta: "/leads/:id/convertir /alumnos /alumnos/:id /alumnos/:id/salud /familias /familias/un-solo-hijo /familias/:tutorId",
    fuentes: [ERRORES],
    ir: (c) => conModuloApagado(c, "/alumnos", "inscripcion"),
  },
  {
    id: "acceso-modulo-apagado-finanzas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«No disponible» con el módulo de finanzas apagado (pagos, estado de cuenta, uniformes, ventas, cierre)",
    tipo: "estado",
    ruta: "/pagos /cuenta /cuenta/:tutorId /uniformes /ventas /corte",
    fuentes: [ERRORES],
    ir: (c) => conModuloApagado(c, "/pagos", "finanzas"),
  },
  {
    id: "acceso-modulo-apagado-tableros",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "«No disponible» con el módulo de tableros apagado",
    tipo: "estado",
    ruta: "/tableros",
    fuentes: [ERRORES],
    ir: (c) => conModuloApagado(c, "/tableros", "tableros"),
  },
  {
    id: "acceso-modulo-apagado-no-administrador",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "«No disponible» para quien no administra (maestro, pase de lista): pide que se lo active la persona que administra",
    tipo: "estado",
    ruta: "/pase",
    fuentes: [ERRORES],
    ir: (c) => conModuloApagado(c, "/pase", "operacion"),
  },
  ...ROLES_CON_SESION.map(
    ({ rol, etiqueta }): Escena => ({
      id: `acceso-no-encontrada-${rol}`,
      rol,
      grupo: GRUPO,
      titulo: `«Página no encontrada» (dirección que no existe) del ${etiqueta}`,
      tipo: "estado",
      ruta: "*",
      fuentes: [ERRORES],
      ir: (c) => irA(c, "/esto/no/existe"),
    }),
  ),
  {
    id: "acceso-error-de-carga-500",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Error de carga genérico (500) con el botón «Reintentar» (ejemplo: Tareas)",
    tipo: "estado",
    fuentes: [BASICOS],
    ir: (c) => conError(c, "/tareas", 500),
  },
  {
    id: "acceso-error-de-carga-404",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Error de carga «No se encontró lo que buscas» (404) con el botón «Ir a mi inicio» (ejemplo: Tareas)",
    tipo: "estado",
    fuentes: [BASICOS],
    ir: (c) => conError(c, "/tareas", 404),
  },

  // Más / mi cuenta
  ...ROLES_CON_SESION.map(
    ({ rol, etiqueta }): Escena => ({
      id: `acceso-mas-${rol}`,
      rol,
      grupo: GRUPO,
      titulo: `«Más» / mi cuenta del ${etiqueta}: sus secciones y su sesión`,
      tipo: "pantalla",
      ruta: "/mas",
      fuentes: [MAS],
      ir: (c) => irA(c, "/mas"),
    }),
  ),
  {
    id: "acceso-mas-sin-secciones",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "«Más» sin ninguna sección activa (la escuela apagó todo): «Todavía no tienes secciones activas»",
    tipo: "estado",
    ruta: "/mas",
    fuentes: [MAS, SHELL],
    ir: (c) => sinNingunModulo(c, "/mas"),
  },
  {
    id: "acceso-cambiar-contrasena-vacio",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Diálogo «Cambiar mi contraseña» vacío",
    tipo: "flotante",
    ruta: "/mas",
    fuentes: [MAS, DIALOGO],
    ir: abrirCambiarContrasena,
  },
  {
    id: "acceso-cambiar-contrasena-validacion",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Diálogo «Cambiar mi contraseña» con errores de validación (nueva corta, repetición distinta)",
    tipo: "flotante",
    ruta: "/mas",
    fuentes: [MAS, DIALOGO],
    ir: async (c) => {
      await abrirCambiarContrasena(c);
      await llenarContrasenas(c, CONTRASENA_VIEJA, "corta", "otra");
      await enviarCambioDeContrasena(c);
      await c.page.getByText("Debe tener al menos 10 caracteres").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "acceso-cambiar-contrasena-vacia-enviada",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Diálogo «Cambiar mi contraseña» enviado vacío («Escribe tu contraseña actual»)",
    tipo: "flotante",
    ruta: "/mas",
    fuentes: [MAS, DIALOGO],
    ir: async (c) => {
      await abrirCambiarContrasena(c);
      await enviarCambioDeContrasena(c);
      await c.page.getByText("Escribe tu contraseña actual").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "acceso-cambiar-contrasena-error-servidor",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Diálogo «Cambiar mi contraseña» con el error del servidor («La contraseña actual no es correcta»)",
    tipo: "flotante",
    ruta: "/mas",
    fuentes: [MAS, DIALOGO, BASICOS],
    ir: async (c) => {
      await abrirCambiarContrasena(c);
      await fallarLaSiguienteEscritura(c, 400, "La contraseña actual no es correcta.", [{ campo: "actual", mensaje: "La contraseña actual no es correcta." }]);
      await llenarContrasenas(c, CONTRASENA_VIEJA, CONTRASENA_NUEVA, CONTRASENA_NUEVA);
      await enviarCambioDeContrasena(c);
      await c.page.getByText("La contraseña actual no es correcta.").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "acceso-cambiar-contrasena-demasiados-intentos",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Diálogo «Cambiar mi contraseña» bloqueado por demasiados intentos (429, «Intenta de nuevo en 600 s»)",
    tipo: "flotante",
    ruta: "/mas",
    fuentes: [MAS, DIALOGO, BASICOS],
    ir: async (c) => {
      await abrirCambiarContrasena(c);
      await c.page.route(
        (u) => u.pathname === "/api/yo/contrasena",
        (r) => errorJson(429, "Demasiados intentos.", { "Retry-After": "600" })(r),
      );
      await llenarContrasenas(c, CONTRASENA_VIEJA, CONTRASENA_NUEVA, CONTRASENA_NUEVA);
      await enviarCambioDeContrasena(c);
      await c.page.getByText("Demasiados intentos.").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "acceso-cambiar-contrasena-sin-conexion",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Diálogo «Cambiar mi contraseña» sin conexión («No hay conexión con el servidor…»)",
    tipo: "flotante",
    ruta: "/mas",
    fuentes: [MAS, DIALOGO, BASICOS],
    ir: async (c) => {
      await abrirCambiarContrasena(c);
      await llenarContrasenas(c, CONTRASENA_VIEJA, CONTRASENA_NUEVA, CONTRASENA_NUEVA);
      await cortarLaRed(c);
      await enviarCambioDeContrasena(c);
      await c.page.getByText("No hay conexión con el servidor").first().waitFor();
      await c.page.context().setOffline(false);
      await esperarListo(c.page);
    },
  },

  // El marco: barra lateral y cabecera (escritorio), barra inferior (celular)
  {
    id: "acceso-marco-administrador",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Marco del administrador: muchas secciones (barra lateral larga; en celular, barra inferior de cuatro secciones y «Más»), contenido corto",
    tipo: "global",
    ruta: "/tareas",
    fuentes: [SHELL],
    ir: (c) => conVacio(c, "/tareas"),
  },
  {
    id: "acceso-marco-asesor",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Marco del asesor: una sola sucursal (su nombre en la cabecera, sin selector), contenido corto",
    tipo: "global",
    fuentes: [SHELL],
    ir: (c) => conVacio(c, "/tareas"),
  },
  {
    id: "acceso-marco-maestro",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Marco del maestro: pocas secciones, contenido corto",
    tipo: "global",
    fuentes: [SHELL],
    ir: (c) => conVacio(c, "/hoy"),
  },
  {
    id: "acceso-marco-recepcion",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Marco de recepción: varias sucursales (selector «Todas mis sucursales» en la cabecera)",
    tipo: "global",
    fuentes: [SHELL],
    ir: (c) => irA(c, "/pagos"),
  },
  {
    id: "acceso-marco-sucursal-elegida",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Marco de recepción con una sucursal elegida en el selector de la cabecera",
    tipo: "global",
    fuentes: [SHELL],
    ir: async (c) => {
      await irA(c, "/pagos");
      await c.page.getByLabel("Sucursal").selectOption({ label: c.mundo.sucursales.sur.nombre });
      await esperarListo(c.page);
    },
  },
  {
    id: "acceso-marco-saltar-al-contenido",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Marco con el enlace «Saltar al contenido» enfocado (primer Tab)",
    tipo: "global",
    fuentes: [SHELL],
    ir: async (c) => {
      await conVacio(c, "/tareas");
      await c.page.keyboard.press("Tab");
      await c.page.getByRole("link", { name: "Saltar al contenido" }).waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "acceso-marco-con-teclado",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Marco en celular con el teclado abierto (clase `con-teclado`: la barra inferior se esconde; el achicamiento del teclado se simula en `visualViewport`)",
    tipo: "global",
    vistas: ["celular"],
    fuentes: [SHELL],
    ir: async (c) => {
      await irA(c, "/pagos");
      // Ningún navegador de pruebas abre un teclado de verdad: la pantalla visible se «achica» 340 px, que es lo que la aplicación mide para decir que hay teclado.
      await c.page.evaluate(() => {
        const visor = window.visualViewport;
        if (visor) Object.defineProperty(visor, "height", { configurable: true, get: () => window.innerHeight - 340 });
      });
      await c.page.getByRole("textbox").first().focus();
      await c.page.evaluate(() => window.visualViewport?.dispatchEvent(new Event("resize")));
      await c.page.waitForFunction(() => document.documentElement.classList.contains("con-teclado"), undefined, { timeout: 3000 }).catch(() => undefined);
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "acceso-marco-impresion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Marco al imprimir: solo el contenido y el marcador «escuela · impreso el … por …» (sin barras ni cabecera)",
    tipo: "impresion",
    fuentes: [SHELL],
    impresion: true,
    ir: (c) => conVacio(c, "/tareas"),
  },

  // El aviso global «ya quedó» (se deja al final: es la única que escribe, y escribe de mentira)
  {
    id: "acceso-aviso-ya-quedo",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Aviso global «ya quedó» sobre la pantalla (al cambiar la contraseña; la API se simula, la contraseña no cambia)",
    tipo: "flotante",
    ruta: "/mas",
    fuentes: [AVISOS, MAS],
    completa: false,
    ir: async (c) => {
      await abrirCambiarContrasena(c);
      await c.page.route(
        (u) => u.pathname === "/api/yo/contrasena",
        (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
      );
      await llenarContrasenas(c, CONTRASENA_VIEJA, CONTRASENA_NUEVA, CONTRASENA_NUEVA);
      await enviarCambioDeContrasena(c);
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
];
