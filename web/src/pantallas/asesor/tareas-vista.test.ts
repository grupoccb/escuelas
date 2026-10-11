import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accionDeTarea, ACCION_POR_OMISION, conteoPorTipo, esUrgente, haceCuanto, tonoDeTarea } from "./tareas-vista.ts";

describe("tono y acción de una tarea", () => {
  it("lo bueno es éxito, lo que pide atención hoy es alerta y lo demás neutro", () => {
    assert.equal(tonoDeTarea("listo_para_cerrar"), "exito");
    assert.equal(tonoDeTarea("entrega_fallida"), "alerta");
    assert.equal(tonoDeTarea("lead_frio"), "neutro");
    assert.equal(tonoDeTarea("tipo_nuevo_del_servidor"), "neutro");
  });
  it("solo las de alerta son «Atiéndela hoy»", () => {
    assert.equal(esUrgente("avisar_cambio_de_clase"), true);
    assert.equal(esUrgente("listo_para_cerrar"), false);
  });
  it("cada tipo del prototipo trae su botón y el resto cierra con «Marcar como hecha»", () => {
    assert.equal(accionDeTarea("lead_frio"), "Ya lo retomé");
    assert.equal(accionDeTarea("faltas_consecutivas"), "Ya hablé con la familia");
    assert.equal(accionDeTarea("revision_manual"), ACCION_POR_OMISION);
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-10-11T18:00:00Z");
  const antes = (minutos: number) => new Date(ahora.getTime() - minutos * 60_000).toISOString();
  it("dice minutos, horas, ayer y días", () => {
    assert.equal(haceCuanto(antes(0), ahora), "Ahora");
    assert.equal(haceCuanto(antes(25), ahora), "Hace 25 min");
    assert.equal(haceCuanto(antes(60), ahora), "Hace 1 h");
    assert.equal(haceCuanto(antes(23 * 60 + 59), ahora), "Hace 23 h");
    assert.equal(haceCuanto(antes(24 * 60), ahora), "Ayer");
    assert.equal(haceCuanto(antes(2 * 24 * 60), ahora), "Hace 2 días");
  });
  it("pasados 30 días no dice nada (la pantalla escribe la fecha); un texto roto tampoco", () => {
    assert.equal(haceCuanto(antes(31 * 24 * 60), ahora), null);
    assert.equal(haceCuanto("no es fecha", ahora), null);
  });
  it("una fecha futura (reloj desfasado) cuenta como ahora", () => {
    assert.equal(haceCuanto(antes(-5), ahora), "Ahora");
  });
});

describe("conteoPorTipo", () => {
  it("cuenta por tipo en el orden dado, omite los que no tienen y pone al final los desconocidos", () => {
    const r = conteoPorTipo([{ tipo: "b" }, { tipo: "a" }, { tipo: "b" }, { tipo: "z" }], ["a", "b", "c"]);
    assert.deepEqual(r, [{ tipo: "a", cuenta: 1 }, { tipo: "b", cuenta: 2 }, { tipo: "z", cuenta: 1 }]);
  });
});
