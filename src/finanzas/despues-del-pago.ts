// Lo que PASA porque un pago se registró o se canceló, dentro de la MISMA transacción del pago (regla de Eduardo: nada de «registrar y luego, en otro paso, liberar»).
// H4 (beneficios diferidos) y H6 (recordatorios de cobro) se enchufan aquí.

import type { Consultas } from "../datos/alcance.ts";
import { liberarBeneficiosDelPago, revisarBeneficiosAlCancelar } from "./beneficios.ts";
import { cancelarEjecucionesDeCobro } from "../cobranza/ejecuciones.ts";
import type { ContextoDePago, PagoCancelado, PagoRegistrado } from "./pagos.ts";

export async function alRegistrarPago(tx: Consultas, ctx: ContextoDePago, pago: PagoRegistrado): Promise<void> {
  // H4: el pago que salda la primera mensualidad libera los beneficios diferidos de esa inscripción.
  await liberarBeneficiosDelPago(tx, ctx, pago);
  // H6: lo que ya se saldó no se vuelve a recordar (las ejecuciones programadas y aún no reclamadas se cancelan).
  await cancelarEjecucionesDeCobro(tx, pago.cargosSaldados, "cargo_saldado");
}

export async function alCancelarPago(tx: Consultas, ctx: ContextoDePago, cancelado: PagoCancelado): Promise<void> {
  // H4: lo liberado que ya no se cumple regresa a pendiente; lo ya entregado se marca para revisión.
  await revisarBeneficiosAlCancelar(tx, ctx, cancelado);
}
