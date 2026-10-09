// V1: el bot respeta los módulos. Con el cotizador apagado hace lo de siempre sin él (tres preguntas y pase al asesor); con la clase muestra apagada no ofrece agendar; y apagar
// un módulo con la conversación a medias no rompe nada (regla WH: ningún 500 por un módulo apagado). Lo de los módulos que el bot jamás ofrece (inscripción, operación, finanzas,
// tableros) se comprueba con una conversación completa: el texto no menciona nada de ellos. Postgres real, el loop completo.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escenarioBot, type ContactoBot, type EscenarioBot } from "../testutil/bot.ts";
import { fijarConfiguracion } from "../testutil/semilla.ts";
import { vencerCotizacionesDeTodas } from "../cotizador/vencer.ts";
import { DEFINICION_DE_MODULOS, MODULOS_APAGABLES, SOLO_CAPTACION, TODOS_ENCENDIDOS, aFilaDeModulos, type ModuloApagable, type ModulosEncendidos } from "./index.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

// Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México. El grupo da clase los lunes a las 16:00.
const AHORA = new Date("2026-11-02T18:00:00Z");

function apagadoCon(modulo: ModuloApagable): ModulosEncendidos {
  const estado: ModulosEncendidos = { ...TODOS_ENCENDIDOS, [modulo]: false };
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const x of MODULOS_APAGABLES) {
      if (estado[x] && DEFINICION_DE_MODULOS[x].requiere.some((r) => !estado[r])) {
        estado[x] = false;
        cambio = true;
      }
    }
  }
  return estado;
}

async function escenario(estado: ModulosEncendidos): Promise<EscenarioBot> {
  const e = await escenarioBot(prisma, {
    claseMuestra: true,
    embudo: true,
    programas: [{ sucursal: 0, nombre: "Programa uno", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: 3, horarios: [[1, 960, 1020]] }], precio: { inscripcion: "500.00", mensualidad: "300.00" } }],
  });
  await fijarConfiguracion(prisma, e.org.organizacionId, aFilaDeModulos(estado));
  return e;
}
/**
 * La oferta del cotizador y de la clase muestra: la cotización con su programa recomendado, los horarios con lugares, los precios, la lista de espera y las fechas de clase muestra.
 * (El saludo de siempre, «para darte horarios y costos exactos te hago tres preguntas», y el cierre «un asesor te escribe con horarios y costos» son del bot SIN cotizador: no son una oferta.)
 */
const OFERTA_DEL_COTIZADOR = /lugares?\b|\$\d|precio|horarios disponibles|mensualidad|recomiendo|clase muestra|lista de espera|cotizaci/i;
const ultimo = (c: ContactoBot): string => c.mensajes().at(-1) ?? "";
/** Todo lo que el sistema escribió en la conversación: lo que ve la familia y las notas para el asesor. */
const todoElTexto = (c: ContactoBot): string => [...c.mensajes(), ...c.notas()].join("\n");

/** Las tres preguntas y la sucursal; con el cotizador encendido, sigue con la cotización y el horario. */
async function conversacionCompleta(c: ContactoBot): Promise<void> {
  for (const t of ["Hola", "Luis", "8", "1"]) await c.escribe(t, AHORA);
}

test("cotizador apagado: el bot hace las tres preguntas y pasa al asesor; no cotiza, no ofrece horarios, ni precios, ni clase muestra, ni lista de espera", async () => {
  const e = await escenario(apagadoCon("cotizador"));
  const c = e.contacto();
  await conversacionCompleta(c);
  const conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.paso_captacion, "completo");
  assert.match(ultimo(c), /Un asesor te escribe/);
  assert.doesNotMatch(todoElTexto(c), OFERTA_DEL_COTIZADOR, todoElTexto(c));
  assert.equal(await e.db.cotizacion.count(), 0);
  assert.equal(await e.db.clase_muestra.count(), 0);
  assert.equal((await e.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } })).programa_sugerido_id, null);
});

test("control: con el cotizador encendido el MISMO flujo sí cotiza y ofrece el horario", async () => {
  const e = await escenario(TODOS_ENCENDIDOS);
  const c = e.contacto();
  await conversacionCompleta(c);
  assert.equal((await c.conversacion()).paso_captacion, "horario");
  assert.match(ultimo(c), /te recomiendo Programa uno/);
  assert.match(ultimo(c), /lugares/);
});

test("clase muestra apagada (cotizador encendido): cotiza y cierra con el horario; NO ofrece agendar ninguna clase muestra", async () => {
  const e = await escenario(apagadoCon("clase_muestra"));
  const c = e.contacto();
  await conversacionCompleta(c);
  await c.escribe("1", AHORA); // elige el horario
  const conv = await c.conversacion();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.match(ultimo(c), /Anotamos a Luis en Grupo A/);
  assert.doesNotMatch(todoElTexto(c), /clase muestra/i, todoElTexto(c));
  assert.equal(conv.muestra_ofrecida, null);
  assert.equal(await e.db.clase_muestra.count(), 0);
});

test("control: con la clase muestra encendida el MISMO flujo propone fechas de clase muestra", async () => {
  const e = await escenario(TODOS_ENCENDIDOS);
  const c = e.contacto();
  await conversacionCompleta(c);
  await c.escribe("1", AHORA);
  assert.match(ultimo(c), /clase muestra en Grupo A/);
  assert.equal((await c.conversacion()).paso_captacion, "fecha_muestra");
});

/** Inscripción, operación, finanzas y tableros: el bot nunca los ofrece (la captación termina en el pase al asesor). Con SOLO la captación encendida, no los menciona. */
const PALABRAS_POR_MODULO: Record<"inscripcion" | "operacion" | "finanzas" | "tableros", RegExp> = {
  inscripcion: /inscrib|reglamento|tutor|alumno inscrito|inscripci[óo]n(?!:)/i,
  operacion: /pase de lista|asistencia|nivel|evento|examen/i,
  finanzas: /pago|cobr|cargo|mensualidad|uniforme|saldo|\$/i,
  tableros: /tablero|reporte|gr[áa]fica/i,
};

for (const [modulo, palabras] of Object.entries(PALABRAS_POR_MODULO) as [keyof typeof PALABRAS_POR_MODULO, RegExp][]) {
  test(`${modulo} apagado: el texto que el bot manda (y la nota al asesor) no lo menciona`, async () => {
    const e = await escenario(apagadoCon(modulo));
    const c = e.contacto();
    await conversacionCompleta(c);
    await c.escribe("1", AHORA);
    // La cotización (del cotizador, encendido aquí) trae los importes con sus etiquetas «Inscripción: $…» y «Mensualidad: $…»: son precios, no el módulo.
    const texto = todoElTexto(c).replace(/(Inscripción|Mensualidad): \$[\d,.]+/g, "");
    assert.ok(c.mensajes().length >= 3, "el bot sí contestó");
    // Con el cotizador y la clase muestra encendidos aparece su oferta, pero nunca lo de este módulo.
    assert.doesNotMatch(texto.replace(/\$[\d,.]+/g, ""), modulo === "finanzas" ? /pago|cobr|cargo|uniforme|saldo|mensualidad/i : palabras, texto);
  });
}

test("solo la captación encendida: tres preguntas y pase al asesor, sin ninguna oferta", async () => {
  const e = await escenario(SOLO_CAPTACION);
  const c = e.contacto();
  await conversacionCompleta(c);
  assert.deepEqual((await c.conversacion()).estado, "en_atencion_humana");
  assert.doesNotMatch(todoElTexto(c), OFERTA_DEL_COTIZADOR, todoElTexto(c));
  assert.doesNotMatch(todoElTexto(c), /inscrib|inscripci|pago|cobr|asistencia|tablero/i, todoElTexto(c));
});

test("la nota para el asesor no menciona la cotización ni la clase muestra de un módulo apagado, aunque hayan quedado guardadas", async () => {
  const e = await escenario(TODOS_ENCENDIDOS);
  const c = e.contacto();
  await conversacionCompleta(c);
  await c.escribe("1", AHORA);
  await c.escribe("1", AHORA); // agenda la clase muestra y pasa al asesor
  assert.ok(c.notas().some((n) => /Clase muestra:/.test(n)) && c.notas().some((n) => /Programa:/.test(n)), c.notas().join("\n"));
  // Otro contacto del mismo escenario, ya con los módulos apagados: la nota llega sin esas líneas.
  await fijarConfiguracion(prisma, e.org.organizacionId, aFilaDeModulos(SOLO_CAPTACION));
  const d = e.contacto();
  await conversacionCompleta(d);
  assert.ok(d.notas().length > 0);
  assert.doesNotMatch(d.notas().join("\n"), /Clase muestra:|Programa:|Lista de espera|cotiz/i);
});

// ── Regla WH: apagar con la conversación a medias no rompe nada ───────────────────────────────────────

test("WH: el cotizador se apaga con la conversación esperando el horario: el siguiente mensaje no falla (sin 500) y cierra como la captura de siempre", async () => {
  const e = await escenario(TODOS_ENCENDIDOS);
  const c = e.contacto();
  await conversacionCompleta(c);
  assert.equal((await c.conversacion()).paso_captacion, "horario");
  await fijarConfiguracion(prisma, e.org.organizacionId, aFilaDeModulos(apagadoCon("cotizador")));
  const r = await c.escribe("1", AHORA);
  assert.notEqual(r.resultado, "error");
  const conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.estado, "en_atencion_humana");
  assert.doesNotMatch(ultimo(c), /clase muestra|lugares/i);
});

test("WH: la clase muestra se apaga con la propuesta de fechas pendiente: el siguiente mensaje no falla y cierra sin agendar nada", async () => {
  const e = await escenario(TODOS_ENCENDIDOS);
  const c = e.contacto();
  await conversacionCompleta(c);
  await c.escribe("1", AHORA);
  assert.equal((await c.conversacion()).paso_captacion, "fecha_muestra");
  await fijarConfiguracion(prisma, e.org.organizacionId, aFilaDeModulos(apagadoCon("clase_muestra")));
  await c.escribe("1", AHORA);
  const conv = await c.conversacion();
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(await e.db.clase_muestra.count(), 0, "no se agenda lo de un módulo apagado");
});

test("WH: los módulos de la organización de OTRA bandeja no se mezclan: apagar en una no cambia lo que el bot de la otra ofrece", async () => {
  const a = await escenario(apagadoCon("cotizador"));
  const b = await escenario(TODOS_ENCENDIDOS);
  const ca = a.contacto();
  const cb = b.contacto();
  await conversacionCompleta(ca);
  await conversacionCompleta(cb);
  assert.match(ultimo(ca), /Un asesor te escribe/);
  assert.match(ultimo(cb), /te recomiendo/);
});

// ── El mantenimiento del cotizador ─────────────────────────────────────────────────────────────────────

test("cotizador apagado: el barrido que vence cotizaciones no toca las de esa organización; encendido, sí", async () => {
  const e = await escenario(TODOS_ENCENDIDOS);
  const c = e.contacto();
  await conversacionCompleta(c); // deja una cotización vigente
  const cot = await e.db.cotizacion.findFirstOrThrow({ where: {} });
  assert.equal(cot.estatus, "vigente");
  const lejos = new Date("2027-06-01T12:00:00Z");
  await fijarConfiguracion(prisma, e.org.organizacionId, aFilaDeModulos(apagadoCon("cotizador")));
  const apagado = await vencerCotizacionesDeTodas({ prisma, reloj: () => lejos, organizacionId: e.org.organizacionId });
  assert.deepEqual([apagado.vencidas, apagado.errores], [0, 0]);
  assert.equal((await e.db.cotizacion.findFirstOrThrow({ where: {} })).estatus, "vigente");
  await fijarConfiguracion(prisma, e.org.organizacionId, aFilaDeModulos(TODOS_ENCENDIDOS));
  const encendido = await vencerCotizacionesDeTodas({ prisma, reloj: () => lejos, organizacionId: e.org.organizacionId });
  assert.equal(encendido.vencidas, 1);
  assert.equal((await e.db.cotizacion.findFirstOrThrow({ where: {} })).estatus, "vencida");
});
