// G3 contra Postgres real y la app real: los peldaños son filas de catálogo; otorgar uno exige vertical con progresión, inscripción vigente en ESA vertical,
// fecha no futura y no tenerlo ya; el nivel actual es el más reciente y el siguiente el de orden inmediatamente mayor; alcance por rol; no-fuga entre organizaciones.
// Reloj: miércoles 18 de noviembre de 2026, 12:00 en la Ciudad de México.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeOperacion, type MundoDeOperacion } from "../testutil/operacion.ts";

let prisma: PrismaPruebas;
let m: MundoDeOperacion;
const niveles: { id: string; orden: number }[] = [];
before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeOperacion(prisma, "Progresión");
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { usa_progresion: true, etiqueta_progresion: "Peldaño" } });
  for (const [orden, nombre, clases] of [[1, "Primero", 0], [2, "Segundo", 10], [3, "Tercero", 20]] as const) {
    const r = await m.admin.post<{ id: string; orden: number }>("/api/niveles", { vertical_id: m.org.verticalId, nombre, orden, color_hex: "#112233", clases_minimas: clases, horas_minimas: clases });
    assert.equal(r.estado, 201);
    niveles.push(r.cuerpo);
  }
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const HOY = "2026-11-18";
interface Vertical { vertical: { id: string; usa_progresion: boolean; etiqueta_progresion: string | null }; nivel_actual: { id: string; fecha_obtenido: string; progresion_id: string } | null; siguiente_nivel: { id: string } | null; historial: { progresion_id: string; id: string; fecha_obtenido: string; observaciones?: string | null }[]; niveles: { id: string }[] }
const leer = (c: typeof m.admin, alumnoId: string) => c.get<{ verticales: Vertical[] }>(`/api/alumnos/${alumnoId}/progresion`);
const otorgar = (c: typeof m.admin, alumnoId: string, nivelId: string, fecha: string, extra: Record<string, unknown> = {}) => c.post<{ error?: { detalles?: { campo?: string; mensaje: string }[] }; progresion_id?: string }>(`/api/alumnos/${alumnoId}/progresion`, { nivel_id: nivelId, fecha_obtenido: fecha, ...extra });

test("G3 niveles: catálogo legible por todos los roles, editable solo por el administrador; orden y nombre únicos; color validado; registro de cambios", async () => {
  const lista = await m.maestroA.get<{ datos: { id: string; orden: number; nombre: string; color_hex: string }[] }>(`/api/niveles?vertical_id=${m.org.verticalId}`);
  assert.deepEqual(lista.cuerpo.datos.map((n) => [n.orden, n.nombre, n.color_hex]), [[1, "Primero", "#112233"], [2, "Segundo", "#112233"], [3, "Tercero", "#112233"]]);
  for (const c of [m.maestroA, m.asesorNorte, m.recepcion]) assert.equal((await c.post("/api/niveles", { vertical_id: m.org.verticalId, nombre: "X", orden: 9 })).estado, 403);
  const e = (cuerpo: Record<string, unknown>) => m.admin.post<{ error: { codigo: string; detalles?: { campo?: string }[] } }>("/api/niveles", { vertical_id: m.org.verticalId, ...cuerpo });
  assert.equal((await e({ nombre: "Otro", orden: 2 })).estado, 409, "orden repetido");
  assert.equal((await e({ nombre: "segundo", orden: 9 })).estado, 409, "nombre repetido sin importar mayúsculas");
  for (const mala of [{ nombre: "A", orden: 9, color_hex: "rojo" }, { nombre: "A", orden: -1 }, { nombre: "", orden: 9 }, { nombre: "A", orden: 9, clases_minimas: -3 }, { orden: 9 }]) assert.equal((await e(mala)).estado, 400, JSON.stringify(mala));
  assert.equal((await m.admin.post("/api/niveles", { vertical_id: randomUUID(), nombre: "A", orden: 9 })).estado, 400, "vertical inexistente");
  // Editar y borrar.
  const creado = await e({ nombre: "Temporal", orden: 50, requisitos_texto: "Algo" });
  assert.equal(creado.estado, 201);
  const id = (creado.cuerpo as unknown as { id: string }).id;
  assert.equal((await m.admin.patch(`/api/niveles/${id}`, { orden: 2 })).estado, 409);
  assert.equal((await m.admin.patch<{ clases_minimas: number }>(`/api/niveles/${id}`, { clases_minimas: 7, color_hex: null })).cuerpo.clases_minimas, 7);
  assert.equal((await m.admin.patch(`/api/niveles/${id}`, {})).estado, 400);
  assert.equal((await m.admin.delete(`/api/niveles/${id}`)).estado, 204);
  assert.equal((await m.admin.delete(`/api/niveles/${id}`)).estado, 404);
  const otraVez = await e({ nombre: "Temporal", orden: 50 });
  assert.equal(otraVez.estado, 201, "el orden y el nombre se liberan al borrar (baja lógica)");
  assert.equal((await m.admin.delete(`/api/niveles/${(otraVez.cuerpo as unknown as { id: string }).id}`)).estado, 204, "para no estorbar a las demás pruebas");
  const acciones = await prisma.registro_cambio.findMany({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "nivel_progresion", entidad_id: id }, orderBy: { creado_en: "asc" } });
  assert.deepEqual(acciones.map((a) => a.accion), ["crear", "actualizar", "eliminar"]);
});

test("G3 otorgar un nivel: reglas de negocio — vertical con progresión, inscripción vigente en ESA vertical, fecha no futura, no repetido, instructor", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Ana" });
  const uno = niveles[0]!.id;
  assert.equal((await otorgar(m.admin, a.alumnoId, uno, "2026-11-19")).estado, 409, "fecha futura");
  assert.equal((await otorgar(m.admin, a.alumnoId, uno, "2026-11-19")).cuerpo.error?.detalles?.[0]?.mensaje, "fecha_futura");
  assert.equal((await otorgar(m.admin, a.alumnoId, randomUUID(), HOY)).estado, 404, "nivel inexistente");
  assert.equal((await otorgar(m.admin, randomUUID(), uno, HOY)).estado, 404, "alumno inexistente");
  assert.equal((await otorgar(m.admin, a.alumnoId, uno, HOY, { instructor_id: randomUUID() })).estado, 400, "instructor inexistente");
  assert.equal((await otorgar(m.admin, a.alumnoId, uno, "ayer")).estado, 400);
  const ok = await otorgar(m.admin, a.alumnoId, uno, "2026-10-05", { observaciones: "Entró fuerte" });
  assert.equal(ok.estado, 201);
  assert.equal((await otorgar(m.admin, a.alumnoId, uno, HOY)).cuerpo.error?.detalles?.[0]?.mensaje, "nivel_ya_obtenido");
  // Sin inscripción vigente en la vertical: congelada sí cuenta, baja no.
  const baja = await m.inscribir(m.grupoA, { nombre: "Baja", estatus: "baja" });
  assert.equal((await otorgar(m.admin, baja.alumnoId, uno, HOY)).cuerpo.error?.detalles?.[0]?.mensaje, "sin_inscripcion_en_la_vertical");
  const congelada = await m.inscribir(m.grupoA, { nombre: "Congelada", estatus: "congelada" });
  assert.equal((await otorgar(m.admin, congelada.alumnoId, uno, HOY)).estado, 201);
  // Una vertical que no lleva progresión.
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { usa_progresion: false } });
  const b = await m.inscribir(m.grupoA, { nombre: "Beto" });
  assert.equal((await otorgar(m.admin, b.alumnoId, uno, HOY)).cuerpo.error?.detalles?.[0]?.mensaje, "vertical_sin_progresion");
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { usa_progresion: true } });
  assert.equal((await otorgar(m.admin, b.alumnoId, uno, HOY)).estado, 201);
  // Quedó el registro de cambios, sin las observaciones.
  const reg = await prisma.registro_cambio.findMany({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "alumno_progresion", entidad_id: ok.cuerpo.progresion_id! } });
  assert.equal(reg.length, 1);
  assert.ok(!JSON.stringify(reg).includes("Entró fuerte"));
});

test("G3 nivel actual = el más reciente por fecha (aunque se registre después), siguiente = el de orden inmediatamente mayor, historial ordenado", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Cris" });
  const [uno, dos, tres] = niveles.map((n) => n.id) as [string, string, string];
  assert.deepEqual((await leer(m.admin, a.alumnoId)).cuerpo.verticales[0]!.siguiente_nivel?.id, uno, "sin nivel, el siguiente es el primero");
  await otorgar(m.admin, a.alumnoId, dos, "2026-09-15");
  await otorgar(m.admin, a.alumnoId, uno, "2026-08-01"); // se registra DESPUÉS pero es anterior
  const v = (await leer(m.admin, a.alumnoId)).cuerpo.verticales[0]!;
  assert.deepEqual([v.nivel_actual?.id, v.nivel_actual?.fecha_obtenido, v.siguiente_nivel?.id], [dos, "2026-09-15", tres]);
  assert.deepEqual(v.historial.map((h) => [h.id, h.fecha_obtenido]), [[dos, "2026-09-15"], [uno, "2026-08-01"]], "lo más reciente primero");
  assert.deepEqual(v.niveles.map((n) => n.id), [uno, dos, tres]);
  assert.deepEqual([v.vertical.usa_progresion, v.vertical.etiqueta_progresion], [true, "Peldaño"]);
  await otorgar(m.admin, a.alumnoId, tres, "2026-11-01");
  assert.equal((await leer(m.admin, a.alumnoId)).cuerpo.verticales[0]!.siguiente_nivel, null, "en el último ya no hay siguiente");
});

test("G3 dos verticales, dos progresiones independientes: el nivel actual es por vertical", async () => {
  const v2 = await prisma.vertical.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Segunda", slug: `segunda-${randomUUID().slice(0, 6)}`, usa_progresion: true, etiqueta_progresion: "Grado" } });
  await prisma.sucursal_vertical.create({ data: { organizacion_id: m.org.organizacionId, sucursal_id: m.norte, vertical_id: v2.id } });
  const nv2 = await prisma.nivel_progresion.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: v2.id, nombre: "Grado uno", orden: 1 } });
  const p2 = await prisma.programa.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: v2.id, sucursal_id: m.norte, nombre: "Programa dos", edad_min: 3, edad_max: 14 } });
  const g2 = await prisma.grupo.create({ data: { organizacion_id: m.org.organizacionId, programa_id: p2.id, nombre: "Grupo dos", cupo_maximo: 20 } });
  const a = await m.inscribir(m.grupoA, { nombre: "Dora" });
  assert.equal((await otorgar(m.admin, a.alumnoId, nv2.id, HOY)).cuerpo.error?.detalles?.[0]?.mensaje, "sin_inscripcion_en_la_vertical", "el alumno solo está en la otra vertical");
  await m.inscribir(g2.id, { nombre: "Otra" }); // (otro alumno, solo para sembrar el grupo)
  const segunda = await prisma.inscripcion.create({ data: { organizacion_id: m.org.organizacionId, alumno_id: a.alumnoId, programa_id: p2.id, grupo_id: g2.id, fecha_inscripcion: new Date("2026-09-01"), fecha_inicio: new Date("2026-09-01"), precio_inscripcion_aplicado: "1.00", precio_mensualidad_aplicado: "1.00", dia_corte_pago: 5 } });
  assert.ok(segunda.id);
  await otorgar(m.admin, a.alumnoId, niveles[0]!.id, "2026-10-01");
  assert.equal((await otorgar(m.admin, a.alumnoId, nv2.id, "2026-10-10")).estado, 201);
  const r = (await leer(m.admin, a.alumnoId)).cuerpo.verticales;
  assert.equal(r.length, 2);
  const por = new Map(r.map((v) => [v.vertical.id, v]));
  assert.equal(por.get(m.org.verticalId)!.nivel_actual?.id, niveles[0]!.id);
  assert.equal(por.get(v2.id)!.nivel_actual?.id, nv2.id);
  assert.equal(por.get(v2.id)!.vertical.etiqueta_progresion, "Grado");
});

test("G3 alcance por rol: el maestro registra a SUS alumnos (y queda como instructor), no a los ajenos; asesor y recepción leen sin las observaciones; corregir es solo del administrador", async () => {
  const mio = await m.inscribir(m.grupoA, { nombre: "Eva" });
  const ajeno = await m.inscribir(m.grupoB, { nombre: "Fito" });
  const sur = await m.inscribir(m.grupoSur, { nombre: "Gus" });
  const uno = niveles[0]!.id;
  assert.equal((await otorgar(m.maestroA, ajeno.alumnoId, uno, HOY)).estado, 404, "alumno de otro maestro");
  assert.equal((await otorgar(m.maestroB, mio.alumnoId, uno, HOY)).estado, 404);
  const ok = await otorgar(m.maestroA, mio.alumnoId, uno, HOY, { observaciones: "Lleva una férula en la muñeca" });
  assert.equal(ok.estado, 201);
  const fila = await prisma.alumno_progresion.findUniqueOrThrow({ where: { id: ok.cuerpo.progresion_id! } });
  const instructorA = await prisma.instructor.findFirstOrThrow({ where: { usuario_id: m.usuarioMaestroA } });
  assert.deepEqual([fila.instructor_id, fila.registrado_por_usuario_id], [instructorA.id, m.usuarioMaestroA]);
  assert.equal((await otorgar(m.maestroA, (await m.inscribir(m.grupoA)).alumnoId, niveles[1]!.id, HOY, { instructor_id: randomUUID() })).estado, 400, "el maestro solo se registra a sí mismo");
  // Asesor y recepción: no pueden registrar; leen, sin observaciones. El maestro y el administrador sí las ven.
  assert.equal((await otorgar(m.asesorNorte, mio.alumnoId, niveles[1]!.id, HOY)).estado, 403);
  assert.equal((await otorgar(m.recepcion, mio.alumnoId, niveles[1]!.id, HOY)).estado, 403);
  assert.equal((await leer(m.asesorNorte, mio.alumnoId)).cuerpo.verticales[0]!.historial[0]!.observaciones, undefined);
  assert.equal((await leer(m.recepcion, mio.alumnoId)).cuerpo.verticales[0]!.historial[0]!.observaciones, undefined);
  assert.equal((await leer(m.maestroA, mio.alumnoId)).cuerpo.verticales[0]!.historial[0]!.observaciones, "Lleva una férula en la muñeca");
  assert.equal((await leer(m.admin, mio.alumnoId)).cuerpo.verticales[0]!.historial[0]!.observaciones, "Lleva una férula en la muñeca");
  // Alcance de lectura.
  assert.equal((await leer(m.maestroA, ajeno.alumnoId)).estado, 404);
  assert.equal((await leer(m.asesorSur, mio.alumnoId)).estado, 404, "el alumno es de la sucursal norte");
  assert.equal((await leer(m.asesorSur, sur.alumnoId)).estado, 200);
  // Corregir: solo el administrador; borrado lógico y deja el nivel libre para volver a otorgarlo.
  assert.equal((await m.maestroA.delete(`/api/alumnos/${mio.alumnoId}/progresion/${ok.cuerpo.progresion_id}`)).estado, 403);
  assert.equal((await m.admin.delete(`/api/alumnos/${mio.alumnoId}/progresion/${ok.cuerpo.progresion_id}`)).estado, 204);
  assert.equal((await m.admin.delete(`/api/alumnos/${mio.alumnoId}/progresion/${ok.cuerpo.progresion_id}`)).estado, 404);
  assert.equal((await prisma.alumno_progresion.findUniqueOrThrow({ where: { id: ok.cuerpo.progresion_id! } })).eliminado_en !== null, true);
  assert.equal((await leer(m.admin, mio.alumnoId)).cuerpo.verticales[0]!.nivel_actual, null);
  assert.equal((await otorgar(m.maestroA, mio.alumnoId, uno, HOY)).estado, 201);
});

test("G3 no-fuga entre organizaciones: los niveles y la progresión de otra organización no se ven ni se tocan", async () => {
  const otra = await mundoDeOperacion(prisma, "Progresión ajena");
  try {
    await prisma.vertical.update({ where: { id: otra.org.verticalId }, data: { usa_progresion: true, etiqueta_progresion: "Grado" } });
    const nivelAjeno = await otra.admin.post<{ id: string }>("/api/niveles", { vertical_id: otra.org.verticalId, nombre: "Ajeno", orden: 1 });
    const ajena = await otra.inscribir(otra.grupoA);
    assert.equal((await m.admin.get<{ datos: unknown[] }>(`/api/niveles?vertical_id=${otra.org.verticalId}`)).cuerpo.datos.length, 0);
    assert.equal((await m.admin.patch(`/api/niveles/${nivelAjeno.cuerpo.id}`, { nombre: "Robado" })).estado, 404);
    assert.equal((await m.admin.delete(`/api/niveles/${nivelAjeno.cuerpo.id}`)).estado, 404);
    assert.equal((await leer(m.admin, ajena.alumnoId)).estado, 404);
    assert.equal((await otorgar(m.admin, ajena.alumnoId, niveles[0]!.id, HOY)).estado, 404, "alumno ajeno");
    const propio = await m.inscribir(m.grupoA);
    assert.equal((await otorgar(m.admin, propio.alumnoId, nivelAjeno.cuerpo.id, HOY)).estado, 404, "nivel ajeno");
    assert.equal(await prisma.alumno_progresion.count({ where: { OR: [{ alumno_id: ajena.alumnoId }, { nivel_id: nivelAjeno.cuerpo.id }] } }), 0);
    // La base lo respalda: un peldaño de otra organización no se liga a un alumno propio.
    await assert.rejects(prisma.alumno_progresion.create({ data: { organizacion_id: m.org.organizacionId, alumno_id: propio.alumnoId, nivel_id: nivelAjeno.cuerpo.id, fecha_obtenido: new Date("2026-11-01") } }), (e: unknown) => (e as { code?: string }).code === "P2003");
  } finally {
    await otra.cerrar();
  }
});

test("G3 SQL directo: un mismo peldaño dos veces al mismo alumno, o dos peldaños con el mismo orden, los rechaza la base; borrado lógico los libera", async () => {
  const a = await m.inscribir(m.grupoA);
  const fila = { organizacion_id: m.org.organizacionId, alumno_id: a.alumnoId, nivel_id: niveles[0]!.id, fecha_obtenido: new Date("2026-11-01") };
  const primera = await prisma.alumno_progresion.create({ data: fila });
  await assert.rejects(prisma.alumno_progresion.create({ data: fila }), /Unique constraint|alumno_progresion_alumno_nivel_key/);
  await prisma.alumno_progresion.update({ where: { id: primera.id }, data: { eliminado_en: new Date() } });
  await prisma.alumno_progresion.create({ data: fila });
  await assert.rejects(prisma.nivel_progresion.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: m.org.verticalId, nombre: "Distinto", orden: niveles[0]!.orden } }), /Unique constraint|nivel_progresion_vertical_orden_key/);
  await assert.rejects(prisma.nivel_progresion.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: m.org.verticalId, nombre: "X", orden: 77, color_hex: "azul" } }), /nivel_progresion_color_chk|check/i);
});

test("EG-07: un peldaño más bajo con una fecha POSTERIOR a la de uno más alto no hace retroceder al alumno (y uno más alto con fecha anterior a uno más bajo tampoco); el historial a mano con fechas coherentes sí se puede capturar", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Eva" });
  const [uno, dos, tres] = niveles.map((n) => n.id) as [string, string, string];
  assert.equal((await otorgar(m.admin, a.alumnoId, tres, "2026-11-01")).estado, 201);
  // El retroceso: el peldaño 1 con una fecha posterior a la del 3.
  const retroceso = await otorgar(m.admin, a.alumnoId, uno, "2026-11-10");
  assert.equal(retroceso.estado, 409);
  assert.equal(retroceso.cuerpo.error?.detalles?.[0]?.mensaje, "fecha_incoherente_con_el_orden");
  const v = (await leer(m.admin, a.alumnoId)).cuerpo.verticales[0]!;
  assert.deepEqual([v.nivel_actual?.id, v.siguiente_nivel], [tres, null], "el nivel actual no cambió");
  assert.equal(await prisma.alumno_progresion.count({ where: { alumno_id: a.alumnoId } }), 1, "no se guardó");
  // El mismo día cuenta como coherente (no se sabe el orden dentro del día); antes, también: así se captura el historial de quien llega con varios peldaños.
  assert.equal((await otorgar(m.admin, a.alumnoId, uno, "2026-11-01")).estado, 201);
  assert.equal((await otorgar(m.admin, a.alumnoId, dos, "2026-08-15")).estado, 409, "el 2 no pudo obtenerse antes que el 1 (2026-11-01 es la fecha del 1)");
  assert.equal((await otorgar(m.admin, a.alumnoId, dos, "2026-11-01")).estado, 201);
  assert.equal((await leer(m.admin, a.alumnoId)).cuerpo.verticales[0]!.historial.length, 3);
});
