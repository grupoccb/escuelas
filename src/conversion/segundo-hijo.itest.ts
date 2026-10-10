// V3, «segundo hijo», de la ficha al cobro. Postgres real, la app real. El asesor agrega a los hermanos a un lead (API) y la conversión los inscribe a todos en UNA operación:
//   · cero recaptura: del adulto se captura una sola vez y de cada niño lo que el asesor ya escribió (apellidos, fecha de nacimiento); el reglamento del hermano se extiende a propósito;
//   · la promoción por hermanos se aplica sola con los hermanos de la misma operación, en centavos exactos, y la cotización que se enseña antes (con los hermanos previstos) es
//     EXACTAMENTE lo que se cobra; una promoción no acumulable no se mezcla; los cargos son por hijo y la cuadratura cuadra;
//   · todos entran o ninguno (un grupo lleno rechaza la operación completa, sin nada a medias) y la salida: dejar fuera a ese niño o ponerlo en lista de espera;
//   · idempotente por lead, dos conversiones simultáneas del mismo lead, dos familias por el último lugar, y EF-11: dos hermanos inscritos a la vez por separado se ven entre sí.
// Cada prueba arma su propia organización (las promociones y los grupos son de la organización).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada } from "../testutil/api.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";

const AHORA = new Date("2026-11-10T18:00:00Z"); // martes, mediodía en la Ciudad de México; hoy = 2026-11-10
const cifrador = crearCifrador(randomBytes(32));
let prisma: PrismaPruebas;
let api: ApiLevantada;
before(() => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador } });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Conv { ya_convertido: boolean; tutor_id: string | null; alumnos: { prospecto_id: string; alumno_id: string; creado: boolean; tutor_ids: string[]; inscripcion: { id: string; grupo_id: string; creada: boolean } | null }[] }
interface Previa { listo: boolean; faltantes: { campo: string; mensaje: string }[]; prospectos: { prospecto_id: string; ya_convertido: boolean }[]; previsiones: { prospecto_id: string; hermanos_previstos: number; reglamento_pendiente: boolean }[] }
interface Insc { id: string; precio_inscripcion_aplicado: string; precio_mensualidad_aplicado: string; descuento_inscripcion_aplicado: string; descuento_mensualidad_aplicado: string; promociones: { promocion_id?: string; tipo: string }[] }
interface Cotizador { programas: { promociones: { inscripcion: { final_ahora: string }; mensualidad: { final_ahora: string } } }[] }

const centavos = (t: string): bigint => BigInt(t.replace(".", ""));
const texto = (c: bigint): string => `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}`;

let contador = 0;
/** Una escuela de prueba: programa de 3 a 14 años (inscripción $500.00, mensualidad $800.00) con los grupos pedidos, un asesor del norte y un administrador. */
async function mundo(o: { cupos?: number[] } = {}) {
  const org = await sembrarOrganizacion(prisma, "Segundo hijo");
  const etapas = await sembrarEmbudo(prisma, org);
  const docs = await sembrarDocumentosLegales(prisma, org);
  const norte = org.sucursales[0]!.id;
  const db = conAlcance(prisma, org.organizacionId);
  const entrar = async (rol: "administrador" | "asesor") => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales: rol === "asesor" ? [norte] : [] });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  const admin = await entrar("administrador");
  const asesor = await entrar("asesor");
  const cupos = o.cupos ?? [20, 20, 20];
  const programa = await sembrarPrograma(prisma, org, {
    sucursalId: norte,
    nombre: `Programa V3 ${++contador}`,
    edadMin: 3,
    edadMax: 14,
    grupos: cupos.map((cupo, i) => ({ nombre: `Grupo ${i + 1}`, cupoMaximo: cupo, permiteListaEspera: true, horarios: [[i % 7, 480, 530]] as [number, number, number][] })),
    precio: { inscripcion: "500.00", mensualidad: "800.00" },
  });
  const grupos = programa.grupos.map((g) => g.id);
  /** Una promoción por hermanos: «a partir del niño n», con sus beneficios en porcentaje. */
  const promoHermanos = async (nombre: string, hermanos: number, o2: { acumulable?: boolean; prioridad?: number; mensualidad?: string; inscripcion?: string }) => {
    const p = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre, codigo: `${nombre}-${randomUUID().slice(0, 6)}`.toUpperCase(), vigencia_desde: new Date("2020-01-01"), condicion_tipo: "min_hermanos", condicion_valor: { hermanos }, acumulable: o2.acumulable ?? true, prioridad: o2.prioridad ?? 5 } });
    if (o2.mensualidad) await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: p.id, tipo: "descuento_mensualidad", modo: "porcentaje", valor: o2.mensualidad } });
    if (o2.inscripcion) await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: p.id, tipo: "descuento_inscripcion", modo: "porcentaje", valor: o2.inscripcion } });
    return p.id;
  };
  /** Un lead del bot con su primer niño «Primero» (nombre y edad, nada más), en negociación. */
  const familia = async () => {
    const f = await sembrarFamilia(prisma, org, { sucursalId: norte, nombre: "Primero", edad: 8, etapaId: etapas.negociacion });
    return f;
  };
  return { org, db, norte, admin, asesor, grupos, programaId: programa.id, promoHermanos, familia, docs, etapas };
}

type Mundo = Awaited<ReturnType<typeof mundo>>;

/** El reglamento aceptado por la familia para ese niño (lo que hace el asesor en persona). */
async function aceptar(m: Mundo, leadId: string, prospectoId: string): Promise<void> {
  const d = await prisma.documento_legal.findFirstOrThrow({ where: { id: m.docs.reglamento } });
  await prisma.aceptacion_legal.create({ data: { organizacion_id: m.org.organizacionId, documento_id: d.id, tipo: "reglamento", version_aceptada: 1, resultado: "aceptada", lead_id: leadId, prospecto_id: prospectoId, aceptante_nombre: "Rosa Mena", aceptante_parentesco: "madre", canal: "presencial", aceptado_en: AHORA, texto_hash: d.texto_hash } });
}

/** El lead con Primero (corregido con apellidos y fecha) y los hermanos agregados por la API, en ese orden. Devuelve los ids de los niños. */
async function familiaConHermanos(m: Mundo, hermanos: { nombre: string; apellidos: string; fecha: string }[]) {
  const f = await m.familia();
  const c = await m.asesor.patch(`/api/leads/${f.leadId}/prospectos/${f.prospectoId}`, { apellidos: "Mena Ruiz", fecha_nacimiento: "2018-06-01" });
  assert.equal(c.estado, 200, JSON.stringify(c.cuerpo));
  const ids = [f.prospectoId];
  for (const h of hermanos) {
    const r = await m.asesor.post<{ id: string } & Errores>(`/api/leads/${f.leadId}/prospectos`, { nombre: h.nombre, apellidos: h.apellidos, fecha_nacimiento: h.fecha });
    assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
    ids.push(r.cuerpo.id);
  }
  await aceptar(m, f.leadId, f.prospectoId);
  return { ...f, ids };
}

test("DE LA FICHA AL COBRO: el asesor agrega a la hermana; solo se pide el parentesco del adulto una vez y los grupos; la promoción por hermanos le toca a la segunda, en centavos exactos, y la cotización previa es lo que se cobra", async () => {
  const m = await mundo();
  const promo = await m.promoHermanos("Hermanos", 2, { mensualidad: "10.00", inscripcion: "5.00" });
  const f = await familiaConHermanos(m, [{ nombre: "Segunda", apellidos: "Mena Ruiz", fecha: "2020-09-09" }]);
  const [primero, segunda] = f.ids as [string, string];

  // La familia ya aceptó el reglamento por Primero: por la segunda se extiende a propósito (otra aceptación, con la evidencia de dónde salió).
  const sin = await m.asesor.get<Previa>(`/api/leads/${f.leadId}/conversion`);
  assert.deepEqual(sin.cuerpo.faltantes.map((x) => x.campo).sort(), ["tutor.parentesco", `prospectos.${primero}.grupo_id`, `prospectos.${segunda}.grupo_id`].sort(), "apellidos y fecha de los dos ya los capturó el asesor; el adulto se pregunta UNA vez");
  assert.deepEqual(sin.cuerpo.previsiones.map((p) => p.reglamento_pendiente), [false, true], "a la segunda le falta el reglamento");
  const ext = await m.asesor.post<{ creada: boolean; version: number } & Errores>(`/api/leads/${f.leadId}/prospectos/${segunda}/aceptaciones-del-hermano`, { desde_prospecto_id: primero });
  assert.equal(ext.estado, 201, JSON.stringify(ext.cuerpo));
  const evidencia = await m.db.aceptacion_legal.findFirstOrThrow({ where: { prospecto_id: segunda, tipo: "reglamento" } });
  assert.deepEqual([evidencia.aceptante_nombre, evidencia.aceptante_parentesco, evidencia.canal, evidencia.evidencia], ["Rosa Mena", "madre", "presencial", { extendida_de_prospecto: primero }]);
  assert.equal((await m.asesor.post(`/api/leads/${f.leadId}/prospectos/${segunda}/aceptaciones-del-hermano`, { desde_prospecto_id: primero })).estado, 200, "repetirlo no duplica");
  assert.deepEqual((await m.asesor.get<Previa>(`/api/leads/${f.leadId}/conversion`)).cuerpo.previsiones.map((p) => p.reglamento_pendiente), [false, false]);

  // La cotización PREVIA de cada niño: el cotizador con los hermanos que la vista previa prevé para él.
  const previa = (await m.asesor.get<Previa>(`/api/leads/${f.leadId}/conversion`)).cuerpo;
  assert.deepEqual(previa.faltantes.map((x) => x.campo).sort(), ["tutor.parentesco", `prospectos.${primero}.grupo_id`, `prospectos.${segunda}.grupo_id`].sort());
  assert.deepEqual(previa.previsiones.map((p) => p.hermanos_previstos), [0, 1], "el primero no tiene hermanos inscritos; la segunda ya cuenta con el primero de la misma operación");
  const cotizacion = async (hermanos: number) => (await m.asesor.get<Cotizador>(`/api/cotizador?vertical_id=${m.org.verticalId}&sucursal_id=${m.norte}&edad=8&fecha=2026-11-10&hermanos_inscritos=${hermanos}`)).cuerpo.programas[0]!.promociones;
  assert.deepEqual([(await cotizacion(0)).mensualidad.final_ahora, (await cotizacion(0)).inscripcion.final_ahora], ["800.00", "500.00"]);
  assert.deepEqual([(await cotizacion(1)).mensualidad.final_ahora, (await cotizacion(1)).inscripcion.final_ahora], ["720.00", "475.00"], "10 % de $800.00 y 5 % de $500.00");

  // Una sola operación.
  const r = await m.asesor.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: primero, inscripcion: { grupo_id: m.grupos[0]! } }, { prospecto_id: segunda, inscripcion: { grupo_id: m.grupos[1]! } }] });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.alumnos.length, 2);
  assert.equal(new Set(r.cuerpo.alumnos.flatMap((a) => a.tutor_ids)).size, 1, "un solo adulto para los dos");
  assert.equal(await m.db.tutor.count({ where: { telefono: (await m.db.lead.findFirstOrThrow({ where: { id: f.leadId } })).telefono! } }), 1);
  const insc = await Promise.all(r.cuerpo.alumnos.map(async (a) => (await m.asesor.get<Insc>(`/api/inscripciones/${a.inscripcion!.id}`)).cuerpo));
  assert.deepEqual(insc.map((i) => [i.precio_inscripcion_aplicado, i.descuento_inscripcion_aplicado, i.precio_mensualidad_aplicado, i.descuento_mensualidad_aplicado]), [["500.00", "0.00", "800.00", "0.00"], ["500.00", "25.00", "800.00", "80.00"]]);
  assert.equal((await m.db.promocion.findFirstOrThrow({ where: { id: promo } })).cupo_usado, 1, "solo la segunda la consumió");
  // Lo cotizado es lo cobrado, al centavo, para cada niño.
  for (const [i, h] of [0, 1].entries()) {
    const c = await cotizacion(h);
    assert.equal(texto(centavos(insc[i]!.precio_mensualidad_aplicado) - centavos(insc[i]!.descuento_mensualidad_aplicado)), c.mensualidad.final_ahora);
    assert.equal(texto(centavos(insc[i]!.precio_inscripcion_aplicado) - centavos(insc[i]!.descuento_inscripcion_aplicado)), c.inscripcion.final_ahora);
  }
  // Los cargos son POR HIJO y a nombre del mismo adulto: inscripción y primera mensualidad de cada uno.
  const cargos = await m.db.cargo.findMany({ where: { tutor_id: r.cuerpo.tutor_id! }, orderBy: [{ alumno_id: "asc" }, { concepto: "asc" }] });
  assert.equal(cargos.length, 4);
  for (const a of r.cuerpo.alumnos) {
    const suyos = cargos.filter((c) => c.alumno_id === a.alumno_id);
    assert.deepEqual(suyos.map((c) => c.concepto).sort(), ["inscripcion", "mensualidad"]);
  }
  const alumnoSegunda = r.cuerpo.alumnos.find((a) => a.prospecto_id === segunda)!.alumno_id;
  assert.deepEqual(cargos.filter((c) => c.alumno_id === alumnoSegunda).map((c) => [c.concepto, c.monto.toString(), c.descuento.toString(), c.monto_final.toString()]).sort(), [["inscripcion", "500", "25", "475"], ["mensualidad", "800", "80", "720"]]);
  assert.equal(cargos.reduce((s, c) => s + centavos(c.monto_final.toFixed(2)), 0n), 50000n + 80000n + 47500n + 72000n, "$2,495.00 en total");
  const cu = await cuadratura(m.db);
  assert.equal(cu.ok, true, JSON.stringify(cu));
  // Los apellidos y la fecha de nacimiento que escribió el asesor llegaron al alumno sin volver a pedirlos.
  const alumnos = await m.db.alumno.findMany({ where: { id: { in: r.cuerpo.alumnos.map((a) => a.alumno_id) } }, orderBy: { nombre: "asc" } });
  assert.deepEqual(alumnos.map((a) => [a.nombre, a.apellidos, a.fecha_nacimiento.toISOString().slice(0, 10)]), [["Primero", "Mena Ruiz", "2018-06-01"], ["Segunda", "Mena Ruiz", "2020-09-09"]]);
  assert.equal((await m.db.lead.findFirstOrThrow({ where: { id: f.leadId }, include: { etapa: true } })).etapa.tipo_sistema, "inscrito");
});

test("TRES HERMANOS: la promoción del segundo y la del tercero se evalúan con los hermanos de la operación; la cotización previa de cada uno es lo que se cobra", async () => {
  const m = await mundo();
  await m.promoHermanos("Segundo", 2, { mensualidad: "10.00" });
  await m.promoHermanos("Tercero", 3, { inscripcion: "20.00" });
  const f = await familiaConHermanos(m, [{ nombre: "Segunda", apellidos: "Mena Ruiz", fecha: "2020-09-09" }, { nombre: "Tercero", apellidos: "Mena Ruiz", fecha: "2015-02-03" }]);
  for (const hermano of f.ids.slice(1)) assert.equal((await m.asesor.post(`/api/leads/${f.leadId}/prospectos/${hermano}/aceptaciones-del-hermano`, { desde_prospecto_id: f.ids[0] })).estado, 201);
  const previa = (await m.asesor.get<Previa>(`/api/leads/${f.leadId}/conversion`)).cuerpo;
  assert.deepEqual(previa.previsiones.map((p) => p.hermanos_previstos), [0, 1, 2]);
  const cuerpo = { tutor: { parentesco: "madre" }, prospectos: f.ids.map((id, i) => ({ prospecto_id: id, inscripcion: { grupo_id: m.grupos[i]! } })) };
  const r = await m.asesor.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, cuerpo);
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  const insc = await Promise.all(r.cuerpo.alumnos.map(async (a) => (await m.asesor.get<Insc>(`/api/inscripciones/${a.inscripcion!.id}`)).cuerpo));
  assert.deepEqual(insc.map((i) => [i.descuento_inscripcion_aplicado, i.descuento_mensualidad_aplicado]), [["0.00", "0.00"], ["0.00", "80.00"], ["100.00", "80.00"]], "el tercero recibe las dos (son acumulables)");
  for (const [i, h] of previa.previsiones.entries()) {
    const c = (await m.asesor.get<Cotizador>(`/api/cotizador?vertical_id=${m.org.verticalId}&sucursal_id=${m.norte}&edad=8&fecha=2026-11-10&hermanos_inscritos=${h.hermanos_previstos}`)).cuerpo.programas[0]!.promociones;
    assert.equal(texto(centavos(insc[i]!.precio_mensualidad_aplicado) - centavos(insc[i]!.descuento_mensualidad_aplicado)), c.mensualidad.final_ahora, `mensualidad del niño ${i + 1}`);
    assert.equal(texto(centavos(insc[i]!.precio_inscripcion_aplicado) - centavos(insc[i]!.descuento_inscripcion_aplicado)), c.inscripcion.final_ahora, `inscripción del niño ${i + 1}`);
  }
  assert.equal((await cuadratura(m.db)).ok, true);
  assert.equal(await m.db.cargo.count({ where: { tutor_id: r.cuerpo.tutor_id! } }), 6, "dos cargos por hijo");
});

test("V2 en la operación de hermanos: una promoción NO acumulable no se combina con ninguna otra (gana la de mayor prioridad), también al inscribir a los hermanos juntos", async () => {
  const m = await mundo();
  const acumulable = await m.promoHermanos("Acumulable", 2, { mensualidad: "10.00", prioridad: 5 });
  const sola = await m.promoHermanos("Sola", 2, { acumulable: false, prioridad: 9, mensualidad: "30.00" });
  const f = await familiaConHermanos(m, [{ nombre: "Segunda", apellidos: "Mena Ruiz", fecha: "2020-09-09" }]);
  assert.equal((await m.asesor.post(`/api/leads/${f.leadId}/prospectos/${f.ids[1]}/aceptaciones-del-hermano`, { desde_prospecto_id: f.ids[0] })).estado, 201);
  const r = await m.asesor.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: f.ids.map((id, i) => ({ prospecto_id: id, inscripcion: { grupo_id: m.grupos[i]! } })) });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  const segunda = (await m.asesor.get<Insc>(`/api/inscripciones/${r.cuerpo.alumnos[1]!.inscripcion!.id}`)).cuerpo;
  assert.equal(segunda.descuento_mensualidad_aplicado, "240.00", "30 % de $800.00, SOLA");
  const aplicaciones = await m.db.promocion_aplicacion.findMany({ where: { inscripcion_id: segunda.id } });
  assert.deepEqual([...new Set(aplicaciones.map((a) => a.promocion_id))], [sola]);
  assert.equal((await m.db.promocion.findFirstOrThrow({ where: { id: acumulable } })).cupo_usado, 0);
  assert.equal((await cuadratura(m.db)).ok, true);
});

test("TODOS ENTRAN O NINGUNO: si a uno no le alcanza el lugar, se rechaza la operación completa con un mensaje claro y no queda NADA; la salida: dejar fuera a ese niño o apuntarlo en la lista de espera", async () => {
  const m = await mundo({ cupos: [1, 20, 20] });
  const promo = await m.promoHermanos("Hermanos", 2, { mensualidad: "10.00" });
  const f = await familiaConHermanos(m, [{ nombre: "Segunda", apellidos: "Mena Ruiz", fecha: "2020-09-09" }]);
  assert.equal((await m.asesor.post(`/api/leads/${f.leadId}/prospectos/${f.ids[1]}/aceptaciones-del-hermano`, { desde_prospecto_id: f.ids[0] })).estado, 201);
  // Otro alumno ocupa el único lugar del grupo 1 después de que la familia lo eligió para la segunda.
  const ocupante = await sembrarAlumno(prisma, m.org, { docs: m.docs, sucursalId: m.norte });
  assert.equal((await m.admin.post("/api/inscripciones", { alumno_id: ocupante.alumnoId, grupo_id: m.grupos[0]! })).estado, 201);
  const tutoresAntes = await m.db.tutor.count();
  const alumnosAntes = await m.db.alumno.count();

  const cuerpo = (grupoDeLaSegunda: string) => ({ tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.ids[0], inscripcion: { grupo_id: m.grupos[1]! } }, { prospecto_id: f.ids[1], inscripcion: { grupo_id: grupoDeLaSegunda } }] });
  const llena = await m.asesor.post<Errores>(`/api/leads/${f.leadId}/convertir`, cuerpo(m.grupos[0]!));
  assert.equal(llena.estado, 409);
  assert.match(llena.cuerpo.error.mensaje, /ya no tiene lugares/);
  assert.equal(llena.cuerpo.error.detalles?.find((d) => d.campo === "motivo")?.mensaje, "grupo_lleno");
  assert.equal(llena.cuerpo.error.detalles?.find((d) => d.campo === "prospecto_id")?.mensaje, f.ids[1], "dice QUÉ niño no cupo");
  // Nada a medias: ni tutor, ni alumnos, ni la inscripción del primero, ni el cupo de la promoción, ni cargos.
  assert.equal(await m.db.tutor.count(), tutoresAntes);
  assert.equal(await m.db.alumno.count(), alumnosAntes);
  assert.equal(await m.db.inscripcion.count({ where: { lead_id: f.leadId } }), 0);
  assert.equal((await m.db.promocion.findFirstOrThrow({ where: { id: promo } })).cupo_usado, 0);
  assert.equal(await m.db.cargo.count({ where: { inscripcion: { lead_id: f.leadId } } }), 0);
  assert.ok((await m.db.prospecto.findMany({ where: { lead_id: f.leadId } })).every((p) => p.alumno_id === null));

  // Salida 1: ponerla en lista de espera y convertir al otro.
  const espera = await m.asesor.post<{ estatus: string; posicion: number }>("/api/lista-espera", { grupo_id: m.grupos[0]!, prospecto_id: f.ids[1] });
  assert.equal(espera.estado, 201, JSON.stringify(espera.cuerpo));
  assert.deepEqual([espera.cuerpo.estatus, espera.cuerpo.posicion], ["esperando", 1]);
  assert.equal((await m.asesor.post("/api/lista-espera", { grupo_id: m.grupos[0]!, prospecto_id: f.ids[1] })).estado, 200, "idempotente");
  const solo = await m.asesor.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.ids[0], inscripcion: { grupo_id: m.grupos[1]! } }] });
  assert.equal(solo.estado, 201, JSON.stringify(solo.cuerpo));
  assert.equal(solo.cuerpo.alumnos.length, 1);
  assert.equal((await m.db.prospecto.findFirstOrThrow({ where: { id: f.ids[1] } })).alumno_id, null, "la segunda sigue pendiente");
  // La ficha sigue mostrando a la que falta, y la conversión de la que falta ya no pide nada del adulto.
  const previa = (await m.asesor.get<Previa>(`/api/leads/${f.leadId}/conversion`)).cuerpo;
  assert.deepEqual(previa.faltantes.map((x) => x.campo), [`prospectos.${f.ids[1]}.grupo_id`], "sin parentesco ni datos del adulto: la familia ya existe");
  assert.deepEqual(previa.previsiones.find((p) => p.prospecto_id === f.ids[1])?.hermanos_previstos, 1, "ahora su hermano ya está inscrito");
  // Más tarde hay lugar en otro grupo: se inscribe sola, con el descuento por hermanos y SIN volver a pedir al adulto.
  const tarde = await m.asesor.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, { prospectos: [{ prospecto_id: f.ids[1], inscripcion: { grupo_id: m.grupos[2]! } }] });
  assert.equal(tarde.estado, 201, JSON.stringify(tarde.cuerpo));
  assert.equal(tarde.cuerpo.tutor_id, solo.cuerpo.tutor_id, "el mismo adulto");
  const i2 = (await m.asesor.get<Insc>(`/api/inscripciones/${tarde.cuerpo.alumnos[0]!.inscripcion!.id}`)).cuerpo;
  assert.equal(i2.descuento_mensualidad_aplicado, "80.00");
  assert.equal(await m.db.tutor.count(), tutoresAntes + 1, "un solo adulto nuevo en todo el proceso");
  assert.equal((await cuadratura(m.db)).ok, true);
});

test("SALIDA 2: dejar fuera a ese niño — convertir solo a los marcados deja a los demás en la ficha, sin inscribirlos ni pedirles nada", async () => {
  const m = await mundo();
  const f = await familiaConHermanos(m, [{ nombre: "Segunda", apellidos: "Mena Ruiz", fecha: "2020-09-09" }]);
  const marcados = (await m.asesor.get<Previa>(`/api/leads/${f.leadId}/conversion?prospectos=${f.ids[0]}`)).cuerpo;
  assert.deepEqual(marcados.faltantes.map((x) => x.campo).sort(), ["tutor.parentesco", `prospectos.${f.ids[0]}.grupo_id`].sort(), "solo lo del marcado: la segunda no estorba");
  assert.deepEqual(marcados.prospectos.map((p) => p.prospecto_id), [f.ids[0]]);
  assert.equal((await m.asesor.get(`/api/leads/${f.leadId}/conversion?prospectos=no-es-un-id`)).estado, 400);
  const r = await m.asesor.post<Conv>(`/api/leads/${f.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.ids[0], inscripcion: { grupo_id: m.grupos[0]! } }] });
  assert.equal(r.estado, 201);
  const ficha = await m.asesor.get<{ prospectos: { id: string; alumno_id: string | null }[]; etapa: { tipo_sistema: string } }>(`/api/leads/${f.leadId}`);
  assert.deepEqual(ficha.cuerpo.prospectos.map((p) => p.alumno_id !== null), [true, false]);
});

// V13-fix EV-29: `prospectos: []` respondía «ya convertido» con 200 sin convertir a nadie.
test("EV-29: convertir con una lista de niños VACÍA es un 400 claro y no cambia nada; con una lista de un niño convierte solo a ese", async () => {
  const m = await mundo();
  const f = await familiaConHermanos(m, [{ nombre: "Segunda", apellidos: "Mena Ruiz", fecha: "2020-09-09" }]);
  const alumnosAntes = await prisma.alumno.count({ where: { organizacion_id: m.org.organizacionId } });
  for (const cliente of [m.asesor, m.admin]) {
    const vacia = await cliente.post<Errores>(`/api/leads/${f.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [] });
    assert.equal(vacia.estado, 400, JSON.stringify(vacia.cuerpo));
    assert.equal(vacia.cuerpo.error.codigo, "validacion");
    const detalle = vacia.cuerpo.error.detalles!.find((d) => d.campo === "prospectos")!;
    assert.match(detalle.mensaje, /al menos un niño/);
  }
  assert.equal(await prisma.alumno.count({ where: { organizacion_id: m.org.organizacionId } }), alumnosAntes);
  // Con la lista de verdad (un niño), convierte solo a ese.
  const uno = await m.asesor.post<Conv>(`/api/leads/${f.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.ids[0], inscripcion: { grupo_id: m.grupos[0]! } }] });
  assert.equal(uno.estado, 201, JSON.stringify(uno.cuerpo));
  assert.equal(uno.cuerpo.alumnos.length, 1);
});

test("HERMANO TARDÍO: un lead ya inscrito recibe a otro niño; se convierte sin pedir nada del adulto, a la misma familia y con la promoción por hermanos", async () => {
  const m = await mundo();
  await m.promoHermanos("Hermanos", 2, { mensualidad: "10.00" });
  const f = await m.familia();
  await m.asesor.patch(`/api/leads/${f.leadId}/prospectos/${f.prospectoId}`, { apellidos: "Mena Ruiz", fecha_nacimiento: "2018-06-01" });
  await aceptar(m, f.leadId, f.prospectoId);
  const una = await m.asesor.post<Conv>(`/api/leads/${f.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.prospectoId, inscripcion: { grupo_id: m.grupos[0]! } }] });
  assert.equal(una.estado, 201);
  assert.equal((await m.db.lead.findFirstOrThrow({ where: { id: f.leadId }, include: { etapa: true } })).etapa.tipo_sistema, "inscrito");
  // Semanas después, la familia trae a otro hijo.
  const nuevo = await m.asesor.post<{ id: string } & Errores>(`/api/leads/${f.leadId}/prospectos`, { nombre: "Tardío", apellidos: "Mena Ruiz", fecha_nacimiento: "2019-04-04" });
  assert.equal(nuevo.estado, 201);
  assert.equal((await m.asesor.post(`/api/leads/${f.leadId}/prospectos/${nuevo.cuerpo.id}/aceptaciones-del-hermano`, { desde_prospecto_id: f.prospectoId })).estado, 201);
  const previa = (await m.asesor.get<Previa>(`/api/leads/${f.leadId}/conversion`)).cuerpo;
  assert.deepEqual(previa.faltantes.map((x) => x.campo), [`prospectos.${nuevo.cuerpo.id}.grupo_id`], "solo el grupo");
  assert.equal(previa.previsiones.find((p) => p.prospecto_id === nuevo.cuerpo.id)?.hermanos_previstos, 1);
  const dos = await m.asesor.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, { prospectos: [{ prospecto_id: nuevo.cuerpo.id, inscripcion: { grupo_id: m.grupos[1]! } }] });
  assert.equal(dos.estado, 201, JSON.stringify(dos.cuerpo));
  assert.equal(dos.cuerpo.tutor_id, una.cuerpo.tutor_id);
  assert.equal((await m.asesor.get<Insc>(`/api/inscripciones/${dos.cuerpo.alumnos[0]!.inscripcion!.id}`)).cuerpo.descuento_mensualidad_aplicado, "80.00");
  // Los dos hijos comparten responsable de pago: un solo estado de cuenta.
  assert.equal(await m.db.tutor_alumno.count({ where: { tutor_id: una.cuerpo.tutor_id! } }), 2);
});

test("la aceptación del reglamento por el hermano solo se extiende si de verdad existe, sigue vigente y es del mismo lead; no sale sola al convertir", async () => {
  const m = await mundo();
  const f = await familiaConHermanos(m, [{ nombre: "Segunda", apellidos: "Mena Ruiz", fecha: "2020-09-09" }]);
  const ruta = (hacia: string) => `/api/leads/${f.leadId}/prospectos/${hacia}/aceptaciones-del-hermano`;
  // Sin aceptar nadie todavía (desde la segunda hacia la primera: ella no ha aceptado... la primera sí; al revés no).
  const alReves = await m.asesor.post<Errores>(ruta(f.ids[0]!), { desde_prospecto_id: f.ids[1] });
  assert.equal(alReves.estado, 409);
  assert.match(alReves.cuerpo.error.mensaje, /todavía no tiene el reglamento aceptado/);
  assert.equal((await m.asesor.post(ruta(f.ids[1]!), { desde_prospecto_id: f.ids[1] })).estado, 400, "no se extiende a sí mismo");
  assert.equal((await m.asesor.post(ruta(f.ids[1]!), { desde_prospecto_id: randomUUID() })).estado, 404);
  // Sin extender, la conversión sigue pidiendo el reglamento de la segunda (no sale sola).
  const previa = (await m.asesor.get<Previa>(`/api/leads/${f.leadId}/conversion`)).cuerpo;
  assert.equal(previa.previsiones[1]!.reglamento_pendiente, true);
  // Si el reglamento cambió (nueva versión vigente), ya no vale: la familia lo acepta de verdad.
  const v2 = await m.admin.post<{ id: string }>("/api/documentos-legales", { tipo: "reglamento", titulo: "Reglamento 2", texto: "Texto nuevo del reglamento", vigente_desde: "2026-11-01T00:00:00Z" });
  assert.equal(v2.estado, 201, JSON.stringify(v2.cuerpo));
  const viejo = await m.asesor.post<Errores>(ruta(f.ids[1]!), { desde_prospecto_id: f.ids[0] });
  assert.equal(viejo.estado, 409);
  assert.match(viejo.cuerpo.error.mensaje, /cambió/);
  // De otro lead no.
  const otra = await sembrarFamilia(prisma, m.org, { sucursalId: m.norte });
  assert.equal((await m.asesor.post(ruta(f.ids[1]!), { desde_prospecto_id: otra.prospectoId })).estado, 404);
  // Ni sin permiso de escribir.
  const rec = api.cliente();
  const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "recepcion", sucursales: [m.norte] });
  await rec.login(m.org.slug, u.correo, u.contrasena);
  assert.equal((await rec.post(ruta(f.ids[1]!), { desde_prospecto_id: f.ids[0] })).estado, 403);
});

test("IDEMPOTENTE POR LEAD y CONCURRENCIA: 5 conversiones simultáneas de la misma familia de dos hijos dejan UN adulto, dos alumnos, dos inscripciones y cuatro cargos; solo una crea", async () => {
  const m = await mundo();
  await m.promoHermanos("Hermanos", 2, { mensualidad: "10.00" });
  const f = await familiaConHermanos(m, [{ nombre: "Segunda", apellidos: "Mena Ruiz", fecha: "2020-09-09" }]);
  assert.equal((await m.asesor.post(`/api/leads/${f.leadId}/prospectos/${f.ids[1]}/aceptaciones-del-hermano`, { desde_prospecto_id: f.ids[0] })).estado, 201);
  const cuerpo = { tutor: { parentesco: "madre" }, prospectos: f.ids.map((id, i) => ({ prospecto_id: id, inscripcion: { grupo_id: m.grupos[i]! } })) };
  const rs = await Promise.all(Array.from({ length: 5 }, () => m.asesor.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, cuerpo)));
  assert.deepEqual(rs.map((r) => r.estado).sort(), [200, 200, 200, 200, 201], JSON.stringify(rs.map((r) => r.cuerpo.error ?? null)));
  assert.equal(new Set(rs.map((r) => r.cuerpo.tutor_id)).size, 1);
  assert.equal(await m.db.alumno.count(), 2);
  assert.equal(await m.db.inscripcion.count({ where: { lead_id: f.leadId } }), 2);
  assert.equal(await m.db.cargo.count({ where: { tutor_id: rs[0]!.cuerpo.tutor_id! } }), 4);
  assert.equal((await m.db.promocion.findFirstOrThrow({})).cupo_usado, 1, "la promoción se consumió una sola vez");
  assert.equal((await cuadratura(m.db)).ok, true);
  // Y una vez más, ya convertido: 200 con lo mismo y sin crear nada.
  const otra = await m.asesor.post<Conv>(`/api/leads/${f.leadId}/convertir`, cuerpo);
  assert.deepEqual([otra.estado, otra.cuerpo.ya_convertido], [200, true]);
});

test("DOS FAMILIAS POR LOS ÚLTIMOS LUGARES: con dos lugares y dos familias de dos hijos, una se inscribe completa y la otra queda rechazada sin nada a medias", async () => {
  const m = await mundo({ cupos: [2, 20] });
  const A = await familiaConHermanos(m, [{ nombre: "Segunda A", apellidos: "Mena Ruiz", fecha: "2020-09-09" }]);
  const B = await familiaConHermanos(m, [{ nombre: "Segunda B", apellidos: "Soto Pérez", fecha: "2020-10-10" }]);
  for (const x of [A, B]) assert.equal((await m.asesor.post(`/api/leads/${x.leadId}/prospectos/${x.ids[1]}/aceptaciones-del-hermano`, { desde_prospecto_id: x.ids[0] })).estado, 201);
  const cuerpo = (x: typeof A) => ({ tutor: { parentesco: "madre" }, prospectos: x.ids.map((id) => ({ prospecto_id: id, inscripcion: { grupo_id: m.grupos[0]! } })) });
  for (let ronda = 0; ronda < 1; ronda++) {
    const [ra, rb] = await Promise.all([m.asesor.post<Conv & Errores>(`/api/leads/${A.leadId}/convertir`, cuerpo(A)), m.asesor.post<Conv & Errores>(`/api/leads/${B.leadId}/convertir`, cuerpo(B))]);
    assert.deepEqual([ra.estado, rb.estado].sort(), [201, 409], JSON.stringify([ra.cuerpo, rb.cuerpo]));
    const [ganadora, perdedora] = ra.estado === 201 ? [A, B] : [B, A];
    assert.equal(await m.db.inscripcion.count({ where: { grupo_id: m.grupos[0]!, estatus: "activa" } }), 2, "ni uno más del cupo");
    assert.equal(await m.db.inscripcion.count({ where: { lead_id: ganadora.leadId } }), 2, "la ganadora entró completa");
    assert.equal(await m.db.inscripcion.count({ where: { lead_id: perdedora.leadId } }), 0, "la otra, ni uno");
    assert.equal(await m.db.alumno.count({ where: { prospectos: { some: { lead_id: perdedora.leadId } } } }), 0, "sin alumnos a medias");
    assert.equal(await m.db.tutor_alumno.count({ where: { alumno: { prospectos: { some: { lead_id: perdedora.leadId } } } } }), 0);
    const rechazo = (ra.estado === 409 ? ra : rb).cuerpo as Errores;
    assert.equal(rechazo.error.detalles?.find((d) => d.campo === "motivo")?.mensaje, "grupo_lleno");
  }
  assert.equal((await cuadratura(m.db)).ok, true);
});

test("EF-11: dos hermanos que se inscriben a la vez, por separado, SE VEN entre sí: exactamente uno recibe la promoción por hermanos (el candado de la familia)", async () => {
  const m = await mundo();
  await m.promoHermanos("Hermanos", 2, { mensualidad: "10.00" });
  const primero = await sembrarAlumno(prisma, m.org, { docs: m.docs, sucursalId: m.norte });
  const segundo = await sembrarAlumno(prisma, m.org, { docs: m.docs, sucursalId: m.norte, conTutor: primero.tutorId });
  // Las dos transacciones llegan al conteo de hermanos al mismo tiempo: sin el candado de la familia, las dos leerían 0.
  const barrera = new Barrera(2);
  const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "alumno", operacion: "findMany", cuando: (a) => JSON.stringify(a["where"]).includes("inscripciones"), antes: () => barrera.esperar(1500) }), { reloj: () => AHORA });
  try {
    const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "administrador" });
    const dos = [apiCarrera.cliente(), apiCarrera.cliente()];
    for (const c of dos) assert.equal((await c.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
    const rs = await Promise.all([dos[0]!.post<Insc & Errores>("/api/inscripciones", { alumno_id: primero.alumnoId, grupo_id: m.grupos[0]! }), dos[1]!.post<Insc & Errores>("/api/inscripciones", { alumno_id: segundo.alumnoId, grupo_id: m.grupos[1]! })]);
    assert.deepEqual(rs.map((r) => r.estado), [201, 201], JSON.stringify(rs.map((r) => r.cuerpo)));
    assert.deepEqual(rs.map((r) => r.cuerpo.descuento_mensualidad_aplicado).sort(), ["0.00", "80.00"], "uno paga completo y el otro recibe el 10 %: se ven entre sí");
    assert.equal(barrera.completa, false, "el candado de la familia los puso en fila (la barrera no pudo juntarlos)");
  } finally {
    await apiCarrera.cerrar();
  }
});
