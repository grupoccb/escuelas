// E3: la URL de la landing que codifica el QR, la base pública y el nombre del archivo descargable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nombreDeArchivo, resolverBaseUrl, urlDeLanding } from "./landing-url.ts";

test("urlDeLanding: origen + /l/<vertical> + org, c y s solo si vienen; todo codificado; de la base solo cuenta el origen", () => {
  assert.equal(urlDeLanding({ base: "https://escuela.ejemplo.mx", verticalSlug: "vertical-uno" }), "https://escuela.ejemplo.mx/l/vertical-uno");
  assert.equal(urlDeLanding({ base: "https://escuela.ejemplo.mx/", verticalSlug: "v", codigo: "QR7M2KXA", sucursalId: "11111111-1111-4111-8111-111111111111" }), "https://escuela.ejemplo.mx/l/v?c=QR7M2KXA&s=11111111-1111-4111-8111-111111111111");
  assert.equal(urlDeLanding({ base: "https://escuela.ejemplo.mx/ruta/rara?x=1#y", verticalSlug: "v", orgSlug: "mi-escuela", codigo: "QR7M2KXA" }), "https://escuela.ejemplo.mx/l/v?org=mi-escuela&c=QR7M2KXA");
  assert.equal(urlDeLanding({ base: "http://localhost:3000", verticalSlug: "ñandú & co" }), "http://localhost:3000/l/%C3%B1and%C3%BA%20%26%20co");
  assert.throws(() => urlDeLanding({ base: "no es una url", verticalSlug: "v" }));
});

test("resolverBaseUrl: ORIGEN_PUBLICO, luego PUBLIC_BASE_URL, luego (solo fuera de producción) el host de la petición; en producción nunca el Host", () => {
  const base = { origenesPermitidos: [] as string[], publicBaseUrl: undefined, protocolo: "http", host: "localhost:3000", produccion: false };
  assert.equal(resolverBaseUrl({ ...base, origenesPermitidos: ["https://a.test", "https://b.test"] }), "https://a.test");
  assert.equal(resolverBaseUrl({ ...base, publicBaseUrl: "https://publica.test/algo" }), "https://publica.test");
  assert.equal(resolverBaseUrl({ ...base, origenesPermitidos: ["https://a.test"], publicBaseUrl: "https://publica.test" }), "https://a.test", "gana el primer origen configurado");
  assert.equal(resolverBaseUrl(base), "http://localhost:3000", "en desarrollo, el host");
  assert.equal(resolverBaseUrl({ ...base, produccion: true }), null, "en producción hay que configurarlo");
  assert.equal(resolverBaseUrl({ ...base, host: "evil.test\r\nX: y" }), null, "un Host raro no se acepta");
  assert.equal(resolverBaseUrl({ ...base, origenesPermitidos: ["javascript:alert(1)"], produccion: true }), null);
  assert.equal(resolverBaseUrl({ ...base, host: undefined }), null);
});

test("nombreDeArchivo: ASCII, minúsculas, guiones; sin acentos, comillas, saltos de línea ni rutas", () => {
  assert.equal(nombreDeArchivo("qr", "Campaña de Otoño 2026", "Sucursal Ñandú"), "qr-campana-de-otono-2026-sucursal-nandu");
  assert.equal(nombreDeArchivo('qr', '"; filename=evil\r\nX-Inyeccion: 1', '../../etc/passwd'), "qr-filename-evil-x-inyeccion-1-etc-passwd");
  assert.equal(nombreDeArchivo("", "***"), "qr");
  assert.ok(nombreDeArchivo("x".repeat(200)).length <= 80);
});
