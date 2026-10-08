import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LIMITE_CIERRE_MS, crearCierre, type RecursosDeCierre } from "./cierre.ts";

function recursos(sobre: Partial<{ barrido: () => Promise<void>; cerrarServidor: (cb: (e?: Error) => void) => void; desconectar: () => Promise<void>; limiteMs: number }> = {}) {
  const pasos: string[] = [];
  const salidas: number[] = [];
  const r: RecursosDeCierre = {
    barrido: {
      detener: async () => {
        pasos.push("barrido");
        await sobre.barrido?.();
      },
    },
    server: {
      close: (cb) => {
        pasos.push("servidor");
        if (sobre.cerrarServidor) sobre.cerrarServidor(cb ?? (() => {}));
        else cb?.();
      },
      closeIdleConnections: () => void pasos.push("conexiones_ociosas"),
    },
    prisma: {
      $disconnect: async () => {
        pasos.push("base");
        await sobre.desconectar?.();
      },
    },
    salir: (codigo) => void salidas.push(codigo),
    ...(sobre.limiteMs ? { limiteMs: sobre.limiteMs } : {}),
  };
  return { r, pasos, salidas };
}

test("cierre ordenado: primero el barrido, luego el servidor, al final la base; sale con 0", async () => {
  const { r, pasos, salidas } = recursos();
  await crearCierre(r)("SIGTERM");
  assert.deepEqual(pasos, ["barrido", "servidor", "conexiones_ociosas", "base"]);
  assert.deepEqual(salidas, [0]);
});

test("EA-19: si algo del cierre falla, el proceso sale con 1 (no se esconde detrás de un exit(0)) y los demás pasos igual corren", async () => {
  for (const [nombre, sobre] of [
    ["la base no se desconecta", { desconectar: async () => { throw new Error("no se pudo cerrar la base"); } }],
    ["el barrido no se detiene", { barrido: async () => { throw new Error("el barrido reventó"); } }],
    ["el servidor no cierra", { cerrarServidor: (cb: (e?: Error) => void) => cb(new Error("no cerró")) }],
  ] as const) {
    const { r, pasos, salidas } = recursos(sobre);
    await crearCierre(r)("SIGTERM");
    assert.deepEqual(salidas, [1], nombre);
    assert.ok(pasos.includes("barrido") && pasos.includes("servidor") && pasos.includes("base"), `${nombre}: aun así se intentaron todos los pasos`);
  }
});

test("EA-19: si el cierre tarda más que el tope, sale con 1 sin esperar", async () => {
  const { r, salidas } = recursos({ limiteMs: 30, barrido: () => new Promise<void>(() => {}) });
  void crearCierre(r)("SIGTERM"); // el barrido nunca termina
  await new Promise((resolver) => setTimeout(resolver, 150));
  assert.deepEqual(salidas, [1]);
});

test("una segunda señal mientras cierra no cierra dos veces", async () => {
  const { r, pasos, salidas } = recursos();
  const cerrar = crearCierre(r);
  await Promise.all([cerrar("SIGTERM"), cerrar("SIGINT")]);
  assert.equal(pasos.filter((p) => p === "base").length, 1);
  assert.deepEqual(salidas, [0]);
});

test("EB-04: el compose de ejemplo decide TRUST_PROXY de forma explícita para el backend (si no, en producción el backend alerta)", () => {
  const compose = readFileSync(fileURLToPath(new URL("../docker-compose.yml", import.meta.url)), "utf8");
  const bloque = compose.slice(compose.indexOf("\n  backend:"), compose.indexOf("\n  chatwoot-postgres:"));
  assert.match(bloque, /^\s+TRUST_PROXY:\s*"?[^\s"#]+"?\s*$/m, "el servicio backend fija TRUST_PROXY");
});

test("EA-19: el plazo que compose da al backend para parar (stop_grace_period) es MAYOR que el tope del cierre", () => {
  const compose = readFileSync(fileURLToPath(new URL("../docker-compose.yml", import.meta.url)), "utf8");
  const bloque = compose.slice(compose.indexOf("\n  backend:"), compose.indexOf("\n  chatwoot-postgres:"));
  const m = /stop_grace_period:\s*(\d+)s/.exec(bloque);
  assert.ok(m, "el servicio backend define stop_grace_period");
  assert.ok(Number(m[1]) * 1000 > LIMITE_CIERRE_MS, `${m[1]} s debe ser mayor que ${LIMITE_CIERRE_MS / 1000} s`);
});
