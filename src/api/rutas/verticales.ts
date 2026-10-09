// Verticales (J7): lo que la escuela imparte, administrado por pantalla sin tocar código (invariante 2: los nombres de cada disciplina viven en estas filas, no en el código).
//
//   GET    /api/verticales?activo=                  (catalogo:leer, todos los roles)
//   GET    /api/verticales/:id                      (catalogo:leer)
//   POST   /api/verticales   { nombre, slug?, etiqueta_progresion?, etiqueta_evento?, usa_progresion?, color_marca?, logo_url?, cotizador_whatsapp_activo?, clase_muestra_whatsapp_activo?, activo? }   (catalogo:escribir)
//   PATCH  /api/verticales/:id   { …lo mismo salvo `slug` }   (catalogo:escribir)
//   DELETE /api/verticales/:id   baja lógica; 409 si algo la usa (programas, canales, campañas, leads, productos, niveles, eventos, plantillas, automatizaciones…): desactívala en su lugar
//
// El `slug` va en la URL de la landing (`/l/<slug>`) y en los QR impresos: se genera del nombre si no se da y NO cambia después. Si usa progresión necesita su
// etiqueta (el CHECK de la base lo repite); la clase muestra por WhatsApp solo tiene sentido con el cotizador encendido.

import { Router } from "express";
import express from "express";
import { PATRON_DE_COLOR, PATRON_DE_SLUG, esUrlHttpsPublica, slugDe } from "../../catalogo/organizacion.ts";
import { altaConAlcance } from "../../datos/alcance.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion, type DetalleDeError } from "../errores.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  nombre: true,
  slug: true,
  etiqueta_progresion: true,
  etiqueta_evento: true,
  usa_progresion: true,
  color_marca: true,
  logo_url: true,
  cotizador_whatsapp_activo: true,
  clase_muestra_whatsapp_activo: true,
  activo: true,
  creado_en: true,
} as const;
type Fila = { id: string; nombre: string; slug: string; etiqueta_progresion: string | null; etiqueta_evento: string | null; usa_progresion: boolean; color_marca: string | null; logo_url: string | null; cotizador_whatsapp_activo: boolean; clase_muestra_whatsapp_activo: boolean; activo: boolean };

const instantanea = (v: Fila): Instantanea => ({
  nombre: v.nombre,
  slug: v.slug,
  etiqueta_progresion: v.etiqueta_progresion,
  etiqueta_evento: v.etiqueta_evento,
  usa_progresion: v.usa_progresion,
  color_marca: v.color_marca,
  logo_url: v.logo_url,
  cotizador_whatsapp_activo: v.cotizador_whatsapp_activo,
  clase_muestra_whatsapp_activo: v.clase_muestra_whatsapp_activo,
  activo: v.activo,
});

const textoONulo = (max: number) => opcional(nulable(texto({ max })));
const campos = {
  etiqueta_progresion: textoONulo(60),
  etiqueta_evento: textoONulo(60),
  usa_progresion: opcional(booleano()),
  color_marca: opcional(nulable(texto({ max: 7, patron: PATRON_DE_COLOR, mensajePatron: "Debe ser un color #RRGGBB" }))),
  logo_url: opcional(nulable(texto({ max: 500 }))),
  cotizador_whatsapp_activo: opcional(booleano()),
  clase_muestra_whatsapp_activo: opcional(booleano()),
  activo: opcional(booleano()),
};
const esquemaAlta = objeto({ nombre: texto({ max: 80 }), slug: opcional(texto({ max: 60, patron: PATRON_DE_SLUG, mensajePatron: "Minúsculas, dígitos y guiones" })), ...campos });
const esquemaCambio = objeto({ nombre: opcional(texto({ max: 80 })), ...campos });
const esquemaListado = objeto({ activo: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });

/** Las reglas entre campos del resultado final (no de cada uno por separado). */
function reglas(v: Pick<Fila, "usa_progresion" | "etiqueta_progresion" | "cotizador_whatsapp_activo" | "clase_muestra_whatsapp_activo" | "logo_url">): void {
  const e: DetalleDeError[] = [];
  if (v.usa_progresion && !v.etiqueta_progresion) e.push({ campo: "etiqueta_progresion", mensaje: "Si lleva progresión, di cómo se llama (por ejemplo, el nombre del avance de esta disciplina)" });
  if (v.clase_muestra_whatsapp_activo && !v.cotizador_whatsapp_activo) e.push({ campo: "clase_muestra_whatsapp_activo", mensaje: "La clase muestra por WhatsApp necesita el cotizador por WhatsApp encendido" });
  if (v.logo_url && !esUrlHttpsPublica(v.logo_url)) e.push({ campo: "logo_url", mensaje: "Debe ser una dirección https pública" });
  if (e.length > 0) throw validacion(e);
}

const slugRepetido = () => conflicto("Ya existe una vertical con ese identificador", [{ campo: "slug", mensaje: "Ya está en uso" }]);

export function rutasDeVerticales(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/verticales", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    res.json({ datos: await ctx.db.vertical.findMany({ where: q.activo === undefined ? {} : { activo: q.activo }, orderBy: [{ nombre: "asc" }, { id: "asc" }], select: SELECCION }) });
  });

  r.get("/verticales/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const v = await ctx.db.vertical.findFirst({ where: { id }, select: SELECCION });
    if (!v) throw noEncontrado();
    res.json(v);
  });

  r.post("/verticales", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAlta, req.body);
    const slug = e.slug ?? slugDe(e.nombre);
    if (!PATRON_DE_SLUG.test(slug)) throw validacion([{ campo: "slug", mensaje: "No se pudo armar un identificador con ese nombre: escríbelo" }]);
    const datos = {
      nombre: e.nombre,
      slug,
      etiqueta_progresion: e.etiqueta_progresion ?? null,
      etiqueta_evento: e.etiqueta_evento ?? null,
      usa_progresion: e.usa_progresion ?? false,
      color_marca: e.color_marca ?? null,
      logo_url: e.logo_url ?? null,
      cotizador_whatsapp_activo: e.cotizador_whatsapp_activo ?? false,
      clase_muestra_whatsapp_activo: e.clase_muestra_whatsapp_activo ?? false,
      activo: e.activo ?? true,
    };
    reglas(datos);
    try {
      const creada = await ctx.db.$transaction(async (tx) => {
        const v = await tx.vertical.create({ data: altaConAlcance(datos), select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "vertical", entidadId: v.id, accion: "crear", despues: instantanea(v) });
        return v;
      });
      res.status(201).json(creada);
    } catch (err) {
      if (esViolacionUnica(err)) throw slugRepetido();
      throw err;
    }
  });

  r.patch("/verticales/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const salida = await ctx.db.$transaction(async (tx) => {
      const antes = await tx.vertical.findFirst({ where: { id }, select: SELECCION });
      if (!antes) throw noEncontrado();
      const final = { ...antes, ...c };
      reglas(final);
      const despues = await tx.vertical.update({ where: { id }, data: c, select: SELECCION });
      await registrarCambio(tx, ctx, { entidad: "vertical", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
      return despues;
    });
    res.json(salida);
  });

  r.delete("/verticales/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await ctx.db.$transaction(async (tx) => {
      const antes = await tx.vertical.findFirst({ where: { id }, select: SELECCION });
      if (!antes) throw noEncontrado();
      const usos: [string, number][] = [
        ["programas", await tx.programa.count({ where: { vertical_id: id } })],
        ["sucursales que la ofrecen", await tx.sucursal_vertical.count({ where: { vertical_id: id } })],
        ["canales de WhatsApp", await tx.canal_whatsapp.count({ where: { vertical_id: id } })],
        ["campañas", await tx.campana.count({ where: { vertical_id: id } })],
        ["leads", await tx.lead.count({ where: { vertical_interes_id: id } })],
        ["productos", await tx.producto.count({ where: { vertical_id: id } })],
        ["niveles", await tx.nivel_progresion.count({ where: { vertical_id: id } })],
        ["eventos", await tx.evento.count({ where: { vertical_id: id } })],
        ["plantillas", await tx.plantilla_mensaje.count({ where: { vertical_id: id } })],
        ["automatizaciones", await tx.automatizacion.count({ where: { vertical_id: id } })],
        ["documentos legales", await tx.documento_legal.count({ where: { vertical_id: id } })],
        ["códigos de rastreo", await tx.codigo_rastreo.count({ where: { vertical_id: id } })],
      ];
      const enUso = usos.filter(([, n]) => n > 0);
      if (enUso.length > 0) throw conflicto(`La vertical se usa en: ${enUso.map(([que, n]) => `${n} ${que}`).join(", ")}. Desactívala en lugar de darla de baja`);
      await tx.vertical.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "vertical", entidadId: id, accion: "eliminar", antes: instantanea(antes) });
    });
    res.status(204).end();
  });

  return r;
}
