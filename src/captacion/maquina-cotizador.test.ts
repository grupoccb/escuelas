// La máquina de captación con el cotizador encendido (C6 en adelante). Pura: el catálogo viene en el contexto.
// Los nombres son neutros a propósito (invariante 2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { deTexto } from "../lib/dinero.ts";
import type { CatalogoCotizable, ProgramaCotizable } from "../cotizador/tipos.ts";
import { ESTADO_INICIAL, MAX_INTENTOS, avanzar, textos, type ContextoCaptacion, type EstadoCaptacion, type ResultadoCaptacion } from "./maquina.ts";

const V = "v-1";
const NORTE = { id: "s-norte", nombre: "Norte", direccion: "Calle 1" };
const SUR = { id: "s-sur", nombre: "Sur Poniente", direccion: null };

const programa = (id: string, nombre: string, min: number, max: number, extra: Partial<ProgramaCotizable> = {}): ProgramaCotizable => ({
  id,
  nombre,
  descripcionPublica: null,
  nivel: null,
  verticalId: V,
  sucursalId: NORTE.id,
  edadMin: min,
  edadMax: max,
  fechaCorteEdad: null,
  permiteTraslape: false,
  precio: { id: `pr-${id}`, costoInscripcion: deTexto("500.00"), costoMensualidad: deTexto("800.00"), moneda: "MXN", desde: "2020-01-01", hasta: null },
  grupos: [{ id: `g-${id}`, nombre: `Grupo ${id}`, cupoMaximo: 10, permiteListaEspera: false, ocupados: 0, horarios: [{ dia: 1, inicioMin: 960, finMin: 1020 }] }],
  ...extra,
});

const contexto = (programas: ProgramaCotizable[], extra: Partial<ContextoCaptacion> = {}): ContextoCaptacion => {
  const catalogo: CatalogoCotizable = { fecha: "2026-10-08", programas, promociones: [] };
  return { nombreVertical: "Vertical Uno", sucursales: [NORTE, SUR], cotizador: { verticalId: V, catalogo }, ...extra };
};

function conversar(mensajes: string[], ctx: ContextoCaptacion, desde: EstadoCaptacion = ESTADO_INICIAL) {
  let estado = desde;
  const pasos: ResultadoCaptacion[] = [];
  for (const m of mensajes) {
    const r = avanzar(estado, m, ctx);
    pasos.push(r);
    estado = r.estado;
  }
  return { estado, pasos, ultimo: pasos.at(-1)! };
}

// Tres programas en Norte: dos alternativas (de 15 a 99) y uno de niños.
const CATALOGO_NORTE = [
  programa("ninos", "Programa niños", 3, 12),
  programa("alfa", "Estilo Alfa", 15, 99, { permiteTraslape: true, descripcionPublica: "Ritmo suave" }),
  programa("beta", "Estilo Beta", 15, 99, { permiteTraslape: true, descripcionPublica: "Ritmo intenso" }),
];

test("un solo programa para la edad: se anota y se cierra mencionándolo, sin preguntar", () => {
  const { ultimo, pasos } = conversar(["Hola", "Sofía", "8", "1"], contexto(CATALOGO_NORTE));
  assert.equal(pasos[2]!.respuestas[0], textos.preguntaSucursal([NORTE, SUR]));
  assert.deepEqual(ultimo.respuestas, [textos.cierreConPrograma("Sofía", "Programa niños", "Norte")]);
  assert.equal(ultimo.pasarAAsesor, "captura_completa");
  assert.deepEqual(ultimo.efectos, [{ tipo: "programa_sugerido", programaId: "ninos" }]);
  assert.equal(ultimo.estado.programaId, "ninos");
  assert.equal(ultimo.estado.paso, "completo");
});

test("varios programas para la edad: pregunta cuál con la lista numerada (nombre y descripción pública) y espera", () => {
  const { ultimo } = conversar(["Hola", "Luis", "20", "1"], contexto(CATALOGO_NORTE));
  assert.equal(ultimo.estado.paso, "programa");
  assert.equal(ultimo.pasarAAsesor, null);
  assert.equal(ultimo.efectos, undefined, "todavía no se anota nada");
  assert.deepEqual(ultimo.respuestas, [
    textos.preguntaPrograma("Luis", 20, [
      { id: "alfa", nombre: "Estilo Alfa", descripcionPublica: "Ritmo suave" },
      { id: "beta", nombre: "Estilo Beta", descripcionPublica: "Ritmo intenso" },
    ]),
  ]);
  assert.equal(ultimo.respuestas[0], "Para Luis (20 años) tenemos estas opciones. ¿Cuál te interesa? Responde con el número:\n1. Estilo Alfa — Ritmo suave\n2. Estilo Beta — Ritmo intenso");
});

test("la lista de programas no inventa descripción cuando no hay", () => {
  const ctx = contexto([programa("a", "Opción A", 15, 99, { permiteTraslape: true }), programa("b", "Opción B", 15, 99, { permiteTraslape: true })]);
  const { ultimo } = conversar(["Hola", "Luis", "20", "1"], ctx);
  assert.match(ultimo.respuestas[0]!, /\n1\. Opción A\n2\. Opción B$/);
});

test("elegir por número o por nombre anota el programa, lo guarda y pasa al asesor", () => {
  for (const respuesta of ["2", "beta", "Estilo Beta", "la 2"]) {
    const { ultimo } = conversar(["Hola", "Luis", "20", "1", respuesta], contexto(CATALOGO_NORTE));
    assert.equal(ultimo.estado.paso, "completo", respuesta);
    assert.deepEqual(ultimo.efectos, [{ tipo: "programa_sugerido", programaId: "beta" }], respuesta);
    assert.equal(ultimo.estado.programaId, "beta");
    assert.equal(ultimo.pasarAAsesor, "captura_completa");
    assert.deepEqual(ultimo.respuestas, [textos.cierreConPrograma("Luis", "Estilo Beta", "Norte")]);
  }
});

test("respuestas inválidas al elegir programa reintentan como los demás pasos y a la tercera pasan al asesor", () => {
  const ctx = contexto(CATALOGO_NORTE);
  const base = conversar(["Hola", "Luis", "20", "1"], ctx);
  const a = avanzar(base.estado, "no sé", ctx);
  assert.equal(a.estado.paso, "programa");
  assert.equal(a.estado.intentosFallidos, 1);
  assert.deepEqual(a.respuestas, [textos.reintentoPrograma([{ id: "alfa", nombre: "Estilo Alfa", descripcionPublica: "Ritmo suave" }, { id: "beta", nombre: "Estilo Beta", descripcionPublica: "Ritmo intenso" }])]);
  const b = avanzar(a.estado, "9", ctx);
  assert.equal(b.estado.intentosFallidos, 2);
  const c = avanzar(b.estado, "ninguno", ctx);
  assert.equal(c.estado.intentosFallidos, MAX_INTENTOS);
  assert.equal(c.pasarAAsesor, "sin_entender");
  assert.deepEqual(c.respuestas, [textos.sinEntender]);
  assert.equal(c.estado.paso, "programa", "se queda donde iba; el pase a asesor lo hace quien llama");
  // Una respuesta válida reinicia el contador.
  const bien = avanzar(b.estado, "1", ctx);
  assert.equal(bien.estado.intentosFallidos, 0);
  assert.equal(bien.estado.paso, "completo");
});

test("con una sola sucursal no la pregunta y cotiza ahí", () => {
  const ctx = contexto(CATALOGO_NORTE, { sucursales: [NORTE] });
  const { ultimo, pasos } = conversar(["Hola", "Luis", "20"], ctx);
  assert.equal(pasos[2]!.estado.paso, "programa");
  assert.equal(ultimo.estado.sucursalId, NORTE.id);
});

test("los programas de otra sucursal no se ofrecen en la elegida", () => {
  const ctx = contexto([...CATALOGO_NORTE, programa("sur", "Programa del sur", 3, 99, { sucursalId: SUR.id })]);
  const { ultimo } = conversar(["Hola", "Ana", "8", "2"], ctx);
  assert.deepEqual(ultimo.efectos, [{ tipo: "programa_sugerido", programaId: "sur" }]);
});

test("sin el cotizador (ctx.cotizador ausente) la captura es la de siempre: tres preguntas, cierre sin programa y sin efectos", () => {
  const { ultimo, estado } = conversar(["Hola", "Sofía", "8", "1"], { ...contexto(CATALOGO_NORTE), cotizador: undefined });
  assert.deepEqual(ultimo.respuestas, [textos.cierre("Sofía", "Norte")]);
  assert.equal(ultimo.efectos, undefined);
  assert.deepEqual(estado, { paso: "completo", intentosFallidos: 0, nombre: "Sofía", edad: 8, sucursalId: NORTE.id });
});

test("el resumen para el asesor lista el programa solo si se anotó", () => {
  const sin = textos.resumenAsesor("captura_completa", { nombre: "A", edad: 8, sucursal: "Norte", telefono: "+525512340001" });
  assert.ok(!sin.includes("Programa"));
  const con = textos.resumenAsesor("captura_completa", { nombre: "A", edad: 8, sucursal: "Norte", programa: "Estilo Beta", telefono: "+525512340001" });
  assert.match(con, /• Sucursal: Norte\n• Programa: Estilo Beta\n• Teléfono/);
});
