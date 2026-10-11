import assert from "node:assert/strict";
import { test } from "node:test";
import type { Oferta, Vista } from "../conversion/datos.ts";
import { encajeEnElDialogo, gruposDeLaOferta, problemaDeLaOferta, rechazoDeConversion, seCapturaEnElDialogo, seElige, textoDeCupo, textoDeFaltaParaSeguir } from "./inscripcion-embudo.ts";

const SUC = { sucursal: { id: "s", nombre: "Sede" } };
const vista = (extra: Partial<Vista> = {}): Vista => ({ lead_id: "l", listo: false, ya_convertido: false, faltantes: [], prospectos: [{ prospecto_id: "p1", ya_convertido: false }], previsiones: [], ...extra });

test("cabe en el diálogo con un solo niño, sucursal y faltas que se capturan aquí", () => {
  const v = vista({ faltantes: [{ campo: "prospectos.p1.alumno.apellidos", mensaje: "x" }, { campo: "tutor.parentesco", mensaje: "x" }, { campo: "prospectos.p1.grupo_id", mensaje: "x" }, { campo: "prospectos.p1.precio", mensaje: "x" }] });
  assert.deepEqual(encajeEnElDialogo(SUC, v), { cabe: true, prospectoId: "p1" });
});

test("no cabe: ya inscrito, varios niños, sin sucursal, reglamento sin aceptar o faltas que solo se resuelven en la inscripción completa", () => {
  const no = (lead: typeof SUC | { sucursal: null }, v: Vista) => {
    const r = encajeEnElDialogo(lead, v);
    assert.equal(r.cabe, false);
    return r.cabe ? null : r;
  };
  assert.equal(no(SUC, vista({ ya_convertido: true }))?.tipo, "ya_inscrito");
  assert.equal(no(SUC, vista({ prospectos: [{ prospecto_id: "p1", ya_convertido: true }] }))?.tipo, "ya_inscrito");
  const dos = no(SUC, vista({ prospectos: [{ prospecto_id: "p1", ya_convertido: false }, { prospecto_id: "p2", ya_convertido: false }] }));
  assert.equal(dos?.tipo, "varios");
  assert.match(dos?.mensaje ?? "", /2 niños/);
  assert.equal(no({ sucursal: null }, vista())?.tipo, "sin_sucursal");
  assert.equal(no(SUC, vista({ faltantes: [{ campo: "prospectos.p1.reglamento", mensaje: "x" }] }))?.tipo, "reglamento");
  const tel = no(SUC, vista({ faltantes: [{ campo: "tutor.telefono", mensaje: "x" }] }));
  assert.equal(tel?.tipo, "faltan_otros");
  assert.match(tel?.mensaje ?? "", /Teléfono del adulto responsable/);
  assert.equal(seCapturaEnElDialogo("tutor.telefono"), false);
  assert.equal(seCapturaEnElDialogo("prospectos.p1.alumno.fecha_nacimiento"), true);
});

const oferta = (programas: Partial<Oferta["programas"][number]>[]): Oferta => ({
  programas: programas.map((p, i) => ({ programa_id: `pr${i}`, nombre: `Programa ${i}`, precio: { costo_inscripcion: "1", costo_mensualidad: "2" }, sin_precio: false, grupos: [], promociones: {} as never, ...p })),
});
const grupo = (id: string, lugares: number) => ({ grupo_id: id, nombre: `Grupo ${id}`, horario_texto: "sáb 10:00", lugares_disponibles: lugares, lleno: lugares === 0, oferta: "" });

test("los grupos de la oferta se aplanan con sus lugares reales y los llenos o sin precio no se eligen", () => {
  const o = oferta([{ grupos: [grupo("a", 3), grupo("b", 0)] }, { precio: null, sin_precio: true, promociones: null, grupos: [grupo("c", 5)] }]);
  const g = gruposDeLaOferta(o);
  assert.deepEqual(g.map((x) => [x.grupoId, x.programa, x.lugares, seElige(x)]), [["a", "Programa 0", 3, true], ["b", "Programa 0", 0, false], ["c", "Programa 1", 5, false]]);
  assert.deepEqual([textoDeCupo(g[0]!), textoDeCupo(g[1]!), textoDeCupo({ lugares: 1, lleno: false })], ["3 lugares", "Lleno", "1 lugar"]);
  assert.equal(problemaDeLaOferta(o), null);
});

test("sin nada que elegir se dice por qué", () => {
  assert.match(problemaDeLaOferta(null) ?? "", /No se pudo calcular la oferta/);
  assert.match(problemaDeLaOferta(oferta([])) ?? "", /No hay programas/);
  assert.match(problemaDeLaOferta(oferta([{ grupos: [grupo("a", 0)] }])) ?? "", /llenos/);
  assert.match(problemaDeLaOferta(oferta([{ precio: null, sin_precio: true, promociones: null, grupos: [grupo("a", 2)] }])) ?? "", /precio vigente/);
});

test("un rechazo por grupo lleno o fuera de edad regresa al grupo; los demás mandan a la inscripción completa", () => {
  const e = (motivo: string, extra: { campo: string; mensaje: string }[] = []) => ({ detalles: [{ campo: "motivo", mensaje: motivo }, { campo: "prospecto_id", mensaje: "p1" }, ...extra] });
  assert.deepEqual(rechazoDeConversion(e("grupo_lleno")), { codigo: "grupo_lleno", salida: "grupo", faltas: [] });
  assert.equal(rechazoDeConversion(e("fuera_de_edad")).salida, "grupo");
  assert.equal(rechazoDeConversion(e("reglamento")).salida, "completa");
  assert.equal(rechazoDeConversion(e("sin_precio")).salida, "completa");
  const faltan = rechazoDeConversion(e("faltan_datos", [{ campo: "tutor.telefono", mensaje: "x" }]));
  assert.equal(faltan.salida, "completa");
  assert.deepEqual(faltan.faltas, ["Teléfono del adulto responsable"]);
  assert.deepEqual(rechazoDeConversion({ detalles: [] }), { codigo: null, salida: "completa", faltas: [] });
});

test("lo que falta para seguir se dice con el texto del prototipo si solo son los apellidos, y si no, se enumera", () => {
  assert.equal(textoDeFaltaParaSeguir([]), null);
  assert.equal(textoDeFaltaParaSeguir([{ campo: "prospectos.p1.alumno.apellidos", mensaje: "x" }]), "Escribe los apellidos del alumno para seguir.");
  assert.equal(textoDeFaltaParaSeguir([{ campo: "prospectos.p1.alumno.apellidos", mensaje: "x" }, { campo: "tutor.parentesco", mensaje: "x" }]), "Para seguir falta: Apellidos del alumno, Parentesco del adulto responsable.");
});
