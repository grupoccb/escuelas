// Los textos que cuentan lo que dicen los números (titular y frases del héroe, frase de cada sección). Todo es texto fijo con huecos que llenan los datos: nada de modelos de lenguaje ni de
// palabras de una disciplina (invariante 10). Si falta un dato, la frase se omite en lugar de inventarlo. Lógica pura, con prueba en `narrativa.test.ts`.

import type { EjecutivoDelTablero, ReporteDeEmbudo, ReporteDeEvolucion, ReporteDeFuentes } from "../../api/tipos.ts";
import { cantidad } from "../../lib/cantidad.ts";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import { cambioPorcentual, decimasDe, etiquetaDeMes, indiceDelMaximo, mesAnterior, nombreDeMes, porcentajeEntero, redondeado } from "./graficas.ts";
import type { FilaDeClases } from "./tipos.ts";

/** `bien` (verde claro), `atencion` (ámbar) o `neutro`: el punto de color de la frase; el texto dice lo mismo, el color no es la única señal. */
export type TonoDeFrase = "bien" | "atencion" | "neutro";

export interface FraseDelHeroe {
  clave: string;
  texto: string;
  tono: TonoDeFrase;
}

export interface IndicadorDelHeroe {
  clave: string;
  prueba: string;
  etiqueta: string;
  valor: string;
  nota: string | null;
  /** `alerta` es el de la cartera con atraso (par de alerta y ícono); `bien` pinta la nota en verde claro. */
  tono: "normal" | "bien" | "alerta";
}

export interface DatosDelHeroe {
  evolucion: ReporteDeEvolucion | null;
  ejecutivo: EjecutivoDelTablero | null;
  embudo: ReporteDeEmbudo | null;
}

const ultimos = <T>(lista: readonly T[]): { actual: T | undefined; anterior: T | undefined } => ({ actual: lista[lista.length - 1], anterior: lista[lista.length - 2] });

/** «312 alumnos activos, 24 más que en agosto». Sin la serie de 12 meses, solo lo de hoy; sin ninguno de los dos, null. */
export function titularDelHeroe(evolucion: ReporteDeEvolucion | null, ejecutivo: EjecutivoDelTablero | null): string | null {
  const { actual, anterior } = ultimos(evolucion?.meses ?? []);
  if (actual) {
    const activos = cantidad(actual.activos, "alumno activo", "alumnos activos");
    if (!anterior) return activos;
    const neto = actual.activos - anterior.activos;
    const mes = nombreDeMes(mesAnterior(actual.mes));
    if (neto === 0) return `${activos}, los mismos que en ${mes}`;
    return `${activos}, ${neto > 0 ? `${neto} más` : `${Math.abs(neto)} menos`} que en ${mes}`;
  }
  if (ejecutivo) return cantidad(ejecutivo.activos.total_alumnos, "alumno activo", "alumnos activos");
  return null;
}

/** Las etapas consecutivas con la mayor caída: [la que no avanzó, la siguiente, cuántos]. */
export function mayorCaidaDelEmbudo(embudo: ReporteDeEmbudo | null): { de: string; a: string; caida: number } | null {
  if (!embudo) return null;
  const i = embudo.etapas.findIndex((e) => e.es_mayor_caida);
  const etapa = embudo.etapas[i];
  const previa = embudo.etapas[i - 1];
  if (i < 1 || !etapa || !previa) return null;
  return { de: previa.etapa.nombre, a: etapa.etapa.nombre, caida: etapa.caida };
}

/** Tres frases, a lo más: el mes en altas y bajas, la mayor caída del embudo y el grupo que se llena. Las que no tengan dato no salen. */
export function frasesDelHeroe({ evolucion, ejecutivo, embudo }: DatosDelHeroe): FraseDelHeroe[] {
  const frases: FraseDelHeroe[] = [];
  const { actual } = ultimos(evolucion?.meses ?? []);
  if (actual && evolucion) {
    const altas = actual.altas;
    const masAltas = indiceDelMaximo(evolucion.meses, "altas");
    const esElMejor = altas > 0 && evolucion.meses[masAltas]?.mes === actual.mes;
    frases.push({
      clave: "mes",
      texto: `Entraron ${cantidad(altas, "alumno", "alumnos")} y se ${actual.bajas === 1 ? "fue" : "fueron"} ${actual.bajas}${esElMejor ? `: es el mes con más altas de los últimos ${evolucion.meses.length}.` : "."}`,
      tono: actual.altas >= actual.bajas ? "bien" : "atencion",
    });
  } else if (ejecutivo) {
    frases.push({ clave: "mes", texto: `Entraron ${cantidad(ejecutivo.altas_del_mes, "alumno", "alumnos")} y se ${ejecutivo.bajas_del_mes === 1 ? "fue" : "fueron"} ${ejecutivo.bajas_del_mes} en el mes.`, tono: ejecutivo.altas_del_mes >= ejecutivo.bajas_del_mes ? "bien" : "atencion" });
  }
  const caida = mayorCaidaDelEmbudo(embudo);
  if (caida) frases.push({ clave: "embudo", texto: `La mayor caída del embudo está entre «${caida.de}» y «${caida.a}»: ${cantidad(caida.caida, "familia no avanzó", "familias no avanzaron")}.`, tono: "atencion" });
  const llenos = (ejecutivo?.ocupacion_por_grupo ?? []).filter((g) => g.estado === "a_reventar");
  const primero = llenos[0];
  if (primero) {
    const donde = primero.horario_texto ? `, ${primero.horario_texto}` : "";
    frases.push({
      clave: "grupo",
      texto: llenos.length === 1 ? `«${primero.grupo.nombre}» está a reventar (${primero.ocupados} de ${primero.cupo_maximo}${donde}): conviene abrir otro grupo.` : `${llenos.length} grupos están a reventar; el más lleno es «${primero.grupo.nombre}» (${primero.ocupados} de ${primero.cupo_maximo}${donde}): conviene abrir otro grupo.`,
      tono: "neutro",
    });
  }
  return frases;
}

/** Los seis indicadores del héroe. Los que no tienen dato no salen (el héroe se acomoda). */
export function indicadoresDelHeroe({ evolucion, ejecutivo, embudo }: DatosDelHeroe): IndicadorDelHeroe[] {
  const salida: IndicadorDelHeroe[] = [];
  const { actual, anterior } = ultimos(evolucion?.meses ?? []);
  const ingreso = actual?.ingreso_mensual_recurrente ?? ejecutivo?.ingreso_mensual_recurrente ?? null;
  if (ingreso !== null) {
    const cambio = actual && anterior ? cambioPorcentual(aCentavos(actual.ingreso_mensual_recurrente), aCentavos(anterior.ingreso_mensual_recurrente)) : null;
    salida.push({
      clave: "ingreso",
      prueba: "ind-ingreso",
      etiqueta: "Ingreso mensual recurrente",
      valor: formatear(ingreso),
      nota: cambio !== null && actual ? `${cambio} % frente a ${nombreDeMes(mesAnterior(actual.mes))}` : null,
      tono: cambio !== null && !cambio.startsWith("-") ? "bien" : "normal",
    });
  }
  if (ejecutivo) {
    salida.push({ clave: "desercion", prueba: "ind-desercion", etiqueta: "Deserción", valor: ejecutivo.desercion_texto, nota: `sobre ${ejecutivo.base_al_inicio_del_mes} al inicio del mes`, tono: "normal" });
    salida.push({ clave: "altas", prueba: "ind-altas", etiqueta: "Altas del mes", valor: String(ejecutivo.altas_del_mes), nota: embudo ? `${cantidad(embudo.llegaron, "lead llegó", "leads llegaron")}` : null, tono: "bien" });
    const motivo = ejecutivo.bajas_por_motivo.find((m) => m.motivo !== null)?.motivo?.nombre ?? null;
    salida.push({ clave: "bajas", prueba: "ind-bajas", etiqueta: "Bajas del mes", valor: String(ejecutivo.bajas_del_mes), nota: motivo !== null && ejecutivo.bajas_del_mes > 0 ? `motivo más común: ${motivo}` : null, tono: "normal" });
  }
  if (embudo) {
    salida.push({ clave: "conversion", prueba: "ind-conversion-embudo", etiqueta: "Conversión del embudo", valor: embudo.conversion === null ? "—" : `${embudo.conversion} %`, nota: "de lead a alumno inscrito", tono: "normal" });
  }
  if (ejecutivo) {
    const total = ejecutivo.cartera_vencida.total;
    const conAtraso = aCentavos(total) > 0n;
    salida.push({ clave: "cartera", prueba: "ind-cartera", etiqueta: "Cartera vencida", valor: formatear(total), nota: conAtraso ? `${cantidad(ejecutivo.cartera_vencida.familias, "familia con atraso", "familias con atraso")}` : "sin familias con atraso", tono: conAtraso ? "alerta" : "normal" });
  }
  return salida;
}

// ── Frases de cada sección ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** 01: de cuántos llegaron cuántos se inscribieron, donde está el punto débil y qué motivos explican más pérdidas. null si nadie llegó. */
export function fraseDelEmbudo(embudo: ReporteDeEmbudo): string | null {
  if (embudo.llegaron === 0) return null;
  const partes = [`De ${cantidad(embudo.llegaron, "familia que escribió", "familias que escribieron")}, ${embudo.inscritos} se ${embudo.inscritos === 1 ? "inscribió" : "inscribieron"}.`];
  const caida = mayorCaidaDelEmbudo(embudo);
  if (caida) partes.push(`El punto más débil es entre «${caida.de}» y «${caida.a}»: ahí se ${caida.caida === 1 ? "queda" : "quedan"} ${caida.caida}.`);
  const motivos = embudo.perdidos.por_motivo.filter((m) => m.motivo !== null);
  const [uno, dos] = motivos;
  if (uno && dos && embudo.perdidos.total > 0) {
    const parte = porcentajeEntero(uno.leads + dos.leads, embudo.perdidos.total);
    if (parte !== null) partes.push(`«${uno.motivo!.nombre}» y «${dos.motivo!.nombre}» explican el ${parte} % de las pérdidas.`);
  }
  return partes.join(" ");
}

/** 02: qué fuente convierte mejor y, con permiso de costos, cuál es la más barata por alumno. null si no hay filas con leads. */
export function fraseDeFuentes(fuentes: ReporteDeFuentes, nombreDeFuente: (clave: string) => string): string | null {
  const conLeads = fuentes.filas.filter((f) => f.leads > 0 && decimasDe(f.conversion) !== null);
  if (conLeads.length === 0) return null;
  const mejor = conLeads.reduce((m, f) => ((decimasDe(f.conversion) ?? 0) > (decimasDe(m.conversion) ?? 0) ? f : m));
  const nombre = (f: typeof mejor): string => (f.campana ? `«${f.campana.nombre}»` : nombreDeFuente(f.fuente));
  const partes: string[] = [];
  if ((decimasDe(mejor.conversion) ?? 0) > 0) partes.push(`${nombre(mejor)} convierte ${redondeado(mejor.conversion)} % de sus leads${fuentes.incluye_gasto && mejor.gasto !== null && aCentavos(mejor.gasto) === 0n ? " y no tiene gasto capturado" : ""}.`);
  if (fuentes.incluye_gasto) {
    const barata = fuentes.filas.find((f) => f.es_mas_barato && f.costo_por_alumno !== null);
    if (barata) partes.push(`De lo que tiene gasto, ${nombre(barata)} es lo más barato por alumno (${formatear(barata.costo_por_alumno)}).`);
  }
  return partes.length > 0 ? partes.join(" ") : null;
}

/** «Llegaron a su clase»: asistidas entre las que ya pasaron (agendadas sin las pendientes ni las canceladas). */
export function asistenciaDeClases(f: Pick<FilaDeClases, "agendadas" | "asistidas" | "pendientes" | "canceladas">): string | null {
  return porcentajeEntero(f.asistidas, f.agendadas - f.pendientes - f.canceladas);
}

/** «De ellos se inscribió»: inscritas entre asistidas. */
export function cierreDeClases(f: Pick<FilaDeClases, "asistidas" | "inscritas">): string | null {
  return porcentajeEntero(f.inscritas, f.asistidas);
}

/** 03: asistencia y cierre del conjunto y la disciplina que mejor cierra (si hay dos o más con asistidas). null si no hubo clases. */
export function fraseDeClases(total: FilaDeClases, porDisciplina: readonly FilaDeClases[]): string | null {
  const asistencia = asistenciaDeClases(total);
  if (asistencia === null) return null;
  const cierre = cierreDeClases(total);
  const partes = [`${asistencia} % de quienes agendan llega a su clase muestra${cierre !== null ? ` y ${cierre} % de ellos se inscribe` : ""}.`];
  // Se compara con enteros (a/b > c/d ⇔ a·d > c·b), sin flotantes.
  const conCierre = porDisciplina.filter((f) => f.asistidas > 0);
  if (conCierre.length >= 2) {
    const ordenadas = [...conCierre].sort((a, b) => b.inscritas * a.asistidas - a.inscritas * b.asistidas);
    const mejor = ordenadas[0]!;
    const segunda = ordenadas[1]!;
    if (mejor.inscritas * segunda.asistidas > segunda.inscritas * mejor.asistidas) partes.push(`${mejor.nombre} es donde mejor cierra.`);
  }
  return partes.join(" ");
}

/** 04: de donde a donde pasaron los activos, qué trajo el mes y cuáles fueron los meses con más altas y más bajas. */
export function fraseDeTendencia(evolucion: ReporteDeEvolucion): string | null {
  const meses = evolucion.meses;
  const primero = meses[0];
  const ultimo = meses[meses.length - 1];
  if (!primero || !ultimo) return null;
  const partes = [`En ${meses.length} meses los alumnos activos pasaron de ${primero.activos} a ${ultimo.activos}.`];
  partes.push(`${etiquetaDeMes(ultimo.mes)} trajo ${cantidad(ultimo.altas, "alta", "altas")} y ${cantidad(ultimo.bajas, "baja", "bajas")}.`);
  const a = indiceDelMaximo(meses, "altas");
  const b = indiceDelMaximo(meses, "bajas");
  if (a >= 0 && b >= 0) partes.push(`El mes con más altas fue ${nombreDeMes(meses[a]!.mes)} (${meses[a]!.altas}) y el de más bajas, ${nombreDeMes(meses[b]!.mes)} (${meses[b]!.bajas}).`);
  partes.push("Pasa el cursor por un mes, o enfócalo con el teclado, para ver sus cifras.");
  return partes.join(" ");
}
