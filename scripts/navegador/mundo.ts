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

export async function sembrarMundo(prisma: PrismaPruebas, _nuevoCliente: () => ClienteApi, base: string): Promise<Mundo> {
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

  const asesorDelMundo = await sembrarAsesor(prisma, org, etapas, { norte: norte.id, sur: sur.id });

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
