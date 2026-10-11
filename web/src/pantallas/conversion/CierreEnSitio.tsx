// F6, modo «el maestro cierra en sitio» (`configuracion_organizacion.modo_cierre = maestro_en_sitio`): el maestro, al terminar la clase, inscribe a SU alumno
// con lo que ya capturó. Con el modo por omisión (el asesor cierra por WhatsApp) esta pieza no aparece: el maestro solo marca «listo para cerrar».
// El asistente completo (`Conversion.tsx`) es del asesor y el administrador: aquí solo se inscribe cuando YA no falta nada.
//
// V4 (EK-15): inscribir aparta un lugar y genera el cobro, así que pide confirmación diciendo EN QUÉ GRUPO queda (sin importes: el maestro no ve dinero). Si algo impide inscribir
// (el grupo se llenó, falta el reglamento…) no queda nada a medias y la pantalla dice qué hacer: avisarle al asesor, que lo resuelve con el asistente completo.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion } from "../../ui/basicos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import type { ResultadoDeConversion, Vista } from "./datos.ts";
import { etiquetaDeFalta } from "./faltantes.ts";

/** Lo que le falta a un alumno dicho para el maestro (las etiquetas del asistente son para el asesor: hablan de horarios y precios). */
const FALTA_PARA_EL_MAESTRO: Record<string, string> = {
  grupo_id: "El grupo en el que se inscribe (elígelo en «Grupo recomendado» del registro del alumno)",
  precio: "El grupo todavía no tiene precio: avísale al asesor",
  reglamento: "Que la familia acepte el reglamento (se registra en el registro del alumno)",
};

function etiquetaParaElMaestro(campo: string): string {
  const resto = /^prospectos\.[^.]+\.(.+)$/.exec(campo)?.[1];
  return (resto ? FALTA_PARA_EL_MAESTRO[resto] : undefined) ?? etiquetaDeFalta(campo);
}

/** `principal`: esta tarjeta lleva la única acción principal de «Hoy»; si no, «Inscribir a mi alumno» sale como secundario. */
export function CierreEnSitio({ leadId, claseId, alumno, principal = true }: { leadId: string; claseId: string; alumno: string | null; principal?: boolean }) {
  const { yo, puede } = useSesion();
  const activo = yo?.configuracion.modo_cierre === "maestro_en_sitio" && puede("conversion:ejecutar");
  const vista = useCarga((senal) => api.get<Vista>(`/api/leads/${leadId}/conversion`, undefined, senal), [leadId], activo);
  const accion = useAccion();
  const aviso = useAccion();
  const [hecho, setHecho] = useState<ResultadoDeConversion | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [avisado, setAvisado] = useState(false);
  if (!activo) return null;
  if (vista.cargando && !vista.datos) return <Cargando texto="Revisando si ya se puede inscribir…" />;
  if (vista.error) return <ErrorDeAccion error={vista.error} />;
  const v = vista.datos;
  if (!v) return null;
  if (hecho || v.ya_convertido) return <Aviso tono="exito">{hecho?.alumnos.some((a) => a.inscripcion?.creada) ? "Listo: tu alumno quedó inscrito." : "Este alumno ya está inscrito."}</Aviso>;

  const nombre = alumno ?? "tu alumno";
  const grupo = v.previsiones[0]?.grupo_nombre ?? null;
  const motivo = accion.error?.detalles.find((d) => d.campo === "motivo")?.mensaje;
  // Un rechazo del servidor (409): no se inscribió a nadie ni se generó ningún cobro; lo que sigue es avisarle al asesor.
  const rechazado = accion.error?.estado === 409;

  return (
    <div className="pila cierre-sitio" data-prueba="cierre-en-sitio">
      <strong className="cierre-sitio-titulo">Inscribir ahora</strong>
      {v.listo ? (
        rechazado ? null : <p className="muted">Ya está todo lo necesario: se inscribe con lo que capturaste.</p>
      ) : (
        <Aviso tono="alerta" titulo="Todavía falta para poder inscribirlo">
          <ul>
            {v.faltantes.map((f) => (
              <li key={f.campo}>{etiquetaParaElMaestro(f.campo)}</li>
            ))}
          </ul>
          <p>Complétalo en el registro del alumno o pídele al asesor que cierre la inscripción.</p>
        </Aviso>
      )}
      {rechazado && motivo === "grupo_lleno" ? (
        <Aviso tono="alerta" titulo={grupo ? `El grupo ${grupo} ya no tiene lugares` : "El grupo ya no tiene lugares"}>
          <p>No se inscribió a nadie y no se generó ningún cobro. Avisa al asesor: él pone a {nombre} en lista de espera o le busca otro grupo.</p>
        </Aviso>
      ) : rechazado ? (
        <>
          <ErrorDeAccion error={accion.error} />
          <p className="muted">No se inscribió a nadie y no se generó ningún cobro. Avisa al asesor para que lo resuelva.</p>
        </>
      ) : (
        <ErrorDeAccion error={accion.error} />
      )}
      {rechazado ? (
        <div className="pila">
          <ErrorDeAccion error={aviso.error} />
          {avisado ? (
            <Aviso tono="exito">Listo: el asesor recibió el aviso y se encarga.</Aviso>
          ) : (
            <Boton
              ancho
              variante={principal ? "primario" : "secundario"}
              cargando={aviso.ocupado}
              onClick={() =>
                void aviso.ejecutar(async () => {
                  await api.post(`/api/clases-muestra/${claseId}/listo-para-cerrar`);
                  setAvisado(true);
                })
              }
            >
              Avisar al asesor
            </Boton>
          )}
        </div>
      ) : null}
      <Boton
        variante={v.listo && principal && !rechazado ? "primario" : "secundario"}
        grande
        ancho
        disabled={!v.listo}
        cargando={accion.ocupado}
        onClick={() => {
          accion.limpiar();
          setConfirmando(true);
        }}
      >
        Inscribir a mi alumno
      </Boton>
      <Dialogo abierto={confirmando} titulo={`Inscribir a ${nombre}`} alCerrar={() => setConfirmando(false)}>
        <p>
          {grupo ? (
            <>
              Quedará inscrito en el grupo <strong>{grupo}</strong>.
            </>
          ) : (
            "Quedará inscrito en el grupo que recomendaste."
          )}{" "}
          Se aparta su lugar y a la familia se le genera el cobro de la inscripción y de la primera mensualidad.
        </p>
        <div className="formulario-acciones">
          <Boton
            variante="primario"
            grande
            cargando={accion.ocupado}
            onClick={() =>
              void accion.ejecutar(async () => {
                const r = await api.post<ResultadoDeConversion>(`/api/leads/${leadId}/convertir`, {});
                setHecho(r);
              }).then(() => setConfirmando(false))
            }
          >
            Sí, inscribir
          </Boton>
          <Boton grande disabled={accion.ocupado} onClick={() => setConfirmando(false)}>
            Todavía no
          </Boton>
        </div>
      </Dialogo>
    </div>
  );
}
