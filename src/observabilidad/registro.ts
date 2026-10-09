// Registro de métricas del proceso en el formato de texto de Prometheus (K4). Sin dependencias.
//
// Dos clases de números:
//  - del PROCESO (contadores que suben mientras corre: webhooks aceptados o rechazados, respuestas HTTP, ciclos del barrido). Se reinician con el proceso, como
//    cualquier contador de Prometheus (`rate()` lo tolera);
//  - de la BASE (lo que hay AHORA: mensajes por estado, tareas pendientes, cargos vencidos). Los calcula `recolector.ts` en cada lectura (con un caché corto)
//    y por eso valen igual con una o con diez tareas del backend.
//
// Etiquetas: SOLO valores de un conjunto cerrado (estatus, motivos, tipos, orígenes). Nunca un teléfono, un nombre, un identificador ni texto libre: una métrica
// no es un lugar para datos de una persona y, además, una etiqueta abierta rompe a Prometheus.

export type Etiquetas = Readonly<Record<string, string>>;

const NOMBRE_VALIDO = /^[a-z_][a-z0-9_]*$/;
const ETIQUETA_VALIDA = /^[a-z_][a-z0-9_]*$/;

/** Escapa un valor de etiqueta como pide el formato (barra, comillas y salto de línea). */
export function escaparEtiqueta(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function serializar(etiquetas: Etiquetas): string {
  const claves = Object.keys(etiquetas).sort();
  if (claves.length === 0) return "";
  return `{${claves.map((k) => `${k}="${escaparEtiqueta(etiquetas[k]!)}"`).join(",")}}`;
}

interface Definicion {
  tipo: "counter" | "gauge";
  ayuda: string;
}

export interface Muestra {
  nombre: string;
  etiquetas: Etiquetas;
  valor: number;
}

export class RegistroDeMetricas {
  private readonly definiciones = new Map<string, Definicion>();
  private readonly valores = new Map<string, Map<string, { etiquetas: Etiquetas; valor: number }>>();

  /** Declara una métrica (idempotente). Hay que declararla antes de usarla: así `/metricas` siempre lleva su `HELP` y su `TYPE`. */
  declarar(nombre: string, tipo: "counter" | "gauge", ayuda: string): void {
    if (!NOMBRE_VALIDO.test(nombre)) throw new Error(`Nombre de métrica inválido: ${nombre}`);
    this.definiciones.set(nombre, { tipo, ayuda });
  }

  private celda(nombre: string, etiquetas: Etiquetas): { etiquetas: Etiquetas; valor: number } {
    if (!this.definiciones.has(nombre)) throw new Error(`Métrica sin declarar: ${nombre}`);
    for (const k of Object.keys(etiquetas)) if (!ETIQUETA_VALIDA.test(k)) throw new Error(`Etiqueta inválida: ${k}`);
    let porEtiquetas = this.valores.get(nombre);
    if (!porEtiquetas) this.valores.set(nombre, (porEtiquetas = new Map()));
    const llave = serializar(etiquetas);
    let c = porEtiquetas.get(llave);
    if (!c) porEtiquetas.set(llave, (c = { etiquetas: { ...etiquetas }, valor: 0 }));
    return c;
  }

  incrementar(nombre: string, etiquetas: Etiquetas = {}, n = 1): void {
    this.celda(nombre, etiquetas).valor += n;
  }

  fijar(nombre: string, valor: number, etiquetas: Etiquetas = {}): void {
    this.celda(nombre, etiquetas).valor = valor;
  }

  /** Quita todas las muestras de una métrica (las de la base se recalculan completas en cada lectura). */
  vaciar(nombre: string): void {
    this.valores.delete(nombre);
  }

  leer(nombre: string, etiquetas: Etiquetas = {}): number {
    return this.valores.get(nombre)?.get(serializar(etiquetas))?.valor ?? 0;
  }

  muestras(): Muestra[] {
    const salida: Muestra[] = [];
    for (const [nombre, porEtiquetas] of this.valores) for (const { etiquetas, valor } of porEtiquetas.values()) salida.push({ nombre, etiquetas, valor });
    return salida;
  }

  /** El texto de Prometheus: HELP, TYPE y las muestras, ordenado para que sea estable. */
  texto(): string {
    const lineas: string[] = [];
    for (const nombre of [...this.definiciones.keys()].sort()) {
      const d = this.definiciones.get(nombre)!;
      lineas.push(`# HELP ${nombre} ${d.ayuda.replace(/\\/g, "\\\\").replace(/\n/g, "\\n")}`);
      lineas.push(`# TYPE ${nombre} ${d.tipo}`);
      const porEtiquetas = this.valores.get(nombre);
      if (!porEtiquetas || porEtiquetas.size === 0) {
        // Un contador o medidor sin etiquetas existe en cero desde el principio: la ausencia de una serie no se confunde con un cero.
        if (!this.requiereEtiquetas.has(nombre)) lineas.push(`${nombre} 0`);
        continue;
      }
      for (const llave of [...porEtiquetas.keys()].sort()) {
        const c = porEtiquetas.get(llave)!;
        lineas.push(`${nombre}${llave} ${Number.isInteger(c.valor) ? c.valor : c.valor.toFixed(3)}`);
      }
    }
    return `${lineas.join("\n")}\n`;
  }

  private readonly requiereEtiquetas = new Set<string>();

  /** Marca una métrica que siempre lleva etiquetas: vacía no emite la serie «sin etiquetas». */
  conEtiquetas(nombre: string): void {
    this.requiereEtiquetas.add(nombre);
  }
}
