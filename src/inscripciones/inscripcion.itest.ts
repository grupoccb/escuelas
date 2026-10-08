// F3: la inscripción. Postgres real, la app real: precios congelados, promociones (inmediatas y diferidas) con su cupo atómico, reglamento
// vigente aceptado, cotización aceptada, lead a «inscrito», lista de espera cerrada, alcance por rol y los rechazos con su motivo.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarMotivoBaja, sembrarDocumentosLegales, sembrarEmbudo, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { altaConCandado } from "../lista-espera/lista-espera.ts";

const AHORA = new Date("2026-10-20T18:00:00Z"); // 12:00 en la Ciudad de México: hoy = 2026-10-20
let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let docs: DocumentosLegalesSembrados;
let etapas: Record<TipoDeEtapa, string>;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let maestroId: string;
let norte: string;
let sur: string;
let programa: { id: string; grupos: { id: string }[] };
let grupo: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Insc { id: string; alumno_id: string; grupo_id: string; estatus: string; fecha_inscripcion: string; fecha_inicio: string; precio_inscripcion_aplicado: string; precio_mensualidad_aplicado: string; descuento_inscripcion_aplicado: string; descuento_mensualidad_aplicado: string; meses_gratis_aplicados: number; dia_corte_pago: number; proximo_corte: string | null; lead_id: string | null; promocion_id: string | null; cotizacion_id: string | null; promociones: { estatus: string; tipo: string; descuento: string; meses_gratis: number }[] }
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
const motivo = (r: { cuerpo: Errores }): string | undefined => r.cuerpo.error.detalles?.find((d) => d.campo === "motivo")?.mensaje;

let n = 0;
async function nuevoGrupo(o: { cupo?: number; sucursalId?: string; precio?: { inscripcion: string; mensualidad: string } | null; edadMin?: number; edadMax?: number; corte?: string } = {}) {
  const p = await sembrarPrograma(prisma, org, {
    sucursalId: o.sucursalId ?? norte,
    nombre: `Programa ${++n}`,
    edadMin: o.edadMin ?? 3,
    edadMax: o.edadMax ?? 14,
    ...(o.corte ? { fechaCorteEdad: o.corte } : {}),
    grupos: [{ nombre: `Grupo ${n}`, cupoMaximo: o.cupo ?? 10, permiteListaEspera: true, horarios: [[2, 960, 1020]] }],
    precio: o.precio === undefined ? { inscripcion: "500.00", mensualidad: "800.00" } : o.precio,
  });
  return { programaId: p.id, grupoId: p.grupos[0]!.id };
}
const inscribir = (c: ClienteApi, alumnoId: string, grupoId: string, extra: Record<string, unknown> = {}) => c.post<Insc & Errores>("/api/inscripciones", { alumno_id: alumnoId, grupo_id: grupoId, ...extra });
const alumno = (o: Parameters<typeof sembrarAlumno>[2] = {}) => sembrarAlumno(prisma, org, { docs, etapaId: etapas.negociacion, ...o });

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador: crearCifrador(randomBytes(32)) } });
  org = await sembrarOrganizacion(prisma, "Inscripción");
  etapas = await sembrarEmbudo(prisma, org);
  docs = await sembrarDocumentosLegales(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  admin = (await entrar("administrador")).c;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  const m = await entrar("maestro");
  maestro = m.c;
  maestroId = m.id;
  const g = await nuevoGrupo({ cupo: 50 });
  programa = { id: g.programaId, grupos: [{ id: g.grupoId }] };
  grupo = g.grupoId;
  const instructor = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: maestroId, nombre: "Maestro" } });
  await prisma.grupo.update({ where: { id: grupo }, data: { instructor_id: instructor.id } });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("inscribir congela el precio vigente, deja la cotización aceptada, mueve al lead a «inscrito» con historial y activa al alumno", async () => {
  const a = await alumno();
  const cot = await prisma.cotizacion.create({ data: { organizacion_id: org.organizacionId, lead_id: a.leadId, prospecto_id: a.prospectoId, programa_id: programa.id, sucursal_id: norte, origen: "asesor", fecha: new Date("2026-10-19"), vigente_hasta: new Date("2026-10-26"), snapshot: {} } });
  await prisma.alumno.update({ where: { id: a.alumnoId }, data: { estatus: "congelado" } });
  const r = await inscribir(recepcion, a.alumnoId, grupo, { fecha_inicio: "2026-10-27", meses_pagados_por_adelantado: 0 });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  const i = r.cuerpo;
  assert.equal(i.estatus, "activa");
  assert.equal(i.precio_inscripcion_aplicado, "500.00");
  assert.equal(i.precio_mensualidad_aplicado, "800.00");
  assert.equal(i.fecha_inscripcion, "2026-10-20");
  assert.equal(i.fecha_inicio, "2026-10-27");
  assert.equal(i.dia_corte_pago, 27, "por omisión, el día del mes en que empieza");
  assert.equal(i.proximo_corte, "2026-10-27");
  assert.equal(i.lead_id, a.leadId, "el origen para el costo por alumno inscrito");
  assert.equal(i.cotizacion_id, cot.id);
  assert.equal((await prisma.cotizacion.findFirstOrThrow({ where: { id: cot.id } })).estatus, "aceptada");
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: a.leadId } })).etapa_id, etapas.inscrito);
  const hist = await prisma.lead_etapa_historial.findMany({ where: { lead_id: a.leadId, etapa_nueva_id: etapas.inscrito } });
  assert.equal(hist.length, 1);
  assert.equal(hist[0]!.origen, "sistema");
  assert.equal((await prisma.alumno.findFirstOrThrow({ where: { id: a.alumnoId } })).estatus, "activo");
  const cambio = await db().registro_cambio.findFirst({ where: { entidad_tipo: "inscripcion", entidad_id: i.id } });
  assert.equal((cambio!.despues as Record<string, unknown>)["precio_mensualidad_aplicado"], "800.00");
});

test("el precio que sube DESPUÉS no toca a la inscripción existente; la nueva sí paga el nuevo", async () => {
  const g = await nuevoGrupo({ precio: { inscripcion: "300.00", mensualidad: "600.00" } });
  const a1 = await alumno();
  const a2 = await alumno();
  const primera = await inscribir(admin, a1.alumnoId, g.grupoId);
  assert.equal(primera.estado, 201);
  // El administrador sube el precio (vigencia nueva desde HOY: la anterior se cierra ayer).
  assert.equal((await admin.post("/api/precios", { programa_id: g.programaId, costo_inscripcion: "400.00", costo_mensualidad: "750.00", vigencia_desde: "2026-10-21" })).estado, 201);
  const hoy = await inscribir(admin, a2.alumnoId, g.grupoId);
  assert.equal(hoy.cuerpo.precio_mensualidad_aplicado, "600.00", "hoy todavía rige el anterior");
  // Mañana sube: con otro reloj, la inscripción de ese día toma el precio nuevo y las anteriores conservan el suyo.
  const apiManana = levantarApi(prisma, { reloj: () => new Date("2026-10-21T18:00:00Z") });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const c = apiManana.cliente();
    await c.login(org.slug, u.correo, u.contrasena);
    const a3 = await alumno();
    const tercera = await inscribir(c, a3.alumnoId, g.grupoId);
    assert.equal(tercera.estado, 201);
    assert.equal(tercera.cuerpo.precio_mensualidad_aplicado, "750.00");
    assert.equal(tercera.cuerpo.precio_inscripcion_aplicado, "400.00");
    for (const id of [primera.cuerpo.id, hoy.cuerpo.id]) {
      const vieja = await c.get<Insc>(`/api/inscripciones/${id}`);
      assert.equal(vieja.cuerpo.precio_mensualidad_aplicado, "600.00", "la inscripción existente conserva su precio");
      assert.equal(vieja.cuerpo.precio_inscripcion_aplicado, "300.00");
    }
  } finally {
    await apiManana.cerrar();
  }
});

test("precio ausente = error claro, y no se inscribe ni se toca nada", async () => {
  const g = await nuevoGrupo({ precio: null });
  const a = await alumno();
  const r = await inscribir(admin, a.alumnoId, g.grupoId);
  assert.equal(r.estado, 409);
  assert.equal(motivo(r), "sin_precio");
  assert.match(r.cuerpo.error.mensaje, /precio vigente/);
  assert.equal(await prisma.inscripcion.count({ where: { alumno_id: a.alumnoId } }), 0);
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: a.leadId } })).etapa_id, etapas.negociacion);
  // Un precio que aún no rige (empieza mañana) tampoco sirve.
  await prisma.precio.create({ data: { organizacion_id: org.organizacionId, programa_id: g.programaId, costo_inscripcion: "1.00", costo_mensualidad: "1.00", vigencia_desde: new Date("2026-10-21") } });
  assert.equal(motivo(await inscribir(admin, a.alumnoId, g.grupoId)), "sin_precio");
});

test("el reglamento VIGENTE tiene que estar aceptado: sin aceptar, rechazado, versión anterior o sin prospecto → 409", async () => {
  const g = await nuevoGrupo();
  const sin = await alumno({ aceptarReglamento: false });
  const r1 = await inscribir(admin, sin.alumnoId, g.grupoId);
  assert.equal(r1.estado, 409);
  assert.equal(motivo(r1), "reglamento");
  // Rechazado.
  const rechazo = await alumno({ aceptarReglamento: false });
  await prisma.aceptacion_legal.create({ data: { organizacion_id: org.organizacionId, documento_id: docs.reglamento, tipo: "reglamento", version_aceptada: 1, resultado: "rechazada", lead_id: rechazo.leadId, prospecto_id: rechazo.prospectoId, aceptante_nombre: "Rosa", canal: "presencial", aceptado_en: AHORA, texto_hash: createHash("sha256").update("Texto de prueba de reglamento, versión 1.", "utf8").digest("hex") } });
  assert.equal(motivo(await inscribir(admin, rechazo.alumnoId, g.grupoId)), "reglamento");
  // Sin prospecto de origen (alta directa): no hay dónde probar la aceptación.
  const directo = await admin.post<{ id: string }>("/api/alumnos", { nombre: "Directo", apellidos: "Sin lead", fecha_nacimiento: "2018-01-01", sucursal_id: norte, tutores: [{ tutor: { nombre: "Ana", telefono: "+525544440001" }, parentesco: "madre" }] });
  assert.equal(directo.estado, 201);
  assert.equal(motivo(await inscribir(admin, directo.cuerpo.id, g.grupoId)), "reglamento");
  // Una versión nueva del reglamento: quien aceptó la v1 debe aceptar la v2. (Los documentos son inmutables y el vigente rige a toda la
  // organización, así que esto se prueba en una organización propia.)
  const otra = await sembrarOrganizacion(prisma, "Inscripción reglamento v2");
  await sembrarEmbudo(prisma, otra);
  const docsOtra = await sembrarDocumentosLegales(prisma, otra);
  const usuarioOtra = await sembrarUsuario(prisma, otra.organizacionId, { rol: "administrador" });
  const cOtra = api.cliente();
  assert.equal((await cOtra.login(otra.slug, usuarioOtra.correo, usuarioOtra.contrasena)).estado, 201);
  const pOtra = await sembrarPrograma(prisma, otra, { sucursalId: otra.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 14, grupos: [{ nombre: "G", cupoMaximo: 5, horarios: [[2, 960, 1020]] }], precio: { inscripcion: "1.00", mensualidad: "1.00" } });
  const viejo = await sembrarAlumno(prisma, otra, { docs: docsOtra });
  assert.equal((await cOtra.post("/api/documentos-legales", { tipo: "reglamento", titulo: "Reglamento v2", texto: "Texto nuevo", vigente_desde: "2026-10-01T00:00:00-06:00" })).estado, 201);
  const rv2 = await inscribir(cOtra, viejo.alumnoId, pOtra.grupos[0]!.id);
  assert.equal(rv2.estado, 409);
  assert.match(rv2.cuerpo.error.mensaje, /versión anterior/);
});

test("edad fuera del rango del programa (a su fecha de corte): 409; el administrador puede forzarlo, los demás no", async () => {
  const g = await nuevoGrupo({ edadMin: 6, edadMax: 8, corte: "2026-09-01" });
  const chico = await alumno({ nacimiento: "2022-01-01" }); // 4 años al corte
  const r = await inscribir(asesorNorte, chico.alumnoId, g.grupoId);
  assert.equal(r.estado, 409);
  assert.equal(motivo(r), "fuera_de_edad");
  assert.equal((await inscribir(asesorNorte, chico.alumnoId, g.grupoId, { permitir_fuera_de_edad: true })).estado, 403);
  assert.equal((await inscribir(admin, chico.alumnoId, g.grupoId, { permitir_fuera_de_edad: true })).estado, 201);
  // Al corte cumple 6 años el 1 de septiembre exacto; el día anterior no.
  const justo = await alumno({ nacimiento: "2020-09-01" });
  assert.equal((await inscribir(admin, justo.alumnoId, g.grupoId)).estado, 201);
  const casi = await alumno({ nacimiento: "2020-09-02" });
  assert.equal(motivo(await inscribir(admin, casi.alumnoId, g.grupoId)), "fuera_de_edad");
});

test("validaciones: ya inscrito, grupo inexistente o inactivo, fecha de inicio pasada, día de corte, cotización ajena", async () => {
  const g = await nuevoGrupo();
  const a = await alumno();
  assert.equal((await inscribir(admin, a.alumnoId, g.grupoId)).estado, 201);
  const otraVez = await inscribir(admin, a.alumnoId, g.grupoId);
  assert.equal(otraVez.estado, 409);
  assert.equal(motivo(otraVez), "ya_inscrito");
  const b = await alumno();
  assert.equal((await inscribir(admin, b.alumnoId, "00000000-0000-4000-8000-0000000000aa")).estado, 404);
  assert.equal((await inscribir(admin, "00000000-0000-4000-8000-0000000000bb", g.grupoId)).estado, 404);
  assert.equal((await inscribir(admin, b.alumnoId, g.grupoId, { fecha_inicio: "2026-10-19" })).estado, 400, "no puede ser anterior a hoy");
  assert.equal((await inscribir(admin, b.alumnoId, g.grupoId, { fecha_inicio: "2028-10-19" })).estado, 400, "ni pasar de un año");
  assert.equal((await inscribir(admin, b.alumnoId, g.grupoId, { dia_corte_pago: 32 })).estado, 400);
  assert.equal((await inscribir(admin, b.alumnoId, g.grupoId, { dia_corte_pago: 0 })).estado, 400);
  assert.equal((await inscribir(admin, b.alumnoId, g.grupoId, { cotizacion_id: "00000000-0000-4000-8000-0000000000cc" })).estado, 400);
  await prisma.grupo.update({ where: { id: g.grupoId }, data: { activo: false } });
  assert.equal((await inscribir(admin, b.alumnoId, g.grupoId)).estado, 404, "un grupo inactivo no recibe inscripciones");
  assert.equal(await prisma.inscripcion.count({ where: { alumno_id: b.alumnoId } }), 0);
});

test("día de corte: el 31 se guarda como 31 y su próximo corte respeta el fin de mes", async () => {
  const g = await nuevoGrupo();
  const a = await alumno();
  const r = await inscribir(admin, a.alumnoId, g.grupoId, { dia_corte_pago: 31 });
  assert.equal(r.cuerpo.dia_corte_pago, 31);
  assert.equal(r.cuerpo.proximo_corte, "2026-10-31");
  const b = await alumno();
  const r2 = await inscribir(admin, b.alumnoId, g.grupoId, { fecha_inicio: "2026-11-30" });
  assert.equal(r2.cuerpo.dia_corte_pago, 30);
});

test("promociones: la inmediata queda entregada con su descuento congelado, la diferida pendiente, y el cupo de la promoción se consume", async () => {
  const g = await nuevoGrupo({ precio: { inscripcion: "500.00", mensualidad: "800.00" } });
  const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "Promo con diferido", codigo: `P${++n}${Date.now()}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", cupo_maximo: 5, acumulable: true, prioridad: 5 } });
  const b1 = await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "descuento_inscripcion", modo: "porcentaje", valor: "20.00", momento_disparo: "inmediato" } });
  const b2 = await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "producto_gratis", modo: "total", descripcion: "Uniforme", momento_disparo: "al_cumplir_condicion" } });
  const a = await alumno();
  const r = await inscribir(admin, a.alumnoId, g.grupoId);
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.descuento_inscripcion_aplicado, "100.00");
  assert.equal(r.cuerpo.promocion_id, promo.id);
  assert.equal(r.cuerpo.precio_inscripcion_aplicado, "500.00", "el precio de lista queda intacto; el descuento va aparte");
  const por = Object.fromEntries(r.cuerpo.promociones.map((p) => [p.tipo, p]));
  assert.equal(por["descuento_inscripcion"]!.estatus, "entregado");
  assert.equal(por["descuento_inscripcion"]!.descuento, "100.00");
  assert.equal(por["producto_gratis"]!.estatus, "pendiente");
  assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: promo.id } })).cupo_usado, 1);
  const filas = await prisma.promocion_aplicacion.findMany({ where: { inscripcion_id: r.cuerpo.id } });
  assert.deepEqual(filas.map((f) => f.beneficio_id).sort(), [b1.id, b2.id].sort());
  assert.equal(filas.find((f) => f.beneficio_id === b2.id)!.fecha_entrega, null);
  // Con la promoción ahora fuera del alcance de las demás pruebas.
  await prisma.promocion.update({ where: { id: promo.id }, data: { activo: false } });
});

test("la llave foránea de promocion_aplicacion → inscripcion se impone en las filas nuevas", async () => {
  const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "FK", codigo: `FK${Date.now()}`, vigencia_desde: new Date("2020-01-01"), activo: false } });
  const b = await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "producto_gratis", modo: "total" } });
  await assert.rejects(() => prisma.promocion_aplicacion.create({ data: { organizacion_id: org.organizacionId, inscripcion_id: "00000000-0000-4000-8000-0000000000dd", promocion_id: promo.id, beneficio_id: b.id } }), /Foreign key constraint/);
});

test("CONCURRENCIA: 6 inscripciones simultáneas (en 6 grupos distintos) con una promoción de cupo 2 → exactamente 2 la reciben y el contador cuadra", async () => {
  const grupos = await Promise.all(Array.from({ length: 6 }, () => nuevoGrupo({ cupo: 20 })));
  const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "Dos lugares", codigo: `D${++n}${Date.now()}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "sin_condicion", cupo_maximo: 2, acumulable: true, prioridad: 9 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "100.00" } });
  // Los grupos son distintos, así que NADA los serializa salvo el cupo de la promoción: las 6 leen «quedan lugares» y luego compiten por el UPDATE.
  const barrera = new Barrera(6);
  const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "promocion", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(promo.id), antes: () => barrera.esperar(3000) }), { reloj: () => AHORA });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const alumnos = await Promise.all(grupos.map(() => alumno()));
    const clientes = await Promise.all(alumnos.map(async () => {
      const c = apiCarrera.cliente();
      await c.login(org.slug, u.correo, u.contrasena);
      return c;
    }));
    const rs = await Promise.all(clientes.map((c, i) => inscribir(c, alumnos[i]!.alumnoId, grupos[i]!.grupoId)));
    assert.deepEqual(rs.map((r) => r.estado), [201, 201, 201, 201, 201, 201], JSON.stringify(rs.map((r) => r.cuerpo.error)));
    assert.equal(rs.filter((r) => r.cuerpo.descuento_mensualidad_aplicado === "100.00").length, 2);
    assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: promo.id } })).cupo_usado, 2);
    assert.equal(await prisma.promocion_aplicacion.count({ where: { promocion_id: promo.id } }), 2);
    assert.ok(barrera.completa, "las 6 llegaron al UPDATE a la vez");
  } finally {
    await apiCarrera.cerrar();
    await prisma.promocion.update({ where: { id: promo.id }, data: { activo: false } });
  }
});

test("la lista de espera se cierra como «inscrito» al inscribir a quien esperaba ese grupo", async () => {
  const g = await nuevoGrupo({ cupo: 1 });
  const ocupante = await alumno();
  assert.equal((await inscribir(admin, ocupante.alumnoId, g.grupoId)).estado, 201);
  const espera = await alumno();
  const alta = await altaConCandado(db(), { grupoId: g.grupoId, prospectoId: espera.prospectoId, leadId: espera.leadId });
  assert.ok(alta.ok);
  assert.equal(motivo(await inscribir(admin, espera.alumnoId, g.grupoId)), "grupo_lleno");
  assert.equal((await prisma.lista_espera.findFirstOrThrow({ where: { grupo_id: g.grupoId, prospecto_id: espera.prospectoId } })).estatus, "esperando");
  // Se libera el lugar (la baja llega con F5; aquí se simula) y entra quien esperaba.
  await prisma.inscripcion.updateMany({ where: { alumno_id: ocupante.alumnoId }, data: { estatus: "baja", fecha_baja: new Date("2026-10-21"), motivo_baja_id: await sembrarMotivoBaja(prisma, org) } });
  assert.equal((await inscribir(admin, espera.alumnoId, g.grupoId)).estado, 201);
  assert.equal((await prisma.lista_espera.findFirstOrThrow({ where: { grupo_id: g.grupoId, prospecto_id: espera.prospectoId } })).estatus, "inscrito");
});

test("alcance y permisos: el asesor del sur no inscribe en el norte, el maestro solo lee lo de sus grupos y no escribe, y la salud del alumno se abre al maestro con la inscripción", async () => {
  const g = await nuevoGrupo();
  const a = await alumno();
  assert.equal((await inscribir(asesorSur, a.alumnoId, g.grupoId)).estado, 404);
  assert.equal((await inscribir(maestro, a.alumnoId, g.grupoId)).estado, 403);
  const ok = await inscribir(asesorNorte, a.alumnoId, g.grupoId);
  assert.equal(ok.estado, 201);
  assert.equal((await asesorSur.get(`/api/inscripciones/${ok.cuerpo.id}`)).estado, 404);
  assert.equal((await recepcion.get(`/api/inscripciones/${ok.cuerpo.id}`)).estado, 200);
  assert.equal((await maestro.get(`/api/inscripciones/${ok.cuerpo.id}`)).estado, 404, "el grupo no es suyo");
  // Un alumno en el grupo del maestro: lo ve, ve su inscripción, y puede abrir su ficha de salud (con motivo y constancia).
  const suyo = await alumno();
  const dentro = await inscribir(admin, suyo.alumnoId, grupo);
  assert.equal(dentro.estado, 201);
  assert.equal((await maestro.get(`/api/inscripciones/${dentro.cuerpo.id}`)).estado, 200);
  assert.equal((await maestro.get(`/api/alumnos/${suyo.alumnoId}`)).estado, 200);
  assert.equal((await maestro.get(`/api/alumnos/${a.alumnoId}`)).estado, 404);
  assert.equal((await maestro.get(`/api/salud/alumno/${suyo.alumnoId}?motivo=clase`)).estado, 200);
  assert.equal((await maestro.get(`/api/salud/alumno/${a.alumnoId}?motivo=curiosidad`)).estado, 404, "el alumno de otro grupo no es suyo");
  const lista = await maestro.get<{ datos: { grupo_id: string }[] }>("/api/inscripciones?limite=100");
  assert.ok(lista.cuerpo.datos.length >= 1 && lista.cuerpo.datos.every((i) => i.grupo_id === grupo));
  // El alumno que se inscribió aparece en el listado por tutor del asesor del norte.
  const porTutor = await asesorNorte.get<{ datos: { id: string }[] }>(`/api/inscripciones?tutor_id=${a.tutorId}`);
  assert.deepEqual(porTutor.cuerpo.datos.map((i) => i.id), [ok.cuerpo.id]);
});
