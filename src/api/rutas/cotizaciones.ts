// Cotizaciones de un lead (C8): lo que se le cotizó a la familia, por el bot o a mano por un asesor.
//
//   GET  /api/leads/:id/cotizaciones?limite=&pagina=                                   (leads:leer)
//   POST /api/leads/:id/cotizaciones { prospecto_id, programa_id, hermanos_inscritos?, meses_pagados? }   (leads:escribir)
//
// El `POST` COTIZA con el cotizador determinista (`src/cotizador/`) a la fecha de hoy en la zona de la sucursal del
// programa y GUARDA lo cotizado, congelado: programa, horarios con lugar, precios y promociones de ese día. No
// acepta precios ni descuentos del cliente: todo sale de las tablas. Una cotización vigente por (prospecto,
// programa): la nueva reemplaza (vence) a la anterior, en la misma transacción y bajo un candado por prospecto y
// programa; si dos asesores cotizan a la vez, ambas quedan guardadas y solo la última queda vigente.
// Alcance: el lead tiene que ser de una sucursal tuya (404 si no) y el programa, de una sucursal tuya. Los importes
// del snapshot son texto decimal.

import { Router } from "express";
import express from "express";
import { deFecha } from "../../catalogo/precios.ts";
import { leerConfiguracion } from "../../configuracion/index.ts";
import { cargarCatalogoCotizable } from "../../cotizador/cargar.ts";
import { estatusEfectivo, snapshotDeCotizacion, vigenteHasta } from "../../cotizador/cotizacion.ts";
import { cotizar } from "../../cotizador/cotizar.ts";
import { guardarCotizacion } from "../../cotizador/guardar.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { fechaLocal } from "../../lib/horario.ts";
import { condicionDeLead, veSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { entero, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  lead_id: true,
  prospecto_id: true,
  programa_id: true,
  sucursal_id: true,
  grupo_elegido_id: true,
  origen: true,
  creado_por_usuario_id: true,
  fecha: true,
  vigente_hasta: true,
  estatus: true,
  snapshot: true,
  creado_en: true,
} as const;

interface Fila {
  id: string;
  lead_id: string;
  prospecto_id: string;
  programa_id: string;
  sucursal_id: string;
  grupo_elegido_id: string | null;
  origen: "bot" | "asesor";
  creado_por_usuario_id: string | null;
  fecha: Date;
  vigente_hasta: Date;
  estatus: "vigente" | "aceptada" | "vencida";
  snapshot: unknown;
  creado_en: Date;
}

const presentar = (f: Fila, ahora: Date) => ({
  id: f.id,
  lead_id: f.lead_id,
  prospecto_id: f.prospecto_id,
  programa_id: f.programa_id,
  sucursal_id: f.sucursal_id,
  grupo_elegido_id: f.grupo_elegido_id,
  origen: f.origen,
  creado_por_usuario_id: f.creado_por_usuario_id,
  fecha: deFecha(f.fecha),
  vigente_hasta: deFecha(f.vigente_hasta),
  estatus: estatusEfectivo(f.estatus, deFecha(f.vigente_hasta), ahora),
  snapshot: f.snapshot,
  creado_en: f.creado_en,
});

const instantanea = (f: Fila): Instantanea => ({
  lead_id: f.lead_id,
  prospecto_id: f.prospecto_id,
  programa_id: f.programa_id,
  sucursal_id: f.sucursal_id,
  grupo_elegido_id: f.grupo_elegido_id,
  origen: f.origen,
  estatus: f.estatus,
  fecha: deFecha(f.fecha),
  vigente_hasta: deFecha(f.vigente_hasta),
});

const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({ ...esquemaPaginacion });
const esquemaAlta = objeto({
  prospecto_id: uuid(),
  programa_id: uuid(),
  hermanos_inscritos: opcional(entero({ min: 0, max: 20 })),
  meses_pagados: opcional(entero({ min: 0, max: 24 })),
});

export function rutasDeCotizaciones(deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** El lead, si es de una sucursal que ve quien pregunta. */
  async function leadVisible(ctx: ReturnType<typeof contextoDe>, id: string) {
    return ctx.db.lead.findFirst({ where: { id, ...(condicionDeLead(await ctx.alcance()) ?? {}) }, select: { id: true, vertical_interes_id: true } });
  }

  r.get("/leads/:id/cotizaciones", requierePermiso("leads:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const pag = leerPaginacion(parsearQuery(esquemaListado, req.query));
    if (!(await leadVisible(ctx, id))) throw noEncontrado();
    const ahora = ctx.ahora();
    res.json(
      await paginar(
        pag,
        () => ctx.db.cotizacion.count({ where: { lead_id: id } }),
        async (saltar, tomar) => (await ctx.db.cotizacion.findMany({ where: { lead_id: id }, select: SELECCION, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((f) => presentar(f as Fila, ahora)),
      ),
    );
  });

  r.post("/leads/:id/cotizaciones", requierePermiso("leads:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaAlta, req.body);
    const lead = await leadVisible(ctx, id);
    if (!lead) throw noEncontrado();

    const prospecto = await ctx.db.prospecto.findFirst({ where: { id: e.prospecto_id, lead_id: id }, select: { id: true, edad_declarada: true, fecha_nacimiento: true, vertical_interes_id: true } });
    if (!prospecto) throw validacion([{ campo: "prospecto_id", mensaje: "El prospecto no es de este lead" }]);
    // V3: si el asesor capturó su fecha de nacimiento, el cotizador cuenta los años a la fecha de corte del programa (como en el asistente de inscripción).
    const nacimiento = prospecto.fecha_nacimiento ? deFecha(prospecto.fecha_nacimiento) : null;
    if (prospecto.edad_declarada === null && nacimiento === null) throw validacion([{ campo: "prospecto_id", mensaje: "El prospecto no tiene edad: captúrala antes de cotizar" }]);
    const programa = await ctx.db.programa.findFirst({ where: { id: e.programa_id, activo: true }, select: { id: true, vertical_id: true, sucursal_id: true, sucursal: { select: { zona_horaria: true } } } });
    if (!programa || !veSucursal(await ctx.alcance(), programa.sucursal_id)) throw validacion([{ campo: "programa_id", mensaje: "El programa no existe o no es de tus sucursales" }]);
    if (programa.vertical_id !== prospecto.vertical_interes_id) throw validacion([{ campo: "programa_id", mensaje: "El programa es de otra vertical que el prospecto" }]);

    const fecha = fechaLocal(ctx.ahora(), programa.sucursal.zona_horaria);
    const { cotizacionVigenciaDias } = await leerConfiguracion(ctx.db);
    const catalogo = await cargarCatalogoCotizable(ctx.db, { verticalId: programa.vertical_id, sucursalIds: [programa.sucursal_id], fecha, fuente: deps.fuenteOcupacion });
    const cotizado = cotizar(catalogo, {
      verticalId: programa.vertical_id,
      sucursalId: programa.sucursal_id,
      edadDeclarada: prospecto.edad_declarada,
      fechaNacimiento: nacimiento,
      hermanosInscritos: e.hermanos_inscritos ?? 0,
      mesesPagadosPorAdelantado: e.meses_pagados ?? 0,
    }).programas.find((p) => p.programaId === programa.id);
    if (!cotizado) throw conflicto(`El programa no corresponde a la edad del prospecto (${prospecto.edad_declarada} años)`, [{ campo: "programa_id", mensaje: "La edad no está en el rango del programa" }]);

    const guardada = await transaccionConBloqueo(ctx.db, ctx.organizacionId, `cotizacion:${prospecto.id}:${programa.id}`, async (tx) => {
      const nueva = await guardarCotizacion(tx, {
        leadId: id,
        prospectoId: prospecto.id,
        programaId: programa.id,
        sucursalId: programa.sucursal_id,
        origen: "asesor",
        creadoPorUsuarioId: ctx.usuario.id,
        fecha,
        vigenteHasta: vigenteHasta(cotizado, fecha, cotizacionVigenciaDias),
        snapshot: snapshotDeCotizacion(cotizado, fecha, { hermanosInscritos: e.hermanos_inscritos ?? 0, mesesPagadosPorAdelantado: e.meses_pagados ?? 0 }),
      });
      const fila = (await tx.cotizacion.findFirstOrThrow({ where: { id: nueva.id }, select: SELECCION })) as Fila;
      for (const vieja of nueva.reemplazadas) {
        await registrarCambio(tx, ctx, { entidad: "cotizacion", entidadId: vieja, accion: "actualizar", antes: { estatus: "vigente" }, despues: { estatus: "vencida" } });
      }
      // EC-08: lo que el asesor supuso (hermanos inscritos, meses por adelantado) queda también en el registro de cambios.
      await registrarCambio(tx, ctx, { entidad: "cotizacion", entidadId: fila.id, accion: "crear", despues: { ...instantanea(fila), hermanos_inscritos: e.hermanos_inscritos ?? 0, meses_pagados: e.meses_pagados ?? 0 } });
      return fila;
    });
    res.status(201).json(presentar(guardada, ctx.ahora()));
  });

  return r;
}
