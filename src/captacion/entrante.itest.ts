// Loop completo de captación sin credenciales (invariante 11): webhook interpretado → bot →
// MessagingProvider → transporte falso. Contra Postgres real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrisma, type PrismaClient } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { procesarEntrante } from "./entrante.ts";
import { textos } from "./maquina.ts";

let prisma: PrismaClient;
let org: OrganizacionDePrueba;
let siguienteMensaje = randomInt(1_000_000, 2_000_000_000);

before(async () => {
  prisma = crearPrisma();
  org = await sembrarOrganizacion(prisma);
});

after(async () => {
  await prisma.$disconnect();
});

function nuevoEntorno() {
  const transporte = new TransporteFalso();
  const deps = { prisma, mensajeria: new MessagingProvider({ transporte }) };
  const conversacion = randomInt(1, 2_000_000_000);
  const evento = (contenido: string, extra: Partial<EventoEntrante> = {}): EventoEntrante => ({
    chatwootAccountId: org.chatwootAccountId,
    chatwootInboxId: org.chatwootInboxId,
    chatwootConversacionId: conversacion,
    idMensaje: String(siguienteMensaje++),
    contenido,
    estadoConversacion: "pending",
    contacto: { nombre: "Contacto", telefono: `+52155${randomInt(10_000_000, 99_999_999)}` },
    creadoEn: null,
    ...extra,
  });
  return { transporte, deps, conversacion, evento };
}

async function conversacionDe(chatwootConversacionId: number) {
  return conAlcance(prisma, org.organizacionId).conversacion.findFirstOrThrow({
    where: { bandeja_chatwoot_id: org.bandejaId, chatwoot_conversacion_id: chatwootConversacionId },
    include: { lead: true, mensajes: { orderBy: { secuencia: "asc" } } },
  });
}

test("loop completo: tres preguntas, lead con los datos, nota al asesor y conversación abierta", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  const contacto = { nombre: "Mamá", telefono: "+5215512340001" };
  for (const texto of ["Hola, quiero informes", "sofía", "8 años", "2"]) {
    const r = await procesarEntrante(deps, evento(texto, { contacto }));
    assert.equal(r.resultado, "procesado");
  }

  assert.deepEqual(
    transporte.envios.map((e) => [e.tipo, e.texto]),
    [
      ["mensaje", textos.saludo("Vertical Prueba")],
      ["mensaje", textos.preguntaNombre],
      ["mensaje", textos.preguntaEdad("Sofía")],
      ["mensaje", textos.preguntaSucursal(org.sucursales)],
      ["mensaje", textos.cierre("Sofía", "Sur")],
      ["nota_interna", textos.resumenAsesor("captura_completa", { nombre: "Sofía", edad: 8, sucursal: "Sur", telefono: "+525512340001" })],
      ["abrir", undefined],
    ],
  );
  assert.ok(transporte.envios.every((e) => e.destino.chatwootConversacionId === conversacion));

  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.lead.nombre_prospecto, "Sofía");
  assert.equal(conv.lead.edad_declarada, 8);
  assert.equal(conv.lead.sucursal_interes_id, org.sucursales[1]!.id);
  assert.equal(conv.lead.telefono, "+525512340001");
  assert.equal(conv.lead.nombre_contacto, "Mamá");
  assert.equal(conv.mensajes.filter((m) => m.direccion === "entrante").length, 4);
  assert.ok(conv.mensajes.filter((m) => m.direccion !== "entrante").every((m) => m.estatus === "enviado" && m.id_externo));
  assert.ok(conv.ventana_servicio_hasta && conv.ventana_servicio_hasta > new Date());
});

test("con la conversación en_atencion_humana el bot ya no manda nada (invariante 6)", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  for (const texto of ["Hola", "Ana", "10", "1"]) await procesarEntrante(deps, evento(texto));
  const enviosAlPasar = transporte.envios.length;

  const r = await procesarEntrante(deps, evento("¿Siguen ahí?", { estadoConversacion: "open" }));
  assert.equal(r.resultado, "sin_automatizacion");
  assert.equal(transporte.envios.length, enviosAlPasar);
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.mensajes.at(-1)!.cuerpo, "¿Siguen ahí?");
});

test("MessagingProvider bloquea aunque alguien deje un saliente pendiente después del pase", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  for (const texto of ["Hola", "Ana", "10", "1"]) await procesarEntrante(deps, evento(texto));
  const conv = await conversacionDe(conversacion);
  const db = conAlcance(prisma, org.organizacionId);
  await deps.mensajeria.encolar(db, conv.id, [{ tipo: "mensaje", cuerpo: "automatización tardía" }]);
  const antes = transporte.envios.length;

  const resumen = await deps.mensajeria.despachar(db, conv.id);
  assert.deepEqual([resumen.enviados, resumen.bloqueados], [0, 1]);
  assert.equal(transporte.envios.length, antes);
  const bloqueado = await db.mensaje.findFirstOrThrow({ where: { conversacion_id: conv.id, cuerpo: "automatización tardía" } });
  assert.deepEqual([bloqueado.estatus, bloqueado.motivo_bloqueo], ["bloqueado", "atencion_humana"]);
});

test("un asesor que toma la conversación en Chatwoot apaga al bot", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  await procesarEntrante(deps, evento("Hola"));
  const enviados = transporte.envios.length;
  const r = await procesarEntrante(deps, evento("Sofía", { estadoConversacion: "open" }));
  assert.equal(r.resultado, "asesor_tomo_conversacion");
  assert.equal(transporte.envios.length, enviados);
  assert.equal((await conversacionDe(conversacion)).estado, "en_atencion_humana");
});

test("un webhook repetido no duplica mensaje ni respuesta (invariante 8)", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  const hola = evento("Hola");
  assert.equal((await procesarEntrante(deps, hola)).resultado, "procesado");
  const enviados = transporte.envios.length;
  assert.equal((await procesarEntrante(deps, hola)).resultado, "duplicado");
  assert.equal(transporte.envios.length, enviados);
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.mensajes.filter((m) => m.direccion === "entrante").length, 1);
});

test("el mismo número como +521 y +52 produce un solo lead (invariante 7)", async () => {
  const uno = nuevoEntorno();
  const dos = nuevoEntorno();
  await procesarEntrante(uno.deps, uno.evento("Hola", { contacto: { nombre: null, telefono: "+5215598765432" } }));
  await procesarEntrante(dos.deps, dos.evento("Hola", { contacto: { nombre: null, telefono: "+525598765432" } }));
  const c1 = await conversacionDe(uno.conversacion);
  const c2 = await conversacionDe(dos.conversacion);
  assert.notEqual(c1.id, c2.id);
  assert.equal(c1.lead_id, c2.lead_id);
  assert.equal(c1.lead.telefono, "+525598765432");
});

test("si el transporte falla, el mensaje queda fallido y la conversación pasa a un asesor", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  transporte.fallarSi = (e) => e.tipo === "mensaje";
  await procesarEntrante(deps, evento("Hola"));
  assert.deepEqual(transporte.envios.map((e) => e.tipo), ["abrir"]);
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.motivo_pase_asesor, "falla_envio");
  const salientes = conv.mensajes.filter((m) => m.direccion === "saliente");
  assert.deepEqual(salientes.map((m) => [m.estatus, m.motivo_bloqueo]), [["fallido", null], ["bloqueado", "envio_previo_fallido"]]);
});

test("tres respuestas sin entender pasan al asesor con datos parciales", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  for (const texto of ["Hola", "Ana", "x", "y", "z"]) await procesarEntrante(deps, evento(texto));
  assert.equal(transporte.envios.at(-3)!.texto, textos.sinEntender);
  assert.match(transporte.envios.at(-2)!.texto ?? "", /no pudo completar/);
  assert.equal(transporte.envios.at(-1)!.tipo, "abrir");
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.motivo_pase_asesor, "sin_entender");
  assert.equal(conv.lead.nombre_prospecto, "Ana");
});

test("mensajes simultáneos de una conversación nueva crean una sola conversación", async () => {
  const { deps, conversacion, evento } = nuevoEntorno();
  const contacto = { nombre: null, telefono: "+525511122233" };
  const resultados = await Promise.all([evento("Hola", { contacto }), evento("Buenas tardes", { contacto })].map((e) => procesarEntrante(deps, e)));
  assert.deepEqual(resultados.map((r) => r.resultado), ["procesado", "procesado"]);
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.mensajes.filter((m) => m.direccion === "entrante").length, 2);
  const db = conAlcance(prisma, org.organizacionId);
  assert.equal(await db.conversacion.count({ where: { chatwoot_conversacion_id: conversacion, bandeja_chatwoot_id: org.bandejaId } }), 1);
  assert.equal(await db.lead.count({ where: { telefono: "+525511122233" } }), 1);
});

test("un evento de una bandeja que no está dada de alta se ignora", async () => {
  const { deps, evento } = nuevoEntorno();
  const r = await procesarEntrante(deps, evento("Hola", { chatwootInboxId: 1 }));
  assert.equal(r.resultado, "bandeja_desconocida");
});
