// V12: `npm run demo:todo`. La lógica (opciones, guardas, plan, ejecución, comprobaciones, resumen) con un Docker FALSO, y el comando de verdad sin confirmación, en simulacro y con
// NODE_ENV=production (con un `docker` falso en el PATH que deja una marca si alguien lo llama: en esos tres casos NO debe llamarse).

import { revisarGuardasDeScript } from "./demo-todo.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { problemasDeContrasena, verificarContrasena } from "../../src/auth/contrasena.ts";
import { impedimentosParaArrancar } from "../../src/seguridad/entorno.ts";
import {
  CONTRASENA_DE_DEMO,
  MODULOS,
  USUARIOS_DE_DEMO,
  comprobacionesHttp,
  construirPlan,
  detalleDeCatalogo,
  detalleDeCuadratura,
  describirBorrado,
  ejecutarPlan,
  entornoDeCompose,
  entornoDeGuiones,
  ErrorDeUso,
  puertosAjenos,
  resolverOpciones,
  resumenFinal,
  revisarGuardas,
  textoDeConfirmacion,
  urlBaseDeLaDemo,
  type Comprobacion,
  type Ejecutor,
  type Entorno,
  type OpcionesDemo,
  type Red,
  type RespuestaHttp,
} from "./demo-todo.ts";

const principal = (extra: Record<string, string | boolean> = {}, env: Record<string, string> = {}): OpcionesDemo => resolverOpciones(extra, env);
const aparte = (extra: Record<string, string | boolean> = {}): OpcionesDemo => resolverOpciones({ proyecto: "v12demo", puerto: "3300", ...extra }, {});

// ── Opciones ───────────────────────────────────────────────────────────────────────────────────────────

test("opciones: sin nada es la demo principal con sus puertos de siempre, sin confirmar, 300 alumnos y 6 meses", () => {
  const o = principal();
  assert.deepEqual({ ...o }, { accion: "reconstruir", proyecto: "inscripciones", puertoBackend: 3000, puertoChatwoot: 3001, puertoPostgres: 5432, conChatwoot: false, confirmado: false, simulacro: false, alumnos: 300, meses: 6, semilla: 20261008, hasta: null });
});

test("opciones: la confirmación es --si o DEMO_CONFIRMAR=si, y nada más", () => {
  assert.equal(principal({ si: true }).confirmado, true);
  assert.equal(principal({}, { DEMO_CONFIRMAR: "si" }).confirmado, true);
  assert.equal(principal({}, { DEMO_CONFIRMAR: " SI " }).confirmado, true);
  for (const v of ["", "no", "1", "true", "sí "]) assert.equal(principal({}, { DEMO_CONFIRMAR: v }).confirmado, false, `«${v}» no confirma`);
});

test("opciones: otro proyecto NO hereda los puertos de la principal: exige el suyo y deriva los otros dos", () => {
  assert.throws(() => resolverOpciones({ proyecto: "v12demo" }, {}), (e: unknown) => e instanceof ErrorDeUso && /necesita su propio puerto/.test((e as Error).message));
  const o = aparte();
  assert.deepEqual([o.puertoBackend, o.puertoChatwoot, o.puertoPostgres], [3300, 3301, 3302]);
  assert.equal(resolverOpciones({ proyecto: "v12demo" }, { DEMO_PUERTO: "3400", DEMO_PUERTO_POSTGRES: "5440" }).puertoPostgres, 5440);
  assert.equal(aparte({ "puerto-chatwoot": "3310" }).puertoChatwoot, 3310);
});

test("opciones: valores inválidos se rechazan en español, y --apagar con --borrar no se mezclan", () => {
  assert.throws(() => aparte({ puerto: "abc" }), /entero/);
  assert.throws(() => aparte({ puerto: "80" }), /entre 1024/);
  assert.throws(() => principal({ alumnos: "0" }), /--alumnos/);
  assert.throws(() => principal({ hasta: "ayer" }), /AAAA-MM-DD/);
  assert.throws(() => principal({ hasta: "2026-13-45" }), /AAAA-MM-DD/);
  assert.throws(() => principal({ apagar: true, borrar: true }), /Elige una sola acción/);
  assert.equal(principal({ apagar: true }).accion, "apagar");
  assert.equal(principal({ borrar: true }).accion, "borrar");
});

// ── Guardas ────────────────────────────────────────────────────────────────────────────────────────────

test("guardas: se niega con NODE_ENV=production, con una base remota a la vista, con un nombre de proyecto raro y con puertos repetidos", () => {
  assert.deepEqual(revisarGuardas(principal(), { NODE_ENV: "development" }), []);
  assert.deepEqual(revisarGuardas(principal(), {}), []);
  assert.deepEqual(revisarGuardas(principal(), { DATABASE_URL: "postgresql://x:y@localhost:5432/inscripciones" }), []);
  assert.deepEqual(revisarGuardas(principal(), { NODE_ENV: "production" }).map((h) => h.codigo), ["produccion"]);
  assert.deepEqual(revisarGuardas(principal(), { NODE_ENV: " Production " }).map((h) => h.codigo), ["produccion"]);
  assert.deepEqual(revisarGuardas(principal(), { DATABASE_URL: "postgresql://u:p@db.interna.ejemplo:5432/inscripciones" }).map((h) => h.codigo), ["base_no_local"]);
  assert.deepEqual(revisarGuardas(principal(), { DATABASE_URL: "postgresql://u:p@escuela.abc123.us-east-1.rds.amazonaws.com/inscripciones" }).map((h) => h.codigo), ["base_no_local"]);
  assert.deepEqual(revisarGuardas({ ...principal(), proyecto: "../Raro" }, {}).map((h) => h.codigo), ["proyecto_invalido"]);
  assert.deepEqual(revisarGuardas({ ...principal(), proyecto: "a" }, {}).map((h) => h.codigo), ["proyecto_invalido"]);
  assert.deepEqual(revisarGuardas({ ...aparte(), puertoChatwoot: 3300 }, {}).map((h) => h.codigo), ["puertos_repetidos"]);
});

test("guardas: la URL de la base de la demo es siempre local y NUNCA una base de pruebas", () => {
  for (const o of [principal(), aparte(), aparte({ puerto: "4000" })]) {
    const url = urlBaseDeLaDemo(o);
    assert.match(url, /^postgresql:\/\/inscripciones:inscripciones@localhost:\d+\/inscripciones$/);
    assert.ok(!/_pruebas|_test/.test(url));
    assert.equal(entornoDeGuiones(o)["DATABASE_URL"], url);
  }
});

test("guardas: las contraseñas de demo las niega la política de contraseñas y la guarda de producción; los hashes del seed son las de la demo", async () => {
  assert.deepEqual(problemasDeContrasena(CONTRASENA_DE_DEMO), ["Esa contraseña es de las más usadas: elige otra"]);
  for (const u of USUARIOS_DE_DEMO) assert.deepEqual(problemasDeContrasena(CONTRASENA_DE_DEMO, { correo: u.correo, nombre: u.nombre }).length > 0, true, `${u.rol}: no se acepta en un alta o cambio de contraseña`);
  // Producción real: cualquier variable que lleve esa contraseña impide arrancar, y la demo declarada (ENTORNO_DEMO=si) no.
  const prod = { NODE_ENV: "production", CLAVE_DATOS_SENSIBLES: "k".repeat(44), DATABASE_URL: "postgresql://app:Clave-larga-de-verdad-9@db.interna:5432/escuela", COOKIE_SEGURA: "true", ORIGEN_PUBLICO: "https://escuela.ejemplo", TRUST_PROXY: "1" };
  assert.deepEqual(impedimentosParaArrancar(prod), []);
  const conDemo = impedimentosParaArrancar({ ...prod, CHATWOOT_ADMIN_PASSWORD: CONTRASENA_DE_DEMO });
  assert.deepEqual(conDemo.map((h) => h.codigo), ["valores_de_demo"]);
  assert.ok(!conDemo[0]!.mensaje.includes(CONTRASENA_DE_DEMO), "el mensaje nombra la variable, nunca el valor");
  // (V13-fix EV-28: la marca de demo solo vale con una base local o la del compose; aquí, la del compose.)
  assert.deepEqual(impedimentosParaArrancar({ ...prod, DATABASE_URL: "postgresql://app:Clave-larga-de-verdad-9@postgres:5432/escuela", ENTORNO_DEMO: "si", CHATWOOT_ADMIN_PASSWORD: CONTRASENA_DE_DEMO }), []);
  // El seed de la demo trae esos cuatro usuarios con ESA contraseña (y solo ella).
  const sql = readFileSync(new URL("../../prisma/seed/demo.sql", import.meta.url), "utf8");
  for (const u of USUARIOS_DE_DEMO) {
    const m = new RegExp(`'${u.correo.replace(".", "\\.")}',\\s*'[^']*',\\s*'${u.rol}',\\s*'(scrypt\\$[^']+)'`).exec(sql);
    assert.ok(m, `demo.sql trae a ${u.correo} como ${u.rol}`);
    assert.equal(await verificarContrasena(CONTRASENA_DE_DEMO, m[1]!), true, `${u.correo} entra con la contraseña de la demo`);
    assert.equal(await verificarContrasena(`${CONTRASENA_DE_DEMO}x`, m[1]!), false);
  }
  // Y la plantilla de una escuela real no trae nada de eso.
  const plantilla = readFileSync(new URL("../../prisma/seed/plantilla-organizacion.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.ok(!plantilla.includes("demo.test") && !plantilla.includes("scrypt$"));
});

// ── Qué borra ──────────────────────────────────────────────────────────────────────────────────────────

test("lo que borra: dice exactamente qué, sin Chatwoot salvo que se pida, y nunca las bases de pruebas", () => {
  const sin = describirBorrado(principal()).join("\n");
  assert.match(sin, /inscripciones_postgres-data/);
  assert.match(sin, /backend, demo-preparar, postgres/);
  assert.match(sin, /Chatwoot \(contenedores y volúmenes\) NO se toca/);
  assert.ok(!/chatwoot-postgres-data/.test(sin));
  assert.match(sin, /ningún otro proyecto de compose, las bases de pruebas \(\*_pruebas, \*_test\)/);
  const con = describirBorrado(principal({ "con-chatwoot": true })).join("\n");
  assert.match(con, /inscripciones_chatwoot-postgres-data, inscripciones_chatwoot-redis-data/);
  assert.ok(!/NO se toca/.test(con));
  assert.match(describirBorrado(aparte()).join("\n"), /v12demo_postgres-data/);
  assert.ok(!/inscripciones_postgres-data/.test(describirBorrado(aparte()).join("\n")), "otro proyecto no menciona los volúmenes de la principal");
  assert.match(describirBorrado(principal({ apagar: true })).join("\n"), /no borra nada/);
  assert.match(textoDeConfirmacion(principal()), /No se ejecutó nada\.[\s\S]*npm run demo:todo -- --si[\s\S]*DEMO_CONFIRMAR=si/);
  assert.match(textoDeConfirmacion(aparte()), /--proyecto v12demo --puerto 3300 --si/);
});

// ── El plan ────────────────────────────────────────────────────────────────────────────────────────────

const comandos = (plan: ReturnType<typeof construirPlan>) => plan.flatMap((p) => (p.tipo === "comando" ? [{ id: p.id, linea: `${p.cmd.split("/").at(-1)} ${p.args.join(" ")}`, env: p.env ?? {}, args: p.args }] : []));

test("plan: reconstruir sin Chatwoot quita SOLO los servicios y el volumen de la aplicación, en este orden", () => {
  const plan = construirPlan(principal({ si: true }));
  assert.deepEqual(plan.map((p) => p.id), ["prerrequisitos", "puertos", "bajar-aplicacion", "borrar-volumen", "levantar", "chatwoot", "detener-backend", "datos", "vivos", "encender-backend", "comprobar"]);
  const c = comandos(plan);
  assert.equal(c.find((x) => x.id === "bajar-aplicacion")!.linea, "docker compose -p inscripciones rm --stop --force backend demo-preparar postgres");
  assert.ok(!c.some((x) => /\bdown\b|--volumes|-v\b/.test(x.linea)), "sin --con-chatwoot no se baja el proyecto entero ni se borran todos los volúmenes");
  assert.deepEqual(plan.filter((p) => p.destructivo).map((p) => p.id), ["bajar-aplicacion", "borrar-volumen"]);
  assert.match(c.find((x) => x.id === "levantar")!.linea, /^docker compose -p inscripciones up --detach --build --wait/);
});

test("plan: con --con-chatwoot baja el proyecto entero con sus volúmenes, y solo ese proyecto", () => {
  const c = comandos(construirPlan(principal({ "con-chatwoot": true })));
  assert.equal(c.find((x) => x.id === "bajar-todo")!.linea, "docker compose -p inscripciones down --volumes --remove-orphans");
});

test("plan: TODO comando de docker compose lleva -p del proyecto pedido; otro proyecto no menciona a la principal ni a las bases de pruebas", () => {
  for (const o of [principal(), principal({ "con-chatwoot": true }), aparte(), aparte({ "con-chatwoot": true }), aparte({ apagar: true }), aparte({ borrar: true })]) {
    const plan = construirPlan(o);
    for (const x of comandos(plan).filter((y) => y.linea.startsWith("docker compose"))) assert.ok(x.args.slice(0, 3).join(" ") === `compose -p ${o.proyecto}`, `${x.id}: ${x.linea}`);
    const texto = JSON.stringify(plan);
    assert.ok(!/_pruebas|_test\b/.test(texto), "el plan nunca nombra bases de pruebas");
    if (o.proyecto !== "inscripciones") assert.ok(!/inscripciones_(?:postgres|chatwoot)|-p inscripciones/.test(texto), "otro proyecto no apunta a los volúmenes ni al proyecto de la demo principal");
  }
});

test("plan: la imagen y los puertos de otro proyecto son suyos; los de la principal, los de siempre", () => {
  assert.deepEqual(entornoDeCompose(principal()), { DEMO_PUERTO: "3000", DEMO_PUERTO_CHATWOOT: "3001", DEMO_PUERTO_POSTGRES: "5432", DEMO_IMAGEN: "inscripciones-backend:local" });
  assert.deepEqual(entornoDeCompose(aparte()), { DEMO_PUERTO: "3300", DEMO_PUERTO_CHATWOOT: "3301", DEMO_PUERTO_POSTGRES: "3302", DEMO_IMAGEN: "inscripciones-backend:v12demo" });
});

test("plan: los guiones del equipo corren contra la base DE ESTE proyecto y piden la confirmación de base de demo", () => {
  const plan = construirPlan(aparte({ alumnos: "40", meses: "2", semilla: "7", hasta: "2026-10-12" }));
  const datos = plan.find((p) => p.id === "datos")!;
  assert.equal(datos.tipo, "comando");
  if (datos.tipo === "comando") {
    assert.deepEqual(datos.args, ["scripts/demo-datos.ts", "--confirmar-base-de-demo", "--alumnos", "40", "--meses", "2", "--semilla", "7", "--hasta", "2026-10-12"]);
    assert.equal(datos.env!["DATABASE_URL"], "postgresql://inscripciones:inscripciones@localhost:3302/inscripciones");
    assert.equal(datos.env!["NODE_ENV"], "development");
  }
  const chat = plan.find((p) => p.id === "chatwoot")!;
  if (chat.tipo === "comando") assert.equal(chat.env!["CHATWOOT_URL"], "http://localhost:3301");
});

test("plan: apagar solo detiene (docker compose stop), sin borrar nada", () => {
  const plan = construirPlan(principal({ apagar: true }));
  assert.deepEqual(comandos(plan).map((c) => c.linea), ["docker compose -p inscripciones stop"]);
  assert.equal(plan.some((p) => p.destructivo), false);
});

// ── La ejecución, con un Docker falso ──────────────────────────────────────────────────────────────────────

interface Llamada {
  cmd: string;
  args: string[];
}
function entornoFalso(opciones: { fallaCuando?: (l: Llamada) => boolean; volumenExiste?: boolean; puertosOcupados?: number[]; propietarioDelPuerto?: string; nodeVersion?: string; docker?: boolean; http?: Red["http"] } = {}): { e: Entorno; llamadas: Llamada[]; dicho: string[] } {
  const llamadas: Llamada[] = [];
  const dicho: string[] = [];
  const ejecutor: Ejecutor = {
    async correr(cmd, args) {
      const l = { cmd: cmd.split("/").at(-1)!, args };
      llamadas.push(l);
      if (opciones.fallaCuando?.(l)) return { codigo: 1, salida: "falló a propósito" };
      if (l.cmd === "docker" && args[0] === "info") return opciones.docker === false ? { codigo: 1, salida: "Cannot connect" } : { codigo: 0, salida: "29.3.0\n" };
      if (l.cmd === "docker" && args[0] === "compose" && args[1] === "version") return { codigo: 0, salida: "v5.1.0\n" };
      if (l.cmd === "docker" && args[0] === "volume" && args[1] === "ls") return { codigo: 0, salida: opciones.volumenExiste === false ? "" : `${args[4]!.replace(/^name=\^|\$$/g, "")}\n` };
      if (l.cmd === "docker" && args[0] === "ps") return { codigo: 0, salida: `${opciones.propietarioDelPuerto ?? ""}\n` };
      return { codigo: 0, salida: "cuadra — todo bien\ntraslapes de edad 0\n" };
    },
  };
  const respuestasHttp = opciones.http ?? (async () => ({ estado: 500, texto: "", cookie: null }));
  const red: Red = { http: respuestasHttp, puertoOcupado: async (p) => (opciones.puertosOcupados ?? []).includes(p), esperar: async () => {} };
  let t = 0;
  return { e: { ejecutor, red, versionDeNode: opciones.nodeVersion ?? "22.20.0", ahora: () => (t += 1000), decir: (l) => dicho.push(l) }, llamadas, dicho };
}

test("ejecución: un recorrido completo ejecuta los pasos en orden, borra el volumen que existe y termina con las comprobaciones", async () => {
  const o = aparte();
  const { e, llamadas } = entornoFalso({ http: sesionesFalsas() });
  const r = await ejecutarPlan(o, construirPlan(o), e, () => "2026-10-12");
  assert.equal(r.ok, true, JSON.stringify(r.comprobaciones.filter((c) => !c.ok)));
  const lineas = llamadas.map((l) => `${l.cmd} ${l.args.join(" ")}`);
  const en = (re: RegExp): number => lineas.findIndex((l) => re.test(l));
  assert.ok(en(/^docker info/) < en(/^docker ps|rm --stop/) || en(/^docker ps/) === -1);
  assert.ok(en(/compose -p v12demo rm --stop --force backend demo-preparar postgres/) < en(/^docker volume rm v12demo_postgres-data$/));
  assert.ok(en(/^docker volume rm v12demo_postgres-data$/) < en(/up --detach --build --wait/));
  assert.ok(en(/up --detach --build --wait/) < en(/preparar-chatwoot/));
  assert.ok(en(/preparar-chatwoot/) < en(/compose -p v12demo stop backend/));
  assert.ok(en(/compose -p v12demo stop backend/) < en(/demo-datos\.ts --confirmar-base-de-demo --alumnos/), "el backend se detiene ANTES de cargar la historia");
  assert.ok(en(/demo-datos\.ts --confirmar-base-de-demo --alumnos/) < en(/demo-vivo\.ts/));
  assert.ok(en(/demo-vivo\.ts/) < en(/compose -p v12demo up --detach --wait --wait-timeout 300 backend/), "y se vuelve a encender después de la historia y de lo vivo");
  assert.ok(en(/compose -p v12demo up --detach --wait --wait-timeout 300 backend/) < en(/cuadratura\.ts/));
  assert.ok(!lineas.some((l) => /inscripciones_postgres|-p inscripciones\b/.test(l)), "no tocó el proyecto de la demo principal");
  assert.deepEqual(r.comprobaciones.map((c) => c.ok), r.comprobaciones.map(() => true));
});

test("ejecución: si el volumen no existe (primera vez) no falla ni intenta borrarlo", async () => {
  const o = aparte();
  const { e, llamadas } = entornoFalso({ volumenExiste: false, http: sesionesFalsas() });
  const r = await ejecutarPlan(o, construirPlan(o), e, () => "2026-10-12");
  assert.equal(r.ok, true);
  assert.ok(!llamadas.some((l) => l.args[0] === "volume" && l.args[1] === "rm"));
});

test("ejecución: un puerto ocupado por OTRA cosa detiene todo ANTES de borrar nada; uno que publica el propio proyecto no estorba", async () => {
  const o = aparte();
  const ajeno = entornoFalso({ puertosOcupados: [3300], propietarioDelPuerto: "otro-proyecto" });
  const r = await ejecutarPlan(o, construirPlan(o), ajeno.e, () => "x");
  assert.equal(r.ok, false);
  assert.equal(r.falloEn?.paso, "puertos");
  assert.match(r.falloEn!.detalle, /3300/);
  assert.ok(!ajeno.llamadas.some((l) => l.args.includes("rm") || l.args.includes("down") || (l.args[0] === "volume" && l.args[1] === "rm")), "no se borró nada");
  const propio = entornoFalso({ puertosOcupados: [3300, 3302], propietarioDelPuerto: "v12demo", http: sesionesFalsas() });
  assert.equal((await ejecutarPlan(o, construirPlan(o), propio.e, () => "2026-10-12")).falloEn, undefined);
  assert.deepEqual(puertosAjenos(o, new Set([3300, 3301]), new Set([3300])), [3301]);
  assert.deepEqual(puertosAjenos(o, new Set(), new Set()), []);
});

test("ejecución: sin Docker o con un Node viejo se detiene en el primer paso con un mensaje claro y sin borrar nada", async () => {
  const o = principal({ si: true });
  const sinDocker = entornoFalso({ docker: false });
  const a = await ejecutarPlan(o, construirPlan(o), sinDocker.e, () => "x");
  assert.equal(a.falloEn?.paso, "prerrequisitos");
  assert.match(a.falloEn!.detalle, /Docker no responde/);
  assert.equal(sinDocker.llamadas.length, 1);
  const viejo = entornoFalso({ nodeVersion: "20.11.0" });
  const b = await ejecutarPlan(o, construirPlan(o), viejo.e, () => "x");
  assert.match(b.falloEn!.detalle, /Node 20\.11\.0/);
  assert.equal(viejo.llamadas.length, 0);
  const justo = entornoFalso({ nodeVersion: "22.18.0", docker: false });
  assert.match((await ejecutarPlan(o, construirPlan(o), justo.e, () => "x")).falloEn!.detalle, /Docker/);
});

test("ejecución: si un paso falla, los siguientes NO corren (no se siembra sobre un levantado a medias)", async () => {
  const o = aparte();
  const { e, llamadas } = entornoFalso({ fallaCuando: (l) => l.args.includes("up") });
  const r = await ejecutarPlan(o, construirPlan(o), e, () => "x");
  assert.equal(r.ok, false);
  assert.equal(r.falloEn?.paso, "levantar");
  assert.ok(!llamadas.some((l) => l.args.some((a) => /demo-datos|demo-vivo|preparar-chatwoot/.test(a))));
});

test("ejecución: una comprobación que falla deja la demo levantada pero el resultado NO es ok y la batería informa todas", async () => {
  const o = aparte();
  const { e } = entornoFalso({ http: sesionesFalsas({ modulosApagados: ["finanzas"], contrasenaMala: "recepcion@demo.test" }) });
  const r = await ejecutarPlan(o, construirPlan(o), e, () => "2026-10-12");
  assert.equal(r.ok, false);
  assert.equal(r.falloEn, undefined);
  const malas = r.comprobaciones.filter((c) => !c.ok).map((c) => c.nombre);
  assert.ok(malas.some((m) => /recepcion@demo\.test/.test(m)), malas.join(" | "));
  assert.ok(malas.some((m) => /Recepción ve cargos/.test(m)), "sin sesión, lo de recepción también se informa");
  assert.ok(r.comprobaciones.some((c) => c.ok), "las demás se siguieron corriendo");
  assert.ok(r.comprobaciones.find((c) => /administrador@?|Entra administrador/.test(c.nombre) && !c.ok)?.detalle.includes("finanzas"));
});

// ── La batería de comprobaciones ───────────────────────────────────────────────────────────────────────────

function sesionesFalsas(o: { modulosApagados?: string[]; contrasenaMala?: string; sinInterfaz?: boolean } = {}): Red["http"] {
  return async (metodo, url, cuerpo, cookie): Promise<RespuestaHttp> => {
    const ruta = new URL(url).pathname + new URL(url).search;
    const ok = (c: unknown): RespuestaHttp => ({ estado: 200, texto: JSON.stringify(c), cookie: null });
    if (ruta === "/salud/lista") return ok({ ok: true });
    if (ruta === "/") return { estado: 200, texto: o.sinInterfaz ? "<html></html>" : '<div id="raiz"></div>', cookie: null };
    if (metodo === "POST" && ruta === "/api/sesion") {
      const c = cuerpo as { correo: string; contrasena: string };
      if (c.contrasena !== CONTRASENA_DE_DEMO || c.correo === o.contrasenaMala) return { estado: 401, texto: "{}", cookie: null };
      return { estado: 201, texto: "{}", cookie: `sesion=${c.correo}` };
    }
    const correo = cookie?.replace("sesion=", "") ?? "";
    const usuario = USUARIOS_DE_DEMO.find((u) => u.correo === correo);
    if (ruta === "/api/yo") return ok({ usuario: { rol: usuario?.rol }, modulos: Object.fromEntries(MODULOS.map((m) => [m, !(o.modulosApagados ?? []).includes(m)])) });
    if (ruta.startsWith("/api/leads")) return ok({ datos: [{}], paginacion: { total: 31 } });
    if (ruta.startsWith("/api/maestro/clases-muestra")) return ok({ datos: [{ fecha_hora: "2026-10-12T22:00:00Z", estatus: "agendada" }, { fecha_hora: "2026-10-13T22:00:00Z", estatus: "agendada" }] });
    if (ruta.startsWith("/api/cargos")) return ok({ datos: [{}], paginacion: { total: 12 } });
    if (ruta === "/api/modulos") return ok({ modulos: MODULOS.map((m) => ({ id: m, encendido: !(o.modulosApagados ?? []).includes(m) })) });
    return { estado: 404, texto: "{}", cookie: null };
  };
}

test("comprobaciones: entran los cuatro roles, ven sus datos, la interfaz se sirve y los siete módulos están encendidos", async () => {
  const c = await comprobacionesHttp(principal(), { http: sesionesFalsas(), puertoOcupado: async () => false, esperar: async () => {} }, () => "2026-10-12");
  assert.equal(c.length, 2 + 4 + 4);
  assert.deepEqual(c.filter((x) => !x.ok), []);
  assert.ok(c.some((x) => /Entra maestro/.test(x.nombre)) && c.some((x) => /Entra recepcion/.test(x.nombre)));
  assert.match(c.find((x) => /maestro ve clases/.test(x.nombre))!.detalle, /2 clases agendadas \(1 de hoy\)/);
});

test("comprobaciones: la falta de la interfaz, un módulo apagado o una contraseña distinta se ven con su motivo", async () => {
  const c = await comprobacionesHttp(principal(), { http: sesionesFalsas({ sinInterfaz: true, modulosApagados: ["tableros"], contrasenaMala: "asesor@demo.test" }), puertoOcupado: async () => false, esperar: async () => {} }, () => "2026-10-12");
  const malas = new Map(c.filter((x) => !x.ok).map((x) => [x.nombre, x.detalle]));
  assert.match([...malas].find(([n]) => /sirve la interfaz/.test(n))![1], /sin la interfaz/);
  assert.match([...malas].find(([n]) => /asesor@demo/.test(n))![1], /401/);
  assert.match([...malas].find(([n]) => /Entra administrador/.test(n))![1], /módulos apagados: tableros/);
});

test("comprobaciones: un servidor que no responde no corta la batería", async () => {
  const caido: Red = { http: async () => { throw new Error("ECONNREFUSED"); }, puertoOcupado: async () => false, esperar: async () => {} };
  const c = await comprobacionesHttp(principal(), caido, () => "x");
  assert.ok(c.length >= 10);
  assert.ok(c.every((x) => !x.ok));
  assert.match(c[0]!.detalle, /ECONNREFUSED/);
});

test("comprobaciones: el detalle de la cuadratura y del catálogo salen en una frase, no como una línea de bitácora", () => {
  assert.equal(detalleDeCuadratura('{"t":"2026-10-10T10:05:34.133Z","nivel":"info","evento":"cuadratura_ok","organizacion":"x","cargos":1750,"pagos":1235}\n'), "cuadra: 1750 cargos y 1235 pagos");
  assert.equal(detalleDeCuadratura("No hay organizaciones en esta base: no hay nada que cuadrar.\n"), "sin discrepancias");
  assert.equal(detalleDeCatalogo("Ya había datos\n✓ cuadra — cargado 1.00\n  catálogo: traslapes de edad 0 · choques de salón 0 · choques de instructor 0\n"), "traslapes de edad 0 · choques de salón 0 · choques de instructor 0");
  assert.equal(detalleDeCatalogo("nada"), "sin traslapes ni choques");
});

// ── El resumen ─────────────────────────────────────────────────────────────────────────────────────────────

test("resumen: URL, los cuatro usuarios con contraseña y qué ver, cuánto tardó y cómo repetirlo y apagarlo", () => {
  const ok: Comprobacion[] = [{ nombre: "x", ok: true, detalle: "bien" }];
  const t = resumenFinal(principal(), ok, 7 * 60_000 + 12_000);
  assert.match(t, /La demo está lista \(7 min 12 s\)/);
  assert.match(t, /http:\/\/localhost:3000/);
  assert.ok(t.includes(CONTRASENA_DE_DEMO));
  for (const u of USUARIOS_DE_DEMO) assert.ok(t.includes(u.correo) && t.includes(u.queVer), u.rol);
  assert.match(t, /Marisol Vivanco Lozano/);
  assert.match(t, /Repetirlo:\s+npm run demo:todo -- --si/);
  assert.match(t, /Apagarla:\s+npm run demo:todo -- --apagar/);
  assert.match(t, /demo:guiada/);
  assert.match(t, /Chatwoot/);
  const mal = resumenFinal(aparte(), [...ok, { nombre: "y", ok: false, detalle: "mal" }], 5000);
  assert.match(mal, /1 comprobación\(es\) fallaron \(5 s\)/);
  assert.match(mal, /http:\/\/localhost:3300/);
  assert.match(mal, /✗ y — mal/);
  assert.match(mal, /--proyecto v12demo --puerto 3300 --si/);
});

// ── El comando de verdad ───────────────────────────────────────────────────────────────────────────────────

/** Un directorio con un `docker` falso que deja una marca si alguien lo llama, puesto al frente del PATH. */
function dockerFalso(): { env: NodeJS.ProcessEnv; marca: string } {
  const dir = mkdtempSync(join(tmpdir(), "demo-todo-"));
  const marca = join(dir, "docker-llamado.txt");
  writeFileSync(join(dir, "docker"), `#!/bin/sh\necho "$@" >> "${marca}"\nexit 0\n`);
  chmodSync(join(dir, "docker"), 0o755);
  return { env: { ...process.env, PATH: `${dir}:${process.env["PATH"]}`, DEMO_CONFIRMAR: "", NODE_ENV: "development" }, marca };
}
const correr = (args: string[], env: NodeJS.ProcessEnv) => spawnSync(process.execPath, ["scripts/demo-todo.ts", ...args], { env, encoding: "utf8", timeout: 60_000 });

test("el comando SIN confirmación imprime qué borraría, sale con 2 y no llama a Docker", () => {
  const { env, marca } = dockerFalso();
  const r = correr([], env);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /BORRAR y volver a crear la demo del proyecto «inscripciones»/);
  assert.match(r.stderr, /inscripciones_postgres-data/);
  assert.match(r.stderr, /No se ejecutó nada/);
  assert.equal(existsSync(marca), false, "Docker no se llamó");
  const otro = correr(["--proyecto", "v12demo", "--puerto", "3300"], env);
  assert.equal(otro.status, 2);
  assert.match(otro.stderr, /v12demo_postgres-data/);
  assert.equal(existsSync(marca), false);
});

test("el comando con NODE_ENV=production o con una base remota a la vista se niega, aun con --si, y no llama a Docker", () => {
  const { env, marca } = dockerFalso();
  const prod = correr(["--si"], { ...env, NODE_ENV: "production" });
  assert.equal(prod.status, 2);
  assert.match(prod.stderr, /se niega a correr[\s\S]*NODE_ENV=production/);
  const remota = correr(["--si"], { ...env, DATABASE_URL: "postgresql://u:p@escuela.abc.us-east-1.rds.amazonaws.com/escuela" });
  assert.equal(remota.status, 2);
  assert.match(remota.stderr, /no es local/);
  const viaVariable = correr([], { ...env, DEMO_CONFIRMAR: "si", NODE_ENV: "production" });
  assert.equal(viaVariable.status, 2);
  assert.equal(existsSync(marca), false, "Docker no se llamó");
});

test("el comando en simulacro imprime el plan completo y no ejecuta nada (ni confirmación hace falta)", () => {
  const { env, marca } = dockerFalso();
  const r = correr(["--simulacro", "--proyecto", "v12demo", "--puerto", "3300"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Simulacro: no se ejecuta nada/);
  for (const paso of ["Revisar Docker y Node", "docker compose -p v12demo rm --stop --force backend demo-preparar postgres", "[BORRA]", "up --detach --build --wait", "demo-datos.ts --confirmar-base-de-demo", "demo-vivo.ts"]) assert.ok(r.stdout.includes(paso), paso);
  assert.equal(existsSync(marca), false);
  // El fin de la historia es un DÍA fijo (hoy en México si no se da): misma semilla y mismo día, misma historia.
  assert.match(r.stdout, /demo-datos\.ts --confirmar-base-de-demo --alumnos 300 --meses 6 --semilla 20261008 --hasta \d{4}-\d{2}-\d{2}\n/);
  assert.match(correr(["--simulacro", "--hasta", "2026-10-12"], env).stdout, /--hasta 2026-10-12\n/);
});

test("el comando rechaza un uso inválido con 2 y en español", () => {
  const { env, marca } = dockerFalso();
  const r = correr(["--proyecto", "v12demo", "--si"], env);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /necesita su propio puerto/);
  assert.equal(correr(["--apagar", "--borrar", "--si"], env).status, 2);
  assert.equal(existsSync(marca), false);
});

// ── V13-fix EV-09 / EV-37: las guardas de los guiones que escriben en la base ───────────────────────────────

const DEMO = { slug: "escuela-demo", nombre: "Escuela demo" };
const OTRA = { slug: "colegio-real", nombre: "Colegio real" };
const codigosDe = (env: Record<string, string | undefined>, o: Parameters<typeof revisarGuardasDeScript>[1]) => revisarGuardasDeScript(env, o).map((h) => h.codigo);

test("guardas de guion: producción (también «Production» o un valor desconocido), una base que no es local y una organización que no es la de la demo se rechazan", () => {
  const local = { DATABASE_URL: "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones" };
  assert.deepEqual(codigosDe(local, { organizacion: DEMO, que: "x" }), []);
  assert.deepEqual(codigosDe({ ...local, NODE_ENV: "development" }, { organizacion: DEMO, que: "x" }), []);
  for (const modo of ["production", "Production", " PRODUCTION ", "prod", "staging"]) assert.deepEqual(codigosDe({ ...local, NODE_ENV: modo }, { organizacion: DEMO, que: "x" }), ["produccion"], modo);
  for (const url of ["postgresql://u:p@127.0.0.2:5543/inscripciones", "postgresql://u:p@db.interna:5432/x", "postgresql://u:p@escuela.abc.us-east-1.rds.amazonaws.com/x", "postgresql://u:p@0.0.0.0:5432/x"]) {
    assert.deepEqual(codigosDe({ DATABASE_URL: url }, { organizacion: DEMO, que: "x" }), ["base_no_local"], url);
  }
  // La repro de la auditoría: producción + 127.0.0.2 + la bandera: ya no pasa.
  assert.deepEqual(codigosDe({ NODE_ENV: "production", DATABASE_URL: "postgresql://inscripciones:inscripciones@127.0.0.2:5543/inscripciones" }, { organizacion: DEMO, que: "x" }), ["produccion", "base_no_local"]);
  // Otra organización en la base de la demo: no. En una base de pruebas, cualquiera.
  assert.deepEqual(codigosDe(local, { organizacion: OTRA, que: "x" }), ["organizacion_no_demo"]);
  assert.deepEqual(codigosDe({ DATABASE_URL: "postgresql://u:p@localhost:5432/inscripciones_pruebas" }, { organizacion: OTRA, que: "x" }), []);
  assert.deepEqual(codigosDe({ DATABASE_URL: "postgresql://u:p@localhost:5432/otra_test" }, { organizacion: OTRA, que: "x" }), []);
});

test("guardas de guion: cargar un catálogo exige confirmar el nombre de la base, y debe coincidir", () => {
  const env = { DATABASE_URL: "postgresql://u:p@localhost:5432/inscripciones" };
  assert.deepEqual(codigosDe(env, { organizacion: DEMO, que: "x", exigirConfirmacion: true }), ["falta_confirmacion"]);
  assert.deepEqual(codigosDe(env, { organizacion: DEMO, que: "x", exigirConfirmacion: true, confirmarBase: "otra" }), ["falta_confirmacion"]);
  assert.deepEqual(codigosDe(env, { organizacion: DEMO, que: "x", exigirConfirmacion: true, confirmarBase: "inscripciones" }), []);
  assert.match(revisarGuardasDeScript(env, { que: "x", exigirConfirmacion: true })[0]!.mensaje, /--confirmar-base inscripciones/);
});
