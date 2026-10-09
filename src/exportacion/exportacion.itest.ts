// I5: exportación a CSV de los reportes y de las listas clave — descarga con Content-Disposition, BOM UTF-8, escape correcto, protección contra inyección de fórmulas, dinero exacto como
// texto decimal, y los MISMOS permisos y alcance que la lista en pantalla.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { ClienteApi } from "../testutil/api.ts";
import { deTexto } from "../lib/dinero.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Exportación");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

interface Descarga {
  estado: number;
  tipo: string;
  disposicion: string;
  texto: string;
}
/** Una descarga cruda (no JSON): el cuerpo como texto CONSERVANDO el BOM, y sus cabeceras. */
async function bajar(cliente: ClienteApi, ruta: string): Promise<Descarga> {
  const r = await cliente.descargar(ruta);
  const crudo = new TextDecoder("utf-8", { ignoreBOM: true }).decode(r.bytes);
  return { estado: r.estado, tipo: r.cabeceras.get("content-type") ?? "", disposicion: r.cabeceras.get("content-disposition") ?? "", texto: r.estado === 200 ? crudo : "" };
}
/** Un lector mínimo de CSV (RFC 4180) para comprobar la ida y vuelta. */
function leerCsv(texto: string): string[][] {
  const sinBom = texto.replace(/^\uFEFF/, "");
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < sinBom.length; i++) {
    const c = sinBom[i]!;
    if (comillas) {
      if (c === '"') {
        if (sinBom[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\r") {
      // se consume con el \n
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}
const esDescargaCsv = (d: Descarga): void => {
  assert.equal(d.estado, 200);
  assert.match(d.tipo, /^text\/csv; charset=utf-8/);
  assert.match(d.disposicion, /^attachment; filename="[A-Za-z0-9._-]+\.csv"; filename\*=UTF-8''[A-Za-z0-9._%-]+\.csv$/);
  assert.ok(!/[\r\n]/.test(d.disposicion), "ningún salto de línea en la cabecera");
  assert.equal(d.texto.charCodeAt(0), 0xfeff, "BOM UTF-8 para que Excel abra los acentos");
  assert.ok(d.texto.endsWith("\r\n"));
};

test("estado de cuenta: una fila por cargo con el dinero EXACTO como texto, una fila de TOTAL, nombres con comas y acentos bien escapados y las fórmulas neutralizadas", async () => {
  const { grupoId } = await m.programa({ mensualidad: "1234.50", inscripcion: "499.99" });
  const a1 = await m.alumno();
  const a2 = await m.alumno({ conTutor: a1.tutorId });
  await prisma.alumno.update({ where: { id: a1.alumnoId }, data: { nombre: "José, el Ñandú", apellidos: '=HYPERLINK("http://malo","clic")' } });
  await prisma.alumno.update({ where: { id: a2.alumnoId }, data: { nombre: "Ana", apellidos: "@SUMA(1+1)" } });
  await prisma.tutor.update({ where: { id: a1.tutorId }, data: { nombre: "+5255 Tutor", apellidos: "-2+3" } });
  await m.inscribir({ alumno: a1, grupoId, diaCorte: 5 });
  await m.inscribir({ alumno: a2, grupoId, diaCorte: 5 });
  assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: a1.tutorId, monto: "1000.25", metodo: "efectivo" })).estado, 201);
  const d = await bajar(m.recepcion, `/api/exportaciones/estado-cuenta?tutor_id=${a1.tutorId}`);
  esDescargaCsv(d);
  assert.match(d.disposicion, /filename="estado-de-cuenta--5255-Tutor--2-3\.csv"/, "el nombre del archivo es seguro (sin símbolos ni acentos)");
  const filas = leerCsv(d.texto);
  assert.deepEqual(filas[0], ["Hijo", "Concepto", "Periodo", "Descripción", "Vencimiento", "Monto final", "Pagado", "Saldo", "Estatus", "Días de atraso"]);
  assert.equal(filas.length, 1 + 4 + 1, "encabezado, 2 cargos por hijo y el total");
  const total = filas.at(-1)!;
  assert.deepEqual([total[0], total[5], total[6], total[7]], ["TOTAL", "3468.98", "1000.25", "2468.73"], "(499.99 + 1234.50) × 2 = 3468.98");
  // Cada celda de texto que empieza como fórmula lleva el apóstrofo.
  const hijo1 = filas.find((f) => f[0]?.includes("Ñandú"));
  assert.ok(hijo1![0]!.startsWith("José, el Ñandú "), "la coma y la ñ sobreviven al escape");
  for (const fila of filas.slice(1)) for (const celda of fila) assert.ok(!/^[=+\-@\t\r]/.test(celda) || /^-?\d+(\.\d{1,2})?$/.test(celda), `celda peligrosa sin neutralizar: ${JSON.stringify(celda)}`);
  // Ida y vuelta con el JSON del estado de cuenta: mismo saldo.
  const json = (await m.recepcion.get<{ resumen: { saldo: string } }>(`/api/tutores/${a1.tutorId}/estado-cuenta`)).cuerpo;
  assert.equal(deTexto(total[7]!), deTexto(json.resumen.saldo));
  // El dinero no tiene símbolo ni separador de miles ni notación científica.
  assert.ok(filas.slice(1).every((f) => [5, 6, 7].every((i) => /^-?\d+\.\d{2}$/.test(f[i]!))));
  // Permisos y alcance: el mismo del estado de cuenta en pantalla.
  assert.equal((await bajar(m.maestro, `/api/exportaciones/estado-cuenta?tutor_id=${a1.tutorId}`)).estado, 403);
  assert.equal((await bajar(m.asesorNorte, `/api/exportaciones/estado-cuenta?tutor_id=${a1.tutorId}`)).estado, 200);
  assert.equal((await bajar(m.asesorSur, `/api/exportaciones/estado-cuenta?tutor_id=${a1.tutorId}`)).estado, 404);
  assert.equal((await bajar(m.recepcion, `/api/exportaciones/estado-cuenta?tutor_id=${randomUUID()}`)).estado, 404);
  assert.equal((await bajar(m.recepcion, "/api/exportaciones/estado-cuenta")).estado, 400);
  assert.equal((await bajar(m.api.cliente(), `/api/exportaciones/estado-cuenta?tutor_id=${a1.tutorId}`)).estado, 401);
  const otro = await mundoDeFinanzas(prisma, "Exportación ajena");
  try {
    assert.equal((await bajar(otro.admin, `/api/exportaciones/estado-cuenta?tutor_id=${a1.tutorId}`)).estado, 404);
  } finally {
    await otro.cerrar();
  }
});

test("uniformes por entregar: lo liberado, con la talla y el responsable, solo para quien puede verlo", async () => {
  const p = await prisma.promocion.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Uniforme", codigo: `U${randomUUID().slice(0, 8)}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", acumulable: true, prioridad: 5 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: m.org.organizacionId, promocion_id: p.id, tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Uniforme" } });
  try {
    const i = await m.inscribir();
    await prisma.alumno.update({ where: { id: i.alumnoId }, data: { talla_uniforme: "M", nombre: "Mateo" } });
    assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: i.tutorId, monto: "1500.00", metodo: "efectivo" })).estado, 201);
    const d = await bajar(m.recepcion, "/api/exportaciones/uniformes-por-entregar");
    esDescargaCsv(d);
    const filas = leerCsv(d.texto);
    assert.deepEqual(filas[0], ["Alumno", "Talla", "Grupo", "Responsable de pago", "Teléfono", "Promoción", "Beneficio", "Liberado"]);
    const mia = filas.find((f) => f[0]?.startsWith("Mateo"));
    assert.ok(mia);
    assert.equal(mia![1], "M");
    assert.equal(mia![6], "Uniforme");
    assert.ok(mia![4]!.startsWith("'+52"), "un teléfono empieza con «+»: se neutraliza para que Excel no lo lea como fórmula");
    assert.equal((await bajar(m.maestro, "/api/exportaciones/uniformes-por-entregar")).estado, 403);
    const sur = leerCsv((await bajar(m.asesorSur, "/api/exportaciones/uniformes-por-entregar")).texto);
    assert.ok(!sur.some((f) => f[0]?.startsWith("Mateo")), "otra sucursal no lo descarga");
  } finally {
    await prisma.promocion.update({ where: { id: p.id }, data: { activo: false } });
  }
});

let contadorDeTelefonos = 0;
test("leads: respeta la sucursal del asesor, neutraliza un nombre que es una fórmula y trae la fuente", async () => {
  const lead = async (sucursal: string, nombre: string) => (await prisma.lead.create({ data: { organizacion_id: m.org.organizacionId, vertical_interes_id: m.org.verticalId, sucursal_interes_id: sucursal, etapa_id: m.org.etapaInicialId, telefono: `+5255${String(10_000_000 + (++contadorDeTelefonos))}`, nombre_contacto: nombre, atribucion: { fuente: "landing" } } })).id;
  await lead(m.norte, '=cmd|"/C calc"!A0');
  await lead(m.sur, "Del Sur");
  const norte = await bajar(m.asesorNorte, "/api/exportaciones/leads");
  esDescargaCsv(norte);
  const filas = leerCsv(norte.texto);
  assert.deepEqual(filas[0], ["Fecha", "Contacto", "Teléfono", "Vertical", "Sucursal", "Etapa", "Campaña", "Fuente"]);
  assert.ok(filas.some((f) => f[1]?.startsWith("'=cmd")), "la fórmula quedó como texto");
  assert.ok(!filas.some((f) => f[1] === "Del Sur"), "el asesor del norte no descarga el sur");
  assert.ok(filas.slice(1).every((f) => f[7] === "landing" || f[7] === "directo"));
  assert.ok(leerCsv((await bajar(m.admin, "/api/exportaciones/leads")).texto).some((f) => f[1] === "Del Sur"));
  assert.equal((await bajar(m.maestro, "/api/exportaciones/leads")).estado, 403);
});

test("leads, descarga GRANDE: más de un lote, sin repetir ni perder filas, en el orden de la lista (más recientes primero), y una sucursal fuera del alcance no da filas", async () => {
  const antes = await prisma.lead.count({ where: { organizacion_id: m.org.organizacionId } });
  const base = Date.parse("2026-01-01T12:00:00Z");
  await prisma.lead.createMany({
    data: Array.from({ length: 1_100 }, (_, i) => ({
      organizacion_id: m.org.organizacionId,
      vertical_interes_id: m.org.verticalId,
      sucursal_interes_id: i % 2 === 0 ? m.norte : m.sur,
      etapa_id: m.org.etapaInicialId,
      telefono: `+5255${String(40_000_000 + i)}`,
      nombre_contacto: `Masivo ${String(i).padStart(4, "0")}`,
      // Fechas repetidas a propósito (de a 10): el cursor debe desempatar por id.
      creado_en: new Date(base + Math.floor(i / 10) * 60_000),
    })),
  });
  const d = await bajar(m.admin, "/api/exportaciones/leads");
  esDescargaCsv(d);
  const filas = leerCsv(d.texto).slice(1);
  assert.equal(filas.length, antes + 1_100, "todos los leads, ni uno más ni uno menos");
  const masivos = filas.filter((f) => f[1]?.startsWith("Masivo "));
  assert.equal(masivos.length, 1_100);
  assert.equal(new Set(masivos.map((f) => f[1])).size, 1_100, "ninguno repetido entre lotes");
  const fechas = filas.map((f) => f[0]!);
  assert.deepEqual(fechas, [...fechas].sort().reverse(), "más recientes primero, también al cruzar de un lote al siguiente");
  // El asesor del norte baja solo los suyos; pedir la sucursal del sur no le da nada.
  const norte = leerCsv((await bajar(m.asesorNorte, "/api/exportaciones/leads")).texto).slice(1);
  assert.ok(norte.length >= 550 && norte.every((f) => f[4] === "Norte"));
  assert.equal(leerCsv((await bajar(m.asesorNorte, `/api/exportaciones/leads?sucursal_id=${m.sur}`)).texto).length, 1, "solo el encabezado: no se descarga lo de otra sucursal");
});

test("los reportes se descargan con ?formato=csv (los mismos permisos que el JSON) y el dinero y los porcentajes salen exactos", async () => {
  const clases = await bajar(m.asesorNorte, "/api/reportes/clases-muestra?formato=csv");
  esDescargaCsv(clases);
  assert.deepEqual(leerCsv(clases.texto)[0], ["Dimensión", "Nombre", "Agendadas", "Asistidas", "No asistidas", "Canceladas", "Pendientes", "Inscritas", "Conversión (%)"]);
  assert.equal((await bajar(m.recepcion, "/api/reportes/clases-muestra?formato=csv")).estado, 403);
  const costo = await bajar(m.admin, "/api/reportes/costo-por-alumno?formato=csv");
  esDescargaCsv(costo);
  assert.deepEqual(leerCsv(costo.texto)[0], ["Campaña", "Origen", "Gasto", "Leads", "Clases muestra", "Clases asistidas", "Inscripciones activas", "Costo por lead", "Costo por clase muestra", "Costo por alumno inscrito"]);
  assert.equal((await bajar(m.asesorNorte, "/api/reportes/costo-por-alumno?formato=csv")).estado, 403);
  const resumen = await bajar(m.admin, "/api/reportes/ejecutivo?formato=csv&mes=2026-11");
  esDescargaCsv(resumen);
  const indicadores = leerCsv(resumen.texto);
  assert.deepEqual(indicadores[0], ["Indicador", "Valor"]);
  assert.deepEqual(indicadores.find((f) => f[0] === "Mes"), ["Mes", "2026-11"]);
  assert.ok(indicadores.some((f) => f[0] === "Cartera vencida" && /^\d+\.\d{2}$/.test(f[1]!)), "el dinero sale como texto decimal exacto");
  assert.ok(indicadores.some((f) => f[0] === "Deserción del mes (%)"));
  const activos = await bajar(m.admin, "/api/reportes/ejecutivo?formato=csv&seccion=activos");
  esDescargaCsv(activos);
  assert.deepEqual(leerCsv(activos.texto)[0], ["Vertical", "Sucursal", "Alumnos activos", "Inscripciones activas", "Ingreso mensual recurrente"]);
  const delAsesor = leerCsv((await bajar(m.asesorNorte, "/api/reportes/ejecutivo?formato=csv&seccion=activos")).texto).slice(1);
  assert.ok(delAsesor.every((f) => f[1] === "Norte"), "el asesor descarga solo lo de su sucursal");
  const ocupacion = await bajar(m.admin, "/api/reportes/ejecutivo?formato=csv&seccion=ocupacion");
  esDescargaCsv(ocupacion);
  assert.deepEqual(leerCsv(ocupacion.texto)[0], ["Grupo", "Programa", "Vertical", "Sucursal", "Ocupados", "Cupo máximo", "Ocupación (%)", "Estado"]);
  assert.equal((await bajar(m.recepcion, "/api/reportes/ejecutivo?formato=csv")).estado, 403);
  assert.equal((await bajar(m.maestro, "/api/reportes/ejecutivo?formato=csv")).estado, 403);
  assert.equal((await bajar(m.admin, "/api/reportes/ejecutivo?formato=csv&seccion=otra")).estado, 400);
  // Sin formato sigue siendo JSON.
  assert.equal((await m.admin.pedir("GET", "/api/reportes/costo-por-alumno")).cabeceras.get("content-type")?.startsWith("application/json"), true);
  assert.equal((await bajar(m.admin, "/api/reportes/costo-por-alumno?formato=xls")).estado, 400);
});
