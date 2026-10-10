// V7 (recorrido de recepción): lo que la API ganó al ver trabajar a una recepcionista.
//  - `GET /api/pagos/corte`: el corte de caja del día (lo cobrado por usuario y forma de pago, lo cancelado y las devoluciones de pagos de días anteriores). SOLO LEE.
//  - La búsqueda por nombre de tutores y alumnos: sin importar acentos ni mayúsculas, y la de tutores encuentra también por el nombre de un HIJO («vengo por Valentina»).
// Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { fechaLocal } from "../lib/horario.ts";
import { sembrarFamilia } from "../testutil/semilla.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
let otra: MundoDeFinanzas;
before(async () => {
  prisma = crearPrismaDePruebas();
  // El reloj de la aplicación parte de «ahora» de verdad: `pago.creado_en` lo pone la base con su reloj y el corte compara contra el de la aplicación.
  m = await mundoDeFinanzas(prisma, "V7 recepción", new Date());
  otra = await mundoDeFinanzas(prisma, "V7 recepción (otra escuela)", new Date());
});
after(async () => {
  await m.cerrar();
  await otra.cerrar();
  await prisma.$disconnect();
});

interface PagoApi {
  id: string;
  creado_en: string;
  error?: unknown;
}
interface Desglose {
  efectivo: string;
  tarjeta: string;
  transferencia: string;
  total: string;
  pagos: number;
}
interface Corte {
  fecha: string;
  hoy: string;
  zona_horaria: string;
  cajas: { usuario: { id: string; nombre: string } | null; cobrado: Desglose }[];
  cobrado: Desglose;
  devoluciones: Desglose;
  neto: Desglose;
  cancelados: { id: string; monto: string; de_otro_dia: boolean; motivo: string | null; cancelado_por: { nombre: string } | null; registrado_por: { nombre: string } | null; familia: string }[];
  pagos: { id: string; monto: string; metodo: string; familia: string; registrado_por: { nombre: string } | null }[];
}

const pagar = (c: MundoDeFinanzas["recepcion"], tutorId: string, monto: string, metodo: string) => c.post<PagoApi>("/api/pagos", { tutor_id: tutorId, monto, metodo });

test("el corte del día: por quien cobró y por forma de pago, al centavo; un pago cancelado el mismo día no cuenta; el de ayer cancelado hoy es una devolución", async () => {
  const f = await m.inscribir();
  const g = await m.inscribir();
  assert.equal((await pagar(m.recepcion, f.tutorId, "300.50", "efectivo")).estado, 201);
  assert.equal((await pagar(m.recepcion, f.tutorId, "199.50", "tarjeta")).estado, 201);
  const deAdmin = await pagar(m.admin, g.tutorId, "100.00", "efectivo");
  assert.equal(deAdmin.estado, 201);
  const aCancelar = await pagar(m.recepcion, g.tutorId, "50.00", "transferencia");
  assert.equal(aCancelar.estado, 201);
  const antes = (await m.recepcion.get<Corte>("/api/pagos/corte")).cuerpo;
  assert.equal(antes.cobrado.total, "650.00");

  // Se equivoca y lo cancela el mismo día: ya no se cobró.
  assert.equal((await m.recepcion.post(`/api/pagos/${aCancelar.cuerpo.id}/cancelar`, { motivo: "Cobré de más" })).estado, 200);
  const hoy = (await m.recepcion.get<Corte>("/api/pagos/corte")).cuerpo;
  assert.equal(hoy.cobrado.efectivo, "400.50");
  assert.equal(hoy.cobrado.tarjeta, "199.50");
  assert.equal(hoy.cobrado.transferencia, "0.00");
  assert.equal(hoy.cobrado.total, "600.00");
  assert.equal(hoy.cobrado.pagos, 3);
  assert.equal(hoy.neto.total, "600.00");
  assert.equal(hoy.devoluciones.total, "0.00");
  assert.equal(hoy.cajas.length, 2);
  assert.equal(hoy.cajas.reduce((s, c) => s + c.cobrado.pagos, 0), 3);
  const cajaDeRecepcion = hoy.cajas.find((c) => c.usuario?.id === m.recepcionId)!;
  assert.equal(cajaDeRecepcion.cobrado.efectivo, "300.50");
  assert.equal(cajaDeRecepcion.cobrado.tarjeta, "199.50");
  assert.equal(cajaDeRecepcion.cobrado.total, "500.00");
  assert.equal(hoy.cajas.find((c) => c.usuario?.id === m.adminId)?.cobrado.total, "100.00");
  assert.equal(hoy.cancelados.length, 1);
  assert.equal(hoy.cancelados[0]?.de_otro_dia, false);
  assert.equal(hoy.cancelados[0]?.motivo, "Cobré de más");
  assert.equal(hoy.pagos.length, 3);
  const diaDeLosPagos = hoy.fecha;
  assert.equal(diaDeLosPagos, fechaLocal(new Date(), hoy.zona_horaria));

  // Mañana (el reloj de la aplicación avanza 30 horas) se cancela el pago de ayer: es una devolución de hoy.
  m.reloj.ahora = new Date(Date.now() + 30 * 3_600_000);
  assert.equal((await m.recepcion.post(`/api/pagos/${deAdmin.cuerpo.id}/cancelar`, { motivo: "Era de otra familia" })).estado, 200);
  const manana = (await m.recepcion.get<Corte>("/api/pagos/corte")).cuerpo;
  assert.notEqual(manana.fecha, diaDeLosPagos);
  assert.equal(manana.cobrado.total, "0.00");
  assert.equal(manana.devoluciones.efectivo, "100.00");
  assert.equal(manana.neto.efectivo, "-100.00");
  assert.equal(manana.neto.total, "-100.00");
  assert.equal(manana.cancelados.length, 1);
  assert.equal(manana.cancelados[0]?.de_otro_dia, true);
  assert.equal(manana.cancelados[0]?.monto, "100.00");
  // El corte del día de los pagos, visto después: lo cancelado DESPUÉS del cierre sí contaba ese día.
  const ayer = (await m.recepcion.get<Corte>(`/api/pagos/corte?fecha=${diaDeLosPagos}`)).cuerpo;
  assert.equal(ayer.cobrado.efectivo, "400.50");
  assert.equal(ayer.cobrado.total, "600.00");
  m.reloj.ahora = new Date();
});

test("el corte solo lee: no crea ni cambia pagos, cargos ni registros", async () => {
  const f = await m.inscribir();
  assert.equal((await pagar(m.recepcion, f.tutorId, "10.00", "efectivo")).estado, 201);
  const cuenta = async () => ({ pagos: await prisma.pago.count({ where: { organizacion_id: m.org.organizacionId } }), cargos: await prisma.cargo.count({ where: { organizacion_id: m.org.organizacionId } }), registro: await prisma.registro_cambio.count({ where: { organizacion_id: m.org.organizacionId } }) });
  const antes = await cuenta();
  for (let i = 0; i < 3; i++) assert.equal((await m.recepcion.get("/api/pagos/corte")).estado, 200);
  assert.deepEqual(await cuenta(), antes);
  assert.equal((await m.recepcion.post("/api/pagos/corte", {})).estado >= 400, true, "el corte no se escribe");
});

test("quién lo ve: recepción y administrador sí, el asesor lo lee, el maestro no, sin sesión no; y cada quien solo lo de SUS sucursales y su escuela", async () => {
  const sur = await m.inscribir({ sucursalId: m.sur });
  const norte = await m.inscribir();
  const p1 = await pagar(m.admin, sur.tutorId, "700.00", "efectivo");
  assert.equal(p1.estado, 201, JSON.stringify(p1.cuerpo));
  const p2 = await pagar(m.admin, norte.tutorId, "11.00", "efectivo");
  assert.equal(p2.estado, 201, JSON.stringify(p2.cuerpo));
  // Otra escuela cobra lo suyo el mismo día.
  const ajena = await otra.inscribir();
  assert.equal((await pagar(otra.admin, ajena.tutorId, "1200.00", "tarjeta")).estado, 201);

  const recepcionNorte = (await m.recepcion.get<Corte>("/api/pagos/corte")).cuerpo;
  assert.ok(recepcionNorte.pagos.every((p) => p.monto !== "700.00" && p.monto !== "1200.00"), "recepción del Norte no ve lo del Sur ni lo de otra escuela");
  assert.ok(recepcionNorte.pagos.some((p) => p.monto === "11.00"));
  const admin = (await m.admin.get<Corte>("/api/pagos/corte")).cuerpo;
  assert.ok(admin.pagos.some((p) => p.monto === "700.00") && admin.pagos.some((p) => p.monto === "11.00"));
  assert.ok(admin.pagos.every((p) => p.monto !== "1200.00"), "nadie ve el dinero de otra escuela");
  assert.equal((await m.asesorNorte.get("/api/pagos/corte")).estado, 200);
  assert.equal((await m.maestro.get("/api/pagos/corte")).estado, 403);
  const sinSesion = m.api.cliente();
  assert.equal((await sinSesion.get("/api/pagos/corte")).estado, 401);
  // Una sucursal que no ve: 404, como todo lo ajeno.
  assert.equal((await m.recepcion.get(`/api/pagos/corte?sucursal_id=${m.sur}`)).estado, 404);
  assert.equal((await m.recepcion.get(`/api/pagos/corte?sucursal_id=${m.norte}`)).estado, 200);
});

test("fecha inválida es 400; un día sin movimientos da ceros; y con finanzas apagado la ruta no existe (404)", async () => {
  for (const mala of ["2026-02-31", "ayer", "2026-13-01", "10/10/2026"]) assert.equal((await m.recepcion.get(`/api/pagos/corte?fecha=${encodeURIComponent(mala)}`)).estado, 400, mala);
  const vacio = (await m.recepcion.get<Corte>("/api/pagos/corte?fecha=2030-01-15")).cuerpo;
  assert.equal(vacio.fecha, "2030-01-15");
  assert.equal(vacio.cobrado.total, "0.00");
  assert.deepEqual(vacio.cajas, []);
  try {
    assert.equal((await m.admin.put("/api/modulos", { tableros: false })).estado, 200);
    assert.equal((await m.admin.put("/api/modulos", { finanzas: false })).estado, 200);
    assert.equal((await m.recepcion.get("/api/pagos/corte")).estado, 404);
  } finally {
    await m.admin.put("/api/modulos", { finanzas: true });
    await m.admin.put("/api/modulos", { tableros: true });
  }
  assert.equal((await m.recepcion.get("/api/pagos/corte")).estado, 200);
});

// ── La búsqueda por nombre ──────────────────────────────────────────────────────────────────────────────

test("buscar a la familia por el nombre de la mamá o de un hijo, sin importar acentos ni mayúsculas (antes «ANGEL» no encontraba a «Ángel»)", async () => {
  const a = await m.alumno();
  const b = await m.alumno({ conTutor: a.tutorId });
  await prisma.tutor.update({ where: { id: a.tutorId }, data: { nombre: "Lucía", apellidos: "Báez Ñúñez" } });
  await prisma.alumno.update({ where: { id: a.alumnoId }, data: { nombre: "Ángel", apellidos: "Báez Ñúñez" } });
  await prisma.alumno.update({ where: { id: b.alumnoId }, data: { nombre: "Inés", apellidos: "Báez Ñúñez" } });
  const otra = await m.alumno({ sucursalId: m.sur });
  await prisma.tutor.update({ where: { id: otra.tutorId }, data: { nombre: "Marta", apellidos: "Ñuñoa" } });
  await prisma.alumno.update({ where: { id: otra.alumnoId }, data: { nombre: "Ángela", apellidos: "Ñuñoa" } });

  const ids = async (cliente: MundoDeFinanzas["recepcion"], q: string): Promise<string[]> => (await cliente.get<{ datos: { id: string }[]; total: number }>(`/api/tutores?nombre=${encodeURIComponent(q)}&limite=50`)).cuerpo.datos.map((t) => t.id);
  for (const q of ["Lucía", "LUCIA", "lucia baez", "bAEz nunez", "Ángel", "ANGEL", "ines", "INÉS BAEZ", "angel ines"]) assert.deepEqual(await ids(m.recepcion, q), [a.tutorId], `«${q}»`);
  // Lo que no existe no encuentra a nadie; y el nombre de un niño del Sur no se encuentra desde el Norte.
  assert.deepEqual(await ids(m.recepcion, "zzzz"), []);
  assert.deepEqual(await ids(m.recepcion, "angela"), []);
  assert.deepEqual(await ids(m.admin, "angela"), [otra.tutorId]);
  // Por el teléfono sigue igual, con +521.
  const t = await prisma.tutor.findFirstOrThrow({ where: { id: a.tutorId } });
  const conUno = t.telefono.replace("+52", "+521");
  assert.deepEqual((await m.recepcion.get<{ datos: { id: string }[] }>(`/api/tutores?telefono=${encodeURIComponent(conUno)}`)).cuerpo.datos.map((x) => x.id), [a.tutorId]);
  // La paginación y el total siguen contando lo que coincide.
  const pagina = (await m.recepcion.get<{ datos: unknown[]; paginacion: { total: number } }>("/api/tutores?nombre=BAEZ&limite=1")).cuerpo;
  assert.equal(pagina.paginacion.total, 1);
  assert.equal(pagina.datos.length, 1);
});

test("buscar un alumno por nombre también ignora acentos y mayúsculas, y respeta el alcance", async () => {
  const a = await m.alumno();
  await prisma.alumno.update({ where: { id: a.alumnoId }, data: { nombre: "Sebastián", apellidos: "Peñaloza Ibáñez" } });
  const s = await m.alumno({ sucursalId: m.sur });
  await prisma.alumno.update({ where: { id: s.alumnoId }, data: { nombre: "Sebastián", apellidos: "Peñaloza del Sur" } });
  const buscar = async (c: MundoDeFinanzas["recepcion"], q: string): Promise<string[]> => (await c.get<{ datos: { id: string }[] }>(`/api/alumnos?nombre=${encodeURIComponent(q)}&limite=50`)).cuerpo.datos.map((x) => x.id);
  assert.deepEqual(await buscar(m.recepcion, "SEBASTIAN penaloza"), [a.alumnoId]);
  assert.deepEqual(await buscar(m.recepcion, "ibanez"), [a.alumnoId]);
  assert.deepEqual((await buscar(m.admin, "sebastian")).sort(), [a.alumnoId, s.alumnoId].sort());
  assert.deepEqual(await buscar(m.recepcion, "sur"), [], "el alumno del Sur no se ve desde el Norte");
});

// ── Lo que recepción no ve ──────────────────────────────────────────────────────────────────────────────

test("la nota con la que el asesor mueve a un lead NO la lee recepción (sí el avance); el asesor y el administrador sí; la ficha de salud es 403", async () => {
  const lead = await sembrarFamilia(prisma, m.org, { sucursalId: m.norte });
  const etapas = (await m.asesorNorte.get<{ datos?: { id: string; tipo_sistema: string | null }[] } | { id: string; tipo_sistema: string | null }[]>("/api/etapas")).cuerpo;
  const lista = Array.isArray(etapas) ? etapas : (etapas.datos ?? []);
  const contactado = lista.find((e) => e.tipo_sistema === "contactado")!;
  const nota = "La mamá prefiere que le hablen por la tarde; el niño tiene miedo a los gritos";
  assert.equal((await m.asesorNorte.patch(`/api/leads/${lead.leadId}/etapa`, { etapa_id: contactado.id, nota })).estado, 200);

  type Historial = { cambios: { hacia: unknown; nota: string | null }[] };
  const deAsesor = (await m.asesorNorte.get<Historial>(`/api/leads/${lead.leadId}/historial`)).cuerpo;
  assert.ok(deAsesor.cambios.some((c) => c.nota === nota), "el asesor ve su nota");
  assert.ok(((await m.admin.get<Historial>(`/api/leads/${lead.leadId}/historial`)).cuerpo).cambios.some((c) => c.nota === nota), "el administrador ve la nota");
  const recepcion = await m.recepcion.get<Historial>(`/api/leads/${lead.leadId}/historial`);
  assert.equal(recepcion.estado, 200);
  assert.equal(recepcion.cuerpo.cambios.length, deAsesor.cambios.length, "el avance sí se ve");
  assert.ok(recepcion.cuerpo.cambios.every((c) => c.nota === null), "ninguna nota");
  assert.ok(!JSON.stringify(recepcion.cuerpo).includes("miedo"));

  // La salud es del administrador y del maestro: recepción recibe 403 al leer y al escribir.
  const a = await m.alumno();
  assert.equal((await m.recepcion.get(`/api/salud/alumno/${a.alumnoId}`)).estado, 403);
  assert.equal((await m.recepcion.put(`/api/salud/alumno/${a.alumnoId}`, { motivo: "x", alergias: "ninguna" })).estado, 403);
  // Ni el expediente del alumno trae nada de salud para recepción.
  const exp = await m.recepcion.get(`/api/alumnos/${a.alumnoId}/expediente`);
  assert.equal(exp.estado, 200);
  assert.ok(!/alergia|medicament|condiciones_medicas|contacto_emergencia/i.test(JSON.stringify(exp.cuerpo)), "el expediente de recepción no lleva salud");
});
