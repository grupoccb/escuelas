// Servidor HTTP efímero para las pruebas, sin reuso de conexiones (ED-06) y siempre en el loopback (EG-08).
//
// Las pruebas levantan un servidor por caso en un puerto libre, le hacen peticiones con el `fetch` global y lo cierran sin esperar. El `fetch` (undici)
// conserva sockets `keep-alive` por origen (`127.0.0.1:puerto`) y el sistema operativo puede darle el MISMO puerto efímero al servidor siguiente: la
// petición viaja entonces por un socket del servidor anterior (responde otra aplicación —un 404 donde se esperaba un 403— o la conexión ya está cerrada:
// «fetch failed»). Con `Connection: close` en cada respuesta el cliente abre una conexión nueva por petición y no hay nada que reusar.
//
// EG-08 (la causa raíz de EF-17): el servidor escucha en `127.0.0.1`, NUNCA en el comodín (`listen(0)`). En macOS un servidor del comodín puede recibir un
// puerto que otro proceso YA tiene en `127.0.0.1` —otra prueba que corre en paralelo, o cualquier programa de la máquina que escuche en el loopback (se vio
// con los procesos auxiliares de un editor)— y las peticiones a `127.0.0.1:puerto` llegan a ese otro proceso: un 404 ajeno, o un servidor que nunca contesta
// («Headers Timeout» tras 300 s). Al revés no pasa: el sistema no asigna a un servidor de `127.0.0.1` un puerto que ya tenga alguien en el comodín. Con una
// dirección explícita, el puerto de `listen(0, "127.0.0.1")` siempre es uno libre PARA ESA DIRECCIÓN. (`servidor.test.ts` impide que vuelva el comodín.)
//
// Costo: con una dirección explícita Node resuelve la dirección de forma asíncrona, así que el puerto se conoce hasta el evento `listening`: usa `puertoDe`.

import { createServer, type Server } from "node:http";
import type { Express } from "express";

export function escucharSinReuso(app: Express): Server {
  return createServer((req, res) => {
    res.setHeader("Connection", "close");
    app(req, res);
  }).listen(0, "127.0.0.1");
}

/** El puerto del servidor, cuando ya escucha. */
export function puertoDe(server: Server): Promise<number> {
  return new Promise<number>((resolver, rechazar) => {
    const listo = (): void => {
      const a = server.address();
      if (a !== null && typeof a === "object") resolver(a.port);
      else rechazar(new Error("El servidor de prueba no escucha en un puerto"));
    };
    if (server.listening) listo();
    else {
      server.once("listening", listo);
      server.once("error", rechazar);
    }
  });
}
