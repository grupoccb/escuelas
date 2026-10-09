// Conversión de un lead en familia e inscripciones (F2, invariante 13: «cero recaptura»). TODO en UNA transacción: si algo falla, nada queda.
//
// Del LEAD (el adulto que escribió) y sus PROSPECTOS (cada niño) salen:
//   · los TUTORES: los adultos del registro del maestro (`registro_tutor`, con sus banderas) y, si no hay registro, el propio contacto del lead.
//     Un tutor por teléfono normalizado: si el teléfono ya existe, se LIGA al que hay (detección de familia); no se le pisan los datos;
//   · por cada prospecto, un ALUMNO (con lo que capturó el maestro: nombre completo, fecha de nacimiento del acta, sexo, escuela, turno, talla y
//     antecedentes) y sus filas `tutor_alumno`;
//   · la SALUD pasa de la ficha del prospecto a la del alumno por el módulo sensible (la ficha se muda, no se copia);
//   · la aceptación del reglamento y de la imagen NO se copian: son evidencia de solo anexar ligada al prospecto, y el alumno queda ligado a ese
//     prospecto (`prospecto.alumno_id`), así que «a quién pertenece» se contesta por ese vínculo (y `autoriza_uso_imagen` se deriva de ahí);
//   · la INSCRIPCIÓN de cada alumno (F3: precio congelado, promociones, cupo, reglamento vigente, cotización aceptada, lead a «inscrito»).
// Al final `lead.tutor_id` y `prospecto.alumno_id` apuntan a lo creado.
//
// QUÉ SE PIDE Y QUÉ NO. `planear` junta todo lo que ya se capturó (bot, landing, registro del maestro, cotización) y calcula SOLO lo que FALTA
// (`faltantes`). La vista previa (`GET /api/leads/:id/conversion`) devuelve únicamente eso; convertir con algo faltante se rechaza con esa misma lista.
// Lo que viaja en la entrada son los complementos de lo faltante (y, si se quiere, correcciones: lo que se manda gana a lo capturado).
//
// IDEMPOTENCIA. Convertir dos veces no duplica: un prospecto que ya tiene alumno lo reutiliza, el tutor es el mismo por su teléfono, y una
// inscripción activa en el mismo grupo se devuelve tal cual. Un candado por lead hace que dos conversiones simultáneas se formen en fila.

import { problemaDeFechaDeNacimiento } from "../clases-muestra/registro-reglas.ts";
import { registroDeProspectoParaConversion } from "../clases-muestra/registro.ts";
import type { ContextoApi } from "../api/contexto.ts";
import { registrarCambio, type Instantanea } from "../api/registro.ts";
import { bloquearCupoDeGrupo } from "../catalogo/cupo.ts";
import { precioVigente } from "../catalogo/precios.ts";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import { bloquearLead } from "../embudo/etapas.ts";
import { crearAlumno, encontrarOCrearTutor, vincularTutor, type DatosDeAlumno } from "../familias/familia.ts";
import { inscribirAlumno, type EntradaDeInscripcion, type InscripcionCreada, type MotivoDeRechazoDeInscripcion } from "../inscripciones/inscribir.ts";
import { bloquearTutores, contarHermanosInscritos, tutoresDeAlumno } from "../inscripciones/hermanos.ts";
import { instantaneaDeCreada } from "../inscripciones/presentar.ts";
import { problemasDeReglamentoVigente } from "../legal/aceptaciones.ts";
import { fechaLocal } from "../lib/horario.ts";
import { cerrarEntradaDe } from "../lista-espera/lista-espera.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { trasladarFichaDeProspectoAAlumno, type Cifrador } from "../sensibles/index.ts";

export interface TutorComplemento {
  parentesco?: string;
  nombre?: string;
  apellidos?: string | null;
  correo?: string | null;
}

export interface ProspectoComplemento {
  prospectoId: string;
  alumno?: Partial<Omit<DatosDeAlumno, "sucursal_id">>;
  inscripcion?: Omit<EntradaDeInscripcion, "alumnoId" | "grupoId"> & { grupoId?: string };
}

export interface EntradaDeConversion {
  tutor?: TutorComplemento;
  /** Los prospectos a convertir. Omitido = todos los vivos que aún no son alumnos. */
  prospectos?: ProspectoComplemento[];
}

export interface Falta {
  campo: string;
  mensaje: string;
}

interface TutorPlaneado {
  nombre: string;
  apellidos: string | null;
  telefono: string;
  correo: string | null;
  parentesco: string;
  es_responsable_pago: boolean;
  lo_lleva: boolean;
  puede_recoger: boolean;
}

interface ProspectoPlaneado {
  prospectoId: string;
  alumnoId: string | null;
  alumno: DatosDeAlumno | null;
  tutores: TutorPlaneado[];
  grupoId: string | null;
  /** V4: el nombre del grupo en el que se inscribirá (para decírselo al maestro antes de confirmar). */
  grupoNombre: string | null;
  sucursalDeGrupo: string | null;
  /** Hay una inscripción que crear (o ya existe una activa en ese grupo). */
  inscripcion: ProspectoComplemento["inscripcion"] | null;
  inscripcionActivaId: string | null;
  tieneInscripcion: boolean;
  /**
   * V3: cuántos hermanos tendrá YA inscritos cuando le toque su turno en esta operación: los que la familia ya tiene inscritos más los hermanos que se inscriben antes que él
   * en la misma operación (en el orden de captura). Es exactamente lo que cuenta `inscribirAlumno` al resolver la promoción por hermanos, así que la cotización que se
   * enseña antes de confirmar coincide con lo que se cobra.
   */
  hermanosPrevistos: number;
  /** V3: el reglamento vigente de la disciplina del niño todavía no está aceptado por la familia (informativo: lo que de verdad bloquea es la falta `reglamento` que sale al elegir el grupo). */
  reglamentoPendiente: boolean;
}

export interface Plan {
  leadId: string;
  leadTelefono: string | null;
  leadTutorId: string | null;
  sucursalDelLead: string | null;
  prospectos: ProspectoPlaneado[];
  faltantes: Falta[];
}

const falta = (campo: string, mensaje: string): Falta => ({ campo, mensaje });
const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const ruta = (prospectoId: string, resto: string): string => `prospectos.${prospectoId}.${resto}`;

/** Lo que el maestro capturó del prospecto, completo o a medias (el registro en borrador también cuenta: lo tecleado no se vuelve a pedir). */
async function registroDe(tx: Consultas | BaseDatos, prospectoId: string) {
  const completo = await registroDeProspectoParaConversion(tx, prospectoId);
  if (completo) {
    return {
      alumno: { nombre: completo.alumno.nombre, apellidos: completo.alumno.apellidos, fecha_nacimiento: completo.alumno.fechaNacimiento, sexo: completo.alumno.sexo, escuela_nombre: completo.alumno.escuela, escuela_turno: completo.alumno.turnoEscolar, talla_uniforme: completo.alumno.tallaUniforme } as Partial<DatosDeAlumno>,
      antecedentes: { practico_antes: completo.antecedentes.practicoAntes, practico_donde: completo.antecedentes.practicoDonde, practico_nivel: completo.antecedentes.practicoNivel, motivo_clase: completo.antecedentes.motivoClase, motivo_clase_detalle: completo.antecedentes.motivoClaseDetalle } as Partial<DatosDeAlumno>,
      tutores: completo.tutores.map((t): TutorPlaneado => ({ nombre: t.nombre, apellidos: t.apellidos, telefono: t.telefono, correo: t.correo, parentesco: t.parentesco, es_responsable_pago: t.esResponsableDePago, lo_lleva: t.loLleva, puede_recoger: t.puedeRecoger })),
      grupoRecomendadoId: completo.observacion.grupoRecomendadoId,
    };
  }
  const r = await tx.registro_clase_muestra.findFirst({ where: { prospecto_id: prospectoId }, orderBy: [{ creado_en: "desc" }, { id: "desc" }] });
  if (!r) return null;
  const tutores = await tx.registro_tutor.findMany({ where: { registro_id: r.id }, orderBy: [{ posicion: "asc" }, { id: "asc" }] });
  const solo = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
  return {
    alumno: solo({ nombre: r.alumno_nombre, apellidos: r.alumno_apellidos, fecha_nacimiento: iso(r.alumno_fecha_nacimiento), sexo: r.alumno_sexo, escuela_nombre: r.escuela_nombre, escuela_turno: r.escuela_turno, talla_uniforme: r.talla_uniforme }) as Partial<DatosDeAlumno>,
    antecedentes: solo({ practico_antes: r.practico_antes, practico_donde: r.practico_donde, practico_nivel: r.practico_nivel, motivo_clase: r.motivo_clase, motivo_clase_detalle: r.motivo_clase_detalle }) as Partial<DatosDeAlumno>,
    tutores: tutores.map((t): TutorPlaneado => ({ nombre: t.nombre, apellidos: t.apellidos, telefono: t.telefono, correo: t.correo, parentesco: t.parentesco, es_responsable_pago: t.es_responsable_pago, lo_lleva: t.lo_lleva, puede_recoger: t.puede_recoger })),
    grupoRecomendadoId: r.grupo_recomendado_id,
  };
}

/**
 * V3: los adultos de la familia según otro niño del mismo lead (el primero, en orden de captura, que ya es alumno o que tiene registro del maestro con adultos). Así el
 * segundo hijo no vuelve a pedir parentesco ni datos del adulto: la familia ya se capturó con el primero. `null` si ningún otro niño aporta adultos.
 */
async function tutoresDeLaFamilia(tx: Consultas | BaseDatos, prospectos: readonly { id: string; alumno_id: string | null }[], excepto: string): Promise<TutorPlaneado[] | null> {
  for (const o of prospectos) {
    if (o.id === excepto) continue;
    if (o.alumno_id) {
      const vinculos = await tx.tutor_alumno.findMany({ where: { alumno_id: o.alumno_id }, orderBy: [{ es_responsable_pago: "desc" }, { id: "asc" }] });
      const tutores = await tx.tutor.findMany({ where: { id: { in: vinculos.map((v) => v.tutor_id) } } });
      const planeados = vinculos.flatMap((v): TutorPlaneado[] => {
        const t = tutores.find((x) => x.id === v.tutor_id);
        return t ? [{ nombre: t.nombre, apellidos: t.apellidos, telefono: t.telefono, correo: t.correo, parentesco: v.parentesco, es_responsable_pago: v.es_responsable_pago, lo_lleva: v.lo_lleva, puede_recoger: v.puede_recoger }] : [];
      });
      if (planeados.length > 0) return planeados;
    } else {
      const reg = await registroDe(tx, o.id);
      if (reg && reg.tutores.length > 0) return reg.tutores.map((t) => ({ ...t }));
    }
  }
  return null;
}

/**
 * Junta lo ya capturado y calcula lo que falta. SOLO LEE. La usan la vista previa y la conversión (esta, dentro de su candado), así que
 * lo que la vista previa dice que falta es exactamente lo que la conversión exigirá.
 */
export async function planear(tx: Consultas | BaseDatos, leadId: string, entrada: EntradaDeConversion, ahora: Date, alcance: AlcanceDeConversion = {}): Promise<Plan | null> {
  const lead = await tx.lead.findFirst({
    where: { id: leadId },
    select: { id: true, nombre_contacto: true, telefono: true, tutor_id: true, sucursal_interes_id: true, prospectos: { where: { eliminado_en: null }, select: { id: true, nombre: true, apellidos: true, fecha_nacimiento: true, alumno_id: true, vertical_interes_id: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] } },
  });
  if (!lead) return null;
  const faltantes: Falta[] = [];
  const peticion = entrada.prospectos ? new Map(entrada.prospectos.map((p) => [p.prospectoId, p])) : null;
  if (peticion) {
    for (const id of peticion.keys()) if (!lead.prospectos.some((p) => p.id === id)) faltantes.push(falta(ruta(id, "prospecto_id"), "Ese prospecto no es de este lead"));
  }
  // Sin lista: todos los prospectos (los ya convertidos no piden nada).
  const elegidos = lead.prospectos.filter((p) => (peticion ? peticion.has(p.id) : true));
  const prospectos: ProspectoPlaneado[] = [];
  const telefonoLead = lead.telefono ? normalizarTelefono(lead.telefono) : null;
  const hoyUTC = ahora.toISOString().slice(0, 10);
  /** Los adultos de otro niño de la misma familia (se busca una sola vez por conversión). `undefined` = todavía no se ha buscado. */
  let apoyo: TutorPlaneado[] | null | undefined;

  for (const p of elegidos) {
    const comp = peticion?.get(p.id);
    const reg = await registroDe(tx, p.id);
    const yaAlumno = p.alumno_id;

    // El alumno: lo capturado por el maestro, con lo que se mande ganando (una corrección).
    let alumno: DatosDeAlumno | null = null;
    if (!yaAlumno) {
      const m = { ...(reg?.alumno ?? {}), ...(reg?.antecedentes ?? {}), ...(comp?.alumno ?? {}) } as Partial<DatosDeAlumno>;
      // V3: lo que el asesor capturó al agregar al niño (apellidos y fecha de nacimiento) vale mientras el maestro no capture el acta: no se pide otra vez.
      if (!m.apellidos && p.apellidos) m.apellidos = p.apellidos;
      if (!m.fecha_nacimiento && p.fecha_nacimiento) m.fecha_nacimiento = iso(p.fecha_nacimiento)!;
      const nombre = comp?.alumno?.nombre ?? m.nombre ?? p.nombre ?? null;
      if (!nombre) faltantes.push(falta(ruta(p.id, "alumno.nombre"), "Falta el nombre del alumno"));
      if (!m.apellidos) faltantes.push(falta(ruta(p.id, "alumno.apellidos"), "Faltan los apellidos del alumno"));
      if (!m.fecha_nacimiento) faltantes.push(falta(ruta(p.id, "alumno.fecha_nacimiento"), "Falta la fecha de nacimiento del acta"));
      else {
        const problema = problemaDeFechaDeNacimiento(m.fecha_nacimiento, hoyUTC);
        if (problema) faltantes.push(falta(ruta(p.id, "alumno.fecha_nacimiento"), problema));
      }
      if (nombre && m.apellidos && m.fecha_nacimiento) alumno = { ...m, nombre, apellidos: m.apellidos, fecha_nacimiento: m.fecha_nacimiento } as DatosDeAlumno;
    }

    // Los tutores: los adultos del registro; si no hay, el contacto del lead.
    let tutores: TutorPlaneado[] = [];
    if (!yaAlumno) {
      if (reg && reg.tutores.length > 0) {
        tutores = reg.tutores.map((t) => ({ ...t }));
        if (!tutores.some((t) => t.es_responsable_pago)) tutores[0]!.es_responsable_pago = true;
      } else if ((apoyo ??= await tutoresDeLaFamilia(tx, lead.prospectos, p.id)) !== null) {
        // V3: el niño no tiene registro propio pero su hermano sí (o ya es alumno): los adultos son los mismos, no se piden otra vez.
        tutores = apoyo.map((t) => ({ ...t }));
        if (!tutores.some((t) => t.es_responsable_pago)) tutores[0]!.es_responsable_pago = true;
      } else {
        const c = entrada.tutor ?? {};
        const nombre = c.nombre ?? lead.nombre_contacto;
        if (!telefonoLead) faltantes.push(falta("tutor.telefono", "El contacto no tiene un teléfono válido"));
        if (!nombre) faltantes.push(falta("tutor.nombre", "Falta el nombre del adulto responsable"));
        if (!c.parentesco) faltantes.push(falta("tutor.parentesco", "Falta el parentesco del adulto responsable con el alumno"));
        if (telefonoLead && nombre && c.parentesco) tutores = [{ nombre, apellidos: c.apellidos ?? null, telefono: telefonoLead, correo: c.correo ?? null, parentesco: c.parentesco, es_responsable_pago: true, lo_lleva: false, puede_recoger: false }];
      }
    }

    // El grupo: lo que se manda, el horario que eligió la familia al cotizar o el que recomendó el maestro.
    let inscripcionActivaId: string | null = null;
    let tieneInscripcion = false;
    if (yaAlumno) tieneInscripcion = (await tx.inscripcion.count({ where: { alumno_id: yaAlumno } })) > 0; // alguna vez inscrito (aunque ya se haya dado de baja)
    let grupoId: string | null = comp?.inscripcion?.grupoId ?? null;
    if (!grupoId && !tieneInscripcion) {
      const cot = await tx.cotizacion.findFirst({ where: { prospecto_id: p.id, estatus: "vigente", grupo_elegido_id: { not: null } }, orderBy: [{ creado_en: "desc" }, { id: "desc" }], select: { grupo_elegido_id: true } });
      grupoId = cot?.grupo_elegido_id ?? reg?.grupoRecomendadoId ?? null;
    }
    let sucursalDeGrupo: string | null = null;
    let grupoNombre: string | null = null;
    if (grupoId) {
      // EF-01: el grupo (el que se manda o el que se deduce de la cotización o de la recomendación del maestro) tiene que estar en el alcance de
      // quien convierte, igual que en `POST /api/inscripciones`: la conversión no es un camino lateral para repartir el cupo de otra sucursal.
      const g = await tx.grupo.findFirst({ where: { id: grupoId, activo: true, ...(alcance.filtroDeGrupos ?? {}) }, select: { id: true, nombre: true, programa: { select: { id: true, vertical_id: true, sucursal_id: true } } } });
      if (!g) {
        faltantes.push(falta(ruta(p.id, "grupo_id"), "El grupo no existe, ya no está activo o no es de tu alcance"));
        grupoId = null;
      } else {
        sucursalDeGrupo = g.programa.sucursal_id;
        grupoNombre = g.nombre;
        if (yaAlumno) {
          const activa = await tx.inscripcion.findFirst({ where: { alumno_id: yaAlumno, grupo_id: g.id, estatus: "activa" }, select: { id: true } });
          inscripcionActivaId = activa?.id ?? null;
        }
        if (!inscripcionActivaId) {
          // Lo que impediría inscribir se dice ahora, no a la mitad de la conversión.
          if (!(await precioVigente(tx, g.programa.id, fechaLocal(ahora, (await tx.sucursal.findFirst({ where: { id: g.programa.sucursal_id }, select: { zona_horaria: true } }))?.zona_horaria ?? "UTC")))) {
            faltantes.push(falta(ruta(p.id, "precio"), "El programa del grupo no tiene un precio vigente"));
          }
          const reglamento = await problemasDeReglamentoVigente(tx, p.id, g.programa.vertical_id, ahora);
          if (reglamento.length > 0) faltantes.push(falta(ruta(p.id, "reglamento"), reglamento[0]!.mensaje));
        }
      }
    }
    if (!grupoId && !tieneInscripcion) faltantes.push(falta(ruta(p.id, "grupo_id"), "Falta el grupo en el que se inscribe"));

    prospectos.push({
      prospectoId: p.id,
      alumnoId: yaAlumno,
      alumno,
      tutores,
      grupoId,
      grupoNombre,
      sucursalDeGrupo,
      inscripcion: grupoId ? (comp?.inscripcion ?? {}) : null,
      inscripcionActivaId,
      tieneInscripcion,
      hermanosPrevistos: 0,
      reglamentoPendiente: !yaAlumno && (await problemasDeReglamentoVigente(tx, p.id, p.vertical_interes_id, ahora)).length > 0,
    });
  }
  await calcularHermanosPrevistos(tx, prospectos, { telefono: telefonoLead, tutorId: lead.tutor_id });
  if (lead.prospectos.length === 0) faltantes.push(falta("prospectos", "El lead no tiene a nadie que convertir: falta el alumno"));
  // El adulto es UNO para toda la familia: lo que falta de él se dice una sola vez, aunque varios niños lo necesiten (cero recaptura con los hermanos).
  for (let i = faltantes.length - 1; i >= 0; i--) if (faltantes[i]!.campo.startsWith("tutor.") && faltantes.findIndex((f) => f.campo === faltantes[i]!.campo) !== i) faltantes.splice(i, 1);
  return { leadId: lead.id, leadTelefono: telefonoLead, leadTutorId: lead.tutor_id, sucursalDelLead: lead.sucursal_interes_id, prospectos, faltantes };
}

/**
 * Llena `hermanosPrevistos` de cada niño (ver `ProspectoPlaneado`). Solo lee. Mientras falta el adulto de un niño (la vista previa todavía no sabe su parentesco), se usa el
 * contacto del lead: los hijos de un mismo lead son de la misma familia, y es el adulto con el que `convertirLead` los va a ligar.
 */
async function calcularHermanosPrevistos(tx: Consultas | BaseDatos, prospectos: ProspectoPlaneado[], contacto: { telefono: string | null; tutorId: string | null }): Promise<void> {
  const telefonosDe = (p: ProspectoPlaneado): string[] => (p.tutores.length > 0 ? p.tutores.map((t) => t.telefono) : contacto.telefono ? [contacto.telefono] : []);
  const telefonos = [...new Set(prospectos.flatMap(telefonosDe))];
  const existentes = telefonos.length > 0 ? await tx.tutor.findMany({ where: { telefono: { in: telefonos } }, select: { id: true, telefono: true } }) : [];
  const idDe = new Map(existentes.map((t) => [t.telefono, t.id]));
  const enLaOperacion: ProspectoPlaneado[] = [];
  for (const p of prospectos) {
    if (p.alumnoId) {
      p.hermanosPrevistos = await contarHermanosInscritos(tx, p.alumnoId);
    } else {
      const ids = [...telefonosDe(p).flatMap((t) => idDe.get(t) ?? []), ...(p.tutores.length === 0 && contacto.tutorId ? [contacto.tutorId] : [])];
      const ya = ids.length > 0 ? await tx.alumno.count({ where: { tutores: { some: { eliminado_en: null, tutor_id: { in: [...new Set(ids)] } } }, inscripciones: { some: { estatus: "activa", eliminado_en: null } } } }) : 0;
      const mios = telefonosDe(p);
      const antes = enLaOperacion.filter((o) => telefonosDe(o).some((t) => mios.includes(t))).length;
      p.hermanosPrevistos = ya + antes;
    }
    // Cuentan para los siguientes los niños que esta operación inscribe (el asistente exige un grupo para cada marcado, así que aquí aún no importa cuál).
    if (p.inscripcionActivaId === null && !p.tieneInscripcion) enLaOperacion.push(p);
  }
}

/** Lo que limita a quien convierte. `filtroDeGrupos` es una condición de Prisma sobre `grupo` (su alcance de sucursales); sin ella, todos. */
export interface AlcanceDeConversion {
  filtroDeGrupos?: Record<string, unknown> | undefined;
}

export interface VistaPrevia {
  leadId: string;
  /** No falta nada: se puede convertir sin capturar más. */
  listo: boolean;
  /** Ya no queda nada por hacer (todo está convertido e inscrito). */
  yaConvertido: boolean;
  /** SOLO lo que falta por capturar. */
  faltantes: Falta[];
  prospectos: { prospectoId: string; yaConvertido: boolean; hermanosPrevistos: number; reglamentoPendiente: boolean; grupoNombre: string | null }[];
}

/** Lo que falta por capturar para convertir al lead (nada de lo ya capturado). null si el lead no existe. */
export async function vistaPreviaDeConversion(db: BaseDatos, leadId: string, entrada: EntradaDeConversion, ahora: Date, alcance: AlcanceDeConversion = {}): Promise<VistaPrevia | null> {
  const plan = await planear(db, leadId, entrada, ahora, alcance);
  if (!plan) return null;
  const hayTrabajo = plan.prospectos.some((p) => !p.alumnoId || (p.grupoId !== null && p.inscripcionActivaId === null));
  return { leadId, listo: plan.faltantes.length === 0, yaConvertido: !hayTrabajo && plan.faltantes.length === 0, faltantes: plan.faltantes, prospectos: plan.prospectos.map((p) => ({ prospectoId: p.prospectoId, yaConvertido: p.alumnoId !== null, hermanosPrevistos: p.hermanosPrevistos, reglamentoPendiente: p.reglamentoPendiente, grupoNombre: p.grupoNombre })) };
}

export interface ResultadoDeConversion {
  yaConvertido: boolean;
  tutorId: string | null;
  alumnos: { prospectoId: string; alumnoId: string; creado: boolean; tutorIds: string[]; inscripcion: { id: string; grupoId: string; creada: boolean } | null }[];
}

export type RechazoDeConversion =
  | { motivo: "lead_inexistente" }
  | { motivo: "faltan_datos"; faltantes: Falta[] }
  | { motivo: "inscripcion"; prospectoId: string; rechazo: MotivoDeRechazoDeInscripcion; mensaje: string; detalles?: { campo: string; mensaje: string }[] };

export type ConversionHecha = { ok: true; resultado: ResultadoDeConversion } | ({ ok: false } & RechazoDeConversion);

/** Para deshacer TODO cuando algo falla a la mitad: se lanza dentro de la transacción y se atrapa fuera de ella. */
class ConversionAbortada extends Error {
  readonly rechazo: RechazoDeConversion;
  constructor(rechazo: RechazoDeConversion) {
    super(`conversion_abortada:${rechazo.motivo}`);
    this.rechazo = rechazo;
  }
}

export interface OpcionesDeConversion extends AlcanceDeConversion {
  cifrador?: Cifrador;
}

const claveDeCandado = (leadId: string): string => `conversion:${leadId}`;
const instAlumno = (sucursalId: string | null, campos: string[]): Instantanea => ({ estatus: "activo", sucursal_id: sucursalId, campos });

export async function convertirLead(db: BaseDatos, ctx: Pick<ContextoApi, "usuario" | "organizacionId" | "ahora">, leadId: string, entrada: EntradaDeConversion, opciones: OpcionesDeConversion = {}): Promise<ConversionHecha> {
  const ahora = ctx.ahora();
  let cierres: InscripcionCreada["listaDeEspera"][] = [];
  try {
    const resultado = await transaccionConBloqueo(db, ctx.organizacionId, claveDeCandado(leadId), async (tx): Promise<ResultadoDeConversion> => {
      // Orden de candados de todo el sistema: lead → adultos de la familia → grupos. El lead primero, como el bot al agendar y `inscribirAlumno` (ED-08).
      await bloquearLead(tx, leadId);
      const plan = await planear(tx, leadId, entrada, ahora, { filtroDeGrupos: opciones.filtroDeGrupos });
      if (!plan) throw new ConversionAbortada({ motivo: "lead_inexistente" });
      if (plan.faltantes.length > 0) throw new ConversionAbortada({ motivo: "faltan_datos", faltantes: plan.faltantes });

      const salida: ResultadoDeConversion["alumnos"] = [];
      const porInscribir: { p: ProspectoPlaneado; entrada: EntradaDeInscripcion; alumnoId: string }[] = [];
      let tutorDelLead: string | null = plan.leadTutorId;
      let hizoAlgo = false;

      for (const p of plan.prospectos) {
        const sucursalId = plan.sucursalDelLead ?? p.sucursalDeGrupo;
        let alumnoId = p.alumnoId;
        let creado = false;
        const tutorIds: string[] = [];
        if (!alumnoId) {
          // Tutores (por teléfono) y alumno.
          alumnoId = await crearAlumno(tx, { ...p.alumno!, sucursal_id: sucursalId });
          creado = true;
          hizoAlgo = true;
          await registrarCambio(tx, ctx, { entidad: "alumno", entidadId: alumnoId, accion: "crear", despues: instAlumno(sucursalId, ["conversion"]) });
          for (const t of p.tutores) {
            const tutor = await encontrarOCrearTutor(tx, { nombre: t.nombre, apellidos: t.apellidos, telefono: t.telefono, correo: t.correo, sucursal_id: sucursalId });
            if (tutor.creado) await registrarCambio(tx, ctx, { entidad: "tutor", entidadId: tutor.id, accion: "crear", despues: { sucursal_id: sucursalId, campos: ["conversion"] } });
            const v = await vincularTutor(tx, { tutorId: tutor.id, alumnoId, parentesco: t.parentesco, es_responsable_pago: t.es_responsable_pago, lo_lleva: t.lo_lleva, puede_recoger: t.puede_recoger });
            if (!v.ok) throw new ConversionAbortada({ motivo: "faltan_datos", faltantes: [falta(ruta(p.prospectoId, "tutores"), "El alumno ya tiene un responsable de pago")] });
            if (v.creado) {
              await registrarCambio(tx, ctx, { entidad: "tutor_alumno", entidadId: v.id, accion: "crear", despues: { tutor_id: tutor.id, alumno_id: alumnoId, parentesco: t.parentesco, es_responsable_pago: t.es_responsable_pago, es_contacto_urgencia: false, puede_recoger: t.puede_recoger, lo_lleva: t.lo_lleva } });
            }
            tutorIds.push(tutor.id);
            if (tutorDelLead === null && (t.telefono === plan.leadTelefono)) tutorDelLead = tutor.id;
          }
          if (tutorDelLead === null) tutorDelLead = tutorIds[p.tutores.findIndex((t) => t.es_responsable_pago)] ?? tutorIds[0] ?? null;
          const ligado = await tx.prospecto.updateMany({ where: { id: p.prospectoId, alumno_id: null }, data: { alumno_id: alumnoId } });
          if (ligado.count !== 1) throw new ConversionAbortada({ motivo: "faltan_datos", faltantes: [falta(ruta(p.prospectoId, "prospecto_id"), "El prospecto ya se convirtió en otro alumno")] });
          // La salud se muda de la ficha del prospecto a la del alumno (sin que el valor salga del módulo sensible).
          await trasladarFichaDeProspectoAAlumno(tx, { organizacionId: ctx.organizacionId, prospectoId: p.prospectoId, alumnoId, usuarioId: ctx.usuario.id, ...(opciones.cifrador ? { cifrador: opciones.cifrador } : {}) });
        } else {
          const ya = await tx.tutor_alumno.findMany({ where: { alumno_id: alumnoId }, select: { tutor_id: true } });
          tutorIds.push(...ya.map((t) => t.tutor_id));
        }
        if (p.grupoId && !p.inscripcionActivaId) {
          porInscribir.push({ p, alumnoId, entrada: { ...(p.inscripcion ?? {}), alumnoId, grupoId: p.grupoId } });
        }
        let existente: { id: string; grupoId: string; creada: boolean } | null = null;
        if (p.alumnoId) {
          // Ya convertido: se devuelve su inscripción vigente (la del grupo pedido, o la más reciente).
          const ins = await tx.inscripcion.findFirst({ where: { alumno_id: alumnoId, estatus: { in: ["activa", "congelada"] }, ...(p.inscripcionActivaId ? { id: p.inscripcionActivaId } : {}) }, orderBy: [{ creado_en: "desc" }, { id: "desc" }], select: { id: true, grupo_id: true } });
          if (ins) existente = { id: ins.id, grupoId: ins.grupo_id, creada: false };
        }
        salida.push({ prospectoId: p.prospectoId, alumnoId, creado, tutorIds, inscripcion: existente });
      }

      if (tutorDelLead && plan.leadTutorId === null) {
        await tx.lead.updateMany({ where: { id: plan.leadId, tutor_id: null }, data: { tutor_id: tutorDelLead } });
        await registrarCambio(tx, ctx, { entidad: "lead", entidadId: plan.leadId, accion: "actualizar", antes: { tutor_id: null }, despues: { tutor_id: tutorDelLead } });
        hizoAlgo = true;
      }

      // Dos cosas distintas (EK-I01). 1) Los candados de cupo de TODOS los grupos, siempre en orden de id: dos conversiones con los mismos grupos no se estorban en orden
      // inverso. 2) Las inscripciones, en el orden de CAPTURA de los prospectos (el del plan: `creado_en`, `id`): quién recibe el descuento por hermanos depende de quién se
      // inscribe después, y eso no puede decidirlo el orden de unos UUID aleatorios (el mismo lead daba precios distintos según los ids de sus grupos).
      // EF-11: los adultos de TODOS los niños que se inscriben, de una vez y en orden de id (dos conversiones de familias que comparten un adulto no se interbloquean).
      const adultos: string[] = [];
      for (const i of porInscribir) adultos.push(...(await tutoresDeAlumno(tx, i.alumnoId)));
      await bloquearTutores(tx, adultos);
      for (const g of [...new Set(porInscribir.map((i) => i.entrada.grupoId))].sort()) await bloquearCupoDeGrupo(tx, g);
      for (const i of porInscribir) {
        const r = await inscribirAlumno(tx, { ahora, usuarioId: ctx.usuario.id }, i.entrada);
        if (!r.ok) {
          // «Ya inscrito» es el caso idempotente de una conversión repetida a la vez: se devuelve lo que hay.
          if (r.motivo === "ya_inscrito" && r.inscripcionId) {
            const s = salida.find((x) => x.alumnoId === i.alumnoId)!;
            s.inscripcion = { id: r.inscripcionId, grupoId: i.entrada.grupoId, creada: false };
            continue;
          }
          throw new ConversionAbortada({ motivo: "inscripcion", prospectoId: i.p.prospectoId, rechazo: r.motivo, mensaje: r.mensaje, ...(r.detalles ? { detalles: r.detalles } : {}) });
        }
        hizoAlgo = true;
        await registrarCambio(tx, ctx, { entidad: "inscripcion", entidadId: r.inscripcion.id, accion: "crear", despues: instantaneaDeCreada(r.inscripcion) });
        const s = salida.find((x) => x.alumnoId === i.alumnoId)!;
        s.inscripcion = { id: r.inscripcion.id, grupoId: r.inscripcion.grupoId, creada: true };
        cierres.push(r.inscripcion.listaDeEspera);
      }

      if (hizoAlgo) {
        // Ya inscrito, la tarea «listo para cerrar» (F6) quedó cumplida.
        await tx.tarea_asesor.updateMany({ where: { lead_id: plan.leadId, tipo: "listo_para_cerrar", estado: "pendiente" }, data: { estado: "hecha", resuelta_en: ahora } });
        await tx.interaccion.create({
          data: altaConAlcance({ lead_id: plan.leadId, tipo: "nota" as const, contenido: `Lead convertido: ${salida.filter((s) => s.creado).length} alumno(s) nuevo(s), ${salida.filter((s) => s.inscripcion?.creada).length} inscripción(es).` }),
        });
      }
      return { yaConvertido: !hizoAlgo, tutorId: tutorDelLead, alumnos: salida };
    });
    // Ya confirmada la conversión: la lista de espera (su propia transacción con candado) cierra a quien esperaba.
    for (const c of cierres) if (c) await cerrarEntradaDe(db, c.grupoId, c.prospectoId, "inscrito");
    return { ok: true, resultado };
  } catch (e) {
    cierres = [];
    if (e instanceof ConversionAbortada) return { ok: false, ...e.rechazo };
    throw e;
  }
}
