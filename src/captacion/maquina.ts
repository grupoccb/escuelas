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
import type { CatalogoCotizable, GrupoCotizado, ProgramaCotizado } from "../cotizador/tipos.ts";
import { formatear } from "../lib/dinero.ts";
import type { PasoCaptacion } from "../datos/tipos.ts";

export const MAX_INTENTOS = 3;

/**
 * Los pasos en los que la captura va A MEDIAS (el bot espera una respuesta del contacto). Si deja de contestar, a los
 * 30 min se avisa a los asesores (`espera.ts`) y el reenganche de 25 h puede salir (`motor.ts`). Un solo lugar:
 * un paso nuevo que espera respuesta se agrega aquí.
 */
export const PASOS_A_MEDIAS: readonly PasoCaptacion[] = ["nombre", "edad", "sucursal", "programa", "otra_sucursal", "horario", "lista_espera", "fecha_muestra"];

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
  cotizacionGuardada: { opciones: OpcionHorario[]; /** El horario que eligió y está por confirmar (lista de espera). */ grupoElegidoId: string | null } | null;
  /**
   * EC-02: la conversación espera un horario (`horario` o `lista_espera`) pero la cotización que se le mandó ya no vale
   * (venció o se quedó sin opciones). Entonces el número que responda no apunta a nada que haya visto: en vez de
   * interpretarlo contra el catálogo de hoy, el bot manda una cotización nueva. Ausente = falso (solo lo pone `entrante.ts`).
   */
  cotizacionVencida?: boolean;
}

/** Una sesión de clase muestra que se le propone al contacto (D1). `nombre` es el texto numerado («lunes 12 de octubre a las 16:00»). */
export interface OpcionFechaMuestra {
  /** El instante de la sesión, ISO 8601 en UTC. */
  fechaHora: string;
  nombre: string;
  /** Lugares de esa sesión HOY (0 = ya no alcanza o ya no es agendable). */
  lugares: number;
}

/** La clase muestra en el bot (D1). Solo existe si la vertical la tiene encendida además del cotizador. */
export interface ContextoClaseMuestraBot {
  /** Las próximas sesiones CON lugar de cada grupo que se le cotizó (por id de grupo), listas para proponer (a lo más 5). */
  proximasPorGrupo: Record<string, OpcionFechaMuestra[]>;
  /** Lo que ya se le propuso (guardado en la conversación), con los lugares de hoy; null si no hay propuesta. */
  ofrecida: { grupoId: string; opciones: OpcionFechaMuestra[] } | null;
  /** La clase muestra que el prospecto ya tiene agendada en un grupo (por id de grupo), si la hay. */
  yaAgendada: Record<string, OpcionFechaMuestra>;
  /** Nombre de cada grupo involucrado (por id), para los textos. */
  nombresDeGrupo: Record<string, string>;
}

export interface ContextoCaptacion {
  nombreVertical: string;
  /** Sucursales activas que ofrecen la vertical, en el orden en que se muestran. */
  sucursales: OpcionSucursal[];
  /** Presente solo si la vertical tiene el cotizador de WhatsApp encendido. */
  cotizador?: ContextoCotizadorBot;
  /** Presente solo si, además, la vertical tiene encendida la clase muestra por WhatsApp (D1). */
  claseMuestra?: ContextoClaseMuestraBot;
  /** La clase muestra agendada que el prospecto tiene (D1): con ella, un «gracias» no pasa la conversación a una persona. */
  claseAgendada?: { texto: string } | null;
  /**
   * E1: el lead llenó el cuestionario de la landing, así que su prospecto ya trae nombre y edad (y la sucursal que eligió). Con esto el bot saluda y
   * sigue desde lo que falta en vez de volver a preguntar (cero recaptura). Solo aplica en el primer mensaje (`inicio`).
   */
  datosDeLanding?: boolean;
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

/** Por qué se le deja una nota a los asesores: los motivos de pase y el aviso de una clase muestra agendada por el bot (D1). */
export type MotivoDeNota = MotivoPaseAsesor | "muestra_agendada";

/** Lo que la máquina pide hacer en la base; lo ejecuta quien la llama, en su transacción. */
export type EfectoCaptacion =
  | { tipo: "programa_sugerido"; programaId: string }
  /** Guardar lo cotizado (programa, horarios con lugar, precios y promociones de hoy) para el prospecto. */
  | { tipo: "guardar_cotizacion"; programaId: string; cotizado: ProgramaCotizado; fecha: string; vigenteHasta: string }
  /** El contacto eligió este horario (grupo) de la cotización guardada; null = lo descartó. */
  | { tipo: "elegir_grupo"; grupoId: string | null }
  /** El contacto aceptó entrar a la lista de espera de este grupo lleno (C9). */
  | { tipo: "entrar_lista_espera"; grupoId: string }
  /** Se le propusieron estas sesiones de clase muestra de un grupo (D1): se guardan para que el número que responda apunte a lo que vio. */
  | { tipo: "ofrecer_fechas_muestra"; grupoId: string; fechas: string[] }
  /** El contacto eligió esta sesión (ISO): se agenda su clase muestra (D1). */
  | { tipo: "agendar_muestra"; grupoId: string; fechaHora: string };

export interface ResultadoCaptacion {
  estado: EstadoCaptacion;
  respuestas: string[];
  pasarAAsesor: MotivoPaseAsesor | null;
  /** Solo viene cuando hay algo que hacer. */
  efectos?: EfectoCaptacion[];
  /**
   * Nota interna para los asesores SIN pasarles la conversación (D1): el bot agendó una clase muestra y sigue atendiendo
   * (los recordatorios lo necesitan: con una persona a cargo, ninguna automatización sale — invariante 6). La conversación
   * se hace visible para los asesores (se abre en Chatwoot) pero no se marca `en_atencion_humana`.
   */
  notaAAsesores?: "muestra_agendada";
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
  /** E1: el contacto ya llenó el cuestionario de la landing; no se le pregunta otra vez lo que ya dio. */
  saludoConDatos: (vertical: string, nombre: string) => `¡Hola! Gracias por escribir a ${vertical}. Ya tenemos los datos que nos dejaste para ${nombre}.`,
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
  /** D1: se le proponen las próximas sesiones de clase muestra del grupo que eligió. */
  proponerFechasMuestra: (nombre: string, o: OpcionHorario, fechas: OpcionFechaMuestra[]) =>
    `Para ${nombre} podemos agendar una clase muestra en ${o.nombre} (${o.horarioTexto}). Estas son las próximas fechas con lugar; responde con el número de la que prefieras, o escribe «asesor» para hablar con una persona:\n${listarFechas(fechas)}`,
  reintentoFechaMuestra: (fechas: OpcionFechaMuestra[]) => `Responde con el número de la fecha, o escribe «asesor» para hablar con una persona:\n${listarFechas(fechas)}`,
  /** D1: la fecha que eligió ya no tiene lugar; quedan estas. */
  fechaMuestraSinLugar: (fechas: OpcionFechaMuestra[]) => `Esa fecha ya no tiene lugar. Estas son las que quedan; responde con el número de la que prefieras:\n${listarFechas(fechas)}`,
  /** D1: ninguna sesión tiene lugar (o el grupo no tiene más): lo atiende una persona. */
  sinFechasMuestra: "Por ahora no hay fechas con lugar para la clase muestra. Te comunico con un asesor para ofrecerte otra opción; te escribe por aquí en unos minutos.",
  muestraAgendada: (nombre: string, grupo: string, fecha: OpcionFechaMuestra, sucursal: string | null) =>
    `¡Listo! Agendamos la clase muestra de ${nombre} en ${grupo}${sucursal ? `, sucursal ${sucursal}` : ""}: ${fecha.nombre}. Te mandamos un recordatorio antes de la clase. Si necesitas cambiar la fecha, escríbenos por aquí.`,
  /** D1: ya tenía una clase muestra vigente en ese grupo (la agendó una persona mientras tanto). */
  muestraYaAgendada: (nombre: string, fecha: OpcionFechaMuestra) => `${nombre} ya tiene agendada su clase muestra: ${fecha.nombre}. Si quieres cambiarla, escribe «asesor».`,
  /** D1: un agradecimiento después de agendar no pasa la conversación a una persona. */
  deNada: (fecha: string) => `¡Con gusto! Te esperamos en la clase muestra (${fecha}). Si necesitas cambiar la fecha o tienes dudas, escribe «asesor».`,
  /** EC-02 / EC-01: lo que el contacto vio ya no vale; se le manda la cotización de hoy. */
  cotizacionVencida: "Tu cotización anterior ya venció; te mando una actualizada.",
  horarioNoDisponible: "Ese horario ya no está disponible; te mando las opciones actualizadas.",
  /** EC-04: eligió un horario que se llenó mientras contestaba (y no tiene lista de espera). */
  cierreConHorarioLleno: (nombre: string, o: OpcionHorario, programa: string, sucursal: string | null) =>
    `Anotamos tu preferencia por ${o.nombre} (${o.horarioTexto}) de ${programa}${sucursal ? `, sucursal ${sucursal}` : ""}, pero en este momento ese grupo ya no tiene lugar disponible. Un asesor te escribe por aquí en unos minutos para ofrecerte otra opción para ${nombre}.`,
  /** C9: eligió un horario lleno que permite lista de espera. */
  preguntaListaEspera: (o: OpcionHorario) =>
    `El grupo ${o.nombre} (${o.horarioTexto}) está lleno por ahora. ¿Quieres que te apuntemos en la lista de espera? Si se libera un lugar, un asesor te avisa. Responde sí o no.`,
  reintentoListaEspera: (o: OpcionHorario) => `Responde sí o no: ¿te apuntamos en la lista de espera de ${o.nombre}?`,
  cierreListaEspera: (nombre: string, o: OpcionHorario, programa: string) =>
    `Listo, ${nombre} quedó en la lista de espera de ${o.nombre} (${o.horarioTexto}) de ${programa}. Si se libera un lugar, un asesor te escribe por aquí. Mientras tanto te atiende un asesor para ver otras opciones.`,
  /** C9: no quiso la lista de espera; se le vuelven a mostrar los horarios. */
  otroHorario: (opciones: OpcionHorario[]) =>
    `Sin problema. ¿Cuál otro horario prefieres? Responde con el número, o escribe «asesor» para hablar con una persona:\n${opciones.map((o, i) => `${i + 1}. ${o.nombre}: ${o.horarioTexto} · ${o.oferta === "lugar" ? (o.lugares === 1 ? "1 lugar" : `${o.lugares} lugares`) : "lista de espera"}`).join("\n")}`,
  cierreConPrograma: (nombre: string, programa: string, sucursal: string | null) =>
    `¡Gracias! Ya tengo los datos de ${nombre} para ${programa}${sucursal ? ` en la sucursal ${sucursal}` : ""}. Un asesor te escribe por aquí en unos minutos con horarios y costos.`,
  /** Única respuesta a una baja: sale una sola vez y es lo último que el sistema le manda. */
  confirmacionBaja: "Listo, ya no recibirás más mensajes de nuestra parte. Gracias por tu tiempo.",
  sinEntender: "Te comunico con un asesor para ayudarte mejor. En unos minutos te escribe por aquí.",
  /** Nota interna para el asesor al pasarle la conversación. */
  resumenAsesor: (
    motivo: MotivoDeNota,
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
        : motivo === "muestra_agendada"
          ? "El bot agendó una clase muestra. Nadie ha tomado la conversación: el bot sigue atendiendo y los recordatorios saldrán solos hasta que una persona la tome (asígnatela o escríbele). Datos capturados:"
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

function listarFechas(fechas: OpcionFechaMuestra[]): string {
  return fechas.map((f, i) => `${i + 1}. ${f.nombre} · ${f.lugares === 1 ? "1 lugar" : `${f.lugares} lugares`}`).join("\n");
}

function listarProgramas(programas: OpcionPrograma[]): string {
  return programas.map((p, i) => `${i + 1}. ${p.nombre}${p.descripcionPublica ? ` — ${p.descripcionPublica}` : ""}`).join("\n");
}

// ---------------------------------------------------------------------------------------------

export function avanzar(estado: EstadoCaptacion, entrada: string, ctx: ContextoCaptacion): ResultadoCaptacion {
  switch (estado.paso) {
    case "inicio":
      if (ctx.datosDeLanding && estado.nombre && estado.edad !== null) {
        const base: EstadoCaptacion = { ...estado, intentosFallidos: 0 };
        // Con la sucursal ya elegida (o una sola) se sigue de ahí; si falta y hay varias, es lo único que se pregunta.
        const siguiente: ResultadoCaptacion =
          estado.sucursalId !== null || ctx.sucursales.length <= 1
            ? conSucursal({ ...base, sucursalId: estado.sucursalId ?? ctx.sucursales[0]?.id ?? null }, ctx)
            : { estado: { ...base, paso: "sucursal" }, respuestas: [textos.preguntaSucursal(ctx.sucursales)], pasarAAsesor: null };
        return { ...siguiente, respuestas: [textos.saludoConDatos(ctx.nombreVertical, estado.nombre), ...siguiente.respuestas] };
      }
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
      // EC-03: sin cotizador (se apagó con la conversación a medias) no hay nada que elegir: cierra como la captura de siempre.
      if (!ctx.cotizador) return completar(estado, ctx);
      if (esNegativa(entrada) || pidePersona(entrada)) return pidioAsesor(estado);
      // EC-02: la cotización que vio ya no vale; no se interpreta un número contra una lista que no vio.
      if (ctx.cotizador.cotizacionVencida) return cotizarDeNuevo(estado, ctx, textos.cotizacionVencida);
      const opciones = opcionesVigentes(estado, ctx);
      if (opciones.length === 0) return completar(estado, ctx); // EC-03: nada que ofrecer (ya no hay lugar en ningún grupo)
      const elegida = elegirOpcion(entrada, opciones);
      if (!elegida) return fallo(estado, textos.reintentoHorario(opciones));
      const hoy = grupoDeHoy(estado, ctx, elegida.grupoId);
      // EC-01: el grupo que eligió ya no existe en el catálogo (se dio de baja o se desactivó).
      if (!hoy) return cotizarDeNuevo(estado, ctx, textos.horarioNoDisponible);
      // EC-04: se llenó mientras contestaba y no tiene lista de espera: se anota su preferencia, pero se le dice la verdad.
      if (hoy.cupo.oferta === "sin_lugar") {
        const programaLleno = ctx.cotizador.catalogo.programas.find((p) => p.id === estado.programaId)?.nombre ?? "";
        const sucursalLlena = ctx.sucursales.find((s) => s.id === estado.sucursalId)?.nombre ?? null;
        return {
          estado: { ...estado, paso: "completo", intentosFallidos: 0 },
          respuestas: [textos.cierreConHorarioLleno(estado.nombre ?? "", elegida, programaLleno, sucursalLlena)],
          pasarAAsesor: "captura_completa",
          efectos: [{ tipo: "elegir_grupo", grupoId: elegida.grupoId }],
        };
      }
      // Un horario lleno con lista de espera: antes de cerrar se pregunta si quiere entrar a la lista (C9). EF-16 (hermano de EC-04): también cuando se
      // llenó MIENTRAS contestaba (lo cotizado decía «lugar» y hoy dice «lista de espera»): se le dice la verdad en vez de «Anotamos a…».
      const aElegir: OpcionHorario = hoy.cupo.oferta === "lista_de_espera" ? { ...elegida, oferta: "lista_de_espera", lugares: 0 } : elegida;
      if (aElegir.oferta === "lista_de_espera") {
        return {
          estado: { ...estado, paso: "lista_espera", intentosFallidos: 0 },
          respuestas: [textos.preguntaListaEspera(aElegir)],
          pasarAAsesor: null,
          efectos: [{ tipo: "elegir_grupo", grupoId: elegida.grupoId }],
        };
      }
      // D1: con la clase muestra encendida, antes de cerrar se le proponen las próximas fechas con lugar de ese grupo.
      const muestra = proponerClaseMuestra(estado, ctx, elegida);
      if (muestra) return muestra;
      const programa = ctx.cotizador?.catalogo.programas.find((p) => p.id === estado.programaId)?.nombre ?? "";
      const sucursal = ctx.sucursales.find((s) => s.id === estado.sucursalId)?.nombre ?? null;
      return {
        estado: { ...estado, paso: "completo", intentosFallidos: 0 },
        respuestas: [textos.cierreConHorario(estado.nombre ?? "", elegida, programa, sucursal)],
        pasarAAsesor: "captura_completa",
        efectos: [{ tipo: "elegir_grupo", grupoId: elegida.grupoId }],
      };
    }

    case "lista_espera": {
      if (!ctx.cotizador) return completar(estado, ctx); // EC-03
      if (ctx.cotizador.cotizacionVencida) return pidePersona(entrada) ? pidioAsesor(estado) : cotizarDeNuevo({ ...estado, paso: "horario" }, ctx, textos.cotizacionVencida); // EC-02
      const opciones = opcionesVigentes(estado, ctx);
      if (opciones.length === 0) return completar(estado, ctx); // EC-03
      const grupoId = ctx.cotizador.cotizacionGuardada?.grupoElegidoId ?? null;
      const elegida = opciones.find((o) => o.grupoId === grupoId);
      if (!elegida) return fallo({ ...estado, paso: "horario" }, textos.reintentoHorario(opciones)); // no hay a qué lista: vuelve a los horarios
      if (esAfirmativa(entrada)) {
        // EC-01: el grupo ya no existe: no se le dice que quedó en una lista que no existe.
        if (!grupoDeHoy(estado, ctx, elegida.grupoId)) return cotizarDeNuevo({ ...estado, paso: "horario" }, ctx, textos.horarioNoDisponible);
        const programa = ctx.cotizador?.catalogo.programas.find((p) => p.id === estado.programaId)?.nombre ?? "";
        return {
          estado: { ...estado, paso: "completo", intentosFallidos: 0 },
          respuestas: [textos.cierreListaEspera(estado.nombre ?? "", elegida, programa)],
          pasarAAsesor: "captura_completa",
          efectos: [{ tipo: "entrar_lista_espera", grupoId: elegida.grupoId }],
        };
      }
      if (esNegativa(entrada)) {
        // Dijo que no: se descarta el horario tentativo y se le vuelven a mostrar los demás.
        return {
          estado: { ...estado, paso: "horario", intentosFallidos: 0 },
          respuestas: [textos.otroHorario(opciones)],
          pasarAAsesor: null,
          efectos: [{ tipo: "elegir_grupo", grupoId: null }],
        };
      }
      if (pidePersona(entrada)) return pidioAsesor(estado);
      return fallo(estado, textos.reintentoListaEspera(elegida));
    }

    case "otra_sucursal": {
      if (!ctx.cotizador) return completar(estado, ctx); // EC-03: el interruptor se apagó con la oferta pendiente
      const otras = otrasSucursalesConPrograma(estado, ctx);
      if (otras.length === 0) return sinPrograma(estado, ctx); // el catálogo cambió: ya no hay nada que ofrecer
      const respuesta = interpretarOtraSucursal(entrada, otras);
      if (respuesta === "no") return sinPrograma({ ...estado, intentosFallidos: 0 }, ctx);
      if (respuesta === null) return fallo(estado, textos.reintentoOtraSucursal(otras));
      return conSucursal({ ...estado, sucursalId: respuesta.id, intentosFallidos: 0 }, ctx, true);
    }

    case "programa": {
      if (!ctx.cotizador) return completar(estado, ctx); // EC-03
      const opciones = programasDeLaEdad(estado, ctx);
      const elegido = elegirOpcion(entrada, opciones);
      if (!elegido) return fallo(estado, textos.reintentoPrograma(opciones));
      return conPrograma({ ...estado, intentosFallidos: 0 }, elegido.id, ctx);
    }

    case "fecha_muestra": {
      if (!ctx.cotizador || !ctx.claseMuestra) return completar(estado, ctx); // el interruptor se apagó con la propuesta pendiente (como EC-03)
      if (esNegativa(entrada) || pidePersona(entrada)) return pidioAsesor(estado);
      const propuesta = ctx.claseMuestra.ofrecida;
      const grupoId = propuesta?.grupoId ?? ctx.cotizador.cotizacionGuardada?.grupoElegidoId ?? null;
      if (!grupoId) return completar(estado, ctx);
      const ya = ctx.claseMuestra.yaAgendada[grupoId];
      if (ya) return agendada(estado, ctx, grupoId, ya, false);
      const proximas = ctx.claseMuestra.proximasPorGrupo[grupoId] ?? [];
      const opciones = propuesta?.opciones ?? [];
      // Sin propuesta guardada no hay a qué número responder: se le manda una nueva.
      if (opciones.length === 0) return reproponerFechas(estado, grupoId, proximas, textos.fechaMuestraSinLugar);
      const elegida = elegirOpcion(entrada, opciones);
      if (!elegida) return fallo(estado, textos.reintentoFechaMuestra(opciones));
      // Se llenó (o ya no alcanza la anticipación) mientras contestaba: las que quedan.
      if (elegida.lugares < 1) return reproponerFechas(estado, grupoId, proximas, textos.fechaMuestraSinLugar);
      return agendada(estado, ctx, grupoId, elegida, true);
    }

    case "completo":
      // Ya agendó su clase muestra y solo da las gracias: el bot sigue con la conversación (con una persona a cargo, los
      // recordatorios no saldrían: invariante 6). Cualquier otra cosa se pasa a una persona.
      if (ctx.claseAgendada && esAgradecimiento(entrada)) return { estado, respuestas: [textos.deNada(ctx.claseAgendada.texto)], pasarAAsesor: null };
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

/** El grupo (con su cupo de HOY) dentro del programa del contacto, o undefined si ya no está en el catálogo (se dio de baja, se desactivó o perdió sus horarios). */
function grupoDeHoy(estado: EstadoCaptacion, ctx: ContextoCaptacion, grupoId: string): GrupoCotizado | undefined {
  if (!ctx.cotizador || estado.sucursalId === null || estado.edad === null || !estado.programaId) return undefined;
  const p = cotizar(ctx.cotizador.catalogo, { verticalId: ctx.cotizador.verticalId, sucursalId: estado.sucursalId, edadDeclarada: estado.edad }).programas.find((x) => x.programaId === estado.programaId);
  return p?.grupos.find((g) => g.grupoId === grupoId);
}

/**
 * Lo que el contacto vio ya no vale (la cotización venció o el horario ya no existe): se manda la cotización de HOY,
 * que reemplaza a la anterior, con un aviso al principio. Sin programa anotado, cierra como la captura de siempre.
 */
function cotizarDeNuevo(estado: EstadoCaptacion, ctx: ContextoCaptacion, aviso: string): ResultadoCaptacion {
  if (!estado.programaId) return completar(estado, ctx);
  const r = conPrograma({ ...estado, paso: "horario", intentosFallidos: 0 }, estado.programaId, ctx);
  // Solo se antepone el aviso si de verdad hay una cotización nueva esperando horario.
  if (r.estado.paso !== "horario") return r;
  return { ...r, respuestas: r.respuestas.map((m, i) => (i === 0 ? `${aviso}\n\n${m}` : m)) };
}

/**
 * D1: el contacto eligió un horario con lugar y la vertical agenda la clase muestra: se le proponen las próximas fechas con
 * lugar de ese grupo (a lo más 5) y se espera su elección. null si no se aplica (sin clase muestra, o ese grupo no tiene
 * fechas con lugar: entonces se cierra como antes y un asesor lo resuelve).
 */
function proponerClaseMuestra(estado: EstadoCaptacion, ctx: ContextoCaptacion, elegida: OpcionHorario): ResultadoCaptacion | null {
  if (!ctx.claseMuestra || elegida.oferta !== "lugar") return null;
  const ya = ctx.claseMuestra.yaAgendada[elegida.grupoId];
  if (ya) return agendada(estado, ctx, elegida.grupoId, ya, false);
  const fechas = ctx.claseMuestra.proximasPorGrupo[elegida.grupoId] ?? [];
  if (fechas.length === 0) return null;
  return {
    estado: { ...estado, paso: "fecha_muestra", intentosFallidos: 0 },
    respuestas: [textos.proponerFechasMuestra(estado.nombre ?? "", elegida, fechas)],
    pasarAAsesor: null,
    efectos: [
      { tipo: "elegir_grupo", grupoId: elegida.grupoId },
      { tipo: "ofrecer_fechas_muestra", grupoId: elegida.grupoId, fechas: fechas.map((f) => f.fechaHora) },
    ],
  };
}

/** La propuesta ya no sirve (se llenó o no hay propuesta): las fechas con lugar de hoy, o a una persona si no queda ninguna. */
function reproponerFechas(estado: EstadoCaptacion, grupoId: string, fechas: OpcionFechaMuestra[], texto: (f: OpcionFechaMuestra[]) => string): ResultadoCaptacion {
  if (fechas.length === 0) return { estado: { ...estado, paso: "completo", intentosFallidos: 0 }, respuestas: [textos.sinFechasMuestra], pasarAAsesor: "captura_completa", efectos: [{ tipo: "elegir_grupo", grupoId }] };
  return {
    estado: { ...estado, paso: "fecha_muestra", intentosFallidos: 0 },
    respuestas: [texto(fechas)],
    pasarAAsesor: null,
    efectos: [{ tipo: "ofrecer_fechas_muestra", grupoId, fechas: fechas.map((f) => f.fechaHora) }],
  };
}

/**
 * Quedó (o ya estaba) agendada: se confirma. El bot NO pasa la conversación a una persona —seguiría callado y los
 * recordatorios no saldrían—; deja una nota a los asesores y la hace visible.
 */
function agendada(estado: EstadoCaptacion, ctx: ContextoCaptacion, grupoId: string, fecha: OpcionFechaMuestra, nueva: boolean): ResultadoCaptacion {
  const grupo = ctx.claseMuestra?.nombresDeGrupo[grupoId] ?? "";
  const sucursal = ctx.sucursales.find((s) => s.id === estado.sucursalId)?.nombre ?? null;
  return {
    estado: { ...estado, paso: "completo", intentosFallidos: 0 },
    respuestas: [nueva ? textos.muestraAgendada(estado.nombre ?? "", grupo, fecha, sucursal) : textos.muestraYaAgendada(estado.nombre ?? "", fecha)],
    pasarAAsesor: null,
    notaAAsesores: "muestra_agendada",
    ...(nueva ? { efectos: [{ tipo: "agendar_muestra" as const, grupoId, fechaHora: fecha.fechaHora }] } : {}),
  };
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

const AGRADECIMIENTOS = new Set(["gracias", "muchas gracias", "mil gracias", "ok gracias", "ok", "okay", "listo", "perfecto", "excelente", "genial", "enterado", "de acuerdo", "vale", "gracias por la informacion", "ok muchas gracias", "ahi estaremos", "ahi nos vemos"]);
/** Un agradecimiento o un «enterado» (completo, sin acentos ni signos). */
export function esAgradecimiento(entrada: string): boolean {
  return AGRADECIMIENTOS.has(normalizar(entrada).replace(/[¡!¿?.,;:"'*_-]+/g, " ").replace(/\s+/g, " ").trim());
}

const AFIRMATIVAS = new Set(["si", "sip", "claro", "ok", "okay", "dale", "va", "vale", "bueno", "acepto", "quiero", "por favor", "de acuerdo", "esta bien", "si por favor", "si claro", "si quiero", "si me interesa", "me interesa"]);
const NEGATIVAS = new Set(["no", "nel", "nop", "no gracias", "no quiero"]);
const PIDEN_PERSONA = new Set(["asesor", "un asesor", "con un asesor", "una persona", "persona", "prefiero un asesor"]);

const sinSignos = (entrada: string): string => normalizar(entrada).replace(/[¡!¿?.,;:"'*_-]+/g, " ").replace(/\s+/g, " ").trim();

/** «sí» (completo, sin importar acentos, mayúsculas ni signos). */
export function esAfirmativa(entrada: string): boolean {
  return AFIRMATIVAS.has(sinSignos(entrada));
}
/** «no» (completo). */
export function esNegativa(entrada: string): boolean {
  return NEGATIVAS.has(sinSignos(entrada));
}
/** Pide hablar con una persona («asesor», «una persona»…). */
export function pidePersona(entrada: string): boolean {
  return PIDEN_PERSONA.has(sinSignos(entrada));
}

/** Respuesta a la oferta de otra sucursal: la elegida, «no» (prefiere a un asesor) o null (no se entendió). */
function interpretarOtraSucursal(entrada: string, otras: OpcionSucursal[]): OpcionSucursal | "no" | null {
  if (esNegativa(entrada) || pidePersona(entrada)) return "no";
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
