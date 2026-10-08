// B5: usuario ↔ agente de Chatwoot y «qué asesor tiene cada conversación». Postgres real, la app
// real, el directorio falso y los payloads REALES de asignación de A3 (payload-*.json).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { conAlcance } from "../datos/alcance.ts";
import { registrarDesasignacionDeConversacion, registrarTomaDeConversacion } from "../captacion/toma.ts";
import { DirectorioAgentesFalso, interpretarDesasignacion, interpretarTomaDeConversacion } from "../mensajeria/index.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ClienteApi, type UsuarioDePrueba } from "../testutil/api.ts";

let prisma: PrismaPruebas;
const fixture = (nombre: string): unknown => JSON.parse(readFileSync(new URL(`../mensajeria/chatwoot/payload-${nombre}.json`, import.meta.url), "utf8"));

before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

/** Una organización con admin, dos asesores y un directorio falso con el agente 2 de los payloads reales. */
async function escenario() {
  const org = await sembrarOrganizacion(prisma, "Chatwoot");
  const directorio = new DirectorioAgentesFalso();
  const admin = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const asesor = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor", correo: `asesor-${randomInt(1e6)}@demo.test`, sucursales: [org.sucursales[0]!.id] });
  const otro = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor", correo: `otro-${randomInt(1e6)}@demo.test`, sucursales: [org.sucursales[1]!.id] });
  directorio.agregar(org.chatwootAccountId, { id: 2, correo: asesor.correo, nombre: "Asesor demo" });
  directorio.agregar(org.chatwootAccountId, { id: 3, correo: otro.correo, nombre: "Otro asesor" });
  directorio.agregar(org.chatwootAccountId, { id: 4, correo: "sin-usuario@demo.test", nombre: "Sin usuario" });
  const api = levantarApi(prisma, { directorio });
  const entrar = async (u: UsuarioDePrueba): Promise<ClienteApi> => {
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  return { org, directorio, admin, asesor, otro, api, entrar };
}

/** Una conversación del backend para la organización, con su lead (en la sucursal dada). */
async function conversacion(org: OrganizacionDePrueba, sucursalId: string | null): Promise<{ id: string; chatwootId: number; leadId: string }> {
  const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: sucursalId, etapa_id: org.etapaInicialId, nombre_contacto: "Contacto" } });
  const chatwootId = randomInt(1, 2_000_000_000);
  const c = await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: lead.id, chatwoot_conversacion_id: chatwootId } });
  return { id: c.id, chatwootId, leadId: lead.id };
}

/** El payload real de asignación, apuntando a nuestra bandeja y conversación. */
function asignacion(org: OrganizacionDePrueba, chatwootId: number, agenteId = 2) {
  const real = interpretarTomaDeConversacion(fixture("conversacion-asignada"));
  assert.ok(real);
  return { ...real, chatwootAccountId: org.chatwootAccountId, chatwootInboxId: org.chatwootInboxId, chatwootConversacionId: chatwootId, agenteId };
}
function desasignacion(org: OrganizacionDePrueba, chatwootId: number) {
  const real = interpretarDesasignacion(fixture("conversacion-desasignada"));
  assert.ok(real);
  return { ...real, chatwootAccountId: org.chatwootAccountId, chatwootInboxId: org.chatwootInboxId, chatwootConversacionId: chatwootId };
}

// ── Vincular ────────────────────────────────────────────────────────────────────────────

test("vincular por correo: encuentra al agente por el correo del usuario, lo guarda y deja registro", async () => {
  const e = await escenario();
  try {
    const c = await e.entrar(e.admin);
    const r = await c.post<{ id: string; chatwoot_agent_id: number }>(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`);
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.chatwoot_agent_id, 2);
    assert.equal((await prisma.usuario.findFirstOrThrow({ where: { id: e.asesor.id } })).chatwoot_agent_id, 2);
    const reg = await prisma.registro_cambio.findMany({ where: { entidad_id: e.asesor.id, accion: "vincular_chatwoot" } });
    assert.equal(reg.length, 1);
    assert.deepEqual(reg[0]!.despues, { chatwoot_agent_id: 2 });
    assert.equal(reg[0]!.usuario_id, e.admin.id);
    // Vincular otra vez al mismo agente es idempotente.
    assert.equal((await c.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`)).estado, 200);
  } finally {
    await e.api.cerrar();
  }
});

test("vincular con agente_id explícito; un id que no existe en Chatwoot → 400; sin agente con ese correo → 404", async () => {
  const e = await escenario();
  try {
    const c = await e.entrar(e.admin);
    const sinCorreo = await sembrarUsuario(prisma, e.org.organizacionId, { rol: "asesor", correo: `sin-agente-${randomInt(1e6)}@demo.test` });
    assert.equal((await c.post(`/api/usuarios/${sinCorreo.id}/vincular-chatwoot`)).estado, 404);
    assert.equal((await c.post(`/api/usuarios/${sinCorreo.id}/vincular-chatwoot`, { agente_id: 999 })).estado, 400);
    const r = await c.post<{ chatwoot_agent_id: number }>(`/api/usuarios/${sinCorreo.id}/vincular-chatwoot`, { agente_id: 4 });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.chatwoot_agent_id, 4);
    assert.equal((await c.post(`/api/usuarios/${sinCorreo.id}/vincular-chatwoot`, { agente_id: "dos" })).estado, 400);
    assert.equal((await c.post(`/api/usuarios/${sinCorreo.id}/vincular-chatwoot`, { agente: 4 })).estado, 400);
  } finally {
    await e.api.cerrar();
  }
});

test("un agente solo puede ser de un usuario: el segundo recibe 409; dos vínculos simultáneos al mismo agente → uno gana", async () => {
  const e = await escenario();
  try {
    const c = await e.entrar(e.admin);
    assert.equal((await c.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`)).estado, 200);
    assert.equal((await c.post(`/api/usuarios/${e.otro.id}/vincular-chatwoot`, { agente_id: 2 })).estado, 409);

    const a = await sembrarUsuario(prisma, e.org.organizacionId, { rol: "asesor" });
    const b = await sembrarUsuario(prisma, e.org.organizacionId, { rol: "asesor" });
    const [x, y] = await Promise.all([c.post(`/api/usuarios/${a.id}/vincular-chatwoot`, { agente_id: 4 }), (await e.entrar(e.admin)).post(`/api/usuarios/${b.id}/vincular-chatwoot`, { agente_id: 4 })]);
    assert.deepEqual([x.estado, y.estado].sort(), [200, 409]);
    assert.equal(await prisma.usuario.count({ where: { organizacion_id: e.org.organizacionId, chatwoot_agent_id: 4 } }), 1);
  } finally {
    await e.api.cerrar();
  }
});

test("desvincular (EB-23): suelta el agente y las asignaciones, deja registro, es idempotente y deja reasignar el agente; desactivar a alguien también lo suelta", async () => {
  const e = await escenario();
  try {
    const c = await e.entrar(e.admin);
    assert.equal((await c.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`)).estado, 200);
    const conv = await conversacion(e.org, e.org.sucursales[0]!.id);
    await registrarTomaDeConversacion({ prisma }, asignacion(e.org, conv.chatwootId));
    assert.equal((await prisma.conversacion.findFirstOrThrow({ where: { id: conv.id } })).asignada_a_usuario_id, e.asesor.id);

    const r = await c.delete<{ chatwoot_agent_id: number | null }>(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`);
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.chatwoot_agent_id, null);
    const despues = await prisma.conversacion.findFirstOrThrow({ where: { id: conv.id } });
    assert.equal(despues.asignada_a_usuario_id, null);
    assert.equal(despues.asignada_a_agente_chatwoot_id, 2, "Chatwoot sigue diciendo quién la tiene; solo se corta el vínculo con el usuario");
    const reg = await prisma.registro_cambio.findMany({ where: { entidad_id: e.asesor.id, accion: "desvincular_chatwoot" } });
    assert.equal(reg.length, 1);
    assert.deepEqual([reg[0]!.antes, reg[0]!.despues], [{ chatwoot_agent_id: 2 }, { chatwoot_agent_id: null }]);
    assert.equal((await c.delete(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`)).estado, 200, "idempotente");
    assert.equal(await prisma.registro_cambio.count({ where: { entidad_id: e.asesor.id, accion: "desvincular_chatwoot" } }), 1, "sin registro de lo que no cambió");
    // El agente queda libre para quien lo reemplace.
    assert.equal((await c.post(`/api/usuarios/${e.otro.id}/vincular-chatwoot`, { agente_id: 2 })).estado, 200);
    // Desactivar suelta el vínculo.
    assert.equal((await c.patch(`/api/usuarios/${e.otro.id}`, { activo: false })).estado, 200);
    assert.equal((await prisma.usuario.findFirstOrThrow({ where: { id: e.otro.id } })).chatwoot_agent_id, null);
    assert.equal((await c.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`, { agente_id: 2 })).estado, 200, "y el agente se puede reasignar");
    // Solo el administrador; un usuario ajeno → 404.
    assert.equal((await (await e.entrar(e.asesor)).delete(`/api/usuarios/${e.otro.id}/vincular-chatwoot`)).estado, 403);
    assert.equal((await c.delete(`/api/usuarios/${"00000000-0000-4000-8000-0000000000aa"}/vincular-chatwoot`)).estado, 404);
  } finally {
    await e.api.cerrar();
  }
});

test("vincular: solo el administrador; el directorio caído o sin configurar → 409; un usuario de otra organización → 404", async () => {
  const e = await escenario();
  try {
    const cAsesor = await e.entrar(e.asesor);
    assert.equal((await cAsesor.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`)).estado, 403);
    const c = await e.entrar(e.admin);
    e.directorio.falla = "Chatwoot caído";
    const caido = await c.post<{ error: { mensaje: string } }>(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`);
    assert.equal(caido.estado, 409);
    assert.ok(!caido.cuerpo.error.mensaje.includes("caído"), "no se filtra el detalle del adaptador");
    e.directorio.falla = undefined;

    const otra = await sembrarOrganizacion(prisma, "ChatwootAjena");
    const ajeno = await sembrarUsuario(prisma, otra.organizacionId, { rol: "asesor", correo: e.asesor.correo });
    assert.equal((await c.post(`/api/usuarios/${ajeno.id}/vincular-chatwoot`)).estado, 404);

    const sinDirectorio = levantarApi(prisma, {});
    try {
      const c2 = sinDirectorio.cliente();
      await c2.login(e.org.slug, e.admin.correo, e.admin.contrasena);
      assert.equal((await c2.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`)).estado, 409);
    } finally {
      await sinDirectorio.cerrar();
    }
  } finally {
    await e.api.cerrar();
  }
});

// ── Asignación de conversaciones (payloads reales de A3) ────────────────────────────────

test("el evento real de asignación guarda el agente y el usuario vinculado; la desasignación real los borra", async () => {
  const e = await escenario();
  try {
    const db = conAlcance(prisma, e.org.organizacionId);
    const c = await e.entrar(e.admin);
    await c.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`);
    const conv = await conversacion(e.org, e.org.sucursales[0]!.id);

    assert.equal(await registrarTomaDeConversacion({ prisma }, asignacion(e.org, conv.chatwootId)), "tomada");
    let fila = await db.conversacion.findFirstOrThrow({ where: { id: conv.id } });
    assert.equal(fila.asignada_a_agente_chatwoot_id, 2);
    assert.equal(fila.asignada_a_usuario_id, e.asesor.id);
    assert.equal(fila.estado, "en_atencion_humana");

    // Se reasigna al otro agente (la conversación ya está en manos de una persona: el estado no cambia, la asignación sí).
    await e.entrar(e.admin).then((cc) => cc.post(`/api/usuarios/${e.otro.id}/vincular-chatwoot`));
    assert.equal(await registrarTomaDeConversacion({ prisma }, asignacion(e.org, conv.chatwootId, 3)), "sin_cambio");
    fila = await db.conversacion.findFirstOrThrow({ where: { id: conv.id } });
    assert.equal(fila.asignada_a_usuario_id, e.otro.id);
    assert.equal(fila.asignada_a_agente_chatwoot_id, 3);

    assert.equal(await registrarDesasignacionDeConversacion({ prisma }, desasignacion(e.org, conv.chatwootId)), "desasignada");
    fila = await db.conversacion.findFirstOrThrow({ where: { id: conv.id } });
    assert.equal(fila.asignada_a_usuario_id, null);
    assert.equal(fila.asignada_a_agente_chatwoot_id, null);
    assert.equal(fila.estado, "en_atencion_humana", "desasignar no devuelve el bot");
    assert.equal(await registrarDesasignacionDeConversacion({ prisma }, { ...desasignacion(e.org, conv.chatwootId), chatwootConversacionId: 1 }), "conversacion_desconocida");
  } finally {
    await e.api.cerrar();
  }
});

test("un agente sin usuario vinculado deja solo el agente; al vincularlo después, las conversaciones ya asignadas se completan", async () => {
  const e = await escenario();
  try {
    const db = conAlcance(prisma, e.org.organizacionId);
    const conv = await conversacion(e.org, e.org.sucursales[0]!.id);
    await registrarTomaDeConversacion({ prisma }, asignacion(e.org, conv.chatwootId, 2));
    let fila = await db.conversacion.findFirstOrThrow({ where: { id: conv.id } });
    assert.equal(fila.asignada_a_agente_chatwoot_id, 2);
    assert.equal(fila.asignada_a_usuario_id, null, "todavía no hay a quién ligarla");

    const c = await e.entrar(e.admin);
    await c.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`);
    fila = await db.conversacion.findFirstOrThrow({ where: { id: conv.id } });
    assert.equal(fila.asignada_a_usuario_id, e.asesor.id);

    // Cambiar al usuario a otro agente le quita las conversaciones del agente anterior.
    await c.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`, { agente_id: 4 });
    fila = await db.conversacion.findFirstOrThrow({ where: { id: conv.id } });
    assert.equal(fila.asignada_a_usuario_id, null);
  } finally {
    await e.api.cerrar();
  }
});

test("el usuario de otra organización con el mismo id de agente de Chatwoot NO recibe la conversación (la organización sale de la bandeja)", async () => {
  const e = await escenario();
  try {
    const otra = await sembrarOrganizacion(prisma, "ChatwootOtra");
    const ajeno = await sembrarUsuario(prisma, otra.organizacionId, { rol: "asesor" });
    await prisma.usuario.update({ where: { id: ajeno.id }, data: { chatwoot_agent_id: 2 } });
    const conv = await conversacion(e.org, null);
    await registrarTomaDeConversacion({ prisma }, asignacion(e.org, conv.chatwootId, 2));
    const fila = await prisma.conversacion.findFirstOrThrow({ where: { id: conv.id } });
    assert.equal(fila.asignada_a_agente_chatwoot_id, 2);
    assert.equal(fila.asignada_a_usuario_id, null);
  } finally {
    await e.api.cerrar();
  }
});

test("la base rechaza ligar una conversación a un usuario de otra organización (FK compuesta)", async () => {
  const e = await escenario();
  try {
    const otra = await sembrarOrganizacion(prisma, "ChatwootFk");
    const ajeno = await sembrarUsuario(prisma, otra.organizacionId, { rol: "asesor" });
    const conv = await conversacion(e.org, null);
    await assert.rejects(prisma.conversacion.update({ where: { id: conv.id }, data: { asignada_a_usuario_id: ajeno.id } }), /foreign key|Foreign key/i);
  } finally {
    await e.api.cerrar();
  }
});

// ── GET /api/conversaciones ─────────────────────────────────────────────────────────────

test("GET /api/conversaciones?asignada_a=yo: solo las mías; `nadie` y un usuario concreto; alcance por sucursal; recepción y maestro no entran", async () => {
  const e = await escenario();
  try {
    const admin = await e.entrar(e.admin);
    await admin.post(`/api/usuarios/${e.asesor.id}/vincular-chatwoot`);
    await admin.post(`/api/usuarios/${e.otro.id}/vincular-chatwoot`);
    const mia = await conversacion(e.org, e.org.sucursales[0]!.id);
    const deOtro = await conversacion(e.org, e.org.sucursales[0]!.id);
    const sinAsesor = await conversacion(e.org, e.org.sucursales[0]!.id);
    const deLaOtraSucursal = await conversacion(e.org, e.org.sucursales[1]!.id);
    await registrarTomaDeConversacion({ prisma }, asignacion(e.org, mia.chatwootId, 2));
    await registrarTomaDeConversacion({ prisma }, asignacion(e.org, deOtro.chatwootId, 3));
    await registrarTomaDeConversacion({ prisma }, asignacion(e.org, deLaOtraSucursal.chatwootId, 2));

    const ids = (r: { cuerpo: unknown }) => (r.cuerpo as { datos: { id: string }[] }).datos.map((d) => d.id).sort();
    const cAsesor = await e.entrar(e.asesor);
    assert.deepEqual(ids(await cAsesor.get("/api/conversaciones?asignada_a=yo")), [mia.id], "las suyas, y no la de otra sucursal aunque sea suya");
    assert.deepEqual(ids(await admin.get("/api/conversaciones?asignada_a=yo")), [], "el administrador no tiene agente vinculado");
    assert.deepEqual(ids(await admin.get(`/api/conversaciones?asignada_a=${e.asesor.id}`)), [mia.id, deLaOtraSucursal.id].sort());
    assert.ok(ids(await admin.get("/api/conversaciones?asignada_a=nadie")).includes(sinAsesor.id));
    assert.ok(!ids(await admin.get("/api/conversaciones?asignada_a=nadie")).includes(mia.id));
    const todas = ids(await cAsesor.get("/api/conversaciones?limite=100"));
    assert.ok(todas.includes(mia.id) && todas.includes(sinAsesor.id) && todas.includes(deOtro.id) && !todas.includes(deLaOtraSucursal.id));
    assert.equal((await cAsesor.get("/api/conversaciones?asignada_a=otra-cosa")).estado, 400);
    assert.equal((await cAsesor.get("/api/conversaciones?estado=inventado")).estado, 400);

    const recepcion = await sembrarUsuario(prisma, e.org.organizacionId, { rol: "recepcion", sucursales: [e.org.sucursales[0]!.id] });
    const maestro = await sembrarUsuario(prisma, e.org.organizacionId, { rol: "maestro" });
    assert.equal((await (await e.entrar(recepcion)).get("/api/conversaciones")).estado, 403);
    assert.equal((await (await e.entrar(maestro)).get("/api/conversaciones")).estado, 403);
  } finally {
    await e.api.cerrar();
  }
});

test("no-fuga: las conversaciones de otra organización no aparecen aunque se pida su usuario", async () => {
  const e = await escenario();
  try {
    const otra = await sembrarOrganizacion(prisma, "ChatwootNoFuga");
    const ajeno = await sembrarUsuario(prisma, otra.organizacionId, { rol: "asesor" });
    const convAjena = await conversacion(otra, null);
    await prisma.conversacion.update({ where: { id: convAjena.id }, data: { asignada_a_usuario_id: ajeno.id } });
    const admin = await e.entrar(e.admin);
    const r = await admin.get<{ datos: { id: string }[] }>(`/api/conversaciones?asignada_a=${ajeno.id}&limite=100`);
    assert.deepEqual(r.cuerpo.datos, []);
    assert.ok(!(await admin.get<{ datos: { id: string }[] }>("/api/conversaciones?limite=100")).cuerpo.datos.some((d) => d.id === convAjena.id));
  } finally {
    await e.api.cerrar();
  }
});
