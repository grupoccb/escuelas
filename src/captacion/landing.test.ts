// E1: las reglas puras de la landing: parámetros de la URL, validación del envío, enlace de WhatsApp y colores/logos de las tablas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { colorValido, enlaceDeWhatsapp, leerParametros, logoValido, numeroParaEnlace, validarEnvio, type Landing } from "./landing.ts";
import { escapar, colorSobre } from "../http/landing-html.ts";
import { esCodigoValido, formatearCodigo, generarCodigo, normalizarCodigoEscrito } from "./codigos.ts";

const AVISO = { id: "doc-1", tipo: "aviso_privacidad", verticalId: null, version: 3, titulo: "Aviso de privacidad", texto: "x", textoHash: "h", vigenteDesde: new Date("2026-01-01") } as const;
const DOS: Pick<Landing, "sucursales" | "aviso"> = { sucursales: [{ id: "a1", nombre: "Norte" }, { id: "b2", nombre: "Sur" }], aviso: AVISO };
const buenos = { nombre_alumno: "  Mateo   Soto ", edad: "8", sucursal_id: "b2", telefono: "+52 1 55 1234 5678", nombre_contacto: "Rosa", acepta_aviso: "on", documento_id: "doc-1", version: "3" };

test("códigos: alfabeto sin ambiguos, al menos un dígito, formato ABCD-EFGH; se acepta en minúsculas y con signos", () => {
  for (let i = 0; i < 300; i++) {
    const c = generarCodigo();
    assert.ok(esCodigoValido(c), c);
    assert.ok(!/[ILO01]/.test(c), `sin ambiguos: ${c}`);
  }
  assert.equal(generarCodigo((n) => n - 1), "99999999", "el azar de prueba: toda la última letra del alfabeto es un dígito");
  assert.equal(formatearCodigo("ABCDEFG2"), "ABCD-EFG2");
  for (const escrito of ["abcd-efg2", "ABCD EFG2", "abcd.efg2", " ABCDEFG2 ", "AbCd–EfG2"]) assert.equal(normalizarCodigoEscrito(escrito), "ABCDEFG2", escrito);
  for (const mal of ["ABCDEFGH", "ABCD-EFG", "ABCD-EFGH2", "ABCDEFGI2", "HOLA", "", "ABCD-EFG0", "ABCD-EFG1"]) assert.equal(normalizarCodigoEscrito(mal), null, mal);
});

test("leerParametros: código normalizado, sucursal uuid y utm acotados; lo raro se ignora", () => {
  const ok = leerParametros({ c: "abcd-efg2", s: "11111111-1111-4111-8111-111111111111", utm_source: "facebook", utm_campaign: "  verano \n", utm_term: "x".repeat(300), utm_content: "" });
  assert.equal(ok.codigo, "ABCDEFG2");
  assert.equal(ok.sucursalId, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(ok.utm, { utm_source: "facebook", utm_campaign: "verano", utm_term: "x".repeat(100) });
  assert.deepEqual(leerParametros({ c: "no es un código", s: "no-uuid", utm_source: ["a", "b"], otro: "x" }), { codigo: null, sucursalId: null, utm: {} });
  assert.deepEqual(leerParametros({ utm_source: "a\u0000b\u0007c" }).utm, { utm_source: "abc" }, "sin caracteres de control");
});

test("validarEnvio: lo correcto sale limpio (nombre compactado, teléfono normalizado, +521 → +52)", () => {
  const r = validarEnvio(buenos, DOS);
  assert.ok(r.ok);
  assert.deepEqual(r.datos, { nombreAlumno: "Mateo Soto", edad: 8, sucursalId: "b2", telefono: "+525512345678", nombreContacto: "Rosa", documentoId: "doc-1", version: 3 });
  // Con una sola sucursal no se pregunta; sin ninguna, tampoco.
  const unica = validarEnvio({ ...buenos, sucursal_id: undefined }, { ...DOS, sucursales: [{ id: "a1", nombre: "Norte" }] });
  assert.ok(unica.ok && unica.datos.sucursalId === "a1");
  const ninguna = validarEnvio({ ...buenos, sucursal_id: undefined }, { ...DOS, sucursales: [] });
  assert.ok(ninguna.ok && ninguna.datos.sucursalId === null);
  // El nombre de contacto es opcional.
  const sin = validarEnvio({ ...buenos, nombre_contacto: "" }, DOS);
  assert.ok(sin.ok && sin.datos.nombreContacto === null);
});

test("validarEnvio: cada campo malo da su mensaje; nada se acepta a medias", () => {
  const campos = (cambio: Record<string, unknown>) => {
    const r = validarEnvio({ ...buenos, ...cambio }, DOS);
    assert.ok(!r.ok);
    return Object.keys(r.errores.campos).sort();
  };
  assert.deepEqual(campos({ nombre_alumno: "" }), ["nombre_alumno"]);
  assert.deepEqual(campos({ nombre_alumno: "   " }), ["nombre_alumno"]);
  assert.deepEqual(campos({ nombre_alumno: "x".repeat(121) }), ["nombre_alumno"]);
  assert.deepEqual(campos({ nombre_alumno: "<script>alert(1)</script>" }), ["nombre_alumno"]);
  assert.deepEqual(campos({ nombre_alumno: ["a"] }), ["nombre_alumno"]);
  for (const edad of ["", "0", "100", "abc", "8.5", "-3", "08x", " "]) assert.deepEqual(campos({ edad }), ["edad"], `edad «${edad}»`);
  assert.deepEqual(campos({ sucursal_id: "" }), ["sucursal_id"], "con varias hay que elegir");
  assert.deepEqual(campos({ sucursal_id: "zz" }), ["sucursal_id"], "una sucursal que la vertical no ofrece");
  for (const telefono of ["", "abc", "123", "+0000000000", "5".repeat(31)]) assert.deepEqual(campos({ telefono }), ["telefono"], `teléfono «${telefono}»`);
  assert.deepEqual(campos({ nombre_contacto: "<b>x</b>" }), ["nombre_contacto"]);
  assert.deepEqual(campos({ acepta_aviso: undefined }), ["acepta_aviso"]);
  assert.deepEqual(campos({ acepta_aviso: "no" }), ["acepta_aviso"]);
  // Todos los errores juntos, no el primero.
  assert.deepEqual(campos({ nombre_alumno: "", edad: "x", telefono: "1", acepta_aviso: "" }), ["acepta_aviso", "edad", "nombre_alumno", "telefono"]);
  // El aviso: tiene que ser la versión vigente que se mostró.
  for (const cambio of [{ documento_id: "otro" }, { version: "2" }, { version: "x" }, { documento_id: undefined }]) {
    const r = validarEnvio({ ...buenos, ...cambio }, DOS);
    assert.ok(!r.ok && r.errores.general && /cambió/.test(r.errores.general), JSON.stringify(cambio));
  }
  const sinAviso = validarEnvio(buenos, { ...DOS, aviso: null });
  assert.ok(!sinAviso.ok && /no está disponible/.test(sinAviso.errores.general ?? ""));
});

test("enlace de WhatsApp: número en dígitos, mensaje prellenado con el nombre de la vertical y el código, todo codificado", () => {
  assert.equal(numeroParaEnlace("whatsapp:+525512345678"), "525512345678");
  assert.equal(numeroParaEnlace("+52 55 1234 5678"), "525512345678");
  for (const mal of [null, undefined, "", "whatsapp:", "123", "1".repeat(16)]) assert.equal(numeroParaEnlace(mal as string | null), null);
  const url = enlaceDeWhatsapp("525512345678", "Vertical & Cía <uno>", "ABCDEFG2");
  assert.ok(url.startsWith("https://wa.me/525512345678?text="));
  assert.equal(decodeURIComponent(url.split("text=")[1]!), "Hola, quiero información de Vertical & Cía <uno>. Mi código es ABCD-EFG2");
  assert.ok(!url.includes("<") && !url.includes(" ") && !url.includes("&Cía"), "el texto va codificado");
});

test("color de marca y logo de las tablas: solo #RRGGBB y solo https; el texto sobre el color contrasta", () => {
  assert.equal(colorValido("#1F4E79"), "#1f4e79");
  for (const mal of ["red", "#fff", "#12345", "#1234567", "javascript:alert(1)", "#12345g", "", null, undefined, "#123456; background: url(x)"]) assert.equal(colorValido(mal), null, String(mal));
  assert.equal(logoValido("https://cdn.ejemplo.test/logo.png"), "https://cdn.ejemplo.test/logo.png");
  for (const mal of ["http://x.test/l.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "//x.test/l.png", "no es url", "", null, `https://x.test/${"a".repeat(500)}`]) assert.equal(logoValido(mal), null, String(mal));
  assert.equal(colorSobre("#ffffff"), "#111111");
  assert.equal(colorSobre("#000000"), "#ffffff");
  assert.equal(colorSobre("#1f4e79"), "#ffffff");
  assert.equal(colorSobre("#ffd400"), "#111111");
});

test("escapar: los cinco caracteres peligrosos de HTML, en texto y en atributos", () => {
  assert.equal(escapar(`<script>alert("x")</script> & 'y'`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  assert.equal(escapar(null), "");
  assert.equal(escapar(7), "7");
  assert.equal(escapar('" onfocus="alert(1)'), "&quot; onfocus=&quot;alert(1)");
});
