// El patrón compartido de las pantallas de catálogo (R7a, handoff v2, README «Administración» y Admin-catalogo.dc.html): un menú de áreas a la izquierda (en celular, un selector «Área»), el
// título con su ayuda, una o más listas con su encabezado «Nombre · N» y su botón «Nueva …», y filas con color (el de la disciplina) o número de orden, etiquetas y acciones.
// Las pantallas de catálogo lo usan así, sin repetir marcado:
//
//   <PaginaDeCatalogo titulo="Disciplinas" ayuda="…">
//     <ListaDeCatalogo titulo="Disciplinas" cuenta={n} nuevo="Nueva disciplina" alNuevo={…}>
//       <ul className="lista-filas"><FilaDeCatalogo titulo=… etiquetas=… detalle=… color=… acciones={<AccionesDeTarjeta … />} /></ul>
//     </ListaDeCatalogo>
//     …diálogos…
//   </PaginaDeCatalogo>
//
// El menú sale de `areas.ts` (las áreas con `menu: true`, según lo que el rol puede administrar). Quien quiera adoptar el patrón solo cambia su `<Pagina>` por `<PaginaDeCatalogo>`.

import { useId, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton } from "../../ui/basicos.tsx";
import { useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion } from "../../ui/hooks.ts";
import { areasDelMenu, GRUPOS_DE_ADMINISTRACION } from "./areas.ts";

/** El enlace de regreso al inicio de Administración (flecha y nombre). */
export function VolverAAdministracion({ className }: { className: string }) {
  return (
    <Link className={className} to="/admin">
      <Icono nombre="atras" tamano={16} />
      Administración
    </Link>
  );
}

/** La página de una pantalla de catálogo: menú de áreas (escritorio) o selector «Área» (celular), título, ayuda y lo que sigue. */
export function PaginaDeCatalogo({ titulo, ayuda, nota, children }: { titulo: string; ayuda: ReactNode; nota?: ReactNode; children: ReactNode }) {
  const { puede } = useSesion();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const grupos = areasDelMenu(GRUPOS_DE_ADMINISTRACION, puede);
  const actual = grupos.flatMap((g) => g.areas).find((a) => a.ruta === pathname)?.ruta ?? "";
  return (
    <div className="catalogo-marco">
      <nav className="catalogo-menu" aria-label="Áreas de administración">
        <VolverAAdministracion className="catalogo-volver" />
        {grupos.map((g) => (
          <div key={g.titulo} className="catalogo-menu-grupo" role="group" aria-label={g.titulo}>
            <div className="catalogo-menu-etiqueta" aria-hidden="true">
              {g.titulo}
            </div>
            {g.areas.map((a) => (
              <Link key={a.ruta} className="catalogo-menu-enlace" to={a.ruta} {...(a.ruta === actual ? { "aria-current": "page" as const } : {})}>
                {a.titulo}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="catalogo-contenido">
        <div className="catalogo-movil">
          <VolverAAdministracion className="catalogo-volver" />
          <select className="catalogo-selector" aria-label="Área" value={actual} onChange={(e) => navegar(e.target.value)}>
            {actual === "" ? <option value="">{titulo}</option> : null}
            {grupos.flatMap((g) => g.areas).map((a) => (
              <option key={a.ruta} value={a.ruta}>
                {a.titulo}
              </option>
            ))}
          </select>
        </div>
        <header className="catalogo-cabecera">
          <h1>{titulo}</h1>
          <p className="catalogo-ayuda">{ayuda}</p>
        </header>
        {nota ? <Aviso>{nota}</Aviso> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * Una lista de la pantalla: el encabezado «Nombre · N» con su botón «Nueva …» a la derecha y, abajo, las filas. La primera lista de la pantalla lleva la acción principal; las
 * siguientes (`secundaria`) la llevan en tono suave, para que haya una sola por pantalla.
 */
export function ListaDeCatalogo({ titulo, cuenta, nuevo, alNuevo, secundaria = false, children }: { titulo: string; cuenta?: number | undefined; nuevo: string; alNuevo: () => void; secundaria?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className="catalogo-lista" aria-labelledby={id}>
      <div className="catalogo-lista-cabeza">
        <h2 id={id}>
          {titulo}
          {cuenta !== undefined ? <span className="catalogo-lista-cuenta"> · {cuenta}</span> : null}
        </h2>
        <Boton variante={secundaria ? "sutil" : "primario"} onClick={alNuevo}>
          {nuevo}
        </Boton>
      </div>
      {children}
    </section>
  );
}

export interface PropsFilaDeCatalogo {
  titulo: ReactNode;
  /** Las insignias que van junto al nombre. */
  etiquetas?: ReactNode;
  /** Lo que sigue bajo el nombre (datos de la fila, en gris). */
  detalle?: ReactNode;
  /** El color de la disciplina (hex, del dato `color_marca`): la barra de 12 × 40 a la izquierda. Sin color no se dibuja nada. */
  color?: string | null | undefined;
  /** El número de orden (círculo de 28 a la izquierda), para las listas que se ordenan. */
  orden?: number | undefined;
  /** Inactiva: fondo atenuado (sin bajar el contraste del texto); la insignia «Inactiva» la dice con texto. */
  inactiva?: boolean;
  /** Lo que ocupa su propio renglón dentro de la fila (casillas, la bandeja del canal…). */
  extra?: ReactNode;
  acciones: ReactNode;
  "data-prueba"?: string;
}

/** Una fila del patrón: color u orden, nombre con etiquetas, datos y acciones; en celular las acciones pasan a su propio renglón. */
export function FilaDeCatalogo({ titulo, etiquetas, detalle, color, orden, inactiva = false, extra, acciones, ...resto }: PropsFilaDeCatalogo) {
  const ref = useDisciplina<HTMLLIElement>(color);
  const conColor = typeof color === "string" && color.trim() !== "";
  return (
    <li ref={ref} className="fila-catalogo" {...(inactiva ? { "data-inactiva": "" } : {})} {...resto}>
      {orden !== undefined ? <span className="fila-catalogo-orden">{orden}</span> : null}
      {conColor ? <span className="fila-catalogo-color" aria-hidden="true" /> : null}
      <div className="fila-catalogo-cuerpo">
        <div className="fila-catalogo-titulo">
          <strong>{titulo}</strong>
          {etiquetas}
        </div>
        {detalle ? <div className="fila-catalogo-detalle">{detalle}</div> : null}
        {extra}
      </div>
      <div className="fila-catalogo-acciones">{acciones}</div>
    </li>
  );
}

/** Activar o desactivar desde la fila (`PATCH { activo }`), con su aviso «ya quedó» y el error a la vista. `alternar` recibe la ruta de la fila y lo que dice el aviso en cada sentido. */
export function useAlternarActivo(alCambiar: () => void) {
  const accion = useAccion();
  const { avisar } = useAvisos();
  return {
    error: accion.error,
    ocupado: accion.ocupado,
    alternar: (ruta: string, activo: boolean, avisos: { desactivada: string; activada: string }): void => {
      void accion.ejecutar(async () => {
        await api.patch(ruta, { activo: !activo });
        alCambiar();
        avisar(activo ? avisos.desactivada : avisos.activada);
      });
    },
  };
}

/** Une los datos de una fila con « · », sin los que no hay (`null`, `false`, vacío). */
export function unir(piezas: (string | null | false | undefined)[]): string {
  return piezas.filter((x): x is string => typeof x === "string" && x.trim() !== "").join(" · ");
}
