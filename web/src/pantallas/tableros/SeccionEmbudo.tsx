// 01 Embudo de conversión: las etapas de la escuela (con su nombre, el de la tabla) con cuántos leads de la cohorte llegaron a cada una, la caída entre una y otra (la mayor, resaltada con
// texto además de color) y «Por qué se pierden». TEXTO PRIMERO: cada fila escribe su cifra; las barras son un adorno (`aria-hidden`) y el ancho va por atributos SVG, no por estilos.

import type { EtapaDelEmbudo, ReporteDeEmbudo } from "../../api/tipos.ts";
import { cantidad } from "../../lib/cantidad.ts";
import { Vacio } from "../../ui/basicos.tsx";
import type { Carga } from "../../ui/hooks.ts";
import { Icono } from "../../ui/Icono.tsx";
import { enteroDeTexto } from "../../ui/numeros.ts";
import { CargaDeSeccion } from "./CargaDeSeccion.tsx";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import { maximoDe, porcentajeDeBarra, redondeado } from "./graficas.ts";
import { fraseDelEmbudo } from "./narrativa.ts";

/** El ancho mínimo (en %) de la barra de una etapa con gente, para que su cifra se lea dentro. */
const ANCHO_MINIMO = 8;

/** «12 no avanzaron (14.2 %)», con « · la mayor caída» si lo es. */
export function textoDeCaida(e: Pick<EtapaDelEmbudo, "caida" | "caida_porcentaje" | "es_mayor_caida">): string {
  const base = `${e.caida} ${e.caida === 1 ? "no avanzó" : "no avanzaron"}${e.caida_porcentaje !== null ? ` (${e.caida_porcentaje} %)` : ""}`;
  return e.es_mayor_caida ? `${base} · la mayor caída` : base;
}

function anchoDeEtapa(alcanzaron: number, llegaron: number): string {
  if (alcanzaron <= 0 || llegaron <= 0) return "0";
  const exacto = porcentajeDeBarra(BigInt(alcanzaron), BigInt(llegaron));
  return enteroDeTexto(exacto) < ANCHO_MINIMO ? `${ANCHO_MINIMO}` : exacto;
}

function EtapaDelEmbudoFila({ e, llegaron, primera }: { e: EtapaDelEmbudo; llegaron: number; primera: boolean }) {
  const ancho = anchoDeEtapa(e.alcanzaron, llegaron);
  const pct = redondeado(e.porcentaje);
  return (
    <li className="embudo-etapa" data-prueba={`embudo-etapa-${e.etapa.id}`}>
      {!primera ? (
        <div className="embudo-fila embudo-fila-caida">
          <span />
          <span className={`embudo-caida${e.es_mayor_caida ? " embudo-caida-mayor" : ""}`} data-prueba={e.es_mayor_caida ? "embudo-mayor-caida" : undefined}>
            <Icono nombre="flecha_abajo" tamano={14} />
            {textoDeCaida(e)}
          </span>
          <span />
        </div>
      ) : null}
      <div className="embudo-fila">
        <span className="embudo-nombre">{e.etapa.nombre}</span>
        <svg className="embudo-barra" width="100%" height="36" aria-hidden="true" focusable="false">
          <rect className="embudo-riel" x="0" y="0" width="100%" height="36" rx="8" />
          {ancho !== "0" ? (
            <svg x="0" y="0" width={`${ancho}%`} height="36">
              <rect className={e.etapa.es_ganado ? "embudo-valor embudo-valor-ganado" : "embudo-valor"} x="0" y="0" width="100%" height="36" rx="8" />
              <text className="embudo-cifra" x="100%" dx="-10" y="18" textAnchor="end" dominantBaseline="central">
                {e.alcanzaron}
              </text>
            </svg>
          ) : (
            <text className="embudo-cifra embudo-cifra-cero" x="10" y="18" dominantBaseline="central">
              0
            </text>
          )}
        </svg>
        <span className="embudo-pct numero">{pct === null ? "—" : `${pct} %`}</span>
        <span className="solo-lectores">{cantidad(e.alcanzaron, "familia llegó", "familias llegaron")}</span>
      </div>
    </li>
  );
}

function Motivos({ embudo }: { embudo: ReporteDeEmbudo }) {
  const motivos = embudo.perdidos.por_motivo;
  const maximo = maximoDe(motivos.map((m) => BigInt(m.leads)));
  return (
    <figure className="tablero-tarjeta motivos-figura" data-prueba="grafica-por-que-se-pierden">
      <figcaption className="tablero-tarjeta-cabeza">
        <span className="tablero-tarjeta-titulo">Por qué se pierden</span>
        <span className="tablero-tarjeta-nota">{cantidad(embudo.perdidos.total, "lead perdido", "leads perdidos")}</span>
      </figcaption>
      {motivos.length === 0 ? (
        <p className="muted">Ninguno de estos leads se ha perdido.</p>
      ) : (
        <ul className="motivos">
          {motivos.map((m) => (
            <li key={m.motivo?.id ?? "sin-motivo"}>
              <div className="motivo-texto">
                <span className="motivo-nombre">{m.motivo?.nombre ?? "Sin motivo"}</span>
                <strong className="numero">{m.leads}</strong>
              </div>
              <svg className="motivo-barra" width="100%" height="10" aria-hidden="true" focusable="false">
                <rect className="motivo-riel" x="0" y="0" width="100%" height="10" rx="5" />
                <rect className="motivo-valor" x="0" y="0" width={`${porcentajeDeBarra(BigInt(m.leads), maximo)}%`} height="10" rx="5" />
              </svg>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export function SeccionEmbudo({ carga, rangoInvertido, rango }: { carga: Carga<ReporteDeEmbudo>; rangoInvertido: boolean; rango: string }) {
  const frase = carga.datos ? fraseDelEmbudo(carga.datos) : null;
  return (
    <SeccionNumerada id="embudo" numero="01" titulo="¿Dónde se caen los leads?" {...(frase ? { descripcion: frase } : {})}>
      <CargaDeSeccion carga={carga} rangoInvertido={rangoInvertido}>
        {(e) =>
          e.llegaron === 0 ? (
            <Vacio titulo="Ningún lead llegó en este rango.">Amplía el rango de fechas o quita el filtro de sucursal o de disciplina.</Vacio>
          ) : (
            <div className="embudo-cuerpo">
              <figure className="tablero-tarjeta embudo-figura" data-prueba="grafica-embudo">
                <figcaption className="tablero-tarjeta-cabeza">
                  <span className="tablero-tarjeta-titulo">Del primer mensaje a la inscripción</span>
                  <span className="tablero-tarjeta-nota">Leads que llegaron {rango}</span>
                </figcaption>
                <ol className="embudo-etapas">
                  {e.etapas.map((et, i) => (
                    <EtapaDelEmbudoFila key={et.etapa.id} e={et} llegaron={e.llegaron} primera={i === 0} />
                  ))}
                </ol>
              </figure>
              <Motivos embudo={e} />
            </div>
          )
        }
      </CargaDeSeccion>
    </SeccionNumerada>
  );
}
