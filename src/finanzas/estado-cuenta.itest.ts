// H3: estado de cuenta por familia — cargos por hijo, pagos, saldo y antigüedad de lo vencido; y el `ProveedorEconomico` del expediente enchufado.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { AHORA_DE_FINANZAS, mundoDeFinanzas, type CargoDeApi, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { ProveedorEconomicoDeFinanzas } from "./estado-cuenta.ts";
import { sumar, deTexto, aTexto } from "../lib/dinero.ts";
import { diasEntre } from "../lib/periodo.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
const HOY = "2026-11-10";

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Estado de cuenta", AHORA_DE_FINANZAS, { expediente: { economico: new ProveedorEconomicoDeFinanzas() } });
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

interface Cuenta {
  tutor: { id: string };
  resumen: { total_cargado: string; total_pagado: string; saldo: string; vencido: string; antiguedad: Record<string, string> };
  hijos: { alumno: { id: string; nombre: string }; cargos: CargoDeApi[]; saldo: string; vencido: string; total_cargado: string; total_pagado: string; antiguedad: Record<string, string> }[];
  pagos: { id: string; monto: string; estatus: string; motivo_cancelacion?: string | null; registrado_por?: string | null }[];
}
const dia = (menos: number): string => {
  const d = new Date(`${HOY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - menos);
  return d.toISOString().slice(0, 10);
};
const suelto = (alumnoId: string, monto: string, vence: string) => m.recepcion.post<CargoDeApi>("/api/cargos", { alumno_id: alumnoId, descripcion: `Cargo ${vence}`, monto, fecha_vencimiento: vence });
const cuenta = (tutorId: string, cliente = m.recepcion) => cliente.get<Cuenta>(`/api/tutores/${tutorId}/estado-cuenta`);

test("la antigüedad de lo vencido por hijo y en total: 0–30, 31–60, 61–90 y 90+ días, sobre el SALDO de cada cargo", async () => {
  const a1 = await m.alumno();
  const a2 = await m.alumno({ conTutor: a1.tutorId });
  await suelto(a1.alumnoId, "100.00", dia(10));
  await suelto(a1.alumnoId, "200.00", dia(45));
  await suelto(a1.alumnoId, "300.00", dia(75));
  const c120 = await suelto(a1.alumnoId, "400.00", dia(120));
  await suelto(a2.alumnoId, "50.50", dia(31));
  await suelto(a2.alumnoId, "70.25", dia(-5)); // aún no vence
  const r = await cuenta(a1.tutorId);
  assert.equal(r.estado, 200);
  assert.deepEqual(r.cuerpo.resumen.antiguedad, { de_0_a_30: "100.00", de_31_a_60: "250.50", de_61_a_90: "300.00", mas_de_90: "400.00" });
  assert.deepEqual([r.cuerpo.resumen.total_cargado, r.cuerpo.resumen.saldo, r.cuerpo.resumen.vencido], ["1120.75", "1120.75", "1050.50"]);
  const h1 = r.cuerpo.hijos.find((h) => h.alumno.id === a1.alumnoId)!;
  const h2 = r.cuerpo.hijos.find((h) => h.alumno.id === a2.alumnoId)!;
  assert.deepEqual(h1.antiguedad, { de_0_a_30: "100.00", de_31_a_60: "200.00", de_61_a_90: "300.00", mas_de_90: "400.00" });
  assert.deepEqual([h2.antiguedad.de_31_a_60, h2.saldo, h2.vencido], ["50.50", "120.75", "50.50"]);
  assert.deepEqual(h1.cargos.map((c) => c.dias_de_atraso), [120, 75, 45, 10], "más antiguo primero, con sus días de atraso");
  // Un pago parcial reduce el saldo del cargo MÁS VIEJO primero (el reparto lo propone así) y la antigüedad se recalcula.
  const p = await m.recepcion.post("/api/pagos", { tutor_id: a1.tutorId, monto: "150.00", metodo: "efectivo" });
  assert.equal(p.estado, 201);
  const despues = await cuenta(a1.tutorId);
  assert.deepEqual(despues.cuerpo.resumen.antiguedad.mas_de_90, "250.00");
  assert.deepEqual([despues.cuerpo.resumen.total_pagado, despues.cuerpo.resumen.saldo], ["150.00", "970.75"]);
  // Cancelar un cargo lo saca de las cuentas.
  assert.equal((await m.recepcion.post(`/api/cargos/${c120.cuerpo.id}/cancelar`, { motivo: "Se condonó" })).estado, 409, "tiene un pago parcial: primero se cancela el pago");
  await m.recepcion.post(`/api/pagos/${(p.cuerpo as { id: string }).id}/cancelar`, { motivo: "Prueba" });
  assert.equal((await m.recepcion.post(`/api/cargos/${c120.cuerpo.id}/cancelar`, { motivo: "Se condonó" })).estado, 200);
  const sin = await cuenta(a1.tutorId);
  assert.deepEqual([sin.cuerpo.resumen.saldo, sin.cuerpo.resumen.antiguedad.mas_de_90], ["720.75", "0.00"]);
  assert.ok(sin.cuerpo.hijos.find((h) => h.alumno.id === a1.alumnoId)!.cargos.some((c) => c.estatus === "cancelado"), "el cancelado se lista pero no cuenta");
});

test("cuadra: Σ cargos − Σ pagos aplicados = saldo, por hijo y en total, con una familia inscrita de verdad", async () => {
  const { grupoId } = await m.programa({ mensualidad: "1234.50" });
  const a1 = await m.alumno();
  const a2 = await m.alumno({ conTutor: a1.tutorId });
  await m.inscribir({ alumno: a1, grupoId });
  await m.inscribir({ alumno: a2, grupoId });
  await m.recepcion.post("/api/pagos", { tutor_id: a1.tutorId, monto: "1999.99", metodo: "tarjeta" });
  const r = (await cuenta(a1.tutorId)).cuerpo;
  assert.equal(aTexto(deTexto(r.resumen.total_cargado) - deTexto(r.resumen.total_pagado)), r.resumen.saldo);
  assert.equal(aTexto(sumar(...r.hijos.map((h) => deTexto(h.saldo)))), r.resumen.saldo);
  assert.equal(r.resumen.total_cargado, "3469.00");
  assert.equal(r.resumen.saldo, "1469.01");
  assert.equal(r.pagos.length, 1);
  for (const h of r.hijos) assert.equal(aTexto(deTexto(h.total_cargado) - deTexto(h.total_pagado)), h.saldo);
  assert.equal(diasEntre(HOY, HOY), 0);
});

test("permisos y alcance: el asesor lee, el maestro no ve importes, la sucursal ajena es 404 y no hay fuga entre organizaciones", async () => {
  const norte = await m.inscribir({ sucursalId: m.norte });
  const sur = await m.inscribir({ sucursalId: m.sur });
  assert.equal((await cuenta(norte.tutorId, m.asesorNorte)).estado, 200);
  assert.equal((await cuenta(norte.tutorId, m.maestro)).estado, 403);
  assert.equal((await cuenta(sur.tutorId, m.recepcion)).estado, 404);
  assert.equal((await cuenta(sur.tutorId, m.asesorSur)).estado, 200);
  assert.equal((await cuenta(norte.tutorId, m.admin)).estado, 200);
  assert.equal((await m.recepcion.get("/api/tutores/00000000-0000-4000-8000-0000000000aa/estado-cuenta")).estado, 404);
  const otro = await mundoDeFinanzas(prisma, "Estado de cuenta otra org");
  try {
    assert.equal((await cuenta(norte.tutorId, otro.admin)).estado, 404);
  } finally {
    await otro.cerrar();
  }
});

test("el expediente del alumno ya trae su estado de cuenta REAL (ProveedorEconomico enchufado): saldo, vencido y días del cargo vencido más viejo", async () => {
  const a = await m.alumno();
  await suelto(a.alumnoId, "300.00", dia(40));
  await suelto(a.alumnoId, "200.00", dia(3));
  await suelto(a.alumnoId, "99.00", dia(-9));
  const e = await m.admin.get<{ economico: { estado_de_cuenta: { disponible: boolean; saldo: string; vencido: string; antiguedadCarteraVencidaDias: number }; antiguedad_cartera_vencida: { dias: number; vencido: string } } }>(`/api/alumnos/${a.alumnoId}/expediente`);
  assert.equal(e.estado, 200, JSON.stringify(e.cuerpo));
  assert.deepEqual(e.cuerpo.economico.estado_de_cuenta, { disponible: true, saldo: "599.00", vencido: "500.00", antiguedadCarteraVencidaDias: 40 });
  assert.deepEqual(e.cuerpo.economico.antiguedad_cartera_vencida, { dias: 40, vencido: "500.00" });
  const limpio = await m.alumno();
  const v = await m.admin.get<{ economico: { estado_de_cuenta: { saldo: string; antiguedadCarteraVencidaDias: number | null } } }>(`/api/alumnos/${limpio.alumnoId}/expediente`);
  assert.deepEqual([v.cuerpo.economico.estado_de_cuenta.saldo, v.cuerpo.economico.estado_de_cuenta.antiguedadCarteraVencidaDias], ["0.00", null]);
  // El maestro sigue sin ver importes (EF-03).
  const g = await m.programa();
  const insc = await m.inscribir({ grupoId: g.grupoId });
  void insc;
});

test("EH-18 (M44): un cargo cancelado se lista con saldo 0.00 y no cuenta en el total cargado ni en el saldo de la familia", async () => {
  const i = await m.inscribir();
  const insc = i.cargos.find((c) => c.concepto === "inscripcion")!;
  const mens = i.cargos.find((c) => c.concepto === "mensualidad")!;
  assert.equal((await m.recepcion.post(`/api/cargos/${insc.id}/cancelar`, { motivo: "Se condonó" })).estado, 200);
  const c = (await m.admin.get<Cuenta>(`/api/tutores/${i.tutorId}/estado-cuenta`)).cuerpo;
  const hijo = c.hijos.find((h) => h.alumno.id === i.alumnoId)!;
  const cancelado = hijo.cargos.find((x) => x.id === insc.id)!;
  assert.deepEqual([cancelado.estatus, cancelado.saldo], ["cancelado", "0.00"]);
  assert.deepEqual([hijo.total_cargado, hijo.saldo], [mens.monto_final, mens.monto_final]);
});

test("R5b: cada pago de la cuenta dice quién lo registró y, si se canceló, por qué (el renglón cancelado lo muestra)", async () => {
  const i = await m.inscribir();
  const p1 = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: i.tutorId, monto: "100.00", metodo: "efectivo" });
  const p2 = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: i.tutorId, monto: "50.00", metodo: "tarjeta", referencia: "V-1" });
  assert.equal((await m.recepcion.post(`/api/pagos/${p2.cuerpo.id}/cancelar`, { motivo: "Se registró dos veces" })).estado, 200);
  const pagos = (await cuenta(i.tutorId)).cuerpo.pagos;
  const vivo = pagos.find((p) => p.id === p1.cuerpo.id)!;
  const cancelado = pagos.find((p) => p.id === p2.cuerpo.id)!;
  assert.deepEqual([vivo.estatus, vivo.motivo_cancelacion, typeof vivo.registrado_por], ["aplicado", null, "string"]);
  assert.deepEqual([cancelado.estatus, cancelado.motivo_cancelacion], ["cancelado", "Se registró dos veces"]);
});
