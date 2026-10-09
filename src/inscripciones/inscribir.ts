// Inscribir a un alumno en un grupo (F3). Corre DENTRO de la transacción de quien llama (la API, o la conversión de un lead, F2), para que
// «inscribir» sea una sola cosa con lo demás que pase en ella: si algo falla, nada queda.
//
// Qué hace, en este orden:
//   1. valida el alumno, el grupo (activo) y la edad contra el rango del programa (a la fecha de corte del programa, si la tiene);
//   2. el reglamento VIGENTE tiene que estar aceptado por la familia (D6);
//   3. el precio se CONGELA desde `precioVigente` al día de la inscripción: sin precio vigente no se inscribe (error claro);
//   4. toma el candado del cupo (`bloquearCupoDeGrupo`, el mismo que usa la clase muestra) y cuenta las activas: dos inscripciones por el
//      último lugar → gana una, la otra recibe `grupo_lleno`;
//   5. resuelve las promociones (C3) con los hermanos ya inscritos de la familia (F7) y consume su cupo de forma atómica; si una promoción
//      se agotó entre tanto, se vuelve a resolver sin ella;
//   6. escribe la inscripción, una fila `promocion_aplicacion` por beneficio (los inmediatos `entregado`, los diferidos `pendiente`, con lo
//      que valieron CONGELADO), pasa la cotización origen a `aceptada`, mueve al lead a la etapa `inscrito` (por `tipo_sistema`, con historial)
//      y deja al alumno `activo`.
// Lo que NO hace aquí: registrar el cambio (lo hace quien llama, que sabe quién es) ni cerrar la lista de espera (necesita su propia
// transacción con candado: el resultado trae `listaDeEspera` para que se cierre DESPUÉS de confirmar).

import { InscripcionesActivas, bloquearCupoDeGrupo } from "../catalogo/cupo.ts";
import { aFecha, deFecha, precioVigente, sumarDias, type FechaISO } from "../catalogo/precios.ts";
import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { estatusEfectivo } from "../cotizador/cotizacion.ts";
import { moverLeadAEtapa } from "../embudo/etapas.ts";
import { problemasDeReglamentoVigente } from "../legal/aceptaciones.ts";
import { edadCumplida } from "../lib/edad.ts";
import { crearCargosAlInscribir, responsableDePago, type CargoCreado } from "../finanzas/cargos.ts";
import { aTexto } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { cargarPromociones } from "../promociones/cargar.ts";
import { consumirCupo, liberarCupo } from "../promociones/cupo.ts";
import { resolverPromociones, type PromocionDef, type ResultadoPromociones } from "../promociones/resolver.ts";
import { diaDeCortePorOmision, esDiaDeCorteValido } from "./corte.ts";
import { programarBienvenida } from "./bienvenida.ts";
import { contarHermanosInscritos } from "./hermanos.ts";

export interface EntradaDeInscripcion {
  alumnoId: string;
  grupoId: string;
  /** Primer día de clases. Por omisión, el día de la inscripción. No puede ser anterior a ese día ni pasar de un año. */
  fechaInicio?: FechaISO;
  /** 1 a 31. Por omisión, el día del mes en que empieza el alumno. */
  diaCortePago?: number;
  /** Meses que paga por adelantado al inscribirse (habilita la promoción `pago_anticipado`). */
  mesesPagadosPorAdelantado?: number;
  /** La cotización que se acepta. Por omisión, la vigente del prospecto del alumno para ese programa, si la hay. */
  cotizacionId?: string;
  /** Solo el administrador: inscribir fuera del rango de edad del programa. */
  permitirFueraDeEdad?: boolean;
}

export interface ContextoDeInscripcion {
  ahora: Date;
  usuarioId: string | null;
}

export type MotivoDeRechazoDeInscripcion =
  | "alumno_inexistente"
  | "grupo_inexistente"
  | "fecha_invalida"
  | "dia_de_corte_invalido"
  | "fuera_de_edad"
  | "sin_precio"
  | "reglamento"
  | "grupo_lleno"
  | "ya_inscrito"
  | "cotizacion_invalida"
  | "sin_responsable_de_pago";

export interface InscripcionCreada {
  id: string;
  alumnoId: string;
  grupoId: string;
  programaId: string;
  leadId: string | null;
  prospectoId: string | null;
  cotizacionId: string | null;
  promocionId: string | null;
  fechaInscripcion: FechaISO;
  fechaInicio: FechaISO;
  diaCortePago: number;
  precioInscripcion: string;
  precioMensualidad: string;
  descuentoInscripcion: string;
  descuentoMensualidad: string;
  mesesGratis: number;
  mesesPagadosPorAdelantado: number;
  aplicaciones: { id: string; beneficioId: string; promocionId: string; estatus: "entregado" | "pendiente" }[];
  /** Los cargos que nacieron con la inscripción (H1): la inscripción y la primera mensualidad (o las que se pagan por adelantado). */
  cargos: CargoCreado[];
  /** Para cerrar la entrada de la lista de espera de ese prospecto en ese grupo, DESPUÉS de confirmar la transacción. */
  listaDeEspera: { grupoId: string; prospectoId: string } | null;
}

export type ResultadoDeInscripcion =
  | { ok: true; inscripcion: InscripcionCreada }
  | { ok: false; motivo: MotivoDeRechazoDeInscripcion; mensaje: string; detalles?: { campo: string; mensaje: string }[]; inscripcionId?: string };

const rechazo = (motivo: MotivoDeRechazoDeInscripcion, mensaje: string, extra: { detalles?: { campo: string; mensaje: string }[]; inscripcionId?: string } = {}): ResultadoDeInscripcion => ({ ok: false, motivo, mensaje, ...extra });
const FUENTE = new InscripcionesActivas();
const MAX_REINTENTOS_DE_PROMOCIONES = 5;
const MAXIMO_DE_DIAS_HACIA_ADELANTE = 365;

/**
 * Resuelve las promociones y consume el cupo de las que aplican. Si una se agotó entre que se resolvió y que se tomó el lugar (otra
 * inscripción ganó la carrera), se devuelven los lugares ya tomados en esta vuelta y se resuelve de nuevo SIN esa promoción.
 */
async function resolverYConsumir(tx: Consultas, todas: readonly PromocionDef[], ctx: Parameters<typeof resolverPromociones>[1]): Promise<ResultadoPromociones> {
  const agotadas = new Set<string>();
  for (let vuelta = 0; vuelta < MAX_REINTENTOS_DE_PROMOCIONES; vuelta++) {
    const disponibles = todas.map((p) => (agotadas.has(p.id) && p.cupoMaximo !== null ? { ...p, cupoUsado: p.cupoMaximo } : agotadas.has(p.id) ? { ...p, activa: false } : p));
    const r = resolverPromociones(disponibles, ctx);
    const tomadas: string[] = [];
    let fallo: string | null = null;
    for (const a of r.aplicadas) {
      if (await consumirCupo(tx, a.promocionId, ctx)) tomadas.push(a.promocionId);
      else {
        fallo = a.promocionId;
        break;
      }
    }
    if (fallo === null) return r;
    for (const id of tomadas) await liberarCupo(tx, id);
    agotadas.add(fallo);
  }
  // Sin promociones: peor caso, se inscribe a precio de lista.
  return resolverPromociones(todas.map((p) => ({ ...p, activa: false })), ctx);
}

export async function inscribirAlumno(tx: Consultas, ctx: ContextoDeInscripcion, e: EntradaDeInscripcion): Promise<ResultadoDeInscripcion> {
  const alumno = await tx.alumno.findFirst({
    where: { id: e.alumnoId },
    select: { id: true, estatus: true, fecha_nacimiento: true, prospectos: { where: { eliminado_en: null }, select: { id: true, lead_id: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }], take: 1 } },
  });
  if (!alumno) return rechazo("alumno_inexistente", "No se encontró el alumno");
  const grupo = await tx.grupo.findFirst({
    where: { id: e.grupoId, activo: true },
    select: { id: true, cupo_maximo: true, programa: { select: { id: true, activo: true, vertical_id: true, sucursal_id: true, edad_min: true, edad_max: true, fecha_corte_edad: true, sucursal: { select: { zona_horaria: true } } } } },
  });
  if (!grupo || !grupo.programa.activo) return rechazo("grupo_inexistente", "No se encontró el grupo, o ya no está activo");
  const programa = grupo.programa;
  const prospecto = alumno.prospectos[0] ?? null;

  // Fechas (calendario local de la sucursal del grupo).
  const hoy = fechaLocal(ctx.ahora, programa.sucursal.zona_horaria);
  const fechaInicio = e.fechaInicio ?? hoy;
  if (fechaInicio < hoy) return rechazo("fecha_invalida", "La fecha de inicio no puede ser anterior a hoy", { detalles: [{ campo: "fecha_inicio", mensaje: "No puede ser anterior a hoy" }] });
  if (fechaInicio > sumarDias(hoy, MAXIMO_DE_DIAS_HACIA_ADELANTE)) return rechazo("fecha_invalida", "La fecha de inicio está demasiado lejos", { detalles: [{ campo: "fecha_inicio", mensaje: `No puede pasar de ${MAXIMO_DE_DIAS_HACIA_ADELANTE} días` }] });
  const diaCorte = e.diaCortePago ?? diaDeCortePorOmision(fechaInicio);
  if (!esDiaDeCorteValido(diaCorte)) return rechazo("dia_de_corte_invalido", "El día de corte debe estar entre 1 y 31", { detalles: [{ campo: "dia_corte_pago", mensaje: "Debe estar entre 1 y 31" }] });
  const meses = e.mesesPagadosPorAdelantado ?? 0;

  // Edad al corte del programa (o a hoy).
  if (!e.permitirFueraDeEdad) {
    const nacimiento = deFecha(alumno.fecha_nacimiento);
    const al = programa.fecha_corte_edad ? deFecha(programa.fecha_corte_edad) : hoy;
    const edad = nacimiento > al ? -1 : edadCumplida(nacimiento, al);
    if (edad < programa.edad_min || edad > programa.edad_max) return rechazo("fuera_de_edad", `La edad del alumno (${edad < 0 ? "aún no nace a esa fecha" : edad}) está fuera del rango del programa (${programa.edad_min} a ${programa.edad_max})`);
  }

  // Precio congelado desde el precio vigente. Sin precio no se inscribe.
  const precio = await precioVigente(tx, programa.id, hoy);
  if (!precio) return rechazo("sin_precio", "El programa no tiene un precio vigente: pídele al administrador que lo configure antes de inscribir");

  // El reglamento vigente aceptado (D6): la evidencia cuelga del prospecto de origen.
  if (!prospecto) {
    return rechazo("reglamento", "El alumno no viene de un prospecto: no hay evidencia de que la familia aceptara el reglamento", { detalles: [{ campo: "reglamento", mensaje: "Falta la aceptación del reglamento" }] });
  }
  const problemas = await problemasDeReglamentoVigente(tx, prospecto.id, programa.vertical_id, ctx.ahora);
  if (problemas.length > 0) return rechazo("reglamento", problemas[0]!.mensaje, { detalles: problemas });

  // H1: los cargos son de alguien. Sin un tutor al que cobrarle no se inscribe (se rechaza ANTES de escribir nada).
  const tutorDePago = await responsableDePago(tx, alumno.id);
  if (!tutorDePago) return rechazo("sin_responsable_de_pago", "El alumno no tiene un tutor: registra al responsable de pago antes de inscribirlo", { detalles: [{ campo: "tutor", mensaje: "Falta el responsable de pago" }] });

  // La cotización que se acepta (opcional).
  let cotizacionId: string | null;
  if (e.cotizacionId) {
    const c = await tx.cotizacion.findFirst({ where: { id: e.cotizacionId, prospecto_id: prospecto.id, programa_id: programa.id }, select: { id: true, estatus: true, vigente_hasta: true } });
    // EG-16: una cotización cuyo último día ya pasó está vencida aunque el barrido que la guarda como `vencida` no haya corrido todavía (`estatusEfectivo`, el mismo criterio de la API).
    if (!c || estatusEfectivo(c.estatus, deFecha(c.vigente_hasta), ctx.ahora) === "vencida") return rechazo("cotizacion_invalida", "La cotización no existe, no es de este alumno y programa, o ya venció", { detalles: [{ campo: "cotizacion_id", mensaje: "No sirve para esta inscripción" }] });
    cotizacionId = c.id;
  } else {
    const c = await tx.cotizacion.findFirst({ where: { prospecto_id: prospecto.id, programa_id: programa.id, estatus: "vigente", vigente_hasta: { gte: aFecha(hoy) } }, orderBy: [{ creado_en: "desc" }, { id: "asc" }], select: { id: true } });
    cotizacionId = c?.id ?? null;
  }

  // El candado del cupo y, DESPUÉS, la cuenta (contar y tomar el lugar son una sola cosa).
  await bloquearCupoDeGrupo(tx, grupo.id);
  const previa = await tx.inscripcion.findFirst({ where: { alumno_id: alumno.id, grupo_id: grupo.id, estatus: "activa" }, select: { id: true } });
  if (previa) return rechazo("ya_inscrito", "El alumno ya está inscrito en este grupo", { inscripcionId: previa.id });
  if ((await FUENTE.ocupados(tx, grupo.id)) >= grupo.cupo_maximo) return rechazo("grupo_lleno", "El grupo ya no tiene lugares");

  // Promociones con los hermanos ya inscritos.
  const hermanos = await contarHermanosInscritos(tx, alumno.id);
  const r = await resolverYConsumir(tx, await cargarPromociones(tx), {
    fecha: hoy,
    verticalId: programa.vertical_id,
    sucursalId: programa.sucursal_id,
    programaId: programa.id,
    hermanosInscritos: hermanos,
    mesesPagadosPorAdelantado: meses,
    costoInscripcion: precio.costoInscripcion,
    costoMensualidad: precio.costoMensualidad,
  });

  const promocionPrincipal = r.aplicadas[0]?.promocionId ?? null;
  const fila = await tx.inscripcion.create({
    data: altaConAlcance({
      alumno_id: alumno.id,
      grupo_id: grupo.id,
      programa_id: programa.id,
      lead_id: prospecto.lead_id,
      prospecto_id: prospecto.id,
      cotizacion_id: cotizacionId,
      promocion_id: promocionPrincipal,
      fecha_inscripcion: aFecha(hoy),
      fecha_inicio: aFecha(fechaInicio),
      precio_inscripcion_aplicado: aTexto(precio.costoInscripcion),
      precio_mensualidad_aplicado: aTexto(precio.costoMensualidad),
      descuento_inscripcion_aplicado: aTexto(r.inscripcion.descuentoAhora),
      descuento_mensualidad_aplicado: aTexto(r.mensualidad.descuentoAhora),
      meses_gratis_aplicados: r.mesesGratisAhora,
      meses_pagados_por_adelantado: meses,
      dia_corte_pago: diaCorte,
      creado_por_usuario_id: ctx.usuarioId,
    }),
    select: { id: true },
  });

  const aplicaciones: InscripcionCreada["aplicaciones"] = [];
  for (const l of r.lineas) {
    const estatus = l.estado === "pendiente" ? ("pendiente" as const) : ("entregado" as const);
    const a = await tx.promocion_aplicacion.create({
      data: altaConAlcance({
        inscripcion_id: fila.id,
        promocion_id: l.promocionId,
        beneficio_id: l.beneficioId,
        estatus,
        ...(estatus === "entregado" ? { fecha_entrega: ctx.ahora } : {}),
        autorizado_por_id: ctx.usuarioId,
        descuento: aTexto(l.descuento),
        meses_gratis: l.meses,
      }),
      select: { id: true },
    });
    aplicaciones.push({ id: a.id, beneficioId: l.beneficioId, promocionId: l.promocionId, estatus });
  }

  if (cotizacionId) await tx.cotizacion.updateMany({ where: { id: cotizacionId, estatus: "vigente" }, data: { estatus: "aceptada" } });
  if (prospecto.lead_id) await moverLeadAEtapa(tx, prospecto.lead_id, "inscrito", { motivo: "inscripcion", ahora: ctx.ahora });
  if (alumno.estatus !== "activo") await tx.alumno.updateMany({ where: { id: alumno.id }, data: { estatus: "activo" } });
  // La bienvenida (F7): una ejecución del motor por automatización aplicable, en esta misma transacción.
  await programarBienvenida(tx, { inscripcionId: fila.id, verticalId: programa.vertical_id, sucursalId: programa.sucursal_id, zonaHoraria: programa.sucursal.zona_horaria, ahora: ctx.ahora });

  // H1: el cargo de inscripción y la primera mensualidad, en esta misma transacción (con los descuentos de las promociones inmediatas ya congelados).
  const cargos = await crearCargosAlInscribir(
    tx,
    { ahora: ctx.ahora, usuarioId: ctx.usuarioId },
    {
      inscripcionId: fila.id,
      alumnoId: alumno.id,
      sucursalId: programa.sucursal_id,
      tutorId: tutorDePago,
      fechaInscripcion: hoy,
      fechaInicio,
      diaCorte,
      precioInscripcion: precio.costoInscripcion,
      precioMensualidad: precio.costoMensualidad,
      descuentoInscripcion: r.inscripcion.descuentoAhora,
      descuentoMensualidad: r.mensualidad.descuentoAhora,
      mesesGratis: r.mesesGratisAhora,
      mesesPagadosPorAdelantado: meses,
    },
  );

  return {
    ok: true,
    inscripcion: {
      id: fila.id,
      alumnoId: alumno.id,
      grupoId: grupo.id,
      programaId: programa.id,
      leadId: prospecto.lead_id,
      prospectoId: prospecto.id,
      cotizacionId,
      promocionId: promocionPrincipal,
      fechaInscripcion: hoy,
      fechaInicio,
      diaCortePago: diaCorte,
      precioInscripcion: aTexto(precio.costoInscripcion),
      precioMensualidad: aTexto(precio.costoMensualidad),
      descuentoInscripcion: aTexto(r.inscripcion.descuentoAhora),
      descuentoMensualidad: aTexto(r.mensualidad.descuentoAhora),
      mesesGratis: r.mesesGratisAhora,
      mesesPagadosPorAdelantado: meses,
      aplicaciones,
      cargos,
      listaDeEspera: { grupoId: grupo.id, prospectoId: prospecto.id },
    },
  };
}
