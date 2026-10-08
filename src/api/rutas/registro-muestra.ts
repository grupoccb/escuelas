// Registro de la clase muestra (D5): lo que el maestro, el asesor o el administrador capturan de la clase.
//
//   GET   /api/clases-muestra/:id/registro                (registro_muestra:leer)      el registro (o el esqueleto «sin captura»)
//   PATCH /api/clases-muestra/:id/registro                (registro_muestra:escribir)  guarda lo que venga (borrador); crea el registro si no existe
//   POST  /api/clases-muestra/:id/registro/completar      (registro_muestra:escribir)  borrador → completo (409 con lo que falta)
//   POST  /api/clases-muestra/:id/registro/cerrar         (registro_muestra:escribir)  completo → cerrado (exige reglamento aceptado, D6)
//   POST  /api/clases-muestra/:id/registro/reabrir        (registro_muestra:reabrir)   cerrado → completo (solo el administrador)
//
// Cuerpo del PATCH (todo opcional; `null` borra un valor; una sección ausente no cambia):
//   { alumno: { nombre, apellidos, fecha_nacimiento (AAAA-MM-DD), sexo, escuela, turno_escolar, talla_uniforme },
//     tutores: [ { id?, nombre, apellidos?, parentesco, telefono, correo?, es_responsable_pago?, lo_lleva?, puede_recoger? } ]   ← la lista COMPLETA
//     salud: { … }    ← la valida y la guarda src/sensibles/ (cifrada); solo administrador y maestro; ver docs/API.md
//     antecedentes: { practico_antes, practico_donde, practico_nivel, motivo_clase, motivo_clase_detalle },
//     observacion: { asistio, nivel_observado, grupo_recomendado_id, interes_percibido, notas } }
//
// Alcance: el maestro, las clases de SUS grupos; el asesor, las de sus sucursales; el administrador, todas. Lo ajeno, 404. Los
// datos de salud NO se leen aquí: `GET /api/salud/prospecto/:id` (permiso, motivo y constancia de cada acceso).

import { Router } from "express";
import express from "express";
import { completarRegistro, cerrarRegistro, guardarRegistro, leerRegistro, reabrirRegistro, INTERESES, MOTIVOS_DE_CLASE, SEXOS, TURNOS_ESCOLARES, type EntradaDelRegistro } from "../../clases-muestra/registro.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { noEncontrado } from "../errores.ts";
import { booleano, correo, enumerado, fechaISO, listaDe, nulable, objeto, objetoOpaco, opcional, parsear, texto, uuid } from "../validar.ts";
import { alcanceDeClases } from "./clases-muestra.ts";

const textoONulo = (max: number) => opcional(nulable(texto({ max })));

const esquemaId = objeto({ id: uuid() });
const esquemaTutor = objeto({
  id: opcional(uuid()),
  nombre: texto({ max: 120 }),
  apellidos: textoONulo(120),
  parentesco: texto({ max: 60 }),
  telefono: texto({ max: 30 }),
  correo: opcional(nulable(correo())),
  es_responsable_pago: opcional(booleano()),
  lo_lleva: opcional(booleano()),
  puede_recoger: opcional(booleano()),
});
const esquemaPatch = objeto({
  alumno: opcional(
    objeto({
      nombre: textoONulo(120),
      apellidos: textoONulo(120),
      fecha_nacimiento: opcional(nulable(fechaISO())),
      sexo: opcional(nulable(enumerado(SEXOS))),
      escuela: textoONulo(160),
      turno_escolar: opcional(nulable(enumerado(TURNOS_ESCOLARES))),
      talla_uniforme: textoONulo(20),
    }),
  ),
  tutores: opcional(listaDe(esquemaTutor, { max: 10 })),
  salud: opcional(objetoOpaco()),
  antecedentes: opcional(
    objeto({
      practico_antes: opcional(nulable(booleano())),
      practico_donde: textoONulo(160),
      practico_nivel: textoONulo(120),
      motivo_clase: opcional(nulable(enumerado(MOTIVOS_DE_CLASE))),
      motivo_clase_detalle: textoONulo(300),
    }),
  ),
  observacion: opcional(
    objeto({
      asistio: opcional(booleano()),
      nivel_observado: textoONulo(120),
      grupo_recomendado_id: opcional(nulable(uuid())),
      interes_percibido: opcional(nulable(enumerado(INTERESES))),
      notas: textoONulo(2000),
    }),
  ),
});

export function rutasDeRegistroMuestra(deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });
  const ruta = (metodo: string, id: string, sufijo = ""): string => `${metodo} /api/clases-muestra/${id}/registro${sufijo}`;

  /** La clase tiene que ser visible para quien pregunta (el maestro, de sus grupos; el asesor, de sus sucursales). Si no, 404. */
  async function exigirVisible(ctx: ReturnType<typeof contextoDe>, id: string): Promise<void> {
    const clase = await ctx.db.clase_muestra.findFirst({ where: { id, ...(await alcanceDeClases(ctx)) }, select: { id: true } });
    if (!clase) throw noEncontrado();
  }

  r.get("/clases-muestra/:id/registro", requierePermiso("registro_muestra:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await exigirVisible(ctx, id);
    res.json(await leerRegistro(ctx, id));
  });

  r.patch("/clases-muestra/:id/registro", requierePermiso("registro_muestra:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const entrada = parsear(esquemaPatch, req.body) as unknown as EntradaDelRegistro;
    await exigirVisible(ctx, id);
    res.json(await guardarRegistro(ctx, { sensibles: deps.sensibles, ruta: ruta("PATCH", id) }, id, entrada));
  });

  r.post("/clases-muestra/:id/registro/completar", requierePermiso("registro_muestra:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await exigirVisible(ctx, id);
    res.json(await completarRegistro(ctx, { sensibles: deps.sensibles, ruta: ruta("POST", id, "/completar") }, id));
  });

  r.post("/clases-muestra/:id/registro/cerrar", requierePermiso("registro_muestra:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await exigirVisible(ctx, id);
    res.json(await cerrarRegistro(ctx, id));
  });

  r.post("/clases-muestra/:id/registro/reabrir", requierePermiso("registro_muestra:reabrir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await exigirVisible(ctx, id);
    res.json(await reabrirRegistro(ctx, id));
  });

  return r;
}
