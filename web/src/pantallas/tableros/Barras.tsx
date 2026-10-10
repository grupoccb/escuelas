// Barras horizontales accesibles hechas con SVG propio. TEXTO PRIMERO: cada fila es un elemento de lista con su etiqueta y su valor escrito (un lector de pantalla lo lee
// completo y nada depende del color); la barra es un adorno (`aria-hidden`). Una sola serie de color por gráfica (`--serie-N`); cuando hay un segundo valor (lo agendado detrás de
// lo asistido) se distingue por la forma —relleno liso contra contorno con relleno claro—, por la leyenda y por el texto de cada fila, no por el matiz. Sin librerías.

import type { ReactNode } from "react";
import { Icono } from "../../ui/Icono.tsx";
import { Vacio } from "../../ui/basicos.tsx";
import { maximoDe, porcentajeDeBarra, type FilaDeBarra } from "./graficas.ts";

/** La serie de color de la paleta (`--serie-1` … `--serie-5`, todas colores del sistema): una por tipo de dato, nunca por posición de la barra. */
export type SerieDeColor = 1 | 2 | 3 | 4 | 5;

export function Barras({ titulo, filas, vacio = "Sin datos en este rango.", serie = 1, leyenda, id }: { titulo: string; filas: readonly FilaDeBarra[]; vacio?: string; serie?: SerieDeColor; leyenda?: { valor: string; fondo: string }; id?: string }) {
  const maximo = maximoDe(filas.flatMap((f) => (f.fondo === undefined ? [f.valor] : [f.valor, f.fondo])));
  const conFondo = filas.some((f) => f.fondo !== undefined);
  return (
    <figure className={`grafica grafica-serie-${serie}`} data-prueba={`grafica-${titulo}`} {...(id ? { id } : {})}>
      <figcaption>
        <h2>{titulo}</h2>
        {conFondo && leyenda ? (
          <ul className="leyenda" aria-label="Qué significa cada barra">
            <li>
              <span className="leyenda-marca leyenda-marca-valor" aria-hidden="true" />
              {leyenda.valor}
            </li>
            <li>
              <span className="leyenda-marca leyenda-marca-fondo" aria-hidden="true" />
              {leyenda.fondo}
            </li>
          </ul>
        ) : null}
      </figcaption>
      {filas.length === 0 ? <Vacio titulo={vacio} /> : null}
      <ul className="barras">
        {filas.map((f) => (
          <li key={f.clave}>
            <div className="barra-texto">
              <span className="barra-etiqueta">{f.etiqueta}</span>
              <strong className="barra-cifra numero">{f.texto}</strong>
            </div>
            <svg className="barra" width="100%" height="12" aria-hidden="true" focusable="false">
              <rect className="barra-riel" x="0" y="1" width="100%" height="10" rx="5" />
              {f.fondo !== undefined ? <rect className="barra-fondo" x="0" y="1" width={`${porcentajeDeBarra(f.fondo, maximo)}%`} height="10" rx="5" /> : null}
              <rect className="barra-valor" x="0" y="1" width={`${porcentajeDeBarra(f.valor, maximo)}%`} height="10" rx="5" />
            </svg>
            {f.nota ? <span className="barra-nota">{f.nota}</span> : null}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * Un indicador: etiqueta arriba, cifra de 28 debajo. `principal` es el dato que la persona vino a ver (36, el más grande del tablero). `alerta` es el que pide atención:
 * lleva el par de alerta, un ícono (el color no es la única señal) y su acción.
 */
export function Indicador({ etiqueta, valor, nota, prueba, principal = false, alerta }: { etiqueta: string; valor: ReactNode; nota?: ReactNode; prueba?: string; principal?: boolean; alerta?: { accion: string; destino: string } }) {
  const clases = ["indicador", principal ? "indicador-principal" : "", alerta ? "indicador-alerta" : ""].filter(Boolean).join(" ");
  return (
    <div className={clases} {...(prueba ? { "data-prueba": prueba } : {})}>
      <span className="indicador-etiqueta">
        {alerta ? <Icono nombre="alerta" tamano={16} /> : null}
        {etiqueta}
      </span>
      {alerta ? (
        <div className="indicador-cifra-accion">
          <strong className="indicador-valor numero">{valor}</strong>
          <a href={alerta.destino}>{alerta.accion}</a>
        </div>
      ) : (
        <strong className="indicador-valor numero">{valor}</strong>
      )}
      {nota ? <span className="indicador-nota">{nota}</span> : null}
    </div>
  );
}
