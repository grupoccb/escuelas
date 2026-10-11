import assert from "node:assert/strict";
import { test } from "node:test";
import type { Etapa } from "../../api/tipos.ts";
import { haceTexto, lineaDeTiempo, textoDeMotivo, type Historial } from "./historial-lead.ts";

const e = (id: string, nombre: string, tipo: string | null, extra: Partial<Etapa> = {}): Etapa => ({ id, nombre, orden: 1, tipo_sistema: tipo, es_ganado: false, es_perdido: false, dias_alerta_sin_movimiento: null, ...extra });
const ETAPAS = [e("n", "Nueva", "nuevo"), e("c", "Contacto", "contactado"), e("i", "Cerrada con alta", "inscrito", { es_ganado: true }), e("p", "Descartada", "perdido", { es_perdido: true })];

type Cambio = Historial["cambios"][number];
const cambio = (id: string, desde: string | null, hacia: string, creado_en: string, extra: Partial<Cambio> = {}): Cambio => ({
  id,
  a_mano: false,
  desde: desde === null ? null : { id: desde, nombre: ETAPAS.find((x) => x.id === desde)?.nombre ?? null },
  hacia: { id: hacia, nombre: ETAPAS.find((x) => x.id === hacia)?.nombre ?? null },
  origen: "usuario",
  usuario: { id: "u", nombre: "Adela" },
  motivo: "cambio_manual",
  motivo_perdida: null,
  nota: null,
  es_recuperacion: false,
  creado_en,
  ...extra,
});
const historial = (cambios: Cambio[], inscripciones: Historial["inscripciones"] = []): Historial => ({ etapa_actual: "n", inscrito_a_mano: null, inscripciones, cambios });

test("la línea de tiempo pone lo más reciente primero y dice qué pasó en cada punto", () => {
  const h = historial([cambio("1", null, "n", "2026-10-01T10:00:00Z", { origen: "sistema", usuario: null }), cambio("2", "n", "c", "2026-10-02T10:00:00Z", { nota: "Ya contestó" }), cambio("3", "c", "p", "2026-10-03T10:00:00Z", { motivo_perdida: { id: "m", nombre: "Precio" }, nota: "Lo pensará" })]);
  const l = lineaDeTiempo(h, ETAPAS);
  assert.deepEqual(l.map((x) => x.titulo), ["Pasó a Descartada", "Pasó a Contacto", "Llegó a Nueva"]);
  assert.deepEqual(l[0]?.notas, ["Motivo: Precio", "Lo pensará"]);
  assert.deepEqual(l[1]?.notas, ["Ya contestó"]);
  assert.equal(l[2]?.quien, "Automático");
  assert.equal(l[0]?.quien, "Adela");
});

test("llegar a la etapa de inscrito es «Se inscribió» (por su papel, no por su nombre); volver de perdidos, «Se recuperó»; a mano, lo dice", () => {
  const l = lineaDeTiempo(historial([cambio("1", "c", "i", "2026-10-02T10:00:00Z"), cambio("2", "p", "c", "2026-10-03T10:00:00Z", { es_recuperacion: true }), cambio("3", "c", "i", "2026-10-04T10:00:00Z", { a_mano: true })]), ETAPAS);
  assert.deepEqual(l.map((x) => x.titulo), ["Se marcó como inscrito a mano", "Se recuperó: pasó a Contacto", "Se inscribió"]);
});

test("las inscripciones registradas entran por su fecha y una nota en blanco no se muestra", () => {
  const l = lineaDeTiempo(historial([cambio("1", "n", "c", "2026-10-02T10:00:00Z", { nota: "   " })], [{ fecha: "2026-10-05" }]), ETAPAS);
  assert.equal(l[0]?.titulo, "Inscripción registrada en el sistema");
  assert.deepEqual(l[1]?.notas, []);
});

test("con la misma hora, el que va después en la lista de la API es el más reciente", () => {
  const l = lineaDeTiempo(historial([cambio("a", "n", "c", "2026-10-02T10:00:00Z"), cambio("b", "c", "n", "2026-10-02T10:00:00Z")]), ETAPAS);
  assert.deepEqual(l.map((x) => x.id), ["b", "a"]);
});

test("los motivos se dicen en palabras de la escuela y los días, como una persona", () => {
  assert.equal(textoDeMotivo("inscripcion_a_mano"), "marcado a mano");
  assert.equal(textoDeMotivo("cambio_manual"), "cambio manual");
  assert.deepEqual([0, 1, 5].map(haceTexto), ["hoy", "ayer", "hace 5 días"]);
});
