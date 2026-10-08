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

import type { PoliticaSucursalSinPrograma } from "../configuracion/index.ts";
import { descripcionDePromociones, opcionesDeHorario, vigenteHasta, type OpcionHorario } from "../cotizador/cotizacion.ts";
import { cotizar, sucursalesConPrograma } from "../cotizador/cotizar.ts";
import type { CatalogoCotizable, ProgramaCotizado } from "../cotizador/tipos.ts";
import { formatear } from "../lib/dinero.ts";
import type { PasoCaptacion } from "../datos/tipos.ts";

export const MAX_INTENTOS = 3;

/**
 * Los pasos en los que la captura va A MEDIAS (el bot espera una respuesta del contacto). Si deja de contestar, a los
 * 30 min se avisa a los asesores (`espera.ts`) y el reenganche de 25 h puede salir (`motor.ts`). Un solo lugar:
 * un paso nuevo que espera respuesta se agrega aquí.
 */
export const PASOS_A_MEDIAS: readonly PasoCaptacion[] = ["nombre", "edad", "sucursal", "programa", "otra_sucursal", "horario"];

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
  /** Qué hacer si la sucursal elegida no tiene programa para la edad (configuración de la organización; C7). */
  sucursalSinPrograma: PoliticaSucursalSinPrograma;
  /** Días que vale una cotización (configuración de la organización; C8). */
  vigenciaDias: number;
  /**
   * La cotización que el bot ya le mandó a este contacto (la guardada), con los horarios TAL COMO se los numeró:
   * el número que responda apunta a lo que vio, aunque los lugares hayan cambiado después. Nula si no hay.
   */
  cotizacionGuardada: { opciones: OpcionHorario[] } | null;
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

export type MotivoPaseAsesor = "captura_completa" | "sin_entender" | "sin_respuesta" | "sin_programa" | "pidio_asesor";

/** Lo que la máquina pide hacer en la base; lo ejecuta quien la llama, en su transacción. */
export type EfectoCaptacion =
  | { tipo: "programa_sugerido"; programaId: string }
  /** Guardar lo cotizado (programa, horarios con lugar, precios y promociones de hoy) para el prospecto. */
  | { tipo: "guardar_cotizacion"; programaId: string; cotizado: ProgramaCotizado; fecha: string; vigenteHasta: string }
  /** El contacto eligió este horario (grupo) de la cotización guardada. */
  | { tipo: "elegir_grupo"; grupoId: string };

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
  /** C7: la sucursal elegida no tiene programa para su edad y hay una sola alternativa. */
  ofrecerOtraSucursal: (nombre: string, edad: number, sucursalElegida: string, otra: OpcionSucursal) =>
    `En la sucursal ${sucursalElegida} por ahora no tenemos clases para ${nombre} (${edad} años), pero en la sucursal ${descripcionDeSucursal(otra)} sí. ¿Quieres que te cotice ahí? Responde sí o no.`,
  /** C7: hay varias sucursales con programa. */
  ofrecerOtrasSucursales: (nombre: string, edad: number, sucursalElegida: string, otras: OpcionSucursal[]) =>
    `En la sucursal ${sucursalElegida} por ahora no tenemos clases para ${nombre} (${edad} años), pero sí en estas sucursales. Responde con el número de la que prefieras, o «no» para que te atienda un asesor:\n${listarConDireccion(otras)}`,
  reintentoOtraSucursal: (otras: OpcionSucursal[]) =>
    otras.length === 1 ? `Responde sí o no: ¿te cotizo en la sucursal ${otras[0]!.nombre}?` : `Responde con el número de la sucursal, o «no» para que te atienda un asesor:\n${listarConDireccion(otras)}`,
  /** C7: sin programa para su edad y nada que ofrecer (o prefiere a una persona): pasa al asesor. */
  sinPrograma: (nombre: string, edad: number, sucursal: string) =>
    `Por ahora no encontré un programa para ${nombre} (${edad} años) en la sucursal ${sucursal}. Te comunico con un asesor para revisar opciones; te escribe por aquí en unos minutos.`,
  /** C8: la cotización completa. Todo sale de las tablas (programa, grupos, precios, promociones). */
  cotizacion: (nombre: string, edad: number, sucursal: string, p: ProgramaCotizado, opciones: OpcionHorario[]): string => {
    const moneda = p.precio?.moneda ?? "MXN";
    const lineas: string[] = [`Para ${nombre} (${edad} años) en la sucursal ${sucursal} te recomiendo ${p.nombre}.${p.descripcionPublica ? ` ${p.descripcionPublica}` : ""}`];
    if (opciones.length > 0) {
      lineas.push("", "Horarios disponibles:");
      opciones.forEach((o, i) => lineas.push(`${i + 1}. ${o.nombre}: ${o.horarioTexto} · ${o.oferta === "lugar" ? (o.lugares === 1 ? "1 lugar" : `${o.lugares} lugares`) : "lista de espera"}`));
    } else {
      lineas.push("", "Por ahora no hay lugares en los grupos de este programa.");
    }
    lineas.push("");
    if (p.precio) {
      const pr = p.promociones;
      const insc = pr && pr.inscripcion.descuentoAhora > 0n ? `${formatear(pr.inscripcion.original, moneda)} → ${formatear(pr.inscripcion.finalAhora, moneda)}` : formatear(p.precio.costoInscripcion, moneda);
      const mens = pr && pr.mensualidad.descuentoAhora > 0n ? `${formatear(pr.mensualidad.original, moneda)} → ${formatear(pr.mensualidad.finalAhora, moneda)}` : formatear(p.precio.costoMensualidad, moneda);
      lineas.push(`Inscripción: ${insc}`, `Mensualidad: ${mens}`);
      for (const promo of descripcionDePromociones(p)) lineas.push(`Promoción vigente: ${promo}`);
    } else {
      lineas.push("El costo te lo confirma un asesor.");
    }
    lineas.push("", opciones.length > 0 ? "Responde con el número del horario que prefieras, o escribe «asesor» para hablar con una persona." : "Un asesor te escribe por aquí en unos minutos.");
    return lineas.join("\n");
  },
  reintentoHorario: (opciones: OpcionHorario[]) =>
    `Responde con el número del horario, o escribe «asesor» para hablar con una persona:\n${opciones.map((o, i) => `${i + 1}. ${o.nombre}: ${o.horarioTexto}`).join("\n")}`,
  cierreConHorario: (nombre: string, o: OpcionHorario, programa: string, sucursal: string | null) =>
    `¡Listo! Anotamos a ${nombre} en ${o.nombre} (${o.horarioTexto}) de ${programa}${sucursal ? `, sucursal ${sucursal}` : ""}${o.oferta === "lista_de_espera" ? ", en lista de espera" : ""}. Un asesor te escribe por aquí en unos minutos para confirmar y resolver tus dudas.`,
  pidioAsesor: "Claro, te comunico con un asesor. Te escribe por aquí en unos minutos.",
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
      /** Líneas con lo cotizado y el horario elegido (C8); se omite si no se cotizó. */
      cotizacion?: string[];
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
          : motivo === "pidio_asesor"
            ? "El contacto pidió hablar con una persona. Datos capturados:"
            : motivo === "sin_programa"
            ? "La sucursal elegida no tiene programa para la edad y el contacto no pasó a otra sucursal (no hay otra con programa, no quiso, o la política de la organización es avisar al asesor). Datos capturados:"
            : `El bot no pudo completar la captura (${MAX_INTENTOS} respuestas sin entender). Datos parciales:`,
      `• Nombre: ${datos.nombre ?? "—"}`,
      `• Edad: ${datos.edad ?? "—"}`,
      `• Sucursal: ${datos.sucursal ?? "—"}`,
      ...(datos.programa !== undefined ? [`• Programa: ${datos.programa ?? "—"}`] : []),
      ...(datos.cotizacion ?? []),
      `• Teléfono: ${datos.telefono ?? "—"}`,
      ...(datos.contacto !== undefined ? [`• Contacto: ${datos.contacto ?? "—"}`] : []),
      ...(datos.origen !== undefined ? [`• Origen: ${datos.origen ?? "directo, sin anuncio"}`] : []),
    ].join("\n"),
};

function listar(sucursales: OpcionSucursal[]): string {
  return sucursales.map((s, i) => `${i + 1}. ${s.nombre}`).join("\n");
}

function descripcionDeSucursal(s: OpcionSucursal): string {
  return s.direccion ? `${s.nombre} (${s.direccion})` : s.nombre;
}

function listarConDireccion(sucursales: OpcionSucursal[]): string {
  return sucursales.map((s, i) => `${i + 1}. ${descripcionDeSucursal(s)}`).join("\n");
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

    case "horario": {
      const opciones = opcionesVigentes(estado, ctx);
      if (esNegativa(entrada)) return pidioAsesor(estado);
      const elegida = opciones.length > 0 ? elegirOpcion(entrada, opciones) : null;
      if (!elegida) return fallo(estado, textos.reintentoHorario(opciones));
      const programa = ctx.cotizador?.catalogo.programas.find((p) => p.id === estado.programaId)?.nombre ?? "";
      const sucursal = ctx.sucursales.find((s) => s.id === estado.sucursalId)?.nombre ?? null;
      return {
        estado: { ...estado, paso: "completo", intentosFallidos: 0 },
        respuestas: [textos.cierreConHorario(estado.nombre ?? "", elegida, programa, sucursal)],
        pasarAAsesor: "captura_completa",
        efectos: [{ tipo: "elegir_grupo", grupoId: elegida.grupoId }],
      };
    }

    case "otra_sucursal": {
      const otras = otrasSucursalesConPrograma(estado, ctx);
      if (otras.length === 0) return sinPrograma(estado, ctx); // el catálogo cambió: ya no hay nada que ofrecer
      const respuesta = interpretarOtraSucursal(entrada, otras);
      if (respuesta === "no") return sinPrograma({ ...estado, intentosFallidos: 0 }, ctx);
      if (respuesta === null) return fallo(estado, textos.reintentoOtraSucursal(otras));
      return conSucursal({ ...estado, sucursalId: respuesta.id, intentosFallidos: 0 }, ctx, true);
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

/**
 * Ya se sabe la sucursal: sin cotizador se cierra como siempre; con él, se busca programa. Si no hay ninguno
 * (C7) se aplica la política de la organización. `yaOfrecida` = la sucursal viene de aceptar una oferta: si
 * aun así no hubiera programa, no se ofrece otra vez (nada de ciclos), se pasa al asesor.
 */
function conSucursal(estado: EstadoCaptacion, ctx: ContextoCaptacion, yaOfrecida = false): ResultadoCaptacion {
  if (!ctx.cotizador || estado.sucursalId === null || estado.edad === null) return completar(estado, ctx);
  const programas = programasDeLaEdad(estado, ctx);
  if (programas.length === 0) {
    // Un catálogo vacío para la vertical no es «sin programa para su edad»: es que aún no se cargó. Se cierra como siempre.
    if (ctx.cotizador.catalogo.programas.length === 0) return completar(estado, ctx);
    const otras = yaOfrecida || ctx.cotizador.sucursalSinPrograma === "avisar_asesor" ? [] : otrasSucursalesConPrograma(estado, ctx);
    if (otras.length === 0) return sinPrograma(estado, ctx);
    const nombre = estado.nombre ?? "";
    const elegida = ctx.sucursales.find((s) => s.id === estado.sucursalId)?.nombre ?? "";
    return {
      estado: { ...estado, paso: "otra_sucursal", intentosFallidos: 0 },
      respuestas: [otras.length === 1 ? textos.ofrecerOtraSucursal(nombre, estado.edad, elegida, otras[0]!) : textos.ofrecerOtrasSucursales(nombre, estado.edad, elegida, otras)],
      pasarAAsesor: null,
    };
  }
  if (programas.length === 1) return conPrograma(estado, programas[0]!.id, ctx);
  return {
    estado: { ...estado, paso: "programa", intentosFallidos: 0 },
    respuestas: [textos.preguntaPrograma(estado.nombre ?? "", estado.edad, programas)],
    pasarAAsesor: null,
  };
}

/** Las otras sucursales (no la elegida) que sí tienen programa para su edad, en el orden en que se muestran. */
function otrasSucursalesConPrograma(estado: EstadoCaptacion, ctx: ContextoCaptacion): OpcionSucursal[] {
  if (!ctx.cotizador || estado.edad === null) return [];
  const con = new Set(sucursalesConPrograma(ctx.cotizador.catalogo, { verticalId: ctx.cotizador.verticalId, edadDeclarada: estado.edad }));
  return ctx.sucursales.filter((s) => s.id !== estado.sucursalId && con.has(s.id));
}

/** Sin programa y sin otra sucursal que ofrecer (o el contacto prefiere a una persona): pasa al asesor con nota. */
function sinPrograma(estado: EstadoCaptacion, ctx: ContextoCaptacion): ResultadoCaptacion {
  const sucursal = ctx.sucursales.find((s) => s.id === estado.sucursalId)?.nombre ?? "";
  return {
    estado: { ...estado, paso: "completo" },
    respuestas: [textos.sinPrograma(estado.nombre ?? "", estado.edad ?? 0, sucursal)],
    pasarAAsesor: "sin_programa",
  };
}

/**
 * Ya hay un programa: se anota en el prospecto y se le manda la cotización (C8): programa, horarios con lugar, precio
 * y promoción de hoy, y se queda esperando que elija horario. Lo cotizado se guarda con `guardar_cotizacion`.
 */
function conPrograma(estado: EstadoCaptacion, programaId: string, ctx: ContextoCaptacion): ResultadoCaptacion {
  const programa = programasDeLaEdad(estado, ctx).find((p) => p.id === programaId);
  if (!programa || !ctx.cotizador || estado.sucursalId === null || estado.edad === null) return completar(estado, ctx);
  const cotizado = cotizar(ctx.cotizador.catalogo, { verticalId: ctx.cotizador.verticalId, sucursalId: estado.sucursalId, edadDeclarada: estado.edad }).programas.find((p) => p.programaId === programaId);
  if (!cotizado) return completar({ ...estado, programaId }, ctx, programa);

  const sucursal = ctx.sucursales.find((s) => s.id === estado.sucursalId)?.nombre ?? "";
  const opciones = opcionesDeHorario(cotizado);
  const fecha = ctx.cotizador.catalogo.fecha;
  const efectos: EfectoCaptacion[] = [
    { tipo: "programa_sugerido", programaId },
    { tipo: "guardar_cotizacion", programaId, cotizado, fecha, vigenteHasta: vigenteHasta(cotizado, fecha, ctx.cotizador.vigenciaDias) },
  ];
  const mensaje = textos.cotizacion(estado.nombre ?? "", estado.edad, sucursal, cotizado, opciones);
  // Sin horarios que ofrecer, la cotización se manda igual y una persona sigue desde ahí.
  if (opciones.length === 0) return { estado: { ...estado, programaId, paso: "completo" }, respuestas: [mensaje], pasarAAsesor: "captura_completa", efectos };
  return { estado: { ...estado, programaId, paso: "horario", intentosFallidos: 0 }, respuestas: [mensaje], pasarAAsesor: null, efectos };
}

/** Los horarios que se le numeraron: los de la cotización guardada, o (si no hay) los que hoy ofrece el programa. */
function opcionesVigentes(estado: EstadoCaptacion, ctx: ContextoCaptacion): OpcionHorario[] {
  if (ctx.cotizador?.cotizacionGuardada) return ctx.cotizador.cotizacionGuardada.opciones;
  if (!ctx.cotizador || estado.sucursalId === null || estado.edad === null || !estado.programaId) return [];
  const p = cotizar(ctx.cotizador.catalogo, { verticalId: ctx.cotizador.verticalId, sucursalId: estado.sucursalId, edadDeclarada: estado.edad }).programas.find((x) => x.programaId === estado.programaId);
  return p ? opcionesDeHorario(p) : [];
}

function pidioAsesor(estado: EstadoCaptacion): ResultadoCaptacion {
  return { estado: { ...estado, paso: "completo", intentosFallidos: 0 }, respuestas: [textos.pidioAsesor], pasarAAsesor: "pidio_asesor" };
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

const AFIRMATIVAS = new Set(["si", "sip", "claro", "ok", "okay", "dale", "va", "vale", "bueno", "acepto", "quiero", "por favor", "de acuerdo", "esta bien", "si por favor", "si claro", "si quiero", "si me interesa", "me interesa"]);
const NEGATIVAS = new Set(["no", "nel", "nop", "no gracias", "no quiero", "asesor", "un asesor", "con un asesor", "una persona", "persona", "prefiero un asesor"]);

/** «sí» / «no» (completos, sin importar acentos, mayúsculas ni signos). */
export function esAfirmativa(entrada: string): boolean {
  return AFIRMATIVAS.has(sinSignos(entrada));
}
export function esNegativa(entrada: string): boolean {
  return NEGATIVAS.has(sinSignos(entrada));
}
const sinSignos = (entrada: string): string => normalizar(entrada).replace(/[¡!¿?.,;:"'*_-]+/g, " ").replace(/\s+/g, " ").trim();

/** Respuesta a la oferta de otra sucursal: la elegida, «no» (prefiere a un asesor) o null (no se entendió). */
function interpretarOtraSucursal(entrada: string, otras: OpcionSucursal[]): OpcionSucursal | "no" | null {
  if (esNegativa(entrada)) return "no";
  if (otras.length === 1 && esAfirmativa(entrada)) return otras[0]!;
  return elegirOpcion(entrada, otras);
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
