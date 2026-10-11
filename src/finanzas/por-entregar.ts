// La lista de beneficios por entregar (H4): una sola consulta y una sola forma de mostrarla, para la API y para el CSV (I5).

export const SELECCION_POR_ENTREGAR = {
  id: true,
  inscripcion_id: true,
  liberado_en: true,
  promocion: { select: { id: true, nombre: true } },
  beneficio: { select: { tipo: true, descripcion: true, producto_id: true } },
  inscripcion: { select: { alumno: { select: { id: true, nombre: true, apellidos: true, talla_uniforme: true, tutores: { where: { eliminado_en: null, es_responsable_pago: true }, take: 1, select: { tutor: { select: { id: true, nombre: true, apellidos: true, telefono: true } } } } } }, grupo: { select: { nombre: true, programa: { select: { sucursal_id: true, vertical_id: true, nombre: true } } } } } },
} as const;

/** La condición de «por entregar»: liberado, de una inscripción que no está dada de baja, y visible para quien pregunta. */
export function dondePorEntregar(visible: Record<string, unknown>, sucursalId?: string) {
  return { estatus: "liberado" as const, inscripcion: { estatus: { not: "baja" as const }, ...visible, ...(sucursalId ? { grupo: { programa: { sucursal_id: sucursalId } } } : {}) } };
}

/** Lo que `SELECCION_POR_ENTREGAR` devuelve (estructural: el resultado de Prisma lo cumple sin importar el cliente generado fuera de `src/datos/`). */
export interface FilaPorEntregar {
  id: string;
  inscripcion_id: string;
  liberado_en: Date | null;
  promocion: { id: string; nombre: string };
  beneficio: { tipo: string; descripcion: string | null; producto_id: string | null };
  inscripcion: {
    alumno: { id: string; nombre: string; apellidos: string; talla_uniforme: string | null; tutores: { tutor: { id: string; nombre: string; apellidos: string | null; telefono: string } }[] };
    grupo: { nombre: string; programa: { sucursal_id: string; vertical_id: string; nombre: string } };
  };
}

export function presentarPorEntregar(f: FilaPorEntregar) {
  return {
    id: f.id,
    inscripcion_id: f.inscripcion_id,
    alumno: { id: f.inscripcion.alumno.id, nombre: f.inscripcion.alumno.nombre, apellidos: f.inscripcion.alumno.apellidos, talla_uniforme: f.inscripcion.alumno.talla_uniforme },
    tutor: f.inscripcion.alumno.tutores[0]?.tutor ?? null,
    sucursal_id: f.inscripcion.grupo.programa.sucursal_id,
    // R5b: la disciplina del grupo (de ahí sale el color de la tarjeta y qué piezas de inventario le tocan).
    vertical_id: f.inscripcion.grupo.programa.vertical_id,
    grupo: f.inscripcion.grupo.nombre,
    promocion: f.promocion.nombre,
    tipo: f.beneficio.tipo,
    descripcion: f.beneficio.descripcion,
    producto_id: f.beneficio.producto_id,
    liberado_en: f.liberado_en,
  };
}

// R5b: lo YA entregado (la pestaña «Entregados» de Uniformes). Misma forma que lo por entregar, más cuándo y quién lo entregó y qué pieza salió del inventario (la venta promocional
// que creó la entrega; un beneficio que no es un producto no tiene venta). Una baja posterior no lo esconde: lo entregado entregado queda.

export const SELECCION_ENTREGADOS = {
  ...SELECCION_POR_ENTREGAR,
  fecha_entrega: true,
  entregado_por: { select: { id: true, nombre: true } },
  ventas: { where: { eliminado_en: null, es_promocional: true }, take: 1, select: { producto: { select: { nombre: true, talla: true } } } },
} as const;

/** La condición de «entregado»: visible para quien pregunta y, con `sucursalId`, de esa sucursal. */
export function dondeEntregados(visible: Record<string, unknown>, sucursalId?: string) {
  return { estatus: "entregado" as const, inscripcion: { ...visible, ...(sucursalId ? { grupo: { programa: { sucursal_id: sucursalId } } } : {}) } };
}

export interface FilaEntregada extends FilaPorEntregar {
  fecha_entrega: Date | null;
  entregado_por: { id: string; nombre: string } | null;
  ventas: { producto: { nombre: string; talla: string | null } }[];
}

export function presentarEntregado(f: FilaEntregada) {
  return {
    ...presentarPorEntregar(f),
    entregado_en: f.fecha_entrega,
    entregado_por: f.entregado_por ? { id: f.entregado_por.id, nombre: f.entregado_por.nombre } : null,
    producto: f.ventas[0] ? { nombre: f.ventas[0].producto.nombre, talla: f.ventas[0].producto.talla } : null,
  };
}
