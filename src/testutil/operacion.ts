// Mundo de prueba de la etapa G (operación): una organización con dos sucursales, grupos que sesionan lunes y miércoles (16:00 locales) o martes y jueves, un
// maestro por grupo, usuarios de cada rol con su cliente HTTP y un reloj que el test mueve. Las inscripciones se crean directo (la regla de inscribir ya
// tiene sus propias pruebas en F3): aquí importa lo que pasa DESPUÉS de inscribir.

import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "./api.ts";
import type { PrismaPruebas } from "./prisma-pruebas.ts";
import { sembrarAlumno, sembrarMotivoBaja, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "./semilla.ts";

export interface MundoDeOperacion {
  prisma: PrismaPruebas;
  org: OrganizacionDePrueba;
  db: BaseDatos;
  api: ApiLevantada;
  /** El instante «ahora» de la aplicación: se asigna para mover el reloj. */
  reloj: { ahora: Date };
  admin: ClienteApi;
  asesorNorte: ClienteApi;
  asesorSur: ClienteApi;
  recepcion: ClienteApi;
  maestroA: ClienteApi;
  maestroB: ClienteApi;
  usuarioMaestroA: string;
  norte: string;
  sur: string;
  /** Norte, lunes y miércoles 16:00–17:00, maestro A. */
  grupoA: string;
  /** Norte, martes y jueves 16:00–17:00, maestro B. */
  grupoB: string;
  /** Sur, lunes y miércoles 16:00–17:00, sin maestro. */
  grupoSur: string;
  programaNorteId: string;
  inscribir(grupoId: string, o?: { estatus?: "activa" | "congelada" | "baja"; fechaInicio?: string; nombre?: string; programaId?: string; sucursalId?: string }): Promise<{ inscripcionId: string; alumnoId: string; leadId: string; tutorId: string }>;
  cerrar(): Promise<void>;
}

let consecutivo = 0;

export async function mundoDeOperacion(prisma: PrismaPruebas, nombre = "Operación", ahora = new Date("2026-11-18T18:00:00Z")): Promise<MundoDeOperacion> {
  const org = await sembrarOrganizacion(prisma, nombre);
  const reloj = { ahora };
  // Sesiones largas: las pruebas mueven el reloj horas adelante y no deben expirar por inactividad.
  const api = levantarApi(prisma, { reloj: () => reloj.ahora, sesion: { duracionMs: 48 * 3_600_000, inactividadMs: 48 * 3_600_000 } });
  const norte = org.sucursales[0]!.id;
  const sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    const r = await c.login(org.slug, u.correo, u.contrasena);
    if (r.estado !== 201) throw new Error(`No se pudo iniciar sesión (${r.estado})`);
    return { c, id: u.id };
  };
  const admin = await entrar("administrador");
  const asesorNorte = await entrar("asesor", [norte]);
  const asesorSur = await entrar("asesor", [sur]);
  const recepcion = await entrar("recepcion", [norte]);
  const mA = await entrar("maestro");
  const mB = await entrar("maestro");
  const iA = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: mA.id, nombre: "Maestro A" } });
  const iB = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: mB.id, nombre: "Maestro B" } });
  const pn = await sembrarPrograma(prisma, org, {
    sucursalId: norte,
    nombre: "Programa norte",
    edadMin: 3,
    edadMax: 14,
    grupos: [
      { nombre: "Norte A", cupoMaximo: 40, horarios: [[1, 960, 1020], [3, 960, 1020]] },
      { nombre: "Norte B", cupoMaximo: 40, horarios: [[2, 960, 1020], [4, 960, 1020]] },
    ],
  });
  const ps = await sembrarPrograma(prisma, org, { sucursalId: sur, nombre: "Programa sur", edadMin: 3, edadMax: 14, grupos: [{ nombre: "Sur A", cupoMaximo: 40, horarios: [[1, 960, 1020], [3, 960, 1020]] }] });
  const grupoA = pn.grupos[0]!.id;
  const grupoB = pn.grupos[1]!.id;
  const grupoSur = ps.grupos[0]!.id;
  await prisma.grupo.update({ where: { id: grupoA }, data: { instructor_id: iA.id } });
  await prisma.grupo.update({ where: { id: grupoB }, data: { instructor_id: iB.id } });
  /** El programa y la sucursal de cualquier grupo (también de los que el test crea después). */
  const datosDelGrupo = async (grupoId: string) => {
    const g = await prisma.grupo.findUniqueOrThrow({ where: { id: grupoId }, select: { programa_id: true, programa: { select: { sucursal_id: true } } } });
    return { programaId: g.programa_id, sucursalId: g.programa.sucursal_id };
  };

  return {
    prisma,
    org,
    db: conAlcance(prisma, org.organizacionId),
    api,
    reloj,
    admin: admin.c,
    asesorNorte: asesorNorte.c,
    asesorSur: asesorSur.c,
    recepcion: recepcion.c,
    maestroA: mA.c,
    maestroB: mB.c,
    usuarioMaestroA: mA.id,
    norte,
    sur,
    grupoA,
    grupoB,
    grupoSur,
    programaNorteId: pn.id,
    async inscribir(grupoId, o = {}) {
      const n = ++consecutivo;
      const g = await datosDelGrupo(grupoId);
      const a = await sembrarAlumno(prisma, org, { nombre: o.nombre ?? `Alumno${n}`, sucursalId: o.sucursalId ?? g.sucursalId });
      const estatus = o.estatus ?? "activa";
      const inicio = new Date(`${o.fechaInicio ?? "2026-09-01"}T00:00:00.000Z`);
      const i = await prisma.inscripcion.create({
        data: {
          organizacion_id: org.organizacionId,
          alumno_id: a.alumnoId,
          programa_id: o.programaId ?? g.programaId,
          grupo_id: grupoId,
          lead_id: a.leadId,
          fecha_inscripcion: inicio,
          fecha_inicio: inicio,
          estatus,
          precio_inscripcion_aplicado: "100.00",
          precio_mensualidad_aplicado: "200.00",
          dia_corte_pago: 5,
          ...(estatus === "baja" ? { motivo_baja_id: await sembrarMotivoBaja(prisma, org), fecha_baja: new Date("2026-10-21T00:00:00.000Z") } : {}),
          ...(estatus === "congelada" ? { congelada_desde: new Date("2026-10-21T00:00:00.000Z") } : {}),
        },
      });
      return { inscripcionId: i.id, alumnoId: a.alumnoId, leadId: a.leadId, tutorId: a.tutorId };
    },
    cerrar: () => api.cerrar(),
  };
}
