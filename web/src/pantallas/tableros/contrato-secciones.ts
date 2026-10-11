// Contrato entre la página de Tableros (R3b-A) y las secciones 05–08 (R3b-B). La página carga una vez la evolución y el ejecutivo y los reparte; cada sección solo dibuja.

import type { EjecutivoDelTablero, ReporteDeEvolucion } from "../../api/tipos.ts";
import type { ValoresDeFiltro } from "./Filtros.tsx";

export interface PropsDeSeccionConDatos {
  filtros: ValoresDeFiltro;
  evolucion: ReporteDeEvolucion;
  ejecutivo: EjecutivoDelTablero;
  /** Color de marca de la disciplina (`color_marca` de /api/verticales) o null si no tiene. */
  colorDeVertical: (verticalId: string) => string | null;
}
