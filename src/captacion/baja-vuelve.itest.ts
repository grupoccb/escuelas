// A4: alguien dado de baja que vuelve a escribir. El sistema calla (ni siquiera repite la
// confirmación de baja) y deja UNA tarea pendiente por conversación para el asesor. Contra
// Postgres real y el transporte falso (invariante 11).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { crearPrisma, type PrismaClient } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { procesarEntrante } from "./entrante.ts";

let prisma: PrismaClient;
let org: OrganizacionDePrueba;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(async () => {
  prisma = crearPrisma();
  org = await sembrarOrganizacion(prisma, "BajaVuelve");
});
after(async () => {
  await prisma.$disconnect();
});

function entorno(
  o: OrganizacionDePrueba = org,
  telefono = `+52155${randomInt(10_000_000, 99_999_999)}`,
  bandeja = { cuenta: o.chatwootAccountId, inbox: o.chatwootInboxId },
) {
  const transporte = new TransporteFalso();
  const deps = { prisma, mensajeria: new MessagingProvider({ transporte }) };
  const conversacion = randomInt(1, 2_000_000_000);
  const evento = (contenido: string): EventoEntrante => {
    const idMensaje = String(siguiente++);
    return {
      chatwootAccountId: bandeja.cuenta,
      chatwootInboxId: bandeja.inbox,
      chatwootConversacionId: conversacion,
      idMensaje,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Contacto", telefono },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id: idMensaje },
      numeroReceptor: null,
      crudo: null,
    };
  };
  return { transporte, deps, conversacion, evento, telefono: normalizarTelefono(telefono)!, o };
}

type Entorno = ReturnType<typeof entorno>;
const db = (o: OrganizacionDePrueba = org) => conAlcance(prisma, o.organizacionId);
const alContacto = (t: TransporteFalso) => t.envios.filter((e) => e.tipo === "mensaje" || e.tipo === "plantilla");
const tareasDe = (e: Entorno, conversacionId: string) =>
  db(e.o).tarea_asesor.findMany({ where: { conversacion_id: conversacionId, tipo: "baja_volvio_a_escribir" }, orderBy: { creado_en: "asc" } });

async function dadoDeBaja(e: Entorno) {
  const { conversacionId } = await procesarEntrante(e.deps, e.evento("BAJA"));
  assert.ok(conversacionId);
  return conversacionId;
}

test("baja y vuelve a escribir: una tarea para el asesor y el sistema no contesta nada", async () => {
  const e = entorno();
  const conversacionId = await dadoDeBaja(e);
  const tras = e.transporte.envios.length; // la confirmación de baja, una sola vez

  const r = await procesarEntrante(e.deps, e.evento("Hola, ¿hay clases mañana?"));
  assert.equal(r.resultado, "baja_volvio_a_escribir");
  assert.equal(e.transporte.envios.length, tras, "no sale nada, ni la confirmación de baja otra vez");

  const tareas = await tareasDe(e, conversacionId);
  assert.equal(tareas.length, 1);
  assert.equal(tareas[0]!.estado, "pendiente");
  assert.match(tareas[0]!.descripcion, /¿hay clases mañana\?/);
  assert.equal(
    await db(e.o).mensaje.count({ where: { conversacion_id: conversacionId, direccion: "entrante" } }),
    2,
    "el mensaje del contacto sí queda registrado",
  );
  const conv = await db(e.o).conversacion.findUniqueOrThrow({ where: { id: conversacionId } });
  assert.equal(conv.estado, "opt_out", "el bot no se reactiva");
  assert.equal(await db(e.o).consentimiento.count({ where: { telefono: e.telefono, estado: "opt_out" } }), 1, "no se registra otra baja");
});

test("escribe otra vez: sigue siendo una sola tarea pendiente", async () => {
  const e = entorno();
  const conversacionId = await dadoDeBaja(e);
  for (const texto of ["Hola", "¿Me contestan?", "ALTO", "Por favor"]) {
    assert.equal((await procesarEntrante(e.deps, e.evento(texto))).resultado, "baja_volvio_a_escribir", texto);
  }
  assert.equal((await tareasDe(e, conversacionId)).length, 1);
  assert.equal(alContacto(e.transporte).length, 1, "solo la confirmación de baja original");
});

test("una palabra de baja repetida NO es volver a escribir: no crea tarea ni vuelve a confirmar", async () => {
  const e = entorno();
  const conversacionId = await dadoDeBaja(e);
  const tras = e.transporte.envios.length;
  for (const palabra of ["BAJA", "stop", "Cancelar", "NO MOLESTAR"]) {
    assert.equal((await procesarEntrante(e.deps, e.evento(palabra))).resultado, "baja", palabra);
  }
  assert.equal((await tareasDe(e, conversacionId)).length, 0);
  assert.equal(e.transporte.envios.length, tras);
});

test("el asesor la resuelve y el contacto vuelve a escribir: tarea nueva", async () => {
  const e = entorno();
  const conversacionId = await dadoDeBaja(e);
  await procesarEntrante(e.deps, e.evento("Hola"));
  const [primera] = await tareasDe(e, conversacionId);
  await db(e.o).tarea_asesor.update({ where: { id: primera!.id }, data: { estado: "hecha", resuelta_en: new Date() } });

  await procesarEntrante(e.deps, e.evento("¿Hola? sigo aquí"));
  const tareas = await tareasDe(e, conversacionId);
  assert.equal(tareas.length, 2);
  assert.deepEqual(tareas.map((t) => t.estado), ["hecha", "pendiente"]);
  // Y vuelve a ser una sola pendiente mientras no se resuelva.
  await procesarEntrante(e.deps, e.evento("¿Alguien?"));
  assert.equal((await tareasDe(e, conversacionId)).length, 2);
});

test("la baja es por organización: escribe a otra vertical de la misma organización y también hay tarea y silencio", async () => {
  const uno = entorno();
  await dadoDeBaja(uno);

  const vertical = await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Otra", slug: `otra-${randomUUID().slice(0, 6)}` } });
  const canal = await prisma.canal_whatsapp.create({ data: { organizacion_id: org.organizacionId, vertical_id: vertical.id, nombre_publico: "Otra" } });
  const bandeja2 = { cuenta: org.chatwootAccountId, inbox: randomInt(1_000_000, 2_000_000_000) };
  await prisma.bandeja_chatwoot.create({
    data: { organizacion_id: org.organizacionId, canal_whatsapp_id: canal.id, nombre: "Otra", chatwoot_account_id: bandeja2.cuenta, chatwoot_inbox_id: bandeja2.inbox },
  });

  const dos = entorno(org, uno.telefono, bandeja2);
  const r = await procesarEntrante(dos.deps, dos.evento("Hola, quiero informes"));
  assert.equal(r.resultado, "baja_volvio_a_escribir");
  assert.equal(dos.transporte.envios.length, 0, "ni respuestas del bot ni confirmaciones");
  assert.equal((await tareasDe(dos, r.conversacionId!)).length, 1);
  const conv = await db().conversacion.findUniqueOrThrow({ where: { id: r.conversacionId! } });
  assert.equal(conv.estado, "opt_out", "la conversación nueva nace sin bot");
  assert.equal(conv.paso_captacion, "inicio", "el bot no avanzó");
});

test("la baja de otra organización no afecta: el mismo teléfono es atendido normal", async () => {
  const otra = await sembrarOrganizacion(prisma, "BajaVuelveOtra");
  const a = entorno(org);
  await dadoDeBaja(a);

  const b = entorno(otra, a.telefono);
  const r = await procesarEntrante(b.deps, b.evento("Hola"));
  assert.equal(r.resultado, "procesado");
  assert.ok(alContacto(b.transporte).length >= 1, "el bot contesta");
  assert.equal((await tareasDe(b, r.conversacionId!)).length, 0);
});

test("dos mensajes simultáneos de quien se dio de baja: una sola tarea", async () => {
  for (let i = 0; i < 4; i++) {
    const e = entorno();
    const conversacionId = await dadoDeBaja(e);
    await Promise.all([procesarEntrante(e.deps, e.evento("uno")), procesarEntrante(e.deps, e.evento("dos")), procesarEntrante(e.deps, e.evento("tres"))]);
    assert.equal((await tareasDe(e, conversacionId)).length, 1, `vuelta ${i}`);
  }
});

test("con una persona atendiendo, quien se dio de baja y escribe también deja tarea y el sistema calla", async () => {
  const e = entorno();
  for (const t of ["Hola", "Ana", "6", "1"]) await procesarEntrante(e.deps, e.evento(t));
  const conversacionId = (await db(e.o).conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: e.conversacion } })).id;
  assert.equal((await db(e.o).conversacion.findUniqueOrThrow({ where: { id: conversacionId } })).estado, "en_atencion_humana");
  await procesarEntrante(e.deps, e.evento("BAJA"));
  const envios = e.transporte.envios.length;

  const r = await procesarEntrante(e.deps, e.evento("¿Me pueden llamar?"));
  assert.equal(r.resultado, "baja_volvio_a_escribir");
  assert.equal(e.transporte.envios.length, envios);
  assert.equal((await tareasDe(e, conversacionId)).length, 1);
  assert.equal((await db(e.o).conversacion.findUniqueOrThrow({ where: { id: conversacionId } })).estado, "en_atencion_humana", "la persona sigue atendiendo");
});
