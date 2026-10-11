// La familia (F1, invariante 13): tutores, alumnos y la relación M:N entre ellos.
//
//   GET    /api/tutores?telefono=&nombre=&sucursal_id=&con_atraso=&limite=&pagina=     (tutores:leer)   (R9b: `con_atraso=true` = con al menos un cargo vencido y con saldo, la misma definición de `cartera_vencida.familias` del ejecutivo; pide `estado_cuenta:leer` y finanzas encendido)
//   GET    /api/tutores/:id                                                            (tutores:leer)
//   POST   /api/tutores        { nombre, apellidos?, telefono, correo?, direccion?, como_nos_conocio?, sucursal_id? }   (tutores:escribir)
//   PATCH  /api/tutores/:id    { …lo mismo, todo opcional }                            (tutores:escribir)
//   DELETE /api/tutores/:id                                                            (tutores:escribir)  baja lógica; 409 si tiene alumnos
//   GET    /api/alumnos?nombre=&telefono=&tutor_id=&estatus=&sucursal_id=&vertical_id=&con_atraso=&limite=&pagina=   (alumnos:leer)   (R6a: `vertical_id` = con una inscripción vigente en esa disciplina; R9b: `con_atraso=true` = con un cargo vencido y con saldo; pide `estado_cuenta:leer` y finanzas encendido)
//   GET    /api/alumnos/:id                                                            (alumnos:leer)
//   POST   /api/alumnos        { nombre, apellidos, fecha_nacimiento, …, tutores: [ { tutor_id | tutor: {…}, parentesco, banderas } ] }   (alumnos:escribir)
//   PATCH  /api/alumnos/:id    { nombre?, apellidos?, fecha_nacimiento?, sexo?, … }     (alumnos:escribir)
//   POST   /api/alumnos/:id/tutores               { tutor_id | tutor: {…}, parentesco, banderas }   (alumnos:escribir)  segundo tutor, la abuela…
//   PATCH  /api/alumnos/:id/tutores/:tutor_id     { parentesco?, banderas? }                (alumnos:escribir)
//   DELETE /api/alumnos/:id/tutores/:tutor_id                                              (alumnos:escribir)  409 si es el único
//
//   GET    /api/familias/un-solo-hijo?sin_vertical_id=&sucursal_id=&limite=&pagina=         (tutores:leer)   F7: la lista de cross-sell
//   GET    /api/familias/resumen?tutor_ids=a,b,c                                   (tutores:leer)   R6b: por familia, la disciplina, grupo y horario de cada hijo y el estado de su cuenta
//   GET    /api/familias/:id/mensajes                                              (tutores:leer)   R6b: promociones, último recordatorio de pago, asesor y conversación
//
// Un tutor por teléfono normalizado (`normalizarTelefono()`, invariante 7): el mismo teléfono es la misma familia (detección de familia).
// Alta de un alumno con un `tutor` nuevo cuyo teléfono ya existe: se LIGA al tutor que hay (no se duplica ni se le pisan los datos).
// Sin datos de salud: viven cifrados en la ficha de salud (sujeto `alumno`, src/sensibles/) y se leen por `GET /api/salud/alumno/:id` con permiso, motivo y
// constancia. Alcance: ver src/familias/alcance.ts. Lo ajeno responde 404. Cada cambio queda en `registro_cambio` (solo QUÉ campos se
// tocaron, nunca sus valores: el registro es de solo anexar y no se purga).

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { problemaDeFechaDeNacimiento } from "../../clases-muestra/registro-reglas.ts";
import type { Consultas } from "../../datos/alcance.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { dondeAlumnoVisible, dondeTutorVisible } from "../../familias/alcance.ts";
import { familiasConUnHijo } from "../../familias/cross-sell.ts";
import { conAtraso } from "../../familias/con-atraso.ts";
import { mensajesDeFamilia } from "../../familias/mensajes.ts";
import { resumenDeFamilias } from "../../familias/resumen.ts";
import { leerModulos } from "../../modulos/index.ts";
import { tienePermiso } from "../permisos.ts";
import { crearAlumno, encontrarOCrearTutor, PARENTESCO_MAX, vincularTutor, type DatosDeAlumno } from "../../familias/familia.ts";
import { autorizaUsoDeImagen } from "../../legal/aceptaciones.ts";
import { edadCumplida } from "../../lib/edad.ts";
import { normalizarTelefono } from "../../lib/telefono.ts";
import { contieneTodas } from "../../lib/texto.ts";
import { MOTIVOS_DE_CLASE, SEXOS, TURNOS_ESCOLARES } from "../../clases-muestra/registro.ts";
import { veSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, prohibido, validacion, type DetalleDeError } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, correo, enumerado, fechaISO, listaDe, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const textoONulo = (max: number) => opcional(nulable(texto({ max })));
const hoyUTC = (ctx: ContextoApi): string => ctx.ahora().toISOString().slice(0, 10);
const iso = (d: Date): string => d.toISOString().slice(0, 10);

// ── Esquemas ──────────────────────────────────────────────────────────────────────────────────────────

const camposDeTutor = {
  nombre: texto({ max: 120 }),
  apellidos: textoONulo(120),
  telefono: texto({ max: 30 }),
  correo: opcional(nulable(correo())),
  direccion: textoONulo(300),
  como_nos_conocio: textoONulo(160),
  sucursal_id: opcional(nulable(uuid())),
};
const esquemaAltaTutor = objeto(camposDeTutor);
const esquemaCambioTutor = objeto({
  nombre: opcional(texto({ max: 120 })),
  apellidos: textoONulo(120),
  telefono: opcional(texto({ max: 30 })),
  correo: opcional(nulable(correo())),
  direccion: textoONulo(300),
  como_nos_conocio: textoONulo(160),
  sucursal_id: opcional(nulable(uuid())),
});
const esquemaTutorNuevo = objeto({
  nombre: texto({ max: 120 }),
  apellidos: textoONulo(120),
  telefono: texto({ max: 30 }),
  correo: opcional(nulable(correo())),
  direccion: textoONulo(300),
  como_nos_conocio: textoONulo(160),
});
const banderas = {
  es_responsable_pago: opcional(booleano()),
  es_contacto_urgencia: opcional(booleano()),
  puede_recoger: opcional(booleano()),
  lo_lleva: opcional(booleano()),
};
const esquemaVinculo = objeto({ tutor_id: opcional(uuid()), tutor: opcional(esquemaTutorNuevo), parentesco: texto({ max: PARENTESCO_MAX }), ...banderas });
const esquemaCambioVinculo = objeto({ parentesco: opcional(texto({ max: PARENTESCO_MAX })), ...banderas });

const camposDeAlumno = {
  nombre: texto({ max: 120 }),
  apellidos: texto({ max: 120 }),
  fecha_nacimiento: fechaISO(),
  sexo: opcional(nulable(enumerado(SEXOS))),
  sucursal_id: opcional(nulable(uuid())),
  escuela_nombre: textoONulo(160),
  escuela_turno: opcional(nulable(enumerado(TURNOS_ESCOLARES))),
  talla_uniforme: textoONulo(40),
  practico_antes: opcional(nulable(booleano())),
  practico_donde: textoONulo(160),
  practico_nivel: textoONulo(120),
  motivo_clase: opcional(nulable(enumerado(MOTIVOS_DE_CLASE))),
  motivo_clase_detalle: textoONulo(300),
};
const esquemaAltaAlumno = objeto({ ...camposDeAlumno, tutores: listaDe(esquemaVinculo, { max: 6 }) });
const esquemaCambioAlumno = objeto({
  nombre: opcional(texto({ max: 120 })),
  apellidos: opcional(texto({ max: 120 })),
  fecha_nacimiento: opcional(fechaISO()),
  sexo: opcional(nulable(enumerado(SEXOS))),
  sucursal_id: opcional(nulable(uuid())),
  escuela_nombre: textoONulo(160),
  escuela_turno: opcional(nulable(enumerado(TURNOS_ESCOLARES))),
  talla_uniforme: textoONulo(40),
  practico_antes: opcional(nulable(booleano())),
  practico_donde: textoONulo(160),
  practico_nivel: textoONulo(120),
  motivo_clase: opcional(nulable(enumerado(MOTIVOS_DE_CLASE))),
  motivo_clase_detalle: textoONulo(300),
});

const esquemaCrossSell = objeto({ ...esquemaPaginacion, sin_vertical_id: opcional(uuid()), sucursal_id: opcional(uuid()) });
const ESTATUS_ALUMNO = ["activo", "baja", "congelado"] as const;
const esquemaId = objeto({ id: uuid() });
const esquemaResumen = objeto({ tutor_ids: listaDe(uuid(), { max: 50, unicos: true }) });
const esquemaIdYTutor = objeto({ id: uuid(), tutor_id: uuid() });
const esquemaListadoTutores = objeto({ ...esquemaPaginacion, telefono: opcional(texto({ max: 30 })), nombre: opcional(texto({ max: 120 })), sucursal_id: opcional(uuid()), con_atraso: opcional(booleanoDeTexto()) });
const esquemaListadoAlumnos = objeto({
  ...esquemaPaginacion,
  nombre: opcional(texto({ max: 120 })),
  telefono: opcional(texto({ max: 30 })),
  tutor_id: opcional(uuid()),
  estatus: opcional(enumerado(ESTATUS_ALUMNO)),
  sucursal_id: opcional(uuid()),
  /** R6a: los alumnos con una inscripción vigente (activa o congelada) en esa disciplina. */
  vertical_id: opcional(uuid()),
  /** R9b: solo los alumnos con un cargo vencido y con saldo. */
  con_atraso: opcional(booleanoDeTexto()),
});

// ── Presentación ──────────────────────────────────────────────────────────────────────────────────────

const SELECCION_VINCULO = {
  id: true,
  creado_en: true,
  tutor_id: true,
  parentesco: true,
  es_responsable_pago: true,
  es_contacto_urgencia: true,
  puede_recoger: true,
  lo_lleva: true,
  tutor: { select: { id: true, nombre: true, apellidos: true, telefono: true, correo: true } },
} as const;

const SELECCION_ALUMNO = {
  id: true,
  nombre: true,
  apellidos: true,
  fecha_nacimiento: true,
  sexo: true,
  estatus: true,
  sucursal_id: true,
  escuela_nombre: true,
  escuela_turno: true,
  talla_uniforme: true,
  practico_antes: true,
  practico_donde: true,
  practico_nivel: true,
  motivo_clase: true,
  motivo_clase_detalle: true,
  creado_en: true,
  tutores: { where: { eliminado_en: null, tutor: { eliminado_en: null } }, select: SELECCION_VINCULO },
} as const;

interface FilaVinculo {
  id: string;
  creado_en: Date;
  tutor_id: string;
  parentesco: string;
  es_responsable_pago: boolean;
  es_contacto_urgencia: boolean;
  puede_recoger: boolean;
  lo_lleva: boolean;
  tutor: { id: string; nombre: string; apellidos: string | null; telefono: string; correo: string | null };
}
interface FilaAlumno {
  id: string;
  nombre: string;
  apellidos: string;
  fecha_nacimiento: Date;
  sexo: string | null;
  estatus: string;
  sucursal_id: string | null;
  escuela_nombre: string | null;
  escuela_turno: string | null;
  talla_uniforme: string | null;
  practico_antes: boolean | null;
  practico_donde: string | null;
  practico_nivel: string | null;
  motivo_clase: string | null;
  motivo_clase_detalle: string | null;
  creado_en: Date;
  tutores: FilaVinculo[];
}

const porAntiguedad = (a: { creado_en: Date; id: string }, b: { creado_en: Date; id: string }): number => a.creado_en.getTime() - b.creado_en.getTime() || (a.id < b.id ? -1 : 1);

/** El maestro sabe quién es la familia y quién puede recoger al alumno, pero no cómo contactarla (como en la clase muestra). */
const presentarVinculo = (v: FilaVinculo, rol: string) => ({
  tutor_id: v.tutor_id,
  nombre: v.tutor.nombre,
  apellidos: v.tutor.apellidos,
  parentesco: v.parentesco,
  es_responsable_pago: v.es_responsable_pago,
  es_contacto_urgencia: v.es_contacto_urgencia,
  puede_recoger: v.puede_recoger,
  lo_lleva: v.lo_lleva,
  ...(rol === "maestro" ? {} : { telefono: v.tutor.telefono, correo: v.tutor.correo }),
});

const presentarAlumno = (a: FilaAlumno, rol: string, hoy: string, autorizaImagen?: boolean) => ({
  id: a.id,
  nombre: a.nombre,
  apellidos: a.apellidos,
  fecha_nacimiento: iso(a.fecha_nacimiento),
  edad: hoy >= iso(a.fecha_nacimiento) ? edadCumplida(iso(a.fecha_nacimiento), hoy) : null,
  sexo: a.sexo,
  estatus: a.estatus,
  sucursal_id: a.sucursal_id,
  escuela_nombre: a.escuela_nombre,
  escuela_turno: a.escuela_turno,
  talla_uniforme: a.talla_uniforme,
  practico_antes: a.practico_antes,
  practico_donde: a.practico_donde,
  practico_nivel: a.practico_nivel,
  motivo_clase: a.motivo_clase,
  motivo_clase_detalle: a.motivo_clase_detalle,
  ...(autorizaImagen === undefined ? {} : { autoriza_uso_imagen: autorizaImagen }),
  creado_en: a.creado_en,
  tutores: [...a.tutores].sort(porAntiguedad).map((v) => presentarVinculo(v, rol)),
});

const SELECCION_TUTOR = {
  id: true,
  nombre: true,
  apellidos: true,
  telefono: true,
  correo: true,
  direccion: true,
  como_nos_conocio: true,
  sucursal_id: true,
  creado_en: true,
  alumnos: {
    where: { eliminado_en: null, alumno: { eliminado_en: null } },
    select: { creado_en: true, id: true, parentesco: true, es_responsable_pago: true, es_contacto_urgencia: true, puede_recoger: true, lo_lleva: true, alumno: { select: { id: true, nombre: true, apellidos: true, estatus: true, fecha_nacimiento: true } } },
  },
} as const;

interface FilaTutor {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string;
  correo: string | null;
  direccion: string | null;
  como_nos_conocio: string | null;
  sucursal_id: string | null;
  creado_en: Date;
  alumnos: { id: string; creado_en: Date; parentesco: string; es_responsable_pago: boolean; es_contacto_urgencia: boolean; puede_recoger: boolean; lo_lleva: boolean; alumno: { id: string; nombre: string; apellidos: string; estatus: string; fecha_nacimiento: Date } }[];
}

const presentarTutor = (t: FilaTutor) => ({
  id: t.id,
  nombre: t.nombre,
  apellidos: t.apellidos,
  telefono: t.telefono,
  correo: t.correo,
  direccion: t.direccion,
  como_nos_conocio: t.como_nos_conocio,
  sucursal_id: t.sucursal_id,
  creado_en: t.creado_en,
  alumnos: [...t.alumnos].sort(porAntiguedad).map((v) => ({
    alumno_id: v.alumno.id,
    nombre: v.alumno.nombre,
    apellidos: v.alumno.apellidos,
    estatus: v.alumno.estatus,
    fecha_nacimiento: iso(v.alumno.fecha_nacimiento),
    parentesco: v.parentesco,
    es_responsable_pago: v.es_responsable_pago,
    es_contacto_urgencia: v.es_contacto_urgencia,
    puede_recoger: v.puede_recoger,
    lo_lleva: v.lo_lleva,
  })),
});

// ── Registro de cambios (solo qué se tocó) ────────────────────────────────────────────────────────────

const camposTocados = (entrada: Record<string, unknown>): string[] => Object.keys(entrada).filter((k) => entrada[k] !== undefined).sort();
const instTutor = (sucursalId: string | null, campos: string[]): Instantanea => ({ sucursal_id: sucursalId, campos });
const instAlumno = (estatus: string, sucursalId: string | null, campos: string[]): Instantanea => ({ estatus, sucursal_id: sucursalId, campos });
const instVinculo = (v: { tutor_id: string; alumno_id: string; parentesco: string; es_responsable_pago: boolean; es_contacto_urgencia: boolean; puede_recoger: boolean; lo_lleva: boolean }): Instantanea => ({
  tutor_id: v.tutor_id,
  alumno_id: v.alumno_id,
  parentesco: v.parentesco,
  es_responsable_pago: v.es_responsable_pago,
  es_contacto_urgencia: v.es_contacto_urgencia,
  puede_recoger: v.puede_recoger,
  lo_lleva: v.lo_lleva,
});

// ── Utilidades ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lo que se compara en una búsqueda por nombre cabe en memoria: una escuela tiene a lo más unos miles de familias. Más allá del tope (`DepsApi.topeDeBusquedaPorNombre`, 20 000 por
 * omisión) la búsqueda se queda con las primeras (ordenadas como el listado) y LO DICE: la respuesta lleva `paginacion.busqueda_incompleta` y la pantalla avisa que hay más (V13-fix, EV-36).
 * Antes truncaba sin avisar.
 */

/**
 * Los ids de lo que coincide con lo escrito: cada palabra aparece en el nombre o en los apellidos, SIN importar mayúsculas ni acentos («angel» encuentra a «Ángel», «nunez» a
 * «Núñez»). Postgres compara con acentos y el cliente con alcance no ofrece SQL crudo, así que se trae lo que está a la vista (ya con alcance y filtros) y se compara aquí con
 * `contieneTodas`. `pajar` arma el texto de cada fila donde se busca. Se piden `tope + 1` filas: si llegan todas, hay más de las que se revisaron (`incompleta`).
 */
export async function idsPorNombre<F extends { id: string }>(traer: (tomar: number) => Promise<F[]>, pajar: (fila: F) => string, q: string, tope: number): Promise<{ ids: string[]; incompleta: boolean }> {
  const filas = await traer(tope + 1);
  const incompleta = filas.length > tope;
  return { ids: filas.slice(0, tope).filter((f) => contieneTodas(pajar(f), q)).map((f) => f.id), incompleta };
}

function telefonoOError(campo: string, valor: string): string {
  const t = normalizarTelefono(valor);
  if (!t) throw validacion([{ campo, mensaje: "No es un teléfono válido" }]);
  return t;
}

/**
 * La sucursal de alta: la que se manda (debe existir y estar en el alcance de quien la manda) o, si no se manda, la única sucursal de
 * quien da de alta; el administrador puede dejarla vacía. Quien tiene varias y no elige, recibe un error: la fila quedaría invisible para él.
 */
async function sucursalDeAlta(ctx: ContextoApi, solicitada: string | null | undefined, campo = "sucursal_id"): Promise<string | null> {
  const alcance = await ctx.alcance();
  if (solicitada === undefined || solicitada === null) {
    if (alcance.todas) return null;
    if (alcance.sucursalIds.length === 1) return alcance.sucursalIds[0]!;
    throw validacion([{ campo, mensaje: "Elige la sucursal" }]);
  }
  if (!veSucursal(alcance, solicitada) || !(await ctx.db.sucursal.findFirst({ where: { id: solicitada }, select: { id: true } }))) {
    throw validacion([{ campo, mensaje: "La sucursal no existe o no es de tu alcance" }]);
  }
  return solicitada;
}

function exigirFechaDeNacimiento(ctx: ContextoApi, fecha: string, campo = "fecha_nacimiento"): void {
  const problema = problemaDeFechaDeNacimiento(fecha, hoyUTC(ctx));
  if (problema) throw validacion([{ campo, mensaje: problema }]);
}

/** Antecedentes coherentes: quien no practicó antes no tiene dónde ni nivel (la base lo impone también). */
function exigirAntecedentes(a: { practico_antes?: boolean | null; practico_donde?: string | null; practico_nivel?: string | null; motivo_clase?: string | null; motivo_clase_detalle?: string | null }): void {
  const errores: DetalleDeError[] = [];
  if (a.practico_antes === false && (a.practico_donde || a.practico_nivel)) errores.push({ campo: "practico_antes", mensaje: "Quien no ha practicado antes no tiene dónde ni nivel" });
  if (a.motivo_clase_detalle && !a.motivo_clase) errores.push({ campo: "motivo_clase_detalle", mensaje: "El detalle del motivo necesita un motivo" });
  if (errores.length > 0) throw validacion(errores);
}

/** Convierte una violación de unicidad de la base en un 409 con el mensaje dado. */
async function comoConflicto<T>(mensaje: string, trabajo: () => Promise<T>): Promise<T> {
  try {
    return await trabajo();
  } catch (e) {
    if (esViolacionUnica(e)) throw conflicto(mensaje);
    throw e;
  }
}

export function rutasDeFamilias(deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** El alumno, si el usuario lo ve; 404 si no. */
  async function alumnoVisible(ctx: ContextoApi, id: string): Promise<FilaAlumno> {
    const a = (await ctx.db.alumno.findFirst({ where: { id, ...(await dondeAlumnoVisible(ctx)) }, select: SELECCION_ALUMNO })) as unknown as FilaAlumno | null;
    if (!a) throw noEncontrado();
    return a;
  }
  async function tutorVisible(ctx: ContextoApi, id: string): Promise<FilaTutor> {
    const t = (await ctx.db.tutor.findFirst({ where: { id, ...(await dondeTutorVisible(ctx)) }, select: SELECCION_TUTOR })) as unknown as FilaTutor | null;
    if (!t) throw noEncontrado();
    return t;
  }

  /** Resuelve la entrada `{tutor_id | tutor}` a un tutor existente o recién creado (por teléfono). Dentro de la transacción. */
  async function resolverTutor(ctx: ContextoApi, tx: Consultas, v: { tutor_id?: string | undefined; tutor?: { nombre: string; apellidos?: string | null | undefined; telefono: string; correo?: string | null | undefined; direccion?: string | null | undefined; como_nos_conocio?: string | null | undefined } | undefined }, campo: string, sucursalId: string | null): Promise<{ id: string; creado: boolean }> {
    if ((v.tutor_id === undefined) === (v.tutor === undefined)) throw validacion([{ campo, mensaje: "Manda `tutor_id` (un tutor que ya existe) o `tutor` (uno nuevo), no los dos ni ninguno" }]);
    if (v.tutor_id !== undefined) {
      const t = await tx.tutor.findFirst({ where: { id: v.tutor_id, ...(await dondeTutorVisible(ctx)) }, select: { id: true } });
      if (!t) throw noEncontrado("No se encontró el tutor");
      return { id: t.id, creado: false };
    }
    const n = v.tutor!;
    const telefono = telefonoOError(`${campo}.tutor.telefono`, n.telefono);
    const r = await encontrarOCrearTutor(tx, { nombre: n.nombre, apellidos: n.apellidos ?? null, telefono, correo: n.correo ?? null, direccion: n.direccion ?? null, como_nos_conocio: n.como_nos_conocio ?? null, sucursal_id: sucursalId });
    if (r.creado) {
      await registrarCambio(tx, ctx, { entidad: "tutor", entidadId: r.id, accion: "crear", despues: instTutor(sucursalId, camposTocados(n)) });
    }
    return r;
  }

  /** R9b: quién tiene un cargo vencido con saldo. Es información de cobranza: solo con el permiso de importes y el módulo de finanzas encendido (si no, 403 / 400). */
  async function atrasados(ctx: ContextoApi) {
    if (!tienePermiso(ctx.usuario.rol, "estado_cuenta:leer")) throw prohibido("No tienes permiso para filtrar por atraso");
    if (!(await leerModulos(ctx.db)).finanzas) throw validacion([{ campo: "con_atraso", mensaje: "El módulo de finanzas está apagado" }]);
    return conAtraso(ctx.db, ctx.ahora());
  }

  // ── Tutores ─────────────────────────────────────────────────────────────────────────────────────────

  r.get("/tutores", requierePermiso("tutores:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListadoTutores, req.query);
    const pag = leerPaginacion(q);
    const condiciones: Record<string, unknown>[] = [await dondeTutorVisible(ctx)];
    if (q.telefono !== undefined) condiciones.push({ telefono: telefonoOError("telefono", q.telefono) });
    if (q.sucursal_id) condiciones.push({ sucursal_id: q.sucursal_id });
    if (q.con_atraso) condiciones.push({ id: { in: (await atrasados(ctx)).tutorIds } });
    // Por nombre: el de la mamá o el de cualquiera de sus hijos (quien llega a pagar dice «vengo por Valentina»), sin importar mayúsculas ni acentos.
    let incompleta = false;
    if (q.nombre && q.nombre.trim() !== "") {
      const r = await idsPorNombre(
        (tomar) => ctx.db.tutor.findMany({ where: { AND: condiciones }, select: { id: true, nombre: true, apellidos: true, alumnos: { where: { eliminado_en: null }, select: { alumno: { select: { nombre: true, apellidos: true } } } } }, orderBy: [{ apellidos: "asc" }, { nombre: "asc" }, { id: "asc" }], take: tomar }),
        (t) => [t.nombre, t.apellidos ?? "", ...t.alumnos.map((v) => `${v.alumno.nombre} ${v.alumno.apellidos}`)].join(" "),
        q.nombre,
        deps.topeDeBusquedaPorNombre,
      );
      incompleta = r.incompleta;
      condiciones.push({ id: { in: r.ids } });
    }
    const where = { AND: condiciones };
    const respuesta = await paginar(
      pag,
      () => ctx.db.tutor.count({ where }),
      async (saltar, tomar) => (await ctx.db.tutor.findMany({ where, select: SELECCION_TUTOR, orderBy: [{ apellidos: "asc" }, { nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map((t) => presentarTutor(t as FilaTutor)),
    );
    res.json(incompleta ? { ...respuesta, paginacion: { ...respuesta.paginacion, busqueda_incompleta: true } } : respuesta);
  });

  r.get("/tutores/:id", requierePermiso("tutores:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    res.json(presentarTutor(await tutorVisible(ctx, id)));
  });

  r.post("/tutores", requierePermiso("tutores:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAltaTutor, req.body);
    const telefono = telefonoOError("telefono", e.telefono);
    const sucursalId = await sucursalDeAlta(ctx, e.sucursal_id);
    const id = await ctx.db.$transaction(async (tx) => {
      const nuevo = await encontrarOCrearTutor(tx, { nombre: e.nombre, apellidos: e.apellidos ?? null, telefono, correo: e.correo ?? null, direccion: e.direccion ?? null, como_nos_conocio: e.como_nos_conocio ?? null, sucursal_id: sucursalId });
      if (!nuevo.creado) return { existente: nuevo.id };
      await registrarCambio(tx, ctx, { entidad: "tutor", entidadId: nuevo.id, accion: "crear", despues: instTutor(sucursalId, camposTocados(e)) });
      return { creado: nuevo.id };
    });
    if ("existente" in id) {
      // Detección de familia: el teléfono ya es de un tutor. Se le dice cuál (si lo puede ver) para que ligue al alumno a él.
      const visible = await ctx.db.tutor.findFirst({ where: { id: id.existente, ...(await dondeTutorVisible(ctx)) }, select: { id: true } });
      throw conflicto("Ya existe un tutor con ese teléfono: es la misma familia", [{ campo: "telefono", mensaje: visible ? `tutor_id: ${visible.id}` : "Ya existe un tutor con ese teléfono" }]);
    }
    res.status(201).json(presentarTutor(await tutorVisible(ctx, id.creado)));
  });

  r.patch("/tutores/:id", requierePermiso("tutores:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambioTutor, req.body);
    const antes = await tutorVisible(ctx, id);
    const campos = camposTocados(e);
    if (campos.length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const telefono = e.telefono !== undefined ? telefonoOError("telefono", e.telefono) : undefined;
    const sucursalId = e.sucursal_id !== undefined ? (e.sucursal_id === null ? null : await sucursalDeAlta(ctx, e.sucursal_id)) : undefined;
    await comoConflicto("Ya existe otro tutor con ese teléfono: es la misma familia", () =>
      ctx.db.$transaction(async (tx) => {
        await tx.tutor.update({
          where: { id },
          data: {
            ...(e.nombre !== undefined ? { nombre: e.nombre } : {}),
            ...(e.apellidos !== undefined ? { apellidos: e.apellidos } : {}),
            ...(telefono !== undefined ? { telefono } : {}),
            ...(e.correo !== undefined ? { correo: e.correo } : {}),
            ...(e.direccion !== undefined ? { direccion: e.direccion } : {}),
            ...(e.como_nos_conocio !== undefined ? { como_nos_conocio: e.como_nos_conocio } : {}),
            ...(sucursalId !== undefined ? { sucursal_id: sucursalId } : {}),
          },
        });
        await registrarCambio(tx, ctx, { entidad: "tutor", entidadId: id, accion: "actualizar", antes: instTutor(antes.sucursal_id, []), despues: instTutor(sucursalId !== undefined ? sucursalId : antes.sucursal_id, campos), soloDiferencias: false });
      }),
    );
    res.json(presentarTutor(await tutorVisible(ctx, id)));
  });

  r.delete("/tutores/:id", requierePermiso("tutores:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const t = await tutorVisible(ctx, id);
    await ctx.db.$transaction(async (tx) => {
      if ((await tx.tutor_alumno.count({ where: { tutor_id: id, alumno: { eliminado_en: null } } })) > 0) throw conflicto("El tutor tiene alumnos: desvincúlalo primero");
      if ((await tx.lead.count({ where: { tutor_id: id } })) > 0) throw conflicto("El tutor viene de un lead convertido: no se da de baja");
      await tx.tutor.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "tutor", entidadId: id, accion: "eliminar", antes: instTutor(t.sucursal_id, []) });
    });
    res.status(204).end();
  });

  // ── Alumnos ─────────────────────────────────────────────────────────────────────────────────────────

  r.get("/alumnos", requierePermiso("alumnos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListadoAlumnos, req.query);
    const pag = leerPaginacion(q);
    const condiciones: Record<string, unknown>[] = [await dondeAlumnoVisible(ctx)];
    if (q.estatus) condiciones.push({ estatus: q.estatus });
    if (q.sucursal_id) condiciones.push({ sucursal_id: q.sucursal_id });
    if (q.con_atraso) condiciones.push({ id: { in: (await atrasados(ctx)).alumnoIds } });
    if (q.vertical_id) condiciones.push({ inscripciones: { some: { eliminado_en: null, estatus: { in: ["activa", "congelada"] }, grupo: { programa: { vertical_id: q.vertical_id } } } } });
    if (q.tutor_id) condiciones.push({ tutores: { some: { tutor_id: q.tutor_id, eliminado_en: null } } });
    if (q.telefono !== undefined) {
      // Por el teléfono de algún adulto de la familia. El maestro no busca por teléfono (no ve cómo contactar a la familia).
      if (ctx.usuario.rol === "maestro") throw validacion([{ campo: "telefono", mensaje: "No puedes buscar por teléfono" }]);
      condiciones.push({ tutores: { some: { eliminado_en: null, tutor: { telefono: telefonoOError("telefono", q.telefono) } } } });
    }
    // Por nombre, sin importar mayúsculas ni acentos (se compara después de aplicar el alcance y los demás filtros).
    let incompleta = false;
    if (q.nombre && q.nombre.trim() !== "") {
      const r = await idsPorNombre(
        (tomar) => ctx.db.alumno.findMany({ where: { AND: condiciones }, select: { id: true, nombre: true, apellidos: true }, orderBy: [{ apellidos: "asc" }, { nombre: "asc" }, { id: "asc" }], take: tomar }),
        (a) => `${a.nombre} ${a.apellidos}`,
        q.nombre,
        deps.topeDeBusquedaPorNombre,
      );
      incompleta = r.incompleta;
      condiciones.push({ id: { in: r.ids } });
    }
    const where = { AND: condiciones };
    const hoy = hoyUTC(ctx);
    const respuesta = await paginar(
      pag,
      () => ctx.db.alumno.count({ where }),
      async (saltar, tomar) => (await ctx.db.alumno.findMany({ where, select: SELECCION_ALUMNO, orderBy: [{ apellidos: "asc" }, { nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map((a) => presentarAlumno(a as FilaAlumno, ctx.usuario.rol, hoy)),
    );
    res.json(incompleta ? { ...respuesta, paginacion: { ...respuesta.paginacion, busqueda_incompleta: true } } : respuesta);
  });

  r.get("/alumnos/:id", requierePermiso("alumnos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const a = await alumnoVisible(ctx, id);
    res.json(presentarAlumno(a, ctx.usuario.rol, hoyUTC(ctx), await autorizaUsoDeImagen(ctx.db, id)));
  });

  r.post("/alumnos", requierePermiso("alumnos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAltaAlumno, req.body);
    exigirFechaDeNacimiento(ctx, e.fecha_nacimiento);
    exigirAntecedentes(e);
    if (e.tutores.length === 0) throw validacion([{ campo: "tutores", mensaje: "Un alumno necesita al menos un tutor" }]);
    if (e.tutores.filter((t) => t.es_responsable_pago).length > 1) throw validacion([{ campo: "tutores", mensaje: "Solo un adulto puede ser el responsable de pago" }]);
    if (e.tutores.filter((t) => t.lo_lleva).length > 1) throw validacion([{ campo: "tutores", mensaje: "Solo un adulto puede ser quien lo lleva" }]);
    const sucursalId = await sucursalDeAlta(ctx, e.sucursal_id);
    const sinResponsable = !e.tutores.some((t) => t.es_responsable_pago);
    const alumnoId = await comoConflicto("El alumno ya está ligado a ese tutor", () =>
      ctx.db.$transaction(async (tx) => {
        const datos: DatosDeAlumno = {
          nombre: e.nombre,
          apellidos: e.apellidos,
          fecha_nacimiento: e.fecha_nacimiento,
          sexo: e.sexo ?? null,
          sucursal_id: sucursalId,
          escuela_nombre: e.escuela_nombre ?? null,
          escuela_turno: e.escuela_turno ?? null,
          talla_uniforme: e.talla_uniforme ?? null,
          practico_antes: e.practico_antes ?? null,
          practico_donde: e.practico_donde ?? null,
          practico_nivel: e.practico_nivel ?? null,
          motivo_clase: e.motivo_clase ?? null,
          motivo_clase_detalle: e.motivo_clase_detalle ?? null,
        };
        const id = await crearAlumno(tx, datos);
        await registrarCambio(tx, ctx, { entidad: "alumno", entidadId: id, accion: "crear", despues: instAlumno("activo", sucursalId, camposTocados({ ...e, tutores: undefined })) });
        let i = 0;
        for (const v of e.tutores) {
          const tutor = await resolverTutor(ctx, tx, v, `tutores[${i}]`, sucursalId);
          // Si nadie se marcó como responsable de pago, lo es el primero (un alumno sin responsable de pago no tiene a quién cobrarle).
          const responsable = v.es_responsable_pago ?? (sinResponsable && i === 0);
          const l = await vincularTutor(tx, { tutorId: tutor.id, alumnoId: id, parentesco: v.parentesco, es_responsable_pago: responsable, es_contacto_urgencia: v.es_contacto_urgencia ?? false, puede_recoger: v.puede_recoger ?? false, lo_lleva: v.lo_lleva ?? false });
          if (!l.ok) throw conflicto("El alumno ya tiene un responsable de pago");
          if (!l.creado) throw validacion([{ campo: `tutores[${i}]`, mensaje: "Ese tutor está repetido" }]);
          await registrarCambio(tx, ctx, { entidad: "tutor_alumno", entidadId: l.id, accion: "crear", despues: instVinculo({ tutor_id: tutor.id, alumno_id: id, parentesco: v.parentesco, es_responsable_pago: responsable, es_contacto_urgencia: v.es_contacto_urgencia ?? false, puede_recoger: v.puede_recoger ?? false, lo_lleva: v.lo_lleva ?? false }) });
          i++;
        }
        return id;
      }),
    );
    res.status(201).json(presentarAlumno(await alumnoVisible(ctx, alumnoId), ctx.usuario.rol, hoyUTC(ctx), false));
  });

  r.patch("/alumnos/:id", requierePermiso("alumnos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambioAlumno, req.body);
    const antes = await alumnoVisible(ctx, id);
    const campos = camposTocados(e);
    if (campos.length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    if (e.fecha_nacimiento !== undefined) exigirFechaDeNacimiento(ctx, e.fecha_nacimiento);
    // Los antecedentes se validan con lo que quedaría (lo que ya había más lo nuevo).
    exigirAntecedentes({
      practico_antes: e.practico_antes !== undefined ? e.practico_antes : antes.practico_antes,
      practico_donde: e.practico_donde !== undefined ? e.practico_donde : antes.practico_donde,
      practico_nivel: e.practico_nivel !== undefined ? e.practico_nivel : antes.practico_nivel,
      motivo_clase: e.motivo_clase !== undefined ? e.motivo_clase : antes.motivo_clase,
      motivo_clase_detalle: e.motivo_clase_detalle !== undefined ? e.motivo_clase_detalle : antes.motivo_clase_detalle,
    });
    const sucursalId = e.sucursal_id !== undefined ? (e.sucursal_id === null ? null : await sucursalDeAlta(ctx, e.sucursal_id)) : undefined;
    await ctx.db.$transaction(async (tx) => {
      await tx.alumno.update({
        where: { id },
        data: {
          ...(e.nombre !== undefined ? { nombre: e.nombre } : {}),
          ...(e.apellidos !== undefined ? { apellidos: e.apellidos } : {}),
          ...(e.fecha_nacimiento !== undefined ? { fecha_nacimiento: new Date(`${e.fecha_nacimiento}T00:00:00.000Z`) } : {}),
          ...(e.sexo !== undefined ? { sexo: e.sexo } : {}),
          ...(sucursalId !== undefined ? { sucursal_id: sucursalId } : {}),
          ...(e.escuela_nombre !== undefined ? { escuela_nombre: e.escuela_nombre } : {}),
          ...(e.escuela_turno !== undefined ? { escuela_turno: e.escuela_turno } : {}),
          ...(e.talla_uniforme !== undefined ? { talla_uniforme: e.talla_uniforme } : {}),
          ...(e.practico_antes !== undefined ? { practico_antes: e.practico_antes } : {}),
          ...(e.practico_donde !== undefined ? { practico_donde: e.practico_donde } : {}),
          ...(e.practico_nivel !== undefined ? { practico_nivel: e.practico_nivel } : {}),
          ...(e.motivo_clase !== undefined ? { motivo_clase: e.motivo_clase } : {}),
          ...(e.motivo_clase_detalle !== undefined ? { motivo_clase_detalle: e.motivo_clase_detalle } : {}),
        },
      });
      await registrarCambio(tx, ctx, { entidad: "alumno", entidadId: id, accion: "actualizar", antes: instAlumno(antes.estatus, antes.sucursal_id, []), despues: instAlumno(antes.estatus, sucursalId !== undefined ? sucursalId : antes.sucursal_id, campos), soloDiferencias: false });
    });
    res.json(presentarAlumno(await alumnoVisible(ctx, id), ctx.usuario.rol, hoyUTC(ctx), await autorizaUsoDeImagen(ctx.db, id)));
  });

  // ── Tutores de un alumno ────────────────────────────────────────────────────────────────────────────

  r.post("/alumnos/:id/tutores", requierePermiso("alumnos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const v = parsear(esquemaVinculo, req.body);
    const alumno = await alumnoVisible(ctx, id);
    await comoConflicto("El alumno ya tiene un responsable de pago o ya está ligado a ese tutor", () =>
      ctx.db.$transaction(async (tx) => {
        const tutor = await resolverTutor(ctx, tx, v, "tutor", alumno.sucursal_id);
        const l = await vincularTutor(tx, { tutorId: tutor.id, alumnoId: id, parentesco: v.parentesco, ...(v.es_responsable_pago !== undefined ? { es_responsable_pago: v.es_responsable_pago } : {}), ...(v.es_contacto_urgencia !== undefined ? { es_contacto_urgencia: v.es_contacto_urgencia } : {}), ...(v.puede_recoger !== undefined ? { puede_recoger: v.puede_recoger } : {}), ...(v.lo_lleva !== undefined ? { lo_lleva: v.lo_lleva } : {}) });
        if (!l.ok) throw conflicto("El alumno ya tiene un responsable de pago: quítale la bandera antes");
        if (!l.creado) throw conflicto("Ese tutor ya está ligado a este alumno");
        await registrarCambio(tx, ctx, { entidad: "tutor_alumno", entidadId: l.id, accion: "crear", despues: instVinculo({ tutor_id: tutor.id, alumno_id: id, parentesco: v.parentesco, es_responsable_pago: v.es_responsable_pago ?? false, es_contacto_urgencia: v.es_contacto_urgencia ?? false, puede_recoger: v.puede_recoger ?? false, lo_lleva: v.lo_lleva ?? false }) });
        return l.id;
      }),
    );
    res.status(201).json(presentarAlumno(await alumnoVisible(ctx, id), ctx.usuario.rol, hoyUTC(ctx), await autorizaUsoDeImagen(ctx.db, id)));
  });

  r.patch("/alumnos/:id/tutores/:tutor_id", requierePermiso("alumnos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id, tutor_id } = parsear(esquemaIdYTutor, req.params);
    const e = parsear(esquemaCambioVinculo, req.body);
    await alumnoVisible(ctx, id);
    if (camposTocados(e).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    await comoConflicto("El alumno ya tiene otro responsable de pago: quítale la bandera antes", () =>
      ctx.db.$transaction(async (tx) => {
        const antes = await tx.tutor_alumno.findFirst({ where: { alumno_id: id, tutor_id }, select: { id: true, parentesco: true, es_responsable_pago: true, es_contacto_urgencia: true, puede_recoger: true, lo_lleva: true } });
        if (!antes) throw noEncontrado();
        if (e.es_responsable_pago === true && !antes.es_responsable_pago && (await tx.tutor_alumno.count({ where: { alumno_id: id, es_responsable_pago: true } })) > 0) throw conflicto("El alumno ya tiene otro responsable de pago: quítale la bandera antes");
        const despues = {
          parentesco: e.parentesco ?? antes.parentesco,
          es_responsable_pago: e.es_responsable_pago ?? antes.es_responsable_pago,
          es_contacto_urgencia: e.es_contacto_urgencia ?? antes.es_contacto_urgencia,
          puede_recoger: e.puede_recoger ?? antes.puede_recoger,
          lo_lleva: e.lo_lleva ?? antes.lo_lleva,
        };
        await tx.tutor_alumno.update({ where: { id: antes.id }, data: despues });
        await registrarCambio(tx, ctx, { entidad: "tutor_alumno", entidadId: antes.id, accion: "actualizar", antes: instVinculo({ tutor_id, alumno_id: id, ...antes }), despues: instVinculo({ tutor_id, alumno_id: id, ...despues }) });
      }),
    );
    res.json(presentarAlumno(await alumnoVisible(ctx, id), ctx.usuario.rol, hoyUTC(ctx), await autorizaUsoDeImagen(ctx.db, id)));
  });

  r.delete("/alumnos/:id/tutores/:tutor_id", requierePermiso("alumnos:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id, tutor_id } = parsear(esquemaIdYTutor, req.params);
    await alumnoVisible(ctx, id);
    await ctx.db.$transaction(async (tx) => {
      const antes = await tx.tutor_alumno.findFirst({ where: { alumno_id: id, tutor_id }, select: { id: true, parentesco: true, es_responsable_pago: true, es_contacto_urgencia: true, puede_recoger: true, lo_lleva: true } });
      if (!antes) throw noEncontrado();
      if ((await tx.tutor_alumno.count({ where: { alumno_id: id } })) <= 1) throw conflicto("Un alumno necesita al menos un tutor: agrega otro antes de quitar a este");
      await tx.tutor_alumno.update({ where: { id: antes.id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "tutor_alumno", entidadId: antes.id, accion: "eliminar", antes: instVinculo({ tutor_id, alumno_id: id, ...antes }) });
    });
    res.status(204).end();
  });

  // F7: los tutores con UN solo hijo inscrito (inscripción activa), con las verticales en las que sí y en las que no están. Es la lista de cross-sell.
  r.get("/familias/un-solo-hijo", requierePermiso("tutores:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaCrossSell, req.query);
    const pag = leerPaginacion(q);
    const todas = await familiasConUnHijo(ctx.db, { visible: await dondeTutorVisible(ctx), hoy: hoyUTC(ctx), ...(q.sin_vertical_id ? { sinVerticalId: q.sin_vertical_id } : {}), ...(q.sucursal_id ? { sucursalId: q.sucursal_id } : {}) });
    res.json({
      datos: todas.slice(pag.saltar, pag.saltar + pag.limite).map((f) => ({
        tutor_id: f.tutorId,
        nombre: f.nombre,
        apellidos: f.apellidos,
        telefono: f.telefono,
        sucursal_id: f.sucursalId,
        alumno: { id: f.alumno.id, nombre: f.alumno.nombre, apellidos: f.alumno.apellidos, edad: f.alumno.edad },
        verticales_inscritas: f.verticalesInscritas,
        verticales_sin: f.verticalesSin.map((v) => ({ id: v.id, nombre: v.nombre, disponible_en_su_sucursal: v.disponibleEnSuSucursal })),
      })),
      paginacion: { pagina: pag.pagina, limite: pag.limite, total: todas.length },
    });
  });

  // R6b: lo que la lista y la ficha de familias muestran de cada tutor, en una lectura por lote. Solo las familias que quien pregunta ve (las demás ni aparecen); sin permiso de importes
  // o con finanzas apagado, `saldo` va en null.
  r.get("/familias/resumen", requierePermiso("tutores:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const crudo = typeof req.query["tutor_ids"] === "string" ? req.query["tutor_ids"].split(",").map((x) => x.trim()).filter((x) => x !== "") : [];
    const { tutor_ids: pedidos } = parsear(esquemaResumen, { tutor_ids: crudo });
    const visibles = await ctx.db.tutor.findMany({ where: { AND: [{ id: { in: pedidos } }, await dondeTutorVisible(ctx)] }, select: { id: true } });
    const ids = new Set(visibles.map((t) => t.id));
    const verImportes = tienePermiso(ctx.usuario.rol, "estado_cuenta:leer");
    const modulos = await leerModulos(ctx.db);
    const familias = await resumenDeFamilias(ctx.db, pedidos.filter((id) => ids.has(id)), { ahora: ctx.ahora(), conSaldo: verImportes && modulos.finanzas, conImportes: verImportes });
    res.json({ datos: familias });
  });

  r.get("/familias/:id/mensajes", requierePermiso("tutores:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const tutor = await ctx.db.tutor.findFirst({ where: { id, ...(await dondeTutorVisible(ctx)) }, select: { id: true, telefono: true } });
    if (!tutor) throw noEncontrado();
    const modulos = await leerModulos(ctx.db);
    res.json(await mensajesDeFamilia(ctx.db, tutor, { conCobranza: modulos.finanzas }));
  });

  return r;
}
