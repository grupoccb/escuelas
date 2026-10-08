// Conversión de un lead en familia e inscripciones (F2). Ver `src/conversion/convertir.ts`.
//
//   GET  /api/leads/:id/conversion                                                  (conversion:leer)    SOLO lo que FALTA por capturar
//   POST /api/leads/:id/convertir { tutor?, prospectos?: [{ prospecto_id, alumno?, inscripcion? }] }   (conversion:ejecutar)
//
// El POST toma lo ya capturado (bot, landing, registro del maestro, cotización) y SOLO pide lo que falta: si falta algo responde 409
// `faltan_datos` con la misma lista de la vista previa. Es idempotente: convertir otra vez devuelve lo ya convertido (200). Todo ocurre en una
// transacción. Alcance: el asesor, los leads de sus sucursales; lo ajeno es 404.

import { Router } from "express";
import express from "express";
import { convertirLead, vistaPreviaDeConversion, type EntradaDeConversion, type ResultadoDeConversion } from "../../conversion/convertir.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { ErrorApi, conflicto, noEncontrado, validacion } from "../errores.ts";
import { MOTIVOS_DE_CLASE, SEXOS, TURNOS_ESCOLARES } from "../../clases-muestra/registro.ts";
import { booleano, correo, entero, enumerado, fechaISO, listaDe, nulable, objeto, opcional, parsear, texto, uuid } from "../validar.ts";

const textoONulo = (max: number) => opcional(nulable(texto({ max })));
const esquemaId = objeto({ id: uuid() });
const esquemaConversion = objeto({
  tutor: opcional(objeto({ parentesco: opcional(texto({ max: 60 })), nombre: opcional(texto({ max: 120 })), apellidos: textoONulo(120), correo: opcional(nulable(correo())) })),
  prospectos: opcional(
    listaDe(
      objeto({
        prospecto_id: uuid(),
        alumno: opcional(
          objeto({
            nombre: opcional(texto({ max: 120 })),
            apellidos: opcional(texto({ max: 120 })),
            fecha_nacimiento: opcional(fechaISO()),
            sexo: opcional(nulable(enumerado(SEXOS))),
            escuela_nombre: textoONulo(160),
            escuela_turno: opcional(nulable(enumerado(TURNOS_ESCOLARES))),
            talla_uniforme: textoONulo(40),
            practico_antes: opcional(nulable(booleano())),
            practico_donde: textoONulo(160),
            practico_nivel: textoONulo(120),
            motivo_clase: opcional(nulable(enumerado(MOTIVOS_DE_CLASE))),
            motivo_clase_detalle: textoONulo(300),
          }),
        ),
        inscripcion: opcional(
          objeto({
            grupo_id: opcional(uuid()),
            fecha_inicio: opcional(fechaISO()),
            dia_corte_pago: opcional(entero({ min: 1, max: 31 })),
            meses_pagados_por_adelantado: opcional(entero({ min: 0, max: 24 })),
            cotizacion_id: opcional(uuid()),
            permitir_fuera_de_edad: opcional(booleano()),
          }),
        ),
      }),
      { max: 10 },
    ),
  ),
});

type Cuerpo = ReturnType<typeof esquemaConversion.leer> extends infer R ? Exclude<R, symbol> : never;

/** Del cuerpo de la API a la entrada de la conversión (sin valores `undefined` explícitos). */
function aEntrada(c: Cuerpo, esAdministrador: boolean): EntradaDeConversion {
  const out: EntradaDeConversion = {};
  const cuerpo = c as {
    tutor?: { parentesco?: string; nombre?: string; apellidos?: string | null; correo?: string | null };
    prospectos?: { prospecto_id: string; alumno?: Record<string, unknown>; inscripcion?: { grupo_id?: string; fecha_inicio?: string; dia_corte_pago?: number; meses_pagados_por_adelantado?: number; cotizacion_id?: string; permitir_fuera_de_edad?: boolean } }[];
  };
  if (cuerpo.tutor) out.tutor = cuerpo.tutor;
  if (cuerpo.prospectos) {
    out.prospectos = cuerpo.prospectos.map((p) => {
      if (p.inscripcion?.permitir_fuera_de_edad && !esAdministrador) throw new ErrorApi("prohibido", "Solo el administrador inscribe fuera del rango de edad");
      const i = p.inscripcion;
      return {
        prospectoId: p.prospecto_id,
        ...(p.alumno ? { alumno: p.alumno } : {}),
        ...(i
          ? {
              inscripcion: {
                ...(i.grupo_id ? { grupoId: i.grupo_id } : {}),
                ...(i.fecha_inicio ? { fechaInicio: i.fecha_inicio } : {}),
                ...(i.dia_corte_pago !== undefined ? { diaCortePago: i.dia_corte_pago } : {}),
                ...(i.meses_pagados_por_adelantado !== undefined ? { mesesPagadosPorAdelantado: i.meses_pagados_por_adelantado } : {}),
                ...(i.cotizacion_id ? { cotizacionId: i.cotizacion_id } : {}),
                ...(i.permitir_fuera_de_edad ? { permitirFueraDeEdad: true } : {}),
              },
            }
          : {}),
      };
    });
  }
  return out;
}

export const presentarConversion = (r: ResultadoDeConversion) => ({
  ya_convertido: r.yaConvertido,
  tutor_id: r.tutorId,
  alumnos: r.alumnos.map((a) => ({ prospecto_id: a.prospectoId, alumno_id: a.alumnoId, creado: a.creado, tutor_ids: a.tutorIds, inscripcion: a.inscripcion ? { id: a.inscripcion.id, grupo_id: a.inscripcion.grupoId, creada: a.inscripcion.creada } : null })),
});

export function rutasDeConversion(deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** El lead, si lo ve quien pregunta (el asesor, por la sucursal de interés). */
  async function leadVisible(ctx: ContextoApi, id: string): Promise<void> {
    const filtro = filtroDeSucursal(await ctx.alcance());
    if (!(await ctx.db.lead.findFirst({ where: { id, ...(filtro ? { sucursal_interes_id: filtro } : {}) }, select: { id: true } }))) throw noEncontrado();
  }

  r.get("/leads/:id/conversion", requierePermiso("conversion:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await leadVisible(ctx, id);
    const v = await vistaPreviaDeConversion(ctx.db, id, {}, ctx.ahora());
    if (!v) throw noEncontrado();
    res.json({ lead_id: v.leadId, listo: v.listo, ya_convertido: v.yaConvertido, faltantes: v.faltantes, prospectos: v.prospectos.map((p) => ({ prospecto_id: p.prospectoId, ya_convertido: p.yaConvertido })) });
  });

  r.post("/leads/:id/convertir", requierePermiso("conversion:ejecutar"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const cuerpo = parsear(esquemaConversion, req.body ?? {});
    await leadVisible(ctx, id);
    const h = await convertirLead(ctx.db, ctx, id, aEntrada(cuerpo, ctx.usuario.rol === "administrador"), { ...(deps.sensibles.cifrador ? { cifrador: deps.sensibles.cifrador } : {}) });
    if (!h.ok) {
      if (h.motivo === "lead_inexistente") throw noEncontrado();
      if (h.motivo === "faltan_datos") throw conflicto("Faltan datos para convertir al lead", [{ campo: "motivo", mensaje: "faltan_datos" }, ...h.faltantes]);
      if (h.rechazo === "grupo_inexistente" || h.rechazo === "alumno_inexistente") throw noEncontrado(h.mensaje);
      if (h.rechazo === "fecha_invalida" || h.rechazo === "dia_de_corte_invalido" || h.rechazo === "cotizacion_invalida") throw validacion(h.detalles ?? [{ mensaje: h.mensaje }], h.mensaje);
      throw conflicto(h.mensaje, [{ campo: "motivo", mensaje: h.rechazo }, { campo: "prospecto_id", mensaje: h.prospectoId }, ...(h.detalles ?? [])]);
    }
    res.status(h.resultado.yaConvertido ? 200 : 201).json(presentarConversion(h.resultado));
  });

  return r;
}
