// Contraseñas: hash con `scrypt` de node:crypto (sin dependencias), sal propia por usuario,
// comparación en tiempo constante y política mínima.
//
// Formato guardado (una sola cadena, con sus propios parámetros, para poder subirlos después sin
// invalidar lo anterior):
//
//   scrypt$N$r$p$<sal base64url>$<hash base64url>
//
// Parámetros por defecto: N = 2^15, r = 8, p = 3 → 32 MiB de memoria y unas decenas de ms por
// verificación. Es una de las combinaciones equivalentes que recomienda OWASP (Password Storage
// Cheat Sheet: scrypt con N=2^15, r=8, p=3) cuando no se pueden usar 128 MiB por verificación.
// Los tests usan `PARAMETROS_PRUEBA` (baratos) pasándolos explícitamente; el hash guardado
// recuerda los suyos, así que verificar nunca depende de la configuración actual.
//
// No se normaliza el correo aquí ni se registra nunca una contraseña: esta función es lo único que
// la toca. Se normaliza a NFKC para que el mismo texto escrito con otra composición Unicode entre.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface ParametrosScrypt {
  N: number;
  r: number;
  p: number;
}

export const PARAMETROS_POR_DEFECTO: ParametrosScrypt = { N: 32768, r: 8, p: 3 };
/** Solo para tests: rápidos y NO seguros. */
export const PARAMETROS_PRUEBA: ParametrosScrypt = { N: 1024, r: 8, p: 1 };

const LONGITUD_SAL = 16;
const LONGITUD_HASH = 32;
/** Cotas de lo que se acepta leer de la base: un hash con parámetros absurdos no debe agotar la memoria. */
const N_MIN = 1024;
const N_MAX = 1 << 20;
const R_MAX = 32;
const P_MAX = 16;

export const LONGITUD_MINIMA_CONTRASENA = 10;
export const LONGITUD_MAXIMA_CONTRASENA = 128;

let derivaciones = 0;
/**
 * Cuántas derivaciones de scrypt (el trabajo caro) ha hecho el proceso. Sirve a los tests para
 * comprobar que el login hace el MISMO trabajo exista o no el usuario (EB-12): se mide la diferencia
 * antes y después de un intento.
 */
export const derivacionesHechas = (): number => derivaciones;

function derivar(contrasena: string, sal: Buffer, { N, r, p }: ParametrosScrypt): Promise<Buffer> {
  derivaciones++;
  return new Promise((resolver, rechazar) => {
    // maxmem: scrypt usa 128·N·r bytes; el tope por defecto de node (32 MiB) no alcanza para N = 2^15.
    scrypt(contrasena.normalize("NFKC"), sal, LONGITUD_HASH, { N, r, p, maxmem: 256 * N * r }, (error, clave) => {
      if (error) rechazar(error);
      else resolver(clave);
    });
  });
}

/** Hash de una contraseña con sal nueva. Lanza si los parámetros son inválidos. */
export async function hashContrasena(contrasena: string, parametros: ParametrosScrypt = PARAMETROS_POR_DEFECTO): Promise<string> {
  validarParametros(parametros);
  const sal = randomBytes(LONGITUD_SAL);
  const clave = await derivar(contrasena, sal, parametros);
  const { N, r, p } = parametros;
  return `scrypt$${N}$${r}$${p}$${sal.toString("base64url")}$${clave.toString("base64url")}`;
}

function validarParametros({ N, r, p }: ParametrosScrypt): void {
  const potenciaDeDos = Number.isInteger(N) && N >= N_MIN && N <= N_MAX && (N & (N - 1)) === 0;
  if (!potenciaDeDos || !Number.isInteger(r) || r < 1 || r > R_MAX || !Number.isInteger(p) || p < 1 || p > P_MAX) {
    throw new Error("Parámetros de scrypt fuera de rango");
  }
}

interface HashLeido {
  parametros: ParametrosScrypt;
  sal: Buffer;
  clave: Buffer;
}

function leerHash(hash: string): HashLeido | null {
  const partes = hash.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return null;
  const [, n, r, p, sal, clave] = partes as [string, string, string, string, string, string];
  const parametros = { N: Number(n), r: Number(r), p: Number(p) };
  try {
    validarParametros(parametros);
  } catch {
    return null;
  }
  const salBuf = Buffer.from(sal, "base64url");
  const claveBuf = Buffer.from(clave, "base64url");
  if (salBuf.length < 8 || claveBuf.length !== LONGITUD_HASH) return null;
  return { parametros, sal: salBuf, clave: claveBuf };
}

/**
 * ¿Coincide la contraseña con el hash guardado? Comparación en tiempo constante. Un hash ilegible
 * (no debería existir) se rechaza gastando el mismo trabajo que uno bueno, para no distinguirse.
 */
export async function verificarContrasena(contrasena: string, hashGuardado: string): Promise<boolean> {
  const leido = leerHash(hashGuardado);
  if (!leido) {
    await verificarContrasenaFicticia(contrasena);
    return false;
  }
  const calculada = await derivar(contrasena, leido.sal, leido.parametros);
  return calculada.length === leido.clave.length && timingSafeEqual(calculada, leido.clave);
}

let ficticio: Promise<string> | undefined;

/**
 * Hash de una contraseña que nadie conoce, con los parámetros por defecto. El login lo verifica
 * cuando el usuario no existe (o está inactivo) para que tardar lo mismo no delate qué correos hay.
 */
export function hashFicticio(): Promise<string> {
  ficticio ??= hashContrasena(randomBytes(24).toString("base64url"));
  return ficticio;
}

/** Gasta el mismo trabajo que verificar una contraseña real. Siempre es falso. */
export async function verificarContrasenaFicticia(contrasena: string): Promise<boolean> {
  const leido = leerHash(await hashFicticio());
  if (leido) await derivar(contrasena, leido.sal, leido.parametros);
  return false;
}

/** Contraseñas de 10 o más caracteres que son de las más usadas (o las de la demo, públicas): la política las rechaza aunque cumplan el largo (K3, EB-20). */
const CONTRASENAS_COMUNES = new Set([
  "1234567890", "12345678910", "0123456789", "123456789a", "abc1234567", "11111111111", "1q2w3e4r5t", "qwertyuiop", "qwerty12345", "qwerty123456", "asdfghjkl1",
  "password12", "password123", "password1234", "passw0rd123", "contrasena1", "contrasena12", "contrasena123", "contrasena2026", "iloveyou123",
  "administrador", "administrador1", "administrador123", "bienvenido1", "bienvenido123", "bienvenido2026", "escuela12345", "inscripciones", "inscripciones1", "inscripciones123",
  "demo-local-2026!",
]);

/**
 * Política mínima: de 10 a 128 caracteres, que no sea de las más comunes, sin ser el correo ni el nombre del usuario, y con algo
 * más que un solo carácter repetido. Devuelve los problemas en español (vacío = cumple).
 */
export function problemasDeContrasena(contrasena: string, contexto: { correo?: string; nombre?: string } = {}): string[] {
  const problemas: string[] = [];
  const normal = contrasena.normalize("NFKC");
  if (normal.length < LONGITUD_MINIMA_CONTRASENA) problemas.push(`La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`);
  if (normal.length > LONGITUD_MAXIMA_CONTRASENA) problemas.push(`La contraseña no puede pasar de ${LONGITUD_MAXIMA_CONTRASENA} caracteres`);
  const minuscula = normal.toLowerCase();
  if (contexto.correo && minuscula === contexto.correo.toLowerCase()) problemas.push("La contraseña no puede ser el correo");
  if (contexto.nombre && contexto.nombre.trim() !== "" && minuscula === contexto.nombre.trim().toLowerCase()) {
    problemas.push("La contraseña no puede ser el nombre");
  }
  if (normal.length >= LONGITUD_MINIMA_CONTRASENA && new Set(normal).size < 3) problemas.push("La contraseña es demasiado simple");
  if (CONTRASENAS_COMUNES.has(minuscula)) problemas.push("Esa contraseña es de las más usadas: elige otra");
  return problemas;
}
