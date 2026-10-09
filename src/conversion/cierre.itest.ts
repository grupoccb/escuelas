// F6: quién cierra la inscripción, por configuración. Postgres real, la app real: «listo para cerrar» (etapa, tarea, idempotencia, alcance) y los
// dos modos (`asesor_whatsapp` por omisión, `maestro_en_sitio`) cambiando SOLO la configuración, sin tocar código.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarDocumentosLegales, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

const AHORA = new Date("2026-11-10T18:00:00Z");
let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let docs: DocumentosLegalesSembrados;
let etapas: Record<TipoDeEtapa, string>;
let admin: ClienteApi;
let adminId: string;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let otroMaestro: ClienteApi;
let norte: string;
let sur: string;
let gMaestro: { programaId: string; grupoId: string };
let gOtro: { programaId: string; grupoId: string };
const db = () => conAlcance(prisma, org.organizacionId);
const cifrador = crearCifrador(randomBytes(32));

interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Listo { clase_id: string; lead_id: string; creado: boolean; etapa_movida: boolean; tarea_id: string | null }
interface Previa { listo: boolean; faltantes: { campo: string }[]; previsiones: { prospecto_id: string; grupo_nombre: string | null }[] }

let n = 0;
async function grupo(instructorId: string, sucursalId = norte) {
  const p = await sembrarPrograma(prisma, org, { sucursalId, nombre: `Programa ${++n}`, edadMin: 3, edadMax: 14, grupos: [{ nombre: `Grupo ${n}`, cupoMaximo: 20, horarios: [[n % 7, 480 + (n % 10) * 60, 530 + (n % 10) * 60]] }], precio: { inscripcion: "500.00", mensualidad: "800.00" } });
  await prisma.grupo.update({ where: { id: p.grupos[0]!.id }, data: { instructor_id: instructorId } });
  return { programaId: p.id, grupoId: p.grupos[0]!.id };
}

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador } });
  org = await sembrarOrganizacion(prisma, "Modo de cierre");
  etapas = await sembrarEmbudo(prisma, org);
  docs = await sembrarDocumentosLegales(prisma, org);
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
  adminId = a.id;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  const m1 = await entrar("maestro");
  const m2 = await entrar("maestro");
  maestro = m1.c;
  otroMaestro = m2.c;
  const i1 = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: m1.id, nombre: "Maestro uno" } });
  const i2 = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: m2.id, nombre: "Maestro dos" } });
  gMaestro = await grupo(i1.id);
  gOtro = await grupo(i2.id);
});
after(async () => {
  await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "asesor_whatsapp" });
  await api.cerrar();
  await prisma.$disconnect();
});

/** Un lead cuyo hijo terminó su clase muestra en el grupo dado (asistió), con el reglamento aceptado. */
async function leadConClase(g: { programaId: string; grupoId: string }, o: { etapa?: TipoDeEtapa; estatus?: "asistio" | "agendada"; cotizar?: boolean } = {}) {
  const f = await sembrarFamilia(prisma, org, { sucursalId: norte, etapaId: etapas[o.etapa ?? "muestra_asistida"] });
  const clase = await prisma.clase_muestra.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: g.grupoId, fecha_hora: new Date("2026-11-09T22:00:00Z"), agendada_por: "usuario", agendada_por_usuario_id: adminId, estatus: o.estatus ?? "asistio" } });
  const d = await prisma.documento_legal.findFirstOrThrow({ where: { id: docs.reglamento } });
  await prisma.aceptacion_legal.create({ data: { organizacion_id: org.organizacionId, documento_id: d.id, tipo: "reglamento", version_aceptada: 1, resultado: "aceptada", lead_id: f.leadId, prospecto_id: f.prospectoId, aceptante_nombre: "Mamá", canal: "presencial", aceptado_en: AHORA, texto_hash: d.texto_hash } });
  if (o.cotizar !== false) await prisma.cotizacion.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, programa_id: g.programaId, sucursal_id: norte, origen: "asesor", creado_por_usuario_id: adminId, grupo_elegido_id: g.grupoId, fecha: new Date("2026-11-09"), vigente_hasta: new Date("2026-11-16"), snapshot: {} } });
  return { ...f, claseId: clase.id };
}
const listo = (c: ClienteApi, claseId: string) => c.post<Listo & Errores>(`/api/clases-muestra/${claseId}/listo-para-cerrar`, {});
const completar = (f: { prospectoId: string }) => ({ tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.prospectoId, alumno: { apellidos: "Soto", fecha_nacimiento: "2018-05-04" } }] });

test("«listo para cerrar»: el maestro de la clase la marca; el lead pasa a negociación con historial, el asesor recibe UNA tarea y se puede repetir sin duplicar", async () => {
  const f = await leadConClase(gMaestro);
  const r = await listo(maestro, f.claseId);
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.creado, r.cuerpo.etapa_movida, r.cuerpo.lead_id], [true, true, f.leadId]);
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, etapas.negociacion);
  const hist = await prisma.lead_etapa_historial.findMany({ where: { lead_id: f.leadId, etapa_nueva_id: etapas.negociacion } });
  assert.deepEqual([hist.length, hist[0]!.origen, hist[0]!.motivo], [1, "sistema", "listo_para_cerrar"]);
  const clase = await prisma.clase_muestra.findFirstOrThrow({ where: { id: f.claseId } });
  assert.ok(clase.listo_para_cerrar_en && clase.listo_para_cerrar_por_usuario_id);
  const tareas = await prisma.tarea_asesor.findMany({ where: { lead_id: f.leadId, tipo: "listo_para_cerrar" } });
  assert.equal(tareas.length, 1);
  assert.equal(tareas[0]!.estado, "pendiente");
  // El asesor la ve en su lista de tareas.
  const lista = await asesorNorte.get<{ datos: { id: string; tipo: string }[] }>("/api/tareas?tipo=listo_para_cerrar&estado=pendiente");
  assert.ok(lista.cuerpo.datos.some((t) => t.id === tareas[0]!.id));
  // Repetir (el maestro o el asesor) no duplica nada.
  const otra = await listo(asesorNorte, f.claseId);
  assert.equal(otra.estado, 200);
  assert.equal(otra.cuerpo.creado, false);
  assert.equal(otra.cuerpo.tarea_id, tareas[0]!.id);
  assert.equal(await prisma.tarea_asesor.count({ where: { lead_id: f.leadId, tipo: "listo_para_cerrar" } }), 1);
  assert.equal(await prisma.lead_etapa_historial.count({ where: { lead_id: f.leadId, etapa_nueva_id: etapas.negociacion } }), 1);
  assert.ok((await db().registro_cambio.count({ where: { entidad_id: f.claseId, entidad_tipo: "clase_muestra" } })) >= 1);
});

test("«listo para cerrar»: alcance y reglas — otro maestro 404, asesor de otra sucursal 404, recepción 403, clase no asistida o lead ya inscrito 409, sin sesión 401", async () => {
  const f = await leadConClase(gMaestro);
  assert.equal((await listo(otroMaestro, f.claseId)).estado, 404);
  assert.equal((await listo(asesorSur, f.claseId)).estado, 404);
  assert.equal((await listo(recepcion, f.claseId)).estado, 403);
  assert.equal((await listo(api.cliente(), f.claseId)).estado, 401);
  assert.equal((await listo(admin, "00000000-0000-4000-8000-0000000000aa")).estado, 404);
  const agendada = await leadConClase(gMaestro, { estatus: "agendada" });
  const r = await listo(maestro, agendada.claseId);
  assert.equal(r.estado, 409);
  assert.equal(r.cuerpo.error.detalles?.find((d) => d.campo === "motivo")?.mensaje, "clase_no_asistida");
  assert.equal(await prisma.tarea_asesor.count({ where: { lead_id: agendada.leadId } }), 0);
  const inscrito = await leadConClase(gMaestro, { etapa: "inscrito" });
  assert.equal((await listo(maestro, inscrito.claseId)).estado, 409);
  // Sin etapa de negociación configurada, igual queda la tarea (la etapa es un extra).
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, etapas.muestra_asistida, "las que fallaron no movieron nada");
});

test("CONCURRENCIA: 6 «listo para cerrar» simultáneos de la misma clase dejan UNA tarea, UN movimiento de etapa y una sola creación", async () => {
  const f = await leadConClase(gMaestro);
  const clientes = await Promise.all(Array.from({ length: 6 }, async () => {
    const c = api.cliente();
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    await c.login(org.slug, u.correo, u.contrasena);
    return c;
  }));
  const rs = await Promise.all(clientes.map((c) => listo(c, f.claseId)));
  assert.deepEqual(rs.map((r) => r.estado).sort(), [200, 200, 200, 200, 200, 201]);
  assert.equal(await prisma.tarea_asesor.count({ where: { lead_id: f.leadId, tipo: "listo_para_cerrar" } }), 1);
  assert.equal(await prisma.lead_etapa_historial.count({ where: { lead_id: f.leadId, etapa_nueva_id: etapas.negociacion } }), 1);
});

test("MODO por omisión (asesor_whatsapp): el maestro NO convierte ni ve la vista previa (403); el asesor y el administrador sí; recepción nunca", async () => {
  await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "asesor_whatsapp" });
  assert.equal((await leerConfiguracion(db())).modoCierre, "asesor_whatsapp");
  const f = await leadConClase(gMaestro);
  assert.equal((await maestro.get(`/api/leads/${f.leadId}/conversion`)).estado, 403);
  assert.equal((await maestro.post(`/api/leads/${f.leadId}/convertir`, completar(f))).estado, 403);
  assert.equal(await prisma.inscripcion.count({ where: { lead_id: f.leadId } }), 0);
  assert.equal((await recepcion.get(`/api/leads/${f.leadId}/conversion`)).estado, 403);
  assert.equal((await asesorNorte.get(`/api/leads/${f.leadId}/conversion`)).estado, 200);
  const r = await asesorNorte.post(`/api/leads/${f.leadId}/convertir`, completar(f));
  assert.equal(r.estado, 201);
});

test("MODO maestro_en_sitio: el maestro convierte a SUS alumnos al terminar la clase; el mismo código cambia de comportamiento solo por la configuración", async () => {
  const f = await leadConClase(gMaestro);
  await listo(maestro, f.claseId); // la tarea queda pendiente: se resuelve sola al convertir
  // 1) Modo asesor: 403.
  await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "asesor_whatsapp" });
  assert.equal((await maestro.post(`/api/leads/${f.leadId}/convertir`, completar(f))).estado, 403);
  // 2) Se cambia la configuración (sin tocar código): la misma petición ahora procede.
  await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "maestro_en_sitio" });
  assert.equal((await leerConfiguracion(db())).modoCierre, "maestro_en_sitio");
  const previa = await maestro.get<Previa>(`/api/leads/${f.leadId}/conversion`);
  assert.equal(previa.estado, 200);
  assert.deepEqual(previa.cuerpo.faltantes.map((x) => x.campo).sort(), [`prospectos.${f.prospectoId}.alumno.apellidos`, `prospectos.${f.prospectoId}.alumno.fecha_nacimiento`, "tutor.parentesco"].sort());
  // V4: la vista previa le dice al maestro EN QUÉ GRUPO queda (la pantalla lo pone en la confirmación), sin ningún importe.
  const nombreDelGrupo = (await prisma.grupo.findFirstOrThrow({ where: { id: gMaestro.grupoId } })).nombre;
  assert.deepEqual(previa.cuerpo.previsiones.map((x) => [x.prospecto_id, x.grupo_nombre]), [[f.prospectoId, nombreDelGrupo]]);
  assert.doesNotMatch(JSON.stringify(previa.cuerpo), /monto|precio|importe|\$/i);
  const r = await maestro.post<{ ya_convertido: boolean; alumnos: { inscripcion: { grupo_id: string; creada: boolean } }[] } & Errores>(`/api/leads/${f.leadId}/convertir`, completar(f));
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.doesNotMatch(JSON.stringify(r.cuerpo), /monto|precio|importe|\$/i, "el maestro no recibe importes al inscribir");
  assert.deepEqual([r.cuerpo.alumnos[0]!.inscripcion.grupo_id, r.cuerpo.alumnos[0]!.inscripcion.creada], [gMaestro.grupoId, true]);
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, etapas.inscrito);
  assert.equal((await prisma.tarea_asesor.findFirstOrThrow({ where: { lead_id: f.leadId, tipo: "listo_para_cerrar" } })).estado, "hecha", "la tarea «listo para cerrar» se resolvió sola");
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { lead_id: f.leadId } })).creado_por_usuario_id !== null, true);
  // Convertir otra vez es idempotente también para el maestro.
  assert.equal((await maestro.post(`/api/leads/${f.leadId}/convertir`, {})).estado, 200);
  // 3) De vuelta al modo asesor: otra vez 403, y el asesor sigue pudiendo.
  await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "asesor_whatsapp" });
  assert.equal((await maestro.get(`/api/leads/${f.leadId}/conversion`)).estado, 403);
  assert.equal((await asesorNorte.get(`/api/leads/${f.leadId}/conversion`)).estado, 200);
});

test("MODO maestro_en_sitio — el grupo se llena antes de confirmar (V4): 409 grupo_lleno con el motivo, nada a medias (sin alumno, sin cargos, el lead no avanza) y el aviso al asesor sigue disponible", async () => {
  await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "maestro_en_sitio" });
  try {
    const p = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: `Programa lleno ${++n}`, edadMin: 3, edadMax: 14, grupos: [{ nombre: `Grupo lleno ${n}`, cupoMaximo: 1, horarios: [[n % 7, 480 + (n % 10) * 60, 530 + (n % 10) * 60]] }], precio: { inscripcion: "500.00", mensualidad: "800.00" } });
    const lleno = { programaId: p.id, grupoId: p.grupos[0]!.id };
    await prisma.grupo.update({ where: { id: lleno.grupoId }, data: { instructor_id: (await prisma.instructor.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, nombre: "Maestro uno" } })).id } });
    const f = await leadConClase(lleno);
    const previa = await maestro.get<Previa>(`/api/leads/${f.leadId}/conversion`);
    assert.equal(previa.estado, 200);
    assert.equal(previa.cuerpo.previsiones[0]!.grupo_nombre, `Grupo lleno ${n}`);
    // Otra persona toma el único lugar.
    const otra = await leadConClase(lleno);
    assert.equal((await admin.post(`/api/leads/${otra.leadId}/convertir`, completar(otra))).estado, 201);
    const r = await maestro.post<Errores>(`/api/leads/${f.leadId}/convertir`, completar(f));
    assert.equal(r.estado, 409, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.error.detalles?.find((d) => d.campo === "motivo")?.mensaje, "grupo_lleno");
    assert.equal((await prisma.prospecto.findFirstOrThrow({ where: { id: f.prospectoId } })).alumno_id, null, "el niño sigue sin ser alumno");
    assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, etapas.muestra_asistida);
    assert.equal(await prisma.inscripcion.count({ where: { lead_id: f.leadId } }), 0);
    // El siguiente paso: avisar al asesor deja UNA tarea (y el lead pasa a negociación) sin inscribir a nadie.
    assert.equal((await listo(maestro, f.claseId)).estado, 201);
    assert.equal(await prisma.tarea_asesor.count({ where: { lead_id: f.leadId, tipo: "listo_para_cerrar", estado: "pendiente" } }), 1);
    assert.equal(await prisma.inscripcion.count({ where: { lead_id: f.leadId } }), 0);
  } finally {
    await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "asesor_whatsapp" });
  }
});

test("MODO maestro_en_sitio — límites: solo SUS alumnos (404), solo grupos de las sucursales donde da clases, nada fuera de edad, recepción sigue sin poder", async () => {
  await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "maestro_en_sitio" });
  try {
    const ajeno = await leadConClase(gOtro);
    assert.equal((await maestro.get(`/api/leads/${ajeno.leadId}/conversion`)).estado, 404, "el alumno es de otro maestro");
    assert.equal((await maestro.post(`/api/leads/${ajeno.leadId}/convertir`, {})).estado, 404);
    const sinClase = await sembrarFamilia(prisma, org, { sucursalId: norte, etapaId: etapas.nuevo });
    assert.equal((await maestro.get(`/api/leads/${sinClase.leadId}/conversion`)).estado, 404, "un lead que no pasó por su clase");
    assert.equal((await maestro.get("/api/leads/00000000-0000-4000-8000-0000000000ee/conversion")).estado, 404);
    const f = await leadConClase(gMaestro, { cotizar: false });
    // Un prospecto que no es suyo dentro de un lead que sí.
    const ajenoDentro = await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, vertical_interes_id: org.verticalId, nombre: "Otro hijo", edad_declarada: 8, origen: "asesor" } });
    const colado = await maestro.post(`/api/leads/${f.leadId}/convertir`, { prospectos: [{ prospecto_id: ajenoDentro.id, alumno: { apellidos: "X", fecha_nacimiento: "2018-01-01" }, inscripcion: { grupo_id: gMaestro.grupoId } }] });
    assert.equal(colado.estado, 404);
    // Fuera de edad: solo el administrador.
    const fuera = await maestro.post(`/api/leads/${f.leadId}/convertir`, { ...completar(f), prospectos: [{ prospecto_id: f.prospectoId, alumno: { apellidos: "Soto", fecha_nacimiento: "2018-05-04" }, inscripcion: { grupo_id: gMaestro.grupoId, permitir_fuera_de_edad: true } }] });
    assert.equal(fuera.estado, 403);
    // Un grupo de una sucursal donde no da clases.
    const delSur = await grupo((await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, nombre: "Maestro del sur" } })).id, sur);
    const enSur = await maestro.post(`/api/leads/${f.leadId}/convertir`, { ...completar(f), prospectos: [{ prospecto_id: f.prospectoId, alumno: { apellidos: "Soto", fecha_nacimiento: "2018-05-04" }, inscripcion: { grupo_id: delSur.grupoId } }] });
    assert.equal(enSur.estado, 404);
    assert.equal((await recepcion.post(`/api/leads/${f.leadId}/convertir`, completar(f))).estado, 403);
    // Lo permitido sí procede: su grupo, sus datos.
    const ok = await maestro.post(`/api/leads/${f.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.prospectoId, alumno: { apellidos: "Soto", fecha_nacimiento: "2018-05-04" }, inscripcion: { grupo_id: gMaestro.grupoId } }] });
    assert.equal(ok.estado, 201, JSON.stringify(ok.cuerpo));
    assert.equal(await prisma.inscripcion.count({ where: { lead_id: f.leadId } }), 1);
  } finally {
    await fijarConfiguracion(prisma, org.organizacionId, { modo_cierre: "asesor_whatsapp" });
  }
});

test("la configuración: `modo_cierre` por omisión es asesor_whatsapp, solo acepta los dos modos y la lee un solo lector", async () => {
  const otra = await sembrarOrganizacion(prisma, "Modo sin fila");
  assert.equal((await leerConfiguracion(conAlcance(prisma, otra.organizacionId))).modoCierre, "asesor_whatsapp", "sin fila: el valor por omisión");
  await fijarConfiguracion(prisma, otra.organizacionId, { modo_cierre: "maestro_en_sitio" });
  assert.equal((await leerConfiguracion(conAlcance(prisma, otra.organizacionId))).modoCierre, "maestro_en_sitio");
  await assert.rejects(() => prisma.$executeRawUnsafe(`UPDATE configuracion_organizacion SET modo_cierre = 'nadie' WHERE organizacion_id = '${otra.organizacionId}'`), /invalid input value for enum/);
});
