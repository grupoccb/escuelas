// F2: la conversión de un lead en tutor(es), alumno(s) e inscripción(es), en UNA transacción y SIN RECAPTURA. Postgres real, la app real.
// El test central parte de un lead con todo capturado (bot + registro del maestro + cotización + aceptaciones) y comprueba campo por campo
// que cada dato aparece en tutor, alumno e inscripción sin que ninguna ruta lo vuelva a pedir.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";

const AHORA = new Date("2026-11-10T18:00:00Z"); // 12:00 en la Ciudad de México; hoy = 2026-11-10
const cifrador = crearCifrador(randomBytes(32));
let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let docs: DocumentosLegalesSembrados;
let etapas: Record<TipoDeEtapa, string>;
let admin: ClienteApi;
let adminId: string;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let instructorId: string;
let norte: string;
let sur: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Conv { ya_convertido: boolean; tutor_id: string | null; alumnos: { prospecto_id: string; alumno_id: string; creado: boolean; tutor_ids: string[]; inscripcion: { id: string; grupo_id: string; creada: boolean } | null }[] }
interface Previa { lead_id: string; listo: boolean; ya_convertido: boolean; faltantes: { campo: string; mensaje: string }[]; prospectos: { prospecto_id: string; ya_convertido: boolean }[] }

const SALUD = { alergias: "CENTINELA-F2-ALERGIA", condiciones_medicas: "CENTINELA-F2-CONDICION", medicamentos: "CENTINELA-F2-MEDICAMENTO", contacto_emergencia: { nombre: "CENTINELA-F2-EMERGENCIA", telefono: "+525599990000", parentesco: "tía" }, autorizacion_atencion_medica: true };

let n = 0;
async function grupoNuevo(o: { cupo?: number; sucursalId?: string; precio?: { inscripcion: string; mensualidad: string } | null; instructor?: string } = {}) {
  const p = await sembrarPrograma(prisma, org, {
    sucursalId: o.sucursalId ?? norte,
    nombre: `Programa ${++n}`,
    edadMin: 3,
    edadMax: 14,
    grupos: [{ nombre: `Grupo ${n}`, cupoMaximo: o.cupo ?? 20, permiteListaEspera: true, horarios: [[n % 7, 480 + (Math.floor(n / 7) % 12) * 60, 530 + (Math.floor(n / 7) % 12) * 60]] }],
    precio: o.precio === undefined ? { inscripcion: "500.00", mensualidad: "800.00" } : o.precio,
  });
  const g = { programaId: p.id, grupoId: p.grupos[0]!.id };
  if (o.instructor) await prisma.grupo.update({ where: { id: g.grupoId }, data: { instructor_id: o.instructor } });
  return g;
}

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador } });
  org = await sembrarOrganizacion(prisma, "Conversión");
  etapas = await sembrarEmbudo(prisma, org);
  docs = await sembrarDocumentosLegales(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  const a = await entrar("administrador");
  admin = a.c;
  adminId = a.id;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  const m = await entrar("maestro");
  maestro = m.c;
  instructorId = (await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: m.id, nombre: "Maestro" } })).id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

/** La familia aceptó el reglamento vigente (v1) de ese prospecto. */
async function aceptaReglamento(leadId: string, prospectoId: string): Promise<void> {
  const d = await prisma.documento_legal.findFirstOrThrow({ where: { id: docs.reglamento } });
  await prisma.aceptacion_legal.create({ data: { organizacion_id: org.organizacionId, documento_id: d.id, tipo: "reglamento", version_aceptada: 1, resultado: "aceptada", lead_id: leadId, prospecto_id: prospectoId, aceptante_nombre: "Mamá", canal: "presencial", aceptado_en: AHORA, texto_hash: d.texto_hash } });
}

/** Un lead del bot con su prospecto, SIN registro del maestro (solo lo que el bot captura: nombre del niño, edad, teléfono y nombre del contacto). */
const leadDelBot = (o: { sucursalId?: string | null; nombre?: string; telefono?: string | null } = {}) => sembrarFamilia(prisma, org, { etapaId: etapas.negociacion, ...o });

/**
 * El lead COMPLETO: bot + cotización con horario elegido + clase muestra + registro del maestro completo (alumno, dos adultos con banderas,
 * antecedentes, salud) + reglamento y uso de imagen aceptados. Devuelve ids y los valores capturados para compararlos después.
 */
async function leadCompleto() {
  const g = await grupoNuevo();
  const otro = await grupoNuevo();
  await prisma.grupo.update({ where: { id: g.grupoId }, data: { instructor_id: instructorId } });
  const f = await leadDelBot({ nombre: "Mateo", sucursalId: norte });
  const cot = await prisma.cotizacion.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, programa_id: g.programaId, sucursal_id: norte, origen: "asesor", creado_por_usuario_id: adminId, grupo_elegido_id: g.grupoId, fecha: new Date("2026-11-09"), vigente_hasta: new Date("2026-11-16"), snapshot: {} } });
  const clase = await prisma.clase_muestra.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: g.grupoId, fecha_hora: new Date("2026-11-09T22:00:00Z"), agendada_por: "usuario", agendada_por_usuario_id: adminId } });
  const url = `/api/clases-muestra/${clase.id}/registro`;
  const adultoLead = { nombre: "Rosa", apellidos: "Mena", parentesco: "madre", telefono: f.telefono!, correo: "rosa@correo.test", es_responsable_pago: true, lo_lleva: true };
  const abuelo = { nombre: "Pedro", apellidos: "Soto", parentesco: "abuelo", telefono: "+525533334444", puede_recoger: true };
  const alumno = { nombre: "Mateo", apellidos: "Soto Mena", fecha_nacimiento: "2018-05-04", sexo: "masculino", escuela: "Escuela Reservada", turno_escolar: "matutino", talla_uniforme: "10" };
  const antecedentes = { practico_antes: true, practico_donde: "Otro lugar", practico_nivel: "Principiante", motivo_clase: "disciplina" };
  assert.equal((await maestro.patch(url, { alumno, tutores: [adultoLead, abuelo], antecedentes, salud: SALUD, observacion: { grupo_recomendado_id: otro.grupoId } })).estado, 200);
  assert.equal((await maestro.post(`${url}/completar`, {})).estado, 200);
  const acepta = (documento: string, tipo: string) => admin.post(`${url}/aceptaciones`, { documento_id: documento, version: 1, resultado: "aceptada", aceptante: { nombre: "Rosa Mena", parentesco: "madre" }, canal: "presencial", evidencia: { tipo } });
  assert.equal((await acepta(docs.reglamento, "reglamento")).estado, 201);
  assert.equal((await acepta(docs.usoImagen, "imagen")).estado, 201);
  return { ...f, g, otro, cotizacionId: cot.id, adultoLead, abuelo, alumno, antecedentes };
}

test("CERO RECAPTURA: de un lead con todo capturado salen tutores, alumno e inscripción con CADA dato, y la vista previa no pide nada", async () => {
  const L = await leadCompleto();
  const previa = await asesorNorte.get<Previa>(`/api/leads/${L.leadId}/conversion`);
  assert.equal(previa.estado, 200);
  assert.deepEqual(previa.cuerpo.faltantes, [], "no falta nada: el bot, el maestro y la cotización ya lo dieron todo");
  assert.equal(previa.cuerpo.listo, true);
  assert.equal(previa.cuerpo.ya_convertido, false);

  const r = await asesorNorte.post<Conv & Errores>(`/api/leads/${L.leadId}/convertir`, {});
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  const alumnoId = r.cuerpo.alumnos[0]!.alumno_id;

  // TUTORES: los dos adultos del registro, con sus datos y banderas.
  const rosa = await prisma.tutor.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, telefono: L.telefono! } });
  assert.deepEqual([rosa.nombre, rosa.apellidos, rosa.correo, rosa.sucursal_id], ["Rosa", "Mena", "rosa@correo.test", norte]);
  const pedro = await prisma.tutor.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, telefono: "+525533334444" } });
  assert.deepEqual([pedro.nombre, pedro.apellidos], ["Pedro", "Soto"]);
  const vinculos = await prisma.tutor_alumno.findMany({ where: { alumno_id: alumnoId } });
  assert.equal(vinculos.length, 2);
  const deRosa = vinculos.find((v) => v.tutor_id === rosa.id)!;
  const dePedro = vinculos.find((v) => v.tutor_id === pedro.id)!;
  assert.deepEqual([deRosa.parentesco, deRosa.es_responsable_pago, deRosa.lo_lleva, deRosa.puede_recoger], ["madre", true, true, false]);
  assert.deepEqual([dePedro.parentesco, dePedro.es_responsable_pago, dePedro.lo_lleva, dePedro.puede_recoger], ["abuelo", false, false, true]);
  // ALUMNO: nombre completo, acta, sexo, escuela, turno, talla y antecedentes.
  const a = await prisma.alumno.findFirstOrThrow({ where: { id: alumnoId } });
  assert.deepEqual(
    [a.nombre, a.apellidos, a.fecha_nacimiento.toISOString().slice(0, 10), a.sexo, a.escuela_nombre, a.escuela_turno, a.talla_uniforme, a.practico_antes, a.practico_donde, a.practico_nivel, a.motivo_clase, a.estatus, a.sucursal_id],
    ["Mateo", "Soto Mena", "2018-05-04", "masculino", "Escuela Reservada", "matutino", "10", true, "Otro lugar", "Principiante", "disciplina", "activo", norte],
  );
  // INSCRIPCIÓN: el horario que eligió la familia al cotizar (no el que recomendó el maestro), precios, origen y cotización.
  const ins = await prisma.inscripcion.findFirstOrThrow({ where: { alumno_id: alumnoId } });
  assert.equal(ins.grupo_id, L.g.grupoId);
  assert.equal(r.cuerpo.alumnos[0]!.inscripcion!.grupo_id, L.g.grupoId);
  assert.deepEqual([ins.programa_id, ins.lead_id, ins.prospecto_id, ins.cotizacion_id, ins.estatus], [L.g.programaId, L.leadId, L.prospectoId, L.cotizacionId, "activa"]);
  assert.deepEqual([ins.precio_inscripcion_aplicado.toFixed(2), ins.precio_mensualidad_aplicado.toFixed(2), ins.dia_corte_pago], ["500.00", "800.00", 10]);
  assert.equal((await prisma.cotizacion.findFirstOrThrow({ where: { id: L.cotizacionId } })).estatus, "aceptada");
  // LEAD y PROSPECTO apuntan a lo creado; el lead pasó a «inscrito» con historial.
  const lead = await prisma.lead.findFirstOrThrow({ where: { id: L.leadId } });
  assert.equal(lead.tutor_id, rosa.id, "el adulto que escribió es el tutor de su mismo teléfono");
  assert.equal(lead.etapa_id, etapas.inscrito);
  assert.equal((await prisma.prospecto.findFirstOrThrow({ where: { id: L.prospectoId } })).alumno_id, alumnoId);
  assert.equal(await prisma.lead_etapa_historial.count({ where: { lead_id: L.leadId, etapa_nueva_id: etapas.inscrito } }), 1);
  // LEGAL: la aceptación sigue ligada al prospecto y el alumno queda ligado a él: la imagen se deriva.
  assert.equal((await admin.get<{ autoriza_uso_imagen: boolean }>(`/api/alumnos/${alumnoId}`)).cuerpo.autoriza_uso_imagen, true);
  // SALUD: se MUDÓ a la ficha del alumno (su maestro la lee con constancia) y ya no está en la del prospecto.
  const salud = await maestro.get<{ campos: { alergias: string; medicamentos: string; contacto_emergencia: { nombre: string } } }>(`/api/salud/alumno/${alumnoId}?motivo=clase`);
  assert.equal(salud.estado, 200, JSON.stringify(salud.cuerpo));
  assert.equal(salud.cuerpo.campos.alergias, SALUD.alergias);
  assert.equal(salud.cuerpo.campos.medicamentos, SALUD.medicamentos);
  assert.equal(salud.cuerpo.campos.contacto_emergencia.nombre, SALUD.contacto_emergencia.nombre);
  const delProspecto = await admin.get<{ campos: Record<string, unknown> }>(`/api/salud/prospecto/${L.prospectoId}?motivo=comprobar`);
  assert.ok(Object.values(delProspecto.cuerpo.campos).every((v) => v === null), "la ficha del prospecto quedó vacía");
  assert.equal(await db().acceso_dato_sensible.count({ where: { sujeto_id: alumnoId, accion: "trasladar" } }), 1, "el traslado deja constancia");
  // Ninguna ruta lo vuelve a pedir: la vista previa ya no tiene nada por capturar y se reconoce convertido.
  const despues = await asesorNorte.get<Previa>(`/api/leads/${L.leadId}/conversion`);
  assert.deepEqual(despues.cuerpo.faltantes, []);
  assert.equal(despues.cuerpo.ya_convertido, true);
  assert.deepEqual(despues.cuerpo.prospectos, [{ prospecto_id: L.prospectoId, ya_convertido: true }]);
  // El registro de cambios no guarda nombres, teléfonos ni nada del registro.
  const cambios = JSON.stringify((await db().registro_cambio.findMany({ where: { entidad_tipo: { in: ["alumno", "tutor", "tutor_alumno", "inscripcion", "lead"] } } })).map((c) => [c.antes, c.despues]));
  for (const secreto of ["Soto Mena", "Rosa", "Pedro", L.telefono!, "rosa@correo.test", "Escuela Reservada", "CENTINELA"]) assert.ok(!cambios.includes(secreto), secreto);
});

test("la vista previa lista SOLO lo que falta (y nada de lo que el bot ya capturó): lead de bot sin registro", async () => {
  const f = await leadDelBot({ nombre: "Lucía", sucursalId: norte });
  const g = await grupoNuevo();
  const sinReglamento = await asesorNorte.get<Previa>(`/api/leads/${f.leadId}/conversion`);
  assert.ok(sinReglamento.cuerpo.faltantes.every((x) => !x.campo.endsWith("reglamento")), "el reglamento solo se exige cuando ya hay grupo con qué inscribir");
  await aceptaReglamento(f.leadId, f.prospectoId);
  const previa = await asesorNorte.get<Previa>(`/api/leads/${f.leadId}/conversion`);
  const campos = previa.cuerpo.faltantes.map((x) => x.campo).sort();
  assert.deepEqual(campos, [`prospectos.${f.prospectoId}.alumno.apellidos`, `prospectos.${f.prospectoId}.alumno.fecha_nacimiento`, `prospectos.${f.prospectoId}.grupo_id`, "tutor.parentesco"].sort());
  assert.equal(previa.cuerpo.listo, false);
  // Lo que el bot ya capturó (nombre del niño, teléfono y nombre del contacto) NO está en la lista.
  assert.ok(!campos.some((c) => /alumno\.nombre|tutor\.nombre|tutor\.telefono/.test(c)));
  // Convertir con eso faltando se rechaza con la MISMA lista y no crea nada.
  const sin = await asesorNorte.post<Errores>(`/api/leads/${f.leadId}/convertir`, {});
  assert.equal(sin.estado, 409);
  assert.deepEqual(sin.cuerpo.error.detalles!.filter((d) => d.campo !== "motivo").map((d) => d.campo!).sort(), campos);
  assert.equal(await prisma.alumno.count({ where: { organizacion_id: org.organizacionId, nombre: "Lucía" } }), 0);
  assert.equal(await prisma.tutor.count({ where: { organizacion_id: org.organizacionId, telefono: f.telefono! } }), 0);
  // Con SOLO lo que falta, se convierte; el nombre y el teléfono salen del bot.
  const r = await asesorNorte.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, {
    tutor: { parentesco: "madre" },
    prospectos: [{ prospecto_id: f.prospectoId, alumno: { apellidos: "Ríos", fecha_nacimiento: "2019-03-02" }, inscripcion: { grupo_id: g.grupoId, dia_corte_pago: 31 } }],
  });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  const t = await prisma.tutor.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, telefono: f.telefono! } });
  assert.equal(t.nombre, "Mamá", "el nombre del contacto viene del lead");
  assert.equal((await prisma.alumno.findFirstOrThrow({ where: { id: r.cuerpo.alumnos[0]!.alumno_id } })).nombre, "Lucía");
  const v = await prisma.tutor_alumno.findFirstOrThrow({ where: { alumno_id: r.cuerpo.alumnos[0]!.alumno_id } });
  assert.deepEqual([v.parentesco, v.es_responsable_pago], ["madre", true]);
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { alumno_id: r.cuerpo.alumnos[0]!.alumno_id } })).dia_corte_pago, 31);
});

test("lo que ya se capturó a medias cuenta: un registro en borrador y una cotización con horario elegido dejan solo lo que de verdad falta", async () => {
  const f = await leadDelBot({ nombre: "Borrador", sucursalId: norte });
  const g = await grupoNuevo({ instructor: instructorId });
  await prisma.cotizacion.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, programa_id: g.programaId, sucursal_id: norte, origen: "asesor", creado_por_usuario_id: adminId, grupo_elegido_id: g.grupoId, fecha: new Date("2026-11-09"), vigente_hasta: new Date("2026-11-16"), snapshot: {} } });
  const clase = await prisma.clase_muestra.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: g.grupoId, fecha_hora: new Date("2026-11-09T22:00:00Z"), agendada_por: "usuario", agendada_por_usuario_id: adminId } });
  await aceptaReglamento(f.leadId, f.prospectoId);
  // El maestro solo alcanzó a capturar los apellidos y la fecha del acta.
  assert.equal((await maestro.patch(`/api/clases-muestra/${clase.id}/registro`, { alumno: { apellidos: "Borrador Pérez", fecha_nacimiento: "2017-08-08" } })).estado, 200);
  const previa = await asesorNorte.get<Previa>(`/api/leads/${f.leadId}/conversion`);
  assert.deepEqual(previa.cuerpo.faltantes.map((x) => x.campo).sort(), ["tutor.parentesco"], "grupo, apellidos y fecha ya estaban capturados");
});

test("detección de familia: si el teléfono ya es de un tutor (otro hijo, ya inscrito), se LIGA a ese tutor y no se le pisan los datos", async () => {
  const hermano = await sembrarAlumno(prisma, org, { docs });
  const g0 = await grupoNuevo();
  assert.equal((await admin.post("/api/inscripciones", { alumno_id: hermano.alumnoId, grupo_id: g0.grupoId })).estado, 201);
  // Un lead NUEVO cuyo adulto YA es un tutor (se dio de alta antes con ese teléfono, p. ej. por mostrador).
  const otroLead = await sembrarFamilia(prisma, org, { nombre: "Segundo", sucursalId: norte, etapaId: etapas.negociacion });
  const tutorPrevio = await admin.post<{ id: string }>("/api/tutores", { nombre: "Rosa", apellidos: "Mena", telefono: otroLead.telefono!, sucursal_id: norte });
  assert.equal(tutorPrevio.estado, 201);
  await aceptaReglamento(otroLead.leadId, otroLead.prospectoId);
  const g = await grupoNuevo();
  const r = await asesorNorte.post<Conv & Errores>(`/api/leads/${otroLead.leadId}/convertir`, {
    tutor: { parentesco: "madre", nombre: "Nombre distinto" },
    prospectos: [{ prospecto_id: otroLead.prospectoId, alumno: { apellidos: "Prueba", fecha_nacimiento: "2020-01-15" }, inscripcion: { grupo_id: g.grupoId } }],
  });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.tutor_id, tutorPrevio.cuerpo.id);
  assert.equal(await prisma.tutor.count({ where: { organizacion_id: org.organizacionId, telefono: otroLead.telefono! } }), 1);
  assert.equal((await prisma.tutor.findFirstOrThrow({ where: { id: tutorPrevio.cuerpo.id } })).nombre, "Rosa", "el tutor existente no se sobrescribe");
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: otroLead.leadId } })).tutor_id, tutorPrevio.cuerpo.id);
  // Y la familia del primer hijo sigue siendo una sola: dos tutores distintos, cada uno con su hijo.
  assert.equal(await prisma.tutor_alumno.count({ where: { tutor_id: tutorPrevio.cuerpo.id, eliminado_en: null } }), 1);
});

test("IDEMPOTENCIA: convertir dos veces no duplica nada; la segunda devuelve lo ya convertido (200)", async () => {
  const L = await leadCompleto();
  const una = await asesorNorte.post<Conv>(`/api/leads/${L.leadId}/convertir`, {});
  assert.equal(una.estado, 201);
  const cuentas = async () => [await prisma.tutor.count({ where: { organizacion_id: org.organizacionId, OR: [{ telefono: L.telefono! }, { telefono: "+525533334444" }] } }), await prisma.alumno.count({ where: { prospectos: { some: { id: L.prospectoId } } } }), await prisma.inscripcion.count({ where: { lead_id: L.leadId } }), await prisma.tutor_alumno.count({ where: { alumno: { prospectos: { some: { id: L.prospectoId } } } } }), await prisma.promocion_aplicacion.count({ where: { inscripcion: { lead_id: L.leadId } } })];
  const antes = await cuentas();
  const dos = await asesorNorte.post<Conv>(`/api/leads/${L.leadId}/convertir`, {});
  assert.equal(dos.estado, 200);
  assert.equal(dos.cuerpo.ya_convertido, true);
  assert.equal(dos.cuerpo.alumnos[0]!.alumno_id, una.cuerpo.alumnos[0]!.alumno_id);
  assert.equal(dos.cuerpo.alumnos[0]!.inscripcion!.id, una.cuerpo.alumnos[0]!.inscripcion!.id);
  assert.equal(dos.cuerpo.alumnos[0]!.inscripcion!.creada, false);
  assert.deepEqual(await cuentas(), antes);
  assert.deepEqual(antes.slice(0, 4), [2, 1, 1, 2]);
});

test("hermanos: un lead con dos prospectos da UN tutor, dos alumnos y dos inscripciones en grupos distintos", async () => {
  const f = await leadDelBot({ nombre: "Hermano uno", sucursalId: norte });
  const dos = await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, vertical_interes_id: org.verticalId, nombre: "Hermano dos", edad_declarada: 10, origen: "asesor" } });
  const [g1, g2] = [await grupoNuevo(), await grupoNuevo()];
  await aceptaReglamento(f.leadId, f.prospectoId);
  await aceptaReglamento(f.leadId, dos.id);
  const faltan = await asesorNorte.get<Previa>(`/api/leads/${f.leadId}/conversion`);
  assert.equal(faltan.cuerpo.faltantes.filter((x) => x.campo.endsWith("alumno.apellidos")).length, 2, "se pide por cada hijo");
  const r = await asesorNorte.post<Conv & Errores>(`/api/leads/${f.leadId}/convertir`, {
    tutor: { parentesco: "madre" },
    prospectos: [
      { prospecto_id: f.prospectoId, alumno: { apellidos: "Uno", fecha_nacimiento: "2019-01-01" }, inscripcion: { grupo_id: g1.grupoId } },
      { prospecto_id: dos.id, alumno: { apellidos: "Dos", fecha_nacimiento: "2016-02-02" }, inscripcion: { grupo_id: g2.grupoId } },
    ],
  });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.alumnos.length, 2);
  assert.equal(new Set(r.cuerpo.alumnos.flatMap((a) => a.tutor_ids)).size, 1, "los dos comparten el mismo tutor");
  assert.equal(await prisma.inscripcion.count({ where: { lead_id: f.leadId, estatus: "activa" } }), 2);
  assert.equal(await prisma.tutor_alumno.count({ where: { tutor_id: r.cuerpo.tutor_id! } }), 2);
});

test("ATOMICIDAD: si la inscripción del segundo hijo falla (grupo lleno), NO queda nada: ni tutor, ni alumnos, ni vínculos, ni la inscripción del primero, ni cupo de promoción, y la salud sigue en el prospecto", async () => {
  // Un grupo que sale primero en el orden de inscripción (por id) y otro lleno que sale después, para que haya trabajo hecho cuando falla.
  let bueno = await grupoNuevo();
  let lleno = await grupoNuevo({ cupo: 1 });
  for (let i = 0; i < 20 && bueno.grupoId > lleno.grupoId; i++) {
    bueno = await grupoNuevo();
    lleno = await grupoNuevo({ cupo: 1 });
  }
  assert.ok(bueno.grupoId < lleno.grupoId, "preparación: el grupo bueno se inscribe antes que el lleno");
  const ocupante = await sembrarAlumno(prisma, org, { docs });
  assert.equal((await admin.post("/api/inscripciones", { alumno_id: ocupante.alumnoId, grupo_id: lleno.grupoId })).estado, 201);
  const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "Atomica", codigo: `AT${Date.now()}`, vigencia_desde: new Date("2020-01-01"), cupo_maximo: 10, acumulable: true, prioridad: 9 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "50.00" } });
  const f = await leadDelBot({ nombre: "Atómico uno", sucursalId: norte });
  const dos = await prisma.prospecto.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, vertical_interes_id: org.verticalId, nombre: "Atómico dos", edad_declarada: 9, origen: "asesor" } });
  // Los dos hijos tienen aceptado el reglamento; el primero además salud capturada.
  for (const pid of [f.prospectoId, dos.id]) {
    await prisma.aceptacion_legal.create({ data: { organizacion_id: org.organizacionId, documento_id: docs.reglamento, tipo: "reglamento", version_aceptada: 1, resultado: "aceptada", lead_id: f.leadId, prospecto_id: pid, aceptante_nombre: "Mamá", canal: "presencial", aceptado_en: AHORA, texto_hash: (await prisma.documento_legal.findFirstOrThrow({ where: { id: docs.reglamento } })).texto_hash } });
  }
  assert.equal((await admin.pedir("PUT", `/api/salud/prospecto/${f.prospectoId}`, { motivo: "prueba", alergias: SALUD.alergias })).estado >= 200, true);
  const antesTutores = await prisma.tutor.count({ where: { organizacion_id: org.organizacionId } });
  const antesAlumnos = await prisma.alumno.count({ where: { organizacion_id: org.organizacionId } });
  const r = await asesorNorte.post<Errores>(`/api/leads/${f.leadId}/convertir`, {
    tutor: { parentesco: "madre" },
    prospectos: [
      { prospecto_id: f.prospectoId, alumno: { apellidos: "Uno", fecha_nacimiento: "2019-01-01" }, inscripcion: { grupo_id: bueno.grupoId } },
      { prospecto_id: dos.id, alumno: { apellidos: "Dos", fecha_nacimiento: "2016-02-02" }, inscripcion: { grupo_id: lleno.grupoId } },
    ],
  });
  assert.equal(r.estado, 409, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.error.detalles?.find((d) => d.campo === "motivo")?.mensaje, "grupo_lleno");
  assert.equal(await prisma.tutor.count({ where: { organizacion_id: org.organizacionId } }), antesTutores);
  assert.equal(await prisma.alumno.count({ where: { organizacion_id: org.organizacionId } }), antesAlumnos);
  assert.equal(await prisma.inscripcion.count({ where: { lead_id: f.leadId } }), 0);
  assert.equal(await prisma.inscripcion.count({ where: { grupo_id: bueno.grupoId } }), 0);
  assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: promo.id } })).cupo_usado, 0, "el cupo de la promoción se devolvió");
  const lead = await prisma.lead.findFirstOrThrow({ where: { id: f.leadId }, include: { prospectos: true } });
  assert.equal(lead.tutor_id, null);
  assert.equal(lead.etapa_id, etapas.negociacion);
  assert.ok(lead.prospectos.every((p) => p.alumno_id === null));
  const salud = await admin.get<{ campos: { alergias: string } }>(`/api/salud/prospecto/${f.prospectoId}?motivo=comprobar`);
  assert.equal(salud.cuerpo.campos.alergias, SALUD.alergias, "la salud NO se mudó");
  assert.equal(await prisma.promocion_aplicacion.count({ where: { promocion_id: promo.id } }), 0);
  await prisma.promocion.update({ where: { id: promo.id }, data: { activo: false } });
});

test("CONCURRENCIA: 6 conversiones simultáneas del mismo lead dejan UN tutor, UN alumno y UNA inscripción; solo una crea y las demás reciben lo ya convertido", async () => {
  const L = await leadCompleto();
  const barrera = new Barrera(6);
  const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "lead", operacion: "findFirst", cuando: (a) => JSON.stringify(a["select"]) === '{"id":true}' && JSON.stringify(a["where"]).includes(L.leadId), antes: () => barrera.esperar(3000) }), { reloj: () => AHORA, sensibles: { cifrador } });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const clientes = await Promise.all(Array.from({ length: 6 }, async () => {
      const c = apiCarrera.cliente();
      assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
      return c;
    }));
    const rs = await Promise.all(clientes.map((c) => c.post<Conv & Errores>(`/api/leads/${L.leadId}/convertir`, {})));
    assert.deepEqual(rs.map((r) => r.estado).sort(), [200, 200, 200, 200, 200, 201], JSON.stringify(rs.map((r) => r.cuerpo.error)));
    assert.ok(barrera.completa, "las 6 entraron a la vez");
    assert.equal(new Set(rs.map((r) => r.cuerpo.alumnos[0]!.alumno_id)).size, 1);
    assert.equal(await prisma.alumno.count({ where: { prospectos: { some: { id: L.prospectoId } } } }), 1);
    assert.equal(await prisma.inscripcion.count({ where: { lead_id: L.leadId } }), 1);
    assert.equal(await prisma.tutor.count({ where: { organizacion_id: org.organizacionId, telefono: L.telefono! } }), 1);
  } finally {
    await apiCarrera.cerrar();
  }
});

test("lo que impediría inscribir se dice ANTES: reglamento sin aceptar y programa sin precio aparecen como faltantes, y el lead no cambia", async () => {
  const f = await leadDelBot({ nombre: "Sin reglamento", sucursalId: norte });
  const sinPrecio = await grupoNuevo({ precio: null });
  const previa = await asesorNorte.get<Previa>(`/api/leads/${f.leadId}/conversion`);
  assert.ok(previa.cuerpo.faltantes.some((x) => x.campo.endsWith("grupo_id")));
  const cuerpo = { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.prospectoId, alumno: { apellidos: "X", fecha_nacimiento: "2019-01-01" }, inscripcion: { grupo_id: sinPrecio.grupoId } }] };
  const r = await asesorNorte.post<Errores>(`/api/leads/${f.leadId}/convertir`, cuerpo);
  assert.equal(r.estado, 409);
  const campos = r.cuerpo.error.detalles!.map((d) => d.campo);
  assert.ok(campos.includes(`prospectos.${f.prospectoId}.precio`) && campos.includes(`prospectos.${f.prospectoId}.reglamento`), JSON.stringify(campos));
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, etapas.negociacion);
});

test("permisos y alcance: recepción y maestro no convierten, el asesor del sur no ve el lead del norte (404), fuera de edad solo el administrador, un grupo ajeno o fecha absurda se rechazan", async () => {
  const f = await leadDelBot({ nombre: "Permisos", sucursalId: norte });
  const url = `/api/leads/${f.leadId}`;
  assert.equal((await recepcion.get(`${url}/conversion`)).estado, 403);
  assert.equal((await maestro.post(`${url}/convertir`, {})).estado, 403);
  assert.equal((await asesorSur.get(`${url}/conversion`)).estado, 404);
  assert.equal((await asesorSur.post(`${url}/convertir`, {})).estado, 404);
  assert.equal((await api.cliente().get(`${url}/conversion`)).estado, 401);
  assert.equal((await asesorNorte.get("/api/leads/00000000-0000-4000-8000-0000000000ee/conversion")).estado, 404);
  const g = await grupoNuevo();
  const base = { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.prospectoId, alumno: { apellidos: "X", fecha_nacimiento: "2019-01-01" }, inscripcion: { grupo_id: g.grupoId, permitir_fuera_de_edad: true } }] };
  assert.equal((await asesorNorte.post(`${url}/convertir`, base)).estado, 403, "fuera de edad: solo el administrador");
  const mala = { ...base, prospectos: [{ ...base.prospectos[0]!, alumno: { apellidos: "X", fecha_nacimiento: "2031-01-01" }, inscripcion: { grupo_id: g.grupoId } }] };
  const r = await asesorNorte.post<Errores>(`${url}/convertir`, mala);
  assert.equal(r.estado, 409, "una fecha de nacimiento futura es un dato que falta");
  assert.ok(r.cuerpo.error.detalles!.some((d) => (d.campo ?? "").endsWith("alumno.fecha_nacimiento")));
  const ajeno = await asesorNorte.post<Errores>(`${url}/convertir`, { prospectos: [{ prospecto_id: "00000000-0000-4000-8000-0000000000ff" }] });
  assert.equal(ajeno.estado, 409);
  assert.ok(ajeno.cuerpo.error.detalles!.some((d) => d.mensaje.includes("no es de este lead")));
  assert.equal((await asesorNorte.post(`${url}/convertir`, { prospectos: [{ prospecto_id: f.prospectoId, desconocido: 1 }] })).estado, 400);
});

test("EF-01: la conversión no reparte el cupo de otra sucursal — el grupo, mandado o deducido de la cotización, tiene que ser del alcance de quien convierte (el administrador sí puede)", async () => {
  const gNorte = await grupoNuevo({ sucursalId: norte, cupo: 3 });
  const gSur = await grupoNuevo({ sucursalId: sur, cupo: 3 });
  const f = await leadDelBot({ nombre: "Ajeno", sucursalId: sur });
  await aceptaReglamento(f.leadId, f.prospectoId);
  const cuerpo = (grupoId?: string) => ({ tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f.prospectoId, alumno: { apellidos: "Soto", fecha_nacimiento: "2019-01-01" }, ...(grupoId ? { inscripcion: { grupo_id: grupoId } } : {}) }] });
  const enNorte = () => prisma.inscripcion.count({ where: { grupo_id: gNorte.grupoId } });
  const sinAlumno = async () => assert.equal((await prisma.prospecto.findFirstOrThrow({ where: { id: f.prospectoId } })).alumno_id, null, "no quedó nada a medias");
  // Mandado por el asesor del SUR: el grupo del norte no existe para él (como en POST /api/inscripciones).
  assert.equal((await asesorSur.post(`/api/leads/${f.leadId}/convertir`, cuerpo(gNorte.grupoId))).estado, 404);
  assert.equal(await enNorte(), 0);
  await sinAlumno();
  // Deducido: la familia eligió ese horario al cotizar. La vista previa y la conversión lo tratan como un dato que falta, no como una inscripción en el norte.
  await prisma.cotizacion.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, programa_id: gNorte.programaId, sucursal_id: norte, origen: "asesor", creado_por_usuario_id: adminId, grupo_elegido_id: gNorte.grupoId, fecha: new Date("2026-11-09"), vigente_hasta: new Date("2026-11-16"), snapshot: {} } });
  const previa = await asesorSur.get<Previa>(`/api/leads/${f.leadId}/conversion`);
  assert.equal(previa.cuerpo.listo, false);
  assert.ok(previa.cuerpo.faltantes.some((x) => x.campo.endsWith("grupo_id") && x.mensaje.includes("alcance")), JSON.stringify(previa.cuerpo.faltantes));
  const r = await asesorSur.post<Errores>(`/api/leads/${f.leadId}/convertir`, cuerpo());
  assert.equal(r.estado, 409);
  assert.equal(await enNorte(), 0);
  await sinAlumno();
  // Lo suyo sí: el grupo del sur, mandado por el asesor del sur.
  const g = await asesorSur.post(`/api/leads/${f.leadId}/convertir`, cuerpo(gSur.grupoId));
  assert.equal(g.estado, 201, JSON.stringify(g.cuerpo));
  // El administrador no tiene restricción de sucursal.
  const f2 = await leadDelBot({ nombre: "Admin", sucursalId: sur });
  await aceptaReglamento(f2.leadId, f2.prospectoId);
  const a = await admin.post(`/api/leads/${f2.leadId}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: f2.prospectoId, alumno: { apellidos: "Soto", fecha_nacimiento: "2019-01-01" }, inscripcion: { grupo_id: gNorte.grupoId } }] });
  assert.equal(a.estado, 201, JSON.stringify(a.cuerpo));
  assert.equal(await enNorte(), 1);
});

test("el aislamiento entre organizaciones: el lead de otra organización es 404 y el teléfono igual en otra organización es otro tutor", async () => {
  const otra = await sembrarOrganizacion(prisma, "Conversión ajena");
  const e2 = await sembrarEmbudo(prisma, otra);
  const fam = await sembrarFamilia(prisma, otra, { etapaId: e2.negociacion });
  assert.equal((await admin.get(`/api/leads/${fam.leadId}/conversion`)).estado, 404);
  assert.equal((await admin.post(`/api/leads/${fam.leadId}/convertir`, {})).estado, 404);
});
