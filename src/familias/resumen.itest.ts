// R6b: lo que «Familias» y «Ficha de la familia» muestran junto a cada tutor — `GET /api/familias/resumen` (disciplina con su color, grupo, horario, sucursal, promoción y estado de la cuenta, en
// lote) y `GET /api/familias/:id/mensajes` (promociones, recordatorio de pago, asesor y conversación). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

interface Resumen {
  datos: {
    tutor_id: string;
    saldo: { estado: string; cargos_vencidos: number; vencido: string } | null;
    hijos: { alumno_id: string; inscripciones: { grupo: { nombre: string }; disciplina: { id: string; nombre: string; color_marca: string | null }; sucursal: { id: string; nombre: string }; horarios: { dia_semana: number }[]; promocion: { nombre: string } | null; descuento_mensualidad: string | null }[] }[];
  }[];
}
interface Mensajes {
  promociones: string;
  recordatorio_de_pago: string | null;
  asesor: string | null;
  conversacion: { chatwoot: { conversacion_id: number } } | null;
}

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Resumen de familias");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const resumen = (cliente: MundoDeFinanzas["admin"], ids: string[]) => cliente.get<Resumen>(`/api/familias/resumen?tutor_ids=${ids.join(",")}`);
const mensajes = (cliente: MundoDeFinanzas["admin"], id: string) => cliente.get<Mensajes>(`/api/familias/${id}/mensajes`);

test("el resumen trae por hijo su inscripción activa con disciplina (color), grupo, horario y sucursal, y el estado de la cuenta de cada familia", async () => {
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { color_marca: "#C0502D" } });
  const conAtraso = await m.inscribir();
  const hermano = await m.inscribir({ conTutor: conAtraso.tutorId });
  const sinDeuda = await m.inscribir();
  // La primera familia debe lo que ya venció; la segunda no debe nada: sus cargos de la inscripción se saldan.
  await m.recepcion.post("/api/cargos", { alumno_id: conAtraso.alumnoId, descripcion: "Vencido", monto: "650.00", fecha_vencimiento: "2026-10-01" });
  const saldo = await m.recepcion.get<{ resumen: { saldo: string } }>(`/api/tutores/${sinDeuda.tutorId}/estado-cuenta`);
  assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: sinDeuda.tutorId, monto: saldo.cuerpo.resumen.saldo, metodo: "efectivo" })).estado, 201);

  const r = await resumen(m.recepcion, [conAtraso.tutorId, sinDeuda.tutorId]);
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual(r.cuerpo.datos.map((f) => f.tutor_id), [conAtraso.tutorId, sinDeuda.tutorId], "en el orden pedido");
  const [a, b] = r.cuerpo.datos as [Resumen["datos"][number], Resumen["datos"][number]];
  assert.equal(a.saldo?.estado, "con_vencido");
  assert.equal(a.saldo?.cargos_vencidos >= 1, true);
  assert.equal(b.saldo?.estado, "al_corriente");
  assert.deepEqual(a.hijos.map((h) => h.alumno_id).sort(), [conAtraso.alumnoId, hermano.alumnoId].sort(), "los dos hermanos cuelgan del mismo tutor");
  const insc = a.hijos.find((h) => h.alumno_id === conAtraso.alumnoId)!.inscripciones;
  assert.equal(insc.length, 1);
  assert.equal(insc[0]!.disciplina.color_marca, "#C0502D");
  assert.equal(insc[0]!.disciplina.id, m.org.verticalId);
  assert.equal(insc[0]!.sucursal.id, m.norte);
  assert.equal(insc[0]!.horarios.length, 1);
  assert.equal(insc[0]!.promocion, null);
  assert.equal(insc[0]!.descuento_mensualidad, "0.00");
});

test("una familia que solo debe lo que aún no vence está «por pagar»; sin inscripción activa el hijo no trae disciplina", async () => {
  const solo = await m.alumno();
  assert.equal((await m.recepcion.post("/api/cargos", { alumno_id: solo.alumnoId, descripcion: "Por vencer", monto: "300.00", fecha_vencimiento: "2026-12-30" })).estado, 201);
  const r = await resumen(m.admin, [solo.tutorId]);
  assert.deepEqual(r.cuerpo.datos[0]!.saldo, { estado: "por_pagar", cargos_vencidos: 0, vencido: "0.00" });
  assert.deepEqual(r.cuerpo.datos[0]!.hijos.map((h) => h.inscripciones), [[]]);
  const limpia = await m.alumno();
  assert.equal((await resumen(m.admin, [limpia.tutorId])).cuerpo.datos[0]!.saldo?.estado, "al_corriente");
});

test("alcance y permisos: lo ajeno no aparece, el maestro no entra, los identificadores se validan y no hay fuga entre organizaciones", async () => {
  const norte = await m.inscribir({ sucursalId: m.norte });
  const sur = await m.inscribir({ sucursalId: m.sur });
  const r = await resumen(m.recepcion, [norte.tutorId, sur.tutorId]);
  assert.deepEqual(r.cuerpo.datos.map((f) => f.tutor_id), [norte.tutorId], "recepción del norte no ve la familia del sur");
  assert.equal((await resumen(m.maestro, [norte.tutorId])).estado, 403);
  assert.equal((await resumen(m.admin, ["no-es-un-uuid"])).estado, 400);
  assert.equal((await resumen(m.admin, [norte.tutorId, norte.tutorId])).estado, 400, "repetidos");
  const otro = await mundoDeFinanzas(prisma, "Resumen otra org");
  try {
    assert.deepEqual((await resumen(otro.admin, [norte.tutorId])).cuerpo.datos, [], "no hay fuga entre organizaciones");
    assert.equal((await mensajes(otro.admin, norte.tutorId)).estado, 404);
  } finally {
    await otro.cerrar();
  }
});

test("con finanzas apagado el saldo va en null (y la ruta de mensajes sigue en el módulo de inscripción)", async () => {
  const f = await m.inscribir();
  assert.equal((await m.admin.put("/api/modulos", { finanzas: false, tableros: false })).estado, 200);
  try {
    const r = await resumen(m.admin, [f.tutorId]);
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.datos[0]!.saldo, null);
    assert.equal((await mensajes(m.admin, f.tutorId)).cuerpo.recordatorio_de_pago, null);
  } finally {
    assert.equal((await m.admin.put("/api/modulos", { finanzas: true, tableros: true })).estado, 200);
  }
});

test("mensajes: sin registro de consentimiento, con baja de marketing y con consentimiento; el asesor y la conversación salen del lead convertido en esta familia", async () => {
  const f = await m.inscribir();
  const tutor = await prisma.tutor.findFirstOrThrow({ where: { id: f.tutorId } });
  assert.equal((await mensajes(m.recepcion, f.tutorId)).cuerpo.promociones, "sin_registro");
  await prisma.consentimiento.create({ data: { organizacion_id: m.org.organizacionId, telefono: tutor.telefono, estado: "opt_in", alcance: "todo", origen: "manual", fecha: new Date("2026-11-01T00:00:00Z") } });
  assert.equal((await mensajes(m.recepcion, f.tutorId)).cuerpo.promociones, "acepta");
  await prisma.consentimiento.create({ data: { organizacion_id: m.org.organizacionId, telefono: tutor.telefono, estado: "opt_out", alcance: "marketing", origen: "manual", fecha: new Date("2026-11-05T00:00:00Z") } });
  assert.equal((await mensajes(m.recepcion, f.tutorId)).cuerpo.promociones, "no_acepta");

  const asesor = await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: m.org.organizacionId, rol: "asesor" } });
  const previo = await prisma.lead.findFirst({ where: { organizacion_id: m.org.organizacionId, telefono: tutor.telefono, eliminado_en: null } });
  const lead = previo
    ? await prisma.lead.update({ where: { id: previo.id }, data: { tutor_id: f.tutorId } })
    : await prisma.lead.create({ data: { organizacion_id: m.org.organizacionId, vertical_interes_id: m.org.verticalId, etapa_id: m.org.etapaInicialId, nombre_contacto: "Mamá", telefono: tutor.telefono, tutor_id: f.tutorId } });
  await prisma.conversacion.create({ data: { organizacion_id: m.org.organizacionId, bandeja_chatwoot_id: m.org.bandejaId, lead_id: lead.id, chatwoot_conversacion_id: 4242, asignada_a_usuario_id: asesor.id } });
  const r = await mensajes(m.recepcion, f.tutorId);
  assert.equal(r.cuerpo.asesor, asesor.nombre);
  assert.equal(r.cuerpo.conversacion?.chatwoot.conversacion_id, 4242);
  assert.equal(r.cuerpo.recordatorio_de_pago, null, "ningún recordatorio de pago ha salido");
  assert.equal((await mensajes(m.maestro, f.tutorId)).estado, 403);
});
