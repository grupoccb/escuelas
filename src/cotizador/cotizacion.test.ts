import { test } from "node:test";
import assert from "node:assert/strict";
import { deTexto } from "../lib/dinero.ts";
import type { PromocionDef } from "../promociones/resolver.ts";
import { cotizar } from "./cotizar.ts";
import { descripcionDePromociones, estatusEfectivo, opcionesDeHorario, opcionesDeSnapshot, resumenDeCotizacion, snapshotDeCotizacion, vigenteHasta } from "./cotizacion.ts";
import type { CatalogoCotizable, GrupoCotizable, ProgramaCotizable } from "./tipos.ts";

const grupo = (id: string, extra: Partial<GrupoCotizable> = {}): GrupoCotizable => ({
  id,
  nombre: `Grupo ${id}`,
  cupoMaximo: 10,
  permiteListaEspera: false,
  ocupados: 0,
  horarios: [{ dia: 1, inicioMin: 960, finMin: 1020 }],
  ...extra,
});
const programa: ProgramaCotizable = {
  id: "p",
  nombre: "Programa P",
  descripcionPublica: null,
  nivel: null,
  verticalId: "v",
  sucursalId: "s",
  edadMin: 3,
  edadMax: 12,
  fechaCorteEdad: null,
  permiteTraslape: false,
  precio: { id: "pr", costoInscripcion: deTexto("500.00"), costoMensualidad: deTexto("800.00"), moneda: "MXN", desde: "2026-01-01", hasta: null },
  grupos: [grupo("a", { cupoMaximo: 4, ocupados: 3 }), grupo("b", { cupoMaximo: 4, ocupados: 4, permiteListaEspera: true }), grupo("c", { cupoMaximo: 4, ocupados: 4 })],
};
const promo = (id: string, extra: Partial<PromocionDef> = {}): PromocionDef => ({
  id,
  nombre: `Promo ${id}`,
  codigo: id.toUpperCase(),
  activa: true,
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: null,
  condicion: { tipo: "sin_condicion" },
  cupoMaximo: null,
  cupoUsado: 0,
  acumulable: true,
  prioridad: 0,
  alcance: { verticales: [], sucursales: [], programas: [] },
  beneficios: [],
  ...extra,
});
const cotizado = (promociones: PromocionDef[] = [], p: ProgramaCotizable = programa) => {
  const cat: CatalogoCotizable = { fecha: "2026-10-08", programas: [p], promociones };
  return cotizar(cat, { verticalId: "v", sucursalId: "s", edadDeclarada: 8 }).programas[0]!;
};

test("vigenteHasta: fecha + días, y antes si vence lo cotizado; nunca antes de la fecha", () => {
  assert.equal(vigenteHasta({ venceEl: null }, "2026-10-08", 7), "2026-10-15");
  assert.equal(vigenteHasta({ venceEl: "2026-10-12" }, "2026-10-08", 7), "2026-10-12");
  assert.equal(vigenteHasta({ venceEl: "2026-10-15" }, "2026-10-08", 7), "2026-10-15");
  assert.equal(vigenteHasta({ venceEl: "2026-11-01" }, "2026-10-08", 7), "2026-10-15");
  assert.equal(vigenteHasta({ venceEl: "2026-10-08" }, "2026-10-08", 7), "2026-10-08");
  assert.equal(vigenteHasta({ venceEl: null }, "2026-12-28", 7), "2027-01-04", "cruza el fin de año");
  assert.throws(() => vigenteHasta({ venceEl: null }, "2026-10-08", 0), RangeError);
  assert.throws(() => vigenteHasta({ venceEl: null }, "2026-10-08", 1.5), RangeError);
});

test("venceEl del cotizador: el menor entre el fin del precio y el de cada promoción aplicada (una descartada no cuenta)", () => {
  const conPrecioHasta = { ...programa, precio: { ...programa.precio!, hasta: "2026-10-30" } };
  const beneficio = [{ id: "b", tipo: "descuento_inscripcion" as const, modo: "porcentaje" as const, valor: "10.00", productoId: null, descripcion: null, momento: "inmediato" as const }];
  assert.equal(cotizado([], programa).venceEl, null);
  assert.equal(cotizado([], conPrecioHasta).venceEl, "2026-10-30");
  assert.equal(cotizado([promo("x", { vigenciaHasta: "2026-10-20", beneficios: beneficio })], conPrecioHasta).venceEl, "2026-10-20");
  assert.equal(cotizado([promo("x", { vigenciaHasta: "2026-12-20", beneficios: beneficio })], conPrecioHasta).venceEl, "2026-10-30");
  assert.equal(cotizado([promo("vencida", { vigenciaHasta: "2026-10-01", beneficios: beneficio })], conPrecioHasta).venceEl, "2026-10-30", "la vencida no se aplicó");
  assert.equal(cotizado([promo("x", { vigenciaHasta: "2026-10-20", beneficios: beneficio }), promo("y", { vigenciaHasta: "2026-10-12", beneficios: beneficio })]).venceEl, "2026-10-12");
});

test("opcionesDeHorario: con lugar o lista de espera, en el orden mostrado; los llenos sin lista no", () => {
  assert.deepEqual(opcionesDeHorario(cotizado()), [
    { grupoId: "a", nombre: "Grupo a", horarioTexto: "lunes de 16:00 a 17:00", oferta: "lugar", lugares: 1 },
    { grupoId: "b", nombre: "Grupo b", horarioTexto: "lunes de 16:00 a 17:00", oferta: "lista_de_espera", lugares: 0 },
  ]);
});

test("el snapshot guardado conserva los horarios, los importes en texto y se lee de vuelta igual", () => {
  const p = cotizado([promo("x", { beneficios: [{ id: "b", tipo: "descuento_inscripcion", modo: "porcentaje", valor: "15.00", productoId: null, descripcion: null, momento: "inmediato" }] })]);
  const snap = snapshotDeCotizacion(p, "2026-10-08");
  const viaJson = JSON.parse(JSON.stringify(snap)) as unknown;
  assert.equal(snap.version, 1);
  assert.equal(snap.programa.precio!.costo_inscripcion, "500.00");
  assert.equal(snap.programa.promociones!.inscripcion.final_ahora, "425.00");
  assert.deepEqual(opcionesDeSnapshot(viaJson), opcionesDeHorario(p));
});

test("opcionesDeSnapshot tolera JSON con otra forma (devuelve lo que pueda, nunca lanza)", () => {
  for (const raro of [null, 3, "x", [], {}, { programa: null }, { programa: { grupos: "no" } }, { programa: { grupos: [null, 4, { grupo_id: 1 }, { grupo_id: "g", nombre: "N", horario_texto: "h", oferta: "sin_lugar", lugares_disponibles: 0 }] } }]) {
    assert.deepEqual(opcionesDeSnapshot(raro), []);
  }
  assert.deepEqual(opcionesDeSnapshot({ programa: { grupos: [{ grupo_id: "g", nombre: "N", horario_texto: "h", oferta: "lugar", lugares_disponibles: 2 }] } }), [{ grupoId: "g", nombre: "N", horarioTexto: "h", oferta: "lugar", lugares: 2 }]);
});

test("descripcionDePromociones: descuentos, meses gratis y lo diferido, con importes exactos", () => {
  const p = cotizado([
    promo("d", { prioridad: 5, beneficios: [{ id: "b1", tipo: "descuento_inscripcion", modo: "porcentaje", valor: "15.00", productoId: null, descripcion: null, momento: "inmediato" }, { id: "b2", tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "50.00", productoId: null, descripcion: null, momento: "inmediato" }] }),
    promo("m", { prioridad: 4, beneficios: [{ id: "b3", tipo: "meses_gratis", modo: "total", valor: "1.00", productoId: null, descripcion: null, momento: "inmediato" }] }),
    promo("u", { prioridad: 3, condicion: { tipo: "al_pagar_primera_mensualidad" }, beneficios: [{ id: "b4", tipo: "producto_gratis", modo: "total", valor: null, productoId: null, descripcion: "un uniforme", momento: "al_cumplir_condicion" }] }),
  ]);
  assert.deepEqual(descripcionDePromociones(p), [
    "Promo d: $75.00 menos en la inscripción, $50.00 menos en cada mensualidad",
    "Promo m: 1 mes gratis",
    "Promo u: un uniforme al pagar la primera mensualidad",
  ]);
  assert.deepEqual(descripcionDePromociones(cotizado()), []);
});

test("resumenDeCotizacion: precios con la promoción, promociones, y el horario elegido o «todavía no eligió»", () => {
  const p = cotizado([promo("x", { beneficios: [{ id: "b", tipo: "descuento_inscripcion", modo: "porcentaje", valor: "10.00", productoId: null, descripcion: null, momento: "inmediato" }] })]);
  const snapshot = JSON.parse(JSON.stringify(snapshotDeCotizacion(p, "2026-10-08"))) as unknown;
  assert.deepEqual(resumenDeCotizacion({ snapshot, vigenteHasta: "2026-10-15", grupoElegidoId: null }), [
    "• Cotización (vale hasta 2026-10-15): inscripción $450.00, mensualidad $800.00",
    "• Promociones cotizadas: Promo x",
    "• Horario elegido: todavía no eligió",
  ]);
  assert.equal(resumenDeCotizacion({ snapshot, vigenteHasta: "2026-10-15", grupoElegidoId: "a" }).at(-1), "• Horario elegido: Grupo a — lunes de 16:00 a 17:00");
  assert.equal(resumenDeCotizacion({ snapshot, vigenteHasta: "2026-10-15", grupoElegidoId: "b" }).at(-1), "• Horario elegido: Grupo b — lunes de 16:00 a 17:00 (lista de espera)");
  assert.deepEqual(resumenDeCotizacion({ snapshot: { raro: true }, vigenteHasta: "2026-10-15", grupoElegidoId: null }), ["• Cotización (vale hasta 2026-10-15)"]);
  const sinPrecio = JSON.parse(JSON.stringify(snapshotDeCotizacion(cotizado([], { ...programa, precio: null }), "2026-10-08"))) as unknown;
  assert.equal(resumenDeCotizacion({ snapshot: sinPrecio, vigenteHasta: "2026-10-15", grupoElegidoId: null })[0], "• Cotización (vale hasta 2026-10-15): sin precio vigente");
});

test("estatusEfectivo: una vigente se muestra vencida solo cuando su último día ya pasó con un día de margen; las demás no cambian", () => {
  const ahora = new Date("2026-10-08T12:00:00Z");
  assert.equal(estatusEfectivo("vigente", "2026-10-08", ahora), "vigente");
  assert.equal(estatusEfectivo("vigente", "2026-10-07", ahora), "vigente", "ayer en UTC todavía puede valer en México");
  assert.equal(estatusEfectivo("vigente", "2026-10-06", ahora), "vencida");
  assert.equal(estatusEfectivo("vigente", "2026-10-09", ahora), "vigente");
  assert.equal(estatusEfectivo("aceptada", "2026-01-01", ahora), "aceptada");
  assert.equal(estatusEfectivo("vencida", "2027-01-01", ahora), "vencida");
});
