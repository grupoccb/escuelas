// V2, decisión 4: cuando una PERSONA reprograma o cancela una clase muestra, la familia recibe un aviso de servicio. Motor real, MessagingProvider real y transporte falso, sin red.
// Reloj inyectado. Cada prueba arma su propia organización. Cubre: reprogramar y cancelar por una persona; por la propia familia (sin aviso); fuera de la ventana de servicio con y sin
// plantilla apta; fuera de horario (se recorre o se descarta con tarea); idempotencia; atención humana; baja y baja de marketing; tope de mensajes; módulo apagado; sin WhatsApp;
// y la no-fuga entre organizaciones. Zona de la sucursal: Ciudad de México (UTC-6).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { altaConAlcance, conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, POR_UNA_PERSONA, fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";
import { correrAutomatizaciones, type ResumenMotor } from "../automatizaciones/motor.ts";
import { agendarClaseMuestra, cancelarClaseMuestra, reprogramarClaseMuestra, type ContextoDeAgenda } from "./agenda.ts";
import { programarAvisoDeCambio } from "./aviso-cambio.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;
/** «2026-11-02 10:00» en hora de la Ciudad de México → instante. */
const hora = (local: string): Date => new Date(`${local.replace(" ", "T")}:00-06:00`);

const PLANTILLA_REPROGRAMADA = {
  codigo: "aviso_clase_reprogramada",
  variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "nombre_grupo" }, { pos: 3, nombre: "fecha_clase" }, { pos: 4, nombre: "hora_clase" }, { pos: 5, nombre: "nombre_sucursal" }, { pos: 6, nombre: "fecha_anterior" }],
  cuerpo: "Hola, te avisamos que cambió la clase muestra de {{1}}: era el {{6}} y ahora es el {{3}} a las {{4}}, grupo {{2}}, sucursal {{5}}. Si no te acomoda, responde a este mensaje y buscamos otro día.",
};
const PLANTILLA_CANCELADA = {
  codigo: "aviso_clase_cancelada",
  variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "nombre_grupo" }, { pos: 3, nombre: "fecha_clase" }, { pos: 4, nombre: "hora_clase" }, { pos: 5, nombre: "nombre_sucursal" }],
  cuerpo: "Hola, te avisamos que se canceló la clase muestra de {{1}} del {{3}} a las {{4}}, grupo {{2}}, sucursal {{5}}. Responde a este mensaje y te ayudamos a agendar otra.",
};

interface Opciones {
  /** La plantilla de los avisos: «aprobada» (por omisión) o «pendiente» (no apta). */
  aprobacion?: "aprobada" | "pendiente";
  /** Sin automatizaciones de aviso (una escuela que no las configuró). */
  sinAutomatizaciones?: boolean;
  /** Las automatizaciones sin plantilla ligada. */
  sinPlantilla?: boolean;
  /** La clase muestra de la escuela apagada, apagada desde el principio. */
  conOffset?: number;
}

async function mundo(o: Opciones = {}) {
  const org: OrganizacionDePrueba = await sembrarOrganizacion(prisma, "AvisoCambio");
  await sembrarEmbudo(prisma, org);
  const sucursalId = org.sucursales[0]!.id;
  // Cada día, tres horarios: 09:00, 10:00 y 20:30.
  const horarios: [number, number, number][] = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [[d, 540, 600], [d, 600, 660], [d, 1230, 1290]] as [number, number, number][]);
  const p = await sembrarPrograma(prisma, org, { sucursalId, nombre: "Programa P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: 10, horarios }] });
  const plantillas: Record<"reprogramada" | "cancelada", string> = { reprogramada: "", cancelada: "" };
  for (const [tipo, def] of [["reprogramada", PLANTILLA_REPROGRAMADA], ["cancelada", PLANTILLA_CANCELADA]] as const) {
    const pl = await prisma.plantilla_mensaje.create({
      data: { organizacion_id: org.organizacionId, codigo: def.codigo, content_sid: `HX${randomInt(1e9, 9e9)}`, categoria: "utility", clase_mensaje: "servicio", estado_aprobacion: o.aprobacion ?? "aprobada", cuerpo_referencia: def.cuerpo, variables: def.variables as never },
    });
    plantillas[tipo] = pl.id;
  }
  const autos: Record<"reprogramada" | "cancelada", string> = { reprogramada: "", cancelada: "" };
  if (!o.sinAutomatizaciones) {
    for (const tipo of ["reprogramada", "cancelada"] as const) {
      const a = await prisma.automatizacion.create({
        data: { organizacion_id: org.organizacionId, nombre: `Aviso ${tipo}`, evento_disparador: tipo === "reprogramada" ? "clase_muestra_reprogramada" : "clase_muestra_cancelada", offset_minutos: o.conOffset ?? 0, ...(o.sinPlantilla ? {} : { plantilla_id: plantillas[tipo] }), dias_permitidos: [0, 1, 2, 3, 4, 5, 6] },
      });
      autos[tipo] = a.id;
    }
  }
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `a-${Math.random()}@p.test`, nombre: "Asesor", rol: "asesor", contrasena_hash: "x" } });
  const db = conAlcance(prisma, org.organizacionId);
  const transporte = new TransporteFalso();
  const fuente = new OcupacionFija();
  const porPersona = (ahora: Date): ContextoDeAgenda => ({ ahora, fuente, origen: { tipo: "usuario", usuarioId: usuario.id } });
  const porLaFamilia = (ahora: Date, conversacionId: string): ContextoDeAgenda => ({ ahora, fuente, origen: { tipo: "bot", conversacionId } });

  /** Una familia con su conversación de WhatsApp (por omisión la ventana de 24 h cerrada: solo cabe una plantilla). */
  async function familia(c: { nombre?: string; estado?: "bot" | "en_atencion_humana" | "opt_out"; ventanaHasta?: Date; sinConversacion?: boolean } = {}) {
    const f = await sembrarFamilia(prisma, org, { sucursalId, nombre: c.nombre ?? "Sofía" });
    if (c.sinConversacion) return { ...f, conversacionId: null as string | null };
    const conv = await prisma.conversacion.create({
      data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: f.leadId, chatwoot_conversacion_id: randomInt(1, 2_000_000_000), ...(c.estado ? { estado: c.estado } : {}), ...(c.ventanaHasta ? { ventana_servicio_hasta: c.ventanaHasta } : {}) },
    });
    return { ...f, conversacionId: conv.id as string | null };
  }
  const M = {
    org,
    db,
    transporte,
    sucursalId,
    grupoId: p.grupos[0]!.id,
    usuarioId: usuario.id,
    plantillas,
    autos,
    familia,
    porPersona,
    porLaFamilia,
    async agendar(prospectoId: string, fecha: Date, ahora: Date): Promise<string> {
      const r = await db.$transaction((tx) => agendarClaseMuestra(tx, porPersona(ahora), { prospectoId, grupoId: p.grupos[0]!.id, fechaHora: fecha }));
      assert.ok(r.ok, JSON.stringify(r));
      return r.clase.id;
    },
    async reprogramar(claseId: string, fecha: Date, ahora: Date, ctx: ContextoDeAgenda = porPersona(ahora)) {
      return db.$transaction((tx) => reprogramarClaseMuestra(tx, ctx, { claseId, fechaHora: fecha }));
    },
    cancelar: (claseId: string, ahora: Date, origen: ContextoDeAgenda["origen"] = POR_UNA_PERSONA) => db.$transaction((tx) => cancelarClaseMuestra(tx, claseId, "no puede ir", ahora, origen)),
    /** Una pasada del motor a esa hora (el transporte, el provider y la base son los mismos). */
    corre(ahora: Date): Promise<ResumenMotor> {
      return correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: org.organizacionId });
    },
    /** Las ejecuciones de aviso de cambio de ESA clase. */
    avisos: (claseId: string) =>
      db.automatizacion_ejecucion.findMany({
        where: { entidad_tipo: "clase_muestra", entidad_id: claseId, automatizacion: { evento_disparador: { in: ["clase_muestra_reprogramada", "clase_muestra_cancelada"] } } },
        orderBy: [{ programado_para: "asc" }, { id: "asc" }],
        select: { automatizacion: { select: { evento_disparador: true } }, estatus: true, motivo_omision: true, programado_para: true, ocurrencia: true },
      }),
    enviados: () => transporte.envios.filter((e) => e.tipo === "plantilla"),
    tareas: (tipo: "avisar_cambio_de_clase" | "sin_plantilla_apta" | "automatizacion_omitida" = "avisar_cambio_de_clase") => db.tarea_asesor.findMany({ where: { tipo }, select: { descripcion: true, clase_muestra_id: true, lead_id: true, estado: true, vence_en: true } }),
  };
  return M;
}
type Mundo = Awaited<ReturnType<typeof mundo>>;
const resumen = async (m: Mundo, claseId: string) => (await m.avisos(claseId)).map((e) => [e.automatizacion.evento_disparador, e.estatus, e.motivo_omision, iso(e.programado_para)]);

// Lunes 2 de noviembre de 2026, 10:00 hora de la Ciudad de México.
const LUNES_10 = hora("2026-11-02 10:00");
const MARTES_10 = hora("2026-11-03 10:00");
const MIERCOLES_10 = hora("2026-11-04 10:00");
const AGENDADA_EL = hora("2026-10-30 12:00");
const DOMINGO_12 = hora("2026-11-01 12:00");

test("V2 reprogramar por una persona: la familia recibe UN aviso de servicio con la fecha nueva y la anterior, por plantilla, aunque la ventana de 24 h esté cerrada; reintentarlo no manda otro", async () => {
  const m = await mundo();
  const f = await m.familia();
  const vieja = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  const r = await m.reprogramar(vieja, MARTES_10, DOMINGO_12);
  assert.ok(r.ok);
  // El aviso queda programado para la clase NUEVA, para ahora mismo (dentro del horario).
  assert.deepEqual(await resumen(m, r.clase.id), [["clase_muestra_reprogramada", "programado", null, DOMINGO_12.toISOString()]]);
  assert.deepEqual(await resumen(m, vieja), [], "la clase vieja no lleva aviso de reprogramada");
  assert.equal((await m.corre(hora("2026-11-01 11:59"))).enviadas, 0, "antes de su hora no sale");
  assert.equal((await m.corre(DOMINGO_12)).enviadas, 1);
  const [e1] = m.enviados();
  assert.equal(e1!.plantilla?.codigo, "aviso_clase_reprogramada");
  assert.deepEqual(e1!.plantilla?.variables, { "1": "Sofía", "2": "Grupo A", "3": "martes 3 de noviembre", "4": "10:00", "5": "Norte", "6": "lunes 2 de noviembre a las 10:00" });
  assert.equal(e1!.texto, "Hola, te avisamos que cambió la clase muestra de Sofía: era el lunes 2 de noviembre a las 10:00 y ahora es el martes 3 de noviembre a las 10:00, grupo Grupo A, sucursal Norte. Si no te acomoda, responde a este mensaje y buscamos otro día.");
  assert.deepEqual((await m.avisos(r.clase.id)).map((a) => a.estatus), ["enviado"]);
  // Una pasada más no repite nada.
  assert.equal((await m.corre(hora("2026-11-01 12:30"))).enviadas, 0);
  assert.equal(m.enviados().length, 1);
  // El mismo cambio otra vez: la clase vieja ya no está agendada y no se escribe nada; y programar de nuevo el mismo aviso no duplica.
  const otra = await m.reprogramar(vieja, hora("2026-11-05 10:00"), DOMINGO_12);
  assert.deepEqual(otra, { ok: false, motivo: "clase_no_vigente" });
  const repetido = await m.db.$transaction((tx) => programarAvisoDeCambio(tx, { claseId: r.clase.id, tipo: "reprogramada", ahora: DOMINGO_12 }));
  assert.deepEqual([repetido.programados, repetido.existentes], [0, 1]);
  assert.equal((await m.avisos(r.clase.id)).length, 1);
  assert.equal((await m.corre(hora("2026-11-01 13:00"))).enviadas, 0);
  assert.equal(m.enviados().length, 1);
});

test("V2 cancelar por una persona: la familia recibe UN aviso de servicio; los recordatorios pendientes se cancelan y el aviso no", async () => {
  const m = await mundo();
  const f = await m.familia();
  const clase = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  const c = await m.cancelar(clase, DOMINGO_12);
  assert.ok(c.ok);
  assert.deepEqual(await resumen(m, clase), [["clase_muestra_cancelada", "programado", null, DOMINGO_12.toISOString()]]);
  assert.equal((await m.corre(DOMINGO_12)).enviadas, 1);
  const [e] = m.enviados();
  assert.equal(e!.plantilla?.codigo, "aviso_clase_cancelada");
  assert.equal(e!.texto, "Hola, te avisamos que se canceló la clase muestra de Sofía del lunes 2 de noviembre a las 10:00, grupo Grupo A, sucursal Norte. Responde a este mensaje y te ayudamos a agendar otra.");
  // Cancelar de nuevo: ya no está agendada, no hay otro aviso.
  assert.deepEqual(await m.cancelar(clase, DOMINGO_12), { ok: false, motivo: "clase_no_vigente" });
  assert.equal((await m.avisos(clase)).length, 1);
  assert.equal((await m.corre(hora("2026-11-01 12:30"))).enviadas, 0);
  assert.equal(m.enviados().length, 1);
});

test("V2 por la propia familia (el bot) NO hay aviso extra: ya se le confirmó en la conversación — ni al reprogramar ni al cancelar", async () => {
  const m = await mundo();
  const f = await m.familia();
  const vieja = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  const r = await m.reprogramar(vieja, MARTES_10, DOMINGO_12, m.porLaFamilia(DOMINGO_12, f.conversacionId!));
  assert.ok(r.ok);
  assert.deepEqual(await m.avisos(r.clase.id), []);
  const c = await m.cancelar(r.clase.id, DOMINGO_12, { tipo: "bot", conversacionId: f.conversacionId! });
  assert.ok(c.ok);
  assert.deepEqual(await m.avisos(r.clase.id), []);
  assert.equal((await m.corre(DOMINGO_12)).enviadas, 0);
  assert.equal(m.transporte.envios.length, 0);
  assert.deepEqual(await m.tareas(), []);
});

test("V2 con la ventana de servicio cerrada solo sale una plantilla APROBADA; con la ventana abierta también sale (el aviso es por plantilla siempre)", async () => {
  const cerrada = await mundo();
  const f = await cerrada.familia();
  const clase = await cerrada.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  await cerrada.cancelar(clase, DOMINGO_12);
  assert.equal((await cerrada.corre(DOMINGO_12)).enviadas, 1);
  assert.equal(cerrada.transporte.envios.filter((e) => e.tipo === "mensaje").length, 0, "nunca un mensaje libre fuera de la ventana");
  assert.equal(cerrada.enviados().length, 1);

  const abierta = await mundo();
  const g = await abierta.familia({ ventanaHasta: hora("2026-11-02 12:00") });
  const claseG = await abierta.agendar(g.prospectoId, LUNES_10, AGENDADA_EL);
  await abierta.cancelar(claseG, DOMINGO_12);
  assert.equal((await abierta.corre(DOMINGO_12)).enviadas, 1);
});

test("V2 sin plantilla apta no se manda y se crea la tarea para el asesor (invariante 5): plantilla pendiente de aprobar, o automatización sin plantilla", async () => {
  const pendiente = await mundo({ aprobacion: "pendiente" });
  const f = await pendiente.familia();
  const clase = await pendiente.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  await pendiente.cancelar(clase, DOMINGO_12);
  const r = await pendiente.corre(DOMINGO_12);
  assert.deepEqual([r.enviadas, r.omitidas], [0, 1]);
  assert.equal(pendiente.transporte.envios.length, 0);
  assert.deepEqual((await pendiente.avisos(clase)).map((a) => [a.estatus, a.motivo_omision]), [["omitido", "plantilla_no_apta"]]);
  assert.equal((await pendiente.tareas("sin_plantilla_apta")).length, 1, "MessagingProvider deja la tarea «sin plantilla apta»");

  const sin = await mundo({ sinPlantilla: true });
  const g = await sin.familia();
  const claseG = await sin.agendar(g.prospectoId, LUNES_10, AGENDADA_EL);
  await sin.cancelar(claseG, DOMINGO_12);
  await sin.corre(DOMINGO_12);
  assert.equal(sin.transporte.envios.length, 0);
  assert.deepEqual((await sin.avisos(claseG)).map((a) => [a.estatus, a.motivo_omision]), [["omitido", "sin_plantilla"]]);
  assert.equal((await sin.tareas("automatizacion_omitida")).length, 1);
});

test("V2 fuera de horario: el aviso de la noche sale a las 09:00 si todavía llega antes de la clase; si no llega, se descarta, se registra y el asesor recibe la tarea de llamar", async () => {
  // Cambio a las 22:00 de una clase del jueves 10:00: sale a las 09:00 del día siguiente.
  const m = await mundo();
  const f = await m.familia();
  const clase = await m.agendar(f.prospectoId, hora("2026-11-05 10:00"), AGENDADA_EL);
  const noche = hora("2026-11-04 22:00");
  const r = await m.reprogramar(clase, hora("2026-11-06 10:00"), noche);
  assert.ok(r.ok);
  assert.deepEqual(await resumen(m, r.clase.id), [["clase_muestra_reprogramada", "programado", null, hora("2026-11-05 09:00").toISOString()]]);
  assert.equal((await m.corre(noche)).enviadas, 0, "de noche no sale");
  assert.equal((await m.corre(hora("2026-11-05 08:59"))).enviadas, 0);
  assert.equal((await m.corre(hora("2026-11-05 09:00"))).enviadas, 1);
  assert.deepEqual(await m.tareas(), []);

  // La clase nueva empieza a las 09:00 de mañana y se reprograma a las 22:00: a las 09:00 ya es tarde. No sale, se registra y queda la tarea para el asesor.
  const n = await mundo();
  const g = await n.familia();
  const claseN = await n.agendar(g.prospectoId, hora("2026-11-06 10:00"), AGENDADA_EL);
  const rN = await n.reprogramar(claseN, hora("2026-11-05 09:00"), hora("2026-11-04 22:00"));
  assert.ok(rN.ok, JSON.stringify(rN));
  assert.deepEqual(await resumen(n, rN.clase.id), [["clase_muestra_reprogramada", "descartado", "evento_pasado", hora("2026-11-04 22:00").toISOString()]]);
  const tareas = await n.tareas();
  assert.equal(tareas.length, 1);
  assert.equal(tareas[0]!.clase_muestra_id, rN.clase.id);
  assert.equal(tareas[0]!.lead_id, g.leadId);
  assert.equal(tareas[0]!.estado, "pendiente");
  assert.equal(tareas[0]!.descripcion, "La clase muestra de Sofía cambió al jueves 5 de noviembre a las 09:00 y no se le pudo avisar a la familia por WhatsApp (ya es fuera del horario de mensajes y la clase empieza antes de que pueda salir). Llámale y avísale del cambio.");
  assert.equal(iso(tareas[0]!.vence_en), hora("2026-11-05 09:00").toISOString(), "avisar sirve hasta que empiece la clase");
  assert.equal((await n.corre(hora("2026-11-05 09:00"))).enviadas, 0, "lo descartado no sale nunca");
  assert.equal(n.transporte.envios.length, 0);
  // Reintentar el mismo cambio no repite la tarea.
  assert.deepEqual(await n.reprogramar(claseN, hora("2026-11-05 09:00"), hora("2026-11-04 22:00")), { ok: false, motivo: "clase_no_vigente" });
  assert.equal((await n.tareas()).length, 1);
});

test("V2 la clase que empieza en menos de una hora, fuera de horario: la cancelación se descarta y se crea la tarea de llamar (20:30, cancelada a las 20:10)", async () => {
  const m = await mundo();
  const f = await m.familia();
  const clase = await m.agendar(f.prospectoId, hora("2026-11-04 20:30"), AGENDADA_EL);
  const c = await m.cancelar(clase, hora("2026-11-04 20:10"));
  assert.ok(c.ok);
  assert.deepEqual(await resumen(m, clase), [["clase_muestra_cancelada", "descartado", "evento_pasado", hora("2026-11-04 20:10").toISOString()]]);
  assert.equal((await m.tareas()).length, 1);
  assert.equal((await m.corre(hora("2026-11-05 09:00"))).enviadas, 0);
  assert.equal(m.transporte.envios.length, 0);
});

test("V2 fuera de horario al EJECUTAR: un aviso programado a tiempo que el motor encuentra después de las 20:00 se recorre si alcanza y, si no, se descarta con tarea", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseAlcanza = await m.agendar(f.prospectoId, hora("2026-11-06 10:00"), AGENDADA_EL);
  const ahora = hora("2026-11-04 19:50");
  await m.cancelar(claseAlcanza, ahora);
  assert.deepEqual((await m.avisos(claseAlcanza)).map((a) => a.estatus), ["programado"]);
  // El motor despierta tarde (20:05): se recorre a las 09:00 del jueves, que es antes de la clase del viernes.
  const r = await m.corre(hora("2026-11-04 20:05"));
  assert.deepEqual([r.enviadas, r.reprogramadas, r.descartadas], [0, 1, 0]);
  assert.equal(iso((await m.avisos(claseAlcanza))[0]!.programado_para), hora("2026-11-05 09:00").toISOString());
  assert.equal((await m.corre(hora("2026-11-05 09:00"))).enviadas, 1);

  const n = await mundo();
  const g = await n.familia();
  const claseTarde = await n.agendar(g.prospectoId, hora("2026-11-04 20:30"), AGENDADA_EL);
  await n.cancelar(claseTarde, hora("2026-11-04 19:50"));
  const r2 = await n.corre(hora("2026-11-04 20:05")); // tarde: mañana a las 09:00 ya sería después de la clase de las 20:30 de hoy
  assert.deepEqual([r2.enviadas, r2.descartadas], [0, 1]);
  assert.deepEqual((await n.avisos(claseTarde)).map((a) => [a.estatus, a.motivo_omision]), [["descartado", "evento_pasado"]]);
  assert.equal((await n.tareas()).length, 1);
  assert.equal(n.transporte.envios.length, 0);
});

test("V2 idempotencia: reprogramar DOS veces manda dos avisos distintos (uno por cambio) y cada uno una sola vez, aunque el motor corra de más", async () => {
  const m = await mundo();
  const f = await m.familia();
  const a = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  const r1 = await m.reprogramar(a, MARTES_10, DOMINGO_12);
  assert.ok(r1.ok);
  assert.equal((await m.corre(DOMINGO_12)).enviadas, 1);
  const r2 = await m.reprogramar(r1.clase.id, MIERCOLES_10, hora("2026-11-01 14:00"));
  assert.ok(r2.ok);
  for (const vez of [hora("2026-11-01 14:00"), hora("2026-11-01 14:00"), hora("2026-11-01 15:00")]) await m.corre(vez);
  const textos = m.enviados().map((e) => e.texto);
  assert.equal(textos.length, 2, "dos cambios, dos avisos, ni uno más");
  assert.match(textos[0]!, /era el lunes 2 de noviembre a las 10:00 y ahora es el martes 3 de noviembre a las 10:00/);
  assert.match(textos[1]!, /era el martes 3 de noviembre a las 10:00 y ahora es el miércoles 4 de noviembre a las 10:00/);
  assert.deepEqual([(await m.avisos(r1.clase.id)).length, (await m.avisos(r2.clase.id)).length], [1, 1], "una ejecución por cambio");
  assert.deepEqual((await m.avisos(r2.clase.id)).map((x) => x.ocurrencia), [1]);
});

test("V2 si la clase vuelve a cambiar ANTES de que salga el aviso, solo sale el del cambio nuevo (el viejo se omite: ya no vale)", async () => {
  const m = await mundo();
  const f = await m.familia();
  const a = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  const r1 = await m.reprogramar(a, MARTES_10, DOMINGO_12);
  assert.ok(r1.ok);
  const r2 = await m.reprogramar(r1.clase.id, MIERCOLES_10, DOMINGO_12);
  assert.ok(r2.ok);
  const r = await m.corre(DOMINGO_12);
  assert.deepEqual([r.enviadas, r.omitidas], [1, 1]);
  assert.deepEqual((await m.avisos(r1.clase.id)).map((x) => [x.estatus, x.motivo_omision]), [["omitido", "clase_no_vigente"]]);
  assert.equal(m.enviados().length, 1);
  assert.match(m.enviados()[0]!.texto ?? "", /ahora es el miércoles 4 de noviembre a las 10:00/);
});

test("V2 con una persona atendiendo (en_atencion_humana) el aviso de servicio SÍ sale: es algo que la familia ya acordó", async () => {
  const m = await mundo();
  const f = await m.familia({ estado: "en_atencion_humana" });
  const clase = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  await m.cancelar(clase, DOMINGO_12);
  assert.equal((await m.corre(DOMINGO_12)).enviadas, 1);
  assert.equal(m.enviados().length, 1);
  assert.equal((await m.db.conversacion.findFirstOrThrow({ where: { id: f.conversacionId! } })).estado, "en_atencion_humana", "el aviso no le quita la conversación a la persona");
  // Y una plantilla de MARKETING en el lugar del aviso sí se frena (la regla la aplica MessagingProvider, no el motor): la clase de la plantilla manda.
  const n = await mundo();
  await n.db.plantilla_mensaje.updateMany({ where: { id: n.plantillas.cancelada }, data: { clase_mensaje: "marketing" } });
  const g = await n.familia({ estado: "en_atencion_humana" });
  const claseG = await n.agendar(g.prospectoId, LUNES_10, AGENDADA_EL);
  await n.cancelar(claseG, DOMINGO_12);
  await n.corre(DOMINGO_12);
  assert.equal(n.transporte.envios.length, 0);
  assert.deepEqual((await n.avisos(claseG)).map((a) => [a.estatus, a.motivo_omision]), [["omitido", "atencion_humana"]]);
});

test("V2 baja: quien pidió la baja total no recibe el aviso; quien solo pidió la de marketing sí (es de servicio)", async () => {
  const total = await mundo();
  const f = await total.familia();
  await total.db.consentimiento.create({ data: altaConAlcance({ telefono: f.telefono!, estado: "opt_out" as const, alcance: "todo" as const, origen: "palabra_clave" as const }) });
  const clase = await total.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  await total.cancelar(clase, DOMINGO_12);
  assert.equal((await total.corre(DOMINGO_12)).enviadas, 0);
  assert.equal(total.transporte.envios.length, 0);
  assert.deepEqual((await total.avisos(clase)).map((a) => [a.estatus, a.motivo_omision]), [["omitido", "opt_out"]]);

  const estado = await mundo();
  const g = await estado.familia({ estado: "opt_out" });
  const claseG = await estado.agendar(g.prospectoId, LUNES_10, AGENDADA_EL);
  await estado.cancelar(claseG, DOMINGO_12);
  assert.equal((await estado.corre(DOMINGO_12)).enviadas, 0);
  assert.deepEqual((await estado.avisos(claseG)).map((a) => a.motivo_omision), ["opt_out"]);

  const marketing = await mundo();
  const h = await marketing.familia();
  await marketing.db.consentimiento.create({ data: altaConAlcance({ telefono: h.telefono!, estado: "opt_out" as const, alcance: "marketing" as const, origen: "manual" as const }) });
  const claseH = await marketing.agendar(h.prospectoId, LUNES_10, AGENDADA_EL);
  await marketing.cancelar(claseH, DOMINGO_12);
  assert.equal((await marketing.corre(DOMINGO_12)).enviadas, 1, "la baja de marketing no bloquea los avisos de servicio");
});

test("V2 el tope de mensajes automáticos del día frena el aviso y el asesor recibe la tarea de llamar", async () => {
  const m = await mundo();
  await fijarConfiguracion(prisma, m.org.organizacionId, { max_automaticos_por_dia: 0 });
  const f = await m.familia();
  const clase = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  await m.cancelar(clase, DOMINGO_12);
  await m.corre(DOMINGO_12);
  assert.equal(m.transporte.envios.length, 0);
  assert.deepEqual((await m.avisos(clase)).map((a) => [a.estatus, a.motivo_omision]), [["omitido", "tope_frecuencia"]]);
  const [t] = await m.tareas();
  assert.match(t!.descripcion, /ya recibió el máximo de mensajes automáticos del día/);
});

test("V2 sin conversación de WhatsApp (el lead entró por la landing): no hay por dónde avisar y el asesor recibe la tarea de llamar", async () => {
  const m = await mundo();
  const f = await m.familia({ sinConversacion: true });
  const clase = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  await m.cancelar(clase, DOMINGO_12);
  await m.corre(DOMINGO_12);
  assert.equal(m.transporte.envios.length, 0);
  assert.deepEqual((await m.avisos(clase)).map((a) => [a.estatus, a.motivo_omision]), [["omitido", "sin_conversacion"]]);
  const [t] = await m.tareas();
  assert.match(t!.descripcion, /la familia no tiene una conversación de WhatsApp/);
  assert.equal(t!.clase_muestra_id, clase);
});

test("V2 una escuela sin la automatización del aviso (la plantilla de una organización nueva no la trae) no manda nada ni crea tareas: es una configuración", async () => {
  const m = await mundo({ sinAutomatizaciones: true });
  const f = await m.familia();
  const clase = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  const r = await m.reprogramar(clase, MARTES_10, DOMINGO_12);
  assert.ok(r.ok);
  await m.cancelar(r.clase.id, DOMINGO_12);
  assert.deepEqual([await m.avisos(clase), await m.avisos(r.clase.id)], [[], []]);
  assert.equal((await m.corre(DOMINGO_12)).enviadas, 0);
  assert.deepEqual(await m.tareas(), []);
});

test("V2 con el módulo de clase muestra APAGADO no corre nada: ni se programa el aviso, y lo ya programado se omite sin mandarse", async () => {
  const m = await mundo();
  const f = await m.familia();
  const clase = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);
  await m.cancelar(clase, DOMINGO_12);
  assert.equal((await m.avisos(clase)).length, 1);
  await fijarConfiguracion(prisma, m.org.organizacionId, { modulo_inscripcion: false, modulo_finanzas: false, modulo_operacion: false, modulo_tableros: false, modulo_clase_muestra: false });
  const r = await m.corre(DOMINGO_12);
  assert.deepEqual([r.enviadas, r.omitidas], [0, 1]);
  assert.deepEqual((await m.avisos(clase)).map((a) => [a.estatus, a.motivo_omision]), [["omitido", "modulo_apagado"]]);
  assert.equal(m.transporte.envios.length, 0);
  // Programar con el módulo apagado tampoco deja nada.
  const otra = await m.db.$transaction((tx) => programarAvisoDeCambio(tx, { claseId: clase, tipo: "cancelada", ahora: DOMINGO_12 }));
  assert.deepEqual(otra, { programados: 0, descartados: 0, existentes: 0, tarea: false });
  assert.equal((await m.avisos(clase)).length, 1);
});

test("V2 no-fuga entre organizaciones: el cambio en una escuela no programa, manda ni crea tareas en otra, y cada una usa SU automatización", async () => {
  const a = await mundo();
  const b = await mundo();
  const fa = await a.familia();
  const fb = await b.familia();
  const claseA = await a.agendar(fa.prospectoId, LUNES_10, AGENDADA_EL);
  const claseB = await b.agendar(fb.prospectoId, LUNES_10, AGENDADA_EL);
  await a.cancelar(claseA, DOMINGO_12);
  assert.deepEqual([(await a.avisos(claseA)).length, (await b.avisos(claseB)).length], [1, 0], "solo la escuela A tiene aviso");
  assert.deepEqual((await a.db.automatizacion_ejecucion.findMany({ where: { entidad_id: claseA, automatizacion_id: { in: [b.autos.cancelada, b.autos.reprogramada] } } })).length, 0, "la ejecución de A no cuelga de la automatización de B");
  // Motor de B: no manda lo de A; motor de A: sí.
  assert.equal((await b.corre(DOMINGO_12)).enviadas, 0);
  assert.equal(b.transporte.envios.length, 0);
  assert.equal((await a.corre(DOMINGO_12)).enviadas, 1);
  assert.equal(a.transporte.envios.length, 1);
  // Y B cancela la suya: sale con SU transporte y SU texto, sin tocar A.
  await b.cancelar(claseB, DOMINGO_12);
  assert.equal((await b.corre(DOMINGO_12)).enviadas, 1);
  assert.equal(a.transporte.envios.length, 1);
  assert.deepEqual([(await a.tareas()).length, (await b.tareas()).length], [0, 0]);
});

test("V2 por la API: el asesor y el administrador reprograman y cancelan, y cada cambio deja su aviso; el maestro no puede (no tiene el permiso)", async () => {
  const m = await mundo();
  const api = levantarApi(prisma, { reloj: () => DOMINGO_12, fuenteOcupacion: new OcupacionFija() });
  await api.listo;
  try {
    const entrar = async (rol: "asesor" | "administrador" | "maestro") => {
      const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol, sucursales: rol === "asesor" ? [m.sucursalId] : [] });
      const c = api.cliente();
      assert.equal((await c.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
      return c;
    };
    const asesor = await entrar("asesor");
    const admin = await entrar("administrador");
    const maestro = await entrar("maestro");
    const f = await m.familia();
    const a = await m.agendar(f.prospectoId, LUNES_10, AGENDADA_EL);

    assert.equal((await maestro.post(`/api/clases-muestra/${a}/reprogramar`, { fecha_hora: MARTES_10.toISOString() })).estado, 403);
    assert.equal((await maestro.post(`/api/clases-muestra/${a}/cancelar`, {})).estado, 403);
    assert.deepEqual(await m.avisos(a), [], "lo rechazado no deja aviso");

    const re = await asesor.post<{ id: string }>(`/api/clases-muestra/${a}/reprogramar`, { fecha_hora: MARTES_10.toISOString() });
    assert.equal(re.estado, 201, JSON.stringify(re.cuerpo));
    assert.deepEqual((await m.avisos(re.cuerpo.id)).map((x) => [x.automatizacion.evento_disparador, x.estatus]), [["clase_muestra_reprogramada", "programado"]]);

    const ca = await admin.post(`/api/clases-muestra/${re.cuerpo.id}/cancelar`, { motivo: "ya no puede" });
    assert.equal(ca.estado, 200, JSON.stringify(ca.cuerpo));
    assert.deepEqual((await m.avisos(re.cuerpo.id)).map((x) => [x.automatizacion.evento_disparador, x.estatus]).sort(), [["clase_muestra_cancelada", "programado"], ["clase_muestra_reprogramada", "programado"]]);
    // Cancelar otra vez: 409 y ningún aviso nuevo.
    assert.equal((await admin.post(`/api/clases-muestra/${re.cuerpo.id}/cancelar`, {})).estado, 409);
    assert.equal((await m.avisos(re.cuerpo.id)).length, 2);

    // El motor: la reprogramada ya no vale (la clase se canceló después), sale solo la cancelación.
    const r = await m.corre(DOMINGO_12);
    assert.deepEqual([r.enviadas, r.omitidas], [1, 1]);
    assert.equal(m.enviados()[0]!.plantilla?.codigo, "aviso_clase_cancelada");
  } finally {
    await api.cerrar();
  }
});
