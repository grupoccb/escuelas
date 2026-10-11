// «Hoy» (maestro, primero celular): sus clases muestra del día y las próximas, con el acceso al registro del alumno, la asistencia y «listo para cerrar»,
// más los avisos de clases agendadas, movidas o canceladas. Sin teléfono ni contacto de la familia (la API no los manda al maestro).

import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Pagina as PaginaDeApi } from "../../api/cliente.ts";
import type { ClaseMuestra, Grupo } from "../../api/tipos.ts";
import { ESTATUS_DE_CLASE, ESTATUS_DE_REGISTRO } from "../../lib/etiquetas.ts";
import { diaEnZona, formatearFechaLarga, hoyLocal, sumarDias } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { EtiquetaDisciplina, useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useAhora, useCarga, useTitulo } from "../../ui/hooks.ts";
import type { Vertical } from "../admin/tipos.ts";
import { BotonesDeAsistencia, type Marca } from "./BotonesDeAsistencia.tsx";
import { CierreEnSitio } from "../conversion/CierreEnSitio.tsx";
import { conInicialMayuscula, esDelDia, hora12, horarioDeGrupo, marcaDeAhora, texto12 } from "./linea-de-tiempo.ts";
import type { EstatusDeRegistro, Registro } from "./tipos.ts";

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

/** El estatus del registro del alumno de una clase (`GET …/registro`); la tarjeta lo muestra si se puede leer y, si no, omite la línea (la pantalla no depende de eso). */
function useEstatusDeRegistro(claseId: string, activo: boolean): EstatusDeRegistro | null {
  const carga = useCarga((senal) => api.get<Registro>(`/api/clases-muestra/${claseId}/registro`, undefined, senal).then((r) => r.estatus).catch(() => null), [claseId], activo);
  return carga.datos;
}

/** Cómo se pinta el punto de la línea de tiempo: lo ya marcado, lo que ya empezó y lo que todavía no. */
function estadoDelPunto(clase: ClaseMuestra, empezo: boolean): "asistio" | "no_asistio" | "ahora" | "futura" {
  if (clase.estatus === "asistio" || clase.estatus === "no_asistio") return clase.estatus;
  return empezo ? "ahora" : "futura";
}

function TarjetaDeClase({ clase, alCambiar, principal, color, horario }: { clase: ClaseMuestra; alCambiar: () => void; principal: boolean; color: string | null; horario: string }) {
  const sesion = useSesion();
  const { puede, moduloEncendido } = sesion;
  const accion = useAccion();
  const hayCierre = tieneCierre(clase, sesion);
  const [listo, setListo] = useState<string | null>(null);
  const estatus = ESTATUS_DE_CLASE[clase.estatus] ?? { texto: clase.estatus, tono: "neutro" as const };
  // La API no deja marcar antes de la hora de la clase (409): el botón lo dice de antemano.
  const ahora = useAhora();
  const empezo = new Date(clase.fecha_hora).getTime() <= ahora;
  const ref = useDisciplina<HTMLLIElement>(color);
  const registro = useEstatusDeRegistro(clase.id, puede("registro_muestra:leer"));
  const textoDeRegistro = registro ? (ESTATUS_DE_REGISTRO[registro] ?? { texto: registro, tono: "neutro" as const }) : null;
  const { hora, ampm } = hora12(clase.sesion.hora);

  const [marcando, setMarcando] = useState<Marca>("asistio");
  const marcar = (valor: Marca) => {
    setMarcando(valor);
    void accion.ejecutar(async () => {
      await api.patch(`/api/clases-muestra/${clase.id}/asistencia`, { estatus: valor });
      alCambiar();
    });
  };

  return (
    <li ref={ref} className="clase-fila" data-prueba={`clase-${clase.id}`} data-punto={estadoDelPunto(clase, empezo)}>
      <span className="clase-riel" aria-hidden="true">
        <span className="clase-punto" />
      </span>
      <article className="clase-tarjeta">
        <div className="clase-banda" aria-hidden="true" />
        <div className="clase-cuerpo">
          <div className="clase-cabecera">
            <span className="clase-hora-linea">
              <strong className="numero hora-clase">{hora}</strong>
              <span className="clase-ampm">{ampm}</span>
            </span>
            <Insignia tono={estatus.tono}>{estatus.texto}</Insignia>
          </div>
          <div className="clase-alumno">
            <p className="clase-nombre">
              {clase.prospecto ?? "Alumno sin nombre"}
              {clase.edad_declarada !== null ? <span className="clase-edad">{` · ${clase.edad_declarada} años`}</span> : null}
            </p>
            <div className="clase-grupo-linea">
              <EtiquetaDisciplina nombre={clase.grupo} color={color} />
              <span className="clase-detalle">{[horario, clase.sucursal].filter(Boolean).join(" · ")}</span>
            </div>
            {textoDeRegistro ? (
              <p className="clase-registro">
                Registro del alumno: <strong className={`clase-registro-estado clase-registro-${registro}`}>{textoDeRegistro.texto}</strong>
              </p>
            ) : null}
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
              <BotonesDeAsistencia estatus={clase.estatus} empezo={empezo} procesando={accion.ocupado ? marcando : null} alMarcar={marcar} alumno={clase.prospecto ?? "Alumno sin nombre"} horaDeLaClase={texto12(clase.sesion.hora)} />
            ) : null}
            {clase.estatus === "asistio" && puede("clases_muestra:listo_para_cerrar") && moduloEncendido("inscripcion") ? (
              <div className="clase-acciones">
                {listo ? (
                  <Aviso tono="exito">{listo}</Aviso>
                ) : (
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
                )}
                <CierreEnSitio leadId={clase.lead_id} claseId={clase.id} alumno={clase.prospecto} principal={principal} />
              </div>
            ) : null}
            <ErrorDeAccion error={accion.error} />
          </div>
        </div>
      </article>
    </li>
  );
}

/** La marca «Ahora 4:20 pm · siguiente en 40 min» entre dos clases: un punto con anillo, una línea y la píldora con el texto. */
function MarcaDeAhora({ texto }: { texto: string }) {
  return (
    <li className="linea-ahora" data-prueba="marca-de-ahora">
      <span className="linea-ahora-punto" aria-hidden="true" />
      <span className="linea-ahora-trazo" aria-hidden="true" />
      <span className="linea-ahora-texto">{texto}</span>
    </li>
  );
}

export default function Hoy() {
  useTitulo("Hoy");
  const sesion = useSesion();
  const { puede } = sesion;
  const hoy = hoyLocal();
  const ahora = useAhora();
  const carga = useCarga((senal) => api.get<PaginaDeApi<ClaseMuestra>>("/api/maestro/clases-muestra", { limite: 100 }, senal), []);
  // El color de la disciplina (`color_marca`) y el horario del grupo salen de las tablas; sin ellas la tarjeta se ve neutra y sin horario (la pantalla no depende de esto).
  const grupos = useCarga((senal) => api.get<PaginaDeApi<Grupo>>("/api/grupos", { limite: 100 }, senal).then((r) => r.datos).catch(() => [] as Grupo[]), []);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal).then((r) => r.datos).catch(() => [] as Vertical[]), []);
  const colorDeGrupo = useMemo(() => {
    const color = new Map((verticales.datos ?? []).map((v) => [v.id, v.color_marca]));
    return new Map((grupos.datos ?? []).map((g) => [g.id, { color: color.get(g.programa.vertical_id) ?? null, horario: horarioDeGrupo(g.horarios) }]));
  }, [grupos.datos, verticales.datos]);

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
  const deHoy = (porDia.get(hoy) ?? []).filter((c) => esDelDia(c, hoy));
  const marca = marcaDeAhora(deHoy, ahora);
  const resumen = deHoy.length > 0 ? `${conInicialMayuscula(formatearFechaLarga(hoy))} · ${deHoy.length} ${deHoy.length === 1 ? "clase muestra" : "clases muestra"}` : "Clases muestra de ayer, hoy y los próximos 14 días";

  return (
    <Pagina titulo="Hoy" subtitulo={resumen}>
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
          <ol className="lista-clases">
            {(porDia.get(dia) ?? []).map((c) => (
              <Fragment key={c.id}>
                {dia === hoy && marca?.antesDeId === c.id ? <MarcaDeAhora texto={marca.texto} /> : null}
                <TarjetaDeClase clase={c} alCambiar={carga.recargar} principal={c.id === primera} color={colorDeGrupo.get(c.grupo_id)?.color ?? null} horario={colorDeGrupo.get(c.grupo_id)?.horario ?? ""} />
              </Fragment>
            ))}
          </ol>
        </section>
      ))}
      </div>
    </Pagina>
  );
}
