// Reporte ejecutivo (I3): alumnos activos, altas y bajas del mes, deserción, ingreso mensual recurrente, cartera vencida con su antigüedad y ocupación por grupo.
// Activos, ingreso, cartera y ocupación son la foto de HOY; altas, bajas y deserción son del mes elegido. Importes: texto exacto.

import { cantidad } from "../../lib/cantidad.ts";
import { api, armarConsulta } from "../../api/cliente.ts";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import { hoyLocal } from "../../lib/fechas.ts";
import { Cargando, ErrorDeCarga, Insignia, Tarjeta } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { useCarga } from "../../ui/hooks.ts";
import { Barras, Indicador } from "./Barras.tsx";
import type { Ejecutivo as Datos } from "./tipos.ts";

const TRAMOS = [
  ["de_0_a_30", "1 a 30 días"],
  ["de_31_a_60", "31 a 60 días"],
  ["de_61_a_90", "61 a 90 días"],
  ["mas_de_90", "Más de 90 días"],
] as const;
const ESTADO = { a_reventar: { texto: "A reventar: abrir otro grupo", tono: "alerta" }, vacio: { texto: "Vacío: promoverlo", tono: "info" }, normal: { texto: "Normal", tono: "neutro" } } as const;

export function Ejecutivo({ mes, alCambiarMes }: { mes: string; alCambiarMes: (m: string) => void }) {
  const carga = useCarga((senal) => api.get<Datos>("/api/reportes/ejecutivo", { mes }, senal), [mes]);
  const r = carga.datos;
  const csv = (seccion: string) => `/api/reportes/ejecutivo${armarConsulta({ mes, formato: "csv", seccion })}`;
  return (
    <div className="pila" data-prueba="tablero-ejecutivo">
      <div className="filtros">
        <CampoTexto etiqueta="Mes" type="month" max={hoyLocal().slice(0, 7)} value={mes} onChange={(e) => e.target.value && alCambiarMes(e.target.value)} ayuda="Altas, bajas y deserción son de este mes; lo demás es la foto de hoy." />
      </div>
      <div className="fila">
        <a className="boton" href={csv("resumen")} download data-prueba="descargar-ejecutivo">Descargar resumen (CSV)</a>
        <a className="boton" href={csv("activos")} download>Activos por disciplina (CSV)</a>
        <a className="boton" href={csv("ocupacion")} download>Ocupación por grupo (CSV)</a>
      </div>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !r ? <Cargando /> : null}
      {r ? (
        <>
          <div className="indicadores" data-prueba="indicadores-ejecutivo">
            <Indicador etiqueta="Alumnos activos" valor={r.activos.total_alumnos} nota={cantidad(r.activos.total_inscripciones, "inscripción", "inscripciones")} prueba="ind-activos" />
            <Indicador etiqueta="Altas del mes" valor={r.altas_del_mes} prueba="ind-altas" />
            <Indicador etiqueta="Bajas del mes" valor={r.bajas_del_mes} prueba="ind-bajas" />
            <Indicador etiqueta="Deserción" valor={r.desercion_texto} nota={`sobre ${r.base_al_inicio_del_mes} al inicio del mes`} prueba="ind-desercion" />
            <Indicador etiqueta="Ingreso mensual recurrente" valor={formatear(r.ingreso_mensual_recurrente)} prueba="ind-ingreso" />
            <Indicador etiqueta="Cartera vencida" valor={formatear(r.cartera_vencida.total)} prueba="ind-cartera" />
          </div>
          <Tarjeta>
            <Barras titulo="Alumnos activos por disciplina y sucursal" filas={r.activos.por_vertical_y_sucursal.map((f) => ({ clave: `${f.vertical.id}|${f.sucursal.id}`, etiqueta: `${f.vertical.nombre} · ${f.sucursal.nombre}`, valor: BigInt(f.alumnos), texto: cantidad(f.alumnos, "alumno", "alumnos"), nota: `Ingreso mensual ${formatear(f.ingreso_mensual_recurrente)}` }))} vacio="Todavía no hay alumnos activos." />
          </Tarjeta>
          <Tarjeta>
            <Barras titulo="Antigüedad de la cartera vencida" filas={TRAMOS.map(([clave, etiqueta]) => ({ clave, etiqueta, valor: aCentavos(r.cartera_vencida.antiguedad[clave]), texto: formatear(r.cartera_vencida.antiguedad[clave]) }))} />
          </Tarjeta>
          <Tarjeta>
            <Barras titulo="Ocupación por grupo" filas={r.ocupacion_por_grupo.map((g) => ({ clave: g.grupo.id, etiqueta: `${g.grupo.nombre} · ${g.programa}`, valor: BigInt(g.ocupados), fondo: BigInt(g.cupo_maximo), texto: `${g.ocupados} de ${g.cupo_maximo} (${g.ocupacion} %)`, nota: `${ESTADO[g.estado].texto} · ${g.sucursal.nombre}` }))} vacio="Todavía no hay grupos activos." />
            <p className="muted">Los grupos más llenos van primero. Cuándo un grupo cuenta como «a reventar» o como «vacío» se decide en Administración → Configuración.</p>
          </Tarjeta>
          <Tarjeta titulo="Ocupación en tabla">
            <div className="tabla-scroll">
              <table className="tabla" data-prueba="tabla-de-ocupacion">
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Sucursal</th>
                    <th className="derecha">Ocupados</th>
                    <th className="derecha">Cupo</th>
                    <th className="derecha">%</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {r.ocupacion_por_grupo.map((g) => (
                    <tr key={g.grupo.id}>
                      <td>{g.grupo.nombre}</td>
                      <td>{g.sucursal.nombre}</td>
                      <td className="derecha numero">{g.ocupados}</td>
                      <td className="derecha numero">{g.cupo_maximo}</td>
                      <td className="derecha numero">{g.ocupacion}</td>
                      <td>
                        <Insignia tono={ESTADO[g.estado].tono}>{ESTADO[g.estado].texto}</Insignia>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </>
      ) : null}
    </div>
  );
}
