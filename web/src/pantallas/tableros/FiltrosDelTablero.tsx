// Los filtros de la página de Tableros: disciplina (píldoras con su punto de color), sucursal y, para las secciones de captación (01 a 03), un rango de fechas que reemplaza al mes.
// Las sucursales y las disciplinas vienen de la API (nada escrito aquí); el color de cada disciplina es el dato `color_marca`.

import type { SucursalAdmin, Vertical } from "../admin/tipos.ts";
import { CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { useDisciplina } from "../../ui/disciplina.tsx";
import { rangoInvertido, type ValoresDeFiltro } from "./Filtros.tsx";

function PildoraDeDisciplina({ nombre, color, activa, alElegir }: { nombre: string; color: string | null; activa: boolean; alElegir: () => void }) {
  const ref = useDisciplina<HTMLButtonElement>(color);
  return (
    <button ref={ref} type="button" className="pildora-filtro" aria-pressed={activa} onClick={alElegir}>
      <span className="pildora-filtro-punto" aria-hidden="true" />
      {nombre}
    </button>
  );
}

export function FiltrosDelTablero({ valores, alCambiar, sucursales, disciplinas, conCaptacion }: { valores: ValoresDeFiltro; alCambiar: (v: ValoresDeFiltro) => void; sucursales: readonly SucursalAdmin[]; disciplinas: readonly Vertical[]; conCaptacion: boolean }) {
  return (
    <div className="tablero-filtros" data-prueba="filtros-del-tablero">
      {disciplinas.length > 0 ? (
        <div className="tablero-pildoras" role="group" aria-label="Disciplina">
          <button type="button" className="pildora-filtro" aria-pressed={valores.verticalId === ""} onClick={() => alCambiar({ ...valores, verticalId: "" })}>
            Todas las disciplinas
          </button>
          {disciplinas.map((v) => (
            <PildoraDeDisciplina key={v.id} nombre={v.nombre} color={v.color_marca} activa={valores.verticalId === v.id} alElegir={() => alCambiar({ ...valores, verticalId: valores.verticalId === v.id ? "" : v.id })} />
          ))}
        </div>
      ) : null}
      <div className="filtros tablero-campos">
        <CampoSelect etiqueta="Sucursal" value={valores.sucursalId} vacio="Todas" opciones={sucursales.map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => alCambiar({ ...valores, sucursalId: e.target.value })} />
        {conCaptacion ? (
          <>
            <CampoTexto etiqueta="Desde" type="date" value={valores.desde} max={valores.hasta || undefined} onChange={(e) => alCambiar({ ...valores, desde: e.target.value })} />
            <CampoTexto etiqueta="Hasta" type="date" value={valores.hasta} min={valores.desde || undefined} error={rangoInvertido(valores) ? "La fecha «Desde» debe ser anterior a «Hasta»." : undefined} onChange={(e) => alCambiar({ ...valores, hasta: e.target.value })} />
          </>
        ) : null}
      </div>
      <p className="tablero-nota muted">
        Altas, bajas y deserción son de este mes; lo demás es la foto de hoy.
        {conCaptacion ? " Si eliges fechas, las secciones 01 a 03 usan ese rango en lugar del mes." : ""}
      </p>
    </div>
  );
}
