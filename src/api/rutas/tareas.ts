// Tareas para el asesor (las que deja el sistema cuando algo no se puede resolver solo).
//
//   GET   /api/tareas?estado=&tipo=&limite=&pagina=
//   PATCH /api/tareas/:id   { estado: "hecha" | "descartada" }
//
// Alcance: por la sucursal de interés del lead de la tarea (el administrador ve todas). Una tarea
// que no existe, es de otra organización o cae fuera de tu alcance da 404, nunca 403. Resolver es
// atómico: dos personas que resuelven a la vez → una gana y la otra recibe 409.

import { Router } from "express";
import express from "express";
import { ESTADOS_DE_TAREA, TIPOS_DE_TAREA } from "../../datos/tipos.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { autenticar } from "../autenticar.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { enumerado, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  tipo: true,
  estado: true,
  descripcion: true,
  codigo_error: true,
  lead_id: true,
  conversacion_id: true,
  vence_en: true,
  resuelta_en: true,
  creado_en: true,
} as const;

const esquemaListado = objeto({ ...esquemaPaginacion, estado: opcional(enumerado(ESTADOS_DE_TAREA)), tipo: opcional(enumerado(TIPOS_DE_TAREA)) });
const esquemaId = objeto({ id: uuid() });
const esquemaResolver = objeto({ estado: enumerado(["hecha", "descartada"] as const) });

export function rutasDeTareas(deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/tareas", autenticar(deps), requierePermiso("tareas:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const filtro = filtroDeSucursal(await ctx.alcance());
    const where = { ...(q.estado ? { estado: q.estado } : {}), ...(q.tipo ? { tipo: q.tipo } : {}), ...(filtro ? { lead: { sucursal_interes_id: filtro } } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.tarea_asesor.count({ where }),
        (saltar, tomar) => ctx.db.tarea_asesor.findMany({ where, select: SELECCION, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar }),
      ),
    );
  });

  r.patch("/tareas/:id", autenticar(deps), requierePermiso("tareas:resolver"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { estado } = parsear(esquemaResolver, req.body);
    const filtro = filtroDeSucursal(await ctx.alcance());
    const where = { id, ...(filtro ? { lead: { sucursal_interes_id: filtro } } : {}) };
    const resultado = await ctx.db.$transaction(async (tx) => {
      const tarea = await tx.tarea_asesor.findFirst({ where, select: { id: true } });
      if (!tarea) throw noEncontrado();
      // Atómico: solo cambia si sigue pendiente.
      const cambio = await tx.tarea_asesor.updateMany({ where: { id, estado: "pendiente" }, data: { estado, resuelta_en: ctx.ahora() } });
      if (cambio.count !== 1) throw conflicto("La tarea ya estaba resuelta");
      return tx.tarea_asesor.findFirstOrThrow({ where: { id }, select: SELECCION });
    });
    res.json(resultado);
  });

  return r;
}
