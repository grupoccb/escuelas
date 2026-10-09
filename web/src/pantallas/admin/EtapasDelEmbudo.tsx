// Etapas del embudo: la escuela las nombra, las ordena, ajusta cuántos días sin movimiento avisan y agrega las suyas. Las que trae el sistema (Nuevo, Contactado, Clase muestra…, Inscrito y Perdido)
// se pueden renombrar pero no quitar ni cambiar de lugar entre sí: el sistema las busca por su papel, no por su nombre.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { enteroDe } from "./ayudas.ts";
import { ConfirmarAccion, Regreso, useEdicion } from "./comunes.tsx";
import { esDeCierre, esPropia, moverEtapa, type EtapaDeLista } from "./etapas.ts";

function Formulario({ etapa, alGuardar, alCerrar }: { etapa: EtapaDeLista | null; alGuardar: () => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(etapa?.nombre ?? "");
  const [dias, setDias] = useState(etapa?.dias_alerta_sin_movimiento === null || etapa === null ? "" : String(etapa.dias_alerta_sin_movimiento));
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  const cierre = etapa !== null && esDeCierre(etapa);
  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre de la etapa";
        else if (nombre.trim().length > 60) e["nombre"] = "El nombre puede tener hasta 60 letras";
        const d = dias.trim() === "" ? null : enteroDe(dias, 1, 365);
        if (dias.trim() !== "" && d === null) e["dias"] = "Escribe un número de 1 a 365, o déjalo vacío para no avisar";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        void guardar.ejecutar(async () => {
          if (etapa) await api.patch(`/api/etapas/${etapa.id}`, { nombre: nombre.trim(), ...(cierre ? {} : { dias_alerta_sin_movimiento: d }) });
          else await api.post("/api/etapas", { nombre: nombre.trim(), dias_alerta_sin_movimiento: d });
          alGuardar();
        });
      }}
    >
      <CampoTexto etiqueta="Nombre de la etapa" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      {cierre ? (
        <p className="muted">Las etapas de cierre no avisan por días sin movimiento.</p>
      ) : (
        <CampoTexto
          etiqueta="Días sin movimiento que avisan"
          inputMode="numeric"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          error={err("dias") ?? servidor["dias_alerta_sin_movimiento"]}
          ayuda="Un lead que lleva estos días en la etapa sin que nadie le escriba aparece en «Estancados» y puede disparar el aviso de lead frío. Déjalo vacío si esta etapa no debe avisar (de 1 a 365 días)."
        />
      )}
      <ErrorDeAccion error={guardar.error} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function EtapasDelEmbudo() {
  useTitulo("Etapas del embudo");
  const carga = useCarga((senal) => api.get<{ datos: EtapaDeLista[] }>("/api/etapas", undefined, senal), []);
  const edicion = useEdicion<EtapaDeLista>();
  const [quitando, setQuitando] = useState<EtapaDeLista | null>(null);
  const mover = useAccion();
  const lista = carga.datos?.datos ?? [];
  return (
    <Pagina titulo="Etapas del embudo" subtitulo="Cómo se llaman las etapas por las que pasa una familia, en qué orden y cuándo avisan." acciones={<><Regreso /><Boton variante="primario" onClick={edicion.nuevo}>Agregar una etapa</Boton></>}>
      <Aviso>Las etapas con la insignia «Del sistema» las usa el bot y la inscripción: puedes cambiarles el nombre y los días de aviso, pero no quitarlas ni cambiarlas de lugar entre sí. Las tuyas se pueden mover y quitar (si no tienen leads).</Aviso>
      <ErrorDeAccion error={mover.error} />
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos && lista.length === 0 ? <Vacio titulo="Todavía no hay etapas">Las crea la plantilla de la escuela.</Vacio> : null}
      <ol className="lista-tarjetas" data-prueba="lista-de-etapas">
        {lista.map((e, i) => {
          const subir = moverEtapa(lista, i, -1);
          const bajar = moverEtapa(lista, i, 1);
          const ir = (nueva: EtapaDeLista[] | null) => {
            if (!nueva) return;
            void mover.ejecutar(async () => {
              await api.put("/api/etapas/orden", { ids: nueva.map((x) => x.id) });
              carga.recargar();
            });
          };
          return (
            <li key={e.id} className="tarjeta pila" data-prueba={`etapa-${e.id}`}>
              <div className="fila fila-entre">
                <strong>
                  {i + 1}. {e.nombre}
                </strong>
                <span className="fila">
                  {e.tipo_sistema !== null || esDeCierre(e) ? <Insignia>Del sistema</Insignia> : <Insignia tono="exito">Tuya</Insignia>}
                  {esDeCierre(e) ? <Insignia tono="info">Cierre</Insignia> : null}
                </span>
              </div>
              <p className="muted">{esDeCierre(e) ? "No avisa por días sin movimiento." : e.dias_alerta_sin_movimiento === null ? "No avisa por días sin movimiento." : `Avisa a los ${e.dias_alerta_sin_movimiento} días sin movimiento.`}</p>
              <div className="fila">
                <Boton onClick={() => edicion.editar(e)}>Cambiar</Boton>
                <Boton disabled={!subir || mover.ocupado} onClick={() => ir(subir)} aria-label={`Subir ${e.nombre}`}>
                  Subir
                </Boton>
                <Boton disabled={!bajar || mover.ocupado} onClick={() => ir(bajar)} aria-label={`Bajar ${e.nombre}`}>
                  Bajar
                </Boton>
                {esPropia(e) ? <Boton variante="peligro" onClick={() => setQuitando(e)}>Quitar</Boton> : null}
              </div>
            </li>
          );
        })}
      </ol>
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Agregar una etapa" : "Cambiar la etapa"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? <Formulario key={edicion.actual === "nuevo" ? "nuevo" : edicion.actual.id} etapa={edicion.actual === "nuevo" ? null : edicion.actual} alGuardar={() => { edicion.cerrar(); carga.recargar(); }} alCerrar={edicion.cerrar} /> : null}
      </Dialogo>
      <ConfirmarAccion
        abierto={quitando !== null}
        titulo="Quitar la etapa"
        textoDeConfirmar="Quitar"
        alConfirmar={async () => {
          await api.delete(`/api/etapas/${quitando!.id}`);
          carga.recargar();
        }}
        alCerrar={() => setQuitando(null)}
      >
        <p>¿Quitar la etapa «{quitando?.nombre}»? Si tiene leads, el sistema no te deja: primero muévelos a otra etapa.</p>
      </ConfirmarAccion>
    </Pagina>
  );
}
