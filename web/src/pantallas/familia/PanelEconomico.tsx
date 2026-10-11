// «Económico» del expediente: lo que se debe (saldo y vencido), la mensualidad vigente con su precio congelado, quién paga, la promoción aplicada y los beneficios pendientes. Los importes son
// texto del servidor y se muestran con `lib/dinero.ts` (nunca como número). Para el maestro no existe: la API manda `economico` en `null`.

import { Link } from "react-router-dom";
import { formatear } from "../../lib/dinero.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { Aviso, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import type { Economico } from "./tipos.ts";
import { nombreCompleto, TIPOS_DE_BENEFICIO } from "./vista.ts";

/** «0.00» → false: los importes llegan como texto del servidor, sin números flotantes. */
const hayImporte = (importe: string): boolean => !/^0+(\.0+)?$/.test(importe.trim());

export function PanelEconomico({ e, responsable, tutorDeLaCuenta }: { e: Economico; responsable: { nombre: string; apellidos?: string | null } | undefined; tutorDeLaCuenta: string | null }) {
  const cuenta = e.estado_de_cuenta;
  const vencido = cuenta.disponible && hayImporte(cuenta.vencido);
  return (
    <div className="pila expediente-panel" data-prueba="panel-economico">
      <section className="tarjeta">
        <div className="economico-cabecera">
          <h2>Económico</h2>
          {tutorDeLaCuenta ? <Link to={`/cuenta/${tutorDeLaCuenta}`}>Ver estado de cuenta de la familia</Link> : null}
        </div>
        {!cuenta.disponible ? <Aviso>El estado de cuenta todavía no está disponible.</Aviso> : null}
        <div className="datos-economicos" data-prueba={cuenta.disponible ? "cuenta-del-alumno" : undefined}>
          {cuenta.disponible ? (
            <div className="dato-economico dato-economico-saldo">
              <span className="dato-economico-etiqueta">Saldo</span>
              <span className="dato-economico-valor" data-prueba="saldo">
                {formatear(cuenta.saldo)}
              </span>
            </div>
          ) : null}
          {cuenta.disponible ? (
            <div className={vencido ? "dato-economico dato-economico-vencido" : "dato-economico"}>
              <span className="dato-economico-etiqueta">Vencido</span>
              <span className="dato-economico-valor" data-prueba="vencido">
                {formatear(cuenta.vencido)}
              </span>
              <span className="dato-economico-nota">{cuenta.antiguedadCarteraVencidaDias === null ? "Sin atrasos" : `Atraso más antiguo: ${cuenta.antiguedadCarteraVencidaDias} días`}</span>
            </div>
          ) : null}
          <div className="dato-economico">
            <span className="dato-economico-etiqueta">Mensualidad vigente</span>
            <span className="dato-economico-valor" data-prueba="mensualidad-total">
              {formatear(e.mensualidad_vigente.total)}
            </span>
            <span className="dato-economico-nota">precio congelado al inscribirse</span>
          </div>
          {responsable ? (
            <div className="dato-economico">
              <span className="dato-economico-etiqueta">Responsable de pago</span>
              <span className="dato-economico-nombre">{nombreCompleto(responsable)}</span>
            </div>
          ) : null}
        </div>
      </section>
      <Tarjeta titulo="Mensualidad">
        {e.mensualidad_vigente.por_inscripcion.length === 0 ? <Vacio titulo="Todavía no hay mensualidad vigente" icono="pagos">Aparecerá aquí cuando tenga una inscripción activa.</Vacio> : null}
        <ul className="lista-tarjetas">
          {e.mensualidad_vigente.por_inscripcion.map((m) => (
            <li key={m.inscripcion_id} className="fila fila-entre">
              <span>{m.grupo}</span>
              <span className="numero">
                lista {formatear(m.precio_de_lista)}
                {m.descuento !== "0.00" ? ` − ${formatear(m.descuento)}` : ""} = <strong>{formatear(m.mensualidad)}</strong>
              </span>
            </li>
          ))}
        </ul>
        {e.dia_de_corte.map((d) => (
          <p key={d.inscripcion_id} className="muted">
            Día de corte {d.dia} · próximo corte {formatearFecha(d.proximo_corte)}
          </p>
        ))}
      </Tarjeta>
      <div className="expediente-rejilla">
        {e.promocion_aplicada.length > 0 ? (
          <Tarjeta titulo="Promoción aplicada">
            <ul className="lista-tarjetas" data-prueba="promociones">
              {e.promocion_aplicada.map((p) => (
                <li key={p.inscripcion_id} className="pila">
                  <strong>{p.promocion.nombre}</strong>
                  {p.beneficios.map((b, i) => (
                    <span key={i} className="muted">
                      {TIPOS_DE_BENEFICIO[b.tipo] ?? b.tipo}
                      {b.descripcion ? `: ${b.descripcion}` : ""}
                      {b.descuento !== "0.00" ? ` (${formatear(b.descuento)})` : ""} · {b.estatus}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
        {e.beneficios_pendientes.length > 0 ? (
          <Tarjeta titulo="Beneficios pendientes">
            <ul className="lista-filas" data-prueba="beneficios-pendientes">
              {e.beneficios_pendientes.map((b, i) => (
                <li key={i}>
                  {b.promocion}: {TIPOS_DE_BENEFICIO[b.tipo] ?? b.tipo}
                  {b.descripcion ? ` (${b.descripcion})` : ""}
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
      </div>
    </div>
  );
}
