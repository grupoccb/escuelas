// Ventas de productos (uniformes, playeras…): la existencia a la vista, vender a un alumno (el cargo queda a nombre del responsable de pago) y anular. La última pieza
// la gana una sola venta: el servidor descuenta la existencia de forma atómica y rechaza la otra con 409; la pantalla lo explica y refresca la existencia.

import { useState, type FormEvent } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import { formatear, multiplicar } from "../../lib/dinero.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { aEntero } from "../../lib/numeros.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta } from "../../ui/basicos.tsx";
import { CampoArea, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import type { Producto, Venta } from "./tipos.ts";

interface AlumnoBuscado {
  id: string;
  nombre: string;
  apellidos: string;
}

function textoDeProducto(p: Producto): string {
  return `${p.nombre}${p.talla ? ` · talla ${p.talla}` : ""} · ${formatear(p.precio)}`;
}

function NuevaVenta({ productos, alVender, alFallar }: { productos: Producto[]; alVender: (v: Venta) => void; alFallar: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState<string | null>(null);
  const [alumnoId, setAlumnoId] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const accion = useAccion();
  const alumnos = useCarga((senal) => api.get<Pagina<AlumnoBuscado>>("/api/alumnos", { nombre: consulta ?? "", limite: 10 }, senal), [consulta], consulta !== null);
  const disponibles = productos.filter((p) => p.activo && p.stock > 0);
  const producto = disponibles.find((p) => p.id === productoId) ?? disponibles[0];
  const n = aEntero(cantidad);
  const alumno = alumnos.datos?.datos.find((a) => a.id === alumnoId) ?? alumnos.datos?.datos[0];
  const total = producto && n !== null && n > 0 ? multiplicar(producto.precio, n) : null;
  const excede = producto && n !== null && n > producto.stock;

  const vender = (e: FormEvent) => {
    e.preventDefault();
    if (!alumno || !producto || n === null || n < 1) return;
    void accion
      .ejecutar(async () => {
        alVender(await api.post<Venta>("/api/ventas", { alumno_id: alumno.id, producto_id: producto.id, cantidad: n }));
        return true;
      })
      // Si falla (p. ej. alguien vendió la última pieza), la existencia que se ve ya no es la real: se vuelve a leer.
      .then((ok) => {
        if (!ok) alFallar();
      });
  };

  return (
    <Tarjeta titulo="Nueva venta">
      <form className="formulario" onSubmit={vender}>
        <div className="rejilla rejilla-2">
          <CampoTexto etiqueta="Buscar al alumno por nombre" autoComplete="off" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <div className="fila">
            <Boton disabled={busqueda.trim().length < 2} onClick={() => { setConsulta(busqueda.trim()); setAlumnoId(""); }}>
              Buscar
            </Boton>
          </div>
        </div>
        {alumnos.cargando ? <Cargando texto="Buscando…" /> : null}
        {alumnos.error ? <ErrorDeCarga error={alumnos.error} alReintentar={alumnos.recargar} /> : null}
        {alumnos.datos && alumnos.datos.datos.length === 0 ? <Aviso tono="alerta">No encontré a ese alumno.</Aviso> : null}
        {alumnos.datos && alumnos.datos.datos.length > 0 ? <CampoSelect etiqueta="Alumno" value={alumno?.id ?? ""} onChange={(e) => setAlumnoId(e.target.value)} opciones={alumnos.datos.datos.map((a) => ({ valor: a.id, texto: `${a.nombre} ${a.apellidos}` }))} /> : null}
        <CampoSelect etiqueta="Producto" value={producto?.id ?? ""} onChange={(e) => setProductoId(e.target.value)} opciones={disponibles.map((p) => ({ valor: p.id, texto: `${textoDeProducto(p)} · ${p.stock} en existencia` }))} />
        <CampoTexto etiqueta="Cantidad" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} error={n === null || n < 1 ? "Escribe un número entero de piezas" : excede ? `Solo hay ${producto?.stock} en existencia` : undefined} />
        <p role="status" data-prueba="total-de-la-venta">
          Total: <strong>{formatear(total)}</strong>
        </p>
        <ErrorDeAccion error={accion.error} />
        <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={!alumno || !producto || n === null || n < 1 || excede === true}>
          Registrar venta
        </Boton>
      </form>
    </Tarjeta>
  );
}

export default function Ventas() {
  useTitulo("Ventas");
  const { puede } = useSesion();
  const productos = useCarga((senal) => api.get<Pagina<Producto>>("/api/productos", { activo: true, limite: 100 }, senal), []);
  const ventas = useCarga((senal) => api.get<Pagina<Venta>>("/api/ventas", { limite: 10 }, senal), []);
  const [hecha, setHecha] = useState<Venta | null>(null);
  const [anulando, setAnulando] = useState<Venta | null>(null);
  const [motivo, setMotivo] = useState("");
  const anular = useAccion();
  const refrescar = () => {
    productos.recargar();
    ventas.recargar();
  };

  return (
    <Marco titulo="Ventas" subtitulo="Productos, existencia y ventas recientes">
      {hecha ? (
        <Aviso tono="exito" titulo="Venta registrada">
          <p data-prueba="venta-registrada">
            {hecha.cantidad} × {hecha.producto.nombre}
            {hecha.producto.talla ? ` (talla ${hecha.producto.talla})` : ""} para {hecha.alumno.nombre}: <strong>{formatear(hecha.total)}</strong>. El cargo quedó a nombre del responsable de pago.
          </p>
        </Aviso>
      ) : null}
      <Tarjeta titulo="Existencia">
        {productos.error ? <ErrorDeCarga error={productos.error} alReintentar={productos.recargar} /> : null}
        {productos.cargando && !productos.datos ? <Cargando /> : null}
        <ul className="lista-tarjetas" data-prueba="productos">
          {(productos.datos?.datos ?? []).map((p) => (
            <li key={p.id} className="fila fila-entre" data-prueba={`producto-${p.id}`}>
              <span>{textoDeProducto(p)}</span>
              <span className="fila">
                <strong className="numero" data-prueba="existencia-del-producto">
                  {p.stock}
                </strong>
                {p.stock === 0 ? <Insignia tono="peligro">Agotado</Insignia> : p.stock === 1 ? <Insignia tono="alerta">Última pieza</Insignia> : null}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>
      {puede("ventas:registrar") && productos.datos ? (
        <NuevaVenta
          productos={productos.datos.datos}
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
      <Tarjeta titulo="Ventas recientes">
        {ventas.error ? <ErrorDeCarga error={ventas.error} alReintentar={ventas.recargar} /> : null}
        <ul className="lista-tarjetas" data-prueba="ventas-recientes">
          {(ventas.datos?.datos ?? []).map((v) => (
            <li key={v.id} className="fila fila-entre" data-prueba={`venta-${v.id}`}>
              <span>
                {v.cantidad} × {v.producto.nombre}
                {v.producto.talla ? ` (${v.producto.talla})` : ""} · {v.alumno.nombre} · <strong>{formatear(v.total)}</strong> · {formatearFecha(v.fecha)}{" "}
                <Insignia tono={v.estatus === "registrada" ? "exito" : "neutro"}>{v.estatus === "registrada" ? (v.es_promocional ? "Entrega de promoción" : "Registrada") : "Anulada"}</Insignia>
              </span>
              {v.estatus === "registrada" && !v.es_promocional && puede("ventas:anular") ? (
                <Boton variante="peligro" onClick={() => setAnulando(v)}>
                  Anular
                </Boton>
              ) : null}
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Dialogo abierto={anulando !== null} titulo="Anular la venta" alCerrar={() => { setAnulando(null); setMotivo(""); anular.limpiar(); }}>
        <p>Se cancela su cargo y las piezas regresan a la existencia. Venta: <strong>{anulando ? formatear(anulando.total) : ""}</strong></p>
        <CampoArea etiqueta="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} requerido />
        <ErrorDeAccion error={anular.error} />
        <div className="formulario-acciones">
          <Boton
            variante="peligro"
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
