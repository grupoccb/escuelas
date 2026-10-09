// La carga del catálogo (V6), de punta a punta contra la base real: simulación que no escribe NADA, aplicar todo o nada, idempotencia, actualizar sin borrar, precios con vigencia
// sin tocar lo ya cobrado, errores cruzados entre archivos, no-fuga entre organizaciones, solo administrador, módulos, concurrencia, el comando y los topes.
//
// "No escribe nada" se prueba con una HUELLA de toda la base (conteo y hash del contenido de cada tabla), no solo con el conteo de filas de unas tablas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conAlcance, type BaseDatos } from "../../datos/alcance.ts";
import { precioVigente } from "../precios.ts";
import { sembrarUsuario, levantarApi, type ApiLevantada, type ClienteApi } from "../../testutil/api.ts";
import { archivosDeCarga, catalogoDeEjemplo, conCelda, csvDeHoja, cuerpoDeCarga, type HojasDeEjemplo } from "../../testutil/catalogo-ejemplo.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarAlumno, sembrarOrganizacion, sembrarPrograma } from "../../testutil/semilla.ts";
import { ESQUEMAS } from "./esquemas.ts";
import { importarCatalogo, type Informe } from "./datos.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;

before(() => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 20);
  api = levantarApi(prisma, { sesion: { duracionMs: 3_600_000, inactividadMs: 3_600_000 } });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

// ── Ayudas ───────────────────────────────────────────────────────────────────────────────────────

interface Escuela {
  orgId: string;
  slug: string;
  admin: ClienteApi;
  adminId: string;
  correoAdmin: string;
  db: BaseDatos;
}

/** Una organización vacía (sin catálogo) con su administrador con la sesión iniciada. `modulos`: solo la captación, o todos. */
async function nuevaEscuela(modulos: "captacion" | "todos" = "captacion"): Promise<Escuela> {
  const slug = `carga-${randomBytes(5).toString("hex")}`;
  const org = await prisma.organizacion.create({ data: { nombre: `Escuela ${slug}`, slug } });
  if (modulos === "captacion") await fijarConfiguracion(prisma, org.id, { modulo_cotizador: false, modulo_clase_muestra: false, modulo_inscripcion: false, modulo_operacion: false, modulo_finanzas: false, modulo_tableros: false });
  else await fijarConfiguracion(prisma, org.id, {});
  const u = await sembrarUsuario(prisma, org.id, { rol: "administrador" });
  const admin = api.cliente();
  assert.equal((await admin.login(slug, u.correo, u.contrasena)).estado, 201);
  return { orgId: org.id, slug, admin, adminId: u.id, correoAdmin: u.correo, db: conAlcance(prisma, org.id) };
}

/** Entra a otra escuela con otro rol. */
async function entrarComo(e: Escuela, rol: "asesor" | "recepcion" | "maestro"): Promise<ClienteApi> {
  const u = await sembrarUsuario(prisma, e.orgId, { rol });
  const c = api.cliente();
  assert.equal((await c.login(e.slug, u.correo, u.contrasena)).estado, 201);
  return c;
}

/** Conteo y hash del contenido de cada tabla (menos las de sesión, que cambian con solo mirar): lo que no puede cambiar en una simulación. */
async function huella(): Promise<Record<string, string>> {
  const tablas = await prisma.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY 1`;
  const salida: Record<string, string> = {};
  for (const { table_name: t } of tablas) {
    if (["sesion", "intento_acceso"].includes(t)) continue;
    const f = await prisma.$queryRawUnsafe<{ n: number; h: string }[]>(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${t}" x`);
    salida[t] = `${f[0]!.n}:${f[0]!.h}`;
  }
  return salida;
}

async function conteos(e: Escuela): Promise<Record<string, number>> {
  const db = e.db;
  return {
    vertical: await db.vertical.count({}),
    sucursal: await db.sucursal.count({}),
    sucursal_vertical: await db.sucursal_vertical.count({}),
    salon: await db.salon.count({}),
    instructor: await db.instructor.count({}),
    instructor_sucursal: await db.instructor_sucursal.count({}),
    programa: await db.programa.count({}),
    grupo: await db.grupo.count({}),
    grupo_horario: await db.grupo_horario.count({}),
    precio: await db.precio.count({}),
    registro_cambio: await db.registro_cambio.count({}),
  };
}

const CATALOGO_COMPLETO = { vertical: 1, sucursal: 2, sucursal_vertical: 2, salon: 3, instructor: 2, instructor_sucursal: 3, programa: 3, grupo: 3, grupo_horario: 4, precio: 3 };

async function cargar(e: Escuela, modo: "simulacion" | "aplicar", hojas: Partial<HojasDeEjemplo>): Promise<Informe> {
  const r = await e.admin.post<Informe>("/api/catalogo/importacion", cuerpoDeCarga(modo, archivosDeCarga(hojas)));
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo).slice(0, 600));
  return r.cuerpo;
}

const textos = (i: Informe): string[] => i.errores.map((e) => `${e.archivo}: ${e.texto}`);

// ── Simulación ───────────────────────────────────────────────────────────────────────────────────

test("SIMULACIÓN: valida todo, reporta y NO escribe nada (ni el registro de cambios): la huella de toda la base es idéntica antes y después", async () => {
  const e = await nuevaEscuela();
  const antes = await huella();
  const limpia = await cargar(e, "simulacion", catalogoDeEjemplo());
  assert.equal(limpia.limpia, true, textos(limpia).join("\n"));
  assert.equal(limpia.aplicado, false);
  assert.equal(limpia.sin_cambios, false);
  assert.equal(limpia.modo, "simulacion");
  assert.deepEqual(limpia.resumen.map((r) => [r.clave, r.creados]), [["disciplinas", 1], ["sucursales", 2], ["oferta", 2], ["salones", 3], ["instructores", 2], ["programas", 3], ["grupos", 3], ["horarios", 4], ["precios", 3]]);
  assert.ok(limpia.cambios.length >= 20, "el detalle de cada cambio, en palabras");
  assert.ok(limpia.cambios.some((c) => c.descripcion === "Sucursal nueva: “Centro”"));
  assert.deepEqual(await huella(), antes, "una simulación limpia no deja huella");

  const sucia = await cargar(e, "simulacion", conCelda("grupos", 0, 4, "Sala 3"));
  assert.equal(sucia.limpia, false);
  assert.deepEqual(textos(sucia), ["grupos.csv: Fila 2, columna “Salón”: no existe el salón “Sala 3” en la sucursal “Centro”. Revisa el nombre o agrégalo en el archivo de salones."]);
  assert.deepEqual(sucia.cambios, [], "con errores no se promete ningún cambio");
  assert.deepEqual(await huella(), antes, "una simulación con errores tampoco");
  assert.deepEqual(await conteos(e), Object.fromEntries(Object.keys(await conteos(e)).map((k) => [k, 0])));

  // Por la biblioteca (lo que usa el comando): lo mismo.
  const porBiblioteca = await importarCatalogo(e.db, { archivos: archivosDeCarga(catalogoDeEjemplo()), modo: "simulacion", organizacionId: e.orgId });
  assert.equal(porBiblioteca.limpia, true);
  assert.deepEqual(await huella(), antes);
});

test("SIMULACIÓN sin archivos o con archivos que no se entienden: errores en palabras, nada escrito", async () => {
  const e = await nuevaEscuela();
  const antes = await huella();
  const vacia = await e.admin.post<Informe>("/api/catalogo/importacion", { modo: "simulacion", archivos: [] });
  assert.equal(vacia.estado, 200);
  assert.equal(vacia.cuerpo.limpia, false);
  assert.match(vacia.cuerpo.errores[0]!.texto, /no hay ningún archivo que cargar/);
  const raro = await e.admin.post<Informe>("/api/catalogo/importacion", cuerpoDeCarga("simulacion", [{ nombre: "notas.csv", bytes: Buffer.from("uno,dos\n1,2\n") }, ...archivosDeCarga({ sucursales: catalogoDeEjemplo().sucursales })]));
  assert.equal(raro.cuerpo.limpia, false);
  assert.match(raro.cuerpo.errores[0]!.texto, /notas\.csv|no se parece a ninguna de las plantillas/);
  assert.deepEqual(raro.cuerpo.archivos.map((a) => [a.nombre, a.hoja]), [["notas.csv", null], ["sucursales.csv", "sucursales"]]);
  assert.deepEqual(await huella(), antes);
});

// ── Aplicar ──────────────────────────────────────────────────────────────────────────────────────

test("APLICAR: crea todo, con el teléfono normalizado, el dinero exacto, las referencias por nombre y cada cambio en el registro de cambios", async () => {
  const e = await nuevaEscuela();
  const r = await cargar(e, "aplicar", catalogoDeEjemplo());
  assert.equal(r.aplicado, true, textos(r).join("\n"));
  assert.equal(r.sin_cambios, false);
  const c = await conteos(e);
  assert.deepEqual({ ...c, registro_cambio: 0 }, { ...CATALOGO_COMPLETO, registro_cambio: 0 });
  // Un registro por cosa creada: 1 + 2 + 2 ofertas + 3 + 2 + 3 + 3 + 3 precios = 19, más nada.
  assert.equal(c["registro_cambio"], 1 + 2 + 2 + 3 + 2 + 3 + 3 + 3);
  const registros = await e.db.registro_cambio.findMany({ select: { usuario_id: true, accion: true, entidad_tipo: true } });
  assert.ok(registros.every((x) => x.usuario_id === e.adminId && x.accion === "crear"));
  assert.deepEqual([...new Set(registros.map((x) => x.entidad_tipo))].sort(), ["grupo", "instructor", "precio", "programa", "salon", "sucursal", "sucursal_vertical", "vertical"]);

  // Teléfono normalizado, sucursales del instructor, color de la disciplina, slug de la landing.
  const ana = await e.db.instructor.findFirstOrThrow({ where: { nombre: "Ana Pérez" }, select: { telefono: true, correo: true, sucursales: { select: { sucursal: { select: { nombre: true } } } } } });
  assert.equal(ana.telefono, "+525512345678");
  assert.equal(ana.correo, "ana@ejemplo.com");
  assert.deepEqual(ana.sucursales.map((s) => s.sucursal.nombre), ["Centro"]);
  const luis = await e.db.instructor.findFirstOrThrow({ where: { nombre: "Luis Gómez" }, select: { sucursales: { select: { sucursal: { select: { nombre: true } } } } } });
  assert.deepEqual(luis.sucursales.map((s) => s.sucursal.nombre).sort(), ["Centro", "Norte"]);
  const vertical = await e.db.vertical.findFirstOrThrow({ select: { nombre: true, slug: true, color_marca: true, activo: true, usa_progresion: true, cotizador_whatsapp_activo: true } });
  assert.deepEqual(vertical, { nombre: "Disciplina A", slug: "disciplina-a", color_marca: "#2E7D32", activo: true, usa_progresion: false, cotizador_whatsapp_activo: false });
  // Dinero exacto en centavos: «900,50» con coma decimal y «$500.00».
  const juvenil = await e.db.programa.findFirstOrThrow({ where: { nombre: "Juvenil" }, select: { id: true, edad_min: true, edad_max: true, fecha_corte_edad: true, nivel: true, descripcion_publica: true, permite_traslape: true } });
  assert.equal(juvenil.fecha_corte_edad?.toISOString().slice(0, 10), "2026-09-01");
  assert.deepEqual([juvenil.edad_min, juvenil.edad_max, juvenil.nivel, juvenil.descripcion_publica, juvenil.permite_traslape], [10, 14, "Medio", "Para jóvenes", false]);
  const precio = await precioVigente(e.db, juvenil.id, "2026-10-01");
  assert.deepEqual([precio?.costoInscripcion, precio?.costoMensualidad, precio?.desde, precio?.hasta], [50000n, 90050n, "2026-09-01", null]);
  // El grupo con su salón, instructor, lista de espera y horarios.
  const grupo = await e.db.grupo.findFirstOrThrow({ where: { programa: { nombre: "Juvenil" } }, select: { nombre: true, cupo_maximo: true, permite_lista_espera: true, activo: true, salon: { select: { nombre: true } }, instructor: { select: { nombre: true } }, horarios: { select: { dia_semana: true, hora_inicio_min: true, hora_fin_min: true } } } });
  assert.deepEqual(grupo, { nombre: "Tarde", cupo_maximo: 8, permite_lista_espera: true, activo: true, salon: { nombre: "Sala 2" }, instructor: { nombre: "Luis Gómez" }, horarios: [{ dia_semana: 2, hora_inicio_min: 1020, hora_fin_min: 1080 }] });
  // El registro de cambios se puede consultar como siempre.
  const consulta = await e.admin.get<{ paginacion: { total: number } }>("/api/registro-cambios?entidad_tipo=salon");
  assert.equal(consulta.cuerpo.paginacion.total, 3);
});

test("APLICAR con errores: no escribe nada y devuelve los mismos errores que la simulación", async () => {
  const e = await nuevaEscuela();
  const antes = await huella();
  const hojas = conCelda("precios", 2, 3, "-1");
  const r = await cargar(e, "aplicar", hojas);
  assert.equal(r.aplicado, false);
  assert.equal(r.limpia, false);
  assert.deepEqual(textos(r), ["precios.csv: Fila 4, columna “Mensualidad”: «-1» es negativo. Escribe la cantidad sin signo, por ejemplo 500 o 500.50."]);
  assert.deepEqual(await huella(), antes);
  const simulada = await cargar(e, "simulacion", hojas);
  assert.deepEqual(simulada.errores, r.errores);
});

test("APLICAR es todo o nada: si falla al escribir la ÚLTIMA fila, no queda ni una de las anteriores", async () => {
  const e = await nuevaEscuela();
  const antes = await huella();
  // Un cliente de base que, dentro de la transacción de la carga, falla al crear el primer precio (lo último que se escribe).
  const real = e.db;
  const base = new Proxy(real, {
    get(destino, propiedad) {
      if (propiedad === "$conBloqueoDeClave") {
        return (org: string, clave: string, fn: (tx: unknown) => Promise<unknown>, opciones?: unknown) =>
          real.$conBloqueoDeClave(org, clave, (tx) => fn(new Proxy(tx, { get: (t, p) => (p === "precio" ? { ...t.precio, create: () => Promise.reject(new Error("falla simulada al escribir")) } : Reflect.get(t, p)) })) as never, opciones as never);
      }
      const v = Reflect.get(destino, propiedad, destino) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(destino) : v;
    },
  }) as unknown as BaseDatos;
  await assert.rejects(importarCatalogo(base, { archivos: archivosDeCarga(catalogoDeEjemplo()), modo: "aplicar", organizacionId: e.orgId, usuarioId: e.adminId }), /falla simulada/);
  assert.deepEqual(await huella(), antes, "ni la disciplina, ni las sucursales, ni los grupos, ni un registro de cambios");
  // Y la carga de verdad, después, sale bien (el candado se soltó).
  assert.equal((await cargar(e, "aplicar", catalogoDeEjemplo())).aplicado, true);
});

test("IDEMPOTENTE: aplicar dos veces lo mismo no duplica ni cambia nada y lo dice («sin cambios»)", async () => {
  const e = await nuevaEscuela();
  assert.equal((await cargar(e, "aplicar", catalogoDeEjemplo())).sin_cambios, false);
  const despuesDeLaPrimera = await huella();
  const segunda = await cargar(e, "aplicar", catalogoDeEjemplo());
  assert.equal(segunda.limpia, true);
  assert.equal(segunda.sin_cambios, true);
  assert.equal(segunda.aplicado, true);
  assert.deepEqual(segunda.cambios, []);
  assert.ok(segunda.resumen.every((r) => r.creados === 0 && r.actualizados === 0 && r.sin_cambios > 0));
  assert.deepEqual(await huella(), despuesDeLaPrimera, "ni una fila nueva, ni un registro de cambios, ni una marca de tiempo distinta");
  // También por la simulación, y con el mismo archivo escrito de otra manera (punto y coma, sin BOM, \n, Windows-1252).
  assert.equal((await cargar(e, "simulacion", catalogoDeEjemplo())).sin_cambios, true);
  const aLatin1 = (t: string): Buffer => Buffer.from(t, "latin1");
  const raro = TODAS.map((t) => ({ nombre: ESQUEMAS[t].archivo, bytes: aLatin1(csvDeHoja(t, catalogoDeEjemplo()[t], { separador: ";", bom: false, finDeLinea: "\n" })) }));
  const r = await e.admin.post<Informe>("/api/catalogo/importacion", cuerpoDeCarga("aplicar", raro));
  assert.equal(r.cuerpo.sin_cambios, true, textos(r.cuerpo).join("\n"));
  assert.deepEqual(await huella(), despuesDeLaPrimera);
});

const TODAS = ["disciplinas", "sucursales", "salones", "instructores", "programas", "grupos", "horarios", "precios"] as const;

test("ACTUALIZA lo que cambió (y lo reporta), NO BORRA lo que falta en el archivo y una celda vacía no borra el dato", async () => {
  const e = await nuevaEscuela();
  await cargar(e, "aplicar", catalogoDeEjemplo());
  const antes = await conteos(e);

  const r = await cargar(e, "aplicar", {
    salones: [["Centro", "Sala 1", "25"]], // los otros dos salones no vienen: se quedan
    sucursales: [["Centro", "Calle Nueva 9", "Centro"], ["Norte", "", "Centro"]], // dirección vacía: no se borra
    programas: [["Disciplina A", "Centro", "Infantil", "6", "8", "", "", "", ""]],
    grupos: [["Centro", "Infantil", "Tarde", "18", "", "", ""]], // salón e instructor vacíos: no se quitan
    instructores: [["Ana Pérez", "55 9999 0000", "", "Centro | Norte"]],
  });
  assert.equal(r.aplicado, true, textos(r).join("\n"));
  assert.equal(r.sin_cambios, false);
  assert.deepEqual(r.resumen.map((x) => [x.clave, x.creados, x.actualizados, x.sin_cambios]), [["sucursales", 0, 1, 1], ["salones", 0, 1, 0], ["instructores", 0, 1, 0], ["programas", 0, 1, 0], ["grupos", 0, 1, 0]]);

  const despues = await conteos(e);
  assert.equal(despues["salon"], 3, "los salones que no venían en el archivo siguen ahí");
  assert.equal(despues["sucursal"], 2);
  assert.equal(despues["instructor_sucursal"], antes["instructor_sucursal"]! + 1, "a Ana se le agregó Norte; no se le quitó nada");
  assert.equal(despues["registro_cambio"], antes["registro_cambio"]! + 5, "un registro por cada cosa actualizada");
  assert.equal((await e.db.salon.findFirstOrThrow({ where: { nombre: "Sala 1", sucursal: { nombre: "Centro" } }, select: { capacidad: true } })).capacidad, 25);
  assert.equal((await e.db.sucursal.findFirstOrThrow({ where: { nombre: "Centro" }, select: { direccion: true } })).direccion, "Calle Nueva 9");
  assert.equal((await e.db.sucursal.findFirstOrThrow({ where: { nombre: "Norte" }, select: { direccion: true } })).direccion, "Calle 2", "una celda vacía no borra la dirección");
  const g = await e.db.grupo.findFirstOrThrow({ where: { nombre: "Tarde", programa: { nombre: "Infantil", sucursal: { nombre: "Centro" } } }, select: { cupo_maximo: true, salon: { select: { nombre: true } }, instructor: { select: { nombre: true } }, horarios: { select: { id: true } } } });
  assert.deepEqual([g.cupo_maximo, g.salon?.nombre, g.instructor?.nombre, g.horarios.length], [18, "Sala 1", "Ana Pérez", 2], "salón, instructor y horarios intactos");
  assert.equal((await e.db.programa.findFirstOrThrow({ where: { nombre: "Infantil", sucursal: { nombre: "Centro" } }, select: { edad_max: true } })).edad_max, 8);
  const cambiosEnRegistro = await e.db.registro_cambio.findMany({ where: { accion: "actualizar" }, select: { entidad_tipo: true, antes: true, despues: true } });
  const delSalon = cambiosEnRegistro.find((c) => c.entidad_tipo === "salon")!;
  assert.deepEqual([delSalon.antes, delSalon.despues], [{ capacidad: 20 }, { capacidad: 25 }]);

  // Rebajar el cupo por debajo de los inscritos avisa, no bloquea, y no toca a los inscritos (aquí no hay: el aviso sale en el caso de V6 itest de precios).
  const otra = await cargar(e, "aplicar", { grupos: [["Centro", "Infantil", "Tarde", "18", "", "", ""]] });
  assert.equal(otra.sin_cambios, true);
});

test("PRECIOS: un precio nuevo es una versión con vigencia (cierra el anterior); lo ya cobrado a una inscripción no cambia; el mismo día con otros importes se rechaza", async () => {
  const org = await sembrarOrganizacion(prisma, "Precios");
  const programa = await sembrarPrograma(prisma, org, { sucursalId: org.sucursales[0]!.id, nombre: "Programa congelado", edadMin: 6, edadMax: 9, precio: { inscripcion: "500.00", mensualidad: "800.00", desde: "2026-01-01" }, grupos: [{ nombre: "Grupo congelado", cupoMaximo: 10 }] });
  const admin = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const cliente = api.cliente();
  assert.equal((await cliente.login(org.slug, admin.correo, admin.contrasena)).estado, 201);
  const e: Escuela = { orgId: org.organizacionId, slug: org.slug, admin: cliente, adminId: admin.id, correoAdmin: admin.correo, db: conAlcance(prisma, org.organizacionId) };

  // Una inscripción ya hecha con el precio de entonces.
  const alumno = await sembrarAlumno(prisma, org, {});
  const grupoId = programa.grupos[0]!.id;
  const inscripcion = await prisma.inscripcion.create({
    data: { organizacion_id: org.organizacionId, alumno_id: alumno.alumnoId, grupo_id: grupoId, programa_id: programa.id, fecha_inscripcion: new Date("2026-02-01T00:00:00Z"), fecha_inicio: new Date("2026-02-01T00:00:00Z"), precio_inscripcion_aplicado: "500.00", precio_mensualidad_aplicado: "800.00", dia_corte_pago: 5 },
  });
  const antesInscripcion = JSON.stringify(await prisma.inscripcion.findUniqueOrThrow({ where: { id: inscripcion.id } }));
  const filaPrecioVieja = await prisma.precio.findFirstOrThrow({ where: { programa_id: programa.id } });

  const sucursal = org.sucursales[0]!.nombre;
  const nuevo = [[sucursal, "Programa congelado", "550", "900,00", "01/03/2027"]];
  const sim = await cargar(e, "simulacion", { precios: nuevo });
  assert.equal(sim.limpia, true, textos(sim).join("\n"));
  assert.match(sim.cambios[0]!.descripcion, /Precio nuevo de “Programa congelado” .*mensualidad \$900\.00, desde el 01\/03\/2027; el anterior termina el 28\/02\/2027/);
  const r = await cargar(e, "aplicar", { precios: nuevo });
  assert.equal(r.aplicado, true);

  assert.equal(JSON.stringify(await prisma.inscripcion.findUniqueOrThrow({ where: { id: inscripcion.id } })), antesInscripcion, "la inscripción de antes quedó EXACTAMENTE igual");
  const vieja = await prisma.precio.findUniqueOrThrow({ where: { id: filaPrecioVieja.id } });
  assert.deepEqual([vieja.costo_mensualidad.toFixed(2), vieja.vigencia_hasta?.toISOString().slice(0, 10)], ["800.00", "2027-02-28"], "el precio anterior conserva su importe; solo se cerró el día previo");
  assert.equal((await precioVigente(e.db, programa.id, "2027-02-28"))?.costoMensualidad, 80000n, "lo que se cotiza para una fecha de antes es lo de antes");
  assert.equal((await precioVigente(e.db, programa.id, "2027-03-01"))?.costoMensualidad, 90000n);
  assert.equal(await e.db.precio.count({ where: { programa_id: programa.id } }), 2);

  // Repetir: sin cambios. El mismo día con otro importe: error. Uno anterior al vigente: error. Nada se escribe.
  assert.equal((await cargar(e, "aplicar", { precios: nuevo })).sin_cambios, true);
  const antes = await huella();
  const mismoDia = await cargar(e, "aplicar", { precios: [[sucursal, "Programa congelado", "550", "950", "01/03/2027"]] });
  assert.equal(mismoDia.aplicado, false);
  assert.match(mismoDia.errores[0]!.texto, /Fila 2, columna “Vigente desde”.*con otros importes.*debe empezar en una fecha posterior/);
  const anterior = await cargar(e, "aplicar", { precios: [[sucursal, "Programa congelado", "100", "100", "01/06/2026"]] });
  assert.match(anterior.errores[0]!.texto, /debe empezar después de esa fecha/);
  assert.deepEqual(await huella(), antes);

  // Aviso (no error) al rebajar el cupo por debajo de los inscritos; la inscripción no se toca.
  const baja = await cargar(e, "aplicar", { grupos: [[sucursal, "Programa congelado", "Grupo congelado", "5", "", "", ""]] });
  assert.equal(baja.aplicado, true);
  assert.equal((await e.db.grupo.findFirstOrThrow({ where: { id: grupoId }, select: { cupo_maximo: true } })).cupo_maximo, 5);
  assert.equal(JSON.stringify(await prisma.inscripcion.findUniqueOrThrow({ where: { id: inscripcion.id } })), antesInscripcion);
  const bajaOtra = await cargar(e, "simulacion", { grupos: [[sucursal, "Programa congelado", "Grupo congelado", "0", "", "", ""]] });
  assert.match(bajaOtra.errores[0]!.texto, /Cupo/);
});

test("PRECIOS: la historia completa en un archivo, en cualquier orden, queda encadenada (cada precio cierra al anterior)", async () => {
  const e = await nuevaEscuela();
  const base = catalogoDeEjemplo();
  base.precios = [
    ["Centro", "Infantil", "500", "900", "01/01/2027"],
    ["Centro", "Infantil", "500", "800", "01/09/2026"],
    ["Centro", "Infantil", "450", "850", "01/11/2026"],
    ["Centro", "Juvenil", "500", "900", "01/09/2026"],
    ["Norte", "Infantil", "500", "750", "01/09/2026"],
  ];
  assert.equal((await cargar(e, "aplicar", base)).aplicado, true);
  const infantil = await e.db.programa.findFirstOrThrow({ where: { nombre: "Infantil", sucursal: { nombre: "Centro" } }, select: { id: true } });
  const filas = await e.db.precio.findMany({ where: { programa_id: infantil.id }, orderBy: { vigencia_desde: "asc" }, select: { costo_mensualidad: true, vigencia_desde: true, vigencia_hasta: true } });
  assert.deepEqual(filas.map((f) => [f.costo_mensualidad.toFixed(2), f.vigencia_desde.toISOString().slice(0, 10), f.vigencia_hasta?.toISOString().slice(0, 10) ?? null]), [
    ["800.00", "2026-09-01", "2026-10-31"],
    ["850.00", "2026-11-01", "2026-12-31"],
    ["900.00", "2027-01-01", null],
  ]);
  // Y después, un precio todavía más nuevo cierra el último.
  assert.equal((await cargar(e, "aplicar", { precios: [["Centro", "Infantil", "500", "950", "01/06/2027"]] })).aplicado, true);
  assert.equal((await precioVigente(e.db, infantil.id, "2027-05-31"))?.costoMensualidad, 90000n);
  assert.equal((await precioVigente(e.db, infantil.id, "2027-06-01"))?.costoMensualidad, 95000n);
});

// ── Errores cruzados y reglas del catálogo ───────────────────────────────────────────────────────

test("ERRORES CRUZADOS entre archivos, TODOS a la vez y con su fila y columna; cada uno se dice una sola vez", async () => {
  const e = await nuevaEscuela();
  const h = catalogoDeEjemplo();
  h.grupos[1]![1] = "Veterano"; // programa que no existe
  h.horarios[1]![2] = "Nocturno"; // grupo que no existe
  h.precios[1]![1] = "Veterano"; // el mismo programa que no existe
  h.salones[0]![0] = "Poniente"; // sucursal que no existe
  h.programas[1]![0] = "Otra"; // disciplina que no existe
  const r = await cargar(e, "simulacion", h);
  assert.deepEqual(textos(r), [
    "salones.csv: Fila 2, columna “Sucursal”: no existe la sucursal “Poniente”. Revisa el nombre o agrégala en el archivo de sucursales.",
    "programas.csv: Fila 3, columna “Disciplina”: no existe la disciplina “Otra”. Revisa el nombre o agrégala en el archivo de disciplinas.",
    "grupos.csv: Fila 3, columna “Programa”: no existe el programa “Veterano” en la sucursal “Centro”. Revisa el nombre o agrégalo en el archivo de programas.",
    "horarios.csv: Fila 3, columna “Grupo”: no existe el grupo “Nocturno” en el programa “Infantil” de la sucursal “Centro”. Revisa el nombre o agrégalo en el archivo de grupos.",
    "precios.csv: Fila 3, columna “Programa”: no existe el programa “Veterano” en la sucursal “Centro”. Revisa el nombre o agrégalo en el archivo de programas.",
  ]);
});

test("TRASLAPES DE EDAD y CHOQUES contra lo que YA está en el sistema (creado por la API de siempre): la carga los rechaza con fila y columna y no escribe nada", async () => {
  const e = await nuevaEscuela();
  await cargar(e, "aplicar", catalogoDeEjemplo());
  const antes = await huella();
  // Un programa nuevo que pisa las edades de «Juvenil» (10–14) en la misma disciplina y sucursal.
  const traslape = await cargar(e, "aplicar", { programas: [["Disciplina A", "Centro", "Extra", "12", "16", "", "", "", ""]] });
  assert.equal(traslape.aplicado, false);
  assert.match(traslape.errores[0]!.texto, /Fila 2, columna “Edad mínima”: las edades 12–16 se traslapan con las del programa “Juvenil” \(que ya existe\).*AMBOS programas/);
  // Un grupo que usaría Sala 1 de Centro el lunes 17:30–18:30, cuando «Tarde» de Infantil la tiene de 17:00 a 18:00.
  const choque = await cargar(e, "aplicar", { grupos: [["Centro", "Juvenil", "Extra", "8", "Sala 1", "", ""]], horarios: [["Centro", "Juvenil", "Extra", "lunes", "17:30", "18:30"]] });
  assert.equal(choque.aplicado, false);
  assert.match(choque.errores[0]!.texto, /Fila 2, columna “Hora de inicio”: el salón “Sala 1” ya está ocupado con el grupo “Tarde” el lunes de 17:00 a 18:00/);
  // El mismo instructor en otra sucursal, a la misma hora (una persona no está en dos lugares).
  const instructor = await cargar(e, "aplicar", { grupos: [["Norte", "Infantil", "Extra", "8", "", "Ana Pérez", ""]], horarios: [["Norte", "Infantil", "Extra", "lunes", "17:15", "17:45"]] });
  assert.match(instructor.errores.map((x) => x.texto).join("\n"), /no da clases en la sucursal “Norte”/, "Ana solo da clases en Centro");
  const inst2 = await cargar(e, "aplicar", { grupos: [["Norte", "Infantil", "Extra", "8", "", "Luis Gómez", ""]], horarios: [["Norte", "Infantil", "Extra", "martes", "17:30", "18:30"]] });
  assert.match(inst2.errores[0]!.texto, /“Luis Gómez” ya da otra clase con el grupo “Tarde” el martes de 17:00 a 18:00/);
  // Cupo mayor que la capacidad del salón (Sala 2 cabe 10).
  const cupo = await cargar(e, "aplicar", { grupos: [["Centro", "Juvenil", "Tarde", "11", "", "", ""]] });
  assert.match(cupo.errores[0]!.texto, /Fila 2, columna “Cupo”: el cupo \(11\) es mayor que la capacidad del salón “Sala 2” \(10\)/);
  assert.deepEqual(await huella(), antes);
  // Lo mismo lo rechazaría la API de siempre: la carga no es más permisiva que ella.
  const api409 = await e.admin.post("/api/programas", { vertical_id: (await e.db.vertical.findFirstOrThrow({ select: { id: true } })).id, sucursal_id: (await e.db.sucursal.findFirstOrThrow({ where: { nombre: "Centro" }, select: { id: true } })).id, nombre: "Extra", edad_min: 12, edad_max: 16 });
  assert.equal(api409.estado, 409);
});

test("las reglas que la carga comparte con la API de siempre dan el mismo resultado (la carga crea lo que la API habría aceptado)", async () => {
  const e = await nuevaEscuela();
  await cargar(e, "aplicar", catalogoDeEjemplo());
  // Lo creado por la carga se ve y se opera por la API de administración como si lo hubieran dado de alta a mano.
  const programas = await e.admin.get<{ datos: { nombre: string }[] }>("/api/programas");
  assert.deepEqual(programas.cuerpo.datos.map((p) => p.nombre).sort(), ["Infantil", "Infantil", "Juvenil"]);
  const grupos = await e.admin.get<{ datos: { nombre: string; horarios: unknown[]; salon: { nombre: string } | null }[] }>("/api/grupos");
  assert.equal(grupos.cuerpo.datos.length, 3);
  assert.ok(grupos.cuerpo.datos.every((g) => g.horarios.length > 0 && g.salon));
  // Y una edición posterior por la API (un choque) sigue protegida por los mismos disparadores.
  const tarde = await e.db.grupo.findFirstOrThrow({ where: { nombre: "Tarde", programa: { nombre: "Juvenil" } }, select: { id: true } });
  const sala1 = await e.db.salon.findFirstOrThrow({ where: { nombre: "Sala 1", sucursal: { nombre: "Centro" } }, select: { id: true } });
  const choque = await e.admin.patch(`/api/grupos/${tarde.id}`, { salon_id: sala1.id, horarios: [{ dia_semana: 1, hora_inicio_min: 1020, hora_fin_min: 1080 }] });
  assert.equal(choque.estado, 409);
});

test("AMBIGÜEDAD: dos cosas que ya existen con el mismo nombre dan un error claro, no se adivina a cuál", async () => {
  const e = await nuevaEscuela();
  await cargar(e, "aplicar", catalogoDeEjemplo());
  // Un segundo «Infantil» en otra sucursal existe de verdad (Centro y Norte): sin decir la sucursal, el precio es ambiguo.
  const r = await cargar(e, "simulacion", { precios: [["", "Infantil", "1", "1", "01/01/2028"]] });
  assert.match(r.errores[0]!.texto, /hay 2 programas que se llaman “Infantil” \(en “Centro”, “Norte”\)\. Llena la columna «Sucursal» para decir cuál/);
  // Dos instructores casi iguales creados a mano.
  await e.db.instructor.create({ data: { organizacion_id: e.orgId, nombre: "ANA PEREZ" } });
  const i = await cargar(e, "simulacion", { instructores: [["Ana Pérez", "55 1111 2222", "", ""]] });
  assert.match(i.errores[0]!.texto, /hay 2 instructores que se llaman casi igual a “Ana Pérez”/);
});

// ── Organizaciones, roles y módulos ──────────────────────────────────────────────────────────────

test("NO-FUGA: cada organización resuelve los nombres solo dentro de la suya; lo de una no existe para la otra", async () => {
  const a = await nuevaEscuela();
  const b = await nuevaEscuela();
  await cargar(a, "aplicar", catalogoDeEjemplo());
  const huellaA = JSON.stringify(await conteos(a));
  // La otra escuela sube SOLO salones que apuntan a «Centro»: para ella no existe.
  const r = await cargar(b, "simulacion", { salones: [["Centro", "Sala 9", "5"]] });
  assert.equal(r.limpia, false);
  assert.match(r.errores[0]!.texto, /no existe la sucursal “Centro”/);
  // Y puede crear la suya con los MISMOS nombres sin chocar con la de A.
  assert.equal((await cargar(b, "aplicar", catalogoDeEjemplo())).aplicado, true);
  assert.deepEqual(await conteos(b), { ...CATALOGO_COMPLETO, registro_cambio: 19 });
  assert.equal(JSON.stringify(await conteos(a)), huellaA, "lo de A no se tocó");
  // Un administrador de A no ve ni cambia nada de B: B actualiza «Sala 1», A sigue con 20.
  assert.equal((await cargar(b, "aplicar", { salones: [["Centro", "Sala 1", "33"]] })).aplicado, true);
  assert.equal((await a.db.salon.findFirstOrThrow({ where: { nombre: "Sala 1", sucursal: { nombre: "Centro" } }, select: { capacidad: true } })).capacidad, 20);
  assert.equal((await b.db.salon.findFirstOrThrow({ where: { nombre: "Sala 1", sucursal: { nombre: "Centro" } }, select: { capacidad: true } })).capacidad, 33);
  // Los cambios quedan en el registro de SU organización.
  assert.equal(await a.db.registro_cambio.count({ where: { accion: "actualizar" } }), 0);
});

test("SOLO EL ADMINISTRADOR: asesor, recepción y maestro reciben 403 en la carga y en las plantillas; sin sesión, 401", async () => {
  const e = await nuevaEscuela();
  const cuerpo = cuerpoDeCarga("simulacion", archivosDeCarga({ sucursales: catalogoDeEjemplo().sucursales }));
  for (const rol of ["asesor", "recepcion", "maestro"] as const) {
    const c = await entrarComo(e, rol);
    assert.equal((await c.post("/api/catalogo/importacion", cuerpo)).estado, 403, `${rol}: POST`);
    assert.equal((await c.get("/api/catalogo/plantillas")).estado, 403, `${rol}: lista`);
    assert.equal((await c.get("/api/catalogo/plantillas/sucursales.csv")).estado, 403, `${rol}: descarga`);
  }
  const anonimo = api.cliente();
  assert.equal((await anonimo.post("/api/catalogo/importacion", cuerpo)).estado, 401);
  assert.equal((await anonimo.get("/api/catalogo/plantillas")).estado, 401);
  assert.equal(await e.db.sucursal.count({}), 0);
});

test("MÓDULOS: la carga es del catálogo (módulo base): funciona con solo la captación encendida y con todos; lo de otros módulos sigue apagado hasta encenderlo", async () => {
  const e = await nuevaEscuela("captacion");
  assert.equal((await e.admin.get("/api/cotizador?vertical_id=" + randomUUID() + "&sucursal_id=" + randomUUID() + "&edad=7")).estado, 404, "el cotizador está apagado");
  assert.equal((await cargar(e, "aplicar", catalogoDeEjemplo())).aplicado, true, "con solo captación");
  assert.equal((await e.admin.get("/api/catalogo/plantillas")).estado, 200);
  const todos = await nuevaEscuela("todos");
  assert.equal((await cargar(todos, "aplicar", catalogoDeEjemplo())).aplicado, true, "con todos los módulos");
  // Cargar el catálogo no enciende ni apaga ningún módulo.
  const modulos = await e.admin.get<{ modulos: { id: string; encendido: boolean }[] }>("/api/modulos");
  assert.deepEqual(modulos.cuerpo.modulos.filter((m) => m.encendido).map((m) => m.id), ["captacion"]);
});

test("CONCURRENCIA: dos aplicaciones simultáneas del mismo archivo no duplican nada; una crea y la otra ve «sin cambios»", async () => {
  const e = await nuevaEscuela();
  const clienteB = api.cliente();
  const u = await sembrarUsuario(prisma, e.orgId, { rol: "administrador" });
  assert.equal((await clienteB.login(e.slug, u.correo, u.contrasena)).estado, 201);
  const cuerpo = cuerpoDeCarga("aplicar", archivosDeCarga(catalogoDeEjemplo()));
  const [x, y] = await Promise.all([e.admin.post<Informe>("/api/catalogo/importacion", cuerpo), clienteB.post<Informe>("/api/catalogo/importacion", cuerpo)]);
  assert.deepEqual([x.estado, y.estado], [200, 200]);
  assert.equal(x.cuerpo.aplicado && y.cuerpo.aplicado, true);
  assert.equal([x.cuerpo, y.cuerpo].filter((i) => i.sin_cambios).length, 1, "una creó y la otra encontró todo hecho");
  assert.deepEqual(await conteos(e), { ...CATALOGO_COMPLETO, registro_cambio: 19 });
  // Dos cargas distintas simultáneas que pelean por el mismo nombre: el nombre queda una sola vez.
  const f = await nuevaEscuela();
  const f2 = api.cliente();
  const u2 = await sembrarUsuario(prisma, f.orgId, { rol: "administrador" });
  assert.equal((await f2.login(f.slug, u2.correo, u2.contrasena)).estado, 201);
  const uno = cuerpoDeCarga("aplicar", archivosDeCarga({ sucursales: [["Misma", "Calle 1", "Centro"]] }));
  const dos = cuerpoDeCarga("aplicar", archivosDeCarga({ sucursales: [["MISMA", "Calle 2", "Centro"]] }));
  const [p, q] = await Promise.all([f.admin.post<Informe>("/api/catalogo/importacion", uno), f2.post<Informe>("/api/catalogo/importacion", dos)]);
  assert.deepEqual([p.estado, q.estado], [200, 200]);
  assert.equal(await f.db.sucursal.count({}), 1, "ni dos «Misma» ni un error de duplicado");
});

// ── Topes y formatos ─────────────────────────────────────────────────────────────────────────────

test("TOPES: demasiados archivos, cuerpo enorme, contenido repetido, base64 roto, modo inventado y archivos con demasiadas filas", async () => {
  const e = await nuevaEscuela();
  const antes = await huella();
  const muchos = Array.from({ length: 13 }, (_, i) => ({ nombre: `a${i}.csv`, contenido: "x" }));
  assert.equal((await e.admin.post("/api/catalogo/importacion", { modo: "simulacion", archivos: muchos })).estado, 400);
  const enorme = await e.admin.post("/api/catalogo/importacion", { modo: "simulacion", archivos: [{ nombre: "a.csv", contenido: "x".repeat(9_000_000) }] });
  assert.equal(enorme.estado, 413);
  assert.equal((await e.admin.post("/api/catalogo/importacion", { modo: "simulacion", archivos: [{ nombre: "a.csv", contenido: "x", contenido_base64: "eA==" }] })).estado, 400);
  assert.equal((await e.admin.post("/api/catalogo/importacion", { modo: "simulacion", archivos: [{ nombre: "a.csv" }] })).estado, 400);
  assert.equal((await e.admin.post("/api/catalogo/importacion", { modo: "simulacion", archivos: [{ nombre: "a.csv", contenido_base64: "$$$no es base64$$$" }] })).estado, 400);
  assert.equal((await e.admin.post("/api/catalogo/importacion", { modo: "borrar", archivos: [] })).estado, 400);
  assert.equal((await e.admin.post("/api/catalogo/importacion", { modo: "simulacion", archivos: [], extra: 1 })).estado, 400);
  const muchasFilas = Array.from({ length: 5001 }, (_, i) => [`Sucursal ${i}`, "", "Centro"]);
  const r = await cargar(e, "simulacion", { sucursales: muchasFilas });
  assert.equal(r.limpia, false);
  assert.match(r.errores[0]!.texto, /trae 5001 filas y la carga acepta hasta 5000 por archivo/);
  assert.deepEqual(await huella(), antes);
});

test("FORMATOS: UTF-8 con BOM, Windows-1252, punto y coma, tabulador y \\r dan el mismo resultado que el CSV de siempre", async () => {
  const e = await nuevaEscuela();
  const referencia = await cargar(e, "simulacion", catalogoDeEjemplo());
  const variantes: { nombre: string; bytes: (t: (typeof TODAS)[number], filas: string[][]) => Buffer }[] = [
    { nombre: "punto y coma, UTF-8 sin BOM, \\n", bytes: (t, f) => Buffer.from(csvDeHoja(t, f, { separador: ";", bom: false, finDeLinea: "\n" })) },
    { nombre: "Windows-1252 con punto y coma", bytes: (t, f) => Buffer.from(csvDeHoja(t, f, { separador: ";", bom: false }), "latin1") },
    { nombre: "tabulador, \\r solo", bytes: (t, f) => Buffer.from(csvDeHoja(t, f, { separador: "\t", finDeLinea: "\r" })) },
    { nombre: "UTF-16 con BOM", bytes: (t, f) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csvDeHoja(t, f, { separador: "\t", bom: false }), "utf16le")]) },
  ];
  for (const v of variantes) {
    const archivos = TODAS.map((t) => ({ nombre: ESQUEMAS[t].archivo, bytes: v.bytes(t, catalogoDeEjemplo()[t]) }));
    const r = await e.admin.post<Informe>("/api/catalogo/importacion", cuerpoDeCarga("simulacion", archivos));
    assert.equal(r.cuerpo.limpia, true, `${v.nombre}: ${textos(r.cuerpo).join(" | ")}`);
    assert.deepEqual(r.cuerpo.resumen, referencia.resumen, v.nombre);
    assert.deepEqual(r.cuerpo.cambios, referencia.cambios, v.nombre);
  }
  // Y como texto en el JSON, sin base64 (para quien llame a la API a mano).
  const texto = await e.admin.post<Informe>("/api/catalogo/importacion", { modo: "simulacion", archivos: [{ nombre: "sucursales.csv", contenido: csvDeHoja("sucursales", catalogoDeEjemplo().sucursales) }] });
  assert.equal(texto.cuerpo.limpia, true);
});

test("PLANTILLAS: se listan y se descargan por la API, en UTF-8 con BOM; un nombre inventado da 404", async () => {
  const e = await nuevaEscuela();
  const lista = await e.admin.get<{ datos: { nombre: string; descripcion: string; ruta: string }[] }>("/api/catalogo/plantillas");
  assert.equal(lista.estado, 200);
  assert.deepEqual(lista.cuerpo.datos.map((d) => d.nombre), ["LEEME.txt", "disciplinas.csv", "sucursales.csv", "salones.csv", "instructores.csv", "programas.csv", "grupos.csv", "horarios.csv", "precios.csv", "plantillas-catalogo.zip"]);
  assert.ok(lista.cuerpo.datos.every((d) => d.descripcion.length > 10));
  const csv = await e.admin.descargar("/api/catalogo/plantillas/programas.csv");
  assert.equal(csv.estado, 200);
  assert.match(csv.cabeceras.get("content-type") ?? "", /text\/csv/);
  assert.match(csv.cabeceras.get("content-disposition") ?? "", /attachment; filename="programas\.csv"/);
  assert.deepEqual([...csv.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "BOM de UTF-8");
  assert.match(csv.bytes.toString("utf8"), /Edad mínima/);
  const zip = await e.admin.descargar("/api/catalogo/plantillas/plantillas-catalogo.zip");
  assert.match(zip.cabeceras.get("content-type") ?? "", /application\/zip/);
  assert.deepEqual([...zip.bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal((await e.admin.get("/api/catalogo/plantillas/otra-cosa.csv")).estado, 404);
  assert.equal((await e.admin.get("/api/catalogo/plantillas/..%2F..%2Fetc%2Fpasswd")).estado, 404);
  // Una plantilla descargada y subida tal cual no crea nada (la fila de ejemplo se ignora).
  const archivos = await Promise.all(["disciplinas.csv", "sucursales.csv", "salones.csv", "instructores.csv", "programas.csv", "grupos.csv", "horarios.csv", "precios.csv"].map(async (n) => ({ nombre: n, bytes: (await e.admin.descargar(`/api/catalogo/plantillas/${n}`)).bytes })));
  const r = await e.admin.post<Informe>("/api/catalogo/importacion", cuerpoDeCarga("aplicar", archivos));
  assert.equal(r.cuerpo.limpia, true, textos(r.cuerpo).join(" | "));
  assert.equal(r.cuerpo.sin_cambios, true);
  assert.equal(await e.db.sucursal.count({}), 0, "ni la sucursal de ejemplo");
});

// ── El comando ───────────────────────────────────────────────────────────────────────────────────

test("COMANDO npm run catalogo:importar: simula sin escribir, imprime los errores por archivo y fila, y con --aplicar carga (idempotente)", () => {
  // Corre en un proceso aparte contra la misma base de pruebas.
  return (async () => {
    const e = await nuevaEscuela();
    const carpeta = mkdtempSync(join(tmpdir(), "catalogo-"));
    mkdirSync(carpeta, { recursive: true });
    const escribir = (hojas: Partial<HojasDeEjemplo>): void => {
      for (const a of archivosDeCarga(hojas)) writeFileSync(join(carpeta, a.nombre), a.bytes);
    };
    const correr = (...args: string[]) => spawnSync(process.execPath, ["scripts/catalogo-importar.ts", "--organizacion", e.slug, "--carpeta", carpeta, ...args], { env: { ...process.env }, encoding: "utf8" });
    const antes = await huella();

    escribir(conCelda("grupos", 0, 4, "Sala 3"));
    const mala = correr();
    assert.equal(mala.status, 1, mala.stdout + mala.stderr);
    assert.match(mala.stdout, /grupos\.csv/);
    assert.match(mala.stdout, /Fila 2, columna “Salón”: no existe el salón “Sala 3” en la sucursal “Centro”/);
    assert.match(mala.stdout, /No se guardó nada/);
    assert.deepEqual(await huella(), antes);

    escribir(catalogoDeEjemplo());
    const simulada = correr();
    assert.equal(simulada.status, 0, simulada.stdout + simulada.stderr);
    assert.match(simulada.stdout, /Simulación limpia: no se escribió nada/);
    assert.deepEqual(await huella(), antes, "sin --aplicar no escribe");

    const sinAdmin = correr("--aplicar");
    assert.equal(sinAdmin.status, 1);
    assert.match(sinAdmin.stderr, /--administrador/);
    const otroAdmin = correr("--aplicar", "--administrador", "nadie@ejemplo.com");
    assert.equal(otroAdmin.status, 1);
    assert.deepEqual(await huella(), antes);

    const aplicada = correr("--aplicar", "--administrador", e.correoAdmin);
    assert.equal(aplicada.status, 0, aplicada.stdout + aplicada.stderr);
    assert.match(aplicada.stdout, /Listo: el catálogo se cargó/);
    assert.deepEqual(await conteos(e), { ...CATALOGO_COMPLETO, registro_cambio: 19 });
    const despues = await huella();

    const otraVez = correr("--aplicar", "--administrador", e.correoAdmin);
    assert.equal(otraVez.status, 0);
    assert.match(otraVez.stdout, /Sin cambios/);
    assert.deepEqual(await huella(), despues);

    const json = correr("--json");
    assert.equal((JSON.parse(json.stdout) as Informe).sin_cambios, true);
    const sinOrg = spawnSync(process.execPath, ["scripts/catalogo-importar.ts", "--organizacion", "no-existe-aqui", "--carpeta", carpeta], { env: { ...process.env }, encoding: "utf8" });
    assert.equal(sinOrg.status, 1);
    assert.match(sinOrg.stderr, /No existe la organización/);
  })();
});
