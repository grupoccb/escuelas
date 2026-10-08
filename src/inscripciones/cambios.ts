// Lo que le pasa a una inscripción después de nacer (F5): cambio de grupo, congelar, reactivar y baja con motivo. Corren DENTRO de la
// transacción de quien llama y dejan un movimiento en `inscripcion_movimiento` (de solo anexar: de aquí sale el historial de cambios de grupo).
//
// CUPO. Quien ocupa o suelta lugares toma `bloquearCupoDeGrupo` de los grupos que toca —los dos, siempre en orden de id, para que dos cambios
// cruzados (A→B y B→A) nunca se esperen entre sí— y cuenta DESPUÉS; el disparador de la base (`inscripcion_cupo_maximo`) es la red.
//   · Cambio de grupo ATÓMICO: el lugar en el grupo nuevo y la salida del viejo son UN solo UPDATE de la fila; si no hay lugar, nada cambia.
//     Solo dentro del MISMO programa (el precio y las promociones de la inscripción son de ese programa): cambiar de programa es una baja y una
//     inscripción nueva. Una inscripción congelada no ocupa lugar: cambiarla de grupo no lo pide (lo pedirá al reactivarse).
//   · Congelar y baja LIBERAN el lugar (las congeladas y las bajas no ocupan, F4): el resultado dice en qué grupo, para que quien llama —ya
//     confirmada la transacción— avise a la lista de espera con `ofrecerLugarLiberado`.
//   · Reactivar necesita lugar: si el grupo se llenó mientras estaba congelada, 409 `grupo_lleno`.
// Cada cambio es condicional al estado que se leyó (`WHERE estatus = … AND grupo_id = …`): dos operaciones simultáneas sobre la misma
// inscripción no se pisan; la perdedora recibe `cambio_concurrente`.
//
// ALUMNO. Su `estatus` se recalcula de sus inscripciones: alguna activa → activo; si no, alguna congelada → congelado; si no → baja.
// La baja deja el precio y los descuentos congelados como estaban (para H); sus beneficios diferidos pendientes NO se entregan (H4 debe ignorar
// los de una inscripción dada de baja) y el cupo de las promociones que usó no se devuelve (ya se la aplicó).

import { InscripcionesActivas, bloquearCupoDeGrupo } from "../catalogo/cupo.ts";
import { aFecha, deFecha, type FechaISO } from "../catalogo/precios.ts";
import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { fechaLocal } from "../lib/horario.ts";
import type { ContextoDeInscripcion } from "./inscribir.ts";

export type MotivoDeRechazoDeCambio =
  | "inscripcion_inexistente"
  | "estatus_invalido"
  | "grupo_inexistente"
  | "otro_programa"
  | "mismo_grupo"
  | "grupo_lleno"
  | "ya_inscrito"
  | "motivo_inexistente"
  | "cambio_concurrente";

export interface Antes {
  estatus: string;
  grupoId: string;
  fechaBaja: string | null;
  motivoBajaId: string | null;
}

export type ResultadoDeCambio =
  | { ok: true; inscripcionId: string; alumnoId: string; antes: Antes; despues: Antes; /** El grupo que soltó un lugar activo (para avisar a la lista de espera ya confirmada la transacción). */ liberaLugarEn: string | null }
  | { ok: false; motivo: MotivoDeRechazoDeCambio; mensaje: string };

const FUENTE = new InscripcionesActivas();
const rechazo = (motivo: MotivoDeRechazoDeCambio, mensaje: string): ResultadoDeCambio => ({ ok: false, motivo, mensaje });

async function cargar(tx: Consultas, id: string) {
  return tx.inscripcion.findFirst({
    where: { id },
    select: { id: true, alumno_id: true, grupo_id: true, programa_id: true, estatus: true, fecha_inicio: true, fecha_baja: true, motivo_baja_id: true, grupo: { select: { programa: { select: { sucursal: { select: { zona_horaria: true } } } } } } },
  });
}
type Cargada = NonNullable<Awaited<ReturnType<typeof cargar>>>;
const instantanea = (i: { estatus: string; grupo_id: string; fecha_baja: Date | null; motivo_baja_id: string | null }): Antes => ({ estatus: i.estatus, grupoId: i.grupo_id, fechaBaja: i.fecha_baja ? deFecha(i.fecha_baja) : null, motivoBajaId: i.motivo_baja_id });
const hoyDe = (i: Cargada, ahora: Date): FechaISO => fechaLocal(ahora, i.grupo.programa.sucursal.zona_horaria);

/** Recalcula el estatus del alumno con sus inscripciones (ver el encabezado). */
export async function recalcularEstatusDelAlumno(tx: Consultas, alumnoId: string): Promise<"activo" | "congelado" | "baja"> {
  const [activas, congeladas] = [await tx.inscripcion.count({ where: { alumno_id: alumnoId, estatus: "activa" } }), await tx.inscripcion.count({ where: { alumno_id: alumnoId, estatus: "congelada" } })];
  const estatus = activas > 0 ? ("activo" as const) : congeladas > 0 ? ("congelado" as const) : ("baja" as const);
  await tx.alumno.updateMany({ where: { id: alumnoId }, data: { estatus } });
  return estatus;
}

async function movimiento(tx: Consultas, ctx: ContextoDeInscripcion, m: { inscripcionId: string; tipo: "cambio_grupo" | "congelacion" | "reactivacion" | "baja"; fecha: FechaISO; grupoAnteriorId?: string; grupoNuevoId?: string; motivoBajaId?: string }): Promise<void> {
  await tx.inscripcion_movimiento.create({
    data: altaConAlcance({
      inscripcion_id: m.inscripcionId,
      tipo: m.tipo,
      fecha: aFecha(m.fecha),
      usuario_id: ctx.usuarioId,
      grupo_anterior_id: m.grupoAnteriorId ?? null,
      grupo_nuevo_id: m.grupoNuevoId ?? null,
      motivo_baja_id: m.motivoBajaId ?? null,
      creado_en: ctx.ahora,
    }),
  });
}

async function ok(tx: Consultas, i: Cargada, antes: Antes, liberaLugarEn: string | null): Promise<ResultadoDeCambio> {
  const d = await tx.inscripcion.findFirstOrThrow({ where: { id: i.id }, select: { estatus: true, grupo_id: true, fecha_baja: true, motivo_baja_id: true } });
  await recalcularEstatusDelAlumno(tx, i.alumno_id);
  return { ok: true, inscripcionId: i.id, alumnoId: i.alumno_id, antes, despues: instantanea(d), liberaLugarEn };
}

/** Pasa la inscripción a otro grupo del MISMO programa. Atómico: o queda en el grupo nuevo o no cambia nada. */
export async function cambiarDeGrupo(tx: Consultas, ctx: ContextoDeInscripcion, e: { inscripcionId: string; grupoNuevoId: string }): Promise<ResultadoDeCambio> {
  const i = await cargar(tx, e.inscripcionId);
  if (!i) return rechazo("inscripcion_inexistente", "No se encontró la inscripción");
  if (i.estatus === "baja") return rechazo("estatus_invalido", "Una inscripción dada de baja no cambia de grupo");
  if (e.grupoNuevoId === i.grupo_id) return rechazo("mismo_grupo", "Ya está en ese grupo");
  const destino = await tx.grupo.findFirst({ where: { id: e.grupoNuevoId, activo: true }, select: { id: true, cupo_maximo: true, programa_id: true, programa: { select: { activo: true } } } });
  if (!destino || !destino.programa.activo) return rechazo("grupo_inexistente", "No se encontró el grupo, o ya no está activo");
  if (destino.programa_id !== i.programa_id) return rechazo("otro_programa", "El grupo es de otro programa: cambiar de programa es una baja y una inscripción nueva");
  // Los dos grupos, siempre en el mismo orden.
  for (const g of [i.grupo_id, destino.id].sort()) await bloquearCupoDeGrupo(tx, g);
  if (await tx.inscripcion.count({ where: { alumno_id: i.alumno_id, grupo_id: destino.id, estatus: "activa", id: { not: i.id } } })) return rechazo("ya_inscrito", "El alumno ya está inscrito en ese grupo");
  if (i.estatus === "activa" && (await FUENTE.ocupados(tx, destino.id)) >= destino.cupo_maximo) return rechazo("grupo_lleno", "El grupo ya no tiene lugares: no se cambió nada");
  const antes = instantanea(i);
  const r = await tx.inscripcion.updateMany({ where: { id: i.id, grupo_id: i.grupo_id, estatus: i.estatus }, data: { grupo_id: destino.id } });
  if (r.count !== 1) return rechazo("cambio_concurrente", "La inscripción cambió mientras tanto: vuelve a intentarlo");
  await movimiento(tx, ctx, { inscripcionId: i.id, tipo: "cambio_grupo", fecha: hoyDe(i, ctx.ahora), grupoAnteriorId: i.grupo_id, grupoNuevoId: destino.id });
  return ok(tx, i, antes, i.estatus === "activa" ? i.grupo_id : null);
}

/** Congela una inscripción activa: libera su lugar mientras tanto. */
export async function congelarInscripcion(tx: Consultas, ctx: ContextoDeInscripcion, e: { inscripcionId: string }): Promise<ResultadoDeCambio> {
  const i = await cargar(tx, e.inscripcionId);
  if (!i) return rechazo("inscripcion_inexistente", "No se encontró la inscripción");
  if (i.estatus !== "activa") return rechazo("estatus_invalido", "Solo se congela una inscripción activa");
  const hoy = hoyDe(i, ctx.ahora);
  const antes = instantanea(i);
  await bloquearCupoDeGrupo(tx, i.grupo_id);
  const r = await tx.inscripcion.updateMany({ where: { id: i.id, estatus: "activa" }, data: { estatus: "congelada", congelada_desde: aFecha(hoy) } });
  if (r.count !== 1) return rechazo("cambio_concurrente", "La inscripción cambió mientras tanto: vuelve a intentarlo");
  await movimiento(tx, ctx, { inscripcionId: i.id, tipo: "congelacion", fecha: hoy });
  return ok(tx, i, antes, i.grupo_id);
}

/** Reactiva una congelada: necesita lugar en su grupo. */
export async function reactivarInscripcion(tx: Consultas, ctx: ContextoDeInscripcion, e: { inscripcionId: string }): Promise<ResultadoDeCambio> {
  const i = await cargar(tx, e.inscripcionId);
  if (!i) return rechazo("inscripcion_inexistente", "No se encontró la inscripción");
  if (i.estatus !== "congelada") return rechazo("estatus_invalido", "Solo se reactiva una inscripción congelada");
  const grupo = await tx.grupo.findFirst({ where: { id: i.grupo_id, activo: true }, select: { cupo_maximo: true } });
  if (!grupo) return rechazo("grupo_inexistente", "El grupo ya no está activo: cámbiala a otro grupo");
  await bloquearCupoDeGrupo(tx, i.grupo_id);
  if (await tx.inscripcion.count({ where: { alumno_id: i.alumno_id, grupo_id: i.grupo_id, estatus: "activa", id: { not: i.id } } })) return rechazo("ya_inscrito", "El alumno ya tiene otra inscripción activa en ese grupo");
  if ((await FUENTE.ocupados(tx, i.grupo_id)) >= grupo.cupo_maximo) return rechazo("grupo_lleno", "El grupo se llenó mientras estaba congelada: no hay lugar para reactivarla");
  const antes = instantanea(i);
  const r = await tx.inscripcion.updateMany({ where: { id: i.id, estatus: "congelada" }, data: { estatus: "activa", congelada_desde: null } });
  if (r.count !== 1) return rechazo("cambio_concurrente", "La inscripción cambió mientras tanto: vuelve a intentarlo");
  await movimiento(tx, ctx, { inscripcionId: i.id, tipo: "reactivacion", fecha: hoyDe(i, ctx.ahora) });
  return ok(tx, i, antes, null);
}

/** Da de baja (activa o congelada) con un motivo del catálogo. Libera el lugar si lo tenía. */
export async function darDeBaja(tx: Consultas, ctx: ContextoDeInscripcion, e: { inscripcionId: string; motivoBajaId: string }): Promise<ResultadoDeCambio> {
  const i = await cargar(tx, e.inscripcionId);
  if (!i) return rechazo("inscripcion_inexistente", "No se encontró la inscripción");
  if (i.estatus === "baja") return rechazo("estatus_invalido", "La inscripción ya está dada de baja");
  if (!(await tx.motivo_baja.findFirst({ where: { id: e.motivoBajaId, activo: true }, select: { id: true } }))) return rechazo("motivo_inexistente", "No es un motivo de baja activo de la organización");
  const hoy = hoyDe(i, ctx.ahora);
  const inicio = deFecha(i.fecha_inicio);
  const fechaBaja = hoy < inicio ? inicio : hoy; // una baja antes de empezar surte efecto el día que habría empezado
  const antes = instantanea(i);
  await bloquearCupoDeGrupo(tx, i.grupo_id);
  const r = await tx.inscripcion.updateMany({ where: { id: i.id, estatus: { in: ["activa", "congelada"] } }, data: { estatus: "baja", fecha_baja: aFecha(fechaBaja), motivo_baja_id: e.motivoBajaId, congelada_desde: null } });
  if (r.count !== 1) return rechazo("cambio_concurrente", "La inscripción cambió mientras tanto: vuelve a intentarlo");
  await movimiento(tx, ctx, { inscripcionId: i.id, tipo: "baja", fecha: fechaBaja, motivoBajaId: e.motivoBajaId });
  return ok(tx, i, antes, i.estatus === "activa" ? i.grupo_id : null);
}
