// Estado de cuenta de una familia (R5b, README «Estado de cuenta»): el saldo, lo vencido con su antigüedad, lo pagado en el año, cada hijo con sus cargos (cada uno con su estado) y los pagos,
// con «Cancelar el pago» para quien puede. Administrador, asesor y recepción lo leen; cancelar un pago es solo de quien tiene el permiso (administrador y recepción).
// Los importes salen tal cual del servidor (texto exacto); aquí solo se les da formato y se suman en centavos.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import { formatearDiaYMes, hoyLocal } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Boton, Cargando, EnlaceBoton, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { BuscadorDeFamilia } from "./BuscadorDeFamilia.tsx";
import { CancelarPago } from "./CancelarPago.tsx";
import { detalleDePago, estadoDeCargo, pagadoEnElAnio, textoDeAtraso, textoDePagos, TRAMOS } from "./cuenta.ts";
import { disciplinasDe, type EtiquetaDeHijo } from "./disciplinas-de-familia.ts";
import { FamiliaElegida } from "./FamiliaElegida.tsx";
import { folioDePago } from "./reparto.ts";
import { METODOS, nombreDeCargo, type EstadoDeCuenta as Estado, type HijoDeCuenta, type PagoDeCuenta } from "./tipos.ts";
import { useEtiquetasDeHijos } from "./useEtiquetasDeHijos.ts";

/** Las tres cifras de arriba: el saldo (lo que la familia debe), lo vencido con su antigüedad y lo pagado en el año. */
function Resumen({ estado, hoy }: { estado: Estado; hoy: string }) {
  const r = estado.resumen;
  const hayVencido = aCentavos(r.vencido) > 0n;
  const hayDeuda = aCentavos(r.saldo) > 0n;
  const atraso = textoDeAtraso(estado.hijos.flatMap((h) => h.cargos));
  const anio = pagadoEnElAnio(estado.pagos, hoy);
  return (
    <div className="cuenta-resumen" data-prueba="resumen-de-cuenta">
      <div className="cuenta-dato cuenta-dato-saldo">
        <span className="cuenta-dato-etiqueta">Saldo de la familia</span>
        <span className="cuenta-dato-valor" data-prueba="saldo">
          {formatear(r.saldo)}
        </span>
        {hayDeuda ? null : (
          <span className="cuenta-dato-nota cuenta-nota-icono">
            <Icono nombre="exito" tamano={14} />
            Al corriente
          </span>
        )}
      </div>
      <div className={`cuenta-dato${hayVencido ? " cuenta-dato-vencido" : ""}`}>
        <span className="cuenta-dato-etiqueta cuenta-nota-icono">
          {hayVencido ? <Icono nombre="alerta" tamano={16} /> : null}
          Vencido
        </span>
        <span className="cuenta-dato-valor cuenta-dato-valor-menor" data-prueba="vencido">
          {formatear(r.vencido)}
        </span>
        <span className="cuenta-dato-nota">{atraso ?? "Nada vencido"}</span>
        {hayVencido ? (
          <dl className="cuenta-antiguedad" data-prueba="antiguedad" aria-label="Antigüedad de lo vencido">
            {TRAMOS.map((t) => (
              <div key={t.clave}>
                <dt>{t.texto}</dt>
                <dd className="numero">{formatear(r.antiguedad[t.clave])}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <div className="cuenta-dato">
        <span className="cuenta-dato-etiqueta">Pagado en {anio.anio}</span>
        <span className="cuenta-dato-valor cuenta-dato-valor-menor" data-prueba="pagado-en-el-anio">
          {formatear(anio.total)}
        </span>
        <span className="cuenta-dato-nota">{textoDePagos(anio.pagos)}</span>
      </div>
    </div>
  );
}

/** Un hijo con sus cargos: el punto lleva el color de su disciplina (el dato `color_marca`; sin él, el neutro), el nombre y el grupo se leen. */
function CargosDeUnHijo({ hijo, estado, etiquetas, hoy, conExpediente }: { hijo: HijoDeCuenta; estado: Estado; etiquetas: readonly EtiquetaDeHijo[]; hoy: string; conExpediente: boolean }) {
  const disciplina = disciplinasDe(etiquetas, hijo.alumno.id);
  const ref = useDisciplina<HTMLDivElement>(disciplina?.color ?? null);
  const grupos = [...new Set(etiquetas.filter((e) => e.alumnoId === hijo.alumno.id && e.grupo).map((e) => e.grupo as string))];
  const donde = grupos.length > 0 ? grupos.join(", ") : (disciplina?.texto ?? null);
  return (
    <div ref={ref} className="cuenta-hijo">
      <div className="cuenta-hijo-cabecera">
        <h3 className="cuenta-hijo-titulo">
          <span className="cuenta-hijo-punto" aria-hidden="true" />
          <span>
            {hijo.alumno.nombre}
            <span className="solo-lectores"> {hijo.alumno.apellidos}</span>
          </span>
          {donde ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="solo-lectores">, </span>
              <span className="cuenta-hijo-grupo">{donde}</span>
            </>
          ) : null}
        </h3>
        {conExpediente ? (
          <Link className="cuenta-enlace" to={`/alumnos/${hijo.alumno.id}`}>
            Expediente<span className="solo-lectores"> de {hijo.alumno.nombre}</span>
          </Link>
        ) : null}
      </div>
      <p className="cuenta-hijo-totales numero">
        Cargado {formatear(hijo.total_cargado)} · Pagado {formatear(hijo.total_pagado)} · Saldo <strong>{formatear(hijo.saldo)}</strong>
      </p>
      <ul className="cuenta-cargos" data-prueba={`cargos-${hijo.alumno.id}`}>
        {hijo.cargos.map((c) => {
          const e = estadoDeCargo(c, estado.pagos, hoy);
          return (
            <li key={c.id} className="cuenta-cargo" data-prueba={`cargo-${c.id}`}>
              <span className="cuenta-cargo-datos">
                <strong className="cuenta-cargo-nombre">{nombreDeCargo(c)}</strong>
                <span className="cuenta-cargo-detalle">{e.detalle}</span>
              </span>
              <span className="cuenta-cargo-derecha">
                <Insignia tono={e.tono}>{e.texto}</Insignia>
                <strong className="numero cuenta-cargo-monto">{formatear(c.monto_final)}</strong>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Un pago: fecha, método, folio y referencia; el cancelado va rojo suave, con el motivo y el importe tachado; el activo lleva el botón de cancelarlo (solo con el permiso). */
function FilaDePago({ pago, hoy, alCancelar }: { pago: PagoDeCuenta; hoy: string; alCancelar: (() => void) | null }) {
  const cancelado = pago.estatus === "cancelado";
  const metodo = METODOS.find((m) => m.valor === pago.metodo)?.texto ?? pago.metodo;
  return (
    <li className={`pago-fila${cancelado ? " pago-fila-cancelado" : ""}`} data-prueba={`pago-${pago.id}`}>
      <span className="fila-dato-texto">
        <strong>{formatearDiaYMes(pago.fecha, hoy)}</strong>
        <span className="muted">{detalleDePago(pago, metodo)}</span>
        {cancelado ? <span className="pago-motivo">{pago.motivo_cancelacion ? `Cancelado: ${pago.motivo_cancelacion}` : "Cancelado"}</span> : null}
      </span>
      <span className="pago-fila-derecha">
        <strong className={`numero${cancelado ? " pago-monto-cancelado" : ""}`}>{formatear(pago.monto)}</strong>
        {!cancelado && alCancelar ? (
          <button type="button" className="boton-icono-pago no-imprimir" onClick={alCancelar} aria-label={`Cancelar el pago ${folioDePago(pago.id)}`} title="Cancelar este pago">
            <Icono nombre="bloquear" tamano={18} />
          </button>
        ) : null}
      </span>
    </li>
  );
}

function Cuenta({ tutorId }: { tutorId: string }) {
  const { puede, moduloEncendido } = useSesion();
  const navegar = useNavigate();
  const tutor = useCarga((senal) => api.get<Tutor>(`/api/tutores/${tutorId}`, undefined, senal), [tutorId]);
  const estado = useCarga((senal) => api.get<Estado>(`/api/tutores/${tutorId}/estado-cuenta`, undefined, senal), [tutorId]);
  const etiquetas = useEtiquetasDeHijos(tutor.datos);
  const [cancelando, setCancelando] = useState<PagoDeCuenta | null>(null);
  const hoy = hoyLocal();
  const e = estado.datos;
  const puedeCancelar = puede("pagos:cancelar");
  const otraFamilia = (
    <Boton className="no-imprimir" variante="sutil" onClick={() => navegar("/cuenta")}>
      <Icono nombre="buscar" tamano={18} />
      Buscar otra familia
    </Boton>
  );
  const acciones = (
    <>
      {otraFamilia}
      {/* V7: para dársela a la familia en papel (o guardarla en PDF) y para Excel. Mandarla por WhatsApp no: todo mensaje saliente pasa por el proveedor de mensajería y sus reglas. */}
      <Boton className="no-imprimir" onClick={() => window.print()} data-prueba="imprimir-cuenta">
        <Icono nombre="imprimir" tamano={18} />
        Imprimir
      </Boton>
      <a className="boton boton-secundario no-imprimir" href={`/api/exportaciones/estado-cuenta?tutor_id=${tutorId}`} download data-prueba="descargar-cuenta">
        <Icono nombre="descargar" tamano={18} />
        Descargar (CSV para Excel)
      </a>
      {puede("pagos:registrar") ? (
        <EnlaceBoton className="no-imprimir" variante="primario" to={`/pagos?tutor=${tutorId}`}>
          Registrar pago
        </EnlaceBoton>
      ) : null}
    </>
  );
  return (
    <Marco titulo="Estado de cuenta" subtitulo={tutor.datos ? <FamiliaElegida tutor={tutor.datos} /> : undefined} acciones={e ? acciones : otraFamilia}>
      {estado.error ? <ErrorDeCarga error={estado.error} alReintentar={estado.recargar} /> : null}
      {!e && !estado.error ? <Cargando /> : null}
      {e ? (
        <div className="cuenta">
          <Resumen estado={e} hoy={hoy} />
          <div className="cuenta-cuerpo">
            <section className="tarjeta cuenta-tarjeta">
              <h2 className="cuenta-tarjeta-titulo">Cargos por alumno</h2>
              {e.hijos.length === 0 ? (
                <Vacio icono="cuenta" titulo="Esta familia todavía no tiene cargos.">
                  Los cargos aparecen aquí cuando se inscribe a un alumno o se registra una venta.
                </Vacio>
              ) : (
                e.hijos.map((h) => <CargosDeUnHijo key={h.alumno.id} hijo={h} estado={e} etiquetas={etiquetas} hoy={hoy} conExpediente={moduloEncendido("inscripcion") && puede("alumnos:leer")} />)
              )}
            </section>
            <Tarjeta titulo="Pagos" className="cuenta-tarjeta">
              {e.pagos.length === 0 ? <Vacio icono="cuenta" titulo="Todavía no hay pagos de esta familia." /> : null}
              <ul className="pagos-recientes" data-prueba="pagos-de-la-cuenta">
                {e.pagos.map((p) => (
                  <FilaDePago key={p.id} pago={p} hoy={hoy} alCancelar={puedeCancelar ? () => setCancelando(p) : null} />
                ))}
              </ul>
            </Tarjeta>
          </div>
        </div>
      ) : null}
      <CancelarPago
        pago={cancelando}
        alCerrar={() => setCancelando(null)}
        alCancelado={() => {
          setCancelando(null);
          estado.recargar();
        }}
      />
    </Marco>
  );
}

export default function EstadoDeCuenta() {
  useTitulo("Estado de cuenta");
  const { tutorId } = useParams();
  const navegar = useNavigate();
  return tutorId ? (
    <Cuenta key={tutorId} tutorId={tutorId} />
  ) : (
    <Marco titulo="Estado de cuenta">
      <BuscadorDeFamilia alElegir={(t) => navegar(`/cuenta/${t.id}`)} />
    </Marco>
  );
}
