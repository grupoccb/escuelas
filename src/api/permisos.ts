// Matriz de permisos: el ÚNICO lugar donde se decide qué rol puede qué (B2).
//
// Un permiso se nombra `recurso:acción`. La matriz dice, por permiso, qué roles lo tienen. Un rol
// que no aparece NO lo tiene (se niega por omisión). Las rutas no preguntan por roles: declaran un
// permiso con `requierePermiso("leads:leer")`.
//
// Para agregar un permiso: una fila aquí. El test de `permisos.test.ts` y el de la tabla de rutas
// (`autorizacion.itest.ts`) recorren la matriz completa, así que una fila nueva sin ruta o una ruta
// con un permiso inexistente (no compila) se notan.
//
// Alcance (qué sucursales o grupos ve cada quien dentro de un permiso) NO se decide aquí: lo
// resuelve `alcance.ts` con los datos del usuario.

import { ROLES, type Rol } from "../auth/roles.ts";

export const MATRIZ_DE_PERMISOS = {
  // Personas y accesos
  "usuarios:administrar": ["administrador"],
  // Embudo y atención
  "leads:leer": ["administrador", "asesor", "recepcion"],
  "leads:escribir": ["administrador", "asesor"],
  "tareas:leer": ["administrador", "asesor"],
  "tareas:resolver": ["administrador", "asesor"],
  "conversaciones:leer": ["administrador", "asesor"],
  // Cotizador (C5): programa, grupos con lugar, precio y promociones para una edad. Lo usan quienes atienden al lead.
  "cotizador:leer": ["administrador", "asesor"],
  // Lista de espera (C9): quién espera un lugar en un grupo lleno. Quitar y mover es del asesor y el administrador.
  "lista_espera:leer": ["administrador", "asesor", "recepcion"],
  "lista_espera:escribir": ["administrador", "asesor"],
  // Clase muestra (D1): agendar, reprogramar y cancelar es del asesor y el administrador; el maestro solo lee las de SUS grupos.
  "clases_muestra:leer": ["administrador", "asesor", "maestro"],
  "clases_muestra:escribir": ["administrador", "asesor"],
  // Marcar asistió / no asistió (D4): el maestro de ese grupo, el asesor y el administrador.
  "clases_muestra:asistencia": ["administrador", "asesor", "maestro"],
  // Marcar «listo para cerrar» (F6): el maestro de ese grupo, el asesor y el administrador, en cualquier modo de cierre.
  "clases_muestra:listo_para_cerrar": ["administrador", "asesor", "maestro"],
  // Registro de la clase muestra (D5): lo captura el maestro de ese grupo, el asesor de la sucursal y el administrador. Recepción no lo ve. La
  // sección de salud sigue su propio marco (`salud:leer` / `salud:escribir`: administrador y maestro). Reabrir un registro cerrado: solo el administrador.
  "registro_muestra:leer": ["administrador", "asesor", "maestro"],
  "registro_muestra:escribir": ["administrador", "asesor", "maestro"],
  "registro_muestra:reabrir": ["administrador"],
  // Código QR de una campaña (E3): lo bajan quienes arman el material de captación, el administrador y el asesor (de sus sucursales).
  "campanas:qr": ["administrador", "asesor"],
  // Avisos al maestro (D2): los suyos. El administrador los tiene por regla (todos los permisos), pero solo ve los de su propio instructor, si lo es.
  "avisos_maestro:leer": ["administrador", "maestro"],
  "avisos_maestro:escribir": ["administrador", "maestro"],
  // Familia (F1): tutores y alumnos. El maestro lee a SUS alumnos (sin datos de contacto de la familia y sin salud: esa es `salud:leer`); nunca los tutores.
  "tutores:leer": ["administrador", "asesor", "recepcion"],
  "tutores:escribir": ["administrador", "asesor", "recepcion"],
  "alumnos:leer": ["administrador", "asesor", "recepcion", "maestro"],
  "alumnos:escribir": ["administrador", "asesor", "recepcion"],
  // Inscripción (F3): inscribir y, después, cambiar de grupo, congelar y dar de baja (F5) son del administrador, el asesor y recepción. El maestro lee las de SUS grupos.
  "inscripciones:leer": ["administrador", "asesor", "recepcion", "maestro"],
  "inscripciones:escribir": ["administrador", "asesor", "recepcion"],
  // Pase de lista (G1): lo toma el maestro de ese grupo, recepción (en el mostrador, también por QR) y el administrador; lo lee además el asesor. El alcance es el de las inscripciones.
  "asistencia:leer": ["administrador", "asesor", "recepcion", "maestro"],
  "asistencia:registrar": ["administrador", "recepcion", "maestro"],
  // Progresión (G3): registrar un peldaño a mano es del maestro de ese alumno y del administrador; corregir un registro equivocado, solo del administrador. Leerla es `alumnos:leer`.
  "progresion:escribir": ["administrador", "maestro"],
  "progresion:corregir": ["administrador"],
  // Eventos (G4): verlos es de todos los que atienden; crearlos y editarlos, del administrador; convocar, marcar el estatus y dar el resultado, del administrador, recepción
  // (cobra la cuota) y el maestro de SUS alumnos. El maestro no ve la cuota.
  "eventos:leer": ["administrador", "asesor", "recepcion", "maestro"],
  "eventos:escribir": ["administrador"],
  "eventos:participantes": ["administrador", "recepcion", "maestro"],
  // Conversión del lead en familia e inscripciones (F2): quien cierra la inscripción. El maestro tiene el permiso, pero la ruta solo se lo concede con el modo de cierre `maestro_en_sitio` (F6, `puedeConvertir`) y de SUS alumnos.
  "conversion:leer": ["administrador", "asesor", "maestro"],
  "conversion:ejecutar": ["administrador", "asesor", "maestro"],
  // Finanzas (H): el dinero NO lo ve el maestro. Cargos: lo lee el asesor; los escribe (cancela) recepción y el administrador.
  "cargos:leer": ["administrador", "asesor", "recepcion"],
  "cargos:escribir": ["administrador", "recepcion"],
  // Pagos (H2): registro manual. Registrar y cancelar, recepción y administrador; el asesor lee.
  "pagos:leer": ["administrador", "asesor", "recepcion"],
  "pagos:registrar": ["administrador", "recepcion"],
  "pagos:cancelar": ["administrador", "recepcion"],
  // Estado de cuenta de la familia (H3): solo lectura.
  "estado_cuenta:leer": ["administrador", "asesor", "recepcion"],
  // Beneficios diferidos (H4): la lista de lo que hay que entregar la lee el asesor; la entrega es de recepción y el administrador.
  "beneficios:leer": ["administrador", "asesor", "recepcion"],
  "beneficios:entregar": ["administrador", "recepcion"],
  // Productos y ventas (H5): el catálogo lo escribe el administrador; el inventario también recepción; las ventas las registra y anula recepción; el asesor lee; el maestro no ve precios.
  "productos:leer": ["administrador", "asesor", "recepcion"],
  "productos:escribir": ["administrador"],
  "productos:stock": ["administrador", "recepcion"],
  "ventas:leer": ["administrador", "asesor", "recepcion"],
  "ventas:registrar": ["administrador", "recepcion"],
  "ventas:anular": ["administrador", "recepcion"],
  // Oferta
  "grupos:leer": ["administrador", "asesor", "maestro", "recepcion"],
  "catalogo:leer": ["administrador", "asesor", "maestro", "recepcion"],
  "catalogo:escribir": ["administrador"],
  // Auditoría
  "registro_cambios:leer": ["administrador"],
  // Salud de menores (decisión 12). Recepción y asesor NO la leen ni la escriben: quien la necesita
  // es el maestro del grupo y el administrador. Ver src/sensibles/.
  "salud:leer": ["administrador", "maestro"],
  "salud:escribir": ["administrador", "maestro"],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof MATRIZ_DE_PERMISOS;

export const PERMISOS = Object.keys(MATRIZ_DE_PERMISOS) as Permiso[];

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return (MATRIZ_DE_PERMISOS[permiso] as readonly Rol[]).includes(rol);
}

/** Todos los permisos de un rol, en el orden de la matriz. */
export function permisosDe(rol: Rol): Permiso[] {
  return PERMISOS.filter((p) => tienePermiso(rol, p));
}

export { ROLES, type Rol };
