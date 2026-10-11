// Mapa de calor de la ocupación por día de la semana y hora (tablero, sección «¿Cuándo están llenos los salones?»). PURO: sin base de datos ni reloj.
//
// DEFINICIÓN
//   · Una celda es un (día de la semana, hora de inicio) en el que EMPIEZA al menos una franja de un grupo activo. La hora es la del INICIO de la franja, truncada a la hora en punto
//     (una franja de 16:30 a 18:00 cuenta en la celda de las 16). Un grupo con la misma hora de inicio dos veces el mismo día cuenta una sola vez en esa celda.
//   · La ocupación de la celda es POOLED: Σ ocupados / Σ cupo máximo de los grupos que empiezan ahí, con los ocupados de la FUENTE REAL (la misma de la ocupación por grupo). Con
//     varias sucursales juntas, las celdas se suman (no se promedian porcentajes); con un filtro de sucursal, solo las de esa sucursal.
//   · El estado usa la MISMA regla y los mismos umbrales de la ocupación por grupo (`a_reventar` / `vacio` / `normal`, configurables en Administración → Configuración).
//   · Las celdas sin clases no se listan (el mapa es disperso): quien lo dibuja pone «sin clases» en lo que falta.
// `dia_semana`: 0 = domingo … 6 = sábado (el de `grupo_horario`).

import { porcentajeConUnDecimal } from "../lib/razon.ts";

export interface GrupoParaMapa {
  ocupados: number;
  cupo_maximo: number;
  horarios: readonly { dia_semana: number; hora_inicio_min: number }[];
}

export interface CeldaDeMapa {
  dia_semana: number;
  /** Hora de inicio, 0 a 23. */
  hora: number;
  grupos: number;
  ocupados: number;
  cupo_maximo: number;
  /** Porcentaje con un decimal («87.5»). */
  ocupacion: string;
  estado: "a_reventar" | "vacio" | "normal";
}

/** Domingo al final de la semana (la semana de la escuela empieza en lunes). */
const ordenDeDia = (d: number): number => (d === 0 ? 7 : d);

/** `estadoDe(ocupados, cupo)` es la regla de estado de la ocupación por grupo (`estadoDeOcupacion` con los umbrales de la escuela): así el mapa y la lista no pueden diferir. */
export function mapaDeOcupacion(grupos: readonly GrupoParaMapa[], estadoDe: (ocupados: number, cupo: number) => CeldaDeMapa["estado"]): CeldaDeMapa[] {
  const celdas = new Map<string, { dia_semana: number; hora: number; grupos: number; ocupados: number; cupo_maximo: number }>();
  for (const g of grupos) {
    const vistas = new Set<string>();
    for (const h of g.horarios) {
      const hora = (h.hora_inicio_min - (h.hora_inicio_min % 60)) / 60;
      const llave = `${h.dia_semana}|${hora}`;
      if (vistas.has(llave)) continue;
      vistas.add(llave);
      const c = celdas.get(llave) ?? celdas.set(llave, { dia_semana: h.dia_semana, hora, grupos: 0, ocupados: 0, cupo_maximo: 0 }).get(llave)!;
      c.grupos++;
      c.ocupados += g.ocupados;
      c.cupo_maximo += g.cupo_maximo;
    }
  }
  return [...celdas.values()]
    .sort((a, b) => a.hora - b.hora || ordenDeDia(a.dia_semana) - ordenDeDia(b.dia_semana))
    .map((c) => ({ ...c, ocupacion: porcentajeConUnDecimal(c.ocupados, c.cupo_maximo) ?? "0.0", estado: estadoDe(c.ocupados, c.cupo_maximo) }));
}
