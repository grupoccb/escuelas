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
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { ClasesMuestraDeLead } from "./ClasesMuestraDeLead.tsx";
import { Cotizaciones } from "./Cotizaciones.tsx";
import { FUENTES } from "./Embudo.tsx";
import { type Historial, textoDeMotivo } from "./historial-lead.ts";
import { sePuedeMarcarComoInscrito } from "./inscrito-a-mano.ts";
import { MarcarInscrito } from "./MarcarInscrito.tsx";
import { MoverEtapa } from "./MoverEtapa.tsx";
import { Ninos } from "./Ninos.tsx";
import { TarjetaDeTarea } from "./Tareas.tsx";

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

export default function FichaLead() {
  const { id = "" } = useParams();
  const { puede, moduloEncendido } = useSesion();
  const lead = useCarga((senal) => api.get<LeadDetalle>(`/api/leads/${id}`, undefined, senal), [id]);
  const etapas = useCarga((senal) => api.get<{ datos: Etapa[] }>("/api/etapas", undefined, senal).then((r) => r.datos), []);
  const motivos = useCarga((senal) => api.get<{ datos: MotivoPerdida[] }>("/api/motivos-perdida", { activo: true }, senal).then((r) => r.datos), []);
  const historial = useCarga((senal) => api.get<Historial>(`/api/leads/${id}/historial`, undefined, senal), [id]);
  const tareas = useCarga((senal) => (puede("tareas:leer") ? api.get<Pagina<Tarea>>("/api/tareas", { lead_id: id, estado: "pendiente", limite: 20 }, senal) : Promise.resolve(null)), [id]);
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

  return (
    <Marco
      titulo={nombre}
      subtitulo={<Link className="enlace-volver" to="/embudo">← Volver al embudo</Link>}
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
      <Tarjeta
        titulo="Contacto"
        className="ficha-resumen"
        acciones={
          escribir ? (
            <div className="fila fila-fin">
              {puedeMarcarInscrito ? <Boton variante={hayConvertir || cotizando ? "sutil" : "primario"} onClick={() => setMarcando(true)} data-prueba="marcar-como-inscrito">Marcar como inscrito</Boton> : null}
              <Boton onClick={() => setMoviendo(true)}>Mover de etapa</Boton>
            </div>
          ) : undefined
        }
      >
        <div className="ficha-estado">
          <span className="ficha-etapa" data-prueba="etapa-actual">
            <Insignia tono={d.etapa.es_perdido ? "peligro" : inscrito ? "exito" : "info"}>{d.etapa.nombre}</Insignia>
            {historial.datos?.inscrito_a_mano ? <> <Insignia tono="info">Inscrito a mano</Insignia></> : null}
            {d.motivo_perdida ? ` · Motivo: ${d.motivo_perdida.nombre}` : ""}
            {d.recuperaciones > 0 ? ` · Recuperado ${d.recuperaciones} vez/veces` : ""}
          </span>
          <span className="ficha-telefono numero">{d.telefono ?? "—"}</span>
        </div>
        <dl className="datos-rejilla">
          <div>
            <dt>Sucursal</dt>
            <dd>{d.sucursal ? d.sucursal.nombre : escribir ? <ElegirSucursal lead={d} alElegir={recargar} /> : "Sin elegir"}</dd>
          </div>
          <div>
            <dt>Interés</dt>
            <dd>{d.vertical.nombre}</dd>
          </div>
          <div>
            <dt>Llegó</dt>
            <dd className="numero">{formatearInstante(d.creado_en)}</dd>
          </div>
          <div>
            <dt>Último movimiento</dt>
            <dd className="numero">{formatearInstante(d.ultima_interaccion_en)}</dd>
          </div>
        </dl>
      </Tarjeta>

      <Ninos key={d.id} lead={d} puedeEscribir={escribir} cotizadorEncendido={moduloEncendido("cotizador")} alCambiar={recargar} alCotizar={(id) => setCotizandoA({ id, vez: Date.now() })} />

      <Tarjeta titulo="De dónde llegó">
        {/* V10 (V7-ASESOR-19): lo que capturó el asistente también queda como nota privada en Chatwoot; aquí no se decía. */}
        {d.conversaciones.length > 0 ? <p className="muted" data-prueba="aviso-resumen-del-asistente">Lo que el asistente capturó (nombre, edad, sucursal y de dónde llegó) está aquí y también como nota privada al inicio de la conversación en Chatwoot.</p> : null}
        <dl className="datos">
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
      </Tarjeta>

      {moduloEncendido("cotizador") ? <Cotizaciones lead={d} puedeEscribir={escribir} cotizarA={cotizandoA} alCambiarFormulario={setCotizando} /> : null}
      {moduloEncendido("clase_muestra") ? <ClasesMuestraDeLead lead={d} puedeEscribir={puede("clases_muestra:escribir")} alCambiar={recargar} /> : null}

      {tareas.datos && tareas.datos.datos.length > 0 ? (
        <Tarjeta titulo={`Tareas pendientes (${tareas.datos.paginacion.total})`}>
          <ul className="lista-tarjetas">
            {tareas.datos.datos.map((t) => (
              <TarjetaDeTarea key={t.id} tarea={t} alCambiar={tareas.recargar} conEnlaceAlLead={false} />
            ))}
          </ul>
        </Tarjeta>
      ) : null}

      <Tarjeta titulo="Historial de etapas">
        {historial.error ? <ErrorDeCarga error={historial.error} alReintentar={historial.recargar} /> : null}
        {historial.datos && historial.datos.cambios.length === 0 ? <Vacio icono="lista" titulo="Todavía no hay cambios de etapa registrados">El primer cambio aparecerá aquí cuando muevas al lead de etapa.</Vacio> : null}
        {historial.datos && historial.datos.cambios.length > 0 ? (
          <ol className="lista-historial historial-linea" data-prueba="historial">
            {historial.datos.cambios.map((c) => (
              <li key={c.id} data-prueba={c.a_mano ? "cambio-a-mano" : undefined}>
                <strong>
                  {c.desde ? (c.desde.nombre ?? "—") : "Alta"} → {c.hacia.nombre ?? "—"}
                </strong>
                {c.a_mano ? (
                  <>
                    {" "}
                    <Insignia tono="info">Inscrito a mano</Insignia>
                  </>
                ) : null}
                <span className="muted">
                  {" "}
                  · {formatearInstante(c.creado_en)} · {c.origen === "sistema" ? "automático" : (c.usuario?.nombre ?? "persona")} · {textoDeMotivo(c.motivo)}
                </span>
                {c.a_mano ? <div>Inscrito a mano por {c.usuario?.nombre ?? "una persona"} el {formatearInstante(c.creado_en)}</div> : null}
                {c.motivo_perdida ? <div>Motivo de pérdida: {c.motivo_perdida.nombre}</div> : null}
                {c.nota ? <div className="muted">Nota: {c.nota}</div> : null}
              </li>
            ))}
            {historial.datos.inscripciones.map((i, n) => (
              <li key={`inscripcion-${n}`} data-prueba="inscripcion-real">
                <strong>Inscripción registrada en el sistema</strong>
                <span className="muted"> · {formatearFecha(i.fecha)}</span>
                {historial.datos?.cambios.some((c) => c.a_mano) ? <div className="muted">La familia ya estaba marcada como inscrita a mano; desde ahora cuenta por esta inscripción.</div> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </Tarjeta>

      <MarcarInscrito lead={marcando ? { id: d.id, nombre, etapa_id: d.etapa.id } : null} etapas={etapas.datos ?? []} abierto={marcando} alCerrar={() => setMarcando(false)} alMarcar={recargar} />
      <MoverEtapa lead={moviendo ? { id: d.id, nombre, etapa_id: d.etapa.id } : null} etapas={etapas.datos ?? []} motivos={motivos.datos ?? []} abierto={moviendo} alCerrar={() => setMoviendo(false)} alMover={recargar} />
    </Marco>
  );
}
