import type { NombreDeIcono } from "../navegacion.ts";

// Iconos propios, sin librería: trazos simples de 24×24 que heredan el color del texto. Decorativos (`aria-hidden`): el texto siempre acompaña.
const TRAZOS: Record<NombreDeIcono, string> = {
  hoy: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM9 14l2 2 4-4",
  lista: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  embudo: "M3 5h18l-7 8v6l-4-2v-4z",
  tareas: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM8 12l3 3 5-6",
  pagos: "M3 7h18v10H3zM3 11h18M7 15h3",
  cuenta: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  uniforme: "M8 3l-5 3 2 4 3-1v11h8V9l3 1 2-4-5-3a4 4 0 01-8 0z",
  ventas: "M3 4h2l2 12h11l2-8H7M10 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z",
  mas: "M5 12h.01M12 12h.01M19 12h.01",
  salir: "M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5M15 8l4 4-4 4M19 12H9",
  chatwoot: "M4 5h16v11H9l-5 4z",
  alerta: "M12 3l10 18H2zM12 10v5M12 18h.01",
};

export function Icono({ nombre, tamano = 22 }: { nombre: NombreDeIcono; tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
