// Beneficios diferidos (H4): lo que la familia ya se ganó y recepción debe entregar.
//
//   GET  /api/beneficios/por-entregar?sucursal_id=&limite=&pagina=     (beneficios:leer)    p. ej. los uniformes «gratis al pagar la primera mensualidad»
//   GET  /api/beneficios/entregados?sucursal_id=&limite=&pagina=       (beneficios:leer)    lo ya entregado, lo más reciente primero (R5b: la pestaña «Entregados» de Uniformes)
//   POST /api/beneficios/:id/entregar { producto_id?, cantidad?: 1 }    (beneficios:entregar) lo marca entregado (un beneficio de producto es UNA pieza: más de 1 es 400)
//
// Un beneficio diferido nace `pendiente` al inscribir; pasa a `liberado` EN LA MISMA TRANSACCIÓN del pago que salda la primera mensualidad (nunca por una inscripción dada de
// baja), y a `entregado` cuando recepción se lo da a la familia. Si el beneficio es un producto (`producto_gratis`), entregarlo crea la VENTA PROMOCIONAL de precio 0 y descuenta el
// stock (H5): el producto sale del beneficio o, si éste solo dice «Uniforme», de `producto_id` (una talla concreta). Cancelar el pago que lo liberó regresa a `pendiente` lo que no se
// había entregado; lo ya entregado queda en revisión (tarea `beneficio_en_revision`). Permisos: administrador y recepción entregan; el asesor lee; el maestro no. Alcance por sucursal.

import express from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { dondeInscripcionVisible } from "../../inscripciones/alcance.ts";
import { entregarBeneficio, type ResultadoDeEntregaDeBeneficio } from "../../finanzas/entrega.ts";
import { dondeEntregados, dondePorEntregar, presentarEntregado, presentarPorEntregar, SELECCION_ENTREGADOS, SELECCION_POR_ENTREGAR } from "../../finanzas/por-entregar.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { entero, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

/** Un rechazo de negocio que revierte la transacción. */
class RechazoDeEntrega extends Error {
  readonly resultado: Extract<ResultadoDeEntregaDeBeneficio, { ok: false }>;
  constructor(resultado: Extract<ResultadoDeEntregaDeBeneficio, { ok: false }>) {
    super(resultado.mensaje);
    this.resultado = resultado;
  }
}
const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({ ...esquemaPaginacion, sucursal_id: opcional(uuid()) });
const esquemaEntregar = objeto({ producto_id: opcional(uuid()), cantidad: opcional(entero({ min: 1, max: 1 })) });

export function rutasDeBeneficios(_deps: DepsApi): express.Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/beneficios/por-entregar", requierePermiso("beneficios:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const visible = await dondeInscripcionVisible(ctx);
    const where = dondePorEntregar(visible, q.sucursal_id);
    res.json(
      await paginar(
        pag,
        () => ctx.db.promocion_aplicacion.count({ where }),
        async (saltar, tomar) => (await ctx.db.promocion_aplicacion.findMany({ where, select: SELECCION_POR_ENTREGAR, orderBy: [{ liberado_en: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map((f) => presentarPorEntregar(f)),
      ),
    );
  });

  r.get("/beneficios/entregados", requierePermiso("beneficios:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const visible = await dondeInscripcionVisible(ctx);
    const where = dondeEntregados(visible, q.sucursal_id);
    res.json(
      await paginar(
        pag,
        () => ctx.db.promocion_aplicacion.count({ where }),
        async (saltar, tomar) => (await ctx.db.promocion_aplicacion.findMany({ where, select: SELECCION_ENTREGADOS, orderBy: [{ fecha_entrega: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((f) => presentarEntregado(f)),
      ),
    );
  });

  r.post("/beneficios/:id/entregar", requierePermiso("beneficios:entregar"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaEntregar, req.body ?? {});
    const visible = await dondeInscripcionVisible(ctx);
    if (!(await ctx.db.promocion_aplicacion.findFirst({ where: { id, inscripcion: visible }, select: { id: true } }))) throw noEncontrado();
    // Un rechazo se LANZA dentro de la transacción para que se revierta entera (una venta a medias, un stock descontado sin entrega).
    const resultado = await ctx.db
      .$transaction(async (tx) => {
        const x = await entregarBeneficio(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, { aplicacionId: id, productoId: e.producto_id ?? null });
        if (!x.ok) throw new RechazoDeEntrega(x);
        await registrarCambio(tx, ctx, { entidad: "promocion_aplicacion", entidadId: id, accion: "actualizar", antes: { estatus: "liberado" }, despues: { estatus: "entregado", venta_id: x.ventaId } });
        return x;
      })
      .catch((error: unknown) => (error instanceof RechazoDeEntrega ? error.resultado : Promise.reject(error)));
    if (!resultado.ok) {
      if (resultado.motivo === "inexistente") throw noEncontrado();
      if (resultado.motivo === "producto_inexistente" || resultado.motivo === "producto_de_otra_vertical") throw validacion([{ campo: "producto_id", mensaje: resultado.mensaje }], resultado.mensaje);
      throw conflicto(resultado.mensaje, [{ campo: "motivo", mensaje: resultado.motivo }]);
    }
    res.json({ id, estatus: "entregado", venta_id: resultado.ventaId });
  });

  return r;
}
