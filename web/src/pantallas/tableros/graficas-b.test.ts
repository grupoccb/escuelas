import assert from "node:assert/strict";
import { test } from "node:test";
import type { CeldaDeMapaDeOcupacion, FilaDeComparativo, OcupacionDeGrupo, ReporteDeEvolucion } from "../../api/tipos.ts";
import {
  cambioPorcentual,
  decimasDe,
  decimasDeRazon,
  diasDelMapa,
  filaDePromedio,
  filasDelMapa,
  filasDeRetencion,
  fraseDeComparativo,
  fraseDeIngreso,
  fraseDeMapa,
  fraseDeRetencion,
  geometriaDeArea,
  gruposDelEstado,
  nivelDeCalor,
  nivelDeDesercion,
  nombreDeCohorte,
  pesos,
  pesosEnteros,
  porcentajeEntero,
  tarjetasComparativas,
  textoDeCambio,
  tramosDeCartera,
} from "./graficas-b.ts";

test("los porcentajes se leen como décimas enteras y se redondean al entero más cercano (la mitad, hacia arriba)", () => {
  assert.equal(decimasDe("42.9"), 429n);
  assert.equal(decimasDe("100.0"), 1000n);
  assert.equal(decimasDe("7"), 70n);
  assert.equal(decimasDe("87.55"), 876n);
  assert.equal(decimasDe(null), null);
  assert.equal(decimasDe("abc"), null);
  assert.equal(porcentajeEntero("94.4"), 94n);
  assert.equal(porcentajeEntero("94.5"), 95n);
  assert.equal(porcentajeEntero("0.0"), 0n);
});

test("la escala de calor del README: <40, 40–59, 60–79, 80–94 y 95 o más", () => {
  assert.deepEqual([0n, 39n, 40n, 59n, 60n, 79n, 80n, 94n, 95n, 100n].map(nivelDeCalor), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("lo que se escribe en la celda y su color nunca discrepan: 94.6 % se escribe 95% y va en el nivel más alto", () => {
  const filas = filasDelMapa([{ dia_semana: 1, hora: 16, grupos: 1, ocupados: 9, cupo_maximo: 10, ocupacion: "94.6", estado: "a_reventar" }]);
  assert.equal(filas[0]!.celdas[0]!.texto, "95%");
  assert.equal(filas[0]!.celdas[0]!.nivel, 5);
});

function evolucion(): Pick<ReporteDeEvolucion, "cohortes" | "meses"> {
  const seg = (valores: (number | null)[], altas: number) =>
    [1, 2, 3, 4, 5, 6].map((k) => {
      const siguen = valores[k - 1] ?? null;
      // Con 10 inscritos cada uno vale 10 %; con 4, 25 %.
      return { mes_n: k, siguen, porcentaje: siguen === null || altas === 0 ? null : `${(BigInt(siguen) * 1000n) / BigInt(altas) / 10n}.0` };
    });
  return {
    meses: [{ mes: "2026-09", altas: 0, bajas: 0, activos: 0, inscripciones_activas: 0, ingreso_mensual_recurrente: "0.00" }],
    cohortes: [
      { mes: "2025-12", altas: 10, seguimiento: seg([9, 8, 8, 7, 7, 6], 10) },
      { mes: "2026-08", altas: 0, seguimiento: seg([0, null, null, null, null, null], 0) },
      { mes: "2026-09", altas: 4, seguimiento: seg([null, null, null, null, null, null], 4) },
    ],
  };
}

test("las cohortes: dato con su porcentaje, 'todavía no pasa' y 'sin inscripciones'", () => {
  const filas = filasDeRetencion(evolucion());
  assert.equal(filas[0]!.nombre, "Diciembre 2025", "otro año: lleva el año");
  assert.equal(filas[1]!.nombre, "Agosto", "el año del último mes: sin año");
  assert.deepEqual(filas[0]!.celdas.map((c) => c.texto), ["90%", "80%", "80%", "70%", "70%", "60%"]);
  assert.deepEqual(filas[0]!.celdas.map((c) => c.nivel), [4, 4, 4, 3, 3, 3]);
  assert.equal(filas[0]!.celdas[0]!.titulo, "Diciembre 2025: 90 % sigue al mes 1 (9 de 10)");
  assert.equal(filas[1]!.celdas[0]!.estado, "sin_altas");
  assert.equal(filas[1]!.celdas[0]!.texto, "—");
  assert.equal(filas[1]!.celdas[1]!.estado, "futuro");
  assert.equal(filas[1]!.celdas[1]!.texto, "");
  assert.equal(filas[2]!.celdas[0]!.estado, "futuro");
});

test("el nombre de una cohorte lleva el año solo si no es el del último mes", () => {
  assert.equal(nombreDeCohorte("2026-03", "2026-09"), "Marzo");
  assert.equal(nombreDeCohorte("2025-11", "2026-09"), "Noviembre 2025");
});

test("la fila de promedio solo escribe los meses que ya se midieron", () => {
  const celdas = filaDePromedio([
    { mes_n: 1, siguen: 9, altas: 10, porcentaje: "90.0" },
    { mes_n: 2, siguen: 0, altas: 0, porcentaje: null },
  ]);
  assert.equal(celdas[0]!.texto, "90%");
  assert.equal(celdas[1]!.estado, "futuro");
  assert.equal(celdas[5]!.estado, "futuro", "un mes que el servidor no trae");
});

test("la frase de retención usa los meses 3 y 6 y señala el mes en que más se pierde", () => {
  const p = (k: number, porcentaje: string) => ({ mes_n: k, siguen: 1, altas: 1, porcentaje });
  assert.equal(
    fraseDeRetencion([p(1, "88.0"), p(2, "80.0"), p(3, "74.0"), p(4, "70.0"), p(5, "65.0"), p(6, "61.0")]),
    "De cada 10 alumnos que se inscriben, 7 siguen a los 3 meses y 6 a los 6. El primer mes es el más delicado: ahí se va 1 de cada 10.",
  );
  assert.equal(
    fraseDeRetencion([p(1, "95.0"), p(2, "70.0"), p(3, "68.0")]),
    "De cada 10 alumnos que se inscriben, 7 siguen a los 3 meses. El segundo mes es el más delicado: ahí se van 3 de cada 10.",
  );
  assert.equal(fraseDeRetencion([p(1, "92.0")]), "De cada 10 alumnos que se inscriben, 9 siguen al mes. El primer mes es el más delicado: ahí se va 1 de cada 10.");
  assert.equal(fraseDeRetencion([{ mes_n: 1, siguen: 0, altas: 0, porcentaje: null }]), null);
});

test("el cambio porcentual del ingreso se calcula con centavos enteros", () => {
  assert.equal(cambioPorcentual("220700.00", "203600.00"), "8.4");
  assert.equal(cambioPorcentual("90.00", "100.00"), "-10.0");
  assert.equal(cambioPorcentual("100.00", "100.00"), "0.0");
  assert.equal(cambioPorcentual("100.00", "0.00"), null);
  assert.equal(textoDeCambio("8.4"), "+8.4 %");
  assert.equal(textoDeCambio("-10.0"), "-10.0 %");
});

test("pesos: sin centavos si son cabales, con ellos si no; los ejes se redondean", () => {
  assert.equal(pesos("4350.00"), "$4,350");
  assert.equal(pesos("4350.50"), "$4,350.50");
  assert.equal(pesos(null), "—");
  assert.equal(pesosEnteros(22070050n), "$220,701");
  assert.equal(pesosEnteros(22070049n), "$220,700");
});

test("el área: un punto por mes centrado en su columna, la serie más alta arriba y una serie plana a media altura", () => {
  const g = geometriaDeArea([10000n, 20000n, 15000n])!;
  const pts = g.linea.split(" ").map((p) => p.split(","));
  assert.deepEqual(pts.map((p) => p[0]), ["200.00", "600.00", "1000.00"]);
  assert.deepEqual(pts.map((p) => p[1]), ["173.78", "18.12", "95.95"], "el mayor valor queda más arriba (y menor)");
  assert.equal(g.area.startsWith("M200.00,180.00 L200.00,"), true);
  assert.equal(g.area.endsWith("L1000.00,180.00 Z"), true);
  assert.deepEqual(g.ultimo.x, "1000.00");
  assert.equal(g.eje.minimo, 9600n);
  assert.equal(g.eje.maximo, 20200n);
  const plana = geometriaDeArea([0n, 0n, 0n])!;
  assert.equal(plana.linea, "200.00,105.00 600.00,105.00 1000.00,105.00");
  assert.equal(geometriaDeArea([]), null);
});

test("la cartera por tramos: cada tramo con su monto, sus familias y su lugar en la barra", () => {
  const t = tramosDeCartera({
    total: "1000.00",
    antiguedad: { de_0_a_30: "500.00", de_31_a_60: "250.00", de_61_a_90: "250.00", mas_de_90: "0.00" },
    familias: 5,
    familias_por_tramo: { de_0_a_30: 3, de_31_a_60: 1, de_61_a_90: 1, mas_de_90: 0 },
  });
  assert.deepEqual(t.map((x) => [x.nombre, x.texto, x.textoFamilias, x.x, x.ancho]), [
    ["1 a 30 días", "$500", "3 familias", "0.0", "50.0"],
    ["31 a 60 días", "$250", "1 familia", "50.0", "25.0"],
    ["61 a 90 días", "$250", "1 familia", "75.0", "25.0"],
    ["Más de 90 días", "$0", "sin familias", "100.0", "0.0"],
  ]);
  assert.equal(decimasDeRazon(1n, 3n), 333n);
  assert.equal(decimasDeRazon(5n, 0n), 0n);
});

test("la frase de ingreso y cartera", () => {
  const meses = [
    { mes: "2026-08", altas: 0, bajas: 0, activos: 0, inscripciones_activas: 0, ingreso_mensual_recurrente: "100.00" },
    { mes: "2026-09", altas: 0, bajas: 0, activos: 0, inscripciones_activas: 0, ingreso_mensual_recurrente: "104.10" },
  ];
  const cartera = { total: "1000.00", antiguedad: { de_0_a_30: "660.00", de_31_a_60: "340.00", de_61_a_90: "0.00", mas_de_90: "0.00" }, familias: 4, familias_por_tramo: { de_0_a_30: 3, de_31_a_60: 1, de_61_a_90: 0, mas_de_90: 0 } };
  assert.equal(fraseDeIngreso(meses, cartera), "El ingreso recurrente creció 4.1 % en septiembre. De lo vencido, 66 % tiene menos de 30 días: todavía se recupera con un recordatorio.");
  const baja = [{ ...meses[0]! }, { ...meses[1]!, ingreso_mensual_recurrente: "90.00" }];
  const sin = { ...cartera, total: "0.00", antiguedad: { de_0_a_30: "0.00", de_31_a_60: "0.00", de_61_a_90: "0.00", mas_de_90: "0.00" }, familias: 0 };
  assert.equal(fraseDeIngreso(baja, sin), "El ingreso recurrente bajó 10.0 % en septiembre. Nadie tiene saldo vencido.");
});

const celda = (dia_semana: number, hora: number, ocupacion: string, estado: CeldaDeMapaDeOcupacion["estado"], grupos = 1, ocupados = 5, cupo_maximo = 10): CeldaDeMapaDeOcupacion => ({ dia_semana, hora, grupos, ocupados, cupo_maximo, ocupacion, estado });

test("el mapa: lunes a sábado, solo las horas con clases, y las celdas vacías dicen 'sin clases'", () => {
  const celdas = [celda(1, 16, "96.0", "a_reventar", 2, 26, 27), celda(5, 17, "45.0", "vacio"), celda(6, 9, "70.0", "normal")];
  assert.deepEqual(diasDelMapa(celdas), [1, 2, 3, 4, 5, 6]);
  const filas = filasDelMapa(celdas);
  assert.deepEqual(filas.map((f) => f.etiqueta), ["9:00", "16:00", "17:00"]);
  assert.equal(filas[1]!.celdas.length, 6);
  const lunes16 = filas[1]!.celdas[0]!;
  assert.equal(lunes16.texto, "96%");
  assert.equal(lunes16.nivel, 5);
  assert.equal(lunes16.detalle, "2 grupos, 26 de 27 lugares");
  assert.equal(lunes16.titulo, "lunes 16:00: 96 % ocupado (2 grupos, 26 de 27 lugares)");
  const martes16 = filas[1]!.celdas[1]!;
  assert.equal(martes16.conClases, false);
  assert.equal(martes16.texto, "");
  assert.equal(martes16.titulo, "martes 16:00: sin clases");
});

test("el domingo solo sale si algún grupo empieza ese día, y va al final", () => {
  assert.deepEqual(diasDelMapa([celda(0, 10, "50.0", "normal")]), [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(filasDelMapa([celda(0, 10, "50.0", "normal")])[0]!.celdas.at(-1)!.titulo.startsWith("domingo"), true);
  assert.deepEqual(filasDelMapa([]), []);
});

test("la frase del mapa nombra lo más lleno y lo que más sobra", () => {
  const celdas = [celda(1, 16, "96.0", "a_reventar"), celda(3, 16, "98.0", "a_reventar"), celda(5, 17, "45.0", "vacio"), celda(6, 12, "31.0", "vacio"), celda(2, 10, "70.0", "normal")];
  assert.equal(
    fraseDeMapa(celdas),
    "Están a reventar: miércoles 16:00 (98 %), lunes 16:00 (96 %). Sobran lugares: sábado 12:00 (31 %), viernes 17:00 (45 %). Ahí conviene mover o promover grupos.",
  );
  assert.equal(fraseDeMapa([celda(2, 10, "70.0", "normal")]), "Ningún horario está a reventar ni con lugares de sobra.");
  assert.equal(fraseDeMapa([]), "Todavía no hay grupos con horario para dibujar el mapa.");
});

function grupo(id: string, nombre: string, ocupados: number, cupo: number, ocupacion: string, estado: OcupacionDeGrupo["estado"], horario = "lunes de 16:00 a 17:00"): OcupacionDeGrupo {
  return { grupo: { id, nombre }, programa: "P", vertical: { id: "v", nombre: "V" }, sucursal: { id: "s", nombre: "Sede" }, ocupados, cupo_maximo: cupo, ocupacion, estado, horarios: [], horario_texto: horario };
}

test("A reventar (los más llenos primero) y Con lugares (los más vacíos primero), con el tope y lo que queda fuera", () => {
  const lista = [grupo("1", "B", 14, 14, "100.0", "a_reventar"), grupo("2", "A", 14, 14, "100.0", "a_reventar"), grupo("3", "C", 13, 14, "92.9", "a_reventar"), grupo("4", "D", 6, 16, "37.5", "vacio"), grupo("5", "E", 2, 16, "12.5", "vacio", ""), grupo("6", "F", 8, 16, "50.0", "normal")];
  const llenos = gruposDelEstado(lista, "a_reventar", 2);
  assert.deepEqual(llenos.visibles.map((g) => g.nombre), ["A", "B"], "empate: por nombre");
  assert.equal(llenos.fuera, 1);
  assert.equal(llenos.visibles[0]!.cupo, "14 de 14");
  assert.equal(llenos.visibles[0]!.detalle, "lunes de 16:00 a 17:00 · Sede");
  const vacios = gruposDelEstado(lista, "vacio", 5);
  assert.deepEqual(vacios.visibles.map((g) => g.nombre), ["E", "D"]);
  assert.equal(vacios.visibles[0]!.detalle, "Sede", "sin horario: solo la sucursal");
  assert.equal(vacios.visibles[0]!.ocupacion, "13 %");
  assert.equal(vacios.fuera, 0);
});

function fila(vertical: string, sucursal: string, alumnos: number, ocupacion: string | null, desercion: string | null, ocupados = 0, cupo = 0): FilaDeComparativo {
  return {
    vertical: { id: `v-${vertical}`, nombre: vertical },
    sucursal: { id: `s-${sucursal}`, nombre: sucursal },
    alumnos,
    inscripciones: alumnos,
    ingreso_mensual_recurrente: `${alumnos * 650}.00`,
    ocupados,
    cupo_maximo: cupo,
    ocupacion,
    altas_del_mes: 2,
    bajas_del_mes: 1,
    base_al_inicio_del_mes: 20,
    desercion,
    desercion_texto: desercion === null ? "—" : `${desercion} %`,
  };
}

test("la deserción: 8 % o más alta, 6 % o más media, el resto baja; sin base no hay nivel", () => {
  assert.deepEqual(["9.4", "8.0", "7.9", "6.0", "5.9", "0.0", null].map(nivelDeDesercion), ["alta", "alta", "media", "media", "baja", "baja", null]);
});

test("las tarjetas del comparativo incluyen la pareja con grupos pero sin alumnos y la que no tiene grupos", () => {
  const t = tarjetasComparativas([fila("Uno", "Sede", 99, "93.4", "3.2", 93, 100), fila("Dos", "Sede", 0, "0.0", null, 0, 16), fila("Tres", "Otra", 1, null, "0.0")]);
  assert.equal(t.length, 3);
  assert.equal(t[0]!.ingreso, "$64,350");
  assert.deepEqual(t[0]!.ocupacion, { texto: "93%", ancho: "93.4", lugares: "93 de 100 lugares" });
  assert.equal(t[0]!.alumnosTexto, "alumnos");
  assert.equal(t[1]!.sinAlumnos, true);
  assert.equal(t[1]!.ocupacion!.texto, "0%");
  assert.equal(t[1]!.desercion.texto, "—");
  assert.equal(t[2]!.ocupacion, null);
  assert.equal(t[2]!.alumnosTexto, "alumno");
});

test("la frase del comparativo: el programa más grande (casi lleno) y la deserción más alta", () => {
  const filas = [fila("Uno", "Sede", 61, "78.0", "4.1"), fila("Uno", "Otra", 99, "93.0", "3.2"), fila("Dos", "Otra", 28, "52.0", "9.4")];
  assert.equal(fraseDeComparativo(filas), "Uno en Otra es el programa más grande (99 alumnos) y está casi lleno. Dos en Otra tiene la deserción más alta (9.4 %): vale la pena preguntar a quienes se fueron.");
  assert.equal(fraseDeComparativo([]), "");
  assert.equal(fraseDeComparativo([fila("Uno", "Sede", 5, "50.0", "0.0")]), "Uno en Sede es el programa más grande (5 alumnos).");
});
