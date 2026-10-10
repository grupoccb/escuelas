// Progresión de un alumno (G3).
//
//   GET    /api/alumnos/:id/progresion                              (alumnos:leer)   por vertical: nivel actual, siguiente, historial y todos los peldaños
//   POST   /api/alumnos/:id/progresion { nivel_id, fecha_obtenido, observaciones?, instructor_id? }   (progresion:escribir: administrador, maestro)
//   DELETE /api/alumnos/:id/progresion/:progresion_id               (progresion:corregir: administrador)  baja lógica de un registro equivocado
//
// Alcance: el de los alumnos (`dondeAlumnoVisible`): el maestro, los de SUS grupos; lo ajeno es 404. Otorgar un nivel exige que la vertical lleve progresión
// (`usa_progresion`), que el alumno tenga una inscripción activa o congelada en ESA vertical, que la fecha no sea futura y que no lo tenga ya
// (`src/progresion/progresion.ts`): rechazos de negocio → 409 con `detalles: [{ campo: "motivo", mensaje: <código> }]`. El instructor sale del maestro que
// lo registra; el administrador puede indicarlo. Las `observaciones` son texto libre y solo las ven el administrador y el maestro (pueden mencionar salud).

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { dondeAlumnoVisible } from "../../familias/alcance.ts";
import { historialDeVertical, nivelesDeVertical, otorgarNivel, siguienteNivel, type NivelDeVertical } from "../../progresion/progresion.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, prohibido, validacion } from "../errores.ts";
import { registrarCambio } from "../registro.ts";
import { fechaISO, objeto, opcional, parsear, texto, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });
const esquemaRegistro = objeto({ id: uuid(), progresion_id: uuid() });
const esquemaOtorgar = objeto({ nivel_id: uuid(), fecha_obtenido: fechaISO(), observaciones: opcional(texto({ max: 1000 })), instructor_id: opcional(uuid()) });

const presentarNivel = (n: NivelDeVertical) => ({ id: n.id, nombre: n.nombre, orden: n.orden, color_hex: n.colorHex, horas_minimas: n.horasMinimas, clases_minimas: n.clasesMinimas, requisitos_texto: n.requisitosTexto });
const veObservaciones = (ctx: ContextoApi): boolean => ctx.usuario.rol === "administrador" || ctx.usuario.rol === "maestro";

export function rutasDeProgresion(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  const alumnoVisible = async (ctx: ContextoApi, id: string) => {
    const a = await ctx.db.alumno.findFirst({ where: { id, ...(await dondeAlumnoVisible(ctx)) }, select: { id: true } });
    if (!a) throw noEncontrado();
  };

  r.get("/alumnos/:id/progresion", requierePermiso("alumnos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await alumnoVisible(ctx, id);
    // Las verticales donde el alumno tiene (o tuvo) una inscripción o ya tiene algún peldaño.
    const deInscripciones = await ctx.db.inscripcion.findMany({ where: { alumno_id: id }, select: { programa: { select: { vertical_id: true } } } });
    const dePeldanos = await ctx.db.alumno_progresion.findMany({ where: { alumno_id: id }, select: { nivel: { select: { vertical_id: true } } } });
    const verticalIds = [...new Set([...deInscripciones.map((i) => i.programa.vertical_id), ...dePeldanos.map((p) => p.nivel.vertical_id)])];
    const verticales = await ctx.db.vertical.findMany({ where: { id: { in: verticalIds } }, select: { id: true, nombre: true, etiqueta_progresion: true, usa_progresion: true }, orderBy: [{ nombre: "asc" }, { id: "asc" }] });
    const observaciones = veObservaciones(ctx)
      ? new Map((await ctx.db.alumno_progresion.findMany({ where: { alumno_id: id }, select: { id: true, observaciones: true } })).map((o) => [o.id, o.observaciones]))
      : null;
    const salida = [];
    for (const v of verticales) {
      const niveles = await nivelesDeVertical(ctx.db, v.id);
      const historial = await historialDeVertical(ctx.db, id, v.id);
      const actual = historial[0] ?? null;
      const siguiente = siguienteNivel(niveles, actual?.nivel ?? null);
      salida.push({
        vertical: { id: v.id, nombre: v.nombre, etiqueta_progresion: v.etiqueta_progresion, usa_progresion: v.usa_progresion },
        nivel_actual: actual ? { ...presentarNivel(actual.nivel), progresion_id: actual.progresionId, fecha_obtenido: actual.fechaObtenido } : null,
        siguiente_nivel: siguiente ? presentarNivel(siguiente) : null,
        historial: historial.map((h) => ({ progresion_id: h.progresionId, ...presentarNivel(h.nivel), fecha_obtenido: h.fechaObtenido, evento_id: h.eventoId, instructor_id: h.instructorId, ...(observaciones ? { observaciones: observaciones.get(h.progresionId) ?? null } : {}) })),
        niveles: niveles.map(presentarNivel),
      });
    }
    res.json({ alumno_id: id, verticales: salida });
  });

  r.post("/alumnos/:id/progresion", requierePermiso("progresion:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaOtorgar, req.body);
    await alumnoVisible(ctx, id);
    // El instructor: el maestro que registra (si tiene instructor); el administrador puede indicarlo.
    let instructorId: string | null = null;
    if (ctx.usuario.rol === "maestro") {
      const propio = await ctx.db.instructor.findFirst({ where: { usuario_id: ctx.usuario.id }, select: { id: true } });
      if (!propio) throw prohibido("Tu usuario no está ligado a un instructor");
      if (e.instructor_id && e.instructor_id !== propio.id) throw validacion([{ campo: "instructor_id", mensaje: "Solo puedes registrarte a ti mismo como instructor" }]);
      instructorId = propio.id;
    } else if (e.instructor_id) instructorId = e.instructor_id;
    const resultado = await ctx.db.$transaction(async (tx) => {
      const r2 = await otorgarNivel(tx, { alumnoId: id, nivelId: e.nivel_id, fechaObtenido: e.fecha_obtenido, ahora: ctx.ahora(), usuarioId: ctx.usuario.id, instructorId, observaciones: e.observaciones ?? null });
      if (r2.ok) await registrarCambio(tx, ctx, { entidad: "alumno_progresion", entidadId: r2.progresionId, accion: "crear", despues: { alumno_id: id, nivel_id: e.nivel_id, fecha_obtenido: e.fecha_obtenido, evento_id: null, instructor_id: instructorId } });
      return r2;
    });
    if (!resultado.ok) {
      if (resultado.motivo === "nivel_inexistente" || resultado.motivo === "alumno_inexistente") throw noEncontrado(resultado.mensaje);
      if (resultado.motivo === "instructor_inexistente") throw validacion([{ campo: "instructor_id", mensaje: resultado.mensaje }]);
      throw conflicto(resultado.mensaje, [{ campo: "motivo", mensaje: resultado.motivo }]);
    }
    res.status(201).json({ progresion_id: resultado.progresionId, alumno_id: id, nivel_id: resultado.nivelId, vertical_id: resultado.verticalId, fecha_obtenido: e.fecha_obtenido });
  });

  r.delete("/alumnos/:id/progresion/:progresion_id", requierePermiso("progresion:corregir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id, progresion_id } = parsear(esquemaRegistro, req.params);
    await alumnoVisible(ctx, id);
    const fila = await ctx.db.alumno_progresion.findFirst({ where: { id: progresion_id, alumno_id: id }, select: { id: true, nivel_id: true, fecha_obtenido: true, evento_id: true, instructor_id: true } });
    if (!fila) throw noEncontrado();
    if (fila.evento_id) throw conflicto("El peldaño lo otorgó un evento: se corrige desde el resultado del evento", [{ campo: "motivo", mensaje: "otorgado_por_evento" }]);
    await ctx.db.$transaction(async (tx) => {
      await tx.alumno_progresion.update({ where: { id: progresion_id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "alumno_progresion", entidadId: progresion_id, accion: "eliminar", antes: { alumno_id: id, nivel_id: fila.nivel_id, fecha_obtenido: fila.fecha_obtenido.toISOString().slice(0, 10), evento_id: null, instructor_id: fila.instructor_id } });
    });
    res.status(204).end();
  });

  return r;
}
