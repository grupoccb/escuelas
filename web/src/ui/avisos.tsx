// El aviso de «ya quedó» (V7, recorrido del administrador): una acción que guarda, enciende, apaga o da de baja dice, sin que nadie lo pida, qué pasó y desde cuándo vale. Un solo aviso a la
// vez (el nuevo reemplaza al anterior), se anuncia a un lector de pantalla (`role="status"`), se puede cerrar y se va solo. Lo que sigue pasando después (un error) NO usa esto: eso es de
// `ErrorDeAccion`, que se queda a la vista hasta que se corrige.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Boton } from "./basicos.tsx";
import { Icono } from "./Icono.tsx";

const TIEMPO_EN_PANTALLA_MS = 9000;

interface Valor {
  /** Dice que algo ya quedó: «El grupo «Natación martes» se guardó.». */
  avisar(texto: string): void;
}

const Contexto = createContext<Valor>({ avisar: () => undefined });

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<{ numero: number; texto: string } | null>(null);
  const contador = useRef(0);
  const temporizador = useRef<number | undefined>(undefined);
  const caja = useRef<HTMLDivElement>(null);
  const avisar = useCallback((texto: string) => {
    window.clearTimeout(temporizador.current);
    contador.current += 1;
    setAviso({ numero: contador.current, texto });
    temporizador.current = window.setTimeout(() => setAviso(null), TIEMPO_EN_PANTALLA_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(temporizador.current), []);
  const valor = useMemo(() => ({ avisar }), [avisar]);
  // El contenedor es un popover manual y siempre está abierto (vacío mientras no hay aviso, así la región sigue anunciando): vive en la capa superior del navegador y, al llegar un aviso,
  // se vuelve a abrir para quedar encima de lo último que se haya abierto, también de un diálogo modal (antes el aviso quedaba detrás del velo). Sin soporte de popover queda como antes.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      el.showPopover();
    } catch {
      /* navegador sin popover: no hace falta */
    }
  }, [aviso?.numero]);
  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* La región existe siempre: así el lector de pantalla anuncia el texto cuando aparece. */}
      <div className="avisos-vivos" ref={caja} role="status" aria-live="polite" {...{ popover: "manual" }}>
        {aviso ? (
          <div key={aviso.numero} className="aviso-global" data-prueba="aviso-global">
            <Icono nombre="exito" tamano={18} />
            <span>{aviso.texto}</span>
            <Boton variante="fantasma" onClick={() => setAviso(null)} aria-label="Cerrar este aviso">
              Entendido
            </Boton>
          </div>
        ) : null}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos(): Valor {
  return useContext(Contexto);
}
