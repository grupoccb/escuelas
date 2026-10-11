// Las píldoras de disciplina de «Alumnos»: «Todas» y una por disciplina activa, con su punto de color (el dato `color_marca`) y `aria-pressed`. El nombre se lee: el color es refuerzo.

import { useDisciplina } from "../../ui/disciplina.tsx";
import type { Vertical } from "../admin/tipos.ts";

function Pildora({ nombre, color, activa, alElegir }: { nombre: string; color: string | null; activa: boolean; alElegir: () => void }) {
  const ref = useDisciplina<HTMLButtonElement>(color);
  return (
    <button ref={ref} type="button" className="pildora-filtro" aria-pressed={activa} onClick={alElegir}>
      <span className="pildora-filtro-punto" aria-hidden="true" />
      {nombre}
    </button>
  );
}

export function PildorasDeDisciplina({ verticales, elegida, alElegir }: { verticales: readonly Vertical[]; elegida: string; alElegir: (id: string) => void }) {
  const activas = verticales.filter((v) => v.activo);
  if (activas.length === 0) return null;
  return (
    <div className="alumnos-pildoras" role="group" aria-label="Disciplina">
      <button type="button" className="pildora-filtro" aria-pressed={elegida === ""} onClick={() => alElegir("")}>
        Todas
      </button>
      {activas.map((v) => (
        <Pildora key={v.id} nombre={v.nombre} color={v.color_marca} activa={elegida === v.id} alElegir={() => alElegir(elegida === v.id ? "" : v.id)} />
      ))}
    </div>
  );
}
