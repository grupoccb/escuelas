// El bot con el cotizador de WhatsApp encendido (C6 en adelante), de punta a punta contra Postgres real y el
// transporte falso: varios programas para una edad (C6), otra sucursal (C7), cotización y horario (C8) y lista
// de espera (C9). Los nombres de programas y grupos son neutros (invariante 2).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escenarioBot, type OpcionesEscenarioBot } from "../testutil/bot.ts";
import { barrerTiemposDeEspera } from "./espera.ts";
import { MessagingProvider } from "../mensajeria/index.ts";
import { fijarConfiguracion } from "../testutil/semilla.ts";
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
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.estado, "en_atencion_humana", "pasó al asesor");
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(prospecto.programa_sugerido_id, (await e.db.programa.findFirstOrThrow({ where: { nombre: "Estilo Beta" } })).id);
  assert.equal(c.mensajes().at(-1), textos.cierreConPrograma("Luis", "Estilo Beta", "Norte"));
  assert.match(c.notas().at(-1)!, /• Programa: Estilo Beta/);
});

test("C6: con un solo programa para la edad no pregunta: lo anota y cierra", async () => {
  const e = await escenarioBot(prisma, catalogoBase());
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "completo");
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(prospecto.programa_sugerido_id, (await e.db.programa.findFirstOrThrow({ where: { nombre: "Programa niños" } })).id);
  assert.equal(c.mensajes().at(-1), textos.cierreConPrograma("Ana", "Programa niños", "Norte"));
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
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.lead.sucursal_interes_id, e.org.sucursales[1]!.id, "ahora es Sur");
  const prospecto = await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
  assert.equal(prospecto.programa_sugerido_id, (await e.db.programa.findFirstOrThrow({ where: { nombre: "Programa sur" } })).id);
  assert.equal(c.mensajes().at(-1), textos.cierreConPrograma("Marta", "Programa sur", "Sur"));
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
