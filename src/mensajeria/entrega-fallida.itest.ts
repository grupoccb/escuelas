// A5: entrega fallida (tarea con el código de error, una por mensaje), estados de entrega que
// llegan antes del id del mensaje (F1-03a) y envío con resultado desconocido (F1-03b).
// Contra Postgres real y el transporte falso configurable.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { altaConAlcance, conAlcance } from "../datos/alcance.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { sembrarEntrante, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { Barrera, conGanchos, dormir } from "../testutil/carrera.ts";
import {
  ENVIO_INCIERTO,
  MessagingProvider,
  TransporteFalso,
  barrerEventosEntrega,
  registrarEstadoEntrega,
  respuestaA,
  type CambioDeEstado,
  type EventoEntrante,
} from "./index.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let otra: OrganizacionDePrueba;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "EntregaFallida");
  otra = await sembrarOrganizacion(prisma, "EntregaFallidaOtra");
});
after(async () => {
  await prisma.$disconnect();
});

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const db = (o: OrganizacionDePrueba = org) => conAlcance(prisma, o.organizacionId);

/** Una conversación con ventana de servicio abierta, lista para que el provider le mande mensajes. */
async function conversacion(o: OrganizacionDePrueba = org) {
  const d = db(o);
  const lead = await d.lead.create({
    data: altaConAlcance({
      vertical_interes_id: o.verticalId,
      sucursal_interes_id: o.sucursales[0]!.id,
      etapa_id: o.etapaInicialId,
      telefono: `+5255${randomInt(10_000_000, 99_999_999)}`,
    }),
  });
  const conv = await d.conversacion.create({
    data: altaConAlcance({
      bandeja_chatwoot_id: o.bandejaId,
      lead_id: lead.id,
      chatwoot_conversacion_id: randomInt(1, 2_000_000_000),
      ventana_servicio_hasta: new Date(Date.now() + 12 * HORA),
    }),
  });
  return { lead, conv };
}

/** Manda `n` mensajes por MessagingProvider y devuelve los guardados (con su id_externo). */
async function enviar(o: OrganizacionDePrueba, transporte: TransporteFalso, convId: string, textos: string[], reloj: () => Date = () => new Date()) {
  const provider = new MessagingProvider({ transporte, reloj });
  const d = db(o);
  // Respuestas al último mensaje del contacto: no les aplica el horario de envío (decisión 5).
  const entrante = await sembrarEntrante(d, convId);
  const ids = await d.$transaction((tx) => provider.encolar(tx, convId, textos.map((cuerpo) => respuestaA(entrante, cuerpo))));
  const resumen = await provider.despachar(d, convId);
  const mensajes = await Promise.all(ids.map((id) => d.mensaje.findUniqueOrThrow({ where: { id } })));
  return { provider, ids, resumen, mensajes };
}

const cambio = (
  idExterno: string,
  estado: CambioDeEstado["estado"],
  extra: Partial<CambioDeEstado> = {},
  o: OrganizacionDePrueba = org,
): CambioDeEstado => ({
  proveedor: "chatwoot",
  idExterno,
  idProveedor: null,
  estado,
  ocurrioEn: null,
  errorCodigo: null,
  errorTexto: null,
  bandeja: { chatwootAccountId: o.chatwootAccountId, chatwootInboxId: o.chatwootInboxId },
  ...extra,
});
const fallo = (idExterno: string, codigo: number | null = 63016, texto: string | null = "63016 - Fuera de la ventana de 24 h") =>
  cambio(idExterno, "fallido", { errorCodigo: codigo, errorTexto: texto });
const registrar = (c: CambioDeEstado) => registrarEstadoEntrega({ prisma }, c);
const tareasDeEntrega = (convId: string, o: OrganizacionDePrueba = org) =>
  db(o).tarea_asesor.findMany({ where: { conversacion_id: convId, tipo: "entrega_fallida" }, orderBy: { creado_en: "asc" } });

// ---------------------------------------------------------------------------------------------
// Entrega fallida → tarea

test("un evento de entrega fallida deja una tarea con el código de error (en el campo y en la descripción)", async () => {
  const { conv } = await conversacion();
  const { mensajes } = await enviar(org, new TransporteFalso(), conv.id, ["Tu clase es mañana"]);
  const m = mensajes[0]!;

  assert.equal(await registrar(fallo(m.id_externo!)), "actualizado");
  const tareas = await tareasDeEntrega(conv.id);
  assert.equal(tareas.length, 1);
  const t = tareas[0]!;
  assert.equal(t.estado, "pendiente");
  assert.equal(t.mensaje_id, m.id);
  assert.equal(t.codigo_error, 63016);
  assert.match(t.descripcion, /63016/);
  assert.match(t.descripcion, /Fuera de la ventana de 24 h/);
  assert.match(t.descripcion, /Tu clase es mañana/);
  const guardado = await db().mensaje.findUniqueOrThrow({ where: { id: m.id } });
  assert.deepEqual([guardado.estatus, guardado.error_codigo], ["fallido", 63016]);
});

test("el mismo evento repetido, o un fallo posterior del mismo mensaje, no crea otra tarea (aunque la primera ya esté resuelta)", async () => {
  const { conv } = await conversacion();
  const { mensajes } = await enviar(org, new TransporteFalso(), conv.id, ["uno"]);
  const id = mensajes[0]!.id_externo!;

  await registrar(fallo(id));
  await registrar(fallo(id));
  await Promise.all([registrar(fallo(id)), registrar(fallo(id)), registrar(fallo(id))]);
  assert.equal((await tareasDeEntrega(conv.id)).length, 1);

  // Se resuelve la tarea; el mensaje se "entrega" y después vuelve a fallar con otro código.
  const [t] = await tareasDeEntrega(conv.id);
  await db().tarea_asesor.update({ where: { id: t!.id }, data: { estado: "hecha", resuelta_en: new Date() } });
  await registrar(cambio(id, "entregado"));
  await registrar(fallo(id, 63024, "63024 - Otro"));
  assert.equal((await tareasDeEntrega(conv.id)).length, 1, "un fallo posterior del mismo mensaje no crea otra");
});

test("una tarea por MENSAJE: dos mensajes de la misma conversación que fallan dejan dos tareas pendientes", async () => {
  const { conv } = await conversacion();
  const { mensajes } = await enviar(org, new TransporteFalso(), conv.id, ["uno", "dos"]);
  await registrar(fallo(mensajes[0]!.id_externo!, 63016));
  await registrar(fallo(mensajes[1]!.id_externo!, 63024, "Error code: 63024"));
  const tareas = await tareasDeEntrega(conv.id);
  assert.equal(tareas.length, 2);
  assert.deepEqual(tareas.map((t) => t.codigo_error).sort(), [63016, 63024]);
  assert.deepEqual(new Set(tareas.map((t) => t.mensaje_id)), new Set(mensajes.map((m) => m.id)));
});

test("sin código de error la tarea se crea igual; entregado, leído o un fallo ignorado no crean tarea", async () => {
  const { conv } = await conversacion();
  const { mensajes } = await enviar(org, new TransporteFalso(), conv.id, ["a", "b", "c"]);
  await registrar(fallo(mensajes[0]!.id_externo!, null, null));
  const [t] = await tareasDeEntrega(conv.id);
  assert.equal(t!.codigo_error, null);
  assert.match(t!.descripcion, /sin código de error/);

  await registrar(cambio(mensajes[1]!.id_externo!, "entregado"));
  await registrar(cambio(mensajes[1]!.id_externo!, "leido"));
  await registrar(fallo(mensajes[1]!.id_externo!)); // ya leído: el fallo se ignora
  await registrar(cambio(mensajes[2]!.id_externo!, "enviado"));
  assert.equal((await tareasDeEntrega(conv.id)).length, 1);
});

test("la tarea de entrega fallida respeta la organización", async () => {
  const a = await conversacion(org);
  const { mensajes } = await enviar(org, new TransporteFalso(), a.conv.id, ["hola"]);
  // El evento llega por la bandeja de OTRA organización con el id del mensaje de esta: no lo toca.
  assert.equal(await registrar(cambio(mensajes[0]!.id_externo!, "fallido", { errorCodigo: 1 }, otra)), "guardado_para_conciliar");
  assert.equal((await tareasDeEntrega(a.conv.id)).length, 0);
  assert.equal((await db().mensaje.findUniqueOrThrow({ where: { id: mensajes[0]!.id } })).estatus, "enviado");
});

// ---------------------------------------------------------------------------------------------
// F1-03 (a): el estado llega antes de que se guarde el id

test("un 'fallido 63016' que llega DURANTE el envío no se pierde: se concilia al guardar el id y deja su tarea", async () => {
  const { conv } = await conversacion();
  const transporte = new TransporteFalso();
  let resultadoDelEvento = "";
  transporte.alEnviar = async (_envio, idExterno) => {
    resultadoDelEvento = await registrar(fallo(idExterno));
  };
  const { mensajes } = await enviar(org, transporte, conv.id, ["se va a perder el estado"]);

  assert.equal(resultadoDelEvento, "guardado_para_conciliar");
  const m = mensajes[0]!;
  assert.deepEqual([m.estatus, m.error_codigo, m.error], ["fallido", 63016, "63016 - Fuera de la ventana de 24 h"]);
  const [t] = await tareasDeEntrega(conv.id);
  assert.equal(t!.codigo_error, 63016);
  assert.equal(t!.mensaje_id, m.id);
  const evento = await db().evento_entrega_pendiente.findFirstOrThrow({ where: { id_externo: m.id_externo! } });
  assert.ok(evento.conciliado_en, "el evento queda conciliado");
});

test("varios estados fuera de orden durante el envío (leído, entregado, enviado repetido): queda el más avanzado y el evento repetido no duplica", async () => {
  const { conv } = await conversacion();
  const transporte = new TransporteFalso();
  transporte.alEnviar = async (_e, id) => {
    await registrar(cambio(id, "leido", { ocurrioEn: new Date("2026-10-08T17:05:00Z") }));
    await registrar(cambio(id, "entregado", { ocurrioEn: new Date("2026-10-08T17:01:00Z") }));
    await registrar(cambio(id, "entregado", { ocurrioEn: new Date("2026-10-08T17:01:00Z") })); // reintento
    await registrar(cambio(id, "enviado"));
  };
  const { mensajes } = await enviar(org, transporte, conv.id, ["x"]);
  const m = mensajes[0]!;
  assert.equal(m.estatus, "leido");
  assert.equal(m.entregado_en?.toISOString(), "2026-10-08T17:01:00.000Z");
  assert.equal(m.leido_en?.toISOString(), "2026-10-08T17:05:00.000Z");
  assert.equal(await db().evento_entrega_pendiente.count({ where: { id_externo: m.id_externo! } }), 3, "uno por estado, el repetido no duplica");
});

test("carrera: el evento de entrega y el guardado del id corren a la vez; en todas las vueltas el estado final es el del evento", async () => {
  for (let i = 0; i < 25; i++) {
    const { conv } = await conversacion();
    const transporte = new TransporteFalso();
    let evento: Promise<unknown> = Promise.resolve();
    // El evento sale sin esperarlo: compite con el guardado del id y la conciliación.
    transporte.alEnviar = async (_e, id) => {
      evento = registrar(cambio(id, "entregado"));
    };
    const { mensajes } = await enviar(org, transporte, conv.id, ["carrera"]);
    await evento;
    const m = await db().mensaje.findUniqueOrThrow({ where: { id: mensajes[0]!.id } });
    assert.equal(m.estatus, "entregado", `vuelta ${i}`);
  }
});

test("EA-08 (F1-03): el id se guarda ENTRE la búsqueda del evento y su guardado: el reintento de la búsqueda lo concilia al instante", async () => {
  // Carrera forzada, no probabilística: justo después de que la primera búsqueda no encuentra el
  // mensaje, «el provider» le guarda el id y concilia (sin eventos que ver todavía). Si el evento
  // no volviera a buscar el mensaje después de guardarse, quedaría esperando al barrido.
  const { conv } = await conversacion();
  const d = db();
  const m = await d.mensaje.create({
    data: altaConAlcance({ conversacion_id: conv.id, direccion: "saliente" as const, estatus: "enviando" as const, origen: "respuesta" as const, cuerpo: "en vuelo", proveedor: "chatwoot" }),
  });
  const idExterno = `cw-carrera-${siguiente++}`;
  let busquedas = 0;
  const raiz = conGanchos(prisma, {
    modelo: "mensaje",
    operacion: "findFirst",
    despues: async () => {
      if (++busquedas !== 1) return;
      await d.mensaje.updateMany({ where: { id: m.id }, data: { estatus: "enviado", id_externo: idExterno, enviado_en: new Date() } });
    },
  });
  const resultado = await registrarEstadoEntrega({ prisma: raiz }, cambio(idExterno, "entregado"));
  assert.equal(resultado, "actualizado", "se conciliaron en la misma llamada, sin esperar al barrido");
  assert.equal((await d.mensaje.findUniqueOrThrow({ where: { id: m.id } })).estatus, "entregado");
  const evento = await d.evento_entrega_pendiente.findFirstOrThrow({ where: { id_externo: idExterno } });
  assert.ok(evento.conciliado_en);
});

test("EA-08: dos estados que llegan a la vez sobre el mismo mensaje no retroceden y ninguno se pierde: gana el más avanzado", async () => {
  // Carrera forzada: los dos leen el mensaje en `enviado`; el «rápido» escribe primero y el «lento»
  // (que se quedó dormido tras leer) escribe después con un estatus ya viejo. Sin la escritura
  // condicional el lento pisaría al rápido; sin releer, el lento se perdería.
  for (const [estadoLento, estadoRapido] of [["entregado", "leido"], ["leido", "entregado"]] as const) {
    const { conv } = await conversacion();
    const { mensajes } = await enviar(org, new TransporteFalso(), conv.id, ["hola"]);
    const id = mensajes[0]!.id_externo!;
    const barrera = new Barrera(2);
    const gancho = (dormirDespues: boolean) =>
      conGanchos(prisma, {
        modelo: "mensaje",
        operacion: "findFirst",
        cuando: () => !barrera.completa,
        despues: async () => {
          await barrera.esperar();
          if (dormirDespues) await dormir(250);
        },
      });
    const [lento, rapido] = await Promise.all([
      registrarEstadoEntrega({ prisma: gancho(true) }, cambio(id, estadoLento)),
      registrarEstadoEntrega({ prisma: gancho(false) }, cambio(id, estadoRapido)),
    ]);
    assert.equal(barrera.completa, true, "los dos leyeron antes de que cualquiera escribiera");
    assert.equal(rapido, "actualizado");
    assert.ok(lento === "actualizado" || lento === "sin_cambio");
    const m = await db().mensaje.findUniqueOrThrow({ where: { id: mensajes[0]!.id } });
    assert.equal(m.estatus, "leido", `lento=${estadoLento} rápido=${estadoRapido}: los estados solo avanzan y el más avanzado queda`);
    assert.ok(m.leido_en && m.entregado_en, "un «leído» implica entregado");
  }
});

test("un evento de un mensaje que el sistema no mandó se guarda y el barrido lo descarta (soft delete) solo cuando caduca", async () => {
  const id = `ajeno-${siguiente++}`;
  assert.equal(await registrar(cambio(id, "entregado")), "guardado_para_conciliar");
  const ahora = new Date();
  const d = db();
  let r = await barrerEventosEntrega(d, new Date(ahora.getTime() + 30 * MINUTO));
  assert.equal(r.descartados >= 0, true);
  assert.equal(await d.evento_entrega_pendiente.count({ where: { id_externo: id } }), 1, "a los 30 min sigue vigente");
  r = await barrerEventosEntrega(d, new Date(ahora.getTime() + 2 * HORA));
  assert.ok(r.descartados >= 1);
  assert.equal(await d.evento_entrega_pendiente.count({ where: { id_externo: id } }), 0, "descartado: ya no se ve");
  const fisico = await prisma.evento_entrega_pendiente.findFirst({ where: { organizacion_id: org.organizacionId, id_externo: id } });
  assert.ok(fisico?.eliminado_en, "la fila sigue en la base con eliminado_en");
});

test("el barrido concilia lo que se cortó: evento guardado cuyo mensaje ya tiene id", async () => {
  const { conv } = await conversacion();
  const { mensajes } = await enviar(org, new TransporteFalso(), conv.id, ["hola"]);
  const id = mensajes[0]!.id_externo!;
  // Se simula que la conciliación del provider no corrió: el evento quedó guardado sin conciliar.
  await db().evento_entrega_pendiente.create({
    data: altaConAlcance({ proveedor: "chatwoot", id_externo: id, estado: "entregado" as const }),
  });
  const r = await barrerEventosEntrega(db(), new Date());
  assert.ok(r.conciliados >= 1);
  assert.equal((await db().mensaje.findUniqueOrThrow({ where: { id: mensajes[0]!.id } })).estatus, "entregado");
  assert.equal((await barrerEventosEntrega(db(), new Date())).conciliados, 0, "idempotente");
});

test("aislamiento: los eventos guardados de otra organización no se concilian con mis mensajes", async () => {
  const a = await conversacion(org);
  const transporte = new TransporteFalso();
  const { mensajes } = await enviar(org, transporte, a.conv.id, ["hola"]);
  const id = mensajes[0]!.id_externo!;
  await db(otra).evento_entrega_pendiente.create({ data: altaConAlcance({ proveedor: "chatwoot", id_externo: id, estado: "leido" as const }) });
  await barrerEventosEntrega(db(otra), new Date());
  await barrerEventosEntrega(db(org), new Date());
  assert.equal((await db().mensaje.findUniqueOrThrow({ where: { id: mensajes[0]!.id } })).estatus, "enviado");
});

// ---------------------------------------------------------------------------------------------
// F1-03 (b): envío con resultado desconocido

test("tiempo agotado con el mensaje ya creado: queda como envío incierto, con tarea, y NO se reenvía", async () => {
  const { conv } = await conversacion();
  const transporte = new TransporteFalso();
  transporte.inciertoSi = () => true;
  const { provider, resumen, mensajes } = await enviar(org, transporte, conv.id, ["salió pero no lo sabemos"]);

  const m = mensajes[0]!;
  assert.deepEqual([m.estatus, m.error, m.id_externo], ["fallido", ENVIO_INCIERTO, null]);
  assert.deepEqual(resumen.resultados, [{ mensajeId: m.id, resultado: "fallido", motivo: ENVIO_INCIERTO }]);
  assert.equal(transporte.envios.filter((e) => e.tipo === "mensaje").length, 1);
  const tareas = await db().tarea_asesor.findMany({ where: { conversacion_id: conv.id, tipo: "envio_incierto" } });
  assert.equal(tareas.length, 1);
  assert.match(tareas[0]!.descripcion, /no se sabe si salió/);
  // La conversación pasa a un asesor.
  assert.equal(resumen.pasoAAsesor, true);

  // Volver a despachar, o correr la recuperación, no reenvía ni duplica la tarea.
  await provider.despachar(db(), conv.id);
  assert.equal(await provider.recuperarEnviosInciertos(db(), { desde: new Date(Date.now() + HORA) }), 0);
  assert.equal(transporte.envios.filter((e) => e.tipo === "mensaje").length, 1);
  assert.equal(await db().tarea_asesor.count({ where: { conversacion_id: conv.id, tipo: "envio_incierto" } }), 1);
});

test("un fallo definitivo (no se pudo contactar al proveedor) NO es incierto: fallido con su error, sin tarea de revisión", async () => {
  const { conv } = await conversacion();
  const transporte = new TransporteFalso();
  transporte.fallarSi = (e) => e.tipo !== "abrir";
  const { mensajes, resumen } = await enviar(org, transporte, conv.id, ["no salió"]);
  const m = mensajes[0]!;
  assert.deepEqual([m.estatus, m.error], ["fallido", "falla simulada"]);
  assert.equal(transporte.envios.filter((e) => e.tipo === "mensaje").length, 0);
  assert.equal(await db().tarea_asesor.count({ where: { conversacion_id: conv.id } }), 0);
  assert.equal(resumen.pasoAAsesor, true, "como antes: una persona retoma la conversación");
});

test("si el primero del lote queda incierto, los siguientes no salen (llegarían fuera de orden)", async () => {
  const { conv } = await conversacion();
  const transporte = new TransporteFalso();
  transporte.inciertoSi = (e) => e.texto === "primero";
  const { mensajes, resumen } = await enviar(org, transporte, conv.id, ["primero", "segundo"]);
  assert.deepEqual(resumen.resultados.map((r) => [r.resultado, r.motivo]), [
    ["fallido", ENVIO_INCIERTO],
    ["bloqueado", "envio_previo_fallido"],
  ]);
  assert.deepEqual(transporte.envios.filter((e) => e.tipo === "mensaje").map((e) => e.texto), ["primero"]);
  assert.equal(mensajes[1]!.estatus, "bloqueado");
});

test("un evento de entrega durante un envío que luego queda incierto no rompe nada", async () => {
  const { conv } = await conversacion();
  const transporte = new TransporteFalso();
  transporte.alEnviar = async (_e, id) => {
    await registrar(cambio(id, "entregado"));
  };
  transporte.inciertoSi = () => true;
  const { mensajes } = await enviar(org, transporte, conv.id, ["x"]);
  assert.equal(mensajes[0]!.estatus, "fallido");
  assert.equal(mensajes[0]!.error, ENVIO_INCIERTO);
});

test("flujo completo desde el bot: la respuesta del bot sale, falla la entrega y el asesor recibe la tarea con el código", async () => {
  const transporte = new TransporteFalso();
  const deps = { prisma, mensajeria: new MessagingProvider({ transporte }) };
  const idMensaje = String(siguiente++);
  const evento: EventoEntrante = {
    chatwootAccountId: org.chatwootAccountId,
    chatwootInboxId: org.chatwootInboxId,
    chatwootConversacionId: randomInt(1, 2_000_000_000),
    idMensaje,
    contenido: "Hola",
    estadoConversacion: "pending",
    contacto: { nombre: "C", telefono: `+52155${randomInt(10_000_000, 99_999_999)}` },
    creadoEn: null,
    llave: { proveedor: "chatwoot", id: idMensaje },
    numeroReceptor: null,
    crudo: null,
  };
  const { conversacionId } = await procesarEntrante(deps, evento);
  const saliente = await db().mensaje.findFirstOrThrow({ where: { conversacion_id: conversacionId!, direccion: "saliente", estatus: "enviado" } });
  await registrar(fallo(saliente.id_externo!, 63016));
  const [t] = await tareasDeEntrega(conversacionId!);
  assert.equal(t!.codigo_error, 63016);
});
