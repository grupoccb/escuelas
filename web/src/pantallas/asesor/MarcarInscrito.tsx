// «Marcar como inscrito» (V10b): con el módulo de inscripción APAGADO nadie puede inscribir en el sistema, así que el asesor (o el administrador) deja anotado a mano que la
// familia ya se inscribió. Pide una nota obligatoria, confirma y muestra el resultado. La regla es del servidor (`PATCH /api/leads/:id/etapa`); con la inscripción encendida este
// botón no se ofrece (se inscribe desde la ficha).

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import type { Etapa } from "../../api/tipos.ts";
import { Aviso, Boton, ErrorDeAccion } from "../../ui/basicos.tsx";
import { CampoArea } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion } from "../../ui/hooks.ts";
import { etapaDeInscrito, LARGO_MAXIMO_NOTA, LARGO_MINIMO_NOTA, problemaDeNota } from "./inscrito-a-mano.ts";
import type { LeadParaMover } from "./MoverEtapa.tsx";

type Paso = "escribir" | "confirmar" | "listo";

export function MarcarInscrito({ lead, etapas, abierto, alCerrar, alMarcar }: { lead: LeadParaMover | null; etapas: Etapa[]; abierto: boolean; alCerrar: () => void; alMarcar: () => void }) {
  const [paso, setPaso] = useState<Paso>("escribir");
  const [nota, setNota] = useState("");
  const [tocada, setTocada] = useState(false);
  const accion = useAccion();
  const destino = etapaDeInscrito(etapas);
  const problema = problemaDeNota(nota);
  const nombre = lead?.nombre ?? "la familia";

  const cerrar = () => {
    const hecho = paso === "listo";
    const huboConflicto = accion.error?.esConflicto === true;
    setPaso("escribir");
    setNota("");
    setTocada(false);
    accion.limpiar();
    alCerrar();
    if (hecho || huboConflicto) alMarcar();
  };

  return (
    <Dialogo abierto={abierto && lead !== null} titulo={`Marcar a ${nombre} como inscrito`} alCerrar={cerrar}>
      {paso === "escribir" ? (
        <form
          noValidate
          className="formulario"
          data-prueba="marcar-inscrito-formulario"
          onSubmit={(e) => {
            e.preventDefault();
            setTocada(true);
            if (!problema) setPaso("confirmar");
          }}
        >
          <Aviso tono="info">La inscripción todavía no está activada en tu escuela. Aquí no se inscribe al alumno ni se generan cobros: solo queda anotado que la familia ya se inscribió.</Aviso>
          {destino ? null : <Aviso tono="alerta">Tu escuela no tiene una etapa de inscrito en el embudo. Pídele a quien administra el sistema que la configure.</Aviso>}
          <CampoArea
            etiqueta="¿Cómo se inscribió? (obligatorio)"
            ayuda={`Cuéntalo en una frase: ¿Cómo se inscribió? ¿Pagó? ¿En qué grupo? Mínimo ${LARGO_MINIMO_NOTA} caracteres. No escribas datos de salud del niño.`}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={LARGO_MAXIMO_NOTA}
            requerido
            error={tocada && problema ? problema : undefined}
            data-prueba="marcar-inscrito-nota"
          />
          <div className="formulario-acciones">
            <Boton type="submit" variante="primario" disabled={!destino} data-prueba="marcar-inscrito-continuar">
              Continuar
            </Boton>
            <Boton onClick={cerrar}>Cancelar</Boton>
          </div>
        </form>
      ) : null}
      {paso === "confirmar" && lead && destino ? (
        <div className="pila" data-prueba="marcar-inscrito-confirmacion">
          <p>
            Vas a marcar a <strong>{nombre}</strong> como <strong>{destino.nombre}</strong> con esta nota:
          </p>
          <blockquote className="cita-nota">{nota.trim()}</blockquote>
          <p className="muted">Queda guardado que lo hiciste tú, con la fecha y tu nota. Si te equivocas, solo un administrador puede corregirlo.</p>
          <ErrorDeAccion error={accion.error} enCampos={["nota"]} />
          {accion.error?.esConflicto ? <Aviso tono="alerta">La familia cambió mientras lo veías. Cierra esta ventana: la pantalla se actualiza.</Aviso> : null}
          <div className="formulario-acciones">
            <Boton
              variante="primario"
              cargando={accion.ocupado}
              data-prueba="marcar-inscrito-confirmar"
              onClick={() =>
                void accion.ejecutar(async () => {
                  await api.patch(`/api/leads/${lead.id}/etapa`, { etapa_id: destino.id, desde_etapa_id: lead.etapa_id, nota: nota.trim() });
                  setPaso("listo");
                })
              }
            >
              Sí, marcar como inscrito
            </Boton>
            <Boton onClick={() => { accion.limpiar(); setPaso("escribir"); }} disabled={accion.ocupado}>
              Volver
            </Boton>
          </div>
        </div>
      ) : null}
      {paso === "listo" ? (
        <div className="pila" data-prueba="marcar-inscrito-listo">
          <Aviso tono="exito" titulo="Listo">
            {nombre} quedó como inscrito. Se guardó que lo marcaste tú, la fecha y tu nota; la verás en el historial de etapas de la ficha.
          </Aviso>
          <div className="formulario-acciones">
            <Boton variante="primario" onClick={cerrar}>
              Cerrar
            </Boton>
          </div>
        </div>
      ) : null}
    </Dialogo>
  );
}
