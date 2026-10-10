// Las zonas horarias de una sucursal dichas como las diría una persona (V7): el servidor las guarda con su nombre técnico («America/Mexico_City»), pero nadie en una escuela sabe cuál le toca.
// Decide el horario de envío de los mensajes (09:00 a 20:00 hora de la sucursal), así que se elige de una lista y no se escribe.

export interface ZonaConocida {
  valor: string;
  /** Para la tarjeta de la sucursal. */
  corto: string;
  /** Para el selector: con lo que ayuda a reconocerla. */
  largo: string;
}

export const ZONAS_CONOCIDAS: readonly ZonaConocida[] = [
  { valor: "America/Mexico_City", corto: "Hora del centro de México", largo: "Hora del centro de México (Ciudad de México y casi todo el país)" },
  { valor: "America/Monterrey", corto: "Hora del centro de México (Monterrey)", largo: "Hora del centro de México (Monterrey)" },
  { valor: "America/Merida", corto: "Hora del centro de México (Mérida)", largo: "Hora del centro de México (Mérida)" },
  { valor: "America/Chihuahua", corto: "Hora de Chihuahua", largo: "Hora de Chihuahua" },
  { valor: "America/Cancun", corto: "Hora del sureste de México", largo: "Hora del sureste de México (Quintana Roo)" },
  { valor: "America/Mazatlan", corto: "Hora del Pacífico de México", largo: "Hora del Pacífico de México (Sinaloa, Nayarit, Baja California Sur)" },
  { valor: "America/Hermosillo", corto: "Hora de Sonora", largo: "Hora de Sonora (no cambia en verano)" },
  { valor: "America/Tijuana", corto: "Hora del noroeste de México", largo: "Hora del noroeste de México (Baja California)" },
  { valor: "America/Bogota", corto: "Hora de Colombia", largo: "Hora de Colombia (Bogotá)" },
  { valor: "America/Lima", corto: "Hora de Perú", largo: "Hora de Perú (Lima)" },
  { valor: "America/Santiago", corto: "Hora de Chile", largo: "Hora de Chile (Santiago)" },
  { valor: "America/Argentina/Buenos_Aires", corto: "Hora de Argentina", largo: "Hora de Argentina (Buenos Aires)" },
  { valor: "Europe/Madrid", corto: "Hora de España", largo: "Hora de España (Madrid)" },
];

/** Cómo se llama una zona para la escuela. Una que no está en la lista (la dio de alta otra persona o un archivo) se dice como «Otra zona horaria (nombre)»: nunca se esconde. */
export function nombreDeZona(valor: string, forma: "corto" | "largo" = "corto"): string {
  const z = ZONAS_CONOCIDAS.find((x) => x.valor === valor);
  return z ? z[forma] : `Otra zona horaria (${valor})`;
}

/** Las opciones del selector; si la zona actual no está en la lista, se agrega para no perderla al guardar. */
export function opcionesDeZona(actual: string): { valor: string; texto: string }[] {
  const base = ZONAS_CONOCIDAS.map((z) => ({ valor: z.valor, texto: z.largo }));
  return ZONAS_CONOCIDAS.some((z) => z.valor === actual) || actual === "" ? base : [{ valor: actual, texto: nombreDeZona(actual, "largo") }, ...base];
}
