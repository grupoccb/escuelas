// Embudo (D7): cambios de etapa con historial, motivos de pérdida, leads estancados.
//
//   PATCH  /api/leads/:id/etapa {etapa_id, motivo_perdida_id?, nota?, desde_etapa_id?}   (leads:escribir)  mueve de etapa
//   GET    /api/leads/:id/historial                                                      (leads:leer)      cambios de etapa y tiempo en cada una
//   GET    /api/leads/estancados?etapa_id=&sucursal_id=&limite=&pagina=                  (leads:leer)      leads sin movimiento más allá del umbral de su etapa
//   GET    /api/motivos-perdida?activo=                                                  (catalogo:leer)   catálogo de motivos de pérdida
//   POST   /api/motivos-perdida {nombre, codigo?, orden?} · PATCH/DELETE /api/motivos-perdida/:id   (catalogo:escribir)
//
// Reglas del movimiento en `src/embudo/transiciones.ts`. Pasar a perdido EXIGE el motivo; recuperar (de perdido a una etapa activa) EXIGE una
// nota y suma una recuperación; a una etapa de inscrito no se llega moviendo etapas (la hace la conversión, F2); de una inscrita solo el
// administrador. Un movimiento es serializado por lead; con `desde_etapa_id` (la etapa que vio quien lo pide) un lead que ya cambió responde 409.
// Alcance como el resto de los leads: administrador todos; asesor, los de sus sucursales.

import { Router } from "express";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { leadsEstancados } from "../../embudo/estancados.ts";
import { historialDeLead, moverEtapaDeLead, type MotivoDeRechazoDeMovimiento } from "../../embudo/historial.ts";
import { MENSAJE_DE_RECHAZO, type MotivoDeRechazoDeTransicion } from "../../embudo/transiciones.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { booleano, booleanoDeTexto, entero, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });
const esquemaMover = objeto({ etapa_id: uuid(), motivo_perdida_id: opcional(nulable(uuid())), nota: opcional(nulable(texto({ max: 1000 }))), desde_etapa_id: opcional(uuid()) });
const esquemaEstancados = objeto({ ...esquemaPaginacion, etapa_id: opcional(uuid()), sucursal_id: opcional(uuid()) });
const esquemaMotivos = objeto({ activo: opcional(booleanoDeTexto()) });
const esquemaNuevoMotivo = objeto({ nombre: texto({ max: 120 }), codigo: opcional(texto({ max: 40, patron: /^[a-z][a-z0-9_]*$/, mensajePatron: "Minúsculas, dígitos y guion bajo, empezando con letra" })), orden: opcional(entero({ min: 0, max: 1000 })) });
const esquemaCambioMotivo = objeto({ nombre: opcional(texto({ max: 120 })), orden: opcional(entero({ min: 0, max: 1000 })), activo: opcional(booleano()) });

const codigoDe = (nombre: string): string => {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(base) ? base : `m_${base}`.slice(0, 40);
};

const instantaneaMotivo = (m: { codigo: string; nombre: string; orden: number; activo: boolean }) => ({ codigo: m.codigo, nombre: m.nombre, orden: m.orden, activo: m.activo });

function rechazo(motivo: MotivoDeRechazoDeMovimiento): never {
  switch (motivo) {
    case "lead_inexistente":
      throw noEncontrado();
    case "etapa_inexistente":
      throw validacion([{ campo: "etapa_id", mensaje: "No es una etapa de la organización" }]);
    case "motivo_inexistente":
      throw validacion([{ campo: "motivo_perdida_id", mensaje: "No es un motivo de pérdida activo de la organización" }]);
    case "el_lead_ya_cambio":
      throw conflicto("El lead ya cambió de etapa: vuelve a cargarlo", [{ campo: "desde_etapa_id", mensaje: "El lead ya no está en esa etapa" }]);
    case "falta_motivo_perdida":
    case "motivo_sin_perdida":
      throw validacion([{ campo: "motivo_perdida_id", mensaje: MENSAJE_DE_RECHAZO[motivo] }]);
    case "falta_nota_recuperacion":
      throw validacion([{ campo: "nota", mensaje: MENSAJE_DE_RECHAZO[motivo] }]);
    default:
      throw conflicto(MENSAJE_DE_RECHAZO[motivo as MotivoDeRechazoDeTransicion]);
  }
}

export function rutasDeEmbudo(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** `where` de lead por el alcance de sucursales del usuario. */
  const dondeLead = async (ctx: ContextoApi): Promise<Record<string, unknown>> => {
    const filtro = filtroDeSucursal(await ctx.alcance());
    return filtro ? { sucursal_interes_id: filtro } : {};
  };

  // ── Estancados (antes de /leads/:id, que tomaría «estancados» por un id) ──
  r.get("/leads/estancados", requierePermiso("leads:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaEstancados, req.query);
    const pag = leerPaginacion(q);
    const donde = await dondeLead(ctx);
    const where = q.sucursal_id ? { AND: [donde, { sucursal_interes_id: q.sucursal_id }] } : donde;
    const { total, filas } = await leadsEstancados(ctx.db, ctx.ahora(), { dondeLead: where, ...(q.etapa_id ? { etapaId: q.etapa_id } : {}), saltar: pag.saltar, tomar: pag.limite });
    res.json({
      datos: filas.map((f) => ({
        id: f.id,
        nombre_contacto: f.nombreContacto,
        telefono: f.telefono,
        sucursal_interes_id: f.sucursalInteresId,
        etapa: { id: f.etapa.id, nombre: f.etapa.nombre, dias_alerta: f.etapa.diasAlerta },
        ultima_interaccion_en: f.ultimaInteraccionEn,
        creado_en: f.creadoEn,
        dias_sin_movimiento: f.diasSinMovimiento,
      })),
      paginacion: { pagina: pag.pagina, limite: pag.limite, total },
    });
  });

  r.patch("/leads/:id/etapa", requierePermiso("leads:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaMover, req.body);
    if (!(await ctx.db.lead.findFirst({ where: { id, ...(await dondeLead(ctx)) }, select: { id: true } }))) throw noEncontrado();
    const antes = await ctx.db.lead.findFirst({ where: { id }, select: { etapa_id: true, motivo_perdida_id: true, recuperaciones: true } });
    const resultado = await moverEtapaDeLead(ctx.db, { usuarioId: ctx.usuario.id, organizacionId: ctx.organizacionId, esAdministrador: ctx.usuario.rol === "administrador", ahora: ctx.ahora() }, {
      leadId: id,
      haciaEtapaId: e.etapa_id,
      motivoPerdidaId: e.motivo_perdida_id ?? null,
      nota: e.nota ?? null,
      desdeEtapaId: e.desde_etapa_id ?? null,
    });
    if (!resultado.ok) rechazo(resultado.motivo);
    const lead = await ctx.db.lead.findFirstOrThrow({ where: { id }, select: { id: true, etapa_id: true, motivo_perdida_id: true, recuperaciones: true, etapa: { select: { nombre: true } } } });
    if (resultado.cambio && antes) {
      await ctx.db.$transaction((tx) =>
        registrarCambio(tx, ctx, { entidad: "lead", entidadId: id, accion: "actualizar", antes: { etapa_id: antes.etapa_id, motivo_perdida_id: antes.motivo_perdida_id, recuperaciones: antes.recuperaciones }, despues: { etapa_id: lead.etapa_id, motivo_perdida_id: lead.motivo_perdida_id, recuperaciones: lead.recuperaciones } }),
      );
    }
    res.json({
      cambio: resultado.cambio,
      ...(resultado.cambio ? { movimiento: resultado.tipo, historial_id: resultado.historialId } : {}),
      lead: { id: lead.id, etapa_id: lead.etapa_id, etapa: lead.etapa.nombre, motivo_perdida_id: lead.motivo_perdida_id, recuperaciones: lead.recuperaciones },
    });
  });

  r.get("/leads/:id/historial", requierePermiso("leads:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const h = await historialDeLead(ctx.db, id, ctx.ahora(), await dondeLead(ctx));
    if (!h) throw noEncontrado();
    res.json({
      lead_id: h.leadId,
      etapa_actual: h.etapaActual,
      recuperaciones: h.recuperaciones,
      motivo_perdida: h.motivoPerdida,
      cambios: h.cambios.map((c) => ({
        id: c.id,
        desde: c.desde,
        hacia: c.hacia,
        origen: c.origen,
        usuario: c.usuario,
        motivo: c.motivo,
        motivo_perdida: c.motivoPerdida,
        nota: c.nota,
        es_recuperacion: c.esRecuperacion,
        creado_en: c.creadoEn,
        segundos_en_la_etapa: c.segundosEnLaEtapa,
      })),
      tiempo_por_etapa: h.tiempoPorEtapa.map((t) => ({ etapa: t.etapa, segundos: t.segundos, veces: t.veces })),
    });
  });

  // ── Motivos de pérdida ──
  r.get("/motivos-perdida", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaMotivos, req.query);
    const datos = await ctx.db.motivo_perdida.findMany({ where: q.activo === undefined ? {} : { activo: q.activo }, orderBy: [{ orden: "asc" }, { nombre: "asc" }, { id: "asc" }], select: { id: true, codigo: true, nombre: true, orden: true, activo: true } });
    res.json({ datos });
  });

  r.post("/motivos-perdida", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaNuevoMotivo, req.body);
    const codigo = e.codigo ?? codigoDe(e.nombre);
    try {
      const creado = await ctx.db.$transaction(async (tx) => {
        const m = await tx.motivo_perdida.create({ data: altaConAlcance({ codigo, nombre: e.nombre, orden: e.orden ?? 0 }), select: { id: true, codigo: true, nombre: true, orden: true, activo: true } });
        await registrarCambio(tx, ctx, { entidad: "motivo_perdida", entidadId: m.id, accion: "crear", despues: instantaneaMotivo(m) });
        return m;
      });
      res.status(201).json(creado);
    } catch (err) {
      if (esViolacionUnica(err)) throw conflicto(`Ya hay un motivo de pérdida con el código «${codigo}»`, [{ campo: "codigo", mensaje: "Ya existe" }]);
      throw err;
    }
  });

  r.patch("/motivos-perdida/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambioMotivo, req.body);
    if (Object.keys(e).length === 0) throw validacion([{ mensaje: "No hay ningún cambio" }]);
    const actual = await ctx.db.motivo_perdida.findFirst({ where: { id }, select: { id: true, codigo: true, nombre: true, orden: true, activo: true } });
    if (!actual) throw noEncontrado();
    const nuevo = await ctx.db.$transaction(async (tx) => {
      const m = await tx.motivo_perdida.update({ where: { id }, data: e, select: { id: true, codigo: true, nombre: true, orden: true, activo: true } });
      await registrarCambio(tx, ctx, { entidad: "motivo_perdida", entidadId: id, accion: "actualizar", antes: instantaneaMotivo(actual), despues: instantaneaMotivo(m) });
      return m;
    });
    res.json(nuevo);
  });

  r.delete("/motivos-perdida/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const actual = await ctx.db.motivo_perdida.findFirst({ where: { id }, select: { id: true, codigo: true, nombre: true, orden: true, activo: true } });
    if (!actual) throw noEncontrado();
    await ctx.db.$transaction(async (tx) => {
      // Baja lógica: lo que ya se perdió por este motivo conserva su referencia (el historial no se reescribe).
      await tx.motivo_perdida.update({ where: { id }, data: { eliminado_en: new Date(), activo: false } });
      await registrarCambio(tx, ctx, { entidad: "motivo_perdida", entidadId: id, accion: "eliminar", antes: instantaneaMotivo(actual) });
    });
    res.status(204).end();
  });

  return r;
}
