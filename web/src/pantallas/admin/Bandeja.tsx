// La bandeja del administrador: lo que el sistema no pudo procesar. Los eventos inesperados (un webhook o la landing con datos raros: nunca llevan el contenido, solo su
// forma y el error saneado) y las tareas que no se pudieron atar a ningún lead. Se resuelven con la tarea; el evento queda como constancia.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import type { Tarea } from "../../api/tipos.ts";
import { formatearInstante } from "../../lib/fechas.ts";
import { tipoDeTarea } from "../../lib/etiquetas.ts";
import { Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla } from "../../ui/campos.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { Regreso } from "./comunes.tsx";
import { CAUSAS, ORIGENES } from "./mensajeria.ts";

interface EventoInesperado {
  id: string;
  origen: string;
  causa: string;
  detalle: string;
  intentos: number;
  tarea_id: string | null;
  creado_en: string;
  tarea: { estado: string } | null;
}

export default function Bandeja() {
  useTitulo("Bandeja del administrador");
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [pagina, setPagina] = useState(1);
  const eventos = useCarga((senal) => api.get<Pag<EventoInesperado>>("/api/eventos-inesperados", { ...(soloPendientes ? { pendientes: true } : {}), limite: 25, pagina }, senal), [soloPendientes, pagina]);
  const tareas = useCarga((senal) => api.get<Pag<Tarea>>("/api/tareas", { sin_lead: true, estado: "pendiente", limite: 50 }, senal), []);
  const resolver = useAccion();
  const marcar = (id: string, estado: "hecha" | "descartada") =>
    void resolver.ejecutar(async () => {
      await api.patch(`/api/tareas/${id}`, { estado });
      eventos.recargar();
      tareas.recargar();
    });
  return (
    <Pagina titulo="Bandeja del administrador" subtitulo="Lo que llegó raro y el sistema no pudo atender solo." acciones={<Regreso />}>
      <ErrorDeAccion error={resolver.error} />
      <Tarjeta titulo="Tareas sin lead">
        <p className="muted">Tareas que no se pudieron ligar a ningún lead; solo las ves tú.</p>
        {tareas.error ? <ErrorDeCarga error={tareas.error} alReintentar={tareas.recargar} /> : null}
        {tareas.cargando && !tareas.datos ? <Cargando /> : null}
        {tareas.datos && tareas.datos.datos.length === 0 ? <Vacio titulo="No hay tareas sin lead pendientes" /> : null}
        <ul className="lista-tarjetas" data-prueba="tareas-sin-lead">
          {(tareas.datos?.datos ?? []).map((t) => (
            <li key={t.id} className="pila" data-prueba={`tarea-${t.id}`}>
              <strong>{tipoDeTarea(t.tipo).titulo}</strong>
              <span>{t.descripcion}</span>
              <span className="muted">{formatearInstante(t.creado_en)}</span>
              <div className="fila">
                <Boton variante="primario" disabled={resolver.ocupado} onClick={() => marcar(t.id, "hecha")}>Marcar hecha</Boton>
                <Boton disabled={resolver.ocupado} onClick={() => marcar(t.id, "descartada")}>Descartar</Boton>
              </div>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta titulo="Eventos inesperados">
        <CampoCasilla etiqueta="Solo los que tienen una tarea pendiente" checked={soloPendientes} onChange={(e) => { setPagina(1); setSoloPendientes(e.target.checked); }} />
        {eventos.error ? <ErrorDeCarga error={eventos.error} alReintentar={eventos.recargar} /> : null}
        {eventos.cargando && !eventos.datos ? <Cargando /> : null}
        {eventos.datos && eventos.datos.datos.length === 0 ? <Vacio titulo="No hay eventos inesperados" /> : null}
        <ul className="lista-tarjetas" data-prueba="eventos-inesperados">
          {(eventos.datos?.datos ?? []).map((ev) => (
            <li key={ev.id} className="pila" data-prueba={`evento-${ev.id}`}>
              <div className="fila fila-entre">
                <strong>{ORIGENES[ev.origen] ?? ev.origen}</strong>
                <span className="fila">
                  {ev.intentos > 1 ? <Insignia>{ev.intentos} veces</Insignia> : null}
                  {ev.tarea ? <Insignia tono={ev.tarea.estado === "pendiente" ? "alerta" : "exito"}>{ev.tarea.estado === "pendiente" ? "Tarea pendiente" : "Atendido"}</Insignia> : <Insignia>Sin tarea</Insignia>}
                </span>
              </div>
              <span>{CAUSAS[ev.causa] ?? ev.causa}</span>
              <span className="muted">
                {ev.detalle} · {formatearInstante(ev.creado_en)}
              </span>
              {ev.tarea_id && ev.tarea?.estado === "pendiente" ? (
                <div className="fila">
                  <Boton variante="primario" disabled={resolver.ocupado} onClick={() => marcar(ev.tarea_id!, "hecha")}>Marcar atendido</Boton>
                  <Boton disabled={resolver.ocupado} onClick={() => marcar(ev.tarea_id!, "descartada")}>Descartar</Boton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {eventos.datos ? <Paginador pagina={eventos.datos.paginacion.pagina} limite={eventos.datos.paginacion.limite} total={eventos.datos.paginacion.total} alCambiar={setPagina} /> : null}
      </Tarjeta>
    </Pagina>
  );
}
