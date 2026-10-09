// K2 / ED-08: el ORDEN de los candados. El bot (un mensaje del contacto que elige la fecha de su clase muestra) toma el lead y luego el grupo; la API (un asesor
// que agenda esa misma clase) tomaba el grupo y luego el lead. Dos transacciones sobre el MISMO lead y el MISMO grupo a la vez se esperaban en cruz: Postgres abortaba
// una (40P01) y, si era la del bot, el mensaje de la familia se perdía.
//
// El test FUERZA el choque: cada lado se detiene, con su primer candado en la mano, hasta que el otro también tiene el suyo (o se cansa de esperar, que es lo que
// pasa cuando el orden es el mismo y uno espera al otro). Debe pasar con cualquiera de los dos desenlaces siempre que NADIE termine en interbloqueo.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { procesarEntrante } from "../captacion/entrante.ts";
import { MessagingProvider, type EventoEntrante } from "../mensajeria/index.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { escenarioBot } from "../testutil/bot.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 20);
});
after(async () => {
  await prisma.$disconnect();
});

// Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México. El grupo da clase los lunes a las 16:00 (22:00 UTC).
const AHORA = new Date("2026-11-02T18:00:00Z");
const SESION = (dias: number): Date => new Date(new Date("2026-11-02T22:00:00Z").getTime() + dias * 86_400_000);

test("ED-08: el bot elige fecha y un asesor agenda la MISMA clase a la vez, con los candados forzados en cruz → ningún interbloqueo, ningún 5xx, una sola clase", async () => {
  const logs = colectarLogs();
  try {
    for (let ronda = 0; ronda < 3; ronda++) {
      const base = await escenarioBot(prisma, {
        claseMuestra: true,
        embudo: true,
        programas: [{ sucursal: 0, nombre: "Programa uno", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: 5, horarios: [[1, 960, 1020]] }], precio: { inscripcion: "500.00", mensualidad: "300.00" } }],
      });
      const c = base.contacto();
      for (const t of ["Hola", "Luis", "8", "1", "1"]) await c.escribe(t, AHORA);
      const conv = await c.conversacion();
      const prospecto = await base.db.prospecto.findFirstOrThrow({ where: { lead_id: conv.lead_id } });
      const grupoId = base.programas[0]!.grupos[0]!.id;

      // Cada lado, con su primer candado: el bot, el lead (`lead.update` de registrarYAvanzar); la API, el grupo (`bloquearCupoDeGrupo`) o, ya arreglado, el lead.
      const barrera = new Barrera(2);
      let botEsperó = false;
      let apiEsperó = false;
      const prismaBot = conGanchos(prisma, {
        modelo: "lead",
        operacion: "update",
        cuando: (a) => JSON.stringify(a["where"]).includes(conv.lead_id) && !botEsperó,
        despues: async () => {
          botEsperó = true;
          await barrera.esperar(1500);
        },
      });
      const prismaApi = conGanchos(prisma, {
        modelo: "lead",
        operacion: "updateMany",
        cuando: (a) => JSON.stringify(a["where"]).includes(conv.lead_id) && !apiEsperó,
        despues: async () => {
          apiEsperó = true;
          await barrera.esperar(1500);
        },
      }, {
        modelo: "grupo",
        operacion: "updateMany",
        cuando: (a) => JSON.stringify(a["where"]).includes(grupoId) && !apiEsperó,
        despues: async () => {
          apiEsperó = true;
          await barrera.esperar(1500);
        },
      });
      const api = levantarApi(prismaApi, { reloj: () => AHORA });
      try {
        const asesor = await sembrarUsuario(prisma, base.org.organizacionId, { rol: "asesor", sucursales: [base.org.sucursales[0]!.id] });
        const cliente = api.cliente();
        assert.equal((await cliente.login(base.org.slug, asesor.correo, asesor.contrasena)).estado, 201);

        const evento: EventoEntrante = {
          chatwootAccountId: base.org.chatwootAccountId,
          chatwootInboxId: base.org.chatwootInboxId,
          chatwootConversacionId: c.chatwootConversacionId,
          idMensaje: String(randomInt(1_000_000, 2_000_000_000)),
          contenido: "2",
          estadoConversacion: "pending",
          contacto: { nombre: "Mamá", telefono: c.telefono },
          creadoEn: null,
          llave: { proveedor: "chatwoot", id: String(randomInt(1_000_000, 2_000_000_000)) },
          numeroReceptor: null,
          crudo: null,
        };
        const deps = { ...base.deps(AHORA), prisma: prismaBot, mensajeria: new MessagingProvider({ transporte: base.transporte, reloj: () => AHORA }) };
        const [bot, rest] = await Promise.allSettled([procesarEntrante(deps, evento), cliente.post<{ error?: unknown }>("/api/clases-muestra", { prospecto_id: prospecto.id, grupo_id: grupoId, fecha_hora: SESION(7).toISOString() })]);
        assert.equal(bot.status, "fulfilled", `el mensaje de la familia no se pierde: ${bot.status === "rejected" ? String(bot.reason) : ""}`);
        assert.equal(rest.status, "fulfilled");
        const estado = (rest as PromiseFulfilledResult<{ estado: number }>).value.estado;
        assert.ok(estado === 201 || estado === 409, `la API no da 5xx: ${estado}`);
        assert.equal(await base.db.clase_muestra.count({ where: { prospecto_id: prospecto.id, estatus: "agendada" } }), 1, "una sola clase agendada");
      } finally {
        await api.cerrar();
      }
    }
    assert.equal(logs.lineas.filter((l) => /40P01|deadlock|interbloqueo/i.test(l)).length, 0, "ningún interbloqueo en el log");
  } finally {
    logs.detener();
  }
});
