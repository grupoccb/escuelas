// Barras horizontales accesibles hechas con SVG propio. TEXTO PRIMERO: cada fila es un elemento de lista con su etiqueta y su valor escrito (un lector de pantalla lo lee
// completo y nada depende del color); la barra es un adorno (`aria-hidden`). Una sola tonalidad de la marca; el fondo es un riel gris. Sin librerías.

import type { ReactNode } from "react";
import { maximoDe, porcentajeDeBarra, type FilaDeBarra } from "./graficas.ts";

export function Barras({ titulo, filas, vacio = "Sin datos en este rango." }: { titulo: string; filas: readonly FilaDeBarra[]; vacio?: string }) {
  const maximo = maximoDe(filas.flatMap((f) => (f.fondo === undefined ? [f.valor] : [f.valor, f.fondo])));
  return (
    <figure className="grafica" data-prueba={`grafica-${titulo}`}>
      <figcaption>
        <h2>{titulo}</h2>
      </figcaption>
      {filas.length === 0 ? <p className="muted">{vacio}</p> : null}
      <ul className="barras">
        {filas.map((f) => (
          <li key={f.clave}>
            <div className="fila fila-entre">
              <span>{f.etiqueta}</span>
              <strong className="numero">{f.texto}</strong>
            </div>
            <svg className="barra" viewBox="0 0 100 3" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <rect className="barra-riel" x="0" y="0" width="100" height="3" rx="1.5" />
              {f.fondo !== undefined ? <rect className="barra-fondo" x="0" y="0" width={porcentajeDeBarra(f.fondo, maximo)} height="3" rx="1.5" /> : null}
              <rect className="barra-valor" x="0" y="0" width={porcentajeDeBarra(f.valor, maximo)} height="3" rx="1.5" />
            </svg>
            {f.nota ? <span className="muted">{f.nota}</span> : null}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function Indicador({ etiqueta, valor, nota, prueba }: { etiqueta: string; valor: ReactNode; nota?: ReactNode; prueba?: string }) {
  return (
    <div className="indicador" {...(prueba ? { "data-prueba": prueba } : {})}>
      <span className="muted">{etiqueta}</span>
      <strong className="indicador-valor numero">{valor}</strong>
      {nota ? <span className="muted">{nota}</span> : null}
    </div>
  );
}
