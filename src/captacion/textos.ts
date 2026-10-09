// Los mensajes del bot de captación que la escuela puede personalizar (V5). El bot sigue siendo una máquina de estados determinista (invariante 10): lo único que cambia es la
// redacción de cada mensaje, y la redacción es una plantilla con huecos (`{nombre}`) que se llenan con datos que ya salen de las tablas o de lo que el contacto contestó. No hay
// lógica en el texto: ni condiciones ni cálculos.
//
// Cada mensaje tiene un texto por omisión AQUÍ (genérico: sin nombres de disciplina ni de sucursal, invariante 2) y, si la escuela lo cambió, una fila en `texto_bot`
// (Administración → Textos del asistente). Sin fila, el bot dice exactamente lo de siempre: una prueba compara cada texto por omisión con la redacción anterior a V5.
//
// Quedan en el código, a propósito: la cotización (arma precios y promociones: dinero exacto), los cierres que llevan piezas condicionales (con o sin sucursal, con o sin lista de espera),
// la confirmación de baja (el contacto pidió no recibir mensajes: su redacción es parte del consentimiento) y la nota interna para el asesor.

import type { OpcionHorario } from "../cotizador/cotizacion.ts";
import type { OpcionFechaMuestra, OpcionPrograma, OpcionSucursal } from "./maquina.ts";

export interface HuecoDeTexto {
  nombre: string;
  /** Qué se escribe en ese hueco, en palabras de la escuela. */
  descripcion: string;
}

/** Los huecos que existen en el bot. Cada mensaje usa solo algunos. */
export const HUECOS = {
  nombre: { nombre: "nombre", descripcion: "el nombre de la persona que tomaría las clases" },
  edad: { nombre: "edad", descripcion: "su edad en años" },
  disciplina: { nombre: "disciplina", descripcion: "el nombre de la disciplina por la que escribieron" },
  sucursal: { nombre: "sucursal", descripcion: "el nombre de la sucursal" },
  otra_sucursal: { nombre: "otra_sucursal", descripcion: "la otra sucursal, con su dirección si la tiene" },
  programa: { nombre: "programa", descripcion: "el nombre del programa" },
  grupo: { nombre: "grupo", descripcion: "el nombre del grupo" },
  horario: { nombre: "horario", descripcion: "el horario del grupo, por ejemplo «lunes de 16:00 a 17:00»" },
  fecha: { nombre: "fecha", descripcion: "la fecha y la hora de la clase muestra" },
  lista: { nombre: "lista", descripcion: "la lista numerada de opciones (la arma el sistema)" },
} as const satisfies Record<string, HuecoDeTexto>;
export type NombreDeHueco = keyof typeof HUECOS;

/** Qué parte del sistema usa el mensaje: si esa parte está apagada, el texto se puede editar pero no se dice nunca. */
export type ModuloDeTexto = "captacion" | "cotizador" | "clase_muestra";

export interface DefinicionDeTexto {
  /** Cuándo lo dice el bot, en palabras de la escuela. */
  cuando: string;
  modulo: ModuloDeTexto;
  /** Los huecos que este mensaje sabe llenar. */
  huecos: readonly NombreDeHueco[];
  /** Los que no pueden faltar (la lista de opciones: sin ella la persona no sabe qué responder). */
  obligatorios?: readonly NombreDeHueco[];
  /** El texto de siempre. */
  defecto: string;
}

export const CATALOGO_DE_TEXTOS = {
  saludo: { cuando: "Primer mensaje, cuando alguien escribe por primera vez.", modulo: "captacion", huecos: ["disciplina"], defecto: "¡Hola! Gracias por escribir a {disciplina}. Para darte horarios y costos exactos te hago tres preguntas rápidas." },
  saludo_con_datos: { cuando: "Primer mensaje cuando la familia ya llenó el formulario de la página y el bot no necesita volver a preguntar.", modulo: "captacion", huecos: ["disciplina", "nombre"], defecto: "¡Hola! Gracias por escribir a {disciplina}. Ya tenemos los datos que nos dejaste para {nombre}." },
  pregunta_nombre: { cuando: "Primera pregunta.", modulo: "captacion", huecos: [], defecto: "¿Cómo se llama la persona que tomaría las clases?" },
  pregunta_edad: { cuando: "Segunda pregunta, ya con el nombre.", modulo: "captacion", huecos: ["nombre"], defecto: "Mucho gusto. ¿Qué edad tiene {nombre}?" },
  pregunta_sucursal: { cuando: "Tercera pregunta, cuando hay más de una sucursal.", modulo: "captacion", huecos: ["lista"], obligatorios: ["lista"], defecto: "¿Qué sucursal te queda mejor? Responde con el número:\n{lista}" },
  cierre_con_sucursal: { cuando: "Al terminar las preguntas, sin cotizador, cuando ya se sabe la sucursal.", modulo: "captacion", huecos: ["nombre", "sucursal"], defecto: "¡Gracias! Ya tengo los datos de {nombre} para la sucursal {sucursal}. Un asesor te escribe por aquí en unos minutos con horarios y costos." },
  cierre_sin_sucursal: { cuando: "Al terminar las preguntas, sin cotizador, cuando no hay sucursal que mencionar.", modulo: "captacion", huecos: ["nombre"], defecto: "¡Gracias! Ya tengo los datos de {nombre}. Un asesor te escribe por aquí en unos minutos con horarios y costos." },
  reintento_nombre: { cuando: "Cuando no se entendió el nombre.", modulo: "captacion", huecos: [], defecto: "No alcancé a leer el nombre. ¿Me lo escribes de nuevo? Solo el nombre, por favor." },
  reintento_edad: { cuando: "Cuando no se entendió la edad.", modulo: "captacion", huecos: [], defecto: "¿Me compartes la edad con número? Por ejemplo: 8" },
  reintento_sucursal: { cuando: "Cuando no se entendió la sucursal.", modulo: "captacion", huecos: ["lista"], obligatorios: ["lista"], defecto: "Responde solo con el número de la sucursal:\n{lista}" },
  pregunta_programa: { cuando: "Cuando hay varios programas para su edad y hay que elegir uno.", modulo: "cotizador", huecos: ["nombre", "edad", "lista"], obligatorios: ["lista"], defecto: "Para {nombre} ({edad} años) tenemos estas opciones. ¿Cuál te interesa? Responde con el número:\n{lista}" },
  reintento_programa: { cuando: "Cuando no se entendió el programa elegido.", modulo: "cotizador", huecos: ["lista"], obligatorios: ["lista"], defecto: "Responde solo con el número del programa:\n{lista}" },
  ofrecer_otra_sucursal: { cuando: "La sucursal elegida no tiene programa para su edad y hay otra que sí.", modulo: "cotizador", huecos: ["nombre", "edad", "sucursal", "otra_sucursal"], obligatorios: ["otra_sucursal"], defecto: "En la sucursal {sucursal} por ahora no tenemos clases para {nombre} ({edad} años), pero en la sucursal {otra_sucursal} sí. ¿Quieres que te cotice ahí? Responde sí o no." },
  ofrecer_otras_sucursales: { cuando: "La sucursal elegida no tiene programa para su edad y hay varias que sí.", modulo: "cotizador", huecos: ["nombre", "edad", "sucursal", "lista"], obligatorios: ["lista"], defecto: "En la sucursal {sucursal} por ahora no tenemos clases para {nombre} ({edad} años), pero sí en estas sucursales. Responde con el número de la que prefieras, o «no» para que te atienda un asesor:\n{lista}" },
  reintento_otra_sucursal_una: { cuando: "Cuando no se entendió el sí o no a la otra sucursal.", modulo: "cotizador", huecos: ["sucursal"], defecto: "Responde sí o no: ¿te cotizo en la sucursal {sucursal}?" },
  reintento_otras_sucursales: { cuando: "Cuando no se entendió cuál de las otras sucursales prefiere.", modulo: "cotizador", huecos: ["lista"], obligatorios: ["lista"], defecto: "Responde con el número de la sucursal, o «no» para que te atienda un asesor:\n{lista}" },
  sin_programa: { cuando: "No hay programa para su edad y se pasa la conversación a un asesor.", modulo: "cotizador", huecos: ["nombre", "edad", "sucursal"], defecto: "Por ahora no encontré un programa para {nombre} ({edad} años) en la sucursal {sucursal}. Te comunico con un asesor para revisar opciones; te escribe por aquí en unos minutos." },
  reintento_horario: { cuando: "Cuando no se entendió el horario elegido.", modulo: "cotizador", huecos: ["lista"], obligatorios: ["lista"], defecto: "Responde con el número del horario, o escribe «asesor» para hablar con una persona:\n{lista}" },
  cotizacion_vencida: { cuando: "Antes de mandar una cotización nueva, porque la anterior venció.", modulo: "cotizador", huecos: [], defecto: "Tu cotización anterior ya venció; te mando una actualizada." },
  horario_no_disponible: { cuando: "Antes de mandar las opciones de nuevo, porque el horario elegido ya no existe.", modulo: "cotizador", huecos: [], defecto: "Ese horario ya no está disponible; te mando las opciones actualizadas." },
  pregunta_lista_espera: { cuando: "Eligió un grupo lleno que acepta lista de espera.", modulo: "cotizador", huecos: ["grupo", "horario"], defecto: "El grupo {grupo} ({horario}) está lleno por ahora. ¿Quieres que te apuntemos en la lista de espera? Si se libera un lugar, un asesor te avisa. Responde sí o no." },
  reintento_lista_espera: { cuando: "Cuando no se entendió el sí o no a la lista de espera.", modulo: "cotizador", huecos: ["grupo"], defecto: "Responde sí o no: ¿te apuntamos en la lista de espera de {grupo}?" },
  cierre_lista_espera: { cuando: "Aceptó entrar a la lista de espera.", modulo: "cotizador", huecos: ["nombre", "grupo", "horario", "programa"], defecto: "Listo, {nombre} quedó en la lista de espera de {grupo} ({horario}) de {programa}. Si se libera un lugar, un asesor te escribe por aquí. Mientras tanto te atiende un asesor para ver otras opciones." },
  otro_horario: { cuando: "No quiso la lista de espera y se le vuelven a mostrar los horarios.", modulo: "cotizador", huecos: ["lista"], obligatorios: ["lista"], defecto: "Sin problema. ¿Cuál otro horario prefieres? Responde con el número, o escribe «asesor» para hablar con una persona:\n{lista}" },
  proponer_fechas_muestra: { cuando: "Eligió un horario con lugar y se le proponen fechas de clase muestra.", modulo: "clase_muestra", huecos: ["nombre", "grupo", "horario", "lista"], obligatorios: ["lista"], defecto: "Para {nombre} podemos agendar una clase muestra en {grupo} ({horario}). Estas son las próximas fechas con lugar; responde con el número de la que prefieras, o escribe «asesor» para hablar con una persona:\n{lista}" },
  reintento_fecha_muestra: { cuando: "Cuando no se entendió la fecha de clase muestra elegida.", modulo: "clase_muestra", huecos: ["lista"], obligatorios: ["lista"], defecto: "Responde con el número de la fecha, o escribe «asesor» para hablar con una persona:\n{lista}" },
  fecha_muestra_sin_lugar: { cuando: "La fecha de clase muestra elegida se llenó mientras contestaba.", modulo: "clase_muestra", huecos: ["lista"], obligatorios: ["lista"], defecto: "Esa fecha ya no tiene lugar. Estas son las que quedan; responde con el número de la que prefieras:\n{lista}" },
  sin_fechas_muestra: { cuando: "Ya no hay fechas con lugar para la clase muestra.", modulo: "clase_muestra", huecos: [], defecto: "Por ahora no hay fechas con lugar para la clase muestra. Te comunico con un asesor para ofrecerte otra opción; te escribe por aquí en unos minutos." },
  muestra_ya_agendada: { cuando: "La clase muestra ya estaba agendada.", modulo: "clase_muestra", huecos: ["nombre", "fecha"], defecto: "{nombre} ya tiene agendada su clase muestra: {fecha}. Si quieres cambiarla, escribe «asesor»." },
  pidio_asesor: { cuando: "La persona pidió hablar con un asesor.", modulo: "captacion", huecos: [], defecto: "Claro, te comunico con un asesor. Te escribe por aquí en unos minutos." },
  sin_entender: { cuando: "El bot no entendió varias respuestas seguidas y pasa la conversación a un asesor.", modulo: "captacion", huecos: [], defecto: "Te comunico con un asesor para ayudarte mejor. En unos minutos te escribe por aquí." },
} as const satisfies Record<string, DefinicionDeTexto>;

export type ClaveDeTexto = keyof typeof CATALOGO_DE_TEXTOS;
export const CLAVES_DE_TEXTO = Object.keys(CATALOGO_DE_TEXTOS) as ClaveDeTexto[];
/** Los textos que la escuela cambió: solo la clave y su redacción. */
export type TextosPersonalizados = Partial<Record<ClaveDeTexto, string>>;

export const MAXIMO_DE_TEXTO = 600;

export const esClaveDeTexto = (clave: string): clave is ClaveDeTexto => Object.hasOwn(CATALOGO_DE_TEXTOS, clave);

const HUECO = /\{([^{}]*)\}/g;
const ENLACE = /https?:|www\.|\b[a-z0-9-]+\.(?:com|mx|org|net|io|me|ly|app|co|info|biz|gl|link|page)\b|wa\.me|t\.me|bit\.ly/i;

/** Un mensaje en palabras si la redacción no sirve para ese mensaje, o null si sirve. */
export function problemaDeTexto(clave: ClaveDeTexto, texto: string): string | null {
  const def: DefinicionDeTexto = CATALOGO_DE_TEXTOS[clave];
  const t = texto.trim();
  if (t === "") return "Escribe el mensaje. Si quieres volver al de siempre, usa «Volver al texto de siempre».";
  if (t.length > MAXIMO_DE_TEXTO) return `El mensaje es muy largo (${t.length} caracteres). Acórtalo a ${MAXIMO_DE_TEXTO} o menos.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) return "El mensaje trae caracteres que no se pueden mandar por WhatsApp. Vuelve a escribirlo a mano.";
  const permitidos: readonly string[] = def.huecos;
  const usados = new Set<string>();
  for (const m of t.matchAll(HUECO)) {
    const nombre = m[1] ?? "";
    if (!permitidos.includes(nombre)) {
      return permitidos.length === 0
        ? `«{${nombre}}» no se puede usar en este mensaje: aquí no hay huecos que llenar. Escribe el mensaje completo.`
        : `«{${nombre}}» no se puede usar en este mensaje. Puedes usar: ${permitidos.map((h) => `{${h}}`).join(", ")}.`;
    }
    usados.add(nombre);
  }
  // Una llave suelta casi siempre es un hueco mal escrito: se avisa en vez de mandarla tal cual a una familia.
  if (/[{}]/.test(t.replace(HUECO, ""))) return "Hay una llave { o } sin pareja. Los huecos se escriben completos, por ejemplo {nombre}.";
  for (const falta of def.obligatorios ?? []) {
    if (!usados.has(falta)) return `Falta {${falta}}: ${HUECOS[falta].descripcion}. Sin él la persona no sabría qué responder.`;
  }
  if (ENLACE.test(t)) return "El mensaje no puede llevar enlaces ni direcciones de internet. Si necesitas dar una dirección de internet, que lo haga el asesor.";
  return null;
}

/** Llena los huecos de una plantilla. Una sola pasada: lo que traiga un dato (un nombre con llaves) no se vuelve a interpretar. PURA. */
export function renderizar(plantilla: string, valores: Partial<Record<NombreDeHueco, string | number>>): string {
  return plantilla.replace(HUECO, (_t, nombre: string) => String(valores[nombre as NombreDeHueco] ?? ""));
}

// ── Las listas numeradas que arma el sistema ───────────────────────────────────────────────────────────

type Sucursal = OpcionSucursal;
type Programa = OpcionPrograma;
type Fecha = OpcionFechaMuestra;

export const descripcionDeSucursal = (s: Sucursal): string => (s.direccion ? `${s.nombre} (${s.direccion})` : s.nombre);
const listar = (sucursales: readonly Sucursal[]): string => sucursales.map((s, i) => `${i + 1}. ${s.nombre}`).join("\n");
const listarConDireccion = (sucursales: readonly Sucursal[]): string => sucursales.map((s, i) => `${i + 1}. ${descripcionDeSucursal(s)}`).join("\n");
const listarFechas = (fechas: readonly Fecha[]): string => fechas.map((f, i) => `${i + 1}. ${f.nombre} · ${f.lugares === 1 ? "1 lugar" : `${f.lugares} lugares`}`).join("\n");
const listarProgramas = (programas: readonly Programa[]): string => programas.map((p, i) => `${i + 1}. ${p.nombre}${p.descripcionPublica ? ` — ${p.descripcionPublica}` : ""}`).join("\n");
const listarHorarios = (opciones: readonly OpcionHorario[]): string => opciones.map((o, i) => `${i + 1}. ${o.nombre}: ${o.horarioTexto}`).join("\n");
const listarHorariosConLugares = (opciones: readonly OpcionHorario[]): string =>
  opciones.map((o, i) => `${i + 1}. ${o.nombre}: ${o.horarioTexto} · ${o.oferta === "lugar" ? (o.lugares === 1 ? "1 lugar" : `${o.lugares} lugares`) : "lista de espera"}`).join("\n");

/**
 * Los mensajes personalizables como funciones, con la personalización de la escuela encima del texto de siempre. Las firmas son las de siempre (`textos` en maquina.ts):
 * el resto del bot no se entera de que el texto viene de una tabla (los que no llevan datos son propiedades de texto, no funciones). PURA.
 */
export function crearTextos(personalizados: TextosPersonalizados = {}) {
  const decir = (clave: ClaveDeTexto, valores: Partial<Record<NombreDeHueco, string | number>> = {}): string => {
    const propio = personalizados[clave];
    // Un texto guardado que ya no pasa la validación (el catálogo cambió entre versiones) no llega a una familia: se usa el de siempre.
    const plantilla = propio !== undefined && problemaDeTexto(clave, propio) === null ? propio.trim() : CATALOGO_DE_TEXTOS[clave].defecto;
    return renderizar(plantilla, valores);
  };
  return {
    saludo: (vertical: string) => decir("saludo", { disciplina: vertical }),
    saludoConDatos: (vertical: string, nombre: string) => decir("saludo_con_datos", { disciplina: vertical, nombre }),
    get preguntaNombre(): string {
      return decir("pregunta_nombre");
    },
    preguntaEdad: (nombre: string) => decir("pregunta_edad", { nombre }),
    preguntaSucursal: (sucursales: readonly Sucursal[]) => decir("pregunta_sucursal", { lista: listar(sucursales) }),
    cierre: (nombre: string, sucursal: string | null) => (sucursal ? decir("cierre_con_sucursal", { nombre, sucursal }) : decir("cierre_sin_sucursal", { nombre })),
    get reintentoNombre(): string {
      return decir("reintento_nombre");
    },
    get reintentoEdad(): string {
      return decir("reintento_edad");
    },
    reintentoSucursal: (sucursales: readonly Sucursal[]) => decir("reintento_sucursal", { lista: listar(sucursales) }),
    preguntaPrograma: (nombre: string, edad: number, programas: readonly Programa[]) => decir("pregunta_programa", { nombre, edad, lista: listarProgramas(programas) }),
    reintentoPrograma: (programas: readonly Programa[]) => decir("reintento_programa", { lista: listarProgramas(programas) }),
    ofrecerOtraSucursal: (nombre: string, edad: number, sucursalElegida: string, otra: Sucursal) => decir("ofrecer_otra_sucursal", { nombre, edad, sucursal: sucursalElegida, otra_sucursal: descripcionDeSucursal(otra) }),
    ofrecerOtrasSucursales: (nombre: string, edad: number, sucursalElegida: string, otras: readonly Sucursal[]) => decir("ofrecer_otras_sucursales", { nombre, edad, sucursal: sucursalElegida, lista: listarConDireccion(otras) }),
    reintentoOtraSucursal: (otras: readonly Sucursal[]) => (otras.length === 1 ? decir("reintento_otra_sucursal_una", { sucursal: otras[0]!.nombre }) : decir("reintento_otras_sucursales", { lista: listarConDireccion(otras) })),
    sinPrograma: (nombre: string, edad: number, sucursal: string) => decir("sin_programa", { nombre, edad, sucursal }),
    reintentoHorario: (opciones: readonly OpcionHorario[]) => decir("reintento_horario", { lista: listarHorarios(opciones) }),
    get cotizacionVencida(): string {
      return decir("cotizacion_vencida");
    },
    get horarioNoDisponible(): string {
      return decir("horario_no_disponible");
    },
    preguntaListaEspera: (o: OpcionHorario) => decir("pregunta_lista_espera", { grupo: o.nombre, horario: o.horarioTexto }),
    reintentoListaEspera: (o: OpcionHorario) => decir("reintento_lista_espera", { grupo: o.nombre }),
    cierreListaEspera: (nombre: string, o: OpcionHorario, programa: string) => decir("cierre_lista_espera", { nombre, grupo: o.nombre, horario: o.horarioTexto, programa }),
    otroHorario: (opciones: readonly OpcionHorario[]) => decir("otro_horario", { lista: listarHorariosConLugares(opciones) }),
    get pidioAsesor(): string {
      return decir("pidio_asesor");
    },
    proponerFechasMuestra: (nombre: string, o: OpcionHorario, fechas: readonly Fecha[]) => decir("proponer_fechas_muestra", { nombre, grupo: o.nombre, horario: o.horarioTexto, lista: listarFechas(fechas) }),
    reintentoFechaMuestra: (fechas: readonly Fecha[]) => decir("reintento_fecha_muestra", { lista: listarFechas(fechas) }),
    fechaMuestraSinLugar: (fechas: readonly Fecha[]) => decir("fecha_muestra_sin_lugar", { lista: listarFechas(fechas) }),
    get sinFechasMuestra(): string {
      return decir("sin_fechas_muestra");
    },
    muestraYaAgendada: (nombre: string, fecha: { nombre: string }) => decir("muestra_ya_agendada", { nombre, fecha: fecha.nombre }),
    get sinEntender(): string {
      return decir("sin_entender");
    },
  };
}

export { listarConDireccion, listarFechas, listarProgramas };
