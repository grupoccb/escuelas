// «Hijos» de la ficha de la familia (R6b): una fila por hijo con su monograma en el tono de su disciplina, nombre y edad, grupo, horario y sucursal de cada inscripción activa, y lo que dice
// de sus adultos («Marisol paga», «Recogen Marisol y Rodrigo»), con su acceso al expediente. Debajo, las promociones activas de la familia. Todo el color sale de `color_marca`.

import { Link } from "react-router-dom";
import { Aviso, Insignia, Tarjeta } from "../../ui/basicos.tsx";
import { ConDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { iniciales } from "../recepcion/FamiliaElegida.tsx";
import { avisosDePromocion, banderasDelHijo, lineaDeInscripcion, textoDeEdad, type ResumenDeFamilia } from "./resumen-de-familia.ts";
import type { VinculoDeAlumno } from "./tipos.ts";
import { ESTATUS_DE_ALUMNO, nombreCompleto } from "./vista.ts";

export interface HijoDeLaFicha {
  alumnoId: string;
  nombre: string;
  apellidos: string;
  estatus: string;
  edad: number | null;
  vinculos: readonly VinculoDeAlumno[];
}

export function HijosDeLaFamilia({ hijos, resumen }: { hijos: readonly HijoDeLaFicha[]; resumen: ResumenDeFamilia | undefined }) {
  const avisos = avisosDePromocion(hijos.map((h) => ({ alumno_id: h.alumnoId, nombre: h.nombre })), resumen);
  return (
    <Tarjeta titulo="Hijos" className="ficha-tarjeta">
      {hijos.length === 0 ? <Aviso>Esta familia todavía no tiene alumnos.</Aviso> : null}
      <ul className="ficha-hijos" data-prueba="hijos">
        {hijos.map((h) => {
          const inscripciones = resumen?.hijos.find((x) => x.alumno_id === h.alumnoId)?.inscripciones ?? [];
          const estatus = ESTATUS_DE_ALUMNO[h.estatus];
          const edad = textoDeEdad(h.edad);
          return (
            <ConDisciplina key={h.alumnoId} as="li" color={inscripciones[0]?.disciplina.color_marca} className="ficha-hijo">
              <span className="avatar-hijo" aria-hidden="true">
                {iniciales(h.nombre, h.apellidos)}
              </span>
              <div className="ficha-hijo-datos" data-prueba={`hijo-${h.alumnoId}`}>
                <strong className="ficha-hijo-nombre">
                  {nombreCompleto(h)}
                  {edad ? <span className="ficha-hijo-edad"> · {edad}</span> : null}
                </strong>
                {inscripciones.length > 0 ? (
                  inscripciones.map((i) => (
                    <span key={i.inscripcion_id} className="ficha-hijo-grupo">
                      {lineaDeInscripcion(i)}
                    </span>
                  ))
                ) : (
                  <span className="ficha-hijo-grupo">{resumen && h.estatus === "activo" ? "Sin inscripción activa" : ""}</span>
                )}
                <span className="ficha-chips">
                  {estatus && h.estatus !== "activo" ? <Insignia tono={estatus.tono}>{estatus.texto}</Insignia> : null}
                  {banderasDelHijo(h.vinculos).map((b) => (
                    <span key={b} className="ficha-chip">
                      {b}
                    </span>
                  ))}
                </span>
              </div>
              <Link className="boton" to={`/alumnos/${h.alumnoId}`} aria-label={`Ver expediente de ${nombreCompleto(h)}`}>
                Expediente
              </Link>
            </ConDisciplina>
          );
        })}
      </ul>
      {avisos.map((a) => (
        <p key={a} className="ficha-promo" data-prueba="promocion-activa">
          <Icono nombre="exito" tamano={18} />
          <span>{a}</span>
        </p>
      ))}
    </Tarjeta>
  );
}
