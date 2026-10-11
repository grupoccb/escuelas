// Lo que la tarjeta de un alumno en la lista de «Alumnos» necesita y `GET /api/alumnos` no trae (R6a): sus inscripciones vigentes (grupo, disciplina con su color y
// sucursal), el porcentaje de asistencia de 30 días y, SOLO para quien ve importes, en qué situación está su cuenta. Solo lee, y calcula con las mismas funciones que el
// expediente (`calcularDerivados`, el enchufe económico), así que ninguna cifra de aquí contradice a la del expediente. Dinero: nunca sale un importe, solo la situación.

import { calcularDerivados } from "../asistencia/derivados.ts";
import { hoyEn } from "../asistencia/pase.ts";
import type { Consultas } from "../datos/alcance.ts";
import type { ProveedorEconomico } from "../expediente/proveedores.ts";
import { deTexto } from "../lib/dinero.ts";
import type { ModulosEncendidos } from "../modulos/index.ts";

export type SituacionDeCuenta = "al_corriente" | "por_pagar" | "con_vencido";

export interface ResumenDeAlumno {
  alumno_id: string;
  /** Las inscripciones activas o congeladas (las que dan un lugar o lo guardan), la más antigua primero. */
  inscripciones: { id: string; estatus: "activa" | "congelada"; grupo: { id: string; nombre: string }; vertical: { id: string; nombre: string; color_marca: string | null }; sucursal: { id: string; nombre: string } }[];
  /** Porcentaje de los últimos 30 días con un decimal (el del expediente); `null` si no hay dato o el módulo de operación está apagado. */
  asistencia_30_dias: number | null;
  /** `null` para quien no ve importes (el maestro), con finanzas apagado o sin estado de cuenta disponible. */
  cuenta: SituacionDeCuenta | null;
}

const DIA_MS = 86_400_000;
const VENTANA_DE_LECTURA_DIAS = 45;
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** La situación de una cuenta con sus importes en centavos. Pura. */
export function situacionDeCuenta(saldo: string, vencido: string): SituacionDeCuenta {
  if (deTexto(vencido) > 0n) return "con_vencido";
  return deTexto(saldo) > 0n ? "por_pagar" : "al_corriente";
}

export interface OpcionesDelResumen {
  ahora: Date;
  rol: "administrador" | "asesor" | "recepcion" | "maestro";
  modulos: ModulosEncendidos;
  economico: ProveedorEconomico;
}

/** `alumnoIds` ya viene filtrado por el alcance de quien consulta. Sale una fila por id, en el mismo orden. */
export async function resumirAlumnos(db: Consultas, alumnoIds: readonly string[], o: OpcionesDelResumen): Promise<ResumenDeAlumno[]> {
  const inscripciones = await db.inscripcion.findMany({
    where: { alumno_id: { in: [...alumnoIds] }, estatus: { in: ["activa", "congelada"] } },
    select: {
      id: true,
      alumno_id: true,
      estatus: true,
      grupo: { select: { id: true, nombre: true, programa: { select: { vertical: { select: { id: true, nombre: true, color_marca: true } }, sucursal: { select: { id: true, nombre: true, zona_horaria: true } } } } } },
    },
    orderBy: [{ fecha_inicio: "asc" }, { creado_en: "asc" }, { id: "asc" }],
  });
  const filas = o.modulos.operacion
    ? await db.asistencia.findMany({
        where: { inscripcion_id: { in: inscripciones.filter((i) => i.estatus === "activa").map((i) => i.id) }, fecha: { gte: new Date(o.ahora.getTime() - VENTANA_DE_LECTURA_DIAS * DIA_MS) } },
        select: { inscripcion_id: true, fecha: true, estatus: true },
      })
    : [];
  const veCuenta = o.modulos.finanzas && o.rol !== "maestro";

  const salida: ResumenDeAlumno[] = [];
  for (const alumnoId of alumnoIds) {
    const suyas = inscripciones.filter((i) => i.alumno_id === alumnoId);
    const vigentes = new Set(suyas.filter((i) => i.estatus === "activa").map((i) => i.id));
    const zona = suyas[0]?.grupo.programa.sucursal.zona_horaria ?? "America/Mexico_City";
    const suyasFilas = filas.filter((f) => vigentes.has(f.inscripcion_id)).map((f) => ({ fecha: iso(f.fecha), estatus: f.estatus }));
    const cuenta = veCuenta ? await o.economico.estadoDeCuenta(db, alumnoId, o.ahora) : null;
    salida.push({
      alumno_id: alumnoId,
      inscripciones: suyas.map((i) => ({
        id: i.id,
        estatus: i.estatus as "activa" | "congelada",
        grupo: { id: i.grupo.id, nombre: i.grupo.nombre },
        vertical: { id: i.grupo.programa.vertical.id, nombre: i.grupo.programa.vertical.nombre, color_marca: i.grupo.programa.vertical.color_marca },
        sucursal: { id: i.grupo.programa.sucursal.id, nombre: i.grupo.programa.sucursal.nombre },
      })),
      asistencia_30_dias: o.modulos.operacion && vigentes.size > 0 ? calcularDerivados(suyasFilas, hoyEn(zona, o.ahora)).porcentaje : null,
      cuenta: cuenta && cuenta.disponible ? situacionDeCuenta(cuenta.saldo, cuenta.vencido) : null,
    });
  }
  return salida;
}
