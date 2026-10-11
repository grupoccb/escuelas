import assert from "node:assert/strict";
import { test } from "node:test";
import { cuerpoDeMovimiento, faltaDePerdido, faltaDeRecuperar, nombresResumidos, subtituloDePerdido, subtituloDeRecuperar, textoDeBotonDePerdido, tituloDePerdido, tituloDeRecuperar } from "./dialogos-embudo.ts";

test("perder exige el motivo y la nota es opcional; recuperar exige la nota (en blanco no vale)", () => {
  assert.equal(faltaDePerdido(""), "Elige el motivo de pérdida.");
  assert.equal(faltaDePerdido("m1"), null);
  assert.equal(faltaDeRecuperar(""), "Escribe una nota: por qué se recupera.");
  assert.equal(faltaDeRecuperar("   \n "), "Escribe una nota: por qué se recupera.");
  assert.equal(faltaDeRecuperar("Volvió a escribir"), null);
});

test("los títulos y subtítulos hablan de uno o de varios", () => {
  assert.equal(tituloDePerdido(["Ana"]), "¿Por qué se perdió Ana?");
  assert.equal(tituloDePerdido(["Ana", "Luis"]), "¿Por qué se perdieron estos 2 leads?");
  assert.equal(subtituloDePerdido(["Ana"], "Contactado"), "Ahora está en: Contactado");
  assert.equal(subtituloDePerdido(["Ana", "Luis"], "x"), "Ana, Luis");
  assert.equal(nombresResumidos(["a", "b", "c", "d", "e"]), "a, b, c y 2 más");
  assert.equal(textoDeBotonDePerdido(1, "Perdido"), "Mover a Perdido");
  assert.equal(textoDeBotonDePerdido(3, "Perdido"), "Mover 3 a Perdido");
  assert.equal(tituloDeRecuperar(["Ana"]), "Recuperar a Ana");
  assert.equal(tituloDeRecuperar(["Ana", "Luis"]), "Recuperar 2 leads");
  assert.equal(subtituloDeRecuperar(["Perdido", "Perdido"], "Contactado"), "Pasa de Perdido a Contactado");
  assert.equal(subtituloDeRecuperar(["Perdido", "Descartado"], "Contactado"), "Pasa de Perdido y Descartado a Contactado");
});

test("el cuerpo de mover lleva la etapa de origen, el motivo solo al perder y la nota recortada si la hay", () => {
  assert.deepEqual(cuerpoDeMovimiento({ destinoId: "d", desdeEtapaId: "o", motivoId: "m", nota: "  Precio alto  " }), { etapa_id: "d", desde_etapa_id: "o", motivo_perdida_id: "m", nota: "Precio alto" });
  assert.deepEqual(cuerpoDeMovimiento({ destinoId: "d", desdeEtapaId: "o", nota: "  " }), { etapa_id: "d", desde_etapa_id: "o" });
});
