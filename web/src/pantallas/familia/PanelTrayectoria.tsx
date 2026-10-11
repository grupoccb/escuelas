// «Trayectoria» del expediente: la línea de tiempo del alumno (inscripción, cambios de grupo, niveles, eventos y baja), el avance en cada disciplina con el próximo evento y las inscripciones
// con sus acciones. Todo sale de `GET /api/alumnos/:id/expediente`; el color de cada disciplina, del dato `color_marca`.

import { formatearFecha, formatearFechaLarga } from "../../lib/fechas.ts";
import { Insignia, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { ConDisciplina } from "../../ui/disciplina.tsx";
import { AccionesDeInscripcion } from "./AccionesDeInscripcion.tsx";
import { BarraDeAvance } from "./BarraDeAvance.tsx";
import { avanceHaciaElEvento, lineaDeTiempo, textoDeProximoEvento, vigentes } from "./expediente-vista.ts";
import type { Comercial, Operativo, Trayectoria } from "./tipos.ts";
import { ESTATUS_DE_INSCRIPCION, textoDeAntiguedad } from "./vista.ts";

/** Una disciplina con su nivel actual y su próximo evento: lo que juntan `niveles` y `proximo_examen` del expediente. */
function avancesPorDisciplina(t: Trayectoria) {
  const porId = new Map<string, { vertical: { id: string; nombre: string; etiqueta_progresion: string | null }; nivel: Trayectoria["niveles"][number] | null; proximo: Trayectoria["proximo_examen"][number] | null }>();
  for (const n of t.niveles) porId.set(n.vertical.id, { vertical: n.vertical, nivel: n, proximo: null });
  for (const p of t.proximo_examen) {
    const previo = porId.get(p.vertical.id);
    porId.set(p.vertical.id, { vertical: previo?.vertical ?? { id: p.vertical.id, nombre: p.vertical.nombre, etiqueta_progresion: null }, nivel: previo?.nivel ?? null, proximo: p });
  }
  return [...porId.values()];
}

function TarjetaDeAvance({ a, color }: { a: ReturnType<typeof avancesPorDisciplina>[number]; color: string | null }) {
  const texto = a.proximo ? textoDeProximoEvento(a.proximo, formatearFechaLarga) : null;
  const avance = a.proximo ? avanceHaciaElEvento(a.proximo.elegibilidad) : null;
  return (
    <ConDisciplina color={color} as="section" className="tarjeta avance-tarjeta">
      <h2>Avance en {a.vertical.nombre}</h2>
      <div className="avance-nivel-fila">
        <span className="avance-nivel">{a.nivel?.nivel?.nombre ?? "Sin registrar"}</span>
        <span className="muted">
          {a.nivel?.nivel ? `${a.vertical.etiqueta_progresion ?? "Nivel"} actual` : `${a.vertical.etiqueta_progresion ?? "Nivel"}`}
          {a.nivel?.fecha_obtenido ? ` · desde ${formatearFecha(a.nivel.fecha_obtenido)}` : ""}
        </span>
      </div>
      {texto ? <p className="avance-evento">{texto}</p> : null}
      {avance !== null ? <BarraDeAvance porcentaje={avance} tono="disciplina" grande /> : null}
    </ConDisciplina>
  );
}

export function PanelTrayectoria({ t, eventos, bajas, nombre, puedeEscribir, colorDe, hoy, alCambiar }: { t: Trayectoria; eventos: Operativo["eventos"]; bajas: Comercial["motivo_de_baja"] | undefined; nombre: string; puedeEscribir: boolean; colorDe: (verticalId: string) => string | null; hoy: string; alCambiar: () => void }) {
  const hitos = lineaDeTiempo(t, { eventos, ...(bajas ? { bajas } : {}), hoy });
  const avances = avancesPorDisciplina(t);
  // Con una sola inscripción vigente las acciones van en el encabezado; con varias, cada fila trae las suyas.
  const accionesEnFilas = puedeEscribir && vigentes(t).length > 1;
  return (
    <div className="pila expediente-panel" data-prueba="panel-trayectoria">
      <div className="expediente-columnas">
        <section className="tarjeta expediente-linea">
          <h2>Trayectoria</h2>
          <dl className="expediente-resumen">
            <div>
              <dt>Antigüedad</dt>
              <dd data-prueba="antiguedad">{textoDeAntiguedad(t.antiguedad)}</dd>
            </div>
            <div>
              <dt>Inició</dt>
              <dd>{formatearFecha(t.fecha_de_inicio)}</dd>
            </div>
          </dl>
          {hitos.length === 0 ? (
            <Vacio titulo="Todavía no hay movimientos" icono="lista">Aparecerán aquí cuando se inscriba.</Vacio>
          ) : (
            <ol className="linea-de-tiempo" data-prueba="historial-de-grupo">
              {hitos.map((h, i) => (
                <li key={h.clave} className={i === 0 ? "linea-hito linea-hito-reciente" : "linea-hito"}>
                  <span className="linea-punto" aria-hidden="true" />
                  <span className="linea-texto">
                    <strong>{h.titulo}</strong>
                    <span className="muted">{h.detalle}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="expediente-lateral">
          {avances.length > 0 ? (
            <div className="expediente-avances" data-prueba="niveles">
              {avances.map((a) => (
                <TarjetaDeAvance key={a.vertical.id} a={a} color={colorDe(a.vertical.id)} />
              ))}
            </div>
          ) : null}
          <Tarjeta titulo="Inscripciones">
            {t.inscripciones.length === 0 ? <Vacio titulo="Todavía no tiene inscripciones" icono="lista" /> : null}
            <ul className="lista-filas inscripciones-lista">
              {t.inscripciones.map((i) => (
                <li key={i.id} className="pila" data-prueba={`inscripcion-${i.id}`}>
                  <div className="inscripcion-cabecera">
                    <span className="inscripcion-texto">
                      <span className="inscripcion-titulo">
                        <strong>{i.vertical.nombre}</strong> · {i.programa.nombre} · {i.grupo.nombre}
                      </span>
                      <span className="muted">
                        {i.sucursal.nombre} · desde {formatearFecha(i.fecha_inicio)}
                        {i.fecha_baja ? ` · baja ${formatearFecha(i.fecha_baja)}` : ""}
                      </span>
                    </span>
                    <Insignia tono={ESTATUS_DE_INSCRIPCION[i.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_INSCRIPCION[i.estatus]?.texto ?? i.estatus}</Insignia>
                  </div>
                  {accionesEnFilas ? <AccionesDeInscripcion inscripcion={i} nombre={nombre} alCambiar={alCambiar} /> : null}
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
