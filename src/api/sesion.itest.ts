// Sesiones y acceso (B1) de punta a punta: la app real, Postgres real, contraseñas baratas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETROS_POR_DEFECTO, PARAMETROS_PRUEBA, derivacionesHechas, hashFicticio } from "../auth/contrasena.ts";
import { BLOQUEO_POR_DEFECTO, ErrorBloqueado, ErrorCredenciales, iniciarSesion, type DepsAcceso } from "../auth/acceso.ts";
import { configSesionDesdeEntorno, hashDeToken, revocarSesion, validarSesion, DURACION_SESION_MS } from "../auth/sesiones.ts";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada } from "../testutil/api.ts";
import { conGanchos } from "../testutil/carrera.ts";
import { llaveDeIp } from "../http/ip.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
/** Otra organización viva: garantiza que «hay más de una» sin depender de lo que dejaron otras corridas (EB-11). */
let segunda: OrganizacionDePrueba;
let ahora = new Date("2026-10-10T15:00:00Z");
let api: ApiLevantada;

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Sesiones");
  segunda = await sembrarOrganizacion(prisma, "Sesiones segunda");
  api = levantarApi(prisma, { reloj: () => ahora });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const avanzar = (ms: number) => {
  ahora = new Date(ahora.getTime() + ms);
};

test("login: crea la sesión, la cookie es HttpOnly + SameSite=Lax y en la base solo queda el SHA-256 del token", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const c = api.cliente();
  const r = await c.login(org.slug, u.correo, u.contrasena);
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.usuario.rol, "asesor");
  const setCookie = r.cabeceras.getSetCookie()[0] ?? "";
  assert.match(setCookie, /^sesion=[A-Za-z0-9_-]{43};/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(setCookie, /Secure/i, "en pruebas la cookie no es Secure (http)");
  const token = c.cookieDeSesion!;
  const filas = await prisma.sesion.findMany({ where: { usuario_id: u.id } });
  assert.equal(filas.length, 1);
  assert.equal(filas[0]!.token_hash, hashDeToken(token));
  assert.notEqual(filas[0]!.token_hash, token);
  assert.equal(filas[0]!.expira_en.getTime() - ahora.getTime(), DURACION_SESION_MS);
  assert.equal((await c.get<{ usuario: { id: string } }>("/api/yo")).cuerpo.usuario.id, u.id);
});

test("la cookie lleva Secure cuando el entorno lo pide", async () => {
  const segura = levantarApi(prisma, { cookieSegura: true });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
    const r = await segura.cliente().login(org.slug, u.correo, u.contrasena);
    assert.match(r.cabeceras.getSetCookie()[0] ?? "", /; Secure/i);
    assert.match(r.cabeceras.get("strict-transport-security") ?? "", /max-age/);
  } finally {
    await segura.cerrar();
  }
});

test("sin sesión (o con una cookie inventada) todo da 401 no_autenticado con la convención de errores", async () => {
  const c = api.cliente();
  const r = await c.get<{ error: { codigo: string; mensaje: string } }>("/api/yo");
  assert.equal(r.estado, 401);
  assert.equal(r.cuerpo.error.codigo, "no_autenticado");
  c.cookieDeSesion = "x".repeat(43);
  assert.equal((await c.get("/api/yo")).estado, 401);
  c.cookieDeSesion = "corta";
  assert.equal((await c.get("/api/yo")).estado, 401);
});

test("no se distingue «no existe» de «contraseña mala»: mismo estado y mismo cuerpo (organización, correo, contraseña e inactivo)", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const inactivo = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor", activo: false });
  const intentos = [
    () => api.cliente().login(org.slug, u.correo, "contraseña-equivocada"),
    () => api.cliente().login(org.slug, "nadie@prueba.test", "contraseña-equivocada"),
    () => api.cliente().login("no-existe-esta-org", u.correo, u.contrasena),
    () => api.cliente().login(org.slug, inactivo.correo, inactivo.contrasena),
    () => api.cliente().login(undefined, u.correo, u.contrasena), // hay (al menos) dos organizaciones vivas, `segunda` y `org`: el slug es obligatorio
  ];
  const respuestas = [];
  for (const i of intentos) respuestas.push(await i());
  for (const r of respuestas) {
    assert.equal(r.estado, 401);
    assert.deepEqual(r.cuerpo, respuestas[0]!.cuerpo);
    assert.equal(r.cabeceras.getSetCookie().length, 0);
  }
});

test("el login valida la entrada: campos desconocidos, correo mal formado y cuerpo no JSON", async () => {
  const c = api.cliente();
  const r1 = await c.post<{ error: { codigo: string; detalles: { campo: string }[] } }>("/api/sesion", { correo: "no-es-correo", contrasena: "x", extra: 1 });
  assert.equal(r1.estado, 400);
  assert.equal(r1.cuerpo.error.codigo, "validacion");
  assert.deepEqual(r1.cuerpo.error.detalles.map((d) => d.campo).sort(), ["correo", "extra"]);
  const r2 = await c.pedir<{ error: { codigo: string } }>("POST", "/api/sesion", "{no es json");
  assert.equal(r2.estado, 400);
  assert.equal(r2.cuerpo.error.codigo, "validacion");
  const r3 = await c.pedir<{ error: { codigo: string } }>("POST", "/api/sesion", JSON.stringify({ correo: "a@b.co", contrasena: "x".repeat(5000) }));
  assert.equal(r3.estado, 413);
  assert.equal(r3.cuerpo.error.codigo, "limite_excedido");
});

test("cierre de sesión: revoca en la base, borra la cookie y la sesión deja de servir; cerrar dos veces no falla", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "recepcion" });
  const c = api.cliente();
  await c.login(org.slug, u.correo, u.contrasena);
  const token = c.cookieDeSesion!;
  assert.equal((await c.delete("/api/sesion")).estado, 204);
  const fila = await prisma.sesion.findFirstOrThrow({ where: { token_hash: hashDeToken(token) } });
  assert.ok(fila.revocada_en);
  // Alguien que conservó la cookie vieja:
  const ladron = api.cliente();
  ladron.cookieDeSesion = token;
  assert.equal((await ladron.get("/api/yo")).estado, 401);
  assert.equal((await c.delete("/api/sesion")).estado, 204);
});

test("expira a las 12 h absolutas aunque se use sin parar, y por inactividad antes de eso", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const c = api.cliente();
  await c.login(org.slug, u.correo, u.contrasena);
  const inactividad = configSesionDesdeEntorno({}).inactividadMs; // 2 h por defecto
  // Se usa cada hora durante 11 horas: sigue viva (la actividad renueva la inactividad, no la expiración).
  for (let i = 0; i < 11; i++) {
    avanzar(60 * 60 * 1000);
    assert.equal((await c.get("/api/yo")).estado, 200, `hora ${i + 1}`);
  }
  avanzar(61 * 60 * 1000); // 12 h 1 min desde el inicio
  assert.equal((await c.get("/api/yo")).estado, 401, "pasó la expiración absoluta");

  const d = api.cliente();
  await d.login(org.slug, u.correo, u.contrasena);
  avanzar(inactividad - 1000);
  assert.equal((await d.get("/api/yo")).estado, 200);
  avanzar(inactividad + 1000);
  assert.equal((await d.get("/api/yo")).estado, 401, "pasó la inactividad");
});

test("desactivar al usuario o cambiarle el correo a inactivo corta su sesión en la siguiente petición", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const c = api.cliente();
  await c.login(org.slug, u.correo, u.contrasena);
  assert.equal((await c.get("/api/yo")).estado, 200);
  await prisma.usuario.update({ where: { id: u.id }, data: { activo: false } });
  assert.equal((await c.get("/api/yo")).estado, 401);
  await prisma.usuario.update({ where: { id: u.id }, data: { activo: true, eliminado_en: new Date() } });
  assert.equal((await c.get("/api/yo")).estado, 401, "un usuario borrado tampoco");
});

test("cambio de contraseña: exige la actual, aplica la política, cierra las demás sesiones y deja entrar con la nueva", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const a = api.cliente();
  const b = api.cliente();
  await a.login(org.slug, u.correo, u.contrasena);
  await b.login(org.slug, u.correo, u.contrasena);
  const mala = await a.post<{ error: { codigo: string; detalles: { campo: string }[] } }>("/api/yo/contrasena", { actual: "no-es-esta-123", nueva: "otra-contrasena-1" });
  assert.equal(mala.estado, 400);
  assert.equal(mala.cuerpo.error.detalles[0]?.campo, "actual");
  const debil = await a.post<{ error: { detalles: { campo: string }[] } }>("/api/yo/contrasena", { actual: u.contrasena, nueva: "corta" });
  assert.equal(debil.estado, 400);
  assert.equal(debil.cuerpo.error.detalles[0]?.campo, "nueva");
  assert.equal((await a.post("/api/yo/contrasena", { actual: u.contrasena, nueva: "una-contrasena-nueva-1" })).estado, 204);
  assert.equal((await a.get("/api/yo")).estado, 200, "la sesión que cambió la contraseña sigue");
  assert.equal((await b.get("/api/yo")).estado, 401, "las demás se cierran");
  assert.equal((await api.cliente().login(org.slug, u.correo, u.contrasena)).estado, 401);
  assert.equal((await api.cliente().login(org.slug, u.correo, "una-contrasena-nueva-1")).estado, 201);
  const guardado = await prisma.usuario.findFirstOrThrow({ where: { id: u.id } });
  assert.ok(!guardado.contrasena_hash.includes("nueva"));
  assert.ok(guardado.contrasena_cambiada_en);
});

// ── CSRF ──────────────────────────────────────────────────────────────────────────────

test("CSRF: un POST de otro origen se rechaza; el del mismo host o sin cabecera de origen pasa", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const c = api.cliente();
  const cuerpo = { organizacion: org.slug, correo: u.correo, contrasena: u.contrasena };
  const ajeno = await c.pedir("POST", "/api/sesion", cuerpo, { origin: "https://malo.example" });
  assert.equal(ajeno.estado, 403);
  assert.equal(c.cookieDeSesion, undefined);
  assert.equal((await c.pedir("POST", "/api/sesion", cuerpo, { origin: "null" })).estado, 403);
  assert.equal((await c.pedir("POST", "/api/sesion", cuerpo, { referer: "https://malo.example/pagina" })).estado, 403);
  const propio = await c.pedir("POST", "/api/sesion", cuerpo, { origin: api.base });
  assert.equal(propio.estado, 201);
  assert.equal((await c.pedir("DELETE", "/api/sesion", undefined, { origin: "https://malo.example" })).estado, 403);
  assert.equal((await c.get("/api/yo")).estado, 200, "el DELETE ajeno no cerró la sesión");
});

test("CSRF: un método que cambia algo sin JSON ni X-Requested-With se rechaza (formulario de otro sitio)", async () => {
  const c = api.cliente();
  const formulario = await c.pedir("POST", "/api/sesion", "correo=a%40b.co&contrasena=x", { "content-type": "application/x-www-form-urlencoded" });
  assert.equal(formulario.estado, 403);
  const texto = await c.pedir("POST", "/api/sesion", "{}", { "content-type": "text/plain" });
  assert.equal(texto.estado, 403);
  const conCabecera = await c.pedir("POST", "/api/sesion", "{}", { "content-type": "text/plain", "x-requested-with": "fetch" });
  assert.notEqual(conCabecera.estado, 403, "con X-Requested-With llega a validarse");
});

test("CSRF: con ORIGEN_PUBLICO configurado solo ese origen vale", async () => {
  const fijo = levantarApi(prisma, { origenesPermitidos: ["https://app.escuela.example"] });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
    const cuerpo = { organizacion: org.slug, correo: u.correo, contrasena: u.contrasena };
    const c = fijo.cliente();
    assert.equal((await c.pedir("POST", "/api/sesion", cuerpo, { origin: fijo.base })).estado, 403, "ni el propio host si no es el configurado");
    assert.equal((await c.pedir("POST", "/api/sesion", cuerpo, { origin: "https://app.escuela.example" })).estado, 201);
  } finally {
    await fijo.cerrar();
  }
});

test("rutas desconocidas de /api: 401 sin sesión (no se revela qué rutas hay) y 404 en JSON con sesión; cabeceras de seguridad y CSP restrictiva en la API", async () => {
  const anonimo = await api.cliente().get<{ error: { codigo: string } }>("/api/no-existe");
  assert.equal(anonimo.estado, 401, "autenticar va antes que cualquier ruta: denegar por omisión");
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "recepcion" });
  const c = api.cliente();
  await c.login(org.slug, u.correo, u.contrasena);
  const r = await c.get<{ error: { codigo: string } }>("/api/no-existe");
  assert.equal(r.estado, 404);
  assert.equal(r.cuerpo.error.codigo, "no_encontrado");
  assert.equal(r.cabeceras.get("x-content-type-options"), "nosniff");
  assert.equal(r.cabeceras.get("x-frame-options"), "DENY");
  assert.equal(r.cabeceras.get("referrer-policy"), "no-referrer");
  assert.match(r.cabeceras.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(r.cabeceras.get("cache-control"), "no-store");
  const salud = await fetch(`${api.base}/salud`);
  assert.equal(salud.headers.get("x-content-type-options"), "nosniff", "las cabeceras básicas van en todo el backend");
  assert.equal(salud.headers.get("content-security-policy"), null, "la CSP de API no se aplica fuera de /api");
});

// ── Bloqueo por intentos (nivel servicio: aquí sí se controla la IP) ────────────────────

function depsAcceso(extra: Partial<DepsAcceso> = {}): DepsAcceso {
  return {
    prisma,
    reloj: () => ahora,
    sesion: configSesionDesdeEntorno({}),
    bloqueo: BLOQUEO_POR_DEFECTO,
    parametrosHash: PARAMETROS_PRUEBA,
    ...extra,
  };
}

test("bloqueo: tras 5 fallos de (correo, IP) ni la contraseña correcta entra; otra IP y otro correo no se afectan; pasada la ventana se libera", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const otro = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const deps = depsAcceso();
  const intento = (correo: string, contrasena: string, ip: string) => iniciarSesion(deps, { organizacion: org.slug, correo, contrasena, ip, agente: null });
  for (let i = 0; i < 5; i++) await assert.rejects(intento(u.correo, "mala-contrasena-1", "10.0.0.1"), ErrorCredenciales);
  await assert.rejects(intento(u.correo, u.contrasena, "10.0.0.1"), (e) => e instanceof ErrorBloqueado && e.reintentarEnSegundos > 0 && e.reintentarEnSegundos <= 15 * 60);
  assert.equal((await intento(u.correo, u.contrasena, "10.0.0.2")).usuario.id, u.id, "otra IP");
  assert.equal((await intento(otro.correo, otro.contrasena, "10.0.0.1")).usuario.id, otro.id, "otro correo");
  avanzar(15 * 60 * 1000 + 1000);
  assert.equal((await intento(u.correo, u.contrasena, "10.0.0.1")).usuario.id, u.id, "pasada la ventana");
});

test("bloqueo: también cuenta para correos que no existen (no delata qué usuarios hay)", async () => {
  const deps = depsAcceso();
  const intento = () => iniciarSesion(deps, { organizacion: org.slug, correo: "fantasma@prueba.test", contrasena: "mala-contrasena-1", ip: "10.9.9.9", agente: null });
  for (let i = 0; i < 5; i++) await assert.rejects(intento(), ErrorCredenciales);
  await assert.rejects(intento(), ErrorBloqueado);
});

test("bloqueo con concurrencia: 12 intentos malos simultáneos de la misma pareja → exactamente 5 se verifican y 7 se bloquean", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const deps = depsAcceso();
  const resultados = await Promise.allSettled(
    Array.from({ length: 12 }, () => iniciarSesion(deps, { organizacion: org.slug, correo: u.correo, contrasena: "mala-contrasena-1", ip: "10.5.5.5", agente: null })),
  );
  const credenciales = resultados.filter((r) => r.status === "rejected" && r.reason instanceof ErrorCredenciales).length;
  const bloqueados = resultados.filter((r) => r.status === "rejected" && r.reason instanceof ErrorBloqueado).length;
  assert.equal(credenciales, 5);
  assert.equal(bloqueados, 7);
});

test("al acertar se liberan los intentos previos de la pareja", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const deps = depsAcceso();
  const intento = (contrasena: string) => iniciarSesion(deps, { organizacion: org.slug, correo: u.correo, contrasena, ip: "10.6.6.6", agente: null });
  for (let i = 0; i < 4; i++) await assert.rejects(intento("mala-contrasena-1"), ErrorCredenciales);
  await intento(u.contrasena);
  for (let i = 0; i < 4; i++) await assert.rejects(intento("mala-contrasena-1"), ErrorCredenciales); // otra vez 4 permitidos
  const vivos = await prisma.intento_acceso.count({ where: { correo: u.correo, eliminado_en: null } });
  assert.equal(vivos, 4);
});

// ── Concurrencia de sesiones ──────────────────────────────────────────────────────────

test("dos logins simultáneos del mismo usuario → dos sesiones distintas, las dos válidas", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const [a, b] = [api.cliente(), api.cliente()];
  const [ra, rb] = await Promise.all([a.login(org.slug, u.correo, u.contrasena), b.login(org.slug, u.correo, u.contrasena)]);
  assert.equal(ra.estado, 201);
  assert.equal(rb.estado, 201);
  assert.notEqual(a.cookieDeSesion, b.cookieDeSesion);
  assert.equal(await prisma.sesion.count({ where: { usuario_id: u.id, revocada_en: null } }), 2);
  assert.equal((await a.get("/api/yo")).estado, 200);
  assert.equal((await b.get("/api/yo")).estado, 200);
});

test("revocación vs uso simultáneo: cada petición da 200 o 401, nunca otra cosa, y después de revocar todas dan 401", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const c = api.cliente();
  await c.login(org.slug, u.correo, u.contrasena);
  const lectores = api.cliente();
  lectores.cookieDeSesion = c.cookieDeSesion;
  const peticiones: Promise<number>[] = [];
  for (let i = 0; i < 30; i++) {
    peticiones.push(lectores.get("/api/yo").then((r) => r.estado));
    if (i === 10) peticiones.push(c.delete("/api/sesion").then((r) => r.estado));
  }
  const estados = await Promise.all(peticiones);
  assert.ok(estados.every((e) => e === 200 || e === 401 || e === 204), estados.join(","));
  assert.ok(estados.includes(204));
  for (let i = 0; i < 5; i++) assert.equal((await lectores.get("/api/yo")).estado, 401);
});

test("el refresco de actividad no revive ni toca una sesión revocada justo en medio de la validación", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const c = api.cliente();
  await c.login(org.slug, u.correo, u.contrasena);
  const token = c.cookieDeSesion!;
  const antes = await prisma.sesion.findFirstOrThrow({ where: { token_hash: hashDeToken(token) } });
  avanzar(5 * 60 * 1000); // toca refrescar la actividad
  const ahoraDeLaPrueba = ahora;
  // Justo antes del UPDATE de actividad, otra petición cierra la sesión.
  const conCarrera = conGanchos(prisma, {
    modelo: "sesion",
    operacion: "updateMany",
    cuando: (args) => JSON.stringify(args).includes("ultima_actividad_en"),
    antes: async () => {
      await revocarSesion(conAlcance(prisma, org.organizacionId), antes.id, ahoraDeLaPrueba);
    },
  });
  const r = await validarSesion(conCarrera, token, configSesionDesdeEntorno({}), ahoraDeLaPrueba);
  assert.ok(r, "esta petición ya había pasado la validación cuando se cerró");
  const despues = await prisma.sesion.findFirstOrThrow({ where: { id: antes.id } });
  assert.ok(despues.revocada_en, "sigue revocada");
  assert.equal(despues.ultima_actividad_en.getTime(), antes.ultima_actividad_en.getTime(), "el refresco condicional no escribió");
  assert.equal(await validarSesion(prisma, token, configSesionDesdeEntorno({}), ahoraDeLaPrueba), null);
});

test("la tabla de sesiones es invisible entre organizaciones: el token de una no abre nada en otra", async () => {
  const otra = await sembrarOrganizacion(prisma, "SesionesOtra");
  const mio = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  await c.login(org.slug, mio.correo, mio.contrasena);
  // El correo existe en la otra organización con OTRA contraseña: el login a la otra no acepta la mía.
  const suyo = await sembrarUsuario(prisma, otra.organizacionId, { rol: "asesor", correo: mio.correo, contrasena: "contrasena-de-la-otra-1" });
  assert.equal((await api.cliente().login(otra.slug, mio.correo, mio.contrasena)).estado, 401);
  const d = api.cliente();
  assert.equal((await d.login(otra.slug, mio.correo, suyo.contrasena)).estado, 201);
  assert.equal((await d.get<{ usuario: { id: string }; organizacion: { id: string } }>("/api/yo")).cuerpo.organizacion.id, otra.organizacionId);
  assert.equal((await c.get<{ organizacion: { id: string } }>("/api/yo")).cuerpo.organizacion.id, org.organizacionId);
});


// ── Correcciones de la auditoría de la etapa B ───────────────────────────────────────────

test("EB-11: el login sin organización es ambiguo con 2 o más organizaciones vivas, sin importar lo que haya en la base", async () => {
  // `segunda` y `org` están vivas por construcción; el usuario existe en las dos con la misma contraseña.
  const correo = `ambiguo-${Math.random().toString(36).slice(2, 10)}@prueba.test`;
  for (const o of [org, segunda]) await sembrarUsuario(prisma, o.organizacionId, { rol: "asesor", correo });
  const r = await api.cliente().login(undefined, correo, "contrasena-de-prueba-1");
  assert.equal(r.estado, 401, "no elige una organización al azar (N04)");
  assert.equal((await api.cliente().login(org.slug, correo, "contrasena-de-prueba-1")).estado, 201);
});

test("EB-03: el bloqueo cuenta por /64 en IPv6: 20 direcciones del mismo /64 se bloquean como una, y otro /64 no se afecta", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  const deps = depsAcceso();
  const intento = (contrasena: string, ip: string) => iniciarSesion(deps, { organizacion: org.slug, correo: u.correo, contrasena, ip, agente: null });
  const delPrefijo = (i: number) => `2001:db8:aaaa:bbbb:${i.toString(16)}:${(i * 7).toString(16)}::${(i + 1).toString(16)}`;
  assert.equal(llaveDeIp(delPrefijo(1)), llaveDeIp(delPrefijo(19)), "mismo /64");
  let bloqueados = 0;
  for (let i = 0; i < 20; i++) {
    await intento("mala-contrasena-1", delPrefijo(i)).catch((e: unknown) => {
      if (e instanceof ErrorBloqueado) bloqueados++;
      else assert.ok(e instanceof ErrorCredenciales);
    });
  }
  assert.equal(bloqueados, 15, "5 intentos verificados y el resto bloqueado, aunque cada uno venga de una dirección distinta");
  await assert.rejects(intento(u.contrasena, delPrefijo(99)), ErrorBloqueado, "ni la contraseña correcta desde otra dirección del /64");
  assert.equal((await intento(u.contrasena, "2001:db8:cccc:dddd::1")).usuario.id, u.id, "otro /64 sí entra");
  // IPv4 y la forma mapeada son la misma llave.
  for (let i = 0; i < 5; i++) await assert.rejects(intento("mala-contrasena-1", "::ffff:198.51.100.4"), ErrorCredenciales);
  await assert.rejects(intento(u.contrasena, "198.51.100.4"), ErrorBloqueado);
});

test("EB-12 (M12): si el usuario o la organización no existen se hace el MISMO trabajo de scrypt (hash ficticio) que con una contraseña mala", async () => {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  await hashFicticio(); // calentar: el hash ficticio se crea una vez por proceso
  const deps = depsAcceso();
  const entrada = { correo: u.correo, contrasena: "mala-contrasena-1", ip: "10.20.0.1", agente: null };
  const trabajo = async (e: Parameters<typeof iniciarSesion>[1]): Promise<number> => {
    const antes = derivacionesHechas();
    await assert.rejects(iniciarSesion(deps, e), ErrorCredenciales);
    return derivacionesHechas() - antes;
  };
  assert.equal(await trabajo({ ...entrada, organizacion: org.slug }), 1, "contraseña mala de un usuario real");
  assert.equal(await trabajo({ ...entrada, organizacion: org.slug, correo: "nadie-existe@prueba.test", ip: "10.20.0.2" }), 1, "usuario inexistente");
  assert.equal(await trabajo({ ...entrada, organizacion: "no-existe-esta-org", ip: "10.20.0.3" }), 1, "organización inexistente");
  assert.equal(await trabajo({ ...entrada, organizacion: org.slug, correo: "no es correo", ip: "10.20.0.4" }), 1, "correo mal formado");
  const inactivo = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor", activo: false });
  assert.equal(await trabajo({ ...entrada, organizacion: org.slug, correo: inactivo.correo, contrasena: inactivo.contrasena, ip: "10.20.0.5" }), 1, "usuario inactivo");
});

test("EB-12 (M02): los parámetros de scrypt por defecto son los de OWASP (N=2^15, r=8, p=3), no unos más débiles", () => {
  assert.deepEqual(PARAMETROS_POR_DEFECTO, { N: 32768, r: 8, p: 3 });
});

test("EB-12 (M70): el bloqueo del login por HTTP usa la IP REAL del cliente (con trust proxy), no una fija: otra IP no se afecta", async () => {
  const proxy = levantarApi(prisma, {}, { confiarEnProxy: 1 });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
    const desde = (ip: string) => {
      const c = proxy.cliente();
      c.cabecerasExtra = { "x-forwarded-for": ip };
      return c;
    };
    for (let i = 0; i < 5; i++) assert.equal((await desde("203.0.113.50").login(org.slug, u.correo, "mala-contrasena-1")).estado, 401);
    assert.equal((await desde("203.0.113.50").login(org.slug, u.correo, u.contrasena)).estado, 429, "esa IP quedó bloqueada");
    assert.equal((await desde("203.0.113.51").login(org.slug, u.correo, u.contrasena)).estado, 201, "otra IP del mismo correo no");
    const filas = await prisma.intento_acceso.findMany({ where: { organizacion_id: org.organizacionId, correo: u.correo } });
    assert.ok(filas.every((f) => f.ip === "203.0.113.50" || f.ip === "203.0.113.51"), "se guarda la IP real, no la del proxy");
  } finally {
    await proxy.cerrar();
  }
});

test("EB-13/N05: una organización dada de baja ya no deja entrar por su slug y sus sesiones abiertas dejan de valer", async () => {
  const viva = await sembrarOrganizacion(prisma, "Sesiones baja");
  const u = await sembrarUsuario(prisma, viva.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  assert.equal((await c.login(viva.slug, u.correo, u.contrasena)).estado, 201);
  assert.equal((await c.get("/api/yo")).estado, 200);
  await prisma.organizacion.update({ where: { id: viva.organizacionId }, data: { eliminado_en: new Date() } });
  assert.equal((await c.get("/api/yo")).estado, 401, "la sesión abierta no sobrevive a la baja");
  assert.equal((await c.get("/api/usuarios")).estado, 401);
  assert.equal((await api.cliente().login(viva.slug, u.correo, u.contrasena)).estado, 401, "ni un login nuevo");
});

test("EB-14: un NUL o un cuerpo comprimido roto no son un error interno (400/415)", async () => {
  const c = api.cliente();
  const nul = await c.post<{ error: { codigo: string } }>("/api/sesion", { organizacion: org.slug, correo: "a\u0000b@prueba.test", contrasena: "x" });
  assert.equal(nul.estado, 400);
  assert.equal(nul.cuerpo.error.codigo, "validacion");
  assert.equal((await c.post("/api/sesion", { organizacion: "a\u0000b", correo: "a@prueba.test", contrasena: "x" })).estado, 400);
  for (const encoding of ["gzip", "br", "deflate"]) {
    const r = await c.pedir<{ error: { codigo: string } }>("POST", "/api/sesion", "esto no está comprimido", { "content-encoding": encoding });
    assert.equal(r.estado, 400, encoding);
    assert.equal(r.cuerpo.error.codigo, "validacion", encoding);
  }
  const compress = await c.pedir<{ error: { codigo: string } }>("POST", "/api/sesion", "{}", { "content-encoding": "compress" });
  assert.equal(compress.estado, 415);
  const charset = await c.pedir<{ error: { codigo: string } }>("POST", "/api/sesion", "{}", { "content-type": "application/json; charset=latin1" });
  assert.equal(charset.estado, 415);
});

test("EB-24: con cookie segura el nombre lleva __Host- (Secure, Path=/, sin Domain); la cookie `sesion` suelta no sirve y una cookie falsa colocada antes no anula la válida", async () => {
  const segura = levantarApi(prisma, { cookieSegura: true });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
    const c = segura.cliente();
    const r = await c.login(org.slug, u.correo, u.contrasena);
    const setCookie = r.cabeceras.getSetCookie()[0] ?? "";
    assert.match(setCookie, /^__Host-sesion=[A-Za-z0-9_-]{43};/);
    assert.match(setCookie, /; Secure/i);
    assert.match(setCookie, /; Path=\//);
    assert.doesNotMatch(setCookie, /Domain=/i);
    const token = c.cookieDeSesion!;
    assert.equal((await c.get("/api/yo")).estado, 200);
    // Alguien (desde un subdominio) planta una cookie `sesion` con un token real: con el prefijo no cuenta.
    const intruso = segura.cliente();
    intruso.cabecerasExtra = { cookie: `sesion=${token}` };
    assert.equal((await intruso.get("/api/yo")).estado, 401);
    // Y una cookie falsa con el nombre de verdad, colocada ANTES, no puede venir de un subdominio (el navegador la rechaza por el prefijo);
    // si llegara, la primera gana: lo comprobamos para dejar claro el contrato de lectura.
    const orden = segura.cliente();
    orden.cabecerasExtra = { cookie: `sesion=${"a".repeat(43)}; __Host-sesion=${token}` };
    assert.equal((await orden.get("/api/yo")).estado, 200, "la cookie sin prefijo ni se mira");
    // Cerrar sesión borra la del nombre correcto.
    const salir = await c.delete("/api/sesion");
    assert.equal(salir.estado, 204);
    assert.match(salir.cabeceras.getSetCookie()[0] ?? "", /^__Host-sesion=;/);
  } finally {
    await segura.cerrar();
  }
});
