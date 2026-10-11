// «Asistió» / «No asistió» de una clase muestra (Hoy y el registro del alumno). V7: la opción ya elegida se ve elegida (con su palomita y `aria-pressed`) y no apagada, y
// solo el botón que se tocó dice «Procesando…» (antes se apagaban los dos). Corregir una marca equivocada es tocar el otro botón: un paso.
// R4b (handoff v2): el grupo se llama «Asistencia de {alumno}»; antes de la hora de la clase los botones están apagados y el texto de abajo dice a partir de cuándo; tras «No asistió» el
// texto dice lo que pasa (el asesor recibe una tarea para llamar a la familia). Dos botones de 48 px de alto, lado a lado.

import { useId } from "react";
import { Boton } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";

export type Marca = "asistio" | "no_asistio";

export function BotonesDeAsistencia({
  estatus,
  empezo,
  bloqueado = false,
  procesando,
  alMarcar,
  alumno,
  horaDeLaClase,
}: {
  estatus: string;
  empezo: boolean;
  bloqueado?: boolean;
  procesando: Marca | null;
  alMarcar: (m: Marca) => void;
  /** El nombre del alumno, para el nombre accesible del grupo. */
  alumno?: string | null;
  /** «4:00 pm»: la hora desde la que se puede marcar (para el texto de antes de la clase). */
  horaDeLaClase?: string;
}) {
  const idAyuda = useId();
  const boton = (marca: Marca, texto: string) => {
    const elegida = estatus === marca;
    return (
      <Boton
        className={`asistencia-boton${elegida ? ` boton-elegido asistencia-${marca}` : ""}`}
        aria-pressed={elegida}
        aria-describedby={!empezo || (marca === "no_asistio" && estatus === "no_asistio") ? idAyuda : undefined}
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
      <div className="asistencia-fila" role="group" aria-label={alumno ? `Asistencia de ${alumno}` : "Asistencia"}>
        {boton("asistio", "Asistió")}
        {boton("no_asistio", "No asistió")}
      </div>
      {!empezo ? (
        <p className="asistencia-ayuda" id={idAyuda}>
          {horaDeLaClase ? `La asistencia se marca a partir de las ${horaDeLaClase}.` : "La asistencia se marca a partir de la hora de la clase."}
        </p>
      ) : estatus === "no_asistio" ? (
        <p className="asistencia-ayuda asistencia-ayuda-aviso" id={idAyuda}>
          El asesor recibe una tarea para llamar a la familia y ofrecerle otra fecha.
        </p>
      ) : null}
    </div>
  );
}
