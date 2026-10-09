// A6: topes de frecuencia por organización. Contra Postgres real y el transporte falso.
// El tope vive en MessagingProvider (invariante 4): cuenta por teléfono en TODA la organización.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { altaConAlcance, conAlcance } from "../datos/alcance.ts";
import { fijarConfiguracion, sembrarEntrante, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { ENVIO_INCIERTO, MessagingProvider, TransporteFalso, confirmacionBajaA, respuestaA, type Saliente } from "./index.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
/** 8-oct-2026 12:00 hora de Ciudad de México (UTC-6): dentro del horario de envío. */
const T0 = new Date("2026-10-08T18:00:00Z");
const en = (base: Date, ms: number) => new Date(base.getTime() + ms);

const telefonoNuevo = () => `+5255${randomInt(10_000_000, 99_999_999)}`;

/** Una organización con una plantilla de servicio y una de marketing, y una conversación para un teléfono. */
async function escenario(telefono = telefonoNuevo()) {
  const o = await sembrarOrganizacion(prisma, "Frecuencia");
  const db = conAlcance(prisma, o.organizacionId);
  const plantilla = (codigo: string, categoria: "utility" | "marketing") =>
    db.plantilla_mensaje.create({
      data: altaConAlcance({
        codigo,
        content_sid: "HX00000000000000000000000000000000",
        categoria,
        clase_mensaje: categoria === "marketing" ? ("marketing" as const) : ("servicio" as const),
        estado_aprobacion: "aprobada" as const,
        cuerpo_referencia: codigo,
      }),
    });
  const servicio = await plantilla("aviso", "utility");
  const marketing = await plantilla("promo", "marketing");
  const conversacionPara = async (tel: string, org: OrganizacionDePrueba = o, verticalId = org.verticalId, bandejaId = org.bandejaId) => {
    const d = conAlcance(prisma, org.organizacionId);
    // Un teléfono tiene un solo lead por vertical: otra conversación del mismo teléfono reutiliza el lead.
    const lead =
      (await d.lead.findFirst({ where: { vertical_interes_id: verticalId, telefono: tel } })) ??
      (await d.lead.create({
        data: altaConAlcance({ vertical_interes_id: verticalId, sucursal_interes_id: org.sucursales[0]!.id, etapa_id: org.etapaInicialId, telefono: tel }),
      }));
    return d.conversacion.create({
      data: altaConAlcance({ bandeja_chatwoot_id: bandejaId, lead_id: lead.id, chatwoot_conversacion_id: randomInt(1, 2_000_000_000), ventana_servicio_hasta: null }),
    });
  };
  const conv = await conversacionPara(telefono);
  const transporte = new TransporteFalso();
  /** Manda `salientes` por la conversación como si fuera `ahora`; devuelve [resultado, motivo] de cada uno. */
  const mandar = async (salientes: Saliente[], ahora: Date, convId = conv.id, t: TransporteFalso = transporte, d = db) => {
    const provider = new MessagingProvider({ transporte: t, reloj: () => ahora });
    await d.$transaction((tx) => provider.encolar(tx, convId, salientes));
    const r = await provider.despachar(d, convId);
    return r.resultados.map((x) => [x.resultado, x.motivo] as const);
  };
  const auto = (cuerpo = "recordatorio", plantillaId = servicio.id): Saliente => ({
    tipo: "mensaje",
    cuerpo,
    origen: "automatizacion",
    plantilla: { id: plantillaId, variables: {} },
  });
  const promo = (cuerpo = "promoción"): Saliente => auto(cuerpo, marketing.id);
  return { o, db, conv, conversacionPara, transporte, mandar, auto, promo, servicio, marketing, telefono };
}

const ok = ["enviado", undefined] as const;
const tope = ["bloqueado", "tope_frecuencia"] as const;

test("por defecto: el 3.º mensaje automático del día pasa y el 4.º se bloquea con tope_frecuencia", async () => {
  const s = await escenario();
  const r = await s.mandar([s.auto("1"), s.auto("2"), s.auto("3"), s.auto("4")], T0);
  assert.deepEqual(r, [ok, ok, ok, tope]);
  assert.equal(s.transporte.envios.filter((e) => e.tipo === "plantilla").length, 3);
});

test("ventana móvil de 24 h: a las 23 h 59 min sigue bloqueado y a las 24 h 1 min pasa", async () => {
  const s = await escenario();
  assert.deepEqual(await s.mandar([s.auto(), s.auto(), s.auto()], T0), [ok, ok, ok]);
  assert.deepEqual(await s.mandar([s.auto()], en(T0, DIA - MINUTO)), [tope]);
  assert.deepEqual(await s.mandar([s.auto()], en(T0, DIA + MINUTO)), [ok]);
});

test("otro teléfono no cuenta", async () => {
  const s = await escenario();
  assert.deepEqual(await s.mandar([s.auto(), s.auto(), s.auto()], T0), [ok, ok, ok]);
  const otro = await s.conversacionPara(telefonoNuevo());
  assert.deepEqual(await s.mandar([s.auto()], T0, otro.id), [ok]);
  assert.deepEqual(await s.mandar([s.auto()], T0), [tope]);
});

test("se cuenta por teléfono en TODA la organización: otra vertical con el mismo teléfono comparte el tope", async () => {
  const s = await escenario();
  const vertical = await prisma.vertical.create({ data: { organizacion_id: s.o.organizacionId, nombre: "Otra", slug: `otra-${randomUUID().slice(0, 6)}` } });
  const canal = await prisma.canal_whatsapp.create({ data: { organizacion_id: s.o.organizacionId, vertical_id: vertical.id, nombre_publico: "Otra" } });
  const bandeja = await prisma.bandeja_chatwoot.create({
    data: { organizacion_id: s.o.organizacionId, canal_whatsapp_id: canal.id, nombre: "Otra", chatwoot_account_id: s.o.chatwootAccountId, chatwoot_inbox_id: randomInt(1_000_000, 2_000_000_000) },
  });
  const otraConv = await s.conversacionPara(s.telefono, s.o, vertical.id, bandeja.id);
  assert.deepEqual(await s.mandar([s.auto(), s.auto()], T0), [ok, ok]);
  assert.deepEqual(await s.mandar([s.auto(), s.auto()], T0, otraConv.id), [ok, tope]);
});

test("otra organización con su propia configuración no se afecta, ni consume mi tope", async () => {
  const a = await escenario();
  const b = await escenario(a.telefono); // mismo teléfono, otra organización
  await fijarConfiguracion(prisma, a.o.organizacionId, { max_automaticos_por_dia: 1 });
  await fijarConfiguracion(prisma, b.o.organizacionId, { max_automaticos_por_dia: 5 });

  assert.deepEqual(await a.mandar([a.auto(), a.auto()], T0), [ok, tope]);
  assert.deepEqual(await b.mandar([b.auto(), b.auto(), b.auto(), b.auto(), b.auto(), b.auto()], T0), [ok, ok, ok, ok, ok, tope]);
});

test("la configuración cambiada surte efecto sin reiniciar nada", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1 });
  assert.deepEqual(await s.mandar([s.auto(), s.auto()], T0), [ok, tope]);
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 2 });
  assert.deepEqual(await s.mandar([s.auto()], T0), [ok]);
  assert.deepEqual(await s.mandar([s.auto()], T0), [tope]);
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 0 });
  assert.deepEqual(await s.mandar([s.auto()], en(T0, 2 * DIA)), [tope], "0 apaga lo automático");
});

test("marketing: 1 cada 7 días; a los 6 días 23 h se bloquea y a los 7 días pasa", async () => {
  const s = await escenario();
  assert.deepEqual(await s.mandar([s.promo()], T0), [ok]);
  assert.deepEqual(await s.mandar([s.promo()], en(T0, 6 * DIA + 23 * HORA)), [tope]);
  assert.deepEqual(await s.mandar([s.promo()], en(T0, 7 * DIA)), [ok]);
  assert.deepEqual(await s.mandar([s.promo()], en(T0, 7 * DIA + HORA)), [tope], "el de los 7 días abre una ventana nueva");
});

test("marketing: un mensaje de servicio no lo cuenta, y el tope de marketing no frena los de servicio", async () => {
  const s = await escenario();
  assert.deepEqual(await s.mandar([s.auto("a"), s.auto("b")], T0), [ok, ok]);
  assert.deepEqual(await s.mandar([s.promo()], en(T0, HORA)), [ok], "dos de servicio previos no impiden el primer marketing (3.º del día)");
  assert.deepEqual(await s.mandar([s.promo()], en(T0, 2 * DIA)), [tope], "marketing 2 dentro de los 7 días");
  assert.deepEqual(await s.mandar([s.auto()], en(T0, 2 * DIA)), [ok], "un mensaje de servicio sí sale");
});

test("marketing: la ventana y el tope son de la organización", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_marketing_por_ventana: 2, ventana_marketing_dias: 2 });
  assert.deepEqual(await s.mandar([s.promo(), s.promo(), s.promo()], T0), [ok, ok, tope]);
  assert.deepEqual(await s.mandar([s.promo()], en(T0, 2 * DIA - HORA)), [tope]);
  assert.deepEqual(await s.mandar([s.promo()], en(T0, 2 * DIA + MINUTO)), [ok]);
});

test("marketing también cuenta en el tope diario de automáticos", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 2 });
  assert.deepEqual(await s.mandar([s.promo(), s.auto(), s.auto()], T0), [ok, ok, tope]);
});

test("marketing con la ventana de servicio abierta (aunque conteste a un entrante) también está limitado", async () => {
  const s = await escenario();
  await s.db.conversacion.update({ where: { id: s.conv.id }, data: { ventana_servicio_hasta: en(T0, 10 * DIA) } });
  const entrante = await sembrarEntrante(s.db, s.conv.id);
  const plantilla = { id: s.marketing.id, variables: {} };
  assert.deepEqual(await s.mandar([respuestaA(entrante, "oferta", plantilla), respuestaA(entrante, "oferta", plantilla)], T0), [ok, tope]);
});

test("las respuestas y las notas internas NUNCA se limitan por frecuencia", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1, max_marketing_por_ventana: 0 });
  assert.deepEqual(await s.mandar([s.auto(), s.auto()], T0), [ok, tope]);
  await s.db.conversacion.update({ where: { id: s.conv.id }, data: { ventana_servicio_hasta: en(T0, 2 * HORA) } });
  const entrante = await sembrarEntrante(s.db, s.conv.id);
  const respuestas: Saliente[] = [
    respuestaA(entrante, "r1"),
    respuestaA(entrante, "r2"),
    respuestaA(entrante, "r3"),
    { tipo: "nota_interna", origen: "respuesta", cuerpo: "n1" },
    confirmacionBajaA(entrante, "confirmación"),
  ];
  assert.deepEqual(await s.mandar(respuestas, en(T0, HORA)), [ok, ok, ok, ok, ok]);
});

test("lo que falló de forma definitiva (no salió) no cuenta para el tope", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1 });
  // Fallo definitivo: no salió, no cuenta.
  const roto = new TransporteFalso();
  roto.fallarSi = (e) => e.tipo === "plantilla";
  assert.deepEqual(await s.mandar([s.auto()], T0, s.conv.id, roto), [["fallido", undefined]]);
  // La conversación fallida pasó a un asesor: el siguiente va por otra conversación del mismo teléfono.
  const otra = await s.conversacionPara(s.telefono, s.o);
  assert.deepEqual(await s.mandar([s.auto()], T0, otra.id), [ok]);
});

test("un envío incierto cuenta para el tope", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1 });
  const incierto = new TransporteFalso();
  incierto.inciertoSi = (e) => e.tipo === "plantilla";
  assert.deepEqual(await s.mandar([s.auto()], T0, s.conv.id, incierto), [["fallido", ENVIO_INCIERTO]]);
  const m = await s.db.mensaje.findFirstOrThrow({ where: { conversacion_id: s.conv.id, error: ENVIO_INCIERTO } });
  assert.equal(m.estatus, "fallido");
  // La conversación pasó a un asesor, así que se prueba con otra conversación del mismo teléfono.
  const otra = await s.conversacionPara(s.telefono, s.o);
  assert.deepEqual(await s.mandar([s.auto()], T0, otra.id), [tope]);
});

test("sin zona horaria o fuera de horario sigue mandando el horario antes que la frecuencia (invariante 14 intacto)", async () => {
  const s = await escenario();
  const madrugada = new Date("2026-10-08T09:00:00Z"); // 03:00 en Ciudad de México
  assert.deepEqual(await s.mandar([s.auto()], madrugada), [["bloqueado", "fuera_de_horario"]]);
});

// ---------------------------------------------------------------------------------------------
// EA-11: contar y reservar son una sola cosa por teléfono (candado consultivo). Concurrencia REAL:
// una barrera obliga a que las dos conversaciones lleguen a contar al mismo tiempo; sin el candado
// las dos ven «0 enviados» y salen las dos.

/** Una `db` con la barrera puesta justo antes de CONTAR lo ya enviado al teléfono. */
function conBarreraAntesDeContar(barrera: Barrera, limiteMs: number, organizacionId: string) {
  const raiz = conGanchos(prisma, {
    modelo: "mensaje",
    operacion: "count",
    antes: () => barrera.esperar(limiteMs),
  });
  return conAlcance(raiz, organizacionId);
}

test("EA-11: dos conversaciones del MISMO teléfono despachando a la vez, con tope 1: sale una sola", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1 });
  const otra = await s.conversacionPara(s.telefono, s.o); // otra vertical/bandeja del mismo teléfono
  const transporte = new TransporteFalso();
  transporte.demoraMs = 150; // el primero sigue «en vuelo» cuando el segundo decide
  const provider = new MessagingProvider({ transporte, reloj: () => T0 });
  for (const conversacionId of [s.conv.id, otra.id]) {
    await s.db.$transaction((tx) => provider.encolar(tx, conversacionId, [s.auto("recordatorio")]));
  }
  const barrera = new Barrera(2);
  const db = conBarreraAntesDeContar(barrera, 400, s.o.organizacionId);
  const [a, b] = await Promise.all([provider.despachar(db, s.conv.id), provider.despachar(db, otra.id)]);

  assert.equal(transporte.envios.filter((e) => e.tipo === "plantilla").length, 1, "sale una sola vez");
  assert.equal(a.enviados + b.enviados, 1);
  assert.deepEqual([...a.resultados, ...b.resultados].map((r) => [r.resultado, r.motivo]).sort(), [["bloqueado", "tope_frecuencia"], ["enviado", undefined]]);
  assert.equal(barrera.completa, false, "el candado serializó la sección crítica: la segunda no pudo llegar a contar mientras la primera reclamaba");
});

test("EA-11: teléfonos distintos NO se estorban: las dos llegan a contar al mismo tiempo", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1 });
  const otra = await s.conversacionPara(telefonoNuevo(), s.o);
  const transporte = new TransporteFalso();
  const provider = new MessagingProvider({ transporte, reloj: () => T0 });
  for (const conversacionId of [s.conv.id, otra.id]) {
    await s.db.$transaction((tx) => provider.encolar(tx, conversacionId, [s.auto("recordatorio")]));
  }
  const barrera = new Barrera(2);
  const db = conBarreraAntesDeContar(barrera, 3000, s.o.organizacionId);
  await Promise.all([provider.despachar(db, s.conv.id), provider.despachar(db, otra.id)]);
  assert.equal(barrera.completa, true, "ninguna esperó a la otra");
  assert.equal(transporte.envios.filter((e) => e.tipo === "plantilla").length, 2, "cada teléfono tiene su propio tope");
});

test("EA-11: un mensaje en `enviando` (en curso) cuenta para el tope de quien llega después", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1 });
  const otra = await s.conversacionPara(s.telefono, s.o);
  // Un envío en curso de la otra conversación (reclamado hace un momento, sin resultado).
  await s.db.mensaje.create({
    data: altaConAlcance({ conversacion_id: otra.id, direccion: "saliente" as const, estatus: "enviando" as const, origen: "automatizacion" as const, cuerpo: "en vuelo", proveedor: "chatwoot", actualizado_en: T0 }),
  });
  assert.deepEqual(await s.mandar([s.auto()], T0), [tope]);
});

test("EG-05: el reenganche y la recuperación (categoría utility, clase marketing) cuentan en el tope de marketing: 1 cada 7 días por teléfono, compartido con cualquier otro marketing", async () => {
  const s = await escenario();
  const utilidadDeMarketing = await s.db.plantilla_mensaje.create({
    data: altaConAlcance({ codigo: "recuperacion", content_sid: "HX00000000000000000000000000000000", categoria: "utility" as const, clase_mensaje: "marketing" as const, estado_aprobacion: "aprobada" as const, cuerpo_referencia: "recuperacion" }),
  });
  const recuperacion = (): Saliente => s.auto("recuperación", utilidadDeMarketing.id);
  assert.deepEqual(await s.mandar([recuperacion()], T0), [ok], "el primero sale");
  assert.deepEqual(await s.mandar([recuperacion()], en(T0, 2 * DIA)), [tope], "el segundo, a los 2 días, se bloquea");
  assert.deepEqual(await s.mandar([s.promo()], en(T0, 3 * DIA)), [tope], "un marketing de categoría marketing también cuenta lo que mandó la recuperación");
  assert.deepEqual(await s.mandar([s.auto()], en(T0, 3 * DIA)), [ok], "un aviso de servicio no se frena");
  assert.deepEqual(await s.mandar([recuperacion()], en(T0, 7 * DIA + HORA)), [ok], "a los 7 días se abre una ventana nueva");
  // El tope sigue siendo de la organización: con 2 por ventana, el segundo pasa y el tercero no.
  const otra = await escenario();
  await fijarConfiguracion(prisma, otra.o.organizacionId, { max_marketing_por_ventana: 2 });
  const rec2 = await otra.db.plantilla_mensaje.create({
    data: altaConAlcance({ codigo: "reenganche", content_sid: "HX00000000000000000000000000000000", categoria: "utility" as const, clase_mensaje: "marketing" as const, estado_aprobacion: "aprobada" as const, cuerpo_referencia: "reenganche" }),
  });
  const re = (): Saliente => otra.auto("reenganche", rec2.id);
  assert.deepEqual(await otra.mandar([re(), re(), re()], T0), [ok, ok, tope]);
});
