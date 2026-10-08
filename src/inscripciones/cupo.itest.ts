// F4: el cupo REAL. La ocupación de un grupo son sus inscripciones activas (`InscripcionesActivas`), la MISMA fuente para el cotizador, la
// clase muestra, la lista de espera, el bot y la inscripción. Las congeladas y las bajas no ocupan lugar; la lista de espera tampoco. Dos
// inscripciones por el último lugar: gana una (concurrencia real contra Postgres).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { InscripcionesActivas, SinInscripciones, cupoPorGrupo } from "../catalogo/cupo.ts";
import { conAlcance } from "../datos/alcance.ts";
import { altaConCandado } from "../lista-espera/lista-espera.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { escenarioBot } from "../testutil/bot.ts";

const AHORA = new Date("2026-10-20T18:00:00Z"); // martes 12:00 en la Ciudad de México
let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let docs: DocumentosLegalesSembrados;
let admin: ClienteApi;
let norte: string;
const db = () => conAlcance(prisma, org.organizacionId);
const real = new InscripcionesActivas();

let n = 0;
async function grupoNuevo(cupo: number, o: { lista?: boolean } = {}) {
  const p = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: `Programa ${++n}`, edadMin: 3, edadMax: 14, grupos: [{ nombre: `Grupo ${n}`, cupoMaximo: cupo, permiteListaEspera: o.lista ?? true, horarios: [[2, 960, 1020]] }], precio: { inscripcion: "100.00", mensualidad: "200.00" } });
  return { programaId: p.id, grupoId: p.grupos[0]!.id };
}
const alumno = () => sembrarAlumno(prisma, org, { docs });
/** Una inscripción escrita directo (sin pasar por las reglas): para fijar el estado de un grupo. */
async function inscripcionDirecta(o: OrganizacionDePrueba, alumnoId: string, programaId: string, grupoId: string, estatus: "activa" | "congelada" | "baja") {
  return prisma.inscripcion.create({
    data: {
      organizacion_id: o.organizacionId, alumno_id: alumnoId, programa_id: programaId, grupo_id: grupoId, estatus,
      fecha_inscripcion: new Date("2026-10-01"), fecha_inicio: new Date("2026-10-01"), precio_inscripcion_aplicado: "100.00", precio_mensualidad_aplicado: "200.00", dia_corte_pago: 1,
      ...(estatus === "baja" ? { fecha_baja: new Date("2026-10-10") } : {}),
    },
  });
}
const inscribir = (c: ClienteApi, alumnoId: string, grupoId: string) => c.post<{ id?: string; error?: { detalles?: { campo?: string; mensaje: string }[] } }>("/api/inscripciones", { alumno_id: alumnoId, grupo_id: grupoId });
const esLleno = (r: { cuerpo: { error?: { detalles?: { campo?: string; mensaje: string }[] } } }) => r.cuerpo.error?.detalles?.some((d) => d.mensaje === "grupo_lleno") ?? false;

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador: crearCifrador(randomBytes(32)) } });
  org = await sembrarOrganizacion(prisma, "Cupo real");
  await sembrarEmbudo(prisma, org);
  docs = await sembrarDocumentosLegales(prisma, org);
  norte = org.sucursales[0]!.id;
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  admin = api.cliente();
  assert.equal((await admin.login(org.slug, u.correo, u.contrasena)).estado, 201);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("la ocupación son las inscripciones ACTIVAS: las congeladas y las bajas liberan el lugar y la lista de espera no cuenta", async () => {
  const g = await grupoNuevo(3);
  const [a, b, c, d] = [await alumno(), await alumno(), await alumno(), await alumno()];
  assert.equal(await real.ocupados(db(), g.grupoId), 0);
  await inscripcionDirecta(org, a.alumnoId, g.programaId, g.grupoId, "activa");
  await inscripcionDirecta(org, b.alumnoId, g.programaId, g.grupoId, "congelada");
  await inscripcionDirecta(org, c.alumnoId, g.programaId, g.grupoId, "baja");
  assert.equal(await real.ocupados(db(), g.grupoId), 1, "solo la activa ocupa");
  assert.equal(await real.ocupados(db(), g.grupoId), (await cupoPorGrupo(db(), g.grupoId))!.ocupados, "cupoPorGrupo usa la real por omisión");
  assert.equal((await cupoPorGrupo(db(), g.grupoId, new SinInscripciones()))!.ocupados, 0, "la fuente falsa sigue existiendo, solo para pruebas");
  const e1 = await altaConCandado(db(), { grupoId: g.grupoId, prospectoId: d.prospectoId, leadId: d.leadId });
  assert.ok(e1.ok);
  assert.equal(await real.ocupados(db(), g.grupoId), 1, "esperar no ocupa lugar");
  // Una inscripción borrada lógicamente tampoco.
  await prisma.inscripcion.updateMany({ where: { alumno_id: a.alumnoId }, data: { eliminado_en: new Date() } });
  assert.equal(await real.ocupados(db(), g.grupoId), 0);
});

test("un grupo se llena inscribiendo y se vuelve a abrir al congelar o dar de baja: la API lo refleja de inmediato", async () => {
  const g = await grupoNuevo(2);
  const [a, b, c] = [await alumno(), await alumno(), await alumno()];
  assert.equal((await inscribir(admin, a.alumnoId, g.grupoId)).estado, 201);
  const ultimo = await inscribir(admin, b.alumnoId, g.grupoId);
  assert.equal(ultimo.estado, 201);
  const lleno = await inscribir(admin, c.alumnoId, g.grupoId);
  assert.equal(lleno.estado, 409);
  assert.ok(esLleno(lleno));
  await prisma.inscripcion.update({ where: { id: ultimo.cuerpo.id! }, data: { estatus: "congelada" } });
  assert.equal((await inscribir(admin, c.alumnoId, g.grupoId)).estado, 201, "la congelada soltó su lugar");
});

test("la MISMA fuente en todos lados: el cotizador de la API, las sesiones de clase muestra y el bot de WhatsApp ven los lugares que dejan las inscripciones", async () => {
  const g = await grupoNuevo(3);
  const [a, b] = [await alumno(), await alumno()];
  await inscripcionDirecta(org, a.alumnoId, g.programaId, g.grupoId, "activa");
  await inscripcionDirecta(org, b.alumnoId, g.programaId, g.grupoId, "activa");
  // Cotizador de la API (sin inyectar ninguna fuente: la real es la de por omisión).
  const cot = await admin.get<{ programas: { programa_id: string; grupos: { grupo_id: string; lugares_disponibles: number }[] }[] }>(`/api/cotizador?vertical_id=${org.verticalId}&sucursal_id=${norte}&edad=8&fecha=2026-10-20`);
  assert.equal(cot.estado, 200);
  const delGrupo = cot.cuerpo.programas.flatMap((p) => p.grupos).find((x) => x.grupo_id === g.grupoId);
  assert.equal(delGrupo?.lugares_disponibles, 1);
  // Sesiones de la clase muestra: 3 − 2 inscritas = 1 lugar por sesión.
  const ses = await admin.get<{ datos: { lugares: number }[] }>(`/api/clases-muestra/sesiones?grupo_id=${g.grupoId}&maximo=2`);
  assert.equal(ses.estado, 200);
  assert.ok(ses.cuerpo.datos.length >= 1 && ses.cuerpo.datos.every((s) => s.lugares === 1), JSON.stringify(ses.cuerpo));
  // La inscripción tercera llena el grupo y la sesión se queda sin lugar.
  const c = await alumno();
  assert.equal((await inscribir(admin, c.alumnoId, g.grupoId)).estado, 201);
  assert.equal((await admin.get<{ datos: unknown[] }>(`/api/clases-muestra/sesiones?grupo_id=${g.grupoId}&maximo=2`)).cuerpo.datos.length, 0, "sin lugares, la sesión no se ofrece");
});

test("el bot de WhatsApp (sin fuente inyectada) ofrece la lista de espera en el grupo que las inscripciones llenaron", async () => {
  const e = await escenarioBot(prisma, {
    programas: [{ sucursal: 0, nombre: "Programa del bot", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: 2, permiteListaEspera: true, horarios: [[1, 960, 1020]] }, { nombre: "Grupo B", cupoMaximo: 6, horarios: [[2, 960, 1020]] }], precio: { inscripcion: "100.00", mensualidad: "200.00" } }],
  });
  const a = e.programas[0]!.grupos[0]!.id;
  for (let i = 0; i < 2; i++) {
    const al = await sembrarAlumno(prisma, e.org, {});
    await inscripcionDirecta(e.org, al.alumnoId, e.programas[0]!.id, a, "activa");
  }
  const c = e.contacto();
  await c.conversa("Hola", "Ana", "8", "1");
  const texto = c.mensajes().at(-1)!;
  assert.match(texto, /Grupo B: martes de 16:00 a 17:00 · 6 lugares/);
  assert.match(texto, /Grupo A: lunes de 16:00 a 17:00 · lista de espera/, "lleno por las inscripciones reales");
});

for (const [intentos, cupo] of [[2, 1], [10, 1], [10, 3]] as const) {
  test(`CONCURRENCIA: ${intentos} inscripciones simultáneas por ${cupo === 1 ? "el último lugar" : `los ${cupo} lugares`} → gana${cupo === 1 ? "" : "n"} exactamente ${cupo}, el resto recibe grupo_lleno y nunca un 500`, async () => {
    const g = await grupoNuevo(cupo);
    const alumnos = await Promise.all(Array.from({ length: intentos }, () => alumno()));
    const barrera = new Barrera(intentos);
    // La barrera va justo antes del candado del cupo: los N llegan juntos al mismo UPDATE y solo el candado decide.
    const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "grupo", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(g.grupoId), antes: () => barrera.esperar(4000) }), { reloj: () => AHORA });
    try {
      const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
      const clientes = await Promise.all(alumnos.map(async () => {
        const c = apiCarrera.cliente();
        assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
        return c;
      }));
      const rs = await Promise.all(clientes.map((c, i) => inscribir(c, alumnos[i]!.alumnoId, g.grupoId)));
      assert.equal(rs.filter((r) => r.estado === 201).length, cupo, JSON.stringify(rs.map((r) => r.estado)));
      assert.equal(rs.filter((r) => r.estado === 409 && esLleno(r)).length, intentos - cupo);
      assert.equal(rs.filter((r) => r.estado >= 500).length, 0);
      assert.equal(await prisma.inscripcion.count({ where: { grupo_id: g.grupoId, estatus: "activa" } }), cupo, "nunca se pasa del cupo");
      assert.ok(barrera.completa, "los N llegaron al candado a la vez (la carrera fue real)");
    } finally {
      await apiCarrera.cerrar();
    }
  });
}
