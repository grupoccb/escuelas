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
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import type { BeneficioPorEntregar, Producto } from "./tipos.ts";

function Entregar({ beneficio, yaNoEsta, alCerrar, alEntregar, alFallar }: { beneficio: BeneficioPorEntregar | null; /** La lista ya se refrescó y este uniforme no está: otra persona (u otra pantalla) lo entregó. */ yaNoEsta: boolean; alCerrar: () => void; alEntregar: () => void; alFallar: () => void }) {
  const productos = useCarga((senal) => api.get<Pagina<Producto>>("/api/productos", { activo: true, con_stock: true, limite: 100 }, senal), [beneficio?.id], beneficio !== null && beneficio.producto_id === null);
  const [eleccion, setEleccion] = useState("");
  const accion = useAccion();
  // Si el beneficio ya fija el producto, no hay nada que elegir; si solo dice «Uniforme», recepción elige la pieza (la talla del alumno primero).
  const talla = beneficio?.alumno.talla_uniforme ?? null;
  const candidatos = (productos.datos?.datos ?? []).filter((p) => talla === null || p.talla === talla);
  const elegido = beneficio?.producto_id ?? (candidatos.some((p) => p.id === eleccion) ? eleccion : (candidatos[0]?.id ?? ""));
  const yaEntregado = yaNoEsta || accion.error?.detalles.some((d) => d.campo === "motivo" && d.mensaje === "ya_entregado") === true;
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
      {beneficio && beneficio.producto_id === null && !yaEntregado ? (
        <>
          {productos.cargando ? <Cargando texto="Viendo el inventario…" /> : null}
          {productos.error ? <ErrorDeCarga error={productos.error} alReintentar={productos.recargar} /> : null}
          {productos.datos && candidatos.length === 0 ? <Aviso tono="alerta">No hay piezas con existencia{talla ? ` de la talla ${talla}` : ""}. Avisa a quien administra el sistema para que dé de alta las piezas (aquí todavía no se puede) y entrega el uniforme cuando lleguen.</Aviso> : null}
          {candidatos.length > 0 ? <CampoSelect etiqueta="Pieza que se entrega" value={elegido} onChange={(e) => setEleccion(e.target.value)} opciones={candidatos.map((p) => ({ valor: p.id, texto: `${p.nombre}${p.talla ? ` · talla ${p.talla}` : ""} · ${p.stock} en existencia` }))} /> : null}
        </>
      ) : null}
      {/* V7: si otra persona (u otra pantalla) ya lo entregó, la lista que se ve está vieja: se dice y se refresca (antes seguía ahí, con el mismo botón). */}
      {yaEntregado ? (
        <Aviso tono="alerta" titulo="Este uniforme ya se entregó">
          <p>Otra persona lo marcó como entregado hace un momento. Ya se actualizó la lista: no hay nada más que hacer aquí.</p>
        </Aviso>
      ) : (
        <ErrorDeAccion error={accion.error} />
      )}
      <div className="formulario-acciones">
        <Boton
          variante="primario"
          disabled={elegido === "" || yaEntregado}
          cargando={accion.ocupado}
          onClick={() =>
            void accion
              .ejecutar(async () => {
                await api.post(`/api/beneficios/${beneficio?.id ?? ""}/entregar`, beneficio?.producto_id ? {} : { producto_id: elegido });
                cerrar();
                alEntregar();
              })
              .then((r) => {
                if (r === undefined) alFallar();
              })
          }
        >
          Marcar como entregado
        </Boton>
        <Boton onClick={cerrar}>{yaEntregado ? "Cerrar" : "Todavía no"}</Boton>
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
      {lista.datos && lista.datos.datos.length === 0 ? (
        <Vacio icono="uniforme" titulo="No hay nada por entregar">
          Cuando una familia salde su primera mensualidad, lo que le toca aparecerá aquí.
        </Vacio>
      ) : null}
      <ul className="lista-tarjetas rejilla-tarjetas">
        {(lista.datos?.datos ?? []).map((b) => (
          <li key={b.id} className="tarjeta-beneficio" data-prueba={`beneficio-${b.id}`}>
            <div className="fila fila-entre">
              <strong className="nombre-tarjeta">
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
            <div className="tarjeta-pie">
              <Boton
                variante="sutil"
                onClick={() => {
                  // La lista puede estar vieja (otra persona ya lo entregó): se refresca al abrir y, si ya no está, el diálogo lo dice.
                  setEntregando(b);
                  lista.recargar();
                }}
              >
                <Icono nombre="exito" tamano={18} />
                Marcar entregado
              </Boton>
            </div>
          </li>
        ))}
      </ul>
      <Tarjeta titulo="Existencia">
        {stock.datos && stock.datos.datos.length === 0 ? (
          <Vacio icono="uniforme" titulo="No hay piezas registradas.">
            Avisa a quien administra el sistema para que dé de alta las piezas.
          </Vacio>
        ) : null}
        {stock.datos ? (
          <ul className="lista-filas" data-prueba="existencia">
            {stock.datos.datos.map((p) => (
              <li key={p.id} className="fila-dato">
                <span>
                  {p.nombre}
                  {p.talla ? ` · talla ${p.talla}` : ""} · {formatear(p.precio)}
                </span>
                <span className="solo-lectores">: </span>
                <span className="existencia-cantidad">
                  <span className="existencia-texto">
                    <strong className="numero">{p.stock}</strong> {p.stock === 1 ? "pieza" : "piezas"}
                  </span>
                  {p.stock === 0 ? <Insignia tono="peligro">Agotado</Insignia> : p.stock === 1 ? <Insignia tono="alerta">Última pieza</Insignia> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Tarjeta>
      <Entregar
        key={entregando?.id ?? "ninguno"}
        beneficio={entregando}
        yaNoEsta={entregando !== null && !lista.cargando && lista.datos !== null && !lista.datos.datos.some((x) => x.id === entregando.id)}
        alCerrar={() => setEntregando(null)}
        alEntregar={() => {
          lista.recargar();
          stock.recargar();
        }}
        alFallar={() => {
          lista.recargar();
          stock.recargar();
        }}
      />
    </Marco>
  );
}
