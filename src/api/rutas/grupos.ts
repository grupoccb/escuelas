// Grupos (solo lectura por ahora; la escritura del catálogo llega con C1/J7).
//
//   GET /api/grupos?programa_id=&sucursal_id=&limite=&pagina=
//
// Alcance: administrador, todos; asesor y recepción, los de sus sucursales; maestro, SOLO los grupos
// cuyo instructor está ligado a su usuario.

import { Router } from "express";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { objeto, opcional, parsearQuery, uuid } from "../validar.ts";

const esquemaListado = objeto({ ...esquemaPaginacion, programa_id: opcional(uuid()), sucursal_id: opcional(uuid()) });

export function rutasDeGrupos(_deps: DepsApi): Router {
  const r = Router();

  r.get("/grupos", requierePermiso("grupos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const alcance = await ctx.alcance();
    const filtro = filtroDeSucursal(alcance);

    const condiciones: Record<string, unknown>[] = [];
    if (ctx.usuario.rol === "maestro") condiciones.push({ instructor: { usuario_id: ctx.usuario.id, eliminado_en: null } });
    else if (filtro) condiciones.push({ programa: { sucursal_id: filtro } });
    if (q.programa_id) condiciones.push({ programa_id: q.programa_id });
    if (q.sucursal_id) condiciones.push({ programa: { sucursal_id: q.sucursal_id } });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};

    res.json(
      await paginar(
        pag,
        () => ctx.db.grupo.count({ where }),
        (saltar, tomar) =>
          ctx.db.grupo.findMany({
            where,
            select: {
              id: true,
              nombre: true,
              salon: true,
              cupo_maximo: true,
              permite_lista_espera: true,
              activo: true,
              instructor_id: true,
              programa: { select: { id: true, nombre: true, vertical_id: true, sucursal_id: true, edad_min: true, edad_max: true } },
              horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true, hora_fin_min: true }, orderBy: [{ dia_semana: "asc" }, { hora_inicio_min: "asc" }] },
            },
            orderBy: [{ nombre: "asc" }, { id: "asc" }],
            skip: saltar,
            take: tomar,
          }),
      ),
    );
  });

  return r;
}
