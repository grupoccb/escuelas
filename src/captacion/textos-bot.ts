// Lector único de los mensajes del bot que la escuela personalizó (V5): lee `texto_bot` por el scope (invariante 1) y devuelve solo lo que cambió, por clave del catálogo.
// Un texto de una clave que ya no existe, o que ya no pasa la validación, se ignora: el bot dice el de siempre antes que mandar algo roto a una familia.

import type { Consultas } from "../datos/alcance.ts";
import { esClaveDeTexto, problemaDeTexto, type TextosPersonalizados } from "./textos.ts";

export async function leerTextosPersonalizados(db: Consultas): Promise<TextosPersonalizados> {
  const filas = await db.texto_bot.findMany({ select: { clave: true, texto: true }, orderBy: [{ clave: "asc" }] });
  const salida: TextosPersonalizados = {};
  for (const f of filas) if (esClaveDeTexto(f.clave) && problemaDeTexto(f.clave, f.texto) === null) salida[f.clave] = f.texto.trim();
  return salida;
}
