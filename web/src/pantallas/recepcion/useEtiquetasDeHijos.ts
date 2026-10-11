// Las etiquetas de disciplina de los hijos de la familia elegida (R4a). Todo es de adorno: si una llamada falla (módulo de inscripción apagado, sin permiso), los hijos salen con
// etiqueta neutra y la pantalla funciona igual; por eso los errores no se muestran.

import { useMemo } from "react";
import { api, traerTodo } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { useCarga } from "../../ui/hooks.ts";
import { etiquetasDeHijos, type DisciplinaDeCatalogo, type EtiquetaDeHijo, type InscripcionDeFamilia, type ProgramaDeCatalogo } from "./disciplinas-de-familia.ts";

export function useEtiquetasDeHijos(tutor: Pick<Tutor, "id" | "alumnos"> | null): EtiquetaDeHijo[] {
  const { puede, moduloEncendido } = useSesion();
  const activo = tutor !== null && moduloEncendido("inscripcion") && puede("inscripciones:leer") && puede("catalogo:leer");
  const inscripciones = useCarga((senal) => api.get<{ datos: InscripcionDeFamilia[] }>("/api/inscripciones", { tutor_id: tutor?.id ?? "", estatus: "activa", limite: 100 }, senal), [tutor?.id], activo);
  const programas = useCarga(() => traerTodo<ProgramaDeCatalogo>("/api/programas"), [], activo);
  const disciplinas = useCarga((senal) => api.get<{ datos: DisciplinaDeCatalogo[] }>("/api/verticales", undefined, senal), [], activo);
  const alumnos = tutor?.alumnos;
  return useMemo(
    () => etiquetasDeHijos(alumnos ?? [], inscripciones.datos?.datos ?? [], programas.datos?.datos ?? [], disciplinas.datos?.datos ?? []),
    [alumnos, inscripciones.datos, programas.datos, disciplinas.datos],
  );
}
