// Motivos de pérdida de un lead y de baja de una inscripción: las dos listas que la escuela usa para saber por qué se va una familia. Se agregan, se renombran, se reordenan y se apagan sin tocar
// lo que ya se registró (cada lead o baja conserva el motivo que se le puso). El identificador interno sale del nombre y no se ve.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { enteroDe } from "./ayudas.ts";
import { AccionesDeTarjeta, ConfirmarAccion, useEdicion, VacioDeLista } from "./comunes.tsx";
import { FilaDeCatalogo, ListaDeCatalogo, PaginaDeCatalogo, useAlternarActivo } from "./patron.tsx";
import { NOMBRE_DE_MODULO } from "./mensajeria.ts";

interface Motivo {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

function Formulario({ ruta, motivo, alGuardar, alCerrar }: { ruta: string; motivo: Motivo | null; alGuardar: () => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(motivo?.nombre ?? "");
  const [orden, setOrden] = useState(String(motivo?.orden ?? 0));
  const [activo, setActivo] = useState(motivo?.activo ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        if (nombre.trim() === "") e["nombre"] = "Escribe el motivo";
        else if (nombre.trim().length > 120) e["nombre"] = "El motivo puede tener hasta 120 letras";
        const o = enteroDe(orden, 0, 1000);
        if (o === null) e["orden"] = "Escribe un número de 0 a 1000";
        setLocal(e);
        if (Object.keys(e).length > 0 || o === null) return;
        void guardar.ejecutar(async () => {
          if (motivo) await api.patch(`${ruta}/${motivo.id}`, { nombre: nombre.trim(), orden: o, activo });
          else await api.post(ruta, { nombre: nombre.trim(), orden: o });
          alGuardar();
        });
      }}
    >
      <CampoTexto etiqueta="Motivo" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoTexto etiqueta="Lugar en la lista" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} error={err("orden")} ayuda="El 0 sale primero. Los que tienen el mismo número salen por orden alfabético." />
      {motivo ? <CampoCasilla etiqueta="Se ofrece al registrar" checked={activo} onChange={(e) => setActivo(e.target.checked)} ayuda="Si lo apagas, ya no aparece al elegir un motivo, pero lo que ya se registró con él se conserva." /> : null}
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

function Lista({ ruta, titulo, ayuda, modulo, claveDePrueba, nuevo, secundaria = false }: { ruta: string; titulo: string; ayuda: string; modulo: "captacion" | "inscripcion"; claveDePrueba: string; nuevo: string; secundaria?: boolean }) {
  const carga = useCarga((senal) => api.get<{ datos: Motivo[] }>(ruta, undefined, senal), [ruta]);
  const edicion = useEdicion<Motivo>();
  const [quitando, setQuitando] = useState<Motivo | null>(null);
  const { moduloEncendido } = useSesion();
  const alternar = useAlternarActivo(carga.recargar);
  const ordenar = useAccion();
  const lista = carga.datos?.datos ?? [];
  /** Sube o baja un lugar: se numera la lista 1, 2, 3… y solo se escriben los que cambian de número. */
  const mover = (i: number, delta: -1 | 1): void => {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    const nueva = [...lista];
    [nueva[i], nueva[j]] = [nueva[j]!, nueva[i]!];
    void ordenar.ejecutar(async () => {
      for (const [k, m] of nueva.entries()) if (m.orden !== k + 1) await api.patch(`${ruta}/${m.id}`, { orden: k + 1 });
      carga.recargar();
    });
  };
  return (
    <ListaDeCatalogo titulo={titulo} cuenta={carga.datos ? lista.length : undefined} nuevo={nuevo} alNuevo={edicion.nuevo} secundaria={secundaria}>
      <div className="pila" data-prueba={claveDePrueba}>
        <p className="muted">{ayuda}</p>
        {!moduloEncendido(modulo) ? <Aviso tono="alerta">El módulo «{NOMBRE_DE_MODULO[modulo]}» está apagado. Puedes dejar la lista lista, pero no se usa hasta que lo enciendas.</Aviso> : null}
        {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
        {carga.cargando && !carga.datos ? <Cargando /> : null}
        {carga.datos && lista.length === 0 ? <VacioDeLista titulo="Todavía no hay motivos">Agrega el primero con «{nuevo}».</VacioDeLista> : null}
        <ErrorDeAccion error={ordenar.error} />
        <ErrorDeAccion error={alternar.error} />
        <ul className="lista-filas">
          {lista.map((m, i) => (
            <FilaDeCatalogo
              key={m.id}
              data-prueba={`motivo-${m.id}`}
              orden={i + 1}
              inactiva={!m.activo}
              titulo={m.nombre}
              etiquetas={<Insignia tono={m.activo ? "exito" : "neutro"}>{m.activo ? "Se ofrece" : "Apagado"}</Insignia>}
              acciones={
                <AccionesDeTarjeta
                  nombreEditar="Cambiar"
                  nombreBaja="Quitar"
                  ordenar={{ nombre: m.nombre, alSubir: i > 0 ? () => mover(i, -1) : null, alBajar: i < lista.length - 1 ? () => mover(i, 1) : null, ocupado: ordenar.ocupado }}
                  activo={m.activo}
                  ocupado={alternar.ocupado}
                  alDesactivar={() => alternar.alternar(`${ruta}/${m.id}`, m.activo, { desactivada: `«${m.nombre}» quedó apagado: ya no se ofrece al elegir un motivo.`, activada: `«${m.nombre}» se ofrece otra vez.` })}
                  alEditar={() => edicion.editar(m)}
                  alDarDeBaja={() => setQuitando(m)}
                />
              }
            />
          ))}
        </ul>
      </div>
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Agregar un motivo" : "Cambiar el motivo"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? <Formulario key={edicion.actual === "nuevo" ? "nuevo" : edicion.actual.id} ruta={ruta} motivo={edicion.actual === "nuevo" ? null : edicion.actual} alGuardar={() => { edicion.cerrar(); carga.recargar(); }} alCerrar={edicion.cerrar} /> : null}
      </Dialogo>
      <ConfirmarAccion
        abierto={quitando !== null}
        titulo="Quitar el motivo"
        textoDeConfirmar="Quitar"
        alConfirmar={async () => {
          await api.delete(`${ruta}/${quitando!.id}`);
          carga.recargar();
        }}
        alCerrar={() => setQuitando(null)}
      >
        <p>¿Quitar «{quitando?.nombre}»? Ya no aparece al elegir un motivo. Lo que se registró con él se conserva tal cual.</p>
      </ConfirmarAccion>
    </ListaDeCatalogo>
  );
}

export default function Motivos() {
  useTitulo("Motivos de pérdida y de baja");
  return (
    <PaginaDeCatalogo titulo="Motivos de pérdida y de baja" ayuda="Por qué se va una familia, en tus palabras. Aparecen al perder un lead y al dar de baja a un alumno.">
      <Lista ruta="/api/motivos-perdida" titulo="Motivos de pérdida" nuevo="Nuevo motivo de pérdida" ayuda="Se elige al marcar un lead como perdido. Sirven para ver, en los reportes, por qué no se inscriben." modulo="captacion" claveDePrueba="motivos-de-perdida" />
      <Lista ruta="/api/motivos-baja" titulo="Motivos de baja" nuevo="Nuevo motivo de baja" secundaria ayuda="Se elige al dar de baja a un alumno. Sirven para ver por qué se van las familias que ya estaban inscritas." modulo="inscripcion" claveDePrueba="motivos-de-baja" />
    </PaginaDeCatalogo>
  );
}
