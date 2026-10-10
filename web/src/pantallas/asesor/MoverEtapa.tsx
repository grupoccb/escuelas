// Mover un lead de etapa (con historial). Las reglas son las del servidor (docs/API.md, D7): pasar a «perdido» EXIGE el motivo; recuperar (de perdido a una etapa
// abierta) EXIGE una nota; a «inscrito» no se llega moviendo (se inscribe); un lead que ya cambió de etapa responde 409 y se recarga. La interfaz solo lo anticipa.

import { useState } from "react";
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

export function MoverEtapa({ lead, etapas, motivos, abierto, alCerrar, alMover }: { lead: LeadParaMover | null; etapas: Etapa[]; motivos: MotivoPerdida[]; abierto: boolean; alCerrar: () => void; alMover: () => void }) {
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  const accion = useAccion();
  // V1/V7: a la etapa de inscrito se llega inscribiendo; con la inscripción apagada nadie puede hacerlo, y el texto lo dice en vez de prometer un camino que no existe.
  const { moduloEncendido } = useSesion();
  const sePuedeInscribir = moduloEncendido("inscripcion");
  const actual = etapas.find((e) => e.id === lead?.etapa_id);
  const objetivo = etapas.find((e) => e.id === destino);
  const pierde = objetivo?.es_perdido === true || objetivo?.tipo_sistema === "perdido";
  const recupera = (actual?.es_perdido === true || actual?.tipo_sistema === "perdido") && objetivo !== undefined && !pierde;
  const falta = !objetivo ? "Elige la etapa" : pierde && !motivo ? "Elige el motivo de pérdida" : recupera && nota.trim() === "" ? "Escribe una nota: por qué se recupera" : null;

  const cerrar = () => {
    const huboConflicto = accion.error?.esConflicto === true;
    setDestino("");
    setMotivo("");
    setNota("");
    accion.limpiar();
    alCerrar();
    if (huboConflicto) alMover();
  };

  return (
    <Dialogo abierto={abierto && lead !== null} titulo={`Mover a ${lead?.nombre ?? "lead"}`} alCerrar={cerrar}>
      <p className="muted">Ahora está en: <strong>{actual?.nombre ?? "—"}</strong></p>
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          if (!lead || falta) return;
          void accion.ejecutar(async () => {
            await api.patch(`/api/leads/${lead.id}/etapa`, { etapa_id: destino, desde_etapa_id: lead.etapa_id, ...(pierde ? { motivo_perdida_id: motivo } : {}), ...(nota.trim() ? { nota: nota.trim() } : {}) });
            cerrar();
            alMover();
          });
        }}
      >
        <CampoSelect
          etiqueta="Nueva etapa"
          vacio="Elige…"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          opciones={etapas.filter((e) => e.id !== lead?.etapa_id).map((e) => ({ valor: e.id, texto: esDeInscripcion(e) ? `${e.nombre} (${sePuedeInscribir ? "se llega inscribiendo" : "todavía no está activada la inscripción"})` : e.nombre, deshabilitada: esDeInscripcion(e) }))}
          requerido
        />
        {pierde ? <CampoSelect etiqueta="Motivo de pérdida" vacio="Elige…" value={motivo} onChange={(e) => setMotivo(e.target.value)} opciones={motivos.map((m) => ({ valor: m.id, texto: m.nombre }))} requerido /> : null}
        {recupera ? <Aviso tono="info">Estás recuperando un lead que se había perdido: la nota es obligatoria.</Aviso> : null}
        <CampoArea etiqueta={recupera ? "Nota (obligatoria)" : "Nota (opcional)"} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} requerido={recupera} />
        {accion.error?.esConflicto ? <Aviso tono="alerta">El lead cambió mientras lo veías. Cierra esta ventana: la lista se actualiza.</Aviso> : null}
        <ErrorDeAccion error={accion.error} />
        <div className="formulario-acciones">
          <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={falta !== null}>
            Mover
          </Boton>
          <Boton onClick={cerrar}>Cancelar</Boton>
        </div>
        {falta ? <p className="muted">{falta}.</p> : null}
      </form>
    </Dialogo>
  );
}
