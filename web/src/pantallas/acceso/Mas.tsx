import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { NOMBRE_DE_ROL, seccionesDe } from "../../navegacion.ts";
import { useSesion, useYo } from "../../sesion/SesionContext.tsx";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, ErrorDeAccion, Pagina } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { iniciales } from "../../ui/disciplina.ts";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useTitulo } from "../../ui/hooks.ts";

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
        if (actual === "") e["actual"] = "Escribe tu contraseña actual.";
        if (nueva.length < 10) e["nueva"] = "La nueva necesita al menos 10 caracteres.";
        else if (nueva === actual) e["nueva"] = "Tiene que ser distinta de la actual.";
        if (repetida !== nueva) e["repetida"] = "No coincide con la nueva.";
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

/** «Mi cuenta» (la pantalla de «Más» del celular): quién es, todas sus secciones (la barra inferior no cabe con más de cinco), cambiar su contraseña y salir. */
export function Mas() {
  useTitulo("Mi cuenta");
  const yo = useYo();
  const { salir } = useSesion();
  const { avisar } = useAvisos();
  const [cambiando, setCambiando] = useState(false);
  const secciones = seccionesDe(yo.permisos, yo.modulos);
  const sucursales = yo.sucursales.map((s) => s.nombre).join(", ");
  return (
    <Pagina titulo="Mi cuenta" nombreCorto="Más">
      <section className="cuenta-identidad" aria-label="Mi sesión">
        <span className="cuenta-avatar" aria-hidden="true">
          {iniciales(yo.usuario.nombre)}
        </span>
        <div className="cuenta-identidad-texto">
          <strong>{yo.usuario.nombre}</strong>
          <span>{[yo.usuario.correo, NOMBRE_DE_ROL[yo.usuario.rol], sucursales].filter(Boolean).join(" · ")}</span>
        </div>
      </section>
      {/* V7: una escuela que solo tiene activa la captación le deja a recepción (y al maestro) una pantalla sin secciones: se dice por qué y qué hacer. */}
      {secciones.length === 0 ? (
        <Aviso tono="alerta" titulo="Todavía no tienes secciones activas">
          <p>Tu escuela aún no activa las partes del sistema que usa tu puesto. Pídele a la persona que administra el sistema que las active; en cuanto lo haga, aparecerán aquí sin que tengas que hacer nada.</p>
        </Aviso>
      ) : (
        <ul className="lista-enlaces cuenta-secciones" aria-label="Mis secciones">
          {secciones.map((s) => (
            <li key={s.id}>
              <Link className="enlace-seccion" to={s.ruta}>
                <Icono nombre={s.icono} />
                <span>{s.etiqueta}</span>
                <Icono nombre="siguiente" tamano={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="cuenta-acciones">
        <Boton onClick={() => setCambiando(true)}>
          <Icono nombre="llave" tamano={18} />
          Cambiar mi contraseña
        </Boton>
        <Boton variante="peligro" onClick={() => void salir()}>
          <Icono nombre="salir" tamano={18} />
          Cerrar sesión
        </Boton>
      </div>
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
