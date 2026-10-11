// «Agendar la clase muestra de …» desde el embudo (R2b): elegir el día y la hora entre las sesiones con lugar de un grupo (los lugares los calcula el servidor) y agendar; si el lead ya tiene una
// clase agendada (`reprogramar`), la misma pantalla la cambia. Usa las mismas llamadas que la ficha del lead (`clase-muestra-datos.ts`, `POST /api/clases-muestra` y `…/:id/reprogramar`):
// el cupo y las demás reglas son del servidor y su rechazo se dice dentro del diálogo.

import { useState } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { ClaseMuestra, LeadDetalle } from "../../api/tipos.ts";
import { textoDeLugares } from "../../lib/etiquetas.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga } from "../../ui/basicos.tsx";
import { CampoSelect } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import { guardarClase, useOfertaDeSesiones } from "./clase-muestra-datos.ts";

/** Lo que el embudo necesita saber de una clase recién agendada para decirlo en el aviso «ya quedó». */
export interface ClaseAgendada {
  alumno: string;
  sesion: string;
  reprogramada: boolean;
}

/** El formulario, con el lead y su clase ya cargados (se monta al abrir: cada vez empieza limpio). */
function FormularioDeAgenda({ lead, clase, alCerrar, alAgendar }: { lead: LeadDetalle; clase: ClaseMuestra | null; alCerrar: () => void; alAgendar: (c: ClaseAgendada) => void }) {
  const reprograma = clase !== null;
  const [prospectoId, setProspectoId] = useState("");
  const [grupoElegido, setGrupoElegido] = useState("");
  const [fechaHora, setFechaHora] = useState("");
  const accion = useAccion();
  const { aspirantes, grupos, delLead, grupoId, sesiones, prospecto } = useOfertaDeSesiones({ lead, clase, abierto: true, prospectoId, grupoElegido });
  const sesionElegida = sesiones.datos?.find((s) => s.fecha_hora === fechaHora);
  const alumno = clase?.prospecto ?? aspirantes.find((p) => p.id === prospecto)?.nombre ?? lead.nombre_contacto ?? "el alumno";
  const falta = fechaHora === "" ? "Elige el día y la hora." : null;
  const grupoActual = delLead.find((g) => g.id === grupoId);

  return (
    <form
      noValidate
      className="formulario"
      data-prueba="dialogo-agendar"
      onSubmit={(e) => {
        e.preventDefault();
        if (falta || grupoId === "" || prospecto === "") return;
        void accion.ejecutar(async () => {
          await guardarClase({ clase, prospecto, grupoId, fechaHora, notas: "" });
          alAgendar({ alumno, sesion: sesionElegida?.completa ?? fechaHora, reprogramada: reprograma });
        });
      }}
    >
      {!reprograma && aspirantes.length > 1 ? <CampoSelect etiqueta="Alumno" value={prospecto} onChange={(e) => setProspectoId(e.target.value)} opciones={aspirantes.map((p) => ({ valor: p.id, texto: p.nombre ?? "Sin nombre" }))} /> : null}
      {grupos.error ? <ErrorDeCarga error={grupos.error} alReintentar={grupos.recargar} /> : null}
      {grupos.cargando && !grupos.datos ? <Cargando texto="Buscando los grupos…" /> : null}
      {grupos.datos && delLead.length === 0 ? <Aviso tono="alerta">No hay grupos activos de la disciplina que busca la familia{lead.sucursal ? " en esta sucursal" : ""}. Revisa con quien administra el catálogo.</Aviso> : null}
      {delLead.length > 1 ? (
        <CampoSelect etiqueta="Grupo" value={grupoId} onChange={(e) => { setGrupoElegido(e.target.value); setFechaHora(""); }} opciones={delLead.map((g) => ({ valor: g.id, texto: `${g.nombre} · ${g.programa.nombre}` }))} />
      ) : null}
      {sesiones.cargando ? <Cargando texto="Buscando sesiones con lugar…" /> : null}
      {sesiones.error ? <ErrorDeCarga error={sesiones.error} alReintentar={sesiones.recargar} /> : null}
      {sesiones.datos && sesiones.datos.length === 0 ? <Aviso tono="alerta">Este grupo no tiene sesiones con lugar en los próximos días.</Aviso> : null}
      {sesiones.datos && sesiones.datos.length > 0 ? (
        <fieldset className="grupo-opciones">
          <legend>Elige día y hora</legend>
          <div className="opciones-sesion">
            {sesiones.datos.map((s, i) => (
              <button key={s.fecha_hora} type="button" className="opcion-sesion" aria-pressed={fechaHora === s.fecha_hora} onClick={() => setFechaHora(s.fecha_hora)}>
                <span className="opcion-sesion-texto">
                  <span className="opcion-sesion-dia">{s.completa}</span>
                  <span className="muted">{grupoActual ? `${grupoActual.nombre} · ${grupoActual.programa.nombre}` : ""}</span>
                </span>
                <span className="opcion-sesion-cupo">
                  <span>{textoDeLugares(s.lugares)}</span>
                  {i === 0 ? <span className="etiqueta-recomendada">El más próximo</span> : null}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <p className="muted">El maestro ve la clase en su pantalla «Hoy» y la familia recibe los recordatorios por WhatsApp.</p>
      <ErrorDeAccion error={accion.error} />
      {falta && sesiones.datos && sesiones.datos.length > 0 ? <p className="campo-ayuda" data-prueba="falta-del-dialogo">{falta}</p> : null}
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={falta !== null || grupoId === "" || prospecto === ""}>
          {reprograma ? "Reprogramar y avisar" : "Agendar y avisar"}
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

/** El diálogo: carga al lead (y, si se cambia la clase, su clase agendada) al abrir y arma el título con el nombre del niño. */
export function DialogoAgendar({ leadId, reprogramar, abierto, alCerrar, alAgendar }: { leadId: string | null; reprogramar: boolean; abierto: boolean; alCerrar: () => void; alAgendar: (c: ClaseAgendada) => void }) {
  const activo = abierto && leadId !== null;
  const lead = useCarga((senal) => api.get<LeadDetalle>(`/api/leads/${leadId ?? ""}`, undefined, senal), [leadId], activo);
  const clases = useCarga((senal) => api.get<Pagina<ClaseMuestra>>("/api/clases-muestra", { lead_id: leadId ?? "", estatus: "agendada", limite: 50 }, senal), [leadId], activo && reprogramar);
  // Lo cargado de una apertura anterior (el mismo lead) no vale: hasta que llegue lo nuevo se espera.
  const d = lead.cargando ? null : lead.datos;
  const clase = reprogramar ? ([...((clases.cargando ? null : clases.datos)?.datos ?? [])].sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null) : null;
  const nino = clase?.prospecto ?? d?.prospectos.find((p) => p.alumno_id === null)?.nombre ?? d?.nombre_contacto ?? "";
  const listo = d !== null && (!reprogramar || (clases.datos !== null && !clases.cargando));
  const titulo = `${reprogramar ? "Cambiar" : "Agendar"} la clase muestra${nino ? ` de ${nino}` : ""}`;
  const error = lead.error ?? clases.error;

  return (
    <Dialogo abierto={activo} titulo={titulo} alCerrar={alCerrar}>
      {d ? <p className="muted etapa-actual-dialogo">{[d.nombre_contacto, d.vertical.nombre, d.sucursal?.nombre].filter(Boolean).join(" · ")}</p> : null}
      {error ? <ErrorDeCarga error={error} alReintentar={() => { lead.recargar(); clases.recargar(); }} /> : null}
      {!error && !listo ? <Cargando texto="Juntando los datos del lead…" /> : null}
      {d && listo && reprogramar && clase === null ? <Aviso tono="alerta">Este lead ya no tiene una clase agendada que cambiar. Cierra esta ventana: la pantalla se actualiza.</Aviso> : null}
      {d && listo && (!reprogramar || clase !== null) ? <FormularioDeAgenda key={clase?.id ?? "nueva"} lead={d} clase={clase} alCerrar={alCerrar} alAgendar={alAgendar} /> : null}
    </Dialogo>
  );
}
