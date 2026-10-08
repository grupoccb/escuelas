// El expediente del alumno (G5): todo lo de la sección 9 del contexto en UNA respuesta — trayectoria, económico, operativo y comercial. Solo lee (no escribe nada)
// y solo calcula con código determinista (invariante 10). La salud de menores NO va aquí: se lee aparte con `GET /api/salud/alumno/:id` (permiso, motivo y registro
// de accesos; decisión 12). Lo que depende de la etapa H (estado de cuenta, cartera vencida, productos) entra por las interfaces de `proveedores.ts`.
//
// Por rol: el administrador, el asesor y recepción ven las cuatro secciones; el MAESTRO solo ve a sus alumnos y SIN importes (EF-03): recibe la trayectoria y lo
// operativo, y `economico` y `comercial` vienen en `null` (el origen del lead y el motivo de baja tampoco son suyos).

import { hoyEn } from "../asistencia/pase.ts";
import { calcularDerivados, presentarDerivados } from "../asistencia/derivados.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import type { Consultas } from "../datos/alcance.ts";
import { hermanosInscritos } from "../inscripciones/hermanos.ts";
import { proximoCorte } from "../inscripciones/corte.ts";
import { aTexto, deDecimal, restar, sumar } from "../lib/dinero.ts";
import { elegibilidadDe } from "../progresion/elegibilidad.ts";
import { historialDeVertical } from "../progresion/progresion.ts";
import type { ProveedoresDelExpediente } from "./proveedores.ts";

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const DIA_MS = 86_400_000;

/** Días y meses completos de `desde` a `hasta` (fechas `AAAA-MM-DD`, ambas en el mismo calendario local). Pura. */
export function antiguedadEntre(desde: string, hasta: string): { dias: number; meses: number } {
  const [a1, m1, d1] = desde.split("-").map(Number) as [number, number, number];
  const [a2, m2, d2] = hasta.split("-").map(Number) as [number, number, number];
  const dias = Math.max(0, Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / DIA_MS));
  const meses = Math.max(0, (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
  return { dias, meses };
}

export interface OpcionesDelExpediente {
  ahora: Date;
  rol: "administrador" | "asesor" | "recepcion" | "maestro";
  proveedores: ProveedoresDelExpediente;
  /** Condición de Prisma sobre `evento` (el alcance de quien consulta) para el próximo examen. */
  dondeEvento?: Record<string, unknown>;
}

/** El expediente del alumno, o null si no existe. El alcance (¿puede verlo?) lo decide quien llama antes. */
export async function armarExpediente(db: Consultas, alumnoId: string, o: OpcionesDelExpediente) {
  const alumno = await db.alumno.findFirst({ where: { id: alumnoId }, select: { id: true, nombre: true, apellidos: true, fecha_nacimiento: true, estatus: true, sucursal_id: true } });
  if (!alumno) return null;
  const esMaestro = o.rol === "maestro";

  const inscripciones = await db.inscripcion.findMany({
    where: { alumno_id: alumnoId },
    select: {
      id: true,
      estatus: true,
      fecha_inicio: true,
      fecha_baja: true,
      dia_corte_pago: true,
      precio_mensualidad_aplicado: true,
      descuento_mensualidad_aplicado: true,
      meses_gratis_aplicados: true,
      lead_id: true,
      prospecto_id: true,
      creado_en: true,
      grupo: { select: { id: true, nombre: true, programa: { select: { id: true, nombre: true, vertical_id: true, sucursal_id: true, vertical: { select: { id: true, nombre: true, etiqueta_progresion: true, etiqueta_evento: true } }, sucursal: { select: { nombre: true, zona_horaria: true } } } } } },
      promocion: { select: { id: true, nombre: true } },
      motivo_baja: { select: { id: true, codigo: true, nombre: true } },
      aplicaciones: { where: { eliminado_en: null }, select: { id: true, estatus: true, descuento: true, meses_gratis: true, fecha_entrega: true, beneficio: { select: { tipo: true, descripcion: true } }, promocion: { select: { nombre: true } } } },
    },
    orderBy: [{ fecha_inicio: "asc" }, { creado_en: "asc" }, { id: "asc" }],
  });
  const zona = inscripciones[0]?.grupo.programa.sucursal.zona_horaria ?? "America/Mexico_City";
  const hoy = hoyEn(zona, o.ahora);
  const vigentes = inscripciones.filter((i) => i.estatus === "activa");

  // ── Trayectoria ──────────────────────────────────────────────────────────────────────────────────
  const inicio = inscripciones[0] ? iso(inscripciones[0].fecha_inicio) : null;
  const movimientos = await db.inscripcion_movimiento.findMany({
    where: { inscripcion_id: { in: inscripciones.map((i) => i.id) }, tipo: "cambio_grupo" },
    select: { inscripcion_id: true, fecha: true, secuencia: true, grupo_anterior: { select: { id: true, nombre: true } }, grupo_nuevo: { select: { id: true, nombre: true } } },
    orderBy: [{ fecha: "asc" }, { secuencia: "asc" }],
  });
  const verticales = new Map<string, { id: string; nombre: string; etiqueta_progresion: string | null; etiqueta_evento: string | null }>();
  for (const i of inscripciones) verticales.set(i.grupo.programa.vertical_id, i.grupo.programa.vertical);
  const niveles = [];
  const proximos = [];
  for (const v of verticales.values()) {
    const actual = (await historialDeVertical(db, alumnoId, v.id))[0] ?? null;
    niveles.push({ vertical: { id: v.id, nombre: v.nombre, etiqueta_progresion: v.etiqueta_progresion }, nivel: actual ? { id: actual.nivel.id, nombre: actual.nivel.nombre, color_hex: actual.nivel.colorHex } : null, fecha_obtenido: actual?.fechaObtenido ?? null });
    // Próximo examen: el evento que sube de peldaño más cercano de esa vertical, en las sucursales donde el alumno tiene una inscripción activa.
    const sucursales = [...new Set(vigentes.filter((i) => i.grupo.programa.vertical_id === v.id).map((i) => i.grupo.programa.sucursal_id))];
    if (sucursales.length === 0) continue;
    const ev = await db.evento.findFirst({
      where: { AND: [o.dondeEvento ?? {}, { vertical_id: v.id, otorga_progresion: true, sucursal_id: { in: sucursales }, fecha: { gte: new Date(`${hoy}T00:00:00.000Z`) } }] },
      select: { id: true, nombre: true, tipo: true, fecha: true },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });
    const e = await elegibilidadDe(db, alumnoId, v.id);
    const convocado = ev ? (await db.evento_alumno.findFirst({ where: { evento_id: ev.id, alumno_id: alumnoId }, select: { estatus: true } }))?.estatus ?? null : null;
    proximos.push({
      vertical: { id: v.id, nombre: v.nombre, etiqueta_evento: v.etiqueta_evento },
      evento: ev ? { id: ev.id, nombre: ev.nombre, tipo: ev.tipo, fecha: iso(ev.fecha), estatus_del_alumno: convocado } : null,
      elegibilidad: { elegible: e.elegible, motivo: e.motivo, clases_cumplidas: e.clasesCumplidas, clases_requeridas: e.clasesRequeridas, faltan: e.faltan, siguiente_nivel: e.siguiente ? { id: e.siguiente.id, nombre: e.siguiente.nombre } : null },
    });
  }
  const trayectoria = {
    fecha_de_inicio: inicio,
    antiguedad: inicio ? antiguedadEntre(inicio, hoy) : null,
    grupo_actual: vigentes[0] ? { id: vigentes[0].grupo.id, nombre: vigentes[0].grupo.nombre } : null,
    inscripciones: inscripciones.map((i) => ({
      id: i.id,
      estatus: i.estatus,
      fecha_inicio: iso(i.fecha_inicio),
      fecha_baja: i.fecha_baja ? iso(i.fecha_baja) : null,
      grupo: { id: i.grupo.id, nombre: i.grupo.nombre },
      programa: { id: i.grupo.programa.id, nombre: i.grupo.programa.nombre },
      vertical: { id: i.grupo.programa.vertical_id, nombre: i.grupo.programa.vertical.nombre },
      sucursal: { id: i.grupo.programa.sucursal_id, nombre: i.grupo.programa.sucursal.nombre },
    })),
    historial_de_cambios_de_grupo: movimientos.map((x) => ({ inscripcion_id: x.inscripcion_id, fecha: iso(x.fecha), grupo_anterior: x.grupo_anterior, grupo_nuevo: x.grupo_nuevo })),
    niveles,
    proximo_examen: proximos,
  };

  // ── Operativo ────────────────────────────────────────────────────────────────────────────────────
  const umbral = (await leerConfiguracion(db)).umbralFaltasConsecutivas;
  const filas = await db.asistencia.findMany({ where: { inscripcion_id: { in: inscripciones.map((i) => i.id) } }, select: { inscripcion_id: true, fecha: true, estatus: true } });
  const porInscripcion = new Map<string, { fecha: string; estatus: (typeof filas)[number]["estatus"] }[]>();
  for (const f of filas) porInscripcion.set(f.inscripcion_id, [...(porInscripcion.get(f.inscripcion_id) ?? []), { fecha: iso(f.fecha), estatus: f.estatus }]);
  const derivadosDe = vigentes.map((i) => ({ inscripcion_id: i.id, grupo: i.grupo.nombre, ...presentarDerivados(calcularDerivados(porInscripcion.get(i.id) ?? [], hoy), umbral) }));
  const juntas = calcularDerivados(vigentes.flatMap((i) => porInscripcion.get(i.id) ?? []), hoy);
  const participaciones = await db.evento_alumno.findMany({
    where: { alumno_id: alumnoId },
    select: { estatus: true, resultado: true, evento: { select: { id: true, nombre: true, tipo: true, fecha: true } }, nivel_otorgado: { select: { id: true, nombre: true } } },
    orderBy: [{ evento: { fecha: "desc" } }, { id: "desc" }],
  });
  const productos = await o.proveedores.productos.productosComprados(db, alumnoId);
  const operativo = {
    asistencia: {
      porcentaje_30_dias: juntas.porcentaje,
      racha_de_faltas: Math.max(0, ...derivadosDe.map((d) => d.racha_de_faltas)),
      umbral_de_faltas: umbral,
      por_inscripcion: derivadosDe,
    },
    eventos: participaciones.map((p) => ({ evento: { id: p.evento.id, nombre: p.evento.nombre, tipo: p.evento.tipo, fecha: iso(p.evento.fecha) }, estatus: p.estatus, resultado: p.resultado, nivel_otorgado: p.nivel_otorgado })),
    productos_comprados: productos,
  };

  // El maestro no ve importes ni el origen comercial (EF-03).
  if (esMaestro) return { alumno: { id: alumno.id, nombre: alumno.nombre, apellidos: alumno.apellidos, estatus: alumno.estatus }, trayectoria, economico: null, operativo, comercial: null, salud: { incluida: false, endpoint: `/api/salud/alumno/${alumnoId}` } };

  // ── Económico ────────────────────────────────────────────────────────────────────────────────────
  const mensualidadDe = (i: (typeof inscripciones)[number]) => restar(deDecimal(i.precio_mensualidad_aplicado), deDecimal(i.descuento_mensualidad_aplicado));
  const cuenta = await o.proveedores.economico.estadoDeCuenta(db, alumnoId, o.ahora);
  const economico = {
    mensualidad_vigente: {
      total: aTexto(sumar(...vigentes.map(mensualidadDe))),
      por_inscripcion: vigentes.map((i) => ({ inscripcion_id: i.id, grupo: i.grupo.nombre, precio_de_lista: aTexto(deDecimal(i.precio_mensualidad_aplicado)), descuento: aTexto(deDecimal(i.descuento_mensualidad_aplicado)), mensualidad: aTexto(mensualidadDe(i)), meses_gratis: i.meses_gratis_aplicados })),
    },
    dia_de_corte: vigentes.map((i) => ({ inscripcion_id: i.id, dia: i.dia_corte_pago, proximo_corte: proximoCorte(i.dia_corte_pago, hoy) })),
    promocion_aplicada: inscripciones
      .filter((i) => i.promocion)
      .map((i) => ({ inscripcion_id: i.id, promocion: i.promocion, beneficios: i.aplicaciones.map((a) => ({ tipo: a.beneficio.tipo, descripcion: a.beneficio.descripcion, descuento: aTexto(deDecimal(a.descuento)), meses_gratis: a.meses_gratis, estatus: a.estatus })) })),
    beneficios_pendientes: inscripciones
      .filter((i) => i.estatus !== "baja")
      .flatMap((i) => i.aplicaciones.filter((a) => a.estatus === "pendiente").map((a) => ({ inscripcion_id: i.id, promocion: a.promocion.nombre, tipo: a.beneficio.tipo, descripcion: a.beneficio.descripcion }))),
    estado_de_cuenta: cuenta,
    antiguedad_cartera_vencida: cuenta.disponible ? { dias: cuenta.antiguedadCarteraVencidaDias, vencido: cuenta.vencido } : { disponible: false, motivo: cuenta.motivo },
  };

  // ── Comercial ────────────────────────────────────────────────────────────────────────────────────
  const leadIds = [...new Set(inscripciones.map((i) => i.lead_id).filter((x): x is string => x !== null))];
  const leads = await db.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, creado_en: true, atribucion: true, campana: { select: { id: true, nombre: true, origen: true } }, conversaciones: { select: { bandeja_chatwoot: { select: { canal_whatsapp: { select: { nombre_publico: true } } } } }, orderBy: { creado_en: "asc" }, take: 1 } },
    orderBy: [{ creado_en: "asc" }, { id: "asc" }],
  });
  const hermanos = [];
  for (const h of await hermanosInscritos(db, alumnoId)) {
    const a = await db.alumno.findFirst({ where: { id: h.alumnoId }, select: { id: true, nombre: true, apellidos: true, inscripciones: { where: { estatus: "activa", eliminado_en: null }, select: { grupo: { select: { programa: { select: { vertical: { select: { id: true, nombre: true } } } } } } } } } });
    if (a) hermanos.push({ alumno_id: a.id, alumno: `${a.nombre} ${a.apellidos}`, verticales: [...new Map(a.inscripciones.map((x) => [x.grupo.programa.vertical.id, x.grupo.programa.vertical])).values()] });
  }
  const comercial = {
    origen_del_lead: leads.map((l) => {
      const at = (typeof l.atribucion === "object" && l.atribucion !== null && !Array.isArray(l.atribucion) ? l.atribucion : {}) as Record<string, unknown>;
      const utm = typeof at["utm"] === "object" && at["utm"] !== null && !Array.isArray(at["utm"]) ? Object.fromEntries(Object.entries(at["utm"] as Record<string, unknown>).filter(([, v]) => typeof v === "string")) : null;
      return {
        lead_id: l.id,
        campana: l.campana,
        canal: l.conversaciones[0]?.bandeja_chatwoot.canal_whatsapp.nombre_publico ?? null,
        fuente: typeof at["fuente"] === "string" ? at["fuente"] : typeof at["anuncio_id"] === "string" ? "anuncio" : null,
        anuncio_id: typeof at["anuncio_id"] === "string" ? at["anuncio_id"] : null,
        codigo_de_rastreo: typeof at["codigo_rastreo"] === "string" ? at["codigo_rastreo"] : null,
        utm,
      };
    }),
    dias_para_cerrar: leads
      .map((l) => {
        const primera = inscripciones.filter((i) => i.lead_id === l.id).map((i) => i.creado_en.getTime()).sort((a, b) => a - b)[0];
        return primera === undefined ? null : { lead_id: l.id, dias: antiguedadEntre(hoyEn(zona, l.creado_en), hoyEn(zona, new Date(primera))).dias };
      })
      .filter((x) => x !== null),
    hermanos_inscritos: hermanos,
    motivo_de_baja: inscripciones.filter((i) => i.estatus === "baja").map((i) => ({ inscripcion_id: i.id, fecha_baja: i.fecha_baja ? iso(i.fecha_baja) : null, motivo: i.motivo_baja })),
  };

  return { alumno: { id: alumno.id, nombre: alumno.nombre, apellidos: alumno.apellidos, estatus: alumno.estatus }, trayectoria, economico, operativo, comercial, salud: { incluida: false, endpoint: `/api/salud/alumno/${alumnoId}` } };
}
