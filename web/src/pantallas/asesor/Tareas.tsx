// Tareas para el asesor (R5a, README «Tareas»): lo que el sistema no pudo resolver solo y necesita que una persona decida. Pendientes y resueltas con su conteo, el filtro por tipo en un panel
// lateral (un select en celular), una tarjeta por tarea con el ícono de su tono, «Atiéndela hoy» en las urgentes, el botón propio de cada tipo y «Descartar».

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Tarea } from "../../api/tipos.ts";
import { TIPOS_DE_TAREA, tipoDeTarea, tiposDeTareaVisibles } from "../../lib/etiquetas.ts";
import { formatearInstante } from "../../lib/fechas.ts";
import { useSesion, useYo } from "../../sesion/SesionContext.tsx";
import { Boton, Cargando, EnlaceBoton, ErrorDeAccion, ErrorDeCarga, Pagina as Marco, Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { useEscritorio } from "../../ui/useEscritorio.ts";
import { Pestanas, propsDePanel } from "../../ui/Pestanas.tsx";
import { ACCION_POR_OMISION, accionDeTarea, conteoPorTipo, esUrgente, haceCuanto, ICONO_DE_TONO, tonoDeTarea } from "./tareas-vista.ts";

/** «Hace 25 min», o la fecha completa si pasó más de un mes. */
const cuandoDe = (iso: string | null): string => (iso ? (haceCuanto(iso) ?? formatearInstante(iso)) : "");

/**
 * Una tarea. `lista` (la pantalla Tareas): tarjeta con ícono de tono, familia, texto y botones. `ficha` (la ficha del lead): el mismo contenido en el recuadro del tono de su tipo, más compacto.
 * `alCambiar` recarga la lista que la contiene. El botón de resolver dice lo que el tipo pide («Ya lo contacté»); su nombre accesible sigue siendo «Marcar como hecha: …».
 */
export function TarjetaDeTarea({ tarea, alCambiar, conEnlaceAlLead = true, variante = "lista" }: { tarea: Tarea; alCambiar: () => void; conEnlaceAlLead?: boolean; variante?: "lista" | "ficha" }) {
  const { puede } = useSesion();
  const accion = useAccion();
  const tipo = tipoDeTarea(tarea.tipo);
  const tono = tonoDeTarea(tarea.tipo);
  const pendiente = tarea.estado === "pendiente";
  const puedeResolver = pendiente && puede("tareas:resolver");
  const textoAccion = accionDeTarea(tarea.tipo);
  const resolver = (estado: "hecha" | "descartada") =>
    void accion.ejecutar(async () => {
      await api.patch(`/api/tareas/${tarea.id}`, { estado });
      alCambiar();
    });
  const nombre = tarea.lead?.nombre_contacto ?? "Sin nombre";
  // «Inscribir» lleva a la inscripción (que al terminar cierra esta tarea sola); cerrarla sin inscribir sigue siendo «Marcar como hecha».
  const llevaAInscribir = tarea.tipo === "listo_para_cerrar" && tarea.lead_id !== null && puede("conversion:ejecutar") && puede("leads:escribir");

  const familia =
    conEnlaceAlLead && tarea.lead ? (
      tarea.lead_id ? (
        <Link className="tarea-familia" to={`/leads/${tarea.lead_id}`} aria-label={`Abrir la ficha de ${nombre}`} data-prueba="familia-de-la-tarea">
          <strong>{nombre}</strong>
          {tarea.lead.telefono ? <span className="tarea-telefono numero"> · {tarea.lead.telefono}</span> : null}
        </Link>
      ) : (
        <p className="tarea-familia" data-prueba="familia-de-la-tarea">
          <strong>{nombre}</strong>
          {tarea.lead.telefono ? <span className="tarea-telefono numero"> · {tarea.lead.telefono}</span> : null}
        </p>
      )
    ) : null;

  const botones = (
    <>
      {puedeResolver ? (
        <div className="tarea-acciones">
          {llevaAInscribir ? (
            <>
              <EnlaceBoton variante="sutil" to={`/leads/${tarea.lead_id ?? ""}/convertir`}>
                {textoAccion}
              </EnlaceBoton>
              <Boton cargando={accion.ocupado} onClick={() => resolver("hecha")}>
                {ACCION_POR_OMISION}
              </Boton>
            </>
          ) : (
            <Boton variante="sutil" cargando={accion.ocupado} onClick={() => resolver("hecha")} aria-label={textoAccion === ACCION_POR_OMISION ? undefined : `${ACCION_POR_OMISION}: ${textoAccion}`}>
              {textoAccion}
            </Boton>
          )}
          <Boton disabled={accion.ocupado} onClick={() => resolver("descartada")}>
            Descartar
          </Boton>
        </div>
      ) : null}
      <ErrorDeAccion error={accion.error} />
    </>
  );

  if (variante === "ficha") {
    return (
      <li className="tarea-ficha" data-tono={tono} data-prueba={`tarea-${tarea.id}`}>
        <span className="tarea-ficha-icono" aria-hidden="true">
          <Icono nombre={ICONO_DE_TONO[tono]} tamano={18} />
        </span>
        <div className="tarea-ficha-cuerpo">
          <strong className="tarea-titulo">{tipo.titulo}</strong>
          <p>{tarea.descripcion}</p>
          {tarea.vence_en ? <p className="dato-chico tarea-vence">Vence: {formatearInstante(tarea.vence_en)}</p> : null}
          {botones}
        </div>
      </li>
    );
  }

  return (
    <li className="tarea-tarjeta" data-tono={tono} data-prueba={`tarea-${tarea.id}`}>
      <span className="tarea-icono" aria-hidden="true">
        <Icono nombre={ICONO_DE_TONO[tono]} tamano={20} />
      </span>
      <div className="tarea-cuerpo">
        <div className="tarea-encabezado">
          <div className="tarea-titulo-fila">
            <strong className="tarea-titulo">{tipo.titulo}</strong>
            {pendiente && esUrgente(tarea.tipo) ? <span className="tarea-urgente">Atiéndela hoy</span> : null}
          </div>
          <span className="tarea-cuando">{cuandoDe(tarea.estado === "pendiente" ? tarea.creado_en : (tarea.resuelta_en ?? tarea.creado_en))}</span>
        </div>
        {familia}
        <p className="tarea-texto">{tarea.descripcion}</p>
        {/* El código de error ya viene dicho en el texto de la tarea cuando nace de un mensaje no entregado: no se repite. */}
        {tarea.codigo_error !== null && !tarea.descripcion.includes(String(tarea.codigo_error)) ? <p className="muted dato-chico">Código que reportó WhatsApp: {tarea.codigo_error}</p> : null}
        {pendiente && tarea.vence_en ? <p className="muted dato-chico tarea-vence">Vence: {formatearInstante(tarea.vence_en)}</p> : null}
        {botones}
        {!pendiente ? (
          <p className="tarea-cierre" data-estado={tarea.estado}>
            <Icono nombre="exito" tamano={16} />
            {tarea.estado === "hecha" ? "Hecha" : "Descartada"}
            {tarea.resuelta_en ? ` · ${formatearInstante(tarea.resuelta_en)}` : ""}
          </p>
        ) : null}
      </div>
    </li>
  );
}

type Estado = "pendiente" | "resueltas";

export default function Tareas() {
  useTitulo("Tareas");
  const escritorio = useEscritorio();
  const [estado, setEstado] = useState<Estado>("pendiente");
  const [tipoElegido, setTipoElegido] = useState("");
  const { tipos_de_tarea_apagados: apagados } = useYo();
  const carga = useCarga(
    async (senal) => {
      // «Resueltas» junta hechas y descartadas (la API filtra por un estado a la vez).
      const pedir = (e: string) => api.get<Pagina<Tarea>>("/api/tareas", { estado: e, limite: 100 }, senal);
      if (estado === "pendiente") return (await pedir("pendiente")).datos;
      const [hechas, descartadas] = await Promise.all([pedir("hecha"), pedir("descartada")]);
      return [...hechas.datos, ...descartadas.datos].sort((a, b) => (b.resuelta_en ?? "").localeCompare(a.resuelta_en ?? ""));
    },
    [estado],
  );
  // Los números de las dos pestañas (una petición de un solo registro por estado: solo importa el total). Si fallan, las pestañas van sin número.
  const totales = useCarga(async (senal) => {
    const total = async (e: string) => (await api.get<Pagina<Tarea>>("/api/tareas", { estado: e, limite: 1 }, senal)).paginacion.total;
    const [pendientes, hechas, descartadas] = await Promise.all([total("pendiente"), total("hecha"), total("descartada")]);
    return { pendientes, resueltas: hechas + descartadas };
  }, []);
  const alCambiar = () => {
    carga.recargar();
    totales.recargar();
  };

  const lista = carga.datos ?? [];
  const orden = tiposDeTareaVisibles(apagados).map(([valor]) => valor);
  const porTipo = conteoPorTipo(lista, orden);
  // Si ya no queda ninguna tarea del tipo elegido (se resolvieron), el filtro vuelve a «Todas».
  const tipo = porTipo.some((t) => t.tipo === tipoElegido) ? tipoElegido : "";
  const visibles = tipo === "" ? lista : lista.filter((t) => t.tipo === tipo);
  const opcionesDeTipo = [{ tipo: "", nombre: "Todas", cuenta: lista.length }, ...porTipo.map((t) => ({ tipo: t.tipo, nombre: TIPOS_DE_TAREA[t.tipo]?.titulo ?? tipoDeTarea(t.tipo).titulo, cuenta: t.cuenta }))];
  const cambiarEstado = (e: Estado) => {
    setEstado(e);
    setTipoElegido("");
  };
  const numero = (n: number | undefined) => (n === undefined ? null : <span className="pestana-cuenta">{n}</span>);

  return (
    <Marco
      titulo="Tareas"
      subtitulo="Lo que el sistema no pudo resolver solo y necesita que una persona decida."
      acciones={
        <Pestanas
          nombre="tareas"
          etiqueta="Estado de las tareas"
          segmentada
          pestanas={
            [
              { id: "pendiente", texto: <>Pendientes {numero(totales.datos?.pendientes)}</> },
              { id: "resueltas", texto: <>Resueltas {numero(totales.datos?.resueltas)}</> },
            ] as const
          }
          activa={estado}
          alCambiar={cambiarEstado}
        />
      }
    >
      <div {...propsDePanel("tareas", estado)} className="tareas-panel">
        {escritorio && lista.length > 0 ? (
          <aside className="tareas-tipos" aria-label="Filtrar por tipo">
            <div className="tareas-tipos-rotulo">Por tipo</div>
            {opcionesDeTipo.map((t) => (
              <button key={t.tipo} type="button" className="tareas-tipo" aria-pressed={tipo === t.tipo} data-tono={t.tipo === "" ? undefined : tonoDeTarea(t.tipo)} onClick={() => setTipoElegido(t.tipo)}>
                <span className="tareas-tipo-punto" aria-hidden="true" />
                <span className="tareas-tipo-nombre">{t.nombre}</span>
                <span className="tareas-tipo-cuenta">{t.cuenta}</span>
              </button>
            ))}
          </aside>
        ) : null}
        <div className="tareas-lista-marco">
          {!escritorio && lista.length > 0 ? (
            <div className="campo">
              <label htmlFor="tipo-de-tarea">Tipo de tarea</label>
              <select id="tipo-de-tarea" value={tipo} onChange={(e) => setTipoElegido(e.target.value)}>
                {opcionesDeTipo.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.nombre} ({t.cuenta})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
          {carga.cargando && !carga.datos ? <Cargando /> : null}
          {carga.datos && lista.length === 0 ? (
            <Vacio icono="tareas" titulo={estado === "pendiente" ? "No tienes tareas pendientes" : "Todavía no hay tareas resueltas"}>
              {estado === "pendiente" ? "Cuando el sistema necesite que alguien decida, aparecerá aquí." : "Lo que resuelvas o descartes queda aquí."}
            </Vacio>
          ) : null}
          <ul className="tareas-lista">
            {visibles.map((t) => (
              <TarjetaDeTarea key={t.id} tarea={t} alCambiar={alCambiar} />
            ))}
          </ul>
        </div>
      </div>
    </Marco>
  );
}
