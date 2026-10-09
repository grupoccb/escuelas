// El mundo de datos de las pruebas en navegador: una organización con dos sucursales, un usuario por rol, el catálogo mínimo y, por bloque de la etapa J,
// lo que cada pantalla necesita. Todo ficticio (nombres genéricos, teléfonos de prueba, sin datos reales). Los tests lo leen de `.tmp/navegador/mundo.json`.
//
// Para agregar datos de una pantalla nueva: una función `sembrar<Pantalla>` aquí que devuelva los ids que el test necesita, y su campo en `Mundo`.

import type { Rol } from "../../src/auth/roles.ts";
import type { ClaseDelMundo, LeadDelMundo, Mundo, UsuarioDelMundo } from "./tipos.ts";

export type { Mundo, UsuarioDelMundo };
import { CONTRASENA_DE_PRUEBA, sembrarUsuario, type ClienteApi } from "../../src/testutil/api.ts";
import type { PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../../src/testutil/semilla.ts";

/** Los siete días de la semana a las 16:00–17:00: así cualquier día es una sesión del grupo (el pase de ayer y la próxima clase muestra existen siempre). */
const TODOS_LOS_DIAS: [number, number, number][] = [0, 1, 2, 3, 4, 5, 6].map((d) => [d, 960, 1020]);

async function usuario(prisma: PrismaPruebas, org: OrganizacionDePrueba, rol: Rol, nombre: string, correo: string, sucursales: string[]): Promise<UsuarioDelMundo> {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol, nombre, correo, contrasena: CONTRASENA_DE_PRUEBA, sucursales });
  return { id: u.id, correo: u.correo, contrasena: u.contrasena, nombre, rol };
}

export async function sembrarMundo(prisma: PrismaPruebas, nuevoCliente: () => ClienteApi, base: string): Promise<Mundo> {
  const org = await sembrarOrganizacion(prisma, "Escuela de prueba");
  const etapas = await sembrarEmbudo(prisma, org);
  const docs = await sembrarDocumentosLegales(prisma, org);
  const norte = org.sucursales[0]!;
  const sur = org.sucursales[1]!;

  const administrador = await usuario(prisma, org, "administrador", "Adela Administradora", "admin@navegador.test", []);
  const asesor = await usuario(prisma, org, "asesor", "Alba Asesora", "asesor@navegador.test", [norte.id]);
  const maestro = await usuario(prisma, org, "maestro", "Mario Maestro", "maestro@navegador.test", []);
  const recepcion = await usuario(prisma, org, "recepcion", "Rita Recepción", "recepcion@navegador.test", [norte.id, sur.id]);
  const bloqueable = await usuario(prisma, org, "asesor", "Berta Bloqueable", "bloqueable@navegador.test", [norte.id]);

  const instructor = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: maestro.id, nombre: maestro.nombre } });
  const programa = await sembrarPrograma(prisma, org, {
    sucursalId: norte.id,
    nombre: "Programa de prueba",
    edadMin: 3,
    edadMax: 14,
    grupos: [
      { nombre: "Grupo A", cupoMaximo: 8, horarios: TODOS_LOS_DIAS },
      { nombre: "Grupo B", cupoMaximo: 8, horarios: TODOS_LOS_DIAS },
    ],
    precio: { inscripcion: "500.00", mensualidad: "1000.00", desde: "2020-01-01" },
  });
  const [grupoA, grupoB] = programa.grupos as [{ id: string; nombre: string }, { id: string; nombre: string }];
  await prisma.grupo.update({ where: { id: grupoA.id }, data: { instructor_id: instructor.id } });

  const maestroDelMundo = await sembrarMaestro(prisma, org, docs, { norte: norte.id, grupoA: grupoA.id, grupoB: grupoB.id, programaId: programa.id });

  const conversion = await sembrarConversion(prisma, org, docs, etapas, nuevoCliente, { norte: norte.id, grupoA: grupoA.id, programaId: programa.id }, maestro);
  const finanzas = await sembrarRecepcion(prisma, org, docs, nuevoCliente, { norte: norte.id, programaId: programa.id }, administrador);
  const asesorDelMundo = await sembrarAsesor(prisma, org, etapas, { norte: norte.id, sur: sur.id });
  const mensajeria = await sembrarMensajeria(prisma, org);
  const recorridos = await sembrarRecorridos(prisma, org, docs, etapas, nuevoCliente, { norte: norte.id, programaId: programa.id, grupoD: finanzas.grupoD.id }, administrador);
  const tableros = await sembrarTableros(prisma, org, { norte: norte.id, grupo: finanzas.grupoD.id, programaId: programa.id, usuarioId: administrador.id });
  const familia = await sembrarFamiliaYExpediente(prisma, org, docs, nuevoCliente, { norte: norte.id, programaId: programa.id, grupoD: finanzas.grupoD.id, alumnoConSalud: maestroDelMundo.alumnosDelPase[0]! }, administrador);

  return {
    base,
    organizacion: { id: org.organizacionId, slug: org.slug },
    usuarios: { administrador, asesor, maestro, recepcion, bloqueable },
    sucursales: { norte, sur },
    verticalId: org.verticalId,
    etapas,
    programaId: programa.id,
    grupos: { a: grupoA, b: grupoB },
    instructorId: instructor.id,
    maestro: maestroDelMundo,
    asesor: asesorDelMundo,
    conversion,
    recepcion: finanzas,
    familia,
    mensajeria,
    tableros,
    recorridos,
  };
}

/** Un minuto exacto (la base exige `fecha_hora` sin segundos). */
const enMinuto = (ms: number): Date => new Date(Math.floor(ms / 60_000) * 60_000);

async function claseMuestra(prisma: PrismaPruebas, org: OrganizacionDePrueba, o: { nombre: string; edad: number; sucursalId: string; grupoId: string; cuando: Date; usuarioId: string }): Promise<ClaseDelMundo> {
  const { leadId, prospectoId } = await sembrarFamilia(prisma, org, { sucursalId: o.sucursalId, nombre: o.nombre, edad: o.edad });
  const clase = await prisma.clase_muestra.create({ data: { organizacion_id: org.organizacionId, lead_id: leadId, prospecto_id: prospectoId, grupo_id: o.grupoId, fecha_hora: o.cuando, agendada_por: "usuario", agendada_por_usuario_id: o.usuarioId } });
  return { id: clase.id, leadId, prospectoId, prospecto: o.nombre, grupoId: o.grupoId };
}

/** J2: clases muestra del maestro (una ya empezada, una futura, una ajena) y los alumnos inscritos en su grupo para el pase de lista. */
async function sembrarMaestro(prisma: PrismaPruebas, org: OrganizacionDePrueba, docs: DocumentosLegalesSembrados, ids: { norte: string; grupoA: string; grupoB: string; programaId: string }): Promise<Mundo["maestro"]> {
  const admin = await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, rol: "administrador" }, select: { id: true } });
  const ahora = Date.now();
  const clase = await claseMuestra(prisma, org, { nombre: "Alumna Uno", edad: 7, sucursalId: ids.norte, grupoId: ids.grupoA, cuando: enMinuto(ahora - 90 * 60_000), usuarioId: admin.id });
  const claseFutura = await claseMuestra(prisma, org, { nombre: "Alumno Dos", edad: 9, sucursalId: ids.norte, grupoId: ids.grupoA, cuando: enMinuto(ahora + 3 * 86_400_000), usuarioId: admin.id });
  const claseAjena = await claseMuestra(prisma, org, { nombre: "Alumna Ajena", edad: 8, sucursalId: ids.norte, grupoId: ids.grupoB, cuando: enMinuto(ahora - 60 * 60_000), usuarioId: admin.id });

  const alumnosDelPase: Mundo["maestro"]["alumnosDelPase"] = [];
  for (const nombre of ["Ana", "Beto", "Cira"]) {
    const a = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre });
    const inicio = new Date(Date.now() - 60 * 86_400_000);
    inicio.setUTCHours(0, 0, 0, 0);
    const insc = await prisma.inscripcion.create({
      data: { organizacion_id: org.organizacionId, alumno_id: a.alumnoId, programa_id: ids.programaId, grupo_id: ids.grupoA, lead_id: a.leadId, fecha_inscripcion: inicio, fecha_inicio: inicio, estatus: "activa", precio_inscripcion_aplicado: "500.00", precio_mensualidad_aplicado: "1000.00", dia_corte_pago: 5 },
    });
    alumnosDelPase.push({ alumnoId: a.alumnoId, inscripcionId: insc.id, nombre: `${nombre} Prueba` });
  }
  return { clase, claseFutura, claseAjena, alumnosDelPase };
}

/** J3: leads del embudo del asesor del norte. */
async function sembrarAsesor(prisma: PrismaPruebas, org: OrganizacionDePrueba, etapas: Record<string, string>, ids: { norte: string; sur: string }): Promise<Mundo["asesor"]> {
  await prisma.etapa_pipeline.update({ where: { id: etapas["contactado"]! }, data: { dias_alerta_sin_movimiento: 3 } });
  const precio = await prisma.motivo_perdida.create({ data: { organizacion_id: org.organizacionId, codigo: "precio", nombre: "Precio", orden: 1 } });
  const horario = await prisma.motivo_perdida.create({ data: { organizacion_id: org.organizacionId, codigo: "horario", nombre: "Horario", orden: 2 } });
  const campanaNombre = "Campaña de prueba en redes";
  const campana = await prisma.campana.create({ data: { organizacion_id: org.organizacionId, nombre: campanaNombre, origen: "facebook" } });

  const lead = async (nombre: string, o: { sucursalId: string; etapaId: string; edad: number; alumno: string; hace?: number }): Promise<LeadDelMundo> => {
    const f = await sembrarFamilia(prisma, org, { sucursalId: o.sucursalId, nombre: o.alumno, edad: o.edad, etapaId: o.etapaId });
    await prisma.lead.update({ where: { id: f.leadId }, data: { nombre_contacto: nombre, ultima_interaccion_en: new Date(Date.now() - (o.hace ?? 0) * 86_400_000) } });
    return { leadId: f.leadId, prospectoId: f.prospectoId, nombre };
  };
  const alfa = await lead("Familia Alfa", { sucursalId: ids.norte, etapaId: etapas["nuevo"]!, edad: 6, alumno: "Niña Alfa" });
  await prisma.lead.update({ where: { id: alfa.leadId }, data: { campana_id: campana.id, atribucion: { fuente: "codigo", codigo_rastreo: "ABCD2345" } } });
  const conversacionId = 4242;
  await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: alfa.leadId, chatwoot_conversacion_id: conversacionId } });
  const tarea = await prisma.tarea_asesor.create({ data: { organizacion_id: org.organizacionId, lead_id: alfa.leadId, tipo: "revision_manual", descripcion: "Revisar los datos de Familia Alfa" } });
  const beta = await lead("Familia Beta", { sucursalId: ids.norte, etapaId: etapas["contactado"]!, edad: 8, alumno: "Niño Beta" });
  const gamma = await lead("Familia Gamma", { sucursalId: ids.norte, etapaId: etapas["contactado"]!, edad: 10, alumno: "Niña Gamma", hace: 10 });
  const tareaGamma = await prisma.tarea_asesor.create({ data: { organizacion_id: org.organizacionId, lead_id: gamma.leadId, tipo: "lead_frio", descripcion: "Retomar el contacto con Familia Gamma" } });
  const delta = await lead("Familia Delta", { sucursalId: ids.sur, etapaId: etapas["nuevo"]!, edad: 7, alumno: "Niño Delta" });
  return { alfa: { ...alfa, tareaId: tarea.id, chatwoot: { cuentaId: org.chatwootAccountId, bandejaId: org.chatwootInboxId, conversacionId } }, beta, gamma: { ...gamma, tareaId: tareaGamma.id }, delta, motivos: { precio: precio.id, horario: horario.id }, campanaNombre };
}

/** J4: dos familias para el asistente de conversión, y un grupo de un solo lugar para provocar el rechazo por cupo. */
async function sembrarConversion(
  prisma: PrismaPruebas,
  org: OrganizacionDePrueba,
  docs: DocumentosLegalesSembrados,
  etapas: Record<string, string>,
  nuevoCliente: () => ClienteApi,
  ids: { norte: string; grupoA: string; programaId: string },
  maestro: UsuarioDelMundo,
): Promise<Mundo["conversion"]> {
  const grupoC = await prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: ids.programaId, nombre: "Grupo C", cupo_maximo: 1 } });
  for (const dia of [0, 1, 2, 3, 4, 5, 6]) await prisma.grupo_horario.create({ data: { organizacion_id: org.organizacionId, grupo_id: grupoC.id, dia_semana: dia, hora_inicio_min: 960, hora_fin_min: 1020 } });
  const relleno = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: "Relleno" });

  const admin = await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, rol: "administrador" }, select: { id: true } });
  const familia = async (nombre: string, alumno: string, edad: number, etapaId: string) => {
    const f = await sembrarFamilia(prisma, org, { sucursalId: ids.norte, nombre: alumno, edad, etapaId });
    await prisma.lead.update({ where: { id: f.leadId }, data: { nombre_contacto: nombre, ultima_interaccion_en: new Date() } });
    return { leadId: f.leadId, prospectoId: f.prospectoId, nombre };
  };
  const epsilon = await familia("Familia Épsilon", "Niño Épsilon", 8, etapas["muestra_asistida"]!);
  const cuando = new Date(Math.floor((Date.now() - 3 * 3_600_000) / 60_000) * 60_000);
  const clase = await prisma.clase_muestra.create({
    data: { organizacion_id: org.organizacionId, lead_id: epsilon.leadId, prospecto_id: epsilon.prospectoId, grupo_id: ids.grupoA, fecha_hora: cuando, estatus: "asistio", agendada_por: "usuario", agendada_por_usuario_id: admin.id, asistencia_marcada_en: new Date(), asistencia_marcada_por_usuario_id: admin.id },
  });
  // El registro lo captura el maestro, por la API (como en la vida real): todo menos los apellidos del alumno.
  const m = nuevoCliente();
  const login = await m.login(org.slug, maestro.correo, maestro.contrasena);
  if (login.estado !== 201) throw new Error(`El maestro no pudo iniciar sesión (${login.estado})`);
  const r = await m.patch(`/api/clases-muestra/${clase.id}/registro`, {
    alumno: { nombre: "Emilio", fecha_nacimiento: "2018-03-02", sexo: "masculino", escuela: "Escuela Nueva", turno_escolar: "matutino", talla_uniforme: "8" },
    tutores: [{ nombre: "Rosa", apellidos: "Épsilon", parentesco: "madre", telefono: "5544332211", es_responsable_pago: true, lo_lleva: true }],
    antecedentes: { practico_antes: false, motivo_clase: "disciplina" },
    observacion: { grupo_recomendado_id: grupoC.id, interes_percibido: "alto" },
  });
  if (r.estado !== 200) throw new Error(`No se pudo capturar el registro de prueba (${r.estado}): ${JSON.stringify(r.cuerpo)}`);

  const zeta = await familia("Familia Zeta", "Niña Zeta", 6, etapas["contactado"]!);
  return { epsilon: { ...epsilon, claseId: clase.id }, zeta, grupoC: { id: grupoC.id, nombre: grupoC.nombre }, rellenoAlumnoId: relleno.alumnoId };
}

const fechaEnMexico = (ms: number): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** J5: finanzas de recepción. Todo por la API del administrador (como en la vida real), salvo lo que no tiene API (la promoción y la talla). */
async function sembrarRecepcion(
  prisma: PrismaPruebas,
  org: OrganizacionDePrueba,
  docs: DocumentosLegalesSembrados,
  nuevoCliente: () => ClienteApi,
  ids: { norte: string; programaId: string },
  administrador: UsuarioDelMundo,
): Promise<Mundo["recepcion"]> {
  const a = nuevoCliente();
  if ((await a.login(org.slug, administrador.correo, administrador.contrasena)).estado !== 201) throw new Error("El administrador no pudo iniciar sesión");
  const ok = async <T>(r: Promise<{ estado: number; cuerpo: T }>, que: string): Promise<T> => {
    const x = await r;
    if (x.estado < 200 || x.estado >= 300) throw new Error(`${que}: ${x.estado} ${JSON.stringify(x.cuerpo)}`);
    return x.cuerpo;
  };

  // Un grupo de cupo holgado y sin horarios (no aparece en el cotizador, así que no estorba a las pruebas de conversión).
  const grupoD = await prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: ids.programaId, nombre: "Grupo D", cupo_maximo: 50 } });

  const producto = async (nombre: string, talla: string | null, precio: string, stock: number) =>
    ok(a.post<{ id: string }>("/api/productos", { vertical_id: org.verticalId, nombre, ...(talla ? { talla } : {}), precio, stock }), `producto ${nombre}`);
  const uniforme8 = await producto("Uniforme", "8", "350.00", 3);
  const uniforme10 = await producto("Uniforme", "10", "350.00", 2);
  const playera = await producto("Playera", null, "120.00", 1);
  const gorra = await producto("Gorra", null, "80.00", 1);

  // La familia con dos hijos.
  const telefono = "5555010101";
  const uno = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: "Hijo Uno", telefono: `+52${telefono}` });
  const dos = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: "Hija Dos", conTutor: uno.tutorId });
  await prisma.tutor.update({ where: { id: uno.tutorId }, data: { apellidos: "Gómez" } });
  await prisma.alumno.updateMany({ where: { id: { in: [uno.alumnoId, dos.alumnoId] } }, data: { apellidos: "Gómez" } });
  for (const al of [uno, dos]) await ok(a.post("/api/inscripciones", { alumno_id: al.alumnoId, grupo_id: grupoD.id }), "inscribir");
  const vencido = await ok(a.post<{ id: string }>("/api/cargos", { alumno_id: uno.alumnoId, descripcion: "Examen anterior", monto: "800.00", fecha_vencimiento: fechaEnMexico(Date.now() - 40 * 86_400_000) }), "cargo vencido");

  // La familia del uniforme: una promoción «al pagar la primera mensualidad» (se apaga al terminar, para no tocar a nadie más), la inscripción y el pago.
  const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "Uniforme de bienvenida", codigo: "UNIFORME-NAV", vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", acumulable: true, prioridad: 5 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Uniforme" } });
  const uni = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: "Alumno Uniforme", telefono: "+525555020202" });
  await prisma.alumno.update({ where: { id: uni.alumnoId }, data: { talla_uniforme: "8", apellidos: "Prueba" } });
  const insc = await ok(a.post<{ id: string }>("/api/inscripciones", { alumno_id: uni.alumnoId, grupo_id: grupoD.id }), "inscribir al del uniforme");
  const cargos = await ok(a.get<{ datos: { id: string; concepto: string; saldo: string }[] }>(`/api/cargos?tutor_id=${uni.tutorId}`), "cargos del uniforme");
  const mensualidad = cargos.datos.find((c) => c.concepto === "mensualidad");
  if (!mensualidad) throw new Error("La inscripción no generó la primera mensualidad");
  await ok(a.post("/api/pagos", { tutor_id: uni.tutorId, monto: mensualidad.saldo, metodo: "efectivo", aplicaciones: [{ cargo_id: mensualidad.id, monto: mensualidad.saldo }] }), "pago de la primera mensualidad");
  await prisma.promocion.update({ where: { id: promo.id }, data: { activo: false } });
  const beneficio = await prisma.promocion_aplicacion.findFirstOrThrow({ where: { inscripcion_id: insc.id, estatus: "liberado" } });

  return {
    gomez: { tutorId: uno.tutorId, telefono, nombre: "Rosa Gómez", hijos: [{ alumnoId: uno.alumnoId, nombre: "Hijo Uno" }, { alumnoId: dos.alumnoId, nombre: "Hija Dos" }], cargoVencidoId: vencido.id },
    uniforme: { tutorId: uni.tutorId, alumnoId: uni.alumnoId, nombre: "Alumno Uniforme", beneficioId: beneficio.id },
    productos: { uniforme8: { id: uniforme8.id, nombre: "Uniforme", talla: "8" }, uniforme10: { id: uniforme10.id, nombre: "Uniforme", talla: "10" }, playera: { id: playera.id, nombre: "Playera" }, gorra: { id: gorra.id, nombre: "Gorra" } },
    grupoD: { id: grupoD.id, nombre: grupoD.nombre },
  };
}

/** J6: una familia para cambiar de grupo, congelar y dar de baja; dos grupos del mismo programa; un motivo de baja; y la ficha de salud (con un centinela) de un alumno del maestro. */
async function sembrarFamiliaYExpediente(
  prisma: PrismaPruebas,
  org: OrganizacionDePrueba,
  docs: DocumentosLegalesSembrados,
  nuevoCliente: () => ClienteApi,
  ids: { norte: string; programaId: string; grupoD: string; alumnoConSalud: { alumnoId: string; nombre: string } },
  administrador: UsuarioDelMundo,
): Promise<Mundo["familia"]> {
  const a = nuevoCliente();
  if ((await a.login(org.slug, administrador.correo, administrador.contrasena)).estado !== 201) throw new Error("El administrador no pudo iniciar sesión");
  const ok = async <T>(r: Promise<{ estado: number; cuerpo: T }>, que: string): Promise<T> => {
    const x = await r;
    if (x.estado < 200 || x.estado >= 300) throw new Error(`${que}: ${x.estado} ${JSON.stringify(x.cuerpo)}`);
    return x.cuerpo;
  };
  const grupo = async (nombre: string, cupo: number) => {
    const g = await prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: ids.programaId, nombre, cupo_maximo: cupo } });
    return { id: g.id, nombre: g.nombre };
  };
  const grupoDeUnLugar = await grupo("Grupo E", 1);
  const grupoDestino = await grupo("Grupo F", 6);
  const motivo = await ok(a.post<{ id: string; nombre: string }>("/api/motivos-baja", { nombre: "Mudanza de ciudad" }), "motivo de baja");
  const relleno = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: "Relleno Dos" });

  const telefono = "5555030303";
  const mayor = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: "Hija Mayor", telefono: `+52${telefono}` });
  const menor = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: "Hijo Menor", conTutor: mayor.tutorId });
  await prisma.tutor.update({ where: { id: mayor.tutorId }, data: { apellidos: "Rivera", correo: "rivera@ejemplo.test" } });
  await prisma.alumno.updateMany({ where: { id: { in: [mayor.alumnoId, menor.alumnoId] } }, data: { apellidos: "Rivera" } });
  const hijos: Mundo["familia"]["rivera"]["hijos"] = [];
  for (const [al, nombre] of [[mayor, "Hija Mayor"], [menor, "Hijo Menor"]] as const) {
    const insc = await ok(a.post<{ id: string }>("/api/inscripciones", { alumno_id: al.alumnoId, grupo_id: ids.grupoD }), `inscribir a ${nombre}`);
    hijos.push({ alumnoId: al.alumnoId, nombre, inscripcionId: insc.id });
  }

  const centinela = "CENTINELA-ALERGIA-J6";
  await ok(a.put(`/api/salud/alumno/${ids.alumnoConSalud.alumnoId}`, { motivo: "Alta de la ficha de prueba", alergias: centinela, condiciones_medicas: "Ninguna", medicamentos: "Ninguno" }), "salud de prueba");

  return {
    rivera: { tutorId: mayor.tutorId, telefono, nombre: "Rosa Rivera", hijos },
    grupoDeUnLugar,
    grupoDestino,
    rellenoAlumnoId: relleno.alumnoId,
    motivoBaja: { id: motivo.id, nombre: motivo.nombre },
    salud: { alumnoId: ids.alumnoConSalud.alumnoId, nombre: ids.alumnoConSalud.nombre, centinela },
  };
}

/** J8: dos plantillas (una de servicio y una de marketing), dos automatizaciones, un evento inesperado con su tarea y una tarea sin lead. */
async function sembrarMensajeria(prisma: PrismaPruebas, org: OrganizacionDePrueba): Promise<Mundo["mensajeria"]> {
  const plantilla = (codigo: string, sid: string, clase: "servicio" | "marketing", categoria: "utility" | "marketing", estado: "aprobada" | "pendiente") =>
    prisma.plantilla_mensaje.create({ data: { organizacion_id: org.organizacionId, codigo, content_sid: sid, categoria, clase_mensaje: clase, estado_aprobacion: estado, variables: [{ pos: 1, nombre: "nombre_familia" }] } });
  const servicio = await plantilla("recordatorio_de_prueba", "HX00000000000000000000000000000001", "servicio", "utility", "aprobada");
  const marketing = await plantilla("promocion_de_prueba", "HX00000000000000000000000000000002", "marketing", "marketing", "pendiente");
  const auto = (nombre: string, evento: "clase_muestra_proxima" | "cargo_vencido", offset: number, plantillaId: string) =>
    prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre, evento_disparador: evento, offset_minutos: offset, plantilla_id: plantillaId, max_intentos: 2, espaciado_minutos: 1440 } });
  const recordatorio = await auto("Recordatorio de prueba antes de la clase", "clase_muestra_proxima", -1440, servicio.id);
  const pago = await auto("Aviso de prueba de pago atrasado", "cargo_vencido", 4320, servicio.id);
  const tarea = await prisma.tarea_asesor.create({ data: { organizacion_id: org.organizacionId, tipo: "evento_inesperado", descripcion: "Llegó un mensaje de WhatsApp sin remitente" } });
  const detalle = "falta el campo del remitente";
  const evento = await prisma.evento_inesperado.create({ data: { organizacion_id: org.organizacionId, origen: "twilio_entrante", clave: "evento-de-prueba-1", causa: "forma_inesperada", detalle, forma: { cuerpo: "objeto(3)" }, tarea_id: tarea.id } });
  const sinLead = await prisma.tarea_asesor.create({ data: { organizacion_id: org.organizacionId, tipo: "revision_manual", descripcion: "Revisar un contacto que no se pudo ligar a ningún lead" } });
  return {
    plantillaServicio: { id: servicio.id, codigo: servicio.codigo },
    plantillaMarketing: { id: marketing.id, codigo: marketing.codigo },
    automatizaciones: { recordatorio: { id: recordatorio.id, nombre: recordatorio.nombre }, pagoAtrasado: { id: pago.id, nombre: pago.nombre } },
    evento: { id: evento.id, tareaId: tarea.id, detalle },
    tareaSinLead: { id: sinLead.id, descripcion: sinLead.descripcion },
  };
}

/** J9: una campaña de Facebook con 4 leads: dos clases asistidas (una con inscripción activa), una que no asistió y una agendada. Cifras fijas por campaña para comprobar los tableros; van en el grupo D (sin horarios) para no alterar los lugares de los grupos que ven las demás pantallas. */
async function sembrarTableros(prisma: PrismaPruebas, org: OrganizacionDePrueba, ids: { norte: string; grupo: string; programaId: string; usuarioId: string }): Promise<Mundo["tableros"]> {
  const campana = await prisma.campana.create({ data: { organizacion_id: org.organizacionId, nombre: "Campaña de tablero", origen: "facebook" } });
  const ahora = Date.now();
  const lead = async (nombre: string, edad: number) => {
    const f = await sembrarFamilia(prisma, org, { sucursalId: ids.norte, nombre, edad });
    await prisma.lead.update({ where: { id: f.leadId }, data: { campana_id: campana.id } });
    return f;
  };
  const clase = (f: { leadId: string; prospectoId: string }, cuando: number, estatus: "asistio" | "no_asistio" | "agendada") =>
    prisma.clase_muestra.create({
      data: {
        organizacion_id: org.organizacionId,
        lead_id: f.leadId,
        prospecto_id: f.prospectoId,
        grupo_id: ids.grupo,
        fecha_hora: enMinuto(cuando),
        estatus,
        agendada_por: "usuario",
        agendada_por_usuario_id: ids.usuarioId,
        ...(estatus === "agendada" ? {} : { asistencia_marcada_en: new Date(), asistencia_marcada_por_usuario_id: ids.usuarioId }),
      },
    });
  const a = await lead("Tablero Uno", 7);
  const b = await lead("Tablero Dos", 8);
  const c = await lead("Tablero Tres", 9);
  const d = await lead("Tablero Cuatro", 6);
  await clase(a, ahora - 5 * 3_600_000, "asistio");
  await clase(b, ahora - 4 * 3_600_000, "asistio");
  await clase(c, ahora - 3 * 3_600_000, "no_asistio");
  await clase(d, ahora + 2 * 86_400_000, "agendada");
  // El primero se inscribió: un alumno ligado a su prospecto, con inscripción activa de la campaña.
  const alumno = await prisma.alumno.create({ data: { organizacion_id: org.organizacionId, nombre: "Alumno Tablero", apellidos: "Prueba", fecha_nacimiento: new Date("2018-05-04T00:00:00.000Z"), sucursal_id: ids.norte } });
  await prisma.prospecto.update({ where: { id: a.prospectoId }, data: { alumno_id: alumno.id } });
  const hoy = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  await prisma.inscripcion.create({
    data: { organizacion_id: org.organizacionId, alumno_id: alumno.id, programa_id: ids.programaId, grupo_id: ids.grupo, lead_id: a.leadId, prospecto_id: a.prospectoId, fecha_inscripcion: hoy, fecha_inicio: hoy, estatus: "activa", precio_inscripcion_aplicado: "500.00", precio_mensualidad_aplicado: "1000.00", dia_corte_pago: 5 },
  });
  return { campana: { id: campana.id, nombre: campana.nombre }, leads: 4, clases: { agendadas: 4, asistidas: 2, noAsistidas: 1, inscritas: 1 } };
}

/**
 * J10: los datos de los cinco recorridos, un juego por vista (celular y escritorio) porque cada recorrido mueve lo suyo. Todo ficticio.
 * La maestra es otra persona con su propio grupo para no tocar el pase de lista de «Grupo A».
 */
async function sembrarRecorridos(
  prisma: PrismaPruebas,
  org: OrganizacionDePrueba,
  docs: DocumentosLegalesSembrados,
  etapas: Record<string, string>,
  nuevoCliente: () => ClienteApi,
  ids: { norte: string; programaId: string; grupoD: string },
  administrador: UsuarioDelMundo,
): Promise<Mundo["recorridos"]> {
  const numeroDelCanal = "+525500000001";
  // La landing manda a WhatsApp solo si el canal tiene número.
  await prisma.canal_whatsapp.updateMany({ where: { organizacion_id: org.organizacionId }, data: { numero_whatsapp: `whatsapp:${numeroDelCanal}` } });

  const maestra = await usuario(prisma, org, "maestro", "Marta Maestra", "maestra@navegador.test", []);
  const instructora = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: maestra.id, nombre: maestra.nombre } });
  const grupo = async (nombre: string, cupo: number, instructorId: string | null) => {
    const g = await prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: ids.programaId, nombre, cupo_maximo: cupo, ...(instructorId ? { instructor_id: instructorId } : {}) } });
    for (const dia of [0, 1, 2, 3, 4, 5, 6]) await prisma.grupo_horario.create({ data: { organizacion_id: org.organizacionId, grupo_id: g.id, dia_semana: dia, hora_inicio_min: 960, hora_fin_min: 1020 } });
    return { id: g.id, nombre: g.nombre };
  };
  const grupoPase = await grupo("Grupo de la maestra", 20, instructora.id);
  const grupoConversion = await grupo("Grupo de conversión", 30, null);

  // Dos alumnos ya inscritos en el grupo de la maestra (su pase de lista).
  const alumnosDelPase: string[] = [];
  for (const nombre of ["Dani", "Eli"]) {
    const a = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre });
    const inicio = new Date(Date.now() - 60 * 86_400_000);
    inicio.setUTCHours(0, 0, 0, 0);
    await prisma.inscripcion.create({
      data: { organizacion_id: org.organizacionId, alumno_id: a.alumnoId, programa_id: ids.programaId, grupo_id: grupoPase.id, lead_id: a.leadId, fecha_inscripcion: inicio, fecha_inicio: inicio, estatus: "activa", precio_inscripcion_aplicado: "500.00", precio_mensualidad_aplicado: "1000.00", dia_corte_pago: 5 },
    });
    alumnosDelPase.push(`${nombre} Prueba`);
  }

  const admin = await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, rol: "administrador" }, select: { id: true } });
  const a = nuevoCliente();
  if ((await a.login(org.slug, administrador.correo, administrador.contrasena)).estado !== 201) throw new Error("El administrador no pudo iniciar sesión");
  const m = nuevoCliente();
  if ((await m.login(org.slug, maestra.correo, maestra.contrasena)).estado !== 201) throw new Error("La maestra no pudo iniciar sesión");
  const ok = async <T>(r: Promise<{ estado: number; cuerpo: T }>, que: string): Promise<T> => {
    const x = await r;
    if (x.estado < 200 || x.estado >= 300) throw new Error(`${que}: ${x.estado} ${JSON.stringify(x.cuerpo)}`);
    return x.cuerpo;
  };
  // Uniformes talla 12 para los dos recorridos de pago.
  await ok(a.post("/api/productos", { vertical_id: org.verticalId, nombre: "Uniforme", talla: "12", precio: "350.00", stock: 6 }), "producto talla 12");

  const juego = async (vista: "celular" | "escritorio", n: number) => {
    const cuando = (ms: number): Date => enmin(ms);
    // Recorrido 2: la clase de la maestra, ya empezada.
    const claseDeLaMaestra = await claseMuestra(prisma, org, { nombre: vista === "celular" ? "Sofía Recorrido" : "Tomás Recorrido", edad: 7, sucursalId: ids.norte, grupoId: grupoPase.id, cuando: cuando(Date.now() - 80 * 60_000 - n * 60_000), usuarioId: admin.id });

    // Recorrido 3: lead con clase asistida y registro de la maestra completo salvo apellidos y reglamento.
    const nombreAlumno = vista === "celular" ? "Camila" : "Julián";
    const apellidos = vista === "celular" ? "Prado Vega" : "Prado Luna";
    const f = await sembrarFamilia(prisma, org, { sucursalId: ids.norte, nombre: nombreAlumno, edad: 8, etapaId: etapas["muestra_asistida"]! });
    await prisma.lead.update({ where: { id: f.leadId }, data: { nombre_contacto: `Familia Prado ${vista === "celular" ? "C" : "E"}`, ultima_interaccion_en: new Date() } });
    const claseAsistida = await prisma.clase_muestra.create({
      data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: grupoPase.id, fecha_hora: cuando(Date.now() - (4 + n) * 3_600_000), estatus: "asistio", agendada_por: "usuario", agendada_por_usuario_id: admin.id, asistencia_marcada_en: new Date(), asistencia_marcada_por_usuario_id: admin.id },
    });
    const telefonoPrado = vista === "celular" ? "5544330001" : "5544330002";
    const adulto = vista === "celular" ? "Rosa" : "Laura";
    await ok(
      m.patch(`/api/clases-muestra/${claseAsistida.id}/registro`, {
        alumno: { nombre: nombreAlumno, fecha_nacimiento: "2018-03-02", sexo: vista === "celular" ? "femenino" : "masculino", escuela: "Escuela Nueva", turno_escolar: "matutino", talla_uniforme: "8" },
        tutores: [{ nombre: adulto, apellidos: "Prado", parentesco: "madre", telefono: telefonoPrado, es_responsable_pago: true, lo_lleva: true }],
        antecedentes: { practico_antes: false, motivo_clase: "disciplina" },
        observacion: { grupo_recomendado_id: grupoConversion.id, interes_percibido: "alto" },
      }),
      "registro de la maestra",
    );

    // Recorrido 4: la familia con dos hijos. La promoción de uniforme rige solo mientras se inscribe (se apaga al terminar).
    const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: `Uniforme de recorrido ${vista}`, codigo: `UNIFORME-REC-${n}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", acumulable: true, prioridad: 9 } });
    await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Uniforme" } });
    const telefono = vista === "celular" ? "5555060601" : "5555060602";
    const [h1, h2] = vista === "celular" ? ["Mateo", "Lucía"] : ["Diego", "Valeria"];
    const uno = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: h1, telefono: `+52${telefono}` });
    const dos = await sembrarAlumno(prisma, org, { docs, sucursalId: ids.norte, nombre: h2, conTutor: uno.tutorId });
    const apellido = vista === "celular" ? "Ríos" : "Soto";
    await prisma.tutor.update({ where: { id: uno.tutorId }, data: { apellidos: apellido } });
    await prisma.alumno.updateMany({ where: { id: { in: [uno.alumnoId, dos.alumnoId] } }, data: { apellidos: apellido, talla_uniforme: "12" } });
    for (const al of [uno, dos]) await ok(a.post("/api/inscripciones", { alumno_id: al.alumnoId, grupo_id: ids.grupoD }), "inscribir en el recorrido de pago");
    await prisma.promocion.update({ where: { id: promo.id }, data: { activo: false } });

    return {
      clase: claseDeLaMaestra,
      conversion: { leadId: f.leadId, prospectoId: f.prospectoId, nombre: `Familia Prado ${vista === "celular" ? "C" : "E"}`, claseId: claseAsistida.id, alumno: nombreAlumno, apellidos, adulto },
      pago: { tutorId: uno.tutorId, telefono, hijos: [{ alumnoId: uno.alumnoId, nombre: h1 }, { alumnoId: dos.alumnoId, nombre: h2 }], talla: "12" },
      telefonoLanding: vista === "celular" ? "5566770001" : "5566770002",
    };
  };
  const celular = await juego("celular", 1);
  const escritorio = await juego("escritorio", 2);
  return { maestra, grupoPase, alumnosDelPase, grupoConversion, rutaLanding: `/l/vertical-prueba`, numeroDelCanal, por: { celular, escritorio } };
}

const enmin = (ms: number): Date => new Date(Math.floor(ms / 60_000) * 60_000);
