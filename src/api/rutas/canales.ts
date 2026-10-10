// Canales de WhatsApp y bandejas de Chatwoot (J7): a qué número llega cada vertical y en qué bandeja la atiende el asesor. Solo el administrador los ve y los escribe
// (llevan identificadores del proveedor). Sin credenciales: el token de Twilio y el de Chatwoot viven en variables de entorno, nunca aquí.
//
//   GET    /api/canales-whatsapp?limite=&pagina=      (catalogo:escribir) — cada canal con su bandeja (paginada: 25 por omisión, tope de 100)
//   POST   /api/canales-whatsapp   { vertical_id, sucursal_id? (null = todas las de la vertical), numero_whatsapp?, messaging_service_sid?, sender_sid?, waba_id?, nombre_publico, calidad_meta?, activo? }
//   PATCH  /api/canales-whatsapp/:id   { …lo mismo salvo vertical_id; null borra un dato opcional }
//   DELETE /api/canales-whatsapp/:id   baja lógica; 409 si tiene bandeja viva (quítala primero)
//   POST   /api/bandejas-chatwoot   { canal_whatsapp_id, nombre, chatwoot_account_id?, chatwoot_inbox_id? }   una por canal; (cuenta, bandeja) única entre las vivas
//   PATCH  /api/bandejas-chatwoot/:id   { nombre?, chatwoot_account_id?, chatwoot_inbox_id? }
//   DELETE /api/bandejas-chatwoot/:id   baja lógica; 409 si tiene conversaciones
//
// El número se normaliza con `normalizarNumeroWhatsapp` (invariante 7) a «whatsapp:+52…» y es único en TODO el sistema entre los canales vivos: el mensaje entrante llega por
// número antes de saber la organización, así que un número repetido en otra organización responde 409 sin decir de quién es.

import { Router } from "express";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { normalizarNumeroWhatsapp } from "../../lib/telefono.ts";
import { requierePermiso } from "../autorizar.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { cantidad } from "../../lib/cantidad.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, entero, enumerado, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const CALIDADES = ["alta", "media", "baja", "desconocida"] as const;
const SELECCION_CANAL = {
  id: true,
  vertical_id: true,
  sucursal_id: true,
  numero_whatsapp: true,
  messaging_service_sid: true,
  sender_sid: true,
  waba_id: true,
  nombre_publico: true,
  calidad_meta: true,
  activo: true,
  bandejas_chatwoot: { where: { eliminado_en: null }, select: { id: true, nombre: true, chatwoot_account_id: true, chatwoot_inbox_id: true } },
} as const;
interface FilaCanal {
  id: string;
  vertical_id: string;
  sucursal_id: string | null;
  numero_whatsapp: string | null;
  messaging_service_sid: string | null;
  sender_sid: string | null;
  waba_id: string | null;
  nombre_publico: string;
  calidad_meta: string;
  activo: boolean;
  bandejas_chatwoot: { id: string; nombre: string; chatwoot_account_id: number | null; chatwoot_inbox_id: number | null }[];
}
const presentarCanal = (c: FilaCanal) => ({ ...c, bandeja: c.bandejas_chatwoot[0] ?? null, bandejas_chatwoot: undefined });
const instCanal = (c: FilaCanal): Instantanea => ({ vertical_id: c.vertical_id, sucursal_id: c.sucursal_id, numero_whatsapp: c.numero_whatsapp, nombre_publico: c.nombre_publico, calidad_meta: c.calidad_meta, activo: c.activo });

const opcionalNulo = (max: number) => opcional(nulable(texto({ max })));
const camposCanal = {
  sucursal_id: opcional(nulable(uuid())),
  numero_whatsapp: opcional(nulable(texto({ max: 40 }))),
  messaging_service_sid: opcionalNulo(64),
  sender_sid: opcionalNulo(64),
  waba_id: opcionalNulo(64),
  calidad_meta: opcional(enumerado(CALIDADES)),
  activo: opcional(booleano()),
};
const esquemaAltaCanal = objeto({ vertical_id: uuid(), nombre_publico: texto({ max: 120 }), ...camposCanal });
const esquemaCambioCanal = objeto({ nombre_publico: opcional(texto({ max: 120 })), ...camposCanal });
const idChatwoot = () => opcional(nulable(entero({ min: 1, max: 2_000_000_000 })));
const esquemaAltaBandeja = objeto({ canal_whatsapp_id: uuid(), nombre: texto({ max: 120 }), chatwoot_account_id: idChatwoot(), chatwoot_inbox_id: idChatwoot() });
const esquemaCambioBandeja = objeto({ nombre: opcional(texto({ max: 120 })), chatwoot_account_id: idChatwoot(), chatwoot_inbox_id: idChatwoot() });
const esquemaId = objeto({ id: uuid() });

const numeroRepetido = () => conflicto("Ese número de WhatsApp ya está asignado a otro canal", [{ campo: "numero_whatsapp", mensaje: "Ya está en uso" }]);

function numeroNormalizado(n: string | null | undefined): string | null | undefined {
  if (n === undefined || n === null) return n;
  const f = normalizarNumeroWhatsapp(n);
  if (!f) throw validacion([{ campo: "numero_whatsapp", mensaje: "No es un número de WhatsApp válido (con lada y código de país)" }]);
  return f;
}

export function rutasDeCanales(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/canales-whatsapp", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    // V10 (EK-25): paginada como las demás listas (25 por omisión, 100 como tope; el orden termina en `id`, así que las páginas no se repiten ni se saltan filas).
    const pag = leerPaginacion(parsearQuery(objeto({ ...esquemaPaginacion }), req.query));
    res.json(
      await paginar(
        pag,
        () => ctx.db.canal_whatsapp.count(),
        async (saltar, tomar) => ((await ctx.db.canal_whatsapp.findMany({ select: SELECCION_CANAL, orderBy: [{ nombre_publico: "asc" }, { id: "asc" }], skip: saltar, take: tomar })) as unknown as FilaCanal[]).map(presentarCanal),
      ),
    );
  });

  r.post("/canales-whatsapp", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAltaCanal, req.body);
    const numero = numeroNormalizado(e.numero_whatsapp);
    try {
      const creado = await ctx.db.$transaction(async (tx) => {
        if (!(await tx.vertical.findFirst({ where: { id: e.vertical_id }, select: { id: true } }))) throw validacion([{ campo: "vertical_id", mensaje: "La vertical no existe" }]);
        if (e.sucursal_id && !(await tx.sucursal_vertical.findFirst({ where: { sucursal_id: e.sucursal_id, vertical_id: e.vertical_id }, select: { id: true } }))) {
          throw validacion([{ campo: "sucursal_id", mensaje: "Esa sucursal no ofrece esa vertical" }]);
        }
        const c = (await tx.canal_whatsapp.create({
          data: altaConAlcance({ vertical_id: e.vertical_id, sucursal_id: e.sucursal_id ?? null, numero_whatsapp: numero ?? null, messaging_service_sid: e.messaging_service_sid ?? null, sender_sid: e.sender_sid ?? null, waba_id: e.waba_id ?? null, nombre_publico: e.nombre_publico, calidad_meta: e.calidad_meta ?? "desconocida", activo: e.activo ?? true }),
          select: SELECCION_CANAL,
        })) as unknown as FilaCanal;
        await registrarCambio(tx, ctx, { entidad: "canal_whatsapp", entidadId: c.id, accion: "crear", despues: instCanal(c) });
        return c;
      });
      res.status(201).json(presentarCanal(creado));
    } catch (err) {
      if (esViolacionUnica(err)) throw numeroRepetido();
      throw err;
    }
  });

  r.patch("/canales-whatsapp/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { numero_whatsapp, ...c } = parsear(esquemaCambioCanal, req.body);
    if (Object.keys(c).length === 0 && numero_whatsapp === undefined) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const numero = numeroNormalizado(numero_whatsapp);
    try {
      const salida = await ctx.db.$transaction(async (tx) => {
        const antes = (await tx.canal_whatsapp.findFirst({ where: { id }, select: SELECCION_CANAL })) as unknown as FilaCanal | null;
        if (!antes) throw noEncontrado();
        if (c.sucursal_id && !(await tx.sucursal_vertical.findFirst({ where: { sucursal_id: c.sucursal_id, vertical_id: antes.vertical_id }, select: { id: true } }))) {
          throw validacion([{ campo: "sucursal_id", mensaje: "Esa sucursal no ofrece esa vertical" }]);
        }
        const despues = (await tx.canal_whatsapp.update({ where: { id }, data: { ...c, ...(numero !== undefined ? { numero_whatsapp: numero } : {}) }, select: SELECCION_CANAL })) as unknown as FilaCanal;
        await registrarCambio(tx, ctx, { entidad: "canal_whatsapp", entidadId: id, accion: "actualizar", antes: instCanal(antes), despues: instCanal(despues) });
        return despues;
      });
      res.json(presentarCanal(salida));
    } catch (err) {
      if (esViolacionUnica(err)) throw numeroRepetido();
      throw err;
    }
  });

  r.delete("/canales-whatsapp/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await ctx.db.$transaction(async (tx) => {
      const antes = (await tx.canal_whatsapp.findFirst({ where: { id }, select: SELECCION_CANAL })) as unknown as FilaCanal | null;
      if (!antes) throw noEncontrado();
      if (antes.bandejas_chatwoot.length > 0) throw conflicto("El canal tiene una bandeja de Chatwoot: quítala antes de darlo de baja");
      await tx.canal_whatsapp.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "canal_whatsapp", entidadId: id, accion: "eliminar", antes: instCanal(antes) });
    });
    res.status(204).end();
  });

  // ── Bandejas de Chatwoot ──────────────────────────────────────────────────────────────────────────

  const repetidaLaBandeja = () => conflicto("Ya hay una bandeja de Chatwoot para ese canal, o esa bandeja ya está ligada a otro canal", [{ campo: "chatwoot_inbox_id", mensaje: "Ya está en uso" }]);
  const instBandeja = (b: { canal_whatsapp_id: string; nombre: string; chatwoot_account_id: number | null; chatwoot_inbox_id: number | null }): Instantanea => ({ canal_whatsapp_id: b.canal_whatsapp_id, nombre: b.nombre, chatwoot_account_id: b.chatwoot_account_id, chatwoot_inbox_id: b.chatwoot_inbox_id });
  const SEL_B = { id: true, canal_whatsapp_id: true, nombre: true, chatwoot_account_id: true, chatwoot_inbox_id: true } as const;

  r.post("/bandejas-chatwoot", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAltaBandeja, req.body);
    if ((e.chatwoot_inbox_id ?? null) !== null && (e.chatwoot_account_id ?? null) === null) throw validacion([{ campo: "chatwoot_account_id", mensaje: "Si das la bandeja, da también la cuenta" }]);
    try {
      const creada = await ctx.db.$transaction(async (tx) => {
        if (!(await tx.canal_whatsapp.findFirst({ where: { id: e.canal_whatsapp_id }, select: { id: true } }))) throw validacion([{ campo: "canal_whatsapp_id", mensaje: "El canal no existe" }]);
        const b = await tx.bandeja_chatwoot.create({ data: altaConAlcance({ canal_whatsapp_id: e.canal_whatsapp_id, nombre: e.nombre, chatwoot_account_id: e.chatwoot_account_id ?? null, chatwoot_inbox_id: e.chatwoot_inbox_id ?? null }), select: SEL_B });
        await registrarCambio(tx, ctx, { entidad: "bandeja_chatwoot", entidadId: b.id, accion: "crear", despues: instBandeja(b) });
        return b;
      });
      res.status(201).json(creada);
    } catch (err) {
      if (esViolacionUnica(err)) throw repetidaLaBandeja();
      throw err;
    }
  });

  r.patch("/bandejas-chatwoot/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = parsear(esquemaCambioBandeja, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    try {
      const salida = await ctx.db.$transaction(async (tx) => {
        const antes = await tx.bandeja_chatwoot.findFirst({ where: { id }, select: SEL_B });
        if (!antes) throw noEncontrado();
        const final = { ...antes, ...c };
        if (final.chatwoot_inbox_id !== null && final.chatwoot_account_id === null) throw validacion([{ campo: "chatwoot_account_id", mensaje: "Si das la bandeja, da también la cuenta" }]);
        const despues = await tx.bandeja_chatwoot.update({ where: { id }, data: c, select: SEL_B });
        await registrarCambio(tx, ctx, { entidad: "bandeja_chatwoot", entidadId: id, accion: "actualizar", antes: instBandeja(antes), despues: instBandeja(despues) });
        return despues;
      });
      res.json(salida);
    } catch (err) {
      if (esViolacionUnica(err)) throw repetidaLaBandeja();
      throw err;
    }
  });

  r.delete("/bandejas-chatwoot/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await ctx.db.$transaction(async (tx) => {
      const antes = await tx.bandeja_chatwoot.findFirst({ where: { id }, select: SEL_B });
      if (!antes) throw noEncontrado();
      const conversaciones = await tx.conversacion.count({ where: { bandeja_chatwoot_id: id } });
      if (conversaciones > 0) throw conflicto(`La bandeja tiene ${cantidad(conversaciones, "conversación", "conversaciones")}: no se puede dar de baja`);
      await tx.bandeja_chatwoot.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "bandeja_chatwoot", entidadId: id, accion: "eliminar", antes: instBandeja(antes) });
    });
    res.status(204).end();
  });

  return r;
}
