// «Hoy» (maestro, primero celular): sus clases muestra del día y las próximas, con el acceso al registro del alumno, la asistencia y «listo para cerrar»,
// más los avisos de clases agendadas, movidas o canceladas. Sin teléfono ni contacto de la familia (la API no los manda al maestro).

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Pagina as PaginaDeApi } from "../../api/cliente.ts";
import type { ClaseMuestra } from "../../api/tipos.ts";
import { ESTATUS_DE_CLASE } from "../../lib/etiquetas.ts";
import { diaEnZona, formatearFechaLarga, hoyLocal, sumarDias } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { useAccion, useAhora, useCarga, useTitulo } from "../../ui/hooks.ts";
import { CierreEnSitio } from "../conversion/CierreEnSitio.tsx";

interface AvisoMaestro {
  id: string;
  tipo: "agendada" | "reprogramada" | "cancelada";
  leido_en: string | null;
  datos: { nombre_alumno?: string; nombre_grupo?: string; nombre_sucursal?: string; fecha_clase?: string; hora_clase?: string; fecha_anterior?: string };
}

const TEXTO_DE_AVISO = { agendada: "Clase agendada", reprogramada: "Clase reprogramada", cancelada: "Clase cancelada" } as const;

/** «Hoy», «Mañana» o la fecha larga, según el día de calendario de la clase. */
export function etiquetaDeDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return `Hoy · ${formatearFechaLarga(fecha)}`;
  if (fecha === sumarDias(hoy, 1)) return `Mañana · ${formatearFechaLarga(fecha)}`;
  if (fecha === sumarDias(hoy, -1)) return `Ayer · ${formatearFechaLarga(fecha)}`;
  return formatearFechaLarga(fecha);
}

function Avisos() {
  const carga = useCarga((senal) => api.get<PaginaDeApi<AvisoMaestro>>("/api/maestro/avisos", { leidos: false, limite: 10 }, senal), []);
  const accion = useAccion();
  if (carga.error || !carga.datos || carga.datos.datos.length === 0) return null;
  return (
    <Tarjeta titulo={`Avisos nuevos (${carga.datos.paginacion.total})`}>
      <ErrorDeAccion error={accion.error} />
      <ul className="lista-tarjetas">
        {carga.datos.datos.map((a) => (
          <li key={a.id} className="fila fila-entre">
            <span>
              <strong>{TEXTO_DE_AVISO[a.tipo]}</strong>: {a.datos.nombre_alumno ?? "Alumno"}, {a.datos.nombre_grupo}
              {a.datos.fecha_clase ? ` · ${a.datos.fecha_clase}` : ""} {a.datos.hora_clase ?? ""}
              {a.datos.fecha_anterior ? <span className="muted"> (antes: {a.datos.fecha_anterior})</span> : null}
            </span>
            <Boton
              disabled={accion.ocupado}
              onClick={() =>
                void accion.ejecutar(async () => {
                  await api.patch(`/api/maestro/avisos/${a.id}`, { visto: true });
                  carga.recargar();
                })
              }
            >
              Visto
            </Boton>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function TarjetaDeClase({ clase, alCambiar }: { clase: ClaseMuestra; alCambiar: () => void }) {
  const { puede } = useSesion();
  const accion = useAccion();
  const [listo, setListo] = useState<string | null>(null);
  const estatus = ESTATUS_DE_CLASE[clase.estatus] ?? { texto: clase.estatus, tono: "neutro" as const };
  // La API no deja marcar antes de la hora de la clase (409): el botón lo dice de antemano.
  const ahora = useAhora();
  const empezo = new Date(clase.fecha_hora).getTime() <= ahora;

  const marcar = (valor: "asistio" | "no_asistio") =>
    void accion.ejecutar(async () => {
      await api.patch(`/api/clases-muestra/${clase.id}/asistencia`, { estatus: valor });
      alCambiar();
    });

  return (
    <li className="tarjeta" data-prueba={`clase-${clase.id}`}>
      <div className="fila fila-entre">
        <strong className="numero hora-clase">
          {clase.sesion.hora}
        </strong>
        <Insignia tono={estatus.tono}>{estatus.texto}</Insignia>
      </div>
      <p>
        <strong>{clase.prospecto ?? "Alumno sin nombre"}</strong>
        {clase.edad_declarada !== null ? ` · ${clase.edad_declarada} años` : ""}
      </p>
      <p className="muted">
        {clase.grupo} · {clase.programa} · {clase.sucursal}
      </p>
      {clase.contacto || clase.telefono ? (
        <p className="muted">
          Contacto: {clase.contacto ?? "—"} {clase.telefono ?? ""}
        </p>
      ) : null}
      <div className="pila">
        {puede("registro_muestra:leer") ? (
          <Link className="boton boton-primario boton-grande" to={`/clases/${clase.id}/registro`}>
            Registro del alumno
          </Link>
        ) : null}
        {puede("clases_muestra:asistencia") && (clase.estatus === "agendada" || clase.estatus === "asistio" || clase.estatus === "no_asistio") ? (
          <div className="fila">
            <Boton disabled={!empezo || clase.estatus === "asistio"} cargando={accion.ocupado} onClick={() => marcar("asistio")}>
              Asistió
            </Boton>
            <Boton disabled={!empezo || clase.estatus === "no_asistio"} cargando={accion.ocupado} onClick={() => marcar("no_asistio")}>
              No asistió
            </Boton>
            {!empezo ? <span className="muted">La asistencia se marca desde la hora de la clase.</span> : null}
          </div>
        ) : null}
        {clase.estatus === "asistio" && puede("clases_muestra:listo_para_cerrar") ? (
          <div className="pila">
            <Boton
              disabled={accion.ocupado}
              onClick={() =>
                void accion.ejecutar(async () => {
                  await api.post(`/api/clases-muestra/${clase.id}/listo-para-cerrar`);
                  setListo("Listo: el asesor recibió el aviso para cerrar la inscripción.");
                })
              }
            >
              Listo para cerrar la inscripción
            </Boton>
            {listo ? <Aviso tono="exito">{listo}</Aviso> : null}
            <CierreEnSitio leadId={clase.lead_id} />
          </div>
        ) : null}
        <ErrorDeAccion error={accion.error} />
      </div>
    </li>
  );
}

export default function Hoy() {
  useTitulo("Hoy");
  const { puede } = useSesion();
  const hoy = hoyLocal();
  const carga = useCarga((senal) => api.get<PaginaDeApi<ClaseMuestra>>("/api/maestro/clases-muestra", { limite: 100 }, senal), []);

  const porDia = new Map<string, ClaseMuestra[]>();
  for (const c of carga.datos?.datos ?? []) {
    const dia = diaEnZona(c.fecha_hora, c.zona_horaria);
    porDia.set(dia, [...(porDia.get(dia) ?? []), c]);
  }
  const dias = [...porDia.keys()].sort();

  return (
    <Pagina titulo="Hoy" subtitulo="Clases muestra de ayer, hoy y los próximos 14 días">
      {puede("avisos_maestro:leer") ? <Avisos /> : null}
      {carga.cargando && !carga.datos ? <Cargando texto="Cargando tus clases…" /> : null}
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.datos && dias.length === 0 ? <Vacio titulo="No tienes clases muestra en estos días">Cuando el asesor agende una, aparecerá aquí.</Vacio> : null}
      {dias.map((dia) => (
        <section key={dia} aria-labelledby={`dia-${dia}`} className="pila">
          <h2 id={`dia-${dia}`}>{etiquetaDeDia(dia, hoy)}</h2>
          <ul className="lista-tarjetas">
            {(porDia.get(dia) ?? []).map((c) => (
              <TarjetaDeClase key={c.id} clase={c} alCambiar={carga.recargar} />
            ))}
          </ul>
        </section>
      ))}
    </Pagina>
  );
}
