import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTADO_INICIAL,
  MAX_INTENTOS,
  avanzar,
  elegirSucursal,
  extraerEdad,
  extraerNombre,
  textos,
  type ContextoCaptacion,
  type EstadoCaptacion,
} from "./maquina.ts";

// Nombres neutros a propósito: los reales viven en las tablas (invariante 2).
const CTX: ContextoCaptacion = {
  nombreVertical: "Vertical Uno",
  sucursales: [
    { id: "s-norte", nombre: "Norte" },
    { id: "s-sur", nombre: "Sur Poniente" },
  ],
};

function conversar(mensajes: string[], ctx = CTX) {
  let estado: EstadoCaptacion = ESTADO_INICIAL;
  const pasos = [];
  for (const m of mensajes) {
    const r = avanzar(estado, m, ctx);
    pasos.push(r);
    estado = r.estado;
  }
  return { estado, pasos };
}

test("camino feliz: saludo, tres preguntas y pase al asesor", () => {
  const { estado, pasos } = conversar(["Hola, quiero informes", "sofía", "8 años", "2"]);

  assert.deepEqual(pasos[0]!.respuestas, [textos.saludo("Vertical Uno"), textos.preguntaNombre]);
  assert.deepEqual(pasos[1]!.respuestas, [textos.preguntaEdad("Sofía")]);
  assert.deepEqual(pasos[2]!.respuestas, [textos.preguntaSucursal(CTX.sucursales)]);
  assert.deepEqual(pasos[3]!.respuestas, [textos.cierre("Sofía", "Sur Poniente")]);
  assert.equal(pasos[3]!.pasarAAsesor, "captura_completa");
  assert.deepEqual(estado, { paso: "completo", intentosFallidos: 0, nombre: "Sofía", edad: 8, sucursalId: "s-sur" });
});

test("ningún paso antes del último pide pasar al asesor", () => {
  const { pasos } = conversar(["Hola", "Sofía", "8"]);
  assert.ok(pasos.every((p) => p.pasarAAsesor === null));
});

test("la pregunta de sucursal lista las opciones numeradas de las tablas", () => {
  assert.equal(textos.preguntaSucursal(CTX.sucursales), "¿Qué sucursal te queda mejor? Responde con el número:\n1. Norte\n2. Sur Poniente");
});

test("con una sola sucursal no la pregunta", () => {
  const ctx = { ...CTX, sucursales: [{ id: "s-unica", nombre: "Única" }] };
  const { estado, pasos } = conversar(["Hola", "Ana", "10"], ctx);
  assert.equal(pasos[2]!.pasarAAsesor, "captura_completa");
  assert.equal(estado.sucursalId, "s-unica");
});

test("respuesta inválida: repregunta y no avanza", () => {
  const { estado, pasos } = conversar(["Hola", "Sofía", "no sé"]);
  assert.deepEqual(pasos[2]!.respuestas, [textos.reintentoEdad]);
  assert.equal(estado.paso, "edad");
  assert.equal(estado.intentosFallidos, 1);
});

test(`${MAX_INTENTOS} respuestas inválidas seguidas pasan al asesor`, () => {
  const { estado, pasos } = conversar(["Hola", "Sofía", "x", "y", "z"]);
  const ultimo = pasos.at(-1)!;
  assert.equal(ultimo.pasarAAsesor, "sin_entender");
  assert.deepEqual(ultimo.respuestas, [textos.sinEntender]);
  assert.equal(estado.paso, "edad");
});

test("una respuesta válida reinicia el contador de intentos", () => {
  const { estado } = conversar(["Hola", "123", "Sofía", "x", "8"]);
  assert.equal(estado.paso, "sucursal");
  assert.equal(estado.intentosFallidos, 0);
});

test("en paso completo no contesta nada y vuelve a pedir el pase", () => {
  const { estado } = conversar(["Hola", "Sofía", "8", "1"]);
  const r = avanzar(estado, "¿siguen ahí?", CTX);
  assert.deepEqual(r.respuestas, []);
  assert.equal(r.pasarAAsesor, "captura_completa");
});

test("es determinista: la misma entrada da la misma salida", () => {
  const a = conversar(["Hola", "Sofía", "8", "1"]);
  const b = conversar(["Hola", "Sofía", "8", "1"]);
  assert.deepEqual(a, b);
});

test("extraerNombre", () => {
  assert.equal(extraerNombre("  sofía  "), "Sofía");
  assert.equal(extraerNombre("Se llama Juan Pablo."), "Juan Pablo");
  assert.equal(extraerNombre("mi hija se llama maría josé"), "María José");
  assert.equal(extraerNombre("soy Ana"), "Ana");
  for (const malo of ["", "a", "123", "Sofía 8", "😀", "uno dos tres cuatro cinco seis"]) {
    assert.equal(extraerNombre(malo), null, malo);
  }
});

test("extraerEdad", () => {
  assert.equal(extraerEdad("8"), 8);
  assert.equal(extraerEdad("tiene 8 años"), 8);
  assert.equal(extraerEdad("ocho"), 8);
  assert.equal(extraerEdad("Dieciséis"), 16);
  assert.equal(extraerEdad("35"), 35);
  for (const malo of ["", "no sé", "0", "100", "8 y 10", "dos o tres"]) {
    assert.equal(extraerEdad(malo), null, malo);
  }
});

test("elegirSucursal por número o por nombre", () => {
  assert.equal(elegirSucursal("1", CTX.sucursales)?.id, "s-norte");
  assert.equal(elegirSucursal("2.", CTX.sucursales)?.id, "s-sur");
  assert.equal(elegirSucursal("la 2", CTX.sucursales)?.id, "s-sur");
  assert.equal(elegirSucursal("norte", CTX.sucursales)?.id, "s-norte");
  assert.equal(elegirSucursal("la de sur poniente", CTX.sucursales)?.id, "s-sur");
  for (const malo of ["3", "0", "", "no sé", "x"]) {
    assert.equal(elegirSucursal(malo, CTX.sucursales), null, malo);
  }
});
