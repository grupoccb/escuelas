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
  await editarGet(c, enApi("/api/leads"), (cuerpo) => {
    const base = (cuerpo.datos as Json[])[0];
    const datos = Array.from({ length: n }, (_, i) => ({
      ...base,
      id: `muchos-${i}`,
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

// ─── Escenas ──────────────────────────────────────────────────────────────────────────────────

const e = (x: Omit<Escena, "rol" | "grupo"> & { rol?: Escena["rol"] }): Escena => ({ rol: "asesor", grupo: "Asesor", ...x });

const CON_DIALOGO = /^asesor-(marcar-inscrito|nino-(agregar|corregir|quitar)|clase-|ficha-mover|ficha-marcar)/;

/** Una escena con un `<dialog>` abierto se captura solo en la ventana (de página entera, el fondo gris y el diálogo, fijos a la ventana, salen descuadrados). */
const conVentana = (lista: Escena[]): Escena[] => lista.map((x) => (CON_DIALOGO.test(x.id) && x.id !== "asesor-nino-agregado-con-aviso" ? { ...x, completa: false } : x));

export const ESCENAS: Escena[] = conVentana([
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
    titulo: "Embudo con «Solo estancados» marcado (el indicador «Sin movimiento N d»)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    ir: async (c) => {
      await ir(c, "/embudo");
      await c.page.getByRole("button", { name: "Ver solo los estancados" }).click();
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
    id: "asesor-embudo-tablero-celular-desplazado",
    titulo: "Embudo en tablero en celular, desplazado a las últimas columnas (scroll horizontal)",
    tipo: "estado",
    ruta: "/embudo",
    fuentes: EMBUDO,
    vistas: ["celular"],
    ir: async (c) => {
      await ir(c, "/embudo");
      await c.page.getByTestId(`columna-${c.mundo.etapas["perdido"]}`).scrollIntoViewIfNeeded();
      await c.page.waitForTimeout(300);
    },
  }),
  e({ id: "asesor-embudo-administrador-tablero", rol: "administrador", titulo: "Embudo en tablero visto por el administrador (leads de las dos sucursales)", tipo: "pantalla", ruta: "/embudo", fuentes: EMBUDO, ir: (c) => ir(c, "/embudo") }),

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
    titulo: "Tareas con la lista de «Tipo de tarea» y un tipo elegido",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await ir(c, "/tareas");
      await c.page.getByLabel("Tipo de tarea").selectOption({ label: "Lead sin movimiento" });
      await listo(c);
    },
  }),
  e({
    id: "asesor-tareas-filtro-sin-resultados",
    titulo: "Tareas pendientes con un tipo que no tiene ninguna («No hay tareas pendientes»)",
    tipo: "estado",
    ruta: "/tareas",
    fuentes: TAREAS,
    ir: async (c) => {
      await ir(c, "/tareas");
      await c.page.getByLabel("Tipo de tarea").selectOption({ label: "Deuda vencida" });
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
]);

// ─── Pasos y datos de apoyo (se usan arriba; las funciones se elevan) ─────────────────────────

async function abrirMarcarDesdeEmbudo(c: Contexto): Promise<void> {
  await conYo(c, { apagar: ["inscripcion"] });
  await ir(c, "/embudo");
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
