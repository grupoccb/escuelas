// Cotizador (C5).
//
//   GET /api/cotizador?vertical_id=&sucursal_id=&edad=|fecha_nacimiento=&fecha=&hermanos_inscritos=&meses_pagados=
//
// Dada una edad (o la fecha de nacimiento), una vertical y una sucursal, devuelve los programas que le
// corresponden y, de cada uno, sus grupos activos con horarios y lugares reales, el precio vigente y las
// promociones aplicables con su desglose (importes como TEXTO decimal). Determinista y sin escritura: el
// cálculo es `src/cotizador/` y la ocupación viene de `DepsApi.fuenteOcupacion`.
//
// Permiso `cotizador:leer` (administrador y asesor) y alcance por sucursal: una sucursal fuera del alcance
// de quien pregunta responde 404, igual que una inexistente o de otra organización. `fecha` (AAAA-MM-DD)
// permite cotizar «como si fuera ese día»; por omisión, hoy en la zona horaria de la sucursal.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { cargarCatalogoCotizable } from "../../cotizador/cargar.ts";
import { cotizar } from "../../cotizador/cotizar.ts";
import { cotizacionAJson } from "../../cotizador/json.ts";
import { fechaLocal } from "../../lib/horario.ts";
import { veSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { noEncontrado, validacion } from "../errores.ts";
import { enteroDeTexto, fechaISO, objeto, opcional, parsearQuery, uuid } from "../validar.ts";

const esquemaConsulta = objeto({
  vertical_id: uuid(),
  sucursal_id: uuid(),
  edad: opcional(enteroDeTexto({ min: 0, max: 120 })),
  fecha_nacimiento: opcional(fechaISO()),
  fecha: opcional(fechaISO()),
  hermanos_inscritos: opcional(enteroDeTexto({ min: 0, max: 20 })),
  meses_pagados: opcional(enteroDeTexto({ min: 0, max: 24 })),
});

export function rutasDeCotizador(deps: DepsApi): Router {
  const r = crearRouter();

  r.get("/cotizador", requierePermiso("cotizador:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaConsulta, req.query);
    if (q.edad === undefined && q.fecha_nacimiento === undefined) throw validacion([{ campo: "edad", mensaje: "Manda la edad o la fecha de nacimiento" }]);

    if (!veSucursal(await ctx.alcance(), q.sucursal_id)) throw noEncontrado();
    const sucursal = await ctx.db.sucursal.findFirst({ where: { id: q.sucursal_id }, select: { zona_horaria: true } });
    if (!sucursal) throw noEncontrado();
    if (!(await ctx.db.vertical.findFirst({ where: { id: q.vertical_id }, select: { id: true } }))) throw validacion([{ campo: "vertical_id", mensaje: "La vertical no existe" }]);

    const fecha = q.fecha ?? fechaLocal(ctx.ahora(), sucursal.zona_horaria);
    const catalogo = await cargarCatalogoCotizable(ctx.db, { verticalId: q.vertical_id, sucursalIds: [q.sucursal_id], fecha, fuente: deps.fuenteOcupacion });
    try {
      const cotizacion = cotizar(catalogo, {
        verticalId: q.vertical_id,
        sucursalId: q.sucursal_id,
        edadDeclarada: q.edad ?? null,
        fechaNacimiento: q.fecha_nacimiento ?? null,
        hermanosInscritos: q.hermanos_inscritos ?? 0,
        mesesPagadosPorAdelantado: q.meses_pagados ?? 0,
      });
      res.json(cotizacionAJson(cotizacion));
    } catch (e) {
      if (e instanceof RangeError) throw validacion([{ mensaje: e.message }]);
      throw e;
    }
  });

  return r;
}
