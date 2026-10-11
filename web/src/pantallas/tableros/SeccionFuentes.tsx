// 02 Fuentes y campañas: leads, inscritos, conversión, gasto y costo por alumno de cada fuente o campaña, con «Lo más barato». El gasto y el costo solo los ve quien tiene el permiso de
// costos (administrador): para el asesor la API los manda vacíos y la sección no tiene esas columnas. Debajo (solo administrador) sigue el costo por campaña de siempre, donde se captura
// el gasto de cada una. TEXTO PRIMERO: cada barra escribe su cifra; las barras son un adorno (`aria-hidden`).

import type { FilaDeFuente, ReporteDeFuentes } from "../../api/tipos.ts";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import { Aviso, Insignia, Vacio } from "../../ui/basicos.tsx";
import type { Carga } from "../../ui/hooks.ts";
import { FUENTES } from "../asesor/fuentes.ts";
import { Indicador } from "./Barras.tsx";
import { CargaDeSeccion } from "./CargaDeSeccion.tsx";
import { CostoPorCampana } from "./CostoPorCampana.tsx";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import { decimasDe, maximoDe, porcentajeDeBarra, redondeado } from "./graficas.ts";
import { fraseDeFuentes } from "./narrativa.ts";

const nombreDeFuente = (clave: string): string => FUENTES[clave] ?? clave;

/** Un renglón con su barra de adorno y su cifra escrita al lado. */
function BarraConCifra({ valor, maximo, texto, rojo = false }: { valor: bigint; maximo: bigint; texto: string; rojo?: boolean }) {
  return (
    <span className="fuente-medida">
      <svg className="fuente-barra" width="100%" height="10" aria-hidden="true" focusable="false">
        <rect className="fuente-riel" x="0" y="0" width="100%" height="10" rx="5" />
        <rect className={rojo ? "fuente-valor fuente-valor-alto" : "fuente-valor"} x="0" y="0" width={`${porcentajeDeBarra(valor, maximo)}%`} height="10" rx="5" />
      </svg>
      <strong className="numero">{texto}</strong>
    </span>
  );
}

function TablaDeFuentes({ r }: { r: ReporteDeFuentes }) {
  const maxLeads = maximoDe(r.filas.map((f) => BigInt(f.leads)));
  const costos = r.filas.flatMap((f) => (f.costo_por_alumno !== null ? [aCentavos(f.costo_por_alumno)] : []));
  const maxCosto = maximoDe(costos);
  const mejorConversion = r.filas.reduce((m, f) => Math.max(m, decimasDe(f.conversion) ?? 0), 0);
  const costosDistintos = new Set(costos.map(String)).size > 1;
  return (
    <div className="tabla-scroll tabla-apilada tabla-fuentes">
      <table className="tabla" data-prueba="tabla-de-fuentes">
        <caption className="solo-lectores">Fuentes y campañas</caption>
        <thead>
          <tr>
            <th>Fuente y campaña</th>
            <th>Leads</th>
            <th className="derecha">Inscritos</th>
            <th className="derecha">Conversión</th>
            {r.incluye_gasto ? (
              <>
                <th className="derecha">Gasto</th>
                <th>Costo por alumno inscrito</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {r.filas.map((f: FilaDeFuente) => {
            const conv = decimasDe(f.conversion);
            const gasto = f.gasto !== null ? aCentavos(f.gasto) : 0n;
            const costo = f.costo_por_alumno !== null ? aCentavos(f.costo_por_alumno) : null;
            return (
              <tr key={f.clave} data-prueba={`fuente-${f.clave}`}>
                <td className="celda-titulo">
                  <span className="fuente-nombre">{nombreDeFuente(f.fuente)}</span>
                  <span className="fuente-campana">{f.campana?.nombre ?? "Sin campaña"}</span>
                </td>
                <td data-etiqueta="Leads">
                  <BarraConCifra valor={BigInt(f.leads)} maximo={maxLeads} texto={String(f.leads)} />
                </td>
                <td className="derecha numero" data-etiqueta="Inscritos">
                  {f.inscritos}
                </td>
                <td className="derecha" data-etiqueta="Conversión">
                  {f.conversion === null ? (
                    "—"
                  ) : (
                    <Insignia tono={conv !== null && conv > 0 && conv === mejorConversion ? "exito" : "neutro"}>{redondeado(f.conversion)} %</Insignia>
                  )}
                </td>
                {r.incluye_gasto ? (
                  <>
                    <td className="derecha numero" data-etiqueta="Gasto">
                      {gasto > 0n ? formatear(f.gasto) : "Sin gasto"}
                    </td>
                    <td data-etiqueta="Costo por alumno inscrito">
                      {costo !== null ? (
                        <span className="fuente-costo">
                          <BarraConCifra valor={costo} maximo={maxCosto} texto={formatear(f.costo_por_alumno)} rojo={costosDistintos && costo === maxCosto} />
                          {f.es_mas_barato ? <Insignia tono="exito">Lo más barato</Insignia> : null}
                        </span>
                      ) : (
                        <span className="fuente-sin-costo">{gasto > 0n ? "Sin inscritos" : "Sin costo"}</span>
                      )}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Indicadores({ r }: { r: ReporteDeFuentes }) {
  const t = r.total;
  if (!r.incluye_gasto) {
    return (
      <div className="indicadores" data-prueba="indicadores-fuentes">
        <Indicador etiqueta="Leads" valor={t.leads} prueba="fuentes-ind-leads" />
        <Indicador etiqueta="Inscritos" valor={t.inscritos} prueba="fuentes-ind-inscritos" />
        <Indicador principal etiqueta="Conversión" valor={t.conversion === null ? "—" : `${t.conversion} %`} nota="de lead a alumno inscrito" prueba="fuentes-ind-conversion" />
      </div>
    );
  }
  return (
    <div className="indicadores" data-prueba="indicadores-fuentes">
      <Indicador etiqueta="Gasto en campañas" valor={formatear(t.gasto)} nota="capturado en el costo por campaña, abajo" prueba="fuentes-ind-gasto" />
      <Indicador principal etiqueta="Costo por alumno inscrito" valor={formatear(t.costo_por_alumno)} nota="solo lo que vino de campañas con gasto" prueba="fuentes-ind-costo" />
      <Indicador etiqueta="Inscritos del período" valor={t.inscritos} nota={t.inscritos_sin_costo !== null && t.inscritos_sin_costo > 0 ? `${t.inscritos_sin_costo} sin costo (referidos, QR y página)` : undefined} prueba="fuentes-ind-inscritos" />
    </div>
  );
}

export function SeccionFuentes({ carga, rangoInvertido, desde, hasta, conFiltro, puedeCostos }: { carga: Carga<ReporteDeFuentes>; rangoInvertido: boolean; desde: string; hasta: string; conFiltro: boolean; puedeCostos: boolean }) {
  const frase = carga.datos ? fraseDeFuentes(carga.datos, nombreDeFuente) : null;
  return (
    <SeccionNumerada id="fuentes" numero="02" titulo="¿Qué fuente trae alumnos y a qué costo?" {...(frase ? { descripcion: frase } : {})}>
      <CargaDeSeccion carga={carga} rangoInvertido={rangoInvertido}>
        {(r) =>
          r.filas.length === 0 ? (
            <Vacio titulo="No llegó ningún lead en este rango.">Amplía el rango de fechas o quita el filtro de sucursal o de disciplina.</Vacio>
          ) : (
            <>
              <Indicadores r={r} />
              <TablaDeFuentes r={r} />
              {r.incluye_gasto && conFiltro ? (
                <Aviso tono="info">
                  <span data-prueba="aviso-gasto-aproximado">
                    Con un filtro de sucursal o de disciplina el gasto es una aproximación: el gasto se captura por campaña, así que aquí se reparte según la proporción de leads de cada campaña que cumple el filtro.
                  </span>
                </Aviso>
              ) : null}
              <p className="muted">«Conversión» es de leads que llegaron en el rango a alumnos inscritos hoy (incluye a quienes se marcaron a mano como inscritos). «Lo más barato» es la campaña con el menor costo por alumno inscrito.</p>
            </>
          )
        }
      </CargaDeSeccion>
      {puedeCostos && !rangoInvertido ? (
        <div className="fuentes-costo" data-prueba="costo-por-campana">
          <h3>Gasto y costo por campaña</h3>
          <CostoPorCampana desde={desde} hasta={hasta} alCambiar={carga.recargar} />
        </div>
      ) : null}
    </SeccionNumerada>
  );
}
