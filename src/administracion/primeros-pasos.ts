// Primeros pasos de una escuela nueva (V7, recorrido del administrador): qué le falta al catálogo para que la escuela pueda recibir familias, calculado SIEMPRE contra el estado real
// (nada se «marca a mano»: un paso está hecho cuando los datos de la base lo muestran). Solo lee, por el scope de la organización (invariante 1: nunca se filtra a mano).
//
// Los ocho pasos, en el orden en que se hacen (cada uno necesita lo de antes):
//   disciplinas → sucursales (que impartan una disciplina) → programas → precios (todos los programas con precio vigente hoy) → grupos (con horario) → personas (un asesor, y
//   un maestro o recepción si ese módulo está encendido) → canal de WhatsApp (con su bandeja) → módulos (al menos uno encendido además de la captación).
//
// Todo es código determinista (invariante 10); no hay términos de vertical (invariante 2): los nombres que salen en los detalles son los de la propia escuela.

import type { Consultas } from "../datos/alcance.ts";
import { fechaLocal } from "../lib/horario.ts";
import { DEFINICION_DE_MODULOS, MODULOS_APAGABLES, type ModulosEncendidos } from "../modulos/index.ts";
import { aFecha } from "../catalogo/precios.ts";

export type IdDePaso = "disciplinas" | "sucursales" | "programas" | "precios" | "grupos" | "personas" | "canal" | "modulos";

export interface PasoInicial {
  id: IdDePaso;
  /** Lo que hay que hacer, en una frase. */
  titulo: string;
  hecho: boolean;
  /** Por qué falta (o qué más falta aunque el paso ya cuente como hecho); nulo si no hay nada que decir. */
  detalle: string | null;
  /** La pantalla de administración donde se hace. */
  ruta: string;
}

export interface PrimerosPasos {
  pasos: PasoInicial[];
  hechos: number;
  total: number;
  /** El primero que falta, o nulo si la escuela ya está lista. */
  siguiente: IdDePaso | null;
}

/** «A, B y C»; con más de `tope`, «A, B, C y 2 más». */
export function listaEnPalabras(nombres: readonly string[], tope = 3): string {
  const mostrados = nombres.slice(0, tope);
  const resto = nombres.length - mostrados.length;
  const base = mostrados.length <= 1 ? (mostrados[0] ?? "") : `${mostrados.slice(0, -1).join(", ")} y ${mostrados[mostrados.length - 1]}`;
  if (resto <= 0) return base;
  return `${mostrados.join(", ")} y ${resto} más`;
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

/** Qué roles hacen falta según los módulos que la escuela tiene encendidos (el asesor siempre: la captación nunca se apaga). */
export function rolesNecesarios(modulos: ModulosEncendidos): { rol: "asesor" | "maestro" | "recepcion"; nombre: string }[] {
  return [
    { rol: "asesor", nombre: "un asesor" },
    ...(modulos.clase_muestra || modulos.operacion ? [{ rol: "maestro" as const, nombre: "un maestro" }] : []),
    ...(modulos.finanzas ? [{ rol: "recepcion" as const, nombre: "una persona de recepción" }] : []),
  ];
}

/** Calcula los ocho pasos con lo que hay en la base de la organización del scope. `ahora` decide qué precio «rige hoy» (en la zona de cada sucursal). */
export async function calcularPrimerosPasos(db: Consultas, ahora: Date, modulos: ModulosEncendidos): Promise<PrimerosPasos> {
  const [verticales, sucursales, ofrecidas, programas, grupos, usuarios, canales, bandejas] = await Promise.all([
    db.vertical.findMany({ where: { activo: true }, select: { id: true } }),
    db.sucursal.findMany({ where: { activo: true }, select: { id: true, nombre: true, zona_horaria: true } }),
    db.sucursal_vertical.findMany({ where: { activo: true }, select: { sucursal_id: true, vertical_id: true } }),
    db.programa.findMany({ where: { activo: true }, select: { id: true, nombre: true, sucursal_id: true } }),
    db.grupo.findMany({ where: { activo: true }, select: { id: true, nombre: true, horarios: { where: { eliminado_en: null }, select: { id: true } } } }),
    db.usuario.findMany({ where: { activo: true }, select: { rol: true } }),
    db.canal_whatsapp.findMany({ where: { activo: true }, select: { id: true, nombre_publico: true } }),
    db.bandeja_chatwoot.findMany({ where: {}, select: { canal_whatsapp_id: true } }),
  ]);

  // 1. Disciplinas.
  const disciplinas: PasoInicial = { id: "disciplinas", titulo: "Da de alta lo que imparte la escuela (una disciplina)", hecho: verticales.length > 0, detalle: null, ruta: "/admin/verticales" };

  // 2. Sucursales que imparten una disciplina activa.
  const verticalesVivas = new Set(verticales.map((v) => v.id));
  const conDisciplina = new Set(ofrecidas.filter((o) => verticalesVivas.has(o.vertical_id)).map((o) => o.sucursal_id));
  const sucursalesListas = sucursales.filter((s) => conDisciplina.has(s.id));
  const sinDisciplina = sucursales.filter((s) => !conDisciplina.has(s.id));
  const pasoSucursales: PasoInicial = {
    id: "sucursales",
    titulo: "Da de alta una sucursal y marca qué disciplinas imparte",
    hecho: sucursalesListas.length > 0,
    detalle:
      sucursales.length === 0
        ? null
        : sinDisciplina.length > 0
          ? `${sinDisciplina.length === 1 ? "La sucursal" : "Las sucursales"} ${listaEnPalabras(sinDisciplina.map((s) => `«${s.nombre}»`))} no ${sinDisciplina.length === 1 ? "imparte" : "imparten"} ninguna disciplina todavía: márcala${sinDisciplina.length === 1 ? "" : "s"} en Sucursales.`
          : null,
    ruta: "/admin/sucursales",
  };

  // 3. Programas.
  const pasoProgramas: PasoInicial = { id: "programas", titulo: "Crea un programa (para qué edades es)", hecho: programas.length > 0, detalle: null, ruta: "/admin/programas" };

  // 4. Precio vigente HOY (en la zona de la sucursal del programa) de cada programa.
  const zonaDe = new Map(sucursales.map((s) => [s.id, s.zona_horaria]));
  const precios = programas.length === 0 ? [] : await db.precio.findMany({ where: { programa_id: { in: programas.map((p) => p.id) } }, select: { programa_id: true, vigencia_desde: true, vigencia_hasta: true } });
  const sinPrecio = programas.filter((p) => {
    const hoy = aFecha(fechaLocal(ahora, zonaDe.get(p.sucursal_id) ?? "America/Mexico_City"));
    return !precios.some((x) => x.programa_id === p.id && x.vigencia_desde <= hoy && (x.vigencia_hasta === null || x.vigencia_hasta >= hoy));
  });
  const pasoPrecios: PasoInicial = {
    id: "precios",
    titulo: "Ponle precio a cada programa",
    hecho: programas.length > 0 && sinPrecio.length === 0,
    detalle: programas.length === 0 ? "Primero crea un programa." : sinPrecio.length > 0 ? `Falta el precio de ${listaEnPalabras(sinPrecio.map((p) => `«${p.nombre}»`))}: sin precio no aparece en el cotizador ni se puede inscribir a nadie.` : null,
    ruta: "/admin/precios",
  };

  // 5. Grupos con horario (sin horario no aparecen en el cotizador).
  const conHorario = grupos.filter((g) => g.horarios.length > 0);
  const sinHorario = grupos.length - conHorario.length;
  const pasoGrupos: PasoInicial = {
    id: "grupos",
    titulo: "Crea un grupo con su horario y su cupo",
    hecho: conHorario.length > 0,
    detalle: sinHorario > 0 ? `${plural(sinHorario, "grupo no tiene", "grupos no tienen")} horario: sin horario no ${sinHorario === 1 ? "aparece" : "aparecen"} en el cotizador.` : null,
    ruta: "/admin/grupos",
  };

  // 6. Personas: un asesor y, según los módulos encendidos, un maestro y alguien de recepción.
  const faltan = rolesNecesarios(modulos).filter((r) => !usuarios.some((u) => u.rol === r.rol));
  const pasoPersonas: PasoInicial = {
    id: "personas",
    titulo: "Da de alta a las personas que usarán el sistema",
    hecho: faltan.length === 0,
    detalle: faltan.length > 0 ? `Falta ${listaEnPalabras(faltan.map((r) => r.nombre))}.` : null,
    ruta: "/admin/usuarios",
  };

  // 7. Canal de WhatsApp con su bandeja (sin ella los mensajes no llegan a los asesores).
  const conBandeja = new Set(bandejas.map((b) => b.canal_whatsapp_id));
  const canalesListos = canales.filter((c) => conBandeja.has(c.id));
  const canalesSinBandeja = canales.filter((c) => !conBandeja.has(c.id));
  const pasoCanal: PasoInicial = {
    id: "canal",
    titulo: "Conecta el número de WhatsApp de la escuela",
    hecho: canalesListos.length > 0,
    detalle: canalesListos.length === 0 && canalesSinBandeja.length > 0 ? `El canal ${listaEnPalabras(canalesSinBandeja.map((c) => `«${c.nombre_publico}»`))} todavía no tiene bandeja: sin ella los mensajes no llegan a los asesores.` : null,
    ruta: "/admin/canales",
  };

  // 8. Módulos: al menos uno encendido además de la captación (que siempre lo está).
  const apagados = MODULOS_APAGABLES.filter((m) => !modulos[m]);
  const pasoModulos: PasoInicial = {
    id: "modulos",
    titulo: "Enciende las partes del sistema que vas a usar",
    hecho: apagados.length < MODULOS_APAGABLES.length,
    detalle: apagados.length > 0 && apagados.length < MODULOS_APAGABLES.length ? `Apagados por ahora: ${listaEnPalabras(apagados.map((m) => DEFINICION_DE_MODULOS[m].nombre), 6)}. Enciéndelos cuando la escuela esté lista para usarlos.` : null,
    ruta: "/admin/modulos",
  };

  const pasos = [disciplinas, pasoSucursales, pasoProgramas, pasoPrecios, pasoGrupos, pasoPersonas, pasoCanal, pasoModulos];
  const hechos = pasos.filter((p) => p.hecho).length;
  return { pasos, hechos, total: pasos.length, siguiente: pasos.find((p) => !p.hecho)?.id ?? null };
}
