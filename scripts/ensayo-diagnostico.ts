// `npm run ensayo:diagnostico` (V9): en unos segundos dice con ✔ / ✘ qué está bien y qué falta del ensayo con WhatsApp real, y qué hacer. No manda ningún
// mensaje. Mira Docker (dentro de Chatwoot) y la base solo para leer. Ver src/mensajeria/ensayo/diagnostico.ts y docs/ENSAYO-WHATSAPP-REAL.md.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { conAlcance } from "../src/datos/alcance.ts";
import { crearPrisma } from "../src/datos/prisma.ts";
import { listarOrganizaciones } from "../src/datos/sistema.ts";
import { diagnosticar, formatearDiagnostico } from "../src/mensajeria/ensayo/diagnostico.ts";
import { ClienteChatwoot } from "./lib/chatwoot.ts";

const ejecutar = promisify(execFile);

const chatwootUrl = process.env["CHATWOOT_URL_HOST"] ?? "http://localhost:3001";
const cuenta = process.env["CHATWOOT_CUENTA"];
const tokenAdmin = process.env["CHATWOOT_ADMIN_TOKEN"];

const comprobaciones = await diagnosticar(
  process.env,
  {
    fetch,
    async dentroDeChatwoot() {
      try {
        const { stdout } = await ejecutar("docker", ["compose", "exec", "-T", "chatwoot", "sh", "-c", 'getent hosts api.twilio.com | cut -d" " -f1 | head -1; echo "FRONTEND_URL=$FRONTEND_URL"'], { timeout: 6000 });
        const lineas = stdout.split("\n").map((l) => l.trim());
        const ip = lineas.find((l) => /^[0-9a-f.:]+$/i.test(l) && l.length > 0) ?? null;
        const frontend = lineas.find((l) => l.startsWith("FRONTEND_URL="))?.slice("FRONTEND_URL=".length) ?? null;
        return { ipDeApiTwilio: ip, frontendUrl: frontend };
      } catch {
        return null;
      }
    },
    async bandejaTwilio(numero) {
      if (!cuenta || !tokenAdmin) return null;
      const prisma = crearPrisma(process.env["DATABASE_URL"] ?? "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones");
      try {
        const cw = new ClienteChatwoot({ url: chatwootUrl, tokenAdmin });
        const bandejas = await cw.bandejas(await cw.cuentaPorNombre(cuenta));
        const solo = numero.replace(/^whatsapp:/, "");
        const enChatwoot = bandejas.some((b) => b.channel_type === "Channel::TwilioSms" && (b.phone_number ?? "").replace(/^whatsapp:/, "") === solo);
        let enBase = false;
        for (const org of await listarOrganizaciones(prisma)) {
          const canales = await conAlcance(prisma, org.id).canal_whatsapp.findMany({ where: { numero_whatsapp: numero } });
          if (canales.length > 0) enBase = true;
        }
        return { enChatwoot, enBase };
      } finally {
        await (prisma as unknown as { $disconnect(): Promise<void> }).$disconnect();
      }
    },
  },
  { backendUrl: process.env["BACKEND_URL_HOST"] ?? "http://localhost:3000" },
);

const { texto, todoBien } = formatearDiagnostico(comprobaciones);
console.log(texto);
process.exit(todoBien ? 0 : 1);
