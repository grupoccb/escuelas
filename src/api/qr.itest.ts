// E3: el QR de una campaña por sucursal, de punta a punta: lo que se descarga (SVG o PNG) se DECODIFICA con un lector independiente y da la URL de la landing con el
// código de rastreo de esa campaña y esa sucursal; QR distintos por campaña y por sucursal; el código se crea una sola vez (también con peticiones simultáneas);
// permisos y alcance; descarga con nombre seguro; y el recorrido completo: escanear → llenar la landing → el lead queda atribuido a la campaña.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { inflateSync } from "node:zlib";
import { conAlcance } from "../datos/alcance.ts";
import { crearQr } from "../qr/qr.ts";
import { ZONA_DE_SILENCIO, ladoConSilencio } from "../qr/render.ts";
import { imagenDeModulos, leerQr } from "../testutil/lector-qr.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarDocumentosLegales, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

const BASE_PUBLICA = "https://escuela.ejemplo.test";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let slug: string;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let adminAjeno: ClienteApi;
let ajena: OrganizacionDePrueba;
const db = () => conAlcance(prisma, org.organizacionId);

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { origenesPermitidos: [BASE_PUBLICA] });
  org = await sembrarOrganizacion(prisma, "QR");
  ajena = await sembrarOrganizacion(prisma, "QR ajena");
  slug = `v-${randomBytes(5).toString("hex")}`;
  await prisma.vertical.update({ where: { id: org.verticalId }, data: { slug, nombre: "Vertical QR" } });
  await prisma.vertical.update({ where: { id: ajena.verticalId }, data: { slug: `v-${randomBytes(5).toString("hex")}` } });
  const entrar = async (o: OrganizacionDePrueba, rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar(org, "administrador");
  asesorNorte = await entrar(org, "asesor", [org.sucursales[0]!.id]);
  recepcion = await entrar(org, "recepcion", [org.sucursales[0]!.id]);
  maestro = await entrar(org, "maestro");
  adminAjeno = await entrar(ajena, "administrador");
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const campana = (nombre = "Campaña QR", extra: Record<string, unknown> = {}) =>
  prisma.campana.create({ data: { organizacion_id: org.organizacionId, nombre, origen: "presencial", vertical_id: org.verticalId, ...extra } });
const pedir = (c: ClienteApi, id: string, consulta = "") => c.get<{ url: string; codigo: string; codigo_formateado: string; sucursal_id: string | null }>(`/api/campanas/${id}/qr?formato=url${consulta}`);

/** Descarga el binario con la sesión del cliente. */
async function descargar(c: ClienteApi, ruta: string): Promise<{ estado: number; tipo: string | null; disposicion: string | null; cuerpo: Buffer }> {
  const res = await fetch(`${api.base}${ruta}`, { headers: { cookie: `${c.cookieDeSesion ? `${"sesion"}=${c.cookieDeSesion}` : ""}` } });
  return { estado: res.status, tipo: res.headers.get("content-type"), disposicion: res.headers.get("content-disposition"), cuerpo: Buffer.from(await res.arrayBuffer()) };
}

/** Las filas del SVG (rachas oscuras) → matriz de módulos. */
function modulosDeSvg(svg: string): boolean[][] {
  const lado = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)![1]);
  const n = lado - 2 * ZONA_DE_SILENCIO;
  const m = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (const t of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) for (let i = 0; i < Number(t[3]); i++) m[Number(t[2]) - ZONA_DE_SILENCIO]![Number(t[1]) - ZONA_DE_SILENCIO + i] = true;
  return m;
}

test("E3: el SVG y el PNG que se descargan, decodificados con un lector independiente, dan la URL de la landing con el código de la campaña y la sucursal", async () => {
  const c = await campana();
  const sucursal = org.sucursales[1]!.id;
  const info = await pedir(admin, c.id, `&sucursal_id=${sucursal}`);
  assert.equal(info.estado, 200, JSON.stringify(info.cuerpo));
  assert.equal(info.cuerpo.url, `${BASE_PUBLICA}/l/${slug}?c=${info.cuerpo.codigo}&s=${sucursal}`);
  const svg = await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${sucursal}`);
  assert.equal(svg.estado, 200);
  assert.match(svg.tipo ?? "", /^image\/svg\+xml/);
  const { rgba, ancho } = imagenDeModulos(modulosDeSvg(svg.cuerpo.toString("utf8")), 6);
  assert.equal(leerQr(rgba, ancho, ancho), info.cuerpo.url, "el SVG se decodifica a la URL");
  assert.equal(svg.cuerpo.toString("utf8"), (await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${sucursal}&mm=60`)).cuerpo.toString("utf8"), "es determinista");
  // El PNG: se descomprime y se lee como una foto.
  const png = await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${sucursal}&formato=png&escala=8`);
  assert.equal(png.estado, 200);
  assert.equal(png.tipo, "image/png");
  assert.deepEqual([...png.cuerpo.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const lado = ladoConSilencio(crearQr(info.cuerpo.url)) * 8;
  const idat = (() => {
    for (let i = 8; i < png.cuerpo.length; ) {
      const largo = png.cuerpo.readUInt32BE(i);
      if (png.cuerpo.toString("ascii", i + 4, i + 8) === "IDAT") return png.cuerpo.subarray(i + 8, i + 8 + largo);
      i += 12 + largo;
    }
    throw new Error("sin IDAT");
  })();
  const crudo = inflateSync(idat);
  const pixeles = new Uint8ClampedArray(lado * lado * 4);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) pixeles.set([crudo[y * (lado + 1) + 1 + x]!, crudo[y * (lado + 1) + 1 + x]!, crudo[y * (lado + 1) + 1 + x]!, 255], (y * lado + x) * 4);
  assert.equal(leerQr(pixeles, lado, lado), info.cuerpo.url, "el PNG se decodifica a la URL");
  // El tamaño impreso del SVG y el de píxeles del PNG se controlan.
  assert.match((await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${sucursal}&mm=100`)).cuerpo.toString("utf8"), /width="100mm" height="100mm"/);
  assert.ok((await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${sucursal}&formato=png&escala=4`)).cuerpo.length < png.cuerpo.length);
});

test("E3: QR distintos por campaña y por sucursal; el código se crea UNA vez y se reutiliza; hereda sucursal y vertical de la campaña si no se piden", async () => {
  const a = await campana("Campaña A");
  const b = await campana("Campaña B");
  const [n, s] = org.sucursales.map((x) => x.id) as [string, string];
  const aN = (await pedir(admin, a.id, `&sucursal_id=${n}`)).cuerpo;
  const aS = (await pedir(admin, a.id, `&sucursal_id=${s}`)).cuerpo;
  const bN = (await pedir(admin, b.id, `&sucursal_id=${n}`)).cuerpo;
  assert.equal(new Set([aN.codigo, aS.codigo, bN.codigo]).size, 3, "tres códigos distintos");
  assert.equal(new Set([aN.url, aS.url, bN.url]).size, 3);
  const matrices = [aN, aS, bN].map((x) => JSON.stringify(crearQr(x.url).modulos));
  assert.equal(new Set(matrices).size, 3, "tres QR distintos");
  // Pedirlo otra vez no crea otro código.
  assert.equal((await pedir(admin, a.id, `&sucursal_id=${n}`)).cuerpo.codigo, aN.codigo);
  await descargar(admin, `/api/campanas/${a.id}/qr?sucursal_id=${n}&formato=png`);
  assert.equal(await db().codigo_rastreo.count({ where: { campana_id: a.id, sucursal_id: n } }), 1);
  const fila = await db().codigo_rastreo.findFirstOrThrow({ where: { campana_id: a.id, sucursal_id: n } });
  assert.deepEqual([fila.tipo, fila.vertical_id, fila.usos, fila.activo], ["campana", org.verticalId, 0, true]);
  // Sin `sucursal_id`: la de la campaña; si la campaña no tiene, un QR general (sin sucursal en la URL).
  const conSucursal = await campana("Con sucursal", { sucursal_id: n });
  const heredada = (await pedir(admin, conSucursal.id)).cuerpo;
  assert.equal(heredada.sucursal_id, n);
  assert.match(heredada.url, new RegExp(`&s=${n}$`));
  const general = (await pedir(admin, a.id)).cuerpo;
  assert.equal(general.sucursal_id, null);
  assert.ok(!general.url.includes("&s="));
  assert.notEqual(general.codigo, aN.codigo);
  // Un código que ya no sirve (agotado o apagado) se reemplaza por uno nuevo; uno que sirve se conserva.
  await prisma.codigo_rastreo.update({ where: { id: fila.id }, data: { activo: false } });
  const nuevo = (await pedir(admin, a.id, `&sucursal_id=${n}`)).cuerpo;
  assert.notEqual(nuevo.codigo, aN.codigo);
  assert.equal(await db().codigo_rastreo.count({ where: { campana_id: a.id, sucursal_id: n } }), 2);
  assert.ok((await db().registro_cambio.count({ where: { entidad_tipo: "codigo_rastreo", accion: "crear" } })) >= 5, "cada código nuevo queda en el registro de cambios");
});

test("E3 concurrencia FORZADA: ocho peticiones a la vez del QR de una campaña y sucursal sin código crean UN solo código", async () => {
  const c = await campana("Concurrente");
  const barrera = new Barrera(8);
  // La barrera va justo antes de la sección crítica: las ocho pasan a la vez por la búsqueda de la campaña (fuera de la transacción).
  const raiz = conGanchos(prisma, { modelo: "campana", operacion: "findFirst", despues: async () => barrera.esperar(3000) });
  const forzada = levantarApi(raiz, { origenesPermitidos: [BASE_PUBLICA] });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const cliente = forzada.cliente();
    assert.equal((await cliente.login(org.slug, u.correo, u.contrasena)).estado, 201);
    // El login no toca `campana`; las ocho peticiones sí (una cada una).
    const rs = await Promise.all(Array.from({ length: 8 }, () => cliente.get<{ codigo: string }>(`/api/campanas/${c.id}/qr?formato=url&sucursal_id=${org.sucursales[0]!.id}`)));
    assert.deepEqual(rs.map((r) => r.estado), Array(8).fill(200), JSON.stringify(rs.map((r) => r.cuerpo)));
    assert.ok(barrera.completa, "las ocho llegaron juntas");
    assert.equal(new Set(rs.map((r) => r.cuerpo.codigo)).size, 1);
    assert.equal(await db().codigo_rastreo.count({ where: { campana_id: c.id } }), 1);
  } finally {
    await forzada.cerrar();
  }
});

test("E3 permisos y alcance: administrador y asesor sí (el asesor solo sus sucursales); recepción y maestro 403; sin sesión 401; otra organización 404", async () => {
  const c = await campana();
  const [n, s] = org.sucursales.map((x) => x.id) as [string, string];
  assert.equal((await pedir(asesorNorte, c.id, `&sucursal_id=${n}`)).estado, 200);
  assert.equal((await descargar(asesorNorte, `/api/campanas/${c.id}/qr?sucursal_id=${n}`)).estado, 200);
  assert.equal((await pedir(asesorNorte, c.id, `&sucursal_id=${s}`)).estado, 404, "una sucursal fuera de su alcance");
  const sinSucursal = await pedir(asesorNorte, c.id);
  assert.equal(sinSucursal.estado, 400, "el asesor tiene que elegir una de las suyas");
  for (const x of [recepcion, maestro]) assert.equal((await pedir(x, c.id, `&sucursal_id=${n}`)).estado, 403);
  assert.equal((await pedir(api.cliente(), c.id)).estado, 401);
  assert.equal((await pedir(adminAjeno, c.id)).estado, 404);
  assert.equal((await pedir(admin, "00000000-0000-4000-8000-0000000000ab")).estado, 404);
  assert.equal(await db().codigo_rastreo.count({ where: { campana_id: c.id, sucursal_id: s } }), 0, "lo rechazado no creó códigos");
});

test("E3 validaciones: formato, tamaños, vertical y sucursal que la vertical sí imparte; la base pública no se toma del encabezado Host si hay una configurada", async () => {
  const c = await campana();
  const n = org.sucursales[0]!.id;
  assert.equal((await pedir(admin, c.id, "&formato=gif")).estado, 400);
  assert.equal((await admin.get(`/api/campanas/${c.id}/qr?formato=png&escala=0`)).estado, 400);
  assert.equal((await admin.get(`/api/campanas/${c.id}/qr?formato=png&escala=3`)).estado, 400, "EE-14: menos de 4 px por módulo no se lee");
  assert.equal((await admin.get(`/api/campanas/${c.id}/qr?formato=png&escala=4&sucursal_id=${org.sucursales[0]!.id}`)).estado, 200);
  assert.equal((await admin.get(`/api/campanas/${c.id}/qr?formato=png&escala=41`)).estado, 400);
  assert.equal((await admin.get(`/api/campanas/${c.id}/qr?mm=19`)).estado, 400);
  assert.equal((await admin.get(`/api/campanas/${c.id}/qr?mm=301`)).estado, 400);
  assert.equal((await admin.get(`/api/campanas/${c.id}/qr?mm=60&mm=70`)).estado, 400, "un parámetro repetido");
  assert.equal((await pedir(admin, c.id, "&sucursal_id=no-es-uuid")).estado, 400);
  // Sin vertical en la campaña: hay que indicarla; con una de otra organización o inexistente, no.
  const sinVertical = await campana("Sin vertical", { vertical_id: null });
  assert.equal((await pedir(admin, sinVertical.id, `&sucursal_id=${n}`)).estado, 400);
  assert.equal((await pedir(admin, sinVertical.id, `&sucursal_id=${n}&vertical_id=${ajena.verticalId}`)).estado, 400);
  assert.equal((await pedir(admin, sinVertical.id, `&sucursal_id=${n}&vertical_id=${org.verticalId}`)).estado, 200);
  assert.equal((await pedir(admin, c.id, `&sucursal_id=${n}&vertical_id=${ajena.verticalId}`)).estado, 400, "la campaña es de otra vertical");
  // La vertical no se imparte en esa sucursal.
  await prisma.sucursal_vertical.updateMany({ where: { vertical_id: org.verticalId, sucursal_id: org.sucursales[1]!.id }, data: { activo: false } });
  assert.equal((await pedir(admin, c.id, `&sucursal_id=${org.sucursales[1]!.id}`)).estado, 400);
  await prisma.sucursal_vertical.updateMany({ where: { vertical_id: org.verticalId, sucursal_id: org.sucursales[1]!.id }, data: { activo: true } });
  // Un Host falso no cambia la base: sale de la configuración.
  const res = await fetch(`${api.base}/api/campanas/${c.id}/qr?formato=url&sucursal_id=${n}`, { headers: { cookie: `sesion=${admin.cookieDeSesion}`, "x-forwarded-host": "evil.test" } });
  assert.ok(((await res.json()) as { url: string }).url.startsWith(`${BASE_PUBLICA}/l/`));
});

test("E3 descarga: nombre de archivo ASCII y seguro aunque el nombre de la campaña traiga acentos, comillas o saltos de línea", async () => {
  const c = await campana('Campaña "Otoño"; filename=evil\r\nX-Inyeccion: 1');
  const n = org.sucursales[0]!.id;
  const d = await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${n}&descargar=true`);
  assert.equal(d.estado, 200);
  assert.match(d.disposicion ?? "", /^attachment; filename="qr-campana-otono-filename-evil-x-inyeccion-1-norte\.svg"$/);
  const png = await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${n}&formato=png&descargar=true`);
  assert.match(png.disposicion ?? "", /\.png"$/);
  assert.equal((await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${n}`)).disposicion, null, "sin descargar=true se muestra en el navegador");
  // El título accesible del SVG va escapado.
  assert.ok(!d.cuerpo.toString("utf8").includes('"Otoño"; filename'));
});

test("E3 recorrido completo: se escanea el QR → la landing trae el código y la sucursal → el lead queda atribuido a la campaña de la sucursal (la fuente `presencial` queda en la campaña para los reportes)", async () => {
  const c = await campana("QR en recepción");
  const n = org.sucursales[0]!.id;
  const { rgba, ancho } = imagenDeModulos(modulosDeSvg((await descargar(admin, `/api/campanas/${c.id}/qr?sucursal_id=${n}`)).cuerpo.toString("utf8")), 6);
  const urlEscaneada = new URL(leerQr(rgba, ancho, ancho)!);
  assert.equal(urlEscaneada.origin, BASE_PUBLICA);
  await sembrarDocumentosLegales(prisma, org);
  await prisma.canal_whatsapp.update({ where: { id: org.canalId }, data: { numero_whatsapp: `whatsapp:+5255${String(30_000_000 + Math.floor(Math.random() * 60_000_000))}` } });
  // La landing de la URL escaneada (la misma app, en el puerto de la prueba).
  const pagina = await fetch(`${api.base}${urlEscaneada.pathname}${urlEscaneada.search}`);
  const html = await pagina.text();
  assert.equal(pagina.status, 200);
  assert.match(html, new RegExp(`name="c" value="${urlEscaneada.searchParams.get("c")}"`));
  assert.match(html, new RegExp(`<option value="${n}" selected>`));
  const documento = /name="documento_id" value="([^"]+)"/.exec(html)![1]!;
  const cuerpo = new URLSearchParams({ nombre_alumno: "Mateo", edad: "8", sucursal_id: n, telefono: "55 4321 8765", acepta_aviso: "on", documento_id: documento, version: "1", c: urlEscaneada.searchParams.get("c")! });
  const envio = await fetch(`${api.base}/l/${slug}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: cuerpo.toString() });
  assert.equal(envio.status, 303);
  await envio.text();
  const lead = await db().lead.findFirstOrThrow({ where: { telefono: "+525543218765" }, include: { campana: true } });
  assert.equal(lead.campana_id, c.id);
  assert.equal(lead.campana?.origen, "presencial");
  assert.equal(lead.sucursal_interes_id, n);
  assert.equal((await db().codigo_rastreo.findFirstOrThrow({ where: { campana_id: c.id, tipo: "campana" } })).usos, 1);
  // Para el reporte: leads por fuente de campaña.
  const porFuente = await db().campana.findMany({ where: { id: c.id }, select: { origen: true, _count: { select: { leads: true } } } });
  assert.deepEqual(porFuente.map((x) => [x.origen, x._count.leads]), [["presencial", 1]]);
});

test("E3: si el slug de la vertical se repite entre organizaciones la URL lleva `org=`; si no, no", async () => {
  const comun = `comun-${randomBytes(4).toString("hex")}`;
  const m = await sembrarOrganizacion(prisma, "Slug repetido");
  await prisma.vertical.update({ where: { id: m.verticalId }, data: { slug: comun } });
  await prisma.vertical.update({ where: { id: ajena.verticalId }, data: { slug: comun } });
  const u = await sembrarUsuario(prisma, m.organizacionId, { rol: "administrador" });
  const cliente = api.cliente();
  await cliente.login(m.slug, u.correo, u.contrasena);
  const camp = await prisma.campana.create({ data: { organizacion_id: m.organizacionId, nombre: "C", origen: "otro", vertical_id: m.verticalId } });
  const r = await cliente.get<{ url: string }>(`/api/campanas/${camp.id}/qr?formato=url&sucursal_id=${m.sucursales[0]!.id}`);
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.equal(new URL(r.cuerpo.url).searchParams.get("org"), m.slug);
  // Sin slug de organización no hay cómo distinguirla: se avisa en vez de imprimir un QR ambiguo.
  await prisma.organizacion.update({ where: { id: m.organizacionId }, data: { slug: null } });
  assert.equal((await cliente.get(`/api/campanas/${camp.id}/qr?formato=url&sucursal_id=${m.sucursales[0]!.id}`)).estado, 409);
  await prisma.vertical.update({ where: { id: ajena.verticalId }, data: { slug: `v-${randomBytes(5).toString("hex")}` } });
  assert.equal(new URL((await cliente.get<{ url: string }>(`/api/campanas/${camp.id}/qr?formato=url&sucursal_id=${m.sucursales[0]!.id}`)).cuerpo.url).searchParams.get("org"), null, "ya único: sin org");
});

test("EE-14: el QR no reutiliza un código de otra vertical (si la campaña cambió de vertical): hace uno nuevo con la vertical vigente", async () => {
  const otraVertical = await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Otra", slug: `o-${Math.random().toString(36).slice(2, 8)}` } });
  const c = await campana("Campaña que cambió de vertical");
  const n = org.sucursales[0]!.id;
  const viejo = await prisma.codigo_rastreo.create({ data: { organizacion_id: org.organizacionId, codigo: "VJQRTMK2", tipo: "campana", campana_id: c.id, sucursal_id: n, vertical_id: otraVertical.id } });
  const r = (await pedir(admin, c.id, `&sucursal_id=${n}`)).cuerpo;
  assert.notEqual(r.codigo, viejo.codigo, "no se reutiliza el de la otra vertical");
  const nuevo = await db().codigo_rastreo.findFirstOrThrow({ where: { codigo: r.codigo } });
  assert.equal(nuevo.vertical_id, org.verticalId);
  assert.equal(await db().codigo_rastreo.count({ where: { campana_id: c.id, sucursal_id: n } }), 2);
  // Y con el correcto ya hecho, se reutiliza.
  assert.equal((await pedir(admin, c.id, `&sucursal_id=${n}`)).cuerpo.codigo, nuevo.codigo);
});
