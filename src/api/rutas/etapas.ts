// Etapas del embudo (V5): la escuela las nombra, las ordena y puede agregar las suyas. El sistema NUNCA busca una etapa por su nombre: decide por su papel (`tipo_sistema`: nuevo, contactado,
// clase muestra agendada…, inscrito, perdido) y por las banderas ganado / perdido. Por eso las etapas de sistema se pueden renombrar y ajustar su alerta, pero no se borran ni cambian de papel,
// y entre sí conservan su orden (el lead solo avanza por orden: cambiarlas rompería el embudo). Las propias de la escuela se agregan, se mueven entre las de sistema y se quitan si no tienen leads.
//
//   GET    /api/etapas   (leads:leer; vive en interfaz.ts) — las etapas en orden
//   POST   /api/etapas   { nombre, dias_alerta_sin_movimiento?|null }   (catalogo:escribir) — una etapa propia, justo antes de las de cierre (inscrito y perdido)
//   PATCH  /api/etapas/:id   { nombre?, dias_alerta_sin_movimiento?|null }   (catalogo:escribir) — nombre y días sin movimiento para la alerta (1 a 365; nulo = sin alerta). Las de cierre no tienen alerta
//   PUT    /api/etapas/orden   { ids: [...] }   (catalogo:escribir) — el orden nuevo, con todas las etapas vivas. Las de sistema conservan su orden relativo y las de cierre van al final
//   DELETE /api/etapas/:id   (catalogo:escribir) — baja lógica de una etapa propia. 409 si tiene leads o si es de sistema

import { Router } from "express";
import express from "express";
import { altaConAlcance, type Consultas } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { entero, listaDe, nulable, objeto, opcional, parsear, texto, uuid } from "../validar.ts";

const DIAS_MIN = 1;
const DIAS_MAX = 365;

const esquemaId = objeto({ id: uuid() });
const dias = nulable(entero({ min: DIAS_MIN, max: DIAS_MAX }));
const esquemaNueva = objeto({ nombre: texto({ max: 60 }), dias_alerta_sin_movimiento: opcional(dias) });
const esquemaCambio = objeto({ nombre: opcional(texto({ max: 60 })), dias_alerta_sin_movimiento: opcional(dias) });
const esquemaOrden = objeto({ ids: listaDe(uuid(), { max: 100, unicos: true }) });

const SELECCION = { id: true, nombre: true, orden: true, tipo_sistema: true, es_ganado: true, es_perdido: true, dias_alerta_sin_movimiento: true } as const;
interface Etapa {
  id: string;
  nombre: string;
  orden: number;
  tipo_sistema: string | null;
  es_ganado: boolean;
  es_perdido: boolean;
  dias_alerta_sin_movimiento: number | null;
}
const instantanea = (e: Etapa): Instantanea => ({ nombre: e.nombre, orden: e.orden, dias_alerta_sin_movimiento: e.dias_alerta_sin_movimiento, tipo_sistema: e.tipo_sistema, es_ganado: e.es_ganado, es_perdido: e.es_perdido });
const esDeCierre = (e: Pick<Etapa, "es_ganado" | "es_perdido" | "tipo_sistema">): boolean => e.es_ganado || e.es_perdido || e.tipo_sistema === "inscrito" || e.tipo_sistema === "perdido";
const normal = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

const vivas = (db: Consultas): Promise<Etapa[]> => db.etapa_pipeline.findMany({ select: SELECCION, orderBy: [{ orden: "asc" }, { id: "asc" }] });

export function rutasDeEtapas(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.post("/etapas", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaNueva, req.body);
    const creada = await transaccionConBloqueo(ctx.db, ctx.organizacionId, "etapas", async (tx) => {
      const todas = await vivas(tx);
      if (todas.some((x) => normal(x.nombre) === normal(e.nombre))) throw conflicto("Ya hay una etapa con ese nombre. Elige otro.", [{ campo: "nombre", mensaje: "Ya hay una etapa con ese nombre" }]);
      // Justo antes de la primera etapa de cierre: las de cierre (inscrito, perdido) siguen al final.
      const primeraDeCierre = todas.find(esDeCierre);
      const orden = primeraDeCierre ? primeraDeCierre.orden : (todas.at(-1)?.orden ?? 0) + 1;
      // El orden es único entre las vivas (índice de la base): se recorre de la última a la primera para no chocar a medio camino.
      for (const x of [...todas].reverse()) if (x.orden >= orden) await tx.etapa_pipeline.update({ where: { id: x.id }, data: { orden: x.orden + 1 } });
      const nueva = await tx.etapa_pipeline.create({ data: altaConAlcance({ nombre: e.nombre, orden, es_ganado: false, es_perdido: false, dias_alerta_sin_movimiento: e.dias_alerta_sin_movimiento ?? null }), select: SELECCION });
      await registrarCambio(tx, ctx, { entidad: "etapa_pipeline", entidadId: nueva.id, accion: "crear", despues: instantanea(nueva) });
      return nueva;
    });
    res.status(201).json(creada);
  });

  // Antes que «/etapas/:id» para que «orden» no se lea como un identificador.
  r.put("/etapas/orden", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { ids } = parsear(esquemaOrden, req.body);
    const salida = await transaccionConBloqueo(ctx.db, ctx.organizacionId, "etapas", async (tx) => {
      const todas = await vivas(tx);
      const porId = new Map(todas.map((x) => [x.id, x]));
      if (ids.length !== todas.length || ids.some((id) => !porId.has(id))) throw validacion([{ campo: "ids", mensaje: "Manda todas las etapas, cada una una sola vez. Vuelve a cargar la pantalla e inténtalo de nuevo." }]);
      const nuevas = ids.map((id) => porId.get(id)!);
      // Las de sistema entre sí conservan su orden: el lead solo avanza por orden y el sistema las busca por su papel.
      const antes = todas.filter((x) => x.tipo_sistema !== null).map((x) => x.id);
      const despues = nuevas.filter((x) => x.tipo_sistema !== null).map((x) => x.id);
      if (antes.join() !== despues.join()) throw conflicto("Las etapas que trae el sistema (Nuevo, Contactado, Clase muestra…, Inscrito y Perdido) no cambian de orden entre sí. Mueve solo las tuyas.");
      // Las de cierre, al final.
      const primeraCierre = nuevas.findIndex(esDeCierre);
      if (primeraCierre !== -1 && nuevas.slice(primeraCierre).some((x) => !esDeCierre(x))) throw conflicto("Las etapas de cierre (Inscrito y Perdido) van siempre al final. Pon las tuyas antes.");
      // El orden es único entre las vivas: primero las que cambian pasan a un lugar provisional (más allá de todas) y luego a su lugar, así nunca chocan a medio camino.
      const cambian = nuevas.map((x, i) => ({ x, nuevo: i + 1 })).filter((c) => c.x.orden !== c.nuevo);
      const PROVISIONAL = 1_000_000;
      for (const c of cambian) await tx.etapa_pipeline.update({ where: { id: c.x.id }, data: { orden: PROVISIONAL + c.nuevo } });
      for (const c of cambian) {
        await tx.etapa_pipeline.update({ where: { id: c.x.id }, data: { orden: c.nuevo } });
        await registrarCambio(tx, ctx, { entidad: "etapa_pipeline", entidadId: c.x.id, accion: "actualizar", antes: instantanea(c.x), despues: instantanea({ ...c.x, orden: c.nuevo }) });
      }
      return vivas(tx);
    });
    res.json({ datos: salida });
  });

  r.patch("/etapas/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const salida = await transaccionConBloqueo(ctx.db, ctx.organizacionId, "etapas", async (tx) => {
      const todas = await vivas(tx);
      const actual = todas.find((x) => x.id === id);
      if (!actual) throw noEncontrado();
      if (c.nombre !== undefined && todas.some((x) => x.id !== id && normal(x.nombre) === normal(c.nombre!))) throw conflicto("Ya hay una etapa con ese nombre. Elige otro.", [{ campo: "nombre", mensaje: "Ya hay una etapa con ese nombre" }]);
      if (c.dias_alerta_sin_movimiento !== undefined && c.dias_alerta_sin_movimiento !== null && esDeCierre(actual)) {
        throw validacion([{ campo: "dias_alerta_sin_movimiento", mensaje: "Las etapas de cierre no tienen alerta de días sin movimiento: déjalo vacío." }]);
      }
      const nueva = await tx.etapa_pipeline.update({ where: { id }, data: c, select: SELECCION });
      await registrarCambio(tx, ctx, { entidad: "etapa_pipeline", entidadId: id, accion: "actualizar", antes: instantanea(actual), despues: instantanea(nueva) });
      return nueva;
    });
    res.json(salida);
  });

  r.delete("/etapas/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, "etapas", async (tx) => {
      const actual = await tx.etapa_pipeline.findFirst({ where: { id }, select: SELECCION });
      if (!actual) throw noEncontrado();
      if (actual.tipo_sistema !== null || esDeCierre(actual)) throw conflicto("Esta etapa la usa el sistema (el bot y la conversión la buscan por su papel) y no se puede quitar. Puedes cambiarle el nombre.");
      const leads = await tx.lead.count({ where: { etapa_id: id } });
      if (leads > 0) throw conflicto(`Hay ${leads} ${leads === 1 ? "lead" : "leads"} en esta etapa. Muévelos a otra etapa antes de quitarla.`);
      await tx.etapa_pipeline.update({ where: { id }, data: { eliminado_en: new Date() } });
      await registrarCambio(tx, ctx, { entidad: "etapa_pipeline", entidadId: id, accion: "eliminar", antes: instantanea(actual) });
    });
    res.status(204).end();
  });

  return r;
}
