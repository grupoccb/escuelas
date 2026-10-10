// V1: cada ruta de /api pertenece a un módulo (o al módulo base, la captación). Este test recorre el router REAL y falla si una ruta nueva no cae en ninguna fila de
// `modulos-rutas.ts`; además compara un conjunto acordado a mano de rutas con su módulo, y falla si una fila de la tabla ya no reclama ninguna ruta real (fila muerta).

import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULOS, SOLO_CAPTACION, TODOS_ENCENDIDOS, type Modulo } from "../modulos/index.ts";
import { concretas, rutasDeApiReales, UUID_DE_PRUEBA } from "../testutil/rutas-reales.ts";
import { variantesDeRuta } from "../testutil/variantes-de-ruta.ts";
import { MODULO_DE_PERMISO, moduloDeRuta, normalizarRuta, patronDeRuta, PATRONES_DE_MODULOS, permisosEfectivos } from "./modulos-rutas.ts";
import { PERMISOS, permisosDe } from "./permisos.ts";

const UUID = UUID_DE_PRUEBA;

/** Lo acordado a mano: método, patrón del router y su módulo. */
const ACORDADO: Record<string, Modulo> = {
  // base
  "POST /api/sesion": "captacion",
  "GET /api/yo": "captacion",
  "GET /api/modulos": "captacion",
  "PUT /api/modulos": "captacion",
  "GET /api/leads": "captacion",
  "GET /api/leads/:id": "captacion",
  "GET /api/leads/estancados": "captacion",
  "PATCH /api/leads/:id/etapa": "captacion",
  "GET /api/etapas": "captacion",
  "GET /api/tareas": "captacion",
  "GET /api/conversaciones": "captacion",
  "GET /api/campanas/:id/qr": "captacion",
  "GET /api/codigos-rastreo": "captacion",
  "GET /api/exportaciones/leads": "captacion",
  "GET /api/verticales": "captacion",
  "GET /api/grupos": "captacion",
  "GET /api/programas": "captacion",
  "GET /api/precios": "captacion",
  "GET /api/catalogo/plantillas": "captacion",
  "POST /api/catalogo/importacion": "captacion",
  "GET /api/promociones": "captacion",
  "GET /api/plantillas": "captacion",
  "GET /api/automatizaciones": "captacion",
  "GET /api/configuracion": "captacion",
  "GET /api/documentos-legales": "captacion",
  "GET /api/motivos-baja": "captacion",
  "GET /api/registro-cambios": "captacion",
  // cotizador
  "GET /api/cotizador": "cotizador",
  "GET /api/leads/:id/cotizaciones": "cotizador",
  "POST /api/leads/:id/cotizaciones": "cotizador",
  "GET /api/lista-espera": "cotizador",
  "PATCH /api/lista-espera/:id": "cotizador",
  // clase muestra
  "GET /api/clases-muestra": "clase_muestra",
  "GET /api/clases-muestra/sesiones": "clase_muestra",
  "POST /api/clases-muestra": "clase_muestra",
  "POST /api/clases-muestra/:id/listo-para-cerrar": "clase_muestra",
  "PATCH /api/clases-muestra/:id/registro": "clase_muestra",
  "GET /api/documentos-legales/vigentes": "clase_muestra",
  "GET /api/maestro/clases-muestra": "clase_muestra",
  "GET /api/maestro/avisos": "clase_muestra",
  "GET /api/salud/:sujeto_tipo/:sujeto_id": "clase_muestra",
  // inscripción
  "GET /api/tutores": "inscripcion",
  "POST /api/tutores": "inscripcion",
  "GET /api/tutores/:id": "inscripcion",
  "GET /api/alumnos": "inscripcion",
  "GET /api/alumnos/:id": "inscripcion",
  "GET /api/alumnos/:id/expediente": "inscripcion",
  "GET /api/familias/un-solo-hijo": "inscripcion",
  "GET /api/inscripciones": "inscripcion",
  "POST /api/inscripciones/:id/baja": "inscripcion",
  "GET /api/leads/:id/conversion": "inscripcion",
  "POST /api/leads/:id/convertir": "inscripcion",
  "GET /api/reportes/ocupacion": "inscripcion",
  // operación
  "GET /api/grupos/:id/pase": "operacion",
  "PUT /api/grupos/:id/pase": "operacion",
  "GET /api/grupos/:id/asistencia/derivados": "operacion",
  "GET /api/inscripciones/:id/asistencia": "operacion",
  "GET /api/niveles": "operacion",
  "POST /api/niveles": "operacion",
  "GET /api/alumnos/:id/progresion": "operacion",
  "POST /api/alumnos/:id/progresion": "operacion",
  "GET /api/eventos": "operacion",
  "POST /api/eventos/:id/alumnos": "operacion",
  // finanzas
  "GET /api/cargos": "finanzas",
  "POST /api/pagos": "finanzas",
  "GET /api/pagos/propuesta": "finanzas",
  "GET /api/tutores/:id/estado-cuenta": "finanzas",
  "GET /api/beneficios/por-entregar": "finanzas",
  "POST /api/beneficios/:id/entregar": "finanzas",
  "GET /api/productos": "finanzas",
  "POST /api/ventas": "finanzas",
  "GET /api/exportaciones/estado-cuenta": "finanzas",
  "GET /api/exportaciones/uniformes-por-entregar": "finanzas",
  // tableros
  "GET /api/reportes/clases-muestra": "tableros",
  "GET /api/reportes/costo-por-alumno": "tableros",
  "GET /api/reportes/ejecutivo": "tableros",
  "GET /api/campanas/:id/gastos": "tableros",
  "POST /api/campanas/:id/gastos": "tableros",
  "DELETE /api/campanas/:id/gastos/:gasto_id": "tableros",
};

test("toda ruta de /api del router real pertenece a un módulo (o a la captación): una ruta nueva sin fila hace fallar este test", () => {
  const sinModulo: string[] = [];
  for (const r of rutasDeApiReales()) {
    const patron = r.clave.split(" ")[1]!;
    for (const c of concretas(patron)) if (moduloDeRuta(c) === null) sinModulo.push(`${r.clave} → ${c}`);
  }
  assert.deepEqual(sinModulo, [], "agrega la ruta a src/api/modulos-rutas.ts");
});

test("las rutas acordadas a mano caen en el módulo acordado, y todas existen en el router real", () => {
  const reales = new Set(rutasDeApiReales().map((r) => r.clave));
  for (const [clave, esperado] of Object.entries(ACORDADO)) {
    assert.ok(reales.has(clave), `${clave} no existe en el router real`);
    const patron = clave.split(" ")[1]!;
    for (const c of concretas(patron)) {
      // El sujeto de salud depende del tipo: prospecto → clase muestra, alumno → inscripción.
      const esperadoAqui = patron.includes(":sujeto_tipo") ? (c.includes("/prospecto/") ? "clase_muestra" : "inscripcion") : esperado;
      assert.equal(moduloDeRuta(c), esperadoAqui, clave);
    }
  }
});

test("ninguna fila de la tabla está muerta: cada patrón es la fila ganadora de al menos una ruta real, y cada módulo tiene rutas", () => {
  const concretasReales = rutasDeApiReales().flatMap((r) => concretas(r.clave.split(" ")[1]!));
  const ganadoras = new Set(concretasReales.map((c) => patronDeRuta(c)));
  const muertas = PATRONES_DE_MODULOS.filter(({ patron }) => !ganadoras.has(patron)).map(({ patron }) => patron);
  assert.deepEqual(muertas, [], "quita de src/api/modulos-rutas.ts las filas que ya no reclaman ninguna ruta");
  for (const m of MODULOS) assert.ok(concretasReales.some((c) => moduloDeRuta(c) === m), `el módulo ${m} no tiene ninguna ruta`);
});

test("control negativo: una ruta desconocida no pertenece a ningún módulo, y un patrón nuevo con parámetro cae donde se pone", () => {
  assert.equal(moduloDeRuta("/api/ruta-nueva"), null);
  assert.equal(moduloDeRuta("/api/pagos/nuevo/algo/mas"), "finanzas", "lo que cuelga de un árbol hereda su módulo");
  assert.equal(moduloDeRuta("/api/leads/estancados/"), "captacion", "la barra final no cambia el módulo");
  assert.equal(moduloDeRuta(`/api/leads/${UUID}/convertir`), "inscripcion", "la excepción gana al árbol de captación");
  assert.equal(moduloDeRuta(`/api/leads/${UUID}/cotizaciones`), "cotizador");
});

// V13-fix EV-01: la guarda se saltaba cambiando las mayúsculas (`/API/cargos`, `/api/leads/:id/Convertir`). Express enrutaba sin distinguirlas y la tabla sí: la ruta no caía en
// ninguna fila y la guarda dejaba pasar. Ahora la clasificación normaliza (minúsculas, una sola decodificación, sin barras repetidas ni final) y el router distingue mayúsculas.
test("EV-01: TODAS las rutas de módulo (109 hoy) clasifican en su módulo con cualquier capitalización, barra final, doble barra, codificación y consulta", () => {
  let rutasDeModulo = 0;
  let variantesProbadas = 0;
  const fallas: string[] = [];
  const conColaDistinta = new Set<string>();
  for (const r of rutasDeApiReales()) {
    const patron = r.clave.split(" ")[1]!;
    for (const c of concretas(patron)) {
      const esperado = moduloDeRuta(c);
      assert.ok(esperado !== null, c);
      if (esperado === "captacion") continue;
      rutasDeModulo++;
      for (const v of variantesDeRuta(c).filter((x) => !x.soloServidor)) {
        variantesProbadas++;
        const real = moduloDeRuta(v.ruta);
        if (real !== esperado) fallas.push(`${r.clave}: ${v.tipo}: ${v.ruta} → ${real} (esperado ${esperado})`);
        if (v.tipo.startsWith("solo el segmento")) conColaDistinta.add(r.clave);
      }
    }
  }
  assert.deepEqual(fallas, [], `se escapan ${fallas.length} variantes`);
  assert.ok(rutasDeModulo >= 109, `deben recorrerse las 109 rutas de módulo (hubo ${rutasDeModulo})`);
  assert.ok(variantesProbadas > rutasDeModulo * 10);
  // Las 18 rutas de módulo que cuelgan de un árbol de captación (cotizaciones, convertir, gastos, pase…) se probaron con SOLO la cola en otra capitalización.
  const colas = ["/api/leads/:id/cotizaciones", "/api/leads/:id/convertir", "/api/leads/:id/conversion", "/api/campanas/:id/gastos", "/api/grupos/:id/pase", "/api/tutores/:id/estado-cuenta", "/api/salud/:sujeto_tipo/:sujeto_id"];
  for (const patron of colas) assert.ok([...conColaDistinta].some((k) => k.endsWith(` ${patron}`)), patron);
});

test("EV-01: normalizarRuta deja una sola forma (minúsculas, una decodificación, sin barras repetidas ni final) y no se rompe con codificaciones inválidas", () => {
  assert.equal(normalizarRuta("/API/Cargos/"), "/api/cargos");
  assert.equal(normalizarRuta("/api//cargos//"), "/api/cargos");
  assert.equal(normalizarRuta("/api/%63argos"), "/api/cargos");
  assert.equal(normalizarRuta("/api/%2563argos"), "/api/%63argos", "una sola decodificación: lo doblemente codificado no se decodifica dos veces");
  assert.equal(normalizarRuta("/api/%E0%A4%A"), "/api/%e0%a4%a", "una codificación rota no lanza: se usa tal cual");
  assert.equal(normalizarRuta("/"), "/");
  assert.equal(moduloDeRuta("/API/REPORTES/EJECUTIVO"), "tableros");
  assert.equal(moduloDeRuta("/api/leads/x/Convertir"), "inscripcion");
});

test("cada permiso de la matriz tiene su módulo, y los permisos efectivos quitan los de un módulo apagado (y solo esos)", () => {
  assert.deepEqual(Object.keys(MODULO_DE_PERMISO).sort(), [...PERMISOS].sort());
  assert.deepEqual(permisosEfectivos("administrador", TODOS_ENCENDIDOS), permisosDe("administrador"));
  const soloCaptacion = permisosEfectivos("administrador", SOLO_CAPTACION);
  for (const p of ["cargos:leer", "pagos:registrar", "clases_muestra:leer", "cotizador:leer", "alumnos:leer", "asistencia:registrar", "eventos:leer", "reportes:ejecutivo"] as const) assert.ok(!soloCaptacion.includes(p), p);
  for (const p of ["leads:leer", "leads:escribir", "tareas:leer", "catalogo:escribir", "usuarios:administrar", "registro_cambios:leer"] as const) assert.ok(soloCaptacion.includes(p), p);
  // Las filas de la matriz de cada rol se conservan: solo se filtra por módulo.
  for (const rol of ["administrador", "asesor", "recepcion", "maestro"] as const) {
    assert.deepEqual(permisosEfectivos(rol, SOLO_CAPTACION), permisosDe(rol).filter((p) => MODULO_DE_PERMISO[p] === "captacion"));
  }
});
