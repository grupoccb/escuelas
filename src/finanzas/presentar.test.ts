// V10: cómo se presenta un pago — sus aplicaciones salen SIEMPRE del cargo más antiguo al más nuevo, no en el orden en que la base devuelva las filas.
//
// Causa raíz de la prueba intermitente de pagos parciales: `pago_aplicacion` se leía con `ORDER BY creado_en`. Las aplicaciones de un pago nacen en la misma transacción,
// con una hora de creación de MILISEGUNDOS: dos filas pueden compartirla (≈ 40 % de los pagos de dos cargos en una corrida de 1 900) y entonces la base devuelve las filas
// en el orden físico en que están guardadas, que no es el del negocio. Estas pruebas usan filas armadas a mano (nada de reloj ni azar): sin el orden de negocio, fallan siempre.

import { test } from "node:test";
import assert from "node:assert/strict";
import { aFecha } from "../catalogo/precios.ts";
import { presentarPago, type FilaDePago } from "./presentar.ts";

type Aplicacion = FilaDePago["aplicaciones"][number];
const dec = (n: string) => ({ toFixed: () => n });
const aplicacion = (cargoId: string, concepto: string, vence: string, creadoCargo: string, monto: string): Aplicacion => ({
  id: `apl-${cargoId}`,
  cargo_id: cargoId,
  monto_aplicado: dec(monto),
  estatus: "aplicada",
  revertida_en: null,
  cargo: { concepto, periodo: null, descripcion: null, fecha_vencimiento: aFecha(vence), creado_en: new Date(creadoCargo), alumno: { id: "al", nombre: "Alumno" } },
} as unknown as Aplicacion);
const pago = (aplicaciones: Aplicacion[]): FilaDePago => ({
  id: "p",
  tutor_id: "t",
  monto: dec("1299.75"),
  monto_aplicado: dec("1299.75"),
  metodo: "efectivo",
  referencia: null,
  fecha: aFecha("2026-11-10"),
  estatus: "aplicado",
  cancelado_en: null,
  motivo_cancelacion: null,
  creado_en: new Date("2026-11-10T16:00:00Z"),
  registrado_por: null,
  aplicaciones,
});

const INSC2 = aplicacion("c-insc2", "inscripcion", "2026-11-10", "2026-11-10T16:00:00.100Z", "299.75");
const MENS1 = aplicacion("c-mens1", "mensualidad", "2026-11-12", "2026-11-10T16:00:00.050Z", "1000.00");

test("las aplicaciones salen del cargo más antiguo al más nuevo aunque la base las entregue al revés (la falla del pago parcial)", () => {
  // El orden de la falla: [mensualidad del hijo 1, inscripción del hijo 2] (la base las devolvió en su orden físico).
  const r = presentarPago(pago([MENS1, INSC2]));
  assert.deepEqual(r.aplicaciones.map((a) => [a.concepto, a.monto]), [["inscripcion", "299.75"], ["mensualidad", "1000.00"]]);
  // Y es independiente del orden de entrada: cualquier permutación da lo mismo.
  assert.deepEqual(presentarPago(pago([INSC2, MENS1])).aplicaciones.map((a) => a.cargo_id), ["c-insc2", "c-mens1"]);
});

test("a igual vencimiento: la inscripción antes que la mensualidad, luego el cargo creado antes, luego el identificador", () => {
  const insc = aplicacion("z-insc", "inscripcion", "2026-11-10", "2026-11-10T16:00:00.000Z", "500.00");
  const mens = aplicacion("a-mens", "mensualidad", "2026-11-10", "2026-11-10T16:00:00.000Z", "1000.00");
  const mensB = aplicacion("b-mens", "mensualidad", "2026-11-10", "2026-11-10T16:00:00.000Z", "1000.00");
  const mensTarde = aplicacion("0-mens", "mensualidad", "2026-11-10", "2026-11-10T16:00:00.500Z", "1000.00");
  const esperado = ["z-insc", "a-mens", "b-mens", "0-mens"];
  for (const entrada of [[mensTarde, mensB, mens, insc], [insc, mens, mensB, mensTarde], [mens, mensTarde, insc, mensB], [mensB, insc, mensTarde, mens]]) {
    assert.deepEqual(presentarPago(pago(entrada)).aplicaciones.map((a) => a.cargo_id), esperado);
  }
});
