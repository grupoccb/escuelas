// R9b: el filtro `con_atraso` de `GET /api/tutores` y `GET /api/alumnos` — familias y alumnos con al menos un cargo VENCIDO con saldo, con la misma definición que
// `cartera_vencida.familias` del tablero ejecutivo. Postgres real, la app real. Reloj: 10 de noviembre de 2026, 10:00 en la Ciudad de México.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

interface Tutores { datos: { id: string }[]; paginacion: { total: number } }
interface Alumnos { datos: { id: string }[]; paginacion: { total: number } }

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Con atraso");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const tutores = (c: MundoDeFinanzas["admin"], qs = "con_atraso=true") => c.get<Tutores>(`/api/tutores?${qs}${qs.includes("limite=") ? "" : "&limite=100"}`);
const alumnos = (c: MundoDeFinanzas["admin"], qs = "con_atraso=true") => c.get<Alumnos>(`/api/alumnos?${qs}${qs.includes("limite=") ? "" : "&limite=100"}`);
const cargo = (alumnoId: string, monto: string, vence: string) => m.recepcion.post("/api/cargos", { alumno_id: alumnoId, descripcion: "Prueba", monto, fecha_vencimiento: vence });

test("con_atraso solo deja las familias y los alumnos con un cargo vencido y con saldo; lo que aún no vence, lo saldado y lo cancelado no cuentan", async () => {
  const vencida = await m.alumno();
  const porVencer = await m.alumno();
  const saldada = await m.alumno();
  const cancelada = await m.alumno();
  const limpia = await m.alumno();
  assert.equal((await cargo(vencida.alumnoId, "650.00", "2026-10-01")).estado, 201);
  assert.equal((await cargo(porVencer.alumnoId, "300.00", "2026-12-30")).estado, 201);
  assert.equal((await cargo(saldada.alumnoId, "200.00", "2026-10-02")).estado, 201);
  assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: saldada.tutorId, monto: "200.00", metodo: "efectivo" })).estado, 201);
  const aCancelar = await cargo(cancelada.alumnoId, "100.00", "2026-10-03");
  assert.equal(aCancelar.estado, 201);
  assert.equal((await m.admin.post(`/api/cargos/${(aCancelar.cuerpo as { id: string }).id}/cancelar`, { motivo: "Error de captura" })).estado, 200);

  const t = await tutores(m.admin);
  assert.equal(t.estado, 200, JSON.stringify(t.cuerpo));
  const ids = t.cuerpo.datos.map((x) => x.id);
  assert.equal(ids.includes(vencida.tutorId), true, "con un cargo vencido y saldo: entra");
  for (const fuera of [porVencer, saldada, cancelada, limpia]) assert.equal(ids.includes(fuera.tutorId), false);
  assert.equal(t.cuerpo.paginacion.total, ids.length);

  const a = await alumnos(m.admin);
  assert.equal(a.estado, 200);
  const aids = a.cuerpo.datos.map((x) => x.id);
  assert.equal(aids.includes(vencida.alumnoId), true);
  for (const fuera of [porVencer, saldada, cancelada, limpia]) assert.equal(aids.includes(fuera.alumnoId), false);

  // Sin el filtro (o en false) la lista es la de siempre.
  assert.equal((await tutores(m.admin, "con_atraso=false")).cuerpo.datos.some((x) => x.id === limpia.tutorId), true);
  assert.equal((await tutores(m.admin, "limite=100")).cuerpo.datos.some((x) => x.id === limpia.tutorId), true);
  assert.equal((await tutores(m.admin, "con_atraso=si")).estado, 400);
});

test("el filtro coincide con la tarjeta de la familia y con las familias con atraso del ejecutivo, y se combina con la búsqueda por nombre", async () => {
  const f = await m.inscribir();
  assert.equal((await cargo(f.alumnoId, "75.50", "2026-11-01")).estado, 201);
  const resumen = await m.admin.get<{ datos: { saldo: { estado: string } }[] }>(`/api/familias/resumen?tutor_ids=${f.tutorId}`);
  assert.equal(resumen.cuerpo.datos[0]!.saldo.estado, "con_vencido");
  const t = await tutores(m.admin);
  assert.equal(t.cuerpo.datos.some((x) => x.id === f.tutorId), true);
  const ejecutivo = await m.admin.get<{ cartera_vencida: { familias: number } }>("/api/reportes/ejecutivo");
  assert.equal(t.cuerpo.paginacion.total, ejecutivo.cuerpo.cartera_vencida.familias, "las mismas familias que cuenta el tablero");
  const alumno = await prisma.alumno.findFirstOrThrow({ where: { id: f.alumnoId } });
  const porNombre = await tutores(m.admin, `con_atraso=true&nombre=${encodeURIComponent(alumno.nombre)}`);
  assert.deepEqual(porNombre.cuerpo.datos.map((x) => x.id), [f.tutorId]);
  assert.equal((await tutores(m.admin, `con_atraso=true&sucursal_id=${m.sur}`)).cuerpo.datos.some((x) => x.id === f.tutorId), false, "se combina con los demás filtros");
});

test("el atraso se mide en el calendario de la sucursal: el mismo día, vencido para quien ya cambió de fecha", async () => {
  const f = await m.alumno();
  assert.equal((await cargo(f.alumnoId, "50.00", "2026-11-10")).estado, 201);
  assert.equal((await tutores(m.admin)).cuerpo.datos.some((x) => x.id === f.tutorId), false, "vence hoy: aún no está vencido");
  m.reloj.ahora = new Date("2026-11-11T16:00:00Z");
  try {
    assert.equal((await tutores(m.admin)).cuerpo.datos.some((x) => x.id === f.tutorId), true, "al día siguiente sí");
  } finally {
    m.reloj.ahora = new Date("2026-11-10T16:00:00Z");
  }
});

test("alcance y permisos: recepción del norte no ve el atraso del sur, el maestro no filtra por cobranza, con finanzas apagado se rechaza y no hay fuga entre organizaciones", async () => {
  const norte = await m.alumno({ sucursalId: m.norte });
  const sur = await m.alumno({ sucursalId: m.sur });
  assert.equal((await cargo(norte.alumnoId, "10.00", "2026-10-01")).estado, 201);
  assert.equal((await m.admin.post("/api/cargos", { alumno_id: sur.alumnoId, descripcion: "Sur", monto: "10.00", fecha_vencimiento: "2026-10-01" })).estado, 201);
  const r = (await tutores(m.recepcion)).cuerpo.datos.map((x) => x.id);
  assert.equal(r.includes(norte.tutorId), true);
  assert.equal(r.includes(sur.tutorId), false, "lo ajeno no aparece");
  assert.equal((await tutores(m.admin)).cuerpo.datos.some((x) => x.id === sur.tutorId), true);
  assert.equal((await alumnos(m.maestro)).estado, 403, "el maestro no ve cobranza");
  assert.equal((await alumnos(m.maestro, "limite=10")).estado, 200, "sin el filtro, su lista de siempre");

  const otro = await mundoDeFinanzas(prisma, "Con atraso otra org");
  try {
    assert.deepEqual((await tutores(otro.admin)).cuerpo.datos, [], "no hay fuga entre organizaciones");
    assert.deepEqual((await alumnos(otro.admin)).cuerpo.datos, []);
  } finally {
    await otro.cerrar();
  }

  assert.equal((await m.admin.put("/api/modulos", { finanzas: false, tableros: false })).estado, 200);
  try {
    assert.equal((await tutores(m.admin)).estado, 400);
    assert.equal((await tutores(m.admin, "limite=10")).estado, 200);
  } finally {
    assert.equal((await m.admin.put("/api/modulos", { finanzas: true, tableros: true })).estado, 200);
  }
});
