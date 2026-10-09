// Clases muestra (I1): agendadas, asistidas, no asistidas y conversión (asistidas → inscritas) por fuente, disciplina y sucursal.

import { api, armarConsulta } from "../../api/cliente.ts";
import { Aviso, Cargando, ErrorDeCarga, Tarjeta } from "../../ui/basicos.tsx";
import { useCarga } from "../../ui/hooks.ts";
import { Barras, Indicador } from "./Barras.tsx";
import { Filtros, type ValoresDeFiltro } from "./Filtros.tsx";
import type { FilaDeBarra } from "./graficas.ts";
import type { FilaDeClases, ReporteDeClases } from "./tipos.ts";

const FUENTES: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", google: "Google", referido: "Referido", presencial: "En sucursal (QR)", otro: "Otro", landing: "Página de captación", codigo: "Código de rastreo", anuncio: "Anuncio a WhatsApp", directo: "Directo" };

const aBarra = (f: FilaDeClases, nombre: string): FilaDeBarra => ({
  clave: f.clave,
  etiqueta: nombre,
  valor: BigInt(f.asistidas),
  fondo: BigInt(f.agendadas),
  texto: `${f.asistidas} de ${f.agendadas}`,
  nota: `Conversión ${f.conversion === null ? "—" : `${f.conversion} %`} · inscritas ${f.inscritas} · no asistieron ${f.no_asistidas}`,
});

function Tabla({ filas, nombre }: { filas: FilaDeClases[]; nombre: (f: FilaDeClases) => string }) {
  return (
    <div className="tabla-scroll">
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
              <td>{nombre(f)}</td>
              <td className="derecha numero">{f.agendadas}</td>
              <td className="derecha numero">{f.asistidas}</td>
              <td className="derecha numero">{f.no_asistidas}</td>
              <td className="derecha numero">{f.inscritas}</td>
              <td className="derecha numero">{f.conversion === null ? "—" : `${f.conversion} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <Filtros valores={filtros} alCambiar={alCambiar} />
      <div>
        <a className="boton" href={`/api/reportes/clases-muestra${armarConsulta({ ...consulta, formato: "csv" })}`} download data-prueba="descargar-clases">
          Descargar CSV
        </a>
      </div>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !r ? <Cargando /> : null}
      {r ? (
        <>
          <div className="indicadores" data-prueba="indicadores-clases">
            <Indicador etiqueta="Agendadas" valor={r.total.agendadas} prueba="ind-agendadas" />
            <Indicador etiqueta="Asistidas" valor={r.total.asistidas} prueba="ind-asistidas" />
            <Indicador etiqueta="No asistidas" valor={r.total.no_asistidas} prueba="ind-no-asistidas" />
            <Indicador etiqueta="Inscritas" valor={r.total.inscritas} prueba="ind-inscritas" />
            <Indicador etiqueta="Conversión" valor={r.total.conversion === null ? "—" : `${r.total.conversion} %`} nota="de las asistidas, las que hoy tienen inscripción" prueba="ind-conversion" />
          </div>
          {r.total.agendadas === 0 ? <Aviso>No hay clases muestra en este rango.</Aviso> : null}
          <Tarjeta>
            <Barras titulo="Por fuente" filas={r.por_fuente.map((f) => aBarra(f, fuente(f)))} />
          </Tarjeta>
          <Tarjeta>
            <Barras titulo="Por disciplina" filas={r.por_vertical.map((f) => aBarra(f, f.nombre))} />
          </Tarjeta>
          <Tarjeta>
            <Barras titulo="Por sucursal" filas={r.por_sucursal.map((f) => aBarra(f, f.nombre))} />
          </Tarjeta>
          <Tarjeta titulo="En tabla">
            <Tabla filas={r.por_fuente} nombre={fuente} />
            <Tabla filas={r.por_vertical} nombre={(f) => f.nombre} />
            <Tabla filas={r.por_sucursal} nombre={(f) => f.nombre} />
          </Tarjeta>
          <p className="muted">Cada barra clara es lo agendado y la oscura lo asistido. «Agendadas» no cuenta las reagendadas; la conversión es de asistidas a inscritas y se muestra «—» si no hubo asistidas.</p>
        </>
      ) : null}
    </div>
  );
}
