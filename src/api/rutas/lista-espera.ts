// Lista de espera de los grupos llenos (C9), para el asesor.
//
//   GET    /api/lista-espera?grupo_id=&prospecto_id=&estatus=&limite=&pagina=   (lista_espera:leer)
//   PATCH  /api/lista-espera/:id   { posicion }                                  (lista_espera:escribir)  mover
//   DELETE /api/lista-espera/:id                                                  (lista_espera:escribir)  quitar
//
// Sin `estatus`, la lista trae las entradas VIVAS (esperando u ofrecido), por grupo y posición. Quitar la pasa a
// `cancelado` (sin borrar nada) y recorre a las demás; mover cambia de lugar a alguien que espera (no a quien ya
// tiene un lugar ofrecido). Las altas las hace el bot (C9) y `ofrecerLugarLiberado` (F5) marca al siguiente; todo
// cambio de posiciones corre bajo un candado por grupo. Alcance: por la sucursal del programa del grupo (404 si no).

import { Router } from "express";
import express from "express";
import { cerrarEntrada, moverEnListaEspera, type AlCambiar, type EntradaDeLista, type ResultadoDeCambio } from "../../lista-espera/lista-espera.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio, type Instantanea } from "../registro.ts";
import { entero, enumerado, objeto, opcional, parsear, parsearQuery, uuid } from "../validar.ts";

const ESTATUS = ["esperando", "ofrecido", "inscrito", "cancelado"] as const;

const SELECCION = {
  id: true,
  grupo_id: true,
  prospecto_id: true,
  lead_id: true,
  estatus: true,
  posicion: true,
  ofrecido_en: true,
  vence_en: true,
  creado_en: true,
  grupo: { select: { nombre: true } },
  prospecto: { select: { nombre: true, edad_declarada: true } },
  lead: { select: { telefono: true, nombre_contacto: true } },
} as const;

interface Fila {
  id: string;
  grupo_id: string;
  prospecto_id: string;
  lead_id: string;
  estatus: (typeof ESTATUS)[number];
  posicion: number;
  ofrecido_en: Date | null;
  vence_en: Date | null;
  creado_en: Date;
  grupo: { nombre: string };
  prospecto: { nombre: string | null; edad_declarada: number | null };
  lead: { telefono: string | null; nombre_contacto: string | null };
}

const presentar = (f: Fila) => ({
  id: f.id,
  grupo_id: f.grupo_id,
  grupo: f.grupo.nombre,
  prospecto_id: f.prospecto_id,
  prospecto: f.prospecto.nombre,
  edad_declarada: f.prospecto.edad_declarada,
  lead_id: f.lead_id,
  contacto: f.lead.nombre_contacto,
  telefono: f.lead.telefono,
  estatus: f.estatus,
  posicion: f.posicion,
  ofrecido_en: f.ofrecido_en,
  vence_en: f.vence_en,
  creado_en: f.creado_en,
});

const instantanea = (e: EntradaDeLista): Instantanea => ({ grupo_id: e.grupoId, prospecto_id: e.prospectoId, lead_id: e.leadId, estatus: e.estatus, posicion: e.posicion });

const esquemaId = objeto({ id: uuid() });
const esquemaListado = objeto({ ...esquemaPaginacion, grupo_id: opcional(uuid()), prospecto_id: opcional(uuid()), estatus: opcional(enumerado(ESTATUS)) });
const esquemaMover = objeto({ posicion: entero({ min: 1, max: 10_000 }) });

export function rutasDeListaEspera(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  /** La entrada, si es de un grupo de una sucursal que ve quien pregunta. */
  async function visible(ctx: ContextoApi, id: string) {
    const filtro = filtroDeSucursal(await ctx.alcance());
    return ctx.db.lista_espera.findFirst({ where: { id, ...(filtro ? { grupo: { programa: { sucursal_id: filtro } } } : {}) }, select: { id: true } });
  }

  const auditar = (ctx: ContextoApi): AlCambiar => async (tx, antes, despues) => {
    await registrarCambio(tx, ctx, { entidad: "lista_espera", entidadId: despues.id, accion: "actualizar", antes: instantanea(antes), despues: instantanea(despues) });
  };

  const aError = (res: ResultadoDeCambio) => {
    if (res.ok) return;
    if (res.motivo === "no_existe") throw noEncontrado();
    if (res.motivo === "ya_cerrada") throw conflicto("La entrada ya no está en la lista de espera");
    if (res.motivo === "ya_ofrecida") throw conflicto("A esta familia ya se le ofreció un lugar: no se mueve");
    throw validacion([{ campo: "posicion", mensaje: "La posición debe estar entre 1 y el número de familias en la lista" }]);
  };

  r.get("/lista-espera", requierePermiso("lista_espera:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListado, req.query);
    const pag = leerPaginacion(q);
    const filtro = filtroDeSucursal(await ctx.alcance());
    const where = {
      ...(q.grupo_id ? { grupo_id: q.grupo_id } : {}),
      ...(q.prospecto_id ? { prospecto_id: q.prospecto_id } : {}),
      estatus: q.estatus ? q.estatus : { in: ["esperando", "ofrecido"] as ("esperando" | "ofrecido")[] },
      ...(filtro ? { grupo: { programa: { sucursal_id: filtro } } } : {}),
    };
    res.json(
      await paginar(
        pag,
        () => ctx.db.lista_espera.count({ where }),
        async (saltar, tomar) => (await ctx.db.lista_espera.findMany({ where, select: SELECCION, orderBy: [{ grupo_id: "asc" }, { posicion: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map((f) => presentar(f as Fila)),
      ),
    );
  });

  r.patch("/lista-espera/:id", requierePermiso("lista_espera:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { posicion } = parsear(esquemaMover, req.body);
    if (!(await visible(ctx, id))) throw noEncontrado();
    const resultado = await moverEnListaEspera(ctx.db, id, posicion, auditar(ctx));
    aError(resultado);
    res.json(presentar((await ctx.db.lista_espera.findFirstOrThrow({ where: { id }, select: SELECCION })) as Fila));
  });

  r.delete("/lista-espera/:id", requierePermiso("lista_espera:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    if (!(await visible(ctx, id))) throw noEncontrado();
    aError(await cerrarEntrada(ctx.db, id, "cancelado", auditar(ctx)));
    res.status(204).end();
  });

  return r;
}
