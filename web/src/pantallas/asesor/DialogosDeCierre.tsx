// Los diálogos que el embudo abre al llevar leads a la etapa de perdidos o al sacarlos de ahí (R2b): «¿Por qué se perdió …?» (botones con los motivos de `/api/motivos-perdida` y nota opcional) y
// «Recuperar …» (nota obligatoria). Reemplazan a `MoverEtapa` en el soltar, el menú «Mover a…», la hoja y la ficha lateral. Las reglas son las del servidor (`PATCH /api/leads/:id/etapa`):
// perder EXIGE el motivo, recuperar EXIGE la nota, y un lead que cambió de etapa mientras tanto responde 409 (se dice dentro del diálogo y, al cerrar, se recarga).

import { useRef, useState } from "react";
import { api } from "../../api/cliente.ts";
import type { Etapa, MotivoPerdida } from "../../api/tipos.ts";
import { Aviso, Boton, ErrorDeAccion } from "../../ui/basicos.tsx";
import { CampoArea } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion } from "../../ui/hooks.ts";
import { cuerpoDeMovimiento, faltaDePerdido, faltaDeRecuperar, subtituloDePerdido, subtituloDeRecuperar, textoDeBotonDePerdido, tituloDePerdido, tituloDeRecuperar } from "./dialogos-embudo.ts";
import type { LeadParaMover, ResultadoDeMover } from "./MoverEtapa.tsx";

export interface PropsDeDialogoDeCierre {
  /** Los leads que se mueven (uno o varios). */
  leads: readonly LeadParaMover[];
  /** La etapa a la que van. */
  destino: Etapa | undefined;
  etapas: readonly Etapa[];
  abierto: boolean;
  alCerrar: () => void;
  /** Con `resultado`, de verdad se movió algo (el embudo avisa «ya quedó»); sin él, solo hay que recargar (un 409 o un fallo a medias). */
  alMover: (resultado?: ResultadoDeMover) => void;
}

/** Mueve los leads uno por uno (una llamada por lead, cada una con la etapa de la que se le vio salir). Si fallan varios a medias, los que ya se movieron se quedan movidos y al cerrar se recarga. */
function useMovimiento({ leads, destino, alCerrar, alMover }: Pick<PropsDeDialogoDeCierre, "leads" | "destino" | "alCerrar" | "alMover">) {
  const accion = useAccion();
  const huboCambios = useRef(false);
  const cerrar = () => {
    const huboConflicto = accion.error?.esConflicto === true;
    accion.limpiar();
    alCerrar();
    const recargarSolo = huboConflicto || huboCambios.current;
    huboCambios.current = false;
    if (recargarSolo) alMover();
  };
  const mover = (extra: { motivoId?: string; nota: string }) => {
    if (!destino) return;
    void accion.ejecutar(async () => {
      let movidos = 0;
      for (const l of leads) {
        try {
          await api.patch(`/api/leads/${l.id}/etapa`, cuerpoDeMovimiento({ destinoId: destino.id, desdeEtapaId: l.etapa_id, ...extra }));
          movidos += 1;
        } catch (error) {
          if (movidos > 0) huboCambios.current = true;
          throw error;
        }
      }
      huboCambios.current = false;
      accion.limpiar();
      alCerrar();
      alMover({ destinoId: destino.id, cantidad: movidos });
    });
  };
  return { accion, cerrar, mover };
}

function PieDeDialogo({ error, falta }: { error: ReturnType<typeof useAccion>["error"]; falta: string | null }) {
  return (
    <>
      {error?.esConflicto ? <Aviso tono="alerta">El lead cambió mientras lo veías. Cierra esta ventana: la lista se actualiza.</Aviso> : null}
      <ErrorDeAccion error={error} />
      {falta ? <p className="campo-ayuda" data-prueba="falta-del-dialogo">{falta}</p> : null}
    </>
  );
}

/** «¿Por qué se perdió …?»: un botón por motivo (uno elegido) y una nota opcional. */
export function DialogoPerdido({ leads, destino, etapas, motivos, abierto, alCerrar, alMover }: PropsDeDialogoDeCierre & { motivos: readonly MotivoPerdida[] }) {
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  const { accion, cerrar, mover } = useMovimiento({ leads, destino, alCerrar, alMover });
  const nombres = leads.map((l) => l.nombre);
  const falta = faltaDePerdido(motivo);
  const actual = etapas.find((e) => e.id === leads[0]?.etapa_id);
  const cerrarYLimpiar = () => {
    setMotivo("");
    setNota("");
    cerrar();
  };

  return (
    <Dialogo abierto={abierto && leads.length > 0} titulo={tituloDePerdido(nombres)} alCerrar={cerrarYLimpiar}>
      <p className="muted etapa-actual-dialogo">{subtituloDePerdido(nombres, actual?.nombre ?? "—")}</p>
      <form
        noValidate
        className="formulario"
        data-prueba="dialogo-perdido"
        onSubmit={(e) => {
          e.preventDefault();
          if (falta) return;
          mover({ motivoId: motivo, nota });
        }}
      >
        <fieldset className="grupo-opciones">
          <legend>Motivo de pérdida</legend>
          <div className="opciones-motivo">
            {motivos.map((m) => (
              <button key={m.id} type="button" className="opcion-boton" aria-pressed={motivo === m.id} onClick={() => setMotivo(m.id)}>
                {m.nombre}
              </button>
            ))}
          </div>
        </fieldset>
        <CampoArea etiqueta="Nota (opcional)" placeholder="Lo que te dijo la familia" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} />
        <PieDeDialogo error={accion.error} falta={falta} />
        <div className="formulario-acciones">
          <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={falta !== null}>
            {textoDeBotonDePerdido(leads.length, destino?.nombre ?? "Perdido")}
          </Boton>
          <Boton onClick={cerrarYLimpiar}>Cancelar</Boton>
        </div>
      </form>
    </Dialogo>
  );
}

/** «Recuperar …»: de perdidos a una etapa abierta, con la nota que dice por qué (obligatoria). */
export function DialogoRecuperar({ leads, destino, etapas, abierto, alCerrar, alMover }: PropsDeDialogoDeCierre) {
  const [nota, setNota] = useState("");
  const { accion, cerrar, mover } = useMovimiento({ leads, destino, alCerrar, alMover });
  const nombres = leads.map((l) => l.nombre);
  const falta = faltaDeRecuperar(nota);
  const origenes = leads.map((l) => etapas.find((e) => e.id === l.etapa_id)?.nombre ?? "—");
  const cerrarYLimpiar = () => {
    setNota("");
    cerrar();
  };

  return (
    <Dialogo abierto={abierto && leads.length > 0} titulo={tituloDeRecuperar(nombres)} alCerrar={cerrarYLimpiar}>
      <p className="muted etapa-actual-dialogo">{subtituloDeRecuperar(origenes, destino?.nombre ?? "—")}</p>
      <form
        noValidate
        className="formulario"
        data-prueba="dialogo-recuperar"
        onSubmit={(e) => {
          e.preventDefault();
          if (falta) return;
          mover({ nota });
        }}
      >
        <Aviso tono="info">Estás recuperando un lead que se había perdido: la nota es obligatoria.</Aviso>
        <CampoArea etiqueta="Nota (obligatoria)" aria-required="true" placeholder="Por qué se recupera" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} />
        <PieDeDialogo error={accion.error} falta={falta} />
        <div className="formulario-acciones">
          <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={falta !== null}>
            {`Mover a ${destino?.nombre ?? "—"}`}
          </Boton>
          <Boton onClick={cerrarYLimpiar}>Cancelar</Boton>
        </div>
      </form>
    </Dialogo>
  );
}
