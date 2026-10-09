// F6, modo «el maestro cierra en sitio» (`configuracion_organizacion.modo_cierre = maestro_en_sitio`): el maestro, al terminar la clase, inscribe a SU alumno
// con lo que ya capturó. Con el modo por omisión (el asesor cierra por WhatsApp) esta pieza no aparece: el maestro solo marca «listo para cerrar».
// El asistente completo (`Conversion.tsx`) es del asesor y el administrador: aquí solo se inscribe cuando YA no falta nada.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion } from "../../ui/basicos.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import type { ResultadoDeConversion, Vista } from "./datos.ts";
import { etiquetaDeFalta } from "./faltantes.ts";

export function CierreEnSitio({ leadId }: { leadId: string }) {
  const { yo, puede } = useSesion();
  const activo = yo?.configuracion.modo_cierre === "maestro_en_sitio" && puede("conversion:ejecutar");
  const vista = useCarga((senal) => api.get<Vista>(`/api/leads/${leadId}/conversion`, undefined, senal), [leadId], activo);
  const accion = useAccion();
  const [hecho, setHecho] = useState<ResultadoDeConversion | null>(null);
  if (!activo) return null;
  if (vista.cargando && !vista.datos) return <Cargando texto="Revisando si ya se puede inscribir…" />;
  if (vista.error) return <ErrorDeAccion error={vista.error} />;
  const v = vista.datos;
  if (!v) return null;
  if (hecho || v.ya_convertido) return <Aviso tono="exito">{hecho?.alumnos.some((a) => a.inscripcion?.creada) ? "Listo: tu alumno quedó inscrito." : "Este alumno ya está inscrito."}</Aviso>;
  return (
    <div className="pila" data-prueba="cierre-en-sitio">
      <strong>Inscribir ahora</strong>
      {v.listo ? (
        <p className="muted">Ya está todo lo necesario: se inscribe con lo que capturaste.</p>
      ) : (
        <Aviso tono="alerta" titulo="Todavía falta para poder inscribirlo">
          <ul>
            {v.faltantes.map((f) => (
              <li key={f.campo}>{etiquetaDeFalta(f.campo)}</li>
            ))}
          </ul>
          <p>Complétalo en el registro del alumno o pídele al asesor que cierre la inscripción.</p>
        </Aviso>
      )}
      <ErrorDeAccion error={accion.error} />
      <div>
        <Boton
          variante="primario"
          disabled={!v.listo}
          cargando={accion.ocupado}
          onClick={() =>
            void accion.ejecutar(async () => {
              setHecho(await api.post<ResultadoDeConversion>(`/api/leads/${leadId}/convertir`, {}));
            })
          }
        >
          Inscribir a mi alumno
        </Boton>
      </div>
    </div>
  );
}
