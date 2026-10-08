// La familia es la entidad central (invariante 13): operaciones sobre `tutor`, `alumno` y `tutor_alumno` que comparten la API de F1
// y la conversión de F2. Aquí NO se audita ni se revisan permisos (quien llama lo hace en su transacción): solo reglas de datos.
//
// Un tutor por teléfono normalizado dentro de la organización (índice único parcial en la base): `encontrarOCrearTutor` es
// seguro bajo concurrencia porque inserta con `ON CONFLICT DO NOTHING` (`skipDuplicates`) y vuelve a buscar, sin dejar
// abortada la transacción de quien llama.

import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { normalizarTelefono } from "../lib/telefono.ts";

export const PARENTESCO_MAX = 60;

export interface DatosDeTutor {
  nombre: string;
  apellidos?: string | null;
  /** YA normalizado con `normalizarTelefono()`. */
  telefono: string;
  correo?: string | null;
  direccion?: string | null;
  como_nos_conocio?: string | null;
  sucursal_id?: string | null;
}

export interface BanderasDeTutor {
  es_responsable_pago?: boolean;
  es_contacto_urgencia?: boolean;
  puede_recoger?: boolean;
  lo_lleva?: boolean;
}

export interface DatosDeAlumno {
  nombre: string;
  apellidos: string;
  /** `AAAA-MM-DD`, del acta. */
  fecha_nacimiento: string;
  sexo?: "femenino" | "masculino" | "otro" | null;
  sucursal_id?: string | null;
  escuela_nombre?: string | null;
  escuela_turno?: "matutino" | "vespertino" | "jornada_completa" | null;
  talla_uniforme?: string | null;
  practico_antes?: boolean | null;
  practico_donde?: string | null;
  practico_nivel?: string | null;
  motivo_clase?: "disciplina" | "condicion_fisica" | "socializacion" | "competencia" | "otro" | null;
  motivo_clase_detalle?: string | null;
}

const aFecha = (f: string): Date => new Date(`${f}T00:00:00.000Z`);

/** El teléfono en la única forma canónica, o null. Toda búsqueda o alta de tutor pasa por aquí (invariante 7). */
export const telefonoDeTutor = (entrada: string): string | null => normalizarTelefono(entrada);

/** El tutor con ese teléfono (cualquier formato), o null. */
export async function tutorPorTelefono(db: Consultas | BaseDatos, telefono: string): Promise<{ id: string } | null> {
  const normalizado = normalizarTelefono(telefono);
  if (!normalizado) return null;
  return db.tutor.findFirst({ where: { telefono: normalizado }, select: { id: true } });
}

const columnasDeTutor = (d: DatosDeTutor) => ({
  nombre: d.nombre,
  apellidos: d.apellidos ?? null,
  telefono: d.telefono,
  correo: d.correo ?? null,
  direccion: d.direccion ?? null,
  como_nos_conocio: d.como_nos_conocio ?? null,
  sucursal_id: d.sucursal_id ?? null,
});

/**
 * Crea el tutor si el teléfono no existe; si ya existe, NO lo toca y devuelve el que hay (`creado: false`). Dos llamadas
 * simultáneas con el mismo teléfono dejan UN tutor.
 */
export async function encontrarOCrearTutor(tx: Consultas, datos: DatosDeTutor): Promise<{ id: string; creado: boolean }> {
  const r = await tx.tutor.createMany({ data: [altaConAlcance(columnasDeTutor(datos))], skipDuplicates: true });
  const fila = await tx.tutor.findFirstOrThrow({ where: { telefono: datos.telefono }, select: { id: true } });
  return { id: fila.id, creado: r.count === 1 };
}

/** Crea el tutor; null si ya existe uno con ese teléfono (nadie lo pisa). */
export async function crearTutorNuevo(tx: Consultas, datos: DatosDeTutor): Promise<string | null> {
  const { id, creado } = await encontrarOCrearTutor(tx, datos);
  return creado ? id : null;
}

export async function crearAlumno(tx: Consultas, d: DatosDeAlumno): Promise<string> {
  const a = await tx.alumno.create({
    data: altaConAlcance({
      nombre: d.nombre,
      apellidos: d.apellidos,
      fecha_nacimiento: aFecha(d.fecha_nacimiento),
      sexo: d.sexo ?? null,
      sucursal_id: d.sucursal_id ?? null,
      escuela_nombre: d.escuela_nombre ?? null,
      escuela_turno: d.escuela_turno ?? null,
      talla_uniforme: d.talla_uniforme ?? null,
      practico_antes: d.practico_antes ?? null,
      practico_donde: d.practico_donde ?? null,
      practico_nivel: d.practico_nivel ?? null,
      motivo_clase: d.motivo_clase ?? null,
      motivo_clase_detalle: d.motivo_clase_detalle ?? null,
    }),
    select: { id: true },
  });
  return a.id;
}

export type ResultadoDeVinculo = { ok: true; id: string; creado: boolean } | { ok: false; motivo: "otro_responsable_de_pago" };

/**
 * Liga un tutor con un alumno (idempotente por el par). Si ya estaban ligados NO se cambia nada y se devuelve el vínculo
 * (`creado: false`). Un alumno tiene a lo más un responsable de pago: pedir otro devuelve el motivo.
 */
export async function vincularTutor(tx: Consultas, v: { tutorId: string; alumnoId: string; parentesco: string } & BanderasDeTutor): Promise<ResultadoDeVinculo> {
  const previo = await tx.tutor_alumno.findFirst({ where: { tutor_id: v.tutorId, alumno_id: v.alumnoId }, select: { id: true } });
  if (previo) return { ok: true, id: previo.id, creado: false };
  if (v.es_responsable_pago) {
    const otro = await tx.tutor_alumno.count({ where: { alumno_id: v.alumnoId, es_responsable_pago: true } });
    if (otro > 0) return { ok: false, motivo: "otro_responsable_de_pago" };
  }
  const t = await tx.tutor_alumno.create({
    data: altaConAlcance({
      tutor_id: v.tutorId,
      alumno_id: v.alumnoId,
      parentesco: v.parentesco,
      es_responsable_pago: v.es_responsable_pago ?? false,
      es_contacto_urgencia: v.es_contacto_urgencia ?? false,
      puede_recoger: v.puede_recoger ?? false,
      lo_lleva: v.lo_lleva ?? false,
    }),
    select: { id: true },
  });
  return { ok: true, id: t.id, creado: true };
}
