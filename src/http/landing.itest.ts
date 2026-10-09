// E1: la landing pública por vertical, de punta a punta por HTTP (la app real): el cuestionario, el lead + prospecto idempotentes, el aviso de
// privacidad con evidencia, el consentimiento por formulario, la atribución, el enlace de WhatsApp con el código de rastreo, la protección
// contra abuso (límite por IP, honeypot, tope de cuerpo, sin enumeración) y que todo lo que se refleja va escapado.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { fechaLocal } from "../lib/horario.ts";
import { limitesDesdeEntorno } from "./config-limites.ts";
import { LimitadorDeTasa } from "./limite.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarDocumentosLegales, sembrarOrganizacion, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, type ApiLevantada } from "../testutil/api.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;

before(() => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

let consecutivoDeNumero = 0;
const numeroUnico = (): string => `5255${String(10_000_000 + randomInt(0, 80_000) * 100 + (consecutivoDeNumero++ % 100)).padStart(8, "0")}`;

interface Mundo {
  org: OrganizacionDePrueba;
  slug: string;
  /** El número del canal, en dígitos (como va en `wa.me`), único por corrida: la base no deja repetir un número entre canales. */
  numero: string;
  docs: DocumentosLegalesSembrados;
  db: ReturnType<typeof conAlcance>;
  ruta: string;
}

/** Una organización con su vertical de slug ÚNICO (el de `sembrarOrganizacion` se repite en todas), sus documentos legales y un número de WhatsApp. */
async function mundo(o: { numero?: string | null; color?: string | null; logo?: string | null; sinDocumentos?: boolean } = {}): Promise<Mundo> {
  const org = await sembrarOrganizacion(prisma, "Landing");
  const slug = `v-${randomBytes(5).toString("hex")}`;
  await prisma.vertical.update({ where: { id: org.verticalId }, data: { slug, nombre: "Vertical <Uno> & Cía", color_marca: o.color === undefined ? "#7a1fa2" : o.color, logo_url: o.logo === undefined ? null : o.logo } });
  const docs = o.sinDocumentos ? ({ reglamento: "", usoImagen: "", avisoPrivacidad: "00000000-0000-4000-8000-0000000000aa" } satisfies DocumentosLegalesSembrados) : await sembrarDocumentosLegales(prisma, org);
  const numero = numeroUnico();
  await prisma.canal_whatsapp.update({ where: { id: org.canalId }, data: { numero_whatsapp: o.numero === undefined ? `whatsapp:+${numero}` : o.numero } });
  return { org, slug, numero, docs, db: conAlcance(prisma, org.organizacionId), ruta: `/l/${slug}` };
}

/** Los campos de un envío válido; `cambio` los sobrescribe (undefined = no se manda). */
function campos(m: Mundo, cambio: Record<string, string | undefined> = {}): URLSearchParams {
  const base: Record<string, string | undefined> = {
    nombre_alumno: "Mateo Soto",
    edad: "8",
    sucursal_id: m.org.sucursales[0]!.id,
    telefono: "55 1234 5678",
    nombre_contacto: "Rosa",
    acepta_aviso: "on",
    documento_id: m.docs.avisoPrivacidad,
    version: "1",
    ...cambio,
  };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== undefined) p.set(k, v);
  return p;
}

const enviar = (base: string, ruta: string, cuerpo: URLSearchParams | string, cabeceras: Record<string, string> = {}) =>
  fetch(`${base}${ruta}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Prueba/1.0", ...cabeceras }, body: cuerpo.toString() });

test("E1 GET: el cuestionario sale de las tablas (nombre, color, sucursales, aviso de privacidad), accesible y con CSP", async () => {
  const m = await mundo({ logo: "https://cdn.ejemplo.test/logo.png" });
  const r = await fetch(`${api.base}${m.ruta}?utm_source=anuncio`);
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^text\/html; charset=utf-8/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  // Los datos de las tablas, escapados (el nombre de la vertical trae < > &).
  assert.match(html, /<h1>Vertical &lt;Uno&gt; &amp; Cía<\/h1>/);
  assert.ok(!html.includes("<Uno>"), "nada sin escapar");
  assert.match(html, /--marca: #7a1fa2;/);
  assert.match(html, /--sobre-marca: #ffffff;/);
  assert.match(html, /<img src="https:\/\/cdn\.ejemplo\.test\/logo\.png" alt="">/);
  for (const s of m.org.sucursales) assert.match(html, new RegExp(`<option value="${s.id}">${s.nombre}</option>`));
  assert.match(html, /<summary>Documento de prueba aviso_privacidad<\/summary>/);
  assert.match(html, /Texto de prueba de aviso_privacidad, versión 1\./);
  assert.match(html, new RegExp(`name="documento_id" value="${m.docs.avisoPrivacidad}"`));
  assert.match(html, /name="version" value="1"/);
  assert.match(html, /<input type="hidden" name="utm_source" value="anuncio">/);
  // Accesibilidad: cada control con su etiqueta.
  for (const id of ["nombre_alumno", "edad", "sucursal_id", "telefono", "nombre_contacto", "acepta_aviso", "sitio_web"]) {
    assert.match(html, new RegExp(`<input[^>]* id="${id}"|<select id="${id}"`), `control ${id}`);
    assert.match(html, new RegExp(`<label[^>]*for="${id}"`), `etiqueta de ${id}`);
  }
  assert.match(html, /type="tel"[^>]*inputmode="tel"/);
  assert.match(html, /<div class="trampa" aria-hidden="true">/);
  // La CSP solo permite lo que la página usa, con el nonce de ESTA respuesta.
  const csp = r.headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  assert.ok(nonce);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  // EE-01: sin `form-action`. Chrome aplica esa directiva también a las redirecciones del envío y bloqueaba el 303 a wa.me (→ api.whatsapp.com): el
  // lead se creaba pero la persona nunca llegaba a WhatsApp. Aquí no hay un navegador, así que la prueba es que la directiva no esté.
  assert.ok(!/form-action/.test(csp), `la CSP no debe llevar form-action: ${csp}`);
  assert.match(html, /addEventListener\("pageshow"/, "EE-17: el botón se reactiva al volver con «atrás»");
  assert.ok(html.includes(`<style nonce="${nonce}">`) && html.includes(`<script nonce="${nonce}">`));
  assert.equal((html.match(/<script/g) ?? []).length, 1, "un solo script");
  // Otro nonce en cada respuesta.
  const otra = await fetch(`${api.base}${m.ruta}`);
  assert.notEqual(/'nonce-([^']+)'/.exec(otra.headers.get("content-security-policy") ?? "")?.[1], nonce);
  await otra.text();
});

test("E1 GET: sin color y con un logo peligroso la página usa el color por omisión y no lo muestra; una sola sucursal no se pregunta; slug raro o inexistente, 404 igual; sin aviso vigente, el mismo 404 y sin formulario", async () => {
  // (La base ya rechaza un color que no sea #RRGGBB; aquí el color falta y el logo es peligroso. `colorValido` se prueba aparte.)
  const m = await mundo({ color: null, logo: "javascript:alert(1)" });
  const html = await (await fetch(`${api.base}${m.ruta}`)).text();
  assert.match(html, /--marca: #1f4e79;/, "el color por omisión");
  assert.ok(!html.includes("javascript:") && !html.includes("<img"), "sin logo");
  // Una sola sucursal: va escondida, no hay lista.
  await prisma.sucursal_vertical.updateMany({ where: { vertical_id: m.org.verticalId, sucursal_id: m.org.sucursales[1]!.id }, data: { activo: false } });
  const una = await (await fetch(`${api.base}${m.ruta}`)).text();
  assert.ok(!una.includes("<select"));
  assert.match(una, new RegExp(`<input type="hidden" name="sucursal_id" value="${m.org.sucursales[0]!.id}">`));
  // 404 uniforme.
  const desconocida = await fetch(`${api.base}/l/no-existe-${randomBytes(4).toString("hex")}`);
  const rara = await fetch(`${api.base}/l/${encodeURIComponent("../../etc/passwd")}`);
  const mayus = await fetch(`${api.base}/l/${m.slug.toUpperCase()}`);
  assert.deepEqual([desconocida.status, rara.status, mayus.status], [404, 404, 404]);
  const sinNonce = (t: string): string => t.replace(/nonce="[^"]*"/g, 'nonce=""');
  const cuerpo404 = sinNonce(await desconocida.text());
  assert.equal(cuerpo404, sinNonce(await rara.text()), "el mismo cuerpo: no revela nada");
  await mayus.text();
  // Sin aviso de privacidad vigente no se recogen datos.
  const sin = await mundo({ sinDocumentos: true });
  // EE-11: igual que una página que no existe (404 y el mismo cuerpo): un 503 distinto diría qué verticales existen.
  const r503 = await fetch(`${api.base}${sin.ruta}`);
  assert.equal(r503.status, 404);
  const cuerpoSin = await r503.text();
  assert.ok(!cuerpoSin.includes("<form"));
  assert.equal(sinNonce(cuerpoSin), cuerpo404, "el mismo cuerpo que una página inexistente");
  const p503 = await enviar(api.base, sin.ruta, campos(sin));
  assert.equal(p503.status, 404);
  await p503.text();
  assert.equal(await sin.db.lead.count(), 0);
});

test("E1 slug repetido entre organizaciones: ambiguo sin `org` (404), claro con `org`", async () => {
  const a = await mundo();
  const b = await mundo();
  const comun = `comun-${randomBytes(4).toString("hex")}`;
  await prisma.vertical.update({ where: { id: a.org.verticalId }, data: { slug: comun } });
  await prisma.vertical.update({ where: { id: b.org.verticalId }, data: { slug: comun } });
  assert.equal((await fetch(`${api.base}/l/${comun}`)).status, 404);
  const ok = await fetch(`${api.base}/l/${comun}?org=${a.org.slug}`);
  assert.equal(ok.status, 200);
  await ok.text();
  const p = await enviar(api.base, `/l/${comun}?org=${b.org.slug}`, campos(b));
  assert.equal(p.status, 303);
  assert.equal(await b.db.lead.count(), 1);
  assert.equal(await a.db.lead.count(), 0, "el lead es de la organización de la URL");
});

test("E1 POST: crea el lead y el prospecto, el aviso de privacidad con su evidencia, el consentimiento y redirige a WhatsApp con el código de rastreo", async () => {
  const m = await mundo();
  const r = await enviar(api.base, `${m.ruta}?utm_source=facebook&utm_campaign=verano`, campos(m, { telefono: "+52 1 55 1234 5678", utm_source: "facebook", utm_campaign: "verano" }));
  assert.equal(r.status, 303);
  const destino = r.headers.get("location")!;
  assert.ok(destino.startsWith(`https://wa.me/${m.numero}?text=`), destino);
  const texto = decodeURIComponent(destino.split("text=")[1]!);
  const codigo = /Mi código es ([A-Z2-9]{4}-[A-Z2-9]{4})$/.exec(texto)?.[1];
  assert.ok(codigo, texto);
  assert.match(texto, /^Hola, quiero información de Vertical <Uno> & Cía\./);
  await r.text();

  const lead = await m.db.lead.findFirstOrThrow({ include: { prospectos: true } });
  assert.equal(lead.telefono, "+525512345678", "normalizarTelefono(): +521… colapsa a +52…");
  assert.deepEqual([lead.nombre_contacto, lead.vertical_interes_id, lead.sucursal_interes_id, lead.etapa_id], ["Rosa", m.org.verticalId, m.org.sucursales[0]!.id, m.org.etapaInicialId]);
  assert.deepEqual(lead.atribucion, { fuente: "landing", utm: { utm_source: "facebook", utm_campaign: "verano" } });
  assert.equal(lead.prospectos.length, 1);
  assert.deepEqual([lead.prospectos[0]!.nombre, lead.prospectos[0]!.edad_declarada, lead.prospectos[0]!.origen], ["Mateo Soto", 8, "bot"]);
  // El alta es la primera fila del historial (D7).
  const historial = await m.db.lead_etapa_historial.findMany({ where: { lead_id: lead.id } });
  assert.deepEqual(historial.map((h) => [h.etapa_anterior_id, h.motivo]), [[null, "alta"]]);
  // La evidencia del aviso de privacidad (D6): canal web, IP y agente, la huella del texto que se mostró.
  const aceptacion = await m.db.aceptacion_legal.findFirstOrThrow({ where: { prospecto_id: lead.prospectos[0]!.id } });
  assert.deepEqual([aceptacion.tipo, aceptacion.resultado, aceptacion.canal, aceptacion.version_aceptada, aceptacion.documento_id, aceptacion.capturada_por_usuario_id], ["aviso_privacidad", "aceptada", "web", 1, m.docs.avisoPrivacidad, null]);
  assert.equal(aceptacion.aceptante_nombre, "Rosa");
  assert.ok(aceptacion.ip && aceptacion.ip.length > 0);
  assert.equal(aceptacion.agente_usuario, "Prueba/1.0");
  assert.match(aceptacion.texto_hash, /^[0-9a-f]{64}$/);
  // El consentimiento por formulario, con la evidencia.
  const consentimiento = await m.db.consentimiento.findMany({ where: { telefono: "+525512345678" } });
  assert.equal(consentimiento.length, 1);
  assert.deepEqual([consentimiento[0]!.estado, consentimiento[0]!.alcance, consentimiento[0]!.origen], ["opt_in", "todo", "formulario"]);
  assert.deepEqual(consentimiento[0]!.evidencia, { aceptacion_legal_id: aceptacion.id, documento_id: m.docs.avisoPrivacidad, version: 1, lead_id: lead.id, canal: "landing" });
  // El código de rastreo del lead (E2): es el del mensaje, sin usar, de un solo uso y con vigencia.
  const codigoDb = await m.db.codigo_rastreo.findFirstOrThrow({ where: { lead_id: lead.id } });
  assert.deepEqual([codigoDb.codigo, codigoDb.tipo, codigoDb.usos, codigoDb.max_usos, codigoDb.vertical_id, codigoDb.activo], [codigo.replace("-", ""), "lead", 0, 1, m.org.verticalId, true]);
  assert.ok(codigoDb.vigente_hasta && codigoDb.vigente_hasta.getTime() > Date.now());
  // Nada de esto es un mensaje saliente ni una tarea.
  assert.equal(await m.db.mensaje.count(), 0);
});

test("E1 POST: idempotente — reenviar, doble clic y envíos simultáneos dejan UN lead, UN prospecto, UNA aceptación, UN consentimiento y el MISMO código; otro niño con el teléfono de un lead existente NO le agrega prospectos (EE-05)", async () => {
  const m = await mundo();
  const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => enviar(api.base, m.ruta, campos(m))));
  assert.deepEqual(rs.map((r) => r.status), [303, 303, 303, 303, 303, 303]);
  assert.equal(new Set(rs.map((r) => r.headers.get("location"))).size, 1, "todos mandan al mismo enlace");
  for (const r of rs) await r.text();
  assert.equal(await m.db.lead.count(), 1);
  assert.equal(await m.db.prospecto.count(), 1);
  assert.equal(await m.db.aceptacion_legal.count(), 1);
  assert.equal(await m.db.consentimiento.count(), 1);
  assert.equal(await m.db.codigo_rastreo.count(), 1);
  assert.equal(await m.db.lead_etapa_historial.count(), 1);
  // Otra vez, con el teléfono escrito de otra forma y el nombre con otras mayúsculas/espacios: el mismo lead y el mismo prospecto.
  const otra = await enviar(api.base, m.ruta, campos(m, { telefono: "+52 1 (55) 1234-5678", nombre_alumno: "  MATEO   soto " }));
  assert.equal(otra.status, 303);
  await otra.text();
  assert.equal(await m.db.lead.count(), 1);
  assert.equal(await m.db.prospecto.count(), 1);
  // EE-05: otro niño con el teléfono de un lead que YA existía: el formulario no prueba que sea su dueño, así que no se le agregan prospectos (un hermano
  // se agrega por WhatsApp o lo registra el asesor). El envío no falla ni se distingue, y la aceptación se liga al prospecto que ya tenía.
  const hermano = await enviar(api.base, m.ruta, campos(m, { nombre_alumno: "Lucía Soto", edad: "5" }));
  assert.equal(hermano.status, 303);
  await hermano.text();
  assert.equal(await m.db.lead.count(), 1);
  const prospectos = await m.db.prospecto.findMany({ orderBy: { creado_en: "asc" }, select: { nombre: true, origen: true } });
  assert.deepEqual(prospectos.map((p) => [p.nombre, p.origen]), [["Mateo Soto", "bot"]]);
  assert.equal(await m.db.aceptacion_legal.count(), 1, "la misma aceptación del mismo prospecto: no se duplica");
  assert.equal(await m.db.consentimiento.count(), 1, "el consentimiento del teléfono no se repite");
  // Quien reenvía no sobreescribe al lead: el nombre de contacto y la atribución siguen siendo los del primero.
  const l = await m.db.lead.findFirstOrThrow();
  assert.equal(l.nombre_contacto, "Rosa");
  await enviar(api.base, m.ruta, campos(m, { nombre_contacto: "Alguien más", utm_source: "otro" })).then((x) => x.text());
  assert.equal((await m.db.lead.findFirstOrThrow()).nombre_contacto, "Rosa");
  assert.deepEqual((await m.db.lead.findFirstOrThrow()).atribucion, { fuente: "landing" });
});

test("E1 POST: validaciones — cada campo con su mensaje, los valores repintados escapados, 422 y NADA se guarda", async () => {
  const m = await mundo();
  const mal = async (cambio: Record<string, string | undefined>) => {
    const r = await enviar(api.base, m.ruta, campos(m, cambio));
    const html = await r.text();
    assert.equal(r.status, 422, JSON.stringify(cambio));
    assert.match(html, /role="alert"/);
    return html;
  };
  assert.match(await mal({ nombre_alumno: "" }), /Escribe el nombre de quien tomará la clase/);
  assert.match(await mal({ edad: "0" }), /Escribe la edad con número/);
  assert.match(await mal({ edad: "abc" }), /Escribe la edad con número/);
  assert.match(await mal({ sucursal_id: "" }), /Elige una de las sucursales/);
  assert.match(await mal({ sucursal_id: "11111111-1111-4111-8111-111111111111" }), /Elige una de las sucursales/);
  assert.match(await mal({ telefono: "123" }), /Escribe un teléfono válido/);
  assert.match(await mal({ telefono: "" }), /Escribe un teléfono válido/);
  assert.match(await mal({ acepta_aviso: undefined }), /aceptes el aviso de privacidad/);
  assert.match(await mal({ version: "9" }), /El aviso de privacidad cambió/);
  assert.match(await mal({ documento_id: m.docs.reglamento }), /El aviso de privacidad cambió/, "otro documento");
  // Todos los errores a la vez y los valores buenos se conservan.
  const varios = await mal({ nombre_alumno: "Ana", edad: "x", telefono: "1" });
  assert.match(varios, /value="Ana"/);
  assert.match(varios, /Escribe la edad/);
  assert.match(varios, /Escribe un teléfono válido/);
  assert.match(varios, /<a href="#edad">/);
  assert.match(varios, /aria-invalid="true" aria-describedby="edad-error"/);
  // XSS: lo que se refleja va escapado.
  const xss = await mal({ nombre_alumno: `"><img src=x onerror=alert(1)>`, telefono: `'><script>alert(2)</script>`, nombre_contacto: `<svg onload=alert(3)>` });
  for (const peligroso of ["<img src=x", "<script>alert(2)", "<svg onload", `"><img`]) assert.ok(!xss.includes(peligroso), `sin «${peligroso}»`);
  assert.match(xss, /value="&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.match(xss, /value="&#39;&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;"/);
  assert.equal((xss.match(/<script/g) ?? []).length, 1, "solo el script propio");
  // Los parámetros de la URL también se escapan.
  const get = await (await fetch(`${api.base}${m.ruta}?utm_source=${encodeURIComponent('"><script>alert(4)</script>')}&c=${encodeURIComponent("<b>")}`)).text();
  assert.ok(!get.includes("<script>alert(4)") && !get.includes("<b>"));
  assert.match(get, /name="utm_source" value="&quot;&gt;&lt;script&gt;alert\(4\)&lt;\/script&gt;"/);
  assert.equal(await m.db.lead.count(), 0);
  assert.equal(await m.db.aceptacion_legal.count(), 0);
  assert.equal(await m.db.consentimiento.count(), 0);
});

test("E1 anti-abuso: el campo trampa, el tope de cuerpo y el límite de peticiones por IP", async () => {
  const m = await mundo();
  // Honeypot: se responde como a una persona y no se guarda nada.
  // EE-10: la respuesta es la de un envío bueno (303 a WhatsApp con un código con la forma de uno real), para que un robot no pueda distinguirla.
  const trampa = await enviar(api.base, m.ruta, campos(m, { sitio_web: "http://spam.test" }));
  assert.equal(trampa.status, 303);
  const destinoTrampa = decodeURIComponent(trampa.headers.get("location") ?? "");
  assert.ok(destinoTrampa.startsWith(`https://wa.me/${m.numero}?text=`), destinoTrampa);
  const codigoTrampa = /Mi código es ([A-Z2-9]{4}-[A-Z2-9]{4})$/.exec(destinoTrampa)?.[1];
  assert.ok(codigoTrampa, "lleva un código con la forma de uno real");
  await trampa.text();
  assert.equal(await m.db.lead.count(), 0);
  assert.equal(await m.db.codigo_rastreo.count({ where: { codigo: codigoTrampa.replace("-", "") } }), 0, "ese código no existe: nada se guardó");
  // Tope de cuerpo (16 KB): 413 sin contenido.
  const grande = await enviar(api.base, m.ruta, new URLSearchParams({ nombre_alumno: "x".repeat(20_000) }));
  assert.equal(grande.status, 413);
  assert.equal(await grande.text(), "");
  // Otro tipo de contenido: el cuerpo no se lee y los campos faltan.
  const json = await fetch(`${api.base}${m.ruta}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre_alumno: "x" }) });
  assert.equal(json.status, 422);
  await json.text();
  // Límite por IP: con 3 por minuto, la cuarta petición recibe 429 con Retry-After y una página (GET y POST comparten cupo).
  const limitado = levantarApi(prisma, {}, { limites: limitesDesdeEntorno({ LIMITE_LANDING_POR_MINUTO: "3" }), limitador: new LimitadorDeTasa() });
  await limitado.listo;
  try {
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${limitado.base}${m.ruta}`).then(async (x) => (await x.text(), x.status))), 200);
    const cuarta = await fetch(`${limitado.base}${m.ruta}`);
    assert.equal(cuarta.status, 429);
    assert.ok(Number(cuarta.headers.get("retry-after")) >= 1);
    assert.match(await cuarta.text(), /Demasiadas solicitudes/);
    const post = await enviar(limitado.base, m.ruta, campos(m));
    assert.equal(post.status, 429);
    await post.text();
    assert.equal(await m.db.lead.count(), 0, "lo limitado no llegó a la base");
  } finally {
    await limitado.cerrar();
  }
});

test("E1 sin enumeración: quien manda un teléfono que ya existe recibe la misma respuesta que con uno nuevo (salvo el código)", async () => {
  const m = await mundo();
  const nuevo = await enviar(api.base, m.ruta, campos(m, { telefono: "55 1111 2222" }));
  await nuevo.text();
  const repetido = await enviar(api.base, m.ruta, campos(m, { telefono: "55 1111 2222", nombre_alumno: "Otro Nombre" }));
  await repetido.text();
  const otroNuevo = await enviar(api.base, m.ruta, campos(m, { telefono: "55 3333 4444" }));
  await otroNuevo.text();
  const sinCodigo = (r: Response): string => decodeURIComponent(r.headers.get("location") ?? "").replace(/[A-Z2-9]{4}-[A-Z2-9]{4}/, "CODIGO");
  assert.deepEqual([nuevo.status, repetido.status, otroNuevo.status], [303, 303, 303]);
  assert.equal(sinCodigo(nuevo), sinCodigo(repetido));
  assert.equal(sinCodigo(nuevo), sinCodigo(otroNuevo));
  assert.equal(nuevo.headers.get("content-type"), repetido.headers.get("content-type"));
  assert.equal(await m.db.lead.count(), 2);
});

test("E1 baja: un teléfono dado de baja NO recupera el consentimiento por llenar el formulario (no prueba que sea suyo); el lead se crea igual", async () => {
  const m = await mundo();
  await prisma.consentimiento.create({ data: { organizacion_id: m.org.organizacionId, telefono: "+525544445555", estado: "opt_out", alcance: "todo", origen: "palabra_clave", fecha: new Date("2026-10-01T00:00:00Z") } });
  const r = await enviar(api.base, m.ruta, campos(m, { telefono: "55 4444 5555" }));
  assert.equal(r.status, 303);
  await r.text();
  assert.equal(await m.db.lead.count(), 1);
  assert.equal(await m.db.aceptacion_legal.count(), 1, "la aceptación del aviso sí queda");
  const filas = await m.db.consentimiento.findMany({ where: { telefono: "+525544445555" }, orderBy: [{ fecha: "desc" }] });
  assert.deepEqual(filas.map((f) => f.estado), ["opt_out"], "la baja sigue siendo lo último");
});

test("E1 atribución: un código de campaña (QR) se registra una vez por lead nuevo; uno inválido, vencido, agotado o de otra organización se ignora sin romper; el lead conserva su PRIMERA atribución", async () => {
  const m = await mundo();
  const otra = await mundo();
  const campana = await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: "QR sucursal", origen: "presencial", sucursal_id: m.org.sucursales[0]!.id } });
  const crear = (codigo: string, o: Record<string, unknown> = {}) => prisma.codigo_rastreo.create({ data: { organizacion_id: m.org.organizacionId, codigo, tipo: "campana", campana_id: campana.id, sucursal_id: m.org.sucursales[0]!.id, ...o } });
  const bueno = await crear("QR7M2KXA");
  await crear("VEQCDMX7", { vigente_hasta: new Date("2020-01-01T00:00:00Z") });
  await crear("AGQTADM5", { max_usos: 1, usos: 1 });
  await crear("APAGADK4", { activo: false });
  await prisma.codigo_rastreo.create({ data: { organizacion_id: otra.org.organizacionId, codigo: "AJEHNK77", tipo: "campana", campana_id: (await prisma.campana.create({ data: { organizacion_id: otra.org.organizacionId, nombre: "Ajena", origen: "otro" } })).id } });
  // La página lleva el código a un campo oculto (normalizado) para el envío.
  const pagina = await (await fetch(`${api.base}${m.ruta}?c=qr7m-2kxa&s=${m.org.sucursales[1]!.id}`)).text();
  assert.match(pagina, /name="c" value="QR7M2KXA"/);
  assert.match(pagina, new RegExp(`<option value="${m.org.sucursales[1]!.id}" selected>`), "la sucursal sugerida queda elegida");
  const r = await enviar(api.base, m.ruta, campos(m, { c: "QR7M2KXA", telefono: "55 0000 0001" }));
  await r.text();
  const lead = await m.db.lead.findFirstOrThrow({ where: { telefono: "+525500000001" } });
  assert.equal(lead.campana_id, campana.id);
  assert.deepEqual(lead.atribucion, { fuente: "landing", codigo_rastreo: "QR7M2KXA", campana_id: campana.id, sucursal_del_codigo_id: m.org.sucursales[0]!.id });
  assert.equal((await m.db.codigo_rastreo.findFirstOrThrow({ where: { id: bueno.id } })).usos, 1, "el código de campaña cuenta un uso");
  // El código del lead hereda la campaña.
  const delLead = await m.db.codigo_rastreo.findFirstOrThrow({ where: { lead_id: lead.id } });
  assert.deepEqual([delLead.campana_id, delLead.sucursal_id], [campana.id, m.org.sucursales[0]!.id]);
  // Reenviar el mismo formulario no suma otro uso ni cambia nada.
  await enviar(api.base, m.ruta, campos(m, { c: "QR7M2KXA", telefono: "55 0000 0001" })).then((x) => x.text());
  assert.equal((await m.db.codigo_rastreo.findFirstOrThrow({ where: { id: bueno.id } })).usos, 1);
  // Cada código que no sirve se ignora: el lead se crea, sin campaña y sin error.
  for (const [i, c] of ["VEQCDMX7", "AGQTADM5", "APAGADK4", "AJEHNK77", "NQEXKST7", "<script>"].entries()) {
    const x = await enviar(api.base, m.ruta, campos(m, { c, telefono: `55 0000 02${i}0` }));
    assert.equal(x.status, 303, c);
    await x.text();
  }
  const sinCampana = await m.db.lead.findMany({ where: { campana_id: null } });
  assert.equal(sinCampana.length, 6, "los seis envíos con código inservible no tienen campaña");
  assert.ok(sinCampana.every((l) => (l.atribucion as { codigo_rastreo?: string } | null)?.codigo_rastreo === undefined));
  // Ni el vencido, ni el agotado, ni el apagado, ni el de otra organización sumaron usos.
  assert.deepEqual((await m.db.codigo_rastreo.findMany({ where: { codigo: { in: ["VEQCDMX7", "AGQTADM5", "APAGADK4"] } }, orderBy: { codigo: "asc" }, select: { codigo: true, usos: true } })).map((c) => [c.codigo, c.usos]), [["AGQTADM5", 1], ["APAGADK4", 0], ["VEQCDMX7", 0]]);
  assert.equal((await otra.db.codigo_rastreo.findFirstOrThrow({ where: { codigo: "AJEHNK77" } })).usos, 0);
});

test("E1 sin número de WhatsApp (la demo usa una bandeja API): se guarda todo y se agradece; con varios canales, el de la sucursal elegida", async () => {
  const m = await mundo({ numero: null });
  const r = await enviar(api.base, m.ruta, campos(m));
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Gracias! Recibimos tus datos/);
  assert.equal(await m.db.lead.count(), 1);
  assert.equal(await m.db.codigo_rastreo.count(), 1);
  // Con un canal por sucursal: cada quien escribe al de su sucursal; el general queda para quien no tiene.
  const m2 = await mundo();
  const numeroSur = numeroUnico();
  await prisma.canal_whatsapp.create({ data: { organizacion_id: m2.org.organizacionId, vertical_id: m2.org.verticalId, sucursal_id: m2.org.sucursales[1]!.id, nombre_publico: "Sur", numero_whatsapp: `whatsapp:+${numeroSur}` } });
  const sur = await enviar(api.base, m2.ruta, campos(m2, { sucursal_id: m2.org.sucursales[1]!.id, telefono: "55 0000 0021" }));
  const norte = await enviar(api.base, m2.ruta, campos(m2, { sucursal_id: m2.org.sucursales[0]!.id, telefono: "55 0000 0022" }));
  assert.ok((sur.headers.get("location") ?? "").startsWith(`https://wa.me/${numeroSur}?`));
  assert.ok((norte.headers.get("location") ?? "").startsWith(`https://wa.me/${m2.numero}?`));
  await sur.text();
  await norte.text();
});

test("E1 → bot: quien llenó la landing y luego escribe por WhatsApp NO vuelve a dar nombre ni edad; el bot sigue con su prospecto (cero recaptura)", async () => {
  const m = await mundo();
  const r = await enviar(api.base, m.ruta, campos(m, { telefono: "55 7777 8888", nombre_alumno: "Valeria Ríos", edad: "9", sucursal_id: m.org.sucursales[1]!.id }));
  await r.text();
  const transporte = new TransporteFalso();
  const idMensaje = `m-${randomBytes(4).toString("hex")}`;
  const evento: EventoEntrante = { chatwootAccountId: m.org.chatwootAccountId, chatwootInboxId: m.org.chatwootInboxId, chatwootConversacionId: 987_654, idMensaje, contenido: "Hola, quiero información. Mi código es ABCD-EFG2", estadoConversacion: "pending", contacto: { nombre: "Rosa", telefono: "+52 1 55 7777 8888" }, creadoEn: null, llave: { proveedor: "chatwoot", id: idMensaje }, numeroReceptor: null, crudo: null };
  const resultado = await procesarEntrante({ prisma, mensajeria: new MessagingProvider({ transporte }) }, evento);
  assert.equal(resultado.resultado, "procesado");
  const mensajes = transporte.envios.filter((e) => e.tipo === "mensaje").map((e) => e.texto ?? "");
  assert.equal(mensajes.length, 2);
  assert.match(mensajes[0]!, /Ya tenemos los datos que nos dejaste para Valeria Ríos/);
  assert.match(mensajes[1]!, /Ya tengo los datos de Valeria Ríos para la sucursal Sur/);
  for (const t of mensajes) assert.ok(!/Cómo se llama|Qué edad|Qué sucursal/i.test(t), `no pregunta otra vez: ${t}`);
  // El mismo lead y el mismo prospecto (no se duplicó nada); la conversación pasó al asesor con todo capturado.
  assert.equal(await m.db.lead.count(), 1);
  assert.equal(await m.db.prospecto.count(), 1);
  assert.equal((await m.db.conversacion.findFirstOrThrow()).paso_captacion, "completo");
  // Las notas internas para el asesor llevan los datos de la landing.
  const nota = transporte.envios.find((e) => e.tipo === "nota_interna");
  assert.match(nota?.texto ?? "", /Valeria Ríos/);
});

test("E1 concurrencia FORZADA: ocho envíos del mismo teléfono llegan al mismo tiempo a la sección crítica y dejan UN lead, UN prospecto y UN código (el candado por teléfono)", async () => {
  const m = await mundo();
  const barrera = new Barrera(8);
  // La barrera va justo antes de la transacción: los ocho piden la misma sección crítica a la vez (sin ella, un Promise.all puede no intercalarse).
  const raiz = conGanchos(prisma, { modelo: "etapa_pipeline", operacion: "findFirst", despues: async () => barrera.esperar(3000) });
  const forzada = levantarApi(prisma, {}, { landing: { prisma: raiz } });
  await forzada.listo;
  try {
    const rs = await Promise.all(Array.from({ length: 8 }, () => enviar(forzada.base, m.ruta, campos(m, { telefono: "55 9999 0001" }))));
    for (const r of rs) await r.text();
    assert.ok(barrera.completa, "los ocho llegaron juntos a la barrera");
    assert.deepEqual(rs.map((r) => r.status), Array(8).fill(303));
    assert.equal(new Set(rs.map((r) => r.headers.get("location"))).size, 1, "el mismo enlace, con el mismo código");
    assert.equal(await m.db.lead.count(), 1);
    assert.equal(await m.db.prospecto.count(), 1);
    assert.equal(await m.db.codigo_rastreo.count(), 1);
    assert.equal(await m.db.aceptacion_legal.count(), 1);
    assert.equal(await m.db.consentimiento.count(), 1);
    assert.equal(await m.db.lead_etapa_historial.count(), 1);
  } finally {
    await forzada.cerrar();
  }
});

/** Una campaña con un código de campaña (por omisión sin tope). */
async function campanaConCodigo(m: Mundo, campana: Record<string, unknown>, codigo: string, extra: Record<string, unknown> = {}) {
  const c = await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: `Campaña ${codigo}`, origen: "presencial", ...campana } });
  await prisma.codigo_rastreo.create({ data: { organizacion_id: m.org.organizacionId, codigo, tipo: "campana", campana_id: c.id, ...extra } });
  return c;
}

test("EE-02 concurrencia FORZADA: ocho leads distintos usan a la vez un código de UN solo uso — se atribuye UNO y el tope no se rebasa", async () => {
  const m = await mundo();
  const c = await campanaConCodigo(m, {}, "QR7M2KXA", { max_usos: 1 });
  const barrera = new Barrera(8);
  // La barrera va entre la lectura del código y su consumo: los ocho leen «queda un uso» y luego compiten de verdad.
  const raiz = conGanchos(prisma, { modelo: "codigo_rastreo", operacion: "findFirst", cuando: (a) => (a["where"] as Record<string, unknown> | undefined)?.["AND"] !== undefined, despues: async () => barrera.esperar(3000) });
  const forzada = levantarApi(prisma, {}, { landing: { prisma: raiz } });
  await forzada.listo;
  try {
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => enviar(forzada.base, m.ruta, campos(m, { telefono: `55 7000 000${i}`, c: "QR7M2KXA" }))));
    for (const r of rs) await r.text();
    assert.ok(barrera.completa, "los ocho leyeron el código a la vez");
    assert.deepEqual(rs.map((r) => r.status), Array(8).fill(303));
    assert.equal(await m.db.lead.count(), 8);
    assert.equal(await m.db.lead.count({ where: { campana_id: c.id } }), 1, "solo UNO queda atribuido a la campaña");
    assert.equal((await m.db.codigo_rastreo.findFirstOrThrow({ where: { codigo: "QR7M2KXA" } })).usos, 1);
  } finally {
    await forzada.cerrar();
  }
});

test("EE-03: una campaña apagada, dada de baja, vencida o que aún no empieza apaga sus códigos (landing); el último día vale completo", async () => {
  const m = await mundo();
  const hoy = fechaLocal(new Date(), "America/Mexico_City");
  const mas = (dias: number): Date => new Date(Date.parse(`${hoy}T00:00:00Z`) + dias * 86_400_000);
  const casos: [string, Record<string, unknown>, boolean][] = [
    ["APAGADK4", { activo: false }, false],
    ["BAJACQK4", { eliminado_en: new Date() }, false],
    ["VENCDEK4", { fecha_fin: mas(-1) }, false],
    ["FUTURAK4", { fecha_inicio: mas(1) }, false],
    ["UTMDAAK4", { fecha_inicio: mas(-5), fecha_fin: mas(0) }, true],
    ["PRMRDAK4", { fecha_inicio: mas(0), fecha_fin: mas(3) }, true],
    ["SNFCHAK4", {}, true],
  ];
  for (const [i, [codigo, campana, vale]] of casos.entries()) {
    const c = await campanaConCodigo(m, campana, codigo);
    const r = await enviar(api.base, m.ruta, campos(m, { telefono: `55 7100 000${i}`, c: codigo }));
    assert.equal(r.status, 303, codigo);
    await r.text();
    const atribuidos = await m.db.lead.count({ where: { campana_id: c.id } });
    assert.equal(atribuidos, vale ? 1 : 0, `${codigo}: ${vale ? "atribuye" : "se ignora"}`);
    assert.equal((await m.db.codigo_rastreo.findFirstOrThrow({ where: { codigo } })).usos, vale ? 1 : 0, `${codigo}: usos`);
  }
});

test("EE-09 (L16): un código de campaña de OTRA vertical de la organización no atribuye en la landing de esta (el lead se crea sin atribución y el código no cuenta)", async () => {
  const m = await mundo();
  const otraVertical = await prisma.vertical.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Otra", slug: `o-${randomBytes(4).toString("hex")}` } });
  const c = await campanaConCodigo(m, { vertical_id: otraVertical.id }, "XTRAVQK4", { vertical_id: otraVertical.id });
  const r = await enviar(api.base, m.ruta, campos(m, { c: "XTRAVQK4" }));
  assert.equal(r.status, 303);
  await r.text();
  assert.equal(await m.db.lead.count({ where: { campana_id: c.id } }), 0);
  assert.equal((await m.db.lead.findFirstOrThrow()).atribucion !== null && JSON.stringify((await m.db.lead.findFirstOrThrow()).atribucion).includes("XTRAVQK4"), false);
  assert.equal((await m.db.codigo_rastreo.findFirstOrThrow({ where: { codigo: "XTRAVQK4" } })).usos, 0);
});

test("EE-04: el canal de WhatsApp sale de la sucursal que ELIGIÓ quien llena el formulario, exista o no ya un lead con ese teléfono (sin oráculo)", async () => {
  const m = await mundo();
  const numeroSur = numeroUnico();
  await prisma.canal_whatsapp.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: m.org.verticalId, sucursal_id: m.org.sucursales[1]!.id, nombre_publico: "Sur", numero_whatsapp: `whatsapp:+${numeroSur}` } });
  await prisma.canal_whatsapp.update({ where: { id: m.org.canalId }, data: { sucursal_id: m.org.sucursales[0]!.id } });
  const norte = m.org.sucursales[0]!.id;
  const sur = m.org.sucursales[1]!.id;
  const destino = async (telefono: string, sucursal: string): Promise<string> => {
    const r = await enviar(api.base, m.ruta, campos(m, { telefono, sucursal_id: sucursal }));
    assert.equal(r.status, 303);
    await r.text();
    return decodeURIComponent(r.headers.get("location") ?? "").replace(/[A-Z2-9]{4}-[A-Z2-9]{4}/, "CODIGO");
  };
  // Un lead de Norte ya existe con ese teléfono; alguien manda el mismo teléfono eligiendo Sur: la respuesta es la de un teléfono NUEVO que elige Sur.
  await destino("55 8000 0001", norte);
  const existenteEligiendoSur = await destino("55 8000 0001", sur);
  const nuevoEligiendoSur = await destino("55 8000 0002", sur);
  assert.ok(nuevoEligiendoSur.startsWith(`https://wa.me/${numeroSur}?`), "el nuevo que elige Sur va al canal de Sur");
  assert.equal(existenteEligiendoSur, nuevoEligiendoSur, "el existente que elige Sur recibe lo mismo: no se averigua si ya era lead");
});

test("EE-05: quien manda el teléfono de un lead que ya existe no le agrega prospectos ni cambia nada de él (nombre, atribución, prospecto)", async () => {
  const m = await mundo();
  const primero = await enviar(api.base, m.ruta, campos(m, { telefono: "55 8100 0001" }));
  await primero.text();
  const lead0 = await m.db.lead.findFirstOrThrow({ include: { prospectos: true } });
  const intruso = await enviar(api.base, m.ruta, campos(m, { telefono: "55 8100 0001", nombre_alumno: "Otro Niño", edad: "5", nombre_contacto: "Intruso", utm_source: "otra" }));
  assert.equal(intruso.status, 303);
  await intruso.text();
  const lead1 = await m.db.lead.findFirstOrThrow({ include: { prospectos: true } });
  assert.deepEqual(lead1.prospectos.map((p) => p.id), lead0.prospectos.map((p) => p.id), "ni un prospecto más");
  assert.deepEqual([lead1.nombre_contacto, lead1.atribucion], [lead0.nombre_contacto, lead0.atribucion]);
  // Un lead sin ningún prospecto (lo dio de alta una persona) sí recibe el del formulario: no hay nada que proteger y es lo que se pidió.
  const sinProspectos = await prisma.lead.create({ data: { organizacion_id: m.org.organizacionId, vertical_interes_id: m.org.verticalId, etapa_id: m.org.etapaInicialId, telefono: "+525581000002", nombre_contacto: "Alta manual" } });
  const r = await enviar(api.base, m.ruta, campos(m, { telefono: "55 8100 0002", nombre_alumno: "Niña Nueva", edad: "6" }));
  assert.equal(r.status, 303);
  await r.text();
  assert.deepEqual((await m.db.prospecto.findMany({ where: { lead_id: sinProspectos.id } })).map((p) => p.nombre), ["Niña Nueva"]);
});

test("EE-08: un envío que no viene de la propia página (otro sitio) se rechaza con 403 y sin tocar la base; sin cabeceras de navegador, mismo host y Origin: null pasan", async () => {
  const m = await mundo();
  const cuerpo = (tel: string) => campos(m, { telefono: tel });
  const rechazados: [string, Record<string, string>][] = [
    ["origen de otro sitio", { origin: "https://evil.example" }],
    ["un subdominio que parece local", { origin: "http://127.0.0.1.evil.example:1" }],
    ["Sec-Fetch-Site cross-site", { "sec-fetch-site": "cross-site", origin: "null" }],
    ["origen ilegible", { origin: "no es una url" }],
  ];
  for (const [i, [nombre, cabeceras]] of rechazados.entries()) {
    const r = await enviar(api.base, m.ruta, cuerpo(`55 8200 000${i}`), cabeceras);
    assert.equal(r.status, 403, nombre);
    assert.match(await r.text(), /No se pudo enviar/);
  }
  assert.equal(await m.db.lead.count(), 0, "lo rechazado no llegó a la base");
  const aceptados: [string, Record<string, string>][] = [
    ["sin cabeceras de navegador (una prueba, curl)", {}],
    ["el propio host", { origin: api.base, "sec-fetch-site": "same-origin" }],
    ["Origin: null con la política no-referrer (Firefox)", { origin: "null", "sec-fetch-site": "same-origin" }],
  ];
  for (const [i, [nombre, cabeceras]] of aceptados.entries()) {
    const r = await enviar(api.base, m.ruta, cuerpo(`55 8300 000${i}`), cabeceras);
    assert.equal(r.status, 303, nombre);
    await r.text();
  }
  assert.equal(await m.db.lead.count(), 3);
  // El GET no se restringe (se abre desde un anuncio, un QR o un enlace de otro sitio).
  const get = await fetch(`${api.base}${m.ruta}`, { headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(get.status, 200);
  await get.text();
});

test("EE-08: con orígenes públicos configurados, solo esos valen (ni el propio host)", async () => {
  const m = await mundo();
  const fijo = levantarApi(prisma, {}, { landing: { prisma, origenesPermitidos: ["https://app.escuela.example"], origenesLocales: false } });
  await fijo.listo;
  try {
    const propio = await enviar(fijo.base, m.ruta, campos(m, { telefono: "55 8400 0001" }), { origin: fijo.base });
    assert.equal(propio.status, 403, "ni el propio host si no es el configurado");
    await propio.text();
    // V2: en producción tampoco valen localhost ni 127.0.0.1, con ningún puerto.
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:1", "http://localhost.evil.example"]) {
      const local = await enviar(fijo.base, m.ruta, campos(m, { telefono: "55 8400 0001" }), { origin });
      assert.equal(local.status, 403, origin);
      await local.text();
    }
    const publico = await enviar(fijo.base, m.ruta, campos(m, { telefono: "55 8400 0001" }), { origin: "https://app.escuela.example" });
    assert.equal(publico.status, 303);
    await publico.text();
    assert.equal(await m.db.lead.count(), 1);
  } finally {
    await fijo.cerrar();
  }
});

test("V2 (decisión 7): en local la landing acepta localhost y 127.0.0.1 con cualquier puerto aunque ORIGEN_PUBLICO sea otro; lo ajeno y los subdominios engañosos no", async () => {
  const m = await mundo();
  const local = levantarApi(prisma, {}, { landing: { prisma, origenesPermitidos: ["https://app.escuela.example"], origenesLocales: true } });
  await local.listo;
  try {
    const casos: [string, number][] = [
      ["http://localhost:3000", 303],
      ["http://127.0.0.1:5173", 303],
      ["https://app.escuela.example", 303],
      ["https://malo.example", 403],
      ["http://localhost.evil.example", 403],
      ["http://localhost@evil.example", 403],
    ];
    for (const [i, [origin, estado]] of casos.entries()) {
      const r = await enviar(local.base, m.ruta, campos(m, { telefono: `55 8500 000${i}` }), { origin });
      assert.equal(r.status, estado, origin);
      await r.text();
    }
    assert.equal(await m.db.lead.count(), 3, "solo los tres aceptados llegaron a la base");
  } finally {
    await local.cerrar();
  }
});

test("EE-09 (L05): el script de la página solo corre con el nonce de la respuesta: la CSP no permite 'unsafe-inline' ni 'unsafe-eval' ni scripts de otros orígenes", async () => {
  const m = await mundo();
  const r = await fetch(`${api.base}${m.ruta}`);
  await r.text();
  const csp = r.headers.get("content-security-policy") ?? "";
  const script = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
  assert.match(script, /^'nonce-[A-Za-z0-9+/=]+'$/, `script-src solo con nonce: ${script}`);
  const estilo = /style-src ([^;]+)/.exec(csp)?.[1] ?? "";
  assert.match(estilo, /^'nonce-[A-Za-z0-9+/=]+'$/, `style-src solo con nonce: ${estilo}`);
  assert.ok(!/unsafe-|\*/.test(csp.replace(/'nonce-[^']+'/g, "")), csp);
});

test("EE-09 (X06): la landing de una vertical inactiva (o de una organización dada de baja) no existe: 404", async () => {
  const m = await mundo();
  assert.equal((await fetch(`${api.base}${m.ruta}`).then(async (x) => (await x.text(), x.status))), 200);
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { activo: false } });
  const inactiva = await fetch(`${api.base}${m.ruta}`);
  assert.equal(inactiva.status, 404);
  await inactiva.text();
  const envio = await enviar(api.base, m.ruta, campos(m));
  assert.equal(envio.status, 404);
  await envio.text();
  assert.equal(await m.db.lead.count(), 0);
  await prisma.vertical.update({ where: { id: m.org.verticalId }, data: { activo: true } });
  await prisma.organizacion.update({ where: { id: m.org.organizacionId }, data: { eliminado_en: new Date() } });
  const baja = await fetch(`${api.base}${m.ruta}`);
  assert.equal(baja.status, 404);
  await baja.text();
});

test("EE-09 (X14): el lead de la landing nace en la primera etapa ABIERTA, aunque la de menor orden sea de cierre solo por su tipo (inscrito, perdido)", async () => {
  const m = await mundo();
  // La etapa de menor orden pasa a ser «perdido» por su tipo (sin la bandera) y la siguiente es la abierta.
  await prisma.etapa_pipeline.update({ where: { id: m.org.etapaInicialId }, data: { tipo_sistema: "perdido", orden: 1 } });
  const abierta = await prisma.etapa_pipeline.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Abierta", orden: 2 } });
  const r = await enviar(api.base, m.ruta, campos(m, { telefono: "55 8500 0001" }));
  assert.equal(r.status, 303);
  await r.text();
  assert.equal((await m.db.lead.findFirstOrThrow()).etapa_id, abierta.id);
});
