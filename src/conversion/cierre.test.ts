import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../auth/roles.ts";
import { MODOS_DE_CIERRE } from "../configuracion/index.ts";
import { puedeConvertir, puedeMarcarListo } from "./cierre.ts";

test("la matriz de quién convierte según el modo de cierre, completa (escrita a mano)", () => {
  const esperado: Record<string, Record<string, boolean>> = {
    asesor_whatsapp: { administrador: true, asesor: true, maestro: false, recepcion: false },
    maestro_en_sitio: { administrador: true, asesor: true, maestro: true, recepcion: false },
  };
  for (const modo of MODOS_DE_CIERRE) for (const rol of ROLES) assert.equal(puedeConvertir(rol, modo), esperado[modo]![rol], `${modo} · ${rol}`);
});

test("marcar «listo para cerrar» lo pueden el administrador, el asesor y el maestro en cualquier modo; recepción nunca", () => {
  assert.deepEqual(ROLES.filter(puedeMarcarListo).sort(), ["administrador", "asesor", "maestro"]);
});
