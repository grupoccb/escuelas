// V5: las etapas del embudo desde Administración — renombrar, ajustar los días de aviso, ordenar, agregar las propias y quitarlas. Postgres real, la app real. Lo que no se rompe: el sistema busca
// cada etapa por su papel (`tipo_sistema`), así que las de sistema no se borran ni cambian de orden entre sí, las de cierre van al final y una etapa con leads no se quita. Solo el administrador
// escribe; cero fuga entre organizaciones; cada cambio queda en el registro; el bot sigue metiendo a los leads nuevos en «nuevo» aunque la escuela la haya renombrado.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance, altaConAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { etapaDeSistema } from "../embudo/etapas.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let adminAjeno: ClienteApi;
const otros = {} as Record<"asesor" | "recepcion" | "maestro", ClienteApi>;

interface Err { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Etapa { id: string; nombre: string; orden: number; tipo_sistema: string | null; es_ganado: boolean; es_perdido: boolean; dias_alerta_sin_movimiento: number | null }

async function organizacionConEmbudo(nombre: string) {
  const o = await sembrarOrganizacion(prisma, nombre);
  const etapas = await sembrarEmbudo(prisma, o);
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
  return { o, etapas, c };
}
const nombres = async (c: ClienteApi) => (await c.get<{ datos: Etapa[] }>("/api/etapas")).cuerpo.datos.map((e) => e.nombre);
const etapasDe = async (c: ClienteApi) => (await c.get<{ datos: Etapa[] }>("/api/etapas")).cuerpo.datos;
const detalle = (r: { cuerpo: unknown }): string => JSON.stringify((r.cuerpo as Err).error);

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "V5 etapas");
  await sembrarEmbudo(prisma, org);
  ajena = await sembrarOrganizacion(prisma, "V5 etapas ajena");
  await sembrarEmbudo(prisma, ajena);
  const entrar = async (o: OrganizacionDePrueba, rol: "administrador" | "asesor" | "maestro" | "recepcion") => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales: rol === "asesor" || rol === "recepcion" ? [o.sucursales[0]!.id] : [] });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar(org, "administrador");
  adminAjeno = await entrar(ajena, "administrador");
  for (const rol of ["asesor", "recepcion", "maestro"] as const) otros[rol] = await entrar(org, rol);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("solo el administrador agrega, renombra, ordena y quita; los demás roles leen las etapas pero no las cambian; sin sesión, 401", async () => {
  const todas = await etapasDe(admin);
  const propia = todas[0]!;
  for (const rol of ["asesor", "recepcion", "maestro"] as const) {
    assert.equal((await otros[rol].post("/api/etapas", { nombre: "X" })).estado, 403, rol);
    assert.equal((await otros[rol].patch(`/api/etapas/${propia.id}`, { nombre: "X" })).estado, 403, rol);
    assert.equal((await otros[rol].put("/api/etapas/orden", { ids: todas.map((e) => e.id) })).estado, 403, rol);
    assert.equal((await otros[rol].delete(`/api/etapas/${propia.id}`)).estado, 403, rol);
  }
  assert.equal((await otros.asesor.get("/api/etapas")).estado, 200, "el asesor sí lee las etapas (su embudo)");
  assert.equal((await api.cliente().post("/api/etapas", { nombre: "X" })).estado, 401);
});

test("una etapa de sistema se renombra y ajusta sus días de aviso; no cambia de papel; las de cierre no llevan aviso; el nombre no se repite", async () => {
  const { etapas, c } = await organizacionConEmbudo("V5 etapas renombrar");
  const r = await c.patch<Etapa>(`/api/etapas/${etapas.contactado}`, { nombre: "Ya hablamos", dias_alerta_sin_movimiento: 5 });
  assert.equal(r.estado, 200, detalle(r));
  assert.deepEqual([r.cuerpo.nombre, r.cuerpo.dias_alerta_sin_movimiento, r.cuerpo.tipo_sistema], ["Ya hablamos", 5, "contactado"]);
  assert.equal((await c.patch(`/api/etapas/${etapas.contactado}`, { dias_alerta_sin_movimiento: null })).estado, 200, "sin aviso");
  for (const malo of [0, 366, 1.5, "3"]) assert.equal((await c.patch(`/api/etapas/${etapas.contactado}`, { dias_alerta_sin_movimiento: malo })).estado, 400, String(malo));
  assert.equal((await c.patch(`/api/etapas/${etapas.contactado}`, { tipo_sistema: "perdido" })).estado, 400, "el papel no se cambia");
  assert.equal((await c.patch(`/api/etapas/${etapas.contactado}`, { orden: 1 })).estado, 400, "el orden va por su ruta");
  assert.equal((await c.patch(`/api/etapas/${etapas.contactado}`, { nombre: "   " })).estado, 400);
  assert.equal((await c.patch(`/api/etapas/${etapas.contactado}`, {})).estado, 400);
  const repetido = await c.patch<Err>(`/api/etapas/${etapas.contactado}`, { nombre: "etapa e" });
  assert.equal(repetido.estado, 409, detalle(repetido));
  assert.match(repetido.cuerpo.error.mensaje, /Ya hay una etapa con ese nombre\. Elige otro/);
  const cierre = await c.patch<Err>(`/api/etapas/${etapas.inscrito}`, { dias_alerta_sin_movimiento: 3 });
  assert.equal(cierre.estado, 400);
  assert.match(JSON.stringify(cierre.cuerpo.error.detalles), /no tienen alerta/);
  assert.equal((await c.patch(`/api/etapas/${etapas.inscrito}`, { nombre: "Ya inscrita" })).estado, 200, "el nombre de una de cierre sí");
  // El registro de cambios.
  const reg = await prisma.registro_cambio.findFirst({ where: { entidad_tipo: "etapa_pipeline", entidad_id: etapas.contactado }, orderBy: { creado_en: "asc" } });
  assert.deepEqual([(reg?.antes as Record<string, unknown>)["nombre"], (reg?.despues as Record<string, unknown>)["nombre"]], ["Etapa B", "Ya hablamos"]);
});

test("el sistema sigue encontrando cada etapa por su papel aunque la escuela la renombre (nada busca por nombre)", async () => {
  const { o, etapas, c } = await organizacionConEmbudo("V5 etapas por papel");
  await c.patch(`/api/etapas/${etapas.nuevo}`, { nombre: "Recién llegados" });
  const db = conAlcance(prisma, o.organizacionId);
  const nuevo = await etapaDeSistema(db, "nuevo");
  assert.deepEqual([nuevo?.id, nuevo?.nombre], [etapas.nuevo, "Recién llegados"]);
  const inscrito = await etapaDeSistema(db, "inscrito");
  assert.equal(inscrito?.id, etapas.inscrito);
});

test("agregar una etapa propia: queda justo antes de las de cierre, con sus días de aviso; el orden de las demás se recorre", async () => {
  const { c, etapas } = await organizacionConEmbudo("V5 etapas agregar");
  const r = await c.post<Etapa>("/api/etapas", { nombre: "Visita a la sede", dias_alerta_sin_movimiento: 4 });
  assert.equal(r.estado, 201, detalle(r));
  assert.deepEqual([r.cuerpo.tipo_sistema, r.cuerpo.es_ganado, r.cuerpo.es_perdido, r.cuerpo.dias_alerta_sin_movimiento, r.cuerpo.orden], [null, false, false, 4, 6]);
  const l = await etapasDe(c);
  assert.deepEqual(l.map((e) => e.nombre), ["Primera", "Etapa B", "Etapa C", "Etapa D", "Etapa E", "Visita a la sede", "Etapa F", "Etapa G"]);
  assert.deepEqual(l.map((e) => e.orden), [1, 2, 3, 4, 5, 6, 7, 8], "órdenes consecutivos");
  assert.equal(l.find((e) => e.id === etapas.inscrito)!.es_ganado, true);
  // Sin días: sin aviso.
  const sin = await c.post<Etapa>("/api/etapas", { nombre: "Otra" });
  assert.equal(sin.cuerpo.dias_alerta_sin_movimiento, null);
  assert.equal((await c.post("/api/etapas", { nombre: "visita a la sede" })).estado, 409, "el nombre no se repite (sin importar mayúsculas)");
  assert.equal((await c.post("/api/etapas", { nombre: "Visita a la sede" })).estado, 409);
  for (const malo of [{ nombre: "" }, { nombre: "x".repeat(61) }, { nombre: "Ok", dias_alerta_sin_movimiento: 0 }, { nombre: "Ok", tipo_sistema: "nuevo" }, { nombre: "Ok", es_ganado: true }]) {
    assert.equal((await c.post("/api/etapas", malo)).estado, 400, JSON.stringify(malo));
  }
  const reg = await prisma.registro_cambio.findFirst({ where: { entidad_tipo: "etapa_pipeline", entidad_id: r.cuerpo.id, accion: "crear" } });
  assert.equal((reg?.despues as Record<string, unknown>)["nombre"], "Visita a la sede");
});

test("ordenar: las propias se mueven entre las de sistema; las de sistema conservan su orden entre sí; las de cierre van al final; hay que mandar todas", async () => {
  const { c, etapas } = await organizacionConEmbudo("V5 etapas ordenar");
  const a = (await c.post<Etapa>("/api/etapas", { nombre: "Propia A" })).cuerpo;
  const b = (await c.post<Etapa>("/api/etapas", { nombre: "Propia B" })).cuerpo;
  const ids = async () => (await etapasDe(c)).map((e) => e.id);
  const base = await ids();
  assert.deepEqual(base.slice(-4), [a.id, b.id, etapas.inscrito, etapas.perdido]);
  // Mover «Propia B» entre «Contactado» y «Clase muestra agendada».
  const orden = [etapas.nuevo, etapas.contactado, b.id, etapas.muestra_agendada, etapas.muestra_asistida, etapas.negociacion, a.id, etapas.inscrito, etapas.perdido];
  const r = await c.put<{ datos: Etapa[] }>("/api/etapas/orden", { ids: orden });
  assert.equal(r.estado, 200, detalle(r));
  assert.deepEqual(r.cuerpo.datos.map((e) => e.id), orden);
  assert.deepEqual(r.cuerpo.datos.map((e) => e.orden), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(await ids(), orden, "persistido");
  // Reglas.
  const cambiaSistema = await c.put<Err>("/api/etapas/orden", { ids: [etapas.contactado, etapas.nuevo, ...orden.slice(2)] });
  assert.equal(cambiaSistema.estado, 409);
  assert.match(cambiaSistema.cuerpo.error.mensaje, /no cambian de orden entre sí\. Mueve solo las tuyas/);
  const despuesDeCierre = await c.put<Err>("/api/etapas/orden", { ids: [...orden.slice(0, 6), etapas.inscrito, a.id, etapas.perdido] });
  assert.equal(despuesDeCierre.estado, 409);
  assert.match(despuesDeCierre.cuerpo.error.mensaje, /van siempre al final/);
  assert.equal((await c.put("/api/etapas/orden", { ids: orden.slice(1) })).estado, 400, "faltan etapas");
  assert.equal((await c.put("/api/etapas/orden", { ids: [...orden, orden[0]] })).estado, 400, "una repetida");
  assert.equal((await c.put("/api/etapas/orden", { ids: [...orden.slice(1), "00000000-0000-4000-8000-000000000999"] })).estado, 400, "una que no existe");
  assert.equal((await c.put("/api/etapas/orden", { ids: "no" })).estado, 400);
  assert.deepEqual(await ids(), orden, "los rechazos no movieron nada");
  // El lead solo avanza por orden: el embudo respeta el orden nuevo (la propia B está entre contactado y muestra agendada).
  const l = await etapasDe(c);
  assert.ok(l.find((e) => e.id === b.id)!.orden > l.find((e) => e.id === etapas.contactado)!.orden && l.find((e) => e.id === b.id)!.orden < l.find((e) => e.id === etapas.muestra_agendada)!.orden);
});

test("quitar: solo una etapa propia y sin leads; una de sistema o de cierre no; una con leads dice cuántos y qué hacer; es baja lógica", async () => {
  const { o, c, etapas } = await organizacionConEmbudo("V5 etapas quitar");
  const propia = (await c.post<Etapa>("/api/etapas", { nombre: "Para quitar" })).cuerpo;
  const conLeads = (await c.post<Etapa>("/api/etapas", { nombre: "Con leads" })).cuerpo;
  const db = conAlcance(prisma, o.organizacionId);
  const lead = (telefono: string) => db.lead.create({ data: altaConAlcance({ vertical_interes_id: o.verticalId, sucursal_interes_id: o.sucursales[0]!.id, etapa_id: conLeads.id, telefono }) });
  await lead("+5255111111111");
  await lead("+5255111111112");
  const sistema = await c.delete<Err>(`/api/etapas/${etapas.contactado}`);
  assert.equal(sistema.estado, 409);
  assert.match(sistema.cuerpo.error.mensaje, /la usa el sistema.*Puedes cambiarle el nombre/);
  assert.equal((await c.delete(`/api/etapas/${etapas.inscrito}`)).estado, 409, "de cierre");
  const con = await c.delete<Err>(`/api/etapas/${conLeads.id}`);
  assert.equal(con.estado, 409);
  assert.match(con.cuerpo.error.mensaje, /Hay 2 leads en esta etapa\. Muévelos a otra etapa antes de quitarla/);
  assert.equal((await c.delete(`/api/etapas/${propia.id}`)).estado, 204);
  assert.equal((await c.delete(`/api/etapas/${propia.id}`)).estado, 404, "ya no existe");
  assert.ok(!(await nombres(c)).includes("Para quitar"));
  assert.ok((await prisma.etapa_pipeline.findFirst({ where: { id: propia.id } }))?.eliminado_en, "baja lógica (invariante 3)");
  // Moviendo los leads a otra etapa, ya se puede.
  await db.lead.updateMany({ where: { etapa_id: conLeads.id }, data: { etapa_id: etapas.nuevo } });
  assert.equal((await c.delete(`/api/etapas/${conLeads.id}`)).estado, 204);
  // El nombre de una etapa quitada se puede volver a usar.
  assert.equal((await c.post("/api/etapas", { nombre: "Para quitar" })).estado, 201);
});

test("no hay fuga entre organizaciones: una etapa ajena no se ve, no se cambia, no se mueve de orden ni se quita (404)", async () => {
  const ajenas = await etapasDe(adminAjeno);
  const mias = await etapasDe(admin);
  assert.equal(new Set([...mias, ...ajenas].map((e) => e.id)).size, mias.length + ajenas.length);
  const suya = ajenas[0]!;
  assert.equal((await admin.patch(`/api/etapas/${suya.id}`, { nombre: "Robada" })).estado, 404);
  assert.equal((await admin.delete(`/api/etapas/${suya.id}`)).estado, 404);
  // Un orden con una etapa ajena se rechaza y no mueve nada.
  assert.equal((await admin.put("/api/etapas/orden", { ids: [...mias.slice(1).map((e) => e.id), suya.id] })).estado, 400);
  assert.deepEqual((await etapasDe(adminAjeno)).map((e) => e.nombre), ajenas.map((e) => e.nombre));
  // Agregar en la mía no aparece en la otra.
  await admin.post("/api/etapas", { nombre: "Solo mía" });
  assert.ok(!(await nombres(adminAjeno)).includes("Solo mía"));
});

test("carrera: dos administradores agregan etapas a la vez y los órdenes quedan consecutivos y sin repetirse", async () => {
  const { o, c } = await organizacionConEmbudo("V5 etapas carrera");
  const u2 = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c2 = api.cliente();
  await c2.login(o.slug, u2.correo, u2.contrasena);
  const rs = await Promise.all([c.post("/api/etapas", { nombre: "Carrera 1" }), c2.post("/api/etapas", { nombre: "Carrera 2" }), c.post("/api/etapas", { nombre: "Carrera 3" })]);
  assert.deepEqual(rs.map((r) => r.estado), [201, 201, 201]);
  const l = await etapasDe(c);
  assert.deepEqual(l.map((e) => e.orden), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(l.at(-2)!.tipo_sistema, "inscrito");
  assert.equal(l.at(-1)!.tipo_sistema, "perdido");
});

test("EFECTO días de aviso: cambiar los días de una etapa cambia al instante qué leads salen como estancados; una etapa propia con aviso también", async () => {
  const { o, c, etapas } = await organizacionConEmbudo("V5 etapas estancados");
  const db = conAlcance(prisma, o.organizacionId);
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
  const nuevo = await db.lead.create({ data: altaConAlcance({ vertical_interes_id: o.verticalId, sucursal_interes_id: o.sucursales[0]!.id, etapa_id: etapas.contactado, telefono: "+5255222222221", ultima_interaccion_en: hace(4) }) });
  const ids = async () => (await c.get<{ datos: { id: string }[] }>("/api/leads/estancados")).cuerpo.datos.map((x) => x.id);
  assert.deepEqual(await ids(), [], "sin umbral en ninguna etapa, nada está estancado");
  await c.patch(`/api/etapas/${etapas.contactado}`, { dias_alerta_sin_movimiento: 3 });
  assert.deepEqual(await ids(), [nuevo.id], "4 días sin movimiento con aviso a los 3");
  await c.patch(`/api/etapas/${etapas.contactado}`, { dias_alerta_sin_movimiento: 10 });
  assert.deepEqual(await ids(), [], "con 10 ya no");
  await c.patch(`/api/etapas/${etapas.contactado}`, { dias_alerta_sin_movimiento: null });
  const propia = (await c.post<Etapa>("/api/etapas", { nombre: "Visita", dias_alerta_sin_movimiento: 2 })).cuerpo;
  const enPropia = await db.lead.create({ data: altaConAlcance({ vertical_interes_id: o.verticalId, sucursal_interes_id: o.sucursales[0]!.id, etapa_id: propia.id, telefono: "+5255222222222", ultima_interaccion_en: hace(3) }) });
  assert.deepEqual(await ids(), [enPropia.id]);
});

// V13-fix EV-24: quitar una etapa y mover un lead hacia ella a la vez. Contar los leads y dar de baja la etapa no estaba protegido contra un movimiento que llegaba en medio: el lead quedaba en
// una etapa dada de baja (en 54 de 60 vueltas de la auditoría). Ahora cada vuelta tiene que terminar bien: o la etapa se quitó y el lead sigue donde estaba, o el lead se movió y la etapa
// sigue viva (409 «hay leads en esta etapa»).
test("EV-24 carrera: DELETE /etapas/:id contra PATCH /leads/:id/etapa hacia esa etapa, 60 vueltas, 0 leads en una etapa dada de baja", async () => {
  const { o, etapas, c } = await organizacionConEmbudo("Carrera quitar etapa");
  const asesor = await sembrarUsuario(prisma, o.organizacionId, { rol: "asesor", sucursales: o.sucursales.map((s) => s.id) });
  const cAsesor = api.cliente();
  assert.equal((await cAsesor.login(o.slug, asesor.correo, asesor.contrasena)).estado, 201);
  const db = conAlcance(prisma, o.organizacionId);
  let quitadas = 0;
  let movidos = 0;
  const malas: string[] = [];
  for (let i = 0; i < 60; i++) {
    const nueva = await c.post<Etapa & Err>("/api/etapas", { nombre: `Propia ${i}` });
    assert.equal(nueva.estado, 201, JSON.stringify(nueva.cuerpo));
    const f = await sembrarFamilia(prisma, o, { sucursalId: o.sucursales[0]!.id, etapaId: etapas["nuevo"] });
    const [borrar, mover] = await Promise.all([c.delete<Err>(`/api/etapas/${nueva.cuerpo.id}`), cAsesor.patch<Err>(`/api/leads/${f.leadId}/etapa`, { etapa_id: nueva.cuerpo.id })]);
    const etapa = await prisma.etapa_pipeline.findFirstOrThrow({ where: { id: nueva.cuerpo.id } });
    const lead = await db.lead.findFirstOrThrow({ where: { id: f.leadId }, select: { etapa_id: true } });
    const leadEnLaEtapa = lead.etapa_id === nueva.cuerpo.id;
    if (leadEnLaEtapa && etapa.eliminado_en !== null) malas.push(`vuelta ${i}: lead en una etapa dada de baja (delete=${borrar.estado}, patch=${mover.estado})`);
    // Una de las dos gana, la otra recibe el rechazo que corresponde (nunca un 500).
    assert.ok([204, 409, 404].includes(borrar.estado), `delete ${borrar.estado}`);
    assert.ok([200, 400].includes(mover.estado), `patch ${mover.estado} ${JSON.stringify(mover.cuerpo)}`);
    if (borrar.estado === 204) {
      quitadas++;
      assert.ok(!leadEnLaEtapa && mover.estado === 400, `vuelta ${i}: se quitó la etapa pero el movimiento dijo ${mover.estado}`);
    } else {
      movidos++;
      assert.equal(mover.estado, 200);
      assert.ok(leadEnLaEtapa && etapa.eliminado_en === null);
    }
  }
  assert.deepEqual(malas, []);
  assert.equal(quitadas + movidos, 60);
});
