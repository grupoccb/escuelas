// 03 Clases muestra por disciplina: de cada disciplina, cuántas de las clases que ya pasaron llegaron a su clase y cuántas de ellas se inscribieron (asistencia y cierre), con tres barras
// (agendadas, asistieron, se inscribieron). El color sale del dato de la disciplina (`color_marca`) y nunca es la única señal: cada barra escribe su cifra. Conserva los totales, la descarga
// de CSV y el desglose por fuente y por sucursal que ya tenía este tablero.

import type { ReactNode } from "react";
import { armarConsulta } from "../../api/cliente.ts";
import { Vacio } from "../../ui/basicos.tsx";
import { ConDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import type { Carga } from "../../ui/hooks.ts";
import { FUENTES } from "../asesor/fuentes.ts";
import { Barras, Indicador } from "./Barras.tsx";
import { CargaDeSeccion } from "./CargaDeSeccion.tsx";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import { porcentajeDeBarra, type FilaDeBarra } from "./graficas.ts";
import { asistenciaDeClases, cierreDeClases, fraseDeClases } from "./narrativa.ts";
import type { FilaDeClases, ReporteDeClases } from "./tipos.ts";

const LEYENDA = { valor: "Asistidas", fondo: "Agendadas" };

const aBarra = (f: FilaDeClases, nombre: string): FilaDeBarra => ({
  clave: f.clave,
  etiqueta: nombre,
  valor: BigInt(f.asistidas),
  fondo: BigInt(f.agendadas),
  texto: `${f.asistidas} de ${f.agendadas}`,
  nota: `Conversión ${f.conversion === null ? "—" : `${f.conversion} %`} · inscritas ${f.inscritas} · no asistieron ${f.no_asistidas}`,
});

const porcentaje = (p: string | null): string => (p === null ? "—" : `${p} %`);

/** Una barra de la tarjeta: su nombre, su forma (lleno, medio o contorno) y su cifra escrita. */
function BarraDeClase({ nombre, valor, agendadas, forma }: { nombre: string; valor: number; agendadas: number; forma: "agendadas" | "asistieron" | "inscritas" }) {
  return (
    <div className="clasemu-barra">
      <span className="clasemu-barra-nombre">{nombre}</span>
      <svg className="clasemu-barra-svg" width="100%" height="14" aria-hidden="true" focusable="false">
        <rect className="clasemu-riel" x="0" y="0" width="100%" height="14" rx="7" />
        <rect className={`clasemu-valor clasemu-valor-${forma}`} x="0" y="0.75" width={`${porcentajeDeBarra(BigInt(valor), BigInt(agendadas))}%`} height="12.5" rx="6" />
      </svg>
      <strong className="numero">{valor}</strong>
    </div>
  );
}

function TarjetaDeDisciplina({ f, color }: { f: FilaDeClases; color: string | null }) {
  const asistencia = asistenciaDeClases(f);
  const cierre = cierreDeClases(f);
  return (
    <ConDisciplina color={color} as="figure" className="clasemu-tarjeta" >
      <div className="clasemu-banda" aria-hidden="true" />
      <div className="clasemu-cuerpo" data-prueba={`clases-${f.clave}`}>
        <figcaption className="clasemu-titulo">
          <span className="clasemu-nombre">{f.nombre}</span>
          <span className="clasemu-agendadas">{f.agendadas} agendadas</span>
        </figcaption>
        <div className="clasemu-cifras">
          <div>
            <span className="clasemu-cifra numero">{asistencia === null ? "—" : `${asistencia} %`}</span>
            <span className="clasemu-cifra-nombre">llegaron a su clase</span>
          </div>
          <div>
            <span className="clasemu-cifra numero">{cierre === null ? "—" : `${cierre} %`}</span>
            <span className="clasemu-cifra-nombre">de ellos se inscribió</span>
          </div>
        </div>
        <div className="clasemu-barras">
          <BarraDeClase nombre="Agendadas" valor={f.agendadas} agendadas={f.agendadas} forma="agendadas" />
          <BarraDeClase nombre="Asistieron" valor={f.asistidas} agendadas={f.agendadas} forma="asistieron" />
          <BarraDeClase nombre="Se inscribieron" valor={f.inscritas} agendadas={f.agendadas} forma="inscritas" />
        </div>
      </div>
    </ConDisciplina>
  );
}

function Detalle({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="detalle-tablero" data-prueba="clases-por-fuente-y-sucursal">
      <summary>{titulo}</summary>
      <div className="detalle-tablero-cuerpo">{children}</div>
    </details>
  );
}

export function SeccionClases({ carga, rangoInvertido, desde, hasta, sucursalId, verticalId, colorDeVertical }: { carga: Carga<ReporteDeClases>; rangoInvertido: boolean; desde: string; hasta: string; sucursalId: string; verticalId: string; colorDeVertical: (verticalId: string) => string | null }) {
  const frase = carga.datos && carga.datos.total.agendadas > 0 ? fraseDeClases(carga.datos.total, carga.datos.por_vertical) : null;
  const consulta = { desde, hasta, sucursal_id: sucursalId, vertical_id: verticalId };
  const fuente = (f: FilaDeClases): string => FUENTES[f.clave] ?? f.nombre;
  return (
    <SeccionNumerada id="clases" numero="03" titulo="Clases muestra: quién llega y quién se queda" {...(frase ? { descripcion: frase } : {})}>
      <CargaDeSeccion carga={carga} rangoInvertido={rangoInvertido}>
        {(r) => (
          <>
            <div className="clasemu-acciones">
              <a className="boton" href={`/api/reportes/clases-muestra${armarConsulta({ ...consulta, formato: "csv" })}`} download data-prueba="descargar-clases">
                <Icono nombre="descargar" tamano={18} />
                Descargar CSV
              </a>
            </div>
            <div className="indicadores indicadores-tablero" data-prueba="indicadores-clases">
              <Indicador etiqueta="Agendadas" valor={r.total.agendadas} prueba="ind-agendadas" />
              <Indicador etiqueta="Asistidas" valor={r.total.asistidas} prueba="ind-asistidas" />
              <Indicador etiqueta="No asistidas" valor={r.total.no_asistidas} prueba="ind-no-asistidas" />
              <Indicador etiqueta="Inscritas" valor={r.total.inscritas} nota={r.total.inscritas_a_mano > 0 ? `${r.total.inscritas_a_mano} marcadas a mano` : undefined} prueba="ind-inscritas" />
              <Indicador principal etiqueta="Conversión" valor={porcentaje(r.total.conversion)} nota="de las asistidas, las que hoy tienen inscripción o se marcaron a mano como inscritas" prueba="ind-conversion" />
            </div>
            {r.total.agendadas === 0 ? (
              <Vacio titulo="No hay clases muestra en este rango.">Amplía el rango de fechas o quita el filtro de sucursal o de disciplina.</Vacio>
            ) : (
              <>
                <div className="clasemu-tarjetas" data-prueba="clases-por-disciplina">
                  {r.por_vertical.map((f) => (
                    <TarjetaDeDisciplina key={f.clave} f={f} color={colorDeVertical(f.clave)} />
                  ))}
                </div>
                <Detalle titulo="Ver por fuente y por sucursal">
                  <Barras titulo="Por fuente" filas={r.por_fuente.map((f) => aBarra(f, fuente(f)))} leyenda={LEYENDA} />
                  <Barras titulo="Por sucursal" filas={r.por_sucursal.map((f) => aBarra(f, f.nombre))} leyenda={LEYENDA} />
                </Detalle>
              </>
            )}
            <p className="muted">«Llegaron a su clase» cuenta las clases que ya pasaron (sin las pendientes ni las canceladas). Las agendadas no cuentan las reagendadas; la conversión es de asistidas a inscritas y se muestra «—» si no hubo asistidas.</p>
          </>
        )}
      </CargaDeSeccion>
    </SeccionNumerada>
  );
}
