// Consumo de cupo de una promoción (C3, endurecido en F-pre: EC-14 y EC-16), SEGURO bajo concurrencia y DENTRO de la transacción de quien lo llama.
//
// 1. COMPRUEBA que la promoción aplica en el contexto (EC-16): activa, vigente ese día, dentro de su alcance (vertical, sucursal, programa) y con su
//    condición cumplida: la misma `motivoDeDescarte` que usa el resolutor. Un consumo sin contexto no existe: quien consume dice para QUÉ.
// 2. TOMA el lugar con UNA sentencia atómica (EC-14): `UPDATE … SET cupo_usado = cupo_usado + 1 WHERE id = … AND activo AND
//    (cupo_maximo IS NULL OR cupo_usado < cupo_maximo)`, comparando las dos COLUMNAS en la propia base. Si dos personas toman el último lugar a la
//    vez, Postgres re-evalúa la condición sobre la fila ya actualizada y a la segunda no le toca (0 filas). Nunca se lee el tope en el código y luego se
//    escribe: aunque alguien baje el tope entre tanto, la condición lo ve. Por eso NO depende de ningún `catch`: el `CHECK` de la base
//    (`cupo_usado <= cupo_maximo`) sigue ahí como defensa, pero este UPDATE nunca lo dispara, y una sentencia que no falla no deja abortada la
//    transacción de Postgres de la inscripción (un error dentro de una transacción la aborta; un UPDATE de 0 filas, no).
// Una promoción sin tope también cuenta sus usos.
import type { BaseDatos, Consultas } from "../datos/alcance.ts";
import { cargarPromociones } from "./cargar.ts";
import { motivoDeDescarte, type ContextoPromocion } from "./resolver.ts";

/** Toma un lugar. true = lo tomó; false = la promoción no aplica a ese contexto, no existe, está dada de baja o inactiva, o no había lugar. */
export async function consumirCupo(db: BaseDatos | Consultas, promocionId: string, contexto: ContextoPromocion): Promise<boolean> {
  const [def] = await cargarPromociones(db, promocionId);
  if (!def || motivoDeDescarte({ ...def, cupoUsado: 0 }, contexto) !== null) return false; // el cupo lo decide el UPDATE, no esta lectura
  const r = await db.promocion.updateMany({
    where: { id: promocionId, activo: true, OR: [{ cupo_maximo: null }, { cupo_usado: { lt: db.promocion.fields.cupo_maximo } }] },
    data: { cupo_usado: { increment: 1 } },
  });
  return r.count === 1;
}

/** Devuelve un lugar (se canceló la inscripción). Nunca baja de cero. true = lo devolvió. */
export async function liberarCupo(db: BaseDatos | Consultas, promocionId: string): Promise<boolean> {
  const r = await db.promocion.updateMany({ where: { id: promocionId, cupo_usado: { gt: 0 } }, data: { cupo_usado: { decrement: 1 } } });
  return r.count === 1;
}
