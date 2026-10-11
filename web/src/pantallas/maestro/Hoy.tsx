// «Hoy» (maestro, primero celular): sus clases muestra del día y las próximas, con el acceso al registro del alumno, la asistencia y «listo para cerrar»,
// más los avisos de clases agendadas, movidas o canceladas. Sin teléfono ni contacto de la familia (la API no los manda al maestro).

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Pagina as PaginaDeApi } from "../../api/cliente.ts";
import type { ClaseMuestra } from "../../api/tipos.ts";
import { ESTATUS_DE_CLASE } from "../../lib/etiquetas.ts";
import { diaEnZona, formatearFechaLarga, hoyLocal, sumarDias } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useAhora, useCarga, useTitulo } from "../../ui/hooks.ts";
import { BotonesDeAsistencia, type Marca } from "./BotonesDeAsistencia.tsx";
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
    <section className="avisos-maestro" aria-labelledby="avisos-maestro-titulo">
      <h2 id="avisos-maestro-titulo" className="avisos-maestro-titulo">
        <Icono nombre="campana" />
        Avisos nuevos ({carga.datos.paginacion.total})
      </h2>
      <ErrorDeAccion error={accion.error} />
      <ul className="avisos-maestro-lista">
        {carga.datos.datos.map((a) => (
          <li key={a.id} className="aviso-maestro">
            <span className="aviso-maestro-texto">
              <strong>{TEXTO_DE_AVISO[a.tipo]}</strong>: {a.datos.nombre_alumno ?? "Alumno"}, {a.datos.nombre_grupo}
              {a.datos.fecha_clase ? ` · ${formatearFechaLarga(a.datos.fecha_clase)}` : ""} {a.datos.hora_clase ?? ""}
              {a.datos.fecha_anterior ? <span> (antes: {formatearFechaLarga(a.datos.fecha_anterior)})</span> : null}
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
    </section>
  );
}

/** ¿La tarjeta muestra el cierre en sitio («Inscribir a mi alumno»)? Entonces esa es su acción principal y «Registro del alumno» pasa a secundario. */
function tieneCierre(clase: ClaseMuestra, { yo, puede, moduloEncendido }: ReturnType<typeof useSesion>): boolean {
  return clase.estatus === "asistio" && puede("clases_muestra:listo_para_cerrar") && moduloEncendido("inscripcion") && yo?.configuracion.modo_cierre === "maestro_en_sitio" && puede("conversion:ejecutar");
}

function TarjetaDeClase({ clase, alCambiar, principal }: { clase: ClaseMuestra; alCambiar: () => void; principal: boolean }) {
  const sesion = useSesion();
  const { puede, moduloEncendido } = sesion;
  const accion = useAccion();
  const hayCierre = tieneCierre(clase, sesion);
  const [listo, setListo] = useState<string | null>(null);
  const estatus = ESTATUS_DE_CLASE[clase.estatus] ?? { texto: clase.estatus, tono: "neutro" as const };
  // La API no deja marcar antes de la hora de la clase (409): el botón lo dice de antemano.
  const ahora = useAhora();
  const empezo = new Date(clase.fecha_hora).getTime() <= ahora;

  const [marcando, setMarcando] = useState<Marca>("asistio");
  const marcar = (valor: Marca) => {
    setMarcando(valor);
    void accion.ejecutar(async () => {
      await api.patch(`/api/clases-muestra/${clase.id}/asistencia`, { estatus: valor });
      alCambiar();
    });
  };

  return (
    <li className="clase-tarjeta" data-prueba={`clase-${clase.id}`}>
      <div className="clase-cabecera">
        <strong className="numero hora-clase">{clase.sesion.hora}</strong>
        <Insignia tono={estatus.tono}>{estatus.texto}</Insignia>
      </div>
      <div className="clase-alumno">
        <p className="clase-nombre">
          {clase.prospecto ?? "Alumno sin nombre"}
          {clase.edad_declarada !== null ? <span className="clase-edad">{` · ${clase.edad_declarada} años`}</span> : null}
        </p>
        <p className="clase-detalle">
          {clase.grupo} · {clase.programa} · {clase.sucursal}
        </p>
        {clase.contacto || clase.telefono ? (
          <p className="clase-detalle">
            Contacto: {clase.contacto ?? "—"} {clase.telefono ?? ""}
          </p>
        ) : null}
      </div>
      <div className="clase-acciones">
        {puede("registro_muestra:leer") ? (
          <Link className={`boton boton-grande ${principal && !hayCierre ? "boton-primario" : "boton-secundario"}`} to={`/clases/${clase.id}/registro`}>
            Registro del alumno
          </Link>
        ) : null}
        {puede("clases_muestra:asistencia") && (clase.estatus === "agendada" || clase.estatus === "asistio" || clase.estatus === "no_asistio") ? (
          <BotonesDeAsistencia estatus={clase.estatus} empezo={empezo} procesando={accion.ocupado ? marcando : null} alMarcar={marcar} />
        ) : null}
        {clase.estatus === "asistio" && puede("clases_muestra:listo_para_cerrar") && moduloEncendido("inscripcion") ? (
          <div className="clase-acciones">
            <Boton
              ancho
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
            <CierreEnSitio leadId={clase.lead_id} claseId={clase.id} alumno={clase.prospecto} principal={principal} />
          </div>
        ) : null}
        <ErrorDeAccion error={accion.error} />
      </div>
    </li>
  );
}

export default function Hoy() {
  useTitulo("Hoy");
  const sesion = useSesion();
  const { puede } = sesion;
  const hoy = hoyLocal();
  const carga = useCarga((senal) => api.get<PaginaDeApi<ClaseMuestra>>("/api/maestro/clases-muestra", { limite: 100 }, senal), []);

  const porDia = new Map<string, ClaseMuestra[]>();
  for (const c of carga.datos?.datos ?? []) {
    const dia = diaEnZona(c.fecha_hora, c.zona_horaria);
    porDia.set(dia, [...(porDia.get(dia) ?? []), c]);
  }
  const dias = [...porDia.keys()].sort();
  // Una sola acción principal por pantalla: la del cierre en sitio de la primera clase que lo muestra («Inscribir a mi alumno»); si ninguna lo muestra, la de la próxima clase
  // por registrar (la primera agendada) o, si ninguna lo está, la de la primera de la lista. Las demás, la secundaria.
  const todas = dias.flatMap((d) => porDia.get(d) ?? []);
  const primera = (todas.find((c) => tieneCierre(c, sesion)) ?? todas.find((c) => c.estatus === "agendada") ?? todas[0])?.id;

  return (
    <Pagina titulo="Hoy" subtitulo="Clases muestra de ayer, hoy y los próximos 14 días">
      <div className="maestro-columna">
      {puede("avisos_maestro:leer") ? <Avisos /> : null}
      {carga.cargando && !carga.datos ? <Cargando texto="Cargando tus clases…" /> : null}
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.datos && dias.length === 0 ? (
        <div className="vacio-maestro">
          <Vacio titulo="No tienes clases muestra en estos días">Cuando el asesor agende una, aparecerá aquí.</Vacio>
        </div>
      ) : null}
      {dias.map((dia) => (
        <section key={dia} aria-labelledby={`dia-${dia}`} className="pila dia-clases">
          <h2 id={`dia-${dia}`}>{etiquetaDeDia(dia, hoy)}</h2>
          <ul className="lista-clases">
            {(porDia.get(dia) ?? []).map((c) => (
              <TarjetaDeClase key={c.id} clase={c} alCambiar={carga.recargar} principal={c.id === primera} />
            ))}
          </ul>
        </section>
      ))}
      </div>
    </Pagina>
  );
}
