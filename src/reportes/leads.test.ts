import { test } from "node:test";
import assert from "node:assert/strict";
import { formatearReporteLeads, type ReporteLeads } from "./leads.ts";

test("el texto del reporte alinea la tabla, resume por etapa y totaliza", () => {
  const r: ReporteLeads = {
    filas: [
      { campana: "Campaña Uno", sucursal: "Norte", etapa: "Nuevo", ordenEtapa: 1, leads: 12, aMano: 0 },
      { campana: "Campaña Uno", sucursal: "Norte", etapa: "Contactado", ordenEtapa: 2, leads: 3, aMano: 0 },
      { campana: "(sin campaña)", sucursal: "(sin sucursal)", etapa: "Nuevo", ordenEtapa: 1, leads: 5, aMano: 0 },
    ],
    porEtapa: [
      { etapa: "Nuevo", ordenEtapa: 1, leads: 17, aMano: 0 },
      { etapa: "Contactado", ordenEtapa: 2, leads: 3, aMano: 0 },
    ],
    total: 20,
    inscritos: { total: 0, porInscripcion: 0, aMano: 0 },
  };
  const texto = formatearReporteLeads(r);
  const lineas = texto.split("\n");
  assert.match(lineas[0]!, /^Campaña\s+Sucursal\s+Etapa\s+Leads$/);
  assert.match(texto, /Campaña Uno\s+Norte\s+Nuevo\s+12/);
  assert.match(texto, /\(sin campaña\)\s+\(sin sucursal\)\s+Nuevo\s+5/);
  assert.match(texto, /Nuevo\s+17/);
  assert.match(texto, /Total: 20$/);
  // La columna de números queda alineada a la derecha.
  const anchos = new Set(lineas.slice(0, 5).map((l) => l.length));
  assert.equal(anchos.size, 1, "las filas de la tabla miden lo mismo");
});

test("sin leads lo dice en vez de imprimir una tabla vacía", () => {
  assert.equal(formatearReporteLeads({ filas: [], porEtapa: [], total: 0, inscritos: { total: 0, porInscripcion: 0, aMano: 0 } }), "Sin leads para los filtros dados.");
});

test("V10b: sin inscritos a mano el texto no cambia; con ellos agrega la columna «A mano» y el desglose de inscritos", () => {
  const base: ReporteLeads = {
    filas: [
      { campana: "Campaña Uno", sucursal: "Norte", etapa: "Nuevo", ordenEtapa: 1, leads: 4, aMano: 0 },
      { campana: "Campaña Uno", sucursal: "Norte", etapa: "Inscrito", ordenEtapa: 6, leads: 5, aMano: 2 },
    ],
    porEtapa: [
      { etapa: "Nuevo", ordenEtapa: 1, leads: 4, aMano: 0 },
      { etapa: "Inscrito", ordenEtapa: 6, leads: 5, aMano: 2 },
    ],
    total: 9,
    inscritos: { total: 5, porInscripcion: 3, aMano: 2 },
  };
  const texto = formatearReporteLeads(base);
  assert.match(texto.split("\n")[0]!, /^Campaña\s+Sucursal\s+Etapa\s+Leads\s+A mano$/);
  assert.match(texto, /Campaña Uno\s+Norte\s+Inscrito\s+5\s+2/);
  assert.match(texto, /Inscrito\s+5\s+\(2 inscritos a mano\)/);
  assert.match(texto, /Inscritos: 5 \(3 por inscripción, 2 a mano\)$/);
  const sinMano = formatearReporteLeads({ ...base, filas: base.filas.map((f) => ({ ...f, aMano: 0 })), porEtapa: base.porEtapa.map((e) => ({ ...e, aMano: 0 })), inscritos: { total: 5, porInscripcion: 5, aMano: 0 } });
  assert.match(sinMano.split("\n")[0]!, /^Campaña\s+Sucursal\s+Etapa\s+Leads$/);
  assert.doesNotMatch(sinMano, /a mano/);
});
