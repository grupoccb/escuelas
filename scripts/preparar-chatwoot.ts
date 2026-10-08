// Aprovisiona en Chatwoot una bandeja tipo API por cada bandeja_chatwoot de la base, le
// conecta el Agent Bot y guarda los ids de Chatwoot en la base. Idempotente: si la bandeja ya
// existe (por id o por nombre) la reutiliza.
//
// Lo corre el servicio demo-preparar de docker compose, después de chatwoot-setup. Los
// nombres de las bandejas salen de la base (invariante 2).

import { conAlcance } from "../src/datos/alcance.ts";
import { crearPrisma } from "../src/datos/prisma.ts";
import { listarOrganizaciones } from "../src/datos/sistema.ts";
import { clienteDesdeEntorno, type Bandeja } from "./lib/chatwoot.ts";

const requerida = (nombre: string): string => {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta ${nombre} (ver config/demo-local.env)`);
  return v;
};

const chatwoot = clienteDesdeEntorno();
const prisma = crearPrisma();

try {
  const cuenta = await chatwoot.cuentaPorNombre(requerida("CHATWOOT_CUENTA"));
  const bot = await chatwoot.botPorNombre(cuenta, requerida("CHATWOOT_BOT_NOMBRE"));

  for (const org of await listarOrganizaciones(prisma)) {
    const db = conAlcance(prisma, org.id);
    for (const bandeja of await db.bandeja_chatwoot.findMany({ orderBy: { creado_en: "asc" } })) {
      const existentes = (await chatwoot.bandejas(cuenta)).filter((b) => b.channel_type === "Channel::Api");
      let enChatwoot: Bandeja | undefined =
        existentes.find((b) => b.id === bandeja.chatwoot_inbox_id && bandeja.chatwoot_account_id === cuenta) ??
        existentes.find((b) => b.name === bandeja.nombre);
      const creada = !enChatwoot;
      enChatwoot ??= await chatwoot.crearBandejaApi(cuenta, bandeja.nombre);

      await chatwoot.asignarBot(cuenta, enChatwoot.id, bot);
      await db.bandeja_chatwoot.update({
        where: { id: bandeja.id },
        data: { chatwoot_account_id: cuenta, chatwoot_inbox_id: enChatwoot.id },
      });
      console.log(
        `preparar-chatwoot: ${org.nombre} / ${bandeja.nombre} → cuenta ${cuenta}, bandeja ${enChatwoot.id} (${creada ? "creada" : "existente"}), bot ${bot}`,
      );
    }
  }
} finally {
  await prisma.$disconnect();
}
