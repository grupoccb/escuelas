// Límite de peticiones en memoria (B6): cubeta de fichas (token bucket) por clave.
//
// Cada clave (p. ej. «login|203.0.113.7») tiene una cubeta con `capacidad` fichas que se rellena a
// `recargaPorSegundo`. Cada petición gasta una; sin fichas, se rechaza y se dice en cuánto habrá una.
// Permite ráfagas de hasta `capacidad` y sostiene `recargaPorSegundo` por segundo, sin los saltos de
// una ventana fija.
//
// TOPE DE MEMORIA: a lo más `maxClaves` cubetas. Al llenarse se tiran primero las que ya están
// llenas (inactivas: equivalen a no tener cubeta) y, si no hay, las menos usadas. Costo: un atacante
// con muchísimas IPs distintas puede expulsar la cubeta de otra IP y devolverle sus fichas; el tope
// protege la memoria, no es un cortafuegos.
//
// LO QUE NO RESUELVE: vive en el proceso. Con VARIAS réplicas del backend cada una cuenta por
// separado (el límite efectivo es N veces mayor) y un reinicio lo borra. Para eso hace falta un
// almacén compartido (Redis, la base o el balanceador/WAF). Ver docs/API.md.

export interface PerfilLimite {
  capacidad: number;
  recargaPorSegundo: number;
}

/** `n` peticiones por minuto, con ráfaga máxima de `n`. */
export function perfilPorMinuto(n: number): PerfilLimite {
  return { capacidad: n, recargaPorSegundo: n / 60 };
}

export interface Decision {
  permitido: boolean;
  /** Segundos hasta que haya una ficha (0 si se permitió). */
  reintentarEnSegundos: number;
}

interface Cubeta {
  fichas: number;
  ultimo: number;
  capacidad: number;
  recarga: number;
}

export interface OpcionesLimitador {
  maxClaves?: number;
  /** Milisegundos (reloj inyectable para pruebas). */
  reloj?: () => number;
}

export class LimitadorDeTasa {
  readonly #cubetas = new Map<string, Cubeta>();
  readonly #maxClaves: number;
  readonly #reloj: () => number;

  constructor(opciones: OpcionesLimitador = {}) {
    this.#maxClaves = Math.max(1, opciones.maxClaves ?? 50_000);
    this.#reloj = opciones.reloj ?? Date.now;
  }

  /** Cubetas guardadas ahora. */
  get tamano(): number {
    return this.#cubetas.size;
  }

  #rellenada(c: Cubeta, ahora: number): number {
    return Math.min(c.capacidad, c.fichas + ((ahora - c.ultimo) / 1000) * c.recarga);
  }

  #espera(faltan: number, recarga: number): number {
    return recarga > 0 ? Math.max(1, Math.ceil(faltan / recarga)) : 3600;
  }

  /** Gasta `costo` fichas de la clave si las hay. */
  consumir(clave: string, perfil: PerfilLimite, costo = 1): Decision {
    const ahora = this.#reloj();
    let c = this.#cubetas.get(clave);
    if (c) {
      this.#cubetas.delete(clave); // se reinserta al final: las más usadas viven más
    } else {
      this.#hacerLugar(ahora);
      c = { fichas: perfil.capacidad, ultimo: ahora, capacidad: perfil.capacidad, recarga: perfil.recargaPorSegundo };
    }
    c.capacidad = perfil.capacidad;
    c.recarga = perfil.recargaPorSegundo;
    c.fichas = this.#rellenada(c, ahora);
    c.ultimo = ahora;
    let decision: Decision;
    if (c.fichas >= costo) {
      c.fichas -= costo;
      decision = { permitido: true, reintentarEnSegundos: 0 };
    } else {
      decision = { permitido: false, reintentarEnSegundos: this.#espera(costo - c.fichas, c.recarga) };
    }
    this.#cubetas.set(clave, c);
    return decision;
  }

  /** ¿Habría una ficha? No gasta nada ni crea cubeta. */
  espiar(clave: string, perfil: PerfilLimite, costo = 1): Decision {
    const c = this.#cubetas.get(clave);
    if (!c) return { permitido: perfil.capacidad >= costo, reintentarEnSegundos: 0 };
    const fichas = this.#rellenada({ ...c, capacidad: perfil.capacidad, recarga: perfil.recargaPorSegundo }, this.#reloj());
    return fichas >= costo ? { permitido: true, reintentarEnSegundos: 0 } : { permitido: false, reintentarEnSegundos: this.#espera(costo - fichas, perfil.recargaPorSegundo) };
  }

  #hacerLugar(ahora: number): void {
    if (this.#cubetas.size < this.#maxClaves) return;
    // Primero las inactivas (ya llenas): tirarlas no cambia nada. Se revisa un tramo acotado por llamada.
    let revisadas = 0;
    for (const [clave, c] of this.#cubetas) {
      if (this.#rellenada(c, ahora) >= c.capacidad) this.#cubetas.delete(clave);
      if (this.#cubetas.size < this.#maxClaves) return;
      if (++revisadas >= 64) break;
    }
    // Si no alcanzó: la menos usada recientemente (la primera del mapa).
    while (this.#cubetas.size >= this.#maxClaves) {
      const primera = this.#cubetas.keys().next();
      if (primera.done) break;
      this.#cubetas.delete(primera.value);
    }
  }
}
