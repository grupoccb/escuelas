import assert from "node:assert/strict";
import { test } from "node:test";
import { cambioPorcentual, decimasDe, etiquetaDeMes, geometriaDeTendencia, indiceDelMaximo, maximoDe, mesAnterior, mesCorto, nombreDeMes, partesDeMes, porcentajeDeBarra, porcentajeEntero, rangoDeCaptacion, rangoDelMes, redondeado, textoDelRango } from "./graficas.ts";

test("el largo de una barra se calcula con enteros, con un decimal", () => {
  assert.equal(porcentajeDeBarra(1n, 3n), "33.3");
  assert.equal(porcentajeDeBarra(2n, 3n), "66.6");
  assert.equal(porcentajeDeBarra(5n, 5n), "100.0");
  assert.equal(porcentajeDeBarra(0n, 5n), "0.0");
  assert.equal(porcentajeDeBarra(7n, 0n), "0.0");
  assert.equal(porcentajeDeBarra(9n, 5n), "100.0", "nunca pasa del 100 %");
  assert.equal(porcentajeDeBarra(123456789012345n, 246913578024690n), "50.0", "importes en centavos grandes sin perder exactitud");
  assert.equal(porcentajeDeBarra(-3n, 5n), "0.0");
});

test("el máximo de una lista", () => {
  assert.equal(maximoDe([]), 0n);
  assert.equal(maximoDe([3n, 9n, 2n]), 9n);
});

test("meses: nombre, etiqueta, corto, anterior y rango", () => {
  assert.equal(nombreDeMes("2026-09"), "septiembre");
  assert.equal(etiquetaDeMes("2026-09"), "Septiembre 2026");
  assert.equal(mesCorto("2026-01"), "Ene");
  assert.equal(mesAnterior("2026-01"), "2025-12");
  assert.equal(mesAnterior("2026-09"), "2026-08");
  assert.deepEqual(rangoDelMes("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(rangoDelMes("2028-02"), { desde: "2028-02-01", hasta: "2028-02-29" });
  assert.deepEqual(rangoDelMes("2026-12"), { desde: "2026-12-01", hasta: "2026-12-31" });
  assert.equal(partesDeMes("2026-13"), null);
  assert.equal(partesDeMes("hola"), null);
});

test("el rango de captación es el escrito, o el mes si no se escribió nada", () => {
  assert.deepEqual(rangoDeCaptacion("2026-09", "", ""), { desde: "2026-09-01", hasta: "2026-09-30", delMes: true });
  assert.deepEqual(rangoDeCaptacion("2026-09", "2026-01-01", ""), { desde: "2026-01-01", hasta: "", delMes: false });
  assert.deepEqual(rangoDeCaptacion("2026-09", "", "2026-08-31"), { desde: "", hasta: "2026-08-31", delMes: false });
});

test("porcentajes con enteros: décimas, redondeo y cambio", () => {
  assert.equal(decimasDe("42.9"), 429);
  assert.equal(decimasDe("100.0"), 1000);
  assert.equal(decimasDe("7"), 70);
  assert.equal(decimasDe("-3.5"), -35);
  assert.equal(decimasDe(null), null);
  assert.equal(decimasDe("x"), null);
  assert.equal(redondeado("42.4"), "42");
  assert.equal(redondeado("42.5"), "43");
  assert.equal(redondeado("100.0"), "100");
  assert.equal(redondeado(null), null);
  assert.equal(cambioPorcentual(110n, 100n), "+10.0");
  assert.equal(cambioPorcentual(95n, 100n), "-5.0");
  assert.equal(cambioPorcentual(100n, 100n), "0.0");
  assert.equal(cambioPorcentual(100n, 0n), null);
  assert.equal(cambioPorcentual(22070000n, 20360000n), "+8.4", "importes en centavos grandes");
  assert.equal(cambioPorcentual(100003n, 100000n), "0.0", "un cambio menor que una décima es cero");
  assert.equal(porcentajeEntero(41, 236), "17");
  assert.equal(porcentajeEntero(1, 2), "50");
  assert.equal(porcentajeEntero(1, 0), null);
});

test("la gráfica de 12 meses: barras en enteros, eje común y línea de activos entre 14 y 96", () => {
  const meses = [
    { mes: "2026-01", altas: 10, bajas: 5, activos: 100 },
    { mes: "2026-02", altas: 20, bajas: 10, activos: 150 },
    { mes: "2026-03", altas: 0, bajas: 0, activos: 200 },
  ];
  const g = geometriaDeTendencia(meses, 300);
  assert.equal(g.puntos.length, 3);
  assert.equal(g.puntos[0]!.x, 50);
  assert.equal(g.puntos[1]!.columnaX, 100);
  assert.equal(g.puntos[1]!.columnaAncho, 100);
  assert.equal(g.puntos[1]!.altaAlto, 82, "el mayor valor llena el alto máximo de altas");
  assert.equal(g.puntos[1]!.bajaAlto, 26, "las bajas usan su propio alto máximo (52) con la misma escala");
  assert.equal(g.puntos[0]!.altaAlto, 41);
  assert.equal(g.puntos[2]!.altaAlto, 0);
  assert.equal(g.puntos[1]!.altaY, g.eje - 82);
  assert.equal(g.puntos[0]!.activoY, 96, "el mínimo de activos va abajo de su zona");
  assert.equal(g.puntos[2]!.activoY, 14, "el máximo va arriba");
  assert.equal(g.linea, "50,96 150,55 250,14");
  assert.ok(g.puntos.every((p) => p.barraX >= p.columnaX && p.barraX + p.barraAncho <= p.columnaX + p.columnaAncho));
});

test("la gráfica no se rompe sin movimiento ni con activos iguales", () => {
  const plano = [
    { mes: "2026-01", altas: 0, bajas: 0, activos: 5 },
    { mes: "2026-02", altas: 0, bajas: 0, activos: 5 },
  ];
  const g = geometriaDeTendencia(plano, 200);
  assert.ok(g.puntos.every((p) => p.altaAlto === 0 && p.bajaAlto === 0 && p.activoY === 96));
  assert.equal(geometriaDeTendencia([], 200).puntos.length, 0);
});

test("el mes con más altas o bajas (el primero si empatan; -1 si todos son cero)", () => {
  const m = [
    { mes: "a", altas: 3, bajas: 0, activos: 1 },
    { mes: "b", altas: 9, bajas: 4, activos: 1 },
    { mes: "c", altas: 9, bajas: 4, activos: 1 },
  ];
  assert.equal(indiceDelMaximo(m, "altas"), 1);
  assert.equal(indiceDelMaximo(m, "bajas"), 1);
  assert.equal(indiceDelMaximo([{ mes: "a", altas: 0, bajas: 0, activos: 0 }], "altas"), -1);
  assert.equal(indiceDelMaximo([], "bajas"), -1);
});

test("el rango dicho en una frase", () => {
  assert.equal(textoDelRango("2026-09", { desde: "2026-09-01", hasta: "2026-09-30", delMes: true }), "en septiembre");
  assert.equal(textoDelRango("2026-09", { desde: "2026-01-01", hasta: "2026-03-31", delMes: false }), "del 1 ene 2026 al 31 mar 2026");
  assert.equal(textoDelRango("2026-09", { desde: "2026-01-01", hasta: "", delMes: false }), "desde el 1 ene 2026");
  assert.equal(textoDelRango("2026-09", { desde: "", hasta: "2026-03-31", delMes: false }), "hasta el 31 mar 2026");
});
