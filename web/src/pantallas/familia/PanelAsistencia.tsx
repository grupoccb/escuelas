// «Asistencia» del expediente: el porcentaje de 30 días, el aviso de faltas seguidas y la rejilla de las últimas clases (de todas sus inscripciones vigentes), más los eventos en que participó y
// lo que compró. La rejilla se lee de `GET /api/inscripciones/:id/asistencia` (el pase de lista); sin ese permiso, o si falla, el panel sigue con lo que trae el expediente.

import { api, type Pagina } from "../../api/cliente.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { Insignia, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { useCarga } from "../../ui/hooks.ts";
import { Icono } from "../../ui/Icono.tsx";
import { avisoDeFaltas, celdasDeClases, CLASES_A_MOSTRAR, textoDeAsistencia } from "./expediente-vista.ts";
import type { InscripcionDeExpediente, Operativo } from "./tipos.ts";
import { ESTATUS_DE_EVENTO, textoLegible } from "./vista.ts";

interface FilaDePase {
  fecha: string;
  estatus: string;
}

function UltimasClases({ inscripciones }: { inscripciones: readonly InscripcionDeExpediente[] }) {
  const ids = inscripciones.map((i) => i.id).join(",");
  const carga = useCarga(
    async (senal) => {
      const porInscripcion = await Promise.all(inscripciones.map((i) => api.get<Pagina<FilaDePase>>(`/api/inscripciones/${i.id}/asistencia`, { limite: CLASES_A_MOSTRAR }, senal).then((r) => r.datos)));
      return porInscripcion.flat();
    },
    [ids],
    inscripciones.length > 0,
  );
  if (inscripciones.length === 0 || carga.error) return null;
  if (!carga.datos) return <p className="muted">Cargando las últimas clases…</p>;
  const celdas = celdasDeClases(carga.datos);
  if (celdas.length === 0) return <Vacio titulo="Todavía no hay clases con pase de lista" icono="lista">Aparecerán aquí cuando el maestro pase lista.</Vacio>;
  return (
    <>
      <h3 className="asistencia-subtitulo">Últimas {celdas.length === 1 ? "clase" : `${celdas.length} clases`}</h3>
      <div className="clases-rejilla" role="list" aria-label="Asistencia por clase" data-prueba="ultimas-clases">
        {celdas.map((c) => (
          <div key={`${c.fecha}-${c.marca}`} role="listitem" title={c.titulo} className={`clase-celda clase-celda-${c.tono}`}>
            <span>{c.dia}</span>
            <span className="clase-celda-marca">{c.marca}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function PanelAsistencia({ o, vigentes, puedeVerClases }: { o: Operativo; vigentes: readonly InscripcionDeExpediente[]; puedeVerClases: boolean }) {
  const a = o.asistencia;
  const aviso = a ? avisoDeFaltas(a.racha_de_faltas, a.umbral_de_faltas) : null;
  return (
    <div className="pila expediente-panel" data-prueba="panel-asistencia">
      {a ? (
        <section className="tarjeta">
          <div className="asistencia-cabecera">
            <h2>Asistencia, últimos 30 días</h2>
            <span className="asistencia-cifra">
              <span data-prueba="asistencia-30">{textoDeAsistencia(a.porcentaje_30_dias)}</span> asistencia
            </span>
          </div>
          {aviso ? (
            <p className="aviso-faltas">
              <Icono nombre="alerta" tamano={18} />
              <span>{aviso}</span>
            </p>
          ) : null}
          <p className="muted">
            Faltas seguidas: <strong data-prueba="racha-de-faltas">{a.racha_de_faltas}</strong>
            {a.racha_de_faltas >= a.umbral_de_faltas && a.umbral_de_faltas > 0 ? ` · en el umbral (${a.umbral_de_faltas})` : ""}
          </p>
          {puedeVerClases ? <UltimasClases inscripciones={vigentes} /> : null}
        </section>
      ) : null}
      <div className="expediente-rejilla">
        {o.eventos ? (
          <Tarjeta titulo="Eventos">
            {o.eventos.length === 0 ? <Vacio titulo="Sin eventos todavía" icono="hoy" /> : null}
            <ul className="lista-tarjetas">
              {o.eventos.map((e) => (
                <li key={e.evento.id} className="pila">
                  <strong>
                    {e.evento.nombre} · {formatearFecha(e.evento.fecha)}
                  </strong>
                  <span className="fila">
                    <Insignia tono={ESTATUS_DE_EVENTO[e.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_EVENTO[e.estatus]?.texto ?? textoLegible(e.estatus)}</Insignia>
                    <span className="muted">
                      {e.resultado ? textoLegible(e.resultado) : ""}
                      {e.nivel_otorgado ? `${e.resultado ? " · " : ""}${e.nivel_otorgado.nombre}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
        {o.productos_comprados ? (
          <Tarjeta titulo="Productos comprados">
            {o.productos_comprados.disponible ? (
              o.productos_comprados.productos.length === 0 ? (
                <Vacio titulo="Sin compras" icono="ventas" />
              ) : (
                <ul className="lista-filas" data-prueba="productos-comprados">
                  {o.productos_comprados.productos.map((p, i) => (
                    <li key={i}>
                      <span className="numero">{p.cantidad}</span> × {p.producto} · {formatearFecha(p.fecha)}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <Vacio titulo="No disponible todavía" icono="info" />
            )}
          </Tarjeta>
        ) : null}
      </div>
    </div>
  );
}
