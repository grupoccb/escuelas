// La familia con la que se trabaja: monograma, nombre y, debajo, teléfono y alumnos. Se usa en el encabezado de «Registrar pago», en el estado de cuenta y en la lista de resultados.

import type { Tutor } from "../../api/tipos.ts";
import { useDisciplina } from "../../ui/disciplina.tsx";
import type { EtiquetaDeHijo } from "./disciplinas-de-familia.ts";

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

/** «1 alumno», «2 alumnos», «sin alumnos». */
export const textoDeAlumnos = (n: number): string => (n === 0 ? "sin alumnos" : `${n} ${n === 1 ? "alumno" : "alumnos"}`);

/** El hijo con su grupo en una etiqueta del color de su disciplina (el dato `color_marca`; sin color, la etiqueta neutra del sistema). El nombre y el grupo se leen: el color nunca es la única señal. */
function EtiquetaDeUnHijo({ etiqueta }: { etiqueta: EtiquetaDeHijo }) {
  const ref = useDisciplina<HTMLSpanElement>(etiqueta.color);
  return (
    <span ref={ref} className="etiqueta-hijo">
      <span className="etiqueta-hijo-punto" aria-hidden="true" />
      <strong>{etiqueta.nombre}</strong>
      {etiqueta.grupo ? <span className="etiqueta-hijo-grupo"> · {etiqueta.grupo}</span> : null}
      {etiqueta.disciplina ? <span className="solo-lectores"> (disciplina {etiqueta.disciplina})</span> : null}
    </span>
  );
}

/** La tarjeta de la familia en «Registrar pago» (R4a): monograma, nombre, teléfono y cuántos alumnos, y los hijos en etiquetas de su disciplina. */
export function TarjetaDeFamilia({ tutor, etiquetas }: { tutor: Pick<Tutor, "nombre" | "apellidos" | "telefono" | "alumnos">; etiquetas: readonly EtiquetaDeHijo[] }) {
  return (
    <section className="tarjeta-familia" aria-label="Familia">
      <div className="familia-elegida familia-elegida-grande">
        <span className="avatar-familia avatar-familia-grande" aria-hidden="true">
          {iniciales(tutor.nombre, tutor.apellidos)}
        </span>
        <span className="familia-datos">
          <strong className="familia-nombre familia-nombre-grande">
            {tutor.nombre} {tutor.apellidos ?? ""}
          </strong>
          <span className="familia-detalle numero">
            {tutor.telefono} · {textoDeAlumnos(tutor.alumnos.length)}
          </span>
        </span>
      </div>
      {etiquetas.length > 0 ? (
        <ul className="etiquetas-hijos" aria-label="Alumnos de la familia">
          {etiquetas.map((e, i) => (
            <li key={`${e.clave}-${i}`}>
              <EtiquetaDeUnHijo etiqueta={e} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
