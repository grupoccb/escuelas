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
} as const;

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
        (saltar, tomar) => ctx.db.lead.findMany({ where, select: SELECCION, orderBy: [{ creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar }),
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
        prospectos: { where: { eliminado_en: null }, select: { id: true, nombre: true, edad_declarada: true, origen: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] },
      },
    });
    if (!lead) throw noEncontrado();
    res.json(lead);
  });

  return r;
}
