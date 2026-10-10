// Clases muestra (I1): agendadas, asistidas, no asistidas y conversión (asistidas → inscritas) por fuente, disciplina y sucursal.

import { api, armarConsulta } from "../../api/cliente.ts";
import { Cargando, ErrorDeCarga, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga } from "../../ui/hooks.ts";
import { Barras, Indicador } from "./Barras.tsx";
import { Filtros, type ValoresDeFiltro } from "./Filtros.tsx";
import type { FilaDeBarra } from "./graficas.ts";
import type { FilaDeClases, ReporteDeClases } from "./tipos.ts";

const FUENTES: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", google: "Google", referido: "Referido", presencial: "En sucursal (QR)", otro: "Otro", landing: "Página de captación", codigo: "Código de rastreo", anuncio: "Anuncio a WhatsApp", directo: "Directo" };

const LEYENDA = { valor: "Asistidas", fondo: "Agendadas" };

const aBarra = (f: FilaDeClases, nombre: string): FilaDeBarra => ({
  clave: f.clave,
  etiqueta: nombre,
  valor: BigInt(f.asistidas),
  fondo: BigInt(f.agendadas),
  texto: `${f.asistidas} de ${f.agendadas}`,
  nota: `Conversión ${f.conversion === null ? "—" : `${f.conversion} %`} · inscritas ${f.inscritas} · no asistieron ${f.no_asistidas}`,
});

function Tabla({ titulo, filas, nombre }: { titulo: string; filas: FilaDeClases[]; nombre: (f: FilaDeClases) => string }) {
  return (
    <div className="tabla-grupo">
      <h3>{titulo}</h3>
      <div className="tabla-scroll tabla-apilada">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th className="derecha">Agendadas</th>
              <th className="derecha">Asistidas</th>
              <th className="derecha">No asistidas</th>
              <th className="derecha">Inscritas</th>
              <th className="derecha">Conversión</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave}>
                <td className="celda-titulo">{nombre(f)}</td>
                <td className="derecha numero" data-etiqueta="Agendadas">{f.agendadas}</td>
                <td className="derecha numero" data-etiqueta="Asistidas">{f.asistidas}</td>
                <td className="derecha numero" data-etiqueta="No asistidas">{f.no_asistidas}</td>
                <td className="derecha numero" data-etiqueta="Inscritas">{f.inscritas}</td>
                <td className="derecha numero" data-etiqueta="Conversión">{f.conversion === null ? "—" : `${f.conversion} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ClasesMuestra({ filtros, alCambiar }: { filtros: ValoresDeFiltro; alCambiar: (v: ValoresDeFiltro) => void }) {
  const consulta = { desde: filtros.desde, hasta: filtros.hasta, sucursal_id: filtros.sucursalId, vertical_id: filtros.verticalId };
  const carga = useCarga((senal) => api.get<ReporteDeClases>("/api/reportes/clases-muestra", consulta, senal), [filtros.desde, filtros.hasta, filtros.sucursalId, filtros.verticalId]);
  const r = carga.datos;
  const fuente = (f: FilaDeClases) => FUENTES[f.clave] ?? f.nombre;
  return (
    <div className="pila" data-prueba="tablero-clases-muestra">
      <Filtros
        valores={filtros}
        alCambiar={alCambiar}
        acciones={
          <a className="boton" href={`/api/reportes/clases-muestra${armarConsulta({ ...consulta, formato: "csv" })}`} download data-prueba="descargar-clases">
            <Icono nombre="descargar" tamano={18} />
            Descargar CSV
          </a>
        }
      />
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !r ? <Cargando /> : null}
      {r ? (
        <>
          <div className="indicadores indicadores-tablero" data-prueba="indicadores-clases">
            <Indicador etiqueta="Agendadas" valor={r.total.agendadas} prueba="ind-agendadas" />
            <Indicador etiqueta="Asistidas" valor={r.total.asistidas} prueba="ind-asistidas" />
            <Indicador etiqueta="No asistidas" valor={r.total.no_asistidas} prueba="ind-no-asistidas" />
            <Indicador etiqueta="Inscritas" valor={r.total.inscritas} nota={r.total.inscritas_a_mano > 0 ? `${r.total.inscritas_a_mano} marcadas a mano` : undefined} prueba="ind-inscritas" />
            <Indicador principal etiqueta="Conversión" valor={r.total.conversion === null ? "—" : `${r.total.conversion} %`} nota="de las asistidas, las que hoy tienen inscripción o se marcaron a mano como inscritas" prueba="ind-conversion" />
          </div>
          {r.total.agendadas === 0 ? (
            <Vacio titulo="No hay clases muestra en este rango.">Amplía el rango de fechas o quita el filtro de sucursal o de disciplina.</Vacio>
          ) : (
            <>
              <Tarjeta>
                <Barras titulo="Por fuente" filas={r.por_fuente.map((f) => aBarra(f, fuente(f)))} leyenda={LEYENDA} />
              </Tarjeta>
              <Tarjeta>
                <Barras titulo="Por disciplina" filas={r.por_vertical.map((f) => aBarra(f, f.nombre))} leyenda={LEYENDA} />
              </Tarjeta>
              <Tarjeta>
                <Barras titulo="Por sucursal" filas={r.por_sucursal.map((f) => aBarra(f, f.nombre))} leyenda={LEYENDA} />
              </Tarjeta>
              <Tarjeta titulo="En tabla">
                <Tabla titulo="Por fuente" filas={r.por_fuente} nombre={fuente} />
                <Tabla titulo="Por disciplina" filas={r.por_vertical} nombre={(f) => f.nombre} />
                <Tabla titulo="Por sucursal" filas={r.por_sucursal} nombre={(f) => f.nombre} />
              </Tarjeta>
            </>
          )}
          <p className="muted">Cada barra clara es lo agendado y la oscura lo asistido. «Agendadas» no cuenta las reagendadas; la conversión es de asistidas a inscritas y se muestra «—» si no hubo asistidas.</p>
        </>
      ) : null}
    </div>
  );
}
