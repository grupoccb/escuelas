// Usuarios de la organización (solo administrador).
//
//   GET   /api/usuarios?rol=&activo=&limite=&pagina=
//   POST  /api/usuarios   { correo, nombre, rol, contrasena, sucursales?: uuid[] }
//   PATCH /api/usuarios/:id   { nombre?, rol?, activo?, contrasena?, sucursales? }
//
// Reglas: el correo no se cambia; no puedes desactivarte ni quitarte el rol de administrador; nunca
// puede quedar la organización sin un administrador activo (se comprueba bajo candado, así que dos
// administradores que se quitan el rol a la vez no la dejan vacía). Desactivar, cambiar el rol o la
// contraseña cierra las sesiones del usuario. Un usuario con rol maestro tiene un instructor ligado
// (se crea si falta): de ahí sale «sus grupos». Nunca se devuelve ni se registra una contraseña.

import { Router } from "express";
import express from "express";
import { hashContrasena, problemasDeContrasena } from "../../auth/contrasena.ts";
import { ROLES } from "../../auth/roles.ts";
import { revocarSesionesDeUsuario } from "../../auth/sesiones.ts";
import { altaConAlcance, type Consultas } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { esViolacionUnica } from "../../datos/prisma.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { booleano, booleanoDeTexto, correo, enumerado, listaDe, objeto, opcional, parsear, parsearQuery, texto, textoLiteral, uuid } from "../validar.ts";
import { autenticar } from "../autenticar.ts";

const SELECCION = {
  id: true,
  correo: true,
  nombre: true,
  rol: true,
  activo: true,
  creado_en: true,
  sucursales: { where: { eliminado_en: null }, select: { sucursal_id: true }, orderBy: { sucursal_id: "asc" } },
} as const;

interface FilaUsuario {
  id: string;
  correo: string;
  nombre: string;
  rol: string;
  activo: boolean;
  creado_en: Date;
  sucursales: { sucursal_id: string }[];
}

export function presentarUsuario(u: FilaUsuario) {
  return { id: u.id, correo: u.correo, nombre: u.nombre, rol: u.rol, activo: u.activo, creado_en: u.creado_en, sucursales: u.sucursales.map((s) => s.sucursal_id) };
}

const esquemaListado = objeto({ ...esquemaPaginacion, rol: opcional(enumerado(ROLES)), activo: opcional(booleanoDeTexto()) });
const esquemaId = objeto({ id: uuid() });
const esquemaAlta = objeto({
  correo: correo(),
  nombre: texto({ max: 120 }),
  rol: enumerado(ROLES),
  contrasena: textoLiteral({ max: 1024 }),
  sucursales: opcional(listaDe(uuid(), { max: 100, unicos: true })),
});
const esquemaCambio = objeto({
  nombre: opcional(texto({ max: 120 })),
  rol: opcional(enumerado(ROLES)),
  activo: opcional(booleano()),
  contrasena: opcional(textoLiteral({ max: 1024 })),
  sucursales: opcional(listaDe(uuid(), { max: 100, unicos: true })),
});

/** Todas las sucursales pedidas tienen que existir en la organización (el alcance ya filtra por ella). */
async function validarSucursales(tx: Consultas, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const existentes = await tx.sucursal.count({ where: { id: { in: ids } } });
  if (existentes !== ids.length) throw validacion([{ campo: "sucursales", mensaje: "Alguna sucursal no existe" }]);
}

/** Deja al usuario con exactamente las sucursales pedidas (las que sobran se marcan eliminadas). */
async function fijarSucursales(tx: Consultas, usuarioId: string, ids: string[], ahora: Date): Promise<void> {
  const vivas = await tx.usuario_sucursal.findMany({ where: { usuario_id: usuarioId }, select: { id: true, sucursal_id: true } });
  const quedan = new Set(ids);
  const sobran = vivas.filter((v) => !quedan.has(v.sucursal_id)).map((v) => v.id);
  if (sobran.length > 0) await tx.usuario_sucursal.updateMany({ where: { id: { in: sobran } }, data: { eliminado_en: ahora } });
  const yaEstan = new Set(vivas.map((v) => v.sucursal_id));
  for (const sucursalId of ids) {
    if (!yaEstan.has(sucursalId)) await tx.usuario_sucursal.create({ data: altaConAlcance({ usuario_id: usuarioId, sucursal_id: sucursalId }) });
  }
}

/** Un maestro necesita su instructor para que «sus grupos» tengan sentido. */
async function asegurarInstructor(tx: Consultas, usuarioId: string, nombre: string): Promise<void> {
  const existe = await tx.instructor.findFirst({ where: { usuario_id: usuarioId }, select: { id: true } });
  if (!existe) await tx.instructor.create({ data: altaConAlcance({ usuario_id: usuarioId, nombre }) });
}

export function rutasDeUsuarios(deps: DepsApi): Router {
  const r = Router();
  const dentro = [autenticar(deps), requierePermiso("usuarios:administrar")];
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/usuarios", ...dentro, async (req, res) => {
    const { db } = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.rol ? { rol: q.rol } : {}), ...(q.activo !== undefined ? { activo: q.activo } : {}) };
    res.json(
      await paginar(
        pag,
        () => db.usuario.count({ where }),
        async (saltar, tomar) =>
          (await db.usuario.findMany({ where, select: SELECCION, orderBy: [{ nombre: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map(presentarUsuario),
      ),
    );
  });

  r.post("/usuarios", ...dentro, json, async (req, res) => {
    const ctx = contextoDe(res);
    const entrada = parsear(esquemaAlta, req.body);
    const problemas = problemasDeContrasena(entrada.contrasena, { correo: entrada.correo, nombre: entrada.nombre });
    if (problemas.length > 0) throw validacion(problemas.map((mensaje) => ({ campo: "contrasena", mensaje })));
    const hash = await hashContrasena(entrada.contrasena, deps.acceso.parametrosHash);
    const ahora = ctx.ahora();
    try {
      const creado = await ctx.db.$transaction(async (tx) => {
        if (await tx.usuario.findFirst({ where: { correo: entrada.correo }, select: { id: true } })) {
          throw conflicto("Ya existe un usuario con ese correo", [{ campo: "correo", mensaje: "Ya está en uso" }]);
        }
        await validarSucursales(tx, entrada.sucursales ?? []);
        const u = await tx.usuario.create({
          data: altaConAlcance({ correo: entrada.correo, nombre: entrada.nombre, rol: entrada.rol, contrasena_hash: hash, contrasena_cambiada_en: ahora }),
          select: { id: true },
        });
        await fijarSucursales(tx, u.id, entrada.sucursales ?? [], ahora);
        if (entrada.rol === "maestro") await asegurarInstructor(tx, u.id, entrada.nombre);
        return tx.usuario.findFirstOrThrow({ where: { id: u.id }, select: SELECCION });
      });
      res.status(201).json(presentarUsuario(creado));
    } catch (e) {
      if (esViolacionUnica(e)) throw conflicto("Ya existe un usuario con ese correo", [{ campo: "correo", mensaje: "Ya está en uso" }]);
      throw e;
    }
  });

  r.patch("/usuarios/:id", ...dentro, json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const cambios = parsear(esquemaCambio, req.body);
    if (Object.keys(cambios).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    const esYo = id === ctx.usuario.id;
    if (esYo && (cambios.activo === false || (cambios.rol !== undefined && cambios.rol !== "administrador"))) {
      throw conflicto("No puedes desactivarte ni quitarte el rol de administrador");
    }
    let hash: string | undefined;
    if (cambios.contrasena !== undefined) {
      const objetivo = await ctx.db.usuario.findFirst({ where: { id }, select: { correo: true, nombre: true } });
      if (!objetivo) throw noEncontrado();
      const problemas = problemasDeContrasena(cambios.contrasena, objetivo);
      if (problemas.length > 0) throw validacion(problemas.map((mensaje) => ({ campo: "contrasena", mensaje })));
      hash = await hashContrasena(cambios.contrasena, deps.acceso.parametrosHash);
    }
    const ahora = ctx.ahora();

    // Bajo candado: la regla «siempre queda un administrador activo» compara con el estado actual.
    const actualizado = await transaccionConBloqueo(ctx.db, ctx.organizacionId, "usuarios:administradores", async (tx) => {
      const actual = await tx.usuario.findFirst({ where: { id }, select: { id: true, nombre: true, rol: true, activo: true } });
      if (!actual) throw noEncontrado();
      const dejaDeSerAdminActivo = actual.rol === "administrador" && actual.activo && (cambios.activo === false || (cambios.rol !== undefined && cambios.rol !== "administrador"));
      if (dejaDeSerAdminActivo) {
        const otros = await tx.usuario.count({ where: { rol: "administrador", activo: true, id: { not: id } } });
        if (otros === 0) throw conflicto("Debe quedar al menos un administrador activo");
      }
      if (cambios.sucursales) await validarSucursales(tx, cambios.sucursales);
      const datos = {
        ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
        ...(cambios.rol !== undefined ? { rol: cambios.rol } : {}),
        ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
        ...(hash !== undefined ? { contrasena_hash: hash, contrasena_cambiada_en: ahora } : {}),
      };
      if (Object.keys(datos).length > 0) await tx.usuario.update({ where: { id }, data: datos });
      if (cambios.sucursales) await fijarSucursales(tx, id, cambios.sucursales, ahora);
      if ((cambios.rol ?? actual.rol) === "maestro") await asegurarInstructor(tx, id, cambios.nombre ?? actual.nombre);
      const cierraSesiones = cambios.activo === false || (cambios.rol !== undefined && cambios.rol !== actual.rol) || hash !== undefined;
      if (cierraSesiones) await revocarSesionesDeUsuario(tx, id, ahora, esYo ? ctx.sesionId : undefined);
      return tx.usuario.findFirstOrThrow({ where: { id }, select: SELECCION });
    });
    res.json(presentarUsuario(actualizado));
  });

  return r;
}
