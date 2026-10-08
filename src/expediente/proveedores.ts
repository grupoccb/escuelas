// Los enchufes del expediente (G5) hacia lo que se construye después. Interfaces con una implementación NULA documentada: el expediente ya pide estos datos y
// responde «no disponible» hasta que la etapa correspondiente enchufe la real (invariante 11: detrás de interfaces).
//
//   · `ProveedorEconomico` — el estado de cuenta y la antigüedad de la cartera vencida. Lo implementa la etapa H (cargos, pagos, estado de cuenta: H1 a H3).
//   · `ProveedorProductos` — los productos que compró la familia. Lo implementa H5 (productos y ventas).
//
// Para enchufarlos: pasar la implementación real en `ApiDepsEntrada.expediente` (src/api/index.ts); `server.ts` es el único lugar que decide cuál usar.

import type { Consultas } from "../datos/alcance.ts";

/** Lo que el expediente muestra del estado de cuenta de un alumno. Dinero SIEMPRE como texto con dos decimales. */
export type EstadoDeCuentaDelAlumno =
  | {
      disponible: true;
      /** Lo que se debe en total (cargos − pagos aplicados), como «1234.50». */
      saldo: string;
      /** La parte vencida del saldo. */
      vencido: string;
      /** Días de antigüedad del cargo vencido más viejo; null si no hay nada vencido. */
      antiguedadCarteraVencidaDias: number | null;
    }
  | { disponible: false; motivo: string };

export interface ProveedorEconomico {
  estadoDeCuenta(db: Consultas, alumnoId: string, ahora: Date): Promise<EstadoDeCuentaDelAlumno>;
}

export interface ProductoComprado {
  producto: string;
  cantidad: number;
  /** `AAAA-MM-DD`. */
  fecha: string;
}

export type ProductosDelAlumno = { disponible: true; productos: ProductoComprado[] } | { disponible: false; motivo: string };

export interface ProveedorProductos {
  productosComprados(db: Consultas, alumnoId: string): Promise<ProductosDelAlumno>;
}

/** PUNTO DE ENCHUFE PARA H (H1 a H3): hoy no hay cargos ni pagos, así que el estado de cuenta «no está disponible». */
export class ProveedorEconomicoNulo implements ProveedorEconomico {
  async estadoDeCuenta(): Promise<EstadoDeCuentaDelAlumno> {
    return { disponible: false, motivo: "finanzas_pendiente" };
  }
}

/** PUNTO DE ENCHUFE PARA H5: hoy no hay productos ni ventas. */
export class ProveedorProductosNulo implements ProveedorProductos {
  async productosComprados(): Promise<ProductosDelAlumno> {
    return { disponible: false, motivo: "productos_pendiente" };
  }
}

export interface ProveedoresDelExpediente {
  economico: ProveedorEconomico;
  productos: ProveedorProductos;
}

export const PROVEEDORES_NULOS: ProveedoresDelExpediente = { economico: new ProveedorEconomicoNulo(), productos: new ProveedorProductosNulo() };
