// D4: la API de asistencia (PATCH /api/clases-muestra/:id/asistencia): quién puede marcar (el maestro de ese grupo, el asesor de la sucursal y el
// administrador), transiciones válidas, idempotencia, corrección con ventana, registro de cambios y concurrencia por HTTP.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

// Martes 10 de noviembre de 2026, 12:00 en la Ciudad de México. Las cookies de sesión vencen con este reloj, así que va en el futuro cercano.
const AHORA = new Date("2026-11-10T18:00:00Z");
const HORA = 3_600_000;

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let etapas: Record<TipoDeEtapa, string>;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestroA: ClienteApi;
let maestroB: ClienteApi;
let norte: string;
let sur: string;
let grupoA: string;
let grupoB: string;
let grupoSur: string;
let usuarioAgenda: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Clase { id: string; estatus: string; asistencia_marcada_en: string | null; telefono?: string | null }
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string }[] } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "API asistencia");
  ajena = await sembrarOrganizacion(prisma, "API asistencia ajena");
  etapas = await sembrarEmbudo(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  const a = await entrar("administrador");
  admin = a.c;
  usuarioAgenda = a.id;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  const ma = await entrar("maestro");
  const mb = await entrar("maestro");
  maestroA = ma.c;
  maestroB = mb.c;
  const iA = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: ma.id, nombre: "Maestro A" } });
  const iB = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: mb.id, nombre: "Maestro B" } });
  const pn = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa norte", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Norte A", cupoMaximo: 50, horarios: [[1, 960, 1020]] }, { nombre: "Norte B", cupoMaximo: 50, horarios: [[1, 960, 1020]] }] });
  const ps = await sembrarPrograma(prisma, org, { sucursalId: sur, nombre: "Programa sur", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Sur A", cupoMaximo: 50, horarios: [[1, 960, 1020]] }] });
  grupoA = pn.grupos[0]!.id;
  grupoB = pn.grupos[1]!.id;
  grupoSur = ps.grupos[0]!.id;
  await prisma.grupo.update({ where: { id: grupoA }, data: { instructor_id: iA.id } });
  await prisma.grupo.update({ where: { id: grupoB }, data: { instructor_id: iB.id } });
  // La recuperación necesita su automatización y una conversación en cada familia.
  const plantilla = await prisma.plantilla_mensaje.create({ data: { organizacion_id: org.organizacionId, codigo: "recuperacion_no_asistio", content_sid: "HX0", categoria: "utility", variables: [{ pos: 1, nombre: "nombre_prospecto" }] as never, cuerpo_referencia: "No pudo asistir {{1}}", estado_aprobacion: "aprobada" } });
  await prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre: "Recuperación", evento_disparador: "clase_muestra_no_asistio", offset_minutos: 120, espaciado_minutos: 2880, plantilla_id: plantilla.id, max_intentos: 2, dias_permitidos: [0, 1, 2, 3, 4, 5, 6] } });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

/** Una clase muestra insertada directo (el reloj de la API está en el futuro: así hay clases que ya empezaron). */
async function clase(grupoId: string, o: { fecha?: Date; sucursalId?: string; estatus?: "agendada" | "cancelada" | "reagendada" } = {}) {
  const f = await sembrarFamilia(prisma, org, { sucursalId: o.sucursalId ?? norte });
  const c = await prisma.clase_muestra.create({
    data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: grupoId, fecha_hora: o.fecha ?? new Date("2026-11-09T22:00:00Z"), agendada_por: "usuario", agendada_por_usuario_id: usuarioAgenda, estatus: o.estatus ?? "agendada" },
  });
  return { id: c.id, leadId: f.leadId };
}
const marcar = (c: ClienteApi, id: string, estatus: unknown) => c.patch<Clase & Errores>(`/api/clases-muestra/${id}/asistencia`, { estatus });

test("D4 API: el maestro de ese grupo marca «asistió»: la respuesta trae la marca, el lead avanza de etapa y queda en el registro de cambios", async () => {
  const c = await clase(grupoA);
  const r = await marcar(maestroA, c.id, "asistio");
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.estatus, "asistio");
  assert.equal(r.cuerpo.asistencia_marcada_en, AHORA.toISOString());
  assert.equal(r.cuerpo.telefono, undefined, "el maestro no ve el teléfono de la familia");
  assert.equal((await db().lead.findFirstOrThrow({ where: { id: c.leadId } })).etapa_id !== etapas.nuevo, true);
  const cambios = await db().registro_cambio.findMany({ where: { entidad_tipo: "clase_muestra", entidad_id: c.id } });
  assert.equal(cambios.length, 1);
  assert.deepEqual([cambios[0]!.accion, (cambios[0]!.antes as { estatus: string }).estatus, (cambios[0]!.despues as { estatus: string }).estatus], ["actualizar", "agendada", "asistio"]);
  // Marcar lo mismo otra vez: 200 y NO se vuelve a registrar nada.
  assert.equal((await marcar(maestroA, c.id, "asistio")).estado, 200);
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "clase_muestra", entidad_id: c.id } }), 1);
});

test("D4 API: permisos y alcance — maestro de ese grupo, asesor de la sucursal y administrador sí; maestro de otro grupo, asesor de otra sucursal (404) y recepción (403) no", async () => {
  const c = await clase(grupoA);
  assert.equal((await marcar(recepcion, c.id, "asistio")).estado, 403);
  assert.equal((await marcar(maestroB, c.id, "asistio")).estado, 404, "el maestro de otro grupo");
  assert.equal((await marcar(asesorSur, c.id, "asistio")).estado, 404, "el asesor de otra sucursal");
  assert.equal((await marcar(api.cliente(), c.id, "asistio")).estado, 401);
  assert.equal((await db().clase_muestra.findFirstOrThrow({ where: { id: c.id } })).estatus, "agendada");
  assert.equal((await marcar(asesorNorte, c.id, "no_asistio")).estado, 200);
  const d = await clase(grupoA);
  assert.equal((await marcar(admin, d.id, "asistio")).estado, 200);
  const e = await clase(grupoSur, { sucursalId: sur });
  assert.equal((await marcar(asesorSur, e.id, "asistio")).estado, 200);
  assert.equal((await marcar(asesorNorte, e.id, "asistio")).estado, 404);
  // Otra organización.
  const fa = await sembrarFamilia(prisma, ajena);
  const pa = await sembrarPrograma(prisma, ajena, { sucursalId: ajena.sucursales[0]!.id, nombre: "P", edadMin: 1, edadMax: 9, grupos: [{ nombre: "G", horarios: [[1, 960, 1020]] }] });
  const ajenaClase = await prisma.clase_muestra.create({ data: { organizacion_id: ajena.organizacionId, lead_id: fa.leadId, prospecto_id: fa.prospectoId, grupo_id: pa.grupos[0]!.id, fecha_hora: new Date("2026-11-09T22:00:00Z"), agendada_por: "usuario", agendada_por_usuario_id: (await prisma.usuario.create({ data: { organizacion_id: ajena.organizacionId, correo: `x-${Math.random()}@p.test`, nombre: "X", rol: "asesor", contrasena_hash: "x" } })).id } });
  assert.equal((await marcar(admin, ajenaClase.id, "asistio")).estado, 404);
});

test("D4 API: no antes de la hora de la clase (409), no a una clase cancelada o reagendada (409), y la entrada se valida (400)", async () => {
  const futura = await clase(grupoA, { fecha: new Date(AHORA.getTime() + HORA) });
  const r = await marcar(maestroA, futura.id, "asistio");
  assert.equal(r.estado, 409);
  assert.match(r.cuerpo.error.mensaje, /todavía no empieza/);
  const justo = await clase(grupoA, { fecha: AHORA });
  assert.equal((await marcar(maestroA, justo.id, "asistio")).estado, 200, "a la hora exacta ya se puede");
  const cancelada = await clase(grupoA, { estatus: "cancelada" });
  assert.equal((await marcar(maestroA, cancelada.id, "asistio")).estado, 409);
  const reagendada = await clase(grupoA, { estatus: "reagendada" });
  assert.equal((await marcar(maestroA, reagendada.id, "no_asistio")).estado, 409);
  const c = await clase(grupoA);
  for (const mal of ["agendada", "cancelada", "otra", "", 1, null]) {
    const x = await marcar(maestroA, c.id, mal);
    assert.equal(x.estado, 400, String(mal));
    assert.ok(x.cuerpo.error.detalles?.some((d) => d.campo === "estatus"));
  }
  assert.equal((await maestroA.patch(`/api/clases-muestra/${c.id}/asistencia`, { estatus: "asistio", nota: "x" })).estado, 400);
  assert.equal((await maestroA.patch(`/api/clases-muestra/${c.id}/asistencia`, {})).estado, 400);
  assert.equal((await maestroA.patch("/api/clases-muestra/no-es-uuid/asistencia", { estatus: "asistio" })).estado, 400);
  assert.equal((await maestroA.patch("/api/clases-muestra/00000000-0000-4000-8000-0000000000aa/asistencia", { estatus: "asistio" })).estado, 404);
  assert.equal((await db().clase_muestra.findFirstOrThrow({ where: { id: c.id } })).estatus, "agendada");
});

test("D4 API: «no asistió» programa la recuperación y deja la tarea de llamar; corregir a «asistió» dentro de la ventana la deshace; fuera de ella, 409", async () => {
  await fijarConfiguracion(prisma, org.organizacionId, { clase_muestra_correccion_horas: 24 });
  const c = await clase(grupoA);
  const f = await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: c.leadId, chatwoot_conversacion_id: Math.floor(Math.random() * 1e9) + 1 } });
  assert.ok(f.id);
  assert.equal((await marcar(maestroA, c.id, "no_asistio")).estado, 200);
  assert.equal(await db().automatizacion_ejecucion.count({ where: { entidad_id: c.id, estatus: "programado" } }), 2);
  const tarea = await db().tarea_asesor.findFirstOrThrow({ where: { clase_muestra_id: c.id, tipo: "llamar_no_asistio" } });
  assert.equal(tarea.estado, "pendiente");
  // La tarea la ve el asesor por la API de tareas.
  const lista = await asesorNorte.get<{ datos: { id: string; tipo: string }[] }>("/api/tareas?tipo=llamar_no_asistio&limite=100");
  assert.ok(lista.cuerpo.datos.some((t) => t.id === tarea.id));
  assert.equal((await marcar(maestroA, c.id, "asistio")).estado, 200, "corrección dentro de la ventana");
  assert.equal(await db().automatizacion_ejecucion.count({ where: { entidad_id: c.id, estatus: "programado" } }), 0);
  assert.equal((await db().tarea_asesor.findFirstOrThrow({ where: { id: tarea.id } })).estado, "descartada");
  // Fuera de la ventana: la marca fue «ahora»; se retrocede 25 h y la corrección ya no se admite.
  await prisma.clase_muestra.update({ where: { id: c.id }, data: { asistencia_marcada_en: new Date(AHORA.getTime() - 25 * HORA) } });
  const tarde = await marcar(maestroA, c.id, "no_asistio");
  assert.equal(tarde.estado, 409);
  assert.match(tarde.cuerpo.error.mensaje, /tiempo para corregir/);
  assert.equal((await marcar(maestroA, c.id, "asistio")).estado, 200, "lo mismo sigue siendo idempotente");
  const cambios = await db().registro_cambio.count({ where: { entidad_tipo: "clase_muestra", entidad_id: c.id } });
  assert.equal(cambios, 2, "la marca y la corrección");
});

test("D4 API (concurrencia): seis marcas «no asistió» a la vez por HTTP → todas 200, UN solo cambio registrado, 2 intentos y UNA tarea", async () => {
  const c = await clase(grupoA);
  const clientes = [maestroA, asesorNorte, admin, maestroA, asesorNorte, admin];
  const rs = await Promise.all(clientes.map((cl) => marcar(cl, c.id, "no_asistio")));
  assert.deepEqual(rs.map((r) => r.estado), [200, 200, 200, 200, 200, 200]);
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "clase_muestra", entidad_id: c.id } }), 1);
  assert.equal(await db().automatizacion_ejecucion.count({ where: { entidad_id: c.id } }), 2);
  assert.equal(await db().tarea_asesor.count({ where: { clase_muestra_id: c.id, tipo: "llamar_no_asistio" } }), 1);
});

test("D4 API: el maestro ve la asistencia en su lista de clases del día", async () => {
  const c = await clase(grupoA, { fecha: new Date(AHORA.getTime() - 2 * HORA) });
  await marcar(maestroA, c.id, "asistio");
  const lista = await maestroA.get<{ datos: Clase[] }>("/api/maestro/clases-muestra?limite=100");
  const ella = lista.cuerpo.datos.find((x) => x.id === c.id)!;
  assert.deepEqual([ella.estatus, ella.asistencia_marcada_en], ["asistio", AHORA.toISOString()]);
});
