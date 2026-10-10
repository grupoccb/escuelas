// Administración, sistema y mensajería: módulos, usuarios, configuración, textos del asistente, etapas del embudo, motivos, canales, campañas, plantillas, automatizaciones y la bandeja
// del administrador. Prefijo de ids: `admins-`. Rol: administrador.
//
// Las escenas que escribirían en la base (guardar, apagar, dar de baja, restablecer) se ven con la API SIMULADA para esa escritura (la respuesta se fabrica en el navegador) o con un
// valor igual al actual; las pocas que escriben de verdad lo hacen con valores iguales a los de ahora, y van AL FINAL del archivo. Los usuarios que se tocan son `mundo.usuarios.bloqueable`.

import type { Route } from "@playwright/test";
import { conCargando, conError, conMuchosDatos, conVacio, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena } from "./escenas.ts";

const GRUPO = "Administración: sistema y mensajería";
const D = "web/src/pantallas/admin/";
const DIALOGO = "web/src/ui/Dialogo.tsx";
const COMUNES = `${D}comunes.tsx`;
const AVISOS = "web/src/ui/avisos.tsx";

const MODULOS = `${D}Modulos.tsx`;
const USUARIOS = `${D}Usuarios.tsx`;
const CONFIGURACION = `${D}Configuracion.tsx`;
const TEXTOS = `${D}TextosDelAsistente.tsx`;
const ETAPAS = `${D}EtapasDelEmbudo.tsx`;
const MOTIVOS = `${D}Motivos.tsx`;
const CANALES = `${D}Canales.tsx`;
const CAMPANAS = `${D}Campanas.tsx`;
const PLANTILLAS = `${D}Plantillas.tsx`;
const AUTOMATIZACIONES = `${D}Automatizaciones.tsx`;
const BANDEJA = `${D}Bandeja.tsx`;

// ─── Ayudas propias ──────────────────────────────────────────────────────────────────────────

 
type Json = any;

/** El diálogo abierto (hay uno a la vez). */
const dlg = (c: Contexto) => c.page.locator("dialog[open]");

async function dialogoListo(c: Contexto): Promise<void> {
  await dlg(c).waitFor();
  await esperarListo(c.page);
}

/** Pulsa un botón del diálogo abierto. */
async function pulsar(c: Contexto, nombre: string): Promise<void> {
  await dlg(c).getByRole("button", { name: nombre, exact: true }).click();
}

/** Reescribe lo que la API responde a un GET de esa ruta (la base no se toca). */
async function reescribirGet(c: Contexto, ruta: string, cambiar: (cuerpo: Json) => Json): Promise<void> {
  await c.page.route(
    (u) => u.pathname === ruta,
    async (r: Route) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      const cuerpo = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify(cambiar(cuerpo)) });
    },
  );
}

/** Responde de mentira a las escrituras (POST/PUT/PATCH/DELETE) que coincidan: la base no se toca y la pantalla cree que quedó guardado. */
async function simularEscritura(c: Contexto, patron: RegExp, cuerpo: unknown = {}): Promise<void> {
  await c.page.route(
    (u) => patron.test(u.pathname),
    (r: Route) => (r.request().method() === "GET" ? r.fallback() : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cuerpo) })),
  );
}

/** `/api/yo` con esos módulos apagados (la captación siempre queda): se ven los avisos «el módulo está apagado» de las pantallas, sin cambiar nada en el servidor. */
async function conModulosApagados(c: Contexto, ruta: string, apagados: string[]): Promise<void> {
  await reescribirGet(c, "/api/yo", (yo: Json) => {
    for (const m of apagados) yo.modulos[m] = false;
    return yo;
  });
  await irA(c, ruta);
}

/** La lista de módulos de `/api/modulos` con exactamente esos encendidos (la captación siempre). */
function listaDeModulos(encendidos: string[]): (cuerpo: Json) => Json {
  return (cuerpo) => ({ ...cuerpo, modulos: cuerpo.modulos.map((m: Json) => ({ ...m, encendido: m.obligatorio || encendidos.includes(m.id) })) });
}

/** Vuelve al principio de la página (la captura de página entera sale mejor sin la cabecera «pegada» a mitad de pantalla). */
async function alInicio(c: Contexto): Promise<void> {
  await c.page.evaluate(() => window.scrollTo(0, 0));
  await esperarListo(c.page);
}

/** Que lo que se vea en pantalla sea lo que falló: baja el diálogo hasta el primer mensaje de error. */
async function verElError(c: Contexto, texto?: string | RegExp): Promise<void> {
  const error = texto ? dlg(c).getByText(texto).first() : dlg(c).locator("[role='alert'], .campo-error").first();
  await error.waitFor();
  await error.scrollIntoViewIfNeeded();
  await esperarListo(c.page);
}

/** Las cinco escenas de estado de una lista: con datos, con muchos, vacía, cargando y con error de carga. */
function estados(o: { pref: string; pantalla: string; ruta: string; real: string; fuentes: string[]; muchos?: boolean; vacio?: boolean; datos?: string }): Escena[] {
  const base = { rol: "administrador" as const, grupo: GRUPO, ruta: o.ruta, fuentes: o.fuentes };
  const e: Escena[] = [
    { ...base, id: `admins-${o.pref}-con-datos`, titulo: o.datos ?? `${o.pantalla} con datos`, tipo: "pantalla", ir: (c) => irA(c, o.real) },
  ];
  if (o.muchos !== false) e.push({ ...base, id: `admins-${o.pref}-muchos`, titulo: `${o.pantalla} con muchos datos (la lista repetida doce veces)`, tipo: "estado", ir: (c) => conMuchosDatos(c, o.real) });
  if (o.vacio !== false) e.push({ ...base, id: `admins-${o.pref}-vacio`, titulo: `${o.pantalla} vacía`, tipo: "estado", ir: (c) => conVacio(c, o.real) });
  e.push({ ...base, id: `admins-${o.pref}-cargando`, titulo: `${o.pantalla} cargando`, tipo: "estado", ir: (c) => conCargando(c, o.real) });
  e.push({ ...base, id: `admins-${o.pref}-error`, titulo: `${o.pantalla} con error de carga (500, «Reintentar»)`, tipo: "estado", ir: (c) => conError(c, o.real) });
  return e;
}

/** Atajo para una escena de un diálogo o de lo flotante. */
function flotante(id: string, titulo: string, ruta: string, fuentes: string[], ir: (c: Contexto) => Promise<void>, extra: Partial<Escena> = {}): Escena {
  return { id: `admins-${id}`, rol: "administrador", grupo: GRUPO, titulo, tipo: "flotante", ruta, fuentes, ir, ...extra };
}

// ─── Módulos ─────────────────────────────────────────────────────────────────────────────────

const RUTA_MODULOS = "/admin/modulos";

/** Abre `/admin/modulos` con la lista fabricada: solo esos módulos encendidos. */
async function modulosCon(c: Contexto, encendidos: string[]): Promise<void> {
  await reescribirGet(c, "/api/modulos", listaDeModulos(encendidos));
  await irA(c, RUTA_MODULOS);
}

const TODOS = ["cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas", "tableros"];

// ─── Usuarios ────────────────────────────────────────────────────────────────────────────────

const RUTA_USUARIOS = "/admin/usuarios";
const tarjetaDe = (c: Contexto, correo: string) => c.page.getByTestId(`usuario-${correo}`);
const bloqueable = (c: Contexto) => tarjetaDe(c, c.mundo.usuarios.bloqueable.correo);

async function abrirNuevoUsuario(c: Contexto): Promise<void> {
  await irA(c, RUTA_USUARIOS);
  await c.page.getByRole("button", { name: "Nuevo usuario" }).click();
  await dialogoListo(c);
}

async function llenarNuevoUsuario(c: Contexto): Promise<void> {
  await dlg(c).getByLabel("Correo").fill("nueva.persona@escuela.test");
  await dlg(c).getByRole("textbox", { name: /^Nombre/ }).fill("Nueva Persona");
  await dlg(c).getByLabel("Contraseña inicial").fill("una-contrasena-larga-1");
}

async function abrirEnTarjeta(c: Contexto, boton: string, correo = c.mundo.usuarios.bloqueable.correo): Promise<void> {
  await irA(c, RUTA_USUARIOS);
  await tarjetaDe(c, correo).getByRole("button", { name: boton, exact: true }).click();
  await dialogoListo(c);
}

// ─── Configuración ───────────────────────────────────────────────────────────────────────────

const RUTA_CONFIGURACION = "/admin/configuracion";

// ─── Textos del asistente ────────────────────────────────────────────────────────────────────

const RUTA_TEXTOS = "/admin/textos";

/** Abre «Cambiar» del texto que cumple `buscar` (o el primero). */
async function abrirTexto(c: Contexto, buscar: (t: Json) => boolean = () => true, transformar?: (cuerpo: Json) => Json): Promise<void> {
  if (transformar) await reescribirGet(c, "/api/textos-bot", transformar);
  await irA(c, RUTA_TEXTOS);
  const lista = (await (await c.page.request.get("/api/textos-bot")).json()) as Json;
  const texto = (transformar ? transformar(lista) : lista).datos.find(buscar) ?? lista.datos[0];
  await c.page.getByTestId(`texto-${texto.clave}`).getByRole("button", { name: "Cambiar", exact: true }).click();
  await dialogoListo(c);
}

// ─── Etapas del embudo ───────────────────────────────────────────────────────────────────────

const RUTA_ETAPAS = "/admin/etapas";

/** La lista de etapas con una propia («Tuya») antes de las de cierre: se puede subir, bajar y quitar sin tocar las del sistema. */
function conEtapaPropia(cuerpo: Json): Json {
  const datos: Json[] = [...cuerpo.datos];
  const primeraDeCierre = datos.findIndex((e) => e.es_ganado || e.es_perdido || e.tipo_sistema === "inscrito" || e.tipo_sistema === "perdido");
  const propia = { id: "etapa-propia-de-diseno", nombre: "Visita a la sucursal", orden: 0, tipo_sistema: null, es_ganado: false, es_perdido: false, dias_alerta_sin_movimiento: 5 };
  datos.splice(primeraDeCierre === -1 ? datos.length : primeraDeCierre, 0, propia);
  return { ...cuerpo, datos: datos.map((e, i) => ({ ...e, orden: i })) };
}

async function abrirEtapa(c: Contexto, boton: string, cual: "primera" | "ultima" | "propia"): Promise<void> {
  if (cual === "propia") await reescribirGet(c, "/api/etapas", conEtapaPropia);
  await irA(c, RUTA_ETAPAS);
  const tarjetas = c.page.getByTestId("lista-de-etapas").locator("li");
  const tarjeta = cual === "primera" ? tarjetas.first() : cual === "ultima" ? tarjetas.last() : c.page.getByTestId("etapa-etapa-propia-de-diseno");
  await tarjeta.getByRole("button", { name: boton, exact: true }).click();
  await dialogoListo(c);
}

// ─── Motivos ─────────────────────────────────────────────────────────────────────────────────

const RUTA_MOTIVOS = "/admin/motivos";
const listaDeMotivos = (c: Contexto, cual: "perdida" | "baja") => c.page.getByTestId(cual === "perdida" ? "motivos-de-perdida" : "motivos-de-baja");

async function abrirMotivo(c: Contexto, cual: "perdida" | "baja", boton: string): Promise<void> {
  await irA(c, RUTA_MOTIVOS);
  const lista = listaDeMotivos(c, cual);
  if (boton === "Agregar un motivo") await c.page.getByRole("button", { name: "Agregar un motivo", exact: true }).nth(cual === "perdida" ? 0 : 1).click();
  else await lista.locator("li").first().getByRole("button", { name: boton, exact: true }).click();
  await dialogoListo(c);
}

// ─── Canales ─────────────────────────────────────────────────────────────────────────────────

const RUTA_CANALES = "/admin/canales";
const BANDEJA_DE_DISENO = { id: "bandeja-de-diseno", nombre: "Bandeja del canal", chatwoot_account_id: 1, chatwoot_inbox_id: 2 };

/** Todos los canales con bandeja (o todos sin ella), para ver las dos tarjetas sin depender de lo sembrado. */
async function canalesCon(c: Contexto, conBandeja: boolean): Promise<void> {
  await reescribirGet(c, "/api/canales-whatsapp", (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((x: Json) => ({ ...x, bandeja: conBandeja ? BANDEJA_DE_DISENO : null })) }));
}

async function abrirCanal(c: Contexto, boton: string | RegExp, conBandeja?: boolean): Promise<void> {
  if (conBandeja !== undefined) await canalesCon(c, conBandeja);
  await irA(c, RUTA_CANALES);
  await c.page.getByTestId("lista-de-canales").locator("li").first().getByRole("button", { name: boton }).click();
  await dialogoListo(c);
}

// ─── Campañas ────────────────────────────────────────────────────────────────────────────────

const RUTA_CAMPANAS = "/admin/campanas";

async function abrirCampana(c: Contexto, boton: string): Promise<void> {
  await irA(c, RUTA_CAMPANAS);
  await c.page.getByTestId("lista-de-campanas").locator("li").first().getByRole("button", { name: boton, exact: true }).click();
  await dialogoListo(c);
}

async function esperarElQr(c: Contexto): Promise<void> {
  const img = c.page.getByTestId("vista-del-qr").locator("img");
  await img.waitFor();
  await img.evaluate((el) => (el as HTMLImageElement).decode().catch(() => undefined));
  await c.page.getByTestId("direccion-del-qr").waitFor({ timeout: 8000 }).catch(() => undefined);
  await esperarListo(c.page);
}

// ─── Plantillas ──────────────────────────────────────────────────────────────────────────────

const RUTA_PLANTILLAS = "/admin/plantillas";

async function abrirNuevaPlantilla(c: Contexto): Promise<void> {
  await irA(c, RUTA_PLANTILLAS);
  await c.page.getByRole("button", { name: "Nueva plantilla" }).click();
  await dialogoListo(c);
}

async function abrirPlantilla(c: Contexto, cual: "servicio" | "marketing", boton: string): Promise<void> {
  await irA(c, RUTA_PLANTILLAS);
  const codigo = cual === "servicio" ? c.mundo.mensajeria.plantillaServicio.codigo : c.mundo.mensajeria.plantillaMarketing.codigo;
  await c.page.getByTestId(`plantilla-${codigo}`).getByRole("button", { name: boton, exact: true }).click();
  await dialogoListo(c);
}

// ─── Automatizaciones ────────────────────────────────────────────────────────────────────────

const RUTA_AUTOMATIZACIONES = "/admin/automatizaciones";
const tarjetaDeAutomatizacion = (c: Contexto, cual: "recordatorio" | "pagoAtrasado") => c.page.getByTestId(`automatizacion-${c.mundo.mensajeria.automatizaciones[cual].id}`);

async function abrirAjuste(c: Contexto, cual: "recordatorio" | "pagoAtrasado"): Promise<void> {
  await irA(c, RUTA_AUTOMATIZACIONES);
  await tarjetaDeAutomatizacion(c, cual).getByRole("button", { name: "Ajustar", exact: true }).click();
  await dialogoListo(c);
}

// ─── Bandeja ─────────────────────────────────────────────────────────────────────────────────

const RUTA_BANDEJA = "/admin/bandeja";

/** Eventos de todo tipo: el sembrado, uno ya atendido, uno sin tarea y uno repetido (la bandeja con «Solo los pendientes» apagado). */
function eventosVariados(cuerpo: Json): Json {
  const base = cuerpo.datos[0];
  const otro = (id: string, extra: Json) => ({ ...base, id, clave: id, creado_en: base?.creado_en, ...extra });
  return {
    ...cuerpo,
    datos: [
      ...cuerpo.datos,
      otro("evento-atendido-de-diseno", { origen: "chatwoot", causa: "dato_invalido", detalle: "chatwoot: conversation_id no es entero", tarea_id: "tarea-atendida", tarea: { estado: "hecha" } }),
      otro("evento-sin-tarea-de-diseno", { origen: "landing", causa: "texto_con_nul", detalle: "landing: nombre con byte nulo", tarea_id: null, tarea: null }),
      otro("evento-repetido-de-diseno", { origen: "twilio_estado", causa: "error_interno", detalle: "twilio_estado: tiempo de espera agotado", intentos: 7, tarea_id: "tarea-repetida", tarea: { estado: "pendiente" } }),
    ],
    paginacion: { ...cuerpo.paginacion, total: cuerpo.datos.length + 3 },
  };
}

// ─── Escenas ─────────────────────────────────────────────────────────────────────────────────

export const ESCENAS: Escena[] = [
  // Módulos
  ...estados({ pref: "modulos", pantalla: "Módulos", ruta: "/admin/modulos", real: RUTA_MODULOS, fuentes: [MODULOS], muchos: false, vacio: false, datos: "Módulos tal como están sembrados (cada uno con lo que cambia al moverlo)" }),
  {
    id: "admins-modulos-todos-encendidos",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Módulos con todos encendidos: cada interruptor dice «Si lo apagas…» y los que otros necesitan están bloqueados («primero apaga…»)",
    tipo: "estado",
    ruta: "/admin/modulos",
    fuentes: [MODULOS],
    ir: (c) => modulosCon(c, TODOS),
  },
  {
    id: "admins-modulos-algunos-apagados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Módulos con varios apagados (Operación, Finanzas y Tableros): «Si lo enciendes…» y el bloqueo «primero enciende…»",
    tipo: "estado",
    ruta: "/admin/modulos",
    fuentes: [MODULOS],
    ir: (c) => modulosCon(c, ["cotizador", "clase_muestra", "inscripcion"]),
  },
  {
    id: "admins-modulos-solo-captacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Módulos con solo la captación encendida (todos los demás apagados)",
    tipo: "estado",
    ruta: "/admin/modulos",
    fuentes: [MODULOS],
    ir: (c) => modulosCon(c, []),
  },
  flotante("modulos-apagar-confirmar", "Confirmación «Apagar Tableros» (qué cambia y que surte efecto enseguida)", "/admin/modulos", [MODULOS, COMUNES, DIALOGO], async (c) => {
    await modulosCon(c, TODOS);
    await c.page.getByTestId("interruptor-tableros").click();
    await dialogoListo(c);
  }),
  flotante("modulos-apagar-error-servidor", "Confirmación «Apagar Tableros» con el error del servidor dentro (no se cierra)", "/admin/modulos", [MODULOS, COMUNES, DIALOGO], async (c) => {
    await modulosCon(c, TODOS);
    await c.page.getByTestId("interruptor-tableros").click();
    await dialogoListo(c);
    await fallarLaSiguienteEscritura(c, 409, "No se puede apagar Tableros: otro módulo lo necesita.");
    await pulsar(c, "Apagar Tableros");
    await verElError(c, "No se puede apagar Tableros");
  }),
  {
    id: "admins-modulos-encender-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Módulos: error del servidor al encender un módulo (el mensaje queda sobre la lista)",
    tipo: "estado",
    ruta: "/admin/modulos",
    fuentes: [MODULOS],
    ir: async (c) => {
      await modulosCon(c, ["cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas"]);
      await fallarLaSiguienteEscritura(c, 409, "No se puede encender Tableros todavía.");
      await c.page.getByTestId("interruptor-tableros").click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-modulos-encender-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Módulos: sin conexión al encender un módulo («No hay conexión con el servidor…»)",
    tipo: "estado",
    ruta: "/admin/modulos",
    fuentes: [MODULOS],
    ir: async (c) => {
      await modulosCon(c, ["cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas"]);
      await cortarLaRed(c);
      await c.page.getByTestId("interruptor-tableros").click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },

  // Usuarios
  ...estados({ pref: "usuarios", pantalla: "Usuarios y roles", ruta: "/admin/usuarios", real: RUTA_USUARIOS, fuentes: [USUARIOS] }),
  {
    id: "admins-usuarios-busqueda",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Usuarios y roles con una búsqueda que encuentra a una persona («asesor»)",
    tipo: "estado",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS],
    ir: async (c) => {
      await irA(c, RUTA_USUARIOS);
      await c.page.getByLabel("Buscar por nombre o correo").fill("bloqueable");
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-usuarios-busqueda-sin-resultados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Usuarios y roles con una búsqueda sin resultados («Nadie coincide con…»)",
    tipo: "estado",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS],
    ir: async (c) => {
      await irA(c, RUTA_USUARIOS);
      await c.page.getByLabel("Buscar por nombre o correo").fill("zzzzzz");
      await c.page.getByText("Nadie coincide con").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-usuarios-con-inactivo-y-agente",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Usuarios y roles con una persona inactiva («Activar») y un asesor ligado a su agente de Chatwoot",
    tipo: "estado",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS],
    ir: async (c) => {
      await reescribirGet(c, "/api/usuarios", (cuerpo) => ({
        ...cuerpo,
        datos: cuerpo.datos.map((u: Json) => (u.correo === c.mundo.usuarios.bloqueable.correo ? { ...u, activo: false } : u.correo === c.mundo.usuarios.asesor.correo ? { ...u, chatwoot_agent_id: 7 } : u)),
      }));
      await irA(c, RUTA_USUARIOS);
    },
  },
  {
    id: "admins-usuarios-activar-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Usuarios y roles: error del servidor al pulsar «Activar» (el mensaje queda sobre la lista)",
    tipo: "estado",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS],
    ir: async (c) => {
      await reescribirGet(c, "/api/usuarios", (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((u: Json) => (u.correo === c.mundo.usuarios.bloqueable.correo ? { ...u, activo: false } : u)) }));
      await irA(c, RUTA_USUARIOS);
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await bloqueable(c).getByRole("button", { name: "Activar", exact: true }).click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },
  flotante("usuarios-nuevo-vacio", "Diálogo «Nuevo usuario» vacío (asesor por omisión, con las sucursales que atiende)", "/admin/usuarios", [USUARIOS, DIALOGO], abrirNuevoUsuario),
  flotante("usuarios-nuevo-administrador", "Diálogo «Nuevo usuario» con el rol Administrador (sin sucursales)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirNuevoUsuario(c);
    await dlg(c).getByLabel("Rol").selectOption("administrador");
    await esperarListo(c.page);
  }),
  flotante("usuarios-nuevo-validacion", "Diálogo «Nuevo usuario» enviado vacío (nombre, correo y contraseña)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirNuevoUsuario(c);
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe el nombre");
  }),
  flotante("usuarios-nuevo-validacion-contrasena", "Diálogo «Nuevo usuario» con un correo mal escrito y una contraseña corta", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirNuevoUsuario(c);
    await dlg(c).getByLabel("Correo").fill("no-es-un-correo");
    await dlg(c).getByRole("textbox", { name: /^Nombre/ }).fill("Nueva Persona");
    await dlg(c).getByLabel("Contraseña inicial").fill("corta");
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe un correo válido");
  }),
  flotante("usuarios-nuevo-error-servidor", "Diálogo «Nuevo usuario» con el error del servidor («Ya existe un usuario con ese correo»)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirNuevoUsuario(c);
    await llenarNuevoUsuario(c);
    await fallarLaSiguienteEscritura(c, 409, "Ya existe un usuario con ese correo.", [{ campo: "correo", mensaje: "Ya existe un usuario con ese correo." }]);
    await pulsar(c, "Guardar");
    await verElError(c, "Ya existe un usuario con ese correo.");
  }),
  flotante("usuarios-nuevo-sin-conexion", "Diálogo «Nuevo usuario» sin conexión («No hay conexión con el servidor…»)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirNuevoUsuario(c);
    await llenarNuevoUsuario(c);
    await cortarLaRed(c);
    await pulsar(c, "Guardar");
    await verElError(c, /No hay conexión/);
  }),
  flotante("usuarios-editar", "Diálogo «Editar usuario» de otra persona (correo fijo, activo, restablecer contraseña opcional)", "/admin/usuarios", [USUARIOS, DIALOGO], (c) => abrirEnTarjeta(c, "Editar")),
  flotante("usuarios-editar-yo", "Diálogo «Editar usuario» de uno mismo («Tu propia contraseña no se cambia aquí»)", "/admin/usuarios", [USUARIOS, DIALOGO], (c) => abrirEnTarjeta(c, "Editar", c.mundo.usuarios.administrador.correo)),
  flotante("usuarios-editar-validacion", "Diálogo «Editar usuario» con el nombre borrado y una contraseña nueva corta", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirEnTarjeta(c, "Editar");
    await dlg(c).getByRole("textbox", { name: /^Nombre/ }).fill("");
    await dlg(c).getByLabel(/^Restablecer la contraseña/).fill("corta");
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe el nombre");
  }),
  flotante("usuarios-editar-error-servidor", "Diálogo «Editar usuario» con el error del servidor (no puede quedar sin administrador)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirEnTarjeta(c, "Editar", c.mundo.usuarios.administrador.correo);
    await fallarLaSiguienteEscritura(c, 409, "Siempre debe quedar al menos un administrador activo.");
    await dlg(c).getByLabel("Activo").uncheck();
    await pulsar(c, "Guardar");
    await verElError(c, "Siempre debe quedar al menos un administrador activo.");
  }),
  flotante("usuarios-restablecer-vacio", "Diálogo «Restablecer contraseña» vacío", "/admin/usuarios", [USUARIOS, DIALOGO], (c) => abrirEnTarjeta(c, "Restablecer contraseña")),
  flotante("usuarios-restablecer-validacion", "Diálogo «Restablecer contraseña» con una contraseña corta («Debe tener al menos 10 caracteres»)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirEnTarjeta(c, "Restablecer contraseña");
    await dlg(c).getByLabel("Contraseña nueva").fill("corta");
    await pulsar(c, "Restablecer contraseña");
    await verElError(c, "Debe tener al menos 10 caracteres");
  }),
  flotante("usuarios-restablecer-error-servidor", "Diálogo «Restablecer contraseña» con el error del servidor (contraseña que lleva el nombre)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirEnTarjeta(c, "Restablecer contraseña");
    await dlg(c).getByLabel("Contraseña nueva").fill("berta-bloqueable-1");
    await fallarLaSiguienteEscritura(c, 400, "La contraseña no puede llevar el correo ni el nombre.", [{ campo: "contrasena", mensaje: "La contraseña no puede llevar el correo ni el nombre." }]);
    await pulsar(c, "Restablecer contraseña");
    await verElError(c, "La contraseña no puede llevar el correo ni el nombre.");
  }),
  flotante("usuarios-chatwoot-vacio", "Diálogo «Agente de Chatwoot» de un asesor sin agente ligado", "/admin/usuarios", [USUARIOS, DIALOGO], (c) => abrirEnTarjeta(c, "Agente de Chatwoot")),
  flotante("usuarios-chatwoot-ligado", "Diálogo «Agente de Chatwoot» de un asesor ya ligado (con «Desvincular»)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await reescribirGet(c, "/api/usuarios", (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((u: Json) => (u.correo === c.mundo.usuarios.bloqueable.correo ? { ...u, chatwoot_agent_id: 7 } : u)) }));
    await abrirEnTarjeta(c, "Agente de Chatwoot");
  }),
  flotante("usuarios-chatwoot-validacion", "Diálogo «Agente de Chatwoot» con un número que no es número («Escribe el número del agente»)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirEnTarjeta(c, "Agente de Chatwoot");
    await dlg(c).getByLabel("Número del agente en Chatwoot (opcional)").fill("abc");
    await pulsar(c, "Vincular");
    await verElError(c, "Escribe el número del agente");
  }),
  flotante("usuarios-chatwoot-error-servidor", "Diálogo «Agente de Chatwoot» con el error del servidor (Chatwoot sin configurar en el servidor de pruebas)", "/admin/usuarios", [USUARIOS, DIALOGO], async (c) => {
    await abrirEnTarjeta(c, "Agente de Chatwoot");
    await pulsar(c, "Vincular");
    await verElError(c);
  }),
  flotante("usuarios-desactivar-confirmar", "Confirmación «Desactivar a …» (qué pasa con sus sesiones y sus datos)", "/admin/usuarios", [USUARIOS, COMUNES, DIALOGO], (c) => abrirEnTarjeta(c, "Desactivar")),
  flotante("usuarios-desactivar-error-servidor", "Confirmación «Desactivar a …» con el error del servidor dentro", "/admin/usuarios", [USUARIOS, COMUNES, DIALOGO], async (c) => {
    await abrirEnTarjeta(c, "Desactivar");
    await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
    await pulsar(c, `Desactivar a ${c.mundo.usuarios.bloqueable.nombre}`);
    await verElError(c, "Algo salió mal en el servidor");
  }),

  // Configuración
  ...estados({ pref: "configuracion", pantalla: "Configuración de la escuela", ruta: "/admin/configuracion", real: RUTA_CONFIGURACION, fuentes: [CONFIGURACION], muchos: false, vacio: false, datos: "Configuración de la escuela con sus ajustes, rangos y efectos" }),
  {
    id: "admins-configuracion-modulos-apagados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Configuración con módulos apagados: los ajustes de esos módulos dicen «Ojo: el módulo … está apagado»",
    tipo: "estado",
    ruta: "/admin/configuracion",
    fuentes: [CONFIGURACION],
    ir: (c) => conModulosApagados(c, RUTA_CONFIGURACION, ["cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas", "tableros"]),
  },
  {
    id: "admins-configuracion-validacion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Configuración con errores de validación (hora de inicio después de la de fin, un número fuera de rango y uno que no es número)",
    tipo: "formulario",
    ruta: "/admin/configuracion",
    fuentes: [CONFIGURACION],
    ir: async (c) => {
      await irA(c, RUTA_CONFIGURACION);
      const horas = c.page.getByTestId("formulario-configuracion").locator("input[type='time']");
      await horas.nth(0).fill("18:00");
      await horas.nth(1).fill("10:00");
      const numeros = c.page.getByTestId("formulario-configuracion").locator("input[inputmode='numeric']");
      await numeros.nth(0).fill("0");
      await numeros.nth(1).fill("abc");
      await c.page.getByRole("button", { name: "Guardar la configuración" }).click();
      await c.page.getByText("La hora de inicio debe ser antes que la hora de fin").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-configuracion-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Configuración con el error del servidor al guardar (el mensaje queda sobre el botón «Guardar la configuración»)",
    tipo: "formulario",
    ruta: "/admin/configuracion",
    fuentes: [CONFIGURACION],
    ir: async (c) => {
      await irA(c, RUTA_CONFIGURACION);
      await fallarLaSiguienteEscritura(c, 400, "Algún ajuste está fuera de rango.");
      await c.page.getByRole("button", { name: "Guardar la configuración" }).click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-configuracion-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Configuración sin conexión al guardar («No hay conexión con el servidor…»)",
    tipo: "formulario",
    ruta: "/admin/configuracion",
    fuentes: [CONFIGURACION],
    ir: async (c) => {
      await irA(c, RUTA_CONFIGURACION);
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: "Guardar la configuración" }).click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },

  // Textos del asistente
  ...estados({ pref: "textos", pantalla: "Textos del asistente", ruta: "/admin/textos", real: RUTA_TEXTOS, fuentes: [TEXTOS], muchos: false, datos: "Textos del asistente por sección (De siempre / Personalizado)" }),
  {
    id: "admins-textos-personalizados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Textos del asistente con uno personalizado (insignia «Personalizado»)",
    tipo: "estado",
    ruta: "/admin/textos",
    fuentes: [TEXTOS],
    ir: async (c) => {
      await reescribirGet(c, "/api/textos-bot", (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((t: Json, i: number) => (i === 0 ? { ...t, personalizado: true, texto: "¡Hola! Qué gusto saludarte. Soy el asistente de la escuela." } : t)) }));
      await irA(c, RUTA_TEXTOS);
    },
  },
  {
    id: "admins-textos-modulos-apagados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Textos del asistente con los módulos de cotizador y clase muestra apagados (aviso «Puedes dejar estos textos listos…»)",
    tipo: "estado",
    ruta: "/admin/textos",
    fuentes: [TEXTOS],
    ir: (c) => conModulosApagados(c, RUTA_TEXTOS, ["cotizador", "clase_muestra"]),
  },
  flotante("textos-cambiar", "Diálogo «Cambiar lo que dice el asistente» con el texto de siempre (huecos disponibles y «Así se vería»)", "/admin/textos", [TEXTOS, DIALOGO], (c) => abrirTexto(c, (t) => t.huecos.length > 0 && !t.personalizado)),
  flotante("textos-cambiar-vista-previa", "Diálogo «Cambiar lo que dice el asistente» con huecos agregados al texto y su vista previa", "/admin/textos", [TEXTOS, DIALOGO], async (c) => {
    await abrirTexto(c, (t) => t.huecos.length >= 2);
    const huecos = dlg(c).getByRole("button", { name: /^Agregar \{/ });
    await huecos.nth(0).click();
    await huecos.nth(1).click();
    await esperarListo(c.page);
  }),
  flotante("textos-cambiar-sin-huecos", "Diálogo «Cambiar lo que dice el asistente» de un mensaje sin huecos («Este mensaje no lleva huecos»)", "/admin/textos", [TEXTOS, DIALOGO], (c) => abrirTexto(c, (t) => t.huecos.length === 0)),
  flotante("textos-cambiar-personalizado", "Diálogo «Cambiar lo que dice el asistente» de un texto personalizado (con «Volver al texto de siempre»)", "/admin/textos", [TEXTOS, DIALOGO], (c) =>
    abrirTexto(c, () => true, (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((t: Json, i: number) => (i === 0 ? { ...t, personalizado: true, texto: `${t.texto} 😊` } : t)) })),
  ),
  flotante("textos-cambiar-validacion-vacio", "Diálogo «Cambiar lo que dice el asistente» con el texto borrado («Escribe el mensaje…»)", "/admin/textos", [TEXTOS, DIALOGO], async (c) => {
    await abrirTexto(c, (t) => t.huecos.length > 0);
    await dlg(c).getByLabel("Lo que dice el asistente").fill("");
    await pulsar(c, "Guardar");
    await verElError(c, /Escribe el mensaje/);
  }),
  flotante("textos-cambiar-validacion-hueco", "Diálogo «Cambiar lo que dice el asistente» con un hueco que no existe («no se puede usar en este mensaje»)", "/admin/textos", [TEXTOS, DIALOGO], async (c) => {
    await abrirTexto(c, (t) => t.huecos.length > 0);
    await dlg(c).getByLabel("Lo que dice el asistente").fill("Hola {inventado}, ¿en qué te ayudo?");
    await pulsar(c, "Guardar");
    await verElError(c, /no se puede usar en este mensaje/);
  }),
  flotante("textos-cambiar-validacion-obligatorio", "Diálogo «Cambiar lo que dice el asistente» sin un hueco obligatorio («Falta {…}»)", "/admin/textos", [TEXTOS, DIALOGO], async (c) => {
    await abrirTexto(c, (t) => t.obligatorios.length > 0);
    await dlg(c).getByLabel("Lo que dice el asistente").fill("Mensaje sin los huecos que hacen falta.");
    await pulsar(c, "Guardar");
    await verElError(c, /^Falta \{/);
  }),
  flotante("textos-cambiar-error-servidor", "Diálogo «Cambiar lo que dice el asistente» con el error del servidor bajo el campo", "/admin/textos", [TEXTOS, DIALOGO], async (c) => {
    await abrirTexto(c, (t) => t.huecos.length === 0);
    await dlg(c).getByLabel("Lo que dice el asistente").fill("Un texto que el servidor va a rechazar.");
    await fallarLaSiguienteEscritura(c, 400, "El texto no puede llevar enlaces.", [{ campo: "texto", mensaje: "El texto no puede llevar enlaces." }]);
    await pulsar(c, "Guardar");
    await verElError(c, "El texto no puede llevar enlaces.");
  }),

  // Etapas del embudo
  ...estados({ pref: "etapas", pantalla: "Etapas del embudo", ruta: "/admin/etapas", real: RUTA_ETAPAS, fuentes: [ETAPAS], datos: "Etapas del embudo con las del sistema (y las de cierre)" }),
  {
    id: "admins-etapas-con-propia",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Etapas del embudo con una etapa propia («Tuya»: se puede subir, bajar y quitar)",
    tipo: "estado",
    ruta: "/admin/etapas",
    fuentes: [ETAPAS],
    ir: async (c) => {
      await reescribirGet(c, "/api/etapas", conEtapaPropia);
      await irA(c, RUTA_ETAPAS);
    },
  },
  {
    id: "admins-etapas-mover-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Etapas del embudo: error del servidor al subir una etapa (el mensaje queda sobre la lista)",
    tipo: "estado",
    ruta: "/admin/etapas",
    fuentes: [ETAPAS],
    ir: async (c) => {
      await reescribirGet(c, "/api/etapas", conEtapaPropia);
      await irA(c, RUTA_ETAPAS);
      await fallarLaSiguienteEscritura(c, 409, "Ese orden no es válido.");
      await c.page.getByRole("button", { name: "Subir Visita a la sucursal" }).click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },
  flotante("etapas-agregar-vacio", "Diálogo «Agregar una etapa» vacío", "/admin/etapas", [ETAPAS, DIALOGO], async (c) => {
    await irA(c, RUTA_ETAPAS);
    await c.page.getByRole("button", { name: "Agregar una etapa" }).click();
    await dialogoListo(c);
  }),
  flotante("etapas-agregar-validacion", "Diálogo «Agregar una etapa» enviado vacío y con los días mal escritos", "/admin/etapas", [ETAPAS, DIALOGO], async (c) => {
    await irA(c, RUTA_ETAPAS);
    await c.page.getByRole("button", { name: "Agregar una etapa" }).click();
    await dialogoListo(c);
    await dlg(c).getByLabel("Días sin movimiento que avisan").fill("500");
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe el nombre de la etapa");
  }),
  flotante("etapas-agregar-error-servidor", "Diálogo «Agregar una etapa» con el error del servidor", "/admin/etapas", [ETAPAS, DIALOGO], async (c) => {
    await irA(c, RUTA_ETAPAS);
    await c.page.getByRole("button", { name: "Agregar una etapa" }).click();
    await dialogoListo(c);
    await dlg(c).getByRole("textbox", { name: /^Nombre de la etapa/ }).fill("Visita a la sucursal");
    await fallarLaSiguienteEscritura(c, 409, "Ya hay una etapa con ese nombre.", [{ campo: "nombre", mensaje: "Ya hay una etapa con ese nombre." }]);
    await pulsar(c, "Guardar");
    await verElError(c, "Ya hay una etapa con ese nombre.");
  }),
  flotante("etapas-cambiar", "Diálogo «Cambiar la etapa» de una etapa del sistema (nombre y días de aviso)", "/admin/etapas", [ETAPAS, DIALOGO], (c) => abrirEtapa(c, "Cambiar", "primera")),
  flotante("etapas-cambiar-cierre", "Diálogo «Cambiar la etapa» de una etapa de cierre («no avisan por días sin movimiento»)", "/admin/etapas", [ETAPAS, DIALOGO], (c) => abrirEtapa(c, "Cambiar", "ultima")),
  flotante("etapas-cambiar-validacion", "Diálogo «Cambiar la etapa» con el nombre borrado", "/admin/etapas", [ETAPAS, DIALOGO], async (c) => {
    await abrirEtapa(c, "Cambiar", "primera");
    await dlg(c).getByRole("textbox", { name: /^Nombre de la etapa/ }).fill("");
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe el nombre de la etapa");
  }),
  flotante("etapas-quitar-confirmar", "Confirmación «Quitar la etapa»", "/admin/etapas", [ETAPAS, COMUNES, DIALOGO], (c) => abrirEtapa(c, "Quitar", "propia")),
  flotante("etapas-quitar-error-servidor", "Confirmación «Quitar la etapa» con el error del servidor (la etapa tiene leads)", "/admin/etapas", [ETAPAS, COMUNES, DIALOGO], async (c) => {
    await abrirEtapa(c, "Quitar", "propia");
    await fallarLaSiguienteEscritura(c, 409, "La etapa tiene leads: muévelos a otra etapa primero.");
    await pulsar(c, "Quitar");
    await verElError(c, "La etapa tiene leads");
  }),

  // Motivos
  ...estados({ pref: "motivos", pantalla: "Motivos de pérdida y de baja", ruta: "/admin/motivos", real: RUTA_MOTIVOS, fuentes: [MOTIVOS], datos: "Motivos de pérdida y de baja con datos (las dos listas)" }),
  {
    id: "admins-motivos-modulos-apagados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Motivos con el módulo de inscripción apagado (la lista de baja dice «Puedes dejar la lista lista…»)",
    tipo: "estado",
    ruta: "/admin/motivos",
    fuentes: [MOTIVOS],
    ir: (c) => conModulosApagados(c, RUTA_MOTIVOS, ["inscripcion"]),
  },
  {
    id: "admins-motivos-con-apagado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Motivos con uno apagado en cada lista (insignia «Apagado»)",
    tipo: "estado",
    ruta: "/admin/motivos",
    fuentes: [MOTIVOS],
    ir: async (c) => {
      for (const ruta of ["/api/motivos-perdida", "/api/motivos-baja"]) await reescribirGet(c, ruta, (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((m: Json, i: number) => (i === 0 ? { ...m, activo: false } : m)) }));
      await irA(c, RUTA_MOTIVOS);
    },
  },
  flotante("motivos-agregar-vacio", "Diálogo «Agregar un motivo» vacío (lista de pérdida)", "/admin/motivos", [MOTIVOS, DIALOGO], (c) => abrirMotivo(c, "perdida", "Agregar un motivo")),
  flotante("motivos-agregar-baja", "Diálogo «Agregar un motivo» de la lista de baja de una inscripción", "/admin/motivos", [MOTIVOS, DIALOGO], (c) => abrirMotivo(c, "baja", "Agregar un motivo")),
  flotante("motivos-agregar-validacion", "Diálogo «Agregar un motivo» enviado vacío y con un lugar que no es número", "/admin/motivos", [MOTIVOS, DIALOGO], async (c) => {
    await abrirMotivo(c, "perdida", "Agregar un motivo");
    await dlg(c).getByLabel("Lugar en la lista").fill("abc");
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe el motivo");
  }),
  flotante("motivos-agregar-error-servidor", "Diálogo «Agregar un motivo» con el error del servidor", "/admin/motivos", [MOTIVOS, DIALOGO], async (c) => {
    await abrirMotivo(c, "perdida", "Agregar un motivo");
    await dlg(c).getByRole("textbox", { name: /^Motivo/ }).fill("Se mudó de ciudad");
    await fallarLaSiguienteEscritura(c, 409, "Ya existe un motivo con ese nombre.");
    await pulsar(c, "Guardar");
    await verElError(c, "Ya existe un motivo con ese nombre.");
  }),
  flotante("motivos-cambiar", "Diálogo «Cambiar el motivo» (con la casilla «Se ofrece al registrar»)", "/admin/motivos", [MOTIVOS, DIALOGO], (c) => abrirMotivo(c, "perdida", "Cambiar")),
  flotante("motivos-cambiar-validacion", "Diálogo «Cambiar el motivo» con el nombre borrado", "/admin/motivos", [MOTIVOS, DIALOGO], async (c) => {
    await abrirMotivo(c, "perdida", "Cambiar");
    await dlg(c).getByRole("textbox", { name: /^Motivo/ }).fill("");
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe el motivo");
  }),
  flotante("motivos-quitar-confirmar", "Confirmación «Quitar el motivo»", "/admin/motivos", [MOTIVOS, COMUNES, DIALOGO], (c) => abrirMotivo(c, "perdida", "Quitar")),
  flotante("motivos-quitar-error-servidor", "Confirmación «Quitar el motivo» con el error del servidor dentro", "/admin/motivos", [MOTIVOS, COMUNES, DIALOGO], async (c) => {
    await abrirMotivo(c, "baja", "Quitar");
    await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
    await pulsar(c, "Quitar");
    await verElError(c, "Algo salió mal en el servidor");
  }),

  // Canales
  ...estados({ pref: "canales", pantalla: "Canales de WhatsApp", ruta: "/admin/canales", real: RUTA_CANALES, fuentes: [CANALES] }),
  {
    id: "admins-canales-con-y-sin-bandeja",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Canales de WhatsApp con un canal sin bandeja de Chatwoot («Agregar bandeja») y otro inactivo con calidad baja",
    tipo: "estado",
    ruta: "/admin/canales",
    fuentes: [CANALES],
    ir: async (c) => {
      await reescribirGet(c, "/api/canales-whatsapp", (cuerpo) => {
        const primero = { ...cuerpo.datos[0], bandeja: null, calidad_meta: "media" };
        const segundo = { ...cuerpo.datos[0], id: "canal-de-diseno", nombre_publico: "Canal de otra sucursal", activo: false, calidad_meta: "baja", numero_whatsapp: null, bandeja: BANDEJA_DE_DISENO };
        return { ...cuerpo, datos: [primero, segundo] };
      });
      await irA(c, RUTA_CANALES);
    },
  },
  flotante("canales-nuevo-vacio", "Diálogo «Nuevo canal» vacío", "/admin/canales", [CANALES, DIALOGO], async (c) => {
    await irA(c, RUTA_CANALES);
    await c.page.getByRole("button", { name: "Nuevo canal" }).click();
    await dialogoListo(c);
  }),
  flotante("canales-nuevo-validacion", "Diálogo «Nuevo canal» enviado vacío (nombre y disciplina)", "/admin/canales", [CANALES, DIALOGO], async (c) => {
    await irA(c, RUTA_CANALES);
    await c.page.getByRole("button", { name: "Nuevo canal" }).click();
    await dialogoListo(c);
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe el nombre");
  }),
  flotante("canales-nuevo-error-servidor", "Diálogo «Nuevo canal» con el error del servidor (número repetido)", "/admin/canales", [CANALES, DIALOGO], async (c) => {
    await irA(c, RUTA_CANALES);
    await c.page.getByRole("button", { name: "Nuevo canal" }).click();
    await dialogoListo(c);
    await dlg(c).getByRole("textbox", { name: /^Nombre del canal/ }).fill("Canal nuevo");
    await dlg(c).getByLabel(/^Disciplina/).selectOption({ index: 1 });
    await dlg(c).getByLabel("Número de WhatsApp").fill("+52 55 1234 5678");
    await fallarLaSiguienteEscritura(c, 409, "Ese número ya está en otro canal.", [{ campo: "numero_whatsapp", mensaje: "Ese número ya está en otro canal." }]);
    await pulsar(c, "Guardar");
    await verElError(c, "Ese número ya está en otro canal.");
  }),
  flotante("canales-editar", "Diálogo «Editar canal» con sus datos", "/admin/canales", [CANALES, DIALOGO], (c) => abrirCanal(c, "Editar canal")),
  flotante("canales-bandeja-agregar", "Diálogo «Bandeja de Chatwoot» de un canal sin bandeja (vacío)", "/admin/canales", [CANALES, DIALOGO], (c) => abrirCanal(c, "Agregar bandeja", false)),
  flotante("canales-bandeja-editar", "Diálogo «Bandeja de Chatwoot» de un canal con bandeja (con sus números)", "/admin/canales", [CANALES, DIALOGO], (c) => abrirCanal(c, "Editar bandeja", true)),
  flotante("canales-bandeja-validacion", "Diálogo «Bandeja de Chatwoot» enviado vacío y con la bandeja sin cuenta", "/admin/canales", [CANALES, DIALOGO], async (c) => {
    await abrirCanal(c, "Agregar bandeja", false);
    await dlg(c).getByLabel("Bandeja de Chatwoot (número)").fill("12");
    await pulsar(c, "Guardar");
    await verElError(c, "Escribe el nombre");
  }),
  flotante("canales-bandeja-error-servidor", "Diálogo «Bandeja de Chatwoot» con el error del servidor", "/admin/canales", [CANALES, DIALOGO], async (c) => {
    await abrirCanal(c, "Agregar bandeja", false);
    await dlg(c).getByRole("textbox", { name: /^Nombre de la bandeja/ }).fill("Bandeja nueva");
    await dlg(c).getByLabel("Cuenta de Chatwoot (número)").fill("1");
    await dlg(c).getByLabel("Bandeja de Chatwoot (número)").fill("2");
    await fallarLaSiguienteEscritura(c, 409, "Esa bandeja de Chatwoot ya está ligada a otro canal.");
    await pulsar(c, "Guardar");
    await verElError(c, "Esa bandeja de Chatwoot ya está ligada");
  }),
  flotante("canales-baja-confirmar", "Confirmación «Dar de baja el canal»", "/admin/canales", [CANALES, COMUNES, DIALOGO], (c) => abrirCanal(c, "Dar de baja", true)),
  flotante("canales-baja-error-servidor", "Confirmación «Dar de baja el canal» con el error del servidor (tiene bandeja)", "/admin/canales", [CANALES, COMUNES, DIALOGO], async (c) => {
    await abrirCanal(c, "Dar de baja", true);
    await fallarLaSiguienteEscritura(c, 409, "El canal tiene una bandeja: quítala primero.");
    await pulsar(c, "Dar de baja");
    await verElError(c, "El canal tiene una bandeja");
  }),
  flotante("canales-quitar-bandeja-confirmar", "Confirmación «Quitar la bandeja»", "/admin/canales", [CANALES, COMUNES, DIALOGO], (c) => abrirCanal(c, "Quitar bandeja", true)),
  flotante("canales-quitar-bandeja-error-servidor", "Confirmación «Quitar la bandeja» con el error del servidor (ya tiene conversaciones)", "/admin/canales", [CANALES, COMUNES, DIALOGO], async (c) => {
    await abrirCanal(c, "Quitar bandeja", true);
    await fallarLaSiguienteEscritura(c, 409, "La bandeja ya tiene conversaciones y no se puede quitar.");
    await pulsar(c, "Quitar");
    await verElError(c, "La bandeja ya tiene conversaciones");
  }),

  // Campañas
  ...estados({ pref: "campanas", pantalla: "Campañas y códigos QR", ruta: "/admin/campanas", real: RUTA_CAMPANAS, fuentes: [CAMPANAS] }),
  {
    id: "admins-campanas-con-inactiva",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Campañas y códigos QR con una inactiva y una de cada origen",
    tipo: "estado",
    ruta: "/admin/campanas",
    fuentes: [CAMPANAS],
    ir: async (c) => {
      await reescribirGet(c, "/api/campanas", (cuerpo) => {
        const origenes = ["facebook", "instagram", "tiktok", "google", "referido", "presencial", "otro"];
        return { ...cuerpo, datos: origenes.map((o, i) => ({ ...cuerpo.datos[0], id: `campana-de-diseno-${o}`, nombre: `Campaña de ${o}`, origen: o, activo: i !== 3 })) };
      });
      await irA(c, RUTA_CAMPANAS);
    },
  },
  flotante("campanas-nueva-vacio", "Diálogo «Nueva campaña» vacío", "/admin/campanas", [CAMPANAS, DIALOGO], async (c) => {
    await irA(c, RUTA_CAMPANAS);
    await c.page.getByRole("button", { name: "Nueva campaña" }).click();
    await dialogoListo(c);
  }),
  flotante("campanas-nueva-validacion", "Diálogo «Nueva campaña» enviado vacío («Escribe un nombre que reconozcas…»)", "/admin/campanas", [CAMPANAS, DIALOGO], async (c) => {
    await irA(c, RUTA_CAMPANAS);
    await c.page.getByRole("button", { name: "Nueva campaña" }).click();
    await dialogoListo(c);
    await pulsar(c, "Guardar");
    await verElError(c, /Escribe un nombre que reconozcas/);
  }),
  flotante("campanas-nueva-error-servidor", "Diálogo «Nueva campaña» con el error del servidor", "/admin/campanas", [CAMPANAS, DIALOGO], async (c) => {
    await irA(c, RUTA_CAMPANAS);
    await c.page.getByRole("button", { name: "Nueva campaña" }).click();
    await dialogoListo(c);
    await dlg(c).getByRole("textbox", { name: /^Nombre de la campaña/ }).fill("Volantes de septiembre");
    await fallarLaSiguienteEscritura(c, 409, "Ya hay una campaña con ese nombre.", [{ campo: "nombre", mensaje: "Ya hay una campaña con ese nombre." }]);
    await pulsar(c, "Guardar");
    await verElError(c, "Ya hay una campaña con ese nombre.");
  }),
  flotante("campanas-editar", "Diálogo «Editar campaña» con sus datos", "/admin/campanas", [CAMPANAS, DIALOGO], (c) => abrirCampana(c, "Editar")),
  flotante("campanas-qr", "Diálogo «Código QR de la campaña» con el QR, la dirección y las dos descargas", "/admin/campanas", [CAMPANAS, DIALOGO], async (c) => {
    await abrirCampana(c, "Código QR");
    await esperarElQr(c);
  }),
  flotante("campanas-qr-sin-sucursales", "Diálogo «Código QR de la campaña» sin sucursales que den la disciplina («Ninguna sucursal da esa disciplina todavía»)", "/admin/campanas", [CAMPANAS, DIALOGO], async (c) => {
    await reescribirGet(c, "/api/sucursales", (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((s: Json) => ({ ...s, verticales: [] })) }));
    await abrirCampana(c, "Código QR");
  }),
  flotante("campanas-baja-confirmar", "Confirmación «Dar de baja la campaña»", "/admin/campanas", [CAMPANAS, COMUNES, DIALOGO], (c) => abrirCampana(c, "Dar de baja")),
  flotante("campanas-baja-error-servidor", "Confirmación «Dar de baja la campaña» con el error del servidor (tiene códigos QR en uso)", "/admin/campanas", [CAMPANAS, COMUNES, DIALOGO], async (c) => {
    await abrirCampana(c, "Dar de baja");
    await fallarLaSiguienteEscritura(c, 409, "La campaña tiene códigos QR en uso.");
    await pulsar(c, "Dar de baja");
    await verElError(c, "La campaña tiene códigos QR en uso.");
  }),

  // Plantillas
  ...estados({ pref: "plantillas", pantalla: "Plantillas de mensaje", ruta: "/admin/plantillas", real: RUTA_PLANTILLAS, fuentes: [PLANTILLAS], datos: "Plantillas de mensaje con una de servicio (aprobada) y una de marketing (pendiente)" }),
  {
    id: "admins-plantillas-filtro-servicio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Plantillas de mensaje filtradas por la clase «Servicio»",
    tipo: "estado",
    ruta: "/admin/plantillas",
    fuentes: [PLANTILLAS],
    ir: async (c) => {
      await irA(c, RUTA_PLANTILLAS);
      await c.page.getByLabel("Clase").selectOption("servicio");
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-plantillas-filtro-sin-resultados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Plantillas de mensaje con un filtro sin resultados («No hay plantillas con ese filtro»)",
    tipo: "estado",
    ruta: "/admin/plantillas",
    fuentes: [PLANTILLAS],
    ir: async (c) => {
      await irA(c, RUTA_PLANTILLAS);
      await c.page.route(
        (u) => u.pathname === "/api/plantillas",
        async (r) => {
          if (r.request().method() !== "GET") return r.fallback();
          const resp = await r.fetch();
          const cuerpo = (await resp.json()) as Json;
          return r.fulfill({ response: resp, body: JSON.stringify({ ...cuerpo, datos: [], paginacion: { ...cuerpo.paginacion, total: 0 } }) });
        },
      );
      await c.page.getByLabel("Clase").selectOption("marketing");
      await c.page.getByText("No hay plantillas con ese filtro").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-plantillas-estados-variados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Plantillas de mensaje en todos los estados de aprobación (aprobada, pendiente, rechazada, pausada, deshabilitada) y una inactiva",
    tipo: "estado",
    ruta: "/admin/plantillas",
    fuentes: [PLANTILLAS],
    ir: async (c) => {
      await reescribirGet(c, "/api/plantillas", (cuerpo) => {
        const estados = ["aprobada", "pendiente", "rechazada", "pausada", "deshabilitada"];
        const datos = estados.map((e, i) => ({ ...cuerpo.datos[0], id: `plantilla-de-diseno-${e}`, codigo: `plantilla_${e}`, estado_aprobacion: e, clase_mensaje: i % 2 === 0 ? "servicio" : "marketing", activo: e !== "deshabilitada", variables: i === 0 ? [] : cuerpo.datos[0].variables, automatizaciones: i }));
        return { ...cuerpo, datos, paginacion: { ...cuerpo.paginacion, total: datos.length } };
      });
      await irA(c, RUTA_PLANTILLAS);
    },
  },
  flotante("plantillas-nueva-vacio", "Diálogo «Nueva plantilla» vacío (clase sin elegir)", "/admin/plantillas", [PLANTILLAS, DIALOGO], abrirNuevaPlantilla),
  flotante("plantillas-nueva-validacion", "Diálogo «Nueva plantilla» enviado vacío (código, identificador y clase)", "/admin/plantillas", [PLANTILLAS, DIALOGO], async (c) => {
    await abrirNuevaPlantilla(c);
    await pulsar(c, "Guardar");
    await verElError(c, "Declara si es de servicio o de marketing");
  }),
  flotante("plantillas-nueva-servicio-marketing", "Diálogo «Nueva plantilla» de servicio con categoría marketing («no puede ser de categoría marketing»)", "/admin/plantillas", [PLANTILLAS, DIALOGO], async (c) => {
    await abrirNuevaPlantilla(c);
    await dlg(c).getByRole("textbox", { name: /^Código/ }).fill("aviso_nuevo");
    await dlg(c).getByRole("textbox", { name: /^Identificador en Twilio/ }).fill("HX00000000000000000000000000000003");
    await dlg(c).getByRole("radio", { name: "Servicio" }).check({ force: true });
    await dlg(c).getByLabel("Categoría ante Meta").selectOption("marketing");
    await pulsar(c, "Guardar");
    await verElError(c, /no puede ser de categoría marketing/);
  }),
  flotante("plantillas-nueva-variables", "Diálogo «Nueva plantilla» de marketing con variables (una vacía: «Variable 1: posición de 1 a 20…»)", "/admin/plantillas", [PLANTILLAS, DIALOGO], async (c) => {
    await abrirNuevaPlantilla(c);
    await dlg(c).getByRole("textbox", { name: /^Código/ }).fill("promocion_nueva");
    await dlg(c).getByRole("textbox", { name: /^Identificador en Twilio/ }).fill("HX00000000000000000000000000000004");
    await dlg(c).getByRole("radio", { name: "Marketing" }).check({ force: true });
    await dlg(c).getByRole("button", { name: "Agregar una variable" }).click();
    await dlg(c).getByLabel("Nombre 1").fill("nombre_familia");
    await dlg(c).getByRole("button", { name: "Agregar una variable" }).click();
    await pulsar(c, "Guardar");
    await verElError(c, /^Variable 2/);
  }),
  flotante("plantillas-nueva-error-servidor", "Diálogo «Nueva plantilla» con el error del servidor (código repetido)", "/admin/plantillas", [PLANTILLAS, DIALOGO], async (c) => {
    await abrirNuevaPlantilla(c);
    await dlg(c).getByRole("textbox", { name: /^Código/ }).fill("aviso_nuevo");
    await dlg(c).getByRole("textbox", { name: /^Identificador en Twilio/ }).fill("HX00000000000000000000000000000003");
    await dlg(c).getByRole("radio", { name: "Servicio" }).check({ force: true });
    await fallarLaSiguienteEscritura(c, 409, "Ya existe una plantilla con ese código.", [{ campo: "codigo", mensaje: "Ya existe una plantilla con ese código." }]);
    await pulsar(c, "Guardar");
    await verElError(c, "Ya existe una plantilla con ese código.");
  }),
  flotante("plantillas-editar-servicio", "Diálogo «Editar plantilla» de servicio aprobada (con su variable y su texto)", "/admin/plantillas", [PLANTILLAS, DIALOGO], (c) => abrirPlantilla(c, "servicio", "Editar")),
  flotante("plantillas-editar-marketing", "Diálogo «Editar plantilla» de marketing pendiente de aprobación", "/admin/plantillas", [PLANTILLAS, DIALOGO], (c) => abrirPlantilla(c, "marketing", "Editar")),
  flotante("plantillas-baja-confirmar", "Confirmación «Dar de baja la plantilla»", "/admin/plantillas", [PLANTILLAS, COMUNES, DIALOGO], (c) => abrirPlantilla(c, "marketing", "Dar de baja")),
  flotante("plantillas-baja-en-uso", "Confirmación «Dar de baja la plantilla» con el error real del servidor (una automatización la usa)", "/admin/plantillas", [PLANTILLAS, COMUNES, DIALOGO], async (c) => {
    await abrirPlantilla(c, "servicio", "Dar de baja");
    await pulsar(c, "Dar de baja");
    await verElError(c, /automatización/);
  }),

  // Automatizaciones
  ...estados({ pref: "automatizaciones", pantalla: "Automatizaciones", ruta: "/admin/automatizaciones", real: RUTA_AUTOMATIZACIONES, fuentes: [AUTOMATIZACIONES], datos: "Automatizaciones con datos (cada una con su evento, desfase, horario y plantilla)" }),
  {
    id: "admins-automatizaciones-en-pausa",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Automatizaciones con los módulos de clase muestra y finanzas apagados (insignia «En pausa: … está apagado»)",
    tipo: "estado",
    ruta: "/admin/automatizaciones",
    fuentes: [AUTOMATIZACIONES],
    ir: (c) => conModulosApagados(c, RUTA_AUTOMATIZACIONES, ["clase_muestra", "finanzas"]),
  },
  {
    id: "admins-automatizaciones-variadas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Automatizaciones apagadas, sin plantilla y con plantilla sin aprobar («¡todavía no se puede mandar!»), de vertical y sucursal",
    tipo: "estado",
    ruta: "/admin/automatizaciones",
    fuentes: [AUTOMATIZACIONES],
    ir: async (c) => {
      await reescribirGet(c, "/api/automatizaciones", (cuerpo) => {
        const [a, b] = cuerpo.datos;
        return {
          ...cuerpo,
          datos: [
            { ...a, activo: false },
            { ...b, plantilla_id: null, plantilla: null },
            { ...a, id: "auto-de-diseno-1", nombre: "Reenganche (sin aprobar)", evento_disparador: "lead_sin_respuesta", offset_minutos: 1440, vertical: "Disciplina de ejemplo", sucursal: "Sucursal de ejemplo", plantilla: { codigo: "promocion_de_prueba", clase_mensaje: "marketing", estado_aprobacion: "pendiente", activo: true } },
            { ...b, id: "auto-de-diseno-2", nombre: "Lead sin movimiento", evento_disparador: "lead_frio", offset_minutos: 0, max_atraso_dias: 30 },
          ],
          paginacion: { ...cuerpo.paginacion, total: 4 },
        };
      });
      await irA(c, RUTA_AUTOMATIZACIONES);
    },
  },
  {
    id: "admins-automatizaciones-alternar-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Automatizaciones: error del servidor al pulsar «Apagar» (el mensaje queda sobre la lista)",
    tipo: "estado",
    ruta: "/admin/automatizaciones",
    fuentes: [AUTOMATIZACIONES],
    ir: async (c) => {
      await irA(c, RUTA_AUTOMATIZACIONES);
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await tarjetaDeAutomatizacion(c, "recordatorio").getByRole("button", { name: "Apagar", exact: true }).click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-automatizaciones-alternar-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Automatizaciones: sin conexión al pulsar «Apagar» («No hay conexión con el servidor…»)",
    tipo: "estado",
    ruta: "/admin/automatizaciones",
    fuentes: [AUTOMATIZACIONES],
    ir: async (c) => {
      await irA(c, RUTA_AUTOMATIZACIONES);
      await cortarLaRed(c);
      await tarjetaDeAutomatizacion(c, "recordatorio").getByRole("button", { name: "Apagar", exact: true }).click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },
  flotante("automatizaciones-ajustar-recordatorio", "Diálogo «Ajustar la automatización» de un aviso ANTES de la clase (desfase negativo)", "/admin/automatizaciones", [AUTOMATIZACIONES, DIALOGO], (c) => abrirAjuste(c, "recordatorio")),
  flotante("automatizaciones-ajustar-pago-atrasado", "Diálogo «Ajustar la automatización» de un aviso DESPUÉS del vencimiento (con «Máximo de días de atraso»)", "/admin/automatizaciones", [AUTOMATIZACIONES, DIALOGO], (c) => abrirAjuste(c, "pagoAtrasado")),
  flotante("automatizaciones-ajustar-validacion", "Diálogo «Ajustar la automatización» con errores (desfase con el signo contrario, intentos fuera de rango, horario fuera de 09:00–20:00 y ningún día)", "/admin/automatizaciones", [AUTOMATIZACIONES, DIALOGO], async (c) => {
    await abrirAjuste(c, "recordatorio");
    await dlg(c).getByLabel("Desfase (minutos)").fill("30");
    await dlg(c).getByLabel("Intentos", { exact: true }).fill("0");
    await dlg(c).getByLabel("Minutos entre intentos (opcional)").fill("10");
    await dlg(c).getByLabel("Envía desde").fill("08:00");
    for (const dia of await dlg(c).getByRole("checkbox").all()) await dia.uncheck();
    await pulsar(c, "Guardar");
    await verElError(c, /Este aviso sale ANTES del evento/);
  }),
  flotante("automatizaciones-ajustar-validacion-atraso", "Diálogo «Ajustar la automatización» con el máximo de días de atraso fuera de rango", "/admin/automatizaciones", [AUTOMATIZACIONES, DIALOGO], async (c) => {
    await abrirAjuste(c, "pagoAtrasado");
    await dlg(c).getByLabel("Máximo de días de atraso que se persigue").fill("999");
    await pulsar(c, "Guardar");
    await verElError(c, /Escribe un número de 1 a/);
  }),
  flotante("automatizaciones-ajustar-error-servidor", "Diálogo «Ajustar la automatización» con el error del servidor (plantilla que no sirve)", "/admin/automatizaciones", [AUTOMATIZACIONES, DIALOGO], async (c) => {
    await abrirAjuste(c, "recordatorio");
    await fallarLaSiguienteEscritura(c, 409, "Esa plantilla no está aprobada.", [{ campo: "plantilla_id", mensaje: "Esa plantilla no está aprobada." }]);
    await pulsar(c, "Guardar");
    await verElError(c, "Esa plantilla no está aprobada.");
  }),

  // Bandeja del administrador
  ...estados({ pref: "bandeja", pantalla: "Bandeja del administrador", ruta: "/admin/bandeja", real: RUTA_BANDEJA, fuentes: [BANDEJA], datos: "Bandeja del administrador con un evento inesperado pendiente y una tarea sin lead" }),
  {
    id: "admins-bandeja-eventos-variados",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Bandeja del administrador con eventos de todo tipo (uno atendido, uno sin tarea, uno repetido 7 veces) y el filtro «Solo los que tienen una tarea pendiente» apagado",
    tipo: "estado",
    ruta: "/admin/bandeja",
    fuentes: [BANDEJA],
    ir: async (c) => {
      await reescribirGet(c, "/api/eventos-inesperados", eventosVariados);
      await irA(c, RUTA_BANDEJA);
      await c.page.getByLabel("Solo los que tienen una tarea pendiente").uncheck();
      await alInicio(c);
    },
  },
  {
    id: "admins-bandeja-detalle-abierto",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Bandeja del administrador con el «Detalle para soporte» del evento desplegado",
    tipo: "estado",
    ruta: "/admin/bandeja",
    fuentes: [BANDEJA],
    ir: async (c) => {
      await irA(c, RUTA_BANDEJA);
      await c.page.getByTestId(`evento-${c.mundo.mensajeria.evento.id}`).getByText("Detalle para soporte").click();
      await alInicio(c);
    },
  },
  {
    id: "admins-bandeja-solo-eventos-vacio",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Bandeja del administrador sin eventos pero con tareas sin lead (cada lista vacía por separado)",
    tipo: "estado",
    ruta: "/admin/bandeja",
    fuentes: [BANDEJA],
    ir: async (c) => {
      await reescribirGet(c, "/api/eventos-inesperados", (cuerpo) => ({ ...cuerpo, datos: [], paginacion: { ...cuerpo.paginacion, total: 0 } }));
      await irA(c, RUTA_BANDEJA);
    },
  },
  {
    id: "admins-bandeja-error-solo-tareas",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Bandeja del administrador con error de carga solo en las tareas sin lead (los eventos sí cargan)",
    tipo: "estado",
    ruta: "/admin/bandeja",
    fuentes: [BANDEJA],
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname === "/api/tareas",
        (r) => (r.request().method() === "GET" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { codigo: "interno", mensaje: "Algo salió mal en el servidor. Inténtalo de nuevo." } }) }) : r.fallback()),
      );
      await irA(c, RUTA_BANDEJA);
    },
  },
  {
    id: "admins-bandeja-resolver-error-servidor",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Bandeja del administrador: error del servidor al pulsar «Descartar» en una tarea (el mensaje queda arriba)",
    tipo: "estado",
    ruta: "/admin/bandeja",
    fuentes: [BANDEJA],
    ir: async (c) => {
      await irA(c, RUTA_BANDEJA);
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await c.page.getByTestId(`tarea-${c.mundo.mensajeria.tareaSinLead.id}`).getByRole("button", { name: "Descartar", exact: true }).click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await c.page.evaluate(() => window.scrollTo(0, 0));
      await esperarListo(c.page);
    },
  },
  {
    id: "admins-bandeja-resolver-sin-conexion",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Bandeja del administrador: sin conexión al pulsar «Marcar hecha» («No hay conexión con el servidor…»)",
    tipo: "estado",
    ruta: "/admin/bandeja",
    fuentes: [BANDEJA],
    ir: async (c) => {
      await irA(c, RUTA_BANDEJA);
      await cortarLaRed(c);
      await c.page.getByTestId(`tarea-${c.mundo.mensajeria.tareaSinLead.id}`).getByRole("button", { name: "Marcar hecha", exact: true }).click();
      await c.page.getByRole("alert").first().waitFor();
      await alInicio(c);
      await c.page.evaluate(() => window.scrollTo(0, 0));
      await esperarListo(c.page);
    },
  },

  // ─── El aviso «ya quedó» y lo que queda después de guardar: al final ───────────────────────
  // Casi todo con la escritura simulada; las tres que escriben de verdad (usuario, automatización, configuración) guardan valores iguales a los actuales y van las últimas.
  {
    id: "admins-modulos-aviso-encendido",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al encender un módulo («Tableros quedó encendido. …»; el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/modulos",
    fuentes: [MODULOS, AVISOS],
    completa: false,
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname === "/api/modulos",
        async (r) => {
          if (r.request().method() === "GET") return r.fallback();
          const resp = await r.fetch({ method: "GET" });
          return r.fulfill({ response: resp, body: JSON.stringify(listaDeModulos(TODOS)((await resp.json()) as Json)) });
        },
      );
      await modulosCon(c, ["cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas"]);
      await c.page.getByTestId("interruptor-tableros").click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-modulos-aviso-apagado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al apagar un módulo, después de confirmar («Tableros quedó apagado. …»; el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/modulos",
    fuentes: [MODULOS, COMUNES, AVISOS],
    completa: false,
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname === "/api/modulos",
        async (r) => {
          if (r.request().method() === "GET") return r.fallback();
          const resp = await r.fetch({ method: "GET" });
          return r.fulfill({ response: resp, body: JSON.stringify(listaDeModulos(TODOS.filter((m) => m !== "tableros"))((await resp.json()) as Json)) });
        },
      );
      await modulosCon(c, TODOS);
      await c.page.getByTestId("interruptor-tableros").click();
      await dialogoListo(c);
      await pulsar(c, "Apagar Tableros");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-usuarios-aviso-creado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al crear un usuario («Se creó el usuario …»; el alta se simula)",
    tipo: "flotante",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/usuarios$/);
      await abrirNuevoUsuario(c);
      await llenarNuevoUsuario(c);
      await pulsar(c, "Guardar");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-usuarios-aviso-contrasena",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al restablecer la contraseña de otra persona (el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/usuarios\/[^/]+$/);
      await abrirEnTarjeta(c, "Restablecer contraseña");
      await dlg(c).getByLabel("Contraseña nueva").fill("una-contrasena-larga-1");
      await pulsar(c, "Restablecer contraseña");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-usuarios-aviso-desactivado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al desactivar a una persona, después de confirmar (el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS, COMUNES, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/usuarios\/[^/]+$/);
      await abrirEnTarjeta(c, "Desactivar");
      await pulsar(c, `Desactivar a ${c.mundo.usuarios.bloqueable.nombre}`);
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-usuarios-aviso-activado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al activar de nuevo a una persona («volvió a estar activo…»; el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS, AVISOS],
    completa: false,
    ir: async (c) => {
      await reescribirGet(c, "/api/usuarios", (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((u: Json) => (u.correo === c.mundo.usuarios.bloqueable.correo ? { ...u, activo: false } : u)) }));
      await simularEscritura(c, /^\/api\/usuarios\/[^/]+$/);
      await irA(c, RUTA_USUARIOS);
      await bloqueable(c).getByRole("button", { name: "Activar", exact: true }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-canales-aviso-canal-guardado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al guardar un canal («El canal … se guardó.»; el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/canales",
    fuentes: [CANALES, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/canales-whatsapp\/[^/]+$/);
      await abrirCanal(c, "Editar canal");
      await pulsar(c, "Guardar");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-canales-aviso-bandeja-quitada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al quitar la bandeja de un canal, después de confirmar (el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/canales",
    fuentes: [CANALES, COMUNES, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/bandejas-chatwoot\/[^/]+$/);
      await abrirCanal(c, "Quitar bandeja", true);
      await pulsar(c, "Quitar");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-campanas-aviso-guardada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al guardar una campaña («Ya puedes bajar su código QR.»; el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/campanas",
    fuentes: [CAMPANAS, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/campanas\/[^/]+$/);
      await abrirCampana(c, "Editar");
      await pulsar(c, "Guardar");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-plantillas-aviso-guardada-sin-aprobar",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al guardar una plantilla sin aprobar («Mientras no esté aprobada, el sistema no la manda.»; el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/plantillas",
    fuentes: [PLANTILLAS, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/plantillas\/[^/]+$/);
      await abrirPlantilla(c, "marketing", "Editar");
      await pulsar(c, "Guardar");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-automatizaciones-aviso-apagada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al apagar una automatización (el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/automatizaciones",
    fuentes: [AUTOMATIZACIONES, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/automatizaciones\/[^/]+$/);
      await irA(c, RUTA_AUTOMATIZACIONES);
      await tarjetaDeAutomatizacion(c, "recordatorio").getByRole("button", { name: "Apagar", exact: true }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-automatizaciones-aviso-encendida",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al encender una automatización apagada (el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/automatizaciones",
    fuentes: [AUTOMATIZACIONES, AVISOS],
    completa: false,
    ir: async (c) => {
      await reescribirGet(c, "/api/automatizaciones", (cuerpo) => ({ ...cuerpo, datos: cuerpo.datos.map((a: Json) => (a.id === c.mundo.mensajeria.automatizaciones.recordatorio.id ? { ...a, activo: false } : a)) }));
      await simularEscritura(c, /^\/api\/automatizaciones\/[^/]+$/);
      await irA(c, RUTA_AUTOMATIZACIONES);
      await tarjetaDeAutomatizacion(c, "recordatorio").getByRole("button", { name: "Encender", exact: true }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-bandeja-aviso-hecha",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al marcar atendido un evento de la bandeja («Listo: quedó atendido…»; el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/bandeja",
    fuentes: [BANDEJA, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/tareas\/[^/]+$/);
      await irA(c, RUTA_BANDEJA);
      await c.page.getByTestId(`evento-${c.mundo.mensajeria.evento.id}`).getByRole("button", { name: "Marcar atendido", exact: true }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-bandeja-aviso-descartada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al descartar una tarea sin lead («Se descartó: ya no aparece…»; el cambio se simula)",
    tipo: "flotante",
    ruta: "/admin/bandeja",
    fuentes: [BANDEJA, AVISOS],
    completa: false,
    ir: async (c) => {
      await simularEscritura(c, /^\/api\/tareas\/[^/]+$/);
      await irA(c, RUTA_BANDEJA);
      await c.page.getByTestId(`tarea-${c.mundo.mensajeria.tareaSinLead.id}`).getByRole("button", { name: "Descartar", exact: true }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },

  // Las tres que escriben de verdad, con valores iguales a los actuales (al final del archivo).
  {
    id: "admins-usuarios-aviso-guardado",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al guardar los cambios de un usuario sin cambiar nada («Los cambios de … se guardaron.»)",
    tipo: "flotante",
    ruta: "/admin/usuarios",
    fuentes: [USUARIOS, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirEnTarjeta(c, "Editar");
      await pulsar(c, "Guardar");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-automatizaciones-aviso-guardada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Aviso «ya quedó» al guardar el ajuste de una automatización sin cambiar nada («quedó guardada. Vale para los avisos que se programen…»)",
    tipo: "flotante",
    ruta: "/admin/automatizaciones",
    fuentes: [AUTOMATIZACIONES, AVISOS],
    completa: false,
    ir: async (c) => {
      await abrirAjuste(c, "recordatorio");
      await pulsar(c, "Guardar");
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "admins-configuracion-guardada",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Configuración después de guardar sin cambiar nada: el aviso «Configuración guardada.» sobre el botón",
    tipo: "formulario",
    ruta: "/admin/configuracion",
    fuentes: [CONFIGURACION],
    ir: async (c) => {
      await irA(c, RUTA_CONFIGURACION);
      await c.page.getByRole("button", { name: "Guardar la configuración" }).click();
      await c.page.getByText("Configuración guardada.").waitFor();
      await alInicio(c);
      await esperarListo(c.page);
    },
  },
];
