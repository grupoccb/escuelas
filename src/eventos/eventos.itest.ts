// G4 contra Postgres real y la app real: eventos, elegibilidad por clases mínimas, convocatoria solo de elegibles, estatus que solo avanza, resultado que crea la
// progresión y, sobre todo, el CUPO del evento: atómico en el código y protegido EN LA BASE (SQL directo y concurrencia real). Reloj: miércoles 18 de noviembre de
// 2026, 12:00 en la Ciudad de México.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeOperacion, type MundoDeOperacion } from "../testutil/operacion.ts";
import { conAlcance } from "../datos/alcance.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { convocarAlumnos } from "./eventos.ts";
import type { ClienteApi } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let m: MundoDeOperacion;
const nivel: { id: string; orden: number }[] = [];
before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeOperacion(prisma, "Eventos");
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { usa_progresion: true, etiqueta_progresion: "Peldaño", etiqueta_evento: "Prueba" } });
  for (const [orden, nombre, clases] of [[1, "Primero", 0], [2, "Segundo", 10], [3, "Tercero", 20]] as const) {
    nivel.push((await m.admin.post<{ id: string; orden: number }>("/api/niveles", { vertical_id: m.org.verticalId, nombre, orden, clases_minimas: clases })).cuerpo);
  }
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const EVENTO = "2026-12-05";
const reloj = (iso: string) => {
  m.reloj.ahora = new Date(iso);
};
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const sumarDias = (iso: string, n: number): string => new Date(dia(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);

interface Resp<T = Record<string, unknown>> { estado: number; cuerpo: T }
type Convocatoria = { convocados: { alumno_id: string; participante_id: string }[]; ya_convocados: string[]; rechazados: { alumno_id: string; motivo: string; faltan?: number }[]; error?: { detalles?: { campo?: string; mensaje: string }[] } };

async function evento(o: Record<string, unknown> = {}, c: ClienteApi = m.admin): Promise<string> {
  const r = await c.post<{ id: string }>("/api/eventos", { vertical_id: m.org.verticalId, sucursal_id: m.norte, tipo: "examen", nombre: `Evento ${randomUUID().slice(0, 6)}`, fecha: EVENTO, cupo: 50, cuota: "100.00", ...o });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo.id;
}

/**
 * Un alumno de la vertical con `clases` asistencias `presente` (después de `desde`) y, si se pide, un peldaño ya obtenido en `fechaNivel`.
 * Las asistencias se escriben directo en la base (el pase tiene sus propias pruebas en G1).
 */
async function alumno(clases: number, o: { nivelIdx?: number; fechaNivel?: string; desde?: string; grupo?: string; estatus?: "activa" | "congelada" | "baja"; nombre?: string } = {}) {
  const a = await m.inscribir(o.grupo ?? m.grupoA, { ...(o.estatus ? { estatus: o.estatus } : {}), ...(o.nombre ? { nombre: o.nombre } : {}) });
  if (o.nivelIdx !== undefined) await prisma.alumno_progresion.create({ data: { organizacion_id: m.org.organizacionId, alumno_id: a.alumnoId, nivel_id: nivel[o.nivelIdx]!.id, fecha_obtenido: dia(o.fechaNivel ?? "2026-09-15") } });
  const desde = o.desde ?? sumarDias(o.fechaNivel ?? "2026-09-15", 1);
  for (let i = 0; i < clases; i++) await prisma.asistencia.create({ data: { organizacion_id: m.org.organizacionId, inscripcion_id: a.inscripcionId, grupo_id: o.grupo ?? m.grupoA, fecha: dia(sumarDias(desde, i)), estatus: "presente" } });
  return a;
}
const convocar = (c: ClienteApi, eventoId: string, ...alumnoIds: string[]): Promise<Resp<Convocatoria>> => c.post<Convocatoria>(`/api/eventos/${eventoId}/alumnos`, { alumno_ids: alumnoIds });
const elegibles = async (eventoId: string) => (await m.admin.get<{ datos: { alumno_id: string; elegible: boolean; motivo: string | null; clases_cumplidas: number; clases_requeridas: number; faltan: number; convocado: boolean }[] }>(`/api/eventos/${eventoId}/elegibles?limite=100`)).cuerpo.datos;
const ocupados = (eventoId: string) => prisma.evento_alumno.count({ where: { evento_id: eventoId, eliminado_en: null } });

// ── Eventos ──────────────────────────────────────────────────────────────────────────────────────────

test("G4 eventos: el administrador los crea y edita; todos los roles los ven según su alcance; el maestro no ve la cuota; dinero exacto; registro de cambios", async () => {
  for (const c of [m.maestroA, m.asesorNorte, m.recepcion]) assert.equal((await c.post("/api/eventos", { vertical_id: m.org.verticalId, sucursal_id: m.norte, tipo: "examen", nombre: "x", fecha: EVENTO, cupo: 5 })).estado, 403);
  const id = await evento({ nombre: "Examen de fin de año", cuota: "1234.50", cupo: 12, requiere_vestuario: true });
  const como = async (c: ClienteApi) => (await c.get<Record<string, unknown>>(`/api/eventos/${id}`)).cuerpo;
  assert.deepEqual(await como(m.admin), { id, vertical: { id: m.org.verticalId, nombre: "Vertical Prueba", etiqueta_evento: "Prueba" }, sucursal: { id: m.norte, nombre: "Norte" }, tipo: "examen", nombre: "Examen de fin de año", fecha: EVENTO, cupo: 12, ocupados: 0, disponibles: 12, requiere_vestuario: true, otorga_progresion: true, cuota: "1234.50" });
  assert.equal((await como(m.recepcion))["cuota"], "1234.50");
  assert.ok(!("cuota" in (await como(m.maestroA))), "el maestro no ve importes");
  assert.equal((await m.asesorSur.get(`/api/eventos/${id}`)).estado, 404, "otra sucursal");
  assert.equal((await m.maestroB.get(`/api/eventos/${id}`)).estado, 200, "el maestro ve los eventos de las sucursales donde da clase");
  const lista = await m.maestroA.get<{ datos: Record<string, unknown>[] }>("/api/eventos?limite=100");
  assert.ok(lista.cuerpo.datos.every((e) => !("cuota" in e)));
  assert.ok((await m.asesorSur.get<{ datos: { id: string }[] }>("/api/eventos?limite=100")).cuerpo.datos.every((e) => e.id !== id));
  // Validaciones.
  const nuevo = (extra: Record<string, unknown>) => m.admin.post<{ error: { detalles?: { campo?: string }[] } }>("/api/eventos", { vertical_id: m.org.verticalId, sucursal_id: m.norte, tipo: "examen", nombre: "x", fecha: EVENTO, cupo: 5, ...extra });
  for (const malo of [{ cupo: 0 }, { cupo: -1 }, { cuota: 19.99 }, { cuota: "19.999" }, { cuota: "-1.00" }, { fecha: "2026-02-30" }, { nombre: "" }, { tipo: "" }, { vertical_id: randomUUID() }, { sucursal_id: randomUUID() }]) assert.equal((await nuevo(malo)).estado, 400, JSON.stringify(malo));
  // Editar y el registro de cambios.
  assert.equal((await m.admin.patch<{ cuota: string }>(`/api/eventos/${id}`, { cuota: "0.30", cupo: 20 })).cuerpo.cuota, "0.30");
  assert.equal((await m.maestroA.patch(`/api/eventos/${id}`, { cupo: 1 })).estado, 403);
  const reg = await prisma.registro_cambio.findMany({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "evento", entidad_id: id }, orderBy: { creado_en: "asc" } });
  assert.deepEqual(reg.map((r) => r.accion), ["crear", "actualizar"]);
  assert.deepEqual([reg[1]!.antes, reg[1]!.despues], [{ cuota: "1234.50", cupo: 12 }, { cuota: "0.30", cupo: 20 }]);
  // Borrar: con participantes no; sin ellos sí (baja lógica).
  const a = await alumno(0);
  assert.equal((await convocar(m.admin, id, a.alumnoId)).estado, 200);
  assert.equal((await m.admin.delete(`/api/eventos/${id}`)).estado, 409);
  const vacio = await evento();
  assert.equal((await m.admin.delete(`/api/eventos/${vacio}`)).estado, 204);
  assert.equal((await m.admin.get(`/api/eventos/${vacio}`)).estado, 404);
});

test("G4 la cuota es dinero exacto: sumas de centavos que en flotante fallarían se guardan y devuelven tal cual", async () => {
  for (const c of ["0.10", "0.20", "0.30", "9999999999.99", "0.00", "1.01"]) {
    const id = await evento({ cuota: c });
    assert.equal((await m.admin.get<{ cuota: string }>(`/api/eventos/${id}`)).cuerpo.cuota, c);
    assert.equal(String((await prisma.evento.findUniqueOrThrow({ where: { id } })).cuota), c === "0.00" ? "0" : c.replace(/0+$/, "").replace(/\.$/, ""));
  }
  assert.equal((await m.admin.post("/api/eventos", { vertical_id: m.org.verticalId, sucursal_id: m.norte, tipo: "x", nombre: "x", fecha: EVENTO, cupo: 1, cuota: "10000000000.00" })).estado, 400, "no cabe en Decimal(12,2)");
});

// ── Elegibilidad ─────────────────────────────────────────────────────────────────────────────────────

test("G4 elegibilidad: asistencias PRESENTE desde que obtuvo su nivel actual ≥ las clases mínimas del SIGUIENTE; el borde es inclusivo y el día del examen no cuenta", async () => {
  const id = await evento();
  const justo = await alumno(10, { nivelIdx: 0 }); // 10 después del primero; el segundo pide 10
  const casi = await alumno(9, { nivelIdx: 0 });
  const nadaAun = await alumno(0, { nivelIdx: 0 });
  const sinNivel = await alumno(0); // sin ningún peldaño: el siguiente es el primero, que no pide clases
  const enElTope = await alumno(40, { nivelIdx: 2 }); // ya tiene el último peldaño
  const congelada = await alumno(30, { nivelIdx: 0, estatus: "congelada" });
  const baja = await alumno(30, { nivelIdx: 0, estatus: "baja" });
  const por = new Map((await elegibles(id)).map((e) => [e.alumno_id, e]));
  const veo = (a: { alumnoId: string }) => por.get(a.alumnoId)!;
  assert.deepEqual([veo(justo).elegible, veo(justo).clases_cumplidas, veo(justo).clases_requeridas], [true, 10, 10]);
  assert.deepEqual([veo(casi).elegible, veo(casi).motivo, veo(casi).faltan], [false, "clases_insuficientes", 1]);
  assert.deepEqual([veo(nadaAun).elegible, veo(nadaAun).faltan], [false, 10]);
  assert.deepEqual([veo(sinNivel).elegible, veo(sinNivel).clases_requeridas], [true, 0], "el primer peldaño lo puede presentar cualquier alumno vigente");
  assert.deepEqual([veo(enElTope).elegible, veo(enElTope).motivo], [false, "sin_siguiente_nivel"]);
  assert.ok(!por.has(congelada.alumnoId) && !por.has(baja.alumnoId), "la lista son los alumnos con inscripción ACTIVA en la vertical");
  // Lo que NO cuenta: faltas y justificadas, la asistencia del mismo día en que obtuvo el nivel y la anterior a obtenerlo.
  const raro = await alumno(9, { nivelIdx: 0, fechaNivel: "2026-09-15" });
  for (const [f, estatus] of [["2026-10-20", "falta"], ["2026-10-21", "justificada"], ["2026-09-15", "presente"], ["2026-09-10", "presente"]] as const) {
    await prisma.asistencia.create({ data: { organizacion_id: m.org.organizacionId, inscripcion_id: raro.inscripcionId, grupo_id: m.grupoA, fecha: dia(f), estatus } });
  }
  assert.deepEqual([(await elegibles(id)).find((e) => e.alumno_id === raro.alumnoId)!.clases_cumplidas], [9], "solo las nueve presentes posteriores");
  // Una más, un día después de obtener el peldaño: ya.
  await prisma.asistencia.create({ data: { organizacion_id: m.org.organizacionId, inscripcion_id: raro.inscripcionId, grupo_id: m.grupoA, fecha: dia("2026-09-16"), estatus: "presente" } }).catch(() => null);
  await prisma.asistencia.create({ data: { organizacion_id: m.org.organizacionId, inscripcion_id: raro.inscripcionId, grupo_id: m.grupoA, fecha: dia("2026-12-30"), estatus: "presente" } });
  assert.equal((await elegibles(id)).find((e) => e.alumno_id === raro.alumnoId)!.elegible, true);
});

// ── Convocar ─────────────────────────────────────────────────────────────────────────────────────────

test("G4 convocar: solo los elegibles; los demás se rechazan con su motivo; idempotente; el maestro solo a SUS alumnos; un evento que no sube de peldaño no pide clases", async () => {
  const id = await evento({ cupo: 10 });
  const listo = await alumno(12, { nivelIdx: 0 });
  const falta = await alumno(4, { nivelIdx: 0 });
  const congelada = await alumno(12, { nivelIdx: 0, estatus: "congelada" });
  const delOtroMaestro = await alumno(12, { nivelIdx: 0, grupo: m.grupoB });
  // Parcial: lo que cabe se convoca, lo demás se rechaza con su motivo.
  const r = await convocar(m.admin, id, listo.alumnoId, falta.alumnoId, congelada.alumnoId, randomUUID());
  assert.equal(r.estado, 200);
  assert.deepEqual(r.cuerpo.convocados.map((c) => c.alumno_id), [listo.alumnoId]);
  assert.deepEqual(r.cuerpo.rechazados.map((x) => [x.alumno_id, x.motivo, x.faltan ?? null]).slice(0, 3), [[falta.alumnoId, "clases_insuficientes", 6], [congelada.alumnoId, "sin_inscripcion_activa", null], [r.cuerpo.rechazados[2]!.alumno_id, "alumno_inexistente", null]]);
  // Idempotente: otra vez no duplica.
  const otra = await convocar(m.admin, id, listo.alumnoId);
  assert.deepEqual([otra.estado, otra.cuerpo.ya_convocados, otra.cuerpo.convocados], [200, [listo.alumnoId], []]);
  assert.equal(await ocupados(id), 1);
  // Si nadie queda convocado ni estaba: 409 con el motivo de cada uno.
  const nada = await convocar(m.admin, id, falta.alumnoId);
  assert.equal(nada.estado, 409);
  assert.match(nada.cuerpo.error!.detalles![0]!.mensaje, /clases_insuficientes/);
  // El maestro A solo convoca a los suyos.
  const m1 = await convocar(m.maestroA, id, delOtroMaestro.alumnoId);
  assert.equal(m1.estado, 409);
  assert.equal(m1.cuerpo.error!.detalles![0]!.mensaje, "alumno_inexistente");
  const propio = await alumno(15, { nivelIdx: 0 });
  assert.equal((await convocar(m.maestroA, id, propio.alumnoId)).estado, 200);
  // Asesor: no convoca.
  assert.equal((await convocar(m.asesorNorte, id, propio.alumnoId)).estado, 403);
  // Un evento que NO sube de peldaño (una exhibición) no pide clases: basta ser alumno vigente.
  const sinPeldano = await evento({ otorga_progresion: false, tipo: "muestra" });
  const nuevo = await alumno(0, { nivelIdx: 0 });
  assert.equal((await convocar(m.admin, sinPeldano, nuevo.alumnoId, congelada.alumnoId)).cuerpo.convocados.length, 1, "el vigente sí, la congelada no");
  assert.equal((await elegibles(sinPeldano)).find((e) => e.alumno_id === nuevo.alumnoId)!.elegible, true);
  // Un evento que ya pasó no recibe convocatorias.
  const pasado = await evento({ fecha: "2026-11-01" });
  assert.equal((await convocar(m.admin, pasado, listo.alumnoId)).cuerpo.error!.detalles![0]!.mensaje, "evento_pasado");
  assert.equal((await convocar(m.admin, randomUUID(), listo.alumnoId)).estado, 404);
  // Registro de cambios de la convocatoria, sin datos personales.
  const reg = await prisma.registro_cambio.findMany({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "evento_alumno", accion: "crear" } });
  assert.ok(reg.length >= 2);
  assert.ok(!JSON.stringify(reg).includes("Prueba"));
});

// ── El cupo ──────────────────────────────────────────────────────────────────────────────────────────

test("G4 cupo (API): más aspirantes que lugares en una convocatoria → entran los que caben y el resto recibe evento_lleno; el cupo no se pasa", async () => {
  const id = await evento({ cupo: 3 });
  const alumnos = [];
  for (let i = 0; i < 8; i++) alumnos.push(await alumno(12, { nivelIdx: 0 }));
  const r = await convocar(m.admin, id, ...alumnos.map((a) => a.alumnoId));
  assert.deepEqual([r.cuerpo.convocados.length, r.cuerpo.rechazados.length], [3, 5]);
  assert.ok(r.cuerpo.rechazados.every((x) => x.motivo === "evento_lleno"));
  assert.equal(await ocupados(id), 3);
  const lleno = await m.admin.get<{ ocupados: number; disponibles: number }>(`/api/eventos/${id}`);
  assert.deepEqual([lleno.cuerpo.ocupados, lleno.cuerpo.disponibles], [3, 0]);
  // Quitar a uno libera su lugar; entra otro.
  assert.equal((await m.admin.delete(`/api/eventos/${id}/alumnos/${r.cuerpo.convocados[0]!.alumno_id}`)).estado, 204);
  assert.equal((await convocar(m.admin, id, alumnos[7]!.alumnoId)).cuerpo.convocados.length, 1);
  assert.equal(await ocupados(id), 3);
});

test("G4 cupo (concurrencia REAL por HTTP): doce convocatorias simultáneas de alumnos distintos por 4 lugares → exactamente 4 entran y el resto recibe evento_lleno", async () => {
  const id = await evento({ cupo: 4 });
  const alumnos = [];
  for (let i = 0; i < 12; i++) alumnos.push(await alumno(12, { nivelIdx: 0 }));
  const rs = await Promise.all(alumnos.map((a, i) => convocar(i % 2 === 0 ? m.admin : m.recepcion, id, a.alumnoId)));
  assert.equal(rs.filter((r) => r.estado === 200 && r.cuerpo.convocados.length === 1).length, 4, "cuatro entraron");
  assert.equal(rs.filter((r) => r.estado === 409).length, 8, "ocho recibieron un 409 limpio, no un 500");
  assert.ok(rs.every((r) => r.estado === 200 || r.estado === 409));
  assert.equal(await ocupados(id), 4);
});

test("G4 cupo EN LA BASE (SQL directo, saltándose el código): más participantes que el cupo → el disparador lo rechaza, también en carrera real", async () => {
  const id = await evento({ cupo: 3 });
  const alumnos = [];
  for (let i = 0; i < 12; i++) alumnos.push(await alumno(0));
  const fila = (a: { alumnoId: string }, extra: Record<string, unknown> = {}) => ({ organizacion_id: m.org.organizacionId, evento_id: id, alumno_id: a.alumnoId, ...extra });
  // Secuencial: tres caben, el cuarto no.
  for (const a of alumnos.slice(0, 3)) await prisma.evento_alumno.create({ data: fila(a) });
  await assert.rejects(prisma.evento_alumno.create({ data: fila(alumnos[3]!) }), /evento_cupo/);
  assert.equal(await ocupados(id), 3);
  // Borrar lógicamente libera; revivir uno borrado cuando está lleno, no.
  const primera = await prisma.evento_alumno.findFirstOrThrow({ where: { evento_id: id, alumno_id: alumnos[0]!.alumnoId } });
  await prisma.evento_alumno.update({ where: { id: primera.id }, data: { eliminado_en: new Date() } });
  const cuarto = await prisma.evento_alumno.create({ data: fila(alumnos[3]!) });
  await assert.rejects(prisma.evento_alumno.update({ where: { id: primera.id }, data: { eliminado_en: null } }), /evento_cupo/, "revivir uno borrado ocupa un lugar");
  // Editar OTRA columna de una fila viva no vuelve a contar (aunque el evento esté lleno).
  await prisma.evento_alumno.update({ where: { id: cuarto.id }, data: { estatus: "confirmado" } });
  // Mover un participante a un evento lleno, tampoco.
  const otro = await evento({ cupo: 1 });
  const suelto = await prisma.evento_alumno.create({ data: { organizacion_id: m.org.organizacionId, evento_id: otro, alumno_id: alumnos[4]!.alumnoId } });
  await assert.rejects(prisma.evento_alumno.update({ where: { id: suelto.id }, data: { evento_id: id } }), /evento_cupo/);
  // El cupo no baja por debajo de los que ya ocupan lugar.
  await assert.rejects(prisma.evento.update({ where: { id }, data: { cupo: 2 } }), /evento_cupo_menor_a_ocupados/);
  await prisma.evento.update({ where: { id }, data: { cupo: 3 } });
  await prisma.evento.update({ where: { id }, data: { cupo: 20 } });
  // Carrera REAL contra la base, sin pasar por el código: ocho inserciones simultáneas por los 17 lugares que ahora hay… en un evento nuevo de 3.
  const carrera = await evento({ cupo: 3 });
  const rs = await Promise.allSettled(alumnos.slice(4, 12).map((a) => prisma.evento_alumno.create({ data: { organizacion_id: m.org.organizacionId, evento_id: carrera, alumno_id: a.alumnoId } })));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 3, "exactamente tres entran");
  assert.ok(rs.filter((r) => r.status === "rejected").every((r) => /evento_cupo/.test(String((r as PromiseRejectedResult).reason))));
  assert.equal(await ocupados(carrera), 3);
});

test("G4 la base respalda lo demás: un alumno una vez por evento, resultado solo con asistencia, el peldaño otorgado solo con aprobado, y nada cruza organizaciones", async () => {
  const id = await evento({ cupo: 5 });
  const a = await alumno(0);
  const base = { organizacion_id: m.org.organizacionId, evento_id: id, alumno_id: a.alumnoId };
  const fila = await prisma.evento_alumno.create({ data: base });
  await assert.rejects(prisma.evento_alumno.create({ data: base }), /Unique constraint|evento_alumno_evento_alumno_key/);
  await assert.rejects(prisma.evento_alumno.update({ where: { id: fila.id }, data: { resultado: "aprobado" } }), /evento_alumno_resultado_chk|check/i, "sin asistencia no hay resultado");
  await prisma.evento_alumno.update({ where: { id: fila.id }, data: { estatus: "asistio", resultado: "no_aprobado" } });
  await assert.rejects(prisma.evento_alumno.update({ where: { id: fila.id }, data: { nivel_otorgado_id: nivel[1]!.id } }), /evento_alumno_nivel_chk|check/i, "sin aprobar no hay peldaño");
  // Un solo peldaño por (evento, alumno).
  await prisma.alumno_progresion.create({ data: { organizacion_id: m.org.organizacionId, alumno_id: a.alumnoId, nivel_id: nivel[0]!.id, fecha_obtenido: dia("2026-11-01"), evento_id: id } });
  await assert.rejects(prisma.alumno_progresion.create({ data: { organizacion_id: m.org.organizacionId, alumno_id: a.alumnoId, nivel_id: nivel[1]!.id, fecha_obtenido: dia("2026-11-02"), evento_id: id } }), /Unique constraint|alumno_progresion_evento_alumno_key/);
  // Cruce de organizaciones.
  const otra = await mundoDeOperacion(prisma, "Eventos ajenos");
  try {
    const ajeno = await otra.inscribir(otra.grupoA);
    await assert.rejects(prisma.evento_alumno.create({ data: { organizacion_id: m.org.organizacionId, evento_id: id, alumno_id: ajeno.alumnoId } }), (e: unknown) => (e as { code?: string }).code === "P2003");
    await assert.rejects(prisma.evento.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: otra.org.verticalId, sucursal_id: m.norte, tipo: "x", nombre: "x", fecha: dia(EVENTO), cupo: 1 } }), (e: unknown) => (e as { code?: string }).code === "P2003");
    for (const malo of [{ cupo: 0 }, { cuota: "-1.00" }, { tipo: "  " }, { fecha: dia("1999-01-01") }]) {
      await assert.rejects(prisma.evento.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: m.org.verticalId, sucursal_id: m.norte, tipo: "x", nombre: "x", fecha: dia(EVENTO), cupo: 1, ...malo } }), /check|chk/i, JSON.stringify(malo));
    }
  } finally {
    await otra.cerrar();
  }
});

// ── Estatus y resultado ──────────────────────────────────────────────────────────────────────────────

const estatus = (c: ClienteApi, eventoId: string, alumnoId: string, e: string) => c.patch<{ estatus?: string; sin_cambio?: boolean; error?: { detalles?: { mensaje: string }[] } }>(`/api/eventos/${eventoId}/alumnos/${alumnoId}`, { estatus: e });

test("G4 estatus: solo avanza (convocado → confirmado → pagado → asistio); repetir es idempotente; retroceder, 409; asistio solo cuando el evento ya llegó", async () => {
  reloj("2026-11-18T18:00:00Z");
  const id = await evento({ fecha: "2026-12-05" });
  const a = await alumno(12, { nivelIdx: 0 });
  assert.equal((await convocar(m.admin, id, a.alumnoId)).estado, 200);
  assert.deepEqual((await estatus(m.maestroA, id, a.alumnoId, "confirmado")).cuerpo.estatus, "confirmado");
  assert.deepEqual((await estatus(m.maestroA, id, a.alumnoId, "confirmado")).cuerpo.sin_cambio, true);
  const atras = await estatus(m.admin, id, a.alumnoId, "convocado");
  assert.deepEqual([atras.estado, atras.cuerpo.error?.detalles?.[0]?.mensaje], [409, "transicion_invalida"]);
  assert.equal((await estatus(m.recepcion, id, a.alumnoId, "pagado")).cuerpo.estatus, "pagado", "recepción cobra");
  const futuro = await estatus(m.admin, id, a.alumnoId, "asistio");
  assert.deepEqual([futuro.estado, futuro.cuerpo.error?.detalles?.[0]?.mensaje], [409, "evento_futuro"]);
  reloj("2026-12-05T18:00:00Z");
  assert.equal((await estatus(m.admin, id, a.alumnoId, "asistio")).cuerpo.estatus, "asistio");
  // Saltarse pasos hacia adelante se permite (se paga en el mostrador sin confirmar antes).
  const b = await alumno(12, { nivelIdx: 0 });
  reloj("2026-11-18T18:00:00Z");
  await convocar(m.admin, id, b.alumnoId);
  assert.equal((await estatus(m.admin, id, b.alumnoId, "pagado")).cuerpo.estatus, "pagado");
  // El asesor no cambia estatus; un alumno que no está en el evento da 404; el maestro ajeno, 404.
  assert.equal((await estatus(m.asesorNorte, id, b.alumnoId, "asistio")).estado, 403);
  assert.equal((await estatus(m.admin, id, (await alumno(0)).alumnoId, "confirmado")).estado, 404);
  assert.equal((await estatus(m.maestroB, id, b.alumnoId, "asistio")).estado, 404);
  // Quitar: sí mientras no tenga resultado.
  assert.equal((await m.admin.delete(`/api/eventos/${id}/alumnos/${b.alumnoId}`)).estado, 204);
  assert.equal((await m.admin.delete(`/api/eventos/${id}/alumnos/${b.alumnoId}`)).estado, 404);
  const reg = await prisma.registro_cambio.findMany({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "evento_alumno", accion: "actualizar" } });
  assert.ok(reg.length >= 4);
});

test("G4 resultado: aprobar crea el peldaño en la MISMA transacción (el siguiente, con la fecha del evento y el instructor); es idempotente; uno distinto es conflicto", async () => {
  reloj("2026-11-18T18:00:00Z");
  const id = await evento({ fecha: "2026-12-05" });
  const a = await alumno(12, { nivelIdx: 0 });
  await convocar(m.admin, id, a.alumnoId);
  const resultado = (c: ClienteApi, alumnoId: string, cuerpo: Record<string, unknown>) => c.post<{ resultado?: string; nivel_otorgado_id?: string | null; progresion_id?: string | null; sin_cambio?: boolean; error?: { detalles?: { mensaje: string }[] } }>(`/api/eventos/${id}/alumnos/${alumnoId}/resultado`, cuerpo);
  // Sin asistir no hay resultado.
  const antes = await resultado(m.maestroA, a.alumnoId, { resultado: "aprobado" });
  assert.deepEqual([antes.estado, antes.cuerpo.error?.detalles?.[0]?.mensaje], [409, "no_asistio"]);
  reloj("2026-12-05T18:00:00Z");
  await estatus(m.maestroA, id, a.alumnoId, "asistio");
  const ok = await resultado(m.maestroA, a.alumnoId, { resultado: "aprobado" });
  assert.equal(ok.estado, 201);
  assert.equal(ok.cuerpo.nivel_otorgado_id, nivel[1]!.id, "el siguiente al que tenía");
  const prog = await prisma.alumno_progresion.findUniqueOrThrow({ where: { id: ok.cuerpo.progresion_id! } });
  const instructorA = await prisma.instructor.findFirstOrThrow({ where: { usuario_id: m.usuarioMaestroA } });
  assert.deepEqual([prog.alumno_id, prog.nivel_id, prog.evento_id, prog.instructor_id, prog.fecha_obtenido.toISOString().slice(0, 10)], [a.alumnoId, nivel[1]!.id, id, instructorA.id, "2026-12-05"]);
  const fila = await prisma.evento_alumno.findFirstOrThrow({ where: { evento_id: id, alumno_id: a.alumnoId } });
  assert.deepEqual([fila.resultado, fila.nivel_otorgado_id], ["aprobado", nivel[1]!.id]);
  // El alumno subió: ya es de nivel «Segundo» y su siguiente es el tercero.
  const p = (await m.admin.get<{ verticales: { nivel_actual: { id: string; fecha_obtenido: string }; siguiente_nivel: { id: string } }[] }>(`/api/alumnos/${a.alumnoId}/progresion`)).cuerpo.verticales[0]!;
  assert.deepEqual([p.nivel_actual.id, p.nivel_actual.fecha_obtenido, p.siguiente_nivel.id], [nivel[1]!.id, "2026-12-05", nivel[2]!.id]);
  // Idempotente: lo mismo otra vez no crea otro peldaño; uno distinto es un conflicto.
  const otra = await resultado(m.maestroA, a.alumnoId, { resultado: "aprobado" });
  assert.deepEqual([otra.estado, otra.cuerpo.sin_cambio, otra.cuerpo.progresion_id], [200, true, ok.cuerpo.progresion_id]);
  assert.equal((await resultado(m.admin, a.alumnoId, { resultado: "no_aprobado" })).cuerpo.error?.detalles?.[0]?.mensaje, "resultado_ya_registrado");
  assert.equal(await prisma.alumno_progresion.count({ where: { evento_id: id, alumno_id: a.alumnoId } }), 1);
  // Con resultado ya no se puede quitar del evento ni el peldaño se corrige por la ruta del alumno.
  assert.equal((await m.admin.delete(`/api/eventos/${id}/alumnos/${a.alumnoId}`)).estado, 409);
  assert.equal((await m.admin.delete(`/api/alumnos/${a.alumnoId}/progresion/${ok.cuerpo.progresion_id}`)).estado, 409);
  // Reprobar no crea peldaño.
  const b = await alumno(12, { nivelIdx: 0 });
  reloj("2026-11-18T18:00:00Z");
  await convocar(m.admin, id, b.alumnoId);
  reloj("2026-12-05T18:00:00Z");
  await estatus(m.admin, id, b.alumnoId, "asistio");
  const no = await resultado(m.admin, b.alumnoId, { resultado: "no_aprobado" });
  assert.deepEqual([no.estado, no.cuerpo.progresion_id, no.cuerpo.nivel_otorgado_id], [201, null, null]);
  assert.equal(await prisma.alumno_progresion.count({ where: { alumno_id: b.alumnoId } }), 1, "solo el que ya tenía");
  reloj("2026-11-18T18:00:00Z");
});

test("G4 resultado — carrera real: seis resultados «aprobado» simultáneos del mismo alumno dejan UN peldaño y una sola respuesta de creación", async () => {
  reloj("2026-11-18T18:00:00Z");
  const id = await evento({ fecha: "2026-12-05" });
  const a = await alumno(12, { nivelIdx: 0 });
  await convocar(m.admin, id, a.alumnoId);
  reloj("2026-12-05T18:00:00Z");
  await estatus(m.admin, id, a.alumnoId, "asistio");
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 === 0 ? m.admin : m.maestroA).post<{ progresion_id: string | null; sin_cambio: boolean }>(`/api/eventos/${id}/alumnos/${a.alumnoId}/resultado`, { resultado: "aprobado" })));
  assert.deepEqual(rs.map((r) => r.estado).sort(), [200, 200, 200, 200, 200, 201]);
  assert.equal(new Set(rs.map((r) => r.cuerpo.progresion_id)).size, 1, "todas ven el mismo peldaño");
  assert.equal(await prisma.alumno_progresion.count({ where: { evento_id: id, alumno_id: a.alumnoId } }), 1);
  reloj("2026-11-18T18:00:00Z");
});

test("G4 resultado — si el peldaño no se puede otorgar, el resultado TAMPOCO queda: el último nivel, un nivel de otra vertical o inferior, y un evento sin progresión", async () => {
  reloj("2026-11-18T18:00:00Z");
  const id = await evento({ fecha: "2026-12-05" });
  const tope = await alumno(40, { nivelIdx: 2 });
  const medio = await alumno(30, { nivelIdx: 1, fechaNivel: "2026-09-01" });
  await prisma.evento.update({ where: { id }, data: { otorga_progresion: false } }); // para convocar al del tope (no pide clases)
  await convocar(m.admin, id, tope.alumnoId, medio.alumnoId);
  await prisma.evento.update({ where: { id }, data: { otorga_progresion: true } });
  reloj("2026-12-05T18:00:00Z");
  for (const a of [tope, medio]) await estatus(m.admin, id, a.alumnoId, "asistio");
  const r = (alumnoId: string, cuerpo: Record<string, unknown>) => m.admin.post<{ error?: { detalles?: { mensaje: string }[] } }>(`/api/eventos/${id}/alumnos/${alumnoId}/resultado`, cuerpo);
  const resultadoDe = async (alumnoId: string) => (await prisma.evento_alumno.findFirstOrThrow({ where: { evento_id: id, alumno_id: alumnoId } })).resultado;
  assert.equal((await r(tope.alumnoId, { resultado: "aprobado" })).cuerpo.error?.detalles?.[0]?.mensaje, "sin_siguiente_nivel");
  assert.equal(await resultadoDe(tope.alumnoId), null, "el resultado se revirtió con el peldaño que no se pudo dar");
  assert.equal((await r(medio.alumnoId, { resultado: "aprobado", nivel_id: nivel[0]!.id })).cuerpo.error?.detalles?.[0]?.mensaje, "nivel_no_superior");
  assert.equal((await r(medio.alumnoId, { resultado: "aprobado", nivel_id: randomUUID() })).cuerpo.error?.detalles?.[0]?.mensaje, "nivel_de_otra_vertical");
  assert.equal(await resultadoDe(medio.alumnoId), null);
  // Un nivel superior explícito sí se puede (saltarse uno).
  const ok = await r(medio.alumnoId, { resultado: "aprobado", nivel_id: nivel[2]!.id });
  assert.equal(ok.cuerpo.error, undefined);
  assert.equal((await prisma.evento_alumno.findFirstOrThrow({ where: { evento_id: id, alumno_id: medio.alumnoId } })).nivel_otorgado_id, nivel[2]!.id);
  // El tope puede registrar «no aprobado» sin problema.
  assert.equal((await r(tope.alumnoId, { resultado: "no_aprobado" })).cuerpo.error, undefined);
  // Un evento que no sube de peldaño registra «aprobado» sin crear nada.
  const sinPeldano = await evento({ fecha: "2026-12-05", otorga_progresion: false });
  const c = await alumno(0, { nivelIdx: 0 });
  reloj("2026-11-18T18:00:00Z");
  await convocar(m.admin, sinPeldano, c.alumnoId);
  reloj("2026-12-05T18:00:00Z");
  await estatus(m.admin, sinPeldano, c.alumnoId, "asistio");
  const sinProg = await m.admin.post<{ progresion_id: string | null }>(`/api/eventos/${sinPeldano}/alumnos/${c.alumnoId}/resultado`, { resultado: "aprobado" });
  assert.deepEqual([sinProg.estado, sinProg.cuerpo.progresion_id], [201, null]);
  reloj("2026-11-18T18:00:00Z");
});

test("G4 no-fuga entre organizaciones: ni los eventos, ni los participantes, ni los alumnos de otra organización se ven o se tocan", async () => {
  const otra = await mundoDeOperacion(prisma, "Eventos de otra org");
  try {
    await prisma.vertical.update({ where: { id: otra.org.verticalId }, data: { usa_progresion: true, etiqueta_progresion: "Grado" } });
    const ev = await otra.admin.post<{ id: string }>("/api/eventos", { vertical_id: otra.org.verticalId, sucursal_id: otra.norte, tipo: "x", nombre: "Ajeno", fecha: EVENTO, cupo: 3, otorga_progresion: false });
    const ajeno = await otra.inscribir(otra.grupoA);
    const propio = await alumno(0);
    const id = await evento({ otorga_progresion: false });
    assert.equal((await m.admin.get(`/api/eventos/${ev.cuerpo.id}`)).estado, 404);
    assert.equal((await m.admin.patch(`/api/eventos/${ev.cuerpo.id}`, { nombre: "Robado" })).estado, 404);
    assert.equal((await m.admin.delete(`/api/eventos/${ev.cuerpo.id}`)).estado, 404);
    assert.equal((await convocar(m.admin, ev.cuerpo.id, propio.alumnoId)).estado, 404);
    assert.equal((await convocar(m.admin, id, ajeno.alumnoId)).cuerpo.error?.detalles?.[0]?.mensaje, "alumno_inexistente");
    assert.equal((await m.admin.get<{ datos: { id: string }[] }>("/api/eventos?limite=100")).cuerpo.datos.some((e) => e.id === ev.cuerpo.id), false);
    assert.equal((await estatus(m.admin, ev.cuerpo.id, ajeno.alumnoId, "confirmado")).estado, 404);
  } finally {
    await otra.cerrar();
  }
});

test("EG-10: la elegibilidad cuenta solo las asistencias de ESA vertical: las de otra vertical del mismo alumno no suman", async () => {
  const id = await evento();
  const a = await alumno(9, { nivelIdx: 0 }); // 9 de las 10 que pide el siguiente peldaño
  // El mismo alumno, además, en otra vertical (otro programa y grupo) donde asiste todo el tiempo.
  const v2 = await prisma.vertical.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Otra", slug: `otra-${randomUUID().slice(0, 6)}`, usa_progresion: false } });
  await prisma.sucursal_vertical.create({ data: { organizacion_id: m.org.organizacionId, sucursal_id: m.norte, vertical_id: v2.id } });
  const p2 = await prisma.programa.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: v2.id, sucursal_id: m.norte, nombre: "Programa otra", edad_min: 3, edad_max: 14 } });
  const g2 = await prisma.grupo.create({ data: { organizacion_id: m.org.organizacionId, programa_id: p2.id, nombre: "Grupo otra", cupo_maximo: 20 } });
  const insc2 = await prisma.inscripcion.create({ data: { organizacion_id: m.org.organizacionId, alumno_id: a.alumnoId, programa_id: p2.id, grupo_id: g2.id, fecha_inscripcion: new Date("2026-09-01"), fecha_inicio: new Date("2026-09-01"), precio_inscripcion_aplicado: "1.00", precio_mensualidad_aplicado: "1.00", dia_corte_pago: 5 } });
  for (let i = 0; i < 15; i++) await prisma.asistencia.create({ data: { organizacion_id: m.org.organizacionId, inscripcion_id: insc2.id, grupo_id: g2.id, fecha: dia(sumarDias("2026-10-01", i)), estatus: "presente" } });
  const e = (await elegibles(id)).find((x) => x.alumno_id === a.alumnoId)!;
  assert.deepEqual([e.clases_cumplidas, e.elegible, e.faltan], [9, false, 1], "las 15 de la otra vertical no cuentan");
  // La décima de ESTA vertical sí lo hace elegible.
  await prisma.asistencia.create({ data: { organizacion_id: m.org.organizacionId, inscripcion_id: a.inscripcionId, grupo_id: m.grupoA, fecha: dia("2026-12-30"), estatus: "presente" } });
  assert.equal((await elegibles(id)).find((x) => x.alumno_id === a.alumnoId)!.elegible, true);
});

test("V10 / EG-10 (M49): dos convocatorias a la vez se forman en fila por la fila del evento (la base ya rechazaba el sobrecupo, pero entonces una convocatoria entera fallaba en vez de convocar a los que caben)", async () => {
  const id = await evento({ cupo: 2 });
  const [a, b] = [await alumno(12, { nivelIdx: 0 }), await alumno(12, { nivelIdx: 0 })];
  // Cada convocatoria cuenta los lugares ocupados y espera a la otra: sin la fila del evento las dos cuentan 0 a la vez (se solapan); con ella, la segunda cuenta
  // después de que la primera terminó.
  const barrera = new Barrera(2);
  const raiz = conGanchos(prisma, { modelo: "evento_alumno", operacion: "count", despues: () => barrera.esperar(300) });
  const db = conAlcance(raiz, m.org.organizacionId);
  const convocar1 = (alumnoId: string) => db.$transaction((tx) => convocarAlumnos(tx, { eventoId: id, alumnoIds: [alumnoId], usuarioId: null, alumnoVisible: {} }));
  const [ra, rb] = await Promise.all([convocar1(a.alumnoId), convocar1(b.alumnoId)]);
  assert.ok(ra.ok && rb.ok);
  assert.equal(barrera.completa, false, "se pusieron en fila: nunca contaron a la vez");
  assert.equal(await ocupados(id), 2);
});
