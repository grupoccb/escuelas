import { useEffect, useRef, type ReactNode } from "react";

/** Un diálogo modal con el elemento nativo `<dialog>`: foco atrapado, Esc cierra y el resto de la página queda inerte. */
/** `ancho` (R2b) lo hace más ancho para los diálogos de pasos (la inscripción del embudo); el resto de su comportamiento es el mismo. */
export function Dialogo({ abierto, titulo, alCerrar, ancho = false, children }: { abierto: boolean; titulo: string; alCerrar: () => void; ancho?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog ref={ref} className={ancho ? "dialogo dialogo-ancho" : "dialogo"} aria-label={titulo} onCancel={(e) => { e.preventDefault(); alCerrar(); }} onClose={() => { if (abierto) alCerrar(); }}>
      {abierto ? (
        <div className="dialogo-cuerpo">
          <h2>{titulo}</h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
