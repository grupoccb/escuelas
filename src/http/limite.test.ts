import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeTrustProxy, confianzaProxyDesdeEntorno, limitesDesdeEntorno } from "./config-limites.ts";
import { llaveDeIp, normalizarIp } from "./ip.ts";
import { LimitadorDeTasa, perfilPorMinuto } from "./limite.ts";

function reloj() {
  let ms = 1_000_000;
  return { ahora: () => ms, avanzar: (n: number) => void (ms += n) };
}

test("ráfaga: permite hasta la capacidad y luego rechaza diciendo en cuánto hay otra ficha", () => {
  const r = reloj();
  const l = new LimitadorDeTasa({ reloj: r.ahora });
  const perfil = perfilPorMinuto(5); // 5 de ráfaga, 1 cada 12 s
  for (let i = 0; i < 5; i++) assert.equal(l.consumir("a", perfil).permitido, true, `petición ${i + 1}`);
  const d = l.consumir("a", perfil);
  assert.equal(d.permitido, false);
  assert.equal(d.reintentarEnSegundos, 12);
});

test("se rellena con el tiempo y nunca pasa de la capacidad", () => {
  const r = reloj();
  const l = new LimitadorDeTasa({ reloj: r.ahora });
  const perfil = perfilPorMinuto(6); // 1 ficha cada 10 s
  for (let i = 0; i < 6; i++) l.consumir("a", perfil);
  assert.equal(l.consumir("a", perfil).permitido, false);
  r.avanzar(9_000);
  assert.equal(l.consumir("a", perfil).permitido, false, "a los 9 s todavía no");
  r.avanzar(1_500);
  assert.equal(l.consumir("a", perfil).permitido, true, "a los 10.5 s hay una");
  assert.equal(l.consumir("a", perfil).permitido, false);
  r.avanzar(10 * 60_000); // mucho tiempo: se llena, pero no pasa de 6
  for (let i = 0; i < 6; i++) assert.equal(l.consumir("a", perfil).permitido, true);
  assert.equal(l.consumir("a", perfil).permitido, false);
});

test("claves independientes: otra IP no se afecta", () => {
  const l = new LimitadorDeTasa({ reloj: reloj().ahora });
  const perfil = perfilPorMinuto(2);
  l.consumir("login|1.1.1.1", perfil);
  l.consumir("login|1.1.1.1", perfil);
  assert.equal(l.consumir("login|1.1.1.1", perfil).permitido, false);
  assert.equal(l.consumir("login|2.2.2.2", perfil).permitido, true);
  assert.equal(l.consumir("api|1.1.1.1", perfil).permitido, true, "otro perfil, otra cubeta");
});

test("espiar no gasta ni crea cubetas", () => {
  const l = new LimitadorDeTasa({ reloj: reloj().ahora });
  const perfil = perfilPorMinuto(1);
  assert.equal(l.espiar("x", perfil).permitido, true);
  assert.equal(l.tamano, 0);
  l.consumir("x", perfil);
  assert.equal(l.espiar("x", perfil).permitido, false);
  assert.equal(l.espiar("x", perfil).permitido, false);
  assert.equal(l.tamano, 1);
});

test("tope de memoria: nunca más de maxClaves cubetas; primero se tiran las inactivas y luego las menos usadas", () => {
  const r = reloj();
  const l = new LimitadorDeTasa({ maxClaves: 100, reloj: r.ahora });
  const perfil = perfilPorMinuto(3);
  for (let i = 0; i < 100; i++) l.consumir(`ip-${i}`, perfil);
  assert.equal(l.tamano, 100);
  // La IP 0 agota su cupo, y luego entran 500 IPs nuevas MIENTRAS ella sigue activa.
  for (let i = 0; i < 3; i++) l.consumir("ip-0", perfil);
  for (let i = 0; i < 500; i++) {
    l.consumir(`nueva-${i}`, perfil);
    l.consumir("ip-0", perfil); // sigue pidiendo: se mantiene reciente
    assert.ok(l.tamano <= 100, `tamaño ${l.tamano}`);
  }
  assert.equal(l.consumir("ip-0", perfil).permitido, false, "la IP activa conserva su cubeta vacía");
});

test("las cubetas inactivas (ya llenas) se tiran antes que las activas al llenarse", () => {
  const r = reloj();
  const l = new LimitadorDeTasa({ maxClaves: 3, reloj: r.ahora });
  const perfil = perfilPorMinuto(2);
  l.consumir("vieja", perfil);
  l.consumir("activa", perfil);
  l.consumir("activa", perfil); // agotada
  l.consumir("otra", perfil);
  r.avanzar(60_000); // "vieja" y "otra" se rellenan; "activa" también (todas vuelven a estar llenas)
  l.consumir("activa", perfil);
  l.consumir("activa", perfil); // la agota otra vez, ahora
  l.consumir("nueva", perfil); // llena: se tira alguna inactiva, no "activa"
  assert.equal(l.tamano, 3);
  assert.equal(l.consumir("activa", perfil).permitido, false);
});

test("IP: se quita el prefijo de IPv4 mapeada y las IPv6 se agrupan por /64", () => {
  assert.equal(normalizarIp("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(normalizarIp(undefined), "desconocida");
  assert.equal(llaveDeIp("203.0.113.7"), "203.0.113.7");
  assert.equal(llaveDeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), llaveDeIp("2001:db8:1:2::1"));
  assert.notEqual(llaveDeIp("2001:db8:1:2::1"), llaveDeIp("2001:db8:1:3::1"));
  assert.equal(llaveDeIp("::1"), "0:0:0:0::/64");
  assert.equal(llaveDeIp("::ffff:10.0.0.1"), "10.0.0.1");
});

test("configuración: valores por defecto, variables de entorno y errores claros", () => {
  const d = limitesDesdeEntorno({});
  assert.equal(d.login.capacidad, 10);
  assert.equal(d.api.capacidad, 600);
  assert.equal(d.webhookFallos.capacidad, 30);
  assert.equal(d.webhook.capacidad, 6000);
  assert.equal(d.maxClaves, 50_000);
  const c = limitesDesdeEntorno({ LIMITE_LOGIN_POR_MINUTO: "3", LIMITE_MAX_CLAVES: "10" });
  assert.equal(c.login.capacidad, 3);
  assert.equal(c.login.recargaPorSegundo, 3 / 60);
  assert.equal(c.maxClaves, 10);
  assert.throws(() => limitesDesdeEntorno({ LIMITE_LOGIN_POR_MINUTO: "0" }), /LIMITE_LOGIN_POR_MINUTO/);
  assert.throws(() => limitesDesdeEntorno({ LIMITE_API_POR_MINUTO: "mucho" }), /LIMITE_API_POR_MINUTO/);
});

test("TRUST_PROXY: nada por defecto; número de saltos; lista de redes; `true` solo si se pide", () => {
  assert.equal(confianzaProxyDesdeEntorno({}), false);
  assert.equal(confianzaProxyDesdeEntorno({ TRUST_PROXY: "false" }), false);
  assert.equal(confianzaProxyDesdeEntorno({ TRUST_PROXY: "1" }), 1);
  assert.equal(confianzaProxyDesdeEntorno({ TRUST_PROXY: "loopback, 10.0.0.0/8" }), "loopback, 10.0.0.0/8");
  assert.equal(confianzaProxyDesdeEntorno({ TRUST_PROXY: "true" }), true);
});

test("EB-04: en producción sin TRUST_PROXY explícito hay un aviso fuerte; con cualquier valor explícito (incluido false) o fuera de producción, no", () => {
  assert.match(avisoDeTrustProxy({ NODE_ENV: "production" }) ?? "", /TRUST_PROXY/);
  assert.match(avisoDeTrustProxy({ NODE_ENV: "production", TRUST_PROXY: "  " }) ?? "", /balanceador/);
  assert.equal(avisoDeTrustProxy({ NODE_ENV: "production", TRUST_PROXY: "1" }), null);
  assert.equal(avisoDeTrustProxy({ NODE_ENV: "production", TRUST_PROXY: "false" }), null, "false es una decisión, no un olvido");
  assert.equal(avisoDeTrustProxy({}), null);
  assert.equal(avisoDeTrustProxy({ NODE_ENV: "development" }), null);
});

test("EB-17: una inundación de claves nuevas NO expulsa la cubeta agotada de una IP ya limitada", () => {
  const r = reloj();
  const l = new LimitadorDeTasa({ maxClaves: 50, reloj: r.ahora });
  const perfil = perfilPorMinuto(10);
  for (let i = 0; i < 10; i++) l.consumir("victima", perfil);
  assert.equal(l.consumir("victima", perfil).permitido, false, "limitada");
  for (let i = 0; i < 500; i++) l.consumir(`inundacion-${i}`, perfil); // 10 veces el tope, todas distintas
  assert.ok(l.tamano <= 50);
  assert.equal(l.consumir("victima", perfil).permitido, false, "sigue limitada tras la inundación");
});
