// La tarjeta de un alumno en la lista: avatar y nombre (toda la tarjeta lleva a su expediente), el grupo con el color de su disciplina y la sucursal, la asistencia de 30 días y la situación de
// su cuenta. La disciplina, la asistencia y la cuenta vienen de `GET /api/alumnos/resumen`; sin ese resumen la tarjeta dice lo que ya sabe (nombre, edad, familia y estatus).

import { Link } from "react-router-dom";
import { EtiquetaDisciplina, iniciales, useDisciplina } from "../../ui/disciplina.tsx";
import { Insignia } from "../../ui/basicos.tsx";
import { asistenciaEsBaja, lineaDeFamilia, porcentajeEntero, SITUACION_DE_CUENTA, sucursalesDe, type ResumenDeAlumno } from "./alumnos-vista.ts";
import { BarraDeAvance } from "./BarraDeAvance.tsx";
import type { AlumnoDeLista } from "./tipos.ts";
import { ESTATUS_DE_ALUMNO, nombreCompleto } from "./vista.ts";

export function TarjetaDeAlumno({ alumno, resumen }: { alumno: AlumnoDeLista; resumen: ResumenDeAlumno | undefined }) {
  const ref = useDisciplina<HTMLLIElement>(resumen?.inscripciones[0]?.vertical.color_marca ?? null);
  const asistencia = porcentajeEntero(resumen?.asistencia_30_dias);
  const cuenta = resumen?.cuenta ? SITUACION_DE_CUENTA[resumen.cuenta] : null;
  const estatus = ESTATUS_DE_ALUMNO[alumno.estatus];
  return (
    <li ref={ref} className="alumno-tarjeta tarjeta-movil" data-prueba={`alumno-${alumno.id}`}>
      <div className="alumno-tarjeta-cabeza">
        <span className="alumno-tarjeta-avatar" aria-hidden="true">
          {iniciales(nombreCompleto(alumno))}
        </span>
        <span className="alumno-tarjeta-texto">
          <Link className="alumno-tarjeta-nombre" to={`/alumnos/${alumno.id}`}>
            {nombreCompleto(alumno)}
          </Link>
          <span className="alumno-tarjeta-detalle">{lineaDeFamilia(alumno)}</span>
        </span>
        {alumno.estatus !== "activo" ? <Insignia tono={estatus?.tono ?? "neutro"}>{estatus?.texto ?? alumno.estatus}</Insignia> : null}
      </div>
      {resumen ? (
        <div className="alumno-tarjeta-etiquetas">
          {resumen.inscripciones.map((i) => (
            <EtiquetaDisciplina key={i.id} nombre={i.grupo.nombre} color={i.vertical.color_marca} />
          ))}
          {sucursalesDe(resumen).map((s) => (
            <span key={s} className="alumno-tarjeta-sucursal">
              {s}
            </span>
          ))}
          {resumen.inscripciones.length === 0 ? <span className="alumno-tarjeta-sucursal">Sin grupo vigente</span> : null}
        </div>
      ) : null}
      {resumen && (asistencia !== null || cuenta) ? (
        <div className="alumno-tarjeta-pie">
          {asistencia !== null ? (
            <span className="alumno-tarjeta-asistencia">
              <BarraDeAvance porcentaje={asistencia} tono={asistenciaEsBaja(asistencia) ? "alerta" : "exito"} />
              {asistencia}% asistencia
            </span>
          ) : (
            <span className="alumno-tarjeta-asistencia">Sin asistencia registrada</span>
          )}
          {cuenta ? <Insignia tono={cuenta.tono}>{cuenta.texto}</Insignia> : null}
        </div>
      ) : null}
    </li>
  );
}
