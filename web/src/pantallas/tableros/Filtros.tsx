// Los valores de los filtros de los tableros (rango de fechas, sucursal y disciplina). Los campos se pintan en `FiltrosDelTablero.tsx`; esto es lo que comparten con las secciones.

export interface ValoresDeFiltro {
  desde: string;
  hasta: string;
  sucursalId: string;
  verticalId: string;
}

/** «Hasta» antes de «Desde»: el servidor lo rechaza; aquí se dice qué corregir junto al campo y las secciones de captación esperan a que se corrija. */
export const rangoInvertido = (v: ValoresDeFiltro): boolean => v.desde !== "" && v.hasta !== "" && v.desde > v.hasta;
