// Automatizaciones (J8): los avisos que el sistema manda solo (recordatorios, reenganche, cobranza, bienvenida…). Se encienden y apagan, se ajustan sus tiempos y su horario,
// pero NO se crean ni se borran desde aquí: cada evento disparador tiene su motor y su alta vive en el seed del cliente.
//
//   GET   /api/automatizaciones?evento_disparador=&activo=   (catalogo:escribir) — con su plantilla (y su clase), vertical y sucursal
//   PATCH /api/automatizaciones/:id   { activo?, offset_minutos?, max_intentos?, espaciado_minutos?|null, hora_inicio_min?, hora_fin_min?, dias_permitidos?, plantilla_id?|null }
//
// Reglas (todas en palabras; la base repite las del horario y los días con CHECK):
//   · INVARIANTE 14: el horario de envío nunca sale de 09:00–20:00 (hora local de la sucursal) y empieza antes de terminar; lo que caiga fuera se recorre o se descarta;
//   · el desfase respeta el sentido del evento (un recordatorio «antes» de la clase es negativo; uno «después» del vencimiento, positivo);
//   · intentos de 1 a 10 y espaciado de al menos 60 minutos; días de 0 (domingo) a 6;
//   · la plantilla debe existir. Apagar una automatización impide que se programen envíos NUEVOS; lo que ya estaba programado sigue su curso (EF-14, pendiente).

import { Router } from "express";
import express from "express";
import { EVENTOS_DISPARADORES, ESPACIADO_MINIMO_MIN, problemaDeClase, problemaDeDesfase, problemaDeDias, problemaDeHorario } from "../../automatizaciones/ajustes.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { noEncontrado, validacion, type DetalleDeError } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, entero, enumerado, listaDe, nulable, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  nombre: true,
  vertical_id: true,
  sucursal_id: true,
  evento_disparador: true,
  offset_minutos: true,
  plantilla_id: true,
  max_intentos: true,
  espaciado_minutos: true,
  hora_inicio_min: true,
  hora_fin_min: true,
  dias_permitidos: true,
  activo: true,
  plantilla: { select: { codigo: true, clase_mensaje: true, estado_aprobacion: true, activo: true } },
  vertical: { select: { nombre: true } },
  sucursal: { select: { nombre: true } },
} as const;
interface Fila {
  id: string;
  nombre: string;
  vertical_id: string | null;
  sucursal_id: string | null;
  evento_disparador: (typeof EVENTOS_DISPARADORES)[number];
  offset_minutos: number;
  plantilla_id: string | null;
  max_intentos: number;
  espaciado_minutos: number | null;
  hora_inicio_min: number;
  hora_fin_min: number;
  dias_permitidos: number[];
  activo: boolean;
  plantilla: { codigo: string; clase_mensaje: string; estado_aprobacion: string; activo: boolean } | null;
  vertical: { nombre: string } | null;
  sucursal: { nombre: string } | null;
}
const presentar = ({ vertical, sucursal, ...f }: Fila) => ({ ...f, vertical: vertical?.nombre ?? null, sucursal: sucursal?.nombre ?? null });
const instantanea = (f: Fila): Instantanea => ({ nombre: f.nombre, vertical_id: f.vertical_id, sucursal_id: f.sucursal_id, evento_disparador: f.evento_disparador, offset_minutos: f.offset_minutos, plantilla_id: f.plantilla_id, max_intentos: f.max_intentos, espaciado_minutos: f.espaciado_minutos, hora_inicio_min: f.hora_inicio_min, hora_fin_min: f.hora_fin_min, dias_permitidos: f.dias_permitidos, activo: f.activo });

const esquemaListado = objeto({ ...esquemaPaginacion, evento_disparador: opcional(enumerado(EVENTOS_DISPARADORES)), activo: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });
const esquemaCambio = objeto({
  activo: opcional(booleano()),
  offset_minutos: opcional(entero({ min: -86_400, max: 86_400 })),
  max_intentos: opcional(entero({ min: 1, max: 10 })),
  espaciado_minutos: opcional(nulable(entero({ min: 1, max: 86_400 }))),
  hora_inicio_min: opcional(entero({ min: 0, max: 1439 })),
  hora_fin_min: opcional(entero({ min: 1, max: 1440 })),
  dias_permitidos: opcional(listaDe(entero({ min: 0, max: 6 }), { max: 7 })),
  plantilla_id: opcional(nulable(uuid())),
});

export function rutasDeAutomatizaciones(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/automatizaciones", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.evento_disparador ? { evento_disparador: q.evento_disparador } : {}), ...(q.activo !== undefined ? { activo: q.activo } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.automatizacion.count({ where }),
        async (saltar, tomar) => ((await ctx.db.automatizacion.findMany({ where, select: SELECCION, orderBy: [{ evento_disparador: "asc" }, { nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar })) as unknown as Fila[]).map(presentar),
      ),
    );
  });

  r.patch("/automatizaciones/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const salida = await ctx.db.$transaction(async (tx) => {
      const antes = (await tx.automatizacion.findFirst({ where: { id }, select: SELECCION })) as unknown as Fila | null;
      if (!antes) throw noEncontrado();
      const e: DetalleDeError[] = [];
      const final = { ...antes, ...c };
      const desfase = problemaDeDesfase(antes.evento_disparador, final.offset_minutos);
      if (desfase) e.push({ campo: "offset_minutos", mensaje: desfase });
      const horario = problemaDeHorario(final.hora_inicio_min, final.hora_fin_min);
      if (horario) e.push({ campo: "hora_inicio_min", mensaje: horario });
      const dias = problemaDeDias(final.dias_permitidos);
      if (dias) e.push({ campo: "dias_permitidos", mensaje: dias });
      if (final.espaciado_minutos !== null && final.espaciado_minutos < ESPACIADO_MINIMO_MIN) e.push({ campo: "espaciado_minutos", mensaje: `El espaciado mínimo entre intentos es de ${ESPACIADO_MINIMO_MIN} minutos` });
      if (c.plantilla_id) {
        const nueva = await tx.plantilla_mensaje.findFirst({ where: { id: c.plantilla_id }, select: { clase_mensaje: true } });
        if (!nueva) e.push({ campo: "plantilla_id", mensaje: "La plantilla no existe" });
        else {
          // EK-A1 (INV-6): la clase de la plantilla debe corresponder al evento.
          const clase = problemaDeClase(antes.evento_disparador, nueva.clase_mensaje);
          if (clase) e.push({ campo: "plantilla_id", mensaje: clase });
        }
      }
      if (e.length > 0) throw validacion(e);
      const despues = (await tx.automatizacion.update({ where: { id }, data: c, select: SELECCION })) as unknown as Fila;
      await registrarCambio(tx, ctx, { entidad: "automatizacion", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
      return despues;
    });
    res.json(presentar(salida));
  });

  return r;
}
