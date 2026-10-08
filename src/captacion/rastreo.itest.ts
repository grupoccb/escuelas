// E2: el código de rastreo en el primer mensaje de WhatsApp, con el bot real (`procesarEntrante`), la base y el transporte falso. Un código que sirve deja la
// atribución (campaña, sucursal, fuente) en el lead y se consume; uno que no sirve se ignora sin romper; el texto del código nunca llega al bot como respuesta; el
// lead conserva su primera atribución; la vía de anuncios (A7) no se toca.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escenarioBot, type EscenarioBot } from "../testutil/bot.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";
import { fechaLocal } from "../lib/horario.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { AtribucionSimulada, MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { procesarEntrante } from "./entrante.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

let consecutivo = 0;
const telefonoNuevo = (): string => `+5255${String(20_000_000 + ++consecutivo * 13 + randomInt(0, 10))}`;

interface Mundo {
  e: EscenarioBot;
  campana: { id: string };
  /** Un código de campaña de la organización (por omisión con la sucursal 0). */
  crear(codigo: string, o?: Record<string, unknown>): Promise<{ id: string; codigo: string }>;
  /** Un mensaje entrante de un contacto (conversación y teléfono propios si no se dan). */
  entra(contenido: string, o?: { telefono?: string; conversacion?: number; idMensaje?: string; atribucion?: AtribucionSimulada; cuando?: Date }): ReturnType<typeof procesarEntrante>;
  lead(telefono: string): Promise<Awaited<ReturnType<ReturnType<typeof conAlcance>["lead"]["findFirstOrThrow"]>>>;
  usos(codigo: string): Promise<number>;
}

async function mundo(): Promise<Mundo> {
  const e = await escenarioBot(prisma, { cotizador: false });
  const campana = await prisma.campana.create({ data: { organizacion_id: e.org.organizacionId, nombre: "QR sucursal", origen: "presencial", sucursal_id: e.org.sucursales[0]!.id } });
  const crear = async (codigo: string, o: Record<string, unknown> = {}) => {
    const c = await prisma.codigo_rastreo.create({ data: { organizacion_id: e.org.organizacionId, codigo, tipo: "campana", campana_id: campana.id, sucursal_id: e.org.sucursales[0]!.id, ...o } });
    return { id: c.id, codigo };
  };
  const entra: Mundo["entra"] = (contenido, o = {}) => {
    const id = o.idMensaje ?? `m-${++consecutivo}-${randomInt(1, 1_000_000)}`;
    const evento: EventoEntrante = {
      chatwootAccountId: e.org.chatwootAccountId,
      chatwootInboxId: e.org.chatwootInboxId,
      chatwootConversacionId: o.conversacion ?? randomInt(1, 2_000_000_000),
      idMensaje: id,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Mamá", telefono: o.telefono ?? telefonoNuevo() },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id },
      numeroReceptor: null,
      crudo: null,
    };
    return procesarEntrante({ ...e.deps(o.cuando), ...(o.atribucion ? { atribucion: o.atribucion } : {}) }, evento);
  };
  return {
    e,
    campana,
    crear,
    entra,
    lead: (telefono) => e.db.lead.findFirstOrThrow({ where: { telefono } }),
    usos: async (codigo) => (await e.db.codigo_rastreo.findFirstOrThrow({ where: { codigo } })).usos,
  };
}

const MENSAJE = "Hola, quiero información de Vertical Prueba. Mi código es QR7M-2KXA";

test("E2: un código de campaña en el primer mensaje deja la campaña, la sucursal y la fuente en el lead, y cuenta un uso; el bot contesta como siempre", async () => {
  const m = await mundo();
  await m.crear("QR7M2KXA");
  const tel = telefonoNuevo();
  const conv = randomInt(1, 2_000_000_000);
  const r = await m.entra(MENSAJE, { telefono: tel, conversacion: conv });
  assert.equal(r.resultado, "procesado");
  const lead = await m.lead(tel);
  assert.equal(lead.campana_id, m.campana.id);
  assert.equal(lead.sucursal_interes_id, m.e.org.sucursales[0]!.id, "la sucursal del código, porque el canal no fija una");
  assert.deepEqual(lead.atribucion, { fuente: "codigo", codigo_rastreo: "QR7M2KXA", campana_id: m.campana.id, sucursal_del_codigo_id: m.e.org.sucursales[0]!.id });
  assert.equal(lead.anuncio_id, null, "no es un anuncio: la vía de A7 no se mezcla");
  assert.equal(await m.usos("QR7M2KXA"), 1);
  // Lo que contesta el bot es exactamente lo de un primer mensaje sin código.
  const sinCodigo = await m.entra("Hola, quiero información de Vertical Prueba", { telefono: telefonoNuevo() });
  assert.equal(sinCodigo.resultado, "procesado");
  const enviosCon = m.e.transporte.envios.filter((x) => x.tipo === "mensaje" && x.destino.chatwootConversacionId === conv).map((x) => x.texto);
  const enviosSin = m.e.transporte.envios.filter((x) => x.tipo === "mensaje" && x.destino.chatwootConversacionId !== conv).map((x) => x.texto);
  assert.deepEqual(enviosCon, enviosSin);
  // El mensaje se guarda tal como llegó (con el código): es lo que escribió la persona.
  const guardado = await m.e.db.mensaje.findFirstOrThrow({ where: { direccion: "entrante", conversacion: { lead_id: lead.id } } });
  assert.equal(guardado.cuerpo, MENSAJE);
  // El historial del lead tiene su alta (D7) y el código no la altera.
  assert.equal(await m.e.db.lead_etapa_historial.count({ where: { lead_id: lead.id } }), 1);
});

test("E2: el texto del código NO le llega al bot como respuesta — un código solo en el paso del nombre o de la edad no se toma por el nombre ni cuenta como intento fallido", async () => {
  const m = await mundo();
  await m.crear("QR7M2KXA");
  await m.crear("VEQCDMX7", { vigente_hasta: new Date("2020-01-01T00:00:00Z") }); // conocido pero vencido
  const tel = telefonoNuevo();
  const conv = randomInt(1, 2_000_000_000);
  await m.entra("Hola", { telefono: tel, conversacion: conv }); // inicio → pregunta el nombre
  for (const solo of ["QR7M-2KXA", "mi código es qr7m 2kxa", "VEQC-DMX7"]) {
    await m.entra(solo, { telefono: tel, conversacion: conv });
    const prospecto = await m.e.db.prospecto.findFirst({ where: { lead: { telefono: tel } } });
    assert.equal(prospecto?.nombre ?? null, null, `«${solo}» no es un nombre`);
  }
  // Ni cuentan como respuestas fallidas (tres seguidas pasarían la conversación a una persona) ni el bot contesta algo por ellas.
  const conversacion = await m.e.db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: conv } });
  assert.deepEqual([conversacion.intentos_fallidos, conversacion.estado, conversacion.paso_captacion, conversacion.pasar_a_asesor_pendiente], [0, "bot", "nombre", false]);
  assert.equal(m.e.transporte.envios.filter((x) => x.tipo === "mensaje" && x.destino.chatwootConversacionId === conv).length, 2, "solo el saludo y la pregunta del nombre");
  await m.entra("Mateo", { telefono: tel, conversacion: conv });
  assert.equal((await m.e.db.prospecto.findFirstOrThrow({ where: { lead: { telefono: tel } } })).nombre, "Mateo");
  // Un código dentro de una frase con el nombre: el nombre sale limpio.
  const tel2 = telefonoNuevo();
  const conv2 = randomInt(1, 2_000_000_000);
  await m.entra("Hola", { telefono: tel2, conversacion: conv2 });
  await m.entra("Se llama Sofía QR7M-2KXA", { telefono: tel2, conversacion: conv2 });
  assert.equal((await m.e.db.prospecto.findFirstOrThrow({ where: { lead: { telefono: tel2 } } })).nombre, "Sofía");
  // Solo se limpia lo que la organización CONOCE: con el mismo texto, un código registrado deja el nombre limpio y uno desconocido (una palabra que solo se parece a un
  // código) se queda tal cual, y el bot lo trata como lo de siempre (aquí, un nombre con dígitos no es un nombre).
  const tel3 = telefonoNuevo();
  const conv3 = randomInt(1, 2_000_000_000);
  await m.entra("Hola", { telefono: tel3, conversacion: conv3 });
  await m.entra("Valeria ZZZ2-PPP3", { telefono: tel3, conversacion: conv3 });
  assert.equal((await m.e.db.prospecto.findFirst({ where: { lead: { telefono: tel3 } } }))?.nombre ?? null, null);
  await m.entra("Valeria QR7M-2KXA", { telefono: tel3, conversacion: conv3 });
  assert.equal((await m.e.db.prospecto.findFirstOrThrow({ where: { lead: { telefono: tel3 } } })).nombre, "Valeria");
});

test("E2: un código inválido, inexistente, de otra organización, vencido, agotado o apagado se ignora SIN romper: el lead se crea sin atribución y los usos no cambian", async () => {
  const m = await mundo();
  const otra = await sembrarOrganizacion(prisma, "Otra");
  const campanaAjena = await prisma.campana.create({ data: { organizacion_id: otra.organizacionId, nombre: "Ajena", origen: "otro" } });
  await prisma.codigo_rastreo.create({ data: { organizacion_id: otra.organizacionId, codigo: "AJEHNK77", tipo: "campana", campana_id: campanaAjena.id } });
  await m.crear("VEQCDMX7", { vigente_hasta: new Date("2020-01-01T00:00:00Z") });
  await m.crear("FUTURQK5", { vigente_desde: new Date("2099-01-01T00:00:00Z") });
  await m.crear("AGQTADM5", { max_usos: 1, usos: 1 });
  await m.crear("APAGADK4", { activo: false });
  for (const [i, codigo] of ["VEQCDMX7", "FUTURQK5", "AGQTADM5", "APAGADK4", "AJEHNK77", "NQEXKST7", "no hay código aquí", "ABCD-EFGH"].entries()) {
    const tel = telefonoNuevo();
    const r = await m.entra(`Hola, mi código es ${codigo}`, { telefono: tel });
    assert.equal(r.resultado, "procesado", `caso ${i}: ${codigo}`);
    const lead = await m.lead(tel);
    assert.equal(lead.campana_id, null, codigo);
    assert.equal(lead.atribucion, null, codigo);
  }
  assert.deepEqual(await Promise.all(["VEQCDMX7", "FUTURQK5", "APAGADK4"].map((c) => m.usos(c))), [0, 0, 0]);
  assert.equal(await m.usos("AGQTADM5"), 1, "el agotado no suma");
  assert.equal((await prisma.codigo_rastreo.findFirstOrThrow({ where: { codigo: "AJEHNK77" } })).usos, 0, "el de otra organización ni se toca");
});

test("E2: reutilizar un código de campaña — cada lead nuevo cuenta un uso; con tope, el que ya no cabe se queda sin atribución; el mismo lead no cuenta dos veces", async () => {
  const m = await mundo();
  await m.crear("QR7M2KXA");
  await m.crear("TQPEQ2K3", { max_usos: 2 });
  const tels = [telefonoNuevo(), telefonoNuevo(), telefonoNuevo()];
  for (const t of tels) await m.entra("Hola, mi código es QR7M-2KXA", { telefono: t });
  assert.equal(await m.usos("QR7M2KXA"), 3);
  assert.ok((await Promise.all(tels.map((t) => m.lead(t)))).every((l) => l.campana_id === m.campana.id));
  const tt = [telefonoNuevo(), telefonoNuevo(), telefonoNuevo()];
  for (const t of tt) await m.entra("Hola, mi código es TQPE-Q2K3", { telefono: t });
  assert.equal(await m.usos("TQPEQ2K3"), 2, "no pasa del tope");
  assert.deepEqual((await Promise.all(tt.map((t) => m.lead(t)))).map((l) => l.campana_id !== null), [true, true, false]);
  // El mismo lead que vuelve a escribir con el código (otro mensaje, otra conversación): no suma.
  const conv = randomInt(1, 2_000_000_000);
  const otro = telefonoNuevo();
  await m.entra("Hola, mi código es QR7M-2KXA", { telefono: otro, conversacion: conv });
  await m.entra("QR7M-2KXA otra vez", { telefono: otro, conversacion: conv });
  await m.entra("Hola de nuevo, mi código es QR7M-2KXA", { telefono: otro });
  assert.equal(await m.usos("QR7M2KXA"), 4, "un solo uso por lead");
  // El mismo mensaje reintentado por el proveedor (misma llave) tampoco.
  const tel = telefonoNuevo();
  const id = "mismo-mensaje-e2";
  await m.entra("Hola, mi código es QR7M-2KXA", { telefono: tel, idMensaje: id });
  const repetido = await m.entra("Hola, mi código es QR7M-2KXA", { telefono: tel, idMensaje: id });
  assert.equal(repetido.resultado, "duplicado");
  assert.equal(await m.usos("QR7M2KXA"), 5);
});

test("E2: el lead existente conserva su PRIMERA atribución (la de otro código o la de un anuncio); uno sin atribución (orgánico) sí la recibe", async () => {
  const m = await mundo();
  await m.crear("QR7M2KXA");
  const otraCampana = await prisma.campana.create({ data: { organizacion_id: m.e.org.organizacionId, nombre: "Otra", origen: "facebook" } });
  await prisma.codigo_rastreo.create({ data: { organizacion_id: m.e.org.organizacionId, codigo: "SEGUNDQ2", tipo: "campana", campana_id: otraCampana.id } });
  // 1. Entra con el primer código; luego escribe con el segundo: se queda la primera.
  const a = telefonoNuevo();
  await m.entra("Hola, mi código es QR7M-2KXA", { telefono: a });
  await m.entra("Hola, mi código es SEGU-NDQ2", { telefono: a });
  assert.equal((await m.lead(a)).campana_id, m.campana.id);
  assert.equal(await m.usos("SEGUNDQ2"), 0);
  // 2. Un lead que entró por un ANUNCIO (vía de atribución actual) conserva la del anuncio.
  const anuncio = new AtribucionSimulada();
  const b = telefonoNuevo();
  const idAnuncio = "m-anuncio-1";
  anuncio.programar(idAnuncio, { anuncioId: "ad-123", ctwaClid: "clid-9", anuncioTitulo: "Promo", tipoOrigen: "ad", urlOrigen: null, crudo: { ReferralSourceId: "ad-123" } });
  await m.entra("Hola, vengo del anuncio", { telefono: b, idMensaje: idAnuncio, atribucion: anuncio });
  await m.entra("Hola, mi código es QR7M-2KXA", { telefono: b });
  const leadB = await m.lead(b);
  assert.equal(leadB.anuncio_id, "ad-123");
  assert.deepEqual(leadB.atribucion, { ReferralSourceId: "ad-123" }, "el referral completo, sin mezclar");
  assert.equal(leadB.campana_id, null);
  // 3. Primer mensaje con el anuncio Y el código a la vez: manda el anuncio y el código no se cuenta.
  const c = telefonoNuevo();
  const idMixto = "m-anuncio-2";
  anuncio.programar(idMixto, { anuncioId: "ad-456", ctwaClid: "clid-8", anuncioTitulo: "Otra", tipoOrigen: "ad", urlOrigen: null, crudo: { ReferralSourceId: "ad-456" } });
  const antes = await m.usos("QR7M2KXA");
  await m.entra("Hola, mi código es QR7M-2KXA", { telefono: c, idMensaje: idMixto, atribucion: anuncio });
  const leadC = await m.lead(c);
  assert.equal(leadC.anuncio_id, "ad-456");
  assert.deepEqual(leadC.atribucion, { ReferralSourceId: "ad-456" });
  assert.equal(await m.usos("QR7M2KXA"), antes, "el código no se cuenta cuando manda el anuncio");
  // 4. Un lead orgánico (sin atribución alguna) que luego escribe con un código la recibe.
  const d = telefonoNuevo();
  await m.entra("Hola, buenas tardes", { telefono: d });
  assert.equal((await m.lead(d)).atribucion, null);
  await m.entra("Mi código es QR7M-2KXA", { telefono: d });
  const leadD = await m.lead(d);
  assert.equal(leadD.campana_id, m.campana.id);
  assert.equal((leadD.atribucion as { fuente: string }).fuente, "codigo");
  assert.equal(await m.usos("QR7M2KXA"), antes + 1);
});

test("E2: el código de un lead de la landing — del propio lead se consume (un solo uso); desde OTRO teléfono el lead nuevo recibe su campaña y queda ligado; ya consumido no sirve", async () => {
  const m = await mundo();
  const telLanding = "+525512340077";
  const lead = await prisma.lead.create({ data: { organizacion_id: m.e.org.organizacionId, vertical_interes_id: m.e.org.verticalId, sucursal_interes_id: m.e.org.sucursales[1]!.id, campana_id: m.campana.id, etapa_id: m.e.org.etapaInicialId, telefono: telLanding, atribucion: { fuente: "landing", utm: { utm_source: "fb" } } } });
  const propio = await prisma.codigo_rastreo.create({ data: { organizacion_id: m.e.org.organizacionId, codigo: "KEAD7QK2", tipo: "lead", lead_id: lead.id, campana_id: m.campana.id, max_usos: 1 } });
  const otro = await prisma.lead.create({ data: { organizacion_id: m.e.org.organizacionId, vertical_interes_id: m.e.org.verticalId, sucursal_interes_id: m.e.org.sucursales[1]!.id, campana_id: m.campana.id, etapa_id: m.e.org.etapaInicialId, telefono: "+525512340078", atribucion: { fuente: "landing" } } });
  await prisma.codigo_rastreo.create({ data: { organizacion_id: m.e.org.organizacionId, codigo: "KEAD8QK3", tipo: "lead", lead_id: otro.id, campana_id: m.campana.id, sucursal_id: m.e.org.sucursales[1]!.id, max_usos: 1 } });
  // Escribe desde el MISMO teléfono con el código: se consume y su atribución de la landing queda intacta.
  await m.entra("Hola, mi código es KEAD-7QK2", { telefono: telLanding });
  assert.equal(await m.usos("KEAD7QK2"), 1);
  assert.deepEqual((await m.lead(telLanding)).atribucion, { fuente: "landing", utm: { utm_source: "fb" } });
  assert.equal(await m.e.db.lead.count({ where: { telefono: telLanding } }), 1);
  // Ya consumido: otra persona que lo reenvía no recibe nada.
  const curioso = telefonoNuevo();
  await m.entra("Hola, mi código es KEAD-7QK2", { telefono: curioso });
  assert.equal((await m.lead(curioso)).atribucion, null);
  assert.equal(await m.usos("KEAD7QK2"), 1);
  void propio;
  // Escribe desde OTRO teléfono con el código de un lead que no ha escrito: el lead nuevo recibe campaña y sucursal del de la landing y queda ligado a él.
  const telDistinto = telefonoNuevo();
  await m.entra("Hola, mi código es KEAD-8QK3", { telefono: telDistinto });
  const nuevo = await m.lead(telDistinto);
  assert.equal(nuevo.campana_id, m.campana.id);
  assert.equal(nuevo.sucursal_interes_id, m.e.org.sucursales[1]!.id);
  assert.deepEqual(nuevo.atribucion, { fuente: "codigo_de_lead", codigo_rastreo: "KEAD8QK3", campana_id: m.campana.id, sucursal_del_codigo_id: m.e.org.sucursales[1]!.id, lead_de_landing_id: otro.id });
  assert.equal(await m.usos("KEAD8QK3"), 1);
});

test("E2: sin código, todo sigue como hoy — el lead nace sin atribución y sin tocar ningún código", async () => {
  const m = await mundo();
  await m.crear("QR7M2KXA");
  const tel = telefonoNuevo();
  await m.entra("Hola, quiero informes", { telefono: tel });
  const lead = await m.lead(tel);
  assert.deepEqual([lead.campana_id, lead.atribucion, lead.anuncio_id], [null, null, null]);
  assert.equal(await m.usos("QR7M2KXA"), 0);
});

test("E2 concurrencia FORZADA: dos leads nuevos usan a la vez un código con un solo uso — se atribuye UNO y el tope no se rompe", async () => {
  const m = await mundo();
  await m.crear("UNJKQQ72", { max_usos: 1 });
  const barrera = new Barrera(2);
  // Los dos mensajes arrancan su transacción a la vez (la barrera va antes: resolver la bandeja se hace fuera de ella).
  const raiz = conGanchos(prisma, { modelo: "bandeja_chatwoot", operacion: "findFirst", despues: async () => barrera.esperar(3000) });
  const transporte = new TransporteFalso();
  const deps = { prisma: raiz, mensajeria: new MessagingProvider({ transporte }) };
  const evento = (telefono: string): EventoEntrante => {
    const id = `m-conc-${telefono}`;
    return { chatwootAccountId: m.e.org.chatwootAccountId, chatwootInboxId: m.e.org.chatwootInboxId, chatwootConversacionId: randomInt(1, 2_000_000_000), idMensaje: id, contenido: "Hola, mi código es UNJK-QQ72", estadoConversacion: "pending", contacto: { nombre: "X", telefono }, creadoEn: null, llave: { proveedor: "chatwoot", id }, numeroReceptor: null, crudo: null };
  };
  const [a, b] = [telefonoNuevo(), telefonoNuevo()];
  const rs = await Promise.all([procesarEntrante(deps, evento(a)), procesarEntrante(deps, evento(b))]);
  assert.deepEqual(rs.map((r) => r.resultado), ["procesado", "procesado"]);
  assert.ok(barrera.completa, "los dos llegaron juntos");
  assert.equal(await m.usos("UNJKQQ72"), 1);
  const atribuidos = [await m.lead(a), await m.lead(b)].filter((l) => l.campana_id !== null);
  assert.equal(atribuidos.length, 1, "uno solo recibió la campaña");
});

test("EE-03: una campaña apagada, dada de baja, vencida o que aún no empieza apaga sus códigos también en el bot; el último día vale completo", async () => {
  const m = await mundo();
  const hoy = fechaLocal(new Date(), "America/Mexico_City");
  const mas = (dias: number): Date => new Date(Date.parse(`${hoy}T00:00:00Z`) + dias * 86_400_000);
  const casos: [string, Record<string, unknown>, boolean][] = [
    ["APAGADK4", { activo: false }, false],
    ["BAJACQK4", { eliminado_en: new Date() }, false],
    ["VENCDEK4", { fecha_fin: mas(-1) }, false],
    ["FUTURAK4", { fecha_inicio: mas(1) }, false],
    ["UTMDAAK4", { fecha_inicio: mas(-5), fecha_fin: mas(0) }, true],
    ["SNFCHAK4", {}, true],
  ];
  for (const [codigo, datos, vale] of casos) {
    const campana = await prisma.campana.create({ data: { organizacion_id: m.e.org.organizacionId, nombre: `Campaña ${codigo}`, origen: "presencial", ...datos } });
    await m.crear(codigo, { campana_id: campana.id });
    const tel = telefonoNuevo();
    const r = await m.entra(`Hola, mi código es ${codigo}`, { telefono: tel });
    assert.equal(r.resultado, "procesado", codigo);
    const lead = await m.lead(tel);
    assert.equal(lead.campana_id, vale ? campana.id : null, `${codigo}: ${vale ? "atribuye" : "se ignora"}`);
    assert.equal(await m.usos(codigo), vale ? 1 : 0, `${codigo}: usos`);
  }
});

test("EE-09 (R08): un código de campaña de OTRA vertical no atribuye en el bot de esta", async () => {
  const m = await mundo();
  const otraVertical = await prisma.vertical.create({ data: { organizacion_id: m.e.org.organizacionId, nombre: "Otra", slug: `o-${randomInt(1, 1_000_000)}` } });
  await m.crear("XTRAVQK4", { vertical_id: otraVertical.id });
  const tel = telefonoNuevo();
  await m.entra("Hola, mi código es XTRAVQK4", { telefono: tel });
  const lead = await m.lead(tel);
  assert.equal(lead.campana_id, null);
  assert.equal(lead.atribucion, null);
  assert.equal(await m.usos("XTRAVQK4"), 0);
});

test("EE-16: un mensaje con decenas de supuestos códigos no revienta la consulta: solo se buscan los primeros diez", async () => {
  const m = await mundo();
  await m.crear("QR7M2KXA");
  const basura = Array.from({ length: 60 }, (_, i) => `ZK${2 + (i % 8)}${2 + Math.floor(i / 8)}-3W4V`).join(" ");
  const tel = telefonoNuevo();
  const r = await m.entra(`${basura} Mi código es QR7M-2KXA`, { telefono: tel });
  assert.equal(r.resultado, "procesado");
  // El código real quedó más allá de los diez primeros candidatos: no se busca (el costo de la consulta está acotado); el lead se crea igual.
  assert.equal((await m.lead(tel)).campana_id, null);
});
