// Pase de lista por grupo y fecha (maestro, recepción, administrador), pensado para el celular: un alumno por tarjeta con tres botones grandes
// (Presente · Falta · Justificada), un resumen y UN guardado idempotente (guardar dos veces no duplica nada: el servidor responde «sin cambio»).

import { useEffect, useState } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Grupo } from "../../api/tipos.ts";
import { leerBorrador, ponerBorrador } from "../../lib/borradores.ts";
import { formatearFechaLarga, hoyLocal } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina as Marco, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect, CampoTexto, GrupoDeOpciones } from "../../ui/campos.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";

type Estatus = "presente" | "falta" | "justificada";
const OPCIONES = [
  { valor: "presente", texto: "Presente" },
  { valor: "falta", texto: "Falta" },
  { valor: "justificada", texto: "Justificada" },
] as const;

interface FilaDePase {
  inscripcion_id: string;
  alumno_id: string;
  alumno: string;
  activa: boolean;
  estatus: Estatus | null;
  metodo: string | null;
}

interface Pase {
  grupo: { id: string; nombre: string };
  fecha: string;
  hoy: string;
  es_sesion: boolean;
  sesiones: string[];
  puede_registrar: boolean;
  problema: "no_es_sesion" | "fecha_futura" | null;
  pase_tomado: boolean;
  lista: FilaDePase[];
}

interface ResultadoDelPase {
  creadas: number;
  actualizadas: number;
  sin_cambio: number;
  alertas: { inscripcion_id: string; racha_de_faltas: number; umbral: number; accion: string | null }[];
  lista: FilaDePase[];
}

function Lista({ pase, grupoId, fecha, alCambiar }: { pase: Pase; grupoId: string; fecha: string; alCambiar: (p: Pase) => void }) {
  const { yo } = useSesion();
  const usuarioId = yo?.usuario.id ?? "";
  const claveDeBorrador = `pase:${grupoId}|${fecha}`;
  // V7: lo marcado y sin guardar sobrevive a cambiar de grupo, de fecha o de pantalla (vive en la memoria de la página, no en el navegador).
  const [ed, setEd] = useState<Record<string, Estatus>>(() => leerBorrador<Record<string, Estatus>>(usuarioId, claveDeBorrador) ?? {});
  const [resultado, setResultado] = useState<ResultadoDelPase | null>(null);
  const [guardadoA, setGuardadoA] = useState<string | null>(null);
  const guardar = useAccion();
  useEffect(() => {
    ponerBorrador(usuarioId, claveDeBorrador, Object.keys(ed).length > 0 ? ed : undefined);
  }, [ed, usuarioId, claveDeBorrador]);

  const efectivo = (f: FilaDePase): Estatus | null => ed[f.inscripcion_id] ?? f.estatus;
  const activos = pase.lista.filter((f) => f.activa);
  const cuenta = (e: Estatus | null): number => pase.lista.filter((f) => efectivo(f) === e).length;
  const sinMarcar = activos.filter((f) => efectivo(f) === null).length;
  const cambios = Object.keys(ed).length;
  const bloqueado = !pase.puede_registrar;

  async function enviar() {
    const asistencias = pase.lista.flatMap((f) => {
      const e = efectivo(f);
      return e && (ed[f.inscripcion_id] !== undefined || f.activa) ? [{ inscripcion_id: f.inscripcion_id, estatus: e, metodo: "manual" }] : [];
    });
    const r = await guardar.ejecutar(() => api.put<ResultadoDelPase>(`/api/grupos/${grupoId}/pase`, { fecha, asistencias }));
    if (!r) return;
    setResultado(r);
    setGuardadoA(new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));
    setEd({});
    alCambiar({ ...pase, lista: r.lista, pase_tomado: true });
  }

  return (
    <div className="pila">
      <div className="fila pase-resumen" data-prueba="resumen-pase">
        <Insignia tono="exito">Presentes {cuenta("presente")}</Insignia>
        <Insignia tono="peligro">Faltas {cuenta("falta")}</Insignia>
        <Insignia tono="info">Justificadas {cuenta("justificada")}</Insignia>
        <Insignia tono={sinMarcar > 0 ? "alerta" : "neutro"}>Sin marcar {sinMarcar}</Insignia>
        {pase.pase_tomado ? <Insignia>Pase ya tomado</Insignia> : null}
      </div>
      {pase.problema === "fecha_futura" ? <Aviso tono="alerta">La clase de ese día todavía no empieza: el pase se toma desde la hora de inicio.</Aviso> : null}
      {activos.length === 0 ? (
        <div className="vacio-maestro">
          <Vacio titulo="No hay alumnos inscritos en este grupo para esa fecha">Elige otra fecha u otro grupo arriba. Si falta alguien, avisa a recepción para que lo inscriba.</Vacio>
        </div>
      ) : null}
      {!bloqueado && activos.length > 0 ? (
        <div className="pase-todos">
          <Boton ancho onClick={() => setEd((a) => ({ ...a, ...Object.fromEntries(activos.filter((f) => efectivo(f) === null).map((f) => [f.inscripcion_id, "presente" as const])) }))}>Marcar presentes a todos los que faltan por marcar</Boton>
        </div>
      ) : null}
      <ul className="lista-pase">
        {pase.lista.map((f) => (
          <li key={f.inscripcion_id} className="alumno-pase" data-prueba={`alumno-${f.alumno_id}`}>
            <GrupoDeOpciones etiqueta={f.alumno + (f.activa ? "" : " (ya no está inscrito)")} valor={efectivo(f) ?? ""} opciones={OPCIONES} segmentado alCambiar={(v) => (!bloqueado && (f.activa || ed[f.inscripcion_id] !== undefined || f.estatus !== null) ? setEd((a) => ({ ...a, [f.inscripcion_id]: v as Estatus })) : undefined)} />
          </li>
        ))}
      </ul>
      {!bloqueado ? (
        <div className="barra-guardado barra-guardado-columna">
          {/* El aviso de un fallo vive DENTRO de la barra fija: debajo de ella la barra lo tapaba y quien tocaba «Guardar» sin señal no veía nada (V7). */}
          {guardar.error ? (
            <div className="pila" data-prueba="error-del-pase">
              <ErrorDeAccion error={guardar.error} />
              <p className="muted">{guardar.error.codigo === "sin_red" ? "No se guardó nada todavía. Tus marcas siguen aquí: cuando haya señal, toca «Guardar pase de lista» otra vez (no se duplica nada)." : "Tus marcas siguen aquí: corrige lo que se indica y vuelve a guardar."}</p>
            </div>
          ) : null}
          <div className="barra-guardado-fila">
            <span className="barra-guardado-texto" role="status">
              {cambios > 0 ? `${cambios} ${cambios === 1 ? "cambio sin guardar" : "cambios sin guardar"}` : guardadoA ? `Pase guardado a las ${guardadoA}` : "Sin cambios por guardar"}
              {sinMarcar > 0 ? ` · ${sinMarcar} sin marcar` : ""}
            </span>
            <Boton variante="primario" disabled={cambios === 0 && pase.pase_tomado} cargando={guardar.ocupado} onClick={() => void enviar()}>
              Guardar pase de lista
            </Boton>
          </div>
        </div>
      ) : null}
      {/* Debajo de la barra fija, no encima: con la barra pegada al borde de la ventana tapaba el detalle del aviso. */}
      {resultado ? (
        <Aviso tono="exito" titulo="Pase guardado">
          <p>Quedó guardada la asistencia de {resultado.lista.filter((f) => f.activa && f.estatus !== null).length} {resultado.lista.filter((f) => f.activa && f.estatus !== null).length === 1 ? "alumno" : "alumnos"}{resultado.actualizadas > 0 ? `; corregiste ${resultado.actualizadas}` : ""}. Si lo guardas otra vez, no se duplica nada.</p>
          <p className="muted" data-prueba="resultado-pase">
            Detalle: {resultado.creadas} nuevas, {resultado.actualizadas} corregidas, {resultado.sin_cambio} sin cambio.
          </p>
          {resultado.alertas
            .filter((a) => a.racha_de_faltas >= a.umbral)
            .map((a) => (
              <p key={a.inscripcion_id}>
                {pase.lista.find((f) => f.inscripcion_id === a.inscripcion_id)?.alumno ?? "Un alumno"} lleva {a.racha_de_faltas} faltas seguidas{a.accion === "tarea_creada" ? ": se avisó al asesor." : "."}
              </p>
            ))}
        </Aviso>
      ) : null}
    </div>
  );
}

export default function PaseDeLista() {
  useTitulo("Pase de lista");
  const { sucursalId } = useSesion();
  const grupos = useCarga((senal) => api.get<Pagina<Grupo>>("/api/grupos", { limite: 100, ...(sucursalId ? { sucursal_id: sucursalId } : {}) }, senal), [sucursalId]);
  const [eleccion, setEleccion] = useState("");
  const [fecha, setFecha] = useState(hoyLocal());
  const activos = (grupos.datos?.datos ?? []).filter((g) => g.activo);
  const grupoId = activos.some((g) => g.id === eleccion) ? eleccion : (activos[0]?.id ?? "");
  const pase = useCarga((senal) => api.get<Pase>(`/api/grupos/${grupoId}/pase`, { fecha }, senal), [grupoId, fecha], grupoId !== "" && /^\d{4}-\d{2}-\d{2}$/.test(fecha));

  return (
    <Marco titulo="Pase de lista" subtitulo={fecha ? formatearFechaLarga(fecha) : undefined}>
      <div className="maestro-columna">
      {grupos.error ? <ErrorDeCarga error={grupos.error} alReintentar={grupos.recargar} /> : null}
      {grupos.cargando && !grupos.datos ? <Cargando /> : null}
      {grupos.datos && activos.length === 0 ? (
        <div className="vacio-maestro">
          <Vacio titulo="No tienes grupos activos">Cuando te asignen un grupo, aparecerá aquí.</Vacio>
        </div>
      ) : null}
      {activos.length > 0 ? (
        <div className="rejilla rejilla-2">
          <CampoSelect etiqueta="Grupo" value={grupoId} onChange={(e) => setEleccion(e.target.value)} opciones={activos.map((g) => ({ valor: g.id, texto: `${g.nombre} · ${g.programa.nombre}` }))} />
          <CampoTexto etiqueta="Fecha de la clase" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      ) : null}
      {pase.error ? <ErrorDeCarga error={pase.error} alReintentar={pase.recargar} /> : null}
      {pase.cargando && !pase.datos ? <Cargando texto="Cargando la lista…" /> : null}
      {pase.datos && !pase.datos.es_sesion ? <Aviso tono="alerta">Ese día este grupo no da clase. Elige otra fecha.</Aviso> : null}
      {pase.datos && pase.datos.es_sesion ? <Lista key={`${grupoId}|${fecha}`} pase={pase.datos} grupoId={grupoId} fecha={fecha} alCambiar={pase.poner} /> : null}
      </div>
    </Marco>
  );
}
