// El estado «Pago registrado» de «Registrar pago» (R4a): ocupa el lugar del formulario con el detalle del cobro (monto, método, referencia y folio), lo aplicado a cada cargo, el saldo que
// queda y las acciones del mostrador: «Imprimir recibo», «Registrar otro pago» y ver el estado de cuenta. En papel sale solo el recibo (ver las reglas de impresión de base.css).

import { Link } from "react-router-dom";
import { formatear } from "../../lib/dinero.ts";
import { Boton } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { detalleDelRecibo } from "./reparto.ts";
import { METODOS, nombreDeCargo, type Pago } from "./tipos.ts";

export function PagoRegistrado({ pago, tutorId, saldoDespues, alOtro }: { pago: Pago; tutorId: string; saldoDespues: string | null; alOtro: () => void }) {
  const metodo = METODOS.find((m) => m.valor === pago.metodo)?.texto ?? pago.metodo;
  return (
    <section className="tarjeta cobro-formulario cobro-recibo" data-prueba="pago-registrado">
      <h2 className="solo-impresion recibo-titulo">Recibo de pago</h2>
      <span className="recibo-sello no-imprimir" aria-hidden="true">
        <Icono nombre="exito" tamano={28} />
      </span>
      <div role="status" className="recibo-encabezado">
        <h2 className="recibo-titulo-pantalla no-imprimir">{pago.repetido ? "Este pago ya estaba registrado: no se duplicó" : "Pago registrado"}</h2>
        <p className="recibo-detalle">{detalleDelRecibo({ monto: pago.monto, metodo, referencia: pago.referencia, id: pago.id })}</p>
      </div>
      <ul className="recibo-reparto">
        {pago.aplicaciones.map((a) => (
          <li key={a.id}>
            {a.alumno.nombre} · {nombreDeCargo(a)}: {formatear(a.monto)}
          </li>
        ))}
      </ul>
      <dl className="recibo-resumen">
        <dt>Recibido</dt>
        <dd className="numero">{formatear(pago.monto)}</dd>
        {saldoDespues === null ? null : (
          <>
            <dt>Saldo después del pago</dt>
            <dd className={`numero${saldoDespues === "0.00" ? " recibo-saldo-cero" : ""}`} data-prueba="saldo-despues-del-pago">
              {formatear(saldoDespues)}
            </dd>
          </>
        )}
      </dl>
      <div className="recibo-acciones no-imprimir">
        <Boton className="boton-recibo" onClick={() => window.print()}>
          <Icono nombre="imprimir" tamano={18} />
          Imprimir recibo
        </Boton>
        <Boton variante="sutil" className="boton-recibo" onClick={alOtro}>
          Registrar otro pago
        </Boton>
        <Link className="boton boton-recibo" to={`/cuenta/${tutorId}`}>
          Ver el estado de cuenta
        </Link>
      </div>
    </section>
  );
}
