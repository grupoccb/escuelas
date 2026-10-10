import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { seccionesDe } from "../../navegacion.ts";
import { useSesion, useYo } from "../../sesion/SesionContext.tsx";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, ErrorDeAccion, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useTitulo } from "../../ui/hooks.ts";

const ROLES = { administrador: "Administrador", asesor: "Asesor", maestro: "Maestro", recepcion: "Recepción" } as const;

/**
 * Cambiar la propia contraseña (V7): la API existía (`POST /api/yo/contrasena`) pero ninguna pantalla la usaba, así que quien recibía su contraseña «en persona» no podía cambiarla nunca.
 * Pide la actual (el servidor la comprueba y cuenta los intentos), la nueva dos veces y avisa en palabras lo que no cumple.
 */
function CambiarContrasena({ alTerminar, alCerrar }: { alTerminar: () => void; alCerrar: () => void }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  return (
    <form
      className="formulario"
      autoComplete="off"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        if (actual === "") e["actual"] = "Escribe tu contraseña actual";
        if (nueva.length < 10) e["nueva"] = "Debe tener al menos 10 caracteres";
        else if (nueva === actual) e["nueva"] = "Tiene que ser distinta de la actual";
        if (repetida !== nueva) e["repetida"] = "La repetición no es igual a la contraseña nueva";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        void guardar.ejecutar(async () => {
          await api.post("/api/yo/contrasena", { actual, nueva });
          setActual("");
          setNueva("");
          setRepetida("");
          alTerminar();
        });
      }}
    >
      <CampoTexto etiqueta="Contraseña actual" type="password" autoComplete="current-password" requerido value={actual} onChange={(e) => setActual(e.target.value)} error={err("actual")} />
      <CampoTexto etiqueta="Contraseña nueva" type="password" autoComplete="new-password" requerido value={nueva} onChange={(e) => setNueva(e.target.value)} error={err("nueva")} ayuda="Al menos 10 caracteres, y no puede llevar tu correo ni tu nombre." />
      <CampoTexto etiqueta="Repite la contraseña nueva" type="password" autoComplete="new-password" requerido value={repetida} onChange={(e) => setRepetida(e.target.value)} error={err("repetida")} />
      <ErrorDeAccion error={guardar.error} enCampos={["actual", "nueva"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Cambiar contraseña
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

/** Todas las secciones del usuario (la barra inferior del celular no cabe con más de cinco) y su sesión. */
export function Mas() {
  useTitulo("Más");
  const yo = useYo();
  const { salir } = useSesion();
  const { avisar } = useAvisos();
  const [cambiando, setCambiando] = useState(false);
  const secciones = seccionesDe(yo.permisos, yo.modulos);
  return (
    <Pagina titulo="Más">
      {/* V7: una escuela que solo tiene activa la captación le deja a recepción (y al maestro) una pantalla sin secciones: se dice por qué y qué hacer. */}
      {secciones.length === 0 ? (
        <Aviso tono="alerta" titulo="Todavía no tienes secciones activas">
          <p>Tu escuela aún no activa las partes del sistema que usa tu puesto. Pídele a la persona que administra el sistema que las active; en cuanto lo haga, aparecerán aquí sin que tengas que hacer nada.</p>
        </Aviso>
      ) : null}
      <Tarjeta titulo="Secciones">
        <ul className="lista-tarjetas">
          {secciones.map((s) => (
            <li key={s.id}>
              <Link className="fila enlace-tactil" to={s.ruta}>
                <Icono nombre={s.icono} /> {s.etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta titulo="Mi sesión">
        <dl className="datos">
          <dt>Usuario</dt>
          <dd>{yo.usuario.nombre}</dd>
          <dt>Correo</dt>
          <dd>{yo.usuario.correo}</dd>
          <dt>Rol</dt>
          <dd>{ROLES[yo.usuario.rol]}</dd>
          <dt>Sucursales</dt>
          <dd>{yo.sucursales.map((s) => s.nombre).join(", ") || "—"}</dd>
        </dl>
        <div className="fila">
          <Boton onClick={() => setCambiando(true)}>Cambiar mi contraseña</Boton>
          <Boton variante="peligro" onClick={() => void salir()}>
            Cerrar sesión
          </Boton>
        </div>
      </Tarjeta>
      <Dialogo abierto={cambiando} titulo="Cambiar mi contraseña" alCerrar={() => setCambiando(false)}>
        {cambiando ? (
          <CambiarContrasena
            alTerminar={() => {
              setCambiando(false);
              avisar("Tu contraseña cambió. Se cerraron tus sesiones en otros aparatos; en este sigues adentro.");
            }}
            alCerrar={() => setCambiando(false)}
          />
        ) : null}
      </Dialogo>
    </Pagina>
  );
}
