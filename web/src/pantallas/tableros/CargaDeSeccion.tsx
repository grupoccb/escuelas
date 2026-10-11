// El estado de carga de una sección: cargando, error con «Reintentar», rango al revés o los datos. Lo comparten las secciones que piden su propio reporte (01 a 03).

import type { ReactNode } from "react";
import { Cargando, ErrorDeCarga, Vacio } from "../../ui/basicos.tsx";
import type { Carga } from "../../ui/hooks.ts";

export function CargaDeSeccion<T>({ carga, rangoInvertido = false, texto, children }: { carga: Carga<T>; rangoInvertido?: boolean; texto?: string; children: (datos: T) => ReactNode }) {
  if (rangoInvertido) {
    return (
      <Vacio icono="alerta" titulo="Corrige las fechas para ver esta sección.">
        La fecha «Desde» debe ser anterior a «Hasta».
      </Vacio>
    );
  }
  return (
    <>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando {...(texto ? { texto } : {})} /> : null}
      {carga.datos ? children(carga.datos) : null}
    </>
  );
}
