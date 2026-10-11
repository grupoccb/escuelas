// Las disciplinas de la escuela con su color (`color_marca`), para las píldoras de «Alumnos» y para el color del expediente. Si no se pueden leer, la lista queda vacía y todo se ve con el tono neutro.

import { api } from "../../api/cliente.ts";
import { useCarga } from "../../ui/hooks.ts";
import type { Vertical } from "../admin/tipos.ts";

export function useVerticales(): { verticales: readonly Vertical[]; colorDe: (verticalId: string | null | undefined) => string | null } {
  const carga = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal).then((r) => r.datos).catch(() => [] as Vertical[]), []);
  const verticales = carga.datos ?? [];
  return { verticales, colorDe: (id) => verticales.find((v) => v.id === id)?.color_marca ?? null };
}
