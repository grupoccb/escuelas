// El ensayo con WhatsApp real, de punta a punta y sin nada real (V9): Twilio FALSO (firma contra la URL pública del «túnel») → borde del backend → Chatwoot FALSO
// (con su parte de Twilio) → Agent Bot → bot → Chatwoot → Twilio falso → estados por callback → base. Todo detrás de los adaptadores (invariantes 4 y 11).

import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../testutil/prisma-pruebas.ts";
import { montarEnsayo, SANDBOX, TOKEN_DE_ENSAYO, URL_PUBLICA, type EscenarioEnsayo } from "../../testutil/ensayo.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const telefono = (): string => `5255${randomInt(10_000_000, 99_999_999)}`;
const ENTRANTES = "/webhooks/twilio/entrantes";

async function conEscenario(fn: (e: EscenarioEnsayo) => Promise<void>, opciones: Parameters<typeof montarEnsayo>[1] = {}): Promise<void> {
  const e = await montarEnsayo(prisma, opciones);
  try {
    await fn(e);
  } finally {
    await e.cerrar();
  }
}

/** Escribe como la familia, por el túnel, y espera a que todo el sistema termine de reaccionar. */
async function escribe(e: EscenarioEnsayo, desde: string, texto: string, sid?: string): Promise<{ status: number; sid: string }> {
  const r = await e.twilio.entrante({ desde: `+${desde}`, cuerpo: texto, ...(sid ? { sid } : {}) });
  await e.chatwoot.vaciar();
  return { status: r.status, sid: r.sid };
}

test("el recorrido completo: llega el mensaje, contesta el bot, aparece la nota, responde el asesor y se guardan los estados de entrega", async () => {
  await conEscenario(async (e) => {
    const tel = `521${telefono().slice(2)}`; // +521…: así lo manda WhatsApp
    // 1. Llega el mensaje (firmado con la URL pública) y el bot contesta por Chatwoot → Twilio.
    const hola = await escribe(e, tel, "Hola");
    assert.equal(hola.status, 200);
    assert.equal(e.chatwoot.recibidoDeTwilio.filter((r) => r.ruta === "/twilio/callback").length, 1);
    assert.ok(e.twilio.mensajes.length >= 1, "el bot saludó por Twilio");
    const saludo = e.twilio.mensajes[0]!;
    assert.equal(saludo.to, `whatsapp:+${tel}`);
    assert.equal(saludo.from, SANDBOX);
    assert.equal(saludo.statusCallback, `${URL_PUBLICA}/twilio/delivery_status`, "Chatwoot pide los estados a la URL pública, que cae en el borde");

    // 2. Los estados de entrega llegan por el borde (firmados), pasan por Chatwoot y se guardan.
    for (const estado of ["sent", "delivered", "read"] as const) {
      const r = await e.twilio.estado(saludo.sid, estado);
      assert.equal(r.status, 200, estado);
      await e.chatwoot.vaciar();
    }
    const conv = e.chatwoot.conversaciones[0]!;
    const guardado = await e.db.mensaje.findFirstOrThrow({ where: { direccion: "saliente", id_proveedor: saludo.sid } });
    assert.equal(guardado.estatus, "leido");
    assert.ok(guardado.entregado_en && guardado.leido_en, "se guardaron las horas de entrega y de lectura");

    // 3. La conversación sigue: nombre, edad y sucursal; al final, la nota para el asesor.
    for (const t of ["Sofía", "8", "2"]) await escribe(e, tel, t);
    const notas = e.chatwoot.notas(conv.id);
    assert.equal(notas.length, 1, "aparece la nota en Chatwoot");
    assert.match(notas[0]!, /Nombre: Sofía/);
    assert.equal(e.chatwoot.conversaciones[0]!.estado, "open", "la conversación pasó a los asesores");

    // 4. El asesor responde desde Chatwoot: llega al celular por Twilio.
    const antes = e.twilio.mensajes.length;
    await e.chatwoot.asesorResponde(conv.id, "Hola, soy Laura, de la escuela.");
    const respuesta = e.twilio.mensajes[antes]!;
    assert.equal(respuesta.to, `whatsapp:+${tel}`);
    assert.equal(respuesta.body, "Hola, soy Laura, de la escuela.");
    assert.equal((await e.twilio.estado(respuesta.sid, "delivered")).status, 200, "el estado de lo que escribió el asesor también entra, sin error");
    await e.chatwoot.vaciar();

    // 5. La atención humana bloquea al bot: lo que la familia escribe ahora no lo contesta el sistema.
    const salientesAntes = e.twilio.mensajes.length;
    await escribe(e, tel, "¿A qué hora es la clase?");
    assert.equal(e.twilio.mensajes.length, salientesAntes, "con una persona atendiendo el bot calla");
    const conversacion = await e.db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: conv.id } });
    assert.equal(conversacion.estado, "en_atencion_humana");
  });
});

test("un estado fallido de Twilio (número fuera de la ventana de 24 h) se guarda como fallido, con su código", async () => {
  await conEscenario(async (e) => {
    const tel = telefono();
    await escribe(e, tel, "Hola");
    const m = e.twilio.mensajes[0]!;
    assert.equal((await e.twilio.estado(m.sid, "failed", { codigoError: 63016 })).status, 200);
    await e.chatwoot.vaciar();
    const guardado = await e.db.mensaje.findFirstOrThrow({ where: { direccion: "saliente", id_proveedor: m.sid } });
    assert.equal(guardado.estatus, "fallido");
    assert.equal(guardado.error_codigo, 63016);
  });
});

test("una falla de la API de Twilio al enviar (inyectada) no se pierde: el mensaje queda fallido y el sistema sigue vivo", async () => {
  await conEscenario(async (e) => {
    e.twilio.fallarProximoEnvio({ status: 400, codigo: 63016, mensaje: "Fuera de la ventana de 24 h" });
    const tel = telefono();
    const r = await escribe(e, tel, "Hola");
    assert.equal(r.status, 200);
    const salientes = e.chatwoot.salientes();
    assert.equal(salientes[0]!.estado, "failed", "Twilio rechazó el primer envío y Chatwoot lo marcó fallido");
    assert.match(salientes[0]!.errorExterno ?? "", /63016/);
    const guardados = await e.db.mensaje.findMany({ where: { direccion: "saliente" }, orderBy: { secuencia: "asc" } });
    assert.equal(guardados[0]!.estatus, "fallido", "el sistema guardó el fallo");
    assert.equal(guardados[0]!.error_codigo, 63016);
    // El siguiente mensaje de la familia se atiende con normalidad.
    const r2 = await escribe(e, tel, "Hola otra vez");
    assert.equal(r2.status, 200);
  });
});

test("la firma se calcula con la URL PÚBLICA: la local, la sin firma y la de otro token se rechazan con un diagnóstico en español y sin secretos", async () => {
  await conEscenario(async (e) => {
    const lineas: string[] = [];
    const registro = mock.method(console, "log", (...args: unknown[]) => void lineas.push(args.map(String).join(" ")));
    try {
      const tel = telefono();
      const conLocal = await e.twilio.entrante({ desde: `+${tel}`, cuerpo: "Hola", firmarCon: `${e.urlLocal}${ENTRANTES}` });
      const sinFirma = await e.twilio.entrante({ desde: `+${tel}`, cuerpo: "Hola", sinFirma: true });
      const otroToken = await e.twilio.entrante({ desde: `+${tel}`, cuerpo: "Hola", token: "otro-token-que-no-es-el-de-la-cuenta" });
      assert.deepEqual([conLocal.status, sinFirma.status, otroToken.status], [403, 403, 403]);
      await e.chatwoot.vaciar();
      assert.equal(e.chatwoot.recibidoDeTwilio.length, 0, "nada se reenvió a Chatwoot");
    } finally {
      registro.mock.restore();
    }
    const rechazos = lineas.map((l) => JSON.parse(l) as { evento: string; ruta: string; url_esperada: string; pistas: string[] }).filter((l) => l.evento === "webhook_twilio_rechazado");
    assert.equal(rechazos.length, 3);
    for (const r of rechazos.filter((x) => x.pistas.some((p) => p.includes("La firma no coincide")))) {
      assert.equal(r.url_esperada, `${URL_PUBLICA}${ENTRANTES}`);
      assert.ok(r.pistas.some((p) => p.includes(`revisa que la URL configurada en Twilio sea exactamente ${URL_PUBLICA}${ENTRANTES}`)));
    }
    assert.ok(rechazos.some((r) => r.pistas.some((p) => p.includes("no trae X-Twilio-Signature"))), "el rechazo sin firma lo dice");
    const todo = lineas.join("\n");
    assert.ok(!todo.includes(TOKEN_DE_ENSAYO), "el token no sale en el log");
    assert.ok(!todo.includes("otro-token-que-no-es-el-de-la-cuenta"));
  });
});

test("si el backend cree tener otra URL pública (la local, o el túnel viejo), lo dice en el log y rechaza", async () => {
  await conEscenario(
    async (e) => {
      const lineas: string[] = [];
      const registro = mock.method(console, "log", (...args: unknown[]) => void lineas.push(args.map(String).join(" ")));
      try {
        const r = await e.twilio.entrante({ desde: `+${telefono()}`, cuerpo: "Hola" }); // Twilio firma con la URL pública buena
        assert.equal(r.status, 403);
      } finally {
        registro.mock.restore();
      }
      const rechazo = JSON.parse(lineas.find((l) => l.includes("webhook_twilio_rechazado"))!) as { pistas: string[]; url_esperada: string };
      assert.equal(rechazo.url_esperada, `http://localhost:3000${ENTRANTES}`);
      assert.ok(rechazo.pistas.some((p) => p.includes("apunta a esta máquina")));
      assert.ok(rechazo.pistas.some((p) => p.includes("no es https")));
    },
    { urlPublicaDelBackend: "http://localhost:3000" },
  );
});

test("detrás del túnel el esquema y el host que ve el servidor no cambian contra qué se firma (aunque se confíe en el proxy)", async () => {
  await conEscenario(async (e) => {
    const tel = telefono();
    const r = await e.twilio.entrante({ desde: `+${tel}`, cuerpo: "Hola", sid: `SM${randomInt(1e9)}a`, extra: {} }).then(async (x) => {
      await e.chatwoot.vaciar();
      return x;
    });
    assert.equal(r.status, 200);
    // Mismo mensaje con cabeceras de túnel que dicen otra cosa: la firma sigue siendo contra la URL configurada.
    const params = { MessageSid: `SM${randomInt(1e9)}b`, From: `whatsapp:+${tel}`, To: SANDBOX, Body: "otra vez", AccountSid: "x" };
    const conCabeceras = await e.twilio.llamar(`${URL_PUBLICA}${ENTRANTES}`, params, { cabeceras: { "x-forwarded-proto": "http", "x-forwarded-host": "otro.example.test" } });
    assert.equal(conCabeceras.status, 200);
  });
});

test("un reintento de Twilio con el mismo MessageSid llega UNA sola vez a Chatwoot y el bot no contesta dos veces", async () => {
  await conEscenario(async (e) => {
    const tel = telefono();
    const sid = `SM${randomInt(1e9)}${randomInt(1e9)}`;
    const a = await escribe(e, tel, "Hola", sid);
    const saludos = e.twilio.mensajes.length;
    assert.ok(saludos >= 1);
    const b = await escribe(e, tel, "Hola", sid);
    const c = await escribe(e, tel, "Hola", sid);
    assert.deepEqual([a.status, b.status, c.status], [200, 200, 200]);
    assert.equal(e.chatwoot.recibidoDeTwilio.filter((r) => r.ruta === "/twilio/callback").length, 1);
    assert.equal(e.chatwoot.mensajes.filter((m) => m.tipo === "entrante").length, 1);
    assert.equal(e.twilio.mensajes.length, saludos, "los reintentos no hicieron contestar de nuevo al bot");
    // Y un estado repetido tampoco se reenvía dos veces.
    const m = e.twilio.mensajes[0]!;
    await e.twilio.estado(m.sid, "delivered");
    await e.twilio.estado(m.sid, "delivered");
    await e.chatwoot.vaciar();
    assert.equal(e.chatwoot.recibidoDeTwilio.filter((r) => r.ruta === "/twilio/delivery_status" && r.params["MessageStatus"] === "delivered").length, 1);
  });
});

test("el mismo celular escribiendo con +521 y con +52 es UN solo lead, aunque Chatwoot los vea como dos contactos", async () => {
  await conEscenario(async (e) => {
    const nacional = telefono().slice(2); // 10 dígitos
    await escribe(e, `521${nacional}`, "Hola");
    await escribe(e, `52${nacional}`, "Hola de nuevo");
    assert.equal(e.chatwoot.conversaciones.length, 2, "Chatwoot trata +521 y +52 como contactos distintos (H3)");
    const leads = await e.db.lead.findMany({ where: { telefono: `+52${nacional}` } });
    assert.equal(leads.length, 1, "el sistema los une con normalizarTelefono()");
    const conversaciones = await e.db.conversacion.findMany({ where: { lead_id: leads[0]!.id } });
    assert.ok(conversaciones.length >= 1);
  });
});

test("BAJA: el sistema registra la baja, confirma una vez y deja de escribir", async () => {
  await conEscenario(async (e) => {
    const tel = `521${telefono().slice(2)}`;
    await escribe(e, tel, "Hola");
    const antes = e.twilio.mensajes.length;
    await escribe(e, tel, "BAJA");
    const confirmacion = e.twilio.mensajes.slice(antes);
    assert.equal(confirmacion.length, 1, "una sola confirmación de la baja");
    const baja = await e.db.consentimiento.findFirstOrThrow({ where: { telefono: `+52${tel.slice(3)}` } });
    assert.equal(baja.estado, "opt_out");
    // Después, aunque la familia escriba, el sistema no le manda nada más.
    const despues = e.twilio.mensajes.length;
    await escribe(e, tel, "Hola, ¿siguen ahí?");
    await escribe(e, tel, "BAJA");
    assert.equal(e.twilio.mensajes.length, despues, "ya no escribe");
    const conv = await e.db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: e.chatwoot.conversaciones[0]!.id } });
    assert.ok(["opt_out", "en_atencion_humana"].includes(conv.estado), `estado: ${conv.estado}`);
  });
});

test("el alias /twilio/delivery_status cumple lo mismo que /webhooks/twilio/estados: firma, y solo POST", async () => {
  await conEscenario(async (e) => {
    const tel = telefono();
    await escribe(e, tel, "Hola");
    const m = e.twilio.mensajes[0]!;
    const mala = await e.twilio.estado(m.sid, "delivered", { firmarCon: `${e.urlLocal}/twilio/delivery_status` });
    assert.equal(mala.status, 403);
    const get = await fetch(`${e.urlLocal}/twilio/delivery_status`);
    assert.notEqual(get.status, 200);
    await get.arrayBuffer();
    const buena = await e.twilio.estado(m.sid, "delivered");
    assert.equal(buena.status, 200);
  });
});

test("/webhooks/twilio/diagnostico responde 200 a una firma buena y 403 a una mala, sin tocar la base ni Chatwoot", async () => {
  await conEscenario(async (e) => {
    const buena = await e.twilio.llamar(`${URL_PUBLICA}/webhooks/twilio/diagnostico`, { Diagnostico: "1" });
    assert.equal(buena.status, 200);
    assert.deepEqual(JSON.parse(buena.texto), { ok: true });
    const mala = await e.twilio.llamar(`${URL_PUBLICA}/webhooks/twilio/diagnostico`, { Diagnostico: "1" }, { firmarCon: `${e.urlLocal}/webhooks/twilio/diagnostico` });
    assert.equal(mala.status, 403);
    assert.equal(e.chatwoot.recibidoDeTwilio.length, 0);
  });
});

test("por el borde público del ensayo (la puerta del túnel) el recorrido funciona igual, y lo que no es de Twilio no se alcanza", async () => {
  await conEscenario(
    async (e) => {
      const tel = telefono();
      const hola = await escribe(e, tel, "Hola");
      assert.equal(hola.status, 200);
      const m = e.twilio.mensajes[0]!;
      assert.equal((await e.twilio.estado(m.sid, "delivered")).status, 200);
      await e.chatwoot.vaciar();
      assert.equal((await e.db.mensaje.findFirstOrThrow({ where: { id_proveedor: m.sid } })).estatus, "entregado");
      // Con el borde de por medio la firma sigue siendo contra la URL pública: la del borde (local) falla.
      const mala = await e.twilio.entrante({ desde: `+${tel}`, cuerpo: "Hola", firmarCon: `${e.urlBordePublico}${ENTRANTES}` });
      assert.equal(mala.status, 403);
      // Desde afuera no se llega a la interfaz, a /api ni a Chatwoot.
      for (const ruta of ["/", "/api/yo", "/metricas", "/webhooks/chatwoot", "/l/lo-que-sea"]) {
        const r = await fetch(`${e.urlBordePublico}${ruta}`);
        await r.arrayBuffer();
        assert.equal(r.status, 404, ruta);
      }
      const salud = await fetch(`${e.urlBordePublico}/salud`);
      assert.equal(salud.status, 200);
      await salud.arrayBuffer();
    },
    { porBordePublico: true },
  );
});
