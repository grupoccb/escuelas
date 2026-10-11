// El héroe oscuro de Tableros: el titular (cuántos alumnos activos y cuánto cambió), tres frases calculadas con los datos y seis indicadores. Los textos son fijos con huecos que llenan
// los datos (`narrativa.ts`): nada de modelos de lenguaje; la frase o el indicador sin dato no sale. El color de cada punto acompaña al texto, no lo sustituye.

import type { EjecutivoDelTablero, ReporteDeEmbudo, ReporteDeEvolucion } from "../../api/tipos.ts";
import { Cargando, ErrorDeCarga } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import type { Carga } from "../../ui/hooks.ts";
import { etiquetaDeMes } from "./graficas.ts";
import { frasesDelHeroe, indicadoresDelHeroe, titularDelHeroe } from "./narrativa.ts";

export function Heroe({ mes, alcance, evolucion, ejecutivo, embudo }: { mes: string; alcance: string; evolucion: Carga<ReporteDeEvolucion>; ejecutivo: Carga<EjecutivoDelTablero>; embudo: Carga<ReporteDeEmbudo> | null }) {
  const datos = { evolucion: evolucion.datos, ejecutivo: ejecutivo.datos, embudo: embudo?.datos ?? null };
  const titular = titularDelHeroe(datos.evolucion, datos.ejecutivo);
  const frases = frasesDelHeroe(datos);
  const indicadores = indicadoresDelHeroe(datos);
  const cargando = (evolucion.cargando && !evolucion.datos) || (ejecutivo.cargando && !ejecutivo.datos);
  const error = evolucion.error ?? ejecutivo.error;
  const reintentar = (): void => {
    evolucion.recargar();
    ejecutivo.recargar();
  };
  return (
    <section className="heroe" aria-label="Resumen del mes" data-prueba="heroe">
      <div className="heroe-texto">
        <p className="heroe-ojo">
          {etiquetaDeMes(mes)} · {alcance}
        </p>
        {titular !== null ? (
          <h2 className="heroe-titular" data-prueba="ind-activos">
            {titular}
          </h2>
        ) : (
          <h2 className="heroe-titular">Resumen del mes</h2>
        )}
        {cargando ? <Cargando texto="Armando el resumen…" /> : null}
        {error ? (
          <div className="heroe-error">
            <ErrorDeCarga error={error} alReintentar={reintentar} />
          </div>
        ) : null}
        {frases.length > 0 ? (
          <ul className="heroe-frases" data-prueba="heroe-frases">
            {frases.map((f) => (
              <li key={f.clave} className={`heroe-frase heroe-frase-${f.tono}`}>
                <span className="heroe-frase-punto" aria-hidden="true" />
                <span>{f.texto}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {indicadores.length > 0 ? (
        <div className="heroe-indicadores" data-prueba="heroe-indicadores">
          {indicadores.map((i) => (
            <div key={i.clave} className={`heroe-indicador${i.tono === "alerta" ? " heroe-indicador-alerta" : ""}`} data-prueba={i.prueba}>
              <span className="heroe-indicador-etiqueta">
                {i.tono === "alerta" ? <Icono nombre="alerta" tamano={14} /> : null}
                {i.etiqueta}
              </span>
              <strong className="heroe-indicador-valor numero">{i.valor}</strong>
              {i.nota ? <span className={`heroe-indicador-nota${i.tono === "bien" ? " heroe-indicador-nota-bien" : ""}`}>{i.nota}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
