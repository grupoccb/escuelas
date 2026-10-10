import assert from "node:assert/strict";
import { test } from "node:test";
import { aBase64, erroresPorArchivo, esDeExcel, frase, problemaConLosArchivos, tamanoTexto, type ProblemaDeCarga } from "./catalogo.ts";

const p = (archivo: string, fila: number): ProblemaDeCarga => ({ archivo, fila, columna: "X", mensaje: "m", texto: `Fila ${fila}` });

test("aBase64: igual que Buffer, también con archivos grandes (por tramos)", () => {
  const chico = new TextEncoder().encode("Día;Salón\n");
  assert.equal(aBase64(chico), Buffer.from(chico).toString("base64"));
  const grande = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
  assert.equal(aBase64(grande), Buffer.from(grande).toString("base64"));
});

test("los errores se agrupan por archivo conservando el orden", () => {
  const g = erroresPorArchivo([p("salones.csv", 2), p("grupos.csv", 3), p("salones.csv", 5)]);
  assert.deepEqual(g.map((x) => [x.archivo, x.errores.map((e) => e.fila)]), [["salones.csv", [2, 5]], ["grupos.csv", [3]]]);
});

test("frase: lo que se va a hacer, en palabras, y que nada se borra", () => {
  assert.equal(frase([{ clave: "a", nombre: "A", creados: 12, actualizados: 3, sin_cambios: 1 }]), "Se crearán 12 cosas nuevas y se actualizarán 3. Nada se borra");
  assert.equal(frase([{ clave: "a", nombre: "A", creados: 1, actualizados: 0, sin_cambios: 0 }]), "Se creará 1 cosa nueva. Nada se borra");
  assert.equal(frase([{ clave: "a", nombre: "A", creados: 0, actualizados: 1, sin_cambios: 0 }]), "Se actualizará 1. Nada se borra");
  assert.equal(frase([]), "No hay nada que crear ni actualizar");
  assert.equal(frase([{ clave: "a", nombre: "A", creados: 12, actualizados: 1, sin_cambios: 0 }], true), "Se crearon 12 cosas nuevas y se actualizó 1. Nada se borró");
});

test("límites de los archivos elegidos", () => {
  assert.equal(problemaConLosArchivos([{ nombre: "a.csv", tamano: 100 }]), null);
  assert.match(problemaConLosArchivos([{ nombre: "a.csv", tamano: 6_000_000 }])!, /pesan demasiado/);
  assert.match(problemaConLosArchivos(Array.from({ length: 13 }, (_, i) => ({ nombre: `${i}.csv`, tamano: 1 })))!, /hasta 12/);
  assert.match(problemaConLosArchivos([{ nombre: "a.csv", tamano: 1 }, { nombre: "a.csv", tamano: 1 }])!, /dos veces/);
});

test("tamaños legibles", () => {
  assert.equal(tamanoTexto(200), "200 bytes");
  assert.equal(tamanoTexto(2048), "2.0 KB");
  assert.equal(tamanoTexto(3_145_728), "3.0 MB");
});

test("un archivo de Excel se detecta antes de subirlo y se dice cómo guardarlo como CSV", () => {
  for (const n of ["sucursales.xlsx", "Salones.XLS", "grupos.ods", "x.xlsm"]) assert.equal(esDeExcel(n), true, n);
  for (const n of ["sucursales.csv", "salones.txt", "xlsx.csv"]) assert.equal(esDeExcel(n), false, n);
  const dicho = problemaConLosArchivos([{ nombre: "precios.csv", tamano: 10 }, { nombre: "sucursales.xlsx", tamano: 10 }])!;
  assert.match(dicho, /«sucursales\.xlsx»/);
  assert.match(dicho, /CSV UTF-8/);
  assert.equal(problemaConLosArchivos([{ nombre: "precios.csv", tamano: 10 }]), null);
});
