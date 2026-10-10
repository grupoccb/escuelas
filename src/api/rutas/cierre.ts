// «Listo para cerrar» (F6): el maestro (o el asesor) marca que la familia quedó lista para inscribirse al terminar la clase muestra.
//
//   POST /api/clases-muestra/:id/listo-para-cerrar     (clases_muestra:listo_para_cerrar: administrador, asesor, maestro)
//
// Solo de una clase a la que el alumno ASISTIÓ (409 `clase_no_asistida`). Mueve al lead a la etapa de negociación (por `tipo_sistema`, con
// historial), deja UNA tarea `listo_para_cerrar` para el asesor (la ve en `GET /api/tareas`; se resuelve sola al convertirse el lead) y una nota en el
// lead. Idempotente (200 sin duplicar). Funciona igual en los dos modos de cierre: lo que cambia con el modo es quién puede CONVERTIR
// (`POST /api/leads/:id/convertir`). Alcance: el maestro, las clases de SUS grupos; el asesor, las de sus sucursales; lo ajeno es 404.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { marcarListoParaCerrar } from "../../conversion/cierre.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado } from "../errores.ts";
import { registrarCambio } from "../registro.ts";
import { objeto, parsear, uuid } from "../validar.ts";
import { alcanceDeClases } from "./clases-muestra.ts";

const esquemaId = objeto({ id: uuid() });

export function rutasDeCierre(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.post("/clases-muestra/:id/listo-para-cerrar", requierePermiso("clases_muestra:listo_para_cerrar"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    if (!(await ctx.db.clase_muestra.findFirst({ where: { id, ...(await alcanceDeClases(ctx)) }, select: { id: true } }))) throw noEncontrado();
    const r1 = await marcarListoParaCerrar(ctx.db, { organizacionId: ctx.organizacionId, usuarioId: ctx.usuario.id, ahora: ctx.ahora() }, id);
    if (!r1.ok) {
      if (r1.motivo === "clase_inexistente") throw noEncontrado();
      throw conflicto(r1.mensaje, [{ campo: "motivo", mensaje: r1.motivo }]);
    }
    if (r1.creado) {
      await ctx.db.$transaction((tx) => registrarCambio(tx, ctx, { entidad: "clase_muestra", entidadId: id, accion: "actualizar", antes: { listo_para_cerrar_en: null }, despues: { listo_para_cerrar_en: ctx.ahora() } }));
    }
    res.status(r1.creado ? 201 : 200).json({ clase_id: id, lead_id: r1.leadId, creado: r1.creado, etapa_movida: r1.etapaMovida, tarea_id: r1.tareaId });
  });

  return r;
}
