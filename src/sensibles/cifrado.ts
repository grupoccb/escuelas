// Cifrado de los campos de salud: AES-256-GCM con la clave de la variable de entorno
// `CLAVE_DATOS_SENSIBLES` (32 bytes en base64: `openssl rand -base64 32`).
//
// Cada valor se cifra con un IV aleatorio y se LIGA a su lugar mediante datos asociados
// (organización | sujeto | campo): un texto cifrado copiado a otra fila, campo u organización no
// descifra. Etiqueta GCM de 16 bytes, exigida (una más corta no se acepta, EB-15).
//
// Formato guardado: `v2.<kid>.<iv>.<etiqueta>.<texto>` (base64url). `kid` identifica LA CLAVE con la
// que se cifró (los 6 primeros bytes del SHA-256 de la clave: no revela nada de ella). Sirve para
// rotar (EB-07): se pone la clave nueva en `CLAVE_DATOS_SENSIBLES` y la anterior en
// `CLAVES_DATOS_SENSIBLES_ANTERIORES` (separadas por comas); lo viejo se sigue leyendo y lo nuevo
// se escribe con la clave nueva. Un `kid` que ninguna clave configurada reconoce da un error claro
// (no se confunde con «dato alterado»). El formato anterior `v1.<iv>.<etiqueta>.<texto>` (sin kid)
// se sigue leyendo con las claves configuradas.
//
// Sin clave el backend se NIEGA a cifrar, salvo que `NODE_ENV` sea `development` o `test`
// EXPLÍCITAMENTE: ahí usa una clave FIJA pública del repositorio (con un aviso) para que la demo y
// los tests funcionen. Un arranque sin `NODE_ENV` (staging, una VM) ya no cifra datos reales de
// menores con una clave que cualquiera puede leer (EB-07).
//
// Límite honesto: la clave vive en el entorno del backend. Quien tenga el entorno puede leer los datos;
// esto protege contra un volcado de la base, no contra el servidor comprometido. No hay un trabajo
// que re-cifre en lote lo viejo con la clave nueva: lo viejo se reescribe cuando se vuelve a guardar.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { log } from "../lib/log.ts";

export class ErrorCifrado extends Error {}

export interface Cifrador {
  cifrar(texto: string, aad: string): string;
  descifrar(guardado: string, aad: string): string;
  /** Identificador de la clave con la que se cifra ahora. */
  readonly kid: string;
}

const LONGITUD_ETIQUETA = 16;

/** Identificador no secreto de una clave: 6 bytes del SHA-256, en base64url. */
export function kidDe(clave: Buffer): string {
  return createHash("sha256").update(clave).digest().subarray(0, 6).toString("base64url");
}

function comprobarClave(clave: Buffer): void {
  if (clave.length !== 32) throw new ErrorCifrado("La clave de datos sensibles debe ser de 32 bytes");
}

export function crearCifrador(clave: Buffer, opciones: { anteriores?: readonly Buffer[] } = {}): Cifrador {
  comprobarClave(clave);
  const kid = kidDe(clave);
  const llavero = new Map<string, Buffer>([[kid, clave]]);
  for (const vieja of opciones.anteriores ?? []) {
    comprobarClave(vieja);
    llavero.set(kidDe(vieja), vieja);
  }

  const abrir = (llave: Buffer, iv: string, etiqueta: string, cifrado: string, aad: string): string => {
    try {
      const tag = Buffer.from(etiqueta, "base64url");
      if (tag.length !== LONGITUD_ETIQUETA) throw new Error("etiqueta de longitud inválida");
      const d = createDecipheriv("aes-256-gcm", llave, Buffer.from(iv, "base64url"), { authTagLength: LONGITUD_ETIQUETA });
      d.setAAD(Buffer.from(aad, "utf8"));
      d.setAuthTag(tag);
      return Buffer.concat([d.update(Buffer.from(cifrado, "base64url")), d.final()]).toString("utf8");
    } catch {
      // Clave equivocada, dato alterado o copiado a otro lugar: no se dice cuál.
      throw new ErrorCifrado("No se pudo descifrar el dato");
    }
  };

  return {
    kid,
    cifrar(texto, aad) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", clave, iv, { authTagLength: LONGITUD_ETIQUETA });
      c.setAAD(Buffer.from(aad, "utf8"));
      const cifrado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
      return ["v2", kid, iv.toString("base64url"), c.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
    },
    descifrar(guardado, aad) {
      const partes = guardado.split(".");
      if (partes[0] === "v2" && partes.length === 5) {
        const [, id = "", iv = "", etiqueta = "", cifrado = ""] = partes;
        const llave = llavero.get(id);
        if (!llave) throw new ErrorCifrado(`El dato se cifró con una clave que no está configurada (kid ${id}): agrega la anterior a CLAVES_DATOS_SENSIBLES_ANTERIORES`);
        return abrir(llave, iv, etiqueta, cifrado, aad);
      }
      if (partes[0] === "v1" && partes.length === 4) {
        // Formato sin kid: se prueba con cada clave configurada (la actual primero).
        const [, iv = "", etiqueta = "", cifrado = ""] = partes;
        for (const llave of llavero.values()) {
          try {
            return abrir(llave, iv, etiqueta, cifrado, aad);
          } catch {
            // probar con la siguiente
          }
        }
        throw new ErrorCifrado("No se pudo descifrar el dato");
      }
      throw new ErrorCifrado("Formato de dato cifrado desconocido");
    },
  };
}

/** Clave de desarrollo, pública a propósito: nunca protege nada. */
const CLAVE_DE_DESARROLLO = Buffer.alloc(32, "clave-de-desarrollo-no-secreta");

export function cifradorDesdeEntorno(env: NodeJS.ProcessEnv = process.env): Cifrador {
  const crudo = env["CLAVE_DATOS_SENSIBLES"];
  if (crudo) {
    const anteriores = (env["CLAVES_DATOS_SENSIBLES_ANTERIORES"] ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c !== "")
      .map((c) => Buffer.from(c, "base64"));
    return crearCifrador(Buffer.from(crudo, "base64"), { anteriores });
  }
  const modo = env["NODE_ENV"];
  if (modo === "development" || modo === "test") {
    log.warn("sensibles_clave_de_desarrollo", { motivo: "falta CLAVE_DATOS_SENSIBLES; se usa una clave de desarrollo NO secreta" });
    return crearCifrador(CLAVE_DE_DESARROLLO);
  }
  throw new ErrorCifrado(
    "Falta CLAVE_DATOS_SENSIBLES: sin ella no se guardan ni leen datos de salud. Para desarrollo local define NODE_ENV=development (o test): se usa una clave de desarrollo NO secreta.",
  );
}
