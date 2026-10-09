// Estado de cuenta por familia (H3) — solo lectura.
//
//   GET /api/tutores/:id/estado-cuenta     (estado_cuenta:leer)
//
// Por tutor (la familia): `resumen` (total cargado, total pagado, saldo, vencido y la antigüedad de lo vencido), `hijos[]` (los cargos de cada hijo con su
// saldo, vencido y antigüedad) y `pagos[]` (los últimos 100, con sus aplicaciones). Antigüedad en días de atraso: `de_0_a_30` (1 a 30), `de_31_a_60`,
// `de_61_a_90` y `mas_de_90` (91 o más). Los cargos cancelados se listan pero no cuentan. Todo el dinero sale como texto con dos decimales.
// Permisos: administrador, asesor y recepción (de SUS sucursales); el maestro no ve importes (403). La familia ajena es 404.

import { Router } from "express";
import { dondeTutorVisible } from "../../familias/alcance.ts";
import { estadoDeCuentaDeFamilia } from "../../finanzas/estado-cuenta.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { noEncontrado } from "../errores.ts";
import { objeto, parsear, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });

export function rutasDeEstadoDeCuenta(_deps: DepsApi): Router {
  const r = Router();
  r.get("/tutores/:id/estado-cuenta", requierePermiso("estado_cuenta:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const tutor = await ctx.db.tutor.findFirst({ where: { id, ...(await dondeTutorVisible(ctx)) }, select: { id: true, nombre: true, apellidos: true, telefono: true } });
    if (!tutor) throw noEncontrado();
    res.json({ tutor, ...(await estadoDeCuentaDeFamilia(ctx.db, id, ctx.ahora())) });
  });
  return r;
}
