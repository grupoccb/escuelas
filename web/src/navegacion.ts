// Las secciones de la aplicación. La barra se arma con `GET /api/yo` (los permisos) y NO con el rol: el rol solo decide a dónde se llega al entrar.
//
// Para agregar una pantalla: (1) un archivo en `pantallas/<área>/`, (2) una entrada aquí con el permiso que la API pide para lo principal que muestra,
// (3) su <Route> en `app.tsx` envuelta en <RequierePermiso>. Una URL directa sin permiso muestra «Sin acceso» y NO hace ninguna petición.

import type { Rol } from "./api/tipos.ts";

export type NombreDeIcono = "hoy" | "lista" | "embudo" | "tareas" | "pagos" | "cuenta" | "uniforme" | "ventas" | "familia" | "admin" | "mas" | "salir" | "chatwoot" | "alerta";

export interface Seccion {
  id: string;
  ruta: string;
  etiqueta: string;
  icono: NombreDeIcono;
  /** Se muestra si el usuario tiene este permiso. */
  permiso: string;
}

export const SECCIONES: readonly Seccion[] = [
  { id: "hoy", ruta: "/hoy", etiqueta: "Hoy", icono: "hoy", permiso: "clases_muestra:leer" },
  { id: "pase", ruta: "/pase", etiqueta: "Pase de lista", icono: "lista", permiso: "asistencia:registrar" },
  { id: "embudo", ruta: "/embudo", etiqueta: "Embudo", icono: "embudo", permiso: "leads:escribir" },
  { id: "tareas", ruta: "/tareas", etiqueta: "Tareas", icono: "tareas", permiso: "tareas:leer" },
  { id: "pagos", ruta: "/pagos", etiqueta: "Registrar pago", icono: "pagos", permiso: "pagos:registrar" },
  { id: "cuenta", ruta: "/cuenta", etiqueta: "Estado de cuenta", icono: "cuenta", permiso: "estado_cuenta:leer" },
  { id: "uniformes", ruta: "/uniformes", etiqueta: "Uniformes", icono: "uniforme", permiso: "beneficios:entregar" },
  { id: "ventas", ruta: "/ventas", etiqueta: "Ventas", icono: "ventas", permiso: "ventas:registrar" },
  { id: "alumnos", ruta: "/alumnos", etiqueta: "Alumnos", icono: "familia", permiso: "alumnos:leer" },
  { id: "familias", ruta: "/familias", etiqueta: "Familias", icono: "familia", permiso: "tutores:leer" },
  { id: "admin", ruta: "/admin", etiqueta: "Administración", icono: "admin", permiso: "catalogo:escribir" },
];

/** A dónde llega cada rol al iniciar sesión (la primera de SUS secciones). */
export const INICIO_POR_ROL: Record<Rol, string> = { maestro: "/hoy", asesor: "/embudo", recepcion: "/pagos", administrador: "/embudo" };

export function seccionesDe(permisos: readonly string[]): Seccion[] {
  return SECCIONES.filter((s) => permisos.includes(s.permiso));
}
