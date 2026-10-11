import { useState, type FormEvent } from "react";
import type { ErrorDeApi } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton } from "../../ui/basicos.tsx";
import { CampoClave, CampoTexto } from "../../ui/campos.tsx";
import { useAccion, useTitulo } from "../../ui/hooks.ts";

/** Lo que dice el aviso cuando se llega aquí sin haber escrito nada (README «Acceso»: «Sesión terminada» y «Cerraste sesión»). */
const AVISOS = { expirada: "Tu sesión terminó. Entra otra vez para seguir donde te quedaste.", salio: "Cerraste tu sesión.", nueva: "" } as const;

function esperaLegible(segundos: number): string {
  if (segundos < 90) return `${segundos} segundos`;
  return `${Math.ceil(segundos / 60)} minutos`;
}

/** El aviso que sale arriba de los campos: el error del intento (401 en rojo, 429 y «sin conexión» en ámbar) o, si no hay, el motivo por el que se llegó aquí. */
function AvisoDeAcceso({ error, motivo }: { error: ErrorDeApi | null; motivo: "nueva" | "expirada" | "salio" }) {
  if (error) {
    if (error.estado === 429) return <Aviso tono="alerta">Demasiados intentos. Espera {esperaLegible(error.reintentarEn ?? 60)} y vuelve a probar.</Aviso>;
    if (error.estado === 0) return <Aviso tono="alerta">{error.message}</Aviso>;
    return <Aviso tono="peligro">{error.estado === 401 ? "Correo o contraseña incorrectos." : error.message}</Aviso>;
  }
  return AVISOS[motivo] ? <Aviso tono="info">{AVISOS[motivo]}</Aviso> : null;
}

export function Acceso({ motivo }: { motivo: "nueva" | "expirada" | "salio" }) {
  useTitulo("Iniciar sesión");
  const { entrar } = useSesion();
  const [organizacion, setOrganizacion] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const accion = useAccion();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await accion.ejecutar(() => entrar({ organizacion: organizacion.trim().toLowerCase(), correo: correo.trim(), contrasena }));
  }

  const error = accion.error;
  return (
    <main className="acceso">
      <div className="acceso-marca">
        <div className="acceso-marca-cabeza">
          <div className="monograma" aria-hidden="true">
            G
          </div>
          <div>Gestión de inscripciones</div>
        </div>
        <div className="acceso-marca-lema">
          <p className="acceso-marca-titulo">Cada familia, de su primer mensaje a su primera clase.</p>
          <p className="acceso-marca-texto">Captación, clases muestra, inscripciones y cobranza de todas tus disciplinas en un solo lugar.</p>
        </div>
        {/* Las tres franjas de la marca: adorno (las disciplinas de cada escuela traen su propio color; aquí aún no se sabe de cuál es). */}
        <div className="acceso-marca-franjas" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="acceso-formulario">
        <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate>
          <div className="acceso-encabezado">
            <h1>Iniciar sesión</h1>
            <p className="muted">Con el correo que te dio la escuela.</p>
          </div>
          <AvisoDeAcceso error={error} motivo={motivo} />
          <CampoTexto etiqueta="Correo" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={correo} onChange={(e) => setCorreo(e.target.value)} aria-required="true" invalido={error?.estado === 401} autoFocus />
          <CampoClave etiqueta="Contraseña" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} aria-required="true" invalido={error?.estado === 401} />
          <CampoTexto etiqueta="Escuela (opcional)" ayuda="Solo si te dieron un código de escuela. Si no, déjalo vacío." autoComplete="organization" autoCapitalize="none" value={organizacion} onChange={(e) => setOrganizacion(e.target.value)} />
          <Boton type="submit" variante="primario" grande ancho cargando={accion.ocupado} textoCargando="Entrando…" disabled={!correo.trim() || !contrasena}>
            Entrar
          </Boton>
          {/* V7: quien olvida su contraseña o fue desactivado no tiene otra pantalla a dónde ir: se le dice con quién hablar. */}
          <p className="muted acceso-ayuda">¿Olvidaste tu contraseña? Pídele a quien administra la escuela que te la restablezca o que revise que tu usuario esté activo.</p>
        </form>
      </div>
    </main>
  );
}
