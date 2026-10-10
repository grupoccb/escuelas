// Programas (J7): la oferta de una vertical en una sucursal para un rango de edad. Se administran por pantalla.
//
//   GET    /api/programas?vertical_id=&sucursal_id=&activo=&limite=&pagina=   (catalogo:leer; cada rol ve el de sus sucursales)
//   GET    /api/programas/:id                                                   (catalogo:leer)
//   POST   /api/programas   { vertical_id, sucursal_id, nombre, edad_min, edad_max, nivel?, descripcion_publica?, permite_traslape?, fecha_corte_edad?, activo? }   (catalogo:escribir)
//   PATCH  /api/programas/:id   { nombre?, edad_min?, edad_max?, nivel?, descripcion_publica?, permite_traslape?, fecha_corte_edad? (null la quita), activo? }
//   DELETE /api/programas/:id   baja lógica; 409 si tiene grupos o inscripciones
//
// La vertical y la sucursal de un programa NO cambian (sus grupos, precios e inscripciones dependen de ellas): se da de baja y se crea otro.
// Reglas (todas con 409/400 y el motivo en palabras):
//   · la sucursal debe ofrecer la vertical (`PUT /api/sucursales/:id/verticales/:vertical_id`);
//   · edad_min <= edad_max;
//   · TRASLAPE DE EDAD: dos programas activos de la misma vertical y sucursal que aceptan una misma edad solo conviven si AMBOS están marcados `permite_traslape`
//     (son alternativas: el bot pregunta cuál, decisión 9); es la misma regla que la verificación del catálogo (`traslapesDeEdad`);
//   · el nombre es único por sucursal. Todo bajo el candado del catálogo, así dos altas simultáneas que se traslapan se serializan y gana una.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { CANDADO_OCUPACION } from "../../catalogo/choques.ts";
import { traslapesDeEdad, type Catalogo, type ProgramaCatalogo } from "../../catalogo/verificacion.ts";
import { altaConAlcance, type Consultas } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { cantidad } from "../../lib/cantidad.ts";
import { leerModulos } from "../../modulos/index.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, booleanoDeTexto, entero, fechaISO, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const SELECCION = {
  id: true,
  vertical_id: true,
  sucursal_id: true,
  nombre: true,
  edad_min: true,
  edad_max: true,
  nivel: true,
  descripcion_publica: true,
  permite_traslape: true,
  fecha_corte_edad: true,
  activo: true,
  creado_en: true,
} as const;
type Fila = { id: string; vertical_id: string; sucursal_id: string; nombre: string; edad_min: number; edad_max: number; nivel: string | null; descripcion_publica: string | null; permite_traslape: boolean; fecha_corte_edad: Date | null; activo: boolean; creado_en: Date };

const dia = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const presentar = (p: Fila) => ({ ...p, fecha_corte_edad: dia(p.fecha_corte_edad) });
const instantanea = (p: Fila): Instantanea => ({ vertical_id: p.vertical_id, sucursal_id: p.sucursal_id, nombre: p.nombre, edad_min: p.edad_min, edad_max: p.edad_max, nivel: p.nivel, permite_traslape: p.permite_traslape, fecha_corte_edad: dia(p.fecha_corte_edad), activo: p.activo });

const edad = () => entero({ min: 0, max: 99 });
const esquemaListado = objeto({ ...esquemaPaginacion, vertical_id: opcional(uuid()), sucursal_id: opcional(uuid()), activo: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });
const esquemaAlta = objeto({
  vertical_id: uuid(),
  sucursal_id: uuid(),
  nombre: texto({ max: 120 }),
  edad_min: edad(),
  edad_max: edad(),
  nivel: opcional(nulable(texto({ max: 80 }))),
  descripcion_publica: opcional(nulable(texto({ max: 500 }))),
  permite_traslape: opcional(booleano()),
  fecha_corte_edad: opcional(nulable(fechaISO())),
  activo: opcional(booleano()),
});
const esquemaCambio = objeto({
  nombre: opcional(texto({ max: 120 })),
  edad_min: opcional(edad()),
  edad_max: opcional(edad()),
  nivel: opcional(nulable(texto({ max: 80 }))),
  descripcion_publica: opcional(nulable(texto({ max: 500 }))),
  permite_traslape: opcional(booleano()),
  fecha_corte_edad: opcional(nulable(fechaISO())),
  activo: opcional(booleano()),
});

const repetido = () => conflicto("Ya existe un programa con ese nombre en la sucursal", [{ campo: "nombre", mensaje: "Ya está en uso en esa sucursal" }]);

/** Revisa el traslape de edad del programa propuesto contra los demás ACTIVOS de la misma vertical y sucursal. */
async function exigirSinTraslape(tx: Consultas, propuesto: { id: string; nombre: string; vertical_id: string; sucursal_id: string; edad_min: number; edad_max: number; permite_traslape: boolean; activo: boolean }): Promise<void> {
  if (!propuesto.activo) return;
  const otros = await tx.programa.findMany({ where: { vertical_id: propuesto.vertical_id, sucursal_id: propuesto.sucursal_id, activo: true, id: { not: propuesto.id } }, select: { id: true, nombre: true, vertical_id: true, sucursal_id: true, edad_min: true, edad_max: true, permite_traslape: true } });
  const aCatalogo = (p: { id: string; nombre: string; vertical_id: string; sucursal_id: string; edad_min: number; edad_max: number; permite_traslape: boolean }): ProgramaCatalogo => ({ id: p.id, nombre: p.nombre, verticalId: p.vertical_id, sucursalId: p.sucursal_id, edadMin: p.edad_min, edadMax: p.edad_max, permiteTraslape: p.permite_traslape });
  const catalogo: Catalogo = { programas: [...otros, propuesto].map(aCatalogo), grupos: [], horarios: [], salones: new Map(), sucursales: new Map(), verticales: new Map() };
  const choques = traslapesDeEdad(catalogo).filter((t) => t.programaA === propuesto.nombre || t.programaB === propuesto.nombre);
  if (choques.length > 0) {
    const con = choques.map((t) => (t.programaA === propuesto.nombre ? t.programaB : t.programaA));
    throw conflicto(`Las edades se traslapan con: ${[...new Set(con)].join(", ")}. Si son alternativas para la misma edad (el asistente le preguntará a la familia cuál prefiere), marca «Permite traslape de edad» en los dos programas; si no, cambia las edades.`, [{ campo: "edad_min", mensaje: "Se traslapa con otro programa de la misma disciplina y sucursal" }]);
  }
}

export function rutasDeProgramas(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/programas", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const filtro = filtroDeSucursal(await ctx.alcanceCatalogo());
    const condiciones: Record<string, unknown>[] = [];
    if (filtro) condiciones.push({ sucursal_id: filtro });
    if (q.vertical_id) condiciones.push({ vertical_id: q.vertical_id });
    if (q.sucursal_id) condiciones.push({ sucursal_id: q.sucursal_id });
    if (q.activo !== undefined) condiciones.push({ activo: q.activo });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};
    res.json(
      await paginar(
        pag,
        () => ctx.db.programa.count({ where }),
        async (saltar, tomar) => (await ctx.db.programa.findMany({ where, select: SELECCION, orderBy: [{ nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map((p) => presentar(p as Fila)),
      ),
    );
  });

  r.get("/programas/:id", requierePermiso("catalogo:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const filtro = filtroDeSucursal(await ctx.alcanceCatalogo());
    const p = await ctx.db.programa.findFirst({ where: { id, ...(filtro ? { sucursal_id: filtro } : {}) }, select: SELECCION });
    if (!p) throw noEncontrado();
    res.json(presentar(p as Fila));
  });

  r.post("/programas", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAlta, req.body);
    if (e.edad_min > e.edad_max) throw validacion([{ campo: "edad_max", mensaje: "La edad máxima no puede ser menor que la mínima" }]);
    try {
      const creado = await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
        if (!(await tx.vertical.findFirst({ where: { id: e.vertical_id }, select: { id: true } }))) throw validacion([{ campo: "vertical_id", mensaje: "La vertical no existe" }]);
        if (!(await tx.sucursal.findFirst({ where: { id: e.sucursal_id }, select: { id: true } }))) throw validacion([{ campo: "sucursal_id", mensaje: "La sucursal no existe" }]);
        if (!(await tx.sucursal_vertical.findFirst({ where: { sucursal_id: e.sucursal_id, vertical_id: e.vertical_id }, select: { id: true } }))) {
          throw conflicto("Esa sucursal no ofrece esa disciplina: primero márcala como ofrecida en la sucursal", [{ campo: "vertical_id", mensaje: "La sucursal no la ofrece" }]);
        }
        const datos = { vertical_id: e.vertical_id, sucursal_id: e.sucursal_id, nombre: e.nombre, edad_min: e.edad_min, edad_max: e.edad_max, nivel: e.nivel ?? null, descripcion_publica: e.descripcion_publica ?? null, permite_traslape: e.permite_traslape ?? false, fecha_corte_edad: e.fecha_corte_edad ? new Date(`${e.fecha_corte_edad}T00:00:00.000Z`) : null, activo: e.activo ?? true };
        await exigirSinTraslape(tx, { id: "00000000-0000-4000-8000-ffffffffffff", ...datos });
        const p = await tx.programa.create({ data: altaConAlcance(datos), select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "programa", entidadId: p.id, accion: "crear", despues: instantanea(p as Fila) });
        return p;
      });
      res.status(201).json(presentar(creado as Fila));
    } catch (err) {
      if (esViolacionUnica(err)) throw repetido();
      throw err;
    }
  });

  r.patch("/programas/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    try {
      const salida = await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
        const antes = (await tx.programa.findFirst({ where: { id }, select: SELECCION })) as Fila | null;
        if (!antes) throw noEncontrado();
        const final = { ...antes, ...c };
        if (final.edad_min > final.edad_max) throw validacion([{ campo: "edad_max", mensaje: "La edad máxima no puede ser menor que la mínima" }]);
        await exigirSinTraslape(tx, final);
        const { fecha_corte_edad, ...resto } = c;
        const despues = await tx.programa.update({ where: { id }, data: { ...resto, ...(fecha_corte_edad !== undefined ? { fecha_corte_edad: fecha_corte_edad ? new Date(`${fecha_corte_edad}T00:00:00.000Z`) : null } : {}) }, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "programa", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues as Fila) });
        return despues;
      });
      res.json(presentar(salida as Fila));
    } catch (err) {
      if (esViolacionUnica(err)) throw repetido();
      throw err;
    }
  });

  r.delete("/programas/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
      const antes = (await tx.programa.findFirst({ where: { id }, select: SELECCION })) as Fila | null;
      if (!antes) throw noEncontrado();
      const grupos = await tx.grupo.count({ where: { programa_id: id } });
      const inscripciones = await tx.inscripcion.count({ where: { programa_id: id } });
      // V13-fix (EV-22): con la inscripción apagada no se habla de «inscripciones» (la escuela no las ve): se dice que hay alumnos inscritos.
      const conInscripcion = (await leerModulos(tx)).inscripcion;
      if (grupos > 0 || inscripciones > 0) {
        const quedan = conInscripcion ? ` y ${cantidad(inscripciones, "inscripción", "inscripciones")}` : inscripciones > 0 ? " y alumnos ya inscritos" : "";
        throw conflicto(`El programa tiene ${cantidad(grupos, "grupo", "grupos")}${quedan}: desactívalo en lugar de darlo de baja`);
      }
      // K9 (EK-A3): una cotización guardada, una sugerencia del bot y una promoción también apuntan al programa.
      const otros: [string, number][] = [
        ["cotizaciones", await tx.cotizacion.count({ where: { programa_id: id } })],
        ["prospectos con este programa sugerido", await tx.prospecto.count({ where: { programa_sugerido_id: id } })],
        ["promociones", await tx.promocion_programa.count({ where: { programa_id: id } })],
      ].filter(([, n]) => (n as number) > 0) as [string, number][];
      if (otros.length > 0) throw conflicto(`El programa se usa en: ${otros.map(([que, n]) => `${n} ${que}`).join(", ")}. Desactívalo en lugar de darlo de baja`);
      await tx.precio.updateMany({ where: { programa_id: id }, data: { eliminado_en: ctx.ahora() } });
      await tx.programa.update({ where: { id }, data: { eliminado_en: ctx.ahora() } });
      await registrarCambio(tx, ctx, { entidad: "programa", entidadId: id, accion: "eliminar", antes: instantanea(antes) });
    });
    res.status(204).end();
  });

  return r;
}
