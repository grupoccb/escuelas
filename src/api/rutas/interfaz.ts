// Lo mínimo que la interfaz web (J) necesita y que ninguna ruta daba: el embudo (sus etapas).
//
//   GET /api/etapas   (leads:leer)   las etapas del embudo en orden, con su papel (`tipo_sistema`, ganado, perdido) y su alerta de estancamiento
//
// Solo lee. El código de la interfaz nunca busca una etapa por su nombre: usa `tipo_sistema` y las banderas `es_ganado` / `es_perdido`.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";

export function rutasDeInterfaz(_deps: DepsApi): Router {
  const r = crearRouter();

  r.get("/etapas", requierePermiso("leads:leer"), async (_req, res) => {
    const ctx = contextoDe(res);
    const datos = await ctx.db.etapa_pipeline.findMany({
      select: { id: true, nombre: true, orden: true, tipo_sistema: true, es_ganado: true, es_perdido: true, dias_alerta_sin_movimiento: true },
      orderBy: [{ orden: "asc" }, { id: "asc" }],
    });
    res.json({ datos });
  });

  return r;
}
