// Cargos (H1) — lo que una familia debe. Dinero SIEMPRE como texto con dos decimales («1234.50»), nunca número JSON.
//
//   GET  /api/cargos?tutor_id=&alumno_id=&inscripcion_id=&concepto=&estatus=&periodo=&con_saldo=&vence_desde=&vence_hasta=&limite=&pagina=   (cargos:leer)
//   GET  /api/cargos/:id                                                                                                                      (cargos:leer)
//   POST /api/cargos { alumno_id, descripcion, monto, descuento?, fecha_vencimiento, sucursal_id? }   cargo suelto de EVENTO (cargos:escribir)
//   POST /api/cargos/:id/cancelar { motivo }                                                                                                   (cargos:escribir)
//
// Permisos: administrador y recepción escriben; el asesor lee; el maestro NO ve importes (403). El alcance es por sucursal del cargo (lo ajeno es 404).
// Los cargos de inscripción y mensualidad los genera el sistema (al inscribir y con el barrido mensual); un cargo de producto nace de una venta (H5).
// «estatus» es el guardado; «estatus_efectivo» deriva `vencido` de la fecha aunque el barrido no haya corrido; `?estatus=vencido` filtra por el efectivo.

import express from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { aFecha } from "../../catalogo/precios.ts";
import { altaConAlcance } from "../../datos/alcance.ts";
import { dondeAlumnoVisible } from "../../familias/alcance.ts";
import { dondeCargoVisible } from "../../finanzas/alcance.ts";
import { cancelarCargo, responsableDePago } from "../../finanzas/cargos.ts";
import { hoyPorSucursal, presentarCargo, SELECCION_CARGO, type FilaDeCargo } from "../../finanzas/presentar.ts";
import { aTexto, restar } from "../../lib/dinero.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { booleanoDeTexto, dinero, enumerado, fechaISO, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const CONCEPTOS = ["inscripcion", "mensualidad", "evento", "producto"] as const;
const ESTATUS = ["pendiente", "pagado", "vencido", "cancelado"] as const;
const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({
  ...esquemaPaginacion,
  tutor_id: opcional(uuid()),
  alumno_id: opcional(uuid()),
  inscripcion_id: opcional(uuid()),
  concepto: opcional(enumerado(CONCEPTOS)),
  estatus: opcional(enumerado(ESTATUS)),
  periodo: opcional(texto({ patron: /^\d{4}-(0[1-9]|1[0-2])$/, mensajePatron: "Debe ser AAAA-MM" })),
  con_saldo: opcional(booleanoDeTexto()),
  vence_desde: opcional(fechaISO()),
  vence_hasta: opcional(fechaISO()),
});
const esquemaSuelto = objeto({
  alumno_id: uuid(),
  descripcion: texto({ min: 3, max: 200 }),
  monto: dinero(),
  descuento: opcional(dinero()),
  fecha_vencimiento: fechaISO(),
  sucursal_id: opcional(uuid()),
});
const esquemaCancelar = objeto({ motivo: texto({ min: 3, max: 300 }) });

export function rutasDeCargos(_deps: DepsApi): express.Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/cargos", requierePermiso("cargos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const hoy = await hoyPorSucursal(ctx.db, ctx.ahora());
    const condiciones: Record<string, unknown>[] = [await dondeCargoVisible(ctx)];
    if (q.tutor_id) condiciones.push({ tutor_id: q.tutor_id });
    if (q.alumno_id) condiciones.push({ alumno_id: q.alumno_id });
    if (q.inscripcion_id) condiciones.push({ inscripcion_id: q.inscripcion_id });
    if (q.concepto) condiciones.push({ concepto: q.concepto });
    if (q.periodo) condiciones.push({ periodo: q.periodo });
    if (q.con_saldo === true) condiciones.push({ estatus: { in: ["pendiente", "vencido"] } });
    if (q.vence_desde) condiciones.push({ fecha_vencimiento: { gte: aFecha(q.vence_desde) } });
    if (q.vence_hasta) condiciones.push({ fecha_vencimiento: { lte: aFecha(q.vence_hasta) } });
    if (q.estatus === "vencido") {
      // El estatus EFECTIVO: guardado como vencido, o pendiente cuyo vencimiento ya pasó en el calendario de su sucursal.
      condiciones.push({ OR: [{ estatus: "vencido" }, ...[...hoy].map(([sucursal, dia]) => ({ sucursal_id: sucursal, estatus: "pendiente", fecha_vencimiento: { lt: aFecha(dia) } }))] });
    } else if (q.estatus === "pendiente") {
      condiciones.push({ OR: [...[...hoy].map(([sucursal, dia]) => ({ sucursal_id: sucursal, estatus: "pendiente", fecha_vencimiento: { gte: aFecha(dia) } }))] });
    } else if (q.estatus) {
      condiciones.push({ estatus: q.estatus });
    }
    const where = { AND: condiciones };
    res.json(
      await paginar(
        pag,
        () => ctx.db.cargo.count({ where }),
        async (saltar, tomar) => (await ctx.db.cargo.findMany({ where, select: SELECCION_CARGO, orderBy: [{ fecha_vencimiento: "asc" }, { concepto: "asc" }, { creado_en: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map((f) => presentarCargo(f as unknown as FilaDeCargo, hoy)),
      ),
    );
  });

  r.get("/cargos/:id", requierePermiso("cargos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const f = await ctx.db.cargo.findFirst({ where: { id, ...(await dondeCargoVisible(ctx)) }, select: SELECCION_CARGO });
    if (!f) throw noEncontrado();
    res.json(presentarCargo(f as unknown as FilaDeCargo, await hoyPorSucursal(ctx.db, ctx.ahora())));
  });

  r.post("/cargos", requierePermiso("cargos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaSuelto, req.body);
    const descuento = e.descuento ?? 0n;
    if (descuento > e.monto) throw validacion([{ campo: "descuento", mensaje: "No puede ser mayor que el monto" }]);
    const alumno = await ctx.db.alumno.findFirst({ where: { id: e.alumno_id, ...(await dondeAlumnoVisible(ctx)) }, select: { id: true, sucursal_id: true } });
    if (!alumno) throw noEncontrado("No se encontró el alumno");
    const tutorId = await responsableDePago(ctx.db, alumno.id);
    if (!tutorId) throw conflicto("El alumno no tiene un tutor al que cobrarle", [{ campo: "motivo", mensaje: "sin_responsable_de_pago" }]);
    let sucursalId = e.sucursal_id ?? alumno.sucursal_id;
    if (!sucursalId) {
      const insc = await ctx.db.inscripcion.findFirst({ where: { alumno_id: alumno.id, estatus: { in: ["activa", "congelada"] } }, select: { grupo: { select: { programa: { select: { sucursal_id: true } } } } }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });
      sucursalId = insc?.grupo.programa.sucursal_id ?? null;
    }
    if (!sucursalId) throw validacion([{ campo: "sucursal_id", mensaje: "El alumno no tiene sucursal: indica la que cobra" }]);
    const alcance = await ctx.alcance();
    if (!alcance.todas && !alcance.sucursalIds.includes(sucursalId)) throw noEncontrado("No se encontró la sucursal");
    if (!(await ctx.db.sucursal.findFirst({ where: { id: sucursalId }, select: { id: true } }))) throw noEncontrado("No se encontró la sucursal");
    const final = restar(e.monto, descuento);
    const estatus = final === 0n ? ("pagado" as const) : ("pendiente" as const);
    const creado = await ctx.db.$transaction(async (tx) => {
      const c = await tx.cargo.create({
        data: altaConAlcance({
          tutor_id: tutorId,
          alumno_id: alumno.id,
          sucursal_id: sucursalId,
          concepto: "evento" as const,
          descripcion: e.descripcion,
          monto: aTexto(e.monto),
          descuento: aTexto(descuento),
          monto_final: aTexto(final),
          fecha_vencimiento: aFecha(e.fecha_vencimiento),
          estatus,
          creado_por_usuario_id: ctx.usuario.id,
        }),
        select: { id: true },
      });
      await registrarCambio(tx, ctx, { entidad: "cargo", entidadId: c.id, accion: "crear", despues: { tutor_id: tutorId, alumno_id: alumno.id, sucursal_id: sucursalId, concepto: "evento", monto: aTexto(e.monto), descuento: aTexto(descuento), monto_final: aTexto(final), fecha_vencimiento: e.fecha_vencimiento, estatus } });
      return c;
    });
    const f = await ctx.db.cargo.findFirstOrThrow({ where: { id: creado.id }, select: SELECCION_CARGO });
    res.status(201).json(presentarCargo(f as unknown as FilaDeCargo, await hoyPorSucursal(ctx.db, ctx.ahora())));
  });

  r.post("/cargos/:id/cancelar", requierePermiso("cargos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { motivo } = parsear(esquemaCancelar, req.body);
    const antes = await ctx.db.cargo.findFirst({ where: { id, ...(await dondeCargoVisible(ctx)) }, select: { id: true, estatus: true } });
    if (!antes) throw noEncontrado();
    const resultado = await ctx.db.$transaction(async (tx) => {
      const c = await cancelarCargo(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, { cargoId: id, motivo });
      if (c.ok) await registrarCambio(tx, ctx, { entidad: "cargo", entidadId: id, accion: "actualizar", antes: { estatus: antes.estatus }, despues: { estatus: "cancelado" } });
      return c;
    });
    if (!resultado.ok) {
      const mensajes = { inexistente: "No se encontró el cargo", ya_cancelado: "El cargo ya está cancelado", tiene_pagos: "El cargo tiene pagos aplicados: cancela primero el pago", ya_pagado: "El cargo ya está pagado", de_venta: "Es el cargo de una venta de producto: anula la venta" } as const;
      throw conflicto(mensajes[resultado.motivo], [{ campo: "motivo", mensaje: resultado.motivo }]);
    }
    const f = await ctx.db.cargo.findFirstOrThrow({ where: { id }, select: SELECCION_CARGO });
    res.json(presentarCargo(f as unknown as FilaDeCargo, await hoyPorSucursal(ctx.db, ctx.ahora())));
  });

  return r;
}
