import { useSyncExternalStore } from "react";

/** ¿Se cumple esta consulta de medios (`matchMedia`)? Reacciona si cambia (la ventana, el dispositivo); `porOmision` es lo que vale donde no hay navegador. */
export function useConsultaDeMedios(consulta: string, porOmision = false): boolean {
  return useSyncExternalStore(
    (alCambiar) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", alCambiar);
      return () => m.removeEventListener("change", alCambiar);
    },
    () => window.matchMedia(consulta).matches,
    () => porOmision,
  );
}

/** Punto de corte del diseño (README «Responsivo»): desde 900 px es escritorio (barra lateral), por debajo es celular. El mismo de `Shell.tsx` y de las reglas de `base.css`. */
export const useEscritorio = (): boolean => useConsultaDeMedios("(min-width: 900px)", true);

/** ¿El puntero principal es táctil (dedo)? Entonces nada se arrastra: se mueve con botones. */
export const usePunteroTactil = (): boolean => useConsultaDeMedios("(pointer: coarse)");
