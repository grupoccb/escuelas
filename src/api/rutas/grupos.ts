// Grupos: lectura para todos los roles y escritura del administrador (C1).
//
//   GET    /api/grupos?programa_id=&sucursal_id=&limite=&pagina=   (grupos:leer)
//   POST   /api/grupos   { programa_id, nombre, cupo_maximo, permite_lista_espera?, salon_id?, instructor_id?, horarios?, activo? }   (catalogo:escribir)
//   PATCH  /api/grupos/:id   { nombre?, cupo_maximo?, permite_lista_espera?, salon_id?|null, instructor_id?|null, horarios?, activo? }
//   DELETE /api/grupos/:id   baja lógica
//
// Alcance de lectura: administrador, todos; asesor y recepción, los de sus sucursales; maestro, SOLO los
// grupos cuyo instructor está ligado a su usuario.
//
// Al asignar salón, instructor u horarios se revisan los CHOQUES (`src/catalogo/choques.ts`): dos grupos
// activos con el mismo salón o el mismo instructor en franjas que se traslapan → 409 `conflicto` con el
// detalle de qué se pisa con qué. Toda la escritura va bajo un candado por organización, así dos
// asignaciones simultáneas que chocan se serializan y gana una. El salón tiene que ser de la sucursal del
// programa, y un instructor con sucursales solo acepta grupos de ellas. `horarios` REEMPLAZA el conjunto.
// Los disparadores de la base repiten la regla por si algo escribe sin pasar por aquí.

import { randomUUID } from "node:crypto";
import { Router } from "express";
import express from "express";
import { CANDADO_OCUPACION, choquesDeGrupo, describirChoque, franjasSeTraslapan, type Franja } from "../../catalogo/choques.ts";
import { altaConAlcance, type Consultas } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { esChoqueDeOcupacion, esViolacionUnica } from "../../datos/prisma.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion, type DetalleDeError } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { booleano, entero, listaDe, nulable, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const esquemaListado = objeto({ ...esquemaPaginacion, programa_id: opcional(uuid()), sucursal_id: opcional(uuid()) });
const esquemaId = objeto({ id: uuid() });
const esquemaHorario = objeto({ dia_semana: entero({ min: 0, max: 6 }), hora_inicio_min: entero({ min: 0, max: 1439 }), hora_fin_min: entero({ min: 1, max: 1440 }) });
const esquemaAlta = objeto({
  programa_id: uuid(),
  nombre: texto({ max: 120 }),
  cupo_maximo: entero({ min: 1, max: 500 }),
  permite_lista_espera: opcional(booleano()),
  salon_id: opcional(nulable(uuid())),
  instructor_id: opcional(nulable(uuid())),
  horarios: opcional(listaDe(esquemaHorario, { max: 14 })),
  activo: opcional(booleano()),
});
const esquemaCambio = objeto({
  nombre: opcional(texto({ max: 120 })),
  cupo_maximo: opcional(entero({ min: 1, max: 500 })),
  permite_lista_espera: opcional(booleano()),
  salon_id: opcional(nulable(uuid())),
  instructor_id: opcional(nulable(uuid())),
  horarios: opcional(listaDe(esquemaHorario, { max: 14 })),
  activo: opcional(booleano()),
});

type Horario = { dia_semana: number; hora_inicio_min: number; hora_fin_min: number };

const SELECCION = {
  id: true,
  nombre: true,
  salon_id: true,
  salon: { select: { id: true, nombre: true } },
  cupo_maximo: true,
  permite_lista_espera: true,
  activo: true,
  instructor_id: true,
  programa: { select: { id: true, nombre: true, vertical_id: true, sucursal_id: true, edad_min: true, edad_max: true } },
  horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true, hora_fin_min: true }, orderBy: [{ dia_semana: "asc" as const }, { hora_inicio_min: "asc" as const }] },
};

interface FilaGrupo {
  id: string;
  nombre: string;
  salon_id: string | null;
  cupo_maximo: number;
  permite_lista_espera: boolean;
  activo: boolean;
  instructor_id: string | null;
  horarios: Horario[];
}

const claveHorario = (h: Horario): string => `${h.dia_semana}|${h.hora_inicio_min}-${h.hora_fin_min}`;
const instantanea = (g: FilaGrupo): Instantanea => ({
  nombre: g.nombre,
  cupo_maximo: g.cupo_maximo,
  permite_lista_espera: g.permite_lista_espera,
  activo: g.activo,
  salon_id: g.salon_id,
  instructor_id: g.instructor_id,
  horarios: g.horarios.map(claveHorario),
});

const conFranjas = (hs: Horario[]): Franja[] => hs.map((h) => ({ dia: h.dia_semana, inicioMin: h.hora_inicio_min, finMin: h.hora_fin_min }));

/** Las franjas de UN grupo no pueden pisarse entre sí ni repetir día e inicio (400). */
function validarHorarios(hs: Horario[]): void {
  const errores: DetalleDeError[] = [];
  hs.forEach((h, i) => {
    if (h.hora_inicio_min >= h.hora_fin_min) errores.push({ campo: `horarios[${i}]`, mensaje: "La hora de inicio debe ser menor que la de fin" });
  });
  const f = conFranjas(hs);
  for (let i = 0; i < f.length; i++) {
    for (let j = i + 1; j < f.length; j++) {
      if (franjasSeTraslapan(f[i]!, f[j]!)) errores.push({ campo: `horarios[${j}]`, mensaje: `Se traslapa con el horario ${i + 1} del mismo grupo` });
    }
  }
  if (errores.length > 0) throw validacion(errores);
}

const choqueDe = (err: unknown): never => {
  if (esChoqueDeOcupacion(err)) throw conflicto("El salón o el instructor ya están ocupados en ese horario (otra asignación se confirmó antes)");
  if (esViolacionUnica(err)) throw conflicto("Ya existe un grupo con ese nombre en el programa", [{ campo: "nombre", mensaje: "Ya está en uso en ese programa" }]);
  throw err;
};

interface Propuesta {
  grupoId: string;
  nombre: string;
  programaSucursalId: string;
  salonId: string | null;
  instructorId: string | null;
  activo: boolean;
  horarios: Horario[];
}

/** Valida salón, instructor y horarios de la propuesta y revisa los choques. Lanza 400/409. */
async function validarPropuesta(tx: Consultas, p: Propuesta, revisarChoques: boolean): Promise<void> {
  const errores: DetalleDeError[] = [];
  if (p.salonId) {
    const salon = await tx.salon.findFirst({ where: { id: p.salonId }, select: { sucursal_id: true, activo: true } });
    if (!salon) errores.push({ campo: "salon_id", mensaje: "El salón no existe" });
    else if (salon.sucursal_id !== p.programaSucursalId) errores.push({ campo: "salon_id", mensaje: "El salón es de otra sucursal distinta a la del programa" });
    else if (!salon.activo && p.activo) errores.push({ campo: "salon_id", mensaje: "El salón está inactivo" });
  }
  if (p.instructorId) {
    const inst = await tx.instructor.findFirst({ where: { id: p.instructorId }, select: { activo: true, sucursales: { where: { eliminado_en: null }, select: { sucursal_id: true } } } });
    if (!inst) errores.push({ campo: "instructor_id", mensaje: "El instructor no existe" });
    else if (!inst.activo && p.activo) errores.push({ campo: "instructor_id", mensaje: "El instructor está inactivo" });
    else if (inst.sucursales.length > 0 && !inst.sucursales.some((s) => s.sucursal_id === p.programaSucursalId)) errores.push({ campo: "instructor_id", mensaje: "El instructor no da clases en la sucursal del programa" });
  }
  validarHorarios(p.horarios);
  if (errores.length > 0) throw validacion(errores);

  if (revisarChoques && p.activo) {
    const choques = await choquesDeGrupo(tx, { grupoId: p.grupoId, grupoNombre: p.nombre, salonId: p.salonId, instructorId: p.instructorId, franjas: conFranjas(p.horarios) });
    if (choques.length > 0) {
      throw conflicto(
        "El salón o el instructor ya están ocupados en ese horario",
        choques.map((c) => ({ campo: c.tipo === "salon" ? "salon_id" : "instructor_id", mensaje: describirChoque(c) })),
      );
    }
  }
}

/**
 * Cambio de horarios en TRES tiempos, para que ningún paso intermedio choque por error con el salón o el
 * instructor viejos o nuevos (los disparadores de la base revisan cada escritura): primero se dan de baja
 * las franjas que ya no están, luego se actualiza el grupo (salón, instructor…) y al final se crean las
 * nuevas. Una franja idéntica (mismo día, inicio y fin) no se toca; una que cambió de hora se da de baja y
 * se vuelve a crear.
 */
async function quitarHorarios(tx: Consultas, grupoId: string, nuevos: Horario[], ahora: Date): Promise<Horario[]> {
  const vivos = await tx.grupo_horario.findMany({ where: { grupo_id: grupoId }, select: { id: true, dia_semana: true, hora_inicio_min: true, hora_fin_min: true } });
  const quedan = new Set(nuevos.map(claveHorario));
  const yaEstan = new Set<string>();
  for (const v of vivos) {
    const clave = claveHorario(v);
    if (quedan.has(clave)) yaEstan.add(clave);
    else await tx.grupo_horario.update({ where: { id: v.id }, data: { eliminado_en: ahora } });
  }
  return nuevos.filter((h) => !yaEstan.has(claveHorario(h)));
}

async function crearHorarios(tx: Consultas, grupoId: string, porCrear: Horario[]): Promise<void> {
  for (const h of porCrear) await tx.grupo_horario.create({ data: altaConAlcance({ grupo_id: grupoId, dia_semana: h.dia_semana, hora_inicio_min: h.hora_inicio_min, hora_fin_min: h.hora_fin_min }) });
}

export function rutasDeGrupos(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/grupos", requierePermiso("grupos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const alcance = await ctx.alcance();
    const filtro = filtroDeSucursal(alcance);

    const condiciones: Record<string, unknown>[] = [];
    if (ctx.usuario.rol === "maestro") condiciones.push({ instructor: { usuario_id: ctx.usuario.id, eliminado_en: null } });
    else if (filtro) condiciones.push({ programa: { sucursal_id: filtro } });
    if (q.programa_id) condiciones.push({ programa_id: q.programa_id });
    if (q.sucursal_id) condiciones.push({ programa: { sucursal_id: q.sucursal_id } });
    const where = condiciones.length > 0 ? { AND: condiciones } : {};

    res.json(
      await paginar(
        pag,
        () => ctx.db.grupo.count({ where }),
        (saltar, tomar) => ctx.db.grupo.findMany({ where, select: SELECCION, orderBy: [{ nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar }),
      ),
    );
  });

  r.post("/grupos", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaAlta, req.body);
    try {
      const creado = await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
        const programa = await tx.programa.findFirst({ where: { id: e.programa_id }, select: { sucursal_id: true } });
        if (!programa) throw validacion([{ campo: "programa_id", mensaje: "El programa no existe" }]);
        const horarios = e.horarios ?? [];
        await validarPropuesta(tx, { grupoId: randomUUID(), nombre: e.nombre, programaSucursalId: programa.sucursal_id, salonId: e.salon_id ?? null, instructorId: e.instructor_id ?? null, activo: e.activo ?? true, horarios }, true);
        const g = await tx.grupo.create({
          data: altaConAlcance({
            programa_id: e.programa_id,
            nombre: e.nombre,
            cupo_maximo: e.cupo_maximo,
            permite_lista_espera: e.permite_lista_espera ?? false,
            salon_id: e.salon_id ?? null,
            instructor_id: e.instructor_id ?? null,
            activo: e.activo ?? true,
          }),
          select: { id: true },
        });
        await crearHorarios(tx, g.id, horarios);
        const fila = await tx.grupo.findFirstOrThrow({ where: { id: g.id }, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "grupo", entidadId: g.id, accion: "crear", despues: instantanea(fila) });
        return fila;
      });
      res.status(201).json(creado);
    } catch (err) {
      return choqueDe(err);
    }
  });

  r.patch("/grupos/:id", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const cambios = parsear(esquemaCambio, req.body);
    if (Object.keys(cambios).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    try {
      const salida = await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
        const antes = await tx.grupo.findFirst({ where: { id }, select: SELECCION });
        if (!antes) throw noEncontrado();
        const salonId = cambios.salon_id !== undefined ? cambios.salon_id : antes.salon_id;
        const instructorId = cambios.instructor_id !== undefined ? cambios.instructor_id : antes.instructor_id;
        const activo = cambios.activo ?? antes.activo;
        const horarios = cambios.horarios ?? antes.horarios;
        const tocaOcupacion = cambios.salon_id !== undefined || cambios.instructor_id !== undefined || cambios.horarios !== undefined || (cambios.activo === true && !antes.activo);
        await validarPropuesta(tx, { grupoId: id, nombre: cambios.nombre ?? antes.nombre, programaSucursalId: antes.programa.sucursal_id, salonId, instructorId, activo, horarios }, tocaOcupacion);
        const datos = {
          ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
          ...(cambios.cupo_maximo !== undefined ? { cupo_maximo: cambios.cupo_maximo } : {}),
          ...(cambios.permite_lista_espera !== undefined ? { permite_lista_espera: cambios.permite_lista_espera } : {}),
          ...(cambios.salon_id !== undefined ? { salon_id: cambios.salon_id } : {}),
          ...(cambios.instructor_id !== undefined ? { instructor_id: cambios.instructor_id } : {}),
          ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
        };
        const porCrear = cambios.horarios ? await quitarHorarios(tx, id, cambios.horarios, ctx.ahora()) : [];
        if (Object.keys(datos).length > 0) await tx.grupo.update({ where: { id }, data: datos });
        await crearHorarios(tx, id, porCrear);
        const despues = await tx.grupo.findFirstOrThrow({ where: { id }, select: SELECCION });
        await registrarCambio(tx, ctx, { entidad: "grupo", entidadId: id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
        return despues;
      });
      res.json(salida);
    } catch (err) {
      return choqueDe(err);
    }
  });

  r.delete("/grupos/:id", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, CANDADO_OCUPACION, async (tx) => {
      const antes = await tx.grupo.findFirst({ where: { id }, select: SELECCION });
      if (!antes) throw noEncontrado();
      const ahora = ctx.ahora();
      await tx.grupo_horario.updateMany({ where: { grupo_id: id }, data: { eliminado_en: ahora } });
      await tx.grupo.update({ where: { id }, data: { eliminado_en: ahora } });
      await registrarCambio(tx, ctx, { entidad: "grupo", entidadId: id, accion: "eliminar", antes: instantanea(antes) });
    });
    res.status(204).end();
  });

  return r;
}
