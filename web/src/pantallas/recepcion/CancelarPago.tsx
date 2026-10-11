// «Cancelar el pago» (R5b, README «Estado de cuenta»): el diálogo que comparten «Registrar pago» (pagos recientes) y «Estado de cuenta». Se cancela SIN borrar el pago: sus cargos recuperan
// el saldo y en el cierre del día sale como cancelado. El motivo es obligatorio. El botón destructivo es el de contorno rojo (el principal de la pantalla sigue siendo otro).

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Boton, ErrorDeAccion } from "../../ui/basicos.tsx";
import { CampoArea } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion } from "../../ui/hooks.ts";
import { folioDePago } from "./reparto.ts";

export function CancelarPago({ pago, alCerrar, alCancelado }: { pago: { id: string; monto: string } | null; alCerrar: () => void; alCancelado: () => void }) {
  const [motivo, setMotivo] = useState("");
  const accion = useAccion();
  const { avisar } = useAvisos();
  const cerrar = () => {
    setMotivo("");
    accion.limpiar();
    alCerrar();
  };
  return (
    <Dialogo abierto={pago !== null} titulo={`Cancelar el pago ${pago ? folioDePago(pago.id) : ""}`.trim()} alCerrar={cerrar}>
      <p className="cancelar-advertencia">
        <Icono nombre="alerta" tamano={18} />
        <span>{formatear(pago?.monto)} dejan de contar. Los cargos que cubría vuelven a quedar pendientes y sale en el cierre del día como cancelado. No se puede deshacer.</span>
      </p>
      <CampoArea etiqueta="Motivo de la cancelación" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} requerido placeholder="Por ejemplo: se registró dos veces" rows={3} />
      <ErrorDeAccion error={accion.error} />
      <div className="formulario-acciones cancelar-acciones">
        <Boton
          variante="peligro"
          grande
          disabled={motivo.trim().length < 3}
          cargando={accion.ocupado}
          onClick={() =>
            void accion.ejecutar(async () => {
              await api.post(`/api/pagos/${pago?.id ?? ""}/cancelar`, { motivo: motivo.trim() });
              setMotivo("");
              avisar("Pago cancelado. Sus cargos volvieron a quedar pendientes.");
              alCancelado();
            })
          }
        >
          Cancelar el pago
        </Boton>
        <Boton onClick={cerrar}>No, conservarlo</Boton>
      </div>
    </Dialogo>
  );
}
