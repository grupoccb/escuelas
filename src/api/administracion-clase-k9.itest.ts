// K9: EK-A1 (INV-6): la CLASE de la plantilla debe corresponder al evento de la automatización; EK-A5 (idioma repetido). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let admin: ClienteApi;

const entrar = async (o: OrganizacionDePrueba): Promise<ClienteApi> => {
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
  return c;
};
before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Administración K9");
  admin = await entrar(org);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

interface Plantilla { id: string; clase_mensaje: string }
const plantilla = async (codigo: string, clase: "servicio" | "marketing", extra: Record<string, unknown> = {}): Promise<Plantilla> => {
  const r = await admin.post<Plantilla>("/api/plantillas", { codigo, content_sid: `HX${codigo}`, categoria: "utility", clase_mensaje: clase, ...extra });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
};
const automatizacion = (evento: "lead_frio" | "cargo_vencido" | "clase_muestra_proxima", plantillaId: string | null, extra: Record<string, unknown> = {}) =>
  prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre: `Aviso ${evento} ${Math.random()}`, evento_disparador: evento, offset_minutos: evento === "clase_muestra_proxima" ? -60 : 60, plantilla_id: plantillaId, max_intentos: 1, ...extra } });

test("EK-A1 (INV-6): una plantilla de marketing no se liga a un aviso de servicio ni al revés, y la clase no se cambia bajo una automatización que la exige", async () => {
  const mk = await plantilla("frio_mk", "marketing");
  const sv = await plantilla("aviso_sv", "servicio");
  const frio = await automatizacion("lead_frio", mk.id);
  const cobro = await automatizacion("cargo_vencido", sv.id);
  // Ligar la plantilla equivocada: 400 con el motivo.
  const a = await admin.patch<{ error: { detalles: { campo: string }[] } }>(`/api/automatizaciones/${frio.id}`, { plantilla_id: sv.id });
  assert.equal(a.estado, 400);
  assert.equal(a.cuerpo.error.detalles[0]?.campo, "plantilla_id");
  assert.equal((await admin.patch(`/api/automatizaciones/${cobro.id}`, { plantilla_id: mk.id })).estado, 400, "un aviso de pago con una plantilla de marketing");
  // La correcta sí.
  const mk2 = await plantilla("frio_mk2", "marketing");
  assert.equal((await admin.patch(`/api/automatizaciones/${frio.id}`, { plantilla_id: mk2.id })).estado, 200);
  // Cambiar la clase de la plantilla que usa la automatización: 409; sin automatizaciones que la usen, sí se puede.
  assert.equal((await admin.patch(`/api/plantillas/${mk2.id}`, { clase_mensaje: "servicio" })).estado, 409);
  assert.equal((await admin.patch(`/api/plantillas/${sv.id}`, { clase_mensaje: "marketing" })).estado, 409);
  assert.equal((await admin.patch(`/api/plantillas/${mk.id}`, { clase_mensaje: "servicio" })).estado, 200, "mk ya no la usa nadie");
  assert.equal((await prisma.plantilla_mensaje.findUniqueOrThrow({ where: { id: mk2.id } })).clase_mensaje, "marketing");
});

test("EK-A5: cambiar el idioma de una plantilla a uno ya usado es 409, no 500", async () => {
  const a = await plantilla("dup", "servicio", { idioma: "es_MX" });
  const b = await plantilla("dup", "servicio", { idioma: "en_US" });
  const r = await admin.patch(`/api/plantillas/${b.id}`, { idioma: "es_MX" });
  assert.equal(r.estado, 409, JSON.stringify(r.cuerpo));
  void a;
});
