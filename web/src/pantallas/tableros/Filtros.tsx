// Filtros compartidos de los tableros: rango de fechas, sucursal y disciplina. Las sucursales y disciplinas salen de la API (nada escrito en el código).

import type { ReactNode } from "react";
import { api } from "../../api/cliente.ts";
import type { SucursalAdmin, Vertical } from "../admin/tipos.ts";
import { CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { useCarga } from "../../ui/hooks.ts";

export interface ValoresDeFiltro {
  desde: string;
  hasta: string;
  sucursalId: string;
  verticalId: string;
}

/** «Hasta» antes de «Desde»: el servidor lo rechaza; aquí se dice qué corregir junto al campo. */
export const rangoInvertido = (v: ValoresDeFiltro): boolean => v.desde !== "" && v.hasta !== "" && v.desde > v.hasta;

export function Filtros({ valores, alCambiar, conSucursalYVertical = true, acciones }: { valores: ValoresDeFiltro; alCambiar: (v: ValoresDeFiltro) => void; conSucursalYVertical?: boolean; acciones?: ReactNode }) {
  const sucursales = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), [], conSucursalYVertical);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal), [], conSucursalYVertical);
  return (
    <div className="filtros-tablero">
      <div className="filtros" role="group" aria-label="Filtros">
        <CampoTexto etiqueta="Desde" type="date" value={valores.desde} max={valores.hasta || undefined} onChange={(e) => alCambiar({ ...valores, desde: e.target.value })} />
        <CampoTexto etiqueta="Hasta" type="date" value={valores.hasta} min={valores.desde || undefined} error={rangoInvertido(valores) ? "La fecha «Desde» debe ser anterior a «Hasta»." : undefined} onChange={(e) => alCambiar({ ...valores, hasta: e.target.value })} />
        {conSucursalYVertical ? (
          <>
            <CampoSelect etiqueta="Sucursal" value={valores.sucursalId} vacio="Todas" opciones={(sucursales.datos?.datos ?? []).map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => alCambiar({ ...valores, sucursalId: e.target.value })} />
            <CampoSelect etiqueta="Disciplina" value={valores.verticalId} vacio="Todas" opciones={(verticales.datos?.datos ?? []).map((v) => ({ valor: v.id, texto: v.nombre }))} onChange={(e) => alCambiar({ ...valores, verticalId: e.target.value })} />
          </>
        ) : null}
      </div>
      {acciones ? <div className="filtros-acciones">{acciones}</div> : null}
    </div>
  );
}
