// D2: el aviso al maestro de una clase muestra. Por WhatsApp, a través de MessagingProvider (plantilla fuera de la ventana de servicio,
// horario de envío con recorrer o descartar, baja, frecuencia; `en_atencion_humana` no aplica), y en la aplicación (la lista y el
// «visto»). Idempotente. Postgres real y el transporte falso.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance, altaConAlcance, type BaseDatos } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { agendarClaseMuestra, cancelarClaseMuestra, reprogramarClaseMuestra, type ContextoDeAgenda } from "./agenda.ts";
import { barrerAvisosMaestro, crearAvisoMaestro } from "./avisos.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

// Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México (UTC-6, sin horario de verano).
const AHORA = new Date("2026-11-02T18:00:00Z");
const MIERCOLES_4 = new Date("2026-11-05T00:00:00Z"); // miércoles 4, 18:00 local (grupo A)
const MIERCOLES_11 = new Date("2026-11-12T00:00:00Z");
const HORA = 3_600_000;

interface Mundo {
  org: OrganizacionDePrueba;
  db: BaseDatos;
  transporte: TransporteFalso;
  grupoId: string;
  grupo2Id: string;
  instructorId: string;
  instructor2Id: string;
  telefono: string;
  usuarioId: string;
  fuente: OcupacionFija;
  provider(ahora?: Date): MessagingProvider;
  ctx(ahora?: Date): ContextoDeAgenda;
  barrer(ahora: Date): ReturnType<typeof barrerAvisosMaestro>;
  agendar(fecha?: Date, grupoId?: string, ahora?: Date): Promise<string>;
  avisos(): Promise<{ tipo: string; entrega: string; motivo_entrega: string | null; programado_para: Date; instructor_id: string; clase_muestra_id: string }[]>;
}

let secuencia = 0;
async function mundo(o: { conTelefono?: boolean; plantillas?: boolean; zona?: string } = {}): Promise<Mundo> {
  const org = await sembrarOrganizacion(prisma, "Aviso al maestro");
  await sembrarEmbudo(prisma, org);
  const sucursalId = org.sucursales[0]!.id;
  if (o.zona) await prisma.sucursal.update({ where: { id: sucursalId }, data: { zona_horaria: o.zona } });
  const telefono = `+5255${String(40_000_000 + ++secuencia * 13 + (Date.now() % 1000))}`;
  const instructor = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, nombre: "Maestra Ana", telefono: o.conTelefono === false ? null : telefono } });
  const instructor2 = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, nombre: "Maestro Beto", telefono: `+5255${String(50_000_000 + secuencia * 17 + (Date.now() % 1000))}` } });
  const p = await sembrarPrograma(prisma, org, {
    sucursalId,
    nombre: "Programa P",
    edadMin: 3,
    edadMax: 12,
    grupos: [
      { nombre: "Grupo A", cupoMaximo: 10, horarios: [[3, 1080, 1140]] }, // miércoles 18:00
      { nombre: "Grupo B", cupoMaximo: 10, horarios: [[3, 1080, 1140]] },
    ],
  });
  await prisma.grupo.update({ where: { id: p.grupos[0]!.id }, data: { instructor_id: instructor.id } });
  await prisma.grupo.update({ where: { id: p.grupos[1]!.id }, data: { instructor_id: instructor2.id } });
  if (o.plantillas !== false) {
    const defs: [string, string, string][] = [
      ["aviso_maestro_agendada", '[{"pos":1,"nombre":"nombre_alumno"},{"pos":2,"nombre":"nombre_grupo"},{"pos":3,"nombre":"fecha_clase"},{"pos":4,"nombre":"hora_clase"}]', "Nueva clase muestra: {{1}} en {{2}}, el {{3}} a las {{4}}."],
      ["aviso_maestro_reprogramada", '[{"pos":1,"nombre":"nombre_alumno"},{"pos":2,"nombre":"nombre_grupo"},{"pos":3,"nombre":"fecha_clase"},{"pos":4,"nombre":"hora_clase"},{"pos":5,"nombre":"fecha_anterior"}]', "Se cambió la clase de {{1}} en {{2}}: era {{5}}, ahora {{3}} a las {{4}}."],
      ["aviso_maestro_cancelada", '[{"pos":1,"nombre":"nombre_alumno"},{"pos":2,"nombre":"nombre_grupo"},{"pos":3,"nombre":"fecha_clase"},{"pos":4,"nombre":"hora_clase"}]', "Se canceló la clase de {{1}} en {{2}} del {{3}} a las {{4}}."],
    ];
    for (const [codigo, variables, cuerpo] of defs) {
      await prisma.plantilla_mensaje.create({ data: { organizacion_id: org.organizacionId, codigo, content_sid: `HX${codigo.length}0000000000000000000000000000000`.slice(0, 34), categoria: "utility", variables: JSON.parse(variables) as object, cuerpo_referencia: cuerpo, estado_aprobacion: "aprobada" } });
    }
  }
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `a-${Math.random()}@p.test`, nombre: "Asesor", rol: "asesor", contrasena_hash: "x" } });
  const db = conAlcance(prisma, org.organizacionId);
  const transporte = new TransporteFalso();
  const fuente = new OcupacionFija();
  const provider = (ahora = AHORA) => new MessagingProvider({ transporte, reloj: () => ahora });
  const ctx = (ahora = AHORA): ContextoDeAgenda => ({ ahora, fuente, origen: { tipo: "usuario", usuarioId: usuario.id } });
  return {
    org,
    db,
    transporte,
    grupoId: p.grupos[0]!.id,
    grupo2Id: p.grupos[1]!.id,
    instructorId: instructor.id,
    instructor2Id: instructor2.id,
    telefono,
    usuarioId: usuario.id,
    fuente,
    provider,
    ctx,
    barrer: (ahora) => barrerAvisosMaestro({ prisma, mensajeria: provider(ahora), reloj: () => ahora, organizacionId: org.organizacionId }),
    async agendar(fecha = MIERCOLES_4, grupoId = p.grupos[0]!.id, ahora = AHORA) {
      const f = await sembrarFamilia(prisma, org, { sucursalId, nombre: `Alumno ${++secuencia}` });
      const r = await db.$transaction((tx) => agendarClaseMuestra(tx, ctx(ahora), { prospectoId: f.prospectoId, grupoId, fechaHora: fecha }));
      assert.ok(r.ok, JSON.stringify(r));
      return r.clase.id;
    },
    avisos: () => db.aviso_maestro.findMany({ select: { tipo: true, entrega: true, motivo_entrega: true, programado_para: true, instructor_id: true, clase_muestra_id: true }, orderBy: { creado_en: "asc" } }),
  };
}

const plantillas = (m: Mundo) => m.transporte.envios.filter((e) => e.tipo === "plantilla");

test("D2: agendar, reprogramar y cancelar crean UN aviso para el instructor del grupo, con el alumno, el grupo, la fecha y la hora", async () => {
  const m = await mundo();
  const claseId = await m.agendar();
  const [a] = await m.avisos();
  assert.deepEqual([a!.tipo, a!.entrega, a!.instructor_id, a!.clase_muestra_id], ["agendada", "pendiente", m.instructorId, claseId]);
  const fila = await m.db.aviso_maestro.findFirstOrThrow({ where: { clase_muestra_id: claseId } });
  const datos = fila.datos as Record<string, string>;
  assert.match(datos["nombre_alumno"]!, /^Alumno \d+$/);
  assert.deepEqual([datos["nombre_grupo"], datos["nombre_sucursal"], datos["fecha_clase"], datos["hora_clase"], datos["fecha_hora"]], ["Grupo A", "Norte", "miércoles 4 de noviembre", "18:00", MIERCOLES_4.toISOString()]);
  assert.equal(JSON.stringify(datos).match(/alergia|medic|condici|salud|emergencia/i), null, "nunca datos de salud");

  // Reprogramar al otro grupo (otro instructor): el nuevo recibe «reprogramada» con la fecha anterior y el anterior, «cancelada».
  const r = await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId, fechaHora: MIERCOLES_11, grupoId: m.grupo2Id }));
  assert.ok(r.ok);
  const todos = await m.avisos();
  assert.deepEqual(todos.map((x) => [x.tipo, x.instructor_id]).sort(), [["agendada", m.instructorId], ["cancelada", m.instructorId], ["reprogramada", m.instructor2Id]]);
  const rep = (await m.db.aviso_maestro.findFirstOrThrow({ where: { tipo: "reprogramada" } })).datos as Record<string, string>;
  assert.equal(rep["fecha_anterior"], "miércoles 4 de noviembre a las 18:00");
  assert.equal(rep["fecha_clase"], "miércoles 11 de noviembre");

  // Misma instructora al reprogramar: UN solo aviso «reprogramada», sin «cancelada» aparte.
  const otra = await m.agendar(MIERCOLES_4, m.grupoId);
  await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: otra, fechaHora: MIERCOLES_11 }));
  const deOtra = (await m.avisos()).filter((x) => x.instructor_id === m.instructorId);
  assert.equal(deOtra.filter((x) => x.clase_muestra_id === otra || x.tipo === "reprogramada").length >= 2, true);
  const nueva = await m.db.clase_muestra.findFirstOrThrow({ where: { reprogramada_de_id: otra } });
  assert.deepEqual((await m.avisos()).filter((x) => x.clase_muestra_id === nueva.id).map((x) => x.tipo), ["reprogramada"]);
  assert.equal((await m.avisos()).filter((x) => x.clase_muestra_id === otra && x.tipo === "cancelada").length, 0);

  // Cancelar.
  const c = await m.agendar(MIERCOLES_11, m.grupoId);
  await m.db.$transaction((tx) => cancelarClaseMuestra(tx, c, "se enfermó", AHORA));
  assert.deepEqual((await m.avisos()).filter((x) => x.clase_muestra_id === c).map((x) => x.tipo), ["agendada", "cancelada"]);
});

test("D2: un reintento no duplica el aviso (uno por clase y tipo, también en la base)", async () => {
  const m = await mundo();
  const claseId = await m.agendar();
  const dos = await m.db.$transaction(async (tx) => [await crearAvisoMaestro(tx, { claseId, tipo: "agendada", ahora: AHORA }), await crearAvisoMaestro(tx, { claseId, tipo: "agendada", ahora: AHORA })]);
  assert.deepEqual(dos.map((x) => x.creado), [false, false]);
  assert.equal(await m.db.aviso_maestro.count({ where: { clase_muestra_id: claseId } }), 1);
  await assert.rejects(() => prisma.aviso_maestro.create({ data: { organizacion_id: m.org.organizacionId, instructor_id: m.instructorId, clase_muestra_id: claseId, tipo: "agendada", datos: {}, programado_para: AHORA } }), /Unique|aviso_maestro_clase_tipo_key/);
  // Pero otro tipo para la misma clase sí.
  await m.db.$transaction((tx) => crearAvisoMaestro(tx, { claseId, tipo: "cancelada", ahora: AHORA }));
  assert.equal(await m.db.aviso_maestro.count({ where: { clase_muestra_id: claseId } }), 2);
});

test("D2: un grupo sin instructor (o con uno inactivo) no genera aviso", async () => {
  const m = await mundo();
  await prisma.grupo.update({ where: { id: m.grupoId }, data: { instructor_id: null } });
  await m.agendar(MIERCOLES_4, m.grupoId);
  assert.equal(await m.db.aviso_maestro.count(), 0);
  await prisma.instructor.update({ where: { id: m.instructor2Id }, data: { activo: false } });
  await m.agendar(MIERCOLES_4, m.grupo2Id);
  assert.equal(await m.db.aviso_maestro.count(), 0);
});

test("D2: el barrido lo manda por MessagingProvider: abre la conversación del instructor, usa la plantilla aprobada y no repite", async () => {
  const m = await mundo();
  const claseId = await m.agendar();
  const r = await m.barrer(AHORA);
  assert.equal(r.enviados, 1);
  assert.deepEqual(m.transporte.envios.map((e) => e.tipo), ["iniciar", "plantilla"]);
  const iniciar = m.transporte.envios[0]!;
  assert.deepEqual([iniciar.contacto?.telefono, iniciar.contacto?.nombre], [m.telefono, "Maestra Ana"]);
  const p = plantillas(m)[0]!;
  assert.equal(p.plantilla?.codigo, "aviso_maestro_agendada");
  const alumno = (await m.db.prospecto.findFirstOrThrow({ where: { clases_muestra: { some: { id: claseId } } } })).nombre!;
  assert.equal(p.texto, `Nueva clase muestra: ${alumno} en Grupo A, el miércoles 4 de noviembre a las 18:00.`);
  assert.deepEqual(p.plantilla?.variables, { "1": alumno, "2": "Grupo A", "3": "miércoles 4 de noviembre", "4": "18:00" });
  const a = await m.db.aviso_maestro.findFirstOrThrow({ where: { clase_muestra_id: claseId } });
  assert.equal(a.entrega, "enviado");
  assert.ok(a.id_externo && a.enviado_en);
  const ci = await m.db.conversacion_instructor.findMany({});
  assert.equal(ci.length, 1);
  assert.equal(ci[0]!.instructor_id, m.instructorId);
  assert.equal(await m.db.lead.count({ where: { telefono: m.telefono } }), 0, "el instructor no es un lead");
  // Otro barrido no manda nada más.
  assert.equal((await m.barrer(AHORA)).enviados, 0);
  assert.equal(plantillas(m).length, 1);
  // Un segundo aviso al mismo instructor usa la MISMA conversación (no abre otra).
  await m.agendar(MIERCOLES_11);
  assert.equal((await m.barrer(AHORA)).enviados, 1);
  assert.equal(m.transporte.envios.filter((e) => e.tipo === "iniciar").length, 1);
  assert.equal(plantillas(m).length, 2);
  assert.equal(plantillas(m)[1]!.destino.chatwootConversacionId, iniciar.destino.chatwootConversacionId);
});

test("D2: horario 09:00–20:00 de la sucursal — fuera de rango se recorre al siguiente horario válido y sale entonces", async () => {
  const m = await mundo();
  // Se agenda el lunes a las 12:00 y el barrido corre el lunes a las 22:00 locales (04:00Z del martes).
  await m.agendar();
  const noche = new Date("2026-11-03T04:00:00Z");
  const r = await m.barrer(noche);
  assert.equal(r.reprogramados, 1);
  assert.equal(r.enviados, 0);
  assert.equal(m.transporte.envios.length, 0, "nada sale de madrugada, ni la apertura de la conversación");
  const [a] = await m.avisos();
  assert.deepEqual([a!.entrega, a!.programado_para.toISOString()], ["pendiente", "2026-11-03T15:00:00.000Z"]); // martes 09:00 locales
  assert.equal((await m.barrer(new Date("2026-11-03T14:59:00Z"))).enviados, 0, "un minuto antes de las 9 todavía no");
  assert.equal((await m.barrer(new Date("2026-11-03T15:00:00Z"))).enviados, 1);
});

test("D2: si recorrerlo al siguiente horario válido lo deja a la hora de la clase o después, se descarta y se registra", async () => {
  const m = await mundo();
  // Clase el miércoles 4 a las 18:00; el aviso ya está atrasado y el barrido corre el miércoles a las 21:00 locales: ya no tiene caso.
  await m.agendar();
  const tarde = new Date("2026-11-05T03:00:00Z"); // miércoles 4, 21:00 locales: la clase fue a las 18:00
  const r = await m.barrer(tarde);
  assert.equal(r.descartados, 1);
  assert.deepEqual((await m.avisos()).map((x) => [x.entrega, x.motivo_entrega]), [["descartado", "evento_pasado"]]);
  assert.equal(m.transporte.envios.length, 0);

  // Una clase a las 09:00 en punto: el aviso de las 07:00 se recorre a las 09:00 = la hora de la clase → se descarta (el borde: >=).
  const n = await mundo();
  await prisma.grupo_horario.updateMany({ where: { grupo_id: n.grupoId }, data: { hora_inicio_min: 540, hora_fin_min: 600 } });
  const clase = new Date("2026-11-04T15:00:00Z"); // miércoles 4, 09:00 locales
  await n.agendar(clase);
  await prisma.aviso_maestro.updateMany({ where: { organizacion_id: n.org.organizacionId }, data: { programado_para: new Date("2026-11-04T13:00:00Z") } }); // 07:00 locales
  const r2 = await n.barrer(new Date("2026-11-04T13:00:00Z"));
  assert.equal(r2.descartados, 1, "recorrido a las 09:00 = la hora de la clase → descartado");
  // Una clase a las 09:01: el aviso recorrido a las 09:00 todavía llega a tiempo.
  const k = await mundo();
  await prisma.grupo_horario.updateMany({ where: { grupo_id: k.grupoId }, data: { hora_inicio_min: 541, hora_fin_min: 600 } });
  await k.agendar(new Date("2026-11-04T15:01:00Z"));
  await prisma.aviso_maestro.updateMany({ where: { organizacion_id: k.org.organizacionId }, data: { programado_para: new Date("2026-11-04T13:00:00Z") } });
  assert.equal((await k.barrer(new Date("2026-11-04T13:00:00Z"))).reprogramados, 1);
  assert.equal((await k.avisos())[0]!.programado_para.toISOString(), "2026-11-04T15:00:00.000Z");
});

test("D2: el horario es el de la sucursal del grupo, no el del servidor (Tokio: 03:00 locales, 18:00Z, está fuera)", async () => {
  const m = await mundo({ zona: "Asia/Tokyo" });
  // Miércoles 18:00 de Tokio = 09:00Z. Se agenda el 2 de noviembre (lunes, 03:00 en Tokio = 18:00Z del domingo).
  const clase = new Date("2026-11-04T09:00:00Z");
  await m.agendar(clase, m.grupoId, new Date("2026-10-30T00:00:00Z"));
  const r = await m.barrer(new Date("2026-11-02T18:00:00Z")); // 03:00 en Tokio
  assert.equal(r.reprogramados, 1);
  assert.equal((await m.avisos())[0]!.programado_para.toISOString(), "2026-11-03T00:00:00.000Z"); // martes 09:00 en Tokio
  assert.equal((await m.barrer(new Date("2026-11-03T00:00:00Z"))).enviados, 1);
});

test("D2: dentro de la ventana de servicio del instructor sale mensaje libre; fuera, solo plantilla (invariante 5)", async () => {
  const m = await mundo();
  await m.agendar();
  // El instructor ya había hablado: tiene su conversación y escribió hace 2 h (ventana abierta 22 h más).
  const bandeja = m.org.bandejaId;
  await prisma.conversacion_instructor.create({ data: { organizacion_id: m.org.organizacionId, instructor_id: m.instructorId, bandeja_chatwoot_id: bandeja, chatwoot_conversacion_id: 777_001, ventana_servicio_hasta: new Date(AHORA.getTime() + 22 * HORA), ultimo_mensaje_entrante_en: new Date(AHORA.getTime() - 2 * HORA) } });
  await m.barrer(AHORA);
  assert.deepEqual(m.transporte.envios.map((e) => e.tipo), ["mensaje"]);
  assert.equal(m.transporte.envios[0]!.destino.chatwootConversacionId, 777_001, "usa su conversación, no abre otra");
  assert.match(m.transporte.envios[0]!.texto ?? "", /^Nueva clase muestra: .* en Grupo A, el miércoles 4 de noviembre a las 18:00\.$/);
  // La ventana cerrada → plantilla.
  await m.agendar(MIERCOLES_11);
  await prisma.conversacion_instructor.updateMany({ where: { instructor_id: m.instructorId }, data: { ventana_servicio_hasta: new Date(AHORA.getTime() - HORA) } });
  await m.barrer(AHORA);
  assert.deepEqual(m.transporte.envios.map((e) => e.tipo), ["mensaje", "plantilla"]);
});

test("D2: sin plantilla apta y con la ventana cerrada NO se manda: queda bloqueado y se crea tarea para el asesor (invariante 5)", async () => {
  const m = await mundo({ plantillas: false });
  const claseId = await m.agendar();
  const r = await m.barrer(AHORA);
  assert.equal(r.bloqueados, 1);
  assert.equal(m.transporte.envios.length, 0);
  assert.deepEqual((await m.avisos()).map((x) => [x.entrega, x.motivo_entrega]), [["bloqueado", "fuera_de_ventana"]]);
  const t = await m.db.tarea_asesor.findMany({ where: { clase_muestra_id: claseId } });
  assert.equal(t.length, 1);
  assert.equal(t[0]!.tipo, "aviso_maestro_no_enviado");
  assert.match(t[0]!.descripcion, /Maestra Ana.*plantilla aprobada/);
  assert.equal((await m.barrer(AHORA)).bloqueados, 0, "no se reintenta ni repite la tarea");
  assert.equal(await m.db.tarea_asesor.count({ where: { clase_muestra_id: claseId } }), 1);
  // Una plantilla pendiente de aprobación tampoco cuenta.
  const n = await mundo();
  await prisma.plantilla_mensaje.updateMany({ where: { organizacion_id: n.org.organizacionId }, data: { estado_aprobacion: "pendiente" } });
  await n.agendar();
  await n.barrer(AHORA);
  assert.equal(n.transporte.envios.length, 0);
});

test("D2: la baja del teléfono del instructor se respeta (opt-out)", async () => {
  const m = await mundo();
  await m.agendar();
  await m.db.consentimiento.create({ data: altaConAlcance({ telefono: m.telefono, estado: "opt_out" as const, alcance: "todo" as const, origen: "palabra_clave" }) });
  const r = await m.barrer(AHORA);
  assert.equal(r.bloqueados, 1);
  assert.equal(m.transporte.envios.length, 0);
  assert.deepEqual((await m.avisos()).map((x) => [x.entrega, x.motivo_entrega]), [["bloqueado", "opt_out"]]);
  assert.equal(await m.db.tarea_asesor.count(), 0, "quien pidió la baja no genera tarea de plantilla");
});

test("D2 / ED-04: la frecuencia (3 automáticos al día por teléfono, configurable) frena los avisos a un instructor pero NO los pierde: se reintentan cada hora", async () => {
  const m = await mundo();
  await fijarConfiguracion(prisma, m.org.organizacionId, { max_automaticos_por_dia: 2 });
  for (let i = 0; i < 3; i++) await m.agendar(new Date(MIERCOLES_4.getTime() + i * 7 * 24 * HORA));
  const r = await m.barrer(AHORA);
  assert.equal(r.enviados, 2);
  assert.equal(r.reprogramados, 1, "el tercero no se pierde: se reprograma");
  assert.equal(r.bloqueados, 0);
  const despues = await m.avisos();
  assert.deepEqual(despues.map((x) => x.entrega).sort(), ["enviado", "enviado", "pendiente"]);
  const pendiente = despues.find((x) => x.entrega === "pendiente")!;
  assert.equal(pendiente.programado_para.toISOString(), new Date(AHORA.getTime() + HORA).toISOString(), "un reintento dentro de una hora");
  assert.equal(await m.db.tarea_asesor.count(), 0, "mientras hay tiempo no hace falta una persona");
  // Una hora después el tope sigue lleno (cuenta 24 h): se vuelve a diferir, sin enviar ni duplicar.
  const unaHora = new Date(AHORA.getTime() + HORA);
  assert.deepEqual([(await m.barrer(unaHora)).enviados, (await m.barrer(unaHora)).enviados], [0, 0]);
  assert.equal(plantillas(m).length + m.transporte.envios.filter((e) => e.tipo === "mensaje").length, 2);
  // 25 horas después ya no cuenta lo de ayer: el aviso diferido SALE (y uno nuevo también).
  const manana = new Date(AHORA.getTime() + 25 * HORA);
  await m.agendar(new Date(MIERCOLES_4.getTime() + 21 * 24 * HORA), m.grupoId, manana);
  assert.equal((await m.barrer(manana)).enviados, 2);
  assert.ok((await m.avisos()).every((x) => x.entrega === "enviado"), JSON.stringify(await m.avisos()));
});

test("ED-04: si el tope diario ya no deja tiempo para reintentar antes de la clase, queda bloqueado y se crea la tarea para el asesor", async () => {
  const m = await mundo();
  await fijarConfiguracion(prisma, m.org.organizacionId, { max_automaticos_por_dia: 1 });
  const c1 = await m.agendar(MIERCOLES_4);
  const c2 = await m.agendar(MIERCOLES_4, m.grupoId);
  // El barrido corre 2 h 30 min antes de la clase: el primero sale; el segundo, reintentado una hora después, caería a 1 h 30 min de la clase (< 2 h).
  const antesDeLaClase = new Date(MIERCOLES_4.getTime() - 150 * 60_000);
  const r = await m.barrer(antesDeLaClase);
  assert.deepEqual([r.enviados, r.bloqueados, r.reprogramados], [1, 1, 0]);
  const avisos = await m.avisos();
  assert.deepEqual(avisos.map((x) => [x.entrega, x.motivo_entrega]).sort(), [["bloqueado", "tope_frecuencia"], ["enviado", null]]);
  const bloqueado = avisos.find((x) => x.entrega === "bloqueado")!;
  const tareas = await m.db.tarea_asesor.findMany({ where: { clase_muestra_id: bloqueado.clase_muestra_id } });
  assert.equal(tareas.length, 1);
  assert.equal(tareas[0]!.tipo, "aviso_maestro_no_enviado");
  assert.match(tareas[0]!.descripcion, /Maestra Ana.*máximo de mensajes automáticos/);
  assert.ok([c1, c2].includes(bloqueado.clase_muestra_id));
  assert.equal((await m.barrer(antesDeLaClase)).bloqueados, 0, "no se repite la tarea");
});

test("D2: sin teléfono solo queda la lista de la aplicación y una tarea para el asesor; el barrido no lo toca", async () => {
  const m = await mundo({ conTelefono: false });
  const claseId = await m.agendar();
  assert.deepEqual((await m.avisos()).map((x) => [x.entrega, x.motivo_entrega]), [["sin_telefono", "sin_telefono"]]);
  const t = await m.db.tarea_asesor.findMany({ where: { clase_muestra_id: claseId } });
  assert.equal(t.length, 1);
  assert.match(t[0]!.descripcion, /no tiene teléfono registrado/);
  const r = await m.barrer(AHORA);
  assert.deepEqual([r.enviados, r.bloqueados], [0, 0]);
  assert.equal(m.transporte.envios.length, 0);
  assert.equal(await m.db.tarea_asesor.count({ where: { clase_muestra_id: claseId } }), 1);
});

test("D2: en_atencion_humana NO aplica a un instructor (aunque su número sea también el de un contacto atendido por una persona)", async () => {
  const m = await mundo();
  await m.agendar();
  // El mismo teléfono es de un contacto cuya conversación atiende una persona.
  const lead = await prisma.lead.create({ data: { organizacion_id: m.org.organizacionId, vertical_interes_id: m.org.verticalId, sucursal_interes_id: m.org.sucursales[0]!.id, etapa_id: m.org.etapaInicialId, telefono: m.telefono } });
  await prisma.conversacion.create({ data: { organizacion_id: m.org.organizacionId, bandeja_chatwoot_id: m.org.bandejaId, lead_id: lead.id, chatwoot_conversacion_id: 888_001, estado: "en_atencion_humana" } });
  assert.equal((await m.barrer(AHORA)).enviados, 1);
});

test("D2: un envío que falla no se reintenta solo y deja tarea; uno incierto NUNCA se reenvía", async () => {
  const m = await mundo();
  await m.agendar();
  m.transporte.fallarSi = (e) => e.tipo === "plantilla";
  const r = await m.barrer(AHORA);
  assert.equal(r.fallidos, 1);
  assert.deepEqual((await m.avisos()).map((x) => [x.entrega, x.motivo_entrega]), [["fallido", "envio_fallido"]]);
  assert.equal(await m.db.tarea_asesor.count({ where: { tipo: "aviso_maestro_no_enviado" } }), 1);
  m.transporte.fallarSi = undefined;
  assert.equal((await m.barrer(AHORA)).enviados, 0, "no se reintenta sola");

  const n = await mundo();
  await n.agendar();
  n.transporte.inciertoSi = (e) => e.tipo === "plantilla";
  assert.equal((await n.barrer(AHORA)).fallidos, 1);
  assert.deepEqual((await n.avisos()).map((x) => [x.entrega, x.motivo_entrega]), [["fallido", "envio_incierto"]]);
  assert.equal(plantillas(n).length, 1, "salió una vez y no se reenvía");
  n.transporte.inciertoSi = undefined;
  await n.barrer(AHORA);
  assert.equal(plantillas(n).length, 1);
  assert.match((await n.db.tarea_asesor.findFirstOrThrow({ where: { tipo: "aviso_maestro_no_enviado" } })).descripcion, /no se sabe si salió/);
});

test("D2: un aviso que quedó 'enviando' (el proceso murió a media operación) se recupera como envío incierto, sin reenviar", async () => {
  const m = await mundo();
  await m.agendar();
  await prisma.aviso_maestro.updateMany({ where: { organizacion_id: m.org.organizacionId }, data: { entrega: "enviando", actualizado_en: new Date(AHORA.getTime() - 10 * 60_000) } });
  const r = await m.barrer(AHORA);
  assert.equal(r.recuperados, 1);
  assert.deepEqual((await m.avisos()).map((x) => [x.entrega, x.motivo_entrega]), [["fallido", "envio_incierto"]]);
  assert.equal(m.transporte.envios.length, 0);
  assert.equal(await m.db.tarea_asesor.count({ where: { tipo: "aviso_maestro_no_enviado" } }), 1);
  assert.equal((await m.barrer(AHORA)).recuperados, 0, "idempotente");
});

test("D2: una clase cancelada antes de avisar no manda el «agendada»; el «cancelada» no avisa de lo que el instructor nunca supo", async () => {
  const m = await mundo();
  const claseId = await m.agendar();
  await m.db.$transaction((tx) => cancelarClaseMuestra(tx, claseId, null, AHORA));
  const r = await m.barrer(AHORA);
  assert.equal(m.transporte.envios.filter((e) => e.tipo === "plantilla" || e.tipo === "mensaje").length, 0, "no se manda ni lo uno ni lo otro por WhatsApp");
  assert.deepEqual((await m.avisos()).map((x) => [x.tipo, x.entrega, x.motivo_entrega]), [["agendada", "descartado", "clase_ya_no_vigente"], ["cancelada", "descartado", "nunca_se_aviso"]]);
  assert.equal(r.enviados, 0);
});

test("D2 (concurrencia): cinco barridos a la vez mandan UNA sola vez el mismo aviso y abren UNA conversación", async () => {
  const m = await mundo();
  await m.agendar();
  m.transporte.demoraMs = 40;
  assert.deepEqual(await m.provider(AHORA).avisarAInstructor(m.db, "00000000-0000-4000-8000-000000000000"), { resultado: "ya_procesado" });
  const id = (await m.db.aviso_maestro.findFirstOrThrow({ select: { id: true } })).id;
  const res = await Promise.all(Array.from({ length: 5 }, () => m.provider(AHORA).avisarAInstructor(m.db, id)));
  assert.equal(res.filter((r) => r.resultado === "enviado").length, 1);
  assert.equal(plantillas(m).length, 1);
  assert.equal(m.transporte.envios.filter((e) => e.tipo === "iniciar").length, 1);
});

test("D2 (concurrencia): dos avisos al mismo instructor, sin conversación, a la vez → una sola conversación abierta", async () => {
  const m = await mundo();
  await m.agendar(MIERCOLES_4);
  await m.agendar(MIERCOLES_11);
  m.transporte.demoraMs = 30;
  const ids = (await m.db.aviso_maestro.findMany({ select: { id: true } })).map((a) => a.id);
  const res = await Promise.all(ids.map((id) => m.provider(AHORA).avisarAInstructor(m.db, id)));
  assert.equal(res.filter((r) => r.resultado === "enviado").length, 2);
  assert.equal(m.transporte.envios.filter((e) => e.tipo === "iniciar").length, 1, "una conversación, no dos");
  assert.equal(await m.db.conversacion_instructor.count(), 1);
});

test("D2: no-fuga entre organizaciones — el barrido de una no manda los avisos de otra", async () => {
  const a = await mundo();
  const b = await mundo();
  await a.agendar();
  await b.agendar();
  const r = await a.barrer(AHORA);
  assert.equal(r.enviados, 1);
  assert.equal(await b.db.aviso_maestro.count({ where: { entrega: "enviado" } }), 0);
  assert.equal(b.transporte.envios.length, 0);
});
