// Tareas para el asesor: lo que el sistema no pudo resolver solo. Pendientes y resueltas, por tipo (con su descripción), resolver o descartar.

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Tarea } from "../../api/tipos.ts";
import { tipoDeTarea, tiposDeTareaVisibles } from "../../lib/etiquetas.ts";
import { formatearInstante } from "../../lib/fechas.ts";
import { useSesion, useYo } from "../../sesion/SesionContext.tsx";
import { Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina as Marco, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect } from "../../ui/campos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Pestanas, propsDePanel } from "../../ui/Pestanas.tsx";

/** Una tarea con su tipo explicado y, si está pendiente, sus botones. `alCambiar` recarga la lista que la contiene. */
export function TarjetaDeTarea({ tarea, alCambiar, conEnlaceAlLead = true }: { tarea: Tarea; alCambiar: () => void; conEnlaceAlLead?: boolean }) {
  const { puede } = useSesion();
  const accion = useAccion();
  const tipo = tipoDeTarea(tarea.tipo);
  const resolver = (estado: "hecha" | "descartada") =>
    void accion.ejecutar(async () => {
      await api.patch(`/api/tareas/${tarea.id}`, { estado });
      alCambiar();
    });
  return (
    <li className="pila tarea" data-prueba={`tarea-${tarea.id}`}>
      <div className="fila fila-entre">
        <strong className="tarea-titulo">{tipo.titulo}</strong>
        <Insignia tono={tarea.estado === "pendiente" ? "alerta" : tarea.estado === "hecha" ? "exito" : "neutro"}>{tarea.estado === "pendiente" ? "Pendiente" : tarea.estado === "hecha" ? "Hecha" : "Descartada"}</Insignia>
      </div>
      {/* V7: de qué familia es. Sin esto, una lista de tareas no dice a quién hay que llamar. */}
      {conEnlaceAlLead && tarea.lead ? (
        <p className="tarea-familia" data-prueba="familia-de-la-tarea">
          <strong>{tarea.lead.nombre_contacto ?? "Sin nombre"}</strong>
          {tarea.lead.telefono ? <span className="muted numero"> · {tarea.lead.telefono}</span> : null}
        </p>
      ) : null}
      {tipo.ayuda ? <p className="muted tarea-ayuda">{tipo.ayuda}</p> : null}
      <p>{tarea.descripcion}</p>
      {/* El código de error ya viene dicho en el texto de la tarea cuando nace de un mensaje no entregado: no se repite. */}
      {tarea.codigo_error !== null && !tarea.descripcion.includes(String(tarea.codigo_error)) ? <p className="muted dato-chico">Código que reportó WhatsApp: {tarea.codigo_error}</p> : null}
      <p className="muted dato-chico numero">
        Creada: {formatearInstante(tarea.creado_en)}
        {tarea.vence_en ? ` · Vence: ${formatearInstante(tarea.vence_en)}` : ""}
        {tarea.resuelta_en ? ` · Resuelta: ${formatearInstante(tarea.resuelta_en)}` : ""}
      </p>
      <div className="tarea-acciones">
        <span className="fila">
          {tarea.estado === "pendiente" && puede("tareas:resolver") ? (
            <Boton variante="sutil" cargando={accion.ocupado} onClick={() => resolver("hecha")}>
              Marcar como hecha
            </Boton>
          ) : null}
        </span>
        <span className="fila fila-fin tarea-iconos">
          {conEnlaceAlLead && tarea.lead_id ? (
            <Link className="boton boton-icono" to={`/leads/${tarea.lead_id}`} aria-label="Abrir la ficha" title="Abrir la ficha">
              <Icono nombre="siguiente" />
            </Link>
          ) : null}
          {tarea.estado === "pendiente" && puede("tareas:resolver") ? (
            <button type="button" className="boton boton-icono" aria-label="Descartar" title="Descartar" disabled={accion.ocupado} onClick={() => resolver("descartada")}>
              <Icono nombre="cerrar" />
            </button>
          ) : null}
        </span>
      </div>
      <ErrorDeAccion error={accion.error} />
    </li>
  );
}

export default function Tareas() {
  useTitulo("Tareas");
  const [estado, setEstado] = useState<"pendiente" | "resueltas">("pendiente");
  const [tipo, setTipo] = useState("");
  const { tipos_de_tarea_apagados: apagados } = useYo();
  const carga = useCarga(
    async (senal) => {
      // «Resueltas» junta hechas y descartadas (la API filtra por un estado a la vez).
      const pedir = (e: string) => api.get<Pagina<Tarea>>("/api/tareas", { estado: e, ...(tipo ? { tipo } : {}), limite: 50 }, senal);
      if (estado === "pendiente") return (await pedir("pendiente")).datos;
      const [hechas, descartadas] = await Promise.all([pedir("hecha"), pedir("descartada")]);
      return [...hechas.datos, ...descartadas.datos].sort((a, b) => (b.resuelta_en ?? "").localeCompare(a.resuelta_en ?? ""));
    },
    [estado, tipo],
  );

  return (
    <Marco titulo="Tareas" subtitulo="Lo que el sistema dejó para una persona">
      <Pestanas nombre="tareas" etiqueta="Estado de las tareas" pestanas={[{ id: "pendiente", texto: "Pendientes" }, { id: "resueltas", texto: "Resueltas" }] as const} activa={estado} alCambiar={setEstado} />
      <div {...propsDePanel("tareas", estado)} className="pila">
      <div className="filtros">
        <CampoSelect etiqueta="Tipo de tarea" vacio="Todos los tipos" value={tipo} onChange={(e) => setTipo(e.target.value)} opciones={tiposDeTareaVisibles(apagados).map(([valor, t]) => ({ valor, texto: t.titulo }))} />
      </div>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos && carga.datos.length === 0 ? tipo ? (
        <Vacio icono="buscar" titulo={estado === "pendiente" ? "No hay tareas pendientes de este tipo" : "No hay tareas resueltas de este tipo"}>
          Elige «Todos los tipos» en el filtro para ver las demás.
        </Vacio>
      ) : (
        <Vacio icono="tareas" titulo={estado === "pendiente" ? "No hay tareas pendientes" : "Todavía no hay tareas resueltas"}>
          {estado === "pendiente" ? "Cuando el sistema deje algo para una persona, aparecerá aquí." : "Las que marques como hechas o descartes pasan a esta lista."}
        </Vacio>
      ) : null}
      <ul className="lista-tarjetas">
        {(carga.datos ?? []).map((t) => (
          <TarjetaDeTarea key={t.id} tarea={t} alCambiar={carga.recargar} />
        ))}
      </ul>
      </div>
    </Marco>
  );
}
