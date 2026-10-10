// Las pantallas de Administración, agrupadas, con las palabras con las que una persona las buscaría. La pantalla de inicio (`Administracion.tsx`) las muestra y las filtra con su
// buscador; `areas.test.ts` comprueba que cada una tenga su ruta en `app.tsx` y que ninguna se repita.

export interface Area {
  ruta: string;
  titulo: string;
  ayuda: string;
  permiso: string;
  /** Otras formas de pedirla («contraseña» para Usuarios, «excel» para Cargar catálogo): solo para el buscador. */
  palabras?: string;
}

export const GRUPOS_DE_ADMINISTRACION: { titulo: string; areas: Area[] }[] = [
  {
    titulo: "Catálogo",
    areas: [
      { ruta: "/admin/catalogo", titulo: "Cargar catálogo", ayuda: "Sube tus hojas de Excel con sucursales, programas, grupos, horarios y precios; se revisan antes de guardar.", permiso: "catalogo:escribir", palabras: "excel csv importar subir plantillas archivo" },
      { ruta: "/admin/verticales", titulo: "Disciplinas", ayuda: "Lo que imparte la escuela, sus etiquetas y su color.", permiso: "catalogo:escribir", palabras: "materias clases actividades" },
      { ruta: "/admin/sucursales", titulo: "Sucursales", ayuda: "Dirección, zona horaria y qué disciplinas se imparten en cada una.", permiso: "catalogo:escribir", palabras: "sedes planteles zona horaria direccion" },
      { ruta: "/admin/programas", titulo: "Programas", ayuda: "Rango de edad, fecha de corte y traslape.", permiso: "catalogo:escribir", palabras: "edades niveles" },
      { ruta: "/admin/grupos", titulo: "Grupos y horarios", ayuda: "Cupo, salón, instructor, lista de espera y días de clase.", permiso: "catalogo:escribir", palabras: "cupo clases dias lista de espera" },
      { ruta: "/admin/instructores", titulo: "Instructores y salones", ayuda: "Quién imparte y dónde.", permiso: "catalogo:escribir", palabras: "maestros profesores aulas" },
      { ruta: "/admin/precios", titulo: "Precios", ayuda: "Inscripción y mensualidad con vigencia.", permiso: "catalogo:escribir", palabras: "costos mensualidad cuota cambiar precio" },
      { ruta: "/admin/promociones", titulo: "Promociones", ayuda: "Condición, alcance, beneficios, cupo y prioridad.", permiso: "catalogo:escribir", palabras: "descuentos ofertas hermanos" },
    ],
  },
  {
    titulo: "Canales y organización",
    areas: [
      { ruta: "/admin/canales", titulo: "Canales de WhatsApp", ayuda: "Números y bandejas de Chatwoot.", permiso: "catalogo:escribir", palabras: "numero telefono bandeja" },
      { ruta: "/admin/campanas", titulo: "Campañas y códigos QR", ayuda: "Dónde anuncias y el QR para imprimir: así sabes de dónde llega cada familia.", permiso: "catalogo:escribir", palabras: "anuncios publicidad facebook instagram qr volantes origen" },
      { ruta: "/admin/modulos", titulo: "Módulos", ayuda: "Qué partes del sistema tiene encendidas la escuela: cotizador, clase muestra, inscripción, operación, finanzas y tableros.", permiso: "catalogo:escribir", palabras: "encender apagar activar funciones" },
      { ruta: "/admin/configuracion", titulo: "Configuración", ayuda: "Horario de los mensajes automáticos, topes de mensajes, tiempos del asistente, vigencias, umbrales y modo de cierre.", permiso: "catalogo:escribir", palabras: "horario de envio ajustes tiempos" },
      { ruta: "/admin/textos", titulo: "Textos del asistente", ayuda: "Lo que el asistente de WhatsApp dice en cada paso, a la manera de la escuela.", permiso: "catalogo:escribir", palabras: "bot mensajes saludo preguntas" },
      { ruta: "/admin/etapas", titulo: "Etapas del embudo", ayuda: "Nombres, orden y días sin movimiento de cada etapa; agrega las tuyas.", permiso: "catalogo:escribir", palabras: "pipeline seguimiento leads" },
      { ruta: "/admin/motivos", titulo: "Motivos de pérdida y de baja", ayuda: "Por qué se va una familia, en tus palabras.", permiso: "catalogo:escribir", palabras: "razones perdidas bajas" },
    ],
  },
  {
    titulo: "Mensajería y usuarios",
    areas: [
      { ruta: "/admin/plantillas", titulo: "Plantillas de mensaje", ayuda: "Estado de aprobación, clase (servicio o marketing) y variables.", permiso: "catalogo:escribir", palabras: "whatsapp aprobadas twilio meta" },
      { ruta: "/admin/automatizaciones", titulo: "Automatizaciones", ayuda: "Encender, desfases, intentos y horario de envío.", permiso: "catalogo:escribir", palabras: "recordatorios avisos automaticos" },
      { ruta: "/admin/usuarios", titulo: "Usuarios y roles", ayuda: "Altas, roles, sucursales, contraseñas y agente de Chatwoot.", permiso: "usuarios:administrar", palabras: "personas contrasena restablecer desactivar asesor maestro recepcion" },
      { ruta: "/admin/bandeja", titulo: "Bandeja del administrador", ayuda: "Eventos inesperados y tareas sin lead.", permiso: "registro_cambios:leer", palabras: "errores pendientes revisar" },
    ],
  },
];

/** Las áreas que coinciden con lo que se escribió (título, ayuda y palabras clave; sin acentos ni mayúsculas), conservando los grupos; los grupos vacíos no salen. */
export function filtrarAreas(grupos: typeof GRUPOS_DE_ADMINISTRACION, busqueda: string, puede: (permiso: string) => boolean, coincide: (pajar: string, busqueda: string) => boolean): typeof GRUPOS_DE_ADMINISTRACION {
  return grupos
    .map((g) => ({ titulo: g.titulo, areas: g.areas.filter((a) => puede(a.permiso) && coincide(`${a.titulo} ${a.ayuda} ${a.palabras ?? ""}`, busqueda)) }))
    .filter((g) => g.areas.length > 0);
}
