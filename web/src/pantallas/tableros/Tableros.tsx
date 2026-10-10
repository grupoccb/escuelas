// Tableros: clases muestra (administrador y asesor), costo por campaña (administrador) y ejecutivo (administrador y asesor). Cada pestaña según los permisos del usuario.

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { hoyLocal } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Pagina } from "../../ui/basicos.tsx";
import { useTitulo } from "../../ui/hooks.ts";
import { Pestanas, propsDePanel } from "../../ui/Pestanas.tsx";
import { ClasesMuestra } from "./ClasesMuestra.tsx";
import { CostoPorCampana } from "./CostoPorCampana.tsx";
import { Ejecutivo } from "./Ejecutivo.tsx";
import type { ValoresDeFiltro } from "./Filtros.tsx";

type Vista = "clases" | "costo" | "ejecutivo";

/** Desde hace 90 días y sin fecha final como rango de partida (las clases agendadas hacia adelante también cuentan). */
function rangoInicial(): ValoresDeFiltro {
  const hoy = hoyLocal();
  const d = new Date(`${hoy}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 89);
  return { desde: d.toISOString().slice(0, 10), hasta: "", sucursalId: "", verticalId: "" };
}

export default function Tableros() {
  useTitulo("Tableros");
  const { puede } = useSesion();
  const vistas: { id: Vista; texto: string }[] = [
    ...(puede("reportes:clases_muestra") ? [{ id: "clases" as const, texto: "Clases muestra" }] : []),
    ...(puede("reportes:costos") ? [{ id: "costo" as const, texto: "Costo por campaña" }] : []),
    ...(puede("reportes:ejecutivo") ? [{ id: "ejecutivo" as const, texto: "Ejecutivo" }] : []),
  ];
  const [params, ponerParams] = useSearchParams();
  const pedida = params.get("vista");
  const vista = vistas.find((v) => v.id === pedida)?.id ?? vistas[0]?.id;
  const [filtros, setFiltros] = useState<ValoresDeFiltro>(rangoInicial);
  const [mes, setMes] = useState(hoyLocal().slice(0, 7));
  return (
    <Pagina titulo="Tableros" subtitulo="Cómo va la escuela: captación, costo y números del mes.">
      <Pestanas nombre="tableros" etiqueta="Tableros" pestanas={vistas} activa={vista} alCambiar={(id) => ponerParams({ vista: id })} />
      <div {...propsDePanel("tableros", vista ?? "")}>
        {vista === "clases" ? <ClasesMuestra filtros={filtros} alCambiar={setFiltros} /> : null}
        {vista === "costo" ? <CostoPorCampana filtros={filtros} alCambiar={setFiltros} /> : null}
        {vista === "ejecutivo" ? <Ejecutivo mes={mes} alCambiarMes={setMes} /> : null}
      </div>
    </Pagina>
  );
}
