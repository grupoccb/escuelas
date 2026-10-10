// Los routers de Express de este proyecto se crean AQUÍ y no con `Router()` suelto (V13-fix, EV-01). Express, por omisión, enruta sin distinguir mayúsculas de minúsculas y acepta la
// barra final: `/API/cargos` llegaba al mismo manejador que `/api/cargos` pero no caía en ninguna fila de la tabla de módulos (`src/api/modulos-rutas.ts`) y la guarda de módulos
// apagados lo dejaba pasar. Con `caseSensitive` y `strict` una ruta es EXACTAMENTE la que se declaró; lo demás es 404. `src/http/enrutador.test.ts` falla si alguien vuelve a escribir
// `Router()` sin pasar por aquí.

import { Router } from "express";

/** Un router que distingue mayúsculas y barra final (lo que pide la guarda de módulos). */
export function crearRouter(): Router {
  return Router({ caseSensitive: true, strict: true });
}
