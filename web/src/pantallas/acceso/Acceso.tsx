import { useState, type FormEvent } from "react";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton } from "../../ui/basicos.tsx";
import { CampoClave, CampoTexto } from "../../ui/campos.tsx";
import { useAccion, useTitulo } from "../../ui/hooks.ts";

const AVISOS = { expirada: "Tu sesión terminó. Inicia sesión de nuevo para continuar donde estabas.", salio: "Cerraste tu sesión.", nueva: "" } as const;

function esperaLegible(segundos: number): string {
  if (segundos < 90) return `${segundos} segundos`;
  return `${Math.ceil(segundos / 60)} minutos`;
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
  const bloqueado = error?.estado === 429;
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
          <p className="acceso-marca-texto">Leads, clases muestra, inscripciones y cobros en un solo lugar.</p>
        </div>
      </div>
      <div className="acceso-formulario">
        <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate>
          <div className="acceso-encabezado">
            <h1>Iniciar sesión</h1>
            <p className="muted">Entra con el correo que te dio tu escuela.</p>
          </div>
          {AVISOS[motivo] ? <Aviso tono={motivo === "expirada" ? "alerta" : "info"}>{AVISOS[motivo]}</Aviso> : null}
          <CampoTexto etiqueta="Correo" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={correo} onChange={(e) => setCorreo(e.target.value)} requerido autoFocus />
          <CampoClave etiqueta="Contraseña" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} requerido />
          <CampoTexto etiqueta="Escuela (opcional)" ayuda="Solo si te dieron un código de escuela. Si no, déjalo vacío." autoComplete="organization" autoCapitalize="none" value={organizacion} onChange={(e) => setOrganizacion(e.target.value)} />
          {error ? <Aviso tono="peligro">{bloqueado ? <p>Demasiados intentos. Espera {esperaLegible(error.reintentarEn ?? 60)} y vuelve a intentar.</p> : <p>{error.estado === 401 ? "Correo o contraseña incorrectos." : error.message}</p>}</Aviso> : null}
          <Boton type="submit" variante="primario" grande ancho cargando={accion.ocupado} disabled={!correo || !contrasena}>
            Entrar
          </Boton>
          {/* V7: quien olvida su contraseña o fue desactivado no tiene otra pantalla a dónde ir: se le dice con quién hablar. */}
          <p className="muted acceso-ayuda">¿No puedes entrar? Pídele a quien administra el sistema que te restablezca la contraseña o que revise que tu usuario esté activo.</p>
        </form>
      </div>
    </main>
  );
}
