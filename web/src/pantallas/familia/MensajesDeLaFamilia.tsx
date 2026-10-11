// «Mensajes» de la ficha de la familia (R6b): cuándo salió el último recordatorio de pago, si acepta promociones y qué asesor la atiende. Lo que no existe se dice tal cual («Sin asesor
// asignado», «Sin registro de consentimiento»): nada se inventa.

import { hoyLocal } from "../../lib/fechas.ts";
import { Cargando, ErrorDeCarga, Tarjeta } from "../../ui/basicos.tsx";
import type { Carga } from "../../ui/hooks.ts";
import { filasDeMensajes, type MensajesDeFamilia } from "./resumen-de-familia.ts";

export function MensajesDeLaFamilia({ mensajes, conCobranza }: { mensajes: Carga<MensajesDeFamilia>; conCobranza: boolean }) {
  const filas = mensajes.datos ? filasDeMensajes(mensajes.datos, { hoy: hoyLocal(), conCobranza }) : [];
  return (
    <Tarjeta titulo="Mensajes" className="ficha-tarjeta">
      {mensajes.error ? <ErrorDeCarga error={mensajes.error} alReintentar={mensajes.recargar} /> : null}
      {mensajes.cargando && !mensajes.datos ? <Cargando /> : null}
      {mensajes.datos ? (
        <dl className="ficha-mensajes" data-prueba="mensajes-de-la-familia">
          {filas.map((f) => (
            <div key={f.etiqueta} className="ficha-mensajes-fila">
              <dt>{f.etiqueta}</dt>
              <dd>{f.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Tarjeta>
  );
}
