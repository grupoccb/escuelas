// Marco de cada sección de la página narrativa de Tableros: número, título y una frase de contexto. Las pestañas fijas saltan al `id`.

import type { ReactNode } from "react";

export function SeccionNumerada({ id, numero, titulo, descripcion, children }: { id: string; numero: string; titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <section className="seccion-numerada" id={id} aria-labelledby={`${id}-titulo`} data-prueba={`seccion-${id}`}>
      <header className="seccion-numerada-cabeza">
        <span className="seccion-numerada-numero" aria-hidden="true">{numero}</span>
        <h2 id={`${id}-titulo`} className="seccion-numerada-titulo">{titulo}</h2>
        {descripcion ? <p className="seccion-numerada-descripcion">{descripcion}</p> : null}
      </header>
      {children}
    </section>
  );
}
