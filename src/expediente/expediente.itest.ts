// G5 contra Postgres real y la app real: el expediente del alumno en UNA respuesta (trayectoria, económico, operativo y comercial), sus enchufes hacia la etapa H,
// el alcance por rol (el maestro solo a sus alumnos y SIN importes), la salud fuera del expediente y la no-fuga entre organizaciones.
// Reloj: miércoles 18 de noviembre de 2026, 12:00 en la Ciudad de México.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeOperacion, type MundoDeOperacion } from "../testutil/operacion.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";
import { sembrarAlumno } from "../testutil/semilla.ts";
import { antiguedadEntre } from "./expediente.ts";
import { ProveedorEconomicoNulo, ProveedorProductosNulo, type ProveedorEconomico, type ProveedorProductos } from "./proveedores.ts";

let prisma: PrismaPruebas;
let m: MundoDeOperacion;
let lia: { alumnoId: string; inscripcionId: string; leadId: string; tutorId: string };
const niveles: string[] = [];
let eventoId = "";
before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeOperacion(prisma, "Expediente");
  const o = m.org.organizacionId;
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { usa_progresion: true, etiqueta_progresion: "Peldaño", etiqueta_evento: "Prueba" } });
  for (const [orden, nombre, clases] of [[1, "Primero", 0], [2, "Segundo", 10]] as const) niveles.push((await prisma.nivel_progresion.create({ data: { organizacion_id: o, vertical_id: m.org.verticalId, nombre, orden, clases_minimas: clases } })).id);

  // La campaña, el canal y la conversación de donde vino el lead.
  const campana = await prisma.campana.create({ data: { organizacion_id: o, nombre: "Campaña de otoño", origen: "facebook" } });
  const promo = await prisma.promocion.create({ data: { organizacion_id: o, nombre: "Promo de bienvenida", codigo: `BIENVENIDA${randomUUID().slice(0, 4)}`.toUpperCase(), vigencia_desde: new Date("2026-01-01T00:00:00Z") } });
  const beneficio = await prisma.promocion_beneficio.create({ data: { organizacion_id: o, promocion_id: promo.id, tipo: "producto_gratis", modo: "total", descripcion: "Uniforme", momento_disparo: "al_cumplir_condicion" } });

  // Lía: inscrita desde el 1 de septiembre, con 20.00 de descuento en la mensualidad por la promoción.
  lia = await m.inscribir(m.grupoA, { nombre: "Lía", datos: { promocion_id: promo.id, descuento_mensualidad_aplicado: "20.00", meses_gratis_aplicados: 1 } });
  await prisma.lead.update({ where: { id: lia.leadId }, data: { campana_id: campana.id, atribucion: { fuente: "landing", codigo_rastreo: "ABC23456", utm: { utm_source: "anuncio", utm_medium: 7 } }, creado_en: new Date("2026-08-20T18:00:00Z") } });
  await prisma.conversacion.create({ data: { organizacion_id: o, bandeja_chatwoot_id: m.org.bandejaId, lead_id: lia.leadId, chatwoot_conversacion_id: 9100 } });
  await prisma.promocion_aplicacion.create({ data: { organizacion_id: o, inscripcion_id: lia.inscripcionId, promocion_id: promo.id, beneficio_id: beneficio.id, descuento: "20.00", meses_gratis: 1 } });
  await prisma.inscripcion.update({ where: { id: lia.inscripcionId }, data: { creado_en: new Date("2026-09-01T18:00:00Z") } });

  // Un cambio de grupo (F5) para el historial: de A a B, el programa es el mismo.
  assert.equal((await m.admin.post(`/api/inscripciones/${lia.inscripcionId}/cambiar-grupo`, { grupo_id: m.grupoB })).estado, 200);

  // Nivel y clases: «Primero» desde el 15 de septiembre y doce asistencias después; faltó las dos últimas veces.
  await prisma.alumno_progresion.create({ data: { organizacion_id: o, alumno_id: lia.alumnoId, nivel_id: niveles[0]!, fecha_obtenido: new Date("2026-09-15T00:00:00Z") } });
  const fechas = ["2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30", "2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19", "2026-10-21", "2026-10-26", "2026-11-02", "2026-11-04", "2026-11-09"];
  for (const [i, f] of fechas.entries()) await prisma.asistencia.create({ data: { organizacion_id: o, inscripcion_id: lia.inscripcionId, grupo_id: m.grupoA, fecha: new Date(`${f}T00:00:00Z`), estatus: i < 12 ? "presente" : "falta" } });

  // Un examen próximo en su sucursal, al que ya está convocada.
  eventoId = (await m.admin.post<{ id: string }>("/api/eventos", { vertical_id: m.org.verticalId, sucursal_id: m.norte, tipo: "examen", nombre: "Examen de diciembre", fecha: "2026-12-05", cupo: 10, cuota: "150.00" })).cuerpo.id;
  assert.equal((await m.admin.post(`/api/eventos/${eventoId}/alumnos`, { alumno_ids: [lia.alumnoId] })).estado, 200);

  // Un hermano inscrito en OTRA vertical y una inscripción de Lía que se dio de baja.
  const v2 = await prisma.vertical.create({ data: { organizacion_id: o, nombre: "Otra disciplina", slug: `otra-${randomUUID().slice(0, 6)}` } });
  await prisma.sucursal_vertical.create({ data: { organizacion_id: o, sucursal_id: m.norte, vertical_id: v2.id } });
  const p2 = await prisma.programa.create({ data: { organizacion_id: o, vertical_id: v2.id, sucursal_id: m.norte, nombre: "Programa de la otra", edad_min: 3, edad_max: 14 } });
  const g2 = await prisma.grupo.create({ data: { organizacion_id: o, programa_id: p2.id, nombre: "Grupo de la otra", cupo_maximo: 20 } });
  const hermano = await sembrarAlumno(prisma, m.org, { nombre: "Hugo", conTutor: lia.tutorId, sucursalId: m.norte });
  await prisma.inscripcion.create({ data: { organizacion_id: o, alumno_id: hermano.alumnoId, programa_id: p2.id, grupo_id: g2.id, fecha_inscripcion: new Date("2026-10-01"), fecha_inicio: new Date("2026-10-01"), precio_inscripcion_aplicado: "1.00", precio_mensualidad_aplicado: "1.00", dia_corte_pago: 5 } });
  const motivo = await prisma.motivo_baja.create({ data: { organizacion_id: o, codigo: "mudanza", nombre: "Se mudó" } });
  await prisma.inscripcion.create({ data: { organizacion_id: o, alumno_id: lia.alumnoId, programa_id: p2.id, grupo_id: g2.id, fecha_inscripcion: new Date("2026-07-01"), fecha_inicio: new Date("2026-07-01"), fecha_baja: new Date("2026-08-15"), estatus: "baja", motivo_baja_id: motivo.id, precio_inscripcion_aplicado: "1.00", precio_mensualidad_aplicado: "1.00", dia_corte_pago: 5 } });
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

type Exp = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const expediente = (c: typeof m.admin, alumnoId = lia.alumnoId) => c.get<Exp>(`/api/alumnos/${alumnoId}/expediente`);

test("G5 antigüedad: días y meses COMPLETOS entre dos fechas locales (borde de fin de mes y de año)", () => {
  assert.deepEqual(antiguedadEntre("2026-09-01", "2026-11-18"), { dias: 78, meses: 2 });
  assert.deepEqual(antiguedadEntre("2026-09-30", "2026-10-29"), { dias: 29, meses: 0 }, "falta un día para el mes completo");
  assert.deepEqual(antiguedadEntre("2026-09-30", "2026-10-30"), { dias: 30, meses: 1 });
  assert.deepEqual(antiguedadEntre("2025-12-15", "2026-01-14"), { dias: 30, meses: 0 });
  assert.deepEqual(antiguedadEntre("2025-12-15", "2026-01-15"), { dias: 31, meses: 1 });
  assert.deepEqual(antiguedadEntre("2024-02-29", "2026-02-28"), { dias: 730, meses: 23 });
  assert.deepEqual(antiguedadEntre("2026-11-18", "2026-11-18"), { dias: 0, meses: 0 });
  assert.deepEqual(antiguedadEntre("2026-12-01", "2026-11-01"), { dias: 0, meses: 0 }, "una fecha futura no da negativos");
});

test("G5 trayectoria: inicio, antigüedad, grupo actual, historial de cambios de grupo, nivel actual y su fecha, y próximo examen con su elegibilidad", async () => {
  const r = await expediente(m.admin);
  assert.equal(r.estado, 200);
  const t = r.cuerpo["trayectoria"];
  assert.equal(t.fecha_de_inicio, "2026-07-01");
  assert.deepEqual(t.antiguedad, { dias: 140, meses: 4 });
  assert.deepEqual(t.grupo_actual, { id: m.grupoB, nombre: "Norte B" }, "ahora está en el grupo B");
  assert.equal(t.historial_de_cambios_de_grupo.length, 1);
  assert.deepEqual([t.historial_de_cambios_de_grupo[0].grupo_anterior.nombre, t.historial_de_cambios_de_grupo[0].grupo_nuevo.nombre], ["Norte A", "Norte B"]);
  const delaVertical = t.niveles.find((n: Exp) => n.vertical.id === m.org.verticalId);
  assert.deepEqual([delaVertical.nivel.nombre, delaVertical.fecha_obtenido, delaVertical.vertical.etiqueta_progresion], ["Primero", "2026-09-15", "Peldaño"]);
  const prox = t.proximo_examen[0];
  assert.deepEqual([prox.evento.nombre, prox.evento.fecha, prox.evento.estatus_del_alumno], ["Examen de diciembre", "2026-12-05", "convocado"]);
  assert.deepEqual(prox.elegibilidad, { elegible: true, motivo: null, clases_cumplidas: 12, clases_requeridas: 10, faltan: 0, siguiente_nivel: { id: niveles[1], nombre: "Segundo" } });
  assert.deepEqual(t.inscripciones.map((i: Exp) => [i.estatus, i.grupo.nombre]).sort(), [["activa", "Norte B"], ["baja", "Grupo de la otra"]]);
});

test("G5 económico: mensualidad vigente exacta, día y próximo corte, promoción, beneficios pendientes y el enchufe hacia finanzas (hoy nulo)", async () => {
  const e = (await expediente(m.admin)).cuerpo["economico"];
  assert.equal(e.mensualidad_vigente.total, "180.00");
  assert.deepEqual(e.mensualidad_vigente.por_inscripcion, [{ inscripcion_id: lia.inscripcionId, grupo: "Norte B", precio_de_lista: "200.00", descuento: "20.00", mensualidad: "180.00", meses_gratis: 1 }]);
  assert.deepEqual(e.dia_de_corte, [{ inscripcion_id: lia.inscripcionId, dia: 5, proximo_corte: "2026-12-05" }]);
  assert.equal(e.promocion_aplicada[0].promocion.nombre, "Promo de bienvenida");
  assert.deepEqual(e.promocion_aplicada[0].beneficios.map((b: Exp) => [b.tipo, b.descripcion, b.descuento, b.meses_gratis, b.estatus]), [["producto_gratis", "Uniforme", "20.00", 1, "pendiente"]]);
  assert.deepEqual(e.beneficios_pendientes.map((b: Exp) => [b.promocion, b.tipo, b.descripcion]), [["Promo de bienvenida", "producto_gratis", "Uniforme"]]);
  assert.deepEqual(e.estado_de_cuenta, { disponible: false, motivo: "finanzas_pendiente" });
  assert.deepEqual(e.antiguedad_cartera_vencida, { disponible: false, motivo: "finanzas_pendiente" });
});

test("G5 operativo: % de 30 días, racha de faltas, eventos en los que participó y el enchufe de productos (hoy nulo)", async () => {
  const o = (await expediente(m.admin)).cuerpo["operativo"];
  // Ventana del 20/10 al 18/11: presentes 21/10, 26/10, 02/11 · faltas 04/11 y 09/11 (la inscripción tiene 12 presentes en total desde septiembre).
  assert.deepEqual([o.asistencia.porcentaje_30_dias, o.asistencia.racha_de_faltas, o.asistencia.umbral_de_faltas], [60, 2, 3]);
  assert.equal(o.asistencia.por_inscripcion.length, 1);
  assert.deepEqual(o.eventos.map((x: Exp) => [x.evento.nombre, x.estatus, x.resultado]), [["Examen de diciembre", "convocado", null]]);
  assert.deepEqual(o.productos_comprados, { disponible: false, motivo: "productos_pendiente" });
});

test("G5 comercial: origen del lead (campaña, canal, fuente), días para cerrar, hermanos inscritos con sus verticales y el motivo de baja", async () => {
  const c = (await expediente(m.admin)).cuerpo["comercial"];
  assert.equal(c.origen_del_lead.length, 1);
  const o = c.origen_del_lead[0];
  assert.deepEqual(o.campana && [o.campana.nombre, o.campana.origen], ["Campaña de otoño", "facebook"]);
  assert.deepEqual([o.canal, o.fuente, o.codigo_de_rastreo, o.utm], ["Canal de prueba", "landing", "ABC23456", { utm_source: "anuncio" }]);
  assert.deepEqual(c.dias_para_cerrar, [{ lead_id: lia.leadId, dias: 12 }], "del 20 de agosto al 1 de septiembre");
  assert.deepEqual(c.hermanos_inscritos.map((h: Exp) => [h.alumno.startsWith("Hugo"), h.verticales.map((v: Exp) => v.nombre)]), [[true, ["Otra disciplina"]]]);
  assert.deepEqual(c.motivo_de_baja.map((b: Exp) => [b.fecha_baja, b.motivo.codigo]), [["2026-08-15", "mudanza"]]);
});

test("G5 los enchufes hacia la etapa H: con otro proveedor el expediente muestra el estado de cuenta, la cartera vencida y los productos", async () => {
  const economico: ProveedorEconomico = { estadoDeCuenta: async () => ({ disponible: true, saldo: "540.00", vencido: "360.00", antiguedadCarteraVencidaDias: 34 }) };
  const productos: ProveedorProductos = { productosComprados: async () => ({ disponible: true, productos: [{ producto: "Uniforme", cantidad: 1, fecha: "2026-10-02" }] }) };
  const api = levantarApi(prisma, { reloj: () => m.reloj.ahora, sesion: { duracionMs: 86_400_000, inactividadMs: 86_400_000 }, expediente: { economico, productos } });
  try {
    const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "administrador" });
    const c = api.cliente();
    assert.equal((await c.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
    const r = (await c.get<Exp>(`/api/alumnos/${lia.alumnoId}/expediente`)).cuerpo;
    assert.deepEqual(r["economico"].estado_de_cuenta, { disponible: true, saldo: "540.00", vencido: "360.00", antiguedadCarteraVencidaDias: 34 });
    assert.deepEqual(r["economico"].antiguedad_cartera_vencida, { dias: 34, vencido: "360.00" });
    assert.deepEqual(r["operativo"].productos_comprados.productos, [{ producto: "Uniforme", cantidad: 1, fecha: "2026-10-02" }]);
    // Y las implementaciones nulas son las que vienen por omisión.
    assert.deepEqual(await new ProveedorEconomicoNulo().estadoDeCuenta(), { disponible: false, motivo: "finanzas_pendiente" });
    assert.deepEqual(await new ProveedorProductosNulo().productosComprados(), { disponible: false, motivo: "productos_pendiente" });
  } finally {
    await api.cerrar();
  }
});

test("G5 por rol: administrador, asesor y recepción ven las cuatro secciones; el maestro solo a SUS alumnos y SIN importes ni origen comercial", async () => {
  for (const [nombre, c] of [["administrador", m.admin], ["asesor norte", m.asesorNorte], ["recepción", m.recepcion]] as const) {
    const r = await expediente(c);
    assert.equal(r.estado, 200, nombre);
    assert.ok(r.cuerpo["economico"] && r.cuerpo["comercial"] && r.cuerpo["trayectoria"] && r.cuerpo["operativo"], nombre);
  }
  assert.equal((await expediente(m.asesorSur)).estado, 404, "el alumno es de la sucursal norte");
  assert.equal((await expediente(m.maestroA)).estado, 404, "ya no está en su grupo (se cambió al B)");
  const r = await expediente(m.maestroB);
  assert.equal(r.estado, 200);
  assert.deepEqual([r.cuerpo["economico"], r.cuerpo["comercial"]], [null, null]);
  assert.ok(r.cuerpo["trayectoria"] && r.cuerpo["operativo"]);
  const texto = JSON.stringify(r.cuerpo);
  for (const importe of ["180.00", "200.00", "20.00", "150.00", "mensualidad", "precio", "cuota", "Campaña de otoño", "mudanza", "Promo de bienvenida", "dia_corte"]) assert.ok(!texto.includes(importe), `el maestro no debe ver «${importe}»`);
  assert.equal((await m.admin.get(`/api/alumnos/${randomUUID()}/expediente`)).estado, 404);
});

test("G5 la salud NO va en el expediente: solo el camino hacia su endpoint, que sigue pidiendo motivo y deja registro", async () => {
  const r = await expediente(m.admin);
  assert.deepEqual(r.cuerpo["salud"], { incluida: false, endpoint: `/api/salud/alumno/${lia.alumnoId}` });
  const texto = JSON.stringify(r.cuerpo);
  for (const prohibido of ["alergia", "medicamento", "condiciones_medicas", "contacto_emergencia", "ficha_salud"]) assert.ok(!texto.toLowerCase().includes(prohibido), `no debe haber «${prohibido}»`);
  const antes = await prisma.acceso_dato_sensible.count({ where: { organizacion_id: m.org.organizacionId } });
  await expediente(m.admin);
  assert.equal(await prisma.acceso_dato_sensible.count({ where: { organizacion_id: m.org.organizacionId } }), antes, "leer el expediente no toca la salud");
  assert.equal((await m.admin.get(`/api/salud/alumno/${lia.alumnoId}`)).estado, 400, "el endpoint de salud exige un motivo");
});

test("G5 no-fuga entre organizaciones: el expediente de un alumno de otra organización es 404 y el propio no trae nada ajeno", async () => {
  const otra = await mundoDeOperacion(prisma, "Expediente ajeno");
  try {
    const ajena = await otra.inscribir(otra.grupoA, { nombre: "Ajena" });
    assert.equal((await expediente(m.admin, ajena.alumnoId)).estado, 404);
    assert.equal((await expediente(otra.admin, lia.alumnoId)).estado, 404);
    const propia = await expediente(otra.admin, ajena.alumnoId);
    assert.equal(propia.estado, 200);
    assert.ok(!JSON.stringify(propia.cuerpo).includes("Lía") && !JSON.stringify(propia.cuerpo).includes("Examen de diciembre"));
    assert.deepEqual(propia.cuerpo["operativo"].eventos, []);
  } finally {
    await otra.cerrar();
  }
});

test("G5 un alumno sin nada (recién dado de alta, sin inscripción) devuelve el expediente vacío, no un error", async () => {
  const a = await sembrarAlumno(prisma, m.org, { nombre: "Nuevo", sucursalId: m.norte });
  const r = await expediente(m.admin, a.alumnoId);
  assert.equal(r.estado, 200);
  assert.deepEqual([r.cuerpo["trayectoria"].fecha_de_inicio, r.cuerpo["trayectoria"].antiguedad, r.cuerpo["trayectoria"].grupo_actual, r.cuerpo["trayectoria"].proximo_examen], [null, null, null, []]);
  assert.deepEqual([r.cuerpo["economico"].mensualidad_vigente.total, r.cuerpo["economico"].beneficios_pendientes], ["0.00", []]);
  assert.deepEqual([r.cuerpo["operativo"].asistencia.porcentaje_30_dias, r.cuerpo["operativo"].asistencia.racha_de_faltas], [null, 0]);
});
