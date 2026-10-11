// Lo que las pantallas «Familias» y «Ficha de la familia» muestran junto a cada tutor (R6b), de solo lectura: las inscripciones activas de sus hijos con la disciplina (y su color), el grupo,
// el horario y la sucursal; la promoción aplicada, y, si quien pregunta puede ver importes, en qué estado va su cuenta («al corriente», «por pagar» o «con vencido»).
//
// Es UNA lectura por lote (no una por familia): la lista pide los tutores de su página (hasta 50) y la ficha pide el suyo. El alcance (qué familias ve quien pregunta) lo resuelve la ruta con
// `dondeTutorVisible` ANTES de llamar aquí; la organización, el scope único (invariante 1). Nada se inventa: sin inscripción activa, el hijo no trae disciplina.

import type { Consultas } from "../datos/alcance.ts";
import { hoyDeCadaSucursal, atrasoEn } from "../finanzas/estado-cuenta.ts";
import { deFecha } from "../catalogo/precios.ts";
import { aTexto, deDecimal, restar, sumar } from "../lib/dinero.ts";

export type EstadoDeSaldo = "al_corriente" | "por_pagar" | "con_vencido";

export interface InscripcionDelHijo {
  inscripcion_id: string;
  grupo: { id: string; nombre: string };
  programa: { id: string; nombre: string };
  disciplina: { id: string; nombre: string; color_marca: string | null };
  sucursal: { id: string; nombre: string };
  horarios: { dia_semana: number; hora_inicio_min: number; hora_fin_min: number }[];
  /** La promoción principal con la que se inscribió (null si no hubo). */
  promocion: { id: string; nombre: string } | null;
  /** Solo con permiso de importes: lo que descuenta de la mensualidad («100.00») y los meses gratis. */
  descuento_mensualidad: string | null;
  meses_gratis: number;
}

export interface ResumenDeFamilia {
  tutor_id: string;
  /** null = quien pregunta no ve importes (o el módulo de finanzas está apagado). */
  saldo: { estado: EstadoDeSaldo; cargos_vencidos: number; vencido: string } | null;
  hijos: { alumno_id: string; inscripciones: InscripcionDelHijo[] }[];
}

export interface OpcionesDeResumen {
  ahora: Date;
  /** Calcular el estado de la cuenta (permiso `estado_cuenta:leer` y módulo de finanzas encendido). */
  conSaldo: boolean;
  /** Devolver el descuento de la mensualidad (permiso `estado_cuenta:leer`). */
  conImportes: boolean;
}

const aLaMenor = <T>(a: T, b: T, clave: (x: T) => string): number => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0);

export async function resumenDeFamilias(db: Consultas, tutorIds: readonly string[], o: OpcionesDeResumen): Promise<ResumenDeFamilia[]> {
  if (tutorIds.length === 0) return [];
  const vinculos = await db.tutor_alumno.findMany({
    where: { tutor_id: { in: [...tutorIds] }, eliminado_en: null, alumno: { eliminado_en: null } },
    select: { tutor_id: true, alumno_id: true, creado_en: true },
    orderBy: [{ creado_en: "asc" }, { id: "asc" }],
  });
  const alumnoIds = [...new Set(vinculos.map((v) => v.alumno_id))];
  const inscripciones = alumnoIds.length === 0
    ? []
    : await db.inscripcion.findMany({
        where: { alumno_id: { in: alumnoIds }, estatus: "activa", eliminado_en: null },
        orderBy: [{ fecha_inscripcion: "asc" }, { id: "asc" }],
        select: {
          id: true,
          alumno_id: true,
          descuento_mensualidad_aplicado: true,
          meses_gratis_aplicados: true,
          promocion: { select: { id: true, nombre: true } },
          grupo: { select: { id: true, nombre: true, horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true, hora_fin_min: true } } } },
          programa: { select: { id: true, nombre: true, vertical: { select: { id: true, nombre: true, color_marca: true } }, sucursal: { select: { id: true, nombre: true } } } },
        },
      });
  const delAlumno = new Map<string, InscripcionDelHijo[]>();
  for (const i of inscripciones) {
    const lista = delAlumno.get(i.alumno_id) ?? [];
    lista.push({
      inscripcion_id: i.id,
      grupo: { id: i.grupo.id, nombre: i.grupo.nombre },
      programa: { id: i.programa.id, nombre: i.programa.nombre },
      disciplina: { id: i.programa.vertical.id, nombre: i.programa.vertical.nombre, color_marca: i.programa.vertical.color_marca },
      sucursal: { id: i.programa.sucursal.id, nombre: i.programa.sucursal.nombre },
      horarios: [...i.grupo.horarios].sort((a, b) => a.hora_inicio_min - b.hora_inicio_min || a.dia_semana - b.dia_semana),
      promocion: i.promocion ? { id: i.promocion.id, nombre: i.promocion.nombre } : null,
      descuento_mensualidad: o.conImportes ? aTexto(deDecimal(i.descuento_mensualidad_aplicado)) : null,
      meses_gratis: i.meses_gratis_aplicados,
    });
    delAlumno.set(i.alumno_id, lista);
  }

  const saldos = o.conSaldo ? await estadosDeSaldo(db, tutorIds, o.ahora) : null;
  return tutorIds.map((tutorId) => ({
    tutor_id: tutorId,
    saldo: saldos ? (saldos.get(tutorId) ?? { estado: "al_corriente", cargos_vencidos: 0, vencido: "0.00" }) : null,
    hijos: vinculos
      .filter((v) => v.tutor_id === tutorId)
      .map((v) => ({ alumno_id: v.alumno_id, inscripciones: [...(delAlumno.get(v.alumno_id) ?? [])].sort((a, b) => aLaMenor(a, b, (x) => `${x.disciplina.nombre}${x.grupo.nombre}${x.inscripcion_id}`)) })),
  }));
}

/** El estado de la cuenta de cada familia: con vencido si algún cargo abierto ya pasó su fecha en el calendario de SU sucursal; por pagar si solo debe lo que aún no vence. Solo lee. */
async function estadosDeSaldo(db: Consultas, tutorIds: readonly string[], ahora: Date): Promise<Map<string, NonNullable<ResumenDeFamilia["saldo"]>>> {
  const hoy = await hoyDeCadaSucursal(db, ahora);
  const abiertos = await db.cargo.findMany({
    where: { tutor_id: { in: [...tutorIds] }, estatus: { in: ["pendiente", "vencido"] } },
    select: { tutor_id: true, sucursal_id: true, monto_final: true, monto_pagado: true, fecha_vencimiento: true },
  });
  const porTutor = new Map<string, { debe: bigint; vencido: bigint; vencidos: number }>();
  for (const c of abiertos) {
    const saldo = restar(deDecimal(c.monto_final), deDecimal(c.monto_pagado));
    if (saldo <= 0n) continue;
    const vence = deFecha(c.fecha_vencimiento);
    const venció = atrasoEn(vence, hoy.get(c.sucursal_id) ?? vence) > 0;
    const acumulado = porTutor.get(c.tutor_id) ?? { debe: 0n, vencido: 0n, vencidos: 0 };
    acumulado.debe = sumar(acumulado.debe, saldo);
    if (venció) {
      acumulado.vencido = sumar(acumulado.vencido, saldo);
      acumulado.vencidos += 1;
    }
    porTutor.set(c.tutor_id, acumulado);
  }
  const salida = new Map<string, NonNullable<ResumenDeFamilia["saldo"]>>();
  for (const [tutorId, a] of porTutor) salida.set(tutorId, { estado: a.vencidos > 0 ? "con_vencido" : "por_pagar", cargos_vencidos: a.vencidos, vencido: aTexto(a.vencido) });
  return salida;
}
