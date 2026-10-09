// Uniformes (y demás beneficios de producto) por entregar: lo que se liberó al saldar la primera mensualidad y recepción debe dar. Marcar «entregado»
// descuenta UNA pieza del inventario y crea la venta promocional (precio 0) en la misma transacción; sin existencia lo rechaza el servidor.

import { useState } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { formatearInstante } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import type { BeneficioPorEntregar, Producto } from "./tipos.ts";

function Entregar({ beneficio, alCerrar, alEntregar }: { beneficio: BeneficioPorEntregar | null; alCerrar: () => void; alEntregar: () => void }) {
  const productos = useCarga((senal) => api.get<Pagina<Producto>>("/api/productos", { activo: true, con_stock: true, limite: 100 }, senal), [beneficio?.id], beneficio !== null && beneficio.producto_id === null);
  const [eleccion, setEleccion] = useState("");
  const accion = useAccion();
  // Si el beneficio ya fija el producto, no hay nada que elegir; si solo dice «Uniforme», recepción elige la pieza (la talla del alumno primero).
  const talla = beneficio?.alumno.talla_uniforme ?? null;
  const candidatos = (productos.datos?.datos ?? []).filter((p) => talla === null || p.talla === talla);
  const elegido = beneficio?.producto_id ?? (candidatos.some((p) => p.id === eleccion) ? eleccion : (candidatos[0]?.id ?? ""));
  const cerrar = () => {
    setEleccion("");
    accion.limpiar();
    alCerrar();
  };
  return (
    <Dialogo abierto={beneficio !== null} titulo="Entregar" alCerrar={cerrar}>
      <p>
        {beneficio?.descripcion ?? "Producto"} para <strong>{beneficio?.alumno.nombre} {beneficio?.alumno.apellidos}</strong>
        {talla ? ` · talla ${talla}` : ""}
      </p>
      {beneficio && beneficio.producto_id === null ? (
        <>
          {productos.cargando ? <Cargando texto="Viendo el inventario…" /> : null}
          {productos.error ? <ErrorDeCarga error={productos.error} alReintentar={productos.recargar} /> : null}
          {productos.datos && candidatos.length === 0 ? <Aviso tono="alerta">No hay piezas con existencia{talla ? ` de la talla ${talla}` : ""}. Registra la entrada de inventario o elige otra talla con el administrador.</Aviso> : null}
          {candidatos.length > 0 ? <CampoSelect etiqueta="Pieza que se entrega" value={elegido} onChange={(e) => setEleccion(e.target.value)} opciones={candidatos.map((p) => ({ valor: p.id, texto: `${p.nombre}${p.talla ? ` · talla ${p.talla}` : ""} · ${p.stock} en existencia` }))} /> : null}
        </>
      ) : null}
      <ErrorDeAccion error={accion.error} />
      <div className="formulario-acciones">
        <Boton
          variante="primario"
          disabled={elegido === ""}
          cargando={accion.ocupado}
          onClick={() =>
            void accion.ejecutar(async () => {
              await api.post(`/api/beneficios/${beneficio?.id ?? ""}/entregar`, beneficio?.producto_id ? {} : { producto_id: elegido });
              cerrar();
              alEntregar();
            })
          }
        >
          Marcar como entregado
        </Boton>
        <Boton onClick={cerrar}>Todavía no</Boton>
      </div>
    </Dialogo>
  );
}

export default function Uniformes() {
  useTitulo("Uniformes por entregar");
  const { sucursalId } = useSesion();
  const lista = useCarga((senal) => api.get<Pagina<BeneficioPorEntregar>>("/api/beneficios/por-entregar", { limite: 50, ...(sucursalId ? { sucursal_id: sucursalId } : {}) }, senal), [sucursalId]);
  const stock = useCarga((senal) => api.get<Pagina<Producto>>("/api/productos", { activo: true, limite: 100 }, senal), []);
  const [entregando, setEntregando] = useState<BeneficioPorEntregar | null>(null);
  return (
    <Marco titulo="Uniformes por entregar" subtitulo="Lo que se liberó al saldar la primera mensualidad">
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="No hay nada por entregar">Cuando una familia salde su primera mensualidad, lo que le toca aparecerá aquí.</Vacio> : null}
      <ul className="lista-tarjetas">
        {(lista.datos?.datos ?? []).map((b) => (
          <li key={b.id} className="tarjeta pila" data-prueba={`beneficio-${b.id}`}>
            <div className="fila fila-entre">
              <strong>
                {b.alumno.nombre} {b.alumno.apellidos}
              </strong>
              <Insignia tono="info">{b.descripcion ?? "Producto"}</Insignia>
            </div>
            <p className="muted">
              {b.promocion} · {b.grupo}
              {b.alumno.talla_uniforme ? ` · talla ${b.alumno.talla_uniforme}` : " · sin talla registrada"}
              <br />
              Familia: {b.tutor ? `${b.tutor.nombre} ${b.tutor.apellidos ?? ""} (${b.tutor.telefono})` : "—"} · liberado {formatearInstante(b.liberado_en)}
            </p>
            <div>
              <Boton variante="primario" onClick={() => setEntregando(b)}>
                Marcar entregado
              </Boton>
            </div>
          </li>
        ))}
      </ul>
      <Tarjeta titulo="Existencia">
        {stock.datos ? (
          <ul data-prueba="existencia">
            {stock.datos.datos.map((p) => (
              <li key={p.id}>
                {p.nombre}
                {p.talla ? ` · talla ${p.talla}` : ""} · {formatear(p.precio)}: <strong>{p.stock}</strong> {p.stock === 1 ? "pieza" : "piezas"}
              </li>
            ))}
          </ul>
        ) : null}
      </Tarjeta>
      <Entregar
        key={entregando?.id ?? "ninguno"}
        beneficio={entregando}
        alCerrar={() => setEntregando(null)}
        alEntregar={() => {
          lista.recargar();
          stock.recargar();
        }}
      />
    </Marco>
  );
}
