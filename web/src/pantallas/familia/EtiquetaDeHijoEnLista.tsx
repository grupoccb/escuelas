// La etiqueta de un hijo en una tarjeta de familia (R6b): punto y nombre con el color de su disciplina (el dato `color_marca`; sin color, el neutro del sistema). El color nunca es la única
// señal: la disciplina se lee para quien usa un lector de pantalla y «baja» o «congelado» se dicen con palabras.

import { useDisciplina } from "../../ui/disciplina.tsx";
import type { EtiquetaDeHijoEnLista } from "./resumen-de-familia.ts";

export function EtiquetaDeHijo({ etiqueta }: { etiqueta: EtiquetaDeHijoEnLista }) {
  const ref = useDisciplina<HTMLSpanElement>(etiqueta.color);
  return (
    <span ref={ref} className="etiqueta-disciplina">
      <span className="etiqueta-disciplina-punto" aria-hidden="true" />
      {etiqueta.nombre}
      {etiqueta.nota ? <span className="etiqueta-nota"> · {etiqueta.nota}</span> : null}
      {etiqueta.disciplina ? <span className="solo-lectores"> (disciplina {etiqueta.disciplina})</span> : null}
    </span>
  );
}
