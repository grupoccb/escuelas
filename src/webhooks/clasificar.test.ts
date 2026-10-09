// WH: la clasificación de errores es UNA función (clasificarError). Esta prueba fija qué es del momento (5xx, el proveedor reintenta) y qué es un dato
// inesperado (constancia + tarea + 2xx), con los errores REALES que producen Prisma y el adaptador de Postgres, y que el detalle nunca arrastra datos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarError, detalleSeguro } from "./clasificar.ts";
import { ErrorTransitorio } from "../lib/transitorio.ts";
import { BandejaSinAprovisionar } from "../mensajeria/provider.ts";

/** Un error con la forma de los de Prisma 7 + el adaptador de pg: código de Prisma, y el SQLSTATE dentro de `meta.driverAdapterError.cause`. */
function deBase(nombre: string, codigo: string, sqlstate?: string, mensaje = "x"): Error {
  const e = new Error(mensaje);
  e.name = nombre;
  return Object.assign(e, { code: codigo, meta: sqlstate ? { driverAdapterError: { name: "DriverAdapterError", cause: { originalCode: sqlstate, kind: "postgres" } } } : {} });
}

test("WH: son del MOMENTO (5xx, el proveedor reintenta): base inalcanzable, tiempos agotados, interbloqueo, serialización, conexión rota, contención agotada", () => {
  const transitorios: [string, unknown][] = [
    ["P1001 no se alcanza la base", deBase("PrismaClientInitializationError", "P1001")],
    ["P1002", deBase("PrismaClientKnownRequestError", "P1002")],
    ["P1008", deBase("PrismaClientKnownRequestError", "P1008")],
    ["P1017 el servidor cerró la conexión", deBase("PrismaClientKnownRequestError", "P1017")],
    ["P2024 tiempo agotado esperando una conexión del pool", deBase("PrismaClientKnownRequestError", "P2024", undefined, "Timed out fetching a new connection from the connection pool")],
    ["P2028 transacción", deBase("PrismaClientKnownRequestError", "P2028")],
    ["P2034 conflicto de escritura o interbloqueo", deBase("PrismaClientKnownRequestError", "P2034")],
    ["interbloqueo 40P01 dentro de otro código", deBase("PrismaClientKnownRequestError", "P2010", "40P01")],
    ["fallo de serialización 40001", deBase("PrismaClientKnownRequestError", "P2010", "40001")],
    ["la base se apaga 57P01", deBase("PrismaClientKnownRequestError", "P2010", "57P01")],
    ["demasiadas conexiones 53300 (clase 53)", deBase("PrismaClientKnownRequestError", "P2010", "53300")],
    ["conexión (clase 08)", deBase("PrismaClientKnownRequestError", "P2010", "08006")],
    ["consulta cancelada por tiempo 57014", deBase("PrismaClientKnownRequestError", "P2010", "57014")],
    ["ECONNREFUSED de Node", Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" })],
    ["ETIMEDOUT dentro de la causa", Object.assign(new Error("fallo"), { cause: Object.assign(new Error("x"), { code: "ETIMEDOUT" }) })],
    ["por el texto: no se alcanza el servidor", new Error("Can't reach database server at `db:5432`")],
    ["por el texto: interbloqueo", new Error("deadlock detected")],
    ["por el texto: conexión terminada", new Error("Connection terminated unexpectedly")],
    ["contención agotada tras reintentar (ErrorTransitorio)", new ErrorTransitorio("la versión no cede")],
  ];
  for (const [nombre, error] of transitorios) assert.equal(clasificarError(error).clase, "transitorio", nombre);
});

test("WH: son DATOS INESPERADOS (constancia + tarea + 2xx), con su causa: NUL, restricción, registro inexistente, valor fuera de rango, tipos, bandeja sin aprovisionar, error propio", () => {
  const casos: [string, unknown, string][] = [
    ["texto con NUL (22021 dentro de P2039)", deBase("PrismaClientKnownRequestError", "P2039", "22021", "invalid byte sequence for encoding UTF8: 0x00"), "texto_con_nul"],
    ["NUL por el texto", new Error('invalid byte sequence for encoding "UTF8": 0x00'), "texto_con_nul"],
    ["único P2002", deBase("PrismaClientKnownRequestError", "P2002"), "restriccion_base"],
    ["llave foránea P2003", deBase("PrismaClientKnownRequestError", "P2003", "23503"), "restriccion_base"],
    ["restricción CHECK 23514", deBase("PrismaClientKnownRequestError", "P2010", "23514"), "restriccion_base"],
    ["nulo donde no debe P2011", deBase("PrismaClientKnownRequestError", "P2011"), "restriccion_base"],
    ["registro inexistente P2025", deBase("PrismaClientKnownRequestError", "P2025"), "registro_inexistente"],
    ["valor demasiado largo P2000", deBase("PrismaClientKnownRequestError", "P2000"), "dato_invalido"],
    ["fuera de rango P2020", deBase("PrismaClientKnownRequestError", "P2020", "22003"), "dato_invalido"],
    ["uuid mal formado 22P02", deBase("PrismaClientKnownRequestError", "P2007", "22P02"), "dato_invalido"],
    ["tipo incorrecto (validación de Prisma)", Object.assign(new Error("Invalid `prisma.x.create()` invocation: Argument `nombre`: Invalid value provided. Expected String, provided Int."), { name: "PrismaClientValidationError" }), "dato_invalido"],
    ["bandeja sin aprovisionar", new BandejaSinAprovisionar("La bandeja de la conversación 1 no está aprovisionada"), "bandeja_sin_aprovisionar"],
    ["un error propio cualquiera", new TypeError("Cannot read properties of undefined"), "error_interno"],
    ["algo que ni es un Error", "texto suelto", "error_interno"],
    ["undefined", undefined, "error_interno"],
  ];
  for (const [nombre, error, causa] of casos) {
    const c = clasificarError(error);
    assert.equal(c.clase, "inesperado", nombre);
    assert.equal(c.clase === "inesperado" ? c.causa : null, causa, nombre);
  }
});

test("WH: el detalle es seguro — la clase y el código, nunca los valores (nombres, teléfonos, uuids citados) ni saltos de línea", () => {
  const mensaje = 'invalid input syntax for type uuid: "María López +5215512345678"\nDETAIL: Key (telefono)=(+5215512345678) already exists.';
  const detalle = detalleSeguro(Object.assign(new Error(mensaje), { code: "22P02" }));
  for (const prohibido of ["María", "López", "5215512345678", "\n", "DETAIL"]) assert.ok(!detalle.includes(prohibido), `no debe llevar «${prohibido}»: ${detalle}`);
  // Prisma: su mensaje es la invocación entera con los datos; solo el nombre y el código.
  const prisma = Object.assign(new Error('Invalid `prisma.lead.create()` invocation:\n data: { telefono: "+5215512345678", nombre_contacto: "Ana" }'), { name: "PrismaClientKnownRequestError", code: "P2002" });
  const d2 = detalleSeguro(prisma);
  assert.equal(d2, "PrismaClientKnownRequestError P2002");
  assert.ok(detalleSeguro(new Error("x".repeat(5000))).length <= 200);
  assert.ok(!detalleSeguro(new Error("tel +52 55 1234 5678 y 5512345678")).match(/\d{6}/), "las cifras largas se enmascaran");
});

test("WH: la clasificación es la misma que ven las rutas — un error con NUL en el mensaje y en la cadena de causas no se confunde con una falla del momento", () => {
  const anidado = Object.assign(new Error("fallo"), { cause: Object.assign(new Error("interno"), { code: "22021" }) });
  assert.deepEqual(clasificarError(anidado).clase, "inesperado");
  const profundo = Object.assign(new Error("fallo"), { cause: Object.assign(new Error("interno"), { cause: Object.assign(new Error("hondo"), { code: "40P01" }) }) });
  assert.equal(clasificarError(profundo).clase, "transitorio");
});

// ── EG-01: lo que antes se perdía (una falla del momento tomada por un dato) y lo que se reintentaba sin fin (un dato tomado por una falla) ──

/** Un error con la forma de los de undici (`fetch failed` con la causa de red). */
const deRed = (codigo: string, mensaje = "x"): Error => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(mensaje), { code: codigo }) });
const llamado = (nombre: string, mensaje = "x"): Error => Object.assign(new Error(mensaje), { name: nombre });

test("EG-01: son del MOMENTO también las fallas que `pg`, undici y Prisma dan sin código de Postgres (una conexión matada, un failover, una lectura agotada)", () => {
  const transitorios: [string, unknown][] = [
    ["conexión matada (pg_terminate_backend, failover)", new Error("Client has encountered a connection error and is not queryable")],
    ["cliente cerrado", new Error("Client was closed and is not queryable")],
    ["conexión terminada sin avisar", new Error("Connection ended unexpectedly")],
    ["lectura de la consulta agotada", new Error("Query read timeout")],
    ["TLS cortado antes de empezar", new Error("Client network socket disconnected before secure TLS connection was established")],
    ["socket hang up", new Error("socket hang up")],
    ["ECONNRESET sin código", new Error("read ECONNRESET")],
    ["EPIPE sin código", new Error("write EPIPE")],
    ["EAI_AGAIN sin código", new Error("getaddrinfo EAI_AGAIN db")],
    ["demasiadas conexiones de Prisma (P2037)", deBase("PrismaClientKnownRequestError", "P2037")],
    ["un error de Prisma que trae `errorCode` en vez de `code` (P1008)", Object.assign(new Error("x"), { errorCode: "P1008" })],
    ["el motor de Prisma se cayó", llamado("PrismaClientRustPanicError", "panic")],
    ["base de solo lectura (failover a una réplica) 25006", deBase("PrismaClientKnownRequestError", "P2010", "25006")],
    ["transacción ociosa cancelada 25P03", deBase("PrismaClientKnownRequestError", "P2010", "25P03")],
    ["credenciales rotadas o mal puestas (clase 28)", deBase("PrismaClientKnownRequestError", "P2010", "28P01")],
    ["la base no existe 3D000", deBase("PrismaClientKnownRequestError", "P2010", "3D000")],
    ["migración pendiente: la tabla no existe 42P01", deBase("PrismaClientKnownRequestError", "P2010", "42P01")],
    ["migración pendiente: la columna no existe 42703", deBase("PrismaClientKnownRequestError", "P2010", "42703")],
    ["AbortError (el reenvío se agotó)", llamado("AbortError", "This operation was aborted")],
    ["TimeoutError", llamado("TimeoutError", "The operation was aborted due to timeout")],
    ["undici: conexión agotada", deRed("UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error")],
    ["undici: cabeceras agotadas", deRed("UND_ERR_HEADERS_TIMEOUT")],
    ["undici: socket cerrado por el otro lado", deRed("UND_ERR_SOCKET", "other side closed")],
    ["sin memoria", Object.assign(new Error("spawn ENOMEM"), { code: "ENOMEM" })],
    ["demasiados archivos abiertos", Object.assign(new Error("x"), { code: "EMFILE" })],
  ];
  for (const [nombre, error] of transitorios) assert.equal(clasificarError(error).clase, "transitorio", nombre);
});

test("EG-01: lo que es del DATO sigue siendo inesperado aunque su mensaje cite texto que parece una falla de la base (lo escribió una persona)", () => {
  const frases = ["Can't reach database server at db:5432", "connection terminated unexpectedly", "deadlock detected", "timeout exceeded when trying to connect", "Client has encountered a connection error and is not queryable", "read ECONNRESET"];
  for (const frase of frases) {
    const citado = (e: Error) => e;
    const casos: [string, Error, string][] = [
      ["validación de Prisma que cita el valor", citado(Object.assign(new Error(`Invalid \`prisma.campana.create()\` invocation: nombre: { frase: "${frase}" } Expected String`), { name: "PrismaClientValidationError" })), "dato_invalido"],
      ["uuid mal formado que cita el valor (P2023)", deBase("PrismaClientKnownRequestError", "P2023", undefined, `Inconsistent column data: invalid input syntax for type uuid: "${frase}"`), "dato_invalido"],
      ["consulta cruda con un valor inválido (22P02)", deBase("PrismaClientKnownRequestError", "P2010", "22P02", `invalid input syntax for type uuid: "${frase}"`), "dato_invalido"],
      ["fuera de rango (P2020)", deBase("PrismaClientKnownRequestError", "P2020", undefined, `Value out of range for the type: "${frase}"`), "dato_invalido"],
      ["único violado que cita el valor (P2002)", deBase("PrismaClientKnownRequestError", "P2002", undefined, `Unique constraint failed: ${frase}`), "restriccion_base"],
      ["CHECK violado que cita el valor (23514)", deBase("PrismaClientKnownRequestError", "P2010", "23514", `new row violates check constraint: ${frase}`), "restriccion_base"],
    ];
    for (const [nombre, error, causa] of casos) {
      const c = clasificarError(error);
      assert.deepEqual([c.clase, c.clase === "inesperado" ? c.causa : null], ["inesperado", causa], `${nombre} · «${frase}»`);
    }
  }
  // Sin ninguna señal de dato, el texto sigue decidiendo (lo real de la red y de la base): P2010 con «N/A» y el mensaje de Prisma.
  assert.equal(clasificarError(deBase("PrismaClientKnownRequestError", "P2010", undefined, "Raw query failed. Code: `N/A`. Message: `Can't reach database server at 127.0.0.1:1`")).clase, "transitorio");
});
