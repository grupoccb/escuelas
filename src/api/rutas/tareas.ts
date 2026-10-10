// Tareas para el asesor (las que deja el sistema cuando algo no se puede resolver solo).
//
//   GET   /api/tareas?estado=&tipo=&lead_id=&sin_lead=true&limite=&pagina=   (`sin_lead=true`: las que no se pudieron atar a ningún lead; solo las ve el administrador)
//   PATCH /api/tareas/:id   { estado: "hecha" | "descartada" }
//
// Alcance: por la sucursal de interés del lead de la tarea o, si es una tarea de una inscripción (G2), por la sucursal de su grupo (el administrador ve todas). Una tarea
// que no existe, es de otra organización o cae fuera de tu alcance da 404, nunca 403. Resolver es
// atómico: dos personas que resuelven a la vez → una gana y la otra recibe 409.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { ESTADOS_DE_TAREA, TIPOS_DE_TAREA } from "../../datos/tipos.ts";
import { leerModulos, tiposDeTareaApagados } from "../../modulos/index.ts";
import { condicionDeLead, filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { booleanoDeTexto, enumerado, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  tipo: true,
  estado: true,
  descripcion: true,
  codigo_error: true,
  lead_id: true,
  // V7: de qué familia es la tarea (nombre y teléfono de contacto del lead): sin esto, una lista de tareas no dice a quién hay que llamar.
  lead: { select: { nombre_contacto: true, telefono: true } },
  conversacion_id: true,
  inscripcion_id: true,
  cargo_id: true,
  vence_en: true,
  resuelta_en: true,
  creado_en: true,
} as const;

const esquemaListado = objeto({ ...esquemaPaginacion, estado: opcional(enumerado(ESTADOS_DE_TAREA)), tipo: opcional(enumerado(TIPOS_DE_TAREA)), lead_id: opcional(uuid()), sin_lead: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });
const esquemaResolver = objeto({ estado: enumerado(["hecha", "descartada"] as const) });

export function rutasDeTareas(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/tareas", requierePermiso("tareas:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const alcance = await ctx.alcance();
    const filtro = filtroDeSucursal(alcance);
    // V1: las tareas de un módulo apagado (cobranza, faltas, clases muestra…) no se listan.
    const apagados = tiposDeTareaApagados(await leerModulos(ctx.db));
    const where = { ...(apagados.length > 0 ? { NOT: { tipo: { in: apagados } } } : {}), ...(q.estado ? { estado: q.estado } : {}), ...(q.tipo ? { tipo: q.tipo } : {}), ...(q.lead_id ? { lead_id: q.lead_id } : {}), ...(q.sin_lead ? { lead_id: null } : {}), ...(filtro ? { OR: [{ lead: condicionDeLead(alcance) }, { inscripcion: { grupo: { programa: { sucursal_id: filtro } } } }, { cargo: { sucursal_id: filtro } }] } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.tarea_asesor.count({ where }),
        (saltar, tomar) => ctx.db.tarea_asesor.findMany({ where, select: SELECCION, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar }),
      ),
    );
  });

  r.patch("/tareas/:id", requierePermiso("tareas:resolver"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { estado } = parsear(esquemaResolver, req.body);
    const alcance = await ctx.alcance();
    const filtro = filtroDeSucursal(alcance);
    const apagados = tiposDeTareaApagados(await leerModulos(ctx.db));
    const where = { id, ...(apagados.length > 0 ? { NOT: { tipo: { in: apagados } } } : {}), ...(filtro ? { OR: [{ lead: condicionDeLead(alcance) }, { inscripcion: { grupo: { programa: { sucursal_id: filtro } } } }, { cargo: { sucursal_id: filtro } }] } : {}) };
    const resultado = await ctx.db.$transaction(async (tx) => {
      const tarea = await tx.tarea_asesor.findFirst({ where, select: { id: true, estado: true, resuelta_en: true } });
      if (!tarea) throw noEncontrado();
      // Atómico: solo cambia si sigue pendiente.
      const cambio = await tx.tarea_asesor.updateMany({ where: { id, estado: "pendiente" }, data: { estado, resuelta_en: ctx.ahora() } });
      if (cambio.count !== 1) throw conflicto("La tarea ya estaba resuelta");
      const despues = await tx.tarea_asesor.findFirstOrThrow({ where: { id }, select: SELECCION });
      await registrarCambio(tx, ctx, {
        entidad: "tarea_asesor",
        entidadId: id,
        accion: estado === "hecha" ? "resolver" : "descartar",
        antes: { estado: tarea.estado, resuelta_en: tarea.resuelta_en },
        despues: { estado: despues.estado, resuelta_en: despues.resuelta_en },
        soloDiferencias: false,
      });
      return despues;
    });
    res.json(resultado);
  });

  return r;
}
