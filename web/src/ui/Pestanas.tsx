import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * Pestañas accesibles (patrón de pestañas del W3C, V10 / EK-26): cada pestaña se enlaza con su panel (`aria-controls` / `aria-labelledby`), solo la elegida entra con Tab
 * (las demás se alcanzan con las flechas, Inicio y Fin) y el panel mismo recibe el foco con Tab. Las flechas eligen la pestaña de inmediato (activación automática).
 *
 *   <Pestanas nombre="tareas" etiqueta="Estado de las tareas" pestanas={[{ id: "pendiente", texto: "Pendientes" }, …]} activa={estado} alCambiar={setEstado} />
 *   <div {...propsDePanel("tareas", estado)}>…lo que muestra la pestaña…</div>
 */
export interface DefinicionDePestana<T extends string> {
  id: T;
  texto: ReactNode;
}

const idDePestana = (nombre: string, id: string): string => `pestana-${nombre}-${id}`;
const idDePanel = (nombre: string, id: string): string => `panel-${nombre}-${id}`;

/** Lo que lleva el contenedor de la pestaña elegida. */
export function propsDePanel(nombre: string, activa: string): { role: "tabpanel"; id: string; "aria-labelledby": string; tabIndex: 0 } {
  return { role: "tabpanel", id: idDePanel(nombre, activa), "aria-labelledby": idDePestana(nombre, activa), tabIndex: 0 };
}

export function Pestanas<T extends string>({ nombre, etiqueta, pestanas, activa, alCambiar }: { nombre: string; etiqueta: string; pestanas: readonly DefinicionDePestana<T>[]; activa: T | undefined; alCambiar: (id: T) => void }) {
  const lista = useRef<HTMLDivElement>(null);

  function alTeclear(e: KeyboardEvent<HTMLDivElement>): void {
    const ids = pestanas.map((p) => p.id);
    const i = activa === undefined ? 0 : ids.indexOf(activa);
    let destino: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") destino = (i + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") destino = (i - 1 + ids.length) % ids.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = ids.length - 1;
    if (destino === null) return;
    e.preventDefault();
    const id = ids[destino]!;
    alCambiar(id);
    // El foco acompaña a la pestaña elegida.
    lista.current?.querySelector<HTMLElement>(`#${CSS.escape(idDePestana(nombre, id))}`)?.focus();
  }

  return (
    <div className="pestanas" role="tablist" aria-label={etiqueta} ref={lista} onKeyDown={alTeclear}>
      {pestanas.map((p) => (
        <button key={p.id} type="button" role="tab" id={idDePestana(nombre, p.id)} aria-selected={activa === p.id} aria-controls={idDePanel(nombre, p.id)} tabIndex={activa === p.id ? 0 : -1} onClick={() => alCambiar(p.id)}>
          {p.texto}
        </button>
      ))}
    </div>
  );
}
