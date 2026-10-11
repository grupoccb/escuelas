// «Saldo de la familia» (R6b): la cifra, cuántos cargos vencidos y por cuánto (o «Nada vencido»), y el acceso al estado de cuenta. Importes siempre como texto exacto del servidor
// (`lib/dinero.ts`): ninguna cuenta con flotantes.

import { Link } from "react-router-dom";
import { formatear } from "../../lib/dinero.ts";
import { Cargando, ErrorDeCarga, Tarjeta } from "../../ui/basicos.tsx";
import type { Carga } from "../../ui/hooks.ts";
import { Icono } from "../../ui/Icono.tsx";
import type { EstadoDeCuenta } from "../recepcion/tipos.ts";
import { contarCargosVencidos, textoDeCargosVencidos } from "./resumen-de-familia.ts";

export function SaldoDeLaFamilia({ tutorId, cuenta }: { tutorId: string; cuenta: Carga<EstadoDeCuenta> }) {
  const datos = cuenta.datos;
  const vencidos = datos ? contarCargosVencidos(datos.hijos) : 0;
  return (
    <Tarjeta className="ficha-tarjeta ficha-saldo">
      <h2 className="ficha-saldo-titulo">Saldo de la familia</h2>
      {cuenta.error ? <ErrorDeCarga error={cuenta.error} alReintentar={cuenta.recargar} /> : null}
      {cuenta.cargando && !datos ? <Cargando /> : null}
      {datos ? (
        <div className="ficha-saldo-cuerpo" data-prueba="saldo-de-la-familia">
          <p className="ficha-saldo-cifra" data-prueba="saldo">
            {formatear(datos.resumen.saldo)}
          </p>
          {vencidos > 0 ? (
            <span className="ficha-pildora ficha-pildora-vencido" data-prueba="pildora-vencido">
              <Icono nombre="alerta" tamano={14} />
              <span>
                {textoDeCargosVencidos(vencidos)} · <span data-prueba="vencido">{formatear(datos.resumen.vencido)}</span>
              </span>
            </span>
          ) : (
            <span className="ficha-pildora ficha-pildora-corriente" data-prueba="pildora-vencido">
              <Icono nombre="exito" tamano={14} />
              Nada vencido
            </span>
          )}
        </div>
      ) : null}
      <Link className="ficha-saldo-enlace" to={`/cuenta/${tutorId}`}>
        Ver estado de cuenta
      </Link>
    </Tarjeta>
  );
}
