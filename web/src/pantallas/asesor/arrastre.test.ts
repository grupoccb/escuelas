import assert from "node:assert/strict";
import { test } from "node:test";
import { columnaBajo, idsAArrastrar, pasoDeAutodesplazamiento, posicionDelFantasma, superaElUmbral, type CajaDeColumna } from "./arrastre.ts";

const CAJAS: CajaDeColumna[] = [
  { id: "a", izquierda: 0, derecha: 100, arriba: 0, abajo: 400 },
  { id: "b", izquierda: 112, derecha: 212, arriba: 0, abajo: 400 },
  { id: "c", izquierda: 224, derecha: 280, arriba: 0, abajo: 400 },
];

test("la columna bajo el puntero: dentro de una caja, en el hueco entre dos y fuera de todas", () => {
  assert.equal(columnaBajo(CAJAS, 50, 200), "a");
  assert.equal(columnaBajo(CAJAS, 150, 10), "b");
  assert.equal(columnaBajo(CAJAS, 250, 399), "c");
  assert.equal(columnaBajo(CAJAS, 106, 200), null, "el hueco entre columnas no es destino");
  assert.equal(columnaBajo(CAJAS, 50, 401), null, "debajo de la columna");
  assert.equal(columnaBajo(CAJAS, 100, 0), "a", "el borde cuenta como dentro");
  assert.equal(columnaBajo([], 1, 1), null);
});

test("qué ids viajan: la selección entera si la tarjeta está seleccionada, y si no solo ella", () => {
  const orden = ["l1", "l2", "l3", "l4"];
  assert.deepEqual(idsAArrastrar("l2", new Set(["l1", "l2", "l4"]), orden), ["l1", "l2", "l4"], "toda la selección, en el orden en que se ve");
  assert.deepEqual(idsAArrastrar("l3", new Set(["l1", "l2"]), orden), ["l3"], "una tarjeta fuera de la selección viaja sola");
  assert.deepEqual(idsAArrastrar("l1", new Set(), orden), ["l1"]);
  assert.deepEqual(idsAArrastrar("l9", new Set(["l9", "l1"]), orden), ["l9"], "si ya no se ve en la lista, no arrastra a los demás con ella");
  assert.deepEqual(idsAArrastrar("l4", new Set(["l4", "oculto"]), orden), ["l4"], "los ids que ya no se ven no viajan");
});

test("el arrastre empieza al pasar el umbral, no con cualquier temblor del clic", () => {
  assert.equal(superaElUmbral(0, 0), false);
  assert.equal(superaElUmbral(2, 2), false);
  assert.equal(superaElUmbral(3, 3), true);
  assert.equal(superaElUmbral(-6, 0), true, "también hacia la izquierda");
  assert.equal(superaElUmbral(0, -5), false);
  assert.equal(superaElUmbral(4, 0, 4), true, "el umbral se puede cambiar");
});

test("el tablero se desplaza solo cerca de sus bordes y hacia el lado correcto", () => {
  const tablero = { izquierda: 100, derecha: 900 };
  assert.equal(pasoDeAutodesplazamiento(500, tablero), 0, "en medio no se mueve");
  assert.equal(pasoDeAutodesplazamiento(850, tablero), 18, "cerca del borde derecho avanza");
  assert.equal(pasoDeAutodesplazamiento(120, tablero), -18, "cerca del borde izquierdo retrocede");
  assert.equal(pasoDeAutodesplazamiento(820, tablero), 0, "a 80 px justos todavía no");
  assert.equal(pasoDeAutodesplazamiento(819, tablero), 0);
  assert.equal(pasoDeAutodesplazamiento(821, tablero), 18);
  assert.equal(pasoDeAutodesplazamiento(950, tablero), 18, "fuera del borde sigue empujando");
  assert.equal(pasoDeAutodesplazamiento(850, tablero, 100, 5), 5, "borde y paso configurables");
});

test("la tarjeta fantasma queda donde se agarró", () => {
  assert.deepEqual(posicionDelFantasma({ x: 300, y: 200 }, { dx: 40, dy: 12 }), { x: 260, y: 188 });
});
