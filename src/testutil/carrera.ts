// Ayudantes de prueba para FORZAR el intercalado de una carrera (EA-08).
//
// Un `Promise.all` de varias llamadas no garantiza que se intercalen: el cliente de Prisma suele
// ejecutar la lectura y el primer reclamo de una llamada antes de empezar la siguiente, y el test
// pasa aunque el candado no exista (un test vacuo). Aquí se fuerza el choque:
//
// - `Barrera(n)`: n participantes esperan a que lleguen todos antes de seguir. Se pone ENTRE la
//   lectura y el reclamo, así las n llamadas leen el mismo estado y luego compiten de verdad.
// - `conGanchos(cliente, …)`: extiende un cliente de Prisma con ganchos antes/después de una
//   operación de un modelo, para colocar la barrera (o un efecto, como borrar un lead) en el
//   punto exacto. Se aplica al cliente RAÍZ, antes de `conAlcance`.
//
// Regla: todo test de concurrencia se verifica con la mutación (quitar el candado → el test debe
// fallar). Un test de carrera que pasa sin su candado no prueba nada.

export class Barrera {
  private readonly n: number;
  private llegaron = 0;
  private liberar!: () => void;
  private readonly abierta: Promise<void>;
  private abierta_por_llegada = false;
  /** Cuántos han llegado. */
  get llegadas(): number {
    return this.llegaron;
  }
  private seAgoto = false;
  /**
   * true si todos llegaron SIN que nadie se cansara de esperar (se solaparon de verdad); false si
   * alguno agotó su espera, que es lo que pasa cuando un candado deja a uno esperando al otro.
   */
  get completa(): boolean {
    return this.abierta_por_llegada && !this.seAgoto;
  }

  constructor(participantes: number) {
    this.n = participantes;
    this.abierta = new Promise<void>((resolver) => {
      this.liberar = resolver;
    });
  }

  /**
   * Espera a que lleguen todos. Si alguno no llega, se libera a los `limiteMs` para no colgar el
   * test: eso pasa cuando un candado deja a uno esperando a que el otro termine. Usa un límite
   * corto (unos 300 ms) en tests donde se espera esa exclusión.
   */
  async esperar(limiteMs = 3000): Promise<void> {
    this.llegaron++;
    if (this.llegaron >= this.n) {
      this.abierta_por_llegada = true;
      this.liberar();
    }
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<void>((resolver) => {
      temporizador = setTimeout(() => {
        if (!this.abierta_por_llegada) this.seAgoto = true;
        resolver();
      }, limiteMs);
    });
    await Promise.race([this.abierta, limite]);
    clearTimeout(temporizador);
  }
}

export interface Gancho {
  modelo: string;
  operacion: string;
  /** Solo se dispara si devuelve true para los argumentos de la operación. Sin él, siempre. */
  cuando?: (args: Record<string, unknown>) => boolean;
  /** Antes de ejecutar la operación. */
  antes?: (args: Record<string, unknown>) => Promise<void>;
  /** Después de ejecutarla, con su resultado, antes de devolverlo a quien la pidió. */
  despues?: (args: Record<string, unknown>, resultado: unknown) => Promise<void>;
}

interface ConExtends {
  $extends(extension: never): unknown;
}

/** Devuelve el mismo cliente con los ganchos instalados. */
export function conGanchos<T extends ConExtends>(cliente: T, ...ganchos: Gancho[]): T {
  const query: Record<string, Record<string, unknown>> = {};
  for (const g of ganchos) {
    const previo = query[g.modelo]?.[g.operacion] as ((p: { args: Record<string, unknown>; query: (a: unknown) => Promise<unknown> }) => Promise<unknown>) | undefined;
    (query[g.modelo] ??= {})[g.operacion] = async (p: { args: Record<string, unknown>; query: (a: unknown) => Promise<unknown> }) => {
      const aplica = g.cuando ? g.cuando(p.args) : true;
      if (aplica) await g.antes?.(p.args);
      const resultado = previo ? await previo(p) : await p.query(p.args);
      if (aplica) await g.despues?.(p.args, resultado);
      return resultado;
    };
  }
  return cliente.$extends({ name: "carrera", query } as never) as T;
}

/** Retraso simple, para ganchos que solo necesitan dar tiempo a los demás. */
export const dormir = (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Hace que los barridos que recorren TODAS las organizaciones (espera, motor) solo vean estas.
 * La base de pruebas acumula cientos de organizaciones de otras corridas; sin esto un test del
 * ciclo completo tardaría medio minuto y dependería de datos ajenos.
 */
export function soloOrganizaciones<T extends ConExtends>(cliente: T, ids: string[]): T {
  return conGanchos(cliente, {
    modelo: "organizacion",
    operacion: "findMany",
    antes: async (args) => {
      args["where"] = { ...(args["where"] as Record<string, unknown> | undefined), id: { in: ids } };
    },
  });
}
