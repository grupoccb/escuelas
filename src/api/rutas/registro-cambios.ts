// Consulta del registro de cambios (solo administrador).
//
//   GET /api/registro-cambios?entidad_tipo=&entidad_id=&usuario_id=&limite=&pagina=
//
// Orden: lo más reciente primero (`creado_en` desc, `id` desc: estable entre páginas).

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { CAMPOS_AUDITABLES } from "../registro.ts";
import { enumerado, objeto, opcional, parsearQuery, uuid } from "../validar.ts";

const ENTIDADES = Object.keys(CAMPOS_AUDITABLES) as [keyof typeof CAMPOS_AUDITABLES, ...(keyof typeof CAMPOS_AUDITABLES)[]];
const esquemaListado = objeto({ ...esquemaPaginacion, entidad_tipo: opcional(enumerado(ENTIDADES)), entidad_id: opcional(uuid()), usuario_id: opcional(uuid()) });

export function rutasDeRegistroCambios(_deps: DepsApi): Router {
  const r = crearRouter();

  r.get("/registro-cambios", requierePermiso("registro_cambios:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.entidad_tipo ? { entidad_tipo: q.entidad_tipo } : {}), ...(q.entidad_id ? { entidad_id: q.entidad_id } : {}), ...(q.usuario_id ? { usuario_id: q.usuario_id } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.registro_cambio.count({ where }),
        (saltar, tomar) =>
          ctx.db.registro_cambio.findMany({
            where,
            select: { id: true, usuario_id: true, entidad_tipo: true, entidad_id: true, accion: true, antes: true, despues: true, creado_en: true },
            orderBy: [{ creado_en: "desc" }, { id: "desc" }],
            skip: saltar,
            take: tomar,
          }),
      ),
    );
  });

  return r;
}
