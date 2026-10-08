// La máquina de captación con la clase muestra encendida (D1). Pura: las sesiones y sus lugares vienen en el contexto.
// Nombres neutros a propósito (invariante 2).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpcionHorario } from "../cotizador/cotizacion.ts";
import { esAgradecimiento, avanzar, textos, type ContextoCaptacion, type EstadoCaptacion, type OpcionFechaMuestra } from "./maquina.ts";

const NORTE = { id: "s-norte", nombre: "Norte", direccion: null };
const fecha = (iso: string, texto: string, lugares: number): OpcionFechaMuestra => ({ fechaHora: iso, nombre: texto, lugares });
const F1 = fecha("2026-11-02T22:00:00.000Z", "lunes 2 de noviembre a las 16:00", 3);
const F2 = fecha("2026-11-09T22:00:00.000Z", "lunes 9 de noviembre a las 16:00", 1);
const F3 = fecha("2026-11-16T22:00:00.000Z", "lunes 16 de noviembre a las 16:00", 2);
const HORARIO_A: OpcionHorario = { grupoId: "g-a", nombre: "Grupo A", horarioTexto: "lunes de 16:00 a 17:00", oferta: "lugar", lugares: 3 };
const HORARIO_LLENO: OpcionHorario = { grupoId: "g-lleno", nombre: "Grupo lleno", horarioTexto: "martes de 16:00 a 17:00", oferta: "lista_de_espera", lugares: 0 };

function ctx(extra: Partial<NonNullable<ContextoCaptacion["claseMuestra"]>> | null, o: { cotizador?: boolean; claseAgendada?: { texto: string } } = {}): ContextoCaptacion {
  const base: ContextoCaptacion = {
    nombreVertical: "Vertical Uno",
    sucursales: [NORTE],
    ...(o.claseAgendada ? { claseAgendada: o.claseAgendada } : {}),
  };
  if (o.cotizador === false) return base;
  return {
    ...base,
    cotizador: {
      verticalId: "v-1",
      catalogo: {
        fecha: "2026-11-02",
        programas: [
          {
            id: "p-1", nombre: "Programa uno", descripcionPublica: null, nivel: null, verticalId: "v-1", sucursalId: NORTE.id, edadMin: 3, edadMax: 12, fechaCorteEdad: null, permiteTraslape: false, precio: null,
            grupos: [
              { id: "g-a", nombre: "Grupo A", cupoMaximo: 3, permiteListaEspera: false, ocupados: 0, horarios: [{ dia: 1, inicioMin: 960, finMin: 1020 }] },
              { id: "g-lleno", nombre: "Grupo lleno", cupoMaximo: 1, permiteListaEspera: true, ocupados: 1, horarios: [{ dia: 2, inicioMin: 960, finMin: 1020 }] },
            ],
          },
        ],
        promociones: [],
      },
      sucursalSinPrograma: "ofrecer_otra",
      vigenciaDias: 7,
      cotizacionGuardada: { opciones: [HORARIO_A, HORARIO_LLENO], grupoElegidoId: null },
    },
    ...(extra ? { claseMuestra: { proximasPorGrupo: { "g-a": [F1, F2, F3] }, ofrecida: null, yaAgendada: {}, nombresDeGrupo: { "g-a": "Grupo A" }, ...extra } } : {}),
  };
}

const enHorario: EstadoCaptacion = { paso: "horario", intentosFallidos: 0, nombre: "Luis", edad: 8, sucursalId: NORTE.id, programaId: "p-1" };
const enFecha: EstadoCaptacion = { ...enHorario, paso: "fecha_muestra" };
const propuesta = { grupoId: "g-a", opciones: [F1, F2, F3] };

test("D1 máquina: al elegir un horario con lugar propone las fechas (numeradas, con lugares) y guarda lo que le dijo", () => {
  const r = avanzar(enHorario, "1", ctx({}));
  assert.equal(r.estado.paso, "fecha_muestra");
  assert.equal(r.pasarAAsesor, null);
  assert.deepEqual(r.respuestas, [textos.proponerFechasMuestra("Luis", HORARIO_A, [F1, F2, F3])]);
  assert.equal(r.respuestas[0], "Para Luis podemos agendar una clase muestra en Grupo A (lunes de 16:00 a 17:00). Estas son las próximas fechas con lugar; responde con el número de la que prefieras, o escribe «asesor» para hablar con una persona:\n1. lunes 2 de noviembre a las 16:00 · 3 lugares\n2. lunes 9 de noviembre a las 16:00 · 1 lugar\n3. lunes 16 de noviembre a las 16:00 · 2 lugares");
  assert.deepEqual(r.efectos, [{ tipo: "elegir_grupo", grupoId: "g-a" }, { tipo: "ofrecer_fechas_muestra", grupoId: "g-a", fechas: [F1.fechaHora, F2.fechaHora, F3.fechaHora] }]);
});

test("D1 máquina: sin la clase muestra encendida, o sin fechas con lugar, o con lista de espera: el cierre de siempre", () => {
  const sin = avanzar(enHorario, "1", ctx(null));
  assert.equal(sin.estado.paso, "completo");
  assert.equal(sin.pasarAAsesor, "captura_completa");
  assert.match(sin.respuestas[0]!, /Anotamos a Luis en Grupo A/);
  const vacio = avanzar(enHorario, "1", ctx({ proximasPorGrupo: { "g-a": [] } }));
  assert.equal(vacio.pasarAAsesor, "captura_completa");
  // Un horario lleno con lista de espera sigue su camino (C9).
  const lleno = avanzar(enHorario, "2", ctx({}));
  assert.equal(lleno.estado.paso, "lista_espera");
});

test("D1 máquina: elige una fecha con lugar → pide agendarla, confirma y NO pasa a una persona (deja una nota)", () => {
  const r = avanzar(enFecha, "2", ctx({ ofrecida: propuesta }));
  assert.equal(r.estado.paso, "completo");
  assert.equal(r.pasarAAsesor, null);
  assert.equal(r.notaAAsesores, "muestra_agendada");
  assert.deepEqual(r.efectos, [{ tipo: "agendar_muestra", grupoId: "g-a", fechaHora: F2.fechaHora }]);
  assert.equal(r.respuestas[0], "¡Listo! Agendamos la clase muestra de Luis en Grupo A, sucursal Norte: lunes 9 de noviembre a las 16:00. Te mandamos un recordatorio antes de la clase. Si necesitas cambiar la fecha, escríbenos por aquí.");
  // También por el nombre de la fecha.
  assert.equal(avanzar(enFecha, "16 de noviembre", ctx({ ofrecida: propuesta })).efectos?.[0]?.tipo === "agendar_muestra", true);
});

test("D1 máquina: la fecha que eligió ya no tiene lugar → las que quedan (de hoy), o una persona si no queda ninguna", () => {
  const llena = { grupoId: "g-a", opciones: [{ ...F1, lugares: 0 }, F2, F3] };
  const r = avanzar(enFecha, "1", ctx({ ofrecida: llena, proximasPorGrupo: { "g-a": [F2, F3] } }));
  assert.equal(r.estado.paso, "fecha_muestra");
  assert.equal(r.respuestas[0], "Esa fecha ya no tiene lugar. Estas son las que quedan; responde con el número de la que prefieras:\n1. lunes 9 de noviembre a las 16:00 · 1 lugar\n2. lunes 16 de noviembre a las 16:00 · 2 lugares");
  assert.deepEqual(r.efectos, [{ tipo: "ofrecer_fechas_muestra", grupoId: "g-a", fechas: [F2.fechaHora, F3.fechaHora] }]);
  const ninguna = avanzar(enFecha, "1", ctx({ ofrecida: llena, proximasPorGrupo: { "g-a": [] } }));
  assert.equal(ninguna.pasarAAsesor, "captura_completa");
  assert.equal(ninguna.respuestas[0], textos.sinFechasMuestra);
  assert.equal(ninguna.efectos?.some((e) => e.tipo === "agendar_muestra"), false);
});

test("D1 máquina: «asesor» y «no» pasan a una persona; una respuesta sin sentido se reintenta y a la tercera pasa", () => {
  for (const t of ["asesor", "no", "No, gracias"]) {
    const r = avanzar(enFecha, t, ctx({ ofrecida: propuesta }));
    assert.equal(r.pasarAAsesor, "pidio_asesor", t);
    assert.equal(r.efectos, undefined);
  }
  let e = enFecha;
  for (let i = 1; i <= 2; i++) {
    const r = avanzar(e, "no sé", ctx({ ofrecida: propuesta }));
    assert.equal(r.pasarAAsesor, null);
    assert.match(r.respuestas[0]!, /Responde con el número de la fecha/);
    e = r.estado;
  }
  assert.equal(avanzar(e, "no sé", ctx({ ofrecida: propuesta })).pasarAAsesor, "sin_entender");
  assert.equal(avanzar(enFecha, "7", ctx({ ofrecida: propuesta })).respuestas[0]!.startsWith("Responde con el número de la fecha"), true, "un número fuera de la lista");
});

test("D1 máquina: sin propuesta guardada se manda una nueva; si el interruptor se apagó a media conversación, cierra como siempre", () => {
  const nueva = avanzar(enFecha, "1", ctx({ ofrecida: null }, {}));
  // Sin propuesta guardada y sin horario elegido no hay a qué grupo ofrecerle fechas: cierra.
  assert.equal(nueva.estado.paso, "completo");
  const conGrupo = ctx({ ofrecida: null });
  conGrupo.cotizador!.cotizacionGuardada = { opciones: [HORARIO_A], grupoElegidoId: "g-a" };
  const r = avanzar(enFecha, "lo que sea", conGrupo);
  assert.equal(r.estado.paso, "fecha_muestra");
  assert.match(r.respuestas[0]!, /Esa fecha ya no tiene lugar/);
  const apagada = avanzar(enFecha, "1", ctx(null));
  assert.equal(apagada.estado.paso, "completo");
  assert.equal(apagada.pasarAAsesor, "captura_completa");
  assert.equal(avanzar(enFecha, "1", ctx(null, { cotizador: false })).pasarAAsesor, "captura_completa");
});

test("D1 máquina: si ya tenía una clase muestra vigente en ese grupo, se lo dice y no agenda otra", () => {
  const ya = fecha("2026-11-09T22:00:00.000Z", "lunes 9 de noviembre a las 16:00", 0);
  const r = avanzar(enHorario, "1", ctx({ yaAgendada: { "g-a": ya } }));
  assert.equal(r.respuestas[0], "Luis ya tiene agendada su clase muestra: lunes 9 de noviembre a las 16:00. Si quieres cambiarla, escribe «asesor».");
  assert.equal(r.efectos, undefined);
  assert.equal(r.pasarAAsesor, null);
});

test("D1 máquina: después de agendar, un agradecimiento no pasa a una persona; cualquier otra cosa sí", () => {
  const completo: EstadoCaptacion = { ...enHorario, paso: "completo" };
  const con = ctx(null, { claseAgendada: { texto: "lunes 9 de noviembre a las 16:00" } });
  for (const t of ["gracias", "¡Muchas gracias!", "Ok", "perfecto", "ahí estaremos", "OK, gracias."]) {
    const r = avanzar(completo, t, con);
    assert.equal(r.pasarAAsesor, null, t);
    assert.deepEqual(r.respuestas, [textos.deNada("lunes 9 de noviembre a las 16:00")], t);
  }
  assert.equal(avanzar(completo, "¿hay estacionamiento?", con).pasarAAsesor, "captura_completa");
  // Sin clase agendada (el flujo de siempre) un «gracias» sí pasa a una persona.
  assert.equal(avanzar(completo, "gracias", ctx(null)).pasarAAsesor, "captura_completa");
  assert.equal(esAgradecimiento("gracias por la información"), true);
  assert.equal(esAgradecimiento("gracias, pero quiero cambiar la fecha"), false);
});

test("D1 máquina: la nota para el asesor dice que el bot sigue atendiendo", () => {
  const nota = textos.resumenAsesor("muestra_agendada", { nombre: "Luis", edad: 8, sucursal: "Norte", telefono: "+5255", cotizacion: ["• Clase muestra: lunes 9 de noviembre a las 16:00 (Grupo A)"] });
  assert.match(nota, /El bot agendó una clase muestra/);
  assert.match(nota, /el bot sigue atendiendo/);
  assert.match(nota, /Clase muestra: lunes 9 de noviembre a las 16:00 \(Grupo A\)/);
});
