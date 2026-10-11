// Cómo se ve una tarea del asesor (R5a, README «Tareas»): el tono de su tipo (ícono y color), si es urgente («Atiéndela hoy»), el texto de su botón de acción, cuánto hace que se creó y los
// conteos por tipo del panel lateral. Lógica pura, sin React: se prueba con `node --test`. Los títulos de los tipos viven en `lib/etiquetas.ts`.

import type { NombreDeIcono } from "../../navegacion.ts";

export type TonoDeTarea = "exito" | "neutro" | "alerta";

/** El tono de cada tipo de tarea: lo bueno (listo para cerrar, lugar liberado), lo que pide atención hoy (alerta) y lo demás (neutro). */
const TONO_DE_TIPO: Record<string, TonoDeTarea> = {
  listo_para_cerrar: "exito",
  lista_espera_lugar_liberado: "exito",
  entrega_fallida: "alerta",
  baja_volvio_a_escribir: "alerta",
  avisar_cambio_de_clase: "alerta",
  evento_inesperado: "alerta",
  deuda_vencida: "alerta",
};

/** El texto del botón que resuelve la tarea, por tipo (los que el prototipo nombra); el resto cierra con «Marcar como hecha». */
const ACCION_DE_TIPO: Record<string, string> = {
  listo_para_cerrar: "Inscribir",
  lead_frio: "Ya lo retomé",
  llamar_no_asistio: "Ya llamé",
  entrega_fallida: "Ya lo contacté",
  sin_plantilla_apta: "Ya lo contacté",
  lista_espera_lugar_liberado: "Ya lo ofrecí",
  baja_volvio_a_escribir: "Ya decidí",
  avisar_cambio_de_clase: "Ya avisé",
  faltas_consecutivas: "Ya hablé con la familia",
};

export const ACCION_POR_OMISION = "Marcar como hecha";

export const tonoDeTarea = (tipo: string): TonoDeTarea => TONO_DE_TIPO[tipo] ?? "neutro";
export const esUrgente = (tipo: string): boolean => tonoDeTarea(tipo) === "alerta";
/** El texto visible del botón de resolver. «Marcar como hecha» es además el nombre accesible (lo que buscan las pruebas y los lectores de pantalla). */
export const accionDeTarea = (tipo: string): string => ACCION_DE_TIPO[tipo] ?? ACCION_POR_OMISION;

export const ICONO_DE_TONO: Record<TonoDeTarea, NombreDeIcono> = { exito: "exito", neutro: "campana", alerta: "alerta" };

/** «Ahora», «Hace 25 min», «Hace 1 h», «Ayer», «Hace 2 días»; pasados 30 días, `null` (quien llama escribe la fecha). */
export function haceCuanto(iso: string, ahora: Date = new Date()): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const minutos = Math.max(0, Math.floor((ahora.getTime() - t) / 60_000));
  if (minutos < 1) return "Ahora";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "Ayer";
  if (dias <= 30) return `Hace ${dias} días`;
  return null;
}

/** Cuántas tareas hay de cada tipo, en el orden en que los tipos aparecen en `orden` (los que no tienen ninguna no salen). */
export function conteoPorTipo(tareas: readonly { tipo: string }[], orden: readonly string[]): { tipo: string; cuenta: number }[] {
  const cuentas = new Map<string, number>();
  for (const t of tareas) cuentas.set(t.tipo, (cuentas.get(t.tipo) ?? 0) + 1);
  const conocidos = orden.filter((tipo) => cuentas.has(tipo)).map((tipo) => ({ tipo, cuenta: cuentas.get(tipo) ?? 0 }));
  // Un tipo que la interfaz no conoce (el servidor agregó uno) igual se puede filtrar: va al final.
  const otros = [...cuentas.keys()].filter((tipo) => !orden.includes(tipo)).map((tipo) => ({ tipo, cuenta: cuentas.get(tipo) ?? 0 }));
  return [...conocidos, ...otros];
}
