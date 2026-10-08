import { test } from "node:test";
import assert from "node:assert/strict";
import { formatearReporteLeads, type ReporteLeads } from "./leads.ts";

test("el texto del reporte alinea la tabla, resume por etapa y totaliza", () => {
  const r: ReporteLeads = {
    filas: [
      { campana: "Campaña Uno", sucursal: "Norte", etapa: "Nuevo", ordenEtapa: 1, leads: 12 },
      { campana: "Campaña Uno", sucursal: "Norte", etapa: "Contactado", ordenEtapa: 2, leads: 3 },
      { campana: "(sin campaña)", sucursal: "(sin sucursal)", etapa: "Nuevo", ordenEtapa: 1, leads: 5 },
    ],
    porEtapa: [
      { etapa: "Nuevo", ordenEtapa: 1, leads: 17 },
      { etapa: "Contactado", ordenEtapa: 2, leads: 3 },
    ],
    total: 20,
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
  assert.equal(formatearReporteLeads({ filas: [], porEtapa: [], total: 0 }), "Sin leads para los filtros dados.");
});
