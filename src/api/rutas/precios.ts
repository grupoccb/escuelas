// Precios versionados por fecha (C2).
//
//   GET    /api/precios?programa_id=&sucursal_id=&vigente_en=AAAA-MM-DD&limite=&pagina=   (catalogo:leer; por sucursal según el rol)
//   GET    /api/precios/:id                                                                 (catalogo:leer)
//   POST   /api/precios   { programa_id, costo_inscripcion, costo_mensualidad, moneda?, vigencia_desde }   (catalogo:escribir)
//   PATCH  /api/precios/:id   { costo_inscripcion?, costo_mensualidad?, vigencia_hasta?|null }
//   DELETE /api/precios/:id   baja lógica
//
// Los importes son TEXTO decimal («1234.50»), nunca número JSON, y se calculan en centavos
// (`src/lib/dinero.ts`). Las fechas son `AAAA-MM-DD` (calendario local).
//
// Alta = una vigencia NUEVA que queda abierta: la anterior (si seguía abierta o llegaba hasta esa fecha) se
// CIERRA el día previo, en la misma transacción y bajo un candado por programa; no puede haber ya una
// vigencia que empiece ese día o después. El historial de un programa es `GET /api/precios?programa_id=`.
// La base impide el traslape (restricción de exclusión): dos altas simultáneas, una gana. Cada cambio
// (incluido el cierre de la anterior) queda en el registro de cambios.

import { Router } from "express";
import express from "express";
import { aFecha, deFecha, planDeAlta } from "../../catalogo/precios.ts";
import { altaConAlcance } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { aTexto, deDecimal } from "../../lib/dinero.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { dinero, fechaISO, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  programa_id: true,
  costo_inscripcion: true,
  costo_mensualidad: true,
  moneda: true,
  vigencia_desde: true,
  vigencia_hasta: true,
  creado_en: true,
} as const;

interface FilaPrecio {
  id: string;
  programa_id: string;
  costo_inscripcion: { toFixed(n: number): string };
  costo_mensualidad: { toFixed(n: number): string };
  moneda: string;
  vigencia_desde: Date;
  vigencia_hasta: Date | null;
  creado_en: Date;
}

function presentar(f: FilaPrecio) {
  return {
    id: f.id,
    programa_id: f.programa_id,
    costo_inscripcion: aTexto(deDecimal(f.costo_inscripcion)),
    costo_mensualidad: aTexto(deDecimal(f.costo_mensualidad)),
    moneda: f.moneda,
    vigencia_desde: deFecha(f.vigencia_desde),
    vigencia_hasta: f.vigencia_hasta ? deFecha(f.vigencia_hasta) : null,
    creado_en: f.creado_en,
  };
}
const instantanea = (f: FilaPrecio): Instantanea => {
  const p = presentar(f);
  return { programa_id: p.programa_id, costo_inscripcion: p.costo_inscripcion, costo_mensualidad: p.costo_mensualidad, moneda: p.moneda, vigencia_desde: p.vigencia_desde, vigencia_hasta: p.vigencia_hasta };
};

const esquemaListado = objeto({ ...esquemaPaginacion, programa_id: opcional(uuid()), sucursal_id: opcional(uuid()), vigente_en: opcional(fechaISO()) });
const esquemaId = objeto({ id: uuid() });
const esquemaAlta = objeto({
  programa_id: uuid(),
  costo_inscripcion: dinero(),
  costo_mensualidad: dinero(),
  moneda: opcional(texto({ min: 3, max: 3, patron: /^[A-Za-z]{3}$/, mensajePatron: "Debe ser un código de 3 letras, p. ej. MXN" })),
  vigencia_desde: fechaISO(),
});
const esquemaCambio = objeto({ costo_inscripcion: opcional(dinero()), costo_mensualidad: opcional(dinero()), vigencia_hasta: opcional(nulable(fechaISO())) });

const traslape = () => conflicto("La vigencia se traslapa con otra del mismo programa", [{ campo: "vigencia_desde", mensaje: "Se traslapa con otra vigencia de precio del programa" }]);
const esTraslape = (e: unknown): boolean => e instanceof Error && e.message.includes("precio_vigencia_excl");

async function cambiar(ctx: ContextoApi, id: string, hacer: (antes: FilaPrecio, tx: Parameters<Parameters<ContextoApi["db"]["$transaction"]>[0]>[0]) => Promise<FilaPrecio>): Promise<FilaPrecio> {
  const programa = await ctx.db.precio.findFirst({ where: { id }, select: { programa_id: true } });
  if (!programa) throw noEncontrado();
  return transaccionConBloqueo(ctx.db, ctx.organizacionId, `precio:${programa.programa_id}`, async (tx) => {
    const antes = await tx.precio.findFirst({ where: { id }, select: SELECCION });
    if (!antes) throw noEncontrado();
    return hacer(antes, tx);
  });
}

export function rutasDePrecios(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/precios", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const filtro = filtroDeSucursal(await ctx.alcanceCatalogo());
    const condiciones: Record<string, unknown>[] = [];
    if (filtro) condiciones.push({ programa: { sucursal_id: filtro } });
    if (q.sucursal_id) condiciones.push({ programa: { sucursal_id: q.sucursal_id } });
    if (q.programa_id) condiciones.push({ programa_id: q.programa_id });
    if (q.vigente_en) condiciones.push({ vigencia_desde: { lte: aFecha(q.vigente_en) }, OR: [{ vigencia_hasta: null }, { vigencia_hasta: { gte: aFecha(q.vigente_en) } }] });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};
    res.json(
      await paginar(
        pag,
        () => ctx.db.precio.count({ where }),
        async (saltar, tomar) =>
          (await ctx.db.precio.findMany({ where, select: SELECCION, orderBy: [{ programa_id: "asc" }, { vigencia_desde: "desc" }, { id: "asc" }], skip: saltar, take: tomar })).map(presentar),
      ),
    );
  });

  r.get("/precios/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const filtro = filtroDeSucursal(await ctx.alcanceCatalogo());
    const f = await ctx.db.precio.findFirst({ where: { id, ...(filtro ? { programa: { sucursal_id: filtro } } : {}) }, select: SELECCION });
    if (!f) throw noEncontrado();
    res.json(presentar(f));
  });

  r.post("/precios", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAlta, req.body);
    try {
      const creado = await transaccionConBloqueo(ctx.db, ctx.organizacionId, `precio:${e.programa_id}`, async (tx) => {
        if (!(await tx.programa.findFirst({ where: { id: e.programa_id }, select: { id: true } }))) throw validacion([{ campo: "programa_id", mensaje: "El programa no existe" }]);
        const vivos = await tx.precio.findMany({ where: { programa_id: e.programa_id }, select: SELECCION });
        const plan = planDeAlta(vivos.map((v) => ({ id: v.id, desde: deFecha(v.vigencia_desde), hasta: v.vigencia_hasta ? deFecha(v.vigencia_hasta) : null })), e.vigencia_desde);
        if (!plan.ok) throw conflicto(plan.motivo, [{ campo: "vigencia_desde", mensaje: plan.motivo }]);
        if (plan.cerrar) {
          const antes = vivos.find((v) => v.id === plan.cerrar!.id)!;
          const cerrada = await tx.precio.update({ where: { id: antes.id }, data: { vigencia_hasta: aFecha(plan.cerrar.hasta) }, select: SELECCION });
          await registrarCambio(tx, ctx, { entidad: "precio", entidadId: antes.id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(cerrada) });
        }
        const p = await tx.precio.create({
          data: altaConAlcance({
            programa_id: e.programa_id,
            costo_inscripcion: aTexto(e.costo_inscripcion),
            costo_mensualidad: aTexto(e.costo_mensualidad),
            moneda: (e.moneda ?? "MXN").toUpperCase(),
            vigencia_desde: aFecha(e.vigencia_desde),
          }),
          select: SELECCION,
        });
        await registrarCambio(tx, ctx, { entidad: "precio", entidadId: p.id, accion: "crear", despues: instantanea(p) });
        return p;
      });
      res.status(201).json(presentar(creado));
    } catch (err) {
      if (esTraslape(err)) throw traslape();
      throw err;
    }
  });

  r.patch("/precios/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const cambios = parsear(esquemaCambio, req.body);
    if (Object.keys(cambios).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    try {
      const despues = await cambiar(ctx, id, async (antes, tx) => {
        if (cambios.vigencia_hasta && cambios.vigencia_hasta < deFecha(antes.vigencia_desde)) throw validacion([{ campo: "vigencia_hasta", mensaje: "No puede ser anterior al inicio de la vigencia" }]);
        const nuevo = await tx.precio.update({
          where: { id },
          data: {
            ...(cambios.costo_inscripcion !== undefined ? { costo_inscripcion: aTexto(cambios.costo_inscripcion) } : {}),
            ...(cambios.costo_mensualidad !== undefined ? { costo_mensualidad: aTexto(cambios.costo_mensualidad) } : {}),
            ...(cambios.vigencia_hasta !== undefined ? { vigencia_hasta: cambios.vigencia_hasta === null ? null : aFecha(cambios.vigencia_hasta) } : {}),
          },
          select: SELECCION,
        });
        await registrarCambio(tx, ctx, { entidad: "precio", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(nuevo) });
        return nuevo;
      });
      res.json(presentar(despues));
    } catch (err) {
      if (esTraslape(err)) throw traslape();
      throw err;
    }
  });

  r.delete("/precios/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await cambiar(ctx, id, async (antes, tx) => {
      await tx.precio.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "precio", entidadId: id, accion: "eliminar", antes: instantanea(antes) });
      return antes;
    });
    res.status(204).end();
  });

  return r;
}
