// Sección 05 «¿Cuántos siguen después de inscribirse?»: una rejilla de cohortes (mes de inscripción) por meses de seguimiento, con la escala de calor del README. Cada celda ESCRIBE su
// porcentaje (el color es un refuerzo), lo que todavía no pasa va rayado y dice «Todavía no pasa»; la última fila es el promedio ponderado que calcula el servidor.

import { Vacio } from "../../ui/basicos.tsx";
import { filaDePromedio, filasDeRetencion, fraseDeRetencion, hayCohortes, MESES_DE_SEGUIMIENTO, type CeldaDeRetencion } from "./graficas-b.ts";
import { LeyendaDeCalor } from "./LeyendaDeCalor.tsx";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import type { PropsDeSeccionConDatos } from "./contrato-secciones.ts";

function Celda({ celda, promedio = false }: { celda: CeldaDeRetencion; promedio?: boolean }) {
  const clase = promedio ? "retencion-celda retencion-celda-promedio" : `retencion-celda ${celda.nivel ? `calor-${celda.nivel}` : "calor-sin"}`;
  return (
    <td className={clase} title={celda.titulo}>
      {celda.estado === "futuro" ? <span className="solo-lectores">Todavía no pasa</span> : null}
      {celda.estado === "sin_altas" ? <span className="solo-lectores">Sin inscripciones ese mes</span> : null}
      {celda.texto}
    </td>
  );
}

export function SeccionRetencion({ evolucion }: PropsDeSeccionConDatos) {
  const hay = hayCohortes(evolucion.cohortes);
  const filas = filasDeRetencion(evolucion);
  const frase = hay ? fraseDeRetencion(evolucion.promedio) : null;
  return (
    <SeccionNumerada id="retencion" numero="05" titulo="¿Cuántos siguen después de inscribirse?" {...(frase ? { descripcion: frase } : {})}>
      <figure className="panel-b panel-b-retencion">
        <figcaption className="panel-b-cabeza">
          <span className="panel-b-titulo">Siguen activos, por mes de inscripción</span>
          <span className="panel-b-nota">Inscripciones de los últimos {filas.length} meses, con 6 meses de seguimiento</span>
        </figcaption>
        {hay ? (
          <>
            <div className="retencion-desplazable" role="region" aria-label="Retención por cohortes (se desplaza de lado en pantallas angostas)" tabIndex={0}>
              <table className="retencion">
                <caption className="solo-lectores">Porcentaje de alumnos que siguen activos cada mes después de inscribirse, por mes de inscripción</caption>
                <colgroup>
                  <col className="retencion-col-mes" />
                  <col className="retencion-col-altas" />
                  {MESES_DE_SEGUIMIENTO.map((k) => (
                    <col key={k} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="retencion-encabezado">
                      Se inscribieron
                    </th>
                    <th scope="col" className="retencion-encabezado retencion-encabezado-derecha">
                      Alumnos
                    </th>
                    {MESES_DE_SEGUIMIENTO.map((k) => (
                      <th key={k} scope="col" className="retencion-encabezado retencion-encabezado-centro">
                        Mes {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clave}>
                      <th scope="row" className="retencion-cohorte">
                        {f.nombre}
                        <span className="retencion-cohorte-altas">{f.altas === 1 ? "1 alumno" : `${f.altas} alumnos`}</span>
                      </th>
                      <td className="retencion-altas">{f.altas}</td>
                      {f.celdas.map((c) => (
                        <Celda key={c.mes_n} celda={c} />
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" className="retencion-cohorte retencion-cohorte-promedio">
                      Promedio
                    </th>
                    <td className="retencion-altas" />
                    {filaDePromedio(evolucion.promedio).map((c) => (
                      <Celda key={c.mes_n} celda={c} promedio />
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <LeyendaDeCalor etiqueta="Qué significa cada color de la retención" sinDato="Todavía no pasa" />
          </>
        ) : (
          <Vacio titulo="Todavía no hay inscripciones que medir" icono="vacio">
            Cuando haya alumnos inscritos en los últimos meses, aquí verás cuántos siguen mes con mes.
          </Vacio>
        )}
      </figure>
    </SeccionNumerada>
  );
}
