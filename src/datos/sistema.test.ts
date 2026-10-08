// `unicaOrganizacion` (EB-12/N04): con más de una organización viva el login sin identificador NO
// puede adivinar. Prueba pura con un cliente de mentira: no depende de cuántas organizaciones haya
// en la base de pruebas.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaRaiz } from "./prisma.ts";
import { unicaOrganizacion } from "./sistema.ts";

const conOrganizaciones = (ids: string[]): PrismaRaiz =>
  ({ organizacion: { findMany: async (a: { take: number }) => ids.slice(0, a.take).map((id) => ({ id })) } }) as unknown as PrismaRaiz;

test("unicaOrganizacion: exactamente una → esa; ninguna o varias → null", async () => {
  assert.deepEqual(await unicaOrganizacion(conOrganizaciones(["a"])), { id: "a" });
  assert.equal(await unicaOrganizacion(conOrganizaciones([])), null);
  assert.equal(await unicaOrganizacion(conOrganizaciones(["a", "b"])), null, "no devuelve la primera");
  assert.equal(await unicaOrganizacion(conOrganizaciones(["a", "b", "c"])), null);
});
