// Bot de captación: máquina de estados determinista (invariante 10). Hace tres preguntas
// (nombre, edad, sucursal) y pide pasar la conversación a un asesor al terminar, o tras
// MAX_INTENTOS respuestas que no entiende.
//
// Es pura: no lee base ni red. El nombre de la vertical y las sucursales llegan de las tablas
// (invariante 2).
//
// COTIZADOR (C6 en adelante): si la vertical lo tiene encendido (`ctx.cotizador`, el catálogo ya cargado), después de
// la edad y la sucursal el bot consulta el catálogo con el cotizador puro (`src/cotizador/`): con un solo programa
// para esa edad lo anota; con varios (decisión 9 del plan) pregunta cuál quiere. Sin `ctx.cotizador` la captura es
// la de siempre: tres preguntas y pase al asesor. La máquina no escribe nada: pide efectos (`efectos`) que ejecuta
// quien la llama dentro de su transacción.

import { cotizar } from "../cotizador/cotizar.ts";
import type { CatalogoCotizable } from "../cotizador/tipos.ts";
import type { PasoCaptacion } from "../datos/tipos.ts";

export const MAX_INTENTOS = 3;

/**
 * Los pasos en los que la captura va A MEDIAS (el bot espera una respuesta del contacto). Si deja de contestar, a los
 * 30 min se avisa a los asesores (`espera.ts`) y el reenganche de 25 h puede salir (`motor.ts`). Un solo lugar:
 * un paso nuevo que espera respuesta se agrega aquí.
 */
export const PASOS_A_MEDIAS: readonly PasoCaptacion[] = ["nombre", "edad", "sucursal", "programa"];

export interface OpcionSucursal {
  id: string;
  nombre: string;
  /** Para decirle al contacto dónde queda (C7). Opcional: la escuela puede no haberla dado. */
  direccion?: string | null;
}

/** Un programa que el contacto puede elegir (C6). Los nombres y textos salen de las tablas. */
export interface OpcionPrograma {
  id: string;
  nombre: string;
  descripcionPublica: string | null;
}

/** El cotizador del bot: el catálogo de la vertical ya cargado. Solo existe si la vertical lo tiene encendido. */
export interface ContextoCotizadorBot {
  verticalId: string;
  catalogo: CatalogoCotizable;
}

export interface ContextoCaptacion {
  nombreVertical: string;
  /** Sucursales activas que ofrecen la vertical, en el orden en que se muestran. */
  sucursales: OpcionSucursal[];
  /** Presente solo si la vertical tiene el cotizador de WhatsApp encendido. */
  cotizador?: ContextoCotizadorBot;
}

export interface EstadoCaptacion {
  paso: PasoCaptacion;
  intentosFallidos: number;
  nombre: string | null;
  edad: number | null;
  sucursalId: string | null;
  /** El programa elegido o único para su edad (C6). Solo se pone con el cotizador encendido. */
  programaId?: string | null;
}

export type MotivoPaseAsesor = "captura_completa" | "sin_entender" | "sin_respuesta";

/** Lo que la máquina pide hacer en la base; lo ejecuta quien la llama, en su transacción. */
export type EfectoCaptacion = { tipo: "programa_sugerido"; programaId: string };

export interface ResultadoCaptacion {
  estado: EstadoCaptacion;
  respuestas: string[];
  pasarAAsesor: MotivoPaseAsesor | null;
  /** Solo viene cuando hay algo que hacer. */
  efectos?: EfectoCaptacion[];
}

export const ESTADO_INICIAL: EstadoCaptacion = {
  paso: "inicio",
  intentosFallidos: 0,
  nombre: null,
  edad: null,
  sucursalId: null,
};

// ---------------------------------------------------------------------------------------------
// Textos. Genéricos: lo que cambia por vertical o sucursal llega en el contexto.

export const textos = {
  saludo: (vertical: string) =>
    `¡Hola! Gracias por escribir a ${vertical}. Para darte horarios y costos exactos te hago tres preguntas rápidas.`,
  preguntaNombre: "¿Cómo se llama la persona que tomaría las clases?",
  preguntaEdad: (nombre: string) => `Mucho gusto. ¿Qué edad tiene ${nombre}?`,
  preguntaSucursal: (sucursales: OpcionSucursal[]) =>
    `¿Qué sucursal te queda mejor? Responde con el número:\n${listar(sucursales)}`,
  cierre: (nombre: string, sucursal: string | null) =>
    sucursal
      ? `¡Gracias! Ya tengo los datos de ${nombre} para la sucursal ${sucursal}. Un asesor te escribe por aquí en unos minutos con horarios y costos.`
      : `¡Gracias! Ya tengo los datos de ${nombre}. Un asesor te escribe por aquí en unos minutos con horarios y costos.`,
  reintentoNombre: "No alcancé a leer el nombre. ¿Me lo escribes de nuevo? Solo el nombre, por favor.",
  reintentoEdad: "¿Me compartes la edad con número? Por ejemplo: 8",
  reintentoSucursal: (sucursales: OpcionSucursal[]) => `Responde solo con el número de la sucursal:\n${listar(sucursales)}`,
  preguntaPrograma: (nombre: string, edad: number, programas: OpcionPrograma[]) =>
    `Para ${nombre} (${edad} años) tenemos estas opciones. ¿Cuál te interesa? Responde con el número:\n${listarProgramas(programas)}`,
  reintentoPrograma: (programas: OpcionPrograma[]) => `Responde solo con el número del programa:\n${listarProgramas(programas)}`,
  cierreConPrograma: (nombre: string, programa: string, sucursal: string | null) =>
    `¡Gracias! Ya tengo los datos de ${nombre} para ${programa}${sucursal ? ` en la sucursal ${sucursal}` : ""}. Un asesor te escribe por aquí en unos minutos con horarios y costos.`,
  /** Única respuesta a una baja: sale una sola vez y es lo último que el sistema le manda. */
  confirmacionBaja: "Listo, ya no recibirás más mensajes de nuestra parte. Gracias por tu tiempo.",
  sinEntender: "Te comunico con un asesor para ayudarte mejor. En unos minutos te escribe por aquí.",
  /** Nota interna para el asesor al pasarle la conversación. */
  resumenAsesor: (
    motivo: MotivoPaseAsesor,
    datos: {
      nombre: string | null;
      edad: number | null;
      sucursal: string | null;
      telefono: string | null;
      /** El programa elegido o único para su edad; se omite (undefined) si el cotizador no lo anotó. */
      programa?: string | null;
      /** El adulto que escribe. */
      contacto?: string | null;
      /** Anuncio y campaña de origen; null = entró directo, sin anuncio. */
      origen?: string | null;
    },
  ) =>
    [
      motivo === "captura_completa"
        ? "Datos capturados por el bot:"
        : motivo === "sin_respuesta"
          ? "El contacto dejó de contestar a mitad de la captura. Nadie la ha tomado: el bot sigue atendiendo si vuelve. Asígnatela o escríbele para tomarla. Datos parciales:"
          : `El bot no pudo completar la captura (${MAX_INTENTOS} respuestas sin entender). Datos parciales:`,
      `• Nombre: ${datos.nombre ?? "—"}`,
      `• Edad: ${datos.edad ?? "—"}`,
      `• Sucursal: ${datos.sucursal ?? "—"}`,
      ...(datos.programa !== undefined ? [`• Programa: ${datos.programa ?? "—"}`] : []),
      `• Teléfono: ${datos.telefono ?? "—"}`,
      ...(datos.contacto !== undefined ? [`• Contacto: ${datos.contacto ?? "—"}`] : []),
      ...(datos.origen !== undefined ? [`• Origen: ${datos.origen ?? "directo, sin anuncio"}`] : []),
    ].join("\n"),
};

function listar(sucursales: OpcionSucursal[]): string {
  return sucursales.map((s, i) => `${i + 1}. ${s.nombre}`).join("\n");
}

function listarProgramas(programas: OpcionPrograma[]): string {
  return programas.map((p, i) => `${i + 1}. ${p.nombre}${p.descripcionPublica ? ` — ${p.descripcionPublica}` : ""}`).join("\n");
}

// ---------------------------------------------------------------------------------------------

export function avanzar(estado: EstadoCaptacion, entrada: string, ctx: ContextoCaptacion): ResultadoCaptacion {
  switch (estado.paso) {
    case "inicio":
      return {
        estado: { ...estado, paso: "nombre", intentosFallidos: 0 },
        respuestas: [textos.saludo(ctx.nombreVertical), textos.preguntaNombre],
        pasarAAsesor: null,
      };

    case "nombre": {
      const nombre = extraerNombre(entrada);
      if (!nombre) return fallo(estado, textos.reintentoNombre);
      return {
        estado: { ...estado, paso: "edad", intentosFallidos: 0, nombre },
        respuestas: [textos.preguntaEdad(nombre)],
        pasarAAsesor: null,
      };
    }

    case "edad": {
      const edad = extraerEdad(entrada);
      if (edad === null) return fallo(estado, textos.reintentoEdad);
      const conEdad: EstadoCaptacion = { ...estado, edad, intentosFallidos: 0 };
      // Con una sola sucursal (o ninguna) no hay nada que preguntar.
      if (ctx.sucursales.length <= 1) return conSucursal({ ...conEdad, sucursalId: ctx.sucursales[0]?.id ?? null }, ctx);
      return {
        estado: { ...conEdad, paso: "sucursal" },
        respuestas: [textos.preguntaSucursal(ctx.sucursales)],
        pasarAAsesor: null,
      };
    }

    case "sucursal": {
      const sucursal = elegirSucursal(entrada, ctx.sucursales);
      if (!sucursal) return fallo(estado, textos.reintentoSucursal(ctx.sucursales));
      return conSucursal({ ...estado, sucursalId: sucursal.id, intentosFallidos: 0 }, ctx);
    }

    case "programa": {
      const opciones = programasDeLaEdad(estado, ctx);
      const elegido = elegirOpcion(entrada, opciones);
      if (!elegido) return fallo(estado, textos.reintentoPrograma(opciones));
      return conPrograma({ ...estado, intentosFallidos: 0 }, elegido.id, ctx);
    }

    case "completo":
      // Ya se capturó todo. Si llega otro mensaje es porque el pase al asesor no terminó: se
      // vuelve a pedir, sin contestar nada.
      return { estado, respuestas: [], pasarAAsesor: "captura_completa" };
  }
}

function completar(estado: EstadoCaptacion, ctx: ContextoCaptacion, programa?: OpcionPrograma): ResultadoCaptacion {
  const sucursal = ctx.sucursales.find((s) => s.id === estado.sucursalId)?.nombre ?? null;
  return {
    estado: { ...estado, paso: "completo" },
    respuestas: [programa ? textos.cierreConPrograma(estado.nombre ?? "", programa.nombre, sucursal) : textos.cierre(estado.nombre ?? "", sucursal)],
    pasarAAsesor: "captura_completa",
    ...(programa ? { efectos: [{ tipo: "programa_sugerido" as const, programaId: programa.id }] } : {}),
  };
}

// ── Con el cotizador encendido ─────────────────────────────────────────────────────────────────────

/** Los programas que le corresponden a su edad en su sucursal (el cotizador puro), listos para mostrar. */
function programasDeLaEdad(estado: EstadoCaptacion, ctx: ContextoCaptacion): OpcionPrograma[] {
  if (!ctx.cotizador || estado.edad === null || estado.sucursalId === null) return [];
  const c = cotizar(ctx.cotizador.catalogo, { verticalId: ctx.cotizador.verticalId, sucursalId: estado.sucursalId, edadDeclarada: estado.edad });
  return c.programas.map((p) => ({ id: p.programaId, nombre: p.nombre, descripcionPublica: p.descripcionPublica }));
}

/** Ya se sabe la sucursal: sin cotizador se cierra como siempre; con él, se busca programa. */
function conSucursal(estado: EstadoCaptacion, ctx: ContextoCaptacion): ResultadoCaptacion {
  if (!ctx.cotizador || estado.sucursalId === null || estado.edad === null) return completar(estado, ctx);
  const programas = programasDeLaEdad(estado, ctx);
  if (programas.length === 0) return completar(estado, ctx); // C7 decide qué hacer cuando no hay programa
  if (programas.length === 1) return conPrograma(estado, programas[0]!.id, ctx);
  return {
    estado: { ...estado, paso: "programa", intentosFallidos: 0 },
    respuestas: [textos.preguntaPrograma(estado.nombre ?? "", estado.edad, programas)],
    pasarAAsesor: null,
  };
}

/** Ya hay un programa: se anota en el prospecto y se cierra. */
function conPrograma(estado: EstadoCaptacion, programaId: string, ctx: ContextoCaptacion): ResultadoCaptacion {
  const programa = programasDeLaEdad(estado, ctx).find((p) => p.id === programaId);
  if (!programa) return completar(estado, ctx);
  return completar({ ...estado, programaId }, ctx, programa);
}

function fallo(estado: EstadoCaptacion, reintento: string): ResultadoCaptacion {
  const intentosFallidos = estado.intentosFallidos + 1;
  if (intentosFallidos >= MAX_INTENTOS) {
    return { estado: { ...estado, intentosFallidos }, respuestas: [textos.sinEntender], pasarAAsesor: "sin_entender" };
  }
  return { estado: { ...estado, intentosFallidos }, respuestas: [reintento], pasarAAsesor: null };
}

// ---------------------------------------------------------------------------------------------
// Interpretación de respuestas

/** Palabras que significan "no me escribas más". Se comparan completas, no como parte de una frase. */
export const PALABRAS_DE_BAJA = ["baja", "stop", "cancelar", "no molestar"] as const;

/** true si el mensaje es, completo, una palabra de baja ("STOP", "No molestar.", "baja"…). */
export function esPalabraDeBaja(entrada: string): boolean {
  const t = normalizar(entrada).replace(/^[\s¡!¿?.,;:"'*_-]+|[\s¡!¿?.,;:"'*_-]+$/g, "");
  return (PALABRAS_DE_BAJA as readonly string[]).includes(t);
}

const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const PREFIJOS_NOMBRE = /^(?:mi hij[oa] se llama|se llama|me llamo|su nombre es|el nombre es|es|soy)\s+/i;

/** Nombre limpio y con mayúsculas iniciales, o null si no parece un nombre. */
export function extraerNombre(entrada: string): string | null {
  const limpio = entrada
    .trim()
    .replace(/\s+/g, " ")
    .replace(PREFIJOS_NOMBRE, "")
    .replace(/[.!¡,]+$/u, "")
    .trim();
  if (!/^\p{L}[\p{L}'’\- ]{1,59}$/u.test(limpio)) return null;
  const palabras = limpio.split(" ");
  if (palabras.length > 5) return null;
  return palabras.map((p) => p.charAt(0).toLocaleUpperCase("es-MX") + p.slice(1)).join(" ");
}

const NUMEROS_ESCRITOS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20,
};

/** Edad en años (1–99), o null si no hay una sola edad clara. */
export function extraerEdad(entrada: string): number | null {
  const t = normalizar(entrada);
  const candidatos = new Set<number>();
  for (const m of t.matchAll(/\d+/g)) candidatos.add(Number(m[0]));
  if (candidatos.size === 0) {
    for (const palabra of t.split(/[^a-z]+/)) {
      const n = NUMEROS_ESCRITOS[palabra];
      if (n !== undefined) candidatos.add(n);
    }
  }
  if (candidatos.size !== 1) return null;
  const [edad] = candidatos;
  return edad !== undefined && edad >= 1 && edad <= 99 ? edad : null;
}

/** Acepta el número de la lista o el nombre de la sucursal. */
export function elegirSucursal(entrada: string, opciones: OpcionSucursal[]): OpcionSucursal | null {
  return elegirOpcion(entrada, opciones);
}

/** Acepta el número de una lista o el nombre de la opción (si es una sola coincidencia). */
export function elegirOpcion<T extends { nombre: string }>(entrada: string, opciones: readonly T[]): T | null {
  const t = normalizar(entrada).replace(/[.)]+$/, "");
  const numero = /^(?:la |opcion |sucursal )?(\d{1,2})$/.exec(t);
  if (numero) return opciones[Number(numero[1]) - 1] ?? null;
  if (t.length < 3) return null;
  const coincidencias = opciones.filter((o) => {
    const nombre = normalizar(o.nombre);
    return t.includes(nombre) || nombre.includes(t);
  });
  return coincidencias.length === 1 ? coincidencias[0]! : null;
}
