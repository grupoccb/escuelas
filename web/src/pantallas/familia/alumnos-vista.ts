// Lo que dicen la tarjeta de «Alumnos» y el encabezado del expediente (R6a). Lógica pura, con su prueba: sin React ni red.

import type { AlumnoDeLista } from "./tipos.ts";

export type SituacionDeCuenta = "al_corriente" | "por_pagar" | "con_vencido";

/** Una fila de `GET /api/alumnos/resumen`: lo que la tarjeta necesita y la lista de alumnos no trae. */
export interface ResumenDeAlumno {
  alumno_id: string;
  inscripciones: { id: string; estatus: "activa" | "congelada"; grupo: { id: string; nombre: string }; vertical: { id: string; nombre: string; color_marca: string | null }; sucursal: { id: string; nombre: string } }[];
  /** Porcentaje de los últimos 30 días; `null` si no hay dato o el módulo de operación está apagado. */
  asistencia_30_dias: number | null;
  /** `null` para quien no ve importes. */
  cuenta: SituacionDeCuenta | null;
}

/** Por debajo de este porcentaje la asistencia se marca en ámbar y el alumno cuenta para «Solo con atraso o faltas». */
export const ASISTENCIA_BAJA = 75;

/** El porcentaje como entero (66.7 → 67). Acepta el texto que a veces llega («62»); `null` si no es un número. */
export function porcentajeEntero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export const asistenciaEsBaja = (porcentaje: number | null): boolean => porcentaje !== null && porcentaje < ASISTENCIA_BAJA;

export const SITUACION_DE_CUENTA: Record<SituacionDeCuenta, { texto: string; tono: "alerta" | "neutro" | "exito" }> = {
  con_vencido: { texto: "Con vencido", tono: "alerta" },
  por_pagar: { texto: "Por pagar", tono: "neutro" },
  al_corriente: { texto: "Al corriente", tono: "exito" },
};

/** ¿Entra en «Solo con atraso o faltas»? Con vencido o con la asistencia por debajo de `ASISTENCIA_BAJA`. Sin resumen todavía, no entra. */
export function pideAtencion(r: Pick<ResumenDeAlumno, "cuenta" | "asistencia_30_dias"> | undefined): boolean {
  if (!r) return false;
  return r.cuenta === "con_vencido" || asistenciaEsBaja(porcentajeEntero(r.asistencia_30_dias));
}

/** «7 años», «1 año»; sin edad (no hay fecha de nacimiento), nada. */
export function textoDeEdad(edad: number | null | undefined): string {
  if (edad === null || edad === undefined) return "";
  return edad === 1 ? "1 año" : `${edad} años`;
}

/** El apellido con el que se nombra a la familia: el del responsable de pago (o el primer adulto) y, si no hay adultos, el del propio alumno. */
export function apellidoDeFamilia(a: Pick<AlumnoDeLista, "apellidos" | "tutores">): string {
  const adulto = a.tutores.find((t) => t.es_responsable_pago) ?? a.tutores[0];
  return (adulto?.apellidos ?? "").trim() || a.apellidos;
}

/** «7 años · familia Rivera». */
export function lineaDeFamilia(a: Pick<AlumnoDeLista, "edad" | "apellidos" | "tutores">): string {
  const edad = textoDeEdad(a.edad);
  const familia = a.tutores.length === 0 ? "sin adultos registrados" : `familia ${apellidoDeFamilia(a)}`;
  return edad === "" ? familia : `${edad} · ${familia}`;
}

/** Las sucursales de sus inscripciones vigentes, sin repetir y en su orden. */
export function sucursalesDe(r: Pick<ResumenDeAlumno, "inscripciones"> | undefined): string[] {
  return [...new Set((r?.inscripciones ?? []).map((i) => i.sucursal.nombre))];
}

const ESTATUS_EN_PALABRAS: Record<string, readonly [string, string]> = { activo: ["activo", "activos"], congelado: ["congelado", "congelados"], baja: ["dado de baja", "dados de baja"] };

/** El subtítulo de la pantalla: cuántos alumnos hay con lo filtrado (el total que dice el servidor, no lo que cabe en la página). */
export function subtituloDeAlumnos(o: { total: number | null; estatus: string; esMaestro: boolean }): string {
  const resto = o.esMaestro ? "sin datos de contacto de la familia ni importes" : "busca por nombre del alumno o por teléfono de un adulto de la familia";
  if (o.total === null) return o.esMaestro ? "Tus alumnos (sin datos de contacto de la familia ni importes)." : "Busca por nombre del alumno o por teléfono de un adulto de la familia.";
  const cuantos = `${o.total} ${o.total === 1 ? "alumno" : "alumnos"}`;
  const palabras = ESTATUS_EN_PALABRAS[o.estatus];
  const cuales = palabras ? ` ${o.total === 1 ? palabras[0] : palabras[1]}` : "";
  return `${cuantos}${cuales} · ${resto}`;
}
