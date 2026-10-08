// D8: lead frío y promoción por vencer, con el motor real, MessagingProvider y el transporte falso (sin red), reloj inyectado. Cumplen TODAS las
// reglas del provider: máximo 1 de marketing cada 7 días y 3 automáticos al día por teléfono, baja de marketing / baja total, horario 09:00–20:00
// de la sucursal, atención humana, plantilla aprobada, idempotencia por ocurrencia y cancelación si el lead se inscribió o se perdió.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { correrAutomatizaciones, type ResumenMotor } from "./motor.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const DIA = 24 * 3_600_000;
const HORA = 3_600_000;
/** Martes 10 de noviembre de 2026, 12:00 en la Ciudad de México (UTC-6). */
const T = new Date("2026-11-10T18:00:00Z");
const hace = (ms: number, desde: Date = T): Date => new Date(desde.getTime() - ms);

interface Opciones {
  /** Días sin movimiento por etapa (por omisión: nuevo 2, contactado 3, negociación 5). */
  umbrales?: Partial<Record<TipoDeEtapa, number | null>>;
  maxIntentos?: number;
  sinPlantillaFrio?: boolean;
  sucursalFrio?: 0 | 1;
  offsetPromo?: number;
  maxAtrasoDias?: number;
}

async function mundo(o: Opciones = {}) {
  const org: OrganizacionDePrueba = await sembrarOrganizacion(prisma, "Seguimiento");
  const etapas = await sembrarEmbudo(prisma, org);
  const umbrales: Partial<Record<TipoDeEtapa, number | null>> = { nuevo: 2, contactado: 3, negociacion: 5, ...o.umbrales };
  for (const [tipo, dias] of Object.entries(umbrales)) await prisma.etapa_pipeline.update({ where: { id: etapas[tipo as TipoDeEtapa] }, data: { dias_alerta_sin_movimiento: dias ?? null } });
  const sucursalId = org.sucursales[0]!.id;
  const programa = await sembrarPrograma(prisma, org, { sucursalId, nombre: "Programa P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: 10, horarios: [[1, 960, 1020]] }] });
  const plantillaFrio = await prisma.plantilla_mensaje.create({
    data: { organizacion_id: org.organizacionId, codigo: "reenganche_lead_frio", content_sid: "HX00000000000000000000000000000007", categoria: "marketing", estado_aprobacion: "aprobada", cuerpo_referencia: "Hola, ¿sigue interesado {{1}} en las clases de {{2}}?", variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "nombre_vertical" }] as never },
  });
  const plantillaPromo = await prisma.plantilla_mensaje.create({
    data: { organizacion_id: org.organizacionId, codigo: "promocion_por_vencer", content_sid: "HX00000000000000000000000000000008", categoria: "marketing", estado_aprobacion: "aprobada", cuerpo_referencia: "La promoción {{2}} de {{1}} vence el {{3}}.", variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "nombre_promocion" }, { pos: 3, nombre: "fecha_vencimiento" }] as never },
  });
  const frio = await prisma.automatizacion.create({
    data: {
      organizacion_id: org.organizacionId,
      nombre: "Lead frío",
      evento_disparador: "lead_frio",
      offset_minutos: 0,
      max_intentos: o.maxIntentos ?? 3,
      ...(o.sinPlantillaFrio ? {} : { plantilla_id: plantillaFrio.id }),
      ...(o.sucursalFrio !== undefined ? { sucursal_id: org.sucursales[o.sucursalFrio]!.id } : {}),
      condiciones: o.maxAtrasoDias ? { max_atraso_dias: o.maxAtrasoDias } : {},
    },
  });
  const promo = await prisma.automatizacion.create({
    data: { organizacion_id: org.organizacionId, nombre: "Promoción por vencer", evento_disparador: "promocion_por_vencer", offset_minutos: o.offsetPromo ?? -4320, plantilla_id: plantillaPromo.id },
  });
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `s-${Math.random()}@p.test`, nombre: "Asesor", rol: "asesor", contrasena_hash: "x" } });
  const db = conAlcance(prisma, org.organizacionId);
  const transporte = new TransporteFalso();
  let consecutivo = 0;

  /** Un lead (con su prospecto) en esa etapa, con su última interacción, y por omisión una conversación de WhatsApp con la ventana cerrada. */
  async function lead(etapa: TipoDeEtapa, ultima: Date | null, p: { conversacion?: boolean; estado?: "bot" | "en_atencion_humana" | "opt_out"; sucursal?: 0 | 1; telefono?: string; nombre?: string; creado?: Date } = {}) {
    const f = await sembrarFamilia(prisma, org, { sucursalId: org.sucursales[p.sucursal ?? 0]!.id, etapaId: etapas[etapa], nombre: p.nombre ?? `Alumno ${++consecutivo}`, ...(p.telefono ? { telefono: p.telefono } : {}) });
    await prisma.lead.update({ where: { id: f.leadId }, data: { ultima_interaccion_en: ultima, creado_en: p.creado ?? hace(200 * DIA, T) } });
    let conversacionId: string | null = null;
    if (p.conversacion ?? true) {
      conversacionId = (await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: f.leadId, chatwoot_conversacion_id: randomInt(1, 2_000_000_000), estado: p.estado ?? "bot" } })).id;
    }
    return { ...f, conversacionId };
  }

  /** Una cotización vigente del lead que aplicó esa promoción (el snapshot congelado). */
  async function cotizar(l: { leadId: string; prospectoId: string }, promocionIds: string[], o2: { fecha?: string; vigenteHasta?: string; estatus?: "vigente" | "aceptada" | "vencida" } = {}) {
    return prisma.cotizacion.create({
      data: {
        organizacion_id: org.organizacionId,
        lead_id: l.leadId,
        prospecto_id: l.prospectoId,
        programa_id: programa.id,
        sucursal_id: sucursalId,
        origen: "asesor",
        creado_por_usuario_id: usuario.id,
        fecha: new Date(`${o2.fecha ?? "2026-11-09"}T00:00:00Z`),
        vigente_hasta: new Date(`${o2.vigenteHasta ?? "2026-11-20"}T00:00:00Z`),
        estatus: o2.estatus ?? "vigente",
        snapshot: { version: 1, fecha: o2.fecha ?? "2026-11-09", programa: { promociones: { aplicadas: promocionIds.map((id) => ({ promocion_id: id, nombre: "x", codigo: "X", prioridad: 0, acumulable: false })) } } } as never,
      },
    });
  }
  async function promocion(nombre: string, vence: string, o2: { activo?: boolean } = {}) {
    return prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre, codigo: `${nombre.toUpperCase().replaceAll(" ", "")}${++consecutivo}`, vigencia_desde: new Date("2026-01-01T00:00:00Z"), vigencia_hasta: new Date(`${vence}T00:00:00Z`), activo: o2.activo ?? true } });
  }
  return {
    org,
    etapas,
    db,
    transporte,
    frio,
    promo,
    programaId: programa.id,
    lead,
    cotizar,
    promocion,
    usuarioId: usuario.id,
    /** Una pasada del motor a esa hora. */
    corre(ahora: Date): Promise<ResumenMotor> {
      return correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: org.organizacionId });
    },
    enviados: () => transporte.envios.filter((e) => e.tipo === "plantilla"),
    ejecuciones: (automatizacionId: string) => db.automatizacion_ejecucion.findMany({ where: { automatizacion_id: automatizacionId }, orderBy: [{ programado_para: "asc" }, { ocurrencia: "asc" }, { id: "asc" }], select: { entidad_id: true, ocurrencia: true, estatus: true, motivo_omision: true, programado_para: true, mensaje_id: true } }),
    tareas: (leadId: string) => db.tarea_asesor.findMany({ where: { lead_id: leadId, tipo: "lead_frio" } }),
  };
}
const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;

// ─── Lead frío ───────────────────────────────────────────────────────────────────────────────────────────────────────────

test("D8 lead frío: lleva los días de su etapa sin movimiento → tarea para el asesor y la plantilla de marketing por el provider; los que aún no, los de cierre y los de una etapa sin umbral, no", async () => {
  const m = await mundo({ umbrales: { negociacion: null } });
  const frio = await m.lead("contactado", hace(3 * DIA + HORA), { nombre: "Frida" });
  const casi = await m.lead("contactado", hace(3 * DIA - HORA));
  const nuevoFrio = await m.lead("nuevo", hace(2 * DIA + HORA));
  const sinUmbral = await m.lead("negociacion", hace(30 * DIA));
  const inscrito = await m.lead("inscrito", hace(10 * DIA));
  const perdido = await m.lead("perdido", hace(10 * DIA));
  const r = await m.corre(T);
  assert.equal(r.errores, 0);
  assert.equal(r.programadas, 2);
  assert.equal(r.enviadas, 2);
  const envios = m.enviados();
  assert.equal(envios.length, 2);
  const deFrida = envios.find((e) => e.plantilla!.variables["1"] === "Frida")!;
  assert.equal(deFrida.plantilla!.codigo, "reenganche_lead_frio");
  assert.equal(deFrida.plantilla!.variables["2"], "Vertical Prueba", "el nombre de la vertical sale de la tabla");
  assert.match(deFrida.texto!, /^Hola, ¿sigue interesado Frida en las clases de Vertical Prueba\?/);
  // La tarea para el asesor (una por lead frío).
  const tareas = await m.tareas(frio.leadId);
  assert.equal(tareas.length, 1);
  assert.equal(tareas[0]!.estado, "pendiente");
  assert.equal(tareas[0]!.conversacion_id, frio.conversacionId);
  assert.match(tareas[0]!.descripcion, /lleva 3 días sin movimiento en la etapa/);
  assert.equal((await m.tareas(nuevoFrio.leadId)).length, 1);
  for (const x of [casi, sinUmbral, inscrito, perdido]) assert.equal((await m.tareas(x.leadId)).length, 0);
  // Los dos mensajes son de marketing, de origen «automatizacion», y quedaron en la transcripción.
  const mensajes = await m.db.mensaje.findMany({ where: { direccion: "saliente" }, select: { origen: true, estatus: true, plantilla: { select: { categoria: true } } } });
  assert.deepEqual(mensajes.map((x) => [x.origen, x.estatus, x.plantilla?.categoria]), [["automatizacion", "enviado", "marketing"], ["automatizacion", "enviado", "marketing"]]);
  assert.deepEqual((await m.ejecuciones(m.frio.id)).map((e) => [e.estatus, e.ocurrencia]), [["enviado", 1], ["enviado", 1]]);
});

test("D8 lead frío: idempotente — volver a correr o correr varios motores a la vez no repite el aviso, la tarea ni el mensaje", async () => {
  const m = await mundo();
  const l = await m.lead("contactado", hace(4 * DIA));
  const rs = await Promise.all([m.corre(T), m.corre(T), m.corre(T)]);
  assert.equal(rs.reduce((n, r) => n + r.errores, 0), 0);
  assert.equal(m.enviados().length, 1, "un solo mensaje");
  assert.equal((await m.ejecuciones(m.frio.id)).length, 1, "una sola ejecución (índice único)");
  assert.equal((await m.tareas(l.leadId)).length, 1);
  await m.corre(new Date(T.getTime() + 5 * 60_000));
  await m.corre(new Date(T.getTime() + HORA));
  assert.equal(m.enviados().length, 1);
  assert.equal((await m.ejecuciones(m.frio.id)).length, 1);
  assert.equal((await m.db.mensaje.count({ where: { direccion: "saliente" } })), 1);
});

test("D8 lead frío: solo lo que se enfrió RECIENTEMENTE (max_atraso_dias); al encender la automatización no se le escribe a los leads viejos", async () => {
  const m = await mundo({ maxAtrasoDias: 7 });
  const reciente = await m.lead("contactado", hace(3 * DIA + 6 * DIA)); // se enfrió hace 6 días
  const viejo = await m.lead("contactado", hace(3 * DIA + 8 * DIA)); // se enfrió hace 8 días
  const antiguo = await m.lead("contactado", hace(120 * DIA));
  await m.corre(T);
  assert.equal(m.enviados().length, 1);
  assert.equal((await m.tareas(reciente.leadId)).length, 1);
  for (const x of [viejo, antiguo]) assert.equal((await m.tareas(x.leadId)).length, 0);
  // Los viejos siguen apareciendo en la lista de estancados (D7), que es la consulta para ellos.
});

test("D8 lead frío: se cancela si el lead se movió, se inscribió o se perdió entre que se programó y que le tocaba (el horario de envío lo recorre a las 09:00)", async () => {
  const m = await mundo();
  // Madrugada del martes (03:00 locales = 09:00Z): se detecta pero sale a las 09:00 locales (15:00Z).
  const madrugada = new Date("2026-11-10T09:00:00Z");
  const seMovio = await m.lead("contactado", hace(3 * DIA + HORA, madrugada));
  const seInscribio = await m.lead("contactado", hace(3 * DIA + HORA, madrugada));
  const sePerdio = await m.lead("contactado", hace(3 * DIA + HORA, madrugada));
  const sigueFrio = await m.lead("contactado", hace(3 * DIA + HORA, madrugada));
  const r1 = await m.corre(madrugada);
  assert.equal(r1.programadas, 4);
  assert.equal(m.enviados().length, 0, "de madrugada no sale nada (invariante 14)");
  assert.deepEqual([...new Set((await m.ejecuciones(m.frio.id)).map((e) => iso(e.programado_para)))], ["2026-11-10T15:00:00.000Z"]);
  // Entre tanto: uno escribe (se mueve), uno se inscribe y uno se pierde.
  await prisma.lead.update({ where: { id: seMovio.leadId }, data: { ultima_interaccion_en: new Date("2026-11-10T14:00:00Z") } });
  await prisma.lead.update({ where: { id: seInscribio.leadId }, data: { etapa_id: m.etapas.inscrito } });
  await prisma.lead.update({ where: { id: sePerdio.leadId }, data: { etapa_id: m.etapas.perdido } });
  const r2 = await m.corre(new Date("2026-11-10T15:00:00Z"));
  assert.equal(r2.enviadas, 1);
  assert.equal(r2.omitidas, 3);
  const porLead = new Map((await m.ejecuciones(m.frio.id)).map((e) => [e.entidad_id, [e.estatus, e.motivo_omision]]));
  assert.deepEqual(porLead.get(seMovio.leadId), ["omitido", "lead_se_movio"]);
  assert.deepEqual(porLead.get(seInscribio.leadId), ["omitido", "lead_inscrito"]);
  assert.deepEqual(porLead.get(sePerdio.leadId), ["omitido", "lead_perdido"]);
  assert.deepEqual(porLead.get(sigueFrio.leadId), ["enviado", null]);
  for (const x of [seMovio, seInscribio, sePerdio]) assert.equal((await m.tareas(x.leadId)).length, 0, "ni tarea ni mensaje para los cancelados");
  assert.equal((await m.tareas(sigueFrio.leadId)).length, 1);
  assert.equal(m.enviados().length, 1);
});

test("D8 lead frío: horario 09:00–20:00 de la sucursal — de noche no sale y se recorre al siguiente horario válido (hora local de CADA sucursal)", async () => {
  const m = await mundo();
  await prisma.sucursal.update({ where: { id: m.org.sucursales[1]!.id }, data: { zona_horaria: "Asia/Tokyo" } }); // UTC+9
  const noche = new Date("2026-11-11T05:00:00Z"); // 23:00 del martes en la Ciudad de México · 14:00 del miércoles en Tokio
  const enMx = await m.lead("contactado", hace(3 * DIA + HORA, noche), { sucursal: 0 });
  const enTokio = await m.lead("contactado", hace(3 * DIA + HORA, noche), { sucursal: 1 });
  await m.corre(noche);
  assert.equal(m.enviados().length, 1, "solo sale el de Tokio (14:00 locales)");
  const ej = new Map((await m.ejecuciones(m.frio.id)).map((e) => [e.entidad_id, e]));
  assert.equal(ej.get(enTokio.leadId)!.estatus, "enviado");
  assert.equal(ej.get(enMx.leadId)!.estatus, "programado");
  assert.equal(iso(ej.get(enMx.leadId)!.programado_para), "2026-11-11T15:00:00.000Z", "el miércoles a las 09:00 locales de la Ciudad de México");
  await m.corre(new Date("2026-11-11T15:00:00Z"));
  assert.equal(m.enviados().length, 2);
  // La tarea para el asesor no depende del horario del envío, pero se crea al EJECUTAR (a las 09:00), no de madrugada.
  assert.equal((await m.tareas(enMx.leadId)).length, 1);
});

test("D8 lead frío: máximo 1 de marketing cada 7 días por teléfono — el segundo episodio dentro de la semana deja la tarea y NO manda; pasados los 7 días sí", async () => {
  const m = await mundo();
  const tel = "+525512340001";
  const l = await m.lead("contactado", hace(3 * DIA + HORA), { telefono: tel });
  await m.corre(T);
  assert.equal(m.enviados().length, 1);
  // El lead se mueve (escribe) 1 día después y a los 3 días se vuelve a enfriar: segundo episodio, 4 días después del primer mensaje.
  await prisma.lead.update({ where: { id: l.leadId }, data: { ultima_interaccion_en: new Date(T.getTime() + 1 * DIA) } });
  await prisma.tarea_asesor.updateMany({ where: { lead_id: l.leadId }, data: { estado: "hecha", resuelta_en: T } });
  const t2 = new Date(T.getTime() + 4 * DIA + HORA);
  await m.corre(t2);
  const ej = await m.ejecuciones(m.frio.id);
  assert.deepEqual(ej.map((e) => [e.ocurrencia, e.estatus, e.motivo_omision]), [[1, "enviado", null], [2, "omitido", "tope_frecuencia"]]);
  assert.equal(m.enviados().length, 1, "el tope de marketing lo aplica el provider");
  assert.equal((await m.tareas(l.leadId)).filter((t) => t.estado === "pendiente").length, 1, "pero el asesor sí se entera");
  // Tercer episodio, ya pasados los 7 días del primer mensaje: sale.
  await prisma.lead.update({ where: { id: l.leadId }, data: { ultima_interaccion_en: new Date(T.getTime() + 5 * DIA) } });
  await prisma.tarea_asesor.updateMany({ where: { lead_id: l.leadId }, data: { estado: "hecha", resuelta_en: T } });
  await m.corre(new Date(T.getTime() + 8 * DIA + HORA));
  assert.deepEqual((await m.ejecuciones(m.frio.id)).map((e) => [e.ocurrencia, e.estatus]), [[1, "enviado"], [2, "omitido"], [3, "enviado"]]);
  assert.equal(m.enviados().length, 2);
  // Y no hay un cuarto: max_intentos = 3.
  await prisma.lead.update({ where: { id: l.leadId }, data: { ultima_interaccion_en: new Date(T.getTime() + 9 * DIA) } });
  await m.corre(new Date(T.getTime() + 20 * DIA));
  assert.equal((await m.ejecuciones(m.frio.id)).length, 3);
});

test("D8 lead frío: la ocurrencia nueva exige movimiento DESPUÉS de detectado el frío anterior (sin él, es el mismo frío) y respeta max_intentos", async () => {
  const m = await mundo({ maxIntentos: 1 });
  const l = await m.lead("contactado", hace(3 * DIA + HORA));
  await m.corre(T);
  await m.corre(new Date(T.getTime() + 10 * DIA));
  assert.equal((await m.ejecuciones(m.frio.id)).length, 1, "sin movimiento, el mismo frío no se repite aunque pasen los días");
  await prisma.lead.update({ where: { id: l.leadId }, data: { ultima_interaccion_en: new Date(T.getTime() + 11 * DIA) } });
  await m.corre(new Date(T.getTime() + 20 * DIA));
  assert.equal((await m.ejecuciones(m.frio.id)).length, 1, "con max_intentos = 1 tampoco hay segundo episodio");
});

test("D8 lead frío: baja de marketing y baja total — no se manda (opt_out) pero el asesor se entera con su tarea; la baja total también corta el mensaje", async () => {
  const m = await mundo();
  const marketing = await m.lead("contactado", hace(4 * DIA), { telefono: "+525512340002" });
  const total = await m.lead("contactado", hace(4 * DIA), { telefono: "+525512340003" });
  const libre = await m.lead("contactado", hace(4 * DIA), { telefono: "+525512340004" });
  await prisma.consentimiento.create({ data: { organizacion_id: m.org.organizacionId, telefono: "+525512340002", estado: "opt_out", alcance: "marketing", origen: "manual", fecha: hace(DIA) } });
  await prisma.consentimiento.create({ data: { organizacion_id: m.org.organizacionId, telefono: "+525512340003", estado: "opt_out", alcance: "todo", origen: "palabra_clave", fecha: hace(DIA) } });
  await m.corre(T);
  const por = new Map((await m.ejecuciones(m.frio.id)).map((e) => [e.entidad_id, [e.estatus, e.motivo_omision]]));
  assert.deepEqual(por.get(marketing.leadId), ["omitido", "opt_out"]);
  assert.deepEqual(por.get(total.leadId), ["omitido", "opt_out"]);
  assert.deepEqual(por.get(libre.leadId), ["enviado", null]);
  assert.equal(m.enviados().length, 1);
  for (const x of [marketing, total, libre]) assert.equal((await m.tareas(x.leadId)).length, 1);
});

test("D8 lead frío: con una persona atendiendo (en_atencion_humana) NO sale nada ni se crea la tarea (invariante 6)", async () => {
  const m = await mundo();
  const atendido = await m.lead("contactado", hace(5 * DIA), { estado: "en_atencion_humana" });
  const bot = await m.lead("contactado", hace(5 * DIA));
  await m.corre(T);
  const por = new Map((await m.ejecuciones(m.frio.id)).map((e) => [e.entidad_id, [e.estatus, e.motivo_omision]]));
  assert.deepEqual(por.get(atendido.leadId), ["omitido", "atencion_humana"]);
  assert.deepEqual(por.get(bot.leadId), ["enviado", null]);
  assert.equal((await m.tareas(atendido.leadId)).length, 0);
  assert.equal(m.enviados().length, 1);
});

test("D8 lead frío: los 3 automáticos al día por teléfono — con el tope ya agotado no sale (tope_frecuencia) y la tarea sí queda", async () => {
  const m = await mundo();
  const l = await m.lead("contactado", hace(4 * DIA), { telefono: "+525512340005" });
  // Tres automáticos ya enviados hoy a ese teléfono.
  for (let i = 0; i < 3; i++) {
    await prisma.mensaje.create({ data: { organizacion_id: m.org.organizacionId, conversacion_id: l.conversacionId!, direccion: "saliente", estatus: "enviado", origen: "automatizacion", cuerpo: "previo", proveedor: "chatwoot", enviado_en: hace((i + 1) * HORA), creado_en: hace((i + 1) * HORA) } });
  }
  await m.corre(T);
  assert.deepEqual((await m.ejecuciones(m.frio.id)).map((e) => [e.estatus, e.motivo_omision]), [["omitido", "tope_frecuencia"]]);
  assert.equal(m.enviados().length, 0);
  assert.equal((await m.tareas(l.leadId)).length, 1);
});

test("D8 lead frío: sin conversación de WhatsApp (entró por la landing) o sin plantilla configurada, queda solo la tarea; filtrado por sucursal", async () => {
  const m = await mundo();
  const sinConv = await m.lead("contactado", hace(4 * DIA), { conversacion: false });
  await m.corre(T);
  assert.deepEqual((await m.ejecuciones(m.frio.id)).map((e) => [e.estatus, e.motivo_omision]), [["omitido", "sin_conversacion"]]);
  assert.equal((await m.tareas(sinConv.leadId))[0]!.conversacion_id, null);
  assert.equal(m.enviados().length, 0);

  const s = await mundo({ sinPlantillaFrio: true });
  const l = await s.lead("contactado", hace(4 * DIA));
  await s.corre(T);
  assert.deepEqual((await s.ejecuciones(s.frio.id)).map((e) => [e.estatus, e.motivo_omision]), [["omitido", "solo_tarea"]]);
  assert.equal((await s.tareas(l.leadId)).length, 1);
  assert.equal(s.enviados().length, 0);

  const f = await mundo({ sucursalFrio: 1 });
  const norte = await f.lead("contactado", hace(4 * DIA), { sucursal: 0 });
  const sur = await f.lead("contactado", hace(4 * DIA), { sucursal: 1 });
  await f.corre(T);
  assert.equal((await f.tareas(norte.leadId)).length, 0, "la automatización es de la sucursal sur");
  assert.equal((await f.tareas(sur.leadId)).length, 1);
});

test("D8 lead frío: una tarea pendiente por lead — si ya hay una sin resolver, no se agrega otra", async () => {
  const m = await mundo();
  const l = await m.lead("contactado", hace(4 * DIA));
  await m.corre(T);
  await prisma.lead.update({ where: { id: l.leadId }, data: { ultima_interaccion_en: new Date(T.getTime() + 1 * DIA) } });
  await m.corre(new Date(T.getTime() + 8 * DIA)); // segundo episodio con la tarea del primero sin resolver
  assert.equal((await m.tareas(l.leadId)).length, 1);
  await assert.rejects(prisma.tarea_asesor.create({ data: { organizacion_id: m.org.organizacionId, lead_id: l.leadId, tipo: "lead_frio", descripcion: "otra" } }), /Unique|unique/, "la base también lo impide");
});

// ─── Promoción por vencer ───────────────────────────────────────────────────────────────────────────────────────────────

// La promoción vale hasta el viernes 13 de noviembre (vence a las 00:00 del sábado 14 = 06:00Z). Con -4320 min (3 días) el aviso abre el
// miércoles 11 a las 00:00 locales (06:00Z) y, por el horario de envío, sale a las 09:00 locales (15:00Z).
const ABRE = new Date("2026-11-11T06:00:00Z");
const SALE = new Date("2026-11-11T15:00:00Z");

test("D8 promoción: aún no es tiempo → nada; al abrirse la ventana se programa y sale a la hora válida con los datos de la tabla; no se repite", async () => {
  const m = await mundo();
  const p = await m.promocion("Promo de otoño", "2026-11-13");
  const l = await m.lead("negociacion", hace(HORA), { nombre: "Paola" });
  await m.cotizar(l, [p.id]);
  const antes = await m.corre(new Date(ABRE.getTime() - 60_000));
  assert.equal(antes.programadas, 0);
  assert.equal(await m.db.aviso_promocion.count(), 0);
  // La ventana se abrió de madrugada: se programa para las 09:00 locales.
  const abre = await m.corre(ABRE);
  assert.equal(abre.programadas, 1);
  assert.equal(m.enviados().length, 0);
  assert.deepEqual((await m.ejecuciones(m.promo.id)).map((e) => [e.estatus, iso(e.programado_para)]), [["programado", SALE.toISOString()]]);
  const aviso = await m.db.aviso_promocion.findFirstOrThrow();
  assert.deepEqual([aviso.lead_id, aviso.promocion_id, aviso.vence_el.toISOString().slice(0, 10)], [l.leadId, p.id, "2026-11-13"]);
  await m.corre(SALE);
  assert.equal(m.enviados().length, 1);
  const envio = m.enviados()[0]!;
  assert.equal(envio.plantilla!.codigo, "promocion_por_vencer");
  assert.deepEqual(envio.plantilla!.variables, { "1": "Paola", "2": "Promo de otoño", "3": "viernes 13 de noviembre" });
  assert.equal((await m.db.mensaje.findFirstOrThrow({ where: { direccion: "saliente" }, include: { plantilla: true } })).plantilla!.categoria, "marketing");
  // Más pasadas, otra cotización del mismo lead con la misma promoción y tres motores a la vez: sigue siendo UN aviso y UN mensaje.
  await m.cotizar({ leadId: l.leadId, prospectoId: (await prisma.prospecto.create({ data: { organizacion_id: m.org.organizacionId, lead_id: l.leadId, vertical_interes_id: m.org.verticalId, nombre: "Hermano", origen: "asesor" } })).id }, [p.id]);
  await Promise.all([m.corre(new Date(SALE.getTime() + 60_000)), m.corre(new Date(SALE.getTime() + 60_000)), m.corre(new Date(SALE.getTime() + 120_000))]);
  assert.equal(await m.db.aviso_promocion.count(), 1);
  assert.equal((await m.ejecuciones(m.promo.id)).length, 1);
  assert.equal(m.enviados().length, 1);
});

test("D8 promoción: un aviso por (lead, promoción) — dos promociones del mismo lead son dos avisos; la misma promoción en dos leads, también; la base impide el repetido", async () => {
  const m = await mundo({ umbrales: { negociacion: null } });
  const a = await m.promocion("Promo A", "2026-11-13");
  const b = await m.promocion("Promo B", "2026-11-13");
  const l1 = await m.lead("contactado", hace(HORA), { telefono: "+525512341001" });
  const l2 = await m.lead("contactado", hace(HORA), { telefono: "+525512341002" });
  await m.cotizar(l1, [a.id, b.id]);
  await m.cotizar(l2, [a.id]);
  await m.corre(ABRE);
  assert.equal(await m.db.aviso_promocion.count(), 3);
  const aviso = await m.db.aviso_promocion.findFirstOrThrow({ where: { lead_id: l1.leadId, promocion_id: a.id } });
  await assert.rejects(prisma.aviso_promocion.create({ data: { organizacion_id: m.org.organizacionId, automatizacion_id: m.promo.id, lead_id: l1.leadId, prospecto_id: l1.prospectoId, cotizacion_id: aviso.cotizacion_id, promocion_id: a.id, vence_el: new Date("2026-11-13T00:00:00Z") } }), /Unique|unique/);
  // Salen a las 09:00; el provider deja pasar uno de marketing por teléfono por semana: el segundo del lead 1 queda por la frecuencia.
  await m.corre(SALE);
  const por = (await m.ejecuciones(m.promo.id)).map((e) => [e.estatus, e.motivo_omision]).sort();
  assert.deepEqual(por, [["enviado", null], ["enviado", null], ["omitido", "tope_frecuencia"]]);
  assert.equal(m.enviados().length, 2);
});

test("D8 promoción: se cancela si el lead se inscribió o se perdió, si la cotización ya no vale o si la promoción se apagó, se prorrogó o venció", async () => {
  const m = await mundo({ umbrales: { negociacion: null } });
  const p = await m.promocion("Promo", "2026-11-13");
  const l = async (nombre: string) => m.lead("contactado", hace(HORA), { nombre });
  const inscrito = await l("inscrito");
  const perdido = await l("perdido");
  const aceptada = await l("aceptada");
  const apagada = await l("apagada");
  const prorrogada = await l("prorrogada");
  const vigente = await l("vigente");
  const cot = new Map<string, { id: string }>();
  for (const x of [inscrito, perdido, aceptada, apagada, prorrogada, vigente]) cot.set(x.leadId, await m.cotizar(x, [p.id]));
  // Cada uno con su propia promoción cuando hace falta distinguirla: apagada y prorrogada comparten la promo, así que se separan.
  const pApagada = await m.promocion("Promo apagada", "2026-11-13");
  const pProrrogada = await m.promocion("Promo prorrogada", "2026-11-13");
  await prisma.cotizacion.update({ where: { id: cot.get(apagada.leadId)!.id }, data: { snapshot: { version: 1, programa: { promociones: { aplicadas: [{ promocion_id: pApagada.id }] } } } as never } });
  await prisma.cotizacion.update({ where: { id: cot.get(prorrogada.leadId)!.id }, data: { snapshot: { version: 1, programa: { promociones: { aplicadas: [{ promocion_id: pProrrogada.id }] } } } as never } });
  await m.corre(ABRE);
  assert.equal(await m.db.aviso_promocion.count(), 6);
  // Entre que se programó (a las 09:00) y que le tocaba:
  await prisma.lead.update({ where: { id: inscrito.leadId }, data: { etapa_id: m.etapas.inscrito } });
  await prisma.lead.update({ where: { id: perdido.leadId }, data: { etapa_id: m.etapas.perdido } });
  await prisma.cotizacion.update({ where: { id: cot.get(aceptada.leadId)!.id }, data: { estatus: "aceptada" } });
  await prisma.promocion.update({ where: { id: pApagada.id }, data: { activo: false } });
  await prisma.promocion.update({ where: { id: pProrrogada.id }, data: { vigencia_hasta: new Date("2026-11-30T00:00:00Z") } });
  await m.corre(SALE);
  const avisos = new Map((await m.db.aviso_promocion.findMany({ select: { id: true, lead_id: true } })).map((a) => [a.id, a.lead_id]));
  const por = new Map((await m.ejecuciones(m.promo.id)).map((e) => [avisos.get(e.entidad_id)!, [e.estatus, e.motivo_omision]]));
  assert.deepEqual(por.get(inscrito.leadId), ["omitido", "lead_inscrito"]);
  assert.deepEqual(por.get(perdido.leadId), ["omitido", "lead_perdido"]);
  assert.deepEqual(por.get(aceptada.leadId), ["omitido", "cotizacion_no_vigente"]);
  assert.deepEqual(por.get(apagada.leadId), ["omitido", "promocion_no_vigente"]);
  assert.deepEqual(por.get(prorrogada.leadId), ["omitido", "promocion_extendida"]);
  assert.deepEqual(por.get(vigente.leadId), ["enviado", null]);
  assert.equal(m.enviados().length, 1);
  // Una promoción que venció antes de que le tocara: descartado, nunca se manda tarde.
  const m2 = await mundo();
  const p2 = await m2.promocion("Promo corta", "2026-11-13");
  const l2 = await m2.lead("contactado", hace(HORA));
  await m2.cotizar(l2, [p2.id]);
  await m2.corre(ABRE);
  await m2.corre(new Date("2026-11-14T07:00:00Z")); // ya pasó la medianoche del sábado: vencida
  assert.deepEqual((await m2.ejecuciones(m2.promo.id)).map((e) => [e.estatus, e.motivo_omision]), [["descartado", "evento_pasado"]]);
  assert.equal(m2.enviados().length, 0);
});

test("D8 promoción: si el horario de envío llegaría cuando la promoción ya venció, se descarta y queda registrado (nunca se manda tarde); con ventana propia más estrecha se recorre dentro de ella", async () => {
  const m = await mundo({ offsetPromo: -60 }); // una hora antes de vencer: 23:00 del viernes
  const p = await m.promocion("Promo", "2026-11-13");
  const once = new Date("2026-11-14T05:00:00Z"); // 23:00 del viernes en la Ciudad de México
  const l = await m.lead("contactado", hace(HORA, once));
  await m.cotizar(l, [p.id]);
  const r = await m.corre(once);
  assert.equal(r.programadas, 1);
  assert.deepEqual((await m.ejecuciones(m.promo.id)).map((e) => [e.estatus, e.motivo_omision]), [["descartado", "evento_pasado"]]);
  assert.equal(await m.db.aviso_promocion.count(), 1, "queda el aviso: no se vuelve a evaluar cada minuto");
  await m.corre(new Date(once.getTime() + 60_000));
  assert.equal((await m.ejecuciones(m.promo.id)).length, 1);
  assert.equal(m.enviados().length, 0);

  // Con la ventana propia de 10:00 a 12:00 y la ventana abierta a las 00:00, sale a las 10:00 locales.
  const m2 = await mundo();
  await prisma.automatizacion.update({ where: { id: m2.promo.id }, data: { hora_inicio_min: 600, hora_fin_min: 720 } });
  const p2 = await m2.promocion("Promo", "2026-11-13");
  const l2 = await m2.lead("contactado", hace(HORA));
  await m2.cotizar(l2, [p2.id]);
  await m2.corre(ABRE);
  assert.deepEqual((await m2.ejecuciones(m2.promo.id)).map((e) => iso(e.programado_para)), ["2026-11-11T16:00:00.000Z"]);
  await m2.corre(new Date("2026-11-11T15:00:00Z"));
  assert.equal(m2.enviados().length, 0, "a las 09:00 todavía no (su ventana abre a las 10:00)");
  await m2.corre(new Date("2026-11-11T16:00:00Z"));
  assert.equal(m2.enviados().length, 1);
});

test("D8 promoción: baja de marketing, baja total y atención humana se respetan; sin conversación de WhatsApp no hay por dónde mandar", async () => {
  const m = await mundo({ umbrales: { negociacion: null } });
  const p = await m.promocion("Promo", "2026-11-13");
  const mk = await m.lead("contactado", hace(HORA), { telefono: "+525512342001" });
  const tt = await m.lead("contactado", hace(HORA), { telefono: "+525512342002" });
  const hum = await m.lead("contactado", hace(HORA), { estado: "en_atencion_humana", telefono: "+525512342003" });
  const sin = await m.lead("contactado", hace(HORA), { conversacion: false });
  const ok = await m.lead("contactado", hace(HORA), { telefono: "+525512342004" });
  for (const x of [mk, tt, hum, sin, ok]) await m.cotizar(x, [p.id]);
  await prisma.consentimiento.create({ data: { organizacion_id: m.org.organizacionId, telefono: "+525512342001", estado: "opt_out", alcance: "marketing", origen: "manual", fecha: hace(DIA) } });
  await prisma.consentimiento.create({ data: { organizacion_id: m.org.organizacionId, telefono: "+525512342002", estado: "opt_out", alcance: "todo", origen: "palabra_clave", fecha: hace(DIA) } });
  await m.corre(ABRE);
  await m.corre(SALE);
  const avisos = new Map((await m.db.aviso_promocion.findMany({ select: { id: true, lead_id: true } })).map((a) => [a.id, a.lead_id]));
  const por = new Map((await m.ejecuciones(m.promo.id)).map((e) => [avisos.get(e.entidad_id)!, [e.estatus, e.motivo_omision]]));
  assert.deepEqual(por.get(mk.leadId), ["omitido", "opt_out"]);
  assert.deepEqual(por.get(tt.leadId), ["omitido", "opt_out"]);
  assert.deepEqual(por.get(hum.leadId), ["omitido", "atencion_humana"]);
  assert.deepEqual(por.get(sin.leadId), ["omitido", "sin_conversacion"]);
  assert.deepEqual(por.get(ok.leadId), ["enviado", null]);
  assert.equal(m.enviados().length, 1);
});

test("D8 promoción: el tope de 3 automáticos al día por teléfono lo aplica el provider (con el tope agotado no sale)", async () => {
  const m = await mundo();
  const p = await m.promocion("Promo", "2026-11-13");
  const l = await m.lead("contactado", hace(HORA), { telefono: "+525512343001" });
  await m.cotizar(l, [p.id]);
  await m.corre(ABRE);
  for (let i = 0; i < 3; i++) {
    await prisma.mensaje.create({ data: { organizacion_id: m.org.organizacionId, conversacion_id: l.conversacionId!, direccion: "saliente", estatus: "enviado", origen: "automatizacion", cuerpo: "previo", proveedor: "chatwoot", enviado_en: hace(i * HORA, SALE), creado_en: hace((i + 1) * HORA, SALE) } });
  }
  await m.corre(SALE);
  assert.deepEqual((await m.ejecuciones(m.promo.id)).map((e) => [e.estatus, e.motivo_omision]), [["omitido", "tope_frecuencia"]]);
  assert.equal(m.enviados().length, 0);
  // Configurable por organización (decisión 4): con un tope de 5, el mismo caso sale.
  const m2 = await mundo();
  await fijarConfiguracion(prisma, m2.org.organizacionId, { max_automaticos_por_dia: 5 });
  const p2 = await m2.promocion("Promo", "2026-11-13");
  const l2 = await m2.lead("contactado", hace(HORA), { telefono: "+525512343002" });
  await m2.cotizar(l2, [p2.id]);
  await m2.corre(ABRE);
  for (let i = 0; i < 3; i++) {
    await prisma.mensaje.create({ data: { organizacion_id: m2.org.organizacionId, conversacion_id: l2.conversacionId!, direccion: "saliente", estatus: "enviado", origen: "automatizacion", cuerpo: "previo", proveedor: "chatwoot", enviado_en: hace(i * HORA, SALE), creado_en: hace((i + 1) * HORA, SALE) } });
  }
  await m2.corre(SALE);
  assert.equal(m2.enviados().length, 1);
});

test("D8 promoción: solo cotizaciones VIGENTES de leads abiertos con promociones aplicadas; una promoción sin fin o inactiva no genera aviso", async () => {
  const m = await mundo({ umbrales: { negociacion: null } });
  const sinFin = await prisma.promocion.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Sin fin", codigo: "SINFIN", vigencia_desde: new Date("2026-01-01T00:00:00Z") } });
  const inactiva = await m.promocion("Inactiva", "2026-11-13", { activo: false });
  const buena = await m.promocion("Buena", "2026-11-13");
  const l = await m.lead("contactado", hace(HORA));
  await m.cotizar(l, [sinFin.id, inactiva.id]);
  const vencida = await m.lead("contactado", hace(HORA));
  await m.cotizar(vencida, [buena.id], { estatus: "vencida" });
  const sinPromos = await m.lead("contactado", hace(HORA));
  await m.cotizar(sinPromos, []);
  const cerrado = await m.lead("inscrito", hace(HORA));
  await m.cotizar(cerrado, [buena.id]);
  const caducada = await m.lead("contactado", hace(HORA));
  await m.cotizar(caducada, [buena.id], { fecha: "2026-11-01", vigenteHasta: "2026-11-09" }); // su último día ya pasó (aunque el barrido no la marcó)
  const r = await m.corre(ABRE);
  assert.equal(r.programadas, 0);
  assert.equal(await m.db.aviso_promocion.count(), 0);
});
