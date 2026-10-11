import assert from "node:assert/strict";
import { test } from "node:test";
import type { Etapa } from "../../api/tipos.ts";
import { accionDeEtapa, contarIndicadores, esDeCierre, estaPlegada, etapaDeRecuperacion, etapasDespuesDeLaClase, leerPlegadas, opcionesDeMover, textoDeColumnaVacia, textoDeDestino, tonoDeEtapa } from "./etapas-embudo.ts";

const e = (id: string, orden: number, tipo: string | null, extra: Partial<Etapa> = {}): Etapa => ({ id, nombre: `Etapa ${id}`, orden, tipo_sistema: tipo, es_ganado: false, es_perdido: false, dias_alerta_sin_movimiento: null, ...extra });
const ETAPAS = [e("n", 1, "nuevo"), e("c", 2, "contactado"), e("ag", 3, "muestra_agendada"), e("as", 4, "muestra_asistida"), e("ne", 5, "negociacion"), e("i", 6, "inscrito", { es_ganado: true }), e("p", 7, "perdido", { es_perdido: true })];

test("las de cierre se reconocen por su papel y llevan su tono y su rótulo", () => {
  const [n, i, p] = [ETAPAS[0]!, ETAPAS[5]!, ETAPAS[6]!];
  assert.equal(esDeCierre(n), false);
  assert.equal(esDeCierre(i), true);
  assert.equal(esDeCierre(p), true);
  assert.equal(esDeCierre(e("g", 9, null, { es_ganado: true })), true, "la bandera de ganada también vale");
  assert.deepEqual([tonoDeEtapa(n), tonoDeEtapa(i), tonoDeEtapa(p)], ["neutro", "exito", "peligro"]);
  assert.deepEqual([textoDeDestino(n), textoDeDestino(i), textoDeDestino(p)], ["Suelta para mover aquí", "Suelta para inscribir", "Suelta y elige el motivo"]);
  assert.match(textoDeColumnaVacia(i), /inscribirlo/);
  assert.match(textoDeColumnaVacia(p), /ya no sigue/);
  assert.match(textoDeColumnaVacia(n), /aparecerá aquí/);
  assert.match(textoDeColumnaVacia(ETAPAS[1]!), /Arrastra aquí/);
});

test("las columnas de cierre empiezan plegadas, lo elegido gana y la que acaba de recibir un lead se muestra", () => {
  const i = ETAPAS[5]!;
  const n = ETAPAS[0]!;
  assert.equal(estaPlegada(i, {}), true);
  assert.equal(estaPlegada(n, {}), false);
  assert.equal(estaPlegada(i, { i: false }), false, "la persona la desplegó");
  assert.equal(estaPlegada(n, { n: true }), true, "la persona plegó una abierta");
  assert.equal(estaPlegada(i, { i: true }, new Set(["i"])), false, "recién llegó un lead: se ve dónde quedó");
});

test("lo guardado en el navegador se lee con cuidado: basura, arreglos y valores que no son sí/no se ignoran", () => {
  assert.deepEqual(leerPlegadas(null), {});
  assert.deepEqual(leerPlegadas("no es json"), {});
  assert.deepEqual(leerPlegadas("[1,2]"), {});
  assert.deepEqual(leerPlegadas("null"), {});
  assert.deepEqual(leerPlegadas('{"a":true,"b":false,"c":"si","d":3}'), { a: true, b: false });
});

test("«Mover a…»: con varios leads «Inscrito» se deshabilita; la hoja de uno marca dónde está", () => {
  const uno = opcionesDeMover(ETAPAS, 1);
  assert.equal(uno.find((o) => o.etapaId === "i")!.deshabilitada, false);
  assert.equal(uno.find((o) => o.etapaId === "i")!.nota, "Abre la inscripción");
  assert.equal(uno.find((o) => o.etapaId === "p")!.nota, "Pide el motivo");
  assert.equal(uno.find((o) => o.etapaId === "c")!.nota, "");
  const varios = opcionesDeMover(ETAPAS, 3);
  assert.deepEqual([varios.find((o) => o.etapaId === "i")!.deshabilitada, varios.find((o) => o.etapaId === "i")!.nota], [true, "De una en una"]);
  assert.equal(varios.find((o) => o.etapaId === "p")!.deshabilitada, false, "perder varios a la vez sí se puede");
  const hoja = opcionesDeMover(ETAPAS, 1, "c");
  assert.deepEqual([hoja.find((o) => o.etapaId === "c")!.deshabilitada, hoja.find((o) => o.etapaId === "c")!.nota], [true, "Aquí está"]);
  assert.equal(hoja.length, ETAPAS.length, "siempre una opción por etapa, en el orden de la API");
});

test("las etapas posteriores a la clase son las abiertas desde la «asistida»; sin esa etapa, ninguna", () => {
  assert.deepEqual([...etapasDespuesDeLaClase(ETAPAS)].sort(), ["as", "ne"]);
  assert.equal(etapasDespuesDeLaClase(ETAPAS.filter((x) => x.id !== "as")).size, 0);
});

test("los indicadores cuentan por el papel de la etapa y dicen null cuando la escuela no tiene esa etapa", () => {
  const leads = [{ etapa_id: "n" }, { etapa_id: "n" }, { etapa_id: "ag" }, { etapa_id: "i" }, { etapa_id: "i" }, { etapa_id: "i" }, { etapa_id: "p" }, { etapa_id: "ne" }];
  assert.deepEqual(contarIndicadores(ETAPAS, leads), { abiertos: 4, inscritos: 3, nuevos: 2, clasesAgendadas: 1 });
  const sinAgendada = ETAPAS.filter((x) => x.id !== "ag");
  assert.equal(contarIndicadores(sinAgendada, leads).clasesAgendadas, null);
  const sinTipos = [e("x", 1, null), e("y", 2, null), e("z", 3, "inscrito")];
  assert.equal(contarIndicadores(sinTipos, [{ etapa_id: "x" }, { etapa_id: "y" }]).nuevos, 1, "sin etapa «nuevo» cuenta la primera abierta por orden");
  assert.deepEqual(contarIndicadores([], []), { abiertos: 0, inscritos: 0, nuevos: null, clasesAgendadas: null });
});

test("la acción de un lead abierto depende de dónde va: marcar a mano, inscribir tras la clase o agendar (y cambiar si ya hay una)", () => {
  const base = { cerrada: false, puedeMarcar: false, despuesDeLaClase: false, puedeInscribir: true, puedeAgendar: true, tieneClaseAgendada: false };
  assert.equal(accionDeEtapa(base), "agendar");
  assert.equal(accionDeEtapa({ ...base, tieneClaseAgendada: true }), "cambiar-clase");
  assert.equal(accionDeEtapa({ ...base, despuesDeLaClase: true }), "inscribir");
  assert.equal(accionDeEtapa({ ...base, despuesDeLaClase: true, puedeInscribir: false }), null);
  assert.equal(accionDeEtapa({ ...base, puedeAgendar: false }), null);
  assert.equal(accionDeEtapa({ ...base, puedeMarcar: true }), "marcar", "con la inscripción apagada, marcar gana a agendar");
  assert.equal(accionDeEtapa({ ...base, cerrada: true, puedeMarcar: true }), null, "un lead de cierre no tiene acción");
});

test("al recuperar, un lead vuelve a «contactado» o, sin esa etapa, a la primera abierta", () => {
  assert.equal(etapaDeRecuperacion(ETAPAS)?.id, "c");
  assert.equal(etapaDeRecuperacion(ETAPAS.filter((x) => x.id !== "c"))?.id, "n");
  assert.equal(etapaDeRecuperacion([ETAPAS[5]!, ETAPAS[6]!]), undefined);
});
