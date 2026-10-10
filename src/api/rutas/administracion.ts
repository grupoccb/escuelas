// Orientación para quien administra (V7, recorrido del administrador).
//
//   GET /api/administracion/primeros-pasos   (catalogo:escribir)   los ocho pasos para dejar lista una escuela nueva, cada uno con si ya está hecho (calculado contra la base: nada se marca a mano),
//                                                                  por qué falta y a qué pantalla ir; `siguiente` es el primero que falta
//
// Solo lee. Todo por el scope de la organización. No depende de ningún módulo: es parte de la configuración con la que se prepara la escuela.

import { Router } from "express";
import { calcularPrimerosPasos } from "../../administracion/primeros-pasos.ts";
import { leerModulos } from "../../modulos/index.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";

export function rutasDeAdministracion(_deps: DepsApi): Router {
  const r = Router();

  r.get("/administracion/primeros-pasos", requierePermiso("catalogo:escribir"), async (_req, res) => {
    const ctx = contextoDe(res);
    res.json(await calcularPrimerosPasos(ctx.db, ctx.ahora(), await leerModulos(ctx.db)));
  });

  return r;
}
