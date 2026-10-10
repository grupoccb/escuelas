// Motivos de pérdida de un lead y de baja de una inscripción: las dos listas que la escuela usa para saber por qué se va una familia. Se agregan, se renombran, se reordenan y se apagan sin tocar
// lo que ya se registró (cada lead o baja conserva el motivo que se le puso). El identificador interno sale del nombre y no se ve.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Tarjeta, Vacio, Pagina } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { enteroDe } from "./ayudas.ts";
import { BotonDeIcono, ConfirmarAccion, Regreso, useEdicion } from "./comunes.tsx";
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

function Lista({ ruta, titulo, ayuda, modulo, claveDePrueba }: { ruta: string; titulo: string; ayuda: string; modulo: "captacion" | "inscripcion"; claveDePrueba: string }) {
  const carga = useCarga((senal) => api.get<{ datos: Motivo[] }>(ruta, undefined, senal), [ruta]);
  const edicion = useEdicion<Motivo>();
  const [quitando, setQuitando] = useState<Motivo | null>(null);
  const { moduloEncendido } = useSesion();
  return (
    <Tarjeta titulo={titulo} acciones={<Boton variante="sutil" onClick={edicion.nuevo}>Agregar un motivo</Boton>}>
      <div className="pila" data-prueba={claveDePrueba}>
        <p className="muted">{ayuda}</p>
        {!moduloEncendido(modulo) ? <Aviso tono="alerta">El módulo «{NOMBRE_DE_MODULO[modulo]}» está apagado. Puedes dejar la lista lista, pero no se usa hasta que lo enciendas.</Aviso> : null}
        {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
        {carga.cargando && !carga.datos ? <Cargando /> : null}
        {carga.datos && carga.datos.datos.length === 0 ? <Vacio titulo="Todavía no hay motivos">Agrega el primero con «Agregar un motivo».</Vacio> : null}
        <ul className="lista-tarjetas">
          {(carga.datos?.datos ?? []).map((m) => (
            <li key={m.id} className="item-admin" data-prueba={`motivo-${m.id}`}>
              <div className="item-admin-principal">
                <strong className="item-admin-nombre">{m.nombre}</strong>
              </div>
              <div className="item-admin-etiquetas">
                <Insignia tono={m.activo ? "exito" : "neutro"}>{m.activo ? "Se ofrece" : "Apagado"}</Insignia>
              </div>
              <div className="item-admin-acciones">
                <BotonDeIcono icono="lapiz" nombre="Cambiar" onClick={() => edicion.editar(m)} />
                <BotonDeIcono icono="papelera" nombre="Quitar" peligro onClick={() => setQuitando(m)} />
              </div>
            </li>
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
    </Tarjeta>
  );
}

export default function Motivos() {
  useTitulo("Motivos de pérdida y de baja");
  return (
    <Pagina titulo="Motivos de pérdida y de baja" subtitulo="Por qué se va una familia, en las palabras de la escuela." acciones={<Regreso />}>
      <Lista ruta="/api/motivos-perdida" titulo="Motivos de pérdida de un lead" ayuda="Se elige al marcar un lead como perdido. Sirven para ver, en los reportes, por qué no se inscriben." modulo="captacion" claveDePrueba="motivos-de-perdida" />
      <Lista ruta="/api/motivos-baja" titulo="Motivos de baja de una inscripción" ayuda="Se elige al dar de baja a un alumno. Sirven para ver por qué se van las familias que ya estaban inscritas." modulo="inscripcion" claveDePrueba="motivos-de-baja" />
    </Pagina>
  );
}
