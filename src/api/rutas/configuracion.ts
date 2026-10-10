// Configuración de la organización (J8, V5): los ajustes de la escuela que antes eran valores fijos — horario de envío, topes de mensajes, tiempos del bot, modo de cierre, política de
// sucursal sin programa, vigencias y umbrales. Solo el administrador la lee y la escribe. Cada cambio queda en el registro de cambios y surte efecto en la siguiente lectura (sin reiniciar).
//
//   GET   /api/configuracion      (catalogo:escribir) — todos los ajustes (los que nunca se tocaron traen su valor por omisión) y, por cada uno, su rango, su valor por omisión y qué pasa si se cambia
//   PATCH /api/configuracion      { …cualquier subconjunto de los ajustes }   (catalogo:escribir) — valida cada ajuste contra el MISMO rango que el CHECK de la base
//
// La lectura de cada ajuste en el resto del sistema sigue siendo `leerConfiguracion()` (src/configuracion/): este archivo solo la edita. Para agregar un ajuste: su columna con CHECK,
// su campo en `leerConfiguracion` y una entrada en `AJUSTES` (la pantalla se arma sola con ella).
//
// Un ajuste de un módulo apagado se puede editar (queda guardado) pero no hace nada hasta que el módulo se encienda: la entrada lo dice en `modulo` y la pantalla lo avisa.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { CONFIGURACION_POR_DEFECTO, MODOS_DE_CIERRE, POLITICAS_SUCURSAL_SIN_PROGRAMA, type ConfiguracionOrganizacion } from "../../configuracion/index.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { validacion, type DetalleDeError } from "../errores.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { entero, enumerado, objeto, opcional, parsear } from "../validar.ts";

type ModuloDeAjuste = "cotizador" | "clase_muestra" | "inscripcion" | "operacion" | "finanzas" | "tableros";
type Unidad = "dias" | "horas" | "minutos" | "mensajes" | "faltas" | "intentos" | "porcentaje" | "hora_del_dia";

interface DefinicionDeAjuste {
  min: number;
  max: number;
  /** En qué se mide el número (la pantalla lo escribe junto al campo). */
  unidad: Unidad;
  /** Cómo se agrupa en la pantalla. */
  grupo: string;
  etiqueta: string;
  ayuda: string;
  /** Qué pasa si se cambia, en palabras de la escuela. */
  efecto: string;
  /** El módulo que usa el ajuste: apagado, se puede editar pero no hace nada. Nulo = lo usa la captación (siempre encendida). */
  modulo: ModuloDeAjuste | null;
  /** Columna de `leerConfiguracion` con el valor por omisión. */
  campo: keyof ConfiguracionOrganizacion;
}

/** Los ajustes numéricos, su rango (el mismo que el CHECK de la base), su valor por omisión y cómo se llaman en pantalla. Una sola tabla: la API la valida y la interfaz la lee de `GET`. */
export const AJUSTES = {
  horario_envio_inicio_min: { min: 540, max: 1199, unidad: "hora_del_dia", grupo: "Horario de los mensajes automáticos", etiqueta: "Los mensajes automáticos salen desde las", ayuda: "Hora local de la sucursal. No puede ser antes de las 09:00.", efecto: "Si la subes, los avisos que caigan antes de esa hora esperan a que abra el horario; los de una clase que empieza antes de que alcancen a salir se descartan y una persona avisa. No se puede abrir antes de las 09:00.", modulo: null, campo: "horarioEnvioInicioMin" },
  horario_envio_fin_min: { min: 541, max: 1200, unidad: "hora_del_dia", grupo: "Horario de los mensajes automáticos", etiqueta: "Y hasta las", ayuda: "Hora local de la sucursal. No puede ser después de las 20:00.", efecto: "Si la bajas, lo que caiga después de esa hora espera al día siguiente. Contestar a una persona que acaba de escribir no tiene horario. No se puede cerrar después de las 20:00.", modulo: null, campo: "horarioEnvioFinMin" },
  max_automaticos_por_dia: { min: 0, max: 100, unidad: "mensajes", grupo: "Frecuencia de mensajes", etiqueta: "Mensajes automáticos por teléfono al día", ayuda: "Tope en una ventana móvil de 24 horas. 0 apaga los automáticos.", efecto: "Si lo bajas, una familia recibe menos avisos al día pero algunos (recordatorios) pueden no salir y quedan como tarea para el asesor. Si lo subes, recibe más.", modulo: null, campo: "maxAutomaticosPorDia" },
  max_marketing_por_ventana: { min: 0, max: 100, unidad: "mensajes", grupo: "Frecuencia de mensajes", etiqueta: "Mensajes de marketing por teléfono en la ventana", ayuda: "Cuántos mensajes de marketing puede recibir un teléfono dentro de la ventana de abajo.", efecto: "Si lo bajas, menos reenganches y promociones llegan a la misma familia. 0 los apaga todos.", modulo: null, campo: "maxMarketingPorVentana" },
  ventana_marketing_dias: { min: 1, max: 365, unidad: "dias", grupo: "Frecuencia de mensajes", etiqueta: "Días de la ventana de marketing", ayuda: "Con 7, un teléfono recibe a lo más un mensaje de marketing cada 7 días.", efecto: "Si la alargas, pasa más tiempo entre un mensaje de marketing y el siguiente a la misma familia.", modulo: null, campo: "ventanaMarketingDias" },
  lead_a_medias_minutos: { min: 5, max: 1440, unidad: "minutos", grupo: "El asistente de WhatsApp", etiqueta: "Minutos de silencio antes de avisar a los asesores", ayuda: "Si alguien deja de contestar a mitad de las preguntas, pasado este tiempo el asesor ve su conversación con lo que alcanzó a decir.", efecto: "Si lo subes, el asesor se entera más tarde de quién dejó la conversación a medias; si lo bajas, se entera antes pero también de quien solo tardó en contestar.", modulo: null, campo: "leadAMediasMinutos" },
  bot_max_intentos: { min: 1, max: 10, unidad: "intentos", grupo: "El asistente de WhatsApp", etiqueta: "Respuestas que no entiende antes de pasar con una persona", ayuda: "Cada vez que la respuesta no se entiende, el asistente repite la pregunta; al llegar a este número pasa la conversación a un asesor.", efecto: "Si lo subes, el asistente insiste más veces antes de pasar con una persona; si lo bajas, pasa antes.", modulo: null, campo: "botMaxIntentos" },
  cotizacion_vigencia_dias: { min: 1, max: 365, unidad: "dias", grupo: "Cotizaciones y lista de espera", etiqueta: "Días que vale una cotización", ayuda: "A lo más; antes vence si lo cotizado vence (una promoción o el precio).", efecto: "Si la alargas, una familia puede decidir con calma sin que se le cotice de nuevo; si la acortas, las cotizaciones vencen antes y el asistente manda una nueva.", modulo: "cotizador", campo: "cotizacionVigenciaDias" },
  lista_espera_oferta_horas: { min: 1, max: 720, unidad: "horas", grupo: "Cotizaciones y lista de espera", etiqueta: "Horas para tomar un lugar de la lista de espera", ayuda: "Pasado ese tiempo el asesor decide si pasa al siguiente.", efecto: "Si la acortas, un lugar liberado se ofrece más rápido a la siguiente familia; si la alargas, la primera tiene más tiempo para contestar.", modulo: "cotizador", campo: "listaEsperaOfertaHoras" },
  clase_muestra_anticipacion_min: { min: 0, max: 10080, unidad: "minutos", grupo: "Clase muestra", etiqueta: "Anticipación mínima para agendar una clase muestra", ayuda: "La clase debe empezar al menos este tiempo después de ahora.", efecto: "Si la subes, ya no se pueden agendar clases para dentro de poco; si la bajas, se aceptan clases casi inmediatas.", modulo: "clase_muestra", campo: "claseMuestraAnticipacionMin" },
  clase_muestra_horizonte_dias: { min: 1, max: 365, unidad: "dias", grupo: "Clase muestra", etiqueta: "Días hacia adelante para agendar una clase muestra", ayuda: "Hasta cuántos días de anticipación se puede agendar.", efecto: "Si la acortas, solo se ofrecen clases de los próximos días; si la alargas, se ofrecen fechas más lejanas.", modulo: "clase_muestra", campo: "claseMuestraHorizonteDias" },
  clase_muestra_correccion_horas: { min: 1, max: 720, unidad: "horas", grupo: "Clase muestra", etiqueta: "Horas para corregir asistió / no asistió", ayuda: "Después de ese tiempo ya no se puede corregir.", efecto: "Si la acortas, un error de asistencia se corrige solo durante menos tiempo; si la alargas, se puede corregir más tarde.", modulo: "clase_muestra", campo: "claseMuestraCorreccionHoras" },
  umbral_faltas_consecutivas: { min: 1, max: 30, unidad: "faltas", grupo: "Avisos al asesor", etiqueta: "Faltas seguidas que avisan al asesor", ayuda: "Cuenta sesiones con pase de lista tomado.", efecto: "Si lo bajas, el asesor recibe más tareas de seguimiento por faltas; si lo subes, solo las de quien lleva muchas seguidas.", modulo: "operacion", campo: "umbralFaltasConsecutivas" },
  umbral_dias_deuda: { min: 1, max: 365, unidad: "dias", grupo: "Avisos al asesor", etiqueta: "Días de atraso que generan tarea de cobranza", ayuda: "Una familia con deuda vencida desde hace esos días genera su tarea.", efecto: "Si lo bajas, el asesor recibe antes la tarea de cobrar; si lo subes, espera más antes de insistir.", modulo: "finanzas", campo: "umbralDiasDeuda" },
  ocupacion_a_reventar_pct: { min: 1, max: 100, unidad: "porcentaje", grupo: "Tablero ejecutivo", etiqueta: "Un grupo está «a reventar» desde el", ayuda: "Porcentaje de lugares ocupados.", efecto: "Solo cambia cómo se marca el grupo en el tablero («abrir otro grupo»); no mueve inscripciones ni cupos. Si lo bajas, más grupos se marcan.", modulo: "tableros", campo: "ocupacionAReventarPct" },
  ocupacion_vacio_pct: { min: 0, max: 99, unidad: "porcentaje", grupo: "Tablero ejecutivo", etiqueta: "Un grupo está «vacío» hasta el", ayuda: "Porcentaje de lugares ocupados. Tiene que ser menor que el de arriba.", efecto: "Solo cambia cómo se marca el grupo en el tablero («promoverlo»); no mueve inscripciones ni cupos. Si lo subes, más grupos se marcan.", modulo: "tableros", campo: "ocupacionVacioPct" },
} as const satisfies Record<string, DefinicionDeAjuste>;
type Clave = keyof typeof AJUSTES;
const CLAVES = Object.keys(AJUSTES) as Clave[];

/** Las dos políticas con nombre (no numéricas). */
const OTRAS = ["sucursal_sin_programa", "modo_cierre"] as const;
const SELECCION = Object.fromEntries([...CLAVES, ...OTRAS].map((k) => [k, true])) as Record<Clave | (typeof OTRAS)[number], true>;

const sinLimites = entero();
const esquemaCambio = objeto({
  ...(Object.fromEntries(CLAVES.map((k) => [k, opcional(sinLimites)])) as Record<Clave, ReturnType<typeof opcional<number>>>),
  sucursal_sin_programa: opcional(enumerado(POLITICAS_SUCURSAL_SIN_PROGRAMA)),
  modo_cierre: opcional(enumerado(MODOS_DE_CIERRE)),
});

type Fila = Record<Clave, number> & { sucursal_sin_programa: string; modo_cierre: string };
const instantanea = (f: Fila): Instantanea => ({ ...f });

/** Los valores por omisión, con los nombres de las columnas (de `CONFIGURACION_POR_DEFECTO`, la misma fuente que el lector: un test compara con la base). */
function porOmision(): Fila {
  const f = { sucursal_sin_programa: CONFIGURACION_POR_DEFECTO.sucursalSinPrograma, modo_cierre: CONFIGURACION_POR_DEFECTO.modoCierre } as Fila;
  for (const k of CLAVES) f[k] = CONFIGURACION_POR_DEFECTO[AJUSTES[k].campo] as number;
  return f;
}

/** Los límites y textos, para que la pantalla no los repita. */
const LIMITES = Object.fromEntries(CLAVES.map((k) => [k, { ...AJUSTES[k], por_omision: porOmision()[k] }]));

/** Las reglas que ven más de un ajuste a la vez, sobre los valores FINALES. Mensajes en palabras de la escuela. */
function problemasCruzados(f: Fila): DetalleDeError[] {
  const e: DetalleDeError[] = [];
  if (f.horario_envio_inicio_min >= f.horario_envio_fin_min) e.push({ campo: "horario_envio_inicio_min", mensaje: "La hora de inicio debe ser antes que la hora de fin. Cambia una de las dos." });
  if (f.ocupacion_vacio_pct >= f.ocupacion_a_reventar_pct) e.push({ campo: "ocupacion_vacio_pct", mensaje: "El porcentaje de «vacío» debe ser menor que el de «a reventar». Baja uno o sube el otro." });
  return e;
}

const nombreDeHora = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Cada número contra su rango, con un mensaje que dice qué hacer. */
function problemasDeRango(c: Partial<Record<Clave, number>>): DetalleDeError[] {
  const e: DetalleDeError[] = [];
  for (const k of CLAVES) {
    const v = c[k];
    if (v === undefined) continue;
    const l = AJUSTES[k];
    if (v >= l.min && v <= l.max) continue;
    e.push({
      campo: k,
      mensaje:
        l.unidad === "hora_del_dia"
          ? `Los mensajes automáticos solo pueden salir entre las 09:00 y las 20:00. Elige una hora de ${nombreDeHora(l.min)} a ${nombreDeHora(l.max)}.`
          : `Escribe un número entero de ${l.min} a ${l.max}.`,
    });
  }
  return e;
}

export function rutasDeConfiguracion(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  const leer = async (ctx: ReturnType<typeof contextoDe>): Promise<Fila> => {
    const fila = (await ctx.db.configuracion_organizacion.findFirst({ select: SELECCION })) as Fila | null;
    return fila ?? porOmision();
  };
  const respuesta = (f: Fila) => ({ ...f, limites: LIMITES, politicas_sucursal_sin_programa: POLITICAS_SUCURSAL_SIN_PROGRAMA, modos_de_cierre: MODOS_DE_CIERRE });

  r.get("/configuracion", requierePermiso("catalogo:escribir"), async (_req, res) => {
    res.json(respuesta(await leer(contextoDe(res))));
  });

  r.patch("/configuracion", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const rangos = problemasDeRango(c);
    if (rangos.length > 0) throw validacion(rangos);
    // K9 (EK-A5): bajo candado, así dos primeros cambios simultáneos no chocan con el único de la fila (antes: 500).
    const salida = await transaccionConBloqueo(ctx.db, ctx.organizacionId, "configuracion_organizacion", async (tx) => {
      const previa = (await tx.configuracion_organizacion.findFirst({ select: SELECCION })) as Fila | null;
      const antes = previa ?? (await leer(ctx));
      // Las reglas entre ajustes se juzgan con el resultado final (lo que quedaría), no con lo que llegó.
      const cruzados = problemasCruzados({ ...antes, ...c });
      if (cruzados.length > 0) throw validacion(cruzados);
      if (previa) await tx.configuracion_organizacion.updateMany({ data: c });
      else await tx.configuracion_organizacion.create({ data: altaConAlcance(c) });
      const fila = await tx.configuracion_organizacion.findFirst({ select: { id: true, ...SELECCION } });
      if (!fila) throw new Error("La configuración no quedó guardada");
      const { id, ...despues } = fila;
      await registrarCambio(tx, ctx, { entidad: "configuracion_organizacion", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues as Fila) });
      return despues as Fila;
    });
    res.json(respuesta(salida));
  });

  return r;
}
