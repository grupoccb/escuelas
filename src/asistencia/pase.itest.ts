// G1: el pase de lista de punta a punta (la app real + Postgres): alcance por rol, la fecha tiene que ser una sesión que ya empezó, la lista son los
// inscritos activos, guardado masivo idempotente, corrección con registro de cambios y dos pases simultáneos. Reloj: miércoles 18 de noviembre de 2026,
// 12:00 en la Ciudad de México (la clase de las 16:00 todavía no empieza); el lunes 16 ya pasó.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeOperacion, type MundoDeOperacion } from "../testutil/operacion.ts";

let prisma: PrismaPruebas;
let m: MundoDeOperacion;
before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeOperacion(prisma, "Pase de lista");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const LUNES = "2026-11-16";
const MARTES = "2026-11-17";
const HOY_MIERCOLES = "2026-11-18";

interface Pase {
  grupo: { id: string };
  fecha: string;
  es_sesion: boolean;
  puede_registrar: boolean;
  problema: string | null;
  pase_tomado: boolean;
  lista: { inscripcion_id: string; alumno_id: string; alumno: string; activa: boolean; estatus: string | null; metodo: string | null }[];
}
interface Guardado { creadas: number; actualizadas: number; sin_cambio: number; lista: Pase["lista"] }
type Entrada = { inscripcion_id: string; estatus: string; metodo?: string };
const poner = (grupoId: string, fecha: string, asistencias: Entrada[]) => ({ fecha, asistencias });

/** Inicios (minutos desde la medianoche local) que no pisan la clase de las 16:00 del grupo A y caen después de las 12:00. */
const FRANJAS = [730, 790, 850, 1030, 1090, 1150, 1210, 1270, 1330, 1390];
let franja = 0;
/**
 * Un grupo nuevo por prueba (lunes y miércoles) del maestro A: los datos no se pisan entre sí. El instructor no puede dar dos grupos a la misma hora (disparador de
 * C1), así que cada grupo toma una franja distinta, todas DESPUÉS de las 12:00 locales del miércoles 18 (el «ahora» de la prueba): la clase de hoy aún no empieza.
 */
async function grupoConAlumnos(n: number) {
  const inicio = FRANJAS[franja++ % FRANJAS.length]!;
  const g = await prisma.grupo.create({ data: { organizacion_id: m.org.organizacionId, programa_id: m.programaNorteId, nombre: `G ${randomUUID().slice(0, 6)}`, cupo_maximo: 40, instructor_id: (await prisma.grupo.findUniqueOrThrow({ where: { id: m.grupoA } })).instructor_id } });
  for (const dia of [1, 3]) await prisma.grupo_horario.create({ data: { organizacion_id: m.org.organizacionId, grupo_id: g.id, dia_semana: dia, hora_inicio_min: inicio, hora_fin_min: inicio + 50 } });
  const alumnos = [];
  for (let i = 0; i < n; i++) alumnos.push(await m.inscribir(g.id, { nombre: `Nina${i}` }));
  return { grupoId: g.id, alumnos, inicio };
}

test("G1 alcance: el maestro toma el pase de SUS grupos y de los ajenos recibe 404; el asesor de otra sucursal, 404; el asesor lee pero no registra; recepción registra", async () => {
  const { grupoId, alumnos } = await grupoConAlumnos(2);
  const cuerpo = poner(grupoId, LUNES, [{ inscripcion_id: alumnos[0]!.inscripcionId, estatus: "presente" }]);
  const como = [
    ["maestroA", m.maestroA, 200, 200],
    ["maestroB", m.maestroB, 404, 404],
    ["asesorNorte", m.asesorNorte, 200, 403],
    ["asesorSur", m.asesorSur, 404, 403],
    ["recepcion", m.recepcion, 200, 200],
    ["admin", m.admin, 200, 200],
  ] as const;
  for (const [nombre, c, leer, escribir] of como) {
    assert.equal((await c.get(`/api/grupos/${grupoId}/pase?fecha=${LUNES}`)).estado, leer, `GET ${nombre}`);
    assert.equal((await c.pedir("PUT", `/api/grupos/${grupoId}/pase`, cuerpo)).estado, escribir, `PUT ${nombre}`);
  }
  // Un grupo que no existe y uno de otra organización también dan 404.
  assert.equal((await m.admin.get(`/api/grupos/${randomUUID()}/pase?fecha=${LUNES}`)).estado, 404);
});

test("G1 la lista son los inscritos ACTIVOS que ya habían empezado; la fecha tiene que ser una sesión que ya empezó", async () => {
  const { grupoId, alumnos } = await grupoConAlumnos(2);
  const congelada = await m.inscribir(grupoId, { estatus: "congelada" });
  const baja = await m.inscribir(grupoId, { estatus: "baja" });
  const nueva = await m.inscribir(grupoId, { fechaInicio: "2026-11-17" }); // empezó después del lunes 16
  const lunes = (await m.maestroA.get<Pase>(`/api/grupos/${grupoId}/pase?fecha=${LUNES}`)).cuerpo;
  assert.deepEqual(lunes.lista.map((f) => f.inscripcion_id).sort(), alumnos.map((a) => a.inscripcionId).sort(), "ni la congelada, ni la baja, ni la que empezó después");
  assert.ok(![congelada, baja, nueva].some((x) => lunes.lista.some((f) => f.inscripcion_id === x.inscripcionId)));
  assert.deepEqual([lunes.es_sesion, lunes.puede_registrar, lunes.problema, lunes.pase_tomado], [true, true, null, false]);
  assert.ok(lunes.lista.every((f) => f.estatus === null && f.activa));
  // El miércoles 18 la que empezó el 17 sí aparece… pero la clase de las 16:00 aún no empieza: no se puede registrar.
  const hoy = (await m.maestroA.get<Pase>(`/api/grupos/${grupoId}/pase?fecha=${HOY_MIERCOLES}`)).cuerpo;
  assert.ok(hoy.lista.some((f) => f.inscripcion_id === nueva.inscripcionId));
  assert.deepEqual([hoy.es_sesion, hoy.puede_registrar, hoy.problema], [true, false, "fecha_futura"]);
  const martes = (await m.maestroA.get<Pase>(`/api/grupos/${grupoId}/pase?fecha=${MARTES}`)).cuerpo;
  assert.deepEqual([martes.es_sesion, martes.puede_registrar, martes.problema], [false, false, "no_es_sesion"]);
});

test("G1 el pase de un día que no es sesión, de una sesión futura o con una fecha mal escrita se rechaza", async () => {
  const { grupoId, alumnos, inicio } = await grupoConAlumnos(1);
  const ins = alumnos[0]!.inscripcionId;
  const intento = (fecha: string) => m.maestroA.pedir<{ error: { codigo: string; detalles?: { campo?: string; mensaje: string }[] } }>("PUT", `/api/grupos/${grupoId}/pase`, poner(grupoId, fecha, [{ inscripcion_id: ins, estatus: "presente" }]));
  const martes = await intento(MARTES);
  assert.equal(martes.estado, 409);
  assert.deepEqual(martes.cuerpo.error.detalles, [{ campo: "motivo", mensaje: "no_es_sesion" }]);
  const hoy = await intento(HOY_MIERCOLES);
  assert.equal(hoy.estado, 409);
  assert.deepEqual(hoy.cuerpo.error.detalles, [{ campo: "motivo", mensaje: "fecha_futura" }]);
  assert.equal((await intento("2026-11-23")).cuerpo.error.detalles?.[0]?.mensaje, "fecha_futura");
  for (const mala of ["2026-02-30", "18/11/2026", "ayer", "0000-01-01"]) assert.equal((await intento(mala)).estado, 400, mala);
  assert.equal(await prisma.asistencia.count({ where: { inscripcion_id: ins } }), 0, "no quedó nada");
  // Pasados los minutos, la misma fecha ya se puede (el reloj del servidor es el que manda).
  m.reloj.ahora = new Date(Date.UTC(2026, 10, 18, 0, inicio + 360)); // el instante exacto en que empieza la clase (Ciudad de México es UTC-6)
  try {
    assert.equal((await intento(HOY_MIERCOLES)).estado, 200);
  } finally {
    m.reloj.ahora = new Date("2026-11-18T18:00:00Z");
  }
});

test("G1 guardado masivo TODO o nada: una inscripción ajena, congelada o repetida rechaza el pase entero, con el índice del renglón", async () => {
  const { grupoId, alumnos } = await grupoConAlumnos(3);
  const otro = await grupoConAlumnos(1);
  const congelada = await m.inscribir(grupoId, { estatus: "congelada" });
  const buenas: Entrada[] = alumnos.map((a) => ({ inscripcion_id: a.inscripcionId, estatus: "presente" }));
  const casos: [string, Entrada, string][] = [
    ["de otro grupo", { inscripcion_id: otro.alumnos[0]!.inscripcionId, estatus: "presente" }, "asistencias[3].inscripcion_id"],
    ["congelada", { inscripcion_id: congelada.inscripcionId, estatus: "presente" }, "asistencias[3].inscripcion_id"],
    ["que no existe", { inscripcion_id: randomUUID(), estatus: "presente" }, "asistencias[3].inscripcion_id"],
    ["repetida", { inscripcion_id: alumnos[0]!.inscripcionId, estatus: "falta" }, "asistencias[3].inscripcion_id"],
  ];
  for (const [nombre, mala, campo] of casos) {
    const r = await m.maestroA.pedir<{ error: { codigo: string; detalles: { campo: string }[] } }>("PUT", `/api/grupos/${grupoId}/pase`, poner(grupoId, LUNES, [...buenas, mala]));
    assert.equal(r.estado, 400, nombre);
    assert.equal(r.cuerpo.error.detalles[0]!.campo, campo, nombre);
    assert.equal(await prisma.asistencia.count({ where: { grupo_id: grupoId, fecha: new Date(`${LUNES}T00:00:00.000Z`) } }), 0, `${nombre}: ni las buenas se guardaron`);
  }
  // Estatus o método inválidos, lista vacía de campos o cuerpo sin forma.
  for (const cuerpo of [poner(grupoId, LUNES, [{ inscripcion_id: alumnos[0]!.inscripcionId, estatus: "llegó tarde" }]), poner(grupoId, LUNES, [{ inscripcion_id: alumnos[0]!.inscripcionId, estatus: "presente", metodo: "huella" }]), { fecha: LUNES }, { fecha: LUNES, asistencias: "todos" }, { asistencias: [] }, poner(grupoId, LUNES, [{ inscripcion_id: "no-uuid", estatus: "presente" }]), { fecha: LUNES, asistencias: [], extra: 1 }]) {
    assert.equal((await m.maestroA.pedir("PUT", `/api/grupos/${grupoId}/pase`, cuerpo)).estado, 400, JSON.stringify(cuerpo).slice(0, 60));
  }
});

test("G1 idempotente: guardar lo mismo dos veces no cambia nada ni deja otro registro; corregir una fila deja su cambio; el método qr se guarda", async () => {
  const { grupoId, alumnos } = await grupoConAlumnos(3);
  const [a, b, c] = alumnos;
  const base: Entrada[] = [
    { inscripcion_id: a!.inscripcionId, estatus: "presente" },
    { inscripcion_id: b!.inscripcionId, estatus: "falta" },
    { inscripcion_id: c!.inscripcionId, estatus: "justificada", metodo: "qr" },
  ];
  const cambios = () => prisma.registro_cambio.findMany({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "asistencia", entidad_id: { in: [] as string[] } } });
  void cambios;
  const filasDe = () => prisma.asistencia.findMany({ where: { grupo_id: grupoId, fecha: new Date(`${LUNES}T00:00:00.000Z`) }, orderBy: { creado_en: "asc" } });
  const registro = async () => {
    const ids = (await filasDe()).map((f) => f.id);
    return prisma.registro_cambio.findMany({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "asistencia", entidad_id: { in: ids } }, orderBy: { creado_en: "asc" } });
  };

  const primero = await m.maestroA.pedir<Guardado>("PUT", `/api/grupos/${grupoId}/pase`, poner(grupoId, LUNES, base));
  assert.deepEqual([primero.estado, primero.cuerpo.creadas, primero.cuerpo.actualizadas, primero.cuerpo.sin_cambio], [200, 3, 0, 0]);
  const filas1 = await filasDe();
  assert.equal(filas1.length, 3);
  assert.deepEqual(filas1.map((f) => [f.estatus, f.metodo, f.registrado_por_usuario_id]), [["presente", "manual", m.usuarioMaestroA], ["falta", "manual", m.usuarioMaestroA], ["justificada", "qr", m.usuarioMaestroA]]);
  assert.equal((await registro()).length, 3, "una alta registrada por fila");

  const repetido = await m.maestroA.pedir<Guardado>("PUT", `/api/grupos/${grupoId}/pase`, poner(grupoId, LUNES, base));
  assert.deepEqual([repetido.cuerpo.creadas, repetido.cuerpo.actualizadas, repetido.cuerpo.sin_cambio], [0, 0, 3], "lo mismo otra vez no cambia nada");
  assert.deepEqual((await filasDe()).map((f) => [f.id, f.actualizado_en.getTime()]), filas1.map((f) => [f.id, f.actualizado_en.getTime()]), "ni siquiera tocó las filas");
  assert.equal((await registro()).length, 3, "ni deja otro registro de cambios");

  // Corregir: la falta de B era justificada. Un solo cambio, con su antes y su después; el método de C se cambia sin mover el estatus.
  const correccion = await m.admin.pedir<Guardado>("PUT", `/api/grupos/${grupoId}/pase`, poner(grupoId, LUNES, [{ inscripcion_id: b!.inscripcionId, estatus: "justificada" }, { inscripcion_id: c!.inscripcionId, estatus: "justificada", metodo: "manual" }]));
  assert.deepEqual([correccion.cuerpo.creadas, correccion.cuerpo.actualizadas, correccion.cuerpo.sin_cambio], [0, 2, 0]);
  const reg = await registro();
  assert.equal(reg.length, 5);
  const delB = reg.filter((r) => r.accion === "actualizar" && (r.antes as { estatus?: string } | null)?.estatus === "falta");
  assert.equal(delB.length, 1);
  assert.deepEqual([delB[0]!.antes, delB[0]!.despues, delB[0]!.usuario_id], [{ estatus: "falta" }, { estatus: "justificada" }, (await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: m.org.organizacionId, rol: "administrador" } })).id]);
  const final = await filasDe();
  assert.deepEqual(final.map((f) => [f.estatus, f.metodo]), [["presente", "manual"], ["justificada", "manual"], ["justificada", "manual"]]);
  // Nada de datos identificables en el registro de cambios.
  assert.ok(!JSON.stringify(reg).includes("Nina"));
});

test("G1 concurrencia real: DIEZ pases simultáneos del mismo grupo y fecha → una fila por inscripción, ningún error y un estado coherente (el de uno de los pases completos)", async () => {
  const { grupoId, alumnos } = await grupoConAlumnos(8);
  const estatus = ["presente", "falta", "justificada"] as const;
  const respuestas = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 === 0 ? m.maestroA : m.admin).pedir<Guardado>("PUT", `/api/grupos/${grupoId}/pase`, poner(grupoId, LUNES, alumnos.map((a) => ({ inscripcion_id: a.inscripcionId, estatus: estatus[i % 3]! })))),
    ),
  );
  assert.deepEqual(respuestas.map((r) => r.estado), Array(10).fill(200), "ninguno revienta por el índice único");
  const filas = await prisma.asistencia.findMany({ where: { grupo_id: grupoId, fecha: new Date(`${LUNES}T00:00:00.000Z`) } });
  assert.equal(filas.length, 8, "una sola fila por inscripción");
  assert.equal(new Set(filas.map((f) => f.inscripcion_id)).size, 8);
  assert.equal(new Set(filas.map((f) => f.estatus)).size, 1, "los ocho quedaron con el estatus de UN mismo pase: cada pase es atómico y se formaron en fila");
  assert.equal(respuestas.reduce((n, r) => n + r.cuerpo.creadas, 0), 8, "las filas se crearon una sola vez");
});

test("G1 SQL directo: la base no deja dos filas para la misma inscripción y fecha, ni asistencia de una inscripción de otra organización", async () => {
  const { grupoId, alumnos } = await grupoConAlumnos(1);
  const dia = new Date(`${LUNES}T00:00:00.000Z`);
  const fila = { organizacion_id: m.org.organizacionId, inscripcion_id: alumnos[0]!.inscripcionId, grupo_id: grupoId, fecha: dia, estatus: "presente" as const };
  await prisma.asistencia.create({ data: fila });
  await assert.rejects(prisma.asistencia.create({ data: { ...fila, estatus: "falta" } }), /Unique constraint|asistencia_inscripcion_fecha_key/);
  // Borrada lógicamente deja de contar: se puede volver a tomar ese día.
  await prisma.asistencia.updateMany({ where: { inscripcion_id: fila.inscripcion_id }, data: { eliminado_en: new Date() } });
  await prisma.asistencia.create({ data: { ...fila, estatus: "falta" } });
  const otra = await mundoDeOperacion(prisma, "Otra org del pase");
  try {
    await assert.rejects(prisma.asistencia.create({ data: { ...fila, fecha: new Date("2026-11-09T00:00:00.000Z"), organizacion_id: otra.org.organizacionId } }), (e: unknown) => (e as { code?: string }).code === "P2003");
  } finally {
    await otra.cerrar();
  }
});

test("G1 no-fuga entre organizaciones: el pase de un grupo de otra organización es 404 y no se ve su lista", async () => {
  const otra = await mundoDeOperacion(prisma, "Pase ajeno");
  try {
    const ajena = await otra.inscribir(otra.grupoA);
    assert.equal((await m.admin.get(`/api/grupos/${otra.grupoA}/pase?fecha=${LUNES}`)).estado, 404);
    assert.equal((await m.admin.pedir("PUT", `/api/grupos/${otra.grupoA}/pase`, poner(otra.grupoA, LUNES, [{ inscripcion_id: ajena.inscripcionId, estatus: "presente" }]))).estado, 404);
    // Y una inscripción ajena dentro de un grupo propio es una inscripción fuera de la lista.
    const { grupoId } = await grupoConAlumnos(1);
    const r = await m.admin.pedir("PUT", `/api/grupos/${grupoId}/pase`, poner(grupoId, LUNES, [{ inscripcion_id: ajena.inscripcionId, estatus: "presente" }]));
    assert.equal(r.estado, 400);
    assert.equal(await prisma.asistencia.count({ where: { inscripcion_id: ajena.inscripcionId } }), 0);
  } finally {
    await otra.cerrar();
  }
});

test("EG-03: una inscripción que cambió de grupo no se ofrece en el grupo NUEVO para una fecha en que el viejo ya pasó lista (antes: 500 por el índice único); el viejo la sigue mostrando y la puede corregir", async () => {
  // Dos grupos del mismo programa, sin instructor (no chocan con los de las demás pruebas), que sesionan los lunes y miércoles a las 11:40.
  const grupo = async (nombre: string) => {
    const g = await prisma.grupo.create({ data: { organizacion_id: m.org.organizacionId, programa_id: m.programaNorteId, nombre: `${nombre} ${randomUUID().slice(0, 6)}`, cupo_maximo: 40 } });
    for (const dia of [1, 3]) await prisma.grupo_horario.create({ data: { organizacion_id: m.org.organizacionId, grupo_id: g.id, dia_semana: dia, hora_inicio_min: 700, hora_fin_min: 750 } });
    return g.id;
  };
  const viejo = await grupo("Viejo");
  const nuevo = await grupo("Nuevo");
  const a = await m.inscribir(viejo, { nombre: "Cambia" });
  const b = await m.inscribir(viejo, { nombre: "Se queda" });
  const delNuevo = await m.inscribir(nuevo, { nombre: "Ya estaba" });
  assert.equal((await m.admin.pedir("PUT", `/api/grupos/${viejo}/pase`, poner(viejo, LUNES, [{ inscripcion_id: a.inscripcionId, estatus: "presente" }, { inscripcion_id: b.inscripcionId, estatus: "falta" }]))).estado, 200);
  assert.equal((await m.admin.post(`/api/inscripciones/${a.inscripcionId}/cambiar-grupo`, { grupo_id: nuevo })).estado, 200);
  // El grupo NUEVO, para el lunes anterior al cambio: `a` ya tiene su fila de ese día en el viejo, así que no está en su lista…
  const enNuevo = (await m.admin.get<Pase>(`/api/grupos/${nuevo}/pase?fecha=${LUNES}`)).cuerpo;
  assert.ok(!enNuevo.lista.some((f) => f.inscripcion_id === a.inscripcionId), "no se ofrece en el grupo nuevo");
  assert.ok(enNuevo.lista.some((f) => f.inscripcion_id === delNuevo.inscripcionId), "los del grupo nuevo sí");
  // …y guardarla ahí es un rechazo claro (400), nunca un 500.
  const r = await m.admin.pedir<{ error: { detalles: { campo: string }[] } }>("PUT", `/api/grupos/${nuevo}/pase`, poner(nuevo, LUNES, [{ inscripcion_id: a.inscripcionId, estatus: "falta" }]));
  assert.equal(r.estado, 400);
  assert.equal(r.cuerpo.error.detalles[0]!.campo, "asistencias[0].inscripcion_id");
  assert.equal(await prisma.asistencia.count({ where: { inscripcion_id: a.inscripcionId, fecha: new Date(`${LUNES}T00:00:00.000Z`) } }), 1, "sigue habiendo UNA fila de ese día");
  // El grupo viejo la sigue mostrando, con lo que se registró, y se puede corregir.
  const enViejo = (await m.admin.get<Pase>(`/api/grupos/${viejo}/pase?fecha=${LUNES}`)).cuerpo;
  assert.equal(enViejo.lista.find((f) => f.inscripcion_id === a.inscripcionId)?.estatus, "presente");
  assert.equal((await m.admin.pedir("PUT", `/api/grupos/${viejo}/pase`, poner(viejo, LUNES, [{ inscripcion_id: a.inscripcionId, estatus: "falta" }]))).estado, 200);
  // Una fecha en que NO tiene fila en otro grupo sí es del grupo nuevo (donde ahora está).
  const otroLunes = (await m.admin.get<Pase>(`/api/grupos/${nuevo}/pase?fecha=2026-11-09`)).cuerpo;
  assert.ok(otroLunes.lista.some((f) => f.inscripcion_id === a.inscripcionId), "una fecha sin fila en otro grupo sí se ofrece");
});
