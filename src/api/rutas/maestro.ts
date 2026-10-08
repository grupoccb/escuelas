// La aplicación del maestro (D2, decisión 13: «plantilla por MessagingProvider y lista en la aplicación»).
//
//   GET   /api/maestro/clases-muestra?desde=&hasta=&estatus=&limite=&pagina=   (clases_muestra:leer)
//   GET   /api/maestro/avisos?leidos=&limite=&pagina=                           (avisos_maestro:leer)
//   PATCH /api/maestro/avisos/:id   { visto: boolean }                          (avisos_maestro:escribir)
//
// Las clases muestra "del día y próximas" de SUS grupos (el maestro, solo las de los grupos de su instructor; el resto de los roles
// ven lo de su alcance): por omisión de hace 24 h a 14 días, en orden de fecha. Los avisos son los que se le mandaron a él (también
// por WhatsApp, si tiene teléfono y las reglas lo permiten): alumno, grupo, fecha y hora, NUNCA datos de salud. Marcar visto es
// idempotente y queda en el registro de cambios. Un aviso de otro maestro responde 404.

import { Router } from "express";
import express from "express";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe } from "../contexto.ts";
import type { DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { noEncontrado } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { booleano, booleanoDeTexto, enumerado, instanteISO, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";
import { SELECCION_CLASE, alcanceDeClases, presentarClase, type FilaClase } from "./clases-muestra.ts";

const DIA_MS = 24 * 60 * 60 * 1000;
const ESTATUS = ["agendada", "asistio", "no_asistio", "reagendada", "cancelada"] as const;

const esquemaClases = objeto({ ...esquemaPaginacion, desde: opcional(instanteISO()), hasta: opcional(instanteISO()), estatus: opcional(enumerado(ESTATUS)) });
const esquemaAvisos = objeto({ ...esquemaPaginacion, leidos: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });
const esquemaVisto = objeto({ visto: booleano() });

const SELECCION_AVISO = {
  id: true,
  tipo: true,
  entrega: true,
  motivo_entrega: true,
  datos: true,
  leido_en: true,
  enviado_en: true,
  creado_en: true,
  clase_muestra: { select: { id: true, estatus: true, fecha_hora: true } },
} as const;

interface FilaAviso {
  id: string;
  tipo: string;
  entrega: string;
  motivo_entrega: string | null;
  datos: unknown;
  leido_en: Date | null;
  enviado_en: Date | null;
  creado_en: Date;
  clase_muestra: { id: string; estatus: string; fecha_hora: Date };
}

const presentarAviso = (a: FilaAviso) => ({
  id: a.id,
  tipo: a.tipo,
  entrega: a.entrega,
  motivo_entrega: a.motivo_entrega,
  leido_en: a.leido_en,
  enviado_en: a.enviado_en,
  creado_en: a.creado_en,
  clase: { id: a.clase_muestra.id, estatus: a.clase_muestra.estatus, fecha_hora: a.clase_muestra.fecha_hora },
  datos: a.datos,
});

export function rutasDelMaestro(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/maestro/clases-muestra", requierePermiso("clases_muestra:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaClases, req.query);
    const pag = leerPaginacion(q);
    const ahora = ctx.ahora();
    const desde = q.desde ?? new Date(ahora.getTime() - DIA_MS);
    const hasta = q.hasta ?? new Date(ahora.getTime() + 14 * DIA_MS);
    const donde = {
      AND: [await alcanceDeClases(ctx), { fecha_hora: { gte: desde, lte: hasta } }, q.estatus ? { estatus: q.estatus } : { estatus: { in: ["agendada", "asistio", "no_asistio"] as ("agendada" | "asistio" | "no_asistio")[] } }],
    };
    res.json(
      await paginar(
        pag,
        () => ctx.db.clase_muestra.count({ where: donde }),
        async (saltar, tomar) => (await ctx.db.clase_muestra.findMany({ where: donde, select: SELECCION_CLASE, orderBy: [{ fecha_hora: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map((f) => presentarClase(f as FilaClase, ctx.usuario.rol)),
      ),
    );
  });

  r.get("/maestro/avisos", requierePermiso("avisos_maestro:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaAvisos, req.query);
    const pag = leerPaginacion(q);
    const where = { instructor: { usuario_id: ctx.usuario.id }, ...(q.leidos === undefined ? {} : { leido_en: q.leidos ? { not: null } : null }) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.aviso_maestro.count({ where }),
        async (saltar, tomar) => (await ctx.db.aviso_maestro.findMany({ where, select: SELECCION_AVISO, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((a) => presentarAviso(a as FilaAviso)),
      ),
    );
  });

  r.patch("/maestro/avisos/:id", requierePermiso("avisos_maestro:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { visto } = parsear(esquemaVisto, req.body);
    const resultado = await ctx.db.$transaction(async (tx) => {
      const propio = { id, instructor: { usuario_id: ctx.usuario.id } };
      const antes = await tx.aviso_maestro.findFirst({ where: propio, select: { leido_en: true } });
      if (!antes) throw noEncontrado();
      // Idempotente y atómico: solo cambia si todavía no estaba así.
      const cambio = await tx.aviso_maestro.updateMany({ where: { ...propio, leido_en: visto ? null : { not: null } }, data: { leido_en: visto ? ctx.ahora() : null } });
      const despues = await tx.aviso_maestro.findFirstOrThrow({ where: { id }, select: SELECCION_AVISO });
      if (cambio.count === 1) await registrarCambio(tx, ctx, { entidad: "aviso_maestro", entidadId: id, accion: "actualizar", antes: { leido_en: antes.leido_en }, despues: { leido_en: despues.leido_en } });
      return despues;
    });
    res.json(presentarAviso(resultado as FilaAviso));
  });

  return r;
}
