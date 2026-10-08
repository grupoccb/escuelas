// C4: el catálogo completo de la organización de demo (las tres verticales del insumo) cargado por el seed
// real `prisma/seed/catalogo-completo.sql`, y las TRES verificaciones del insumo sobre él: traslape de edades
// (un caso conocido, que son alternativas), capacidad por sucursal (184 y 116) y choques de salón (0, con la
// tabla `salon`). Este archivo no nombra ninguna vertical ni sucursal (check:generico): lee lo que dicen las tablas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { promocionesAplicables } from "../promociones/cargar.ts";
import { precioVigente } from "./precios.ts";
import { alternativasPorEdad, cargarCatalogo, choquesDeInstructor, choquesDeSalon, resumenDeCapacidad, traslapesDeEdad } from "./verificacion.ts";

let prisma: PrismaPruebas;
let orgId: string;
let prefijo: string;

const ID_FIJO = /00000000-0000-4000-8000-000000000(\d{3})/g;
const SEEDS = ["demo", "catalogo", "catalogo-completo"] as const;

async function aplicar(cliente: pg.Client, archivo: string): Promise<void> {
  const sql = readFileSync(`prisma/seed/${archivo}.sql`, "utf8").replace(ID_FIJO, `${prefijo}-0000-4000-8000-000000000$1`).replaceAll("escuela-demo", `escuela-${prefijo}`);
  await cliente.query(sql);
}

before(async () => {
  prisma = crearPrismaDePruebas();
  prefijo = randomBytes(4).toString("hex");
  orgId = `${prefijo}-0000-4000-8000-000000000001`;
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    for (const s of SEEDS) await aplicar(cliente, s);
    await aplicar(cliente, "catalogo-completo"); // idempotente: la segunda corrida no duplica ni falla
  } finally {
    await cliente.end();
  }
});
after(async () => {
  await prisma.$disconnect();
});

const db = () => conAlcance(prisma, orgId);

test("el seed completo deja EXACTAMENTE lo que dice la revisión del insumo: 3 verticales, 2 sucursales, 6 filas de sucursal_vertical, 14 programas, 18 grupos y 31 horarios", async () => {
  assert.equal(await db().vertical.count(), 3);
  assert.equal(await db().sucursal.count(), 2);
  assert.equal(await db().sucursal_vertical.count(), 6);
  assert.equal(await db().programa.count(), 14);
  assert.equal(await db().grupo.count(), 18);
  assert.equal(await db().grupo_horario.count(), 31);
  assert.equal(await db().salon.count(), 4, "un salón por (sucursal, nombre) de los grupos");
  assert.equal(await db().grupo.count({ where: { salon_id: null } }), 0, "todo grupo del insumo tiene salón");
  assert.equal(await db().grupo.count({ where: { instructor_id: null } }), 0, "y un instructor de ejemplo");
  assert.equal(await db().grupo.count({ where: { cupo_maximo: { lt: 1 } } }), 0);
  assert.equal(await db().grupo_horario.count({ where: { grupo: { eliminado_en: { not: null } } } }), 0);
  // Cada programa tiene al menos un grupo, y cada grupo al menos un horario.
  const c = await cargarCatalogo(db());
  for (const p of c.programas) assert.ok(c.grupos.some((g) => g.programaId === p.id), `programa ${p.nombre} sin grupos`);
  for (const g of c.grupos) assert.ok(c.horarios.some((h) => h.grupoId === g.id), `grupo ${g.nombre} sin horarios`);
});

test("las verticales traen sus textos: etiqueta de progresión y de evento, si usan progresión y color de marca (los textos viven en la tabla)", async () => {
  const vs = await db().vertical.findMany({ orderBy: { slug: "asc" } });
  assert.equal(vs.length, 3);
  assert.deepEqual(vs.map((v) => v.usa_progresion).sort(), [false, true, true], "dos usan progresión y una no");
  for (const v of vs) {
    assert.ok(v.etiqueta_evento && v.etiqueta_evento.length > 0, v.slug);
    assert.match(v.color_marca ?? "", /^#[0-9A-Fa-f]{6}$/, v.slug);
    assert.equal(v.logo_url, null, "[SUPUESTO] el logo lo sube la escuela");
    if (v.usa_progresion) assert.ok(v.etiqueta_progresion, `${v.slug} usa progresión y tiene su etiqueta`);
  }
  assert.equal(new Set(vs.map((v) => v.color_marca)).size, 3, "cada vertical su color");
  // Una vertical que usa progresión sin su etiqueta, o un color mal escrito, los rechaza la base.
  await assert.rejects(prisma.vertical.update({ where: { id: vs[0]!.id }, data: { usa_progresion: true, etiqueta_progresion: null } }), /vertical_progresion_check/);
  await assert.rejects(prisma.vertical.update({ where: { id: vs[0]!.id }, data: { color_marca: "rojo" } }), /vertical_color_marca_check/);
});

test("verificación 1 (traslape de edades): CERO errores; el único caso conocido —dos programas con el mismo rango en una sucursal— son ALTERNATIVAS marcadas, no un error", async () => {
  const c = await cargarCatalogo(db());
  assert.deepEqual(traslapesDeEdad(c), []);
  const alternativas = alternativasPorEdad(c);
  assert.equal(alternativas.length, 1, "el insumo reporta exactamente 1");
  const [a] = alternativas;
  assert.deepEqual([a!.edadDesde, a!.edadHasta], [15, 99]);
  assert.notEqual(a!.programaA, a!.programaB);
  const marcados = await db().programa.findMany({ where: { permite_traslape: true } });
  assert.equal(marcados.length, 2, "solo esos dos programas están marcados");
  // Desmarcar uno convierte el caso conocido en un error del catálogo.
  const sinMarca = { ...c, programas: c.programas.map((p) => (p.id === marcados[0]!.id ? { ...p, permiteTraslape: false } : p)) };
  assert.equal(traslapesDeEdad(sinMarca).length, 1);
});

test("verificación 2 (capacidad por sucursal): 184 y 116 lugares, los del insumo", async () => {
  const c = await cargarCatalogo(db());
  const porSucursal = new Map<string, number>();
  const filas = resumenDeCapacidad(c);
  for (const f of filas) porSucursal.set(f.sucursal, (porSucursal.get(f.sucursal) ?? 0) + f.capacidad);
  assert.deepEqual([...porSucursal.values()].sort((x, y) => x - y), [116, 184]);
  assert.equal(filas.length, 6, "tres verticales en cada una de las dos sucursales");
  assert.deepEqual(filas.reduce((n, f) => n + f.programas, 0), 14);
  assert.equal(filas.reduce((n, f) => n + f.grupos, 0), 18);
});

test("verificación 3 (choques de salón): CERO, ahora sobre la tabla `salon`; y tampoco hay choques de instructor", async () => {
  const c = await cargarCatalogo(db());
  assert.deepEqual(choquesDeSalon(c), []);
  assert.deepEqual(choquesDeInstructor(c), []);
  // Y la base lo impide por sí sola: otro grupo en el mismo salón y hora se rechaza.
  const g = await db().grupo.findFirstOrThrow({ where: { horarios: { some: { eliminado_en: null } } }, include: { horarios: { where: { eliminado_en: null } }, programa: true } });
  const otroPrograma = await db().programa.findFirstOrThrow({ where: { sucursal_id: g.programa.sucursal_id } });
  const intruso = await prisma.grupo.create({ data: { organizacion_id: orgId, programa_id: otroPrograma.id, nombre: "Intruso", cupo_maximo: 5, salon_id: g.salon_id } });
  const h = g.horarios[0]!;
  await assert.rejects(
    prisma.grupo_horario.create({ data: { organizacion_id: orgId, grupo_id: intruso.id, dia_semana: h.dia_semana, hora_inicio_min: h.hora_inicio_min, hora_fin_min: h.hora_fin_min } }),
    /choque_de_ocupacion/,
  );
  await prisma.grupo.update({ where: { id: intruso.id }, data: { eliminado_en: new Date() } });
});

test("los 14 programas tienen precio de ejemplo vigente (con centavos exactos) y la misma mensualidad en las dos sucursales", async () => {
  const programas = await db().programa.findMany({ orderBy: { id: "asc" } });
  const porNombre = new Map<string, bigint[]>();
  for (const p of programas) {
    const v = await precioVigente(db(), p.id, "2026-10-15");
    assert.ok(v, `${p.nombre} sin precio vigente`);
    assert.equal(v.moneda, "MXN");
    assert.ok(v.costoInscripcion > 0n && v.costoMensualidad > 0n);
    assert.equal(v.hasta, null, "abierto");
    assert.equal(await precioVigente(db(), p.id, "2025-12-31"), null, "antes de la vigencia no hay");
    porNombre.set(p.nombre, [...(porNombre.get(p.nombre) ?? []), v.costoMensualidad]);
  }
  for (const [nombre, montos] of porNombre) assert.equal(new Set(montos).size, 1, `${nombre}: mismo precio en las dos sucursales`);
  assert.equal(await db().precio.count(), 14);
});

test("las tres promociones de ejemplo funcionan con el resolutor sobre estos precios: inscripción gratis, uniforme pendiente y descuento por hermanos", async () => {
  assert.equal(await db().promocion.count(), 3);
  const programa = await db().programa.findFirstOrThrow({ include: { sucursal: true } });
  const precio = (await precioVigente(db(), programa.id, "2026-10-15"))!;
  const ctx = { fecha: "2026-10-15", verticalId: programa.vertical_id, sucursalId: programa.sucursal_id, programaId: programa.id, hermanosInscritos: 0, mesesPagadosPorAdelantado: 0, costoInscripcion: precio.costoInscripcion, costoMensualidad: precio.costoMensualidad };
  const sola = await promocionesAplicables(db(), ctx);
  assert.equal(sola.aplicadas.length, 2, "inscripción gratis y uniforme; hermanos todavía no");
  assert.equal(sola.inscripcion.finalAhora, 0n, "inscripción gratis");
  assert.equal(sola.mensualidad.finalAhora, precio.costoMensualidad, "la mensualidad no cambia");
  const uniforme = sola.lineas.find((l) => l.tipo === "producto_gratis")!;
  assert.deepEqual([uniforme.estado, uniforme.descripcion], ["pendiente", "Uniforme"]);
  const conHermano = await promocionesAplicables(db(), { ...ctx, hermanosInscritos: 1 });
  assert.equal(conHermano.aplicadas.length, 3);
  assert.equal(conHermano.mensualidad.descuentoAhora, (precio.costoMensualidad * 10n + 50n) / 100n, "10 % de la mensualidad");
  // Antes y después de la vigencia, ninguna.
  assert.equal((await promocionesAplicables(db(), { ...ctx, fecha: "2025-12-31" })).aplicadas.length, 0);
  assert.equal((await promocionesAplicables(db(), { ...ctx, fecha: "2028-01-01" })).aplicadas.length, 0);
});

test("cada vertical tiene su canal y su bandeja (sin duplicados), y las sucursales las imparten las tres", async () => {
  assert.equal(await db().canal_whatsapp.count(), 3);
  assert.equal(await db().bandeja_chatwoot.count(), 3);
  const bandejas = await db().bandeja_chatwoot.findMany({ include: { canal_whatsapp: true } });
  assert.equal(new Set(bandejas.map((b) => b.canal_whatsapp.vertical_id)).size, 3, "una bandeja por vertical");
  assert.equal(new Set(bandejas.map((b) => b.nombre)).size, 3);
  const sv = await db().sucursal_vertical.findMany();
  assert.equal(new Set(sv.map((x) => `${x.sucursal_id}|${x.vertical_id}`)).size, 6);
});

test("el orden de los seeds no importa: la segunda-vertical (que comparte los ids de la vertical y su bandeja) corre después sin duplicar nada", async () => {
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    await aplicar(cliente, "segunda-vertical");
    await aplicar(cliente, "segunda-vertical");
  } finally {
    await cliente.end();
  }
  assert.equal(await db().vertical.count(), 3);
  assert.equal(await db().canal_whatsapp.count(), 3);
  assert.equal(await db().bandeja_chatwoot.count(), 3);
  assert.equal(await db().sucursal_vertical.count(), 6);
});

test("catálogo vacío de la prueba de fuego: demo.sql solo da 1 vertical y la segunda-vertical agrega exactamente una (el seed completo no cambió eso)", async () => {
  const otro = randomBytes(4).toString("hex");
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    const como = (archivo: string) => readFileSync(`prisma/seed/${archivo}.sql`, "utf8").replace(ID_FIJO, `${otro}-0000-4000-8000-000000000$1`).replaceAll("escuela-demo", `escuela-${otro}`);
    await cliente.query(como("demo"));
    const n = async () => (await cliente.query("SELECT count(*)::int AS n FROM vertical WHERE organizacion_id = $1", [`${otro}-0000-4000-8000-000000000001`])).rows[0].n as number;
    assert.equal(await n(), 1);
    await cliente.query(como("segunda-vertical"));
    assert.equal(await n(), 2);
  } finally {
    await cliente.end();
  }
});
