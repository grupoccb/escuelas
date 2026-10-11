// Las cinco pantallas de «Sistema» de Administración (README, pantalla 13): se leen como una sola cosa, con pestañas fijas arriba. Cada una conserva su dirección propia
// (se llega a ellas desde el menú de Administración y por enlaces guardados), así que las pestañas son enlaces, no paneles. Lo puro vive aquí; `sistema.tsx` lo dibuja.

export interface PestanaDeSistema {
  ruta: string;
  texto: string;
  /** El permiso que pide la pantalla (el mismo de su ruta en `app.tsx` y de `areas.ts`). */
  permiso: string;
}

export const PESTANAS_DE_SISTEMA: readonly PestanaDeSistema[] = [
  { ruta: "/admin/modulos", texto: "Módulos", permiso: "catalogo:escribir" },
  { ruta: "/admin/configuracion", texto: "Configuración", permiso: "catalogo:escribir" },
  { ruta: "/admin/automatizaciones", texto: "Automatizaciones", permiso: "catalogo:escribir" },
  { ruta: "/admin/textos", texto: "Textos del asistente", permiso: "catalogo:escribir" },
  { ruta: "/admin/bandeja", texto: "Bandeja del administrador", permiso: "registro_cambios:leer" },
];

/** Las pestañas que esa persona puede abrir, en su orden. */
export function pestanasVisibles(puede: (permiso: string) => boolean): PestanaDeSistema[] {
  return PESTANAS_DE_SISTEMA.filter((p) => puede(p.permiso));
}
