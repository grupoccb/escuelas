// V5: hasta cuántos días de atraso persigue el lead frío y el recordatorio de pago atrasado. Antes solo se cambiaba por SQL (`automatizacion.condiciones`); ahora lo cambia el administrador en
// Administración → Automatizaciones. Postgres real, la app real. Valor por omisión (el del seed: 14 y 60; sin dato, las constantes), rango por aviso, solo el administrador, registro de cambios,
// no pisa lo demás que haya en `condiciones` y el efecto real en lo que el motor persigue.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { atrasoMaximoDias as atrasoDeLeadFrio, ATRASO_MAXIMO_POR_OMISION_DIAS as OMISION_FRIO } from "../automatizaciones/seguimiento.ts";
import { atrasoMaximoDias as atrasoDeCobranza, ATRASO_MAXIMO_POR_OMISION_DIAS as OMISION_COBRANZA } from "../cobranza/plan.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let admin: ClienteApi;
let asesor: ClienteApi;
let ajeno: ClienteApi;
const ids = {} as Record<"frio" | "vencido" | "reenganche", string>;

interface Err { error: { mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Auto { id: string; evento_disparador: string; max_atraso_dias: number | null }
const detalle = (r: { cuerpo: unknown }): string => JSON.stringify((r.cuerpo as Err).error);

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "V5 atraso");
  const otra = await sembrarOrganizacion(prisma, "V5 atraso ajena");
  const entrar = async (o: OrganizacionDePrueba, rol: "administrador" | "asesor") => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales: rol === "asesor" ? [o.sucursales[0]!.id] : [] });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar(org, "administrador");
  asesor = await entrar(org, "asesor");
  ajeno = await entrar(otra, "administrador");
  const crear = async (nombre: string, evento: "lead_frio" | "cargo_vencido" | "lead_sin_respuesta", condiciones: object) =>
    (await prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre, evento_disparador: evento, offset_minutos: evento === "lead_sin_respuesta" ? 1500 : 0, condiciones } })).id;
  ids.frio = await crear("Lead frío", "lead_frio", { max_atraso_dias: 14, otra_condicion: "se conserva" });
  ids.vencido = await crear("Pago atrasado", "cargo_vencido", {});
  ids.reenganche = await crear("Reenganche", "lead_sin_respuesta", {});
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("el valor por omisión: lo del seed, o la constante si la automatización no lo trae; los demás avisos no tienen tope", async () => {
  assert.deepEqual([OMISION_FRIO, OMISION_COBRANZA], [14, 60]);
  const lista = (await admin.get<{ datos: Auto[] }>("/api/automatizaciones")).cuerpo.datos;
  const por = (id: string) => lista.find((a) => a.id === id)!;
  assert.equal(por(ids.frio).max_atraso_dias, 14);
  assert.equal(por(ids.vencido).max_atraso_dias, 60, "sin dato: la constante de siempre");
  assert.equal(por(ids.reenganche).max_atraso_dias, null);
  assert.equal(JSON.stringify(lista).includes("condiciones"), false, "el campo técnico no se muestra");
});

test("rango por aviso (lead frío 1–90, pago atrasado 1–365), mensajes en español y solo el administrador", async () => {
  for (const [id, valor, texto] of [[ids.frio, 0, /de 1 a 90/], [ids.frio, 91, /de 1 a 90/], [ids.vencido, 0, /de 1 a 365/], [ids.vencido, 366, /de 1 a 365/]] as const) {
    const r = await admin.patch<Err>(`/api/automatizaciones/${id}`, { max_atraso_dias: valor });
    assert.equal(r.estado, 400, `${valor}: ${detalle(r)}`);
    assert.match(detalle(r), texto);
  }
  for (const malo of [1.5, "10", null]) assert.equal((await admin.patch(`/api/automatizaciones/${ids.frio}`, { max_atraso_dias: malo })).estado, 400, String(malo));
  const sin = await admin.patch<Err>(`/api/automatizaciones/${ids.reenganche}`, { max_atraso_dias: 10 });
  assert.equal(sin.estado, 400);
  assert.match(detalle(sin), /no tiene tope de días de atraso/);
  assert.equal((await asesor.patch(`/api/automatizaciones/${ids.frio}`, { max_atraso_dias: 10 })).estado, 403);
  assert.equal((await ajeno.patch(`/api/automatizaciones/${ids.frio}`, { max_atraso_dias: 10 })).estado, 404, "de otra organización");
  const fila = await prisma.automatizacion.findFirstOrThrow({ where: { id: ids.frio } });
  assert.deepEqual(fila.condiciones, { max_atraso_dias: 14, otra_condicion: "se conserva" }, "nada se guardó");
});

test("EFECTO: el administrador lo cambia, queda en el registro, no pisa el resto de las condiciones y el motor lo lee al instante", async () => {
  const r = await admin.patch<Auto>(`/api/automatizaciones/${ids.frio}`, { max_atraso_dias: 30 });
  assert.equal(r.estado, 200, detalle(r));
  assert.equal(r.cuerpo.max_atraso_dias, 30);
  const fila = await prisma.automatizacion.findFirstOrThrow({ where: { id: ids.frio } });
  assert.deepEqual(fila.condiciones, { max_atraso_dias: 30, otra_condicion: "se conserva" });
  assert.equal(atrasoDeLeadFrio(fila.condiciones), 30, "lo que lee el motor");
  const v = await admin.patch<Auto>(`/api/automatizaciones/${ids.vencido}`, { max_atraso_dias: 120 });
  assert.equal(v.cuerpo.max_atraso_dias, 120);
  assert.equal(atrasoDeCobranza((await prisma.automatizacion.findFirstOrThrow({ where: { id: ids.vencido } })).condiciones), 120);
  const cambio = await prisma.registro_cambio.findFirst({ where: { organizacion_id: org.organizacionId, entidad_tipo: "automatizacion", entidad_id: ids.frio }, orderBy: { creado_en: "desc" } });
  assert.deepEqual([(cambio?.antes as Record<string, unknown>)["max_atraso_dias"], (cambio?.despues as Record<string, unknown>)["max_atraso_dias"]], [14, 30]);
  // Otros cambios de la misma automatización no tocan el tope.
  assert.equal((await admin.patch(`/api/automatizaciones/${ids.frio}`, { max_intentos: 2 })).estado, 200);
  assert.equal(atrasoDeLeadFrio((await prisma.automatizacion.findFirstOrThrow({ where: { id: ids.frio } })).condiciones), 30);
});
