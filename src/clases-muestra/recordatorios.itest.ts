// D3: los recordatorios de 24 h y 2 h de la clase muestra, con el motor real, MessagingProvider y el transporte falso, sin tocar la
// red. Reloj inyectado (varias zonas horarias, un cambio de horario de verano). Cada prueba usa su propia organización.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { conAlcance, altaConAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, POR_UNA_PERSONA } from "../testutil/semilla.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { correrAutomatizaciones, type ResumenMotor } from "../automatizaciones/motor.ts";
import { agendarClaseMuestra, cancelarClaseMuestra, reprogramarClaseMuestra, type ContextoDeAgenda } from "./agenda.ts";
import { programarRecordatoriosDeClase } from "./recordatorios.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;

interface Opciones {
  /** Zona de la sucursal (por omisión, Ciudad de México: UTC-6 en noviembre de 2026). */
  zona?: string;
  /** Horarios del grupo: `[dia, inicioMin, finMin]`. */
  horarios?: [number, number, number][];
  /** Días permitidos de las dos automatizaciones (por omisión, todos). */
  dias?: number[];
  offsets?: number[];
  cupo?: number;
}

async function mundo(o: Opciones = {}) {
  const org: OrganizacionDePrueba = await sembrarOrganizacion(prisma, "Recordatorios");
  const etapas = await sembrarEmbudo(prisma, org);
  const sucursalId = org.sucursales[0]!.id;
  if (o.zona) await prisma.sucursal.update({ where: { id: sucursalId }, data: { zona_horaria: o.zona } });
  const p = await sembrarPrograma(prisma, org, { sucursalId, nombre: "Programa P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: o.cupo ?? 10, horarios: o.horarios ?? [[0, 600, 660]] }] }); // domingo 10:00
  const plantilla = await prisma.plantilla_mensaje.create({
    data: {
      organizacion_id: org.organizacionId,
      codigo: "recordatorio_clase_muestra",
      content_sid: "HX00000000000000000000000000000005",
      categoria: "utility",
      clase_mensaje: "servicio",
      estado_aprobacion: "aprobada",
      cuerpo_referencia: "Te recordamos la clase muestra de {{1}}: {{3}} a las {{4}}, grupo {{2}}, sucursal {{5}}.",
      variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "nombre_grupo" }, { pos: 3, nombre: "fecha_clase" }, { pos: 4, nombre: "hora_clase" }, { pos: 5, nombre: "nombre_sucursal" }] as never,
    },
  });
  const automatizaciones: string[] = [];
  for (const offset of o.offsets ?? [-1440, -120]) {
    const a = await prisma.automatizacion.create({
      data: { organizacion_id: org.organizacionId, nombre: `Recordatorio ${offset}`, evento_disparador: "clase_muestra_proxima", offset_minutos: offset, plantilla_id: plantilla.id, dias_permitidos: o.dias ?? [0, 1, 2, 3, 4, 5, 6] },
    });
    automatizaciones.push(a.id);
  }
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `r-${Math.random()}@p.test`, nombre: "Asesor", rol: "asesor", contrasena_hash: "x" } });
  const db = conAlcance(prisma, org.organizacionId);
  const transporte = new TransporteFalso();
  const fuente = new OcupacionFija();
  const ctx = (ahora: Date): ContextoDeAgenda => ({ ahora, fuente, origen: { tipo: "usuario", usuarioId: usuario.id } });
  /** Una familia con su conversación de WhatsApp (la ventana de 24 h cerrada: solo cabe una plantilla). */
  async function familia(nombre = "Sofía") {
    const f = await sembrarFamilia(prisma, org, { sucursalId, nombre });
    const conv = await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: f.leadId, chatwoot_conversacion_id: randomInt(1, 2_000_000_000) } });
    return { ...f, conversacionId: conv.id };
  }
  return {
    org,
    etapas,
    db,
    transporte,
    fuente,
    grupoId: p.grupos[0]!.id,
    sucursalId,
    automatizaciones,
    usuarioId: usuario.id,
    ctx,
    familia,
    async agendar(prospectoId: string, fecha: Date, ahora: Date) {
      const r = await db.$transaction((tx) => agendarClaseMuestra(tx, ctx(ahora), { prospectoId, grupoId: p.grupos[0]!.id, fechaHora: fecha }));
      assert.ok(r.ok, JSON.stringify(r));
      return r.clase.id;
    },
    /** Una pasada del motor a esa hora (el transporte, el provider y la base son los mismos). */
    corre(ahora: Date): Promise<ResumenMotor> {
      return correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: org.organizacionId });
    },
    ejecuciones: (claseId: string) =>
      db.automatizacion_ejecucion.findMany({ where: { entidad_tipo: "clase_muestra", entidad_id: claseId }, orderBy: [{ programado_para: "asc" }, { id: "asc" }], select: { automatizacion: { select: { offset_minutos: true } }, estatus: true, motivo_omision: true, programado_para: true, mensaje_id: true } }),
    enviados: () => transporte.envios.filter((e) => e.tipo === "plantilla"),
  };
}
type Mundo = Awaited<ReturnType<typeof mundo>>;
const resumen = async (m: Mundo, claseId: string) => (await m.ejecuciones(claseId)).map((e) => [e.automatizacion.offset_minutos, e.estatus, e.motivo_omision, iso(e.programado_para)]);

// Domingo 1 de noviembre de 2026, 10:00 en la Ciudad de México = 16:00Z.
const DOMINGO_10 = new Date("2026-11-01T16:00:00Z");
const AGENDADA_EL = new Date("2026-10-20T18:00:00Z");

test("D3 domingo 10:00: al agendar quedan DOS recordatorios programados; el de 24 h sale el sábado a las 10:00 y el de 2 h (08:00) se recorre a las 09:00", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, DOMINGO_10, AGENDADA_EL);
  assert.deepEqual(await resumen(m, claseId), [
    [-1440, "programado", null, "2026-10-31T16:00:00.000Z"],
    [-120, "programado", null, "2026-11-01T15:00:00.000Z"],
  ]);
  // Antes de su hora no sale nada.
  assert.equal((await m.corre(new Date("2026-10-31T15:59:00Z"))).enviadas, 0);
  // El sábado 10:00 sale el de 24 h, por plantilla, con la clase correcta.
  assert.equal((await m.corre(new Date("2026-10-31T16:00:00Z"))).enviadas, 1);
  const [e1] = m.enviados();
  assert.equal(e1!.plantilla?.codigo, "recordatorio_clase_muestra");
  assert.deepEqual(e1!.plantilla?.variables, { "1": "Sofía", "2": "Grupo A", "3": "domingo 1 de noviembre", "4": "10:00", "5": "Norte" });
  assert.equal(e1!.texto, "Te recordamos la clase muestra de Sofía: domingo 1 de noviembre a las 10:00, grupo Grupo A, sucursal Norte.");
  // A las 08:00 del domingo (14:00Z) todavía no (es madrugada); a las 09:00 (15:00Z) sale el de 2 h.
  assert.equal((await m.corre(new Date("2026-11-01T14:00:00Z"))).enviadas, 0);
  assert.equal((await m.corre(new Date("2026-11-01T15:00:00Z"))).enviadas, 1);
  assert.equal(m.enviados().length, 2);
  assert.deepEqual((await m.ejecuciones(claseId)).map((e) => e.estatus), ["enviado", "enviado"]);
  assert.equal((await m.db.clase_muestra.findFirstOrThrow({ where: { id: claseId } })).ultimo_recordatorio_en?.toISOString(), "2026-11-01T15:00:00.000Z");
  // Una pasada más no repite nada.
  assert.equal((await m.corre(new Date("2026-11-01T15:30:00Z"))).enviadas, 0);
  assert.equal(m.enviados().length, 2);
});

test("D3 el borde: la clase del domingo 09:30 recibe el de 2 h a las 09:00; la del domingo 09:00 NO (se descarta y se registra)", async () => {
  const m = await mundo({ horarios: [[0, 570, 630]] }); // domingo 09:30
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, new Date("2026-11-01T15:30:00Z"), AGENDADA_EL);
  assert.deepEqual(await resumen(m, claseId), [
    [-1440, "programado", null, "2026-10-31T15:30:00.000Z"],
    [-120, "programado", null, "2026-11-01T15:00:00.000Z"], // 07:30 → 09:00, media hora antes
  ]);
  const n = await mundo({ horarios: [[0, 540, 600]] }); // domingo 09:00
  const g = await n.familia();
  const claseN = await n.agendar(g.prospectoId, new Date("2026-11-01T15:00:00Z"), AGENDADA_EL);
  assert.deepEqual(await resumen(n, claseN), [
    [-1440, "programado", null, "2026-10-31T15:00:00.000Z"],
    [-120, "descartado", "evento_pasado", "2026-11-01T13:00:00.000Z"], // 07:00 → 09:00 = la hora de la clase → no sirve
  ]);
  assert.equal((await n.corre(new Date("2026-10-31T15:00:00Z"))).enviadas, 1, "solo el de 24 h");
  assert.equal((await n.corre(new Date("2026-11-01T15:00:00Z"))).enviadas, 0, "el de 2 h descartado no sale a la hora de la clase");
});

test("D3 lunes 09:00: el de 24 h cae el domingo 09:00 y sale; el de 2 h (07:00 → 09:00 = la clase) se descarta", async () => {
  const m = await mundo({ horarios: [[1, 540, 600]] });
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, new Date("2026-11-02T15:00:00Z"), AGENDADA_EL);
  assert.deepEqual(await resumen(m, claseId), [
    [-1440, "programado", null, "2026-11-01T15:00:00.000Z"],
    [-120, "descartado", "evento_pasado", "2026-11-02T13:00:00.000Z"],
  ]);
  assert.equal((await m.corre(new Date("2026-11-01T15:00:00Z"))).enviadas, 1);
  // Y si la automatización no permite domingos, el de 24 h también se descarta (se recorrería al lunes 09:00 = la clase).
  const n = await mundo({ horarios: [[1, 540, 600]], dias: [1, 2, 3, 4, 5, 6] });
  const g = await n.familia();
  const claseN = await n.agendar(g.prospectoId, new Date("2026-11-02T15:00:00Z"), AGENDADA_EL);
  assert.deepEqual((await resumen(n, claseN)).map((x) => x[1]), ["descartado", "descartado"]);
});

test("D3 agendada con menos de 24 h: el de 24 h simplemente no existe (descartado con motivo) y el de 2 h sale", async () => {
  const m = await mundo({ horarios: [[2, 900, 960]] }); // martes 15:00
  const f = await m.familia();
  const ahora = new Date("2026-11-03T01:00:00Z"); // lunes 19:00 locales: faltan 20 h
  const claseId = await m.agendar(f.prospectoId, new Date("2026-11-03T21:00:00Z"), ahora);
  assert.deepEqual(await resumen(m, claseId), [
    [-1440, "descartado", "ya_paso_el_momento", "2026-11-02T21:00:00.000Z"],
    [-120, "programado", null, "2026-11-03T19:00:00.000Z"],
  ]);
  assert.equal((await m.corre(new Date("2026-11-03T19:00:00Z"))).enviadas, 1);
  assert.equal(m.enviados().length, 1);
});

test("D3 reprogramar cancela los recordatorios pendientes de la anterior y programa los de la nueva; cancelar los cancela todos", async () => {
  const m = await mundo();
  const f = await m.familia();
  const vieja = await m.agendar(f.prospectoId, DOMINGO_10, AGENDADA_EL);
  const r = await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(AGENDADA_EL), { claseId: vieja, fechaHora: new Date("2026-11-08T16:00:00Z") }));
  assert.ok(r.ok);
  assert.deepEqual(await resumen(m, vieja), [
    [-1440, "cancelado", "clase_reprogramada", "2026-10-31T16:00:00.000Z"],
    [-120, "cancelado", "clase_reprogramada", "2026-11-01T15:00:00.000Z"],
  ]);
  assert.deepEqual(await resumen(m, r.clase.id), [
    [-1440, "programado", null, "2026-11-07T16:00:00.000Z"],
    [-120, "programado", null, "2026-11-08T15:00:00.000Z"],
  ]);
  // Lo cancelado no sale, ni siquiera cuando llega su hora.
  assert.equal((await m.corre(new Date("2026-11-01T15:00:00Z"))).enviadas, 0);
  assert.equal(m.transporte.envios.length, 0);
  // Cancelar la nueva.
  assert.ok((await m.db.$transaction((tx) => cancelarClaseMuestra(tx, r.clase.id, "ya no puede", AGENDADA_EL, POR_UNA_PERSONA))).ok);
  assert.deepEqual((await resumen(m, r.clase.id)).map((x) => [x[1], x[2]]), [["cancelado", "clase_cancelada"], ["cancelado", "clase_cancelada"]]);
  assert.equal((await m.corre(new Date("2026-11-08T15:00:00Z"))).enviadas, 0);
});

test("D3 reprogramar NO toca lo que ya salió (los enviados se quedan como historial)", async () => {
  const m = await mundo();
  const f = await m.familia();
  const vieja = await m.agendar(f.prospectoId, DOMINGO_10, AGENDADA_EL);
  await m.corre(new Date("2026-10-31T16:00:00Z")); // sale el de 24 h
  const r = await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(new Date("2026-10-31T17:00:00Z")), { claseId: vieja, fechaHora: new Date("2026-11-08T16:00:00Z") }));
  assert.ok(r.ok);
  assert.deepEqual((await resumen(m, vieja)).map((x) => [x[0], x[1]]), [[-1440, "enviado"], [-120, "cancelado"]]);
});

test("D3 es idempotente: programar otra vez no duplica y dos pasadas simultáneas del motor mandan UNA sola vez", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, DOMINGO_10, AGENDADA_EL);
  const otra = await m.db.$transaction((tx) => programarRecordatoriosDeClase(tx, claseId, AGENDADA_EL));
  assert.deepEqual(otra, { programados: 0, descartados: 0, existentes: 2 });
  assert.equal(await m.db.automatizacion_ejecucion.count({ where: { entidad_id: claseId } }), 2);
  await assert.rejects(() => prisma.automatizacion_ejecucion.create({ data: { organizacion_id: m.org.organizacionId, automatizacion_id: m.automatizaciones[0]!, entidad_tipo: "clase_muestra", entidad_id: claseId, ocurrencia: 1, programado_para: AGENDADA_EL } }), /Unique|idempotencia/);
  const ahora = new Date("2026-10-31T16:00:00Z");
  const rs = await Promise.all(Array.from({ length: 4 }, () => m.corre(ahora)));
  assert.equal(rs.reduce((n, r) => n + r.enviadas, 0), 1);
  assert.equal(m.enviados().length, 1);
});

test("D3 el provider decide con TODAS sus reglas: atención humana (INV-6: el aviso de servicio sale), baja y tope de frecuencia", async () => {
  // Atención humana (INV-6): el recordatorio es un aviso de SERVICIO sobre algo que la familia ya acordó, así que SÍ sale aunque una persona atienda.
  const a = await mundo();
  const fa = await a.familia();
  const ca = await a.agendar(fa.prospectoId, DOMINGO_10, AGENDADA_EL);
  await prisma.conversacion.update({ where: { id: fa.conversacionId }, data: { estado: "en_atencion_humana" } });
  const ra = await a.corre(new Date("2026-10-31T16:00:00Z"));
  assert.deepEqual([ra.enviadas, ra.omitidas], [1, 0]);
  assert.equal((await a.ejecuciones(ca))[0]!.motivo_omision, null);
  assert.equal(a.enviados().length, 1);
  assert.equal((await prisma.conversacion.findUniqueOrThrow({ where: { id: fa.conversacionId } })).estado, "en_atencion_humana", "enviar el aviso no devuelve la conversación al bot");

  // Mutación de la clase declarada: la MISMA plantilla declarada de marketing con una persona atendiendo NO sale (motivo atencion_humana).
  const a2 = await mundo();
  const fa2 = await a2.familia();
  const ca2 = await a2.agendar(fa2.prospectoId, DOMINGO_10, AGENDADA_EL);
  await prisma.plantilla_mensaje.updateMany({ where: { organizacion_id: a2.org.organizacionId }, data: { clase_mensaje: "marketing" } });
  await prisma.conversacion.update({ where: { id: fa2.conversacionId }, data: { estado: "en_atencion_humana" } });
  const ra2 = await a2.corre(new Date("2026-10-31T16:00:00Z"));
  assert.deepEqual([ra2.enviadas, ra2.omitidas], [0, 1]);
  assert.equal((await a2.ejecuciones(ca2))[0]!.motivo_omision, "atencion_humana");
  assert.equal(a2.transporte.envios.length, 0);

  // Baja del teléfono.
  const b = await mundo();
  const fb = await b.familia();
  const cb = await b.agendar(fb.prospectoId, DOMINGO_10, AGENDADA_EL);
  await b.db.consentimiento.create({ data: altaConAlcance({ telefono: fb.telefono!, estado: "opt_out" as const, alcance: "todo" as const, origen: "palabra_clave" }) });
  await b.corre(new Date("2026-10-31T16:00:00Z"));
  assert.equal((await b.ejecuciones(cb))[0]!.motivo_omision, "opt_out");
  assert.equal(b.transporte.envios.length, 0);

  // Frecuencia: tope de 1 automático por día, y ya salió uno.
  const c = await mundo();
  await fijarConfiguracion(prisma, c.org.organizacionId, { max_automaticos_por_dia: 1 });
  const fc = await c.familia();
  const cc = await c.agendar(fc.prospectoId, new Date("2026-11-08T16:00:00Z"), AGENDADA_EL);
  // Los dos recordatorios caen el mismo día (domingo: 24 h el sábado; el de 2 h el domingo): se fuerzan al mismo día.
  await prisma.automatizacion_ejecucion.updateMany({ where: { entidad_id: cc }, data: { programado_para: new Date("2026-11-07T16:00:00Z") } });
  const rc = await c.corre(new Date("2026-11-07T16:00:00Z"));
  assert.deepEqual([rc.enviadas, rc.omitidas], [1, 1]);
  assert.deepEqual((await c.ejecuciones(cc)).map((e) => e.motivo_omision).sort(), [null, "tope_frecuencia"]);
});

test("D3 un recordatorio atrasado (el servidor estuvo caído) se recorre a un horario válido o se descarta si la clase ya pasó o va a empezar", async () => {
  // Clase el martes 3 de noviembre a las 20:30 locales (02:30Z del miércoles).
  const m = await mundo({ horarios: [[2, 1230, 1290]] });
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, new Date("2026-11-04T02:30:00Z"), AGENDADA_EL);
  // El de 2 h (18:30 locales = 00:30Z) se atrasó hasta las 20:10 locales (02:10Z): ya es de noche; recorrerlo llegaría después de la clase → se descarta.
  const r = await m.corre(new Date("2026-11-04T02:10:00Z"));
  assert.equal(r.descartadas, 2, "también el de 24 h, que llevaba un día esperando");
  const e = (await m.ejecuciones(claseId)).find((x) => x.automatizacion.offset_minutos === -120)!;
  assert.deepEqual([e.estatus, e.motivo_omision], ["descartado", "evento_pasado"]);
  // Y si el motor despierta DESPUÉS de la clase, también se descarta (el de 24 h tampoco sale).
  const n = await mundo();
  const g = await n.familia();
  const claseN = await n.agendar(g.prospectoId, DOMINGO_10, AGENDADA_EL);
  const rn = await n.corre(new Date("2026-11-01T17:00:00Z"));
  assert.equal(rn.enviadas, 0);
  assert.deepEqual((await n.ejecuciones(claseN)).map((x) => [x.estatus, x.motivo_omision]), [["descartado", "evento_pasado"], ["descartado", "evento_pasado"]]);
  // El borde en el motor: el de 24 h de una clase del martes a las 09:00 se atrasó hasta el lunes a las 20:30 (de noche); el siguiente horario
  // válido (martes 09:00) es la hora de la clase → se descarta, no se reprograma a la hora en que empieza.
  const q = await mundo({ horarios: [[2, 540, 600]] });
  const qf = await q.familia();
  const claseQ = await q.agendar(qf.prospectoId, new Date("2026-11-03T15:00:00Z"), AGENDADA_EL);
  const rq = await q.corre(new Date("2026-11-03T02:30:00Z")); // lunes 20:30 locales
  assert.equal(rq.reprogramadas, 0);
  assert.equal((await q.ejecuciones(claseQ)).find((x) => x.automatizacion.offset_minutos === -1440)!.estatus, "descartado");
  // Atrasado pero todavía de día: sale (recorrido no hace falta).
  const k = await mundo();
  const h = await k.familia();
  await k.agendar(h.prospectoId, DOMINGO_10, AGENDADA_EL);
  assert.equal((await k.corre(new Date("2026-10-31T19:00:00Z"))).enviadas, 1, "el de 24 h, tres horas tarde, todavía sirve");
});

test("D3 una clase que dejó de estar agendada mientras el recordatorio estaba reclamado o pendiente no manda nada", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, DOMINGO_10, AGENDADA_EL);
  // Se cancela la clase por una vía que no cancela las ejecuciones (p. ej. SQL a mano): el motor lo revisa antes de mandar.
  await prisma.clase_muestra.update({ where: { id: claseId }, data: { estatus: "cancelada" } });
  const r = await m.corre(new Date("2026-10-31T16:00:00Z"));
  assert.deepEqual([r.enviadas, r.omitidas], [0, 1]);
  assert.equal((await m.ejecuciones(claseId))[0]!.motivo_omision, "clase_no_vigente");
  assert.equal(m.transporte.envios.length, 0);
});

test("D3 un lead sin conversación de WhatsApp (entró por otra vía): no se manda, se omite y queda una tarea para el asesor", async () => {
  const m = await mundo();
  const f = await sembrarFamilia(prisma, m.org, { sucursalId: m.sucursalId }); // sin conversación
  const claseId = await m.agendar(f.prospectoId, DOMINGO_10, AGENDADA_EL);
  const r = await m.corre(new Date("2026-10-31T16:00:00Z"));
  assert.equal(r.omitidas, 1);
  assert.equal((await m.ejecuciones(claseId))[0]!.motivo_omision, "sin_conversacion");
  const t = await m.db.tarea_asesor.findMany({ where: { clase_muestra_id: claseId } });
  assert.deepEqual(t.map((x) => x.tipo), ["automatizacion_omitida"]);
  await m.corre(new Date("2026-11-01T15:00:00Z"));
  assert.equal(await m.db.tarea_asesor.count({ where: { clase_muestra_id: claseId } }), 1, "una tarea pendiente por clase, no una por recordatorio");
});

test("D3 hermanos: el recordatorio nombra al alumno de ESA clase, no al primero del lead", async () => {
  const m = await mundo({ cupo: 5 });
  const f = await m.familia("Sofía");
  const hermano = await prisma.prospecto.create({ data: { organizacion_id: m.org.organizacionId, lead_id: f.leadId, vertical_interes_id: m.org.verticalId, nombre: "Mateo", edad_declarada: 6, origen: "asesor" } });
  await m.agendar(hermano.id, DOMINGO_10, AGENDADA_EL);
  await m.corre(new Date("2026-10-31T16:00:00Z"));
  assert.equal(m.enviados()[0]!.plantilla?.variables["1"], "Mateo");
});

test("D3 los tiempos son configurables: cambiar el offset, desactivar una automatización o limitarla a otra vertical cambia lo que se programa", async () => {
  const m = await mundo({ offsets: [-600] });
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, DOMINGO_10, AGENDADA_EL);
  assert.deepEqual(await resumen(m, claseId), [[-600, "programado", null, "2026-11-01T15:00:00.000Z"]]); // 6:00 → 10 h antes cae de madrugada y se recorre a las 09:00
  // Inactiva: no se programa nada para la clase siguiente.
  await prisma.automatizacion.updateMany({ where: { organizacion_id: m.org.organizacionId }, data: { activo: false } });
  const g = await m.familia();
  const c2 = await m.agendar(g.prospectoId, DOMINGO_10, AGENDADA_EL);
  assert.deepEqual(await resumen(m, c2), []);
  // De otra vertical: tampoco.
  await prisma.automatizacion.updateMany({ where: { organizacion_id: m.org.organizacionId }, data: { activo: true, vertical_id: (await prisma.vertical.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Otra", slug: `otra-${Math.random()}` } })).id } });
  const h = await m.familia();
  const c3 = await m.agendar(h.prospectoId, DOMINGO_10, AGENDADA_EL);
  assert.deepEqual(await resumen(m, c3), []);
  // Y de otra sucursal.
  await prisma.automatizacion.updateMany({ where: { organizacion_id: m.org.organizacionId }, data: { vertical_id: null, sucursal_id: m.org.sucursales[1]!.id } });
  const i = await m.familia();
  const c4 = await m.agendar(i.prospectoId, DOMINGO_10, AGENDADA_EL);
  assert.deepEqual(await resumen(m, c4), []);
});

test("D3 horario de verano (Nueva York): el domingo 8 de marzo de 2026 a las 10:00 EDT, el de 24 h sale el sábado a las 09:00 EST y el de 2 h a las 09:00 EDT", async () => {
  const m = await mundo({ zona: "America/New_York" });
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, new Date("2026-03-08T14:00:00Z"), new Date("2026-03-01T15:00:00Z"));
  assert.deepEqual(await resumen(m, claseId), [
    [-1440, "programado", null, "2026-03-07T14:00:00.000Z"],
    [-120, "programado", null, "2026-03-08T13:00:00.000Z"],
  ]);
  assert.equal((await m.corre(new Date("2026-03-07T13:59:00Z"))).enviadas, 0, "08:59 EST todavía no");
  assert.equal((await m.corre(new Date("2026-03-07T14:00:00Z"))).enviadas, 1);
  assert.equal((await m.corre(new Date("2026-03-08T12:59:00Z"))).enviadas, 0, "08:59 EDT todavía no");
  assert.equal((await m.corre(new Date("2026-03-08T13:00:00Z"))).enviadas, 1);
});

test("D3 la hora de pared es la de la sucursal: la misma clase en Tokio sale a la hora de Tokio", async () => {
  const m = await mundo({ zona: "Asia/Tokyo" }); // domingo 10:00 en Tokio = sábado 01:00Z
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId, new Date("2026-11-01T01:00:00Z"), new Date("2026-10-20T00:00:00Z"));
  assert.deepEqual(await resumen(m, claseId), [
    [-1440, "programado", null, "2026-10-31T01:00:00.000Z"], // sábado 10:00 en Tokio
    [-120, "programado", null, "2026-11-01T00:00:00.000Z"], // domingo 08:00 → 09:00 en Tokio
  ]);
  assert.equal((await m.corre(new Date("2026-10-31T01:00:00Z"))).enviadas, 1);
});

test("D3 no-fuga: las automatizaciones y las clases de una organización no se mezclan con las de otra", async () => {
  const a = await mundo();
  const b = await mundo();
  const fa = await a.familia();
  const fb = await b.familia();
  const ca = await a.agendar(fa.prospectoId, DOMINGO_10, AGENDADA_EL);
  const cb = await b.agendar(fb.prospectoId, DOMINGO_10, AGENDADA_EL);
  assert.equal((await a.db.automatizacion_ejecucion.count({ where: { entidad_id: cb } })), 0);
  assert.equal((await a.corre(new Date("2026-10-31T16:00:00Z"))).enviadas, 1);
  assert.equal(b.transporte.envios.length, 0);
  assert.equal(a.transporte.envios.length, 1);
  assert.equal((await b.ejecuciones(cb))[0]!.estatus, "programado");
  assert.equal((await a.ejecuciones(ca))[0]!.estatus, "enviado");
});
