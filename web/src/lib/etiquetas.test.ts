import assert from "node:assert/strict";
import { test } from "node:test";
import { textoDeLugares } from "./etiquetas.ts";

test("V7: los lugares concuerdan en número («1 lugar», no «1 lugares»)", () => {
  assert.equal(textoDeLugares(1), "1 lugar");
  assert.equal(textoDeLugares(0), "0 lugares");
  assert.equal(textoDeLugares(2), "2 lugares");
  assert.equal(textoDeLugares(30), "30 lugares");
});
