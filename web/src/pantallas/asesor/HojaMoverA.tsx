// La hoja «Mover a…» de UNA tarjeta (R2a): la alternativa sin arrastre para celular y pantallas táctiles. Una lista de las etapas (la actual, deshabilitada con «Aquí está»); al elegir una
// se cierra y el embudo decide el resto (mover, pedir el motivo, abrir la inscripción) igual que si se hubiera soltado ahí. Es un diálogo, así que en celular sale como hoja inferior.

import type { Etapa } from "../../api/tipos.ts";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { opcionesDeMover } from "./etapas-embudo.ts";
import type { LeadParaMover } from "./MoverEtapa.tsx";

export function HojaMoverA({ lead, etapas, alCerrar, alElegir }: { lead: LeadParaMover | null; etapas: readonly Etapa[]; alCerrar: () => void; alElegir: (leadId: string, etapaId: string) => void }) {
  const actual = etapas.find((e) => e.id === lead?.etapa_id);
  return (
    <Dialogo abierto={lead !== null} titulo={`Mover a ${lead?.nombre ?? "lead"}`} alCerrar={alCerrar}>
      <p className="muted etapa-actual-dialogo">
        Ahora está en: <strong>{actual?.nombre ?? "—"}</strong>
      </p>
      <div className="hoja-mover" role="group" aria-label="Etapas">
        {opcionesDeMover(etapas, 1, lead?.etapa_id).map((o) => (
          <button key={o.etapaId} type="button" disabled={o.deshabilitada} onClick={() => lead && alElegir(lead.id, o.etapaId)}>
            <span>{o.nombre}</span>
            {o.nota ? <span className="mover-nota">{o.nota}</span> : null}
          </button>
        ))}
      </div>
    </Dialogo>
  );
}
