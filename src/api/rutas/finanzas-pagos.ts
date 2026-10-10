// Pagos (H2) — registro MANUAL (decisión 10: sin pasarela). Dinero SIEMPRE como texto con dos decimales, nunca número JSON.
//
//   GET  /api/pagos/propuesta?tutor_id=&monto=                                                                  (pagos:registrar)  cómo se repartiría un pago (más antiguo primero)
//   POST /api/pagos { tutor_id, monto, metodo, referencia?, fecha?, clave_idempotencia?, aplicaciones?: [{ cargo_id, monto }] }   (pagos:registrar)
//   GET  /api/pagos/corte?fecha=&sucursal_id=                                                                   (pagos:leer)       el corte de caja del día (V7): lo cobrado por usuario y forma de pago
//   GET  /api/pagos?tutor_id=&estatus=&desde=&hasta=&limite=&pagina=                                            (pagos:leer)
//   GET  /api/pagos/:id                                                                                         (pagos:leer)
//   POST /api/pagos/:id/cancelar { motivo }                                                                     (pagos:cancelar)
//
// Un pago es de una FAMILIA (tutor) y se reparte entre varios cargos de varios hijos. Sin `aplicaciones` el sistema propone el orden (el cargo más antiguo primero);
// con ellas, recepción ajusta el reparto, que tiene que sumar EXACTAMENTE el pago. Pago parcial: el último cargo alcanzado queda pendiente con saldo. Un pago mayor a lo
// adeudado se RECHAZA (409 `excedente_sin_cargo`): no hay saldo a favor. Todo en UNA transacción; los beneficios diferidos que el pago cumple se liberan en ella (H4).
// Idempotencia: `clave_idempotencia` (o el encabezado `Idempotency-Key`): un reintento devuelve el mismo pago con `repetido: true` (200); la misma clave con otro contenido es 409.
// Cancelar NO borra: el pago pasa a `cancelado`, sus aplicaciones a `revertida` y los cargos recalculan su saldo.
// Permisos: recepción y administrador escriben; el asesor lee; el maestro no ve importes (403). Alcance: la familia debe estar a la vista (por sucursal); lo ajeno es 404.

import express, { Router } from "express";
import { aFecha } from "../../catalogo/precios.ts";
import { dondeTutorVisible } from "../../familias/alcance.ts";
import { proponerDistribucion } from "../../finanzas/distribucion.ts";
import { alRegistrarPago, alCancelarPago } from "../../finanzas/despues-del-pago.ts";
import { calcularCorte, presentarCorte, type FormaDePago } from "../../finanzas/corte.ts";
import { fechaLocal } from "../../lib/horario.ts";
import { limitesDelDia } from "../../mensajeria/reglas.ts";
import { deDecimal } from "../../lib/dinero.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { METODOS_DE_PAGO, RechazoDePago, cancelarPago, cargosAbiertosDe, registrarPago } from "../../finanzas/pagos.ts";
import { presentarPago, SELECCION_PAGO, type FilaDePago } from "../../finanzas/presentar.ts";
import { aTexto, sumar } from "../../lib/dinero.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { dinero, enumerado, fechaISO, listaDe, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const ESTATUS = ["aplicado", "cancelado"] as const;
const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({ ...esquemaPaginacion, tutor_id: opcional(uuid()), estatus: opcional(enumerado(ESTATUS)), desde: opcional(fechaISO()), hasta: opcional(fechaISO()) });
const esquemaCorte = objeto({ fecha: opcional(fechaISO()), sucursal_id: opcional(uuid()) });
/** Lo máximo que se lee para un corte: un día de una escuela son decenas de pagos; más de esto sería un dato anómalo y se rechaza en lugar de dar un corte incompleto. */
const TOPE_DEL_CORTE = 5000;
const esquemaPropuesta = objeto({ tutor_id: uuid(), monto: dinero() });
const esquemaPago = objeto({
  tutor_id: uuid(),
  monto: dinero(),
  metodo: enumerado(METODOS_DE_PAGO),
  referencia: opcional(texto({ max: 120 })),
  fecha: opcional(fechaISO()),
  clave_idempotencia: opcional(texto({ min: 8, max: 120, patron: /^[A-Za-z0-9._:-]+$/, mensajePatron: "Solo letras, números y . _ : -" })),
  aplicaciones: opcional(listaDe(objeto({ cargo_id: uuid(), monto: dinero() }), { max: 50 })),
});
const esquemaCancelar = objeto({ motivo: texto({ min: 3, max: 300 }) });

/** Un rechazo de negocio de `pagos.ts` en el error de la convención. */
function errorDePago(e: RechazoDePago): never {
  if (e.motivo === "tutor_inexistente" || e.motivo === "pago_inexistente") throw noEncontrado(e.message);
  if (e.motivo === "monto_invalido") throw validacion([{ campo: "monto", mensaje: e.message }]);
  if (e.motivo === "fecha_futura" || e.motivo === "fecha_muy_antigua") throw validacion([{ campo: "fecha", mensaje: e.message }]);
  throw conflicto(e.message, [{ campo: "motivo", mensaje: e.motivo }, ...Object.entries(e.datos).map(([campo, valor]) => ({ campo, mensaje: Array.isArray(valor) ? valor.join(",") : String(valor) }))]);
}

export function rutasDePagos(_deps: DepsApi): express.Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  async function familiaVisible(ctx: ContextoApi, tutorId: string): Promise<void> {
    if (!(await ctx.db.tutor.findFirst({ where: { id: tutorId, ...(await dondeTutorVisible(ctx)) }, select: { id: true } }))) throw noEncontrado("No se encontró a la familia");
  }
  async function leer(ctx: ContextoApi, id: string): Promise<FilaDePago> {
    const f = await ctx.db.pago.findFirst({ where: { id, tutor: await dondeTutorVisible(ctx) }, select: SELECCION_PAGO });
    if (!f) throw noEncontrado();
    return f as unknown as FilaDePago;
  }

  r.get("/pagos/propuesta", requierePermiso("pagos:registrar"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaPropuesta, req.query);
    await familiaVisible(ctx, q.tutor_id);
    const abiertos = await cargosAbiertosDe(ctx.db, q.tutor_id);
    const adeudado = sumar(...abiertos.map((c) => c.saldo));
    const p = proponerDistribucion(q.monto, abiertos);
    res.json({
      tutor_id: q.tutor_id,
      monto: aTexto(q.monto),
      adeudado: aTexto(adeudado),
      ok: p.ok,
      motivo: p.ok ? null : p.motivo,
      excedente: !p.ok && p.motivo === "excedente_sin_cargo" ? aTexto(p.excedente) : null,
      aplicaciones: p.ok ? p.aplicaciones.map((a) => ({ cargo_id: a.cargoId, monto: aTexto(a.monto) })) : [],
    });
  });

  // El corte de caja del día. Va ANTES de `/pagos/:id` (si no, «corte» se leería como un identificador). Solo lee.
  r.get("/pagos/corte", requierePermiso("pagos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaCorte, req.query);
    // La zona del día: la de la sucursal pedida (que el usuario debe ver) o, si no se pide, la primera de las suyas. El día es el de la sucursal, no el del servidor.
    const filtro = filtroDeSucursal(await ctx.alcance());
    const sucursal = await ctx.db.sucursal.findFirst({
      where: { AND: [...(q.sucursal_id ? [{ id: q.sucursal_id }] : []), ...(filtro ? [{ id: filtro }] : [])] },
      select: { zona_horaria: true },
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    });
    if (q.sucursal_id && !sucursal) throw noEncontrado("No se encontró la sucursal");
    const zona = sucursal?.zona_horaria ?? "America/Mexico_City";
    const hoy = fechaLocal(ctx.ahora(), zona);
    const fecha = q.fecha ?? hoy;
    const dia = limitesDelDia(fecha, zona);
    const filas = await ctx.db.pago.findMany({
      where: { tutor: await dondeTutorVisible(ctx), OR: [{ creado_en: { gte: dia.desde, lt: dia.hasta } }, { cancelado_en: { gte: dia.desde, lt: dia.hasta } }] },
      select: {
        id: true,
        monto: true,
        metodo: true,
        referencia: true,
        creado_en: true,
        cancelado_en: true,
        motivo_cancelacion: true,
        tutor: { select: { nombre: true, apellidos: true } },
        registrado_por: { select: { id: true, nombre: true } },
        cancelado_por: { select: { id: true, nombre: true } },
      },
      orderBy: [{ creado_en: "asc" }, { id: "asc" }],
      take: TOPE_DEL_CORTE + 1,
    });
    if (filas.length > TOPE_DEL_CORTE) throw conflicto("Hay demasiados pagos ese día para un solo corte: avisa al administrador");
    const corte = calcularCorte(
      filas.map((f) => ({ id: f.id, monto: deDecimal(f.monto), metodo: f.metodo as FormaDePago, referencia: f.referencia, creado_en: f.creado_en, cancelado_en: f.cancelado_en, motivo_cancelacion: f.motivo_cancelacion, familia: `${f.tutor.nombre} ${f.tutor.apellidos ?? ""}`.trim(), registrado_por: f.registrado_por, cancelado_por: f.cancelado_por })),
      dia,
    );
    res.json({ fecha, hoy, zona_horaria: zona, ...presentarCorte(corte) });
  });

  r.post("/pagos", requierePermiso("pagos:registrar"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaPago, req.body);
    const encabezado = req.header("idempotency-key");
    const clave = e.clave_idempotencia ?? (encabezado && /^[A-Za-z0-9._:-]{8,120}$/.test(encabezado) ? encabezado : null);
    await familiaVisible(ctx, e.tutor_id);
    let registrado;
    try {
      registrado = await ctx.db.$transaction(async (tx) => {
        const p = await registrarPago(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, {
          tutorId: e.tutor_id,
          monto: e.monto,
          metodo: e.metodo,
          referencia: e.referencia ?? null,
          fecha: e.fecha ?? null,
          clave,
          aplicaciones: e.aplicaciones ? e.aplicaciones.map((a) => ({ cargoId: a.cargo_id, monto: a.monto })) : null,
        });
        if (!p.repetido) {
          // Lo que depende de que estos cargos quedaran saldados (beneficios diferidos, recordatorios de cobro) ocurre en ESTA transacción.
          await alRegistrarPago(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, p);
          await registrarCambio(tx, ctx, { entidad: "pago", entidadId: p.id, accion: "crear", despues: { tutor_id: p.tutorId, monto: aTexto(e.monto), metodo: e.metodo, fecha: e.fecha ?? null, estatus: "aplicado", aplicaciones: p.aplicaciones.map((a) => `${a.cargoId}:${aTexto(a.monto)}`) } });
        }
        return p;
      });
    } catch (error) {
      if (error instanceof RechazoDePago) errorDePago(error);
      throw error;
    }
    res.status(registrado.repetido ? 200 : 201).json({ ...presentarPago(await leer(ctx, registrado.id)), repetido: registrado.repetido });
  });

  r.get("/pagos", requierePermiso("pagos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const where = {
      tutor: await dondeTutorVisible(ctx),
      ...(q.tutor_id ? { tutor_id: q.tutor_id } : {}),
      ...(q.estatus ? { estatus: q.estatus } : {}),
      ...(q.desde || q.hasta ? { fecha: { ...(q.desde ? { gte: aFecha(q.desde) } : {}), ...(q.hasta ? { lte: aFecha(q.hasta) } : {}) } } : {}),
    };
    res.json(
      await paginar(
        pag,
        () => ctx.db.pago.count({ where }),
        async (saltar, tomar) => (await ctx.db.pago.findMany({ where, select: SELECCION_PAGO, orderBy: [{ fecha: "desc" }, { creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((f) => presentarPago(f as unknown as FilaDePago)),
      ),
    );
  });

  r.get("/pagos/:id", requierePermiso("pagos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    res.json(presentarPago(await leer(ctx, id)));
  });

  r.post("/pagos/:id/cancelar", requierePermiso("pagos:cancelar"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { motivo } = parsear(esquemaCancelar, req.body);
    await leer(ctx, id); // alcance: lo ajeno es 404
    try {
      await ctx.db.$transaction(async (tx) => {
        const c = await cancelarPago(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, { pagoId: id, motivo });
        await alCancelarPago(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, c);
        await registrarCambio(tx, ctx, { entidad: "pago", entidadId: id, accion: "actualizar", antes: { estatus: "aplicado" }, despues: { estatus: "cancelado" } });
      });
    } catch (error) {
      if (error instanceof RechazoDePago) errorDePago(error);
      throw error;
    }
    res.json(presentarPago(await leer(ctx, id)));
  });

  return r;
}
