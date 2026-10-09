// La capa de base de la carga del catálogo (V6): lee lo que ya existe, aplica el plan y orquesta simulación y aplicación. Todo por el scope de organización (invariante 1);
// nada de SQL crudo ni de `organizacion_id` a mano.
//
//   SIMULACIÓN: lee (en una transacción de solo lectura, con una foto consistente) y planifica. No escribe NADA: ni el registro de cambios.
//   APLICAR:    toma el candado del catálogo de la organización, vuelve a leer y a planificar DENTRO de la transacción (lo que simuló la persona pudo cambiar), y si no hay errores
//               escribe todo o nada. Dos aplicaciones simultáneas se serializan: la segunda ya ve lo de la primera y sale «Sin cambios». Cada cambio queda en el registro de cambios.
//
// Nunca borra: solo crea y actualiza (invariante 3). Los precios nuevos son una versión con vigencia (el anterior se cierra el día previo), no una edición.

import { altaConAlcance, type BaseDatos, type Consultas } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { esChoqueDeOcupacion, esViolacionUnica } from "../../datos/prisma.ts";
import { aTexto, deDecimal } from "../../lib/dinero.ts";
import { registrarCambio } from "../../api/registro.ts";
import { CANDADO_OCUPACION } from "../choques.ts";
import { aFecha, deFecha } from "../precios.ts";
import { ESQUEMAS, TIPOS, type Tipo } from "./esquemas.ts";
import { leerArchivos, textoDeProblema, type ArchivoDeEntrada, type Lectura, type Problema } from "./lectura.ts";
import { planificar, type Cambio, type ClaveDeResumen, type ConteoDeResumen, type Existente, type Op, type Plan } from "./plan.ts";

/** El tiempo que puede tardar una carga grande dentro de su transacción (cientos de filas, cada una con su registro de cambios). */
const OPCIONES_DE_CARGA = { maxWait: 30_000, timeout: 180_000 } as const;
/** Lo más que se devuelve en un informe; el resto se cuenta. */
const MAXIMO_DE_ERRORES = 500;
const MAXIMO_DE_CAMBIOS = 1000;

// ── Lo que ya existe ─────────────────────────────────────────────────────────────────────────────

export async function cargarExistente(db: Consultas): Promise<Existente> {
  const [verticales, sucursales, ofertas, salones, instructores, programas, grupos, precios, ocupacion] = await Promise.all([
    db.vertical.findMany({ select: { id: true, nombre: true, slug: true, color_marca: true, activo: true } }),
    db.sucursal.findMany({ select: { id: true, nombre: true, direccion: true, zona_horaria: true, activo: true } }),
    db.sucursal_vertical.findMany({ select: { sucursal_id: true, vertical_id: true } }),
    db.salon.findMany({ select: { id: true, sucursal_id: true, nombre: true, capacidad: true, activo: true } }),
    db.instructor.findMany({ select: { id: true, nombre: true, telefono: true, correo: true, activo: true, sucursales: { where: { eliminado_en: null }, select: { sucursal_id: true } } } }),
    db.programa.findMany({ select: { id: true, vertical_id: true, sucursal_id: true, nombre: true, edad_min: true, edad_max: true, nivel: true, descripcion_publica: true, permite_traslape: true, fecha_corte_edad: true, activo: true } }),
    db.grupo.findMany({ select: { id: true, programa_id: true, nombre: true, salon_id: true, instructor_id: true, cupo_maximo: true, permite_lista_espera: true, activo: true, horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true, hora_fin_min: true } } } }),
    db.precio.findMany({ select: { id: true, programa_id: true, costo_inscripcion: true, costo_mensualidad: true, vigencia_desde: true, vigencia_hasta: true } }),
    db.inscripcion.groupBy({ by: ["grupo_id"], where: { estatus: "activa" }, _count: { _all: true } }),
  ]);
  const ocupados = new Map(ocupacion.map((o) => [o.grupo_id, o._count._all]));
  return {
    verticales: verticales.map((v) => ({ id: v.id, nombre: v.nombre, slug: v.slug, color: v.color_marca, activo: v.activo })),
    sucursales: sucursales.map((s) => ({ id: s.id, nombre: s.nombre, direccion: s.direccion, zona: s.zona_horaria, activo: s.activo })),
    ofertas: ofertas.map((o) => ({ sucursalId: o.sucursal_id, verticalId: o.vertical_id })),
    salones: salones.map((s) => ({ id: s.id, sucursalId: s.sucursal_id, nombre: s.nombre, capacidad: s.capacidad, activo: s.activo })),
    instructores: instructores.map((i) => ({ id: i.id, nombre: i.nombre, telefono: i.telefono, correo: i.correo, activo: i.activo, sucursalIds: i.sucursales.map((x) => x.sucursal_id) })),
    programas: programas.map((p) => ({ id: p.id, verticalId: p.vertical_id, sucursalId: p.sucursal_id, nombre: p.nombre, edadMin: p.edad_min, edadMax: p.edad_max, nivel: p.nivel, descripcion: p.descripcion_publica, permiteTraslape: p.permite_traslape, corte: p.fecha_corte_edad ? deFecha(p.fecha_corte_edad) : null, activo: p.activo })),
    grupos: grupos.map((g) => ({
      id: g.id,
      programaId: g.programa_id,
      nombre: g.nombre,
      salonId: g.salon_id,
      instructorId: g.instructor_id,
      cupo: g.cupo_maximo,
      listaEspera: g.permite_lista_espera,
      activo: g.activo,
      ocupados: ocupados.get(g.id) ?? 0,
      horarios: g.horarios.map((h) => ({ dia: h.dia_semana, inicioMin: h.hora_inicio_min, finMin: h.hora_fin_min })),
    })),
    precios: precios.map((p) => ({ id: p.id, programaId: p.programa_id, inscripcion: deDecimal(p.costo_inscripcion), mensualidad: deDecimal(p.costo_mensualidad), desde: deFecha(p.vigencia_desde), hasta: p.vigencia_hasta ? deFecha(p.vigencia_hasta) : null })),
  };
}

// ── Aplicar el plan ──────────────────────────────────────────────────────────────────────────────

/** Lo que cada fila registrada en el registro de cambios lleva (listas blancas de `src/api/registro.ts`). */
type Ctx = Parameters<typeof registrarCambio>[1];

async function aplicarOps(tx: Consultas, usuarioId: string, ops: readonly Op[]): Promise<void> {
  const ctx = { usuario: { id: usuarioId } } as Ctx;
  /** Las referencias `nuevo:…` del plan → el id que les dio la base. */
  const ids = new Map<string, string>();
  const id = (ref: string): string => ids.get(ref) ?? ref;

  // Grupos que cambian de salón o de instructor: primero se sueltan y luego se asignan, para que dos grupos que intercambian salón no choquen en el paso intermedio.
  for (const op of ops) {
    if (op.k !== "grupo" || op.accion !== "actualizar" || !op.antes) continue;
    const suelta: Record<string, null> = {};
    if (op.datos.salonRef !== op.antes.salonRef) suelta["salon_id"] = null;
    if (op.datos.instructorRef !== op.antes.instructorRef) suelta["instructor_id"] = null;
    if (Object.keys(suelta).length > 0) await tx.grupo.update({ where: { id: op.ref }, data: suelta });
  }

  for (const op of ops) {
    switch (op.k) {
      case "disciplina": {
        if (op.accion === "crear") {
          const v = await tx.vertical.create({ data: altaConAlcance({ nombre: op.datos.nombre, slug: op.datos.slug, color_marca: op.datos.color }), select: { id: true } });
          ids.set(op.ref, v.id);
          await registrarCambio(tx, ctx, { entidad: "vertical", entidadId: v.id, accion: "crear", despues: { nombre: op.datos.nombre, slug: op.datos.slug, color_marca: op.datos.color, usa_progresion: false, cotizador_whatsapp_activo: false, clase_muestra_whatsapp_activo: false, activo: true } });
        } else {
          await tx.vertical.update({ where: { id: op.ref }, data: { color_marca: op.datos.color } });
          await registrarCambio(tx, ctx, { entidad: "vertical", entidadId: op.ref, accion: "actualizar", antes: { color_marca: op.antes?.color ?? null }, despues: { color_marca: op.datos.color } });
        }
        break;
      }
      case "sucursal": {
        if (op.accion === "crear") {
          const s = await tx.sucursal.create({ data: altaConAlcance({ nombre: op.datos.nombre, direccion: op.datos.direccion, zona_horaria: op.datos.zona }), select: { id: true } });
          ids.set(op.ref, s.id);
          await registrarCambio(tx, ctx, { entidad: "sucursal", entidadId: s.id, accion: "crear", despues: { nombre: op.datos.nombre, direccion: op.datos.direccion, zona_horaria: op.datos.zona, activo: true } });
        } else {
          await tx.sucursal.update({ where: { id: op.ref }, data: { direccion: op.datos.direccion, zona_horaria: op.datos.zona } });
          await registrarCambio(tx, ctx, { entidad: "sucursal", entidadId: op.ref, accion: "actualizar", antes: { direccion: op.antes?.direccion ?? null, zona_horaria: op.antes?.zona ?? "" }, despues: { direccion: op.datos.direccion, zona_horaria: op.datos.zona } });
        }
        break;
      }
      case "oferta": {
        const f = await tx.sucursal_vertical.create({ data: altaConAlcance({ sucursal_id: id(op.sucursalRef), vertical_id: id(op.disciplinaRef) }), select: { id: true } });
        await registrarCambio(tx, ctx, { entidad: "sucursal_vertical", entidadId: f.id, accion: "crear", despues: { sucursal_id: id(op.sucursalRef), vertical_id: id(op.disciplinaRef), activo: true } });
        break;
      }
      case "salon": {
        if (op.accion === "crear") {
          const s = await tx.salon.create({ data: altaConAlcance({ sucursal_id: id(op.sucursalRef), nombre: op.datos.nombre, capacidad: op.datos.capacidad }), select: { id: true } });
          ids.set(op.ref, s.id);
          await registrarCambio(tx, ctx, { entidad: "salon", entidadId: s.id, accion: "crear", despues: { sucursal_id: id(op.sucursalRef), nombre: op.datos.nombre, capacidad: op.datos.capacidad, activo: true } });
        } else {
          await tx.salon.update({ where: { id: op.ref }, data: { capacidad: op.datos.capacidad } });
          await registrarCambio(tx, ctx, { entidad: "salon", entidadId: op.ref, accion: "actualizar", antes: { capacidad: op.antes?.capacidad ?? null }, despues: { capacidad: op.datos.capacidad } });
        }
        break;
      }
      case "instructor": {
        let instructorId = op.ref;
        if (op.accion === "crear") {
          const i = await tx.instructor.create({ data: altaConAlcance({ nombre: op.datos.nombre, telefono: op.datos.telefono, correo: op.datos.correo }), select: { id: true } });
          instructorId = i.id;
          ids.set(op.ref, i.id);
        } else {
          await tx.instructor.update({ where: { id: op.ref }, data: { telefono: op.datos.telefono, correo: op.datos.correo } });
        }
        for (const s of op.sucursalesNuevas) await tx.instructor_sucursal.create({ data: altaConAlcance({ instructor_id: instructorId, sucursal_id: id(s) }) });
        const sucursalesFinales = [...(op.antes?.sucursalIds ?? []), ...op.sucursalesNuevas.map(id)].sort();
        await registrarCambio(tx, ctx, {
          entidad: "instructor",
          entidadId: instructorId,
          accion: op.accion,
          ...(op.antes ? { antes: { telefono: op.antes.telefono, correo: op.antes.correo, sucursales: [...op.antes.sucursalIds].sort() } } : {}),
          despues: { nombre: op.datos.nombre, telefono: op.datos.telefono, correo: op.datos.correo, activo: true, sucursales: sucursalesFinales },
        });
        break;
      }
      case "programa": {
        const datos = { nombre: op.datos.nombre, edad_min: op.datos.edadMin, edad_max: op.datos.edadMax, nivel: op.datos.nivel, descripcion_publica: op.datos.descripcion, permite_traslape: op.datos.permiteTraslape, fecha_corte_edad: op.datos.corte ? aFecha(op.datos.corte) : null };
        const instantanea = (d: { edadMin: number; edadMax: number; nivel: string | null; permiteTraslape: boolean; corte: string | null }) => ({ edad_min: d.edadMin, edad_max: d.edadMax, nivel: d.nivel, permite_traslape: d.permiteTraslape, fecha_corte_edad: d.corte });
        if (op.accion === "crear") {
          const p = await tx.programa.create({ data: altaConAlcance({ vertical_id: id(op.disciplinaRef), sucursal_id: id(op.sucursalRef), ...datos }), select: { id: true } });
          ids.set(op.ref, p.id);
          await registrarCambio(tx, ctx, { entidad: "programa", entidadId: p.id, accion: "crear", despues: { vertical_id: id(op.disciplinaRef), sucursal_id: id(op.sucursalRef), nombre: op.datos.nombre, activo: true, ...instantanea(op.datos) } });
        } else {
          const { nombre: _nombre, ...cambios } = datos;
          await tx.programa.update({ where: { id: op.ref }, data: cambios });
          await registrarCambio(tx, ctx, { entidad: "programa", entidadId: op.ref, accion: "actualizar", ...(op.antes ? { antes: instantanea(op.antes) } : {}), despues: instantanea(op.datos) });
        }
        break;
      }
      case "grupo": {
        let grupoId = op.ref;
        if (op.accion === "crear") {
          const g = await tx.grupo.create({
            data: altaConAlcance({ programa_id: id(op.programaRef), nombre: op.datos.nombre, cupo_maximo: op.datos.cupo, permite_lista_espera: op.datos.listaEspera, salon_id: op.datos.salonRef ? id(op.datos.salonRef) : null, instructor_id: op.datos.instructorRef ? id(op.datos.instructorRef) : null }),
            select: { id: true },
          });
          grupoId = g.id;
          ids.set(op.ref, g.id);
        } else {
          await tx.grupo.update({ where: { id: op.ref }, data: { cupo_maximo: op.datos.cupo, permite_lista_espera: op.datos.listaEspera, salon_id: op.datos.salonRef ? id(op.datos.salonRef) : null, instructor_id: op.datos.instructorRef ? id(op.datos.instructorRef) : null } });
        }
        for (const h of op.horariosNuevos) await tx.grupo_horario.create({ data: altaConAlcance({ grupo_id: grupoId, dia_semana: h.dia, hora_inicio_min: h.inicioMin, hora_fin_min: h.finMin }) });
        const clave = (h: { dia: number; inicioMin: number; finMin: number }): string => `${h.dia}|${h.inicioMin}-${h.finMin}`;
        await registrarCambio(tx, ctx, {
          entidad: "grupo",
          entidadId: grupoId,
          accion: op.accion,
          ...(op.antes ? { antes: { cupo_maximo: op.antes.cupo, permite_lista_espera: op.antes.listaEspera, salon_id: op.antes.salonRef, instructor_id: op.antes.instructorRef, horarios: op.horariosAntes.map(clave) } } : {}),
          despues: {
            nombre: op.datos.nombre,
            cupo_maximo: op.datos.cupo,
            permite_lista_espera: op.datos.listaEspera,
            activo: true,
            salon_id: op.datos.salonRef ? id(op.datos.salonRef) : null,
            instructor_id: op.datos.instructorRef ? id(op.datos.instructorRef) : null,
            horarios: [...op.horariosAntes, ...op.horariosNuevos].map(clave),
          },
        });
        break;
      }
      case "precio": {
        const programaId = id(op.programaRef);
        const instantanea = (p: { inscripcion: bigint; mensualidad: bigint; desde: string; hasta: string | null }) => ({ programa_id: programaId, costo_inscripcion: aTexto(p.inscripcion), costo_mensualidad: aTexto(p.mensualidad), moneda: "MXN", vigencia_desde: p.desde, vigencia_hasta: p.hasta });
        if (op.cerrar) {
          await tx.precio.update({ where: { id: op.cerrar.id }, data: { vigencia_hasta: aFecha(op.cerrar.hasta) } });
          await registrarCambio(tx, ctx, { entidad: "precio", entidadId: op.cerrar.id, accion: "actualizar", antes: instantanea({ ...op.cerrar.antes, desde: op.cerrar.antes.desde, hasta: op.cerrar.antes.hasta }), despues: instantanea({ ...op.cerrar.antes, hasta: op.cerrar.hasta }) });
        }
        const p = await tx.precio.create({
          data: altaConAlcance({ programa_id: programaId, costo_inscripcion: aTexto(op.datos.inscripcion), costo_mensualidad: aTexto(op.datos.mensualidad), moneda: "MXN", vigencia_desde: aFecha(op.datos.desde), vigencia_hasta: op.datos.hasta ? aFecha(op.datos.hasta) : null }),
          select: { id: true },
        });
        await registrarCambio(tx, ctx, { entidad: "precio", entidadId: p.id, accion: "crear", despues: instantanea(op.datos) });
        break;
      }
    }
  }
}

// ── El informe ───────────────────────────────────────────────────────────────────────────────────

export type ModoDeCarga = "simulacion" | "aplicar";

export interface ProblemaDeInforme extends Problema {
  /** «Fila 7, columna “Salón”: …», listo para mostrar. */
  texto: string;
}

export interface Informe {
  modo: ModoDeCarga;
  /** Sin errores: se puede aplicar. */
  limpia: boolean;
  /** Se escribió (o no había nada que escribir) en modo «aplicar». */
  aplicado: boolean;
  /** Limpia y todo ya estaba igual: no hay nada que crear ni actualizar. */
  sin_cambios: boolean;
  archivos: { nombre: string; tipo: Tipo | null; hoja: string | null; filas: number }[];
  errores: ProblemaDeInforme[];
  errores_omitidos: number;
  avisos: ProblemaDeInforme[];
  resumen: { clave: ClaveDeResumen; nombre: string; creados: number; actualizados: number; sin_cambios: number }[];
  cambios: Cambio[];
  cambios_omitidos: number;
}

const NOMBRE_DE_RESUMEN: Record<ClaveDeResumen, string> = {
  disciplinas: "Disciplinas",
  sucursales: "Sucursales",
  oferta: "Disciplinas por sucursal",
  salones: "Salones",
  instructores: "Instructores",
  programas: "Programas",
  grupos: "Grupos",
  horarios: "Horarios",
  precios: "Precios",
};

const conTexto = (p: Problema): ProblemaDeInforme => ({ ...p, texto: textoDeProblema(p) });

function armarInforme(modo: ModoDeCarga, lectura: Lectura, plan: Plan | null, aplicado: boolean): Informe {
  const todos = [...lectura.problemas, ...(plan?.errores ?? [])];
  const limpia = todos.length === 0 && (plan !== null || lectura.archivos.length > 0);
  const resumen = plan ? (Object.keys(NOMBRE_DE_RESUMEN) as ClaveDeResumen[]).map((clave) => ({ clave, nombre: NOMBRE_DE_RESUMEN[clave], ...(plan.resumen[clave] as ConteoDeResumen) })).filter((r) => r.creados + r.actualizados + r.sin_cambios > 0) : [];
  const hayCambios = plan !== null && plan.ops.length > 0;
  return {
    modo,
    limpia,
    aplicado: aplicado && limpia,
    sin_cambios: limpia && plan !== null && !hayCambios,
    archivos: lectura.archivos.map((a) => ({ nombre: a.nombre, tipo: a.tipo, hoja: a.tipo ? ESQUEMAS[a.tipo].plural : null, filas: a.filas })),
    errores: todos.slice(0, MAXIMO_DE_ERRORES).map(conTexto),
    errores_omitidos: Math.max(0, todos.length - MAXIMO_DE_ERRORES),
    avisos: [...lectura.avisos, ...(plan?.avisos ?? [])].slice(0, MAXIMO_DE_ERRORES).map(conTexto),
    resumen,
    cambios: plan && limpia ? plan.cambios.slice(0, MAXIMO_DE_CAMBIOS) : [],
    cambios_omitidos: plan && limpia ? Math.max(0, plan.cambios.length - MAXIMO_DE_CAMBIOS) : 0,
  };
}

export interface OpcionesDeCarga {
  archivos: readonly ArchivoDeEntrada[];
  modo: ModoDeCarga;
  organizacionId: string;
  /** Quien hace la carga (para el registro de cambios). Obligatorio al aplicar. */
  usuarioId?: string;
}

/**
 * Simula o aplica una carga. En simulación no escribe nada. Al aplicar, todo o nada bajo el candado del catálogo; si hay errores no escribe y los devuelve.
 * Las fallas inesperadas de la base se propagan (500); las que el catálogo ya conoce (choque de ocupación, duplicado por una carrera) se explican.
 */
export async function importarCatalogo(db: BaseDatos, opciones: OpcionesDeCarga): Promise<Informe> {
  const lectura = leerArchivos(opciones.archivos);
  const tablas = lectura.tablas;
  if (lectura.archivos.length === 0) {
    lectura.problemas.push({ archivo: "(todos)", tipo: null, fila: null, columna: null, mensaje: "no hay ningún archivo que cargar. Sube al menos uno de los archivos de las plantillas" });
    return armarInforme(opciones.modo, lectura, null, false);
  }
  const fotoDeLoExistente = (): Promise<Existente> => db.$transaction((tx) => cargarExistente(tx), { isolationLevel: "RepeatableRead", maxWait: 30_000, timeout: 60_000 });
  if (opciones.modo === "simulacion") {
    // Una foto consistente (RepeatableRead) y de solo lectura: la simulación no deja huella.
    return armarInforme("simulacion", lectura, planificar(tablas, await fotoDeLoExistente()), false);
  }
  if (!opciones.usuarioId) throw new Error("Aplicar una carga requiere saber quién la hace (usuarioId)");
  const usuarioId = opciones.usuarioId;
  // Con problemas en los archivos mismos (no se reconocen, comillas sin cerrar…) no se toca la base: se simula para dar TODOS los errores a la vez.
  if (lectura.problemas.length > 0) return armarInforme("aplicar", lectura, planificar(tablas, await fotoDeLoExistente()), false);
  try {
    const { plan, aplicado } = await transaccionConBloqueo(
      db,
      opciones.organizacionId,
      CANDADO_OCUPACION,
      async (tx) => {
        // Se vuelve a leer y a planificar ya con el candado: otra carga o un cambio a mano pudo ocurrir entre la simulación y ahora.
        const plan = planificar(tablas, await cargarExistente(tx));
        if (plan.errores.length > 0) return { plan, aplicado: false };
        await aplicarOps(tx, usuarioId, plan.ops);
        return { plan, aplicado: true };
      },
      OPCIONES_DE_CARGA,
    );
    return armarInforme("aplicar", lectura, plan, aplicado);
  } catch (e) {
    if (esChoqueDeOcupacion(e) || esViolacionUnica(e)) {
      const informe = armarInforme("aplicar", lectura, planificar(tablas, await fotoDeLoExistente()), false);
      const motivo = esChoqueDeOcupacion(e)
        ? "mientras se cargaba, otro cambio ocupó un salón o un instructor en ese horario"
        : "mientras se cargaba, otro cambio creó algo con el mismo nombre";
      return { ...informe, limpia: false, aplicado: false, sin_cambios: false, errores: [conTexto({ archivo: "(todos)", tipo: null, fila: null, columna: null, mensaje: `${motivo}. No se guardó nada; vuelve a simular y a aplicar` }), ...informe.errores] };
    }
    throw e;
  }
}

/** Los tipos de hoja, en el orden en que se piden, para quien arme una carpeta. */
export const ORDEN_DE_HOJAS: readonly Tipo[] = TIPOS;
