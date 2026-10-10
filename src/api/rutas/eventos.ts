// Eventos y elegibilidad (G4).
//
//   GET    /api/eventos?vertical_id=&sucursal_id=&desde=&hasta=&limite=&pagina=             (eventos:leer)
//   GET    /api/eventos/:id                                                                  (eventos:leer)   con sus lugares: cupo, ocupados, disponibles
//   POST   /api/eventos { vertical_id, sucursal_id, tipo, nombre, fecha, cuota?, cupo, requiere_vestuario?, otorga_progresion? }   (eventos:escribir: administrador)
//   PATCH  /api/eventos/:id { … }  ·  DELETE /api/eventos/:id                               (eventos:escribir)  baja lógica; 409 si tiene participantes
//   GET    /api/eventos/:id/elegibles?limite=&pagina=                                        (eventos:leer)   alumnos vigentes de la vertical y si son elegibles
//   GET    /api/eventos/:id/alumnos                                                          (eventos:leer)   los participantes
//   POST   /api/eventos/:id/alumnos { alumno_ids: [...] }                                    (eventos:participantes)  convocar (solo elegibles si el evento sube de peldaño)
//   PATCH  /api/eventos/:id/alumnos/:alumno_id { estatus }                                   (eventos:participantes)  convocado → confirmado → pagado → asistio (solo hacia adelante)
//   DELETE /api/eventos/:id/alumnos/:alumno_id                                               (eventos:participantes)  quita su lugar (baja lógica; no si ya tiene resultado)
//   POST   /api/eventos/:id/alumnos/:alumno_id/resultado { resultado, nivel_id?, observaciones? }   (eventos:participantes)  aprobado crea el peldaño
//
// El cupo es atómico y está protegido en la base (disparador `evento_alumno_cupo`): ocupan lugar los participantes vivos. La cuota es dinero exacto (texto con dos
// decimales); el maestro no la ve. Alcance: ver `src/eventos/alcance.ts`; el maestro solo convoca y ve a SUS alumnos. Todo cambio queda en `registro_cambio`.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { hoyEn } from "../../asistencia/pase.ts";
import { altaConAlcance, type Consultas } from "../../datos/alcance.ts";
import { dondeEventoVisible } from "../../eventos/alcance.ts";
import { cambiarEstatus, convocarAlumnos, cupoDelEvento, ESTATUS_DE_PARTICIPANTE, RechazoDeEvento, registrarResultado, RESULTADOS_DE_EVENTO } from "../../eventos/eventos.ts";
import { dondeAlumnoVisible } from "../../familias/alcance.ts";
import { aTexto, deDecimal } from "../../lib/dinero.ts";
import { elegibilidadDe } from "../../progresion/elegibilidad.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { booleano, dinero, entero, enumerado, fechaISO, listaDe, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });
const esquemaParticipante = objeto({ id: uuid(), alumno_id: uuid() });
const esquemaListado = objeto({ ...esquemaPaginacion, vertical_id: opcional(uuid()), sucursal_id: opcional(uuid()), desde: opcional(fechaISO()), hasta: opcional(fechaISO()) });
const campos = {
  tipo: texto({ max: 60 }),
  nombre: texto({ max: 160 }),
  fecha: fechaISO(),
  cuota: opcional(dinero()),
  cupo: entero({ min: 1, max: 10_000 }),
  requiere_vestuario: opcional(booleano()),
  otorga_progresion: opcional(booleano()),
};
const esquemaNuevo = objeto({ vertical_id: uuid(), sucursal_id: uuid(), ...campos });
const esquemaCambio = objeto({ tipo: opcional(campos.tipo), nombre: opcional(campos.nombre), fecha: opcional(campos.fecha), cuota: campos.cuota, cupo: opcional(campos.cupo), requiere_vestuario: campos.requiere_vestuario, otorga_progresion: campos.otorga_progresion });
const esquemaConvocar = objeto({ alumno_ids: listaDe(uuid(), { max: 200 }) });
const esquemaEstatus = objeto({ estatus: enumerado(ESTATUS_DE_PARTICIPANTE) });
const esquemaResultado = objeto({ resultado: enumerado(RESULTADOS_DE_EVENTO), nivel_id: opcional(uuid()), observaciones: opcional(texto({ max: 1000 })) });

const SELECCION = {
  id: true,
  vertical_id: true,
  sucursal_id: true,
  tipo: true,
  nombre: true,
  fecha: true,
  cuota: true,
  cupo: true,
  requiere_vestuario: true,
  otorga_progresion: true,
  vertical: { select: { nombre: true, etiqueta_evento: true } },
  sucursal: { select: { nombre: true } },
} as const;

type FilaDeEvento = {
  id: string;
  vertical_id: string;
  sucursal_id: string;
  tipo: string;
  nombre: string;
  fecha: Date;
  cuota: { toFixed(n: number): string };
  cupo: number;
  requiere_vestuario: boolean;
  otorga_progresion: boolean;
  vertical: { nombre: string; etiqueta_evento: string | null };
  sucursal: { nombre: string };
};

/** El evento como lo ve el rol: la cuota (dinero) no es del maestro. */
function presentarEvento(f: FilaDeEvento, ocupados: number, rol: string) {
  return {
    id: f.id,
    vertical: { id: f.vertical_id, nombre: f.vertical.nombre, etiqueta_evento: f.vertical.etiqueta_evento },
    sucursal: { id: f.sucursal_id, nombre: f.sucursal.nombre },
    tipo: f.tipo,
    nombre: f.nombre,
    fecha: f.fecha.toISOString().slice(0, 10),
    cupo: f.cupo,
    ocupados,
    disponibles: Math.max(0, f.cupo - ocupados),
    requiere_vestuario: f.requiere_vestuario,
    otorga_progresion: f.otorga_progresion,
    ...(rol === "maestro" ? {} : { cuota: aTexto(deDecimal(f.cuota)) }),
  };
}

const instantanea = (f: Pick<FilaDeEvento, "vertical_id" | "sucursal_id" | "tipo" | "nombre" | "fecha" | "cuota" | "cupo" | "requiere_vestuario" | "otorga_progresion">) => ({
  vertical_id: f.vertical_id,
  sucursal_id: f.sucursal_id,
  tipo: f.tipo,
  nombre: f.nombre,
  fecha: f.fecha.toISOString().slice(0, 10),
  cuota: aTexto(deDecimal(f.cuota)),
  cupo: f.cupo,
  requiere_vestuario: f.requiere_vestuario,
  otorga_progresion: f.otorga_progresion,
});

/** La base rechazó por el cupo del evento (el disparador): la red de seguridad si algún código se equivoca. */
const esCupoAgotadoEnLaBase = (e: unknown): boolean => e instanceof Error && e.message.includes("evento_cupo:");
const esCupoMenorEnLaBase = (e: unknown): boolean => e instanceof Error && e.message.includes("evento_cupo_menor_a_ocupados");

export function rutasDeEventos(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  async function cargar(ctx: ContextoApi, id: string): Promise<FilaDeEvento> {
    const f = await ctx.db.evento.findFirst({ where: { id, ...(await dondeEventoVisible(ctx)) }, select: SELECCION });
    if (!f) throw noEncontrado();
    return f as unknown as FilaDeEvento;
  }
  /** El instructor que registra: el maestro, por su usuario; el administrador y recepción no son instructores (nulo). */
  async function instructorDe(ctx: ContextoApi): Promise<string | null> {
    return ctx.usuario.rol === "maestro" ? ((await ctx.db.instructor.findFirst({ where: { usuario_id: ctx.usuario.id }, select: { id: true } }))?.id ?? null) : null;
  }

  r.get("/eventos", requierePermiso("eventos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const where = {
      AND: [
        await dondeEventoVisible(ctx),
        q.vertical_id ? { vertical_id: q.vertical_id } : {},
        q.sucursal_id ? { sucursal_id: q.sucursal_id } : {},
        q.desde || q.hasta ? { fecha: { ...(q.desde ? { gte: new Date(`${q.desde}T00:00:00.000Z`) } : {}), ...(q.hasta ? { lte: new Date(`${q.hasta}T00:00:00.000Z`) } : {}) } } : {},
      ],
    };
    res.json(
      await paginar(
        pag,
        () => ctx.db.evento.count({ where }),
        async (saltar, tomar) => {
          const filas = (await ctx.db.evento.findMany({ where, select: SELECCION, orderBy: [{ fecha: "asc" }, { id: "asc" }], skip: saltar, take: tomar })) as unknown as FilaDeEvento[];
          const ocupados = await ctx.db.evento_alumno.groupBy({ by: ["evento_id"], where: { evento_id: { in: filas.map((f) => f.id) } }, _count: { _all: true } });
          const cuenta = new Map(ocupados.map((o) => [o.evento_id, o._count._all]));
          return filas.map((f) => presentarEvento(f, cuenta.get(f.id) ?? 0, ctx.usuario.rol));
        },
      ),
    );
  });

  r.get("/eventos/:id", requierePermiso("eventos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const f = await cargar(ctx, id);
    res.json(presentarEvento(f, (await cupoDelEvento(ctx.db, id))?.ocupados ?? 0, ctx.usuario.rol));
  });

  r.post("/eventos", requierePermiso("eventos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaNuevo, req.body);
    if (!(await ctx.db.vertical.findFirst({ where: { id: e.vertical_id }, select: { id: true } }))) throw validacion([{ campo: "vertical_id", mensaje: "No se encontró la vertical" }]);
    if (!(await ctx.db.sucursal_vertical.findFirst({ where: { vertical_id: e.vertical_id, sucursal_id: e.sucursal_id, activo: true }, select: { id: true } }))) {
      throw validacion([{ campo: "sucursal_id", mensaje: "La sucursal no ofrece esa vertical" }]);
    }
    const creado = await ctx.db.$transaction(async (tx) => {
      const f = (await tx.evento.create({
        data: altaConAlcance({ vertical_id: e.vertical_id, sucursal_id: e.sucursal_id, tipo: e.tipo, nombre: e.nombre, fecha: new Date(`${e.fecha}T00:00:00.000Z`), cuota: aTexto(e.cuota ?? 0n), cupo: e.cupo, requiere_vestuario: e.requiere_vestuario ?? false, otorga_progresion: e.otorga_progresion ?? true, creado_por_usuario_id: ctx.usuario.id }),
        select: SELECCION,
      })) as unknown as FilaDeEvento;
      await registrarCambio(tx, ctx, { entidad: "evento", entidadId: f.id, accion: "crear", despues: instantanea(f) });
      return f;
    });
    res.status(201).json(presentarEvento(creado, 0, ctx.usuario.rol));
  });

  r.patch("/eventos/:id", requierePermiso("eventos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambio, req.body);
    if (Object.keys(e).length === 0) throw validacion([{ mensaje: "No hay ningún cambio" }]);
    const actual = await cargar(ctx, id);
    try {
      const f = await ctx.db.$transaction(async (tx) => {
        const n = (await tx.evento.update({
          where: { id },
          data: { ...(e.tipo !== undefined ? { tipo: e.tipo } : {}), ...(e.nombre !== undefined ? { nombre: e.nombre } : {}), ...(e.fecha !== undefined ? { fecha: new Date(`${e.fecha}T00:00:00.000Z`) } : {}), ...(e.cuota !== undefined ? { cuota: aTexto(e.cuota) } : {}), ...(e.cupo !== undefined ? { cupo: e.cupo } : {}), ...(e.requiere_vestuario !== undefined ? { requiere_vestuario: e.requiere_vestuario } : {}), ...(e.otorga_progresion !== undefined ? { otorga_progresion: e.otorga_progresion } : {}) },
          select: SELECCION,
        })) as unknown as FilaDeEvento;
        await registrarCambio(tx, ctx, { entidad: "evento", entidadId: id, accion: "actualizar", antes: instantanea(actual), despues: instantanea(n) });
        return n;
      });
      res.json(presentarEvento(f, (await cupoDelEvento(ctx.db, id))?.ocupados ?? 0, ctx.usuario.rol));
    } catch (err) {
      if (esCupoMenorEnLaBase(err)) throw conflicto("El cupo no puede ser menor a los que ya ocupan lugar", [{ campo: "motivo", mensaje: "cupo_menor_a_ocupados" }]);
      throw err;
    }
  });

  r.delete("/eventos/:id", requierePermiso("eventos:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const actual = await cargar(ctx, id);
    await ctx.db.$transaction(async (tx) => {
      // Bajo la fila del evento: nadie convoca mientras se decide si se puede borrar.
      await tx.evento.updateMany({ where: { id }, data: { actualizado_en: new Date() } });
      if ((await tx.evento_alumno.count({ where: { evento_id: id } })) > 0) throw conflicto("El evento ya tiene participantes", [{ campo: "motivo", mensaje: "evento_con_participantes" }]);
      await tx.evento.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "evento", entidadId: id, accion: "eliminar", antes: instantanea(actual) });
    });
    res.status(204).end();
  });

  r.get("/eventos/:id/elegibles", requierePermiso("eventos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const pag = leerPaginacion(parsearQuery(objeto({ ...esquemaPaginacion }), req.query));
    const evento = await cargar(ctx, id);
    const donde = { AND: [await dondeAlumnoVisible(ctx), { inscripciones: { some: { estatus: "activa" as const, eliminado_en: null, programa: { vertical_id: evento.vertical_id } } } }] };
    res.json(
      await paginar(
        pag,
        () => ctx.db.alumno.count({ where: donde }),
        async (saltar, tomar) => {
          const alumnos = await ctx.db.alumno.findMany({ where: donde, select: { id: true, nombre: true, apellidos: true }, orderBy: [{ apellidos: "asc" }, { nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar });
          const dentro = new Set((await ctx.db.evento_alumno.findMany({ where: { evento_id: id, alumno_id: { in: alumnos.map((a) => a.id) } }, select: { alumno_id: true } })).map((p) => p.alumno_id));
          const salida = [];
          for (const a of alumnos) {
            const e = await elegibilidadDe(ctx.db, a.id, evento.vertical_id);
            salida.push({
              alumno_id: a.id,
              alumno: `${a.nombre} ${a.apellidos}`,
              // Si el evento no sube de peldaño, no hay umbral que cumplir: basta ser alumno vigente.
              elegible: evento.otorga_progresion ? e.elegible : e.motivo !== "sin_inscripcion_activa",
              motivo: evento.otorga_progresion ? e.motivo : e.motivo === "sin_inscripcion_activa" ? e.motivo : null,
              clases_cumplidas: e.clasesCumplidas,
              clases_requeridas: e.clasesRequeridas,
              faltan: e.faltan,
              nivel_actual: e.nivelActual ? { id: e.nivelActual.nivel.id, nombre: e.nivelActual.nivel.nombre, fecha_obtenido: e.nivelActual.fechaObtenido } : null,
              siguiente_nivel: e.siguiente ? { id: e.siguiente.id, nombre: e.siguiente.nombre, clases_minimas: e.siguiente.clasesMinimas } : null,
              convocado: dentro.has(a.id),
            });
          }
          return salida;
        },
      ),
    );
  });

  r.get("/eventos/:id/alumnos", requierePermiso("eventos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await cargar(ctx, id);
    const filas = await ctx.db.evento_alumno.findMany({
      where: { evento_id: id, alumno: await dondeAlumnoVisible(ctx) },
      select: { id: true, alumno_id: true, estatus: true, resultado: true, nivel_otorgado: { select: { id: true, nombre: true } }, alumno: { select: { nombre: true, apellidos: true } } },
      orderBy: [{ creado_en: "asc" }, { id: "asc" }],
    });
    res.json({ datos: filas.map((f) => ({ participante_id: f.id, alumno_id: f.alumno_id, alumno: `${f.alumno.nombre} ${f.alumno.apellidos}`, estatus: f.estatus, resultado: f.resultado, nivel_otorgado: f.nivel_otorgado })) });
  });

  r.post("/eventos/:id/alumnos", requierePermiso("eventos:participantes"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { alumno_ids } = parsear(esquemaConvocar, req.body);
    const evento = await cargar(ctx, id);
    if (evento.fecha.toISOString().slice(0, 10) < hoyEn((await ctx.db.sucursal.findFirstOrThrow({ where: { id: evento.sucursal_id }, select: { zona_horaria: true } })).zona_horaria, ctx.ahora())) {
      throw conflicto("El evento ya pasó", [{ campo: "motivo", mensaje: "evento_pasado" }]);
    }
    const alumnoVisible = await dondeAlumnoVisible(ctx);
    let resultado;
    try {
      resultado = await ctx.db.$transaction((tx) =>
        convocarAlumnos(tx, { eventoId: id, alumnoIds: alumno_ids, usuarioId: ctx.usuario.id, alumnoVisible, alCambiar: (t, c) => registrarCambio(t, ctx, { entidad: "evento_alumno", entidadId: c.participanteId, accion: "crear", despues: { evento_id: id, alumno_id: c.alumnoId, estatus: "convocado" } }) }),
      );
    } catch (err) {
      if (esCupoAgotadoEnLaBase(err)) throw conflicto("El evento ya no tiene lugares", [{ campo: "motivo", mensaje: "evento_lleno" }]);
      throw err;
    }
    if (!resultado.ok) throw noEncontrado();
    const { convocados, yaConvocados, rechazados } = resultado.resultado;
    // Si no quedó convocado nadie ni estaba ya convocado, es un rechazo: 409 con el motivo de cada uno.
    if (convocados.length === 0 && yaConvocados.length === 0 && rechazados.length > 0) {
      throw conflicto("No se pudo convocar", rechazados.map((x) => ({ campo: `alumno ${x.alumnoId}`, mensaje: x.motivo })));
    }
    res.json({ convocados: convocados.map((c) => ({ alumno_id: c.alumnoId, participante_id: c.participanteId })), ya_convocados: yaConvocados, rechazados: rechazados.map((x) => ({ alumno_id: x.alumnoId, motivo: x.motivo, ...(x.faltan !== undefined ? { faltan: x.faltan } : {}) })), cupo: await cupoDelEvento(ctx.db, id) });
  });

  r.patch("/eventos/:id/alumnos/:alumno_id", requierePermiso("eventos:participantes"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id, alumno_id } = parsear(esquemaParticipante, req.params);
    const { estatus } = parsear(esquemaEstatus, req.body);
    await cargar(ctx, id);
    if (!(await ctx.db.alumno.findFirst({ where: { id: alumno_id, ...(await dondeAlumnoVisible(ctx)) }, select: { id: true } }))) throw noEncontrado();
    const r2 = await ctx.db.$transaction(async (tx) => {
      const x = await cambiarEstatus(tx, { eventoId: id, alumnoId: alumno_id, estatus, ahora: ctx.ahora(), usuarioId: ctx.usuario.id });
      if (x.ok && !x.sinCambio) await registrarCambio(tx, ctx, { entidad: "evento_alumno", entidadId: x.participanteId, accion: "actualizar", antes: { evento_id: id, alumno_id, estatus: x.antes }, despues: { evento_id: id, alumno_id, estatus: x.despues } });
      return x;
    });
    if (!r2.ok) {
      if (r2.motivo === "participante_inexistente") throw noEncontrado(r2.mensaje);
      throw conflicto(r2.mensaje, [{ campo: "motivo", mensaje: r2.motivo }]);
    }
    res.json({ participante_id: r2.participanteId, alumno_id, estatus: r2.despues, sin_cambio: r2.sinCambio });
  });

  r.delete("/eventos/:id/alumnos/:alumno_id", requierePermiso("eventos:participantes"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id, alumno_id } = parsear(esquemaParticipante, req.params);
    await cargar(ctx, id);
    if (!(await ctx.db.alumno.findFirst({ where: { id: alumno_id, ...(await dondeAlumnoVisible(ctx)) }, select: { id: true } }))) throw noEncontrado();
    await ctx.db.$transaction(async (tx) => {
      const fila = await tx.evento_alumno.findFirst({ where: { evento_id: id, alumno_id }, select: { id: true, estatus: true, resultado: true } });
      if (!fila) throw noEncontrado();
      if (fila.resultado) throw conflicto("Ya tiene un resultado registrado", [{ campo: "motivo", mensaje: "con_resultado" }]);
      await tx.evento_alumno.update({ where: { id: fila.id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "evento_alumno", entidadId: fila.id, accion: "eliminar", antes: { evento_id: id, alumno_id, estatus: fila.estatus } });
    });
    res.status(204).end();
  });

  r.post("/eventos/:id/alumnos/:alumno_id/resultado", requierePermiso("eventos:participantes"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id, alumno_id } = parsear(esquemaParticipante, req.params);
    const e = parsear(esquemaResultado, req.body);
    await cargar(ctx, id);
    if (!(await ctx.db.alumno.findFirst({ where: { id: alumno_id, ...(await dondeAlumnoVisible(ctx)) }, select: { id: true } }))) throw noEncontrado();
    const instructorId = await instructorDe(ctx);
    let r2;
    try {
      r2 = await ctx.db.$transaction(async (tx: Consultas) => {
        const x = await registrarResultado(tx, { eventoId: id, alumnoId: alumno_id, resultado: e.resultado, nivelId: e.nivel_id ?? null, ahora: ctx.ahora(), usuarioId: ctx.usuario.id, instructorId, observaciones: e.observaciones ?? null });
        if (x.ok && !x.sinCambio) {
          await registrarCambio(tx, ctx, { entidad: "evento_alumno", entidadId: x.participanteId, accion: "actualizar", antes: { evento_id: id, alumno_id, resultado: null, nivel_otorgado_id: null }, despues: { evento_id: id, alumno_id, resultado: x.resultado, nivel_otorgado_id: x.nivelId } });
          if (x.progresionId) await registrarCambio(tx, ctx, { entidad: "alumno_progresion", entidadId: x.progresionId, accion: "crear", despues: { alumno_id, nivel_id: x.nivelId, fecha_obtenido: null, evento_id: id, instructor_id: instructorId } });
        }
        return x;
      });
    } catch (err) {
      if (err instanceof RechazoDeEvento) throw conflicto(err.message, [{ campo: "motivo", mensaje: err.motivo }]);
      throw err;
    }
    if (!r2.ok) {
      if (r2.motivo === "participante_inexistente") throw noEncontrado(r2.mensaje);
      throw conflicto(r2.mensaje, [{ campo: "motivo", mensaje: r2.motivo }]);
    }
    res.status(r2.sinCambio ? 200 : 201).json({ participante_id: r2.participanteId, alumno_id, resultado: r2.resultado, nivel_otorgado_id: r2.nivelId, progresion_id: r2.progresionId, sin_cambio: r2.sinCambio });
  });

  return r;
}
