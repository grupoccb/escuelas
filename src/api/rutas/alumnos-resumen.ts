// Resumen de varios alumnos para las tarjetas de la lista (R6a). Solo lectura, aditivo:
//
//   GET /api/alumnos/resumen?ids=<uuid>,<uuid>…     (alumnos:leer)    hasta 50 alumnos; los que el usuario no ve se omiten (nunca 403)
//
// Se monta ANTES de las rutas de familias: `/alumnos/:id` también casaría con «resumen». Lógica y reglas: `src/familias/resumen-de-alumnos.ts`.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { dondeAlumnoVisible } from "../../familias/alcance.ts";
import { resumirAlumnos } from "../../familias/resumen-de-alumnos.ts";
import { leerModulos } from "../../modulos/index.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { validacion } from "../errores.ts";
import { objeto, parsearQuery, texto } from "../validar.ts";

const MAXIMO_DE_IDS = 50;
const esquema = objeto({ ids: texto({ max: MAXIMO_DE_IDS * 37 }) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rutasDeResumenDeAlumnos(deps: DepsApi): Router {
  const r = crearRouter();

  r.get("/alumnos/resumen", requierePermiso("alumnos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquema, req.query);
    const pedidos = [...new Set(q.ids.split(",").map((x) => x.trim()).filter((x) => x !== ""))];
    if (pedidos.length === 0 || pedidos.length > MAXIMO_DE_IDS) throw validacion([{ campo: "ids", mensaje: `Manda de 1 a ${MAXIMO_DE_IDS} identificadores separados por comas` }]);
    if (pedidos.some((id) => !UUID.test(id))) throw validacion([{ campo: "ids", mensaje: "Cada identificador debe ser un identificador válido" }]);
    const visibles = new Set((await ctx.db.alumno.findMany({ where: { AND: [{ id: { in: pedidos } }, await dondeAlumnoVisible(ctx)] }, select: { id: true } })).map((a) => a.id));
    const ids = pedidos.map((id) => id.toLowerCase()).filter((id) => visibles.has(id));
    res.json({ datos: await resumirAlumnos(ctx.db, ids, { ahora: ctx.ahora(), rol: ctx.usuario.rol, modulos: await leerModulos(ctx.db), economico: deps.expediente.economico }) });
  });

  return r;
}
