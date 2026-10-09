// Usuarios y roles: alta, cambio de rol y sucursales, activar o desactivar, restablecer la contraseña de OTRA persona y ligar al asesor con su agente de Chatwoot.
// La contraseña nunca se muestra ni se guarda en el navegador. La propia se cambia desde «Mi sesión».

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { useYo } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { enteroDe } from "./ayudas.ts";
import { Regreso, useEdicion } from "./comunes.tsx";
import { problemaDeContrasenaNueva, ROLES, ROLES_CON_SUCURSALES } from "./mensajeria.ts";
import type { SucursalAdmin } from "./tipos.ts";

interface UsuarioAdmin {
  id: string;
  correo: string;
  nombre: string;
  rol: string;
  activo: boolean;
  chatwoot_agent_id: number | null;
  sucursales: string[];
}

function Formulario({ usuario, sucursales, alGuardar, alCerrar }: { usuario: UsuarioAdmin | null; sucursales: SucursalAdmin[]; alGuardar: () => void; alCerrar: () => void }) {
  const [correo, setCorreo] = useState(usuario?.correo ?? "");
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [rol, setRol] = useState(usuario?.rol ?? "asesor");
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [donde, setDonde] = useState<string[]>(usuario?.sucursales ?? []);
  const [contrasena, setContrasena] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  return (
    <form
      className="formulario"
      autoComplete="off"
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
        if (usuario === null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())) e["correo"] = "Escribe un correo válido";
        if ((usuario === null || contrasena !== "") && problemaDeContrasenaNueva(contrasena)) e["contrasena"] = problemaDeContrasenaNueva(contrasena)!;
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        const sucursalesDelRol = ROLES_CON_SUCURSALES.has(rol) ? donde : [];
        void guardar.ejecutar(async () => {
          if (usuario) await api.patch(`/api/usuarios/${usuario.id}`, { nombre: nombre.trim(), rol, activo, sucursales: sucursalesDelRol, ...(contrasena !== "" ? { contrasena } : {}) });
          else await api.post("/api/usuarios", { correo: correo.trim(), nombre: nombre.trim(), rol, contrasena, sucursales: sucursalesDelRol });
          setContrasena("");
          alGuardar();
        });
      }}
    >
      {usuario === null ? <CampoTexto etiqueta="Correo" type="email" requerido autoComplete="off" value={correo} onChange={(e) => setCorreo(e.target.value)} error={err("correo")} ayuda="Es su usuario y no se puede cambiar después." /> : <p className="muted">Correo: <strong>{usuario.correo}</strong> (no cambia)</p>}
      <CampoTexto etiqueta="Nombre" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoSelect etiqueta="Rol" value={rol} opciones={ROLES.map((r) => ({ valor: r.valor, texto: r.texto }))} onChange={(e) => setRol(e.target.value)} error={err("rol")} />
      {ROLES_CON_SUCURSALES.has(rol) ? (
        <fieldset className="pila sin-borde">
          <legend>
            <strong>Sucursales que atiende</strong>
          </legend>
          {sucursales.map((s) => (
            <CampoCasilla key={s.id} etiqueta={s.nombre} checked={donde.includes(s.id)} onChange={(e) => setDonde((d) => (e.target.checked ? [...d, s.id] : d.filter((x) => x !== s.id)))} />
          ))}
          {err("sucursales") ? <p className="campo-error">{err("sucursales")}</p> : null}
        </fieldset>
      ) : null}
      {usuario ? <CampoCasilla etiqueta="Activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} ayuda="Desactivar o cambiar el rol cierra sus sesiones." /> : null}
      <CampoTexto etiqueta={usuario ? "Restablecer la contraseña (opcional)" : "Contraseña inicial"} type="password" autoComplete="new-password" requerido={usuario === null} value={contrasena} onChange={(e) => setContrasena(e.target.value)} error={err("contrasena")} ayuda="Al menos 10 caracteres. Se la das en persona; al restablecerla se cierran sus sesiones." />
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

function VincularChatwoot({ usuario, alTerminar, alCerrar }: { usuario: UsuarioAdmin; alTerminar: () => void; alCerrar: () => void }) {
  const [agente, setAgente] = useState(usuario.chatwoot_agent_id ? String(usuario.chatwoot_agent_id) : "");
  const [local, setLocal] = useState<string | null>(null);
  const vincular = useAccion();
  const desvincular = useAccion();
  return (
    <div className="pila">
      <p>
        Liga a <strong>{usuario.nombre}</strong> con su agente de Chatwoot para saber qué asesor tiene cada conversación. Sin número, el sistema busca al agente por su correo.
      </p>
      <CampoTexto etiqueta="Número del agente en Chatwoot (opcional)" inputMode="numeric" value={agente} onChange={(e) => setAgente(e.target.value)} error={local ?? undefined} />
      <ErrorDeAccion error={vincular.error ?? desvincular.error} />
      <div className="formulario-acciones">
        <Boton
          variante="primario"
          cargando={vincular.ocupado}
          onClick={() => {
            const n = agente.trim() === "" ? undefined : enteroDe(agente, 1, 2_000_000_000);
            if (agente.trim() !== "" && n === null) return setLocal("Escribe el número del agente");
            setLocal(null);
            void vincular.ejecutar(async () => {
              await api.post(`/api/usuarios/${usuario.id}/vincular-chatwoot`, n === undefined || n === null ? {} : { agente_id: n });
              alTerminar();
            });
          }}
        >
          Vincular
        </Boton>
        {usuario.chatwoot_agent_id ? (
          <Boton
            variante="peligro"
            cargando={desvincular.ocupado}
            onClick={() =>
              void desvincular.ejecutar(async () => {
                await api.delete(`/api/usuarios/${usuario.id}/vincular-chatwoot`);
                alTerminar();
              })
            }
          >
            Desvincular
          </Boton>
        ) : null}
        <Boton onClick={alCerrar}>Cerrar</Boton>
      </div>
    </div>
  );
}

export default function Usuarios() {
  useTitulo("Usuarios y roles");
  const yo = useYo();
  const [pagina, setPagina] = useState(1);
  const lista = useCarga((senal) => api.get<Pag<UsuarioAdmin>>("/api/usuarios", { limite: 25, pagina }, senal), [pagina]);
  const sucursales = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), []);
  const edicion = useEdicion<UsuarioAdmin>();
  const [chatwoot, setChatwoot] = useState<UsuarioAdmin | null>(null);
  const nombreS = (id: string) => sucursales.datos?.datos.find((s) => s.id === id)?.nombre ?? "—";
  return (
    <Pagina titulo="Usuarios y roles" subtitulo="Quién entra a la aplicación y qué puede hacer." acciones={<><Regreso /><Boton variante="primario" onClick={edicion.nuevo}>Nuevo usuario</Boton></>}>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="Todavía no hay usuarios" /> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-usuarios">
        {(lista.datos?.datos ?? []).map((u) => (
          <li key={u.id} className="tarjeta pila" data-prueba={`usuario-${u.correo}`}>
            <div className="fila fila-entre">
              <strong>
                {u.nombre} {u.id === yo.usuario.id ? <span className="muted">(tú)</span> : null}
              </strong>
              <span className="fila">
                <Insignia tono="info">{ROLES.find((r) => r.valor === u.rol)?.texto ?? u.rol}</Insignia>
                <Insignia tono={u.activo ? "exito" : "neutro"}>{u.activo ? "Activo" : "Inactivo"}</Insignia>
                {u.chatwoot_agent_id ? <Insignia>Agente {u.chatwoot_agent_id}</Insignia> : null}
              </span>
            </div>
            <p className="muted">
              {u.correo}
              {u.sucursales.length > 0 ? ` · ${u.sucursales.map(nombreS).join(", ")}` : ""}
            </p>
            <div className="fila">
              <Boton onClick={() => edicion.editar(u)}>Editar</Boton>
              {u.rol === "asesor" ? <Boton onClick={() => setChatwoot(u)}>Agente de Chatwoot</Boton> : null}
            </div>
          </li>
        ))}
      </ul>
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
      <Aviso>Siempre debe quedar al menos un administrador activo, y no puedes desactivarte ni quitarte el rol a ti mismo.</Aviso>
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Nuevo usuario" : "Editar usuario"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? <Formulario usuario={edicion.actual === "nuevo" ? null : edicion.actual} sucursales={sucursales.datos?.datos ?? []} alGuardar={() => { edicion.cerrar(); lista.recargar(); }} alCerrar={edicion.cerrar} /> : null}
      </Dialogo>
      <Dialogo abierto={chatwoot !== null} titulo="Agente de Chatwoot" alCerrar={() => setChatwoot(null)}>
        {chatwoot ? <VincularChatwoot usuario={chatwoot} alTerminar={() => { setChatwoot(null); lista.recargar(); }} alCerrar={() => setChatwoot(null)} /> : null}
      </Dialogo>
    </Pagina>
  );
}
