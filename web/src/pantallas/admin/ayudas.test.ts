import assert from "node:assert/strict";
import { test } from "node:test";
import { colorDe, enteroDe, horarioDeEnvio, horariosParaApi, minutosDeHora, problemaDeAjuste, resumenDeHorarios } from "./ayudas.ts";

test("las horas se leen como HH:MM y lo demás no es una hora", () => {
  assert.equal(minutosDeHora("16:30"), 990);
  assert.equal(minutosDeHora(" 9:05 "), 545);
  assert.equal(minutosDeHora("00:00"), 0);
  for (const mala of ["24:00", "16:60", "16", "4pm", "", "16:5"]) assert.equal(minutosDeHora(mala), null, mala);
});

test("los horarios de un grupo: cada fila con su error, sin mezclar las buenas con las malas", () => {
  const r = horariosParaApi([
    { dia: "1", inicio: "16:00", fin: "17:00" },
    { dia: "", inicio: "16:00", fin: "17:00" },
    { dia: "3", inicio: "18:00", fin: "17:00" },
    { dia: "4", inicio: "ab", fin: "17:00" },
  ]);
  assert.deepEqual(r.horarios, [{ dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 }]);
  assert.deepEqual(Object.keys(r.errores), ["1", "2", "3"]);
  assert.match(r.errores[2]!, /antes que la de fin/);
});

test("el resumen agrupa los días que comparten franja", () => {
  assert.equal(resumenDeHorarios([]), "Sin horario");
  assert.equal(
    resumenDeHorarios([
      { dia_semana: 3, hora_inicio_min: 960, hora_fin_min: 1020 },
      { dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 },
      { dia_semana: 6, hora_inicio_min: 600, hora_fin_min: 660 },
    ]),
    "Lun, Mié 16:00–17:00 · Sáb 10:00–11:00",
  );
});

test("enteros acotados y colores #RRGGBB", () => {
  assert.equal(enteroDe("12", 1, 30), 12);
  for (const mal of ["0", "31", "1.5", "abc", "", "-1"]) assert.equal(enteroDe(mal, 1, 30), null, mal);
  assert.equal(enteroDe("-5", -10, 10), -5);
  assert.equal(colorDe("1f5fbf"), "#1F5FBF");
  assert.equal(colorDe("#1f5fbf"), "#1F5FBF");
  assert.equal(colorDe(""), "");
  assert.equal(colorDe("rojo"), null);
});

test("el horario de envío de una automatización nunca sale de 09:00 a 20:00 (invariante 14)", () => {
  assert.deepEqual(horarioDeEnvio("09:00", "20:00"), { inicio: 540, fin: 1200 });
  assert.deepEqual(horarioDeEnvio("10:30", "18:00"), { inicio: 630, fin: 1080 });
  for (const [i, f] of [["08:59", "18:00"], ["09:00", "20:01"], ["18:00", "10:00"], ["x", "y"]] as const) assert.equal(typeof horarioDeEnvio(i, f), "string", `${i}-${f}`);
});

test("V5: un ajuste de la configuración se lee con su rango; la hora del día nunca sale de 09:00 a 20:00", () => {
  const dias = { min: 1, max: 365, unidad: "dias" } as const;
  assert.deepEqual(problemaDeAjuste(dias, " 7 "), { valor: 7 });
  for (const mal of ["0", "366", "1.5", "", "siete"]) assert.deepEqual(problemaDeAjuste(dias, mal), { error: "Escribe un número de 1 a 365" }, mal);
  const inicio = { min: 540, max: 1199, unidad: "hora_del_dia" } as const;
  assert.deepEqual(problemaDeAjuste(inicio, "10:30"), { valor: 630 });
  assert.deepEqual(problemaDeAjuste(inicio, "09:00"), { valor: 540 });
  for (const temprano of ["08:59", "00:00"]) assert.match((problemaDeAjuste(inicio, temprano) as { error: string }).error, /entre las 09:00 y las 20:00/, temprano);
  assert.match((problemaDeAjuste(inicio, "20:00") as { error: string }).error, /de 09:00 a 19:59/, "el inicio no puede ser el cierre");
  assert.deepEqual(problemaDeAjuste(inicio, "diez"), { error: "Escribe la hora completa, por ejemplo 09:00" });
  const fin = { min: 541, max: 1200, unidad: "hora_del_dia" } as const;
  assert.deepEqual(problemaDeAjuste(fin, "20:00"), { valor: 1200 });
  assert.match((problemaDeAjuste(fin, "20:01") as { error: string }).error, /entre las 09:00 y las 20:00/);
});
