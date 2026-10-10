// Las reglas de validación de la carga del catálogo (V6), con tablas de casos: cada regla con su fila, su columna y su mensaje. PURO: sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ESQUEMAS, TIPOS, type Tipo } from "./esquemas.ts";
import { leerArchivos, textoDeProblema, type Problema } from "./lectura.ts";
import { EXISTENTE_VACIO, planificar, type Existente, type Op, type Plan } from "./plan.ts";
import { catalogoDeEjemplo, conCelda } from "../../testutil/catalogo-ejemplo.ts";

type Hojas = Partial<Record<Tipo, string[][]>>;

const celdaCsv = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvDe = (filas: string[][]): string => filas.map((f) => f.map(celdaCsv).join(",")).join("\r\n") + "\r\n";

/** Corre lectura + plan con las filas dadas (en el orden de las columnas de cada plantilla; la fila 1 son los encabezados, los datos empiezan en la 2). */
function cargar(hojas: Hojas, existente: Existente = EXISTENTE_VACIO): { plan: Plan; problemas: Problema[]; errores: Problema[] } {
  const archivos = TIPOS.filter((t) => hojas[t]).map((t) => ({ nombre: ESQUEMAS[t].archivo, bytes: Buffer.from(csvDe([ESQUEMAS[t].columnas.map((c) => c.titulo), ...hojas[t]!]), "utf8") }));
  const lectura = leerArchivos(archivos);
  const plan = planificar(lectura.tablas, existente);
  return { plan, problemas: lectura.problemas, errores: [...lectura.problemas, ...plan.errores] };
}

// ── El catálogo base: una disciplina, dos sucursales, todo lo necesario ──────────────────────────
const BASE = (): Required<Hojas> => catalogoDeEjemplo();

/** Un catálogo base con una celda cambiada: `hoja`, fila de DATOS (0 = la primera), columna por su posición. */
const conCambio = (hoja: Tipo, fila: number, columna: number, valor: string): Hojas => conCelda(hoja, fila, columna, valor);

function unico(errores: Problema[]): Problema {
  assert.equal(errores.length, 1, `se esperaba un solo error y salieron ${errores.length}: ${errores.map(textoDeProblema).join(" | ")}`);
  return errores[0]!;
}

function esperar(errores: Problema[], lugar: { archivo: string; fila: number; columna: string }, patron: RegExp): void {
  const hallado = errores.find((e) => e.archivo === lugar.archivo && e.fila === lugar.fila && e.columna === lugar.columna && patron.test(e.mensaje));
  assert.ok(hallado, `no salió un error en ${lugar.archivo} fila ${lugar.fila} columna «${lugar.columna}» con ${patron}; salieron: ${errores.map((e) => `[${e.archivo} f${e.fila} ${e.columna}] ${e.mensaje}`).join(" | ") || "(ninguno)"}`);
}

/** Aplica en memoria las operaciones de CREAR (lo bastante para probar la idempotencia sin base). */
function materializar(ops: readonly Op[]): Existente {
  const ex: Existente = { verticales: [], sucursales: [], ofertas: [], salones: [], instructores: [], programas: [], grupos: [], precios: [] };
  const ids = new Map<string, string>();
  let n = 0;
  const nuevoId = (ref: string): string => {
    const id = `id-${++n}`;
    ids.set(ref, id);
    return id;
  };
  const id = (ref: string): string => ids.get(ref) ?? ref;
  for (const op of ops) {
    if (op.k === "disciplina") ex.verticales.push({ id: nuevoId(op.ref), nombre: op.datos.nombre, slug: op.datos.slug, color: op.datos.color, activo: true });
    else if (op.k === "sucursal") ex.sucursales.push({ id: nuevoId(op.ref), nombre: op.datos.nombre, direccion: op.datos.direccion, zona: op.datos.zona, activo: true });
    else if (op.k === "oferta") ex.ofertas.push({ sucursalId: id(op.sucursalRef), verticalId: id(op.disciplinaRef) });
    else if (op.k === "salon") ex.salones.push({ id: nuevoId(op.ref), sucursalId: id(op.sucursalRef), nombre: op.datos.nombre, capacidad: op.datos.capacidad, activo: true });
    else if (op.k === "instructor") ex.instructores.push({ id: nuevoId(op.ref), nombre: op.datos.nombre, telefono: op.datos.telefono, correo: op.datos.correo, activo: true, sucursalIds: op.sucursalesNuevas.map(id) });
    else if (op.k === "programa") ex.programas.push({ id: nuevoId(op.ref), verticalId: id(op.disciplinaRef), sucursalId: id(op.sucursalRef), nombre: op.datos.nombre, edadMin: op.datos.edadMin, edadMax: op.datos.edadMax, nivel: op.datos.nivel, descripcion: op.datos.descripcion, permiteTraslape: op.datos.permiteTraslape, corte: op.datos.corte, activo: true });
    else if (op.k === "grupo") ex.grupos.push({ id: nuevoId(op.ref), programaId: id(op.programaRef), nombre: op.datos.nombre, salonId: op.datos.salonRef ? id(op.datos.salonRef) : null, instructorId: op.datos.instructorRef ? id(op.datos.instructorRef) : null, cupo: op.datos.cupo, listaEspera: op.datos.listaEspera, activo: true, ocupados: 0, horarios: op.horariosNuevos.map((h) => ({ ...h })) });
    else ex.precios.push({ id: nuevoId(`precio:${n}`), programaId: id(op.programaRef), inscripcion: op.datos.inscripcion, mensualidad: op.datos.mensualidad, desde: op.datos.desde, hasta: op.datos.hasta });
  }
  return ex;
}

test("el catálogo base de ejemplo pasa limpio y crea todo, con las referencias por nombre resueltas", () => {
  const { plan, errores } = cargar(BASE());
  assert.deepEqual(errores.map(textoDeProblema), []);
  const r = plan.resumen;
  assert.deepEqual([r.disciplinas.creados, r.sucursales.creados, r.salones.creados, r.instructores.creados, r.programas.creados, r.grupos.creados, r.horarios.creados, r.precios.creados], [1, 2, 3, 2, 3, 3, 4, 3]);
  assert.equal(r.oferta.creados, 2, "la sucursal «imparte» la disciplina porque tiene un programa: Centro y Norte");
  assert.ok(plan.ops.every((o) => o.k !== "grupo" || o.accion === "crear"));
  // El teléfono sale normalizado (invariante 7).
  const ana = plan.ops.find((o) => o.k === "instructor" && o.datos.nombre === "Ana Pérez");
  assert.equal(ana?.k === "instructor" ? ana.datos.telefono : null, "+525512345678");
  // Dinero en centavos exactos: «900,50» con coma decimal.
  const precios = plan.ops.filter((o): o is Extract<Op, { k: "precio" }> => o.k === "precio").map((o) => [o.datos.inscripcion, o.datos.mensualidad]);
  assert.deepEqual(precios, [[50000n, 80000n], [50000n, 90050n], [50000n, 75000n]]);
  // Cada cambio se cuenta con palabras para la persona.
  assert.ok(plan.cambios.some((c) => /Sucursal nueva: “Centro”/.test(c.descripcion)));
});

test("idempotente: volver a planificar el mismo archivo contra lo ya creado no deja operaciones; todo «sin cambios»", () => {
  const primera = cargar(BASE());
  const existente = materializar(primera.plan.ops);
  const segunda = cargar(BASE(), existente);
  assert.deepEqual(segunda.errores.map(textoDeProblema), []);
  assert.deepEqual(segunda.plan.ops, [], "ni una operación");
  for (const clave of Object.keys(segunda.plan.resumen) as (keyof Plan["resumen"])[]) {
    const c = segunda.plan.resumen[clave];
    assert.equal(c.creados + c.actualizados, 0, clave);
  }
  assert.equal(segunda.plan.resumen.precios.sin_cambios, 3);
  assert.equal(segunda.plan.resumen.horarios.sin_cambios, 4);
  assert.equal(segunda.plan.resumen.grupos.sin_cambios, 3);
});

// ── Una regla, una fila, una columna ─────────────────────────────────────────────────────────────

interface CasoDeError {
  nombre: string;
  hojas: Hojas;
  archivo: string;
  fila: number;
  columna: string;
  mensaje: RegExp;
}

const CASOS: CasoDeError[] = [
  // Disciplinas
  { nombre: "disciplina sin nombre", hojas: conCambio("disciplinas", 0, 0, ""), archivo: "disciplinas.csv", fila: 2, columna: "Disciplina", mensaje: /obligatorio/ },
  { nombre: "color que no es color", hojas: conCambio("disciplinas", 0, 1, "verde"), archivo: "disciplinas.csv", fila: 2, columna: "Color", mensaje: /no es un color/ },
  { nombre: "disciplina repetida en el archivo", hojas: { ...BASE(), disciplinas: [["Disciplina A", ""], ["disciplína  a", ""]] }, archivo: "disciplinas.csv", fila: 3, columna: "Disciplina", mensaje: /ya aparece en la fila 2/ },
  { nombre: "dos disciplinas con el mismo identificador de página", hojas: { ...BASE(), disciplinas: [["Arte Joven", ""], ["Arte  joven!", ""]] }, archivo: "disciplinas.csv", fila: 3, columna: "Disciplina", mensaje: /ya aparece/ },
  // Sucursales
  { nombre: "sucursal sin zona horaria", hojas: conCambio("sucursales", 0, 2, ""), archivo: "sucursales.csv", fila: 2, columna: "Zona horaria", mensaje: /obligatorio/ },
  { nombre: "zona horaria desconocida", hojas: conCambio("sucursales", 1, 2, "Marte"), archivo: "sucursales.csv", fila: 3, columna: "Zona horaria", mensaje: /no es una zona horaria/ },
  { nombre: "nombre de sucursal con barra", hojas: conCambio("sucursales", 0, 0, "Centro/Sur"), archivo: "sucursales.csv", fila: 2, columna: "Sucursal", mensaje: /no puede llevar los signos/ },
  { nombre: "sucursal repetida (otra forma de escribirla)", hojas: { ...BASE(), sucursales: [["Centro", "", "Centro"], ["CENTRO", "", "Centro"]] }, archivo: "sucursales.csv", fila: 3, columna: "Sucursal", mensaje: /ya aparece en la fila 2/ },
  { nombre: "dirección demasiado larga", hojas: conCambio("sucursales", 0, 1, "x".repeat(301)), archivo: "sucursales.csv", fila: 2, columna: "Dirección", mensaje: /demasiado largo/ },
  // Salones
  { nombre: "salón de una sucursal que no existe", hojas: conCambio("salones", 0, 0, "Poniente"), archivo: "salones.csv", fila: 2, columna: "Sucursal", mensaje: /no existe la sucursal “Poniente”.*archivo de sucursales/ },
  { nombre: "capacidad cero", hojas: conCambio("salones", 0, 2, "0"), archivo: "salones.csv", fila: 2, columna: "Capacidad", mensaje: /fuera de rango/ },
  { nombre: "capacidad con letras", hojas: conCambio("salones", 1, 2, "diez"), archivo: "salones.csv", fila: 3, columna: "Capacidad", mensaje: /no es un número entero/ },
  { nombre: "salón repetido en la sucursal", hojas: { ...BASE(), salones: [["Centro", "Sala 1", ""], ["Centro", "sala  1", ""]] }, archivo: "salones.csv", fila: 3, columna: "Salón", mensaje: /ya aparece en la fila 2/ },
  // Instructores
  { nombre: "teléfono inválido", hojas: conCambio("instructores", 0, 1, "12345"), archivo: "instructores.csv", fila: 2, columna: "Teléfono", mensaje: /no es un teléfono válido/ },
  { nombre: "correo inválido", hojas: conCambio("instructores", 0, 2, "ana-arroba"), archivo: "instructores.csv", fila: 2, columna: "Correo", mensaje: /no parece un correo/ },
  { nombre: "instructor en una sucursal que no existe", hojas: conCambio("instructores", 1, 3, "Centro | Lejos"), archivo: "instructores.csv", fila: 3, columna: "Sucursales", mensaje: /no existe la sucursal “Lejos”/ },
  { nombre: "instructor repetido", hojas: { ...BASE(), instructores: [["Ana Pérez", "", "", ""], ["ana  perez", "", "", ""]] }, archivo: "instructores.csv", fila: 3, columna: "Instructor", mensaje: /ya aparece en la fila 2/ },
  // Programas
  { nombre: "programa de una disciplina que no existe", hojas: conCambio("programas", 0, 0, "Otra"), archivo: "programas.csv", fila: 2, columna: "Disciplina", mensaje: /no existe la disciplina “Otra”.*archivo de disciplinas/ },
  { nombre: "programa en una sucursal que no existe", hojas: conCambio("programas", 0, 1, "Lejos"), archivo: "programas.csv", fila: 2, columna: "Sucursal", mensaje: /no existe la sucursal/ },
  { nombre: "edad máxima menor que la mínima", hojas: conCambio("programas", 0, 4, "5"), archivo: "programas.csv", fila: 2, columna: "Edad máxima", mensaje: /no puede ser menor que la mínima/ },
  { nombre: "edad fuera de rango", hojas: conCambio("programas", 0, 4, "120"), archivo: "programas.csv", fila: 2, columna: "Edad máxima", mensaje: /fuera de rango/ },
  { nombre: "edad mínima vacía", hojas: conCambio("programas", 0, 3, ""), archivo: "programas.csv", fila: 2, columna: "Edad mínima", mensaje: /obligatorio/ },
  { nombre: "fecha de corte imposible", hojas: conCambio("programas", 1, 5, "31/02/2026"), archivo: "programas.csv", fila: 3, columna: "Fecha de corte de edad", mensaje: /no es una fecha que exista/ },
  { nombre: "alternativa que no es sí ni no", hojas: conCambio("programas", 0, 8, "quizá"), archivo: "programas.csv", fila: 2, columna: "Alternativa para la misma edad", mensaje: /Escribe Sí o No/ },
  { nombre: "programa repetido en la sucursal", hojas: { ...BASE(), programas: [["Disciplina A", "Centro", "Infantil", "6", "9", "", "", "", ""], ["Disciplina A", "Centro", "infantil", "10", "12", "", "", "", ""]] }, archivo: "programas.csv", fila: 3, columna: "Programa", mensaje: /ya aparece en la fila 2/ },
  { nombre: "traslape de edades entre programas de la misma disciplina y sucursal", hojas: conCambio("programas", 1, 3, "9"), archivo: "programas.csv", fila: 3, columna: "Edad mínima", mensaje: /se traslapan con las del programa “Infantil” \(en la fila 2 de este archivo\)/ },
  { nombre: "traslape: solo uno marcado como alternativa no basta", hojas: { ...BASE(), programas: [["Disciplina A", "Centro", "Infantil", "6", "9", "", "", "", "Sí"], ["Disciplina A", "Centro", "Juvenil", "9", "14", "", "", "", ""]] }, archivo: "programas.csv", fila: 3, columna: "Edad mínima", mensaje: /AMBOS programas/ },
  // Grupos
  { nombre: "grupo de un programa que no existe", hojas: conCambio("grupos", 0, 1, "Veterano"), archivo: "grupos.csv", fila: 2, columna: "Programa", mensaje: /no existe el programa “Veterano” en la sucursal “Centro”.*archivo de programas/ },
  { nombre: "salón que no existe en la sucursal (el mensaje de la escuela)", hojas: conCambio("grupos", 0, 4, "Sala 3"), archivo: "grupos.csv", fila: 2, columna: "Salón", mensaje: /^no existe el salón “Sala 3” en la sucursal “Centro”\. Revisa el nombre o agrégalo en el archivo de salones$/ },
  { nombre: "salón de OTRA sucursal", hojas: conCambio("grupos", 2, 4, "Sala 2"), archivo: "grupos.csv", fila: 4, columna: "Salón", mensaje: /no existe el salón “Sala 2” en la sucursal “Norte”/ },
  { nombre: "instructor que no existe", hojas: conCambio("grupos", 0, 5, "Fulano"), archivo: "grupos.csv", fila: 2, columna: "Instructor", mensaje: /no existe el instructor “Fulano”.*archivo de instructores/ },
  { nombre: "instructor que no da clases en esa sucursal", hojas: conCambio("grupos", 2, 5, "Ana Pérez"), archivo: "grupos.csv", fila: 4, columna: "Instructor", mensaje: /no da clases en la sucursal “Norte”/ },
  { nombre: "cupo cero", hojas: conCambio("grupos", 0, 3, "0"), archivo: "grupos.csv", fila: 2, columna: "Cupo", mensaje: /fuera de rango/ },
  { nombre: "cupo vacío", hojas: conCambio("grupos", 0, 3, ""), archivo: "grupos.csv", fila: 2, columna: "Cupo", mensaje: /obligatorio/ },
  { nombre: "cupo mayor que la capacidad del salón", hojas: conCambio("grupos", 1, 3, "11"), archivo: "grupos.csv", fila: 3, columna: "Cupo", mensaje: /el cupo \(11\) es mayor que la capacidad del salón “Sala 2” \(10\)/ },
  { nombre: "lista de espera que no es sí ni no", hojas: conCambio("grupos", 0, 6, "tal vez"), archivo: "grupos.csv", fila: 2, columna: "Lista de espera", mensaje: /Escribe Sí o No/ },
  { nombre: "grupo repetido en el programa", hojas: { ...BASE(), grupos: [["Centro", "Infantil", "Tarde", "15", "", "", ""], ["Centro", "Infantil", "TARDE", "10", "", "", ""]], horarios: [] }, archivo: "grupos.csv", fila: 3, columna: "Grupo", mensaje: /ya aparece en la fila 2/ },
  // Horarios
  { nombre: "horario de un grupo que no existe", hojas: conCambio("horarios", 0, 2, "Nocturno"), archivo: "horarios.csv", fila: 2, columna: "Grupo", mensaje: /no existe el grupo “Nocturno”.*archivo de grupos/ },
  { nombre: "día que no existe", hojas: conCambio("horarios", 0, 3, "lunez"), archivo: "horarios.csv", fila: 2, columna: "Día", mensaje: /no es un día de la semana/ },
  { nombre: "hora en formato de 12 horas", hojas: conCambio("horarios", 0, 4, "5:00 pm"), archivo: "horarios.csv", fila: 2, columna: "Hora de inicio", mensaje: /formato de 12 horas/ },
  { nombre: "hora de fin igual a la de inicio", hojas: conCambio("horarios", 0, 5, "17:00"), archivo: "horarios.csv", fila: 2, columna: "Hora de fin", mensaje: /debe ser después de la de inicio/ },
  { nombre: "hora de fin antes de la de inicio", hojas: conCambio("horarios", 0, 5, "16:00"), archivo: "horarios.csv", fila: 2, columna: "Hora de fin", mensaje: /debe ser después de la de inicio \(17:00\)/ },
  { nombre: "dos clases del mismo grupo que se cruzan", hojas: { ...BASE(), horarios: [["Centro", "Infantil", "Tarde", "lunes", "17:00", "18:00"], ["Centro", "Infantil", "Tarde", "lunes", "17:30", "18:30"]] }, archivo: "horarios.csv", fila: 3, columna: "Hora de inicio", mensaje: /se cruza con otro del mismo grupo/ },
  { nombre: "el mismo horario dos veces", hojas: { ...BASE(), horarios: [["Centro", "Infantil", "Tarde", "lunes", "17:00", "18:00"], ["Centro", "Infantil", "Tarde", "Lunes", "17:00", "18:00"]] }, archivo: "horarios.csv", fila: 3, columna: "Día", mensaje: /ya aparece en la fila 2/ },
  { nombre: "choque de salón entre dos grupos", hojas: { ...BASE(), grupos: [["Centro", "Infantil", "Tarde", "15", "Sala 1", "", ""], ["Centro", "Juvenil", "Tarde", "8", "Sala 1", "", ""]], horarios: [["Centro", "Infantil", "Tarde", "lunes", "17:00", "18:00"], ["Centro", "Juvenil", "Tarde", "lunes", "17:30", "18:30"]] }, archivo: "horarios.csv", fila: 3, columna: "Hora de inicio", mensaje: /el salón “Sala 1” ya está ocupado con el grupo “Tarde” el lunes de 17:00 a 18:00/ },
  { nombre: "choque de instructor entre dos grupos", hojas: { ...BASE(), grupos: [["Centro", "Infantil", "Tarde", "15", "Sala 1", "Luis Gómez", ""], ["Centro", "Juvenil", "Tarde", "8", "Sala 2", "Luis Gómez", ""]], horarios: [["Centro", "Infantil", "Tarde", "lunes", "17:00", "18:00"], ["Centro", "Juvenil", "Tarde", "lunes", "17:30", "18:30"]] }, archivo: "horarios.csv", fila: 3, columna: "Hora de inicio", mensaje: /“Luis Gómez” ya da otra clase con el grupo/ },
  { nombre: "mismo nombre de grupo en dos programas, sin decir cuál", hojas: { ...BASE(), horarios: [["", "", "Tarde", "lunes", "17:00", "18:00"]] }, archivo: "horarios.csv", fila: 2, columna: "Grupo", mensaje: /hay 2 grupos que se llaman “Tarde”.*Llena las columnas «Programa» y «Sucursal»/ },
  // Precios
  { nombre: "precio de un programa que no existe", hojas: conCambio("precios", 0, 1, "Veterano"), archivo: "precios.csv", fila: 2, columna: "Programa", mensaje: /no existe el programa “Veterano” en la sucursal “Centro”/ },
  { nombre: "mismo nombre de programa en dos sucursales, sin decir cuál", hojas: conCambio("precios", 2, 0, ""), archivo: "precios.csv", fila: 4, columna: "Programa", mensaje: /hay 2 programas que se llaman “Infantil”.*Llena la columna «Sucursal»/ },
  { nombre: "importe negativo", hojas: conCambio("precios", 0, 2, "-500"), archivo: "precios.csv", fila: 2, columna: "Inscripción", mensaje: /es negativo/ },
  { nombre: "importe ambiguo (1.500)", hojas: conCambio("precios", 0, 3, "1.500"), archivo: "precios.csv", fila: 2, columna: "Mensualidad", mensaje: /no se entiende como cantidad de dinero/ },
  { nombre: "importe con letras", hojas: conCambio("precios", 1, 3, "mil"), archivo: "precios.csv", fila: 3, columna: "Mensualidad", mensaje: /no se entiende/ },
  { nombre: "importe vacío", hojas: conCambio("precios", 0, 2, ""), archivo: "precios.csv", fila: 2, columna: "Inscripción", mensaje: /obligatorio/ },
  { nombre: "fecha de vigencia imposible", hojas: conCambio("precios", 0, 4, "30/02/2026"), archivo: "precios.csv", fila: 2, columna: "Vigente desde", mensaje: /no es una fecha que exista/ },
  { nombre: "dos precios del mismo programa con la misma fecha", hojas: { ...BASE(), precios: [["Centro", "Infantil", "500", "800", "01/09/2026"], ["Centro", "Infantil", "600", "900", "1/9/2026"]] }, archivo: "precios.csv", fila: 3, columna: "Vigente desde", mensaje: /ya tiene un precio con esta fecha en la fila 2/ },
];

for (const caso of CASOS) {
  test(`regla: ${caso.nombre}`, () => {
    const { errores } = cargar(caso.hojas);
    esperar(errores, caso, caso.mensaje);
  });
}

test("un error por fila y columna: el texto armado es el que lee la escuela", () => {
  const { errores } = cargar(conCambio("grupos", 0, 4, "Sala 3"));
  const e = unico(errores);
  assert.equal(textoDeProblema(e), "Fila 2, columna “Salón”: no existe el salón “Sala 3” en la sucursal “Centro”. Revisa el nombre o agrégalo en el archivo de salones.");
});

test("TODOS los errores a la vez, no el primero: cada uno con su fila", () => {
  const b = BASE();
  b.salones[0]![2] = "0";
  b.grupos[0]![3] = "abc";
  b.horarios[1]![3] = "festivo";
  b.precios[2]![3] = "-1";
  const { errores } = cargar(b);
  esperar(errores, { archivo: "salones.csv", fila: 2, columna: "Capacidad" }, /fuera de rango/);
  esperar(errores, { archivo: "grupos.csv", fila: 2, columna: "Cupo" }, /no es un número entero/);
  esperar(errores, { archivo: "horarios.csv", fila: 3, columna: "Día" }, /no es un día/);
  esperar(errores, { archivo: "precios.csv", fila: 4, columna: "Mensualidad" }, /negativo/);
  assert.equal(errores.length, 4);
});

test("la fila de ejemplo de la plantilla se ignora; la vacía también; los números de fila siguen siendo los de la hoja", () => {
  const b = BASE();
  b.salones.unshift(["EJEMPLO Sucursal Centro", "EJEMPLO Salón 1", "20"]);
  const { plan, errores } = cargar(b);
  assert.deepEqual(errores, []);
  assert.equal(plan.resumen.salones.creados, 3, "el ejemplo no crea nada");
  const malo = BASE();
  malo.salones.unshift(["EJEMPLO Sucursal Centro", "EJEMPLO Salón 1", "20"]);
  malo.salones[2]![2] = "0";
  esperar(cargar(malo).errores, { archivo: "salones.csv", fila: 4, columna: "Capacidad" }, /fuera de rango/);
});

test("los archivos son opcionales: una carga solo de precios resuelve el programa y la sucursal que YA existen", () => {
  const existente = materializar(cargar(BASE()).plan.ops);
  const { plan, errores } = cargar({ precios: [["Centro", "Infantil", "600", "950", "01/01/2027"]] }, existente);
  assert.deepEqual(errores, []);
  const op = plan.ops.find((o): o is Extract<Op, { k: "precio" }> => o.k === "precio")!;
  assert.equal(op.datos.mensualidad, 95000n);
  assert.equal(op.cerrar?.hasta, "2026-12-31", "el precio anterior termina el día previo");
  assert.equal(plan.ops.length, 1);
});

// ── Contra lo que ya existe ──────────────────────────────────────────────────────────────────────

function conBase(): Existente {
  return materializar(cargar(BASE()).plan.ops);
}

test("actualiza lo que cambió y lo dice; lo que no cambió queda sin cambios; nunca borra lo que falta en el archivo", () => {
  const existente = conBase();
  const b = BASE();
  b.salones = [["Centro", "Sala 1", "25"]]; // capacidad nueva; los otros dos salones NO vienen: se quedan
  b.sucursales = [["Centro", "Calle Nueva 9", "Centro"]];
  b.programas = [["Disciplina A", "Centro", "Infantil", "6", "8", "", "", "", ""]];
  b.grupos = [["Centro", "Infantil", "Tarde", "18", "", "", ""]];
  b.instructores = [["Ana Pérez", "55 9999 0000", "", "Centro | Norte"]];
  const { plan, errores } = cargar({ salones: b.salones, sucursales: b.sucursales, programas: b.programas, grupos: b.grupos, instructores: b.instructores }, existente);
  assert.deepEqual(errores.map(textoDeProblema), []);
  assert.equal(plan.resumen.salones.actualizados, 1);
  assert.equal(plan.resumen.sucursales.actualizados, 1);
  assert.equal(plan.resumen.programas.actualizados, 1);
  assert.equal(plan.resumen.grupos.actualizados, 1);
  assert.equal(plan.resumen.instructores.actualizados, 1);
  assert.ok(plan.ops.every((o) => o.k !== "oferta" && o.accion !== "crear"), "solo actualizaciones");
  const dicen = plan.cambios.map((c) => c.descripcion).join(" | ");
  assert.match(dicen, /Salón “Sala 1” de “Centro”: capacidad 20 → 25/);
  assert.match(dicen, /Programa “Infantil” de “Centro”: edades 6–9 → 6–8/);
  assert.match(dicen, /Grupo “Tarde” \(“Infantil”\): cupo 15 → 18/);
  assert.match(dicen, /Instructor “Ana Pérez”: teléfono; sucursales \(se agrega “Norte”\)/);
  assert.ok(plan.ops.every((o) => o.k !== "grupo" || (o.datos.salonRef !== null && o.datos.instructorRef !== null)), "celdas vacías de salón e instructor NO los borran");
});

test("celda vacía en algo que ya existe: no borra el dato", () => {
  const existente = conBase();
  const { plan } = cargar({ programas: [["Disciplina A", "Centro", "Juvenil", "10", "14", "", "", "", ""]], sucursales: [["Centro", "", "Centro"]] }, existente);
  assert.deepEqual(plan.ops, []);
  assert.equal(plan.resumen.programas.sin_cambios, 1);
  assert.equal(plan.resumen.sucursales.sin_cambios, 1);
});

test("el mismo nombre escrito de otra forma (mayúsculas, acentos, espacios) es la misma cosa: no crea un duplicado", () => {
  const existente = conBase();
  const { plan, errores } = cargar({ sucursales: [["CENTRO", "", "Centro"]], salones: [["centro", "SALA  1", ""]], instructores: [["ana perez", "", "", ""]] }, existente);
  assert.deepEqual(errores, []);
  assert.deepEqual(plan.ops, []);
});

test("un precio nuevo es una versión nueva con vigencia; el mismo día con otros importes se rechaza; uno anterior al vigente también", () => {
  const existente = conBase();
  const mismoPrecio = cargar({ precios: [["Centro", "Infantil", "500", "800", "01/09/2026"]] }, existente);
  assert.deepEqual(mismoPrecio.plan.ops, [], "idéntico: sin cambios");
  const otroImporte = cargar({ precios: [["Centro", "Infantil", "500", "850", "01/09/2026"]] }, existente);
  esperar(otroImporte.errores, { archivo: "precios.csv", fila: 2, columna: "Vigente desde" }, /con otros importes.*debe empezar en una fecha posterior/);
  const anterior = cargar({ precios: [["Centro", "Infantil", "400", "700", "01/01/2026"]] }, existente);
  esperar(anterior.errores, { archivo: "precios.csv", fila: 2, columna: "Vigente desde" }, /un precio nuevo debe empezar después de esa fecha/);
  const nuevo = cargar({ precios: [["Centro", "Infantil", "500", "850", "01/02/2027"]] }, existente);
  assert.deepEqual(nuevo.errores, []);
  const op = nuevo.plan.ops[0];
  assert.ok(op && op.k === "precio" && op.cerrar?.hasta === "2027-01-31" && op.datos.mensualidad === 85000n);
});

test("la historia de precios en cualquier orden da lo mismo: cada uno cierra al anterior", () => {
  const { plan, errores } = cargar({
    ...BASE(),
    precios: [
      ["Centro", "Infantil", "500", "900", "01/01/2027"],
      ["Centro", "Infantil", "500", "800", "01/09/2026"],
      ["Centro", "Infantil", "450", "850", "01/11/2026"],
      ["Centro", "Juvenil", "500", "900", "01/09/2026"],
      ["Norte", "Infantil", "500", "750", "01/09/2026"],
    ],
  });
  assert.deepEqual(errores.map(textoDeProblema), []);
  const precios = plan.ops.filter((o): o is Extract<Op, { k: "precio" }> => o.k === "precio");
  const primero = precios.find((p) => p.datos.desde === "2026-09-01" && p.datos.mensualidad === 80000n)!;
  const segundo = precios.find((p) => p.datos.desde === "2026-11-01")!;
  assert.equal(primero.datos.hasta, "2026-10-31", "el que nace primero ya nace cerrado el día previo al siguiente");
  assert.equal(segundo.datos.hasta, "2026-12-31");
  assert.equal(precios.find((p) => p.datos.desde === "2027-01-01")!.datos.hasta, null, "el último queda abierto");
});

test("una sucursal, disciplina, programa, salón o instructor DESACTIVADOS no reciben datos nuevos: error que dice dónde activarlos", () => {
  const e = conBase();
  e.sucursales[0]!.activo = false;
  esperar(cargar({ salones: [["Centro", "Sala 9", ""]] }, e).errores, { archivo: "salones.csv", fila: 2, columna: "Sucursal" }, /está desactivada.*Administración → Sucursales/);
  const e2 = conBase();
  e2.verticales[0]!.activo = false;
  esperar(cargar({ programas: [["Disciplina A", "Centro", "Nuevo", "1", "2", "", "", "", ""]] }, e2).errores, { archivo: "programas.csv", fila: 2, columna: "Disciplina" }, /está desactivada/);
  const e3 = conBase();
  e3.salones[0]!.activo = false;
  esperar(cargar({ grupos: [["Centro", "Infantil", "Otro", "10", "Sala 1", "", ""]] }, e3).errores, { archivo: "grupos.csv", fila: 2, columna: "Salón" }, /está desactivado/);
  const e4 = conBase();
  e4.programas[0]!.activo = false;
  esperar(cargar({ precios: [["Centro", "Infantil", "1", "1", "01/01/2028"]] }, e4).errores, { archivo: "precios.csv", fila: 2, columna: "Programa" }, /está desactivado/);
});

test("dos cosas ya existentes con casi el mismo nombre: error claro, no se adivina a cuál", () => {
  const e = conBase();
  e.instructores.push({ id: "otro", nombre: "ANA PEREZ", telefono: null, correo: null, activo: true, sucursalIds: [] });
  esperar(cargar({ grupos: [["Centro", "Infantil", "Tarde", "15", "Sala 1", "Ana Pérez", ""]] }, e).errores, { archivo: "grupos.csv", fila: 2, columna: "Instructor" }, /hay 2 instructores que se llaman casi igual/);
  esperar(cargar({ instructores: [["ana perez", "55 1111 2222", "", ""]] }, e).errores, { archivo: "instructores.csv", fila: 2, columna: "Instructor" }, /hay 2 instructores/);
});

test("un programa que ya existe con otra disciplina: la carga no la cambia", () => {
  const e = conBase();
  const { plan, errores } = cargar({ disciplinas: [["Otra Disciplina", ""]], programas: [["Otra Disciplina", "Centro", "Infantil", "6", "9", "", "", "", ""]] }, e);
  assert.equal(plan.resumen.disciplinas.creados, 1);
  esperar(errores, { archivo: "programas.csv", fila: 2, columna: "Disciplina" }, /ya existe con la disciplina “Disciplina A”.*no cambia la disciplina/);
});

test("un traslape que YA existía y el archivo no toca no bloquea; el que el archivo provoca, sí", () => {
  const e = conBase();
  e.programas[1]!.edadMin = 9; // Juvenil 9–14 ya chocaba con Infantil 6–9 antes de esta carga
  const intacto = cargar({ programas: [["Disciplina A", "Centro", "Juvenil", "9", "14", "", "Otro nivel", "", ""]] }, e);
  assert.deepEqual(intacto.errores, [], "se actualiza el nivel; las edades no cambiaron");
  const provoca = cargar({ programas: [["Disciplina A", "Centro", "Infantil", "6", "11", "", "", "", ""]] }, conBase());
  esperar(provoca.errores, { archivo: "programas.csv", fila: 2, columna: "Edad mínima" }, /se traslapan con las del programa “Juvenil” \(que ya existe\)/);
});

test("alternativas: dos programas que comparten edades solo conviven si AMBOS lo dicen", () => {
  const { errores } = cargar({
    ...BASE(),
    programas: [
      ["Disciplina A", "Centro", "Estilo X", "6", "12", "", "", "", "Sí"],
      ["Disciplina A", "Centro", "Estilo Y", "8", "14", "", "", "", "sí"],
      ["Disciplina A", "Norte", "Infantil", "6", "9", "", "", "", ""],
    ],
    grupos: [],
    horarios: [],
    precios: [],
  });
  assert.deepEqual(errores.map(textoDeProblema), []);
});

test("choques contra lo ya existente: solo molesta el que el archivo provoca", () => {
  const e = conBase();
  const choque = cargar({ grupos: [["Centro", "Juvenil", "Tarde", "8", "Sala 1", "", ""]], horarios: [["Centro", "Juvenil", "Tarde", "lunes", "17:30", "18:30"]] }, e);
  esperar(choque.errores, { archivo: "horarios.csv", fila: 2, columna: "Hora de inicio" }, /el salón “Sala 1” ya está ocupado con el grupo “Tarde” el lunes de 17:00 a 18:00/);
  // Cambiar el grupo de salón cuando sus horarios ya chocan en el salón nuevo: el error es del grupo (columna Salón).
  const e2 = conBase();
  e2.grupos[1]!.horarios = [{ dia: 1, inicioMin: 17 * 60 + 30, finMin: 18 * 60 + 30 }];
  const cambio = cargar({ grupos: [["Centro", "Juvenil", "Tarde", "8", "Sala 1", "", ""]] }, e2);
  esperar(cambio.errores, { archivo: "grupos.csv", fila: 2, columna: "Salón" }, /el salón “Sala 1” ya está ocupado/);
  // Un grupo que ya chocaba antes y el archivo no mueve: sin error.
  const e3 = conBase();
  e3.grupos[1]!.salonId = e3.grupos[0]!.salonId;
  e3.grupos[1]!.horarios = [{ dia: 1, inicioMin: 17 * 60, finMin: 18 * 60 }];
  assert.deepEqual(cargar({ grupos: [["Centro", "Juvenil", "Tarde", "9", "", "", ""]] }, e3).errores, []);
});

test("un horario nuevo para un grupo que ya existía lo agrega (no reemplaza los que tiene); el mismo horario no hace nada", () => {
  const e = conBase();
  const { plan, errores } = cargar({ horarios: [["Centro", "Infantil", "Tarde", "viernes", "17:00", "18:00"], ["Centro", "Infantil", "Tarde", "lunes", "17:00", "18:00"]] }, e);
  assert.deepEqual(errores, []);
  assert.equal(plan.resumen.horarios.creados, 1);
  assert.equal(plan.resumen.horarios.sin_cambios, 1);
  const op = plan.ops[0];
  assert.ok(op && op.k === "grupo" && op.accion === "actualizar" && op.horariosNuevos.length === 1 && op.horariosAntes.length === 2);
  // Mismo día y hora de inicio con otra hora de fin: no se edita aquí.
  esperar(cargar({ horarios: [["Centro", "Infantil", "Tarde", "lunes", "17:00", "19:00"]] }, e).errores, { archivo: "horarios.csv", fila: 2, columna: "Hora de fin" }, /aquí solo se agregan horarios/);
});

test("cupo menor que los inscritos: se avisa y no se bloquea (los inscritos no se tocan)", () => {
  const e = conBase();
  e.grupos[0]!.ocupados = 12;
  const { plan, errores } = cargar({ grupos: [["Centro", "Infantil", "Tarde", "10", "", "", ""]] }, e);
  assert.deepEqual(errores, []);
  assert.ok(plan.avisos.some((a) => /ya tiene 12 alumnos inscritos y el cupo nuevo es 10/.test(a.mensaje)));
  assert.equal(plan.resumen.grupos.actualizados, 1);
});

test("avisos útiles que no bloquean: instructor sin teléfono, programa sin precio, programa sin grupos", () => {
  const { plan, errores } = cargar({
    disciplinas: [["Disciplina A", ""]],
    sucursales: [["Centro", "", "Centro"]],
    instructores: [["Sin Teléfono", "", "", ""]],
    programas: [["Disciplina A", "Centro", "Infantil", "6", "9", "", "", "", ""]],
  });
  assert.deepEqual(errores, []);
  const dicen = plan.avisos.map((a) => a.mensaje).join(" | ");
  assert.match(dicen, /a “Sin Teléfono” no le llegarán por WhatsApp/);
  assert.match(dicen, /“Infantil” queda sin precio/);
  assert.match(dicen, /“Infantil” queda sin grupos/);
});

test("archivos que no se entienden: se dice cuál y por qué, sin tocar el resto", () => {
  const raro = leerArchivos([{ nombre: "cosas.csv", bytes: Buffer.from("uno,dos\n1,2\n") }, { nombre: "sucursales.csv", bytes: Buffer.from("Sucursal,Zona horaria\nCentro,Centro\n") }]);
  assert.equal(raro.problemas.length, 1);
  assert.match(raro.problemas[0]!.mensaje, /no se parece a ninguna de las plantillas/);
  assert.ok(raro.tablas.sucursales, "el archivo bueno sí se leyó");
  const sinColumna = leerArchivos([{ nombre: "salones.csv", bytes: Buffer.from("Sucursal,Capacidad\nCentro,10\n") }]);
  assert.match(sinColumna.problemas[0]!.mensaje, /se parece a la plantilla de salones.*le falta la columna «Salón»/);
  const repetido = leerArchivos([
    { nombre: "a.csv", bytes: Buffer.from("Sucursal,Zona horaria\nCentro,Centro\n") },
    { nombre: "b.csv", bytes: Buffer.from("Sucursal,Zona horaria\nNorte,Centro\n") },
  ]);
  assert.match(repetido.problemas[0]!.mensaje, /ya se subió otro archivo de sucursales/);
  const vacio = leerArchivos([{ nombre: "x.csv", bytes: Buffer.from("") }]);
  assert.match(vacio.problemas[0]!.mensaje, /está vacío/);
  const comillas = leerArchivos([{ nombre: "x.csv", bytes: Buffer.from('Sucursal,Zona horaria\n"Centro,Centro\n') }]);
  assert.match(comillas.problemas[0]!.mensaje, /comillas/);
});

test("los encabezados se reconocen sin importar mayúsculas, acentos ni orden; las columnas extra se ignoran con un aviso", () => {
  const csv = "zona HORARIA;extra;SUCURSAL;direccion\nCentro;x;Mi sucursal;Calle 1\n";
  const l = leerArchivos([{ nombre: "lo-que-sea.csv", bytes: Buffer.from(csv) }]);
  assert.deepEqual(l.problemas, []);
  assert.equal(l.tablas.sucursales?.filas[0]?.v["nombre"], "Mi sucursal");
  assert.equal(l.tablas.sucursales?.filas[0]?.v["zona"], "Centro");
  assert.equal(l.avisos.length, 1);
  assert.match(l.avisos[0]!.mensaje, /no es de la plantilla y se ignoró/);
});

// ── V13-fix EV-33: lo que el importador ignoraba en silencio ahora se avisa con su fila ───────────────────────

function leerCrudo(tipo: Tipo, filas: string[][]) {
  const bytes = Buffer.from(csvDe(filas), "utf8");
  return leerArchivos([{ nombre: ESQUEMAS[tipo].archivo, bytes }]);
}

test("EV-33: una columna con el encabezado REPETIDO se usa la primera vez y la repetida se avisa (antes se ignoraba sin decir nada)", () => {
  const titulos = ESQUEMAS.salones.columnas.map((c) => c.titulo);
  const l = leerCrudo("salones", [[...titulos, titulos[2]!], ["Centro", "Salón 1", "20", "99"]]);
  assert.deepEqual(l.problemas, []);
  const aviso = l.avisos.find((a) => /repetida/.test(a.mensaje));
  assert.ok(aviso, `salieron: ${l.avisos.map(textoDeProblema).join(" | ")}`);
  assert.equal(aviso.fila, 1);
  assert.equal(aviso.columna, titulos[2]);
  assert.equal(l.tablas.salones!.filas[0]!.v["capacidad"], "20", "manda la primera");
});

test("EV-33: celdas con datos DESPUÉS de la última columna (una coma de más) se avisan por fila; las vacías no", () => {
  const titulos = ESQUEMAS.salones.columnas.map((c) => c.titulo);
  const l = leerCrudo("salones", [titulos, ["Centro", "Salón 1", "20", "sobra", "otra"], ["Centro", "Salón 2", "15"], ["Centro", "Salón 3", "10", "", ""], ["Centro", "Salón 4", "12", "x"]]);
  const sobrantes = l.avisos.filter((a) => /con datos de más/.test(a.mensaje));
  assert.deepEqual(sobrantes.map((a) => a.fila), [2, 5]);
  assert.match(sobrantes[0]!.mensaje, /^trae 2 celdas con datos de más/);
  assert.match(sobrantes[1]!.mensaje, /^trae 1 celda con datos de más/);
  assert.equal(l.tablas.salones!.filas.length, 4, "las filas se leen igual");
});

test("EV-33: la fila de ejemplo ignorada dice cuál era, para que quien tenía una fila real que empieza con «Ejemplo» lo note", () => {
  const titulos = ESQUEMAS.salones.columnas.map((c) => c.titulo);
  const l = leerCrudo("salones", [titulos, ["Ejemplo Escuela del Norte", "Salón 1", "20"], ["Centro", "Salón 2", "15"]]);
  const aviso = l.avisos.find((a) => /fila de ejemplo/.test(a.mensaje))!;
  assert.equal(aviso.fila, 2);
  assert.match(aviso.mensaje, /«Ejemplo Escuela del Norte»/);
  assert.match(aviso.mensaje, /no empiece con «Ejemplo»/);
  assert.equal(l.tablas.salones!.filas.length, 1);
});
