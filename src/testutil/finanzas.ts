// Mundo de prueba de la etapa H (finanzas): una organización con dos sucursales, un reglamento aceptado, un cliente HTTP por rol y un reloj que el test mueve.
// A diferencia de `mundoDeOperacion`, aquí se inscribe por el servicio REAL (la API): es ella la que genera los cargos (H1), así que las pruebas de
// pagos, cobranza y cuadratura parten de cargos de verdad. Los nombres y los importes los pone el test (nada de verticales reales).

import { randomUUID } from "node:crypto";
import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "./api.ts";
import type { PrismaPruebas } from "./prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarMotivoBaja, sembrarOrganizacion, sembrarPrograma, type AlumnoSembrado, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "./semilla.ts";
import type { ApiDepsEntrada } from "../api/index.ts";

export interface CargoDeApi {
  id: string;
  tutor_id: string;
  alumno: { id: string; nombre: string };
  inscripcion_id: string | null;
  sucursal_id: string;
  concepto: string;
  periodo: string | null;
  monto: string;
  descuento: string;
  monto_final: string;
  monto_pagado: string;
  saldo: string;
  fecha_vencimiento: string;
  estatus: string;
  estatus_efectivo: string;
  dias_de_atraso: number;
}

export interface InscripcionDeApi {
  id: string;
  alumno_id: string;
  grupo_id: string;
  estatus: string;
  dia_corte_pago: number;
}

export interface MundoDeFinanzas {
  prisma: PrismaPruebas;
  org: OrganizacionDePrueba;
  db: BaseDatos;
  api: ApiLevantada;
  /** «Ahora» de la aplicación: se asigna para mover el reloj. */
  reloj: { ahora: Date };
  docs: DocumentosLegalesSembrados;
  admin: ClienteApi;
  asesorNorte: ClienteApi;
  asesorSur: ClienteApi;
  recepcion: ClienteApi;
  maestro: ClienteApi;
  adminId: string;
  recepcionId: string;
  norte: string;
  sur: string;
  motivoBaja: string;
  /** Un programa con un grupo y precio vigente (importes como texto). */
  programa(o?: { sucursalId?: string; cupo?: number; inscripcion?: string; mensualidad?: string }): Promise<{ programaId: string; grupoId: string }>;
  /** Un alumno que puede inscribirse (tutor responsable de pago y reglamento aceptado). `conTutor` arma hermanos. */
  alumno(o?: { sucursalId?: string; conTutor?: string; nacimiento?: string }): Promise<AlumnoSembrado>;
  /** Inscribe por la API (la que genera los cargos). Devuelve la inscripción y sus cargos tal como quedaron. */
  inscribir(o?: { grupoId?: string; alumno?: AlumnoSembrado; sucursalId?: string; fechaInicio?: string; diaCorte?: number; mesesAdelantados?: number; conTutor?: string }): Promise<{ inscripcionId: string; alumnoId: string; tutorId: string; grupoId: string; cargos: CargoDeApi[] }>;
  cargosDe(inscripcionId: string): Promise<CargoDeApi[]>;
  cerrar(): Promise<void>;
}

/** 10:00 en la Ciudad de México (UTC−6 en noviembre). */
export const AHORA_DE_FINANZAS = new Date("2026-11-10T16:00:00Z");

export async function mundoDeFinanzas(prisma: PrismaPruebas, nombre = "Finanzas", ahora = AHORA_DE_FINANZAS, api?: Partial<ApiDepsEntrada>): Promise<MundoDeFinanzas> {
  const org = await sembrarOrganizacion(prisma, nombre);
  await sembrarEmbudo(prisma, org);
  const docs = await sembrarDocumentosLegales(prisma, org);
  const reloj = { ahora };
  const servidor = levantarApi(prisma, { reloj: () => reloj.ahora, sesion: { duracionMs: 400 * 86_400_000, inactividadMs: 400 * 86_400_000 }, ...api });
  const norte = org.sucursales[0]!.id;
  const sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = servidor.cliente();
    const r = await c.login(org.slug, u.correo, u.contrasena);
    if (r.estado !== 201) throw new Error(`No se pudo iniciar sesión (${r.estado})`);
    return { c, id: u.id };
  };
  const admin = await entrar("administrador");
  const asesorNorte = await entrar("asesor", [norte]);
  const asesorSur = await entrar("asesor", [sur]);
  const recepcion = await entrar("recepcion", [norte]);
  const maestro = await entrar("maestro");
  const motivoBaja = await sembrarMotivoBaja(prisma, org);
  let n = 0;

  const mundo: MundoDeFinanzas = {
    prisma,
    org,
    db: conAlcance(prisma, org.organizacionId),
    api: servidor,
    reloj,
    docs,
    admin: admin.c,
    asesorNorte: asesorNorte.c,
    asesorSur: asesorSur.c,
    recepcion: recepcion.c,
    maestro: maestro.c,
    adminId: admin.id,
    recepcionId: recepcion.id,
    norte,
    sur,
    motivoBaja,
    async programa(o = {}) {
      n++;
      const p = await sembrarPrograma(prisma, org, {
        sucursalId: o.sucursalId ?? norte,
        nombre: `Programa ${n}`,
        edadMin: 3,
        edadMax: 14,
        grupos: [{ nombre: `Grupo ${n}`, cupoMaximo: o.cupo ?? 200, horarios: [[n % 7, 480 + (n % 5) * 60, 530 + (n % 5) * 60]] }],
        precio: { inscripcion: o.inscripcion ?? "500.00", mensualidad: o.mensualidad ?? "1000.00", desde: "2020-01-01" },
      });
      return { programaId: p.id, grupoId: p.grupos[0]!.id };
    },
    alumno(o = {}) {
      return sembrarAlumno(prisma, org, { docs, ...(o.sucursalId ? { sucursalId: o.sucursalId } : {}), ...(o.conTutor ? { conTutor: o.conTutor } : {}), ...(o.nacimiento ? { nacimiento: o.nacimiento } : {}), nombre: `Alumno${randomUUID().slice(0, 6)}` });
    },
    async inscribir(o = {}) {
      const grupoId = o.grupoId ?? (await mundo.programa({ ...(o.sucursalId ? { sucursalId: o.sucursalId } : {}) })).grupoId;
      const alumno = o.alumno ?? (await mundo.alumno({ ...(o.sucursalId ? { sucursalId: o.sucursalId } : {}), ...(o.conTutor ? { conTutor: o.conTutor } : {}) }));
      const r = await mundo.admin.post<InscripcionDeApi & { error?: unknown }>("/api/inscripciones", {
        alumno_id: alumno.alumnoId,
        grupo_id: grupoId,
        ...(o.fechaInicio ? { fecha_inicio: o.fechaInicio } : {}),
        ...(o.diaCorte ? { dia_corte_pago: o.diaCorte } : {}),
        ...(o.mesesAdelantados ? { meses_pagados_por_adelantado: o.mesesAdelantados } : {}),
      });
      if (r.estado !== 201) throw new Error(`No se pudo inscribir (${r.estado}): ${JSON.stringify(r.cuerpo)}`);
      return { inscripcionId: r.cuerpo.id, alumnoId: alumno.alumnoId, tutorId: alumno.tutorId, grupoId, cargos: await mundo.cargosDe(r.cuerpo.id) };
    },
    async cargosDe(inscripcionId) {
      const r = await mundo.admin.get<{ datos: CargoDeApi[] }>(`/api/cargos?inscripcion_id=${inscripcionId}&limite=100`);
      if (r.estado !== 200) throw new Error(`No se pudieron leer los cargos (${r.estado})`);
      return r.cuerpo.datos;
    },
    cerrar: () => servidor.cerrar(),
  };
  return mundo;
}
