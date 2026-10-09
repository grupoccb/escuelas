// K9: EK-A2 (apagar una automatización frena lo programado). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conAlcance } from "../datos/alcance.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { correrAutomatizaciones } from "../automatizaciones/motor.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";

let prisma: PrismaPruebas;

before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

test("EK-A2: apagar una automatización frena lo que ya estaba programado (se omite, no se manda)", async () => {
  const o = await sembrarOrganizacion(prisma, "Apagar K9");
  const p = await prisma.plantilla_mensaje.create({ data: { organizacion_id: o.organizacionId, codigo: "x", content_sid: "HXx", categoria: "utility", clase_mensaje: "servicio", cuerpo_referencia: "Hola", estado_aprobacion: "aprobada" } });
  const auto = await prisma.automatizacion.create({ data: { organizacion_id: o.organizacionId, nombre: "Apagable", evento_disparador: "clase_muestra_proxima", offset_minutos: -60, plantilla_id: p.id, max_intentos: 1, activo: false } });
  const pasado = new Date("2026-10-08T16:00:00Z");
  const ej = await prisma.automatizacion_ejecucion.create({ data: { organizacion_id: o.organizacionId, automatizacion_id: auto.id, entidad_tipo: "clase_muestra", entidad_id: "00000000-0000-4000-8000-0000000000aa", programado_para: pasado } });
  const transporte = new TransporteFalso();
  const r = await correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => new Date("2026-10-08T17:00:00Z") }), reloj: () => new Date("2026-10-08T17:00:00Z"), organizacionId: o.organizacionId });
  const fila = await conAlcance(prisma, o.organizacionId).automatizacion_ejecucion.findUniqueOrThrow({ where: { id: ej.id } });
  assert.equal(fila.estatus, "omitido");
  assert.equal(fila.motivo_omision, "automatizacion_apagada");
  assert.equal(r.enviadas, 0);
  assert.equal(transporte.envios.length, 0);
});
