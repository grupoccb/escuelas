// Módulos por organización (V1, decisiones 1 a 3 de docs/PLAN-V1.md): UN lector (invariante 1: va por el scope) que dice qué partes del sistema tiene encendidas
// la escuela. Un módulo apagado no aparece en la interfaz, sus rutas de la API no responden (404 como una ruta que no existe), sus automatizaciones no corren ni
// encolan y el bot no lo ofrece.
//
//   captación      El módulo base y el único que NO se apaga: bot de tres preguntas, pase al asesor, tareas, embudo, reporte de leads, landing, códigos de rastreo y QR,
//                  campañas, Chatwoot y webhooks. La entrada de leads jamás depende de un interruptor.
//   cotizador      Programa, horarios con lugar, precio y promociones por edad; las cotizaciones del lead; la lista de espera.
//   clase_muestra  Agendar, reprogramar y cancelar; el registro que llena el maestro; los avisos al maestro; los recordatorios de la clase.
//   inscripcion    Convertir al lead en familia e inscribir; tutores, alumnos, inscripciones, expediente y la bienvenida. Necesita el cotizador: el asistente de inscripción
//                  elige el grupo con la oferta de programas, horarios, lugares y precios.
//   operacion      Pase de lista, niveles de progresión y eventos.
//   finanzas       Cargos, pagos, estado de cuenta, uniformes por entregar, productos y ventas, y los recordatorios de cobranza.
//   tableros       Los reportes: clases muestra, costo por campaña y el ejecutivo.
//
// Sin lectura (la organización no tiene fila de configuración) TODO está encendido: así las organizaciones que ya existían siguen igual. La plantilla de una
// organización nueva (prisma/seed/plantilla-organizacion.sql) es la que la crea con solo la captación.
//
// No se guarda en memoria entre peticiones: cada lectura va a la base, así que encender o apagar surte efecto en la siguiente petición, sin reiniciar nada.
//
// El catálogo (verticales, sucursales, programas, grupos, precios, promociones, plantillas, automatizaciones, usuarios, canales) NO es de ningún módulo: es la
// configuración con la que se prepara la escuela antes de encender cada uno.

import type { Consultas } from "../datos/alcance.ts";

export const MODULOS = ["captacion", "cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas", "tableros"] as const;
export type Modulo = (typeof MODULOS)[number];

/** Los que se pueden apagar (todos menos la captación). */
export const MODULOS_APAGABLES = MODULOS.filter((m) => m !== "captacion") as readonly Exclude<Modulo, "captacion">[];
export type ModuloApagable = (typeof MODULOS_APAGABLES)[number];

export type ModulosEncendidos = Record<Modulo, boolean>;

export interface DefinicionDeModulo {
  /** Cómo se llama en pantalla (texto de la escuela: sin términos técnicos). */
  nombre: string;
  /** Una línea que explica qué incluye. */
  incluye: string;
  /** Módulos que tienen que estar encendidos para poder encender este. */
  requiere: readonly Modulo[];
}

/** Una sola tabla: la API la sirve y la interfaz la lee de `GET /api/modulos`. */
export const DEFINICION_DE_MODULOS: Readonly<Record<Modulo, DefinicionDeModulo>> = Object.freeze({
  captacion: { nombre: "Captación", incluye: "Atención por WhatsApp (tres preguntas y pase al asesor), tareas, embudo, reporte de leads, página de registro, códigos QR y campañas. Siempre encendido.", requiere: [] },
  cotizador: { nombre: "Cotizador", incluye: "Programa, horarios con lugar, precio y promociones según la edad; cotizaciones del lead y lista de espera. El bot también los ofrece por WhatsApp.", requiere: ["captacion"] },
  clase_muestra: { nombre: "Clase muestra", incluye: "Agendar, reprogramar y cancelar la clase muestra; el registro del maestro; avisos al maestro y recordatorios a la familia.", requiere: ["captacion"] },
  inscripcion: { nombre: "Inscripción", incluye: "Convertir al lead en familia e inscribir al alumno; familias, alumnos, expedientes e inscripciones; mensaje de bienvenida.", requiere: ["captacion", "cotizador"] },
  operacion: { nombre: "Operación diaria (asistencia, niveles y eventos)", incluye: "Pase de lista, niveles de progresión y eventos de la escuela.", requiere: ["inscripcion"] },
  finanzas: { nombre: "Finanzas", incluye: "Cargos, pagos, estado de cuenta, uniformes por entregar, productos y ventas, y recordatorios de pago.", requiere: ["inscripcion"] },
  tableros: { nombre: "Tableros", incluye: "Reportes de clases muestra, costo por campaña y el tablero ejecutivo.", requiere: ["inscripcion", "finanzas", "clase_muestra"] },
});

/** Todo encendido: lo que vale cuando la organización no tiene fila (y lo que tiene la demo). */
export const TODOS_ENCENDIDOS: Readonly<ModulosEncendidos> = Object.freeze({ captacion: true, cotizador: true, clase_muestra: true, inscripcion: true, operacion: true, finanzas: true, tableros: true });

/** Solo la captación: lo que trae la plantilla de una organización nueva. */
export const SOLO_CAPTACION: Readonly<ModulosEncendidos> = Object.freeze({ captacion: true, cotizador: false, clase_muestra: false, inscripcion: false, operacion: false, finanzas: false, tableros: false });

/** Las columnas de `configuracion_organizacion` que guardan cada interruptor. */
export const COLUMNA_DE_MODULO: Readonly<Record<ModuloApagable, string>> = Object.freeze({
  cotizador: "modulo_cotizador",
  clase_muestra: "modulo_clase_muestra",
  inscripcion: "modulo_inscripcion",
  operacion: "modulo_operacion",
  finanzas: "modulo_finanzas",
  tableros: "modulo_tableros",
});

export const SELECCION_DE_MODULOS = { modulo_cotizador: true, modulo_clase_muestra: true, modulo_inscripcion: true, modulo_operacion: true, modulo_finanzas: true, modulo_tableros: true } as const;
export type FilaDeModulos = { [K in keyof typeof SELECCION_DE_MODULOS]: boolean };

export function desdeFilaDeModulos(f: FilaDeModulos): ModulosEncendidos {
  return { captacion: true, cotizador: f.modulo_cotizador, clase_muestra: f.modulo_clase_muestra, inscripcion: f.modulo_inscripcion, operacion: f.modulo_operacion, finanzas: f.modulo_finanzas, tableros: f.modulo_tableros };
}

export function aFilaDeModulos(m: ModulosEncendidos): FilaDeModulos {
  return { modulo_cotizador: m.cotizador, modulo_clase_muestra: m.clase_muestra, modulo_inscripcion: m.inscripcion, modulo_operacion: m.operacion, modulo_finanzas: m.finanzas, modulo_tableros: m.tableros };
}

/** Los módulos de la organización del scope; todos encendidos si no hay fila. Siempre lee de la base (nada se guarda entre peticiones). */
export async function leerModulos(db: Consultas): Promise<ModulosEncendidos> {
  const fila = await db.configuracion_organizacion.findFirst({ select: SELECCION_DE_MODULOS });
  return fila ? desdeFilaDeModulos(fila) : { ...TODOS_ENCENDIDOS };
}

export interface ProblemaDeDependencia {
  /** El módulo que se quiere tener encendido. */
  modulo: Modulo;
  /** El que le falta. */
  falta: Modulo;
}

/** Los módulos encendidos a los que les falta algo de lo que requieren. Vacío = el estado es coherente. */
export function problemasDeDependencia(estado: ModulosEncendidos): ProblemaDeDependencia[] {
  const problemas: ProblemaDeDependencia[] = [];
  for (const m of MODULOS) {
    if (!estado[m]) continue;
    for (const r of DEFINICION_DE_MODULOS[m].requiere) if (!estado[r]) problemas.push({ modulo: m, falta: r });
  }
  return problemas;
}

/**
 * Los mensajes (en español, para la escuela) de por qué el estado `despues` no es válido partiendo de `antes`. Vacío = se puede.
 * Encender algo a lo que le falta su base se rechaza («para encender X, enciende primero Y») y apagar algo de lo que otro depende también
 * («para apagar Y, apaga primero X»): la opción más simple —no se apaga ni se enciende nada en cascada—.
 */
export function explicarProblemas(antes: ModulosEncendidos, despues: ModulosEncendidos): string[] {
  const mensajes: string[] = [];
  if (!despues.captacion) mensajes.push(`${DEFINICION_DE_MODULOS.captacion.nombre} no se puede apagar: por ahí entran los contactos.`);
  const nombre = (m: Modulo) => DEFINICION_DE_MODULOS[m].nombre;
  for (const p of problemasDeDependencia(despues)) {
    if (!antes[p.modulo] && despues[p.modulo]) mensajes.push(`Para encender ${nombre(p.modulo)} primero hay que encender ${nombre(p.falta)}.`);
    else mensajes.push(`Para apagar ${nombre(p.falta)} primero hay que apagar ${nombre(p.modulo)}.`);
  }
  return mensajes;
}

/**
 * A qué módulo pertenece cada evento de automatización. Una tabla escrita a mano: `modulos.test.ts` la compara con el enum de la base, así que un evento
 * nuevo sin módulo hace fallar el test (y el compilador, mientras el tipo `EventoDeAutomatizacion` se mantenga al día).
 */
export const MODULO_DE_EVENTO = {
  lead_sin_respuesta: "captacion",
  lead_frio: "captacion",
  promocion_por_vencer: "cotizador",
  clase_muestra_proxima: "clase_muestra",
  clase_muestra_no_asistio: "clase_muestra",
  inscripcion_creada: "inscripcion",
  cargo_por_vencer: "finanzas",
  cargo_vencido: "finanzas",
  clase_muestra_reprogramada: "clase_muestra",
  clase_muestra_cancelada: "clase_muestra",
} as const satisfies Record<string, Modulo>;
export type EventoDeAutomatizacion = keyof typeof MODULO_DE_EVENTO;

export function moduloDeEvento(evento: string): Modulo | null {
  return (MODULO_DE_EVENTO as Record<string, Modulo>)[evento] ?? null;
}

/** Los eventos cuyo módulo está encendido (para filtrar lo que el motor programa). */
export function eventosEncendidos(modulos: ModulosEncendidos): EventoDeAutomatizacion[] {
  return (Object.keys(MODULO_DE_EVENTO) as EventoDeAutomatizacion[]).filter((e) => modulos[MODULO_DE_EVENTO[e]]);
}

/**
 * A qué módulo pertenece cada tipo de tarea del asesor. Las tareas de un módulo apagado no se listan ni se pueden resolver (la lista de tareas es de la captación, pero no
 * debe mostrar cobranza, faltas ni clases muestra de algo que la escuela no tiene encendido). `modulos.test.ts` la compara con el enum de la base.
 */
export const MODULO_DE_TIPO_DE_TAREA = {
  sin_plantilla_apta: "captacion",
  revision_manual: "captacion",
  baja_volvio_a_escribir: "captacion",
  entrega_fallida: "captacion",
  envio_incierto: "captacion",
  automatizacion_omitida: "captacion",
  baja_solicitada: "captacion",
  nota_fallida: "captacion",
  lead_frio: "captacion",
  evento_inesperado: "captacion",
  lista_espera_nueva: "cotizador",
  lista_espera_lugar_liberado: "cotizador",
  aviso_maestro_no_enviado: "clase_muestra",
  llamar_no_asistio: "clase_muestra",
  avisar_cambio_de_clase: "clase_muestra",
  listo_para_cerrar: "clase_muestra",
  faltas_consecutivas: "operacion",
  beneficio_en_revision: "finanzas",
  deuda_vencida: "finanzas",
  cobranza_sin_canal: "finanzas",
} as const satisfies Record<string, Modulo>;

/** Los tipos de tarea de los módulos que están apagados (para excluirlos de una consulta). */
export function tiposDeTareaApagados(modulos: ModulosEncendidos): (keyof typeof MODULO_DE_TIPO_DE_TAREA)[] {
  return (Object.keys(MODULO_DE_TIPO_DE_TAREA) as (keyof typeof MODULO_DE_TIPO_DE_TAREA)[]).filter((t) => !modulos[MODULO_DE_TIPO_DE_TAREA[t]]);
}
