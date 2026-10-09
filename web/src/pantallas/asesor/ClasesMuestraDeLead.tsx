// Clases muestra de un lead: ver, agendar, reprogramar y cancelar, con los lugares disponibles de cada sesión (los calcula el servidor).

import { useState } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { ClaseMuestra, Grupo, LeadDetalle } from "../../api/tipos.ts";
import { ESTATUS_DE_CLASE } from "../../lib/etiquetas.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoArea, CampoSelect, GrupoDeOpciones } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";

interface Sesion {
  fecha_hora: string;
  lugares: number;
  fecha: string;
  hora: string;
  completa: string;
}

function DialogoDeSesion({ lead, clase, abierto, alCerrar, alGuardar }: { lead: LeadDetalle; clase: ClaseMuestra | null; abierto: boolean; alCerrar: () => void; alGuardar: () => void }) {
  const reprograma = clase !== null;
  const aspirantes = lead.prospectos.filter((p) => p.alumno_id === null);
  const [prospectoId, setProspectoId] = useState("");
  const [grupoElegido, setGrupoElegido] = useState("");
  const [fechaHora, setFechaHora] = useState("");
  const [notas, setNotas] = useState("");
  const accion = useAccion();

  const grupos = useCarga((senal) => api.get<Pagina<Grupo>>("/api/grupos", { limite: 100, sucursal_id: lead.sucursal?.id }, senal), [lead.sucursal?.id], abierto);
  const delLead = (grupos.datos?.datos ?? []).filter((g) => g.activo && g.programa.vertical_id === lead.vertical.id);
  const grupoId = delLead.some((g) => g.id === grupoElegido) ? grupoElegido : (clase && delLead.some((g) => g.id === clase.grupo_id) ? clase.grupo_id : (delLead[0]?.id ?? ""));
  const sesiones = useCarga((senal) => api.get<{ datos: Sesion[] }>("/api/clases-muestra/sesiones", { grupo_id: grupoId, maximo: 8 }, senal).then((r) => r.datos), [grupoId], abierto && grupoId !== "");
  const prospecto = reprograma ? clase.prospecto_id : (prospectoId || aspirantes[0]?.id || "");

  const cerrar = () => {
    setFechaHora("");
    setNotas("");
    accion.limpiar();
    alCerrar();
  };

  return (
    <Dialogo abierto={abierto} titulo={reprograma ? "Reprogramar clase muestra" : "Agendar clase muestra"} alCerrar={cerrar}>
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          void accion.ejecutar(async () => {
            if (reprograma) await api.post(`/api/clases-muestra/${clase.id}/reprogramar`, { fecha_hora: fechaHora, grupo_id: grupoId, ...(notas.trim() ? { notas: notas.trim() } : {}) });
            else await api.post("/api/clases-muestra", { prospecto_id: prospecto, grupo_id: grupoId, fecha_hora: fechaHora, ...(notas.trim() ? { notas: notas.trim() } : {}) });
            cerrar();
            alGuardar();
          });
        }}
      >
        {!reprograma ? <CampoSelect etiqueta="Alumno" value={prospecto} onChange={(e) => setProspectoId(e.target.value)} opciones={aspirantes.map((p) => ({ valor: p.id, texto: p.nombre ?? "Sin nombre" }))} /> : <p>Alumno: <strong>{clase.prospecto}</strong></p>}
        {grupos.error ? <ErrorDeCarga error={grupos.error} alReintentar={grupos.recargar} /> : null}
        <CampoSelect etiqueta="Grupo" value={grupoId} onChange={(e) => { setGrupoElegido(e.target.value); setFechaHora(""); }} opciones={delLead.map((g) => ({ valor: g.id, texto: `${g.nombre} · ${g.programa.nombre}` }))} />
        {sesiones.cargando ? <Cargando texto="Buscando sesiones con lugar…" /> : null}
        {sesiones.error ? <ErrorDeCarga error={sesiones.error} alReintentar={sesiones.recargar} /> : null}
        {sesiones.datos && sesiones.datos.length === 0 ? <Aviso tono="alerta">Este grupo no tiene sesiones con lugar en los próximos días.</Aviso> : null}
        {sesiones.datos && sesiones.datos.length > 0 ? (
          <GrupoDeOpciones etiqueta="Sesión" valor={fechaHora} alCambiar={setFechaHora} opciones={sesiones.datos.map((s) => ({ valor: s.fecha_hora, texto: `${s.completa} · ${s.lugares} ${s.lugares === 1 ? "lugar" : "lugares"}` }))} />
        ) : null}
        <CampoArea etiqueta="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} ayuda="Sin datos de salud." maxLength={1000} />
        <ErrorDeAccion error={accion.error} />
        <div className="formulario-acciones">
          <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={fechaHora === "" || grupoId === "" || prospecto === ""}>
            {reprograma ? "Reprogramar" : "Agendar"}
          </Boton>
          <Boton onClick={cerrar}>Cancelar</Boton>
        </div>
      </form>
    </Dialogo>
  );
}

function DialogoDeCancelar({ clase, alCerrar, alCancelar }: { clase: ClaseMuestra | null; alCerrar: () => void; alCancelar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const accion = useAccion();
  const cerrar = () => {
    setMotivo("");
    accion.limpiar();
    alCerrar();
  };
  return (
    <Dialogo abierto={clase !== null} titulo="Cancelar clase muestra" alCerrar={cerrar}>
      <p>Se libera el lugar. Alumno: <strong>{clase?.prospecto}</strong></p>
      <CampoArea etiqueta="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} ayuda="Sin datos de salud." />
      <ErrorDeAccion error={accion.error} />
      <div className="formulario-acciones">
        <Boton
          variante="peligro"
          cargando={accion.ocupado}
          onClick={() =>
            void accion.ejecutar(async () => {
              await api.post(`/api/clases-muestra/${clase?.id ?? ""}/cancelar`, motivo.trim() ? { motivo: motivo.trim() } : {});
              cerrar();
              alCancelar();
            })
          }
        >
          Cancelar la clase
        </Boton>
        <Boton onClick={cerrar}>Conservarla</Boton>
      </div>
    </Dialogo>
  );
}

export function ClasesMuestraDeLead({ lead, puedeEscribir, alCambiar }: { lead: LeadDetalle; puedeEscribir: boolean; alCambiar?: () => void }) {
  const carga = useCarga((senal) => api.get<Pagina<ClaseMuestra>>("/api/clases-muestra", { lead_id: lead.id, limite: 50 }, senal), [lead.id]);
  // Agendar, reprogramar o cancelar mueve al lead de etapa en el servidor: se recarga también la ficha.
  const refrescar = () => {
    carga.recargar();
    alCambiar?.();
  };
  const [agendando, setAgendando] = useState(false);
  const [reprogramando, setReprogramando] = useState<ClaseMuestra | null>(null);
  const [cancelando, setCancelando] = useState<ClaseMuestra | null>(null);
  const clases = (carga.datos?.datos ?? []).filter((c) => c.estatus !== "reagendada");
  return (
    <Tarjeta titulo="Clase muestra" acciones={puedeEscribir ? <Boton onClick={() => setAgendando(true)}>Agendar clase muestra</Boton> : undefined}>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos && clases.length === 0 ? <Vacio titulo="No tiene clase muestra" /> : null}
      <ul className="lista-tarjetas">
        {clases.map((c) => {
          const e = ESTATUS_DE_CLASE[c.estatus] ?? { texto: c.estatus, tono: "neutro" as const };
          return (
            <li key={c.id} className="tarjeta pila" data-prueba={`clase-${c.id}`}>
              <div className="fila fila-entre">
                <strong>
                  {c.sesion.fecha} · {c.sesion.hora}
                </strong>
                <Insignia tono={e.tono}>{e.texto}</Insignia>
              </div>
              <p>
                {c.prospecto ?? "Alumno"} · {c.grupo} · {c.sucursal}
              </p>
              {c.motivo_cancelacion ? <p className="muted">Motivo: {c.motivo_cancelacion}</p> : null}
              {puedeEscribir && c.estatus === "agendada" ? (
                <div className="fila">
                  <Boton onClick={() => setReprogramando(c)}>Reprogramar</Boton>
                  <Boton variante="peligro" onClick={() => setCancelando(c)}>
                    Cancelar
                  </Boton>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <DialogoDeSesion key={`nueva-${agendando}`} lead={lead} clase={null} abierto={agendando} alCerrar={() => setAgendando(false)} alGuardar={refrescar} />
      <DialogoDeSesion key={`re-${reprogramando?.id ?? ""}`} lead={lead} clase={reprogramando} abierto={reprogramando !== null} alCerrar={() => setReprogramando(null)} alGuardar={refrescar} />
      <DialogoDeCancelar clase={cancelando} alCerrar={() => setCancelando(null)} alCancelar={refrescar} />
    </Tarjeta>
  );
}
