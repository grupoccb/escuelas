import { test } from "node:test";
import assert from "node:assert/strict";
import { iniciarBarrido } from "./barrido.ts";

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Una promesa que se resuelve desde fuera. */
function compuerta() {
  let abrir!: () => void;
  const promesa = new Promise<void>((r) => (abrir = r));
  return { promesa, abrir };
}

test("detener() espera al barrido en curso y no deja que empiece otro (F1-01: SIGTERM no corta a la mitad)", async () => {
  const c = compuerta();
  let iniciados = 0;
  let terminados = 0;
  const barrido = iniciarBarrido({
    intervaloMs: 5,
    tarea: async () => {
      iniciados++;
      await c.promesa;
      terminados++;
    },
  });
  await esperar(30);
  assert.equal(iniciados, 1, "el barrido arrancó y sigue en curso");

  let detenido = false;
  const deteniendo = barrido.detener().then(() => (detenido = true));
  await esperar(30);
  assert.equal(detenido, false, "detener() no termina mientras el barrido corre");
  assert.equal(terminados, 0);

  c.abrir();
  await deteniendo;
  assert.equal(terminados, 1, "el barrido en curso terminó antes de que detener() regresara");

  await esperar(30);
  assert.equal(iniciados, 1, "después de detener no se programa otro barrido");
});

test("dos barridos no se solapan: si el anterior sigue, el tic se salta", async () => {
  const c = compuerta();
  let simultaneos = 0;
  let maximo = 0;
  let iniciados = 0;
  const barrido = iniciarBarrido({
    intervaloMs: 3,
    tarea: async () => {
      iniciados++;
      simultaneos++;
      maximo = Math.max(maximo, simultaneos);
      await c.promesa;
      simultaneos--;
    },
  });
  await esperar(40);
  assert.equal(iniciados, 1);
  c.abrir();
  await barrido.detener();
  assert.equal(maximo, 1);
});

test("un barrido que lanza no mata el intervalo", async () => {
  let llamadas = 0;
  const barrido = iniciarBarrido({
    intervaloMs: 3,
    tarea: async () => {
      llamadas++;
      throw new Error("falla simulada");
    },
  });
  await esperar(40);
  await barrido.detener();
  assert.ok(llamadas >= 2, `se reintentó en los tics siguientes (${llamadas})`);
});

test("detener() sin barrido en curso regresa de inmediato y se puede repetir", async () => {
  const barrido = iniciarBarrido({ intervaloMs: 1000, tarea: async () => {} });
  await barrido.detener();
  await barrido.detener();
});
