import assert from "node:assert/strict";
import { test } from "node:test";
import { moverEtapa, ordenValido, type EtapaDeLista } from "./etapas.ts";

const e = (id: string, tipo: string | null, extra: Partial<EtapaDeLista> = {}): EtapaDeLista => ({ id, nombre: id, orden: 0, tipo_sistema: tipo, es_ganado: false, es_perdido: false, dias_alerta_sin_movimiento: null, ...extra });
const LISTA = [e("nuevo", "nuevo"), e("contactado", "contactado"), e("mia", null), e("inscrito", "inscrito", { es_ganado: true }), e("perdido", "perdido", { es_perdido: true })];

test("una etapa propia se mueve entre las de sistema, pero no pasa de las de cierre", () => {
  assert.deepEqual(moverEtapa(LISTA, 2, -1)?.map((x) => x.id), ["nuevo", "mia", "contactado", "inscrito", "perdido"]);
  assert.equal(moverEtapa(LISTA, 2, 1), null, "no puede pasar a Inscrito");
  assert.equal(moverEtapa(LISTA, 0, -1), null, "no hay nada arriba de la primera");
});

test("las de sistema no cambian de orden entre sí ni se mueven de las de cierre", () => {
  assert.equal(moverEtapa(LISTA, 1, -1), null, "Contactado no pasa a Nuevo");
  assert.equal(moverEtapa(LISTA, 3, 1), null, "Inscrito no pasa a Perdido");
  assert.equal(ordenValido(LISTA, LISTA), true);
  assert.equal(ordenValido(LISTA, [LISTA[2]!, ...LISTA.filter((x) => x.id !== "mia")]), true, "una propia puede ir primero");
});
