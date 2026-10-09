// Estado de cuenta de una familia: saldo, lo vencido con su antigüedad, cada hijo con sus cargos y los pagos. Solo lectura (administrador, asesor y recepción).
// Los importes salen tal cual del servidor (texto exacto); aquí solo se les da formato.

import { Fragment } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { Aviso, Boton, Cargando, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta } from "../../ui/basicos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { BuscadorDeFamilia } from "./BuscadorDeFamilia.tsx";
import { METODOS, nombreDeCargo, type EstadoDeCuenta as Estado } from "./tipos.ts";

const TRAMOS = [
  { clave: "de_0_a_30", texto: "1 a 30 días" },
  { clave: "de_31_a_60", texto: "31 a 60 días" },
  { clave: "de_61_a_90", texto: "61 a 90 días" },
  { clave: "mas_de_90", texto: "Más de 90 días" },
] as const;

function Cuenta({ tutorId }: { tutorId: string }) {
  const tutor = useCarga((senal) => api.get<Tutor>(`/api/tutores/${tutorId}`, undefined, senal), [tutorId]);
  const estado = useCarga((senal) => api.get<Estado>(`/api/tutores/${tutorId}/estado-cuenta`, undefined, senal), [tutorId]);
  if (estado.error) return <ErrorDeCarga error={estado.error} alReintentar={estado.recargar} />;
  if (!estado.datos) return <Cargando />;
  const e = estado.datos;
  return (
    <div className="pila">
      {tutor.datos ? (
        <p className="muted">
          {tutor.datos.nombre} {tutor.datos.apellidos ?? ""} · {tutor.datos.telefono}
        </p>
      ) : null}
      <Tarjeta titulo="Resumen">
        <dl className="datos" data-prueba="resumen-de-cuenta">
          <dt>Total cargado</dt>
          <dd>{formatear(e.resumen.total_cargado)}</dd>
          <dt>Total pagado</dt>
          <dd>{formatear(e.resumen.total_pagado)}</dd>
          <dt>Saldo</dt>
          <dd data-prueba="saldo">
            <strong>{formatear(e.resumen.saldo)}</strong>
          </dd>
          <dt>Vencido</dt>
          <dd data-prueba="vencido">
            <strong>{formatear(e.resumen.vencido)}</strong>
          </dd>
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Antigüedad de lo vencido">
        <dl className="datos" data-prueba="antiguedad">
          {TRAMOS.map((t) => (
            <Fragment key={t.clave}>
              <dt>{t.texto}</dt>
              <dd>{formatear(e.resumen.antiguedad[t.clave])}</dd>
            </Fragment>
          ))}
        </dl>
      </Tarjeta>
      {e.hijos.map((h) => (
        <Tarjeta key={h.alumno.id} titulo={`${h.alumno.nombre} ${h.alumno.apellidos}`}>
          <p className="muted">
            Cargado {formatear(h.total_cargado)} · Pagado {formatear(h.total_pagado)} · Saldo <strong>{formatear(h.saldo)}</strong>
          </p>
          <div className="tabla-scroll">
            <table className="tabla" data-prueba={`cargos-${h.alumno.id}`}>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Vence</th>
                  <th className="derecha">Importe</th>
                  <th className="derecha">Pagado</th>
                  <th className="derecha">Saldo</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {h.cargos.map((c) => (
                  <tr key={c.id}>
                    <td>{nombreDeCargo(c)}</td>
                    <td>{formatearFecha(c.fecha_vencimiento)}</td>
                    <td className="derecha numero">{formatear(c.monto_final)}</td>
                    <td className="derecha numero">{formatear(c.monto_pagado)}</td>
                    <td className="derecha numero">{formatear(c.saldo)}</td>
                    <td>
                      {c.estatus === "cancelado" ? <Insignia>Cancelado</Insignia> : aCentavos(c.saldo) === 0n ? <Insignia tono="exito">Pagado</Insignia> : c.estatus_efectivo === "vencido" ? <Insignia tono="peligro">Vencido {c.dias_de_atraso} d</Insignia> : <Insignia tono="info">Pendiente</Insignia>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ))}
      {e.hijos.length === 0 ? <Aviso>Esta familia todavía no tiene cargos.</Aviso> : null}
      <Tarjeta titulo="Pagos">
        {e.pagos.length === 0 ? <p className="muted">Todavía no hay pagos.</p> : null}
        <ul className="lista-tarjetas" data-prueba="pagos-de-la-cuenta">
          {e.pagos.map((p) => (
            <li key={p.id} className="fila fila-entre">
              <span>
                <strong>{formatear(p.monto)}</strong> · {METODOS.find((m) => m.valor === p.metodo)?.texto ?? p.metodo} · {formatearFecha(p.fecha)}
                {p.referencia ? <span className="muted"> · ref. {p.referencia}</span> : null}
              </span>
              <Insignia tono={p.estatus === "aplicado" ? "exito" : "neutro"}>{p.estatus === "aplicado" ? "Aplicado" : "Cancelado"}</Insignia>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}

export default function EstadoDeCuenta() {
  useTitulo("Estado de cuenta");
  const { tutorId } = useParams();
  const navegar = useNavigate();
  return (
    <Marco titulo="Estado de cuenta" acciones={tutorId ? <Boton onClick={() => navegar("/cuenta")}>Buscar otra familia</Boton> : undefined}>
      {tutorId ? <Cuenta key={tutorId} tutorId={tutorId} /> : <BuscadorDeFamilia alElegir={(t) => navegar(`/cuenta/${t.id}`)} />}
    </Marco>
  );
}
