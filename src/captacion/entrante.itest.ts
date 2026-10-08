// Loop completo de captación sin credenciales (invariante 11): webhook interpretado → bot →
// MessagingProvider → transporte falso. Contra Postgres real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrisma, type PrismaClient } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { AtribucionSimulada, MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
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
  const evento = (contenido: string, extra: Partial<EventoEntrante> = {}): EventoEntrante => {
    const idMensaje = extra.idMensaje ?? String(siguienteMensaje++);
    return {
      chatwootAccountId: org.chatwootAccountId,
      chatwootInboxId: org.chatwootInboxId,
      chatwootConversacionId: conversacion,
      idMensaje,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Contacto", telefono: `+52155${randomInt(10_000_000, 99_999_999)}` },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id: idMensaje },
      numeroReceptor: null,
      crudo: null,
      ...extra,
    };
  };
  return { transporte, deps, conversacion, evento };
}

async function conversacionDe(chatwootConversacionId: number) {
  return conAlcance(prisma, org.organizacionId).conversacion.findFirstOrThrow({
    where: { bandeja_chatwoot_id: org.bandejaId, chatwoot_conversacion_id: chatwootConversacionId },
    include: { lead: { include: { prospectos: { where: { eliminado_en: null } } } }, mensajes: { orderBy: { secuencia: "asc" } } },
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
      ["nota_interna", textos.resumenAsesor("captura_completa", { nombre: "Sofía", edad: 8, sucursal: "Sur", telefono: "+525512340001", contacto: "Mamá", origen: null })],
      ["abrir", undefined],
    ],
  );
  assert.ok(transporte.envios.every((e) => e.destino.chatwootConversacionId === conversacion));

  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.lead.prospectos.length, 1);
  assert.equal(conv.lead.prospectos[0]!.nombre, "Sofía");
  assert.equal(conv.lead.prospectos[0]!.edad_declarada, 8);
  assert.equal(conv.lead.prospectos[0]!.origen, "bot");
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

test("una conversación `open` en Chatwoot SIN asesor sigue siendo del bot: el sistema mismo la abre (A3)", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  await procesarEntrante(deps, evento("Hola"));
  const enviados = transporte.envios.length;
  const r = await procesarEntrante(deps, evento("Sofía", { estadoConversacion: "open" }));
  assert.equal(r.resultado, "procesado");
  assert.ok(transporte.envios.length > enviados, "el bot contesta y sigue la captura");
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "bot");
  assert.equal(conv.paso_captacion, "edad");
});

test("respaldo: si el mensaje del contacto llega con la conversación asignada a una PERSONA, se apaga al bot", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  await procesarEntrante(deps, evento("Hola"));
  const enviados = transporte.envios.length;
  const r = await procesarEntrante(deps, evento("Sofía", { estadoConversacion: "open", asignadaAPersona: true }));
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
  assert.equal(conv.lead.prospectos[0]!.nombre, "Ana");
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

test("entrada por anuncio: el lead guarda la atribución, la campaña se enlaza y las dos ventanas son distintas (invariante 5)", async () => {
  const anuncioId = `ad-${randomInt(1e9)}`;
  const campana = await prisma.campana.create({ data: { organizacion_id: org.organizacionId, nombre: "Campaña de prueba", origen: "facebook", anuncio_id: anuncioId } });
  const { deps, conversacion, evento } = nuevoEntorno();
  const fuente = new AtribucionSimulada();
  const ahora = new Date("2026-10-08T15:00:00Z");
  const primero = evento("Hola, vi su anuncio");
  fuente.programar(primero.idMensaje, {
    anuncioId,
    ctwaClid: "clid-1",
    anuncioTitulo: "Titular del anuncio",
    tipoOrigen: "ad",
    urlOrigen: "https://fb.me/x",
    crudo: { source_id: anuncioId, ctwa_clid: "clid-1" },
  });
  await procesarEntrante({ ...deps, atribucion: fuente, reloj: () => ahora }, primero);

  const conv = await conversacionDe(conversacion);
  assert.equal(conv.lead.anuncio_id, anuncioId);
  assert.equal(conv.lead.ctwa_clid, "clid-1");
  assert.equal(conv.lead.anuncio_titulo, "Titular del anuncio");
  assert.equal(conv.lead.campana_id, campana.id);
  assert.deepEqual(conv.lead.atribucion, { source_id: anuncioId, ctwa_clid: "clid-1" });
  assert.equal(conv.ventana_servicio_hasta?.toISOString(), "2026-10-09T15:00:00.000Z");
  assert.equal(conv.ventana_gratis_hasta?.toISOString(), "2026-10-11T15:00:00.000Z");
});

test("un mensaje que no viene de un anuncio no abre ventana gratis ni guarda atribución", async () => {
  const { deps, conversacion, evento } = nuevoEntorno();
  await procesarEntrante({ ...deps, atribucion: new AtribucionSimulada() }, evento("Hola"));
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.ventana_gratis_hasta, null);
  assert.equal(conv.lead.ctwa_clid, null);
  assert.equal(conv.lead.campana_id, null);
  assert.ok(conv.ventana_servicio_hasta);
});

test("el lead conserva la atribución de su primer contacto aunque vuelva por otro anuncio", async () => {
  const telefono = `+52155${randomInt(10_000_000, 99_999_999)}`;
  const fuente = new AtribucionSimulada();
  const atribucion = (anuncioId: string) => ({ anuncioId, ctwaClid: `clid-${anuncioId}`, anuncioTitulo: null, tipoOrigen: "ad", urlOrigen: null, crudo: { source_id: anuncioId } });

  const uno = nuevoEntorno();
  const e1 = uno.evento("Hola", { contacto: { nombre: "Mamá", telefono } });
  fuente.programar(e1.idMensaje, atribucion("primero"));
  await procesarEntrante({ ...uno.deps, atribucion: fuente }, e1);

  const dos = nuevoEntorno();
  const e2 = dos.evento("Hola otra vez", { contacto: { nombre: "Mamá", telefono } });
  fuente.programar(e2.idMensaje, atribucion("segundo"));
  await procesarEntrante({ ...dos.deps, atribucion: fuente }, e2);

  const c1 = await conversacionDe(uno.conversacion);
  const c2 = await conversacionDe(dos.conversacion);
  assert.equal(c1.lead_id, c2.lead_id);
  assert.equal(c2.lead.anuncio_id, "primero");
  // La nueva conversación sí es una entrada por anuncio: tiene su propia ventana gratis.
  assert.ok(c2.ventana_gratis_hasta);
});

test("idempotencia por MessageSid: un reintento de Twilio con otro id de Chatwoot no duplica (H2)", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  const sid = `SM${randomInt(1e9)}`;
  const llave = { proveedor: "twilio", id: sid };
  const primero = evento("Hola", { llave });
  const reintento = evento("Hola", { llave });
  assert.notEqual(primero.idMensaje, reintento.idMensaje);

  assert.equal((await procesarEntrante(deps, primero)).resultado, "procesado");
  const enviados = transporte.envios.length;
  assert.equal((await procesarEntrante(deps, reintento)).resultado, "duplicado");

  const conv = await conversacionDe(conversacion);
  assert.equal(conv.mensajes.filter((m) => m.direccion === "entrante").length, 1);
  assert.equal(transporte.envios.length, enviados);
});

test("vertical por número receptor: si la bandeja no se reconoce, el número del canal la resuelve", async () => {
  const numero = `+1555${randomInt(1_000_000, 9_999_999)}`;
  await prisma.canal_whatsapp.update({ where: { id: org.canalId }, data: { numero_whatsapp: `whatsapp:${numero}` } });
  const { deps, conversacion, evento } = nuevoEntorno();

  const desconocida = evento("Hola", { chatwootInboxId: 1, numeroReceptor: "whatsapp:+99999999999" });
  assert.equal((await procesarEntrante(deps, desconocida)).resultado, "bandeja_desconocida");

  const porNumero = evento("Hola", { chatwootInboxId: 1, numeroReceptor: `whatsapp:${numero}` });
  assert.equal((await procesarEntrante(deps, porNumero)).resultado, "procesado");
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.lead.vertical_interes_id, org.verticalId);
  assert.equal(conv.bandeja_chatwoot_id, org.bandejaId);
});

test("F1-13: un entrante tardío (reintento de un mensaje anterior) no acorta la ventana de servicio", async () => {
  const { deps, conversacion, evento } = nuevoEntorno();
  const t = new Date("2026-10-08T12:00:00Z");
  const hora = (h: number) => new Date(t.getTime() + h * 3_600_000);
  const reloj = () => hora(5);
  await procesarEntrante({ ...deps, reloj }, evento("Hola", { creadoEn: hora(4) }));
  const despuesDelPrimero = await conversacionDe(conversacion);
  assert.equal(despuesDelPrimero.ventana_servicio_hasta?.toISOString(), hora(28).toISOString());

  // Llega, tarde, un mensaje que el contacto escribió ANTES (t+1 h).
  await procesarEntrante({ ...deps, reloj }, evento("mensaje viejo", { creadoEn: hora(1) }));
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.ventana_servicio_hasta?.toISOString(), hora(28).toISOString(), "la ventana se queda con el máximo");
  assert.equal(conv.ultimo_mensaje_entrante_en?.toISOString(), hora(4).toISOString());

  // Uno posterior sí la extiende.
  await procesarEntrante({ ...deps, reloj }, evento("mensaje nuevo", { creadoEn: hora(4.5) }));
  assert.equal((await conversacionDe(conversacion)).ventana_servicio_hasta?.toISOString(), hora(28.5).toISOString());
});

test("F1-05: un mensaje de un lead borrado se ignora (sin error, sin registrar ni contestar)", async () => {
  const { transporte, deps, conversacion, evento } = nuevoEntorno();
  await procesarEntrante(deps, evento("Hola"));
  const antes = await conversacionDe(conversacion);
  await conAlcance(prisma, org.organizacionId).lead.update({ where: { id: antes.lead_id }, data: { eliminado_en: new Date() } });
  const envios = transporte.envios.length;

  const r = await procesarEntrante(deps, evento("¿Siguen ahí?"));
  assert.equal(r.resultado, "ignorado");
  assert.equal(r.conversacionId, antes.id);
  assert.equal(transporte.envios.length, envios);
  const despues = await conversacionDe(conversacion);
  assert.equal(despues.mensajes.length, antes.mensajes.length, "no se registra nada");
  assert.equal(despues.version, antes.version);
});
