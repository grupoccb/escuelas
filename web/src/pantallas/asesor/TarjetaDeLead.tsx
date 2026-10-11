// La tarjeta de un lead en el embudo (R2a): la del tablero de escritorio y la de la lista de celular (misma anatomía, más grande en celular). Avatar con el tono de la disciplina que también
// SELECCIONA, nombre, días desde el último movimiento (o la insignia de alerta), etiqueta de disciplina, la línea propia de la etapa y el pie «Fuente · Sucursal» con los botones de ícono.
// Todo lo que la tarjeta muestra llega ya calculado (`DatosDeTarjeta`): aquí no se pide nada a la API.

import { Link } from "react-router-dom";
import type { PointerEvent as EventoDePuntero, KeyboardEvent as EventoDeTeclado, MouseEvent as EventoDeRaton } from "react";
import { Insignia } from "../../ui/basicos.tsx";
import { EtiquetaDisciplina, iniciales, useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import type { NombreDeIcono } from "../../navegacion.ts";
import type { LeadParaMover } from "./MoverEtapa.tsx";

export type TonoDeDetalle = "neutro" | "primario" | "exito" | "peligro";

/** La línea propia de la etapa: la fecha de la clase, «Asistió el…», «Motivo: …». */
export interface DetalleDeEtapa {
  texto: string;
  tono: TonoDeDetalle;
  icono: NombreDeIcono;
  /** Lo que se lee antes del texto cuando el ícono no alcanza («Clase muestra: …»). */
  rotulo?: string;
}

/** Qué hace el segundo botón de la tarjeta según la etapa. */
export type TipoDeAccion = "marcar" | "inscribir" | "agendar" | "cambiar-clase";

export interface DatosDeTarjeta {
  id: string;
  nombre: string;
  telefono: string | null;
  etapaId: string;
  etapaNombre: string;
  recuperaciones: number;
  /** El color de su disciplina (hex) y el nombre; `null` si el lead no trae una que se conozca. */
  disciplina: { nombre: string; color: string | null } | null;
  /** «Matías, 4 años» cuando la API lo trae; si no, `null`. */
  nino: string | null;
  /** Días sin movimiento si está estancado; `null` si no. */
  estancadoDias: number | null;
  /** «Hoy» o «N d»; `null` en las etapas de cierre. */
  tiempo: string | null;
  detalle: DetalleDeEtapa | null;
  fuente: string;
  /** El nombre de la sucursal; vacío si el lead aún no tiene. */
  sucursal: string;
  accion: { tipo: TipoDeAccion; etiqueta: string } | null;
  /** ¿Se ofrece abrir su conversación en Chatwoot? */
  conChat: boolean;
}

export interface PropsDeTarjeta {
  datos: DatosDeTarjeta;
  seleccionada: boolean;
  /** Mientras viaja en un arrastre, la tarjeta de origen se atenúa. */
  arrastrada: boolean;
  /** Un lead ya inscrito no se arrastra ni se mueve desde el embudo (los cambios se hacen desde su expediente). */
  arrastrable: boolean;
  movil: boolean;
  /** En celular, el modo «Seleccionar»: tocar la tarjeta la selecciona en vez de abrirla. */
  modoSeleccion: boolean;
  alPresionar: (e: EventoDePuntero<HTMLElement>, id: string) => void;
  /** ¿El clic que llega es el que sigue a un arrastre? Entonces no se abre. */
  esClicDeArrastre: () => boolean;
  alSeleccionar: (id: string) => void;
  alAbrir: (id: string) => void;
  alChat: (id: string) => void;
  alAccion: (id: string, tipo: TipoDeAccion) => void;
  alMover: (lead: LeadParaMover) => void;
}

export const ICONO_DE_ACCION: Record<TipoDeAccion, NombreDeIcono> = { marcar: "reactivar", inscribir: "reactivar", agendar: "hoy", "cambiar-clase": "hoy" };

export function TarjetaDeLead(p: PropsDeTarjeta) {
  const { datos: d, movil } = p;
  const ref = useDisciplina<HTMLLIElement>(d.disciplina?.color ?? null);
  const tamanoIcono = movil ? 20 : 18;
  const lead: LeadParaMover = { id: d.id, nombre: d.nombre, etapa_id: d.etapaId };
  const clases = ["lead-tarjeta", "tarjeta-movil", movil ? "lead-tarjeta-movil" : "", p.seleccionada ? "lead-tarjeta-seleccionada" : "", p.arrastrada ? "lead-tarjeta-arrastrada" : "", p.arrastrable && !movil ? "" : "lead-tarjeta-fija"].filter(Boolean).join(" ");

  const alClic = (e: EventoDeRaton<HTMLLIElement>) => {
    if (p.esClicDeArrastre()) return;
    if ((e.target as Element).closest("a, button")) return;
    if (p.modoSeleccion) p.alSeleccionar(d.id);
    else p.alAbrir(d.id);
  };
  // Enter abre la tarjeta y Espacio la selecciona; solo cuando el foco está en la tarjeta misma (no en uno de sus botones).
  const alTeclear = (e: EventoDeTeclado<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      p.alAbrir(d.id);
    } else if (e.key === " ") {
      e.preventDefault();
      p.alSeleccionar(d.id);
    }
  };

  return (
    <li ref={ref} className={clases} data-prueba={`lead-${d.id}`} tabIndex={0} aria-label={[d.nombre, d.nino, d.etapaNombre].filter(Boolean).join(", ")} onPointerDown={(e) => p.alPresionar(e, d.id)} onClick={alClic} onKeyDown={alTeclear}>
      <div className="lead-tarjeta-cabeza">
        <button type="button" className={`avatar-disciplina lead-seleccion${movil ? " avatar-disciplina-grande" : ""}`} aria-pressed={p.seleccionada} aria-label={p.seleccionada ? `Quitar a ${d.nombre} de la selección` : `Seleccionar a ${d.nombre}`} title="Seleccionar" onClick={() => p.alSeleccionar(d.id)}>
          {p.seleccionada ? <Icono nombre="exito" tamano={movil ? 18 : 16} /> : iniciales(d.nombre)}
        </button>
        <div className="lead-tarjeta-cuerpo">
          <div className="lead-tarjeta-nombre">
            <Link className="titulo" id={`nombre-lead-${d.id}`} to={`/leads/${d.id}`}>
              {d.nombre}
            </Link>
            {d.estancadoDias !== null ? (
              <span className="lead-alerta-dias" title={`${d.estancadoDias} días sin movimiento`}>
                <Icono nombre="alerta" tamano={12} />
                <span aria-hidden="true">{d.estancadoDias} d</span>
                <span className="solo-lectores">Sin movimiento {d.estancadoDias} d</span>
              </span>
            ) : d.tiempo ? (
              <span className="lead-tiempo" title="Último movimiento">
                {d.tiempo}
              </span>
            ) : null}
          </div>
          <div className="lead-disciplina">
            {d.disciplina ? <EtiquetaDisciplina nombre={d.disciplina.nombre} color={d.disciplina.color} /> : null}
            {d.nino ? <span className="lead-nino">{d.nino}</span> : null}
            {d.recuperaciones > 0 ? <Insignia tono="info">Recuperado {d.recuperaciones}×</Insignia> : null}
          </div>
          {d.detalle ? (
            <div className="lead-detalle" data-tono={d.detalle.tono}>
              <Icono nombre={d.detalle.icono} tamano={15} />
              <span>
                {d.detalle.rotulo ? <span className="solo-lectores">{d.detalle.rotulo}: </span> : null}
                {d.detalle.texto}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="lead-pie">
        <span className="lead-meta">
          {d.fuente} · {d.sucursal ? d.sucursal : <span className="lead-meta-alerta">Sin sucursal</span>}
        </span>
        <span className="lead-botones">
          {d.conChat ? (
            <button type="button" className="boton-icono-tarjeta" aria-label={`Abrir la conversación con ${d.nombre}`} title="Abrir conversación" onClick={() => p.alChat(d.id)}>
              <Icono nombre="chatwoot" tamano={tamanoIcono} />
            </button>
          ) : null}
          {d.accion ? (
            <button type="button" className="boton-icono-tarjeta" aria-label={d.accion.etiqueta} title={d.accion.etiqueta} aria-describedby={`nombre-lead-${d.id}`} data-prueba={d.accion.tipo === "marcar" ? `marcar-inscrito-${d.id}` : undefined} onClick={() => p.alAccion(d.id, d.accion!.tipo)}>
              <Icono nombre={ICONO_DE_ACCION[d.accion.tipo]} tamano={tamanoIcono} />
            </button>
          ) : null}
          {p.arrastrable ? (
            <button type="button" className="boton-icono-tarjeta" aria-label="Mover de etapa" title="Mover de etapa" aria-describedby={`nombre-lead-${d.id}`} onClick={() => p.alMover(lead)}>
              <Icono nombre="siguiente" tamano={tamanoIcono} />
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
}
