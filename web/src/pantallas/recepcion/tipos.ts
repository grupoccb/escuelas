// Lo que devuelve la API de finanzas (docs/API.md, H1 a H5). TODO importe es texto decimal exacto («1234.50»): nunca se convierte a número.

export interface CargoDeCuenta {
  id: string;
  inscripcion_id: string | null;
  concepto: string;
  periodo: string | null;
  descripcion: string | null;
  monto_final: string;
  monto_pagado: string;
  saldo: string;
  fecha_vencimiento: string;
  estatus: string;
  estatus_efectivo: string;
  dias_de_atraso: number;
}

export interface Antiguedad {
  de_0_a_30: string;
  de_31_a_60: string;
  de_61_a_90: string;
  mas_de_90: string;
}

export interface ResumenDeCuenta {
  total_cargado: string;
  total_pagado: string;
  saldo: string;
  vencido: string;
  antiguedad: Antiguedad;
}

export interface HijoDeCuenta extends ResumenDeCuenta {
  alumno: { id: string; nombre: string; apellidos: string };
  cargos: CargoDeCuenta[];
}

export interface PagoDeCuenta {
  id: string;
  monto: string;
  monto_aplicado: string;
  metodo: string;
  referencia: string | null;
  fecha: string;
  estatus: string;
  /** Por qué se canceló (nulo si no se canceló) y quién lo registró (R5b: el renglón de la cuenta lo dice). */
  motivo_cancelacion?: string | null;
  registrado_por?: string | null;
  aplicaciones: { cargo_id: string; monto: string; estatus: string }[];
}

export interface EstadoDeCuenta {
  resumen: ResumenDeCuenta;
  hijos: HijoDeCuenta[];
  pagos: PagoDeCuenta[];
}

export interface Pago {
  id: string;
  tutor_id: string;
  monto: string;
  monto_aplicado: string;
  metodo: string;
  referencia: string | null;
  fecha: string;
  estatus: "aplicado" | "cancelado";
  motivo_cancelacion: string | null;
  repetido?: boolean;
  aplicaciones: { id: string; cargo_id: string; monto: string; estatus: string; concepto: string; periodo: string | null; descripcion: string | null; alumno: { id: string; nombre: string } }[];
}

export interface Propuesta {
  tutor_id: string;
  monto: string;
  adeudado: string;
  ok: boolean;
  motivo: string | null;
  excedente: string | null;
  aplicaciones: { cargo_id: string; monto: string }[];
}

export interface Producto {
  id: string;
  vertical: { id: string; nombre: string };
  nombre: string;
  talla: string | null;
  precio: string;
  stock: number;
  activo: boolean;
}

export interface Venta {
  id: string;
  tutor_id: string;
  alumno: { id: string; nombre: string; apellidos: string };
  producto: { id: string; nombre: string; talla: string | null };
  cantidad: number;
  precio_unitario: string;
  total: string;
  es_promocional: boolean;
  fecha: string;
  estatus: string;
  motivo_anulacion: string | null;
  cargo: { id: string; estatus: string; monto_final: string; monto_pagado: string } | null;
}

export interface BeneficioPorEntregar {
  id: string;
  inscripcion_id: string;
  alumno: { id: string; nombre: string; apellidos: string; talla_uniforme: string | null };
  tutor: { id: string; nombre: string; apellidos: string | null; telefono: string } | null;
  sucursal_id: string;
  /** La disciplina del grupo (R5b): de ahí sale el color de la tarjeta y qué piezas del inventario le tocan. */
  vertical_id?: string;
  grupo: string;
  promocion: string;
  tipo: string;
  descripcion: string | null;
  producto_id: string | null;
  liberado_en: string | null;
}

/** Lo ya entregado (R5b, `GET /api/beneficios/entregados`): lo mismo que lo por entregar y, además, cuándo, quién y qué pieza salió del inventario. */
export interface BeneficioEntregado extends BeneficioPorEntregar {
  entregado_en: string | null;
  entregado_por: { id: string; nombre: string } | null;
  producto: { nombre: string; talla: string | null } | null;
}

export const CONCEPTOS: Record<string, string> = { inscripcion: "Inscripción", mensualidad: "Mensualidad", evento: "Evento", producto: "Producto" };
export const METODOS = [
  { valor: "efectivo", texto: "Efectivo" },
  { valor: "tarjeta", texto: "Tarjeta" },
  { valor: "transferencia", texto: "Transferencia" },
] as const;

/** «Mensualidad · 2026-11», «Evento · Examen anterior»… (la descripción de una inscripción o una mensualidad repite el concepto: no se muestra). */
export function nombreDeCargo(c: { concepto: string; periodo: string | null; descripcion: string | null }): string {
  const base = CONCEPTOS[c.concepto] ?? c.concepto;
  const detalle = c.concepto === "inscripcion" || c.concepto === "mensualidad" ? null : c.descripcion;
  return [base, c.periodo, detalle].filter(Boolean).join(" · ");
}
