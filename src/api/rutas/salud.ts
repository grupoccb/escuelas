// Datos de salud de menores (decisión 12). La ÚNICA ruta que los toca; todo pasa por
// `leerSensible()` / `guardarSensible()` de src/sensibles/, que cifra, exige el permiso y deja
// constancia en el registro de accesos.
//
//   GET /api/salud/:sujeto_tipo/:sujeto_id?motivo=…&campos=a,b   (salud:leer: administrador, maestro del grupo)
//   PUT /api/salud/:sujeto_tipo/:sujeto_id   { motivo, <campo>?: valor | null }   (salud:escribir)
//
// Un maestro solo accede a sujetos de sus grupos; mientras no exista la inscripción (F1/F3) eso
// significa ninguno (falla cerrado). Lo que no existe o no es tuyo da 404. Las respuestas no se
// guardan en cachés (`Cache-Control: no-store` de /api).

import { Router } from "express";
import express from "express";
import { normalizarTelefono } from "../../lib/telefono.ts";
import { CAMPOS_SENSIBLES, ErrorAccesoSensible, guardarSensible, leerSensible, type CampoSensible, type SujetoSalud } from "../../sensibles/index.ts";
import { autenticar } from "../autenticar.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { noEncontrado, prohibido, validacion } from "../errores.ts";
import { booleano, enumerado, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SUJETOS = ["prospecto", "alumno"] as const;
const esquemaRuta = objeto({ sujeto_tipo: enumerado(SUJETOS), sujeto_id: uuid() });
const esquemaLectura = objeto({ motivo: texto({ min: 3, max: 300 }), campos: opcional(texto({ max: 200 })) });
const esquemaEscritura = objeto({
  motivo: texto({ min: 3, max: 300 }),
  alergias: opcional(nulable(texto({ max: 2000 }))),
  condiciones_medicas: opcional(nulable(texto({ max: 2000 }))),
  medicamentos: opcional(nulable(texto({ max: 2000 }))),
  contacto_emergencia: opcional(nulable(objeto({ nombre: texto({ max: 120 }), telefono: texto({ max: 30 }), parentesco: opcional(texto({ max: 60 })) }))),
  autorizacion_atencion_medica: opcional(nulable(booleano())),
});

const actorDe = (ctx: ContextoApi) => ({ usuarioId: ctx.usuario.id, organizacionId: ctx.organizacionId, rol: ctx.usuario.rol });

function traducir(e: unknown): never {
  if (e instanceof ErrorAccesoSensible) throw e.motivo === "sin_permiso" ? prohibido() : noEncontrado();
  throw e;
}

export function rutasDeSalud(deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/salud/:sujeto_tipo/:sujeto_id", autenticar(deps), requierePermiso("salud:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const ruta = parsear(esquemaRuta, req.params);
    const q = parsearQuery(esquemaLectura, req.query);
    let campos: CampoSensible[] | undefined;
    if (q.campos !== undefined) {
      const pedidos = q.campos.split(",").map((c) => c.trim());
      const malos = pedidos.filter((c) => !(CAMPOS_SENSIBLES as readonly string[]).includes(c));
      if (malos.length > 0) throw validacion([{ campo: "campos", mensaje: "Campo desconocido" }]);
      campos = pedidos as CampoSensible[];
    }
    try {
      const ficha = await leerSensible(
        ctx.db,
        actorDe(ctx),
        { sujetoTipo: ruta.sujeto_tipo as SujetoSalud, sujetoId: ruta.sujeto_id, motivo: q.motivo, ruta: `GET ${req.baseUrl}${req.path}`, ...(campos ? { campos } : {}) },
        deps.sensibles,
      );
      const salida: Record<string, unknown> = {};
      // Aquí, y solo aquí, se revela: ya pasó el permiso, la regla del maestro y el registro del acceso.
      for (const [campo, valor] of Object.entries(ficha.campos)) salida[campo] = valor ? valor.revelar() : null;
      res.json({ sujeto_tipo: ruta.sujeto_tipo, sujeto_id: ruta.sujeto_id, existe: ficha.existe, campos: salida });
    } catch (e) {
      traducir(e);
    }
  });

  r.put("/salud/:sujeto_tipo/:sujeto_id", autenticar(deps), requierePermiso("salud:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const ruta = parsear(esquemaRuta, req.params);
    const { motivo, ...valores } = parsear(esquemaEscritura, req.body);
    if (Object.keys(valores).length === 0) throw validacion([{ mensaje: "No hay ningún dato que guardar" }]);
    if (valores.contacto_emergencia) {
      const telefono = normalizarTelefono(valores.contacto_emergencia.telefono);
      if (!telefono) throw validacion([{ campo: "contacto_emergencia.telefono", mensaje: "No es un teléfono válido" }]);
      valores.contacto_emergencia = { ...valores.contacto_emergencia, telefono };
    }
    try {
      await guardarSensible(
        ctx.db,
        actorDe(ctx),
        { sujetoTipo: ruta.sujeto_tipo as SujetoSalud, sujetoId: ruta.sujeto_id, motivo, ruta: `PUT ${req.baseUrl}${req.path}`, valores },
        deps.sensibles,
      );
    } catch (e) {
      traducir(e);
    }
    res.status(204).end();
  });

  return r;
}
