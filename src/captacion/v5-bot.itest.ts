// V5: lo que la escuela ajusta del asistente de WhatsApp sin tocar SQL — los textos de cada mensaje, los minutos antes de avisar de un lead a medias y cuántas respuestas sin entender aguanta el bot.
// Postgres real, la app real y el bot real (`procesarEntrante`) con el transporte falso. Se prueba: la API (solo administrador, validación en español, registro, sin fuga entre organizaciones, carrera),
// el EFECTO real en el siguiente mensaje que llega (sin reiniciar), que el bot sigue siendo determinista y que un texto de un módulo apagado se puede editar sin que el bot lo diga.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { procesarEntrante } from "./entrante.ts";
import { barrerTiemposDeEspera } from "./espera.ts";
import { textos } from "./maquina.ts";
import { CATALOGO_DE_TEXTOS, CLAVES_DE_TEXTO } from "./textos.ts";
import { leerTextosPersonalizados } from "./textos-bot.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let adminAjeno: ClienteApi;
const otros = {} as Record<"asesor" | "recepcion" | "maestro", ClienteApi>;
let siguiente = randomInt(1_000_000, 2_000_000_000);

interface Err { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Texto { clave: string; cuando: string; modulo: string; modulo_encendido: boolean; huecos: { nombre: string; descripcion: string }[]; obligatorios: string[]; defecto: string; texto: string; personalizado: boolean }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "V5 textos");
  ajena = await sembrarOrganizacion(prisma, "V5 textos ajena");
  const entrar = async (o: OrganizacionDePrueba, rol: "administrador" | "asesor" | "maestro" | "recepcion") => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales: rol === "asesor" || rol === "recepcion" ? [o.sucursales[0]!.id] : [] });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar(org, "administrador");
  adminAjeno = await entrar(ajena, "administrador");
  for (const rol of ["asesor", "recepcion", "maestro"] as const) otros[rol] = await entrar(org, rol);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const detalle = (r: { cuerpo: unknown }): string => ((r.cuerpo as Err).error?.detalles ?? []).map((d) => d.mensaje).join(" | ");
const lista = async (c: ClienteApi = admin) => (await c.get<{ maximo: number; datos: Texto[] }>("/api/textos-bot")).cuerpo;
const uno = async (clave: string, c: ClienteApi = admin) => (await lista(c)).datos.find((t) => t.clave === clave)!;

// ── La API de textos ───────────────────────────────────────────────────────────────────────────────

test("GET: todos los mensajes del catálogo, con cuándo se dicen, sus huecos, el texto de siempre y si están personalizados", async () => {
  const l = await lista();
  assert.equal(l.maximo, 600);
  assert.deepEqual(l.datos.map((t) => t.clave), [...CLAVES_DE_TEXTO]);
  for (const t of l.datos) {
    assert.equal(t.personalizado, false, t.clave);
    assert.equal(t.texto, t.defecto, t.clave);
    assert.equal(t.defecto, CATALOGO_DE_TEXTOS[t.clave as keyof typeof CATALOGO_DE_TEXTOS].defecto);
    assert.ok(t.cuando.length > 10, t.clave);
  }
  const edad = l.datos.find((t) => t.clave === "pregunta_edad")!;
  assert.deepEqual(edad.huecos.map((h) => h.nombre), ["nombre"]);
  assert.ok(edad.huecos[0]!.descripcion.length > 5);
  assert.deepEqual(l.datos.find((t) => t.clave === "pregunta_sucursal")!.obligatorios, ["lista"]);
});

test("solo el administrador ve y cambia los textos; sin sesión, 401; una clave que no existe, 404", async () => {
  for (const rol of ["asesor", "recepcion", "maestro"] as const) {
    assert.equal((await otros[rol].get("/api/textos-bot")).estado, 403, rol);
    assert.equal((await otros[rol].put("/api/textos-bot/saludo", { texto: "Hola {disciplina}" })).estado, 403, rol);
    assert.equal((await otros[rol].delete("/api/textos-bot/saludo")).estado, 403, rol);
  }
  assert.equal((await api.cliente().get("/api/textos-bot")).estado, 401);
  assert.equal((await api.cliente().put("/api/textos-bot/saludo", { texto: "x" })).estado, 401);
  assert.equal((await admin.put("/api/textos-bot/no_existe", { texto: "Hola" })).estado, 404);
  assert.equal((await admin.delete("/api/textos-bot/no_existe")).estado, 404);
  assert.equal(await prisma.texto_bot.count({ where: { organizacion_id: org.organizacionId } }), 0, "los rechazos no escribieron nada");
});

test("validación: un hueco que no existe, uno obligatorio que falta, llaves sueltas, enlaces, muy largo o vacío → 400 con un mensaje que dice qué hacer", async () => {
  const casos: [string, string, RegExp][] = [
    ["pregunta_edad", "¿Cuántos años tiene {apodo}?", /«\{apodo\}» no se puede usar en este mensaje\. Puedes usar: \{nombre\}/],
    ["pregunta_edad", "¿Cuántos años tiene {nombre?", /llave/],
    ["pregunta_sucursal", "¿Cuál sede prefieres?", /Falta \{lista\}.*qué responder/],
    ["pidio_asesor", "Mira https://escuela.mx/horarios", /enlaces/],
    ["pidio_asesor", "Entra a www.escuela.com", /enlaces/],
    ["pidio_asesor", "Escríbenos a wa.me/5215512345678", /enlaces/],
    ["pidio_asesor", "a".repeat(601), /muy largo \(601 caracteres\)\. Acórtalo a 600/],
    ["pidio_asesor", "   ", /Escribe el mensaje/],
    ["pregunta_nombre", "¿Cómo te llamas, {nombre}?", /aquí no hay huecos que llenar/],
    ["saludo", "Hola {disciplina}\u0000", /carácter no permitido/],
    ["saludo", "Hola {disciplina}\u0007", /caracteres que no se pueden mandar/],
  ];
  for (const [clave, texto, esperado] of casos) {
    const r = await admin.put<Err>(`/api/textos-bot/${clave}`, { texto });
    assert.equal(r.estado, 400, `${clave}: ${texto.slice(0, 30)}`);
    assert.match(detalle(r), esperado, clave);
    assert.equal(r.cuerpo.error.detalles?.[0]?.campo, "texto");
  }
  assert.equal((await admin.put("/api/textos-bot/saludo", { texto: 5 })).estado, 400);
  assert.equal((await admin.put("/api/textos-bot/saludo", {})).estado, 400);
  assert.equal((await admin.put("/api/textos-bot/saludo", { texto: "Hola", otro: 1 })).estado, 400, "campos desconocidos");
  assert.equal(await prisma.texto_bot.count({ where: { organizacion_id: org.organizacionId } }), 0, "ningún rechazo escribió nada");
});

test("PUT personaliza, queda en el registro de cambios, escribir el texto de siempre equivale a restablecer y DELETE restablece (baja lógica)", async () => {
  const r = await admin.put<Texto>("/api/textos-bot/pidio_asesor", { texto: "  Con gusto, ya te paso con una persona del equipo.  " });
  assert.equal(r.estado, 200);
  assert.deepEqual([r.cuerpo.personalizado, r.cuerpo.texto], [true, "Con gusto, ya te paso con una persona del equipo."]);
  assert.equal((await uno("pidio_asesor")).personalizado, true);
  const crear = await prisma.registro_cambio.findFirst({ where: { organizacion_id: org.organizacionId, entidad_tipo: "texto_bot", accion: "crear" } });
  assert.deepEqual(crear?.despues, { clave: "pidio_asesor", texto: "Con gusto, ya te paso con una persona del equipo." });
  // Cambiar de nuevo: actualiza la MISMA fila (una sola viva por clave).
  assert.equal((await admin.put("/api/textos-bot/pidio_asesor", { texto: "Ya te paso con una persona." })).estado, 200);
  assert.equal(await prisma.texto_bot.count({ where: { organizacion_id: org.organizacionId, clave: "pidio_asesor", eliminado_en: null } }), 1);
  const act = await prisma.registro_cambio.findFirst({ where: { organizacion_id: org.organizacionId, entidad_tipo: "texto_bot", accion: "actualizar" } });
  assert.deepEqual((act?.antes as Record<string, unknown>)["texto"], "Con gusto, ya te paso con una persona del equipo.");
  // Repetir lo mismo no ensucia el registro.
  const antes = await prisma.registro_cambio.count({ where: { organizacion_id: org.organizacionId, entidad_tipo: "texto_bot" } });
  assert.equal((await admin.put("/api/textos-bot/pidio_asesor", { texto: "Ya te paso con una persona." })).estado, 200);
  assert.equal(await prisma.registro_cambio.count({ where: { organizacion_id: org.organizacionId, entidad_tipo: "texto_bot" } }), antes);
  // Escribir exactamente el texto de siempre = volver a él.
  const defecto = CATALOGO_DE_TEXTOS.pidio_asesor.defecto;
  const igual = await admin.put<Texto>("/api/textos-bot/pidio_asesor", { texto: defecto });
  assert.deepEqual([igual.estado, igual.cuerpo.personalizado], [200, false]);
  assert.equal(await prisma.texto_bot.count({ where: { organizacion_id: org.organizacionId, clave: "pidio_asesor", eliminado_en: null } }), 0);
  assert.equal(await prisma.texto_bot.count({ where: { organizacion_id: org.organizacionId, clave: "pidio_asesor", eliminado_en: { not: null } } }), 1, "baja lógica, no borrado (invariante 3)");
  // DELETE: restablecer; repetirlo no es un error.
  await admin.put("/api/textos-bot/sin_entender", { texto: "Mejor te atiende una persona." });
  assert.equal((await admin.delete("/api/textos-bot/sin_entender")).estado, 204);
  assert.equal((await admin.delete("/api/textos-bot/sin_entender")).estado, 204);
  assert.equal((await uno("sin_entender")).personalizado, false);
});

test("no hay fuga entre organizaciones: el texto de una escuela no lo ve, no lo usa ni lo borra otra", async () => {
  await admin.put("/api/textos-bot/saludo", { texto: "Bienvenido a {disciplina}." });
  assert.equal((await uno("saludo")).personalizado, true);
  assert.equal((await uno("saludo", adminAjeno)).personalizado, false);
  assert.deepEqual(await leerTextosPersonalizados(conAlcance(prisma, ajena.organizacionId)), {});
  assert.deepEqual(await leerTextosPersonalizados(conAlcance(prisma, org.organizacionId)), { saludo: "Bienvenido a {disciplina}." });
  assert.equal((await adminAjeno.delete("/api/textos-bot/saludo")).estado, 204, "restablece lo SUYO (no existe), sin tocar lo mío");
  assert.equal((await uno("saludo")).personalizado, true);
  assert.equal((await adminAjeno.put("/api/textos-bot/saludo", { texto: "Otro saludo para {disciplina}." })).estado, 200);
  assert.equal((await uno("saludo")).texto, "Bienvenido a {disciplina}.", "el mío no cambió");
  await admin.delete("/api/textos-bot/saludo");
  await adminAjeno.delete("/api/textos-bot/saludo");
});

test("carrera: dos administradores personalizan el mismo mensaje a la vez y queda UNA fila viva (nadie recibe 500)", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 carrera");
  const u1 = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const u2 = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c1 = api.cliente();
  const c2 = api.cliente();
  await c1.login(o.slug, u1.correo, u1.contrasena);
  await c2.login(o.slug, u2.correo, u2.contrasena);
  for (let i = 0; i < 3; i++) {
    const clave = ["saludo", "pidio_asesor", "sin_entender"][i]!;
    const rs = await Promise.all([c1.put(`/api/textos-bot/${clave}`, { texto: `Uno ${i}` }), c2.put(`/api/textos-bot/${clave}`, { texto: `Dos ${i}` })]);
    assert.deepEqual(rs.map((r) => r.estado), [200, 200], clave);
    assert.equal(await prisma.texto_bot.count({ where: { organizacion_id: o.organizacionId, clave, eliminado_en: null } }), 1, clave);
  }
});

test("la base repite lo esencial: una clave con forma de clave, un texto no vacío y a lo más una fila viva por mensaje", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 base");
  await assert.rejects(prisma.texto_bot.create({ data: { organizacion_id: o.organizacionId, clave: "Con Mayúsculas", texto: "x" } }), /texto_bot_clave_chk/);
  await assert.rejects(prisma.texto_bot.create({ data: { organizacion_id: o.organizacionId, clave: "saludo", texto: "   " } }), /texto_bot_texto_chk/);
  await prisma.texto_bot.create({ data: { organizacion_id: o.organizacionId, clave: "saludo", texto: "Hola" } });
  await assert.rejects(prisma.texto_bot.create({ data: { organizacion_id: o.organizacionId, clave: "saludo", texto: "Otra vez" } }), /texto_bot_clave_viva_key|Unique/);
  // El scope (invariante 1) rechaza el borrado físico (invariante 3).
  await assert.rejects(() => conAlcance(prisma, o.organizacionId).texto_bot.deleteMany({}), /Borrado físico prohibido/);
});

// ── Efecto real en el bot ──────────────────────────────────────────────────────────────────────────

const MIN = 60 * 1000;
const HORA = 60 * MIN;
/** 8-oct-2026 10:00 hora de Ciudad de México (UTC-6). */
const T0 = new Date("2026-10-08T16:00:00Z");
const despues = (ms: number): Date => new Date(T0.getTime() + ms);

/** Una conversación nueva por WhatsApp con el bot real. */
async function conversacion(o: OrganizacionDePrueba) {
  const db = conAlcance(prisma, o.organizacionId);
  const transporte = new TransporteFalso();
  const chatwootConversacion = randomInt(1, 2_000_000_000);
  const telefono = `+5255${randomInt(10_000_000, 99_999_999)}`;
  const evento = (contenido: string): EventoEntrante => {
    const id = String(siguiente++);
    return { chatwootAccountId: o.chatwootAccountId, chatwootInboxId: o.chatwootInboxId, chatwootConversacionId: chatwootConversacion, idMensaje: id, contenido, estadoConversacion: "pending", contacto: { nombre: "Mamá", telefono }, creadoEn: null, llave: { proveedor: "chatwoot", id }, numeroReceptor: null, crudo: null };
  };
  const proveedor = (ahora: Date) => new MessagingProvider({ transporte, reloj: () => ahora });
  const escribe = (contenido: string, cuando: Date) => procesarEntrante({ prisma, mensajeria: proveedor(cuando), reloj: () => cuando }, evento(contenido));
  const conv = () => db.conversacion.findFirstOrThrow({ where: { bandeja_chatwoot_id: o.bandejaId, chatwoot_conversacion_id: chatwootConversacion }, include: { lead: true } });
  const dichos = () => transporte.envios.filter((e) => e.tipo === "mensaje").map((e) => e.texto);
  const barrer = (cuando: Date) => barrerTiemposDeEspera({ prisma, mensajeria: proveedor(cuando), organizacionId: o.organizacionId, reloj: () => cuando });
  const notas = () => transporte.envios.filter((e) => e.tipo === "nota_interna" && /dejó de contestar/.test(e.texto ?? ""));
  return { db, transporte, escribe, conv, dichos, barrer, notas };
}

test("EFECTO textos: con el saludo personalizado, el SIGUIENTE mensaje que llega ya lo dice (sin reiniciar); restablecido, vuelve el de siempre; el resto de los mensajes no cambia", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 efecto textos");
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  await c.login(o.slug, u.correo, u.contrasena);

  const antes = await conversacion(o);
  await antes.escribe("Hola", T0);
  assert.deepEqual(antes.dichos(), [textos.saludo("Vertical Prueba"), textos.preguntaNombre], "sin personalizar: lo de siempre");

  assert.equal((await c.put("/api/textos-bot/saludo", { texto: "¡Bienvenida a {disciplina}! Son tres preguntas." })).estado, 200);
  assert.equal((await c.put("/api/textos-bot/pregunta_edad", { texto: "¿Cuántos años cumplió {nombre}?" })).estado, 200);
  const con = await conversacion(o);
  await con.escribe("Hola", T0);
  assert.deepEqual(con.dichos(), ["¡Bienvenida a Vertical Prueba! Son tres preguntas.", textos.preguntaNombre], "el saludo cambió, la primera pregunta no");
  await con.escribe("Ana", T0);
  assert.equal(con.dichos().at(-1), "¿Cuántos años cumplió Ana?");
  // La conversación ya empezada con el texto anterior sigue su camino, sin romperse.
  await antes.escribe("Luis", T0);
  assert.equal(antes.dichos().at(-1), "¿Cuántos años cumplió Luis?", "desde el siguiente mensaje, también en las conversaciones que ya estaban a medias");

  // Determinismo: el paso y el pase al asesor son los mismos con o sin texto propio.
  assert.equal((await con.conv()).paso_captacion, "edad");
  await con.escribe("8", T0);
  await con.escribe("2", T0);
  const fin = await con.conv();
  assert.deepEqual([fin.paso_captacion, fin.estado, fin.motivo_pase_asesor], ["completo", "en_atencion_humana", "captura_completa"]);
  assert.match(con.dichos().at(-1)!, /Ya tengo los datos de Ana para la sucursal Sur/, "el cierre no se personalizó: el de siempre");

  // Restablecer vuelve al de siempre en el siguiente mensaje.
  assert.equal((await c.delete("/api/textos-bot/saludo")).estado, 204);
  const despuesDeRestablecer = await conversacion(o);
  await despuesDeRestablecer.escribe("Hola", T0);
  assert.equal(despuesDeRestablecer.dichos()[0], textos.saludo("Vertical Prueba"));
});

test("EFECTO textos: un texto guardado que ya no pasa la validación (el catálogo cambió) nunca llega a una familia: sale el de siempre", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 texto roto");
  // Insertado por debajo de la API (como si viniera de una versión anterior): sin el hueco obligatorio y con un enlace.
  await prisma.texto_bot.create({ data: { organizacion_id: o.organizacionId, clave: "pregunta_sucursal", texto: "¿Qué sede? https://x.mx" } });
  await prisma.texto_bot.create({ data: { organizacion_id: o.organizacionId, clave: "clave_que_ya_no_existe", texto: "Hola" } });
  assert.deepEqual(await leerTextosPersonalizados(conAlcance(prisma, o.organizacionId)), {});
  const s = await conversacion(o);
  await s.escribe("Hola", T0);
  await s.escribe("Ana", T0);
  await s.escribe("8", T0);
  assert.equal(s.dichos().at(-1), textos.preguntaSucursal(o.sucursales), "el de siempre, con su lista");
});

test("EFECTO textos de un módulo apagado: se pueden editar, la API avisa que el módulo está apagado y el bot no los dice", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 texto módulo apagado");
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  await c.login(o.slug, u.correo, u.contrasena);
  await fijarConfiguracion(prisma, o.organizacionId, { modulo_cotizador: false, modulo_clase_muestra: false, modulo_inscripcion: false, modulo_operacion: false, modulo_finanzas: false, modulo_tableros: false });
  const cot = await uno("pregunta_programa", c);
  assert.deepEqual([cot.modulo, cot.modulo_encendido], ["cotizador", false]);
  assert.equal((await uno("saludo", c)).modulo_encendido, true, "la captación siempre está encendida");
  assert.equal((await c.put("/api/textos-bot/pregunta_programa", { texto: "Elige programa:\n{lista}" })).estado, 200);
  assert.equal((await c.put("/api/textos-bot/proponer_fechas_muestra", { texto: "Fechas para {nombre}:\n{lista}" })).estado, 200);
  assert.equal((await uno("pregunta_programa", c)).personalizado, true);
  // El bot sin cotizador hace lo de siempre: tres preguntas y pase; no dice nada de lo guardado para el cotizador.
  const s = await conversacion(o);
  for (const m of ["Hola", "Ana", "8", "1"]) await s.escribe(m, T0);
  assert.ok(s.dichos().every((t) => !/Elige programa|Fechas para/.test(t ?? "")));
  assert.equal((await s.conv()).paso_captacion, "completo");
});

// ── Efecto real: minutos antes de avisar de un lead a medias ──────────────────────────────────────────

test("EFECTO lead a medias: a los 30 min por omisión; con 60, no a los 31 y sí a los 61; con 10, a los 11 — por organización y sin reiniciar", async () => {
  // Por omisión.
  const a = await sembrarOrganizacion(prisma, "V5 a medias omisión");
  const sa = await conversacion(a);
  await sa.escribe("Hola", T0);
  await sa.escribe("Ana", T0);
  assert.equal(await sa.barrer(despues(29 * MIN)), 0);
  assert.equal(await sa.barrer(despues(31 * MIN)), 1, "30 min: lo de siempre");

  // Una escuela que espera una hora.
  const b = await sembrarOrganizacion(prisma, "V5 a medias 60");
  await fijarConfiguracion(prisma, b.organizacionId, { lead_a_medias_minutos: 60 });
  const sb = await conversacion(b);
  await sb.escribe("Hola", T0);
  await sb.escribe("Ana", T0);
  assert.equal(await sb.barrer(despues(31 * MIN)), 0, "a los 31 min todavía no");
  assert.equal(await sb.barrer(despues(59 * MIN)), 0);
  assert.equal(sb.notas().length, 0);
  assert.equal(await sb.barrer(despues(61 * MIN)), 1, "a los 61 sí");
  assert.equal(sb.notas().length, 1);
  assert.equal((await sb.conv()).estado, "bot", "visible no es atendido");

  // Una escuela que quiere enterarse a los 10 minutos, y cambia de opinión sin reiniciar nada.
  const c = await sembrarOrganizacion(prisma, "V5 a medias 10");
  await fijarConfiguracion(prisma, c.organizacionId, { lead_a_medias_minutos: 10 });
  const sc = await conversacion(c);
  await sc.escribe("Hola", T0);
  await sc.escribe("Ana", T0);
  assert.equal(await sc.barrer(despues(9 * MIN)), 0);
  assert.equal(await sc.barrer(despues(11 * MIN)), 1);
  const d = await sembrarOrganizacion(prisma, "V5 a medias cambia");
  const sd = await conversacion(d);
  await sd.escribe("Hola", T0);
  await sd.escribe("Ana", T0);
  await fijarConfiguracion(prisma, d.organizacionId, { lead_a_medias_minutos: 120 });
  assert.equal(await sd.barrer(despues(31 * MIN)), 0, "con 120 todavía no");
  await fijarConfiguracion(prisma, d.organizacionId, { lead_a_medias_minutos: 5 });
  assert.equal(await sd.barrer(despues(31 * MIN)), 1, "bajarlo surte efecto en el siguiente barrido");
});

// ── Efecto real: respuestas sin entender ─────────────────────────────────────────────────────────────

test("EFECTO respuestas sin entender: 3 por omisión; con 2 pasa a una persona antes; con 5 insiste más; el pase es el mismo de siempre", async () => {
  const intenta = async (o: OrganizacionDePrueba, intentos: number) => {
    const s = await conversacion(o);
    await s.escribe("Hola", T0); // saludo + «¿cómo se llama?»
    const salida: (string | null)[] = [];
    for (let i = 0; i < intentos; i++) {
      await s.escribe("????", T0);
      salida.push((await s.conv()).motivo_pase_asesor);
    }
    return { salida, s };
  };
  const a = await sembrarOrganizacion(prisma, "V5 intentos omisión");
  const omision = await intenta(a, 4);
  assert.deepEqual(omision.salida.slice(0, 3), [null, null, "sin_entender"], "al tercero (omisión)");

  const b = await sembrarOrganizacion(prisma, "V5 intentos 2");
  await fijarConfiguracion(prisma, b.organizacionId, { bot_max_intentos: 2 });
  const dos = await intenta(b, 2);
  assert.deepEqual(dos.salida, [null, "sin_entender"]);
  assert.equal(dos.s.dichos().at(-1), textos.sinEntender);
  assert.equal((await dos.s.conv()).estado, "en_atencion_humana");

  const c = await sembrarOrganizacion(prisma, "V5 intentos 5");
  await fijarConfiguracion(prisma, c.organizacionId, { bot_max_intentos: 5 });
  const cinco = await intenta(c, 5);
  assert.deepEqual(cinco.salida, [null, null, null, null, "sin_entender"]);

  // La nota para el asesor dice cuántas respuestas aguantó el bot en ESTA escuela.
  const nota = dos.s.transporte.envios.find((e) => e.tipo === "nota_interna" && /no pudo completar la captura/.test(e.texto ?? ""));
  assert.match(nota?.texto ?? "", /\(2 respuestas sin entender\)/);
  const notaCinco = cinco.s.transporte.envios.find((e) => e.tipo === "nota_interna" && /no pudo completar la captura/.test(e.texto ?? ""));
  assert.match(notaCinco?.texto ?? "", /\(5 respuestas sin entender\)/);
  assert.ok(HORA > 0);
});
