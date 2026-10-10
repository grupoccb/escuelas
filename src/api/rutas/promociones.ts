// Promociones y sus beneficios (C3).
//
//   GET    /api/promociones?activo=&vigente_en=&vertical_id=&sucursal_id=&programa_id=   (catalogo:leer; por sucursal según el rol)
//   GET    /api/promociones/:id                                                           (catalogo:leer) con alcance y beneficios
//   POST   /api/promociones   { nombre, codigo, vigencia_desde, vigencia_hasta?, condicion_tipo?, condicion_valor?, cupo_maximo?,
//                               acumulable?, prioridad?, activo?, verticales?, sucursales?, programas?, beneficios? }   (catalogo:escribir)
//   PATCH  /api/promociones/:id   cualquiera de los campos anteriores (las listas de alcance REEMPLAZAN el conjunto)
//   DELETE /api/promociones/:id   baja lógica (409 si tiene beneficios por entregar)
//   POST   /api/promociones/:id/beneficios · PATCH|DELETE /api/promociones/:id/beneficios/:beneficio_id
//
// `verticales` / `sucursales` / `programas`: listas de ids; VACÍAS = vale en todas partes. `condicion_valor` se valida
// según `condicion_tipo` (min_hermanos {hermanos}, pago_anticipado {meses}; las demás, nulo). Un beneficio lleva
// `tipo`, `modo` y `valor` como TEXTO (porcentaje «15», monto «150.00», meses «2»); las combinaciones válidas están en
// `src/promociones/condicion.ts` y en un CHECK de la base. `cupo_usado` solo lo mueve el consumo atómico; no se edita.
// El código se guarda en MAYÚSCULAS y es único entre las promociones vivas.

import { Router } from "express";
import express from "express";
import { aFecha, deFecha } from "../../catalogo/precios.ts";
import { altaConAlcance, type Consultas } from "../../datos/alcance.ts";
import { JSON_NULO_SQL } from "../../datos/tipos.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { aTexto, deDecimal } from "../../lib/dinero.ts";
import { validarBeneficio, validarCondicion } from "../../promociones/condicion.ts";
import { CONDICIONES, MODOS_DE_BENEFICIO, MOMENTOS_DE_DISPARO, TIPOS_DE_BENEFICIO, type CondicionTipo } from "../../promociones/tipos.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion, type DetalleDeError } from "../errores.ts";
import { cantidad, segun } from "../../lib/cantidad.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, enumerado, entero, fechaISO, listaDe, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid, type Esquema } from "../validar.ts";

const VIVO = { eliminado_en: null } as const;

const SELECCION = {
  id: true,
  nombre: true,
  codigo: true,
  vigencia_desde: true,
  vigencia_hasta: true,
  condicion_tipo: true,
  condicion_valor: true,
  cupo_maximo: true,
  cupo_usado: true,
  acumulable: true,
  prioridad: true,
  activo: true,
  verticales: { where: VIVO, select: { vertical_id: true }, orderBy: { vertical_id: "asc" as const } },
  sucursales: { where: VIVO, select: { sucursal_id: true }, orderBy: { sucursal_id: "asc" as const } },
  programas: { where: VIVO, select: { programa_id: true }, orderBy: { programa_id: "asc" as const } },
  beneficios: { where: VIVO, select: { id: true, tipo: true, modo: true, valor: true, producto_id: true, descripcion: true, momento_disparo: true }, orderBy: { id: "asc" as const } },
};

interface FilaBeneficio {
  id: string;
  tipo: string;
  modo: string;
  valor: { toFixed(n: number): string } | null;
  producto_id: string | null;
  descripcion: string | null;
  momento_disparo: string;
}
interface FilaPromocion {
  id: string;
  nombre: string;
  codigo: string;
  vigencia_desde: Date;
  vigencia_hasta: Date | null;
  condicion_tipo: string;
  condicion_valor: unknown;
  cupo_maximo: number | null;
  cupo_usado: number;
  acumulable: boolean;
  prioridad: number;
  activo: boolean;
  verticales: { vertical_id: string }[];
  sucursales: { sucursal_id: string }[];
  programas: { programa_id: string }[];
  beneficios: FilaBeneficio[];
}

const presentarBeneficio = (b: FilaBeneficio) => ({
  id: b.id,
  tipo: b.tipo,
  modo: b.modo,
  valor: b.valor === null ? null : aTexto(deDecimal(b.valor)),
  producto_id: b.producto_id,
  descripcion: b.descripcion,
  momento_disparo: b.momento_disparo,
});
const presentar = (f: FilaPromocion) => ({
  id: f.id,
  nombre: f.nombre,
  codigo: f.codigo,
  vigencia_desde: deFecha(f.vigencia_desde),
  vigencia_hasta: f.vigencia_hasta ? deFecha(f.vigencia_hasta) : null,
  condicion_tipo: f.condicion_tipo,
  condicion_valor: f.condicion_valor,
  cupo_maximo: f.cupo_maximo,
  cupo_usado: f.cupo_usado,
  acumulable: f.acumulable,
  prioridad: f.prioridad,
  activo: f.activo,
  verticales: f.verticales.map((v) => v.vertical_id),
  sucursales: f.sucursales.map((s) => s.sucursal_id),
  programas: f.programas.map((p) => p.programa_id),
  beneficios: f.beneficios.map(presentarBeneficio),
});
const instantaneaDe = (f: FilaPromocion): Instantanea => {
  const p = presentar(f);
  return {
    nombre: p.nombre,
    codigo: p.codigo,
    vigencia_desde: p.vigencia_desde,
    vigencia_hasta: p.vigencia_hasta,
    condicion_tipo: p.condicion_tipo,
    condicion_valor: p.condicion_valor === null ? null : JSON.stringify(p.condicion_valor),
    cupo_maximo: p.cupo_maximo,
    acumulable: p.acumulable,
    prioridad: p.prioridad,
    activo: p.activo,
    verticales: p.verticales,
    sucursales: p.sucursales,
    programas: p.programas,
  };
};
const instantaneaBeneficio = (promocionId: string, b: FilaBeneficio): Instantanea => ({ promocion_id: promocionId, tipo: b.tipo, modo: b.modo, valor: b.valor === null ? null : aTexto(deDecimal(b.valor)), producto_id: b.producto_id, descripcion: b.descripcion, momento_disparo: b.momento_disparo });

const jsonLibre: Esquema<unknown> = { leer: (valor) => valor };
const esquemaBeneficio = objeto({
  tipo: enumerado(TIPOS_DE_BENEFICIO),
  modo: enumerado(MODOS_DE_BENEFICIO),
  valor: opcional(nulable(texto({ max: 20 }))),
  producto_id: opcional(nulable(uuid())),
  descripcion: opcional(nulable(texto({ max: 120 }))),
  momento_disparo: opcional(enumerado(MOMENTOS_DE_DISPARO)),
});
const esquemaBeneficioCambio = objeto({
  tipo: opcional(enumerado(TIPOS_DE_BENEFICIO)),
  modo: opcional(enumerado(MODOS_DE_BENEFICIO)),
  valor: opcional(nulable(texto({ max: 20 }))),
  producto_id: opcional(nulable(uuid())),
  descripcion: opcional(nulable(texto({ max: 120 }))),
  momento_disparo: opcional(enumerado(MOMENTOS_DE_DISPARO)),
});
const camposComunes = {
  nombre: texto({ max: 120 }),
  codigo: texto({ min: 2, max: 40, patron: /^[A-Za-z0-9_-]+$/, mensajePatron: "Solo letras, números, guion y guion bajo" }),
  vigencia_desde: fechaISO(),
  vigencia_hasta: nulable(fechaISO()),
  condicion_tipo: enumerado(CONDICIONES),
  condicion_valor: nulable(jsonLibre),
  cupo_maximo: nulable(entero({ min: 1, max: 100000 })),
  acumulable: booleano(),
  prioridad: entero({ min: -1000, max: 1000 }),
  activo: booleano(),
  verticales: listaDe(uuid(), { max: 100, unicos: true }),
  sucursales: listaDe(uuid(), { max: 100, unicos: true }),
  programas: listaDe(uuid(), { max: 500, unicos: true }),
};
const esquemaAlta = objeto({
  nombre: camposComunes.nombre,
  codigo: camposComunes.codigo,
  vigencia_desde: camposComunes.vigencia_desde,
  vigencia_hasta: opcional(camposComunes.vigencia_hasta),
  condicion_tipo: opcional(camposComunes.condicion_tipo),
  condicion_valor: opcional(camposComunes.condicion_valor),
  cupo_maximo: opcional(camposComunes.cupo_maximo),
  acumulable: opcional(camposComunes.acumulable),
  prioridad: opcional(camposComunes.prioridad),
  activo: opcional(camposComunes.activo),
  verticales: opcional(camposComunes.verticales),
  sucursales: opcional(camposComunes.sucursales),
  programas: opcional(camposComunes.programas),
  beneficios: opcional(listaDe(esquemaBeneficio, { max: 10 })),
});
const esquemaCambio = objeto({
  nombre: opcional(camposComunes.nombre),
  codigo: opcional(camposComunes.codigo),
  vigencia_desde: opcional(camposComunes.vigencia_desde),
  vigencia_hasta: opcional(camposComunes.vigencia_hasta),
  condicion_tipo: opcional(camposComunes.condicion_tipo),
  condicion_valor: opcional(camposComunes.condicion_valor),
  cupo_maximo: opcional(camposComunes.cupo_maximo),
  acumulable: opcional(camposComunes.acumulable),
  prioridad: opcional(camposComunes.prioridad),
  activo: opcional(camposComunes.activo),
  verticales: opcional(camposComunes.verticales),
  sucursales: opcional(camposComunes.sucursales),
  programas: opcional(camposComunes.programas),
});
const esquemaListado = objeto({
  ...esquemaPaginacion,
  activo: opcional(booleanoDeTexto()),
  vigente_en: opcional(fechaISO()),
  vertical_id: opcional(uuid()),
  sucursal_id: opcional(uuid()),
  programa_id: opcional(uuid()),
});
const esquemaId = objeto({ id: uuid() });
const esquemaIdBeneficio = objeto({ id: uuid(), beneficio_id: uuid() });

const codigoRepetido = () => conflicto("Ya existe una promoción con ese código", [{ campo: "codigo", mensaje: "Ya está en uso" }]);

/** `{ no hay filas vivas del alcance }` o `{ alguna es esta }`: la semántica «vacío = todos» en un where de Prisma. */
const alcanceIncluye = (relacion: "verticales" | "sucursales" | "programas", campo: string, id: string): Record<string, unknown> => ({
  OR: [{ [relacion]: { none: VIVO } }, { [relacion]: { some: { [campo]: id, ...VIVO } } }],
});

async function validarReferencias(tx: Consultas, e: { verticales?: string[] | undefined; sucursales?: string[] | undefined; programas?: string[] | undefined }): Promise<void> {
  const errores: DetalleDeError[] = [];
  if (e.verticales?.length && (await tx.vertical.count({ where: { id: { in: e.verticales } } })) !== e.verticales.length) errores.push({ campo: "verticales", mensaje: "Alguna vertical no existe" });
  if (e.sucursales?.length && (await tx.sucursal.count({ where: { id: { in: e.sucursales } } })) !== e.sucursales.length) errores.push({ campo: "sucursales", mensaje: "Alguna sucursal no existe" });
  if (e.programas?.length && (await tx.programa.count({ where: { id: { in: e.programas } } })) !== e.programas.length) errores.push({ campo: "programas", mensaje: "Algún programa no existe" });
  if (errores.length > 0) throw validacion(errores);
}

async function fijarAlcance(tx: Consultas, promocionId: string, e: { verticales?: string[] | undefined; sucursales?: string[] | undefined; programas?: string[] | undefined }, ahora: Date): Promise<void> {
  if (e.verticales) {
    const vivas = await tx.promocion_vertical.findMany({ where: { promocion_id: promocionId }, select: { id: true, vertical_id: true } });
    const quedan = new Set(e.verticales);
    const sobran = vivas.filter((v) => !quedan.has(v.vertical_id)).map((v) => v.id);
    if (sobran.length > 0) await tx.promocion_vertical.updateMany({ where: { id: { in: sobran } }, data: { eliminado_en: ahora } });
    const estan = new Set(vivas.map((v) => v.vertical_id));
    for (const id of e.verticales) if (!estan.has(id)) await tx.promocion_vertical.create({ data: altaConAlcance({ promocion_id: promocionId, vertical_id: id }) });
  }
  if (e.sucursales) {
    const vivas = await tx.promocion_sucursal.findMany({ where: { promocion_id: promocionId }, select: { id: true, sucursal_id: true } });
    const quedan = new Set(e.sucursales);
    const sobran = vivas.filter((v) => !quedan.has(v.sucursal_id)).map((v) => v.id);
    if (sobran.length > 0) await tx.promocion_sucursal.updateMany({ where: { id: { in: sobran } }, data: { eliminado_en: ahora } });
    const estan = new Set(vivas.map((v) => v.sucursal_id));
    for (const id of e.sucursales) if (!estan.has(id)) await tx.promocion_sucursal.create({ data: altaConAlcance({ promocion_id: promocionId, sucursal_id: id }) });
  }
  if (e.programas) {
    const vivas = await tx.promocion_programa.findMany({ where: { promocion_id: promocionId }, select: { id: true, programa_id: true } });
    const quedan = new Set(e.programas);
    const sobran = vivas.filter((v) => !quedan.has(v.programa_id)).map((v) => v.id);
    if (sobran.length > 0) await tx.promocion_programa.updateMany({ where: { id: { in: sobran } }, data: { eliminado_en: ahora } });
    const estan = new Set(vivas.map((v) => v.programa_id));
    for (const id of e.programas) if (!estan.has(id)) await tx.promocion_programa.create({ data: altaConAlcance({ promocion_id: promocionId, programa_id: id }) });
  }
}

/** Valida tipo/modo/valor y devuelve lo que se escribe (valor normalizado). Lanza 400. */
function beneficioValidado(b: { tipo: (typeof TIPOS_DE_BENEFICIO)[number]; modo: (typeof MODOS_DE_BENEFICIO)[number]; valor?: string | null | undefined; producto_id?: string | null | undefined; descripcion?: string | null | undefined }, prefijo = ""): string | null {
  const v = validarBeneficio(b.tipo, b.modo, b.valor);
  if (!v.ok) throw validacion(v.errores.map((e) => ({ campo: `${prefijo}${e.campo}`, mensaje: e.mensaje })));
  if (b.producto_id && b.tipo !== "producto_gratis") throw validacion([{ campo: `${prefijo}producto_id`, mensaje: "Solo un producto gratis lleva producto" }]);
  return v.valor;
}

export function rutasDePromociones(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/promociones", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const alcance = await ctx.alcanceCatalogo();
    const condiciones: Record<string, unknown>[] = [];
    if (!alcance.todas) {
      const S = alcance.sucursalIds;
      condiciones.push({
        OR: [
          { AND: [{ sucursales: { none: VIVO } }, { programas: { none: VIVO } }] },
          { sucursales: { some: { sucursal_id: { in: S }, ...VIVO } } },
          { programas: { some: { ...VIVO, programa: { sucursal_id: { in: S } } } } },
        ],
      });
    }
    if (q.activo !== undefined) condiciones.push({ activo: q.activo });
    if (q.vigente_en) condiciones.push({ vigencia_desde: { lte: aFecha(q.vigente_en) }, OR: [{ vigencia_hasta: null }, { vigencia_hasta: { gte: aFecha(q.vigente_en) } }] });
    if (q.vertical_id) condiciones.push(alcanceIncluye("verticales", "vertical_id", q.vertical_id));
    if (q.sucursal_id) condiciones.push(alcanceIncluye("sucursales", "sucursal_id", q.sucursal_id));
    if (q.programa_id) condiciones.push(alcanceIncluye("programas", "programa_id", q.programa_id));
    const where = condiciones.length > 0 ? { AND: condiciones } : {};
    res.json(
      await paginar(
        pag,
        () => ctx.db.promocion.count({ where }),
        async (saltar, tomar) => (await ctx.db.promocion.findMany({ where, select: SELECCION, orderBy: [{ prioridad: "desc" }, { id: "asc" }], skip: saltar, take: tomar })).map(presentar),
      ),
    );
  });

  r.get("/promociones/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const alcance = await ctx.alcanceCatalogo();
    const condiciones: Record<string, unknown>[] = [{ id }];
    if (!alcance.todas) {
      condiciones.push({
        OR: [
          { AND: [{ sucursales: { none: VIVO } }, { programas: { none: VIVO } }] },
          { sucursales: { some: { sucursal_id: { in: alcance.sucursalIds }, ...VIVO } } },
          { programas: { some: { ...VIVO, programa: { sucursal_id: { in: alcance.sucursalIds } } } } },
        ],
      });
    }
    const f = await ctx.db.promocion.findFirst({ where: { AND: condiciones }, select: SELECCION });
    if (!f) throw noEncontrado();
    res.json(presentar(f));
  });

  r.post("/promociones", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAlta, req.body);
    const tipo = (e.condicion_tipo ?? "sin_condicion") as CondicionTipo;
    const cond = validarCondicion(tipo, e.condicion_valor);
    if (!cond.ok) throw validacion(cond.errores);
    if (e.vigencia_hasta && e.vigencia_hasta < e.vigencia_desde) throw validacion([{ campo: "vigencia_hasta", mensaje: "No puede ser anterior al inicio" }]);
    const valores = (e.beneficios ?? []).map((b, i) => beneficioValidado(b, `beneficios[${i}].`));
    try {
      const creada = await ctx.db.$transaction(async (tx) => {
        await validarReferencias(tx, e);
        const p = await tx.promocion.create({
          data: altaConAlcance({
            nombre: e.nombre,
            codigo: e.codigo.toUpperCase(),
            vigencia_desde: aFecha(e.vigencia_desde),
            vigencia_hasta: e.vigencia_hasta ? aFecha(e.vigencia_hasta) : null,
            condicion_tipo: tipo,
            ...(cond.valor ? { condicion_valor: cond.valor } : {}),
            cupo_maximo: e.cupo_maximo ?? null,
            acumulable: e.acumulable ?? false,
            prioridad: e.prioridad ?? 0,
            activo: e.activo ?? true,
          }),
          select: { id: true },
        });
        await fijarAlcance(tx, p.id, { verticales: e.verticales ?? [], sucursales: e.sucursales ?? [], programas: e.programas ?? [] }, ctx.ahora());
        for (const [i, b] of (e.beneficios ?? []).entries()) {
          await tx.promocion_beneficio.create({
            data: altaConAlcance({ promocion_id: p.id, tipo: b.tipo, modo: b.modo, valor: valores[i] ?? null, producto_id: b.producto_id ?? null, descripcion: b.descripcion ?? null, momento_disparo: b.momento_disparo ?? "inmediato" }),
          });
        }
        const fila = await tx.promocion.findFirstOrThrow({ where: { id: p.id }, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "promocion", entidadId: p.id, accion: "crear", despues: instantaneaDe(fila) });
        for (const b of fila.beneficios) await registrarCambio(tx, ctx, { entidad: "promocion_beneficio", entidadId: b.id, accion: "crear", despues: instantaneaBeneficio(p.id, b) });
        return fila;
      });
      res.status(201).json(presentar(creada));
    } catch (err) {
      if (esViolacionUnica(err)) throw codigoRepetido();
      throw err;
    }
  });

  r.patch("/promociones/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    try {
      const salida = await ctx.db.$transaction(async (tx) => {
        const antes = await tx.promocion.findFirst({ where: { id }, select: SELECCION });
        if (!antes) throw noEncontrado();
        const tipo = (c.condicion_tipo ?? antes.condicion_tipo) as CondicionTipo;
        const valorCondicion = c.condicion_valor !== undefined ? c.condicion_valor : c.condicion_tipo !== undefined && c.condicion_tipo !== antes.condicion_tipo ? undefined : antes.condicion_valor;
        const cond = validarCondicion(tipo, valorCondicion);
        if (!cond.ok) throw validacion(cond.errores);
        const desde = c.vigencia_desde ?? deFecha(antes.vigencia_desde);
        const hasta = c.vigencia_hasta !== undefined ? c.vigencia_hasta : antes.vigencia_hasta ? deFecha(antes.vigencia_hasta) : null;
        if (hasta && hasta < desde) throw validacion([{ campo: "vigencia_hasta", mensaje: "No puede ser anterior al inicio" }]);
        const tope = c.cupo_maximo !== undefined ? c.cupo_maximo : antes.cupo_maximo;
        if (tope !== null && tope < antes.cupo_usado) throw conflicto(`Ya se usaron ${antes.cupo_usado} lugares: el cupo no puede ser menor`, [{ campo: "cupo_maximo", mensaje: `Debe ser al menos ${antes.cupo_usado}` }]);
        await validarReferencias(tx, c);
        const datos = {
          ...(c.nombre !== undefined ? { nombre: c.nombre } : {}),
          ...(c.codigo !== undefined ? { codigo: c.codigo.toUpperCase() } : {}),
          ...(c.vigencia_desde !== undefined ? { vigencia_desde: aFecha(c.vigencia_desde) } : {}),
          ...(c.vigencia_hasta !== undefined ? { vigencia_hasta: c.vigencia_hasta === null ? null : aFecha(c.vigencia_hasta) } : {}),
          ...(c.condicion_tipo !== undefined || c.condicion_valor !== undefined ? { condicion_tipo: tipo, condicion_valor: cond.valor ?? JSON_NULO_SQL } : {}),
          ...(c.cupo_maximo !== undefined ? { cupo_maximo: c.cupo_maximo } : {}),
          ...(c.acumulable !== undefined ? { acumulable: c.acumulable } : {}),
          ...(c.prioridad !== undefined ? { prioridad: c.prioridad } : {}),
          ...(c.activo !== undefined ? { activo: c.activo } : {}),
        };
        if (Object.keys(datos).length > 0) {
          // EC-14: el tope no puede quedar por debajo de lo usado ni aunque el consumo (un UPDATE atómico, sin candado) gane
          // la carrera entre la lectura de arriba y esta escritura: la condición va EN el UPDATE, así que no hay 500 del CHECK.
          const r = await tx.promocion.updateMany({ where: { id, ...(tope !== null ? { cupo_usado: { lte: tope } } : {}) }, data: datos });
          if (r.count !== 1) throw conflicto("Se usaron lugares de la promoción mientras la editabas: el cupo no puede ser menor que lo usado. Vuelve a intentarlo.", [{ campo: "cupo_maximo", mensaje: "Cambió el cupo usado" }]);
        }
        await fijarAlcance(tx, id, c, ctx.ahora());
        const despues = await tx.promocion.findFirstOrThrow({ where: { id }, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "promocion", entidadId: id, accion: "actualizar", antes: instantaneaDe(antes), despues: instantaneaDe(despues) });
        return despues;
      });
      res.json(presentar(salida));
    } catch (err) {
      if (esViolacionUnica(err)) throw codigoRepetido();
      throw err;
    }
  });

  r.delete("/promociones/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await ctx.db.$transaction(async (tx) => {
      const antes = await tx.promocion.findFirst({ where: { id }, select: SELECCION });
      if (!antes) throw noEncontrado();
      const pendientes = await tx.promocion_aplicacion.count({ where: { promocion_id: id, estatus: "pendiente" } });
      if (pendientes > 0) throw conflicto(`La promoción tiene ${cantidad(pendientes, "beneficio por entregar", "beneficios por entregar")}: ${segun(pendientes, "entrégalo", "entrégalos")} antes de darla de baja`);
      const ahora = ctx.ahora();
      await tx.promocion_vertical.updateMany({ where: { promocion_id: id }, data: { eliminado_en: ahora } });
      await tx.promocion_sucursal.updateMany({ where: { promocion_id: id }, data: { eliminado_en: ahora } });
      await tx.promocion_programa.updateMany({ where: { promocion_id: id }, data: { eliminado_en: ahora } });
      await tx.promocion_beneficio.updateMany({ where: { promocion_id: id }, data: { eliminado_en: ahora } });
      await tx.promocion.update({ where: { id }, data: { eliminado_en: ahora } });
      await registrarCambio(tx, ctx, { entidad: "promocion", entidadId: id, accion: "eliminar", antes: instantaneaDe(antes) });
    });
    res.status(204).end();
  });

  // ── Beneficios ────────────────────────────────────────────────────────────────────────

  r.post("/promociones/:id/beneficios", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const b = parsear(esquemaBeneficio, req.body);
    const valor = beneficioValidado(b);
    const creado = await ctx.db.$transaction(async (tx) => {
      if (!(await tx.promocion.findFirst({ where: { id }, select: { id: true } }))) throw noEncontrado();
      const fila = await tx.promocion_beneficio.create({
        data: altaConAlcance({ promocion_id: id, tipo: b.tipo, modo: b.modo, valor, producto_id: b.producto_id ?? null, descripcion: b.descripcion ?? null, momento_disparo: b.momento_disparo ?? "inmediato" }),
        select: { id: true, tipo: true, modo: true, valor: true, producto_id: true, descripcion: true, momento_disparo: true },
      });
      await registrarCambio(tx, ctx, { entidad: "promocion_beneficio", entidadId: fila.id, accion: "crear", despues: instantaneaBeneficio(id, fila) });
      return fila;
    });
    res.status(201).json(presentarBeneficio(creado));
  });

  r.patch("/promociones/:id/beneficios/:beneficio_id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id, beneficio_id: beneficioId } = parsear(esquemaIdBeneficio, req.params);
    const c = parsear(esquemaBeneficioCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const salida = await ctx.db.$transaction(async (tx) => {
      const antes = await tx.promocion_beneficio.findFirst({ where: { id: beneficioId, promocion_id: id }, select: { id: true, tipo: true, modo: true, valor: true, producto_id: true, descripcion: true, momento_disparo: true } });
      if (!antes) throw noEncontrado();
      const tipo = (c.tipo ?? antes.tipo) as (typeof TIPOS_DE_BENEFICIO)[number];
      const modo = (c.modo ?? antes.modo) as (typeof MODOS_DE_BENEFICIO)[number];
      const valorActual = antes.valor === null ? null : aTexto(deDecimal(antes.valor));
      const valorFinal = c.valor !== undefined ? c.valor : c.tipo !== undefined || c.modo !== undefined ? null : valorActual;
      const productoFinal = c.producto_id !== undefined ? c.producto_id : tipo === "producto_gratis" ? antes.producto_id : null;
      const valor = beneficioValidado({ tipo, modo, valor: valorFinal, producto_id: productoFinal });
      const despues = await tx.promocion_beneficio.update({
        where: { id: beneficioId },
        data: { tipo, modo, valor, producto_id: productoFinal, ...(c.descripcion !== undefined ? { descripcion: c.descripcion } : {}), ...(c.momento_disparo !== undefined ? { momento_disparo: c.momento_disparo } : {}) },
        select: { id: true, tipo: true, modo: true, valor: true, producto_id: true, descripcion: true, momento_disparo: true },
      });
      await registrarCambio(tx, ctx, { entidad: "promocion_beneficio", entidadId: beneficioId, accion: "actualizar", antes: instantaneaBeneficio(id, antes), despues: instantaneaBeneficio(id, despues) });
      return despues;
    });
    res.json(presentarBeneficio(salida));
  });

  r.delete("/promociones/:id/beneficios/:beneficio_id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id, beneficio_id: beneficioId } = parsear(esquemaIdBeneficio, req.params);
    await ctx.db.$transaction(async (tx) => {
      const antes = await tx.promocion_beneficio.findFirst({ where: { id: beneficioId, promocion_id: id }, select: { id: true, tipo: true, modo: true, valor: true, producto_id: true, descripcion: true, momento_disparo: true } });
      if (!antes) throw noEncontrado();
      const pendientes = await tx.promocion_aplicacion.count({ where: { beneficio_id: beneficioId, estatus: "pendiente" } });
      if (pendientes > 0) throw conflicto(`El beneficio tiene ${cantidad(pendientes, "entrega pendiente", "entregas pendientes")}`);
      await tx.promocion_beneficio.update({ where: { id: beneficioId }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "promocion_beneficio", entidadId: beneficioId, accion: "eliminar", antes: instantaneaBeneficio(id, antes) });
    });
    res.status(204).end();
  });

  return r;
}
