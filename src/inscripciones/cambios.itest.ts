// F5: cambio de grupo con historial, congelar, reactivar y baja con motivo. Postgres real, la app real: el historial de solo anexar, el cupo que
// se suelta y se toma (con avisos a la lista de espera), el catálogo de motivos editable, los permisos y alcance y la concurrencia: cambio de
// grupo vs. inscripción por el último lugar, cambios cruzados sin interbloqueo, bajas simultáneas.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { altaConCandado } from "../lista-espera/lista-espera.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarOrganizacion, sembrarPrograma, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";

const AHORA = new Date("2026-10-20T18:00:00Z"); // hoy = 2026-10-20 en la Ciudad de México
let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let docs: DocumentosLegalesSembrados;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let norte: string;
let sur: string;
let motivo: string;
let motivoOtro: string;
const db = () => conAlcance(prisma, org.organizacionId);
const cifrador = crearCifrador(randomBytes(32));

interface Insc { id: string; estatus: string; grupo_id: string; fecha_baja: string | null; lista_espera: { tarea_id: string; prospecto_id: string; posicion: number } | null }
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
const mot = (r: { cuerpo: Errores }): string | undefined => r.cuerpo.error.detalles?.find((d) => d.campo === "motivo")?.mensaje;

let n = 0;
/** Un programa con `cuantos` grupos (mismo programa, horarios distintos). */
async function programa(cuantos: number, cupo: number, sucursalId = norte) {
  const p = await sembrarPrograma(prisma, org, {
    sucursalId,
    nombre: `Programa ${++n}`,
    edadMin: 3,
    edadMax: 14,
    grupos: Array.from({ length: cuantos }, (_, i) => ({ nombre: `Grupo ${n}.${i}`, cupoMaximo: cupo, permiteListaEspera: true, horarios: [[(n + i) % 7, 480 + i * 70, 530 + i * 70]] as [number, number, number][] })),
    precio: { inscripcion: "100.00", mensualidad: "200.00" },
  });
  return { programaId: p.id, grupos: p.grupos.map((g) => g.id) };
}
const alumno = () => sembrarAlumno(prisma, org, { docs });
const inscribir = async (alumnoId: string, grupoId: string, c = admin) => {
  const r = await c.post<Insc & Errores>("/api/inscripciones", { alumno_id: alumnoId, grupo_id: grupoId });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
};
const accion = (c: ClienteApi, id: string, que: string, cuerpo: unknown = {}) => c.post<Insc & Errores>(`/api/inscripciones/${id}/${que}`, cuerpo);
const activas = (grupoId: string) => prisma.inscripcion.count({ where: { grupo_id: grupoId, estatus: "activa", eliminado_en: null } });
const estatusDelAlumno = async (id: string) => (await prisma.alumno.findFirstOrThrow({ where: { id } })).estatus;

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador } });
  org = await sembrarOrganizacion(prisma, "Cambios de inscripción");
  await sembrarEmbudo(prisma, org);
  docs = await sembrarDocumentosLegales(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar("administrador");
  asesorNorte = await entrar("asesor", [norte]);
  asesorSur = await entrar("asesor", [sur]);
  recepcion = await entrar("recepcion", [norte]);
  maestro = await entrar("maestro");
  motivo = (await admin.post<{ id: string }>("/api/motivos-baja", { nombre: "Económico" })).cuerpo.id;
  motivoOtro = (await admin.post<{ id: string }>("/api/motivos-baja", { nombre: "Cambio de domicilio" })).cuerpo.id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("catálogo de motivos de baja: se edita por organización (código derivado del nombre), no se repite, la baja lógica no toca lo ya dado de baja y solo el administrador escribe", async () => {
  const c = await admin.post<{ id: string; codigo: string; nombre: string; activo: boolean }>("/api/motivos-baja", { nombre: "Se cambió de escuela", orden: 7 });
  assert.equal(c.estado, 201);
  assert.equal(c.cuerpo.codigo, "se_cambio_de_escuela");
  assert.equal((await admin.post("/api/motivos-baja", { nombre: "Otro nombre", codigo: "se_cambio_de_escuela" })).estado, 409);
  assert.equal((await admin.post("/api/motivos-baja", { nombre: "X", codigo: "Mayúsculas" })).estado, 400);
  assert.equal((await asesorNorte.get("/api/motivos-baja")).estado, 200);
  assert.equal((await asesorNorte.post("/api/motivos-baja", { nombre: "No puede" })).estado, 403);
  assert.equal((await recepcion.patch(`/api/motivos-baja/${c.cuerpo.id}`, { nombre: "No puede" })).estado, 403);
  const p = await admin.patch<{ nombre: string; activo: boolean }>(`/api/motivos-baja/${c.cuerpo.id}`, { nombre: "Se cambió de colegio" });
  assert.equal(p.cuerpo.nombre, "Se cambió de colegio");
  // Con un motivo ya usado: dar de baja el motivo no toca la inscripción que lo usó.
  const g = await programa(1, 5);
  const a = await alumno();
  const i = await inscribir(a.alumnoId, g.grupos[0]!);
  assert.equal((await accion(admin, i.id, "baja", { motivo_baja_id: c.cuerpo.id })).estado, 200);
  assert.equal((await admin.delete(`/api/motivos-baja/${c.cuerpo.id}`)).estado, 204);
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } })).motivo_baja_id, c.cuerpo.id);
  const activos = await admin.get<{ datos: { id: string }[] }>("/api/motivos-baja?activo=true");
  assert.ok(!activos.cuerpo.datos.some((m) => m.id === c.cuerpo.id));
  // Otra organización no ve los míos.
  const ajena = await sembrarOrganizacion(prisma, "Motivos ajena");
  const u = await sembrarUsuario(prisma, ajena.organizacionId, { rol: "administrador" });
  const cAjena = api.cliente();
  await cAjena.login(ajena.slug, u.correo, u.contrasena);
  assert.equal((await cAjena.get<{ datos: unknown[] }>("/api/motivos-baja")).cuerpo.datos.length, 0);
  assert.equal((await cAjena.patch(`/api/motivos-baja/${motivo}`, { nombre: "Intruso" })).estado, 404);
  assert.equal((await db().registro_cambio.count({ where: { entidad_tipo: "motivo_baja" } })) >= 4, true);
});

test("cambio de grupo: queda en el nuevo grupo con su historial (de solo anexar), conserva el precio congelado y el lugar viejo se libera", async () => {
  const p = await programa(2, 5);
  const [viejo, nuevo] = [p.grupos[0]!, p.grupos[1]!];
  const a = await alumno();
  const i = await inscribir(a.alumnoId, viejo);
  const antes = await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } });
  const r = await accion(recepcion, i.id, "cambiar-grupo", { grupo_id: nuevo });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.grupo_id, nuevo);
  assert.equal(await activas(viejo), 0);
  assert.equal(await activas(nuevo), 1);
  const despues = await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } });
  assert.deepEqual([despues.precio_inscripcion_aplicado.toFixed(2), despues.precio_mensualidad_aplicado.toFixed(2), despues.programa_id], [antes.precio_inscripcion_aplicado.toFixed(2), antes.precio_mensualidad_aplicado.toFixed(2), antes.programa_id]);
  const mov = await admin.get<{ datos: { tipo: string; fecha: string; grupo_anterior: { id: string }; grupo_nuevo: { id: string }; usuario: { id: string } }[] }>(`/api/inscripciones/${i.id}/movimientos`);
  assert.equal(mov.cuerpo.datos.length, 1);
  assert.deepEqual([mov.cuerpo.datos[0]!.tipo, mov.cuerpo.datos[0]!.fecha, mov.cuerpo.datos[0]!.grupo_anterior.id, mov.cuerpo.datos[0]!.grupo_nuevo.id], ["cambio_grupo", "2026-10-20", viejo, nuevo]);
  // Registro de cambios: sin nada identificable.
  const cambio = await db().registro_cambio.findFirst({ where: { entidad_id: i.id, accion: "actualizar" } });
  assert.deepEqual([(cambio!.antes as Record<string, unknown>)["grupo_id"], (cambio!.despues as Record<string, unknown>)["grupo_id"]], [viejo, nuevo]);
  // Solo anexar: ni UPDATE, ni DELETE, ni TRUNCATE.
  await assert.rejects(prisma.inscripcion_movimiento.updateMany({ where: { inscripcion_id: i.id }, data: { fecha: new Date("2020-01-01") } }), /de solo anexar/);
  await assert.rejects(prisma.inscripcion_movimiento.deleteMany({ where: { inscripcion_id: i.id } }), /de solo anexar/);
  await assert.rejects(prisma.$executeRawUnsafe("TRUNCATE inscripcion_movimiento CASCADE"), /de solo anexar/);
});

test("cambio de grupo: rechazos (mismo grupo, otro programa, grupo inexistente o inactivo, ya inscrito allí, dada de baja) y NADA cambia cuando el grupo nuevo está lleno", async () => {
  const p = await programa(3, 5);
  const otro = await programa(1, 5);
  const a = await alumno();
  const i = await inscribir(a.alumnoId, p.grupos[0]!);
  const estado = async () => (await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } })).grupo_id;
  assert.equal(mot(await accion(admin, i.id, "cambiar-grupo", { grupo_id: p.grupos[0] })), "mismo_grupo");
  assert.equal(mot(await accion(admin, i.id, "cambiar-grupo", { grupo_id: otro.grupos[0] })), "otro_programa");
  assert.equal((await accion(admin, i.id, "cambiar-grupo", { grupo_id: "00000000-0000-4000-8000-0000000000aa" })).estado, 404);
  await prisma.grupo.update({ where: { id: p.grupos[2]! }, data: { activo: false } });
  assert.equal((await accion(admin, i.id, "cambiar-grupo", { grupo_id: p.grupos[2] })).estado, 404, "un grupo inactivo no recibe a nadie");
  assert.equal((await accion(admin, i.id, "cambiar-grupo", {})).estado, 400);
  // El alumno ya está activo en el grupo destino (otra inscripción suya).
  await inscribir(a.alumnoId, p.grupos[1]!);
  assert.equal(mot(await accion(admin, i.id, "cambiar-grupo", { grupo_id: p.grupos[1] })), "ya_inscrito");
  // Grupo lleno: nada cambia.
  const lleno = await programa(2, 1);
  const b = await alumno();
  const c = await alumno();
  const ib = await inscribir(b.alumnoId, lleno.grupos[0]!);
  await inscribir(c.alumnoId, lleno.grupos[1]!);
  const antes = await prisma.inscripcion_movimiento.count({ where: { inscripcion_id: ib.id } });
  const r = await accion(admin, ib.id, "cambiar-grupo", { grupo_id: lleno.grupos[1] });
  assert.equal(r.estado, 409);
  assert.equal(mot(r), "grupo_lleno");
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: ib.id } })).grupo_id, lleno.grupos[0], "el lugar viejo no se soltó");
  assert.equal(await prisma.inscripcion_movimiento.count({ where: { inscripcion_id: ib.id } }), antes);
  assert.equal(await estado(), p.grupos[0]);
  // Una baja no cambia de grupo.
  await accion(admin, i.id, "baja", { motivo_baja_id: motivo });
  assert.equal(mot(await accion(admin, i.id, "cambiar-grupo", { grupo_id: p.grupos[2] })), "estatus_invalido");
});

test("congelar libera el lugar, reactivar lo vuelve a pedir (409 si el grupo se llenó) y el estatus del alumno sigue a sus inscripciones", async () => {
  const p = await programa(2, 1);
  const g = p.grupos[0]!;
  const a = await alumno();
  const i = await inscribir(a.alumnoId, g);
  assert.equal(await estatusDelAlumno(a.alumnoId), "activo");
  const c = await accion(recepcion, i.id, "congelar");
  assert.equal(c.estado, 200, JSON.stringify(c.cuerpo));
  assert.equal(c.cuerpo.estatus, "congelada");
  assert.equal(await activas(g), 0, "el lugar quedó libre");
  assert.equal(await estatusDelAlumno(a.alumnoId), "congelado");
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } })).congelada_desde?.toISOString().slice(0, 10), "2026-10-20");
  assert.equal(mot(await accion(admin, i.id, "congelar")), "estatus_invalido", "congelar dos veces");
  assert.equal(mot(await accion(admin, i.id, "cambiar-grupo", { grupo_id: g })), "mismo_grupo");
  // Otro alumno toma el lugar: reactivar ya no cabe.
  const b = await alumno();
  await inscribir(b.alumnoId, g);
  const r = await accion(admin, i.id, "reactivar");
  assert.equal(r.estado, 409);
  assert.equal(mot(r), "grupo_lleno");
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } })).estatus, "congelada");
  // Cambiarla de grupo congelada no pide lugar; luego reactiva en el nuevo.
  const mov = await accion(admin, i.id, "cambiar-grupo", { grupo_id: p.grupos[1] });
  assert.equal(mov.estado, 200);
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } })).estatus, "congelada", "sigue congelada");
  const ok = await accion(admin, i.id, "reactivar");
  assert.equal(ok.estado, 200);
  assert.equal(ok.cuerpo.estatus, "activa");
  assert.equal(await estatusDelAlumno(a.alumnoId), "activo");
  assert.equal((await prisma.inscripcion.findFirstOrThrow({ where: { id: i.id } })).congelada_desde, null);
  assert.equal(mot(await accion(admin, i.id, "reactivar")), "estatus_invalido");
  const tipos = (await prisma.inscripcion_movimiento.findMany({ where: { inscripcion_id: i.id }, orderBy: { secuencia: "asc" } })).map((m) => m.tipo);
  assert.deepEqual(tipos, ["congelacion", "cambio_grupo", "reactivacion"]);
});

test("baja con motivo: exige un motivo activo del catálogo, libera el lugar, deja su fecha y el alumno pasa a baja (y vuelve a activo si se inscribe de nuevo)", async () => {
  const p = await programa(1, 3);
  const g = p.grupos[0]!;
  const a = await alumno();
  const i = await inscribir(a.alumnoId, g);
  assert.equal((await accion(admin, i.id, "baja", {})).estado, 400, "el motivo es obligatorio");
  assert.equal((await accion(admin, i.id, "baja", { motivo_baja_id: "00000000-0000-4000-8000-0000000000aa" })).estado, 400, "un motivo que no existe");
  const inactivo = (await admin.post<{ id: string }>("/api/motivos-baja", { nombre: "Apagado" })).cuerpo.id;
  await admin.patch(`/api/motivos-baja/${inactivo}`, { activo: false });
  assert.equal((await accion(admin, i.id, "baja", { motivo_baja_id: inactivo })).estado, 400, "un motivo apagado");
  const r = await accion(asesorNorte, i.id, "baja", { motivo_baja_id: motivo });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.estatus, r.cuerpo.fecha_baja], ["baja", "2026-10-20"]);
  assert.equal(await activas(g), 0);
  assert.equal(await estatusDelAlumno(a.alumnoId), "baja");
  assert.equal(mot(await accion(admin, i.id, "baja", { motivo_baja_id: motivo })), "estatus_invalido", "una baja no se da dos veces");
  const mov = await admin.get<{ datos: { tipo: string; motivo_baja: { id: string } }[] }>(`/api/inscripciones/${i.id}/movimientos`);
  assert.deepEqual([mov.cuerpo.datos[0]!.tipo, mov.cuerpo.datos[0]!.motivo_baja.id], ["baja", motivo]);
  // Vuelve: una inscripción nueva reactiva al alumno.
  await inscribir(a.alumnoId, g);
  assert.equal(await estatusDelAlumno(a.alumnoId), "activo");
  // Una baja antes de empezar surte efecto el día que habría empezado.
  const b = await alumno();
  const futura = await admin.post<Insc>("/api/inscripciones", { alumno_id: b.alumnoId, grupo_id: g, fecha_inicio: "2026-11-02" });
  const bf = await accion(admin, futura.cuerpo.id, "baja", { motivo_baja_id: motivoOtro });
  assert.equal(bf.cuerpo.fecha_baja, "2026-11-02");
  // Congelada también se da de baja.
  const c = await alumno();
  const ic = await inscribir(c.alumnoId, g);
  await accion(admin, ic.id, "congelar");
  const bc = await accion(admin, ic.id, "baja", { motivo_baja_id: motivo });
  assert.equal(bc.estado, 200);
  assert.equal(await prisma.inscripcion.count({ where: { id: ic.id, congelada_desde: null, estatus: "baja" } }), 1);
});

test("el estatus del alumno con varias inscripciones: activo mientras alguna esté activa, congelado si solo quedan congeladas, baja si ninguna vive", async () => {
  const p = await programa(1, 5);
  const q = await programa(1, 5);
  const a = await alumno();
  const i1 = await inscribir(a.alumnoId, p.grupos[0]!);
  const i2 = await inscribir(a.alumnoId, q.grupos[0]!);
  await accion(admin, i1.id, "congelar");
  assert.equal(await estatusDelAlumno(a.alumnoId), "activo");
  await accion(admin, i2.id, "congelar");
  assert.equal(await estatusDelAlumno(a.alumnoId), "congelado");
  await accion(admin, i1.id, "baja", { motivo_baja_id: motivo });
  assert.equal(await estatusDelAlumno(a.alumnoId), "congelado");
  await accion(admin, i2.id, "baja", { motivo_baja_id: motivo });
  assert.equal(await estatusDelAlumno(a.alumnoId), "baja");
});

test("un lugar que se libera (baja, congelar o cambio de grupo) se ofrece al primero de la lista de espera: tarea para el asesor, nadie recibe un mensaje", async () => {
  const p = await programa(2, 1);
  const g = p.grupos[0]!;
  const dueno = await alumno();
  const i = await inscribir(dueno.alumnoId, g);
  const espera1 = await alumno();
  const espera2 = await alumno();
  for (const e of [espera1, espera2]) assert.ok((await altaConCandado(db(), { grupoId: g, prospectoId: e.prospectoId, leadId: e.leadId })).ok);
  const r = await accion(admin, i.id, "baja", { motivo_baja_id: motivo });
  assert.equal(r.estado, 200);
  assert.deepEqual([r.cuerpo.lista_espera!.prospecto_id, r.cuerpo.lista_espera!.posicion], [espera1.prospectoId, 1]);
  const fila = await prisma.lista_espera.findFirstOrThrow({ where: { grupo_id: g, prospecto_id: espera1.prospectoId } });
  assert.equal(fila.estatus, "ofrecido");
  assert.equal((await prisma.lista_espera.findFirstOrThrow({ where: { grupo_id: g, prospecto_id: espera2.prospectoId } })).estatus, "esperando");
  const tarea = await prisma.tarea_asesor.findFirstOrThrow({ where: { id: r.cuerpo.lista_espera!.tarea_id } });
  assert.equal(tarea.tipo, "lista_espera_lugar_liberado");
  // Congelar y cambiar de grupo también avisan; un grupo sin nadie esperando no genera nada.
  const sin = await programa(2, 2);
  const s = await alumno();
  const si = await inscribir(s.alumnoId, sin.grupos[0]!);
  assert.equal((await accion(admin, si.id, "cambiar-grupo", { grupo_id: sin.grupos[1] })).cuerpo.lista_espera, null);
  const otro = await alumno();
  const oi = await inscribir(otro.alumnoId, p.grupos[1]!);
  const e3 = await alumno();
  assert.ok((await altaConCandado(db(), { grupoId: p.grupos[1]!, prospectoId: e3.prospectoId, leadId: e3.leadId })).ok);
  const cong = await accion(admin, oi.id, "congelar");
  assert.equal(cong.cuerpo.lista_espera?.prospecto_id, e3.prospectoId, "congelar también avisa a la lista de espera");
});

test("permisos y alcance: el maestro lee pero no cambia nada; el asesor del sur no toca lo del norte (404); sin sesión 401; cada rol con escritura lo registra", async () => {
  const p = await programa(2, 5);
  const a = await alumno();
  const i = await inscribir(a.alumnoId, p.grupos[0]!);
  for (const que of ["congelar", "reactivar"]) {
    assert.equal((await accion(maestro, i.id, que)).estado, 403, que);
    assert.equal((await accion(asesorSur, i.id, que)).estado, 404, que);
    assert.equal((await accion(api.cliente(), i.id, que)).estado, 401, que);
  }
  assert.equal((await accion(maestro, i.id, "baja", { motivo_baja_id: motivo })).estado, 403);
  assert.equal((await accion(asesorSur, i.id, "baja", { motivo_baja_id: motivo })).estado, 404);
  assert.equal((await accion(maestro, i.id, "cambiar-grupo", { grupo_id: p.grupos[1] })).estado, 403);
  assert.equal((await accion(asesorSur, i.id, "cambiar-grupo", { grupo_id: p.grupos[1] })).estado, 404);
  // El grupo destino tiene que ser visible para quien lo cambia (un grupo de otra sucursal, no).
  const delSur = await programa(1, 5, sur);
  assert.equal((await accion(asesorNorte, i.id, "cambiar-grupo", { grupo_id: delSur.grupos[0] })).estado, 404);
  assert.equal((await accion(asesorNorte, i.id, "congelar")).estado, 200);
  assert.equal((await asesorSur.get(`/api/inscripciones/${i.id}/movimientos`)).estado, 404);
  assert.equal((await maestro.get(`/api/inscripciones/${i.id}/movimientos`)).estado, 404, "el grupo no es suyo");
  assert.equal((await db().registro_cambio.count({ where: { entidad_id: i.id, accion: "actualizar" } })), 1);
});

test("CONCURRENCIA: un cambio de grupo y una inscripción nueva por el ÚLTIMO lugar del grupo destino → gana una, la otra recibe grupo_lleno, y nunca se pasa del cupo", async () => {
  for (let ronda = 0; ronda < 3; ronda++) {
    const p = await programa(2, 1);
    const [origen, destino] = [p.grupos[0]!, p.grupos[1]!];
    const mover = await alumno();
    const nuevo = await alumno();
    const im = await inscribir(mover.alumnoId, origen);
    const barrera = new Barrera(2);
    const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "grupo", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(destino), antes: () => barrera.esperar(2500) }), { reloj: () => AHORA, sensibles: { cifrador } });
    try {
      const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
      const [c1, c2] = [apiCarrera.cliente(), apiCarrera.cliente()];
      await c1.login(org.slug, u.correo, u.contrasena);
      await c2.login(org.slug, u.correo, u.contrasena);
      const [r1, r2] = await Promise.all([accion(c1, im.id, "cambiar-grupo", { grupo_id: destino }), c2.post<Insc & Errores>("/api/inscripciones", { alumno_id: nuevo.alumnoId, grupo_id: destino })]);
      const ganaCambio = r1.estado === 200;
      assert.ok(ganaCambio ? r2.estado === 409 && mot(r2) === "grupo_lleno" : r1.estado === 409 && mot(r1) === "grupo_lleno", `ronda ${ronda}: ${r1.estado} / ${r2.estado}`);
      assert.equal(await activas(destino), 1, "nunca se pasa del cupo");
      assert.equal(await activas(origen), ganaCambio ? 0 : 1);
      assert.ok(barrera.completa, "los dos llegaron al candado del grupo destino a la vez");
    } finally {
      await apiCarrera.cerrar();
    }
  }
});

test("CONCURRENCIA: 10 cambios de grupo simultáneos hacia un grupo con 3 lugares → entran exactamente 3 y los otros 7 NO cambian (siguen donde estaban)", async () => {
  const p = await programa(2, 20);
  const [origen, destino] = [p.grupos[0]!, p.grupos[1]!];
  await prisma.grupo.update({ where: { id: destino }, data: { cupo_maximo: 3 } });
  const alumnos = await Promise.all(Array.from({ length: 10 }, () => alumno()));
  const inscripciones: Insc[] = [];
  for (const a of alumnos) inscripciones.push(await inscribir(a.alumnoId, origen));
  const barrera = new Barrera(10);
  const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "grupo", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(origen) || JSON.stringify(a["where"]).includes(destino), antes: () => barrera.esperar(4000) }), { reloj: () => AHORA, sensibles: { cifrador } });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const clientes = await Promise.all(inscripciones.map(async () => {
      const c = apiCarrera.cliente();
      await c.login(org.slug, u.correo, u.contrasena);
      return c;
    }));
    const rs = await Promise.all(clientes.map((c, i) => accion(c, inscripciones[i]!.id, "cambiar-grupo", { grupo_id: destino })));
    assert.equal(rs.filter((r) => r.estado === 200).length, 3, JSON.stringify(rs.map((r) => r.estado)));
    assert.equal(rs.filter((r) => r.estado === 409 && mot(r) === "grupo_lleno").length, 7);
    assert.equal(await activas(destino), 3);
    assert.equal(await activas(origen), 7, "los que no cupieron siguen en su grupo: ninguno se quedó sin lugar");
    assert.equal(await prisma.inscripcion_movimiento.count({ where: { inscripcion_id: { in: inscripciones.map((i) => i.id) } } }), 3);
  } finally {
    await apiCarrera.cerrar();
  }
});

test("CONCURRENCIA: cambios CRUZADOS (A→B y B→A a la vez) no se interbloquean: con lugar los dos entran; con los dos grupos llenos los dos reciben grupo_lleno", async () => {
  for (const [cupo, esperado] of [[2, [200, 200]], [1, [409, 409]]] as const) {
    const p = await programa(2, cupo);
    const [ga, gb] = [p.grupos[0]!, p.grupos[1]!];
    const [x, y] = [await alumno(), await alumno()];
    const ix = await inscribir(x.alumnoId, ga);
    const iy = await inscribir(y.alumnoId, gb);
    const barrera = new Barrera(2);
    const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "grupo", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(ga) || JSON.stringify(a["where"]).includes(gb), antes: () => barrera.esperar(2500) }), { reloj: () => AHORA, sensibles: { cifrador } });
    try {
      const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
      const [c1, c2] = [apiCarrera.cliente(), apiCarrera.cliente()];
      await c1.login(org.slug, u.correo, u.contrasena);
      await c2.login(org.slug, u.correo, u.contrasena);
      const [r1, r2] = await Promise.all([accion(c1, ix.id, "cambiar-grupo", { grupo_id: gb }), accion(c2, iy.id, "cambiar-grupo", { grupo_id: ga })]);
      assert.deepEqual([r1.estado, r2.estado], [...esperado], JSON.stringify([r1.cuerpo.error, r2.cuerpo.error]));
      assert.ok((await activas(ga)) <= cupo && (await activas(gb)) <= cupo);
      assert.equal((await activas(ga)) + (await activas(gb)), 2, "nadie se quedó sin lugar");
    } finally {
      await apiCarrera.cerrar();
    }
  }
});

test("CONCURRENCIA: reactivar una congelada y una inscripción nueva por el último lugar → gana una; dos bajas simultáneas de la misma inscripción → una sola surte efecto", async () => {
  const p = await programa(1, 1);
  const g = p.grupos[0]!;
  const [uno, dos] = [await alumno(), await alumno()];
  const i1 = await inscribir(uno.alumnoId, g);
  await accion(admin, i1.id, "congelar");
  const barrera = new Barrera(2);
  const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "grupo", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(g), antes: () => barrera.esperar(2500) }), { reloj: () => AHORA, sensibles: { cifrador } });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const [c1, c2] = [apiCarrera.cliente(), apiCarrera.cliente()];
    await c1.login(org.slug, u.correo, u.contrasena);
    await c2.login(org.slug, u.correo, u.contrasena);
    const [r1, r2] = await Promise.all([accion(c1, i1.id, "reactivar"), c2.post<Insc & Errores>("/api/inscripciones", { alumno_id: dos.alumnoId, grupo_id: g })]);
    assert.deepEqual([r1.estado === 200, r2.estado === 201].filter(Boolean).length, 1, JSON.stringify([r1.estado, r2.estado]));
    assert.equal(await activas(g), 1);
  } finally {
    await apiCarrera.cerrar();
  }
  const q = await programa(1, 5);
  const a = await alumno();
  const ia = await inscribir(a.alumnoId, q.grupos[0]!);
  const bajas = await Promise.all([accion(admin, ia.id, "baja", { motivo_baja_id: motivo }), accion(admin, ia.id, "baja", { motivo_baja_id: motivoOtro })]);
  assert.deepEqual(bajas.map((r) => r.estado).sort(), [200, 409]);
  assert.equal(await prisma.inscripcion_movimiento.count({ where: { inscripcion_id: ia.id, tipo: "baja" } }), 1);
});

test("la base: un movimiento incoherente (cambio de grupo sin los dos grupos, baja sin motivo) y una baja sin motivo en la inscripción se rechazan aunque el código lo olvide", async () => {
  const p = await programa(2, 5);
  const a = await alumno();
  const i = await inscribir(a.alumnoId, p.grupos[0]!);
  const base = { organizacion_id: org.organizacionId, inscripcion_id: i.id, fecha: new Date("2026-10-20") };
  await assert.rejects(prisma.inscripcion_movimiento.create({ data: { ...base, tipo: "cambio_grupo" } }), /inscripcion_movimiento_check/);
  await assert.rejects(prisma.inscripcion_movimiento.create({ data: { ...base, tipo: "cambio_grupo", grupo_anterior_id: p.grupos[0]!, grupo_nuevo_id: p.grupos[0]! } }), /inscripcion_movimiento_check/);
  await assert.rejects(prisma.inscripcion_movimiento.create({ data: { ...base, tipo: "baja" } }), /inscripcion_movimiento_check/);
  await assert.rejects(prisma.inscripcion.update({ where: { id: i.id }, data: { estatus: "baja", fecha_baja: new Date("2026-10-21") } }), /inscripcion_motivo_baja_check/);
  await assert.rejects(prisma.inscripcion.update({ where: { id: i.id }, data: { estatus: "congelada" } }), /inscripcion_congelada_check/);
});
