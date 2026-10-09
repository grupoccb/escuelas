// El menú de administración: cada área que se edita sin tocar código. Se muestra lo que el rol puede administrar (por permisos, no por rol).

import { Link } from "react-router-dom";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { useTitulo } from "../../ui/hooks.ts";

interface Area {
  ruta: string;
  titulo: string;
  ayuda: string;
  permiso: string;
}

export const GRUPOS_DE_ADMINISTRACION: { titulo: string; areas: Area[] }[] = [
  {
    titulo: "Catálogo",
    areas: [
      { ruta: "/admin/verticales", titulo: "Disciplinas", ayuda: "Lo que imparte la escuela, sus etiquetas y su color.", permiso: "catalogo:escribir" },
      { ruta: "/admin/sucursales", titulo: "Sucursales", ayuda: "Dirección, zona horaria y qué disciplinas se imparten en cada una.", permiso: "catalogo:escribir" },
      { ruta: "/admin/programas", titulo: "Programas", ayuda: "Rango de edad, fecha de corte y traslape.", permiso: "catalogo:escribir" },
      { ruta: "/admin/grupos", titulo: "Grupos y horarios", ayuda: "Cupo, salón, instructor, lista de espera y días de clase.", permiso: "catalogo:escribir" },
      { ruta: "/admin/instructores", titulo: "Instructores y salones", ayuda: "Quién imparte y dónde.", permiso: "catalogo:escribir" },
      { ruta: "/admin/precios", titulo: "Precios", ayuda: "Inscripción y mensualidad con vigencia.", permiso: "catalogo:escribir" },
      { ruta: "/admin/promociones", titulo: "Promociones", ayuda: "Condición, alcance, beneficios, cupo y prioridad.", permiso: "catalogo:escribir" },
    ],
  },
  {
    titulo: "Canales y organización",
    areas: [
      { ruta: "/admin/canales", titulo: "Canales de WhatsApp", ayuda: "Números y bandejas de Chatwoot.", permiso: "catalogo:escribir" },
      { ruta: "/admin/configuracion", titulo: "Configuración", ayuda: "Topes de mensajes, vigencias, umbrales y modo de cierre.", permiso: "catalogo:escribir" },
    ],
  },
  {
    titulo: "Mensajería y usuarios",
    areas: [
      { ruta: "/admin/plantillas", titulo: "Plantillas de mensaje", ayuda: "Estado de aprobación, clase (servicio o marketing) y variables.", permiso: "catalogo:escribir" },
      { ruta: "/admin/automatizaciones", titulo: "Automatizaciones", ayuda: "Encender, desfases, intentos y horario de envío.", permiso: "catalogo:escribir" },
      { ruta: "/admin/usuarios", titulo: "Usuarios y roles", ayuda: "Altas, roles, sucursales, contraseñas y agente de Chatwoot.", permiso: "usuarios:administrar" },
      { ruta: "/admin/bandeja", titulo: "Bandeja del administrador", ayuda: "Eventos inesperados y tareas sin lead.", permiso: "registro_cambios:leer" },
    ],
  },
];

export default function Administracion() {
  useTitulo("Administración");
  const { puede } = useSesion();
  return (
    <Pagina titulo="Administración" subtitulo="Todo lo que la escuela puede cambiar sin tocar código.">
      {GRUPOS_DE_ADMINISTRACION.map((g) => {
        const areas = g.areas.filter((a) => puede(a.permiso));
        if (areas.length === 0) return null;
        return (
          <Tarjeta key={g.titulo} titulo={g.titulo}>
            <ul className="lista-tarjetas" data-prueba={`admin-${g.titulo}`}>
              {areas.map((a) => (
                <li key={a.ruta}>
                  <Link to={a.ruta}>
                    <strong>{a.titulo}</strong>
                  </Link>
                  <br />
                  <span className="muted">{a.ayuda}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        );
      })}
    </Pagina>
  );
}
