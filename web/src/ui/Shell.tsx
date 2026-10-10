import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { formatearFecha, hoyLocal } from "../lib/fechas.ts";
import { seccionesDe } from "../navegacion.ts";
import { useSesion, useYo } from "../sesion/SesionContext.tsx";
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

/** ¿La pantalla es de escritorio (barra lateral)? Un solo selector de sucursal existe a la vez: dos con la misma etiqueta confundirían a un lector de pantalla y a quien lo busque por su nombre. */
const ESCRITORIO = "(min-width: 900px)";
function useEscritorio(): boolean {
  return useSyncExternalStore(
    (alCambiar) => {
      const m = window.matchMedia(ESCRITORIO);
      m.addEventListener("change", alCambiar);
      return () => m.removeEventListener("change", alCambiar);
    },
    () => window.matchMedia(ESCRITORIO).matches,
    () => false,
  );
}

/**
 * La lista de secciones de la barra lateral se desplaza dentro de la barra (la marca arriba y la cuenta abajo no se mueven): con 13 secciones, una pantalla de 768 px de alto no las
 * alcanza a mostrar todas. Un degradado abajo avisa que hay más (`lateral-con-mas`), y la sección activa se lleva a la vista al cambiar de pantalla.
 */
function useListaDesplazable(ref: React.RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const actualizar = () => el.classList.toggle("lateral-con-mas", el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    actualizar();
    el.addEventListener("scroll", actualizar, { passive: true });
    window.addEventListener("resize", actualizar);
    return () => {
      el.removeEventListener("scroll", actualizar);
      window.removeEventListener("resize", actualizar);
    };
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>('a[aria-current="page"]')?.scrollIntoView?.({ block: "nearest" });
    if (el) el.classList.toggle("lateral-con-mas", el.scrollHeight - el.clientHeight - el.scrollTop > 4);
  }, [pathname, ref]);
}

const PALABRAS_MENORES = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);

/** Las iniciales de un nombre (hasta dos): «Escuela de prueba» → «EP», «Adela Administradora» → «AA». */
export function iniciales(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter((p) => p !== "" && !PALABRAS_MENORES.has(p.toLowerCase()));
  const letras = (palabras.length > 0 ? palabras : nombre.split(/\s+/).filter(Boolean)).slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letras.join("") || "?";
}

function SelectorDeSucursal({ id }: { id: string }) {
  const yo = useYo();
  const { sucursalId, elegirSucursal } = useSesion();
  return (
    <>
      <label className="solo-lectores" htmlFor={id}>
        Sucursal
      </label>
      <select id={id} className="selector-sucursal" value={sucursalId ?? ""} onChange={(e) => elegirSucursal(e.target.value || null)}>
        <option value="">Todas mis sucursales</option>
        {yo.sucursales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </>
  );
}

/** El marco de la aplicación: barra lateral con la marca, las secciones y la cuenta en escritorio; en celular, la escuela y la cuenta arriba y la barra de secciones abajo. */
export function Shell({ children }: { children: ReactNode }) {
  const yo = useYo();
  const { salir } = useSesion();
  const secciones = seccionesDe(yo.permisos, yo.modulos);
  const enBarra = secciones.length > MAXIMO_EN_BARRA ? secciones.slice(0, MAXIMO_EN_BARRA - 1) : secciones;
  const hayMas = secciones.length > MAXIMO_EN_BARRA;
  const nombreEscuela = yo.organizacion?.nombre ?? "Gestión";
  const variasSucursales = yo.sucursales.length > 1;
  const sucursalUnica = yo.sucursales.length === 1 ? yo.sucursales[0]!.nombre : null;
  const cuenta = `Mi cuenta (${yo.usuario.nombre})`;
  const escritorio = useEscritorio();
  const listaLateral = useRef<HTMLElement>(null);
  useListaDesplazable(listaLateral);
  useClaseDeTeclado();
  useFocoAlNavegar();

  return (
    <div className="app">
      <a className="salto" href="#contenido">
        Saltar al contenido
      </a>
      <div className="lateral-columna">
        <div className="lateral-interior">
          <nav className="lateral" aria-label="Secciones" ref={listaLateral}>
            <div className="marca-lateral">
              <div className="monograma" aria-hidden="true">
                {iniciales(nombreEscuela)}
              </div>
              <div className="marca-textos">
                <div className="marca-nombre">{nombreEscuela}</div>
                {sucursalUnica ? <div className="marca-sucursal">{sucursalUnica}</div> : null}
              </div>
            </div>
            {variasSucursales && escritorio ? (
              <div className="lateral-sucursal">
                <SelectorDeSucursal id="selector-sucursal" />
              </div>
            ) : null}
            <div className="lateral-enlaces">
              {secciones.map((s) => (
                <NavLink key={s.id} to={s.ruta}>
                  <Icono nombre={s.icono} /> {s.etiqueta}
                </NavLink>
              ))}
            </div>
          </nav>
          <div className="lateral-usuario">
            <div className="avatar" aria-hidden="true">
              {iniciales(yo.usuario.nombre)}
            </div>
            <div className="lateral-usuario-datos">
              {/* V7: su cuenta (y cambiar su contraseña) se alcanza desde cualquier pantalla. */}
              <Link className="enlace-cuenta" to="/mas" aria-label={cuenta}>
                <span data-prueba="usuario">{yo.usuario.nombre}</span>
              </Link>
              <button type="button" className="salir" onClick={() => void salir()}>
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="principal">
        <header className="cabecera">
          <div className="cabecera-marca">
            <span className="cabecera-escuela">{sucursalUnica ? `${nombreEscuela} · ${sucursalUnica}` : nombreEscuela}</span>
            {variasSucursales && !escritorio ? <SelectorDeSucursal id="selector-sucursal" /> : null}
          </div>
          <div className="cabecera-cuenta">
            <Link className="avatar" to="/mas" aria-label={cuenta}>
              {iniciales(yo.usuario.nombre)}
            </Link>
            <button type="button" className="boton boton-icono" aria-label="Salir" onClick={() => void salir()}>
              <Icono nombre="salir" />
            </button>
          </div>
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
            <Icono nombre={s.icono} tamano={24} />
            {s.etiqueta}
          </NavLink>
        ))}
        {hayMas || secciones.length === 0 ? (
          <NavLink to="/mas">
            <Icono nombre="mas" tamano={24} />
            Más
          </NavLink>
        ) : null}
      </nav>
    </div>
  );
}
