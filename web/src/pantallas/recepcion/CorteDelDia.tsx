// Cierre del día (V7, rediseño R5c): cuánto se cobró hoy, por quien lo cobró y por forma de pago, para contar el efectivo y cuadrar la caja. Solo lee. Los importes salen tal cual del
// servidor (texto exacto); aquí solo se les da formato. El «día» es el de la sucursal (lo decide el servidor), no el de la computadora.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { formatearDiaYMes, formatearFechaLarga } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Boton, Cargando, ErrorDeCarga, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { FORMAS, hayDevoluciones, hayMovimientos, type Corte, type Desglose } from "./corte.ts";
import { CadaPago, PagosCancelados } from "./PagosDelCorte.tsx";
import { PanelDelDia, PorFormaDePago, PorQuienCobro } from "./ResumenDelCorte.tsx";

/** Las cifras de un desglose: el total arriba (lo más grande) y debajo cada forma de pago. */
function Cifras({ d, nivel = "normal" }: { d: Desglose; nivel?: "normal" | "menor" | "neto" }) {
  return (
    <div className={`cifras cifras-${nivel}`}>
      <p className="cifras-total">
        <span className="etiqueta-panel">Total</span>
        <strong className="cifra-principal numero">{formatear(d.total)}</strong>
      </p>
      <dl className="cifras-formas">
        {FORMAS.map((f) => (
          <div key={f.clave}>
            <dt>{f.texto}</dt>
            <dd className="numero">{formatear(d[f.clave])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function CorteDelDia() {
  useTitulo("Cierre del día");
  const { sucursalId, yo } = useSesion();
  const [dia, setDia] = useState("");
  const carga = useCarga((senal) => api.get<Corte>("/api/pagos/corte", { ...(dia ? { fecha: dia } : {}), ...(sucursalId ? { sucursal_id: sucursalId } : {}) }, senal), [dia, sucursalId]);
  const c = carga.datos;
  const esHoy = c ? c.fecha === c.hoy : true;
  const miId = yo?.usuario.id;
  // La sucursal solo se nombra cuando se sabe cuál es: la elegida, o la única que tiene la persona.
  const sucursal = yo?.sucursales.find((s) => s.id === sucursalId)?.nombre ?? (yo?.sucursales.length === 1 ? yo.sucursales[0]?.nombre : undefined);
  const ojo = c ? `${esHoy ? "Cobrado hoy" : `Cobrado el ${formatearDiaYMes(c.fecha, c.hoy)}`}${sucursal ? ` · ${sucursal}` : ""}` : "";

  return (
    <Marco
      titulo="Cierre del día"
      subtitulo="Cuánto se cobró, quién lo cobró y cómo, para contar el efectivo y cuadrar la caja."
      acciones={
        <>
          <input className="corte-dia no-imprimir" type="date" aria-label="Día" value={dia || (c?.fecha ?? "")} max={c?.hoy} onChange={(e) => setDia(e.target.value)} />
          {!esHoy ? (
            <Boton className="no-imprimir" onClick={() => setDia("")}>
              Volver a hoy
            </Boton>
          ) : null}
          {c ? (
            <Boton className="no-imprimir" onClick={() => window.print()} data-prueba="imprimir-corte">
              <Icono nombre="imprimir" tamano={18} />
              Imprimir cierre
            </Boton>
          ) : null}
        </>
      }
    >
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !c ? <Cargando texto="Sumando lo cobrado…" /> : null}
      {c ? (
        <>
          <p className="solo-impresion">
            {formatearFechaLarga(c.fecha)}
            {sucursal ? ` · ${sucursal}` : ""}
          </p>
          {!hayMovimientos(c) ? (
            <Vacio icono="corte" titulo={esHoy ? "Hoy todavía no se ha registrado ningún cobro." : "Ese día no se registró ningún cobro."}>
              {esHoy ? "Cuando se registre un pago aparecerá aquí." : "Elige otro día para ver sus cobros."}
            </Vacio>
          ) : (
            <>
              <PanelDelDia corte={c} ojo={ojo} />
              <div className="corte-columnas">
                <PorFormaDePago corte={c} />
                <PorQuienCobro corte={c} miId={miId} />
              </div>
              {hayDevoluciones(c) ? (
                <Tarjeta titulo="Se devolvió hoy un pago de días anteriores">
                  <p className="muted">Ese dinero sale de la caja de hoy: se resta.</p>
                  <div data-prueba="devoluciones">
                    <Cifras d={c.devoluciones} nivel="menor" />
                  </div>
                  <section className="corte-bloque corte-neto">
                    <h3>Neto del día</h3>
                    <div data-prueba="neto">
                      <Cifras d={c.neto} nivel="neto" />
                    </div>
                  </section>
                </Tarjeta>
              ) : null}
              <p className="muted no-imprimir">Para cuadrar la caja: cuenta el efectivo que tienes y compáralo con la línea «Efectivo» de tu caja. La tarjeta se compara con el reporte de la terminal y las transferencias con el banco.</p>
              {c.pagos.length > 0 ? <CadaPago pagos={c.pagos} zona={c.zona_horaria} /> : null}
              {c.cancelados.length > 0 ? <PagosCancelados cancelados={c.cancelados} zona={c.zona_horaria} /> : null}
            </>
          )}
        </>
      ) : null}
    </Marco>
  );
}
