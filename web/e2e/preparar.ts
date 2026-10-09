import { request } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { cargarMundo, rutaDeEstado } from "./mundo.ts";

/** Antes de las pruebas: una sesión guardada por rol (por la API), para que cada prueba no repita el inicio de sesión en pantalla. */
export default async function preparar(): Promise<void> {
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
