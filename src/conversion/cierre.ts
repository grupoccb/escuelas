// Quién cierra la inscripción (F6, decisión 7 del plan: los dos modos, por configuración de la organización).
//
//   asesor_whatsapp (por omisión)  El maestro marca «listo para cerrar» al terminar la clase muestra: el lead pasa a la etapa de negociación,
//                                  el asesor recibe una tarea (y la ve en el embudo) y SOLO el asesor o el administrador convierten.
//   maestro_en_sitio               Además, el maestro con permiso puede completar la conversión y la inscripción de SUS alumnos al terminar
//                                  la clase muestra. El cobro NO cambia: sigue siendo registro manual (H2).
//
// El modo vive en `configuracion_organizacion.modo_cierre`: cambiarlo cambia el comportamiento sin tocar código. La matriz de quién puede
// convertir en cada modo es `puedeConvertir` (pura, con su tabla de pruebas); las rutas la consultan en cada petición.

import { moverLeadAEtapa } from "../embudo/etapas.ts";
import { altaConAlcance, type BaseDatos } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import type { ModoDeCierre } from "../configuracion/index.ts";
import type { Rol } from "../auth/roles.ts";

/** ¿Puede este rol convertir al lead en alumno e inscribirlo en este modo? Recepción nunca; el maestro, solo en sitio. */
export function puedeConvertir(rol: Rol, modo: ModoDeCierre): boolean {
  switch (rol) {
    case "administrador":
    case "asesor":
      return true;
    case "maestro":
      return modo === "maestro_en_sitio";
    case "recepcion":
      return false;
  }
}

/** ¿Puede este rol marcar «listo para cerrar»? El administrador, el asesor y el maestro, en cualquier modo. */
export function puedeMarcarListo(rol: Rol): boolean {
  return rol === "administrador" || rol === "asesor" || rol === "maestro";
}

export type MotivoDeRechazoDeCierre = "clase_inexistente" | "clase_no_asistida" | "ya_inscrito";
export type ResultadoListoParaCerrar =
  | { ok: true; creado: boolean; leadId: string; etapaMovida: boolean; tareaId: string | null }
  | { ok: false; motivo: MotivoDeRechazoDeCierre; mensaje: string };

/**
 * Marca la clase muestra como «lista para cerrar»: deja constancia (cuándo y quién), mueve al lead a la etapa de negociación (solo avanza; por
 * `tipo_sistema`, con historial), crea UNA tarea para el asesor (una pendiente por lead) y una nota en el lead. Idempotente: marcarla otra vez
 * no duplica nada. Bajo el mismo candado que la conversión (`conversion:<lead>`): no se cruzan.
 */
export async function marcarListoParaCerrar(db: BaseDatos, a: { organizacionId: string; usuarioId: string; ahora: Date }, claseId: string): Promise<ResultadoListoParaCerrar> {
  const previa = await db.clase_muestra.findFirst({ where: { id: claseId }, select: { lead_id: true } });
  if (!previa) return { ok: false, motivo: "clase_inexistente", mensaje: "No se encontró la clase muestra" };
  return transaccionConBloqueo(db, a.organizacionId, `conversion:${previa.lead_id}`, async (tx): Promise<ResultadoListoParaCerrar> => {
    const clase = await tx.clase_muestra.findFirst({
      where: { id: claseId },
      select: { id: true, lead_id: true, estatus: true, listo_para_cerrar_en: true, prospecto: { select: { nombre: true } }, lead: { select: { etapa: { select: { tipo_sistema: true, es_ganado: true } } } } },
    });
    if (!clase) return { ok: false, motivo: "clase_inexistente", mensaje: "No se encontró la clase muestra" };
    if (clase.estatus !== "asistio") return { ok: false, motivo: "clase_no_asistida", mensaje: "Solo se marca «listo para cerrar» una clase a la que el alumno asistió" };
    if (clase.lead.etapa.tipo_sistema === "inscrito" || clase.lead.etapa.es_ganado) return { ok: false, motivo: "ya_inscrito", mensaje: "El lead ya está inscrito" };
    const pendiente = await tx.tarea_asesor.findFirst({ where: { lead_id: clase.lead_id, tipo: "listo_para_cerrar", estado: "pendiente" }, select: { id: true } });
    if (clase.listo_para_cerrar_en && pendiente) return { ok: true, creado: false, leadId: clase.lead_id, etapaMovida: false, tareaId: pendiente.id };

    await tx.clase_muestra.updateMany({ where: { id: clase.id, listo_para_cerrar_en: null }, data: { listo_para_cerrar_en: a.ahora, listo_para_cerrar_por_usuario_id: a.usuarioId } });
    const mov = await moverLeadAEtapa(tx, clase.lead_id, "negociacion", { motivo: "listo_para_cerrar", ahora: a.ahora });
    let tareaId = pendiente?.id ?? null;
    if (!tareaId) {
      const t = await tx.tarea_asesor.create({
        data: altaConAlcance({
          lead_id: clase.lead_id,
          clase_muestra_id: clase.id,
          tipo: "listo_para_cerrar" as const,
          descripcion: `${clase.prospecto.nombre ?? "El alumno"} terminó su clase muestra y la familia quedó lista para cerrar la inscripción. Convierte al lead (la vista previa de la conversión dice qué falta) y registra el pago.`,
        }),
        select: { id: true },
      });
      tareaId = t.id;
    }
    await tx.interaccion.create({ data: altaConAlcance({ lead_id: clase.lead_id, tipo: "nota" as const, contenido: "Clase muestra marcada «lista para cerrar» la inscripción." }) });
    return { ok: true, creado: true, leadId: clase.lead_id, etapaMovida: mov.movido, tareaId };
  });
}
