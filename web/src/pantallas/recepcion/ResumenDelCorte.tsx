// Lo de arriba del «Cierre del día» (R5c): el panel oscuro con lo cobrado y, en ámbar, el efectivo que hay que contar en caja; «Por forma de pago» (barras con el importe escrito) y
// «Por quien cobró» (una fila por caja, con su total y su desglose por forma de pago, que es con lo que cada quien cuadra). Todo sale del corte del servidor: aquí solo se da formato.

import { useLayoutEffect, useRef } from "react";
import { formatear } from "../../lib/dinero.ts";
import { Tarjeta } from "../../ui/basicos.tsx";
import { iniciales } from "../../ui/disciplina.ts";
import { FORMAS, hayDevoluciones, notaDelDia, pagosPorForma, porcentajeDelDia, textoDePagos, type ClaveDeForma, type Corte } from "./corte.ts";

/** La barra de una forma de pago: el ancho sale de la variable `--p` (puesta con `setProperty`, sin estilos en línea); el color es refuerzo, la forma se lee en el nombre. */
function BarraDeForma({ porcentaje, forma }: { porcentaje: string; forma: ClaveDeForma }) {
  const relleno = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    relleno.current?.style.setProperty("--p", `${porcentaje}%`);
  }, [porcentaje]);
  return (
    <span className="forma-barra" aria-hidden="true">
      <span ref={relleno} className={`forma-relleno forma-relleno-${forma}`} />
    </span>
  );
}

export function PanelDelDia({ corte, ojo }: { corte: Corte; ojo: string }) {
  const enEfectivo = pagosPorForma(corte.pagos).efectivo;
  const devuelto = hayDevoluciones(corte) && corte.devoluciones.efectivo !== "0.00" ? ` · menos ${formatear(corte.devoluciones.efectivo)} devueltos hoy` : "";
  return (
    <section className="corte-heroe" aria-label="Lo cobrado y el efectivo para contar" data-prueba="resumen-del-dia">
      <div className="corte-heroe-total">
        <span className="heroe-ojo">{ojo}</span>
        <span className="corte-heroe-cifra numero" data-prueba="cobrado-total">
          {formatear(corte.cobrado.total)}
        </span>
        <span className="corte-heroe-nota">{notaDelDia(corte, formatear)}</span>
      </div>
      <div className="corte-efectivo" data-prueba="efectivo-para-contar">
        <span className="corte-efectivo-etiqueta">Efectivo para contar en caja</span>
        <span className="corte-efectivo-cifra numero">{formatear(corte.neto.efectivo)}</span>
        <span className="corte-efectivo-nota">
          {enEfectivo === 1 ? "1 pago en efectivo" : `${enEfectivo} pagos en efectivo`}
          {devuelto}
        </span>
      </div>
    </section>
  );
}

export function PorFormaDePago({ corte }: { corte: Corte }) {
  const cuantos = pagosPorForma(corte.pagos);
  return (
    <Tarjeta titulo="Por forma de pago">
      <ul className="formas-lista">
        {FORMAS.map((f) => {
          const porcentaje = porcentajeDelDia(corte.cobrado[f.clave], corte.cobrado.total);
          return (
            <li key={f.clave} className="forma-fila" data-prueba={`forma-${f.clave}`}>
              <div className="forma-linea">
                <span className="forma-nombre">
                  {f.texto} <span className="forma-pagos">· {textoDePagos(cuantos[f.clave])}</span>
                  <span className="solo-lectores">, {porcentaje} % del total</span>
                </span>
                <strong className="numero">{formatear(corte.cobrado[f.clave])}</strong>
              </div>
              <BarraDeForma porcentaje={porcentaje} forma={f.clave} />
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

/** La caja de quien está mirando va primero: es la que va a contar. */
export function PorQuienCobro({ corte, miId }: { corte: Corte; miId: string | undefined }) {
  const cajas = [...corte.cajas].sort((a, b) => (a.usuario?.id === miId ? -1 : 0) - (b.usuario?.id === miId ? -1 : 0));
  return (
    <Tarjeta titulo="Por quien cobró">
      <ul className="personas-lista" data-prueba="cajas">
        {cajas.map((caja) => {
          const nombre = caja.usuario ? (caja.usuario.id === miId ? `Tu caja (${caja.usuario.nombre})` : caja.usuario.nombre) : "Cobros sin persona registrada";
          return (
            <li key={caja.usuario?.id ?? "sin-usuario"} className="corte-persona" data-prueba={`caja-${caja.usuario?.id ?? "sin-usuario"}`}>
              <span className="corte-avatar" aria-hidden="true">
                {caja.usuario ? iniciales(caja.usuario.nombre) : "?"}
              </span>
              <span className="corte-persona-datos">
                <strong>{nombre}</strong>
                <span className="corte-persona-pagos">{textoDePagos(caja.cobrado.pagos)}</span>
              </span>
              <strong className="numero corte-persona-total">{formatear(caja.cobrado.total)}</strong>
              <dl className="corte-persona-formas">
                {FORMAS.map((f) => (
                  <div key={f.clave}>
                    <dt>{f.texto}</dt>
                    <dd className="numero" data-prueba={f.clave}>
                      {formatear(caja.cobrado[f.clave])}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}
