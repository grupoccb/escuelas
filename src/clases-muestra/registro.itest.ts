// D5: el registro de la clase muestra por API. Cada campo, las validaciones, borrador → completo → cerrado, los permisos por rol
// (el maestro de ese grupo, el asesor de la sucursal y el administrador capturan; recepción no; la salud solo administrador y maestro),
// IDOR entre organizaciones, grupos y registros, la salud SOLO cifrada, el registro de cambios sin datos identificables, la
// concurrencia (varias capturas a la vez se mezclan) y que lo capturado alcance para convertir a la familia sin recapturar.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearCifrador } from "../sensibles/index.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { registroDeProspectoParaConversion } from "./registro.ts";

// Martes 10 de noviembre de 2026, 12:00 en la Ciudad de México.
const AHORA = new Date("2026-11-10T18:00:00Z");
const PASADA = new Date("2026-11-09T22:00:00Z");
const FUTURA = new Date("2026-11-17T22:00:00Z");

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestroA: ClienteApi;
let maestroB: ClienteApi;
let adminId: string;
let maestroAId: string;
let norte: string;
let sur: string;
let grupoA: string;
let grupoB: string;
let grupoOtraVertical: string;
const cifrador = crearCifrador(randomBytes(32));
const db = () => conAlcance(prisma, org.organizacionId);

interface Reg {
  existe: boolean;
  id: string | null;
  estatus: string;
  prospecto_id: string;
  clase: { estatus: string };
  alumno: Record<string, unknown>;
  tutores: { id: string; nombre: string; telefono: string; es_responsable_pago: boolean; lo_lleva: boolean; puede_recoger: boolean }[];
  antecedentes: Record<string, unknown>;
  observacion: Record<string, unknown>;
  salud: { contacto_registrado: boolean; completa: boolean; faltantes: string[]; puedes_ver_valores: boolean };
  faltantes: string[];
}
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
type Respuesta = Reg & Errores;

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador } });
  org = await sembrarOrganizacion(prisma, "Registro muestra");
  ajena = await sembrarOrganizacion(prisma, "Registro muestra ajena");
  await sembrarEmbudo(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  const a = await entrar("administrador");
  admin = a.c;
  adminId = a.id;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  const ma = await entrar("maestro");
  const mb = await entrar("maestro");
  maestroA = ma.c;
  maestroAId = ma.id;
  maestroB = mb.c;
  const iA = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: ma.id, nombre: "Maestro A" } });
  const iB = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: mb.id, nombre: "Maestro B" } });
  const pn = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa norte", edadMin: 3, edadMax: 14, grupos: [{ nombre: "Norte A", cupoMaximo: 50, horarios: [[1, 960, 1020]] }, { nombre: "Norte B", cupoMaximo: 50, horarios: [[1, 960, 1020]] }] });
  grupoA = pn.grupos[0]!.id;
  grupoB = pn.grupos[1]!.id;
  await prisma.grupo.update({ where: { id: grupoA }, data: { instructor_id: iA.id } });
  await prisma.grupo.update({ where: { id: grupoB }, data: { instructor_id: iB.id } });
  // Un grupo de OTRA vertical de la misma organización (no se puede recomendar).
  const otra = await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Otra vertical", slug: "otra-vertical" } });
  const prog = await prisma.programa.create({ data: { organizacion_id: org.organizacionId, vertical_id: otra.id, sucursal_id: norte, nombre: "Programa otra", edad_min: 3, edad_max: 14 } });
  grupoOtraVertical = (await prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: prog.id, nombre: "Grupo otra", cupo_maximo: 10 } })).id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

let n = 0;
/** Una clase muestra insertada directo, con su familia. */
async function clase(grupoId = grupoA, o: { fecha?: Date; sucursalId?: string; estatus?: "agendada" | "cancelada" | "reagendada" | "asistio" | "no_asistio" } = {}) {
  const f = await sembrarFamilia(prisma, org, { sucursalId: o.sucursalId ?? norte, telefono: `+5255${String(40_000_000 + ++n * 17 + Math.floor(Math.random() * 1000))}` });
  const c = await prisma.clase_muestra.create({
    data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: grupoId, fecha_hora: o.fecha ?? FUTURA, agendada_por: "usuario", agendada_por_usuario_id: adminId, estatus: o.estatus ?? "agendada" },
  });
  return { id: c.id, leadId: f.leadId, prospectoId: f.prospectoId };
}

const tel = (): string => `+5255${String(60_000_000 + ++n * 31 + Math.floor(Math.random() * 1000))}`;
const tutorBase = (extra: Record<string, unknown> = {}) => ({ nombre: "Rosa", apellidos: "Mena", parentesco: "madre", telefono: tel(), correo: "rosa@correo.test", es_responsable_pago: true, lo_lleva: true, ...extra });
const saludCompleta = (telefono = tel()) => ({
  alergias: "CENTINELA-D5-ALERGIA",
  condiciones_medicas: "Ninguna",
  medicamentos: "Ninguno",
  contacto_emergencia: { nombre: "Lucía Prado", telefono, parentesco: "tía" },
  autorizacion_atencion_medica: true,
});
const alumnoBase = { nombre: "Mateo", apellidos: "Soto Mena", fecha_nacimiento: "2018-05-04", sexo: "masculino", escuela: "Primaria Benito Juárez", turno_escolar: "matutino", talla_uniforme: "8" };
const antecedentesBase = { practico_antes: true, practico_donde: "Club del barrio", practico_nivel: "principiante", motivo_clase: "disciplina" };
const patch = (c: ClienteApi, claseId: string, cuerpo: unknown) => c.patch<Respuesta>(`/api/clases-muestra/${claseId}/registro`, cuerpo);
const ver = (c: ClienteApi, claseId: string) => c.get<Respuesta>(`/api/clases-muestra/${claseId}/registro`);
const accion = (c: ClienteApi, claseId: string, a: "completar" | "cerrar" | "reabrir") => c.post<Respuesta>(`/api/clases-muestra/${claseId}/registro/${a}`, {});

/** Captura todo lo necesario para estar completo (el maestro, que puede escribir salud). */
async function capturaCompleta(claseId: string, c: ClienteApi = maestroA) {
  const r = await patch(c, claseId, { alumno: alumnoBase, tutores: [tutorBase()], salud: saludCompleta(), antecedentes: antecedentesBase });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  return r.cuerpo;
}

test("D5: el esqueleto «sin captura» y la primera captura crea el registro; cada campo se guarda y se lee de vuelta", async () => {
  const c = await clase();
  const vacio = await ver(maestroA, c.id);
  assert.equal(vacio.estado, 200);
  assert.deepEqual([vacio.cuerpo.existe, vacio.cuerpo.estatus, vacio.cuerpo.id], [false, "sin_captura", null]);
  assert.ok(vacio.cuerpo.faltantes.includes("alumno.nombre") && vacio.cuerpo.faltantes.includes("tutores"));

  const dos = tel();
  const r = await patch(maestroA, c.id, {
    alumno: alumnoBase,
    tutores: [tutorBase({ telefono: "+521 55 1234 5678" }), { nombre: "Abuelo Pedro", parentesco: "abuelo", telefono: dos, puede_recoger: true }],
    salud: saludCompleta(),
    antecedentes: { ...antecedentesBase, motivo_clase: "otro", motivo_clase_detalle: "se lo recomendó el pediatra" },
    observacion: { nivel_observado: "intermedio", grupo_recomendado_id: grupoB, interes_percibido: "alto", notas: "Muy atento, sigue instrucciones" },
  });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  const x = r.cuerpo;
  assert.equal(x.existe, true);
  assert.equal(x.estatus, "borrador");
  assert.deepEqual(x.alumno, { nombre: "Mateo", apellidos: "Soto Mena", fecha_nacimiento: "2018-05-04", sexo: "masculino", escuela: "Primaria Benito Juárez", turno_escolar: "matutino", talla_uniforme: "8" });
  assert.deepEqual(x.antecedentes, { practico_antes: true, practico_donde: "Club del barrio", practico_nivel: "principiante", motivo_clase: "otro", motivo_clase_detalle: "se lo recomendó el pediatra" });
  assert.deepEqual(x.observacion, { asistio: null, nivel_observado: "intermedio", grupo_recomendado_id: grupoB, interes_percibido: "alto", notas: "Muy atento, sigue instrucciones" });
  assert.equal(x.tutores.length, 2);
  assert.equal(x.tutores[0]!.telefono, "+525512345678", "+521 colapsa a +52 con normalizarTelefono()");
  assert.deepEqual([x.tutores[0]!.es_responsable_pago, x.tutores[0]!.lo_lleva, x.tutores[0]!.puede_recoger], [true, true, false]);
  assert.deepEqual([x.tutores[1]!.es_responsable_pago, x.tutores[1]!.lo_lleva, x.tutores[1]!.puede_recoger, x.tutores[1]!.telefono], [false, false, true, dos]);
  assert.deepEqual([x.salud.contacto_registrado, x.salud.completa, x.salud.faltantes], [true, true, []]);
  assert.deepEqual(x.faltantes, [], "con todo lo necesario no falta nada (la observación no se exige para estar completo)");
  // Una segunda captura parcial NO borra lo demás y `null` borra un valor.
  const parcial = await patch(maestroA, c.id, { alumno: { talla_uniforme: null, escuela: "Otra escuela" }, observacion: { interes_percibido: "medio" } });
  assert.equal(parcial.estado, 200);
  assert.equal(parcial.cuerpo.alumno["talla_uniforme"], null);
  assert.equal(parcial.cuerpo.alumno["escuela"], "Otra escuela");
  assert.equal(parcial.cuerpo.alumno["nombre"], "Mateo", "lo que no se mencionó no cambió");
  assert.equal(parcial.cuerpo.observacion["interes_percibido"], "medio");
  assert.equal(parcial.cuerpo.tutores.length, 2, "omitir `tutores` no toca a los adultos");
  assert.equal(await db().registro_clase_muestra.count({ where: { clase_muestra_id: c.id } }), 1);
});

test("D5: validaciones — fecha de nacimiento, sexo, correo, teléfonos, tutores, antecedentes, notas sin salud, grupo recomendado, campos desconocidos", async () => {
  const c = await clase();
  const mal = async (cuerpo: unknown, campo: string) => {
    const r = await patch(maestroA, c.id, cuerpo);
    assert.equal(r.estado, 400, `${campo}: ${JSON.stringify(r.cuerpo)}`);
    assert.ok(r.cuerpo.error.detalles?.some((d) => d.campo === campo), `${campo} en ${JSON.stringify(r.cuerpo.error.detalles)}`);
  };
  // Fecha de nacimiento «razonable»: ni futura, ni de hace más de 99 años, ni de un bebé de menos de un año, ni inexistente.
  await mal({ alumno: { fecha_nacimiento: "2027-01-01" } }, "alumno.fecha_nacimiento");
  await mal({ alumno: { fecha_nacimiento: "2026-11-11" } }, "alumno.fecha_nacimiento");
  await mal({ alumno: { fecha_nacimiento: "2026-01-15" } }, "alumno.fecha_nacimiento");
  await mal({ alumno: { fecha_nacimiento: "1900-01-01" } }, "alumno.fecha_nacimiento");
  await mal({ alumno: { fecha_nacimiento: "2018-02-30" } }, "alumno.fecha_nacimiento");
  await mal({ alumno: { fecha_nacimiento: "04/05/2018" } }, "alumno.fecha_nacimiento");
  assert.equal((await patch(maestroA, c.id, { alumno: { fecha_nacimiento: "2025-11-10" } })).estado, 200, "justo un año: sí");
  assert.equal((await patch(maestroA, c.id, { alumno: { fecha_nacimiento: "1927-11-10" } })).estado, 200, "99 años cumplidos: sí");
  await mal({ alumno: { sexo: "m" } }, "alumno.sexo");
  await mal({ alumno: { turno_escolar: "nocturno" } }, "alumno.turno_escolar");
  await mal({ alumno: { nombre: "" } }, "alumno.nombre");
  await mal({ alumno: { nombre: "x".repeat(121) } }, "alumno.nombre");
  await mal({ tutores: [tutorBase({ correo: "no-es-correo" })] }, "tutores[0].correo");
  await mal({ tutores: [tutorBase({ telefono: "123" })] }, "tutores[0].telefono");
  await mal({ tutores: [tutorBase({ telefono: "abc" })] }, "tutores[0].telefono");
  await mal({ tutores: [{ nombre: "Sin parentesco", telefono: tel() }] }, "tutores[0].parentesco");
  const repetido = tel();
  await mal({ tutores: [tutorBase({ telefono: repetido }), tutorBase({ nombre: "Otro", telefono: repetido, es_responsable_pago: false, lo_lleva: false })] }, "tutores[1].telefono");
  await mal({ tutores: [tutorBase(), tutorBase({ nombre: "Otro", telefono: tel(), lo_lleva: false })] }, "tutores");
  await mal({ tutores: [tutorBase({ id: "00000000-0000-4000-8000-0000000000aa" })] }, "tutores[0].id");
  await mal({ antecedentes: { practico_antes: false, practico_donde: "Club" } }, "antecedentes.practico_antes");
  await mal({ antecedentes: { motivo_clase: "capricho" } }, "antecedentes.motivo_clase");
  await mal({ antecedentes: { motivo_clase_detalle: "algo" } }, "antecedentes.motivo_clase_detalle");
  await mal({ antecedentes: { motivo_clase: "disciplina", motivo_clase_detalle: "algo" } }, "antecedentes.motivo_clase_detalle");
  await mal({ observacion: { interes_percibido: "altísimo" } }, "observacion.interes_percibido");
  await mal({ observacion: { notas: "Tiene alergia a los frutos secos" } }, "observacion.notas");
  await mal({ observacion: { notas: "toma medicamento por las mañanas" } }, "observacion.notas");
  await mal({ observacion: { grupo_recomendado_id: grupoOtraVertical } }, "observacion.grupo_recomendado_id");
  await mal({ observacion: { grupo_recomendado_id: "00000000-0000-4000-8000-0000000000bb" } }, "observacion.grupo_recomendado_id");
  await mal({ alumno: { nombre: "Ana", edad: 8 } }, "alumno.edad");
  await mal({ telefono_mama: "+525512345678" }, "telefono_mama");
  assert.equal((await patch(maestroA, c.id, {})).estado, 400, "sin ninguna sección");
  // Nada de lo inválido se escribió.
  assert.equal((await db().registro_clase_muestra.findFirstOrThrow({ where: { clase_muestra_id: c.id } })).alumno_nombre, null);
  // Una nota que NO es de salud pasa (el filtro no es una lista de palabras al azar).
  assert.equal((await patch(maestroA, c.id, { observacion: { notas: "Cuando se canse, déjalo descansar un momento; los fantasmas del gimnasio lo asustan" } })).estado, 200);
});

test("D5: borrador → completo → cerrado — lo que falta, completar con 409, editar un completo lo regresa a borrador, cerrar exige completo", async () => {
  const c = await clase();
  assert.equal((await accion(maestroA, c.id, "completar")).estado, 409, "sin nada capturado");
  assert.equal((await accion(maestroA, c.id, "cerrar")).estado, 409);
  await patch(maestroA, c.id, { alumno: { nombre: "Mateo" } });
  const parcial = await accion(maestroA, c.id, "completar");
  assert.equal(parcial.estado, 409);
  const campos = parcial.cuerpo.error.detalles!.map((d) => d.campo);
  for (const f of ["alumno.apellidos", "alumno.fecha_nacimiento", "alumno.sexo", "tutores", "antecedentes.practico_antes", "antecedentes.motivo_clase", "salud.alergias", "salud.contacto_emergencia", "salud.autorizacion_atencion_medica"]) assert.ok(campos.includes(f), `falta ${f} en ${campos.join(", ")}`);
  assert.equal((await ver(maestroA, c.id)).cuerpo.estatus, "borrador");

  await capturaCompleta(c.id);
  const completo = await accion(maestroA, c.id, "completar");
  assert.equal(completo.estado, 200, JSON.stringify(completo.cuerpo));
  assert.equal(completo.cuerpo.estatus, "completo");
  assert.equal((await accion(maestroA, c.id, "completar")).estado, 200, "idempotente");

  // Quitar un dato obligatorio lo regresa a borrador; volverlo a poner no lo vuelve a completar solo.
  const quita = await patch(maestroA, c.id, { alumno: { sexo: null } });
  assert.equal(quita.cuerpo.estatus, "borrador");
  assert.deepEqual(quita.cuerpo.faltantes, ["alumno.sexo"]);
  await patch(maestroA, c.id, { alumno: { sexo: "femenino" } });
  assert.equal((await ver(maestroA, c.id)).cuerpo.estatus, "borrador");
  assert.equal((await accion(maestroA, c.id, "completar")).estado, 200);

  // La clase no se ha dado: cerrar no pide el interés (solo si asistió). Hoy el reglamento todavía no existe (D6).
  const cerrado = await accion(asesorNorte, c.id, "cerrar");
  assert.equal(cerrado.estado, 200, JSON.stringify(cerrado.cuerpo));
  assert.equal(cerrado.cuerpo.estatus, "cerrado");
  assert.equal((await patch(maestroA, c.id, { alumno: { nombre: "Otro" } })).estado, 409, "cerrado: no se edita");
  assert.equal((await accion(maestroA, c.id, "reabrir")).estado, 403, "el maestro no reabre");
  assert.equal((await accion(asesorNorte, c.id, "reabrir")).estado, 403);
  assert.equal((await accion(admin, c.id, "reabrir")).estado, 200);
  assert.equal((await ver(admin, c.id)).cuerpo.estatus, "completo");
  assert.equal((await patch(maestroA, c.id, { alumno: { nombre: "Mateo Jr." } })).estado, 200, "reabierto: se edita");
});

test("D5: asistió o no es el estatus de la clase — desde la hora, con las reglas de D4; un rechazo no deja nada a medias; cerrar pide el interés si se dio la clase", async () => {
  const futura = await clase(grupoA, { fecha: FUTURA });
  const r = await patch(maestroA, futura.id, { alumno: { nombre: "Nadie" }, observacion: { asistio: true } });
  assert.equal(r.estado, 409);
  assert.match(r.cuerpo.error.mensaje, /todavía no empieza/);
  assert.equal(await db().registro_clase_muestra.count({ where: { clase_muestra_id: futura.id } }), 0, "el rechazo revirtió todo: ni el registro se creó");

  const pasada = await clase(grupoA, { fecha: PASADA });
  const ok = await patch(maestroA, pasada.id, { alumno: alumnoBase, observacion: { asistio: true, nivel_observado: "principiante" } });
  assert.equal(ok.estado, 200, JSON.stringify(ok.cuerpo));
  assert.equal(ok.cuerpo.observacion["asistio"], true);
  assert.equal(ok.cuerpo.clase.estatus, "asistio");
  assert.equal((await db().clase_muestra.findFirstOrThrow({ where: { id: pasada.id } })).estatus, "asistio", "es la misma fuente que PATCH …/asistencia");
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "clase_muestra", entidad_id: pasada.id } }), 1);
  // Corrección dentro de la ventana.
  const corrige = await patch(maestroA, pasada.id, { observacion: { asistio: false } });
  assert.equal(corrige.cuerpo.observacion["asistio"], false);
  await patch(maestroA, pasada.id, { observacion: { asistio: true } });
  // Cerrar: la clase se dio y falta el interés percibido.
  await patch(maestroA, pasada.id, { tutores: [tutorBase()], salud: saludCompleta(), antecedentes: antecedentesBase });
  assert.equal((await accion(maestroA, pasada.id, "completar")).estado, 200);
  const sinInteres = await accion(maestroA, pasada.id, "cerrar");
  assert.equal(sinInteres.estado, 409);
  assert.ok(sinInteres.cuerpo.error.detalles?.some((d) => d.campo === "observacion.interes_percibido"));
  await patch(maestroA, pasada.id, { observacion: { interes_percibido: "alto" } });
  assert.equal((await accion(maestroA, pasada.id, "cerrar")).estado, 200);
});

test("D5: permisos por rol — recepción no ve nada; el asesor captura pero NO la salud (403, con constancia, y no guarda ni lo demás); maestro de otro grupo y asesor de otra sucursal, 404", async () => {
  const c = await clase(grupoA);
  const cuerpo = { alumno: { nombre: "Solo asesor" }, salud: { alergias: "CENTINELA-D5-ASESOR" } };
  // Recepción: ni leer ni escribir.
  assert.equal((await ver(recepcion, c.id)).estado, 403);
  assert.equal((await patch(recepcion, c.id, { alumno: { nombre: "X" } })).estado, 403);
  assert.equal((await accion(recepcion, c.id, "completar")).estado, 403);
  assert.equal((await ver(api.cliente(), c.id)).estado, 401);
  // Otro maestro y otra sucursal.
  assert.equal((await ver(maestroB, c.id)).estado, 404);
  assert.equal((await patch(maestroB, c.id, { alumno: { nombre: "X" } })).estado, 404);
  assert.equal((await ver(asesorSur, c.id)).estado, 404);
  assert.equal((await accion(asesorSur, c.id, "completar")).estado, 404);
  // El asesor de la sucursal: puede capturar el registro...
  assert.equal((await patch(asesorNorte, c.id, { alumno: { nombre: "Capturado por asesor" } })).estado, 200);
  // ...pero la salud no (marco de B4): 403, queda el intento y NADA de lo que venía en la misma petición se guarda.
  const antes = await db().acceso_dato_sensible.count({ where: { sujeto_id: (await db().clase_muestra.findFirstOrThrow({ where: { id: c.id } })).prospecto_id, resultado: "denegado" } });
  const r = await patch(asesorNorte, c.id, cuerpo);
  assert.equal(r.estado, 403);
  const prospectoId = (await db().clase_muestra.findFirstOrThrow({ where: { id: c.id } })).prospecto_id;
  assert.equal(await db().acceso_dato_sensible.count({ where: { sujeto_id: prospectoId, resultado: "denegado", causa: "sin_permiso", accion: "escribir" } }), antes + 1);
  assert.equal((await db().registro_clase_muestra.findFirstOrThrow({ where: { clase_muestra_id: c.id } })).alumno_nombre, "Capturado por asesor", "el 403 no cambió lo demás");
  assert.equal(await db().ficha_salud.count({ where: { sujeto_id: prospectoId } }), 0);
  // El asesor lee el registro: ve si hay salud (banderas), no sus valores, y no puede pedirlos por la ruta de salud.
  const verAsesor = await ver(asesorNorte, c.id);
  assert.equal(verAsesor.estado, 200);
  assert.equal(verAsesor.cuerpo.salud.puedes_ver_valores, false);
  assert.equal((await asesorNorte.get(`/api/salud/prospecto/${prospectoId}?motivo=curiosidad`)).estado, 403);
  // El administrador y el maestro de ese grupo sí escriben salud.
  assert.equal((await patch(admin, c.id, { salud: { alergias: "Ninguna" } })).estado, 200);
  assert.equal((await patch(maestroA, c.id, { salud: { medicamentos: "Ninguno" } })).estado, 200);
  assert.equal((await ver(maestroA, c.id)).cuerpo.salud.puedes_ver_valores, true);
});

test("D5: la salud solo viaja cifrada — la ficha tiene el dato, el registro no; el maestro de ese grupo la lee por la ruta de salud (con constancia) y el de otro grupo no; el registro de cambios no guarda nada identificable", async () => {
  const c = await clase();
  await capturaCompleta(c.id);
  const prospectoId = c.prospectoId;
  const ficha = await prisma.ficha_salud.findFirstOrThrow({ where: { sujeto_id: prospectoId } });
  assert.ok(ficha.alergias && !ficha.alergias.includes("CENTINELA"), "la columna guarda texto cifrado");
  const registro = await prisma.registro_clase_muestra.findFirstOrThrow({ where: { clase_muestra_id: c.id } });
  assert.ok(!JSON.stringify(registro).includes("CENTINELA"), "el registro no tiene ningún valor de salud, solo banderas");
  assert.deepEqual([registro.salud_contacto_registrado, registro.salud_completa], [true, true]);

  const leida = await maestroA.get<{ campos: { alergias: string; contacto_emergencia: { nombre: string } } }>(`/api/salud/prospecto/${prospectoId}?motivo=${encodeURIComponent("clase de hoy")}`);
  assert.equal(leida.estado, 200, JSON.stringify(leida.cuerpo));
  assert.equal(leida.cuerpo.campos.alergias, "CENTINELA-D5-ALERGIA");
  assert.equal(leida.cuerpo.campos.contacto_emergencia.nombre, "Lucía Prado");
  assert.equal((await maestroB.get(`/api/salud/prospecto/${prospectoId}?motivo=curiosidad`)).estado, 404, "el maestro de otro grupo no es de ese alumno");
  const accesos = await db().acceso_dato_sensible.findMany({ where: { sujeto_id: prospectoId }, orderBy: { creado_en: "asc" } });
  assert.ok(accesos.some((a) => a.accion === "escribir" && a.resultado === "permitido" && a.usuario_id === maestroAId), "la captura quedó en el registro de accesos");
  assert.ok(accesos.some((a) => a.accion === "leer" && a.resultado === "permitido"));
  assert.ok(accesos.some((a) => a.accion === "leer" && a.resultado === "denegado" && a.causa === "no_es_de_tu_grupo"));
  assert.ok(accesos.every((a) => !JSON.stringify(a).includes("CENTINELA")), "el registro de accesos solo trae nombres de campos");

  // El registro de cambios: solo campos no identificables y las secciones tocadas.
  const cambios = await db().registro_cambio.findMany({ where: { entidad_tipo: "registro_clase_muestra", entidad_id: registro.id }, orderBy: { creado_en: "asc" } });
  assert.ok(cambios.length >= 1);
  const texto = JSON.stringify(cambios);
  for (const prohibido of ["CENTINELA", "Mateo", "Soto", "Rosa", "Mena", "2018-05-04", "correo.test", "Lucía", "+5255", "Club del barrio", "Primaria"]) assert.ok(!texto.includes(prohibido), `registro_cambio no debe llevar «${prohibido}»`);
  const primero = cambios[0]!;
  assert.equal(primero.accion, "crear");
  assert.deepEqual((primero.despues as { secciones: string[] }).secciones, ["alumno", "tutores", "salud", "antecedentes"]);
  assert.ok(cambios.some((x) => JSON.stringify(x.despues).includes("salud_completa")), "la bandera de salud sí queda");
});

test("D5: el contacto de emergencia debe ser una persona DISTINTA de los tutores — al capturarlo, al cambiar los tutores y al completar", async () => {
  const c = await clase();
  const t1 = tel();
  await patch(maestroA, c.id, { tutores: [tutorBase({ telefono: t1 })] });
  // Mismo teléfono que un tutor (aunque se escriba distinto) y mismo nombre con otro teléfono.
  const igualTel = await patch(maestroA, c.id, { salud: { contacto_emergencia: { nombre: "Alguien", telefono: t1.replace("+52", "") } } });
  assert.equal(igualTel.estado, 400);
  assert.ok(igualTel.cuerpo.error.detalles?.some((d) => d.campo === "salud.contacto_emergencia"));
  const igualNombre = await patch(maestroA, c.id, { salud: { contacto_emergencia: { nombre: "ROSA mena", telefono: tel() } } });
  assert.equal(igualNombre.estado, 400);
  assert.equal(await prisma.ficha_salud.count({ where: { sujeto_id: c.prospectoId } }), 0, "no se guardó nada");
  // Contacto inválido en sí mismo.
  const malTel = await patch(maestroA, c.id, { salud: { contacto_emergencia: { nombre: "Tía", telefono: "12" } } });
  assert.deepEqual(malTel.cuerpo.error.detalles?.map((d) => d.campo), ["salud.contacto_emergencia.telefono"]);
  // Distinto: bien.
  const contacto = tel();
  assert.equal((await patch(maestroA, c.id, { salud: { contacto_emergencia: { nombre: "Tía Lucía", telefono: contacto, parentesco: "tía" } } })).estado, 200);
  // Después agregan como tutor a ese mismo contacto (el asesor, que NO lee salud, también queda cubierto): rechazado.
  const choca = await patch(asesorNorte, c.id, { tutores: [tutorBase({ telefono: t1 }), tutorBase({ nombre: "Lucía", apellidos: "Prado", telefono: contacto, es_responsable_pago: false, lo_lleva: false })] });
  assert.equal(choca.estado, 400);
  assert.ok(choca.cuerpo.error.detalles?.some((d) => d.campo === "tutores"));
  assert.equal((await ver(maestroA, c.id)).cuerpo.tutores.length, 1, "la lista de tutores no cambió");
  // La comparación interna deja constancia con la acción «validar» (y nada de valores).
  const validaciones = await db().acceso_dato_sensible.findMany({ where: { sujeto_id: c.prospectoId, accion: "validar" } });
  assert.ok(validaciones.length >= 1 && validaciones.every((v) => v.resultado === "permitido" && JSON.stringify(v.campos) === JSON.stringify(["contacto_emergencia"])));
  // Un tutor distinto sí se acepta.
  assert.equal((await patch(asesorNorte, c.id, { tutores: [tutorBase({ telefono: t1 }), { nombre: "Pedro", parentesco: "abuelo", telefono: tel(), puede_recoger: true }] })).estado, 200);
});

test("D5: IDOR — el id de un adulto de OTRO registro no se acepta; una clase de otra organización no existe; el registro de una clase cancelada no se captura", async () => {
  const a = await clase();
  const b = await clase();
  const ra = await patch(maestroA, a.id, { tutores: [tutorBase()] });
  const rb = await patch(maestroA, b.id, { tutores: [tutorBase()] });
  const idDeB = rb.cuerpo.tutores[0]!.id;
  const intento = await patch(maestroA, a.id, { tutores: [{ ...tutorBase(), id: idDeB }] });
  assert.equal(intento.estado, 400, "no se puede reescribir al adulto de otro registro por su id");
  assert.equal((await ver(maestroA, b.id)).cuerpo.tutores[0]!.id, idDeB);
  assert.equal((await ver(maestroA, a.id)).cuerpo.tutores[0]!.id, ra.cuerpo.tutores[0]!.id);
  // Otra organización: el administrador de esta no ve la clase ajena.
  const fa = await sembrarFamilia(prisma, ajena);
  const pa = await sembrarPrograma(prisma, ajena, { sucursalId: ajena.sucursales[0]!.id, nombre: "P", edadMin: 1, edadMax: 9, grupos: [{ nombre: "G", horarios: [[1, 960, 1020]] }] });
  const ua = await prisma.usuario.create({ data: { organizacion_id: ajena.organizacionId, correo: `x-${Math.random()}@p.test`, nombre: "X", rol: "asesor", contrasena_hash: "x" } });
  const claseAjena = await prisma.clase_muestra.create({ data: { organizacion_id: ajena.organizacionId, lead_id: fa.leadId, prospecto_id: fa.prospectoId, grupo_id: pa.grupos[0]!.id, fecha_hora: FUTURA, agendada_por: "usuario", agendada_por_usuario_id: ua.id } });
  assert.equal((await ver(admin, claseAjena.id)).estado, 404);
  assert.equal((await patch(admin, claseAjena.id, { alumno: { nombre: "X" } })).estado, 404);
  assert.equal(await prisma.registro_clase_muestra.count({ where: { clase_muestra_id: claseAjena.id } }), 0);
  // Una clase cancelada o reagendada: 409.
  const cancelada = await clase(grupoA, { estatus: "cancelada" });
  assert.equal((await patch(maestroA, cancelada.id, { alumno: { nombre: "X" } })).estado, 409);
  const reagendada = await clase(grupoA, { estatus: "reagendada" });
  assert.equal((await patch(admin, reagendada.id, { alumno: { nombre: "X" } })).estado, 409);
  // Un id que no es uuid.
  assert.equal((await ver(admin, "no-es-uuid")).estado, 400);
});

test("D5: concurrencia — varias primeras capturas a la vez crean UN registro y se mezclan sin perder ninguna; el candado lo impide", async () => {
  const c = await clase();
  const secciones = [
    { alumno: { nombre: "Mateo", apellidos: "Soto" } },
    { alumno: { fecha_nacimiento: "2018-05-04", sexo: "masculino" } },
    { tutores: [tutorBase()] },
    { salud: saludCompleta() },
    { antecedentes: antecedentesBase },
    { observacion: { nivel_observado: "principiante", interes_percibido: "alto" } },
  ];
  const clientes = [maestroA, admin, maestroA, admin, maestroA, admin];
  const rs = await Promise.all(secciones.map((s, i) => patch(clientes[i]!, c.id, s)));
  assert.deepEqual(rs.map((r) => r.estado), [200, 200, 200, 200, 200, 200], JSON.stringify(rs.map((r) => r.cuerpo)));
  assert.equal(await db().registro_clase_muestra.count({ where: { clase_muestra_id: c.id } }), 1);
  const final = (await ver(maestroA, c.id)).cuerpo;
  assert.equal(final.alumno["nombre"], "Mateo");
  assert.equal(final.alumno["sexo"], "masculino");
  assert.equal(final.tutores.length, 1);
  assert.equal(final.salud.completa, true);
  assert.equal(final.antecedentes["motivo_clase"], "disciplina");
  assert.equal(final.observacion["interes_percibido"], "alto");
  assert.deepEqual(final.faltantes, []);
  // Dos «completar» a la vez: uno cambia el estatus y el otro ve el resultado.
  const dos = await Promise.all([accion(maestroA, c.id, "completar"), accion(admin, c.id, "completar")]);
  assert.deepEqual(dos.map((r) => r.estado), [200, 200]);
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "registro_clase_muestra", entidad_id: final.id!, accion: "actualizar", despues: { path: ["estatus"], equals: "completo" } } }), 1, "una sola transición a completo");
});

test("D5: reprogramar lleva el registro a la clase nueva (los datos son del alumno, no de la fecha) y un registro cerrado se queda donde está", async () => {
  const vieja = await clase(grupoA, { fecha: FUTURA });
  await patch(maestroA, vieja.id, { alumno: alumnoBase });
  const r = await admin.post<{ id: string } & Errores>(`/api/clases-muestra/${vieja.id}/reprogramar`, { fecha_hora: "2026-11-23T16:00:00-06:00" });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  const nuevaId = r.cuerpo.id;
  assert.equal((await ver(admin, nuevaId)).cuerpo.alumno["nombre"], "Mateo", "el registro se movió con el alumno");
  assert.equal(await db().registro_clase_muestra.count({ where: { clase_muestra_id: vieja.id } }), 0);
  assert.equal((await patch(admin, vieja.id, { alumno: { nombre: "x" } })).estado, 409, "la clase vieja ya no se captura");

  // Un registro CERRADO no se mueve: se queda en la clase donde se cerró.
  const otra = await clase(grupoA, { fecha: FUTURA });
  await capturaCompleta(otra.id);
  assert.equal((await accion(admin, otra.id, "completar")).estado, 200);
  assert.equal((await accion(admin, otra.id, "cerrar")).estado, 200);
  const r2 = await admin.post<{ id: string } & Errores>(`/api/clases-muestra/${otra.id}/reprogramar`, { fecha_hora: "2026-11-23T16:00:00-06:00" });
  assert.equal(r2.estado, 201, JSON.stringify(r2.cuerpo));
  assert.equal(await db().registro_clase_muestra.count({ where: { clase_muestra_id: otra.id, estatus: "cerrado" } }), 1);
  assert.equal((await ver(admin, r2.cuerpo.id)).cuerpo.existe, false);
});

test("D5: lo capturado alcanza para convertir a la familia SIN recapturar — registroDeProspectoParaConversion trae alumno, adultos con banderas, antecedentes y observación", async () => {
  const c = await clase();
  assert.equal(await registroDeProspectoParaConversion(db(), c.prospectoId), null, "sin registro completo no hay conversión");
  const t1 = tel();
  const t2 = tel();
  await patch(maestroA, c.id, {
    alumno: alumnoBase,
    tutores: [tutorBase({ telefono: t1 }), { nombre: "Pedro", apellidos: "Soto", parentesco: "abuelo", telefono: t2, puede_recoger: true }],
    salud: saludCompleta(),
    antecedentes: antecedentesBase,
    observacion: { nivel_observado: "intermedio", grupo_recomendado_id: grupoB, interes_percibido: "alto" },
  });
  assert.equal(await registroDeProspectoParaConversion(db(), c.prospectoId), null, "un borrador tampoco");
  assert.equal((await accion(maestroA, c.id, "completar")).estado, 200);
  const conv = await registroDeProspectoParaConversion(db(), c.prospectoId);
  assert.ok(conv);
  assert.deepEqual(conv.alumno, { nombre: "Mateo", apellidos: "Soto Mena", fechaNacimiento: "2018-05-04", sexo: "masculino", escuela: "Primaria Benito Juárez", turnoEscolar: "matutino", tallaUniforme: "8" });
  assert.deepEqual(conv.tutores.map((t) => [t.nombre, t.telefono, t.esResponsableDePago, t.loLleva, t.puedeRecoger]), [["Rosa", t1, true, true, false], ["Pedro", t2, false, false, true]]);
  assert.deepEqual(conv.antecedentes, { practicoAntes: true, practicoDonde: "Club del barrio", practicoNivel: "principiante", motivoClase: "disciplina", motivoClaseDetalle: null });
  assert.deepEqual(conv.observacion, { nivelObservado: "intermedio", grupoRecomendadoId: grupoB, interesPercibido: "alto" });
  assert.equal(conv.prospectoId, c.prospectoId);
  assert.equal(conv.leadId, c.leadId);
  assert.ok(!JSON.stringify(conv).includes("CENTINELA"), "la conversión no arrastra salud: esa va por el módulo de datos sensibles");
});

test("D5: el catálogo de motivos es un enum de la base y las restricciones de la tabla (un registro por clase, un responsable de pago, un teléfono por adulto)", async () => {
  const c = await clase();
  const r = await prisma.registro_clase_muestra.create({ data: { organizacion_id: org.organizacionId, clase_muestra_id: c.id, prospecto_id: c.prospectoId, lead_id: c.leadId, creado_por_usuario_id: adminId } });
  await assert.rejects(prisma.registro_clase_muestra.create({ data: { organizacion_id: org.organizacionId, clase_muestra_id: c.id, prospecto_id: c.prospectoId, lead_id: c.leadId, creado_por_usuario_id: adminId } }), /Unique|unique/);
  await assert.rejects(prisma.registro_clase_muestra.update({ where: { id: r.id }, data: { motivo_clase: "capricho" as never } }));
  await assert.rejects(prisma.registro_clase_muestra.update({ where: { id: r.id }, data: { practico_antes: false, practico_donde: "x" } }), /check|constraint/i);
  await assert.rejects(prisma.registro_clase_muestra.update({ where: { id: r.id }, data: { estatus: "cerrado" } }), /check|constraint/i);
  const t = (tel_: string, pago: boolean) => prisma.registro_tutor.create({ data: { organizacion_id: org.organizacionId, registro_id: r.id, posicion: 0, nombre: "A", parentesco: "madre", telefono: tel_, es_responsable_pago: pago } });
  await t("+525500000001", true);
  await assert.rejects(t("+525500000002", true), /Unique|unique/);
  await assert.rejects(t("+525500000001", false), /Unique|unique/);
});
