// Sesiones y acceso (B1) de punta a punta: la app real, Postgres real, contraseñas baratas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETROS_PRUEBA } from "../auth/contrasena.ts";
import { BLOQUEO_POR_DEFECTO, ErrorBloqueado, ErrorCredenciales, iniciarSesion, type DepsAcceso } from "../auth/acceso.ts";
import { configSesionDesdeEntorno, hashDeToken, revocarSesion, validarSesion, DURACION_SESION_MS } from "../auth/sesiones.ts";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada } from "../testutil/api.ts";
import { conGanchos } from "../testutil/carrera.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let ahora = new Date("2026-10-10T15:00:00Z");
let api: ApiLevantada;

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Sesiones");
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
    () => api.cliente().login(undefined, u.correo, u.contrasena), // hay muchas organizaciones: el slug es obligatorio
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
