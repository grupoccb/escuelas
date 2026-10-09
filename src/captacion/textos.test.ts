// V5: los mensajes del bot que la escuela puede personalizar. Lo que se prueba (puro, sin base):
//  · SIN personalización el bot dice EXACTAMENTE lo de siempre: cada texto por omisión se compara con la redacción anterior a V5 (copiada aquí, literal);
//  · la validación de lo que escribe la escuela: huecos que no existen, obligatorios que faltan, llaves sueltas, enlaces, largo y caracteres de control;
//  · el bot sigue siendo determinista (invariante 10): mismo estado y mismas respuestas dan siempre los mismos mensajes, con o sin personalización, y el texto personalizado
//    cambia SOLO la redacción, nunca el paso, los efectos ni el pase al asesor;
//  · lo que traiga un dato (un nombre con llaves) no se vuelve a interpretar como hueco.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADO_INICIAL, MAX_INTENTOS, avanzar, textos, textosDe, type ContextoCaptacion, type OpcionSucursal } from "./maquina.ts";
import { CATALOGO_DE_TEXTOS, CLAVES_DE_TEXTO, HUECOS, MAXIMO_DE_TEXTO, crearTextos, problemaDeTexto, renderizar } from "./textos.ts";

const SUC: OpcionSucursal[] = [{ id: "a", nombre: "Norte", direccion: "Calle 5 #20" }, { id: "b", nombre: "Sur", direccion: null }];
const PROGRAMAS = [{ id: "p1", nombre: "Infantil", descripcionPublica: "Ritmo suave" }, { id: "p2", nombre: "Juvenil", descripcionPublica: null }];
const HORARIOS = [
  { grupoId: "g1", nombre: "Tarde", horarioTexto: "lunes de 16:00 a 17:00", oferta: "lugar" as const, lugares: 1 },
  { grupoId: "g2", nombre: "Noche", horarioTexto: "martes de 19:00 a 20:00", oferta: "lista_de_espera" as const, lugares: 0 },
  { grupoId: "g3", nombre: "Mañana", horarioTexto: "sábado de 10:00 a 11:00", oferta: "lugar" as const, lugares: 5 },
];
const FECHAS = [
  { fechaHora: "2026-10-12T22:00:00Z", nombre: "lunes 12 de octubre a las 16:00", lugares: 1 },
  { fechaHora: "2026-10-13T22:00:00Z", nombre: "martes 13 de octubre a las 16:00", lugares: 3 },
];

/** Todos los mensajes personalizables, con datos fijos. */
const casos = (t: ReturnType<typeof crearTextos>) => ({
  saludo: t.saludo("Disciplina X"),
  saludoConDatos: t.saludoConDatos("Disciplina X", "Sofía"),
  preguntaNombre: t.preguntaNombre,
  preguntaEdad: t.preguntaEdad("Sofía"),
  preguntaSucursal: t.preguntaSucursal(SUC),
  cierreCon: t.cierre("Sofía", "Norte"),
  cierreSin: t.cierre("Sofía", null),
  reintentoNombre: t.reintentoNombre,
  reintentoEdad: t.reintentoEdad,
  reintentoSucursal: t.reintentoSucursal(SUC),
  preguntaPrograma: t.preguntaPrograma("Sofía", 8, PROGRAMAS),
  reintentoPrograma: t.reintentoPrograma(PROGRAMAS),
  ofrecerOtra: t.ofrecerOtraSucursal("Sofía", 8, "Sur", SUC[0]!),
  ofrecerOtraSinDir: t.ofrecerOtraSucursal("Sofía", 8, "Norte", SUC[1]!),
  ofrecerOtras: t.ofrecerOtrasSucursales("Sofía", 8, "Centro", SUC),
  reintentoOtraUna: t.reintentoOtraSucursal([SUC[0]!]),
  reintentoOtras: t.reintentoOtraSucursal(SUC),
  sinPrograma: t.sinPrograma("Sofía", 8, "Norte"),
  reintentoHorario: t.reintentoHorario(HORARIOS),
  pidioAsesor: t.pidioAsesor,
  proponer: t.proponerFechasMuestra("Sofía", HORARIOS[0]!, FECHAS),
  reintentoFecha: t.reintentoFechaMuestra(FECHAS),
  fechaSinLugar: t.fechaMuestraSinLugar(FECHAS),
  sinFechas: t.sinFechasMuestra,
  yaAgendada: t.muestraYaAgendada("Sofía", FECHAS[0]!),
  cotizacionVencida: t.cotizacionVencida,
  horarioNoDisponible: t.horarioNoDisponible,
  preguntaListaEspera: t.preguntaListaEspera(HORARIOS[1]!),
  reintentoListaEspera: t.reintentoListaEspera(HORARIOS[1]!),
  cierreListaEspera: t.cierreListaEspera("Sofía", HORARIOS[1]!, "Infantil"),
  otroHorario: t.otroHorario(HORARIOS),
  sinEntender: t.sinEntender,
});

/** La redacción de ANTES de V5 (cuando los textos eran constantes en maquina.ts), salida literal con los mismos datos. */
const DE_ANTES: Record<string, string> = {
  saludo: "¡Hola! Gracias por escribir a Disciplina X. Para darte horarios y costos exactos te hago tres preguntas rápidas.",
  saludoConDatos: "¡Hola! Gracias por escribir a Disciplina X. Ya tenemos los datos que nos dejaste para Sofía.",
  preguntaNombre: "¿Cómo se llama la persona que tomaría las clases?",
  preguntaEdad: "Mucho gusto. ¿Qué edad tiene Sofía?",
  preguntaSucursal: "¿Qué sucursal te queda mejor? Responde con el número:\n1. Norte\n2. Sur",
  cierreCon: "¡Gracias! Ya tengo los datos de Sofía para la sucursal Norte. Un asesor te escribe por aquí en unos minutos con horarios y costos.",
  cierreSin: "¡Gracias! Ya tengo los datos de Sofía. Un asesor te escribe por aquí en unos minutos con horarios y costos.",
  reintentoNombre: "No alcancé a leer el nombre. ¿Me lo escribes de nuevo? Solo el nombre, por favor.",
  reintentoEdad: "¿Me compartes la edad con número? Por ejemplo: 8",
  reintentoSucursal: "Responde solo con el número de la sucursal:\n1. Norte\n2. Sur",
  preguntaPrograma: "Para Sofía (8 años) tenemos estas opciones. ¿Cuál te interesa? Responde con el número:\n1. Infantil — Ritmo suave\n2. Juvenil",
  reintentoPrograma: "Responde solo con el número del programa:\n1. Infantil — Ritmo suave\n2. Juvenil",
  ofrecerOtra: "En la sucursal Sur por ahora no tenemos clases para Sofía (8 años), pero en la sucursal Norte (Calle 5 #20) sí. ¿Quieres que te cotice ahí? Responde sí o no.",
  ofrecerOtraSinDir: "En la sucursal Norte por ahora no tenemos clases para Sofía (8 años), pero en la sucursal Sur sí. ¿Quieres que te cotice ahí? Responde sí o no.",
  ofrecerOtras: "En la sucursal Centro por ahora no tenemos clases para Sofía (8 años), pero sí en estas sucursales. Responde con el número de la que prefieras, o «no» para que te atienda un asesor:\n1. Norte (Calle 5 #20)\n2. Sur",
  reintentoOtraUna: "Responde sí o no: ¿te cotizo en la sucursal Norte?",
  reintentoOtras: "Responde con el número de la sucursal, o «no» para que te atienda un asesor:\n1. Norte (Calle 5 #20)\n2. Sur",
  sinPrograma: "Por ahora no encontré un programa para Sofía (8 años) en la sucursal Norte. Te comunico con un asesor para revisar opciones; te escribe por aquí en unos minutos.",
  reintentoHorario: "Responde con el número del horario, o escribe «asesor» para hablar con una persona:\n1. Tarde: lunes de 16:00 a 17:00\n2. Noche: martes de 19:00 a 20:00\n3. Mañana: sábado de 10:00 a 11:00",
  pidioAsesor: "Claro, te comunico con un asesor. Te escribe por aquí en unos minutos.",
  proponer: "Para Sofía podemos agendar una clase muestra en Tarde (lunes de 16:00 a 17:00). Estas son las próximas fechas con lugar; responde con el número de la que prefieras, o escribe «asesor» para hablar con una persona:\n1. lunes 12 de octubre a las 16:00 · 1 lugar\n2. martes 13 de octubre a las 16:00 · 3 lugares",
  reintentoFecha: "Responde con el número de la fecha, o escribe «asesor» para hablar con una persona:\n1. lunes 12 de octubre a las 16:00 · 1 lugar\n2. martes 13 de octubre a las 16:00 · 3 lugares",
  fechaSinLugar: "Esa fecha ya no tiene lugar. Estas son las que quedan; responde con el número de la que prefieras:\n1. lunes 12 de octubre a las 16:00 · 1 lugar\n2. martes 13 de octubre a las 16:00 · 3 lugares",
  sinFechas: "Por ahora no hay fechas con lugar para la clase muestra. Te comunico con un asesor para ofrecerte otra opción; te escribe por aquí en unos minutos.",
  yaAgendada: "Sofía ya tiene agendada su clase muestra: lunes 12 de octubre a las 16:00. Si quieres cambiarla, escribe «asesor».",
  cotizacionVencida: "Tu cotización anterior ya venció; te mando una actualizada.",
  horarioNoDisponible: "Ese horario ya no está disponible; te mando las opciones actualizadas.",
  preguntaListaEspera: "El grupo Noche (martes de 19:00 a 20:00) está lleno por ahora. ¿Quieres que te apuntemos en la lista de espera? Si se libera un lugar, un asesor te avisa. Responde sí o no.",
  reintentoListaEspera: "Responde sí o no: ¿te apuntamos en la lista de espera de Noche?",
  cierreListaEspera: "Listo, Sofía quedó en la lista de espera de Noche (martes de 19:00 a 20:00) de Infantil. Si se libera un lugar, un asesor te escribe por aquí. Mientras tanto te atiende un asesor para ver otras opciones.",
  otroHorario: "Sin problema. ¿Cuál otro horario prefieres? Responde con el número, o escribe «asesor» para hablar con una persona:\n1. Tarde: lunes de 16:00 a 17:00 · 1 lugar\n2. Noche: martes de 19:00 a 20:00 · lista de espera\n3. Mañana: sábado de 10:00 a 11:00 · 5 lugares",
  sinEntender: "Te comunico con un asesor para ayudarte mejor. En unos minutos te escribe por aquí."
};

test("sin personalización el bot dice EXACTAMENTE lo de siempre (la redacción anterior a V5, texto por texto)", () => {
  const ahora = casos(crearTextos());
  assert.deepEqual(Object.keys(ahora).sort(), Object.keys(DE_ANTES).sort());
  for (const [clave, esperado] of Object.entries(DE_ANTES)) assert.equal((ahora as Record<string, string>)[clave], esperado, clave);
  // `textos` (el que usan las pruebas y quien no tiene contexto) es el mismo.
  assert.deepEqual(casos(textos), ahora);
  assert.equal(textosDe({}), textos);
  assert.equal(textosDe({ textosPersonalizados: {} }), textos);
});

test("todo mensaje del catálogo es válido tal como viene, usa solo sus huecos y tiene su clave con forma de clave", () => {
  for (const clave of CLAVES_DE_TEXTO) {
    const def = CATALOGO_DE_TEXTOS[clave];
    assert.match(clave, /^[a-z][a-z0-9_]*$/);
    assert.equal(problemaDeTexto(clave, def.defecto), null, clave);
    assert.ok(def.defecto.length <= MAXIMO_DE_TEXTO, clave);
    for (const h of def.huecos) assert.ok(h in HUECOS, `${clave}: hueco ${h} desconocido`);
  }
});

test("la validación dice en español qué corregir: huecos que no existen, obligatorios, llaves sueltas, enlaces, largo y caracteres raros", () => {
  assert.equal(problemaDeTexto("pregunta_edad", "¿Cuántos años tiene {nombre}?"), null);
  assert.match(problemaDeTexto("pregunta_edad", "¿Cuántos años tiene {apodo}?")!, /«\{apodo\}» no se puede usar en este mensaje\. Puedes usar: \{nombre\}/);
  assert.match(problemaDeTexto("pregunta_nombre", "¿Cómo te llamas, {nombre}?")!, /aquí no hay huecos que llenar/);
  assert.match(problemaDeTexto("pregunta_sucursal", "¿Cuál sucursal prefieres?")!, /Falta \{lista\}/);
  assert.match(problemaDeTexto("pregunta_edad", "Edad de {nombre")!, /llave/);
  assert.match(problemaDeTexto("pregunta_edad", "Edad de nombre}")!, /llave/);
  for (const enlace of ["Visita https://mi-escuela.mx", "entra a www.escuela.com", "escríbenos en escuela.com.mx", "wa.me/5215512345678", "bit.ly/abc"]) {
    assert.match(problemaDeTexto("pidio_asesor", enlace)!, /enlaces/, enlace);
  }
  // Un punto normal no es un enlace.
  assert.equal(problemaDeTexto("pidio_asesor", "Claro. Te escribe un asesor.mañana."), null);
  assert.match(problemaDeTexto("pidio_asesor", "   ")!, /Escribe el mensaje/);
  assert.match(problemaDeTexto("pidio_asesor", "a".repeat(MAXIMO_DE_TEXTO + 1))!, /muy largo/);
  assert.equal(problemaDeTexto("pidio_asesor", "a".repeat(MAXIMO_DE_TEXTO)), null);
  assert.match(problemaDeTexto("pidio_asesor", "Hola\u0000")!, /caracteres/);
  // Saltos de línea y acentos sí.
  assert.equal(problemaDeTexto("pregunta_sucursal", "Elige tu sede ✔\n{lista}"), null);
});

test("renderizar llena los huecos en una sola pasada: un dato con llaves no se vuelve a interpretar", () => {
  assert.equal(renderizar("Hola {nombre}, tienes {edad}", { nombre: "{edad}", edad: 8 }), "Hola {edad}, tienes 8");
  assert.equal(renderizar("{nombre}{desconocido}", { nombre: "A" }), "A");
});

test("la personalización cambia SOLO la redacción: lo personalizado sale, lo demás sigue igual, y un texto guardado que ya no sirve no llega a la familia", () => {
  const propios = { saludo: "Bienvenido a {disciplina}. Te hago tres preguntas.", pregunta_edad: "¿Cuántos años tiene {nombre}?", pregunta_sucursal: "Elige sede:\n{lista}" };
  const t = crearTextos(propios);
  assert.equal(t.saludo("Disciplina X"), "Bienvenido a Disciplina X. Te hago tres preguntas.");
  assert.equal(t.preguntaEdad("Sofía"), "¿Cuántos años tiene Sofía?");
  assert.equal(t.preguntaSucursal(SUC), "Elige sede:\n1. Norte\n2. Sur");
  const resto = casos(t);
  const base = casos(crearTextos());
  for (const k of Object.keys(base) as (keyof typeof base)[]) if (!["saludo", "preguntaEdad", "preguntaSucursal"].includes(k)) assert.equal(resto[k], base[k], k);
  // Sin el hueco obligatorio, un texto guardado (por una versión anterior) se ignora: sale el de siempre.
  assert.equal(crearTextos({ pregunta_sucursal: "Elige sede" }).preguntaSucursal(SUC), textos.preguntaSucursal(SUC));
  assert.equal(crearTextos({ pregunta_edad: "Mira https://x.mx {nombre}" }).preguntaEdad("Sofía"), textos.preguntaEdad("Sofía"));
});

const CTX: ContextoCaptacion = { nombreVertical: "Disciplina X", sucursales: SUC };

function conversar(ctx: ContextoCaptacion, entradas: string[]) {
  let estado = ESTADO_INICIAL;
  const salida = [] as { estado: typeof estado; respuestas: string[]; pasarAAsesor: string | null }[];
  for (const e of entradas) {
    const r = avanzar(estado, e, ctx);
    salida.push({ estado: r.estado, respuestas: r.respuestas, pasarAAsesor: r.pasarAAsesor });
    estado = r.estado;
  }
  return salida;
}

test("DETERMINISMO: la misma conversación da los mismos pasos, efectos y pase al asesor con o sin personalización; solo cambian las palabras", () => {
  const guion = ["Hola", "Sofía", "8", "2"];
  const sin = conversar(CTX, guion);
  const sin2 = conversar(CTX, guion);
  assert.deepEqual(sin2, sin, "dos corridas iguales: idénticas");
  const con = conversar({ ...CTX, textosPersonalizados: { saludo: "Bienvenido a {disciplina}.", pregunta_nombre: "¿Nombre del alumno?", pregunta_edad: "¿Edad de {nombre}?", cierre_con_sucursal: "Listo {nombre}: {sucursal}." } }, guion);
  assert.deepEqual(con.map((r) => [r.estado, r.pasarAAsesor]), sin.map((r) => [r.estado, r.pasarAAsesor]), "mismos estados y pase");
  assert.deepEqual(con.map((r) => r.respuestas.length), sin.map((r) => r.respuestas.length));
  assert.deepEqual(con[0]!.respuestas, ["Bienvenido a Disciplina X.", "¿Nombre del alumno?"]);
  assert.deepEqual(con[1]!.respuestas, ["¿Edad de Sofía?"]);
  assert.deepEqual(con[3]!.respuestas, ["Listo Sofía: Sur."]);
  assert.deepEqual(sin[3]!.respuestas, [textos.cierre("Sofía", "Sur")]);
  assert.equal(con[3]!.pasarAAsesor, "captura_completa");
});

test("V5: cuántas respuestas sin entender aguanta el bot sale de la configuración (`maxIntentos`, 3 por omisión) y se pasa a una persona al llegar", () => {
  const ruido = ["Hola", "????", "ñ", "###", "!!!", "..."];
  const porOmision = conversar(CTX, ruido);
  assert.equal(MAX_INTENTOS, 3);
  assert.equal(porOmision[3]!.pasarAAsesor, "sin_entender", "al tercer intento fallido (omisión)");
  assert.equal(porOmision[2]!.pasarAAsesor, null);
  const dos = conversar({ ...CTX, maxIntentos: 2 }, ruido);
  assert.equal(dos[1]!.pasarAAsesor, null);
  assert.equal(dos[2]!.pasarAAsesor, "sin_entender", "con 2: al segundo");
  assert.deepEqual(dos[2]!.respuestas, [textos.sinEntender]);
  const cinco = conversar({ ...CTX, maxIntentos: 5 }, ruido);
  assert.ok(cinco.slice(1, 5).every((r) => r.pasarAAsesor === null), "con 5 insiste más");
  assert.equal(cinco[5]!.pasarAAsesor, "sin_entender");
  // El texto de «sin entender» también es personalizable.
  const propio = conversar({ ...CTX, maxIntentos: 1, textosPersonalizados: { sin_entender: "Mejor te atiende una persona." } }, ruido);
  assert.deepEqual(propio[1]!.respuestas, ["Mejor te atiende una persona."]);
});
