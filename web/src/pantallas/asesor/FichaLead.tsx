// La ficha de un lead (asesor): el adulto que escribió, sus alumnos potenciales, de dónde vino, lo que se le cotizó, su clase muestra, el historial de etapas, sus
// tareas y el enlace a su conversación en Chatwoot. Desde aquí se mueve de etapa, se cotiza, se agenda y se inicia la inscripción.

import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Etapa, LeadDetalle, MotivoPerdida, Tarea } from "../../api/tipos.ts";
import { urlDeConversacion } from "../../lib/chatwoot.ts";
import { formatearInstante } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, EnlaceBoton, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { ClasesMuestraDeLead } from "./ClasesMuestraDeLead.tsx";
import { Cotizaciones } from "./Cotizaciones.tsx";
import { FUENTES } from "./Embudo.tsx";
import { MoverEtapa } from "./MoverEtapa.tsx";
import { Ninos } from "./Ninos.tsx";
import { TarjetaDeTarea } from "./Tareas.tsx";

interface Historial {
  etapa_actual: string;
  cambios: { id: string; desde: { id: string; nombre: string | null } | null; hacia: { id: string; nombre: string | null }; origen: string; usuario: { id: string; nombre: string } | null; motivo: string; motivo_perdida: { id: string; nombre: string } | null; nota: string | null; es_recuperacion: boolean; creado_en: string }[];
}

/** Las claves de la atribución que se pueden mostrar (el resto del referral del proveedor no es para la pantalla). */
const CLAVES_DE_ATRIBUCION: Record<string, string> = { fuente: "Fuente", utm_source: "utm_source", utm_medium: "utm_medium", utm_campaign: "utm_campaign", utm_content: "utm_content", utm_term: "utm_term", codigo_rastreo: "Código de rastreo" };

function EnlaceAChatwoot({ lead }: { lead: LeadDetalle }) {
  const { yo } = useSesion();
  const base = yo?.configuracion.chatwoot_url_publica ?? null;
  const conversaciones = lead.conversaciones;
  if (conversaciones.length === 0) return <span className="muted">Sin conversación de WhatsApp todavía.</span>;
  const enlaces = conversaciones.map((c) => ({ c, url: urlDeConversacion(base, c.chatwoot) }));
  if (enlaces.every((e) => e.url === null)) return <Aviso tono="alerta">No se puede armar el enlace a Chatwoot: falta configurar su URL pública (CHATWOOT_URL_PUBLICA).</Aviso>;
  return (
    <>
      {enlaces.map(({ c, url }) =>
        url ? (
          <a key={c.id} className="boton" href={url} target="_blank" rel="noopener noreferrer" data-prueba="enlace-chatwoot">
            <Icono nombre="chatwoot" /> Abrir conversación en Chatwoot{enlaces.length > 1 ? ` (#${c.chatwoot.conversacion_id})` : ""}
          </a>
        ) : null,
      )}
    </>
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
  // V3: el niño al que se le abre el formulario de cotizar (desde su fila en «Niños»).
  const [cotizandoA, setCotizandoA] = useState<{ id: string; vez: number } | null>(null);
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
  const atribucion = Object.entries(d.atribucion ?? {}).filter(([k, v]) => k in CLAVES_DE_ATRIBUCION && typeof v === "string");

  return (
    <Marco
      titulo={nombre}
      subtitulo={<Link to="/embudo">← Volver al embudo</Link>}
      acciones={
        <>
          <EnlaceAChatwoot lead={d} />
          {puede("conversion:ejecutar") && escribir && (!inscrito || hayPorInscribir) ? (
            <EnlaceBoton to={`/leads/${d.id}/convertir`} variante="primario">
              {d.prospectos.filter((p) => p.alumno_id === null).length > 1 ? "Inscribir a los niños" : "Convertir e inscribir"}
            </EnlaceBoton>
          ) : null}
        </>
      }
    >
      <Tarjeta titulo="Contacto" acciones={escribir ? <Boton onClick={() => setMoviendo(true)}>Mover de etapa</Boton> : undefined}>
        <dl className="datos">
          <dt>Etapa</dt>
          <dd data-prueba="etapa-actual">
            <Insignia tono={d.etapa.es_perdido ? "peligro" : inscrito ? "exito" : "info"}>{d.etapa.nombre}</Insignia>
            {d.motivo_perdida ? ` · Motivo: ${d.motivo_perdida.nombre}` : ""}
            {d.recuperaciones > 0 ? ` · Recuperado ${d.recuperaciones} vez/veces` : ""}
          </dd>
          <dt>Teléfono</dt>
          <dd>{d.telefono ?? "—"}</dd>
          <dt>Sucursal</dt>
          <dd>{d.sucursal?.nombre ?? "Sin elegir"}</dd>
          <dt>Interés</dt>
          <dd>{d.vertical.nombre}</dd>
          <dt>Llegó</dt>
          <dd>{formatearInstante(d.creado_en)}</dd>
          <dt>Último movimiento</dt>
          <dd>{formatearInstante(d.ultima_interaccion_en)}</dd>
        </dl>
      </Tarjeta>

      <Ninos key={d.id} lead={d} puedeEscribir={escribir} cotizadorEncendido={moduloEncendido("cotizador")} alCambiar={recargar} alCotizar={(id) => setCotizandoA({ id, vez: Date.now() })} />

      <Tarjeta titulo="De dónde llegó">
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

      {moduloEncendido("cotizador") ? <Cotizaciones lead={d} puedeEscribir={escribir} cotizarA={cotizandoA} /> : null}
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
        {historial.datos && historial.datos.cambios.length === 0 ? <Vacio titulo="Todavía no hay cambios de etapa registrados" /> : null}
        {historial.datos && historial.datos.cambios.length > 0 ? (
          <ol className="lista-historial" data-prueba="historial">
            {historial.datos.cambios.map((c) => (
              <li key={c.id}>
                <strong>
                  {c.desde ? (c.desde.nombre ?? "—") : "Alta"} → {c.hacia.nombre ?? "—"}
                </strong>
                <span className="muted">
                  {" "}
                  · {formatearInstante(c.creado_en)} · {c.origen === "sistema" ? "automático" : (c.usuario?.nombre ?? "persona")} · {c.motivo.replace(/_/g, " ")}
                </span>
                {c.motivo_perdida ? <div>Motivo de pérdida: {c.motivo_perdida.nombre}</div> : null}
                {c.nota ? <div className="muted">Nota: {c.nota}</div> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </Tarjeta>

      <MoverEtapa lead={moviendo ? { id: d.id, nombre, etapa_id: d.etapa.id } : null} etapas={etapas.datos ?? []} motivos={motivos.datos ?? []} abierto={moviendo} alCerrar={() => setMoviendo(false)} alMover={recargar} />
    </Marco>
  );
}
