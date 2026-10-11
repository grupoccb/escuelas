// Lo de arriba de las pantallas de «Sistema» (Módulos, Configuración, Automatizaciones, Textos del asistente y Bandeja): el regreso a Administración y las pestañas fijas
// (R7b; `Admin-sistema.dc.html`). Se pasa a `Pagina` en `encima`, así el título y su ayuda quedan debajo, como en el prototipo.

import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { pestanasVisibles } from "./sistema.ts";

/** El enlace «← Administración» del prototipo (texto simple con flecha, no un botón); también lo usa «Precios». */
export function RegresoAAdministracion() {
  return (
    <Link className="enlace-atras" to="/admin">
      <Icono nombre="atras" tamano={16} />
      Administración
    </Link>
  );
}

export function EncimaDeSistema() {
  const { puede } = useSesion();
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // En el celular las pestañas se desplazan: la que se está viendo se trae a la vista (solo en horizontal, sin mover la página).
  useEffect(() => {
    const barra = nav.current;
    const activa = barra?.querySelector<HTMLElement>('[aria-current="page"]');
    if (barra && activa) barra.scrollLeft = Math.max(0, activa.offsetLeft - (barra.clientWidth - activa.offsetWidth) / 2);
  }, [pathname]);
  return (
    <div className="sistema-encima">
      <RegresoAAdministracion />
      <nav ref={nav} className="pestanas sistema-pestanas" aria-label="Sistema">
        {pestanasVisibles(puede).map((p) => (
          <NavLink key={p.ruta} to={p.ruta} className="pestana-enlace">
            {p.texto}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
