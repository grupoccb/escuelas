// El color por disciplina (R1, handoff v2, README «Tokens»). El color sale del DATO `vertical.color` (un hex), jamás de un mapa por nombre.
//
// Mecanismo: `useDisciplina(color)` devuelve una `ref`; al montarse (y al cambiar el color) pone `--disciplina` en ese elemento con `style.setProperty` y marca `data-disciplina`.
// `base.css` (bloque `[data-disciplina]`) deriva de ahí `--disciplina-suave` (fondo de etiquetas y avatares) y `--disciplina-tinta` (texto sobre el suave) con oklch relativo. Sin color
// válido, el elemento queda con `data-disciplina="neutra"` y las tres variables toman los colores neutros del sistema (`--etiqueta`, `--etiqueta-texto`).
// Todo lo de adentro del elemento puede usar `var(--disciplina)`, `var(--disciplina-suave)` y `var(--disciplina-tinta)`; las piezas de abajo ya lo hacen.
//
//   <ConDisciplina color={vertical.color} className="tarjeta">…cualquier cosa que lea las variables…</ConDisciplina>
//   <EtiquetaDisciplina nombre={vertical.nombre} color={vertical.color} />       // punto + nombre
//   <AvatarDisciplina nombre="Matías Fuentes" color={vertical.color} />          // iniciales con el tono suave y la tinta

import { useLayoutEffect, useRef, type ElementType, type ReactNode, type RefObject } from "react";
import { colorDeDisciplina, iniciales } from "./disciplina.ts";

export { colorDeDisciplina, iniciales };

/** La `ref` que pone el color de la disciplina en un elemento propio (un `<li>`, una tarjeta…): `<li ref={ref}>`. */
export function useDisciplina<T extends HTMLElement = HTMLElement>(color: string | null | undefined): RefObject<T | null> {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const valido = colorDeDisciplina(color);
    if (valido) {
      el.style.setProperty("--disciplina", valido);
      el.setAttribute("data-disciplina", "");
    } else {
      el.style.removeProperty("--disciplina");
      el.setAttribute("data-disciplina", "neutra");
    }
  }, [color]);
  return ref;
}

/** Un contenedor que le pone a todo lo suyo el color de la disciplina. */
export function ConDisciplina({ color, as, className, children }: { color: string | null | undefined; as?: ElementType; className?: string; children: ReactNode }) {
  const ref = useDisciplina<HTMLElement>(color);
  const Elemento = as ?? "div";
  return (
    <Elemento ref={ref} className={className}>
      {children}
    </Elemento>
  );
}

/** «Punto + nombre» de la disciplina, con su tono suave de fondo y su tinta de texto. El nombre se lee: el color nunca es la única señal. */
export function EtiquetaDisciplina({ nombre, color }: { nombre: string; color: string | null | undefined }) {
  const ref = useDisciplina<HTMLSpanElement>(color);
  return (
    <span ref={ref} className="etiqueta-disciplina">
      <span className="etiqueta-disciplina-punto" aria-hidden="true" />
      {nombre}
    </span>
  );
}

/** Las iniciales de una persona con el tono de su disciplina (decorativo: el nombre va al lado). `grande` mide 40; por omisión, 32. */
export function AvatarDisciplina({ nombre, color, grande = false }: { nombre: string; color: string | null | undefined; grande?: boolean }) {
  const ref = useDisciplina<HTMLSpanElement>(color);
  return (
    <span ref={ref} className={grande ? "avatar-disciplina avatar-disciplina-grande" : "avatar-disciplina"} aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}
