// Cifrado de los campos de salud: AES-256-GCM con la clave de la variable de entorno
// `CLAVE_DATOS_SENSIBLES` (32 bytes en base64: `openssl rand -base64 32`).
//
// Cada valor se cifra con un IV aleatorio y se LIGA a su lugar mediante datos asociados
// (organización | sujeto | campo): un texto cifrado copiado a otra fila, campo u organización no
// descifra. Formato guardado: `v1.<iv>.<etiqueta>.<texto>` (base64url).
//
// Sin clave: en producción se niega a operar; fuera de producción usa una clave FIJA de desarrollo
// (con un aviso) para que la demo funcione, y nunca es secreta.
//
// Límite honesto: la clave vive en el entorno del backend. Quien tenga el entorno puede leer los datos;
// esto protege contra un volcado de la base, no contra el servidor comprometido. La rotación de claves
// no está construida (el prefijo `v1` deja la puerta abierta).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { log } from "../lib/log.ts";

export class ErrorCifrado extends Error {}

export interface Cifrador {
  cifrar(texto: string, aad: string): string;
  descifrar(guardado: string, aad: string): string;
}

export function crearCifrador(clave: Buffer): Cifrador {
  if (clave.length !== 32) throw new ErrorCifrado("La clave de datos sensibles debe ser de 32 bytes");
  return {
    cifrar(texto, aad) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", clave, iv);
      c.setAAD(Buffer.from(aad, "utf8"));
      const cifrado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
      return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
    },
    descifrar(guardado, aad) {
      const [version, iv, etiqueta, cifrado] = guardado.split(".");
      if (version !== "v1" || !iv || !etiqueta || cifrado === undefined) throw new ErrorCifrado("Formato de dato cifrado desconocido");
      try {
        const d = createDecipheriv("aes-256-gcm", clave, Buffer.from(iv, "base64url"));
        d.setAAD(Buffer.from(aad, "utf8"));
        d.setAuthTag(Buffer.from(etiqueta, "base64url"));
        return Buffer.concat([d.update(Buffer.from(cifrado, "base64url")), d.final()]).toString("utf8");
      } catch {
        // Clave equivocada, dato alterado o copiado a otro lugar: no se dice cuál.
        throw new ErrorCifrado("No se pudo descifrar el dato");
      }
    },
  };
}

/** Clave de desarrollo, pública a propósito: nunca protege nada. */
const CLAVE_DE_DESARROLLO = Buffer.alloc(32, "clave-de-desarrollo-no-secreta");

export function cifradorDesdeEntorno(env: NodeJS.ProcessEnv = process.env): Cifrador {
  const crudo = env["CLAVE_DATOS_SENSIBLES"];
  if (crudo) return crearCifrador(Buffer.from(crudo, "base64"));
  if (env["NODE_ENV"] === "production") {
    throw new ErrorCifrado("Falta CLAVE_DATOS_SENSIBLES: con NODE_ENV=production no se guardan ni leen datos de salud sin clave");
  }
  log.warn("sensibles_clave_de_desarrollo", { motivo: "falta CLAVE_DATOS_SENSIBLES; se usa una clave de desarrollo NO secreta" });
  return crearCifrador(CLAVE_DE_DESARROLLO);
}
