// El embudo de leads (asesor): tablero por etapa y lista, filtros por sucursal y fuente, alertas de estancados y mover de etapa con historial.

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, armarConsulta, traerTodo } from "../../api/cliente.ts";
import type { Etapa, LeadResumen, MotivoPerdida } from "../../api/tipos.ts";
import { diasDesde } from "../../lib/fechas.ts";
import { useSesion, useYo } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect } from "../../ui/campos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Pestanas, propsDePanel } from "../../ui/Pestanas.tsx";
import { AvisoDePrimerosPasos } from "../admin/AvisoDePrimerosPasos.tsx";
import { sePuedeMarcarComoInscrito } from "./inscrito-a-mano.ts";
import { MarcarInscrito } from "./MarcarInscrito.tsx";
import { MoverEtapa, type LeadParaMover } from "./MoverEtapa.tsx";

interface Estancado {
  id: string;
  dias_sin_movimiento: number;
}

export const FUENTES: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  referido: "Referido",
  presencial: "En sucursal (QR)",
  otro: "Otra campaña",
  landing: "Página de captación",
  codigo: "Código de rastreo",
  anuncio: "Anuncio",
  directo: "Directo",
};

function TarjetaDeLead({ lead, estancado, sucursal, alMover, alMarcar }: { lead: LeadResumen; estancado: Estancado | undefined; sucursal: string; alMover: (l: LeadParaMover) => void; alMarcar: ((l: LeadParaMover) => void) | null }) {
  const nombre = lead.nombre_contacto ?? "Sin nombre";
  return (
    <li className="ficha-lead" data-prueba={`lead-${lead.id}`}>
      <Link className="titulo" to={`/leads/${lead.id}`}>
        {nombre}
      </Link>
      <span className="muted">{lead.telefono ?? "Sin teléfono"}</span>
      <span className="fila">
        <Insignia>{FUENTES[lead.fuente] ?? lead.fuente}</Insignia>
        {sucursal ? <Insignia>{sucursal}</Insignia> : <Insignia tono="alerta">Sin sucursal</Insignia>}
        {estancado ? <Insignia tono="alerta">Sin movimiento {estancado.dias_sin_movimiento} d</Insignia> : null}
        {lead.recuperaciones > 0 ? <Insignia tono="info">Recuperado {lead.recuperaciones}×</Insignia> : null}
      </span>
      <div className="fila">
        <Boton onClick={() => alMover({ id: lead.id, nombre, etapa_id: lead.etapa_id })}>Mover de etapa</Boton>
        {alMarcar ? <Boton onClick={() => alMarcar({ id: lead.id, nombre, etapa_id: lead.etapa_id })} data-prueba={`marcar-inscrito-${lead.id}`}>Marcar como inscrito</Boton> : null}
      </div>
    </li>
  );
}

export default function Embudo() {
  useTitulo("Embudo");
  const yo = useYo();
  const { sucursalId, puede, moduloEncendido } = useSesion();
  const [vista, setVista] = useState<"tablero" | "lista">("tablero");
  const [fuente, setFuente] = useState("");
  const [soloEstancados, setSoloEstancados] = useState(false);
  const [moviendo, setMoviendo] = useState<LeadParaMover | null>(null);
  const [marcando, setMarcando] = useState<LeadParaMover | null>(null);

  const etapas = useCarga((senal) => api.get<{ datos: Etapa[] }>("/api/etapas", undefined, senal).then((r) => r.datos), []);
  const motivos = useCarga((senal) => api.get<{ datos: MotivoPerdida[] }>("/api/motivos-perdida", { activo: true }, senal).then((r) => r.datos), []);
  const leads = useCarga(() => traerTodo<LeadResumen>("/api/leads", { sucursal_id: sucursalId ?? undefined }, 500), [sucursalId]);
  const estancados = useCarga(() => traerTodo<Estancado>("/api/leads/estancados", { sucursal_id: sucursalId ?? undefined }, 500).then((r) => new Map(r.datos.map((e) => [e.id, e]))), [sucursalId]);

  const error = etapas.error ?? leads.error;
  const nombreDeSucursal = (id: string | null): string => yo.sucursales.find((s) => s.id === id)?.nombre ?? "";
  const todos = leads.datos?.datos ?? [];
  const fuentes = [...new Set(todos.map((l) => l.fuente))].sort();
  const visibles = todos.filter((l) => (!fuente || l.fuente === fuente) && (!soloEstancados || estancados.datos?.has(l.id)));
  const lista = etapas.datos ?? [];
  const cuantosEstancados = todos.filter((l) => estancados.datos?.has(l.id)).length;
  // V10b: con la inscripción apagada, «Marcar como inscrito» en cada lead que sigue abierto (la regla es del servidor).
  const puedeMarcar = (l: LeadResumen): boolean => sePuedeMarcarComoInscrito({ inscripcionEncendida: moduloEncendido("inscripcion"), puedeEscribir: puede("leads:escribir"), etapaActual: lista.find((e) => e.id === l.etapa_id) });
  const recargar = () => {
    leads.recargar();
    estancados.recargar();
  };

  return (
    <Pagina
      titulo="Embudo"
      subtitulo={leads.datos ? `${visibles.length} de ${leads.datos.total} leads` : undefined}
      acciones={
        // V7: la lista de leads para Excel (la misma que ve esta persona: respeta su sucursal y su alcance en el servidor).
        <a className="boton" href={`/api/exportaciones/leads${armarConsulta({ sucursal_id: sucursalId ?? undefined })}`} download data-prueba="descargar-leads">
          Descargar lista (CSV para Excel)
        </a>
      }
    >
      <AvisoDePrimerosPasos />
      {error ? <ErrorDeCarga error={error} alReintentar={() => { etapas.recargar(); leads.recargar(); }} /> : null}
      {cuantosEstancados > 0 && !soloEstancados ? (
        <Aviso tono="alerta" titulo={cuantosEstancados === 1 ? "1 lead lleva días sin movimiento" : `${cuantosEstancados} leads llevan días sin movimiento`}>
          <Boton onClick={() => setSoloEstancados(true)}>Ver solo los estancados</Boton>
        </Aviso>
      ) : null}
      <div className="rejilla rejilla-3">
        <CampoSelect etiqueta="Fuente" vacio="Todas las fuentes" value={fuente} onChange={(e) => setFuente(e.target.value)} opciones={fuentes.map((f) => ({ valor: f, texto: FUENTES[f] ?? f }))} />
        <CampoCasilla etiqueta="Solo estancados" checked={soloEstancados} onChange={(e) => setSoloEstancados(e.target.checked)} />
        <Pestanas nombre="embudo" etiqueta="Vista del embudo" pestanas={[{ id: "tablero", texto: "Tablero" }, { id: "lista", texto: "Lista" }] as const} activa={vista} alCambiar={setVista} />
      </div>
      {leads.datos?.truncado ? <Aviso tono="info">Se muestran los primeros {todos.length} de {leads.datos.total} leads. Filtra por sucursal para ver el resto.</Aviso> : null}
      {(leads.cargando && !leads.datos) || (etapas.cargando && !etapas.datos) ? <Cargando texto="Cargando el embudo…" /> : null}
      {leads.datos && lista.length > 0 && visibles.length === 0 ? <Vacio titulo="No hay leads con estos filtros" /> : null}
      <div {...propsDePanel("embudo", vista)}>
      {leads.datos && vista === "tablero" ? (
        <div className="tablero">
          {lista.map((e) => {
            const enEtapa = visibles.filter((l) => l.etapa_id === e.id);
            return (
              <section key={e.id} className="columna" aria-label={e.nombre} data-prueba={`columna-${e.id}`}>
                <h2>
                  <span>{e.nombre}</span>
                  <Insignia>{enEtapa.length}</Insignia>
                </h2>
                <ul className="lista-tarjetas">
                  {enEtapa.map((l) => (
                    <TarjetaDeLead key={l.id} lead={l} estancado={estancados.datos?.get(l.id)} sucursal={nombreDeSucursal(l.sucursal_interes_id)} alMover={setMoviendo} alMarcar={puedeMarcar(l) ? setMarcando : null} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
      {leads.datos && vista === "lista" ? (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Etapa</th>
                <th>Fuente</th>
                <th>Sucursal</th>
                <th>Último movimiento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => (
                <tr key={l.id} data-prueba={`lead-${l.id}`}>
                  <td>
                    <Link to={`/leads/${l.id}`}>{l.nombre_contacto ?? "Sin nombre"}</Link>
                  </td>
                  <td>{l.telefono ?? "—"}</td>
                  <td>{lista.find((e) => e.id === l.etapa_id)?.nombre ?? "—"}</td>
                  <td>{FUENTES[l.fuente] ?? l.fuente}</td>
                  <td>{nombreDeSucursal(l.sucursal_interes_id) || "—"}</td>
                  <td>
                    {l.ultima_interaccion_en ? `hace ${diasDesde(l.ultima_interaccion_en)} d` : "—"} {estancados.datos?.has(l.id) ? <Insignia tono="alerta">Estancado</Insignia> : null}
                  </td>
                  <td>
                    <span className="fila">
                      <Boton onClick={() => setMoviendo({ id: l.id, nombre: l.nombre_contacto ?? "Sin nombre", etapa_id: l.etapa_id })}>Mover</Boton>
                      {puedeMarcar(l) ? <Boton onClick={() => setMarcando({ id: l.id, nombre: l.nombre_contacto ?? "Sin nombre", etapa_id: l.etapa_id })} data-prueba={`marcar-inscrito-${l.id}`}>Marcar como inscrito</Boton> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      </div>
      <MarcarInscrito lead={marcando} etapas={lista} abierto={marcando !== null} alCerrar={() => setMarcando(null)} alMarcar={recargar} />
      <MoverEtapa lead={moviendo} etapas={lista} motivos={motivos.datos ?? []} abierto={moviendo !== null} alCerrar={() => setMoviendo(null)} alMover={recargar} />
    </Pagina>
  );
}
