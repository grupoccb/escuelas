// Sección 07 «¿Cuándo están llenos los salones?»: la ocupación por día de la semana y hora de inicio como tabla (encabezados de día y de hora), con la escala de calor del README. Cada
// celda ESCRIBE su porcentaje; las que no tienen clases van rayadas y dicen «Sin clases». A la derecha, los grupos «A reventar» (abrir otro) y «Con lugares» (promoverlos).

import { Icono } from "../../ui/Icono.tsx";
import { Vacio } from "../../ui/basicos.tsx";
import { DIA_CORTO, diasDelMapa, filasDelMapa, fraseDeMapa, gruposDelEstado, type ItemDeGrupo } from "./graficas-b.ts";
import { LeyendaDeCalor } from "./LeyendaDeCalor.tsx";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import type { PropsDeSeccionConDatos } from "./contrato-secciones.ts";

/** Cuántos grupos se listan en cada tarjeta; el resto se cuenta ("y 3 grupos más"). */
const LIMITE_DE_GRUPOS = 6;

function ListaDeGrupos({ items, fuera, vacio, tono }: { items: ItemDeGrupo[]; fuera: number; vacio: string; tono: "llenos" | "vacios" }) {
  if (items.length === 0) return <p className="muted">{vacio}</p>;
  return (
    <>
      <ul className={`mapa-grupos mapa-grupos-${tono}`}>
        {items.map((g) => (
          <li key={g.id} data-prueba={`grupo-${tono}-${g.id}`}>
            <span className="mapa-grupo-texto">
              <span className="mapa-grupo-nombre">{g.nombre}</span>
              {g.detalle ? <span className="mapa-grupo-detalle">{g.detalle}</span> : null}
            </span>
            <strong className="mapa-grupo-cupo numero">
              {g.cupo}
              <span className="solo-lectores"> lugares ocupados, {g.ocupacion}</span>
            </strong>
          </li>
        ))}
      </ul>
      {fuera > 0 ? <p className="muted mapa-grupos-mas">Y {fuera === 1 ? "1 grupo más" : `${fuera} grupos más`}.</p> : null}
    </>
  );
}

export function SeccionMapaDeCalor({ filtros, ejecutivo }: PropsDeSeccionConDatos) {
  const celdas = ejecutivo.mapa_ocupacion;
  const dias = diasDelMapa(celdas);
  const filas = filasDelMapa(celdas);
  const llenos = gruposDelEstado(ejecutivo.ocupacion_por_grupo, "a_reventar", LIMITE_DE_GRUPOS);
  const vacios = gruposDelEstado(ejecutivo.ocupacion_por_grupo, "vacio", LIMITE_DE_GRUPOS);
  return (
    <SeccionNumerada id="mapa" numero="07" titulo="¿Cuándo están llenos los salones?" descripcion={fraseDeMapa(celdas)}>
      <div className="seccion-b-fila">
        <figure className="panel-b panel-b-mapa" data-prueba="grafica-mapa-de-calor">
          <figcaption className="panel-b-cabeza">
            <span className="panel-b-titulo">Ocupación por día y hora</span>
            <span className="panel-b-nota">{filtros.sucursalId ? "Una sucursal" : "Todas las sucursales"} · por hora de inicio de la clase</span>
          </figcaption>
          {filas.length > 0 ? (
            <>
              <table className="mapa">
                <caption className="solo-lectores">Porcentaje de lugares ocupados en los grupos que empiezan a cada hora, por día de la semana</caption>
                <thead>
                  <tr>
                    <th scope="col" className="mapa-esquina">
                      <span className="solo-lectores">Hora de inicio</span>
                    </th>
                    {dias.map((d) => (
                      <th key={d} scope="col" className="mapa-dia">
                        {DIA_CORTO[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.hora}>
                      <th scope="row" className="mapa-hora">
                        {f.etiqueta}
                      </th>
                      {f.celdas.map((c) => (
                        <td key={c.dia} className={`mapa-celda ${c.nivel ? `calor-${c.nivel}` : "calor-sin"}`} title={c.titulo}>
                          {c.conClases ? (
                            <>
                              {c.texto}
                              <span className="solo-lectores">, {c.detalle}</span>
                            </>
                          ) : (
                            <span className="solo-lectores">Sin clases</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <LeyendaDeCalor etiqueta="Qué significa cada color de la ocupación" sinDato="Sin clases" />
            </>
          ) : (
            <Vacio titulo="No hay grupos con horario" icono="vacio">
              Cuando haya grupos activos con su horario, aquí verás en qué días y horas se llenan.
            </Vacio>
          )}
        </figure>
        <div className="mapa-columna">
          <section className="panel-b panel-b-llenos" aria-labelledby="mapa-llenos-titulo">
            <h3 className="panel-b-titulo panel-b-titulo-icono" id="mapa-llenos-titulo">
              <span className="mapa-icono-alerta">
                <Icono nombre="alerta" tamano={18} />
              </span>
              A reventar: abrir otro grupo
            </h3>
            <ListaDeGrupos items={llenos.visibles} fuera={llenos.fuera} tono="llenos" vacio="Ningún grupo está a reventar." />
          </section>
          <section className="panel-b panel-b-vacios" aria-labelledby="mapa-vacios-titulo">
            <h3 className="panel-b-titulo" id="mapa-vacios-titulo">
              Con lugares: promoverlos
            </h3>
            <ListaDeGrupos items={vacios.visibles} fuera={vacios.fuera} tono="vacios" vacio="Ningún grupo tiene lugares de sobra." />
          </section>
        </div>
      </div>
    </SeccionNumerada>
  );
}
