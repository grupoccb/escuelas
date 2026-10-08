// D6: reglamento y autorización de imagen con evidencia de aceptación. Documentos versionados e inmutables (la base lo impone), solo se acepta
// la versión vigente, la evidencia (quién, cuándo, qué texto, por qué canal) no se altera, la revocación es una fila nueva, repetir no duplica
// (ni con peticiones simultáneas) y sin la aceptación del reglamento un registro no pasa a «cerrado».

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearCifrador } from "../sensibles/index.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarDocumentosLegales, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

const AHORA = new Date("2026-11-10T18:00:00Z");
const FUTURA = new Date("2026-11-17T22:00:00Z");

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let docs: DocumentosLegalesSembrados;
let admin: ClienteApi;
let asesor: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestroA: ClienteApi;
let maestroB: ClienteApi;
let adminId: string;
let grupoA: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Doc { id: string; tipo: string; version: number; titulo: string; texto?: string; texto_hash: string; vigente_desde: string; vertical_id: string | null }
interface Aceptacion { creada: boolean; id: string; tipo: string; version: number; resultado: string; texto_hash: string; canal: string; aceptado_en: string; capturada_por_usuario_id: string | null; aceptante: { nombre: string; parentesco: string | null; registro_tutor_id: string | null } }
interface Estado { estado: { tipo: string; estado: string; version_aceptada: number | null; version_vigente: number | null; al_corriente: boolean; texto: string }[]; historial: (Aceptacion & { evidencia: unknown })[] }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador: crearCifrador(randomBytes(32)) } });
  ajena = await sembrarOrganizacion(prisma, "Legal ajena");
});

/** Una organización NUEVA con sus usuarios y documentos v1: cada prueba parte de cero (publicar versiones cambia lo vigente para todos). */
async function montar(): Promise<void> {
  org = await sembrarOrganizacion(prisma, "Legal");
  await sembrarEmbudo(prisma, org);
  docs = await sembrarDocumentosLegales(prisma, org);
  const norte = org.sucursales[0]!.id;
  const sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  const a = await entrar("administrador");
  admin = a.c;
  adminId = a.id;
  asesor = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  const ma = await entrar("maestro");
  const mb = await entrar("maestro");
  maestroA = ma.c;
  maestroB = mb.c;
  const iA = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: ma.id, nombre: "Maestro A" } });
  await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: mb.id, nombre: "Maestro B" } });
  const p = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa", edadMin: 3, edadMax: 14, grupos: [{ nombre: "Grupo A", cupoMaximo: 50, horarios: [[1, 960, 1020]] }] });
  grupoA = p.grupos[0]!.id;
  await prisma.grupo.update({ where: { id: grupoA }, data: { instructor_id: iA.id } });
}
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

async function clase(sucursalId = org.sucursales[0]!.id) {
  const f = await sembrarFamilia(prisma, org, { sucursalId });
  const c = await prisma.clase_muestra.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: grupoA, fecha_hora: FUTURA, agendada_por: "usuario", agendada_por_usuario_id: adminId } });
  return { id: c.id, prospectoId: f.prospectoId, leadId: f.leadId };
}
const aceptar = (c: ClienteApi, claseId: string, o: Record<string, unknown> = {}) =>
  c.post<Aceptacion & Errores>(`/api/clases-muestra/${claseId}/registro/aceptaciones`, { documento_id: docs.reglamento, version: 1, resultado: "aceptada", aceptante: { nombre: "Rosa Mena", parentesco: "madre" }, canal: "presencial", ...o });
const estado = (c: ClienteApi, claseId: string) => c.get<Estado & Errores>(`/api/clases-muestra/${claseId}/registro/aceptaciones`);
let versionAjena = 0;
/** Un documento de OTRA organización (versión distinta cada vez: el índice es por organización, tipo y versión). */
const documentoAjeno = () => prisma.documento_legal.create({ data: { organizacion_id: ajena.organizacionId, tipo: "reglamento", version: ++versionAjena, titulo: "Ajeno", texto: "x", texto_hash: hash("x"), vigente_desde: new Date("2020-01-01") } });
const hash = (t: string): string => createHash("sha256").update(t, "utf8").digest("hex");
const publicar = (c: ClienteApi, o: Record<string, unknown>) => c.post<Doc & Errores>("/api/documentos-legales", { titulo: "Nueva versión", ...o });

test("D6: lo vigente — las tres piezas con su texto de la tabla; la versión nueva reemplaza a la anterior sin tocarla; la fecha futura no rige todavía", async () => {
  await montar();
  const v = await asesor.get<{ datos: Doc[] }>("/api/documentos-legales/vigentes");
  assert.equal(v.estado, 200);
  assert.deepEqual(v.cuerpo.datos.map((d) => [d.tipo, d.version]).sort(), [["aviso_privacidad", 1], ["reglamento", 1], ["uso_imagen", 1]]);
  const completo = await admin.get<Doc>(`/api/documentos-legales/${docs.reglamento}`);
  assert.equal(completo.cuerpo.texto, "Texto de prueba de reglamento, versión 1.");
  assert.equal(completo.cuerpo.texto_hash, hash(completo.cuerpo.texto!));

  const v2 = await publicar(admin, { tipo: "reglamento", texto: "Reglamento, versión DOS" });
  assert.equal(v2.estado, 201, JSON.stringify(v2.cuerpo));
  assert.equal(v2.cuerpo.version, 2);
  assert.equal(v2.cuerpo.texto_hash, hash("Reglamento, versión DOS"));
  const vigentes = (await asesor.get<{ datos: Doc[] }>("/api/documentos-legales/vigentes")).cuerpo.datos;
  assert.equal(vigentes.find((d) => d.tipo === "reglamento")!.version, 2);
  assert.equal((await db().documento_legal.findFirstOrThrow({ where: { id: docs.reglamento } })).texto, "Texto de prueba de reglamento, versión 1.", "la versión 1 no se tocó");

  // Una versión que rige a futuro no es la vigente hoy.
  const futura = await publicar(admin, { tipo: "uso_imagen", texto: "Imagen, versión futura", vigente_desde: "2027-01-01T00:00:00Z" });
  assert.equal(futura.estado, 201);
  assert.equal((await asesor.get<{ datos: Doc[] }>("/api/documentos-legales/vigentes")).cuerpo.datos.find((d) => d.tipo === "uso_imagen")!.version, 1);
  // ...ni puede regir antes que la anterior.
  const antes = await publicar(admin, { tipo: "uso_imagen", texto: "Imagen, atrasada", vigente_desde: "2026-12-01T00:00:00Z" });
  assert.equal(antes.estado, 409);
  assert.ok(antes.cuerpo.error.detalles?.some((d) => d.campo === "vigente_desde"));
  // El historial de versiones.
  const hist = await admin.get<{ datos: Doc[] }>("/api/documentos-legales?tipo=reglamento");
  assert.deepEqual(hist.cuerpo.datos.map((d) => d.version), [2, 1]);
  assert.equal(hist.cuerpo.datos[0]!.texto, undefined, "el listado no lleva el texto");
});

test("D6: un documento por vertical manda sobre el general; solo el administrador publica; otra organización no se ve", async () => {
  await montar();
  const otraVertical = await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Vertical dos", slug: "vertical-dos" } });
  const propio = await publicar(admin, { tipo: "aviso_privacidad", vertical_id: otraVertical.id, texto: "Aviso propio de la vertical dos" });
  assert.equal(propio.estado, 201);
  assert.equal(propio.cuerpo.version, 1, "la numeración es por vertical");
  const deEsa = (await asesor.get<{ datos: Doc[] }>(`/api/documentos-legales/vigentes?vertical_id=${otraVertical.id}`)).cuerpo.datos.find((d) => d.tipo === "aviso_privacidad")!;
  assert.equal(deEsa.id, propio.cuerpo.id);
  const deLaPrimera = (await asesor.get<{ datos: Doc[] }>(`/api/documentos-legales/vigentes?vertical_id=${org.verticalId}`)).cuerpo.datos.find((d) => d.tipo === "aviso_privacidad")!;
  assert.equal(deLaPrimera.id, docs.avisoPrivacidad, "sin documento propio, el general");
  for (const c of [asesor, maestroA, recepcion]) assert.equal((await publicar(c, { tipo: "reglamento", texto: "x" })).estado, 403);
  assert.equal((await publicar(api.cliente(), { tipo: "reglamento", texto: "x" })).estado, 401);
  assert.equal((await publicar(admin, { tipo: "reglamento", texto: "x", vertical_id: ajena.verticalId })).estado, 400, "una vertical ajena no existe");
  assert.equal((await asesor.get(`/api/documentos-legales/vigentes?vertical_id=${ajena.verticalId}`)).estado, 404);
  const ajeno = await documentoAjeno();
  assert.equal((await admin.get(`/api/documentos-legales/${ajeno.id}`)).estado, 404);
  assert.equal((await publicar(admin, { tipo: "otro", texto: "x" })).estado, 400);
  assert.equal((await publicar(admin, { tipo: "reglamento", texto: "x", campo_raro: 1 })).estado, 400);
});

test("D6: dos administradores publicando a la vez obtienen versiones DISTINTAS (el candado numera)", async () => {
  await montar();
  const [a, b, c] = await Promise.all([1, 2, 3].map((i) => publicar(admin, { tipo: "aviso_privacidad", texto: `Aviso concurrente ${i}` })));
  assert.deepEqual([a!.estado, b!.estado, c!.estado], [201, 201, 201], JSON.stringify([a!.cuerpo, b!.cuerpo, c!.cuerpo]));
  const versiones = [a!, b!, c!].map((r) => r.cuerpo.version).sort();
  assert.equal(new Set(versiones).size, 3, `versiones distintas: ${versiones.join(",")}`);
  assert.deepEqual(versiones, [versiones[0]!, versiones[0]! + 1, versiones[0]! + 2], "sin huecos");
});

test("D6: documentos y aceptaciones son de SOLO ANEXAR en la base — ni UPDATE, ni DELETE, ni TRUNCATE; la evidencia no se altera", async () => {
  await montar();
  const c = await clase();
  const ok = await aceptar(asesor, c.id, { evidencia: { folio: "A-123" } });
  assert.equal(ok.estado, 201, JSON.stringify(ok.cuerpo));
  await assert.rejects(prisma.documento_legal.update({ where: { id: docs.reglamento }, data: { texto: "alterado" } }), /documento_legal es de solo anexar/);
  await assert.rejects(prisma.documento_legal.delete({ where: { id: docs.reglamento } }), /documento_legal es de solo anexar/);
  await assert.rejects(prisma.documento_legal.update({ where: { id: docs.reglamento }, data: { eliminado_en: new Date() } }), /solo anexar/);
  await assert.rejects(prisma.aceptacion_legal.update({ where: { id: ok.cuerpo.id }, data: { aceptante_nombre: "Otra persona" } }), /aceptacion_legal es de solo anexar/);
  await assert.rejects(prisma.aceptacion_legal.update({ where: { id: ok.cuerpo.id }, data: { texto_hash: hash("otro") } }), /solo anexar/);
  await assert.rejects(prisma.aceptacion_legal.delete({ where: { id: ok.cuerpo.id } }), /solo anexar/);
  const ensayo = (sql: string) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("EL TRUNCATE SE EJECUTÓ");
    });
  await assert.rejects(ensayo(`TRUNCATE TABLE "aceptacion_legal"`), /solo anexar/);
  await assert.rejects(ensayo(`TRUNCATE TABLE "documento_legal" CASCADE`), /solo anexar/);
  await assert.rejects(ensayo(`TRUNCATE TABLE "prospecto" CASCADE`), /solo anexar/, "también en cascada desde las tablas de las que cuelgan");
  const fila = await prisma.aceptacion_legal.findFirstOrThrow({ where: { id: ok.cuerpo.id } });
  assert.equal(fila.aceptante_nombre, "Rosa Mena");
  assert.equal(fila.texto_hash, hash("Texto de prueba de reglamento, versión 1."));
  assert.deepEqual(fila.evidencia, { folio: "A-123" });
  // El cliente no manda la huella: la copia el servidor del documento.
  assert.equal((await aceptar(asesor, c.id, { texto_hash: hash("mentira") })).estado, 400);
  // Restricciones de la tabla: el hash bien formado.
  await assert.rejects(prisma.aceptacion_legal.create({ data: { organizacion_id: org.organizacionId, documento_id: docs.reglamento, tipo: "reglamento", version_aceptada: 1, resultado: "aceptada", lead_id: c.leadId, prospecto_id: c.prospectoId, aceptante_nombre: "X", canal: "web", aceptado_en: AHORA, texto_hash: "no-es-hash" } }), /check|constraint/i);
});

test("D6: aceptar el reglamento — queda quién, cuándo, canal, quién lo capturó y la huella de lo mostrado; el estado lo dice con palabras", async () => {
  await montar();
  const c = await clase();
  const inicial = await estado(asesor, c.id);
  assert.equal(inicial.estado, 200);
  assert.ok(inicial.cuerpo.estado.every((e) => e.estado === "sin_respuesta"));
  const r = await aceptar(asesor, c.id);
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.creada, true);
  assert.deepEqual([r.cuerpo.tipo, r.cuerpo.version, r.cuerpo.resultado, r.cuerpo.canal], ["reglamento", 1, "aceptada", "presencial"]);
  assert.equal(r.cuerpo.aceptado_en, AHORA.toISOString());
  assert.deepEqual(r.cuerpo.aceptante, { nombre: "Rosa Mena", parentesco: "madre", registro_tutor_id: null });
  assert.equal(r.cuerpo.texto_hash, hash("Texto de prueba de reglamento, versión 1."));
  const fila = await db().aceptacion_legal.findFirstOrThrow({ where: { id: r.cuerpo.id } });
  assert.equal(fila.capturada_por_usuario_id !== null, true);
  assert.equal(fila.ip, null, "IP y agente solo cuando llega por la web");
  assert.equal(fila.agente_usuario, null);
  assert.equal(fila.prospecto_id, c.prospectoId);
  assert.equal(fila.lead_id, c.leadId);
  const e = (await estado(asesor, c.id)).cuerpo;
  const reg = e.estado.find((x) => x.tipo === "reglamento")!;
  assert.deepEqual([reg.estado, reg.version_aceptada, reg.version_vigente, reg.al_corriente], ["aceptada", 1, 1, true]);
  assert.equal(reg.texto, "Aceptó el reglamento v1 el 2026-11-10 (Rosa Mena, madre)");
  assert.equal(e.estado.find((x) => x.tipo === "uso_imagen")!.texto, "Todavía no responde a la autorización de uso de imagen");
  assert.equal(e.historial.length, 1);
  // Por la web se guardan IP y agente.
  const w = await aceptar(asesor, c.id, { documento_id: docs.usoImagen, canal: "web" });
  assert.equal(w.estado, 201);
  const web = await db().aceptacion_legal.findFirstOrThrow({ where: { id: w.cuerpo.id } });
  assert.ok(web.ip && web.ip.length > 0);
  // El adulto del registro puede nombrarse por su id: nombre y parentesco salen de su fila.
  const reg2 = await asesor.patch<{ tutores: { id: string }[] }>(`/api/clases-muestra/${c.id}/registro`, { tutores: [{ nombre: "Luis", apellidos: "Soto", parentesco: "padre", telefono: "+525544443333", es_responsable_pago: true }] });
  const tutorId = reg2.cuerpo.tutores[0]!.id;
  const t = await aceptar(asesor, c.id, { documento_id: docs.usoImagen, resultado: "rechazada", aceptante: { registro_tutor_id: tutorId } });
  assert.equal(t.estado, 201, JSON.stringify(t.cuerpo));
  assert.deepEqual(t.cuerpo.aceptante, { nombre: "Luis Soto", parentesco: "padre", registro_tutor_id: tutorId });
  const conRegistro = await db().aceptacion_legal.findFirstOrThrow({ where: { id: t.cuerpo.id } });
  assert.notEqual(conRegistro.registro_clase_muestra_id, null, "ya con registro, la aceptación se liga a él");
});

test("D6: solo se acepta la versión VIGENTE — una vieja, una futura o una que no coincide con lo que se le mostró, no se registra", async () => {
  await montar();
  const c = await clase();
  const v2 = await publicar(admin, { tipo: "uso_imagen", texto: "Imagen, versión DOS" });
  assert.equal(v2.estado, 201);
  // La v1 ya no es la vigente.
  const vieja = await aceptar(asesor, c.id, { documento_id: docs.usoImagen, version: 1 });
  assert.equal(vieja.estado, 409);
  assert.match(vieja.cuerpo.error.mensaje, /v2/);
  assert.ok(vieja.cuerpo.error.detalles?.some((d) => d.campo === "version" && /v2/.test(d.mensaje)));
  // Dice haber visto la v1 pero manda el id de la v2.
  assert.equal((await aceptar(asesor, c.id, { documento_id: v2.cuerpo.id, version: 1 })).estado, 409);
  // Una versión que aún no rige.
  const futura = await publicar(admin, { tipo: "uso_imagen", texto: "Imagen, versión TRES futura", vigente_desde: "2027-06-01T00:00:00Z" });
  assert.equal((await aceptar(asesor, c.id, { documento_id: futura.cuerpo.id, version: 3 })).estado, 409);
  assert.equal(await db().aceptacion_legal.count({ where: { prospecto_id: c.prospectoId } }), 0, "ninguna quedó registrada");
  // La vigente, sí.
  const ok = await aceptar(asesor, c.id, { documento_id: v2.cuerpo.id, version: 2 });
  assert.equal(ok.estado, 201);
  assert.equal(ok.cuerpo.version, 2);
  assert.equal(ok.cuerpo.texto_hash, hash("Imagen, versión DOS"));
  // Un documento que no existe o es de otra organización.
  assert.equal((await aceptar(asesor, c.id, { documento_id: "00000000-0000-4000-8000-0000000000cc" })).estado, 404);
  const ajeno = await documentoAjeno();
  assert.equal((await aceptar(asesor, c.id, { documento_id: ajeno.id })).estado, 404);
});

test("D6: repetir la misma respuesta no duplica — ni con peticiones simultáneas; cambiar de respuesta sí agrega una fila", async () => {
  await montar();
  const c = await clase();
  const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => aceptar(asesor, c.id)));
  assert.deepEqual(rs.map((r) => r.estado).sort(), [200, 200, 200, 200, 200, 201]);
  assert.equal(new Set(rs.map((r) => r.cuerpo.id)).size, 1, "todas devuelven la misma fila");
  assert.equal(await db().aceptacion_legal.count({ where: { prospecto_id: c.prospectoId, tipo: "reglamento" } }), 1);
  // Cambiar de respuesta (rechazó después de aceptar) es una fila nueva; el estado es la más reciente.
  const rechazo = await aceptar(asesor, c.id, { resultado: "rechazada" });
  assert.equal(rechazo.estado, 201);
  assert.equal(await db().aceptacion_legal.count({ where: { prospecto_id: c.prospectoId, tipo: "reglamento" } }), 2);
  assert.equal((await estado(asesor, c.id)).cuerpo.estado.find((e) => e.tipo === "reglamento")!.estado, "rechazada");
});

test("D6: la autorización de imagen se REVOCA con una fila nueva — la aceptación original queda intacta; solo se revoca lo aceptado y solo la imagen", async () => {
  await montar();
  const c = await clase();
  const imagen = { documento_id: docs.usoImagen };
  assert.equal((await aceptar(asesor, c.id, { ...imagen, resultado: "revocada" })).estado, 409, "no hay nada que revocar");
  const acepta = await aceptar(asesor, c.id, imagen);
  assert.equal(acepta.estado, 201);
  const revoca = await aceptar(maestroA, c.id, { ...imagen, resultado: "revocada", aceptante: { nombre: "Rosa Mena", parentesco: "madre" }, canal: "telefono" });
  assert.equal(revoca.estado, 201, JSON.stringify(revoca.cuerpo));
  assert.notEqual(revoca.cuerpo.id, acepta.cuerpo.id);
  const filas = await db().aceptacion_legal.findMany({ where: { prospecto_id: c.prospectoId, tipo: "uso_imagen" }, orderBy: { secuencia: "asc" } });
  assert.deepEqual(filas.map((f) => f.resultado), ["aceptada", "revocada"]);
  assert.equal(filas[0]!.canal, "presencial", "la aceptación original no cambió");
  const e = (await estado(asesor, c.id)).cuerpo.estado.find((x) => x.tipo === "uso_imagen")!;
  assert.deepEqual([e.estado, e.al_corriente], ["revocada", false]);
  assert.match(e.texto, /^Revocó la autorización de uso de imagen v1 el 2026-11-10/);
  assert.equal((await aceptar(asesor, c.id, { ...imagen, resultado: "revocada" })).estado, 200, "revocar otra vez es lo mismo");
  assert.equal(await db().aceptacion_legal.count({ where: { prospecto_id: c.prospectoId, tipo: "uso_imagen" } }), 2);
  // Puede volver a autorizar: una fila más.
  assert.equal((await aceptar(asesor, c.id, imagen)).estado, 201);
  assert.equal((await estado(asesor, c.id)).cuerpo.estado.find((x) => x.tipo === "uso_imagen")!.estado, "aceptada");
  // El reglamento y el aviso de privacidad no se revocan.
  await aceptar(asesor, c.id);
  assert.equal((await aceptar(asesor, c.id, { resultado: "revocada" })).estado, 409);
});

test("D6: sin la aceptación del reglamento el registro no puede pasar a «cerrado» — ni sin aceptar, ni rechazado, ni sin reglamento configurado", async () => {
  await montar();
  const completarYCerrar = async (claseId: string, cliente: ClienteApi) => {
    await maestroA.patch(`/api/clases-muestra/${claseId}/registro`, {
      alumno: { nombre: "Ana", apellidos: "Mena", fecha_nacimiento: "2018-05-04", sexo: "femenino" },
      tutores: [{ nombre: "Rosa", parentesco: "madre", telefono: `+5255${Math.floor(70_000_000 + Math.random() * 9_000_000)}`, es_responsable_pago: true }],
      salud: { alergias: "Ninguna", condiciones_medicas: "Ninguna", medicamentos: "Ninguno", contacto_emergencia: { nombre: "Tía Marta", telefono: `+5255${Math.floor(10_000_000 + Math.random() * 9_000_000)}` }, autorizacion_atencion_medica: true },
      antecedentes: { practico_antes: false, motivo_clase: "socializacion" },
    });
    assert.equal((await cliente.post(`/api/clases-muestra/${claseId}/registro/completar`, {})).estado, 200);
    return cliente.post<Errores & { estatus: string }>(`/api/clases-muestra/${claseId}/registro/cerrar`, {});
  };
  const c = await clase();
  const sin = await completarYCerrar(c.id, asesor);
  assert.equal(sin.estado, 409);
  assert.match(sin.cuerpo.error.detalles![0]!.mensaje, /acepte el reglamento/);
  // La familia lo rechaza: tampoco.
  await aceptar(asesor, c.id, { resultado: "rechazada" });
  const rechazado = await asesor.post<Errores>(`/api/clases-muestra/${c.id}/registro/cerrar`, {});
  assert.equal(rechazado.estado, 409);
  assert.match(rechazado.cuerpo.error.detalles![0]!.mensaje, /no aceptó/);
  // Lo acepta (cambia de opinión): se cierra.
  await aceptar(asesor, c.id);
  const cerrado = await asesor.post<{ estatus: string }>(`/api/clases-muestra/${c.id}/registro/cerrar`, {});
  assert.equal(cerrado.estado, 200);
  assert.equal(cerrado.cuerpo.estatus, "cerrado");
  // Una organización sin reglamento configurado: no hay qué aceptar, y el cierre lo dice (hay que publicarlo).
  const sinDocs = await sembrarOrganizacion(prisma, "Sin reglamento");
  await sembrarEmbudo(prisma, sinDocs);
  const u = await sembrarUsuario(prisma, sinDocs.organizacionId, { rol: "administrador" });
  const otroCliente = api.cliente();
  await otroCliente.login(sinDocs.slug, u.correo, u.contrasena);
  const prog = await sembrarPrograma(prisma, sinDocs, { sucursalId: sinDocs.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 14, grupos: [{ nombre: "G", horarios: [[1, 960, 1020]] }] });
  const f = await sembrarFamilia(prisma, sinDocs);
  const cs = await prisma.clase_muestra.create({ data: { organizacion_id: sinDocs.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: prog.grupos[0]!.id, fecha_hora: FUTURA, agendada_por: "usuario", agendada_por_usuario_id: u.id } });
  await otroCliente.patch(`/api/clases-muestra/${cs.id}/registro`, {
    alumno: { nombre: "Ana", apellidos: "Mena", fecha_nacimiento: "2018-05-04", sexo: "femenino" },
    tutores: [{ nombre: "Rosa", parentesco: "madre", telefono: "+525512341234", es_responsable_pago: true }],
    salud: { alergias: "Ninguna", condiciones_medicas: "Ninguna", medicamentos: "Ninguno", contacto_emergencia: { nombre: "Tía Marta", telefono: "+525598765432" }, autorizacion_atencion_medica: true },
    antecedentes: { practico_antes: false, motivo_clase: "socializacion" },
  });
  assert.equal((await otroCliente.post(`/api/clases-muestra/${cs.id}/registro/completar`, {})).estado, 200);
  const sinReglamento = await otroCliente.post<Errores>(`/api/clases-muestra/${cs.id}/registro/cerrar`, {});
  assert.equal(sinReglamento.estado, 409);
  assert.match(sinReglamento.cuerpo.error.detalles![0]!.mensaje, /No hay un reglamento vigente/);
});

test("D6: permisos y alcance — recepción 403; el maestro de otro grupo y el asesor de otra sucursal 404; el adulto de OTRO registro no se acepta como quien acepta; la evidencia se valida", async () => {
  await montar();
  const c = await clase();
  assert.equal((await aceptar(recepcion, c.id)).estado, 403);
  assert.equal((await estado(recepcion, c.id)).estado, 403);
  assert.equal((await aceptar(maestroB, c.id)).estado, 404);
  assert.equal((await estado(maestroB, c.id)).estado, 404);
  assert.equal((await aceptar(asesorSur, c.id)).estado, 404);
  assert.equal((await aceptar(api.cliente(), c.id)).estado, 401);
  assert.equal((await aceptar(maestroA, c.id)).estado, 201, "el maestro de ese grupo sí");
  // Sin nombre de quien acepta, o con un adulto que no es del registro.
  assert.equal((await aceptar(asesor, c.id, { aceptante: {} })).estado, 400);
  assert.equal((await aceptar(asesor, c.id, { aceptante: { registro_tutor_id: "00000000-0000-4000-8000-0000000000dd" } })).estado, 400);
  const otra = await clase();
  const rOtra = await asesor.patch<{ tutores: { id: string }[] }>(`/api/clases-muestra/${otra.id}/registro`, { tutores: [{ nombre: "Pedro", parentesco: "abuelo", telefono: "+525500001111", es_responsable_pago: true }] });
  const idAjeno = rOtra.cuerpo.tutores[0]!.id;
  assert.equal((await aceptar(asesor, c.id, { aceptante: { registro_tutor_id: idAjeno } })).estado, 400, "el adulto de otro registro");
  // Validaciones del cuerpo.
  for (const mal of [{ resultado: "quizá" }, { canal: "paloma" }, { version: 0 }, { version: "1" }, { documento_id: "no-es-uuid" }, { evidencia: { "No Válida": "x" } }, { evidencia: { nota: "x".repeat(501) } }, { evidencia: { nota: 5 } }, { evidencia: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, "v"])) }]) {
    assert.equal((await aceptar(asesor, c.id, mal)).estado, 400, JSON.stringify(mal));
  }
  // Una clase cancelada no recibe aceptaciones.
  const cancelada = await clase();
  await prisma.clase_muestra.update({ where: { id: cancelada.id }, data: { estatus: "cancelada" } });
  assert.equal((await aceptar(asesor, cancelada.id)).estado, 409);
  // El registro de cambios guarda qué y quién, no el nombre de la persona.
  const cambios = await db().registro_cambio.findMany({ where: { entidad_tipo: "aceptacion_legal" } });
  assert.ok(cambios.length >= 1);
  assert.ok(!JSON.stringify(cambios).includes("Rosa Mena"));
});
