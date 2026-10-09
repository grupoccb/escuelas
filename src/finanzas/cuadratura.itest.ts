// H7: la cuadratura SIEMPRE. Pruebas de propiedad con secuencias aleatorias DETERMINISTAS (PRNG con semilla) de altas de inscripción, pagos parciales y múltiples, cancelaciones de
// pagos y de cargos, ventas, anulaciones, congelaciones y bajas, con el paso del tiempo (barrido mensual); tras CADA paso la cuadratura tiene que dar cero discrepancias y el
// estado de cuenta de la familia tocada tiene que coincidir con una suma independiente. Más una carrera concurrente de pagos a la misma familia con la cuadratura final.
// Dinero SIEMPRE en decimales exactos (centavos `bigint`).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { conAlcance } from "../datos/alcance.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";
import { mundoDeFinanzas, type CargoDeApi, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { aTexto, deDecimal, deTexto, sumar } from "../lib/dinero.ts";
import { barrerFinanzas } from "./barrido.ts";
import { cuadratura } from "./cuadratura.ts";

let prisma: PrismaPruebas;

before(() => {
  prisma = crearPrismaDePruebas(undefined, 60);
});
after(async () => {
  await prisma.$disconnect();
});

/** mulberry32: un generador pseudoaleatorio de 32 bits con semilla. */
function prng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entre = (r: () => number, min: number, max: number): number => min + Math.floor(r() * (max - min + 1));
const elegir = <T>(r: () => number, xs: readonly T[]): T | undefined => xs[Math.floor(r() * xs.length)];

interface Contadores {
  [accion: string]: number;
}

async function corrida(semilla: number, pasos: number): Promise<Contadores> {
  const m: MundoDeFinanzas = await mundoDeFinanzas(prisma, `Cuadratura ${semilla}`, new Date("2026-11-10T16:00:00Z"));
  const r = prng(semilla);
  const hechos: Contadores = {};
  const anotar = (a: string) => (hechos[a] = (hechos[a] ?? 0) + 1);
  try {
    // Un catálogo chico: dos programas con precios con centavos y dos productos.
    const programas = [await m.programa({ mensualidad: "1234.50", inscripcion: "499.99" }), await m.programa({ mensualidad: "777.77", inscripcion: "100.00" }), await m.programa({ mensualidad: "999.00", inscripcion: "0.00" })];
    const productos = [] as { id: string }[];
    for (const [nombre, precio, stock] of [["Gorra", "89.90", 6], ["Camiseta", "150.25", 4]] as const) {
      const p = await m.admin.post<{ id: string }>("/api/productos", { vertical_id: m.org.verticalId, nombre, precio, stock });
      assert.equal(p.estado, 201);
      productos.push(p.cuerpo);
    }
    // Promociones que mueven el dinero: un 15 % en la mensualidad de las inscripciones y un mes gratis para algunos casos.
    const promo = await prisma.promocion.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Promo", codigo: `PQ${semilla}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "sin_condicion", acumulable: true, prioridad: 5 } });
    await prisma.promocion_beneficio.create({ data: { organizacion_id: m.org.organizacionId, promocion_id: promo.id, tipo: "descuento_mensualidad", modo: "porcentaje", valor: "15.00" } });
    const diferida = await prisma.promocion.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Diferida", codigo: `PD${semilla}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", acumulable: true, prioridad: 4 } });
    await prisma.promocion_beneficio.create({ data: { organizacion_id: m.org.organizacionId, promocion_id: diferida.id, tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Gorra", producto_id: productos[0]!.id } });

    const verificar = async (paso: number, accion: string, tutorId?: string) => {
      const c = await cuadratura(m.db);
      assert.deepEqual(c.discrepancias, [], `semilla ${semilla}, paso ${paso} (${accion}): la cuadratura falló`);
      if (tutorId) {
        // Una suma INDEPENDIENTE del estado de cuenta de la familia: Σ cargos vivos − Σ aplicaciones vivas, con agregados de la base.
        const cargos = await m.db.cargo.findMany({ where: { tutor_id: tutorId, estatus: { not: "cancelado" } }, select: { monto_final: true } });
        const aplicado = await m.db.pago_aplicacion.findMany({ where: { estatus: "aplicada", cargo: { tutor_id: tutorId, estatus: { not: "cancelado" } } }, select: { monto_aplicado: true } });
        const esperado = sumar(...cargos.map((x) => deDecimal(x.monto_final))) - sumar(...aplicado.map((x) => deDecimal(x.monto_aplicado)));
        const cuenta = await m.admin.get<{ resumen: { saldo: string } }>(`/api/tutores/${tutorId}/estado-cuenta`);
        assert.equal(cuenta.estado, 200);
        assert.equal(deTexto(cuenta.cuerpo.resumen.saldo), esperado, `paso ${paso} (${accion}): el estado de cuenta no coincide con la suma independiente`);
      }
    };
    await verificar(0, "inicio");

    const familias: { tutorId: string }[] = [];
    // Registros en ORDEN DE CREACIÓN: de ahí se elige, nunca de lo que devuelva la base en el orden que sea (la propiedad tiene que ser determinista con la semilla).
    const inscripciones: { id: string; tutorId: string }[] = [];
    const pagos: string[] = [];
    const ventas: string[] = [];
    const indiceDeInscripcion = (id: string | null): number => inscripciones.findIndex((i) => i.id === id);
    const sinError = (estado: number, esperados: number[], paso: number, accion: string) => assert.ok(esperados.includes(estado), `semilla ${semilla}, paso ${paso} (${accion}): estado ${estado}`);
    /** Los cargos de las inscripciones registradas, en un orden que depende solo del contenido (índice de inscripción, periodo, concepto). */
    const cargosOrdenados = async (donde: Record<string, unknown>) => {
      const filas = await m.db.cargo.findMany({ where: { inscripcion_id: { in: inscripciones.map((i) => i.id) }, ...donde }, select: { id: true, tutor_id: true, inscripcion_id: true, periodo: true, concepto: true, monto_final: true, monto_pagado: true, fecha_vencimiento: true } });
      return filas.sort((x, y) => indiceDeInscripcion(x.inscripcion_id) - indiceDeInscripcion(y.inscripcion_id) || (x.periodo ?? "").localeCompare(y.periodo ?? "") || x.concepto.localeCompare(y.concepto));
    };

    /** TODOS los cargos abiertos de una familia (también los de una venta), en un orden que depende solo del contenido. */
    const abiertosDeFamilia = async (tutorId: string) => {
      const filas = await m.db.cargo.findMany({ where: { tutor_id: tutorId, estatus: { in: ["pendiente", "vencido"] } }, select: { id: true, inscripcion_id: true, venta_id: true, periodo: true, concepto: true, monto_final: true, monto_pagado: true } });
      const clave = (x: (typeof filas)[number]): number => (x.inscripcion_id ? indiceDeInscripcion(x.inscripcion_id) : 1_000_000 + ventas.indexOf(x.venta_id ?? ""));
      return filas.sort((x, y) => clave(x) - clave(y) || (x.periodo ?? "").localeCompare(y.periodo ?? "") || x.concepto.localeCompare(y.concepto));
    };

    for (let paso = 1; paso <= pasos; paso++) {
      const tirada = r();
      let accion = "";
      let tutorTocado: string | undefined;
      if (tirada < 0.2 || familias.length === 0) {
        accion = "inscribir";
        const conTutor = familias.length > 0 && r() < 0.4 ? elegir(r, familias)!.tutorId : undefined;
        const programa = elegir(r, programas)!;
        const i = await m.inscribir({ grupoId: programa.grupoId, ...(conTutor ? { conTutor } : {}), diaCorte: entre(r, 1, 31), ...(r() < 0.1 ? { mesesAdelantados: entre(r, 1, 3) } : {}) });
        if (!familias.some((f) => f.tutorId === i.tutorId)) familias.push({ tutorId: i.tutorId });
        inscripciones.push({ id: i.inscripcionId, tutorId: i.tutorId });
        tutorTocado = i.tutorId;
      } else if (tirada < 0.5) {
        const f = elegir(r, familias)!;
        tutorTocado = f.tutorId;
        const abiertos = await abiertosDeFamilia(f.tutorId);
        const deuda = sumar(...abiertos.map((c) => deDecimal(c.monto_final) - deDecimal(c.monto_pagado)));
        const modo = r();
        const tirada2 = r();
        if (deuda === 0n) {
          accion = "pagar_sin_deuda";
          const x = await m.recepcion.post("/api/pagos", { tutor_id: f.tutorId, monto: "1.00", metodo: "efectivo" });
          sinError(x.estado, [409], paso, accion);
        } else if (modo < 0.45) {
          accion = "pago_parcial";
          const monto = 1n + BigInt(Math.floor(tirada2 * Number(deuda)));
          const x = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: f.tutorId, monto: aTexto(monto), metodo: ["efectivo", "tarjeta", "transferencia"][Math.floor(tirada2 * 3)]! });
          sinError(x.estado, [201], paso, accion);
          pagos.push(x.cuerpo.id);
        } else if (modo < 0.65) {
          accion = "pago_total";
          const x = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: f.tutorId, monto: aTexto(deuda), metodo: "transferencia", referencia: "SPEI" });
          sinError(x.estado, [201], paso, accion);
          pagos.push(x.cuerpo.id);
        } else if (modo < 0.85 && abiertos.length >= 2) {
          accion = "pago_manual_varios_cargos";
          const [a, b] = [abiertos[0]!, abiertos[abiertos.length - 1]!];
          const [sa, sb] = [deDecimal(a.monto_final) - deDecimal(a.monto_pagado), deDecimal(b.monto_final) - deDecimal(b.monto_pagado)];
          const [ma, mb] = [1n + BigInt(Math.floor(tirada2 * Number(sa))), 1n + BigInt(Math.floor((1 - tirada2) * Number(sb)))];
          const x = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: f.tutorId, monto: aTexto(ma + mb), metodo: "efectivo", aplicaciones: [{ cargo_id: a.id, monto: aTexto(ma) }, { cargo_id: b.id, monto: aTexto(mb) }] });
          sinError(x.estado, [201], paso, accion);
          pagos.push(x.cuerpo.id);
        } else {
          accion = "excedente";
          const x = await m.recepcion.post("/api/pagos", { tutor_id: f.tutorId, monto: aTexto(deuda + 1n), metodo: "efectivo" });
          sinError(x.estado, [409], paso, accion);
        }
      } else if (tirada < 0.6) {
        accion = "cancelar_pago";
        const vivos = new Set((await m.db.pago.findMany({ where: { id: { in: pagos }, estatus: "aplicado" }, select: { id: true } })).map((p) => p.id));
        const p = elegir(r, pagos.filter((id) => vivos.has(id)));
        if (p) {
          tutorTocado = (await m.db.pago.findFirstOrThrow({ where: { id: p }, select: { tutor_id: true } })).tutor_id;
          sinError((await m.recepcion.post(`/api/pagos/${p}/cancelar`, { motivo: "Prueba de propiedad" })).estado, [200], paso, accion);
        }
      } else if (tirada < 0.67) {
        accion = "cancelar_cargo";
        const c = elegir(r, await cargosOrdenados({ estatus: { in: ["pendiente", "vencido"] }, monto_pagado: "0.00", venta_id: null }));
        if (c) {
          tutorTocado = c.tutor_id;
          sinError((await m.recepcion.post(`/api/cargos/${c.id}/cancelar`, { motivo: "Prueba de propiedad" })).estado, [200], paso, accion);
        }
      } else if (tirada < 0.77) {
        accion = "vender";
        const f = elegir(r, familias)!;
        const alumno = await m.db.tutor_alumno.findFirst({ where: { tutor_id: f.tutorId }, orderBy: [{ creado_en: "asc" }, { id: "asc" }], select: { alumno_id: true } });
        const producto = elegir(r, productos)!;
        const cantidad = entre(r, 1, 3);
        if (alumno) {
          tutorTocado = f.tutorId;
          const x = await m.recepcion.post<{ id: string }>("/api/ventas", { alumno_id: alumno.alumno_id, producto_id: producto.id, cantidad });
          sinError(x.estado, [201, 409], paso, accion);
          if (x.estado === 201) ventas.push(x.cuerpo.id);
        }
      } else if (tirada < 0.82) {
        accion = "anular_venta";
        const vivas = new Set((await m.db.venta.findMany({ where: { id: { in: ventas }, estatus: "registrada", es_promocional: false }, select: { id: true } })).map((v) => v.id));
        const v = elegir(r, ventas.filter((id) => vivas.has(id)));
        if (v) {
          tutorTocado = (await m.db.venta.findFirstOrThrow({ where: { id: v }, select: { tutor_id: true } })).tutor_id;
          sinError((await m.recepcion.post(`/api/ventas/${v}/anular`, { motivo: "Prueba de propiedad" })).estado, [200, 409], paso, accion);
        }
      } else if (tirada < 0.87) {
        accion = "entregar_beneficio";
        const liberados = await m.db.promocion_aplicacion.findMany({ where: { estatus: "liberado" }, select: { id: true, inscripcion_id: true } });
        const b = elegir(r, liberados.sort((x, y) => indiceDeInscripcion(x.inscripcion_id) - indiceDeInscripcion(y.inscripcion_id)));
        if (b) sinError((await m.recepcion.post(`/api/beneficios/${b.id}/entregar`, {})).estado, [200, 409], paso, accion);
      } else if (tirada < 0.93) {
        accion = ["congelar", "baja", "reactivar"][Math.floor(r() * 3)]!;
        const estatus = accion === "reactivar" ? "congelada" : "activa";
        const vigentes = new Set((await m.db.inscripcion.findMany({ where: { id: { in: inscripciones.map((i) => i.id) }, estatus }, select: { id: true } })).map((i) => i.id));
        const i = elegir(r, inscripciones.filter((x) => vigentes.has(x.id)));
        if (i) {
          const cuerpo = accion === "baja" ? { motivo_baja_id: m.motivoBaja } : undefined;
          sinError((await m.admin.post(`/api/inscripciones/${i.id}/${accion}`, cuerpo)).estado, [200, 409], paso, accion);
        }
      } else {
        accion = "avanzar_el_mes";
        m.reloj.ahora = new Date(m.reloj.ahora.getTime() + entre(r, 20, 45) * 86_400_000);
        const b = await barrerFinanzas({ prisma, reloj: () => m.reloj.ahora, organizacionId: m.org.organizacionId });
        assert.equal(b.errores, 0);
      }
      anotar(accion);
      await verificar(paso, accion, tutorTocado);
    }
    // Al final, para TODAS las familias el estado de cuenta coincide con la suma independiente.
    for (const f of familias) await verificar(pasos, "final", f.tutorId);
    const c = await cuadratura(m.db);
    assert.ok(c.resumen.cargos > 0 && c.resumen.pagos > 0, `semilla ${semilla}: la corrida tocó dinero de verdad (${JSON.stringify(c.resumen)})`);
    return hechos;
  } finally {
    await m.cerrar();
  }
}

for (const [semilla, pasos] of [[1, 120], [20261021, 120], [424242, 120]] as const) {
  test(`PROPIEDAD (semilla ${semilla}, ${pasos} pasos): inscripciones, pagos parciales y múltiples, cancelaciones, ventas, bajas y meses que pasan → la cuadratura da cero discrepancias tras CADA paso`, { timeout: 600_000 }, async () => {
    const hechos = await corrida(semilla, pasos);
    assert.ok((hechos["inscribir"] ?? 0) >= 5, JSON.stringify(hechos));
    const pagos = (hechos["pago_parcial"] ?? 0) + (hechos["pago_total"] ?? 0) + (hechos["pago_manual_varios_cargos"] ?? 0);
    assert.ok(pagos >= 3, `hubo pagos de verdad: ${JSON.stringify(hechos)}`);
  });
}

test("la propiedad es DETERMINISTA: la misma semilla hace exactamente lo mismo", { timeout: 300_000 }, async () => {
  const a = await corrida(99, 30);
  const b = await corrida(99, 30);
  assert.deepEqual(a, b);
});

test("CARRERA: 30 pagos aleatorios simultáneos a la misma familia (con y sin barrera de candado) → nunca se pasa de lo que se debe y la cuadratura final da cero", { timeout: 120_000 }, async () => {
  const m = await mundoDeFinanzas(prisma, "Cuadratura carrera");
  try {
    const { grupoId } = await m.programa({ mensualidad: "1234.50", inscripcion: "499.99" });
    const a1 = await m.alumno();
    const a2 = await m.alumno({ conTutor: a1.tutorId });
    await m.inscribir({ alumno: a1, grupoId, diaCorte: 5 });
    await m.inscribir({ alumno: a2, grupoId, diaCorte: 25 });
    const deudaInicial = (await cuadratura(m.db)).resumen.saldoTotal;
    const barrera = new Barrera(30);
    const servidor = levantarApi(conGanchos(prisma, { modelo: "tutor", operacion: "updateMany", cuando: (x) => JSON.stringify(x["where"]).includes(a1.tutorId), antes: () => barrera.esperar(8000) }), { reloj: () => m.reloj.ahora });
    try {
      const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "recepcion", sucursales: [m.norte] });
      const primero = servidor.cliente();
      assert.equal((await primero.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
      const r = prng(7);
      const montos = Array.from({ length: 30 }, () => aTexto(BigInt(entre(r, 1, 120_000))));
      const rs = await Promise.all(
        montos.map((monto) => {
          const c = servidor.cliente();
          c.cookieDeSesion = primero.cookieDeSesion;
          return c.post<{ id: string }>("/api/pagos", { tutor_id: a1.tutorId, monto, metodo: "efectivo" });
        }),
      );
      assert.ok(rs.every((x) => x.estado === 201 || x.estado === 409), JSON.stringify(rs.map((x) => x.estado)));
      assert.ok(rs.some((x) => x.estado === 201));
      assert.ok(barrera.completa);
    } finally {
      await servidor.cerrar();
    }
    const c = await cuadratura(m.db);
    assert.deepEqual(c.discrepancias, []);
    assert.ok(deTexto(c.resumen.saldoTotal) >= 0n && deTexto(c.resumen.totalPagado) <= deTexto(deudaInicial), "nunca se pagó más de lo que se debía");
    const cargos = await m.admin.get<{ datos: CargoDeApi[] }>(`/api/cargos?tutor_id=${a1.tutorId}&limite=100`);
    assert.ok(cargos.cuerpo.datos.every((x) => deTexto(x.saldo) >= 0n));
  } finally {
    await m.cerrar();
  }
});

test("el comando `npm run cuadratura` corre sobre la base indicada, imprime el resumen y sale con 0 si todo cuadra", { timeout: 120_000 }, async () => {
  const m = await mundoDeFinanzas(prisma, "Cuadratura comando");
  try {
    await m.inscribir();
    const env = { ...process.env, DATABASE_URL: process.env["DATABASE_URL"]! };
    const salida = execFileSync(process.execPath, ["scripts/cuadratura.ts", "--organizacion", m.org.organizacionId], { env, encoding: "utf8" });
    assert.match(salida, /✓ cuadra/);
    assert.match(salida, /cargos: 2/);
  } finally {
    await m.cerrar();
  }
});

test("la cuadratura DETECTA un descuadre inyectado por SQL (con los disparadores apagados) y el comando sale con 1", { timeout: 120_000 }, async () => {
  const m = await mundoDeFinanzas(prisma, "Cuadratura descuadre");
  try {
    const i = await m.inscribir();
    assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: i.tutorId, monto: "300.00", metodo: "efectivo" })).estado, 201);
    assert.deepEqual((await cuadratura(m.db)).discrepancias, []);
    // Un superusuario (o un código con un error) mueve `monto_pagado` sin una aplicación que lo respalde: la base lo permite si apagan los disparadores; la cuadratura no.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "cargo" DISABLE TRIGGER USER');
      await tx.$executeRawUnsafe(`UPDATE "cargo" SET "monto_pagado" = "monto_pagado" + 0.01 WHERE "id" = '${i.cargos.find((c) => c.concepto === "inscripcion")!.id}'`);
      await tx.$executeRawUnsafe('ALTER TABLE "cargo" ENABLE TRIGGER USER');
    });
    const c = await cuadratura(m.db);
    assert.equal(c.ok, false);
    assert.ok(c.discrepancias.some((d) => d.regla === "saldo_de_cada_cargo"), JSON.stringify(c.discrepancias));
    let codigo = 0;
    let salida = "";
    try {
      salida = execFileSync(process.execPath, ["scripts/cuadratura.ts", "--organizacion", m.org.organizacionId], { env: { ...process.env, DATABASE_URL: process.env["DATABASE_URL"]! }, encoding: "utf8" });
    } catch (e) {
      codigo = (e as { status: number }).status;
      salida = (e as { stdout: string }).stdout;
    }
    assert.equal(codigo, 1);
    assert.match(salida, /NO CUADRA/);
    assert.match(salida, /saldo_de_cada_cargo/);
  } finally {
    await m.cerrar();
  }
});

test("EH-07: la cuadratura lee con UNA instantánea: un pago que se confirma a la mitad de la lectura no la hace sonar (antes: falsa alarma)", async () => {
  const m = await mundoDeFinanzas(prisma, "Cuadratura instantánea");
  try {
    const i = await m.inscribir();
    const mens = i.cargos.find((c) => c.concepto === "mensualidad")!;
    let disparado = false;
    // Justo antes de leer las aplicaciones (las demás tablas ya se leyeron), otra conexión confirma un pago: sin instantánea común, los cargos y los pagos se leyeron SIN él y las
    // aplicaciones CON él.
    const bd = conAlcance(
      conGanchos(prisma, {
        modelo: "pago_aplicacion",
        operacion: "findMany",
        antes: async () => {
          if (disparado) return;
          disparado = true;
          const p = await m.recepcion.post("/api/pagos", { tutor_id: i.tutorId, monto: "100.00", metodo: "efectivo", aplicaciones: [{ cargo_id: mens.id, monto: "100.00" }] });
          assert.equal(p.estado, 201);
        },
      }),
      m.org.organizacionId,
    );
    const durante = await cuadratura(bd);
    assert.ok(disparado, "el pago se confirmó a mitad de la lectura");
    assert.deepEqual(durante.discrepancias, [], "una lectura con instantánea no ve el pago a medias");
    // Después, con el pago ya visible, también cuadra y el total lo incluye.
    const despues = await cuadratura(m.db);
    assert.deepEqual(despues.discrepancias, []);
    assert.equal(despues.resumen.totalPagado, "100.00");
  } finally {
    await m.cerrar();
  }
});
