import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { ModuloId } from "../../api/tipos.ts";
import { inicioDe, NOMBRE_DE_MODULO, NOMBRE_DE_ROL, seccionDeRuta, seccionesDeUnModulo, type NombreDeIcono } from "../../navegacion.ts";
import { useYo } from "../../sesion/SesionContext.tsx";
import { EnlaceBoton } from "../../ui/basicos.tsx";
import { useTitulo } from "../../ui/hooks.ts";
import { Icono } from "../../ui/Icono.tsx";

type Tono = "peligro" | "info" | "neutro";

/**
 * Una pantalla que no es la que se buscaba (sin acceso, no disponible, no encontrada): un panel con el ícono del tono, qué pasó, el siguiente paso y, a veces, una segunda salida.
 * `nombre` es el nombre corto de la pantalla («Sin acceso»): el título visible dice más, y el nombre corto se anuncia primero a un lector de pantalla (y es el que buscan las pruebas).
 */
function PantallaAparte({ tono, icono, nombre, titulo, children, acciones }: { tono: Tono; icono: NombreDeIcono; nombre: string; titulo: string; children: ReactNode; acciones: ReactNode }) {
  return (
    <div className="pantalla-aparte-marco">
      <section className="pantalla-aparte">
        <span className={`pantalla-aparte-icono pantalla-aparte-icono-${tono}`} aria-hidden="true">
          <Icono nombre={icono} tamano={26} />
        </span>
        <div className="pantalla-aparte-texto">
          <h1>
            <span className="solo-lectores">{nombre}. </span>
            {titulo}
          </h1>
          {children}
        </div>
        <div className="pantalla-aparte-acciones">{acciones}</div>
      </section>
    </div>
  );
}

function useInicio(): string {
  const yo = useYo();
  return inicioDe(yo.usuario.rol, yo.permisos, yo.modulos);
}

export function SinAcceso() {
  useTitulo("Sin acceso");
  const yo = useYo();
  const inicio = useInicio();
  const { pathname } = useLocation();
  const seccion = seccionDeRuta(pathname);
  const que = seccion ? `«${seccion.etiqueta}»` : "esta pantalla";
  return (
    <PantallaAparte
      tono="peligro"
      icono="bloquear"
      nombre="Sin acceso"
      titulo="Esta pantalla no es para tu rol"
      acciones={
        <EnlaceBoton to={inicio} variante="primario">
          Ir a mi inicio
        </EnlaceBoton>
      }
    >
      <p role="alert">
        Tu usuario de {NOMBRE_DE_ROL[yo.usuario.rol].toLowerCase()} ({yo.usuario.nombre}) no puede ver {que}. Si crees que deberías, pídele a quien administra la escuela que revise tus permisos.
      </p>
    </PantallaAparte>
  );
}

/** «Y» entre las dos últimas: «pagos, estado de cuenta y uniformes». */
function enLista(cosas: readonly string[]): string {
  if (cosas.length <= 1) return cosas[0] ?? "";
  return `${cosas.slice(0, -1).join(", ")} y ${cosas[cosas.length - 1]}`;
}

/** Una sección de un módulo que la escuela no tiene encendido (V1). No hace ninguna petición a la API. */
export function NoDisponible({ modulo }: { modulo?: ModuloId } = {}) {
  useTitulo("No disponible");
  const yo = useYo();
  const inicio = useInicio();
  const esAdmin = yo.usuario.rol === "administrador";
  const secciones = modulo ? seccionesDeUnModulo(modulo, yo.permisos) : [];
  return (
    <PantallaAparte
      tono="info"
      icono="encender"
      nombre="No disponible"
      titulo={modulo ? `${NOMBRE_DE_MODULO[modulo]} está apagado` : "Esta parte del sistema está apagada"}
      acciones={
        <>
          <EnlaceBoton to={inicio} variante="primario">
            Ir a mi inicio
          </EnlaceBoton>
          {esAdmin ? <EnlaceBoton to="/admin/modulos">Encenderlo en Módulos</EnlaceBoton> : null}
        </>
      }
    >
      <p role="alert">Esta parte del sistema todavía no está activada en tu escuela{secciones.length > 0 ? `, así que ${enLista(secciones)} no ${secciones.length === 1 ? "está disponible" : "están disponibles"}` : ""}.</p>
      {esAdmin ? null : <p>Si la necesitas, pídele a la persona que administra el sistema que la active.</p>}
    </PantallaAparte>
  );
}

export function NoEncontrada() {
  useTitulo("No encontrada");
  const inicio = useInicio();
  return (
    <PantallaAparte
      tono="neutro"
      icono="buscar"
      nombre="Página no encontrada"
      titulo="No encontramos esta página"
      acciones={
        <EnlaceBoton to={inicio} variante="primario">
          Ir a mi inicio
        </EnlaceBoton>
      }
    >
      <p>La dirección no existe o cambió. Revisa que esté bien escrita o vuelve a tu inicio.</p>
    </PantallaAparte>
  );
}
