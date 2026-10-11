// Ventas de productos (uniformes, playeras…): se elige el producto con su existencia a la vista, se vende a un alumno (el cargo queda a nombre del responsable de pago) y se puede anular.
// La última pieza la gana una sola venta: el servidor descuenta la existencia de forma atómica y rechaza la otra con 409 (ver `NuevaVenta`). R5c: tarjetas de producto, «Nueva venta» con
// cantidad − / +, y las ventas recientes en filas suaves.

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Pagina } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoArea } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { NuevaVenta } from "./NuevaVenta.tsx";
import { ProductosParaVender } from "./ProductosParaVender.tsx";
import type { Producto, Venta } from "./tipos.ts";
import { cuandoSeVendio, disponibles, productoElegido } from "./ventas.ts";

export default function Ventas() {
  useTitulo("Ventas");
  const { puede } = useSesion();
  const productos = useCarga((senal) => api.get<Pagina<Producto>>("/api/productos", { activo: true, limite: 100 }, senal), []);
  const ventas = useCarga((senal) => api.get<Pagina<Venta>>("/api/ventas", { limite: 10 }, senal), []);
  const [hecha, setHecha] = useState<Venta | null>(null);
  const [anulando, setAnulando] = useState<Venta | null>(null);
  const [motivo, setMotivo] = useState("");
  const [productoId, setProductoId] = useState("");
  const anular = useAccion();
  const lista = productos.datos?.datos ?? [];
  const elegido = productoElegido(lista, productoId);
  const refrescar = () => {
    productos.recargar();
    ventas.recargar();
  };

  return (
    <Marco titulo="Ventas" subtitulo="Uniformes, playeras y accesorios. El cargo queda a nombre del responsable de pago del alumno.">
      {hecha ? (
        <Aviso tono="exito" titulo="Venta registrada">
          <p data-prueba="venta-registrada">
            {hecha.cantidad} × {hecha.producto.nombre}
            {hecha.producto.talla ? ` (talla ${hecha.producto.talla})` : ""} para {hecha.alumno.nombre}: <strong>{formatear(hecha.total)}</strong>. El cargo quedó a nombre del responsable de pago.
          </p>
          {/* V7: vender y cobrar eran dos pantallas sin camino de una a otra. */}
          <p>
            <Link className="boton boton-sutil" to={`/pagos?tutor=${hecha.tutor_id}`} data-prueba="cobrar-la-venta">
              Cobrar ahora
            </Link>
          </p>
        </Aviso>
      ) : null}
      <div className="ventas-fila">
        <section className="ventas-elegir" aria-labelledby="ventas-elegir-titulo">
          <h2 id="ventas-elegir-titulo">Elige el producto</h2>
          {productos.error ? <ErrorDeCarga error={productos.error} alReintentar={productos.recargar} /> : null}
          {productos.cargando && !productos.datos ? <Cargando /> : null}
          {productos.datos && lista.length === 0 ? (
            <Vacio icono="ventas" titulo="No hay productos registrados.">
              Avisa a quien administra el sistema para que dé de alta los productos.
            </Vacio>
          ) : null}
          {lista.length > 0 ? <ProductosParaVender productos={lista} elegidoId={elegido?.id} alElegir={setProductoId} /> : null}
        </section>
        {puede("ventas:registrar") && productos.datos ? (
          <NuevaVenta
            producto={elegido}
            hayProductos={disponibles(lista).length > 0}
            alVender={(v) => {
              setHecha(v);
              refrescar();
            }}
            alFallar={() => {
              setHecha(null);
              productos.recargar();
            }}
          />
        ) : null}
      </div>
      <Tarjeta titulo="Ventas recientes">
        {ventas.error ? <ErrorDeCarga error={ventas.error} alReintentar={ventas.recargar} /> : null}
        {ventas.datos && ventas.datos.datos.length === 0 ? <Vacio icono="ventas" titulo="Todavía no hay ventas." /> : null}
        <ul className="ventas-lista" data-prueba="ventas-recientes">
          {(ventas.datos?.datos ?? []).map((v) => {
            const anulada = v.estatus !== "registrada";
            return (
              <li key={v.id} className={anulada ? "venta-fila venta-fila-anulada" : "venta-fila"} data-prueba={`venta-${v.id}`}>
                <span className="venta-datos">
                  <strong>
                    {v.producto.nombre}
                    {v.producto.talla ? ` (${v.producto.talla})` : ""} × {v.cantidad}
                  </strong>
                  <span className="muted">
                    {v.alumno.nombre} · {cuandoSeVendio(v.fecha)}
                  </span>
                </span>
                <span className="venta-derecha">
                  {v.es_promocional && !anulada ? <span className="venta-promocion">Entrega de promoción</span> : null}
                  <strong className={anulada ? "numero venta-monto-anulada" : "numero"}>{formatear(v.total)}</strong>
                  {anulada ? <span className="venta-anulada">Anulada · la pieza regresó al inventario</span> : null}
                  {!anulada && !v.es_promocional && puede("ventas:anular") ? (
                    <Boton variante="peligro" onClick={() => setAnulando(v)}>
                      Anular
                    </Boton>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Tarjeta>
      <Dialogo abierto={anulando !== null} titulo="Anular la venta" alCerrar={() => { setAnulando(null); setMotivo(""); anular.limpiar(); }}>
        <p>Se cancela su cargo y las piezas regresan a la existencia. Venta: <strong>{anulando ? formatear(anulando.total) : ""}</strong></p>
        <CampoArea etiqueta="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} requerido />
        <ErrorDeAccion error={anular.error} />
        <div className="formulario-acciones">
          <Boton
            variante="peligro"
            grande
            disabled={motivo.trim().length < 3}
            cargando={anular.ocupado}
            onClick={() =>
              void anular.ejecutar(async () => {
                await api.post(`/api/ventas/${anulando?.id ?? ""}/anular`, { motivo: motivo.trim() });
                setAnulando(null);
                setMotivo("");
                refrescar();
              })
            }
          >
            Anular la venta
          </Boton>
          <Boton onClick={() => { setAnulando(null); setMotivo(""); }}>Conservarla</Boton>
        </div>
      </Dialogo>
    </Marco>
  );
}
