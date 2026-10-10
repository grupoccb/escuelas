// V10 / EK-25 (los menores de administración que la auditoría final K9 dejó pendientes). Cada prueba falla sin su arreglo:
//   · la zona horaria de una sucursal se guarda con la escritura oficial (america/mexico_city → America/Mexico_City);
//   · la lista de canales de WhatsApp está paginada;
//   · una plantilla que el aviso al maestro busca por su código no se da de baja.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { zonaCanonica } from "../catalogo/organizacion.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let admin: ClienteApi;

interface Err { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Administración V10");
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  admin = api.cliente();
  assert.equal((await admin.login(org.slug, u.correo, u.contrasena)).estado, 201);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("EK-25: zonaCanonica corrige solo las mayúsculas y nunca cambia una zona por otra", () => {
  assert.equal(zonaCanonica("america/mexico_city"), "America/Mexico_City");
  assert.equal(zonaCanonica("AMERICA/BOGOTA"), "America/Bogota");
  assert.equal(zonaCanonica("  Europe/Madrid "), "Europe/Madrid");
  assert.equal(zonaCanonica("UTC"), "UTC");
  assert.equal(zonaCanonica("America/Mexico_City"), "America/Mexico_City");
  for (const mala of ["CST", "Mexico", "America/NoExiste", "", "../etc/passwd"]) assert.equal(zonaCanonica(mala), null, mala);
});

test("EK-25: una sucursal con la zona escrita en minúsculas se guarda con la escritura oficial (alta y cambio); una zona que no existe sigue dando 400", async () => {
  const alta = await admin.post<{ id: string; zona_horaria: string } & Err>("/api/sucursales", { nombre: "Zona minúsculas", zona_horaria: "america/mexico_city" });
  assert.equal(alta.estado, 201, JSON.stringify(alta.cuerpo));
  assert.equal(alta.cuerpo.zona_horaria, "America/Mexico_City");
  assert.equal((await prisma.sucursal.findFirstOrThrow({ where: { id: alta.cuerpo.id } })).zona_horaria, "America/Mexico_City");
  const cambio = await admin.patch<{ zona_horaria: string }>(`/api/sucursales/${alta.cuerpo.id}`, { zona_horaria: "AMERICA/BOGOTA" });
  assert.equal(cambio.estado, 200);
  assert.equal(cambio.cuerpo.zona_horaria, "America/Bogota");
  assert.equal((await admin.patch(`/api/sucursales/${alta.cuerpo.id}`, { zona_horaria: "CST" })).estado, 400);
  assert.equal((await admin.post("/api/sucursales", { nombre: "Zona mala", zona_horaria: "Marte/Olimpo" })).estado, 400);
});

test("EK-25: GET /api/canales-whatsapp está paginado (25 por omisión, tope de 100) con un orden estable", async () => {
  const o = await sembrarOrganizacion(prisma, "Canales paginados");
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
  for (let i = 0; i < 4; i++) assert.equal((await c.post("/api/canales-whatsapp", { vertical_id: o.verticalId, nombre_publico: "Mismo nombre" })).estado, 201);
  const todos = (await c.get<{ datos: { id: string }[]; paginacion: { total: number; limite: number } }>("/api/canales-whatsapp")).cuerpo;
  assert.ok(todos.paginacion.total >= 5, "el canal de la siembra más los 4");
  assert.equal(todos.paginacion.limite, 25);
  const vistos = new Set<string>();
  for (const pagina of [1, 2, 3]) {
    const p = (await c.get<{ datos: { id: string }[] }>(`/api/canales-whatsapp?limite=2&pagina=${pagina}`)).cuerpo.datos;
    assert.ok(p.length <= 2);
    for (const x of p) {
      assert.ok(!vistos.has(x.id), "ninguna fila se repite entre páginas aunque el nombre sea el mismo");
      vistos.add(x.id);
    }
  }
  assert.equal(vistos.size, todos.paginacion.total, "y ninguna se pierde");
  assert.equal((await c.get<{ paginacion: { limite: number } }>("/api/canales-whatsapp?limite=5000")).cuerpo.paginacion.limite, 100, "tope de 100");
});

test("EK-25: las plantillas del aviso al maestro (que el sistema busca por su código) no se dan de baja; las demás sí", async () => {
  const propia = await prisma.plantilla_mensaje.create({ data: { organizacion_id: org.organizacionId, codigo: "aviso_maestro_agendada", content_sid: `HX${randomUUID().replaceAll("-", "").slice(0, 32)}`, categoria: "utility", clase_mensaje: "servicio", variables: [], cuerpo_referencia: "x", estado_aprobacion: "aprobada" } });
  const r = await admin.delete<Err>(`/api/plantillas/${propia.id}`);
  assert.equal(r.estado, 409, JSON.stringify(r.cuerpo));
  assert.match(r.cuerpo.error.mensaje, /aviso al maestro/);
  assert.equal((await prisma.plantilla_mensaje.findFirstOrThrow({ where: { id: propia.id } })).eliminado_en, null, "sigue viva");
  const otra = await prisma.plantilla_mensaje.create({ data: { organizacion_id: org.organizacionId, codigo: `otra_${randomUUID().slice(0, 8)}`, content_sid: `HX${randomUUID().replaceAll("-", "").slice(0, 32)}`, categoria: "utility", clase_mensaje: "servicio", variables: [], cuerpo_referencia: "x", estado_aprobacion: "aprobada" } });
  assert.equal((await admin.delete(`/api/plantillas/${otra.id}`)).estado, 204);
});
