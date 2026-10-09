import { Boton } from "./basicos.tsx";

/** «Anterior / Siguiente» de una lista paginada por la API (`paginacion: { pagina, limite, total }`). No se muestra si todo cabe en una página. */
export function Paginador({ pagina, limite, total, alCambiar }: { pagina: number; limite: number; total: number; alCambiar: (pagina: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / limite));
  if (paginas <= 1) return null;
  return (
    <nav className="fila fila-entre" aria-label="Páginas">
      <Boton disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
        Anterior
      </Boton>
      <span className="muted" data-prueba="pagina-actual">
        Página {pagina} de {paginas} · {total} en total
      </span>
      <Boton disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>
        Siguiente
      </Boton>
    </nav>
  );
}
