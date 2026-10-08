// Retención de sesiones e intentos de acceso (EB-19): marca con eliminado_en lo caducado, no toca lo
// vigente, es idempotente, no cruza organizaciones y el barrido la invoca (a lo más una vez por hora).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";
import { soloOrganizaciones } from "../testutil/carrera.ts";
import { sembrarUsuario } from "../testutil/api.ts";
import { correrCiclo } from "../ciclo.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { hashDeToken, nuevoToken } from "./sesiones.ts";
import { purgarCaducados, RETENCION_POR_DEFECTO } from "./retencion.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-11-20T12:00:00Z");
const hace = (ms: number): Date => new Date(AHORA.getTime() - ms);

async function escenario() {
  const org = await sembrarOrganizacion(prisma, "Retencion");
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const sesion = (expira: Date, revocada: Date | null = null) =>
    prisma.sesion.create({ data: { organizacion_id: org.organizacionId, usuario_id: u.id, token_hash: hashDeToken(nuevoToken()), expira_en: expira, ultima_actividad_en: hace(40 * DIA), revocada_en: revocada } });
  const intento = (creado: Date) => prisma.intento_acceso.create({ data: { organizacion_id: org.organizacionId, correo: u.correo, ip: "10.0.0.1", creado_en: creado } });
  const caducadas = [await sesion(hace(31 * DIA)), await sesion(hace(1 * DIA), hace(31 * DIA))];
  const vigentes = [await sesion(new Date(AHORA.getTime() + DIA)), await sesion(hace(29 * DIA)), await sesion(hace(1 * DIA), hace(2 * DIA))];
  const viejos = [await intento(hace(49 * 60 * 60 * 1000)), await intento(hace(10 * DIA))];
  const recientes = [await intento(hace(60 * 60 * 1000)), await intento(hace(47 * 60 * 60 * 1000))];
  return { org, caducadas, vigentes, viejos, recientes };
}

const marcadas = async (ids: string[], modelo: "sesion" | "intento_acceso"): Promise<number> =>
  modelo === "sesion" ? prisma.sesion.count({ where: { id: { in: ids }, eliminado_en: { not: null } } }) : prisma.intento_acceso.count({ where: { id: { in: ids }, eliminado_en: { not: null } } });

test("marca lo caducado con eliminado_en (sin borrar), deja lo vigente, y una segunda corrida no hace nada", async () => {
  const e = await escenario();
  const raiz = soloOrganizaciones(prisma, [e.org.organizacionId]);
  const r1 = await purgarCaducados({ prisma: raiz, reloj: () => AHORA });
  assert.deepEqual(r1, { organizaciones: 1, sesiones: 2, intentos: 2, errores: 0 });
  assert.equal(await marcadas(e.caducadas.map((s) => s.id), "sesion"), 2);
  assert.equal(await marcadas(e.vigentes.map((s) => s.id), "sesion"), 0);
  assert.equal(await marcadas(e.viejos.map((s) => s.id), "intento_acceso"), 2);
  assert.equal(await marcadas(e.recientes.map((s) => s.id), "intento_acceso"), 0);
  assert.equal(await prisma.sesion.count({ where: { organizacion_id: e.org.organizacionId } }), 5, "nada se borró físicamente");
  const r2 = await purgarCaducados({ prisma: raiz, reloj: () => AHORA });
  assert.deepEqual(r2, { organizaciones: 1, sesiones: 0, intentos: 0, errores: 0 }, "idempotente");
  assert.deepEqual(RETENCION_POR_DEFECTO, { sesionesDias: 30, intentosHoras: 48 });
});

test("es por organización: purgar una no toca a la otra", async () => {
  const a = await escenario();
  const b = await escenario();
  await purgarCaducados({ prisma: soloOrganizaciones(prisma, [a.org.organizacionId]), reloj: () => AHORA });
  assert.equal(await marcadas(a.caducadas.map((s) => s.id), "sesion"), 2);
  assert.equal(await marcadas(b.caducadas.map((s) => s.id), "sesion"), 0, "la otra sigue intacta");
});

test("el barrido invoca la retención solo si se enciende, y a lo más una vez por intervalo", async () => {
  const e = await escenario();
  const raiz = soloOrganizaciones(prisma, [e.org.organizacionId]);
  const base = { prisma: raiz, mensajeria: new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => AHORA }) };
  const apagada = await correrCiclo({ ...base, reloj: () => AHORA });
  assert.equal(apagada.retencion, null);
  assert.equal(await marcadas(e.caducadas.map((s) => s.id), "sesion"), 0);

  const primera = await correrCiclo({ ...base, retencion: { cadaMs: 60 * 60 * 1000 }, reloj: () => AHORA });
  assert.equal(primera.retencion?.sesiones, 2);
  const nuevaCaducada = await prisma.sesion.create({ data: { organizacion_id: e.org.organizacionId, usuario_id: (await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: e.org.organizacionId } })).id, token_hash: hashDeToken(nuevoToken()), expira_en: hace(40 * DIA), ultima_actividad_en: hace(41 * DIA) } });
  const muyPronto = await correrCiclo({ ...base, retencion: { cadaMs: 60 * 60 * 1000 }, reloj: () => new Date(AHORA.getTime() + 10 * 60 * 1000) });
  assert.equal(muyPronto.retencion, null, "no le tocaba");
  assert.equal(await marcadas([nuevaCaducada.id], "sesion"), 0);
  const luego = await correrCiclo({ ...base, retencion: { cadaMs: 60 * 60 * 1000 }, reloj: () => new Date(AHORA.getTime() + 61 * 60 * 1000) });
  assert.equal(luego.retencion?.sesiones, 1);
  assert.equal(await marcadas([nuevaCaducada.id], "sesion"), 1);
});
