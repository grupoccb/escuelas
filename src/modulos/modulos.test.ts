// V1: lo puro de los módulos — el catálogo, las dependencias, los mensajes y la cobertura de eventos y tipos de tarea contra el esquema de la base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COLUMNA_DE_MODULO,
  DEFINICION_DE_MODULOS,
  MODULOS,
  MODULOS_APAGABLES,
  MODULO_DE_EVENTO,
  MODULO_DE_TIPO_DE_TAREA,
  SOLO_CAPTACION,
  TODOS_ENCENDIDOS,
  eventosEncendidos,
  explicarProblemas,
  moduloDeEvento,
  problemasDeDependencia,
  tiposDeTareaApagados,
  type ModulosEncendidos,
} from "./index.ts";

const ESQUEMA = readFileSync(resolve(import.meta.dirname, "../../prisma/schema.prisma"), "utf8");

/** Los valores de un enum del esquema de la base (sin comentarios). */
function valoresDeEnum(nombre: string): string[] {
  const m = new RegExp(`enum ${nombre} \\{([^}]*)\\}`).exec(ESQUEMA);
  assert.ok(m, `no encontré el enum ${nombre}`);
  return m[1]!.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("//"));
}

const con = (cambios: Partial<ModulosEncendidos>): ModulosEncendidos => ({ ...TODOS_ENCENDIDOS, ...cambios });

test("los dos estados de fábrica son coherentes: todo encendido y solo captación", () => {
  assert.deepEqual(problemasDeDependencia(TODOS_ENCENDIDOS), []);
  assert.deepEqual(problemasDeDependencia(SOLO_CAPTACION), []);
  assert.deepEqual(MODULOS.filter((m) => SOLO_CAPTACION[m]), ["captacion"]);
  assert.ok(MODULOS.every((m) => TODOS_ENCENDIDOS[m]));
});

test("el catálogo: siete módulos, la captación no se apaga y cada uno tiene nombre, línea de ayuda y dependencias que existen", () => {
  assert.equal(MODULOS.length, 7);
  assert.deepEqual([...MODULOS_APAGABLES], MODULOS.filter((m) => m !== "captacion"));
  for (const m of MODULOS) {
    const d = DEFINICION_DE_MODULOS[m];
    assert.ok(d.nombre.length > 0 && d.incluye.length > 20, m);
    for (const r of d.requiere) assert.ok((MODULOS as readonly string[]).includes(r), `${m} requiere ${r}`);
    assert.ok(!d.requiere.includes(m), `${m} no se requiere a sí mismo`);
  }
  assert.deepEqual(DEFINICION_DE_MODULOS.captacion.requiere, []);
  // Los nombres que ve la escuela (sin identificadores técnicos ni inglés).
  assert.equal(DEFINICION_DE_MODULOS.operacion.nombre, "Operación diaria (asistencia, niveles y eventos)");
  assert.equal(DEFINICION_DE_MODULOS.clase_muestra.nombre, "Clase muestra");
});

test("cada módulo apagable tiene su columna en el esquema de la base, y la base impone las dependencias con un CHECK", () => {
  for (const m of MODULOS_APAGABLES) assert.match(ESQUEMA, new RegExp(`${COLUMNA_DE_MODULO[m]}\\s+Boolean\\s+@default\\(true\\)`), m);
  const migracion = readFileSync(resolve(import.meta.dirname, "../../prisma/migrations/20261025000000_v1_modulos/migration.sql"), "utf8");
  assert.match(migracion, /configuracion_modulos_dependencias_chk/);
});

test("dependencias: lo que falta se nombra, y encender o apagar da el mensaje que dice qué hacer primero (sin cascada)", () => {
  // Encender algo a lo que le falta su base.
  const base = con({ inscripcion: false, operacion: false, finanzas: false, tableros: false });
  assert.deepEqual(explicarProblemas(base, con({ ...base, finanzas: true })), ["Para encender Finanzas primero hay que encender Inscripción."]);
  assert.deepEqual(explicarProblemas(base, con({ ...base, operacion: true })), ["Para encender Operación diaria (asistencia, niveles y eventos) primero hay que encender Inscripción."]);
  // Los tableros piden inscripción, finanzas y clase muestra.
  const sinTodo = con({ cotizador: false, clase_muestra: false, inscripcion: false, operacion: false, finanzas: false, tableros: false });
  assert.equal(explicarProblemas(sinTodo, con({ ...sinTodo, tableros: true })).length, 3);
  // Apagar algo de lo que otro depende.
  assert.deepEqual(explicarProblemas(TODOS_ENCENDIDOS, con({ inscripcion: false })), [
    "Para apagar Inscripción primero hay que apagar Operación diaria (asistencia, niveles y eventos).",
    "Para apagar Inscripción primero hay que apagar Finanzas.",
    "Para apagar Inscripción primero hay que apagar Tableros.",
  ]);
  assert.deepEqual(explicarProblemas(TODOS_ENCENDIDOS, con({ clase_muestra: false })), ["Para apagar Clase muestra primero hay que apagar Tableros."]);
  // Lo que se puede: apagar hojas, y encender en orden.
  assert.deepEqual(explicarProblemas(TODOS_ENCENDIDOS, con({ tableros: false })), []);
  assert.deepEqual(explicarProblemas(TODOS_ENCENDIDOS, con({ cotizador: false })), ["Para apagar Cotizador primero hay que apagar Inscripción."], "el asistente de inscripción elige grupo con la oferta del cotizador");
  assert.deepEqual(explicarProblemas(TODOS_ENCENDIDOS, con({ operacion: false })), []);
  assert.deepEqual(explicarProblemas(SOLO_CAPTACION, con({ ...SOLO_CAPTACION, inscripcion: true })), ["Para encender Inscripción primero hay que encender Cotizador."]);
  assert.deepEqual(explicarProblemas(SOLO_CAPTACION, con({ ...SOLO_CAPTACION, cotizador: true, inscripcion: true, finanzas: true })), []);
});

test("la captación no se apaga (módulo base)", () => {
  assert.deepEqual(explicarProblemas(TODOS_ENCENDIDOS, con({ captacion: false })).slice(0, 1), ["Captación no se puede apagar: por ahí entran los contactos."]);
});

test("todo evento de automatización del esquema tiene su módulo (un evento nuevo sin módulo hace fallar este test), y nada sobra", () => {
  const delEsquema = valoresDeEnum("evento_disparador");
  assert.deepEqual(Object.keys(MODULO_DE_EVENTO).sort(), [...delEsquema].sort());
  assert.equal(moduloDeEvento("cargo_vencido"), "finanzas");
  assert.equal(moduloDeEvento("inventado"), null);
  assert.deepEqual(eventosEncendidos(SOLO_CAPTACION).sort(), ["lead_frio", "lead_sin_respuesta"]);
  assert.equal(eventosEncendidos(TODOS_ENCENDIDOS).length, delEsquema.length);
});

test("todo tipo de tarea del esquema tiene su módulo, y los tipos de los módulos apagados se excluyen", () => {
  assert.deepEqual(Object.keys(MODULO_DE_TIPO_DE_TAREA).sort(), valoresDeEnum("tipo_tarea_asesor").sort());
  assert.deepEqual(tiposDeTareaApagados(TODOS_ENCENDIDOS), []);
  const apagados = new Set(tiposDeTareaApagados(SOLO_CAPTACION));
  for (const t of ["deuda_vencida", "faltas_consecutivas", "llamar_no_asistio", "lista_espera_nueva", "cobranza_sin_canal"]) assert.ok(apagados.has(t as never), t);
  for (const t of ["sin_plantilla_apta", "lead_frio", "evento_inesperado", "baja_solicitada"]) assert.ok(!apagados.has(t as never), t);
});
