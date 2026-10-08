// Aviso al maestro de una clase muestra (D2, decisión 13): «plantilla por MessagingProvider y lista en la aplicación».
//
// Al agendar, reprogramar o cancelar una clase se crea, EN LA MISMA TRANSACCIÓN, un `aviso_maestro` para el instructor del grupo
// con el alumno, el grupo y la fecha (NUNCA datos de salud). Es a la vez la lista de la aplicación (`GET /api/maestro/avisos`) y la
// unidad de envío por WhatsApp: el barrido (`barrerAvisosMaestro`, cada minuto en el ciclo) los manda por MessagingProvider con
// todas sus reglas. Idempotente: uno por (clase, tipo), garantizado por la base. Si el instructor no tiene teléfono, solo queda la lista
// de la aplicación y una tarea para el asesor.

import { altaConAlcance, conAlcance, type Consultas } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import type { ValorJson } from "../datos/tipos.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import type { DatosDeAviso, MessagingProvider, TipoDeAviso } from "../mensajeria/index.ts";
import { describirSesion } from "./sesiones.ts";

export interface EntradaDeAviso {
  claseId: string;
  tipo: TipoDeAviso;
  ahora: Date;
  /** Solo `reprogramada`: cuándo era la clase y en qué zona (la de su grupo de entonces). */
  anterior?: { fechaHora: Date; zonaHoraria: string };
}

export type ResultadoDeCreacion = { creado: true; avisoId: string; sinTelefono: boolean } | { creado: false; motivo: "sin_instructor" | "ya_existia" | "clase_inexistente" };

/** Crea el aviso para el instructor del grupo de la clase. Dentro de la transacción del cambio; idempotente por (clase, tipo). */
export async function crearAvisoMaestro(tx: Consultas, e: EntradaDeAviso): Promise<ResultadoDeCreacion> {
  const clase = await tx.clase_muestra.findFirst({
    where: { id: e.claseId },
    select: {
      lead_id: true,
      fecha_hora: true,
      prospecto: { select: { nombre: true } },
      grupo: { select: { nombre: true, instructor_id: true, programa: { select: { sucursal: { select: { nombre: true, zona_horaria: true } } } } } },
    },
  });
  if (!clase) return { creado: false, motivo: "clase_inexistente" };
  const instructor = clase.grupo.instructor_id ? await tx.instructor.findFirst({ where: { id: clase.grupo.instructor_id, activo: true }, select: { id: true, nombre: true, telefono: true } }) : null;
  if (!instructor) return { creado: false, motivo: "sin_instructor" };

  const zona = clase.grupo.programa.sucursal.zona_horaria;
  const sesion = describirSesion(clase.fecha_hora, zona);
  const datos: DatosDeAviso = {
    nombre_alumno: clase.prospecto.nombre ?? "Alumno sin nombre",
    nombre_grupo: clase.grupo.nombre,
    nombre_sucursal: clase.grupo.programa.sucursal.nombre,
    fecha_clase: sesion.fecha,
    hora_clase: sesion.hora,
    fecha_hora: clase.fecha_hora.toISOString(),
    ...(e.anterior ? { fecha_anterior: describirSesion(e.anterior.fechaHora, e.anterior.zonaHoraria).completa } : {}),
  };
  const sinTelefono = !instructor.telefono;
  // Se cancela una clase de la que el instructor nunca supo por WhatsApp (su «agendada» seguía esperando): ya no se le avisa de ninguna
  // de las dos; en la lista de la aplicación quedan las dos, con el motivo.
  let nuncaSeAviso = false;
  if (e.tipo === "cancelada") {
    const pendientes = await tx.aviso_maestro.updateMany({ where: { clase_muestra_id: e.claseId, tipo: { not: "cancelada" }, entrega: "pendiente" }, data: { entrega: "descartado", motivo_entrega: "clase_ya_no_vigente" } });
    nuncaSeAviso = pendientes.count > 0;
  }
  const entrega = sinTelefono ? ("sin_telefono" as const) : nuncaSeAviso ? ("descartado" as const) : ("pendiente" as const);
  const r = await tx.aviso_maestro.createMany({
    data: [
      altaConAlcance({
        instructor_id: instructor.id,
        clase_muestra_id: e.claseId,
        tipo: e.tipo,
        datos: datos as unknown as ValorJson,
        entrega,
        motivo_entrega: sinTelefono ? "sin_telefono" : nuncaSeAviso ? "nunca_se_aviso" : null,
        programado_para: e.ahora,
      }),
    ],
    skipDuplicates: true,
  });
  if (r.count === 0) return { creado: false, motivo: "ya_existia" };
  const aviso = await tx.aviso_maestro.findFirstOrThrow({ where: { clase_muestra_id: e.claseId, tipo: e.tipo }, select: { id: true } });
  if (sinTelefono) {
    await tx.tarea_asesor.create({
      data: altaConAlcance({
        lead_id: clase.lead_id,
        clase_muestra_id: e.claseId,
        tipo: "aviso_maestro_no_enviado" as const,
        descripcion: `El maestro ${instructor.nombre} no tiene teléfono registrado: no se le avisó por WhatsApp de la clase muestra de ${datos.nombre_alumno} en ${datos.nombre_grupo} (${datos.fecha_clase} a las ${datos.hora_clase}). El aviso sí está en su lista de la aplicación; avísale tú o registra su teléfono.`,
      }),
    });
  }
  return { creado: true, avisoId: aviso.id, sinTelefono };
}

export interface DepsAvisos {
  prisma: PrismaRaiz;
  mensajeria: MessagingProvider;
  reloj?: () => Date;
  /** Limita el barrido a una organización. Sin él, recorre todas. */
  organizacionId?: string;
}

export interface ResumenAvisos {
  enviados: number;
  /** Frenados por una regla (baja, frecuencia, sin plantilla apta…). */
  bloqueados: number;
  descartados: number;
  fallidos: number;
  /** Recorridos al siguiente horario válido. */
  reprogramados: number;
  recuperados: number;
  errores: number;
}

const POR_CORRIDA = 200;

/**
 * El barrido de los avisos al maestro: recupera los que quedaron a medias y manda los pendientes que ya son de su hora. Cada
 * aviso y cada organización van aislados (un error de uno no detiene a los demás).
 */
export async function barrerAvisosMaestro(deps: DepsAvisos): Promise<ResumenAvisos> {
  const ahora = deps.reloj?.() ?? new Date();
  const resumen: ResumenAvisos = { enviados: 0, bloqueados: 0, descartados: 0, fallidos: 0, reprogramados: 0, recuperados: 0, errores: 0 };
  const organizaciones = (await listarOrganizaciones(deps.prisma)).filter((o) => deps.organizacionId === undefined || o.id === deps.organizacionId);
  for (const org of organizaciones) {
    try {
      const db = conAlcance(deps.prisma, org.id);
      resumen.recuperados += await deps.mensajeria.recuperarAvisosInciertos(db);
      const pendientes = await db.aviso_maestro.findMany({ where: { entrega: "pendiente", programado_para: { lte: ahora } }, select: { id: true }, orderBy: [{ programado_para: "asc" }, { id: "asc" }], take: POR_CORRIDA });
      for (const { id } of pendientes) {
        try {
          const r = await deps.mensajeria.avisarAInstructor(db, id);
          if (r.resultado === "enviado") resumen.enviados++;
          else if (r.resultado === "bloqueado" || r.resultado === "sin_telefono") resumen.bloqueados++;
          else if (r.resultado === "descartado") resumen.descartados++;
          else if (r.resultado === "fallido") resumen.fallidos++;
          else if (r.resultado === "pendiente") resumen.reprogramados++;
        } catch (e) {
          resumen.errores++;
          log.error("aviso_maestro_error", { organizacionId: org.id, avisoId: id, error: (e as Error).message });
        }
      }
    } catch (e) {
      resumen.errores++;
      log.error("aviso_maestro_error", { organizacionId: org.id, error: (e as Error).message });
    }
  }
  return resumen;
}
