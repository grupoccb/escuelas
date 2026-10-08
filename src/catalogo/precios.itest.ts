// C2 de punta a punta: precios versionados por fecha (API, función `precioVigente`, restricción de
// exclusión en la base y carreras). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { Barrera } from "../testutil/carrera.ts";
import { precioVigente } from "./precios.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let recepcionSur: ClienteApi;
let maestro: ClienteApi;
let pNorte: string;
let pSur: string;

interface Precio { id: string; programa_id: string; costo_inscripcion: string; costo_mensualidad: string; moneda: string; vigencia_desde: string; vigencia_hasta: string | null }
interface ErrorBody { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Precios");
  ajena = await sembrarOrganizacion(prisma, "PreciosAjena");
  const norte = org.sucursales[0]!.id;
  const sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar("administrador");
  asesorNorte = await entrar("asesor", [norte]);
  recepcionSur = await entrar("recepcion", [sur]);
  maestro = await entrar("maestro");
  const programa = (sucursal: string, nombre: string) =>
    prisma.programa.create({ data: { organizacion_id: org.organizacionId, vertical_id: org.verticalId, sucursal_id: sucursal, nombre, edad_min: 3, edad_max: 12 } });
  pNorte = (await programa(norte, "Programa norte")).id;
  pSur = (await programa(sur, "Programa sur")).id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const programaNuevo = async (nombre = `P ${randomUUID().slice(0, 6)}`): Promise<string> =>
  (await prisma.programa.create({ data: { organizacion_id: org.organizacionId, vertical_id: org.verticalId, sucursal_id: org.sucursales[0]!.id, nombre, edad_min: 3, edad_max: 12 } })).id;
const alta = (programa: string, desde: string, insc = "1500.00", mens = "900.00", extra: object = {}) =>
  admin.post<Precio & ErrorBody>("/api/precios", { programa_id: programa, costo_inscripcion: insc, costo_mensualidad: mens, vigencia_desde: desde, ...extra });
const historial = async (programa: string): Promise<Precio[]> => (await admin.get<{ datos: Precio[] }>(`/api/precios?programa_id=${programa}&limite=100`)).cuerpo.datos;
const db = () => conAlcance(prisma, org.organizacionId);

test("precioVigente: bordes de fecha (desde y hasta inclusivos), abierta, borrados y otra organización", async () => {
  const p = await programaNuevo();
  const fila = (desde: string, hasta: string | null, insc: string, mens: string) =>
    prisma.precio.create({ data: { organizacion_id: org.organizacionId, programa_id: p, costo_inscripcion: insc, costo_mensualidad: mens, vigencia_desde: new Date(`${desde}T00:00:00Z`), ...(hasta ? { vigencia_hasta: new Date(`${hasta}T00:00:00Z`) } : {}) } });
  await fila("2026-01-01", "2026-03-31", "1000.00", "500.00");
  const b = await fila("2026-04-01", null, "1200.50", "650.25");
  assert.equal(await precioVigente(db(), p, "2025-12-31"), null, "antes de todo");
  const a = await precioVigente(db(), p, "2026-01-01");
  assert.deepEqual([a?.costoInscripcion, a?.costoMensualidad, a?.moneda, a?.desde, a?.hasta], [100000n, 50000n, "MXN", "2026-01-01", "2026-03-31"]);
  assert.equal((await precioVigente(db(), p, "2026-03-31"))?.costoInscripcion, 100000n, "el último día de la primera");
  const nuevo = await precioVigente(db(), p, "2026-04-01");
  assert.deepEqual([nuevo?.id, nuevo?.costoInscripcion, nuevo?.costoMensualidad, nuevo?.hasta], [b.id, 120050n, 65025n, null], "el primer día de la segunda, con centavos exactos");
  assert.equal((await precioVigente(db(), p, "2099-12-31"))?.id, b.id, "abierta: rige hacia siempre");
  await prisma.precio.update({ where: { id: b.id }, data: { eliminado_en: new Date() } });
  assert.equal(await precioVigente(db(), p, "2026-06-01"), null, "uno dado de baja no rige");
  assert.equal(await precioVigente(conAlcance(prisma, ajena.organizacionId), p, "2026-01-01"), null, "otra organización no lo ve");
});

test("API alta: la primera vigencia queda abierta; la siguiente CIERRA la anterior el día previo; el historial y el filtro vigente_en", async () => {
  const p = await programaNuevo();
  const uno = await alta(p, "2026-01-01", "1500", "900");
  assert.equal(uno.estado, 201, JSON.stringify(uno.cuerpo));
  assert.deepEqual([uno.cuerpo.costo_inscripcion, uno.cuerpo.costo_mensualidad, uno.cuerpo.moneda, uno.cuerpo.vigencia_desde, uno.cuerpo.vigencia_hasta], ["1500.00", "900.00", "MXN", "2026-01-01", null]);
  const dos = await alta(p, "2026-07-01", "1600.50", "950.10", { moneda: "mxn" });
  assert.equal(dos.estado, 201);
  assert.equal(dos.cuerpo.moneda, "MXN");
  const tres = await alta(p, "2027-01-01", "1700", "1000");
  assert.equal(tres.estado, 201);
  const h = await historial(p);
  assert.deepEqual(h.map((x) => [x.vigencia_desde, x.vigencia_hasta, x.costo_mensualidad]), [
    ["2027-01-01", null, "1000.00"],
    ["2026-07-01", "2026-12-31", "950.10"],
    ["2026-01-01", "2026-06-30", "900.00"],
  ]);
  const en = async (fecha: string) => (await admin.get<{ datos: Precio[] }>(`/api/precios?programa_id=${p}&vigente_en=${fecha}`)).cuerpo.datos.map((x) => x.vigencia_desde);
  assert.deepEqual(await en("2026-06-30"), ["2026-01-01"]);
  assert.deepEqual(await en("2026-07-01"), ["2026-07-01"]);
  assert.deepEqual(await en("2025-01-01"), []);
  // El registro de cambios deja el cierre de la anterior Y el alta.
  const reg = await prisma.registro_cambio.findMany({ where: { entidad_tipo: "precio", entidad_id: { in: h.map((x) => x.id) } }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });
  assert.equal(reg.filter((x) => x.accion === "crear").length, 3);
  const cierres = reg.filter((x) => x.accion === "actualizar");
  assert.equal(cierres.length, 2);
  assert.deepEqual([cierres[0]!.antes, cierres[0]!.despues], [{ vigencia_hasta: null }, { vigencia_hasta: "2026-06-30" }]);
  assert.ok(reg.every((x) => x.usuario_id !== null));
});

test("API alta: no se empieza el mismo día ni antes de lo ya registrado (409), y las entradas inválidas dan 400", async () => {
  const p = await programaNuevo();
  assert.equal((await alta(p, "2026-06-01")).estado, 201);
  const igual = await alta(p, "2026-06-01");
  assert.equal(igual.estado, 409);
  assert.equal(igual.cuerpo.error.detalles?.[0]?.campo, "vigencia_desde");
  assert.equal((await alta(p, "2026-01-01")).estado, 409, "antes de la existente");
  assert.equal((await historial(p)).length, 1, "nada cambió");
  for (const mal of [
    { costo_inscripcion: 1500 }, // número JSON: flotante
    { costo_inscripcion: 1500.5 },
    { costo_inscripcion: "1,500.00" },
    { costo_inscripcion: "15.005" },
    { costo_inscripcion: "-1.00" },
    { costo_inscripcion: "10000000000.00" },
    { costo_inscripcion: "abc" },
    { costo_mensualidad: null },
    { vigencia_desde: "2026-02-30" },
    { vigencia_desde: "01/02/2026" },
    { moneda: "PESOS" },
    { programa_id: randomUUID() },
    { programa_id: "no-es-uuid" },
    { extra: 1 },
  ]) {
    const r = await alta(p, "2027-01-01", "1500.00", "900.00", mal);
    assert.equal(r.estado, 400, JSON.stringify(mal));
  }
  const numero = await alta(p, "2027-01-01", 1500 as unknown as string);
  assert.match(numero.cuerpo.error.detalles?.[0]?.mensaje ?? "", /flotante/, "dice por qué: un número JSON es un flotante");
  assert.equal((await alta(p, "2027-01-01", "9999999999.99", "0.00")).estado, 201, "el máximo y el cero caben");
  const otraOrg = await prisma.programa.create({ data: { organizacion_id: ajena.organizacionId, vertical_id: ajena.verticalId, sucursal_id: ajena.sucursales[0]!.id, nombre: "Ajeno", edad_min: 3, edad_max: 5 } });
  assert.equal((await alta(otraOrg.id, "2026-01-01")).estado, 400, "un programa de otra organización no existe para mí");
});

test("API cambios: corregir costos, cerrar/reabrir una vigencia (la base impide el traslape) y baja lógica; todo con registro", async () => {
  const p = await programaNuevo();
  const a = (await alta(p, "2026-01-01", "1000", "500")).cuerpo;
  const b = (await alta(p, "2026-07-01", "1100", "550")).cuerpo;
  const corregido = await admin.patch<Precio>(`/api/precios/${b.id}`, { costo_mensualidad: "555.55" });
  assert.equal(corregido.estado, 200);
  assert.equal(corregido.cuerpo.costo_mensualidad, "555.55");
  assert.equal((await admin.patch(`/api/precios/${b.id}`, {})).estado, 400);
  assert.equal((await admin.patch(`/api/precios/${b.id}`, { costo_mensualidad: 5 })).estado, 400, "número JSON");
  assert.equal((await admin.patch(`/api/precios/${randomUUID()}`, { costo_mensualidad: "1.00" })).estado, 404);
  assert.equal((await admin.patch(`/api/precios/${b.id}`, { vigencia_hasta: "2026-06-30" })).estado, 400, "antes del inicio");
  // Alargar la primera hasta pisar a la segunda → 409 (restricción de exclusión).
  const pisa = await admin.patch<ErrorBody>(`/api/precios/${a.id}`, { vigencia_hasta: "2026-08-01" });
  assert.equal(pisa.estado, 409);
  assert.equal((await historial(p)).find((x) => x.id === a.id)?.vigencia_hasta, "2026-06-30", "no cambió");
  // Cerrar la abierta es posible; y se puede volver a abrir mientras nadie la pise.
  assert.equal((await admin.patch(`/api/precios/${b.id}`, { vigencia_hasta: "2026-12-31" })).estado, 200);
  assert.equal((await admin.patch(`/api/precios/${b.id}`, { vigencia_hasta: null })).estado, 200);
  // Baja lógica: queda un hueco, y se puede dar de alta otro que empiece donde empezaba.
  assert.equal((await admin.delete(`/api/precios/${b.id}`)).estado, 204);
  assert.ok((await prisma.precio.findFirstOrThrow({ where: { id: b.id } })).eliminado_en, "la fila sigue");
  assert.equal(await precioVigente(db(), p, "2026-09-01"), null, "hueco: sin precio vigente");
  assert.equal((await alta(p, "2026-07-01", "1200", "600")).estado, 201);
  assert.equal((await admin.delete(`/api/precios/${randomUUID()}`)).estado, 404);
  const reg = await prisma.registro_cambio.findMany({ where: { entidad_id: b.id }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });
  assert.deepEqual(reg.map((x) => x.accion), ["crear", "actualizar", "actualizar", "actualizar", "eliminar"]);
  assert.deepEqual(reg[1]!.antes, { costo_mensualidad: "550.00" });
  assert.deepEqual(reg[1]!.despues, { costo_mensualidad: "555.55" });
});

test("permisos y alcance: todos leen lo suyo, solo el administrador escribe; lo ajeno es 404; no-fuga entre organizaciones", async () => {
  const mio = (await alta(pNorte, "2026-01-01")).cuerpo;
  const deSur = (await alta(pSur, "2026-01-01")).cuerpo;
  const ids = async (c: ClienteApi) => (await c.get<{ datos: Precio[] }>("/api/precios?limite=100")).cuerpo.datos.map((x) => x.id);
  const a = await ids(asesorNorte);
  assert.ok(a.includes(mio.id) && !a.includes(deSur.id));
  const r = await ids(recepcionSur);
  assert.ok(r.includes(deSur.id) && !r.includes(mio.id));
  assert.ok((await ids(admin)).includes(mio.id) && (await ids(admin)).includes(deSur.id));
  assert.deepEqual(await ids(maestro), [], "un maestro sin grupos no ve precios");
  assert.equal((await asesorNorte.get(`/api/precios/${deSur.id}`)).estado, 404, "lo ajeno es 404, no 403");
  assert.equal((await asesorNorte.get(`/api/precios/${mio.id}`)).estado, 200);
  for (const c of [asesorNorte, recepcionSur, maestro]) {
    assert.equal((await c.post("/api/precios", { programa_id: pNorte, costo_inscripcion: "1.00", costo_mensualidad: "1.00", vigencia_desde: "2030-01-01" })).estado, 403);
    assert.equal((await c.patch(`/api/precios/${mio.id}`, { costo_inscripcion: "1.00" })).estado, 403);
    assert.equal((await c.delete(`/api/precios/${mio.id}`)).estado, 403);
  }
  const programaAjeno = await prisma.programa.create({ data: { organizacion_id: ajena.organizacionId, vertical_id: ajena.verticalId, sucursal_id: ajena.sucursales[0]!.id, nombre: "Ajeno 2", edad_min: 3, edad_max: 5 } });
  const ajeno = await prisma.precio.create({ data: { organizacion_id: ajena.organizacionId, programa_id: programaAjeno.id, costo_inscripcion: "1.00", costo_mensualidad: "1.00", vigencia_desde: new Date("2026-01-01T00:00:00Z") } });
  assert.ok(!(await ids(admin)).includes(ajeno.id));
  assert.equal((await admin.get(`/api/precios/${ajeno.id}`)).estado, 404);
  assert.equal((await admin.patch(`/api/precios/${ajeno.id}`, { costo_inscripcion: "9.00" })).estado, 404);
  assert.equal((await admin.delete(`/api/precios/${ajeno.id}`)).estado, 404);
  assert.equal((await prisma.precio.findFirstOrThrow({ where: { id: ajeno.id } })).costo_inscripcion.toFixed(2), "1.00");
});

test("la BASE impide el traslape de vigencias aunque se escriba sin la API, y los montos son exactos", async () => {
  const p = await programaNuevo();
  const fila = (desde: string, hasta: string | null, insc = "10.00") =>
    prisma.precio.create({ data: { organizacion_id: org.organizacionId, programa_id: p, costo_inscripcion: insc, costo_mensualidad: "1.00", vigencia_desde: new Date(`${desde}T00:00:00Z`), ...(hasta ? { vigencia_hasta: new Date(`${hasta}T00:00:00Z`) } : {}) } });
  await fila("2026-01-01", "2026-03-31");
  await assert.rejects(fila("2026-03-31", "2026-05-01"), /precio_vigencia_excl/, "un día de traslape");
  await assert.rejects(fila("2025-12-01", null), /precio_vigencia_excl/, "una abierta que cubre a la existente");
  await assert.rejects(fila("2026-02-01", "2026-02-10"), /precio_vigencia_excl/, "contenida");
  await fila("2026-04-01", "2026-04-30"); // contigua: entra
  await assert.rejects(prisma.precio.create({ data: { organizacion_id: org.organizacionId, programa_id: p, costo_inscripcion: "-1.00", costo_mensualidad: "1.00", vigencia_desde: new Date("2030-01-01T00:00:00Z") } }), /precio_costos_check/);
  await assert.rejects(fila("2030-06-01", "2030-05-01"), /precio_vigencia_check/);
  await assert.rejects(prisma.precio.create({ data: { organizacion_id: org.organizacionId, programa_id: p, costo_inscripcion: "1.00", costo_mensualidad: "1.00", moneda: "mxn", vigencia_desde: new Date("2031-01-01T00:00:00Z") } }), /precio_moneda_check/);
  // Un precio dado de baja no estorba: su rango se puede reutilizar.
  const baja = await fila("2027-01-01", "2027-12-31");
  await prisma.precio.update({ where: { id: baja.id }, data: { eliminado_en: new Date() } });
  await fila("2027-06-01", "2027-06-30");
  // Montos exactos: lo que se escribe es lo que se lee, con centavos.
  const exacto = await fila("2040-01-01", null, "0.10");
  const leido = await prisma.precio.findFirstOrThrow({ where: { id: exacto.id } });
  assert.equal(leido.costo_inscripcion.toFixed(2), "0.10");
  assert.equal((await precioVigente(db(), p, "2040-01-01"))?.costoInscripcion, 10n);
});

test("CARRERA: dos altas simultáneas con la MISMA fecha → una gana (201) y la otra 409; el historial queda sin traslapes", async () => {
  const p = await programaNuevo();
  assert.equal((await alta(p, "2026-01-01")).estado, 201);
  const clientes: ClienteApi[] = [];
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  for (let i = 0; i < 6; i++) {
    const c = api.cliente();
    await c.login(org.slug, u.correo, u.contrasena);
    clientes.push(c);
  }
  const rs = await Promise.all(clientes.map((c, i) => c.post<Precio & ErrorBody>("/api/precios", { programa_id: p, costo_inscripcion: `${1000 + i}.00`, costo_mensualidad: "500.00", vigencia_desde: "2026-06-01" })));
  assert.equal(rs.filter((r) => r.estado === 201).length, 1, JSON.stringify(rs.map((r) => r.estado)));
  assert.equal(rs.filter((r) => r.estado === 409).length, 5);
  const h = await historial(p);
  assert.deepEqual(h.map((x) => [x.vigencia_desde, x.vigencia_hasta]), [["2026-06-01", null], ["2026-01-01", "2026-05-31"]]);
});

test("CARRERA: seis altas simultáneas con fechas DISTINTAS → el historial queda contiguo, sin huecos ni traslapes, y solo una abierta", async () => {
  const p = await programaNuevo();
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const fechas = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"];
  const clientes: ClienteApi[] = [];
  for (let i = 0; i < fechas.length; i++) {
    const c = api.cliente();
    await c.login(org.slug, u.correo, u.contrasena);
    clientes.push(c);
  }
  const rs = await Promise.all(fechas.map((f, i) => clientes[i]!.post<ErrorBody>("/api/precios", { programa_id: p, costo_inscripcion: "100.00", costo_mensualidad: "50.00", vigencia_desde: f })));
  const aceptadas = rs.map((r, i) => (r.estado === 201 ? fechas[i]! : null)).filter((f): f is string => f !== null).sort();
  assert.ok(aceptadas.length >= 1 && rs.every((r) => r.estado === 201 || r.estado === 409), JSON.stringify(rs.map((r) => r.estado)));
  const h = (await historial(p)).sort((a, b) => (a.vigencia_desde < b.vigencia_desde ? -1 : 1));
  assert.deepEqual(h.map((x) => x.vigencia_desde), aceptadas);
  h.forEach((x, i) => {
    if (i < h.length - 1) assert.ok(x.vigencia_hasta !== null && x.vigencia_hasta < h[i + 1]!.vigencia_desde, "cada una termina antes de la siguiente");
    else assert.equal(x.vigencia_hasta, null, "solo la última queda abierta");
  });
});

test("CARRERA en la base: dos transacciones que insertan vigencias que se traslapan → una confirma y la otra falla", async () => {
  const p = await programaNuevo();
  const barrera = new Barrera(2);
  const intento = (desde: string, hasta: string) =>
    prisma.$transaction(async (tx) => {
      await tx.precio.create({ data: { organizacion_id: org.organizacionId, programa_id: p, costo_inscripcion: "1.00", costo_mensualidad: "1.00", vigencia_desde: new Date(`${desde}T00:00:00Z`), vigencia_hasta: new Date(`${hasta}T00:00:00Z`) } });
      await barrera.esperar(400);
    });
  const resultados = await Promise.allSettled([intento("2026-01-01", "2026-06-30"), intento("2026-06-01", "2026-12-31")]);
  assert.deepEqual(resultados.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  // Postgres arbitra con la exclusión (precio_vigencia_excl) o, si las dos se esperaban a la vez, con su detección de interbloqueo.
  assert.match(String((resultados.find((r) => r.status === "rejected") as PromiseRejectedResult).reason), /precio_vigencia_excl|write conflict or a deadlock/);
  assert.equal(await prisma.precio.count({ where: { programa_id: p } }), 1);
});
