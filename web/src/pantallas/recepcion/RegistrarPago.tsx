// Registrar un pago en recepción: buscar a la familia, ver lo que adeuda por hijo (con cuánto cubre el monto escrito), proponer el reparto (lo calcula el servidor: primero lo que venció antes),
// ajustarlo a mano entre los cargos de varios hijos, pago parcial, y UNA clave de idempotencia por envío (un doble clic o un reintento tras un corte de red no duplica el pago).
// Todos los importes son texto decimal exacto del servidor o centavos `bigint`; aquí no hay ni un número flotante.

import { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { aCentavos, comparar, formatear, normalizarCaptura, restar } from "../../lib/dinero.ts";
import { formatearDiaYMes, hoyLocal, mensajeDeFechaDePago } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoTexto, GrupoDeOpciones } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { BuscadorDeFamilia } from "./BuscadorDeFamilia.tsx";
import { DeudaDeLaFamilia } from "./DeudaDeLaFamilia.tsx";
import { TarjetaDeFamilia } from "./FamiliaElegida.tsx";
import { CancelarPago } from "./CancelarPago.tsx";
import { PagoRegistrado } from "./PagoRegistrado.tsx";
import { atajosDeMonto, cargosAbiertos, claveParaEnvio, firmaDelPago, folioDePago, mensajeDeCaptura, mensajeDeExceso, validarReparto } from "./reparto.ts";
import { METODOS, nombreDeCargo, type EstadoDeCuenta, type Pago, type Propuesta } from "./tipos.ts";
import { useEtiquetasDeHijos } from "./useEtiquetasDeHijos.ts";

/** El importe del cobro: la cifra que se teclea es la más grande del formulario. Debajo, los atajos «Todo el saldo» y «Solo lo vencido» (con su importe) lo llenan de un toque. */
function CampoMonto({ valor, alCambiar, error, ayuda, atajos, montoOk }: { valor: string; alCambiar: (v: string) => void; error: string | undefined; ayuda: string; atajos: ReturnType<typeof atajosDeMonto>; montoOk: string | null }) {
  const id = useId();
  const describe = [`${id}-ayuda`, error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className={`campo${error ? " campo-con-error" : ""}`}>
      <label htmlFor={id}>
        Monto recibido
        <span className="requerido" aria-hidden="true"> *</span>
        <span className="solo-lectores"> (obligatorio)</span>
      </label>
      <div className="monto-caja">
        <span className="monto-signo" aria-hidden="true">
          $
        </span>
        <input id={id} inputMode="decimal" autoComplete="off" placeholder="0.00" required value={valor} onChange={(e) => alCambiar(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describe} />
      </div>
      <p className="campo-ayuda" id={`${id}-ayuda`}>
        {ayuda}
      </p>
      {error ? (
        <p className="campo-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
      {atajos.length > 0 ? (
        <div className="atajos-monto" role="group" aria-label="Atajos de monto">
          {atajos.map((a) => (
            <button key={a.clave} type="button" className="atajo-monto" aria-pressed={montoOk !== null && comparar(montoOk, a.importe) === 0} onClick={() => alCambiar(a.importe)}>
              {a.texto} · {formatear(a.importe)}
            </button>
          ))}
        </div>
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

/** Lo que cubre el pago, cargo por cargo (id del cargo → importe que se le aplica): la barra de cada cargo lo dibuja. */
type Cubre = Record<string, string>;

function FormularioDePago({ tutor, estado, alRegistrar, alCubrir }: { tutor: Tutor; estado: EstadoDeCuenta; alRegistrar: (p: Pago) => void; alCubrir: (c: Cubre) => void }) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState("");
  const [ajuste, setAjuste] = useState<Record<string, string> | null>(null);
  const envio = useAccion();
  const claveRef = useRef<{ firma: string; clave: string } | null>(null);

  const saldo = estado.resumen.saldo;
  const montoOk = normalizarCaptura(monto);
  const hayMonto = montoOk !== null && aCentavos(montoOk) > 0n;
  // Un monto que pasa de lo que la familia adeuda se dice aquí mismo, con la cifra; el servidor lo rechazaría igual (y su aviso explica qué hacer: no existe «saldo a favor»).
  const errorDeMonto = mensajeDeCaptura(monto) ?? (hayMonto ? mensajeDeExceso(montoOk, saldo) : undefined);
  const montoDentro = hayMonto && errorDeMonto === undefined;
  const lista = cargosAbiertos(estado);
  const propuesta = useCarga((senal) => api.get<Propuesta>("/api/pagos/propuesta", { tutor_id: tutor.id, monto: montoOk ?? "" }, senal), [tutor.id, montoOk], hayMonto);
  // La última propuesta que llegó: las barras de los cargos se quedan con ella mientras se calcula la siguiente (no parpadean a cero con cada tecla).
  const [ultima, setUltima] = useState<Propuesta | null>(null);
  if (propuesta.datos && propuesta.datos !== ultima) setUltima(propuesta.datos);

  const reparto = ajuste && montoOk ? validarReparto(montoOk, lista.map((l) => ({ id: l.cargo.id, saldo: l.cargo.saldo })), ajuste) : null;
  const exceso = propuesta.datos && !propuesta.datos.ok && propuesta.datos.motivo === "excedente_sin_cargo";
  // Una fecha de mañana en adelante no es un pago ya recibido: se dice aquí, en español, junto al campo (antes lo decía el aviso del navegador, en el idioma del navegador).
  const problemaDeFecha = mensajeDeFechaDePago(fecha, hoyLocal());
  const puedeEnviar = hayMonto && problemaDeFecha === null && (ajuste ? reparto?.ok === true : propuesta.datos?.ok === true);
  // El efectivo no lleva referencia: si se escribió una y luego se cambió a efectivo, no viaja.
  const pideReferencia = metodo !== "efectivo";
  const referenciaEfectiva = pideReferencia ? referencia : "";

  // Lo que cubre el pago, para las barras de la tarjeta de lo que adeuda: el reparto a mano si hay, y si no la propuesta del servidor.
  const filasCubiertas = !montoDentro ? [] : ajuste ? (reparto?.aplicaciones ?? []) : ultima?.ok ? ultima.aplicaciones : [];
  const claveCubre = JSON.stringify(filasCubiertas.map((a) => [a.cargo_id, a.monto]));
  useEffect(() => {
    alCubrir(Object.fromEntries(JSON.parse(claveCubre) as [string, string][]));
  }, [claveCubre, alCubrir]);
  useEffect(() => () => alCubrir({}), [alCubrir]);

  const iniciarAjuste = () => {
    const base: Record<string, string> = {};
    for (const a of propuesta.datos?.aplicaciones ?? []) base[a.cargo_id] = a.monto;
    setAjuste(base);
  };

  async function registrar() {
    if (!montoOk) return;
    const aplicaciones = ajuste && reparto ? reparto.aplicaciones : null;
    // La clave se queda mientras el pago sea el mismo: un doble clic, o un reintento después de un corte, llega con la misma clave y el servidor no lo duplica.
    claveRef.current = claveParaEnvio(claveRef.current, firmaDelPago({ tutor_id: tutor.id, monto: montoOk, metodo, referencia: referenciaEfectiva, fecha, aplicaciones }));
    const pago = await envio.ejecutar(() =>
      api.post<Pago>("/api/pagos", { tutor_id: tutor.id, monto: montoOk, metodo, ...(referenciaEfectiva.trim() ? { referencia: referenciaEfectiva.trim() } : {}), ...(fecha ? { fecha } : {}), clave_idempotencia: claveRef.current?.clave, ...(aplicaciones ? { aplicaciones } : {}) }),
    );
    if (pago) {
      claveRef.current = null;
      alRegistrar(pago);
    }
  }

  const saldoDespues = montoDentro ? restar(saldo, montoOk) : saldo;
  const verReparto = !ajuste && !exceso && !(hayMonto && propuesta.error);

  return (
    <Tarjeta titulo="Nuevo pago" className="cobro-formulario no-imprimir">
      <form noValidate
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          if (puedeEnviar) void registrar();
        }}
      >
        <CampoMonto valor={monto} alCambiar={setMonto} error={errorDeMonto} ayuda={`Se muestra como ${hayMonto ? formatear(montoOk) : "$0.00"}`} atajos={atajosDeMonto(saldo, estado.resumen.vencido)} montoOk={montoOk} />
        <GrupoDeOpciones segmentado etiqueta="Método de pago" valor={metodo} alCambiar={setMetodo} opciones={METODOS.map((m) => ({ valor: m.valor, texto: m.texto }))} />
        <div className="rejilla rejilla-2 campos-pago">
          {pideReferencia ? <CampoTexto etiqueta="Referencia (opcional)" autoComplete="off" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder={metodo === "tarjeta" ? "Folio del voucher" : "Clave de rastreo del banco"} maxLength={120} /> : null}
          <CampoTexto etiqueta="Fecha del pago (opcional)" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} ayuda="Si la dejas vacía, es hoy." {...(problemaDeFecha ? { error: problemaDeFecha } : {})} />
        </div>

        {hayMonto && propuesta.error ? <ErrorDeCarga error={propuesta.error} alReintentar={propuesta.recargar} /> : null}
        {hayMonto && exceso && propuesta.datos ? (
          <Aviso tono="alerta" titulo="El pago pasa de lo que la familia adeuda">
            <p>
              Adeuda {formatear(propuesta.datos.adeudado)} y recibiste {formatear(propuesta.datos.monto)}: sobran {formatear(propuesta.datos.excedente)}. No existe «saldo a favor»: registra solo lo adeudado y da el cambio.
            </p>
          </Aviso>
        ) : null}
        {verReparto ? (
          <div className="resumen-reparto" {...(hayMonto && propuesta.datos?.ok ? { "data-prueba": "propuesta" } : {})}>
            <h3 className="etiqueta-panel">Así se va a repartir</h3>
            {!montoDentro ? <p className="reparto-vacio">Escribe el monto para ver a qué cargos se aplica. Primero se paga lo más antiguo.</p> : null}
            {montoDentro && propuesta.cargando && !propuesta.datos ? <Cargando texto="Calculando el reparto…" /> : null}
            {montoDentro && propuesta.datos?.ok ? (
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
            ) : null}
            <p className={`reparto-saldo${montoDentro && aCentavos(saldoDespues) === 0n ? " reparto-saldo-cero" : ""}`}>
              <span>Saldo después del pago</span>
              <strong className="numero">{formatear(saldoDespues)}</strong>
            </p>
            {montoDentro && propuesta.datos?.ok ? (
              <div>
                <Boton onClick={iniciarAjuste}>Ajustar el reparto a mano</Boton>
              </div>
            ) : null}
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
          {montoDentro ? `Registrar pago de ${formatear(montoOk)}` : "Registrar pago"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

function PagosRecientes({ tutorId, version, nuevoId, alCambiar }: { tutorId: string; version: number; nuevoId: string | null; alCambiar: () => void }) {
  const { puede } = useSesion();
  const carga = useCarga((senal) => api.get<Pagina<Pago>>("/api/pagos", { tutor_id: tutorId, limite: 10 }, senal), [tutorId]);
  // Un pago nuevo o cancelado recarga la lista sin vaciarla (la lista conserva lo mostrado mientras llega la nueva).
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    carga.recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la versión
  }, [version]);
  const [cancelando, setCancelando] = useState<Pago | null>(null);
  const hoy = hoyLocal();
  return (
    <Tarjeta titulo="Pagos recientes" className="cobro-recientes">
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.datos && carga.datos.datos.length === 0 ? (
        <Vacio icono="cuenta" titulo="Todavía no hay pagos de esta familia.">
          El primero que registres aparecerá aquí.
        </Vacio>
      ) : null}
      <ul className="pagos-recientes">
        {(carga.datos?.datos ?? []).map((p) => (
          <li key={p.id} className={`pago-fila${p.id === nuevoId ? " pago-fila-nuevo" : ""}`} data-prueba={`pago-${p.id}`}>
            <span className="fila-dato-texto">
              <span className="pago-fila-fecha">
                <strong>{formatearDiaYMes(p.fecha, hoy)}</strong>
                {p.id === nuevoId ? <span className="pago-nuevo">Nuevo</span> : null}
                {p.estatus === "cancelado" ? <Insignia>Cancelado</Insignia> : null}
              </span>
              <span className="muted">
                {METODOS.find((m) => m.valor === p.metodo)?.texto ?? p.metodo}
                {p.referencia ? ` · ref. ${p.referencia}` : ""} · folio {folioDePago(p.id)}
                {p.motivo_cancelacion ? ` · ${p.motivo_cancelacion}` : ""}
              </span>
            </span>
            <span className="pago-fila-derecha">
              <strong className={`numero${p.estatus === "cancelado" ? " pago-monto-cancelado" : ""}`}>{formatear(p.monto)}</strong>
              {p.estatus === "aplicado" && puede("pagos:cancelar") ? <Boton variante="peligro" className="no-imprimir" onClick={() => setCancelando(p)}>Cancelar pago</Boton> : null}
            </span>
          </li>
        ))}
      </ul>
      <CancelarPago
        pago={cancelando}
        alCerrar={() => setCancelando(null)}
        alCancelado={() => {
          setCancelando(null);
          alCambiar();
        }}
      />
    </Tarjeta>
  );
}

export default function RegistrarPago() {
  useTitulo("Registrar pago");
  const [elegido, setTutor] = useState<Tutor | null>(null);
  // `claveDelFormulario` reinicia el formulario tras registrar un pago; `versionDeLista`, la lista de pagos recientes (un pago nuevo o cancelado).
  const [claveDelFormulario, setClaveDelFormulario] = useState(0);
  const [versionDeLista, setVersionDeLista] = useState(0);
  // El pago recién registrado y el estado de cuenta de antes, para saber cuándo llegó el saldo ya al día (y no mostrar el de antes del pago).
  const [registro, setRegistro] = useState<{ pago: Pago; previo: EstadoDeCuenta } | null>(null);
  const [nuevoId, setNuevoId] = useState<string | null>(null);
  const [cubre, setCubre] = useState<Cubre>({});
  const [buscando, setBuscando] = useState(false);
  // Se llega desde la ficha de la familia con `?tutor=<id>`: se carga a esa familia sin pasar por el buscador.
  const [params, ponerParams] = useSearchParams();
  const idPedido = params.get("tutor");
  const pedido = useCarga((senal) => api.get<Tutor>(`/api/tutores/${idPedido ?? ""}`, undefined, senal), [idPedido], idPedido !== null && elegido === null);
  const tutor = elegido ?? (idPedido !== null && pedido.datos?.id === idPedido ? pedido.datos : null);
  const estado = useCarga((senal) => api.get<EstadoDeCuenta>(`/api/tutores/${tutor?.id ?? ""}/estado-cuenta`, undefined, senal), [tutor?.id], tutor !== null);
  const etiquetas = useEtiquetasDeHijos(tutor);
  const pago = registro?.pago ?? null;
  const saldoAlDia = registro && estado.datos && estado.datos !== registro.previo && !estado.cargando ? estado.datos.resumen.saldo : null;

  const elegirFamilia = (t: Tutor) => {
    setBuscando(false);
    if (t.id === tutor?.id) return;
    setTutor(t);
    setRegistro(null);
    setNuevoId(null);
    setCubre({});
    ponerParams({});
  };

  return (
    <Marco titulo="Registrar pago" subtitulo={tutor ? undefined : "Busca a la familia"} acciones={tutor ? <Boton className="no-imprimir" onClick={() => setBuscando(true)}><Icono nombre="buscar" tamano={18} />Cambiar de familia</Boton> : undefined}>
      {!tutor ? <BuscadorDeFamilia alElegir={elegirFamilia} /> : null}
      {tutor ? <TarjetaDeFamilia tutor={tutor} etiquetas={etiquetas} /> : null}
      {tutor && estado.error ? <ErrorDeCarga error={estado.error} alReintentar={estado.recargar} /> : null}
      {tutor && estado.cargando && !estado.datos ? <Cargando /> : null}
      {tutor && estado.datos ? (
        <div className={`cobro${pago ? " cobro-con-recibo" : ""}`}>
          <DeudaDeLaFamilia estado={estado.datos} aplicado={pago ? {} : cubre} etiquetas={etiquetas} />
          {pago ? (
            <PagoRegistrado pago={pago} tutorId={tutor.id} saldoDespues={saldoAlDia} alOtro={() => setRegistro(null)} />
          ) : cargosAbiertos(estado.datos).length === 0 ? (
            <NadaQueCobrar tutor={tutor} tieneCargos={estado.datos.hijos.length > 0} />
          ) : (
            <FormularioDePago
              key={`${tutor.id}-${claveDelFormulario}`}
              tutor={tutor}
              estado={estado.datos}
              alCubrir={setCubre}
              alRegistrar={(p) => {
                setRegistro({ pago: p, previo: estado.datos as EstadoDeCuenta });
                setNuevoId(p.id);
                setClaveDelFormulario((v) => v + 1);
                setVersionDeLista((v) => v + 1);
                estado.recargar();
              }}
            />
          )}
          <PagosRecientes
            tutorId={tutor.id}
            version={versionDeLista}
            nuevoId={nuevoId}
            alCambiar={() => {
              setVersionDeLista((v) => v + 1);
              estado.recargar();
            }}
          />
        </div>
      ) : null}
      <Dialogo abierto={buscando} titulo="Buscar familia" alCerrar={() => setBuscando(false)}>
        <BuscadorDeFamilia enDialogo alElegir={elegirFamilia} />
        <div className="formulario-acciones">
          <Boton onClick={() => setBuscando(false)}>Cancelar</Boton>
        </div>
      </Dialogo>
    </Marco>
  );
}
