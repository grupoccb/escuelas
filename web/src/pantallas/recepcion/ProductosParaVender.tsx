// «Elige el producto» de Ventas (R5c): una tarjeta por producto con su precio y su existencia dicha con palabras («Quedan 6», «Queda 1», «Agotado»). La elegida lleva el borde de la marca;
// una agotada no se puede elegir (borde punteado). Son botones con `aria-pressed`, así que se eligen con teclado, ratón o dedo.

import { formatear } from "../../lib/dinero.ts";
import { existenciaDe } from "./ventas.ts";
import type { Producto } from "./tipos.ts";

export function ProductosParaVender({ productos, elegidoId, alElegir }: { productos: readonly Producto[]; elegidoId: string | undefined; alElegir: (id: string) => void }) {
  return (
    <ul className="productos-rejilla" data-prueba="productos">
      {productos.map((p) => {
        const existencia = existenciaDe(p.stock);
        const agotado = existencia.tono === "agotado";
        return (
          <li key={p.id}>
            <button type="button" className="producto-tarjeta" aria-pressed={p.id === elegidoId} disabled={agotado} data-prueba={`producto-${p.id}`} onClick={() => alElegir(p.id)}>
              <span className="producto-nombre">{p.nombre}</span>
              {p.talla ? <span className="producto-talla">Talla {p.talla}</span> : null}
              <span className="producto-precio numero">{formatear(p.precio)}</span>
              <span className={`producto-existencia producto-existencia-${existencia.tono}`} data-prueba="existencia-del-producto">
                {existencia.texto}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
