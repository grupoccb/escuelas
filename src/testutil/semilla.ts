// Organización de prueba con una vertical, dos sucursales y una bandeja de Chatwoot. Usa el
// cliente sin scope porque las organizaciones no se crean desde el scope (invariante 1). Los
// ids de Chatwoot son aleatorios para que las corridas no choquen entre sí.

import { createHash, randomInt, randomUUID } from "node:crypto";
import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import type { PrismaPruebas } from "./prisma-pruebas.ts";

export interface OrganizacionDePrueba {
  organizacionId: string;
  /** Identificador de login de la organización (único por corrida). */
  slug: string;
  verticalId: string;
  sucursales: { id: string; nombre: string }[];
  canalId: string;
  bandejaId: string;
  /** Primera etapa del embudo: donde nace todo lead. */
  etapaInicialId: string;
  chatwootAccountId: number;
  chatwootInboxId: number;
}

export async function sembrarOrganizacion(prisma: PrismaPruebas, nombre = "Organización de prueba"): Promise<OrganizacionDePrueba> {
  const slug = `prueba-${randomUUID().slice(0, 12)}`;
  const organizacion = await prisma.organizacion.create({ data: { nombre: `${nombre} ${randomUUID().slice(0, 8)}`, slug } });
  const org = organizacion.id;
  const vertical = await prisma.vertical.create({
    data: { organizacion_id: org, nombre: "Vertical Prueba", slug: "vertical-prueba" },
  });
  const sucursales = [];
  for (const nombreSucursal of ["Norte", "Sur"]) {
    const s = await prisma.sucursal.create({
      data: { organizacion_id: org, nombre: nombreSucursal, zona_horaria: "America/Mexico_City" },
    });
    await prisma.sucursal_vertical.create({ data: { organizacion_id: org, sucursal_id: s.id, vertical_id: vertical.id } });
    sucursales.push({ id: s.id, nombre: s.nombre });
  }
  const etapa = await prisma.etapa_pipeline.create({ data: { organizacion_id: org, nombre: "Primera", orden: 1 } });
  const canal = await prisma.canal_whatsapp.create({
    data: { organizacion_id: org, vertical_id: vertical.id, nombre_publico: "Canal de prueba" },
  });
  const chatwootAccountId = randomInt(1_000_000, 2_000_000_000);
  const chatwootInboxId = randomInt(1_000_000, 2_000_000_000);
  const bandeja = await prisma.bandeja_chatwoot.create({
    data: {
      organizacion_id: org,
      canal_whatsapp_id: canal.id,
      nombre: "Vertical Prueba",
      chatwoot_account_id: chatwootAccountId,
      chatwoot_inbox_id: chatwootInboxId,
    },
  });
  return {
    organizacionId: org,
    slug,
    verticalId: vertical.id,
    sucursales,
    canalId: canal.id,
    bandejaId: bandeja.id,
    etapaInicialId: etapa.id,
    chatwootAccountId,
    chatwootInboxId,
  };
}

/** Crea o actualiza la fila de configuración de la organización (los tests la fijan a su medida). */
export async function fijarConfiguracion(
  prisma: PrismaPruebas,
  organizacionId: string,
  valores: { max_automaticos_por_dia?: number; max_marketing_por_ventana?: number; ventana_marketing_dias?: number; sucursal_sin_programa?: "ofrecer_otra" | "avisar_asesor"; cotizacion_vigencia_dias?: number; lista_espera_oferta_horas?: number; clase_muestra_anticipacion_min?: number; clase_muestra_horizonte_dias?: number; clase_muestra_correccion_horas?: number; modo_cierre?: "asesor_whatsapp" | "maestro_en_sitio"; umbral_faltas_consecutivas?: number; umbral_dias_deuda?: number; modulo_cotizador?: boolean; modulo_clase_muestra?: boolean; modulo_inscripcion?: boolean; modulo_operacion?: boolean; modulo_finanzas?: boolean; modulo_tableros?: boolean },
): Promise<void> {
  const viva = await prisma.configuracion_organizacion.findFirst({ where: { organizacion_id: organizacionId, eliminado_en: null } });
  if (viva) await prisma.configuracion_organizacion.update({ where: { id: viva.id }, data: valores });
  else await prisma.configuracion_organizacion.create({ data: { organizacion_id: organizacionId, ...valores } });
}

/**
 * Un mensaje ENTRANTE ya recibido en la conversación; devuelve su id. Las respuestas (`respuestaA`)
 * tienen que contestar al último entrante, así que los tests que mandan respuestas lo siembran antes.
 */
export async function sembrarEntrante(db: Consultas, conversacionId: string, cuerpo = "Hola"): Promise<string> {
  const m = await db.mensaje.create({
    data: altaConAlcance({
      conversacion_id: conversacionId,
      direccion: "entrante" as const,
      estatus: "recibido" as const,
      cuerpo,
      proveedor: "chatwoot",
      id_externo: `entrante-${randomUUID()}`,
    }),
    select: { id: true },
  });
  return m.id;
}

// ── Catálogo de prueba (C5 en adelante) ───────────────────────────────────────────────────────────────

export interface GrupoParaSembrar {
  nombre: string;
  cupoMaximo?: number;
  permiteListaEspera?: boolean;
  /** `[dia 0-6, inicio en minutos, fin en minutos]`. */
  horarios?: [number, number, number][];
  activo?: boolean;
}

export interface ProgramaParaSembrar {
  sucursalId: string;
  nombre: string;
  edadMin: number;
  edadMax: number;
  descripcionPublica?: string | null;
  permiteTraslape?: boolean;
  /** `AAAA-MM-DD`. */
  fechaCorteEdad?: string | null;
  activo?: boolean;
  grupos?: GrupoParaSembrar[];
  /** Precio vigente desde esa fecha (abierto). Importes como texto: `"500.00"`. */
  precio?: { inscripcion: string; mensualidad: string; desde?: string } | null;
}

export interface ProgramaSembrado {
  id: string;
  grupos: { id: string; nombre: string }[];
  precioId: string | null;
}

/** Crea un programa con sus grupos, horarios y precio. Nombres y valores los pone el test (nada de verticales reales). */
export async function sembrarPrograma(prisma: PrismaPruebas, org: OrganizacionDePrueba, p: ProgramaParaSembrar): Promise<ProgramaSembrado> {
  const programa = await prisma.programa.create({
    data: {
      organizacion_id: org.organizacionId,
      vertical_id: org.verticalId,
      sucursal_id: p.sucursalId,
      nombre: p.nombre,
      edad_min: p.edadMin,
      edad_max: p.edadMax,
      descripcion_publica: p.descripcionPublica ?? null,
      permite_traslape: p.permiteTraslape ?? false,
      fecha_corte_edad: p.fechaCorteEdad ? new Date(`${p.fechaCorteEdad}T00:00:00.000Z`) : null,
      activo: p.activo ?? true,
    },
  });
  const grupos: { id: string; nombre: string }[] = [];
  for (const g of p.grupos ?? []) {
    const grupo = await prisma.grupo.create({
      data: {
        organizacion_id: org.organizacionId,
        programa_id: programa.id,
        nombre: g.nombre,
        cupo_maximo: g.cupoMaximo ?? 10,
        permite_lista_espera: g.permiteListaEspera ?? false,
        activo: g.activo ?? true,
      },
    });
    for (const [dia, ini, fin] of g.horarios ?? []) {
      await prisma.grupo_horario.create({ data: { organizacion_id: org.organizacionId, grupo_id: grupo.id, dia_semana: dia, hora_inicio_min: ini, hora_fin_min: fin } });
    }
    grupos.push({ id: grupo.id, nombre: grupo.nombre });
  }
  let precioId: string | null = null;
  if (p.precio) {
    const precio = await prisma.precio.create({
      data: {
        organizacion_id: org.organizacionId,
        programa_id: programa.id,
        costo_inscripcion: p.precio.inscripcion,
        costo_mensualidad: p.precio.mensualidad,
        vigencia_desde: new Date(`${p.precio.desde ?? "2020-01-01"}T00:00:00.000Z`),
      },
    });
    precioId = precio.id;
  }
  return { id: programa.id, grupos, precioId };
}

/** Fuente de ocupación de prueba: lugares ocupados por grupo, que el test cambia a voluntad (F4 la sustituye por la real). */
export class OcupacionFija {
  readonly ocupados_ = new Map<string, number>();
  fijar(grupoId: string, ocupados: number): void {
    this.ocupados_.set(grupoId, ocupados);
  }
  async ocupados(_db: Consultas, grupoId: string): Promise<number> {
    return this.ocupados_.get(grupoId) ?? 0;
  }
}

// ── Embudo y familias (D1 en adelante) ────────────────────────────────────────────────────────────────────

export type TipoDeEtapa = "nuevo" | "contactado" | "muestra_agendada" | "muestra_asistida" | "negociacion" | "inscrito" | "perdido";

/**
 * El embudo de ejemplo con su `tipo_sistema` (el código nunca busca etapas por nombre): la etapa inicial que ya trae
 * `sembrarOrganizacion` pasa a ser `nuevo` y se crean las demás en orden. Devuelve el id de cada tipo.
 */
export async function sembrarEmbudo(prisma: PrismaPruebas, org: OrganizacionDePrueba): Promise<Record<TipoDeEtapa, string>> {
  await prisma.etapa_pipeline.update({ where: { id: org.etapaInicialId }, data: { tipo_sistema: "nuevo" } });
  const ids = { nuevo: org.etapaInicialId } as Record<TipoDeEtapa, string>;
  const resto: [TipoDeEtapa, string, boolean, boolean][] = [
    ["contactado", "Etapa B", false, false],
    ["muestra_agendada", "Etapa C", false, false],
    ["muestra_asistida", "Etapa D", false, false],
    ["negociacion", "Etapa E", false, false],
    ["inscrito", "Etapa F", true, false],
    ["perdido", "Etapa G", false, true],
  ];
  let orden = 2;
  for (const [tipo, nombre, ganado, perdido] of resto) {
    const e = await prisma.etapa_pipeline.create({ data: { organizacion_id: org.organizacionId, nombre, orden: orden++, es_ganado: ganado, es_perdido: perdido, tipo_sistema: tipo } });
    ids[tipo] = e.id;
  }
  return ids;
}

let contadorDeFamilias = 0;

/** Un lead con su prospecto (una familia que escribió). Teléfono único por llamada. */
export async function sembrarFamilia(
  prisma: PrismaPruebas,
  org: OrganizacionDePrueba,
  o: { sucursalId?: string | null; nombre?: string; edad?: number; telefono?: string | null; etapaId?: string } = {},
): Promise<{ leadId: string; prospectoId: string; telefono: string | null }> {
  const n = ++contadorDeFamilias;
  const telefono = o.telefono === undefined ? `+5255${String(30_000_000 + ((n * 7919 + Date.now()) % 60_000_000))}` : o.telefono;
  const lead = await prisma.lead.create({
    data: {
      organizacion_id: org.organizacionId,
      vertical_interes_id: org.verticalId,
      sucursal_interes_id: o.sucursalId === undefined ? org.sucursales[0]!.id : o.sucursalId,
      etapa_id: o.etapaId ?? org.etapaInicialId,
      nombre_contacto: "Mamá",
      telefono,
    },
  });
  const prospecto = await prisma.prospecto.create({
    data: { organizacion_id: org.organizacionId, lead_id: lead.id, vertical_interes_id: org.verticalId, nombre: o.nombre ?? `Niño ${n}`, edad_declarada: o.edad ?? 8, origen: "asesor" },
  });
  return { leadId: lead.id, prospectoId: prospecto.id, telefono };
}

// ── Documentos legales (D6) ───────────────────────────────────────────────────────────────────────────────

export interface DocumentosLegalesSembrados {
  reglamento: string;
  usoImagen: string;
  avisoPrivacidad: string;
}

/** Versión 1 de cada documento legal (generales, vigentes desde mucho antes), con textos de prueba. Devuelve sus ids. */
export async function sembrarDocumentosLegales(prisma: PrismaPruebas, org: OrganizacionDePrueba): Promise<DocumentosLegalesSembrados> {
  const ids: Record<string, string> = {};
  for (const [tipo, clave] of [["reglamento", "reglamento"], ["uso_imagen", "usoImagen"], ["aviso_privacidad", "avisoPrivacidad"]] as const) {
    const texto = `Texto de prueba de ${tipo}, versión 1.`;
    const d = await prisma.documento_legal.create({
      data: { organizacion_id: org.organizacionId, tipo, version: 1, titulo: `Documento de prueba ${tipo}`, texto, texto_hash: createHash("sha256").update(texto, "utf8").digest("hex"), vigente_desde: new Date("2020-01-01T00:00:00Z") },
    });
    ids[clave] = d.id;
  }
  return ids as unknown as DocumentosLegalesSembrados;
}

// ── Familia e inscripción (F1 en adelante) ───────────────────────────────────────────────────────────────

export interface AlumnoSembrado {
  alumnoId: string;
  tutorId: string;
  leadId: string;
  prospectoId: string;
  telefono: string;
}

let contadorDeAlumnos = 0;

/**
 * Un alumno que PUEDE inscribirse: nace de un lead y un prospecto (vinculados), tiene su tutor (responsable de pago, por teléfono) y,
 * por omisión, la familia ya aceptó el reglamento v1 (hay que pasar los documentos de `sembrarDocumentosLegales`). El teléfono del tutor se
 * puede repetir para armar hermanos: el tutor es el mismo.
 */
export async function sembrarAlumno(
  prisma: PrismaPruebas,
  org: OrganizacionDePrueba,
  o: { docs?: DocumentosLegalesSembrados; sucursalId?: string | null; nacimiento?: string; nombre?: string; telefono?: string; etapaId?: string; aceptarReglamento?: boolean; /** Un tutor que ya existe (hermanos: la misma familia; el lead lleva otro teléfono). */ conTutor?: string } = {},
): Promise<AlumnoSembrado> {
  const n = ++contadorDeAlumnos;
  const telefono = o.telefono ?? `+5255${String(40_000_000 + ((n * 104729 + Date.now()) % 50_000_000))}`;
  const sucursalId = o.sucursalId === undefined ? org.sucursales[0]!.id : o.sucursalId;
  const fam = await sembrarFamilia(prisma, org, { sucursalId, telefono: o.telefono ?? telefono, ...(o.etapaId ? { etapaId: o.etapaId } : {}), ...(o.nombre ? { nombre: o.nombre } : {}) });
  const alumno = await prisma.alumno.create({
    data: { organizacion_id: org.organizacionId, nombre: o.nombre ?? `Alumno ${n}`, apellidos: "Prueba", fecha_nacimiento: new Date(`${o.nacimiento ?? "2018-05-04"}T00:00:00.000Z`), sucursal_id: sucursalId },
  });
  await prisma.prospecto.update({ where: { id: fam.prospectoId }, data: { alumno_id: alumno.id } });
  const tutor =
    (o.conTutor ? await prisma.tutor.findFirst({ where: { id: o.conTutor } }) : null) ??
    (await prisma.tutor.findFirst({ where: { organizacion_id: org.organizacionId, telefono, eliminado_en: null } })) ??
    (await prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "Rosa", apellidos: "Mena", telefono, sucursal_id: sucursalId } }));
  await prisma.tutor_alumno.create({ data: { organizacion_id: org.organizacionId, tutor_id: tutor.id, alumno_id: alumno.id, parentesco: "madre", es_responsable_pago: true } });
  await prisma.lead.update({ where: { id: fam.leadId }, data: { tutor_id: tutor.id } });
  if (o.docs && o.aceptarReglamento !== false) {
    const texto = "Texto de prueba de reglamento, versión 1.";
    await prisma.aceptacion_legal.create({
      data: { organizacion_id: org.organizacionId, documento_id: o.docs.reglamento, tipo: "reglamento", version_aceptada: 1, resultado: "aceptada", lead_id: fam.leadId, prospecto_id: fam.prospectoId, aceptante_nombre: "Rosa Mena", canal: "presencial", aceptado_en: new Date(), texto_hash: createHash("sha256").update(texto, "utf8").digest("hex") },
    });
  }
  return { alumnoId: alumno.id, tutorId: tutor.id, leadId: fam.leadId, prospectoId: fam.prospectoId, telefono };
}

/** Un motivo de baja de la organización (F5); devuelve su id. */
export async function sembrarMotivoBaja(prisma: PrismaPruebas, org: OrganizacionDePrueba, codigo = "motivo_de_prueba"): Promise<string> {
  const previo = await prisma.motivo_baja.findFirst({ where: { organizacion_id: org.organizacionId, codigo, eliminado_en: null } });
  if (previo) return previo.id;
  return (await prisma.motivo_baja.create({ data: { organizacion_id: org.organizacionId, codigo, nombre: "Motivo de prueba" } })).id;
}

/** Quién cancela o reprograma en las pruebas de la clase muestra cuando lo hace una persona (V2: eso avisa a la familia). */
export const POR_UNA_PERSONA = { tipo: "usuario", usuarioId: "00000000-0000-4000-8000-0000000000aa" } as const;
