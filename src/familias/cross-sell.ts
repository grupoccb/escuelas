// La lista de cross-sell (F7): los tutores con UN solo hijo inscrito —«tutor con un solo hijo inscrito» es la lista de cross-sell más rentable de la
// escuela (contexto, sección 9)— con las verticales en las que SÍ están y en las que NO, para saber a qué ofrecerle algo más.
//
// «Inscrito» = tiene una inscripción ACTIVA (congelada o baja no cuenta). Se cuentan ALUMNOS distintos, no vínculos: una abuela y una mamá ligadas
// al mismo niño son un solo hijo. Cada familia ve lo suyo según su alcance de sucursales (`dondeTutorVisible`).

import type { BaseDatos } from "../datos/alcance.ts";
import { edadCumplida } from "../lib/edad.ts";

export interface FamiliaDeUnHijo {
  tutorId: string;
  nombre: string;
  apellidos: string | null;
  telefono: string;
  sucursalId: string | null;
  alumno: { id: string; nombre: string; apellidos: string; edad: number | null };
  verticalesInscritas: { id: string; nombre: string }[];
  /** Las verticales activas de la organización donde NO está, y si alguna sucursal de su alumno la ofrece. */
  verticalesSin: { id: string; nombre: string; disponibleEnSuSucursal: boolean }[];
}

export interface FiltroDeCrossSell {
  /** Condición de Prisma de `dondeTutorVisible`. */
  visible: Record<string, unknown>;
  /** Solo las familias que NO están en esta vertical. */
  sinVerticalId?: string;
  sucursalId?: string;
  hoy: string;
}

export async function familiasConUnHijo(db: BaseDatos, f: FiltroDeCrossSell): Promise<FamiliaDeUnHijo[]> {
  const verticales = await db.vertical.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: [{ nombre: "asc" }, { id: "asc" }] });
  const ofrecidas = await db.sucursal_vertical.findMany({ where: { activo: true }, select: { sucursal_id: true, vertical_id: true } });
  const tutores = await db.tutor.findMany({
    where: { AND: [f.visible, ...(f.sucursalId ? [{ sucursal_id: f.sucursalId }] : []), { alumnos: { some: { eliminado_en: null, alumno: { eliminado_en: null, inscripciones: { some: { estatus: "activa", eliminado_en: null } } } } } }] },
    select: {
      id: true,
      nombre: true,
      apellidos: true,
      telefono: true,
      sucursal_id: true,
      alumnos: {
        where: { eliminado_en: null, alumno: { eliminado_en: null } },
        select: { alumno: { select: { id: true, nombre: true, apellidos: true, fecha_nacimiento: true, inscripciones: { where: { estatus: "activa", eliminado_en: null }, select: { programa: { select: { vertical_id: true, sucursal_id: true } } } } } } },
      },
    },
    orderBy: [{ apellidos: "asc" }, { nombre: "asc" }, { id: "asc" }],
  });
  const salida: FamiliaDeUnHijo[] = [];
  for (const t of tutores) {
    const inscritos = new Map<string, (typeof t.alumnos)[number]["alumno"]>();
    for (const v of t.alumnos) if (v.alumno.inscripciones.length > 0) inscritos.set(v.alumno.id, v.alumno);
    if (inscritos.size !== 1) continue;
    const a = [...inscritos.values()][0]!;
    const deSuyas = new Set(a.inscripciones.map((i) => i.programa.vertical_id));
    if (f.sinVerticalId && deSuyas.has(f.sinVerticalId)) continue;
    const sucursales = new Set(a.inscripciones.map((i) => i.programa.sucursal_id));
    const nacimiento = a.fecha_nacimiento.toISOString().slice(0, 10);
    salida.push({
      tutorId: t.id,
      nombre: t.nombre,
      apellidos: t.apellidos,
      telefono: t.telefono,
      sucursalId: t.sucursal_id,
      alumno: { id: a.id, nombre: a.nombre, apellidos: a.apellidos, edad: nacimiento <= f.hoy ? edadCumplida(nacimiento, f.hoy) : null },
      verticalesInscritas: verticales.filter((v) => deSuyas.has(v.id)),
      verticalesSin: verticales.filter((v) => !deSuyas.has(v.id)).map((v) => ({ id: v.id, nombre: v.nombre, disponibleEnSuSucursal: ofrecidas.some((o) => o.vertical_id === v.id && sucursales.has(o.sucursal_id)) })),
    });
  }
  return salida;
}
