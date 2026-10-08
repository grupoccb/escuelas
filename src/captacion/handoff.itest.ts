// Handoff al asesor: conversación a "open" en Chatwoot, resumen a la vista y en_atencion_humana.
// Y la regla de fuera de ventana: sin plantilla apta no se manda nada y se crea una tarea.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conAlcance } from "../datos/alcance.ts";
import { AtribucionSimulada, MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { procesarEntrante } from "./entrante.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Handoff");
});

after(async () => {
  await prisma.$disconnect();
});

function entorno() {
  const transporte = new TransporteFalso();
  const deps = { prisma, mensajeria: new MessagingProvider({ transporte }) };
  const conversacion = randomInt(1, 2_000_000_000);
  const evento = (contenido: string): EventoEntrante => {
    const idMensaje = String(siguiente++);
    return {
      chatwootAccountId: org.chatwootAccountId,
      chatwootInboxId: org.chatwootInboxId,
      chatwootConversacionId: conversacion,
      idMensaje,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Mamá de Prueba", telefono: `+52155${randomInt(10_000_000, 99_999_999)}` },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id: idMensaje },
      numeroReceptor: null,
      crudo: null,
    };
  };
  return { transporte, deps, conversacion, evento };
}

const db = () => conAlcance(prisma, org.organizacionId);
const conversacionDe = (id: number) =>
  db().conversacion.findFirstOrThrow({
    where: { bandeja_chatwoot_id: org.bandejaId, chatwoot_conversacion_id: id },
    include: { lead: true, mensajes: { orderBy: { secuencia: "asc" } } },
  });

test("handoff: la nota con el resumen sale ANTES de abrir la conversación; queda en atención humana y con interacción", async () => {
  const { transporte, deps, conversacion, evento } = entorno();
  for (const t of ["Hola", "Sofía", "8", "2"]) await procesarEntrante(deps, evento(t));

  const tipos = transporte.envios.map((e) => e.tipo);
  assert.equal(tipos.at(-1), "abrir");
  assert.equal(tipos.at(-2), "nota_interna");
  assert.equal(tipos.filter((t) => t === "abrir").length, 1);

  const nota = transporte.envios.at(-2)!.texto!;
  for (const esperado of ["Nombre: Sofía", "Edad: 8", "Sucursal: Sur", "Contacto: Mamá de Prueba", "Origen: directo, sin anuncio"]) {
    assert.ok(nota.includes(esperado), `la nota debe incluir "${esperado}":\n${nota}`);
  }

  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.pasar_a_asesor_pendiente, false);
  const pases = await db().interaccion.findMany({ where: { lead_id: conv.lead_id, tipo: "pase_a_asesor" } });
  assert.equal(pases.length, 1);
  assert.deepEqual(pases[0]!.datos, { motivo: "captura_completa" });
});

test("el resumen incluye el anuncio y la campaña de origen", async () => {
  const anuncioId = `ad-${randomInt(1e9)}`;
  await prisma.campana.create({ data: { organizacion_id: org.organizacionId, nombre: "Campaña Octubre", origen: "facebook", anuncio_id: anuncioId } });
  const { transporte, deps, evento } = entorno();
  const fuente = new AtribucionSimulada();
  const primero = evento("Hola");
  fuente.programar(primero.idMensaje, { anuncioId, ctwaClid: "c", anuncioTitulo: "Titular", tipoOrigen: "ad", urlOrigen: null, crudo: {} });
  await procesarEntrante({ ...deps, atribucion: fuente }, primero);
  for (const t of ["Luis", "9", "1"]) await procesarEntrante(deps, evento(t));

  const nota = transporte.envios.find((e) => e.tipo === "nota_interna")!.texto!;
  assert.match(nota, /Origen: Anuncio «Titular» · campaña «Campaña Octubre»/);
});

test("handoff por no entender: el motivo queda en la interacción y los datos parciales en la nota", async () => {
  const { transporte, deps, conversacion, evento } = entorno();
  for (const t of ["Hola", "Ana", "x", "y", "z"]) await procesarEntrante(deps, evento(t));
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "en_atencion_humana");
  const pase = await db().interaccion.findFirstOrThrow({ where: { lead_id: conv.lead_id, tipo: "pase_a_asesor" } });
  assert.deepEqual(pase.datos, { motivo: "sin_entender" });
  assert.match(transporte.envios.find((e) => e.tipo === "nota_interna")!.texto!, /Nombre: Ana/);
});

test("fuera de la ventana de servicio y sin plantilla apta: no se manda nada y se crea UNA tarea para el asesor (invariante 5)", async () => {
  const { transporte, deps, conversacion, evento } = entorno();
  const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  // El contacto escribió hace 48 h: su ventana de 24 h ya venció cuando el bot quiere contestar.
  await procesarEntrante({ ...deps, reloj: () => hace48h }, evento("Hola"));
  await procesarEntrante({ ...deps, reloj: () => hace48h }, evento("Ana"));

  assert.equal(transporte.envios.filter((e) => e.tipo === "mensaje").length, 0, "no sale ningún mensaje libre");
  const conv = await conversacionDe(conversacion);
  const bloqueados = conv.mensajes.filter((m) => m.direccion === "saliente");
  assert.ok(bloqueados.length >= 2);
  assert.ok(bloqueados.every((m) => m.estatus === "bloqueado" && m.motivo_bloqueo === "fuera_de_ventana"));

  const tareas = await db().tarea_asesor.findMany({ where: { conversacion_id: conv.id } });
  assert.equal(tareas.length, 1, "los reintentos no llenan la bandeja del asesor");
  assert.equal(tareas[0]!.tipo, "sin_plantilla_apta");
  assert.equal(tareas[0]!.estado, "pendiente");
  assert.match(tareas[0]!.descripcion, /ventana de servicio/);
  assert.equal(tareas[0]!.lead_id, conv.lead_id);
});

test("con un asesor atendiendo no se crea tarea de plantilla: el bloqueo es por atención humana (invariante 6)", async () => {
  const { transporte, deps, conversacion, evento } = entorno();
  for (const t of ["Hola", "Ana", "6", "1"]) await procesarEntrante(deps, evento(t));
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "en_atencion_humana");
  const envios = transporte.envios.length;

  // Alguien deja un saliente pendiente con la ventana vencida y un asesor atendiendo.
  await db().conversacion.update({ where: { id: conv.id }, data: { ventana_servicio_hasta: new Date(Date.now() - 1000) } });
  await deps.mensajeria.encolar(db(), conv.id, [{ tipo: "mensaje", cuerpo: "recordatorio" }]);
  await deps.mensajeria.despachar(db(), conv.id);

  assert.equal(transporte.envios.length, envios);
  const bloqueado = (await conversacionDe(conversacion)).mensajes.find((m) => m.cuerpo === "recordatorio")!;
  assert.equal(bloqueado.motivo_bloqueo, "atencion_humana");
  assert.equal(await db().tarea_asesor.count({ where: { conversacion_id: conv.id, tipo: "sin_plantilla_apta" } }), 0);
});
