// `ensayo:preparar` contra Postgres real, un Chatwoot de administración en memoria y el Twilio falso local (V9). Idempotente, enmascara el token y se deshace.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion } from "../../testutil/semilla.ts";
import { conAlcance } from "../../datos/alcance.ts";
import { ChatwootAdminFalso } from "../../testutil/chatwoot-admin-falso.ts";
import { SID_DE_ENSAYO, TOKEN_DE_ENSAYO } from "../../testutil/ensayo.ts";
import { TwilioFalso } from "../../testutil/twilio-falso.ts";
import { leerEntornoEnsayo, type EntornoEnsayo } from "./entorno.ts";
import { ErrorDeEnsayo, SUFIJO_BANDEJA_ENSAYO, prepararEnsayo, revertirEnsayo } from "./preparar.ts";
import { TwilioApiHttp } from "./twilio-api.ts";

let prisma: PrismaPruebas;
let twilio: TwilioFalso;
let apiTwilio: TwilioApiHttp;
const NUMERO = "whatsapp:+14155238886";

before(async () => {
  prisma = crearPrismaDePruebas();
  twilio = new TwilioFalso({ sid: SID_DE_ENSAYO, token: TOKEN_DE_ENSAYO, numero: NUMERO });
  apiTwilio = new TwilioApiHttp(await twilio.iniciar());
});
after(async () => {
  await twilio.cerrar();
  await prisma.$disconnect();
});

const entornoDe = (extra: NodeJS.ProcessEnv = {}): EntornoEnsayo => {
  const { entorno, problemas } = leerEntornoEnsayo({
    ENSAYO_LOCAL: "si",
    TWILIO_ACCOUNT_SID: SID_DE_ENSAYO,
    TWILIO_AUTH_TOKEN: TOKEN_DE_ENSAYO,
    TWILIO_WHATSAPP_NUMERO: "+14155238886",
    ORIGEN_PUBLICO: "https://ensayo-uno.example.test",
    ENSAYO_TWILIO_BLOQUEO_PREFIJO: "apagado-",
    CHATWOOT_URL_HOST: "http://localhost:3001",
    CHATWOOT_ADMIN_TOKEN: "token-admin",
    CHATWOOT_CUENTA: "Demo local",
    CHATWOOT_BOT_NOMBRE: "Bot",
    CHATWOOT_WEBHOOK_SECRETO: "secreto",
    ...extra,
  });
  assert.deepEqual(problemas, []);
  return entorno!;
};

/** Una escuela con su bandeja de la demo (tipo API) ya en Chatwoot y en la base. Solo una organización viva a la vez para esta prueba: se aísla con un prisma que solo la ve. */
async function escuela() {
  const org = await sembrarOrganizacion(prisma, "Ensayo preparar");
  const base = randomInt(1_000_000, 1_900_000_000);
  const chatwoot = new ChatwootAdminFalso([], { cuenta: base, primerId: base + 100 });
  const api = { id: base + 41, name: "Vertical Prueba", channel_type: "Channel::Api" };
  chatwoot.lista.push(api);
  await prisma.bandeja_chatwoot.update({ where: { id: org.bandejaId }, data: { chatwoot_account_id: chatwoot.cuenta, chatwoot_inbox_id: api.id } });
  await prisma.canal_whatsapp.updateMany({ where: { numero_whatsapp: NUMERO }, data: { numero_whatsapp: null } });
  return { org, chatwoot, db: conAlcance(prisma, org.organizacionId) };
}

const escuelaApi = async (chatwoot: ChatwootAdminFalso): Promise<number> => chatwoot.lista.find((b) => b.channel_type === "Channel::Api")!.id;

/** `prepararEnsayo` recorre la primera organización de la base; las de otras pruebas ya existen, así que se apunta a la de esta con un envoltorio que solo la deja ver. */
function soloEsta(orgId: string) {
  const original = prisma;
  return new Proxy(original, {
    get(objetivo, propiedad, receptor) {
      if (propiedad === "organizacion") {
        return new Proxy(objetivo.organizacion, {
          get(o, p) {
            if (p === "findMany") return (a: object) => (o.findMany as (x: object) => unknown)({ ...a, where: { id: orgId } });
            return Reflect.get(o, p);
          },
        });
      }
      return Reflect.get(objetivo, propiedad, receptor);
    },
  });
}

test("prepara: crea la bandeja de Twilio, el número en el canal y apunta la bandeja de la base; dice qué pegar en la consola y enmascara el token", async () => {
  const { org, chatwoot, db } = await escuela();
  const resumen = await prepararEnsayo({ prisma: soloEsta(org.organizacionId), entorno: entornoDe(), chatwoot, twilio: apiTwilio });
  assert.equal(resumen.chatwoot.estado, "creada");
  assert.equal(resumen.consolaTwilio.cuandoLlegaUnMensaje, "https://ensayo-uno.example.test/webhooks/twilio/entrantes");
  assert.equal(resumen.consolaTwilio.urlDeEstados, "https://ensayo-uno.example.test/webhooks/twilio/estados");
  assert.equal(resumen.tokenEnmascarado, `****${TOKEN_DE_ENSAYO.slice(-4)}`);
  assert.ok(!JSON.stringify(resumen).includes(TOKEN_DE_ENSAYO), "el resumen no lleva el token");

  const canal = await db.canal_whatsapp.findFirstOrThrow({ where: { id: org.canalId } });
  assert.equal(canal.numero_whatsapp, NUMERO);
  const bandeja = await db.bandeja_chatwoot.findFirstOrThrow({ where: { id: org.bandejaId } });
  const twilioInbox = chatwoot.lista.find((b) => b.channel_type === "Channel::TwilioSms")!;
  assert.equal(twilioInbox.name, `Vertical Prueba${SUFIJO_BANDEJA_ENSAYO}`);
  assert.equal(bandeja.chatwoot_inbox_id, twilioInbox.id);
  assert.ok(chatwoot.llamadas.includes(`bot:${twilioInbox.id}`) && chatwoot.llamadas.includes(`sin-asignacion:${twilioInbox.id}`));
  assert.deepEqual(chatwoot.credenciales.get(twilioInbox.id), { sid: SID_DE_ENSAYO, token: TOKEN_DE_ENSAYO });
  assert.ok(twilio.autenticaciones.some((a) => a.ok), "se comprobaron las credenciales contra el Twilio falso");
});

test("es idempotente: la segunda vez no crea otra bandeja y solo actualiza las credenciales; con otra URL pública cambia lo que el resumen manda pegar", async () => {
  const { org, chatwoot, db } = await escuela();
  const prismaEsta = soloEsta(org.organizacionId);
  await prepararEnsayo({ prisma: prismaEsta, entorno: entornoDe(), chatwoot, twilio: apiTwilio });
  const segunda = await prepararEnsayo({ prisma: prismaEsta, entorno: entornoDe({ ORIGEN_PUBLICO: "https://ensayo-dos.example.test" }), chatwoot, twilio: apiTwilio });
  assert.equal(chatwoot.lista.filter((b) => b.channel_type === "Channel::TwilioSms").length, 1);
  assert.equal(segunda.chatwoot.estado, "credenciales actualizadas");
  assert.deepEqual(segunda.cambios, [], "nada cambió en la base");
  assert.equal(segunda.consolaTwilio.cuandoLlegaUnMensaje, "https://ensayo-dos.example.test/webhooks/twilio/entrantes");
  assert.equal((await db.canal_whatsapp.findMany({ where: { numero_whatsapp: NUMERO } })).length, 1);
});

test("con credenciales malas dice qué revisar y no repite el token; con --ver (soloVer) no escribe nada", async () => {
  const { org, chatwoot, db } = await escuela();
  const prismaEsta = soloEsta(org.organizacionId);
  await assert.rejects(
    prepararEnsayo({ prisma: prismaEsta, entorno: entornoDe({ TWILIO_AUTH_TOKEN: "un-token-equivocado-de-prueba-1234" }), chatwoot, twilio: apiTwilio }),
    (e: Error) => e instanceof ErrorDeEnsayo && /Twilio no aceptó las credenciales/.test(e.message) && /TWILIO_AUTH_TOKEN/.test(e.message) && !e.message.includes("un-token-equivocado"),
  );
  const seco = await prepararEnsayo({ prisma: prismaEsta, entorno: entornoDe(), chatwoot, twilio: apiTwilio, soloVer: true });
  assert.ok(seco.cambios.length >= 2, "dice qué cambiaría");
  assert.equal((await db.canal_whatsapp.findFirstOrThrow({ where: { id: org.canalId } })).numero_whatsapp, null);
  assert.equal(chatwoot.lista.filter((b) => b.channel_type === "Channel::TwilioSms").length, 0);
});

test("si Chatwoot no puede crear la bandeja explica la causa probable (el bloqueo de Twilio) sin imprimir el token", async () => {
  const { org, chatwoot } = await escuela();
  chatwoot.fallarAlCrear = `Chatwoot POST … → 422: no se pudo autenticar con ${TOKEN_DE_ENSAYO}`;
  await assert.rejects(
    prepararEnsayo({ prisma: soloEsta(org.organizacionId), entorno: entornoDe(), chatwoot, twilio: apiTwilio }),
    (e: Error) => /ENSAYO_TWILIO_BLOQUEO_PREFIJO/.test(e.message) && !e.message.includes(TOKEN_DE_ENSAYO),
  );
});

test("un número que ya tiene otro canal no se pisa", async () => {
  const { org, chatwoot } = await escuela();
  const otra = await prisma.canal_whatsapp.create({ data: { organizacion_id: org.organizacionId, vertical_id: org.verticalId, nombre_publico: "Otro canal", numero_whatsapp: NUMERO } });
  const aislada = await prisma.canal_whatsapp.findFirstOrThrow({ where: { id: otra.id } });
  assert.equal(aislada.numero_whatsapp, NUMERO);
  await assert.rejects(prepararEnsayo({ prisma: soloEsta(org.organizacionId), entorno: entornoDe({ ENSAYO_CANAL: "Canal de prueba" }), chatwoot, twilio: apiTwilio }), /ya está en otro canal/);
  await prisma.canal_whatsapp.update({ where: { id: otra.id }, data: { numero_whatsapp: null, eliminado_en: new Date() } });
});

test("regresar al modo simulado: quita el número, vuelve a la bandeja de la demo y no borra nada en Chatwoot", async () => {
  const { org, chatwoot, db } = await escuela();
  const prismaEsta = soloEsta(org.organizacionId);
  await prepararEnsayo({ prisma: prismaEsta, entorno: entornoDe(), chatwoot, twilio: apiTwilio });
  const antes = chatwoot.lista.length;
  const r = await revertirEnsayo({ prisma: prismaEsta, chatwoot, cuentaNombre: "Demo local" });
  assert.deepEqual(r.canales, ["Canal de prueba"]);
  assert.equal((await db.canal_whatsapp.findFirstOrThrow({ where: { id: org.canalId } })).numero_whatsapp, null);
  assert.equal((await db.bandeja_chatwoot.findFirstOrThrow({ where: { id: org.bandejaId } })).chatwoot_inbox_id, await escuelaApi(chatwoot));
  assert.equal(chatwoot.lista.length, antes, "la bandeja de Twilio sigue en Chatwoot");
  // Una segunda vez no encuentra nada que deshacer.
  assert.deepEqual((await revertirEnsayo({ prisma: prismaEsta, chatwoot, cuentaNombre: "Demo local" })).canales, []);
  // Y se puede volver a ensayar.
  assert.equal((await prepararEnsayo({ prisma: prismaEsta, entorno: entornoDe(), chatwoot, twilio: apiTwilio })).chatwoot.estado, "credenciales actualizadas");
});
