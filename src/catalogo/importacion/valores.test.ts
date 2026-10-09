// Los valores de una celda (V6): enteros, importes en centavos exactos, fechas, horas, días, sí/no, listas, teléfonos y zonas. Tablas de casos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDeNombre, leerColor, leerCorreo, leerDia, leerEntero, leerFecha, leerHora, leerImporte, leerLista, leerSiNo, leerTelefono, leerZonaHoraria, type Leido } from "./valores.ts";

function valorDe<T>(r: Leido<T>): T | string {
  return r.ok ? r.valor : `ERROR: ${r.mensaje}`;
}
function esperarError<T>(r: Leido<T>, patron: RegExp): void {
  assert.equal(r.ok, false, `se esperaba un error y salió ${JSON.stringify(r, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))}`);
  if (!r.ok) assert.match(r.mensaje, patron);
}

test("claveDeNombre: sin acentos, mayúsculas, signos ni espacios de más", () => {
  assert.equal(claveDeNombre("  Salón   Principal. "), "salon principal");
  assert.equal(claveDeNombre("NIÑOS 6–9"), "ninos 6 9");
  assert.equal(claveDeNombre("Sala 3"), claveDeNombre("sala  3"));
});

test("enteros: dígitos, rango y el «12.0» que a veces deja Excel", () => {
  const casos: [string, number, number, number | RegExp][] = [
    ["15", 1, 500, 15],
    ["0", 0, 99, 0],
    ["99", 0, 99, 99],
    ["12.0", 0, 99, 12],
    ["12,0", 0, 99, 12],
    ["100", 0, 99, /fuera de rango/],
    ["0", 1, 500, /fuera de rango/],
    ["-3", 0, 99, /no es un número entero/],
    ["abc", 0, 99, /no es un número entero/],
    ["7.5", 0, 99, /no es un número entero/],
    ["1e3", 0, 99999, /no es un número entero/],
  ];
  for (const [texto, min, max, esperado] of casos) {
    const r = leerEntero(texto, min, max);
    if (typeof esperado === "number") assert.equal(valorDe(r), esperado, texto);
    else esperarError(r, esperado);
  }
});

test("importes: centavos exactos con punto o coma decimal, miles y símbolo; lo ambiguo se rechaza", () => {
  const buenos: [string, bigint][] = [
    ["0", 0n],
    ["500", 50000n],
    ["500.5", 50050n],
    ["500.50", 50050n],
    ["500,50", 50050n],
    ["500,5", 50050n],
    ["$500.00", 50000n],
    ["$ 1,500.00", 150000n],
    ["1,500", 150000n],
    ["1,500.5", 150050n],
    ["1.500,50", 150050n],
    ["1,234,567.89", 123456789n],
    ["1.234.567", 123456700n],
    ["5.123,4", 512340n],
    ["1500 MXN", 150000n],
    ["0.05", 5n],
    ["0,05", 5n],
    ["99999999.99", 9999999999n],
  ];
  for (const [texto, centavos] of buenos) assert.equal(valorDe(leerImporte(texto)), centavos, texto);
  const malos: [string, RegExp][] = [
    ["-5", /negativo/],
    ["1.500", /no se entiende/], // mil quinientos o uno con cincuenta: con dinero no se adivina
    ["12.345", /no se entiende/],
    ["1,2,3", /no se entiende/],
    ["1.234.50", /no se entiende/],
    ["abc", /no se entiende/],
    ["12.5.5", /no se entiende/],
    ["", /no se entiende/],
    ["10000000000", /demasiado grande/],
  ];
  for (const [texto, patron] of malos) esperarError(leerImporte(texto), patron);
});

test("fechas: dd/mm/aaaa y aaaa-mm-dd, con ceros o sin ellos, con la hora que agrega Excel; valida el calendario", () => {
  const buenas: [string, string][] = [
    ["15/09/2026", "2026-09-15"],
    ["5/9/2026", "2026-09-05"],
    ["05-09-2026", "2026-09-05"],
    ["05.09.2026", "2026-09-05"],
    ["2026-09-15", "2026-09-15"],
    ["2026-9-5", "2026-09-05"],
    ["15/09/2026 0:00", "2026-09-15"],
    ["2026-09-15 00:00:00", "2026-09-15"],
    ["2026-09-15T00:00:00", "2026-09-15"],
    ["29/02/2028", "2028-02-29"],
    ["31/12/2026", "2026-12-31"],
  ];
  for (const [texto, iso] of buenas) assert.equal(valorDe(leerFecha(texto)), iso, texto);
  const malas: [string, RegExp][] = [
    ["31/02/2026", /no es una fecha que exista/],
    ["29/02/2027", /no es una fecha que exista/],
    ["2026-13-01", /no es una fecha que exista/],
    ["15/09/26", /no es una fecha/],
    ["septiembre", /no es una fecha/],
    ["", /no es una fecha/],
    ["15/09/1850", /año poco probable/],
    ["01/01/2999", /año poco probable/],
  ];
  for (const [texto, patron] of malas) esperarError(leerFecha(texto), patron);
});

test("horas: 24 h, minutos desde la medianoche; rechaza 12 h y fuera de rango; 24:00 solo como fin", () => {
  const buenas: [string, number][] = [["17:00", 1020], ["9:05", 545], ["00:00", 0], ["23:59", 1439], ["17:00:00", 1020], ["17:30 h", 1050], ["8:00 hrs", 480]];
  for (const [texto, min] of buenas) assert.equal(valorDe(leerHora(texto)), min, texto);
  assert.equal(valorDe(leerHora("24:00", { esFin: true })), 1440);
  esperarError(leerHora("24:00"), /no es una hora válida/);
  esperarError(leerHora("5:00 pm"), /12 horas/);
  esperarError(leerHora("5:00 p. m."), /12 horas/);
  esperarError(leerHora("10:00 AM"), /12 horas/);
  esperarError(leerHora("25:00"), /no es una hora válida/);
  esperarError(leerHora("12:60"), /no es una hora válida/);
  esperarError(leerHora("17"), /no es una hora/);
  esperarError(leerHora("tarde"), /no es una hora/);
});

test("días: en español, sin importar mayúsculas ni acentos; abreviaturas", () => {
  const casos: [string, number][] = [
    ["lunes", 1], ["Lunes", 1], ["LUNES", 1], ["martes", 2], ["miércoles", 3], ["miercoles", 3], ["MIÉRCOLES", 3], ["jueves", 4], ["viernes", 5], ["sábado", 6], ["sabado", 6], ["domingo", 0],
    ["lun", 1], ["mar", 2], ["mié", 3], ["mie", 3], ["jue", 4], ["vie", 5], ["sáb", 6], ["dom", 0], ["  Lunes  ", 1],
  ];
  for (const [texto, dia] of casos) assert.equal(valorDe(leerDia(texto)), dia, texto);
  esperarError(leerDia("monday"), /no es un día de la semana/);
  esperarError(leerDia("lunes y miércoles"), /no es un día de la semana/);
  esperarError(leerDia(""), /no es un día de la semana/);
});

test("sí / no", () => {
  for (const t of ["Sí", "si", "SÍ", "s", "x", "Verdadero", "1"]) assert.equal(valorDe(leerSiNo(t)), true, t);
  for (const t of ["No", "no", "N", "falso", "0"]) assert.equal(valorDe(leerSiNo(t)), false, t);
  esperarError(leerSiNo("quizá"), /Escribe Sí o No/);
});

test("listas con |, ; o /, sin vacíos ni espacios de más", () => {
  assert.deepEqual(leerLista("Centro | Norte"), ["Centro", "Norte"]);
  assert.deepEqual(leerLista("Centro;Norte ; Sur"), ["Centro", "Norte", "Sur"]);
  assert.deepEqual(leerLista("Centro/Norte"), ["Centro", "Norte"]);
  assert.deepEqual(leerLista("  Una sola   sucursal "), ["Una sola sucursal"]);
  assert.deepEqual(leerLista(""), []);
  assert.deepEqual(leerLista("|| ;"), []);
});

test("teléfonos por normalizarTelefono(): +521 y +52 dan lo mismo; lo que no es teléfono, no pasa", () => {
  assert.equal(valorDe(leerTelefono("55 1234 5678")), "+525512345678");
  assert.equal(valorDe(leerTelefono("+52 1 55 1234 5678")), "+525512345678");
  assert.equal(valorDe(leerTelefono("(55) 1234-5678")), "+525512345678");
  assert.equal(valorDe(leerTelefono("whatsapp:+5215512345678")), "+525512345678");
  esperarError(leerTelefono("123"), /no es un teléfono válido/);
  esperarError(leerTelefono("llamar a Ana"), /no es un teléfono válido/);
});

test("correo y color", () => {
  assert.equal(valorDe(leerCorreo("Ana@Ejemplo.COM")), "ana@ejemplo.com");
  esperarError(leerCorreo("ana@"), /no parece un correo/);
  esperarError(leerCorreo("ana @ejemplo.com"), /no parece un correo/);
  assert.equal(valorDe(leerColor("#2e7d32")), "#2E7D32");
  assert.equal(valorDe(leerColor("2E7D32")), "#2E7D32");
  esperarError(leerColor("verde"), /no es un color/);
});

test("zonas horarias: nombres de la gente o el nombre técnico", () => {
  assert.equal(valorDe(leerZonaHoraria("Centro")), "America/Mexico_City");
  assert.equal(valorDe(leerZonaHoraria("Ciudad de México")), "America/Mexico_City");
  assert.equal(valorDe(leerZonaHoraria("pacífico")), "America/Mazatlan");
  assert.equal(valorDe(leerZonaHoraria("Sonora")), "America/Hermosillo");
  assert.equal(valorDe(leerZonaHoraria("Noroeste")), "America/Tijuana");
  assert.equal(valorDe(leerZonaHoraria("Quintana Roo")), "America/Cancun");
  assert.equal(valorDe(leerZonaHoraria("America/Bogota")), "America/Bogota");
  esperarError(leerZonaHoraria("CST"), /no es una zona horaria/);
  esperarError(leerZonaHoraria("la de aquí"), /no es una zona horaria/);
});
