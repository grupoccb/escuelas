import assert from "node:assert/strict";
import { test } from "node:test";
import type { Etapa } from "../../api/tipos.ts";
import { etapaDeInscrito, problemaDeNota, sePuedeMarcarComoInscrito } from "./inscrito-a-mano.ts";

const e = (id: string, tipo: string | null, extra: Partial<Etapa> = {}): Etapa => ({ id, nombre: id, orden: 0, tipo_sistema: tipo, es_ganado: false, es_perdido: false, dias_alerta_sin_movimiento: null, ...extra });
const NEGOCIACION = e("negociacion", "negociacion");
const INSCRITO = e("inscrito", "inscrito", { es_ganado: true });
const PERDIDO = e("perdido", "perdido", { es_perdido: true });

test("la acción se ofrece solo con la inscripción apagada, a quien puede escribir y con el lead en una etapa abierta", () => {
  const base = { inscripcionEncendida: false, puedeEscribir: true, etapaActual: NEGOCIACION };
  assert.equal(sePuedeMarcarComoInscrito(base), true);
  assert.equal(sePuedeMarcarComoInscrito({ ...base, inscripcionEncendida: true }), false, "con la inscripción encendida se inscribe desde la ficha");
  assert.equal(sePuedeMarcarComoInscrito({ ...base, puedeEscribir: false }), false);
  assert.equal(sePuedeMarcarComoInscrito({ ...base, etapaActual: INSCRITO }), false, "ya está inscrito");
  assert.equal(sePuedeMarcarComoInscrito({ ...base, etapaActual: PERDIDO }), false, "uno perdido primero se recupera");
  assert.equal(sePuedeMarcarComoInscrito({ ...base, etapaActual: undefined }), false, "sin saber la etapa no se ofrece");
});

test("la etapa de inscrito se busca por su papel, con la bandera de ganada como respaldo", () => {
  assert.equal(etapaDeInscrito([NEGOCIACION, INSCRITO, PERDIDO])?.id, "inscrito");
  assert.equal(etapaDeInscrito([NEGOCIACION, e("ganada", null, { es_ganado: true })])?.id, "ganada");
  assert.equal(etapaDeInscrito([NEGOCIACION, PERDIDO]), undefined);
});

test("la nota: vacía, de espacios, muy corta y muy larga se rechazan con un texto que dice qué hacer; una frase se acepta", () => {
  assert.match(problemaDeNota("")!, /Escribe cómo se inscribió/);
  assert.match(problemaDeNota("      ")!, /Escribe cómo se inscribió/);
  assert.match(problemaDeNota("pagó")!, /al menos 10 caracteres/);
  assert.match(problemaDeNota("   pagó hoy  ")!, /al menos 10 caracteres/, "los espacios de los lados no cuentan");
  assert.equal(problemaDeNota("Pagó en efectivo"), null);
  assert.equal(problemaDeNota("x".repeat(10)), null);
  assert.equal(problemaDeNota("x".repeat(1000)), null);
  assert.match(problemaDeNota("x".repeat(1001))!, /máximo 1000/);
});

test("EV-26: la nota de relleno (invisibles, puntos, signos) se trata como vacía o corta, igual que el servidor", () => {
  assert.match(problemaDeNota("\u200B".repeat(10))!, /Escribe cómo se inscribió/);
  assert.match(problemaDeNota("\u2800".repeat(12))!, /Escribe cómo se inscribió/);
  assert.match(problemaDeNota("\u3164".repeat(12))!, /Escribe cómo se inscribió/);
  assert.match(problemaDeNota("..........")!, /Escribe cómo se inscribió/);
  assert.match(problemaDeNota("¡! ... ¿? -- --")!, /Escribe cómo se inscribió/);
  assert.match(problemaDeNota("a.b.c.d.e.f.g.h.")!, /al menos 10 caracteres, con letras o números/);
  assert.equal(problemaDeNota("P\u200Bagó en efectivo"), null);
});
