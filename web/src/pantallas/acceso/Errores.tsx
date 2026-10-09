import { Link } from "react-router-dom";
import { inicioDe } from "../../navegacion.ts";
import { useYo } from "../../sesion/SesionContext.tsx";
import { EnlaceBoton, Pagina } from "../../ui/basicos.tsx";
import { useTitulo } from "../../ui/hooks.ts";

export function SinAcceso() {
  useTitulo("Sin acceso");
  const yo = useYo();
  return (
    <Pagina titulo="Sin acceso">
      <p role="alert">Tu usuario ({yo.usuario.nombre}) no tiene permiso para ver esta sección.</p>
      <div>
        <EnlaceBoton to={inicioDe(yo.usuario.rol, yo.permisos, yo.modulos)} variante="primario">
          Ir a mi inicio
        </EnlaceBoton>
      </div>
    </Pagina>
  );
}

/** Una sección de un módulo que la escuela no tiene encendido (V1). No hace ninguna petición a la API. */
export function NoDisponible() {
  useTitulo("No disponible");
  const yo = useYo();
  return (
    <Pagina titulo="No disponible">
      <p role="alert">Esta parte del sistema todavía no está activada en tu escuela.</p>
      <p className="muted">{yo.usuario.rol === "administrador" ? "Puedes activarla en Administración, en la sección Módulos." : "Si la necesitas, pídele a la persona que administra el sistema que la active."}</p>
      <div>
        <EnlaceBoton to={inicioDe(yo.usuario.rol, yo.permisos, yo.modulos)} variante="primario">
          Ir a mi inicio
        </EnlaceBoton>
      </div>
    </Pagina>
  );
}

export function NoEncontrada() {
  useTitulo("No encontrada");
  const yo = useYo();
  return (
    <Pagina titulo="Página no encontrada">
      <p>La dirección que abriste no existe. Puede que el enlace esté incompleto.</p>
      <p>
        <Link to={inicioDe(yo.usuario.rol, yo.permisos, yo.modulos)}>Volver a mi inicio</Link>
      </p>
    </Pagina>
  );
}

/** Marcador de una pantalla que llega en un bloque posterior de la etapa J. */
export function Pendiente({ bloque }: { bloque: string }) {
  useTitulo("Próximamente");
  return (
    <Pagina titulo="Próximamente">
      <p>Esta pantalla llega en el bloque {bloque}.</p>
    </Pagina>
  );
}
