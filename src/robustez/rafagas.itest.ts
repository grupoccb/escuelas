// K2: ráfagas de 50 a 200 peticiones simultáneas contra el servidor HTTP REAL (la app de Express en un puerto, Postgres real, el procesamiento real) sobre lo que
// mueve cupo, dinero y mensajes. Cada ráfaga exige lo mismo:
//
//   1. cero respuestas 5xx por datos (un 503 solo es válido para una falla del momento, y aquí no hay ninguna provocada),
//   2. los invariantes intactos al final (cupo ≤ máximo, `cuadratura` sin descuadres, UN efecto por reintento),
//   3. sin interbloqueos (ni 40P01 en el log ni peticiones colgadas) y
//   4. latencias acotadas (el techo es generoso: atrapa un candado que serializa de más, no mide rendimiento).
//
// Las peticiones salen todas a la vez por una `Barrera` del cliente (src/testutil/carrera.ts), no por un `Promise.all` que el cliente HTTP podría ir
// escalonando. Nada de verticales ni sucursales reales: nombres genéricos de las semillas de prueba.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { PARAMETROS_PRUEBA } from "../auth/contrasena.ts";
import { crearApp } from "../http/app.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { registrarDesasignacionDeConversacion, registrarTomaDeConversacion } from "../captacion/toma.ts";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { barrerFinanzas } from "../finanzas/barrido.ts";
import { EstadosEntregaChatwoot, MessagingProvider, ReenviadorTwilioFalso, TransporteFalso, crearBordeTwilio, registrarEstadoEntrega } from "../mensajeria/index.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { crearManejadorDeInesperados } from "../webhooks/inesperado.ts";
import { conAlcance } from "../datos/alcance.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { Barrera } from "../testutil/carrera.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escucharSinReuso, puertoDe } from "../testutil/servidor.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarOrganizacion, sembrarPrograma } from "../testutil/semilla.ts";

/** Techo de latencia de UNA petición dentro de una ráfaga (ms). Con 200 simultáneas sobre un pool chico lo normal son decenas de ms a unos segundos. */
const TECHO_MS = 20_000;

let prisma: PrismaPruebas;
before(() => {
  // Un pool mayor que el de producción por omisión (10): la ráfaga mide la lógica de candados, no el tamaño del pool.
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 30);
});
after(async () => {
  await prisma.$disconnect();
});

interface Medida<T> {
  estado: number;
  cuerpo: T;
  ms: number;
}

/** Lanza `n` tareas que salen a la vez (barrera) y mide cada una. Una tarea que lanza (conexión rota, tiempo agotado) cuenta como estado 0. */
async function rafaga<T>(n: number, tarea: (i: number) => Promise<{ estado: number; cuerpo: T }>): Promise<Medida<T>[]> {
  const barrera = new Barrera(n);
  return Promise.all(
    Array.from({ length: n }, async (_, i) => {
      await barrera.esperar(15_000);
      const t0 = performance.now();
      try {
        const r = await tarea(i);
        return { ...r, ms: performance.now() - t0 };
      } catch (e) {
        return { estado: 0, cuerpo: { error: (e as Error).message, causa: String((e as { cause?: unknown }).cause) } as T, ms: performance.now() - t0 };
      }
    }),
  );
}

const cuenta = (rs: Medida<unknown>[]): Record<number, number> => {
  const c: Record<number, number> = {};
  for (const r of rs) c[r.estado] = (c[r.estado] ?? 0) + 1;
  return c;
};

/** Cero 5xx, cero conexiones rotas y latencias dentro del techo. */
function sanas(rs: Medida<unknown>[], quien: string): void {
  const malas = rs.filter((r) => r.estado === 0 || r.estado >= 500);
  assert.equal(malas.length, 0, `${quien}: ${malas.length} respuestas 5xx o rotas (${JSON.stringify(cuenta(rs))}): ${JSON.stringify(malas.slice(0, 2).map((m) => m.cuerpo))}`);
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  const p95 = ms[Math.floor(ms.length * 0.95)] ?? 0;
  assert.ok(ms[ms.length - 1]! < TECHO_MS, `${quien}: la más lenta tardó ${Math.round(ms[ms.length - 1]!)} ms (techo ${TECHO_MS})`);
  console.log(`  [rafaga] ${quien}: n=${rs.length} estados=${JSON.stringify(cuenta(rs))} p50=${Math.round(ms[Math.floor(ms.length / 2)]!)}ms p95=${Math.round(p95)}ms max=${Math.round(ms[ms.length - 1]!)}ms`);
}

async function sinDescuadre(m: MundoDeFinanzas, quien: string): Promise<void> {
  const c = await cuadratura(m.db);
  assert.equal(c.ok, true, `${quien}: la cuadratura no cuadra: ${JSON.stringify(c).slice(0, 400)}`);
}

interface ErrorApi {
  error?: { codigo?: string };
}

// ── Cupo ────────────────────────────────────────────────────────────────────────────────────────────────

test("K2 cupo: 60 inscripciones simultáneas por el ÚLTIMO lugar → una gana (201), las demás grupo_lleno (409); ocupación = máximo; cuadratura en orden", async () => {
  const logs = colectarLogs();
  const m = await mundoDeFinanzas(prisma, "K2 inscribir");
  try {
    const { grupoId } = await m.programa({ cupo: 1 });
    const alumnos = await Promise.all(Array.from({ length: 60 }, () => m.alumno()));
    const rs = await rafaga<ErrorApi>(60, (i) => m.admin.post<ErrorApi>("/api/inscripciones", { alumno_id: alumnos[i]!.alumnoId, grupo_id: grupoId }));
    sanas(rs, "inscribir");
    assert.equal(rs.filter((r) => r.estado === 201).length, 1, JSON.stringify(cuenta(rs)));
    assert.equal(rs.filter((r) => r.estado === 409 && JSON.stringify(r.cuerpo).includes("grupo_lleno")).length, 59, JSON.stringify(rs.filter((r) => r.estado !== 201).slice(0, 2).map((r) => r.cuerpo)));
    assert.equal(await prisma.inscripcion.count({ where: { organizacion_id: m.org.organizacionId, grupo_id: grupoId, estatus: "activa", eliminado_en: null } }), 1);
    await sinDescuadre(m, "inscribir");
    assert.equal(logs.lineas.filter((l) => /40P01|deadlock|interbloqueo/i.test(l)).length, 0, "ningún interbloqueo en el log");
  } finally {
    logs.detener();
    await m.cerrar();
  }
});

test("K2 cupo: 40 conversiones de leads distintos por el último lugar de 3 → exactamente 3 inscritas; las demás 409; ningún 5xx", async () => {
  const m = await mundoDeFinanzas(prisma, "K2 convertir", undefined, { sensibles: { cifrador: crearCifrador(randomBytes(32)) } });
  try {
    const { grupoId, programaId } = await m.programa({ cupo: 3 });
    void programaId;
    const embudo = await prisma.etapa_pipeline.findFirst({ where: { organizacion_id: m.org.organizacionId, tipo_sistema: "negociacion" } });
    const leads = await Promise.all(
      Array.from({ length: 40 }, async () => {
        const a = await sembrarAlumno(prisma, m.org, { docs: m.docs, aceptarReglamento: true, ...(embudo ? { etapaId: embudo.id } : {}) });
        // El alumno de la semilla ya existe: para convertir hace falta un lead con prospecto SIN alumno y el reglamento aceptado.
        await prisma.prospecto.update({ where: { id: a.prospectoId }, data: { alumno_id: null } });
        return a;
      }),
    );
    const rs = await rafaga<ErrorApi>(40, (i) =>
      m.admin.post<ErrorApi>(`/api/leads/${leads[i]!.leadId}/convertir`, {
        tutor: { parentesco: "madre" },
        prospectos: [{ prospecto_id: leads[i]!.prospectoId, alumno: { apellidos: "Prueba", fecha_nacimiento: "2018-05-04" }, inscripcion: { grupo_id: grupoId } }],
      }),
    );
    sanas(rs, "convertir");
    const ok = rs.filter((r) => r.estado === 201).length;
    assert.equal(ok, 3, JSON.stringify(cuenta(rs)) + JSON.stringify(rs.filter((r) => r.estado !== 201 && r.estado !== 409).slice(0, 2).map((r) => r.cuerpo)));
    assert.equal(rs.filter((r) => r.estado === 409).length, 37);
    assert.equal(await prisma.inscripcion.count({ where: { organizacion_id: m.org.organizacionId, grupo_id: grupoId, estatus: "activa", eliminado_en: null } }), 3);
    await sinDescuadre(m, "convertir");
  } finally {
    await m.cerrar();
  }
});

test("K2 cupo: 30 cambios de grupo simultáneos hacia el último lugar → uno gana; y 40 cambios CRUZADOS (A→B y B→A) a la vez no se interbloquean", async () => {
  const logs = colectarLogs();
  const m = await mundoDeFinanzas(prisma, "K2 cambiar");
  try {
    const p = await sembrarPrograma(prisma, m.org, {
      sucursalId: m.norte,
      nombre: "Programa K2",
      edadMin: 3,
      edadMax: 14,
      grupos: [{ nombre: "Origen", cupoMaximo: 100, horarios: [[1, 480, 530]] }, { nombre: "Destino", cupoMaximo: 1, horarios: [[2, 480, 530]] }, { nombre: "Cruce A", cupoMaximo: 20, horarios: [[3, 480, 530]] }, { nombre: "Cruce B", cupoMaximo: 20, horarios: [[4, 480, 530]] }],
      precio: { inscripcion: "500.00", mensualidad: "1000.00" },
    });
    const [origen, destino, cruceA, cruceB] = p.grupos.map((g) => g.id) as [string, string, string, string];
    const inscribir = async (grupoId: string) => (await m.inscribir({ grupoId })).inscripcionId;
    const enOrigen = await Promise.all(Array.from({ length: 30 }, () => inscribir(origen)));
    const rs = await rafaga<ErrorApi>(30, (i) => m.admin.post<ErrorApi>(`/api/inscripciones/${enOrigen[i]!}/cambiar-grupo`, { grupo_id: destino }));
    sanas(rs, "cambiar de grupo");
    assert.equal(rs.filter((r) => r.estado === 200).length, 1, JSON.stringify(cuenta(rs)));
    assert.equal(rs.filter((r) => r.estado === 409).length, 29);
    assert.equal(await prisma.inscripcion.count({ where: { organizacion_id: m.org.organizacionId, grupo_id: destino, estatus: "activa" } }), 1);

    // Cruzados: 20 de A hacia B y 20 de B hacia A, todos a la vez. Cada grupo está lleno (20 de 20): solo caben cuando alguien se va, así que unos entran y
    // otros no; lo que importa es que ninguno cuelga ni da 5xx y que ningún grupo pasa de su máximo.
    const enA = await Promise.all(Array.from({ length: 20 }, () => inscribir(cruceA)));
    const enB = await Promise.all(Array.from({ length: 20 }, () => inscribir(cruceB)));
    const cruces = await rafaga<ErrorApi>(40, (i) => (i < 20 ? m.admin.post<ErrorApi>(`/api/inscripciones/${enA[i]!}/cambiar-grupo`, { grupo_id: cruceB }) : m.admin.post<ErrorApi>(`/api/inscripciones/${enB[i - 20]!}/cambiar-grupo`, { grupo_id: cruceA })));
    sanas(cruces, "cambios cruzados");
    for (const g of [cruceA, cruceB]) {
      const n = await prisma.inscripcion.count({ where: { organizacion_id: m.org.organizacionId, grupo_id: g, estatus: "activa" } });
      assert.ok(n <= 20, `el grupo pasó de su máximo: ${n}`);
    }
    assert.equal(await prisma.inscripcion.count({ where: { organizacion_id: m.org.organizacionId, grupo_id: { in: [cruceA, cruceB] }, estatus: "activa" } }), 40, "nadie se perdió ni se duplicó");
    await sinDescuadre(m, "cambiar de grupo");
    assert.equal(logs.lineas.filter((l) => /40P01|deadlock|interbloqueo/i.test(l)).length, 0);
  } finally {
    logs.detener();
    await m.cerrar();
  }
});

// ── Pagos ───────────────────────────────────────────────────────────────────────────────────────────────

test("K2 pagos: 60 pagos simultáneos por TODO el saldo de un cargo → uno entra; la misma clave 60 veces → UN pago; la suma pagada nunca pasa del cargo", async () => {
  const m = await mundoDeFinanzas(prisma, "K2 pagos mismo cargo");
  try {
    const ins = await m.inscribir();
    const inscripcion = ins.cargos.find((c) => c.concepto === "inscripcion")!;
    const rs = await rafaga<ErrorApi & { id?: string }>(60, (i) => m.recepcion.post("/api/pagos", { tutor_id: ins.tutorId, monto: inscripcion.saldo, metodo: "efectivo", clave_idempotencia: `k2-todo-${i}-${randomBytes(4).toString("hex")}`, aplicaciones: [{ cargo_id: inscripcion.id, monto: inscripcion.saldo }] }));
    sanas(rs, "pagos al mismo cargo");
    assert.equal(rs.filter((r) => r.estado === 201).length, 1, JSON.stringify(cuenta(rs)) + JSON.stringify(rs.filter((r) => r.estado >= 400).slice(0, 2).map((r) => r.cuerpo)));
    assert.ok(rs.filter((r) => r.estado !== 201).every((r) => r.estado === 409), JSON.stringify(cuenta(rs)));
    const cargo = await m.admin.get<{ monto_pagado: string; saldo: string }>(`/api/cargos/${inscripcion.id}`);
    assert.equal(cargo.cuerpo.saldo, "0.00");
    assert.equal(cargo.cuerpo.monto_pagado, inscripcion.monto_final);

    // Mismo reintento 60 veces (la caja que repite): un solo pago, los demás devuelven ese mismo (200 repetido).
    const mensualidad = ins.cargos.find((c) => c.concepto === "mensualidad")!;
    const clave = `k2-reintento-${randomBytes(6).toString("hex")}`;
    const rr = await rafaga<{ id: string; repetido?: boolean } & ErrorApi>(60, () => m.recepcion.post("/api/pagos", { tutor_id: ins.tutorId, monto: "100.00", metodo: "efectivo", clave_idempotencia: clave, aplicaciones: [{ cargo_id: mensualidad.id, monto: "100.00" }] }));
    sanas(rr, "reintentos de un pago");
    assert.equal(rr.filter((r) => r.estado === 201).length, 1, JSON.stringify(cuenta(rr)));
    assert.equal(rr.filter((r) => r.estado === 200).length, 59);
    assert.equal(new Set(rr.map((r) => r.cuerpo.id)).size, 1, "todos devuelven el mismo pago");
    assert.equal(await prisma.pago.count({ where: { organizacion_id: m.org.organizacionId, clave_idempotencia: clave } }), 1);
    await sinDescuadre(m, "pagos al mismo cargo");
  } finally {
    await m.cerrar();
  }
});

test("K2 pagos: pagos CRUZADOS (repartos en orden opuesto sobre los mismos cargos de dos hermanos), con el barrido de finanzas corriendo a la vez → sin interbloqueos y cuadratura en orden", async () => {
  const logs = colectarLogs();
  const m = await mundoDeFinanzas(prisma, "K2 pagos cruzados");
  try {
    const a = await m.inscribir();
    const b = await m.inscribir({ conTutor: a.tutorId });
    const cargos = [...a.cargos, ...b.cargos];
    const [c1, c2] = [a.cargos.find((c) => c.concepto === "inscripcion")!, b.cargos.find((c) => c.concepto === "mensualidad")!];
    // Cada pago de 20.00 toma 10.00 de cada cargo; el cargo c1 (500) admite 50 pagos, c2 (1000) admite 100: gana el más chico → 50 pagos caben.
    const rs = await rafaga<ErrorApi>(80, (i) =>
      i % 5 === 0
        ? m.recepcion.get<ErrorApi>(`/api/pagos/propuesta?tutor_id=${a.tutorId}&monto=20.00`)
        : m.recepcion.post<ErrorApi>("/api/pagos", {
            tutor_id: a.tutorId,
            monto: "20.00",
            metodo: "transferencia",
            clave_idempotencia: `k2-cruz-${i}-${randomBytes(4).toString("hex")}`,
            aplicaciones: i % 2 === 0 ? [{ cargo_id: c1.id, monto: "10.00" }, { cargo_id: c2.id, monto: "10.00" }] : [{ cargo_id: c2.id, monto: "10.00" }, { cargo_id: c1.id, monto: "10.00" }],
          }),
    );
    const barridos = await Promise.all(Array.from({ length: 4 }, () => barrerFinanzas({ prisma, reloj: () => m.reloj.ahora, organizacionId: m.org.organizacionId })));
    sanas(rs, "pagos cruzados");
    assert.ok(barridos.every((b) => b.errores === 0), JSON.stringify(barridos));
    const pagos = rs.filter((r, i) => i % 5 !== 0 && r.estado === 201).length;
    assert.ok(pagos > 0 && pagos <= 50, `pagos aceptados: ${pagos}`);
    const despues = await Promise.all(cargos.filter((c) => c.id === c1.id || c.id === c2.id).map((c) => m.admin.get<{ monto_pagado: string; monto_final: string }>(`/api/cargos/${c.id}`)));
    for (const d of despues) assert.ok(Number(d.cuerpo.monto_pagado) <= Number(d.cuerpo.monto_final));
    assert.equal(Number(despues[0]!.cuerpo.monto_pagado), pagos * 10, "lo pagado en c1 es exactamente 10 por cada pago aceptado");
    assert.equal(Number(despues[1]!.cuerpo.monto_pagado), pagos * 10);
    await sinDescuadre(m, "pagos cruzados");
    assert.equal(logs.lineas.filter((l) => /40P01|deadlock|interbloqueo/i.test(l)).length, 0);
  } finally {
    logs.detener();
    await m.cerrar();
  }
});

// ── Webhooks y landing ───────────────────────────────────────────────────────────────────────────────────

const SECRETO = "secreto-de-prueba";
const TOKEN = "token-de-prueba";
const BASE = "https://escuela.example.test";

async function montarBorde() {
  const transporte = new TransporteFalso();
  // El payload de Chatwoot trae su propia hora de creación (7 de octubre, 17:59:58 UTC): el reloj de la app se fija 2 s después para que el mensaje esté dentro de la ventana de servicio.
  const reloj = (): Date => new Date("2026-10-07T18:00:00Z");
  const mensajeria = new MessagingProvider({ transporte, reloj });
  const reenviador = new ReenviadorTwilioFalso();
  const borde = crearBordeTwilio({ prisma, reenviador });
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: SECRETO,
    procesarEntrante: (e) => procesarEntrante({ prisma, mensajeria, reloj }, e),
    registrarTomaDeConversacion: (e) => registrarTomaDeConversacion({ prisma }, e),
    registrarDesasignacion: (e) => registrarDesasignacionDeConversacion({ prisma }, e),
    estadosEntrega: new EstadosEntregaChatwoot(),
    registrarEstadoEntrega: (c) => registrarEstadoEntrega({ prisma }, c),
    twilio: { authToken: TOKEN, publicBaseUrl: BASE, borde },
    inesperados: crearManejadorDeInesperados(prisma),
    api: { prisma, parametrosHash: PARAMETROS_PRUEBA, cookieSegura: false, origenesPermitidos: [] },
    landing: { prisma },
  });
  const server = escucharSinReuso(app);
  const url = `http://127.0.0.1:${await puertoDe(server)}`;
  const ts = (): string => String(Math.floor(Date.now() / 1000));
  const chatwoot = async (cuerpo: string, firma?: string): Promise<{ estado: number; cuerpo: unknown }> => {
    const bytes = Buffer.from(cuerpo);
    const t = ts();
    const res = await fetch(`${url}/webhooks/chatwoot`, { method: "POST", headers: { "content-type": "application/json", "x-chatwoot-timestamp": t, "x-chatwoot-signature": firma ?? firmarCuerpoChatwoot(SECRETO, t, bytes) }, body: cuerpo });
    const texto = await res.text();
    let json: unknown = texto;
    try {
      json = JSON.parse(texto);
    } catch {
      // no era JSON
    }
    return { estado: res.status, cuerpo: json };
  };
  const twilio = async (ruta: string, cuerpo: string, firma?: string): Promise<{ estado: number; cuerpo: string }> => {
    const p = new Map<string, string[]>();
    for (const [k, v] of new URLSearchParams(cuerpo)) p.set(k, [...(p.get(k) ?? []), v]);
    let datos = `${BASE}${ruta}`;
    for (const k of [...p.keys()].sort()) for (const v of p.get(k)!.sort()) datos += k + v;
    const f = firma ?? createHmac("sha1", TOKEN).update(datos).digest("base64");
    const res = await fetch(`${url}${ruta}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": f }, body: cuerpo });
    return { estado: res.status, cuerpo: await res.text() };
  };
  return { url, transporte, reenviador, chatwoot, twilio, cerrar: () => server.close() };
}

test("K2 webhooks de Chatwoot: 200 solicitudes (50 mensajes distintos, cada uno repetido 3 veces, más 50 con firma inválida) → un efecto por mensaje, 401 las inválidas, ningún 5xx", async () => {
  const o = await sembrarOrganizacion(prisma, "K2 chatwoot");
  const m = await montarBorde();
  try {
    const mensajes = Array.from({ length: 50 }, (_, i) => ({ id: randomInt(100_000_000, 900_000_000), conversacion: randomInt(100_000_000, 900_000_000), telefono: `+5255${String(60_000_000 + randomInt(0, 9_000_000) + i)}`, nombre: `Contacto ${i}` }));
    const cuerpoDe = (x: (typeof mensajes)[number]): string => JSON.stringify(payloadMensajeEntrante({ id: x.id, cuenta: o.chatwootAccountId, bandeja: o.chatwootInboxId, conversacion: x.conversacion, telefono: x.telefono, nombre: x.nombre, content: "Hola" }));
    // Control: UN contacto escribe UNA vez, sin ráfaga. Lo que el bot le manda es lo que debe recibir cada uno de los 50 aunque su mensaje llegue 3 veces.
    const control = { id: randomInt(100_000_000, 900_000_000), conversacion: randomInt(100_000_000, 900_000_000), telefono: "+525580000001", nombre: "Control" };
    assert.equal((await m.chatwoot(cuerpoDe(control))).estado, 200);
    const esperados = m.transporte.envios.filter((e) => e.tipo === "mensaje").length;
    assert.ok(esperados >= 1, "el bot contesta a un contacto nuevo");
    m.transporte.envios.length = 0;
    const rs = await rafaga<unknown>(200, (i) => {
      if (i < 150) return m.chatwoot(cuerpoDe(mensajes[i % 50]!)); // cada mensaje, 3 veces
      return m.chatwoot(cuerpoDe(mensajes[i % 50]!), "sha256=" + "0".repeat(64)); // firma inválida
    });
    sanas(rs, "webhooks de Chatwoot");
    assert.equal(rs.slice(0, 150).filter((r) => r.estado === 200).length, 150, JSON.stringify(cuenta(rs.slice(0, 150))));
    assert.equal(rs.slice(150).filter((r) => r.estado === 401).length, 50, "toda firma inválida es 401 (invariante 9)");
    const db = conAlcance(prisma, o.organizacionId);
    assert.equal(await db.conversacion.count({}), 51, "una conversación por contacto, aunque el mensaje llegara 3 veces");
    assert.equal(await db.mensaje.count({ where: { direccion: "entrante" } }), 51, "UN mensaje entrante registrado por cada id del proveedor (invariante 8)");
    assert.equal(await db.lead.count({}), 51);
    // El bot contestó UNA vez a cada contacto: un reintento nunca manda dos veces.
    const respuestas = m.transporte.envios.filter((e) => e.tipo === "mensaje");
    const porConversacion = new Map<number, number>();
    for (const e of respuestas) porConversacion.set(e.destino.chatwootConversacionId, (porConversacion.get(e.destino.chatwootConversacionId) ?? 0) + 1);
    assert.equal(porConversacion.size, 50);
    assert.ok([...porConversacion.values()].every((n) => n === esperados), `cada contacto recibe lo mismo que el de control (${esperados}): ${JSON.stringify([...porConversacion.values()])}`);
    assert.equal(await db.evento_inesperado.count({}), 0, "nada de esto es un dato inesperado");
  } finally {
    m.cerrar();
  }
});

test("K2 webhooks de Twilio: 200 solicitudes (50 SID distintos × 3 reintentos, 50 estados repetidos, firmas inválidas) → un reenvío por SID, 403 las inválidas, ningún 5xx", async () => {
  const numero = `whatsapp:+1555${randomInt(1_000_000, 9_999_999)}`;
  const o = await sembrarOrganizacion(prisma, "K2 twilio");
  await prisma.canal_whatsapp.update({ where: { id: o.canalId }, data: { numero_whatsapp: numero } });
  const m = await montarBorde();
  try {
    const sids = Array.from({ length: 50 }, () => `SM${randomBytes(12).toString("hex")}`);
    const entrante = (sid: string): string => `MessageSid=${sid}&SmsMessageSid=${sid}&To=${encodeURIComponent(numero)}&From=${encodeURIComponent("whatsapp:+5215512345678")}&Body=Hola`;
    const estado = (sid: string): string => `MessageSid=${sid}&MessageStatus=delivered&To=${encodeURIComponent("whatsapp:+5215512345678")}&From=${encodeURIComponent(numero)}`;
    const rs = await rafaga<string>(200, (i) => {
      if (i < 100) return m.twilio("/webhooks/twilio/entrantes", entrante(sids[i % 50]!)); // 2 veces cada SID
      if (i < 150) return m.twilio("/webhooks/twilio/entrantes", entrante(sids[i % 50]!)); // y una tercera
      if (i < 175) return m.twilio("/webhooks/twilio/estados", estado(sids[i % 50]!)); // estados repetidos
      return m.twilio("/webhooks/twilio/entrantes", entrante(sids[i % 50]!), "firma-falsa");
    });
    sanas(rs, "webhooks de Twilio");
    assert.equal(rs.slice(0, 150).filter((r) => r.estado === 200).length, 150, JSON.stringify(cuenta(rs.slice(0, 150))));
    assert.ok(rs.slice(150, 175).every((r) => r.estado === 200), "estados de mensajes que no son nuestros: 200, no 5xx");
    assert.equal(rs.slice(175).filter((r) => r.estado === 403).length, 25, "toda firma inválida es 403 (invariante 9)");
    const reenviados = m.reenviador.enviados.filter((e) => Buffer.from(e.cuerpo).toString("utf8").includes("Body=Hola")).length;
    assert.equal(reenviados, 50, `cada MessageSid se reenvía a Chatwoot UNA vez (se reenviaron ${reenviados})`);
    const db = conAlcance(prisma, o.organizacionId);
    assert.equal(await db.evento_inesperado.count({}), 0);
  } finally {
    m.cerrar();
  }
});

test("K2 landing: 150 envíos simultáneos (100 familias distintas, 50 repeticiones del mismo teléfono) → ninguna 5xx, un lead por teléfono y una sola atribución", async () => {
  const m = await montarBorde();
  const org = await sembrarOrganizacion(prisma, "K2 landing");
  const docs = await sembrarDocumentosLegales(prisma, org);
  const slug = `k2-${randomBytes(5).toString("hex")}`;
  await prisma.vertical.update({ where: { id: org.verticalId }, data: { slug } });
  await prisma.canal_whatsapp.update({ where: { id: org.canalId }, data: { numero_whatsapp: `whatsapp:+1555${randomInt(1_000_000, 9_999_999)}` } });
  try {
    const telefonos = Array.from({ length: 101 }, (_, i) => `55${String(70_000_000 + randomInt(0, 800_000) * 10 + (i % 10))}`.slice(0, 10));
    const unicos = [...new Set(telefonos)].slice(0, 100);
    assert.equal(unicos.length, 100);
    const cuerpo = (tel: string): string =>
      new URLSearchParams({ nombre_alumno: "Mateo Soto", edad: "8", sucursal_id: org.sucursales[0]!.id, telefono: tel, nombre_contacto: "Rosa", acepta_aviso: "on", documento_id: docs.avisoPrivacidad, version: "1" }).toString();
    const rs = await rafaga<string>(150, async (i) => {
      const tel = i < 100 ? unicos[i]! : unicos[0]!;
      const res = await fetch(`${m.url}/l/${slug}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "K2/1.0" }, body: cuerpo(tel) });
      await res.text();
      return { estado: res.status, cuerpo: "" };
    });
    sanas(rs, "landing");
    assert.ok(rs.every((r) => r.estado === 303 || r.estado === 200), JSON.stringify(cuenta(rs)));
    const db = conAlcance(prisma, org.organizacionId);
    assert.equal(await db.lead.count({}), 100, "un lead por teléfono normalizado, aunque el mismo se enviara 51 veces");
    assert.equal(await db.prospecto.count({}), 100);
  } finally {
    m.cerrar();
  }
});
