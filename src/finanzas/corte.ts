// Corte de caja del día (V7, recepción): cuánto se cobró hoy, por quien lo cobró y por forma de pago, para contar el efectivo y cuadrar la caja. SOLO LEE: no mueve dinero.
//
// DEFINICIONES (todas sobre el día de calendario de la sucursal, de su primer instante al primero del día siguiente)
//   · COBRADO HOY = pagos REGISTRADOS ese día (`creado_en`, el momento en que se recibió el dinero; no la «fecha del pago», que puede ser una fecha anterior) y que siguen
//     valiendo al cerrar el día (no cancelados antes del fin del día). Se agrupa por quien lo registró y por forma de pago.
//   · Un pago registrado y cancelado EL MISMO DÍA no cuenta como cobrado: aparece en «cancelados hoy» y el neto no lo ve.
//   · Un pago de un DÍA ANTERIOR que se cancela hoy es una DEVOLUCIÓN: el dinero sale de la caja de hoy. Se resta en el neto, por forma de pago.
//   · NETO = cobrado hoy − devoluciones de días anteriores, por forma de pago. El efectivo del neto es lo que debe haber en la caja por lo cobrado en el día.
// Dinero en centavos `bigint` (src/lib/dinero.ts); sale como texto con dos decimales.

import { aTexto, type Centavos } from "../lib/dinero.ts";

export type FormaDePago = "efectivo" | "tarjeta" | "transferencia";
const FORMAS: readonly FormaDePago[] = ["efectivo", "tarjeta", "transferencia"];

export interface PagoParaCorte {
  id: string;
  monto: Centavos;
  metodo: FormaDePago;
  referencia: string | null;
  creado_en: Date;
  cancelado_en: Date | null;
  motivo_cancelacion: string | null;
  familia: string;
  registrado_por: { id: string; nombre: string } | null;
  cancelado_por: { id: string; nombre: string } | null;
}

export interface Desglose {
  efectivo: Centavos;
  tarjeta: Centavos;
  transferencia: Centavos;
  total: Centavos;
  pagos: number;
}

const vacio = (): Desglose => ({ efectivo: 0n, tarjeta: 0n, transferencia: 0n, total: 0n, pagos: 0 });
function sumarA(d: Desglose, p: PagoParaCorte, signo: 1n | -1n = 1n): void {
  d[p.metodo] += signo * p.monto;
  d.total += signo * p.monto;
  d.pagos += 1;
}

export interface CorteDelDia {
  /** Una caja por persona que registró cobros ese día, por nombre. */
  cajas: { usuario: { id: string; nombre: string } | null; cobrado: Desglose }[];
  cobrado: Desglose;
  /** Cancelaciones del día de pagos de días ANTERIORES: salen de la caja de hoy. */
  devoluciones: Desglose;
  /** Cobrado − devoluciones. */
  neto: Desglose;
  /** Todo pago cancelado ese día (de hoy o de antes). */
  cancelados: { pago: PagoParaCorte; de_otro_dia: boolean }[];
  /** Lo cobrado (vigente al cierre), en el orden en que se registró. */
  pagos: PagoParaCorte[];
}

/** El corte de un día. PURA: `dia` son los límites en instantes (`desde` inclusive, `hasta` exclusivo). */
export function calcularCorte(pagos: readonly PagoParaCorte[], dia: { desde: Date; hasta: Date }): CorteDelDia {
  const dentro = (t: Date | null): boolean => t !== null && t.getTime() >= dia.desde.getTime() && t.getTime() < dia.hasta.getTime();
  const cobrado = vacio();
  const devoluciones = vacio();
  const cajas = new Map<string, { usuario: { id: string; nombre: string } | null; cobrado: Desglose }>();
  const cancelados: CorteDelDia["cancelados"] = [];
  const vigentes: PagoParaCorte[] = [];

  const ordenados = [...pagos].sort((a, b) => a.creado_en.getTime() - b.creado_en.getTime() || (a.id < b.id ? -1 : 1));
  for (const p of ordenados) {
    const registradoHoy = dentro(p.creado_en);
    const canceladoAntesDelCierre = p.cancelado_en !== null && p.cancelado_en.getTime() < dia.hasta.getTime();
    if (registradoHoy && !canceladoAntesDelCierre) {
      sumarA(cobrado, p);
      const llave = p.registrado_por?.id ?? "";
      const caja = cajas.get(llave) ?? { usuario: p.registrado_por, cobrado: vacio() };
      sumarA(caja.cobrado, p);
      cajas.set(llave, caja);
      vigentes.push(p);
    }
    if (dentro(p.cancelado_en)) {
      const deOtroDia = !registradoHoy;
      cancelados.push({ pago: p, de_otro_dia: deOtroDia });
      if (deOtroDia) sumarA(devoluciones, p);
    }
  }
  const neto = vacio();
  for (const f of FORMAS) neto[f] = cobrado[f] - devoluciones[f];
  neto.total = cobrado.total - devoluciones.total;
  neto.pagos = cobrado.pagos;
  return { cajas: [...cajas.values()].sort((a, b) => (a.usuario?.nombre ?? "").localeCompare(b.usuario?.nombre ?? "", "es")), cobrado, devoluciones, neto, cancelados, pagos: vigentes };
}

export const desgloseATexto = (d: Desglose) => ({ efectivo: aTexto(d.efectivo), tarjeta: aTexto(d.tarjeta), transferencia: aTexto(d.transferencia), total: aTexto(d.total), pagos: d.pagos });

/** Cómo sale el corte por la API: importes como texto, instantes en ISO. */
export function presentarCorte(c: CorteDelDia) {
  const pago = (p: PagoParaCorte) => ({ id: p.id, hora: p.creado_en, familia: p.familia, monto: aTexto(p.monto), metodo: p.metodo, referencia: p.referencia, registrado_por: p.registrado_por });
  return {
    cajas: c.cajas.map((x) => ({ usuario: x.usuario, cobrado: desgloseATexto(x.cobrado) })),
    cobrado: desgloseATexto(c.cobrado),
    devoluciones: desgloseATexto(c.devoluciones),
    neto: desgloseATexto(c.neto),
    cancelados: c.cancelados.map((x) => ({ ...pago(x.pago), de_otro_dia: x.de_otro_dia, cancelado_en: x.pago.cancelado_en, cancelado_por: x.pago.cancelado_por, motivo: x.pago.motivo_cancelacion })),
    pagos: c.pagos.map(pago),
  };
}
