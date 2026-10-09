// Las hojas de la carga del catálogo (V6): qué columnas lleva cada una, cómo se llaman (en palabras de la escuela), cuáles son obligatorias y cómo se reconoce un archivo
// por sus encabezados. PURO. Las plantillas que se descargan (`plantillas.ts`) y el importador (`plan.ts`) salen de esta única tabla, así no se pueden desfasar.
//
// Los nombres de disciplina, sucursal, programa… NO aparecen aquí: son datos que llena la escuela (invariante 2). Los ejemplos de las plantillas son inventados y empiezan con
// «EJEMPLO»: el importador ignora esas filas.

import { claveDeNombre } from "./valores.ts";

export const TIPOS = ["disciplinas", "sucursales", "salones", "instructores", "programas", "grupos", "horarios", "precios"] as const;
export type Tipo = (typeof TIPOS)[number];

export interface Columna {
  /** Nombre interno en el código (no se muestra). */
  clave: string;
  /** Encabezado que lleva la plantilla y que se nombra en los mensajes. */
  titulo: string;
  /** Otros encabezados que también se aceptan (sin distinguir mayúsculas ni acentos). */
  alias?: readonly string[];
  obligatoria: boolean;
  /** Una línea para la hoja de instrucciones. */
  ayuda: string;
  /** El valor de la fila de ejemplo (inventado). */
  ejemplo: string;
}

export interface EsquemaDeHoja {
  tipo: Tipo;
  /** Nombre del archivo de la plantilla. */
  archivo: string;
  /** Plural para frases («archivo de salones»). */
  plural: string;
  singular: string;
  /** Una línea: qué es esta hoja. */
  descripcion: string;
  columnas: readonly Columna[];
}

const c = (clave: string, titulo: string, obligatoria: boolean, ayuda: string, ejemplo: string, alias: readonly string[] = []): Columna => ({ clave, titulo, obligatoria, ayuda, ejemplo, alias });

export const SUCURSAL_EJEMPLO = "EJEMPLO Sucursal Centro";
export const PROGRAMA_EJEMPLO = "EJEMPLO Programa infantil";
export const GRUPO_EJEMPLO = "EJEMPLO Grupo lunes y miércoles";
export const SALON_EJEMPLO = "EJEMPLO Salón 1";
export const INSTRUCTOR_EJEMPLO = "EJEMPLO Nombre Apellido";

export const ESQUEMAS: Readonly<Record<Tipo, EsquemaDeHoja>> = {
  disciplinas: {
    tipo: "disciplinas",
    archivo: "disciplinas.csv",
    plural: "disciplinas",
    singular: "disciplina",
    descripcion: "Lo que imparte la escuela (cada disciplina o actividad). Una fila por disciplina.",
    columnas: [
      c("nombre", "Disciplina", true, "El nombre como lo conocen las familias.", "EJEMPLO Disciplina", ["Nombre", "Nombre de la disciplina"]),
      c("color", "Color", false, "Color de la marca, como #2E7D32. Si lo dejas vacío, se usa el de la escuela.", "#2E7D32", ["Color de marca"]),
    ],
  },
  sucursales: {
    tipo: "sucursales",
    archivo: "sucursales.csv",
    plural: "sucursales",
    singular: "sucursal",
    descripcion: "Los lugares donde se dan clases. Una fila por sucursal.",
    columnas: [
      c("nombre", "Sucursal", true, "El nombre de la sucursal. No uses los signos | ; ni / en el nombre.", SUCURSAL_EJEMPLO, ["Nombre", "Nombre de la sucursal"]),
      c("direccion", "Dirección", false, "Calle, número, colonia y ciudad, como la leerías en un mapa.", "Calle Falsa 123, Col. Ejemplo, Ciudad de Ejemplo", ["Direccion", "Dirección completa", "Domicilio"]),
      c("zona", "Zona horaria", true, "Centro, Pacífico, Sonora, Noroeste o Quintana Roo. De ahí sale el horario de los mensajes.", "Centro", ["Zona", "Hora"]),
    ],
  },
  salones: {
    tipo: "salones",
    archivo: "salones.csv",
    plural: "salones",
    singular: "salón",
    descripcion: "Los salones de cada sucursal. Una fila por salón.",
    columnas: [
      c("sucursal", "Sucursal", true, "La sucursal donde está el salón, escrita igual que en el archivo de sucursales.", SUCURSAL_EJEMPLO),
      c("nombre", "Salón", true, "El nombre del salón.", SALON_EJEMPLO, ["Salon", "Nombre del salón", "Nombre del salon"]),
      c("capacidad", "Capacidad", false, "Cuántas personas caben. El cupo de un grupo no puede ser mayor.", "20", ["Capacidad máxima"]),
    ],
  },
  instructores: {
    tipo: "instructores",
    archivo: "instructores.csv",
    plural: "instructores",
    singular: "instructor",
    descripcion: "Quienes imparten las clases. Una fila por persona.",
    columnas: [
      c("nombre", "Instructor", true, "Nombre y apellido.", INSTRUCTOR_EJEMPLO, ["Nombre", "Nombre del instructor", "Maestro", "Profesor"]),
      c("telefono", "Teléfono", false, "Con lada. A este número le llegan los avisos de las clases muestra por WhatsApp.", "55 0000 0000", ["Telefono", "Celular", "WhatsApp"]),
      c("correo", "Correo", false, "Correo electrónico (opcional).", "ejemplo@ejemplo.invalid", ["Correo electrónico", "Correo electronico", "Email"]),
      c("sucursales", "Sucursales", false, "Dónde da clases; si son varias, sepáralas con |. Vacío: en cualquiera.", SUCURSAL_EJEMPLO, ["Sucursal"]),
    ],
  },
  programas: {
    tipo: "programas",
    archivo: "programas.csv",
    plural: "programas",
    singular: "programa",
    descripcion: "Cada oferta de una disciplina en una sucursal para un rango de edades. Una fila por programa y sucursal.",
    columnas: [
      c("disciplina", "Disciplina", true, "La disciplina, escrita igual que en el archivo de disciplinas.", "EJEMPLO Disciplina"),
      c("sucursal", "Sucursal", true, "La sucursal donde se imparte.", SUCURSAL_EJEMPLO),
      c("nombre", "Programa", true, "El nombre del programa (por ejemplo, el nivel o el grupo de edad). No se repite dentro de una sucursal.", PROGRAMA_EJEMPLO, ["Nombre", "Nombre del programa"]),
      c("edad_min", "Edad mínima", true, "En años cumplidos, de 0 a 99.", "6", ["Edad minima", "Edad desde"]),
      c("edad_max", "Edad máxima", true, "En años cumplidos. Debe ser igual o mayor que la mínima.", "9", ["Edad maxima", "Edad hasta"]),
      c("corte", "Fecha de corte de edad", false, "Si la edad se mide a una fecha fija (por ejemplo, el inicio del ciclo). Vacío: la edad de hoy.", "01/09/2026", ["Fecha de corte", "Corte de edad"]),
      c("nivel", "Nivel", false, "El nivel, si lo hay (opcional).", "Principiante"),
      c("descripcion", "Descripción", false, "Una o dos frases que verán las familias (opcional).", "Texto que verán las familias", ["Descripcion", "Descripción pública"]),
      c("alternativa", "Alternativa para la misma edad", false, "Sí solo si este programa y otro de la misma disciplina y sucursal aceptan la misma edad y la familia elige entre ellos. Vacío: No.", "No", ["Alternativa"]),
    ],
  },
  grupos: {
    tipo: "grupos",
    archivo: "grupos.csv",
    plural: "grupos",
    singular: "grupo",
    descripcion: "Los grupos de cada programa, con su cupo, salón e instructor. Una fila por grupo.",
    columnas: [
      c("sucursal", "Sucursal", true, "La sucursal del programa.", SUCURSAL_EJEMPLO),
      c("programa", "Programa", true, "El programa al que pertenece, escrito igual que en el archivo de programas.", PROGRAMA_EJEMPLO),
      c("nombre", "Grupo", true, "El nombre del grupo. No se repite dentro de un programa.", GRUPO_EJEMPLO, ["Nombre", "Nombre del grupo"]),
      c("cupo", "Cupo", true, "Cuántos alumnos caben, de 1 a 500.", "15", ["Cupo máximo", "Cupo maximo"]),
      c("salon", "Salón", false, "El salón, escrito igual que en el archivo de salones.", SALON_EJEMPLO, ["Salon"]),
      c("instructor", "Instructor", false, "Quien lo imparte, escrito igual que en el archivo de instructores.", INSTRUCTOR_EJEMPLO, ["Maestro", "Profesor"]),
      c("lista_espera", "Lista de espera", false, "Sí si, cuando se llene, se anota a las familias en una lista de espera. Vacío: No.", "No", ["Permite lista de espera"]),
    ],
  },
  horarios: {
    tipo: "horarios",
    archivo: "horarios.csv",
    plural: "horarios",
    singular: "horario",
    descripcion: "Los días y las horas de cada grupo. Una fila por cada día de clase (un grupo que se reúne dos días lleva dos filas).",
    columnas: [
      c("sucursal", "Sucursal", false, "Solo hace falta si hay grupos con el mismo nombre en varias sucursales.", SUCURSAL_EJEMPLO),
      c("programa", "Programa", false, "Solo hace falta si hay grupos con el mismo nombre en varios programas.", PROGRAMA_EJEMPLO),
      c("grupo", "Grupo", true, "El grupo, escrito igual que en el archivo de grupos.", GRUPO_EJEMPLO, ["Nombre del grupo"]),
      c("dia", "Día", true, "lunes, martes, miércoles, jueves, viernes, sábado o domingo.", "lunes", ["Dia", "Día de la semana"]),
      c("inicio", "Hora de inicio", true, "En formato de 24 horas, por ejemplo 17:00.", "17:00", ["Inicio", "Hora inicio", "Desde"]),
      c("fin", "Hora de fin", true, "En formato de 24 horas, por ejemplo 18:00. Debe ser después de la de inicio.", "18:00", ["Fin", "Hora fin", "Hasta"]),
    ],
  },
  precios: {
    tipo: "precios",
    archivo: "precios.csv",
    plural: "precios",
    singular: "precio",
    descripcion: "Lo que cuesta cada programa. Una fila por precio; un precio nuevo empieza en su fecha y no cambia lo que ya se cobró.",
    columnas: [
      c("sucursal", "Sucursal", false, "Solo hace falta si hay programas con el mismo nombre en varias sucursales.", SUCURSAL_EJEMPLO),
      c("programa", "Programa", true, "El programa, escrito igual que en el archivo de programas.", PROGRAMA_EJEMPLO),
      c("inscripcion", "Inscripción", true, "Lo que se paga una sola vez al inscribirse, en pesos (500 o 500.50). Si no hay, escribe 0.", "500.00", ["Inscripcion", "Costo de inscripción", "Costo de inscripcion"]),
      c("mensualidad", "Mensualidad", true, "Lo que se paga cada mes, en pesos.", "800.00", ["Costo de mensualidad", "Colegiatura"]),
      c("desde", "Vigente desde", true, "Primer día en que rige este precio, como 01/09/2026.", "01/09/2026", ["Vigente", "Desde", "Fecha de inicio"]),
    ],
  },
};

/** Para comparar encabezados: sin acentos, mayúsculas, signos ni lo que va entre paréntesis («Cupo (obligatorio)» = «cupo»). */
export const claveDeEncabezado = (texto: string): string => claveDeNombre(texto.replace(/\([^)]*\)/g, " ").replace(/\*/g, " ")).replace(/ /g, "");

/** El título de una columna, para los mensajes. */
export function tituloDe(tipo: Tipo, clave: string): string {
  return ESQUEMAS[tipo].columnas.find((x) => x.clave === clave)?.titulo ?? clave;
}

export interface MapaDeEncabezados {
  /** Posición (0 = primera celda) de cada columna reconocida. */
  posiciones: Record<string, number>;
  /** Encabezados del archivo que no corresponden a ninguna columna (se ignoran, con un aviso). */
  desconocidos: string[];
  /** Columnas obligatorias que no están. */
  faltan: Columna[];
}

/** Empareja los encabezados de un archivo con las columnas de una hoja. */
export function mapearEncabezados(tipo: Tipo, encabezados: readonly string[]): MapaDeEncabezados {
  const esquema = ESQUEMAS[tipo];
  const posiciones: Record<string, number> = {};
  const desconocidos: string[] = [];
  encabezados.forEach((e, i) => {
    const k = claveDeEncabezado(e);
    if (k === "") return;
    const col = esquema.columnas.find((x) => [x.titulo, ...(x.alias ?? [])].some((t) => claveDeEncabezado(t) === k));
    if (col && !(col.clave in posiciones)) posiciones[col.clave] = i;
    else if (!col) desconocidos.push(e);
  });
  return { posiciones, desconocidos, faltan: esquema.columnas.filter((x) => x.obligatoria && !(x.clave in posiciones)) };
}

/** Pista del tipo por el nombre del archivo («sucursales (1).csv» → sucursales). */
export function tipoPorNombre(nombreDeArchivo: string): Tipo | null {
  const k = claveDeNombre(nombreDeArchivo.replace(/\.[^.]+$/, ""));
  return TIPOS.find((t) => k.includes(t) || k.includes(ESQUEMAS[t].singular === "salón" ? "salon" : ESQUEMAS[t].singular)) ?? null;
}

export interface Reconocimiento {
  tipo: Tipo | null;
  mapa: MapaDeEncabezados | null;
  /** Si no se pudo reconocer, por qué (para decirlo con palabras). */
  motivo?: string;
}

/**
 * Qué hoja es un archivo, por sus encabezados: gana la hoja que reconoce más columnas y, a igualdad, la que deja menos columnas sin entender. Si el nombre del archivo sugiere una
 * hoja y esa también cumple, se prefiere. Si ninguna cumple las obligatorias, se explica qué columnas faltan de la hoja que más se parece.
 */
export function reconocerHoja(nombreDeArchivo: string, encabezados: readonly string[]): Reconocimiento {
  const pista = tipoPorNombre(nombreDeArchivo);
  const candidatas = TIPOS.map((tipo) => {
    const mapa = mapearEncabezados(tipo, encabezados);
    return { tipo, mapa, reconocidas: Object.keys(mapa.posiciones).length };
  });
  const validas = candidatas.filter((x) => x.mapa.faltan.length === 0);
  if (validas.length > 0) {
    validas.sort((a, b) => b.reconocidas - a.reconocidas || a.mapa.desconocidos.length - b.mapa.desconocidos.length || Number(b.tipo === pista) - Number(a.tipo === pista));
    const mejor = validas[0]!;
    // Empate real entre hojas: manda la pista del nombre.
    const empatadas = validas.filter((x) => x.reconocidas === mejor.reconocidas && x.mapa.desconocidos.length === mejor.mapa.desconocidos.length);
    const elegida = empatadas.find((x) => x.tipo === pista) ?? mejor;
    return { tipo: elegida.tipo, mapa: elegida.mapa };
  }
  const parecida = [...candidatas].sort((a, b) => b.reconocidas - a.reconocidas || Number(b.tipo === pista) - Number(a.tipo === pista))[0]!;
  if (parecida.reconocidas === 0) return { tipo: null, mapa: null, motivo: "no se parece a ninguna de las plantillas (revisa que la primera fila tenga los encabezados de la plantilla)" };
  const faltan = parecida.mapa.faltan.map((x) => `«${x.titulo}»`).join(", ");
  return { tipo: null, mapa: null, motivo: `se parece a la plantilla de ${ESQUEMAS[parecida.tipo].plural}, pero le falta${parecida.mapa.faltan.length > 1 ? "n las columnas" : " la columna"} ${faltan}. No cambies los encabezados de la primera fila` };
}
