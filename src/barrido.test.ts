import { test } from "node:test";
import assert from "node:assert/strict";
import { iniciarBarrido } from "./barrido.ts";

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * ED-06: espera a que se cumpla una condición, sondeando, en vez de dormir un tiempo fijo y esperar que el temporizador haya disparado. Con la
 * máquina ocupada un `setInterval` de 3 ms puede tardar decenas de ms; la condición, no el reloj, decide. Tope de 5 s para no colgar si falla.
 */
async function esperarHasta(condicion: () => boolean, descripcion: string): Promise<void> {
  const limite = Date.now() + 5000;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error(`no se cumplió a tiempo: ${descripcion}`);
    await esperar(2);
  }
}

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
  await esperarHasta(() => iniciados >= 1, "el primer barrido arrancó");
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
  await esperarHasta(() => iniciados >= 1, "el primer barrido arrancó");
  await esperar(40); // varios tics con el barrido en curso: ninguno debe arrancar otro
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
  await esperarHasta(() => llamadas >= 2, "el barrido volvió a correr después de lanzar");
  await barrido.detener();
  assert.ok(llamadas >= 2, `se reintentó en los tics siguientes (${llamadas})`);
});

test("detener() sin barrido en curso regresa de inmediato y se puede repetir", async () => {
  const barrido = iniciarBarrido({ intervaloMs: 1000, tarea: async () => {} });
  await barrido.detener();
  await barrido.detener();
});
