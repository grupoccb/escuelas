// Ficha de salud (B4): cifrado en la base, permisos, registro de accesos y API. Postgres real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { levantarApi, sembrarUsuario, type UsuarioDePrueba } from "../testutil/api.ts";
import { crearCifrador, ErrorCifrado } from "./cifrado.ts";
import { ErrorAccesoSensible, guardarSensible, leerSensible, type ActorSensible, type MaestroDelSujeto } from "./index.ts";
import { Sensible } from "./marca.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let admin: UsuarioDePrueba;
let maestro: UsuarioDePrueba;
let asesor: UsuarioDePrueba;
let recepcion: UsuarioDePrueba;
const cifrador = crearCifrador(randomBytes(32));

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Ficha");
  admin = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  maestro = await sembrarUsuario(prisma, org.organizacionId, { rol: "maestro" });
  asesor = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor", sucursales: [org.sucursales[0]!.id] });
  recepcion = await sembrarUsuario(prisma, org.organizacionId, { rol: "recepcion", sucursales: [org.sucursales[0]!.id] });
});
after(async () => {
  await prisma.$disconnect();
});

const db = () => conAlcance(prisma, org.organizacionId);
const actor = (u: UsuarioDePrueba, organizacionId = org.organizacionId): ActorSensible => ({ usuarioId: u.id, organizacionId, rol: u.rol });
const opciones = { cifrador };

async function sembrarProspecto(o: OrganizacionDePrueba = org): Promise<string> {
  const lead = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, etapa_id: o.etapaInicialId, telefono: `+5255${randomInt(10_000_000, 99_999_999)}` } });
  const p = await prisma.prospecto.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, vertical_interes_id: o.verticalId, nombre: "Menor" } });
  return p.id;
}

const accesos = (sujetoId: string) => prisma.acceso_dato_sensible.findMany({ where: { sujeto_id: sujetoId }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });

test("guardar: en la base solo hay texto cifrado (nunca el valor), y leer lo devuelve envuelto en Sensible", async () => {
  const id = await sembrarProspecto();
  await guardarSensible(db(), actor(admin), {
    sujetoTipo: "prospecto",
    sujetoId: id,
    motivo: "captura en inscripción",
    ruta: "PUT /prueba",
    valores: { alergias: "penicilina-reservada-para-pruebas", medicamentos: "insulina-reservada-para-pruebas", contacto_emergencia: { nombre: "Tía Rosa-reservada-para-pruebas", telefono: "+525511112222" }, autorizacion_atencion_medica: true },
  }, opciones);
  const fila = await prisma.ficha_salud.findFirstOrThrow({ where: { sujeto_id: id } });
  assert.ok(!JSON.stringify(fila).includes("reservada-para-pruebas") && !JSON.stringify(fila).includes("5511112222"), "ni rastro del valor en la fila");
  assert.match(fila.alergias ?? "", /^v1\./);
  assert.equal(fila.condiciones_medicas, null);

  const ficha = await leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "revisión", ruta: "GET /prueba" }, opciones);
  assert.equal(ficha.existe, true);
  assert.ok(ficha.campos.alergias instanceof Sensible);
  assert.equal(ficha.campos.alergias?.revelar(), "penicilina-reservada-para-pruebas");
  assert.deepEqual(ficha.campos.contacto_emergencia?.revelar(), { nombre: "Tía Rosa-reservada-para-pruebas", telefono: "+525511112222" });
  assert.equal(ficha.campos.autorizacion_atencion_medica?.revelar(), true);
  assert.equal(ficha.campos.condiciones_medicas, null);
  assert.equal(JSON.stringify(ficha), JSON.stringify({ existe: true, campos: JSON.parse(JSON.stringify(ficha.campos)) }));
  assert.ok(!JSON.stringify(ficha).includes("reservada-para-pruebas"), "serializar la respuesta no revela nada");
});

test("cada lectura y escritura deja su registro (quién, a quién, QUÉ campos, motivo, ruta) sin valores", async () => {
  const id = await sembrarProspecto();
  await guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "alta", ruta: "PUT /x", valores: { alergias: "valor-secreto-QQ" } }, opciones);
  await leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "consulta médica", ruta: "GET /x", campos: ["alergias", "medicamentos"] }, opciones);
  const filas = await accesos(id);
  assert.deepEqual(filas.map((f) => [f.accion, f.resultado, f.campos]), [["escribir", "permitido", ["alergias"]], ["leer", "permitido", ["alergias", "medicamentos"]]]);
  assert.ok(filas.every((f) => f.usuario_id === admin.id && f.sujeto_tipo === "prospecto"));
  assert.equal(filas[1]!.motivo, "consulta médica");
  assert.equal(filas[1]!.ruta, "GET /x");
  assert.ok(!JSON.stringify(filas).includes("valor-secreto-QQ"));
  // Solo de anexar.
  await assert.rejects(prisma.acceso_dato_sensible.update({ where: { id: filas[0]!.id }, data: { motivo: "otro" } }), /solo anexar/);
  await assert.rejects(prisma.acceso_dato_sensible.delete({ where: { id: filas[0]!.id } }), /solo anexar/);
});

test("leer solo los campos pedidos: los demás ni se consultan ni aparecen", async () => {
  const id = await sembrarProspecto();
  await guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "alta", valores: { alergias: "a", medicamentos: "m" } }, opciones);
  const ficha = await leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "solo alergias", campos: ["alergias"] }, opciones);
  assert.deepEqual(Object.keys(ficha.campos), ["alergias"]);
});

test("actualizar mezcla: lo no mencionado no cambia y null borra", async () => {
  const id = await sembrarProspecto();
  await guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "alta", valores: { alergias: "a1", medicamentos: "m1" } }, opciones);
  await guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "cambio", valores: { alergias: "a2", medicamentos: null } }, opciones);
  const f = await leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "ver" }, opciones);
  assert.equal(f.campos.alergias?.revelar(), "a2");
  assert.equal(f.campos.medicamentos, null);
  assert.equal(await prisma.ficha_salud.count({ where: { sujeto_id: id } }), 1);
});

test("quién puede: administrador sí; asesor y recepción nunca (ni leer ni escribir), y CADA intento suyo queda registrado como denegado (EB-01)", async () => {
  const id = await sembrarProspecto();
  await guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "alta", valores: { alergias: "a" } }, opciones);
  for (const u of [asesor, recepcion]) {
    await assert.rejects(leerSensible(db(), actor(u), { sujetoTipo: "prospecto", sujetoId: id, motivo: "curiosidad" }, opciones), (e) => e instanceof ErrorAccesoSensible && e.motivo === "sin_permiso");
    await assert.rejects(guardarSensible(db(), actor(u), { sujetoTipo: "prospecto", sujetoId: id, motivo: "x", valores: { alergias: "x" } }, opciones), (e) => e instanceof ErrorAccesoSensible && e.motivo === "sin_permiso");
  }
  const filas = await accesos(id);
  assert.equal(filas.length, 5, "el del administrador y los cuatro intentos denegados");
  const denegados = filas.filter((f) => f.resultado === "denegado");
  assert.deepEqual(denegados.map((f) => [f.usuario_id === asesor.id ? "asesor" : "recepcion", f.accion, f.causa]), [
    ["asesor", "leer", "sin_permiso"],
    ["asesor", "escribir", "sin_permiso"],
    ["recepcion", "leer", "sin_permiso"],
    ["recepcion", "escribir", "sin_permiso"],
  ]);
  assert.ok(filas.filter((f) => f.resultado === "permitido").every((f) => f.causa === null));
});

test("el maestro falla CERRADO: sin la relación inscripción→grupo no lee ni escribe, y AMBOS intentos quedan registrados como denegados (EB-01)", async () => {
  const id = await sembrarProspecto();
  await guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "alta", valores: { alergias: "a" } }, opciones);
  await assert.rejects(leerSensible(db(), actor(maestro), { sujetoTipo: "prospecto", sujetoId: id, motivo: "clase" }, opciones), (e) => e instanceof ErrorAccesoSensible && e.motivo === "no_es_de_tu_grupo");
  await assert.rejects(guardarSensible(db(), actor(maestro), { sujetoTipo: "prospecto", sujetoId: id, motivo: "clase", valores: { alergias: "x" } }, opciones), ErrorAccesoSensible);
  const filas = await accesos(id);
  assert.deepEqual(filas.map((f) => [f.usuario_id === maestro.id ? "maestro" : "admin", f.accion, f.resultado, f.causa]), [
    ["admin", "escribir", "permitido", null],
    ["maestro", "leer", "denegado", "no_es_de_tu_grupo"],
    ["maestro", "escribir", "denegado", "no_es_de_tu_grupo"],
  ]);
  const leida = await leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "verifico" }, opciones);
  assert.equal(leida.campos.alergias?.revelar(), "a", "la escritura denegada del maestro no cambió nada");
});

test("con la regla del maestro conectada (F1/F3), el maestro lee SOLO a los de su grupo", async () => {
  const suyo = await sembrarProspecto();
  const ajeno = await sembrarProspecto();
  for (const id of [suyo, ajeno]) await guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "alta", valores: { alergias: `de-${id}` } }, opciones);
  const regla: MaestroDelSujeto = async (_db, usuarioId, _tipo, sujetoId) => usuarioId === maestro.id && sujetoId === suyo;
  const o = { cifrador, maestroDelSujeto: regla };
  assert.equal((await leerSensible(db(), actor(maestro), { sujetoTipo: "prospecto", sujetoId: suyo, motivo: "mi clase" }, o)).campos.alergias?.revelar(), `de-${suyo}`);
  await assert.rejects(leerSensible(db(), actor(maestro), { sujetoTipo: "prospecto", sujetoId: ajeno, motivo: "curiosidad" }, o), ErrorAccesoSensible);
});

test("sujeto inexistente, de otra organización o `alumno` (aún sin tabla) → no encontrado, y el sondeo queda registrado (EB-01)", async () => {
  const otra = await sembrarOrganizacion(prisma, "FichaOtra");
  const deOtra = await sembrarProspecto(otra);
  for (const [tipo, id] of [["prospecto", randomUUID()], ["prospecto", deOtra], ["alumno", randomUUID()]] as const) {
    await assert.rejects(leerSensible(db(), actor(admin), { sujetoTipo: tipo, sujetoId: id, motivo: "x" }, opciones), (e) => e instanceof ErrorAccesoSensible && e.motivo === "sujeto_no_encontrado");
    await assert.rejects(guardarSensible(db(), actor(admin), { sujetoTipo: tipo, sujetoId: id, motivo: "x", valores: { alergias: "a" } }, opciones), ErrorAccesoSensible);
    const filas = await accesos(id);
    assert.deepEqual(filas.map((f) => [f.organizacion_id === org.organizacionId, f.accion, f.resultado, f.causa]), [
      [true, "leer", "denegado", "sujeto_no_encontrado"],
      [true, "escribir", "denegado", "sujeto_no_encontrado"],
    ], `${tipo} ${id}`);
  }
});

test("un texto cifrado copiado a otra ficha (u otro campo) no descifra: está ligado a su lugar", async () => {
  const a = await sembrarProspecto();
  const b = await sembrarProspecto();
  for (const id of [a, b]) await guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "alta", valores: { alergias: `de-${id}` } }, opciones);
  const fa = await prisma.ficha_salud.findFirstOrThrow({ where: { sujeto_id: a } });
  await prisma.ficha_salud.updateMany({ where: { sujeto_id: b }, data: { alergias: fa.alergias } });
  await assert.rejects(leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: b, motivo: "x" }, opciones), ErrorCifrado);
  await prisma.ficha_salud.updateMany({ where: { sujeto_id: b }, data: { alergias: null, medicamentos: fa.alergias } });
  await assert.rejects(leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: b, motivo: "x" }, opciones), ErrorCifrado, "otro campo");
});

test("la base garantiza una sola ficha viva por sujeto", async () => {
  const id = await sembrarProspecto();
  const nueva = () => prisma.ficha_salud.create({ data: { organizacion_id: org.organizacionId, sujeto_tipo: "prospecto", sujeto_id: id } });
  await nueva();
  await assert.rejects(nueva(), /ficha_salud_sujeto_vivo_key|Unique/);
});

test("seis escrituras simultáneas de campos distintos del mismo sujeto → una sola ficha con todos los campos", async () => {
  const id = await sembrarProspecto();
  const campos = ["alergias", "condiciones_medicas", "medicamentos", "contacto_emergencia", "autorizacion_atencion_medica"] as const;
  await Promise.all([
    ...campos.map((c) => guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "carrera", valores: { [c]: c === "autorizacion_atencion_medica" ? true : `v-${c}` } }, opciones)),
    guardarSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "carrera", valores: { alergias: "v-alergias" } }, opciones),
  ]);
  assert.equal(await prisma.ficha_salud.count({ where: { sujeto_id: id } }), 1);
  const f = await leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "ver" }, opciones);
  for (const c of campos) assert.notEqual(f.campos[c], null, c);
});

test("carrera forzada: dos primeras escrituras que leen «no hay ficha» a la vez → el candado las serializa, ninguna falla y queda una ficha", async () => {
  const id = await sembrarProspecto();
  const barrera = new Barrera(2);
  const raiz = conGanchos(prisma, {
    modelo: "ficha_salud",
    operacion: "findFirst",
    antes: () => barrera.esperar(300),
  });
  const hechas = await Promise.allSettled(
    ["alergias", "medicamentos"].map((c) => guardarSensible(conAlcance(raiz, org.organizacionId), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "carrera", valores: { [c]: `v-${c}` } }, opciones)),
  );
  assert.deepEqual(hechas.map((h) => h.status), ["fulfilled", "fulfilled"]);
  assert.equal(await prisma.ficha_salud.count({ where: { sujeto_id: id } }), 1);
  const f = await leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "ver" }, opciones);
  assert.equal(f.campos.alergias?.revelar(), "v-alergias");
  assert.equal(f.campos.medicamentos?.revelar(), "v-medicamentos");
});

// ── API ─────────────────────────────────────────────────────────────────────────────────

test("API: PUT/GET con motivo; el teléfono de emergencia se normaliza; asesor y recepción 403; maestro 404 (cerrado); no se cachea", async () => {
  const id = await sembrarProspecto();
  const api = levantarApi(prisma, { sensibles: { cifrador } });
  try {
    const entrar = async (u: UsuarioDePrueba) => {
      const cli = api.cliente();
      assert.equal((await cli.login(org.slug, u.correo, u.contrasena)).estado, 201);
      return cli;
    };
    const cAdmin = await entrar(admin);
    const ruta = `/api/salud/prospecto/${id}`;
    const put = await cAdmin.pedir("PUT", ruta, { motivo: "alta en inscripción", alergias: "polen-API", contacto_emergencia: { nombre: "Abuela", telefono: "+5215533445566" }, autorizacion_atencion_medica: true });
    assert.equal(put.estado, 204);
    const get = await cAdmin.get<{ existe: boolean; campos: Record<string, unknown> }>(`${ruta}?motivo=${encodeURIComponent("revisión")}`);
    assert.equal(get.estado, 200);
    assert.equal(get.cuerpo.campos["alergias"], "polen-API");
    assert.deepEqual(get.cuerpo.campos["contacto_emergencia"], { nombre: "Abuela", telefono: "+525533445566" });
    assert.equal(get.cabeceras.get("cache-control"), "no-store");
    const solo = await cAdmin.get<{ campos: Record<string, unknown> }>(`${ruta}?motivo=ver&campos=alergias`);
    assert.deepEqual(Object.keys(solo.cuerpo.campos), ["alergias"]);

    assert.equal((await cAdmin.get(ruta)).estado, 400, "sin motivo no se lee");
    assert.equal((await cAdmin.get(`${ruta}?motivo=ver&campos=otro`)).estado, 400);
    assert.equal((await cAdmin.pedir("PUT", ruta, { motivo: "x" })).estado, 400, "motivo muy corto");
    assert.equal((await cAdmin.pedir("PUT", ruta, { motivo: "sin datos" })).estado, 400, "nada que guardar");
    assert.equal((await cAdmin.pedir("PUT", ruta, { motivo: "tel malo", contacto_emergencia: { nombre: "X", telefono: "abc" } })).estado, 400);
    assert.equal((await cAdmin.pedir("PUT", ruta, { motivo: "campo ajeno", sangre: "O+" })).estado, 400);

    for (const u of [asesor, recepcion]) {
      const cu = await entrar(u);
      assert.equal((await cu.get(`${ruta}?motivo=ver`)).estado, 403, u.rol);
      assert.equal((await cu.pedir("PUT", ruta, { motivo: "ver", alergias: "x" })).estado, 403, u.rol);
    }
    const cMaestro = await entrar(maestro);
    assert.equal((await cMaestro.get(`${ruta}?motivo=ver`)).estado, 404);
    assert.equal((await cAdmin.get(`/api/salud/prospecto/${randomUUID()}?motivo=ver`)).estado, 404);
    assert.equal((await cAdmin.get(`/api/salud/alumno/${randomUUID()}?motivo=ver`)).estado, 404);
    assert.equal((await cAdmin.get(`/api/salud/mascota/${id}?motivo=ver`)).estado, 400);
    // Los accesos quedaron registrados (incluido el intento denegado del maestro y los de asesor y recepción, que niega la ruta antes del servicio).
    const filas = await accesos(id);
    assert.ok(filas.some((f) => f.usuario_id === maestro.id && f.resultado === "denegado" && f.causa === "no_es_de_tu_grupo"));
    for (const u of [asesor, recepcion]) {
      const suyos = filas.filter((f) => f.usuario_id === u.id);
      assert.deepEqual(suyos.map((f) => [f.accion, f.resultado, f.causa]), [["leer", "denegado", "sin_permiso"], ["escribir", "denegado", "sin_permiso"]], u.rol);
    }
    assert.ok(filas.every((f) => !JSON.stringify(f).includes("polen-API")));
    // Un identificador mal formado no tiene a quién atribuirse: 400 al administrador, nada para el asesor, y sin rastro.
    const antes = await prisma.acceso_dato_sensible.count({ where: { usuario_id: asesor.id } });
    const cAsesor = await entrar(asesor);
    assert.equal((await cAsesor.get(`/api/salud/prospecto/no-es-uuid?motivo=ver`)).estado, 403);
    assert.equal(await prisma.acceso_dato_sensible.count({ where: { usuario_id: asesor.id } }), antes);

    // El administrador consulta el registro: quién vio a quién. Asesor y maestro no.
    const lista = await cAdmin.get<{ datos: { usuario_id: string; resultado: string; causa: string | null; accion: string; sujeto_id: string }[]; paginacion: { total: number } }>(`/api/salud-accesos?sujeto_id=${id}&limite=100`);
    assert.equal(lista.estado, 200);
    assert.equal(lista.cuerpo.paginacion.total, filas.length);
    assert.ok(lista.cuerpo.datos.every((f) => f.sujeto_id === id));
    assert.ok(lista.cuerpo.datos.some((f) => f.usuario_id === asesor.id && f.resultado === "denegado" && f.causa === "sin_permiso"));
    assert.ok(!JSON.stringify(lista.cuerpo).includes("polen-API"));
    const soloDenegados = await cAdmin.get<{ datos: { resultado: string }[] }>(`/api/salud-accesos?sujeto_id=${id}&resultado=denegado`);
    assert.ok(soloDenegados.cuerpo.datos.length > 0 && soloDenegados.cuerpo.datos.every((f) => f.resultado === "denegado"));
    for (const u of [asesor, maestro, recepcion]) assert.equal((await (await entrar(u)).get(`/api/salud-accesos`)).estado, 403, u.rol);
  } finally {
    await api.cerrar();
  }
});

test("API: con la regla del maestro conectada, el maestro lee los de su grupo (200) y no los demás (404)", async () => {
  const suyo = await sembrarProspecto();
  const ajeno = await sembrarProspecto();
  const regla: MaestroDelSujeto = async (_db, _u, _t, sujetoId) => sujetoId === suyo;
  const api = levantarApi(prisma, { sensibles: { cifrador, maestroDelSujeto: regla } });
  try {
    const cAdmin = api.cliente();
    await cAdmin.login(org.slug, admin.correo, admin.contrasena);
    for (const id of [suyo, ajeno]) await cAdmin.pedir("PUT", `/api/salud/prospecto/${id}`, { motivo: "alta", alergias: "x" });
    const cM = api.cliente();
    await cM.login(org.slug, maestro.correo, maestro.contrasena);
    assert.equal((await cM.get(`/api/salud/prospecto/${suyo}?motivo=mi%20clase`)).estado, 200);
    assert.equal((await cM.get(`/api/salud/prospecto/${ajeno}?motivo=mi%20clase`)).estado, 404);
  } finally {
    await api.cerrar();
  }
});

test("API: no-fuga entre organizaciones — el administrador de otra organización no lee ni escribe la ficha", async () => {
  const id = await sembrarProspecto();
  const otra = await sembrarOrganizacion(prisma, "FichaAjena");
  const adminOtra = await sembrarUsuario(prisma, otra.organizacionId, { rol: "administrador" });
  const api = levantarApi(prisma, { sensibles: { cifrador } });
  try {
    const cA = api.cliente();
    await cA.login(org.slug, admin.correo, admin.contrasena);
    await cA.pedir("PUT", `/api/salud/prospecto/${id}`, { motivo: "alta", alergias: "reservado" });
    const cB = api.cliente();
    await cB.login(otra.slug, adminOtra.correo, adminOtra.contrasena);
    assert.equal((await cB.get(`/api/salud/prospecto/${id}?motivo=ver`)).estado, 404);
    assert.equal((await cB.pedir("PUT", `/api/salud/prospecto/${id}`, { motivo: "robo", alergias: "otra" })).estado, 404);
    const f = await leerSensible(db(), actor(admin), { sujetoTipo: "prospecto", sujetoId: id, motivo: "verifico" }, opciones);
    assert.equal(f.campos.alergias?.revelar(), "reservado");
  } finally {
    await api.cerrar();
  }
});
