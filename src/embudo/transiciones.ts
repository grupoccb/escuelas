// Reglas PURAS de cambio de etapa (D7): qué movimientos son válidos, de qué tipo son y qué piden. Sin base ni reloj. El código nunca busca una
// etapa por su nombre: decide por sus banderas (`es_ganado`, `es_perdido`, que el seed de la escuela alinea con `tipo_sistema`) y su orden.
//
// Reglas fijas (no se levantan con la matriz):
//   · a una etapa GANADA (inscrito) no se llega moviendo etapas: la inscripción la hace la conversión (F2). ÚNICA excepción (V10b): con el módulo de inscripción
//     APAGADO (nadie puede inscribir), una persona puede marcar al lead como inscrito A MANO, con una nota obligatoria; con el módulo encendido, no;
//   · de una etapa ganada no se vuelve atrás salvo el administrador, y nunca a perdido (una baja no es una pérdida del embudo). Si el lead estaba inscrito
//     A MANO, corregirlo también exige una nota;
//   · de perdido a perdido no (no tiene sentido cambiar de «perdida» a «perdida»);
//   · pasar a perdido EXIGE el motivo de pérdida; salir de perdido (recuperar) EXIGE una nota y cuenta como recuperación.
// Reglas de la matriz (`transicion_etapa`, por par): `prohibida`, `solo_administrador` o `permitida` (el valor por omisión).

export interface EtapaParaTransicion {
  id: string;
  orden: number;
  esGanado: boolean;
  esPerdido: boolean;
}

export type ReglaDeMatriz = "permitida" | "solo_administrador" | "prohibida";

/** Qué clase de movimiento es. `lateral`: a una etapa del mismo orden. */
export type TipoDeMovimiento = "avance" | "retroceso" | "lateral" | "perdida" | "recuperacion" | "inscripcion_a_mano" | "correccion_de_inscrito_a_mano";

/** Largo mínimo (en letras y dígitos: ni espacios, ni signos, ni caracteres invisibles, ver `nota.ts`) de la nota al marcar a un lead como inscrito a mano o al corregirlo: una frase, no un «ok». */
export const LARGO_MINIMO_NOTA_A_MANO = 10;

export type MotivoDeRechazoDeTransicion =
  | "destino_ganado"
  | "ganado_inmutable"
  | "ganado_a_perdido"
  | "perdido_a_perdido"
  | "prohibida"
  | "solo_administrador"
  | "falta_motivo_perdida"
  | "motivo_sin_perdida"
  | "falta_nota_recuperacion"
  | "perdido_a_inscrito"
  | "falta_nota_inscrito_a_mano"
  | "nota_inscrito_a_mano_corta"
  | "falta_nota_correccion"
  | "nota_correccion_corta";

export interface EntradaDeTransicion {
  desde: EtapaParaTransicion;
  hacia: EtapaParaTransicion;
  esAdministrador: boolean;
  /** La regla de la matriz para este par, si hay una. */
  regla?: ReglaDeMatriz | null;
  /** ¿Trae un motivo de pérdida? */
  conMotivoDePerdida: boolean;
  /** ¿Trae una nota con contenido? */
  conNota: boolean;
  /** Largo de la nota ya recortada (0 si no hay). Si falta, se toma como suficiente cuando `conNota`. */
  largoDeNota?: number;
  /** V10b: ¿el módulo de inscripción de la organización está APAGADO? Por omisión no (encendido): lo seguro es rechazar el movimiento a mano. */
  inscripcionApagada?: boolean;
  /** V10b: el lead está en una etapa ganada porque una persona lo marcó a mano (y no tiene inscripción real). */
  inscritoAMano?: boolean;
}

export type ResultadoDeTransicion = { ok: true; tipo: TipoDeMovimiento } | { ok: false; motivo: MotivoDeRechazoDeTransicion };

/** Decide si el movimiento vale. Las reglas fijas van primero; después la matriz; después lo que pide cada tipo. */
export function evaluarTransicion(e: EntradaDeTransicion): ResultadoDeTransicion {
  const { desde, hacia } = e;
  const largoDeNota = e.largoDeNota ?? (e.conNota ? Number.MAX_SAFE_INTEGER : 0);
  // V10b: la única forma de llegar a una etapa ganada moviendo etapas, y solo con la inscripción apagada.
  const aMano = hacia.esGanado && e.inscripcionApagada === true;
  if (hacia.esGanado && !aMano) return { ok: false, motivo: "destino_ganado" };
  if (aMano && desde.esGanado) return { ok: false, motivo: "destino_ganado" };
  if (aMano && desde.esPerdido) return { ok: false, motivo: "perdido_a_inscrito" };
  if (desde.esGanado) {
    if (hacia.esPerdido) return { ok: false, motivo: "ganado_a_perdido" };
    if (!e.esAdministrador) return { ok: false, motivo: "ganado_inmutable" };
  }
  if (desde.esPerdido && hacia.esPerdido) return { ok: false, motivo: "perdido_a_perdido" };
  if (e.regla === "prohibida") return { ok: false, motivo: "prohibida" };
  if (e.regla === "solo_administrador" && !e.esAdministrador) return { ok: false, motivo: "solo_administrador" };

  if (aMano) {
    if (e.conMotivoDePerdida) return { ok: false, motivo: "motivo_sin_perdida" };
    if (!e.conNota) return { ok: false, motivo: "falta_nota_inscrito_a_mano" };
    return largoDeNota >= LARGO_MINIMO_NOTA_A_MANO ? { ok: true, tipo: "inscripcion_a_mano" } : { ok: false, motivo: "nota_inscrito_a_mano_corta" };
  }
  if (desde.esGanado && e.inscritoAMano) {
    if (e.conMotivoDePerdida) return { ok: false, motivo: "motivo_sin_perdida" };
    if (!e.conNota) return { ok: false, motivo: "falta_nota_correccion" };
    return largoDeNota >= LARGO_MINIMO_NOTA_A_MANO ? { ok: true, tipo: "correccion_de_inscrito_a_mano" } : { ok: false, motivo: "nota_correccion_corta" };
  }
  if (hacia.esPerdido) return e.conMotivoDePerdida ? { ok: true, tipo: "perdida" } : { ok: false, motivo: "falta_motivo_perdida" };
  if (e.conMotivoDePerdida) return { ok: false, motivo: "motivo_sin_perdida" };
  if (desde.esPerdido) return e.conNota ? { ok: true, tipo: "recuperacion" } : { ok: false, motivo: "falta_nota_recuperacion" };
  if (hacia.orden > desde.orden) return { ok: true, tipo: "avance" };
  return { ok: true, tipo: hacia.orden < desde.orden ? "retroceso" : "lateral" };
}

export const MENSAJE_DE_RECHAZO: Record<MotivoDeRechazoDeTransicion, string> = {
  destino_ganado: "Para marcar a la familia como inscrita, inscríbela desde la ficha",
  ganado_inmutable: "Un lead inscrito no cambia de etapa; solo un administrador puede corregirlo",
  ganado_a_perdido: "Un lead inscrito no se marca como perdido (una baja se registra en la inscripción)",
  perdido_a_perdido: "El lead ya está perdido",
  prohibida: "La organización no permite ese cambio de etapa",
  solo_administrador: "Ese cambio de etapa solo lo puede hacer un administrador",
  falta_motivo_perdida: "Para marcar un lead como perdido hace falta el motivo de pérdida",
  motivo_sin_perdida: "El motivo de pérdida solo va al marcar un lead como perdido",
  falta_nota_recuperacion: "Para recuperar un lead perdido hace falta una nota que diga cómo se recuperó",
  perdido_a_inscrito: "Esta familia está marcada como perdida: primero recupérala y después márcala como inscrita",
  falta_nota_inscrito_a_mano: "Para marcar a la familia como inscrita hace falta una nota que diga cómo se inscribió",
  nota_inscrito_a_mano_corta: `La nota es muy corta: cuenta cómo se inscribió (al menos ${LARGO_MINIMO_NOTA_A_MANO} caracteres, con letras o números)`,
  falta_nota_correccion: "Para corregir una inscripción marcada a mano hace falta una nota que diga por qué se corrige",
  nota_correccion_corta: `La nota es muy corta: cuenta por qué se corrige (al menos ${LARGO_MINIMO_NOTA_A_MANO} caracteres, con letras o números)`,
};

// ── Tiempo en cada etapa ───────────────────────────────────────────────────────────────────────────────

export interface FilaDeHistorial {
  etapaAnteriorId: string | null;
  etapaNuevaId: string;
  creadoEn: Date;
}

export interface TramoEnEtapa {
  etapaId: string;
  desde: Date;
  /** null mientras el lead siga en esa etapa (el tramo corre hasta `ahora`). */
  hasta: Date | null;
  segundos: number;
}

/**
 * Los tramos que el lead pasó en cada etapa, en orden (las filas llegan en orden de registro). El primero empieza en la creación del lead: en la etapa a la que ENTRÓ (la primera fila
 * del historial, si es el alta) o, si el historial empieza con un movimiento (leads anteriores al historial), en su etapa anterior. Un instante
 * anterior al inicio del tramo (un reloj que retrocede) cuenta cero segundos, nunca negativos.
 */
export function tramosEnEtapa(creadoEn: Date, etapaActualId: string, filas: readonly FilaDeHistorial[], ahora: Date): TramoEnEtapa[] {
  const ordenadas = filas; // en ORDEN DE REGISTRO (la secuencia del historial): la fecha puede repetirse o venir de un reloj inyectado
  const tramos: TramoEnEtapa[] = [];
  let etapa: string;
  let desde = creadoEn;
  let resto = ordenadas;
  const primera = ordenadas[0];
  if (!primera) {
    etapa = etapaActualId;
  } else if (primera.etapaAnteriorId === null) {
    etapa = primera.etapaNuevaId; // el alta: nace en esa etapa
    desde = primera.creadoEn;
    resto = ordenadas.slice(1);
  } else {
    etapa = primera.etapaAnteriorId; // un lead anterior al historial: nació en la etapa de la que sale
  }
  const cerrar = (hasta: Date | null) => {
    const fin = hasta ?? ahora;
    tramos.push({ etapaId: etapa, desde, hasta, segundos: Math.max(0, Math.round((fin.getTime() - desde.getTime()) / 1000)) });
  };
  for (const f of resto) {
    cerrar(f.creadoEn);
    etapa = f.etapaNuevaId;
    desde = f.creadoEn;
  }
  cerrar(null);
  return tramos;
}

/** Suma los tramos por etapa: cuánto tiempo estuvo en cada una (aunque haya pasado más de una vez) y cuántas veces entró. */
export function tiempoPorEtapa(tramos: readonly TramoEnEtapa[]): { etapaId: string; segundos: number; veces: number }[] {
  const mapa = new Map<string, { etapaId: string; segundos: number; veces: number }>();
  for (const t of tramos) {
    const a = mapa.get(t.etapaId) ?? { etapaId: t.etapaId, segundos: 0, veces: 0 };
    a.segundos += t.segundos;
    a.veces += 1;
    mapa.set(t.etapaId, a);
  }
  return [...mapa.values()];
}

// ── Lead estancado ─────────────────────────────────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

/** Días enteros sin movimiento: desde la última interacción (o, si nunca la hubo, desde que se creó) hasta `ahora`. */
export function diasSinMovimiento(lead: { ultimaInteraccionEn: Date | null; creadoEn: Date }, ahora: Date): number {
  const referencia = lead.ultimaInteraccionEn ?? lead.creadoEn;
  return Math.max(0, Math.floor((ahora.getTime() - referencia.getTime()) / DIA_MS));
}

/**
 * ¿Está estancado? Su etapa tiene un umbral (`dias_alerta_sin_movimiento`), no es una etapa de cierre (ganada o perdida) y lleva en ella sin
 * movimiento AL MENOS esos días (cumplirlos ya cuenta). Sin umbral nunca se alerta.
 */
export function estaEstancado(lead: { ultimaInteraccionEn: Date | null; creadoEn: Date }, etapa: { diasAlerta: number | null; esGanado: boolean; esPerdido: boolean }, ahora: Date): boolean {
  if (etapa.diasAlerta === null || etapa.esGanado || etapa.esPerdido) return false;
  return diasSinMovimiento(lead, ahora) >= etapa.diasAlerta;
}
