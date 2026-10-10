// Estado de cuenta de una familia: saldo, lo vencido con su antigüedad, cada hijo con sus cargos y los pagos. Solo lectura (administrador, asesor y recepción).
// Los importes salen tal cual del servidor (texto exacto); aquí solo se les da formato.

import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { Boton, Cargando, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { BuscadorDeFamilia } from "./BuscadorDeFamilia.tsx";
import { FamiliaElegida } from "./FamiliaElegida.tsx";
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
  const hayVencido = aCentavos(e.resumen.vencido) > 0n;
  return (
    <div className="cuenta">
      <div className="cuenta-encabezado">
        {tutor.datos ? <FamiliaElegida tutor={tutor.datos} /> : <span />}
        {/* V7: para dársela a la familia en papel (o guardarla en PDF) y para Excel. Mandarla por WhatsApp no: todo mensaje saliente pasa por el proveedor de mensajería y sus reglas. */}
        <div className="pagina-acciones no-imprimir">
          <Boton onClick={() => window.print()} data-prueba="imprimir-cuenta">
            <Icono nombre="imprimir" tamano={18} />
            Imprimir estado de cuenta
          </Boton>
          <a className="boton" href={`/api/exportaciones/estado-cuenta?tutor_id=${tutorId}`} download data-prueba="descargar-cuenta">
            <Icono nombre="descargar" tamano={18} />
            Descargar (CSV para Excel)
          </a>
        </div>
      </div>
      <div className="indicadores" data-prueba="resumen-de-cuenta">
        <div className="indicador indicador-principal">
          <div>Saldo (lo que debe)</div>
          <div className="indicador-valor" data-prueba="saldo">
            {formatear(e.resumen.saldo)}
          </div>
        </div>
        <div className={`indicador${hayVencido ? " indicador-alerta" : ""}`}>
          <div>De eso, vencido</div>
          <div className="indicador-valor" data-prueba="vencido">
            {formatear(e.resumen.vencido)}
          </div>
        </div>
        <div className="indicador">
          <div>Total cargado</div>
          <div className="indicador-valor">{formatear(e.resumen.total_cargado)}</div>
        </div>
        <div className="indicador">
          <div>Total pagado</div>
          <div className="indicador-valor">{formatear(e.resumen.total_pagado)}</div>
        </div>
      </div>
      <Tarjeta titulo="Antigüedad de lo vencido">
        <p className="muted">Cuántos días llevan vencidos los cargos que se deben: a más días, más urgente.</p>
        <dl className="antiguedad" data-prueba="antiguedad">
          {TRAMOS.map((t) => (
            <div key={t.clave}>
              <dt>{t.texto}</dt>
              <dd className="numero">{formatear(e.resumen.antiguedad[t.clave])}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>
      {e.hijos.map((h) => (
        <section key={h.alumno.id} className="seccion-tabla">
          <header className="seccion-tabla-cabecera">
            <h2>
              {h.alumno.nombre} {h.alumno.apellidos}
            </h2>
            <p className="muted numero">
              Cargado {formatear(h.total_cargado)} · Pagado {formatear(h.total_pagado)} · Saldo <strong>{formatear(h.saldo)}</strong>
            </p>
          </header>
          <div className="tabla-scroll tabla-apilada">
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
                    <td data-etiqueta="Concepto">{nombreDeCargo(c)}</td>
                    <td data-etiqueta="Vence">{formatearFecha(c.fecha_vencimiento)}</td>
                    <td className="derecha numero" data-etiqueta="Importe">{formatear(c.monto_final)}</td>
                    <td className="derecha numero" data-etiqueta="Pagado">{formatear(c.monto_pagado)}</td>
                    <td className="derecha numero" data-etiqueta="Saldo">{formatear(c.saldo)}</td>
                    <td data-etiqueta="Estatus">
                      {c.estatus === "cancelado" ? <Insignia>Cancelado</Insignia> : aCentavos(c.saldo) === 0n ? <Insignia tono="exito">Pagado</Insignia> : c.estatus_efectivo === "vencido" ? <Insignia tono="peligro">Vencido {c.dias_de_atraso} d</Insignia> : <Insignia tono="info">Pendiente</Insignia>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {e.hijos.length === 0 ? (
        <Vacio icono="cuenta" titulo="Esta familia todavía no tiene cargos.">
          Los cargos aparecen aquí cuando se inscribe a un alumno o se registra una venta.
        </Vacio>
      ) : null}
      <Tarjeta titulo="Pagos">
        {e.pagos.length === 0 ? (
          <Vacio icono="cuenta" titulo="Todavía no hay pagos de esta familia." />
        ) : null}
        <ul className="lista-filas" data-prueba="pagos-de-la-cuenta">
          {e.pagos.map((p) => (
            <li key={p.id} className="fila-dato">
              <span className="fila-dato-texto">
                <span className="fila-pago-monto">
                  <strong className="numero fila-titulo">{formatear(p.monto)}</strong> <Insignia tono={p.estatus === "aplicado" ? "exito" : "neutro"}>{p.estatus === "aplicado" ? "Aplicado" : "Cancelado"}</Insignia>
                </span>
                <span className="muted">
                  {METODOS.find((m) => m.valor === p.metodo)?.texto ?? p.metodo} · {formatearFecha(p.fecha)}
                  {p.referencia ? ` · ref. ${p.referencia}` : ""}
                </span>
              </span>
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
    <Marco titulo="Estado de cuenta" acciones={tutorId ? <Boton className="no-imprimir" onClick={() => navegar("/cuenta")}><Icono nombre="buscar" tamano={18} />Buscar otra familia</Boton> : undefined}>
      {tutorId ? <Cuenta key={tutorId} tutorId={tutorId} /> : <BuscadorDeFamilia alElegir={(t) => navegar(`/cuenta/${t.id}`)} />}
    </Marco>
  );
}
