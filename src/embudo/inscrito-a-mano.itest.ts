// V10b: marcar a un lead como inscrito A MANO. Con el módulo de inscripción APAGADO el asesor o el administrador mueve al lead a la etapa de inscrito con una nota obligatoria y
// queda quién lo hizo; con el módulo ENCENDIDO solo se llega inscribiendo (rechazo con el mismo código de siempre y un mensaje que dice qué hacer). Postgres real, la app real y los
// cuatro roles. Lo que se prueba:
//   · la tabla de casos: módulo apagado/encendido × rol × etapa de origen, y la nota (válida, vacía, de espacios, corta, en el borde, larga);
//   · el servidor manda: con el módulo encendido se rechaza aunque la interfaz (o quien llame a la API) lo intente;
//   · el módulo se lee DENTRO del candado del lead: si se enciende (o se apaga) mientras la marca espera, gana el estado leído con el candado;
//   · dos marcas a la vez del mismo lead: una gana y queda un solo historial;
//   · el registro de cambios (quién, cuándo, de qué etapa a cuál y que fue «a mano», sin copiar la nota) y el historial de solo anexar con su marca;
//   · la inscripción real después de una marca a mano no choca, el lead cuenta una sola vez y el historial muestra los dos hechos;
//   · la corrección de una marca (solo el administrador, con nota);
//   · alcance por sucursal, lead sin sucursal y no-fuga entre organizaciones;
//   · el bot y las automatizaciones tratan al lead marcado como a cualquier inscrito.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import { revalidarLeadFrio } from "../automatizaciones/seguimiento.ts";
import { SOLO_CAPTACION, TODOS_ENCENDIDOS, aFilaDeModulos } from "../modulos/index.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escenarioBot } from "../testutil/bot.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { fijarConfiguracion, sembrarFamilia, type TipoDeEtapa } from "../testutil/semilla.ts";
import { sembrarUsuario, type ClienteApi } from "../testutil/api.ts";
import { reporteDeCostoPorCampana } from "../reportes/costo-campana.ts";
import { claveDeCandadoDeLead, moverEtapaDeLead } from "./historial.ts";
import { estaInscritoAMano, inscritosAMano } from "./inscrito-a-mano.ts";
import { LARGO_MINIMO_NOTA_A_MANO, MENSAJE_DE_RECHAZO } from "./transiciones.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
let etapas: Record<TipoDeEtapa, string>;
const ORG = () => m.org.organizacionId;
const db = () => conAlcance(prisma, ORG());

interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Movido { cambio: boolean; movimiento?: string; historial_id?: string; lead: { id: string; etapa_id: string } }
interface Historial {
  inscrito_a_mano: { por: { nombre: string } | null; en: string } | null;
  inscripciones: { fecha: string }[];
  cambios: { desde: { id: string } | null; hacia: { id: string }; origen: string; usuario: { id: string; nombre: string } | null; a_mano: boolean; motivo: string | null; nota: string | null }[];
}

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Inscrito a mano");
  etapas = {} as Record<TipoDeEtapa, string>;
  for (const e of await prisma.etapa_pipeline.findMany({ where: { organizacion_id: ORG() } })) if (e.tipo_sistema) etapas[e.tipo_sistema as TipoDeEtapa] = e.id;
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const apagar = () => fijarConfiguracion(prisma, ORG(), aFilaDeModulos(SOLO_CAPTACION));
const encender = () => fijarConfiguracion(prisma, ORG(), aFilaDeModulos(TODOS_ENCENDIDOS));
const lead = (tipo: TipoDeEtapa = "negociacion", sucursalId: string | null = m.norte) => sembrarFamilia(prisma, m.org, { sucursalId, etapaId: etapas[tipo] });
const NOTA = "Se inscribió en persona y pagó en efectivo";
const SIN_NOTA = Symbol("sin nota");
const marcar = (c: ClienteApi, leadId: string, nota: unknown = NOTA, extra: Record<string, unknown> = {}) =>
  c.patch<Movido & Errores>(`/api/leads/${leadId}/etapa`, { etapa_id: etapas.inscrito, ...(nota === SIN_NOTA ? {} : { nota }), ...extra });
const historial = (c: ClienteApi, id: string) => c.get<Historial & Errores>(`/api/leads/${id}/historial`);
const filasDe = (leadId: string) => db().lead_etapa_historial.findMany({ where: { lead_id: leadId }, orderBy: [{ secuencia: "asc" }] });
const etapaDe = async (leadId: string) => (await db().lead.findFirstOrThrow({ where: { id: leadId } })).etapa_id;

const ORIGENES: TipoDeEtapa[] = ["nuevo", "contactado", "muestra_agendada", "muestra_asistida", "negociacion", "perdido", "inscrito"];
const ROLES = ["administrador", "asesor", "recepcion", "maestro"] as const;

test("tabla de casos — módulo apagado/encendido × rol × etapa de origen: solo asesor y administrador, solo con la inscripción apagada y solo desde una etapa abierta", async () => {
  const clientes = (): Record<(typeof ROLES)[number], ClienteApi> => ({ administrador: m.admin, asesor: m.asesorNorte, recepcion: m.recepcion, maestro: m.maestro });
  for (const modulo of ["apagado", "encendido"] as const) {
    if (modulo === "apagado") await apagar();
    else await encender();
    for (const rol of ROLES) {
      for (const origen of ORIGENES) {
        const f = await lead(origen);
        const filasAntes = (await filasDe(f.leadId)).length;
        const r = await marcar(clientes()[rol], f.leadId);
        const caso = `${modulo} · ${rol} · ${origen}`;
        if (rol === "recepcion" || rol === "maestro") {
          assert.equal(r.estado, 403, caso);
          assert.equal(await etapaDe(f.leadId), etapas[origen], caso);
        } else if (origen === "inscrito") {
          // Ya está en la etapa: no se hace nada (idempotente), sin importar el módulo.
          assert.deepEqual([r.estado, r.cuerpo.cambio], [200, false], caso);
        } else if (modulo === "encendido") {
          assert.equal(r.estado, 409, caso);
          assert.equal(r.cuerpo.error.mensaje, MENSAJE_DE_RECHAZO.destino_ganado, caso);
          assert.match(r.cuerpo.error.mensaje, /inscríbela desde la ficha/, caso);
          assert.equal(await etapaDe(f.leadId), etapas[origen], caso);
        } else if (origen === "perdido") {
          assert.equal(r.estado, 409, caso);
          assert.match(r.cuerpo.error.mensaje, /primero recupérala/, caso);
          assert.equal(await etapaDe(f.leadId), etapas.perdido, caso);
        } else {
          assert.equal(r.estado, 200, `${caso}: ${JSON.stringify(r.cuerpo)}`);
          assert.deepEqual([r.cuerpo.cambio, r.cuerpo.movimiento, r.cuerpo.lead.etapa_id], [true, "inscripcion_a_mano", etapas.inscrito], caso);
          const filas = await filasDe(f.leadId);
          assert.equal(filas.length, filasAntes + 1, caso);
          assert.deepEqual([filas.at(-1)!.etapa_anterior_id, filas.at(-1)!.etapa_nueva_id, filas.at(-1)!.origen, filas.at(-1)!.a_mano], [etapas[origen], etapas.inscrito, "usuario", true], caso);
          continue;
        }
        assert.equal((await filasDe(f.leadId)).length, filasAntes, `${caso}: nada de lo rechazado deja historial`);
      }
    }
  }
});

test("la nota es obligatoria: vacía, de espacios, ausente, nula, corta y larga se rechazan con un mensaje que dice qué hacer; 10 y 1000 caracteres valen", async () => {
  await apagar();
  const casos: [string, unknown, number][] = [
    ["vacía", "", 400],
    ["solo espacios", "          ", 400],
    ["ausente", SIN_NOTA, 400],
    ["nula", null, 400],
    ["corta (9)", "123456789", 400],
    ["corta con espacios de los lados", "   pagó ya   ", 400],
    ["de 1001 caracteres", "x".repeat(1001), 400],
    ["en el borde (10)", "1234567890", 200],
    ["10 con espacios de los lados", "   1234567890   ", 200],
    ["en el otro borde (1000)", "x".repeat(1000), 200],
  ];
  assert.equal(LARGO_MINIMO_NOTA_A_MANO, 10);
  for (const [nombre, nota, estado] of casos) {
    const f = await lead("negociacion");
    const r = await marcar(m.asesorNorte, f.leadId, nota);
    assert.equal(r.estado, estado, `${nombre}: ${JSON.stringify(r.cuerpo)}`);
    if (estado === 400) {
      assert.ok(r.cuerpo.error.detalles?.some((d) => d.campo === "nota"), `${nombre}: el error dice en qué campo`);
      assert.equal(await etapaDe(f.leadId), etapas.negociacion, nombre);
      assert.equal((await filasDe(f.leadId)).length, 0, nombre);
    } else {
      const fila = (await filasDe(f.leadId)).at(-1)!;
      assert.equal(fila.nota, typeof nota === "string" ? nota.trim() : null, `${nombre}: la nota se guarda recortada`);
    }
  }
  // Los mensajes están en español y sin tecnicismos.
  const corta = await marcar(m.asesorNorte, (await lead()).leadId, "corta");
  assert.match(corta.cuerpo.error.detalles!.find((d) => d.campo === "nota")!.mensaje, /muy corta.*al menos 10 caracteres/);
  const sin = await marcar(m.asesorNorte, (await lead()).leadId, null);
  assert.match(sin.cuerpo.error.detalles!.find((d) => d.campo === "nota")!.mensaje, /hace falta una nota que diga cómo se inscribió/);
});

// V13-fix EV-26: 10 caracteres invisibles o «..........» NO cumplen la nota obligatoria.
test("EV-26: la nota con caracteres invisibles o de relleno (espacio de ancho cero, blanco braille, relleno hangul, puntos, signos) se rechaza como si estuviera vacía o corta; nada cambia", async () => {
  await apagar();
  const relleno: [string, string][] = [
    ["10 espacios de ancho cero", "\u200B".repeat(10)],
    ["10 blancos braille", "\u2800".repeat(10)],
    ["10 rellenos hangul", "\u3164".repeat(10)],
    ["10 puntos", ".".repeat(10)],
    ["signos y espacios", "¡!¿?-_-_ ... ¡!"],
    ["9 letras entre invisibles", "a\u200Bb\u200Bc\u200Bd\u200Be\u200Bf\u200Bg\u200Bh\u200Bi\u200B"],
  ];
  for (const [nombre, nota] of relleno) {
    const f = await lead("negociacion");
    const r = await marcar(m.asesorNorte, f.leadId, nota);
    assert.equal(r.estado, 400, `${nombre}: ${JSON.stringify(r.cuerpo)}`);
    assert.ok(r.cuerpo.error.detalles?.some((d) => d.campo === "nota"), nombre);
    assert.equal(await etapaDe(f.leadId), etapas.negociacion, nombre);
    assert.equal((await filasDe(f.leadId)).length, 0, nombre);
  }
  // Con 10 letras de verdad (aunque lleven invisibles intercalados) vale, y se guarda sin los invisibles.
  const f = await lead("negociacion");
  const ok = await marcar(m.asesorNorte, f.leadId, "P\u200Ba\u200Bg\u200Bó en efectivo ");
  assert.equal(ok.estado, 200, JSON.stringify(ok.cuerpo));
  assert.equal((await filasDe(f.leadId)).at(-1)!.nota, "Pagó en efectivo");
  // Corregir y recuperar pasan por el mismo filtro.
  const perdido = await lead("perdido");
  const sinContenido = await m.asesorNorte.patch<Errores>(`/api/leads/${perdido.leadId}/etapa`, { etapa_id: etapas.negociacion, nota: "\u200B\u200B..." });
  assert.equal(sinContenido.estado, 400, "recuperar con una nota sin contenido");
});

// V13-fix EV-06: la nota de inscrito a mano y la de recuperar un lead la leen todos los asesores; no es para datos de salud.
test("EV-06: la nota de inscrito a mano, de corrección y de recuperación no admite datos de salud (mismo freno que las notas de clase muestra); mensaje claro y nada cambia", async () => {
  await apagar();
  const CON_SALUD = "El niño tiene asma y toma salbutamol, pagó en efectivo";
  const a = await lead("negociacion");
  const r = await marcar(m.asesorNorte, a.leadId, CON_SALUD);
  assert.equal(r.estado, 400, JSON.stringify(r.cuerpo));
  const detalle = r.cuerpo.error.detalles!.find((d) => d.campo === "nota")!;
  assert.match(detalle.mensaje, /no son para datos de salud/);
  assert.match(detalle.mensaje, /sección de salud/);
  assert.equal(await etapaDe(a.leadId), etapas.negociacion);
  assert.equal((await filasDe(a.leadId)).length, 0, "no quedó la nota en el historial");
  // Recuperar un lead perdido.
  const p = await lead("perdido");
  const rec = await m.asesorNorte.patch<Errores>(`/api/leads/${p.leadId}/etapa`, { etapa_id: etapas.negociacion, nota: "Tiene diabetes y volvió a escribir" });
  assert.equal(rec.estado, 400, JSON.stringify(rec.cuerpo));
  assert.equal(await etapaDe(p.leadId), etapas.perdido);
  assert.equal((await filasDe(p.leadId)).length, 0);
  // Corrección (administrador) de una marca a mano.
  const c = await lead("negociacion");
  assert.equal((await marcar(m.asesorNorte, c.leadId)).estado, 200);
  const corr = await m.admin.patch<Errores>(`/api/leads/${c.leadId}/etapa`, { etapa_id: etapas.negociacion, nota: "Se corrige: el niño tiene alergia a los cacahuates" });
  assert.equal(corr.estado, 400, JSON.stringify(corr.cuerpo));
  assert.equal(await etapaDe(c.leadId), etapas.inscrito);
  // La misma nota sin salud, sí.
  assert.equal((await m.admin.patch<Errores>(`/api/leads/${c.leadId}/etapa`, { etapa_id: etapas.negociacion, nota: "Se corrige: se marcó por error" })).estado, 200);
  // Y con salud disfrazada (letras sueltas / invisibles) también se detecta, como en las demás notas.
  const d = await lead("negociacion");
  assert.equal((await marcar(m.asesorNorte, d.leadId, "ti\u200Bene as\u200Bma y pagó en efectivo")).estado, 400);
});

// V13-fix EV-31 (la sospecha del auditor, confirmada): `inscritosAMano` descartaba al lead si tenía CUALQUIER inscripción, también una dada de baja, y el costo por campaña cuenta solo las
// ACTIVAS: un lead que se inscribió, se dio de baja y la escuela volvió a marcar a mano (con la inscripción apagada) no se contaba en ningún lado.
test("EV-31: un lead con una inscripción dada de baja que se marca a mano después SÍ cuenta como inscrito a mano (en el costo por campaña también); con una inscripción activa, no", async () => {
  await apagar();
  const campana = (await prisma.campana.create({ data: { organizacion_id: ORG(), nombre: `Campaña EV-31 ${Math.random()}`, origen: "facebook" } })).id;
  const { grupoId } = await m.programa();
  const g = await prisma.grupo.findUniqueOrThrow({ where: { id: grupoId }, select: { programa_id: true } });
  const inscripcionDe = async (f: { leadId: string; prospectoId: string }, estatus: "activa" | "baja") => {
    const alumno = await prisma.alumno.create({ data: { organizacion_id: ORG(), nombre: "Alumno EV31", apellidos: "Prueba", fecha_nacimiento: new Date("2018-01-01") } });
    const hoy = new Date();
    const base = { organizacion_id: ORG(), alumno_id: alumno.id, grupo_id: grupoId, programa_id: g.programa_id, lead_id: f.leadId, prospecto_id: f.prospectoId, fecha_inscripcion: hoy, fecha_inicio: hoy, precio_inscripcion_aplicado: "100.00", precio_mensualidad_aplicado: "200.00", dia_corte_pago: 5 };
    await prisma.inscripcion.create({ data: estatus === "baja" ? { ...base, estatus: "baja", fecha_baja: hoy, motivo_baja_id: m.motivoBaja } : base });
  };
  // A: se inscribió y se dio de baja; luego (inscripción apagada) la marcan a mano.
  const a = await lead("negociacion");
  await prisma.lead.update({ where: { id: a.leadId }, data: { campana_id: campana } });
  await inscripcionDe(a, "baja");
  assert.equal((await marcar(m.asesorNorte, a.leadId)).estado, 200);
  // B: tiene una inscripción ACTIVA y además una marca a mano antigua: cuenta por la inscripción, no a mano.
  const b = await lead("negociacion");
  await prisma.lead.update({ where: { id: b.leadId }, data: { campana_id: campana } });
  assert.equal((await marcar(m.asesorNorte, b.leadId)).estado, 200);
  await inscripcionDe(b, "activa");
  const manos = await inscritosAMano(db(), { leadIds: [a.leadId, b.leadId] });
  assert.ok(manos.has(a.leadId), "con solo una inscripción en baja, la marca a mano cuenta");
  assert.ok(!manos.has(b.leadId), "con una inscripción activa cuenta por la inscripción");
  const fila = (await reporteDeCostoPorCampana(db(), { campanaId: campana })).filas[0]!;
  assert.deepEqual([fila.inscritos_a_mano, fila.inscripciones_activas, fila.alumnos_inscritos], [1, 1, 2], "cada lead cuenta una vez: A a mano, B por su inscripción");
  // La corrección de A también pide nota (es una marca a mano de verdad).
  const corregir = await m.admin.patch<Errores>(`/api/leads/${a.leadId}/etapa`, { etapa_id: etapas.negociacion });
  assert.equal(corregir.estado, 400, JSON.stringify(corregir.cuerpo));
});

test("la base también lo impide: una marca a mano sin nota suficiente, o del sistema, no entra al historial", async () => {
  const f = await lead();
  const base = { organizacion_id: ORG(), lead_id: f.leadId, etapa_anterior_id: etapas.negociacion, etapa_nueva_id: etapas.inscrito, a_mano: true };
  await assert.rejects(prisma.lead_etapa_historial.create({ data: { ...base, origen: "usuario", usuario_id: m.adminId, nota: "corta" } }), /a_mano_check/);
  await assert.rejects(prisma.lead_etapa_historial.create({ data: { ...base, origen: "usuario", usuario_id: m.adminId } }), /a_mano_check/);
  await assert.rejects(prisma.lead_etapa_historial.create({ data: { ...base, origen: "sistema", nota: NOTA } }), /a_mano_check|origen_check/);
});

test("queda quién lo hizo, cuándo y la nota: historial con la marca, registro de cambios sin copiar la nota, interacción, y la ficha lo muestra", async () => {
  await apagar();
  for (const [rol, cliente, usuarioId] of [["asesor", m.asesorNorte, null], ["administrador", m.admin, m.adminId]] as const) {
    const f = await lead("muestra_asistida");
    const r = await marcar(cliente, f.leadId, `  ${NOTA} (${rol})  `);
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
    const filas = await filasDe(f.leadId);
    assert.equal(filas.length, 1);
    const fila = filas[0]!;
    assert.deepEqual([fila.a_mano, fila.origen, fila.motivo, fila.nota, fila.es_recuperacion, fila.etapa_anterior_id, fila.etapa_nueva_id], [true, "usuario", "inscripcion_a_mano", `${NOTA} (${rol})`, false, etapas.muestra_asistida, etapas.inscrito]);
    assert.ok(fila.usuario_id, "la fila sabe quién");
    if (usuarioId) assert.equal(fila.usuario_id, usuarioId);
    assert.equal(r.cuerpo.historial_id, fila.id);
    // El registro de cambios: quién (usuario), cuándo (creado_en), qué lead, de qué etapa a cuál y que fue a mano; apunta al historial y NO copia el texto de la nota.
    const reg = await db().registro_cambio.findMany({ where: { entidad_tipo: "lead", entidad_id: f.leadId } });
    assert.equal(reg.length, 1);
    assert.equal(reg[0]!.usuario_id, fila.usuario_id);
    assert.equal(reg[0]!.accion, "actualizar");
    assert.deepEqual(reg[0]!.despues, { etapa_id: etapas.inscrito, inscrito_a_mano: true, historial_id: fila.id });
    assert.deepEqual(reg[0]!.antes, { etapa_id: etapas.muestra_asistida });
    assert.ok(!JSON.stringify(reg[0]).includes("efectivo"), "el texto libre de la nota no se copia al registro de solo anexar");
    assert.ok(reg[0]!.creado_en instanceof Date);
    const inter = await db().interaccion.findMany({ where: { lead_id: f.leadId, tipo: "cambio_etapa" } });
    assert.equal(inter.length, 1);
    assert.equal((inter[0]!.datos as { movimiento: string }).movimiento, "inscripcion_a_mano");
    // Lo que ve la ficha.
    const h = (await historial(cliente, f.leadId)).cuerpo;
    assert.equal(h.cambios.length, 1);
    assert.deepEqual([h.cambios[0]!.a_mano, h.cambios[0]!.origen, h.cambios[0]!.usuario?.id, h.cambios[0]!.nota], [true, "usuario", fila.usuario_id, `${NOTA} (${rol})`]);
    assert.equal(h.inscrito_a_mano?.por?.nombre, h.cambios[0]!.usuario?.nombre);
    assert.deepEqual(h.inscripciones, [], "con el módulo apagado el historial no lee inscripciones");
    // Recepción lee el avance, pero no la nota del asesor.
    const deRecepcion = (await historial(m.recepcion, f.leadId)).cuerpo;
    assert.deepEqual([deRecepcion.cambios[0]!.a_mano, deRecepcion.cambios[0]!.nota], [true, null]);
  }
});

test("la marca es idempotente: repetirla no duplica el historial ni el registro; con la etapa que vio la pantalla, la segunda recibe 409", async () => {
  await apagar();
  const f = await lead("contactado");
  assert.equal((await marcar(m.asesorNorte, f.leadId, NOTA, { desde_etapa_id: etapas.contactado })).estado, 200);
  const igual = await marcar(m.asesorNorte, f.leadId);
  assert.deepEqual([igual.estado, igual.cuerpo.cambio], [200, false], "sin desde_etapa_id: no hace nada");
  const vieja = await marcar(m.asesorNorte, f.leadId, NOTA, { desde_etapa_id: etapas.contactado });
  assert.equal(vieja.estado, 409, "con la etapa vieja: el lead ya cambió");
  assert.equal((await filasDe(f.leadId)).filter((x) => x.a_mano).length, 1);
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "lead", entidad_id: f.leadId } }), 1);
});

test("el servidor manda: con el módulo encendido se rechaza aunque la interfaz esté manipulada (otra etapa de inscrito, nota perfecta, id de etapa directo) y no queda rastro", async () => {
  await encender();
  const f = await lead("negociacion");
  for (const cuerpo of [{ etapa_id: etapas.inscrito, nota: NOTA }, { etapa_id: etapas.inscrito, nota: NOTA, desde_etapa_id: etapas.negociacion }, { etapa_id: etapas.inscrito, nota: "x".repeat(500) }]) {
    for (const c of [m.admin, m.asesorNorte]) {
      const r = await c.patch<Errores>(`/api/leads/${f.leadId}/etapa`, cuerpo);
      assert.equal(r.estado, 409);
      assert.equal(r.cuerpo.error.mensaje, "Para marcar a la familia como inscrita, inscríbela desde la ficha");
    }
  }
  assert.equal(await etapaDe(f.leadId), etapas.negociacion);
  assert.equal((await filasDe(f.leadId)).length, 0);
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "lead", entidad_id: f.leadId } }), 0);
});

/** Espera a que haya una transacción esperando un candado (la marca ya llegó a su candado y está detenida). */
async function esperarAQueAlguienEspere(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const filas = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
    if ((filas[0]?.n ?? 0n) > 0n) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Nadie llegó a esperar el candado");
}

/** Sostiene el candado del lead, lanza `lanzar` (que se queda esperándolo), corre `entretanto` y suelta el candado. Devuelve lo que contestó `lanzar`. */
async function conCandadoSostenido<R>(leadId: string, lanzar: () => Promise<R>, entretanto: () => Promise<void>): Promise<R> {
  let soltar!: () => void;
  const suelto = new Promise<void>((r) => (soltar = r));
  let tomado!: () => void;
  const yaTomado = new Promise<void>((r) => (tomado = r));
  const sosteniendo = transaccionConBloqueo(db(), ORG(), claveDeCandadoDeLead(leadId), async () => {
    tomado();
    await suelto;
  });
  await yaTomado;
  const pendiente = lanzar();
  await esperarAQueAlguienEspere();
  await entretanto();
  soltar();
  await sosteniendo;
  return pendiente;
}

test("concurrencia — si encienden el módulo mientras la marca espera el candado del lead, gana el estado leído con el candado: se rechaza", async () => {
  await apagar();
  const f = await lead("negociacion");
  const r = await conCandadoSostenido(
    f.leadId,
    () => marcar(m.asesorNorte, f.leadId),
    () => encender(),
  );
  assert.equal(r.estado, 409, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.error.mensaje, MENSAJE_DE_RECHAZO.destino_ganado);
  assert.equal(await etapaDe(f.leadId), etapas.negociacion);
  assert.equal((await filasDe(f.leadId)).length, 0);
});

test("concurrencia — si apagan el módulo mientras la marca espera el candado, también gana lo leído con el candado: se acepta", async () => {
  await encender();
  const f = await lead("negociacion");
  const r = await conCandadoSostenido(
    f.leadId,
    () => marcar(m.asesorNorte, f.leadId),
    () => apagar(),
  );
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.equal(await etapaDe(f.leadId), etapas.inscrito);
  assert.equal((await filasDe(f.leadId)).filter((x) => x.a_mano).length, 1);
});

test("concurrencia — dos marcas simultáneas del mismo lead (con la etapa que vieron): una gana, la otra recibe 409 y queda un solo historial y un solo registro", async () => {
  await apagar();
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const f = await lead("negociacion");
    const [a, b] = await Promise.all([marcar(m.asesorNorte, f.leadId, NOTA, { desde_etapa_id: etapas.negociacion }), marcar(m.admin, f.leadId, `${NOTA} otra vez`, { desde_etapa_id: etapas.negociacion })]);
    assert.deepEqual([a.estado, b.estado].sort(), [200, 409], `vuelta ${vuelta}: ${JSON.stringify([a.cuerpo, b.cuerpo])}`);
    assert.equal((await filasDe(f.leadId)).filter((x) => x.a_mano).length, 1, `vuelta ${vuelta}`);
    assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "lead", entidad_id: f.leadId } }), 1, `vuelta ${vuelta}`);
  }
  // Sin la etapa que vieron, la segunda no hace nada (200 sin cambio): el resultado sigue siendo uno solo.
  const g = await lead("negociacion");
  const [c, d] = await Promise.all([marcar(m.asesorNorte, g.leadId), marcar(m.admin, g.leadId)]);
  assert.deepEqual([c.cuerpo.cambio, d.cuerpo.cambio].sort(), [false, true]);
  assert.equal((await filasDe(g.leadId)).filter((x) => x.a_mano).length, 1);
});

test("alcance — el asesor de otra sucursal recibe 404, un lead sin sucursal lo marca cualquier asesor y el administrador todos; otra organización, 404 y sin fuga", async () => {
  await apagar();
  const deNorte = await lead("negociacion", m.norte);
  assert.equal((await marcar(m.asesorSur, deNorte.leadId)).estado, 404);
  assert.equal(await etapaDe(deNorte.leadId), etapas.negociacion);
  assert.equal((await marcar(m.asesorNorte, deNorte.leadId)).estado, 200);
  const sinSucursal = await lead("contactado", null);
  assert.equal((await marcar(m.asesorSur, sinSucursal.leadId)).estado, 200, "V2, decisión 5: un lead sin sucursal lo atienden todos los asesores");
  const deSur = await lead("nuevo", m.sur);
  assert.equal((await marcar(m.admin, deSur.leadId)).estado, 200);
  // Otra organización: ni ve ni marca, y su etapa de inscrito no sirve en esta.
  const ajeno = await mundoDeFinanzas(prisma, "Inscrito a mano ajena");
  try {
    await fijarConfiguracion(prisma, ajeno.org.organizacionId, aFilaDeModulos(SOLO_CAPTACION));
    const etapaAjena = (await prisma.etapa_pipeline.findFirstOrThrow({ where: { organizacion_id: ajeno.org.organizacionId, tipo_sistema: "inscrito" } })).id;
    const mio = await lead("negociacion");
    assert.equal((await ajeno.admin.patch<Errores>(`/api/leads/${mio.leadId}/etapa`, { etapa_id: etapaAjena, nota: NOTA })).estado, 404, "el administrador de otra organización no ve mi lead");
    const r = await m.admin.patch<Errores>(`/api/leads/${mio.leadId}/etapa`, { etapa_id: etapaAjena, nota: NOTA });
    assert.equal(r.estado, 400, "la etapa de otra organización no existe aquí");
    assert.equal(await etapaDe(mio.leadId), etapas.negociacion);
    // El lead de la otra organización marcado a mano no aparece en mis consultas.
    const suyo = await sembrarFamilia(prisma, ajeno.org, { etapaId: etapaAjena });
    await prisma.lead_etapa_historial.create({ data: { organizacion_id: ajeno.org.organizacionId, lead_id: suyo.leadId, etapa_anterior_id: null, etapa_nueva_id: etapaAjena, origen: "usuario", usuario_id: ajeno.adminId, a_mano: true, nota: NOTA } });
    assert.equal((await inscritosAMano(conAlcance(prisma, ajeno.org.organizacionId))).has(suyo.leadId), true);
    assert.equal((await inscritosAMano(db())).has(suyo.leadId), false, "no hay fuga entre organizaciones");
  } finally {
    await ajeno.cerrar();
  }
});

test("revertir — se enciende el módulo y se inscribe de verdad al lead que estaba inscrito a mano: la inscripción no choca, cuenta una sola vez y el historial muestra los dos hechos", async () => {
  await apagar();
  const a = await m.alumno();
  const g = await m.programa();
  await prisma.lead.update({ where: { id: a.leadId }, data: { etapa_id: etapas.negociacion } });
  assert.equal((await marcar(m.asesorNorte, a.leadId)).estado, 200);
  assert.equal(await estaInscritoAMano(db(), a.leadId), true);
  await encender();
  const ins = await m.inscribir({ alumno: a, grupoId: g.grupoId });
  assert.ok(ins.inscripcionId, "la inscripción real se hizo sin chocar con el estado «inscrito»");
  assert.equal(await etapaDe(a.leadId), etapas.inscrito);
  assert.equal((await filasDe(a.leadId)).length, 1, "ninguna fila nueva: ya estaba en «inscrito»");
  assert.equal(await estaInscritoAMano(db(), a.leadId), false, "con una inscripción real ya no es «a mano»");
  const h = (await historial(m.asesorNorte, a.leadId)).cuerpo;
  assert.equal(h.inscrito_a_mano, null);
  assert.equal(h.cambios.filter((c) => c.a_mano).length, 1, "el hecho «a mano» sigue en el historial");
  assert.equal(h.inscripciones.length, 1, "y la inscripción real aparece junto a él");
});

test("corregir — solo el administrador y con nota; el asesor recibe 409; queda como corrección en el historial y el registro; después se puede volver a marcar", async () => {
  await apagar();
  const f = await lead("negociacion");
  assert.equal((await marcar(m.asesorNorte, f.leadId)).estado, 200);
  const atras = (c: ClienteApi, cuerpo: Record<string, unknown>) => c.patch<Movido & Errores>(`/api/leads/${f.leadId}/etapa`, { etapa_id: etapas.contactado, ...cuerpo });
  const asesor = await atras(m.asesorNorte, { nota: NOTA });
  assert.equal(asesor.estado, 409);
  assert.match(asesor.cuerpo.error.mensaje, /solo un administrador/);
  for (const [nombre, cuerpo] of [["sin nota", {}], ["nota corta", { nota: "error" }]] as const) {
    const r = await atras(m.admin, cuerpo);
    assert.equal(r.estado, 400, nombre);
    assert.ok(r.cuerpo.error.detalles?.some((d) => d.campo === "nota"), nombre);
    assert.equal(await etapaDe(f.leadId), etapas.inscrito, nombre);
  }
  const ok = await atras(m.admin, { nota: "Marcada por error: todavía no paga" });
  assert.equal(ok.estado, 200, JSON.stringify(ok.cuerpo));
  assert.equal(ok.cuerpo.movimiento, "correccion_de_inscrito_a_mano");
  assert.equal(await etapaDe(f.leadId), etapas.contactado);
  const filas = await filasDe(f.leadId);
  assert.deepEqual(filas.map((x) => [x.a_mano, x.motivo]), [[true, "inscripcion_a_mano"], [false, "correccion_de_inscrito_a_mano"]]);
  const reg = await db().registro_cambio.findMany({ where: { entidad_tipo: "lead", entidad_id: f.leadId }, orderBy: [{ creado_en: "asc" }] });
  assert.equal(reg.length, 2);
  assert.deepEqual([reg[1]!.antes, reg[1]!.despues], [{ etapa_id: etapas.inscrito, inscrito_a_mano: true }, { etapa_id: etapas.contactado, inscrito_a_mano: false, historial_id: filas[1]!.id }]);
  assert.equal(await estaInscritoAMano(db(), f.leadId), false);
  // Volver a marcarlo: vale y queda como la marca vigente.
  assert.equal((await marcar(m.asesorNorte, f.leadId, "Ahora sí pagó la inscripción")).estado, 200);
  assert.equal(await estaInscritoAMano(db(), f.leadId), true);
  assert.equal((await filasDe(f.leadId)).filter((x) => x.a_mano).length, 2);
  // Un inscrito de verdad (sin marca a mano) sigue corrigiéndose como siempre: el administrador, sin nota obligatoria.
  const real = await lead("inscrito");
  assert.equal((await m.admin.patch<Errores>(`/api/leads/${real.leadId}/etapa`, { etapa_id: etapas.negociacion })).estado, 200);
});

test("un lead perdido se recupera primero (con su nota) y después se marca; las matrices de la escuela siguen valiendo", async () => {
  await apagar();
  const f = await lead("perdido");
  assert.equal((await marcar(m.asesorNorte, f.leadId)).estado, 409);
  assert.equal((await m.asesorNorte.patch<Errores>(`/api/leads/${f.leadId}/etapa`, { etapa_id: etapas.negociacion, nota: "Volvió a escribir" })).estado, 200);
  assert.equal((await marcar(m.asesorNorte, f.leadId)).estado, 200);
  // Una regla de la matriz «prohibida» para ese par se respeta.
  const g = await lead("contactado");
  const regla = await prisma.transicion_etapa.create({ data: { organizacion_id: ORG(), desde_etapa_id: etapas.contactado, hacia_etapa_id: etapas.inscrito, regla: "prohibida" } });
  try {
    assert.equal((await marcar(m.asesorNorte, g.leadId)).estado, 409);
    await prisma.transicion_etapa.update({ where: { id: regla.id }, data: { regla: "solo_administrador" } });
    assert.equal((await marcar(m.asesorNorte, g.leadId)).estado, 409, "solo_administrador");
    assert.equal((await marcar(m.admin, g.leadId)).estado, 200);
  } finally {
    await prisma.transicion_etapa.delete({ where: { id: regla.id } });
  }
});

test("el sistema lo trata como a cualquier inscrito: el lead frío y su aviso se cancelan, no sale como estancado, y el bot contesta sin romperse", async () => {
  await apagar();
  const f = await lead("negociacion");
  const vencido = new Date("2020-01-01T00:00:00Z");
  await prisma.etapa_pipeline.update({ where: { id: etapas.negociacion }, data: { dias_alerta_sin_movimiento: 3 } });
  await prisma.lead.update({ where: { id: f.leadId }, data: { ultima_interaccion_en: vencido } });
  const antes = await revalidarLeadFrio(db(), f.leadId, { offset_minutos: 0 }, new Date("2026-11-10T16:00:00Z"));
  assert.equal(antes.ok, true, "control: en negociación y sin movimiento, está frío");
  assert.equal((await marcar(m.asesorNorte, f.leadId)).estado, 200);
  const despues = await revalidarLeadFrio(db(), f.leadId, { offset_minutos: 0 }, new Date("2026-11-10T16:00:00Z"));
  assert.deepEqual(despues, { ok: false, motivo: "lead_inscrito" });
  const estancados = await m.admin.get<{ datos: { id: string }[] }>("/api/leads/estancados?limite=200");
  assert.ok(!estancados.cuerpo.datos.some((x) => x.id === f.leadId));
  await prisma.etapa_pipeline.update({ where: { id: etapas.negociacion }, data: { dias_alerta_sin_movimiento: null } });
});

test("el bot y el webhook de un contacto cuyo lead se marcó a mano: contesta sin error y el lead sigue inscrito", async () => {
  const e = await escenarioBot(prisma, { embudo: true });
  const c = e.contacto();
  await c.escribe("Hola");
  const conv = await c.conversacion();
  const usuario = await sembrarUsuario(prisma, e.org.organizacionId, { rol: "asesor", sucursales: [] });
  await fijarConfiguracion(prisma, e.org.organizacionId, aFilaDeModulos(SOLO_CAPTACION));
  const r = await moverEtapaDeLead(e.db, { usuarioId: usuario.id, organizacionId: e.org.organizacionId, esAdministrador: false, ahora: new Date() }, { leadId: conv.lead_id, haciaEtapaId: e.etapas!.inscrito, nota: NOTA });
  assert.deepEqual([r.ok, r.ok && r.cambio ? r.tipo : null], [true, "inscripcion_a_mano"]);
  for (const texto of ["Hola de nuevo", "¿Cuánto cuesta?", "BAJA", ""]) await c.escribe(texto);
  assert.equal((await e.db.lead.findFirstOrThrow({ where: { id: conv.lead_id } })).etapa_id, e.etapas!.inscrito, "el bot no mueve a un inscrito");
});
