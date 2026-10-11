// El resumen de las familias que están a la vista (R6b): la disciplina de cada hijo con su color, su grupo y horario, y el estado de la cuenta. Es de adorno: si la llamada falla (módulo apagado,
// sin permiso, sin conexión) las tarjetas salen con etiquetas neutras y la pantalla funciona igual, por eso el error no se muestra.

import { useMemo } from "react";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { useCarga } from "../../ui/hooks.ts";
import type { ResumenDeFamilia } from "./resumen-de-familia.ts";

export function useResumenDeFamilias(tutorIds: readonly string[]): ReadonlyMap<string, ResumenDeFamilia> {
  const { puede, moduloEncendido } = useSesion();
  const clave = [...new Set(tutorIds)].join(",");
  const activo = clave !== "" && moduloEncendido("inscripcion") && puede("tutores:leer");
  const carga = useCarga((senal) => api.get<{ datos: ResumenDeFamilia[] }>("/api/familias/resumen", { tutor_ids: clave }, senal), [clave], activo);
  return useMemo(() => new Map((carga.datos?.datos ?? []).map((r) => [r.tutor_id, r])), [carga.datos]);
}
