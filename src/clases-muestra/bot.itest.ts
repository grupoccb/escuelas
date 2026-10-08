// D1: el bot de WhatsApp agenda la clase muestra después de que el contacto elige horario en el cotizador (C8): propone las
// próximas fechas con lugar, agenda con la elección y NO pasa la conversación a una persona (los recordatorios necesitan que
// siga con el bot: invariante 6). Con la clase muestra apagada, el flujo es el de antes. Postgres real, el loop completo.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escenarioBot, type ContactoBot, type EscenarioBot, type OpcionesEscenarioBot } from "../testutil/bot.ts";
import { OcupacionFija, sembrarFamilia } from "../testutil/semilla.ts";
import { agendarClaseMuestra } from "./agenda.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

// Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México. El grupo da clase los lunes a las 16:00 (22:00 UTC).
const AHORA = new Date("2026-11-02T18:00:00Z");
const SESION = (dias: number): Date => new Date(new Date("2026-11-02T22:00:00Z").getTime() + dias * 86_400_000);

async function escenario(o: Partial<OpcionesEscenarioBot> & { cupo?: number; listaEspera?: boolean } = {}): Promise<EscenarioBot> {
  const { cupo, listaEspera, ...resto } = o;
  return escenarioBot(prisma, {
    claseMuestra: true,
    embudo: true,
    ...resto,
    programas: [
      {
        sucursal: 0,
        nombre: "Programa uno",
        edadMin: 3,
        edadMax: 12,
        grupos: [{ nombre: "Grupo A", cupoMaximo: cupo ?? 3, permiteListaEspera: listaEspera ?? false, horarios: [[1, 960, 1020]] }],
        precio: { inscripcion: "500.00", mensualidad: "300.00" },
      },
    ],
  });
}

/** Llega hasta la cotización y elige el horario 1: el bot propone las fechas. */
async function hastaLasFechas(c: ContactoBot): Promise<void> {
  for (const t of ["Hola", "Luis", "8", "1", "1"]) await c.escribe(t, AHORA);
}
const ultimo = (c: ContactoBot): string => c.mensajes().at(-1) ?? "";

test("D1 bot: tras elegir horario propone las próximas fechas con lugar y agenda con la elección, sin pasar la conversación a una persona", async () => {
  const e = await escenario();
  const c = e.contacto();
  await hastaLasFechas(c);
  const propuesta = ultimo(c);
  assert.match(propuesta, /clase muestra en Grupo A/);
  assert.match(propuesta, /1\. lunes 2 de noviembre a las 16:00 · 3 lugares/);
  assert.match(propuesta, /2\. lunes 9 de noviembre a las 16:00 · 3 lugares/);
  assert.match(propuesta, /5\. lunes 30 de noviembre a las 16:00/);
  assert.doesNotMatch(propuesta, /6\./, "a lo más cinco");
  assert.match(propuesta, /asesor/, "«asesor» siempre disponible");
  assert.equal((await c.conversacion()).paso_captacion, "fecha_muestra");

  await c.escribe("2", AHORA);
  assert.match(ultimo(c), /Agendamos la clase muestra de Luis en Grupo A, sucursal Norte: lunes 9 de noviembre a las 16:00/);
  const conv = await c.conversacion();
  assert.equal(conv.estado, "bot", "el bot sigue atendiendo: con una persona a cargo no saldrían los recordatorios");
  assert.equal(conv.paso_captacion, "completo");
  assert.equal(conv.pasar_a_asesor_pendiente, false);
  assert.equal(conv.muestra_ofrecida, null);
  const clases = await e.db.clase_muestra.findMany({ where: { lead_id: conv.lead_id } });
  assert.equal(clases.length, 1);
  assert.deepEqual([clases[0]!.estatus, clases[0]!.agendada_por, clases[0]!.conversacion_id, clases[0]!.fecha_hora.toISOString()], ["agendada", "bot", conv.id, SESION(7).toISOString()]);
  assert.equal((await e.db.lead.findFirstOrThrow({ where: { id: conv.lead_id } })).etapa_id, e.etapas!.muestra_agendada);
  // El asesor se entera: nota interna con la clase y la conversación visible (abierta) sin estar atendida.
  assert.ok(c.notas().some((n) => /Clase muestra: lunes 9 de noviembre a las 16:00 \(Grupo A\)/.test(n) && /agendó una clase muestra/.test(n)), c.notas().join("\n"));
  assert.ok(c.envios().some((x) => x.tipo === "abrir"));
  assert.ok(conv.visible_a_asesores_en && conv.abierta_para_asesores_en);
});

test("D1 bot: el número apunta a lo que el contacto VIO: si la primera fecha se llena, se le dice y se le mandan las que quedan", async () => {
  const e = await escenario({ cupo: 1 });
  const c = e.contacto();
  await hastaLasFechas(c);
  // Otra familia toma el único lugar del lunes 2 mientras el contacto decide.
  const f = await sembrarFamilia(prisma, e.org, { sucursalId: e.org.sucursales[0]!.id });
  const grupoId = e.programas[0]!.grupos[0]!.id;
  const usuario = await prisma.usuario.create({ data: { organizacion_id: e.org.organizacionId, correo: `x-${Math.random()}@p.test`, nombre: "A", rol: "asesor", contrasena_hash: "x" } });
  const ocupar = await e.db.$transaction((tx) => agendarClaseMuestra(tx, { ahora: AHORA, fuente: new OcupacionFija(), origen: { tipo: "usuario", usuarioId: usuario.id } }, { prospectoId: f.prospectoId, grupoId, fechaHora: SESION(0) }));
  assert.ok(ocupar.ok);

  await c.escribe("1", AHORA); // la que vio como «1»
  assert.match(ultimo(c), /Esa fecha ya no tiene lugar/);
  assert.match(ultimo(c), /1\. lunes 9 de noviembre/, "ya no ofrece el 2 de noviembre");
  assert.equal(await e.db.clase_muestra.count({ where: { lead_id: (await c.conversacion()).lead_id } }), 0);
  assert.equal((await c.conversacion()).paso_captacion, "fecha_muestra");
  await c.escribe("1", AHORA); // ahora «1» es el 9
  assert.match(ultimo(c), /Agendamos la clase muestra.*lunes 9 de noviembre/);
});

test("D1 bot: «asesor» en cualquier momento pasa a una persona; una respuesta que no entiende se repite y a la tercera pasa", async () => {
  const e = await escenario();
  const a = e.contacto();
  await hastaLasFechas(a);
  await a.escribe("asesor", AHORA);
  assert.equal((await a.conversacion()).estado, "en_atencion_humana");
  assert.equal(await e.db.clase_muestra.count({ where: { lead_id: (await a.conversacion()).lead_id } }), 0);

  const b = e.contacto();
  await hastaLasFechas(b);
  await b.escribe("mañana", AHORA);
  assert.match(ultimo(b), /Responde con el número de la fecha/);
  await b.escribe("el martes", AHORA);
  assert.equal((await b.conversacion()).estado, "bot");
  await b.escribe("quién sabe", AHORA);
  assert.equal((await b.conversacion()).estado, "en_atencion_humana", "tercer intento fallido");
  const v = e.contacto();
  await hastaLasFechas(v);
  await v.escribe("9", AHORA); // un número fuera de la lista
  assert.match(ultimo(v), /Responde con el número de la fecha/);
});

test("D1 bot: con la clase muestra apagada el flujo no cambia (cierra con el horario y pasa al asesor)", async () => {
  const e = await escenario({ claseMuestra: false });
  const c = e.contacto();
  for (const t of ["Hola", "Luis", "8", "1", "1"]) await c.escribe(t, AHORA);
  assert.match(ultimo(c), /Anotamos a Luis en Grupo A/);
  assert.equal((await c.conversacion()).estado, "en_atencion_humana");
  assert.equal(await e.db.clase_muestra.count(), 0);
  assert.equal((await c.conversacion()).muestra_ofrecida, null);
});

test("D1 bot: sin el cotizador la clase muestra no se ofrece (depende de él)", async () => {
  const e = await escenario({ cotizador: false });
  const c = e.contacto();
  for (const t of ["Hola", "Luis", "8", "1"]) await c.escribe(t, AHORA);
  assert.match(ultimo(c), /Un asesor te escribe/);
  assert.equal(await e.db.clase_muestra.count(), 0);
});

test("D1 bot: si el grupo no tiene ninguna fecha con lugar, cierra como antes (un asesor lo resuelve)", async () => {
  const e = await escenario({ cupo: 3 });
  const grupoId = e.programas[0]!.grupos[0]!.id;
  const c = e.contacto();
  for (const t of ["Hola", "Luis", "8", "1"]) await c.escribe(t, AHORA);
  // Mientras ve la cotización, el horizonte se llena: cada sesión que le cabe tiene ya sus 3 lugares ocupados.
  const sesiones = Array.from({ length: 9 }, (_, i) => SESION(7 * i));
  const usuario = await prisma.usuario.create({ data: { organizacion_id: e.org.organizacionId, correo: `y-${Math.random()}@p.test`, nombre: "A", rol: "asesor", contrasena_hash: "x" } });
  for (const s of sesiones) {
    for (let k = 0; k < 3; k++) {
      const f = await sembrarFamilia(prisma, e.org, { sucursalId: e.org.sucursales[0]!.id });
      await e.db.$transaction((tx) => agendarClaseMuestra(tx, { ahora: AHORA, fuente: new OcupacionFija(), origen: { tipo: "usuario", usuarioId: usuario.id } }, { prospectoId: f.prospectoId, grupoId, fechaHora: s }));
    }
  }
  await c.escribe("1", AHORA);
  assert.match(ultimo(c), /Anotamos a Luis en Grupo A/, "el cierre de siempre");
  assert.equal((await c.conversacion()).estado, "en_atencion_humana");
});

test("D1 bot: después de agendar, un «gracias» NO pasa la conversación a una persona; cualquier otra cosa sí", async () => {
  const e = await escenario();
  const c = e.contacto();
  await hastaLasFechas(c);
  await c.escribe("1", AHORA);
  await c.escribe("¡Muchas gracias!", AHORA);
  assert.match(ultimo(c), /Con gusto! Te esperamos en la clase muestra \(lunes 2 de noviembre a las 16:00\)/);
  assert.equal((await c.conversacion()).estado, "bot");
  await c.escribe("¿Hay estacionamiento?", AHORA);
  assert.equal((await c.conversacion()).estado, "en_atencion_humana");
});

test("D1 bot: el mismo mensaje entregado dos veces agenda una sola vez (idempotencia)", async () => {
  const e = await escenario();
  const c = e.contacto();
  await hastaLasFechas(c);
  const [a, b] = await Promise.all([c.escribe("2", AHORA, "mensaje-repetido"), c.escribe("2", AHORA, "mensaje-repetido")]);
  assert.ok([a.resultado, b.resultado].includes("procesado"));
  assert.equal(await e.db.clase_muestra.count({ where: { lead_id: (await c.conversacion()).lead_id } }), 1);
});

test("D1 bot (concurrencia): cuatro contactos eligen a la vez la ÚLTIMA plaza de la misma fecha → una gana y las demás reciben otras fechas", async () => {
  const e = await escenario({ cupo: 1 });
  const contactos = [e.contacto(), e.contacto(), e.contacto(), e.contacto()];
  for (const c of contactos) await hastaLasFechas(c);
  await Promise.all(contactos.map((c) => c.escribe("1", AHORA)));
  assert.equal(await e.db.clase_muestra.count({ where: { estatus: "agendada", fecha_hora: SESION(0) } }), 1, "una sola persona tiene la última plaza");
  const ganadoras = contactos.filter((c) => /Agendamos la clase muestra/.test(ultimo(c)));
  const otras = contactos.filter((c) => !/Agendamos la clase muestra/.test(ultimo(c)));
  assert.equal(ganadoras.length, 1);
  for (const c of otras) assert.match(ultimo(c), /Esa fecha ya no tiene lugar/);
  // Ninguna perdió el mensaje: cada una tiene su conversación en la propuesta nueva.
  for (const c of otras) assert.equal((await c.conversacion()).paso_captacion, "fecha_muestra");
});

test("D1 bot: no-fuga — la propuesta de una organización no usa los lugares de otra", async () => {
  const a = await escenario({ cupo: 1 });
  const b = await escenario({ cupo: 1 });
  const ca = a.contacto();
  const cb = b.contacto();
  await hastaLasFechas(ca);
  await hastaLasFechas(cb);
  await ca.escribe("1", AHORA);
  await cb.escribe("1", AHORA);
  assert.match(ultimo(ca), /Agendamos la clase muestra/);
  assert.match(ultimo(cb), /Agendamos la clase muestra/, "el lugar del 2 de noviembre de la otra organización es suyo");
});
