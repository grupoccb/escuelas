// El embudo de leads (asesor): tablero por etapa y lista, indicadores, filtros por disciplina, fuente y estancados, y mover de etapa con historial.
// R2a (handoff v2): arrastrar y soltar con el ratón, selección en lote, columnas plegables, versión de celular (píldoras de etapa, modo «Seleccionar», hoja «Mover a…»).
// Las reglas de negocio no cambian: perder exige motivo, recuperar exige nota y a «inscrito» se llega inscribiendo; el servidor manda (409 = el lead cambió, se recarga).
// R2b (handoff v2): la ficha lateral (`fichaAbierta`, `FichaLateral.tsx`) y los diálogos de perdido, recuperar, inscribir en 3 pasos y agendar (`dialogo`, `soltar()`). `MoverEtapa` queda para el botón «Mover de etapa»
// de la tarjeta y de la fila con ratón; todo lo que se suelta, se elige en «Mover a…» o se pide desde la ficha pasa por `soltar()`.

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, armarConsulta, traerTodo } from "../../api/cliente.ts";
import type { ClaseMuestra, Etapa, LeadDetalle, LeadResumen, MotivoPerdida } from "../../api/tipos.ts";
import { urlDeConversacion } from "../../lib/chatwoot.ts";
import { diasDesde } from "../../lib/fechas.ts";
import { useSesion, useYo } from "../../sesion/SesionContext.tsx";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, Cargando, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoBusqueda, CampoCasilla, CampoSelect } from "../../ui/campos.tsx";
import { AvatarDisciplina, EtiquetaDisciplina, iniciales, useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { comoErrorDeApi, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Pestanas, propsDePanel } from "../../ui/Pestanas.tsx";
import { usePunteroTactil, useEscritorio } from "../../ui/useEscritorio.ts";
import type { Vertical } from "../admin/tipos.ts";
import { AvisoDePrimerosPasos } from "../admin/AvisoDePrimerosPasos.tsx";
import { BarraDeSeleccion } from "./BarraDeSeleccion.tsx";
import { ColumnaDeEtapa } from "./ColumnaDeEtapa.tsx";
import { type ClaseAgendada, DialogoAgendar } from "./DialogoAgendar.tsx";
import { DialogoPerdido, DialogoRecuperar } from "./DialogosDeCierre.tsx";
import { accionDeEtapa, CLAVE_DE_PLEGADAS, contarIndicadores, esDeCierre, estaPlegada, etapaDeRecuperacion, etapasDespuesDeLaClase, leerPlegadas, tonoDeEtapa } from "./etapas-embudo.ts";
import { FichaLateral } from "./FichaLateral.tsx";
import { FUENTES } from "./fuentes.ts";
import { HojaMoverA } from "./HojaMoverA.tsx";
import { type InscripcionHecha, InscribirDeUnoEnUno, InscribirEnTresPasos } from "./InscribirEnTresPasos.tsx";
import { esEtapaDeInscrito, esEtapaPerdida, sePuedeMarcarComoInscrito } from "./inscrito-a-mano.ts";
import { MarcarInscrito } from "./MarcarInscrito.tsx";
import { MoverEtapa, type LeadParaMover, type ResultadoDeMover } from "./MoverEtapa.tsx";
import { alternar, avisoDeMovimiento, depurar } from "./seleccion.ts";
import { TarjetaDeLead, type DatosDeTarjeta, type DetalleDeEtapa, type TipoDeAccion } from "./TarjetaDeLead.tsx";
import { useArrastre } from "./useArrastre.ts";

interface Estancado {
  id: string;
  dias_sin_movimiento: number;
}

export { FUENTES };

/** Lo que el embudo puede abrir al soltar, elegir una etapa o pulsar la acción de una tarjeta: motivo con botones, recuperar con nota, inscripción (en 3 pasos, o «marcar como inscrito» con la inscripción apagada) y agendar (o cambiar) la clase muestra. */
type Dialogo = { tipo: "perdido" | "recuperar" | "inscribir" | "agendar"; ids: string[]; destinoId?: string; reprogramar?: boolean };

/** La clase muestra que importa de un lead: la próxima agendada y la última a la que asistió. */
interface ClasesDeLead {
  proxima?: ClaseMuestra;
  asistio?: ClaseMuestra;
}

const nombreDe = (l: LeadResumen): string => l.nombre_contacto ?? "Sin nombre";

/** «Matías, 4 años» con lo que la clase muestra sabe del niño (la lista de leads de la API no trae los niños). */
function textoDelNino(c: ClaseMuestra | undefined): string | null {
  if (!c?.prospecto) return null;
  return c.edad_declarada === null ? c.prospecto : `${c.prospecto}, ${c.edad_declarada} ${c.edad_declarada === 1 ? "año" : "años"}`;
}

function PildoraDeDisciplina({ nombre, color, cuenta, activa, alElegir }: { nombre: string; color: string | null; cuenta: number; activa: boolean; alElegir: () => void }) {
  const ref = useDisciplina<HTMLButtonElement>(color);
  return (
    <button ref={ref} type="button" className="pildora-filtro" aria-pressed={activa} onClick={alElegir}>
      <span className="pildora-filtro-punto" aria-hidden="true" />
      {nombre}
      <span className="pildora-filtro-cuenta">{cuenta}</span>
    </button>
  );
}

/** La tarjeta que viaja con el puntero: una pila con contador si van varios. Es decorativa (`aria-hidden`): el arrastre tiene su alternativa con botones. */
function FantasmaDeArrastre({ referencia, cantidad, nombre, nota, color }: { referencia: React.RefObject<HTMLDivElement | null>; cantidad: number; nombre: string; nota: string; color: string | null }) {
  return createPortal(
    <div ref={referencia} className="arrastre-fantasma" aria-hidden="true">
      {cantidad > 1 ? <div className="arrastre-fantasma-pila" /> : null}
      <div className="arrastre-fantasma-tarjeta">
        <AvatarDisciplina nombre={nombre} color={color} />
        <span className="arrastre-fantasma-texto">
          <span className="arrastre-fantasma-nombre">{cantidad > 1 ? `${nombre} y ${cantidad - 1} más` : nombre}</span>
          <span className="arrastre-fantasma-nota">{nota}</span>
        </span>
        {cantidad > 1 ? <span className="arrastre-fantasma-cuenta">{cantidad}</span> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Una fila de la vista de lista: avatar que selecciona, contacto, disciplina, etapa, fuente, sucursal, último movimiento y acciones. */
function FilaDeLead({ d, etapa, seleccionada, alSeleccionar, alChat, alMarcar, alMover }: { d: DatosDeTarjeta; etapa: Etapa | undefined; seleccionada: boolean; alSeleccionar: (id: string) => void; alChat: ((id: string) => void) | null; alMarcar: ((l: LeadParaMover) => void) | null; alMover: (l: LeadParaMover) => void }) {
  const ref = useDisciplina<HTMLTableRowElement>(d.disciplina?.color ?? null);
  const lead: LeadParaMover = { id: d.id, nombre: d.nombre, etapa_id: d.etapaId };
  return (
    <tr ref={ref} data-prueba={`lead-${d.id}`} data-seleccionado={seleccionada ? "" : undefined}>
      <td className="celda-seleccion">
        <button type="button" className="avatar-disciplina lead-seleccion" aria-pressed={seleccionada} aria-label={seleccionada ? `Quitar a ${d.nombre} de la selección` : `Seleccionar a ${d.nombre}`} onClick={() => alSeleccionar(d.id)}>
          {seleccionada ? <Icono nombre="exito" tamano={16} /> : iniciales(d.nombre)}
        </button>
      </td>
      <td className="celda-titulo">
        <Link id={`nombre-lead-lista-${d.id}`} to={`/leads/${d.id}`}>
          {d.nombre}
        </Link>
        {d.telefono ? <span className="muted numero fila-telefono">{d.telefono}</span> : null}
      </td>
      <td data-etiqueta="Interés">
        <span className="fila">
          {d.disciplina ? <EtiquetaDisciplina nombre={d.disciplina.nombre} color={d.disciplina.color} /> : null}
          {d.nino ? <span className="lead-nino">{d.nino}</span> : null}
        </span>
      </td>
      <td data-etiqueta="Etapa">
        <span className="etapa-pildora" data-tono={etapa ? tonoDeEtapa(etapa) : "neutro"}>
          {d.etapaNombre}
        </span>
      </td>
      <td data-etiqueta="Fuente">{d.fuente}</td>
      <td data-etiqueta="Sucursal">{d.sucursal || "—"}</td>
      <td data-etiqueta="Último movimiento">
        <span className="fila">
          {d.tiempo ?? "—"} {d.estancadoDias !== null ? <Insignia tono="alerta">Estancado</Insignia> : null}
        </span>
      </td>
      <td className="celda-acciones">
        <span className="fila fila-fin lista-acciones">
          {alChat ? (
            <button type="button" className="boton boton-icono" aria-label={`Abrir la conversación con ${d.nombre}`} title="Abrir conversación" onClick={() => alChat(d.id)}>
              <Icono nombre="chatwoot" tamano={18} />
            </button>
          ) : null}
          {alMarcar ? (
            <button type="button" className="boton boton-icono" aria-label="Marcar como inscrito" title="Marcar como inscrito" aria-describedby={`nombre-lead-lista-${d.id}`} onClick={() => alMarcar(lead)} data-prueba={`marcar-inscrito-${d.id}`}>
              <Icono nombre="reactivar" tamano={18} />
            </button>
          ) : null}
          {etapa && esEtapaDeInscrito(etapa) ? null : (
            <button type="button" className="boton boton-icono" aria-label="Mover" title="Mover de etapa" aria-describedby={`nombre-lead-lista-${d.id}`} onClick={() => alMover(lead)}>
              <Icono nombre="siguiente" tamano={18} />
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

export default function Embudo() {
  useTitulo("Embudo");
  const yo = useYo();
  const navegar = useNavigate();
  const { avisar } = useAvisos();
  const { sucursalId, puede, moduloEncendido } = useSesion();
  const escritorio = useEscritorio();
  const tactil = usePunteroTactil();
  const [vista, setVista] = useState<"tablero" | "lista">("tablero");
  const [fuente, setFuente] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [soloEstancados, setSoloEstancados] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [moviendo, setMoviendo] = useState<LeadParaMover | null>(null);
  const [hoja, setHoja] = useState<LeadParaMover | null>(null);
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());
  const [menuLote, setMenuLote] = useState(false);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [etapaMovil, setEtapaMovil] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  // La ficha lateral (clic o Enter en una tarjeta) y el diálogo del momento (perdido, recuperar, inscribir o agendar).
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  // Cambia cada vez que se recarga lo que se ve: la ficha lateral abierta vuelve a leer al lead.
  const [version, setVersion] = useState(0);
  const [plegadas, setPlegadas] = useState<Record<string, boolean>>(() => {
    try {
      return leerPlegadas(window.localStorage.getItem(CLAVE_DE_PLEGADAS));
    } catch {
      return {};
    }
  });
  // Columnas de cierre a las que acaba de llegar un lead: se muestran (aunque estén plegadas) para que se vea dónde quedó.
  const [reveladas, setReveladas] = useState<ReadonlySet<string>>(new Set());
  const tablero = useRef<HTMLDivElement>(null);
  const trabajando = useRef(false);

  const etapas = useCarga((senal) => api.get<{ datos: Etapa[] }>("/api/etapas", undefined, senal).then((r) => r.datos), []);
  const motivos = useCarga((senal) => api.get<{ datos: MotivoPerdida[] }>("/api/motivos-perdida", undefined, senal).then((r) => r.datos), []);
  const leads = useCarga(() => traerTodo<LeadResumen>("/api/leads", { sucursal_id: sucursalId ?? undefined }, 500), [sucursalId]);
  const estancados = useCarga(() => traerTodo<Estancado>("/api/leads/estancados", { sucursal_id: sucursalId ?? undefined }, 500).then((r) => new Map(r.datos.map((e) => [e.id, e]))), [sucursalId]);
  // El color y el nombre de la disciplina salen de la tabla de disciplinas (`color_marca`); si no se pueden leer, las tarjetas se ven sin ellos (la pantalla no depende de esto).
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", { activo: true }, senal).then((r) => r.datos).catch(() => [] as Vertical[]), []);
  // Las clases muestra dan la línea propia de la etapa (fecha de la clase, «Asistió el…») y el niño; la API de leads no los trae. Solo con el módulo encendido y el permiso.
  const clasesVisibles = moduloEncendido("clase_muestra") && puede("clases_muestra:leer");
  const clases = useCarga(
    async () => {
      const consulta = { sucursal_id: sucursalId ?? undefined };
      const porLead = new Map<string, ClasesDeLead>();
      try {
        const [agendadas, asistidas] = await Promise.all([traerTodo<ClaseMuestra>("/api/clases-muestra", { ...consulta, estatus: "agendada" }, 300), traerTodo<ClaseMuestra>("/api/clases-muestra", { ...consulta, estatus: "asistio" }, 300)]);
        for (const c of [...agendadas.datos].sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))) porLead.set(c.lead_id, { ...porLead.get(c.lead_id), proxima: c });
        for (const c of [...asistidas.datos].sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))) porLead.set(c.lead_id, { ...porLead.get(c.lead_id), asistio: c });
      } catch {
        /* sin clases la tarjeta solo pierde esa línea */
      }
      return porLead;
    },
    [sucursalId, clasesVisibles],
    clasesVisibles,
  );

  const error = etapas.error ?? leads.error;
  const lista = useMemo(() => etapas.datos ?? [], [etapas.datos]);
  const porEtapa = useMemo(() => new Map(lista.map((e) => [e.id, e])), [lista]);
  const todos = useMemo(() => leads.datos?.datos ?? [], [leads.datos]);
  const porLead = useMemo(() => new Map(todos.map((l) => [l.id, l])), [todos]);
  const disciplinas = useMemo(() => verticales.datos ?? [], [verticales.datos]);
  const porDisciplina = useMemo(() => new Map(disciplinas.map((v) => [v.id, v])), [disciplinas]);
  const disciplinasPorId = useMemo(() => new Map(disciplinas.map((v) => [v.id, { nombre: v.nombre, color: v.color_marca }])), [disciplinas]);
  const nombreDeSucursal = (id: string | null): string => yo.sucursales.find((s) => s.id === id)?.nombre ?? "";
  const fuentes = [...new Set(todos.map((l) => l.fuente))].sort();
  const buscado = busqueda.trim().toLowerCase();
  const visibles = todos.filter((l) => (!disciplina || l.vertical_interes_id === disciplina) && (!fuente || l.fuente === fuente) && (!soloEstancados || estancados.datos?.has(l.id)) && (buscado === "" || `${l.nombre_contacto ?? ""} ${l.telefono ?? ""}`.toLowerCase().includes(buscado)));
  const cierra = (l: LeadResumen): boolean => {
    const e = porEtapa.get(l.etapa_id);
    return e ? esDeCierre(e) : false;
  };
  const cuantosEstancados = todos.filter((l) => estancados.datos?.has(l.id) && !cierra(l)).length;
  const numeros = contarIndicadores(lista, todos);
  const etapaInscrito = lista.find(esEtapaDeInscrito);
  const despuesDeLaClase = useMemo(() => etapasDespuesDeLaClase(lista), [lista]);
  const puedeInscribir = moduloEncendido("inscripcion") && puede("conversion:ejecutar") && puede("leads:escribir");
  const puedeAgendar = moduloEncendido("clase_muestra") && puede("clases_muestra:escribir");
  const hayChat = Boolean(yo.configuracion.chatwoot_url_publica);
  const filtrando = Boolean(busqueda.trim() || fuente || soloEstancados || disciplina);
  // V10b: con la inscripción apagada, «Marcar como inscrito» en cada lead que sigue abierto (la regla es del servidor).
  const puedeMarcar = (l: LeadResumen): boolean => sePuedeMarcarComoInscrito({ inscripcionEncendida: moduloEncendido("inscripcion"), puedeEscribir: puede("leads:escribir"), etapaActual: porEtapa.get(l.etapa_id) });
  const recargar = () => {
    setVersion((v) => v + 1);
    leads.recargar();
    estancados.recargar();
    clases.recargar();
  };

  // La selección solo vale para lo que se ve: un filtro, otra sucursal o una recarga suelta lo que ya no está.
  const idsVisibles = useMemo(() => new Set(visibles.map((l) => l.id)), [visibles]);
  const seleccionVigente = useMemo(() => depurar(seleccion, idsVisibles), [seleccion, idsVisibles]);
  // El orden en que se ven en el tablero (etapa por etapa): la pila arrastrada y los avisos salen siempre igual.
  const ordenVisible = useMemo(() => lista.flatMap((e) => visibles.filter((l) => l.etapa_id === e.id).map((l) => l.id)), [lista, visibles]);
  const idsSeleccionados = ordenVisible.filter((id) => seleccionVigente.has(id));
  const hayDialogoAbierto = moviendo !== null || hoja !== null || dialogo !== null || fichaAbierta !== null;

  const datosDeLead = (l: LeadResumen): DatosDeTarjeta => {
    const etapa = porEtapa.get(l.etapa_id);
    const cerrada = etapa ? esDeCierre(etapa) : false;
    const v = porDisciplina.get(l.vertical_interes_id);
    const clase = clases.datos?.get(l.id);
    const est = estancados.datos?.get(l.id);
    const dias = diasDesde(l.ultima_interaccion_en ?? l.creado_en);
    const motivo = l.motivo_perdida_id ? (motivos.datos ?? []).find((m) => m.id === l.motivo_perdida_id)?.nombre : undefined;
    let detalle: DetalleDeEtapa | null = null;
    if (etapa && esEtapaPerdida(etapa)) {
      if (motivo) detalle = { texto: `Motivo: ${motivo}`, tono: "peligro", icono: "cerrar" };
    } else if (!cerrada && clase?.proxima) detalle = { texto: `${clase.proxima.sesion.fecha} · ${clase.proxima.sesion.hora}`, tono: "primario", icono: "hoy", rotulo: "Clase muestra" };
    else if (clase?.asistio) detalle = { texto: `Asistió el ${clase.asistio.sesion.fecha}`, tono: "exito", icono: "exito" };
    const nombre = nombreDe(l);
    const tipoDeAccion = accionDeEtapa({ cerrada, puedeMarcar: puedeMarcar(l), despuesDeLaClase: despuesDeLaClase.has(l.etapa_id), puedeInscribir, puedeAgendar, tieneClaseAgendada: clase?.proxima !== undefined });
    const ETIQUETAS: Record<NonNullable<typeof tipoDeAccion>, string> = { marcar: "Marcar como inscrito", inscribir: `Inscribir a ${nombre}`, agendar: `Agendar la clase muestra de ${nombre}`, "cambiar-clase": `Cambiar la clase muestra de ${nombre}` };
    const accion: DatosDeTarjeta["accion"] = tipoDeAccion ? { tipo: tipoDeAccion, etiqueta: ETIQUETAS[tipoDeAccion] } : null;
    return {
      id: l.id,
      nombre,
      telefono: l.telefono,
      etapaId: l.etapa_id,
      etapaNombre: etapa?.nombre ?? "—",
      recuperaciones: l.recuperaciones,
      disciplina: v ? { nombre: v.nombre, color: v.color_marca } : null,
      nino: textoDelNino(clase?.proxima ?? clase?.asistio),
      estancadoDias: est && !cerrada ? est.dias_sin_movimiento : null,
      tiempo: cerrada ? null : dias === 0 ? "Hoy" : `${dias} d`,
      detalle,
      fuente: FUENTES[l.fuente] ?? l.fuente,
      sucursal: nombreDeSucursal(l.sucursal_interes_id),
      accion,
      conChat: hayChat,
    };
  };

  const limpiarSeleccion = useCallback(() => {
    setSeleccion(new Set());
    setMenuLote(false);
    setModoSeleccion(false);
  }, []);
  const alternarSeleccion = (id: string) => {
    setSeleccion((s) => alternar(depurar(s, idsVisibles), id));
    setMenuLote(false);
  };
  const limpiarFiltros = () => {
    setBusqueda("");
    setFuente("");
    setDisciplina("");
    setSoloEstancados(false);
  };
  const alPlegar = (etapaId: string) => {
    const etapa = porEtapa.get(etapaId);
    if (!etapa) return;
    const siguiente = !estaPlegada(etapa, plegadas, reveladas);
    const nuevas = { ...plegadas, [etapaId]: siguiente };
    setPlegadas(nuevas);
    setReveladas((r) => {
      if (!r.has(etapaId)) return r;
      const sin = new Set(r);
      sin.delete(etapaId);
      return sin;
    });
    try {
      window.localStorage.setItem(CLAVE_DE_PLEGADAS, JSON.stringify(nuevas));
    } catch {
      /* sin almacenamiento la columna queda como se eligió, hasta que se recargue */
    }
  };
  const revelar = (etapaId: string) => setReveladas((r) => new Set(r).add(etapaId));

  // Clic o Enter en una tarjeta: la ficha lateral (la completa se abre desde ahí con «Abrir completa»). Al cerrarla, el foco vuelve a la tarjeta.
  const fichaDe = useRef<string | null>(null);
  const abrirFicha = (id: string) => {
    setMenuLote(false);
    fichaDe.current = id;
    setFichaAbierta(id);
  };
  const cerrarFicha = () => {
    setFichaAbierta(null);
    const id = fichaDe.current;
    // El <dialog> devuelve el foco al elemento que lo tenía; se asegura que sea la tarjeta (o su fila) aunque se haya abierto con el ratón.
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-prueba="lead-${id ?? ""}"]`)?.focus({ preventScroll: true }), 0);
  };
  const abrirAgendar = (id: string, reprogramar = false) => setDialogo({ tipo: "agendar", ids: [id], reprogramar });

  // Mover SIN diálogo: una llamada por lead (`PATCH /api/leads/:id/etapa`, con la etapa de la que se le vio salir). Un 409 es «cambió mientras lo veías»: se recarga y se avisa.
  const moverDirecto = async (ids: string[], destino: Etapa) => {
    if (trabajando.current) return;
    trabajando.current = true;
    setProblema(null);
    let movidos = 0;
    let cambiaron = 0;
    let otroError: string | null = null;
    try {
      for (const id of ids) {
        const l = porLead.get(id);
        if (!l) continue;
        try {
          await api.patch(`/api/leads/${id}/etapa`, { etapa_id: destino.id, desde_etapa_id: l.etapa_id });
          movidos += 1;
        } catch (e) {
          const err = comoErrorDeApi(e);
          if (err.esConflicto) cambiaron += 1;
          else otroError ??= err.message;
        }
      }
    } finally {
      trabajando.current = false;
    }
    recargar();
    if (movidos > 0) {
      setSeleccion((s) => new Set([...s].filter((x) => !ids.includes(x))));
      revelar(destino.id);
      const primero = porLead.get(ids[0] ?? "");
      avisar(avisoDeMovimiento({ nombre: primero ? nombreDe(primero) : "El lead", cantidad: movidos, etapa: destino.nombre }));
    }
    if (cambiaron > 0) setProblema(cambiaron === 1 ? "Un lead cambió de etapa mientras lo veías y no se movió. Ya se actualizó el tablero." : `${cambiaron} leads cambiaron de etapa mientras los veías y no se movieron. Ya se actualizó el tablero.`);
    else if (otroError) setProblema(otroError);
  };

  /**
   * Qué hacer con estos leads al llevarlos a esa etapa (soltados sobre la columna, elegidos en «Mover a…» o en la hoja de una tarjeta). Es el único punto que decide, para que arrastrar y
   * los botones se comporten igual: un inscrito no se mueve; a perdidos se pide el motivo; de perdidos a una abierta se pide la nota; a inscrito se inscribe de uno en uno; lo demás se mueve y se avisa.
   */
  const soltar = (ids: string[], etapaDestinoId: string) => {
    const destino = porEtapa.get(etapaDestinoId);
    if (!destino) return;
    const afectados = ids.map((id) => porLead.get(id)).filter((l): l is LeadResumen => l !== undefined && l.etapa_id !== destino.id);
    if (afectados.length === 0) return;
    setMenuLote(false);
    setProblema(null);
    const yaInscritos = afectados.filter((l) => {
      const e = porEtapa.get(l.etapa_id);
      return e ? esEtapaDeInscrito(e) : false;
    });
    const movibles = afectados.filter((l) => !yaInscritos.includes(l));
    if (movibles.length === 0) {
      avisar(yaInscritos.length === 1 ? `${nombreDe(yaInscritos[0]!)} ya está inscrito: los cambios se hacen desde su expediente.` : "Los inscritos ya son alumnos: los cambios se hacen desde su expediente.");
      return;
    }
    const idsMovibles = movibles.map((l) => l.id);
    const vieneDePerdidos = (l: LeadResumen): boolean => {
      const e = porEtapa.get(l.etapa_id);
      return e ? esEtapaPerdida(e) : false;
    };
    if (esEtapaPerdida(destino)) {
      setDialogo({ tipo: "perdido", ids: idsMovibles, destinoId: destino.id });
      return;
    }
    if (esEtapaDeInscrito(destino)) {
      if (movibles.length > 1) {
        // Se explica en un diálogo: la inscripción es de una familia a la vez.
        setDialogo({ tipo: "inscribir", ids: idsMovibles, destinoId: destino.id });
        return;
      }
      const lead = movibles[0]!;
      if (vieneDePerdidos(lead)) {
        avisar("Un lead perdido primero se recupera: muévelo a una etapa abierta.");
        return;
      }
      if (moduloEncendido("inscripcion")) {
        // La inscripción en 3 pasos (conversión resumida); lo que no cabe ahí se manda a la inscripción completa desde el mismo diálogo.
        if (!puedeInscribir) {
          avisar("No tienes permiso para inscribir desde aquí.");
          return;
        }
        setDialogo({ tipo: "inscribir", ids: idsMovibles, destinoId: destino.id });
        return;
      }
      if (!puedeMarcar(lead)) {
        avisar("No se puede marcar a este lead como inscrito desde aquí.");
        return;
      }
      setDialogo({ tipo: "inscribir", ids: idsMovibles, destinoId: destino.id });
      return;
    }
    if (movibles.some(vieneDePerdidos)) {
      setDialogo({ tipo: "recuperar", ids: idsMovibles, destinoId: destino.id });
      return;
    }
    void moverDirecto(idsMovibles, destino);
  };

  const { arrastre, fantasma, alPresionar, esClicDeArrastre } = useArrastre({
    habilitado: escritorio && vista === "tablero",
    seleccion: seleccionVigente,
    ordenVisible,
    puedeArrastrarse: (id) => {
      const l = porLead.get(id);
      const e = l ? porEtapa.get(l.etapa_id) : undefined;
      return e !== undefined && !esEtapaDeInscrito(e) && !hayDialogoAbierto;
    },
    tablero,
    alSoltar: soltar,
  });

  // Esc, en el orden del README: diálogo, hoja, menú, ficha, selección (los diálogos y la hoja son <dialog> y se cierran solos; aquí solo se cede el paso).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (menuLote) setMenuLote(false);
      else if (fichaAbierta !== null) setFichaAbierta(null);
      else if (seleccion.size > 0 || modoSeleccion) limpiarSeleccion();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [menuLote, fichaAbierta, seleccion, modoSeleccion, limpiarSeleccion]);

  const abrirConversacion = async (id: string) => {
    // La ventana se abre en el clic (antes de esperar a la API) para que el navegador no la bloquee; luego se le pone la dirección.
    const ventana = window.open("about:blank", "_blank");
    try {
      const d = await api.get<LeadDetalle>(`/api/leads/${id}`);
      const url = d.conversaciones.map((c) => urlDeConversacion(yo.configuracion.chatwoot_url_publica, c.chatwoot)).find((u) => u !== null);
      if (url && ventana) {
        ventana.opener = null;
        ventana.location.href = url;
        return;
      }
      ventana?.close();
      setProblema(url ? "El navegador no dejó abrir la conversación. Ábrela desde la ficha del lead." : `${d.nombre_contacto ?? "Este lead"} todavía no tiene una conversación en Chatwoot.`);
    } catch (e) {
      ventana?.close();
      setProblema(comoErrorDeApi(e).message);
    }
  };

  const alAccion = (id: string, tipo: TipoDeAccion) => {
    if (tipo === "agendar" || tipo === "cambiar-clase") return abrirAgendar(id, tipo === "cambiar-clase");
    const l = porLead.get(id);
    if (!l) return;
    // «Marcar como inscrito» (inscripción apagada) e «Inscribir a …» (encendida) son el mismo diálogo de inscribir: cuál se ve lo decide el módulo.
    setDialogo({ tipo: "inscribir", ids: [id], ...(etapaInscrito ? { destinoId: etapaInscrito.id } : {}) });
  };
  const alMoverTarjeta = (lead: LeadParaMover) => (escritorio && !tactil ? setMoviendo(lead) : setHoja(lead));

  // ─── Los diálogos ───
  // `MoverEtapa` (el selector de etapa) solo lo abre el botón «Mover de etapa» de la tarjeta o de la fila, con ratón; lo demás pasa por `soltar()` y sus diálogos propios.
  const leadsDelDialogo: LeadParaMover[] = (dialogo?.ids ?? []).flatMap((id) => {
    const l = porLead.get(id);
    return l ? [{ id, nombre: nombreDe(l), etapa_id: l.etapa_id }] : [];
  });
  const destinoDelDialogo = dialogo?.destinoId ? porEtapa.get(dialogo.destinoId) : undefined;
  const inscribiendoUno = dialogo?.tipo === "inscribir" && dialogo.ids.length === 1;
  const paraMarcar: LeadParaMover | null = inscribiendoUno && !moduloEncendido("inscripcion") ? (leadsDelDialogo[0] ?? null) : null;
  const cerrarDialogo = () => setDialogo(null);
  const alMoverConDialogo = (resultado?: ResultadoDeMover) => {
    recargar();
    if (!resultado) return;
    const destino = porEtapa.get(resultado.destinoId);
    setSeleccion(new Set());
    setModoSeleccion(false);
    if (destino) {
      revelar(destino.id);
      avisar(avisoDeMovimiento({ nombre: (leadsDelDialogo[0] ?? moviendo)?.nombre ?? "El lead", cantidad: resultado.cantidad, etapa: destino.nombre }));
    }
  };
  const cerrarMover = () => setMoviendo(null);
  const alMoverConSelector = (resultado?: ResultadoDeMover) => {
    recargar();
    if (!resultado) return;
    const destino = porEtapa.get(resultado.destinoId);
    if (destino) {
      revelar(destino.id);
      avisar(avisoDeMovimiento({ nombre: moviendo?.nombre ?? "El lead", cantidad: resultado.cantidad, etapa: destino.nombre }));
    }
  };
  const alInscribir = (i: InscripcionHecha) => {
    setDialogo(null);
    recargar();
    if (etapaInscrito) revelar(etapaInscrito.id);
    avisar(`${i.alumno} quedó inscrito${i.grupo ? ` en ${i.grupo}${i.horario ? ` (${i.horario})` : ""}` : ""}.`);
  };
  const alAgendar = (c: ClaseAgendada) => {
    setDialogo(null);
    recargar();
    avisar(`${c.reprogramada ? "Clase muestra cambiada" : "Clase muestra agendada"} para ${c.alumno}: ${c.sesion}.`);
  };
  // «Abrir la inscripción completa»: la conversión de siempre, para lo que no cabe en el diálogo (varios niños, el reglamento, datos que solo pide ella).
  const abrirInscripcionCompleta = (id: string) => {
    setDialogo(null);
    setFichaAbierta(null);
    void navegar(`/leads/${id}/convertir`);
  };

  const hayTablero = leads.datos && lista.length > 0 && visibles.length > 0;
  const textoSucursal = sucursalId ? nombreDeSucursal(sucursalId) : "";
  const fantasmaPrimero = arrastre ? porLead.get(arrastre.ids[0] ?? "") : undefined;
  const fantasmaDatos = fantasmaPrimero ? datosDeLead(fantasmaPrimero) : null;
  const motivosActivos = (motivos.datos ?? []).filter((m) => m.activo);
  const leadDeFicha = fichaAbierta ? porLead.get(fichaAbierta) : undefined;
  const etapaActivaMovil = lista.find((e) => e.id === etapaMovil) ?? lista[0];
  const enEtapaMovil = etapaActivaMovil ? visibles.filter((l) => l.etapa_id === etapaActivaMovil.id) : [];

  const tarjeta = (l: LeadResumen, movil: boolean) => {
    const d = datosDeLead(l);
    const etapa = porEtapa.get(l.etapa_id);
    return (
      <TarjetaDeLead
        key={l.id}
        datos={d}
        seleccionada={seleccionVigente.has(l.id)}
        arrastrada={arrastre?.ids.includes(l.id) ?? false}
        arrastrable={etapa ? !esEtapaDeInscrito(etapa) : true}
        movil={movil}
        modoSeleccion={modoSeleccion}
        alPresionar={alPresionar}
        esClicDeArrastre={esClicDeArrastre}
        alSeleccionar={alternarSeleccion}
        alAbrir={abrirFicha}
        alChat={(id) => void abrirConversacion(id)}
        alAccion={alAccion}
        alMover={alMoverTarjeta}
      />
    );
  };

  const indicadorEstancados = (
    <div className="indicador indicador-alerta" data-prueba="indicador-estancados">
      <div className="indicador-etiqueta">
        <Icono nombre="alerta" tamano={16} />
        Llevan días sin movimiento
      </div>
      <div className="indicador-cifra-accion">
        <span className="indicador-valor">{cuantosEstancados}</span>
        <button type="button" className="boton boton-sutil" disabled={!soloEstancados && cuantosEstancados === 0} onClick={() => setSoloEstancados(!soloEstancados)}>
          {soloEstancados ? "Ver todos" : "Ver solo estos"}
        </button>
      </div>
    </div>
  );

  return (
    <Pagina
      titulo="Embudo"
      subtitulo={leads.datos ? `${numeros.abiertos} ${numeros.abiertos === 1 ? "lead abierto" : "leads abiertos"} ${textoSucursal ? `en ${textoSucursal}` : "en todas tus sucursales"}` : undefined}
      acciones={
        // V7: la lista de leads para Excel (la misma que ve esta persona: respeta su sucursal y su alcance en el servidor).
        <>
          <CampoBusqueda etiqueta="Buscar lead" placeholder="Buscar por nombre o teléfono" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <a className="boton" href={`/api/exportaciones/leads${armarConsulta({ sucursal_id: sucursalId ?? undefined })}`} download data-prueba="descargar-leads">
            <Icono nombre="descargar" tamano={18} />
            Descargar lista (CSV para Excel)
          </a>
        </>
      }
    >
      <AvisoDePrimerosPasos />
      {error ? <ErrorDeCarga error={error} alReintentar={() => { etapas.recargar(); leads.recargar(); }} /> : null}
      {problema ? (
        <Aviso tono="alerta">
          <span className="fila">
            {problema}
            <Boton variante="fantasma" onClick={() => setProblema(null)}>
              Entendido
            </Boton>
          </span>
        </Aviso>
      ) : null}
      {leads.datos ? (
        <div className="indicadores" data-prueba="indicadores-embudo">
          <div className="indicador indicador-principal">
            <div>Leads abiertos</div>
            <div className="indicador-cifra">
              <span className="indicador-valor">{numeros.abiertos}</span>
              <span className="indicador-nota">{numeros.inscritos} {numeros.inscritos === 1 ? "inscrito" : "inscritos"}</span>
            </div>
          </div>
          {numeros.nuevos !== null ? (
            <div className="indicador">
              <div>Nuevos sin contactar</div>
              <div className="indicador-valor">{numeros.nuevos}</div>
            </div>
          ) : null}
          {numeros.clasesAgendadas !== null ? (
            <div className="indicador">
              <div>Clases muestra agendadas</div>
              <div className="indicador-valor">{numeros.clasesAgendadas}</div>
            </div>
          ) : null}
          {indicadorEstancados}
        </div>
      ) : null}
      <div className="filtros filtros-embudo">
        <div className="filtros-izquierda">
          {disciplinas.length > 0 ? (
            <div className="embudo-pildoras" role="group" aria-label="Disciplina">
              <button type="button" className="pildora-filtro" aria-pressed={disciplina === ""} onClick={() => setDisciplina("")}>
                Todas
                <span className="pildora-filtro-cuenta">{numeros.abiertos}</span>
              </button>
              {disciplinas.map((v) => (
                <PildoraDeDisciplina key={v.id} nombre={v.nombre} color={v.color_marca} cuenta={todos.filter((l) => l.vertical_interes_id === v.id && !cierra(l)).length} activa={disciplina === v.id} alElegir={() => setDisciplina(disciplina === v.id ? "" : v.id)} />
              ))}
            </div>
          ) : null}
          <CampoSelect etiqueta="Fuente" vacio="Todas las fuentes" value={fuente} onChange={(e) => setFuente(e.target.value)} opciones={fuentes.map((f) => ({ valor: f, texto: FUENTES[f] ?? f }))} />
          <CampoCasilla etiqueta="Solo estancados" checked={soloEstancados} onChange={(e) => setSoloEstancados(e.target.checked)} />
        </div>
        {escritorio ? <Pestanas segmentada nombre="embudo" etiqueta="Vista del embudo" pestanas={[{ id: "tablero", texto: "Tablero" }, { id: "lista", texto: "Lista" }] as const} activa={vista} alCambiar={setVista} /> : null}
      </div>
      {leads.datos?.truncado ? <Aviso tono="info">Se muestran los primeros {todos.length} de {leads.datos.total} leads. Filtra por sucursal para ver el resto.</Aviso> : null}
      {(leads.cargando && !leads.datos) || (etapas.cargando && !etapas.datos) ? <Cargando texto="Cargando el embudo…" /> : null}
      {etapas.datos && lista.length === 0 && !etapas.error ? (
        <Vacio icono="embudo" titulo="Todavía no hay etapas en el embudo">
          Pídele a quien administra el sistema que configure las etapas en Administración.
        </Vacio>
      ) : null}
      {leads.datos && lista.length > 0 && visibles.length === 0 ? (
        todos.length === 0 ? (
          <Vacio icono="embudo" titulo="Todavía no hay leads">
            Cuando una familia escriba por WhatsApp o llene la página de captación, aparecerá aquí.
          </Vacio>
        ) : (
          <Vacio icono="buscar" titulo="No hay leads con estos filtros">
            <p>Borra la búsqueda, quita «Solo estancados» o elige «Todas las fuentes» para ver más.</p>
            {filtrando ? <Boton onClick={limpiarFiltros}>Quitar filtros</Boton> : null}
          </Vacio>
        )
      ) : null}

      {/* Celular: píldoras de etapa y la lista de la etapa elegida (sin tablero ni arrastre). */}
      {!escritorio && hayTablero && etapaActivaMovil ? (
        <div className="embudo-movil">
          <div className="etapas-movil" role="group" aria-label="Etapas">
            {lista.map((e) => (
              <button key={e.id} type="button" className="pildora-filtro" aria-pressed={e.id === etapaActivaMovil.id} onClick={() => setEtapaMovil(e.id)}>
                {e.nombre}
                <span className="pildora-filtro-cuenta">{visibles.filter((l) => l.etapa_id === e.id).length}</span>
              </button>
            ))}
          </div>
          <div className="embudo-movil-cabecera">
            <h2>{etapaActivaMovil.nombre}</h2>
            <Boton aria-pressed={modoSeleccion} className="boton-seleccionar" onClick={() => (modoSeleccion ? limpiarSeleccion() : setModoSeleccion(true))}>
              {modoSeleccion ? "Listo" : "Seleccionar"}
            </Boton>
          </div>
          <section data-prueba={`columna-${etapaActivaMovil.id}`} aria-label={etapaActivaMovil.nombre}>
            <ul className="lista-tarjetas">{enEtapaMovil.map((l) => tarjeta(l, true))}</ul>
            {enEtapaMovil.length === 0 ? <div className="columna-vacia">{etapaActivaMovil.nombre}: no hay leads con estos filtros.</div> : null}
          </section>
        </div>
      ) : null}

      {escritorio ? (
        <div {...propsDePanel("embudo", vista)}>
          {hayTablero && vista === "tablero" ? (
            <div className="tablero" ref={tablero} data-arrastrando={arrastre ? "" : undefined}>
              {lista.map((e) => {
                const enEtapa = visibles.filter((l) => l.etapa_id === e.id);
                return (
                  <ColumnaDeEtapa key={e.id} etapa={e} total={enEtapa.length} estancados={esDeCierre(e) ? 0 : enEtapa.filter((l) => estancados.datos?.has(l.id)).length} plegada={estaPlegada(e, plegadas, reveladas)} esDestino={arrastre?.sobre === e.id} alPlegar={alPlegar}>
                    {enEtapa.length > 0 ? <ul className="lista-tarjetas">{enEtapa.map((l) => tarjeta(l, false))}</ul> : null}
                  </ColumnaDeEtapa>
                );
              })}
            </div>
          ) : null}
          {hayTablero && vista === "lista" ? (
            <div className="tabla-scroll tabla-apilada">
              <table className="tabla tabla-leads">
                <thead>
                  <tr>
                    <th>
                      <span className="solo-lectores">Seleccionar</span>
                    </th>
                    <th>Contacto</th>
                    <th>Interés</th>
                    <th>Etapa</th>
                    <th>Fuente</th>
                    <th>Sucursal</th>
                    <th>Último movimiento</th>
                    <th>
                      <span className="solo-lectores">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((l) => (
                    <FilaDeLead
                      key={l.id}
                      d={datosDeLead(l)}
                      etapa={porEtapa.get(l.etapa_id)}
                      seleccionada={seleccionVigente.has(l.id)}
                      alSeleccionar={alternarSeleccion}
                      alChat={hayChat ? (id) => void abrirConversacion(id) : null}
                      alMarcar={puedeMarcar(l) ? (lead) => setDialogo({ tipo: "inscribir", ids: [lead.id], ...(etapaInscrito ? { destinoId: etapaInscrito.id } : {}) }) : null}
                      alMover={setMoviendo}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {idsSeleccionados.length > 0 && !hayDialogoAbierto ? <BarraDeSeleccion cantidad={idsSeleccionados.length} etapas={lista} menuAbierto={menuLote} alCambiarMenu={setMenuLote} alMover={(etapaId) => soltar(idsSeleccionados, etapaId)} alQuitar={limpiarSeleccion} /> : null}
      {arrastre && fantasmaDatos ? <FantasmaDeArrastre referencia={fantasma} cantidad={arrastre.ids.length} nombre={fantasmaDatos.nombre} nota={fantasmaDatos.nino ?? fantasmaDatos.disciplina?.nombre ?? ""} color={fantasmaDatos.disciplina?.color ?? null} /> : null}

      <MarcarInscrito lead={paraMarcar} etapas={lista} abierto={paraMarcar !== null} alCerrar={cerrarDialogo} alMarcar={(hecho) => { recargar(); setSeleccion(new Set()); if (etapaInscrito) revelar(etapaInscrito.id); if (hecho && paraMarcar) avisar(`${paraMarcar.nombre} quedó como inscrito.`); }} />
      <MoverEtapa key={moviendo?.id ?? "ninguno"} lead={moviendo} etapas={lista} motivos={motivosActivos} abierto={moviendo !== null} alCerrar={cerrarMover} alMover={alMoverConSelector} />
      {dialogo?.tipo === "perdido" ? <DialogoPerdido key={`perdido|${dialogo.ids.join(",")}`} leads={leadsDelDialogo} destino={destinoDelDialogo} etapas={lista} motivos={motivosActivos} abierto alCerrar={cerrarDialogo} alMover={alMoverConDialogo} /> : null}
      {dialogo?.tipo === "recuperar" ? <DialogoRecuperar key={`recuperar|${dialogo.ids.join(",")}|${dialogo.destinoId ?? ""}`} leads={leadsDelDialogo} destino={destinoDelDialogo} etapas={lista} abierto alCerrar={cerrarDialogo} alMover={alMoverConDialogo} /> : null}
      <InscribirEnTresPasos
        leadId={inscribiendoUno && moduloEncendido("inscripcion") ? (dialogo.ids[0] ?? null) : null}
        abierto={inscribiendoUno && moduloEncendido("inscripcion")}
        alCerrar={(hayQueRecargar) => { cerrarDialogo(); if (hayQueRecargar) recargar(); }}
        alInscrito={alInscribir}
        alAbrirCompleta={abrirInscripcionCompleta}
      />
      <InscribirDeUnoEnUno nombres={leadsDelDialogo.map((l) => l.nombre)} abierto={dialogo?.tipo === "inscribir" && dialogo.ids.length > 1} alCerrar={cerrarDialogo} />
      <DialogoAgendar leadId={dialogo?.tipo === "agendar" ? (dialogo.ids[0] ?? null) : null} reprogramar={dialogo?.reprogramar === true} abierto={dialogo?.tipo === "agendar"} alCerrar={cerrarDialogo} alAgendar={alAgendar} />
      <HojaMoverA lead={hoja} etapas={lista} alCerrar={() => setHoja(null)} alElegir={(leadId, etapaId) => { setHoja(null); soltar([leadId], etapaId); }} />
      <FichaLateral
        leadId={fichaAbierta}
        nombre={leadDeFicha ? nombreDe(leadDeFicha) : ""}
        etapas={lista}
        disciplinas={disciplinasPorId}
        estancadoDias={leadDeFicha && !cierra(leadDeFicha) ? (estancados.datos?.get(leadDeFicha.id)?.dias_sin_movimiento ?? null) : null}
        version={version}
        hayChat={hayChat}
        permisos={{ inscripcionEncendida: moduloEncendido("inscripcion"), puedeInscribir, puedeAgendar, puedeVerExpediente: moduloEncendido("inscripcion") && puede("alumnos:leer"), puedeLeerClases: clasesVisibles, puedeLeerTareas: puede("tareas:leer") }}
        alCerrar={cerrarFicha}
        alChat={(id) => void abrirConversacion(id)}
        alAccion={(id, accion) => {
          if (accion === "recuperar") {
            const destino = etapaDeRecuperacion(lista);
            if (destino) soltar([id], destino.id);
            else avisar("La escuela no tiene una etapa abierta a la que recuperarlo.");
            return;
          }
          alAccion(id, accion);
        }}
        alMover={(id, etapaId) => soltar([id], etapaId)}
      />
    </Pagina>
  );
}
