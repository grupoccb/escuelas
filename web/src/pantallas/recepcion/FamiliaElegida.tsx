// La familia con la que se trabaja: monograma, nombre y, debajo, teléfono y alumnos. Se usa en el encabezado de «Registrar pago», en el estado de cuenta y en la lista de resultados.

import type { Tutor } from "../../api/tipos.ts";

/** «Marisol Vivanco» → «MV». */
export function iniciales(nombre: string, apellidos?: string | null): string {
  const primera = (t: string | null | undefined): string => (t ?? "").trim().charAt(0).toUpperCase();
  return `${primera(nombre)}${primera(apellidos)}` || "?";
}

/** «55 9901 0009 · 1 alumno: Santino». */
export function datosDeLaFamilia(t: Pick<Tutor, "telefono" | "alumnos">): string {
  const alumnos = t.alumnos;
  return `${t.telefono} · ${alumnos.length === 0 ? "sin alumnos" : `${alumnos.length} ${alumnos.length === 1 ? "alumno" : "alumnos"}: ${alumnos.map((a) => a.nombre).join(", ")}`}`;
}

export function FamiliaElegida({ tutor }: { tutor: Pick<Tutor, "nombre" | "apellidos" | "telefono" | "alumnos"> }) {
  return (
    <span className="familia-elegida">
      <span className="avatar-familia" aria-hidden="true">
        {iniciales(tutor.nombre, tutor.apellidos)}
      </span>
      <span className="familia-datos">
        <strong className="familia-nombre">
          {tutor.nombre} {tutor.apellidos ?? ""}
        </strong>
        <span className="familia-detalle numero">{datosDeLaFamilia(tutor)}</span>
      </span>
    </span>
  );
}
