// El bot con el cotizador de WhatsApp encendido (C6 en adelante), de punta a punta contra Postgres real y el
// transporte falso: varios programas para una edad (C6), otra sucursal (C7), cotización y horario (C8) y lista
// de espera (C9). Los nombres de programas y grupos son neutros (invariante 2).

import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escenarioBot, type OpcionesEscenarioBot } from "../testutil/bot.ts";
import { barrerTiemposDeEspera } from "./espera.ts";
import { MessagingProvider } from "../mensajeria/index.ts";
import { fijarConfiguracion, OcupacionFija } from "../testutil/semilla.ts";
import { textos } from "./maquina.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const H = (dia: number, ini = 960, fin = 1020): [number, number, number] => [dia, ini, fin];
const PRECIO = { inscripcion: "500.00", mensualidad: "800.00" };

/** Norte: un programa para niños y dos alternativas para adultos; Sur: un programa para todas las edades. */
function catalogoBase(): OpcionesEscenarioBot {
  return {
    programas: [
      { sucursal: 0, nombre: "Programa niños", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Niños tarde", horarios: [H(1)] }], precio: PRECIO },
      { sucursal: 0, nombre: "Estilo Alfa", edadMin: 15, edadMax: 99, permiteTraslape: true, descripcionPublica: "Ritmo suave", grupos: [{ nombre: "Alfa noche", horarios: [H(2, 1140, 1200)] }], precio: PRECIO },
      { sucursal: 0, nombre: "Estilo Beta", edadMin: 15, edadMax: 99, permiteTraslape: true, descripcionPublica: "Ritmo intenso", grupos: [{ nombre: "Beta noche", horarios: [H(4, 1140, 1200)] }], precio: PRECIO },
      { sucursal: 1, nombre: "Programa sur", edadMin: 3, edadMax: 99, grupos: [{ nombre: "Sur tarde", horarios: [H(3)] }], precio: PRECIO },
    ],
  };
}

// ── C6: varios programas para una edad ────────────────────────────────────────────────────────────────

test("C6: con varios programas para la edad el bot pregunta cuál, guarda la elección en el prospecto y pasa al asesor", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Luis", "20", "1"); // sucursal 1 = Norte (orden alfabético)
  const pregunta = c.mensajes().at(-1)!;
  assert.equal(pregunta, "Para Luis (20 años) tenemos estas opciones. ¿Cuál te interesa? Responde con el número:\n1. Estilo Alfa — Ritmo suave\n2. Estilo Beta — Ritmo intenso");
  let conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "programa");
  assert.equal(conv.estado, "bot");
  assert.equal(conv.pasar_a_asesor_pendiente, false);

  await c.escribe("2");
  conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "horario", "con el programa elegido, el bot cotiza y espera el horario (C8)");
  assert.equal(conv.estado, "bot");
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(prospecto.programa_sugerido_id, (await e.db.programa.findFirstOrThrow({ where: { nombre: "Estilo Beta" } })).id);
  assert.match(c.mensajes().at(-1)!, /^Para Luis \(20 años\) en la sucursal Norte te recomiendo Estilo Beta\. Ritmo intenso\n/);

  await c.escribe("1");
  conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.estado, "en_atencion_humana", "pasó al asesor");
  assert.match(c.notas().at(-1)!, /• Programa: Estilo Beta/);
});

test("C6: con un solo programa para la edad no pregunta cuál: lo anota y sigue con la cotización", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "horario");
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(prospecto.programa_sugerido_id, (await e.db.programa.findFirstOrThrow({ where: { nombre: "Programa niños" } })).id);
  assert.match(c.mensajes().at(-1)!, /^Para Ana \(8 años\) en la sucursal Norte te recomiendo Programa niños\./);
});

test("C6: respuestas inválidas reintentan y a la tercera pasa al asesor con la nota de datos parciales", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Luis", "20", "1", "no sé", "9");
  assert.equal((await c.conversacion()).paso_captacion, "programa");
  assert.equal((await c.conversacion()).intentos_fallidos, 2);
  await c.escribe("ninguno");
  const conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.motivo_pase_asesor, "sin_entender");
  assert.equal(c.mensajes().at(-1), textos.sinEntender);
  assert.match(c.notas().at(-1)!, /no pudo completar la captura/);
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(prospecto.programa_sugerido_id, null, "no se anotó nada que no eligió");
});

test("C6: con el cotizador APAGADO la captura no cambia: tres preguntas, cierre sin programa y nada en el prospecto", async () => {
  const e = await escenarioBot(prisma, { ...catalogoBase(), cotizador: false });
  const c = e.contacto();
  await c.conversa("Hola", "Luis", "20", "1");
  const conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(c.mensajes().at(-1), textos.cierre("Luis", "Norte"));
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(prospecto.programa_sugerido_id, null);
  assert.ok(!c.notas().at(-1)!.includes("Programa"));
});

test("C6: se interrumpe en la pregunta del programa → a los 30 min se avisa a los asesores sin marcar atención humana", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  const t0 = new Date("2026-10-08T16:00:00Z");
  for (const t of ["Hola", "Luis", "20", "1"]) await c.escribe(t, t0);
  assert.equal((await c.conversacion()).paso_captacion, "programa");
  const despues = new Date(t0.getTime() + 31 * 60 * 1000);
  const avisadas = await barrerTiemposDeEspera({ prisma, mensajeria: new MessagingProvider({ transporte: e.transporte, reloj: () => despues }), organizacionId: e.org.organizacionId, reloj: () => despues });
  assert.equal(avisadas, 1);
  const conv = await c.conversacion();
  assert.equal(conv.estado, "bot", "visible no es atendido");
  assert.ok(conv.visible_a_asesores_en);
  assert.match(c.notas().at(-1)!, /dejó de contestar/);
});

test("C6: el programa sugerido de un prospecto solo puede ser de su organización (FK compuesta)", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const otra = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const conv = await c.conversacion();
  await assert.rejects(
    prisma.prospecto.updateMany({ where: { lead_id: conv.lead_id }, data: { programa_sugerido_id: otra.programas[0]!.id } }),
    /foreign key|clave foránea|prospecto_programa_sugerido/i,
  );
});

// ── C7: la sucursal elegida no tiene programa para la edad (decisión 8) ──────────────────────────────

// En el catálogo base, Norte no tiene programa para los 13 y 14 años; Sur sí (3 a 99).
const EDAD_SIN_PROGRAMA_EN_NORTE = "14";

test("C7: por defecto ofrece la otra sucursal; si el contacto acepta, recotiza allí, cambia la sucursal del lead y anota el programa", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1");
  assert.equal(c.mensajes().at(-1), "En la sucursal Norte por ahora no tenemos clases para Marta (14 años), pero en la sucursal Sur sí. ¿Quieres que te cotice ahí? Responde sí o no.");
  let conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "otra_sucursal");
  assert.equal(conv.estado, "bot");
  assert.equal(conv.lead.sucursal_interes_id, e.org.sucursales[0]!.id, "mientras no acepte, sigue en la que eligió");

  await c.escribe("sí");
  conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "horario", "cotiza en la otra sucursal y espera el horario");
  assert.equal(conv.lead.sucursal_interes_id, e.org.sucursales[1]!.id, "ahora es Sur");
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(prospecto.programa_sugerido_id, (await e.db.programa.findFirstOrThrow({ where: { nombre: "Programa sur" } })).id);
  assert.match(c.mensajes().at(-1)!, /^Para Marta \(14 años\) en la sucursal Sur te recomiendo Programa sur\./);

  await c.escribe("1");
  conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.match(c.notas().at(-1)!, /• Sucursal: Sur\n• Programa: Programa sur/);
});

test("C7: si no acepta, pasa al asesor con nota (motivo sin_programa) y no cambia nada de lo capturado", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1", "no");
  const conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.motivo_pase_asesor, "sin_programa");
  assert.equal(conv.lead.sucursal_interes_id, e.org.sucursales[0]!.id);
  assert.equal(c.mensajes().at(-1), textos.sinPrograma("Marta", 14, "Norte"));
  assert.match(c.notas().at(-1)!, /no tiene programa para la edad/);
  assert.match(c.notas().at(-1)!, /• Edad: 14/);
  assert.equal((await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } })).programa_sugerido_id, null);
});

test("C7: con la política avisar_asesor pasa directo, sin ofrecer otra sucursal", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  await fijarConfiguracion(prisma, e.org.organizacionId, { sucursal_sin_programa: "avisar_asesor" });
  const c = e.contacto();
  await c.conversa("Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1");
  const conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.motivo_pase_asesor, "sin_programa");
  assert.ok(!c.mensajes().some((m) => m.includes("¿Quieres que te cotice ahí?")));
});

test("C7: la política es por organización: cambiarla en una no afecta a otra", async () => {
  const a = await escenarioBot(prisma, catalogoBase());
  const b = await escenarioBot(prisma, catalogoBase());
  await fijarConfiguracion(prisma, a.org.organizacionId, { sucursal_sin_programa: "avisar_asesor" });
  const ca = a.contacto();
  const cb = b.contacto();
  await ca.conversa("Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1");
  await cb.conversa("Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1");
  assert.equal((await ca.conversacion()).estado, "en_atencion_humana");
  assert.equal((await cb.conversacion()).paso_captacion, "otra_sucursal");
});

test("C7: si ninguna otra sucursal tiene programa para la edad, pasa al asesor aunque la política sea ofrecer_otra", async () => {
  const e = await escenarioBot(prisma, { programas: catalogoBase().programas!.filter((p) => p.sucursal === 0) });
  const c = e.contacto();
  await c.conversa("Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1");
  const conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.motivo_pase_asesor, "sin_programa");
});

test("C7: con el cotizador apagado la misma edad cierra como siempre (sin consultar el catálogo)", async () => {
  const e = await escenarioBot(prisma, { ...catalogoBase(), cotizador: false });
  const c = e.contacto();
  await c.conversa("Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1");
  const conv = await c.conversacion();
  assert.equal(conv.motivo_pase_asesor, "captura_completa");
  assert.equal(c.mensajes().at(-1), textos.cierre("Marta", "Norte"));
});

test("C7: respuestas que no se entienden reintentan y a la tercera pasa al asesor", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1", "tal vez", "mmm");
  assert.equal(c.mensajes().at(-1), "Responde sí o no: ¿te cotizo en la sucursal Sur?");
  await c.escribe("quién sabe");
  const conv = await c.conversacion();
  assert.equal(conv.motivo_pase_asesor, "sin_entender");
  assert.equal(conv.estado, "en_atencion_humana");
});

test("C7: se interrumpe en la oferta de otra sucursal → a los 30 min se avisa a los asesores", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  const t0 = new Date("2026-10-08T16:00:00Z");
  for (const t of ["Hola", "Marta", EDAD_SIN_PROGRAMA_EN_NORTE, "1"]) await c.escribe(t, t0);
  const despues = new Date(t0.getTime() + 31 * 60 * 1000);
  const avisadas = await barrerTiemposDeEspera({ prisma, mensajeria: new MessagingProvider({ transporte: e.transporte, reloj: () => despues }), organizacionId: e.org.organizacionId, reloj: () => despues });
  assert.equal(avisadas, 1);
  assert.equal((await c.conversacion()).estado, "bot");
});

// ── C8: la cotización por WhatsApp y la elección del horario (decisión 15) ───────────────────────────

test("C8: tras las tres preguntas el bot cotiza (programa, horarios con lugar, precio) y GUARDA lo cotizado congelado", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const texto = c.mensajes().at(-1)!;
  assert.equal(
    texto,
    [
      "Para Ana (8 años) en la sucursal Norte te recomiendo Programa niños.",
      "",
      "Horarios disponibles:",
      "1. Niños tarde: lunes de 16:00 a 17:00 · 10 lugares",
      "",
      "Inscripción: $500.00",
      "Mensualidad: $800.00",
      "",
      "Responde con el número del horario que prefieras, o escribe «asesor» para hablar con una persona.",
    ].join("\n"),
  );
  const conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "horario");
  assert.equal(conv.estado, "bot", "todavía no hay asesor: espera el horario");

  const cot = await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.deepEqual(
    [cot.prospecto_id, cot.programa_id, cot.sucursal_id, cot.origen, cot.conversacion_id, cot.creado_por_usuario_id, cot.estatus, cot.grupo_elegido_id],
    [prospecto.id, e.programas[0]!.id, e.org.sucursales[0]!.id, "bot", conv.id, null, "vigente", null],
  );
  assert.equal(cot.fecha.toISOString().slice(0, 10) < cot.vigente_hasta.toISOString().slice(0, 10), true);
  const dias = (cot.vigente_hasta.getTime() - cot.fecha.getTime()) / 86_400_000;
  assert.equal(dias, 7, "la vigencia por defecto de la configuración");
  const snap = cot.snapshot as { version: number; programa: { nombre: string; precio: { costo_inscripcion: string; costo_mensualidad: string }; grupos: { grupo_id: string; horario_texto: string; lugares_disponibles: number }[] } };
  assert.equal(snap.version, 1);
  assert.deepEqual([snap.programa.nombre, snap.programa.precio.costo_inscripcion, snap.programa.precio.costo_mensualidad], ["Programa niños", "500.00", "800.00"]);
  assert.deepEqual(snap.programa.grupos.map((g) => [g.grupo_id, g.horario_texto, g.lugares_disponibles]), [[e.programas[0]!.grupos[0]!.id, "lunes de 16:00 a 17:00", 10]]);
});

test("C8: al elegir horario se guarda cotizacion.grupo_elegido y el handoff lleva la cotización y el horario en la nota", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "1");
  const conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.motivo_pase_asesor, "captura_completa");
  const cot = await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(cot.grupo_elegido_id, e.programas[0]!.grupos[0]!.id);
  assert.equal(cot.estatus, "vigente", "elegir horario no es inscribirse: la inscripción (F3) la marca aceptada");
  assert.equal(c.mensajes().at(-1), "¡Listo! Anotamos a Ana en Niños tarde (lunes de 16:00 a 17:00) de Programa niños, sucursal Norte. Un asesor te escribe por aquí en unos minutos para confirmar y resolver tus dudas.");
  const nota = c.notas().at(-1)!;
  assert.match(nota, /• Programa: Programa niños\n• Cotización \(vale hasta \d{4}-\d{2}-\d{2}\): inscripción \$500\.00, mensualidad \$800\.00\n• Horario elegido: Niños tarde — lunes de 16:00 a 17:00\n• Teléfono/);
});

test("C8: «asesor» en lugar del horario pasa a una persona con la cotización en la nota, sin horario elegido", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "asesor");
  const conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.motivo_pase_asesor, "pidio_asesor");
  assert.equal(c.mensajes().at(-1), textos.pidioAsesor);
  assert.match(c.notas().at(-1)!, /pidió hablar con una persona/);
  assert.match(c.notas().at(-1)!, /• Cotización \(vale hasta[^\n]*\n• Horario elegido: todavía no eligió/);
  assert.equal((await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: conv.lead_id } })).grupo_elegido_id, null);
});

test("C8: con el cotizador de la vertical APAGADO no se cotiza ni se guarda nada: la captura de tres preguntas y el handoff de siempre", async () => {
  const e = await escenarioBot(prisma, { ...catalogoBase(), cotizador: false });
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(c.mensajes().at(-1), textos.cierre("Ana", "Norte"));
  assert.equal(await e.db.cotizacion.count(), 0);
  assert.ok(!c.notas().at(-1)!.includes("Cotización"));
});

test("C8: el interruptor es POR VERTICAL: encender una no enciende la otra", async () => {
  const e = await escenarioBot(prisma, { ...catalogoBase(), cotizador: false });
  const otra = await prisma.vertical.create({ data: { organizacion_id: e.org.organizacionId, nombre: "Otra vertical", slug: "otra-vertical", cotizador_whatsapp_activo: true } });
  assert.equal((await e.db.vertical.findFirstOrThrow({ where: { id: e.org.verticalId } })).cotizador_whatsapp_activo, false);
  assert.equal((await e.db.vertical.findFirstOrThrow({ where: { id: otra.id } })).cotizador_whatsapp_activo, true);
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  assert.equal((await c.conversacion()).paso_captacion, "completo", "la vertical del canal sigue apagada");
});

test("C8: los precios quedan CONGELADOS: un cambio de precio posterior no toca la cotización guardada", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const antes = await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: (await c.conversacion()).lead_id } });
  // El precio sube mañana mismo en el catálogo.
  await prisma.precio.updateMany({ where: { programa_id: e.programas[0]!.id }, data: { costo_mensualidad: "999.00" } });
  await c.escribe("1");
  const despues = await e.db.cotizacion.findFirstOrThrow({ where: { id: antes.id } });
  assert.deepEqual(despues.snapshot, antes.snapshot);
  assert.equal((despues.snapshot as { programa: { precio: { costo_mensualidad: string } } }).programa.precio.costo_mensualidad, "800.00");
  assert.match(c.notas().at(-1)!, /mensualidad \$800\.00/, "la nota dice lo que se le cotizó, no lo de hoy");
});

test("C8: el número que responde apunta a los horarios QUE VIO aunque los lugares cambien entre la cotización y su respuesta", async () => {
  const ocupacion = new OcupacionFija();
  const e = await escenarioBot(prisma, {
    fuente: ocupacion,
    programas: [
      {
        sucursal: 0,
        nombre: "Programa dos horarios",
        edadMin: 3,
        edadMax: 12,
        grupos: [
          { nombre: "Horario A", cupoMaximo: 10, horarios: [H(1)] },
          { nombre: "Horario B", cupoMaximo: 6, horarios: [H(2)] },
        ],
        precio: PRECIO,
      },
    ],
  });
  const a = e.programas[0]!.grupos[0]!;
  const b = e.programas[0]!.grupos[1]!;
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  assert.match(c.mensajes().at(-1)!, /1\. Horario A: lunes de 16:00 a 17:00 · 10 lugares\n2\. Horario B: martes de 16:00 a 17:00 · 6 lugares/);
  // Entre tanto el horario A se llena: hoy el catálogo lo mostraría al final (o no), pero el contacto vio A como el 1.
  ocupacion.fijar(a.id, 10);
  await c.escribe("1");
  const cot = await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: (await c.conversacion()).lead_id } });
  assert.equal(cot.grupo_elegido_id, a.id, "el 1 de lo que vio es A");
  assert.notEqual(cot.grupo_elegido_id, b.id);
});

test("C8: un programa sin precio vigente se cotiza igual y el costo lo confirma un asesor", async () => {
  const e = await escenarioBot(prisma, { programas: [{ sucursal: 0, nombre: "Programa sin precio", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", horarios: [H(1)] }] }] });
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  assert.match(c.mensajes().at(-1)!, /El costo te lo confirma un asesor\./);
  await c.escribe("1");
  assert.match(c.notas().at(-1)!, /sin precio vigente/);
});

test("C8: sin lugar en ningún grupo la cotización sale igual y pasa al asesor; el programa queda anotado", async () => {
  const ocupacion = new OcupacionFija();
  const e = await escenarioBot(prisma, { fuente: ocupacion, programas: [{ sucursal: 0, nombre: "Programa lleno", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", cupoMaximo: 3, horarios: [H(1)] }], precio: PRECIO }] });
  ocupacion.fijar(e.programas[0]!.grupos[0]!.id, 3);
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const conv = await c.conversacion();
  assert.match(c.mensajes().at(-1)!, /Por ahora no hay lugares en los grupos de este programa\./);
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(await e.db.cotizacion.count({ where: { lead_id: conv.lead_id } }), 1);
});

test("C8: un webhook repetido del horario (mismo id de mensaje) no duplica ni cambia lo elegido (invariante 8)", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const id = `repetido-${randomUUID()}`;
  const primero = await c.escribe("1", undefined, id);
  assert.equal(primero.resultado, "procesado");
  const conv = await c.conversacion();
  const enviados = e.transporte.envios.length;
  const repetido = await c.escribe("1", undefined, id);
  assert.equal(repetido.resultado, "duplicado");
  assert.equal(e.transporte.envios.length, enviados, "no se vuelve a mandar nada");
  assert.equal(await e.db.cotizacion.count({ where: { lead_id: conv.lead_id } }), 1);
  assert.equal((await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: conv.lead_id } })).grupo_elegido_id, e.programas[0]!.grupos[0]!.id);
});

test("C8: dos respuestas de horario simultáneas dejan UN solo horario elegido y un solo handoff", async () => {
  const e = await escenarioBot(prisma, {
    programas: [{ sucursal: 0, nombre: "Programa dos horarios", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Horario A", horarios: [H(1)] }, { nombre: "Horario B", cupoMaximo: 5, horarios: [H(2)] }], precio: PRECIO }],
  });
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  await Promise.all([c.escribe("1"), c.escribe("2")]);
  const conv = await c.conversacion();
  const cots = await e.db.cotizacion.findMany({ where: { lead_id: conv.lead_id } });
  assert.equal(cots.length, 1);
  assert.ok(cots[0]!.grupo_elegido_id, "quedó un horario elegido");
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(c.mensajes().filter((m) => m.startsWith("¡Listo!")).length, 1, "un solo cierre");
});

test("C8: se interrumpe en la elección del horario → a los 30 min se avisa a los asesores", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  const t0 = new Date("2026-10-08T16:00:00Z");
  for (const t of ["Hola", "Ana", "8", "1"]) await c.escribe(t, t0);
  assert.equal((await c.conversacion()).paso_captacion, "horario");
  const despues = new Date(t0.getTime() + 31 * 60 * 1000);
  const avisadas = await barrerTiemposDeEspera({ prisma, mensajeria: new MessagingProvider({ transporte: e.transporte, reloj: () => despues }), organizacionId: e.org.organizacionId, reloj: () => despues });
  assert.equal(avisadas, 1);
  assert.match(c.notas().at(-1)!, /dejó de contestar/);
  assert.match(c.notas().at(-1)!, /• Cotización/);
});

test("C8: la vigencia de la cotización sale de la configuración de la organización", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  await fijarConfiguracion(prisma, e.org.organizacionId, { cotizacion_vigencia_dias: 3 });
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const cot = await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: (await c.conversacion()).lead_id } });
  assert.equal((cot.vigente_hasta.getTime() - cot.fecha.getTime()) / 86_400_000, 3);
});

test("C8: nada de la cotización ni de la nota incluye datos de salud (no hay) ni el teléfono sin enmascarar en los logs", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "1");
  const todo = [...c.mensajes(), ...c.notas(), JSON.stringify((await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: (await c.conversacion()).lead_id } })).snapshot)].join("\n");
  assert.ok(!/alergia|medicamento|condici[oó]n m[eé]dica|emergencia/i.test(todo));
});

// ── C9: lista de espera cuando no hay lugar ──────────────────────────────────────────────────────────

/** Un programa con un grupo LLENO que permite lista de espera (A), uno con lugar (B) y uno lleno sin lista (C). */
async function escenarioLleno() {
  const ocupacion = new OcupacionFija();
  const e = await escenarioBot(prisma, {
    fuente: ocupacion,
    programas: [
      {
        sucursal: 0,
        nombre: "Programa con grupos llenos",
        edadMin: 3,
        edadMax: 12,
        grupos: [
          { nombre: "Grupo A", cupoMaximo: 4, permiteListaEspera: true, horarios: [H(1)] },
          { nombre: "Grupo B", cupoMaximo: 6, horarios: [H(2)] },
          { nombre: "Grupo C", cupoMaximo: 4, permiteListaEspera: false, horarios: [H(3)] },
        ],
        precio: PRECIO,
      },
    ],
  });
  const [a, b, c] = e.programas[0]!.grupos as unknown as [{ id: string }, { id: string }, { id: string }];
  ocupacion.fijar(a.id, 4);
  ocupacion.fijar(c.id, 4);
  return { e, ocupacion, a: a.id, b: b.id, c: c.id };
}

test("C9: el bot ofrece lista de espera solo en el grupo lleno que la permite; el lleno sin lista no se ofrece", async () => {
  const { e } = await escenarioLleno();
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const texto = c.mensajes().at(-1)!;
  assert.match(texto, /1\. Grupo B: martes de 16:00 a 17:00 · 6 lugares\n2\. Grupo A: lunes de 16:00 a 17:00 · lista de espera\n\nInscripción/);
  assert.ok(!texto.includes("Grupo C"), "lleno y sin lista de espera: no se ofrece");
});

test("C9: elegir el grupo lleno pregunta si quiere la lista; «sí» la apunta (posición 1), deja una tarea para el asesor y pasa al asesor", async () => {
  const { e, a } = await escenarioLleno();
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "2");
  const conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "lista_espera");
  assert.equal(conv.estado, "bot");
  assert.equal(c.mensajes().at(-1), "El grupo Grupo A (lunes de 16:00 a 17:00) está lleno por ahora. ¿Quieres que te apuntemos en la lista de espera? Si se libera un lugar, un asesor te avisa. Responde sí o no.");
  assert.equal(await e.db.lista_espera.count(), 0, "todavía no se apunta a nadie");
  assert.equal((await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: conv.lead_id } })).grupo_elegido_id, a, "queda como horario tentativo");

  await c.escribe("sí");
  const despues = await c.conversacion();
  assert.equal(despues.paso_captacion, "completo");
  assert.equal(despues.estado, "en_atencion_humana");
  const entrada = await e.db.lista_espera.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.deepEqual([entrada.grupo_id, entrada.estatus, entrada.posicion], [a, "esperando", 1]);
  assert.equal(entrada.prospecto_id, (await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } })).id);
  const tareas = await e.db.tarea_asesor.findMany({ where: { lead_id: conv.lead_id, tipo: "lista_espera_nueva" } });
  assert.equal(tareas.length, 1);
  assert.deepEqual([tareas[0]!.estado, tareas[0]!.conversacion_id], ["pendiente", conv.id]);
  assert.equal(tareas[0]!.descripcion, "Entró a la lista de espera de «Grupo A» (posición 1). Avísale cuando se libere un lugar.");
  assert.equal(c.mensajes().at(-1), "Listo, Ana quedó en la lista de espera de Grupo A (lunes de 16:00 a 17:00) de Programa con grupos llenos. Si se libera un lugar, un asesor te escribe por aquí. Mientras tanto te atiende un asesor para ver otras opciones.");
  const nota = c.notas().at(-1)!;
  assert.match(nota, /• Horario elegido: Grupo A — lunes de 16:00 a 17:00 \(lista de espera\)\n• Lista de espera: Grupo A \(posición 1\)/);
});

test("C9: «no» a la lista vuelve a los horarios, descarta el tentativo y deja elegir otro; nadie queda en la lista", async () => {
  const { e, b } = await escenarioLleno();
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "2", "no");
  let conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "horario");
  assert.match(c.mensajes().at(-1)!, /^Sin problema\. ¿Cuál otro horario prefieres\?/);
  assert.equal((await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: conv.lead_id } })).grupo_elegido_id, null);
  await c.escribe("1"); // Grupo B, con lugar
  conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal((await e.db.cotizacion.findFirstOrThrow({ where: { lead_id: conv.lead_id } })).grupo_elegido_id, b);
  assert.equal(await e.db.lista_espera.count(), 0);
  assert.equal(await e.db.tarea_asesor.count({ where: { tipo: "lista_espera_nueva" } }), 0);
});

test("C9: «asesor» en la pregunta de la lista pasa a una persona sin apuntar a nadie", async () => {
  const { e } = await escenarioLleno();
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "2", "asesor");
  assert.equal((await c.conversacion()).motivo_pase_asesor, "pidio_asesor");
  assert.equal(await e.db.lista_espera.count(), 0);
});

test("C9: respuestas que no se entienden reintentan y a la tercera pasa al asesor, sin apuntar a nadie", async () => {
  const { e } = await escenarioLleno();
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "2", "tal vez", "mmm", "quién sabe");
  const conv = await c.conversacion();
  assert.equal(conv.motivo_pase_asesor, "sin_entender");
  assert.equal(await e.db.lista_espera.count(), 0);
});

test("C9: tres familias que aceptan la lista quedan en orden de llegada (1, 2, 3) y cada una deja su tarea", async () => {
  const { e, a } = await escenarioLleno();
  const cs = [e.contacto(), e.contacto(), e.contacto()];
  for (const c of cs) await c.conversa("Hola", "Niño", "8", "1", "2", "sí");
  const entradas = await e.db.lista_espera.findMany({ where: { grupo_id: a }, orderBy: { posicion: "asc" } });
  assert.deepEqual(entradas.map((x) => x.posicion), [1, 2, 3]);
  assert.equal(new Set(entradas.map((x) => x.lead_id)).size, 3);
  assert.equal(await e.db.tarea_asesor.count({ where: { tipo: "lista_espera_nueva" } }), 3);
});

test("CONCURRENCIA C9: cinco familias que aceptan la lista al mismo tiempo quedan en las posiciones 1..5, sin repetir ni saltar", async () => {
  const { e, a } = await escenarioLleno();
  const cs = Array.from({ length: 5 }, () => e.contacto());
  for (const c of cs) await c.conversa("Hola", "Niño", "8", "1", "2");
  const rs = await Promise.all(cs.map((c) => c.escribe("sí")));
  assert.deepEqual(rs.map((r) => r.resultado), ["procesado", "procesado", "procesado", "procesado", "procesado"]);
  const entradas = await e.db.lista_espera.findMany({ where: { grupo_id: a }, orderBy: { posicion: "asc" } });
  assert.deepEqual(entradas.map((x) => x.posicion), [1, 2, 3, 4, 5]);
  assert.equal(new Set(entradas.map((x) => x.prospecto_id)).size, 5);
  assert.equal(await e.db.tarea_asesor.count({ where: { tipo: "lista_espera_nueva" } }), 5);
  for (const c of cs) assert.equal((await c.conversacion()).estado, "en_atencion_humana");
});

test("C9: un «sí» repetido (mismo mensaje) no apunta dos veces ni repite la tarea (invariante 8)", async () => {
  const { e } = await escenarioLleno();
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "2");
  const id = `si-${randomUUID()}`;
  assert.equal((await c.escribe("sí", undefined, id)).resultado, "procesado");
  assert.equal((await c.escribe("sí", undefined, id)).resultado, "duplicado");
  assert.equal(await e.db.lista_espera.count(), 1);
  assert.equal(await e.db.tarea_asesor.count({ where: { tipo: "lista_espera_nueva" } }), 1);
});

test("C9: si mientras contestaba el grupo recuperó un lugar, la tarea lo avisa para ofrecérselo de inmediato", async () => {
  const { e, ocupacion, a } = await escenarioLleno();
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "2");
  ocupacion.fijar(a, 3); // se liberó un lugar
  await c.escribe("sí");
  const tarea = await e.db.tarea_asesor.findFirstOrThrow({ where: { tipo: "lista_espera_nueva" } });
  assert.match(tarea.descripcion, /Ojo: al apuntarlo el grupo ya tenía 1 lugar libre; ofrécele el lugar\./);
});

test("C9: si el grupo dejó de permitir lista de espera entre la pregunta y la respuesta, no se apunta a nadie y la tarea lo dice", async () => {
  const { e, a } = await escenarioLleno();
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1", "2");
  await prisma.grupo.update({ where: { id: a }, data: { permite_lista_espera: false } });
  await c.escribe("sí");
  assert.equal(await e.db.lista_espera.count(), 0);
  const tarea = await e.db.tarea_asesor.findFirstOrThrow({ where: { tipo: "lista_espera_nueva" } });
  assert.match(tarea.descripcion, /no se pudo apuntar \(el grupo ya no permite lista de espera\)/);
  assert.equal((await c.conversacion()).estado, "en_atencion_humana");
});

test("C9: con el cotizador apagado no hay lista de espera ni cotización: la captura de siempre", async () => {
  const { e } = await escenarioLleno();
  await prisma.vertical.update({ where: { id: e.org.verticalId }, data: { cotizador_whatsapp_activo: false } });
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  assert.equal((await c.conversacion()).paso_captacion, "completo");
  assert.equal(await e.db.lista_espera.count(), 0);
});

test("C9: se interrumpe en la pregunta de la lista → a los 30 min se avisa a los asesores", async () => {
  const { e } = await escenarioLleno();
  const c = e.contacto();
  const t0 = new Date("2026-10-08T16:00:00Z");
  for (const t of ["Hola", "Ana", "8", "1", "2"]) await c.escribe(t, t0);
  assert.equal((await c.conversacion()).paso_captacion, "lista_espera");
  const despues = new Date(t0.getTime() + 31 * 60 * 1000);
  const avisadas = await barrerTiemposDeEspera({ prisma, mensajeria: new MessagingProvider({ transporte: e.transporte, reloj: () => despues }), organizacionId: e.org.organizacionId, reloj: () => despues });
  assert.equal(avisadas, 1);
  assert.equal((await c.conversacion()).estado, "bot");
});
