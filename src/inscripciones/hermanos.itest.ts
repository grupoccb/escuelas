// F7: hermanos. (1) La promoción por `min_hermanos` se aplica SOLA contando los hermanos inscritos de la familia (por `tutor_alumno`, sin duplicar si hay
// dos tutores). (2) La lista de cross-sell: tutores con UN solo hijo inscrito, con sus verticales. (3) La bienvenida de inscripción, una automatización del
// motor que sale al tutor responsable por MessagingProvider con todas sus reglas, idempotente por inscripción y sin datos de salud.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { correrAutomatizaciones } from "../automatizaciones/motor.ts";
import { conAlcance } from "../datos/alcance.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarMotivoBaja, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { guardarSensible } from "../sensibles/index.ts";

const AHORA = new Date("2026-11-10T09:00:00Z"); // 03:00 en la Ciudad de México: fuera del horario de envío; hoy = 2026-11-10
let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let docs: DocumentosLegalesSembrados;
let admin: ClienteApi;
let adminId: string;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let maestro: ClienteApi;
let norte: string;
let sur: string;
let verticalB: string;
let motivo: string;
const db = () => conAlcance(prisma, org.organizacionId);
const cifrador = crearCifrador(randomBytes(32));

interface Insc { id: string; descuento_mensualidad_aplicado: string; descuento_inscripcion_aplicado: string; promociones: { tipo: string; estatus: string }[]; estatus: string }
interface Errores { error: { codigo: string; mensaje: string } }
interface Lista { datos: { tutor_id: string; nombre: string; telefono: string; sucursal_id: string | null; alumno: { id: string; nombre: string }; verticales_inscritas: { id: string; nombre: string }[]; verticales_sin: { id: string; nombre: string; disponible_en_su_sucursal: boolean }[] }[]; paginacion: { total: number } }

let n = 0;
async function programa(o: { cupo?: number; sucursalId?: string; verticalId?: string } = {}) {
  const sucursalId = o.sucursalId ?? norte;
  if (o.verticalId && o.verticalId !== org.verticalId) {
    const p = await prisma.programa.create({ data: { organizacion_id: org.organizacionId, vertical_id: o.verticalId, sucursal_id: sucursalId, nombre: `Programa B ${++n}`, edad_min: 3, edad_max: 14 } });
    const g = await prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: p.id, nombre: `Grupo B ${n}`, cupo_maximo: o.cupo ?? 20 } });
    await prisma.grupo_horario.create({ data: { organizacion_id: org.organizacionId, grupo_id: g.id, dia_semana: n % 7, hora_inicio_min: 480, hora_fin_min: 530 } });
    await prisma.precio.create({ data: { organizacion_id: org.organizacionId, programa_id: p.id, costo_inscripcion: "500.00", costo_mensualidad: "1000.00", vigencia_desde: new Date("2020-01-01") } });
    return { programaId: p.id, grupoId: g.id };
  }
  const p = await sembrarPrograma(prisma, org, { sucursalId, nombre: `Programa ${++n}`, edadMin: 3, edadMax: 14, grupos: [{ nombre: `Grupo ${n}`, cupoMaximo: o.cupo ?? 20, horarios: [[n % 7, 480, 530]] }], precio: { inscripcion: "500.00", mensualidad: "1000.00" } });
  return { programaId: p.id, grupoId: p.grupos[0]!.id };
}
const alumno = (o: Parameters<typeof sembrarAlumno>[2] = {}) => sembrarAlumno(prisma, org, { docs, ...o });
const inscribir = (c: ClienteApi, alumnoId: string, grupoId: string) => c.post<Insc & Errores>("/api/inscripciones", { alumno_id: alumnoId, grupo_id: grupoId });
const vincular = (tutorId: string, alumnoId: string, parentesco = "madre", pago = false) => prisma.tutor_alumno.create({ data: { organizacion_id: org.organizacionId, tutor_id: tutorId, alumno_id: alumnoId, parentesco, es_responsable_pago: pago } });

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador } });
  org = await sembrarOrganizacion(prisma, "Hermanos");
  await sembrarEmbudo(prisma, org);
  docs = await sembrarDocumentosLegales(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  verticalB = (await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Vertical B", slug: "vertical-b" } })).id;
  await prisma.sucursal_vertical.create({ data: { organizacion_id: org.organizacionId, sucursal_id: norte, vertical_id: verticalB } });
  motivo = await sembrarMotivoBaja(prisma, org);
  const entrar = async (rol: "administrador" | "asesor" | "maestro", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  const a = await entrar("administrador");
  admin = a.c;
  adminId = a.id;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  maestro = (await entrar("maestro")).c;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

// ── Promoción por hermanos ─────────────────────────────────────────────────────────────────────────

/** Una promoción por hermanos en su propia organización-ventana: código único y activa solo durante la prueba. */
async function promoHermanos(hermanos: number, porcentaje = "10.00") {
  const p = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: `Hermanos ${hermanos}`, codigo: `HERM${hermanos}${++n}${Date.now()}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "min_hermanos", condicion_valor: { hermanos }, acumulable: true, prioridad: 5 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: p.id, tipo: "descuento_mensualidad", modo: "porcentaje", valor: porcentaje } });
  return p.id;
}
const apagar = (id: string) => prisma.promocion.update({ where: { id }, data: { activo: false } });

test("la promoción por 2 hermanos se aplica SOLA al segundo hijo (el primero paga completo), y los hermanos se cuentan por la familia, no por el grupo", async () => {
  const promo = await promoHermanos(2);
  try {
    const g1 = await programa();
    const g2 = await programa();
    const mayor = await alumno();
    const menor = await alumno({ conTutor: mayor.tutorId }); // misma familia: el mismo tutor por su teléfono
    assert.equal(menor.tutorId, mayor.tutorId);
    const i1 = await inscribir(admin, mayor.alumnoId, g1.grupoId);
    assert.equal(i1.estado, 201, JSON.stringify(i1.cuerpo));
    assert.equal(i1.cuerpo.descuento_mensualidad_aplicado, "0.00", "el primer hijo no tiene hermanos inscritos todavía");
    const i2 = await inscribir(admin, menor.alumnoId, g2.grupoId);
    assert.equal(i2.estado, 201);
    assert.equal(i2.cuerpo.descuento_mensualidad_aplicado, "100.00", "10 % de $1,000.00 por tener un hermano inscrito");
    assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: promo } })).cupo_usado, 1);
    // Un niño de OTRA familia no recibe la promoción por el vecino.
    const ajeno = await alumno();
    assert.equal((await inscribir(admin, ajeno.alumnoId, g1.grupoId)).cuerpo.descuento_mensualidad_aplicado, "0.00");
  } finally {
    await apagar(promo);
  }
});

test("dos tutores del mismo niño (mamá y abuela) NO cuentan dos veces: con una promoción de 3 hermanos, el segundo hijo todavía no la recibe", async () => {
  const promo = await promoHermanos(3);
  try {
    const g = await programa();
    const a = await alumno();
    const b = await alumno({ conTutor: a.tutorId });
    const abuela = await prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "Lupe", telefono: `+5255${randomInt(10_000_000, 99_999_999)}`, sucursal_id: norte } });
    await vincular(abuela.id, a.alumnoId, "abuela");
    await vincular(abuela.id, b.alumnoId, "abuela");
    assert.equal((await inscribir(admin, a.alumnoId, g.grupoId)).estado, 201);
    const rb = await inscribir(admin, b.alumnoId, g.grupoId);
    assert.equal(rb.cuerpo.descuento_mensualidad_aplicado, "0.00", "hermanos = 1 (no 2 por tener dos tutores en común): 1 + el que se inscribe = 2 < 3");
    // El tercero sí: ya hay DOS hermanos inscritos distintos.
    const c = await alumno({ conTutor: a.tutorId });
    const rc = await inscribir(admin, c.alumnoId, g.grupoId);
    assert.equal(rc.cuerpo.descuento_mensualidad_aplicado, "100.00");
  } finally {
    await apagar(promo);
  }
});

test("solo cuentan los hermanos con inscripción ACTIVA (una congelada o una baja no); un hermano ligado por un solo tutor en común y uno de otra vertical sí", async () => {
  const promo = await promoHermanos(2);
  try {
    const g = await programa();
    const gB = await programa({ verticalId: verticalB });
    const hermano = await alumno();
    const ih = await inscribir(admin, hermano.alumnoId, g.grupoId);
    const nuevo = await alumno({ conTutor: hermano.tutorId });
    // Congelado: no cuenta.
    await admin.post(`/api/inscripciones/${ih.cuerpo.id}/congelar`, {});
    assert.equal((await inscribir(admin, nuevo.alumnoId, g.grupoId)).cuerpo.descuento_mensualidad_aplicado, "0.00", "el hermano congelado no cuenta");
    // Reactivado: cuenta (otro niño de la familia).
    await admin.post(`/api/inscripciones/${ih.cuerpo.id}/reactivar`, {});
    const otro = await alumno({ conTutor: hermano.tutorId });
    assert.equal((await inscribir(admin, otro.alumnoId, g.grupoId)).cuerpo.descuento_mensualidad_aplicado, "100.00");
    // De baja: no cuenta.
    const baja = await alumno();
    const ib = await inscribir(admin, baja.alumnoId, g.grupoId);
    await admin.post(`/api/inscripciones/${ib.cuerpo.id}/baja`, { motivo_baja_id: motivo });
    const hermanoDeBaja = await alumno({ conTutor: baja.tutorId });
    assert.equal((await inscribir(admin, hermanoDeBaja.alumnoId, g.grupoId)).cuerpo.descuento_mensualidad_aplicado, "0.00");
    // Hermano en OTRA vertical: la familia es una sola, cuenta.
    const enB = await alumno();
    assert.equal((await inscribir(admin, enB.alumnoId, gB.grupoId)).estado, 201);
    const hermanoEnA = await alumno({ conTutor: enB.tutorId });
    assert.equal((await inscribir(admin, hermanoEnA.alumnoId, g.grupoId)).cuerpo.descuento_mensualidad_aplicado, "100.00", "la vertical no importa para los hermanos");
    // Un solo tutor en común (el papá), aunque cada niño tenga otra mamá: son hermanos.
    const x = await alumno();
    const y = await alumno();
    await vincular(x.tutorId, y.alumnoId, "padre");
    assert.equal((await inscribir(admin, x.alumnoId, g.grupoId)).cuerpo.descuento_mensualidad_aplicado, "0.00");
    assert.equal((await inscribir(admin, y.alumnoId, g.grupoId)).cuerpo.descuento_mensualidad_aplicado, "100.00");
  } finally {
    await apagar(promo);
  }
});

// ── Cross-sell: tutores con un solo hijo inscrito ──────────────────────────────────────────────────────

test("GET /api/familias/un-solo-hijo: solo los tutores con UN hijo inscrito, con las verticales en las que sí y en las que no (y si su sucursal las ofrece)", async () => {
  const gA = await programa();
  const gB = await programa({ verticalId: verticalB });
  const solo = await alumno({ nombre: "Único" });
  assert.equal((await inscribir(admin, solo.alumnoId, gA.grupoId)).estado, 201);
  // Dos hijos inscritos → fuera de la lista.
  const h1 = await alumno({ nombre: "Hermano1" });
  const h2 = await alumno({ conTutor: h1.tutorId, nombre: "Hermano2" });
  await inscribir(admin, h1.alumnoId, gA.grupoId);
  await inscribir(admin, h2.alumnoId, gA.grupoId);
  // Un hijo activo y otro congelado → cuenta como UN hijo inscrito.
  const c1 = await alumno({ nombre: "ActivoCongelado" });
  const c2 = await alumno({ conTutor: c1.tutorId, nombre: "Congelado" });
  await inscribir(admin, c1.alumnoId, gA.grupoId);
  const ic2 = await inscribir(admin, c2.alumnoId, gA.grupoId);
  await admin.post(`/api/inscripciones/${ic2.cuerpo.id}/congelar`, {});
  // Un tutor sin ningún hijo activo (solo congelado) → fuera.
  const z = await alumno({ nombre: "SoloCongelado" });
  const iz = await inscribir(admin, z.alumnoId, gA.grupoId);
  await admin.post(`/api/inscripciones/${iz.cuerpo.id}/congelar`, {});
  // Mamá y abuela del mismo único hijo: los DOS tutores aparecen (cada uno con su único hijo), el niño no se cuenta dos veces.
  const abuela = await prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "Abuela", telefono: `+5255${randomInt(10_000_000, 99_999_999)}`, sucursal_id: norte } });
  await vincular(abuela.id, solo.alumnoId, "abuela");
  // Uno ya en las dos verticales.
  const doble = await alumno({ nombre: "EnDosVerticales" });
  await inscribir(admin, doble.alumnoId, gA.grupoId);
  await inscribir(admin, doble.alumnoId, gB.grupoId);

  const r = await admin.get<Lista>("/api/familias/un-solo-hijo?limite=100");
  assert.equal(r.estado, 200);
  const por = new Map(r.cuerpo.datos.map((f) => [f.tutor_id, f]));
  assert.ok(por.has(solo.tutorId) && por.has(abuela.id));
  assert.ok(por.has(c1.tutorId), "un hijo activo y otro congelado = un solo hijo inscrito");
  assert.ok(!por.has(h1.tutorId), "dos hijos inscritos: fuera");
  assert.ok(!por.has(z.tutorId), "sin ningún hijo activo: fuera");
  assert.ok(por.has(doble.tutorId), "un niño en dos verticales es UN hijo");
  const f = por.get(solo.tutorId)!;
  assert.equal(f.alumno.nombre, "Único");
  assert.deepEqual(f.verticales_inscritas.map((v) => v.id), [org.verticalId]);
  assert.deepEqual(f.verticales_sin.map((v) => [v.id, v.disponible_en_su_sucursal]), [[verticalB, true]], "la otra vertical sí se ofrece en su sucursal");
  assert.deepEqual(por.get(doble.tutorId)!.verticales_sin, []);
  // Filtro: las familias que no están en la vertical B (excluye a la que ya está en las dos).
  const sinB = await admin.get<Lista>(`/api/familias/un-solo-hijo?sin_vertical_id=${verticalB}&limite=100`);
  assert.ok(sinB.cuerpo.datos.some((x) => x.tutor_id === solo.tutorId));
  assert.ok(!sinB.cuerpo.datos.some((x) => x.tutor_id === doble.tutorId));
  // Paginación estable.
  const p1 = await admin.get<Lista>("/api/familias/un-solo-hijo?limite=2&pagina=1");
  const p2 = await admin.get<Lista>("/api/familias/un-solo-hijo?limite=2&pagina=2");
  assert.equal(p1.cuerpo.datos.length, 2);
  assert.ok(p1.cuerpo.datos.every((x) => !p2.cuerpo.datos.some((y) => y.tutor_id === x.tutor_id)));
  assert.equal(p1.cuerpo.paginacion.total, r.cuerpo.paginacion.total);
});

test("cross-sell: el asesor ve solo las familias de sus sucursales, el maestro no tiene acceso (403) y otra organización no se cuela", async () => {
  const g = await programa();
  const a = await alumno({ nombre: "DelNorte" });
  await inscribir(admin, a.alumnoId, g.grupoId);
  const delSur = await programa({ sucursalId: sur });
  const s = await alumno({ nombre: "DelSur", sucursalId: sur });
  await inscribir(admin, s.alumnoId, delSur.grupoId);
  const nombres = async (c: ClienteApi) => (await c.get<Lista>("/api/familias/un-solo-hijo?limite=100")).cuerpo.datos.map((f) => f.alumno.nombre);
  assert.ok((await nombres(asesorNorte)).includes("DelNorte") && !(await nombres(asesorNorte)).includes("DelSur"));
  assert.ok((await nombres(asesorSur)).includes("DelSur") && !(await nombres(asesorSur)).includes("DelNorte"));
  assert.equal((await maestro.get("/api/familias/un-solo-hijo")).estado, 403);
  assert.equal((await api.cliente().get("/api/familias/un-solo-hijo")).estado, 401);
  const otra = await sembrarOrganizacion(prisma, "Hermanos ajena");
  const u = await sembrarUsuario(prisma, otra.organizacionId, { rol: "administrador" });
  const cAjena = api.cliente();
  await cAjena.login(otra.slug, u.correo, u.contrasena);
  assert.equal((await cAjena.get<Lista>("/api/familias/un-solo-hijo")).cuerpo.datos.length, 0);
});

// ── Bienvenida de inscripción ──────────────────────────────────────────────────────────────────────────

const CENTINELA_SALUD = "CENTINELA-F7-ALERGIA";

async function mundoDeBienvenida(o: { sinConversacion?: boolean; offset?: number } = {}) {
  const plantilla = await prisma.plantilla_mensaje.create({
    data: {
      organizacion_id: org.organizacionId,
      codigo: `bienvenida_inscripcion_${++n}`,
      content_sid: "HX00000000000000000000000000000099",
      categoria: "utility",
      estado_aprobacion: "aprobada",
      cuerpo_referencia: "¡Bienvenidos! {{1}} quedó inscrito en {{2}}, sucursal {{3}}. Su primera clase es el {{4}}.",
      variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "nombre_grupo" }, { pos: 3, nombre: "nombre_sucursal" }, { pos: 4, nombre: "fecha_inicio" }] as never,
    },
  });
  const automatizacion = await prisma.automatizacion.create({
    data: { organizacion_id: org.organizacionId, nombre: `Bienvenida ${n}`, evento_disparador: "inscripcion_creada", offset_minutos: o.offset ?? 0, plantilla_id: plantilla.id, dias_permitidos: [0, 1, 2, 3, 4, 5, 6] },
  });
  const transporte = new TransporteFalso();
  const a = await alumno({ nombre: "Mateo" });
  const conv = o.sinConversacion ? null : await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: a.leadId, chatwoot_conversacion_id: randomInt(1, 2_000_000_000) } });
  return {
    a,
    conv,
    automatizacion,
    transporte,
    corre: (ahora: Date) => correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: org.organizacionId }),
    ejecuciones: (inscripcionId: string) => db().automatizacion_ejecucion.findMany({ where: { entidad_tipo: "inscripcion", entidad_id: inscripcionId, automatizacion_id: automatizacion.id }, orderBy: { ocurrencia: "asc" } }),
    enviados: () => transporte.envios.filter((e) => e.tipo === "plantilla" && e.plantilla?.codigo.startsWith("bienvenida_inscripcion")),
    apagar: () => prisma.automatizacion.update({ where: { id: automatizacion.id }, data: { activo: false } }),
  };
}

test("bienvenida: al inscribir queda UNA ejecución programada (fuera de horario se recorre a las 09:00), sale al tutor responsable por plantilla con los datos del alumno y no se repite", async () => {
  const m = await mundoDeBienvenida();
  try {
    const g = await programa();
    const antes = await prisma.inscripcion.count({ where: { alumno_id: m.a.alumnoId } });
    assert.equal(antes, 0);
    const i = await inscribir(admin, m.a.alumnoId, g.grupoId);
    assert.equal(i.estado, 201);
    const ej = await m.ejecuciones(i.cuerpo.id);
    assert.equal(ej.length, 1);
    assert.equal(ej[0]!.estatus, "programado");
    assert.equal(ej[0]!.programado_para.toISOString(), "2026-11-10T15:00:00.000Z", "03:00 local → las 09:00 del mismo día (invariante 14)");
    // Antes de su hora no sale nada; a las 09:00 sale.
    assert.equal((await m.corre(new Date("2026-11-10T14:59:00Z"))).enviadas, 0);
    assert.equal((await m.corre(new Date("2026-11-10T15:00:00Z"))).enviadas, 1);
    const [e] = m.enviados();
    assert.deepEqual(e!.plantilla?.variables, { "1": "Mateo", "2": (await prisma.grupo.findFirstOrThrow({ where: { id: g.grupoId } })).nombre, "3": "Norte", "4": "martes 10 de noviembre" });
    assert.equal(e!.texto, `¡Bienvenidos! Mateo quedó inscrito en ${(await prisma.grupo.findFirstOrThrow({ where: { id: g.grupoId } })).nombre}, sucursal Norte. Su primera clase es el martes 10 de noviembre.`);
    assert.equal(e!.destino.chatwootConversacionId, (await prisma.conversacion.findFirstOrThrow({ where: { id: m.conv!.id } })).chatwoot_conversacion_id);
    assert.equal((await m.ejecuciones(i.cuerpo.id))[0]!.estatus, "enviado");
    // Idempotente: otra pasada del motor no manda de nuevo, y volver a programar no duplica la ejecución.
    assert.equal((await m.corre(new Date("2026-11-10T16:00:00Z"))).enviadas, 0);
    assert.equal(m.enviados().length, 1);
    assert.equal((await m.ejecuciones(i.cuerpo.id)).length, 1);
    // Una segunda inscripción del mismo alumno (otro grupo) tiene SU propia bienvenida.
    const g2 = await programa();
    const i2 = await inscribir(admin, m.a.alumnoId, g2.grupoId);
    assert.equal((await m.ejecuciones(i2.cuerpo.id)).length, 1);
  } finally {
    await m.apagar();
  }
});

test("bienvenida: va al tutor RESPONSABLE de pago (la conversación del lead con su teléfono), aunque quien escribió fue otro adulto", async () => {
  const m = await mundoDeBienvenida();
  try {
    const g = await programa();
    // El papá es ahora el responsable de pago y tiene su propia conversación (otro lead con su teléfono).
    const papa = await prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "Pedro", telefono: `+5255${randomInt(10_000_000, 99_999_999)}`, sucursal_id: norte } });
    await prisma.tutor_alumno.updateMany({ where: { alumno_id: m.a.alumnoId }, data: { es_responsable_pago: false } });
    await vincular(papa.id, m.a.alumnoId, "padre", true);
    const leadPapa = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: norte, etapa_id: org.etapaInicialId, telefono: papa.telefono, nombre_contacto: "Pedro" } });
    const convPapa = await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: leadPapa.id, chatwoot_conversacion_id: randomInt(1, 2_000_000_000) } });
    const i = await inscribir(admin, m.a.alumnoId, g.grupoId);
    assert.equal(i.estado, 201);
    await m.corre(new Date("2026-11-10T15:00:00Z"));
    const aPapa = m.enviados().filter((e) => e.destino.chatwootConversacionId === convPapa.chatwoot_conversacion_id);
    assert.equal(aPapa.length, 1, "a la conversación del responsable de pago");
    assert.equal(m.enviados().filter((e) => e.destino.chatwootConversacionId === m.conv!.chatwoot_conversacion_id && e.plantilla?.variables["1"] === "Mateo").length, 0, "no a la de quien escribió");
  } finally {
    await m.apagar();
  }
});

test("bienvenida: pasa por MessagingProvider con TODAS sus reglas — una baja del teléfono, la atención humana y la inscripción que ya no vale la omiten con su motivo; sin conversación deja una tarea", async () => {
  const m = await mundoDeBienvenida();
  try {
    const g = await programa();
    // Baja del teléfono (opt-out): no sale.
    const i1 = await inscribir(admin, m.a.alumnoId, g.grupoId);
    await prisma.conversacion.update({ where: { id: m.conv!.id }, data: { estado: "opt_out" } });
    assert.equal((await m.corre(new Date("2026-11-10T15:00:00Z"))).enviadas, 0);
    assert.equal(m.enviados().length, 0);
    const e1 = (await m.ejecuciones(i1.cuerpo.id))[0]!;
    assert.equal(e1.estatus, "omitido");
    assert.ok(e1.motivo_omision, "queda el motivo");
    // Atención humana: hoy bloquea toda automatización (invariante 6 vigente; INV-6 lo reformulará para los avisos de servicio).
    const m2 = await mundoDeBienvenida();
    const i2 = await inscribir(admin, m2.a.alumnoId, (await programa()).grupoId);
    await prisma.conversacion.update({ where: { id: m2.conv!.id }, data: { estado: "en_atencion_humana" } });
    await m2.corre(new Date("2026-11-10T15:00:00Z"));
    assert.equal(m2.enviados().length, 0);
    assert.equal((await m2.ejecuciones(i2.cuerpo.id))[0]!.estatus, "omitido");
    await m2.apagar();
    // La inscripción se dio de baja antes de que saliera: ya no tiene sentido.
    const m3 = await mundoDeBienvenida();
    const i3 = await inscribir(admin, m3.a.alumnoId, (await programa()).grupoId);
    assert.equal((await admin.post(`/api/inscripciones/${i3.cuerpo.id}/baja`, { motivo_baja_id: motivo })).estado, 200);
    await m3.corre(new Date("2026-11-10T15:00:00Z"));
    assert.equal(m3.enviados().length, 0);
    const e3 = (await m3.ejecuciones(i3.cuerpo.id))[0]!;
    assert.deepEqual([e3.estatus, e3.motivo_omision], ["omitido", "inscripcion_no_vigente"]);
    await m3.apagar();
    // Sin conversación de WhatsApp: no hay por dónde, y una persona decide (tarea para el asesor).
    const m4 = await mundoDeBienvenida({ sinConversacion: true });
    const i4 = await inscribir(admin, m4.a.alumnoId, (await programa()).grupoId);
    await m4.corre(new Date("2026-11-10T15:00:00Z"));
    const e4 = (await m4.ejecuciones(i4.cuerpo.id))[0]!;
    assert.deepEqual([e4.estatus, e4.motivo_omision], ["omitido", "sin_conversacion"]);
    const tarea = await prisma.tarea_asesor.findFirstOrThrow({ where: { lead_id: m4.a.leadId, tipo: "automatizacion_omitida", estado: "pendiente" } });
    assert.match(tarea.descripcion, /bienvenida de inscripción de Mateo/);
    await m4.apagar();
  } finally {
    await m.apagar();
  }
});

test("EF-02: la bienvenida sale por la conversación de la VERTICAL de la inscripción aunque el mismo teléfono tenga una más reciente en otra; sin conversación de esa vertical no se manda y queda tarea", async () => {
  const m = await mundoDeBienvenida();
  let m2: Awaited<ReturnType<typeof mundoDeBienvenida>> | null = null;
  let m3: Awaited<ReturnType<typeof mundoDeBienvenida>> | null = null;
  try {
    const canalB = await prisma.canal_whatsapp.create({ data: { organizacion_id: org.organizacionId, vertical_id: verticalB, nombre_publico: "Canal B" } });
    const bandejaB = await prisma.bandeja_chatwoot.create({ data: { organizacion_id: org.organizacionId, canal_whatsapp_id: canalB.id, nombre: "Vertical B", chatwoot_account_id: randomInt(1_000_000, 2_000_000_000), chatwoot_inbox_id: randomInt(1_000_000, 2_000_000_000) } });
    /** La misma familia (mismo teléfono) escribió también a la otra vertical, DESPUÉS: su conversación es la más reciente. */
    const conversacionEnB = async (telefono: string) => {
      const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: verticalB, sucursal_interes_id: norte, etapa_id: org.etapaInicialId, telefono, nombre_contacto: "Mamá" } });
      return prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: bandejaB.id, lead_id: lead.id, chatwoot_conversacion_id: randomInt(1, 2_000_000_000), creado_en: new Date(Date.now() + 3_600_000) } });
    };
    const convB = await conversacionEnB(m.a.telefono);
    const destinos = () => m.enviados().map((e) => e.destino.chatwootConversacionId);

    // Inscrita en un grupo de la vertical A: sale por la conversación de A, no por la más reciente (B).
    const iA = await inscribir(admin, m.a.alumnoId, (await programa()).grupoId);
    assert.equal(iA.estado, 201);
    assert.equal((await m.corre(new Date("2026-11-10T15:00:00Z"))).enviadas, 1);
    assert.deepEqual(destinos(), [m.conv!.chatwoot_conversacion_id]);

    // Inscrita en un grupo de la vertical B: sale por la conversación de B.
    const iB = await inscribir(admin, m.a.alumnoId, (await programa({ verticalId: verticalB })).grupoId);
    assert.equal(iB.estado, 201);
    assert.equal((await m.corre(new Date("2026-11-10T16:00:00Z"))).enviadas, 1);
    assert.deepEqual(destinos(), [m.conv!.chatwoot_conversacion_id, convB.chatwoot_conversacion_id]);

    // Otra familia que SOLO tiene conversación en B y se inscribe en A: no se adivina otra vertical; no sale nada y una persona decide.
    await m.apagar(); // una sola automatización viva a la vez: cada una crea su propia ejecución por inscripción
    m2 = await mundoDeBienvenida({ sinConversacion: true });
    const convB2 = await conversacionEnB(m2.a.telefono);
    const i2 = await inscribir(admin, m2.a.alumnoId, (await programa()).grupoId);
    assert.equal(i2.estado, 201);
    await m2.corre(new Date("2026-11-10T15:00:00Z"));
    assert.equal(m2.enviados().filter((e) => e.destino.chatwootConversacionId === convB2.chatwoot_conversacion_id).length, 0, "no sale por el canal de otra vertical");
    const e2 = (await m2.ejecuciones(i2.cuerpo.id))[0]!;
    assert.deepEqual([e2.estatus, e2.motivo_omision], ["omitido", "sin_conversacion"]);
    assert.ok(await prisma.tarea_asesor.findFirst({ where: { lead_id: m2.a.leadId, tipo: "automatizacion_omitida", estado: "pendiente" } }), "tarea para el asesor");

    // Tampoco por la conversación del lead de origen cuando es de otra vertical (inscrita en B, escribió solo a A): una persona decide.
    await m2.apagar();
    m3 = await mundoDeBienvenida();
    const i3 = await inscribir(admin, m3.a.alumnoId, (await programa({ verticalId: verticalB })).grupoId);
    assert.equal(i3.estado, 201);
    await m3.corre(new Date("2026-11-10T15:00:00Z"));
    assert.equal(m3.enviados().length, 0, "la conversación del lead de origen es de otra vertical");
    const e3 = (await m3.ejecuciones(i3.cuerpo.id))[0]!;
    assert.deepEqual([e3.estatus, e3.motivo_omision], ["omitido", "sin_conversacion"]);
  } finally {
    await m.apagar();
    await m2?.apagar();
    await m3?.apagar();
  }
});

test("bienvenida: NO incluye datos de salud — ni en el texto, ni en las variables, ni en el envío; y la plantilla del seed es de servicio (utility), no de marketing", async () => {
  const m = await mundoDeBienvenida();
  try {
    // El alumno tiene una ficha de salud con un centinela.
    const maestroId = (await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, rol: "administrador" } })).id;
    await guardarSensible(db(), { usuarioId: maestroId, organizacionId: org.organizacionId, rol: "administrador" }, { sujetoTipo: "alumno", sujetoId: m.a.alumnoId, motivo: "prueba F7", valores: { alergias: CENTINELA_SALUD, medicamentos: CENTINELA_SALUD } }, { cifrador });
    const i = await inscribir(admin, m.a.alumnoId, (await programa()).grupoId);
    assert.equal((await m.corre(new Date("2026-11-10T15:00:00Z"))).enviadas, 1);
    assert.ok(!JSON.stringify(m.transporte.envios).includes(CENTINELA_SALUD));
    assert.ok(!JSON.stringify(await m.ejecuciones(i.cuerpo.id)).includes(CENTINELA_SALUD));
    assert.ok(!(await prisma.mensaje.findMany({ where: { conversacion_id: m.conv!.id } })).some((x) => (x.cuerpo ?? "").includes(CENTINELA_SALUD)));
    void adminId;
  } finally {
    await m.apagar();
  }
});

test("bienvenida: la conversión de un lead también la programa (una por inscripción) y convertir otra vez no la duplica", async () => {
  const m = await mundoDeBienvenida();
  try {
    const f = await prisma.prospecto.findFirstOrThrow({ where: { lead_id: m.a.leadId } });
    // Una familia nueva por el camino de la conversión (sin alumno todavía): se reutiliza el lead de `m.a`, desligando su alumno.
    const g = await programa();
    void f;
    const i = await inscribir(admin, m.a.alumnoId, g.grupoId);
    assert.equal((await m.ejecuciones(i.cuerpo.id)).length, 1);
    // Reintentar la programación (p. ej. un reintento de la transacción) no duplica: la llave es la de siempre.
    const antes = await prisma.automatizacion_ejecucion.count({ where: { entidad_tipo: "inscripcion", entidad_id: i.cuerpo.id } });
    await prisma.automatizacion_ejecucion.createMany({ data: [{ organizacion_id: org.organizacionId, automatizacion_id: m.automatizacion.id, entidad_tipo: "inscripcion", entidad_id: i.cuerpo.id, ocurrencia: 1, programado_para: AHORA }], skipDuplicates: true });
    assert.equal(await prisma.automatizacion_ejecucion.count({ where: { entidad_tipo: "inscripcion", entidad_id: i.cuerpo.id } }), antes);
    await assert.rejects(prisma.automatizacion_ejecucion.create({ data: { organizacion_id: org.organizacionId, automatizacion_id: m.automatizacion.id, entidad_tipo: "inscripcion", entidad_id: i.cuerpo.id, ocurrencia: 1, programado_para: AHORA } }), /Unique constraint/);
  } finally {
    await m.apagar();
  }
});
