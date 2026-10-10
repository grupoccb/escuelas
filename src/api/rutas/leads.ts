// Leads (lectura y, desde V7, la sucursal de un lead que todavía no la tiene).
//
//   GET   /api/leads?etapa_id=&sucursal_id=&telefono=&limite=&pagina=
//   GET   /api/leads/:id
//   PATCH /api/leads/:id {sucursal_interes_id}   (leads:escribir)  V7: le pone sucursal a un lead que no la tiene (el bot a medias, la landing sin sucursal)
//
// Alcance por sucursal de interés: administrador todos; asesor y recepción, los de sus sucursales.
// Un lead que aún no eligió sucursal solo lo ve el administrador. `telefono` pasa por
// `normalizarTelefono()` (invariante 7): se busca igual que se guarda.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { hoyDelLead, presentarNino, SELECCION_DE_NINO, type FilaDeNino } from "../../captacion/prospectos.ts";
import { normalizarTelefono } from "../../lib/telefono.ts";
import { leerModulos } from "../../modulos/index.ts";
import { fuenteDe } from "../../reportes/fuente.ts";
import { condicionDeLead, veSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  nombre_contacto: true,
  telefono: true,
  vertical_interes_id: true,
  sucursal_interes_id: true,
  campana_id: true,
  etapa_id: true,
  motivo_perdida_id: true,
  recuperaciones: true,
  ultima_interaccion_en: true,
  creado_en: true,
  // J3: de dónde vino (la fuente se deriva igual que en los reportes) y el nombre de la campaña.
  anuncio_id: true,
  ctwa_clid: true,
  atribucion: true,
  campana: { select: { id: true, nombre: true, origen: true } },
} as const;

type FilaLead = { anuncio_id: string | null; ctwa_clid: string | null; atribucion: unknown; campana: { id: string; nombre: string; origen: string } | null } & Record<string, unknown>;

/** Lo único de la atribución que sale en el detalle (el referral completo del proveedor trae identificadores de rastreo que no son para la pantalla). */
const CLAVES_VISIBLES_DE_ATRIBUCION = ["fuente", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "codigo_rastreo"] as const;
function atribucionVisible(atribucion: unknown): Record<string, string> | null {
  if (typeof atribucion !== "object" || atribucion === null || Array.isArray(atribucion)) return null;
  const crudo = atribucion as Record<string, unknown>;
  const salida: Record<string, string> = {};
  for (const k of CLAVES_VISIBLES_DE_ATRIBUCION) if (typeof crudo[k] === "string") salida[k] = crudo[k];
  return Object.keys(salida).length > 0 ? salida : null;
}

/** La fila de la base con la fuente derivada; no se exponen el id del anuncio crudo ni el `ctwa_clid` (rastreo del proveedor). */
function presentarLead<T extends FilaLead>({ anuncio_id, ctwa_clid, atribucion, campana, ...resto }: T) {
  return { ...resto, fuente: fuenteDe({ campana, anuncio_id, ctwa_clid, atribucion }), campana: campana ? { id: campana.id, nombre: campana.nombre } : null };
}

const esquemaListado = objeto({ ...esquemaPaginacion, etapa_id: opcional(uuid()), sucursal_id: opcional(uuid()), telefono: opcional(texto({ max: 30 })) });
const esquemaId = objeto({ id: uuid() });
const esquemaSucursal = objeto({ sucursal_interes_id: uuid() });

export function rutasDeLeads(_deps: DepsApi): Router {
  const r = crearRouter();
  const dentro = [requierePermiso("leads:leer")];

  r.get("/leads", ...dentro, async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const alcanceDeLeads = condicionDeLead(await ctx.alcance());
    let telefono: string | undefined;
    if (q.telefono !== undefined) {
      const n = normalizarTelefono(q.telefono);
      if (!n) throw validacion([{ campo: "telefono", mensaje: "No es un teléfono válido" }]);
      telefono = n;
    }
    const condiciones: Record<string, unknown>[] = [];
    if (alcanceDeLeads) condiciones.push(alcanceDeLeads);
    if (q.sucursal_id) condiciones.push({ sucursal_interes_id: q.sucursal_id });
    if (q.etapa_id) condiciones.push({ etapa_id: q.etapa_id });
    if (telefono) condiciones.push({ telefono });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};
    res.json(
      await paginar(
        pag,
        () => ctx.db.lead.count({ where }),
        async (saltar, tomar) => (await ctx.db.lead.findMany({ where, select: SELECCION, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((f) => presentarLead(f as unknown as FilaLead)),
      ),
    );
  });

  r.get("/leads/:id", ...dentro, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const alcanceDeLeads = condicionDeLead(await ctx.alcance());
    const lead = await ctx.db.lead.findFirst({
      where: { id, ...(alcanceDeLeads ?? {}) },
      select: {
        ...SELECCION,
        anuncio_titulo: true,
        tutor_id: true,
        etapa: { select: { id: true, nombre: true, tipo_sistema: true, es_ganado: true, es_perdido: true } },
        vertical_interes: { select: { id: true, nombre: true } },
        sucursal_interes: { select: { id: true, nombre: true } },
        motivo_perdida: { select: { id: true, nombre: true } },
        // V3: los niños con todo lo que la ficha y el asistente de conversión necesitan (la misma forma que `GET /api/leads/:id/prospectos`).
        prospectos: { where: { eliminado_en: null }, select: SELECCION_DE_NINO, orderBy: [{ creado_en: "asc" }, { id: "asc" }] },
        // J3: el enlace a la conversación en Chatwoot se arma en la interfaz con estos ids y la URL pública configurada.
        conversaciones: {
          where: { eliminado_en: null },
          select: { id: true, estado: true, chatwoot_conversacion_id: true, bandeja_chatwoot: { select: { chatwoot_account_id: true, chatwoot_inbox_id: true } } },
          orderBy: [{ creado_en: "desc" }, { id: "desc" }],
        },
      },
    });
    if (!lead) throw noEncontrado();
    const { conversaciones, vertical_interes, sucursal_interes, prospectos, ...resto } = lead as unknown as FilaLead & {
      prospectos: FilaDeNino[];
      conversaciones: { id: string; estado: string; chatwoot_conversacion_id: number; bandeja_chatwoot: { chatwoot_account_id: number | null; chatwoot_inbox_id: number | null } }[];
      vertical_interes: { id: string; nombre: string };
      sucursal_interes: { id: string; nombre: string } | null;
    };
    const hoy = await hoyDelLead(ctx.db, sucursal_interes?.id ?? null, ctx.ahora());
    const cotizador = (await leerModulos(ctx.db)).cotizador;
    res.json({
      ...presentarLead(resto as FilaLead),
      prospectos: prospectos.map((p) => presentarNino(p, { hoy, cotizador })),
      atribucion: atribucionVisible((resto as FilaLead).atribucion),
      vertical: vertical_interes,
      sucursal: sucursal_interes,
      conversaciones: conversaciones.map((c) => ({ id: c.id, estado: c.estado, chatwoot: { cuenta_id: c.bandeja_chatwoot.chatwoot_account_id, bandeja_id: c.bandeja_chatwoot.chatwoot_inbox_id, conversacion_id: c.chatwoot_conversacion_id } })),
    });
  });

  // V7: un lead sin sucursal (el bot a medias, una landing sin sucursal) se queda sin cotizar ni agendar hasta que alguien se la pone. SOLO se puede poner, no cambiar: cambiarla
  // sacaría al lead del embudo de quien lo está atendiendo, y eso lo decide la conversación con la familia, no un clic. La sucursal tiene que ser de las que ve quien la pone y tiene que
  // dar la disciplina del lead. Atómico: dos personas que se la ponen a la vez, una gana y la otra recibe 409 (o 200 si pusieron la misma).
  r.patch("/leads/:id", requierePermiso("leads:escribir"), express.json({ limit: LIMITE_CUERPO_API }), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { sucursal_interes_id: sucursalId } = parsear(esquemaSucursal, req.body);
    const alcance = await ctx.alcance();
    const resultado = await ctx.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id, ...(condicionDeLead(alcance) ?? {}) }, select: { id: true, sucursal_interes_id: true, vertical_interes_id: true } });
      if (!lead) throw noEncontrado();
      if (lead.sucursal_interes_id === sucursalId) return { cambio: false as const, sucursalId };
      if (lead.sucursal_interes_id !== null) throw conflicto("Este lead ya tiene sucursal. Para cambiarla, habla con quien administra el sistema.");
      if (!veSucursal(alcance, sucursalId)) throw noEncontrado();
      const sucursal = await tx.sucursal.findFirst({ where: { id: sucursalId, activo: true }, select: { id: true } });
      if (!sucursal) throw validacion([{ campo: "sucursal_interes_id", mensaje: "No es una sucursal activa de la escuela" }]);
      const ofrece = await tx.sucursal_vertical.findFirst({ where: { sucursal_id: sucursalId, vertical_id: lead.vertical_interes_id, activo: true }, select: { id: true } });
      if (!ofrece) throw validacion([{ campo: "sucursal_interes_id", mensaje: "Esa sucursal no da la disciplina que busca la familia" }]);
      const hecho = await tx.lead.updateMany({ where: { id, sucursal_interes_id: null }, data: { sucursal_interes_id: sucursalId } });
      if (hecho.count !== 1) throw conflicto("Otra persona le acaba de poner sucursal a este lead: vuelve a cargarlo");
      await registrarCambio(tx, ctx, { entidad: "lead", entidadId: id, accion: "actualizar", antes: { sucursal_interes_id: null }, despues: { sucursal_interes_id: sucursalId } });
      return { cambio: true as const, sucursalId };
    });
    const sucursal = await ctx.db.sucursal.findFirstOrThrow({ where: { id: resultado.sucursalId }, select: { id: true, nombre: true } });
    res.json({ id, sucursal });
  });

  return r;
}
