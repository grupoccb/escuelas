// Documentos legales y evidencia de aceptación (D6).
//
//   GET  /api/documentos-legales/vigentes?vertical_id=                 (registro_muestra:leer)  lo que se le muestra a la familia hoy
//   GET  /api/documentos-legales?tipo=&vertical_id=                    (catalogo:leer)          historial de versiones (sin el texto)
//   GET  /api/documentos-legales/:id                                   (catalogo:leer)          una versión con su texto
//   POST /api/documentos-legales {tipo, vertical_id?, titulo, texto, vigente_desde?}   (catalogo:escribir)  publica la versión SIGUIENTE
//   GET  /api/clases-muestra/:id/registro/aceptaciones                 (registro_muestra:leer)  estado («aceptó el reglamento v3 el …») e historial
//   POST /api/clases-muestra/:id/registro/aceptaciones {documento_id, version, resultado, aceptante, canal, evidencia?}   (registro_muestra:escribir)
//
// Los documentos son inmutables y versionados; las aceptaciones son de solo anexar (la revocación de la autorización de imagen es una fila
// nueva). Solo se acepta la versión vigente: si la que vio la familia ya no lo es, 409 con la vigente. Repetir lo mismo no duplica (200).

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { registrarCambio } from "../registro.ts";
import { documentosVigentes, crearVersionDeDocumento, TIPOS_DE_DOCUMENTO } from "../../legal/documentos.ts";
import { CANALES, RESULTADOS, estadoLegal, registrarAceptacion, type FilaDeAceptacion } from "../../legal/aceptaciones.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { entero, enumerado, instanteISO, nulable, objeto, objetoOpaco, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";
import { alcanceDeClases } from "./clases-muestra.ts";

const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({ ...esquemaPaginacion, tipo: opcional(enumerado(TIPOS_DE_DOCUMENTO)), vertical_id: opcional(uuid()) });
const esquemaVigentes = objeto({ vertical_id: opcional(uuid()) });
const esquemaNuevaVersion = objeto({ tipo: enumerado(TIPOS_DE_DOCUMENTO), vertical_id: opcional(nulable(uuid())), titulo: texto({ max: 200 }), texto: texto({ max: 60_000 }), vigente_desde: opcional(instanteISO()) });
const esquemaAceptacion = objeto({
  documento_id: uuid(),
  version: entero({ min: 1 }),
  resultado: enumerado(RESULTADOS),
  aceptante: objeto({ nombre: opcional(texto({ max: 160 })), parentesco: opcional(texto({ max: 60 })), registro_tutor_id: opcional(uuid()) }),
  canal: enumerado(CANALES),
  evidencia: opcional(objetoOpaco()),
});

const presentarAceptacion = (a: FilaDeAceptacion) => ({
  id: a.id,
  documento_id: a.documentoId,
  tipo: a.tipo,
  version: a.versionAceptada,
  resultado: a.resultado,
  aceptante: { nombre: a.aceptanteNombre, parentesco: a.aceptanteParentesco, registro_tutor_id: a.registroTutorId },
  canal: a.canal,
  capturada_por_usuario_id: a.capturadaPorUsuarioId,
  aceptado_en: a.aceptadoEn,
  texto_hash: a.textoHash,
  evidencia: a.evidencia,
});

/** Evidencia opcional: a lo más 10 pares con texto corto (una nota de cómo se mostró, un folio…). Nada de archivos ni binarios. */
function evidenciaDe(valor: Record<string, unknown> | undefined): Record<string, string> | null {
  if (valor === undefined) return null;
  const pares = Object.entries(valor);
  const problemas = [];
  if (pares.length > 10) problemas.push({ campo: "evidencia", mensaje: "A lo más 10 datos" });
  for (const [k, v] of pares) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k)) problemas.push({ campo: `evidencia.${k.slice(0, 40)}`, mensaje: "El nombre del dato debe ser minúsculas, dígitos y guion bajo (máx. 40)" });
    else if (typeof v !== "string" || v.length > 500 || v.includes("\u0000")) problemas.push({ campo: `evidencia.${k}`, mensaje: "Debe ser un texto de a lo más 500 caracteres" });
  }
  if (problemas.length > 0) throw validacion(problemas);
  return Object.fromEntries(pares) as Record<string, string>;
}

const presentarDocumento = (d: { id: string; tipo: string; verticalId: string | null; version: number; titulo: string; vigenteDesde: Date; textoHash: string; texto?: string }) => ({
  id: d.id,
  tipo: d.tipo,
  vertical_id: d.verticalId,
  version: d.version,
  titulo: d.titulo,
  vigente_desde: d.vigenteDesde,
  texto_hash: d.textoHash,
  ...(d.texto !== undefined ? { texto: d.texto } : {}),
});

export function rutasDeLegal(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/documentos-legales/vigentes", requierePermiso("registro_muestra:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaVigentes, req.query);
    if (q.vertical_id && !(await ctx.db.vertical.findFirst({ where: { id: q.vertical_id }, select: { id: true } }))) throw noEncontrado();
    res.json({ datos: (await documentosVigentes(ctx.db, q.vertical_id ?? null, ctx.ahora())).map((d) => presentarDocumento(d)) });
  });

  r.get("/documentos-legales", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.tipo ? { tipo: q.tipo } : {}), ...(q.vertical_id ? { vertical_id: q.vertical_id } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.documento_legal.count({ where }),
        async (saltar, tomar) =>
          (await ctx.db.documento_legal.findMany({ where, orderBy: [{ tipo: "asc" }, { version: "desc" }, { id: "asc" }], skip: saltar, take: tomar, select: { id: true, tipo: true, vertical_id: true, version: true, titulo: true, vigente_desde: true, texto_hash: true } })).map((d) =>
            presentarDocumento({ id: d.id, tipo: d.tipo, verticalId: d.vertical_id, version: d.version, titulo: d.titulo, vigenteDesde: d.vigente_desde, textoHash: d.texto_hash }),
          ),
      ),
    );
  });

  r.get("/documentos-legales/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const d = await ctx.db.documento_legal.findFirst({ where: { id } });
    if (!d) throw noEncontrado();
    res.json(presentarDocumento({ id: d.id, tipo: d.tipo, verticalId: d.vertical_id, version: d.version, titulo: d.titulo, vigenteDesde: d.vigente_desde, textoHash: d.texto_hash, texto: d.texto }));
  });

  r.post("/documentos-legales", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaNuevaVersion, req.body);
    const resultado = await crearVersionDeDocumento(ctx.db, ctx.organizacionId, { tipo: e.tipo, verticalId: e.vertical_id ?? null, titulo: e.titulo, texto: e.texto, ...(e.vigente_desde ? { vigenteDesde: e.vigente_desde } : {}), usuarioId: ctx.usuario.id }, ctx.ahora());
    if (!resultado.ok) {
      if (resultado.motivo === "vertical_inexistente") throw validacion([{ campo: "vertical_id", mensaje: "No es una vertical de la organización" }]);
      throw conflicto("La nueva versión no puede regir antes que la anterior: elige una fecha igual o posterior", [{ campo: "vigente_desde", mensaje: "Es anterior a la de la versión previa" }]);
    }
    const d = resultado.documento;
    await ctx.db.$transaction((tx) => registrarCambio(tx, ctx, { entidad: "documento_legal", entidadId: d.id, accion: "crear", despues: { tipo: d.tipo, vertical_id: d.verticalId, version: d.version, titulo: d.titulo, vigente_desde: d.vigenteDesde } }));
    res.status(201).json(presentarDocumento(d));
  });

  /** La clase tiene que ser visible; devuelve lo que la aceptación necesita de ella. */
  async function claseVisible(ctx: ContextoApi, id: string) {
    const clase = await ctx.db.clase_muestra.findFirst({ where: { id, ...(await alcanceDeClases(ctx)) }, select: { id: true, estatus: true, prospecto_id: true, prospecto: { select: { vertical_interes_id: true } }, grupo: { select: { programa: { select: { sucursal: { select: { zona_horaria: true } } } } } } } });
    if (!clase) throw noEncontrado();
    return clase;
  }

  r.get("/clases-muestra/:id/registro/aceptaciones", requierePermiso("registro_muestra:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const clase = await claseVisible(ctx, id);
    const historial = await ctx.db.aceptacion_legal.findMany({
      where: { prospecto_id: clase.prospecto_id },
      orderBy: { secuencia: "desc" },
      take: 100,
      select: { id: true, documento_id: true, tipo: true, version_aceptada: true, resultado: true, aceptante_nombre: true, aceptante_parentesco: true, registro_tutor_id: true, canal: true, capturada_por_usuario_id: true, aceptado_en: true, texto_hash: true, evidencia: true, ip: true, agente_usuario: true, secuencia: true },
    });
    res.json({
      prospecto_id: clase.prospecto_id,
      // J2: con la vertical la interfaz pide los documentos vigentes (`GET /api/documentos-legales/vigentes?vertical_id=`) sin necesitar leer el lead.
      vertical_id: clase.prospecto.vertical_interes_id,
      estado: (await estadoLegal(ctx.db, clase.prospecto_id, clase.prospecto.vertical_interes_id, ctx.ahora(), clase.grupo.programa.sucursal.zona_horaria)).map((e) => ({ tipo: e.tipo, estado: e.estado, version_aceptada: e.versionAceptada, aceptado_en: e.aceptadoEn, aceptante: e.aceptante, version_vigente: e.versionVigente, al_corriente: e.alCorriente, texto: e.texto })),
      historial: historial.map((h) =>
        presentarAceptacion({ id: h.id, documentoId: h.documento_id, tipo: h.tipo, versionAceptada: h.version_aceptada, resultado: h.resultado, aceptanteNombre: h.aceptante_nombre, aceptanteParentesco: h.aceptante_parentesco, registroTutorId: h.registro_tutor_id, canal: h.canal, capturadaPorUsuarioId: h.capturada_por_usuario_id, aceptadoEn: h.aceptado_en, textoHash: h.texto_hash, evidencia: h.evidencia, ip: h.ip, agenteUsuario: h.agente_usuario, secuencia: h.secuencia }),
      ),
    });
  });

  r.post("/clases-muestra/:id/registro/aceptaciones", requierePermiso("registro_muestra:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaAceptacion, req.body);
    const clase = await claseVisible(ctx, id);
    if (clase.estatus === "cancelada" || clase.estatus === "reagendada") throw conflicto("La clase ya no está vigente: la aceptación se registra en la clase que la reemplazó");
    const evidencia = evidenciaDe(e.evidencia);
    // Si ya hay registro, la aceptación se liga a él; el adulto que acepta, si se nombra por su id, tiene que ser de ESE registro.
    const registro = await ctx.db.registro_clase_muestra.findFirst({ where: { clase_muestra_id: id }, select: { id: true } });
    let nombre = e.aceptante.nombre ?? null;
    let parentesco = e.aceptante.parentesco ?? null;
    if (e.aceptante.registro_tutor_id) {
      const t = registro ? await ctx.db.registro_tutor.findFirst({ where: { id: e.aceptante.registro_tutor_id, registro_id: registro.id }, select: { nombre: true, apellidos: true, parentesco: true } }) : null;
      if (!t) throw validacion([{ campo: "aceptante.registro_tutor_id", mensaje: "No es un adulto de este registro" }]);
      nombre ??= [t.nombre, t.apellidos].filter(Boolean).join(" ");
      parentesco ??= t.parentesco;
    }
    if (!nombre) throw validacion([{ campo: "aceptante.nombre", mensaje: "Dinos quién acepta (nombre y parentesco) o elige a uno de los adultos del registro" }]);
    const resultado = await registrarAceptacion(ctx.db, ctx.organizacionId, {
      prospectoId: clase.prospecto_id,
      documentoId: e.documento_id,
      version: e.version,
      resultado: e.resultado,
      aceptante: { nombre, parentesco, registroTutorId: e.aceptante.registro_tutor_id ?? null },
      canal: e.canal,
      usuarioId: ctx.usuario.id,
      evidencia,
      ip: ctx.ip,
      agenteUsuario: (req.get("user-agent") ?? "").slice(0, 300) || null,
      registroId: registro?.id ?? null,
      ahora: ctx.ahora(),
    });
    if (!resultado.ok) {
      switch (resultado.motivo) {
        case "documento_inexistente":
        case "prospecto_inexistente":
          throw noEncontrado();
        case "documento_no_aplica":
          throw validacion([{ campo: "documento_id", mensaje: "Ese documento es de otra vertical" }]);
        case "version_no_vigente":
          throw conflicto(resultado.versionVigente ? `Esa no es la versión vigente: hoy rige la v${resultado.versionVigente}. Muéstrasela a la familia y vuelve a registrar` : "Ese documento ya no está vigente", [{ campo: "version", mensaje: resultado.versionVigente ? `La versión vigente es la v${resultado.versionVigente}` : "No hay versión vigente" }]);
        case "sin_aceptacion_previa":
          throw conflicto("No hay una autorización vigente que revocar");
        case "no_se_revoca":
          throw conflicto("Solo la autorización de uso de imagen se revoca");
      }
    }
    if (resultado.creada) {
      await ctx.db.$transaction((tx) => registrarCambio(tx, ctx, { entidad: "aceptacion_legal", entidadId: resultado.aceptacion.id, accion: "crear", despues: { tipo: resultado.aceptacion.tipo, version_aceptada: resultado.aceptacion.versionAceptada, resultado: resultado.aceptacion.resultado, canal: resultado.aceptacion.canal, documento_id: resultado.aceptacion.documentoId } }));
    }
    res.status(resultado.creada ? 201 : 200).json({ creada: resultado.creada, ...presentarAceptacion(resultado.aceptacion) });
  });

  return r;
}
