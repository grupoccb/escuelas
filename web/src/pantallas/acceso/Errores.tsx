import type { ReactNode } from "react";
import { inicioDe } from "../../navegacion.ts";
import { useYo } from "../../sesion/SesionContext.tsx";
import { EnlaceBoton, Pagina } from "../../ui/basicos.tsx";
import { useTitulo } from "../../ui/hooks.ts";
import { Icono } from "../../ui/Icono.tsx";

/** Una pantalla que no es la que se buscaba (sin acceso, no disponible, no encontrada): un panel con su ícono, qué pasó y el siguiente paso. */
function PantallaAparte({ icono, children, alIinicio }: { icono: "alerta" | "info" | "buscar"; children: ReactNode; alIinicio: { a: string; texto: string } }) {
  return (
    <div className="pantalla-aparte">
      <span className="pantalla-aparte-icono">
        <Icono nombre={icono} tamano={28} />
      </span>
      <div className="pantalla-aparte-texto">{children}</div>
      <div>
        <EnlaceBoton to={alIinicio.a} variante="primario">
          {alIinicio.texto}
        </EnlaceBoton>
      </div>
    </div>
  );
}

export function SinAcceso() {
  useTitulo("Sin acceso");
  const yo = useYo();
  return (
    <Pagina titulo="Sin acceso">
      <PantallaAparte icono="alerta" alIinicio={{ a: inicioDe(yo.usuario.rol, yo.permisos, yo.modulos), texto: "Ir a mi inicio" }}>
        <p role="alert">Tu usuario ({yo.usuario.nombre}) no tiene permiso para ver esta sección.</p>
      </PantallaAparte>
    </Pagina>
  );
}

/** Una sección de un módulo que la escuela no tiene encendido (V1). No hace ninguna petición a la API. */
export function NoDisponible() {
  useTitulo("No disponible");
  const yo = useYo();
  return (
    <Pagina titulo="No disponible">
      <PantallaAparte icono="info" alIinicio={{ a: inicioDe(yo.usuario.rol, yo.permisos, yo.modulos), texto: "Ir a mi inicio" }}>
        <p role="alert">Esta parte del sistema todavía no está activada en tu escuela.</p>
        <p className="muted">{yo.usuario.rol === "administrador" ? "Puedes activarla en Administración, en la sección Módulos." : "Si la necesitas, pídele a la persona que administra el sistema que la active."}</p>
      </PantallaAparte>
    </Pagina>
  );
}

export function NoEncontrada() {
  useTitulo("No encontrada");
  const yo = useYo();
  return (
    <Pagina titulo="Página no encontrada">
      <PantallaAparte icono="buscar" alIinicio={{ a: inicioDe(yo.usuario.rol, yo.permisos, yo.modulos), texto: "Volver a mi inicio" }}>
        <p>La dirección que abriste no existe. Puede que el enlace esté incompleto.</p>
      </PantallaAparte>
    </Pagina>
  );
}
