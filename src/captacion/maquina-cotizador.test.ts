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
  return { nombreVertical: "Vertical Uno", sucursales: [NORTE, SUR], cotizador: { verticalId: V, catalogo, sucursalSinPrograma: "ofrecer_otra" }, ...extra };
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

// ── C7: la sucursal elegida no tiene programa para la edad ─────────────────────────────────────────────

// Norte solo tiene programa para niños; Sur, para todas las edades.
const SOLO_NINOS_EN_NORTE = [programa("ninos", "Programa niños", 3, 12), programa("sur", "Programa del sur", 3, 99, { sucursalId: SUR.id })];
const conPolitica = (programas: ProgramaCotizable[], sucursalSinPrograma: "ofrecer_otra" | "avisar_asesor", extra: Partial<ContextoCaptacion> = {}) => {
  const ctx = contexto(programas, extra);
  return { ...ctx, cotizador: { ...ctx.cotizador!, sucursalSinPrograma } } satisfies ContextoCaptacion;
};

test("C7 ofrecer_otra: sin programa en la sucursal elegida ofrece la otra, con su dirección, y espera", () => {
  const { ultimo } = conversar(["Hola", "Luis", "30", "1"], conPolitica(SOLO_NINOS_EN_NORTE, "ofrecer_otra"));
  assert.equal(ultimo.estado.paso, "otra_sucursal");
  assert.equal(ultimo.pasarAAsesor, null);
  assert.deepEqual(ultimo.respuestas, [textos.ofrecerOtraSucursal("Luis", 30, "Norte", SUR)]);
  assert.equal(ultimo.respuestas[0], "En la sucursal Norte por ahora no tenemos clases para Luis (30 años), pero en la sucursal Sur Poniente sí. ¿Quieres que te cotice ahí? Responde sí o no.");
});

test("C7: la oferta incluye la dirección cuando la sucursal la tiene", () => {
  const ctx = conPolitica(SOLO_NINOS_EN_NORTE, "ofrecer_otra", { sucursales: [{ ...SUR, id: "s-a", nombre: "Alfa", direccion: null }, { ...NORTE, nombre: "Zeta" }] });
  const ctx2 = { ...ctx, cotizador: { ...ctx.cotizador!, catalogo: { ...ctx.cotizador!.catalogo, programas: [programa("ninos", "Programa niños", 3, 12, { sucursalId: "s-a" }), programa("grande", "Programa grande", 3, 99, { sucursalId: NORTE.id })] } } };
  const { ultimo } = conversar(["Hola", "Luis", "30", "1"], ctx2); // 1 = Alfa (sin programa para 30)
  assert.match(ultimo.respuestas[0]!, /pero en la sucursal Zeta \(Calle 1\) sí/);
});

test("C7: aceptar con «sí» recotiza en la otra sucursal, la guarda como sucursal del lead y sigue (programa único → anota y cierra)", () => {
  const ctx = conPolitica(SOLO_NINOS_EN_NORTE, "ofrecer_otra");
  for (const respuesta of ["sí", "Si", "claro", "1", "Sur Poniente", "ok.", "¡Sí, por favor!", "  SÍ  "]) {
    const { ultimo } = conversar(["Hola", "Luis", "30", "1", respuesta], ctx);
    assert.equal(ultimo.estado.sucursalId, SUR.id, respuesta);
    assert.equal(ultimo.estado.paso, "completo", respuesta);
    assert.deepEqual(ultimo.efectos, [{ tipo: "programa_sugerido", programaId: "sur" }], respuesta);
    assert.deepEqual(ultimo.respuestas, [textos.cierreConPrograma("Luis", "Programa del sur", "Sur Poniente")], respuesta);
    assert.equal(ultimo.pasarAAsesor, "captura_completa");
  }
});

test("C7: rechazar la oferta pasa al asesor con el motivo sin_programa y no anota programa", () => {
  const ctx = conPolitica(SOLO_NINOS_EN_NORTE, "ofrecer_otra");
  for (const respuesta of ["no", "No gracias", "mejor un asesor", "asesor"]) {
    const { ultimo } = conversar(["Hola", "Luis", "30", "1", respuesta], ctx);
    if (respuesta === "mejor un asesor") {
      assert.equal(ultimo.estado.paso, "otra_sucursal", "una frase libre no se entiende: reintenta");
      continue;
    }
    assert.equal(ultimo.pasarAAsesor, "sin_programa", respuesta);
    assert.equal(ultimo.estado.sucursalId, NORTE.id, "sigue en la sucursal que eligió");
    assert.equal(ultimo.efectos, undefined);
    assert.deepEqual(ultimo.respuestas, [textos.sinPrograma("Luis", 30, "Norte")]);
  }
});

test("C7: respuestas que no se entienden reintentan y a la tercera pasan al asesor (sin_entender)", () => {
  const ctx = conPolitica(SOLO_NINOS_EN_NORTE, "ofrecer_otra");
  const { ultimo, pasos } = conversar(["Hola", "Luis", "30", "1", "quizás", "mmm", "ni idea"], ctx);
  assert.deepEqual(pasos[4]!.respuestas, [textos.reintentoOtraSucursal([SUR])]);
  assert.equal(pasos[4]!.estado.intentosFallidos, 1);
  assert.equal(ultimo.pasarAAsesor, "sin_entender");
  assert.equal(ultimo.estado.paso, "otra_sucursal");
});

test("C7 avisar_asesor: sin programa pasa directo al asesor, sin ofrecer nada", () => {
  const { ultimo } = conversar(["Hola", "Luis", "30", "1"], conPolitica(SOLO_NINOS_EN_NORTE, "avisar_asesor"));
  assert.equal(ultimo.pasarAAsesor, "sin_programa");
  assert.equal(ultimo.estado.paso, "completo");
  assert.deepEqual(ultimo.respuestas, [textos.sinPrograma("Luis", 30, "Norte")]);
});

test("C7: si ninguna otra sucursal tiene programa para la edad, pasa al asesor aunque la política sea ofrecer_otra", () => {
  const { ultimo } = conversar(["Hola", "Luis", "30", "1"], conPolitica([programa("ninos", "Programa niños", 3, 12), programa("ninos-sur", "Niños sur", 3, 12, { sucursalId: SUR.id })], "ofrecer_otra"));
  assert.equal(ultimo.pasarAAsesor, "sin_programa");
});

test("C7 con varias sucursales con programa: lista numerada con dirección y se elige por número o nombre", () => {
  const TRES = [NORTE, SUR, { id: "s-este", nombre: "Este", direccion: "Av. 3" }];
  const programas = [programa("ninos", "Programa niños", 3, 12), programa("sur", "Programa del sur", 3, 99, { sucursalId: SUR.id }), programa("este", "Programa del este", 3, 99, { sucursalId: "s-este" })];
  const ctx = conPolitica(programas, "ofrecer_otra", { sucursales: TRES });
  // El orden de las sucursales (para la pregunta) es: Norte, Sur Poniente, Este → el contacto elige Norte (1).
  const base = conversar(["Hola", "Luis", "30", "1"], ctx);
  assert.deepEqual(base.ultimo.respuestas, [textos.ofrecerOtrasSucursales("Luis", 30, "Norte", [SUR, TRES[2]!])]);
  assert.match(base.ultimo.respuestas[0]!, /\n1\. Sur Poniente\n2\. Este \(Av\. 3\)$/);
  for (const [respuesta, sucursal] of [["2", "s-este"], ["Este", "s-este"], ["1", SUR.id]] as const) {
    const r = avanzar(base.estado, respuesta, ctx);
    assert.equal(r.estado.sucursalId, sucursal, respuesta);
  }
  assert.equal(avanzar(base.estado, "3", ctx).estado.intentosFallidos, 1, "fuera de la lista");
  assert.equal(avanzar(base.estado, "no", ctx).pasarAAsesor, "sin_programa");
  // Un «sí» no sirve cuando hay que elegir entre varias.
  assert.equal(avanzar(base.estado, "sí", ctx).estado.paso, "otra_sucursal");
});

test("C7: si al aceptar la otra sucursal tampoco hay programa (el catálogo cambió), no se ofrece de nuevo: pasa al asesor", () => {
  const ctx = conPolitica(SOLO_NINOS_EN_NORTE, "ofrecer_otra");
  const base = conversar(["Hola", "Luis", "30", "1"], ctx);
  const sinProgramaEnSur = { ...ctx, cotizador: { ...ctx.cotizador!, catalogo: { ...ctx.cotizador!.catalogo, programas: [programa("ninos", "Programa niños", 3, 12)] } } };
  assert.equal(avanzar(base.estado, "sí", sinProgramaEnSur).pasarAAsesor, "sin_programa");
});

test("C7: un catálogo vacío para la vertical NO cuenta como «sin programa»: la captura cierra como siempre", () => {
  const { ultimo } = conversar(["Hola", "Luis", "30", "1"], conPolitica([], "ofrecer_otra"));
  assert.equal(ultimo.pasarAAsesor, "captura_completa");
  assert.deepEqual(ultimo.respuestas, [textos.cierre("Luis", "Norte")]);
});

test("C7 con varios programas en la otra sucursal, tras aceptar pregunta cuál (C6)", () => {
  const programas = [programa("ninos", "Programa niños", 3, 12), programa("a", "Estilo A", 15, 99, { sucursalId: SUR.id, permiteTraslape: true }), programa("b", "Estilo B", 15, 99, { sucursalId: SUR.id, permiteTraslape: true })];
  const r = conversar(["Hola", "Luis", "30", "1", "sí"], conPolitica(programas, "ofrecer_otra")).ultimo;
  assert.equal(r.estado.paso, "programa");
  assert.equal(r.estado.sucursalId, SUR.id);
});

test("el resumen para el asesor del motivo sin_programa lo dice", () => {
  const nota = textos.resumenAsesor("sin_programa", { nombre: "Luis", edad: 30, sucursal: "Norte", telefono: "+525512340001" });
  assert.match(nota, /no tiene programa para la edad/);
  assert.match(nota, /• Sucursal: Norte/);
});
