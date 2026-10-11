// «Comercial» del expediente: cómo llegó la familia (campaña, canal, fuente), cuánto tardó en cerrar, los hermanos inscritos y el motivo de las bajas. Para el maestro no existe.

import { Link } from "react-router-dom";
import { formatearFecha } from "../../lib/fechas.ts";
import { Tarjeta, Vacio } from "../../ui/basicos.tsx";
import type { Comercial } from "./tipos.ts";

const diasPara = (c: Comercial, leadId: string): string => {
  const d = c.dias_para_cerrar.find((x) => x.lead_id === leadId);
  return d ? `${d.dias} días` : "—";
};

export function PanelComercial({ c }: { c: Comercial }) {
  return (
    <div className="pila expediente-panel" data-prueba="panel-comercial">
      <div className="expediente-rejilla">
        <Tarjeta titulo="Cómo llegó">
          {c.origen_del_lead.length === 0 ? <Vacio titulo="Sin origen registrado" icono="info">Es un alta de mostrador.</Vacio> : null}
          {c.origen_del_lead.map((o) => (
            <dl key={o.lead_id} className="datos">
              <dt>Campaña</dt>
              <dd>{o.campana?.nombre ?? "—"}</dd>
              <dt>Canal</dt>
              <dd>{o.canal ?? "—"}</dd>
              <dt>Fuente</dt>
              <dd>{o.fuente ?? "—"}</dd>
              <dt>Código de rastreo</dt>
              <dd>{o.codigo_de_rastreo ?? "—"}</dd>
              <dt>Tardó en cerrar</dt>
              <dd>{diasPara(c, o.lead_id)}</dd>
            </dl>
          ))}
        </Tarjeta>
        <Tarjeta titulo="Hermanos inscritos">
          {c.hermanos_inscritos.length === 0 ? <Vacio titulo="Sin hermanos inscritos" icono="alumnos" /> : null}
          <ul className="lista-filas" data-prueba="hermanos">
            {c.hermanos_inscritos.map((h) => (
              <li key={h.alumno_id}>
                <Link to={`/alumnos/${h.alumno_id}`}>{h.alumno}</Link> · {h.verticales.map((v) => v.nombre).join(", ")}
              </li>
            ))}
          </ul>
        </Tarjeta>
        {c.motivo_de_baja.length > 0 ? (
          <Tarjeta titulo="Bajas">
            <ul className="lista-filas" data-prueba="motivo-de-baja">
              {c.motivo_de_baja.map((b) => (
                <li key={b.inscripcion_id}>
                  <span className="numero">{formatearFecha(b.fecha_baja)}</span>: {b.motivo?.nombre ?? "sin motivo"}
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
      </div>
    </div>
  );
}
