// V13-fix EV-36: la búsqueda por nombre de familias y alumnos revisa a lo más `topeDeBusquedaPorNombre` filas (20 000 por omisión). Más allá truncaba SIN AVISAR; ahora la respuesta lo dice
// (`paginacion.busqueda_incompleta`) y la pantalla pide afinar la búsqueda. Aquí el tope se baja a 4 para probarlo con pocas filas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { idsPorNombre } from "../api/rutas/familias.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let admin: ClienteApi;
const TOPE = 4;
interface Lista { datos: { id: string; nombre: string }[]; paginacion: { total: number; busqueda_incompleta?: boolean } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => new Date("2026-10-20T18:00:00Z"), sensibles: { cifrador: crearCifrador(randomBytes(32)) }, topeDeBusquedaPorNombre: TOPE });
  const org = await sembrarOrganizacion(prisma, "Búsqueda con tope");
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  admin = api.cliente();
  assert.equal((await admin.login(org.slug, u.correo, u.contrasena)).estado, 201);
  // Seis alumnos, cada uno con su familia; los apellidos ordenan A..F, así que «Zapata» (el último) queda FUERA de las primeras cuatro filas.
  for (const [i, apellido] of ["Aguirre", "Barrera", "Castro", "Duran", "Escobar", "Zapata"].entries()) {
    const r = await admin.post("/api/alumnos", { nombre: `Niño${i}`, apellidos: apellido, fecha_nacimiento: "2018-05-04", sucursal_id: org.sucursales[0]!.id, tutores: [{ tutor: { nombre: `Mamá${i}`, apellidos: apellido, telefono: `+52551234${String(1000 + i)}` }, parentesco: "madre" }] });
    assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  }
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("EV-36: idsPorNombre pide tope + 1 filas y dice si hay más de las que revisó", async () => {
  const filas = [1, 2, 3, 4, 5].map((n) => ({ id: String(n), nombre: `Ana ${n}` }));
  const pedidas: number[] = [];
  const traer = async (tomar: number) => (pedidas.push(tomar), filas.slice(0, tomar));
  const r = await idsPorNombre(traer, (f) => f.nombre, "ana", 3);
  assert.deepEqual(pedidas, [4]);
  assert.deepEqual(r, { ids: ["1", "2", "3"], incompleta: true });
  const justo = await idsPorNombre(async (t) => filas.slice(0, Math.min(t, 3)), (f) => f.nombre, "ana", 3);
  assert.deepEqual(justo, { ids: ["1", "2", "3"], incompleta: false }, "con exactamente el tope no hay más");
});

test("EV-36: por nombre, con 6 familias y un tope de 4, la respuesta se marca incompleta aunque el nombre sea de una sola; sin buscar por nombre no aplica", async () => {
  const tutores = await admin.get<Lista>("/api/tutores?nombre=Aguirre");
  assert.equal(tutores.estado, 200);
  assert.equal(tutores.cuerpo.paginacion.busqueda_incompleta, true, "6 familias visibles y se revisan 4");
  const sinNombre = await admin.get<Lista>("/api/tutores?limite=100");
  assert.equal(sinNombre.cuerpo.paginacion.busqueda_incompleta, undefined, "sin buscar por nombre no aplica");
  assert.equal(sinNombre.cuerpo.paginacion.total, 6);
});

test("EV-36: con más filas que el tope, tutores y alumnos avisan que la búsqueda quedó incompleta; el que cae después del tope no sale, y el aviso es la forma de saberlo", async () => {
  for (const ruta of ["/api/tutores", "/api/alumnos"]) {
    const zapata = await admin.get<Lista>(`${ruta}?nombre=Zapata`);
    assert.equal(zapata.estado, 200, ruta);
    assert.deepEqual(zapata.cuerpo.datos, [], `${ruta}: «Zapata» quedó fuera de las filas revisadas`);
    assert.equal(zapata.cuerpo.paginacion.busqueda_incompleta, true, `${ruta}: y la respuesta lo dice`);
    // Afinando con otros filtros (el teléfono, que no pasa por el tope) se encuentra.
    const aguirre = await admin.get<Lista>(`${ruta}?nombre=Aguirre`);
    assert.equal(aguirre.cuerpo.datos.length, 1, ruta);
  }
  const porTelefono = await admin.get<Lista>("/api/tutores?telefono=%2B525512341005");
  assert.equal(porTelefono.cuerpo.datos.length, 1);
  assert.equal(porTelefono.cuerpo.paginacion.busqueda_incompleta, undefined);
});
