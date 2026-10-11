// Las secciones de la aplicación. La barra se arma con `GET /api/yo` (los permisos) y NO con el rol: el rol solo decide a dónde se llega al entrar.
//
// Para agregar una pantalla: (1) un archivo en `pantallas/<área>/`, (2) una entrada aquí con el permiso que la API pide para lo principal que muestra,
// (3) su <Route> en `app.tsx` envuelta en <RequierePermiso> con el módulo al que pertenece. Una URL directa sin permiso muestra «Sin acceso» y una de un módulo apagado
// muestra «No disponible»; las dos NO hacen ninguna petición. Un módulo apagado no aparece en la barra (V1).

import type { ModuloId, Modulos, Rol } from "./api/tipos.ts";

export type NombreDeIcono =
  | "hoy"
  | "lista"
  | "embudo"
  | "tareas"
  | "pagos"
  | "cuenta"
  | "uniforme"
  | "ventas"
  | "corte"
  | "alumnos"
  | "familias"
  | "admin"
  | "tableros"
  | "mas"
  | "salir"
  | "chatwoot"
  | "alerta"
  | "buscar"
  | "descargar"
  | "siguiente"
  | "campana"
  | "cerrar"
  | "vacio"
  | "exito"
  | "info"
  | "mas_opciones"
  | "atras"
  | "llave"
  | "bloquear"
  | "reactivar"
  | "qr"
  | "flecha_arriba"
  | "flecha_abajo"
  | "encender"
  | "imprimir"
  | "lapiz"
  | "papelera"
  | "pausa"
  | "reanudar"
  | "enlace_externo"
  | "subir"
  | "archivo"
  | "cambiar";

/** Los grupos de la barra lateral (R1, handoff v2): cada sección pertenece a uno. El orden de los grupos es el de `GRUPOS`; el de las secciones, el de `SECCIONES`. */
export type GrupoId = "clases" | "captacion" | "cobranza" | "escuela";

export const GRUPOS: readonly { id: GrupoId; etiqueta: string }[] = [
  { id: "clases", etiqueta: "Clases" },
  { id: "captacion", etiqueta: "Captación" },
  { id: "cobranza", etiqueta: "Cobranza" },
  { id: "escuela", etiqueta: "Escuela" },
];

export interface Seccion {
  id: string;
  ruta: string;
  etiqueta: string;
  icono: NombreDeIcono;
  /** Se muestra si el usuario tiene este permiso. */
  permiso: string;
  /** El módulo al que pertenece; apagado, la sección no aparece. */
  modulo: ModuloId;
  /** El grupo de la barra lateral donde se muestra (la barra inferior del celular no agrupa). */
  grupo: GrupoId;
}

export const SECCIONES: readonly Seccion[] = [
  { id: "hoy", ruta: "/hoy", etiqueta: "Hoy", icono: "hoy", permiso: "clases_muestra:leer", modulo: "clase_muestra", grupo: "clases" },
  { id: "pase", ruta: "/pase", etiqueta: "Pase de lista", icono: "lista", permiso: "asistencia:registrar", modulo: "operacion", grupo: "clases" },
  { id: "embudo", ruta: "/embudo", etiqueta: "Embudo", icono: "embudo", permiso: "leads:escribir", modulo: "captacion", grupo: "captacion" },
  { id: "tareas", ruta: "/tareas", etiqueta: "Tareas", icono: "tareas", permiso: "tareas:leer", modulo: "captacion", grupo: "captacion" },
  { id: "pagos", ruta: "/pagos", etiqueta: "Registrar pago", icono: "pagos", permiso: "pagos:registrar", modulo: "finanzas", grupo: "cobranza" },
  { id: "cuenta", ruta: "/cuenta", etiqueta: "Estado de cuenta", icono: "cuenta", permiso: "estado_cuenta:leer", modulo: "finanzas", grupo: "cobranza" },
  { id: "uniformes", ruta: "/uniformes", etiqueta: "Uniformes", icono: "uniforme", permiso: "beneficios:entregar", modulo: "finanzas", grupo: "cobranza" },
  { id: "ventas", ruta: "/ventas", etiqueta: "Ventas", icono: "ventas", permiso: "ventas:registrar", modulo: "finanzas", grupo: "cobranza" },
  { id: "corte", ruta: "/corte", etiqueta: "Cierre del día", icono: "corte", permiso: "pagos:registrar", modulo: "finanzas", grupo: "cobranza" },
  { id: "tableros", ruta: "/tableros", etiqueta: "Tableros", icono: "tableros", permiso: "reportes:clases_muestra", modulo: "tableros", grupo: "escuela" },
  { id: "alumnos", ruta: "/alumnos", etiqueta: "Alumnos", icono: "alumnos", permiso: "alumnos:leer", modulo: "inscripcion", grupo: "escuela" },
  { id: "familias", ruta: "/familias", etiqueta: "Familias", icono: "familias", permiso: "tutores:leer", modulo: "inscripcion", grupo: "escuela" },
  { id: "admin", ruta: "/admin", etiqueta: "Administración", icono: "admin", permiso: "catalogo:escribir", modulo: "captacion", grupo: "escuela" },
];

/** Las secciones agrupadas para la barra lateral: solo los grupos con alguna sección (los demás no se dibujan), en el orden de `GRUPOS`, y dentro de cada uno en el orden de `SECCIONES`. */
export function agruparSecciones(secciones: readonly Seccion[]): { id: GrupoId; etiqueta: string; secciones: Seccion[] }[] {
  return GRUPOS.map((g) => ({ ...g, secciones: secciones.filter((s) => s.grupo === g.id) })).filter((g) => g.secciones.length > 0);
}

/** A dónde llega cada rol al iniciar sesión (la primera de SUS secciones). */
export const INICIO_POR_ROL: Record<Rol, string> = { maestro: "/hoy", asesor: "/embudo", recepcion: "/pagos", administrador: "/embudo" };

/** Las secciones que el usuario ve: con el permiso (efectivo) Y con su módulo encendido. */
export function seccionesDe(permisos: readonly string[], modulos: Modulos): Seccion[] {
  return SECCIONES.filter((s) => permisos.includes(s.permiso) && modulos[s.modulo]);
}

/**
 * A dónde llega el usuario al entrar: la sección de inicio de su rol si la tiene disponible; si esa pertenece a un módulo apagado, la primera que sí tenga; y si no tiene ninguna, «Más»
 * (que muestra su sesión). Así nadie aterriza en una pantalla «No disponible».
 */
export function inicioDe(rol: Rol, permisos: readonly string[], modulos: Modulos): string {
  const disponibles = seccionesDe(permisos, modulos);
  const preferida = INICIO_POR_ROL[rol];
  if (disponibles.some((s) => s.ruta === preferida)) return preferida;
  return disponibles[0]?.ruta ?? "/mas";
}
