// V1: módulos por organización en la API. Postgres real, la app real y los cuatro roles. Lo que se prueba, por cada uno de los seis módulos apagables (tablas de casos):
//   · apagado, TODAS sus rutas responden 404 «Ruta no encontrada» (igual que una ruta que no existe) a TODOS los roles, el administrador incluido; las de los demás módulos siguen vivas;
//   · encendido otra vez, las mismas rutas dejan de dar ese 404: surte efecto en la misma app, sin reiniciar y sin tocar código.
// Y además: solo el administrador ve y cambia los módulos, las dependencias se rechazan con un mensaje claro, cada cambio queda en el registro, apagar en una organización
// no toca a otra, `GET /api/yo` trae los módulos y el expediente y las tareas no muestran lo de un módulo apagado.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { MODULO_DE_PERMISO, moduloDeRuta } from "../api/modulos-rutas.ts";
import { concretas, rutasDeApiReales } from "../testutil/rutas-reales.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion } from "../testutil/semilla.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import type { ClienteApi } from "../testutil/api.ts";
import { DEFINICION_DE_MODULOS, MODULOS_APAGABLES, TODOS_ENCENDIDOS, aFilaDeModulos, type Modulo, type ModuloApagable, type ModulosEncendidos } from "./index.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
let ajeno: MundoDeFinanzas;

before(async () => {
  prisma = crearPrismaDePruebas(undefined, 30);
  m = await mundoDeFinanzas(prisma, "Módulos");
  ajeno = await mundoDeFinanzas(prisma, "Módulos ajena");
});
after(async () => {
  await m.cerrar();
  await ajeno.cerrar();
  await prisma.$disconnect();
});

interface Err { error: { codigo: string; mensaje: string; detalles?: { mensaje: string }[] } }
interface Lista { modulos: { id: Modulo; nombre: string; incluye: string; requiere: Modulo[]; obligatorio: boolean; encendido: boolean }[] }

/** Lo que se apaga junto con `modulo`: él y todo lo que lo necesita (las dependencias, que la base también impone con un CHECK). */
function apagadoCon(modulo: ModuloApagable): ModulosEncendidos {
  const estado: ModulosEncendidos = { ...TODOS_ENCENDIDOS, [modulo]: false };
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const x of MODULOS_APAGABLES) {
      if (estado[x] && DEFINICION_DE_MODULOS[x].requiere.some((r) => !estado[r])) {
        estado[x] = false;
        cambio = true;
      }
    }
  }
  return estado;
}
const fijar = (mundo: MundoDeFinanzas, estado: ModulosEncendidos) => fijarConfiguracion(prisma, mundo.org.organizacionId, aFilaDeModulos(estado));

interface RutaPrueba {
  metodo: string;
  ruta: string;
  modulo: Modulo;
}
/** Todas las rutas del router real con su módulo, ya con parámetros concretos. */
const RUTAS: RutaPrueba[] = rutasDeApiReales().flatMap((r) => {
  const [metodo, patron] = r.clave.split(" ") as [string, string];
  return concretas(patron).map((ruta) => ({ metodo, ruta, modulo: moduloDeRuta(ruta)! }));
});

const peticion = (c: ClienteApi, r: RutaPrueba) => c.pedir<Err>(r.metodo, r.ruta, r.metodo === "GET" || r.metodo === "DELETE" ? undefined : {});
const esDelModulo = (r: { cuerpo: Err; estado: number }): boolean => r.estado === 404 && r.cuerpo?.error?.codigo === "no_encontrado" && r.cuerpo.error.mensaje === "Ruta no encontrada";

test("hay rutas de cada módulo apagable que probar", () => {
  for (const mod of MODULOS_APAGABLES) assert.ok(RUTAS.some((r) => r.modulo === mod), mod);
});

for (const modulo of MODULOS_APAGABLES) {
  test(`${modulo} apagado: TODAS sus rutas responden 404 a los cuatro roles; las de los demás módulos siguen vivas`, async () => {
    const estado = apagadoCon(modulo);
    await fijar(m, estado);
    try {
      const apagadas = RUTAS.filter((r) => r.modulo !== "captacion" && !estado[r.modulo]);
      assert.ok(apagadas.some((r) => r.modulo === modulo));
      const roles: [string, ClienteApi][] = [["administrador", m.admin], ["asesor", m.asesorNorte], ["recepcion", m.recepcion], ["maestro", m.maestro]];
      for (const [rol, cliente] of roles) {
        for (const r of apagadas) {
          const res = await peticion(cliente, r);
          assert.ok(esDelModulo(res), `${rol} ${r.metodo} ${r.ruta} (${r.modulo}) → ${res.estado} ${JSON.stringify(res.cuerpo)}`);
        }
      }
      // Lo que no se apagó sigue contestando lo suyo (el administrador, que tiene permiso en casi todo).
      for (const r of RUTAS.filter((x) => x.modulo === "captacion" || estado[x.modulo])) {
        if (r.ruta === "/api/sesion") continue; // cerrar sesión borraría la del cliente
        const res = await peticion(m.admin, r);
        assert.ok(!esDelModulo(res), `${r.metodo} ${r.ruta} (${r.modulo}) no debía estar apagada`);
      }
      assert.equal((await m.admin.get("/api/leads")).estado, 200);
      assert.equal((await m.asesorNorte.get("/api/tareas")).estado, 200);
    } finally {
      await fijar(m, TODOS_ENCENDIDOS);
    }
    // Control: con todo encendido ninguna de esas rutas da el 404 del módulo.
    for (const r of RUTAS.filter((x) => x.modulo === modulo && x.ruta !== "/api/sesion")) {
      const res = await peticion(m.admin, r);
      assert.ok(!esDelModulo(res), `${r.metodo} ${r.ruta} encendido → ${res.estado}`);
    }
  });
}

/** Una ruta de lectura de cada módulo que con todo encendido responde 200 al administrador. */
const LECTURAS: Record<ModuloApagable, string> = {
  cotizador: "/api/lista-espera",
  clase_muestra: "/api/clases-muestra",
  inscripcion: "/api/inscripciones",
  operacion: "/api/eventos",
  finanzas: "/api/cargos",
  tableros: "/api/reportes/ejecutivo",
};

for (const modulo of MODULOS_APAGABLES) {
  test(`${modulo}: apagar y encender desde la administración surte efecto en la misma app, sin reiniciar y sin tocar código`, async () => {
    const apagado = apagadoCon(modulo);
    const cambioApagar = Object.fromEntries(MODULOS_APAGABLES.filter((x) => !apagado[x]).map((x) => [x, false]));
    const cambioEncender = Object.fromEntries(MODULOS_APAGABLES.filter((x) => !apagado[x]).map((x) => [x, true]));
    assert.equal((await m.admin.get(LECTURAS[modulo])).estado, 200);
    // Apagar.
    const off = await m.admin.put<Lista>("/api/modulos", cambioApagar);
    assert.equal(off.estado, 200, JSON.stringify(off.cuerpo));
    assert.equal(off.cuerpo.modulos.find((x) => x.id === modulo)!.encendido, false);
    for (const cliente of [m.admin, m.asesorNorte, m.recepcion, m.maestro]) assert.ok(esDelModulo(await cliente.get<Err>(LECTURAS[modulo])), LECTURAS[modulo]);
    // La interfaz se entera con la siguiente lectura de /api/yo (misma sesión).
    const yo = await m.admin.get<{ modulos: Record<Modulo, boolean>; permisos: string[] }>("/api/yo");
    assert.equal(yo.cuerpo.modulos[modulo], false);
    assert.equal(yo.cuerpo.modulos.captacion, true);
    // Los permisos que llegan a la interfaz ya no incluyen los de ningún módulo apagado (por eso la barra y los botones no los muestran).
    for (const p of yo.cuerpo.permisos) assert.ok(yo.cuerpo.modulos[MODULO_DE_PERMISO[p as keyof typeof MODULO_DE_PERMISO]], `${p} no debía llegar`);
    assert.ok(Object.entries(MODULO_DE_PERMISO).some(([p, mod]) => mod === modulo && !yo.cuerpo.permisos.includes(p)));
    // Encender.
    const on = await m.admin.put<Lista>("/api/modulos", cambioEncender);
    assert.equal(on.estado, 200, JSON.stringify(on.cuerpo));
    assert.equal((await m.admin.get(LECTURAS[modulo])).estado, 200);
    const yoOn = await m.admin.get<{ modulos: Record<Modulo, boolean>; permisos: string[] }>("/api/yo");
    assert.equal(yoOn.cuerpo.modulos[modulo], true);
    assert.ok(yoOn.cuerpo.permisos.includes("leads:leer") && Object.entries(MODULO_DE_PERMISO).some(([p, mod]) => mod === modulo && yoOn.cuerpo.permisos.includes(p)), "vuelven los permisos del módulo");
  });
}

test("GET /api/modulos: los siete módulos con su nombre, lo que incluye y qué necesitan; la captación es obligatoria y viene encendida", async () => {
  await fijar(m, TODOS_ENCENDIDOS);
  const r = await m.admin.get<Lista>("/api/modulos");
  assert.equal(r.estado, 200);
  assert.deepEqual(r.cuerpo.modulos.map((x) => x.id), ["captacion", "cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas", "tableros"]);
  const cap = r.cuerpo.modulos[0]!;
  assert.deepEqual([cap.obligatorio, cap.encendido, cap.requiere], [true, true, []]);
  const fin = r.cuerpo.modulos.find((x) => x.id === "finanzas")!;
  assert.deepEqual([fin.nombre, fin.obligatorio, fin.requiere], ["Finanzas", false, ["inscripcion"]]);
  for (const x of r.cuerpo.modulos) assert.ok(x.nombre.length > 0 && x.incluye.length > 0);
});

test("solo el administrador ve y cambia los módulos: asesor, recepción y maestro reciben 403 y no cambia nada", async () => {
  await fijar(m, TODOS_ENCENDIDOS);
  for (const c of [m.asesorNorte, m.recepcion, m.maestro]) {
    assert.equal((await c.get("/api/modulos")).estado, 403);
    assert.equal((await c.put("/api/modulos", { tableros: false })).estado, 403);
  }
  assert.equal((await m.admin.get<Lista>("/api/modulos")).cuerpo.modulos.find((x) => x.id === "tableros")!.encendido, true);
});

test("dependencias: no se enciende un módulo si falta su base y no se apaga uno del que otro depende (409 con el mensaje de qué hacer primero); nada cambia", async () => {
  await fijar(m, apagadoCon("inscripcion"));
  const enciende = await m.admin.put<Err>("/api/modulos", { finanzas: true });
  assert.equal(enciende.estado, 409);
  assert.equal(enciende.cuerpo.error.codigo, "conflicto");
  assert.equal(enciende.cuerpo.error.mensaje, "Para encender Finanzas primero hay que encender Inscripción.");
  assert.ok(esDelModulo(await m.admin.get<Err>("/api/cargos")));
  const tableros = await m.admin.put<Err>("/api/modulos", { tableros: true });
  assert.equal(tableros.estado, 409);
  assert.equal(tableros.cuerpo.error.detalles!.length, 2, "le faltan inscripción y finanzas (la clase muestra sigue encendida)");
  // En orden sí: primero la base, luego lo que depende de ella.
  assert.equal((await m.admin.put("/api/modulos", { inscripcion: true })).estado, 200);
  assert.equal((await m.admin.put("/api/modulos", { finanzas: true })).estado, 200);
  assert.equal((await m.admin.get("/api/cargos")).estado, 200);
  await fijar(m, TODOS_ENCENDIDOS);
  const apaga = await m.admin.put<Err>("/api/modulos", { inscripcion: false });
  assert.equal(apaga.estado, 409);
  assert.match(apaga.cuerpo.error.mensaje, /^Para apagar Inscripción primero hay que apagar Operación diaria/);
  assert.equal((await m.admin.get("/api/inscripciones")).estado, 200, "no se apagó nada en cascada");
  // Todo junto, en una sola petición coherente, sí.
  assert.equal((await m.admin.put("/api/modulos", { inscripcion: false, operacion: false, finanzas: false, tableros: false })).estado, 200);
  assert.ok(esDelModulo(await m.admin.get<Err>("/api/inscripciones")));
});

test("la captación no se apaga: la entrada de leads es el módulo base", async () => {
  await fijar(m, TODOS_ENCENDIDOS);
  const r = await m.admin.put<Err>("/api/modulos", { captacion: false });
  assert.equal(r.estado, 409);
  assert.match(r.cuerpo.error.mensaje, /Captación no se puede apagar/);
  assert.equal((await m.admin.put("/api/modulos", { captacion: true })).estado, 200, "mandarla encendida es inofensivo");
  assert.equal((await m.admin.get("/api/leads")).estado, 200);
});

test("entradas inválidas: cuerpo vacío, campos desconocidos y valores que no son sí o no dan 400", async () => {
  assert.equal((await m.admin.put("/api/modulos", {})).estado, 400);
  assert.equal((await m.admin.put("/api/modulos", { inventado: true })).estado, 400);
  assert.equal((await m.admin.put("/api/modulos", { finanzas: "sí" })).estado, 400);
});

test("cada cambio queda en el registro de cambios (quién, antes y después); repetir lo mismo no registra nada", async () => {
  await fijar(m, TODOS_ENCENDIDOS);
  const antes = await prisma.registro_cambio.count({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "configuracion_organizacion" } });
  assert.equal((await m.admin.put("/api/modulos", { tableros: false })).estado, 200);
  assert.equal((await m.admin.put("/api/modulos", { tableros: false })).estado, 200, "idempotente");
  const filas = await prisma.registro_cambio.findMany({ where: { organizacion_id: m.org.organizacionId, entidad_tipo: "configuracion_organizacion" }, orderBy: { creado_en: "desc" } });
  assert.equal(filas.length, antes + 1, "el segundo PUT no cambió nada");
  assert.equal(filas[0]!.usuario_id, m.adminId);
  assert.equal(filas[0]!.accion, "actualizar");
  assert.deepEqual([filas[0]!.antes, filas[0]!.despues], [{ modulo_tableros: true }, { modulo_tableros: false }]);
  const api = await m.admin.get<{ datos: { entidad_tipo: string; despues: unknown }[] }>("/api/registro-cambios?entidad_tipo=configuracion_organizacion");
  assert.ok(api.cuerpo.datos.some((x) => JSON.stringify(x.despues) === JSON.stringify({ modulo_tableros: false })));
  await fijar(m, TODOS_ENCENDIDOS);
});

test("sin fila de configuración TODO está encendido (las organizaciones que ya existían siguen igual); el primer PUT crea la fila", async () => {
  const sin = await mundoDeFinanzas(prisma, "Módulos sin fila");
  try {
    assert.equal(await prisma.configuracion_organizacion.count({ where: { organizacion_id: sin.org.organizacionId } }), 0);
    const yo = await sin.admin.get<{ modulos: Record<Modulo, boolean> }>("/api/yo");
    assert.deepEqual(yo.cuerpo.modulos, TODOS_ENCENDIDOS);
    assert.equal((await sin.admin.get("/api/cargos")).estado, 200);
    assert.equal((await sin.admin.put("/api/modulos", { operacion: false })).estado, 200);
    assert.equal(await prisma.configuracion_organizacion.count({ where: { organizacion_id: sin.org.organizacionId } }), 1);
    assert.ok(esDelModulo(await sin.admin.get<Err>("/api/eventos")));
  } finally {
    await sin.cerrar();
  }
});

test("no hay fuga entre organizaciones: apagar en una no toca a la otra, ni sus rutas ni su /api/yo ni su configuración", async () => {
  await fijar(m, TODOS_ENCENDIDOS);
  await fijar(ajeno, TODOS_ENCENDIDOS);
  assert.equal((await m.admin.put("/api/modulos", { inscripcion: false, operacion: false, finanzas: false, tableros: false, clase_muestra: false })).estado, 200);
  assert.ok(esDelModulo(await m.admin.get<Err>("/api/cargos")));
  // La otra sigue entera.
  for (const ruta of Object.values(LECTURAS)) assert.equal((await ajeno.admin.get(ruta)).estado, 200, ruta);
  assert.deepEqual((await ajeno.admin.get<{ modulos: Record<Modulo, boolean> }>("/api/yo")).cuerpo.modulos, TODOS_ENCENDIDOS);
  const fila = await prisma.configuracion_organizacion.findFirstOrThrow({ where: { organizacion_id: ajeno.org.organizacionId } });
  assert.deepEqual([fila.modulo_finanzas, fila.modulo_inscripcion, fila.modulo_clase_muestra], [true, true, true]);
  // Y al revés.
  assert.equal((await ajeno.admin.put("/api/modulos", { tableros: false })).estado, 200);
  assert.deepEqual((await m.admin.get<{ modulos: Record<Modulo, boolean> }>("/api/yo")).cuerpo.modulos, { ...TODOS_ENCENDIDOS, inscripcion: false, operacion: false, finanzas: false, tableros: false, clase_muestra: false });
  await fijar(m, TODOS_ENCENDIDOS);
  await fijar(ajeno, TODOS_ENCENDIDOS);
});

test("un cambio de módulos no pisa los demás ajustes de la configuración (ni al revés)", async () => {
  await fijar(m, TODOS_ENCENDIDOS);
  assert.equal((await m.admin.patch("/api/configuracion", { umbral_dias_deuda: 21 })).estado, 200);
  assert.equal((await m.admin.put("/api/modulos", { tableros: false })).estado, 200);
  const fila = await prisma.configuracion_organizacion.findFirstOrThrow({ where: { organizacion_id: m.org.organizacionId } });
  assert.deepEqual([fila.umbral_dias_deuda, fila.modulo_tableros], [21, false]);
  assert.equal((await m.admin.patch("/api/configuracion", { umbral_dias_deuda: 15 })).estado, 200);
  assert.equal((await m.admin.get<Lista>("/api/modulos")).cuerpo.modulos.find((x) => x.id === "tableros")!.encendido, false);
  await fijar(m, TODOS_ENCENDIDOS);
});

test("la base impone las dependencias aunque alguien escriba directo: un estado incoherente no se puede guardar", async () => {
  await assert.rejects(fijarConfiguracion(prisma, m.org.organizacionId, { modulo_inscripcion: false }), /configuracion_modulos_dependencias_chk|check constraint/i);
  await assert.rejects(fijarConfiguracion(prisma, m.org.organizacionId, { modulo_clase_muestra: false }), /configuracion_modulos_dependencias_chk|check constraint/i);
  await fijar(m, TODOS_ENCENDIDOS);
});

test("el expediente del alumno no trae lo de un módulo apagado: sin finanzas no hay económico ni productos; sin operación no hay asistencia, eventos, niveles ni próximo examen", async () => {
  await fijar(m, TODOS_ENCENDIDOS);
  const i = await m.inscribir({ diaCorte: 20 });
  const ruta = `/api/alumnos/${i.alumnoId}/expediente`;
  type Exp = { economico: unknown; operativo: { asistencia: unknown; eventos: unknown; productos_comprados: unknown }; trayectoria: { niveles: unknown[]; proximo_examen: unknown[] } };
  const completo = (await m.admin.get<Exp>(ruta)).cuerpo;
  assert.ok(completo.economico);
  assert.ok(completo.operativo.asistencia && completo.operativo.eventos && completo.operativo.productos_comprados);
  await fijar(m, apagadoCon("finanzas"));
  const sinFinanzas = (await m.admin.get<Exp>(ruta)).cuerpo;
  assert.equal(sinFinanzas.economico, null);
  assert.equal(sinFinanzas.operativo.productos_comprados, null);
  assert.ok(sinFinanzas.operativo.asistencia, "lo de operación sigue");
  await fijar(m, apagadoCon("operacion"));
  const sinOperacion = (await m.admin.get<Exp>(ruta)).cuerpo;
  assert.deepEqual([sinOperacion.operativo.asistencia, sinOperacion.operativo.eventos, sinOperacion.trayectoria.niveles, sinOperacion.trayectoria.proximo_examen], [null, null, [], []]);
  assert.ok(sinOperacion.economico, "lo de finanzas sigue");
  await fijar(m, TODOS_ENCENDIDOS);
});

test("las tareas de un módulo apagado no se listan ni se pueden resolver; al encenderlo vuelven (nada se perdió)", async () => {
  await fijar(m, TODOS_ENCENDIDOS);
  const alumno = await m.alumno();
  const tarea = await prisma.tarea_asesor.create({ data: { organizacion_id: m.org.organizacionId, lead_id: alumno.leadId, tipo: "deuda_vencida", descripcion: "Deuda de prueba" } });
  const propia = await prisma.tarea_asesor.create({ data: { organizacion_id: m.org.organizacionId, lead_id: alumno.leadId, tipo: "lead_frio", descripcion: "Lead frío de prueba" } });
  const ids = async (): Promise<string[]> => (await m.admin.get<{ datos: { id: string }[] }>(`/api/tareas?lead_id=${alumno.leadId}&limite=100`)).cuerpo.datos.map((t) => t.id);
  assert.deepEqual((await ids()).sort(), [tarea.id, propia.id].sort());
  await fijar(m, apagadoCon("finanzas"));
  assert.deepEqual(await ids(), [propia.id], "la de cobranza desaparece; la de captación sigue");
  assert.equal((await m.admin.patch(`/api/tareas/${tarea.id}`, { estado: "hecha" })).estado, 404);
  assert.equal((await m.admin.get(`/api/tareas?tipo=deuda_vencida&lead_id=${alumno.leadId}`)).estado, 200);
  assert.deepEqual((await m.admin.get<{ datos: unknown[] }>(`/api/tareas?tipo=deuda_vencida&lead_id=${alumno.leadId}`)).cuerpo.datos, []);
  await fijar(m, TODOS_ENCENDIDOS);
  assert.deepEqual((await ids()).sort(), [tarea.id, propia.id].sort());
  assert.equal((await m.admin.patch(`/api/tareas/${tarea.id}`, { estado: "hecha" })).estado, 200);
});
