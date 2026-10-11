// Sección 06 «Ingreso recurrente y cartera vencida»: a la izquierda la serie de 12 meses del ingreso mensual recurrente (área y línea de SVG propio, sin librerías) y a la derecha la
// cartera vencida por antigüedad en una barra apilada con la cifra y las familias de cada tramo. TEXTO PRIMERO: la gráfica es un adorno (`aria-hidden`); las cifras de cada mes están
// en una tabla desplegable y cada tramo escribe su monto. «Ver las familias con atraso» lleva a la lista de familias (hoy no hay un filtro por atraso: ver la bitácora de R3b).

import { Link } from "react-router-dom";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import {
  ALTO_DEL_AREA,
  ANCHO_DEL_AREA,
  cambioPorcentual,
  fraseDeIngreso,
  geometriaDeArea,
  hayCartera,
  nombreDeMes,
  pesos,
  pesosEnteros,
  puntosDeIngreso,
  textoDeCambio,
  tramosDeCartera,
} from "./graficas-b.ts";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import type { PropsDeSeccionConDatos } from "./contrato-secciones.ts";

function IngresoRecurrente({ meses }: { meses: PropsDeSeccionConDatos["evolucion"]["meses"] }) {
  const puntos = puntosDeIngreso(meses);
  const geo = geometriaDeArea(puntos.map((p) => p.valor));
  const ultimo = meses.at(-1);
  const previo = meses.at(-2);
  const cambio = ultimo && previo ? cambioPorcentual(ultimo.ingreso_mensual_recurrente, previo.ingreso_mensual_recurrente) : null;
  const tono = cambio === null ? "neutro" : cambio.startsWith("-") ? "baja" : cambio === "0.0" ? "neutro" : "sube";
  const primero = puntos[0];
  const final = puntos.at(-1);
  return (
    <figure className="panel-b panel-b-ingreso" data-prueba="grafica-ingreso-recurrente">
      <figcaption className="panel-b-cabeza panel-b-cabeza-cifra">
        <span className="panel-b-titulo">Ingreso mensual recurrente</span>
        {final ? (
          <span className="ingreso-cifra">
            <span className="ingreso-valor numero">{final.texto}</span>
            {cambio !== null && previo ? (
              <span className={`ingreso-cambio ingreso-cambio-${tono}`}>
                {textoDeCambio(cambio)} vs {nombreDeMes(previo.mes)}
              </span>
            ) : null}
          </span>
        ) : null}
      </figcaption>
      {geo && primero && final ? (
        <>
          <p className="solo-lectores">
            De {primero.largo} a {final.largo}, el ingreso mensual recurrente pasó de {primero.texto} a {final.texto}.
          </p>
          <div className="area">
            <svg className="area-svg" viewBox={`0 0 ${ANCHO_DEL_AREA} ${ALTO_DEL_AREA}`} preserveAspectRatio="none" width="100%" height={ALTO_DEL_AREA} aria-hidden="true" focusable="false">
              <line className="area-base" x1="0" y1="180" x2={ANCHO_DEL_AREA} y2="180" />
              <path className="area-relleno" d={geo.area} />
              <polyline className="area-linea" points={geo.linea} />
              <path className="area-halo" d={`M${geo.ultimo.x},${geo.ultimo.y}h0`} />
              <path className="area-punto" d={`M${geo.ultimo.x},${geo.ultimo.y}h0`} />
            </svg>
            <span className="area-eje area-eje-alto" aria-hidden="true">
              {pesosEnteros(geo.eje.maximo)}
            </span>
            <span className="area-eje area-eje-bajo" aria-hidden="true">
              {pesosEnteros(geo.eje.minimo)}
            </span>
          </div>
          <ol className="area-meses" aria-hidden="true">
            {puntos.map((p, i) => (
              <li key={p.mes} className={i === puntos.length - 1 ? "area-mes-actual" : ""}>
                {p.corto}
              </li>
            ))}
          </ol>
          <details className="area-cifras">
            <summary>Ver la cifra de cada mes</summary>
            <table className="tabla-cifras">
              <caption className="solo-lectores">Ingreso mensual recurrente de los últimos {puntos.length} meses</caption>
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  <th scope="col" className="tabla-cifras-derecha">
                    Ingreso
                  </th>
                </tr>
              </thead>
              <tbody>
                {puntos.map((p) => (
                  <tr key={p.mes}>
                    <th scope="row">{p.largo}</th>
                    <td className="tabla-cifras-derecha numero">{p.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="muted">Todavía no hay meses con ingreso que dibujar.</p>
      )}
    </figure>
  );
}

function CarteraVencida({ cartera }: { cartera: PropsDeSeccionConDatos["ejecutivo"]["cartera_vencida"] }) {
  const { puede, moduloEncendido } = useSesion();
  const tramos = tramosDeCartera(cartera);
  const hay = hayCartera(cartera);
  const puedeVerFamilias = puede("tutores:leer") && moduloEncendido("inscripcion");
  return (
    <figure className="panel-b panel-b-cartera" data-prueba="grafica-cartera-vencida">
      <figcaption className="panel-b-cabeza panel-b-cabeza-columna">
        <span className="panel-b-titulo">Cartera vencida</span>
        <span className="cartera-total numero" data-prueba="cartera-total">
          {pesos(cartera.total)}
        </span>
        <span className="panel-b-nota">{hay ? `Antigüedad de lo vencido · ${cartera.familias === 1 ? "1 familia" : `${cartera.familias} familias`} con atraso` : "Antigüedad de lo vencido"}</span>
      </figcaption>
      {hay ? (
        <>
          <svg className="cartera-barra" width="100%" height="18" aria-hidden="true" focusable="false">
            {tramos
              .filter((t) => aCentavos(t.monto) > 0n)
              .map((t) => (
                <rect key={t.clave} className={`cartera-tramo cartera-tramo-${t.nivel}`} x={`${t.x}%`} y="0" width={`${t.ancho}%`} height="18" />
              ))}
          </svg>
          <ul className="cartera-lista" aria-label="Cartera vencida por antigüedad">
            {tramos.map((t) => (
              <li key={t.clave} data-prueba={`cartera-${t.clave}`}>
                <span className={`cartera-marca cartera-tramo-${t.nivel}`} aria-hidden="true" />
                <span className="cartera-nombre">
                  {t.nombre} <span className="muted">· {t.textoFamilias}</span>
                </span>
                <strong className="numero">{t.texto}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="cartera-sin" data-prueba="cartera-sin-atraso">
          <Icono nombre="exito" tamano={18} /> Nadie tiene saldo vencido: {formatear(cartera.total)}.
        </p>
      )}
      {hay && puedeVerFamilias ? (
        <Link className="boton cartera-accion" to="/familias">
          Ver las familias con atraso
        </Link>
      ) : null}
    </figure>
  );
}

export function SeccionIngreso({ evolucion, ejecutivo }: PropsDeSeccionConDatos) {
  return (
    <SeccionNumerada id="ingreso" numero="06" titulo="Ingreso recurrente y cartera vencida" descripcion={fraseDeIngreso(evolucion.meses, ejecutivo.cartera_vencida)}>
      <div className="seccion-b-fila">
        <IngresoRecurrente meses={evolucion.meses} />
        <CarteraVencida cartera={ejecutivo.cartera_vencida} />
      </div>
    </SeccionNumerada>
  );
}
