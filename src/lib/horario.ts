// Formato de horarios y fechas para los textos al contacto, en español de México (C5). Genérico: los
// nombres de los días salen del calendario de Intl, nada de textos de una vertical.
//
//   formatearHorarios([{dia: 1, inicioMin: 960, finMin: 1020}, {dia: 3, ...mismas horas}]) → "lunes y miércoles de 16:00 a 17:00"

export interface FranjaHoraria {
  /** 0 = domingo … 6 = sábado. */
  dia: number;
  /** Minutos desde la medianoche local. */
  inicioMin: number;
  finMin: number;
}

const nombresDeDia: string[] = (() => {
  const f = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" });
  // 2024-01-07 fue domingo.
  return [0, 1, 2, 3, 4, 5, 6].map((i) => f.format(new Date(Date.UTC(2024, 0, 7 + i))));
})();

export function nombreDeDia(dia: number): string {
  const n = nombresDeDia[dia];
  if (n === undefined) throw new RangeError(`Día de la semana inválido: ${dia}`);
  return n;
}

const doble = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** Minutos desde la medianoche como «16:30». */
export function horaDeMinutos(min: number): string {
  if (!Number.isInteger(min) || min < 0 || min > 1440) throw new RangeError(`Minutos inválidos: ${min}`);
  return `${doble((min - (min % 60)) / 60)}:${doble(min % 60)}`;
}

function unir(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Las franjas de un grupo como texto. Los días con las mismas horas se juntan («lunes y miércoles de 16:00 a
 * 17:00»); horas distintas van separadas por «; ». Orden: lunes … sábado y domingo al final (semana de la
 * escuela), y dentro de una misma hora por día. Determinista.
 */
export function formatearHorarios(franjas: readonly FranjaHoraria[]): string {
  const porHora = new Map<string, { inicioMin: number; finMin: number; dias: number[] }>();
  for (const f of franjas) {
    nombreDeDia(f.dia); // valida
    const llave = `${f.inicioMin}-${f.finMin}`;
    const g = porHora.get(llave) ?? { inicioMin: f.inicioMin, finMin: f.finMin, dias: [] };
    if (!g.dias.includes(f.dia)) g.dias.push(f.dia);
    porHora.set(llave, g);
  }
  const ordenDia = (d: number): number => (d === 0 ? 7 : d);
  const grupos = [...porHora.values()].map((g) => ({ ...g, dias: [...g.dias].sort((a, b) => ordenDia(a) - ordenDia(b)) }));
  grupos.sort((a, b) => ordenDia(a.dias[0]!) - ordenDia(b.dias[0]!) || a.inicioMin - b.inicioMin || a.finMin - b.finMin);
  return grupos.map((g) => `${unir(g.dias.map(nombreDeDia))} de ${horaDeMinutos(g.inicioMin)} a ${horaDeMinutos(g.finMin)}`).join("; ");
}

/** La fecha de calendario (`AAAA-MM-DD`) que marca el reloj de una zona horaria IANA en ese instante. */
export function fechaLocal(instante: Date, zonaHoraria: string): string {
  // «en-CA» da el orden AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

/** La fecha del instante en palabras, en el día de calendario de esa zona horaria: «9 de octubre de 2026». V10: el día de la escuela, no el del servidor ni el UTC. */
export function fechaEnPalabras(instante: Date, zonaHoraria: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: zonaHoraria, day: "numeric", month: "long", year: "numeric" }).format(instante);
}
