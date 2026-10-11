// Etapas del embudo: la escuela las nombra, las ordena, ajusta cuántos días sin movimiento avisan y agrega las suyas. Las que trae el sistema (Nuevo, Contactado, Clase muestra…, Inscrito y Perdido)
// se pueden renombrar pero no quitar ni cambiar de lugar entre sí: el sistema las busca por su papel, no por su nombre.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { enteroDe } from "./ayudas.ts";
import { AccionesDeTarjeta, ConfirmarAccion, useEdicion, VacioDeLista } from "./comunes.tsx";
import { FilaDeCatalogo, ListaDeCatalogo, PaginaDeCatalogo } from "./patron.tsx";
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
    <PaginaDeCatalogo
      titulo="Etapas del embudo"
      ayuda="Nombres, orden y días sin movimiento de cada etapa; agrega las tuyas. «Inscrito» y «Perdido» son del sistema: se renombran pero no se borran."
      nota="Las etapas con la insignia «Del sistema» las usa el bot y la inscripción: puedes cambiarles el nombre y los días de aviso, pero no quitarlas ni cambiarlas de lugar entre sí. Las tuyas se pueden mover y quitar (si no tienen leads)."
    >
      <ListaDeCatalogo titulo="Etapas" cuenta={carga.datos ? lista.length : undefined} nuevo="Agregar una etapa" alNuevo={edicion.nuevo}>
        <ErrorDeAccion error={mover.error} />
        {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
        {carga.cargando && !carga.datos ? <Cargando /> : null}
        {carga.datos && lista.length === 0 ? <VacioDeLista titulo="Todavía no hay etapas">Las crea la plantilla de la escuela.</VacioDeLista> : null}
        <ol className="lista-filas" data-prueba="lista-de-etapas">
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
              <FilaDeCatalogo
                key={e.id}
                data-prueba={`etapa-${e.id}`}
                orden={i + 1}
                titulo={e.nombre}
                etiquetas={
                  <>
                    {e.tipo_sistema !== null || esDeCierre(e) ? <Insignia tono="info">Del sistema</Insignia> : <Insignia tono="exito">Tuya</Insignia>}
                    {esDeCierre(e) ? <Insignia>Cierre</Insignia> : null}
                  </>
                }
                detalle={esDeCierre(e) ? "No avisa por días sin movimiento." : e.dias_alerta_sin_movimiento === null ? "No avisa por días sin movimiento." : `Avisa a los ${e.dias_alerta_sin_movimiento} días sin movimiento.`}
                acciones={
                  <AccionesDeTarjeta
                    nombreEditar="Cambiar"
                    nombreBaja="Quitar"
                    ordenar={{ nombre: e.nombre, alSubir: subir ? () => ir(subir) : null, alBajar: bajar ? () => ir(bajar) : null, ocupado: mover.ocupado }}
                    alEditar={() => edicion.editar(e)}
                    {...(esPropia(e) ? { alDarDeBaja: () => setQuitando(e) } : {})}
                  />
                }
              />
            );
          })}
        </ol>
      </ListaDeCatalogo>
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
    </PaginaDeCatalogo>
  );
}
