// Sucursales: alta, edición, zona horaria (decide el horario de envío), qué disciplinas se imparten en cada una y baja.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { AvisoDeBaja, ConfirmarAccion, Regreso, useEdicion } from "./comunes.tsx";
import { nombreDeZona, opcionesDeZona } from "./zonas.ts";
import type { SucursalAdmin, Vertical } from "./tipos.ts";

function Formulario({ sucursal, alGuardar, alCerrar }: { sucursal: SucursalAdmin | null; alGuardar: (nombre: string) => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(sucursal?.nombre ?? "");
  const [direccion, setDireccion] = useState(sucursal?.direccion ?? "");
  const [zona, setZona] = useState(sucursal?.zona_horaria ?? "America/Mexico_City");
  const [activo, setActivo] = useState(sucursal?.activo ?? true);
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
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
        if (zona.trim() === "") e["zona_horaria"] = "Escribe la zona horaria";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        const cuerpo = { nombre: nombre.trim(), direccion: direccion.trim() === "" ? null : direccion.trim(), zona_horaria: zona.trim(), activo };
        void guardar.ejecutar(async () => {
          if (sucursal) await api.patch(`/api/sucursales/${sucursal.id}`, cuerpo);
          else await api.post("/api/sucursales", cuerpo);
          alGuardar(cuerpo.nombre);
        });
      }}
    >
      <CampoTexto etiqueta="Nombre de la sucursal" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoTexto etiqueta="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} error={err("direccion")} />
      <CampoSelect etiqueta="Zona horaria" requerido value={zona} opciones={opcionesDeZona(zona)} onChange={(e) => setZona(e.target.value)} error={err("zona_horaria")} ayuda={`Decide a qué hora salen los mensajes automáticos (de 09:00 a 20:00, hora de esta sucursal).${sucursal && zona !== sucursal.zona_horaria ? " Ojo: lo que ya está programado conserva la hora de la zona anterior; solo lo nuevo usa la zona que elijas." : ""}`} />
      <CampoCasilla etiqueta="Activa" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
      <ErrorDeAccion error={guardar.error} enCampos={["nombre", "direccion", "zona_horaria"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

function Ofrece({ sucursal, verticales, alCambiar }: { sucursal: SucursalAdmin; verticales: Vertical[]; alCambiar: () => void }) {
  const accion = useAccion();
  const { avisar } = useAvisos();
  const mapa = new Map(sucursal.verticales.map((v) => [v.vertical_id, v]));
  return (
    <div className="pila" data-prueba={`ofrece-${sucursal.id}`}>
      <strong>Disciplinas que se imparten aquí</strong>
      <ErrorDeAccion error={accion.error} />
      {verticales.length === 0 ? <p className="muted">Primero da de alta una disciplina.</p> : null}
      {verticales.map((v) => {
        const fila = mapa.get(v.id);
        return (
          <CampoCasilla
            key={v.id}
            etiqueta={v.nombre}
            checked={fila?.activo === true}
            disabled={accion.ocupado}
            onChange={(e) => {
              const marcado = e.target.checked;
              void accion.ejecutar(async () => {
                if (marcado) await api.put(`/api/sucursales/${sucursal.id}/verticales/${v.id}`, {});
                else if (fila) await api.delete(`/api/sucursales/${sucursal.id}/verticales/${v.id}`);
                alCambiar();
                avisar(`${sucursal.nombre} ${marcado ? "ahora imparte" : "ya no imparte"} ${v.nombre}.`);
              });
            }}
          />
        );
      })}
    </div>
  );
}

export default function Sucursales() {
  useTitulo("Sucursales");
  const lista = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), []);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", { activo: true }, senal), []);
  const { avisar } = useAvisos();
  const edicion = useEdicion<SucursalAdmin>();
  const [baja, setBaja] = useState<SucursalAdmin | null>(null);
  return (
    <Pagina titulo="Sucursales" subtitulo="Dónde se imparte, en qué zona horaria y qué disciplinas." acciones={<><Regreso /><Boton variante="primario" onClick={edicion.nuevo}>Nueva sucursal</Boton></>}>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="Todavía no hay sucursales" /> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-sucursales">
        {(lista.datos?.datos ?? []).map((s) => (
          <li key={s.id} className="tarjeta pila" data-prueba={`sucursal-${s.id}`}>
            <div className="fila fila-entre">
              <strong>{s.nombre}</strong>
              <Insignia tono={s.activo ? "exito" : "neutro"}>{s.activo ? "Activa" : "Inactiva"}</Insignia>
            </div>
            <p className="muted">
              {s.direccion ?? "Sin dirección"} · {nombreDeZona(s.zona_horaria)}
            </p>
            <Ofrece sucursal={s} verticales={verticales.datos?.datos ?? []} alCambiar={lista.recargar} />
            <div className="fila">
              <Boton onClick={() => edicion.editar(s)}>Editar</Boton>
              <Boton variante="peligro" onClick={() => setBaja(s)}>
                Dar de baja
              </Boton>
            </div>
          </li>
        ))}
      </ul>
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Nueva sucursal" : "Editar sucursal"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? (
          <Formulario
            sucursal={edicion.actual === "nuevo" ? null : edicion.actual}
            alGuardar={(nombre) => {
              edicion.cerrar();
              lista.recargar();
              avisar(`La sucursal «${nombre}» se guardó.`);
            }}
            alCerrar={edicion.cerrar}
          />
        ) : null}
      </Dialogo>
      <ConfirmarAccion abierto={baja !== null} titulo="Dar de baja la sucursal" textoDeConfirmar="Dar de baja" alCerrar={() => setBaja(null)} alConfirmar={async () => { await api.delete(`/api/sucursales/${baja!.id}`); lista.recargar(); avisar(`La sucursal «${baja!.nombre}» se dio de baja.`); }}>
        <AvisoDeBaja cosa="sucursal" genero="f" nombre={baja?.nombre} consecuencia="Solo se puede si nada la usa: si ya tiene programas, usuarios, leads o alumnos, el sistema lo dirá." />
      </ConfirmarAccion>
    </Pagina>
  );
}
