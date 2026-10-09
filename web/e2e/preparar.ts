import { request } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { cargarMundo, RAIZ, rutaDeEstado } from "./mundo.ts";

/** Antes de las pruebas: una sesión guardada por rol (por la API), para que cada prueba no repita el inicio de sesión en pantalla. */
export default async function preparar(): Promise<void> {
  // El servidor de pruebas borra `mundo.json` al arrancar y lo escribe al terminar de sembrar: hasta entonces no hay mundo (el servidor ya contesta `/salud`).
  const archivo = resolve(RAIZ, ".tmp/navegador/mundo.json");
  const limite = Date.now() + 180_000;
  while (!existsSync(archivo)) {
    if (Date.now() > limite) throw new Error("El servidor de pruebas no terminó de sembrar su mundo en 3 minutos");
    await new Promise((r) => setTimeout(r, 250));
  }
  const mundo = cargarMundo();
  mkdirSync(rutaDeEstado("x").replace(/estado-x\.json$/, ""), { recursive: true });
  for (const rol of ["administrador", "asesor", "maestro", "recepcion"] as const) {
    const u = mundo.usuarios[rol];
    const contexto = await request.newContext({ baseURL: mundo.base });
    const r = await contexto.post("/api/sesion", { data: { organizacion: mundo.organizacion.slug, correo: u.correo, contrasena: u.contrasena }, headers: { "x-requested-with": "preparar" } });
    if (r.status() !== 201) throw new Error(`No se pudo iniciar sesión como ${rol}: ${r.status()}`);
    await contexto.storageState({ path: rutaDeEstado(rol) });
    await contexto.dispose();
  }
}
