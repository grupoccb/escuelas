// Escenas del área «Asesor»: el embudo (tablero y lista), las tareas, la ficha del lead y todo lo flotante que sale de ellas (mover de etapa, marcar como inscrito, niños, cotizar,
// clase muestra). Prefijo de ids: `asesor-`.
//
// Para no depender del orden ni mutar la base, lo que cambiaría datos (guardar, mover, cancelar) se simula interceptando la escritura con una respuesta de éxito, o se hace fallar. Los estados
// que el mundo de pruebas no trae (lead perdido, lead sin sucursal, cotizaciones con promociones, tareas resueltas) se arman editando la respuesta GET de la API, solo en esa escena.

import { conCargando, conError, conMuchosDatos, conVacio, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena } from "./escenas.ts";

const P = "web/src/pantallas/asesor/";
const EMBUDO = [`${P}Embudo.tsx`];
const MOVER = [`${P}MoverEtapa.tsx`];
const MARCAR = [`${P}MarcarInscrito.tsx`];
const NINOS = [`${P}Ninos.tsx`];
const COTIZ = [`${P}Cotizaciones.tsx`];
const CLASES = [`${P}ClasesMuestraDeLead.tsx`];
const FICHA = [`${P}FichaLead.tsx`];
const TAREAS = [`${P}Tareas.tsx`];

// ─── Ayudas propias ───────────────────────────────────────────────────────────────────────────

type Json = any;  
type Coincide = (u: URL) => boolean;

const enApi = (ruta: string): Coincide => (u) => u.pathname === ruta;

/** Edita la respuesta JSON de un GET de la API antes de que llegue a la página. */
async function editarGet(c: Contexto, coincide: Coincide, editar: (cuerpo: Json, u: URL) => Json): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    async (r) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      if (!resp.ok()) return r.fulfill({ response: resp });
      const cuerpo = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify(editar(cuerpo, new URL(r.request().url()))) });
    },
  );
}

/** Responde con un cuerpo fijo a las peticiones de ese método (GET, POST, PATCH…) a esa ruta. */
async function responder(c: Contexto, metodo: string, coincide: Coincide, estado: number, cuerpo: unknown): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    (r) => (r.request().method() === metodo ? r.fulfill({ status: estado, contentType: "application/json", body: JSON.stringify(cuerpo) }) : r.fallback()),
  );
}

const falla = (mensaje = "Algo salió mal en el servidor. Inténtalo de nuevo."): unknown => ({ error: { codigo: "interno", mensaje, detalles: [] } });

/** Un GET que nunca termina (esa sección se queda «Cargando…»). */
async function colgar(c: Contexto, coincide: Coincide): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    (r) => (r.request().method() === "GET" ? new Promise<void>(() => undefined) : r.fallback()),
  );
}

const pagina = (datos: unknown[]): Json => ({ datos, paginacion: { total: datos.length, pagina: 1, limite: 100 } });

/** Cambia lo que `/api/yo` dice: módulos apagados (con los permisos que se van con ellos), dirección de Chatwoot. */
async function conYo(c: Contexto, o: { apagar?: string[]; chatwoot?: string | null }): Promise<void> {
  const quita: Record<string, string[]> = {
    inscripcion: ["conversion:", "inscripciones:"],
    cotizador: ["cotizador:", "lista_espera:"],
    clase_muestra: ["clases_muestra:"],
  };
  await editarGet(c, enApi("/api/yo"), (yo) => {
    for (const m of o.apagar ?? []) {
      yo.modulos[m] = false;
      yo.permisos = (yo.permisos as string[]).filter((p) => !(quita[m] ?? []).some((pre) => p.startsWith(pre)));
    }
    if (o.chatwoot !== undefined) yo.configuracion.chatwoot_url_publica = o.chatwoot;
    return yo;
  });
}

async function listo(c: Contexto): Promise<void> {
  await esperarListo(c.page);
}

async function dialogoAbierto(c: Contexto): Promise<void> {
  await c.page.locator("dialog[open]").waitFor();
  await esperarListo(c.page);
}

const dlg = (c: Contexto) => c.page.getByRole("dialog");

async function ir(c: Contexto, ruta: string): Promise<void> {
  await irA(c, ruta);
}

// ─── El embudo ────────────────────────────────────────────────────────────────────────────────

const NOMBRES = ["Familia Rojas", "Familia Ortega", "Familia Núñez", "Familia Salgado", "Familia Ibarra", "Familia Cabrera", "Familia Duarte", "Familia Esquivel", "Familia Montes", "Familia Quiroz", "Familia Vidal", "Familia Zamora"];
const FUENTES_MUESTRA = ["facebook", "instagram", "tiktok", "google", "referido", "presencial", "landing", "codigo", "directo", "anuncio"];

/** Una lista de `n` leads repartidos entre todas las etapas, con fuentes y sucursales variadas (el total se ajusta: no es el «×12» de las ayudas genéricas). */
async function conMuchosLeads(c: Contexto, ruta: string, n = 60): Promise<void> {
  const etapas = Object.values(c.mundo.etapas);
  const disciplinas = await conDisciplinas(c);
  await editarGet(c, enApi("/api/leads"), (cuerpo) => {
    const base = (cuerpo.datos as Json[])[0];
    const datos = Array.from({ length: n }, (_, i) => ({
      ...base,
      id: `muchos-${i}`,
      vertical_interes_id: disciplinas[i % disciplinas.length],
      nombre_contacto: `${NOMBRES[i % NOMBRES.length]} ${Math.floor(i / NOMBRES.length) + 1}`,
      telefono: `+52 55 ${String(1000 + i).padStart(4, "0")} ${String(2000 + i * 7).slice(0, 4)}`,
      etapa_id: etapas[(i * 3) % etapas.length],
      fuente: FUENTES_MUESTRA[i % FUENTES_MUESTRA.length],
      sucursal_interes_id: i % 7 === 0 ? null : c.mundo.sucursales.norte.id,
      recuperaciones: i % 9 === 0 ? 1 : 0,
      ultima_interaccion_en: new Date(Date.now() - (i % 12) * 86_400_000).toISOString(),
    }));
    return { ...cuerpo, datos, paginacion: { ...cuerpo.paginacion, total: n } };
  });
  await editarGet(c, enApi("/api/leads/estancados"), (cuerpo) => ({ ...cuerpo, datos: Array.from({ length: 6 }, (_, i) => ({ id: `muchos-${i * 5}`, dias_sin_movimiento: 4 + i })), paginacion: { ...cuerpo.paginacion, total: 6 } }));
  await irA(c, ruta);
}

/** La prueba trae una sola disciplina y sin color: aquí son tres, con color de marca, para ver el color por disciplina (píldoras, avatares, etiquetas). Devuelve sus ids (la primera es la real). */
const COLORES_DE_MUESTRA = ["#c2410c", "#be185d", "#0f766e"];
async function conDisciplinas(c: Contexto): Promise<string[]> {
  const ids = [c.mundo.verticalId, "disciplina-1", "disciplina-2"];
  await editarGet(c, enApi("/api/verticales"), (cuerpo) => {
    const base = (cuerpo.datos as Json[])[0];
    return { ...cuerpo, datos: COLORES_DE_MUESTRA.map((color, i) => ({ ...base, id: ids[i], nombre: `Disciplina ${"ABC"[i]}`, color_marca: color })) };
  });
  return ids;
}

/** El embudo sin ningún lead (las etapas siguen ahí). */
async function embudoSinLeads(c: Contexto): Promise<void> {
  await editarGet(c, enApi("/api/leads"), (cuerpo) => ({ ...cuerpo, datos: [], paginacion: { ...cuerpo.paginacion, total: 0 } }));
  await editarGet(c, enApi("/api/leads/estancados"), (cuerpo) => ({ ...cuerpo, datos: [], paginacion: { ...cuerpo.paginacion, total: 0 } }));
  await irA(c, "/embudo");
}

const verLista = async (c: Contexto): Promise<void> => {
  await c.page.getByRole("tab", { name: "Lista" }).click();
  await listo(c);
};

const tarjetaDe = (c: Contexto, leadId: string) => c.page.getByTestId(`lead-${leadId}`);

/** Abre «Mover de etapa» del lead (en el tablero o, con `enLista`, «Mover» de su fila). */
async function abrirMover(c: Contexto, leadId: string, enLista = false): Promise<void> {
  await tarjetaDe(c, leadId).getByRole("button", { name: enLista ? "Mover" : "Mover de etapa", exact: true }).click();
  await dialogoAbierto(c);
}

/** El embudo con un lead de la sucursal puesto en la etapa de perdidos (para ver «recuperar»). */
async function conBetaPerdido(c: Contexto): Promise<void> {
  const { leadId } = c.mundo.asesor.beta;
  await editarGet(c, enApi("/api/leads"), (cuerpo) => ({ ...cuerpo, datos: (cuerpo.datos as Json[]).map((l) => (l.id === leadId ? { ...l, etapa_id: c.mundo.etapas["perdido"], recuperaciones: 0 } : l)) }));
  await irA(c, "/embudo");
  // R2a: la columna de perdidos empieza plegada: se despliega para ver (y abrir) la tarjeta.
  await c.page.getByRole("button", { name: /^Desplegar la columna Etapa G/ }).click();
  await listo(c);
}

// ─── R2a: arrastrar, seleccionar, plegar y la versión de celular ──────────────────────────────

/** En celular el embudo muestra UNA etapa a la vez: se elige la píldora de la etapa donde está el lead (en escritorio no hace falta). */
async function mostrarEtapa(c: Contexto, nombre: string): Promise<void> {
  if (c.vista !== "celular") return;
  await c.page.getByRole("group", { name: "Etapas" }).getByRole("button", { name: new RegExp(`^${nombre}\\b`) }).click();
  await listo(c);
}

const columnaDe = (c: Contexto, tipo: string) => c.page.getByTestId(`columna-${c.mundo.etapas[tipo]}`);

/** Las tarjetas (no los botones) de una columna. */
const tarjetasDe = (c: Contexto, tipo: string) => columnaDe(c, tipo).locator("li.lead-tarjeta");

/** Selecciona las primeras tarjetas de una columna con su avatar (el mismo gesto del ratón o del dedo). */
async function seleccionar(c: Contexto, tipo: string, cuantas: number): Promise<void> {
  for (let i = 0; i < cuantas; i++) await tarjetasDe(c, tipo).nth(i).locator(".lead-seleccion").click();
  await listo(c);
}

/**
 * Presiona una tarjeta, la arrastra hasta la columna y la deja AHÍ sin soltar el botón (el estado intermedio del arrastre: la tarjeta fantasma, la columna resaltada). Con `soltar`, suelta.
 * Se agarra por el extremo derecho de la fila de la disciplina (un hueco de la tarjeta, no un botón ni un enlace, que no arrastran): así la tarjeta fantasma queda a la izquierda del puntero.
 */
async function arrastrarA(c: Contexto, tarjeta: ReturnType<typeof tarjetaDe>, destino: ReturnType<typeof columnaDe>, soltar = false): Promise<void> {
  const fila = (await tarjeta.locator(".lead-disciplina").boundingBox())!;
  const origen = { x: fila.x + fila.width - 14, y: fila.y, height: fila.height };
  await c.page.mouse.move(origen.x, origen.y + origen.height / 2);
  await c.page.mouse.down();
  await c.page.mouse.move(origen.x + 10, origen.y + origen.height / 2 + 24, { steps: 4 });
  // Si la columna queda fuera de la ventana, el puntero se queda cerca del borde del tablero: el tablero se desplaza solo (el autodesplazamiento) hasta que aparece.
  const ancho = c.page.viewportSize()!.width;
  const tablero = (await c.page.locator(".tablero").boundingBox())!;
  for (let i = 0; i < 40; i++) {
    const caja = (await destino.boundingBox())!;
    if (caja.x + caja.width / 2 < tablero.x + tablero.width - 120 && caja.x > tablero.x) break;
    await c.page.mouse.move(Math.min(ancho - 8, tablero.x + tablero.width - 30), origen.y + 60, { steps: 2 });
    await c.page.waitForTimeout(120);
  }
  const caja = (await destino.boundingBox())!;
  await c.page.mouse.move(caja.x + caja.width / 2, caja.y + Math.min(caja.height - 40, 260), { steps: 14 });
  await c.page.waitForTimeout(250);
  if (soltar) {
    await c.page.mouse.up();
    await listo(c);
  }
}

/** El PATCH de mover responde bien sin tocar la base (el aviso «ya quedó» sale igual). */
async function moverSinEscribir(c: Contexto): Promise<void> {
  await responder(c, "PATCH", (u) => /^\/api\/leads\/[^/]+\/etapa$/.test(u.pathname), 200, { id: "x" });
}

/** Una clase muestra de muestra para un lead (la API de clases devuelve las agendadas y las asistidas por separado). */
const claseDeMuestra = (leadId: string, id: string, estatus: "agendada" | "asistio", prospecto: string, edad: number, fecha: string, hora: string): Json => ({
  id,
  lead_id: leadId,
  prospecto_id: `p-${id}`,
  prospecto,
  edad_declarada: edad,
  grupo_id: "g",
  grupo: "Grupo",
  programa_id: "pr",
  programa: "Programa",
  sucursal_id: "s",
  sucursal: "Sucursal",
  zona_horaria: "America/Mexico_City",
  fecha_hora: "2026-10-14T23:00:00.000Z",
  sesion: { fecha, hora },
  estatus,
  agendada_por: "usuario",
  reprogramada_de_id: null,
  motivo_cancelacion: null,
  notas: null,
  asistencia_marcada_en: null,
  creado_en: "2026-10-01T12:00:00.000Z",
});

/** El embudo con datos de colores: tres disciplinas, una clase agendada, una a la que asistió y un lead perdido con su motivo. */
async function conTarjetasCompletas(c: Contexto): Promise<void> {
  const { alfa, beta, gamma } = c.mundo.asesor;
  const ids = await conDisciplinas(c);
  await editarGet(c, enApi("/api/leads"), (cuerpo) => ({
    ...cuerpo,
    datos: (cuerpo.datos as Json[]).map((l, i) => ({ ...l, vertical_interes_id: ids[i % ids.length], ...(l.id === gamma.leadId ? { etapa_id: c.mundo.etapas["perdido"], motivo_perdida_id: c.mundo.asesor.motivos.precio } : {}) })),
  }));
  await c.page.route(
    (u) => u.pathname === "/api/clases-muestra",
    (r) => {
      if (r.request().method() !== "GET") return r.fallback();
      const estatus = new URL(r.request().url()).searchParams.get("estatus");
      const datos = estatus === "agendada" ? [claseDeMuestra(alfa.leadId, "c1", "agendada", "Niña Alfa", 6, "miércoles 14 de octubre", "17:00")] : estatus === "asistio" ? [claseDeMuestra(beta.leadId, "c2", "asistio", "Niño Beta", 8, "lunes 12 de octubre", "16:00")] : [];
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pagina(datos)) });
    },
  );
  await irA(c, "/embudo");
}

// ─── Mover de etapa (se comparte entre el embudo y la ficha) ──────────────────────────────────

const elegirEtapa = async (c: Contexto, nombre: string): Promise<void> => {
  await dlg(c).getByLabel("Nueva etapa").selectOption({ label: nombre });
};

async function moverConDestinoYMotivo(c: Contexto, destino: string): Promise<void> {
  await elegirEtapa(c, destino);
  if (destino === "Etapa G") await dlg(c).getByLabel("Motivo de pérdida").selectOption({ label: "Precio" });
  await dlg(c).getByLabel(/^Nota/).fill("La familia lo pensó y prefiere esperar al próximo ciclo.");
}

// ─── R2b: la ficha lateral y los diálogos del embudo ──────────────────────────────────────────

const FICHA_LATERAL = [`${P}FichaLateral.tsx`, `${P}historial-lead.ts`];
const CIERRE = [`${P}DialogosDeCierre.tsx`];
const INSCRIBIR = [`${P}InscribirEnTresPasos.tsx`];
const AGENDAR = [`${P}DialogoAgendar.tsx`, `${P}clase-muestra-datos.ts`];

const fichaLateral = (c: Contexto) => c.page.getByRole("dialog", { name: /^Ficha de / });

/** Una escritura (POST/PATCH…) que nunca termina: el botón se queda en «Procesando…». */
async function colgarEscritura(c: Contexto, coincide: Coincide = (u) => u.pathname.startsWith("/api/")): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    (r) => (r.request().method() === "GET" ? r.fallback() : new Promise<void>(() => undefined)),
  );
}

/** Abre la ficha lateral de un lead con un clic en un hueco de su tarjeta (en celular, primero la píldora de su etapa). */
async function abrirFichaLateral(c: Contexto, leadId: string, etapa: string): Promise<void> {
  await mostrarEtapa(c, etapa);
  const t = tarjetaDe(c, leadId);
  await t.scrollIntoViewIfNeeded();
  const caja = (await t.boundingBox())!;
  const fila = (await t.locator(".lead-disciplina").boundingBox())!;
  // En el centro de la tarjeta (un hueco que no es botón ni enlace): las del borde derecho del tablero quedan a medias y el extremo de la fila cae fuera de él.
  await c.page.mouse.click(caja.x + caja.width / 2, fila.y + fila.height / 2);
  await fichaLateral(c).waitFor();
  await listo(c);
  await c.page.waitForTimeout(300);
}

/** Lo mismo, sin esperar a que la ficha termine de cargar (las escenas de «cargando» y de error). */
async function abrirFichaLateralSinEsperar(c: Contexto, leadId: string, etapa: string): Promise<void> {
  await mostrarEtapa(c, etapa);
  const t = tarjetaDe(c, leadId);
  await t.scrollIntoViewIfNeeded();
  const caja = (await t.boundingBox())!;
  const fila = (await t.locator(".lead-disciplina").boundingBox())!;
  // En el centro de la tarjeta (un hueco que no es botón ni enlace): las del borde derecho del tablero quedan a medias y el extremo de la fila cae fuera de él.
  await c.page.mouse.click(caja.x + caja.width / 2, fila.y + fila.height / 2);
  await fichaLateral(c).waitFor();
  await c.page.waitForTimeout(300);
}

/** Edita lo que dice `GET /api/leads/:id` (la ficha lateral lee ese detalle, no la lista del tablero). */
async function enDetalle(c: Contexto, leadId: string, editar: (lead: Json) => Json): Promise<void> {
  await editarGet(c, enApi(`/api/leads/${leadId}`), editar);
}

const ETAPA_DE = (c: Contexto, tipo: string, nombre: string, extra: Json = {}): Json => ({ id: c.mundo.etapas[tipo], nombre, tipo_sistema: tipo, es_ganado: tipo === "inscrito", es_perdido: tipo === "perdido", ...extra });

/** Un historial de muestra (de lo más antiguo a lo más reciente, como lo entrega la API). */
async function conHistorial(c: Contexto, leadId: string, cambios: Json[]): Promise<void> {
  await editarGet(c, enApi(`/api/leads/${leadId}/historial`), (h) => ({ ...h, cambios }));
}

const cambioDeMuestra = (id: string, desde: Json | null, hacia: Json, creado: string, extra: Json = {}): Json => ({
  id,
  a_mano: false,
  desde,
  hacia,
  origen: "usuario",
  usuario: { id: "u1", nombre: "Alba Asesora" },
  motivo: "cambio_manual",
  motivo_perdida: null,
  nota: null,
  es_recuperacion: false,
  creado_en: creado,
  ...extra,
});

/** Las clases muestra de muestra: la de Alfa agendada y la de Beta a la que asistió, tanto en el tablero (por estatus) como en la ficha (por lead). */
async function conClasesDeMuestra(c: Contexto): Promise<void> {
  const { alfa, beta } = c.mundo.asesor;
  const agendada = claseDeMuestra(alfa.leadId, "c1", "agendada", "Niña Alfa", 6, "miércoles 14 de octubre", "17:00");
  const asistida = claseDeMuestra(beta.leadId, "c2", "asistio", "Niño Beta", 8, "lunes 12 de octubre", "16:00");
  await c.page.route(
    (u) => u.pathname === "/api/clases-muestra",
    (r) => {
      if (r.request().method() !== "GET") return r.fallback();
      const q = new URL(r.request().url()).searchParams;
      const todas = [agendada, asistida];
      const datos = todas.filter((x) => (!q.get("estatus") || x.estatus === q.get("estatus")) && (!q.get("lead_id") || x.lead_id === q.get("lead_id")));
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pagina(datos)) });
    },
  );
}

/** Una tarea de «lead frío» pendiente de ese lead (la que crea el seguimiento cuando lleva días sin respuesta). */
async function conTareaFria(c: Contexto, leadId: string, descripcion: string): Promise<void> {
  await editarGet(c, enApi("/api/tareas"), (cuerpo, u) =>
    u.searchParams.get("lead_id") === leadId ? pagina([{ id: "tarea-fria", tipo: "lead_frio", estado: "pendiente", descripcion, codigo_error: null, lead_id: leadId, conversacion_id: null, inscripcion_id: null, cargo_id: null, vence_en: null, resuelta_en: null, creado_en: new Date().toISOString() }]) : cuerpo,
  );
}

/** Perder: abre la ficha de Beta y elige «perdido» en «Mover de etapa»; sale el diálogo del motivo. */
async function abrirPerdido(c: Contexto): Promise<void> {
  await ir(c, "/embudo");
  await abrirFichaLateral(c, c.mundo.asesor.beta.leadId, "Etapa B");
  await fichaLateral(c).getByLabel("Mover de etapa").selectOption({ label: "Etapa G (pide el motivo)" });
  await c.page.getByRole("dialog", { name: /^¿Por qué se perdió/ }).waitFor();
  await listo(c);
}

const dialogoPerdido = (c: Contexto) => c.page.getByRole("dialog", { name: /^¿Por qué se perd/ });
const dialogoRecuperar = (c: Contexto) => c.page.getByRole("dialog", { name: /^Recuperar / });

/** Lo mismo con DOS leads seleccionados y «Mover a…» de la barra de selección. */
async function abrirPerdidoDeVarios(c: Contexto): Promise<void> {
  await ir(c, "/embudo");
  await mostrarEtapa(c, "Etapa B");
  await seleccionar(c, "contactado", 2);
  await c.page.getByRole("region", { name: "Leads seleccionados" }).getByRole("button", { name: "Mover a…" }).click();
  await c.page.getByRole("menuitem", { name: /^Etapa G/ }).click();
  await dialogoPerdido(c).waitFor();
  await listo(c);
}

/** Beta ya está en la etapa de perdidos (la lista y el detalle lo dicen), con su motivo. */
async function conBetaPerdidoEnFicha(c: Contexto): Promise<void> {
  const { leadId } = c.mundo.asesor.beta;
  const perdido = ETAPA_DE(c, "perdido", "Etapa G");
  await editarGet(c, enApi("/api/leads"), (cuerpo) => ({ ...cuerpo, datos: (cuerpo.datos as Json[]).map((l) => (l.id === leadId ? { ...l, etapa_id: c.mundo.etapas["perdido"], motivo_perdida_id: c.mundo.asesor.motivos.precio } : l)) }));
  await enDetalle(c, leadId, (l) => ({ ...l, etapa_id: c.mundo.etapas["perdido"], etapa: perdido, motivo_perdida_id: c.mundo.asesor.motivos.precio, motivo_perdida: { id: c.mundo.asesor.motivos.precio, nombre: "Precio" } }));
  await conHistorial(c, leadId, [
    cambioDeMuestra("h1", null, { id: c.mundo.etapas["nuevo"], nombre: "Primera" }, "2026-10-01T15:00:00.000Z", { origen: "sistema", usuario: null, motivo: "alta" }),
    cambioDeMuestra("h2", { id: c.mundo.etapas["nuevo"], nombre: "Primera" }, { id: c.mundo.etapas["contactado"], nombre: "Etapa B" }, "2026-10-02T16:30:00.000Z", { nota: "Contestó por WhatsApp" }),
    cambioDeMuestra("h3", { id: c.mundo.etapas["contactado"], nombre: "Etapa B" }, { id: c.mundo.etapas["perdido"], nombre: "Etapa G" }, "2026-10-08T18:10:00.000Z", { motivo_perdida: { id: c.mundo.asesor.motivos.precio, nombre: "Precio" }, nota: "Le pareció caro" }),
  ]);
  await ir(c, "/embudo");
  if (c.vista === "escritorio") await c.page.getByRole("button", { name: /^Desplegar la columna Etapa G/ }).click();
  await listo(c);
}

/** Recuperar: la ficha de Beta (perdido) y su acción principal. */
async function abrirRecuperar(c: Contexto): Promise<void> {
  await conBetaPerdidoEnFicha(c);
  await abrirFichaLateral(c, c.mundo.asesor.beta.leadId, "Etapa G");
  await fichaLateral(c).getByRole("button", { name: "Recuperar lead" }).click();
  await dialogoRecuperar(c).waitFor();
  await listo(c);
}

const NOTA_DE_RECUPERACION = "Volvió a escribir: pregunta por el horario de los sábados.";

// ── Inscribir en 3 pasos ──

type Faltas = "solo-apellidos" | "varias" | "reglamento" | "ninguna";

/**
 * Beta pasa a la etapa de la clase asistida (la tarjeta ofrece «Inscribir a …») y lo que dice `GET /api/leads/:id/conversion` se arma a la medida de la escena: solo los apellidos (el maestro
 * ya capturó lo demás), varias faltas (sin registro del maestro), el reglamento sin aceptar, nada, dos niños por inscribir o un lead ya inscrito. El cotizador, los grupos y sus lugares son los reales.
 */
async function conInscripcionPreparada(c: Contexto, o: { faltas?: Faltas; dosNinos?: boolean; yaConvertido?: boolean } = {}): Promise<void> {
  const { beta } = c.mundo.asesor;
  const pid = beta.prospectoId;
  const falta = (resto: string, mensaje: string) => ({ campo: `prospectos.${pid}.${resto}`, mensaje });
  const faltantes = {
    "solo-apellidos": [falta("alumno.apellidos", "Falta el apellido del alumno"), falta("grupo_id", "Falta el grupo")],
    varias: [{ campo: "tutor.parentesco", mensaje: "Falta el parentesco" }, falta("alumno.apellidos", "Falta el apellido del alumno"), falta("alumno.fecha_nacimiento", "Falta la fecha de nacimiento"), falta("grupo_id", "Falta el grupo")],
    reglamento: [falta("alumno.apellidos", "Falta el apellido del alumno"), falta("reglamento", "Falta el reglamento")],
    ninguna: [],
  }[o.faltas ?? "solo-apellidos"];
  await editarGet(c, enApi("/api/leads"), (cuerpo) => ({ ...cuerpo, datos: (cuerpo.datos as Json[]).map((l) => (l.id === beta.leadId ? { ...l, etapa_id: c.mundo.etapas["muestra_asistida"] } : l)) }));
  await editarGet(c, enApi(`/api/leads/${beta.leadId}/conversion`), () => ({
    lead_id: beta.leadId,
    listo: faltantes.length === 0,
    ya_convertido: o.yaConvertido === true,
    faltantes,
    prospectos: [{ prospecto_id: pid, ya_convertido: o.yaConvertido === true }, ...(o.dosNinos ? [{ prospecto_id: "segundo-nino", ya_convertido: false }] : [])],
    previsiones: [{ prospecto_id: pid, hermanos_previstos: 0, reglamento_pendiente: false, grupo_nombre: null }],
  }));
  await ir(c, "/embudo");
}

/** Abre el diálogo de inscribir con el botón de la tarjeta de Beta (que ya está después de la clase). */
async function abrirInscribir(c: Contexto): Promise<void> {
  await mostrarEtapa(c, "Etapa D");
  await tarjetaDe(c, c.mundo.asesor.beta.leadId).getByRole("button", { name: /^Inscribir a / }).click();
  await c.page.getByRole("dialog", { name: /^Inscribir/ }).waitFor();
  await listo(c);
}

const dialogoInscribir = (c: Contexto) => c.page.getByRole("dialog", { name: /^Inscribir/ });

/** Pasa por el paso 1 (escribe lo que falta) y queda en el 2. */
async function irAlPasoDelGrupo(c: Contexto, faltas: Faltas = "solo-apellidos"): Promise<void> {
  await dialogoInscribir(c).getByLabel(/^Apellidos del alumno/).fill("Beta Rivas");
  if (faltas === "varias") {
    await dialogoInscribir(c).getByLabel(/^Parentesco con el alumno/).fill("madre");
    await dialogoInscribir(c).getByLabel(/^Fecha de nacimiento del alumno/).fill("2018-03-02");
  }
  await dialogoInscribir(c).getByRole("button", { name: "Siguiente", exact: true }).click();
  await c.page.getByTestId("paso-grupo").waitFor();
  await listo(c);
}

/** Elige el primer grupo con lugar y queda en el paso 3 (Confirmar). */
async function irAConfirmar(c: Contexto, faltas: Faltas = "solo-apellidos"): Promise<void> {
  await irAlPasoDelGrupo(c, faltas);
  await c.page.getByTestId("paso-grupo").locator("button:not([disabled])").first().click();
  await dialogoInscribir(c).getByRole("button", { name: "Siguiente", exact: true }).click();
  await c.page.getByTestId("paso-confirmar").waitFor();
  await listo(c);
}

const rechazo409 = (c: Contexto, codigo: string, mensaje: string, extra: Json[] = []) => ({ error: { codigo: "conflicto", mensaje, detalles: [{ campo: "motivo", mensaje: codigo }, { campo: "prospecto_id", mensaje: c.mundo.asesor.beta.prospectoId }, ...extra] } });
const esConvertir = (u: URL): boolean => /^\/api\/leads\/[^/]+\/convertir$/.test(u.pathname);

// ── Agendar ──

/** Abre «Agendar la clase muestra de …» con el botón de la tarjeta de Alfa (sin clase todavía). */
async function abrirAgendarDelEmbudo(c: Contexto): Promise<void> {
  await ir(c, "/embudo");
  await mostrarEtapa(c, "Primera");
  await tarjetaDe(c, c.mundo.asesor.alfa.leadId).getByRole("button", { name: /^Agendar la clase muestra de / }).click();
  await c.page.getByRole("dialog", { name: /^Agendar la clase muestra/ }).waitFor();
  await c.page.getByRole("group", { name: "Elige día y hora" }).waitFor();
  await listo(c);
}

const dialogoAgendar = (c: Contexto) => c.page.getByRole("dialog", { name: /^(Agendar|Cambiar) la clase muestra/ });

// ─── Escenas ──────────────────────────────────────────────────────────────────────────────────

const e = (x: Omit<Escena, "rol" | "grupo"> & { rol?: Escena["rol"] }): Escena => ({ rol: "asesor", grupo: "Asesor", ...x });

const CON_DIALOGO = /^asesor-(marcar-inscrito|nino-(agregar|corregir|quitar)|clase-|ficha-mover|ficha-marcar|ficha-lateral|dialogo-)/;

/** Una escena con un `<dialog>` abierto se captura solo en la ventana (de página entera, el fondo gris y el diálogo, fijos a la ventana, salen descuadrados). */
const conVentana = (lista: Escena[]): Escena[] => lista.map((x) => (CON_DIALOGO.test(x.id) && x.id !== "asesor-nino-agregado-con-aviso" ? { ...x, completa: false } : x));

/**
 * R2a: en celular el embudo no tiene vista de lista, y «Mover de etapa» de una tarjeta abre la hoja «Mover a…» (la alternativa sin arrastre), no el diálogo de mover con su selector de etapa: esas
 * escenas son de escritorio. En celular, ese diálogo se ve desde la ficha del lead (`asesor-ficha-mover-*`) y la hoja tiene su propia escena.
 */
const SOLO_ESCRITORIO = /^asesor-(mover-|embudo-lista)/;
const conVistas = (lista: Escena[]): Escena[] => lista.map((x) => (SOLO_ESCRITORIO.test(x.id) && !x.vistas ? { ...x, vistas: ["escritorio" as const] } : x));

export const ESCENAS: Escena[] = conVistas(conVentana([
  // ── Embudo: tablero ─────────────────────────────────────────────────────────────────────────
  e({ id: "asesor-embudo-tablero-datos", titulo: "Embudo en tablero, con datos (asesor y administrador); aviso de estancados, «Descargar lista» y filtros", tipo: "pantalla", ruta: "/embudo", fuentes: EMBUDO, ir: (c) => ir(c, "/embudo") }),
  e({ id: "asesor-embudo-tablero-muchos", titulo: "Embudo en tablero, con muchos leads", tipo: "estado", ruta: "/embudo", fuentes: EMBUDO, ir: (c) => conMuchosLeads(c, "/embudo") }),
  e({ id: "asesor-embudo-tablero-vacio", titulo: "Embudo en tablero, sin ningún lead", tipo: "estado", ruta: "/embudo", fuentes: EMBUDO, ir: embudoSinLeads }),
  e({ id: "asesor-embudo-sin-etapas", titulo: "Embudo con la API vacía (sin etapas ni leads)", tipo: "estado", ruta: "/embudo", fuentes: EMBUDO, ir: (c) => conVacio(c, "/embudo") }),
  e({ id: "asesor-embudo-cargando", titulo: "Embudo cargando", tipo: "estado", ruta: "/embudo", fuentes: EMBUDO, ir: (c) => conCargando(c, "/embudo") }),
  e({ id: "asesor-embudo-error", titulo: "Embudo con error de carga (con «Reintentar»)", tipo: "estado", ruta: "/embudo", fuentes: EMBUDO, ir: (c) => conError(c, "/embudo") }),
  e({
    id: "asesor-embudo-truncado",
    titulo: "Embudo con aviso de «se muestran los primeros N de M leads»",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await editarGet(c, enApi("/api/leads"), (cuerpo) => ({ ...cuerpo, paginacion: { ...cuerpo.paginacion, total: 1240 } }));
      await ir(c, "/embudo");
    },
  }),
  e({
    id: "asesor-embudo-filtro-fuente",
    titulo: "Embudo con el filtro de fuente desplegado y una fuente elegida",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 30);
      await c.page.getByLabel("Fuente").selectOption({ label: "Facebook" });
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-solo-estancados",
    titulo: "Embudo con el par de alerta activo: «Ver solo estos» ya pulsado (el botón dice «Ver todos»), «Solo estancados» marcado y la insignia «N d» en las tarjetas",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await ir(c, "/embudo");
      await c.page.getByRole("button", { name: "Ver solo estos" }).click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-filtros-sin-resultados",
    titulo: "Embudo con filtros que no dejan ningún lead («No hay leads con estos filtros»)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await editarGet(c, enApi("/api/leads/estancados"), (cuerpo) => ({ ...cuerpo, datos: [], paginacion: { ...cuerpo.paginacion, total: 0 } }));
      await ir(c, "/embudo");
      await c.page.getByLabel("Solo estancados").check();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-celular-etapa-cierre",
    titulo: "Embudo en celular con la píldora de la etapa de perdidos elegida (la lista de esa etapa, con el motivo de cada uno)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}TarjetaDeLead.tsx`],
    vistas: ["celular"],
    ir: async (c) => {
      await conTarjetasCompletas(c);
      await mostrarEtapa(c, "Etapa G");
    },
  }),
  e({ id: "asesor-embudo-administrador-tablero", rol: "administrador", titulo: "Embudo en tablero visto por el administrador (leads de las dos sucursales)", tipo: "pantalla", ruta: "/embudo", fuentes: EMBUDO, ir: (c) => ir(c, "/embudo") }),

  // ── Embudo (R2a): color por disciplina, columnas, selección en lote, arrastre y celular ─────────
  e({
    id: "asesor-embudo-tablero-disciplinas",
    titulo: "Embudo en tablero con tres disciplinas de color: píldoras con punto y conteo, avatares y etiquetas con su tono, la clase muestra, «Asistió el…» y el motivo de un perdido",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}TarjetaDeLead.tsx`, `${P}ColumnaDeEtapa.tsx`],
    ir: async (c) => {
      await conTarjetasCompletas(c);
      if (c.vista === "escritorio") await c.page.getByRole("button", { name: /^Desplegar la columna Etapa G/ }).click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-filtro-disciplina",
    titulo: "Embudo con una píldora de disciplina elegida (la píldora activa va en oscuro y solo quedan los leads de esa disciplina)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 30);
      await c.page.getByRole("group", { name: "Disciplina" }).getByRole("button", { name: /^Disciplina B/ }).click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-columnas-cierre",
    titulo: "Embudo en tablero con las dos columnas de cierre desplegadas (inscrito en verde, perdido en rojo) y cuatro columnas abiertas plegadas a 56 px",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}ColumnaDeEtapa.tsx`],
    vistas: ["escritorio"],
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 30);
      for (const nombre of ["Etapa B", "Etapa C", "Etapa D", "Etapa E"]) await c.page.getByRole("button", { name: `Plegar la columna ${nombre}` }).click();
      await c.page.getByRole("button", { name: /^Desplegar la columna Etapa F/ }).click();
      await c.page.getByRole("button", { name: /^Desplegar la columna Etapa G/ }).click();
      await c.page.locator(".tablero").evaluate((t) => (t.scrollLeft = 0));
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-tarjeta-seleccionada",
    titulo: "Embudo con una tarjeta seleccionada (el avatar pasa al primario con su palomita, contorno de 2 px) y la barra flotante de selección",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}TarjetaDeLead.tsx`, `${P}BarraDeSeleccion.tsx`],
    ir: async (c) => {
      await ir(c, "/embudo");
      await tarjetaDe(c, c.mundo.asesor.alfa.leadId).locator(".lead-seleccion").click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-seleccion-lote",
    titulo: "Embudo con tres leads seleccionados: la barra flotante oscura con el conteo, «Mover a…» y «Quitar la selección»",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}BarraDeSeleccion.tsx`],
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 24);
      await seleccionar(c, "nuevo", 3);
    },
  }),
  e({
    id: "asesor-embudo-menu-mover-a",
    titulo: "Menú «Mover a…» de la barra de selección con tres leads (la etapa de inscrito deshabilitada: «De una en una»; perdidos «Pide el motivo»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}BarraDeSeleccion.tsx`],
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 24);
      await seleccionar(c, "nuevo", 3);
      await c.page.getByRole("button", { name: "Mover a…" }).click();
      await c.page.getByRole("menu").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-menu-mover-a-uno",
    titulo: "Menú «Mover a…» con un solo lead seleccionado (inscrito disponible: «Abre la inscripción»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}BarraDeSeleccion.tsx`],
    vistas: ["escritorio"],
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 24);
      await seleccionar(c, "nuevo", 1);
      await c.page.getByRole("button", { name: "Mover a…" }).click();
      await c.page.getByRole("menu").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-aviso-movido",
    titulo: "Embudo después de mover tres leads con «Mover a…»: el aviso global «3 leads pasaron a …» y la selección vacía",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}BarraDeSeleccion.tsx`],
    ir: async (c) => {
      await moverSinEscribir(c);
      await conMuchosLeads(c, "/embudo", 24);
      await seleccionar(c, "nuevo", 3);
      await c.page.getByRole("button", { name: "Mover a…" }).click();
      await c.page.getByRole("menuitem", { name: /^Etapa C/ }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-conflicto-en-lote",
    titulo: "Embudo cuando uno de los leads movidos ya había cambiado de etapa (409): aviso de alerta «cambió de etapa mientras lo veías» y el tablero recargado",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await responder(c, "PATCH", (u) => /^\/api\/leads\/[^/]+\/etapa$/.test(u.pathname), 409, falla("El lead ya cambió de etapa."));
      await conMuchosLeads(c, "/embudo", 24);
      await seleccionar(c, "nuevo", 2);
      await c.page.getByRole("button", { name: "Mover a…" }).click();
      await c.page.getByRole("menuitem", { name: /^Etapa C/ }).click();
      await c.page.getByRole("alert").filter({ hasText: "cambiaron de etapa" }).waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-arrastrando",
    titulo: "Arrastre en curso: la tarjeta fantasma (rotada 2°, con la sombra de arrastre) sigue al puntero y la columna de abajo se resalta con «Suelta para mover aquí»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}useArrastre.ts`, `${P}ColumnaDeEtapa.tsx`],
    vistas: ["escritorio"],
    completa: false,
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 24);
      await arrastrarA(c, tarjetasDe(c, "contactado").first(), columnaDe(c, "muestra_agendada"));
    },
  }),
  e({
    id: "asesor-embudo-arrastrando-pila",
    titulo: "Arrastre de una selección de tres leads: la pila de tarjetas con el contador y las tarjetas de origen atenuadas",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}useArrastre.ts`],
    vistas: ["escritorio"],
    completa: false,
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 24);
      await seleccionar(c, "nuevo", 3);
      await arrastrarA(c, tarjetasDe(c, "nuevo").first(), columnaDe(c, "negociacion"));
    },
  }),
  e({
    id: "asesor-embudo-arrastrando-a-perdidos",
    titulo: "Arrastre sobre la columna de perdidos, plegada: se resalta en rojo con «Suelta y elige el motivo» en vertical",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}useArrastre.ts`, `${P}ColumnaDeEtapa.tsx`],
    vistas: ["escritorio"],
    completa: false,
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 24);
      await arrastrarA(c, tarjetasDe(c, "contactado").first(), columnaDe(c, "perdido"));
    },
  }),
  e({
    id: "asesor-embudo-arrastrando-a-inscrito",
    titulo: "Arrastre sobre la columna de inscritos, desplegada: se resalta en verde con «Suelta para inscribir»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}useArrastre.ts`, `${P}ColumnaDeEtapa.tsx`],
    vistas: ["escritorio"],
    completa: false,
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 24);
      await c.page.getByRole("button", { name: /^Desplegar la columna Etapa F/ }).click();
      await arrastrarA(c, tarjetasDe(c, "negociacion").first(), columnaDe(c, "inscrito"));
    },
  }),
  e({
    id: "asesor-embudo-soltado-en-perdidos",
    titulo: "Soltar un lead sobre la columna de perdidos: se abre «¿Por qué se perdió …?» con los motivos en botones (R2b sustituyó al selector de «Mover a …»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    vistas: ["escritorio"],
    completa: false,
    ir: async (c) => {
      await ir(c, "/embudo");
      await arrastrarA(c, tarjetaDe(c, c.mundo.asesor.beta.leadId), columnaDe(c, "perdido"), true);
      await dialogoAbierto(c);
    },
  }),
  e({
    id: "asesor-embudo-hoja-mover-a",
    titulo: "Hoja «Mover a …» en celular (la alternativa sin arrastre): la lista de etapas, la actual deshabilitada y las notas «Pide el motivo» / «Abre la inscripción»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}HojaMoverA.tsx`],
    vistas: ["celular"],
    completa: false,
    ir: async (c) => {
      await ir(c, "/embudo");
      await mostrarEtapa(c, "Etapa B");
      await tarjetaDe(c, c.mundo.asesor.beta.leadId).getByRole("button", { name: "Mover de etapa", exact: true }).click();
      await dialogoAbierto(c);
    },
  }),
  e({
    id: "asesor-embudo-celular-seleccionar",
    titulo: "Embudo en celular en modo «Seleccionar» («Listo» activo): dos tarjetas seleccionadas y la barra flotante sobre la barra inferior",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: [...EMBUDO, `${P}TarjetaDeLead.tsx`, `${P}BarraDeSeleccion.tsx`],
    vistas: ["celular"],
    completa: false,
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo", 24);
      await c.page.getByRole("button", { name: "Seleccionar", exact: true }).click();
      await tarjetasDe(c, "nuevo").nth(0).click();
      await tarjetasDe(c, "nuevo").nth(1).click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-embudo-lista-seleccion",
    titulo: "Embudo en lista con una fila seleccionada (avatar con palomita, fila en tono suave) y la barra flotante",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await ir(c, "/embudo");
      await verLista(c);
      await tarjetaDe(c, c.mundo.asesor.alfa.leadId).locator(".lead-seleccion").click();
      await listo(c);
    },
  }),

  // ── Embudo: lista ───────────────────────────────────────────────────────────────────────────
  e({
    id: "asesor-embudo-lista-datos",
    titulo: "Embudo en lista, con datos",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await ir(c, "/embudo");
      await verLista(c);
    },
  }),
  e({
    id: "asesor-embudo-lista-muchos",
    titulo: "Embudo en lista, con muchos leads",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await conMuchosLeads(c, "/embudo");
      await verLista(c);
    },
  }),
  e({
    id: "asesor-embudo-lista-vacio",
    titulo: "Embudo en lista, sin ningún lead",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await embudoSinLeads(c);
      await verLista(c);
    },
  }),
  e({
    id: "asesor-embudo-lista-solo-estancados",
    titulo: "Embudo en lista con «Solo estancados» (insignia «Estancado»)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await ir(c, "/embudo");
      await verLista(c);
      await c.page.getByLabel("Solo estancados").check();
      await listo(c);
    },
  }),

  // ── Mover de etapa desde el embudo ──────────────────────────────────────────────────────────
  e({
    id: "asesor-mover-abierto",
    titulo: "Diálogo «Mover a …» abierto, sin elegir (la etapa de inscrito aparece deshabilitada y se avisa qué falta)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await ir(c, "/embudo");
      await abrirMover(c, c.mundo.asesor.beta.leadId);
    },
  }),
  e({
    id: "asesor-mover-lista-abierto",
    titulo: "Diálogo «Mover a …» abierto desde la fila de la lista",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await ir(c, "/embudo");
      await verLista(c);
      await abrirMover(c, c.mundo.asesor.beta.leadId, true);
    },
  }),
  e({
    id: "asesor-mover-etapa-elegida",
    titulo: "Diálogo de mover con una etapa abierta elegida y una nota (listo para enviar)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await ir(c, "/embudo");
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await moverConDestinoYMotivo(c, "Etapa C");
    },
  }),
  e({
    id: "asesor-mover-perder-sin-motivo",
    titulo: "Diálogo de mover a «perdido» sin motivo (error de validación: «Elige el motivo de pérdida»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await ir(c, "/embudo");
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await elegirEtapa(c, "Etapa G");
      await listo(c);
    },
  }),
  e({
    id: "asesor-mover-perder-con-motivo",
    titulo: "Diálogo de mover a «perdido» con motivo y nota (listo para enviar)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await ir(c, "/embudo");
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await moverConDestinoYMotivo(c, "Etapa G");
    },
  }),
  e({
    id: "asesor-mover-recuperar-sin-nota",
    titulo: "Diálogo de recuperar un lead perdido sin nota (aviso azul y error: «Escribe una nota: por qué se recupera»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await conBetaPerdido(c);
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await elegirEtapa(c, "Etapa B");
      await listo(c);
    },
  }),
  e({
    id: "asesor-mover-recuperar-con-nota",
    titulo: "Diálogo de recuperar un lead perdido con su nota (listo para enviar)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await conBetaPerdido(c);
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await moverConDestinoYMotivo(c, "Etapa B");
    },
  }),
  e({
    id: "asesor-mover-error-servidor",
    titulo: "Diálogo de mover con error del servidor al enviar",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await ir(c, "/embudo");
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await moverConDestinoYMotivo(c, "Etapa C");
      await fallarLaSiguienteEscritura(c, 500, "No se pudo mover al lead. Inténtalo de nuevo.");
      await dlg(c).getByRole("button", { name: "Mover", exact: true }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-mover-conflicto",
    titulo: "Diálogo de mover cuando el lead ya cambió de etapa (409: «El lead cambió mientras lo veías»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await ir(c, "/embudo");
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await moverConDestinoYMotivo(c, "Etapa C");
      await fallarLaSiguienteEscritura(c, 409, "El lead ya cambió de etapa.");
      await dlg(c).getByRole("button", { name: "Mover", exact: true }).click();
      await dlg(c).getByText("El lead cambió mientras lo veías").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-mover-sin-conexion",
    titulo: "Diálogo de mover sin conexión al enviar («No hay conexión»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await ir(c, "/embudo");
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await moverConDestinoYMotivo(c, "Etapa C");
      await cortarLaRed(c);
      await dlg(c).getByRole("button", { name: "Mover", exact: true }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),

  // ── Marcar como inscrito a mano (con la inscripción apagada) ────────────────────────────────
  e({
    id: "asesor-embudo-inscripcion-apagada",
    titulo: "Embudo en tablero con la inscripción apagada (cada tarjeta ofrece «Marcar como inscrito»)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await conYo(c, { apagar: ["inscripcion"] });
      await ir(c, "/embudo");
    },
  }),
  e({
    id: "asesor-embudo-lista-inscripcion-apagada",
    titulo: "Embudo en lista con la inscripción apagada («Marcar como inscrito» en cada fila)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await conYo(c, { apagar: ["inscripcion"] });
      await ir(c, "/embudo");
      await verLista(c);
    },
  }),
  e({
    id: "asesor-mover-inscripcion-apagada",
    titulo: "Diálogo de mover con la inscripción apagada (la etapa de inscrito dice «usa Marcar como inscrito»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: MOVER,
    ir: async (c) => {
      await conYo(c, { apagar: ["inscripcion"] });
      await ir(c, "/embudo");
      await abrirMover(c, c.mundo.asesor.beta.leadId);
      await dlg(c).getByLabel("Nueva etapa").focus();
    },
  }),
  e({
    id: "asesor-marcar-inscrito-nota",
    titulo: "Diálogo «Marcar a … como inscrito», paso 1: la nota (vacío)",
    tipo: "paso",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await abrirMarcarDesdeEmbudo(c);
    },
  }),
  e({
    id: "asesor-marcar-inscrito-nota-vacia",
    titulo: "Marcar como inscrito, paso 1 con error de validación (nota vacía)",
    tipo: "formulario",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await abrirMarcarDesdeEmbudo(c);
      await dlg(c).getByRole("button", { name: "Continuar" }).click();
      await dlg(c).getByText("Escribe cómo se inscribió").waitFor();
    },
  }),
  e({
    id: "asesor-marcar-inscrito-nota-corta",
    titulo: "Marcar como inscrito, paso 1 con error de validación (nota demasiado corta)",
    tipo: "formulario",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await abrirMarcarDesdeEmbudo(c);
      await dlg(c).getByLabel(/¿Cómo se inscribió/).fill("pagó");
      await dlg(c).getByRole("button", { name: "Continuar" }).click();
      await dlg(c).getByText(/necesita al menos 10 caracteres/).waitFor();
    },
  }),
  e({
    id: "asesor-marcar-inscrito-confirmar",
    titulo: "Marcar como inscrito, paso 2: confirmar la nota",
    tipo: "paso",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await abrirMarcarDesdeEmbudo(c);
      await llenarNotaYContinuar(c);
    },
  }),
  e({
    id: "asesor-marcar-inscrito-error-servidor",
    titulo: "Marcar como inscrito, paso 2 con error del servidor",
    tipo: "paso",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await abrirMarcarDesdeEmbudo(c);
      await llenarNotaYContinuar(c);
      await fallarLaSiguienteEscritura(c, 422, "Ese lead no se puede marcar como inscrito.");
      await dlg(c).getByRole("button", { name: "Sí, marcar como inscrito" }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-marcar-inscrito-conflicto",
    titulo: "Marcar como inscrito, paso 2 cuando el lead ya cambió (409)",
    tipo: "paso",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await abrirMarcarDesdeEmbudo(c);
      await llenarNotaYContinuar(c);
      await fallarLaSiguienteEscritura(c, 409, "El lead ya cambió de etapa.");
      await dlg(c).getByRole("button", { name: "Sí, marcar como inscrito" }).click();
      await dlg(c).getByText("La familia cambió mientras lo veías").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-marcar-inscrito-sin-conexion",
    titulo: "Marcar como inscrito, paso 2 sin conexión",
    tipo: "paso",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await abrirMarcarDesdeEmbudo(c);
      await llenarNotaYContinuar(c);
      await cortarLaRed(c);
      await dlg(c).getByRole("button", { name: "Sí, marcar como inscrito" }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-marcar-inscrito-listo",
    titulo: "Marcar como inscrito, paso 3: «Listo»",
    tipo: "paso",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await abrirMarcarDesdeEmbudo(c);
      await llenarNotaYContinuar(c);
      await responder(c, "PATCH", (u) => /^\/api\/leads\/[^/]+\/etapa$/.test(u.pathname), 200, {});
      await dlg(c).getByRole("button", { name: "Sí, marcar como inscrito" }).click();
      await c.page.getByTestId("marcar-inscrito-listo").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-marcar-inscrito-sin-etapa",
    titulo: "Marcar como inscrito cuando la escuela no tiene etapa de inscrito (aviso rojo y «Continuar» deshabilitado)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: MARCAR,
    ir: async (c) => {
      await editarGet(c, enApi("/api/etapas"), (cuerpo) => ({ ...cuerpo, datos: (cuerpo.datos as Json[]).map((x) => (x.tipo_sistema === "inscrito" ? { ...x, tipo_sistema: null, es_ganado: false } : x)) }));
      await abrirMarcarDesdeEmbudo(c);
    },
  }),

  // ── R2b: la ficha lateral del embudo ───────────────────────────────────────────────────────
  e({
    id: "asesor-ficha-lateral",
    titulo: "Ficha lateral de un lead nuevo (clic en la tarjeta): identidad, acción principal «Agendar clase muestra», «Abrir conversación», «Mover de etapa», para quién son las clases, de dónde llegó e historial vacío",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...FICHA_LATERAL],
    ir: async (c) => {
      await conTarjetasCompletas(c);
      await abrirFichaLateral(c, c.mundo.asesor.alfa.leadId, "Primera");
    },
  }),
  e({
    id: "asesor-ficha-lateral-con-clase",
    titulo: "Ficha lateral de un lead con clase muestra agendada: la clase con su estado, «Cambiar la clase muestra» como acción principal y el historial en línea de tiempo",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...FICHA_LATERAL],
    ir: async (c) => {
      const { alfa } = c.mundo.asesor;
      await conClasesDeMuestra(c);
      await enDetalle(c, alfa.leadId, (l) => ({ ...l, etapa_id: c.mundo.etapas["muestra_agendada"], etapa: ETAPA_DE(c, "muestra_agendada", "Etapa C") }));
      await editarGet(c, enApi("/api/leads"), (cuerpo) => ({ ...cuerpo, datos: (cuerpo.datos as Json[]).map((l) => (l.id === alfa.leadId ? { ...l, etapa_id: c.mundo.etapas["muestra_agendada"] } : l)) }));
      await conHistorial(c, alfa.leadId, [
        cambioDeMuestra("h1", null, { id: c.mundo.etapas["nuevo"], nombre: "Primera" }, "2026-10-01T15:00:00.000Z", { origen: "sistema", usuario: null, motivo: "alta" }),
        cambioDeMuestra("h2", { id: c.mundo.etapas["nuevo"], nombre: "Primera" }, { id: c.mundo.etapas["muestra_agendada"], nombre: "Etapa C" }, "2026-10-09T17:20:00.000Z", { origen: "sistema", usuario: null, motivo: "clase_muestra_agendada", nota: "Clase muestra agendada" }),
      ]);
      await ir(c, "/embudo");
      await abrirFichaLateral(c, alfa.leadId, "Etapa C");
    },
  }),
  e({
    id: "asesor-ficha-lateral-estancado",
    titulo: "Ficha lateral de un lead estancado: el aviso «N días sin movimiento» con su tarea pendiente y el historial con varios cambios",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...FICHA_LATERAL],
    ir: async (c) => {
      const { gamma } = c.mundo.asesor;
      await conTareaFria(c, gamma.leadId, "Retomar a Familia Gamma: lleva 10 días sin responder.");
      await conHistorial(c, gamma.leadId, [
        cambioDeMuestra("h1", null, { id: c.mundo.etapas["nuevo"], nombre: "Primera" }, "2026-09-25T15:00:00.000Z", { origen: "sistema", usuario: null, motivo: "alta" }),
        cambioDeMuestra("h2", { id: c.mundo.etapas["nuevo"], nombre: "Primera" }, { id: c.mundo.etapas["contactado"], nombre: "Etapa B" }, "2026-09-30T16:30:00.000Z", { nota: "Contestó y pidió informes" }),
      ]);
      await ir(c, "/embudo");
      await abrirFichaLateral(c, gamma.leadId, "Etapa B");
    },
  }),
  e({
    id: "asesor-ficha-lateral-perdido",
    titulo: "Ficha lateral de un lead perdido: «Recuperar lead» como acción principal, el motivo y la línea de tiempo con el motivo de la pérdida",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...FICHA_LATERAL],
    ir: async (c) => {
      await conBetaPerdidoEnFicha(c);
      await abrirFichaLateral(c, c.mundo.asesor.beta.leadId, "Etapa G");
    },
  }),
  e({
    id: "asesor-ficha-lateral-inscrito",
    titulo: "Ficha lateral de un lead ya inscrito: «Ver expediente» como acción principal y «Mover de etapa» deshabilitado (los cambios se hacen desde el expediente)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...FICHA_LATERAL],
    ir: async (c) => {
      const { beta } = c.mundo.asesor;
      // Beta va primero en la lista: su tarjeta queda arriba de la columna de inscritos, a la vista.
      await editarGet(c, enApi("/api/leads"), (cuerpo) => {
        const datos = (cuerpo.datos as Json[]).map((l) => (l.id === beta.leadId ? { ...l, etapa_id: c.mundo.etapas["inscrito"] } : l));
        return { ...cuerpo, datos: [...datos.filter((l) => l.id === beta.leadId), ...datos.filter((l) => l.id !== beta.leadId)] };
      });
      await enDetalle(c, beta.leadId, (l) => ({ ...l, etapa_id: c.mundo.etapas["inscrito"], etapa: ETAPA_DE(c, "inscrito", "Etapa F"), prospectos: (l.prospectos as Json[]).map((p) => ({ ...p, alumno_id: "alumno-de-muestra" })) }));
      await conHistorial(c, beta.leadId, [
        cambioDeMuestra("h1", null, { id: c.mundo.etapas["nuevo"], nombre: "Primera" }, "2026-10-01T15:00:00.000Z", { origen: "sistema", usuario: null, motivo: "alta" }),
        cambioDeMuestra("h2", { id: c.mundo.etapas["negociacion"], nombre: "Etapa E" }, { id: c.mundo.etapas["inscrito"], nombre: "Etapa F" }, "2026-10-10T18:00:00.000Z", { motivo: "inscripcion" }),
      ]);
      await ir(c, "/embudo");
      if (c.vista === "escritorio") await c.page.getByRole("button", { name: /^Desplegar la columna Etapa F/ }).click();
      await abrirFichaLateral(c, beta.leadId, "Etapa F");
    },
  }),
  e({
    id: "asesor-ficha-lateral-cargando",
    titulo: "Ficha lateral mientras carga el lead («Abriendo la ficha…»; el encabezado y «Abrir completa» ya están)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...FICHA_LATERAL],
    ir: async (c) => {
      const { alfa } = c.mundo.asesor;
      await ir(c, "/embudo");
      await colgar(c, enApi(`/api/leads/${alfa.leadId}`));
      await abrirFichaLateralSinEsperar(c, alfa.leadId, "Primera");
      await c.page.getByText("Abriendo la ficha…").waitFor();
    },
  }),
  e({
    id: "asesor-ficha-lateral-error",
    titulo: "Ficha lateral con error de carga (con «Reintentar»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...FICHA_LATERAL],
    ir: async (c) => {
      const { alfa } = c.mundo.asesor;
      await ir(c, "/embudo");
      await responder(c, "GET", enApi(`/api/leads/${alfa.leadId}`), 500, falla());
      await abrirFichaLateralSinEsperar(c, alfa.leadId, "Primera");
      await fichaLateral(c).getByRole("button", { name: "Reintentar" }).waitFor();
      await listo(c);
    },
  }),

  // ── R2b: perdido ────────────────────────────────────────────────────────────────────────────
  e({
    id: "asesor-dialogo-perdido-vacio",
    titulo: "Diálogo «¿Por qué se perdió …?» recién abierto: los motivos como botones, nota opcional, «Mover a …» deshabilitado y «Elige el motivo de pérdida.»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirPerdido(c);
    },
  }),
  e({
    id: "asesor-dialogo-perdido-con-motivo",
    titulo: "Diálogo de perdido con un motivo elegido y una nota (listo para enviar)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirPerdido(c);
      await dialogoPerdido(c).getByRole("button", { name: "Precio", exact: true }).click();
      await dialogoPerdido(c).getByLabel("Nota (opcional)").fill("Le pareció caro; quizá más adelante.");
    },
  }),
  e({
    id: "asesor-dialogo-perdido-varios",
    titulo: "Diálogo de perdido con DOS leads seleccionados («¿Por qué se perdieron estos 2 leads?» y los nombres)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirPerdidoDeVarios(c);
      await dialogoPerdido(c).getByRole("button", { name: "Horario", exact: true }).click();
    },
  }),
  e({
    id: "asesor-dialogo-perdido-error-servidor",
    titulo: "Diálogo de perdido con error del servidor al enviar",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirPerdido(c);
      await dialogoPerdido(c).getByRole("button", { name: "Precio", exact: true }).click();
      await fallarLaSiguienteEscritura(c, 500, "No se pudo mover al lead. Inténtalo de nuevo.");
      await dialogoPerdido(c).getByRole("button", { name: /^Mover a / }).click();
      await dialogoPerdido(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-perdido-conflicto",
    titulo: "Diálogo de perdido cuando el lead ya cambió de etapa (409: «El lead cambió mientras lo veías»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirPerdido(c);
      await dialogoPerdido(c).getByRole("button", { name: "Precio", exact: true }).click();
      await fallarLaSiguienteEscritura(c, 409, "El lead ya cambió de etapa.");
      await dialogoPerdido(c).getByRole("button", { name: /^Mover a / }).click();
      await dialogoPerdido(c).getByText("El lead cambió mientras lo veías").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-perdido-ocupado",
    titulo: "Diálogo de perdido mientras se envía (el botón dice «Procesando…»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirPerdido(c);
      await dialogoPerdido(c).getByRole("button", { name: "Precio", exact: true }).click();
      await colgarEscritura(c);
      await dialogoPerdido(c).getByRole("button", { name: /^Mover a / }).click();
      await dialogoPerdido(c).getByRole("button", { name: "Procesando…" }).waitFor();
    },
  }),

  // ── R2b: recuperar ──────────────────────────────────────────────────────────────────────────
  e({
    id: "asesor-dialogo-recuperar-vacio",
    titulo: "Diálogo «Recuperar …» recién abierto: aviso azul, nota obligatoria vacía y «Escribe una nota: por qué se recupera.»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirRecuperar(c);
    },
  }),
  e({
    id: "asesor-dialogo-recuperar-con-nota",
    titulo: "Diálogo de recuperar con su nota (listo para enviar)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirRecuperar(c);
      await dialogoRecuperar(c).getByLabel(/^Nota/).fill(NOTA_DE_RECUPERACION);
    },
  }),
  e({
    id: "asesor-dialogo-recuperar-error-servidor",
    titulo: "Diálogo de recuperar con error del servidor al enviar",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirRecuperar(c);
      await dialogoRecuperar(c).getByLabel(/^Nota/).fill(NOTA_DE_RECUPERACION);
      await fallarLaSiguienteEscritura(c, 500, "No se pudo recuperar al lead. Inténtalo de nuevo.");
      await dialogoRecuperar(c).getByRole("button", { name: /^Mover a / }).click();
      await dialogoRecuperar(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-recuperar-ocupado",
    titulo: "Diálogo de recuperar mientras se envía («Procesando…»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...CIERRE],
    ir: async (c) => {
      await abrirRecuperar(c);
      await dialogoRecuperar(c).getByLabel(/^Nota/).fill(NOTA_DE_RECUPERACION);
      await colgarEscritura(c);
      await dialogoRecuperar(c).getByRole("button", { name: /^Mover a / }).click();
      await dialogoRecuperar(c).getByRole("button", { name: "Procesando…" }).waitFor();
    },
  }),

  // ── R2b: inscribir en 3 pasos ───────────────────────────────────────────────────────────────
  e({
    id: "asesor-dialogo-inscribir-alumno",
    titulo: "Inscribir en 3 pasos, paso 1 (Alumno): lo ya capturado con «Capturado» y solo el campo de lo que falta (los apellidos), con «Escribe los apellidos del alumno para seguir.»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-alumno-varias-faltas",
    titulo: "Inscribir, paso 1 sin registro del maestro: faltan el parentesco, los apellidos y la fecha de nacimiento («Para seguir falta: …»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c, { faltas: "varias" });
      await abrirInscribir(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-alumno-completo",
    titulo: "Inscribir, paso 1 con lo que faltaba ya escrito (se puede seguir)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await dialogoInscribir(c).getByLabel(/^Apellidos del alumno/).fill("Beta Rivas");
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-grupo",
    titulo: "Inscribir, paso 2 (Grupo): los grupos de su edad con los lugares que quedan hoy; sin elegir, «Elige un grupo con lugar.»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await irAlPasoDelGrupo(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-grupo-elegido",
    titulo: "Inscribir, paso 2 con un grupo elegido",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await irAlPasoDelGrupo(c);
      await c.page.getByTestId("paso-grupo").locator("button:not([disabled])").first().click();
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-grupo-sin-oferta",
    titulo: "Inscribir, paso 2 sin grupos para esa edad (aviso y «Abrir la inscripción completa»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await editarGet(c, enApi("/api/cotizador"), (cuerpo) => ({ ...cuerpo, programas: [] }));
      await abrirInscribir(c);
      await irAlPasoDelGrupo(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-confirmar",
    titulo: "Inscribir, paso 3 (Confirmar): alumno, grupo, cuándo empieza, responsable de pago y los montos que calcula el servidor",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await irAConfirmar(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-error-servidor",
    titulo: "Inscribir, paso 3 con un error del servidor al confirmar (dentro del diálogo)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await irAConfirmar(c);
      await responder(c, "POST", esConvertir, 500, falla("No se pudo inscribir. Inténtalo de nuevo."));
      await dialogoInscribir(c).getByRole("button", { name: /^Inscribir a / }).click();
      await dialogoInscribir(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-rechazo-grupo-lleno",
    titulo: "Inscribir, rechazo del servidor «grupo lleno»: se dice dentro del diálogo y ofrece «Elegir otro grupo»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await irAConfirmar(c);
      await responder(c, "POST", esConvertir, 409, rechazo409(c, "grupo_lleno", "El grupo ya no tiene lugares"));
      await dialogoInscribir(c).getByRole("button", { name: /^Inscribir a / }).click();
      await c.page.getByTestId("rechazo-de-grupo").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-rechazo-a-la-completa",
    titulo: "Inscribir, rechazo del servidor por datos o reglamento: se dice dentro del diálogo y manda a «Abrir la inscripción completa»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await irAConfirmar(c);
      await responder(c, "POST", esConvertir, 409, rechazo409(c, "faltan_datos", "Faltan datos para convertir al lead", [{ campo: `prospectos.${c.mundo.asesor.beta.prospectoId}.reglamento`, mensaje: "Falta el reglamento" }]));
      await dialogoInscribir(c).getByRole("button", { name: /^Inscribir a / }).click();
      await c.page.getByTestId("rechazo-a-completa").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-ocupado",
    titulo: "Inscribir, paso 3 mientras se envía («Procesando…»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await irAConfirmar(c);
      await colgarEscritura(c, esConvertir);
      await dialogoInscribir(c).getByRole("button", { name: /^Inscribir a / }).click();
      await dialogoInscribir(c).getByRole("button", { name: "Procesando…" }).waitFor();
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-listo",
    titulo: "Inscribir terminado: el diálogo se cierra y el aviso «ya quedó» confirma («… quedó inscrito en …»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c);
      await abrirInscribir(c);
      await irAConfirmar(c);
      await responder(c, "POST", esConvertir, 200, { ya_convertido: false, tutor_id: null, alumnos: [] });
      await dialogoInscribir(c).getByRole("button", { name: /^Inscribir a / }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-varios-ninos",
    titulo: "Inscribir cuando la familia tiene dos niños por inscribir: no cabe en el diálogo, se explica y ofrece «Abrir la inscripción completa»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c, { dosNinos: true });
      await abrirInscribir(c);
      await c.page.getByTestId("no-cabe-en-el-dialogo").waitFor();
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-reglamento",
    titulo: "Inscribir cuando falta el reglamento: no cabe en el diálogo, se explica y ofrece «Abrir la inscripción completa»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c, { faltas: "reglamento" });
      await abrirInscribir(c);
      await c.page.getByTestId("no-cabe-en-el-dialogo").waitFor();
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-ya-inscrito",
    titulo: "Inscribir un lead que ya quedó inscrito mientras tanto («Todo está convertido e inscrito»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    ir: async (c) => {
      await conInscripcionPreparada(c, { yaConvertido: true, faltas: "ninguna" });
      await abrirInscribir(c);
      await c.page.getByTestId("no-cabe-en-el-dialogo").waitFor();
    },
  }),
  e({
    id: "asesor-dialogo-inscribir-de-uno-en-uno",
    titulo: "Soltar dos leads seleccionados sobre «Inscrito»: el diálogo explica que la inscripción es de una familia a la vez",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...INSCRIBIR],
    vistas: ["escritorio"],
    ir: async (c) => {
      await ir(c, "/embudo");
      await seleccionar(c, "contactado", 2);
      await arrastrarA(c, tarjetasDe(c, "contactado").first(), columnaDe(c, "inscrito"), true);
      await c.page.getByTestId("inscribir-de-uno-en-uno").waitFor();
      await listo(c);
    },
  }),

  // ── R2b: agendar la clase muestra ───────────────────────────────────────────────────────────
  e({
    id: "asesor-dialogo-agendar-vacio",
    titulo: "Diálogo «Agendar la clase muestra de …» recién abierto: las sesiones con lugar (la primera, «El más próximo»), nada elegido y «Elige el día y la hora.»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...AGENDAR],
    ir: async (c) => {
      await abrirAgendarDelEmbudo(c);
    },
  }),
  e({
    id: "asesor-dialogo-agendar-sesion-elegida",
    titulo: "Diálogo de agendar con una sesión elegida (listo para «Agendar y avisar»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...AGENDAR],
    ir: async (c) => {
      await abrirAgendarDelEmbudo(c);
      await dialogoAgendar(c).getByRole("group", { name: "Elige día y hora" }).getByRole("button").nth(1).click();
    },
  }),
  e({
    id: "asesor-dialogo-agendar-cambiar",
    titulo: "Diálogo «Cambiar la clase muestra de …» (el lead ya tiene una agendada): «Reprogramar y avisar»",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...AGENDAR],
    ir: async (c) => {
      const { alfa } = c.mundo.asesor;
      await conClasesDeMuestra(c);
      await ir(c, "/embudo");
      await mostrarEtapa(c, "Primera");
      await tarjetaDe(c, alfa.leadId).getByRole("button", { name: /^Cambiar la clase muestra de / }).click();
      await c.page.getByRole("dialog", { name: /^Cambiar la clase muestra/ }).waitFor();
      await c.page.getByRole("group", { name: "Elige día y hora" }).waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-agendar-error-servidor",
    titulo: "Diálogo de agendar con un rechazo del servidor (el horario ya no tiene lugares) dentro del diálogo",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...AGENDAR],
    ir: async (c) => {
      await abrirAgendarDelEmbudo(c);
      await dialogoAgendar(c).getByRole("group", { name: "Elige día y hora" }).getByRole("button").first().click();
      await fallarLaSiguienteEscritura(c, 409, "Ese horario ya no tiene lugares.");
      await dialogoAgendar(c).getByRole("button", { name: "Agendar y avisar", exact: true }).click();
      await dialogoAgendar(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-agendar-ocupado",
    titulo: "Diálogo de agendar mientras se envía («Procesando…»)",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...AGENDAR],
    ir: async (c) => {
      await abrirAgendarDelEmbudo(c);
      await dialogoAgendar(c).getByRole("group", { name: "Elige día y hora" }).getByRole("button").first().click();
      await colgarEscritura(c);
      await dialogoAgendar(c).getByRole("button", { name: "Agendar y avisar", exact: true }).click();
      await dialogoAgendar(c).getByRole("button", { name: "Procesando…" }).waitFor();
    },
  }),
  e({
    id: "asesor-dialogo-agendar-sin-sesiones",
    titulo: "Diálogo de agendar cuando el grupo no tiene sesiones con lugar en los próximos días",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...AGENDAR],
    ir: async (c) => {
      await editarGet(c, enApi("/api/clases-muestra/sesiones"), (cuerpo) => ({ ...cuerpo, datos: [] }));
      await ir(c, "/embudo");
      await mostrarEtapa(c, "Primera");
      await tarjetaDe(c, c.mundo.asesor.alfa.leadId).getByRole("button", { name: /^Agendar la clase muestra de / }).click();
      await c.page.getByText("no tiene sesiones con lugar").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-dialogo-agendar-listo",
    titulo: "Agendar terminado: el diálogo se cierra y el aviso «ya quedó» confirma la clase",
    tipo: "flotante",
    ruta: "/embudo",
    fuentes: [...EMBUDO, ...AGENDAR],
    ir: async (c) => {
      await abrirAgendarDelEmbudo(c);
      await dialogoAgendar(c).getByRole("group", { name: "Elige día y hora" }).getByRole("button").first().click();
      await responder(c, "POST", (u) => u.pathname === "/api/clases-muestra", 201, { id: "nueva" });
      await dialogoAgendar(c).getByRole("button", { name: "Agendar y avisar", exact: true }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await listo(c);
    },
  }),

  // ── Tareas ──────────────────────────────────────────────────────────────────────────────────
  e({ id: "asesor-tareas-pendientes-datos", titulo: "Tareas pendientes, con datos (asesor y administrador)", tipo: "pantalla", ruta: "/tareas", fuentes: TAREAS, ir: (c) => ir(c, "/tareas") }),
  e({ id: "asesor-tareas-pendientes-muchos", titulo: "Tareas pendientes, con muchas", tipo: "estado", ruta: "/tareas", fuentes: TAREAS, ir: (c) => conMuchosDatos(c, "/tareas", 8) }),
  e({ id: "asesor-tareas-pendientes-vacio", titulo: "Tareas pendientes, vacías", tipo: "estado", ruta: "/tareas", fuentes: TAREAS, ir: (c) => conVacio(c, "/tareas") }),
  e({ id: "asesor-tareas-cargando", titulo: "Tareas cargando", tipo: "estado", ruta: "/tareas", fuentes: TAREAS, ir: (c) => conCargando(c, "/tareas") }),
  e({ id: "asesor-tareas-error", titulo: "Tareas con error de carga", tipo: "estado", ruta: "/tareas", fuentes: TAREAS, ir: (c) => conError(c, "/tareas") }),
  e({
    id: "asesor-tareas-todos-los-tipos",
    titulo: "Tareas pendientes de todos los tipos (título, ayuda, código de error, vencimiento)",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await editarGet(c, enApi("/api/tareas"), (cuerpo) => tareasDeTodosLosTipos(c, cuerpo, "pendiente"));
      await ir(c, "/tareas");
    },
  }),
  e({
    id: "asesor-tareas-filtro-tipo",
    titulo: "Tareas con el filtro por tipo (panel «Por tipo» en escritorio, select «Tipo de tarea» en celular) y un tipo elegido",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await editarGet(c, enApi("/api/tareas"), (cuerpo) => tareasDeTodosLosTipos(c, cuerpo, "pendiente"));
      await ir(c, "/tareas");
      if (c.vista === "celular") await c.page.getByLabel("Tipo de tarea").selectOption({ label: "Lead sin movimiento (1)" });
      else await c.page.getByRole("complementary", { name: "Filtrar por tipo" }).getByRole("button", { name: /Lead sin movimiento/ }).click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-tareas-resueltas-datos",
    titulo: "Tareas resueltas, con datos (hechas y descartadas)",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await editarGet(c, enApi("/api/tareas"), (cuerpo, u) => tareasDeTodosLosTipos(c, cuerpo, u.searchParams.get("estado") === "descartada" ? "descartada" : "hecha", 4));
      await ir(c, "/tareas");
      await c.page.getByRole("tab", { name: "Resueltas" }).click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-tareas-resueltas-vacio",
    titulo: "Tareas resueltas, vacías («Todavía no hay tareas resueltas»)",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await editarGet(c, enApi("/api/tareas"), (cuerpo, u) => (u.searchParams.get("estado") === "pendiente" ? cuerpo : { ...cuerpo, datos: [], paginacion: { ...cuerpo.paginacion, total: 0 } }));
      await ir(c, "/tareas");
      await c.page.getByRole("tab", { name: "Resueltas" }).click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-tareas-resueltas-error",
    titulo: "Tareas resueltas con error de carga",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await ir(c, "/tareas");
      await c.page.route(
        (u) => u.pathname === "/api/tareas",
        (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(falla()) }),
      );
      await c.page.getByRole("tab", { name: "Resueltas" }).click();
      await listo(c);
    },
  }),
  e({
    id: "asesor-tareas-resolver-error",
    titulo: "Tarea: «Marcar como hecha» con error del servidor",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await ir(c, "/tareas");
      await fallarLaSiguienteEscritura(c, 500, "No se pudo marcar la tarea. Inténtalo de nuevo.");
      await c.page.getByTestId(`tarea-${c.mundo.asesor.alfa.tareaId}`).getByRole("button", { name: "Marcar como hecha" }).click();
      await c.page.getByTestId(`tarea-${c.mundo.asesor.alfa.tareaId}`).getByRole("alert").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-tareas-descartar-sin-conexion",
    titulo: "Tarea: «Descartar» sin conexión",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await ir(c, "/tareas");
      await cortarLaRed(c);
      await c.page.getByTestId(`tarea-${c.mundo.asesor.alfa.tareaId}`).getByRole("button", { name: "Descartar" }).click();
      await c.page.getByTestId(`tarea-${c.mundo.asesor.alfa.tareaId}`).getByRole("alert").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-tareas-resolver-ocupado",
    titulo: "Tarea: «Marcar como hecha» mientras se guarda (botón ocupado)",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await ir(c, "/tareas");
      await c.page.route(
        (u) => u.pathname.startsWith("/api/tareas/"),
        (r) => (r.request().method() === "PATCH" ? new Promise<void>(() => undefined) : r.fallback()),
      );
      await c.page.getByTestId(`tarea-${c.mundo.asesor.alfa.tareaId}`).getByRole("button", { name: "Marcar como hecha" }).click();
      await c.page.waitForTimeout(300);
    },
  }),

  // ── Ficha del lead: pantalla y estados del lead ─────────────────────────────────────────────
  e({
    id: "asesor-ficha-nuevo-chatwoot-tarea",
    titulo: "Ficha de un lead nuevo con conversación en Chatwoot, campaña, código de rastreo y una tarea pendiente (asesor y administrador)",
    tipo: "pantalla",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await conYo(c, { chatwoot: "https://chatwoot.ejemplo.test" });
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-contactado",
    titulo: "Ficha de un lead contactado, sin conversación de WhatsApp ni tareas",
    tipo: "pantalla",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: (c) => ir(c, `/leads/${c.mundo.asesor.beta.leadId}`),
  }),
  e({
    id: "asesor-ficha-estancado",
    titulo: "Ficha de un lead estancado (diez días sin movimiento) con su tarea «Lead sin movimiento»",
    tipo: "pantalla",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: (c) => ir(c, `/leads/${c.mundo.asesor.gamma.leadId}`),
  }),
  e({
    id: "asesor-ficha-administrador",
    rol: "administrador",
    titulo: "Ficha de un lead vista por el administrador",
    tipo: "pantalla",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: (c) => ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`),
  }),
  e({
    id: "asesor-ficha-administrador-otra-sucursal",
    rol: "administrador",
    titulo: "Ficha de un lead de la otra sucursal, vista por el administrador",
    tipo: "pantalla",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: (c) => ir(c, `/leads/${c.mundo.asesor.delta.leadId}`),
  }),
  e({
    id: "asesor-ficha-con-clase-muestra",
    titulo: "Ficha de un lead con clase muestra agendada (con «Reprogramar» y «Cancelar»)",
    tipo: "pantalla",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: (c) => ir(c, `/leads/${c.mundo.maestro.clase.leadId}`),
  }),
  e({
    id: "asesor-ficha-completa",
    titulo: "Ficha con todas las secciones llenas: niños (varios estados), de dónde llegó, cotizaciones, clases muestra, tareas e historial",
    tipo: "pantalla",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await fichaLlena(c);
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-muchos",
    titulo: "Ficha con muchos datos en cada lista",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: (c) => conMuchosDatos(c, `/leads/${c.mundo.asesor.alfa.leadId}`, 8),
  }),
  e({
    id: "asesor-ficha-vacia",
    titulo: "Ficha sin niños, conversaciones, cotizaciones, clases, tareas ni historial (todos los «sin datos»)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await fichaVacia(c);
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-perdido",
    titulo: "Ficha de un lead perdido, con motivo, recuperaciones y su historial de pérdida y recuperación",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      const perdido = { id: c.mundo.etapas["perdido"], nombre: "Etapa G", tipo_sistema: "perdido", es_ganado: false, es_perdido: true };
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.beta.leadId}`), (l) => ({ ...l, etapa: perdido, etapa_id: perdido.id, motivo_perdida: { id: c.mundo.asesor.motivos.precio, nombre: "Precio" }, recuperaciones: 1 }));
      await historialFalso(c, c.mundo.asesor.beta.leadId, "perdido");
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-inscrito-a-mano",
    titulo: "Ficha de un lead inscrito a mano (insignia «Inscrito a mano» y su línea en el historial)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      const inscrito = { id: c.mundo.etapas["inscrito"], nombre: "Etapa F", tipo_sistema: "inscrito", es_ganado: true, es_perdido: false };
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.beta.leadId}`), (l) => ({ ...l, etapa: inscrito, etapa_id: inscrito.id }));
      await historialFalso(c, c.mundo.asesor.beta.leadId, "inscrito_a_mano");
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-inscrito-con-inscripcion",
    titulo: "Ficha de un lead ya inscrito en el sistema, con otro niño por inscribir («Convertir e inscribir» de nuevo)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      const inscrito = { id: c.mundo.etapas["inscrito"], nombre: "Etapa F", tipo_sistema: "inscrito", es_ganado: true, es_perdido: false };
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.beta.leadId}`), (l) => ({
        ...l,
        etapa: inscrito,
        etapa_id: inscrito.id,
        prospectos: [{ ...l.prospectos[0], alumno_id: "alumno-1", nombre: "Niño Beta" }, { ...l.prospectos[0], id: "prospecto-2", alumno_id: null, nombre: "Hermana Beta", edad: 5 }],
      }));
      await historialFalso(c, c.mundo.asesor.beta.leadId, "inscripcion_real");
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-sin-sucursal",
    titulo: "Ficha de un lead sin sucursal (aviso «Falta la sucursal» y botones para elegirla)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.beta.leadId}`), (l) => ({ ...l, sucursal: null, sucursal_interes_id: null }));
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-elegir-sucursal-error",
    titulo: "Ficha sin sucursal: error del servidor al elegir una",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.beta.leadId}`), (l) => ({ ...l, sucursal: null, sucursal_interes_id: null }));
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
      await fallarLaSiguienteEscritura(c, 422, "Esa sucursal no ofrece la disciplina que busca la familia.");
      await c.page.getByTestId("elegir-sucursal").getByRole("button").first().click();
      await c.page.getByTestId("elegir-sucursal").getByRole("alert").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-ficha-sin-modulos",
    titulo: "Ficha con los módulos de cotizador y clase muestra apagados (sin esas secciones ni sus botones)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await conYo(c, { apagar: ["cotizador", "clase_muestra"] });
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-inscripcion-apagada",
    titulo: "Ficha con la inscripción apagada («Marcar como inscrito» en lugar de «Convertir e inscribir»)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await conYo(c, { apagar: ["inscripcion"] });
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
    },
  }),
  e({ id: "asesor-ficha-cargando", titulo: "Ficha cargando", tipo: "estado", ruta: "/leads/:id", fuentes: FICHA, ir: (c) => conCargando(c, `/leads/${c.mundo.asesor.alfa.leadId}`) }),
  e({ id: "asesor-ficha-error", titulo: "Ficha con error de carga (con «Reintentar»)", tipo: "estado", ruta: "/leads/:id", fuentes: FICHA, ir: (c) => conError(c, `/leads/${c.mundo.asesor.alfa.leadId}`) }),
  e({ id: "asesor-ficha-no-encontrado", titulo: "Ficha de un lead que no existe (404)", tipo: "estado", ruta: "/leads/:id", fuentes: FICHA, ir: (c) => conError(c, "/leads/00000000-0000-4000-8000-000000000000", 404) }),
  e({ id: "asesor-ficha-de-otra-sucursal", titulo: "Ficha de un lead de otra sucursal, que el asesor no puede ver", tipo: "estado", ruta: "/leads/:id", fuentes: FICHA, ir: (c) => ir(c, `/leads/${c.mundo.asesor.delta.leadId}`) }),
  e({
    id: "asesor-ficha-historial-error",
    titulo: "Ficha con error al cargar el historial de etapas",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await c.page.route(
        (u) => /^\/api\/leads\/[^/]+\/historial$/.test(u.pathname),
        (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(falla()) }),
      );
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),

  // ── Chatwoot en la ficha ────────────────────────────────────────────────────────────────────
  e({
    id: "asesor-ficha-chatwoot-sin-direccion",
    titulo: "Ficha con conversación pero sin dirección pública de Chatwoot (aviso «No se puede abrir la conversación»)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await conYo(c, { chatwoot: null });
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-ficha-chatwoot-dos-conversaciones",
    titulo: "Ficha con dos conversaciones: un botón «Abrir conversación en Chatwoot» por cada una",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await conYo(c, { chatwoot: "https://chatwoot.ejemplo.test" });
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.alfa.leadId}`), (l) => ({ ...l, conversaciones: [...l.conversaciones, { ...l.conversaciones[0], id: "conversacion-2", chatwoot: { ...l.conversaciones[0].chatwoot, conversacion_id: 4243 } }] }));
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),

  // ── Mover de etapa y marcar como inscrito desde la ficha ────────────────────────────────────
  e({
    id: "asesor-ficha-mover-abierto",
    titulo: "Ficha con el diálogo «Mover a …» abierto",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: [...FICHA, ...MOVER],
    ir: async (c) => {
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
      await c.page.getByRole("button", { name: "Mover de etapa" }).click();
      await dialogoAbierto(c);
    },
  }),
  e({
    id: "asesor-ficha-marcar-inscrito-abierto",
    titulo: "Ficha con el diálogo «Marcar a … como inscrito» abierto",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: [...FICHA, ...MARCAR],
    ir: async (c) => {
      await conYo(c, { apagar: ["inscripcion"] });
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
      await c.page.getByTestId("marcar-como-inscrito").click();
      await dialogoAbierto(c);
    },
  }),
  e({
    id: "asesor-ficha-tarea-resolver-error",
    titulo: "Ficha: «Marcar como hecha» una tarea pendiente con error del servidor",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: FICHA,
    ir: async (c) => {
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
      await fallarLaSiguienteEscritura(c, 500, "No se pudo marcar la tarea. Inténtalo de nuevo.");
      await c.page.getByTestId(`tarea-${c.mundo.asesor.alfa.tareaId}`).getByRole("button", { name: "Marcar como hecha" }).click();
      await c.page.getByTestId(`tarea-${c.mundo.asesor.alfa.tareaId}`).getByRole("alert").waitFor();
      await listo(c);
    },
  }),

  // ── Niños ───────────────────────────────────────────────────────────────────────────────────
  e({
    id: "asesor-ninos-variados",
    titulo: "Sección «Niños» con un niño por inscribir, uno sin edad, uno que ya es alumno y uno con fecha de nacimiento y programa sugerido",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.alfa.leadId}`), (l) => ({ ...l, prospectos: ninosVariados(l.prospectos[0]) }));
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-ninos-vacio",
    titulo: "Sección «Niños» sin ningún niño registrado",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.alfa.leadId}`), (l) => ({ ...l, prospectos: [] }));
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({ id: "asesor-nino-agregar-abierto", titulo: "Diálogo «Agregar otro niño», vacío (con «Escribe el nombre.»)", tipo: "flotante", ruta: "/leads/:id", fuentes: NINOS, ir: async (c) => abrirAgregarNino(c) }),
  e({
    id: "asesor-nino-agregar-sin-fecha",
    titulo: "Agregar niño con error de validación: falta la fecha de nacimiento o la edad",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await dlg(c).getByLabel("Nombre").fill("Valentina");
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-agregar-fecha-mala",
    titulo: "Agregar niño con error de validación: fecha de nacimiento en el futuro",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await dlg(c).getByLabel("Nombre").fill("Valentina");
      await dlg(c).getByLabel("Fecha de nacimiento").fill("2099-01-01");
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-agregar-edad-mala",
    titulo: "Agregar niño con error de validación: la edad no es un número",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await dlg(c).getByLabel("Nombre").fill("Valentina");
      await dlg(c).getByLabel("Edad (si no saben la fecha)").fill("siete");
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-agregar-listo",
    titulo: "Agregar niño con todo lleno (botones «Guardar» y «Guardar y agregar otro» habilitados)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await llenarNino(c);
    },
  }),
  e({
    id: "asesor-nino-agregar-varias-disciplinas",
    titulo: "Agregar niño cuando la sucursal ofrece varias disciplinas (aparece «Disciplina de interés»)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await variasDisciplinas(c);
      await abrirAgregarNino(c);
      await llenarNino(c);
    },
  }),
  e({
    id: "asesor-nino-agregar-error-campo",
    titulo: "Agregar niño con errores del servidor en los campos (nombre y fecha de nacimiento)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await llenarNino(c);
      await fallarLaSiguienteEscritura(c, 422, "Revisa los datos del niño.", [
        { campo: "nombre", mensaje: "El nombre ya está en la ficha" },
        { campo: "edad", mensaje: "La edad debe estar entre 0 y 18" },
      ]);
      await dlg(c).getByRole("button", { name: "Guardar", exact: true }).click();
      await dlg(c).getByText("El nombre ya está en la ficha").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-agregar-error-general",
    titulo: "Agregar niño con error general del servidor (tope de niños)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await llenarNino(c);
      await fallarLaSiguienteEscritura(c, 409, "Ya tiene el máximo de niños registrados en una ficha.");
      await dlg(c).getByRole("button", { name: "Guardar", exact: true }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-agregar-sin-conexion",
    titulo: "Agregar niño sin conexión al guardar",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await llenarNino(c);
      await cortarLaRed(c);
      await dlg(c).getByRole("button", { name: "Guardar", exact: true }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-agregar-y-otro",
    titulo: "Agregar niño tras «Guardar y agregar otro»: el formulario sigue abierto y limpio con «Listo, ya está en la ficha»",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await llenarNino(c);
      await responder(c, "POST", (u) => /^\/api\/leads\/[^/]+\/prospectos$/.test(u.pathname), 201, { id: "prospecto-nuevo" });
      await dlg(c).getByRole("button", { name: "Guardar y agregar otro" }).click();
      await dlg(c).getByText("Listo, ya está en la ficha").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-agregado-con-aviso",
    titulo: "Ficha tras guardar un niño con avisos del servidor (aviso amarillo sobre la lista de niños)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirAgregarNino(c);
      await llenarNino(c);
      await responder(c, "POST", (u) => /^\/api\/leads\/[^/]+\/prospectos$/.test(u.pathname), 201, { id: "prospecto-nuevo", avisos: ["Ya hay otra ficha con un niño llamado Valentina: revisa que no esté repetida."] });
      await dlg(c).getByRole("button", { name: "Guardar", exact: true }).click();
      await c.page.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => undefined);
      await c.page.getByText("Ya hay otra ficha con un niño").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-corregir-abierto",
    titulo: "Diálogo «Corregir a …» abierto, con los datos del niño",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => abrirCorregirNino(c),
  }),
  e({
    id: "asesor-nino-corregir-sin-nombre",
    titulo: "Corregir niño con error de validación: nombre borrado",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirCorregirNino(c);
      await dlg(c).getByLabel("Nombre").fill("");
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-corregir-error-servidor",
    titulo: "Corregir niño con error del servidor al guardar",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirCorregirNino(c);
      await dlg(c).getByLabel("Apellidos (opcional)").fill("Mendoza");
      await fallarLaSiguienteEscritura(c, 422, "Revisa los datos del niño.", [{ campo: "apellidos", mensaje: "Los apellidos no pueden llevar números" }]);
      await dlg(c).getByRole("button", { name: "Guardar cambios" }).click();
      await dlg(c).getByText("Los apellidos no pueden llevar números").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-quitar-abierto",
    titulo: "Diálogo «Quitar a …» abierto (confirmación)",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => abrirQuitarNino(c),
  }),
  e({
    id: "asesor-nino-quitar-error",
    titulo: "Confirmación de quitar niño con error del servidor",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirQuitarNino(c);
      await fallarLaSiguienteEscritura(c, 409, "No se puede quitar al único niño de una ficha con clase muestra agendada.");
      await dlg(c).getByRole("button", { name: "Sí, quitar" }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-nino-quitar-sin-conexion",
    titulo: "Confirmación de quitar niño sin conexión",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: NINOS,
    ir: async (c) => {
      await abrirQuitarNino(c);
      await cortarLaRed(c);
      await dlg(c).getByRole("button", { name: "Sí, quitar" }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),

  // ── Cotizaciones ────────────────────────────────────────────────────────────────────────────
  e({
    id: "asesor-cotizaciones-lista",
    titulo: "Sección «Cotizaciones» con cotizaciones del bot y a mano (vigente, aceptada, vencida; con promociones, sin precio, lista de espera, la familia eligió)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await cotizacionesFalsas(c);
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-cotizaciones-vacio",
    titulo: "Sección «Cotizaciones» vacía («Todavía no se le cotiza nada»)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await editarGet(c, (u) => /^\/api\/leads\/[^/]+\/cotizaciones$/.test(u.pathname), (cuerpo) => ({ ...cuerpo, datos: [], paginacion: { ...cuerpo.paginacion, total: 0 } }));
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-cotizaciones-error",
    titulo: "Sección «Cotizaciones» con error de carga",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await c.page.route(
        (u) => /^\/api\/leads\/[^/]+\/cotizaciones$/.test(u.pathname),
        (r) => (r.request().method() === "GET" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(falla()) }) : r.fallback()),
      );
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-cotizaciones-cargando",
    titulo: "Sección «Cotizaciones» cargando",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await colgar(c, (u) => /^\/api\/leads\/[^/]+\/cotizaciones$/.test(u.pathname));
      await c.page.goto(`/leads/${c.mundo.asesor.alfa.leadId}`);
      await c.page.getByRole("heading", { name: "Cotizaciones" }).waitFor();
      await c.page.waitForTimeout(300);
    },
  }),
  e({
    id: "asesor-cotizar-formulario",
    titulo: "Formulario «Cotizar a mano» abierto, con los programas que da el cotizador para esa edad",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => abrirCotizar(c),
  }),
  e({
    id: "asesor-cotizar-desde-nino",
    titulo: "Formulario de cotizar abierto desde el botón «Cotizar» del niño (con ese niño elegido)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
      await c.page.getByRole("button", { name: "Cotizar a Niña Alfa" }).click();
      await c.page.getByTestId("cotizar-a-mano").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-con-promociones",
    titulo: "Cotizar a mano con el resultado de la cotización: precio con las promociones que aplican hoy, sugerencia de hermanos y meses",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await responder(c, "GET", enApi("/api/cotizador"), 200, { programas: [programaCotizado("Programa de prueba", true), programaCotizado("Programa intensivo", false)] });
      await abrirCotizar(c);
      await c.page.getByTestId("precio-con-promociones").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-hermanos-invalido",
    titulo: "Cotizar a mano con errores de validación: hermanos y meses que no son números enteros",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await abrirCotizar(c);
      await c.page.getByTestId("cotizar-a-mano").getByLabel("Hermanos ya inscritos (opcional)").fill("dos");
      await c.page.getByTestId("cotizar-a-mano").getByLabel("Meses pagados por adelantado (opcional)").fill("-1");
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-sin-programa",
    titulo: "Cotizar a mano cuando no hay programa para esa edad («No hay programas para esa edad en esta sucursal»)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await responder(c, "GET", enApi("/api/cotizador"), 200, { programas: [] });
      await abrirCotizar(c);
      await c.page.getByText("No hay programas para esa edad en esta sucursal").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-programa-sin-precio",
    titulo: "Cotizar a mano con un programa sin precio vigente (opción deshabilitada, «Guardar cotización» deshabilitado)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await responder(c, "GET", enApi("/api/cotizador"), 200, { programas: [{ ...programaCotizado("Programa sin precio", false), precio: null, sin_precio: true, promociones: null }] });
      await abrirCotizar(c);
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-error-carga",
    titulo: "Cotizar a mano con error al buscar los programas",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await responder(c, "GET", enApi("/api/cotizador"), 500, falla());
      await abrirCotizar(c);
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-buscando",
    titulo: "Cotizar a mano buscando programas («Buscando programas…»)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await colgar(c, enApi("/api/cotizador"));
      await c.page.goto(`/leads/${c.mundo.asesor.alfa.leadId}`);
      await c.page.getByRole("button", { name: "Cotizar a mano" }).click();
      await c.page.getByText("Buscando programas…").waitFor();
      await c.page.waitForTimeout(300);
    },
  }),
  e({
    id: "asesor-cotizar-error-guardar",
    titulo: "Cotizar a mano con error del servidor al guardar",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await abrirCotizar(c);
      await fallarLaSiguienteEscritura(c, 422, "El programa ya no tiene precio vigente.");
      await c.page.getByRole("button", { name: "Guardar cotización" }).click();
      await c.page.getByTestId("cotizar-a-mano").getByRole("alert").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-sin-conexion",
    titulo: "Cotizar a mano sin conexión al guardar",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await abrirCotizar(c);
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: "Guardar cotización" }).click();
      await c.page.getByTestId("cotizar-a-mano").getByRole("alert").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-sin-sucursal",
    titulo: "Cotizar a mano en un lead sin sucursal (aviso «Este lead todavía no tiene sucursal»)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.beta.leadId}`), (l) => ({ ...l, sucursal: null, sucursal_interes_id: null }));
      await ir(c, `/leads/${c.mundo.asesor.beta.leadId}`);
      await c.page.getByRole("button", { name: "Cotizar a mano" }).click();
      await c.page.getByText("Este lead todavía no tiene sucursal").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-cotizar-sin-edad",
    titulo: "Cotizar a mano cuando no hay niños con edad por cotizar",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: COTIZ,
    ir: async (c) => {
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.alfa.leadId}`), (l) => ({ ...l, prospectos: l.prospectos.map((p: Json) => ({ ...p, edad: null, edad_declarada: null, fecha_nacimiento: null })) }));
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
      await c.page.getByRole("button", { name: "Cotizar a mano" }).click();
      await c.page.getByText("No hay niños con edad por cotizar").waitFor();
      await listo(c);
    },
  }),

  // ── Clase muestra ───────────────────────────────────────────────────────────────────────────
  e({
    id: "asesor-clases-variadas",
    titulo: "Sección «Clase muestra» con clases en cada estado (agendada, asistió, no asistió, cancelada con motivo)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await clasesFalsas(c);
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-clases-asistida",
    titulo: "Sección «Clase muestra» de un lead cuya clase ya se asistió (sin botones)",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: (c) => ir(c, `/leads/${c.mundo.conversion.epsilon.leadId}`),
  }),
  e({
    id: "asesor-clases-error",
    titulo: "Sección «Clase muestra» con error de carga",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await responder(c, "GET", enApi("/api/clases-muestra"), 500, falla());
      await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
    },
  }),
  e({
    id: "asesor-clases-cargando",
    titulo: "Sección «Clase muestra» cargando",
    tipo: "estado",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await colgar(c, enApi("/api/clases-muestra"));
      await c.page.goto(`/leads/${c.mundo.asesor.alfa.leadId}`);
      await c.page.getByRole("heading", { name: "Clase muestra" }).waitFor();
      await c.page.waitForTimeout(300);
    },
  }),
  e({ id: "asesor-clase-agendar-abierto", titulo: "Diálogo «Agendar clase muestra» abierto, con las sesiones que tienen lugar", tipo: "flotante", ruta: "/leads/:id", fuentes: CLASES, ir: async (c) => abrirAgendar(c) }),
  e({
    id: "asesor-clase-agendar-sesion-elegida",
    titulo: "Agendar clase muestra con una sesión elegida y notas (listo para enviar)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await abrirAgendar(c);
      await elegirSesion(c);
      await dlg(c).getByLabel("Notas (opcional)").fill("Prefiere entrar con su prima.");
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-agendar-dos-alumnos",
    titulo: "Agendar clase muestra en una familia con dos niños por inscribir (el selector «Alumno» con opciones)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await editarGet(c, enApi(`/api/leads/${c.mundo.asesor.alfa.leadId}`), (l) => ({ ...l, prospectos: [l.prospectos[0], { ...l.prospectos[0], id: "prospecto-2", nombre: "Hermano Alfa", edad: 9 }] }));
      await abrirAgendar(c);
      await dlg(c).getByLabel("Alumno").selectOption({ label: "Hermano Alfa" });
      await c.page.waitForTimeout(150);
    },
  }),
  e({
    id: "asesor-clase-agendar-sin-cupo",
    titulo: "Agendar clase muestra con error del servidor: la sesión ya no tiene lugar",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await abrirAgendar(c);
      await elegirSesion(c);
      await fallarLaSiguienteEscritura(c, 409, "Esa sesión ya no tiene lugar. Elige otra.");
      await dlg(c).getByRole("button", { name: "Agendar", exact: true }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-agendar-sin-horario",
    titulo: "Agendar clase muestra con error de validación del servidor: la hora no es un horario del grupo",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await abrirAgendar(c);
      await elegirSesion(c);
      await fallarLaSiguienteEscritura(c, 422, "Revisa los datos.", [{ campo: "fecha_hora", mensaje: "El grupo no tiene clase a esa hora" }]);
      await dlg(c).getByRole("button", { name: "Agendar", exact: true }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-agendar-sin-conexion",
    titulo: "Agendar clase muestra sin conexión al enviar",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await abrirAgendar(c);
      await elegirSesion(c);
      await cortarLaRed(c);
      await dlg(c).getByRole("button", { name: "Agendar", exact: true }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-agendar-sin-sesiones",
    titulo: "Agendar clase muestra en un grupo sin sesiones con lugar en los próximos días",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await responder(c, "GET", enApi("/api/clases-muestra/sesiones"), 200, { datos: [] });
      await abrirAgendar(c);
      await dlg(c).getByText("no tiene sesiones con lugar").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-agendar-sin-grupos",
    titulo: "Agendar clase muestra cuando no hay grupos activos de esa disciplina en la sucursal",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await responder(c, "GET", enApi("/api/grupos"), 200, pagina([]));
      await abrirAgendar(c);
      await dlg(c).getByText("No hay grupos activos").waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-agendar-error-sesiones",
    titulo: "Agendar clase muestra con error al buscar las sesiones",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await responder(c, "GET", enApi("/api/clases-muestra/sesiones"), 500, falla());
      await abrirAgendar(c);
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-agendar-buscando",
    titulo: "Agendar clase muestra buscando sesiones («Buscando sesiones con lugar…»)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await colgar(c, enApi("/api/clases-muestra/sesiones"));
      await c.page.goto(`/leads/${c.mundo.asesor.alfa.leadId}`);
      await c.page.getByRole("button", { name: "Agendar clase muestra" }).click();
      await c.page.getByText("Buscando sesiones con lugar…").waitFor();
      await c.page.waitForTimeout(300);
    },
  }),
  e({ id: "asesor-clase-reprogramar-abierto", titulo: "Diálogo «Reprogramar clase muestra» abierto", tipo: "flotante", ruta: "/leads/:id", fuentes: CLASES, ir: async (c) => abrirReprogramar(c) }),
  e({
    id: "asesor-clase-reprogramar-error",
    titulo: "Reprogramar clase muestra con error del servidor (sin cupo)",
    tipo: "formulario",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await abrirReprogramar(c);
      await elegirSesion(c);
      await fallarLaSiguienteEscritura(c, 409, "Esa sesión ya no tiene lugar. Elige otra.");
      await dlg(c).getByRole("button", { name: "Reprogramar", exact: true }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({ id: "asesor-clase-cancelar-abierto", titulo: "Diálogo «Cancelar clase muestra» abierto (confirmación)", tipo: "flotante", ruta: "/leads/:id", fuentes: CLASES, ir: async (c) => abrirCancelar(c) }),
  e({
    id: "asesor-clase-cancelar-con-motivo",
    titulo: "Cancelar clase muestra con el motivo escrito",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await abrirCancelar(c);
      await dlg(c).getByLabel("Motivo (opcional)").fill("La familia tiene otro compromiso esa tarde.");
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-cancelar-error",
    titulo: "Cancelar clase muestra con error del servidor",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await abrirCancelar(c);
      await fallarLaSiguienteEscritura(c, 409, "La clase ya no está agendada.");
      await dlg(c).getByRole("button", { name: "Cancelar la clase" }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
  e({
    id: "asesor-clase-cancelar-sin-conexion",
    titulo: "Cancelar clase muestra sin conexión",
    tipo: "flotante",
    ruta: "/leads/:id",
    fuentes: CLASES,
    ir: async (c) => {
      await abrirCancelar(c);
      await cortarLaRed(c);
      await dlg(c).getByRole("button", { name: "Cancelar la clase" }).click();
      await dlg(c).getByRole("alert").first().waitFor();
      await listo(c);
    },
  }),
]));

// ─── Pasos y datos de apoyo (se usan arriba; las funciones se elevan) ─────────────────────────

async function abrirMarcarDesdeEmbudo(c: Contexto): Promise<void> {
  await conYo(c, { apagar: ["inscripcion"] });
  await ir(c, "/embudo");
  await mostrarEtapa(c, "Etapa B");
  await c.page.getByTestId(`marcar-inscrito-${c.mundo.asesor.beta.leadId}`).first().click();
  await dialogoAbierto(c);
}

async function llenarNotaYContinuar(c: Contexto): Promise<void> {
  await dlg(c).getByLabel(/¿Cómo se inscribió/).fill("Se inscribió en persona con la maestra y pagó en efectivo");
  await dlg(c).getByRole("button", { name: "Continuar" }).click();
  await c.page.getByTestId("marcar-inscrito-confirmacion").waitFor();
  await listo(c);
}

async function abrirAgregarNino(c: Contexto): Promise<void> {
  await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
  await c.page.getByRole("button", { name: "Agregar otro niño" }).click();
  await dialogoAbierto(c);
}

async function llenarNino(c: Contexto): Promise<void> {
  await dlg(c).getByLabel("Nombre").fill("Valentina");
  await dlg(c).getByLabel("Apellidos (opcional)").fill("Mendoza");
  await dlg(c).getByLabel("Edad (si no saben la fecha)").fill("7");
  await listo(c);
}

async function abrirCorregirNino(c: Contexto): Promise<void> {
  await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
  await c.page.getByRole("button", { name: "Corregir los datos de Niña Alfa" }).click();
  await dialogoAbierto(c);
}

async function abrirQuitarNino(c: Contexto): Promise<void> {
  await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
  await c.page.getByRole("button", { name: "Quitar a Niña Alfa" }).click();
  await dialogoAbierto(c);
}

/** La sucursal ofrece dos disciplinas: se agrega una a la respuesta de la sucursal. */
async function variasDisciplinas(c: Contexto): Promise<void> {
  await editarGet(c, (u) => /^\/api\/sucursales\/[^/]+$/.test(u.pathname), (s) => ({ ...s, verticales: [...s.verticales, { ...s.verticales[0], vertical_id: "disciplina-2", nombre: "Otra disciplina" }] }));
}

async function abrirCotizar(c: Contexto): Promise<void> {
  await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
  await c.page.getByRole("button", { name: "Cotizar a mano" }).click();
  await c.page.getByTestId("cotizar-a-mano").waitFor();
  await listo(c);
}

async function abrirAgendar(c: Contexto): Promise<void> {
  await ir(c, `/leads/${c.mundo.asesor.alfa.leadId}`);
  await c.page.getByRole("button", { name: "Agendar clase muestra" }).click();
  await dialogoAbierto(c);
}

async function abrirReprogramar(c: Contexto): Promise<void> {
  await ir(c, `/leads/${c.mundo.maestro.clase.leadId}`);
  await c.page.getByTestId(`clase-${c.mundo.maestro.clase.id}`).getByRole("button", { name: "Reprogramar" }).click();
  await dialogoAbierto(c);
}

async function abrirCancelar(c: Contexto): Promise<void> {
  await ir(c, `/leads/${c.mundo.maestro.clase.leadId}`);
  await c.page.getByTestId(`clase-${c.mundo.maestro.clase.id}`).getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialogoAbierto(c);
}

async function elegirSesion(c: Contexto): Promise<void> {
  const primera = dlg(c).getByRole("group", { name: "Sesión" }).getByRole("radio").first();
  await primera.waitFor();
  await primera.check();
  await listo(c);
}

function ninosVariados(base: Json): Json[] {
  return [
    { ...base, nombre: "Niña Alfa", apellidos: "Rojas", edad: 6, programa_sugerido: { id: "p1", nombre: "Programa de prueba" } },
    { ...base, id: "n2", nombre: "Hermano Alfa", apellidos: null, edad: null, edad_declarada: null, fecha_nacimiento: null },
    { ...base, id: "n3", nombre: "Prima Alfa", apellidos: "Rojas", edad: 9, fecha_nacimiento: "2017-03-14", programa_sugerido: { id: "p1", nombre: "Programa de prueba" } },
    { ...base, id: "n4", nombre: "Primo Alfa", apellidos: null, edad: 11, alumno_id: "alumno-4" },
  ];
}

function programaCotizado(nombre: string, conPromos: boolean): Json {
  const tot = (original: string, final: string) => ({ original, descuento_ahora: (Number(original) - Number(final)).toFixed(2), descuento_diferido: "0.00", final_ahora: final, final_con_diferidos: final });
  return {
    programa_id: `programa-${nombre}`,
    nombre,
    precio: { costo_inscripcion: "500.00", costo_mensualidad: "1000.00" },
    sin_precio: false,
    grupos: [
      { grupo_id: "g1", nombre: "Grupo A", horario_texto: "Lun y Mié 16:00–17:00", lugares_disponibles: 5, lleno: false, oferta: "lugar" },
      { grupo_id: "g2", nombre: "Grupo B", horario_texto: "Sáb 10:00–11:00", lugares_disponibles: 0, lleno: true, oferta: "lista_espera" },
    ],
    promociones: conPromos
      ? { aplicadas: [{ promocion_id: "pr1", nombre: "Hermanos" }, { promocion_id: "pr2", nombre: "Inscripción sin costo" }], lineas: [], inscripcion: tot("500.00", "0.00"), mensualidad: tot("1000.00", "900.00"), meses_gratis_ahora: 0, meses_gratis_diferidos: 0 }
      : null,
  };
}

async function cotizacionesFalsas(c: Contexto): Promise<void> {
  const ahora = Date.now();
  const alfa = c.mundo.asesor.alfa;
  const base = { prospecto_id: alfa.prospectoId, vigente_hasta: new Date(ahora + 6 * 86_400_000).toISOString().slice(0, 10) };
  const programaConPromos = programaCotizado("Programa de prueba", true);
  const datos = [
    { ...base, id: "cot-1", origen: "bot", estatus: "vigente", grupo_elegido_id: "g1", snapshot: { programa: programaConPromos, supuestos: { hermanos_inscritos: 1, meses_pagados: 0 } } },
    { ...base, id: "cot-2", origen: "asesor", estatus: "aceptada", grupo_elegido_id: null, snapshot: { programa: programaCotizado("Programa intensivo", false), supuestos: { hermanos_inscritos: 0, meses_pagados: 2 } } },
    { ...base, id: "cot-3", origen: "bot", estatus: "vencida", vigente_hasta: new Date(ahora - 20 * 86_400_000).toISOString().slice(0, 10), grupo_elegido_id: null, snapshot: { programa: { ...programaCotizado("Programa sin precio", false), precio: null, sin_precio: true, promociones: null, grupos: [] } } },
    { ...base, id: "cot-4", origen: "asesor", estatus: "vigente", grupo_elegido_id: null, snapshot: {} },
  ];
  await responder(c, "GET", (u) => /^\/api\/leads\/[^/]+\/cotizaciones$/.test(u.pathname), 200, pagina(datos));
}

async function clasesFalsas(c: Contexto): Promise<void> {
  const alfa = c.mundo.asesor.alfa;
  const g = c.mundo.grupos.a;
  const clase = (id: string, estatus: string, dia: number, extra: Json = {}): Json => ({
    id,
    lead_id: alfa.leadId,
    prospecto_id: alfa.prospectoId,
    prospecto: "Niña Alfa",
    edad_declarada: 6,
    grupo_id: g.id,
    grupo: g.nombre,
    programa_id: c.mundo.programaId,
    programa: "Programa de prueba",
    sucursal_id: c.mundo.sucursales.norte.id,
    sucursal: c.mundo.sucursales.norte.nombre,
    zona_horaria: "America/Mexico_City",
    fecha_hora: new Date(Date.now() + dia * 86_400_000).toISOString(),
    sesion: { fecha: new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" }).format(new Date(Date.now() + dia * 86_400_000)).replace(".", ""), hora: "16:00" },
    estatus,
    agendada_por: "usuario",
    reprogramada_de_id: null,
    motivo_cancelacion: null,
    notas: null,
    asistencia_marcada_en: null,
    creado_en: new Date().toISOString(),
    ...extra,
  });
  await responder(c, "GET", enApi("/api/clases-muestra"), 200, pagina([
    clase("cl-1", "agendada", 3),
    clase("cl-2", "asistio", -5),
    clase("cl-3", "no_asistio", -12),
    clase("cl-4", "cancelada", -20, { motivo_cancelacion: "La familia tiene otro compromiso esa tarde." }),
    clase("cl-5", "reagendada", -25),
  ]));
}

/** Historial de etapas inventado: según `caso`, con pérdida y recuperación, con inscripción a mano o con inscripción real. */
async function historialFalso(c: Contexto, leadId: string, caso: "perdido" | "inscrito_a_mano" | "inscripcion_real"): Promise<void> {
  const e = c.mundo.etapas;
  const cambio = (id: string, desde: string | null, hacia: string, extra: Json = {}): Json => ({ id, a_mano: false, desde: desde ? { id: desde, nombre: desde } : null, hacia: { id: hacia, nombre: hacia }, origen: "usuario", usuario: { id: "u1", nombre: "Alba Asesora" }, motivo: "manual", motivo_perdida: null, nota: null, es_recuperacion: false, creado_en: new Date(Date.now() - 86_400_000).toISOString(), ...extra });
  const nombres = { nuevo: "Nuevo", b: "Etapa B", f: "Etapa F", g: "Etapa G" };
  void e;
  const cuerpo: Json =
    caso === "perdido"
      ? {
          etapa_actual: nombres.g,
          inscrito_a_mano: null,
          inscripciones: [],
          cambios: [
            cambio("c1", null, nombres.nuevo, { origen: "sistema", usuario: null, motivo: "alta" }),
            cambio("c2", nombres.nuevo, nombres.b),
            cambio("c3", nombres.b, nombres.g, { motivo: "perdido", motivo_perdida: { id: "m1", nombre: "Precio" }, nota: "Le pareció caro." }),
            cambio("c4", nombres.g, nombres.b, { es_recuperacion: true, motivo: "recuperacion", nota: "Volvió a escribir pidiendo informes." }),
            cambio("c5", nombres.b, nombres.g, { motivo: "perdido", motivo_perdida: { id: "m2", nombre: "Horario" } }),
          ],
        }
      : caso === "inscrito_a_mano"
        ? {
            etapa_actual: nombres.f,
            inscrito_a_mano: { por: { id: "u1", nombre: "Alba Asesora" }, en: new Date().toISOString() },
            inscripciones: [],
            cambios: [cambio("c1", null, nombres.nuevo, { origen: "sistema", usuario: null, motivo: "alta" }), cambio("c2", nombres.nuevo, nombres.f, { a_mano: true, motivo: "inscripcion_a_mano", nota: "Se inscribió en persona y pagó en efectivo" })],
          }
        : {
            etapa_actual: nombres.f,
            inscrito_a_mano: null,
            inscripciones: [{ fecha: "2026-10-01" }],
            cambios: [cambio("c1", null, nombres.nuevo, { origen: "sistema", usuario: null, motivo: "alta" }), cambio("c2", nombres.nuevo, nombres.f, { a_mano: true, motivo: "inscripcion_a_mano", nota: "Antes se anotó a mano" })],
          };
  await responder(c, "GET", enApi(`/api/leads/${leadId}/historial`), 200, cuerpo);
}

function tareasDeTodosLosTipos(c: Contexto, cuerpo: Json, estado: "pendiente" | "hecha" | "descartada", cuantas?: number): Json {
  const tipos = ["sin_plantilla_apta", "revision_manual", "baja_volvio_a_escribir", "entrega_fallida", "envio_incierto", "automatizacion_omitida", "baja_solicitada", "lista_espera_nueva", "lista_espera_lugar_liberado", "llamar_no_asistio", "avisar_cambio_de_clase", "lead_frio", "listo_para_cerrar", "evento_inesperado", "deuda_vencida", "cobranza_sin_canal"];
  const usados = cuantas ? tipos.slice(0, cuantas) : tipos;
  const datos = usados.map((tipo, i) => ({
    id: `t-${estado}-${i}`,
    tipo,
    estado,
    descripcion: tipo === "entrega_fallida" ? "WhatsApp no entregó el recordatorio de pago a Familia Rojas (código 131026)." : `Revisar el caso de Familia ${NOMBRES[i % NOMBRES.length]!.replace("Familia ", "")}: ${tipo.replace(/_/g, " ")}.`,
    codigo_error: tipo === "entrega_fallida" ? 131026 : i === 4 ? 470 : null,
    lead_id: i % 5 === 4 ? null : c.mundo.asesor.alfa.leadId,
    lead: i % 5 === 4 ? null : { nombre_contacto: NOMBRES[i % NOMBRES.length], telefono: i % 3 === 0 ? null : `+52 55 1234 ${String(5600 + i)}` },
    conversacion_id: null,
    inscripcion_id: null,
    cargo_id: null,
    vence_en: i % 4 === 0 ? new Date(Date.now() + 2 * 86_400_000).toISOString() : null,
    resuelta_en: estado === "pendiente" ? null : new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
    creado_en: new Date(Date.now() - (i + 2) * 86_400_000).toISOString(),
  }));
  return { ...cuerpo, datos, paginacion: { ...(cuerpo.paginacion ?? {}), total: datos.length } };
}

/** La ficha de un lead con todas las secciones llenas (niños, cotizaciones, clases, tareas, historial). */
async function fichaLlena(c: Contexto): Promise<void> {
  const alfa = c.mundo.asesor.alfa;
  await conYo(c, { chatwoot: "https://chatwoot.ejemplo.test" });
  await editarGet(c, enApi(`/api/leads/${alfa.leadId}`), (l) => ({ ...l, anuncio_titulo: "Clases de prueba gratis este mes", atribucion: { fuente: "anuncio", utm_source: "facebook", utm_medium: "cpc", utm_campaign: "regreso-a-clases", utm_content: "video-1", codigo_rastreo: "ABCD2345" }, prospectos: ninosVariados(l.prospectos[0]) }));
  await cotizacionesFalsas(c);
  await clasesFalsas(c);
  await historialFalso(c, alfa.leadId, "perdido");
}

/** La misma ficha con todas sus listas en cero. */
async function fichaVacia(c: Contexto): Promise<void> {
  const alfa = c.mundo.asesor.alfa;
  await editarGet(c, enApi(`/api/leads/${alfa.leadId}`), (l) => ({ ...l, prospectos: [], conversaciones: [], campana: null, atribucion: null }));
  const vacia = (cuerpo: Json): Json => ({ ...cuerpo, datos: [], paginacion: { ...(cuerpo.paginacion ?? {}), total: 0 } });
  await editarGet(c, (u) => /^\/api\/leads\/[^/]+\/cotizaciones$/.test(u.pathname), vacia);
  await editarGet(c, enApi("/api/clases-muestra"), vacia);
  await editarGet(c, enApi("/api/tareas"), vacia);
  await responder(c, "GET", enApi(`/api/leads/${alfa.leadId}/historial`), 200, { etapa_actual: "Nuevo", inscrito_a_mano: null, inscripciones: [], cambios: [] });
}
