// Datos de demo (I4): ~300 alumnos y seis meses de historia, generados de forma DETERMINISTA (PRNG con semilla fija) y SIEMPRE por los servicios reales del sistema, nunca con inserts
// a ciegas: leads de la landing (`registrarEnvioDeLanding`), clases muestra (`agendarClaseMuestra`, `marcarAsistencia`), aceptación del reglamento, conversión del lead en familia e
// inscripción (`convertirLead`, que genera sus cargos), el barrido mensual (`barrerFinanzas`), pagos (`registrarPago` con sus ganchos), pases de lista (`guardarPase` y sus
// derivados), bajas (`darDeBaja`), ventas (`venderProducto`) y la entrega de beneficios (`entregarBeneficio`). Lo único que se inserta directo es el catálogo de apoyo: campañas con su
// código de rastreo, el gasto que el administrador captura a mano y, si no hay, productos.
//
// LA HISTORIA. Un reloj simulado recorre día por día desde `hasta − meses` hasta `hasta`. Cada día, en este orden: los eventos programados (alta del lead, agendar la clase, marcar si
// asistió, convertir, bajas, ventas), el barrido de finanzas, los pagos que las familias hacen ese día según su perfil (puntual, parcial, tardío o moroso), la entrega de beneficios y el
// pase de lista de cada grupo que dio clase. Todo lo que se elige (a quién, cuánto, cuándo) sale del PRNG y de listas ordenadas por contenido, nunca del orden en que la base devuelva las
// filas: la misma semilla genera exactamente la misma historia.
//
// IDEMPOTENTE. Las filas del generador se MARCAN: todos sus teléfonos están en un bloque reservado (`+52 55 9900 NNNN`). Si la organización ya tiene alguno, no se genera nada y se devuelve
// `yaExistia: true` (volver a correrlo no duplica). Si una corrida se interrumpe a medias, se recrea la base de demo (no hay borrado físico).
// Al terminar corre la cuadratura (H7): si no da cero discrepancias, lanza.

import { recalcularDerivados } from "../asistencia/derivados.ts";
import { guardarPase, listaDelPase, cargarGrupoDelPase, sesionesDelDia, type EntradaDePase } from "../asistencia/pase.ts";
import { aFecha, deFecha, sumarDias, type FechaISO } from "../catalogo/precios.ts";
import { InscripcionesActivas } from "../catalogo/cupo.ts";
import { agendarClaseMuestra } from "../clases-muestra/agenda.ts";
import { marcarAsistencia } from "../clases-muestra/asistencia.ts";
import { cifradorDesdeEntorno } from "../sensibles/cifrado.ts";
import { cargarLanding, registrarEnvioDeLanding } from "../captacion/landing.ts";
import { convertirLead } from "../conversion/convertir.ts";
import { altaConAlcance, conAlcance, type BaseDatos } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { barrerFinanzas } from "../finanzas/barrido.ts";
import { entregarBeneficio } from "../finanzas/entrega.ts";
import { alRegistrarPago } from "../finanzas/despues-del-pago.ts";
import { cuadratura, type ResultadoDeCuadratura } from "../finanzas/cuadratura.ts";
import { registrarPago } from "../finanzas/pagos.ts";
import { venderProducto } from "../finanzas/productos.ts";
import { darDeBaja } from "../inscripciones/cambios.ts";
import { documentoVigente } from "../legal/documentos.ts";
import { registrarAceptacion } from "../legal/aceptaciones.ts";
import { cargarCatalogo, choquesDeInstructor, choquesDeSalon, traslapesDeEdad } from "../catalogo/verificacion.ts";
import { aTexto, deDecimal } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { crearAzar } from "../lib/azar.ts";
import { log } from "../lib/log.ts";
import { diasEntre } from "../lib/periodo.ts";

/** Prefijo (10 dígitos nacionales: 55 9900 NNNN) del bloque de teléfonos reservado a los datos de demo: la MARCA de sus filas. */
export const MARCA_DE_DEMO = "+52559900";
/** La nota de los gastos que captura el generador al final: es la señal de que la corrida terminó. */
export const NOTA_DEL_GASTO_DE_DEMO = "Datos de demo";
export const telefonoDeDemo = (indice: number): string => {
  // Por la única función de teléfonos (invariante 7): el bloque reservado es `55 9900 NNNN`.
  const t = normalizarTelefono(`55 9900 ${String(indice).padStart(4, "0")}`);
  if (t === null || !t.startsWith(MARCA_DE_DEMO)) throw new Error(`Teléfono de demo inválido para el índice ${indice}`);
  return t;
};

export interface OpcionesDeDemo {
  organizacionId: string;
  /** El «hoy» simulado: fin de la historia. */
  hasta: Date;
  semilla?: number;
  /** Cuántas inscripciones (alumnos) se buscan. Por omisión 300. */
  alumnos?: number;
  /** Meses de historia. Por omisión 6. */
  meses?: number;
  progreso?: (linea: string) => void;
  /** Una línea por cada cosa que se hace (para comparar dos corridas y encontrar dónde divergen). */
  traza?: (linea: string) => void;
}

export interface ResumenDeDemo {
  yaExistia: boolean;
  semilla: number;
  leads: number;
  clasesMuestra: number;
  asistidas: number;
  inscripciones: number;
  bajas: number;
  pases: number;
  pagos: number;
  pagosParciales: number;
  ventas: number;
  beneficiosEntregados: number;
  conversionesRechazadas: number;
  cargos: number;
  cuadratura: ResultadoDeCuadratura | null;
  /** Las verificaciones del catálogo (C4) tras generar: deben dar cero. */
  catalogo: { traslapesDeEdad: number; choquesDeSalon: number; choquesDeInstructor: number } | null;
  segundos: number;
}

/** Las verificaciones del insumo sobre el catálogo de la organización: la historia generada no debe haberlo tocado. */
export async function verificarCatalogo(db: BaseDatos): Promise<NonNullable<ResumenDeDemo["catalogo"]>> {
  const c = await cargarCatalogo(db);
  return { traslapesDeEdad: traslapesDeEdad(c).length, choquesDeSalon: choquesDeSalon(c).length, choquesDeInstructor: choquesDeInstructor(c).length };
}

const NOMBRES = ["Sofía", "Mateo", "Valentina", "Santiago", "Camila", "Emiliano", "Regina", "Sebastián", "Ximena", "Leonardo", "Renata", "Diego", "Fernanda", "Iker", "Isabella", "Daniel", "Mariana", "Gael", "Victoria", "Adrián", "Luciana", "Ángel", "Paula", "Bruno", "Valeria", "Rodrigo", "Julieta", "Emilio", "Natalia", "Tadeo"];
const APELLIDOS = ["García", "Hernández", "Martínez", "López", "González", "Pérez", "Rodríguez", "Sánchez", "Ramírez", "Flores", "Gómez", "Díaz", "Cruz", "Morales", "Reyes", "Ortiz", "Gutiérrez", "Chávez", "Ruiz", "Mendoza", "Castillo", "Jiménez", "Vargas", "Romero", "Herrera"];
const NOMBRES_TUTOR = ["Laura", "Carlos", "Patricia", "Jorge", "Gabriela", "Miguel", "Claudia", "Ricardo", "Mónica", "Alejandro", "Verónica", "Fernando", "Lucía", "Héctor", "Adriana", "Raúl"];

type Perfil = "puntual" | "parcial" | "tardio" | "moroso";

interface Hijo {
  nombre: string;
  apellidos: string;
  sexo: "femenino" | "masculino";
  edad: number;
  prospectoId?: string;
  grupo: number; // índice en el catálogo
  claseId?: string;
  inscripcionId?: string;
}

interface Familia {
  indice: number;
  telefono: string;
  tutor: string;
  apellidos: string;
  perfil: Perfil;
  convierte: boolean;
  asiste: boolean;
  /** Código de rastreo de la campaña de la que vino, o null (directo). */
  codigo: string | null;
  hijos: Hijo[];
  leadId?: string;
  tutorId?: string;
  retraso: number; // días de retraso con que paga
  segundoPago: number; // para el parcial: días hasta completar
  fraccion: number; // % que paga el parcial al principio
  morosoDesde: number; // día (desde S) desde el que deja de pagar; Infinity si no
  asiduidad: number; // porcentaje (0 a 100) de ir a clase
  compraProducto: boolean;
  bajaEnDias: number | null;
}

interface GrupoDelCatalogo {
  id: string;
  nombre: string;
  cupo: number;
  verticalId: string;
  verticalSlug: string;
  sucursalId: string;
  zona: string;
  programaId: string;
  edadMin: number;
  edadMax: number;
  fechaCorte: FechaISO | null;
  horarios: { dia_semana: number; hora_inicio_min: number }[];
}

type Evento = { t: number; seq: number; tipo: "lead" | "agendar" | "asistencia" | "convertir" | "baja" | "vender"; familia: number; hijo?: number };

const MS_DIA = 86_400_000;

export async function generarDatosDeDemo(prisma: PrismaRaiz, o: OpcionesDeDemo): Promise<ResumenDeDemo> {
  const inicioReal = Date.now();
  const db = conAlcance(prisma, o.organizacionId);
  const semilla = o.semilla ?? 20261008;
  const meses = o.meses ?? 6;
  const objetivo = o.alumnos ?? 300;
  const avisar = o.progreso ?? (() => {});
  const vacio = (yaExistia: boolean, extra: Partial<ResumenDeDemo> = {}): ResumenDeDemo => ({ yaExistia, semilla, leads: 0, clasesMuestra: 0, asistidas: 0, inscripciones: 0, bajas: 0, pases: 0, pagos: 0, pagosParciales: 0, ventas: 0, beneficiosEntregados: 0, conversionesRechazadas: 0, cargos: 0, cuadratura: null, catalogo: null, segundos: 0, ...extra });

  // ── Idempotencia: ya hay filas marcadas ──
  if ((await db.lead.count({ where: { telefono: { startsWith: MARCA_DE_DEMO } } })) > 0) {
    // El último paso de una corrida completa es el gasto de las campañas: si hay datos marcados pero no hay gasto, la corrida anterior se interrumpió y la historia quedó a medias.
    if ((await db.gasto_campana.count({ where: { nota: NOTA_DEL_GASTO_DE_DEMO } })) === 0) {
      throw new Error("Hay datos de demo a medias (una corrida anterior se interrumpió): no se puede completar sin duplicar. Recrea la base de la demo y vuelve a correr el comando");
    }
    const resumen = await resumenDesdeLaBase(db, semilla);
    return { ...resumen, yaExistia: true, cuadratura: await cuadratura(db), catalogo: await verificarCatalogo(db), segundos: (Date.now() - inicioReal) / 1000 };
  }

  // ── Lo que tiene que existir ──
  const organizacion = await db.organizacion.findFirst({ where: { id: o.organizacionId }, select: { slug: true } });
  const admin = await db.usuario.findFirst({ where: { rol: "administrador", activo: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }], select: { id: true, rol: true } });
  if (!admin) throw new Error("La organización no tiene un administrador activo: los datos de demo necesitan a quién atribuir lo que hacen");
  const filasDeGrupos = await db.grupo.findMany({
    where: { activo: true, programa: { activo: true } },
    select: { id: true, nombre: true, cupo_maximo: true, horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true } }, programa: { select: { id: true, nombre: true, edad_min: true, edad_max: true, fecha_corte_edad: true, vertical: { select: { id: true, nombre: true, slug: true } }, sucursal: { select: { id: true, nombre: true, zona_horaria: true } } } } },
  });
  const grupos: GrupoDelCatalogo[] = filasDeGrupos
    .filter((g) => g.horarios.length > 0)
    .sort((a, b) => cmp(a.programa.vertical.nombre, b.programa.vertical.nombre) || cmp(a.programa.sucursal.nombre, b.programa.sucursal.nombre) || cmp(a.programa.nombre, b.programa.nombre) || cmp(a.nombre, b.nombre))
    .map((g) => ({ id: g.id, nombre: g.nombre, cupo: g.cupo_maximo, verticalId: g.programa.vertical.id, verticalSlug: g.programa.vertical.slug, sucursalId: g.programa.sucursal.id, zona: g.programa.sucursal.zona_horaria, programaId: g.programa.id, edadMin: g.programa.edad_min, edadMax: g.programa.edad_max, fechaCorte: g.programa.fecha_corte_edad ? g.programa.fecha_corte_edad.toISOString().slice(0, 10) : null, horarios: g.horarios }));
  if (grupos.length === 0) throw new Error("No hay grupos con horario: carga el catálogo antes de generar datos de demo");
  const motivos = await db.motivo_baja.findMany({ where: { activo: true }, orderBy: [{ codigo: "asc" }], select: { id: true } });
  if (motivos.length === 0) throw new Error("No hay motivos de baja: carga el catálogo antes de generar datos de demo");

  const azar = crearAzar(semilla);
  const fin = o.hasta.getTime();
  const inicio = fin - meses * 30 * MS_DIA;
  const { entre, elegir, chance } = azar;

  // ── Campañas de apoyo (catálogo) y su código de rastreo ──
  const origenes = [["facebook", "DEMKFB22"], ["instagram", "DEMKGR33"], ["tiktok", "DEMKTT44"], ["presencial", "DEMKQR55"]] as const;
  const campanas: { id: string; codigo: string; origen: string }[] = [];
  for (const [origen, codigo] of origenes) {
    const c = await db.campana.create({ data: altaConAlcance({ nombre: `Demo: ${origen}`, origen, fecha_inicio: aFecha(fechaLocal(new Date(inicio), "UTC")) }), select: { id: true } });
    await db.codigo_rastreo.create({ data: altaConAlcance({ codigo, tipo: "campana" as const, campana_id: c.id }) });
    campanas.push({ id: c.id, codigo, origen });
  }

  // ── Productos de apoyo (si no hay) ──
  const verticales = [...new Map(grupos.map((g) => [g.verticalId, g])).values()];
  if ((await db.producto.count()) === 0) {
    for (const g of verticales) {
      for (const [nombre, talla, precio] of [["Uniforme", "S", "450.00"], ["Uniforme", "M", "450.00"], ["Uniforme", "L", "450.00"], ["Accesorio", null, "120.50"]] as const) {
        await db.producto.create({ data: altaConAlcance({ vertical_id: g.verticalId, nombre, talla, precio, stock: 400 }) });
      }
    }
  }
  const productosPorVertical = new Map<string, string[]>();
  for (const p of await db.producto.findMany({ where: { activo: true }, orderBy: [{ nombre: "asc" }, { talla: "asc" }, { precio: "asc" }], select: { id: true, vertical_id: true, nombre: true } })) {
    (productosPorVertical.get(p.vertical_id) ?? productosPorVertical.set(p.vertical_id, []).get(p.vertical_id)!).push(p.id);
  }

  // ── El plan de las familias ──
  const familias: Familia[] = [];
  let hijosQueConvierten = 0;
  let indice = 0;
  // Se planean un 40 % más de lo pedido: una conversión puede rechazarse (el grupo se llenó) y la meta es llegar cerca de `alumnos` inscritos.
  const metaDelPlan = (objetivo * 140 - ((objetivo * 140) % 100)) / 100;
  const cupoTotal = grupos.reduce((suma, g) => suma + g.cupo, 0);
  /** Un grupo al azar, con más probabilidad cuanto mayor es su cupo (así los grupos se llenan parejo y no los chicos primero). */
  const grupoAlAzar = (): number => {
    let tirada = entre(1, cupoTotal);
    for (let i = 0; i < grupos.length; i++) {
      tirada -= grupos[i]!.cupo;
      if (tirada <= 0) return i;
    }
    return grupos.length - 1;
  };
  while (hijosQueConvierten < metaDelPlan) {
    const convierte = chance(0.55);
    const nHijos = chance(0.8) ? 1 : chance(0.85) ? 2 : 3;
    const g0 = grupoAlAzar();
    const hijos: Hijo[] = [];
    for (let k = 0; k < nHijos; k++) {
      const gi = k === 0 ? g0 : mismoProgramaOVertical(grupos, g0, azar.elegir);
      const g = grupos[gi]!;
      hijos.push({ nombre: elegir(NOMBRES), apellidos: "", sexo: chance(0.5) ? "femenino" : "masculino", edad: entre(g.edadMin, g.edadMax), grupo: gi });
    }
    const apellidos = `${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
    hijos.forEach((h) => (h.apellidos = apellidos));
    const perfilSuerte = entre(0, 99);
    const perfil: Perfil = perfilSuerte < 50 ? "puntual" : perfilSuerte < 75 ? "parcial" : perfilSuerte < 90 ? "tardio" : "moroso";
    const camp = chance(0.7) ? elegir(campanas) : null;
    familias.push({
      indice,
      telefono: telefonoDeDemo(indice + 1),
      tutor: elegir(NOMBRES_TUTOR),
      apellidos,
      perfil,
      convierte,
      asiste: convierte ? true : chance(0.5),
      codigo: camp?.codigo ?? null,
      hijos,
      retraso: perfil === "puntual" ? entre(0, 1) : perfil === "tardio" ? entre(8, 30) : entre(0, 3),
      segundoPago: entre(10, 25),
      fraccion: entre(40, 80),
      morosoDesde: perfil === "moroso" ? entre(60, 130) : Number.POSITIVE_INFINITY,
      asiduidad: entre(55, 98),
      compraProducto: chance(0.4),
      bajaEnDias: convierte && chance(0.12) ? entre(25, 140) : null,
    });
    if (convierte) hijosQueConvierten += nHijos;
    indice++;
  }
  const familiaPorTelefono = new Map(familias.map((f) => [f.telefono, f]));
  avisar(`Plan: ${familias.length} familias (${familias.filter((f) => f.convierte).length} se inscriben), ${grupos.length} grupos, ${meses} meses.`);

  // ── La cola de eventos ──
  const cola: Evento[] = [];
  let seq = 0;
  const programar = (t: number, tipo: Evento["tipo"], familia: number, hijo?: number): void => {
    cola.push({ t, seq: seq++, tipo, familia, ...(hijo !== undefined ? { hijo } : {}) });
  };
  for (const f of familias) {
    const dia = entre(0, meses * 30 - 16);
    programar(inicio + dia * MS_DIA + 16 * 3_600_000, "lead", f.indice);
  }

  const contadores = { leads: 0, clases: 0, asistidas: 0, inscripciones: 0, bajas: 0, pases: 0, pagos: 0, parciales: 0, ventas: 0, entregados: 0, rechazadas: 0 };
  // La conversión traslada la ficha de salud (aquí NO hay ninguna: la demo no inventa datos de salud). Sin CLAVE_DATOS_SENSIBLES se usa la clave de desarrollo, que no protege nada.
  const cifrador = cifradorDesdeEntorno(process.env["CLAVE_DATOS_SENSIBLES"] ? process.env : { ...process.env, NODE_ENV: "development" });
  const fuente = new InscripcionesActivas();
  const ctxApi = (ahora: Date) => ({ usuario: { id: admin.id, rol: "administrador" as const, organizacionId: o.organizacionId, nombre: "Demo", correo: "demo@demo.test", activo: true } as never, organizacionId: o.organizacionId, ahora: () => ahora });
  const ocupados = new Map<string, number>(); // grupo → inscritos que ESTE generador sumó (para no pedirle lugar a un grupo que ya se llenó)
  const grupoLleno = new Set<string>();
  const inscripcionesActivas: { id: string; familia: number; hijo: number; grupo: number }[] = [];
  const familiasConDeuda = new Set<number>();

  // ── Los pasos de un día ──
  const dia = async (indiceDeDia: number): Promise<void> => {
    const tDia = inicio + indiceDeDia * MS_DIA;
    o.traza?.(`dia ${indiceDeDia} azar=${azar.consumidos()}`);
    const fechaDelDia = new Date(tDia).toISOString().slice(0, 10);
    // 1. Eventos programados para este día.
    const limite = tDia + MS_DIA;
    for (;;) {
      cola.sort((a, b) => a.t - b.t || a.seq - b.seq);
      const e = cola[0];
      if (!e || e.t >= limite || e.t > fin) break;
      cola.shift();
      await atender(e);
    }
    const ahoraDelDia = new Date(tDia + 17 * 3_600_000); // 11:00 locales
    if (ahoraDelDia.getTime() > fin) return;
    // 2. El barrido de finanzas (mensualidad del mes, vencidos, tareas de cobranza).
    await barrerFinanzas({ prisma, reloj: () => ahoraDelDia, organizacionId: o.organizacionId });
    // 3. Pagos de las familias según su perfil.
    await pagos(ahoraDelDia, fechaDelDia, indiceDeDia);
    // 4. Beneficios liberados que recepción entrega.
    await entregas(ahoraDelDia);
    // 5. Pases de lista de los grupos que dieron clase hoy.
    await pasesDelDia(fechaDelDia, tDia);
  };

  const atender = async (e: Evento): Promise<void> => {
    const f = familias[e.familia]!;
    o.traza?.(`evento ${e.tipo} familia ${e.familia} t=${e.t}`);
    const ahora = new Date(e.t);
    switch (e.tipo) {
      case "lead": {
        const g = grupos[f.hijos[0]!.grupo]!;
        const landing = await cargarLanding(prisma, g.verticalSlug, organizacion?.slug ?? null, ahora);
        if (!landing || !landing.aviso) throw new Error(`La vertical «${g.verticalSlug}» no tiene landing publicable (falta el aviso de privacidad vigente)`);
        const res = await registrarEnvioDeLanding(
          prisma,
          landing,
          { nombreAlumno: f.hijos[0]!.nombre, edad: f.hijos[0]!.edad, sucursalId: g.sucursalId, telefono: f.telefono, nombreContacto: `${f.tutor} ${f.apellidos.split(" ")[0]}`, documentoId: landing.aviso.id, version: landing.aviso.version },
          { codigo: f.codigo, utm: {}, sucursalId: null } as never,
          { ip: null, agenteUsuario: "demo" },
          ahora,
        );
        if (!res.ok) throw new Error(`No se pudo registrar el lead de la familia ${f.indice}: ${res.motivo}`);
        f.leadId = res.leadId;
        f.hijos[0]!.prospectoId = res.prospectoId;
        contadores.leads++;
        // Los hermanos los registra el asesor como prospectos del mismo lead.
        for (let k = 1; k < f.hijos.length; k++) {
          const h = f.hijos[k]!;
          const p = await db.prospecto.create({ data: altaConAlcance({ lead_id: res.leadId, vertical_interes_id: grupos[h.grupo]!.verticalId, nombre: h.nombre, edad_declarada: h.edad, origen: "asesor" as const }), select: { id: true } });
          h.prospectoId = p.id;
        }
        if (f.convierte || f.asiste) programar(e.t + 2 * 3_600_000, "agendar", f.indice, 0);
        break;
      }
      case "agendar": {
        const h = f.hijos[e.hijo ?? 0]!;
        const hijoGrupos = [h.grupo, ...candidatosDeGrupo(grupos, h.grupo, grupoLleno)];
        let hecho = false;
        for (const gi of hijoGrupos.slice(0, 4)) {
          const g = grupos[gi]!;
          const sesion = proximaSesion(g, ahora, entre(1, 6));
          if (!sesion) continue;
          const res = await db.$transaction((tx) => agendarClaseMuestra(tx, { ahora, fuente, origen: { tipo: "usuario", usuarioId: admin.id } }, { prospectoId: h.prospectoId!, grupoId: g.id, fechaHora: sesion }));
          o.traza?.(`  agendar grupo ${gi} sesion ${sesion.toISOString()} ok=${res.ok}${res.ok ? "" : " " + JSON.stringify(res).slice(0, 80)}`);
          if (!res.ok) continue;
          h.claseId = res.clase.id;
          h.grupo = gi;
          contadores.clases++;
          if (sesion.getTime() + 2 * 3_600_000 <= fin) programar(sesion.getTime() + 2 * 3_600_000, "asistencia", f.indice, e.hijo ?? 0);
          hecho = true;
          break;
        }
        void hecho;
        break;
      }
      case "asistencia": {
        const h = f.hijos[e.hijo ?? 0]!;
        if (!h.claseId) break;
        const asistio = f.asiste && chance(0.88);
        const res = await db.$transaction((tx) => marcarAsistencia(tx, { claseId: h.claseId!, estatus: asistio ? "asistio" : "no_asistio", usuarioId: admin.id, ahora }));
        o.traza?.(`  asistencia asistio=${asistio} ok=${res.ok}${res.ok ? "" : " " + JSON.stringify(res).slice(0, 80)}`);
        if (res.ok && asistio) {
          contadores.asistidas++;
          if (f.convierte) programar(e.t + entre(2, 40) * 3_600_000, "convertir", f.indice);
        }
        break;
      }
      case "convertir": {
        await convertir(f, ahora);
        break;
      }
      case "baja": {
        const h = f.hijos[e.hijo ?? 0]!;
        if (!h.inscripcionId) break;
        const res = await db.$transaction((tx) => darDeBaja(tx, { ahora, usuarioId: admin.id }, { inscripcionId: h.inscripcionId!, motivoBajaId: elegir(motivos).id }));
        if (res.ok) {
          contadores.bajas++;
          const i = inscripcionesActivas.findIndex((x) => x.id === h.inscripcionId);
          if (i >= 0) inscripcionesActivas.splice(i, 1);
        }
        break;
      }
      case "vender": {
        const h = f.hijos[e.hijo ?? 0]!;
        const g = grupos[h.grupo]!;
        const productos = productosPorVertical.get(g.verticalId) ?? [];
        if (!h.inscripcionId || productos.length === 0) break;
        const alumno = await db.inscripcion.findFirst({ where: { id: h.inscripcionId }, select: { alumno_id: true } });
        if (!alumno) break;
        try {
          await db.$transaction((tx) => venderProducto(tx, { ahora, usuarioId: admin.id }, { alumnoId: alumno.alumno_id, productoId: elegir(productos), cantidad: entre(1, 2) }));
          contadores.ventas++;
        } catch (error) {
          if (!(error instanceof Error) || !/sin_stock|no hay existencias/i.test(error.message)) throw error;
        }
        break;
      }
    }
  };

  const convertir = async (f: Familia, ahora: Date): Promise<void> => {
    if (!f.leadId) return;
    const prospectos = f.hijos.filter((h) => h.prospectoId);
    // El reglamento vigente aceptado por la familia, por cada niño.
    for (const h of prospectos) {
      const doc = await documentoVigente(db, "reglamento", grupos[h.grupo]!.verticalId, ahora);
      if (!doc) throw new Error("No hay un reglamento vigente: carga los documentos legales antes de generar datos de demo");
      const a = await registrarAceptacion(db, o.organizacionId, { prospectoId: h.prospectoId!, documentoId: doc.id, version: doc.version, resultado: "aceptada", aceptante: { nombre: `${f.tutor} ${f.apellidos}`, parentesco: "madre" }, canal: "presencial", usuarioId: admin.id, evidencia: { origen: "demo" }, ahora });
      if (!a.ok) throw new Error(`No se pudo registrar el reglamento (${a.motivo})`);
    }
    // Un grupo con lugar para cada niño (el suyo, o uno parecido si se llenó).
    const elegidos = new Map<string, number>();
    for (const h of prospectos) {
      const orden = [h.grupo, ...candidatosDeGrupo(grupos, h.grupo, grupoLleno)];
      const gi = orden.find((x) => !grupoLleno.has(grupos[x]!.id)) ?? h.grupo;
      elegidos.set(h.prospectoId!, gi);
    }
    const diaDeCorte = chance(0.6) ? elegir([1, 5, 10, 15]) : entre(1, 28);
    const entrada = {
      tutor: { parentesco: "madre", nombre: f.tutor, apellidos: f.apellidos },
      prospectos: prospectos.map((h) => {
        const g = grupos[elegidos.get(h.prospectoId!)!]!;
        const referencia = g.fechaCorte ?? fechaLocal(ahora, g.zona);
        const nacimiento = sumarDias(referencia, -(h.edad * 365 + h.edad / 4 + entre(15, 300))).slice(0, 10);
        return { prospectoId: h.prospectoId!, alumno: { nombre: h.nombre, apellidos: h.apellidos, fecha_nacimiento: nacimiento, sexo: h.sexo, escuela_nombre: "Escuela primaria", talla_uniforme: elegir(["S", "M", "L"]) }, inscripcion: { grupoId: g.id, diaCortePago: diaDeCorte } };
      }),
    };
    const res = await convertirLead(db, ctxApi(ahora), f.leadId, entrada as never, { cifrador });
    o.traza?.(`  convertir ok=${res.ok}${res.ok ? "" : " " + JSON.stringify(res).slice(0, 160)}`);
    if (!res.ok) {
      contadores.rechazadas++;
      const motivo = res.motivo === "faltan_datos" ? `faltan: ${res.faltantes.map((x) => x.campo).join(", ")}` : res.motivo === "inscripcion" ? `${res.rechazo}` : res.motivo;
      log.warn("demo_conversion_rechazada", { familia: f.indice, motivo });
      if (res.motivo === "inscripcion" && res.rechazo === "grupo_lleno") for (const h of prospectos) grupoLleno.add(grupos[elegidos.get(h.prospectoId!)!]!.id);
      return;
    }
    f.tutorId = res.resultado.tutorId ?? undefined;
    for (const a of res.resultado.alumnos) {
      const h = f.hijos.find((x) => x.prospectoId === a.prospectoId);
      if (!h || !a.inscripcion) continue;
      h.inscripcionId = a.inscripcion.id;
      h.grupo = elegidos.get(a.prospectoId)!;
      if (a.inscripcion.creada) {
        contadores.inscripciones++;
        const gid = grupos[h.grupo]!.id;
        const n = (ocupados.get(gid) ?? 0) + 1;
        ocupados.set(gid, n);
        if (n >= grupos[h.grupo]!.cupo) grupoLleno.add(gid);
        inscripcionesActivas.push({ id: a.inscripcion.id, familia: f.indice, hijo: f.hijos.indexOf(h), grupo: h.grupo });
        const k = f.hijos.indexOf(h);
        if (f.bajaEnDias !== null) programar(ahora.getTime() + f.bajaEnDias * MS_DIA, "baja", f.indice, k);
        if (f.compraProducto) programar(ahora.getTime() + entre(0, 5) * MS_DIA, "vender", f.indice, k);
      }
    }
    familiasConDeuda.add(f.indice);
  };

  const pagos = async (ahora: Date, fecha: FechaISO, diasDesdeInicio: number): Promise<void> => {
    if (familiasConDeuda.size === 0) return;
    const abiertos = await db.cargo.findMany({
      where: { estatus: { in: ["pendiente", "vencido"] }, tutor: { telefono: { startsWith: MARCA_DE_DEMO } }, fecha_vencimiento: { lte: aFecha(fecha) } },
      select: { id: true, tutor_id: true, fecha_vencimiento: true, monto_final: true, monto_pagado: true, tutor: { select: { telefono: true } }, concepto: true, periodo: true },
    });
    if (abiertos.length === 0) return;
    const porTutor = new Map<string, typeof abiertos>();
    for (const c of abiertos) (porTutor.get(c.tutor_id) ?? porTutor.set(c.tutor_id, []).get(c.tutor_id)!).push(c);
    const lista = [...porTutor.entries()].map(([tutorId, cs]) => ({ tutorId, cs, familia: familiaPorTelefono.get(cs[0]!.tutor.telefono)! })).sort((a, b) => a.familia.indice - b.familia.indice);
    for (const { tutorId, cs, familia: f } of lista) {
      if (!f) continue;
      if (diasDesdeInicio >= f.morosoDesde) continue;
      cs.sort((a, b) => a.fecha_vencimiento.getTime() - b.fecha_vencimiento.getTime() || (a.periodo ?? "").localeCompare(b.periodo ?? "") || a.concepto.localeCompare(b.concepto));
      // Lo que esta familia paga HOY a cada cargo. El reparto va a mano (cargo por cargo) y no lo deja al sistema: con dos cargos del mismo día el orden «el más antiguo primero» se desempata por
      // un id aleatorio, y la historia dejaría de ser determinista.
      const partes: { cargoId: string; monto: bigint }[] = [];
      let parcial = false;
      for (const c of cs) {
        const saldo = deDecimal(c.monto_final) - deDecimal(c.monto_pagado);
        const atraso = diasEntre(deFecha(c.fecha_vencimiento), fecha);
        let paga = 0n;
        if (f.perfil === "parcial") {
          if (deDecimal(c.monto_pagado) === 0n && atraso >= f.retraso && atraso < f.segundoPago) {
            paga = (saldo * BigInt(f.fraccion)) / 100n;
            parcial = true;
          } else if (atraso >= f.segundoPago) paga = saldo;
        } else if (atraso >= f.retraso) paga = saldo;
        if (paga > 0n) partes.push({ cargoId: c.id, monto: paga });
      }
      const monto = partes.reduce((suma, x) => suma + x.monto, 0n);
      if (monto <= 0n) continue;
      o.traza?.(`  pago familia ${f.indice} monto=${monto} parcial=${parcial} cargos=${cs.length}`);
      const metodo = elegir(["efectivo", "tarjeta", "transferencia"] as const);
      const ctx = { ahora, usuarioId: admin.id };
      try {
        await db.$transaction(async (tx) => {
          const p = await registrarPago(tx, ctx, { tutorId, monto, metodo, referencia: metodo === "transferencia" ? "SPEI demo" : null, aplicaciones: partes });
          await alRegistrarPago(tx, ctx, p);
        });
        contadores.pagos++;
        if (parcial) contadores.parciales++;
      } catch (error) {
        // Un pago que no se pudo (el monto ya no coincide con lo que se debe) se reintenta otro día; cualquier otra falla es un defecto.
        if (!(error instanceof Error) || !/RechazoDePago|excedente|saldo/i.test(`${error.constructor.name} ${error.message}`)) throw error;
      }
    }
  };

  const entregas = async (ahora: Date): Promise<void> => {
    const liberados = await db.promocion_aplicacion.findMany({ where: { estatus: "liberado", inscripcion: { alumno: { tutores: { some: { tutor: { telefono: { startsWith: MARCA_DE_DEMO } } } } } } }, orderBy: [{ liberado_en: "asc" }, { creado_en: "asc" }], select: { id: true, liberado_en: true, inscripcion: { select: { grupo: { select: { programa: { select: { vertical_id: true } } } } } }, beneficio: { select: { tipo: true } } } });
    o.traza?.(`  entregas liberados=${liberados.length}`);
    for (const l of liberados) {
      if (!chance(0.5)) continue;
      const productos = productosPorVertical.get(l.inscripcion.grupo.programa.vertical_id) ?? [];
      const x = await db.$transaction((tx) => entregarBeneficio(tx, { ahora, usuarioId: admin.id }, { aplicacionId: l.id, productoId: l.beneficio.tipo === "producto_gratis" ? (productos[0] ?? null) : null }));
      if (x.ok) contadores.entregados++;
    }
  };

  const pasesDelDia = async (fecha: FechaISO, tDia: number): Promise<void> => {
    for (const g of grupos) {
      if (sesionesDelDia(fecha, g.horarios, g.zona).length === 0) continue;
      const sesionTermina = sesionesDelDia(fecha, g.horarios, g.zona)[0]!.getTime() + 3_600_000;
      if (sesionTermina > fin || sesionTermina < inicio) continue;
      const grupo = await cargarGrupoDelPase(db, g.id);
      if (!grupo) continue;
      const { lista } = await listaDelPase(db, g.id, fecha);
      const activas = lista.filter((x) => x.activa);
      if (activas.length === 0) continue;
      o.traza?.(`  pase grupo ${g.nombre} activas=${activas.length}`);
      // El azar se reparte en el orden de las FAMILIAS (nuestro índice), no en el de la lista que devuelva la base: dos alumnos con el mismo nombre se desempatan por un id aleatorio.
      const conClave = activas.map((x) => ({ x, reg: inscripcionesActivas.find((i) => i.id === x.inscripcionId) }));
      conClave.sort((a, b) => (a.reg?.familia ?? -1) - (b.reg?.familia ?? -1) || (a.reg?.hijo ?? 0) - (b.reg?.hijo ?? 0));
      const entradas: EntradaDePase[] = conClave.map(({ x, reg }) => ({ inscripcionId: x.inscripcionId, estatus: azar.pase(reg ? familias[reg.familia]!.asiduidad : 80), metodo: "manual" }));
      const guardado = await guardarPase(db, { organizacionId: o.organizacionId, grupoId: g.id, fecha, usuarioId: admin.id, entradas });
      if (!guardado.ok) continue;
      await recalcularDerivados(db, { organizacionId: o.organizacionId, inscripcionIds: entradas.map((e) => e.inscripcionId), ahora: new Date(sesionTermina) });
      contadores.pases++;
    }
    void tDia;
  };

  // ── Recorrer la historia ──
  const dias = meses * 30;
  for (let d = 0; d <= dias; d++) {
    await dia(d);
    if (d % 15 === 0) avisar(`Día ${d}/${dias}: ${contadores.leads} leads, ${contadores.inscripciones} inscripciones, ${contadores.pagos} pagos, ${contadores.pases} pases.`);
  }

  // Gasto de las campañas (lo captura a mano el administrador): uno por campaña y mes.
  for (let m = 0; m < meses; m++) {
    for (const c of campanas) {
      const fecha = new Date(inicio + (m * 30 + 3) * MS_DIA).toISOString().slice(0, 10);
      await db.gasto_campana.create({ data: altaConAlcance({ campana_id: c.id, fecha: aFecha(fecha), monto: aTexto(BigInt(entre(150_000, 900_000))), nota: NOTA_DEL_GASTO_DE_DEMO, creado_por_usuario_id: admin.id }) });
    }
  }

  const c = await cuadratura(db);
  if (!c.ok) throw new Error(`Los datos de demo no cuadran: ${JSON.stringify(c.discrepancias.slice(0, 5))}`);
  const resumen = await resumenDesdeLaBase(db, semilla);
  void vacio;
  return { ...resumen, yaExistia: false, conversionesRechazadas: contadores.rechazadas, beneficiosEntregados: contadores.entregados, pagosParciales: contadores.parciales, cuadratura: c, catalogo: await verificarCatalogo(db), segundos: (Date.now() - inicioReal) / 1000 };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Otro grupo del MISMO programa o, si no hay, de la misma vertical y sucursal: para hermanos y para cuando un grupo se llena. */
function mismoProgramaOVertical(grupos: GrupoDelCatalogo[], base: number, elegir: <T>(xs: readonly T[]) => T): number {
  const g = grupos[base]!;
  const mismos = grupos.map((x, i) => ({ x, i })).filter(({ x, i }) => i !== base && x.verticalId === g.verticalId && x.sucursalId === g.sucursalId);
  return mismos.length === 0 ? base : elegir(mismos).i;
}

/** Grupos alternativos para quien no cabe en el suyo: del mismo programa primero, luego de la misma vertical y sucursal (en orden del catálogo). */
function candidatosDeGrupo(grupos: GrupoDelCatalogo[], base: number, llenos: Set<string>): number[] {
  const g = grupos[base]!;
  const otros = grupos.map((x, i) => ({ x, i })).filter(({ x, i }) => i !== base && x.verticalId === g.verticalId && x.sucursalId === g.sucursalId && !llenos.has(x.id));
  const delMismoPrograma = (x: GrupoDelCatalogo): number => (x.programaId === g.programaId ? 0 : 1);
  return otros.sort((a, b) => delMismoPrograma(a.x) - delMismoPrograma(b.x) || a.i - b.i).map(({ i }) => i);
}

/** El primer inicio de sesión del grupo a partir de `despuesDeDias` días de calendario local después de `desde`. */
function proximaSesion(g: GrupoDelCatalogo, desde: Date, despuesDeDias: number): Date | null {
  const hoy = fechaLocal(desde, g.zona);
  for (let k = despuesDeDias; k < despuesDeDias + 14; k++) {
    const sesiones = sesionesDelDia(sumarDias(hoy, k), g.horarios, g.zona);
    if (sesiones[0]) return sesiones[0];
  }
  return null;
}

async function resumenDesdeLaBase(db: BaseDatos, semilla: number): Promise<ResumenDeDemo> {
  const marca = { startsWith: MARCA_DE_DEMO };
  const [leads, clases, asistidas, inscripciones, bajas, pases, pagos, ventas, cargos] = await Promise.all([
    db.lead.count({ where: { telefono: marca } }),
    db.clase_muestra.count({ where: { lead: { telefono: marca } } }),
    db.clase_muestra.count({ where: { lead: { telefono: marca }, estatus: "asistio" } }),
    db.inscripcion.count({ where: { lead: { telefono: marca } } }),
    db.inscripcion.count({ where: { lead: { telefono: marca }, estatus: "baja" } }),
    db.asistencia.count({ where: { inscripcion: { lead: { telefono: marca } } } }),
    db.pago.count({ where: { tutor: { telefono: marca } } }),
    db.venta.count({ where: { tutor: { telefono: marca } } }),
    db.cargo.count({ where: { tutor: { telefono: marca } } }),
  ]);
  return { yaExistia: true, semilla, leads, clasesMuestra: clases, asistidas, inscripciones, bajas, pases, pagos, pagosParciales: 0, ventas, beneficiosEntregados: 0, conversionesRechazadas: 0, cargos, cuadratura: null, catalogo: null, segundos: 0 };
}
