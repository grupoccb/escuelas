import assert from "node:assert/strict";
import { test } from "node:test";
import type { EjecutivoDelTablero, EtapaDelEmbudo, FilaDeFuente, PuntoMensual, ReporteDeEmbudo, ReporteDeEvolucion, ReporteDeFuentes } from "../../api/tipos.ts";
import { asistenciaDeClases, cierreDeClases, fraseDeClases, fraseDeFuentes, fraseDeTendencia, fraseDelEmbudo, frasesDelHeroe, indicadoresDelHeroe, mayorCaidaDelEmbudo, titularDelHeroe } from "./narrativa.ts";
import type { FilaDeClases } from "./tipos.ts";

const punto = (mes: string, altas: number, bajas: number, activos: number, ingreso = "1000.00"): PuntoMensual => ({ mes, altas, bajas, activos, inscripciones_activas: activos, ingreso_mensual_recurrente: ingreso });
const evolucion = (meses: PuntoMensual[]): ReporteDeEvolucion => ({ mes: meses[meses.length - 1]?.mes ?? "2026-09", hasta: "2026-09-30", meses, cohortes: [], promedio: [] });

const etapa = (nombre: string, orden: number, alcanzaron: number, caida: number, mayor = false): EtapaDelEmbudo => ({
  etapa: { id: `e${orden}`, nombre, tipo_sistema: null, es_ganado: false },
  orden,
  alcanzaron,
  porcentaje: "50.0",
  caida,
  caida_porcentaje: "10.0",
  es_mayor_caida: mayor,
});
const embudo = (extra: Partial<ReporteDeEmbudo> = {}): ReporteDeEmbudo => ({
  desde: null,
  hasta: null,
  llegaron: 236,
  etapas: [etapa("Llegaron", 1, 236, 0), etapa("Contactados", 2, 189, 47), etapa("Clase muestra", 3, 104, 85, true), etapa("Inscritos", 4, 41, 63)],
  inscritos: 41,
  conversion: "17.4",
  perdidos: { total: 100, por_motivo: [{ motivo: { id: "m1", nombre: "No contestó" }, leads: 41 }, { motivo: { id: "m2", nombre: "Horario" }, leads: 29 }, { motivo: null, leads: 30 }] },
  ...extra,
});

const ejecutivo = (extra: Partial<EjecutivoDelTablero> = {}): EjecutivoDelTablero => ({
  mes: "2026-09",
  activos: { total_alumnos: 312, total_inscripciones: 330, por_vertical_y_sucursal: [] },
  altas_del_mes: 41,
  bajas_del_mes: 17,
  base_al_inicio_del_mes: 288,
  desercion: "5.9",
  desercion_texto: "5.9 %",
  ingreso_mensual_recurrente: "220700.00",
  cartera_vencida: { total: "18650.00", antiguedad: { de_0_a_30: "10900.00", de_31_a_60: "4350.00", de_61_a_90: "2100.00", mas_de_90: "1300.00" }, familias: 25, familias_por_tramo: { de_0_a_30: 14, de_31_a_60: 6, de_61_a_90: 3, mas_de_90: 2 } },
  ocupacion_por_grupo: [],
  mapa_ocupacion: [],
  bajas_por_motivo: [{ motivo: { id: "b1", nombre: "Horario" }, bajas: 8 }],
  comparativo: [],
  ...extra,
});

const grupoLleno = (nombre: string) => ({ grupo: { id: nombre, nombre }, programa: "Programa", vertical: { id: "v", nombre: "V" }, sucursal: { id: "s", nombre: "S" }, ocupados: 20, cupo_maximo: 20, ocupacion: "100.0", estado: "a_reventar" as const, horarios: [], horario_texto: "lunes y miércoles de 16:00 a 17:00" });

const MESES_DE_LA_SERIE = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"] as const;
/** Doce meses: octubre con 24 altas y 9 bajas, noviembre con 30 bajas (el mes con más), septiembre con 41 altas (el mes con más) y 17 bajas. */
const doce = (): PuntoMensual[] =>
  MESES_DE_LA_SERIE.map((mes, i) => {
    if (i === 0) return punto(mes, 24, 9, 251, "177500.00");
    if (i === 1) return punto(mes, 10, 30, 240);
    if (i === 11) return punto(mes, 41, 17, 312, "220700.00");
    return punto(mes, 10, 10, 260, "180000.00");
  });

test("el titular dice cuántos activos hay y cuánto cambió frente al mes anterior", () => {
  assert.equal(titularDelHeroe(evolucion([punto("2026-08", 1, 1, 288), punto("2026-09", 1, 1, 312)]), null), "312 alumnos activos, 24 más que en agosto");
  assert.equal(titularDelHeroe(evolucion([punto("2026-08", 1, 1, 300), punto("2026-09", 1, 1, 296)]), null), "296 alumnos activos, 4 menos que en agosto");
  assert.equal(titularDelHeroe(evolucion([punto("2026-08", 1, 1, 300), punto("2026-09", 1, 1, 300)]), null), "300 alumnos activos, los mismos que en agosto");
  assert.equal(titularDelHeroe(evolucion([punto("2026-08", 1, 1, 0), punto("2026-09", 1, 1, 1)]), null), "1 alumno activo, 1 más que en agosto");
  assert.equal(titularDelHeroe(evolucion([punto("2026-01", 0, 0, 5), punto("2026-02", 0, 0, 5)]), null), "5 alumnos activos, los mismos que en enero");
  assert.equal(titularDelHeroe(null, ejecutivo()), "312 alumnos activos", "sin la serie, lo de hoy");
  assert.equal(titularDelHeroe(null, null), null);
});

test("las tres frases salen de los datos y se omiten cuando falta el dato", () => {
  const todas = frasesDelHeroe({ evolucion: evolucion(doce()), ejecutivo: ejecutivo({ ocupacion_por_grupo: [grupoLleno("Grupo A")] }), embudo: embudo() });
  assert.deepEqual(
    todas.map((f) => f.clave),
    ["mes", "embudo", "grupo"],
  );
  assert.equal(todas[0]!.texto, "Entraron 41 alumnos y se fueron 17: es el mes con más altas de los últimos 12.");
  assert.equal(todas[1]!.texto, "La mayor caída del embudo está entre «Contactados» y «Clase muestra»: 85 familias no avanzaron.");
  assert.equal(todas[2]!.texto, "«Grupo A» está a reventar (20 de 20, lunes y miércoles de 16:00 a 17:00): conviene abrir otro grupo.");
  assert.deepEqual(frasesDelHeroe({ evolucion: null, ejecutivo: null, embudo: null }), []);
  const sinEmbudo = frasesDelHeroe({ evolucion: evolucion(doce()), ejecutivo: ejecutivo(), embudo: null });
  assert.deepEqual(
    sinEmbudo.map((f) => f.clave),
    ["mes"],
  );
  const varios = frasesDelHeroe({ evolucion: null, ejecutivo: ejecutivo({ ocupacion_por_grupo: [grupoLleno("Uno"), grupoLleno("Dos")] }), embudo: null });
  assert.match(varios.find((f) => f.clave === "grupo")!.texto, /^2 grupos están a reventar; el más lleno es «Uno»/);
  assert.match(frasesDelHeroe({ evolucion: null, ejecutivo: ejecutivo({ altas_del_mes: 1, bajas_del_mes: 1 }), embudo: null })[0]!.texto, /^Entraron 1 alumno y se fue 1 en el mes\.$/);
});

test("el mes no es «el mejor» si otro tuvo más altas, y sin altas nunca lo es", () => {
  const meses = doce();
  meses[3] = punto("2026-01", 90, 1, 270);
  assert.equal(frasesDelHeroe({ evolucion: evolucion(meses), ejecutivo: null, embudo: null })[0]!.texto, "Entraron 41 alumnos y se fueron 17.");
  const sinAltas = [punto("2026-08", 0, 0, 5), punto("2026-09", 0, 2, 3)];
  assert.equal(frasesDelHeroe({ evolucion: evolucion(sinAltas), ejecutivo: null, embudo: null })[0]!.texto, "Entraron 0 alumnos y se fueron 2.");
});

test("la mayor caída necesita una etapa anterior y un empate no inventa caída", () => {
  assert.deepEqual(mayorCaidaDelEmbudo(embudo()), { de: "Contactados", a: "Clase muestra", caida: 85 });
  assert.equal(mayorCaidaDelEmbudo(embudo({ etapas: [etapa("Llegaron", 1, 5, 0, true)] })), null, "la primera no tiene etapa anterior");
  assert.equal(mayorCaidaDelEmbudo(embudo({ etapas: [etapa("A", 1, 5, 0), etapa("B", 2, 5, 0)] })), null, "sin caída marcada");
  assert.equal(mayorCaidaDelEmbudo(null), null);
});

test("los seis indicadores del héroe y lo que se omite sin datos", () => {
  const meses = [punto("2026-08", 1, 1, 288, "200000.00"), punto("2026-09", 41, 17, 312, "220700.00")];
  const todos = indicadoresDelHeroe({ evolucion: evolucion(meses), ejecutivo: ejecutivo(), embudo: embudo() });
  assert.deepEqual(
    todos.map((i) => i.clave),
    ["ingreso", "desercion", "altas", "bajas", "conversion", "cartera"],
  );
  const por = Object.fromEntries(todos.map((i) => [i.clave, i]));
  assert.equal(por["ingreso"]!.valor, "$220,700.00");
  assert.equal(por["ingreso"]!.nota, "+10.4 % frente a agosto");
  assert.equal(por["ingreso"]!.tono, "bien");
  assert.equal(por["desercion"]!.valor, "5.9 %");
  assert.equal(por["desercion"]!.nota, "sobre 288 al inicio del mes");
  assert.equal(por["altas"]!.nota, "236 leads llegaron");
  assert.equal(por["bajas"]!.nota, "motivo más común: Horario");
  assert.equal(por["conversion"]!.valor, "17.4 %");
  assert.equal(por["cartera"]!.valor, "$18,650.00");
  assert.equal(por["cartera"]!.nota, "25 familias con atraso");
  assert.equal(por["cartera"]!.tono, "alerta");
  assert.deepEqual(indicadoresDelHeroe({ evolucion: null, ejecutivo: null, embudo: null }), []);
  const sinEmbudo = indicadoresDelHeroe({ evolucion: null, ejecutivo: ejecutivo(), embudo: null });
  assert.equal(sinEmbudo.some((i) => i.clave === "conversion"), false);
  assert.equal(sinEmbudo.find((i) => i.clave === "altas")!.nota, null);
  assert.equal(sinEmbudo.find((i) => i.clave === "ingreso")!.nota, null, "sin la serie no hay cambio que decir");
});

test("el ingreso que baja no se pinta de bien; la cartera en cero no es alerta; sin bajas no se dice el motivo", () => {
  const meses = [punto("2026-08", 1, 1, 288, "220700.00"), punto("2026-09", 1, 1, 312, "200000.00")];
  const i = indicadoresDelHeroe({ evolucion: evolucion(meses), ejecutivo: ejecutivo({ cartera_vencida: { ...ejecutivo().cartera_vencida, total: "0.00", familias: 0 }, bajas_del_mes: 0 }), embudo: null });
  const por = Object.fromEntries(i.map((x) => [x.clave, x]));
  assert.equal(por["ingreso"]!.nota, "-9.4 % frente a agosto");
  assert.equal(por["ingreso"]!.tono, "normal");
  assert.equal(por["cartera"]!.tono, "normal");
  assert.equal(por["cartera"]!.nota, "sin familias con atraso");
  assert.equal(por["bajas"]!.nota, null);
});

test("01: la frase del embudo", () => {
  assert.equal(fraseDelEmbudo(embudo()), "De 236 familias que escribieron, 41 se inscribieron. El punto más débil es entre «Contactados» y «Clase muestra»: ahí se quedan 85. «No contestó» y «Horario» explican el 70 % de las pérdidas.");
  assert.equal(fraseDelEmbudo(embudo({ llegaron: 0 })), null);
  assert.equal(fraseDelEmbudo(embudo({ llegaron: 1, inscritos: 1, etapas: [], perdidos: { total: 0, por_motivo: [] } })), "De 1 familia que escribió, 1 se inscribió.");
});

const fila = (extra: Partial<FilaDeFuente>): FilaDeFuente => ({ clave: "k", fuente: "facebook", campana: null, leads: 10, inscritos: 2, conversion: "20.0", gasto: "0.00", costo_por_alumno: null, es_mas_barato: false, ...extra });
const fuentes = (filas: FilaDeFuente[], incluye = true): ReporteDeFuentes => ({ desde: null, hasta: null, incluye_gasto: incluye, filas, total: { leads: 0, inscritos: 0, conversion: null, gasto: null, inscritos_con_gasto: null, inscritos_sin_costo: null, costo_por_alumno: null } });
const nombreDeFuente = (c: string): string => (c === "referido" ? "Referido" : "Facebook");

test("02: la frase de fuentes dice quién convierte mejor y, con permiso de costos, quién es más barato", () => {
  const filas = [fila({ clave: "a", campana: { id: "1", nombre: "Regreso" }, conversion: "16.7", gasto: "6840.00", costo_por_alumno: "570.00", es_mas_barato: true }), fila({ clave: "b", fuente: "referido", conversion: "30.8" })];
  assert.equal(fraseDeFuentes(fuentes(filas), nombreDeFuente), "Referido convierte 31 % de sus leads y no tiene gasto capturado. De lo que tiene gasto, «Regreso» es lo más barato por alumno ($570.00).");
  assert.equal(fraseDeFuentes(fuentes(filas, false), nombreDeFuente), "Referido convierte 31 % de sus leads.", "sin permiso de costos no se dice nada de dinero");
  assert.equal(fraseDeFuentes(fuentes([]), nombreDeFuente), null);
  assert.equal(fraseDeFuentes(fuentes([fila({ leads: 0, conversion: null })]), nombreDeFuente), null);
});

const clases = (extra: Partial<FilaDeClases>): FilaDeClases => ({ clave: "x", nombre: "X", agendadas: 0, asistidas: 0, no_asistidas: 0, canceladas: 0, pendientes: 0, inscritas: 0, inscritas_a_mano: 0, conversion: null, ...extra });

test("03: asistencia entre las clases que ya pasaron y cierre entre las asistidas", () => {
  assert.equal(asistenciaDeClases(clases({ agendadas: 50, asistidas: 30, pendientes: 10, canceladas: 0 })), "75");
  assert.equal(asistenciaDeClases(clases({ agendadas: 10, asistidas: 0, pendientes: 10 })), null, "todo pendiente: aún no hay con qué dividir");
  assert.equal(cierreDeClases(clases({ asistidas: 30, inscritas: 12 })), "40");
  assert.equal(cierreDeClases(clases({ asistidas: 0 })), null);
  const total = clases({ agendadas: 100, asistidas: 80, inscritas: 40 });
  const frase = fraseDeClases(total, [clases({ nombre: "Uno", asistidas: 50, inscritas: 30 }), clases({ nombre: "Dos", asistidas: 30, inscritas: 10 })]);
  assert.equal(frase, "80 % de quienes agendan llega a su clase muestra y 50 % de ellos se inscribe. Uno es donde mejor cierra.");
  assert.equal(fraseDeClases(total, [clases({ nombre: "Uno", asistidas: 50, inscritas: 25 }), clases({ nombre: "Dos", asistidas: 30, inscritas: 15 })]), "80 % de quienes agendan llega a su clase muestra y 50 % de ellos se inscribe.", "un empate no elige");
  assert.equal(fraseDeClases(clases({}), []), null);
});

test("04: la frase de tendencia", () => {
  const frase = fraseDeTendencia(evolucion(doce()))!;
  assert.match(frase, /^En 12 meses los alumnos activos pasaron de 251 a 312\. Septiembre 2026 trajo 41 altas y 17 bajas\./);
  assert.match(frase, /El mes con más altas fue septiembre \(41\) y el de más bajas, noviembre \(30\)\./);
  assert.match(frase, /Pasa el cursor por un mes/);
  assert.equal(fraseDeTendencia(evolucion([])), null);
});
