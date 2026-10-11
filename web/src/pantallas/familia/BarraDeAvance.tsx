// Una barra fina de avance (asistencia de la tarjeta, avance hacia el próximo examen). El ancho sale de la variable `--p` (puesta con `setProperty`, sin estilos en línea) y es decorativo: el texto
// de al lado dice la cifra. `tono`: `exito` (verde), `alerta` (ámbar) o `disciplina` (el color de la disciplina del contenedor).

import { useLayoutEffect, useRef } from "react";

export function BarraDeAvance({ porcentaje, tono, grande = false }: { porcentaje: number; tono: "exito" | "alerta" | "disciplina"; grande?: boolean }) {
  const relleno = useRef<HTMLSpanElement>(null);
  const p = Math.max(0, Math.min(100, porcentaje));
  useLayoutEffect(() => {
    relleno.current?.style.setProperty("--p", `${p}%`);
  }, [p]);
  return (
    <span className={grande ? "barra-avance-fina barra-avance-fina-grande" : "barra-avance-fina"} aria-hidden="true">
      <span ref={relleno} className={`barra-avance-fina-relleno barra-avance-fina-${tono}`} />
    </span>
  );
}
