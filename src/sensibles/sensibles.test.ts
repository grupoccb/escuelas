import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { randomBytes } from "node:crypto";
import { log, redactar } from "../lib/log.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { CAMPOS_SENSIBLES, esClaveSecreta, esClaveSensible, normalizarNombre } from "./campos.ts";
import { crearCifrador, cifradorDesdeEntorno, ErrorCifrado } from "./cifrado.ts";
import { REDACTADO, Sensible } from "./marca.ts";

const CENTINELA = "CENTINELA-alergia-penicilina-4f2a";

test("los nombres sensibles se reconocen en snake_case, camelCase, con acento y en variantes", () => {
  for (const c of [...CAMPOS_SENSIBLES, "alergia", "alergiasGraves", "condicionesMedicas", "medicamento", "contactoEmergenciaTelefono", "Autorización_Atención_Médica", "tipoSangre", "observaciones_medicas", "ficha_salud"]) {
    assert.equal(esClaveSensible(c), true, c);
  }
  for (const c of ["nombre", "edad", "telefono", "sucursal", "motivo", "informacion", "contacto"]) assert.equal(esClaveSensible(c), false, c);
  for (const c of ["contrasena", "contrasena_hash", "token", "api_access_token", "Authorization", "cookie", "secretoWebhook"]) assert.equal(esClaveSecreta(c), true, c);
  assert.equal(normalizarNombre("condicionesMédicas"), "condiciones_medicas");
});

test("redactar: claves sensibles y secretas a cualquier profundidad, dentro de arreglos y con valores Sensible", () => {
  const entrada = {
    ok: "visible",
    alergias: CENTINELA,
    anidado: { medicamentos: CENTINELA, lista: [{ contactoEmergencia: CENTINELA, nombre: "Ana" }] },
    marcado: new Sensible(CENTINELA),
    contrasena: "hunter2",
    token: "abc",
  };
  const r = redactar(entrada) as Record<string, unknown>;
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes(CENTINELA) && !texto.includes("hunter2") && !texto.includes("abc"));
  assert.equal(r["ok"], "visible");
  assert.equal(r["alergias"], REDACTADO);
  assert.equal(r["marcado"], REDACTADO);
  assert.equal((((r["anidado"] as Record<string, unknown>)["lista"]) as { nombre: string }[])[0]!.nombre, "Ana");
  assert.equal(entrada.alergias, CENTINELA, "no muta el original");
});

test("redactar: ciclos y profundidad no cuelgan ni rompen", () => {
  const a: Record<string, unknown> = { x: 1 };
  a["yo"] = a;
  assert.equal((redactar(a) as Record<string, unknown>)["yo"], "[CICLO]");
  let hondo: Record<string, unknown> = { fin: CENTINELA };
  for (let i = 0; i < 20; i++) hondo = { n: hondo };
  assert.ok(!JSON.stringify(redactar(hondo)).includes(CENTINELA));
});

test("log.*: lo sensible sale como [REDACTADO] en la línea que se escribe", () => {
  const c = colectarLogs();
  try {
    log.info("evento", { alergias: CENTINELA, detalle: { medicamentos: CENTINELA }, ok: 1, valor: new Sensible(CENTINELA) });
    log.error("fallo", { condiciones_medicas: CENTINELA, error: "x" });
    log.warn("aviso", { contrasena: "hunter2" });
  } finally {
    c.detener();
  }
  assert.equal(c.lineas.length, 3);
  assert.ok(!c.texto().includes(CENTINELA) && !c.texto().includes("hunter2"));
  assert.equal(JSON.parse(c.lineas[0]!)["alergias"], REDACTADO);
  assert.equal(JSON.parse(c.lineas[0]!)["ok"], 1);
});

test("Sensible: JSON, texto, plantillas, util.inspect y console.log lo ocultan; solo revelar() lo muestra", () => {
  const s = new Sensible({ nota: CENTINELA });
  assert.equal(JSON.stringify({ s }), `{"s":"${REDACTADO}"}`);
  assert.equal(String(s), REDACTADO);
  assert.equal(`${s as unknown as string}`, REDACTADO);
  assert.equal(inspect(s), REDACTADO);
  assert.equal(inspect({ dentro: s }), `{ dentro: ${REDACTADO} }`);
  assert.ok(!Object.keys(s).length && !JSON.stringify(Object.getOwnPropertyNames(s)).includes("nota"));
  assert.equal(s.revelar().nota, CENTINELA);
});

test("cifrado: ida y vuelta, IV distinto cada vez, ligado a su lugar y a prueba de alteraciones", () => {
  const c = crearCifrador(randomBytes(32));
  const a = c.cifrar("dato", "org|prospecto|1|alergias");
  const b = c.cifrar("dato", "org|prospecto|1|alergias");
  assert.notEqual(a, b);
  assert.ok(!a.includes("dato"));
  assert.equal(c.descifrar(a, "org|prospecto|1|alergias"), "dato");
  assert.throws(() => c.descifrar(a, "org|prospecto|2|alergias"), ErrorCifrado, "otro sujeto");
  assert.throws(() => c.descifrar(a, "otra|prospecto|1|alergias"), ErrorCifrado, "otra organización");
  assert.throws(() => c.descifrar(a, "org|prospecto|1|medicamentos"), ErrorCifrado, "otro campo");
  const partes = a.split(".");
  partes[3] = Buffer.from("alterado").toString("base64url");
  assert.throws(() => c.descifrar(partes.join("."), "org|prospecto|1|alergias"), ErrorCifrado);
  assert.throws(() => crearCifrador(randomBytes(32)).descifrar(a, "org|prospecto|1|alergias"), ErrorCifrado, "otra clave");
  assert.throws(() => crearCifrador(Buffer.alloc(16)), ErrorCifrado);
  assert.throws(() => c.descifrar("basura", "x"), ErrorCifrado);
});

test("cifrador del entorno: con clave la usa; sin clave en producción se niega; sin clave fuera de producción usa la de desarrollo con aviso", () => {
  const clave = randomBytes(32).toString("base64");
  const con = cifradorDesdeEntorno({ CLAVE_DATOS_SENSIBLES: clave });
  assert.equal(con.descifrar(con.cifrar("x", "a"), "a"), "x");
  assert.throws(() => cifradorDesdeEntorno({ NODE_ENV: "production" }), /CLAVE_DATOS_SENSIBLES/);
  const c = colectarLogs();
  try {
    const dev = cifradorDesdeEntorno({});
    assert.equal(dev.descifrar(dev.cifrar("x", "a"), "a"), "x");
  } finally {
    c.detener();
  }
  assert.match(c.texto(), /sensibles_clave_de_desarrollo/);
});
