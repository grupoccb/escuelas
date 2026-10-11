import assert from "node:assert/strict";
import { test } from "node:test";
import { adultosDeLaFamilia, avisosDePromocion, contarCargosVencidos, banderasDelHijo, etiquetasDeHijos, filasDeMensajes, lineaDeInscripcion, saldoEnPalabras, sucursalesDeLaFamilia, textoDeCargosVencidos, textoDeConteoDeFamilias, textoDeEdad, textoDeFamiliaDesde, type InscripcionDelHijo, type ResumenDeFamilia } from "./resumen-de-familia.ts";
import type { VinculoDeAlumno } from "./tipos.ts";

const insc = (id: string, disciplina: string, color: string | null, grupo: string, sucursal: string, extra: Partial<InscripcionDelHijo> = {}): InscripcionDelHijo => ({
  inscripcion_id: id,
  grupo: { id: `g-${id}`, nombre: grupo },
  programa: { id: `p-${id}`, nombre: "Programa" },
  disciplina: { id: `d-${disciplina}`, nombre: disciplina, color_marca: color },
  sucursal: { id: `s-${sucursal}`, nombre: sucursal },
  horarios: [{ dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 }, { dia_semana: 3, hora_inicio_min: 960, hora_fin_min: 1020 }],
  promocion: null,
  descuento_mensualidad: "0.00",
  meses_gratis: 0,
  ...extra,
});

const resumen: ResumenDeFamilia = {
  tutor_id: "t1",
  saldo: { estado: "con_vencido", cargos_vencidos: 1, vencido: "650.00" },
  hijos: [
    { alumno_id: "a1", inscripciones: [insc("i1", "Disciplina Uno", "#c0502d", "Infantil", "Sucursal A"), insc("i2", "Disciplina Dos", "#2c8c80", "Grupo B", "Sucursal B")] },
    { alumno_id: "a2", inscripciones: [] },
  ],
};

test("el conteo de familias del subtítulo, con y sin búsqueda", () => {
  assert.equal(textoDeConteoDeFamilias(248, false), "248 familias");
  assert.equal(textoDeConteoDeFamilias(1, false), "1 familia");
  assert.equal(textoDeConteoDeFamilias(3, true), "3 familias encontradas");
  assert.equal(textoDeConteoDeFamilias(1, true), "1 familia encontrada");
  assert.equal(textoDeConteoDeFamilias(0, true), "Ninguna familia coincide");
  assert.equal(textoDeConteoDeFamilias(0, false), "Todavía no hay familias");
});

test("el estado de la cuenta se dice con palabras y un tono", () => {
  assert.deepEqual(saldoEnPalabras("con_vencido"), { texto: "Con vencido", tono: "alerta" });
  assert.deepEqual(saldoEnPalabras("por_pagar"), { texto: "Por pagar", tono: "neutro" });
  assert.deepEqual(saldoEnPalabras("al_corriente"), { texto: "Al corriente", tono: "exito" });
});

test("una etiqueta por hijo y disciplina; sin inscripción o sin resumen, neutra con solo el nombre; baja y congelado se dicen", () => {
  const alumnos = [
    { alumno_id: "a1", nombre: "Santino", estatus: "activo" },
    { alumno_id: "a2", nombre: "Valentina", estatus: "baja" },
  ];
  const e = etiquetasDeHijos(alumnos, resumen);
  assert.deepEqual(e.map((x) => [x.nombre, x.disciplina, x.color, x.nota]), [["Santino", "Disciplina Uno", "#c0502d", null], ["Santino", "Disciplina Dos", "#2c8c80", null], ["Valentina", null, null, "baja"]]);
  assert.equal(new Set(e.map((x) => x.clave)).size, 3, "claves únicas");
  assert.deepEqual(etiquetasDeHijos(alumnos, undefined).map((x) => [x.nombre, x.color]), [["Santino", null], ["Valentina", null]]);
  assert.equal(etiquetasDeHijos([{ alumno_id: "a3", nombre: "Ana", estatus: "congelado" }], resumen)[0]!.nota, "congelado");
});

test("las sucursales de la familia salen de las inscripciones de sus hijos; sin ellas, la de alta", () => {
  assert.equal(sucursalesDeLaFamilia(resumen, "Sucursal C"), "Sucursal A · Sucursal B");
  assert.equal(sucursalesDeLaFamilia(undefined, "Sucursal A"), "Sucursal A");
  assert.equal(sucursalesDeLaFamilia(undefined, null), "");
});

test("la edad se dice en años", () => {
  assert.equal(textoDeEdad(4), "4 años");
  assert.equal(textoDeEdad(1), "1 año");
  assert.equal(textoDeEdad(null), null);
});

const vin = (tutor_id: string, nombre: string, extra: Partial<VinculoDeAlumno> = {}): VinculoDeAlumno => ({ tutor_id, nombre, apellidos: "Vivanco", parentesco: "madre", es_responsable_pago: false, es_contacto_urgencia: false, puede_recoger: false, lo_lleva: false, telefono: "+525599010009", correo: null, ...extra });

test("las banderas del hijo dicen por nombre quién paga, quién recoge y quién lo lleva", () => {
  assert.deepEqual(banderasDelHijo([vin("t1", "Marisol", { es_responsable_pago: true, puede_recoger: true }), vin("t2", "Rodrigo", { puede_recoger: true })]), ["Marisol paga", "Recogen Marisol y Rodrigo"]);
  assert.deepEqual(banderasDelHijo([vin("t1", "Marisol Ana", { es_responsable_pago: true, puede_recoger: true, lo_lleva: true })]), ["Marisol paga", "Recoge Marisol", "Lo lleva Marisol"]);
  assert.deepEqual(banderasDelHijo([vin("t1", "A", { puede_recoger: true }), vin("t2", "B", { puede_recoger: true }), vin("t3", "C", { puede_recoger: true })]), ["Recogen A, B y C"]);
  assert.deepEqual(banderasDelHijo([vin("t1", "Marisol")]), []);
});

test("los adultos de la familia: cada tutor una vez, el de la ficha primero, con sus banderas por hijo", () => {
  const alumnos = [
    { id: "a1", nombre: "Santino", tutores: [vin("t1", "Marisol", { es_responsable_pago: true, es_contacto_urgencia: true, puede_recoger: true }), vin("t2", "Rodrigo", { parentesco: "padre", puede_recoger: true, lo_lleva: true })] },
    { id: "a2", nombre: "Valentina", tutores: [vin("t1", "Marisol", { es_responsable_pago: true, puede_recoger: true }), vin("t2", "Rodrigo", { parentesco: "padre" })] },
  ];
  const a = adultosDeLaFamilia(alumnos, "t2");
  assert.deepEqual(a.map((x) => x.nombre), ["Rodrigo Vivanco", "Marisol Vivanco"], "el de la ficha primero");
  assert.deepEqual(a[0]!.banderas, ["Recoge a Santino", "Lo lleva a Santino"]);
  assert.deepEqual(a[1]!.banderas, ["Responsable de pago", "Contacto de urgencia", "Recoge a Santino y Valentina"]);
  assert.equal(a[0]!.parentesco, "Padre");
  assert.equal(a[1]!.telefono, "+525599010009");
});

test("la línea de una inscripción: disciplina y grupo, horario y sucursal, sin repetir la disciplina si el grupo ya la trae", () => {
  assert.equal(lineaDeInscripcion(insc("i1", "Disciplina Uno", null, "Infantil 3-5", "Sucursal A")), "Disciplina Uno Infantil 3-5 · Lun y Mié 4:00 pm · Sucursal A");
  assert.equal(lineaDeInscripcion(insc("i1", "Disciplina Uno", null, "Disciplina Uno Infantil", "Sucursal A")), "Disciplina Uno Infantil · Lun y Mié 4:00 pm · Sucursal A");
  assert.equal(lineaDeInscripcion({ ...insc("i1", "D", null, "G", "Sucursal A"), horarios: [] }), "D G · Sucursal A");
});

test("los avisos de promoción dicen el descuento y los meses gratis, una vez por promoción e hijo", () => {
  const conPromo: ResumenDeFamilia = {
    ...resumen,
    hijos: [
      { alumno_id: "a1", inscripciones: [insc("i1", "D", null, "G", "N", { promocion: { id: "p1", nombre: "Hermanos" }, descuento_mensualidad: "100.00" }), insc("i2", "E", null, "G", "N", { promocion: { id: "p1", nombre: "Hermanos" }, descuento_mensualidad: "100.00" })] },
      { alumno_id: "a2", inscripciones: [insc("i3", "D", null, "G", "N", { promocion: { id: "p2", nombre: "Verano" }, meses_gratis: 1 }), insc("i4", "D", null, "G", "N", { promocion: { id: "p3", nombre: "Otra" } })] },
    ],
  };
  const hijos = [{ alumno_id: "a1", nombre: "Santino" }, { alumno_id: "a2", nombre: "Valentina" }];
  assert.deepEqual(avisosDePromocion(hijos, conPromo), ["Promoción «Hermanos» activa: $100.00 menos al mes para Santino.", "Promoción «Verano» activa: 1 mes gratis para Valentina.", "Promoción «Otra» activa en la inscripción de Valentina."]);
  assert.deepEqual(avisosDePromocion(hijos, resumen), []);
  assert.deepEqual(avisosDePromocion(hijos, undefined), []);
});

test("«familia desde marzo 2026» y los cargos vencidos en singular y plural", () => {
  assert.equal(textoDeFamiliaDesde("2026-03-15T12:00:00"), "familia desde marzo 2026");
  assert.equal(textoDeFamiliaDesde("no es una fecha"), null);
  assert.equal(textoDeCargosVencidos(1), "1 cargo vencido");
  assert.equal(textoDeCargosVencidos(3), "3 cargos vencidos");
  const cargo = (saldo: string, estatus_efectivo: string) => ({ saldo, estatus_efectivo });
  assert.equal(contarCargosVencidos([{ cargos: [cargo("650.00", "vencido"), cargo("0.00", "vencido"), cargo("100.00", "pendiente")] }, { cargos: [cargo("0.01", "vencido")] }]), 2);
  assert.equal(contarCargosVencidos([]), 0);
});

test("las filas de «Mensajes»: sin cobranza no hay recordatorio; lo que no existe se dice tal cual", () => {
  const m = { promociones: "acepta" as const, recordatorio_de_pago: "2026-09-15", asesor: "Daniela Ortiz", conversacion: null };
  assert.deepEqual(filasDeMensajes(m, { hoy: "2026-10-11", conCobranza: true }), [
    { etiqueta: "Recordatorio de pago", valor: "Salió el 15 de septiembre" },
    { etiqueta: "Marketing", valor: "Acepta promociones" },
    { etiqueta: "Asesor", valor: "Daniela Ortiz" },
  ]);
  const vacio = { promociones: "sin_registro" as const, recordatorio_de_pago: null, asesor: null, conversacion: null };
  assert.deepEqual(filasDeMensajes(vacio, { hoy: "2026-10-11", conCobranza: true }).map((f) => f.valor), ["Todavía no ha salido ninguno", "Sin registro de consentimiento", "Sin asesor asignado"]);
  assert.deepEqual(filasDeMensajes({ ...vacio, promociones: "no_acepta" }, { hoy: "2026-10-11", conCobranza: false }).map((f) => f.valor), ["No acepta promociones", "Sin asesor asignado"]);
});
