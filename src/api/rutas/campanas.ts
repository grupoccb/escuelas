// Campañas (E2) y sus códigos de rastreo.
//
//   GET    /api/campanas?activo=&origen=&limite=&pagina=          (catalogo:leer)
//   GET    /api/campanas/:id                                       (catalogo:leer)
//   POST   /api/campanas {nombre, origen, vertical_id?, sucursal_id?, anuncio_id?, activo?}   (catalogo:escribir)
//   PATCH  /api/campanas/:id {nombre?, origen?, vertical_id?|null, sucursal_id?|null, anuncio_id?|null, activo?}   (catalogo:escribir)
//   DELETE /api/campanas/:id   baja lógica (409 si algún código vivo la usa)                                       (catalogo:escribir)
//
//   GET    /api/codigos-rastreo?campana_id=&sucursal_id=&tipo=&activo=&limite=&pagina=   (catalogo:escribir)
//   POST   /api/codigos-rastreo {campana_id, sucursal_id?, vertical_id?, codigo?, max_usos?, vigente_desde?, vigente_hasta?}   (catalogo:escribir)
//   PATCH  /api/codigos-rastreo/:id {activo?, max_usos?|null, vigente_desde?|null, vigente_hasta?|null}                       (catalogo:escribir)
//   DELETE /api/codigos-rastreo/:id   baja lógica: el código queda libre                                                      (catalogo:escribir)
//
// Un código de campaña (el del QR, el del anuncio) lo usan muchas personas: cada LEAD NUEVO que escribe con él cuenta un uso (`usos`, con el tope `max_usos`
// si lo tiene). Sin `codigo` se genera uno (8 caracteres sin ambiguos); con `codigo` se valida su forma. La sucursal y la vertical del código, si no se
// mandan, son las de la campaña. Los códigos de LEAD (los de la landing) los crea el sistema y no se crean aquí.
//   GET    /api/campanas/:id/qr?sucursal_id=&vertical_id=&formato=svg|png|url&mm=&escala=&descargar=true     (campanas:qr: administrador y asesor)
//
// E3, el QR de una campaña: apunta a la landing de la vertical (`/l/<vertical>?c=<código>&s=<sucursal>`) con el código de rastreo de ESA campaña y ESA sucursal, así que
// cada par (campaña, sucursal) tiene su propio QR. El código se reutiliza si ya existe uno que sirve para el par y se crea (una sola vez, bajo candado) si no. `formato=svg`
// (por omisión; `mm` = lado impreso, 20 a 300, 60 por omisión) o `png` (`escala` = píxeles por módulo, 1 a 40, 16 por omisión) se pueden descargar con `descargar=true`;
// `formato=url` devuelve el JSON con la URL y el código. El asesor solo pide sucursales de su alcance. La base pública sale de `ORIGEN_PUBLICO`/`PUBLIC_BASE_URL`.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { resolverVerticalPublica } from "../../datos/sistema.ts";
import { nombreDeArchivo, resolverBaseUrl, urlDeLanding } from "../../captacion/landing-url.ts";
import { QrDemasiadoLargo, crearQr } from "../../qr/qr.ts";
import { qrAPng, qrASvg } from "../../qr/render.ts";
import { veSucursal } from "../alcance.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { formatearCodigo, generarCodigo, normalizarCodigoEscrito } from "../../captacion/codigos.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, entero, enteroDeTexto, enumerado, fechaISO, instanteISO, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";
import { esProduccion } from "../../seguridad/entorno.ts";

const ORIGENES = ["facebook", "instagram", "tiktok", "google", "referido", "presencial", "otro"] as const;
const TIPOS = ["campana", "lead"] as const;

const SELECCION_CAMPANA = { id: true, nombre: true, origen: true, vertical_id: true, sucursal_id: true, anuncio_id: true, fecha_inicio: true, fecha_fin: true, activo: true, creado_en: true } as const;
interface FilaCampana { id: string; nombre: string; origen: string; vertical_id: string | null; sucursal_id: string | null; anuncio_id: string | null; fecha_inicio: Date | null; fecha_fin: Date | null; activo: boolean; creado_en: Date }
const dia = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const presentarCampana = (c: FilaCampana) => ({ ...c, fecha_inicio: dia(c.fecha_inicio), fecha_fin: dia(c.fecha_fin) });
const instantaneaCampana = (c: FilaCampana): Instantanea => ({ nombre: c.nombre, origen: c.origen, vertical_id: c.vertical_id, sucursal_id: c.sucursal_id, anuncio_id: c.anuncio_id, activo: c.activo });

const SELECCION_CODIGO = { id: true, codigo: true, tipo: true, campana_id: true, sucursal_id: true, vertical_id: true, lead_id: true, usos: true, max_usos: true, vigente_desde: true, vigente_hasta: true, activo: true, creado_en: true } as const;
interface FilaCodigo { id: string; codigo: string; tipo: string; campana_id: string | null; sucursal_id: string | null; vertical_id: string | null; lead_id: string | null; usos: number; max_usos: number | null; vigente_desde: Date | null; vigente_hasta: Date | null; activo: boolean; creado_en: Date }
const presentarCodigo = (c: FilaCodigo) => ({ ...c, codigo_formateado: formatearCodigo(c.codigo) });
const instantaneaCodigo = (c: FilaCodigo): Instantanea => ({ codigo: c.codigo, tipo: c.tipo, campana_id: c.campana_id, sucursal_id: c.sucursal_id, vertical_id: c.vertical_id, max_usos: c.max_usos, vigente_desde: c.vigente_desde, vigente_hasta: c.vigente_hasta, activo: c.activo });

const esquemaId = objeto({ id: uuid() });
const esquemaListadoCampanas = objeto({ ...esquemaPaginacion, activo: opcional(booleanoDeTexto()), origen: opcional(enumerado(ORIGENES)) });
const esquemaAltaCampana = objeto({
  nombre: texto({ max: 120 }),
  origen: enumerado(ORIGENES),
  vertical_id: opcional(uuid()),
  sucursal_id: opcional(uuid()),
  anuncio_id: opcional(texto({ max: 80 })),
  fecha_inicio: opcional(fechaISO()),
  fecha_fin: opcional(fechaISO()),
  activo: opcional(booleano()),
});
const esquemaCambioCampana = objeto({
  nombre: opcional(texto({ max: 120 })),
  origen: opcional(enumerado(ORIGENES)),
  vertical_id: opcional(nulable(uuid())),
  sucursal_id: opcional(nulable(uuid())),
  anuncio_id: opcional(nulable(texto({ max: 80 }))),
  fecha_inicio: opcional(nulable(fechaISO())),
  fecha_fin: opcional(nulable(fechaISO())),
  activo: opcional(booleano()),
});
const esquemaListadoCodigos = objeto({ ...esquemaPaginacion, campana_id: opcional(uuid()), sucursal_id: opcional(uuid()), tipo: opcional(enumerado(TIPOS)), activo: opcional(booleanoDeTexto()) });
const esquemaAltaCodigo = objeto({
  campana_id: uuid(),
  sucursal_id: opcional(uuid()),
  vertical_id: opcional(uuid()),
  codigo: opcional(texto({ max: 20 })),
  max_usos: opcional(entero({ min: 1, max: 1_000_000 })),
  vigente_desde: opcional(instanteISO()),
  vigente_hasta: opcional(instanteISO()),
});
const esquemaCambioCodigo = objeto({ activo: opcional(booleano()), max_usos: opcional(nulable(entero({ min: 1, max: 1_000_000 }))), vigente_desde: opcional(nulable(instanteISO())), vigente_hasta: opcional(nulable(instanteISO())) });

const esquemaQr = objeto({
  sucursal_id: opcional(uuid()),
  vertical_id: opcional(uuid()),
  formato: opcional(enumerado(["svg", "png", "url"] as const)),
  mm: opcional(enteroDeTexto({ min: 20, max: 300 })),
  // Mínimo 4 píxeles por módulo (EE-14): con menos, el PNG de una URL larga mide ~65 px y las cámaras no lo leen.
  escala: opcional(enteroDeTexto({ min: 4, max: 40 })),
  descargar: opcional(booleanoDeTexto()),
});

export function rutasDeCampanas(deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** Las referencias de una campaña tienen que existir en la organización (el scope hace el resto). */
  async function comprobarReferencias(ctx: ReturnType<typeof contextoDe>, ref: { vertical_id?: string | null; sucursal_id?: string | null }): Promise<void> {
    const problemas = [];
    if (ref.vertical_id && !(await ctx.db.vertical.findFirst({ where: { id: ref.vertical_id }, select: { id: true } }))) problemas.push({ campo: "vertical_id", mensaje: "No es una vertical de la organización" });
    if (ref.sucursal_id && !(await ctx.db.sucursal.findFirst({ where: { id: ref.sucursal_id }, select: { id: true } }))) problemas.push({ campo: "sucursal_id", mensaje: "No es una sucursal de la organización" });
    if (problemas.length > 0) throw validacion(problemas);
  }

  // ── Campañas ──
  r.get("/campanas", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListadoCampanas, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.activo !== undefined ? { activo: q.activo } : {}), ...(q.origen ? { origen: q.origen } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.campana.count({ where }),
        async (saltar, tomar) => (await ctx.db.campana.findMany({ where, select: SELECCION_CAMPANA, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((c) => presentarCampana(c as FilaCampana)),
      ),
    );
  });

  r.get("/campanas/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = await ctx.db.campana.findFirst({ where: { id }, select: SELECCION_CAMPANA });
    if (!c) throw noEncontrado();
    res.json(presentarCampana(c as FilaCampana));
  });

  r.post("/campanas", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAltaCampana, req.body);
    await comprobarReferencias(ctx, e);
    if (e.fecha_inicio && e.fecha_fin && e.fecha_fin < e.fecha_inicio) throw validacion([{ campo: "fecha_fin", mensaje: "No puede ser anterior al inicio" }]);
    const creada = await ctx.db.$transaction(async (tx) => {
      const c = (await tx.campana.create({
        data: altaConAlcance({ nombre: e.nombre, origen: e.origen, vertical_id: e.vertical_id ?? null, sucursal_id: e.sucursal_id ?? null, anuncio_id: e.anuncio_id ?? null, fecha_inicio: e.fecha_inicio ? new Date(`${e.fecha_inicio}T00:00:00Z`) : null, fecha_fin: e.fecha_fin ? new Date(`${e.fecha_fin}T00:00:00Z`) : null, activo: e.activo ?? true }),
        select: SELECCION_CAMPANA,
      })) as FilaCampana;
      await registrarCambio(tx, ctx, { entidad: "campana", entidadId: c.id, accion: "crear", despues: instantaneaCampana(c) });
      return c;
    });
    res.status(201).json(presentarCampana(creada));
  });

  r.patch("/campanas/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambioCampana, req.body);
    if (Object.keys(e).length === 0) throw validacion([{ mensaje: "No hay ningún cambio" }]);
    const antes = (await ctx.db.campana.findFirst({ where: { id }, select: SELECCION_CAMPANA })) as FilaCampana | null;
    if (!antes) throw noEncontrado();
    await comprobarReferencias(ctx, e);
    const { fecha_inicio, fecha_fin, ...resto } = e;
    const inicio = fecha_inicio === undefined ? dia(antes.fecha_inicio) : fecha_inicio;
    const fin = fecha_fin === undefined ? dia(antes.fecha_fin) : fecha_fin;
    if (inicio && fin && fin < inicio) throw validacion([{ campo: "fecha_fin", mensaje: "No puede ser anterior al inicio" }]);
    const nueva = await ctx.db.$transaction(async (tx) => {
      const c = (await tx.campana.update({
        where: { id },
        data: { ...resto, ...(fecha_inicio !== undefined ? { fecha_inicio: fecha_inicio ? new Date(`${fecha_inicio}T00:00:00Z`) : null } : {}), ...(fecha_fin !== undefined ? { fecha_fin: fecha_fin ? new Date(`${fecha_fin}T00:00:00Z`) : null } : {}) },
        select: SELECCION_CAMPANA,
      })) as FilaCampana;
      await registrarCambio(tx, ctx, { entidad: "campana", entidadId: id, accion: "actualizar", antes: instantaneaCampana(antes), despues: instantaneaCampana(c) });
      return c;
    });
    res.json(presentarCampana(nueva));
  });

  r.delete("/campanas/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const antes = (await ctx.db.campana.findFirst({ where: { id }, select: SELECCION_CAMPANA })) as FilaCampana | null;
    if (!antes) throw noEncontrado();
    if ((await ctx.db.codigo_rastreo.count({ where: { campana_id: id } })) > 0) throw conflicto("La campaña tiene códigos de rastreo vivos: dalos de baja primero");
    if ((await ctx.db.lead.count({ where: { campana_id: id } })) > 0) throw conflicto("La campaña ya tiene leads: apágala (activo = false) en vez de borrarla");
    await ctx.db.$transaction(async (tx) => {
      await tx.campana.update({ where: { id }, data: { eliminado_en: new Date(), activo: false } });
      await registrarCambio(tx, ctx, { entidad: "campana", entidadId: id, accion: "eliminar", antes: instantaneaCampana(antes) });
    });
    res.status(204).end();
  });

  // ── El QR de una campaña (E3) ──
  r.get("/campanas/:id/qr", requierePermiso("campanas:qr"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const q = parsearQuery(esquemaQr, req.query);
    const campana = await ctx.db.campana.findFirst({ where: { id }, select: { id: true, nombre: true, vertical_id: true, sucursal_id: true } });
    if (!campana) throw noEncontrado();
    // La vertical a la que apunta la landing: la de la campaña (o la que se pida, si la campaña no tiene).
    if (campana.vertical_id && q.vertical_id && campana.vertical_id !== q.vertical_id) throw validacion([{ campo: "vertical_id", mensaje: "La campaña es de otra vertical" }]);
    const verticalId = campana.vertical_id ?? q.vertical_id;
    if (!verticalId) throw validacion([{ campo: "vertical_id", mensaje: "La campaña no tiene vertical: asígnasela a la campaña o indica `vertical_id`" }]);
    const vertical = await ctx.db.vertical.findFirst({ where: { id: verticalId, activo: true }, select: { id: true, slug: true, nombre: true } });
    if (!vertical) throw validacion([{ campo: "vertical_id", mensaje: "No es una vertical activa de la organización" }]);
    // La sucursal: la pedida, o la de la campaña, o ninguna (QR general). Tiene que ser una de las que da la vertical y, para el asesor, de su alcance.
    const sucursalId = q.sucursal_id ?? campana.sucursal_id ?? null;
    const alcance = await ctx.alcance();
    if (sucursalId === null && !alcance.todas) throw validacion([{ campo: "sucursal_id", mensaje: "Elige la sucursal del QR" }]);
    if (sucursalId !== null) {
      if (!veSucursal(alcance, sucursalId)) throw noEncontrado();
      const ofrece = await ctx.db.sucursal_vertical.findFirst({ where: { vertical_id: vertical.id, sucursal_id: sucursalId, activo: true, sucursal: { activo: true, eliminado_en: null } }, select: { id: true } });
      if (!ofrece) throw validacion([{ campo: "sucursal_id", mensaje: "La vertical no se imparte en esa sucursal" }]);
    }
    const sucursal = sucursalId ? await ctx.db.sucursal.findFirst({ where: { id: sucursalId }, select: { nombre: true } }) : null;

    // El código de ESTA campaña y ESTA sucursal: el que ya sirve, o uno nuevo (una sola vez aunque lo pidan varios a la vez).
    const ahora = ctx.ahora();
    const codigo = await transaccionConBloqueo(ctx.db, ctx.organizacionId, `qr:${campana.id}:${sucursalId ?? "general"}`, async (tx) => {
      const existentes = (await tx.codigo_rastreo.findMany({
        // EE-14: solo se reutiliza un código de ESTA vertical: si la campaña cambió de vertical, el de antes no atribuiría (la landing lo descarta) y se hace uno nuevo.
        where: { tipo: "campana", campana_id: campana.id, sucursal_id: sucursalId, activo: true, vertical_id: vertical.id, AND: [{ OR: [{ vigente_desde: null }, { vigente_desde: { lte: ahora } }] }, { OR: [{ vigente_hasta: null }, { vigente_hasta: { gt: ahora } }] }] },
        select: SELECCION_CODIGO,
        orderBy: [{ creado_en: "asc" }, { id: "asc" }],
      })) as FilaCodigo[];
      const sirve = existentes.find((c) => c.max_usos === null || c.usos < c.max_usos);
      if (sirve) return sirve;
      for (let intento = 0; intento < 10; intento++) {
        const candidato = generarCodigo();
        if (await tx.codigo_rastreo.findFirst({ where: { codigo: candidato }, select: { id: true } })) continue;
        const c = (await tx.codigo_rastreo.create({
          data: altaConAlcance({ codigo: candidato, tipo: "campana" as const, campana_id: campana.id, sucursal_id: sucursalId, vertical_id: vertical.id }),
          select: SELECCION_CODIGO,
        })) as FilaCodigo;
        await registrarCambio(tx, ctx, { entidad: "codigo_rastreo", entidadId: c.id, accion: "crear", despues: instantaneaCodigo(c) });
        return c;
      }
      throw conflicto("No se pudo generar un código libre; inténtalo de nuevo");
    });

    // La URL: la base pública, el slug de la vertical (con el de la organización si el de la vertical se repite), el código y la sucursal.
    const base = resolverBaseUrl({ origenesPermitidos: deps.origenesPermitidos, publicBaseUrl: process.env["PUBLIC_BASE_URL"], protocolo: req.protocol, host: req.get("host"), produccion: esProduccion(process.env) });
    if (!base) throw conflicto("Falta configurar el origen público del sistema (ORIGEN_PUBLICO) para armar el QR");
    let orgSlug: string | null = null;
    if (!(await resolverVerticalPublica(deps.prisma, vertical.slug, null))) {
      orgSlug = (await ctx.db.organizacion.findFirst({ where: { id: ctx.organizacionId }, select: { slug: true } }))?.slug ?? null;
      if (!orgSlug) throw conflicto("El identificador de la vertical se repite entre organizaciones y la organización no tiene identificador (slug) para distinguirla");
    }
    const url = urlDeLanding({ base, verticalSlug: vertical.slug, orgSlug, codigo: codigo.codigo, sucursalId });
    const formato = q.formato ?? "svg";
    if (formato === "url") {
      res.json({ url, ...presentarCodigo(codigo), vertical_id: vertical.id, sucursal_id: sucursalId });
      return;
    }
    let qr;
    try {
      qr = crearQr(url, "M");
    } catch (e) {
      if (e instanceof QrDemasiadoLargo) throw validacion([{ mensaje: "La URL de la landing es demasiado larga para un QR" }]);
      throw e;
    }
    const nombre = `${nombreDeArchivo("qr", campana.nombre, sucursal?.nombre ?? "general")}.${formato}`;
    if (q.descargar) res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.setHeader("X-Codigo-Rastreo", codigo.codigo);
    if (formato === "png") res.type("png").send(qrAPng(qr, { escala: q.escala ?? 16 }));
    else res.type("image/svg+xml").send(qrASvg(qr, { mm: q.mm ?? 60, titulo: `QR de ${campana.nombre}${sucursal ? ` · ${sucursal.nombre}` : ""}` }));
  });

  // ── Códigos de rastreo ──
  r.get("/codigos-rastreo", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListadoCodigos, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.campana_id ? { campana_id: q.campana_id } : {}), ...(q.sucursal_id ? { sucursal_id: q.sucursal_id } : {}), ...(q.tipo ? { tipo: q.tipo } : {}), ...(q.activo !== undefined ? { activo: q.activo } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.codigo_rastreo.count({ where }),
        async (saltar, tomar) => (await ctx.db.codigo_rastreo.findMany({ where, select: SELECCION_CODIGO, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((c) => presentarCodigo(c as FilaCodigo)),
      ),
    );
  });

  r.post("/codigos-rastreo", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAltaCodigo, req.body);
    const campana = await ctx.db.campana.findFirst({ where: { id: e.campana_id }, select: { id: true, vertical_id: true, sucursal_id: true, activo: true } });
    if (!campana) throw validacion([{ campo: "campana_id", mensaje: "No es una campaña de la organización" }]);
    await comprobarReferencias(ctx, e);
    if (campana.vertical_id && e.vertical_id && campana.vertical_id !== e.vertical_id) throw validacion([{ campo: "vertical_id", mensaje: "La campaña es de otra vertical" }]);
    // V10 / EE-15: un código de una campaña apagada no atribuye (EE-03): se avisa al crearlo, no cuando ya está impreso.
    if (!campana.activo) throw conflicto("La campaña está apagada: enciéndela antes de crearle códigos, porque un código de una campaña apagada no atribuye", [{ campo: "campana_id", mensaje: "Campaña apagada" }]);
    // …y la sucursal tiene que ser una donde se imparte esa vertical (como en el QR).
    const verticalDelCodigo = e.vertical_id ?? campana.vertical_id;
    const sucursalDelCodigo = e.sucursal_id ?? campana.sucursal_id;
    if (verticalDelCodigo && sucursalDelCodigo && !(await ctx.db.sucursal_vertical.findFirst({ where: { vertical_id: verticalDelCodigo, sucursal_id: sucursalDelCodigo, activo: true, sucursal: { activo: true, eliminado_en: null } }, select: { id: true } }))) {
      throw validacion([{ campo: "sucursal_id", mensaje: "La vertical no se imparte en esa sucursal" }]);
    }
    if (e.vigente_desde && e.vigente_hasta && e.vigente_hasta <= e.vigente_desde) throw validacion([{ campo: "vigente_hasta", mensaje: "Tiene que ser posterior al inicio" }]);
    let codigo: string | null = null;
    if (e.codigo !== undefined) {
      codigo = normalizarCodigoEscrito(e.codigo);
      if (!codigo) throw validacion([{ campo: "codigo", mensaje: "Un código tiene 8 caracteres (letras sin I, L ni O, y dígitos del 2 al 9), con al menos un dígito" }]);
    }
    for (let intento = 0; intento < 10; intento++) {
      const candidato = codigo ?? generarCodigo();
      try {
        const creado = await ctx.db.$transaction(async (tx) => {
          if (await tx.codigo_rastreo.findFirst({ where: { codigo: candidato }, select: { id: true } })) throw new CodigoRepetido();
          const c = (await tx.codigo_rastreo.create({
            data: altaConAlcance({
              codigo: candidato,
              tipo: "campana" as const,
              campana_id: campana.id,
              sucursal_id: e.sucursal_id ?? campana.sucursal_id,
              vertical_id: e.vertical_id ?? campana.vertical_id,
              max_usos: e.max_usos ?? null,
              vigente_desde: e.vigente_desde ?? null,
              vigente_hasta: e.vigente_hasta ?? null,
            }),
            select: SELECCION_CODIGO,
          })) as FilaCodigo;
          await registrarCambio(tx, ctx, { entidad: "codigo_rastreo", entidadId: c.id, accion: "crear", despues: instantaneaCodigo(c) });
          return c;
        });
        res.status(201).json(presentarCodigo(creado));
        return;
      } catch (err) {
        if (!(err instanceof CodigoRepetido) && !esViolacionUnica(err)) throw err;
        if (codigo) throw conflicto("Ese código ya está en uso", [{ campo: "codigo", mensaje: "Ya existe un código vivo igual" }]);
        // Uno generado que ya existía (muy improbable): se genera otro.
      }
    }
    throw conflicto("No se pudo generar un código libre; inténtalo de nuevo");
  });

  r.patch("/codigos-rastreo/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambioCodigo, req.body);
    if (Object.keys(e).length === 0) throw validacion([{ mensaje: "No hay ningún cambio" }]);
    const antes = (await ctx.db.codigo_rastreo.findFirst({ where: { id }, select: SELECCION_CODIGO })) as FilaCodigo | null;
    if (!antes) throw noEncontrado();
    if (antes.tipo === "lead" && e.max_usos !== undefined) throw conflicto("El código de un lead se usa una sola vez");
    if (e.max_usos != null && e.max_usos < antes.usos) throw conflicto(`El código ya se usó ${antes.usos} veces: el tope no puede ser menor`, [{ campo: "max_usos", mensaje: "Menor que los usos" }]);
    const desde = e.vigente_desde === undefined ? antes.vigente_desde : e.vigente_desde;
    const hasta = e.vigente_hasta === undefined ? antes.vigente_hasta : e.vigente_hasta;
    if (desde && hasta && hasta <= desde) throw validacion([{ campo: "vigente_hasta", mensaje: "Tiene que ser posterior al inicio" }]);
    const nuevo = await ctx.db.$transaction(async (tx) => {
      const c = (await tx.codigo_rastreo.update({ where: { id }, data: e, select: SELECCION_CODIGO })) as FilaCodigo;
      await registrarCambio(tx, ctx, { entidad: "codigo_rastreo", entidadId: id, accion: "actualizar", antes: instantaneaCodigo(antes), despues: instantaneaCodigo(c) });
      return c;
    });
    res.json(presentarCodigo(nuevo));
  });

  r.delete("/codigos-rastreo/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const antes = (await ctx.db.codigo_rastreo.findFirst({ where: { id }, select: SELECCION_CODIGO })) as FilaCodigo | null;
    if (!antes) throw noEncontrado();
    await ctx.db.$transaction(async (tx) => {
      await tx.codigo_rastreo.update({ where: { id }, data: { eliminado_en: new Date(), activo: false } });
      await registrarCambio(tx, ctx, { entidad: "codigo_rastreo", entidadId: id, accion: "eliminar", antes: instantaneaCodigo(antes) });
    });
    res.status(204).end();
  });

  return r;
}

class CodigoRepetido extends Error {}

