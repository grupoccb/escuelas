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
import { precioVigente } from "../catalogo/precios.ts";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import { crearAlumno, encontrarOCrearTutor, vincularTutor, type DatosDeAlumno } from "../familias/familia.ts";
import { inscribirAlumno, type EntradaDeInscripcion, type InscripcionCreada, type MotivoDeRechazoDeInscripcion } from "../inscripciones/inscribir.ts";
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
  sucursalDeGrupo: string | null;
  /** Hay una inscripción que crear (o ya existe una activa en ese grupo). */
  inscripcion: ProspectoComplemento["inscripcion"] | null;
  inscripcionActivaId: string | null;
  tieneInscripcion: boolean;
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
 * Junta lo ya capturado y calcula lo que falta. SOLO LEE. La usan la vista previa y la conversión (esta, dentro de su candado), así que
 * lo que la vista previa dice que falta es exactamente lo que la conversión exigirá.
 */
export async function planear(tx: Consultas | BaseDatos, leadId: string, entrada: EntradaDeConversion, ahora: Date): Promise<Plan | null> {
  const lead = await tx.lead.findFirst({
    where: { id: leadId },
    select: { id: true, nombre_contacto: true, telefono: true, tutor_id: true, sucursal_interes_id: true, prospectos: { where: { eliminado_en: null }, select: { id: true, nombre: true, alumno_id: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] } },
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

  for (const p of elegidos) {
    const comp = peticion?.get(p.id);
    const reg = await registroDe(tx, p.id);
    const yaAlumno = p.alumno_id;

    // El alumno: lo capturado por el maestro, con lo que se mande ganando (una corrección).
    let alumno: DatosDeAlumno | null = null;
    if (!yaAlumno) {
      const m = { ...(reg?.alumno ?? {}), ...(reg?.antecedentes ?? {}), ...(comp?.alumno ?? {}) } as Partial<DatosDeAlumno>;
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
    if (grupoId) {
      const g = await tx.grupo.findFirst({ where: { id: grupoId, activo: true }, select: { id: true, programa: { select: { id: true, vertical_id: true, sucursal_id: true } } } });
      if (!g) {
        faltantes.push(falta(ruta(p.id, "grupo_id"), "El grupo no existe o ya no está activo"));
        grupoId = null;
      } else {
        sucursalDeGrupo = g.programa.sucursal_id;
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
      sucursalDeGrupo,
      inscripcion: grupoId ? (comp?.inscripcion ?? {}) : null,
      inscripcionActivaId,
      tieneInscripcion,
    });
  }
  if (lead.prospectos.length === 0) faltantes.push(falta("prospectos", "El lead no tiene a nadie que convertir: falta el alumno"));
  return { leadId: lead.id, leadTelefono: telefonoLead, leadTutorId: lead.tutor_id, sucursalDelLead: lead.sucursal_interes_id, prospectos, faltantes };
}

export interface VistaPrevia {
  leadId: string;
  /** No falta nada: se puede convertir sin capturar más. */
  listo: boolean;
  /** Ya no queda nada por hacer (todo está convertido e inscrito). */
  yaConvertido: boolean;
  /** SOLO lo que falta por capturar. */
  faltantes: Falta[];
  prospectos: { prospectoId: string; yaConvertido: boolean }[];
}

/** Lo que falta por capturar para convertir al lead (nada de lo ya capturado). null si el lead no existe. */
export async function vistaPreviaDeConversion(db: BaseDatos, leadId: string, entrada: EntradaDeConversion, ahora: Date): Promise<VistaPrevia | null> {
  const plan = await planear(db, leadId, entrada, ahora);
  if (!plan) return null;
  const hayTrabajo = plan.prospectos.some((p) => !p.alumnoId || (p.grupoId !== null && p.inscripcionActivaId === null));
  return { leadId, listo: plan.faltantes.length === 0, yaConvertido: !hayTrabajo && plan.faltantes.length === 0, faltantes: plan.faltantes, prospectos: plan.prospectos.map((p) => ({ prospectoId: p.prospectoId, yaConvertido: p.alumnoId !== null })) };
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

export interface OpcionesDeConversion {
  cifrador?: Cifrador;
}

const claveDeCandado = (leadId: string): string => `conversion:${leadId}`;
const instAlumno = (sucursalId: string | null, campos: string[]): Instantanea => ({ estatus: "activo", sucursal_id: sucursalId, campos });

export async function convertirLead(db: BaseDatos, ctx: Pick<ContextoApi, "usuario" | "organizacionId" | "ahora">, leadId: string, entrada: EntradaDeConversion, opciones: OpcionesDeConversion = {}): Promise<ConversionHecha> {
  const ahora = ctx.ahora();
  let cierres: InscripcionCreada["listaDeEspera"][] = [];
  try {
    const resultado = await transaccionConBloqueo(db, ctx.organizacionId, claveDeCandado(leadId), async (tx): Promise<ResultadoDeConversion> => {
      const plan = await planear(tx, leadId, entrada, ahora);
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

      // Las inscripciones, siempre en el mismo orden de grupos (dos conversiones con los mismos grupos no se estorban en orden inverso).
      porInscribir.sort((a, b) => (a.entrada.grupoId < b.entrada.grupoId ? -1 : a.entrada.grupoId > b.entrada.grupoId ? 1 : 0));
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
