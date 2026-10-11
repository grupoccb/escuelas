// Tableros: una sola página narrativa (R3). Carga UNA vez la evolución de 12 meses y el reporte ejecutivo (con el mes y los filtros de sucursal y disciplina) y los reparte; el embudo,
// las fuentes y las clases muestra piden su propio reporte (llevan el rango de fechas de captación). Arriba, un héroe oscuro y pestañas fijas que saltan a cada sección. Cada sección
// se muestra según el permiso de quien la ve: ejecutivo (administrador y asesor), costos (solo administrador) y clases muestra.
//
// Secciones: 01 embudo, 02 fuentes y campañas, 03 clases muestra y 04 altas y bajas (R3b-A); 05 retención, 06 ingreso y cartera, 07 mapa de calor y 08 comparativo (R3b-B).

import { useCallback, useState, type ReactNode } from "react";
import { api, armarConsulta, type ErrorDeApi } from "../../api/cliente.ts";
import type { EjecutivoDelTablero, ReporteDeEmbudo, ReporteDeEvolucion, ReporteDeFuentes } from "../../api/tipos.ts";
import { hoyLocal } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Cargando, ErrorDeCarga, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import type { SucursalAdmin, Vertical } from "../admin/tipos.ts";
import { rangoInvertido, type ValoresDeFiltro } from "./Filtros.tsx";
import { FiltrosDelTablero } from "./FiltrosDelTablero.tsx";
import { Heroe } from "./Heroe.tsx";
import { NavegacionDeSecciones } from "./NavegacionDeSecciones.tsx";
import { SeccionAltasYBajas } from "./SeccionAltasYBajas.tsx";
import { SeccionClases } from "./SeccionClases.tsx";
import { SeccionComparativo } from "./SeccionComparativo.tsx";
import { SeccionEmbudo } from "./SeccionEmbudo.tsx";
import { SeccionFuentes } from "./SeccionFuentes.tsx";
import { SeccionIngreso } from "./SeccionIngreso.tsx";
import { SeccionMapaDeCalor } from "./SeccionMapaDeCalor.tsx";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import { SeccionRetencion } from "./SeccionRetencion.tsx";
import type { PropsDeSeccionConDatos } from "./contrato-secciones.ts";
import { rangoDeCaptacion, textoDelRango } from "./graficas.ts";
import { SECCIONES, seccionesVisibles, type SeccionDelTablero } from "./secciones.ts";
import type { ReporteDeClases } from "./tipos.ts";

const SIN_FILTROS: ValoresDeFiltro = { desde: "", hasta: "", sucursalId: "", verticalId: "" };

/** Lo que se ve en el lugar de una sección que espera datos de la página (la evolución o el ejecutivo): cargando o el error con «Reintentar». */
function EsperaDeSeccion({ seccion, error, alReintentar }: { seccion: SeccionDelTablero; error: ErrorDeApi | null; alReintentar: () => void }) {
  return (
    <SeccionNumerada id={seccion.id} numero={seccion.numero ?? ""} titulo={seccion.titulo}>
      {error ? <ErrorDeCarga error={error} alReintentar={alReintentar} /> : <Cargando />}
    </SeccionNumerada>
  );
}

export default function Tableros() {
  useTitulo("Tableros");
  const { puede } = useSesion();
  const verEjecutivo = puede("reportes:ejecutivo");
  const verClases = puede("reportes:clases_muestra");
  const verCostos = puede("reportes:costos");
  const visibles = seccionesVisibles(puede);

  const [filtros, setFiltros] = useState<ValoresDeFiltro>(SIN_FILTROS);
  const [mes, setMes] = useState(hoyLocal().slice(0, 7));
  const invertido = rangoInvertido(filtros);
  const rango = rangoDeCaptacion(mes, filtros.desde, filtros.hasta);
  const filtroDeAlcance = { sucursal_id: filtros.sucursalId, vertical_id: filtros.verticalId };
  const conFiltro = filtros.sucursalId !== "" || filtros.verticalId !== "";

  const sucursales = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), []);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal), []);
  const colorDeVertical = useCallback((id: string): string | null => verticales.datos?.datos.find((v) => v.id === id)?.color_marca ?? null, [verticales.datos]);

  // Se piden una sola vez y se reparten: el héroe y las secciones 04 a 08 salen de estas dos.
  const evolucion = useCarga((senal) => api.get<ReporteDeEvolucion>("/api/reportes/evolucion", { mes, ...filtroDeAlcance }, senal), [mes, filtros.sucursalId, filtros.verticalId], verEjecutivo);
  const ejecutivo = useCarga((senal) => api.get<EjecutivoDelTablero>("/api/reportes/ejecutivo", { mes, ...filtroDeAlcance }, senal), [mes, filtros.sucursalId, filtros.verticalId], verEjecutivo);
  // Captación: la cohorte de leads del rango (el mes elegido o las fechas escritas).
  const rangoDeCaptacionDeps = [rango.desde, rango.hasta, filtros.sucursalId, filtros.verticalId];
  const embudo = useCarga((senal) => api.get<ReporteDeEmbudo>("/api/reportes/embudo", { desde: rango.desde, hasta: rango.hasta, ...filtroDeAlcance }, senal), rangoDeCaptacionDeps, verEjecutivo && !invertido);
  const fuentes = useCarga((senal) => api.get<ReporteDeFuentes>("/api/reportes/fuentes", { desde: rango.desde, hasta: rango.hasta, ...filtroDeAlcance }, senal), rangoDeCaptacionDeps, verEjecutivo && !invertido);
  const clases = useCarga((senal) => api.get<ReporteDeClases>("/api/reportes/clases-muestra", { desde: rango.desde, hasta: rango.hasta, ...filtroDeAlcance }, senal), rangoDeCaptacionDeps, verClases && !invertido);

  const alcance = [verticales.datos?.datos.find((v) => v.id === filtros.verticalId)?.nombre ?? "Todas las disciplinas", sucursales.datos?.datos.find((s) => s.id === filtros.sucursalId)?.nombre ?? "todas las sucursales"].join(" · ");
  const csv = (seccion: string): string => `/api/reportes/ejecutivo${armarConsulta({ mes, ...filtroDeAlcance, formato: "csv", seccion })}`;
  const reintentarBase = (): void => {
    evolucion.recargar();
    ejecutivo.recargar();
  };

  const acciones = verEjecutivo ? (
    <div className="tablero-acciones">
      <CampoTexto etiqueta="Mes" type="month" max={hoyLocal().slice(0, 7)} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
      <a className="boton" href={csv("resumen")} download data-prueba="descargar-ejecutivo">
        <Icono nombre="descargar" tamano={18} />
        Descargar resumen (CSV)
      </a>
      <details className="menu-descargas">
        <summary>Más descargas</summary>
        <div className="menu-descargas-lista">
          <a className="boton" href={csv("activos")} download>
            <Icono nombre="descargar" tamano={18} />
            Activos por disciplina (CSV)
          </a>
          <a className="boton" href={csv("ocupacion")} download>
            <Icono nombre="descargar" tamano={18} />
            Ocupación por grupo (CSV)
          </a>
        </div>
      </details>
    </div>
  ) : undefined;

  const comunes = evolucion.datos && ejecutivo.datos ? ({ filtros, evolucion: evolucion.datos, ejecutivo: ejecutivo.datos, colorDeVertical } satisfies PropsDeSeccionConDatos) : null;
  const espera = (id: string, soloEvolucion = false): ReactNode => {
    const seccion = SECCIONES.find((s) => s.id === id)!;
    return <EsperaDeSeccion seccion={seccion} error={soloEvolucion ? evolucion.error : (evolucion.error ?? ejecutivo.error)} alReintentar={reintentarBase} />;
  };

  const contenido = (id: string): ReactNode => {
    switch (id) {
      case "resumen":
        return <Heroe mes={mes} alcance={alcance} evolucion={evolucion} ejecutivo={ejecutivo} embudo={embudo} />;
      case "embudo":
        return <SeccionEmbudo carga={embudo} rangoInvertido={invertido} rango={textoDelRango(mes, rango)} />;
      case "fuentes":
        return <SeccionFuentes carga={fuentes} rangoInvertido={invertido} desde={rango.desde} hasta={rango.hasta} conFiltro={conFiltro} puedeCostos={verCostos} />;
      case "clases":
        return <SeccionClases carga={clases} rangoInvertido={invertido} desde={rango.desde} hasta={rango.hasta} sucursalId={filtros.sucursalId} verticalId={filtros.verticalId} colorDeVertical={colorDeVertical} />;
      case "altas-y-bajas":
        return evolucion.datos ? <SeccionAltasYBajas evolucion={evolucion.datos} /> : espera(id, true);
      case "retencion":
        return comunes ? <SeccionRetencion {...comunes} /> : espera(id);
      case "ingreso":
        return comunes ? <SeccionIngreso {...comunes} /> : espera(id);
      case "mapa":
        return comunes ? <SeccionMapaDeCalor {...comunes} /> : espera(id);
      case "comparativo":
        return comunes ? <SeccionComparativo {...comunes} /> : espera(id);
      default:
        return null;
    }
  };

  return (
    <Pagina titulo="Tableros" subtitulo="Cómo va la escuela: captación, costo y números del mes." acciones={acciones}>
      <FiltrosDelTablero valores={filtros} alCambiar={setFiltros} sucursales={sucursales.datos?.datos ?? []} disciplinas={verticales.datos?.datos ?? []} conCaptacion={verEjecutivo || verClases} />
      {visibles.length === 0 ? (
        <Vacio titulo="No hay tableros para tu rol.">Pídele a quien administra el sistema que revise tus permisos.</Vacio>
      ) : (
        <>
          <NavegacionDeSecciones secciones={visibles.map((s) => ({ id: s.id, nombre: s.pestana }))} />
          <div className="tablero-secciones" data-prueba="tablero-narrativo">
            {visibles.map((s) => (
              <div key={s.id} className="tablero-seccion" data-seccion={s.id}>
                {contenido(s.id)}
              </div>
            ))}
          </div>
        </>
      )}
    </Pagina>
  );
}
