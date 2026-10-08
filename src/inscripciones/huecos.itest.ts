// EF-05 (auditoría de la etapa F): las mutaciones que sobrevivían a las pruebas de F. Cada prueba cierra un hueco real —lo que el código hace y ninguna
// aserción comprobaba— y se verificó por mutación (el arreglo contrario hace fallar la prueba).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { altaConCandado } from "../lista-espera/lista-espera.ts";
import { conGanchos } from "../testutil/carrera.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarMotivoBaja, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { cambiarDeGrupo, congelarInscripcion, darDeBaja } from "./cambios.ts";

const AHORA = new Date("2026-10-20T18:00:00Z"); // martes 12:00 en la Ciudad de México
let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let docs: DocumentosLegalesSembrados;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let norte: string;
let sur: string;
let n = 0;
const db = () => conAlcance(prisma, org.organizacionId);
const ctx = { ahora: AHORA, usuarioId: null };

interface Insc { id: string; estatus: string; precio_inscripcion_aplicado: string; precio_mensualidad_aplicado: string; descuento_inscripcion_aplicado: string; descuento_mensualidad_aplicado: string; meses_gratis_aplicados: number; error?: { detalles?: { campo?: string; mensaje: string }[] } }
const motivo = (r: { cuerpo: Insc }): string | undefined => r.cuerpo.error?.detalles?.find((d) => d.campo === "motivo")?.mensaje;

async function grupoNuevo(o: { cupo?: number; sucursalId?: string; edadMin?: number; edadMax?: number; corte?: string; lista?: boolean } = {}) {
  const p = await sembrarPrograma(prisma, org, {
    sucursalId: o.sucursalId ?? norte,
    nombre: `Programa ${++n}`,
    edadMin: o.edadMin ?? 3,
    edadMax: o.edadMax ?? 14,
    ...(o.corte ? { fechaCorteEdad: o.corte } : {}),
    grupos: [{ nombre: `Grupo ${n}`, cupoMaximo: o.cupo ?? 10, permiteListaEspera: o.lista ?? true, horarios: [[n % 7, 480 + (Math.floor(n / 7) % 12) * 60, 530 + (Math.floor(n / 7) % 12) * 60]] }],
    precio: { inscripcion: "300.00", mensualidad: "600.00" },
  });
  return { programaId: p.id, grupoId: p.grupos[0]!.id };
}
const alumno = (o: Parameters<typeof sembrarAlumno>[2] = {}) => sembrarAlumno(prisma, org, { docs, ...o });
const inscribir = (c: ClienteApi, alumnoId: string, grupoId: string, extra: Record<string, unknown> = {}) => c.post<Insc>("/api/inscripciones", { alumno_id: alumnoId, grupo_id: grupoId, ...extra });

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "Huecos de F");
  await sembrarEmbudo(prisma, org);
  docs = await sembrarDocumentosLegales(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar("administrador");
  asesorNorte = await entrar("asesor", [norte]);
  asesorSur = await entrar("asesor", [sur]);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("el precio se congela al día de la INSCRIPCIÓN, no al día en que empiezan las clases (un aumento entre las dos fechas no lo toca)", async () => {
  const g = await grupoNuevo();
  assert.equal((await admin.post("/api/precios", { programa_id: g.programaId, costo_inscripcion: "400.00", costo_mensualidad: "750.00", vigencia_desde: "2026-10-25" })).estado, 201);
  const a = await alumno();
  const r = await inscribir(admin, a.alumnoId, g.grupoId, { fecha_inicio: "2026-10-27" });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.precio_mensualidad_aplicado, "600.00", "hoy rige el precio anterior aunque las clases empiecen después del aumento");
  assert.equal(r.cuerpo.precio_inscripcion_aplicado, "300.00");
});

test("los meses gratis inmediatos de una promoción quedan guardados en la inscripción", async () => {
  const g = await grupoNuevo();
  const promo = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "Dos meses", codigo: `M${++n}${Date.now()}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "sin_condicion", acumulable: true, prioridad: 5 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: promo.id, tipo: "meses_gratis", modo: "total", valor: "2.00", momento_disparo: "inmediato" } });
  try {
    const a = await alumno();
    const r = await inscribir(admin, a.alumnoId, g.grupoId);
    assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.meses_gratis_aplicados, 2);
    assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: r.cuerpo.id } })).meses_gratis_aplicados, 2);
  } finally {
    await prisma.promocion.update({ where: { id: promo.id }, data: { activo: false } });
  }
});

test("el borde SUPERIOR de la edad: al corte cumple 8 todavía entra y cumple 9 ya no", async () => {
  const g = await grupoNuevo({ edadMin: 6, edadMax: 8, corte: "2026-09-01" });
  const justo = await alumno({ nacimiento: "2018-09-01" }); // 8 años cumplidos el día del corte
  assert.equal((await inscribir(admin, justo.alumnoId, g.grupoId)).estado, 201);
  const pasado = await alumno({ nacimiento: "2017-09-01" }); // 9 años cumplidos el día del corte
  const r = await inscribir(admin, pasado.alumnoId, g.grupoId);
  assert.equal(r.estado, 409);
  assert.equal(motivo(r), "fuera_de_edad");
});

test("una cotización vencida no se puede aceptar al inscribir; una vigente sí, y queda aceptada", async () => {
  const g = await grupoNuevo();
  const a = await alumno();
  const cot = (estatus: "vencida" | "vigente") => prisma.cotizacion.create({ data: { organizacion_id: org.organizacionId, lead_id: a.leadId, prospecto_id: a.prospectoId, programa_id: g.programaId, sucursal_id: norte, origen: "asesor", fecha: new Date("2026-10-19"), vigente_hasta: new Date("2026-10-26"), estatus, snapshot: {} } });
  const vencida = await cot("vencida");
  const r = await inscribir(admin, a.alumnoId, g.grupoId, { cotizacion_id: vencida.id });
  assert.equal(r.estado, 400, "validación: la cotización no sirve");
  assert.equal(await prisma.inscripcion.count({ where: { alumno_id: a.alumnoId } }), 0);
  const vigente = await cot("vigente");
  assert.equal((await inscribir(admin, a.alumnoId, g.grupoId, { cotizacion_id: vigente.id })).estado, 201);
  assert.equal((await prisma.cotizacion.findFirstOrThrow({ where: { id: vigente.id } })).estatus, "aceptada");
  assert.equal((await prisma.cotizacion.findFirstOrThrow({ where: { id: vencida.id } })).estatus, "vencida", "la vencida no se toca");
});

test("si una promoción se agota en la carrera, el lugar que ya se había tomado de la OTRA se devuelve y la inscripción paga solo lo que sí le tocó", async () => {
  const g = await grupoNuevo();
  const crear = async (nombre: string, prioridad: number, cupo: number, beneficio: { tipo: "descuento_mensualidad" | "descuento_inscripcion"; valor: string }) => {
    const p = await prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre, codigo: `${nombre}${++n}${Date.now()}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "sin_condicion", acumulable: true, prioridad, cupo_maximo: cupo } });
    await prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: p.id, tipo: beneficio.tipo, modo: "monto_fijo", valor: beneficio.valor } });
    return p.id;
  };
  const primera = await crear("Primera", 9, 5, { tipo: "descuento_mensualidad", valor: "50.00" }); // se consume antes (mayor prioridad)
  const segunda = await crear("Segunda", 5, 1, { tipo: "descuento_inscripcion", valor: "20.00" }); // la agota otra inscripción justo antes
  // Otra inscripción gana el último lugar de la segunda JUSTO cuando esta intenta tomarlo.
  const raiz = conGanchos(prisma, {
    modelo: "promocion",
    operacion: "updateMany",
    cuando: (a) => JSON.stringify(a["where"]).includes(segunda) && JSON.stringify(a["data"]).includes("increment"),
    antes: async () => {
      await prisma.promocion.update({ where: { id: segunda }, data: { cupo_usado: 1 } });
    },
  });
  const apiCarrera = levantarApi(raiz, { reloj: () => AHORA });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const c = apiCarrera.cliente();
    await c.login(org.slug, u.correo, u.contrasena);
    const a = await alumno();
    const r = await inscribir(c, a.alumnoId, g.grupoId);
    assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.descuento_mensualidad_aplicado, "50.00", "la primera sí le tocó");
    assert.equal(r.cuerpo.descuento_inscripcion_aplicado, "0.00", "la segunda se agotó");
    const usado = async (id: string) => (await prisma.promocion.findFirstOrThrow({ where: { id } })).cupo_usado;
    assert.equal(await usado(primera), 1, "el lugar tomado de la primera en la vuelta fallida se devolvió: solo cuenta la inscripción");
    assert.equal(await usado(segunda), 1);
    assert.equal(await prisma.promocion_aplicacion.count({ where: { inscripcion_id: r.cuerpo.id } }), 1);
  } finally {
    await apiCarrera.cerrar();
    for (const id of [primera, segunda]) await prisma.promocion.update({ where: { id }, data: { activo: false } });
  }
});

test("las operaciones de F5 son condicionales al estado que leyeron: si otra cosa cambia la inscripción en medio, no se pisa y se responde cambio_concurrente", async () => {
  const motivoBaja = await sembrarMotivoBaja(prisma, org);
  const alterar = (cuando: (a: Record<string, unknown>) => boolean, hacer: () => Promise<unknown>) =>
    conAlcance(
      conGanchos(prisma, {
        modelo: "inscripcion",
        operacion: "updateMany",
        cuando,
        antes: async () => {
          await hacer();
        },
      }),
      org.organizacionId,
    );
  // Congelar mientras otro la da de baja.
  const g = await grupoNuevo();
  const a = await alumno();
  const i = await inscribir(admin, a.alumnoId, g.grupoId);
  const conBaja = alterar((x) => JSON.stringify(x["data"]).includes("congelada"), () => prisma.inscripcion.update({ where: { id: i.cuerpo.id }, data: { estatus: "baja", fecha_baja: new Date("2026-10-21"), motivo_baja_id: motivoBaja } }));
  const c1 = await conBaja.$transaction((tx) => congelarInscripcion(tx, ctx, { inscripcionId: i.cuerpo.id }));
  assert.deepEqual([c1.ok, !c1.ok && c1.motivo], [false, "cambio_concurrente"]);
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: i.cuerpo.id } })).estatus, "baja", "no se pisó la baja");
  // Cambiar de grupo mientras otro la pasa a un tercer grupo del mismo programa.
  const p = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: `Tres ${++n}`, edadMin: 3, edadMax: 14, grupos: [{ nombre: "A", cupoMaximo: 5, horarios: [[1, 1000, 1060]] }, { nombre: "B", cupoMaximo: 5, horarios: [[2, 1000, 1060]] }, { nombre: "C", cupoMaximo: 5, horarios: [[3, 1000, 1060]] }], precio: { inscripcion: "300.00", mensualidad: "600.00" } });
  const [ga, gb, gc] = p.grupos.map((x) => x.id) as [string, string, string];
  const b = await alumno();
  const j = await inscribir(admin, b.alumnoId, ga);
  const mueveOtro = alterar((x) => JSON.stringify(x["data"]).includes(gb), () => prisma.inscripcion.update({ where: { id: j.cuerpo.id }, data: { grupo_id: gc } }));
  const c2 = await mueveOtro.$transaction((tx) => cambiarDeGrupo(tx, ctx, { inscripcionId: j.cuerpo.id, grupoNuevoId: gb }));
  assert.deepEqual([c2.ok, !c2.ok && c2.motivo], [false, "cambio_concurrente"]);
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: j.cuerpo.id } })).grupo_id, gc, "no se pisó el cambio de la otra operación");
  // Baja de una ya dada de baja por otra.
  const c3 = await db().$transaction((tx) => darDeBaja(tx, ctx, { inscripcionId: i.cuerpo.id, motivoBajaId: motivoBaja }));
  assert.deepEqual([c3.ok, !c3.ok && c3.motivo], [false, "estatus_invalido"]);
});

test("dar de baja una inscripción CONGELADA no libera ningún lugar activo, así que no se ofrece nada a la lista de espera (solo al soltar un lugar activo se avisa)", async () => {
  const g = await grupoNuevo({ cupo: 1 });
  const a = await alumno();
  const i = await inscribir(admin, a.alumnoId, g.grupoId);
  assert.equal(i.estado, 201);
  assert.equal((await admin.post(`/api/inscripciones/${i.cuerpo.id}/congelar`, {})).estado, 200);
  const espera = await alumno();
  assert.ok((await altaConCandado(db(), { grupoId: g.grupoId, prospectoId: espera.prospectoId, leadId: espera.leadId })).ok);
  const baja = await admin.post<{ lista_espera: unknown }>(`/api/inscripciones/${i.cuerpo.id}/baja`, { motivo_baja_id: await sembrarMotivoBaja(prisma, org) });
  assert.equal(baja.estado, 200);
  assert.equal(baja.cuerpo.lista_espera, null);
  assert.equal((await prisma.lista_espera.findFirstOrThrow({ where: { grupo_id: g.grupoId, prospecto_id: espera.prospectoId } })).estatus, "esperando");
});

test("POST /api/inscripciones exige las DOS cosas por separado: el alumno a la vista de quien inscribe y el grupo a su vista (404 en cada caso)", async () => {
  const gNorte = await grupoNuevo({ sucursalId: norte });
  const gSur = await grupoNuevo({ sucursalId: sur });
  const delNorte = await alumno({ sucursalId: norte });
  const delSur = await alumno({ sucursalId: sur });
  // Alumno del norte (a su vista) en un grupo del sur (fuera de su alcance): el grupo no existe para el asesor del norte.
  const grupoAjeno = await inscribir(asesorNorte, delNorte.alumnoId, gSur.grupoId);
  assert.equal(grupoAjeno.estado, 404);
  assert.equal(await prisma.inscripcion.count({ where: { alumno_id: delNorte.alumnoId } }), 0);
  // Alumno del sur (fuera de su alcance) en un grupo del norte (a su vista): el alumno no existe para el asesor del norte.
  const alumnoAjeno = await inscribir(asesorNorte, delSur.alumnoId, gNorte.grupoId);
  assert.equal(alumnoAjeno.estado, 404);
  assert.equal(await prisma.inscripcion.count({ where: { alumno_id: delSur.alumnoId } }), 0);
  // Y lo propio sí.
  assert.equal((await inscribir(asesorNorte, delNorte.alumnoId, gNorte.grupoId)).estado, 201);
  assert.equal((await inscribir(asesorSur, delSur.alumnoId, gSur.grupoId)).estado, 201);
});
