// INV-6 contra Postgres real, MessagingProvider y el transporte falso: con `en_atencion_humana` el sistema no contesta ni hace marketing, pero SÍ salen
// los avisos de SERVICIO sobre algo que la familia ya acordó. Matriz {estado de la conversación} × {origen y clase de la plantilla}, la baja total y la de
// marketing, la declaración obligatoria de la clase (NOT NULL y CHECK en la base) y la prueba de que ninguna automatización mira el estado por su cuenta.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { altaConAlcance, conAlcance } from "../datos/alcance.ts";
import { fijarConfiguracion, sembrarEntrante, sembrarOrganizacion } from "../testutil/semilla.ts";
import { MessagingProvider, TransporteFalso, respuestaA, type Saliente } from "./index.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

/** 8-oct-2026 12:00 hora de Ciudad de México (UTC-6): dentro del horario de envío. */
const MEDIODIA = new Date("2026-10-08T18:00:00Z");
const HORA = 3_600_000;

async function escenario(estado: "bot" | "en_atencion_humana") {
  const o = await sembrarOrganizacion(prisma, "Matriz INV-6");
  const db = conAlcance(prisma, o.organizacionId);
  const lead = await db.lead.create({
    data: altaConAlcance({ vertical_interes_id: o.verticalId, sucursal_interes_id: o.sucursales[0]!.id, etapa_id: o.etapaInicialId, telefono: `+5255${randomInt(10_000_000, 99_999_999)}` }),
  });
  const conv = await db.conversacion.create({
    data: altaConAlcance({
      bandeja_chatwoot_id: o.bandejaId,
      lead_id: lead.id,
      chatwoot_conversacion_id: randomInt(1, 2_000_000_000),
      estado,
      ventana_servicio_hasta: new Date(MEDIODIA.getTime() + 2 * HORA),
    }),
  });
  const plantilla = (codigo: string, categoria: "utility" | "marketing", clase: "servicio" | "marketing") =>
    db.plantilla_mensaje.create({
      data: altaConAlcance({ codigo, content_sid: "HX00000000000000000000000000000000", categoria, clase_mensaje: clase, estado_aprobacion: "aprobada" as const, cuerpo_referencia: codigo }),
    });
  const servicio = await plantilla("aviso_de_servicio", "utility", "servicio");
  const marketingUtility = await plantilla("reenganche", "utility", "marketing");
  const marketingMeta = await plantilla("promocion", "marketing", "marketing");
  const transporte = new TransporteFalso();
  const provider = new MessagingProvider({ transporte, reloj: () => MEDIODIA });
  return { o, db, lead, conv, servicio, marketingUtility, marketingMeta, transporte, provider, telefono: lead.telefono! };
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

/** Encola el saliente y lo despacha; devuelve lo que decidió el provider. */
async function despacha(s: Escenario, saliente: Saliente | ((entrante: string) => Saliente)) {
  const entrante = await sembrarEntrante(s.db, s.conv.id);
  const [id] = await s.db.$transaction((tx) => s.provider.encolar(tx, s.conv.id, [typeof saliente === "function" ? saliente(entrante) : saliente]));
  const r = await s.provider.despachar(s.db, s.conv.id);
  const res = r.resultados.find((x) => x.mensajeId === id)!;
  return { resultado: res.resultado, motivo: res.motivo ?? null };
}

/** Cada caso: cómo lo arma quien lo encola y si SALE con una persona atendiendo. */
const CASOS: { nombre: string; arma: (s: Escenario) => Saliente | ((entrante: string) => Saliente); salenConPersona: boolean }[] = [
  { nombre: "respuesta del bot (texto libre)", arma: () => (e) => respuestaA(e, "hola"), salenConPersona: false },
  { nombre: "respuesta del bot con plantilla de servicio", arma: (s) => (e) => respuestaA(e, "x", { id: s.servicio.id, variables: {} }), salenConPersona: false },
  { nombre: "nota interna del bot", arma: () => ({ tipo: "nota_interna", origen: "respuesta", cuerpo: "resumen para el asesor" }), salenConPersona: false },
  { nombre: "texto libre automático", arma: () => ({ tipo: "mensaje", origen: "automatizacion", cuerpo: "recordatorio sin plantilla" }), salenConPersona: false },
  { nombre: "recordatorio de clase muestra / bienvenida / recordatorio de pago (servicio)", arma: (s) => ({ tipo: "mensaje", origen: "automatizacion", cuerpo: "aviso", plantilla: { id: s.servicio.id, variables: {} } }), salenConPersona: true },
  { nombre: "reenganche y recuperación (marketing, categoría utility)", arma: (s) => ({ tipo: "mensaje", origen: "automatizacion", cuerpo: "reenganche", plantilla: { id: s.marketingUtility.id, variables: {} } }), salenConPersona: false },
  { nombre: "lead frío y promoción por vencer (marketing, categoría marketing)", arma: (s) => ({ tipo: "mensaje", origen: "automatizacion", cuerpo: "promo", plantilla: { id: s.marketingMeta.id, variables: {} } }), salenConPersona: false },
];

test("INV-6, matriz con el provider real: con el bot todo sale; con una persona atendiendo solo salen los avisos de servicio iniciados por el sistema", async () => {
  for (const c of CASOS) {
    const bot = await escenario("bot");
    assert.deepEqual(await despacha(bot, c.arma(bot)), { resultado: "enviado", motivo: null }, `bot · ${c.nombre}`);
    const humana = await escenario("en_atencion_humana");
    const r = await despacha(humana, c.arma(humana));
    assert.deepEqual(r, c.salenConPersona ? { resultado: "enviado", motivo: null } : { resultado: "bloqueado", motivo: "atencion_humana" }, `en_atencion_humana · ${c.nombre}`);
    if (c.salenConPersona) {
      assert.equal(humana.transporte.envios.filter((e) => e.tipo === "plantilla").length, 1, "salió por plantilla");
      // Mandar el aviso no le quita la conversación a la persona.
      assert.equal((await humana.db.conversacion.findUniqueOrThrow({ where: { id: humana.conv.id } })).estado, "en_atencion_humana");
    } else {
      assert.equal(humana.transporte.envios.length, 0, `no salió nada: ${c.nombre}`);
    }
  }
});

test("INV-6: el aviso de servicio con una persona atendiendo sigue sujeto a horario, baja total y frecuencia; la baja de marketing no lo frena", async () => {
  const aviso = (s: Escenario): Saliente => ({ tipo: "mensaje", origen: "automatizacion", cuerpo: "aviso", plantilla: { id: s.servicio.id, variables: {} } });
  // Baja TOTAL: no sale ni siquiera el aviso de servicio.
  const total = await escenario("en_atencion_humana");
  await total.db.consentimiento.create({ data: altaConAlcance({ telefono: total.telefono, estado: "opt_out" as const, alcance: "todo" as const, origen: "palabra_clave" }) });
  assert.deepEqual(await despacha(total, aviso(total)), { resultado: "bloqueado", motivo: "opt_out" });
  // Baja de MARKETING: el aviso de servicio sale; lo que declara marketing (aunque su categoría sea utility) no.
  const mkt = await escenario("en_atencion_humana");
  await mkt.db.consentimiento.create({ data: altaConAlcance({ telefono: mkt.telefono, estado: "opt_out" as const, alcance: "marketing" as const, origen: "palabra_clave" }) });
  assert.deepEqual(await despacha(mkt, aviso(mkt)), { resultado: "enviado", motivo: null });
  const mktBot = await escenario("bot");
  await mktBot.db.consentimiento.create({ data: altaConAlcance({ telefono: mktBot.telefono, estado: "opt_out" as const, alcance: "marketing" as const, origen: "palabra_clave" }) });
  assert.deepEqual(await despacha(mktBot, { tipo: "mensaje", origen: "automatizacion", cuerpo: "reenganche", plantilla: { id: mktBot.marketingUtility.id, variables: {} } }), { resultado: "bloqueado", motivo: "opt_out" });
  // Horario (invariante 14): a las 03:00 locales el aviso de servicio no sale aunque una persona atienda.
  const noche = await escenario("en_atencion_humana");
  const madrugada = new MessagingProvider({ transporte: noche.transporte, reloj: () => new Date("2026-10-08T09:00:00Z") });
  await noche.db.$transaction((tx) => madrugada.encolar(tx, noche.conv.id, [aviso(noche)]));
  const rn = await madrugada.despachar(noche.db, noche.conv.id);
  assert.deepEqual(rn.resultados.map((r) => [r.resultado, r.motivo]), [["bloqueado", "fuera_de_horario"]]);
  // Frecuencia diaria: con el tope en 1, el segundo aviso del día se frena.
  const f = await escenario("en_atencion_humana");
  await fijarConfiguracion(prisma, f.o.organizacionId, { max_automaticos_por_dia: 1 });
  assert.equal((await despacha(f, aviso(f))).resultado, "enviado");
  assert.deepEqual(await despacha(f, aviso(f)), { resultado: "bloqueado", motivo: "tope_frecuencia" });
});

test("INV-6: cada plantilla DECLARA su clase: sin ella la base rechaza el alta, y una de servicio no puede ser de categoría marketing", async () => {
  const o = await sembrarOrganizacion(prisma, "Clase obligatoria");
  const id = "00000000-0000-4000-8000-0000000000ee";
  await assert.rejects(
    prisma.$executeRaw`INSERT INTO plantilla_mensaje (id, organizacion_id, codigo, content_sid, categoria) VALUES (${id}::uuid, ${o.organizacionId}::uuid, 'sin_clase', 'HX0', 'utility')`,
    /clase_mensaje|null value/i,
    "NOT NULL y sin valor por omisión",
  );
  await assert.rejects(
    prisma.plantilla_mensaje.create({ data: { organizacion_id: o.organizacionId, codigo: "contradictoria", content_sid: "HX0", categoria: "marketing", clase_mensaje: "servicio" } }),
    /plantilla_mensaje_servicio_no_marketing_chk/,
  );
  // Las combinaciones válidas sí entran (incluida utility declarada de marketing: reenganche).
  await prisma.plantilla_mensaje.create({ data: { organizacion_id: o.organizacionId, codigo: "ok_1", content_sid: "HX0", categoria: "utility", clase_mensaje: "marketing" } });
  await prisma.plantilla_mensaje.create({ data: { organizacion_id: o.organizacionId, codigo: "ok_2", content_sid: "HX0", categoria: "utility", clase_mensaje: "servicio" } });
  await prisma.plantilla_mensaje.create({ data: { organizacion_id: o.organizacionId, codigo: "ok_3", content_sid: "HX0", categoria: "marketing", clase_mensaje: "marketing" } });
});

test("INV-6: las plantillas de los seeds DECLARAN su clase y la clasificación es la acordada (servicio: recordatorio, bienvenida, aviso al maestro, aviso de cambio de clase a la familia; el resto, marketing)", () => {
  const esperada = (codigo: string): "servicio" | "marketing" =>
    codigo === "recordatorio_clase_muestra" || codigo === "bienvenida_inscripcion" || codigo.startsWith("aviso_maestro_") || codigo.startsWith("aviso_clase_") || codigo.startsWith("recordatorio_pago_") ? "servicio" : "marketing";
  const visto: string[] = [];
  for (const f of readdirSync("prisma/seed").filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join("prisma/seed", f), "utf8");
    for (const insert of sql.split(/INSERT INTO plantilla_mensaje/).slice(1)) {
      const cuerpo = insert.slice(0, insert.indexOf("ON CONFLICT"));
      assert.match(cuerpo.slice(0, cuerpo.indexOf("VALUES")), /categoria,\s*clase_mensaje,/, `${f}: la columna clase_mensaje va declarada`);
      for (const fila of cuerpo.matchAll(/\('[0-9a-f-]+',\s*'[0-9a-f-]+',\s*'([a-z_]+)',\s*'HX\w+',\s*NULL,\s*'(?:utility|marketing|authentication|servicio)',\s*'(servicio|marketing)'/g)) {
        visto.push(fila[1]!);
        assert.equal(fila[2], esperada(fila[1]!), `${f}: ${fila[1]}`);
      }
    }
  }
  assert.deepEqual(visto.sort(), ["aviso_clase_cancelada", "aviso_clase_reprogramada", "aviso_maestro_agendada", "aviso_maestro_cancelada", "aviso_maestro_reprogramada", "bienvenida_inscripcion", "recordatorio_clase_muestra", "recordatorio_pago_por_vencer", "recordatorio_pago_vencido", "recuperacion_no_asistio", "reenganche_captacion", "reenganche_lead_frio", "promocion_por_vencer"].sort());
});

test("INV-6: ninguna automatización verifica el estado de la conversación por su cuenta — la verificación vive solo en MessagingProvider", () => {
  // Los módulos que programan o ejecutan envíos no pueden preguntar por `en_atencion_humana`: lo decide el provider con la clase de la plantilla.
  const carpetas = ["src/automatizaciones", "src/clases-muestra", "src/inscripciones", "src/cotizador", "src/lista-espera", "src/familias", "src/conversion", "src/embudo", "src/legal"];
  const sinComentarios = (texto: string): string =>
    texto
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => (l.trimStart().startsWith("//") ? "" : l))
      .join("\n");
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const ruta = join(dir, n);
      if (statSync(ruta).isDirectory()) return archivos(ruta);
      return /\.ts$/.test(n) && !/\.(itest|test)\.ts$/.test(n) ? [ruta] : [];
    });
  const infractores = carpetas.flatMap(archivos).filter((f) => /atencion_humana/.test(sinComentarios(readFileSync(f, "utf8"))));
  assert.deepEqual(infractores, [], "estos módulos preguntan por la atención humana por su cuenta");
});
