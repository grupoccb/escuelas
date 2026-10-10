// «Asistió» / «No asistió» de una clase muestra (Hoy y el registro del alumno). V7: la opción ya elegida se ve elegida (con su palomita y `aria-pressed`) y no apagada, y
// solo el botón que se tocó dice «Procesando…» (antes se apagaban los dos). Corregir una marca equivocada es tocar el otro botón: un paso.
// Rediseño: dos botones de 48 px de alto, lado a lado, y debajo (no al lado) el texto que explica por qué están apagados.

import { useId } from "react";
import { Boton } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";

export type Marca = "asistio" | "no_asistio";

export function BotonesDeAsistencia({ estatus, empezo, bloqueado = false, procesando, alMarcar }: { estatus: string; empezo: boolean; bloqueado?: boolean; procesando: Marca | null; alMarcar: (m: Marca) => void }) {
  const idAyuda = useId();
  const boton = (marca: Marca, texto: string) => {
    const elegida = estatus === marca;
    return (
      <Boton
        className={`asistencia-boton${elegida ? " boton-elegido" : ""}`}
        aria-pressed={elegida}
        aria-describedby={!empezo ? idAyuda : undefined}
        disabled={!empezo || elegida || bloqueado || (procesando !== null && procesando !== marca)}
        cargando={procesando === marca}
        onClick={() => alMarcar(marca)}
      >
        {elegida ? <Icono nombre="exito" tamano={18} /> : null}
        {texto}
      </Boton>
    );
  };
  return (
    <div className="asistencia">
      <div className="asistencia-fila">
        {boton("asistio", "Asistió")}
        {boton("no_asistio", "No asistió")}
      </div>
      {!empezo ? (
        <p className="asistencia-ayuda" id={idAyuda}>
          La asistencia se marca desde la hora de la clase.
        </p>
      ) : null}
    </div>
  );
}
