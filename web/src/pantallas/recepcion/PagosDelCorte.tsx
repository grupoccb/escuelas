// «Cada pago» y «Pagos cancelados este día» del «Cierre del día» (R5c): una fila por pago con la hora (12 h, en la zona de la sucursal), la familia con su folio, la forma de pago y el importe.
// La referencia y quién lo cobró van debajo, para cuadrar. Un cancelado va en rojo y con el importe tachado; dice si no cuenta (se cobró y canceló hoy) o si sale de la caja de hoy (era de otro día).

import { formatear } from "../../lib/dinero.ts";
import { Insignia, Tarjeta } from "../../ui/basicos.tsx";
import { horaDelInstante } from "../maestro/linea-de-tiempo.ts";
import type { PagoCancelado, PagoDelDia } from "./corte.ts";
import { folioDePago } from "./reparto.ts";
import { METODOS } from "./tipos.ts";

const textoDeMetodo = (m: string): string => METODOS.find((x) => x.valor === m)?.texto ?? m;
const hora = (iso: string, zona: string): string => horaDelInstante(new Date(iso).getTime(), zona);

function FilaDePago({ pago, zona, cancelado }: { pago: PagoDelDia | PagoCancelado; zona: string; cancelado?: PagoCancelado }) {
  return (
    <li className={cancelado ? "corte-pago corte-pago-cancelado" : "corte-pago"}>
      <span className="corte-pago-hora numero">{hora(pago.hora, zona)}</span>
      <span className="corte-pago-quien">
        <span>
          <strong>{pago.familia}</strong> <span className="corte-pago-folio">· {folioDePago(pago.id)}{cancelado ? " · cancelado" : ""}</span>
        </span>
        {cancelado ? (
          <>
            <span>{cancelado.de_otro_dia ? <Insignia tono="alerta">Cobrado otro día: sale de la caja de hoy</Insignia> : <Insignia>Cobrado y cancelado hoy: no cuenta</Insignia>}</span>
            <span className="corte-pago-sub">
              Cobró {pago.registrado_por?.nombre ?? "—"}, canceló {cancelado.cancelado_por?.nombre ?? "—"}
              {cancelado.motivo ? ` · ${cancelado.motivo}` : ""}
            </span>
          </>
        ) : (
          <span className="corte-pago-sub">
            {pago.referencia ? `Ref. ${pago.referencia} · ` : ""}Cobró {pago.registrado_por?.nombre ?? "—"}
          </span>
        )}
      </span>
      <span className="corte-pago-metodo">{textoDeMetodo(pago.metodo)}</span>
      <strong className="numero corte-pago-monto">{formatear(pago.monto)}</strong>
    </li>
  );
}

export function CadaPago({ pagos, zona }: { pagos: readonly PagoDelDia[]; zona: string }) {
  return (
    <Tarjeta titulo="Cada pago">
      <ol className="corte-pagos" data-prueba="pagos-del-dia">
        {pagos.map((p) => (
          <FilaDePago key={p.id} pago={p} zona={zona} />
        ))}
      </ol>
    </Tarjeta>
  );
}

export function PagosCancelados({ cancelados, zona }: { cancelados: readonly PagoCancelado[]; zona: string }) {
  return (
    <Tarjeta titulo="Pagos cancelados este día">
      <ol className="corte-pagos" data-prueba="cancelados">
        {cancelados.map((p) => (
          <FilaDePago key={p.id} pago={p} zona={zona} cancelado={p} />
        ))}
      </ol>
    </Tarjeta>
  );
}
