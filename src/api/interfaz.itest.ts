// J1/J3: lo mínimo que la interfaz web necesita de la API: etapas, configuración en /api/yo, el detalle del lead (fuente, campaña y los ids de Chatwoot
// con los que la pantalla arma el enlace), el filtro de tareas por lead y la vertical de las aceptaciones legales. Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ClienteApi } from "../testutil/api.ts";
import { urlPublicaDeChatwoot } from "../mensajeria/index.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

async function escenario(entorno: NodeJS.ProcessEnv = {}) {
  const org = await sembrarOrganizacion(prisma, "Interfaz");
  const etapas = await sembrarEmbudo(prisma, org);
  const api = levantarApi(prisma, { entorno });
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []): Promise<ClienteApi> => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  return { org, etapas, api, entrar };
}

test("GET /api/yo trae el modo de cierre y la URL pública de Chatwoot configurada (y nada más de la configuración)", async () => {
  const e = await escenario({ CHATWOOT_URL_PUBLICA: "https://chatwoot.ejemplo.invalid/" });
  try {
    const admin = await e.entrar("administrador");
    const yo = (await admin.get<{ configuracion: Record<string, unknown> }>("/api/yo")).cuerpo;
    assert.deepEqual(yo.configuracion, { modo_cierre: "asesor_whatsapp", chatwoot_url_publica: "https://chatwoot.ejemplo.invalid" });
    await fijarConfiguracion(prisma, e.org.organizacionId, { modo_cierre: "maestro_en_sitio" });
    assert.equal(((await admin.get<{ configuracion: { modo_cierre: string } }>("/api/yo")).cuerpo.configuracion).modo_cierre, "maestro_en_sitio");
  } finally {
    await e.api.cerrar();
  }
});

test("la URL pública de Chatwoot solo acepta http(s) sin credenciales; lo raro se ignora", () => {
  assert.equal(urlPublicaDeChatwoot({ CHATWOOT_URL_PUBLICA: "http://localhost:3001" }), "http://localhost:3001");
  assert.equal(urlPublicaDeChatwoot({ CHATWOOT_URL_PUBLICA: "https://x.invalid/base/" }), "https://x.invalid/base");
  assert.equal(urlPublicaDeChatwoot({ CHATWOOT_URL_HOST: "http://localhost:3001" }), "http://localhost:3001", "la demo ya lo trae como CHATWOOT_URL_HOST");
  assert.equal(urlPublicaDeChatwoot({ CHATWOOT_URL_PUBLICA: "javascript:alert(1)" }), null);
  assert.equal(urlPublicaDeChatwoot({ CHATWOOT_URL_PUBLICA: "https://u:p@x.invalid" }), null);
  assert.equal(urlPublicaDeChatwoot({ CHATWOOT_URL_PUBLICA: "no es una url" }), null);
  assert.equal(urlPublicaDeChatwoot({}), null);
});

test("GET /api/etapas: las etapas del embudo en orden, con su papel; cualquiera con leads:leer; la ajena no se ve", async () => {
  const e = await escenario();
  const otra = await escenario();
  try {
    const asesor = await e.entrar("asesor", [e.org.sucursales[0]!.id]);
    const r = await asesor.get<{ datos: { id: string; nombre: string; orden: number; tipo_sistema: string | null; es_ganado: boolean; es_perdido: boolean; dias_alerta_sin_movimiento: number | null }[] }>("/api/etapas");
    assert.equal(r.estado, 200);
    assert.deepEqual(
      r.cuerpo.datos.map((x) => x.tipo_sistema),
      ["nuevo", "contactado", "muestra_agendada", "muestra_asistida", "negociacion", "inscrito", "perdido"],
    );
    assert.ok(r.cuerpo.datos.every((x) => Object.values(e.etapas).includes(x.id)), "solo las de su organización");
    assert.equal(r.cuerpo.datos.find((x) => x.tipo_sistema === "inscrito")?.es_ganado, true);
    assert.equal(r.cuerpo.datos.find((x) => x.tipo_sistema === "perdido")?.es_perdido, true);
    assert.equal(r.cuerpo.datos.some((x) => Object.values(otra.etapas).includes(x.id)), false);
    assert.equal((await (await e.entrar("maestro")).get("/api/etapas")).estado, 403);
    assert.equal((await e.api.cliente().get("/api/etapas")).estado, 401);
  } finally {
    await e.api.cerrar();
    await otra.api.cerrar();
  }
});

test("GET /api/leads y /api/leads/:id: fuente derivada, campaña, etapa, vertical y los ids de Chatwoot de su conversación", async () => {
  const e = await escenario();
  try {
    const norte = e.org.sucursales[0]!;
    const asesor = await e.entrar("asesor", [norte.id]);
    const campana = await prisma.campana.create({ data: { organizacion_id: e.org.organizacionId, nombre: "Campaña de prueba", origen: "facebook" } });
    const { leadId } = await sembrarFamilia(prisma, e.org, { sucursalId: norte.id, nombre: "Ninia", edad: 7 });
    await prisma.lead.update({ where: { id: leadId }, data: { campana_id: campana.id, ctwa_clid: "clid-secreto-de-meta", anuncio_id: "anuncio-1", atribucion: { fuente: "codigo", codigo_rastreo: "ABCD2345", ctwa_clid: "otro-secreto", referral: { source_url: "https://x.invalid" } } } });
    const chatwootId = randomInt(1, 2_000_000_000);
    await prisma.conversacion.create({ data: { organizacion_id: e.org.organizacionId, bandeja_chatwoot_id: e.org.bandejaId, lead_id: leadId, chatwoot_conversacion_id: chatwootId } });

    const lista = (await asesor.get<{ datos: Record<string, unknown>[] }>("/api/leads")).cuerpo.datos;
    const enLista = lista.find((l) => l["id"] === leadId)!;
    assert.equal(enLista["fuente"], "facebook", "el origen de la campaña manda sobre la atribución");
    assert.deepEqual(enLista["campana"], { id: campana.id, nombre: "Campaña de prueba" });
    for (const secreto of ["ctwa_clid", "anuncio_id", "atribucion"]) assert.equal(secreto in enLista, false, `${secreto} no sale en la lista`);

    const d = (await asesor.get<Record<string, unknown>>(`/api/leads/${leadId}`)).cuerpo;
    assert.equal(d["fuente"], "facebook");
    assert.deepEqual(d["etapa"], { id: e.etapas.nuevo, nombre: "Primera", tipo_sistema: "nuevo", es_ganado: false, es_perdido: false });
    assert.deepEqual(d["vertical"], { id: e.org.verticalId, nombre: "Vertical Prueba" });
    assert.deepEqual(d["sucursal"], { id: norte.id, nombre: "Norte" });
    assert.deepEqual(d["conversaciones"], [{ id: (d["conversaciones"] as { id: string }[])[0]!.id, estado: "bot", chatwoot: { cuenta_id: e.org.chatwootAccountId, bandeja_id: e.org.chatwootInboxId, conversacion_id: chatwootId } }]);
    assert.equal((d["prospectos"] as { alumno_id: string | null }[])[0]!.alumno_id, null);
    assert.equal("ctwa_clid" in d, false, "el identificador de rastreo del proveedor no sale");
    assert.deepEqual(d["atribucion"], { fuente: "codigo", codigo_rastreo: "ABCD2345" }, "de la atribución solo salen las claves seguras");
  } finally {
    await e.api.cerrar();
  }
});

test("el detalle del lead sigue el alcance: el asesor de otra sucursal y otra organización reciben 404", async () => {
  const e = await escenario();
  const otra = await escenario();
  try {
    const norte = e.org.sucursales[0]!;
    const sur = e.org.sucursales[1]!;
    const { leadId } = await sembrarFamilia(prisma, e.org, { sucursalId: norte.id });
    assert.equal((await (await e.entrar("asesor", [norte.id])).get(`/api/leads/${leadId}`)).estado, 200);
    assert.equal((await (await e.entrar("asesor", [sur.id])).get(`/api/leads/${leadId}`)).estado, 404);
    assert.equal((await (await otra.entrar("administrador")).get(`/api/leads/${leadId}`)).estado, 404);
  } finally {
    await e.api.cerrar();
    await otra.api.cerrar();
  }
});

test("GET /api/tareas?lead_id= trae solo las de ese lead, con el alcance de siempre", async () => {
  const e = await escenario();
  try {
    const norte = e.org.sucursales[0]!;
    const asesor = await e.entrar("asesor", [norte.id]);
    const a = await sembrarFamilia(prisma, e.org, { sucursalId: norte.id });
    const b = await sembrarFamilia(prisma, e.org, { sucursalId: norte.id });
    for (const [lead, descripcion] of [[a.leadId, "de A"], [b.leadId, "de B"]] as const) {
      await prisma.tarea_asesor.create({ data: { organizacion_id: e.org.organizacionId, lead_id: lead, tipo: "revision_manual", descripcion } });
    }
    const r = await asesor.get<{ datos: { descripcion: string }[] }>(`/api/tareas?lead_id=${a.leadId}`);
    assert.deepEqual(r.cuerpo.datos.map((t) => t.descripcion), ["de A"]);
    assert.equal((await asesor.get(`/api/tareas?lead_id=no-es-uuid`)).estado, 400);
    assert.equal((await asesor.get<{ datos: unknown[] }>(`/api/tareas?lead_id=${randomUUID()}`)).cuerpo.datos.length, 0);
  } finally {
    await e.api.cerrar();
  }
});

test("GET /api/clases-muestra/:id/registro/aceptaciones trae la vertical para pedir los documentos vigentes sin leer el lead (lo usa el maestro)", async () => {
  const e = await escenario();
  try {
    const norte = e.org.sucursales[0]!;
    const maestro = await sembrarUsuario(prisma, e.org.organizacionId, { rol: "maestro" });
    const instructor = await prisma.instructor.create({ data: { organizacion_id: e.org.organizacionId, usuario_id: maestro.id, nombre: "Maestro" } });
    const programa = await sembrarPrograma(prisma, e.org, { sucursalId: norte.id, nombre: "P", edadMin: 3, edadMax: 14, grupos: [{ nombre: "G", horarios: [[1, 960, 1020]] }] });
    await prisma.grupo.update({ where: { id: programa.grupos[0]!.id }, data: { instructor_id: instructor.id } });
    const { leadId, prospectoId } = await sembrarFamilia(prisma, e.org, { sucursalId: norte.id });
    const clase = await prisma.clase_muestra.create({ data: { organizacion_id: e.org.organizacionId, lead_id: leadId, prospecto_id: prospectoId, grupo_id: programa.grupos[0]!.id, fecha_hora: new Date(Math.floor((Date.now() + 86_400_000) / 60_000) * 60_000), agendada_por: "usuario", agendada_por_usuario_id: maestro.id } });
    const c = e.api.cliente();
    assert.equal((await c.login(e.org.slug, maestro.correo, maestro.contrasena)).estado, 201);
    const r = await c.get<{ vertical_id: string; estado: { tipo: string }[] }>(`/api/clases-muestra/${clase.id}/registro/aceptaciones`);
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.vertical_id, e.org.verticalId);
    assert.equal(r.cuerpo.estado.length, 3);
  } finally {
    await e.api.cerrar();
  }
});
