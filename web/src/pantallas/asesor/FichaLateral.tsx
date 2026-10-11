// La ficha lateral del embudo (R2b): un panel de 460 px que entra desde la derecha (pantalla completa en celular) con lo que hace falta para decidir sin salir del tablero: quién es, la tarea
// pendiente si está estancado, UNA acción principal según su etapa, «Abrir conversación», «Mover de etapa», para quién son las clases, la clase muestra, de dónde llegó y el historial en línea de
// tiempo. Lee lo mismo que la ficha completa (`GET /api/leads/:id`, `…/historial`, tareas y clases del lead); no escribe nada: toda acción la ejecuta el embudo (`alAccion`, `alMover`).
// Es un `<dialog>` modal (como `ui/Dialogo.tsx`): atrapa el foco, Esc lo cierra y el resto de la página queda inerte.

import { useEffect, useRef, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Pagina } from "../../api/cliente.ts";
import type { ClaseMuestra, Etapa, LeadDetalle, ProspectoDeLead, Tarea } from "../../api/tipos.ts";
import { ESTATUS_DE_CLASE } from "../../lib/etiquetas.ts";
import { diasDesde, formatearInstante } from "../../lib/fechas.ts";
import { Boton, Cargando, ErrorDeCarga, Insignia, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect } from "../../ui/campos.tsx";
import { ConDisciplina, iniciales, useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga } from "../../ui/hooks.ts";
import { accionDeEtapa, esDeCierre, etapasDespuesDeLaClase, opcionesDeMover, tonoDeEtapa, type AccionDeEtapa } from "./etapas-embudo.ts";
import { FUENTES } from "./fuentes.ts";
import { haceTexto, lineaDeTiempo, type Historial } from "./historial-lead.ts";
import { esEtapaDeInscrito, esEtapaPerdida, sePuedeMarcarComoInscrito } from "./inscrito-a-mano.ts";

/** Lo que la ficha le pide al embudo cuando se pulsa su acción principal. */
export type AccionDeFicha = AccionDeEtapa | "recuperar";

/** Lo que esta persona puede hacer y lo que está encendido (el embudo ya lo sabe: se le pasa tal cual). */
export interface PermisosDeFicha {
  inscripcionEncendida: boolean;
  puedeInscribir: boolean;
  puedeAgendar: boolean;
  puedeVerExpediente: boolean;
  puedeLeerClases: boolean;
  puedeLeerTareas: boolean;
}

export interface PropsDeFicha {
  /** El lead abierto, o `null` con la ficha cerrada. */
  leadId: string | null;
  /** Su nombre según el tablero: es el nombre accesible del panel mientras llegan los demás datos. */
  nombre: string;
  etapas: readonly Etapa[];
  /** La disciplina de cada `vertical.id` con su color (`color_marca`): el color nunca sale de un mapa por nombre. */
  disciplinas: ReadonlyMap<string, { nombre: string; color: string | null }>;
  /** Días sin movimiento si el lead está estancado; `null` si no. */
  estancadoDias: number | null;
  /** Cambia cada vez que el embudo recarga (porque algo se movió): la ficha vuelve a leer. */
  version: number;
  hayChat: boolean;
  permisos: PermisosDeFicha;
  alCerrar: () => void;
  alChat: (leadId: string) => void;
  alAccion: (leadId: string, accion: AccionDeFicha) => void;
  /** Elegir otra etapa en «Mover de etapa»: el embudo decide si mueve, pide el motivo, la nota o abre la inscripción. */
  alMover: (leadId: string, etapaId: string) => void;
}

const ETIQUETAS_DE_ACCION: Record<AccionDeFicha | "expediente", string> = {
  marcar: "Marcar como inscrito",
  inscribir: "Convertir e inscribir",
  agendar: "Agendar clase muestra",
  "cambiar-clase": "Cambiar la clase muestra",
  recuperar: "Recuperar lead",
  expediente: "Ver expediente",
};

const minuscula = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="ficha-seccion">
      <h3>{titulo}</h3>
      {children}
    </section>
  );
}

function AvatarGrande({ nombre, color }: { nombre: string; color: string | null }) {
  const ref = useDisciplina<HTMLSpanElement>(color);
  return (
    <span ref={ref} className="avatar-disciplina ficha-avatar" aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}

const textoDeEdad = (p: ProspectoDeLead): string | null => {
  const edad = p.edad ?? p.edad_declarada;
  return edad === null ? null : edad === 0 ? "menos de 1 año" : `${edad} ${edad === 1 ? "año" : "años"}`;
};

/** La clase que importa: la agendada más próxima o, si no hay, la última a la que se asistió (o faltó). */
function claseDeLaFicha(clases: readonly ClaseMuestra[]): ClaseMuestra | null {
  const vivas = clases.filter((c) => c.estatus === "agendada" || c.estatus === "asistio" || c.estatus === "no_asistio");
  const agendada = vivas.filter((c) => c.estatus === "agendada").sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0];
  return agendada ?? vivas.sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))[0] ?? null;
}

export function FichaLateral(p: PropsDeFicha) {
  const abierta = p.leadId !== null;
  const ref = useRef<HTMLDialogElement>(null);
  const navegar = useNavigate();
  const lead = useCarga((senal) => api.get<LeadDetalle>(`/api/leads/${p.leadId ?? ""}`, undefined, senal), [p.leadId], abierta);
  const historial = useCarga((senal) => api.get<Historial>(`/api/leads/${p.leadId ?? ""}/historial`, undefined, senal), [p.leadId], abierta);
  const tareas = useCarga((senal) => api.get<Pagina<Tarea>>("/api/tareas", { lead_id: p.leadId ?? "", estado: "pendiente", limite: 20 }, senal), [p.leadId], abierta && p.permisos.puedeLeerTareas);
  const clases = useCarga((senal) => api.get<Pagina<ClaseMuestra>>("/api/clases-muestra", { lead_id: p.leadId ?? "", limite: 50 }, senal), [p.leadId], abierta && p.permisos.puedeLeerClases);

  // Abrir y cerrar el <dialog> nativo; al abrir, el foco va al panel (su nombre accesible es el del lead).
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) {
      d.showModal();
      d.focus({ preventScroll: true });
    }
    if (!abierta && d.open) d.close();
  }, [abierta]);

  // Si el embudo recargó porque algo se movió, la ficha vuelve a leer (sin parpadear: lo mostrado se conserva mientras llega lo nuevo).
  const versionVista = useRef(p.version);
  useEffect(() => {
    if (versionVista.current === p.version) return;
    versionVista.current = p.version;
    if (!abierta) return;
    lead.recargar();
    historial.recargar();
    tareas.recargar();
    clases.recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando el embudo cambia de versión
  }, [p.version]);

  const d = lead.datos;
  const etapa = d ? p.etapas.find((e) => e.id === d.etapa.id) : undefined;
  const nombre = d?.nombre_contacto ?? p.nombre;
  const disciplina = d ? p.disciplinas.get(d.vertical.id) : undefined;
  const tareaFria = tareas.datos?.datos.find((t) => t.tipo === "lead_frio") ?? null;
  const clase = clases.datos ? claseDeLaFicha(clases.datos.datos) : null;
  const agendada = (clases.datos?.datos ?? []).some((c) => c.estatus === "agendada");

  /** La acción principal (una sola) según la etapa; los inscritos van al expediente y los perdidos se recuperan. */
  const principal = ((): { tipo: AccionDeFicha | "expediente"; etiqueta: string } | null => {
    if (!d) return null;
    if (esEtapaPerdida(d.etapa)) return { tipo: "recuperar", etiqueta: ETIQUETAS_DE_ACCION.recuperar };
    if (esEtapaDeInscrito(d.etapa)) return p.permisos.puedeVerExpediente && d.prospectos.some((x) => x.alumno_id !== null) ? { tipo: "expediente", etiqueta: ETIQUETAS_DE_ACCION.expediente } : null;
    const tipo = accionDeEtapa({
      cerrada: esDeCierre(d.etapa),
      puedeMarcar: sePuedeMarcarComoInscrito({ inscripcionEncendida: p.permisos.inscripcionEncendida, puedeEscribir: true, etapaActual: d.etapa }),
      despuesDeLaClase: etapasDespuesDeLaClase([...p.etapas]).has(d.etapa.id),
      puedeInscribir: p.permisos.puedeInscribir,
      puedeAgendar: p.permisos.puedeAgendar,
      tieneClaseAgendada: agendada,
    });
    return tipo ? { tipo, etiqueta: ETIQUETAS_DE_ACCION[tipo] } : null;
  })();

  const alPrincipal = () => {
    if (!d || !principal) return;
    if (principal.tipo === "expediente") {
      const alumno = d.prospectos.find((x) => x.alumno_id !== null)?.alumno_id;
      if (alumno) void navegar(`/alumnos/${alumno}`);
      return;
    }
    p.alAccion(d.id, principal.tipo);
  };

  const inscrito = d ? esEtapaDeInscrito(d.etapa) : false;
  const opciones = opcionesDeMover(p.etapas, 1, d?.etapa.id).map((o) => {
    // Con la inscripción apagada, «Inscrito» no abre la inscripción: se marca a mano.
    const nota = o.nota !== "" && esEtapaDeInscrito(p.etapas.find((e) => e.id === o.etapaId) ?? { es_ganado: false, tipo_sistema: null }) && !p.permisos.inscripcionEncendida ? "Se marca a mano" : o.nota;
    return { valor: o.etapaId, texto: nota && !o.deshabilitada ? `${o.nombre} (${minuscula(nota)})` : o.nombre, deshabilitada: o.deshabilitada && o.etapaId !== d?.etapa.id };
  });
  const dias = d ? diasDesde(d.ultima_interaccion_en ?? d.creado_en) : 0;
  const linea = historial.datos ? lineaDeTiempo(historial.datos, p.etapas) : [];

  return (
    <dialog
      ref={ref}
      className="ficha-lateral"
      tabIndex={-1}
      aria-label={`Ficha de ${nombre}`}
      data-prueba="ficha-lateral"
      onCancel={(e) => {
        e.preventDefault();
        p.alCerrar();
      }}
      onClose={() => {
        // El evento `close` llega después de cerrar; si entre tanto se volvió a abrir (Esc y Enter seguidos), ese `close` viejo no debe cerrar la ficha nueva.
        if (abierta && !ref.current?.open) p.alCerrar();
      }}
      onClick={(e) => {
        // Un clic en el velo (fuera del panel) la cierra.
        if (e.target === e.currentTarget) p.alCerrar();
      }}
    >
      {abierta ? (
        <div className="ficha-lateral-marco">
          <div className="ficha-lateral-cabecera">
            <span className="ficha-lateral-rotulo">Ficha del lead</span>
            <div className="ficha-lateral-cabecera-botones">
              <Link className="ficha-abrir-completa" to={`/leads/${p.leadId ?? ""}`}>
                Abrir completa
                <Icono nombre="enlace_externo" tamano={16} />
              </Link>
              <button type="button" className="boton-icono-ficha" aria-label="Cerrar la ficha" onClick={p.alCerrar}>
                <Icono nombre="cerrar" tamano={20} />
              </button>
            </div>
          </div>

          <div className="ficha-lateral-cuerpo">
            {lead.error ? <ErrorDeCarga error={lead.error} alReintentar={lead.recargar} /> : null}
            {!d && !lead.error ? <Cargando texto="Abriendo la ficha…" /> : null}
            {d ? (
              <>
                <div className="ficha-identidad">
                  <AvatarGrande nombre={nombre} color={disciplina?.color ?? null} />
                  <div className="ficha-identidad-texto">
                    <h2>{nombre}</h2>
                    <div className="ficha-identidad-linea">
                      <span className="etapa-pildora" data-tono={etapa ? tonoDeEtapa(etapa) : "neutro"}>
                        {d.etapa.nombre}
                      </span>
                      {d.telefono ? <span className="numero ficha-telefono-texto">{d.telefono}</span> : null}
                    </div>
                    <div className="muted ficha-ultimo">
                      Llegó {formatearInstante(d.creado_en)} · último movimiento {haceTexto(dias)}
                      {d.recuperaciones > 0 ? ` · Recuperado ${d.recuperaciones} ${d.recuperaciones === 1 ? "vez" : "veces"}` : ""}
                    </div>
                  </div>
                </div>

                {p.estancadoDias !== null ? (
                  <div className="aviso aviso-alerta" data-prueba="ficha-estancado">
                    <span className="aviso-icono">
                      <Icono nombre="alerta" tamano={18} />
                    </span>
                    <div className="aviso-cuerpo">
                      <strong>{`${p.estancadoDias} ${p.estancadoDias === 1 ? "día" : "días"} sin movimiento en ${d.etapa.nombre}`}</strong>
                      <div>{tareaFria ? `Tarea pendiente: decide cómo retomarlo. ${tareaFria.descripcion}` : "Decide cómo retomarlo."}</div>
                    </div>
                  </div>
                ) : null}

                <div className="ficha-acciones">
                  {principal ? (
                    <Boton variante="primario" className="ficha-accion-principal" onClick={alPrincipal} data-prueba="ficha-accion-principal">
                      {principal.etiqueta}
                    </Boton>
                  ) : null}
                  {p.hayChat ? (
                    <Boton onClick={() => p.alChat(d.id)}>
                      <Icono nombre="chatwoot" tamano={18} />
                      Abrir conversación
                    </Boton>
                  ) : null}
                </div>

                <CampoSelect etiqueta="Mover de etapa" value={d.etapa.id} disabled={inscrito} onChange={(e) => p.alMover(d.id, e.target.value)} opciones={opciones} ayuda={inscrito ? "Un inscrito ya es alumno: los cambios se hacen desde su expediente." : undefined} />

                <Seccion titulo="Para quién son las clases">
                  {d.prospectos.length === 0 ? (
                    <Vacio icono="alumnos" titulo="Todavía no se sabe quién tomará las clases" />
                  ) : (
                    <ul className="ficha-ninos">
                      {d.prospectos.map((n) => {
                        const v = p.disciplinas.get(n.vertical.id);
                        const edad = textoDeEdad(n);
                        return (
                          <ConDisciplina key={n.id} as="li" color={v?.color ?? null} className="ficha-nino">
                            <span className="ficha-nino-barra" aria-hidden="true" />
                            <div className="ficha-nino-texto">
                              <div className="ficha-nino-nombre">
                                {[n.nombre, n.apellidos].filter(Boolean).join(" ") || "Sin nombre"}
                                {edad ? <span className="ficha-nino-edad"> · {edad}</span> : null}
                              </div>
                              <div className="muted">
                                {n.vertical.nombre}
                                {n.programa_sugerido ? ` · sugerido: ${n.programa_sugerido.nombre}` : ""}
                              </div>
                            </div>
                          </ConDisciplina>
                        );
                      })}
                    </ul>
                  )}
                </Seccion>

                {clase ? (
                  <Seccion titulo="Clase muestra">
                    <div className="ficha-clase" data-prueba="ficha-clase">
                      <div className="ficha-clase-fila">
                        <strong>{`${clase.sesion.fecha} · ${clase.sesion.hora}`}</strong>
                        <Insignia tono={ESTATUS_DE_CLASE[clase.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_CLASE[clase.estatus]?.texto ?? clase.estatus}</Insignia>
                      </div>
                      <div className="muted">{`${clase.grupo} · ${clase.sucursal}`}</div>
                    </div>
                  </Seccion>
                ) : null}

                <Seccion titulo="De dónde llegó">
                  <dl className="ficha-origen">
                    <dt>Fuente</dt>
                    <dd>{FUENTES[d.fuente] ?? d.fuente}</dd>
                    <dt>Campaña</dt>
                    <dd>{d.campana?.nombre ?? "Sin campaña"}</dd>
                    <dt>Sucursal</dt>
                    <dd>{d.sucursal?.nombre ?? "Sin elegir"}</dd>
                  </dl>
                </Seccion>

                <Seccion titulo="Historial">
                  {historial.error ? <ErrorDeCarga error={historial.error} alReintentar={historial.recargar} /> : null}
                  {!historial.datos && !historial.error ? <Cargando texto="Leyendo el historial…" /> : null}
                  {historial.datos && linea.length === 0 ? <Vacio icono="lista" titulo="Todavía no hay cambios de etapa registrados" /> : null}
                  {linea.length > 0 ? (
                    <ol className="linea-tiempo" data-prueba="ficha-historial">
                      {linea.map((x, i) => (
                        <li key={x.id} data-reciente={i === 0 ? "" : undefined}>
                          <span className="linea-tiempo-eje" aria-hidden="true">
                            <span className="linea-tiempo-punto" />
                            <span className="linea-tiempo-hilo" />
                          </span>
                          <div className="linea-tiempo-texto">
                            <div className="linea-tiempo-titulo">{x.titulo}</div>
                            {x.notas.map((n) => (
                              <div key={n} className="linea-tiempo-nota">
                                {n}
                              </div>
                            ))}
                            <div className="muted linea-tiempo-quien">
                              {x.quien} · {formatearInstante(x.cuando)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </Seccion>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
