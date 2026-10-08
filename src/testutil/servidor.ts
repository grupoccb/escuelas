// Servidor HTTP efímero para las pruebas, sin reuso de conexiones (ED-06).
//
// Las pruebas levantan un servidor por caso en un puerto libre (`listen(0)`), le hacen peticiones con el `fetch` global y lo cierran sin esperar. El
// `fetch` (undici) conserva sockets `keep-alive` por origen (`127.0.0.1:puerto`) y el sistema operativo puede darle el MISMO puerto efímero al servidor
// siguiente: la petición viaja entonces por un socket del servidor anterior (responde otra aplicación —un 404 donde se esperaba un 403— o la conexión
// ya está cerrada: «fetch failed»). Con `Connection: close` en cada respuesta el cliente abre una conexión nueva por petición y no hay nada que reusar.

import { createServer, type Server } from "node:http";
import type { Express } from "express";

export function escucharSinReuso(app: Express): Server {
  return createServer((req, res) => {
    res.setHeader("Connection", "close");
    app(req, res);
  }).listen(0);
}
