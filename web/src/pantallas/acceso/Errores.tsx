import { Link } from "react-router-dom";
import { INICIO_POR_ROL } from "../../navegacion.ts";
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
        <EnlaceBoton to={INICIO_POR_ROL[yo.usuario.rol]} variante="primario">
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
        <Link to={INICIO_POR_ROL[yo.usuario.rol]}>Volver a mi inicio</Link>
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
