// Escenas del área Recepción: buscar familia, registrar pago, estado de cuenta, uniformes por entregar, ventas y cierre del día.
//
// Las escenas que NO escriben en la base van primero y usan a la familia Gómez (`mundo.recepcion.gomez`: cargo vencido, sin pagos) y a la familia del uniforme
// (`mundo.recepcion.uniforme`: ya pagó su primera mensualidad). Las que sí envían (registrar un pago, vender, cancelar, anular) van AL FINAL y usan la familia
// `mundo.recorridos.por[<vista>].pago`, una por vista, para que el escritorio y el celular vean lo mismo.

import type { Page } from "@playwright/test";
import { conCargando, conError, conMuchosDatos, conVacio, cortarLaRed, esperarListo, fallarLaSiguienteEscritura, irA, type Contexto, type Escena } from "./escenas.ts";

const GRUPO = "Recepción";
const BUSCADOR = "web/src/pantallas/recepcion/BuscadorDeFamilia.tsx";
const PAGO = "web/src/pantallas/recepcion/RegistrarPago.tsx";
const CUENTA = "web/src/pantallas/recepcion/EstadoDeCuenta.tsx";
const CANCELAR = "web/src/pantallas/recepcion/CancelarPago.tsx";
const UNIFORMES = "web/src/pantallas/recepcion/Uniformes.tsx";
const VENTAS = "web/src/pantallas/recepcion/Ventas.tsx";
const VENTAS_PIEZAS = ["web/src/pantallas/recepcion/NuevaVenta.tsx", "web/src/pantallas/recepcion/ProductosParaVender.tsx"];
const CORTE = "web/src/pantallas/recepcion/CorteDelDia.tsx";
const CORTE_PIEZAS = ["web/src/pantallas/recepcion/ResumenDelCorte.tsx", "web/src/pantallas/recepcion/PagosDelCorte.tsx"];

 
type J = any;

// ─── Ayudas propias ──────────────────────────────────────────────────────────────────────────

const gomez = (c: Contexto) => c.mundo.recepcion.gomez;
const uniforme = (c: Contexto) => c.mundo.recepcion.uniforme;
/** La familia que solo usan las escenas que escriben (una por vista). */
const propia = (c: Contexto) => c.mundo.recorridos.por[c.vista].pago;

const rutaPago = (tutorId: string): string => `/pagos?tutor=${tutorId}`;
const monto = (page: Page) => page.getByLabel(/^Monto recibido/);

/** Cambia la respuesta JSON de un GET a la API (la ruta se queda para lo que venga después). */
async function transformar(c: Contexto, coincide: (u: URL) => boolean, f: (cuerpo: J) => J): Promise<void> {
  await c.page.route(coincide, async (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    const resp = await r.fetch();
    let cuerpo = await resp.text();
    try {
      cuerpo = JSON.stringify(f(JSON.parse(cuerpo) as J));
    } catch {
      // No era JSON: se deja como vino.
    }
    return r.fulfill({ response: resp, body: cuerpo });
  });
}

/** Un GET a la API que nunca termina (se ve el estado «cargando» de esa parte de la pantalla). */
async function colgar(c: Contexto, coincide: (u: URL) => boolean): Promise<void> {
  await c.page.route(coincide, (r) => (r.request().method() === "GET" ? new Promise<void>(() => undefined) : r.fallback()));
}

/** Un GET a la API que falla con 500. */
async function romper(c: Contexto, coincide: (u: URL) => boolean): Promise<void> {
  await c.page.route(coincide, (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { codigo: "interno", mensaje: "Algo salió mal en el servidor. Inténtalo de nuevo." } }) })
      : r.fallback(),
  );
}

const esTutores = (u: URL): boolean => u.pathname === "/api/tutores";
const esCuentaDe = (u: URL): boolean => /^\/api\/tutores\/[^/]+\/estado-cuenta$/.test(u.pathname);
const esPropuesta = (u: URL): boolean => u.pathname === "/api/pagos/propuesta";
const esListaDePagos = (u: URL): boolean => u.pathname === "/api/pagos";
const esCorte = (u: URL): boolean => u.pathname === "/api/pagos/corte";
const esProductos = (u: URL): boolean => u.pathname === "/api/productos";
const esAlumnos = (u: URL): boolean => u.pathname === "/api/alumnos";
const esVerticales = (u: URL): boolean => u.pathname === "/api/verticales";
const esProgramas = (u: URL): boolean => u.pathname === "/api/programas";
const esInscripciones = (u: URL): boolean => u.pathname === "/api/inscripciones";

/** Colores de ejemplo para las disciplinas de las escenas (en la aplicación salen del dato `color_marca` de cada disciplina, nunca de aquí). */
const COLORES_DE_EJEMPLO = ["#c8402a", "#c43a73", "#1f7a8c"];

/**
 * Pone a los dos hijos de la familia en DISCIPLINAS DISTINTAS con color: parcha las tres respuestas de las que sale la etiqueta (inscripciones de la familia, programas y disciplinas)
 * para que el escritorio y el celular vean dos etiquetas de color distinto. Es la misma cadena de datos que usa la pantalla; solo cambian los valores.
 */
async function conDisciplinasDeColor(c: Contexto): Promise<void> {
  const ids: string[] = [];
  await c.page.route(esVerticales, async (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    const resp = await r.fetch();
    const j = (await resp.json()) as J;
    const datos: J[] = [...(j.datos ?? [])];
    while (datos.length < 2) datos.push({ ...datos[0], id: `disciplina-de-ejemplo-${datos.length}`, nombre: `Disciplina ${datos.length + 1}`, slug: `disciplina-de-ejemplo-${datos.length}` });
    const conColor = datos.map((v, i) => ({ ...v, color_marca: COLORES_DE_EJEMPLO[i % COLORES_DE_EJEMPLO.length] }));
    ids.splice(0, ids.length, ...conColor.map((v) => v.id as string));
    return r.fulfill({ response: resp, json: { ...j, datos: conColor } });
  });
  await transformar(c, esProgramas, (j) => ({ ...j, datos: [...(j.datos ?? []), { ...(j.datos?.[0] ?? {}), id: "programa-de-ejemplo-0", vertical_id: ids[0] }, { ...(j.datos?.[0] ?? {}), id: "programa-de-ejemplo-1", vertical_id: ids[1] ?? ids[0] }] }));
  await transformar(c, esInscripciones, (j) => {
    const alumnos = [...new Set((j.datos ?? []).map((i: J) => i.alumno_id))];
    return { ...j, datos: (j.datos ?? []).map((i: J) => ({ ...i, programa_id: `programa-de-ejemplo-${alumnos.indexOf(i.alumno_id) % 2}` })) };
  });
}

function multiplicar(lista: J[], veces: number): J[] {
  const salida: J[] = [];
  for (let i = 0; i < veces; i++) for (const x of lista) salida.push(i === 0 ? x : { ...x, id: `${x.id}-copia-${i}` });
  return salida;
}

async function buscar(c: Contexto, texto: string): Promise<void> {
  await c.page.getByLabel("Teléfono o nombre de la familia").fill(texto);
  await c.page.getByRole("button", { name: "Buscar" }).click();
  await esperarListo(c.page);
}

async function dialogoAbierto(page: Page): Promise<void> {
  await page.locator("dialog[open]").waitFor();
  await esperarListo(page);
}

/** El estado de cuenta como si la familia no debiera nada (todo pagado). */
function alCorriente(j: J): J {
  const cero = "0.00";
  const liquidar = (r: J) => {
    r.total_pagado = r.total_cargado;
    r.saldo = cero;
    r.vencido = cero;
    r.antiguedad = { de_0_a_30: cero, de_31_a_60: cero, de_61_a_90: cero, mas_de_90: cero };
  };
  liquidar(j.resumen);
  for (const h of j.hijos ?? []) {
    liquidar(h);
    for (const cargo of h.cargos ?? []) {
      cargo.monto_pagado = cargo.monto_final;
      cargo.saldo = cero;
      cargo.estatus = "pagado";
      cargo.estatus_efectivo = "pagado";
      cargo.dias_de_atraso = 0;
    }
  }
  return j;
}

/** El estado de cuenta de una familia que todavía no tiene cargos ni pagos. */
function sinCargos(j: J): J {
  const cero = "0.00";
  return { ...j, resumen: { total_cargado: cero, total_pagado: cero, saldo: cero, vencido: cero, antiguedad: { de_0_a_30: cero, de_31_a_60: cero, de_61_a_90: cero, mas_de_90: cero } }, hijos: [], pagos: [] };
}

async function mananaEnElNavegador(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const dos = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  });
}

async function ayerEnElNavegador(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const dos = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  });
}

/** Gómez con un monto escrito y la propuesta ya a la vista. */
async function conMontoEscrito(c: Contexto, texto: string): Promise<void> {
  await irA(c, rutaPago(gomez(c).tutorId));
  await monto(c.page).fill(texto);
  await c.page.getByTestId("propuesta").waitFor();
  await esperarListo(c.page);
}

/** Escribe el monto y deja a la vista el formulario con el error (o lo que corresponda) del monto. */
async function conMontoMalo(c: Contexto, texto: string): Promise<void> {
  await irA(c, rutaPago(gomez(c).tutorId));
  await monto(c.page).fill(texto);
  await esperarListo(c.page);
}

async function abrirReparto(c: Contexto, texto: string): Promise<void> {
  await conMontoEscrito(c, texto);
  await c.page.getByRole("button", { name: "Ajustar el reparto a mano" }).click();
  await c.page.getByTestId("ajuste").waitFor();
}

async function llenarReparto(c: Contexto, valores: string[]): Promise<void> {
  const campos = c.page.getByTestId("ajuste").getByRole("textbox");
  const n = await campos.count();
  for (let i = 0; i < n; i++) await campos.nth(i).fill(valores[i] ?? "");
  await esperarListo(c.page);
}

/** Escribe un importe en el primer cargo de cada hijo que se nombra (el campo se llama «<hijo> · <cargo> (saldo …)»): así el reparto cae entre hijos distintos sin depender del orden de los cargos. */
async function repartirEntreHijos(c: Contexto, partes: [string, string][]): Promise<void> {
  const campos = c.page.getByTestId("ajuste").getByRole("textbox");
  for (let i = 0; i < (await campos.count()); i++) await campos.nth(i).fill("");
  for (const [hijo, importe] of partes) await c.page.getByTestId("ajuste").getByRole("textbox", { name: new RegExp(`^${hijo} ·`) }).first().fill(importe);
  await esperarListo(c.page);
}

/** Abre el diálogo «Cancelar el pago» sobre el pago de la familia del uniforme (no se cancela nada). */
async function abrirCancelarPago(c: Contexto): Promise<void> {
  await irA(c, rutaPago(uniforme(c).tutorId));
  await c.page.getByRole("button", { name: "Cancelar pago", exact: true }).first().click();
  await dialogoAbierto(c.page);
}

/** Los folios de los pagos de ejemplo salen de las primeras ocho cifras del id: P-3F9A12B1, P-3F9A12B2… */
const ID_DE_PAGO = (n: number): string => `3f9a12b${n}-0000-4000-8000-00000000000${n}`;
const centavosDe = (t: string): number => Math.round(Number.parseFloat(t) * 100);
const textoDe = (c: number): string => (c / 100).toFixed(2);
const ES_ABONO = "300.00";

/**
 * El estado de cuenta de una familia «con de todo», parchado sobre la respuesta real: el primer hijo con una mensualidad pagada, una vencida y una con abono; el segundo con la primera pagada
 * y el resto pendiente; y cuatro pagos, el último cancelado con su motivo. Solo cambian los valores de la respuesta: la pantalla lee la misma forma de siempre.
 */
function cuentaCompleta(j: J): J {
  const hijos: J[] = j.hijos ?? [];
  const una = (h: J, periodo: string, vence: string, base: J) => ({ ...base, id: `${h.alumno.id}-${periodo}`, concepto: "mensualidad", periodo, descripcion: null, monto_final: "650.00", fecha_vencimiento: vence });
  const pagado = (x: J) => ({ ...x, monto_pagado: x.monto_final, saldo: "0.00", estatus: "pagado", estatus_efectivo: "pagado", dias_de_atraso: 0 });
  const pendiente = (x: J) => ({ ...x, monto_pagado: "0.00", saldo: x.monto_final, estatus: "pendiente", estatus_efectivo: "pendiente", dias_de_atraso: 0 });
  hijos.forEach((h, i) => {
    const base = h.cargos?.[0] ?? {};
    const agosto = pagado(una(h, "2026-08", "2026-08-15", base));
    const septiembre = i === 0 ? { ...pendiente(una(h, "2026-09", "2026-09-15", base)), estatus_efectivo: "vencido", dias_de_atraso: 26 } : pagado(una(h, "2026-09", "2026-09-15", base));
    const octubre = i === 0 ? { ...pendiente(una(h, "2026-10", "2026-10-15", base)), monto_pagado: ES_ABONO, saldo: textoDe(centavosDe("650.00") - centavosDe(ES_ABONO)) } : pendiente(una(h, "2026-10", "2026-10-15", base));
    h.cargos = [agosto, septiembre, octubre];
    const vivos: J[] = h.cargos;
    h.total_cargado = textoDe(vivos.reduce((s, x) => s + centavosDe(x.monto_final), 0));
    h.total_pagado = textoDe(vivos.reduce((s, x) => s + centavosDe(x.monto_pagado), 0));
    h.saldo = textoDe(vivos.reduce((s, x) => s + centavosDe(x.saldo), 0));
    const vencido = vivos.filter((x) => x.estatus_efectivo === "vencido").reduce((s, x) => s + centavosDe(x.saldo), 0);
    h.vencido = textoDe(vencido);
    h.antiguedad = { de_0_a_30: textoDe(vencido), de_31_a_60: "0.00", de_61_a_90: "0.00", mas_de_90: "0.00" };
  });
  const suma = (campo: string) => textoDe(hijos.reduce((s, h) => s + centavosDe(h[campo]), 0));
  j.resumen = { total_cargado: suma("total_cargado"), total_pagado: suma("total_pagado"), saldo: suma("saldo"), vencido: suma("vencido"), antiguedad: { de_0_a_30: suma("vencido"), de_31_a_60: "0.00", de_61_a_90: "0.00", mas_de_90: "0.00" } };
  const cargosDe = (mes: string) => hijos.map((h) => ({ cargo_id: `${h.alumno.id}-${mes}`, monto: "650.00", estatus: "aplicado" }));
  j.pagos = [
    { id: ID_DE_PAGO(1), monto: ES_ABONO, monto_aplicado: ES_ABONO, metodo: "efectivo", referencia: null, fecha: "2026-10-08", estatus: "aplicado", motivo_cancelacion: null, registrado_por: "Rita Recepción", aplicaciones: [{ cargo_id: `${hijos[0]?.alumno.id}-2026-10`, monto: ES_ABONO, estatus: "aplicado" }] },
    { id: ID_DE_PAGO(2), monto: "1300.00", monto_aplicado: "1300.00", metodo: "transferencia", referencia: "4471", fecha: "2026-09-15", estatus: "aplicado", motivo_cancelacion: null, registrado_por: "Rita Recepción", aplicaciones: cargosDe("2026-09").slice(1) },
    { id: ID_DE_PAGO(3), monto: "1300.00", monto_aplicado: "1300.00", metodo: "efectivo", referencia: null, fecha: "2026-08-12", estatus: "aplicado", motivo_cancelacion: null, registrado_por: "Rita Recepción", aplicaciones: cargosDe("2026-08") },
    { id: ID_DE_PAGO(4), monto: "1300.00", monto_aplicado: "0.00", metodo: "tarjeta", referencia: "22190", fecha: "2026-08-12", estatus: "cancelado", motivo_cancelacion: "Se registró dos veces", registrado_por: "Rita Recepción", aplicaciones: [] },
  ];
  return j;
}

/** Abre «Cancelar el pago» desde el estado de cuenta (la cuenta parchada: no se cancela nada de verdad). */
async function abrirCancelarDeLaCuenta(c: Contexto): Promise<void> {
  await conDisciplinasDeColor(c);
  await transformar(c, esCuentaDe, cuentaCompleta);
  await irA(c, `/cuenta/${gomez(c).tutorId}`);
  await c.page.getByRole("button", { name: `Cancelar el pago P-${ID_DE_PAGO(1).slice(0, 8).toUpperCase()}` }).click();
  await dialogoAbierto(c.page);
}

const esEntregados = (u: URL): boolean => u.pathname === "/api/beneficios/entregados";
const esPorEntregar = (u: URL): boolean => u.pathname === "/api/beneficios/por-entregar";

/**
 * Cinco uniformes por entregar y tres entregados, de tres disciplinas con color, y el inventario que les corresponde (Quedan 3, Queda 1, sin existencia, sin talla). Se parchan las respuestas
 * de la API (disciplinas, por entregar, entregados e inventario): la pantalla lee la misma forma de siempre.
 */
async function conBeneficiosDeEjemplo(c: Contexto): Promise<void> {
  const verticales = ["disciplina-de-ejemplo-0", "disciplina-de-ejemplo-1", "disciplina-de-ejemplo-2"];
  await c.page.route(esVerticales, async (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    const resp = await r.fetch();
    const j = (await resp.json()) as J;
    const base = j.datos?.[0] ?? {};
    return r.fulfill({ response: resp, json: { ...j, datos: verticales.map((id, i) => ({ ...base, id, nombre: `Disciplina ${i + 1}`, slug: id, color_marca: COLORES_DE_EJEMPLO[i] })) } });
  });
  const pieza = (id: string, v: number, talla: string | null, stock: number): J => ({ id, vertical: { id: verticales[v], nombre: `Disciplina ${v + 1}` }, nombre: `Prenda ${v + 1}`, talla, precio: "350.00", stock, activo: true });
  await transformar(c, esProductos, (j) => ({ ...j, datos: [pieza("p0", 0, "6", 3), pieza("p1", 1, "6", 1), pieza("p2", 2, "M", 0), pieza("p3", 0, "8", 5)], paginacion: { ...j.paginacion, total: 4 } }));
  const quien = (n: number, nombre: string, talla: string | null, v: number, grupo: string, dias: number): J => ({
    id: `ejemplo-${n}`,
    inscripcion_id: `insc-${n}`,
    alumno: { id: `alumno-${n}`, nombre, apellidos: "De Ejemplo", talla_uniforme: talla },
    tutor: { id: `tutor-${n}`, nombre: "Tutora", apellidos: `Ejemplo ${n}`, telefono: `+52555500000${n}` },
    sucursal_id: "sucursal",
    vertical_id: verticales[v],
    grupo,
    promocion: "Uniforme de bienvenida",
    tipo: "producto_gratis",
    descripcion: `Prenda ${v + 1}`,
    producto_id: null,
    liberado_en: new Date(Date.now() - dias * 86_400_000).toISOString(),
  });
  const lista = [quien(0, "Alumno Uno", "6", 0, "Grupo A", 3), quien(1, "Alumna Dos", "6", 1, "Grupo B", 6), quien(2, "Alumna Tres", "M", 2, "Grupo C", 9), quien(3, "Alumno Cuatro", "8", 0, "Grupo A", 10), quien(4, "Alumna Cinco", null, 1, "Grupo B", 11)];
  await transformar(c, esPorEntregar, (j) => ({ ...j, datos: lista, paginacion: { ...j.paginacion, total: lista.length } }));
  const entregado = (n: string, base: J, minutos: number, producto: J | null): J => ({ ...base, id: `ejemplo-${n}`, entregado_en: new Date(Date.now() - minutos * 60_000).toISOString(), entregado_por: { id: "usuario", nombre: "Rita Recepción" }, producto });
  const ya = [entregado("e1", quien(5, "Alumno Seis", "4", 0, "Grupo A", 12), 1, { nombre: "Prenda 1", talla: "4" }), entregado("e2", quien(6, "Alumna Siete", "8", 1, "Grupo B", 13), 60 * 28, { nombre: "Prenda 2", talla: "8" }), entregado("e3", quien(7, "Alumna Ocho", "M", 2, "Grupo C", 20), 60 * 24 * 6, null)].map((x, i) => ({ ...x, id: ["ejemplo-e1", "ejemplo-e2", "ejemplo-e3"][i] }));
  await transformar(c, esEntregados, (j) => ({ ...j, datos: ya, paginacion: { ...j.paginacion, total: ya.length } }));
}

/** Registra un pago por la pantalla (monto y, si se pide, el reparto) y espera el aviso de «Pago registrado». */
async function pagar(c: Contexto, texto: string): Promise<void> {
  await irA(c, rutaPago(propia(c).tutorId));
  await monto(c.page).fill(texto);
  await c.page.getByTestId("propuesta").waitFor();
  await c.page.getByRole("button", { name: /^Registrar pago/ }).click();
  await c.page.getByTestId("pago-registrado").waitFor();
  await esperarListo(c.page);
}

/** Vende una pieza por la API (con la sesión de la escena) si todavía no hay una venta que anular; devuelve cuando la lista ya la muestra. */
async function asegurarUnaVenta(c: Contexto): Promise<void> {
  await irA(c, "/ventas");
  if ((await c.page.getByRole("button", { name: "Anular", exact: true }).count()) > 0) return;
  const cabeceras = { "x-requested-with": "prueba" };
  const hijo = propia(c).hijos[0]!;
  const alumnos = (await (await c.page.request.get(`/api/alumnos?nombre=${encodeURIComponent(hijo.nombre)}`, { headers: cabeceras })).json()) as { datos: { id: string }[] };
  const productos = (await (await c.page.request.get("/api/productos?activo=true&limite=100", { headers: cabeceras })).json()) as { datos: { id: string; talla: string | null; nombre: string; stock: number }[] };
  const pieza = productos.datos.find((p) => p.nombre === "Uniforme" && p.talla === propia(c).talla && p.stock > 0);
  if (!alumnos.datos[0] || !pieza) throw new Error("No hay con qué sembrar una venta para la escena");
  await c.page.request.post("/api/ventas", { headers: cabeceras, data: { alumno_id: alumnos.datos[0].id, producto_id: pieza.id, cantidad: 1, clave_idempotencia: `escena-${c.vista}-${Date.now()}` } });
  await irA(c, "/ventas");
}

async function abrirAnular(c: Contexto): Promise<void> {
  await asegurarUnaVenta(c);
  await c.page.getByRole("button", { name: "Anular", exact: true }).first().click();
  await dialogoAbierto(c.page);
}

/** Busca a un alumno de la familia propia en «Nueva venta» y deja elegido uno de la pieza de su talla. */
async function prepararVenta(c: Contexto, nombre: string): Promise<void> {
  await irA(c, "/ventas");
  await c.page.getByLabel("Buscar al alumno por nombre").fill(nombre);
  await c.page.getByRole("button", { name: "Buscar", exact: true }).click();
  await c.page.getByLabel("Alumno", { exact: true }).waitFor();
  await esperarListo(c.page);
}

// ─── Escenas ─────────────────────────────────────────────────────────────────────────────────

const LISTA: Escena[] = [
  // ═══ Registrar pago · buscar a la familia ═══
  {
    id: "recep-pagos-buscador-inicial",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago sin familia elegida: el buscador, sin búsqueda",
    tipo: "pantalla",
    ruta: "/pagos",
    fuentes: [PAGO, BUSCADOR],
    ir: (c) => irA(c, "/pagos"),
  },
  {
    id: "recep-pagos-buscador-una-letra",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador con una sola letra: la ayuda pide al menos dos y «Buscar» está apagado",
    tipo: "formulario",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await irA(c, "/pagos");
      await c.page.getByLabel("Teléfono o nombre de la familia").fill("G");
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-buscador-resultados-nombre",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador con resultados, buscando por nombre",
    tipo: "estado",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await irA(c, "/pagos");
      await buscar(c, "Gómez");
      await c.page.getByTestId(`familia-${gomez(c).tutorId}`).waitFor();
    },
  },
  {
    id: "recep-pagos-buscador-resultados-telefono",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador con resultados, buscando por teléfono escrito con espacios y paréntesis",
    tipo: "estado",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await irA(c, "/pagos");
      await buscar(c, "(55) 5501 0101");
      await c.page.getByTestId(`familia-${gomez(c).tutorId}`).waitFor();
    },
  },
  {
    id: "recep-pagos-buscador-sin-resultados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador sin resultados: «No encontré a esa familia»",
    tipo: "estado",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await irA(c, "/pagos");
      await buscar(c, "Zzzzzz");
      await c.page.getByText("No encontré a esa familia").waitFor();
    },
  },
  {
    id: "recep-pagos-buscador-telefono-incompleto",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador con un teléfono incompleto: aviso «Ese teléfono no está completo»",
    tipo: "estado",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await irA(c, "/pagos");
      await buscar(c, "5555");
      await c.page.getByText("Ese teléfono no está completo").waitFor();
    },
  },
  {
    id: "recep-pagos-buscador-busqueda-incompleta",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador con resultados y el aviso «Hay más resultados de los que se pudieron revisar»",
    tipo: "estado",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await transformar(c, esTutores, (j) => ({ ...j, paginacion: { ...j.paginacion, busqueda_incompleta: true } }));
      await irA(c, "/pagos");
      await buscar(c, "Gómez");
      await c.page.getByText("Hay más resultados de los que se pudieron revisar").waitFor();
    },
  },
  {
    id: "recep-pagos-buscador-muchos-resultados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador con muchos resultados (20 familias)",
    tipo: "estado",
    fuentes: [BUSCADOR],
    completa: true,
    ir: async (c) => {
      await transformar(c, esTutores, (j) => ({ ...j, datos: multiplicar(j.datos ?? [], 20) }));
      await irA(c, "/pagos");
      await buscar(c, "Gómez");
      await c.page.getByTestId(`familia-${gomez(c).tutorId}`).waitFor();
    },
  },
  {
    id: "recep-pagos-buscador-buscando",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador mientras busca: «Buscando…»",
    tipo: "estado",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await colgar(c, esTutores);
      await irA(c, "/pagos");
      await c.page.getByLabel("Teléfono o nombre de la familia").fill("Gómez");
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await c.page.getByText("Buscando…").waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "recep-pagos-buscador-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador con error de carga y botón de reintentar",
    tipo: "estado",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await romper(c, esTutores);
      await irA(c, "/pagos");
      await buscar(c, "Gómez");
    },
  },
  {
    id: "recep-pagos-buscador-sin-red",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Buscador sin conexión: la búsqueda falla con «No hay conexión»",
    tipo: "estado",
    fuentes: [BUSCADOR],
    ir: async (c) => {
      await irA(c, "/pagos");
      await c.page.getByLabel("Teléfono o nombre de la familia").fill("Gómez");
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: "Buscar" }).click();
      await esperarListo(c.page);
    },
  },

  // ═══ Registrar pago · la familia elegida ═══
  {
    id: "recep-pagos-familia-con-adeudo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago con la familia elegida desde el buscador: adeudo con cargo vencido, formulario vacío y sin pagos recientes",
    tipo: "paso",
    fuentes: [PAGO, BUSCADOR],
    completa: true,
    ir: async (c) => {
      await irA(c, "/pagos");
      await buscar(c, "55 5501-0101");
      await c.page.getByTestId(`familia-${gomez(c).tutorId}`).getByRole("button", { name: "Elegir" }).click();
      await c.page.getByTestId("saldo-total").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-familia-cargando",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago: la familia está elegida y el estado de cuenta aún carga",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await colgar(c, esCuentaDe);
      await c.page.goto(rutaPago(gomez(c).tutorId));
      await c.page.locator(".giro, .cargando").first().waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "recep-pagos-familia-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago: error al cargar el estado de cuenta de la familia",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await romper(c, esCuentaDe);
      await irA(c, rutaPago(gomez(c).tutorId));
    },
  },
  {
    id: "recep-pagos-familia-al-corriente",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago con una familia sin adeudo (tiene cargos, todos pagados): «No hay nada que cobrar»",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await transformar(c, esCuentaDe, alCorriente);
      await irA(c, rutaPago(gomez(c).tutorId));
    },
  },
  {
    id: "recep-pagos-familia-sin-cargos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago con una familia que todavía no tiene cargos ni pagos",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await transformar(c, esCuentaDe, sinCargos);
      await transformar(c, esListaDePagos, (j) => ({ ...j, datos: [] }));
      await irA(c, rutaPago(gomez(c).tutorId));
    },
  },
  {
    id: "recep-pagos-familia-muchos-datos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago con muchos hijos y cargos",
    tipo: "estado",
    fuentes: [PAGO],
    completa: true,
    ir: (c) => conMuchosDatos(c, rutaPago(gomez(c).tutorId), 8),
  },
  {
    id: "recep-pagos-familia-con-pagos-recientes",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago con una familia que ya pagó: lista «Pagos recientes» con botón «Cancelar pago»",
    tipo: "estado",
    fuentes: [PAGO],
    completa: true,
    ir: async (c) => {
      await irA(c, rutaPago(uniforme(c).tutorId));
      await c.page.getByRole("button", { name: "Cancelar pago", exact: true }).first().waitFor();
    },
  },
  {
    id: "recep-pagos-pagos-recientes-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago: error al cargar «Pagos recientes»",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await romper(c, esListaDePagos);
      await irA(c, rutaPago(gomez(c).tutorId));
    },
  },

  // ═══ Registrar pago · el formulario ═══
  {
    id: "recep-pagos-monto-letras",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: monto con letras, error de validación y «Registrar pago» apagado",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: (c) => conMontoMalo(c, "abc"),
  },
  {
    id: "recep-pagos-monto-cero",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: monto en cero, error «El importe debe ser mayor que cero»",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: (c) => conMontoMalo(c, "0"),
  },
  {
    id: "recep-pagos-monto-decimales",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: monto con tres decimales, error de validación",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: (c) => conMontoMalo(c, "12.345"),
  },
  {
    id: "recep-pagos-monto-parcial",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: monto de $300 que se abona al cargo vencido, con la insignia «Pago parcial»",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: (c) => conMontoEscrito(c, "300"),
  },
  {
    id: "recep-pagos-monto-varios-cargos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: monto de $1,000 repartido entre varios cargos, listo para registrar",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: (c) => conMontoEscrito(c, "1,000"),
  },
  {
    id: "recep-pagos-monto-todo-el-saldo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: el monto cubre TODO el saldo de la familia; el reparto muestra «Saldo después del pago» en cero",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await irA(c, rutaPago(gomez(c).tutorId));
      const total = (await c.page.getByTestId("saldo-total").innerText()).replace(/[$,\s]/g, "");
      await monto(c.page).fill(total);
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-monto-mayor-al-saldo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: monto mayor a lo que la familia adeuda, aviso «El pago pasa de lo que la familia adeuda»",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await irA(c, rutaPago(gomez(c).tutorId));
      await monto(c.page).fill("4000");
      await c.page.getByText("El pago pasa de lo que la familia adeuda").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-cobertura-total",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: el monto es justo el del cargo vencido; su barra se llena y dice «Este pago lo cubre», los demás cargos siguen «Pendiente»",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: (c) => conMontoEscrito(c, "800"),
  },
  {
    id: "recep-pagos-atajo-todo-el-saldo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: el atajo «Todo el saldo» llena el monto (queda marcado) y todas las barras de los cargos se llenan en verde",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await irA(c, rutaPago(gomez(c).tutorId));
      await c.page.getByRole("button", { name: /^Todo el saldo/ }).click();
      await c.page.getByTestId("propuesta").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-atajo-solo-lo-vencido",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: el atajo «Solo lo vencido» llena el monto con lo vencido (queda marcado) y el abono se reparte sin tocar lo que aún no vence",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await irA(c, rutaPago(gomez(c).tutorId));
      await c.page.getByRole("button", { name: /^Solo lo vencido/ }).click();
      await c.page.getByTestId("propuesta").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-familia-disciplinas-color",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago: los hijos en etiquetas con el color de su disciplina (distinta cada uno) y sus cargos agrupados bajo el punto de su color",
    tipo: "paso",
    fuentes: [PAGO],
    completa: true,
    ir: async (c) => {
      await conDisciplinasDeColor(c);
      await irA(c, rutaPago(gomez(c).tutorId));
      await c.page.getByTestId("saldo-total").waitFor();
      await c.page.locator('.etiqueta-hijo[data-disciplina=""]').first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-familia-etiquetas-neutras",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago cuando no se puede saber la disciplina de los hijos (inscripciones, programas o disciplinas no cargan): las etiquetas salen neutras, solo con el nombre, y la pantalla funciona igual",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await romper(c, esInscripciones);
      await romper(c, esProgramas);
      await romper(c, esVerticales);
      await irA(c, rutaPago(gomez(c).tutorId));
      await c.page.getByTestId("saldo-total").waitFor();
    },
  },
  {
    id: "recep-pagos-metodo-efectivo-sin-referencia",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago en efectivo: no hay campo de referencia (solo aparece con tarjeta o transferencia); se escribió una referencia con tarjeta y al volver a efectivo no viaja",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await conMontoEscrito(c, "500");
      await elegirMetodo(c.page, "tarjeta", "Tarjeta");
      await c.page.getByLabel("Referencia (opcional)").fill("VOUCHER-4821");
      await elegirMetodo(c.page, "efectivo", "Efectivo");
      await c.page.getByLabel("Referencia (opcional)").waitFor({ state: "detached" });
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-propuesta-cargando",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago mientras calcula el reparto: «Calculando el reparto…»",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await colgar(c, esPropuesta);
      await irA(c, rutaPago(gomez(c).tutorId));
      await monto(c.page).fill("500");
      await c.page.getByText("Calculando el reparto…").waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "recep-pagos-propuesta-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: error al calcular el reparto",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await romper(c, esPropuesta);
      await irA(c, rutaPago(gomez(c).tutorId));
      await monto(c.page).fill("500");
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-fecha-futura",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago: fecha de mañana, error «La fecha del pago no puede ser de mañana en adelante»",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await conMontoEscrito(c, "500");
      await c.page.getByLabel(/^Fecha del pago/).fill(await mananaEnElNavegador(c.page));
      await c.page.getByText("La fecha del pago no puede ser de mañana en adelante.").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-metodo-tarjeta",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago con método «Tarjeta» y folio de referencia",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await conMontoEscrito(c, "1500");
      await elegirMetodo(c.page, "tarjeta", "Tarjeta");
      await c.page.getByLabel("Referencia (opcional)").fill("VOUCHER-4821");
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-metodo-transferencia",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Formulario de pago con método «Transferencia», referencia y fecha de un día anterior",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await conMontoEscrito(c, "1500");
      await elegirMetodo(c.page, "transferencia", "Transferencia");
      await c.page.getByLabel("Referencia (opcional)").fill("SPEI-0098213");
      await c.page.getByLabel(/^Fecha del pago/).fill(await ayerEnElNavegador(c.page));
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-reparto-a-mano",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Reparto a mano: parte de la propuesta del servidor, con la suma que cuadra",
    tipo: "paso",
    fuentes: [PAGO],
    ir: (c) => abrirReparto(c, "1500"),
  },
  {
    id: "recep-pagos-reparto-a-mano-faltan",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Reparto a mano que no cuadra: faltan centavos, «Registrar pago» apagado",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await abrirReparto(c, "1500");
      await llenarReparto(c, ["800", "500", "199.99", "", ""]);
    },
  },
  {
    id: "recep-pagos-reparto-a-mano-errores",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Reparto a mano con errores por cargo: «Pasa del saldo de este cargo» y un importe con letras",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await abrirReparto(c, "1500");
      await llenarReparto(c, ["99999", "abc", "", ""]);
    },
  },
  {
    id: "recep-pagos-reparto-a-mano-sobran",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Reparto a mano que se pasa del monto: «sobran»",
    tipo: "formulario",
    fuentes: [PAGO],
    ir: async (c) => {
      await abrirReparto(c, "1500");
      await llenarReparto(c, ["800", "500", "400", "", ""]);
    },
  },
  {
    id: "recep-pagos-sin-red",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago sin conexión: error y la nota «el servidor reconoce la misma clave y NO lo duplica»",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await conMontoEscrito(c, "500");
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: /^Registrar pago/ }).click();
      await c.page.getByText(/NO lo duplica/).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-error-del-servidor",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Registrar pago: el servidor rechaza el pago y la pantalla muestra el error",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await conMontoEscrito(c, "500");
      await fallarLaSiguienteEscritura(c, 409, "Esa familia ya no debe ese cargo: otra persona acaba de cobrarlo.");
      await c.page.getByRole("button", { name: /^Registrar pago/ }).click();
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },

  // ═══ Registrar pago · «Cambiar de familia» (el buscador en un diálogo) ═══
  {
    id: "recep-pagos-cambiar-familia-dialogo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "«Cambiar de familia»: el diálogo «Buscar familia» abierto y vacío, sobre la familia que se estaba atendiendo (hoja inferior en celular)",
    tipo: "flotante",
    fuentes: [PAGO, BUSCADOR],
    ir: async (c) => {
      await irA(c, rutaPago(gomez(c).tutorId));
      await c.page.getByRole("button", { name: "Cambiar de familia" }).click();
      await dialogoAbierto(c.page);
    },
  },
  {
    id: "recep-pagos-cambiar-familia-resultados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "«Cambiar de familia»: el diálogo con resultados de la búsqueda y el botón «Elegir» de cada familia",
    tipo: "flotante",
    fuentes: [PAGO, BUSCADOR],
    ir: async (c) => {
      await irA(c, rutaPago(gomez(c).tutorId));
      await c.page.getByRole("button", { name: "Cambiar de familia" }).click();
      await dialogoAbierto(c.page);
      await buscar(c, "Gómez");
      await c.page.getByTestId(`familia-${gomez(c).tutorId}`).waitFor();
    },
  },
  {
    id: "recep-pagos-cambiar-familia-sin-resultados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "«Cambiar de familia»: el diálogo cuando la búsqueda no encuentra a nadie",
    tipo: "flotante",
    fuentes: [PAGO, BUSCADOR],
    ir: async (c) => {
      await irA(c, rutaPago(gomez(c).tutorId));
      await c.page.getByRole("button", { name: "Cambiar de familia" }).click();
      await dialogoAbierto(c.page);
      await buscar(c, "Zzzzzz");
      await c.page.getByText("No encontré a esa familia").waitFor();
    },
  },
  {
    id: "recep-pagos-cambiar-familia-elegida",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "«Cambiar de familia»: se elige otra familia desde el diálogo y la pantalla sigue con la nueva (la misma, aquí, para no depender de otros datos), sin el diálogo",
    tipo: "paso",
    fuentes: [PAGO, BUSCADOR],
    ir: async (c) => {
      await irA(c, rutaPago(uniforme(c).tutorId));
      await c.page.getByRole("button", { name: "Cambiar de familia" }).click();
      await dialogoAbierto(c.page);
      await buscar(c, "Gómez");
      await c.page.getByTestId(`familia-${gomez(c).tutorId}`).getByRole("button", { name: "Elegir" }).click();
      await c.page.getByTestId("saldo-total").waitFor();
      await c.page.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => undefined);
      await esperarListo(c.page);
    },
  },

  // ═══ Registrar pago · el diálogo «Cancelar el pago» (sin cancelar nada) ═══
  {
    id: "recep-pagos-cancelar-dialogo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Cancelar el pago» abierto y vacío (el botón de confirmar apagado)",
    tipo: "flotante",
    fuentes: [PAGO],
    ir: abrirCancelarPago,
  },
  {
    id: "recep-pagos-cancelar-dialogo-motivo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Cancelar el pago» con el motivo escrito, listo para confirmar",
    tipo: "flotante",
    fuentes: [PAGO],
    ir: async (c) => {
      await abrirCancelarPago(c);
      await c.page.getByLabel(/^Motivo de la cancelación/).fill("Se cobró de más");
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-cancelar-dialogo-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Cancelar el pago» con el error del servidor",
    tipo: "flotante",
    fuentes: [PAGO],
    ir: async (c) => {
      await abrirCancelarPago(c);
      await c.page.getByLabel(/^Motivo de la cancelación/).fill("Se cobró de más");
      await fallarLaSiguienteEscritura(c, 409, "Ese pago ya estaba cancelado.");
      await c.page.getByRole("dialog").getByRole("button", { name: "Cancelar el pago", exact: true }).click();
      await c.page.getByRole("dialog").getByRole("alert").waitFor();
      await esperarListo(c.page);
    },
  },

  // ═══ Estado de cuenta ═══
  {
    id: "recep-cuenta-buscador",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta sin familia elegida: el buscador (la misma pantalla para recepción, asesor y administrador)",
    tipo: "pantalla",
    ruta: "/cuenta",
    fuentes: [CUENTA, BUSCADOR],
    ir: (c) => irA(c, "/cuenta"),
  },
  {
    id: "recep-cuenta-buscador-resultados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta: el buscador con resultados",
    tipo: "estado",
    fuentes: [CUENTA, BUSCADOR],
    ir: async (c) => {
      await irA(c, "/cuenta");
      await buscar(c, "5555010101");
      await c.page.getByTestId(`familia-${gomez(c).tutorId}`).waitFor();
    },
  },
  {
    id: "recep-cuenta-buscador-sin-resultados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta: el buscador sin resultados",
    tipo: "estado",
    fuentes: [CUENTA, BUSCADOR],
    ir: async (c) => {
      await irA(c, "/cuenta");
      await buscar(c, "Zzzzzz");
      await c.page.getByText("No encontré a esa familia").waitFor();
    },
  },
  {
    id: "recep-cuenta-familia-con-vencidos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta de una familia con cargos vencidos, antigüedad de lo vencido y sin pagos",
    tipo: "pantalla",
    ruta: "/cuenta/:tutorId",
    fuentes: [CUENTA],
    ir: async (c) => {
      await irA(c, `/cuenta/${gomez(c).tutorId}`);
      await c.page.getByTestId("saldo").waitFor();
    },
  },
  {
    id: "recep-cuenta-familia-con-pagos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta de una familia que ya pagó: lista de pagos",
    tipo: "pantalla",
    ruta: "/cuenta/:tutorId",
    fuentes: [CUENTA],
    ir: async (c) => {
      await irA(c, `/cuenta/${uniforme(c).tutorId}`);
      await c.page.getByTestId("saldo").waitFor();
    },
  },
  {
    id: "recep-cuenta-familia-al-corriente",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta de una familia sin adeudo (todo pagado)",
    tipo: "estado",
    fuentes: [CUENTA],
    ir: async (c) => {
      await transformar(c, esCuentaDe, alCorriente);
      await irA(c, `/cuenta/${gomez(c).tutorId}`);
      await c.page.getByTestId("saldo").waitFor();
    },
  },
  {
    id: "recep-cuenta-familia-sin-cargos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta de una familia sin cargos ni pagos: «Esta familia todavía no tiene cargos»",
    tipo: "estado",
    fuentes: [CUENTA],
    ir: async (c) => {
      await transformar(c, esCuentaDe, sinCargos);
      await irA(c, `/cuenta/${gomez(c).tutorId}`);
    },
  },
  {
    id: "recep-cuenta-familia-muchos-movimientos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta con muchos hijos, cargos y pagos",
    tipo: "estado",
    fuentes: [CUENTA],
    completa: true,
    ir: (c) => conMuchosDatos(c, `/cuenta/${gomez(c).tutorId}`, 10),
  },
  {
    id: "recep-cuenta-familia-cargando",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta mientras carga",
    tipo: "estado",
    fuentes: [CUENTA],
    ir: (c) => conCargando(c, `/cuenta/${gomez(c).tutorId}`),
  },
  {
    id: "recep-cuenta-familia-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta con error de carga",
    tipo: "estado",
    fuentes: [CUENTA],
    ir: (c) => conError(c, `/cuenta/${gomez(c).tutorId}`),
  },
  {
    id: "recep-cuenta-familia-impresion",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta en la vista de impresión (para dárselo a la familia en papel)",
    tipo: "impresion",
    fuentes: [CUENTA],
    impresion: true,
    completa: true,
    ir: async (c) => {
      await irA(c, `/cuenta/${uniforme(c).tutorId}`);
      await c.page.getByTestId("saldo").waitFor();
    },
  },
  {
    id: "recep-cuenta-familia-solo-lectura-asesor",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Estado de cuenta visto por el asesor (solo lectura; las mismas acciones de imprimir y descargar)",
    tipo: "pantalla",
    ruta: "/cuenta/:tutorId",
    fuentes: [CUENTA],
    ir: async (c) => {
      await irA(c, `/cuenta/${gomez(c).tutorId}`);
      await c.page.getByTestId("saldo").waitFor();
    },
  },
  {
    id: "recep-cuenta-buscador-asesor",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Estado de cuenta: el buscador visto por el asesor",
    tipo: "pantalla",
    ruta: "/cuenta",
    fuentes: [CUENTA, BUSCADOR],
    ir: (c) => irA(c, "/cuenta"),
  },

  {
    id: "recep-cuenta-familia-completa",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta completo: cada hijo con el color de su disciplina, cargos pagados (con su folio), vencido, con abono y pendientes; pagos con uno cancelado y su motivo",
    tipo: "estado",
    fuentes: [CUENTA, CANCELAR],
    completa: true,
    ir: async (c) => {
      await conDisciplinasDeColor(c);
      await transformar(c, esCuentaDe, cuentaCompleta);
      await irA(c, `/cuenta/${gomez(c).tutorId}`);
      await c.page.getByTestId("saldo").waitFor();
      await c.page.getByText("Cancelado: Se registró dos veces").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-cuenta-familia-completa-asesor",
    rol: "asesor",
    grupo: GRUPO,
    titulo: "Estado de cuenta completo visto por el asesor: sin el botón de cancelar pagos ni «Registrar pago»",
    tipo: "estado",
    fuentes: [CUENTA],
    completa: true,
    ir: async (c) => {
      await transformar(c, esCuentaDe, cuentaCompleta);
      await irA(c, `/cuenta/${gomez(c).tutorId}`);
      await c.page.getByTestId("saldo").waitFor();
      await c.page.getByText("Cancelado: Se registró dos veces").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-cuenta-familia-nada-vencido",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta con saldo pendiente pero nada vencido: la tarjeta de lo vencido en blanco y «Nada vencido»",
    tipo: "estado",
    fuentes: [CUENTA],
    ir: async (c) => {
      await transformar(c, esCuentaDe, (j) => {
        const f = cuentaCompleta(j);
        for (const h of f.hijos) for (const cargo of h.cargos) if (cargo.estatus_efectivo === "vencido") Object.assign(cargo, { estatus_efectivo: "pendiente", dias_de_atraso: 0, fecha_vencimiento: "2026-10-15" });
        f.resumen.vencido = "0.00";
        f.resumen.antiguedad = { de_0_a_30: "0.00", de_31_a_60: "0.00", de_61_a_90: "0.00", mas_de_90: "0.00" };
        return f;
      });
      await irA(c, `/cuenta/${gomez(c).tutorId}`);
      await c.page.getByText("Nada vencido").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-cuenta-cancelar-dialogo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta: el diálogo «Cancelar el pago P-…» con la advertencia roja y el botón de cancelar apagado (falta el motivo)",
    tipo: "flotante",
    fuentes: [CUENTA, CANCELAR],
    ir: abrirCancelarDeLaCuenta,
  },
  {
    id: "recep-cuenta-cancelar-dialogo-motivo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta: «Cancelar el pago» con el motivo escrito, listo para confirmar",
    tipo: "flotante",
    fuentes: [CUENTA, CANCELAR],
    ir: async (c) => {
      await abrirCancelarDeLaCuenta(c);
      await c.page.getByLabel(/^Motivo de la cancelación/).fill("Se registró dos veces");
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-cuenta-cancelar-dialogo-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta: «Cancelar el pago» con el error del servidor dentro del diálogo",
    tipo: "flotante",
    fuentes: [CUENTA, CANCELAR],
    ir: async (c) => {
      await abrirCancelarDeLaCuenta(c);
      await c.page.getByLabel(/^Motivo de la cancelación/).fill("Se registró dos veces");
      await fallarLaSiguienteEscritura(c, 409, "Ese pago ya estaba cancelado.");
      await c.page.getByRole("dialog").getByRole("button", { name: "Cancelar el pago", exact: true }).click();
      await c.page.getByRole("dialog").getByRole("alert").waitFor();
      await esperarListo(c.page);
    },
  },

  // ═══ Uniformes por entregar ═══
  {
    id: "recep-uniformes-lista",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes por entregar, con un uniforme liberado y la existencia (recepción y administrador)",
    tipo: "pantalla",
    ruta: "/uniformes",
    fuentes: [UNIFORMES],
    completa: true,
    ir: async (c) => {
      await irA(c, "/uniformes");
      await c.page.getByTestId(`beneficio-${uniforme(c).beneficioId}`).waitFor();
    },
  },
  {
    id: "recep-uniformes-vacio",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes por entregar sin nada pendiente: «No hay nada por entregar»",
    tipo: "estado",
    fuentes: [UNIFORMES],
    ir: (c) => conVacio(c, "/uniformes"),
  },
  {
    id: "recep-uniformes-cargando",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes por entregar mientras carga",
    tipo: "estado",
    fuentes: [UNIFORMES],
    ir: (c) => conCargando(c, "/uniformes"),
  },
  {
    id: "recep-uniformes-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes por entregar con error de carga",
    tipo: "estado",
    fuentes: [UNIFORMES],
    ir: (c) => conError(c, "/uniformes"),
  },
  {
    id: "recep-uniformes-muchos-datos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes por entregar con muchas familias en espera",
    tipo: "estado",
    fuentes: [UNIFORMES],
    completa: true,
    ir: (c) => conMuchosDatos(c, "/uniformes", 10),
  },
  {
    id: "recep-uniformes-entregar-dialogo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Entregar» abierto: elegir la pieza de la talla del alumno",
    tipo: "flotante",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await irA(c, "/uniformes");
      await c.page.getByRole("button", { name: "Marcar entregado" }).first().click();
      await dialogoAbierto(c.page);
      await c.page.getByLabel("Pieza que se entrega").waitFor();
    },
  },
  {
    id: "recep-uniformes-entregar-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Entregar» con el error del servidor (sin existencia al confirmar)",
    tipo: "flotante",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await irA(c, "/uniformes");
      await c.page.getByRole("button", { name: "Marcar entregado" }).first().click();
      await dialogoAbierto(c.page);
      await c.page.getByLabel("Pieza que se entrega").waitFor();
      await fallarLaSiguienteEscritura(c, 409, "Ya no hay existencia de esa pieza.");
      await c.page.getByRole("dialog").getByRole("button", { name: "Marcar como entregado" }).click();
      await c.page.getByRole("dialog").getByRole("alert").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-uniformes-entregar-ya-entregado",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Entregar» con el aviso «Este uniforme ya se entregó» (otra persona lo marcó antes)",
    tipo: "flotante",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await irA(c, "/uniformes");
      await c.page.getByRole("button", { name: "Marcar entregado" }).first().click();
      await dialogoAbierto(c.page);
      await c.page.getByLabel("Pieza que se entrega").waitFor();
      await fallarLaSiguienteEscritura(c, 409, "Ese uniforme ya se entregó.", [{ campo: "motivo", mensaje: "ya_entregado" }]);
      await c.page.getByRole("dialog").getByRole("button", { name: "Marcar como entregado" }).click();
      await c.page.getByText("Este uniforme ya se entregó").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-uniformes-entregar-sin-existencia",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Entregar» sin piezas con existencia de la talla del alumno",
    tipo: "flotante",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await transformar(c, (u) => esProductos(u) && u.searchParams.get("con_stock") === "true", (j) => ({ ...j, datos: [], paginacion: { ...j.paginacion, total: 0 } }));
      await irA(c, "/uniformes");
      await c.page.getByRole("button", { name: "Marcar entregado" }).first().click();
      await dialogoAbierto(c.page);
      await c.page.getByText(/No hay piezas con existencia/).waitFor();
    },
  },
  {
    id: "recep-uniformes-entregar-inventario-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Entregar» con error al ver el inventario",
    tipo: "flotante",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await romper(c, (u) => esProductos(u) && u.searchParams.get("con_stock") === "true");
      await irA(c, "/uniformes");
      await c.page.getByRole("button", { name: "Marcar entregado" }).first().click();
      await dialogoAbierto(c.page);
    },
  },
  {
    id: "recep-uniformes-entregar-sin-red",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Entregar» sin conexión al confirmar",
    tipo: "flotante",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await irA(c, "/uniformes");
      await c.page.getByRole("button", { name: "Marcar entregado" }).first().click();
      await dialogoAbierto(c.page);
      await c.page.getByLabel("Pieza que se entrega").waitFor();
      await cortarLaRed(c);
      await c.page.getByRole("dialog").getByRole("button", { name: "Marcar como entregado" }).click();
      await c.page.getByRole("dialog").getByRole("alert").waitFor();
      await esperarListo(c.page);
    },
  },

  {
    id: "recep-uniformes-disciplinas-existencia",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes por entregar con el color de cada disciplina, «Quedan N», «Queda 1», un uniforme sin existencia (botón apagado «Sin existencia») y un alumno sin talla",
    tipo: "estado",
    fuentes: [UNIFORMES],
    completa: true,
    ir: async (c) => {
      await conBeneficiosDeEjemplo(c);
      await irA(c, "/uniformes");
      await c.page.getByTestId("beneficio-ejemplo-4").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-uniformes-entregados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes: la pestaña «Entregados» con lo entregado hace un momento, ayer y días atrás, quién lo entregó y «Se descontó del inventario»",
    tipo: "estado",
    fuentes: [UNIFORMES],
    completa: true,
    ir: async (c) => {
      await conBeneficiosDeEjemplo(c);
      await irA(c, "/uniformes");
      await c.page.getByRole("tab", { name: /^Entregados/ }).click();
      await c.page.getByTestId("entregado-ejemplo-e1").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-uniformes-entregados-vacio",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes: la pestaña «Entregados» sin nada entregado todavía",
    tipo: "estado",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await transformar(c, esEntregados, (j) => ({ ...j, datos: [], paginacion: { ...j.paginacion, total: 0 } }));
      await irA(c, "/uniformes");
      await c.page.getByRole("tab", { name: /^Entregados/ }).click();
      await c.page.getByText("Todavía no se ha entregado nada").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-uniformes-entregados-cargando",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes: la pestaña «Entregados» mientras carga",
    tipo: "estado",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await colgar(c, esEntregados);
      await c.page.goto("/uniformes"); // sin esperar a la red: la petición de lo entregado no termina
      await c.page.getByRole("tab", { name: /^Entregados/ }).click();
      await c.page.locator(".giro, .cargando").first().waitFor();
      await c.page.waitForTimeout(150);
    },
  },
  {
    id: "recep-uniformes-entregados-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes: la pestaña «Entregados» con error de carga",
    tipo: "estado",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      await romper(c, esEntregados);
      await irA(c, "/uniformes");
      await c.page.getByRole("tab", { name: /^Entregados/ }).click();
      await c.page.getByRole("button", { name: "Reintentar" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-uniformes-entregado-aviso",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Uniformes: después de «Marcar como entregado» sale el aviso «Entregado a …» y la tarjeta pasa a «Entregados»",
    tipo: "paso",
    fuentes: [UNIFORMES],
    ir: async (c) => {
      // La entrega se simula (no se toca el inventario compartido): la escritura responde bien y las listas ya cuentan al uniforme como entregado.
      let entregado = false;
      await c.page.route(esPorEntregar, async (r) => {
        if (r.request().method() !== "GET") return r.fallback();
        const resp = await r.fetch();
        const j = (await resp.json()) as J;
        return r.fulfill({ response: resp, json: entregado ? { ...j, datos: [], paginacion: { ...j.paginacion, total: 0 } } : j });
      });
      await c.page.route(esEntregados, async (r) => {
        if (r.request().method() !== "GET") return r.fallback();
        const resp = await r.fetch();
        const j = (await resp.json()) as J;
        return r.fulfill({ response: resp, json: entregado ? { ...j, datos: [{ id: "ejemplo", inscripcion_id: "ejemplo", alumno: { id: "x", nombre: "Alumno", apellidos: "Uniforme Prueba", talla_uniforme: "8" }, tutor: null, sucursal_id: "x", grupo: "Grupo D", promocion: "Uniforme de bienvenida", tipo: "producto_gratis", descripcion: "Uniforme", producto_id: null, liberado_en: new Date().toISOString(), entregado_en: new Date().toISOString(), entregado_por: { id: "y", nombre: "Rita Recepción" }, producto: { nombre: "Uniforme", talla: "8" } }], paginacion: { ...j.paginacion, total: 1 } } : j });
      });
      await c.page.route("**/api/beneficios/*/entregar", async (r) => {
        if (r.request().method() !== "POST") return r.fallback();
        entregado = true;
        return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "ejemplo", estatus: "entregado" }) });
      });
      await irA(c, "/uniformes");
      await c.page.getByRole("button", { name: "Marcar entregado" }).first().click();
      await dialogoAbierto(c.page);
      await c.page.getByLabel("Pieza que se entrega").waitFor();
      await c.page.getByRole("dialog").getByRole("button", { name: "Marcar como entregado" }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.getByText("No hay nada por entregar").waitFor();
      await esperarListo(c.page);
    },
  },

  // ═══ Ventas ═══
  {
    id: "recep-ventas-inicial",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas: tarjetas de producto con su existencia («Queda 1», «Quedan N»), «Nueva venta» sin alumno y ventas recientes (recepción y administrador)",
    tipo: "pantalla",
    ruta: "/ventas",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    completa: true,
    ir: async (c) => {
      await irA(c, "/ventas");
      await c.page.getByTestId("productos").waitFor();
    },
  },
  {
    id: "recep-ventas-vacio",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas sin productos ni ventas: «No hay ningún producto con existencia para vender»",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: (c) => conVacio(c, "/ventas"),
  },
  {
    id: "recep-ventas-todo-agotado",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas con todos los productos agotados (insignia «Agotado»)",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await transformar(c, esProductos, (j) => ({ ...j, datos: (j.datos ?? []).map((p: J) => ({ ...p, stock: 0 })) }));
      await irA(c, "/ventas");
      await c.page.getByText("Agotado").first().waitFor();
    },
  },
  {
    id: "recep-ventas-cargando",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas mientras carga",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: (c) => conCargando(c, "/ventas"),
  },
  {
    id: "recep-ventas-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas con error de carga",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: (c) => conError(c, "/ventas"),
  },
  {
    id: "recep-ventas-muchos-datos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas con muchos productos en existencia",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    completa: true,
    ir: (c) => conMuchosDatos(c, "/ventas", 8),
  },
  {
    id: "recep-ventas-alumno-una-letra",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Nueva venta con una sola letra en la búsqueda del alumno: «Escribe al menos dos letras»",
    tipo: "formulario",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await irA(c, "/ventas");
      await c.page.getByLabel("Buscar al alumno por nombre").fill("H");
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-alumno-encontrado",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Nueva venta con el alumno encontrado y elegido, listo para registrar (total calculado)",
    tipo: "formulario",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await prepararVenta(c, "Hijo");
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-alumno-sin-resultados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Nueva venta con búsqueda de alumno sin resultados: «No encontré a ese alumno»",
    tipo: "formulario",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await irA(c, "/ventas");
      await c.page.getByLabel("Buscar al alumno por nombre").fill("Zzzzzz");
      await c.page.getByRole("button", { name: "Buscar", exact: true }).click();
      await c.page.getByText("No encontré a ese alumno.").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-alumno-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Nueva venta con error al buscar al alumno",
    tipo: "formulario",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await romper(c, esAlumnos);
      await irA(c, "/ventas");
      await c.page.getByLabel("Buscar al alumno por nombre").fill("Hijo");
      await c.page.getByRole("button", { name: "Buscar", exact: true }).click();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-cantidad-cero",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Nueva venta con la cantidad en el mínimo (1): «Una menos» apagado y el total de una pieza",
    tipo: "formulario",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await prepararVenta(c, "Hijo");
      await c.page.getByRole("button", { name: "Una menos" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-cantidad-mayor-a-la-existencia",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Nueva venta con todas las piezas que hay en la cantidad: «Una más» apagado y «Solo hay 1 en existencia»",
    tipo: "formulario",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await prepararVenta(c, "Hijo");
      await c.page.getByRole("button", { name: /^Playera/ }).click();
      await c.page.getByText("Solo hay 1 en existencia").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-error-del-servidor",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Nueva venta: el servidor rechaza la venta (alguien vendió la última pieza)",
    tipo: "formulario",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await prepararVenta(c, "Hijo");
      await c.page.getByRole("button", { name: /^Gorra/ }).click();
      await fallarLaSiguienteEscritura(c, 409, "Ya no hay existencia de esa pieza: alguien acaba de vender la última.");
      await c.page.getByRole("button", { name: "Registrar venta" }).click();
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-sin-red",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Nueva venta sin conexión al registrar",
    tipo: "formulario",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await prepararVenta(c, "Hijo");
      await cortarLaRed(c);
      await c.page.getByRole("button", { name: "Registrar venta" }).click();
      await c.page.getByRole("alert").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-anular-dialogo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Anular la venta» abierto y vacío (el botón de confirmar apagado)",
    tipo: "flotante",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: abrirAnular,
  },
  {
    id: "recep-ventas-anular-dialogo-motivo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Anular la venta» con el motivo escrito, listo para confirmar",
    tipo: "flotante",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await abrirAnular(c);
      await c.page.getByLabel(/^Motivo de la anulación/).fill("Se equivocó de producto");
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-anular-dialogo-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Diálogo «Anular la venta» con el error del servidor",
    tipo: "flotante",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await abrirAnular(c);
      await c.page.getByLabel(/^Motivo de la anulación/).fill("Se equivocó de producto");
      await fallarLaSiguienteEscritura(c, 409, "Esa venta ya no se puede anular: su cargo tiene pagos.");
      await c.page.getByRole("dialog").getByRole("button", { name: "Anular la venta", exact: true }).click();
      await c.page.getByRole("dialog").getByRole("alert").waitFor();
      await esperarListo(c.page);
    },
  },

  // R5c: estados nuevos de Ventas (tarjetas de producto, cantidad con − y +, entrega de promoción).
  {
    id: "recep-ventas-producto-elegido",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas con un producto elegido (borde de la marca), dos piezas con «Una más» y el total del cargo; el alumno elegido y el botón con el importe",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    completa: true,
    ir: async (c) => {
      await prepararVenta(c, "Hijo");
      await c.page.getByRole("button", { name: /^Uniforme\s*Talla 8\b/ }).click();
      await c.page.getByRole("button", { name: "Una más" }).click();
      await c.page.getByTestId("total-de-la-venta").getByText("$700.00").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-sin-alumno-con-producto",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas con un producto elegido pero sin alumno: «Elige al alumno: el cargo queda a nombre de su responsable de pago» y «Registrar venta» apagado",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await irA(c, "/ventas");
      await c.page.getByRole("button", { name: /^Uniforme\s*Talla 10\b/ }).click();
      await c.page.getByText("Elige al alumno:").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-entrega-de-promocion",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas recientes con una entrega de promoción (sin «Anular») junto a una venta normal",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    ir: async (c) => {
      await transformar(c, (u) => u.pathname === "/api/ventas", (j) => {
        const base = j.datos?.[0];
        const promo = { id: "venta-de-promocion", tutor_id: base?.tutor_id ?? "t", alumno: base?.alumno ?? { id: "a", nombre: "Alumno Uniforme", apellidos: "Prueba" }, producto: { id: "p", nombre: "Uniforme", talla: "8" }, cantidad: 1, precio_unitario: "0.00", total: "0.00", es_promocional: true, fecha: new Date().toISOString(), estatus: "registrada", motivo_anulacion: null, cargo: null };
        return { ...j, datos: [promo, ...(j.datos ?? [])] };
      });
      await irA(c, "/ventas");
      await c.page.getByText("Entrega de promoción").waitFor();
      await esperarListo(c.page);
    },
  },

  // ═══ Cierre del día ═══
  {
    id: "recep-corte-hoy",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día con movimientos: cajas por persona, total del día y tabla de pagos (recepción)",
    tipo: "pantalla",
    ruta: "/corte",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    completa: true,
    ir: async (c) => {
      await irA(c, "/corte");
      await c.page.getByTestId("cajas").waitFor();
    },
  },
  {
    id: "recep-corte-hoy-administrador",
    rol: "administrador",
    grupo: GRUPO,
    titulo: "Cierre del día visto por el administrador (su caja va primero como «Tu caja»)",
    tipo: "pantalla",
    ruta: "/corte",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    completa: true,
    ir: async (c) => {
      await irA(c, "/corte");
      await c.page.getByTestId("cajas").waitFor();
    },
  },
  {
    id: "recep-corte-dia-sin-cobros",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre de un día anterior sin cobros: «Ese día no se registró ningún cobro»",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    ir: async (c) => {
      await irA(c, "/corte");
      await c.page.getByTestId("cajas").waitFor();
      await c.page.getByLabel("Día").fill(await ayerEnElNavegador(c.page));
      await c.page.getByText("Ese día no se registró ningún cobro.").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-corte-hoy-sin-cobros",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre de hoy sin cobros todavía: «Hoy todavía no se ha registrado ningún cobro»",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    ir: async (c) => {
      const cero = { efectivo: "0.00", tarjeta: "0.00", transferencia: "0.00", total: "0.00", pagos: 0 };
      await transformar(c, esCorte, (j) => ({ ...j, cajas: [], cobrado: cero, devoluciones: cero, neto: cero, cancelados: [], pagos: [] }));
      await irA(c, "/corte");
      await c.page.getByText("Hoy todavía no se ha registrado ningún cobro.").waitFor();
    },
  },
  {
    id: "recep-corte-cargando",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día mientras suma lo cobrado",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    ir: (c) => conCargando(c, "/corte"),
  },
  {
    id: "recep-corte-error",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día con error de carga",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    ir: (c) => conError(c, "/corte"),
  },
  {
    id: "recep-corte-muchos-movimientos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día con muchos pagos y varias cajas",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    completa: true,
    ir: async (c) => {
      await transformar(c, esCorte, (j) => ({
        ...j,
        cajas: multiplicar(
          (j.cajas ?? []).map((x: J) => ({ ...x, id: x.usuario?.id ?? "sin-usuario" })),
          5,
        ).map((x: J, i: number) => ({ ...x, usuario: x.usuario ? { ...x.usuario, id: `${x.usuario.id}-${i}`, nombre: `${x.usuario.nombre} ${i + 1}` } : null })),
        pagos: multiplicar(j.pagos ?? [], 25),
      }));
      await irA(c, "/corte");
      await c.page.getByTestId("cajas").waitFor();
    },
  },
  {
    id: "recep-corte-con-devoluciones",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día con un pago de otro día cancelado hoy: devoluciones, neto y pagos cancelados",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    completa: true,
    ir: async (c) => {
      await transformar(c, esCorte, (j) => {
        const devuelto = { efectivo: "300.00", tarjeta: "0.00", transferencia: "0.00", total: "300.00", pagos: 1 };
        const base = j.pagos?.[0];
        return {
          ...j,
          devoluciones: devuelto,
          neto: { ...j.cobrado, efectivo: "0.00", total: "0.00" },
          cancelados: [
            { id: "cancelado-de-otro-dia", hora: base?.hora ?? new Date().toISOString(), familia: "Familia Gómez", monto: "300.00", metodo: "efectivo", referencia: null, registrado_por: base?.registrado_por ?? null, de_otro_dia: true, cancelado_en: new Date().toISOString(), cancelado_por: base?.registrado_por ?? null, motivo: "Se cobró de más" },
            { id: "cancelado-de-hoy", hora: base?.hora ?? new Date().toISOString(), familia: "Familia Rivera", monto: "150.00", metodo: "tarjeta", referencia: "VOUCHER-4821", registrado_por: base?.registrado_por ?? null, de_otro_dia: false, cancelado_en: new Date().toISOString(), cancelado_por: base?.registrado_por ?? null, motivo: null },
          ],
        };
      });
      await irA(c, "/corte");
      await c.page.getByTestId("devoluciones").waitFor();
    },
  },
  {
    id: "recep-corte-impresion",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día en la vista de impresión",
    tipo: "impresion",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    impresion: true,
    completa: true,
    ir: async (c) => {
      await irA(c, "/corte");
      await c.page.getByTestId("cajas").waitFor();
    },
  },

  // R5c: estados nuevos del Cierre del día (otro día, una sola forma de pago, cobros sin persona registrada).
  {
    id: "recep-corte-dia-anterior",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre de un día anterior con cobros: «Cobrado el …» en el panel oscuro y el botón «Volver a hoy»",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    completa: true,
    ir: async (c) => {
      const ayer = await ayerEnElNavegador(c.page);
      await transformar(c, esCorte, (j) => ({ ...j, fecha: ayer }));
      await irA(c, "/corte");
      await c.page.getByRole("button", { name: "Volver a hoy" }).waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-corte-solo-efectivo",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día con cobros solo en efectivo: las barras de tarjeta y transferencia en cero («0 pagos»)",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    ir: async (c) => {
      await transformar(c, esCorte, (j) => {
        const solo = (d: J): J => ({ ...d, tarjeta: "0.00", transferencia: "0.00", total: d.efectivo });
        return { ...j, cobrado: solo(j.cobrado), neto: solo(j.neto), cajas: (j.cajas ?? []).map((x: J) => ({ ...x, cobrado: solo(x.cobrado) })), pagos: (j.pagos ?? []).map((p: J) => ({ ...p, metodo: "efectivo" })) };
      });
      await irA(c, "/corte");
      await c.page.getByTestId("cajas").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-corte-sin-persona-registrada",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día con cobros sin persona registrada junto a la caja de quien mira",
    tipo: "estado",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    ir: async (c) => {
      await transformar(c, esCorte, (j) => ({ ...j, cajas: [...(j.cajas ?? []), { usuario: null, cobrado: { efectivo: "100.00", tarjeta: "0.00", transferencia: "0.00", total: "100.00", pagos: 1 } }] }));
      await irA(c, "/corte");
      await c.page.getByText("Cobros sin persona registrada").waitFor();
      await esperarListo(c.page);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // De aquí en adelante las escenas ESCRIBEN en la base, con la familia propia de cada vista (`recorridos.por[vista].pago`).
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    id: "recep-pagos-pago-registrado",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Pago registrado con el reparto a mano entre dos hijos: recibo con lo aplicado, saldo restante y acciones",
    tipo: "paso",
    fuentes: [PAGO],
    completa: true,
    ir: async (c) => {
      await irA(c, rutaPago(propia(c).tutorId));
      await monto(c.page).fill("400");
      await c.page.getByTestId("propuesta").waitFor();
      await c.page.getByRole("button", { name: "Ajustar el reparto a mano" }).click();
      await c.page.getByTestId("ajuste").waitFor();
      await repartirEntreHijos(c, [
        [propia(c).hijos[0]!.nombre, "150"],
        [propia(c).hijos[1]!.nombre, "250"],
      ]);
      await c.page.getByRole("button", { name: /^Registrar pago/ }).click();
      await c.page.getByTestId("pago-registrado").waitFor();
      await c.page.getByTestId("saldo-despues-del-pago").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-pago-registrado-tarjeta",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Pago registrado con tarjeta y referencia: el detalle con «ref.» y folio, «Recibido», «Saldo después del pago» y el pago nuevo marcado en «Pagos recientes»",
    tipo: "paso",
    fuentes: [PAGO],
    completa: true,
    ir: async (c) => {
      await irA(c, rutaPago(propia(c).tutorId));
      await monto(c.page).fill("30");
      await c.page.getByTestId("propuesta").waitFor();
      await elegirMetodo(c.page, "tarjeta", "Tarjeta");
      await c.page.getByLabel("Referencia (opcional)").fill("VOUCHER-0030");
      await c.page.getByRole("button", { name: /^Registrar pago/ }).click();
      await c.page.getByTestId("pago-registrado").waitFor();
      await c.page.getByTestId("saldo-despues-del-pago").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-recibo-impresion",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Recibo del pago en la vista de impresión («Imprimir recibo»)",
    tipo: "impresion",
    fuentes: [PAGO],
    impresion: true,
    completa: true,
    ir: async (c) => {
      await pagar(c, "100");
      await c.page.getByTestId("saldo-despues-del-pago").waitFor();
    },
  },
  {
    id: "recep-pagos-pago-ya-estaba-registrado",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Aviso «Este pago ya estaba registrado: no se duplicó» (reintento con la misma clave tras un corte de red)",
    tipo: "estado",
    fuentes: [PAGO],
    ir: async (c) => {
      await irA(c, rutaPago(propia(c).tutorId));
      await monto(c.page).fill("50");
      await c.page.getByTestId("propuesta").waitFor();
      // El servidor procesa el pago pero la respuesta no llega: la pantalla ve un corte de red.
      await c.page.route("**/api/pagos", async (ruta) => {
        if (ruta.request().method() !== "POST") return ruta.fallback();
        await ruta.fetch();
        return ruta.abort("failed");
      });
      await c.page.getByRole("button", { name: /^Registrar pago/ }).click();
      await c.page.getByText(/NO lo duplica/).waitFor();
      await c.page.unroute("**/api/pagos");
      await c.page.getByRole("button", { name: /^Registrar pago/ }).click();
      await c.page.getByText("Este pago ya estaba registrado: no se duplicó").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-pago-cancelado",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Pagos recientes con un pago cancelado (queda con su motivo, sin borrarse) y el formulario de nuevo a la vista",
    tipo: "estado",
    fuentes: [PAGO],
    completa: true,
    ir: async (c) => {
      await pagar(c, "20");
      await c.page.getByRole("button", { name: "Registrar otro pago" }).click();
      await c.page.getByRole("listitem").filter({ hasText: "$20.00" }).getByRole("button", { name: "Cancelar pago", exact: true }).click();
      await dialogoAbierto(c.page);
      await c.page.getByLabel(/^Motivo de la cancelación/).fill("Se cobró de más");
      await c.page.getByRole("dialog").getByRole("button", { name: "Cancelar el pago", exact: true }).click();
      await c.page.getByText("Se cobró de más").first().waitFor();
      await c.page.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => undefined);
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-cuenta-familia-tras-varios-pagos",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta de la familia después de varios pagos, uno de ellos cancelado",
    tipo: "estado",
    ruta: "/cuenta/:tutorId",
    fuentes: [CUENTA],
    completa: true,
    ir: async (c) => {
      await irA(c, `/cuenta/${propia(c).tutorId}`);
      await c.page.getByTestId("pagos-de-la-cuenta").waitFor();
    },
  },
  {
    id: "recep-cuenta-cancelar-hecho",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Estado de cuenta después de cancelar un pago de verdad: el aviso «Pago cancelado», el pago con su motivo y los cargos otra vez pendientes",
    tipo: "paso",
    fuentes: [CUENTA, CANCELAR],
    completa: true,
    ir: async (c) => {
      await irA(c, `/cuenta/${propia(c).tutorId}`);
      await c.page.getByRole("button", { name: /^Cancelar el pago P-/ }).first().click();
      await dialogoAbierto(c.page);
      await c.page.getByLabel(/^Motivo de la cancelación/).fill("Se registró dos veces");
      await c.page.getByRole("dialog").getByRole("button", { name: "Cancelar el pago", exact: true }).click();
      await c.page.getByTestId("aviso-global").waitFor();
      await c.page.getByText("Cancelado: Se registró dos veces").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-pagos-pago-registrado-saldo-cero",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Pago registrado que liquida todo el saldo: «Saldo después del pago» en cero, marcado en verde",
    tipo: "paso",
    fuentes: [PAGO],
    completa: true,
    ir: async (c) => {
      await irA(c, rutaPago(propia(c).tutorId));
      await c.page.getByRole("button", { name: /^Todo el saldo/ }).click();
      await c.page.getByTestId("propuesta").waitFor();
      await c.page.getByRole("button", { name: /^Registrar pago/ }).click();
      await c.page.getByTestId("pago-registrado").waitFor();
      await c.page.getByTestId("saldo-despues-del-pago").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-venta-registrada",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Venta registrada: aviso con el detalle y el botón «Cobrar ahora»; existencia y ventas recientes al día",
    tipo: "paso",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    completa: true,
    ir: async (c) => {
      await prepararVenta(c, propia(c).hijos[0]!.nombre);
      await c.page.getByRole("button", { name: new RegExp(`^Uniforme\\s*Talla ${propia(c).talla}\\b`) }).click();
      await c.page.getByRole("button", { name: "Una más" }).click();
      await c.page.getByRole("button", { name: "Registrar venta" }).click();
      await c.page.getByTestId("venta-registrada").waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-ventas-venta-anulada",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Ventas recientes con una venta anulada (insignia «Anulada») y la pieza de vuelta en la existencia",
    tipo: "estado",
    fuentes: [VENTAS, ...VENTAS_PIEZAS],
    completa: true,
    ir: async (c) => {
      await abrirAnular(c);
      await c.page.getByLabel(/^Motivo de la anulación/).fill("Se equivocó de producto");
      await c.page.getByRole("dialog").getByRole("button", { name: "Anular la venta", exact: true }).click();
      await c.page.getByText("Anulada").first().waitFor();
      await esperarListo(c.page);
    },
  },
  {
    id: "recep-corte-con-cobros-y-cancelados",
    rol: "recepcion",
    grupo: GRUPO,
    titulo: "Cierre del día con los cobros de recepción y de administración y un pago cobrado y cancelado hoy",
    tipo: "pantalla",
    ruta: "/corte",
    fuentes: [CORTE, ...CORTE_PIEZAS],
    completa: true,
    ir: async (c) => {
      await irA(c, "/corte");
      await c.page.getByTestId("cancelados").waitFor();
    },
  },
];

/** Cada escena termina con la página arriba: en una captura de página entera, un desplazamiento previo deja la barra lateral y la superior fijas a media imagen. */
/** El método de pago: selector segmentado (radios) en el diseño nuevo, lista desplegable en el anterior. */
async function elegirMetodo(page: import("@playwright/test").Page, valor: string, nombre: string): Promise<void> {
  const radio = page.getByRole("radio", { name: nombre });
  if ((await radio.count()) > 0) await radio.check();
  else await page.getByLabel("Método de pago").selectOption(valor);
}

export const ESCENAS: Escena[] = LISTA.map((e) => ({
  ...e,
  ir: async (c: Contexto) => {
    await e.ir(c);
    if (e.tipo === "flotante") return;
    await c.page.evaluate(() => window.scrollTo(0, 0));
    await c.page.waitForTimeout(100);
  },
}));
