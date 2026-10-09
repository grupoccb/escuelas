// Sucursales: alta, edición, zona horaria (decide el horario de envío), qué disciplinas se imparten en cada una y baja.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { ConfirmarAccion, Regreso, useEdicion } from "./comunes.tsx";
import type { SucursalAdmin, Vertical } from "./tipos.ts";

/** Zonas habituales; el campo admite cualquier nombre IANA (el servidor lo valida). */
const ZONAS = ["America/Mexico_City", "America/Monterrey", "America/Merida", "America/Cancun", "America/Chihuahua", "America/Mazatlan", "America/Hermosillo", "America/Tijuana", "America/Bogota", "America/Lima", "America/Santiago", "America/Argentina/Buenos_Aires", "Europe/Madrid"];

function Formulario({ sucursal, alGuardar, alCerrar }: { sucursal: SucursalAdmin | null; alGuardar: () => void; alCerrar: () => void }) {
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
          alGuardar();
        });
      }}
    >
      <CampoTexto etiqueta="Nombre de la sucursal" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoTexto etiqueta="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} error={err("direccion")} />
      <div className="campo">
        <label htmlFor="zona-horaria">
          Zona horaria<span className="requerido" aria-hidden="true"> *</span>
        </label>
        <input id="zona-horaria" list="zonas-conocidas" value={zona} onChange={(e) => setZona(e.target.value)} aria-invalid={err("zona_horaria") ? true : undefined} />
        <datalist id="zonas-conocidas">
          {ZONAS.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <p className="campo-ayuda">Decide el horario de envío de los mensajes (09:00 a 20:00 hora de esta sucursal).</p>
        {err("zona_horaria") ? <p className="campo-error">{err("zona_horaria")}</p> : null}
      </div>
      <CampoCasilla etiqueta="Activa" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
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

function Ofrece({ sucursal, verticales, alCambiar }: { sucursal: SucursalAdmin; verticales: Vertical[]; alCambiar: () => void }) {
  const accion = useAccion();
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
            onChange={(e) =>
              void accion.ejecutar(async () => {
                if (e.target.checked) await api.put(`/api/sucursales/${sucursal.id}/verticales/${v.id}`, {});
                else if (fila) await api.delete(`/api/sucursales/${sucursal.id}/verticales/${v.id}`);
                alCambiar();
              })
            }
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
              {s.direccion ?? "Sin dirección"} · {s.zona_horaria}
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
            alGuardar={() => {
              edicion.cerrar();
              lista.recargar();
            }}
            alCerrar={edicion.cerrar}
          />
        ) : null}
      </Dialogo>
      <ConfirmarAccion abierto={baja !== null} titulo="Dar de baja la sucursal" textoDeConfirmar="Dar de baja" alCerrar={() => setBaja(null)} alConfirmar={async () => { await api.delete(`/api/sucursales/${baja!.id}`); lista.recargar(); }}>
        <Aviso tono="alerta">
          Solo se puede dar de baja una sucursal que nada usa. Si ya tiene programas, usuarios, leads o alumnos, el sistema lo dirá: desactívala en su lugar. Baja de <strong>{baja?.nombre}</strong>.
        </Aviso>
      </ConfirmarAccion>
    </Pagina>
  );
}
