// Escenas del área «Conversión e inscripción»: el asistente `/leads/:id/convertir` (todos sus pasos, con sus errores de validación y los rechazos del servidor), la pantalla de
// «Listo: familia e inscripción creadas» y el cierre en sitio del maestro (`CierreEnSitio`, dentro de «Hoy»).
//
// Qué muta y qué no:
//   · Épsilon (con clase muestra y registro del maestro) y Zeta (sin nada) NO se mutan: se llega a cada paso y se deja sin enviar.
//   · La conversión REAL nunca se confirma: el `POST /convertir` se responde en la escena (éxito o rechazo falsos), así el lead no se consume.
//   · Lo único que escribe de verdad es aceptar el reglamento y agregar un hermano, y SOLO sobre el lead de `recorridos.por.<vista>.conversion` (uno por vista; nadie más lo usa en el
//     inventario). Esas escenas van AL FINAL del archivo.
//   · El cierre en sitio del maestro se arma interceptando `/api/yo` (modo de cierre), la lista de clases del maestro y la vista previa de la conversión; no toca la base.

import type { Route } from "@playwright/test";
import { conCargando, conError, cortarLaRed, esperarListo, irA, type Contexto, type Escena } from "./escenas.ts";

const GRUPO = "Conversión e inscripción";
const FUENTES_ASISTENTE = ["web/src/pantallas/conversion/Conversion.tsx", "web/src/pantallas/conversion/Pasos.tsx", "web/src/pantallas/conversion/faltantes.ts", "web/src/pantallas/conversion/datos.ts"];
const RUTA = "/leads/:id/convertir";
const LEAD_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

// ─── Ayudas de este archivo ──────────────────────────────────────────────────────────────────

const esApi = (u: URL): boolean => u.pathname.startsWith("/api/");
const cuerpoDeError = (codigo: string, mensaje: string, detalles: { campo?: string; mensaje: string }[] = []): string => JSON.stringify({ error: { codigo, mensaje, detalles } });

const epsilon = (c: Contexto) => c.mundo.conversion.epsilon;
const zeta = (c: Contexto) => c.mundo.conversion.zeta;
/** El lead consumible de esta vista (uno por vista: celular y escritorio no se pisan). */
const prado = (c: Contexto) => c.mundo.recorridos.por[c.vista].conversion;
const rutaDe = (leadId: string): string => `/leads/${leadId}/convertir`;

/** Fecha de nacimiento de alguien que hoy tiene `anios` años y unos meses. */
function nacidoHace(anios: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - anios);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}

/** Cambia el JSON de la respuesta REAL de un GET. */
async function transformarGet(c: Contexto, patron: RegExp, cambiar: (cuerpo: any) => unknown): Promise<void> {
  await c.page.route(
    (u) => esApi(u) && patron.test(u.pathname),
    async (r: Route) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      const cuerpo = (await resp.json()) as unknown;
      return r.fulfill({ response: resp, body: JSON.stringify(cambiar(cuerpo)) });
    },
  );
}

/** Responde una escritura (`metodo` a una ruta) con ese estado y cuerpo; `null` en el cuerpo = no termina nunca (se ve «cargando»). */
async function responderEscritura(c: Contexto, metodo: string, patron: RegExp, estado: number, cuerpo: string | null): Promise<void> {
  await c.page.route(
    (u) => esApi(u) && patron.test(u.pathname),
    (r: Route) => {
      if (r.request().method() !== metodo) return r.fallback();
      if (cuerpo === null) return new Promise<void>(() => undefined);
      return r.fulfill({ status: estado, contentType: "application/json", body: cuerpo });
    },
  );
}

const siguiente = (c: Contexto) => c.page.getByRole("button", { name: /^(Siguiente|Revisar y confirmar)$/ });
const PASOS = ["Familia", "Alumnos", "Grupo y horario", "Precio", "Reglamento e imagen", "Confirmar"] as const;
type NombreDePaso = (typeof PASOS)[number];
const indiceDe = (p: NombreDePaso): number => PASOS.indexOf(p);

interface Datos {
  parentesco?: string;
  apellidos?: string;
  fecha?: string;
  /** Acepta el reglamento con la persona que capturó el maestro (ESCRIBE en la base: solo con los leads consumibles). */
  aceptar?: boolean;
}

async function llenarPaso(c: Contexto, paso: number, d: Datos): Promise<void> {
  const page = c.page;
  if (paso === 0) {
    const parentesco = page.getByLabel(/^Parentesco con el alumno/);
    if (await parentesco.count()) await parentesco.fill(d.parentesco ?? "tía");
  }
  if (paso === 1) {
    for (const tarjeta of await page.locator('[data-prueba^="alumno-"]').all()) {
      const apellidos = tarjeta.getByLabel(/^Apellidos/);
      if (await apellidos.count()) await apellidos.fill(d.apellidos ?? "Prueba Diseño");
      const fecha = tarjeta.getByLabel(/^Fecha de nacimiento/);
      if (await fecha.count()) await fecha.fill(d.fecha ?? nacidoHace(7));
    }
  }
  if (paso === 2) {
    for (const tarjeta of await page.locator('[data-prueba^="grupo-"]').all()) {
      const radios = await tarjeta.getByRole("radio").all();
      let marcado = false;
      for (const r of radios) if (await r.isChecked()) marcado = true;
      if (!marcado) for (const r of radios) if (await r.isEnabled()) { await r.check(); break; }
    }
  }
  if (paso === 4 && d.aceptar) {
    for (const tarjeta of await page.locator('[data-prueba^="reglamento-"]:not([data-prueba^="reglamento-del-hermano"])').all()) {
      if (!(await tarjeta.getByText("Falta que la familia acepte el reglamento vigente").count())) continue;
      const doc = tarjeta.locator('[data-prueba="documento-reglamento"]');
      if (!(await doc.count())) continue;
      await doc.getByLabel("¿Quién responde?").selectOption({ index: 0 });
      await doc.getByRole("button", { name: "Aceptan", exact: true }).click();
      await tarjeta.getByText("La familia ya aceptó el reglamento vigente").waitFor();
    }
    await esperarListo(page);
  }
}

/** Espera (hasta 5 s) a que el botón esté habilitado. */
async function esperarHabilitado(c: Contexto, boton: ReturnType<typeof siguiente>): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (await boton.isEnabled().catch(() => false)) return;
    await c.page.waitForTimeout(100);
  }
  throw new Error("El botón nunca se habilitó");
}

/** Abre el asistente de ese lead y avanza (llenando lo que se pide) hasta el paso `hasta`. Con `aceptar`, en el paso del reglamento acepta lo pendiente. */
async function irAlPaso(c: Contexto, leadId: string, hasta: NombreDePaso, d: Datos = {}): Promise<void> {
  await c.page.goto(rutaDe(leadId));
  await c.page.getByRole("heading", { name: "Familia", exact: true }).waitFor();
  await esperarListo(c.page);
  for (let i = 0; i < indiceDe(hasta); i++) {
    await llenarPaso(c, i, d);
    const boton = siguiente(c);
    await boton.waitFor();
    await esperarHabilitado(c, boton);
    await boton.click();
    await c.page.getByRole("heading", { name: PASOS[i + 1], exact: true }).first().waitFor();
    await esperarListo(c.page);
  }
  if (hasta === "Reglamento e imagen") await llenarPaso(c, 4, d);
}

/** En el paso `hasta` llena lo que pide ESE paso (sin avanzar). */
async function llenarEstePaso(c: Contexto, hasta: NombreDePaso, d: Datos = {}): Promise<void> {
  await llenarPaso(c, indiceDe(hasta), d);
  await esperarListo(c.page);
}

/** Los datos con que se recorre el asistente del lead consumible. */
const datosPrado = (c: Contexto): Datos => ({ apellidos: prado(c).apellidos, aceptar: true });

/** Avanza al paso «Confirmar» del lead consumible (acepta el reglamento si falta). */
async function irAConfirmar(c: Contexto, leadId: string): Promise<void> {
  await irAlPaso(c, leadId, "Reglamento e imagen", datosPrado(c));
  const boton = siguiente(c);
  await esperarHabilitado(c, boton);
  await boton.click();
  await c.page.getByRole("heading", { name: "Confirmar", exact: true }).waitFor();
  await esperarListo(c.page);
}

/** Deja aceptado el reglamento del lead consumible (para las escenas que después simulan otra cosa en la vista previa). */
async function asegurarReglamento(c: Contexto): Promise<void> {
  await irAlPaso(c, prado(c).leadId, "Reglamento e imagen", datosPrado(c));
}

/** Pulsa «Convertir e inscribir» y espera a que se vea el resultado de lo que respondió la escena. */
async function convertir(c: Contexto): Promise<void> {
  await c.page.getByRole("button", { name: "Convertir e inscribir" }).click();
}

/** Una respuesta de conversión creada con una inscripción REAL (para que el resumen lea sus importes) o sin ella. */
async function resultadoDeConversion(c: Contexto, alumnos: { prospectoId: string; creado: boolean; inscripcionCreada: boolean }[]): Promise<string> {
  const lista = (await (await c.page.request.get("/api/inscripciones?limite=1")).json()) as { datos: { id: string; grupo_id: string }[] };
  const insc = lista.datos[0];
  return JSON.stringify({
    ya_convertido: false,
    tutor_id: c.mundo.recepcion.gomez.tutorId,
    alumnos: alumnos.map((a) => ({ prospecto_id: a.prospectoId, alumno_id: "00000000-0000-4000-8000-0000000000a1", creado: a.creado, tutor_ids: [c.mundo.recepcion.gomez.tutorId], inscripcion: insc ? { id: insc.id, grupo_id: insc.grupo_id, creada: a.inscripcionCreada } : null })),
  });
}

const detallesGrupoLleno = (prospectoId: string) => [
  { campo: "motivo", mensaje: "grupo_lleno" },
  { campo: "prospecto_id", mensaje: prospectoId },
];

// ─── Cierre en sitio (maestro, dentro de «Hoy») ──────────────────────────────────────────────

const FUENTES_CIERRE = ["web/src/pantallas/conversion/CierreEnSitio.tsx", "web/src/ui/Dialogo.tsx", "web/src/pantallas/maestro/Hoy.tsx"];

interface OpcionesDeCierre {
  /** La vista previa de la conversión del lead de la clase: `cargando`, un error HTTP o los campos que cambian. */
  vista?: "cargando" | number | { listo: boolean; faltantes?: { campo: string; mensaje: string }[]; ya_convertido?: boolean };
}

/** «Hoy» del maestro con el modo «el maestro cierra en sitio», su clase ya asistida y la vista previa de la conversión que pida la escena. No escribe nada. */
async function hoyConCierre(c: Contexto, o: OpcionesDeCierre = {}): Promise<void> {
  const clase = c.mundo.maestro.clase;
  await transformarGet(c, /^\/api\/yo$/, (yo: any) => ({ ...yo, configuracion: { ...yo.configuracion, modo_cierre: "maestro_en_sitio" } }));
  await transformarGet(c, /^\/api\/maestro\/clases-muestra$/, (p: any) => ({ ...p, datos: (p.datos as any[]).filter((d) => d.id === clase.id || d.estatus !== "asistio").map((d) => (d.id === clase.id ? { ...d, estatus: "asistio" } : d)) }));
  const v = o.vista ?? { listo: true };
  await c.page.route(
    (u) => u.pathname === `/api/leads/${clase.leadId}/conversion`,
    (r: Route) => {
      if (r.request().method() !== "GET") return r.fallback();
      if (v === "cargando") return new Promise<void>(() => undefined);
      if (typeof v === "number") return r.fulfill({ status: v, contentType: "application/json", body: cuerpoDeError("interno", "Algo salió mal en el servidor. Inténtalo de nuevo.") });
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lead_id: clase.leadId,
          listo: v.listo,
          ya_convertido: v.ya_convertido ?? false,
          faltantes: v.faltantes ?? [],
          prospectos: [{ prospecto_id: clase.prospectoId, ya_convertido: v.ya_convertido ?? false }],
          previsiones: [{ prospecto_id: clase.prospectoId, hermanos_previstos: 0, reglamento_pendiente: !v.listo, grupo_nombre: c.mundo.grupos.a.nombre }],
        }),
      });
    },
  );
  await c.page.goto("/hoy");
  await c.page.locator(`[data-prueba="clase-${clase.id}"]`).waitFor();
  if (v === "cargando") {
    // La petición nunca termina: no se espera a que la red quede en calma.
    await c.page.getByText("Revisando si ya se puede inscribir…").waitFor({ timeout: 10_000 });
    await c.page.waitForTimeout(200);
    return;
  }
  await c.page.locator('[data-prueba="cierre-en-sitio"], [role="alert"], [role="status"], .aviso').first().waitFor({ timeout: 5000 }).catch(() => undefined);
  await esperarListo(c.page);
}

const botonInscribir = (c: Contexto) => c.page.getByRole("button", { name: "Inscribir a mi alumno" });

async function abrirConfirmacion(c: Contexto): Promise<void> {
  await botonInscribir(c).click();
  await c.page.locator("dialog[open]").waitFor();
  await esperarListo(c.page);
}

async function confirmarCierre(c: Contexto): Promise<void> {
  await abrirConfirmacion(c);
  await c.page.locator("dialog[open]").getByRole("button", { name: "Sí, inscribir" }).click();
}

const FALTAS_DEL_MAESTRO = [
  { campo: `prospectos.X.grupo_id`, mensaje: "Falta el grupo" },
  { campo: `prospectos.X.reglamento`, mensaje: "Falta el reglamento" },
];

// ─── Las escenas ─────────────────────────────────────────────────────────────────────────────

const ESCENAS_SIN_ENVOLVER: Escena[] = [
  // ── Cargando, error y lead inexistente ──
  {
    id: "conv-asistente-cargando",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Asistente de conversión cargando (asesor y administrador)",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await conCargando(c, rutaDe(epsilon(c).leadId));
      // Que ya esté el marco de la pantalla (el trozo de código cargó) y lo que sigue sea el «Cargando…» de los datos.
      await c.page.getByRole("heading", { name: "Convertir e inscribir", exact: true }).waitFor({ timeout: 8000 }).catch(() => undefined);
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "conv-asistente-error-de-carga",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Asistente de conversión con error de carga y botón de reintentar (asesor y administrador)",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => conError(c, rutaDe(epsilon(c).leadId)),
  },
  {
    id: "conv-asistente-lead-inexistente",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Asistente de un lead que no existe o no es del alcance de la persona",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irA(c, rutaDe(LEAD_INEXISTENTE)),
  },
  {
    id: "conv-asistente-error-de-oferta",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Asistente cuando falla el cálculo de la oferta (cotizador): error con reintentar",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname === "/api/cotizador",
        (r: Route) => r.fulfill({ status: 500, contentType: "application/json", body: cuerpoDeError("interno", "Algo salió mal en el servidor. Inténtalo de nuevo.") }),
      );
      await irA(c, rutaDe(epsilon(c).leadId));
    },
  },
  {
    id: "conv-asistente-ya-convertido",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Asistente de un lead ya convertido: «Todo está convertido e inscrito»",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await transformarGet(c, /^\/api\/leads\/[^/]+\/conversion$/, (v: any) => ({ ...v, listo: true, ya_convertido: true, faltantes: [], prospectos: (v.prospectos as any[]).map((p) => ({ ...p, ya_convertido: true })) }));
      await irA(c, rutaDe(epsilon(c).leadId));
    },
  },

  // ── Épsilon: con clase muestra y registro del maestro (falta solo el apellido y el reglamento) ──
  {
    id: "conv-epsilon-familia-capturada",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 1 Familia con los adultos que capturó el maestro («En este paso no hay nada por capturar»)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, epsilon(c).leadId, "Familia"),
  },
  {
    id: "conv-epsilon-familia-lista-para-cerrar",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 1 Familia con el aviso «El maestro marcó a esta familia como lista para cerrar»",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await c.page.route(
        (u) => u.pathname === "/api/tareas",
        (r: Route) => (r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ datos: [{ id: "00000000-0000-4000-8000-0000000000b1" }], paginacion: { pagina: 1, limite: 1, total: 1 } }) }) : r.fallback()),
      );
      await irAlPaso(c, epsilon(c).leadId, "Familia");
    },
  },
  {
    id: "conv-epsilon-alumnos-falta-apellidos",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 2 Alumnos: lo capturado se ve con «Capturado», falta el apellido; «Siguiente» deshabilitado con «Para seguir falta…»",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, epsilon(c).leadId, "Alumnos"),
  },
  {
    id: "conv-epsilon-alumnos-corregir",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 2 Alumnos tras pulsar «Corregir» el nombre: el campo con «Antes: …»",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Alumnos");
      await c.page.getByRole("button", { name: "Corregir nombre" }).click();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-epsilon-alumnos-corregir-fecha",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 2 Alumnos tras pulsar «Corregir» la fecha de nacimiento y teclear una fecha futura (dato malo)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Alumnos");
      await c.page.getByRole("button", { name: "Corregir fecha de nacimiento" }).click();
      await c.page.getByLabel(/^Fecha de nacimiento/).fill("2099-01-01");
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-epsilon-alumnos-apellidos-escritos",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 2 Alumnos con el apellido escrito: «Siguiente» habilitado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Alumnos");
      await llenarEstePaso(c, "Alumnos", { apellidos: "Épsilon Díaz" });
    },
  },
  {
    id: "conv-epsilon-grupo-recomendado",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 3 Grupo y horario con el grupo «recomendado por el maestro» ya elegido y los lugares reales",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, epsilon(c).leadId, "Grupo y horario", { apellidos: "Épsilon Díaz" }),
  },
  {
    id: "conv-epsilon-grupo-mas-opciones",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 3 Grupo y horario con «Más opciones de la inscripción» abierto y llenas (fecha de inicio, día de corte, meses)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Grupo y horario", { apellidos: "Épsilon Díaz" });
      await c.page.getByText("Más opciones de la inscripción").click();
      await c.page.getByLabel(/^Día de corte del pago/).fill("15");
      await c.page.getByLabel(/^Meses por adelantado/).fill("2");
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-epsilon-grupo-mas-opciones-dato-malo",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 3 Grupo y horario con un día de corte inválido escrito (99): el asistente lo deja pasar y el servidor lo rechazaría",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Grupo y horario", { apellidos: "Épsilon Díaz" });
      await c.page.getByText("Más opciones de la inscripción").click();
      await c.page.getByLabel(/^Día de corte del pago/).fill("99");
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-epsilon-grupo-sin-cupo",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 3 Grupo y horario con el grupo recomendado sin cupo («Lleno», deshabilitado, aviso «ya no tiene lugares») y «Siguiente» bloqueado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      const grupoC = c.mundo.conversion.grupoC.id;
      await transformarGet(c, /^\/api\/cotizador$/, (o: any) => ({ ...o, programas: (o.programas as any[]).map((p) => ({ ...p, grupos: (p.grupos as any[]).map((g) => (g.grupo_id === grupoC ? { ...g, lleno: true, lugares_disponibles: 0 } : g)) })) }));
      await irAlPaso(c, epsilon(c).leadId, "Grupo y horario", { apellidos: "Épsilon Díaz" });
    },
  },
  {
    id: "conv-epsilon-grupo-sin-programas",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 3 Grupo y horario cuando no hay programas para esa edad en la sucursal (aviso)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await transformarGet(c, /^\/api\/cotizador$/, (o: any) => ({ ...o, programas: [] }));
      await irAlPaso(c, epsilon(c).leadId, "Alumnos");
      await llenarEstePaso(c, "Alumnos", { apellidos: "Épsilon Díaz" });
      await siguiente(c).click();
      await c.page.getByRole("heading", { name: "Grupo y horario", exact: true }).first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-epsilon-precio-con-importes",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 4 Precio con inscripción, mensualidad y «No aplica ninguna promoción hoy»",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, epsilon(c).leadId, "Precio", { apellidos: "Épsilon Díaz" }),
  },
  {
    id: "conv-epsilon-precio-con-promocion",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 4 Precio con importe tachado → descuento, meses gratis y la lista de promociones que aplican (respuesta del cotizador simulada)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await transformarGet(c, /^\/api\/cotizador$/, (o: any) => ({
        ...o,
        programas: (o.programas as any[]).map((p) =>
          p.promociones
            ? {
                ...p,
                promociones: {
                  ...p.promociones,
                  inscripcion: { ...p.promociones.inscripcion, final_ahora: "250.00" },
                  mensualidad: { ...p.promociones.mensualidad, final_ahora: "900.00" },
                  meses_gratis_ahora: 1,
                  aplicadas: [{ promocion_id: "p1" }, { promocion_id: "p2" }],
                  lineas: [
                    { promocion_id: "p1", promocion_nombre: "Promoción de inscripción", descripcion: "50 % de descuento en la inscripción", tipo: "descuento_inscripcion", descuento: "250.00", estado: "inmediato" },
                    { promocion_id: "p2", promocion_nombre: "Mes gratis", descripcion: "Un mes gratis", tipo: "meses_gratis", descuento: "0.00", estado: "al_cumplir" },
                  ],
                },
              }
            : p,
        ),
      }));
      await irAlPaso(c, epsilon(c).leadId, "Precio", { apellidos: "Épsilon Díaz" });
    },
  },
  {
    id: "conv-epsilon-precio-sin-precio-vigente",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 4 Precio de un programa sin precio vigente (aviso rojo; respuesta del cotizador simulada)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await transformarGet(c, /^\/api\/cotizador$/, (o: any) => ({ ...o, programas: (o.programas as any[]).map((p) => ({ ...p, precio: null, sin_precio: true, promociones: null })) }));
      await irAlPaso(c, epsilon(c).leadId, "Precio", { apellidos: "Épsilon Díaz" });
    },
  },
  {
    id: "conv-epsilon-reglamento-pendiente",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento e imagen sin aceptar: «Falta que la familia acepte», formulario de aceptación del reglamento y de la imagen, «Siguiente» bloqueado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: [...FUENTES_ASISTENTE, "web/src/pantallas/maestro/Aceptaciones.tsx"],
    ir: (c) => irAlPaso(c, epsilon(c).leadId, "Reglamento e imagen", { apellidos: "Épsilon Díaz" }),
  },
  {
    id: "conv-epsilon-reglamento-otra-persona",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento con «Otra persona» elegida: pide el nombre y «Aceptan» queda deshabilitado hasta escribirlo",
    tipo: "paso",
    ruta: RUTA,
    fuentes: [...FUENTES_ASISTENTE, "web/src/pantallas/maestro/Aceptaciones.tsx"],
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Reglamento e imagen", { apellidos: "Épsilon Díaz" });
      await c.page.locator('[data-prueba="documento-reglamento"]').getByLabel("¿Quién responde?").selectOption({ label: "Otra persona" });
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-epsilon-reglamento-texto-abierto",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento con «Leer el texto que se le muestra a la familia» abierto",
    tipo: "paso",
    ruta: RUTA,
    fuentes: [...FUENTES_ASISTENTE, "web/src/pantallas/maestro/Aceptaciones.tsx"],
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Reglamento e imagen", { apellidos: "Épsilon Díaz" });
      await c.page.locator('[data-prueba="documento-reglamento"]').getByText("Leer el texto que se le muestra a la familia").click();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-epsilon-reglamento-error-del-servidor",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento: el servidor rechaza la aceptación (422) y se ve el error bajo el formulario",
    tipo: "paso",
    ruta: RUTA,
    fuentes: [...FUENTES_ASISTENTE, "web/src/pantallas/maestro/Aceptaciones.tsx"],
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Reglamento e imagen", { apellidos: "Épsilon Díaz" });
      await responderEscritura(c, "POST", /\/registro\/aceptaciones$/, 422, cuerpoDeError("validacion", "Los datos no son válidos.", [{ campo: "aceptante", mensaje: "Falta quién responde" }]));
      await c.page.locator('[data-prueba="documento-reglamento"]').getByRole("button", { name: "Aceptan", exact: true }).click();
      await c.page.locator('[data-prueba="documento-reglamento"]').getByRole("alert").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-epsilon-reglamento-sin-red",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento sin conexión: al pulsar «Aceptan» sale «No hay conexión con el servidor»",
    tipo: "paso",
    ruta: RUTA,
    fuentes: [...FUENTES_ASISTENTE, "web/src/pantallas/maestro/Aceptaciones.tsx"],
    ir: async (c) => {
      await irAlPaso(c, epsilon(c).leadId, "Reglamento e imagen", { apellidos: "Épsilon Díaz" });
      await cortarLaRed(c);
      await c.page.locator('[data-prueba="documento-reglamento"]').getByRole("button", { name: "Aceptan", exact: true }).click();
      await c.page.locator('[data-prueba="documento-reglamento"]').getByRole("alert").waitFor();
      await c.page.waitForTimeout(150);
    },
  },

  // ── Zeta: casi todo falta y no hay clase muestra ──
  {
    id: "conv-zeta-familia-falta-parentesco",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 1 Familia de un lead sin registro: el contacto (nombre y teléfono) y el campo «Parentesco» obligatorio; «Siguiente» bloqueado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, zeta(c).leadId, "Familia"),
  },
  {
    id: "conv-zeta-familia-datos-opcionales",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 1 Familia con el parentesco escrito y «Datos opcionales del adulto» abierto (apellidos y correo)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAlPaso(c, zeta(c).leadId, "Familia");
      await c.page.getByLabel(/^Parentesco con el alumno/).fill("tía");
      await c.page.getByText("Datos opcionales del adulto").click();
      await c.page.getByLabel("Apellidos del adulto").fill("Zeta Ruiz");
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-zeta-alumnos-sin-registro",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 2 Alumnos sin registro del maestro: «Todavía no hay registro», apellidos y fecha de nacimiento obligatorios; «Siguiente» bloqueado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, zeta(c).leadId, "Alumnos"),
  },
  {
    id: "conv-zeta-alumnos-fecha-imposible",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 2 Alumnos con apellidos y una fecha de nacimiento futura (2099): sigue faltando la fecha y «Siguiente» sigue bloqueado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAlPaso(c, zeta(c).leadId, "Alumnos");
      await llenarEstePaso(c, "Alumnos", { apellidos: "Zeta Ruiz", fecha: "2099-01-01" });
    },
  },
  {
    id: "conv-zeta-alumnos-completos",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 2 Alumnos con apellidos y fecha válida escritos: «Siguiente» habilitado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAlPaso(c, zeta(c).leadId, "Alumnos");
      await llenarEstePaso(c, "Alumnos", { apellidos: "Zeta Ruiz", fecha: nacidoHace(6) });
    },
  },
  {
    id: "conv-zeta-grupo-sin-elegir",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 3 Grupo y horario sin grupo elegido (ninguno recomendado): «Siguiente» bloqueado, «Para seguir falta: Grupo y horario»",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, zeta(c).leadId, "Grupo y horario", { parentesco: "tía", apellidos: "Zeta Ruiz", fecha: nacidoHace(6) }),
  },
  {
    id: "conv-zeta-precio-con-grupo",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 4 Precio con un grupo elegido (grupo, importes y promociones del grupo elegido)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, zeta(c).leadId, "Precio", { parentesco: "tía", apellidos: "Zeta Ruiz", fecha: nacidoHace(6) }),
  },
  {
    id: "conv-zeta-reglamento-sin-clase-muestra",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento de un lead sin clase muestra: «Para registrar la aceptación hace falta una clase muestra» con enlace a la ficha; «Siguiente» bloqueado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAlPaso(c, zeta(c).leadId, "Reglamento e imagen", { parentesco: "tía", apellidos: "Zeta Ruiz", fecha: nacidoHace(6) }),
  },

  // ── Los de «recorridos» (consumibles): todo lo que escribe va de aquí en adelante ──
  {
    id: "conv-reglamento-aceptado",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento ya aceptado («La familia ya aceptó el reglamento vigente», insignia «Aceptado»); «Revisar y confirmar» habilitado (ESCRIBE: acepta el reglamento del lead consumible)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: [...FUENTES_ASISTENTE, "web/src/pantallas/maestro/Aceptaciones.tsx"],
    ir: async (c) => {
      await irAlPaso(c, prado(c).leadId, "Reglamento e imagen", datosPrado(c));
    },
  },
  {
    id: "conv-confirmar-todo-listo",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar: «Todo listo para inscribir», resumen de la familia y del alumno con importes; «Convertir e inscribir» habilitado (sin enviar)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: (c) => irAConfirmar(c, prado(c).leadId),
  },
  {
    id: "conv-confirmar-reglamento-pendiente",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar con el aviso «Todavía falta el reglamento» (la vista previa dice que el reglamento está pendiente; respuesta simulada)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await asegurarReglamento(c);
      await transformarGet(c, /^\/api\/leads\/[^/]+\/conversion$/, (v: any) => ({ ...v, previsiones: (v.previsiones as any[]).map((p) => ({ ...p, reglamento_pendiente: true })) }));
      await irAlPaso(c, prado(c).leadId, "Reglamento e imagen", { apellidos: prado(c).apellidos });
      await siguiente(c).click();
      await c.page.getByRole("heading", { name: "Confirmar", exact: true }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-confirmar-faltan-datos",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar con «Todavía falta para poder inscribir» y botones «Ir a este paso» (la vista previa trae una falta que ningún paso resuelve; respuesta simulada); «Convertir e inscribir» deshabilitado",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await asegurarReglamento(c);
      await transformarGet(c, /^\/api\/leads\/[^/]+\/conversion$/, (v: any) => ({ ...v, listo: false, faltantes: [...(v.faltantes as any[]), { campo: "prospectos", mensaje: "Falta al menos un alumno" }] }));
      await irAConfirmar(c, prado(c).leadId);
    },
  },
  {
    id: "conv-confirmar-convirtiendo",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar mientras se inscribe: «Convertir e inscribir» con el indicador de «cargando» (el servidor tarda)",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 201, null);
      await convertir(c);
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "conv-confirmar-rechazo-grupo-lleno",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar: el servidor rechaza con 409 «grupo lleno» («No se inscribió a nadie…», «Ponerlo en lista de espera», «Volver al paso Grupo y horario»)",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "El grupo ya no tiene lugares.", detallesGrupoLleno(prado(c).prospectoId)));
      await convertir(c);
      await c.page.locator('[data-prueba="salida-grupo-lleno"]').waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-confirmar-lista-de-espera-error",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar tras el rechazo por grupo lleno, al pulsar «Ponerlo en lista de espera» el servidor falla (error bajo los botones)",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "El grupo ya no tiene lugares.", detallesGrupoLleno(prado(c).prospectoId)));
      await responderEscritura(c, "POST", /\/lista-espera$/, 409, cuerpoDeError("conflicto", "Ese alumno ya está en la lista de espera de este grupo."));
      await convertir(c);
      await c.page.locator('[data-prueba="salida-grupo-lleno"]').waitFor();
      await c.page.getByRole("button", { name: "Ponerlo en lista de espera" }).click();
      await c.page.locator('[data-prueba="salida-grupo-lleno"]').getByRole("alert").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-confirmar-rechazo-faltan-datos",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar: el servidor rechaza con 409 «faltan datos» y lista lo que falta, con «Volver al paso …»",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(
        c,
        "POST",
        /\/convertir$/,
        409,
        cuerpoDeError("conflicto", "Faltan datos para inscribir.", [
          { campo: "motivo", mensaje: "faltan_datos" },
          { campo: `prospectos.${prado(c).prospectoId}.alumno.apellidos`, mensaje: "Faltan los apellidos" },
          { campo: "tutor.parentesco", mensaje: "Falta el parentesco" },
        ]),
      );
      await convertir(c);
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-confirmar-rechazo-reglamento",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar: el servidor rechaza con 409 por el reglamento («Volver al paso Reglamento e imagen»)",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "La familia no ha aceptado el reglamento vigente.", [{ campo: "motivo", mensaje: "reglamento" }]));
      await convertir(c);
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-confirmar-rechazo-fuera-de-edad",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar: el servidor rechaza con 409 porque el alumno está fuera del rango de edad del grupo",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "El alumno está fuera de la edad de este programa.", [{ campo: "motivo", mensaje: "fuera_de_edad" }]));
      await convertir(c);
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-confirmar-rechazo-datos-invalidos",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar: el servidor rechaza con 422 por datos inválidos (error general sin paso al que volver)",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 422, cuerpoDeError("validacion", "Los datos no son válidos."));
      await convertir(c);
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-confirmar-error-del-servidor",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar: error 500 del servidor al inscribir",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 500, cuerpoDeError("interno", "Algo salió mal en el servidor. Inténtalo de nuevo."));
      await convertir(c);
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-confirmar-sin-red",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar sin conexión: «No hay conexión con el servidor» al pulsar «Convertir e inscribir»",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await cortarLaRed(c);
      await convertir(c);
      await c.page.getByRole("alert").first().waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "conv-exito-inscrito",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Pantalla «Listo: familia e inscripción creadas»: alumno creado e inscrito con su resumen de importes, «Volver a la ficha» y «Ver el estado de cuenta» (el POST final se responde en la escena)",
    tipo: "pantalla",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 201, await resultadoDeConversion(c, [{ prospectoId: prado(c).prospectoId, creado: true, inscripcionCreada: true }]));
      await convertir(c);
      await c.page.locator('[data-prueba="conversion-lista"]').waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-exito-ya-existia",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Pantalla «Listo…» cuando el alumno ya existía y ya estaba inscrito en ese grupo (el POST final se responde en la escena)",
    tipo: "pantalla",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmar(c, prado(c).leadId);
      await responderEscritura(c, "POST", /\/convertir$/, 200, await resultadoDeConversion(c, [{ prospectoId: prado(c).prospectoId, creado: false, inscripcionCreada: false }]));
      await convertir(c);
      await c.page.locator('[data-prueba="conversion-lista"]').waitFor();
      await esperarListo(c.page);
    },
  },

  // ── Cierre en sitio del maestro (dentro de «Hoy», solo con el modo «el maestro cierra en sitio») ──
  {
    id: "conv-cierre-cargando",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», cierre en sitio revisando si ya se puede inscribir («Revisando si ya se puede inscribir…»)",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: "cargando" });
    },
  },
  {
    id: "conv-cierre-error-de-carga",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», cierre en sitio cuando falla la vista previa de la conversión (error)",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: (c) => hoyConCierre(c, { vista: 500 }),
  },
  {
    id: "conv-cierre-faltan-datos",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», cierre en sitio con «Todavía falta para poder inscribirlo» (grupo y reglamento) y «Inscribir a mi alumno» deshabilitado",
    tipo: "pantalla",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: (c) => hoyConCierre(c, { vista: { listo: false, faltantes: FALTAS_DEL_MAESTRO.map((f) => ({ ...f, campo: f.campo.replace("X", c.mundo.maestro.clase.prospectoId) })) } }),
  },
  {
    id: "conv-cierre-faltan-datos-precio",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», cierre en sitio con falta de precio del grupo («avísale al asesor») y falta de nombre de alumno (etiquetas genéricas)",
    tipo: "pantalla",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: (c) =>
      hoyConCierre(c, {
        vista: {
          listo: false,
          faltantes: [
            { campo: `prospectos.${c.mundo.maestro.clase.prospectoId}.precio`, mensaje: "Sin precio" },
            { campo: `prospectos.${c.mundo.maestro.clase.prospectoId}.alumno.apellidos`, mensaje: "Faltan apellidos" },
          ],
        },
      }),
  },
  {
    id: "conv-cierre-listo",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», cierre en sitio listo: «Ya está todo lo necesario» y «Inscribir a mi alumno» habilitado",
    tipo: "pantalla",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: (c) => hoyConCierre(c, { vista: { listo: true } }),
  },
  {
    id: "conv-cierre-ya-inscrito",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», cierre en sitio de un alumno que ya está inscrito («Este alumno ya está inscrito»)",
    tipo: "pantalla",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: (c) => hoyConCierre(c, { vista: { listo: true, ya_convertido: true } }),
  },
  {
    id: "conv-cierre-dialogo-confirmar",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Diálogo «Inscribir a …» con el grupo donde quedará, «Sí, inscribir» y «Todavía no»",
    tipo: "flotante",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await abrirConfirmacion(c);
    },
  },
  {
    id: "conv-cierre-dialogo-inscribiendo",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Diálogo «Inscribir a …» mientras se inscribe («Sí, inscribir» cargando; el servidor tarda)",
    tipo: "flotante",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await responderEscritura(c, "POST", /\/convertir$/, 201, null);
      await confirmarCierre(c);
      await c.page.waitForTimeout(300);
    },
  },
  {
    id: "conv-cierre-rechazo-grupo-lleno",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», tras confirmar el servidor rechaza por grupo lleno: «El grupo … ya no tiene lugares» y «Avisar al asesor»",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "El grupo ya no tiene lugares.", detallesGrupoLleno(c.mundo.maestro.clase.prospectoId)));
      await confirmarCierre(c);
      await c.page.getByRole("button", { name: "Avisar al asesor" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-cierre-rechazo-otro-motivo",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», tras confirmar el servidor rechaza con 409 por otro motivo (reglamento): error y «Avisar al asesor»",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "La familia no ha aceptado el reglamento vigente.", [{ campo: "motivo", mensaje: "reglamento" }]));
      await confirmarCierre(c);
      await c.page.getByRole("button", { name: "Avisar al asesor" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-cierre-error-del-servidor",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», tras confirmar el servidor falla (500): el diálogo se cierra y se ve el error sobre el botón",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await responderEscritura(c, "POST", /\/convertir$/, 500, cuerpoDeError("interno", "Algo salió mal en el servidor. Inténtalo de nuevo."));
      await confirmarCierre(c);
      await c.page.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => undefined);
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-cierre-sin-red",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», sin conexión al confirmar la inscripción («No hay conexión con el servidor»)",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await abrirConfirmacion(c);
      await cortarLaRed(c);
      await c.page.locator("dialog[open]").getByRole("button", { name: "Sí, inscribir" }).click();
      await c.page.getByRole("alert").first().waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "conv-cierre-exito",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», tras inscribir: «Listo: tu alumno quedó inscrito» (el POST se responde en la escena)",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await responderEscritura(c, "POST", /\/convertir$/, 201, await resultadoDeConversion(c, [{ prospectoId: c.mundo.maestro.clase.prospectoId, creado: true, inscripcionCreada: true }]));
      await confirmarCierre(c);
      await c.page.getByText("Listo: tu alumno quedó inscrito.").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-cierre-avisado",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», tras el rechazo por grupo lleno y «Avisar al asesor»: «Listo: el asesor recibió el aviso» (la tarea se responde en la escena)",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "El grupo ya no tiene lugares.", detallesGrupoLleno(c.mundo.maestro.clase.prospectoId)));
      await responderEscritura(c, "POST", /\/listo-para-cerrar$/, 201, JSON.stringify({ id: "00000000-0000-4000-8000-0000000000c1" }));
      await confirmarCierre(c);
      await c.page.getByRole("button", { name: "Avisar al asesor" }).click();
      await c.page.getByText("Listo: el asesor recibió el aviso y se encarga.").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-cierre-avisar-error",
    rol: "maestro",
    grupo: GRUPO,
    titulo: "Maestro, «Hoy», «Avisar al asesor» falla (500): el error junto al botón",
    tipo: "estado",
    ruta: "/hoy",
    fuentes: FUENTES_CIERRE,
    ir: async (c) => {
      await hoyConCierre(c, { vista: { listo: true } });
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "El grupo ya no tiene lugares.", detallesGrupoLleno(c.mundo.maestro.clase.prospectoId)));
      await responderEscritura(c, "POST", /\/listo-para-cerrar$/, 500, cuerpoDeError("interno", "Algo salió mal en el servidor. Inténtalo de nuevo."));
      await confirmarCierre(c);
      await c.page.getByRole("button", { name: "Avisar al asesor" }).click();
      await c.page.getByRole("alert").filter({ hasText: "Algo salió mal" }).waitFor();
      await esperarListo(c.page);
    },
  },

  // ── Hermanos (varios niños en una operación). Va AL FINAL: agrega un segundo niño al lead consumible de la vista. ──
  {
    id: "conv-hermanos-familia-y-marcar",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Lead con dos niños: «¿A quiénes se inscribe ahora?» con una casilla por niño, y el paso 1 Familia (ESCRIBE: agrega un hermano al lead consumible)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await agregarHermano(c);
      await irAlPaso(c, prado(c).leadId, "Familia", datosPrado(c));
      await c.page.locator('[data-prueba="marcar-ninos"]').waitFor();
    },
  },
  {
    id: "conv-hermanos-uno-desmarcado",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Lead con dos niños, con uno desmarcado («Los que no marques se quedan en la ficha»): la casilla del único marcado queda deshabilitada",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await agregarHermano(c);
      await irAlPaso(c, prado(c).leadId, "Familia", datosPrado(c));
      await c.page.locator('[data-prueba="marcar-ninos"]').getByRole("checkbox").last().uncheck();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-hermanos-alumnos",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 2 Alumnos con dos niños: una tarjeta por niño, uno con lo del maestro y otro sin registro; «Para seguir falta» dice de cuál es cada falta",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await agregarHermano(c);
      await irAlPaso(c, prado(c).leadId, "Alumnos", datosPrado(c));
    },
  },
  {
    id: "conv-hermanos-grupo",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 3 Grupo y horario con dos niños: una tarjeta de grupo por niño (el primero ya traía el recomendado, el segundo elegido ahora)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await agregarHermano(c);
      await irAlPaso(c, prado(c).leadId, "Grupo y horario", datosPrado(c));
    },
  },
  {
    id: "conv-hermanos-precio",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 4 Precio con dos niños: «Se cotiza con 1 hermano ya inscrito (contando a los que se inscriben antes)» para el segundo",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await agregarHermano(c);
      await irAlPaso(c, prado(c).leadId, "Precio", datosPrado(c));
    },
  },
  {
    id: "conv-hermanos-reglamento-extender",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento con dos niños: el segundo sin aceptar con el botón «Aceptan lo mismo que por …» (el primero ya aceptó)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await agregarHermano(c);
      await irAlPaso(c, prado(c).leadId, "Reglamento e imagen", datosPrado(c));
    },
  },
  {
    id: "conv-hermanos-reglamento-error",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 5 Reglamento con dos niños: «Aceptan lo mismo que por …» falla en el servidor (error bajo el botón)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await agregarHermano(c);
      await irAlPaso(c, prado(c).leadId, "Reglamento e imagen", datosPrado(c));
      await responderEscritura(c, "POST", /\/aceptaciones-del-hermano$/, 409, cuerpoDeError("conflicto", "El hermano no aceptó la versión vigente del reglamento."));
      await c.page.getByRole("button", { name: /^Aceptan lo mismo que por/ }).click();
      await c.page.locator('[data-prueba^="reglamento-del-hermano-"]').getByRole("alert").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-hermanos-confirmar-listo",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar con dos niños: resumen con los dos y «Todo listo» (ESCRIBE: la familia acepta el reglamento del segundo niño)",
    tipo: "paso",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await agregarHermano(c);
      await irAlPaso(c, prado(c).leadId, "Reglamento e imagen", datosPrado(c));
      const extender = c.page.getByRole("button", { name: /^Aceptan lo mismo que por/ });
      if (await extender.count()) await extender.click();
      await c.page.getByText("Falta que la familia acepte el reglamento vigente").waitFor({ state: "detached" });
      await esperarListo(c.page);
      await siguiente(c).click();
      await c.page.getByRole("heading", { name: "Confirmar", exact: true }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-hermanos-rechazo-grupo-lleno",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Paso 6 Confirmar con dos niños: 409 «grupo lleno» del segundo, con «Dejar fuera a …» y «Ponerlo en lista de espera» (el POST se responde en la escena)",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmarHermanos(c);
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "El grupo ya no tiene lugares.", detallesGrupoLleno(await idDelHermano(c))));
      await convertir(c);
      await c.page.locator('[data-prueba="salida-grupo-lleno"]').waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-hermanos-dejar-fuera",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Tras «Dejar fuera a …» en el rechazo por grupo lleno: solo queda marcado el primero y el asistente vuelve a calcular lo que falta",
    tipo: "estado",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmarHermanos(c);
      await responderEscritura(c, "POST", /\/convertir$/, 409, cuerpoDeError("conflicto", "El grupo ya no tiene lugares.", detallesGrupoLleno(await idDelHermano(c))));
      await convertir(c);
      await c.page.locator('[data-prueba="salida-grupo-lleno"]').waitFor();
      await c.page.getByRole("button", { name: /^Dejar fuera a/ }).click();
      await esperarListo(c.page);
    },
  },
  {
    id: "conv-hermanos-exito",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Pantalla «Listo: familia e inscripción creadas» con dos niños inscritos (el POST final se responde en la escena)",
    tipo: "pantalla",
    ruta: RUTA,
    fuentes: FUENTES_ASISTENTE,
    ir: async (c) => {
      await irAConfirmarHermanos(c);
      const lead = (await (await c.page.request.get(`/api/leads/${prado(c).leadId}`)).json()) as { prospectos: { id: string }[] };
      await responderEscritura(c, "POST", /\/convertir$/, 201, await resultadoDeConversion(c, lead.prospectos.map((p) => ({ prospectoId: p.id, creado: true, inscripcionCreada: true }))));
      await convertir(c);
      await c.page.locator('[data-prueba="conversion-lista"]').waitFor();
      await esperarListo(c.page);
    },
  },
];

// ─── Hermanos: ayudas que escriben (solo sobre el lead consumible de la vista) ───────────────

/** Agrega un segundo niño al lead consumible (idempotente: repetirlo no crea otro). */
async function agregarHermano(c: Contexto): Promise<void> {
  const r = await c.page.request.post(`/api/leads/${prado(c).leadId}/prospectos`, {
    data: { nombre: "Mateo", apellidos: "Prado", fecha_nacimiento: nacidoHace(6), clave_idempotencia: `diseno-hermano-${c.vista}` },
    headers: { "x-requested-with": "diseno" },
  });
  if (!r.ok()) throw new Error(`No se pudo agregar el hermano (${r.status()}): ${await r.text()}`);
}

/** El id del niño agregado por `agregarHermano` (el que no es el primero). */
async function idDelHermano(c: Contexto): Promise<string> {
  const lead = (await (await c.page.request.get(`/api/leads/${prado(c).leadId}`)).json()) as { prospectos: { id: string }[] };
  return lead.prospectos.find((p) => p.id !== prado(c).prospectoId)?.id ?? prado(c).prospectoId;
}

/** Llega al paso «Confirmar» con los dos niños (el reglamento del segundo se extiende del primero). */
async function irAConfirmarHermanos(c: Contexto): Promise<void> {
  await agregarHermano(c);
  await irAlPaso(c, prado(c).leadId, "Reglamento e imagen", datosPrado(c));
  const extender = c.page.getByRole("button", { name: /^Aceptan lo mismo que por/ });
  if (await extender.count()) await extender.click();
  await c.page.getByText("Falta que la familia acepte el reglamento vigente").waitFor({ state: "detached" });
  await esperarListo(c.page);
  await esperarHabilitado(c, siguiente(c));
  await siguiente(c).click();
  await c.page.getByRole("heading", { name: "Confirmar", exact: true }).waitFor();
  await esperarListo(c.page);
}

/** Tras llegar al estado la página vuelve arriba: una captura de página entera tomada con la pantalla desplazada deja la barra lateral y el encabezado fijos a media imagen. */
export const ESCENAS: Escena[] = ESCENAS_SIN_ENVOLVER.map((e) => ({
  ...e,
  ir: async (c) => {
    await e.ir(c);
    await c.page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
    await c.page.waitForTimeout(100);
  },
}));
