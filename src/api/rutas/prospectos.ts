// Los niños de un lead (V3, «segundo hijo»). Ver `src/captacion/prospectos.ts`.
//
//   GET    /api/leads/:id/prospectos                                       (leads:leer)
//   POST   /api/leads/:id/prospectos { nombre, apellidos?, fecha_nacimiento? | edad?, vertical_id?, clave_idempotencia? }   (leads:escribir)  agrega otro niño
//   PATCH  /api/leads/:id/prospectos/:prospecto_id { nombre?, apellidos?, fecha_nacimiento?, edad?, vertical_id? }   (leads:escribir)  corrige
//   DELETE /api/leads/:id/prospectos/:prospecto_id                          (leads:escribir)  lo quita de la ficha (baja lógica)
//
// El lead es el adulto que escribe; cada niño es un `prospecto` (invariante 13). El bot captura uno; el asesor agrega los demás. Alcance: el mismo del lead (`condicionDeLead`: el
// asesor ve los de sus sucursales y los que aún no tienen sucursal; el administrador, todos; lo ajeno es 404). Captación es el módulo base: estas rutas nunca se apagan.
//
// POST es idempotente: con `clave_idempotencia` un reintento devuelve el mismo niño (200, `repetido: true`); sin clave, el mismo nombre con la misma fecha de nacimiento
// (o, sin fecha, la misma edad) en el mismo lead tampoco se duplica. La misma clave con otro niño es 409. Tope: 10 niños vivos por lead (409 con el motivo).
// La respuesta trae `avisos` (no bloquean): por ejemplo, que por su edad no hay un programa en esa disciplina y sucursal.
//   POST   /api/leads/:id/prospectos/:prospecto_id/aceptaciones-del-hermano { desde_prospecto_id }   (conversion:ejecutar)  la familia acepta el reglamento por este niño igual que
//          por su hermano (mismo adulto, mismo canal, solo la versión VIGENTE); queda como una aceptación nueva del niño, con la evidencia de que se extendió del hermano.
// Datos de salud: esta API NO los recibe (el esquema es cerrado: cualquier campo que no sea de la lista responde 400 y no se guarda nada). Los captura el maestro en su registro.

import { Router } from "express";
import express from "express";
import { hoyDelLead, agregarNino, corregirNino, presentarNino, quitarNino, SELECCION_DE_NINO, type FilaDeNino, type ResultadoDeNino, type RechazoDeNino } from "../../captacion/prospectos.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { leerModulos } from "../../modulos/index.ts";
import { condicionDeLead } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { extenderAceptacionDeReglamento } from "../../legal/aceptaciones.ts";
import { registrarCambio } from "../registro.ts";
import { entero, fechaISO, nulable, objeto, opcional, parsear, texto, uuid } from "../validar.ts";

const esquemaLead = objeto({ id: uuid() });
const esquemaNino = objeto({ id: uuid(), prospecto_id: uuid() });
const esquemaAlta = objeto({
  nombre: texto({ max: 120 }),
  apellidos: opcional(nulable(texto({ max: 120 }))),
  fecha_nacimiento: opcional(nulable(fechaISO())),
  edad: opcional(nulable(entero({ min: 1, max: 99 }))),
  vertical_id: opcional(uuid()),
  clave_idempotencia: opcional(texto({ min: 8, max: 120, patron: /^[A-Za-z0-9._:-]+$/, mensajePatron: "Solo letras, números y . _ : -" })),
});
const esquemaDesde = objeto({ desde_prospecto_id: uuid() });
const esquemaCambio = objeto({
  nombre: opcional(texto({ max: 120 })),
  apellidos: opcional(nulable(texto({ max: 120 }))),
  fecha_nacimiento: opcional(nulable(fechaISO())),
  edad: opcional(nulable(entero({ min: 1, max: 99 }))),
  vertical_id: opcional(uuid()),
});

/** Lo que se audita de un niño: NADA identificable (el registro de cambios es de solo anexar). `campos` dice qué se tocó, no con qué valores. */
const instantanea = (f: FilaDeNino, campos: string[]) => ({ lead_id: f.lead_id, vertical_interes_id: f.vertical_interes_id, origen: f.origen, campos });

export function rutasDeProspectos(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** El lead, si lo ve quien pregunta. */
  async function leadVisible(ctx: ContextoApi, id: string) {
    const lead = await ctx.db.lead.findFirst({ where: { id, ...(condicionDeLead(await ctx.alcance()) ?? {}) }, select: { id: true, sucursal_interes_id: true } });
    if (!lead) throw noEncontrado();
    return lead;
  }

  /** Del rechazo del dominio al error de la API (sin 500: todo rechazo es una respuesta clara). */
  function aError(rechazo: RechazoDeNino): never {
    switch (rechazo.motivo) {
      case "no_encontrado":
        throw noEncontrado();
      case "validacion":
        throw validacion(rechazo.problemas);
      case "limite":
      case "clave_en_uso":
      case "repetido_en_otro":
      case "ya_es_alumno":
      case "tiene_pendientes":
      case "cambia_disciplina":
        throw conflicto(rechazo.mensaje, [{ campo: "motivo", mensaje: rechazo.motivo }]);
    }
  }

  r.get("/leads/:id/prospectos", requierePermiso("leads:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaLead, req.params);
    const lead = await leadVisible(ctx, id);
    const hoy = await hoyDelLead(ctx.db, lead.sucursal_interes_id, ctx.ahora());
    const cotizador = (await leerModulos(ctx.db)).cotizador;
    const filas = (await ctx.db.prospecto.findMany({ where: { lead_id: id }, select: SELECCION_DE_NINO, orderBy: [{ creado_en: "asc" }, { id: "asc" }] })) as FilaDeNino[];
    res.json({ datos: filas.map((f) => presentarNino(f, { hoy, cotizador })) });
  });

  r.post("/leads/:id/prospectos", requierePermiso("leads:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaLead, req.params);
    const e = parsear(esquemaAlta, req.body);
    const lead = await leadVisible(ctx, id);
    const alta = { nombre: e.nombre, apellidos: e.apellidos ?? null, fechaNacimiento: e.fecha_nacimiento ?? null, edad: e.edad ?? null, ...(e.vertical_id ? { verticalId: e.vertical_id } : {}), claveIdempotencia: e.clave_idempotencia ?? null };
    const intentar = (): Promise<ResultadoDeNino> =>
      ctx.db.$transaction(async (tx) => {
        const h = await agregarNino(tx, id, alta, ctx.ahora());
        if (h.ok && h.creado) await registrarCambio(tx, ctx, { entidad: "prospecto", entidadId: h.nino.id, accion: "crear", despues: instantanea(h.nino, ["nombre", "fecha_nacimiento", "edad"]) });
        return h;
      });
    let h: ResultadoDeNino;
    try {
      h = await intentar();
    } catch (error) {
      // La red de seguridad de la base (clave o niño repetidos) por una carrera que el candado del lead no cubrió: se vuelve a leer y gana el que ya está.
      if (!esViolacionUnica(error)) throw error;
      h = await intentar();
    }
    if (!h.ok) aError(h);
    const hoy = await hoyDelLead(ctx.db, lead.sucursal_interes_id, ctx.ahora());
    const cotizador = (await leerModulos(ctx.db)).cotizador;
    res.status(h.creado ? 201 : 200).json({ ...presentarNino(h.nino, { hoy, cotizador }), ...(h.creado ? {} : { repetido: true }), avisos: h.avisos });
  });

  r.patch("/leads/:id/prospectos/:prospecto_id", requierePermiso("leads:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id, prospecto_id } = parsear(esquemaNino, req.params);
    const e = parsear(esquemaCambio, req.body);
    const lead = await leadVisible(ctx, id);
    const campos = Object.keys(e);
    if (campos.length === 0) throw validacion([{ mensaje: "No mandaste nada que cambiar" }]);
    const cambio = {
      ...(e.nombre !== undefined ? { nombre: e.nombre } : {}),
      ...(e.apellidos !== undefined ? { apellidos: e.apellidos } : {}),
      ...(e.fecha_nacimiento !== undefined ? { fechaNacimiento: e.fecha_nacimiento } : {}),
      ...(e.edad !== undefined ? { edad: e.edad } : {}),
      ...(e.vertical_id !== undefined ? { verticalId: e.vertical_id } : {}),
    };
    const h = await ctx.db.$transaction(async (tx) => {
      const x = await corregirNino(tx, id, prospecto_id, cambio, ctx.ahora());
      if (x.ok) await registrarCambio(tx, ctx, { entidad: "prospecto", entidadId: prospecto_id, accion: "actualizar", despues: instantanea(x.nino, campos) });
      return x;
    });
    if (!h.ok) aError(h);
    const hoy = await hoyDelLead(ctx.db, lead.sucursal_interes_id, ctx.ahora());
    res.json({ ...presentarNino(h.nino, { hoy, cotizador: (await leerModulos(ctx.db)).cotizador }), avisos: h.avisos });
  });

  r.post("/leads/:id/prospectos/:prospecto_id/aceptaciones-del-hermano", requierePermiso("conversion:ejecutar"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id, prospecto_id } = parsear(esquemaNino, req.params);
    const { desde_prospecto_id } = parsear(esquemaDesde, req.body);
    await leadVisible(ctx, id);
    if (desde_prospecto_id === prospecto_id) throw validacion([{ campo: "desde_prospecto_id", mensaje: "Elige a otro niño de la familia" }]);
    const ninos = await ctx.db.prospecto.findMany({ where: { lead_id: id, id: { in: [prospecto_id, desde_prospecto_id] } }, select: { id: true } });
    if (ninos.length !== 2) throw noEncontrado("No se encontró al niño");
    const h = await extenderAceptacionDeReglamento(ctx.db, ctx.organizacionId, { desdeProspectoId: desde_prospecto_id, haciaProspectoId: prospecto_id, usuarioId: ctx.usuario.id, ahora: ctx.ahora() });
    if (!h.ok) {
      if (h.motivo === "sin_aceptacion") throw conflicto("Su hermano todavía no tiene el reglamento aceptado: la familia debe aceptarlo", [{ campo: "motivo", mensaje: h.motivo }]);
      if (h.motivo === "version_no_vigente") throw conflicto("El reglamento cambió desde que lo aceptaron por su hermano: la familia debe aceptar la versión vigente", [{ campo: "motivo", mensaje: h.motivo }]);
      throw conflicto("El reglamento de este niño no es el mismo que el de su hermano: la familia debe aceptarlo", [{ campo: "motivo", mensaje: h.motivo }]);
    }
    if (h.creada) {
      await ctx.db.$transaction((tx) => registrarCambio(tx, ctx, { entidad: "aceptacion_legal", entidadId: h.aceptacion.id, accion: "crear", despues: { tipo: h.aceptacion.tipo, version_aceptada: h.aceptacion.versionAceptada, resultado: h.aceptacion.resultado, canal: h.aceptacion.canal, documento_id: h.aceptacion.documentoId } }));
    }
    res.status(h.creada ? 201 : 200).json({ creada: h.creada, tipo: h.aceptacion.tipo, version: h.aceptacion.versionAceptada, resultado: h.aceptacion.resultado });
  });

  r.delete("/leads/:id/prospectos/:prospecto_id", requierePermiso("leads:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id, prospecto_id } = parsear(esquemaNino, req.params);
    await leadVisible(ctx, id);
    const h = await ctx.db.$transaction(async (tx) => {
      const actual = (await tx.prospecto.findFirst({ where: { id: prospecto_id, lead_id: id }, select: SELECCION_DE_NINO })) as FilaDeNino | null;
      const x = await quitarNino(tx, id, prospecto_id, ctx.ahora());
      if (x.ok && actual) {
        await registrarCambio(tx, ctx, { entidad: "prospecto", entidadId: prospecto_id, accion: "eliminar", antes: instantanea(actual, []) });
        for (const c of x.cotizacionesVencidas) await registrarCambio(tx, ctx, { entidad: "cotizacion", entidadId: c, accion: "actualizar", antes: { estatus: "vigente" }, despues: { estatus: "vencida" } });
      }
      return x;
    });
    if (!h.ok) aError(h);
    res.status(204).end();
  });

  return r;
}
