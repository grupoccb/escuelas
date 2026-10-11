// Las pestañas fijas de la página de Tableros: saltan a cada sección y se marcan solas al desplazar (IntersectionObserver). No son un `tablist`: no hay paneles que mostrar y ocultar, es un
// índice de la misma página; cada botón lleva `aria-current` cuando es la sección que se está leyendo. En celular son una tira que se desplaza hacia los lados.

import { useEffect, useRef, useState } from "react";

export interface PestanaDeSeccion {
  id: string;
  nombre: string;
}

const sinMovimiento = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Hasta dónde baja la parte de arriba de una sección para contar como «la que se lee» (bajo las pestañas fijas). */
const LINEA_DE_LECTURA = 120;
const ancla = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-seccion="${id}"]`);

export function NavegacionDeSecciones({ secciones }: { secciones: readonly PestanaDeSeccion[] }) {
  const [activa, setActiva] = useState(secciones[0]?.id ?? "");
  const tira = useRef<HTMLUListElement>(null);
  /** Mientras el salto programático corre, el observador no cambia la marca (si no, pasaría por todas las secciones del camino). */
  const saltando = useRef(false);
  const claves = secciones.map((s) => s.id).join("|");

  useEffect(() => {
    const ids = claves === "" ? [] : claves.split("|");
    const visibles = new Set<string>();
    const elegir = (): void => {
      if (saltando.current) return;
      if (window.scrollY < 8) return setActiva(ids[0] ?? "");
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) return setActiva(ids[ids.length - 1] ?? "");
      // La que se lee es la última cuya parte de arriba ya pasó la línea de las pestañas (si ninguna, la primera que el observador ve).
      let leida = "";
      for (const id of ids) if ((ancla(id)?.getBoundingClientRect().top ?? Infinity) <= LINEA_DE_LECTURA) leida = id;
      const alcanzada = leida || ids.find((id) => visibles.has(id));
      if (alcanzada) setActiva(alcanzada);
    };
    // El observador avisa cuándo una sección entra o sale de la franja de arriba de la pantalla; con eso se vuelve a decidir cuál se lee.
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          const id = (e.target as HTMLElement).dataset["seccion"];
          if (!id) continue;
          if (e.isIntersecting) visibles.add(id);
          else visibles.delete(id);
        }
        elegir();
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const id of ids) {
      const el = ancla(id);
      if (el) observador.observe(el);
    }
    window.addEventListener("scroll", elegir, { passive: true });
    return () => {
      observador.disconnect();
      window.removeEventListener("scroll", elegir);
    };
  }, [claves]);

  // La pestaña marcada se acerca dentro de la tira (celular) sin mover la página.
  useEffect(() => {
    const lista = tira.current;
    const boton = lista?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!lista || !boton) return;
    const izquierda = boton.offsetLeft - lista.offsetLeft;
    if (izquierda < lista.scrollLeft || izquierda + boton.offsetWidth > lista.scrollLeft + lista.clientWidth) lista.scrollTo({ left: Math.max(0, izquierda - 16), behavior: sinMovimiento() ? "auto" : "smooth" });
  }, [activa]);

  const ir = (id: string): void => {
    const destino = ancla(id);
    if (!destino) return;
    setActiva(id);
    saltando.current = true;
    destino.scrollIntoView({ behavior: sinMovimiento() ? "auto" : "smooth", block: "start" });
    // El foco sigue al salto: quien navega con teclado queda en el título de la sección y no en la pestaña que dejó atrás.
    const titulo = destino.querySelector<HTMLElement>("h2");
    if (titulo) {
      titulo.setAttribute("tabindex", "-1");
      titulo.focus({ preventScroll: true });
    }
    window.setTimeout(() => {
      saltando.current = false;
    }, sinMovimiento() ? 60 : 800);
  };

  return (
    <nav className="tablero-pestanas" aria-label="Secciones del tablero">
      <ul ref={tira}>
        {secciones.map((s) => (
          <li key={s.id}>
            <button type="button" aria-current={activa === s.id ? "true" : undefined} onClick={() => ir(s.id)}>
              {s.nombre}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
