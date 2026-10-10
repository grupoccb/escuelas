// Conversaciones (lectura): qué asesor tiene cada una.
//
//   GET /api/conversaciones?asignada_a=yo|nadie|<usuario uuid>&estado=&limite=&pagina=
//
// `asignada_a=yo` son las conversaciones que Chatwoot tiene asignadas al agente vinculado a tu
// usuario (ver POST /api/usuarios/:id/vincular-chatwoot). Alcance por sucursal de interés del lead.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { condicionDeLead } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { enumerado, objeto, opcional, parsearQuery, texto, uuid } from "../validar.ts";

const ESTADOS = ["bot", "en_atencion_humana", "cerrada", "opt_out"] as const;
const esquemaListado = objeto({ ...esquemaPaginacion, asignada_a: opcional(texto({ max: 36 })), estado: opcional(enumerado(ESTADOS)) });
const esUuid = uuid();

export function rutasDeConversaciones(_deps: DepsApi): Router {
  const r = crearRouter();

  r.get("/conversaciones", requierePermiso("conversaciones:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const alcanceDeLeads = condicionDeLead(await ctx.alcance());

    const condiciones: Record<string, unknown>[] = [];
    if (q.asignada_a === "yo") condiciones.push({ asignada_a_usuario_id: ctx.usuario.id });
    else if (q.asignada_a === "nadie") condiciones.push({ asignada_a_usuario_id: null });
    else if (q.asignada_a !== undefined) {
      const errores: { campo: string; mensaje: string }[] = [];
      const id = esUuid.leer(q.asignada_a, "asignada_a", errores);
      if (errores.length > 0 || typeof id !== "string") throw validacion([{ campo: "asignada_a", mensaje: "Debe ser «yo», «nadie» o un identificador de usuario" }]);
      condiciones.push({ asignada_a_usuario_id: id });
    }
    if (q.estado) condiciones.push({ estado: q.estado });
    if (alcanceDeLeads) condiciones.push({ lead: alcanceDeLeads });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};

    res.json(
      await paginar(
        pag,
        () => ctx.db.conversacion.count({ where }),
        (saltar, tomar) =>
          ctx.db.conversacion.findMany({
            where,
            select: {
              id: true,
              estado: true,
              lead_id: true,
              chatwoot_conversacion_id: true,
              asignada_a_usuario_id: true,
              actualizado_en: true,
              lead: { select: { nombre_contacto: true, sucursal_interes_id: true } },
            },
            orderBy: [{ actualizado_en: "desc" }, { id: "desc" }],
            skip: saltar,
            take: tomar,
          }),
      ),
    );
  });

  return r;
}
