// Validador de entrada propio, pequeño y tipado (B3). Sin librerías: un esquema es un objeto con un
// método `leer` que devuelve el valor ya tipado o anota errores; `parsear()` lanza `validacion` (400)
// con los detalles. Reglas fijas:
//   - `objeto()` RECHAZA los campos desconocidos (un typo no se ignora en silencio);
//   - los textos se recortan y no pueden ser solo espacios;
//   - nada se coacciona salvo en `query` (donde todo llega como texto): ahí `enteroDeTexto` /
//     `booleanoDeTexto`;
//   - un campo repetido en la query (?a=1&a=2) es un error, no un arreglo.
//
//   const esquema = objeto({ nombre: texto({ max: 80 }), edad: opcional(entero({ min: 0 })) });
//   const entrada = parsear(esquema, req.body);   // { nombre: string; edad?: number }

import { aTexto, cabeEnDecimal, deTexto, ErrorDeDinero } from "../lib/dinero.ts";
import { validacion, type DetalleDeError } from "./errores.ts";

const INVALIDO = Symbol("invalido");
type Resultado<T> = T | typeof INVALIDO;

export interface Esquema<T> {
  /** true si el campo puede faltar en un objeto (lo marca `opcional`). */
  readonly opcional?: true;
  leer(valor: unknown, ruta: string, errores: DetalleDeError[]): Resultado<T>;
}

type Inferir<E> = E extends Esquema<infer T> ? T : never;
type EsOpcional<E> = E extends { readonly opcional: true } ? true : false;

type TipoDeObjeto<S extends Record<string, Esquema<unknown>>> = {
  [K in keyof S as EsOpcional<S[K]> extends true ? never : K]: Inferir<S[K]>;
} & {
  [K in keyof S as EsOpcional<S[K]> extends true ? K : never]?: Inferir<S[K]>;
};

function falla(errores: DetalleDeError[], ruta: string, mensaje: string): typeof INVALIDO {
  errores.push(ruta ? { campo: ruta, mensaje } : { mensaje });
  return INVALIDO;
}

export function texto(opciones: { min?: number; max?: number; patron?: RegExp; mensajePatron?: string; minusculas?: boolean } = {}): Esquema<string> {
  const { min = 1, max = 500 } = opciones;
  return {
    leer(valor, ruta, errores) {
      if (typeof valor !== "string") return falla(errores, ruta, "Debe ser un texto");
      if (valor.includes("\u0000")) return falla(errores, ruta, "Contiene un carácter no permitido"); // la base no guarda NUL (EB-14)
      let t = valor.normalize("NFKC").trim();
      if (opciones.minusculas) t = t.toLowerCase();
      if (t.length < min) return falla(errores, ruta, min <= 1 ? "No puede estar vacío" : `Debe tener al menos ${min} caracteres`);
      if (t.length > max) return falla(errores, ruta, `Debe tener a lo más ${max} caracteres`);
      if (opciones.patron && !opciones.patron.test(t)) return falla(errores, ruta, opciones.mensajePatron ?? "Formato no válido");
      return t;
    },
  };
}

/** Texto que NO se recorta ni se normaliza (contraseñas). Longitud en caracteres. */
export function textoLiteral(opciones: { min?: number; max: number }): Esquema<string> {
  const min = opciones.min ?? 1;
  return {
    leer(valor, ruta, errores) {
      if (typeof valor !== "string") return falla(errores, ruta, "Debe ser un texto");
      if (valor.includes("\u0000")) return falla(errores, ruta, "Contiene un carácter no permitido");
      if (valor.length < min) return falla(errores, ruta, "No puede estar vacío");
      if (valor.length > opciones.max) return falla(errores, ruta, `Debe tener a lo más ${opciones.max} caracteres`);
      return valor;
    },
  };
}

export function entero(opciones: { min?: number; max?: number } = {}): Esquema<number> {
  return {
    leer(valor, ruta, errores) {
      if (typeof valor !== "number" || !Number.isInteger(valor)) return falla(errores, ruta, "Debe ser un número entero");
      if (opciones.min !== undefined && valor < opciones.min) return falla(errores, ruta, `Debe ser al menos ${opciones.min}`);
      if (opciones.max !== undefined && valor > opciones.max) return falla(errores, ruta, `Debe ser a lo más ${opciones.max}`);
      return valor;
    },
  };
}

/**
 * Un importe de dinero como TEXTO decimal («1234.50»), a lo más dos decimales; devuelve centavos (`bigint`).
 * Un número JSON se RECHAZA: `19.99` llega como flotante y el dinero no pasa por flotantes. Entre 0 y
 * 9 999 999 999.99 (lo que cabe en `Decimal(12,2)`).
 */
export function dinero(): Esquema<bigint> {
  return {
    leer(valor, ruta, errores) {
      if (typeof valor === "number") return falla(errores, ruta, 'Manda el importe como texto con dos decimales, p. ej. "1234.50" (un número JSON es un flotante)');
      if (typeof valor !== "string") return falla(errores, ruta, "Debe ser un importe en texto, p. ej. \"1234.50\"");
      try {
        const c = deTexto(valor);
        return cabeEnDecimal(c) ? c : falla(errores, ruta, `Debe estar entre 0.00 y ${aTexto(9_999_999_999_99n)}`);
      } catch (e) {
        if (e instanceof ErrorDeDinero) return falla(errores, ruta, "Importe inválido: dígitos con a lo más dos decimales, sin comas ni símbolos");
        throw e;
      }
    },
  };
}

/** Una fecha de calendario `AAAA-MM-DD` que existe (no el 31 de febrero). Devuelve el mismo texto. */
export function fechaISO(): Esquema<string> {
  return {
    leer(valor, ruta, errores) {
      if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return falla(errores, ruta, "Debe ser una fecha AAAA-MM-DD");
      const d = new Date(`${valor}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor ? valor : falla(errores, ruta, "No es una fecha del calendario");
    },
  };
}

export function booleano(): Esquema<boolean> {
  return {
    leer(valor, ruta, errores) {
      return typeof valor === "boolean" ? valor : falla(errores, ruta, "Debe ser verdadero o falso");
    },
  };
}

export function enumerado<const V extends readonly string[]>(valores: V): Esquema<V[number]> {
  return {
    leer(valor, ruta, errores) {
      if (typeof valor === "string" && (valores as readonly string[]).includes(valor)) return valor as V[number];
      return falla(errores, ruta, `Debe ser uno de: ${valores.join(", ")}`);
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(): Esquema<string> {
  return {
    leer(valor, ruta, errores) {
      return typeof valor === "string" && UUID.test(valor) ? valor.toLowerCase() : falla(errores, ruta, "Debe ser un identificador válido");
    },
  };
}

/** Correo en minúsculas y recortado, con forma de correo. */
export function correo(): Esquema<string> {
  return texto({ max: 254, minusculas: true, patron: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, mensajePatron: "Debe ser un correo válido" });
}

export function listaDe<T>(elemento: Esquema<T>, opciones: { max?: number; unicos?: boolean } = {}): Esquema<T[]> {
  const max = opciones.max ?? 100;
  return {
    leer(valor, ruta, errores) {
      if (!Array.isArray(valor)) return falla(errores, ruta, "Debe ser una lista");
      if (valor.length > max) return falla(errores, ruta, `Debe tener a lo más ${max} elementos`);
      const salida: T[] = [];
      let bien = true;
      valor.forEach((v, i) => {
        const r = elemento.leer(v, `${ruta}[${i}]`, errores);
        if (r === INVALIDO) bien = false;
        else salida.push(r);
      });
      if (!bien) return INVALIDO;
      if (opciones.unicos && new Set(salida).size !== salida.length) return falla(errores, ruta, "No puede tener elementos repetidos");
      return salida;
    },
  };
}

export function opcional<T>(esquema: Esquema<T>): Esquema<T> & { readonly opcional: true } {
  return {
    opcional: true,
    leer(valor, ruta, errores) {
      return valor === undefined ? (undefined as T) : esquema.leer(valor, ruta, errores);
    },
  };
}

/** Acepta `null` además del valor. */
export function nulable<T>(esquema: Esquema<T>): Esquema<T | null> {
  return {
    leer(valor, ruta, errores) {
      return valor === null ? null : esquema.leer(valor, ruta, errores);
    },
  };
}

/** Objeto cerrado: los campos que no están en el esquema son un error. */
export function objeto<const S extends Record<string, Esquema<unknown>>>(campos: S): Esquema<TipoDeObjeto<S>> {
  return {
    leer(valor, ruta, errores) {
      if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return falla(errores, ruta, "Debe ser un objeto");
      const entrada = valor as Record<string, unknown>;
      const salida: Record<string, unknown> = {};
      let bien = true;
      for (const clave of Object.keys(entrada)) {
        if (!Object.hasOwn(campos, clave)) {
          errores.push({ campo: ruta ? `${ruta}.${clave}` : clave, mensaje: "Campo desconocido" });
          bien = false;
        }
      }
      for (const [clave, esquema] of Object.entries(campos)) {
        const presente = Object.hasOwn(entrada, clave) && entrada[clave] !== undefined;
        if (!presente && !esquema.opcional) {
          errores.push({ campo: ruta ? `${ruta}.${clave}` : clave, mensaje: "Es obligatorio" });
          bien = false;
          continue;
        }
        const r = esquema.leer(entrada[clave], ruta ? `${ruta}.${clave}` : clave, errores);
        if (r === INVALIDO) bien = false;
        else if (r !== undefined) salida[clave] = r;
      }
      return bien ? (salida as TipoDeObjeto<S>) : INVALIDO;
    },
  };
}

// ── Query string: todo llega como texto ────────────────────────────────────────────────

export function enteroDeTexto(opciones: { min?: number; max?: number } = {}): Esquema<number> {
  const interno = entero(opciones);
  return {
    leer(valor, ruta, errores) {
      if (typeof valor !== "string" || !/^-?\d{1,15}$/.test(valor)) return falla(errores, ruta, "Debe ser un número entero");
      return interno.leer(Number(valor), ruta, errores);
    },
  };
}

export function booleanoDeTexto(): Esquema<boolean> {
  return {
    leer(valor, ruta, errores) {
      if (valor === "true") return true;
      if (valor === "false") return false;
      return falla(errores, ruta, "Debe ser true o false");
    },
  };
}

/**
 * Valida un valor contra el esquema y lo devuelve tipado, o lanza `validacion` con todos los
 * errores encontrados (no solo el primero).
 */
export function parsear<T>(esquema: Esquema<T>, valor: unknown): T {
  const errores: DetalleDeError[] = [];
  const r = esquema.leer(valor, "", errores);
  if (r === INVALIDO || errores.length > 0) throw validacion(errores.length > 0 ? errores : [{ mensaje: "Datos no válidos" }]);
  return r;
}

/** Igual que `parsear`, pero para un `req.query` de Express: un campo repetido es un error. */
export function parsearQuery<T>(esquema: Esquema<T>, query: Record<string, unknown>): T {
  const errores: DetalleDeError[] = [];
  const plano: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(query)) {
    if (Array.isArray(valor) || (typeof valor === "object" && valor !== null)) {
      errores.push({ campo: clave, mensaje: "Debe aparecer una sola vez y ser un valor simple" });
    } else {
      plano[clave] = valor;
    }
  }
  if (errores.length > 0) throw validacion(errores);
  return parsear(esquema, plano);
}
