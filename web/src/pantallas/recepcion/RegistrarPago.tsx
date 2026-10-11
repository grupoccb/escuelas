// Registrar un pago en recepción: buscar a la familia, ver lo que adeuda, proponer el reparto (lo calcula el servidor: primero lo que venció antes), ajustarlo a mano
// entre los cargos de varios hijos, pago parcial, y UNA clave de idempotencia por envío (un doble clic o un reintento tras un corte de red no duplica el pago).
// Todos los importes son texto decimal exacto del servidor; aquí no hay ni un número flotante.

import { useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { aCentavos, formatear, normalizarCaptura, restar } from "../../lib/dinero.ts";
import { formatearFecha, hoyLocal, mensajeDeFechaDePago } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoArea, CampoTexto, GrupoDeOpciones } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { BuscadorDeFamilia } from "./BuscadorDeFamilia.tsx";
import { FamiliaElegida } from "./FamiliaElegida.tsx";
import { claveParaEnvio, firmaDelPago, mensajeDeCaptura, validarReparto } from "./reparto.ts";
import { METODOS, nombreDeCargo, type CargoDeCuenta, type EstadoDeCuenta, type Pago, type Propuesta } from "./tipos.ts";

/** Los cargos con saldo de todos los hijos, en el orden en que el servidor los pagaría: primero el que venció antes. */
const abiertos = (e: EstadoDeCuenta): { cargo: CargoDeCuenta; hijo: string }[] =>
  e.hijos
    .flatMap((h) => h.cargos.filter((c) => c.estatus !== "cancelado" && aCentavos(c.saldo) > 0n).map((cargo) => ({ cargo, hijo: h.alumno.nombre })))
    .sort((a, b) => (a.cargo.fecha_vencimiento < b.cargo.fecha_vencimiento ? -1 : a.cargo.fecha_vencimiento > b.cargo.fecha_vencimiento ? 1 : 0));

function DeudaDeLaFamilia({ estado }: { estado: EstadoDeCuenta }) {
  const lista = abiertos(estado);
  const hayVencido = aCentavos(estado.resumen.vencido) > 0n;
  return (
    <section className="tarjeta cobro-deuda">
      <div className="deuda-cifra">
        <div className="deuda-total">
          <h2 className="etiqueta-panel">Lo que adeuda</h2>
          <p className="cifra-principal numero" data-prueba="saldo-total">
            {formatear(estado.resumen.saldo)}
          </p>
        </div>
        {hayVencido ? (
          <span className="insignia insignia-peligro insignia-con-icono">
            <Icono nombre="alerta" tamano={14} />
            Vencido <span className="numero" data-prueba="saldo-vencido">{formatear(estado.resumen.vencido)}</span>
          </span>
        ) : lista.length > 0 ? (
          <span className="insignia insignia-exito insignia-con-icono">
            <Icono nombre="exito" tamano={14} />
            Nada vencido
          </span>
        ) : null}
      </div>
      {lista.length === 0 ? <Aviso tono="exito">Esta familia no debe nada.</Aviso> : null}
      <ul className="lista-filas">
        {lista.map(({ cargo, hijo }) => (
          <li key={cargo.id} className="fila-dato" data-prueba={`cargo-${cargo.id}`}>
            <span className="fila-dato-texto">
              <strong className="fila-titulo">{nombreDeCargo(cargo)}</strong>
              <span className="muted">
                {hijo} · Vence {formatearFecha(cargo.fecha_vencimiento)}
              </span>
              {cargo.estatus_efectivo === "vencido" ? <Insignia tono="peligro">Vencido {cargo.dias_de_atraso} d</Insignia> : null}
            </span>
            <strong className="numero fila-importe">{formatear(cargo.saldo)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** El importe del cobro: la cifra que se teclea es la más grande del formulario. «Todo el saldo» lo llena con lo que la familia adeuda. */
function CampoMonto({ valor, alCambiar, error, ayuda, saldo }: { valor: string; alCambiar: (v: string) => void; error: string | undefined; ayuda: string; saldo: string }) {
  const id = useId();
  const describe = [`${id}-ayuda`, error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className={`campo${error ? " campo-con-error" : ""}`}>
      <label htmlFor={id}>
        Monto recibido
        <span className="requerido" aria-hidden="true"> *</span>
        <span className="solo-lectores"> (obligatorio)</span>
      </label>
      <div className="monto-fila">
        <div className="monto-caja">
          <span className="monto-signo" aria-hidden="true">
            $
          </span>
          <input id={id} inputMode="decimal" autoComplete="off" required value={valor} onChange={(e) => alCambiar(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describe} />
        </div>
        <Boton variante="sutil" onClick={() => alCambiar(saldo)}>
          Todo el saldo
        </Boton>
      </div>
      <p className="campo-ayuda" id={`${id}-ayuda`}>
        {ayuda}
      </p>
      {error ? (
        <p className="campo-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Quien no debe nada no tiene a qué abonar: en lugar del formulario (que solo se podría rechazar) se dice qué hacer. */
function NadaQueCobrar({ tutor, tieneCargos }: { tutor: Tutor; tieneCargos: boolean }) {
  return (
    <Tarjeta titulo="No hay nada que cobrar" className="cobro-formulario no-imprimir">
      <p>{tieneCargos ? "Esta familia está al corriente: no tiene ningún cargo pendiente, así que no se puede registrar un pago." : "Esta familia todavía no tiene cargos, así que no se puede registrar un pago."}</p>
      <p className="muted">Si va a comprar algo (un uniforme, una playera…), primero se registra la venta en «Ventas»: eso genera el cargo y después se cobra aquí.</p>
      <div className="fila">
        <Link className="boton boton-primario" to="/ventas">
          Ir a Ventas
        </Link>
        <Link className="boton" to={`/cuenta/${tutor.id}`}>
          Ver el estado de cuenta
        </Link>
      </div>
    </Tarjeta>
  );
}

function FormularioDePago({ tutor, estado, alRegistrar }: { tutor: Tutor; estado: EstadoDeCuenta; alRegistrar: (p: Pago) => void }) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState("");
  const [ajuste, setAjuste] = useState<Record<string, string> | null>(null);
  const envio = useAccion();
  const claveRef = useRef<{ firma: string; clave: string } | null>(null);

  const montoOk = normalizarCaptura(monto);
  const hayMonto = montoOk !== null && aCentavos(montoOk) > 0n;
  const lista = abiertos(estado);
  const propuesta = useCarga((senal) => api.get<Propuesta>("/api/pagos/propuesta", { tutor_id: tutor.id, monto: montoOk ?? "" }, senal), [tutor.id, montoOk], hayMonto);

  const reparto = ajuste && montoOk ? validarReparto(montoOk, lista.map((l) => ({ id: l.cargo.id, saldo: l.cargo.saldo })), ajuste) : null;
  const exceso = propuesta.datos && !propuesta.datos.ok && propuesta.datos.motivo === "excedente_sin_cargo";
  // Una fecha de mañana en adelante no es un pago ya recibido: se dice aquí, en español, junto al campo (antes lo decía el aviso del navegador, en el idioma del navegador).
  const problemaDeFecha = mensajeDeFechaDePago(fecha, hoyLocal());
  const puedeEnviar = hayMonto && problemaDeFecha === null && (ajuste ? reparto?.ok === true : propuesta.datos?.ok === true);

  const iniciarAjuste = () => {
    const base: Record<string, string> = {};
    for (const a of propuesta.datos?.aplicaciones ?? []) base[a.cargo_id] = a.monto;
    setAjuste(base);
  };

  async function registrar() {
    if (!montoOk) return;
    const aplicaciones = ajuste && reparto ? reparto.aplicaciones : null;
    // La clave se queda mientras el pago sea el mismo: un doble clic, o un reintento después de un corte, llega con la misma clave y el servidor no lo duplica.
    claveRef.current = claveParaEnvio(claveRef.current, firmaDelPago({ tutor_id: tutor.id, monto: montoOk, metodo, referencia, fecha, aplicaciones }));
    const pago = await envio.ejecutar(() =>
      api.post<Pago>("/api/pagos", { tutor_id: tutor.id, monto: montoOk, metodo, ...(referencia.trim() ? { referencia: referencia.trim() } : {}), ...(fecha ? { fecha } : {}), clave_idempotencia: claveRef.current?.clave, ...(aplicaciones ? { aplicaciones } : {}) }),
    );
    if (pago) {
      claveRef.current = null;
      alRegistrar(pago);
    }
  }

  const saldoDespues = hayMonto && propuesta.datos?.ok ? restar(estado.resumen.saldo, montoOk) : null;

  return (
    <Tarjeta titulo="Nuevo pago" className="cobro-formulario no-imprimir">
      <form noValidate
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          if (puedeEnviar) void registrar();
        }}
      >
        <CampoMonto valor={monto} alCambiar={setMonto} error={mensajeDeCaptura(monto)} ayuda={`Se muestra como ${hayMonto ? formatear(montoOk) : "$0.00"}`} saldo={estado.resumen.saldo} />
        <GrupoDeOpciones segmentado etiqueta="Método de pago" valor={metodo} alCambiar={setMetodo} opciones={METODOS.map((m) => ({ valor: m.valor, texto: m.texto }))} />
        <div className="rejilla rejilla-2 campos-pago">
          <CampoTexto etiqueta="Referencia (opcional)" autoComplete="off" value={referencia} onChange={(e) => setReferencia(e.target.value)} ayuda="Folio del voucher o de la transferencia." maxLength={120} />
          <CampoTexto etiqueta="Fecha del pago (opcional)" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} ayuda="Si la dejas vacía, es hoy." {...(problemaDeFecha ? { error: problemaDeFecha } : {})} />
        </div>

        {hayMonto && propuesta.cargando ? <Cargando texto="Calculando el reparto…" /> : null}
        {hayMonto && propuesta.error ? <ErrorDeCarga error={propuesta.error} alReintentar={propuesta.recargar} /> : null}
        {hayMonto && exceso && propuesta.datos ? (
          <Aviso tono="alerta" titulo="El pago pasa de lo que la familia adeuda">
            <p>
              Adeuda {formatear(propuesta.datos.adeudado)} y recibiste {formatear(propuesta.datos.monto)}: sobran {formatear(propuesta.datos.excedente)}. No existe «saldo a favor»: registra solo lo adeudado y da el cambio.
            </p>
          </Aviso>
        ) : null}
        {hayMonto && propuesta.datos?.ok && !ajuste ? (
          <div className="resumen-reparto" data-prueba="propuesta">
            <h3 className="etiqueta-panel">Así se va a repartir</h3>
            <ul className="lista-reparto">
              {propuesta.datos.aplicaciones.map((a) => {
                const l = lista.find((x) => x.cargo.id === a.cargo_id);
                return (
                  <li key={a.cargo_id}>
                    <span>{l ? `${l.hijo} · ${nombreDeCargo(l.cargo)}` : "Cargo"}</span>
                    <span className="solo-lectores">: </span>
                    <span className="reparto-monto">
                      <strong className="numero">{formatear(a.monto)}</strong>
                      {l && aCentavos(a.monto) < aCentavos(l.cargo.saldo) ? <Insignia tono="alerta">Pago parcial</Insignia> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {saldoDespues !== null ? (
              <p className={`reparto-saldo${aCentavos(saldoDespues) === 0n ? " reparto-saldo-cero" : ""}`}>
                <span>Saldo después del pago</span>
                <strong className="numero">{formatear(saldoDespues)}</strong>
              </p>
            ) : null}
            <div>
              <Boton onClick={iniciarAjuste}>Ajustar el reparto a mano</Boton>
            </div>
          </div>
        ) : null}
        {ajuste && hayMonto ? (
          <div className="resumen-reparto" data-prueba="ajuste">
            <h3 className="etiqueta-panel">Reparto a mano</h3>
            <p className="muted">Escribe cuánto va a cada cargo; deben sumar exactamente {formatear(montoOk)} y ninguno puede pasar de su saldo.</p>
            {lista.map(({ cargo, hijo }) => (
              <CampoTexto key={cargo.id} etiqueta={`${hijo} · ${nombreDeCargo(cargo)} (saldo ${formatear(cargo.saldo)})`} inputMode="decimal" autoComplete="off" value={ajuste[cargo.id] ?? ""} onChange={(e) => setAjuste((a) => ({ ...(a ?? {}), [cargo.id]: e.target.value }))} error={reparto?.errores[cargo.id]} />
            ))}
            <p role="status" data-prueba="suma-del-reparto" className="reparto-suma">
              Suma: <strong>{formatear(reparto?.suma ?? "0.00")}</strong> de {formatear(montoOk)}
              {reparto && reparto.diferencia !== "0.00" ? ` · ${reparto.diferencia.startsWith("-") ? "sobran" : "faltan"} ${formatear(reparto.diferencia.replace("-", ""))}` : " · cuadra"}
            </p>
            <div>
              <Boton onClick={() => setAjuste(null)}>Volver al reparto sugerido</Boton>
            </div>
          </div>
        ) : null}
        <ErrorDeAccion error={envio.error} />
        {envio.error?.codigo === "sin_red" ? <Aviso>Si el pago llegó a registrarse, al volver a pulsar «Registrar pago» el servidor reconoce la misma clave y NO lo duplica.</Aviso> : null}
        <Boton type="submit" variante="primario" grande ancho cargando={envio.ocupado} disabled={!puedeEnviar}>
          Registrar pago
        </Boton>
      </form>
    </Tarjeta>
  );
}

function PagosRecientes({ tutorId, version, alCambiar }: { tutorId: string; version: number; alCambiar: () => void }) {
  const { puede } = useSesion();
  const carga = useCarga((senal) => api.get<Pagina<Pago>>("/api/pagos", { tutor_id: tutorId, limite: 10 }, senal), [tutorId, version]);
  const [cancelando, setCancelando] = useState<Pago | null>(null);
  const [motivo, setMotivo] = useState("");
  const accion = useAccion();
  return (
    <Tarjeta titulo="Pagos recientes" className="cobro-recientes">
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.datos && carga.datos.datos.length === 0 ? (
        <Vacio icono="cuenta" titulo="Todavía no hay pagos de esta familia.">
          El primero que registres aparecerá aquí.
        </Vacio>
      ) : null}
      <ul className="lista-filas">
        {(carga.datos?.datos ?? []).map((p) => (
          <li key={p.id} className="fila-dato" data-prueba={`pago-${p.id}`}>
            <span className="fila-dato-texto">
              <span className="fila-pago-monto">
                <strong className="numero fila-titulo">{formatear(p.monto)}</strong> <Insignia tono={p.estatus === "aplicado" ? "exito" : "neutro"}>{p.estatus === "aplicado" ? "Aplicado" : "Cancelado"}</Insignia>
              </span>
              <span className="muted">
                {METODOS.find((m) => m.valor === p.metodo)?.texto ?? p.metodo} · {formatearFecha(p.fecha)}
                {p.motivo_cancelacion ? ` · ${p.motivo_cancelacion}` : ""}
              </span>
            </span>
            {p.estatus === "aplicado" && puede("pagos:cancelar") ? <Boton variante="peligro" className="no-imprimir" onClick={() => setCancelando(p)}>Cancelar pago</Boton> : null}
          </li>
        ))}
      </ul>
      <Dialogo abierto={cancelando !== null} titulo="Cancelar el pago" alCerrar={() => { setCancelando(null); setMotivo(""); accion.limpiar(); }}>
        <p>Se cancela SIN borrarlo: sus cargos recuperan el saldo. Monto: <strong>{formatear(cancelando?.monto)}</strong></p>
        <CampoArea etiqueta="Motivo de la cancelación" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} requerido />
        <ErrorDeAccion error={accion.error} />
        <div className="formulario-acciones">
          <Boton
            variante="peligro"
            grande
            disabled={motivo.trim().length < 3}
            cargando={accion.ocupado}
            onClick={() =>
              void accion.ejecutar(async () => {
                await api.post(`/api/pagos/${cancelando?.id ?? ""}/cancelar`, { motivo: motivo.trim() });
                setCancelando(null);
                setMotivo("");
                alCambiar();
              })
            }
          >
            Cancelar el pago
          </Boton>
          <Boton onClick={() => { setCancelando(null); setMotivo(""); }}>Conservarlo</Boton>
        </div>
      </Dialogo>
    </Tarjeta>
  );
}

export default function RegistrarPago() {
  useTitulo("Registrar pago");
  const [elegido, setTutor] = useState<Tutor | null>(null);
  const [version, setVersion] = useState(0);
  const [pago, setPago] = useState<Pago | null>(null);
  // Se llega desde la ficha de la familia con `?tutor=<id>`: se carga a esa familia sin pasar por el buscador.
  const [params, ponerParams] = useSearchParams();
  const idPedido = params.get("tutor");
  const pedido = useCarga((senal) => api.get<Tutor>(`/api/tutores/${idPedido ?? ""}`, undefined, senal), [idPedido], idPedido !== null && elegido === null);
  const tutor = elegido ?? (idPedido !== null && pedido.datos?.id === idPedido ? pedido.datos : null);
  const estado = useCarga((senal) => api.get<EstadoDeCuenta>(`/api/tutores/${tutor?.id ?? ""}/estado-cuenta`, undefined, senal), [tutor?.id, version], tutor !== null);

  return (
    <Marco titulo="Registrar pago" subtitulo={tutor ? <FamiliaElegida tutor={tutor} /> : "Busca a la familia"} acciones={tutor ? <Boton className="no-imprimir" onClick={() => { setTutor(null); setPago(null); ponerParams({}); }}><Icono nombre="buscar" tamano={18} />Cambiar de familia</Boton> : undefined}>
      {!tutor ? <BuscadorDeFamilia alElegir={(t) => { setTutor(t); setPago(null); }} /> : null}
      {tutor && estado.error ? <ErrorDeCarga error={estado.error} alReintentar={estado.recargar} /> : null}
      {tutor && estado.cargando && !estado.datos ? <Cargando /> : null}
      {tutor && estado.datos ? (
        <>
          {pago ? (
            <Aviso tono="exito" titulo={pago.repetido ? "Este pago ya estaba registrado: no se duplicó" : "Pago registrado"}>
              <div data-prueba="pago-registrado" className="pila recibo-pago">
                <h2 className="solo-impresion recibo-titulo">Recibo de pago</h2>
                <p className="cifra-principal recibo-monto numero">{formatear(pago.monto)}</p>
                <p className="recibo-detalle">
                  {METODOS.find((m) => m.valor === pago.metodo)?.texto ?? pago.metodo} · {formatearFecha(pago.fecha)}
                  {pago.referencia ? ` · ref. ${pago.referencia}` : ""}
                </p>
                <ul className="recibo-reparto">
                  {pago.aplicaciones.map((a) => (
                    <li key={a.id}>
                      {a.alumno.nombre} · {nombreDeCargo(a)}: {formatear(a.monto)}
                    </li>
                  ))}
                </ul>
                {estado.cargando ? null : (
                  <p data-prueba="saldo-despues-del-pago">
                    Ahora la familia debe: <strong>{formatear(estado.datos.resumen.saldo)}</strong>
                  </p>
                )}
                <div className="fila no-imprimir">
                  <Boton variante="primario" onClick={() => setPago(null)}>
                    Registrar otro pago
                  </Boton>
                  <Boton onClick={() => window.print()}>Imprimir recibo</Boton>
                  <Link className="boton" to={`/cuenta/${tutor.id}`}>
                    Ver el estado de cuenta
                  </Link>
                </div>
              </div>
            </Aviso>
          ) : null}
          <div className={`cobro${pago ? " cobro-con-recibo" : ""}`}>
            <DeudaDeLaFamilia estado={estado.datos} />
            {!pago ? (
              abiertos(estado.datos).length === 0 ? (
                <NadaQueCobrar tutor={tutor} tieneCargos={estado.datos.hijos.length > 0} />
              ) : (
                <FormularioDePago
                  key={`${tutor.id}-${version}`}
                  tutor={tutor}
                  estado={estado.datos}
                  alRegistrar={(p) => {
                    setPago(p);
                    setVersion((v) => v + 1);
                  }}
                />
              )
            ) : null}
            <PagosRecientes tutorId={tutor.id} version={version} alCambiar={() => setVersion((v) => v + 1)} />
          </div>
        </>
      ) : null}
    </Marco>
  );
}
