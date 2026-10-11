// Escenas del área Maestro (celular sobre todo): «Hoy», el registro del alumno de la clase muestra (con salud y reglamento), el pase de lista, la lista de alumnos, el expediente y la salud
// de un alumno, tal como los ve el rol maestro. Ninguna escena escribe en la base: lo que se vería después de guardar se simula respondiendo la petición desde el navegador (las
// escrituras que se dejan pasar son solo las que el servidor rechaza). Las lecturas «fabricadas» (un registro con datos, un registro cerrado, una clase que ya se marcó) se arman
// parchando la respuesta real de la API, así el estado no depende de lo que otras escenas hayan hecho.

import type { Page, Route } from "@playwright/test";
import { ventanaDelAltoDeLaPagina, conCargando, conError, conMuchosDatos, conVacio, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena } from "./escenas.ts";

const G = "Maestro";
const HOY = ["web/src/pantallas/maestro/Hoy.tsx", "web/src/pantallas/maestro/BotonesDeAsistencia.tsx"];
const REGISTRO = ["web/src/pantallas/maestro/RegistroClase.tsx", "web/src/pantallas/maestro/BotonesDeAsistencia.tsx", "web/src/pantallas/maestro/formulario.ts", "web/src/pantallas/maestro/tipos.ts"];
const SALUD_REGISTRO = [...REGISTRO, "web/src/salud/FormularioSalud.tsx", "web/src/salud/etiquetas.ts"];
const LEGAL = [...REGISTRO, "web/src/pantallas/maestro/Aceptaciones.tsx"];
const PASE = ["web/src/pantallas/maestro/PaseDeLista.tsx"];
const ALUMNOS = ["web/src/pantallas/familia/AlumnosLista.tsx"];
const EXPEDIENTE = ["web/src/pantallas/familia/Expediente.tsx"];
const SALUD = ["web/src/pantallas/familia/SaludDelAlumno.tsx", "web/src/salud/VistaDeSalud.tsx"];
const CIERRE = [...HOY, "web/src/pantallas/conversion/CierreEnSitio.tsx"];

// ─── Ayudas propias ─────────────────────────────────────────────────────────────────────────

type Json = any;  
const esApi = (u: URL): boolean => u.pathname.startsWith("/api/");
const colgar = (): Promise<void> => new Promise<void>(() => undefined);
const reposo = (page: Page, ms = 250): Promise<void> => page.waitForTimeout(ms);

/** `AAAA-MM-DD` de hace `dias` días en la zona de las sucursales de prueba. */
function fechaMx(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - dias * 86_400_000));
}

/** Parcha la respuesta (JSON) de las peticiones GET que cumplan `coincide`; el resto de métodos pasa tal cual. */
async function parchearGet(c: Contexto, coincide: (u: URL) => boolean, parche: (cuerpo: Json) => Json): Promise<void> {
  await c.page.route(
    (u) => esApi(u) && coincide(u),
    async (r: Route) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      if (!resp.ok()) return r.fulfill({ response: resp });
      const cuerpo = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify(parche(cuerpo)) });
    },
  );
}

/** Responde desde el navegador a las escrituras (no-GET) que cumplan `coincide`, sin tocar el servidor. */
async function simularEscritura(c: Contexto, coincide: (u: URL) => boolean, estado: number, cuerpo: Json): Promise<void> {
  await c.page.route(
    (u) => esApi(u) && coincide(u),
    (r: Route) => (r.request().method() === "GET" ? r.fallback() : r.fulfill({ status: estado, contentType: "application/json", body: JSON.stringify(cuerpo) })),
  );
}

/** Las escrituras que cumplan `coincide` nunca terminan (se ve «Procesando…»). */
async function colgarEscritura(c: Contexto, coincide: (u: URL) => boolean): Promise<void> {
  await c.page.route(
    (u) => esApi(u) && coincide(u),
    (r: Route) => (r.request().method() === "GET" ? r.fallback() : colgar()),
  );
}

/** Un error del servidor con el cuerpo de la API (código, mensaje y detalles por campo). */
const errorApi = (mensaje: string, detalles: { campo?: string; mensaje: string }[] = []): Json => ({ error: { codigo: "error", mensaje, detalles } });

const idClase = (c: Contexto): string => c.mundo.maestro.clase.id;
const rutaRegistro = (id: string): string => `/clases/${id}/registro`;
const esRegistro = (id: string) => (u: URL): boolean => u.pathname === `/api/clases-muestra/${id}/registro`;
const esClase = (id: string) => (u: URL): boolean => u.pathname === `/api/clases-muestra/${id}`;
const esAceptaciones = (u: URL): boolean => /\/api\/clases-muestra\/[^/]+\/registro\/aceptaciones$/.test(u.pathname);

// ── Registros fabricados ──

const TUTORES_DE_REGISTRO = [
  { id: "00000000-0000-4000-8000-0000000000a1", nombre: "Rosa", apellidos: "Mena", parentesco: "madre", telefono: "+525512345678", correo: "rosa@correo.test", es_responsable_pago: true, lo_lleva: true, puede_recoger: true },
  { id: "00000000-0000-4000-8000-0000000000a2", nombre: "Luis", apellidos: null, parentesco: "tío", telefono: "+525598765432", correo: null, es_responsable_pago: false, lo_lleva: false, puede_recoger: true },
];

/** Un registro con todos los datos capturados (borrador, falta la salud completa y el reglamento). */
function conDatos(c: Contexto, extra: Json = {}): (r: Json) => Json {
  return (r) => ({
    ...r,
    existe: true,
    id: r.id ?? "00000000-0000-4000-8000-0000000000b1",
    estatus: "borrador",
    alumno: { nombre: "Alumna", apellidos: "Uno", fecha_nacimiento: "2018-05-04", sexo: "femenino", escuela: "Escuela de prueba", turno_escolar: "matutino", talla_uniforme: "8" },
    tutores: TUTORES_DE_REGISTRO,
    antecedentes: { practico_antes: true, practico_donde: "Escuela X", practico_nivel: "Intermedio", motivo_clase: "otro", motivo_clase_detalle: "Se lo recomendó una amiga" },
    observacion: { asistio: true, nivel_observado: "Básico", grupo_recomendado_id: c.mundo.grupos.a.id, interes_percibido: "alto", notas: "Muy atenta y con ganas de aprender" },
    salud: { contacto_registrado: true, completa: false, faltantes: ["salud.autorizacion_atencion_medica"], puedes_ver_valores: true },
    faltantes: ["salud.autorizacion_atencion_medica", "reglamento"],
    actualizado_en: new Date().toISOString(),
    ...extra,
  });
}
const completo = (c: Contexto) => conDatos(c, { estatus: "completo", faltantes: [], salud: { contacto_registrado: true, completa: true, faltantes: [], puedes_ver_valores: true }, completo_en: new Date().toISOString() });
const cerrado = (c: Contexto) => conDatos(c, { estatus: "cerrado", faltantes: [], salud: { contacto_registrado: true, completa: true, faltantes: [], puedes_ver_valores: true }, completo_en: new Date().toISOString(), cerrado_en: new Date().toISOString() });

async function irARegistro(c: Contexto, id = idClase(c), parche?: (r: Json) => Json, parcheClase?: (cl: Json) => Json): Promise<void> {
  if (parche) await parchearGet(c, esRegistro(id), parche);
  if (parcheClase) await parchearGet(c, esClase(id), parcheClase);
  await irA(c, rutaRegistro(id));
}

/** Cierra todas las secciones del registro y deja abierta solo la que se pide (o ninguna, o todas). */
async function secciones(page: Page, abiertas: string[] | "todas"): Promise<void> {
  await page.evaluate((cuales) => {
    document.querySelectorAll<HTMLDetailsElement>("details[data-prueba^='seccion-']").forEach((d) => {
      const id = d.getAttribute("data-prueba")!.replace("seccion-", "");
      d.open = cuales === "todas" || cuales.includes(id);
    });
  }, abiertas);
  await reposo(page, 150);
}

const seccion = (page: Page, id: string) => page.getByTestId(`seccion-${id}`);
const guardarSeccion = (page: Page, id: string) => seccion(page, id).getByRole("button", { name: /Guardar esta sección|Reintentar guardado/ });
async function esperarDialogo(page: Page): Promise<void> {
  await page.locator("dialog[open]").waitFor();
  await reposo(page, 200);
}

/** Escribe algo en «Nombre» del alumno para que haya cambios sin guardar. */
async function ensuciarAlumno(page: Page, texto = "Alumna Editada"): Promise<void> {
  await seccion(page, "alumno").getByLabel("Nombre", { exact: false }).first().fill(texto);
  await reposo(page, 150);
}

// ── Hoy ──

const aviso = (tipo: "agendada" | "reprogramada" | "cancelada", i: number, datos: Json): Json => ({ id: `00000000-0000-4000-8000-0000000001${i}0`, tipo, leido_en: null, datos });
const AVISOS = [
  aviso("agendada", 1, { nombre_alumno: "Alumna Uno", nombre_grupo: "Grupo A", nombre_sucursal: "Norte", fecha_clase: "2026-10-14", hora_clase: "17:00" }),
  aviso("reprogramada", 2, { nombre_alumno: "Alumno Dos", nombre_grupo: "Grupo A", fecha_clase: "2026-10-16", hora_clase: "18:00", fecha_anterior: "2026-10-15" }),
  aviso("cancelada", 3, { nombre_alumno: "Alumno Tres", nombre_grupo: "Grupo A", fecha_clase: "2026-10-12", hora_clase: "16:00" }),
];
const esAvisos = (u: URL): boolean => u.pathname === "/api/maestro/avisos";
const esClasesDelMaestro = (u: URL): boolean => u.pathname === "/api/maestro/clases-muestra";
const conAvisos = (c: Contexto): Promise<void> => parchearGet(c, esAvisos, (b) => ({ ...b, datos: AVISOS, paginacion: { ...(b.paginacion ?? {}), total: AVISOS.length, pagina: 1 } }));
const conEstatusDeLaClase = (c: Contexto, estatus: string): Promise<void> => parchearGet(c, esClasesDelMaestro, (b) => ({ ...b, datos: b.datos.map((x: Json) => (x.id === idClase(c) ? { ...x, estatus, asistencia_marcada_en: new Date().toISOString() } : x)) }));
/** El modo de cierre «el maestro inscribe en sitio» (lo dice `/api/yo`). */
async function conCierreEnSitio(c: Contexto): Promise<void> {
  await c.page.route(
    (u) => u.pathname === "/api/yo",
    async (r: Route) => {
      const resp = await r.fetch();
      const yo = (await resp.json()) as Json;
      yo.configuracion = { ...yo.configuracion, modo_cierre: "maestro_en_sitio" };
      return r.fulfill({ response: resp, body: JSON.stringify(yo) });
    },
  );
}
const esConversion = (u: URL): boolean => /^\/api\/leads\/[^/]+\/conversion$/.test(u.pathname);
/** La vista de conversión que ve «Inscribir ahora» (el servidor de pruebas cierra con el asesor, así que se arma aquí): lista, o con lo que todavía falta. */
async function simularConversion(c: Contexto, listo: boolean): Promise<void> {
  await c.page.route(
    (u) => esConversion(u),
    (r: Route) => {
      const leadId = r.request().url().split("/leads/")[1]!.split("/")[0]!;
      const p = `prospectos.00000000-0000-4000-8000-0000000000c1`;
      const vista = {
        lead_id: leadId,
        listo,
        ya_convertido: false,
        faltantes: listo ? [] : [{ campo: `${p}.grupo_id` }, { campo: `${p}.reglamento` }],
        prospectos: [{ prospecto_id: "00000000-0000-4000-8000-0000000000c1", ya_convertido: false }],
        previsiones: [{ prospecto_id: "00000000-0000-4000-8000-0000000000c1", hermanos_previstos: 0, reglamento_pendiente: !listo, grupo_nombre: c.mundo.grupos.a.nombre }],
      };
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(vista) });
    },
  );
}
const tarjetaDeClase = (c: Contexto) => c.page.getByTestId(`clase-${idClase(c)}`);

// ── R4b: color de la disciplina y línea de tiempo ──
const esVerticales = (u: URL): boolean => u.pathname === "/api/verticales";
/** Las disciplinas con su `color_marca` (el de prueba no tiene): la banda, el punto de la etiqueta y los avatares toman el color del dato. */
const conColorDeDisciplina = (c: Contexto, color = "#c7522a"): Promise<void> => parchearGet(c, esVerticales, (b) => ({ ...b, datos: (b.datos as Json[]).map((v) => ({ ...v, color_marca: color })) }));
const hhmmEnZona = (ms: number, zona: string): string => new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
/** Las clases de hoy a `minutos` del reloj (negativo: ya empezó), con la hora que dice la sucursal; la primera es la de la prueba y las demás son copias suyas. */
async function conClasesDeHoy(c: Contexto, plan: { minutos: number; estatus?: string; prospecto?: string }[], palanca?: { estatus?: string }): Promise<void> {
  await parchearGet(c, esClasesDelMaestro, (b) => {
    const base = b.datos.find((x: Json) => x.id === idClase(c)) ?? b.datos[0];
    const ahora = Date.now();
    const datos = plan.map((p, i) => {
      const cuando = Math.floor((ahora + p.minutos * 60_000) / 60_000) * 60_000;
      return { ...base, id: i === 0 ? base.id : `${base.id}-hoy-${i}`, prospecto: p.prospecto ?? base.prospecto, estatus: (i === 0 ? palanca?.estatus : undefined) ?? p.estatus ?? "agendada", fecha_hora: new Date(cuando).toISOString(), sesion: { ...base.sesion, hora: hhmmEnZona(cuando, base.zona_horaria) } };
    });
    return { ...b, datos, paginacion: { ...(b.paginacion ?? {}), total: datos.length, pagina: 1 } };
  });
}

// ── Pase de lista ──

const esPase = (u: URL): boolean => /^\/api\/grupos\/[^/]+\/pase$/.test(u.pathname);
const alumnoDelPase = (page: Page, nombre: string) => page.getByRole("group", { name: nombre });
/** Por omisión, un día pasado de hace dos días (el grupo da clase todos los días): «hoy» depende de la hora a la que se corra y puede salir «todavía no empieza». */
async function irAPase(c: Contexto, fecha: string = fechaMx(2)): Promise<void> {
  await irA(c, "/pase");
  await c.page.getByLabel("Fecha de la clase").fill(fecha);
  await esperarListo(c.page);
}

// ── Alumnos ──
const alumnoPropio = (c: Contexto) => c.mundo.maestro.alumnosDelPase[0]!;
const alumnoAjeno = (c: Contexto) => c.mundo.familia.rivera.hijos[0]!;

const ESCENAS_BASE: Escena[] = [
  // ═══════════════════════════ HOY ═══════════════════════════
  {
    id: "maestro-hoy-con-clases",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, con una clase muestra que ya empezó (asistencia habilitada) y otra dentro de unos días (asistencia apagada con su texto)",
    tipo: "pantalla",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-avisos",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, con el cuadro «Avisos nuevos» (clase agendada, reprogramada y cancelada) y su botón «Visto»",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conAvisos(c);
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-aviso-visto-error",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, al tocar «Visto» el servidor falla: el error queda dentro del cuadro de avisos",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conAvisos(c);
      await irA(c, "/hoy");
      await simularEscritura(c, (u) => u.pathname.startsWith("/api/maestro/avisos/"), 500, errorApi("Algo salió mal en el servidor. Inténtalo de nuevo."));
      await c.page.getByRole("button", { name: "Visto" }).first().click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-hoy-sin-clases",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, sin clases muestra en estos días",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: (c) => conVacio(c, "/hoy"),
  },
  {
    id: "maestro-hoy-muchas-clases",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, muy cargado: muchas clases muestra repetidas",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: (c) => conMuchosDatos(c, "/hoy", 8),
  },
  {
    id: "maestro-hoy-cargando",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, cargando",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: (c) => conCargando(c, "/hoy"),
  },
  {
    id: "maestro-hoy-error",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, con error de carga",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: (c) => conError(c, "/hoy"),
  },
  {
    id: "maestro-hoy-estatus-variados",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, clases en cada estatus (agendada, asistió, no asistió, reagendada, cancelada)",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      const estatus = ["agendada", "asistio", "no_asistio", "reagendada", "cancelada"];
      await parchearGet(c, esClasesDelMaestro, (b) => {
        const base = b.datos.find((x: Json) => x.id === idClase(c)) ?? b.datos[0];
        return { ...b, datos: estatus.map((e, i) => ({ ...base, id: `${base.id}-estatus-${i}`, estatus: e, prospecto: `Alumno ${e.replace("_", " ")}` })) };
      });
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-clase-asistio",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, la clase ya marcada «Asistió»: botón elegido con palomita y «Listo para cerrar la inscripción»",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await conEstatusDeLaClase(c, "asistio");
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-clase-no-asistio",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, la clase ya marcada «No asistió»",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await conEstatusDeLaClase(c, "no_asistio");
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-asistencia-procesando",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, tocó «Asistió» y la petición sigue en curso («Procesando…» solo en ese botón)",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await irA(c, "/hoy");
      await colgarEscritura(c, (u) => u.pathname.endsWith("/asistencia"));
      await tarjetaDeClase(c).getByRole("button", { name: "Asistió", exact: true }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-hoy-asistencia-error",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, marcar la asistencia falla en el servidor",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await irA(c, "/hoy");
      await simularEscritura(c, (u) => u.pathname.endsWith("/asistencia"), 409, errorApi("La asistencia se marca desde la hora de la clase."));
      await tarjetaDeClase(c).getByRole("button", { name: "No asistió" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-hoy-sin-red",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, sin señal: al tocar «Asistió» no hay conexión",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await irA(c, "/hoy");
      await cortarLaRed(c);
      await tarjetaDeClase(c).getByRole("button", { name: "Asistió", exact: true }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-hoy-listo-para-cerrar",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, tras «Listo para cerrar la inscripción»: el aviso verde de que el asesor lo recibió",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await conEstatusDeLaClase(c, "asistio");
      await simularEscritura(c, (u) => u.pathname.endsWith("/listo-para-cerrar"), 201, {});
      await irA(c, "/hoy");
      await tarjetaDeClase(c).getByRole("button", { name: "Listo para cerrar la inscripción" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-hoy-cierre-en-sitio-falta",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, con el modo «el maestro inscribe en sitio»: «Inscribir ahora» dice lo que todavía falta (botón apagado)",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: CIERRE,
    ir: async (c) => {
      await conCierreEnSitio(c);
      await simularConversion(c, false);
      await conEstatusDeLaClase(c, "asistio");
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-cierre-en-sitio-listo",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, modo «inscribe en sitio» con todo capturado: «Inscribir a mi alumno» habilitado",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: CIERRE,
    ir: async (c) => {
      await conCierreEnSitio(c);
      await simularConversion(c, true);
      await conEstatusDeLaClase(c, "asistio");
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-cierre-en-sitio-confirmar",
    rol: "maestro",
    grupo: G,
    titulo: "Diálogo «Inscribir a …» (confirma el grupo, sin importes)",
    tipo: "flotante",
    ruta: "/hoy",
    fuentes: CIERRE,
    ir: async (c) => {
      await conCierreEnSitio(c);
      await simularConversion(c, true);
      await conEstatusDeLaClase(c, "asistio");
      await irA(c, "/hoy");
      await c.page.getByRole("button", { name: "Inscribir a mi alumno" }).first().click();
      await esperarDialogo(c.page);
    },
  },
  {
    id: "maestro-hoy-cierre-en-sitio-grupo-lleno",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, al inscribir el grupo ya no tiene lugares: aviso con «Avisar al asesor»",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: CIERRE,
    ir: async (c) => {
      await conCierreEnSitio(c);
      await simularConversion(c, true);
      await conEstatusDeLaClase(c, "asistio");
      await irA(c, "/hoy");
      await simularEscritura(c, (u) => u.pathname.endsWith("/convertir"), 409, errorApi("El grupo ya no tiene lugares", [{ campo: "motivo", mensaje: "grupo_lleno" }]));
      await c.page.getByRole("button", { name: "Inscribir a mi alumno" }).first().click();
      await esperarDialogo(c.page);
      await c.page.locator("dialog[open]").getByRole("button", { name: "Sí, inscribir" }).click();
      await c.page.locator("dialog[open]").waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
      await reposo(c.page, 400);
    },
  },

  // ═══════════════════════════ REGISTRO DEL ALUMNO ═══════════════════════════
  {
    id: "maestro-registro-vacio",
    rol: "maestro",
    grupo: G,
    titulo: "Registro del alumno de una clase futura, sin nada capturado (lista de lo que falta; asistencia apagada con su texto)",
    tipo: "pantalla",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: (c) => irARegistro(c, c.mundo.maestro.claseFutura.id),
  },
  {
    id: "maestro-registro-vacio-todo-abierto",
    rol: "maestro",
    grupo: G,
    titulo: "Registro vacío con todas las secciones abiertas (alumno, adultos, salud, antecedentes, observación, reglamento)",
    tipo: "pantalla",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c, c.mundo.maestro.claseFutura.id);
      await secciones(c.page, "todas");
    },
  },
  {
    id: "maestro-registro-clase-empezada",
    rol: "maestro",
    grupo: G,
    titulo: "Registro de la clase que ya empezó: «Asistió» y «No asistió» habilitados",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: (c) => irARegistro(c),
  },
  {
    id: "maestro-registro-asistio",
    rol: "maestro",
    grupo: G,
    titulo: "Registro con la clase ya marcada «Asistió»",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: (c) => irARegistro(c, idClase(c), undefined, (cl) => ({ ...cl, estatus: "asistio" })),
  },
  {
    id: "maestro-registro-no-asistio",
    rol: "maestro",
    grupo: G,
    titulo: "Registro con la clase ya marcada «No asistió»",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: (c) => irARegistro(c, idClase(c), undefined, (cl) => ({ ...cl, estatus: "no_asistio" })),
  },
  {
    id: "maestro-registro-asistencia-error",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, marcar la asistencia falla en el servidor",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await simularEscritura(c, (u) => u.pathname.endsWith("/asistencia"), 409, errorApi("La asistencia se marca desde la hora de la clase."));
      await c.page.getByRole("button", { name: "Asistió", exact: true }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-con-datos",
    rol: "maestro",
    grupo: G,
    titulo: "Registro con todo capturado (borrador): secciones con su insignia, faltantes y barra «Todo guardado»",
    tipo: "pantalla",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, "todas");
    },
  },
  {
    id: "maestro-registro-seccion-alumno",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Alumno abierta con datos",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["alumno"]);
    },
  },
  {
    id: "maestro-registro-seccion-adultos",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección «Adultos de la familia» abierta con dos adultos",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["tutores"]);
    },
  },
  {
    id: "maestro-registro-seccion-salud",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección «Salud y seguridad» abierta (ya hay datos guardados que no se muestran: pide el motivo para verlos)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["salud"]);
    },
  },
  {
    id: "maestro-registro-seccion-antecedentes",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Antecedentes abierta («Sí» practicó, motivo «Otro» con su detalle)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["antecedentes"]);
    },
  },
  {
    id: "maestro-registro-seccion-observacion",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección «Observación del maestro» abierta con datos",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["observacion"]);
    },
  },
  {
    id: "maestro-registro-seccion-reglamento",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección «Reglamento y autorización de imagen» abierta (sin respuesta; quién responde y cómo)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["legal"]);
    },
  },

  // ── Validación y errores de cada sección ──
  {
    id: "maestro-registro-alumno-error-fecha",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Alumno: fecha de nacimiento futura al guardar (error junto al campo)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["alumno"]);
      await seccion(c.page, "alumno").getByLabel("Fecha de nacimiento (del acta)").fill(fechaMx(-400));
      await seccion(c.page, "alumno").getByLabel("Nombre", { exact: false }).first().fill("Alumna");
      await guardarSeccion(c.page, "alumno").click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-alumno-error-servidor",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Alumno: el servidor rechaza el guardado (aviso rojo y «Reintentar guardado»)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["alumno"]);
      await ensuciarAlumno(c.page, "Alumna");
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await guardarSeccion(c.page, "alumno").click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-alumno-sin-red",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Alumno guardada sin señal: «No hay conexión… Lo que escribiste sigue aquí»",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["alumno"]);
      await ensuciarAlumno(c.page, "Alumna");
      await cortarLaRed(c);
      await guardarSeccion(c.page, "alumno").click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-registro-adultos-fila-nueva",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Adultos: «Agregar adulto» deja una fila vacía (cambios sin guardar)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["tutores"]);
      await seccion(c.page, "tutores").getByRole("button", { name: "Agregar adulto" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-adultos-error",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Adultos: fila vacía y otra con teléfono corto y correo malo al guardar (errores por campo)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["tutores"]);
      const s = seccion(c.page, "tutores");
      await s.getByRole("button", { name: "Agregar adulto" }).click();
      await s.getByRole("button", { name: "Agregar adulto" }).click();
      const a2 = c.page.getByTestId("adulto-1");
      await a2.getByLabel("Nombre", { exact: false }).first().fill("Luis");
      await a2.getByLabel("Teléfono").fill("123");
      await a2.getByLabel("Correo").fill("correo-malo");
      await a2.getByLabel("Es el responsable de pago").check();
      await guardarSeccion(c.page, "tutores").click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-antecedentes-si-practico",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Antecedentes vacía y luego «Sí» practicó antes (aparecen dónde y nivel) con motivo «Otro»",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["antecedentes"]);
      const s = seccion(c.page, "antecedentes");
      await s.getByRole("radio", { name: "Sí" }).check();
      await s.getByLabel("¿Por qué quiere tomar la clase?").selectOption("otro");
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-antecedentes-error",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Antecedentes: detalle del motivo sin el motivo «Otro» al guardar (el error cae en un campo que ya no se ve: solo queda «Cambios sin guardar»)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["antecedentes"]);
      const s = seccion(c.page, "antecedentes");
      await s.getByLabel("¿Por qué quiere tomar la clase?").selectOption("otro");
      await s.getByLabel("Cuéntanos el motivo").fill("Se lo recomendó una amiga");
      await s.getByLabel("¿Por qué quiere tomar la clase?").selectOption("disciplina");
      await guardarSeccion(c.page, "antecedentes").click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-observacion-error-servidor",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sección Observación: el servidor rechaza una nota con datos de salud (error en el campo «Notas del maestro»)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["observacion"]);
      const s = seccion(c.page, "observacion");
      await s.getByLabel("Notas del maestro").fill("Tiene alergia al polvo");
      await simularEscritura(c, esRegistro(idClase(c)), 400, errorApi("Los datos enviados no son válidos", [{ campo: "observacion.notas", mensaje: "No anotes datos de salud aquí: van en su sección de salud" }]));
      await guardarSeccion(c.page, "observacion").click();
      await reposo(c.page);
    },
  },

  // ── Salud y seguridad (FormularioSalud) ──
  {
    id: "maestro-registro-salud-primera-vez",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud y seguridad sin ficha todavía (formulario vacío, «Ficha incompleta»)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["salud"]);
    },
  },
  {
    id: "maestro-registro-salud-error-sin-cambios",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud: «Guardar salud y seguridad» sin tocar nada («No cambiaste nada de esta sección»)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["salud"]);
      await c.page.getByRole("button", { name: "Guardar salud y seguridad" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-salud-error-contacto",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud: contacto de emergencia incompleto (nombre sin teléfono válido) al guardar",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["salud"]);
      const s = seccion(c.page, "salud");
      await s.getByLabel("Nombre del contacto").fill("Marta Pérez");
      await s.getByLabel("Teléfono del contacto").fill("123");
      await s.getByRole("button", { name: "Guardar salud y seguridad" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-salud-error-mismo-adulto",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud: el contacto de emergencia es uno de los adultos del registro (error junto al nombre)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c, { salud: { contacto_registrado: false, completa: false, faltantes: ["salud.alergias", "salud.condiciones_medicas", "salud.medicamentos", "salud.contacto_emergencia", "salud.autorizacion_atencion_medica"], puedes_ver_valores: true } }));
      await secciones(c.page, ["salud"]);
      const s = seccion(c.page, "salud");
      await s.getByLabel("Nombre del contacto").fill("Rosa Mena");
      await s.getByLabel("Teléfono del contacto").fill("5511112222");
      await s.getByRole("button", { name: "Guardar salud y seguridad" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-salud-escrita",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud: formulario escrito a medias (sin guardar), con datos ficticios",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["salud"]);
      const s = seccion(c.page, "salud");
      await s.getByLabel("Alergias").fill("Ninguna");
      await s.getByLabel("Condiciones médicas").fill("Ninguna");
      await s.getByLabel("Medicamentos").fill("Ninguno");
      await s.getByLabel("Nombre del contacto").fill("Marta Pérez");
      await s.getByLabel("Teléfono del contacto").fill("5511112222");
      await s.getByLabel("Parentesco o relación (opcional)").fill("tía");
      await s.getByRole("radio", { name: "Sí" }).check();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-salud-error-servidor",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud: el servidor falla al guardar",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["salud"]);
      const s = seccion(c.page, "salud");
      await s.getByLabel("Alergias").fill("Ninguna");
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await s.getByRole("button", { name: "Guardar salud y seguridad" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-salud-motivo-corto",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud con datos guardados: motivo de la consulta demasiado corto («Ver lo registrado» apagado)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["salud"]);
      await seccion(c.page, "salud").getByLabel("Motivo de la consulta").fill("a");
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-salud-ver-registrado",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud: «Ver lo registrado» con el motivo por omisión (datos ficticios en los campos y «Ocultar lo registrado»)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname.startsWith("/api/salud/prospecto/"),
        (r: Route) =>
          r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ existe: true, campos: { alergias: "Ninguna", condiciones_medicas: "Ninguna", medicamentos: "Ninguno", contacto_emergencia: { nombre: "Marta Pérez", telefono: "+525511112222", parentesco: "tía" }, autorizacion_atencion_medica: true } }),
          }),
      );
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["salud"]);
      await seccion(c.page, "salud").getByRole("button", { name: "Ver lo registrado" }).click();
      await seccion(c.page, "salud").getByRole("button", { name: "Ocultar lo registrado" }).waitFor();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-salud-ver-error",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud: «Ver lo registrado» falla (error bajo el motivo)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname.startsWith("/api/salud/prospecto/"),
        (r: Route) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(errorApi("Algo salió mal en el servidor. Inténtalo de nuevo.")) }),
      );
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["salud"]);
      await seccion(c.page, "salud").getByRole("button", { name: "Ver lo registrado" }).click();
      await reposo(c.page);
    },
  },

  // ── Reglamento y autorización de imagen (Aceptaciones) ──
  {
    id: "maestro-registro-reglamento-texto",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Reglamento: «Leer el texto que se le muestra a la familia» desplegado",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["legal"]);
      await c.page.getByTestId("documento-reglamento").getByText("Leer el texto que se le muestra a la familia").click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-reglamento-otra-persona",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Reglamento: «Otra persona» responde (nombre y parentesco; «Aceptan» apagado hasta escribir el nombre)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["legal"]);
      await c.page.getByTestId("documento-reglamento").getByLabel("¿Quién responde?").selectOption("otra");
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-reglamento-aceptado",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Reglamento aceptado y autorización de imagen aceptada (con «Revocar autorización»)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await parchearGet(c, esAceptaciones, (b) => ({
        ...b,
        estado: (b.estado as Json[]).map((e) => ({ ...e, estado: "aceptada", version_aceptada: e.version_vigente ?? 1, al_corriente: true, texto: "Rosa Mena aceptó el documento (en persona)." })),
      }));
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["legal"]);
    },
  },
  {
    id: "maestro-registro-reglamento-rechazado",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Reglamento rechazado y autorización de imagen revocada",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await parchearGet(c, esAceptaciones, (b) => ({
        ...b,
        estado: (b.estado as Json[]).map((e) => ({ ...e, estado: e.tipo === "reglamento" ? "rechazada" : "revocada", al_corriente: false, texto: "La familia no aceptó el documento." })),
      }));
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["legal"]);
    },
  },
  {
    id: "maestro-registro-reglamento-error",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Reglamento: «Aceptan» falla en el servidor (error bajo los botones)",
    tipo: "formulario",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["legal"]);
      await simularEscritura(c, (u) => u.pathname.endsWith("/registro/aceptaciones"), 409, errorApi("El registro está cerrado: ya no se editan las aceptaciones."));
      await c.page.getByTestId("documento-reglamento").getByRole("button", { name: "Aceptan", exact: true }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-reglamento-sin-documentos",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Reglamento sin documentos vigentes (aviso: pídele al administrador que los publique)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await parchearGet(c, (u) => u.pathname === "/api/documentos-legales/vigentes", (b) => ({ ...b, datos: [] }));
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["legal"]);
    },
  },
  {
    id: "maestro-registro-reglamento-cargando",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Reglamento cargando",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await c.page.route((u) => esAceptaciones(u), (r: Route) => (r.request().method() === "GET" ? colgar() : r.fallback()));
      await c.page.goto(rutaRegistro(idClase(c)));
      await c.page.getByTestId("seccion-legal").waitFor();
      await secciones(c.page, ["legal"]);
    },
  },
  {
    id: "maestro-registro-reglamento-error-carga",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Reglamento con error de carga (con «Reintentar»)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: LEGAL,
    ir: async (c) => {
      await c.page.route((u) => esAceptaciones(u), (r: Route) => (r.request().method() === "GET" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(errorApi("Algo salió mal en el servidor. Inténtalo de nuevo.")) }) : r.fallback()));
      await irARegistro(c);
      await secciones(c.page, ["legal"]);
    },
  },

  // ── Barra de guardado ──
  {
    id: "maestro-registro-barra-sin-cambios",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, barra de guardado sin cambios («Todo guardado.» y «Guardar borrador» apagado)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    completa: false,
    ir: (c) => irARegistro(c, idClase(c), conDatos(c)),
  },
  {
    id: "maestro-registro-barra-con-cambios",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, barra de guardado con cambios («Tienes cambios sin guardar.») y la sección en «Sin guardar»",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    completa: false,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["alumno"]);
      await ensuciarAlumno(c.page);
    },
  },
  {
    id: "maestro-registro-barra-sin-red",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, sin señal: «Guardar borrador» muestra en la barra «No hay conexión… lo que escribiste sigue aquí»",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    completa: false,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["alumno"]);
      await ensuciarAlumno(c.page);
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: "Guardar borrador" }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-registro-barra-error-servidor",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, «Guardar borrador» con el servidor fallando: la barra dice qué sección revisar",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    completa: false,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["alumno"]);
      await ensuciarAlumno(c.page);
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await c.page.getByRole("button", { name: "Guardar borrador" }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-registro-barra-guardando",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, «Guardar borrador» en curso (botón con «Procesando…»)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    completa: false,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["alumno"]);
      await ensuciarAlumno(c.page);
      await colgarEscritura(c, esRegistro(idClase(c)));
      await c.page.getByRole("button", { name: "Guardar borrador" }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-registro-borrador-recuperado",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, borrador recuperado: se escribió algo, se salió a «Hoy» y se regresó («Recuperamos lo que habías escrito…»)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c);
      await secciones(c.page, ["alumno"]);
      await ensuciarAlumno(c.page, "Alumna Borrador");
      await c.page.getByRole("link", { name: /Volver a/ }).click();
      await c.page.getByRole("heading", { name: "Hoy", exact: true }).waitFor();
      await esperarListo(c.page);
      await tarjetaDeClase(c).getByRole("link", { name: "Registro del alumno" }).click();
      await c.page.getByText("Recuperamos lo que habías escrito").waitFor();
      await esperarListo(c.page);
    },
  },

  // ── Completar y cerrar ──
  {
    id: "maestro-registro-completar-error",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, «Marcar registro como completo» con faltantes que reporta el servidor (aviso amarillo con la lista)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await simularEscritura(c, (u) => u.pathname.endsWith("/registro/completar"), 409, errorApi("Todavía falta para completar el registro", [{ campo: "salud.autorizacion_atencion_medica", mensaje: "Falta" }, { campo: "reglamento", mensaje: "Falta" }]));
      await c.page.getByRole("button", { name: "Marcar registro como completo" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-completo",
    rol: "maestro",
    grupo: G,
    titulo: "Registro completo: sin faltantes y con el botón «Cerrar registro»",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: (c) => irARegistro(c, idClase(c), completo(c)),
  },
  {
    id: "maestro-registro-cerrar-confirmar",
    rol: "maestro",
    grupo: G,
    titulo: "Diálogo «¿Cerrar el registro?»",
    tipo: "flotante",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), completo(c));
      await c.page.getByRole("button", { name: "Cerrar registro" }).click();
      await esperarDialogo(c.page);
    },
  },
  {
    id: "maestro-registro-cerrar-error",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, «Sí, cerrar» rechazado porque falta el reglamento (aviso con la lista, tras cerrar el diálogo)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), completo(c));
      await simularEscritura(c, (u) => u.pathname.endsWith("/registro/cerrar"), 409, errorApi("No se puede cerrar el registro todavía", [{ campo: "reglamento", mensaje: "Falta" }]));
      await c.page.getByRole("button", { name: "Cerrar registro" }).click();
      await esperarDialogo(c.page);
      await c.page.locator("dialog[open]").getByRole("button", { name: "Sí, cerrar" }).click();
      await reposo(c.page, 400);
      await c.page.locator("dialog[open]").getByRole("button", { name: "Todavía no" }).click();
      await c.page.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => undefined);
      await reposo(c.page);
    },
  },
  {
    id: "maestro-registro-cerrado",
    rol: "maestro",
    grupo: G,
    titulo: "Registro cerrado (solo lectura): aviso «ya no se edita», campos apagados, sin barra de guardado ni «Reabrir»",
    tipo: "pantalla",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), cerrado(c), (cl) => ({ ...cl, estatus: "asistio" }));
      await secciones(c.page, ["alumno", "tutores", "salud"]);
    },
  },

  // ── Estados de carga de la pantalla ──
  {
    id: "maestro-registro-ajeno",
    rol: "maestro",
    grupo: G,
    titulo: "Registro de una clase de otro grupo por URL directa («No se pudo cargar… no se encontró»)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: (c) => irA(c, rutaRegistro(c.mundo.maestro.claseAjena.id)),
  },
  {
    id: "maestro-registro-cargando",
    rol: "maestro",
    grupo: G,
    titulo: "Registro del alumno, cargando",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: (c) => conCargando(c, rutaRegistro(idClase(c))),
  },
  {
    id: "maestro-registro-error-carga",
    rol: "maestro",
    grupo: G,
    titulo: "Registro del alumno, con error de carga (y «Reintentar»)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: (c) => conError(c, rutaRegistro(idClase(c))),
  },

  // ═══════════════════════════ PASE DE LISTA ═══════════════════════════
  {
    id: "maestro-pase-con-alumnos",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista de hoy, con los alumnos del grupo sin marcar",
    tipo: "pantalla",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await irAPase(c);
    },
  },
  {
    id: "maestro-pase-marcando",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista marcando: presente, falta y justificada (cambios sin guardar)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await irAPase(c);
      const lista = c.mundo.maestro.alumnosDelPase;
      await alumnoDelPase(c.page, lista[0]!.nombre).getByRole("radio", { name: "Presente" }).check();
      await alumnoDelPase(c.page, lista[1]!.nombre).getByRole("radio", { name: "Justificada" }).check();
      await alumnoDelPase(c.page, lista[2]!.nombre).getByRole("radio", { name: "Falta" }).check();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-pase-todos-presentes",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista tras «Marcar a todos presentes»",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await irAPase(c);
      await c.page.getByRole("button", { name: /Marcar a todos presentes/ }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-pase-guardado",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista guardado: aviso «Pase guardado» con el detalle y el aviso de faltas seguidas",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      const lista = c.mundo.maestro.alumnosDelPase;
      await irAPase(c);
      await c.page.getByRole("button", { name: /Marcar a todos presentes/ }).click();
      await alumnoDelPase(c.page, lista[2]!.nombre).getByRole("radio", { name: "Falta" }).check();
      await c.page.route(
        (u) => esPase(u),
        async (r: Route) => {
          if (r.request().method() !== "PUT") return r.fallback();
          const cuerpo = r.request().postDataJSON() as { asistencias: { inscripcion_id: string; estatus: string }[] };
          const estatusDe = new Map(cuerpo.asistencias.map((a) => [a.inscripcion_id, a.estatus]));
          const filas = lista.map((a) => ({ inscripcion_id: a.inscripcionId, alumno_id: a.alumnoId, alumno: a.nombre, activa: true, estatus: estatusDe.get(a.inscripcionId) ?? null, metodo: "manual" }));
          return r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ creadas: 3, actualizadas: 0, sin_cambio: 0, alertas: [{ inscripcion_id: lista[2]!.inscripcionId, racha_de_faltas: 3, umbral: 3, accion: "tarea_creada" }], lista: filas }),
          });
        },
      );
      await c.page.getByRole("button", { name: "Guardar pase de lista" }).click();
      await c.page.getByTestId("resultado-pase").waitFor();
      await reposo(c.page);
      // La barra de guardado es pegajosa: en la captura de página completa taparía el aviso. La ventana se alarga hasta el alto de la página para que quede en su lugar.
      await ventanaDelAltoDeLaPagina(c.page);
    },
  },
  {
    id: "maestro-pase-ya-tomado",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista de un día ya tomado («Pase ya tomado», «Guardar» apagado hasta que haya cambios)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      const lista = c.mundo.maestro.alumnosDelPase;
      const estatus = ["presente", "justificada", "falta"];
      await parchearGet(c, esPase, (p) => ({ ...p, pase_tomado: true, lista: lista.map((a, i) => ({ inscripcion_id: a.inscripcionId, alumno_id: a.alumnoId, alumno: a.nombre, activa: true, estatus: estatus[i], metodo: "manual" })) }));
      await irAPase(c);
    },
  },
  {
    id: "maestro-pase-error-servidor",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista, el servidor rechaza el guardado (error dentro de la barra fija; «tus marcas siguen aquí»)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await irAPase(c);
      await c.page.getByRole("button", { name: /Marcar a todos presentes/ }).click();
      await fallarLaSiguienteEscritura(c, 500, "Algo salió mal en el servidor. Inténtalo de nuevo.");
      await c.page.getByRole("button", { name: "Guardar pase de lista" }).click();
      await c.page.getByTestId("error-del-pase").waitFor();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-pase-sin-red",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista sin señal: «No se guardó nada todavía. Tus marcas siguen aquí…»",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await irAPase(c);
      await c.page.getByRole("button", { name: /Marcar a todos presentes/ }).click();
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: "Guardar pase de lista" }).click();
      await c.page.getByTestId("error-del-pase").waitFor();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-pase-guardando",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista, guardando (botón «Procesando…»)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await irAPase(c);
      await c.page.getByRole("button", { name: /Marcar a todos presentes/ }).click();
      await colgarEscritura(c, esPase);
      await c.page.getByRole("button", { name: "Guardar pase de lista" }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-pase-fecha-futura",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista de una fecha que todavía no llega («La clase de ese día todavía no empieza»; sin barra de guardado)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: (c) => irAPase(c, fechaMx(-1)),
  },
  {
    id: "maestro-pase-dia-sin-clase",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista de un día en que el grupo no da clase («Ese día este grupo no da clase. Elige otra fecha.»)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await parchearGet(c, esPase, (p) => ({ ...p, es_sesion: false, lista: [], problema: "no_es_sesion" }));
      await irAPase(c);
    },
  },
  {
    id: "maestro-pase-sin-alumnos",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista de un grupo sin alumnos inscritos en esa fecha",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await parchearGet(c, esPase, (p) => ({ ...p, lista: [], pase_tomado: false }));
      await irAPase(c);
    },
  },
  {
    id: "maestro-pase-alumno-dado-de-baja",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista con un alumno que «ya no está inscrito» (marca anterior conservada)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await parchearGet(c, esPase, (p) => ({ ...p, pase_tomado: true, lista: p.lista.map((f: Json, i: number) => (i === 2 ? { ...f, activa: false, estatus: "falta" } : f)) }));
      await irAPase(c);
    },
  },
  {
    id: "maestro-pase-sin-grupos",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista sin grupos activos («No tienes grupos activos»)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: (c) => conVacio(c, "/pase"),
  },
  {
    id: "maestro-pase-muchos-alumnos",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista con un grupo muy grande (alumnos repetidos)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await parchearGet(c, esPase, (p) => ({ ...p, lista: Array.from({ length: 12 }, (_, i) => (p.lista as Json[]).map((f) => ({ ...f, inscripcion_id: `${f.inscripcion_id}-copia-${i}`, alumno: i === 0 ? f.alumno : `${f.alumno} ${i + 1}` }))).flat() }));
      await irAPase(c);
    },
  },
  {
    id: "maestro-pase-cargando",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista, cargando",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: (c) => conCargando(c, "/pase"),
  },
  {
    id: "maestro-pase-error",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista, con error de carga",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: (c) => conError(c, "/pase"),
  },
  {
    id: "maestro-pase-lista-cargando",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista, los grupos ya cargaron y la lista del grupo sigue cargando («Cargando la lista…»)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await c.page.route((u) => esPase(u), (r: Route) => (r.request().method() === "GET" ? colgar() : r.fallback()));
      await c.page.goto("/pase");
      await c.page.getByText("Cargando la lista…").waitFor();
      await reposo(c.page);
    },
  },

  // ═══════════════════════════ ALUMNOS ═══════════════════════════
  {
    id: "maestro-alumnos-lista",
    rol: "maestro",
    grupo: G,
    titulo: "Alumnos, lista de SUS alumnos (sin teléfonos de la familia)",
    tipo: "pantalla",
    ruta: "/alumnos",
    fuentes: ALUMNOS,
    ir: (c) => irA(c, "/alumnos"),
  },
  {
    id: "maestro-alumnos-sin-resultados",
    rol: "maestro",
    grupo: G,
    titulo: "Alumnos, una búsqueda por nombre sin coincidencias",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Nombre del alumno").fill("Nadie Con Este Nombre");
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await esperarListo(c.page);
    },
  },
  {
    id: "maestro-alumnos-filtrados",
    rol: "maestro",
    grupo: G,
    titulo: "Alumnos, buscando un nombre y filtrando por estatus «Activos»",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Nombre del alumno").fill("Prueba");
      await c.page.getByLabel("Estatus").selectOption("activo");
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await esperarListo(c.page);
    },
  },
  {
    id: "maestro-alumnos-vacio",
    rol: "maestro",
    grupo: G,
    titulo: "Alumnos, sin alumnos («No hay alumnos que coincidan»)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS,
    ir: (c) => conVacio(c, "/alumnos"),
  },
  {
    id: "maestro-alumnos-muchos",
    rol: "maestro",
    grupo: G,
    titulo: "Alumnos, con muchos alumnos (lista repetida)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS,
    ir: (c) => conMuchosDatos(c, "/alumnos", 8),
  },
  {
    id: "maestro-alumnos-cargando",
    rol: "maestro",
    grupo: G,
    titulo: "Alumnos, cargando",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS,
    ir: (c) => conCargando(c, "/alumnos"),
  },
  {
    id: "maestro-alumnos-error",
    rol: "maestro",
    grupo: G,
    titulo: "Alumnos, con error de carga",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS,
    ir: (c) => conError(c, "/alumnos"),
  },

  // ═══════════════════════════ EXPEDIENTE ═══════════════════════════
  {
    id: "maestro-expediente-trayectoria",
    rol: "maestro",
    grupo: G,
    titulo: "Expediente de un alumno propio, pestaña Trayectoria (sin pestañas de dinero ni comercial; con el botón «Salud»)",
    tipo: "pantalla",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE,
    ir: (c) => irA(c, `/alumnos/${alumnoPropio(c).alumnoId}`),
  },
  {
    id: "maestro-expediente-operativo",
    rol: "maestro",
    grupo: G,
    titulo: "Expediente de un alumno propio, pestaña Asistencia (asistencia y eventos)",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE,
    ir: async (c) => {
      await irA(c, `/alumnos/${alumnoPropio(c).alumnoId}`);
      await c.page.getByRole("tab", { name: "Asistencia" }).click();
      await reposo(c.page);
    },
  },
  {
    id: "maestro-expediente-ajeno",
    rol: "maestro",
    grupo: G,
    titulo: "Expediente de un alumno que no es suyo por URL directa (no se encontró, con camino de regreso)",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE,
    ir: (c) => irA(c, `/alumnos/${alumnoAjeno(c).alumnoId}`),
  },
  {
    id: "maestro-expediente-cargando",
    rol: "maestro",
    grupo: G,
    titulo: "Expediente, cargando",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE,
    ir: (c) => conCargando(c, `/alumnos/${alumnoPropio(c).alumnoId}`),
  },
  {
    id: "maestro-expediente-error",
    rol: "maestro",
    grupo: G,
    titulo: "Expediente, con error de carga",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE,
    ir: (c) => conError(c, `/alumnos/${alumnoPropio(c).alumnoId}`),
  },
  {
    id: "maestro-expediente-con-historial",
    rol: "maestro",
    grupo: G,
    titulo: "Expediente con avance, próximo evento, cambios de grupo y faltas en el umbral (datos ficticios)",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE,
    ir: async (c) => {
      const a = alumnoPropio(c);
      await parchearGet(c, (u) => u.pathname === `/api/alumnos/${a.alumnoId}/expediente`, (e) => ({
        ...e,
        trayectoria: {
          ...e.trayectoria,
          historial_de_cambios_de_grupo: [{ inscripcion_id: a.inscripcionId, fecha: "2026-08-03", grupo_anterior: { id: "x", nombre: "Grupo B" }, grupo_nuevo: { id: c.mundo.grupos.a.id, nombre: c.mundo.grupos.a.nombre } }],
          niveles: [{ vertical: { id: "v1", nombre: "Disciplina de prueba", etiqueta_progresion: "Nivel" }, nivel: { id: "n1", nombre: "Nivel 2" }, fecha_obtenido: "2026-07-01" }],
        },
        operativo: { ...e.operativo, asistencia: { porcentaje_30_dias: 62, racha_de_faltas: 3, umbral_de_faltas: 3 }, eventos: [] },
      }));
      await irA(c, `/alumnos/${a.alumnoId}`);
    },
  },

  // ═══════════════════════════ SALUD DEL ALUMNO ═══════════════════════════
  {
    id: "maestro-salud-motivo",
    rol: "maestro",
    grupo: G,
    titulo: "Salud del alumno, pide el motivo de la consulta (aviso de datos sensibles; «Ver datos de salud» apagado)",
    tipo: "pantalla",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: (c) => irA(c, `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`),
  },
  {
    id: "maestro-salud-motivo-corto",
    rol: "maestro",
    grupo: G,
    titulo: "Salud del alumno, motivo de dos letras (todavía apagado el botón)",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: async (c) => {
      await irA(c, `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`);
      await c.page.getByLabel("Motivo de la consulta").fill("ab");
      await reposo(c.page);
    },
  },
  {
    id: "maestro-salud-motivo-escrito",
    rol: "maestro",
    grupo: G,
    titulo: "Salud del alumno, motivo escrito («Clase de hoy») y «Ver datos de salud» habilitado",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: async (c) => {
      await irA(c, `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`);
      await c.page.getByLabel("Motivo de la consulta").fill("Clase de hoy");
      await reposo(c.page);
    },
  },
  {
    id: "maestro-salud-ficha",
    rol: "maestro",
    grupo: G,
    titulo: "Salud del alumno, ficha a la vista con el contador «Se ocultan en … s» y «Ocultar» (datos de prueba)",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: async (c) => {
      await irA(c, `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`);
      await c.page.getByLabel("Motivo de la consulta").fill("Clase de hoy");
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await c.page.getByTestId("ficha-de-salud").waitFor();
      // El contador cambia cada segundo: se congela para que la captura sea la misma siempre.
      await c.page.evaluate(() => {
        const nodo = [...document.querySelectorAll(".insignia, [class*='insignia']")].find((n) => /Se ocultan en/.test(n.textContent ?? ""));
        if (nodo) nodo.textContent = "Se ocultan en 120 s";
      });
      await reposo(c.page, 100);
    },
  },
  {
    id: "maestro-salud-sin-ficha",
    rol: "maestro",
    grupo: G,
    titulo: "Salud de un alumno sin ficha todavía («Todavía no hay ficha de salud de este alumno», todo «Sin registrar»)",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: async (c) => {
      const sinFicha = c.mundo.maestro.alumnosDelPase[1]!;
      await irA(c, `/alumnos/${sinFicha.alumnoId}/salud`);
      await c.page.getByLabel("Motivo de la consulta").fill("Clase de hoy");
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await c.page.getByTestId("ficha-de-salud").waitFor();
      await c.page.evaluate(() => {
        const nodo = [...document.querySelectorAll(".insignia, [class*='insignia']")].find((n) => /Se ocultan en/.test(n.textContent ?? ""));
        if (nodo) nodo.textContent = "Se ocultan en 120 s";
      });
      await reposo(c.page, 100);
    },
  },
  {
    id: "maestro-salud-error-consulta",
    rol: "maestro",
    grupo: G,
    titulo: "Salud del alumno, la consulta falla (error bajo el motivo)",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: async (c) => {
      await irA(c, `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`);
      await c.page.route((u) => u.pathname.startsWith("/api/salud/alumno/"), (r: Route) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(errorApi("Algo salió mal en el servidor. Inténtalo de nuevo.")) }));
      await c.page.getByLabel("Motivo de la consulta").fill("Clase de hoy");
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-salud-sin-red",
    rol: "maestro",
    grupo: G,
    titulo: "Salud del alumno, sin señal al pedir la consulta",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: async (c) => {
      await irA(c, `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`);
      await c.page.getByLabel("Motivo de la consulta").fill("Clase de hoy");
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-salud-ajeno",
    rol: "maestro",
    grupo: G,
    titulo: "Salud de un alumno que no es suyo por URL directa (no se encontró)",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: (c) => irA(c, `/alumnos/${alumnoAjeno(c).alumnoId}/salud`),
  },
  {
    id: "maestro-salud-cargando",
    rol: "maestro",
    grupo: G,
    titulo: "Salud del alumno, cargando",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: (c) => conCargando(c, `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`),
  },
  {
    id: "maestro-salud-error-carga",
    rol: "maestro",
    grupo: G,
    titulo: "Salud del alumno, con error de carga del alumno",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: SALUD,
    ir: (c) => conError(c, `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`),
  },
  // ═══════════════════════════ R4b: HOY, LÍNEA DE TIEMPO ═══════════════════════════
  {
    id: "maestro-hoy-linea-de-tiempo",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, línea de tiempo: una clase ya marcada, la marca «Ahora … · siguiente en 40 min» y dos clases por venir (banda con el color de la disciplina)",
    tipo: "pantalla",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await conClasesDeHoy(c, [{ minutos: -90, estatus: "asistio", prospecto: "Alumna Uno" }, { minutos: 40, prospecto: "Alumno Dos" }, { minutos: 180, prospecto: "Alumna Tres" }]);
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-ahora-antes-de-la-primera",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, la primera clase todavía no empieza: la marca «Ahora … · siguiente en 15 min» va arriba de ella",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await conClasesDeHoy(c, [{ minutos: 15 }, { minutos: 135, prospecto: "Alumno Dos" }]);
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-estado-del-registro",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, la línea «Registro del alumno: …» en cada estado (sin captura, completo, cerrado y borrador) con el color del estado",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await conClasesDeHoy(c, [{ minutos: -60, prospecto: "Alumna Uno" }, { minutos: 30, prospecto: "Alumno Dos" }, { minutos: 90, prospecto: "Alumna Tres" }, { minutos: 150, prospecto: "Alumno Cuatro" }]);
      const estatusDe = (id: string): string => (id.endsWith("-hoy-1") ? "completo" : id.endsWith("-hoy-2") ? "cerrado" : id.endsWith("-hoy-3") ? "borrador" : "sin_captura");
      await c.page.route(
        (u) => /^\/api\/clases-muestra\/[^/]+\/registro$/.test(u.pathname),
        (r: Route) => {
          if (r.request().method() !== "GET") return r.fallback();
          const id = new URL(r.request().url()).pathname.split("/")[3]!;
          return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ estatus: estatusDe(id), existe: true }) });
        },
      );
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-clase-futura",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, clase de hoy que todavía no empieza: «Asistió» y «No asistió» apagados con «La asistencia se marca a partir de las …»",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await conClasesDeHoy(c, [{ minutos: 40 }]);
      await irA(c, "/hoy");
    },
  },
  {
    id: "maestro-hoy-despues-de-asistio",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, tras tocar «Asistió»: la tarjeta pasa a «Asistió» y aparece «Listo para cerrar la inscripción»",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      const palanca: { estatus?: string } = {};
      await conClasesDeHoy(c, [{ minutos: -30 }], palanca);
      await irA(c, "/hoy");
      palanca.estatus = "asistio";
      await simularEscritura(c, (u) => u.pathname.endsWith("/asistencia"), 200, {});
      await tarjetaDeClase(c).getByRole("button", { name: "Asistió", exact: true }).click();
      await reposo(c.page, 400);
    },
  },
  {
    id: "maestro-hoy-despues-de-no-asistio",
    rol: "maestro",
    grupo: G,
    titulo: "Hoy, tras tocar «No asistió»: el aviso de que el asesor recibe una tarea para llamar a la familia",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: HOY,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      const palanca: { estatus?: string } = {};
      await conClasesDeHoy(c, [{ minutos: -30 }], palanca);
      await irA(c, "/hoy");
      palanca.estatus = "no_asistio";
      await simularEscritura(c, (u) => u.pathname.endsWith("/asistencia"), 200, {});
      await tarjetaDeClase(c).getByRole("button", { name: "No asistió" }).click();
      await reposo(c.page, 400);
    },
  },

  // ═══════════════════════════ R4b: PASE DE LISTA ═══════════════════════════
  {
    id: "maestro-pase-conteo-en-vivo",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista, conteo en vivo: dos marcados y uno sin marcar (la barra de abajo dice «Faltan 1 por marcar»)",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await irAPase(c);
      const lista = c.mundo.maestro.alumnosDelPase;
      await alumnoDelPase(c.page, lista[0]!.nombre).getByRole("radio", { name: "Presente" }).check();
      await alumnoDelPase(c.page, lista[1]!.nombre).getByRole("radio", { name: "Falta" }).check();
      await c.page.mouse.move(0, 0);
      await reposo(c.page);
    },
  },
  {
    id: "maestro-pase-barra-de-guardado",
    rol: "maestro",
    grupo: G,
    titulo: "Pase de lista, la barra fija de guardado con todo marcado («3 de 3 marcados») y «Guardar pase de lista» de 52 px",
    tipo: "estado",
    ruta: "/pase",
    fuentes: PASE,
    completa: false,
    ir: async (c) => {
      await conColorDeDisciplina(c);
      await irAPase(c);
      await c.page.getByRole("button", { name: /Marcar a todos presentes/ }).click();
      await c.page.mouse.move(0, 0);
      await c.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await reposo(c.page);
    },
  },

  // ═══════════════════════════ R4b: REGISTRO, ACORDEÓN ═══════════════════════════
  {
    id: "maestro-registro-acordeon-cerrado",
    rol: "maestro",
    grupo: G,
    titulo: "Registro con datos, las seis secciones cerradas: «Completa» con palomita y «Faltan N datos», más la barra de avance",
    tipo: "pantalla",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, []);
    },
  },
  {
    id: "maestro-registro-acordeon-vacio",
    rol: "maestro",
    grupo: G,
    titulo: "Registro sin nada capturado, secciones cerradas: todas «Faltan N datos» y la barra de avance en cero",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, c.mundo.maestro.claseFutura.id);
      await secciones(c.page, []);
    },
  },
  {
    id: "maestro-registro-acordeon-abierto",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, una sección abierta (Antecedentes, con el borde del color primario) y las demás cerradas",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["antecedentes"]);
    },
  },
  {
    id: "maestro-registro-todo-completo",
    rol: "maestro",
    grupo: G,
    titulo: "Registro con las seis secciones «Completa»: «6 de 6 secciones completas» y la barra «Registro completo»",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await parchearGet(c, esAceptaciones, (b) => ({ ...b, estado: (b.estado as Json[]).map((e) => ({ ...e, estado: "aceptada", version_aceptada: e.version_vigente ?? 1, al_corriente: true, texto: "Rosa Mena aceptó el documento (en persona)." })) }));
      await irARegistro(c, idClase(c), completo(c));
      await secciones(c.page, []);
    },
  },
  {
    id: "maestro-registro-salud-aviso-de-permiso",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, Salud y seguridad abierta: el aviso de permiso («Solo lo ven quienes tienen permiso de salud…»)",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: SALUD_REGISTRO,
    ir: async (c) => {
      await irARegistro(c, idClase(c), conDatos(c));
      await secciones(c.page, ["salud"]);
      await c.page.getByTestId("aviso-de-permiso").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await reposo(c.page, 200);
    },
  },
  {
    id: "maestro-registro-errores-falta",
    rol: "maestro",
    grupo: G,
    titulo: "Registro, «Marcar registro como completo» con datos del alumno sin escribir: «Falta: …» junto a cada campo y la lista en el aviso",
    tipo: "estado",
    ruta: "/clases/:id/registro",
    fuentes: REGISTRO,
    ir: async (c) => {
      const falta = ["alumno.nombre", "alumno.apellidos", "alumno.sexo"];
      await irARegistro(c, idClase(c), (r) => ({ ...conDatos(c, { alumno: { nombre: null, apellidos: null, fecha_nacimiento: "2018-05-04", sexo: null, escuela: null, turno_escolar: null, talla_uniforme: null }, faltantes: falta })(r) }));
      await simularEscritura(c, (u) => u.pathname.endsWith("/registro/completar"), 409, errorApi("Al registro todavía le falta información para estar completo", falta.map((campo) => ({ campo, mensaje: "Falta" }))));
      await c.page.getByRole("button", { name: "Marcar registro como completo" }).click();
      await reposo(c.page);
      await c.page.getByText("Falta: Nombre del alumno.").first().evaluate((el) => el.scrollIntoView({ block: "center" }));
      await reposo(c.page, 200);
    },
  },
];

// En una página larga la cabecera fija tapa lo que está a media altura de una captura completa: las escenas de error se capturan en pantalla, con el mensaje centrado.
const ENFOQUE: Record<string, string> = {
  "maestro-registro-alumno-error-fecha": "no puede ser futura",
  "maestro-registro-alumno-error-servidor": "Algo salió mal en el servidor",
  "maestro-registro-alumno-sin-red": "Lo que escribiste sigue aquí",
  "maestro-registro-adultos-error": "Falta: nombre.",
  "maestro-registro-antecedentes-error": "¿Por qué quiere tomar la clase?",
  "maestro-registro-observacion-error-servidor": "Los datos enviados no son válidos",
  "maestro-registro-salud-error-sin-cambios": "No cambiaste nada de esta sección",
  "maestro-registro-salud-error-contacto": "El teléfono debe tener 10 dígitos",
  "maestro-registro-salud-error-mismo-adulto": "ya está en los adultos del registro",
  "maestro-registro-salud-error-servidor": "Algo salió mal en el servidor",
  "maestro-registro-salud-ver-error": "Algo salió mal en el servidor",
  "maestro-registro-reglamento-error": "ya no se editan las aceptaciones",
  "maestro-registro-completar-error": "Todavía falta para completar el registro",
  "maestro-registro-cerrar-error": "No se puede cerrar el registro todavía",
};

// Cada escena corre con plazos cortos (una que no llega a su estado falla pronto en vez de esperar 90 s).
export const ESCENAS: Escena[] = ESCENAS_BASE.map((e) => ({
  ...e,
  ...(ENFOQUE[e.id] ? { completa: false } : {}),
  ir: async (c) => {
    c.page.setDefaultTimeout(10_000);
    const enfocar = async (): Promise<void> => {
      const texto = ENFOQUE[e.id];
      if (texto) await c.page.getByText(texto).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
      if (texto) await reposo(c.page, 200);
    };
    await e.ir(c);
    await enfocar();
  },
}));
