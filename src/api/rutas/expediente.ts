// Expediente del alumno (G5): todo lo de la sección 9 del contexto en UNA respuesta.
//
//   GET /api/alumnos/:id/expediente        (alumnos:leer)
//
// Secciones: `trayectoria` (inicio, antigüedad, grupo actual, historial de cambios de grupo, nivel actual y su fecha por vertical, próximo examen y elegibilidad),
// `economico` (mensualidad vigente, día de corte, promoción aplicada, beneficios pendientes, estado de cuenta y antigüedad de la cartera vencida), `operativo`
// (% de asistencia de 30 días, racha de faltas, eventos, productos comprados) y `comercial` (origen del lead —campaña y canal—, días que tardó en cerrar, hermanos
// inscritos y sus verticales, motivo de baja). El estado de cuenta y los productos entran por interfaces (`ProveedorEconomico`, `ProveedorProductos`, src/expediente/
// proveedores.ts): hasta que la etapa H las enchufe responden `{ disponible: false, motivo }`.
//
// La SALUD no va aquí (decisión 12): se lee aparte con `GET /api/salud/alumno/:id` (permiso, motivo y registro de accesos); el expediente solo indica el camino.
// V1: lo que pertenece a un módulo apagado no se consulta: sin operación, `asistencia` y `eventos` vienen en `null` y no hay niveles ni próximo examen; sin finanzas, `economico` y
// `productos_comprados` vienen en `null`.
// Alcance: el de los alumnos (`dondeAlumnoVisible`); el maestro solo ve a sus alumnos y SIN importes (EF-03): `economico` y `comercial` vienen en `null`.

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import { dondeEventoVisible } from "../../eventos/alcance.ts";
import { armarExpediente } from "../../expediente/expediente.ts";
import { dondeAlumnoVisible } from "../../familias/alcance.ts";
import { leerModulos } from "../../modulos/index.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { noEncontrado } from "../errores.ts";
import { objeto, parsear, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });

export function rutasDeExpediente(deps: DepsApi): Router {
  const r = crearRouter();

  r.get("/alumnos/:id/expediente", requierePermiso("alumnos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    if (!(await ctx.db.alumno.findFirst({ where: { id, ...(await dondeAlumnoVisible(ctx)) }, select: { id: true } }))) throw noEncontrado();
    const expediente = await armarExpediente(ctx.db, id, { ahora: ctx.ahora(), rol: ctx.usuario.rol, proveedores: deps.expediente, dondeEvento: await dondeEventoVisible(ctx), modulos: await leerModulos(ctx.db) });
    if (!expediente) throw noEncontrado();
    res.json(expediente);
  });

  return r;
}
