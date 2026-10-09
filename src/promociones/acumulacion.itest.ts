// V2, decisión 6, contra la base: la cotización en vivo (GET /api/cotizador), la cotización GUARDADA (snapshot) y la INSCRIPCIÓN usan el mismo resolutor y concuerdan al
// centavo; la no acumulable que gana va sola (ni su cupo ni los de las acumulables se mezclan); y dos inscripciones a la vez por el último lugar de una no acumulable no
// dejan una combinación imposible. Cada prueba arma su propia organización (las promociones son de la organización).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarOrganizacion, sembrarPrograma } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada } from "../testutil/api.ts";

const AHORA = new Date("2026-11-10T18:00:00Z"); // martes 10 de noviembre, mediodía en la Ciudad de México
let prisma: PrismaPruebas;
let api: ApiLevantada;
before(() => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

interface Insc { id: string; descuento_inscripcion_aplicado: string; descuento_mensualidad_aplicado: string }
interface Promos {
  aplicadas: { promocion_id: string }[];
  inscripcion: { descuento_ahora: string; final_ahora: string };
  mensualidad: { descuento_ahora: string; final_ahora: string };
}

async function mundo() {
  const org = await sembrarOrganizacion(prisma, "Acumulacion");
  await sembrarEmbudo(prisma, org);
  const docs = await sembrarDocumentosLegales(prisma, org);
  const norte = org.sucursales[0]!.id;
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const admin = api.cliente();
  assert.equal((await admin.login(org.slug, u.correo, u.contrasena)).estado, 201);
  const p = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa", edadMin: 3, edadMax: 14, grupos: [{ nombre: "Grupo", cupoMaximo: 30, horarios: [[3, 480, 530]] }], precio: { inscripcion: "500.00", mensualidad: "1000.00" } });
  const promocion = async (nombre: string, o: { acumulable: boolean; prioridad: number; cupo?: number }, beneficios: { tipo: "descuento_inscripcion" | "descuento_mensualidad"; porcentaje: string }[]) => {
    const pr = await prisma.promocion.create({
      data: { organizacion_id: org.organizacionId, nombre, codigo: `${nombre}-${randomUUID().slice(0, 6)}`, vigencia_desde: new Date("2020-01-01"), acumulable: o.acumulable, prioridad: o.prioridad, ...(o.cupo !== undefined ? { cupo_maximo: o.cupo } : {}) },
    });
    for (const b of beneficios) await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: pr.id, tipo: b.tipo, modo: "porcentaje", valor: b.porcentaje } });
    return pr.id;
  };
  return {
    org,
    admin,
    programaId: p.id,
    grupoId: p.grupos[0]!.id,
    promocion,
    alumno: () => sembrarAlumno(prisma, org, { docs, sucursalId: norte, nacimiento: "2018-05-04" }),
    cotizador: async () => (await admin.get<{ programas: { promociones: Promos }[] }>(`/api/cotizador?vertical_id=${org.verticalId}&sucursal_id=${norte}&edad=8&fecha=2026-11-10`)).cuerpo.programas[0]!.promociones,
    guardada: async (a: { leadId: string; prospectoId: string }) => {
      const r = await admin.post<{ snapshot: { programa: { promociones: Promos } } }>(`/api/leads/${a.leadId}/cotizaciones`, { prospecto_id: a.prospectoId, programa_id: p.id });
      assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
      return r.cuerpo.snapshot.programa.promociones;
    },
    inscribir: (alumnoId: string) => admin.post<Insc>("/api/inscripciones", { alumno_id: alumnoId, grupo_id: p.grupos[0]!.id }),
    cupoUsado: async (id: string) => (await prisma.promocion.findFirstOrThrow({ where: { id } })).cupo_usado,
    aplicaciones: async (inscripcionId: string) => [...new Set((await prisma.promocion_aplicacion.findMany({ where: { inscripcion_id: inscripcionId } })).map((x) => x.promocion_id))].sort(),
  };
}

test("una no acumulable ganadora va SOLA: la cotización en vivo, la guardada y la inscripción coinciden al centavo y solo gasta el cupo de esa promoción", async () => {
  const m = await mundo();
  const n = await m.promocion("No acumulable", { acumulable: false, prioridad: 9 }, [{ tipo: "descuento_inscripcion", porcentaje: "30.00" }]);
  const a1 = await m.promocion("Suma uno", { acumulable: true, prioridad: 1 }, [{ tipo: "descuento_mensualidad", porcentaje: "10.00" }]);
  const a2 = await m.promocion("Suma dos", { acumulable: true, prioridad: 2 }, [{ tipo: "descuento_inscripcion", porcentaje: "5.00" }]);
  const alumno = await m.alumno();

  const enVivo = await m.cotizador();
  assert.deepEqual(enVivo.aplicadas.map((x) => x.promocion_id), [n]);
  assert.equal(enVivo.inscripcion.descuento_ahora, "150.00");
  assert.equal(enVivo.mensualidad.descuento_ahora, "0.00");

  const guardada = await m.guardada(alumno);
  assert.deepEqual(guardada, enVivo, "lo guardado es lo cotizado en vivo");

  const i = await m.inscribir(alumno.alumnoId);
  assert.equal(i.estado, 201, JSON.stringify(i.cuerpo));
  assert.equal(i.cuerpo.descuento_inscripcion_aplicado, guardada.inscripcion.descuento_ahora);
  assert.equal(i.cuerpo.descuento_mensualidad_aplicado, guardada.mensualidad.descuento_ahora);
  assert.deepEqual(await m.aplicaciones(i.cuerpo.id), [n]);
  assert.deepEqual([await m.cupoUsado(n), await m.cupoUsado(a1), await m.cupoUsado(a2)], [1, 0, 0], "las acumulables que perdieron no gastan su cupo");
});

test("las acumulables de mayor prioridad ganan JUNTAS y la no acumulable (que daba más) queda fuera: cotización e inscripción coinciden", async () => {
  const m = await mundo();
  const n = await m.promocion("No acumulable", { acumulable: false, prioridad: 1 }, [{ tipo: "descuento_inscripcion", porcentaje: "90.00" }]);
  const a1 = await m.promocion("Suma uno", { acumulable: true, prioridad: 5 }, [{ tipo: "descuento_mensualidad", porcentaje: "10.00" }]);
  const a2 = await m.promocion("Suma dos", { acumulable: true, prioridad: 4 }, [{ tipo: "descuento_inscripcion", porcentaje: "5.00" }]);
  const alumno = await m.alumno();
  const enVivo = await m.cotizador();
  assert.deepEqual(enVivo.aplicadas.map((x) => x.promocion_id), [a1, a2]);
  assert.equal(enVivo.inscripcion.descuento_ahora, "25.00");
  assert.equal(enVivo.mensualidad.descuento_ahora, "100.00");
  assert.deepEqual(await m.guardada(alumno), enVivo);
  const i = await m.inscribir(alumno.alumnoId);
  assert.equal(i.estado, 201);
  assert.deepEqual([i.cuerpo.descuento_inscripcion_aplicado, i.cuerpo.descuento_mensualidad_aplicado], ["25.00", "100.00"]);
  assert.deepEqual(await m.aplicaciones(i.cuerpo.id), [a1, a2].sort());
  assert.deepEqual([await m.cupoUsado(n), await m.cupoUsado(a1), await m.cupoUsado(a2)], [0, 1, 1]);
});

test("el último lugar de una no acumulable: la siguiente inscripción cae al grupo de acumulables (nunca una combinación) y la cotización en vivo ya no la ofrece", async () => {
  const m = await mundo();
  const n = await m.promocion("Con tope", { acumulable: false, prioridad: 9, cupo: 1 }, [{ tipo: "descuento_inscripcion", porcentaje: "30.00" }]);
  const a = await m.promocion("Suma", { acumulable: true, prioridad: 1 }, [{ tipo: "descuento_mensualidad", porcentaje: "10.00" }]);
  const primero = await m.alumno();
  const segundo = await m.alumno();
  const uno = await m.inscribir(primero.alumnoId);
  assert.equal(uno.cuerpo.descuento_inscripcion_aplicado, "150.00");
  assert.equal(uno.cuerpo.descuento_mensualidad_aplicado, "0.00", "con la no acumulable no se suma el 10 % de la acumulable");
  const enVivo = await m.cotizador();
  assert.deepEqual(enVivo.aplicadas.map((x) => x.promocion_id), [a], "agotada su cupo, la cotización ofrece lo que sigue");
  const dos = await m.inscribir(segundo.alumnoId);
  assert.equal(dos.estado, 201);
  assert.deepEqual([dos.cuerpo.descuento_inscripcion_aplicado, dos.cuerpo.descuento_mensualidad_aplicado], ["0.00", "100.00"]);
  assert.deepEqual([await m.cupoUsado(n), await m.cupoUsado(a)], [1, 1]);
});

test("CONCURRENCIA: dos inscripciones a la vez por el último lugar de la no acumulable — una se lleva la no acumulable, la otra el grupo de acumulables; el cupo nunca pasa de 1 ni se mezclan", async () => {
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const m = await mundo();
    const n = await m.promocion("Con tope", { acumulable: false, prioridad: 9, cupo: 1 }, [{ tipo: "descuento_inscripcion", porcentaje: "30.00" }]);
    const a = await m.promocion("Suma", { acumulable: true, prioridad: 1 }, [{ tipo: "descuento_mensualidad", porcentaje: "10.00" }]);
    const x = await m.alumno();
    const y = await m.alumno();
    const [rx, ry] = await Promise.all([m.inscribir(x.alumnoId), m.inscribir(y.alumnoId)]);
    assert.deepEqual([rx.estado, ry.estado], [201, 201], `${JSON.stringify(rx.cuerpo)} ${JSON.stringify(ry.cuerpo)}`);
    const resultados = [rx, ry].map((r) => `${r.cuerpo.descuento_inscripcion_aplicado}/${r.cuerpo.descuento_mensualidad_aplicado}`).sort();
    assert.deepEqual(resultados, ["0.00/100.00", "150.00/0.00"], `vuelta ${vuelta}: una con la no acumulable sola y la otra con las acumulables`);
    assert.equal(await m.cupoUsado(n), 1, "el cupo de la no acumulable no se pasa");
    assert.equal(await m.cupoUsado(a), 1, "la acumulable la usó solo quien no ganó la otra");
  }
});

test("no-fuga entre organizaciones: las promociones de otra escuela no compiten ni se aplican", async () => {
  const mia = await mundo();
  const otra = await mundo();
  await otra.promocion("De la otra escuela", { acumulable: false, prioridad: 99 }, [{ tipo: "descuento_inscripcion", porcentaje: "100.00" }]);
  const propia = await mia.promocion("Mía", { acumulable: true, prioridad: 1 }, [{ tipo: "descuento_inscripcion", porcentaje: "10.00" }]);
  const enVivo = await mia.cotizador();
  assert.deepEqual(enVivo.aplicadas.map((x) => x.promocion_id), [propia]);
  assert.equal(enVivo.inscripcion.descuento_ahora, "50.00");
});
