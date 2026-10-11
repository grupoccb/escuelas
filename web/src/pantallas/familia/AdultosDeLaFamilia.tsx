// «Adultos» de la ficha de la familia (R6b): cada adulto de cualquiera de sus hijos, con su parentesco y teléfono y sus banderas («Responsable de pago», «Recoge a …»). Invariante 13: la
// familia es la entidad central y el adulto se relaciona con cada hijo, nunca un campo suelto en el alumno.

import { Tarjeta } from "../../ui/basicos.tsx";
import type { AdultoDeLaFamilia } from "./resumen-de-familia.ts";

export function AdultosDeLaFamilia({ adultos }: { adultos: readonly AdultoDeLaFamilia[] }) {
  return (
    <Tarjeta titulo="Adultos" className="ficha-tarjeta">
      <ul className="ficha-adultos" data-prueba="adultos">
        {adultos.map((a) => (
          <li key={a.tutorId} className="ficha-adulto" data-prueba={`adulto-${a.tutorId}`}>
            <span className="ficha-adulto-datos">
              <strong>{a.nombre}</strong>
              <span className="numero muted">{[a.parentesco, a.telefono].filter(Boolean).join(" · ")}</span>
            </span>
            {a.banderas.length > 0 ? (
              <span className="ficha-chips ficha-chips-adulto">
                {a.banderas.map((b) => (
                  <span key={b} className="ficha-chip ficha-chip-adulto">
                    {b}
                  </span>
                ))}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
