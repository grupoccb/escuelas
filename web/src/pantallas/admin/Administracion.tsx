// El inicio de Administración (R7a): por dónde empezar (el panel «Para empezar» con los primeros pasos de una escuela nueva, calculados contra el estado real), un buscador para llegar a
// una pantalla sin recorrer la lista y el menú de cada área que se edita sin tocar código. Se muestra lo que el rol puede administrar (por permisos, no por rol).

import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { coincide } from "../../lib/texto.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { EnlaceBoton, Pagina } from "../../ui/basicos.tsx";
import { CampoBusqueda } from "../../ui/campos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { filtrarAreas, GRUPOS_DE_ADMINISTRACION } from "./areas.ts";
import type { PrimerosPasos } from "./tipos.ts";

export { GRUPOS_DE_ADMINISTRACION };

/** El nombre corto de la pantalla a la que lleva una ruta («Disciplinas»), de `areas.ts`; sin él, el título del paso. */
const nombreDeLaRuta = (ruta: string, respaldo: string): string => GRUPOS_DE_ADMINISTRACION.flatMap((g) => g.areas).find((a) => a.ruta === ruta)?.titulo ?? respaldo;

/**
 * «Para empezar» (README «Administración»): el panel oscuro con «N de 8 pasos hechos», la barra, lo que sigue y los ocho pasos como fichas. Si todo está listo se pliega a una línea
 * (y se puede volver a abrir): los pasos viven en un `<details>`, abierto mientras falte algo.
 */
export function PasosIniciales({ datos }: { datos: PrimerosPasos }) {
  // Con 0 pasos (no pasa con datos reales: siempre son 8) no se dice que la escuela está lista ni se llena la barra.
  const listo = datos.siguiente === null && datos.total > 0;
  const siguiente = datos.pasos.find((p) => p.id === datos.siguiente);
  return (
    <section className="paso-panel" aria-label="Para empezar" data-prueba="primeros-pasos">
      <div className="paso-panel-resumen">
        <span className="paso-panel-etiqueta">Para empezar</span>
        {listo ? (
          <>
            <span className="paso-panel-cifra">Tu escuela está lista</span>
            <progress className="paso-panel-barra" max={datos.total} value={datos.hechos} aria-label="Pasos hechos" />
            <p>Los {datos.total} pasos están hechos. Cualquier cambio de aquí en adelante se hace desde las pantallas de abajo.</p>
          </>
        ) : datos.total === 0 ? (
          <span className="paso-panel-cifra">Todavía no hay pasos que mostrar</span>
        ) : (
          <>
            <span className="paso-panel-cifra">
              {datos.hechos} de {datos.total} pasos hechos
            </span>
            <progress className="paso-panel-barra" max={datos.total} value={datos.hechos} aria-label="Pasos hechos" />
          </>
        )}
        {siguiente ? (
          <div className="paso-panel-sigue" data-prueba="siguiente-paso">
            <p>
              Lo que sigue: <strong>{siguiente.titulo}</strong>. {siguiente.detalle ?? ""}
            </p>
            <EnlaceBoton className="paso-panel-ir" to={siguiente.ruta}>
              Ir a {nombreDeLaRuta(siguiente.ruta, siguiente.titulo)}
            </EnlaceBoton>
          </div>
        ) : null}
      </div>
      <details className="paso-panel-detalle" open={!listo}>
        <summary>{listo ? "Ver los pasos" : "Ver todos los pasos"}</summary>
        <ol className="paso-panel-pasos">
          {datos.pasos.map((p) => (
            <li key={p.id} data-prueba={`paso-${p.id}`}>
              <Link className="paso-panel-paso" to={p.ruta} {...(p.hecho ? { "data-hecho": "" } : {})}>
                <span className="paso-panel-marca" aria-hidden="true">
                  {p.hecho ? "✓" : "·"}
                </span>
                {nombreDeLaRuta(p.ruta, p.titulo)}
                <span className="solo-lectores">: {p.hecho ? "Listo" : "Falta"}</span>
              </Link>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export default function Administracion() {
  useTitulo("Administración");
  const { puede } = useSesion();
  const [busqueda, setBusqueda] = useState("");
  const pasos = useCarga((senal) => api.get<PrimerosPasos>("/api/administracion/primeros-pasos", undefined, senal), []);
  const grupos = filtrarAreas(GRUPOS_DE_ADMINISTRACION, busqueda, puede, coincide);
  const buscando = busqueda.trim() !== "";
  return (
    <Pagina
      titulo="Administración"
      subtitulo="El catálogo, los canales, los mensajes y las personas de la escuela."
      acciones={
        <div className="admin-buscador">
          <CampoBusqueda etiqueta="Buscar una pantalla en administración" placeholder="¿Qué quieres cambiar? Ej.: precio, contraseña" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      }
    >
      {/* Si el servidor no responde, el menú sigue funcionando: la orientación es una ayuda, no un requisito. Al buscar, el panel se oculta y solo quedan los resultados. */}
      {!buscando && pasos.datos ? <PasosIniciales datos={pasos.datos} /> : null}
      {buscando && grupos.length > 0 ? <div className="admin-busqueda-aviso">Mostrando solo lo que coincide con tu búsqueda.</div> : null}
      {grupos.map((g) => (
        <section key={g.titulo} className="grupo-areas">
          <h2>{g.titulo}</h2>
          <ul className="rejilla-areas" data-prueba={`admin-${g.titulo}`}>
            {g.areas.map((a) => (
              <li key={a.ruta} className="area-tarjeta">
                <Link className="area-enlace" to={a.ruta}>
                  {a.titulo}
                </Link>
                <p>{a.ayuda}</p>
                <span className="area-flecha" aria-hidden="true">
                  <Icono nombre="siguiente" tamano={18} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {buscando && grupos.length === 0 ? <div className="admin-sin-resultados">No hay ninguna pantalla con «{busqueda.trim()}». Prueba con otra palabra, como «horario» o «WhatsApp».</div> : null}
    </Pagina>
  );
}
