import assert from "node:assert/strict";
import { test } from "node:test";
import { SECCIONES, seccionesVisibles } from "./secciones.ts";

const con = (...permisos: string[]) => (p: string): boolean => permisos.includes(p);

test("el administrador y el asesor ven las nueve; quien solo ve clases muestra, esa sola", () => {
  assert.equal(seccionesVisibles(con("reportes:ejecutivo", "reportes:clases_muestra", "reportes:costos")).length, 9);
  assert.deepEqual(
    seccionesVisibles(con("reportes:clases_muestra")).map((s) => s.id),
    ["clases"],
  );
  assert.deepEqual(
    seccionesVisibles(con("reportes:ejecutivo")).map((s) => s.id),
    SECCIONES.filter((s) => s.id !== "clases").map((s) => s.id),
  );
  assert.deepEqual(seccionesVisibles(con()), []);
});

test("los ids son únicos, los de la sección B son los del contrato y los números van en orden", () => {
  const ids = SECCIONES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["retencion", "ingreso", "mapa", "comparativo"]) assert.ok(ids.includes(id), id);
  assert.deepEqual(
    SECCIONES.filter((s) => s.numero).map((s) => s.numero),
    ["01", "02", "03", "04", "05", "06", "07", "08"],
  );
});
