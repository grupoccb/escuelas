// 04 Altas y bajas de 12 meses: barras divergentes (altas hacia arriba del eje, bajas hacia abajo) con la línea de alumnos activos encima. Al pasar el cursor, tocar o enfocar un mes
// (con el teclado) se ven sus cifras. TEXTO PRIMERO: cada barra escribe su cifra, el mes elegido se anuncia en una región viva y hay una tabla con los 12 meses; el color nunca es la única
// señal (altas arriba / bajas abajo, y las cifras escritas). Se dibuja en un SVG propio al ancho real del contenedor (sin librerías, sin estilos en línea).

import { useLayoutEffect, useRef, useState } from "react";
import type { PuntoMensual, ReporteDeEvolucion } from "../../api/tipos.ts";
import { Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import { etiquetaDeMes, geometriaDeTendencia, mesCorto } from "./graficas.ts";
import { fraseDeTendencia } from "./narrativa.ts";
import { pixelAbajo } from "../../ui/numeros.ts";

/** El ancho que mide un elemento, al día (ResizeObserver). Mientras no se mide, un ancho razonable para que el primer dibujo no salte. */
function useAncho<T extends HTMLElement>(inicial: number): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(inicial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = (): void => {
      const w = pixelAbajo(el.getBoundingClientRect().width);
      if (w > 0) setAncho(w);
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return [ref, ancho];
}

const textoDeMes = (m: PuntoMensual): string => `${etiquetaDeMes(m.mes)}: ${m.altas} ${m.altas === 1 ? "alta" : "altas"}, ${m.bajas} ${m.bajas === 1 ? "baja" : "bajas"}, ${m.activos} activos`;

function Grafica({ meses }: { meses: readonly PuntoMensual[] }) {
  const [caja, ancho] = useAncho<HTMLDivElement>(640);
  const marco = useRef<HTMLDivElement>(null);
  const ultimo = Math.max(0, meses.length - 1);
  const [elegido, setElegido] = useState(ultimo);
  // Si cambia la serie (otro mes o filtro) el mes elegido vuelve al último.
  const claveDeSerie = meses.map((m) => m.mes).join("|");
  const [claveAnterior, setClaveAnterior] = useState(claveDeSerie);
  if (claveAnterior !== claveDeSerie) {
    setClaveAnterior(claveDeSerie);
    setElegido(ultimo);
  }
  const g = geometriaDeTendencia(meses, ancho);
  // En celular la gráfica es más ancha que la pantalla (cada mes mide al menos 44 px de ancho, el objetivo táctil del sistema) y se desplaza por dentro; el mes elegido y sus cifras se leen arriba.
  const sel = meses[elegido];
  /** Elige un mes con los botones de paso y lo acerca al centro de la gráfica (que en celular se desplaza por dentro). */
  const pasarA = (i: number): void => {
    setElegido(i);
    const el = marco.current;
    const x = g.puntos[i]?.x;
    if (el && x !== undefined) el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <figure className="tablero-tarjeta tendencia-figura" data-prueba="grafica-altas-y-bajas" onMouseLeave={() => setElegido(ultimo)}>
      <figcaption className="tendencia-cabeza">
        <span className="tablero-tarjeta-titulo">Últimos {meses.length} meses</span>
        {sel ? (
          <span className="tendencia-seleccion" aria-live="polite" data-prueba="tendencia-mes-elegido">
            <strong>{etiquetaDeMes(sel.mes)}</strong>
            <span className="tendencia-dato">
              <span className="tendencia-marca tendencia-marca-altas" aria-hidden="true" />
              Altas <strong className="numero">{sel.altas}</strong>
            </span>
            <span className="tendencia-dato">
              <span className="tendencia-marca tendencia-marca-bajas" aria-hidden="true" />
              Bajas <strong className="numero">{sel.bajas}</strong>
            </span>
            <span className="tendencia-dato">
              <span className="tendencia-marca tendencia-marca-activos" aria-hidden="true" />
              Activos <strong className="numero">{sel.activos}</strong>
            </span>
          </span>
        ) : null}
      </figcaption>
      <div className="tendencia-pasos" role="group" aria-label="Elegir el mes">
        <button type="button" className="boton-icono-tarjeta" aria-label="Mes anterior" disabled={elegido <= 0} onClick={() => pasarA(Math.max(0, elegido - 1))}>
          <Icono nombre="atras" tamano={20} />
        </button>
        <button type="button" className="boton-icono-tarjeta" aria-label="Mes siguiente" disabled={elegido >= ultimo} onClick={() => pasarA(Math.min(ultimo, elegido + 1))}>
          <Icono nombre="siguiente" tamano={20} />
        </button>
      </div>
      <div className="tendencia-caja" ref={marco}>
        <div className="tendencia-lienzo" ref={caja}>
          <svg className="tendencia-svg" width={g.ancho} height={g.alto} viewBox={`0 0 ${g.ancho} ${g.alto}`} aria-hidden="true" focusable="false">
            {g.puntos[elegido] ? <rect className="tendencia-columna" x={g.puntos[elegido]!.columnaX} y={g.zonaDeBarras} width={g.puntos[elegido]!.columnaAncho} height={g.alto - g.zonaDeBarras} rx="8" /> : null}
            <line className="tendencia-eje" x1="0" x2={g.ancho} y1={g.eje} y2={g.eje} />
            <polyline className="tendencia-linea" points={g.linea} />
            {g.puntos.map((p, i) => (
              <g key={p.mes}>
                <circle className="tendencia-punto" cx={p.x} cy={p.activoY} r={i === elegido ? 6 : 4} />
                <rect className="tendencia-barra-alta" x={p.barraX} y={p.altaY} width={p.barraAncho} height={p.altaAlto} rx="4" />
                <rect className="tendencia-barra-baja" x={p.barraX} y={g.eje} width={p.barraAncho} height={p.bajaAlto} rx="4" />
                <text className="tendencia-cifra tendencia-cifra-alta" x={p.x} y={p.altaY - 4} textAnchor="middle">
                  {meses[i]!.altas}
                </text>
                <text className="tendencia-cifra tendencia-cifra-baja" x={p.x} y={g.eje + p.bajaAlto + 14} textAnchor="middle">
                  {meses[i]!.bajas}
                </text>
                <text className={`tendencia-mes${i === elegido ? " tendencia-mes-elegido" : ""}`} x={p.x} y={g.etiquetaY} textAnchor="middle">
                  {mesCorto(p.mes)}
                </text>
              </g>
            ))}
          </svg>
          <ol className="tendencia-meses" aria-label="Meses">
            {meses.map((m, i) => (
              <li key={m.mes}>
                <button type="button" className="tendencia-mes-boton" aria-label={textoDeMes(m)} aria-pressed={i === elegido} onMouseEnter={() => setElegido(i)} onFocus={() => setElegido(i)} onClick={() => setElegido(i)} />
              </li>
            ))}
          </ol>
        </div>
      </div>
      <ul className="tendencia-leyenda" aria-label="Qué significa cada marca">
        <li>
          <span className="tendencia-marca tendencia-marca-altas" aria-hidden="true" />
          Altas: arriba de la línea
        </li>
        <li>
          <span className="tendencia-marca tendencia-marca-bajas" aria-hidden="true" />
          Bajas: abajo de la línea
        </li>
        <li>
          <span className="tendencia-marca tendencia-marca-activos" aria-hidden="true" />
          Alumnos activos al cierre del mes
        </li>
      </ul>
      <details className="detalle-tablero" data-prueba="tendencia-tabla">
        <summary>Ver las cifras de los {meses.length} meses en una tabla</summary>
        <div className="tabla-scroll detalle-tablero-cuerpo">
          <table className="tabla">
            <caption className="solo-lectores">Altas, bajas y alumnos activos por mes</caption>
            <thead>
              <tr>
                <th>Mes</th>
                <th className="derecha">Altas</th>
                <th className="derecha">Bajas</th>
                <th className="derecha">Activos</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes}>
                  <th scope="row">{etiquetaDeMes(m.mes)}</th>
                  <td className="derecha numero">{m.altas}</td>
                  <td className="derecha numero">{m.bajas}</td>
                  <td className="derecha numero">{m.activos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function SeccionAltasYBajas({ evolucion }: { evolucion: ReporteDeEvolucion }) {
  const frase = fraseDeTendencia(evolucion);
  return (
    <SeccionNumerada id="altas-y-bajas" numero="04" titulo="Altas, bajas y alumnos activos" {...(frase ? { descripcion: frase } : {})}>
      {evolucion.meses.length === 0 ? <Vacio titulo="Todavía no hay historia que mostrar.">Cuando haya inscripciones, aquí se verán las altas y bajas de cada mes.</Vacio> : <Grafica meses={evolucion.meses} />}
    </SeccionNumerada>
  );
}
