// Prueba de fuego del invariante 2: una vertical nueva se da de alta SOLO con filas de seed, y el
// loop completo funciona para ella sin cambiar una línea de código.
//
// Este archivo no nombra ninguna vertical (check:generico lo prohíbe): aplica los seeds reales de
// prisma/seed/ a una organización nueva, descubre cuál es la vertical que trajo la segunda semilla
// comparando las filas antes y después, y verifica todo contra lo que dice la tabla.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { crearPrisma, type PrismaClient } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { correrAutomatizaciones } from "../automatizaciones/motor.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { reporteLeads } from "../reportes/leads.ts";
import { procesarEntrante } from "./entrante.ts";
import { textos } from "./maquina.ts";

let prisma: PrismaClient;
let orgId: string;
let primera: { id: string; nombre: string; slug: string; bandejaId: string; cuenta: number; inbox: number };
let segunda: { id: string; nombre: string; slug: string; bandejaId: string; cuenta: number; inbox: number };
let sucursalesSegunda: string[];
let siguiente = randomInt(1_000_000, 2_000_000_000);

/** Los seeds usan ids fijos con este prefijo; cada corrida los lleva a una organización propia. */
const ID_FIJO = /00000000-0000-4000-8000-000000000(\d{3})/g;

before(async () => {
  prisma = crearPrisma();
  const prefijo = randomBytes(4).toString("hex");
  const aOrganizacionNueva = (sql: string): string => sql.replace(ID_FIJO, `${prefijo}-0000-4000-8000-000000000$1`);
  orgId = `${prefijo}-0000-4000-8000-000000000001`;

  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    await cliente.query(aOrganizacionNueva(readFileSync("prisma/seed/demo.sql", "utf8")));
    const antes = new Set((await cliente.query("SELECT id FROM vertical WHERE organizacion_id = $1", [orgId])).rows.map((r) => r.id as string));
    assert.equal(antes.size, 1, "demo.sql da de alta una sola vertical");

    // ── La prueba: una vertical nueva, solo con las filas de su seed. ─────────────────────────
    const seed2 = aOrganizacionNueva(readFileSync("prisma/seed/segunda-vertical.sql", "utf8"));
    await cliente.query(seed2);
    await cliente.query(seed2); // idempotente
  } finally {
    await cliente.end();
  }

  const db = conAlcance(prisma, orgId);
  const verticales = await db.vertical.findMany({ orderBy: { creado_en: "asc" } });
  assert.equal(verticales.length, 2, "el seed agregó exactamente una vertical y correrlo dos veces no la duplica");

  // Conectar cada bandeja a "Chatwoot", como hace scripts/preparar-chatwoot.ts.
  const bandejaDe = async (verticalId: string) => {
    const b = await db.bandeja_chatwoot.findFirstOrThrow({ where: { canal_whatsapp: { vertical_id: verticalId } } });
    const cuenta = randomInt(1_000_000, 2_000_000_000);
    const inbox = randomInt(1_000_000, 2_000_000_000);
    await db.bandeja_chatwoot.update({ where: { id: b.id }, data: { chatwoot_account_id: cuenta, chatwoot_inbox_id: inbox } });
    return { bandejaId: b.id, cuenta, inbox };
  };
  const [v1, v2] = verticales as [(typeof verticales)[number], (typeof verticales)[number]];
  primera = { id: v1.id, nombre: v1.nombre, slug: v1.slug, ...(await bandejaDe(v1.id)) };
  segunda = { id: v2.id, nombre: v2.nombre, slug: v2.slug, ...(await bandejaDe(v2.id)) };

  sucursalesSegunda = (
    await db.sucursal_vertical.findMany({ where: { vertical_id: v2.id, activo: true }, select: { sucursal: { select: { nombre: true } } } })
  )
    .map((f) => f.sucursal.nombre)
    .sort((a, b) => a.localeCompare(b, "es-MX"));
});

after(async () => {
  await prisma.$disconnect();
});

function entorno(vertical: typeof primera, telefono: string) {
  const transporte = new TransporteFalso();
  const deps = { prisma, mensajeria: new MessagingProvider({ transporte }) };
  const conversacion = randomInt(1, 2_000_000_000);
  const evento = (contenido: string): EventoEntrante => {
    const id = String(siguiente++);
    return {
      chatwootAccountId: vertical.cuenta,
      chatwootInboxId: vertical.inbox,
      chatwootConversacionId: conversacion,
      idMensaje: id,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Mamá", telefono },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id },
      numeroReceptor: null,
      crudo: null,
    };
  };
  return { transporte, deps, conversacion, evento };
}

const telefonoNuevo = (): string => `+5215${randomInt(100_000_000, 999_999_999)}`;
const db = () => conAlcance(prisma, orgId);

test("la vertical nueva existe con sus sucursales, su canal y su bandeja, todo por filas", async () => {
  assert.notEqual(segunda.id, primera.id);
  assert.ok(segunda.nombre.length > 0);
  assert.deepEqual(sucursalesSegunda.length > 0, true);
  const canal = await db().canal_whatsapp.findFirstOrThrow({ where: { vertical_id: segunda.id } });
  assert.equal(canal.nombre_publico, segunda.nombre);
});

test("loop completo para la vertical nueva: saludo con SU nombre, sus sucursales, lead de SU vertical y handoff", async () => {
  const { transporte, deps, conversacion, evento } = entorno(segunda, telefonoNuevo());
  for (const t of ["Hola, quiero informes", "Lucía", "7 años", "1"]) {
    assert.equal((await procesarEntrante(deps, evento(t))).resultado, "procesado");
  }

  const textosEnviados = transporte.envios.filter((e) => e.tipo === "mensaje").map((e) => e.texto);
  const opciones = sucursalesSegunda.map((n, i) => ({ id: String(i), nombre: n }));
  assert.deepEqual(textosEnviados.slice(0, 4), [
    textos.saludo(segunda.nombre),
    textos.preguntaNombre,
    textos.preguntaEdad("Lucía"),
    textos.preguntaSucursal(opciones),
  ]);

  const conv = await db().conversacion.findFirstOrThrow({
    where: { bandeja_chatwoot_id: segunda.bandejaId, chatwoot_conversacion_id: conversacion },
    include: { lead: { include: { prospectos: true } } },
  });
  assert.equal(conv.lead.vertical_interes_id, segunda.id);
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.lead.prospectos[0]!.nombre, "Lucía");
  assert.equal(conv.lead.prospectos[0]!.edad_declarada, 7);
  const sucursal = await db().sucursal.findFirstOrThrow({ where: { id: conv.lead.sucursal_interes_id! } });
  assert.equal(sucursal.nombre, sucursalesSegunda[0]);

  const tipos = transporte.envios.map((e) => e.tipo);
  assert.deepEqual(tipos.slice(-2), ["nota_interna", "abrir"]);
  assert.match(transporte.envios.at(-2)!.texto!, new RegExp(`Sucursal: ${sucursalesSegunda[0]}`));
});

test("el mismo número escribe a las dos verticales: dos leads y dos conversaciones, cada una con su vertical", async () => {
  const telefono = telefonoNuevo();
  const uno = entorno(primera, telefono);
  const dos = entorno(segunda, telefono);
  await procesarEntrante(uno.deps, uno.evento("Hola"));
  await procesarEntrante(dos.deps, dos.evento("Hola"));

  assert.equal(uno.transporte.envios[0]!.texto, textos.saludo(primera.nombre));
  assert.equal(dos.transporte.envios[0]!.texto, textos.saludo(segunda.nombre));
  const leads = await db().lead.findMany({ where: { telefono: { not: null }, conversaciones: { some: { chatwoot_conversacion_id: { in: [uno.conversacion, dos.conversacion] } } } } });
  assert.deepEqual(leads.map((l) => l.vertical_interes_id).sort(), [primera.id, segunda.id].sort());
});

test("las reglas son de la organización: una baja en una vertical calla a la otra", async () => {
  const telefono = telefonoNuevo();
  const uno = entorno(primera, telefono);
  const dos = entorno(segunda, telefono);
  await procesarEntrante(uno.deps, uno.evento("STOP"));
  await procesarEntrante(dos.deps, dos.evento("Hola"));
  assert.equal(dos.transporte.envios.length, 0);
});

test("reenganche para la vertical nueva: la misma plantilla de la organización, con el nombre de SU vertical", async () => {
  const telefono = telefonoNuevo();
  const t0 = new Date("2026-10-08T16:00:00Z");
  const { deps, conversacion, evento } = entorno(segunda, telefono);
  await procesarEntrante({ ...deps, mensajeria: new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => t0 }), reloj: () => t0 }, evento("Hola"));

  const transporte = new TransporteFalso();
  const ahora = new Date(t0.getTime() + 26 * 60 * 60 * 1000);
  const r = await correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: orgId });
  assert.ok(r.enviadas >= 1);
  const envio = transporte.envios.find((e) => e.tipo === "plantilla" && e.destino.chatwootConversacionId === conversacion);
  assert.ok(envio, "salió la plantilla a la conversación de la vertical nueva");
  assert.deepEqual(envio.plantilla!.variables, { "1": segunda.nombre });
  assert.ok(envio.texto!.includes(segunda.nombre));
});

test("el reporte separa las verticales por su slug de la tabla", async () => {
  const solo2 = await reporteLeads(db(), { verticalSlug: segunda.slug });
  const solo1 = await reporteLeads(db(), { verticalSlug: primera.slug });
  const todo = await reporteLeads(db());
  assert.ok(solo2.total >= 1);
  assert.ok(solo1.total >= 1);
  assert.equal(solo1.total + solo2.total, todo.total);
});
