// Eventos inesperados (J8): la bandeja del administrador con lo que llegó por un webhook o por la landing y el sistema no pudo procesar (WH). Solo lectura: cada uno trae su
// tarea (la resuelve quien corresponde con `PATCH /api/tareas/:id`). NUNCA lleva el contenido del evento: `forma` es su estructura y `detalle` el error ya saneado.
//
//   GET /api/eventos-inesperados?origen=&causa=&pendientes=true&limite=&pagina=   (registro_cambios:leer: solo el administrador)
//
// Solo los de esta organización. Los que no se pudieron atar a ninguna (JSON roto, receptor desconocido) no pertenecen a nadie y no aparecen aquí: están en los logs.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { booleanoDeTexto, enumerado, objeto, opcional, parsearQuery } from "../validar.ts";

const ORIGENES = ["chatwoot", "twilio_entrante", "twilio_estado", "landing", "barrido_twilio"] as const;
const CAUSAS = ["json_invalido", "forma_inesperada", "sin_identificador", "dato_invalido", "texto_con_nul", "restriccion_base", "registro_inexistente", "bandeja_sin_aprovisionar", "reenvio_abandonado", "error_interno"] as const;
const esquemaListado = objeto({ ...esquemaPaginacion, origen: opcional(enumerado(ORIGENES)), causa: opcional(enumerado(CAUSAS)), pendientes: opcional(booleanoDeTexto()) });

export function rutasDeEventosInesperados(_deps: DepsApi): Router {
  const r = crearRouter();
  r.get("/eventos-inesperados", requierePermiso("registro_cambios:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.origen ? { origen: q.origen } : {}), ...(q.causa ? { causa: q.causa } : {}), ...(q.pendientes ? { tarea: { estado: "pendiente" as const } } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.evento_inesperado.count({ where }),
        (saltar, tomar) =>
          ctx.db.evento_inesperado.findMany({
            where,
            select: { id: true, origen: true, causa: true, detalle: true, forma: true, intentos: true, lead_id: true, conversacion_id: true, tarea_id: true, creado_en: true, actualizado_en: true, tarea: { select: { estado: true } } },
            orderBy: [{ creado_en: "desc" }, { id: "desc" }],
            skip: saltar,
            take: tomar,
          }),
      ),
    );
  });
  return r;
}
