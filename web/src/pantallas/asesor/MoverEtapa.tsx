// Mover un lead de etapa (con historial). Las reglas son las del servidor (docs/API.md, D7): pasar a «perdido» EXIGE el motivo; recuperar (de perdido a una etapa
// abierta) EXIGE una nota; a «inscrito» no se llega moviendo (se inscribe; con la inscripción apagada, «Marcar como inscrito», V10b); un lead que ya cambió de etapa responde 409 y se recarga. La interfaz solo lo anticipa.

import { useRef, useState } from "react";
import { api } from "../../api/cliente.ts";
import type { Etapa, MotivoPerdida } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, ErrorDeAccion } from "../../ui/basicos.tsx";
import { CampoArea, CampoSelect } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion } from "../../ui/hooks.ts";

export interface LeadParaMover {
  id: string;
  nombre: string;
  etapa_id: string;
}

const esDeInscripcion = (e: Etapa): boolean => e.es_ganado || e.tipo_sistema === "inscrito";

/** Lo que cuenta `alMover` cuando de verdad se movió algo (el embudo lo usa para el aviso «ya quedó»); sin él, solo hay que recargar (un 409). */
export interface ResultadoDeMover {
  destinoId: string;
  cantidad: number;
}

/**
 * R2a: además de UN lead (`lead`), el embudo puede pedir mover VARIOS a la vez (`varios`, la selección en lote o lo que se suelta en una columna) y abrir el diálogo con la etapa ya
 * elegida (`destinoInicial`, p. ej. la de perdidos al soltar sobre ella). Con varios son N llamadas a `PATCH /api/leads/:id/etapa`, una por lead, cada una con su `desde_etapa_id`.
 * R2b: al soltar, en «Mover a…» y en la ficha lateral, perder y recuperar los hacen `DialogosDeCierre.tsx` (botones de motivo, nota obligatoria). Este selector queda para el botón «Mover de etapa» de la tarjeta y de la fila con ratón y para la ficha completa (`FichaLead`).
 */
export function MoverEtapa({ lead, varios, destinoInicial, etapas, motivos, abierto, alCerrar, alMover }: { lead: LeadParaMover | null; varios?: readonly LeadParaMover[]; destinoInicial?: string; etapas: Etapa[]; motivos: MotivoPerdida[]; abierto: boolean; alCerrar: () => void; alMover: (resultado?: ResultadoDeMover) => void }) {
  const [destino, setDestino] = useState(destinoInicial ?? "");
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  // Si fallan varios a medias, los que ya se movieron se quedan movidos: al cerrar se recarga para que el tablero lo diga.
  const huboCambios = useRef(false);
  const accion = useAccion();
  const objetivos: readonly LeadParaMover[] = varios && varios.length > 1 ? varios : lead ? [lead] : [];
  const enLote = objetivos.length > 1;
  // V1/V7: a la etapa de inscrito se llega inscribiendo; con la inscripción apagada se marca a mano con su propia acción (V10b), y el texto lo dice en vez de prometer un camino que no existe.
  const { moduloEncendido } = useSesion();
  const sePuedeInscribir = moduloEncendido("inscripcion");
  const actual = etapas.find((e) => e.id === lead?.etapa_id);
  const objetivo = etapas.find((e) => e.id === destino);
  const pierde = objetivo?.es_perdido === true || objetivo?.tipo_sistema === "perdido";
  const vienenDePerdido = objetivos.some((o) => {
    const e = etapas.find((x) => x.id === o.etapa_id);
    return e?.es_perdido === true || e?.tipo_sistema === "perdido";
  });
  const recupera = vienenDePerdido && objetivo !== undefined && !pierde;
  const falta = !objetivo ? "Elige la etapa" : pierde && !motivo ? "Elige el motivo de pérdida" : recupera && nota.trim() === "" ? "Escribe una nota: por qué se recupera" : null;

  const cerrar = () => {
    const huboConflicto = accion.error?.esConflicto === true;
    setDestino(destinoInicial ?? "");
    setMotivo("");
    setNota("");
    accion.limpiar();
    alCerrar();
    const recargarSolo = huboConflicto || huboCambios.current;
    huboCambios.current = false;
    if (recargarSolo) alMover();
  };

  return (
    <Dialogo abierto={abierto && objetivos.length > 0} titulo={enLote ? `Mover ${objetivos.length} leads` : `Mover a ${lead?.nombre ?? "lead"}`} alCerrar={cerrar}>
      {enLote ? <p className="muted etapa-actual-dialogo">Leads: <strong>{objetivos.map((o) => o.nombre).join(", ")}</strong></p> : <p className="muted etapa-actual-dialogo">Ahora está en: <strong>{actual?.nombre ?? "—"}</strong></p>}
      <form noValidate
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          if (objetivos.length === 0 || falta) return;
          void accion.ejecutar(async () => {
            let movidos = 0;
            for (const o of objetivos) {
              try {
                await api.patch(`/api/leads/${o.id}/etapa`, { etapa_id: destino, desde_etapa_id: o.etapa_id, ...(pierde ? { motivo_perdida_id: motivo } : {}), ...(nota.trim() ? { nota: nota.trim() } : {}) });
                movidos += 1;
              } catch (error) {
                if (movidos > 0) huboCambios.current = true;
                throw error;
              }
            }
            huboCambios.current = false;
            cerrar();
            alMover({ destinoId: destino, cantidad: movidos });
          });
        }}
      >
        <CampoSelect
          etiqueta="Nueva etapa"
          vacio="Elige…"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          opciones={etapas.filter((e) => e.id !== lead?.etapa_id).map((e) => ({ valor: e.id, texto: esDeInscripcion(e) ? `${e.nombre} (${sePuedeInscribir ? "se llega inscribiendo" : "usa «Marcar como inscrito»"})` : e.nombre, deshabilitada: esDeInscripcion(e) }))}
          requerido
        />
        {pierde ? <CampoSelect etiqueta="Motivo de pérdida" vacio="Elige…" value={motivo} onChange={(e) => setMotivo(e.target.value)} opciones={motivos.map((m) => ({ valor: m.id, texto: m.nombre }))} requerido /> : null}
        {recupera ? <Aviso tono="info">Estás recuperando un lead que se había perdido: la nota es obligatoria.</Aviso> : null}
        <CampoArea etiqueta={recupera ? "Nota (obligatoria)" : "Nota (opcional)"} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} requerido={recupera} />
        {accion.error?.esConflicto ? <Aviso tono="alerta">El lead cambió mientras lo veías. Cierra esta ventana: la lista se actualiza.</Aviso> : null}
        <ErrorDeAccion error={accion.error} />
        {falta ? <p className="campo-ayuda">{falta}.</p> : null}
        <div className="formulario-acciones">
          <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={falta !== null}>
            Mover
          </Boton>
          <Boton onClick={cerrar}>Cancelar</Boton>
        </div>
      </form>
    </Dialogo>
  );
}
