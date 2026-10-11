// Las secciones de la página de Tableros: su id (el ancla), el nombre corto de su pestaña fija, su número y título (para el marco que se ve mientras carga) y el permiso que pide.
// La sección sin permiso no se muestra ni aparece en las pestañas.

export interface SeccionDelTablero {
  id: string;
  /** El nombre de la pestaña fija. */
  pestana: string;
  /** «01»…«08»; el resumen (héroe) no lleva. */
  numero: string | null;
  titulo: string;
  permiso: "reportes:ejecutivo" | "reportes:clases_muestra";
}

export const SECCIONES: readonly SeccionDelTablero[] = [
  { id: "resumen", pestana: "Resumen", numero: null, titulo: "Resumen del mes", permiso: "reportes:ejecutivo" },
  { id: "embudo", pestana: "Captación", numero: "01", titulo: "¿Dónde se caen los leads?", permiso: "reportes:ejecutivo" },
  { id: "fuentes", pestana: "Fuentes y costo", numero: "02", titulo: "¿Qué fuente trae alumnos y a qué costo?", permiso: "reportes:ejecutivo" },
  { id: "clases", pestana: "Clases muestra", numero: "03", titulo: "Clases muestra: quién llega y quién se queda", permiso: "reportes:clases_muestra" },
  { id: "altas-y-bajas", pestana: "Altas y bajas", numero: "04", titulo: "Altas, bajas y alumnos activos", permiso: "reportes:ejecutivo" },
  { id: "retencion", pestana: "Retención", numero: "05", titulo: "¿Cuántos siguen después de inscribirse?", permiso: "reportes:ejecutivo" },
  { id: "ingreso", pestana: "Dinero", numero: "06", titulo: "Ingreso recurrente y cartera vencida", permiso: "reportes:ejecutivo" },
  { id: "mapa", pestana: "Ocupación", numero: "07", titulo: "¿Cuándo están llenos los salones?", permiso: "reportes:ejecutivo" },
  { id: "comparativo", pestana: "Comparativo", numero: "08", titulo: "Por disciplina y sucursal", permiso: "reportes:ejecutivo" },
];

/** Las secciones que esta persona puede ver, en su orden. */
export function seccionesVisibles(puede: (permiso: string) => boolean): SeccionDelTablero[] {
  return SECCIONES.filter((s) => puede(s.permiso));
}
