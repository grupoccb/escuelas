// «Asistió» / «No asistió» de una clase muestra (Hoy y el registro del alumno). V7: la opción ya elegida se ve elegida (con su palomita y `aria-pressed`) y no apagada, y
// solo el botón que se tocó dice «Procesando…» (antes se apagaban los dos). Corregir una marca equivocada es tocar el otro botón: un paso.

import { Boton } from "../../ui/basicos.tsx";

export type Marca = "asistio" | "no_asistio";

export function BotonesDeAsistencia({ estatus, empezo, bloqueado = false, procesando, alMarcar }: { estatus: string; empezo: boolean; bloqueado?: boolean; procesando: Marca | null; alMarcar: (m: Marca) => void }) {
  const boton = (marca: Marca, texto: string) => {
    const elegida = estatus === marca;
    return (
      <Boton
        className={elegida ? "boton-elegido" : ""}
        aria-pressed={elegida}
        disabled={!empezo || elegida || bloqueado || (procesando !== null && procesando !== marca)}
        cargando={procesando === marca}
        onClick={() => alMarcar(marca)}
      >
        {elegida ? <span aria-hidden="true">✓ </span> : null}
        {texto}
      </Boton>
    );
  };
  return (
    <div className="fila">
      {boton("asistio", "Asistió")}
      {boton("no_asistio", "No asistió")}
      {!empezo ? <span className="muted">La asistencia se marca desde la hora de la clase.</span> : null}
    </div>
  );
}
