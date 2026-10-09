import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { seccionesDe } from "../navegacion.ts";
import { useSesion, useYo } from "../sesion/SesionContext.tsx";
import { Boton } from "./basicos.tsx";
import { Icono } from "./Icono.tsx";

const MAXIMO_EN_BARRA = 5;

/** El marco de la aplicación: encabezado (escuela, sucursal, usuario), barra lateral en escritorio y barra inferior en celular. */
export function Shell({ children }: { children: ReactNode }) {
  const yo = useYo();
  const { salir, sucursalId, elegirSucursal } = useSesion();
  const secciones = seccionesDe(yo.permisos);
  const enBarra = secciones.length > MAXIMO_EN_BARRA ? secciones.slice(0, MAXIMO_EN_BARRA - 1) : secciones;
  const hayMas = secciones.length > MAXIMO_EN_BARRA;
  const nombreEscuela = yo.organizacion?.nombre ?? "Gestión";

  return (
    <div className="app">
      <a className="salto" href="#contenido">
        Saltar al contenido
      </a>
      <nav className="lateral" aria-label="Secciones">
        <div className="marca-lateral">{nombreEscuela}</div>
        {secciones.map((s) => (
          <NavLink key={s.id} to={s.ruta}>
            <Icono nombre={s.icono} /> {s.etiqueta}
          </NavLink>
        ))}
      </nav>
      <div className="principal">
        <header className="cabecera">
          <span className="marca">{nombreEscuela}</span>
          {yo.sucursales.length > 1 ? (
            <>
              <label className="solo-lectores" htmlFor="selector-sucursal">
                Sucursal
              </label>
              <select id="selector-sucursal" value={sucursalId ?? ""} onChange={(e) => elegirSucursal(e.target.value || null)}>
                <option value="">Todas mis sucursales</option>
                {yo.sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </>
          ) : yo.sucursales[0] ? (
            <span className="muted">{yo.sucursales[0].nombre}</span>
          ) : null}
          <span className="muted" data-prueba="usuario">
            {yo.usuario.nombre}
          </span>
          <Boton variante="fantasma" onClick={() => void salir()}>
            Salir
          </Boton>
        </header>
        <main id="contenido" className="contenido" tabIndex={-1}>
          {children}
        </main>
      </div>
      <nav className="barra-inferior" aria-label="Secciones">
        {enBarra.map((s) => (
          <NavLink key={s.id} to={s.ruta}>
            <Icono nombre={s.icono} />
            {s.etiqueta}
          </NavLink>
        ))}
        {hayMas || secciones.length === 0 ? (
          <NavLink to="/mas">
            <Icono nombre="mas" />
            Más
          </NavLink>
        ) : null}
      </nav>
    </div>
  );
}
