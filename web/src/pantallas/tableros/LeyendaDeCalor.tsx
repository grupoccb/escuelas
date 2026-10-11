// La leyenda de la escala de calor (retención y mapa de ocupación): cada rango con su muestra de color y escrito, y la muestra rayada de «sin dato». El color nunca es la única señal.

import { LEYENDA_DE_CALOR } from "./graficas-b.ts";

export function LeyendaDeCalor({ sinDato, etiqueta }: { sinDato: string; etiqueta: string }) {
  return (
    <ul className="leyenda-calor" aria-label={etiqueta}>
      {LEYENDA_DE_CALOR.map((g) => (
        <li key={g.nivel}>
          <span className={`leyenda-calor-muestra calor-${g.nivel}`} aria-hidden="true" />
          {g.texto}
        </li>
      ))}
      <li>
        <span className="leyenda-calor-muestra calor-sin" aria-hidden="true" />
        {sinDato}
      </li>
    </ul>
  );
}
