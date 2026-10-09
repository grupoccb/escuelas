// A qué módulo pertenece cada ruta de /api (V1). UNA tabla escrita a mano; el test `modulos-rutas.test.ts` recorre el router REAL y falla si una ruta no cae en ninguna fila
// (o cae en una que no es la acordada). Un módulo apagado hace que SUS rutas respondan 404 «Ruta no encontrada», igual que una ruta que no existe y para todos los roles,
// el administrador incluido (`guardaDeModulos`, montada una sola vez en `crearApiRouter`, después de autenticar y antes de cualquier ruta).
//
// Cómo leer los patrones: segmentos separados por «/»; `:x` es cualquier valor de un segmento; un `*` al final es «y todo lo que cuelgue de aquí». Gana la PRIMERA fila
// que coincide, así que las excepciones (un detalle que es de otro módulo) van antes que el árbol que las contiene.
//
// "captacion" es el módulo base: siempre encendido. Ahí vive también el catálogo y la configuración (lo que se prepara antes de encender un módulo).
//
// Para agregar una ruta: si cuelga de un árbol ya listado, nada (hereda su módulo); si es un árbol nuevo, una línea aquí.

import type { NextFunction, Request, Response } from "express";
import { leerModulos, type Modulo, type ModulosEncendidos } from "../modulos/index.ts";
import type { Rol } from "../auth/roles.ts";
import { contextoParaAutorizar } from "./contexto.ts";
import { noEncontrado } from "./errores.ts";
import { permisosDe, type Permiso } from "./permisos.ts";

const REGLAS: readonly (readonly [Modulo, readonly string[]])[] = [
  // ── Excepciones: un detalle de un árbol de captación o de catálogo que es de otro módulo ──────────────
  ["cotizador", ["/api/leads/:id/cotizaciones", "/api/cotizador", "/api/lista-espera", "/api/lista-espera/*"]],
  ["inscripcion", ["/api/leads/:id/conversion", "/api/leads/:id/convertir", "/api/leads/:id/prospectos/:pid/aceptaciones-del-hermano", "/api/reportes/ocupacion"]],
  ["clase_muestra", ["/api/documentos-legales/vigentes", "/api/salud/prospecto/:id"]],
  ["inscripcion", ["/api/salud/alumno/:id"]],
  ["tableros", ["/api/campanas/:id/gastos", "/api/campanas/:id/gastos/:gasto_id"]],
  ["operacion", ["/api/grupos/:id/pase", "/api/grupos/:id/asistencia/*", "/api/inscripciones/:id/asistencia", "/api/alumnos/:id/progresion", "/api/alumnos/:id/progresion/:progresion_id"]],
  ["finanzas", ["/api/tutores/:id/estado-cuenta", "/api/exportaciones/estado-cuenta", "/api/exportaciones/uniformes-por-entregar"]],
  // ── Los módulos ───────────────────────────────────────────────────────────────────────────────────────
  ["clase_muestra", ["/api/clases-muestra", "/api/clases-muestra/*", "/api/maestro/*"]],
  ["inscripcion", ["/api/tutores", "/api/tutores/*", "/api/alumnos", "/api/alumnos/*", "/api/familias/*", "/api/inscripciones", "/api/inscripciones/*"]],
  ["operacion", ["/api/niveles", "/api/niveles/*", "/api/eventos", "/api/eventos/*"]],
  ["finanzas", ["/api/cargos", "/api/cargos/*", "/api/pagos", "/api/pagos/*", "/api/beneficios/*", "/api/productos", "/api/productos/*", "/api/ventas", "/api/ventas/*"]],
  ["tableros", ["/api/reportes/*"]],
  // ── Base: captación, catálogo y configuración ─────────────────────────────────────────────────────────
  [
    "captacion",
    [
      "/api/sesion", "/api/yo", "/api/yo/*", "/api/modulos", "/api/configuracion", "/api/registro-cambios", "/api/salud-accesos", "/api/eventos-inesperados",
      "/api/usuarios", "/api/usuarios/*",
      "/api/grupos", "/api/grupos/:id",
      "/api/verticales", "/api/verticales/*", "/api/sucursales", "/api/sucursales/*", "/api/programas", "/api/programas/*", "/api/salones", "/api/salones/*",
      "/api/instructores", "/api/instructores/*", "/api/precios", "/api/precios/*", "/api/promociones", "/api/promociones/*",
      "/api/canales-whatsapp", "/api/canales-whatsapp/*", "/api/bandejas-chatwoot", "/api/bandejas-chatwoot/*", "/api/plantillas", "/api/plantillas/*",
      "/api/automatizaciones", "/api/automatizaciones/*", "/api/documentos-legales", "/api/documentos-legales/*", "/api/motivos-baja", "/api/motivos-baja/*",
      "/api/campanas", "/api/campanas/*", "/api/codigos-rastreo", "/api/codigos-rastreo/*", "/api/tareas", "/api/tareas/*", "/api/leads", "/api/leads/*", "/api/etapas",
      "/api/motivos-perdida", "/api/motivos-perdida/*", "/api/conversaciones", "/api/exportaciones/leads",
    ],
  ],
];

interface ReglaCompilada {
  modulo: Modulo;
  patron: string;
  re: RegExp;
}

function compilar(patron: string): RegExp {
  const prefijo = patron.endsWith("/*");
  const base = prefijo ? patron.slice(0, -2) : patron;
  const cuerpo = base
    .split("/")
    .map((s) => (s.startsWith(":") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${cuerpo}${prefijo ? "(?:/.*)?" : ""}$`);
}

const COMPILADAS: readonly ReglaCompilada[] = REGLAS.flatMap(([modulo, patrones]) => patrones.map((patron) => ({ modulo, patron, re: compilar(patron) })));

/** El módulo de una ruta concreta (`/api/leads/…`), o null si ninguna fila la reclama. */
export function moduloDeRuta(ruta: string): Modulo | null {
  const limpia = ruta.length > 1 && ruta.endsWith("/") ? ruta.slice(0, -1) : ruta;
  for (const r of COMPILADAS) if (r.re.test(limpia)) return r.modulo;
  return null;
}

/** La fila (patrón) que reclama una ruta concreta, o null (para el test de filas muertas). */
export function patronDeRuta(ruta: string): string | null {
  const limpia = ruta.length > 1 && ruta.endsWith("/") ? ruta.slice(0, -1) : ruta;
  return COMPILADAS.find((r) => r.re.test(limpia))?.patron ?? null;
}

/** Los patrones de la tabla (para el test). */
export const PATRONES_DE_MODULOS: readonly { modulo: Modulo; patron: string }[] = COMPILADAS.map(({ modulo, patron }) => ({ modulo, patron }));

/**
 * Montada una vez en `crearApiRouter`, después de `autenticar`: si la ruta es de un módulo apagado en la organización del usuario, responde exactamente
 * lo mismo que una ruta que no existe. Cuesta una consulta por petición (no se guarda en memoria: encender o apagar surte efecto en la siguiente).
 */
export function guardaDeModulos() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const modulo = moduloDeRuta(req.baseUrl + req.path);
    if (modulo !== null && modulo !== "captacion") {
      const encendidos = await leerModulos(contextoParaAutorizar(res).db);
      if (!encendidos[modulo]) throw noEncontrado("Ruta no encontrada");
    }
    next();
  };
}

/**
 * A qué módulo pertenece cada permiso. `GET /api/yo` entrega los permisos EFECTIVOS: los del rol menos los de los módulos apagados, así la interfaz (barra, botones, secciones) no
 * muestra nada de un módulo apagado sin tener que saber cuáles son. Es un `Record` completo: un permiso nuevo en la matriz sin módulo no compila. Los permisos del catálogo, la
 * configuración y la auditoría son de la captación (el módulo base). Los datos de salud (`salud:*`) también: los usan la clase muestra y la inscripción, y cada una de esas pantallas
 * y rutas se apaga con su módulo.
 */
export const MODULO_DE_PERMISO: Readonly<Record<Permiso, Modulo>> = {
  "usuarios:administrar": "captacion",
  "leads:leer": "captacion",
  "leads:escribir": "captacion",
  "tareas:leer": "captacion",
  "tareas:resolver": "captacion",
  "conversaciones:leer": "captacion",
  "cotizador:leer": "cotizador",
  "lista_espera:leer": "cotizador",
  "lista_espera:escribir": "cotizador",
  "clases_muestra:leer": "clase_muestra",
  "clases_muestra:escribir": "clase_muestra",
  "clases_muestra:asistencia": "clase_muestra",
  "clases_muestra:listo_para_cerrar": "clase_muestra",
  "registro_muestra:leer": "clase_muestra",
  "registro_muestra:escribir": "clase_muestra",
  "registro_muestra:reabrir": "clase_muestra",
  "campanas:qr": "captacion",
  "avisos_maestro:leer": "clase_muestra",
  "avisos_maestro:escribir": "clase_muestra",
  "tutores:leer": "inscripcion",
  "tutores:escribir": "inscripcion",
  "alumnos:leer": "inscripcion",
  "alumnos:escribir": "inscripcion",
  "inscripciones:leer": "inscripcion",
  "inscripciones:escribir": "inscripcion",
  "asistencia:leer": "operacion",
  "asistencia:registrar": "operacion",
  "progresion:escribir": "operacion",
  "progresion:corregir": "operacion",
  "eventos:leer": "operacion",
  "eventos:escribir": "operacion",
  "eventos:participantes": "operacion",
  "conversion:leer": "inscripcion",
  "conversion:ejecutar": "inscripcion",
  "cargos:leer": "finanzas",
  "cargos:escribir": "finanzas",
  "pagos:leer": "finanzas",
  "pagos:registrar": "finanzas",
  "pagos:cancelar": "finanzas",
  "estado_cuenta:leer": "finanzas",
  "beneficios:leer": "finanzas",
  "beneficios:entregar": "finanzas",
  "productos:leer": "finanzas",
  "productos:escribir": "finanzas",
  "productos:stock": "finanzas",
  "ventas:leer": "finanzas",
  "ventas:registrar": "finanzas",
  "ventas:anular": "finanzas",
  "reportes:clases_muestra": "tableros",
  "reportes:costos": "tableros",
  "reportes:ejecutivo": "tableros",
  "reportes:ocupacion": "inscripcion",
  "gastos_campana:leer": "tableros",
  "gastos_campana:escribir": "tableros",
  "grupos:leer": "captacion",
  "catalogo:leer": "captacion",
  "catalogo:escribir": "captacion",
  "registro_cambios:leer": "captacion",
  "salud:leer": "captacion",
  "salud:escribir": "captacion",
};

/** Los permisos del rol que siguen valiendo con los módulos que la organización tiene encendidos. */
export function permisosEfectivos(rol: Rol, modulos: ModulosEncendidos): Permiso[] {
  return permisosDe(rol).filter((p) => modulos[MODULO_DE_PERMISO[p]]);
}
