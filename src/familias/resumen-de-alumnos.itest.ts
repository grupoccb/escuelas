// R6a contra Postgres real y la app real: `GET /api/alumnos/resumen` — lo que la tarjeta de un alumno necesita (disciplina con su color, grupo, sucursal, asistencia y la
// situación de la cuenta), con el alcance de cada rol, sin importes, y sin fuga entre organizaciones. Reloj: miércoles 18 de noviembre de 2026, 12:00 en la Ciudad de México.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";
import { mundoDeOperacion, type MundoDeOperacion } from "../testutil/operacion.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import type { ProveedorEconomico } from "../expediente/proveedores.ts";
import { sembrarAlumno } from "../testutil/semilla.ts";
import { situacionDeCuenta } from "./resumen-de-alumnos.ts";

let prisma: PrismaPruebas;
let m: MundoDeOperacion;
let lia: { alumnoId: string; inscripcionId: string };
let sinNada: { alumnoId: string };
type Cuerpo = { datos: { alumno_id: string; inscripciones: { estatus: string; grupo: { nombre: string }; vertical: { nombre: string; color_marca: string | null }; sucursal: { nombre: string } }[]; asistencia_30_dias: number | null; cuenta: string | null }[] };

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeOperacion(prisma, "Resumen de alumnos");
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { color_marca: "#C0502B" } });
  lia = await m.inscribir(m.grupoA, { nombre: "Lía" });
  // Ventana del 20/10 al 18/11: dos presentes y una falta (66.7 %).
  for (const [fecha, estatus] of [["2026-10-21", "presente"], ["2026-11-02", "presente"], ["2026-11-09", "falta"], ["2026-08-01", "falta"]] as const) {
    await prisma.asistencia.create({ data: { organizacion_id: m.org.organizacionId, inscripcion_id: lia.inscripcionId, grupo_id: m.grupoA, fecha: new Date(`${fecha}T00:00:00Z`), estatus } });
  }
  sinNada = await sembrarAlumno(prisma, m.org, { nombre: "Sin inscripción", sucursalId: m.norte });
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const resumen = (c: typeof m.admin, ...ids: string[]) => c.get<Cuerpo>(`/api/alumnos/resumen?ids=${ids.join(",")}`);

test("R6a la situación de una cuenta sale de los importes en centavos: vencido gana a saldo; sin saldo, al corriente", () => {
  assert.equal(situacionDeCuenta("0.00", "0.00"), "al_corriente");
  assert.equal(situacionDeCuenta("500.00", "0.00"), "por_pagar");
  assert.equal(situacionDeCuenta("500.00", "0.01"), "con_vencido");
  assert.equal(situacionDeCuenta("0.00", "0.00"), "al_corriente");
});

test("R6a trae disciplina con su color, grupo, sucursal y el % de 30 días del expediente; un alumno sin inscripción sale con listas vacías", async () => {
  const r = await resumen(m.admin, lia.alumnoId, sinNada.alumnoId);
  assert.equal(r.estado, 200);
  const [a, b] = r.cuerpo.datos;
  assert.equal(a!.alumno_id, lia.alumnoId);
  assert.equal(a!.inscripciones.length, 1);
  assert.deepEqual([a!.inscripciones[0]!.estatus, a!.inscripciones[0]!.grupo.nombre, a!.inscripciones[0]!.vertical.color_marca], ["activa", "Norte A", "#C0502B"]);
  assert.equal(a!.asistencia_30_dias, 66.7);
  const exp = (await m.admin.get<{ operativo: { asistencia: { porcentaje_30_dias: number } } }>(`/api/alumnos/${lia.alumnoId}/expediente`)).cuerpo;
  assert.equal(a!.asistencia_30_dias, exp.operativo.asistencia.porcentaje_30_dias, "la tarjeta y el expediente dicen lo mismo");
  assert.deepEqual([b!.inscripciones, b!.asistencia_30_dias], [[], null]);
});

test("R6a la cuenta: sin el enchufe de finanzas no hay situación; con él, vencido / por pagar / al corriente, y NUNCA un importe", async () => {
  assert.equal((await resumen(m.admin, lia.alumnoId)).cuerpo.datos[0]!.cuenta, null, "el enchufe nulo dice «no disponible»");
  for (const [saldo, vencido, esperado] of [["540.00", "360.00", "con_vencido"], ["540.00", "0.00", "por_pagar"], ["0.00", "0.00", "al_corriente"]] as const) {
    const economico: ProveedorEconomico = { estadoDeCuenta: async () => ({ disponible: true, saldo, vencido, antiguedadCarteraVencidaDias: null }) };
    const api = levantarApi(prisma, { reloj: () => m.reloj.ahora, sesion: { duracionMs: 86_400_000, inactividadMs: 86_400_000 }, expediente: { economico } });
    try {
      const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "administrador" });
      const c = api.cliente();
      assert.equal((await c.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
      const r = await c.get<Cuerpo>(`/api/alumnos/resumen?ids=${lia.alumnoId}`);
      assert.equal(r.cuerpo.datos[0]!.cuenta, esperado);
      for (const importe of ["540.00", "360.00"]) assert.ok(!JSON.stringify(r.cuerpo).includes(importe), `no debe salir «${importe}»`);
    } finally {
      await api.cerrar();
    }
  }
});

test("R6a alcance: el maestro solo ve a sus alumnos y nunca la cuenta; el asesor de otra sucursal no ve al alumno; lo ajeno se omite, no es 403", async () => {
  const economico: ProveedorEconomico = { estadoDeCuenta: async () => ({ disponible: true, saldo: "10.00", vencido: "10.00", antiguedadCarteraVencidaDias: 3 }) };
  const api = levantarApi(prisma, { reloj: () => m.reloj.ahora, sesion: { duracionMs: 86_400_000, inactividadMs: 86_400_000 }, expediente: { economico } });
  try {
    const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "administrador" });
    const c = api.cliente();
    assert.equal((await c.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
    assert.equal((await c.get<Cuerpo>(`/api/alumnos/resumen?ids=${lia.alumnoId}`)).cuerpo.datos[0]!.cuenta, "con_vencido");
  } finally {
    await api.cerrar();
  }
  const delMaestro = await resumen(m.maestroA, lia.alumnoId, sinNada.alumnoId);
  assert.equal(delMaestro.estado, 200);
  assert.deepEqual(delMaestro.cuerpo.datos.map((d) => [d.alumno_id, d.cuenta]), [[lia.alumnoId, null]], "el alumno de otro grupo se omite");
  assert.deepEqual((await resumen(m.asesorSur, lia.alumnoId)).cuerpo.datos, [], "otra sucursal: se omite");
  assert.deepEqual((await resumen(m.admin, randomUUID())).cuerpo.datos, []);
});

test("R6a el filtro `vertical_id` de GET /api/alumnos deja a los alumnos con una inscripción vigente en esa disciplina y a nadie más", async () => {
  const idsDe = async (verticalId: string) => (await m.admin.get<{ datos: { id: string }[] }>(`/api/alumnos?vertical_id=${verticalId}&limite=100`)).cuerpo.datos.map((a) => a.id);
  assert.ok((await idsDe(m.org.verticalId)).includes(lia.alumnoId));
  assert.ok(!(await idsDe(m.org.verticalId)).includes(sinNada.alumnoId), "sin inscripción no pertenece a ninguna disciplina");
  assert.deepEqual(await idsDe(randomUUID()), []);
  assert.equal((await m.admin.get("/api/alumnos?vertical_id=no-es-uuid")).estado, 400);
});

test("R6a entradas inválidas: sin ids, ids que no son identificadores y más de 50 son 400", async () => {
  assert.equal((await m.admin.get("/api/alumnos/resumen")).estado, 400);
  assert.equal((await m.admin.get("/api/alumnos/resumen?ids=hola")).estado, 400);
  assert.equal((await m.admin.get(`/api/alumnos/resumen?ids=${Array.from({ length: 51 }, () => randomUUID()).join(",")}`)).estado, 400);
});

test("R6a no-fuga entre organizaciones: un alumno de otra organización no aparece", async () => {
  const otra = await mundoDeOperacion(prisma, "Resumen ajeno");
  try {
    const ajena = await otra.inscribir(otra.grupoA, { nombre: "Ajena" });
    assert.deepEqual((await resumen(m.admin, ajena.alumnoId)).cuerpo.datos, []);
    assert.deepEqual((await resumen(otra.admin, lia.alumnoId)).cuerpo.datos, []);
    assert.equal((await resumen(otra.admin, ajena.alumnoId)).cuerpo.datos.length, 1);
  } finally {
    await otra.cerrar();
  }
});
