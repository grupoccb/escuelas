// El gesto de arrastrar y soltar del embudo (R2a) con POINTER EVENTS, solo con ratón (sin HTML5 DnD ni librerías; en pantalla táctil se mueve con «Mover de etapa» / «Mover a…»).
// Presionar una tarjeta y mover más de unos píxeles la vuelve arrastre: sale una tarjeta fantasma (pila con contador si viajan varias) que sigue al puntero, la columna de abajo se
// resalta y el tablero se desplaza solo cerca de sus bordes. Soltar sobre una columna llama a `alSoltar(ids, etapaId)`; Esc lo cancela. La decisión de qué hacer al soltar es del embudo.
// Las decisiones puras (qué ids, sobre qué columna, hacia dónde se desplaza) están en `arrastre.ts` y se prueban sin navegador.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as EventoDePuntero, type RefObject } from "react";
import { columnaBajo, idsAArrastrar, pasoDeAutodesplazamiento, posicionDelFantasma, superaElUmbral, type CajaDeColumna } from "./arrastre.ts";

export interface EstadoDeArrastre {
  ids: string[];
  /** La columna (id de la etapa) bajo el puntero; `null` si no hay ninguna. */
  sobre: string | null;
  ancho: number;
}

interface Opciones {
  habilitado: boolean;
  seleccion: ReadonlySet<string>;
  /** Los ids de los leads en el orden en que se ven (para que la pila viaje siempre igual). */
  ordenVisible: readonly string[];
  puedeArrastrarse: (id: string) => boolean;
  tablero: RefObject<HTMLElement | null>;
  alSoltar: (ids: string[], etapaId: string) => void;
}

const COLUMNAS = "[data-columna]";

function cajasDeColumnas(): CajaDeColumna[] {
  return [...document.querySelectorAll<HTMLElement>(COLUMNAS)].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset["columna"] ?? "", izquierda: r.left, derecha: r.right, arriba: r.top, abajo: r.bottom };
  });
}

export function useArrastre(opciones: Opciones) {
  const [arrastre, setArrastre] = useState<EstadoDeArrastre | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const puntero = useRef({ x: 0, y: 0 });
  const agarre = useRef({ dx: 0, dy: 0 });
  const ignorarClic = useRef(false);
  const cancelar = useRef<(() => void) | null>(null);
  const actuales = useRef(opciones);
  useEffect(() => {
    actuales.current = opciones;
  });

  const posicionar = useCallback(() => {
    const el = fantasma.current;
    if (!el) return;
    const p = posicionDelFantasma(puntero.current, agarre.current);
    el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(2deg)`;
  }, []);

  // La tarjeta fantasma nace ya en su lugar (con el ancho de la tarjeta agarrada), no en la esquina de la ventana.
  const hayArrastre = arrastre !== null;
  const anchoInicial = arrastre?.ancho;
  useLayoutEffect(() => {
    if (!hayArrastre || !fantasma.current) return;
    if (anchoInicial !== undefined) fantasma.current.style.width = `${anchoInicial}px`;
    posicionar();
  }, [hayArrastre, anchoInicial, posicionar]);

  // Si la pantalla se desmonta en pleno arrastre, se limpian los oyentes.
  useEffect(() => () => cancelar.current?.(), []);

  const alPresionar = useCallback(
    (e: EventoDePuntero<HTMLElement>, id: string) => {
      const o = actuales.current;
      if (!o.habilitado || e.button !== 0 || e.pointerType !== "mouse" || !o.puedeArrastrarse(id)) return;
      if ((e.target as Element).closest("button, a, input, select, textarea")) return;
      const caja = e.currentTarget.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      agarre.current = { dx: x0 - caja.left, dy: y0 - caja.top };
      puntero.current = { x: x0, y: y0 };
      let activo = false;
      let ids: string[] = [];
      let sobre: string | null = null;
      let cuadro = 0;

      const actualizarDestino = () => {
        const nuevo = columnaBajo(cajasDeColumnas(), puntero.current.x, puntero.current.y);
        if (nuevo === sobre) return;
        sobre = nuevo;
        setArrastre({ ids, sobre, ancho: caja.width });
      };
      // Cada cuadro: si el puntero está cerca del borde del tablero, se desplaza solo (aunque el ratón no se mueva), y el destino se vuelve a calcular.
      const girar = () => {
        const t = actuales.current.tablero.current;
        if (t) {
          const r = t.getBoundingClientRect();
          const paso = pasoDeAutodesplazamiento(puntero.current.x, { izquierda: r.left, derecha: r.right });
          if (paso !== 0) {
            t.scrollLeft += paso;
            actualizarDestino();
          }
        }
        cuadro = window.requestAnimationFrame(girar);
      };
      const mover = (ev: PointerEvent) => {
        puntero.current = { x: ev.clientX, y: ev.clientY };
        if (!activo) {
          if (!superaElUmbral(ev.clientX - x0, ev.clientY - y0)) return;
          activo = true;
          ids = idsAArrastrar(id, actuales.current.seleccion, actuales.current.ordenVisible);
          document.body.classList.add("arrastrando");
          sobre = columnaBajo(cajasDeColumnas(), ev.clientX, ev.clientY);
          setArrastre({ ids, sobre, ancho: caja.width });
          cuadro = window.requestAnimationFrame(girar);
          return;
        }
        posicionar();
        actualizarDestino();
      };
      const terminar = (soltar: boolean) => {
        document.removeEventListener("pointermove", mover);
        document.removeEventListener("pointerup", alSoltarPuntero);
        document.removeEventListener("pointercancel", alCancelarPuntero);
        document.removeEventListener("keydown", alTeclear, true);
        window.cancelAnimationFrame(cuadro);
        document.body.classList.remove("arrastrando");
        cancelar.current = null;
        if (!activo) return;
        // El clic que sigue a soltar no debe abrir la tarjeta.
        ignorarClic.current = true;
        window.setTimeout(() => {
          ignorarClic.current = false;
        }, 0);
        setArrastre(null);
        if (soltar && sobre) actuales.current.alSoltar(ids, sobre);
      };
      const alSoltarPuntero = () => terminar(true);
      const alCancelarPuntero = () => terminar(false);
      // Esc cancela el arrastre y no llega a quien vacía la selección.
      const alTeclear = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        ev.stopPropagation();
        ev.preventDefault();
        terminar(false);
      };
      cancelar.current = () => terminar(false);
      document.addEventListener("pointermove", mover);
      document.addEventListener("pointerup", alSoltarPuntero);
      document.addEventListener("pointercancel", alCancelarPuntero);
      document.addEventListener("keydown", alTeclear, true);
    },
    [posicionar],
  );

  /** ¿El clic que acaba de llegar es el que sigue a un arrastre? (El indicador se baja solo en cuanto termina el turno del evento.) */
  const esClicDeArrastre = useCallback(() => ignorarClic.current, []);

  return { arrastre, fantasma, alPresionar, esClicDeArrastre };
}
