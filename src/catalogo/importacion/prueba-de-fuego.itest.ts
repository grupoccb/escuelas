// V6: PRUEBA DE FUEGO DE LA CARGA (invariante 2). Una escuela que acaba de nacer (la plantilla de organización) y UNA disciplina que el código no conoce, cargada SOLO con
// archivos CSV —los que llenaría la escuela en Excel—, sin tocar una línea de código ni un seed. Después de cargarla, el sistema la trata como a cualquier otra: el cotizador
// responde para cada edad con sus programas, grupos, lugares y precios (incluida la versión nueva de un precio con su vigencia), el catálogo se ve y se edita por la API de
// administración y la landing de la disciplina abre. Este archivo no nombra ninguna disciplina ni sucursal real (`check:generico`): todo lo inventa la prueba.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { conAlcance } from "../../datos/alcance.ts";
import { sembrarUsuario, levantarApi, type ApiLevantada, type ClienteApi } from "../../testutil/api.ts";
import { archivosDeCarga, cuerpoDeCarga, type HojasDeEjemplo } from "../../testutil/catalogo-ejemplo.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../testutil/prisma-pruebas.ts";
import type { Informe } from "./datos.ts";

const SLUG = `csv-${randomBytes(4).toString("hex")}`;
let prisma: PrismaPruebas;
let api: ApiLevantada;
let admin: ClienteApi;
let orgId: string;

before(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 10);
  const sql = readFileSync(new URL("../../../prisma/seed/plantilla-organizacion.sql", import.meta.url), "utf8").replace("CAMBIAR-identificador-corto", SLUG).replace("CAMBIAR: nombre de la escuela", "Escuela de la carga por CSV");
  const c = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await c.connect();
  await c.query(sql);
  await c.end();
  orgId = (await prisma.organizacion.findFirstOrThrow({ where: { slug: SLUG } })).id;
  const u = await sembrarUsuario(prisma, orgId, { rol: "administrador" });
  api = levantarApi(prisma, { reloj: () => new Date("2026-10-15T18:00:00Z") });
  admin = api.cliente();
  assert.equal((await admin.login(SLUG, u.correo, u.contrasena)).estado, 201);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

/** Lo que la escuela entregaría: una disciplina inventada, dos sedes, dos edades y una subida de precio programada. */
const CATALOGO_NUEVO: Pick<HojasDeEjemplo, "disciplinas" | "sucursales" | "salones" | "instructores" | "programas" | "grupos" | "horarios" | "precios"> = {
  disciplinas: [["Robótica Creativa", "#1565C0"]],
  sucursales: [
    ["Sede Uno", "Avenida Ficticia 100, Ciudad Imaginaria", "Centro"],
    ["Sede Dos", "Calle Inventada 7, Ciudad Imaginaria", "Pacífico"],
  ],
  salones: [
    ["Sede Uno", "Taller A", "12"],
    ["Sede Uno", "Taller B", "8"],
    ["Sede Dos", "Taller A", "10"],
  ],
  instructores: [
    ["Mara Quintero", "+52 1 55 0000 1111", "mara@ejemplo.invalid", "Sede Uno"],
    ["Iván Soto", "(55) 0000-2222", "", "Sede Uno | Sede Dos"],
  ],
  programas: [
    ["Robótica Creativa", "Sede Uno", "Exploradores", "5", "8", "", "Inicial", "Primeros pasos con piezas y motores.", ""],
    ["Robótica Creativa", "Sede Uno", "Constructores", "9", "12", "", "Intermedio", "Proyectos con sensores.", ""],
    ["Robótica Creativa", "Sede Dos", "Exploradores", "5", "8", "", "Inicial", "", ""],
  ],
  grupos: [
    ["Sede Uno", "Exploradores", "Martes y jueves", "10", "Taller A", "Mara Quintero", "Sí"],
    ["Sede Uno", "Constructores", "Sábados", "8", "Taller B", "Iván Soto", ""],
    ["Sede Dos", "Exploradores", "Viernes", "9", "Taller A", "Iván Soto", ""],
  ],
  horarios: [
    ["Sede Uno", "Exploradores", "Martes y jueves", "martes", "16:00", "17:30"],
    ["Sede Uno", "Exploradores", "Martes y jueves", "jueves", "16:00", "17:30"],
    ["Sede Uno", "Constructores", "Sábados", "sábado", "10:00", "12:00"],
    ["Sede Dos", "Exploradores", "Viernes", "viernes", "17:00", "18:30"],
  ],
  precios: [
    ["Sede Uno", "Exploradores", "300", "700", "01/01/2026"],
    ["Sede Uno", "Exploradores", "300", "750", "01/01/2027"],
    ["Sede Uno", "Constructores", "300", "850", "01/01/2026"],
    ["Sede Dos", "Exploradores", "250", "650,50", "01/01/2026"],
  ],
};

interface Cotizacion {
  alternativas: boolean;
  programas: { nombre: string; sin_precio: boolean; precio: { costo_inscripcion: string; costo_mensualidad: string } | null; grupos: { nombre: string; lugares_disponibles: number; oferta: string; horario_texto: string }[] }[];
}

test("V6, prueba de fuego: una disciplina nueva cargada SOLO con CSV opera de punta a punta en el cotizador, sin tocar código", async () => {
  const db = conAlcance(prisma, orgId);
  assert.equal(await db.vertical.count({}), 0, "parte de cero");

  // 1. Simular, ver que está limpia y que no escribió nada; luego aplicar.
  const archivos = archivosDeCarga(CATALOGO_NUEVO);
  const simulada = await admin.post<Informe>("/api/catalogo/importacion", cuerpoDeCarga("simulacion", archivos));
  assert.equal(simulada.cuerpo.limpia, true, simulada.cuerpo.errores.map((e) => e.texto).join("\n"));
  assert.equal(await db.vertical.count({}), 0, "la simulación no escribió");
  const aplicada = await admin.post<Informe>("/api/catalogo/importacion", cuerpoDeCarga("aplicar", archivos));
  assert.equal(aplicada.cuerpo.aplicado, true);
  assert.deepEqual(aplicada.cuerpo.resumen.map((r) => [r.clave, r.creados]), [["disciplinas", 1], ["sucursales", 2], ["oferta", 2], ["salones", 3], ["instructores", 2], ["programas", 3], ["grupos", 3], ["horarios", 4], ["precios", 4]]);
  assert.deepEqual(aplicada.cuerpo.avisos, [], "ningún aviso: todo quedó con precio, grupos y teléfono");
  // Zona horaria con el nombre de la gente: «Pacífico» quedó como la zona del sistema (de ahí sale el horario de los mensajes).
  assert.equal((await db.sucursal.findFirstOrThrow({ where: { nombre: "Sede Dos" }, select: { zona_horaria: true } })).zona_horaria, "America/Mazatlan");

  // 2. El cotizador (módulo apagado hasta que la escuela lo encienda) responde para cada edad.
  const vertical = await db.vertical.findFirstOrThrow({ select: { id: true, slug: true } });
  const uno = await db.sucursal.findFirstOrThrow({ where: { nombre: "Sede Uno" }, select: { id: true } });
  const dos = await db.sucursal.findFirstOrThrow({ where: { nombre: "Sede Dos" }, select: { id: true } });
  const cotizar = (suc: string, edad: number, fecha?: string) => admin.get<Cotizacion>(`/api/cotizador?vertical_id=${vertical.id}&sucursal_id=${suc}&edad=${edad}${fecha ? `&fecha=${fecha}` : ""}`);
  assert.equal((await cotizar(uno.id, 6)).estado, 404, "con solo la captación encendida, el cotizador no responde");
  const modulos = await admin.put("/api/modulos", { cotizador: true });
  assert.equal(modulos.estado, 200);

  const exploradores = (await cotizar(uno.id, 6)).cuerpo;
  assert.equal(exploradores.programas.length, 1);
  const p = exploradores.programas[0]!;
  assert.equal(p.nombre, "Exploradores");
  assert.deepEqual(p.precio && [p.precio.costo_inscripcion, p.precio.costo_mensualidad], ["300.00", "700.00"], "el precio de HOY (15/10/2026)");
  assert.deepEqual(p.grupos.map((g) => [g.nombre, g.lugares_disponibles, g.oferta]), [["Martes y jueves", 10, "lugar"]]);
  assert.match(p.grupos[0]!.horario_texto, /mar.*jue|Martes.*Jueves/i, "el horario sale en palabras de los días cargados");

  const constructores = (await cotizar(uno.id, 10)).cuerpo.programas;
  assert.deepEqual(constructores.map((x) => [x.nombre, x.precio?.costo_mensualidad, x.grupos[0]?.lugares_disponibles]), [["Constructores", "850.00", 8]]);
  assert.equal((await cotizar(uno.id, 3)).cuerpo.programas.length, 0, "a los 3 años no hay programa");
  assert.equal((await cotizar(uno.id, 15)).cuerpo.programas.length, 0, "a los 15 tampoco");
  const sedeDos = (await cotizar(dos.id, 7)).cuerpo.programas[0]!;
  assert.deepEqual([sedeDos.nombre, sedeDos.precio?.costo_inscripcion, sedeDos.precio?.costo_mensualidad, sedeDos.grupos[0]?.lugares_disponibles], ["Exploradores", "250.00", "650.50", 9], "«650,50» con coma decimal quedó en centavos exactos");

  // 3. La subida de precio programada rige desde su fecha y no antes (una versión nueva, no una edición).
  assert.equal((await cotizar(uno.id, 6, "2026-12-31")).cuerpo.programas[0]!.precio?.costo_mensualidad, "700.00");
  assert.equal((await cotizar(uno.id, 6, "2027-01-01")).cuerpo.programas[0]!.precio?.costo_mensualidad, "750.00");

  // 4. Lo cargado se ve y se edita por la administración de siempre (con el mismo candado y las mismas reglas), y vuelve a cargarse sin duplicar.
  const grupos = await admin.get<{ datos: { id: string; nombre: string; horarios: unknown[] }[] }>("/api/grupos");
  assert.deepEqual(grupos.cuerpo.datos.map((g) => g.nombre).sort(), ["Martes y jueves", "Sábados", "Viernes"]);
  const editar = await admin.patch(`/api/grupos/${grupos.cuerpo.datos.find((g) => g.nombre === "Sábados")!.id}`, { cupo_maximo: 7 });
  assert.equal(editar.estado, 200);
  const otraVez = await admin.post<Informe>("/api/catalogo/importacion", cuerpoDeCarga("aplicar", archivos));
  assert.equal(otraVez.cuerpo.limpia, true);
  assert.equal(otraVez.cuerpo.sin_cambios, false, "el cupo de «Sábados» cambió a mano (7) y el archivo dice 8: es un cambio del archivo");
  assert.deepEqual(otraVez.cuerpo.resumen.filter((r) => r.actualizados > 0).map((r) => r.clave), ["grupos"]);
  assert.equal(await db.grupo.count({}), 3);
  assert.equal(await db.precio.count({}), 4);

  // 5. La landing de la disciplina (su identificador sale del nombre; el código lo vio por primera vez aquí). La carga NO da de alta el canal de WhatsApp ni el aviso de privacidad
  //    (llevan un número verificado y un texto legal, no son del catálogo): sin ellos la página no abre; con ellos, dados de alta en Administración, abre con el nombre de la disciplina.
  assert.equal(vertical.slug, "robotica-creativa");
  assert.equal((await fetch(`${api.base}/l/${vertical.slug}?org=${SLUG}`)).status, 404, "sin canal de WhatsApp ni aviso de privacidad no hay página de registro");
  const aviso = await admin.post("/api/documentos-legales", { tipo: "aviso_privacidad", titulo: "Aviso de privacidad de prueba", texto: "Texto de prueba del aviso de privacidad.", vigente_desde: "2026-01-01T00:00:00Z" });
  assert.equal(aviso.estado, 201, JSON.stringify(aviso.cuerpo));
  const numero = `+52 55 ${String(randomInt(1_000_0000, 9_999_9999))}`.replace(/(\d{4})(\d{4})$/, "$1 $2");
  const canal = await admin.post<{ id: string }>("/api/canales-whatsapp", { vertical_id: vertical.id, numero_whatsapp: numero, nombre_publico: "Robótica Creativa" });
  assert.equal(canal.estado, 201, JSON.stringify(canal.cuerpo));
  await admin.post("/api/bandejas-chatwoot", { canal_whatsapp_id: canal.cuerpo.id, nombre: "Robótica Creativa", chatwoot_account_id: randomInt(1_000_000, 2_000_000_000), chatwoot_inbox_id: randomInt(1_000_000, 2_000_000_000) });
  const landing = await fetch(`${api.base}/l/${vertical.slug}?org=${SLUG}`);
  const html = await landing.text();
  assert.equal(landing.status, 200, html.slice(0, 300));
  assert.match(html, /Robótica Creativa/);
});
