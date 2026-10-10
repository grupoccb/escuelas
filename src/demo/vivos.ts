// Demo viva (V12): lo que `demo:datos` (la historia de seis meses) no deja a la vista el primer día. Lo hace con los MISMOS servicios del sistema, nunca con inserts a ciegas:
//
//   · asesor:     leads nuevos y uno contactado en SU sucursal, y una clase muestra ya asistida lista para convertir;
//   · maestro:    clases muestra de HOY en sus grupos (o, si hoy ninguno da clase, del primer día con clase), con la hora relativa a «ahora», no fija;
//   · recepción:  una familia recién inscrita con la primera mensualidad y un uniforme por cobrar (la inscripción puede salir gratis por la promoción vigente).
//
// DETERMINISTA: nombres, teléfonos y orden son constantes; lo único que depende del momento es el calendario (qué día toca clase y las fechas de los cargos).
// IDEMPOTENTE: sus teléfonos están en el bloque `+52 55 9901 NNNN`. Si la organización ya tiene alguno, no hace nada.
// No nombra ninguna disciplina ni sucursal (invariante 2): todo sale de las tablas.

import { FAMILIA_CON_COBRO, MARCA_DE_DEMO_VIVA } from "./constantes.ts";
import { sesionesDelDia } from "../asistencia/pase.ts";
import { InscripcionesActivas } from "../catalogo/cupo.ts";
import { sumarDias, type FechaISO } from "../catalogo/precios.ts";
import { agendarClaseMuestra, lugaresDeSesion } from "../clases-muestra/agenda.ts";
import { marcarAsistencia } from "../clases-muestra/asistencia.ts";
import { cargarLanding, registrarEnvioDeLanding } from "../captacion/landing.ts";
import { convertirLead } from "../conversion/convertir.ts";
import { conAlcance } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { barrerFinanzas } from "../finanzas/barrido.ts";
import { venderProducto } from "../finanzas/productos.ts";
import { moverLeadAEtapa } from "../embudo/etapas.ts";
import { darDeBaja } from "../inscripciones/cambios.ts";
import { registrarAceptacion } from "../legal/aceptaciones.ts";
import { documentoVigente } from "../legal/documentos.ts";
import { fechaLocal } from "../lib/horario.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { cifradorDesdeEntorno } from "../sensibles/cifrado.ts";

export { FAMILIA_CON_COBRO, MARCA_DE_DEMO_VIVA };
export const telefonoDeDemoViva = (n: number): string => {
  const t = normalizarTelefono(`55 9901 ${String(n).padStart(4, "0")}`);
  if (t === null || !t.startsWith(MARCA_DE_DEMO_VIVA)) throw new Error(`Teléfono de demo viva inválido: ${n}`);
  return t;
};

const NUEVOS = [
  { alumno: "Dante", tutor: "Karla", apellidos: "Olvera Peña" },
  { alumno: "Alma", tutor: "Rubén", apellidos: "Quiroz Salas" },
  { alumno: "Ian", tutor: "Beatriz", apellidos: "Montes Aguirre" },
  { alumno: "Romina", tutor: "Gerardo", apellidos: "Ibarra Soto" },
] as const;
const DE_HOY = [
  { alumno: "Matías", tutor: "Lorena", apellidos: "Rangel Cuevas" },
  { alumno: "Elena", tutor: "Samuel", apellidos: "Zepeda Moya" },
  { alumno: "Joaquín", tutor: "Daniela", apellidos: "Barrios Leal" },
] as const;
const ASISTIDA = { alumno: "Camilo", tutor: "Perla", apellidos: "Nájera Robles" } as const;

export interface OpcionesDeDemoViva {
  organizacionId: string;
  /** El «ahora» del que cuelgan las fechas (por omisión el reloj real). */
  ahora?: Date;
  progreso?: (linea: string) => void;
}

export interface ResumenDeDemoViva {
  yaExistia: boolean;
  leadsNuevos: number;
  leadsContactados: number;
  /** Las clases muestra que el maestro ve: su hora de pared local y si son de hoy. */
  clasesDelMaestro: { hora: string; grupo: string; esHoy: boolean; fecha: FechaISO }[];
  claseAsistida: boolean;
  /** Alumnos de la historia dados de baja para dejar lugar a lo de hoy (una escuela llena no tiene dónde agendar). */
  bajasParaLugar: number;
  familiaConCobro: { tutorId: string; cargosPendientes: number } | null;
}

interface GrupoViv {
  id: string;
  nombre: string;
  cupo: number;
  instructorId: string | null;
  verticalId: string;
  verticalSlug: string;
  sucursalId: string;
  zona: string;
  programa: string;
  edadMin: number;
  edadMax: number;
  fechaCorte: FechaISO | null;
  horarios: { dia_semana: number; hora_inicio_min: number }[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const HORA = 3_600_000;

export async function sembrarDemoViva(prisma: PrismaRaiz, o: OpcionesDeDemoViva): Promise<ResumenDeDemoViva> {
  const db = conAlcance(prisma, o.organizacionId);
  const ahora = o.ahora ?? new Date();
  const avisar = o.progreso ?? (() => {});
  const vacio: ResumenDeDemoViva = { yaExistia: false, leadsNuevos: 0, leadsContactados: 0, clasesDelMaestro: [], claseAsistida: false, bajasParaLugar: 0, familiaConCobro: null };

  if ((await db.lead.count({ where: { telefono: { startsWith: MARCA_DE_DEMO_VIVA } } })) > 0) {
    // El último paso es la familia con cobro: si no está, una corrida anterior se interrumpió a medias (como en `demo:datos`, no se completa sin duplicar).
    if ((await db.tutor.count({ where: { telefono: normalizarTelefono(FAMILIA_CON_COBRO.telefonoNacional)! } })) === 0) {
      throw new Error("Hay demo viva a medias (una corrida anterior se interrumpió): no se puede completar sin duplicar. Recrea la base de la demo y vuelve a correr el comando");
    }
    return { ...vacio, yaExistia: true, leadsNuevos: await db.lead.count({ where: { telefono: { startsWith: MARCA_DE_DEMO_VIVA } } }) };
  }

  const organizacion = await db.organizacion.findFirst({ where: { id: o.organizacionId }, select: { slug: true } });
  const admin = await db.usuario.findFirst({ where: { rol: "administrador", activo: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }], select: { id: true } });
  if (!admin) throw new Error("La organización no tiene un administrador activo: la demo viva necesita a quién atribuir lo que hace");
  const asesor = await db.usuario.findFirst({ where: { rol: "asesor", activo: true }, orderBy: [{ correo: "asc" }], select: { id: true } });
  const maestro = await db.usuario.findFirst({ where: { rol: "maestro", activo: true, instructores: { some: {} } }, orderBy: [{ correo: "asc" }], select: { id: true } });
  const instructor = maestro ? await db.instructor.findFirst({ where: { usuario_id: maestro.id }, select: { id: true } }) : null;
  const sucursalesDelAsesor = asesor ? (await db.usuario_sucursal.findMany({ where: { usuario_id: asesor.id }, select: { sucursal_id: true } })).map((s) => s.sucursal_id) : [];

  const filas = await db.grupo.findMany({
    where: { activo: true, programa: { activo: true } },
    select: { id: true, nombre: true, cupo_maximo: true, instructor_id: true, horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true } }, programa: { select: { nombre: true, edad_min: true, edad_max: true, fecha_corte_edad: true, vertical: { select: { id: true, slug: true, nombre: true } }, sucursal: { select: { id: true, nombre: true, zona_horaria: true } } } } },
  });
  const grupos: GrupoViv[] = filas
    .filter((g) => g.horarios.length > 0)
    .sort((a, b) => cmp(a.programa.vertical.nombre, b.programa.vertical.nombre) || cmp(a.programa.sucursal.nombre, b.programa.sucursal.nombre) || cmp(a.programa.nombre, b.programa.nombre) || cmp(a.nombre, b.nombre))
    .map((g) => ({ id: g.id, nombre: g.nombre, cupo: g.cupo_maximo, instructorId: g.instructor_id, verticalId: g.programa.vertical.id, verticalSlug: g.programa.vertical.slug, sucursalId: g.programa.sucursal.id, zona: g.programa.sucursal.zona_horaria, programa: g.programa.nombre, edadMin: g.programa.edad_min, edadMax: g.programa.edad_max, fechaCorte: g.programa.fecha_corte_edad ? (g.programa.fecha_corte_edad.toISOString().slice(0, 10) as FechaISO) : null, horarios: g.horarios }));
  if (grupos.length === 0) throw new Error("No hay grupos con horario: carga el catálogo antes de sembrar la demo viva");

  const fuente = new InscripcionesActivas();
  const cifrador = cifradorDesdeEntorno(process.env["CLAVE_DATOS_SENSIBLES"] ? process.env : { ...process.env, NODE_ENV: "development" });
  const ctxApi = (cuando: Date) => ({ usuario: { id: admin.id, rol: "administrador" as const, organizacionId: o.organizacionId, nombre: "Demo", correo: "demo@demo.test", activo: true } as never, organizacionId: o.organizacionId, ahora: () => cuando });
  let consecutivo = 0;
  const resumen: ResumenDeDemoViva = { ...vacio };

  /** Un lead con un niño, por el mismo camino que la landing (con su aviso de privacidad). */
  const nuevoLead = async (g: GrupoViv, p: { alumno: string; tutor: string; apellidos: string }, cuando: Date): Promise<{ leadId: string; prospectoId: string; edad: number }> => {
    const landing = await cargarLanding(prisma, g.verticalSlug, organizacion?.slug ?? null, cuando);
    if (!landing || !landing.aviso) throw new Error(`La vertical «${g.verticalSlug}» no tiene landing publicable (falta el aviso de privacidad vigente)`);
    const edad = Math.min(g.edadMax, g.edadMin + 1);
    const res = await registrarEnvioDeLanding(
      prisma,
      landing,
      { nombreAlumno: p.alumno, edad, sucursalId: g.sucursalId, telefono: telefonoDeDemoViva(++consecutivo), nombreContacto: `${p.tutor} ${p.apellidos.split(" ")[0]}`, documentoId: landing.aviso.id, version: landing.aviso.version },
      { codigo: null, utm: {}, sucursalId: null } as never,
      { ip: null, agenteUsuario: "demo" },
      cuando,
    );
    if (!res.ok) throw new Error(`No se pudo registrar el lead de ${p.alumno}: ${res.motivo}`);
    return { leadId: res.leadId, prospectoId: res.prospectoId, edad };
  };
  const motivoDeBaja = await db.motivo_baja.findFirst({ where: { activo: true }, orderBy: [{ codigo: "asc" }], select: { id: true } });
  /**
   * La historia llena los grupos (300 alumnos caben justo en el catálogo). Para que haya un lugar en lo que se muestra hoy, si el grupo no tiene, se da de baja —por el servicio real,
   * con un motivo del catálogo— a los últimos alumnos que inscribió la historia. Es una baja más entre las de ejemplo; la cuadratura sigue en verde.
   */
  const asegurarLugar = async (g: GrupoViv, sesion: Date): Promise<void> => {
    for (let intento = 0; intento < 3; intento++) {
      const { lugares } = await db.$transaction((tx) => lugaresDeSesion(tx, fuente, { id: g.id, cupo_maximo: g.cupo }, sesion));
      if (lugares > 0) return;
      const ultima = await db.inscripcion.findFirst({ where: { grupo_id: g.id, estatus: "activa" }, orderBy: [{ creado_en: "desc" }, { id: "desc" }], select: { id: true } });
      if (!ultima || !motivoDeBaja) throw new Error(`El grupo «${g.nombre}» está lleno y no se pudo dejar lugar`);
      const r = await db.$transaction((tx) => darDeBaja(tx, { ahora, usuarioId: admin.id }, { inscripcionId: ultima.id, motivoBajaId: motivoDeBaja.id }));
      if (!r.ok) throw new Error(`No se pudo dar de baja para dejar lugar en «${g.nombre}»`);
      resumen.bajasParaLugar++;
    }
  };
  const agendar = async (prospectoId: string, g: GrupoViv, sesion: Date): Promise<string> => {
    await asegurarLugar(g, sesion);
    // Se agenda "desde" un día antes de la sesión: la regla de anticipación (que protege a las familias de reservar a última hora) no aplica a una demo que muestra la clase de hoy.
    const desde = new Date(sesion.getTime() - 26 * HORA);
    const r = await db.$transaction((tx) => agendarClaseMuestra(tx, { ahora: desde, fuente, origen: { tipo: "usuario", usuarioId: admin.id } }, { prospectoId, grupoId: g.id, fechaHora: sesion }));
    if (!r.ok) throw new Error(`No se pudo agendar la clase muestra (${r.motivo})`);
    return r.clase.id;
  };

  // Los grupos para el asesor: los de sus sucursales (o todos si no tiene), repartidos entre verticales.
  const delAsesor = grupos.filter((g) => sucursalesDelAsesor.length === 0 || sucursalesDelAsesor.includes(g.sucursalId));
  const reparto = (k: number): GrupoViv => {
    const verticales = [...new Set(delAsesor.map((g) => g.verticalId))];
    const v = verticales[k % verticales.length]!;
    const deLaVertical = delAsesor.filter((g) => g.verticalId === v);
    const vuelta = (k - (k % verticales.length)) / verticales.length;
    return deLaVertical[vuelta % deLaVertical.length]!;
  };

  // ── Asesor: leads nuevos y uno contactado ──
  for (let k = 0; k < NUEVOS.length; k++) {
    const l = await nuevoLead(reparto(k), NUEVOS[k]!, new Date(ahora.getTime() - (k + 1) * 3 * HORA));
    resumen.leadsNuevos++;
    if (k === NUEVOS.length - 1) {
      await db.$transaction((tx) => moverLeadAEtapa(tx, l.leadId, "contactado", { motivo: "demo_viva", ahora }));
      resumen.leadsNuevos--;
      resumen.leadsContactados++;
    }
  }
  avisar(`Asesor: ${resumen.leadsNuevos} leads nuevos y ${resumen.leadsContactados} contactado.`);

  // ── Maestro: clases muestra de HOY (o del primer día con clase) ──
  const delMaestro = instructor ? grupos.filter((g) => g.instructorId === instructor.id) : [];
  if (delMaestro.length > 0) {
    const zona = delMaestro[0]!.zona;
    const hoy = fechaLocal(ahora, zona);
    let dia: FechaISO = hoy;
    let sesiones: { g: GrupoViv; inicio: Date }[] = [];
    for (let k = 0; k < 14 && sesiones.length === 0; k++) {
      dia = sumarDias(hoy, k);
      sesiones = delMaestro.flatMap((g) => sesionesDelDia(dia, g.horarios, g.zona).map((inicio) => ({ g, inicio }))).sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || cmp(a.g.id, b.g.id));
    }
    // Una por sesión, a lo más tres, sin repetir grupo si hay otros.
    const elegidas: typeof sesiones = [];
    for (const s of sesiones) if (!elegidas.some((e) => e.g.id === s.g.id) && elegidas.length < DE_HOY.length) elegidas.push(s);
    for (const s of sesiones) if (elegidas.length < DE_HOY.length && !elegidas.includes(s)) elegidas.push(s);
    for (let k = 0; k < elegidas.length; k++) {
      const { g, inicio } = elegidas[k]!;
      const l = await nuevoLead(g, DE_HOY[k]!, new Date(ahora.getTime() - (k + 6) * HORA));
      await agendar(l.prospectoId, g, inicio);
      const p = new Intl.DateTimeFormat("es-MX", { timeZone: g.zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(inicio);
      resumen.clasesDelMaestro.push({ hora: p, grupo: g.nombre, esHoy: dia === hoy, fecha: dia });
    }
    avisar(`Maestro: ${resumen.clasesDelMaestro.length} clases muestra ${dia === hoy ? "de hoy" : `del ${dia} (hoy ningún grupo suyo da clase)`}.`);
  } else {
    avisar("Maestro: ningún grupo con maestro asignado; no se agendan clases muestra.");
  }

  // ── Asesor: una clase muestra ya asistida, lista para convertir ──
  const gAsistida = reparto(0);
  const pasada = ultimaSesionPasada(gAsistida, ahora);
  if (pasada) {
    const l = await nuevoLead(gAsistida, ASISTIDA, new Date(pasada.getTime() - 30 * HORA));
    const claseId = await agendar(l.prospectoId, gAsistida, pasada);
    const r = await db.$transaction((tx) => marcarAsistencia(tx, { claseId, estatus: "asistio", usuarioId: admin.id, ahora: new Date(pasada.getTime() + 2 * HORA) }));
    resumen.claseAsistida = r.ok;
    avisar("Asesor: una clase muestra asistida (etapa «clase muestra asistida») lista para convertir.");
  }

  // ── Recepción: una familia inscrita hoy, con la primera mensualidad y un uniforme por cobrar ──
  const gCobro = [...delAsesor, ...grupos].find((g) => g.cupo > 0);
  if (gCobro) {
    const pasadaCobro = ultimaSesionPasada(gCobro, ahora);
    const l = await nuevoLead(gCobro, { alumno: "Santino", tutor: FAMILIA_CON_COBRO.tutor, apellidos: FAMILIA_CON_COBRO.apellidos }, new Date(ahora.getTime() - 3 * 24 * HORA));
    // El teléfono de esta familia es el que el resumen anuncia a recepción.
    await db.lead.updateMany({ where: { id: l.leadId }, data: { telefono: normalizarTelefono(FAMILIA_CON_COBRO.telefonoNacional)! } });
    if (pasadaCobro) {
      const claseId = await agendar(l.prospectoId, gCobro, pasadaCobro);
      await db.$transaction((tx) => marcarAsistencia(tx, { claseId, estatus: "asistio", usuarioId: admin.id, ahora: new Date(pasadaCobro.getTime() + 2 * HORA) }));
    }
    await asegurarLugar(gCobro, pasadaCobro ?? ahora);
    const doc = await documentoVigente(db, "reglamento", gCobro.verticalId, ahora);
    if (!doc) throw new Error("No hay un reglamento vigente: carga los documentos legales antes de sembrar la demo viva");
    const a = await registrarAceptacion(db, o.organizacionId, { prospectoId: l.prospectoId, documentoId: doc.id, version: doc.version, resultado: "aceptada", aceptante: { nombre: `${FAMILIA_CON_COBRO.tutor} ${FAMILIA_CON_COBRO.apellidos}`, parentesco: "madre" }, canal: "presencial", usuarioId: admin.id, evidencia: { origen: "demo" }, ahora });
    if (!a.ok) throw new Error(`No se pudo registrar el reglamento (${a.motivo})`);
    const referencia = gCobro.fechaCorte ?? fechaLocal(ahora, gCobro.zona);
    const nacimiento = sumarDias(referencia, -(l.edad * 365 + (l.edad >> 2) + 120)).slice(0, 10);
    const res = await convertirLead(
      db,
      ctxApi(ahora),
      l.leadId,
      { tutor: { parentesco: "madre", nombre: FAMILIA_CON_COBRO.tutor, apellidos: FAMILIA_CON_COBRO.apellidos }, prospectos: [{ prospectoId: l.prospectoId, alumno: { nombre: "Santino", apellidos: FAMILIA_CON_COBRO.apellidos, fecha_nacimiento: nacimiento, sexo: "masculino", escuela_nombre: "Escuela primaria", talla_uniforme: "M" }, inscripcion: { grupoId: gCobro.id, diaCortePago: 10 } }] } as never,
      { cifrador },
    );
    if (!res.ok) throw new Error(`No se pudo convertir a la familia con cobro pendiente (${res.motivo})`);
    // Un uniforme vendido en el mostrador: un cargo más por cobrar, para ver el reparto de un pago entre varios cargos.
    const inscripcionId = res.resultado.alumnos[0]?.inscripcion?.id;
    const alumnoDe = inscripcionId ? await db.inscripcion.findFirst({ where: { id: inscripcionId }, select: { alumno_id: true } }) : null;
    const producto = await db.producto.findFirst({ where: { vertical_id: gCobro.verticalId, activo: true, stock: { gt: 0 } }, orderBy: [{ nombre: "asc" }, { talla: "asc" }, { precio: "asc" }, { id: "asc" }], select: { id: true } });
    if (alumnoDe && producto) await db.$transaction((tx) => venderProducto(tx, { ahora, usuarioId: admin.id }, { alumnoId: alumnoDe.alumno_id, productoId: producto.id, cantidad: 1 }));
    // El barrido de finanzas (el que corre solo cada 10 minutos) genera la primera mensualidad: se corre aquí para que recepción la vea desde el primer momento.
    await barrerFinanzas({ prisma, reloj: () => ahora, organizacionId: o.organizacionId });
    const tutorId = res.resultado.tutorId;
    if (tutorId) {
      const cargosPendientes = await db.cargo.count({ where: { tutor_id: tutorId, estatus: { in: ["pendiente", "vencido"] } } });
      resumen.familiaConCobro = { tutorId, cargosPendientes };
    }
    avisar(`Recepción: ${FAMILIA_CON_COBRO.tutor} ${FAMILIA_CON_COBRO.apellidos} (${FAMILIA_CON_COBRO.telefonoNacional}) recién inscrita, con ${resumen.familiaConCobro?.cargosPendientes ?? 0} cargos por cobrar.`);
  }

  // La historia deja avisos de clases de hace meses sin marcar como vistos: el maestro abriría «Hoy» y encontraría decenas de avisos viejos. Los de clases de hace más de un día se dan por vistos.
  await db.aviso_maestro.updateMany({ where: { leido_en: null, clase_muestra: { fecha_hora: { lt: new Date(ahora.getTime() - 24 * HORA) } } }, data: { leido_en: ahora } });
  return resumen;
}

/** La sesión más reciente del grupo que ya terminó (hasta 3 semanas atrás), o null. */
function ultimaSesionPasada(g: GrupoViv, ahora: Date): Date | null {
  const hoy = fechaLocal(ahora, g.zona);
  for (let k = 0; k <= 21; k++) {
    const sesiones = sesionesDelDia(sumarDias(hoy, -k), g.horarios, g.zona).filter((s) => s.getTime() + 3 * HORA < ahora.getTime());
    if (sesiones.length > 0) return sesiones[sesiones.length - 1]!;
  }
  return null;
}
