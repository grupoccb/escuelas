// Plantillas de mensaje (J8): el catálogo de los mensajes aprobados que el sistema puede mandar fuera de la ventana de 24 horas. Solo el administrador las ve y las edita.
//
//   GET    /api/plantillas?vertical_id=&clase_mensaje=&estado_aprobacion=&activo=   (catalogo:escribir) — con cuántas automatizaciones la usan
//   POST   /api/plantillas   { codigo, content_sid, categoria, clase_mensaje, vertical_id?, tipo_content?, idioma?, variables?, cuerpo_referencia?, estado_aprobacion?, activo? }
//   PATCH  /api/plantillas/:id   { …lo mismo salvo `codigo` y `vertical_id` }
//   DELETE /api/plantillas/:id   baja lógica; 409 si una automatización viva la usa
//
// INV-6 (invariante 6): cada plantilla DECLARA si es de `servicio` (aviso sobre algo ya acordado: sale aunque una persona atienda la conversación) o de `marketing`
// (se bloquea con atención humana). No hay valor por omisión: quien da de alta la plantilla lo decide, y una de `servicio` no puede ser de categoría `marketing` ante Meta
// (el CHECK de la base lo repite). Cambiar la clase o el estado de una plantilla en uso cambia lo que el sistema deja pasar: queda en el registro de cambios.
// `estado_aprobacion` lo fija el administrador mientras no haya sincronización con el proveedor (no se llama a Twilio desde aquí: invariante 4). `variables` es la lista de
// `{ pos, nombre }` que la plantilla espera; `cuerpo_referencia` es el texto de apoyo (no se manda: el proveedor manda el aprobado).

import { Router } from "express";
import express from "express";
import { problemaDeClase } from "../../automatizaciones/ajustes.ts";
import { altaConAlcance } from "../../datos/alcance.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion, type DetalleDeError } from "../errores.ts";
import { cantidad, segun } from "../../lib/cantidad.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { PLANTILLA_DE_AVISO } from "../../mensajeria/avisos-instructor.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, entero, enumerado, listaDe, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const CATEGORIAS = ["marketing", "utility", "authentication", "servicio"] as const;
const CLASES = ["servicio", "marketing"] as const;
const ESTADOS = ["pendiente", "aprobada", "rechazada", "pausada", "deshabilitada"] as const;
const TIPOS = ["text", "quick-reply", "list-picker", "call-to-action", "media"] as const;

const SELECCION = {
  id: true,
  codigo: true,
  content_sid: true,
  vertical_id: true,
  categoria: true,
  clase_mensaje: true,
  tipo_content: true,
  idioma: true,
  variables: true,
  cuerpo_referencia: true,
  estado_aprobacion: true,
  sincronizado_en: true,
  activo: true,
  creado_en: true,
  _count: { select: { automatizaciones: { where: { eliminado_en: null } } } },
} as const;
interface Fila {
  id: string;
  codigo: string;
  content_sid: string;
  vertical_id: string | null;
  categoria: string;
  clase_mensaje: string;
  tipo_content: string;
  idioma: string;
  variables: unknown;
  cuerpo_referencia: string | null;
  estado_aprobacion: string;
  sincronizado_en: Date | null;
  activo: boolean;
  creado_en: Date;
  _count: { automatizaciones: number };
}
const presentar = ({ _count, ...f }: Fila) => ({ ...f, automatizaciones: _count.automatizaciones });
const instantanea = (f: Fila): Instantanea => ({ codigo: f.codigo, vertical_id: f.vertical_id, categoria: f.categoria, clase_mensaje: f.clase_mensaje, tipo_content: f.tipo_content, idioma: f.idioma, estado_aprobacion: f.estado_aprobacion, activo: f.activo });

const variable = objeto({ pos: entero({ min: 1, max: 20 }), nombre: texto({ max: 60, patron: /^[a-z][a-z0-9_]*$/, mensajePatron: "Minúsculas, dígitos y guion bajo, empezando con letra" }) });
const comunes = {
  content_sid: texto({ max: 64 }),
  categoria: enumerado(CATEGORIAS),
  clase_mensaje: enumerado(CLASES),
  tipo_content: opcional(enumerado(TIPOS)),
  idioma: opcional(texto({ max: 10, patron: /^[a-z]{2}(?:_[A-Z]{2})?$/, mensajePatron: "Como es_MX" })),
  variables: opcional(listaDe(variable, { max: 20 })),
  cuerpo_referencia: opcional(nulable(texto({ max: 1600 }))),
  estado_aprobacion: opcional(enumerado(ESTADOS)),
  activo: opcional(booleano()),
};
const esquemaAlta = objeto({ codigo: texto({ max: 60, patron: /^[a-z][a-z0-9_]*$/, mensajePatron: "Minúsculas, dígitos y guion bajo, empezando con letra" }), vertical_id: opcional(nulable(uuid())), ...comunes });
const esquemaCambio = objeto({
  content_sid: opcional(comunes.content_sid),
  categoria: opcional(comunes.categoria),
  clase_mensaje: opcional(comunes.clase_mensaje),
  tipo_content: comunes.tipo_content,
  idioma: comunes.idioma,
  variables: comunes.variables,
  cuerpo_referencia: comunes.cuerpo_referencia,
  estado_aprobacion: comunes.estado_aprobacion,
  activo: comunes.activo,
});
const esquemaListado = objeto({ ...esquemaPaginacion, vertical_id: opcional(uuid()), clase_mensaje: opcional(enumerado(CLASES)), estado_aprobacion: opcional(enumerado(ESTADOS)), activo: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });

const repetida = () => conflicto("Ya existe una plantilla con ese código para esa disciplina e idioma", [{ campo: "codigo", mensaje: "Ya está en uso" }]);

function reglas(v: { clase_mensaje: string; categoria: string; variables?: { pos: number }[] | undefined }): void {
  const e: DetalleDeError[] = [];
  if (v.clase_mensaje === "servicio" && v.categoria === "marketing") e.push({ campo: "clase_mensaje", mensaje: "Una plantilla de servicio no puede ser de categoría marketing ante Meta: o es de marketing, o cambia su categoría" });
  if (v.variables && new Set(v.variables.map((x) => x.pos)).size !== v.variables.length) e.push({ campo: "variables", mensaje: "Hay dos variables con la misma posición" });
  if (e.length > 0) throw validacion(e);
}

export function rutasDePlantillas(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/plantillas", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.vertical_id ? { vertical_id: q.vertical_id } : {}), ...(q.clase_mensaje ? { clase_mensaje: q.clase_mensaje } : {}), ...(q.estado_aprobacion ? { estado_aprobacion: q.estado_aprobacion } : {}), ...(q.activo !== undefined ? { activo: q.activo } : {}) };
    res.json(
      await paginar(
        pag,
        () => ctx.db.plantilla_mensaje.count({ where }),
        async (saltar, tomar) => ((await ctx.db.plantilla_mensaje.findMany({ where, select: SELECCION, orderBy: [{ codigo: "asc" }, { idioma: "asc" }, { id: "asc" }], skip: saltar, take: tomar })) as unknown as Fila[]).map(presentar),
      ),
    );
  });

  r.post("/plantillas", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAlta, req.body);
    reglas(e);
    try {
      const creada = await ctx.db.$transaction(async (tx) => {
        if (e.vertical_id && !(await tx.vertical.findFirst({ where: { id: e.vertical_id }, select: { id: true } }))) throw validacion([{ campo: "vertical_id", mensaje: "La vertical no existe" }]);
        const p = (await tx.plantilla_mensaje.create({
          data: altaConAlcance({ codigo: e.codigo, content_sid: e.content_sid, vertical_id: e.vertical_id ?? null, categoria: e.categoria, clase_mensaje: e.clase_mensaje, tipo_content: e.tipo_content ?? "text", idioma: e.idioma ?? "es_MX", variables: e.variables ?? [], cuerpo_referencia: e.cuerpo_referencia ?? null, estado_aprobacion: e.estado_aprobacion ?? "pendiente", activo: e.activo ?? true }),
          select: SELECCION,
        })) as unknown as Fila;
        await registrarCambio(tx, ctx, { entidad: "plantilla_mensaje", entidadId: p.id, accion: "crear", despues: instantanea(p) });
        return p;
      });
      res.status(201).json(presentar(creada));
    } catch (err) {
      if (esViolacionUnica(err)) throw repetida();
      throw err;
    }
  });

  r.patch("/plantillas/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const salida = await ctx.db.$transaction(async (tx) => {
      const antes = (await tx.plantilla_mensaje.findFirst({ where: { id }, select: SELECCION })) as unknown as Fila | null;
      if (!antes) throw noEncontrado();
      reglas({ clase_mensaje: c.clase_mensaje ?? antes.clase_mensaje, categoria: c.categoria ?? antes.categoria, ...(c.variables ? { variables: c.variables } : {}) });
      if (c.clase_mensaje !== undefined && c.clase_mensaje !== antes.clase_mensaje) {
        // EK-A1 (INV-6): cambiar la clase no puede dejar una automatización viva con una plantilla que no le corresponde.
        const usos = await tx.automatizacion.findMany({ where: { plantilla_id: id }, select: { nombre: true, evento_disparador: true } });
        const mal = usos.filter((u) => problemaDeClase(u.evento_disparador, c.clase_mensaje!) !== null).map((u) => u.nombre);
        if (mal.length > 0) throw conflicto(`No se puede declarar de ${c.clase_mensaje}: la usan ${mal.join(", ")}, que exigen la otra clase (INV-6). Cámbialas de plantilla primero`, [{ campo: "clase_mensaje", mensaje: "No corresponde a las automatizaciones que la usan" }]);
      }
      let despues: Fila;
      try {
        despues = (await tx.plantilla_mensaje.update({ where: { id }, data: c, select: SELECCION })) as unknown as Fila;
      } catch (err) {
        if (esViolacionUnica(err)) throw repetida();
        throw err;
      }
      await registrarCambio(tx, ctx, { entidad: "plantilla_mensaje", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
      return despues;
    });
    res.json(presentar(salida));
  });

  r.delete("/plantillas/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await ctx.db.$transaction(async (tx) => {
      const antes = (await tx.plantilla_mensaje.findFirst({ where: { id }, select: SELECCION })) as unknown as Fila | null;
      if (!antes) throw noEncontrado();
      // V10 (EK-25): el aviso al maestro busca sus plantillas por código, no por una automatización; darlas de baja lo dejaba sin plantilla en silencio (cada aviso quedaba bloqueado).
      if ((Object.values(PLANTILLA_DE_AVISO) as string[]).includes(antes.codigo)) throw conflicto("El aviso al maestro usa esta plantilla por su nombre: no se puede dar de baja. Si hay que cambiarla, edita su texto o apágala.");
      if (antes._count.automatizaciones > 0) throw conflicto(`La ${segun(antes._count.automatizaciones, "usa", "usan")} ${cantidad(antes._count.automatizaciones, "automatización", "automatizaciones")}: ${segun(antes._count.automatizaciones, "cámbiala", "cámbialas")} de plantilla antes de darla de baja`);
      await tx.plantilla_mensaje.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "plantilla_mensaje", entidadId: id, accion: "eliminar", antes: instantanea(antes) });
    });
    res.status(204).end();
  });

  return r;
}
