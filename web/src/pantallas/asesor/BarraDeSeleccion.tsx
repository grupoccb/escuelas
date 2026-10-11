// La barra flotante de la selección en lote (R2a): oscura, con el conteo, «Mover a…» (un menú con las etapas; «Inscrito» se deshabilita con más de uno porque la inscripción es de una
// familia a la vez) y «Quitar la selección». Esc cierra el menú (y, con el menú cerrado, vacía la selección: eso lo decide el embudo).

import { useEffect, useRef } from "react";
import type { Etapa } from "../../api/tipos.ts";
import { Icono } from "../../ui/Icono.tsx";
import { opcionesDeMover } from "./etapas-embudo.ts";
import { palabraDeSeleccion } from "./seleccion.ts";

export interface PropsDeBarra {
  cantidad: number;
  etapas: readonly Etapa[];
  /** Pide el menú abierto o cerrado (el embudo lo cierra con Esc). */
  menuAbierto: boolean;
  alCambiarMenu: (abierto: boolean) => void;
  alMover: (etapaId: string) => void;
  alQuitar: () => void;
}

export function BarraDeSeleccion({ cantidad, etapas, menuAbierto, alCambiarMenu, alMover, alQuitar }: PropsDeBarra) {
  const disparador = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const opciones = opcionesDeMover(etapas, cantidad);

  // Al abrir el menú el foco entra en su primera opción; un clic fuera lo cierra.
  useEffect(() => {
    if (!menuAbierto) return;
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const fuera = (e: PointerEvent) => {
      if (e.target instanceof Node && !disparador.current?.parentElement?.contains(e.target)) alCambiarMenu(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [menuAbierto, alCambiarMenu]);

  const navegar = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      alCambiarMenu(false);
      // El foco vuelve al botón que abrió el menú.
      disparador.current?.focus();
    }
  };

  return (
    <div className="barra-seleccion" role="region" aria-label="Leads seleccionados">
      <span className="barra-seleccion-cuenta">{cantidad}</span>
      <span className="barra-seleccion-texto">{palabraDeSeleccion(cantidad)}</span>
      <div className="barra-seleccion-mover">
        <button ref={disparador} type="button" className="barra-seleccion-boton" aria-haspopup="menu" aria-expanded={menuAbierto} onClick={() => alCambiarMenu(!menuAbierto)}>
          <Icono nombre="siguiente" tamano={18} />
          Mover a…
        </button>
        {menuAbierto ? (
          <div ref={menu} className="menu-mover" role="menu" aria-label="Mover a" onKeyDown={navegar}>
            {opciones.map((o) => (
              <button key={o.etapaId} type="button" role="menuitem" disabled={o.deshabilitada} onClick={() => alMover(o.etapaId)}>
                <span>{o.nombre}</span>
                {o.nota ? <span className="mover-nota">{o.nota}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className="barra-seleccion-quitar" aria-label="Quitar la selección" title="Quitar la selección" onClick={alQuitar}>
        <Icono nombre="cerrar" tamano={18} />
      </button>
    </div>
  );
}
