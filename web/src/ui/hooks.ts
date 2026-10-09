import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ErrorDeApi } from "../api/cliente.ts";

export function comoErrorDeApi(e: unknown): ErrorDeApi {
  if (e instanceof ErrorDeApi) return e;
  return new ErrorDeApi(0, "desconocido", "Algo salió mal. Inténtalo de nuevo.");
}

export interface Carga<T> {
  datos: T | null;
  cargando: boolean;
  error: ErrorDeApi | null;
  recargar(): void;
  /** Reemplaza lo cargado sin pedirlo otra vez (después de una acción que ya devolvió el valor nuevo). */
  poner(valor: T): void;
}

/**
 * Carga un recurso al montar y cada vez que cambian `deps`. Cancela lo que quedó atrás (`AbortController`), conserva lo ya mostrado mientras recarga
 * y deja el error a la vista (`error`) para que la pantalla ofrezca reintentar. Nunca registra nada en la consola.
 */
export function useCarga<T>(cargar: (senal: AbortSignal) => Promise<T>, deps: readonly unknown[], activo = true): Carga<T> {
  const [estado, setEstado] = useState<{ datos: T | null; cargando: boolean; error: ErrorDeApi | null }>({ datos: null, cargando: activo, error: null });
  const [version, setVersion] = useState(0);
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  });
  // EK-UI-01: si cambia de qué recurso se trata (`deps`), lo mostrado es de OTRO recurso y no se conserva (antes, al cambiar de familia en «Registrar pago» se veía el nombre
  // de la nueva con el saldo y los cargos de la anterior). Una recarga del MISMO recurso (`recargar`, `poner`) sí conserva lo mostrado.
  const depsPrevias = useRef<readonly unknown[]>(deps);

  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    const cambioElRecurso = depsPrevias.current.length !== deps.length || depsPrevias.current.some((d, i) => !Object.is(d, deps[i]));
    depsPrevias.current = deps;
    setEstado((e) => ({ datos: cambioElRecurso ? null : e.datos, cargando: true, error: null }));
    cargarRef
      .current(control.signal)
      .then((datos) => {
        if (!control.signal.aborted) setEstado({ datos, cargando: false, error: null });
      })
      .catch((e: unknown) => {
        if (control.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setEstado((anterior) => ({ datos: anterior.datos, cargando: false, error: comoErrorDeApi(e) }));
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` lo decide quien llama
  }, [...deps, version, activo]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const poner = useCallback((valor: T) => setEstado({ datos: valor, cargando: false, error: null }), []);
  return { ...estado, recargar, poner };
}

export interface Accion {
  ocupado: boolean;
  error: ErrorDeApi | null;
  /** Corre la acción; devuelve su valor, o `undefined` si falló (el error queda en `error`). Ignora un segundo clic mientras corre. */
  ejecutar<R>(f: () => Promise<R>): Promise<R | undefined>;
  limpiar(): void;
}

/** Una acción de escritura (guardar, mover, cobrar): estado de «ocupado» y error, y NUNCA se ejecuta dos veces a la vez. */
export function useAccion(): Accion {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorDeApi | null>(null);
  const corriendo = useRef(false);
  const ejecutar = useCallback(async <R,>(f: () => Promise<R>): Promise<R | undefined> => {
    if (corriendo.current) return undefined;
    corriendo.current = true;
    setOcupado(true);
    setError(null);
    try {
      return await f();
    } catch (e) {
      setError(comoErrorDeApi(e));
      return undefined;
    } finally {
      corriendo.current = false;
      setOcupado(false);
    }
  }, []);
  const limpiar = useCallback(() => setError(null), []);
  return { ocupado, error, ejecutar, limpiar };
}

/** Pone el título de la pestaña (lo lee un lector de pantalla al cambiar de pantalla). */
export function useTitulo(titulo: string): void {
  useEffect(() => {
    document.title = `${titulo} · Gestión`;
  }, [titulo]);
}

// «Ahora» para decidir en pantalla (¿ya empezó la clase?): se lee fuera del render y se refresca cada 30 s mientras haya alguien mirando.
let ahoraCompartido = Date.now();
const oyentes = new Set<() => void>();
let temporizador: number | undefined;
function suscribirAhora(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  ahoraCompartido = Date.now();
  temporizador ??= window.setInterval(() => {
    ahoraCompartido = Date.now();
    oyentes.forEach((f) => f());
  }, 30_000);
  return () => {
    oyentes.delete(alCambiar);
    if (oyentes.size === 0 && temporizador !== undefined) {
      window.clearInterval(temporizador);
      temporizador = undefined;
    }
  };
}
/** Milisegundos desde 1970 (como `Date.now()`), refrescado cada 30 s; sirve para comparar con la hora de una clase. */
export function useAhora(): number {
  return useSyncExternalStore(suscribirAhora, () => ahoraCompartido, () => ahoraCompartido);
}
