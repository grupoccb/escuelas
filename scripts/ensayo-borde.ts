// Servicio `ensayo-borde` del perfil `ensayo` de docker compose (V9): la única puerta pública del ensayo con WhatsApp real. Ver
// src/mensajeria/ensayo/borde-publico.ts y docs/ENSAYO-WHATSAPP-REAL.md.

import { log } from "../src/lib/log.ts";
import { crearBordePublico } from "../src/mensajeria/ensayo/borde-publico.ts";

const destino = process.env["DESTINO"] ?? "http://backend:3000";
const puerto = Number(process.env["PORT"] ?? 3100);
const server = crearBordePublico({ destino }).listen(puerto, "0.0.0.0", () => log.info("ensayo_borde_escuchando", { puerto, destino }));
for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => server.close(() => process.exit(0)));
