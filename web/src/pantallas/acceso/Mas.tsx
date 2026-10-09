import { Link } from "react-router-dom";
import { seccionesDe } from "../../navegacion.ts";
import { useSesion, useYo } from "../../sesion/SesionContext.tsx";
import { Boton, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useTitulo } from "../../ui/hooks.ts";

const ROLES = { administrador: "Administrador", asesor: "Asesor", maestro: "Maestro", recepcion: "Recepción" } as const;

/** Todas las secciones del usuario (la barra inferior del celular no cabe con más de cinco) y su sesión. */
export function Mas() {
  useTitulo("Más");
  const yo = useYo();
  const { salir } = useSesion();
  return (
    <Pagina titulo="Más">
      <Tarjeta titulo="Secciones">
        <ul className="lista-tarjetas">
          {seccionesDe(yo.permisos).map((s) => (
            <li key={s.id}>
              <Link className="fila" to={s.ruta}>
                <Icono nombre={s.icono} /> {s.etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta titulo="Mi sesión">
        <dl className="datos">
          <dt>Usuario</dt>
          <dd>{yo.usuario.nombre}</dd>
          <dt>Correo</dt>
          <dd>{yo.usuario.correo}</dd>
          <dt>Rol</dt>
          <dd>{ROLES[yo.usuario.rol]}</dd>
          <dt>Sucursales</dt>
          <dd>{yo.sucursales.map((s) => s.nombre).join(", ") || "—"}</dd>
        </dl>
        <Boton variante="peligro" onClick={() => void salir()}>
          Cerrar sesión
        </Boton>
      </Tarjeta>
    </Pagina>
  );
}
