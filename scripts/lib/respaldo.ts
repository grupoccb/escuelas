// Respaldo y restauración de la base de datos (K5). Formato custom de pg_dump (-Fc: comprimido, restaurable por partes y en paralelo), con cifrado
// opcional (AES-256-GCM, clave derivada con scrypt de una frase que NO vive en el repositorio ni en la base), suma de verificación y retención.
//
// No hace falta tener las herramientas de PostgreSQL instaladas: si `pg_dump` no está en el PATH se usan las del contenedor de Postgres local que publique el puerto de la conexión (EK-B1)
// (`docker exec`), que son de la misma versión que el servidor. En producción (AWS) el respaldo principal son los automáticos de RDS; esto es el respaldo
// LÓGICO (portátil, se puede abrir en otra versión, otra cuenta o una laptop) y se corre como tarea o desde un equipo con acceso a la base. docs/RESPALDO.md.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, openSync, closeSync, readSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { PassThrough, Transform } from "node:stream";
import pg from "pg";

const MAGIA = Buffer.from("INSCRBK1");
const LARGO_SAL = 16;
const LARGO_IV = 12;
const LARGO_ETIQUETA = 16;
const PARAMETROS_SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

export interface MetadatosDeRespaldo {
  formato: 1;
  base: string;
  creadoEn: string;
  cifrado: boolean;
  sha256: string;
  bytes: number;
  /** Cuántas filas tenía cada tabla al respaldar (para comparar después de restaurar). */
  filasPorTabla: Record<string, number>;
  migraciones: number;
}

// ── Cómo correr las herramientas de PostgreSQL ──────────────────────────────────────────────────────────

interface Conexion {
  usuario: string;
  clave: string;
  host: string;
  puerto: string;
  base: string;
}

export function leerConexion(url: string): Conexion {
  const u = new URL(url);
  return { usuario: decodeURIComponent(u.username), clave: decodeURIComponent(u.password), host: u.hostname, puerto: u.port || "5432", base: u.pathname.slice(1) };
}

function hayComando(c: string): boolean {
  return spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0;
}

/** Ejecuta `docker` y devuelve su salida (inyectable en las pruebas). */
export type EjecutarDocker = (args: string[]) => { status: number | null; stdout: string };

const ejecutarDockerReal: EjecutarDocker = (args) => {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "" };
};

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * EK-B1: el contenedor cuyas herramientas pueden atender ESTA conexión, o null. Antes se usaba siempre `inscripciones-postgres-1` en `127.0.0.1:5432` sin mirar
 * la URL: con una `DATABASE_URL` que apunta a otro servidor (otro puerto, otra máquina) respaldaba —o restauraba, con `--reemplazar` incluido— la base del
 * compose local en su lugar. Ahora: `RESPALDO_CONTENEDOR` manda si se fija (decisión explícita de quien opera); si no, solo un host local y el contenedor que
 * publica justo el puerto de la URL; un servidor remoto sin `pg_dump` instalado es un error claro.
 */
export function elegirContenedor(c: Conexion, entorno: Record<string, string | undefined> = process.env, docker: EjecutarDocker = ejecutarDockerReal): string | null {
  const fijo = entorno["RESPALDO_CONTENEDOR"];
  if (fijo) {
    const r = docker(["inspect", "-f", "{{.State.Running}}", fijo]);
    return r.status === 0 && r.stdout.trim() === "true" ? fijo : null;
  }
  if (!HOSTS_LOCALES.has(c.host)) return null;
  const r = docker(["ps", "--filter", `publish=${c.puerto}`, "--filter", "status=running", "--format", "{{.Names}}"]);
  if (r.status !== 0) return null;
  const nombres = r.stdout.split("\n").map((n) => n.trim()).filter(Boolean);
  // Ambiguo (dos contenedores publican el mismo puerto) no se adivina.
  return nombres.length === 1 ? nombres[0]! : null;
}

/** Lanza `pg_dump` / `pg_restore` con la conexión dada, localmente o dentro del contenedor. La clave va por la variable PGPASSWORD, nunca en los argumentos. */
export function lanzarHerramienta(herramienta: "pg_dump" | "pg_restore", args: string[], c: Conexion): ChildProcess {
  const entorno = { ...process.env, PGPASSWORD: c.clave };
  if (hayComando(herramienta)) return spawn(herramienta, ["-h", c.host, "-p", c.puerto, "-U", c.usuario, ...args], { env: entorno, stdio: ["pipe", "pipe", "pipe"] });
  const contenedor = elegirContenedor(c);
  if (!contenedor) {
    throw new Error(`No hay ${herramienta} instalado y ningún contenedor de Postgres local publica el puerto ${c.puerto} de la conexión (${c.host}). Instala postgresql-client, o fija RESPALDO_CONTENEDOR al contenedor de ESE servidor.`);
  }
  // Dentro del contenedor el servidor está en 127.0.0.1:5432; la clave pasa por -e (no por los argumentos).
  return spawn("docker", ["exec", "-i", "-e", "PGPASSWORD", contenedor, herramienta, "-h", "127.0.0.1", "-p", "5432", "-U", c.usuario, ...args], { env: entorno, stdio: ["pipe", "pipe", "pipe"] });
}

function esperar(proceso: ChildProcess, que: string): Promise<void> {
  return new Promise((resolver, rechazar) => {
    let errores = "";
    proceso.stderr?.on("data", (d: Buffer) => {
      if (errores.length < 4000) errores += d.toString();
    });
    proceso.on("error", rechazar);
    proceso.on("close", (codigo) => {
      if (codigo === 0) resolver();
      else rechazar(new Error(`${que} terminó con código ${codigo}: ${errores.trim().slice(0, 500)}`));
    });
  });
}

// ── Cifrado ─────────────────────────────────────────────────────────────────────────────────────────────

function derivarClave(frase: string, sal: Buffer): Buffer {
  return scryptSync(frase, sal, 32, PARAMETROS_SCRYPT);
}

/** Cifra una corriente: MAGIA | sal | iv | texto cifrado | etiqueta de 16 bytes (al final, porque GCM la conoce hasta el último byte). */
function cifrador(frase: string): { flujo: Transform; } {
  const sal = randomBytes(LARGO_SAL);
  const iv = randomBytes(LARGO_IV);
  const cifra = createCipheriv("aes-256-gcm", derivarClave(frase, sal), iv, { authTagLength: LARGO_ETIQUETA });
  let primero = true;
  const flujo = new Transform({
    transform(trozo, _c, cb) {
      const salida = cifra.update(trozo as Buffer);
      cb(null, primero ? Buffer.concat([MAGIA, sal, iv, salida]) : salida);
      primero = false;
    },
    flush(cb) {
      const final = cifra.final();
      const etiqueta = cifra.getAuthTag();
      cb(null, primero ? Buffer.concat([MAGIA, sal, iv, final, etiqueta]) : Buffer.concat([final, etiqueta]));
    },
  });
  return { flujo };
}

/** Descifra un archivo cifrado a una corriente. Una clave equivocada o un archivo alterado fallan al llegar al final (la etiqueta no cuadra). */
export function descifrarArchivo(archivo: string, frase: string): { flujo: PassThrough; terminado: Promise<void> } {
  const tam = statSync(archivo).size;
  const cabecera = LARGO_SAL + LARGO_IV;
  if (tam < MAGIA.length + cabecera + LARGO_ETIQUETA) throw new Error("El archivo no es un respaldo cifrado válido");
  const fd = openSync(archivo, "r");
  const lectura = Buffer.alloc(MAGIA.length + cabecera);
  const etiqueta = Buffer.alloc(LARGO_ETIQUETA);
  try {
    readSync(fd, lectura, 0, lectura.length, 0);
    readSync(fd, etiqueta, 0, LARGO_ETIQUETA, tam - LARGO_ETIQUETA);
  } finally {
    closeSync(fd);
  }
  if (!lectura.subarray(0, MAGIA.length).equals(MAGIA)) throw new Error("El archivo no es un respaldo cifrado de este sistema (o no está cifrado)");
  const sal = lectura.subarray(MAGIA.length, MAGIA.length + LARGO_SAL);
  const iv = lectura.subarray(MAGIA.length + LARGO_SAL);
  const descifra = createDecipheriv("aes-256-gcm", derivarClave(frase, sal), iv, { authTagLength: LARGO_ETIQUETA });
  descifra.setAuthTag(etiqueta);
  const salida = new PassThrough();
  const terminado = pipeline(createReadStream(archivo, { start: MAGIA.length + cabecera, end: tam - LARGO_ETIQUETA - 1 }), descifra, salida);
  terminado.catch((e: unknown) => salida.destroy(e instanceof Error ? e : new Error(String(e))));
  return { flujo: salida, terminado };
}

export const estaCifrado = (archivo: string): boolean => archivo.endsWith(".enc");

// ── Respaldar ───────────────────────────────────────────────────────────────────────────────────────────

export interface OpcionesDeRespaldo {
  url: string;
  directorio: string;
  /** Frase de cifrado; sin ella el respaldo va sin cifrar (solo para entornos de desarrollo). */
  frase?: string;
  /** Cuántos respaldos de esta base se conservan (los más recientes); los demás se borran. 0 o ausente = todos. */
  retener?: number;
  ahora?: Date;
}

const sello = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "-");

export async function contarFilasPorTabla(url: string): Promise<{ filas: Record<string, number>; migraciones: number }> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const tablas = (await c.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map((r) => r.tablename);
    const filas: Record<string, number> = {};
    for (const t of tablas) filas[t] = Number((await c.query<{ n: string }>(`SELECT count(*) AS n FROM "${t.replace(/"/g, '""')}"`)).rows[0]!.n);
    const migraciones = tablas.includes("_prisma_migrations") ? Number((await c.query<{ n: string }>("SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")).rows[0]!.n) : 0;
    return { filas, migraciones };
  } finally {
    await c.end();
  }
}

export async function respaldar(o: OpcionesDeRespaldo): Promise<{ archivo: string; metadatos: MetadatosDeRespaldo; borrados: string[] }> {
  const con = leerConexion(o.url);
  mkdirSync(o.directorio, { recursive: true, mode: 0o700 });
  const ahora = o.ahora ?? new Date();
  const base = `${con.base}-${sello(ahora)}.dump${o.frase ? ".enc" : ""}`;
  const final = join(o.directorio, base);
  const parcial = `${final}.parcial`;
  const antes = await contarFilasPorTabla(o.url);

  const dump = lanzarHerramienta("pg_dump", ["-Fc", "--no-owner", "--no-acl", "-d", con.base], con);
  const termino = esperar(dump, "pg_dump");
  const hash = createHash("sha256");
  const medir = new Transform({
    transform(trozo, _c, cb) {
      hash.update(trozo as Buffer);
      cb(null, trozo);
    },
  });
  const salida = createWriteStream(parcial, { mode: 0o600 });
  try {
    if (o.frase) await Promise.all([pipeline(dump.stdout!, cifrador(o.frase).flujo, medir, salida), termino]);
    else await Promise.all([pipeline(dump.stdout!, medir, salida), termino]);
  } catch (e) {
    try {
      unlinkSync(parcial);
    } catch {
      // ya no estaba
    }
    throw e;
  }
  renameSync(parcial, final);
  const metadatos: MetadatosDeRespaldo = { formato: 1, base: con.base, creadoEn: ahora.toISOString(), cifrado: Boolean(o.frase), sha256: hash.digest("hex"), bytes: statSync(final).size, filasPorTabla: antes.filas, migraciones: antes.migraciones };
  writeFileSync(`${final}.json`, JSON.stringify(metadatos, null, 2), { mode: 0o600 });
  const borrados = o.retener ? aplicarRetencion(o.directorio, con.base, o.retener) : [];
  return { archivo: final, metadatos, borrados };
}

/** Conserva los `n` respaldos más recientes de la base (por el sello del nombre) y borra los demás junto con su archivo de metadatos. */
export function aplicarRetencion(directorio: string, base: string, n: number): string[] {
  const patron = new RegExp(`^${base.replace(/[^A-Za-z0-9_]/g, "\\$&")}-\\d{8}-\\d{6}Z\\.dump(?:\\.enc)?$`);
  const existentes = readdirSync(directorio).filter((f) => patron.test(f)).sort().reverse();
  const sobran = existentes.slice(n);
  for (const f of sobran) {
    unlinkSync(join(directorio, f));
    if (existsSync(join(directorio, `${f}.json`))) unlinkSync(join(directorio, `${f}.json`));
  }
  return sobran;
}

/** Comprueba que un respaldo no se alteró desde que se hizo (suma de verificación) y, si está cifrado, que la frase lo abre. */
export async function verificarRespaldo(archivo: string, frase?: string): Promise<MetadatosDeRespaldo> {
  const meta = JSON.parse(readFileSync(`${archivo}.json`, "utf8")) as MetadatosDeRespaldo;
  const hash = createHash("sha256");
  for await (const t of createReadStream(archivo)) hash.update(t as Buffer);
  if (hash.digest("hex") !== meta.sha256) throw new Error(`El respaldo ${basename(archivo)} no coincide con su suma de verificación: está alterado o incompleto`);
  if (meta.cifrado) {
    if (!frase) throw new Error("El respaldo está cifrado: falta la frase (RESPALDO_CLAVE)");
    const { flujo, terminado } = descifrarArchivo(archivo, frase);
    flujo.resume();
    await terminado;
  }
  return meta;
}

// ── Restaurar ───────────────────────────────────────────────────────────────────────────────────────────

export interface OpcionesDeRestauracion {
  archivo: string;
  /** URL de la base DESTINO (puede no existir todavía: se crea). */
  urlDestino: string;
  frase?: string;
  /** Permite restaurar sobre una base que ya tiene tablas (la borra y la crea de nuevo). */
  reemplazar?: boolean;
}

export async function restaurar(o: OpcionesDeRestauracion): Promise<{ base: string; filasPorTabla: Record<string, number>; migraciones: number }> {
  const destino = leerConexion(o.urlDestino);
  if (!/^[a-z_][a-z0-9_]*$/.test(destino.base)) throw new Error(`Nombre de base inválido: ${destino.base}`);
  const cifrado = estaCifrado(o.archivo);
  if (cifrado && !o.frase) throw new Error("El respaldo está cifrado: falta la frase (RESPALDO_CLAVE)");

  const admin = new pg.Client({ connectionString: o.urlDestino.replace(/\/[^/?]*(\?|$)/, "/postgres$1") });
  await admin.connect();
  try {
    const existe = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [destino.base])).rowCount;
    if (existe) {
      const prueba = new pg.Client({ connectionString: o.urlDestino });
      await prueba.connect();
      const tablas = Number((await prueba.query<{ n: string }>("SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public'")).rows[0]!.n);
      await prueba.end();
      if (tablas > 0 && !o.reemplazar) throw new Error(`La base «${destino.base}» ya tiene ${tablas} tablas. Restaura en una base nueva o usa --reemplazar si de verdad quieres borrarla.`);
      if (tablas > 0) {
        await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [destino.base]);
        await admin.query(`DROP DATABASE "${destino.base}"`);
        await admin.query(`CREATE DATABASE "${destino.base}"`);
      }
    } else {
      await admin.query(`CREATE DATABASE "${destino.base}"`);
    }
  } finally {
    await admin.end();
  }

  // --no-owner/--no-acl: lo restaura quien lo pide, sin depender de que existan las cuentas del origen. La cuenta de la aplicación se vuelve a preparar
  // con scripts/preparar-roles.ts. --exit-on-error: un respaldo a medias no deja una base a medias en silencio.
  const restaura = lanzarHerramienta("pg_restore", ["--no-owner", "--no-acl", "--exit-on-error", "-d", destino.base], destino);
  const termino = esperar(restaura, "pg_restore");
  if (cifrado) {
    const { flujo, terminado } = descifrarArchivo(o.archivo, o.frase!);
    await Promise.all([pipeline(flujo, restaura.stdin!), terminado, termino]);
  } else {
    await Promise.all([pipeline(createReadStream(o.archivo), restaura.stdin!), termino]);
  }
  const { filas, migraciones } = await contarFilasPorTabla(o.urlDestino);
  return { base: destino.base, filasPorTabla: filas, migraciones };
}
