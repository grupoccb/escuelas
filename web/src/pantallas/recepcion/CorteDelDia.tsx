// Cierre del día (V7): cuánto se cobró hoy, por quien lo cobró y por forma de pago, para contar el efectivo y cuadrar la caja. Solo lee. Los importes salen tal cual del
// servidor (texto exacto); aquí solo se les da formato. El «día» es el de la sucursal (lo decide el servidor), no el de la computadora.

import { Fragment, useState } from "react";
import { api } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { formatearFecha, formatearFechaLarga } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { METODOS } from "./tipos.ts";

interface Desglose {
  efectivo: string;
  tarjeta: string;
  transferencia: string;
  total: string;
  pagos: number;
}
interface Persona {
  id: string;
  nombre: string;
}
interface PagoDelDia {
  id: string;
  hora: string;
  familia: string;
  monto: string;
  metodo: string;
  referencia: string | null;
  registrado_por: Persona | null;
}
interface Corte {
  fecha: string;
  hoy: string;
  zona_horaria: string;
  cajas: { usuario: Persona | null; cobrado: Desglose }[];
  cobrado: Desglose;
  devoluciones: Desglose;
  neto: Desglose;
  cancelados: (PagoDelDia & { de_otro_dia: boolean; cancelado_en: string | null; cancelado_por: Persona | null; motivo: string | null })[];
  pagos: PagoDelDia[];
}

const FORMAS = [
  { clave: "efectivo", texto: "Efectivo" },
  { clave: "tarjeta", texto: "Tarjeta" },
  { clave: "transferencia", texto: "Transferencia" },
] as const;

const textoDeMetodo = (m: string): string => METODOS.find((x) => x.valor === m)?.texto ?? m;
const hora = (iso: string, zona: string): string => new Intl.DateTimeFormat("es-MX", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

function Cifras({ d }: { d: Desglose }) {
  return (
    <dl className="datos">
      {FORMAS.map((f) => (
        <Fragment key={f.clave}>
          <dt>{f.texto}</dt>
          <dd className="numero" data-prueba={f.clave}>
            {formatear(d[f.clave])}
          </dd>
        </Fragment>
      ))}
      <dt>
        <strong>Total</strong>
      </dt>
      <dd className="numero">
        <strong>{formatear(d.total)}</strong>
      </dd>
    </dl>
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

  return (
    <Marco titulo="Cierre del día" subtitulo={c ? `${formatearFechaLarga(c.fecha)} · ${formatearFecha(c.fecha)}${esHoy ? " (hoy)" : ""}` : undefined} acciones={c ? <Boton className="no-imprimir" onClick={() => window.print()} data-prueba="imprimir-corte">Imprimir el cierre</Boton> : undefined}>
      <div className="no-imprimir">
        <CampoTexto etiqueta="Día" type="date" value={dia || (c?.fecha ?? "")} max={c?.hoy} onChange={(e) => setDia(e.target.value)} ayuda="Por omisión es hoy. Para ver un día anterior, elígelo aquí." />
      </div>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !c ? <Cargando texto="Sumando lo cobrado…" /> : null}
      {c ? (
        <>
          <p className="muted no-imprimir">Para cuadrar la caja: cuenta el efectivo que tienes y compáralo con la línea «Efectivo» de tu caja. La tarjeta se compara con el reporte de la terminal y las transferencias con el banco.</p>
          {c.cobrado.pagos === 0 && c.cancelados.length === 0 ? (
            <Aviso>{esHoy ? "Hoy todavía no se ha registrado ningún cobro." : "Ese día no se registró ningún cobro."}</Aviso>
          ) : null}
          <div className="rejilla rejilla-2" data-prueba="cajas">
            {/* La caja de quien está mirando va primero: es la que va a contar. */}
            {[...c.cajas].sort((a, b) => (a.usuario?.id === miId ? -1 : 0) - (b.usuario?.id === miId ? -1 : 0)).map((caja) => (
              <Tarjeta key={caja.usuario?.id ?? "sin-usuario"} titulo={caja.usuario ? (caja.usuario.id === miId ? `Tu caja (${caja.usuario.nombre})` : `Caja de ${caja.usuario.nombre}`) : "Cobros sin persona registrada"}>
                <p className="muted">
                  {caja.cobrado.pagos} {caja.cobrado.pagos === 1 ? "pago" : "pagos"}
                </p>
                <div data-prueba={`caja-${caja.usuario?.id ?? "sin-usuario"}`}>
                  <Cifras d={caja.cobrado} />
                </div>
              </Tarjeta>
            ))}
          </div>
          {c.cajas.length > 0 ? (
            <Tarjeta titulo="Todo el día">
              <p className="muted">
                Cobrado en total: {c.cobrado.pagos} {c.cobrado.pagos === 1 ? "pago" : "pagos"}.
              </p>
              <div data-prueba="cobrado-total">
                <Cifras d={c.cobrado} />
              </div>
              {c.devoluciones.pagos > 0 ? (
                <>
                  <h3>Se devolvió hoy un pago de días anteriores</h3>
                  <p className="muted">Ese dinero sale de la caja de hoy: se resta.</p>
                  <div data-prueba="devoluciones">
                    <Cifras d={c.devoluciones} />
                  </div>
                  <h3>Neto del día</h3>
                  <div data-prueba="neto">
                    <Cifras d={c.neto} />
                  </div>
                </>
              ) : null}
            </Tarjeta>
          ) : null}
          {c.pagos.length > 0 ? (
            <Tarjeta titulo="Pagos del día">
              <div className="tabla-scroll">
                <table className="tabla" data-prueba="pagos-del-dia">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Familia</th>
                      <th>Forma de pago</th>
                      <th>Referencia</th>
                      <th>Cobró</th>
                      <th className="derecha">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.pagos.map((p) => (
                      <tr key={p.id}>
                        <td>{hora(p.hora, c.zona_horaria)}</td>
                        <td>{p.familia}</td>
                        <td>{textoDeMetodo(p.metodo)}</td>
                        <td>{p.referencia ?? ""}</td>
                        <td>{p.registrado_por?.nombre ?? "—"}</td>
                        <td className="derecha numero">{formatear(p.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          ) : null}
          {c.cancelados.length > 0 ? (
            <Tarjeta titulo="Pagos cancelados este día">
              <ul className="lista-tarjetas" data-prueba="cancelados">
                {c.cancelados.map((p) => (
                  <li key={p.id} className="fila fila-entre">
                    <span>
                      <strong className="numero">{formatear(p.monto)}</strong> · {textoDeMetodo(p.metodo)} · {p.familia}{" "}
                      {p.de_otro_dia ? <Insignia tono="alerta">Cobrado otro día: sale de la caja de hoy</Insignia> : <Insignia>Cobrado y cancelado hoy: no cuenta</Insignia>}
                      <br />
                      <span className="muted">
                        Cobró {p.registrado_por?.nombre ?? "—"}, canceló {p.cancelado_por?.nombre ?? "—"}
                        {p.motivo ? ` · ${p.motivo}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ) : null}
        </>
      ) : null}
    </Marco>
  );
}
