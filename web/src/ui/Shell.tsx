import { useEffect, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { formatearFecha, hoyLocal } from "../lib/fechas.ts";
import { seccionesDe } from "../navegacion.ts";
import { useSesion, useYo } from "../sesion/SesionContext.tsx";
import { Boton } from "./basicos.tsx";
import { Icono } from "./Icono.tsx";

const MAXIMO_EN_BARRA = 5;

/** Campos donde sale el teclado del teléfono (no casillas, opciones, botones, listas ni fechas). */
const CAMPO_DE_TECLADO = "textarea, input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=password], input[type=search], input[type=number], input[type=url]";

/**
 * V7 (celular): con el teclado abierto la barra de abajo se esconde (`con-teclado` en <html>, ver base.css): el teclado ya se come media pantalla y la barra fija dejaba el campo
 * y el botón de guardar en una rendija. Se cierra al salir del campo.
 */
function useClaseDeTeclado(): void {
  useEffect(() => {
    const raiz = document.documentElement;
    const alEnfocar = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && e.target.matches(CAMPO_DE_TECLADO)) raiz.classList.add("con-teclado");
    };
    const alSoltar = () => raiz.classList.remove("con-teclado");
    document.addEventListener("focusin", alEnfocar);
    document.addEventListener("focusout", alSoltar);
    return () => {
      document.removeEventListener("focusin", alEnfocar);
      document.removeEventListener("focusout", alSoltar);
      raiz.classList.remove("con-teclado");
    };
  }, []);
}

/** El marco de la aplicación: encabezado (escuela, sucursal, usuario), barra lateral en escritorio y barra inferior en celular. */
export function Shell({ children }: { children: ReactNode }) {
  const yo = useYo();
  const { salir, sucursalId, elegirSucursal } = useSesion();
  const secciones = seccionesDe(yo.permisos, yo.modulos);
  const enBarra = secciones.length > MAXIMO_EN_BARRA ? secciones.slice(0, MAXIMO_EN_BARRA - 1) : secciones;
  const hayMas = secciones.length > MAXIMO_EN_BARRA;
  const nombreEscuela = yo.organizacion?.nombre ?? "Gestión";
  useClaseDeTeclado();

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
          {/* V7: su cuenta (y cambiar su contraseña) se alcanza desde el encabezado en cualquier pantalla; en escritorio no había forma de llegar a «Más». */}
          <Link className="enlace-cuenta" to="/mas" aria-label={`Mi cuenta (${yo.usuario.nombre})`}>
            <span className="solo-escritorio" data-prueba="usuario">
              {yo.usuario.nombre}
            </span>
            <span className="solo-celular">Mi cuenta</span>
          </Link>
          <Boton variante="fantasma" onClick={() => void salir()}>
            Salir
          </Boton>
        </header>
        {/* Solo sale al imprimir: de qué escuela es la hoja, de qué día y quién la imprimió. */}
        <p className="solo-impresion">
          {nombreEscuela} · impreso el {formatearFecha(hoyLocal())} por {yo.usuario.nombre}
        </p>
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
