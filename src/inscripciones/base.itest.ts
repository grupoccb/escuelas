// La BASE como última defensa del cupo y del dinero de la inscripción (regla de Eduardo): estos tests se SALTAN el código a propósito —escriben
// con el cliente de Prisma o con SQL directo, sin el candado del grupo ni las reglas de `inscribirAlumno`— y exigen que la base rechace.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarMotivoBaja, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let n = 0;

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Base inscripción");
});
after(async () => {
  await prisma.$disconnect();
});

async function grupoNuevo(cupo: number) {
  const p = await sembrarPrograma(prisma, org, { sucursalId: org.sucursales[0]!.id, nombre: `Programa ${++n}`, edadMin: 3, edadMax: 14, grupos: [{ nombre: `Grupo ${n}`, cupoMaximo: cupo, horarios: [[2, 960, 1020]] }] });
  return { programaId: p.id, grupoId: p.grupos[0]!.id };
}
const datos = (alumnoId: string, g: { programaId: string; grupoId: string }, extra: Record<string, unknown> = {}) => ({
  organizacion_id: org.organizacionId, alumno_id: alumnoId, programa_id: g.programaId, grupo_id: g.grupoId,
  fecha_inscripcion: new Date("2026-10-20"), fecha_inicio: new Date("2026-10-20"), precio_inscripcion_aplicado: "100.00", precio_mensualidad_aplicado: "200.00", dia_corte_pago: 20, ...extra,
});
const alumno = () => sembrarAlumno(prisma, org, {});
/** Los campos que la base exige según el estatus (baja: motivo y fecha; congelada: desde cuándo). */
const conEstatus = async (extra: Record<string, unknown>): Promise<Record<string, unknown>> => ({
  ...(extra["estatus"] === "baja" ? { motivo_baja_id: await sembrarMotivoBaja(prisma, org), fecha_baja: new Date("2026-10-21") } : {}),
  ...(extra["estatus"] === "congelada" ? { congelada_desde: new Date("2026-10-21") } : {}),
  ...extra,
});
const inscribirDirecto = async (g: { programaId: string; grupoId: string }, extra: Record<string, unknown> = {}) => prisma.inscripcion.create({ data: datos((await alumno()).alumnoId, g, await conEstatus(extra)) as never });

test("SQL directo: más inscripciones activas que el cupo del grupo → la base lo rechaza (y las congeladas, bajas y borradas no cuentan)", async () => {
  const g = await grupoNuevo(2);
  await inscribirDirecto(g);
  await inscribirDirecto(g);
  await assert.rejects(inscribirDirecto(g), /inscripcion_cupo_maximo|no tiene lugares/);
  // Congelada, baja y borrada no ocupan: caben.
  await inscribirDirecto(g, { estatus: "congelada" });
  await inscribirDirecto(g, { estatus: "baja", fecha_baja: new Date("2026-10-21") });
  await inscribirDirecto(g, { eliminado_en: new Date() });
  assert.equal(await prisma.inscripcion.count({ where: { grupo_id: g.grupoId, estatus: "activa", eliminado_en: null } }), 2);
});

test("SQL directo: reactivar una congelada o mover una activa a un grupo LLENO también lo rechaza la base", async () => {
  const g = await grupoNuevo(1);
  const h = await grupoNuevo(5);
  await inscribirDirecto(g);
  const congelada = await inscribirDirecto(g, { estatus: "congelada" });
  await assert.rejects(prisma.inscripcion.update({ where: { id: congelada.id }, data: { estatus: "activa" } }), /inscripcion_cupo_maximo|no tiene lugares/);
  const enOtro = await inscribirDirecto(h);
  await assert.rejects(prisma.inscripcion.update({ where: { id: enOtro.id }, data: { grupo_id: g.grupoId } }), /inscripcion_cupo_maximo|no tiene lugares/);
  // Revivir una borrada lógicamente cuenta como ocupar un lugar.
  const borrada = await inscribirDirecto(g, { eliminado_en: new Date() });
  await assert.rejects(prisma.inscripcion.update({ where: { id: borrada.id }, data: { eliminado_en: null } }), /inscripcion_cupo_maximo|no tiene lugares/);
  // Con lugar, sí se puede.
  await prisma.inscripcion.update({ where: { id: enOtro.id }, data: { grupo_id: h.grupoId } });
});

test("bajar el cupo de un grupo ya lleno no rompe a sus inscritos, y editarles otra columna no se rechaza; pero nadie más entra", async () => {
  const g = await grupoNuevo(3);
  const a = await inscribirDirecto(g);
  await inscribirDirecto(g);
  await inscribirDirecto(g);
  await prisma.grupo.update({ where: { id: g.grupoId }, data: { cupo_maximo: 1 } });
  await prisma.inscripcion.update({ where: { id: a.id }, data: { dia_corte_pago: 5 } });
  await assert.rejects(inscribirDirecto(g), /inscripcion_cupo_maximo|no tiene lugares/);
});

test("CONCURRENCIA por SQL directo, sin el candado del código: 12 altas simultáneas a un grupo de 3 lugares → exactamente 3 entran", async () => {
  const g = await grupoNuevo(3);
  const alumnos = await Promise.all(Array.from({ length: 12 }, () => alumno()));
  const rs = await Promise.allSettled(alumnos.map((a) => prisma.inscripcion.create({ data: datos(a.alumnoId, g) as never })));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 3);
  for (const r of rs) if (r.status === "rejected") assert.match(String(r.reason), /inscripcion_cupo_maximo|no tiene lugares/);
  assert.equal(await prisma.inscripcion.count({ where: { grupo_id: g.grupoId, estatus: "activa" } }), 3);
});

test("el mismo alumno no puede tener dos inscripciones ACTIVAS en el grupo, aunque lleguen a la vez; congelada o de baja sí (historial)", async () => {
  const g = await grupoNuevo(10);
  const a = await alumno();
  const rs = await Promise.allSettled([1, 2, 3, 4].map(() => prisma.inscripcion.create({ data: datos(a.alumnoId, g) as never })));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
  await prisma.inscripcion.create({ data: datos(a.alumnoId, g, await conEstatus({ estatus: "baja", fecha_baja: new Date("2026-10-25") })) as never });
  await prisma.inscripcion.create({ data: datos(a.alumnoId, g, await conEstatus({ estatus: "congelada" })) as never });
});

test("el dinero de la inscripción: importes negativos, descuentos mayores que el precio, día de corte fuera de 1–31 y baja sin fecha los rechaza la base", async () => {
  const g = await grupoNuevo(10);
  const crear = async (extra: Record<string, unknown>) => prisma.inscripcion.create({ data: datos((await alumno()).alumnoId, g, extra) as never });
  await assert.rejects(crear({ precio_inscripcion_aplicado: "-1.00" }), /inscripcion_precios_check/);
  await assert.rejects(crear({ precio_mensualidad_aplicado: "-0.01" }), /inscripcion_precios_check/);
  await assert.rejects(crear({ descuento_inscripcion_aplicado: "100.01" }), /inscripcion_precios_check/);
  await assert.rejects(crear({ descuento_mensualidad_aplicado: "200.01" }), /inscripcion_precios_check/);
  await assert.rejects(crear({ descuento_mensualidad_aplicado: "-1.00" }), /inscripcion_precios_check/);
  await assert.rejects(crear({ precio_inscripcion_aplicado: "12345678901.00" }), /out of range|numeric|valor/i);
  await assert.rejects(crear({ dia_corte_pago: 0 }), /inscripcion_dia_corte_check/);
  await assert.rejects(crear({ dia_corte_pago: 32 }), /inscripcion_dia_corte_check/);
  await assert.rejects(crear({ meses_gratis_aplicados: -1 }), /inscripcion_meses_check/);
  const motivo = await sembrarMotivoBaja(prisma, org);
  await assert.rejects(crear({ estatus: "baja", motivo_baja_id: motivo }), /inscripcion_baja_check/);
  await assert.rejects(crear({ estatus: "baja", fecha_baja: new Date("2026-10-25") }), /inscripcion_motivo_baja_check/, "una baja sin motivo no existe");
  await assert.rejects(crear({ motivo_baja_id: motivo }), /inscripcion_motivo_baja_check/, "el motivo solo existe en una baja");
  await assert.rejects(crear({ estatus: "congelada" }), /inscripcion_congelada_check/);
  await assert.rejects(crear({ congelada_desde: new Date("2026-10-25") }), /inscripcion_congelada_check/);
  await assert.rejects(crear({ fecha_baja: new Date("2026-10-25") }), /inscripcion_baja_check/);
  await assert.rejects(crear({ estatus: "baja", fecha_baja: new Date("2026-10-01"), motivo_baja_id: motivo }), /inscripcion_baja_check/);
  await crear({ descuento_inscripcion_aplicado: "100.00", descuento_mensualidad_aplicado: "200.00", dia_corte_pago: 31 });
});

test("EF-04: el precio congelado y lo que valió cada promoción no se modifican después de inscribir, y el grupo tiene que ser del programa de la inscripción — aunque el código lo olvide", async () => {
  const g = await grupoNuevo(10);
  const otroPrograma = await grupoNuevo(10);
  const i = await inscribirDirecto(g);
  const cambiar = (data: Record<string, unknown>) => prisma.inscripcion.update({ where: { id: i.id }, data: data as never });
  for (const [campo, valor] of [
    ["precio_inscripcion_aplicado", "1.00"],
    ["precio_mensualidad_aplicado", "1.00"],
    ["descuento_inscripcion_aplicado", "10.00"],
    ["descuento_mensualidad_aplicado", "10.00"],
    ["meses_gratis_aplicados", 3],
    ["meses_pagados_por_adelantado", 3],
    ["fecha_inscripcion", new Date("2026-09-01")],
    ["programa_id", otroPrograma.programaId],
    ["alumno_id", (await alumno()).alumnoId],
  ] as const) {
    await assert.rejects(cambiar({ [campo]: valor }), /inscripcion_precio_congelado/, campo);
  }
  const intacta = await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } });
  assert.equal(intacta.precio_mensualidad_aplicado.toFixed(2), "200.00");
  // Lo que sí cambia (F5): estatus, grupo, día de corte y baja lógica; y volver a escribir el MISMO valor no es un cambio.
  await cambiar({ precio_inscripcion_aplicado: "100.00", dia_corte_pago: 7 });
  await cambiar({ estatus: "congelada", congelada_desde: new Date("2026-10-21") });
  await cambiar({ estatus: "activa", congelada_desde: null });
  const mismoPrograma = await sembrarPrograma(prisma, org, { sucursalId: org.sucursales[0]!.id, nombre: `Mismo ${++n}`, edadMin: 3, edadMax: 14, grupos: [{ nombre: "A", cupoMaximo: 5, horarios: [[3, 960, 1020]] }, { nombre: "B", cupoMaximo: 5, horarios: [[4, 960, 1020]] }] });
  const j = await prisma.inscripcion.create({ data: datos((await alumno()).alumnoId, { programaId: mismoPrograma.id, grupoId: mismoPrograma.grupos[0]!.id }) as never });
  await prisma.inscripcion.update({ where: { id: j.id }, data: { grupo_id: mismoPrograma.grupos[1]!.id } });
  // El grupo es del programa: ni al insertar ni al mover a un grupo de OTRO programa.
  await assert.rejects(prisma.inscripcion.create({ data: datos((await alumno()).alumnoId, { programaId: otroPrograma.programaId, grupoId: g.grupoId }) as never }), /inscripcion_programa_del_grupo/);
  await assert.rejects(prisma.inscripcion.update({ where: { id: j.id }, data: { grupo_id: g.grupoId } }), /inscripcion_programa_del_grupo/);
  // Lo que valió una promoción al inscribir tampoco cambia; su estatus y su entrega sí.
  const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "Congelada", codigo: `EF04${Date.now()}`, vigencia_desde: new Date("2020-01-01"), activo: false } });
  const b = await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "descuento_mensualidad", modo: "porcentaje", valor: "10.00" } });
  const a = await prisma.promocion_aplicacion.create({ data: { organizacion_id: org.organizacionId, inscripcion_id: i.id, promocion_id: promo.id, beneficio_id: b.id, descuento: "20.00", meses_gratis: 1 } });
  await assert.rejects(prisma.promocion_aplicacion.update({ where: { id: a.id }, data: { descuento: "0.00" } }), /promocion_aplicacion_monto_congelado/);
  await assert.rejects(prisma.promocion_aplicacion.update({ where: { id: a.id }, data: { meses_gratis: 12 } }), /promocion_aplicacion_monto_congelado/);
  await assert.rejects(prisma.promocion_aplicacion.update({ where: { id: a.id }, data: { inscripcion_id: j.id } }), /promocion_aplicacion_monto_congelado/);
  await prisma.promocion_aplicacion.update({ where: { id: a.id }, data: { estatus: "entregado", fecha_entrega: new Date() } });
});

test("la aplicación de una promoción: descuento y meses no negativos, y la inscripción tiene que existir en la MISMA organización", async () => {
  const g = await grupoNuevo(10);
  const i = await inscribirDirecto(g);
  const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "P", codigo: `BASE${Date.now()}`, vigencia_desde: new Date("2020-01-01"), activo: false } });
  const b = await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "producto_gratis", modo: "total" } });
  const base = { organizacion_id: org.organizacionId, inscripcion_id: i.id, promocion_id: promo.id, beneficio_id: b.id };
  await assert.rejects(prisma.promocion_aplicacion.create({ data: { ...base, descuento: "-1.00" } }), /promocion_aplicacion_montos_check/);
  await assert.rejects(prisma.promocion_aplicacion.create({ data: { ...base, meses_gratis: -1 } }), /promocion_aplicacion_montos_check/);
  const ajena = await sembrarOrganizacion(prisma, "Base ajena");
  await assert.rejects(prisma.promocion_aplicacion.create({ data: { ...base, organizacion_id: ajena.organizacionId } }), /Foreign key/);
});
