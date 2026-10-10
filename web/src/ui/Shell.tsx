import { useEffect, useRef, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { formatearFecha, hoyLocal } from "../lib/fechas.ts";
import { seccionesDe } from "../navegacion.ts";
import { useSesion, useYo } from "../sesion/SesionContext.tsx";
import { Boton } from "./basicos.tsx";
import { Icono } from "./Icono.tsx";

const MAXIMO_EN_BARRA = 5;

/** Campos donde sale el teclado del teléfono (no casillas, opciones, botones, listas ni fechas). */
const CAMPO_DE_TECLADO = "textarea, input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=password], input[type=search], input[type=number], input[type=url]";

/** Cuánto tiene que haberse achicado la pantalla visible para decir que hay un teclado abierto (la barra de direcciones que se esconde o se muestra no llega a tanto). */
const ALTO_DE_TECLADO_MINIMO_PX = 150;

/**
 * V7 (celular): con el teclado abierto la barra de abajo se esconde (`con-teclado` en <html>, ver base.css): el teclado ya se come media pantalla y la barra fija dejaba el campo
 * y el botón de guardar en una rendija.
 *
 * V10: antes bastaba con que un campo de texto tuviera el foco. Pero quien baja el teclado (o usa un teclado físico, o una computadora con la ventana angosta) deja el foco en el campo y la
 * barra de abajo seguía escondida con el registro a medio llenar: había que tocar fuera para recuperarla. Ahora además la pantalla visible tiene que haberse achicado de verdad
 * (`visualViewport`). Si el navegador no sabe decirlo, se queda la regla de antes (el foco).
 */
function useClaseDeTeclado(): void {
  useEffect(() => {
    const raiz = document.documentElement;
    const visor = window.visualViewport;
    let base = { ancho: window.innerWidth, alto: Math.max(window.innerHeight, visor?.height ?? 0) };
    const campoEnFoco = (): boolean => document.activeElement instanceof HTMLElement && document.activeElement.matches(CAMPO_DE_TECLADO);
    const actualizar = () => {
      let abierto = campoEnFoco();
      if (abierto && visor) {
        // Si giró el teléfono, la altura de referencia es la nueva; si no, la mayor que se ha visto (el teclado la achica, nunca la agranda).
        if (window.innerWidth !== base.ancho) base = { ancho: window.innerWidth, alto: Math.max(window.innerHeight, visor.height) };
        else base.alto = Math.max(base.alto, window.innerHeight, visor.height);
        abierto = base.alto - visor.height >= ALTO_DE_TECLADO_MINIMO_PX;
      }
      raiz.classList.toggle("con-teclado", abierto);
    };
    // El foco ya cambió cuando el navegador avisa de `focusout`: se revisa en el siguiente turno.
    const despues = () => window.setTimeout(actualizar, 0);
    document.addEventListener("focusin", actualizar);
    document.addEventListener("focusout", despues);
    window.addEventListener("resize", actualizar);
    visor?.addEventListener("resize", actualizar);
    return () => {
      document.removeEventListener("focusin", actualizar);
      document.removeEventListener("focusout", despues);
      window.removeEventListener("resize", actualizar);
      visor?.removeEventListener("resize", actualizar);
      raiz.classList.remove("con-teclado");
    };
  }, []);
}

/**
 * V10 (EK-26): al cambiar de pantalla el foco se lleva al contenido nuevo. En una aplicación de una sola página el navegador no hace nada al «navegar»: el foco se quedaba en el
 * enlace de la barra y quien usa un lector de pantalla (o el teclado) no se enteraba de que la pantalla cambió. No lo roba si la pantalla nueva ya puso el foco dentro de su
 * contenido (un campo con `autoFocus`) y solo reacciona al CAMBIO de pantalla (no a un filtro en la dirección).
 */
function useFocoAlNavegar(): void {
  const { pathname } = useLocation();
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const contenido = document.getElementById("contenido");
    const activo = document.activeElement;
    if (contenido && (activo === null || activo === document.body || !contenido.contains(activo))) contenido.focus({ preventScroll: true });
  }, [pathname]);
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
  useFocoAlNavegar();

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
