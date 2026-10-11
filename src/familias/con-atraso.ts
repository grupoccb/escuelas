// El filtro `con_atraso` de `GET /api/tutores` y `GET /api/alumnos` (R9b), de solo lectura: quién tiene al menos un cargo VENCIDO con saldo.
//
// Es LA MISMA definición de atraso que ya usan el tablero ejecutivo (`cartera_vencida.familias`), el estado de cuenta y la etiqueta «Con vencido» de la lista de familias
// (`resumen.ts`): un cargo abierto (`pendiente` o `vencido`; el pagado y el cancelado no cuentan) con saldo (`monto_final − monto_pagado`, en centavos, nunca con flotantes) cuyo
// vencimiento ya pasó en el calendario de SU sucursal (`atrasoEn` con `hoyDeCadaSucursal`). Un cargo que aún no vence, o ya saldado, no hace que la familia tenga atraso.
//   · FAMILIA con atraso = el tutor de ese cargo (`cargo.tutor_id`, el responsable de pago al generarse).
//   · ALUMNO con atraso = el alumno de ese cargo (`cargo.alumno_id`).
// Las consultas pasan por el scope único (`db` ya filtra por organización y excluye lo dado de baja); el alcance por sucursal de quien pregunta lo aplica la ruta sobre tutores y
// alumnos (`dondeTutorVisible`, `dondeAlumnoVisible`), así que aquí no se repite.

import { deFecha } from "../catalogo/precios.ts";
import type { Consultas } from "../datos/alcance.ts";
import { atrasoEn, hoyDeCadaSucursal } from "../finanzas/estado-cuenta.ts";
import { deDecimal, restar } from "../lib/dinero.ts";

export interface ConAtraso {
  tutorIds: string[];
  alumnoIds: string[];
}

/** Los tutores y alumnos con al menos un cargo vencido y con saldo, a la hora `ahora`. Solo lee. */
export async function conAtraso(db: Consultas, ahora: Date): Promise<ConAtraso> {
  const hoy = await hoyDeCadaSucursal(db, ahora);
  const abiertos = await db.cargo.findMany({
    where: { estatus: { in: ["pendiente", "vencido"] } },
    select: { tutor_id: true, alumno_id: true, sucursal_id: true, monto_final: true, monto_pagado: true, fecha_vencimiento: true },
  });
  const tutores = new Set<string>();
  const alumnos = new Set<string>();
  for (const c of abiertos) {
    if (restar(deDecimal(c.monto_final), deDecimal(c.monto_pagado)) <= 0n) continue;
    const vence = deFecha(c.fecha_vencimiento);
    if (atrasoEn(vence, hoy.get(c.sucursal_id) ?? vence) <= 0) continue;
    tutores.add(c.tutor_id);
    alumnos.add(c.alumno_id);
  }
  return { tutorIds: [...tutores], alumnoIds: [...alumnos] };
}
