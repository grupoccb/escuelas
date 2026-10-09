// Leads (lectura).
//
//   GET /api/leads?etapa_id=&sucursal_id=&telefono=&limite=&pagina=
//   GET /api/leads/:id
//
// Alcance por sucursal de interés: administrador todos; asesor y recepción, los de sus sucursales.
// Un lead que aún no eligió sucursal solo lo ve el administrador. `telefono` pasa por
// `normalizarTelefono()` (invariante 7): se busca igual que se guarda.

import { Router } from "express";
import { normalizarTelefono } from "../../lib/telefono.ts";
import { fuenteDe } from "../../reportes/fuente.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
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

/** La fila de la base con la fuente derivada; no se exponen el id del anuncio crudo ni el `ctwa_clid` (rastreo del proveedor). */
function presentarLead<T extends FilaLead>({ anuncio_id, ctwa_clid, atribucion, campana, ...resto }: T) {
  return { ...resto, fuente: fuenteDe({ campana, anuncio_id, ctwa_clid, atribucion }), campana: campana ? { id: campana.id, nombre: campana.nombre } : null };
}

const esquemaListado = objeto({ ...esquemaPaginacion, etapa_id: opcional(uuid()), sucursal_id: opcional(uuid()), telefono: opcional(texto({ max: 30 })) });
const esquemaId = objeto({ id: uuid() });

export function rutasDeLeads(_deps: DepsApi): Router {
  const r = Router();
  const dentro = [requierePermiso("leads:leer")];

  r.get("/leads", ...dentro, async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const filtro = filtroDeSucursal(await ctx.alcance());
    let telefono: string | undefined;
    if (q.telefono !== undefined) {
      const n = normalizarTelefono(q.telefono);
      if (!n) throw validacion([{ campo: "telefono", mensaje: "No es un teléfono válido" }]);
      telefono = n;
    }
    const condiciones: Record<string, unknown>[] = [];
    if (filtro) condiciones.push({ sucursal_interes_id: filtro });
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
    const filtro = filtroDeSucursal(await ctx.alcance());
    const lead = await ctx.db.lead.findFirst({
      where: { id, ...(filtro ? { sucursal_interes_id: filtro } : {}) },
      select: {
        ...SELECCION,
        anuncio_titulo: true,
        tutor_id: true,
        etapa: { select: { id: true, nombre: true, tipo_sistema: true, es_ganado: true, es_perdido: true } },
        vertical_interes: { select: { id: true, nombre: true } },
        sucursal_interes: { select: { id: true, nombre: true } },
        motivo_perdida: { select: { id: true, nombre: true } },
        prospectos: { where: { eliminado_en: null }, select: { id: true, nombre: true, edad_declarada: true, origen: true, alumno_id: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] },
        // J3: el enlace a la conversación en Chatwoot se arma en la interfaz con estos ids y la URL pública configurada.
        conversaciones: {
          where: { eliminado_en: null },
          select: { id: true, estado: true, chatwoot_conversacion_id: true, bandeja_chatwoot: { select: { chatwoot_account_id: true, chatwoot_inbox_id: true } } },
          orderBy: [{ creado_en: "desc" }, { id: "desc" }],
        },
      },
    });
    if (!lead) throw noEncontrado();
    const { conversaciones, vertical_interes, sucursal_interes, ...resto } = lead as unknown as FilaLead & {
      conversaciones: { id: string; estado: string; chatwoot_conversacion_id: number; bandeja_chatwoot: { chatwoot_account_id: number | null; chatwoot_inbox_id: number | null } }[];
      vertical_interes: { id: string; nombre: string };
      sucursal_interes: { id: string; nombre: string } | null;
    };
    res.json({
      ...presentarLead(resto as FilaLead),
      vertical: vertical_interes,
      sucursal: sucursal_interes,
      conversaciones: conversaciones.map((c) => ({ id: c.id, estado: c.estado, chatwoot: { cuenta_id: c.bandeja_chatwoot.chatwoot_account_id, bandeja_id: c.bandeja_chatwoot.chatwoot_inbox_id, conversacion_id: c.chatwoot_conversacion_id } })),
    });
  });

  return r;
}
