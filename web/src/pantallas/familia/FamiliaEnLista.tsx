// La tarjeta de una familia en «Familias» (R6b): monograma, nombre y teléfono, sus hijos en etiquetas del color de su disciplina, la sucursal y el estado de la cuenta. Toda la tarjeta
// lleva a la ficha (el enlace del nombre se estira sobre ella): un solo destino para quien usa lector de pantalla o teclado, y todo el área para quien toca.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Tutor } from "../../api/tipos.ts";
import { Insignia } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { iniciales } from "../recepcion/FamiliaElegida.tsx";
import { EtiquetaDeHijo } from "./EtiquetaDeHijoEnLista.tsx";
import { etiquetasDeHijos, saldoEnPalabras, sucursalesDeLaFamilia, type ResumenDeFamilia } from "./resumen-de-familia.ts";
import { nombreCompleto } from "./vista.ts";

export function FamiliaEnLista({ tutor, resumen, sucursalDeAlta, pie }: { tutor: Tutor; resumen: ResumenDeFamilia | undefined; sucursalDeAlta: string | null; pie?: ReactNode }) {
  const etiquetas = etiquetasDeHijos(tutor.alumnos, resumen);
  const saldo = resumen?.saldo ? saldoEnPalabras(resumen.saldo.estado) : null;
  const sucursal = sucursalesDeLaFamilia(resumen, sucursalDeAlta);
  return (
    <li className="familia-tarjeta" data-prueba={`familia-${tutor.id}`}>
      <div className="familia-tarjeta-cabeza">
        <span className="avatar-familia avatar-familia-lista" aria-hidden="true">
          {iniciales(tutor.nombre, tutor.apellidos)}
        </span>
        <span className="familia-tarjeta-datos">
          <Link className="familia-tarjeta-enlace" to={`/familias/${tutor.id}`}>
            {nombreCompleto(tutor)}
          </Link>
          <span className="numero muted">{tutor.telefono}</span>
        </span>
      </div>
      {etiquetas.length > 0 ? (
        <ul className="etiquetas-lista" aria-label="Hijos">
          {etiquetas.map((e) => (
            <li key={e.clave}>
              <EtiquetaDeHijo etiqueta={e} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted familia-tarjeta-sin-hijos">Sin alumnos</p>
      )}
      {pie}
      <div className="familia-tarjeta-pie">
        <span className="muted">{sucursal}</span>
        {saldo ? (
          <Insignia tono={saldo.tono}>
            <span className="insignia-con-icono">
              {saldo.tono === "alerta" ? <Icono nombre="alerta" tamano={13} /> : saldo.tono === "exito" ? <Icono nombre="exito" tamano={13} /> : null}
              {saldo.texto}
            </span>
          </Insignia>
        ) : null}
      </div>
    </li>
  );
}
