// El inicio de Administración: por dónde empezar (los primeros pasos de una escuela nueva, calculados contra el estado real), un buscador para llegar a una pantalla sin recorrer la lista
// y el menú de cada área que se edita sin tocar código. Se muestra lo que el rol puede administrar (por permisos, no por rol).

import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { coincide } from "../../lib/texto.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, EnlaceBoton, Insignia, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { CampoBusqueda } from "../../ui/campos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { filtrarAreas, GRUPOS_DE_ADMINISTRACION } from "./areas.ts";
import { VacioDeLista } from "./comunes.tsx";
import type { PrimerosPasos } from "./tipos.ts";

export { GRUPOS_DE_ADMINISTRACION };

/** Los ocho pasos para dejar lista una escuela nueva. Si todo está listo se pliega a una línea (y se puede volver a abrir). */
export function PasosIniciales({ datos }: { datos: PrimerosPasos }) {
  // Con 0 pasos (no pasa con datos reales: siempre son 8) no se dice que la escuela está lista ni se llena la barra.
  const listo = datos.siguiente === null && datos.total > 0;
  const siguiente = datos.pasos.find((p) => p.id === datos.siguiente);
  return (
    <Tarjeta titulo="Para empezar" className="primeros-pasos">
      <div className="pila" data-prueba="primeros-pasos">
        <div className="avance-pasos">
          <p className="avance-texto">
            {listo ? (
              <strong>Tu escuela está lista: los {datos.total} pasos están hechos.</strong>
            ) : datos.total === 0 ? (
              <strong>Todavía no hay pasos que mostrar.</strong>
            ) : (
              <>
                <strong className="cifra-principal">{datos.hechos} de {datos.total}</strong> <strong>pasos hechos.</strong>
              </>
            )}{" "}
            <span className="muted">{listo ? "Cualquier cambio de aquí en adelante se hace desde las pantallas de abajo." : "Se van marcando solos, según lo que ya hay guardado."}</span>
          </p>
          {datos.total > 0 ? <progress className="barra-avance" max={datos.total} value={datos.hechos} aria-label="Pasos hechos" /> : null}
        </div>
        {siguiente ? (
          <div className="aviso aviso-info siguiente-paso" data-prueba="siguiente-paso">
            <div className="siguiente-paso-texto">
              <p>
                <strong>Lo que sigue:</strong> {siguiente.titulo}.
              </p>
              {siguiente.detalle ? <p className="muted">{siguiente.detalle}</p> : null}
            </div>
            <EnlaceBoton to={siguiente.ruta} variante="primario">
              Hacerlo ahora
            </EnlaceBoton>
          </div>
        ) : null}
        <details open={!listo}>
          <summary>{listo ? "Ver los pasos" : "Ver todos los pasos"}</summary>
          <ol className="lista-pasos">
            {datos.pasos.map((p) => (
              <li key={p.id} data-prueba={`paso-${p.id}`}>
                <div className="fila fila-entre">
                  <Link className="enlace-tactil" to={p.ruta}>
                    {p.titulo}
                  </Link>
                  <Insignia tono={p.hecho ? "exito" : "alerta"}>{p.hecho ? "Listo" : "Falta"}</Insignia>
                </div>
                {p.detalle ? <p className="muted">{p.detalle}</p> : null}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </Tarjeta>
  );
}

export default function Administracion() {
  useTitulo("Administración");
  const { puede } = useSesion();
  const [busqueda, setBusqueda] = useState("");
  const pasos = useCarga((senal) => api.get<PrimerosPasos>("/api/administracion/primeros-pasos", undefined, senal), []);
  const grupos = filtrarAreas(GRUPOS_DE_ADMINISTRACION, busqueda, puede, coincide);
  return (
    <Pagina titulo="Administración" subtitulo="Todo lo que la escuela puede cambiar sin tocar código.">
      {/* Si el servidor no responde, el menú sigue funcionando: la orientación es una ayuda, no un requisito. */}
      {pasos.datos ? <PasosIniciales datos={pasos.datos} /> : null}
      <div className="buscador-areas">
        <CampoBusqueda etiqueta="Buscar una pantalla" placeholder="Buscar una pantalla" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <p className="campo-ayuda">Por ejemplo: precio, contraseña, excel, qr, horario.</p>
      </div>
      {grupos.length === 0 ? (
        <VacioDeLista titulo={`No hay ninguna pantalla con «${busqueda.trim()}»`} icono="buscar">Prueba con otra palabra, o borra lo escrito para ver todas.</VacioDeLista>
      ) : (
        grupos.map((g) => (
          <section key={g.titulo} className="grupo-areas">
            <h2>{g.titulo}</h2>
            <ul className="lista-tarjetas rejilla-areas" data-prueba={`admin-${g.titulo}`}>
              {g.areas.map((a) => (
                <li key={a.ruta} className="area-tarjeta">
                  <Link className="area-enlace" to={a.ruta}>
                    <strong>{a.titulo}</strong>
                  </Link>
                  <p className="muted">{a.ayuda}</p>
                  <span className="area-flecha" aria-hidden="true">
                    <Icono nombre="siguiente" tamano={18} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {busqueda.trim() !== "" && grupos.length > 0 ? <Aviso>Mostrando solo lo que coincide con «{busqueda.trim()}».</Aviso> : null}
    </Pagina>
  );
}
