// C9: la lista de espera de los grupos llenos contra Postgres real: alta atómica con posiciones 1..N sin huecos ni
// repetidos bajo concurrencia, quitar y mover, y `ofrecerLugarLiberado` (la función que F5 invocará).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { altaConCandado, altaListaEspera, cerrarEntrada, cerrarEntradaDe, moverEnListaEspera, ofrecerLugarLiberado } from "./lista-espera.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

interface Mundo {
  org: OrganizacionDePrueba;
  db: BaseDatos;
  grupoId: string;
  grupoSinListaId: string;
  /** Crea una familia (lead + prospecto) y devuelve sus ids. */
  familia(nombre?: string): Promise<{ leadId: string; prospectoId: string }>;
}

async function mundo(nombre = "Lista de espera"): Promise<Mundo> {
  const org = await sembrarOrganizacion(prisma, nombre);
  const p = await sembrarPrograma(prisma, org, {
    sucursalId: org.sucursales[0]!.id,
    nombre: "Programa P",
    edadMin: 3,
    edadMax: 12,
    grupos: [
      { nombre: "Grupo lleno", cupoMaximo: 2, permiteListaEspera: true, horarios: [[1, 960, 1020]] },
      { nombre: "Grupo sin lista", cupoMaximo: 2, permiteListaEspera: false, horarios: [[2, 960, 1020]] },
    ],
  });
  let n = 0;
  return {
    org,
    db: conAlcance(prisma, org.organizacionId),
    grupoId: p.grupos[0]!.id,
    grupoSinListaId: p.grupos[1]!.id,
    async familia(nombreProspecto = `Niño ${++n}`) {
      const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: org.sucursales[0]!.id, etapa_id: org.etapaInicialId, nombre_contacto: "Mamá", telefono: `+5255${String(10_000_000 + Math.floor(Math.random() * 80_000_000))}` } });
      const prospecto = await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, vertical_interes_id: org.verticalId, nombre: nombreProspecto, edad_declarada: 8, origen: "asesor" } });
      return { leadId: lead.id, prospectoId: prospecto.id };
    },
  };
}

const posiciones = async (m: Mundo, grupoId = m.grupoId) =>
  (await m.db.lista_espera.findMany({ where: { grupo_id: grupoId, estatus: { in: ["esperando", "ofrecido"] } }, orderBy: { posicion: "asc" }, select: { posicion: true, estatus: true, prospecto_id: true } }));

test("el alta pone a cada familia al final, en orden de llegada; repetirla no duplica", async () => {
  const m = await mundo();
  const [a, b, c] = [await m.familia(), await m.familia(), await m.familia()];
  const ra = await altaConCandado(m.db, { grupoId: m.grupoId, ...a });
  const rb = await altaConCandado(m.db, { grupoId: m.grupoId, ...b });
  const rc = await altaConCandado(m.db, { grupoId: m.grupoId, ...c });
  assert.deepEqual([ra, rb, rc].map((r) => r.ok && [r.creada, r.entrada.posicion, r.entrada.estatus]), [[true, 1, "esperando"], [true, 2, "esperando"], [true, 3, "esperando"]]);
  const otraVez = await altaConCandado(m.db, { grupoId: m.grupoId, ...b });
  assert.deepEqual(otraVez.ok && [otraVez.creada, otraVez.entrada.posicion, otraVez.entrada.id], [false, 2, rb.ok && rb.entrada.id]);
  assert.equal(await m.db.lista_espera.count({ where: { grupo_id: m.grupoId } }), 3);
});

test("rechaza lo que no se puede: un grupo sin lista de espera, inexistente, inactivo o un prospecto de otro lead", async () => {
  const m = await mundo();
  const a = await m.familia();
  const b = await m.familia();
  assert.deepEqual(await altaConCandado(m.db, { grupoId: m.grupoSinListaId, ...a }), { ok: false, motivo: "sin_lista_de_espera" });
  await assert.rejects(altaConCandado(m.db, { grupoId: randomUUID(), ...a }), RangeError, "sin grupo no hay organización para el candado");
  assert.deepEqual(await altaConCandado(m.db, { grupoId: m.grupoId, leadId: a.leadId, prospectoId: b.prospectoId }), { ok: false, motivo: "prospecto_ajeno" });
  await prisma.grupo.update({ where: { id: m.grupoId }, data: { activo: false } });
  assert.deepEqual(await altaConCandado(m.db, { grupoId: m.grupoId, ...a }), { ok: false, motivo: "grupo_inexistente" });
  assert.equal(await m.db.lista_espera.count(), 0);
});

test("CONCURRENCIA: 10 altas simultáneas dan las posiciones 1..10 sin huecos ni repetidos (forzando que todas lean lo mismo)", async () => {
  const m = await mundo();
  const familias = await Promise.all(Array.from({ length: 10 }, () => m.familia()));
  // Cada alta lee la posición máxima y espera a que todas hayan leído: sin candado, las 10 calcularían la posición 1.
  const barrera = new Barrera(10);
  const raiz = conGanchos(prisma, { modelo: "lista_espera", operacion: "aggregate", despues: () => barrera.esperar(250) });
  const db = conAlcance(raiz, m.org.organizacionId);
  const rs = await Promise.all(familias.map((f) => altaConCandado(db, { grupoId: m.grupoId, ...f })));
  assert.ok(rs.every((r) => r.ok && r.creada), JSON.stringify(rs.filter((r) => !r.ok || !r.creada)));
  const guardadas = await posiciones(m);
  assert.deepEqual(guardadas.map((p) => p.posicion), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(guardadas.map((p) => p.prospecto_id)).size, 10);
  assert.equal(barrera.completa, false, "el candado las puso en fila: nunca coincidieron en la lectura (si coincidieran, el candado no sirve)");
});

test("CONCURRENCIA sin candado: aunque alguien se salte el candado, la base NO deja repetir una posición (índice único)", async () => {
  const m = await mundo();
  const familias = await Promise.all(Array.from({ length: 6 }, () => m.familia()));
  const barrera = new Barrera(6);
  const raiz = conGanchos(prisma, { modelo: "lista_espera", operacion: "aggregate", despues: () => barrera.esperar(3000) });
  const db = conAlcance(raiz, m.org.organizacionId);
  const rs = await Promise.allSettled(familias.map((f) => db.$transaction((tx) => altaListaEspera(tx, { grupoId: m.grupoId, ...f }))));
  assert.equal(barrera.completa, true, "las seis leyeron la misma posición máxima a la vez");
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1, "una sola ganó la posición 1");
  for (const r of rs.filter((x): x is PromiseRejectedResult => x.status === "rejected")) assert.ok(esViolacionUnica(r.reason), String(r.reason));
  assert.deepEqual((await posiciones(m)).map((p) => p.posicion), [1]);
});

test("CONCURRENCIA: la misma familia apuntada cinco veces a la vez queda UNA vez", async () => {
  const m = await mundo();
  const f = await m.familia();
  const rs = await Promise.all(Array.from({ length: 5 }, () => altaConCandado(m.db, { grupoId: m.grupoId, ...f })));
  assert.equal(rs.filter((r) => r.ok && r.creada).length, 1);
  assert.deepEqual((await posiciones(m)).map((p) => p.posicion), [1]);
});

test("la misma familia puede estar en la lista de DOS grupos; la posición es por grupo", async () => {
  const m = await mundo();
  const p2 = await sembrarPrograma(prisma, m.org, { sucursalId: m.org.sucursales[0]!.id, nombre: "Otro programa", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Otro lleno", cupoMaximo: 1, permiteListaEspera: true, horarios: [[3, 960, 1020]] }] });
  const a = await m.familia();
  const b = await m.familia();
  await altaConCandado(m.db, { grupoId: m.grupoId, ...a });
  await altaConCandado(m.db, { grupoId: m.grupoId, ...b });
  const r = await altaConCandado(m.db, { grupoId: p2.grupos[0]!.id, ...b });
  assert.deepEqual(r.ok && r.entrada.posicion, 1);
});

test("quitar a alguien recorre a los demás (sin huecos) y no borra nada; una cerrada ya no se quita ni se mueve", async () => {
  const m = await mundo();
  const fs = await Promise.all([m.familia(), m.familia(), m.familia(), m.familia()]);
  const altas = [];
  for (const f of fs) altas.push(await altaConCandado(m.db, { grupoId: m.grupoId, ...f }));
  const ids = altas.map((r) => (r.ok ? r.entrada.id : ""));
  const q = await cerrarEntrada(m.db, ids[1]!);
  assert.deepEqual(q.ok && [q.entrada.estatus, q.entrada.posicion], ["cancelado", 2], "conserva su posición como historial");
  assert.deepEqual((await posiciones(m)).map((p) => p.posicion), [1, 2, 3]);
  assert.deepEqual((await posiciones(m)).map((p) => p.prospecto_id), [fs[0]!.prospectoId, fs[2]!.prospectoId, fs[3]!.prospectoId]);
  assert.equal(await m.db.lista_espera.count({ where: { grupo_id: m.grupoId } }), 4, "soft: la fila sigue");
  assert.deepEqual(await cerrarEntrada(m.db, ids[1]!), { ok: false, motivo: "ya_cerrada" });
  assert.deepEqual(await moverEnListaEspera(m.db, ids[1]!, 1), { ok: false, motivo: "ya_cerrada" });
  assert.deepEqual(await cerrarEntrada(m.db, randomUUID()), { ok: false, motivo: "no_existe" });
  // Quitar y volver a apuntar: queda al final.
  const de = await altaConCandado(m.db, { grupoId: m.grupoId, ...fs[1]! });
  assert.deepEqual(de.ok && [de.creada, de.entrada.posicion], [true, 4]);
});

test("mover cambia el lugar de alguien y recorre a los demás; fuera de rango se rechaza", async () => {
  const m = await mundo();
  const fs = await Promise.all([m.familia(), m.familia(), m.familia(), m.familia()]);
  const ids: string[] = [];
  for (const f of fs) {
    const r = await altaConCandado(m.db, { grupoId: m.grupoId, ...f });
    ids.push(r.ok ? r.entrada.id : "");
  }
  const orden = async () => (await posiciones(m)).map((p) => fs.findIndex((f) => f.prospectoId === p.prospecto_id));
  assert.deepEqual(await orden(), [0, 1, 2, 3]);
  const sube = await moverEnListaEspera(m.db, ids[3]!, 1);
  assert.deepEqual(sube.ok && sube.entrada.posicion, 1);
  assert.deepEqual(await orden(), [3, 0, 1, 2]);
  await moverEnListaEspera(m.db, ids[3]!, 4);
  assert.deepEqual(await orden(), [0, 1, 2, 3]);
  await moverEnListaEspera(m.db, ids[0]!, 3);
  assert.deepEqual(await orden(), [1, 2, 0, 3]);
  await moverEnListaEspera(m.db, ids[0]!, 3); // a donde ya está: no cambia nada
  assert.deepEqual(await orden(), [1, 2, 0, 3]);
  assert.deepEqual((await posiciones(m)).map((p) => p.posicion), [1, 2, 3, 4]);
  for (const mala of [0, 5, -1, 1.5]) assert.deepEqual(await moverEnListaEspera(m.db, ids[0]!, mala), { ok: false, motivo: "fuera_de_rango" }, String(mala));
});

test("ofrecerLugarLiberado: marca como ofrecido al primero de la fila, le da vencimiento y deja una tarea para el asesor", async () => {
  const m = await mundo();
  const fs = await Promise.all([m.familia("Primera"), m.familia("Segunda")]);
  for (const f of fs) await altaConCandado(m.db, { grupoId: m.grupoId, ...f });
  const ahora = new Date("2026-10-08T20:00:00Z");
  const oferta = await ofrecerLugarLiberado(m.db, m.grupoId, { ahora });
  assert.ok(oferta);
  assert.deepEqual([oferta.entrada.prospectoId, oferta.entrada.estatus, oferta.entrada.posicion], [fs[0]!.prospectoId, "ofrecido", 1]);
  assert.equal(oferta.entrada.venceEn!.toISOString(), "2026-10-10T20:00:00.000Z", "48 horas por defecto");
  const fila = await m.db.lista_espera.findFirstOrThrow({ where: { prospecto_id: fs[0]!.prospectoId } });
  assert.deepEqual([fila.estatus, fila.ofrecido_en!.toISOString()], ["ofrecido", ahora.toISOString()]);
  const tarea = await m.db.tarea_asesor.findFirstOrThrow({ where: { id: oferta.tareaId } });
  assert.equal(tarea.tipo, "lista_espera_lugar_liberado");
  assert.equal(tarea.lead_id, fs[0]!.leadId);
  assert.equal(tarea.estado, "pendiente");
  assert.match(tarea.descripcion, /Se liberó un lugar en el grupo «Grupo lleno» \(lunes de 16:00 a 17:00\)\. Le toca a Primera \(posición 1\)/);
  assert.match(tarea.descripcion, /antes del 10 oct 2026, 2:00 p.m./i);
  assert.equal(tarea.vence_en!.toISOString(), "2026-10-10T20:00:00.000Z");
  // No manda ningún mensaje al contacto: solo la tarea.
  assert.equal(await m.db.mensaje.count(), 0);
});

test("ofrecerLugarLiberado: la segunda llamada ofrece al siguiente (el ofrecido ya no cuenta); sin nadie esperando devuelve null", async () => {
  const m = await mundo();
  const fs = await Promise.all([m.familia(), m.familia()]);
  for (const f of fs) await altaConCandado(m.db, { grupoId: m.grupoId, ...f });
  const a = await ofrecerLugarLiberado(m.db, m.grupoId);
  const b = await ofrecerLugarLiberado(m.db, m.grupoId);
  assert.deepEqual([a!.entrada.prospectoId, b!.entrada.prospectoId], [fs[0]!.prospectoId, fs[1]!.prospectoId]);
  assert.equal(await ofrecerLugarLiberado(m.db, m.grupoId), null);
  assert.equal(await m.db.tarea_asesor.count({ where: { tipo: "lista_espera_lugar_liberado" } }), 2);
  // Un grupo que nadie espera.
  assert.equal(await ofrecerLugarLiberado(m.db, m.grupoSinListaId), null);
});

test("ofrecerLugarLiberado usa las horas de la configuración de la organización", async () => {
  const m = await mundo();
  await fijarConfiguracion(prisma, m.org.organizacionId, { lista_espera_oferta_horas: 6 });
  await altaConCandado(m.db, { grupoId: m.grupoId, ...(await m.familia()) });
  const ahora = new Date("2026-10-08T20:00:00Z");
  const o = await ofrecerLugarLiberado(m.db, m.grupoId, { ahora });
  assert.equal(o!.entrada.venceEn!.toISOString(), "2026-10-09T02:00:00.000Z");
  await assert.rejects(fijarConfiguracion(prisma, m.org.organizacionId, { lista_espera_oferta_horas: 0 }), /configuracion_lista_espera_horas_check/);
});

test("CONCURRENCIA: tres lugares liberados a la vez se ofrecen a TRES familias distintas, nunca a la misma", async () => {
  const m = await mundo();
  const fs = await Promise.all(Array.from({ length: 5 }, () => m.familia()));
  for (const f of fs) await altaConCandado(m.db, { grupoId: m.grupoId, ...f });
  const rs = await Promise.all([1, 2, 3].map(() => ofrecerLugarLiberado(m.db, m.grupoId)));
  assert.ok(rs.every((r) => r !== null));
  const ofrecidos = rs.map((r) => r!.entrada.prospectoId);
  assert.equal(new Set(ofrecidos).size, 3);
  assert.deepEqual(new Set(ofrecidos), new Set(fs.slice(0, 3).map((f) => f.prospectoId)), "las tres primeras de la fila");
  assert.equal(await m.db.tarea_asesor.count({ where: { tipo: "lista_espera_lugar_liberado" } }), 3);
  assert.deepEqual((await posiciones(m)).map((p) => [p.posicion, p.estatus]), [[1, "ofrecido"], [2, "ofrecido"], [3, "ofrecido"], [4, "esperando"], [5, "esperando"]]);
});

test("una familia a la que se le ofreció un lugar no se mueve; al inscribirse sale de la fila y las demás avanzan (el punto de enchufe de F3)", async () => {
  const m = await mundo();
  const fs = await Promise.all([m.familia(), m.familia(), m.familia()]);
  const ids: string[] = [];
  for (const f of fs) ids.push((await altaConCandado(m.db, { grupoId: m.grupoId, ...f }) as { entrada: { id: string } }).entrada.id);
  await ofrecerLugarLiberado(m.db, m.grupoId);
  assert.deepEqual(await moverEnListaEspera(m.db, ids[0]!, 2), { ok: false, motivo: "ya_ofrecida" });
  const cierre = await cerrarEntradaDe(m.db, m.grupoId, fs[0]!.prospectoId, "inscrito");
  assert.deepEqual(cierre?.ok && cierre.entrada.estatus, "inscrito");
  assert.deepEqual((await posiciones(m)).map((p) => [p.posicion, p.prospecto_id]), [[1, fs[1]!.prospectoId], [2, fs[2]!.prospectoId]]);
  assert.equal(await cerrarEntradaDe(m.db, m.grupoId, fs[0]!.prospectoId, "inscrito"), null, "ya no está en la fila");
});

test("no-fuga: lo de una organización no se ve ni se toca desde otra", async () => {
  const a = await mundo("Lista A");
  const b = await mundo("Lista B");
  const fa = await a.familia();
  const r = await altaConCandado(a.db, { grupoId: a.grupoId, ...fa });
  const id = r.ok ? r.entrada.id : "";
  assert.equal(await b.db.lista_espera.count(), 0);
  assert.deepEqual(await cerrarEntrada(b.db, id), { ok: false, motivo: "no_existe" });
  assert.deepEqual(await moverEnListaEspera(b.db, id, 1), { ok: false, motivo: "no_existe" });
  await assert.rejects(ofrecerLugarLiberado(b.db, a.grupoId), RangeError);
  await assert.rejects(altaConCandado(b.db, { grupoId: a.grupoId, ...fa }), RangeError);
  assert.equal((await a.db.lista_espera.findFirstOrThrow({ where: { id } })).estatus, "esperando");
  // Y la base no deja mezclar organizaciones (llaves compuestas).
  await assert.rejects(prisma.lista_espera.create({ data: { organizacion_id: b.org.organizacionId, grupo_id: a.grupoId, prospecto_id: fa.prospectoId, lead_id: fa.leadId, posicion: 1 } }), /foreign key|clave foránea|lista_espera_/i);
});

test("la base: una viva por (grupo, prospecto), posición única y positiva, oferta coherente", async () => {
  const m = await mundo();
  const f = await m.familia();
  const g = await m.familia();
  const base = { organizacion_id: m.org.organizacionId, grupo_id: m.grupoId, prospecto_id: f.prospectoId, lead_id: f.leadId };
  const una = await prisma.lista_espera.create({ data: { ...base, posicion: 1 } });
  await assert.rejects(prisma.lista_espera.create({ data: { ...base, posicion: 2 } }), (e) => esViolacionUnica(e), "la misma familia dos veces");
  await assert.rejects(prisma.lista_espera.create({ data: { ...base, prospecto_id: g.prospectoId, lead_id: g.leadId, posicion: 1 } }), (e) => esViolacionUnica(e), "la misma posición");
  await assert.rejects(prisma.lista_espera.create({ data: { ...base, prospecto_id: g.prospectoId, lead_id: g.leadId, posicion: 0 } }), /lista_espera_posicion_check/);
  await assert.rejects(prisma.lista_espera.update({ where: { id: una.id }, data: { estatus: "ofrecido" } }), /lista_espera_oferta_check/, "ofrecido sin fechas");
  await assert.rejects(prisma.lista_espera.update({ where: { id: una.id }, data: { estatus: "ofrecido", ofrecido_en: new Date("2026-10-08"), vence_en: new Date("2026-10-07") } }), /lista_espera_oferta_check/);
  await assert.rejects(prisma.lista_espera.update({ where: { id: una.id }, data: { ofrecido_en: new Date("2026-10-08"), vence_en: new Date("2026-10-09") } }), /lista_espera_oferta_check/, "esperando con fechas de oferta");
  // Cerrada, la familia puede volver a apuntarse y su posición vieja se puede reusar.
  await prisma.lista_espera.update({ where: { id: una.id }, data: { estatus: "cancelado" } });
  await prisma.lista_espera.create({ data: { ...base, posicion: 1 } });
});
