// Datos de salud de menores (decisión 12). La ÚNICA ruta que los toca; todo pasa por
// `leerSensible()` / `guardarSensible()` de src/sensibles/, que cifra, exige el permiso y deja
// constancia en el registro de accesos.
//
//   GET /api/salud/:sujeto_tipo/:sujeto_id?campos=a,b   + cabecera X-Motivo-De-Consulta (con encodeURIComponent)   (salud:leer: administrador, maestro del grupo)
//        (la forma vieja `?motivo=` se acepta, pero deja el motivo en la dirección: no la uses)
//   PUT /api/salud/:sujeto_tipo/:sujeto_id   { motivo, <campo>?: valor | null }   (salud:escribir)
//   GET /api/salud-accesos?sujeto_id=&usuario_id=&resultado=   (registro_cambios:leer: administrador) quién vio a quién
//
// Todo intento denegado —también el de un rol sin permiso, que ni llega al servicio— queda en el
// registro de accesos (EB-01): la guarda de permiso de estas rutas es `requierePermisoConRastro`.
//
// Un maestro solo accede a sujetos de sus grupos; mientras no exista la inscripción (F1/F3) eso
// significa ninguno (falla cerrado). Lo que no existe o no es tuyo da 404. Las respuestas no se
// guardan en cachés (`Cache-Control: no-store` de /api).

import { type Router, type Request, type Response } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { normalizarTelefono } from "../../lib/telefono.ts";
import { CAMPOS_SENSIBLES, ErrorAccesoSensible, guardarSensible, leerSensible, listarAccesos, registrarDenegado, type CampoSensible, type SujetoSalud } from "../../sensibles/index.ts";
import { requierePermiso, requierePermisoConRastro } from "../autorizar.ts";
import { contextoDe, contextoParaAutorizar, type ContextoApi, type DepsApi } from "../contexto.ts";
import { esquemaPaginacion, leerPaginacion } from "../paginacion.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { noEncontrado, prohibido, validacion } from "../errores.ts";
import { booleano, enumerado, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SUJETOS = ["prospecto", "alumno"] as const;
const esquemaRuta = objeto({ sujeto_tipo: enumerado(SUJETOS), sujeto_id: uuid() });
const esquemaLectura = objeto({ motivo: opcional(texto({ min: 3, max: 300 })), campos: opcional(texto({ max: 200 })) });
const esquemaMotivo = objeto({ motivo: texto({ min: 3, max: 300 }) });

/**
 * El motivo de la consulta (V10 / EB-21): viaja en la cabecera `X-Motivo-De-Consulta` (con `encodeURIComponent`, porque una cabecera no lleva acentos), no en la URL: las
 * direcciones quedan en los registros del balanceador, del navegador y de cualquier intermediario, y el motivo lo escribe una persona (puede ser una frase libre). La
 * forma vieja `?motivo=` se sigue aceptando para quien ya la usa, pero la interfaz ya no la manda.
 */
export const CABECERA_MOTIVO = "x-motivo-de-consulta";
function motivoPedido(req: Request): string | undefined {
  const h = req.get(CABECERA_MOTIVO);
  if (h !== undefined) {
    try {
      return decodeURIComponent(h);
    } catch {
      throw validacion([{ campo: "motivo", mensaje: "El motivo de la consulta no se pudo leer" }]);
    }
  }
  return typeof req.query["motivo"] === "string" ? req.query["motivo"] : undefined;
}
const esquemaEscritura = objeto({
  motivo: texto({ min: 3, max: 300 }),
  alergias: opcional(nulable(texto({ max: 2000 }))),
  condiciones_medicas: opcional(nulable(texto({ max: 2000 }))),
  medicamentos: opcional(nulable(texto({ max: 2000 }))),
  contacto_emergencia: opcional(nulable(objeto({ nombre: texto({ max: 120 }), telefono: texto({ max: 30 }), parentesco: opcional(texto({ max: 60 })) }))),
  autorizacion_atencion_medica: opcional(nulable(booleano())),
});

const esquemaAccesos = objeto({ ...esquemaPaginacion, sujeto_id: opcional(uuid()), usuario_id: opcional(uuid()), resultado: opcional(enumerado(["permitido", "denegado"] as const)) });

const actorDe = (ctx: ContextoApi) => ({ usuarioId: ctx.usuario.id, organizacionId: ctx.organizacionId, rol: ctx.usuario.rol });

function traducir(e: unknown): never {
  if (e instanceof ErrorAccesoSensible) throw e.motivo === "sin_permiso" ? prohibido() : noEncontrado();
  throw e;
}

export function rutasDeSalud(deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** Un rol sin permiso que sondea un sujeto válido deja constancia (sin leer nada ni confirmar que exista). */
  const rastro = (accion: "leer" | "escribir") => async (req: Request, res: Response): Promise<void> => {
    const ctx = contextoParaAutorizar(res);
    let ruta;
    try {
      ruta = parsear(esquemaRuta, req.params);
    } catch {
      return; // identificador mal formado: no hay sujeto a quien atribuir el intento
    }
    let pedido: string | undefined;
    try {
      pedido = motivoPedido(req);
    } catch {
      pedido = undefined; // una cabecera ilegible igual deja constancia del intento
    }
    const motivo = pedido !== undefined && pedido.trim() ? pedido.trim().slice(0, 300) : "(sin motivo)";
    await registrarDenegado(
      ctx.db,
      actorDe(ctx),
      { sujetoTipo: ruta.sujeto_tipo as SujetoSalud, sujetoId: ruta.sujeto_id, motivo: accion === "leer" ? motivo : "(escritura denegada antes de leer el cuerpo)", ruta: `${req.method} ${req.baseUrl}${req.path}` },
      accion,
      "sin_permiso",
    );
  };

  r.get("/salud/:sujeto_tipo/:sujeto_id", requierePermisoConRastro("salud:leer", rastro("leer")), async (req, res) => {
    const ctx = contextoDe(res);
    const ruta = parsear(esquemaRuta, req.params);
    const q = parsearQuery(esquemaLectura, req.query);
    const { motivo } = parsear(esquemaMotivo, { motivo: motivoPedido(req) });
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
        { sujetoTipo: ruta.sujeto_tipo as SujetoSalud, sujetoId: ruta.sujeto_id, motivo, ruta: `GET ${req.baseUrl}${req.path}`, ...(campos ? { campos } : {}) },
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

  r.put("/salud/:sujeto_tipo/:sujeto_id", requierePermisoConRastro("salud:escribir", rastro("escribir")), json, async (req, res) => {
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

  // Quién vio la ficha de quién (EB-21): solo el administrador. Nunca trae valores, solo nombres de campos.
  r.get("/salud-accesos", requierePermiso("registro_cambios:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaAccesos, req.query);
    const pag = leerPaginacion(q);
    const { total, filas } = await listarAccesos(
      ctx.db,
      { ...(q.sujeto_id ? { sujetoId: q.sujeto_id } : {}), ...(q.usuario_id ? { usuarioId: q.usuario_id } : {}), ...(q.resultado ? { resultado: q.resultado } : {}) },
      { saltar: pag.saltar, tomar: pag.limite },
    );
    res.json({ datos: filas, paginacion: { pagina: pag.pagina, limite: pag.limite, total } });
  });

  return r;
}
