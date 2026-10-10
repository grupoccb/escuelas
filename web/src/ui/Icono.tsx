import type { NombreDeIcono } from "../navegacion.ts";

// Íconos propios, sin librería (docs/diseno/SISTEMA-VISUAL.md): de trazo, 1.6 de grosor, extremos redondeados, sin relleno, en una cuadrícula de 20 × 20. Heredan el color del texto.
// Decorativos (`aria-hidden`): el texto o el nombre accesible del botón siempre acompaña.
const TRAZOS: Record<NombreDeIcono, string[]> = {
  hoy: ["M5 4h10a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z", "M3 8h14M7 2.5v3M13 2.5v3"],
  lista: ["M3.5 5.5L5 7l2.5-3M3.5 11.5L5 13l2.5-3M10.5 6h6M10.5 12h6M10.5 16.5h6"],
  embudo: ["M3 4h14l-5.5 6.5V16l-3-1.5v-4L3 4z"],
  tareas: ["M6 3h8a3 3 0 013 3v8a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z", "M6.5 10l2.5 2.5 4.5-5"],
  pagos: ["M4.5 4.5h11a2 2 0 012 2v7a2 2 0 01-2 2h-11a2 2 0 01-2-2v-7a2 2 0 012-2z", "M2.5 8.5h15M5.5 12.5h3"],
  cuenta: ["M5 2.5h10v15l-2.5-1.5L10 17.5 7.5 16 5 17.5v-15z", "M8 7h4M8 10.5h4"],
  uniforme: ["M7 3L3 5.5l1.5 3L6.5 8v9h7V8l2 .5 1.5-3L13 3c-.4 1.3-1.5 2-3 2s-2.6-.7-3-2z"],
  ventas: ["M2.5 3.5h2l2 9h8.5l1.5-6H6", "M7.5 16.7a.7.7 0 100-1.4.7.7 0 000 1.4zM14 16.7a.7.7 0 100-1.4.7.7 0 000 1.4z"],
  corte: ["M6 2.5h8a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2v-11a2 2 0 012-2z", "M7 6.5h6M7 10h6M7 13.5h3"],
  alumnos: ["M7.5 10a3 3 0 100-6 3 3 0 000 6z", "M2.5 16.5c.6-2.8 2.5-4.2 5-4.2s4.4 1.4 5 4.2", "M13 4.3a3 3 0 010 5.4M15 12.6c1.4.6 2.2 1.9 2.5 3.9"],
  familias: ["M3 9.5L10 3l7 6.5", "M5 8.5V17h10V8.5", "M8.5 17v-4.5h3V17"],
  admin: ["M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z", "M16.2 10l1.3.8-1.3 2.2-1.5-.4a5.5 5.5 0 01-1.3.8l-.4 1.6H10.3l-.4-1.6a5.5 5.5 0 01-1.3-.8l-1.5.4-1.3-2.2L7 10a5.6 5.6 0 010-1.6l-1.3-.8 1.3-2.2 1.5.4a5.5 5.5 0 011.3-.8l.4-1.6h2.4l.4 1.6a5.5 5.5 0 011.3.8l1.5-.4 1.3 2.2-1.3.8c.1.5.1 1.1 0 1.6z"],
  tableros: ["M3 17h14M6 14V9M10 14V5M14 14v-3"],
  mas: ["M10 10.8a.8.8 0 100-1.6.8.8 0 000 1.6zM4.5 10.8a.8.8 0 100-1.6.8.8 0 000 1.6zM15.5 10.8a.8.8 0 100-1.6.8.8 0 000 1.6z"],
  salir: ["M8 3.5H5.5a1 1 0 00-1 1v11a1 1 0 001 1H8", "M12.5 6.5L16 10l-3.5 3.5M16 10H8"],
  chatwoot: ["M4 4.5h12a1 1 0 011 1v7.5a1 1 0 01-1 1H9l-4 3v-3H4a1 1 0 01-1-1V5.5a1 1 0 011-1z"],
  alerta: ["M10 3l8 14H2L10 3z", "M10 8.5v3.5M10 14.5h.01"],
  buscar: ["M9 14.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11z", "M13.5 13.5L17 17"],
  descargar: ["M10 3v9M6.5 8.5L10 12l3.5-3.5M4 15.5h12"],
  siguiente: ["M4 10h11M11 5.5l4.5 4.5-4.5 4.5"],
  campana: ["M5 8.5a5 5 0 0110 0c0 3.5 1.5 4.5 1.5 4.5h-13S5 12 5 8.5z", "M8.5 16a1.6 1.6 0 003 0"],
  cerrar: ["M5 5l10 10M15 5L5 15"],
  vacio: ["M3 11l2-6h10l2 6", "M3 11v4.5a1 1 0 001 1h12a1 1 0 001-1V11h-4.5a2.5 2.5 0 01-5 0H3z"],
  exito: ["M4.5 10.5l3.5 3.5 7.5-8"],
  info: ["M10 17a7 7 0 100-14 7 7 0 000 14z", "M10 9.2v4.3M10 6.7h.01"],
  imprimir: ["M6 7V3.5h8V7", "M6 14H4.5a1 1 0 01-1-1V8a1 1 0 011-1h11a1 1 0 011 1v5a1 1 0 01-1 1H14", "M6 11.5h8v5H6z"],
  lapiz: ["M4 16l.8-3.4L13.6 3.8a1.6 1.6 0 012.3 0l.3.3a1.6 1.6 0 010 2.3L7.4 15.2 4 16z", "M12 5.4l2.6 2.6"],
  papelera: ["M3.5 5.5h13M8 5.5V4a1 1 0 011-1h2a1 1 0 011 1v1.5", "M5 5.5l.7 10a1.5 1.5 0 001.5 1.4h5.6a1.5 1.5 0 001.5-1.4l.7-10", "M8.5 9v4.5M11.5 9v4.5"],
  pausa: ["M10 17a7 7 0 100-14 7 7 0 000 14z", "M8.2 7.6v4.8M11.8 7.6v4.8"],
  reanudar: ["M10 17a7 7 0 100-14 7 7 0 000 14z", "M8.6 7.3l4 2.7-4 2.7V7.3z"],
  enlace_externo: ["M8 4.5H5.5a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V12", "M11.5 4.5h4v4M15.5 4.5L9.5 10.5"],
  subir: ["M10 12.5v-9M6.5 7L10 3.5 13.5 7M4 15.5h12"],
  archivo: ["M5.5 2.5h6l3.5 3.5v10.5a1 1 0 01-1 1h-8.5a1 1 0 01-1-1v-13a1 1 0 011-1z", "M11.5 2.5V6H15M7.5 10h5M7.5 13h5"],
  atras: ["M16 10H5M9 5.5L4.5 10 9 14.5"],
  llave: ["M7.5 15.7a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z", "M9.8 10.2L16.5 3.5M14 6l2 2M12 8l1.5 1.5"],
  bloquear: ["M10 17a7 7 0 100-14 7 7 0 000 14z", "M5 5l10 10"],
  reactivar: ["M10 17a7 7 0 100-14 7 7 0 000 14z", "M6.8 10.3l2.2 2.2 4.2-4.6"],
  qr: ["M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5z", "M11.5 11.5h2v2h-2zM15 15h1.5v1.5H15zM14.5 11.5h2M11.5 15h1"],
  flecha_arriba: ["M10 16V4.5M5.5 9L10 4.5 14.5 9"],
  flecha_abajo: ["M10 4v11.5M5.5 11L10 15.5 14.5 11"],
  encender: ["M10 3v6.5", "M6 5.6a6 6 0 108 0"],
  cambiar: ["M3.5 7h12M12 3.5L15.5 7 12 10.5", "M16.5 13h-12M8 9.5L4.5 13 8 16.5"],
  mas_opciones: ["M5.5 10h.01M10 10h.01M14.5 10h.01"],
};

export function Icono({ nombre, tamano = 20 }: { nombre: NombreDeIcono; tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {TRAZOS[nombre].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
