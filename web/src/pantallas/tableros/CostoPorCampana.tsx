// Costo por alumno inscrito por campaña (I2). Solo el administrador. El gasto de cada campaña se captura a mano; el costo sale de dividir ese gasto entre lo que produjo
// (leads, clases muestra, alumnos inscritos), al centavo, y «—» cuando no hay divisor. Los importes son texto exacto: nada pasa por números flotantes.

import { useRef, useState } from "react";
import { api, armarConsulta } from "../../api/cliente.ts";
import { cantidad } from "../../lib/cantidad.ts";
import { aCentavos, formatear, normalizarCaptura } from "../../lib/dinero.ts";
import { formatearFecha, hoyLocal } from "../../lib/fechas.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Tarjeta } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import { claveParaEnvio } from "../recepcion/reparto.ts";
import { Barras, Indicador } from "./Barras.tsx";
import { Filtros, type ValoresDeFiltro } from "./Filtros.tsx";
import type { FilaDeCosto, GastoDeCampana, ReporteDeCosto } from "./tipos.ts";

const texto = (t: string): string => (t === "—" ? "—" : formatear(t));

function Gastos({ campana, alCambiar, alCerrar }: { campana: FilaDeCosto["campana"]; alCambiar: () => void; alCerrar: () => void }) {
  const lista = useCarga((senal) => api.get<{ datos: GastoDeCampana[]; total: string }>(`/api/campanas/${campana.id}/gastos`, undefined, senal), [campana.id]);
  const [fecha, setFecha] = useState(hoyLocal());
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const quitar = useAccion();
  const { avisar } = useAvisos();
  // V7: quitar un gasto pide confirmar en la misma fila (antes se perdía con un clic; si se equivoca, hay que volver a capturarlo).
  const [confirmando, setConfirmando] = useState<string | null>(null);
  // EK-I04: la misma captura reintentada (doble clic, red) lleva la MISMA clave y no duplica el gasto; otra captura (o una ya guardada) lleva una nueva.
  const claveRef = useRef<{ firma: string; clave: string } | null>(null);
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  return (
    <div className="pila">
      <p>
        Campaña: <strong>{campana.nombre}</strong>
      </p>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos ? (
        <>
          <p>
            Gastado en total: <strong data-prueba="gasto-total">{formatear(lista.datos.total)}</strong>
          </p>
          <ul data-prueba="gastos">
            {lista.datos.datos.map((g) => (
              <li key={g.id} className="fila fila-entre">
                {confirmando === g.id ? (
                  <>
                    <span>
                      ¿Quitar el gasto de <strong>{formatear(g.monto)}</strong> del {formatearFecha(g.fecha)}?
                    </span>
                    <span className="fila">
                      <Boton
                        variante="peligro"
                        disabled={quitar.ocupado}
                        onClick={() =>
                          void quitar.ejecutar(async () => {
                            await api.delete(`/api/campanas/${campana.id}/gastos/${g.id}`);
                            setConfirmando(null);
                            lista.recargar();
                            alCambiar();
                            avisar(`Se quitó el gasto de ${formatear(g.monto)} de «${campana.nombre}»: el costo ya está recalculado.`);
                          })
                        }
                      >
                        Sí, quitarlo
                      </Boton>
                      <Boton onClick={() => setConfirmando(null)}>No</Boton>
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {formatearFecha(g.fecha)} · <strong>{formatear(g.monto)}</strong>
                      {g.nota ? ` · ${g.nota}` : ""}
                    </span>
                    <Boton variante="fantasma" disabled={quitar.ocupado} onClick={() => setConfirmando(g.id)}>
                      Dar de baja
                    </Boton>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <ErrorDeAccion error={quitar.error} />
      <form
        className="formulario"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          const e: Record<string, string> = {};
          const m = normalizarCaptura(monto);
          if (m === null || aCentavos(m) === 0n) e["monto"] = "Escribe un importe válido mayor que cero (por ejemplo 1500 o 1500.50)";
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) e["fecha"] = "Elige la fecha";
          setLocal(e);
          if (Object.keys(e).length > 0 || m === null) return;
          const firma = JSON.stringify([campana.id, fecha, m, nota.trim()]);
          claveRef.current = claveParaEnvio(claveRef.current, firma, "gasto");
          const clave = claveRef.current.clave;
          void guardar.ejecutar(async () => {
            await api.post(`/api/campanas/${campana.id}/gastos`, { fecha, monto: m, ...(nota.trim() ? { nota: nota.trim() } : {}), clave_idempotencia: clave });
            claveRef.current = null;
            setMonto("");
            setNota("");
            lista.recargar();
            alCambiar();
            avisar(`Se capturó el gasto de ${formatear(m)} en «${campana.nombre}»: el costo ya está recalculado.`);
          });
        }}
      >
        <h3>Capturar un gasto</h3>
        <p className="muted">Un gasto no se edita: si hubo un error, se da de baja y se captura el correcto.</p>
        <CampoTexto etiqueta="Fecha" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} error={err("fecha")} />
        <CampoTexto etiqueta="Monto (MXN)" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} error={err("monto")} />
        <CampoTexto etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
        <ErrorDeAccion error={guardar.error} enCampos={["fecha", "monto"]} />
        <div className="formulario-acciones">
          <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
            Capturar el gasto
          </Boton>
          <Boton onClick={alCerrar}>Cerrar</Boton>
        </div>
      </form>
    </div>
  );
}

export function CostoPorCampana({ filtros, alCambiar }: { filtros: ValoresDeFiltro; alCambiar: (v: ValoresDeFiltro) => void }) {
  const consulta = { desde: filtros.desde, hasta: filtros.hasta };
  const carga = useCarga((senal) => api.get<ReporteDeCosto>("/api/reportes/costo-por-alumno", consulta, senal), [filtros.desde, filtros.hasta]);
  const [gastos, setGastos] = useState<FilaDeCosto["campana"] | null>(null);
  const r = carga.datos;
  return (
    <div className="pila" data-prueba="tablero-costo">
      <Filtros valores={filtros} alCambiar={alCambiar} conSucursalYVertical={false} />
      <div>
        <a className="boton" href={`/api/reportes/costo-por-alumno${armarConsulta({ ...consulta, formato: "csv" })}`} download data-prueba="descargar-costo">
          Descargar CSV
        </a>
      </div>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !r ? <Cargando /> : null}
      {r ? (
        <>
          <div className="indicadores">
            <Indicador etiqueta="Gasto total" valor={formatear(r.total.gasto)} prueba="ind-gasto" />
            <Indicador etiqueta="Costo por lead" valor={texto(r.total.costo_por_lead_texto)} />
            <Indicador etiqueta="Costo por clase muestra" valor={texto(r.total.costo_por_clase_muestra_texto)} />
            <Indicador etiqueta="Costo por alumno inscrito" valor={texto(r.total.costo_por_alumno_texto)} nota={`${cantidad(r.total.inscripciones_activas, "inscripción activa", "inscripciones activas")}`} prueba="ind-costo-alumno" />
          </div>
          {r.filas.length === 0 ? (
            <Aviso tono="info">
              <span data-prueba="aviso-sin-campanas">Todavía no hay campañas. Se dan de alta en Administración → Campañas y códigos QR; luego aquí capturas lo que gastas en cada una.</span>
            </Aviso>
          ) : r.filas.some((f) => f.gasto === "0.00") ? (
            <Aviso tono="info">
              <span data-prueba="aviso-sin-gasto">
                {(() => {
                  const sin = r.filas.filter((f) => f.gasto === "0.00");
                  return `${sin.length === 1 ? "Una campaña no tiene" : `${sin.length} campañas no tienen`} gasto capturado (${sin.slice(0, 3).map((f) => `«${f.campana.nombre}»`).join(", ")}${sin.length > 3 ? " y otras" : ""}): sus costos salen en $0.00, que no quiere decir que cuesten cero. Toca «Capturar o ver gastos» y anota lo que gastaste.`;
                })()}
              </span>
            </Aviso>
          ) : null}
          <Tarjeta>
            <Barras
              titulo="Gasto por campaña"
              filas={r.filas.map((f) => ({ clave: f.campana.id, etiqueta: f.campana.nombre, valor: aCentavos(f.gasto), texto: formatear(f.gasto), nota: `${cantidad(f.leads, "lead", "leads")} · ${cantidad(f.clases_muestra, "clase muestra", "clases muestra")} · ${cantidad(f.inscripciones_activas, "alumno inscrito", "alumnos inscritos")}` }))}
              vacio="Todavía no hay campañas."
            />
          </Tarjeta>
          <Tarjeta titulo="Costo por campaña">
            <div className="tabla-scroll">
              <table className="tabla" data-prueba="tabla-de-costo">
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th className="derecha">Gasto</th>
                    <th className="derecha">Por lead</th>
                    <th className="derecha">Por clase</th>
                    <th className="derecha">Por alumno</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {r.filas.map((f) => (
                    <tr key={f.campana.id} data-prueba={`costo-${f.campana.id}`}>
                      <td>{f.campana.nombre}</td>
                      <td className="derecha numero">{formatear(f.gasto)}</td>
                      <td className="derecha numero">{texto(f.costo_por_lead_texto)}</td>
                      <td className="derecha numero">{texto(f.costo_por_clase_muestra_texto)}</td>
                      <td className="derecha numero">{texto(f.costo_por_alumno_texto)}</td>
                      <td>
                        <Boton onClick={() => setGastos(f.campana)}>Capturar o ver gastos</Boton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">«—» significa que no hay con qué dividir (por ejemplo, ningún alumno inscrito todavía). El gasto se captura a mano.</p>
          </Tarjeta>
        </>
      ) : null}
      <Dialogo abierto={gastos !== null} titulo="Gastos de la campaña" alCerrar={() => setGastos(null)}>
        {gastos ? <Gastos campana={gastos} alCambiar={carga.recargar} alCerrar={() => setGastos(null)} /> : null}
      </Dialogo>
    </div>
  );
}
