// Escenas del área «Familias, alumnos y expediente»: la lista de alumnos, el expediente (cuatro secciones) y la salud del alumno, la lista de familias, «con un solo hijo», la ficha de la
// familia y los cuadros de las acciones sobre una inscripción (cambiar de grupo, congelar, reactivar, dar de baja). Prefijo de ids: `familia-`.
//
// Las escenas que NO escriben van primero y usan a la familia Rivera (`mundo.familia.rivera`) sin cambiarla; lo que el mundo no trae (una inscripción congelada o en baja, un estado de cuenta
// que no está disponible, promociones, bajas…) se arma editando la respuesta GET de la API, solo en esa escena. Las que SÍ envían (congelar, reactivar, cambiar de grupo, dar de baja) van AL FINAL
// y usan solo a la familia Rivera: como cada escena corre dos veces (escritorio y celular) y lo que escribe ya no se deshace, el escritorio usa al hijo mayor y el celular al hijo menor,
// y cada uno recorre la misma cadena en el mismo orden.

import { conCargando, conError, conMuchosDatos, conVacio, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena } from "./escenas.ts";

const GRUPO = "Familias, alumnos y expediente";
const P = "web/src/pantallas/familia/";
const ALUMNOS = `${P}AlumnosLista.tsx`;
const EXPEDIENTE = `${P}Expediente.tsx`;
const FAMILIAS = `${P}Familias.tsx`;
const FICHA = `${P}FichaFamilia.tsx`;
const SALUD_PANTALLA = `${P}SaludDelAlumno.tsx`;
const ACCIONES = `${P}AccionesDeInscripcion.tsx`;
/** R6a: lo que pinta «Alumnos» (la lista, la tarjeta, las píldoras de disciplina y la barra de asistencia) y el expediente (el encabezado y un panel por pestaña). */
const ALUMNOS_FUENTES = [ALUMNOS, `${P}TarjetaDeAlumno.tsx`, `${P}PildorasDeDisciplina.tsx`, `${P}BarraDeAvance.tsx`];
const EXPEDIENTE_FUENTES = [EXPEDIENTE, `${P}PanelTrayectoria.tsx`, `${P}PanelAsistencia.tsx`, `${P}PanelEconomico.tsx`, `${P}PanelComercial.tsx`, `${P}PanelSalud.tsx`, `${P}BarraDeAvance.tsx`];
const VISTA_SALUD = "web/src/salud/VistaDeSalud.tsx";
const DIALOGO = "web/src/ui/Dialogo.tsx";

// ─── Ayudas propias ──────────────────────────────────────────────────────────────────────────

 
type Json = any;
type Coincide = (u: URL) => boolean;

const esRuta = (ruta: string): Coincide => (u) => u.pathname === ruta;
const termina = (final: string): Coincide => (u) => u.pathname.startsWith("/api/") && u.pathname.endsWith(final);

/** Edita la respuesta JSON de un GET de la API antes de que llegue a la página (las demás peticiones siguen su camino). */
async function editarGet(c: Contexto, coincide: Coincide, editar: (cuerpo: Json) => Json): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    async (r) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      if (!resp.ok()) return r.fulfill({ response: resp });
      const cuerpo = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify(editar(cuerpo)) });
    },
  );
}

/** R9b: la lista de `ruta` (tutores o alumnos) llega vacía SOLO cuando se pide con `con_atraso=true`; sin el filtro es la real. */
async function vaciarConAtraso(c: Contexto, ruta: string): Promise<void> {
  await c.page.route(
    (u) => u.pathname === ruta && u.searchParams.get("con_atraso") === "true",
    async (r) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      if (!resp.ok()) return r.fulfill({ response: resp });
      const b = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify({ ...b, datos: [], paginacion: { ...b.paginacion, total: 0, pagina: 1 } }) });
    },
  );
}

/** Un GET a la API que nunca termina (esa parte de la pantalla se queda «Cargando…»). */
async function colgar(c: Contexto, coincide: Coincide): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    (r) => (r.request().method() === "GET" ? new Promise<void>(() => undefined) : r.fallback()),
  );
}

/** Un GET a la API que falla con 500. */
async function romper(c: Contexto, coincide: Coincide): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    (r) =>
      r.request().method() === "GET"
        ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { codigo: "interno", mensaje: "Algo salió mal en el servidor. Inténtalo de nuevo.", detalles: [] } }) })
        : r.fallback(),
  );
}

/** Dice que la lista tiene `total` registros (la API devuelve pocos): se ve el paginador. En la página 2 la API ya no trae nada: se repiten las filas de la primera. `incompleta` agrega el aviso de búsqueda incompleta. */
function conTotal(total: number, incompleta = false): (cuerpo: Json) => Json {
  let primeras: Json[] = [];
  return (cuerpo) => {
    if (cuerpo.datos.length > 0 && primeras.length === 0) primeras = cuerpo.datos;
    return { ...cuerpo, datos: cuerpo.datos.length > 0 ? cuerpo.datos : primeras, paginacion: { ...cuerpo.paginacion, total, ...(incompleta ? { busqueda_incompleta: true } : {}) } };
  };
}

const rivera = (c: Contexto) => c.mundo.familia.rivera;
const mayor = (c: Contexto) => rivera(c).hijos[0]!;
const menor = (c: Contexto) => rivera(c).hijos[1]!;
/** El hijo de la vista: las escenas que escriben usan al mayor en escritorio y al menor en celular, para que cada vista vea la misma cadena de cambios. */
const hijoDeLaVista = (c: Contexto) => (c.vista === "escritorio" ? mayor(c) : menor(c));

const rutaExpediente = (alumnoId: string): string => `/alumnos/${alumnoId}`;
const rutaFicha = (c: Contexto): string => `/familias/${rivera(c).tutorId}`;
const rutaSalud = (c: Contexto): string => `/alumnos/${c.mundo.familia.salud.alumnoId}/salud`;

async function abrirPestana(c: Contexto, nombre: "Trayectoria" | "Asistencia" | "Económico" | "Comercial" | "Salud"): Promise<void> {
  await c.page.getByRole("tab", { name: nombre }).click();
  await esperarListo(c.page);
}

/** El expediente del hijo mayor, en la pestaña que se pide. */
async function expediente(c: Contexto, pestana: "Trayectoria" | "Asistencia" | "Económico" | "Comercial" | "Salud" = "Trayectoria", alumnoId = mayor(c).alumnoId): Promise<void> {
  await irA(c, rutaExpediente(alumnoId));
  if (pestana !== "Trayectoria") await abrirPestana(c, pestana);
}

/** Abre el cuadro de una acción del hijo (mayor por omisión) y deja el `<dialog>` visible. */
async function abrirAccion(c: Contexto, boton: "Cambiar de grupo" | "Congelar" | "Reactivar" | "Dar de baja", hijo = mayor(c)): Promise<void> {
  await c.page.getByTestId(`acciones-${hijo.inscripcionId}`).getByRole("button", { name: boton, exact: true }).click();
  await c.page.locator("dialog[open]").waitFor();
  await esperarListo(c.page);
}

const dialogo = (c: Contexto) => c.page.locator("dialog[open]");

/** Elige un grupo en el cuadro de cambiar de grupo (R6a: botones grandes; el nombre lleva el texto «· N lugares» después). */
async function elegirGrupo(c: Contexto, nombre: string): Promise<void> {
  await dialogo(c).getByRole("button", { name: `${nombre} · ` }).click();
  await esperarListo(c.page);
}

/** Elige el motivo de baja del catálogo de la prueba en el cuadro de dar de baja. */
async function elegirMotivo(c: Contexto): Promise<void> {
  await dialogo(c).getByRole("group", { name: "Motivo de la baja" }).getByRole("button", { name: c.mundo.familia.motivoBaja.nombre, exact: true }).click();
  await esperarListo(c.page);
}

/** Escritura que el servidor rechaza con un 409 (un rechazo de negocio): el mensaje sale dentro del cuadro. */
async function rechazo(c: Contexto, mensaje: string): Promise<void> {
  await fallarLaSiguienteEscritura(c, 409, mensaje);
}

// ─── Datos armados para estados que el mundo no trae ─────────────────────────────────────────

function conTrayectoriaCompleta(b: Json): Json {
  const t = b.trayectoria;
  const base = t.inscripciones[0];
  t.inscripciones = [
    base,
    { ...base, id: "insc-congelada-de-muestra", estatus: "congelada", grupo: { id: "g-muestra-1", nombre: "Grupo congelado de muestra" } },
    { ...base, id: "insc-baja-de-muestra", estatus: "baja", fecha_baja: "2026-08-15", grupo: { id: "g-muestra-2", nombre: "Grupo de baja de muestra" } },
  ];
  t.historial_de_cambios_de_grupo = [
    { inscripcion_id: base.id, fecha: "2026-09-01", grupo_anterior: { id: "g-muestra-3", nombre: "Grupo anterior" }, grupo_nuevo: base.grupo },
    { inscripcion_id: base.id, fecha: "2026-09-20", grupo_anterior: base.grupo, grupo_nuevo: { id: "g-muestra-4", nombre: "Grupo nuevo" } },
  ];
  t.niveles = [
    { vertical: { id: "v-muestra-1", nombre: base.vertical.nombre, etiqueta_progresion: "Nivel" }, nivel: { id: "n-muestra-1", nombre: "Nivel 2", color_hex: null }, fecha_obtenido: "2026-06-01" },
    { vertical: { id: "v-muestra-2", nombre: "Otra disciplina", etiqueta_progresion: null }, nivel: null, fecha_obtenido: null },
  ];
  t.proximo_examen = [
    {
      vertical: { id: "v-muestra-1", nombre: base.vertical.nombre, etiqueta_evento: "Examen" },
      evento: { id: "e-muestra-1", nombre: "Examen de otoño", tipo: "examen", fecha: "2026-11-20", estatus_del_alumno: null },
      elegibilidad: { elegible: false, motivo: null, clases_cumplidas: 8, clases_requeridas: 12, faltan: 4, siguiente_nivel: { id: "n-muestra-2", nombre: "Nivel 3" } },
    },
    {
      vertical: { id: "v-muestra-3", nombre: "Una disciplina más", etiqueta_evento: null },
      evento: { id: "e-muestra-2", nombre: "Muestra de fin de curso", tipo: "evento", fecha: "2026-12-12", estatus_del_alumno: null },
      elegibilidad: { elegible: true, motivo: null, clases_cumplidas: 12, clases_requeridas: 12, faltan: 0, siguiente_nivel: null },
    },
    { vertical: { id: "v-muestra-4", nombre: "Sin evento", etiqueta_evento: null }, evento: null, elegibilidad: { elegible: false, motivo: null, clases_cumplidas: 3, clases_requeridas: 12, faltan: 9, siguiente_nivel: null } },
  ];
  return b;
}

function conEconomicoCompleto(b: Json): Json {
  const e = b.economico;
  if (!e) return b;
  e.promocion_aplicada = [
    {
      inscripcion_id: "insc-muestra",
      promocion: { id: "p-muestra", nombre: "Promoción de muestra" },
      beneficios: [
        { tipo: "descuento_mensualidad", descripcion: "Primeros tres meses", descuento: "200.00", meses_gratis: 0, estatus: "aplicado" },
        { tipo: "producto_gratis", descripcion: "Uniforme", descuento: "0.00", meses_gratis: 0, estatus: "pendiente" },
      ],
    },
  ];
  e.beneficios_pendientes = [{ inscripcion_id: "insc-muestra", promocion: "Promoción de muestra", tipo: "producto_gratis", descripcion: "Uniforme talla 8" }];
  return b;
}

function conEconomicoSinCuenta(b: Json): Json {
  if (b.economico) b.economico.estado_de_cuenta = { disponible: false, motivo: "finanzas_apagado" };
  return b;
}

function conOperativoCompleto(b: Json): Json {
  const o = b.operativo;
  o.asistencia = { porcentaje_30_dias: 62, racha_de_faltas: 3, umbral_de_faltas: 3, por_inscripcion: [] };
  o.eventos = [
    { evento: { id: "e-muestra-1", nombre: "Examen de verano", tipo: "examen", fecha: "2026-07-18" }, estatus: "asistio", resultado: "aprobado", nivel_otorgado: { id: "n-muestra-1", nombre: "Nivel 2" } },
    { evento: { id: "e-muestra-2", nombre: "Muestra de primavera", tipo: "evento", fecha: "2026-04-25" }, estatus: "inscrito", resultado: null, nivel_otorgado: null },
  ];
  o.productos_comprados = { disponible: true, productos: [{ producto: "Uniforme talla 8", cantidad: 1, fecha: "2026-09-02" }, { producto: "Gorra", cantidad: 2, fecha: "2026-09-10" }] };
  return b;
}

function conOperativoSinDatos(b: Json): Json {
  const o = b.operativo;
  o.asistencia = { porcentaje_30_dias: null, racha_de_faltas: 0, umbral_de_faltas: 3, por_inscripcion: [] };
  o.eventos = [];
  o.productos_comprados = { disponible: false, motivo: "sin_datos" };
  return b;
}

function conComercialCompleto(b: Json): Json {
  const cm = b.comercial;
  if (!cm) return b;
  cm.origen_del_lead = [{ lead_id: "lead-muestra", campana: { id: "c-muestra", nombre: "Campaña de muestra", origen: "facebook" }, canal: "WhatsApp", fuente: "Anuncio", codigo_de_rastreo: "ABC123" }];
  cm.dias_para_cerrar = [{ lead_id: "lead-muestra", dias: 9 }];
  cm.hermanos_inscritos = [
    { alumno_id: "a-muestra-1", alumno: "Hermano de muestra", verticales: [{ id: "v-muestra-1", nombre: "Una disciplina" }, { id: "v-muestra-2", nombre: "Otra disciplina" }] },
    { alumno_id: "a-muestra-2", alumno: "Hermana de muestra", verticales: [{ id: "v-muestra-1", nombre: "Una disciplina" }] },
  ];
  cm.motivo_de_baja = [
    { inscripcion_id: "insc-baja-de-muestra", fecha_baja: "2026-08-15", motivo: { id: "m-muestra", codigo: "mudanza", nombre: "Mudanza de ciudad" } },
    { inscripcion_id: "insc-baja-de-muestra-2", fecha_baja: "2026-09-02", motivo: null },
  ];
  return b;
}

/** La primera inscripción del expediente con otro estatus. */
function conEstatus(estatus: "activa" | "congelada" | "baja"): (b: Json) => Json {
  return (b) => {
    const i = b.trayectoria.inscripciones[0];
    i.estatus = estatus;
    if (estatus === "baja") i.fecha_baja = "2026-10-01";
    return b;
  };
}

function fichaCompleta(b: Json): Json {
  b.correo = null;
  b.direccion = "Calle de muestra 123, colonia de muestra";
  b.como_nos_conocio = "Recomendación de una amiga";
  const base = b.alumnos[0];
  b.alumnos = [
    base,
    { ...base, alumno_id: "a-muestra-congelado", nombre: "Hijo congelado", estatus: "congelado", parentesco: "madre", es_responsable_pago: false, es_contacto_urgencia: true, puede_recoger: true, lo_lleva: true },
    { ...base, alumno_id: "a-muestra-baja", nombre: "Hijo dado de baja", estatus: "baja", parentesco: "madre", es_responsable_pago: false, es_contacto_urgencia: false, puede_recoger: false, lo_lleva: false },
  ];
  return b;
}

const sinHijos = (b: Json): Json => ({ ...b, alumnos: [] });

// R6a: colores de ejemplo para las disciplinas (en la aplicación salen del dato `color_marca` de cada una, nunca de aquí) y datos armados para las tarjetas y las clases del expediente.
const COLORES_DE_EJEMPLO = ["#c8402a", "#c43a73", "#1f7a8c"];

type Variedad = { asistencia: number | null; cuenta: "con_vencido" | "por_pagar" | "al_corriente" };
const VARIEDAD: Variedad[] = [
  { asistencia: 62, cuenta: "con_vencido" },
  { asistencia: 94, cuenta: "por_pagar" },
  { asistencia: 71, cuenta: "con_vencido" },
  { asistencia: 97, cuenta: "al_corriente" },
  { asistencia: 100, cuenta: "al_corriente" },
  { asistencia: null, cuenta: "al_corriente" },
];

/** Las tarjetas de «Alumnos» con disciplinas de colores, asistencia y cuenta variadas (el resumen real trae pocas). `conCuenta: false`: la cuenta se queda como la mandó el servidor (el maestro no la ve). */
async function conResumenVariado(c: Contexto, variedad: Variedad[] = VARIEDAD, conCuenta = true): Promise<void> {
  await editarGet(c, esRuta("/api/alumnos/resumen"), (b) => ({
    ...b,
    datos: b.datos.map((r: Json, i: number) => {
      const v = variedad[i % variedad.length]!;
      const color = COLORES_DE_EJEMPLO[i % COLORES_DE_EJEMPLO.length];
      return { ...r, inscripciones: r.inscripciones.map((x: Json) => ({ ...x, vertical: { ...x.vertical, color_marca: color } })), asistencia_30_dias: v.asistencia, cuenta: conCuenta ? v.cuenta : r.cuenta };
    }),
  }));
}

/** Tres píldoras de disciplina con color: la primera es la real (filtra de verdad); las otras dos solo se ven. */
async function conDisciplinasDeColor(c: Contexto): Promise<void> {
  await editarGet(c, esRuta("/api/verticales"), (b) => {
    const base = b.datos[0];
    return { ...b, datos: [0, 1, 2].map((i) => (i === 0 ? { ...base, color_marca: COLORES_DE_EJEMPLO[0], activo: true } : { ...base, id: `v-muestra-${i}`, nombre: `Disciplina ${i + 1}`, slug: `disciplina-${i + 1}`, color_marca: COLORES_DE_EJEMPLO[i], activo: true })) };
  });
}

/** Las disciplinas del expediente armado (la real y las `v-muestra-N` de `conTrayectoriaCompleta`) con su color. */
async function conColoresDeDisciplina(c: Contexto): Promise<void> {
  await editarGet(c, esRuta("/api/verticales"), (b) => {
    const base = b.datos[0];
    const propias = b.datos.map((v: Json, i: number) => ({ ...v, color_marca: COLORES_DE_EJEMPLO[i % COLORES_DE_EJEMPLO.length] }));
    const armadas = ["v-muestra-1", "v-muestra-2", "v-muestra-3"].map((id, i) => ({ ...base, id, nombre: `Disciplina ${i + 2}`, slug: id, color_marca: COLORES_DE_EJEMPLO[(i + 1) % COLORES_DE_EJEMPLO.length] }));
    return { ...b, datos: [...propias, ...armadas] };
  });
}

/** Dieciséis clases con pase de lista, la más reciente primero (como las manda la API): la mayoría presente, una justificada y las últimas tres faltas. */
function clasesDeEjemplo(b: Json): Json {
  const dias = ["2026-10-12", "2026-10-07", "2026-10-05", "2026-09-14", "2026-09-09", "2026-09-07", "2026-09-02", "2026-08-31", "2026-08-26", "2026-08-24", "2026-08-19", "2026-08-17", "2026-08-12", "2026-08-10", "2026-08-05", "2026-08-03"];
  const marcas = ["falta", "falta", "falta", "presente", "presente", "falta", "presente", "presente", "presente", "falta", "presente", "presente", "justificada", "presente", "presente", "presente"];
  return { ...b, datos: dias.map((fecha, i) => ({ id: `pase-${i}`, fecha, estatus: marcas[i], metodo: "manual", grupo_id: "g-muestra" })), paginacion: { ...b.paginacion, total: dias.length } };
}

/** Un alumno con otro estatus en el expediente (la píldora del encabezado). */
const conEstatusDelAlumno = (estatus: "activo" | "congelado" | "baja"): ((b: Json) => Json) => (b) => ({ ...b, alumno: { ...b.alumno, estatus } });

// ─── Escenas ─────────────────────────────────────────────────────────────────────────────────

const esc = (e: Omit<Escena, "grupo">): Escena => ({ grupo: GRUPO, ...e });

const escenasDeAlumnos: Escena[] = [
  // ═══ Alumnos (lista) ═══
  esc({ id: "familia-alumnos-lista", rol: "recepcion", titulo: "Alumnos: buscador y lista con datos (recepción, asesor y administrador)", tipo: "pantalla", ruta: "/alumnos", fuentes: ALUMNOS_FUENTES, ir: (c) => irA(c, "/alumnos") }),
  esc({
    id: "familia-alumnos-lista-buscar-nombre",
    rol: "recepcion",
    titulo: "Alumnos: búsqueda por nombre con resultados («Hija»)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Nombre o teléfono").fill("Hija");
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-alumnos-lista-buscar-telefono",
    rol: "recepcion",
    titulo: "Alumnos: búsqueda por el teléfono de un adulto de la familia",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Nombre o teléfono").fill("(55) 5503 0303");
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-alumnos-lista-sin-resultados",
    rol: "recepcion",
    titulo: "Alumnos: búsqueda sin resultados («No hay alumnos que coincidan»)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Nombre o teléfono").fill("Zzzzzz");
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await c.page.getByText("No hay alumnos que coincidan").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-alumnos-lista-filtro-congelados",
    rol: "recepcion",
    titulo: "Alumnos: filtrada por estatus «Congelados»",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Estatus").selectOption("congelado");
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-alumnos-lista-filtro-bajas",
    rol: "recepcion",
    titulo: "Alumnos: filtrada por estatus «Bajas»",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Estatus").selectOption("baja");
      await esperarListo(c.page);
    },
  }),
  esc({ id: "familia-alumnos-lista-vacio", rol: "recepcion", titulo: "Alumnos: lista vacía («No hay alumnos que coincidan»)", tipo: "estado", ruta: "/alumnos", fuentes: ALUMNOS_FUENTES, ir: (c) => conVacio(c, "/alumnos") }),
  esc({ id: "familia-alumnos-lista-muchos", rol: "recepcion", titulo: "Alumnos: lista con muchos datos (veinte tarjetas)", tipo: "estado", ruta: "/alumnos", fuentes: ALUMNOS_FUENTES, ir: (c) => conMuchosDatos(c, "/alumnos", 3) }),
  esc({
    id: "familia-alumnos-lista-paginacion",
    rol: "recepcion",
    titulo: "Alumnos: paginador «Página 2 de 4» (tras pulsar «Siguiente»)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: [...ALUMNOS_FUENTES, "web/src/ui/Paginador.tsx"],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/alumnos"), conTotal(65));
      await irA(c, "/alumnos");
      await c.page.getByRole("button", { name: "Siguiente" }).click();
      await c.page.getByText("Página 2 de 4").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-alumnos-lista-busqueda-incompleta",
    rol: "recepcion",
    titulo: "Alumnos: aviso «Hay más resultados de los que se pudieron revisar» (búsqueda por nombre incompleta)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: [...ALUMNOS_FUENTES, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/alumnos"), conTotal(30, true));
      await irA(c, "/alumnos");
      await c.page.getByLabel("Nombre o teléfono").fill("Hij");
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await c.page.getByText("Hay más resultados de los que se pudieron revisar").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({ id: "familia-alumnos-lista-cargando", rol: "recepcion", titulo: "Alumnos: cargando", tipo: "estado", ruta: "/alumnos", fuentes: ALUMNOS_FUENTES, ir: (c) => conCargando(c, "/alumnos", "Alumnos") }),
  esc({ id: "familia-alumnos-lista-error", rol: "recepcion", titulo: "Alumnos: error de carga con «Reintentar»", tipo: "estado", ruta: "/alumnos", fuentes: ALUMNOS_FUENTES, ir: (c) => conError(c, "/alumnos") }),
  esc({
    id: "familia-alumnos-lista-sin-conexion",
    rol: "recepcion",
    titulo: "Alumnos: al buscar sin conexión («No hay conexión con el servidor»)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Nombre o teléfono").fill("Hija");
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await c.page.getByText("No hay conexión con el servidor").first().waitFor();
      await c.page.context().setOffline(false);
      await esperarListo(c.page);
    },
  }),
];

const escenasDeExpediente: Escena[] = [
  // ═══ Expediente (/alumnos/:id) ═══
  esc({ id: "familia-expediente-trayectoria-recepcion", rol: "recepcion", titulo: "Expediente, «Trayectoria», con datos y las acciones sobre la inscripción (recepción)", tipo: "pantalla", ruta: "/alumnos/:id", fuentes: EXPEDIENTE_FUENTES, ir: (c) => expediente(c) }),
  esc({
    id: "familia-expediente-trayectoria-asesor",
    rol: "asesor",
    titulo: "Expediente, «Trayectoria», con datos (asesor)",
    tipo: "pantalla",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: (c) => expediente(c),
  }),
  esc({
    id: "familia-expediente-trayectoria-administrador",
    rol: "administrador",
    titulo: "Expediente, «Trayectoria», con datos y el botón «Salud» (administrador)",
    tipo: "pantalla",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: (c) => expediente(c, "Trayectoria", c.mundo.familia.salud.alumnoId),
  }),
  esc({ id: "familia-expediente-economico", rol: "recepcion", titulo: "Expediente, «Económico»: mensualidad, cuenta (recepción, asesor y administrador)", tipo: "pantalla", ruta: "/alumnos/:id", fuentes: EXPEDIENTE_FUENTES, ir: (c) => expediente(c, "Económico") }),
  esc({ id: "familia-expediente-asistencia", rol: "recepcion", titulo: "Expediente, «Asistencia»: porcentaje, últimas clases, eventos y productos (recepción, asesor y administrador)", tipo: "pantalla", ruta: "/alumnos/:id", fuentes: EXPEDIENTE_FUENTES, ir: (c) => expediente(c, "Asistencia") }),
  esc({ id: "familia-expediente-comercial", rol: "recepcion", titulo: "Expediente, «Comercial»: cómo llegó, hermanos (recepción, asesor y administrador)", tipo: "pantalla", ruta: "/alumnos/:id", fuentes: EXPEDIENTE_FUENTES, ir: (c) => expediente(c, "Comercial") }),

  // Con todo lo que puede haber (armado)
  esc({
    id: "familia-expediente-trayectoria-completa",
    rol: "recepcion",
    titulo: "Expediente, «Trayectoria» con todo: inscripción activa, congelada y en baja, cambios de grupo, avance y próximo evento",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conTrayectoriaCompleta);
      await expediente(c);
    },
  }),
  esc({
    id: "familia-expediente-economico-completo",
    rol: "recepcion",
    titulo: "Expediente, «Económico» con promoción aplicada y beneficios pendientes",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conEconomicoCompleto);
      await expediente(c, "Económico");
    },
  }),
  esc({
    id: "familia-expediente-economico-sin-cuenta",
    rol: "recepcion",
    titulo: "Expediente, «Económico» con «El estado de cuenta todavía no está disponible»",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conEconomicoSinCuenta);
      await expediente(c, "Económico");
    },
  }),
  esc({
    id: "familia-expediente-asistencia-completa",
    rol: "recepcion",
    titulo: "Expediente, «Asistencia» con faltas en el umbral, eventos con resultado y productos comprados",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conOperativoCompleto);
      await expediente(c, "Asistencia");
    },
  }),
  esc({
    id: "familia-expediente-asistencia-sin-datos",
    rol: "recepcion",
    titulo: "Expediente, «Asistencia» sin asistencia, sin eventos y con «No disponible todavía»",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conOperativoSinDatos);
      await expediente(c, "Asistencia");
    },
  }),
  esc({
    id: "familia-expediente-comercial-completo",
    rol: "recepcion",
    titulo: "Expediente, «Comercial» con campaña, hermanos inscritos y bajas",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conComercialCompleto);
      await expediente(c, "Comercial");
    },
  }),
  esc({
    id: "familia-expediente-inscripcion-congelada",
    rol: "recepcion",
    titulo: "Expediente con la inscripción congelada (la acción pasa a «Reactivar»)",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, ACCIONES],
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conEstatus("congelada"));
      await expediente(c);
    },
  }),
  esc({
    id: "familia-expediente-inscripcion-baja",
    rol: "recepcion",
    titulo: "Expediente con la inscripción en baja (sin acciones)",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, ACCIONES],
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conEstatus("baja"));
      await expediente(c);
    },
  }),

  // Vacío, muchos datos, cargando y error de cada sección
  ...(["Trayectoria", "Asistencia", "Económico", "Comercial"] as const).flatMap((pestana): Escena[] => {
    const p = pestana.toLowerCase().replace("ó", "o");
    return [
      esc({
        id: `familia-expediente-${p}-vacio`,
        rol: "recepcion",
        titulo: `Expediente, «${pestana}» sin nada que mostrar (listas vacías)`,
        tipo: "estado",
        ruta: "/alumnos/:id",
        fuentes: EXPEDIENTE_FUENTES,
        ir: async (c) => {
          await conVacio(c, rutaExpediente(mayor(c).alumnoId));
          if (pestana !== "Trayectoria") await abrirPestana(c, pestana);
        },
      }),
      esc({
        id: `familia-expediente-${p}-muchos`,
        rol: "recepcion",
        titulo: `Expediente, «${pestana}» con muchos datos (listas repetidas)`,
        tipo: "estado",
        ruta: "/alumnos/:id",
        fuentes: EXPEDIENTE_FUENTES,
        ir: async (c) => {
          await editarGet(c, termina("/expediente"), pestana === "Trayectoria" ? conTrayectoriaCompleta : pestana === "Económico" ? conEconomicoCompleto : pestana === "Asistencia" ? conOperativoCompleto : conComercialCompleto);
          await conMuchosDatos(c, rutaExpediente(mayor(c).alumnoId), 6);
          if (pestana !== "Trayectoria") await abrirPestana(c, pestana);
        },
      }),
    ];
  }),
  esc({ id: "familia-expediente-cargando", rol: "recepcion", titulo: "Expediente: cargando", tipo: "estado", ruta: "/alumnos/:id", fuentes: EXPEDIENTE_FUENTES, ir: (c) => conCargando(c, rutaExpediente(mayor(c).alumnoId), "Expediente") }),
  esc({ id: "familia-expediente-error", rol: "recepcion", titulo: "Expediente: error de carga con «Reintentar»", tipo: "estado", ruta: "/alumnos/:id", fuentes: EXPEDIENTE_FUENTES, ir: (c) => conError(c, rutaExpediente(mayor(c).alumnoId)) }),
  esc({ id: "familia-expediente-no-encontrado", rol: "recepcion", titulo: "Expediente de un alumno que no existe (404)", tipo: "estado", ruta: "/alumnos/:id", fuentes: EXPEDIENTE_FUENTES, ir: (c) => conError(c, rutaExpediente(mayor(c).alumnoId), 404) }),
];

// ═══ Cuadros de las acciones sobre la inscripción (no escriben) ═══
const escenasDeAcciones: Escena[] = [
  // Cambiar de grupo
  esc({
    id: "familia-acciones-cambiar-vacio",
    rol: "recepcion",
    titulo: "Cuadro «Cambiar de grupo» vacío (elegir el grupo nuevo; «Confirmar el cambio» apagado)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Cambiar de grupo");
    },
  }),
  esc({
    id: "familia-acciones-cambiar-elegido",
    rol: "recepcion",
    titulo: "Cuadro «Cambiar de grupo» con el grupo de un solo lugar elegido («· 1 lugar»)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Cambiar de grupo");
      await elegirGrupo(c, c.mundo.familia.grupoDeUnLugar.nombre);
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-acciones-cambiar-grupo-lleno",
    rol: "recepcion",
    titulo: "Cuadro «Cambiar de grupo» con el grupo de un solo lugar ya lleno («· lleno», no se puede elegir)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      const lleno = c.mundo.familia.grupoDeUnLugar.id;
      await editarGet(c, esRuta("/api/reportes/ocupacion"), (b) => ({ ...b, datos: b.datos.map((f: Json) => (f.grupo.id === lleno ? { ...f, ocupados: f.cupo_maximo } : f)) }));
      await expediente(c);
      await abrirAccion(c, "Cambiar de grupo");
    },
  }),
  esc({
    id: "familia-acciones-cambiar-sin-grupos",
    rol: "recepcion",
    titulo: "Cuadro «Cambiar de grupo» sin otro grupo activo del programa",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/grupos"), (b) => ({ ...b, datos: [], paginacion: { ...b.paginacion, total: 0 } }));
      await expediente(c);
      await abrirAccion(c, "Cambiar de grupo");
    },
  }),
  esc({
    id: "familia-acciones-cambiar-cargando",
    rol: "recepcion",
    titulo: "Cuadro «Cambiar de grupo» cargando los grupos y sus lugares",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await colgar(c, esRuta("/api/grupos"));
      await c.page.getByTestId(`acciones-${mayor(c).inscripcionId}`).getByRole("button", { name: "Cambiar de grupo", exact: true }).click();
      await c.page.locator("dialog[open]").waitFor();
      await c.page.getByText("Cargando…").waitFor();
      await c.page.waitForTimeout(150);
    },
  }),
  esc({
    id: "familia-acciones-cambiar-error-carga",
    rol: "recepcion",
    titulo: "Cuadro «Cambiar de grupo» con error al cargar los lugares de cada grupo («Reintentar»)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await romper(c, esRuta("/api/reportes/ocupacion"));
      await abrirAccion(c, "Cambiar de grupo");
    },
  }),
  esc({
    id: "familia-acciones-cambiar-error-servidor",
    rol: "recepcion",
    titulo: "Cuadro «Cambiar de grupo» con el rechazo del servidor (el último lugar se ocupó mientras se miraba)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Cambiar de grupo");
      await elegirGrupo(c, c.mundo.familia.grupoDeUnLugar.nombre);
      await rechazo(c, "El grupo ya no tiene lugares: no se cambió nada");
      await dialogo(c).getByRole("button", { name: "Confirmar el cambio" }).click();
      await dialogo(c).getByTestId("error-de-guardado").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-acciones-cambiar-sin-conexion",
    rol: "recepcion",
    titulo: "Cuadro «Cambiar de grupo» sin conexión al confirmar",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Cambiar de grupo");
      await elegirGrupo(c, c.mundo.familia.grupoDestino.nombre);
      await cortarLaRed(c);
      await dialogo(c).getByRole("button", { name: "Confirmar el cambio" }).click();
      await dialogo(c).getByText("No hay conexión con el servidor").first().waitFor();
      await c.page.context().setOffline(false);
      await esperarListo(c.page);
    },
  }),

  // Congelar
  esc({
    id: "familia-acciones-congelar",
    rol: "recepcion",
    titulo: "Cuadro «Congelar la inscripción»: la confirmación",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Congelar");
    },
  }),
  esc({
    id: "familia-acciones-congelar-error-servidor",
    rol: "recepcion",
    titulo: "Cuadro «Congelar la inscripción» con el rechazo del servidor",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Congelar");
      await rechazo(c, "La inscripción cambió mientras tanto: vuelve a intentarlo");
      await dialogo(c).getByRole("button", { name: "Congelar", exact: true }).click();
      await dialogo(c).getByTestId("error-de-guardado").waitFor();
      await esperarListo(c.page);
    },
  }),

  // Reactivar (la inscripción se ve congelada solo en esta escena)
  esc({
    id: "familia-acciones-reactivar",
    rol: "recepcion",
    titulo: "Cuadro «Reactivar la inscripción»: la confirmación",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conEstatus("congelada"));
      await expediente(c);
      await abrirAccion(c, "Reactivar");
    },
  }),
  esc({
    id: "familia-acciones-reactivar-error-servidor",
    rol: "recepcion",
    titulo: "Cuadro «Reactivar la inscripción» con el rechazo del servidor (el grupo se llenó mientras estaba congelada)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conEstatus("congelada"));
      await expediente(c);
      await abrirAccion(c, "Reactivar");
      await rechazo(c, "El grupo se llenó mientras estaba congelada: no hay lugar para reactivarla");
      await dialogo(c).getByRole("button", { name: "Reactivar", exact: true }).click();
      await dialogo(c).getByTestId("error-de-guardado").waitFor();
      await esperarListo(c.page);
    },
  }),

  // Dar de baja
  esc({
    id: "familia-acciones-baja-vacio",
    rol: "recepcion",
    titulo: "Cuadro «Dar de baja» vacío (motivo obligatorio; «Dar de baja» apagado)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Dar de baja");
    },
  }),
  esc({
    id: "familia-acciones-baja-con-motivo",
    rol: "recepcion",
    titulo: "Cuadro «Dar de baja» con un motivo elegido («Dar de baja» habilitado)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Dar de baja");
      await elegirMotivo(c);
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-acciones-baja-sin-motivos",
    rol: "recepcion",
    titulo: "Cuadro «Dar de baja» sin motivos en el catálogo (lista de motivos vacía)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/motivos-baja"), (b) => ({ ...b, datos: [] }));
      await expediente(c);
      await abrirAccion(c, "Dar de baja");
    },
  }),
  esc({
    id: "familia-acciones-baja-cargando",
    rol: "recepcion",
    titulo: "Cuadro «Dar de baja» cargando los motivos",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await colgar(c, esRuta("/api/motivos-baja"));
      await c.page.getByTestId(`acciones-${mayor(c).inscripcionId}`).getByRole("button", { name: "Dar de baja", exact: true }).click();
      await c.page.locator("dialog[open]").waitFor();
      await c.page.getByText("Cargando…").waitFor();
      await c.page.waitForTimeout(150);
    },
  }),
  esc({
    id: "familia-acciones-baja-error-carga",
    rol: "recepcion",
    titulo: "Cuadro «Dar de baja» con error al cargar los motivos («Reintentar»)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await expediente(c);
      await romper(c, esRuta("/api/motivos-baja"));
      await abrirAccion(c, "Dar de baja");
    },
  }),
  esc({
    id: "familia-acciones-baja-error-servidor",
    rol: "recepcion",
    titulo: "Cuadro «Dar de baja» con el rechazo del servidor («La inscripción ya está dada de baja»)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Dar de baja");
      await elegirMotivo(c);
      await rechazo(c, "La inscripción ya está dada de baja");
      await dialogo(c).getByRole("button", { name: "Dar de baja", exact: true }).click();
      await dialogo(c).getByTestId("error-de-guardado").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-acciones-baja-sin-conexion",
    rol: "recepcion",
    titulo: "Cuadro «Dar de baja» sin conexión al confirmar",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await expediente(c);
      await abrirAccion(c, "Dar de baja");
      await elegirMotivo(c);
      await cortarLaRed(c);
      await dialogo(c).getByRole("button", { name: "Dar de baja", exact: true }).click();
      await dialogo(c).getByText("No hay conexión con el servidor").first().waitFor();
      await c.page.context().setOffline(false);
      await esperarListo(c.page);
    },
  }),
];

const escenasDeSalud: Escena[] = [
  // ═══ Salud del alumno (/alumnos/:id/salud): solo el administrador entre mis roles (el maestro la ve igual y la cubre su área) ═══
  esc({ id: "familia-salud-motivo", rol: "administrador", titulo: "Salud del alumno: se pide el motivo de la consulta (administrador; el maestro la ve igual)", tipo: "pantalla", ruta: "/alumnos/:id/salud", fuentes: [SALUD_PANTALLA, VISTA_SALUD], ir: (c) => irA(c, rutaSalud(c)) }),
  esc({
    id: "familia-salud-motivo-escrito",
    rol: "administrador",
    titulo: "Salud del alumno con el motivo escrito («Ver datos de salud» habilitado)",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: [SALUD_PANTALLA, VISTA_SALUD],
    ir: async (c) => {
      await irA(c, rutaSalud(c));
      await c.page.getByLabel(/Motivo de la consulta/).fill("Llamada de la familia");
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-salud-ficha",
    rol: "administrador",
    titulo: "Salud del alumno: la ficha vista, con la cuenta atrás «Se ocultan en … s»",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: [SALUD_PANTALLA, VISTA_SALUD],
    ir: async (c) => {
      await irA(c, rutaSalud(c));
      await c.page.getByLabel(/Motivo de la consulta/).fill("Llamada de la familia");
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await c.page.getByTestId("ficha-de-salud").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-salud-sin-ficha",
    rol: "administrador",
    titulo: "Salud del alumno: «Todavía no hay ficha de salud» (todo «Sin registrar»)",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: [SALUD_PANTALLA, VISTA_SALUD],
    ir: async (c) => {
      await editarGet(c, (u) => u.pathname.startsWith("/api/salud/alumno/"), () => ({ existe: false, campos: {} }));
      await irA(c, rutaSalud(c));
      await c.page.getByLabel(/Motivo de la consulta/).fill("Llamada de la familia");
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await c.page.getByTestId("ficha-de-salud").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-salud-ficha-parcial",
    rol: "administrador",
    titulo: "Salud del alumno: ficha con contacto de emergencia, atención de urgencia no autorizada y campos sin registrar",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: [SALUD_PANTALLA, VISTA_SALUD],
    ir: async (c) => {
      await editarGet(c, (u) => u.pathname.startsWith("/api/salud/alumno/"), () => ({
        existe: true,
        campos: { alergias: "Polen", condiciones_medicas: null, medicamentos: "", contacto_emergencia: { nombre: "Persona de muestra", parentesco: "tía", telefono: "5555010101" }, autorizacion_atencion_medica: false },
      }));
      await irA(c, rutaSalud(c));
      await c.page.getByLabel(/Motivo de la consulta/).fill("Llamada de la familia");
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await c.page.getByTestId("ficha-de-salud").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-salud-error-servidor",
    rol: "administrador",
    titulo: "Salud del alumno: la consulta falla (error del servidor bajo el campo del motivo)",
    tipo: "estado",
    ruta: "/alumnos/:id/salud",
    fuentes: [SALUD_PANTALLA, VISTA_SALUD, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await irA(c, rutaSalud(c));
      await c.page.getByLabel(/Motivo de la consulta/).fill("Llamada de la familia");
      await romper(c, (u) => u.pathname.startsWith("/api/salud/alumno/"));
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await c.page.getByTestId("error-de-guardado").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({ id: "familia-salud-cargando", rol: "administrador", titulo: "Salud del alumno: cargando", tipo: "estado", ruta: "/alumnos/:id/salud", fuentes: [SALUD_PANTALLA], ir: (c) => conCargando(c, rutaSalud(c)) }),
  esc({ id: "familia-salud-error", rol: "administrador", titulo: "Salud del alumno: error al cargar al alumno con «Reintentar»", tipo: "estado", ruta: "/alumnos/:id/salud", fuentes: [SALUD_PANTALLA], ir: (c) => conError(c, rutaSalud(c)) }),
];

const escenasDeFamilias: Escena[] = [
  // ═══ Familias (lista) ═══
  esc({ id: "familia-familias-lista", rol: "recepcion", titulo: "Familias: buscador y lista con datos (recepción, asesor y administrador)", tipo: "pantalla", ruta: "/familias", fuentes: [FAMILIAS], ir: (c) => irA(c, "/familias") }),
  esc({
    id: "familia-familias-lista-buscar-telefono",
    rol: "recepcion",
    titulo: "Familias: búsqueda por teléfono en cualquier formato, con resultado",
    tipo: "estado",
    ruta: "/familias",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await irA(c, "/familias");
      await c.page.getByLabel("Teléfono o nombre de la familia").fill("(55) 5503 0303");
      await c.page.getByTestId(`familia-${rivera(c).tutorId}`).waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-familias-lista-buscar-nombre",
    rol: "recepcion",
    titulo: "Familias: búsqueda por nombre, con resultado",
    tipo: "estado",
    ruta: "/familias",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await irA(c, "/familias");
      await c.page.getByLabel("Teléfono o nombre de la familia").fill("Rivera");
      await c.page.getByTestId(`familia-${rivera(c).tutorId}`).waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-familias-lista-sin-resultados",
    rol: "recepcion",
    titulo: "Familias: búsqueda sin resultados («No encontré a esa familia»)",
    tipo: "estado",
    ruta: "/familias",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await irA(c, "/familias");
      await c.page.getByLabel("Teléfono o nombre de la familia").fill("Zzzzzz");
      await c.page.getByText("No encontré a esa familia").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-familias-lista-con-atraso",
    rol: "recepcion",
    titulo: "Familias: la píldora «Con atraso» activa (R9b): solo las familias con un cargo vencido, «N familias con atraso» en el subtítulo",
    tipo: "estado",
    ruta: "/familias",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await irA(c, "/familias");
      await c.page.getByRole("button", { name: "Con atraso" }).click();
      await c.page.getByRole("button", { name: "Con atraso", pressed: true }).waitFor();
      await c.page.getByTestId("lista-de-familias").getByRole("listitem").first().waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-familias-lista-con-atraso-vacio",
    rol: "recepcion",
    titulo: "Familias: «Con atraso» activa y nadie debe un cargo vencido («Ninguna familia tiene atraso»)",
    tipo: "estado",
    ruta: "/familias",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await vaciarConAtraso(c, "/api/tutores");
      await irA(c, "/familias");
      await c.page.getByRole("button", { name: "Con atraso" }).click();
      await c.page.getByText("Ninguna familia tiene atraso").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-familias-lista-desde-tableros",
    rol: "administrador",
    titulo: "Familias: llegada desde «Ver las familias con atraso» de Tableros (R9b): se abre con `?con_atraso=1` y la píldora «Con atraso» ya puesta",
    tipo: "estado",
    ruta: "/tableros",
    fuentes: [FAMILIAS, "web/src/pantallas/tableros/SeccionIngreso.tsx"],
    ir: async (c) => {
      await irA(c, "/tableros");
      await c.page.getByRole("link", { name: "Ver las familias con atraso" }).click();
      await c.page.getByRole("button", { name: "Con atraso", pressed: true }).waitFor();
      await c.page.getByTestId("lista-de-familias").getByRole("listitem").first().waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({ id: "familia-familias-lista-vacio", rol: "recepcion", titulo: "Familias: lista vacía («No encontré a esa familia»)", tipo: "estado", ruta: "/familias", fuentes: [FAMILIAS], ir: (c) => conVacio(c, "/familias") }),
  esc({ id: "familia-familias-lista-muchos", rol: "recepcion", titulo: "Familias: lista con muchos datos (veinte tarjetas)", tipo: "estado", ruta: "/familias", fuentes: [FAMILIAS], ir: (c) => conMuchosDatos(c, "/familias", 3) }),
  esc({
    id: "familia-familias-lista-paginacion",
    rol: "recepcion",
    titulo: "Familias: paginador «Página 2 de 3» (tras pulsar «Siguiente»)",
    tipo: "estado",
    ruta: "/familias",
    fuentes: [FAMILIAS, "web/src/ui/Paginador.tsx"],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/tutores"), conTotal(45));
      await irA(c, "/familias");
      await c.page.getByRole("button", { name: "Siguiente" }).click();
      await c.page.getByText("Página 2 de 3").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-familias-lista-busqueda-incompleta",
    rol: "recepcion",
    titulo: "Familias: aviso «Hay más resultados de los que se pudieron revisar»",
    tipo: "estado",
    ruta: "/familias",
    fuentes: [FAMILIAS, "web/src/ui/basicos.tsx"],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/tutores"), conTotal(30, true));
      await irA(c, "/familias");
      await c.page.getByLabel("Teléfono o nombre de la familia").fill("Ri");
      await c.page.getByText("Hay más resultados de los que se pudieron revisar").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({ id: "familia-familias-lista-cargando", rol: "recepcion", titulo: "Familias: cargando", tipo: "estado", ruta: "/familias", fuentes: [FAMILIAS], ir: (c) => conCargando(c, "/familias", "Familias") }),
  esc({ id: "familia-familias-lista-error", rol: "recepcion", titulo: "Familias: error de carga con «Reintentar»", tipo: "estado", ruta: "/familias", fuentes: [FAMILIAS], ir: (c) => conError(c, "/familias") }),
  esc({
    id: "familia-familias-lista-sin-conexion",
    rol: "recepcion",
    titulo: "Familias: al buscar sin conexión («No hay conexión con el servidor»)",
    tipo: "estado",
    ruta: "/familias",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await irA(c, "/familias");
      await cortarLaRed(c);
      await c.page.getByLabel("Teléfono o nombre de la familia").fill("Rivera");
      await c.page.getByText("No hay conexión con el servidor").first().waitFor();
      await c.page.context().setOffline(false);
      await esperarListo(c.page);
    },
  }),

  // ═══ Familias con un solo hijo ═══
  esc({ id: "familia-un-solo-hijo", rol: "asesor", titulo: "Familias con un solo hijo (venta cruzada): con datos (asesor, recepción y administrador)", tipo: "pantalla", ruta: "/familias/un-solo-hijo", fuentes: [FAMILIAS], ir: (c) => irA(c, "/familias/un-solo-hijo") }),
  esc({ id: "familia-un-solo-hijo-muchos", rol: "asesor", titulo: "Familias con un solo hijo: muchos datos", tipo: "estado", ruta: "/familias/un-solo-hijo", fuentes: [FAMILIAS], ir: (c) => conMuchosDatos(c, "/familias/un-solo-hijo", 8) }),
  esc({
    id: "familia-un-solo-hijo-paginacion",
    rol: "asesor",
    titulo: "Familias con un solo hijo: paginador «Página 2 de 3» (tras pulsar «Siguiente»)",
    tipo: "estado",
    ruta: "/familias/un-solo-hijo",
    fuentes: [FAMILIAS, "web/src/ui/Paginador.tsx"],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/un-solo-hijo"), conTotal(45));
      await irA(c, "/familias/un-solo-hijo");
      await c.page.getByRole("button", { name: "Siguiente" }).click();
      await c.page.getByText("Página 2 de 3").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({ id: "familia-un-solo-hijo-vacio", rol: "asesor", titulo: "Familias con un solo hijo: lista vacía", tipo: "estado", ruta: "/familias/un-solo-hijo", fuentes: [FAMILIAS], ir: (c) => conVacio(c, "/familias/un-solo-hijo") }),
  esc({ id: "familia-un-solo-hijo-cargando", rol: "asesor", titulo: "Familias con un solo hijo: cargando", tipo: "estado", ruta: "/familias/un-solo-hijo", fuentes: [FAMILIAS], ir: (c) => conCargando(c, "/familias/un-solo-hijo") }),
  esc({ id: "familia-un-solo-hijo-error", rol: "asesor", titulo: "Familias con un solo hijo: error de carga con «Reintentar»", tipo: "estado", ruta: "/familias/un-solo-hijo", fuentes: [FAMILIAS], ir: (c) => conError(c, "/familias/un-solo-hijo") }),
  esc({
    id: "familia-un-solo-hijo-otra-sucursal",
    rol: "asesor",
    titulo: "Familias con un solo hijo: disciplinas disponibles, en otra sucursal y sin disciplinas por probar",
    tipo: "estado",
    ruta: "/familias/un-solo-hijo",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/un-solo-hijo"), (b) => {
        const base = b.datos[0];
        if (!base) return b;
        const sin = (disponible: boolean, nombre: string) => ({ id: `v-${nombre}`, nombre, disponible_en_su_sucursal: disponible });
        return {
          ...b,
          datos: [
            { ...base, verticales_sin: [sin(true, "Disciplina disponible"), sin(false, "Disciplina de otra sucursal")] },
            { ...base, tutor_id: `${base.tutor_id}-2`, verticales_sin: [] },
          ],
        };
      });
      await irA(c, "/familias/un-solo-hijo");
    },
  }),
];

const escenasDeFicha: Escena[] = [
  // ═══ Ficha de la familia (/familias/:tutorId) ═══
  esc({ id: "familia-ficha-recepcion", rol: "recepcion", titulo: "Ficha de la familia: adulto, saldo, hijos, «Estado de cuenta» y «Registrar pago» (recepción y administrador)", tipo: "pantalla", ruta: "/familias/:tutorId", fuentes: [FICHA], ir: (c) => irA(c, rutaFicha(c)) }),
  esc({ id: "familia-ficha-asesor", rol: "asesor", titulo: "Ficha de la familia (asesor: ve el saldo pero no puede registrar un pago)", tipo: "pantalla", ruta: "/familias/:tutorId", fuentes: [FICHA], ir: (c) => irA(c, rutaFicha(c)) }),
  esc({
    id: "familia-ficha-hijos-variados",
    rol: "recepcion",
    titulo: "Ficha de la familia con tres hijos (activo, congelado y baja), sin correo y con dirección",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: [FICHA],
    ir: async (c) => {
      await editarGet(c, esRuta(`/api/tutores/${rivera(c).tutorId}`), fichaCompleta);
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-sin-hijos",
    rol: "recepcion",
    titulo: "Ficha de la familia sin hijos («Esta familia todavía no tiene alumnos»)",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: [FICHA],
    ir: async (c) => {
      await editarGet(c, esRuta(`/api/tutores/${rivera(c).tutorId}`), sinHijos);
      await irA(c, rutaFicha(c));
    },
  }),
  esc({ id: "familia-ficha-muchos", rol: "recepcion", titulo: "Ficha de la familia con muchos hijos", tipo: "estado", ruta: "/familias/:tutorId", fuentes: [FICHA], ir: (c) => conMuchosDatos(c, rutaFicha(c), 6) }),
  esc({
    id: "familia-ficha-saldo-cargando",
    rol: "recepcion",
    titulo: "Ficha de la familia con el saldo cargando",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: [FICHA],
    ir: async (c) => {
      await colgar(c, termina("/estado-cuenta"));
      await c.page.goto(rutaFicha(c));
      await c.page.getByRole("heading", { level: 1 }).waitFor();
      await c.page.getByText("Cargando…").waitFor();
      await c.page.waitForTimeout(150);
    },
  }),
  esc({
    id: "familia-ficha-saldo-error",
    rol: "recepcion",
    titulo: "Ficha de la familia con error al cargar el saldo («Reintentar» dentro de la tarjeta)",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: [FICHA],
    ir: async (c) => {
      await romper(c, termina("/estado-cuenta"));
      await irA(c, rutaFicha(c));
    },
  }),
  esc({ id: "familia-ficha-cargando", rol: "recepcion", titulo: "Ficha de la familia: cargando", tipo: "estado", ruta: "/familias/:tutorId", fuentes: [FICHA], ir: (c) => conCargando(c, rutaFicha(c), "Familia") }),
  esc({ id: "familia-ficha-error", rol: "recepcion", titulo: "Ficha de la familia: error de carga con «Reintentar»", tipo: "estado", ruta: "/familias/:tutorId", fuentes: [FICHA], ir: (c) => conError(c, rutaFicha(c)) }),
  esc({ id: "familia-ficha-no-encontrada", rol: "recepcion", titulo: "Ficha de una familia que no existe (404)", tipo: "estado", ruta: "/familias/:tutorId", fuentes: [FICHA], ir: (c) => conError(c, rutaFicha(c), 404) }),
];

// ═══ Lo que SÍ envía (al final): cada vista recorre la misma cadena con su propio hijo ═══
const cadena = (c: Contexto) => hijoDeLaVista(c);

async function esperarEstatusDeLaInscripcion(c: Contexto, texto: string): Promise<void> {
  await c.page.getByTestId(`inscripcion-${cadena(c).inscripcionId}`).getByText(texto, { exact: true }).waitFor();
  await esperarListo(c.page);
}

const escenasQueEnvian: Escena[] = [
  esc({
    id: "familia-acciones-congelar-hecho",
    rol: "recepcion",
    titulo: "Expediente tras congelar de verdad la inscripción (escritorio: hijo mayor; celular: hijo menor): «Congelada» y la acción «Reactivar»",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, ACCIONES],
    ir: async (c) => {
      await irA(c, rutaExpediente(cadena(c).alumnoId));
      await abrirAccion(c, "Congelar", cadena(c));
      await dialogo(c).getByRole("button", { name: "Congelar", exact: true }).click();
      await esperarEstatusDeLaInscripcion(c, "Congelada");
    },
  }),
  esc({
    id: "familia-acciones-reactivar-real",
    rol: "recepcion",
    titulo: "Cuadro «Reactivar la inscripción» sobre una inscripción congelada de verdad (el hijo de la vista)",
    tipo: "flotante",
    ruta: "/alumnos/:id",
    fuentes: [ACCIONES, DIALOGO],
    ir: async (c) => {
      await irA(c, rutaExpediente(cadena(c).alumnoId));
      await abrirAccion(c, "Reactivar", cadena(c));
    },
  }),
  esc({
    id: "familia-acciones-reactivar-hecho",
    rol: "recepcion",
    titulo: "Expediente tras reactivar de verdad la inscripción: vuelve a «Activa»",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, ACCIONES],
    ir: async (c) => {
      await irA(c, rutaExpediente(cadena(c).alumnoId));
      await abrirAccion(c, "Reactivar", cadena(c));
      await dialogo(c).getByRole("button", { name: "Reactivar", exact: true }).click();
      await esperarEstatusDeLaInscripcion(c, "Activa");
    },
  }),
  esc({
    id: "familia-acciones-cambiar-hecho",
    rol: "recepcion",
    titulo: "Expediente tras cambiar de verdad de grupo (al grupo con lugares de sobra): el grupo nuevo y «Cambios de grupo»",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, ACCIONES],
    ir: async (c) => {
      await irA(c, rutaExpediente(cadena(c).alumnoId));
      await abrirAccion(c, "Cambiar de grupo", cadena(c));
      await elegirGrupo(c, c.mundo.familia.grupoDestino.nombre);
      await dialogo(c).getByRole("button", { name: "Confirmar el cambio" }).click();
      await c.page.getByTestId("historial-de-grupo").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-acciones-baja-hecho",
    rol: "recepcion",
    titulo: "Expediente tras dar de baja de verdad la inscripción: «Baja», sin acciones y el alumno en baja",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, ACCIONES],
    ir: async (c) => {
      await irA(c, rutaExpediente(cadena(c).alumnoId));
      await abrirAccion(c, "Dar de baja", cadena(c));
      await elegirMotivo(c);
      await dialogo(c).getByRole("button", { name: "Dar de baja", exact: true }).click();
      await esperarEstatusDeLaInscripcion(c, "Baja");
    },
  }),
  esc({
    id: "familia-expediente-comercial-con-baja",
    rol: "recepcion",
    titulo: "Expediente, «Comercial», con la tarjeta «Bajas» y el motivo de la baja que se acaba de dar",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: (c) => expediente(c, "Comercial", cadena(c).alumnoId),
  }),
  esc({
    id: "familia-ficha-hijos-en-baja",
    rol: "recepcion",
    titulo: "Ficha de la familia con los dos hijos ya en baja (tras las bajas de arriba)",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: [FICHA],
    ir: (c) => irA(c, rutaFicha(c)),
  }),
  esc({
    id: "familia-alumnos-lista-bajas-reales",
    rol: "recepcion",
    titulo: "Alumnos filtrada por «Bajas», con los dos hijos que se dieron de baja",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await irA(c, "/alumnos");
      await c.page.getByLabel("Estatus").selectOption("baja");
      await esperarListo(c.page);
    },
  }),
];

// ─── R6a: «Alumnos» con tarjetas de disciplina y el expediente con encabezado de color, línea de tiempo, últimas clases y salud en su pestaña ───

const escenasDeAlumnosR6a: Escena[] = [
  esc({
    id: "familia-alumnos-lista-disciplinas",
    rol: "recepcion",
    titulo: "Alumnos: tarjetas con el grupo en el color de su disciplina, la sucursal, la asistencia (en ámbar si es baja) y la situación de la cuenta; píldoras de disciplina",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await conDisciplinasDeColor(c);
      await conResumenVariado(c);
      await irA(c, "/alumnos");
    },
  }),
  esc({
    id: "familia-alumnos-lista-filtro-disciplina",
    rol: "recepcion",
    titulo: "Alumnos: filtrada por una disciplina (la píldora activa va en oscuro y la lista es solo de esa disciplina)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await conDisciplinasDeColor(c);
      await conResumenVariado(c);
      await irA(c, "/alumnos");
      await c.page.getByRole("group", { name: "Disciplina" }).getByRole("button").nth(1).click();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-alumnos-lista-solo-atencion",
    rol: "recepcion",
    titulo: "Alumnos: «Solo con atraso o faltas» marcado (R9b: el servidor deja a los alumnos con un cargo vencido de toda la escuela, y la nota dice que las faltas aún no se filtran)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await conDisciplinasDeColor(c);
      await conResumenVariado(c);
      await irA(c, "/alumnos");
      await c.page.getByLabel("Solo con atraso o faltas").check();
      await c.page.getByTestId("nota-con-atraso").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-alumnos-lista-solo-atencion-vacio",
    rol: "recepcion",
    titulo: "Alumnos: «Solo con atraso o faltas» y ningún alumno con cargo vencido («No hay alumnos que coincidan»)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      // El servidor no tiene alumnos con atraso: la respuesta del filtro `con_atraso` llega vacía.
      await vaciarConAtraso(c, "/api/alumnos");
      await irA(c, "/alumnos");
      await c.page.getByLabel("Solo con atraso o faltas").check();
      await c.page.getByText("No hay alumnos que coincidan").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-alumnos-lista-sin-resumen",
    rol: "recepcion",
    titulo: "Alumnos: el resumen no se pudo leer (las tarjetas dicen solo nombre, edad y familia)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await romper(c, esRuta("/api/alumnos/resumen"));
      await irA(c, "/alumnos");
    },
  }),
  esc({
    id: "familia-alumnos-lista-sin-inscripcion",
    rol: "recepcion",
    titulo: "Alumnos: un alumno sin inscripción vigente («Sin grupo vigente», sin asistencia ni cuenta)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/alumnos/resumen"), (b) => ({ ...b, datos: b.datos.map((r: Json) => ({ ...r, inscripciones: [], asistencia_30_dias: null, cuenta: null })) }));
      await irA(c, "/alumnos");
    },
  }),
  esc({
    id: "familia-alumnos-lista-foco-tarjeta",
    rol: "recepcion",
    titulo: "Alumnos: el foco del teclado en la primera tarjeta (el anillo rodea toda la tarjeta)",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await conResumenVariado(c);
      await irA(c, "/alumnos");
      await c.page.keyboard.press("Tab");
      await c.page.getByTestId("lista-de-alumnos").getByRole("link").first().focus();
      await c.page.waitForTimeout(150);
    },
  }),
  esc({
    id: "familia-alumnos-lista-maestro-tarjetas",
    rol: "maestro",
    titulo: "Alumnos (maestro): tarjetas con disciplina y asistencia, sin la situación de la cuenta ni datos de la familia",
    tipo: "estado",
    ruta: "/alumnos",
    fuentes: ALUMNOS_FUENTES,
    ir: async (c) => {
      await conDisciplinasDeColor(c);
      await conResumenVariado(c, VARIEDAD, false);
      await irA(c, "/alumnos");
    },
  }),
];

const escenasDeExpedienteR6a: Escena[] = [
  esc({
    id: "familia-expediente-trayectoria-colores",
    rol: "recepcion",
    titulo: "Expediente, «Trayectoria» con el color de cada disciplina: banda y avatar del encabezado y la barra del avance hacia el próximo evento",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await conColoresDeDisciplina(c);
      await editarGet(c, termina("/expediente"), conTrayectoriaCompleta);
      await expediente(c);
    },
  }),
  esc({
    id: "familia-expediente-sin-inscripciones",
    rol: "recepcion",
    titulo: "Expediente de un alumno sin inscripciones: encabezado neutro («Sin grupo vigente») y la trayectoria vacía",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), (b) => ({ ...b, trayectoria: { ...b.trayectoria, fecha_de_inicio: null, antiguedad: null, grupo_actual: null, inscripciones: [], historial_de_cambios_de_grupo: [], niveles: [], proximo_examen: [] } }));
      await expediente(c);
    },
  }),
  esc({
    id: "familia-expediente-alumno-congelado",
    rol: "recepcion",
    titulo: "Expediente de un alumno congelado: la píldora «Congelado» y la acción de la inscripción pasa a «Reactivar»",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, ACCIONES],
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), (b) => conEstatusDelAlumno("congelado")(conEstatus("congelada")(b)));
      await expediente(c);
    },
  }),
  esc({
    id: "familia-expediente-alumno-baja",
    rol: "recepcion",
    titulo: "Expediente de un alumno dado de baja: la píldora «Baja desde el …», sin acciones y con el hito de la baja en la trayectoria",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, ACCIONES],
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), (b) => conEstatusDelAlumno("baja")(conEstatus("baja")(b)));
      await expediente(c);
    },
  }),
  esc({
    id: "familia-expediente-asistencia-clases",
    rol: "recepcion",
    titulo: "Expediente, «Asistencia» con las últimas 16 clases (presente, falta y justificada con texto) y el aviso de tres faltas seguidas",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), conOperativoCompleto);
      await editarGet(c, termina("/asistencia"), clasesDeEjemplo);
      await expediente(c, "Asistencia");
    },
  }),
  esc({
    id: "familia-expediente-asistencia-clases-vacio",
    rol: "recepcion",
    titulo: "Expediente, «Asistencia» sin clases con pase de lista («Todavía no hay clases con pase de lista»)",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/asistencia"), (b) => ({ ...b, datos: [], paginacion: { ...b.paginacion, total: 0 } }));
      await expediente(c, "Asistencia");
    },
  }),
  esc({
    id: "familia-expediente-asistencia-clases-cargando",
    rol: "recepcion",
    titulo: "Expediente, «Asistencia» mientras llegan las últimas clases («Cargando las últimas clases…»)",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await colgar(c, termina("/asistencia"));
      await expediente(c, "Asistencia");
      await c.page.getByText("Cargando las últimas clases…").waitFor();
    },
  }),
  esc({
    id: "familia-expediente-asistencia-clases-error",
    rol: "recepcion",
    titulo: "Expediente, «Asistencia» cuando no se pudieron leer las clases (el panel sigue con lo del expediente, sin la rejilla)",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await romper(c, termina("/asistencia"));
      await expediente(c, "Asistencia");
    },
  }),
  esc({
    id: "familia-expediente-economico-vencido",
    rol: "recepcion",
    titulo: "Expediente, «Económico» con lo vencido en ámbar, el saldo, la mensualidad con su precio congelado y el responsable de pago",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: async (c) => {
      await editarGet(c, termina("/expediente"), (b) => {
        if (b.economico) b.economico.estado_de_cuenta = { disponible: true, saldo: "1300.00", vencido: "650.00", antiguedadCarteraVencidaDias: 12 };
        return b;
      });
      await expediente(c, "Económico");
    },
  }),
  esc({
    id: "familia-expediente-salud-pestana",
    rol: "administrador",
    titulo: "Expediente, pestaña «Salud»: se pide el motivo de la consulta antes de leer nada",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, VISTA_SALUD],
    ir: (c) => expediente(c, "Salud", c.mundo.familia.salud.alumnoId),
  }),
  esc({
    id: "familia-expediente-salud-pestana-ficha",
    rol: "administrador",
    titulo: "Expediente, pestaña «Salud» con la ficha vista y la cuenta atrás «Se ocultan en … s»",
    tipo: "estado",
    ruta: "/alumnos/:id",
    fuentes: [...EXPEDIENTE_FUENTES, VISTA_SALUD],
    ir: async (c) => {
      await expediente(c, "Salud", c.mundo.familia.salud.alumnoId);
      await c.page.getByLabel(/Motivo de la consulta/).fill("Llamada de la familia");
      await c.page.getByRole("button", { name: "Ver datos de salud" }).click();
      await c.page.getByTestId("ficha-de-salud").waitFor();
      await esperarListo(c.page);
    },
  }),
  esc({
    id: "familia-expediente-maestro",
    rol: "maestro",
    titulo: "Expediente (maestro): Trayectoria, Asistencia y Salud, sin importes ni «Económico» ni «Comercial», y sin acciones sobre la inscripción",
    tipo: "pantalla",
    ruta: "/alumnos/:id",
    fuentes: EXPEDIENTE_FUENTES,
    ir: (c) => expediente(c, "Trayectoria", c.mundo.familia.salud.alumnoId),
  }),
];

export const ESCENAS: Escena[] = [...escenasDeAlumnos, ...escenasDeAlumnosR6a, ...escenasDeExpediente, ...escenasDeExpedienteR6a, ...escenasDeAcciones, ...escenasDeSalud, ...escenasDeFamilias, ...escenasDeFicha, ...escenasQueEnvian];
