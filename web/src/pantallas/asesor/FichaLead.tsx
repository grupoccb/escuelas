// La ficha de un lead (asesor): el adulto que escribió, sus alumnos potenciales, de dónde vino, lo que se le cotizó, su clase muestra, el historial de etapas, sus
// tareas y el enlace a su conversación en Chatwoot. Desde aquí se mueve de etapa, se cotiza, se agenda y se inicia la inscripción.

import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Etapa, LeadDetalle, MotivoPerdida, Tarea } from "../../api/tipos.ts";
import { urlDeConversacion } from "../../lib/chatwoot.ts";
import { formatearFecha, formatearInstante } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, EnlaceBoton, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import type { Vertical } from "../admin/tipos.ts";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { ClasesMuestraDeLead } from "./ClasesMuestraDeLead.tsx";
import { Cotizaciones, useCotizaciones } from "./Cotizaciones.tsx";
import { listaConY, pasosDeAvance } from "./avance-etapas.ts";
import { FUENTES } from "./Embudo.tsx";
import { type Historial, textoDeMotivo } from "./historial-lead.ts";
import { sePuedeMarcarComoInscrito } from "./inscrito-a-mano.ts";
import { MarcarInscrito } from "./MarcarInscrito.tsx";
import { MoverEtapa } from "./MoverEtapa.tsx";
import { Ninos } from "./Ninos.tsx";
import { TarjetaDeTarea } from "./Tareas.tsx";
import { haceCuanto } from "./tareas-vista.ts";

/** Las claves de la atribución que se pueden mostrar (el resto del referral del proveedor no es para la pantalla). */
const CLAVES_DE_ATRIBUCION: Record<string, string> = { fuente: "Fuente", utm_source: "Plataforma del anuncio", utm_medium: "Tipo de anuncio", utm_campaign: "Campaña del anuncio", utm_content: "Contenido del anuncio", utm_term: "Palabra clave del anuncio", codigo_rastreo: "Código de rastreo" };

function EnlaceAChatwoot({ lead }: { lead: LeadDetalle }) {
  const { yo } = useSesion();
  const base = yo?.configuracion.chatwoot_url_publica ?? null;
  const conversaciones = lead.conversaciones;
  if (conversaciones.length === 0) return <span className="muted dato-chico">Sin conversación de WhatsApp todavía.</span>;
  const enlaces = conversaciones.map((c) => ({ c, url: urlDeConversacion(base, c.chatwoot) }));
  if (enlaces.every((e) => e.url === null)) return <Aviso tono="alerta">No se puede abrir la conversación: falta la dirección pública de Chatwoot. Pídele a quien administra el sistema que la configure.</Aviso>;
  return (
    <div className={enlaces.length > 2 ? "enlaces-chatwoot enlaces-chatwoot-muchos" : "enlaces-chatwoot"}>
      {enlaces.map(({ c, url }) =>
        url ? (
          <a key={c.id} className="boton" href={url} target="_blank" rel="noopener noreferrer" data-prueba="enlace-chatwoot">
            <Icono nombre="chatwoot" /> Abrir conversación en Chatwoot{enlaces.length > 1 ? ` (#${c.chatwoot.conversacion_id})` : ""}
          </a>
        ) : null,
      )}
    </div>
  );
}

/**
 * V7: un lead sin sucursal (el bot a medias, una landing sin sucursal) no se puede cotizar ni agendar. Aquí se la pone quien lo atiende, con un clic en la sucursal que acordó con la
 * familia (solo las suyas; el servidor revisa que la sucursal dé la disciplina). Se puede poner, no cambiar: cambiarla sacaría al lead del embudo de quien lo atiende.
 */
function ElegirSucursal({ lead, alElegir }: { lead: LeadDetalle; alElegir: () => void }) {
  const { yo } = useSesion();
  const accion = useAccion();
  const opciones = yo?.sucursales ?? [];
  return (
    <div className="pila" data-prueba="elegir-sucursal">
      <span>Sin elegir. ¿Cuál le queda mejor a la familia?</span>
      <div className="fila">
        {opciones.map((s) => (
          <Boton
            key={s.id}
            disabled={accion.ocupado}
            onClick={() =>
              void accion.ejecutar(async () => {
                await api.patch(`/api/leads/${lead.id}`, { sucursal_interes_id: s.id });
                alElegir();
              })
            }
          >
            {s.nombre}
          </Boton>
        ))}
      </div>
      <ErrorDeAccion error={accion.error} />
    </div>
  );
}

/** La barra de avance: una barra por etapa abierta, con la actual marcada (en celular solo se escribe el nombre de la actual). */
function AvanceEnElEmbudo({ etapas, actualId }: { etapas: readonly Etapa[]; actualId: string }) {
  const pasos = pasosDeAvance(etapas, actualId);
  if (pasos.length === 0) return null;
  return (
    <ol className="avance-etapas" aria-label="Avance en el embudo" data-prueba="avance-en-el-embudo">
      {pasos.map((p) => (
        <li key={p.id} aria-current={p.estado === "actual" ? "step" : undefined} data-estado={p.estado}>
          <span className="avance-barra" aria-hidden="true" />
          <span className="avance-nombre">{p.nombre}</span>
        </li>
      ))}
    </ol>
  );
}

export default function FichaLead() {
  const { id = "" } = useParams();
  const { puede, moduloEncendido } = useSesion();
  const lead = useCarga((senal) => api.get<LeadDetalle>(`/api/leads/${id}`, undefined, senal), [id]);
  const etapas = useCarga((senal) => api.get<{ datos: Etapa[] }>("/api/etapas", undefined, senal).then((r) => r.datos), []);
  const motivos = useCarga((senal) => api.get<{ datos: MotivoPerdida[] }>("/api/motivos-perdida", { activo: true }, senal).then((r) => r.datos), []);
  const historial = useCarga((senal) => api.get<Historial>(`/api/leads/${id}/historial`, undefined, senal), [id]);
  const tareas = useCarga((senal) => (puede("tareas:leer") ? api.get<Pagina<Tarea>>("/api/tareas", { lead_id: id, estado: "pendiente", limite: 20 }, senal) : Promise.resolve(null)), [id]);
  // El color de cada disciplina sale de su dato (`color_marca`); si no se puede leer, los niños se ven con el tono neutro (la ficha no depende de esto).
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", { activo: true }, senal).then((r) => r.datos).catch(() => [] as Vertical[]), []);
  const colorDe = (verticalId: string): string | null => (verticales.datos ?? []).find((v) => v.id === verticalId)?.color_marca ?? null;
  // Las cotizaciones se leen aquí una vez: «Niños» dice «Cotizar otra vez» a quien ya tiene una y la tarjeta «Cotizaciones» las lista.
  const cotizaciones = useCotizaciones(id, moduloEncendido("cotizador"));
  const conCotizacion = new Set((cotizaciones.datos?.datos ?? []).filter((c) => c.estatus !== "vencida").map((c) => c.prospecto_id));
  const [moviendo, setMoviendo] = useState(false);
  const [marcando, setMarcando] = useState(false);
  // V3: el niño al que se le abre el formulario de cotizar (desde su fila en «Niños»).
  const [cotizandoA, setCotizandoA] = useState<{ id: string; vez: number } | null>(null);
  // Con el formulario de cotizar abierto, «Guardar cotización» es la acción principal: lo de la cabecera baja a secundario.
  const [cotizando, setCotizando] = useState(false);
  const d = lead.datos;
  useTitulo(d?.nombre_contacto ?? "Lead");
  const escribir = puede("leads:escribir");

  const recargar = () => {
    lead.recargar();
    historial.recargar();
    tareas.recargar();
  };

  if (lead.error) return <Marco titulo="Lead"><ErrorDeCarga error={lead.error} alReintentar={lead.recargar} /></Marco>;
  if (!d) return <Marco titulo="Lead"><Cargando /></Marco>;
  const nombre = d.nombre_contacto ?? "Sin nombre";
  const inscrito = d.etapa.tipo_sistema === "inscrito" || d.etapa.es_ganado;
  // V3: un lead ya inscrito que recibe a otro hijo vuelve a tener a quién inscribir.
  const hayPorInscribir = d.prospectos.some((p) => p.alumno_id === null);
  // V10b: con la inscripción apagada, «Marcar como inscrito» (la regla es del servidor; aquí solo se anticipa).
  const puedeMarcarInscrito = sePuedeMarcarComoInscrito({ inscripcionEncendida: moduloEncendido("inscripcion"), puedeEscribir: escribir, etapaActual: d.etapa });
  // «fuente» ya sale arriba con su nombre en español: repetirla con el valor crudo («landing») era ruido (V7).
  const hayConvertir = puede("conversion:ejecutar") && escribir && (!inscrito || hayPorInscribir);
  const atribucion = Object.entries(d.atribucion ?? {}).filter(([k, v]) => k !== "fuente" && k in CLAVES_DE_ATRIBUCION && typeof v === "string");
  // «Interés»: la disciplina del lead y las de sus niños (puede haber más de una).
  const interes = listaConY([d.vertical.nombre, ...d.prospectos.map((p) => p.vertical.nombre)]);
  const linea = [
    ...historial.datos?.inscripciones.map((i, n) => ({ clave: `inscripcion-${n}`, cuando: i.fecha, cambio: null as null })) ?? [],
    ...[...(historial.datos?.cambios ?? [])].map((c) => ({ clave: c.id, cuando: c.creado_en, cambio: c })),
  ].map((x, orden) => ({ x, orden })).sort((a, b) => Date.parse(b.x.cuando) - Date.parse(a.x.cuando) || b.orden - a.orden).map(({ x }) => x);

  return (
    <Marco
      titulo={nombre}
      encima={
        <Link className="enlace-atras" to="/embudo">
          <Icono nombre="atras" tamano={16} />
          Volver al embudo
        </Link>
      }
      acciones={
        <>
          <EnlaceAChatwoot lead={d} />
          {hayConvertir ? (
            <EnlaceBoton to={`/leads/${d.id}/convertir`} variante={cotizando ? "secundario" : "primario"}>
              {d.prospectos.filter((p) => p.alumno_id === null).length > 1 ? "Inscribir a los niños" : "Convertir e inscribir"}
            </EnlaceBoton>
          ) : null}
        </>
      }
    >
      {!d.sucursal && escribir ? (
        <Aviso tono="alerta" titulo="Falta la sucursal">
          Sin sucursal no se puede cotizar ni ver los grupos para la clase muestra. Pregúntale a la familia cuál le queda mejor y elígela en «Sucursal».
        </Aviso>
      ) : null}
      <section className="tarjeta ficha-resumen" aria-labelledby="ficha-contacto">
        <h2 id="ficha-contacto" className="solo-lectores">Contacto</h2>
        <div className="ficha-estado-fila">
          <div className="ficha-estado">
            <span className="ficha-etapa" data-prueba="etapa-actual">
              <span className="etapa-pildora" data-tono={d.etapa.es_perdido ? "peligro" : inscrito ? "exito" : "neutro"}>
                {d.etapa.nombre}
              </span>
              {historial.datos?.inscrito_a_mano ? <Insignia tono="info">Inscrito a mano</Insignia> : null}
            </span>
            <span className="ficha-telefono numero">{d.telefono ?? "—"}</span>
          </div>
          {escribir ? (
            <div className="fila fila-fin">
              {puedeMarcarInscrito ? <Boton variante={hayConvertir || cotizando ? "sutil" : "primario"} onClick={() => setMarcando(true)} data-prueba="marcar-como-inscrito">Marcar como inscrito</Boton> : null}
              <Boton onClick={() => setMoviendo(true)}>
                <Icono nombre="siguiente" tamano={18} />
                Mover de etapa
              </Boton>
            </div>
          ) : null}
        </div>
        {d.motivo_perdida || d.recuperaciones > 0 ? (
          <p className="muted ficha-etapa-nota" data-prueba="nota-de-etapa">
            {[d.motivo_perdida ? `Motivo: ${d.motivo_perdida.nombre}` : null, d.recuperaciones > 0 ? `Recuperado ${d.recuperaciones} ${d.recuperaciones === 1 ? "vez" : "veces"}` : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {etapas.datos ? <AvanceEnElEmbudo etapas={etapas.datos} actualId={d.etapa.id} /> : null}
        <dl className="datos-rejilla">
          <div>
            <dt>Sucursal</dt>
            <dd>{d.sucursal ? d.sucursal.nombre : escribir ? <ElegirSucursal lead={d} alElegir={recargar} /> : "Sin elegir"}</dd>
          </div>
          <div>
            <dt>Interés</dt>
            <dd>{interes}</dd>
          </div>
          <div>
            <dt>Llegó</dt>
            <dd className="numero">{formatearInstante(d.creado_en)}</dd>
          </div>
          <div>
            <dt>Último movimiento</dt>
            <dd className="numero">{d.ultima_interaccion_en ? (haceCuanto(d.ultima_interaccion_en) ?? formatearInstante(d.ultima_interaccion_en)) : "—"}</dd>
          </div>
        </dl>
      </section>

      <div className="ficha-columnas">
        <div className="ficha-columna ficha-columna-principal">
          <Ninos key={d.id} lead={d} puedeEscribir={escribir} cotizadorEncendido={moduloEncendido("cotizador")} alCambiar={() => { recargar(); cotizaciones.recargar(); }} alCotizar={(pid) => setCotizandoA({ id: pid, vez: Date.now() })} colorDe={colorDe} conCotizacion={conCotizacion} />
          {moduloEncendido("cotizador") ? <Cotizaciones lead={d} puedeEscribir={escribir} cotizarA={cotizandoA} alCambiarFormulario={setCotizando} carga={cotizaciones} /> : null}
          {moduloEncendido("clase_muestra") ? <ClasesMuestraDeLead lead={d} puedeEscribir={puede("clases_muestra:escribir")} alCambiar={recargar} /> : null}
        </div>

        <div className="ficha-columna ficha-columna-lateral">
          {tareas.datos && tareas.datos.datos.length > 0 ? (
            <Tarjeta titulo="Tareas">
              <ul className="tareas-ficha">
                {tareas.datos.datos.map((t) => (
                  <TarjetaDeTarea key={t.id} tarea={t} alCambiar={tareas.recargar} conEnlaceAlLead={false} variante="ficha" />
                ))}
              </ul>
            </Tarjeta>
          ) : null}

          <Tarjeta titulo="De dónde llegó">
            <dl className="ficha-origen">
              <dt>Fuente</dt>
              <dd>{FUENTES[d.fuente] ?? d.fuente}</dd>
              <dt>Campaña</dt>
              <dd>{d.campana?.nombre ?? "—"}</dd>
              {d.anuncio_titulo ? (
                <>
                  <dt>Anuncio</dt>
                  <dd>{d.anuncio_titulo}</dd>
                </>
              ) : null}
              {atribucion.map(([k, v]) => (
                <Fragment key={k}>
                  <dt>{CLAVES_DE_ATRIBUCION[k]}</dt>
                  <dd>{String(v)}</dd>
                </Fragment>
              ))}
            </dl>
            {/* V10 (V7-ASESOR-19): lo que capturó el asistente también queda como nota privada en Chatwoot; aquí no se decía. */}
            {d.conversaciones.length > 0 ? <p className="muted dato-chico" data-prueba="aviso-resumen-del-asistente">Lo que el asistente capturó (nombre, edad, sucursal y de dónde llegó) está aquí y también como nota privada al inicio de la conversación en Chatwoot.</p> : null}
          </Tarjeta>

          <Tarjeta titulo="Historial">
            {historial.error ? <ErrorDeCarga error={historial.error} alReintentar={historial.recargar} /> : null}
            {historial.datos && linea.length === 0 ? <Vacio icono="lista" titulo="Todavía no hay cambios de etapa registrados">El primer cambio aparecerá aquí cuando muevas al lead de etapa.</Vacio> : null}
            {linea.length > 0 ? (
              <ol className="linea-tiempo" data-prueba="historial">
                {linea.map((x, i) => {
                  const c = x.cambio;
                  return (
                    <li key={x.clave} data-reciente={i === 0 ? "" : undefined} data-prueba={c?.a_mano ? "cambio-a-mano" : c === null ? "inscripcion-real" : undefined}>
                      <span className="linea-tiempo-eje" aria-hidden="true">
                        <span className="linea-tiempo-punto" />
                        <span className="linea-tiempo-hilo" />
                      </span>
                      <div className="linea-tiempo-texto">
                        {c ? (
                          <>
                            <div className="linea-tiempo-titulo">
                              {c.desde ? (c.desde.nombre ?? "—") : "Alta"} → {c.hacia.nombre ?? "—"}
                              {c.a_mano ? (
                                <>
                                  {" "}
                                  <Insignia tono="info">Inscrito a mano</Insignia>
                                </>
                              ) : null}
                            </div>
                            {c.a_mano ? <div>Inscrito a mano por {c.usuario?.nombre ?? "una persona"} el {formatearInstante(c.creado_en)}</div> : null}
                            {c.motivo_perdida ? <div className="linea-tiempo-nota">Motivo de pérdida: {c.motivo_perdida.nombre}</div> : null}
                            {c.nota ? <div className="linea-tiempo-nota">Nota: {c.nota}</div> : null}
                            <div className="muted linea-tiempo-quien">
                              {c.origen === "sistema" ? "automático" : (c.usuario?.nombre ?? "persona")} · {formatearInstante(c.creado_en)} · {textoDeMotivo(c.motivo)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="linea-tiempo-titulo">Inscripción registrada en el sistema</div>
                            {historial.datos?.cambios.some((k) => k.a_mano) ? <div className="linea-tiempo-nota">La familia ya estaba marcada como inscrita a mano; desde ahora cuenta por esta inscripción.</div> : null}
                            <div className="muted linea-tiempo-quien">{formatearFecha(x.cuando)}</div>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </Tarjeta>
        </div>
      </div>

      <MarcarInscrito lead={marcando ? { id: d.id, nombre, etapa_id: d.etapa.id } : null} etapas={etapas.datos ?? []} abierto={marcando} alCerrar={() => setMarcando(false)} alMarcar={recargar} />
      <MoverEtapa lead={moviendo ? { id: d.id, nombre, etapa_id: d.etapa.id } : null} etapas={etapas.datos ?? []} motivos={motivos.datos ?? []} abierto={moviendo} alCerrar={() => setMoviendo(false)} alMover={recargar} />
    </Marco>
  );
}
