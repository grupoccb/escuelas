// Una columna del tablero del embudo (R2a): una por etapa, con su conteo, el aviso de estancados y la lista de tarjetas. Las de cierre (inscrito / perdido) empiezan plegadas y llevan su
// tono (verde / rojo); plegada mide 56 px y se despliega con un clic. Al arrastrar, la que está bajo el puntero se resalta con un borde de 2 px de su tono y un rótulo «Suelta…».

import type { ReactNode } from "react";
import type { Etapa } from "../../api/tipos.ts";
import { Icono } from "../../ui/Icono.tsx";
import { textoDeColumnaVacia, textoDeDestino, tonoDeEtapa } from "./etapas-embudo.ts";

export interface PropsDeColumna {
  etapa: Etapa;
  total: number;
  /** Cuántos de los que se ven en la columna llevan días sin movimiento. */
  estancados: number;
  plegada: boolean;
  /** ¿Es la columna bajo el puntero? */
  esDestino: boolean;
  alPlegar: (etapaId: string) => void;
  children: ReactNode;
}

export function ColumnaDeEtapa({ etapa, total, estancados, plegada, esDestino, alPlegar, children }: PropsDeColumna) {
  const tono = tonoDeEtapa(etapa);
  const destino = esDestino ? "" : undefined;

  if (plegada) {
    return (
      <section className="columna columna-plegada" data-columna={etapa.id} data-prueba={`columna-${etapa.id}`} data-tono={tono} data-destino={destino} aria-label={etapa.nombre}>
        <button type="button" className="columna-desplegar" aria-label={`Desplegar la columna ${etapa.nombre} (${total})`} title="Desplegar columna" onClick={() => alPlegar(etapa.id)}>
          <span className="columna-cuenta">{total}</span>
          {tono === "exito" ? (
            <span className="columna-desplegar-icono" aria-hidden="true">
              <Icono nombre="reactivar" tamano={18} />
            </span>
          ) : null}
          {tono === "peligro" ? (
            <span className="columna-desplegar-icono" aria-hidden="true">
              <Icono nombre="bloquear" tamano={18} />
            </span>
          ) : null}
          <span className="columna-desplegar-nombre">{etapa.nombre}</span>
          {esDestino ? <span className="columna-desplegar-destino">{textoDeDestino(etapa)}</span> : null}
        </button>
      </section>
    );
  }

  return (
    <section className="columna" data-columna={etapa.id} data-prueba={`columna-${etapa.id}`} data-tono={tono} data-destino={destino} aria-label={etapa.nombre}>
      <div className="columna-cabeza">
        <h2>{etapa.nombre}</h2>
        <span className="columna-cuenta">{total}</span>
        <button type="button" className="columna-plegar" aria-label={`Plegar la columna ${etapa.nombre}`} title="Plegar columna" onClick={() => alPlegar(etapa.id)}>
          <Icono nombre="atras" tamano={16} />
        </button>
      </div>
      {estancados > 0 ? (
        <div className="columna-aviso">
          <Icono nombre="alerta" tamano={14} />
          {estancados === 1 ? "1 sin movimiento" : `${estancados} sin movimiento`}
        </div>
      ) : null}
      <div className="columna-cuerpo">
        {esDestino ? <div className="columna-destino-rotulo">{textoDeDestino(etapa)}</div> : null}
        {children}
        {total === 0 && !esDestino ? <div className="columna-vacia">{textoDeColumnaVacia(etapa)}</div> : null}
      </div>
    </section>
  );
}
