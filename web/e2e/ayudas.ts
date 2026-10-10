import { request, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { cargarMundo, rutaDeEstado } from "./mundo.ts";
import type { Rol } from "./fixtura.ts";

/** Un cliente de la API con la sesión de ese rol: para comprobar, fuera de la pantalla, que lo que se guardó llegó de verdad al servidor. */
export async function apiComo(rol: Rol): Promise<APIRequestContext> {
  return request.newContext({ baseURL: cargarMundo().base, storageState: rutaDeEstado(rol), extraHTTPHeaders: { "x-requested-with": "prueba" } });
}

export async function json<T = unknown>(api: APIRequestContext, ruta: string): Promise<T> {
  const r = await api.get(ruta);
  if (!r.ok()) throw new Error(`GET ${ruta} → ${r.status()}`);
  return (await r.json()) as T;
}

/** Una sección del registro (los `<details>`): la abre si está cerrada. */
export async function abrirSeccion(page: Page, id: string): Promise<Locator> {
  const s = page.getByTestId(`seccion-${id}`);
  await s.evaluate((d) => {
    (d as HTMLDetailsElement).open = true;
  });
  return s;
}

/** La fecha de calendario de hoy en la zona de las sucursales de prueba (Ciudad de México), `AAAA-MM-DD`. Usa el reloj de la prueba (el simulado, si hay PRUEBAS_AHORA). */
export function hoyEnMexico(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** La fecha de calendario de ayer en la zona de las sucursales de prueba (Ciudad de México), `AAAA-MM-DD`. */
export function ayerEnMexico(): string {
  const ayer = new Date(Date.now() - 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(ayer);
}

export function mananaEnMexico(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 86_400_000));
}

/** La fecha de calendario de hace `dias` días en la zona de las sucursales de prueba (Ciudad de México), `AAAA-MM-DD`. */
export function haceDiasEnMexico(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - dias * 86_400_000));
}
