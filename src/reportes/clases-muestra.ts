// Reporte de clases muestra (I1): agendadas, asistidas, no asistidas, canceladas y la conversión (asistidas → inscritas), por FUENTE, VERTICAL y SUCURSAL, con rango de fechas.
//
// DEFINICIONES (una sola vez, aquí)
//   · El rango de fechas es sobre el DÍA LOCAL de la clase, en la zona de la sucursal de su grupo (`desde` y `hasta` inclusive).
//   · «Agendadas» = las clases que se agendaron y no fueron reemplazadas: todas menos las `reagendada` (la nueva ocupa su lugar y SÍ cuenta), o sea agendadas + asistidas + no asistidas +
//     canceladas. «Pendientes» = las que siguen `agendada` (aún no se marca si asistió).
//   · «Asistidas» y «no asistidas» = las marcadas así por el maestro o el asesor (D4).
//   · «Inscritas» = de las asistidas, las de un prospecto que hoy tiene una inscripción (cualquier estatus: se inscribió) o las de un lead que una persona marcó como inscrito A MANO (V10b:
//     la inscripción estaba apagada; el sistema no sabe cuál de los niños, así que cuenta cada clase asistida de ese lead) y sigue sin inscripción real. «De ellas, a mano» (`inscritas_a_mano`) las desglosa.
//     Un niño con dos clases muestra asistidas cuenta en cada una; un lead nunca cuenta a mano y por inscripción a la vez.
//     CONVERSIÓN = inscritas / asistidas, en porcentaje con un decimal; «—» (null) si no hubo asistidas.
//   · La fuente sale del lead (`fuenteDe`): campaña, landing, código, anuncio o directo.
// Alcance: el administrador ve todo; el asesor, lo de SUS sucursales (la del grupo de la clase).

import { aFecha, sumarDias, type FechaISO } from "../catalogo/precios.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { inscritosAMano } from "../embudo/inscrito-a-mano.ts";
import { fechaLocal } from "../lib/horario.ts";
import { porcentajeConUnDecimal } from "../lib/razon.ts";
import { fuenteDe } from "./fuente.ts";

export interface FiltrosDeClasesMuestra {
  desde?: FechaISO;
  hasta?: FechaISO;
  verticalId?: string;
  sucursalId?: string;
  /** Si no es null, solo las clases de grupos de estas sucursales (el alcance de quien pregunta). */
  sucursalesVisibles?: string[] | null;
}

export interface FilaDeClasesMuestra {
  clave: string;
  nombre: string;
  agendadas: number;
  asistidas: number;
  no_asistidas: number;
  canceladas: number;
  pendientes: number;
  inscritas: number;
  /** V10b: de las `inscritas`, las de un lead marcado a mano como inscrito. */
  inscritas_a_mano: number;
  /** Porcentaje con un decimal («42.9») o null si no hubo asistidas. */
  conversion: string | null;
}

export interface ReporteDeClasesMuestra {
  desde: FechaISO | null;
  hasta: FechaISO | null;
  total: FilaDeClasesMuestra;
  por_fuente: FilaDeClasesMuestra[];
  por_vertical: FilaDeClasesMuestra[];
  por_sucursal: FilaDeClasesMuestra[];
}

interface Cubeta {
  nombre: string;
  agendadas: number;
  asistidas: number;
  no_asistidas: number;
  canceladas: number;
  pendientes: number;
  inscritas: number;
  inscritas_a_mano: number;
}
const nueva = (nombre: string): Cubeta => ({ nombre, agendadas: 0, asistidas: 0, no_asistidas: 0, canceladas: 0, pendientes: 0, inscritas: 0, inscritas_a_mano: 0 });
const aFila = (clave: string, c: Cubeta): FilaDeClasesMuestra => ({ clave, nombre: c.nombre, agendadas: c.agendadas, asistidas: c.asistidas, no_asistidas: c.no_asistidas, canceladas: c.canceladas, pendientes: c.pendientes, inscritas: c.inscritas, inscritas_a_mano: c.inscritas_a_mano, conversion: porcentajeConUnDecimal(c.inscritas, c.asistidas) });

export async function reporteDeClasesMuestra(db: BaseDatos, f: FiltrosDeClasesMuestra = {}): Promise<ReporteDeClasesMuestra> {
  // La sucursal pedida, acotada a lo que quien pregunta puede ver (una fuera de su alcance no da nada).
  const sucursal: string | { in: string[] } | undefined = f.sucursalesVisibles ? (f.sucursalId ? (f.sucursalesVisibles.includes(f.sucursalId) ? f.sucursalId : { in: [] }) : { in: f.sucursalesVisibles }) : f.sucursalId;
  // Ventana UTC holgada (±1 día); el filtro exacto es por el día local de cada clase.
  const clases = await db.clase_muestra.findMany({
    where: {
      estatus: { not: "reagendada" },
      ...(f.desde || f.hasta ? { fecha_hora: { ...(f.desde ? { gte: new Date(aFecha(sumarDias(f.desde, -1)).getTime()) } : {}), ...(f.hasta ? { lt: new Date(aFecha(sumarDias(f.hasta, 2)).getTime()) } : {}) } } : {}),
      grupo: { programa: { ...(f.verticalId ? { vertical_id: f.verticalId } : {}), ...(sucursal !== undefined ? { sucursal_id: sucursal } : {}) } },
    },
    select: {
      id: true,
      estatus: true,
      fecha_hora: true,
      prospecto_id: true,
      lead_id: true,
      lead: { select: { anuncio_id: true, ctwa_clid: true, atribucion: true, campana: { select: { origen: true } } } },
      grupo: { select: { programa: { select: { vertical: { select: { id: true, nombre: true } }, sucursal: { select: { id: true, nombre: true, zona_horaria: true } } } } } },
    },
  });
  const enRango = clases.filter((c) => {
    const dia = fechaLocal(c.fecha_hora, c.grupo.programa.sucursal.zona_horaria);
    return (!f.desde || dia >= f.desde) && (!f.hasta || dia <= f.hasta);
  });
  // Prospectos de las asistidas que hoy tienen una inscripción.
  const prospectos = [...new Set(enRango.filter((c) => c.estatus === "asistio").map((c) => c.prospecto_id))];
  const inscritos = new Set(
    prospectos.length === 0 ? [] : (await db.inscripcion.findMany({ where: { prospecto_id: { in: prospectos } }, select: { prospecto_id: true } })).map((i) => i.prospecto_id).filter((x): x is string => x !== null),
  );

  // V10b: los leads de esas clases que están inscritos a mano (y no tienen inscripción real).
  const manos = await inscritosAMano(db, { leadIds: [...new Set(enRango.filter((c) => c.estatus === "asistio").map((c) => c.lead_id))] });

  const total = nueva("Total");
  const fuentes = new Map<string, Cubeta>();
  const verticales = new Map<string, Cubeta>();
  const sucursales = new Map<string, Cubeta>();
  const sumar = (c: Cubeta, estatus: string, inscrita: boolean, aMano: boolean): void => {
    c.agendadas++;
    if (estatus === "asistio") {
      c.asistidas++;
      if (inscrita || aMano) c.inscritas++;
      if (aMano && !inscrita) c.inscritas_a_mano++;
    } else if (estatus === "no_asistio") c.no_asistidas++;
    else if (estatus === "cancelada") c.canceladas++;
    else c.pendientes++;
  };
  for (const c of enRango) {
    const inscrita = inscritos.has(c.prospecto_id);
    const aMano = manos.has(c.lead_id);
    const fuente = fuenteDe(c.lead);
    const { vertical, sucursal: suc } = c.grupo.programa;
    sumar(total, c.estatus, inscrita, aMano);
    sumar(fuentes.get(fuente) ?? fuentes.set(fuente, nueva(fuente)).get(fuente)!, c.estatus, inscrita, aMano);
    sumar(verticales.get(vertical.id) ?? verticales.set(vertical.id, nueva(vertical.nombre)).get(vertical.id)!, c.estatus, inscrita, aMano);
    sumar(sucursales.get(suc.id) ?? sucursales.set(suc.id, nueva(suc.nombre)).get(suc.id)!, c.estatus, inscrita, aMano);
  }
  const ordenado = (m: Map<string, Cubeta>): FilaDeClasesMuestra[] => [...m.entries()].sort((a, b) => b[1].agendadas - a[1].agendadas || (a[1].nombre < b[1].nombre ? -1 : 1)).map(([k, c]) => aFila(k, c));
  return { desde: f.desde ?? null, hasta: f.hasta ?? null, total: aFila("total", total), por_fuente: ordenado(fuentes), por_vertical: ordenado(verticales), por_sucursal: ordenado(sucursales) };
}
