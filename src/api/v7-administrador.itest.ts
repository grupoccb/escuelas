// V7 (recorrido del administrador): lo que la API ganó al ver trabajar a quien administra una escuela.
//  - `GET /api/administracion/primeros-pasos`: los ocho pasos para dejar lista una escuela nueva, calculados contra el estado REAL (nada se marca a mano), uno por uno, con su detalle de por
//    qué falta, el siguiente que toca, el aislamiento entre organizaciones y el permiso (solo el administrador).
//  - Los mensajes que ve la escuela cuando algo no se puede (un grupo con inscritos, una fecha de precio ocupada) dicen la cantidad en palabras y no el «(es)» de un formulario.
// Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarOrganizacion } from "../testutil/semilla.ts";
import { SOLO_CAPTACION, TODOS_ENCENDIDOS, aFilaDeModulos } from "../modulos/index.ts";

let prisma: PrismaPruebas;
let servidor: ApiLevantada;
const reloj = new Date("2026-11-10T16:00:00Z");

before(() => {
  prisma = crearPrismaDePruebas(undefined, 10);
  servidor = levantarApi(prisma, { reloj: () => reloj });
});
after(async () => {
  await servidor.cerrar();
  await prisma.$disconnect();
});

interface Paso {
  id: string;
  titulo: string;
  hecho: boolean;
  detalle: string | null;
  ruta: string;
}
interface Respuesta {
  pasos: Paso[];
  hechos: number;
  total: number;
  siguiente: string | null;
}

/** Una escuela VACÍA: solo la organización, su administrador y la captación encendida (como la plantilla de un cliente nuevo). */
async function escuelaVacia(nombre: string): Promise<{ orgId: string; slug: string; admin: ClienteApi; entrar: (rol: "asesor" | "maestro" | "recepcion") => Promise<ClienteApi> }> {
  const slug = `vacia-${Math.random().toString(36).slice(2, 10)}`;
  const o = await prisma.organizacion.create({ data: { nombre: `${nombre} ${slug}`, slug } });
  await fijarConfiguracion(prisma, o.id, aFilaDeModulos(SOLO_CAPTACION));
  const u = await sembrarUsuario(prisma, o.id, { rol: "administrador" });
  const admin = servidor.cliente();
  assert.equal((await admin.login(slug, u.correo, u.contrasena)).estado, 201);
  const entrar = async (rol: "asesor" | "maestro" | "recepcion"): Promise<ClienteApi> => {
    const x = await sembrarUsuario(prisma, o.id, { rol });
    const c = servidor.cliente();
    assert.equal((await c.login(slug, x.correo, x.contrasena)).estado, 201);
    return c;
  };
  return { orgId: o.id, slug, admin, entrar };
}

const leer = async (c: ClienteApi): Promise<Respuesta> => {
  const r = await c.get<Respuesta>("/api/administracion/primeros-pasos");
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  return r.cuerpo;
};
const paso = (r: Respuesta, id: string): Paso => r.pasos.find((p) => p.id === id)!;

test("una escuela vacía: 0 de 8, el primer paso es la disciplina y cada paso lleva a su pantalla", async () => {
  const e = await escuelaVacia("Vacía");
  const r = await leer(e.admin);
  assert.equal(r.total, 8);
  assert.equal(r.hechos, 0);
  assert.equal(r.siguiente, "disciplinas");
  assert.deepEqual(
    r.pasos.map((p) => [p.id, p.ruta]),
    [
      ["disciplinas", "/admin/verticales"],
      ["sucursales", "/admin/sucursales"],
      ["programas", "/admin/programas"],
      ["precios", "/admin/precios"],
      ["grupos", "/admin/grupos"],
      ["personas", "/admin/usuarios"],
      ["canal", "/admin/canales"],
      ["modulos", "/admin/modulos"],
    ],
  );
  // Sin programas, el precio dice qué hacer primero; solo la captación encendida: el módulo falta; la persona que falta es el asesor.
  assert.equal(paso(r, "precios").detalle, "Primero crea un programa.");
  assert.equal(paso(r, "personas").detalle, "Falta un asesor.");
  assert.equal(paso(r, "modulos").hecho, false);
  for (const p of r.pasos) assert.ok(p.titulo.length > 10 && !/[_]/.test(p.titulo), `el título de ${p.id} se lee como frase`);
});

test("cada paso se vuelve «hecho» solo cuando los datos lo muestran, y el siguiente avanza", async () => {
  const e = await escuelaVacia("Paso a paso");
  const org = e.orgId;
  const ahora = reloj;

  // 1. Una disciplina.
  const vertical = await prisma.vertical.create({ data: { organizacion_id: org, nombre: "Disciplina uno", slug: `d-${e.slug}` } });
  let r = await leer(e.admin);
  assert.equal(paso(r, "disciplinas").hecho, true);
  assert.equal(r.siguiente, "sucursales");

  // 2. Una sucursal SIN disciplina todavía: no cuenta y dice cuál falta; al marcarla, sí.
  const sucursal = await prisma.sucursal.create({ data: { organizacion_id: org, nombre: "Sucursal uno", zona_horaria: "America/Mexico_City" } });
  r = await leer(e.admin);
  assert.equal(paso(r, "sucursales").hecho, false);
  assert.match(paso(r, "sucursales").detalle ?? "", /«Sucursal uno» no imparte ninguna disciplina todavía/);
  const ofrece = await prisma.sucursal_vertical.create({ data: { organizacion_id: org, sucursal_id: sucursal.id, vertical_id: vertical.id } });
  r = await leer(e.admin);
  assert.equal(paso(r, "sucursales").hecho, true);
  assert.equal(r.siguiente, "programas");

  // 3. Un programa; sin precio, el paso del precio lo nombra.
  const programa = await prisma.programa.create({ data: { organizacion_id: org, vertical_id: vertical.id, sucursal_id: sucursal.id, nombre: "Programa uno", edad_min: 4, edad_max: 8 } });
  r = await leer(e.admin);
  assert.equal(paso(r, "programas").hecho, true);
  assert.equal(paso(r, "precios").hecho, false);
  assert.match(paso(r, "precios").detalle ?? "", /Falta el precio de «Programa uno»/);
  assert.equal(r.siguiente, "precios");

  // 4. Un precio que empieza MAÑANA no cuenta (hoy el programa sigue sin precio); uno que rige hoy, sí.
  await prisma.precio.create({ data: { organizacion_id: org, programa_id: programa.id, costo_inscripcion: "500.00", costo_mensualidad: "900.00", vigencia_desde: new Date("2026-11-11T00:00:00.000Z") } });
  r = await leer(e.admin);
  assert.equal(paso(r, "precios").hecho, false, "un precio futuro no basta para inscribir hoy");
  await prisma.precio.create({ data: { organizacion_id: org, programa_id: programa.id, costo_inscripcion: "450.00", costo_mensualidad: "800.00", vigencia_desde: new Date("2026-01-01T00:00:00.000Z"), vigencia_hasta: new Date("2026-11-10T00:00:00.000Z") } });
  r = await leer(e.admin);
  assert.equal(paso(r, "precios").hecho, true);
  // Un segundo programa sin precio vuelve a pedirlo, con su nombre.
  const otro = await prisma.programa.create({ data: { organizacion_id: org, vertical_id: vertical.id, sucursal_id: sucursal.id, nombre: "Programa dos", edad_min: 9, edad_max: 12 } });
  r = await leer(e.admin);
  assert.equal(paso(r, "precios").hecho, false);
  assert.match(paso(r, "precios").detalle ?? "", /Falta el precio de «Programa dos»/);
  await prisma.programa.update({ where: { id: otro.id }, data: { eliminado_en: ahora } });
  assert.equal(paso(await leer(e.admin), "precios").hecho, true, "un programa dado de baja ya no cuenta");

  // 5. Un grupo sin horario no cuenta (no aparece en el cotizador) y lo dice; con horario, sí.
  const grupo = await prisma.grupo.create({ data: { organizacion_id: org, programa_id: programa.id, nombre: "Grupo uno", cupo_maximo: 10 } });
  r = await leer(e.admin);
  assert.equal(paso(r, "grupos").hecho, false);
  assert.match(paso(r, "grupos").detalle ?? "", /1 grupo no tiene horario/);
  await prisma.grupo_horario.create({ data: { organizacion_id: org, grupo_id: grupo.id, dia_semana: 2, hora_inicio_min: 960, hora_fin_min: 1020 } });
  r = await leer(e.admin);
  assert.equal(paso(r, "grupos").hecho, true);
  assert.equal(paso(r, "grupos").detalle, null);

  // 6. Personas: el asesor basta con solo la captación; al encender finanzas y clase muestra piden recepción y maestro.
  assert.equal(paso(r, "personas").hecho, false);
  await sembrarUsuario(prisma, org, { rol: "asesor" });
  r = await leer(e.admin);
  assert.equal(paso(r, "personas").hecho, true);
  await fijarConfiguracion(prisma, org, { ...aFilaDeModulos(TODOS_ENCENDIDOS) });
  r = await leer(e.admin);
  assert.equal(paso(r, "personas").hecho, false);
  assert.equal(paso(r, "personas").detalle, "Falta un maestro y una persona de recepción.");
  await sembrarUsuario(prisma, org, { rol: "maestro" });
  await sembrarUsuario(prisma, org, { rol: "recepcion", activo: false });
  r = await leer(e.admin);
  assert.equal(paso(r, "personas").detalle, "Falta una persona de recepción.", "alguien desactivado no cuenta");
  await sembrarUsuario(prisma, org, { rol: "recepcion" });
  assert.equal(paso(await leer(e.admin), "personas").hecho, true);

  // 7. Canal de WhatsApp: sin bandeja no cuenta y lo dice; con bandeja, sí.
  r = await leer(e.admin);
  assert.equal(paso(r, "canal").hecho, false);
  const canal = await prisma.canal_whatsapp.create({ data: { organizacion_id: org, vertical_id: vertical.id, nombre_publico: "Canal uno" } });
  r = await leer(e.admin);
  assert.equal(paso(r, "canal").hecho, false);
  assert.match(paso(r, "canal").detalle ?? "", /«Canal uno» todavía no tiene bandeja/);
  await prisma.bandeja_chatwoot.create({ data: { organizacion_id: org, canal_whatsapp_id: canal.id, nombre: "Bandeja uno", chatwoot_account_id: 1, chatwoot_inbox_id: 1_000_000 + Math.floor(Math.random() * 1_000_000_000) } });
  assert.equal(paso(await leer(e.admin), "canal").hecho, true);

  // 8. Módulos: con todo encendido está hecho; con solo la captación, falta (y el aviso de las personas se acorta).
  assert.equal(paso(await leer(e.admin), "modulos").hecho, true);
  await fijarConfiguracion(prisma, org, { ...aFilaDeModulos(SOLO_CAPTACION) });
  r = await leer(e.admin);
  assert.equal(paso(r, "modulos").hecho, false);
  await fijarConfiguracion(prisma, org, { ...aFilaDeModulos({ ...SOLO_CAPTACION, cotizador: true }) });
  r = await leer(e.admin);
  assert.equal(paso(r, "modulos").hecho, true);
  assert.match(paso(r, "modulos").detalle ?? "", /Apagados por ahora: Clase muestra, Inscripción, Operación diaria.*, Finanzas y Tableros\./);

  // Todo listo: 8 de 8 y ningún «siguiente».
  await fijarConfiguracion(prisma, org, { ...aFilaDeModulos(TODOS_ENCENDIDOS) });
  r = await leer(e.admin);
  assert.equal(r.hechos, 8);
  assert.equal(r.siguiente, null);

  // Una disciplina dada de baja o una sucursal desactivada dejan de contar.
  await prisma.sucursal.update({ where: { id: sucursal.id }, data: { activo: false } });
  r = await leer(e.admin);
  assert.equal(paso(r, "sucursales").hecho, false);
  assert.equal(r.siguiente, "sucursales");
  await prisma.sucursal.update({ where: { id: sucursal.id }, data: { activo: true } });
  await prisma.sucursal_vertical.update({ where: { id: ofrece.id }, data: { eliminado_en: ahora } });
  assert.equal(paso(await leer(e.admin), "sucursales").hecho, false, "marcar que ya no imparte la disciplina también cuenta");
});

test("solo cuenta lo de la propia escuela: otra con todo hecho no adelanta nada a una vacía", async () => {
  const llena = await sembrarOrganizacion(prisma, "Otra con todo");
  const sinNada = await escuelaVacia("Sin nada");
  const r = await leer(sinNada.admin);
  assert.equal(r.hechos, 0, "los datos de otra organización no cuentan");
  assert.equal(r.siguiente, "disciplinas");
  assert.ok(llena.organizacionId !== sinNada.orgId);
});

test("solo el administrador lo ve (el asesor, el maestro y recepción reciben 403) y sin sesión, 401", async () => {
  const e = await escuelaVacia("Permisos");
  for (const rol of ["asesor", "maestro", "recepcion"] as const) {
    const c = await e.entrar(rol);
    assert.equal((await c.get("/api/administracion/primeros-pasos")).estado, 403, rol);
  }
  assert.equal((await servidor.cliente().get("/api/administracion/primeros-pasos")).estado, 401);
});

test("con un módulo apagado la ruta sigue viva (es de la configuración, no de ningún módulo)", async () => {
  const e = await escuelaVacia("Sin módulos");
  assert.equal((await e.admin.get("/api/administracion/primeros-pasos")).estado, 200);
});

// V13-fix EV-16: «Para empezar» no habla del cotizador cuando está apagado (y no promete «inscribir» sin ese módulo).
test("EV-16: los detalles de «Para empezar» solo mencionan el cotizador (y la inscripción) cuando están encendidos", async () => {
  const e = await escuelaVacia("Detalles por módulo");
  const org = e.orgId;
  const sucursal = await prisma.sucursal.create({ data: { organizacion_id: org, nombre: "Sucursal d", zona_horaria: "America/Mexico_City" } });
  const vertical = await prisma.vertical.create({ data: { organizacion_id: org, nombre: "Disciplina d", slug: `d-${e.slug}` } });
  await prisma.sucursal_vertical.create({ data: { organizacion_id: org, sucursal_id: sucursal.id, vertical_id: vertical.id } });
  const programa = await prisma.programa.create({ data: { organizacion_id: org, vertical_id: vertical.id, sucursal_id: sucursal.id, nombre: "Programa d", edad_min: 4, edad_max: 8 } });
  await prisma.grupo.create({ data: { organizacion_id: org, programa_id: programa.id, nombre: "Grupo d", cupo_maximo: 10 } });
  const detalles = async (modulos: Parameters<typeof aFilaDeModulos>[0]) => {
    await fijarConfiguracion(prisma, org, { ...aFilaDeModulos(modulos) });
    const r = await leer(e.admin);
    return { precios: paso(r, "precios").detalle ?? "", grupos: paso(r, "grupos").detalle ?? "" };
  };
  const solo = await detalles(SOLO_CAPTACION);
  assert.equal(solo.precios, "Falta el precio de «Programa d».");
  assert.equal(solo.grupos, "1 grupo no tiene horario.");
  const conCotizador = await detalles({ ...SOLO_CAPTACION, cotizador: true });
  assert.equal(conCotizador.precios, "Falta el precio de «Programa d»: sin precio no aparece en el cotizador.");
  assert.equal(conCotizador.grupos, "1 grupo no tiene horario: sin horario no aparece en el cotizador.");
  const conMuestra = await detalles({ ...SOLO_CAPTACION, clase_muestra: true });
  assert.equal(conMuestra.grupos, "1 grupo no tiene horario: sin horario no se pueden agendar clases muestra en él.");
  const todo = await detalles(TODOS_ENCENDIDOS);
  assert.equal(todo.precios, "Falta el precio de «Programa d»: sin precio no aparece en el cotizador ni se puede inscribir a nadie.");
  for (const x of [solo.precios, solo.grupos, conMuestra.precios]) assert.ok(!/cotizador/.test(x), x);
});
