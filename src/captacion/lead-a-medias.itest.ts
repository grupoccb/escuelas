// A3: lead a medias. A los 30 minutos la conversación se vuelve visible para los asesores (nota con
// los datos parciales + abierta en Chatwoot) SIN pasar a `en_atencion_humana`. Mientras nadie la
// tome, el bot continúa la captura si el contacto regresa y el reenganche de 25 h puede salir.
// Contra Postgres real y el transporte falso.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conAlcance } from "../datos/alcance.ts";
import { correrAutomatizaciones } from "../automatizaciones/motor.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { procesarEntrante } from "./entrante.ts";
import { barrerTiemposDeEspera, TIEMPO_ESPERA_MS } from "./espera.ts";
import { textos } from "./maquina.ts";

let prisma: PrismaPruebas;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const MIN = 60 * 1000;
const HORA = 60 * MIN;
/** 8-oct-2026 10:00 hora de Ciudad de México (UTC-6). */
const T0 = new Date("2026-10-08T16:00:00Z");
const despues = (ms: number): Date => new Date(T0.getTime() + ms);

async function escenario(opc: { conReenganche?: boolean } = {}) {
  const o = await sembrarOrganizacion(prisma, "LeadAMedias");
  const db = conAlcance(prisma, o.organizacionId);
  const transporte = new TransporteFalso();
  const proveedor = (ahora: Date) => new MessagingProvider({ transporte, reloj: () => ahora });
  const conversacion = randomInt(1, 2_000_000_000);
  const telefono = `+5255${randomInt(10_000_000, 99_999_999)}`;
  const evento = (contenido: string): EventoEntrante => {
    const id = String(siguiente++);
    return {
      chatwootAccountId: o.chatwootAccountId,
      chatwootInboxId: o.chatwootInboxId,
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
  /** El contacto escribe `contenido` en el instante `cuando`. */
  const escribe = (contenido: string, cuando: Date) => procesarEntrante({ prisma, mensajeria: proveedor(cuando), reloj: () => cuando }, evento(contenido));
  const barrer = (cuando: Date, mensajeria = proveedor(cuando)) => barrerTiemposDeEspera({ prisma, mensajeria, organizacionId: o.organizacionId, reloj: () => cuando });
  const conv = () => db.conversacion.findFirstOrThrow({ where: { bandeja_chatwoot_id: o.bandejaId, chatwoot_conversacion_id: conversacion }, include: { lead: true } });
  const notas = () => transporte.envios.filter((e) => e.tipo === "nota_interna" && /dejó de contestar/.test(e.texto ?? ""));
  const aperturas = () => transporte.envios.filter((e) => e.tipo === "abrir");
  const plantillas = () => transporte.envios.filter((e) => e.tipo === "plantilla");

  if (opc.conReenganche) {
    const plantilla = await prisma.plantilla_mensaje.create({
      data: {
        organizacion_id: o.organizacionId,
        codigo: "reenganche",
        content_sid: "HX00000000000000000000000000000000",
        categoria: "utility",
        estado_aprobacion: "aprobada",
        cuerpo_referencia: "Hola, quedó pendiente tu consulta sobre {{1}}.",
        variables: [{ pos: 1, nombre: "nombre_vertical" }] as never,
      },
    });
    await prisma.automatizacion.create({
      data: { organizacion_id: o.organizacionId, nombre: "Reenganche", evento_disparador: "lead_sin_respuesta", offset_minutos: 1500, plantilla_id: plantilla.id },
    });
  }
  const motor = (ahora: Date) => correrAutomatizaciones({ prisma, mensajeria: proveedor(ahora), reloj: () => ahora, organizacionId: o.organizacionId });

  // El contacto da su nombre y se queda callado.
  await escribe("Hola", T0);
  await escribe("Ana", T0);
  return { o, db, transporte, proveedor, escribe, barrer, conv, notas, aperturas, plantillas, motor };
}

test("a los 30 min sin respuesta: nota con datos parciales y abierta en Chatwoot, pero el estado sigue siendo `bot`", async () => {
  const s = await escenario();
  assert.equal(TIEMPO_ESPERA_MS, 30 * MIN);

  assert.equal(await s.barrer(despues(30 * MIN - 1000)), 0, "todavía no");
  assert.equal(s.notas().length, 0);

  const mensajesAntes = s.transporte.envios.filter((e) => e.tipo === "mensaje").length;
  assert.equal(await s.barrer(despues(31 * MIN)), 1);
  const conv = await s.conv();
  assert.equal(conv.estado, "bot", "visible no es atendido");
  assert.equal(conv.paso_captacion, "edad");
  assert.ok(conv.visible_a_asesores_en && conv.abierta_para_asesores_en);
  assert.equal(s.notas().length, 1);
  assert.match(s.notas()[0]!.texto!, /Nombre: Ana/);
  assert.equal(s.aperturas().length, 1);
  // La nota sale antes de abrir la conversación.
  const tipos = s.transporte.envios.map((e) => e.tipo);
  assert.ok(tipos.lastIndexOf("nota_interna") < tipos.lastIndexOf("abrir"));
  // Al contacto no se le escribe nada.
  assert.equal(s.transporte.envios.filter((e) => e.tipo === "mensaje").length, mensajesAntes, "no sale ningún mensaje nuevo al contacto");
});

test("(ii) si el contacto regresa, el bot CONTINÚA la captura donde iba, y al terminar pasa al asesor como siempre", async () => {
  const s = await escenario();
  await s.barrer(despues(31 * MIN));
  const mensajesAntes = s.transporte.envios.filter((e) => e.tipo === "mensaje").length;

  const r = await s.escribe("7", despues(40 * MIN));
  assert.equal(r.resultado, "procesado");
  const conv = await s.conv();
  assert.equal(conv.estado, "bot");
  assert.equal(conv.paso_captacion, "sucursal", "siguió con la edad y pregunta la sucursal");
  const nuevos = s.transporte.envios.filter((e) => e.tipo === "mensaje").slice(mensajesAntes);
  assert.deepEqual(nuevos.map((e) => e.texto), [textos.preguntaSucursal(s.o.sucursales)]);

  // La captura completa no cambia: nota con los datos, conversación abierta y `en_atencion_humana`.
  await s.escribe("2", despues(41 * MIN));
  const fin = await s.conv();
  assert.equal(fin.estado, "en_atencion_humana");
  assert.equal(fin.paso_captacion, "completo");
  assert.ok(s.transporte.envios.some((e) => e.tipo === "nota_interna" && /Datos capturados por el bot/.test(e.texto ?? "")));
});

test("(iii) el reenganche de 25 h puede salir mientras nadie la haya tomado, aunque ya fuera visible", async () => {
  const s = await escenario({ conReenganche: true });
  await s.barrer(despues(31 * MIN));
  assert.equal((await s.conv()).estado, "bot");

  const r = await s.motor(despues(26 * HORA));
  assert.equal(r.programadas, 1);
  assert.equal(r.enviadas, 1);
  assert.equal(s.plantillas().length, 1);
  assert.equal(s.plantillas()[0]!.texto, "Hola, quedó pendiente tu consulta sobre Vertical Prueba.");
});

test("(v) el aviso de los 30 min es idempotente: barridos repetidos o simultáneos no avisan dos veces", async () => {
  const s = await escenario();
  const cuando = despues(31 * MIN);
  // Carrera REAL (EA-08): las tres transacciones leen la conversación sin avisar ANTES de que
  // cualquiera la marque. Sin la marca condicional (versión y `visible_a_asesores_en` vacío) se
  // enviarían tres notas.
  const barrera = new Barrera(3);
  const raiz = conGanchos(prisma, {
    modelo: "conversacion",
    operacion: "updateMany",
    // La marca del aviso: el updateMany que escribe `visible_a_asesores_en`.
    cuando: (args) => (args["data"] as { visible_a_asesores_en?: unknown } | undefined)?.visible_a_asesores_en !== undefined,
    antes: () => barrera.esperar(),
  });
  const barrerCon = () => barrerTiemposDeEspera({ prisma: raiz, mensajeria: s.proveedor(cuando), organizacionId: s.o.organizacionId, reloj: () => cuando });
  const hechas = await Promise.all([barrerCon(), barrerCon(), barrerCon()]);
  assert.equal(barrera.completa, true, "las tres leyeron la conversación sin avisar antes de marcarla");
  assert.equal(hechas.reduce((n, h) => n + h, 0), 1, "una sola conversación avisada en total");
  assert.equal(s.notas().length, 1);
  assert.equal(s.aperturas().length, 1);

  for (const mas of [32 * MIN, 5 * HORA, 30 * HORA]) assert.equal(await s.barrer(despues(mas)), 0);
  assert.equal(s.notas().length, 1);
  assert.equal(s.aperturas().length, 1);
});

test("abrirParaAsesores no abre una conversación que ya no es del bot (A3m)", async () => {
  const s = await escenario();
  const conv = await s.conv();
  const provider = s.proveedor(despues(31 * MIN));
  for (const estado of ["en_atencion_humana", "opt_out", "cerrada"] as const) {
    await s.db.conversacion.update({ where: { id: conv.id }, data: { estado } });
    assert.equal(await provider.abrirParaAsesores(s.db, conv.id), false, estado);
  }
  assert.equal(s.aperturas().length, 0, "no se tocó Chatwoot");
  await s.db.conversacion.update({ where: { id: conv.id }, data: { estado: "bot" } });
  assert.equal(await provider.abrirParaAsesores(s.db, conv.id), true);
  assert.equal(s.aperturas().length, 1);
});

test("si el contacto vuelve y se calla otra vez, no se avisa de nuevo", async () => {
  const s = await escenario();
  await s.barrer(despues(31 * MIN));
  await s.escribe("7", despues(40 * MIN));
  assert.equal(await s.barrer(despues(2 * HORA)), 0);
  assert.equal(s.notas().length, 1);
});

test("si Chatwoot no la abre, el aviso ya salió y solo se reintenta la apertura", async () => {
  const s = await escenario();
  s.transporte.fallarSi = (e) => e.tipo === "abrir";
  assert.equal(await s.barrer(despues(31 * MIN)), 1);
  let conv = await s.conv();
  assert.ok(conv.visible_a_asesores_en);
  assert.equal(conv.abierta_para_asesores_en, null);
  assert.equal(conv.estado, "bot");
  assert.equal(s.notas().length, 1);

  s.transporte.fallarSi = undefined;
  await s.barrer(despues(31 * MIN + 30_000));
  assert.equal(s.aperturas().length, 0, "no se reintenta de inmediato: da tiempo a que termine quien avisó");
  assert.equal(await s.barrer(despues(32 * MIN)), 0, "no es un aviso nuevo");
  conv = await s.conv();
  assert.ok(conv.abierta_para_asesores_en);
  assert.equal(s.aperturas().length, 1);
  assert.equal(s.notas().length, 1, "la nota no se repite");
});

test("no avisa si la captura ya terminó, está dada de baja o la conversación es nueva", async () => {
  const s = await escenario();
  await s.escribe("BAJA", despues(1 * MIN));
  assert.equal(await s.barrer(despues(2 * HORA)), 0);
  assert.equal(s.notas().length, 0);

  const nueva = await escenario();
  assert.equal(await nueva.barrer(despues(10 * MIN)), 0, "recién creada: aún dentro de los 30 min");
});
