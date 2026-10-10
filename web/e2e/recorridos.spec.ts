// J10: los cinco recorridos principales de punta a punta, con el backend real y datos sembrados, cada uno en celular (390×844) y en escritorio (1366×768), con capturas
// en `docs/capturas/recorrido-N-…` (qué mira Eduardo en cada una: `docs/capturas/README.md`). Todo es ficticio. El navegador nunca sale a un servicio externo: el salto a
// WhatsApp de la landing se atiende con una página SIMULADA dentro de la propia prueba (y se comprueba a dónde habría llevado).

import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { abrirSeccion, apiComo, haceDiasEnMexico, json } from "./ayudas.ts";
import { capturar, contextoNuevo, entrarPorPantalla, expect, mundo, test, VISTAS, type Vista } from "./fixtura.ts";

test.describe.configure({ mode: "serial" });
const R = mundo.recorridos;
const pesos = (t: string): string => {
  const [entero = "0", dec = "00"] = t.split(".");
  return `$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
};
let admin: APIRequestContext;
test.beforeAll(async () => {
  admin = await apiComo("administrador");
});
test.afterAll(async () => {
  await admin.dispose();
});

for (const vista of Object.keys(VISTAS) as Vista[]) {
  const d = R.por[vista];
  const cap = (page: Page, nombre: string, completa = false) => capturar(page, nombre, vista, { completa });
  test.describe(`en ${vista === "celular" ? "celular (390×844)" : "escritorio (1366×768)"}`, () => {
    test(`recorrido 1: el anuncio, la landing y el lead que ve el asesor (${vista})`, async ({ browser, baseURL }) => {
      const base = baseURL!;
      // El anuncio: una campaña con su código de rastreo (lo da de alta el administrador).
      const campana = await (await admin.post("/api/campanas", { data: { nombre: `Anuncio de otoño (${vista})`, origen: "facebook" } })).json();
      const codigo = (await (await admin.post("/api/codigos-rastreo", { data: { campana_id: campana.id } })).json()) as { codigo: string };
      expect(codigo.codigo).toMatch(/^[A-Z2-9]{8}$/);

      // La familia abre la landing desde el anuncio, en su celular o en su compu.
      const familia = await contextoNuevo(browser, base, vista, null);
      const p = familia.page;
      let destino = "";
      // El envío termina en un 303 a WhatsApp. El navegador de pruebas NO lo sigue: se pide el envío sin seguir la redirección, se lee a dónde habría llevado y se responde
      // con una página SIMULADA (nunca se visita WhatsApp, ni wa.me ni api.whatsapp.com).
      await p.route(/\/l\/vertical-prueba/, async (ruta) => {
        if (ruta.request().method() !== "POST") return ruta.continue();
        const respuesta = await ruta.fetch({ maxRedirects: 0 });
        destino = respuesta.headers()["location"] ?? "";
        return ruta.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><meta charset=utf-8><title>WhatsApp (simulado)</title><h1>WhatsApp (simulado)</h1><p>Aquí abriría la conversación con el mensaje ya escrito. En las pruebas nunca se visita WhatsApp.</p>" });
      });
      await p.goto(`${R.rutaLanding}?c=${codigo.codigo}&utm_source=facebook&utm_medium=anuncio&utm_campaign=otono`);
      await expect(p.getByRole("button", { name: "Enviar y continuar a WhatsApp" })).toBeVisible();
      await cap(p, "recorrido-1-anuncio-01-landing");
      await p.getByLabel("¿Quién tomará la clase?").fill("Sofía");
      await p.getByLabel("Edad").fill("7");
      await p.getByLabel("¿En qué sucursal quieres la clase?").selectOption({ label: mundo.sucursales.norte.nombre });
      await p.getByLabel("Tu teléfono de contacto").fill(d.telefonoLanding);
      await p.getByLabel("Tu nombre (opcional)").fill(`Familia Recorrido ${vista}`);
      await p.getByLabel(/He leído y acepto/).check();
      await cap(p, "recorrido-1-anuncio-02-formulario-lleno");
      await p.getByRole("button", { name: "Enviar y continuar a WhatsApp" }).click();
      // Sale hacia WhatsApp con el mensaje prellenado y el código de rastreo.
      await expect(p.getByRole("heading", { name: "WhatsApp (simulado)" })).toBeVisible();
      expect(destino).toContain(`wa.me/${R.numeroDelCanal.replace("+", "")}`);
      expect(destino.startsWith("https://wa.me/")).toBe(true);
      // El mensaje prellenado lleva el código de rastreo del lead: con él, al llegar a WhatsApp, se sabe qué anuncio lo trajo.
      const enviado = /es([A-Z2-9]{8})$/.exec(decodeURIComponent(destino).replace(/[-\s]/g, ""));
      expect(enviado, "el mensaje trae un código de rastreo").not.toBeNull();
      expect(enviado![1]).not.toBe(codigo.codigo); // es el código PROPIO del lead; el del anuncio ya viajó en la dirección de la landing
      await cap(p, "recorrido-1-anuncio-03-salto-a-whatsapp-simulado");
      await familia.cerrar();

      // El asesor lo ve en su embudo, con la campaña y el código que lo trajeron.
      const asesor = await contextoNuevo(browser, base, vista, "asesor");
      const a = asesor.page;
      await a.goto("/embudo");
      const tarjeta = a.locator("[data-prueba^='lead-']", { hasText: `Familia Recorrido ${vista}` }).first();
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta).toContainText("Facebook"); // la fuente sale de la campaña del anuncio
      await cap(a, "recorrido-1-anuncio-04-embudo-del-asesor");
      await tarjeta.getByRole("link", { name: `Familia Recorrido ${vista}` }).click();
      await expect(a.getByRole("heading", { name: `Familia Recorrido ${vista}` })).toBeVisible();
      await expect(a.getByText(campana.nombre)).toBeVisible();
      await expect(a.getByText(codigo.codigo)).toBeVisible(); // el código del anuncio quedó en la atribución del lead
      await cap(a, "recorrido-1-anuncio-05-ficha-con-su-origen", true);
      // Y en el servidor quedó UN lead con el teléfono normalizado y su campaña.
      const leads = await json<{ datos: { id: string; telefono: string | null; campana_id: string | null }[] }>(admin, `/api/leads?limite=100`);
      const suyos = leads.datos.filter((l) => l.telefono === `+52${d.telefonoLanding}`);
      expect(suyos).toHaveLength(1);
      expect(suyos[0]!.campana_id).toBe(campana.id);
      await asesor.cerrar();
    });

    test(`recorrido 2: la clase muestra, el registro de la maestra con salud y el pase de lista (${vista})`, async ({ browser, baseURL }) => {
      const base = baseURL!;
      const clase = d.clase;
      // El asesor ve la clase agendada en la ficha del lead.
      const asesor = await contextoNuevo(browser, base, vista, "asesor");
      await asesor.page.goto(`/leads/${clase.leadId}`);
      await expect(asesor.page.locator("[data-prueba^='clase-']").first()).toContainText("Agendada");
      await cap(asesor.page, "recorrido-2-clase-muestra-01-clase-agendada-en-la-ficha", true);
      await asesor.cerrar();

      // La maestra entra por la pantalla de acceso y ve su día.
      const maestra = await contextoNuevo(browser, base, vista, null);
      const m = maestra.page;
      await entrarPorPantalla(m, R.maestra.correo, R.maestra.contrasena);
      await expect(m.getByTestId(`clase-${clase.id}`)).toContainText(clase.prospecto);
      await cap(m, "recorrido-2-clase-muestra-02-hoy-de-la-maestra");

      // El registro del alumno, de los adultos, de salud y del reglamento.
      await m.getByTestId(`clase-${clase.id}`).getByRole("link", { name: "Registro del alumno" }).click();
      await expect(m.getByRole("heading", { name: "Registro del alumno" })).toBeVisible();
      const guardar = (s: Locator) => s.getByRole("button", { name: /Guardar esta sección|Reintentar guardado/ });
      const alumno = await abrirSeccion(m, "alumno");
      await alumno.getByLabel("Nombre", { exact: false }).first().fill(vista === "celular" ? "Sofía" : "Tomás");
      await alumno.getByLabel("Apellidos").fill("Recorrido Vega");
      await alumno.getByLabel("Fecha de nacimiento (del acta)").fill("2018-05-04");
      await alumno.getByRole("radio", { name: vista === "celular" ? "Femenino" : "Masculino" }).check();
      await alumno.getByLabel("Escuela", { exact: true }).fill("Escuela de prueba");
      await alumno.getByLabel("Turno en la escuela").selectOption("matutino");
      await alumno.getByLabel("Talla de uniforme").fill("8");
      await guardar(alumno).click();
      await expect(alumno.getByRole("status")).toContainText("Guardado a las");
      await cap(m, "recorrido-2-clase-muestra-03-registro-del-alumno", true);

      const adultos = await abrirSeccion(m, "tutores");
      await adultos.getByRole("button", { name: "Agregar adulto" }).click();
      const a1 = adultos.getByTestId("adulto-0");
      await a1.getByLabel(/^Nombre/).fill("Rosa");
      await a1.getByLabel("Apellidos").fill("Recorrido");
      await a1.getByLabel("Parentesco").fill("madre");
      await a1.getByLabel("Teléfono").fill("55 1234 5678");
      await a1.getByLabel("Es el responsable de pago").check();
      await a1.getByLabel("Es quien lo lleva").check();
      await guardar(adultos).click();
      await expect(adultos.getByRole("status")).toContainText("Guardado a las");

      const salud = await abrirSeccion(m, "salud");
      await salud.getByLabel("Alergias").fill("Ninguna");
      await salud.getByLabel("Condiciones médicas").fill("Asma leve");
      await salud.getByLabel("Medicamentos").fill("Ninguno");
      await salud.getByLabel("Nombre del contacto").fill("Marta Pérez");
      await salud.getByLabel("Teléfono del contacto").fill("5511112222");
      await salud.getByLabel("Parentesco o relación (opcional)").fill("tía");
      await salud.getByRole("radio", { name: "Sí" }).check();
      await salud.getByRole("button", { name: "Guardar salud y seguridad" }).click();
      await expect(salud.getByText("Guardado", { exact: true })).toBeVisible();
      // La salud se captura y sale de la pantalla: no queda a la vista ni en el navegador.
      await expect(salud.getByLabel("Condiciones médicas")).toHaveValue("");
      expect(await m.evaluate(() => JSON.stringify({ local: { ...localStorage }, sesion: { ...sessionStorage }, url: location.href }))).not.toMatch(/Asma|Marta|5511112222/);
      await cap(m, "recorrido-2-clase-muestra-04-salud-guardada-y-fuera-de-pantalla");

      const antecedentes = await abrirSeccion(m, "antecedentes");
      await antecedentes.getByRole("radio", { name: "No" }).first().check();
      await antecedentes.getByLabel("¿Por qué quiere tomar la clase?").selectOption("disciplina");
      await guardar(antecedentes).click();
      await expect(antecedentes.getByRole("status")).toContainText("Guardado a las");
      const observacion = await abrirSeccion(m, "observacion");
      await observacion.getByLabel("Grupo recomendado").selectOption({ label: R.grupoPase.nombre });
      await observacion.getByRole("radio", { name: "Alto" }).check();
      await guardar(observacion).click();
      await expect(observacion.getByRole("status")).toContainText("Guardado a las");
      const legal = await abrirSeccion(m, "legal");
      const reglamento = legal.getByTestId("documento-reglamento");
      await reglamento.getByLabel("¿Quién responde?").selectOption({ label: "Rosa (madre)" });
      await reglamento.getByRole("button", { name: "Aceptan", exact: true }).click();
      await expect(reglamento.getByTestId("frase-legal")).toContainText("Aceptó el reglamento v1");
      await expect(m.getByTestId("faltantes")).toHaveCount(0);
      await m.getByRole("button", { name: "Marcar registro como completo" }).click();
      await expect(m.getByText("Registro: Completo")).toBeVisible();
      await cap(m, "recorrido-2-clase-muestra-05-registro-completo");
      expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${clase.id}/registro`)).estatus).toBe("completo");

      // Asistió, desde «Hoy».
      await m.goto("/hoy");
      const tarjeta = m.getByTestId(`clase-${clase.id}`);
      await tarjeta.getByRole("button", { name: "Asistió", exact: true }).click();
      await expect(tarjeta).toContainText("Asistió");
      expect((await json<{ estatus: string }>(admin, `/api/clases-muestra/${clase.id}`)).estatus).toBe("asistio");
      await cap(m, "recorrido-2-clase-muestra-06-asistio");

      // El pase de lista de su grupo (una fecha distinta por vista: cada una toma el suyo).
      const fecha = haceDiasEnMexico(vista === "celular" ? 1 : 2);
      await m.goto("/pase");
      await m.getByLabel("Fecha de la clase").fill(fecha);
      for (const n of R.alumnosDelPase) await expect(m.getByRole("group", { name: n })).toBeVisible();
      await m.getByRole("button", { name: /Marcar presentes a todos/ }).click();
      await m.getByRole("group", { name: R.alumnosDelPase[1]! }).getByRole("radio", { name: "Falta" }).check();
      await expect(m.getByTestId("resumen-pase")).toContainText("Presentes 1");
      await expect(m.getByTestId("resumen-pase")).toContainText("Faltas 1");
      await m.getByRole("button", { name: "Guardar pase de lista" }).click();
      await expect(m.getByTestId("resultado-pase")).toContainText("2 nuevas, 0 corregidas, 0 sin cambio");
      await cap(m, "recorrido-2-clase-muestra-07-pase-de-lista");
      const lista = await json<{ pase_tomado: boolean; lista: { alumno: string; estatus: string }[] }>(admin, `/api/grupos/${R.grupoPase.id}/pase?fecha=${fecha}`);
      expect(lista.pase_tomado).toBe(true);
      expect(Object.fromEntries(lista.lista.map((f) => [f.alumno, f.estatus]))).toEqual({ [R.alumnosDelPase[0]!]: "presente", [R.alumnosDelPase[1]!]: "falta" });
      await maestra.cerrar();
    });

    test(`recorrido 3: del lead a la familia y la inscripción, sin recaptura (${vista})`, async ({ browser, baseURL }) => {
      const c = d.conversion;
      const asesor = await contextoNuevo(browser, baseURL!, vista, "asesor");
      const a = asesor.page;
      const siguiente = a.getByRole("button", { name: /^(Siguiente|Revisar y confirmar)$/ });
      const cliente = await apiComo("asesor");
      const previa = await json<{ listo: boolean; faltantes: { campo: string }[] }>(cliente, `/api/leads/${c.leadId}/conversion`);
      await cliente.dispose();
      // Lo único que falta es lo que la maestra no capturó: los apellidos y el reglamento.
      expect(previa.faltantes.map((f) => f.campo).sort()).toEqual([`prospectos.${c.prospectoId}.alumno.apellidos`, `prospectos.${c.prospectoId}.reglamento`].sort());

      await a.goto(`/leads/${c.leadId}`);
      await expect(a.getByRole("heading", { name: c.nombre })).toBeVisible();
      await cap(a, "recorrido-3-conversion-01-ficha-del-lead", true);
      await a.goto(`/leads/${c.leadId}/convertir`);
      await expect(a.getByTestId("adultos-capturados")).toContainText(`${c.adulto} Prado`);
      await expect(a.getByText("En este paso no hay nada por capturar")).toBeVisible();
      await cap(a, "recorrido-3-conversion-02-la-familia-sale-del-registro");
      await siguiente.click();
      const alumno = a.getByTestId(`alumno-${c.prospectoId}`);
      await expect(alumno).toContainText(`Nombre: ${c.alumno}`);
      await expect(alumno.getByRole("textbox")).toHaveCount(1); // solo los apellidos: nada se vuelve a capturar
      await expect(siguiente).toBeDisabled();
      await cap(a, "recorrido-3-conversion-03-solo-faltan-los-apellidos");
      await alumno.getByLabel(/^Apellidos/).fill(c.apellidos);
      await siguiente.click();
      const grupo = a.getByTestId(`grupo-${c.prospectoId}`);
      await expect(grupo.getByRole("radio", { name: new RegExp(`${R.grupoConversion.nombre} · \\d+ lugares · recomendado por el maestro`) })).toBeChecked();
      await cap(a, "recorrido-3-conversion-04-grupo-recomendado-con-lugares-reales");
      await siguiente.click();
      const precio = a.getByTestId(`precio-${c.prospectoId}`);
      await expect(precio).toContainText("Inscripción$500.00");
      await expect(precio).toContainText("Mensualidad$1,000.00");
      await siguiente.click();
      const doc = a.getByTestId(`reglamento-${c.prospectoId}`).getByTestId("documento-reglamento");
      await doc.getByLabel("¿Quién responde?").selectOption({ label: `${c.adulto} (madre)` });
      await doc.getByRole("button", { name: "Aceptan", exact: true }).click();
      await a.getByRole("button", { name: "Revisar y confirmar" }).click();
      await expect(a.getByRole("heading", { name: "Confirmar" })).toBeVisible();
      await expect(a.getByTestId("lo-que-falta")).toHaveCount(0);
      await cap(a, "recorrido-3-conversion-05-confirmar", true);
      await a.getByRole("button", { name: "Convertir e inscribir" }).click();
      await expect(a.getByTestId("conversion-lista")).toContainText("Alumno creado · inscrito");
      await cap(a, "recorrido-3-conversion-06-alumno-inscrito");
      const alumnos = await json<{ datos: { id: string; apellidos: string; sexo: string; escuela_nombre: string; tutores: { nombre: string; telefono: string }[] }[] }>(admin, `/api/alumnos?nombre=${encodeURIComponent(c.alumno)}`);
      const suyo = alumnos.datos.find((x) => x.apellidos === c.apellidos)!;
      expect(suyo).toMatchObject({ escuela_nombre: "Escuela Nueva" });
      expect(suyo.tutores[0]!.nombre).toBe(c.adulto);
      const insc = await json<{ datos: { grupo_id: string; estatus: string }[] }>(admin, `/api/inscripciones?alumno_id=${suyo.id}`);
      expect(insc.datos).toHaveLength(1);
      expect(insc.datos[0]).toMatchObject({ grupo_id: R.grupoConversion.id, estatus: "activa" });
      await asesor.cerrar();
    });

    test(`recorrido 4: el pago repartido entre dos hijos, el estado de cuenta y el uniforme por entregar (${vista})`, async ({ browser, baseURL }) => {
      const p = d.pago;
      const [uno, dos] = p.hijos as [(typeof p.hijos)[number], (typeof p.hijos)[number]];
      const recepcion = await contextoNuevo(browser, baseURL!, vista, "recepcion");
      const r = recepcion.page;
      const cuenta = () => json<{ resumen: { saldo: string; total_pagado: string }; hijos: { alumno: { id: string }; saldo: string }[] }>(admin, `/api/tutores/${p.tutorId}/estado-cuenta`);
      expect((await cuenta()).resumen.saldo).toBe("3000.00"); // dos hijos: inscripción $500 y primera mensualidad $1,000 cada uno

      await r.goto("/pagos");
      await r.getByLabel("Teléfono o nombre de la familia").fill(p.telefono);
      await r.getByRole("button", { name: "Buscar" }).click();
      await r.getByTestId(`familia-${p.tutorId}`).getByRole("button", { name: "Elegir" }).click();
      await expect(r.getByTestId("saldo-total")).toHaveText("$3,000.00");
      await cap(r, "recorrido-4-cobro-01-lo-que-adeuda-la-familia");
      await r.getByLabel(/^Monto recibido/).fill("2000");
      await r.getByLabel("Método de pago").selectOption("efectivo");
      await r.getByRole("button", { name: "Ajustar el reparto a mano" }).click();
      const ajuste = r.getByTestId("ajuste");
      for (const campo of await ajuste.getByRole("textbox").all()) await campo.fill("");
      await ajuste.getByLabel(new RegExp(`${uno.nombre} · Mensualidad`)).fill("1000");
      await ajuste.getByLabel(new RegExp(`${dos.nombre} · Mensualidad`)).fill("1000");
      await expect(r.getByTestId("suma-del-reparto")).toContainText("cuadra");
      await cap(r, "recorrido-4-cobro-02-reparto-entre-dos-hijos", true);
      await r.getByRole("button", { name: "Registrar pago" }).click();
      const listo = r.getByTestId("pago-registrado");
      await expect(listo).toContainText("$2,000.00");
      await expect(listo).toContainText(`${uno.nombre} · Mensualidad`);
      await expect(listo).toContainText(`${dos.nombre} · Mensualidad`);
      await cap(r, "recorrido-4-cobro-03-pago-registrado");
      const c = await cuenta();
      expect([c.resumen.saldo, c.resumen.total_pagado]).toEqual(["1000.00", "2000.00"]);
      expect(c.hijos.map((h) => h.saldo)).toEqual(["500.00", "500.00"]);

      await listo.getByRole("link", { name: "Ver el estado de cuenta" }).click();
      await expect(r.getByTestId("saldo")).toHaveText("$1,000.00");
      await expect(r.getByTestId("pagos-de-la-cuenta")).toContainText("$2,000.00");
      await cap(r, "recorrido-4-cobro-04-estado-de-cuenta", true);

      // Pagar la primera mensualidad liberó el uniforme de cada hijo: recepción lo entrega.
      await r.goto("/uniformes");
      const fila = r.locator("[data-prueba^='beneficio-']", { hasText: uno.nombre });
      await expect(fila).toContainText(`talla ${p.talla}`);
      await expect(r.locator("[data-prueba^='beneficio-']", { hasText: dos.nombre })).toBeVisible();
      await cap(r, "recorrido-4-cobro-05-uniformes-por-entregar");
      await fila.getByRole("button", { name: "Marcar entregado" }).click();
      const dialogo = r.getByRole("dialog");
      await expect(dialogo.getByLabel("Pieza que se entrega")).toContainText(`talla ${p.talla}`);
      await dialogo.getByRole("button", { name: "Marcar como entregado" }).click();
      await expect(r.locator("[data-prueba^='beneficio-']", { hasText: uno.nombre })).toHaveCount(0);
      await expect(r.locator("[data-prueba^='beneficio-']", { hasText: dos.nombre })).toBeVisible();
      await cap(r, "recorrido-4-cobro-06-uniforme-entregado");
      await recepcion.cerrar();
    });

    test(`recorrido 5: los tableros y la exportación a CSV (${vista})`, async ({ browser, baseURL }) => {
      const adm = await contextoNuevo(browser, baseURL!, vista, "administrador");
      const t = adm.page;
      const descargar = async (enlace: Locator): Promise<string> => {
        const [descarga] = await Promise.all([t.waitForEvent("download"), enlace.click()]);
        expect(descarga.suggestedFilename()).toMatch(/\.csv$/);
        return readFileSync((await descarga.path())!, "utf8");
      };
      await t.goto("/tableros");
      const api = await json<{ total: { agendadas: number; asistidas: number; conversion: string | null } }>(admin, "/api/reportes/clases-muestra");
      await expect(t.getByTestId("ind-agendadas")).toContainText(String(api.total.agendadas));
      await cap(t, "recorrido-5-tableros-01-clases-muestra");
      const csvClases = await descargar(t.getByTestId("descargar-clases"));
      expect(csvClases.startsWith("﻿")).toBe(true);

      // El gasto de la campaña se captura a mano; el costo por lead se divide al centavo. Se da de baja al terminar para dejar el tablero como estaba.
      await t.goto("/tableros?vista=costo");
      const fila = t.getByTestId(`costo-${mundo.tableros.campana.id}`);
      await fila.getByRole("button", { name: "Gastos" }).click();
      const dialogo = t.getByRole("dialog");
      await dialogo.getByLabel("Monto (MXN)").fill("1,200");
      await dialogo.getByLabel(/Nota/).fill(`Gasto del recorrido (${vista})`);
      await dialogo.getByRole("button", { name: "Capturar el gasto" }).click();
      await expect(dialogo.getByTestId("gasto-total")).toHaveText("$1,200.00");
      await dialogo.getByRole("button", { name: "Cerrar" }).click();
      await expect(fila).toContainText("$1,200.00");
      await expect(fila).toContainText("$300.00"); // 1,200.00 entre los 4 leads de la campaña
      await cap(t, "recorrido-5-tableros-02-costo-por-campana");
      const csvCosto = await descargar(t.getByTestId("descargar-costo"));
      expect(csvCosto).toContain("1200.00");
      await fila.getByRole("button", { name: "Gastos" }).click();
      await t.getByRole("dialog").getByTestId("gastos").getByRole("listitem").filter({ hasText: `Gasto del recorrido (${vista})` }).getByRole("button", { name: "Dar de baja" }).click();
      // V7: quitar un gasto se confirma en la misma fila.
      await t.getByRole("dialog").getByRole("button", { name: "Sí, quitarlo" }).click();
      await expect(t.getByRole("dialog").getByTestId("gasto-total")).toHaveText("$0.00");
      await t.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();

      await t.goto("/tableros?vista=ejecutivo");
      const ej = await json<{ ingreso_mensual_recurrente: string; cartera_vencida: { total: string } }>(admin, "/api/reportes/ejecutivo");
      await expect(t.getByTestId("ind-ingreso")).toContainText(pesos(ej.ingreso_mensual_recurrente));
      await expect(t.getByTestId("ind-cartera")).toContainText(pesos(ej.cartera_vencida.total));
      await cap(t, "recorrido-5-tableros-03-ejecutivo", true);
      const csvEjecutivo = await descargar(t.getByTestId("descargar-ejecutivo"));
      expect(csvEjecutivo).toContain(ej.ingreso_mensual_recurrente);
      await adm.cerrar();
    });
  });
}
