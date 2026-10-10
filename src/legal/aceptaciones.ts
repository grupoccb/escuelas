// La evidencia de aceptación (D6). Cada aceptación, rechazo o revocación es una fila NUEVA de `aceptacion_legal` (solo de anexar en la base).
// El estado de un prospecto frente a un tipo de documento es su fila MÁS RECIENTE (por `secuencia`). Reglas:
//   · solo se acepta (o rechaza) la versión VIGENTE de ese momento, y quien la acepta dice qué versión vio: si no coincide, no se registra;
//   · repetir lo mismo (misma versión, mismo resultado) no duplica: devuelve la fila que ya existe;
//   · REVOCAR solo aplica a la autorización de imagen y solo si la última respuesta fue «aceptada»;
//   · la huella del texto mostrado (`texto_hash`) la copia el servidor del documento: el cliente no la manda ni la altera;
//   · IP y agente solo se guardan cuando la aceptación llegó por la web.

import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import type { ValorJson } from "../datos/tipos.ts";
import { fechaEnPalabras } from "../lib/horario.ts";
import { documentoVigente, NOMBRE_DE_TIPO, TIPOS_DE_DOCUMENTO, type TipoDeDocumento } from "./documentos.ts";

export type ResultadoDeAceptacion = "aceptada" | "rechazada" | "revocada";
export type CanalDeAceptacion = "presencial" | "web" | "whatsapp" | "telefono";
export const CANALES = ["presencial", "web", "whatsapp", "telefono"] as const;
export const RESULTADOS = ["aceptada", "rechazada", "revocada"] as const;

export interface FilaDeAceptacion {
  id: string;
  documentoId: string;
  tipo: TipoDeDocumento;
  versionAceptada: number;
  resultado: ResultadoDeAceptacion;
  aceptanteNombre: string;
  aceptanteParentesco: string | null;
  registroTutorId: string | null;
  canal: CanalDeAceptacion;
  capturadaPorUsuarioId: string | null;
  aceptadoEn: Date;
  textoHash: string;
  evidencia: unknown;
  ip: string | null;
  agenteUsuario: string | null;
  secuencia: bigint;
}

const SELECCION = {
  id: true,
  documento_id: true,
  tipo: true,
  version_aceptada: true,
  resultado: true,
  aceptante_nombre: true,
  aceptante_parentesco: true,
  registro_tutor_id: true,
  canal: true,
  capturada_por_usuario_id: true,
  aceptado_en: true,
  texto_hash: true,
  evidencia: true,
  ip: true,
  agente_usuario: true,
  secuencia: true,
} as const;
type Fila = { id: string; documento_id: string; tipo: TipoDeDocumento; version_aceptada: number; resultado: ResultadoDeAceptacion; aceptante_nombre: string; aceptante_parentesco: string | null; registro_tutor_id: string | null; canal: CanalDeAceptacion; capturada_por_usuario_id: string | null; aceptado_en: Date; texto_hash: string; evidencia: unknown; ip: string | null; agente_usuario: string | null; secuencia: bigint };
const aFila = (f: Fila): FilaDeAceptacion => ({ id: f.id, documentoId: f.documento_id, tipo: f.tipo, versionAceptada: f.version_aceptada, resultado: f.resultado, aceptanteNombre: f.aceptante_nombre, aceptanteParentesco: f.aceptante_parentesco, registroTutorId: f.registro_tutor_id, canal: f.canal, capturadaPorUsuarioId: f.capturada_por_usuario_id, aceptadoEn: f.aceptado_en, textoHash: f.texto_hash, evidencia: f.evidencia, ip: f.ip, agenteUsuario: f.agente_usuario, secuencia: f.secuencia });

export interface EntradaDeAceptacion {
  prospectoId: string;
  documentoId: string;
  /** La versión que se le mostró a quien acepta. */
  version: number;
  resultado: ResultadoDeAceptacion;
  aceptante: { nombre: string; parentesco: string | null; registroTutorId?: string | null };
  canal: CanalDeAceptacion;
  usuarioId: string | null;
  evidencia?: Record<string, string> | null;
  /** Solo se guardan con canal `web`. */
  ip?: string | null;
  agenteUsuario?: string | null;
  /** El registro de la clase muestra al que pertenece, si ya existe. */
  registroId?: string | null;
  ahora: Date;
}

export type MotivoDeRechazoLegal = "prospecto_inexistente" | "documento_inexistente" | "documento_no_aplica" | "version_no_vigente" | "sin_aceptacion_previa" | "no_se_revoca";
export type ResultadoDeRegistro = { ok: true; aceptacion: FilaDeAceptacion; creada: boolean } | { ok: false; motivo: MotivoDeRechazoLegal; versionVigente?: number };

/** La respuesta más reciente de un prospecto a un tipo de documento, o null si nunca ha respondido. */
export async function ultimaAceptacion(tx: Consultas | BaseDatos, prospectoId: string, tipo: TipoDeDocumento): Promise<FilaDeAceptacion | null> {
  const f = (await tx.aceptacion_legal.findFirst({ where: { prospecto_id: prospectoId, tipo }, orderBy: { secuencia: "desc" }, select: SELECCION })) as Fila | null;
  return f ? aFila(f) : null;
}

/**
 * Registra una aceptación, un rechazo o una revocación. Serializado por (prospecto, tipo): dos capturas simultáneas de lo mismo dejan UNA fila.
 * No lanza por reglas de negocio: devuelve `{ ok: false, motivo }`.
 */
export async function registrarAceptacion(db: BaseDatos, organizacionId: string, e: EntradaDeAceptacion): Promise<ResultadoDeRegistro> {
  const documento = await db.documento_legal.findFirst({ where: { id: e.documentoId }, select: { id: true, tipo: true, version: true, vertical_id: true, texto_hash: true } });
  if (!documento) return { ok: false, motivo: "documento_inexistente" };
  const tipo = documento.tipo as TipoDeDocumento;
  return transaccionConBloqueo(db, organizacionId, `aceptacion:${e.prospectoId}:${tipo}`, async (tx): Promise<ResultadoDeRegistro> => {
    const prospecto = await tx.prospecto.findFirst({ where: { id: e.prospectoId }, select: { id: true, lead_id: true, vertical_interes_id: true } });
    if (!prospecto) return { ok: false, motivo: "prospecto_inexistente" };
    if (documento.vertical_id !== null && documento.vertical_id !== prospecto.vertical_interes_id) return { ok: false, motivo: "documento_no_aplica" };
    const ultima = await ultimaAceptacion(tx, prospecto.id, tipo);

    if (e.resultado === "revocada") {
      // Solo la autorización de imagen se revoca, y solo lo que está aceptado; revocar dos veces es lo mismo.
      if (tipo !== "uso_imagen") return { ok: false, motivo: "no_se_revoca" };
      if (ultima?.resultado === "revocada") return { ok: true, aceptacion: ultima, creada: false };
      if (!ultima || ultima.resultado !== "aceptada" || ultima.documentoId !== documento.id) return { ok: false, motivo: "sin_aceptacion_previa" };
    } else {
      // Solo la versión vigente de este momento, y la que dice haber visto quien acepta.
      const vigente = await documentoVigente(tx, tipo, prospecto.vertical_interes_id, e.ahora);
      if (!vigente || vigente.id !== documento.id || e.version !== documento.version) return { ok: false, motivo: "version_no_vigente", ...(vigente ? { versionVigente: vigente.version } : {}) };
      if (ultima && ultima.resultado === e.resultado && ultima.documentoId === documento.id) return { ok: true, aceptacion: ultima, creada: false };
    }

    const web = e.canal === "web";
    const creada = (await tx.aceptacion_legal.create({
      data: altaConAlcance({
        documento_id: documento.id,
        tipo,
        version_aceptada: documento.version,
        resultado: e.resultado,
        lead_id: prospecto.lead_id,
        prospecto_id: prospecto.id,
        registro_clase_muestra_id: e.registroId ?? null,
        registro_tutor_id: e.aceptante.registroTutorId ?? null,
        aceptante_nombre: e.aceptante.nombre,
        aceptante_parentesco: e.aceptante.parentesco,
        canal: e.canal,
        capturada_por_usuario_id: e.usuarioId,
        aceptado_en: e.ahora,
        texto_hash: documento.texto_hash,
        ...(e.evidencia ? { evidencia: e.evidencia as ValorJson } : {}),
        ip: web ? (e.ip ?? null) : null,
        agente_usuario: web ? (e.agenteUsuario ?? null) : null,
      }),
      select: SELECCION,
    })) as Fila;
    return { ok: true, aceptacion: aFila(creada), creada: true };
  });
}

export interface EstadoLegalDeTipo {
  tipo: TipoDeDocumento;
  estado: "sin_respuesta" | ResultadoDeAceptacion;
  versionAceptada: number | null;
  aceptadoEn: Date | null;
  aceptante: string | null;
  /** La versión vigente hoy (null si no hay documento de ese tipo). */
  versionVigente: number | null;
  /** true si la última respuesta es a la versión vigente (o no hay versión vigente que responder). */
  alCorriente: boolean;
  /** «Aceptó el reglamento v3 el 10 de noviembre de 2026 (Rosa Mena, madre)»: el día de la sucursal, en palabras. */
  texto: string;
}

/** El estado del prospecto frente a cada tipo de documento, con la frase lista para mostrar. */
export async function estadoLegal(tx: Consultas | BaseDatos, prospectoId: string, verticalId: string | null, ahora: Date, zonaHoraria: string): Promise<EstadoLegalDeTipo[]> {
  const salida: EstadoLegalDeTipo[] = [];
  for (const tipo of TIPOS_DE_DOCUMENTO) {
    const [ultima, vigente] = [await ultimaAceptacion(tx, prospectoId, tipo), await documentoVigente(tx, tipo, verticalId, ahora)];
    const quien = ultima ? [ultima.aceptanteNombre, ultima.aceptanteParentesco].filter(Boolean).join(", ") : null;
    // V10 (V8): el día de la SUCURSAL en palabras. Antes era el día UTC en formato técnico: de noche en México decía el día siguiente («2026-10-10» siendo 9 de octubre).
    const dia = ultima ? fechaEnPalabras(ultima.aceptadoEn, zonaHoraria) : null;
    const verbo = ultima?.resultado === "aceptada" ? "Aceptó" : ultima?.resultado === "rechazada" ? "Rechazó" : "Revocó";
    salida.push({
      tipo,
      estado: ultima?.resultado ?? "sin_respuesta",
      versionAceptada: ultima?.versionAceptada ?? null,
      aceptadoEn: ultima?.aceptadoEn ?? null,
      aceptante: quien,
      versionVigente: vigente?.version ?? null,
      alCorriente: vigente === null ? true : ultima !== null && ultima.resultado !== "revocada" && ultima.documentoId === vigente.id,
      texto: ultima ? `${verbo} ${NOMBRE_DE_TIPO[tipo]} v${ultima.versionAceptada} el ${dia} (${quien})` : `Todavía no responde a ${NOMBRE_DE_TIPO[tipo]}`,
    });
  }
  return salida;
}

/**
 * Lo que impide cerrar un registro por el reglamento: no hay un reglamento configurado, o el prospecto no lo ha aceptado (o lo rechazó).
 * Acepta cualquier versión aceptada (la que estaba vigente cuando la aceptó); la inscripción (F3) pedirá la vigente.
 */
export async function problemasDeReglamento(tx: Consultas | BaseDatos, prospectoId: string, verticalId: string | null, ahora: Date): Promise<{ campo: string; mensaje: string }[]> {
  if (!(await documentoVigente(tx, "reglamento", verticalId, ahora))) return [{ campo: "reglamento", mensaje: "No hay un reglamento vigente configurado: pídele al administrador que lo publique" }];
  const ultima = await ultimaAceptacion(tx, prospectoId, "reglamento");
  if (!ultima) return [{ campo: "reglamento", mensaje: "Falta que la familia acepte el reglamento" }];
  if (ultima.resultado !== "aceptada") return [{ campo: "reglamento", mensaje: "La familia no aceptó el reglamento" }];
  return [];
}

/**
 * ¿La familia de este alumno autorizó el uso de su imagen? Se DERIVA de la última respuesta (por `secuencia`) a la autorización
 * de imagen de su prospecto de origen (D6): verdadero solo si lo último fue «aceptada»; revocada, rechazada o sin respuesta es
 * falso. Un alumno que no vino de un prospecto (alta directa) no tiene respuesta registrada: falso.
 */
export async function autorizaUsoDeImagen(tx: Consultas | BaseDatos, alumnoId: string): Promise<boolean> {
  const prospectos = await tx.prospecto.findMany({ where: { alumno_id: alumnoId }, select: { id: true } });
  let ultima: FilaDeAceptacion | null = null;
  for (const p of prospectos) {
    const a = await ultimaAceptacion(tx, p.id, "uso_imagen");
    if (a && (!ultima || a.aceptadoEn > ultima.aceptadoEn)) ultima = a;
  }
  return ultima?.resultado === "aceptada";
}

/**
 * Lo que impide inscribir (F3): hace falta que el reglamento VIGENTE esté aceptado —la versión que rige hoy, no una anterior—.
 * Sin reglamento configurado, sin respuesta, rechazado o aceptado en una versión anterior: no se inscribe. Vacío = en orden.
 */
export async function problemasDeReglamentoVigente(tx: Consultas | BaseDatos, prospectoId: string, verticalId: string | null, ahora: Date): Promise<{ campo: string; mensaje: string }[]> {
  const vigente = await documentoVigente(tx, "reglamento", verticalId, ahora);
  if (!vigente) return [{ campo: "reglamento", mensaje: "No hay un reglamento vigente configurado: pídele al administrador que lo publique" }];
  const ultima = await ultimaAceptacion(tx, prospectoId, "reglamento");
  if (!ultima) return [{ campo: "reglamento", mensaje: "Falta que la familia acepte el reglamento" }];
  if (ultima.resultado !== "aceptada") return [{ campo: "reglamento", mensaje: "La familia no aceptó el reglamento" }];
  if (ultima.documentoId !== vigente.id) return [{ campo: "reglamento", mensaje: `La familia aceptó una versión anterior del reglamento: debe aceptar la versión vigente (v${vigente.version})` }];
  return [];
}

export type ResultadoDeExtension = { ok: true; aceptacion: FilaDeAceptacion; creada: boolean } | { ok: false; motivo: "sin_aceptacion" | "version_no_vigente" | "documento_no_aplica" | "prospecto_inexistente" };

/**
 * V3 (segundo hijo): la familia que acepta el reglamento por un niño lo acepta por su hermano en el mismo momento, sin volver a leerlo ni a firmarlo. Se registra una aceptación
 * NUEVA del niño (la evidencia es de solo anexar) con el mismo adulto, el mismo canal y la misma versión, y la marca `extendida_de_prospecto` que dice de dónde salió. Solo
 * se extiende lo que sigue vigente: si el reglamento cambió, o el del niño es otro (documento propio de otra disciplina), la familia lo acepta de verdad. Quien llama es una
 * persona (el asesor) y lo hace a propósito: no ocurre por sí solo al convertir.
 */
export async function extenderAceptacionDeReglamento(db: BaseDatos, organizacionId: string, e: { desdeProspectoId: string; haciaProspectoId: string; usuarioId: string | null; ahora: Date }): Promise<ResultadoDeExtension> {
  const origen = await ultimaAceptacion(db, e.desdeProspectoId, "reglamento");
  if (!origen || origen.resultado !== "aceptada") return { ok: false, motivo: "sin_aceptacion" };
  const r = await registrarAceptacion(db, organizacionId, {
    prospectoId: e.haciaProspectoId,
    documentoId: origen.documentoId,
    version: origen.versionAceptada,
    resultado: "aceptada",
    aceptante: { nombre: origen.aceptanteNombre, parentesco: origen.aceptanteParentesco },
    canal: origen.canal,
    usuarioId: e.usuarioId,
    evidencia: { extendida_de_prospecto: e.desdeProspectoId },
    ahora: e.ahora,
  });
  if (r.ok) return r;
  if (r.motivo === "version_no_vigente") return { ok: false, motivo: "version_no_vigente" };
  if (r.motivo === "documento_no_aplica") return { ok: false, motivo: "documento_no_aplica" };
  return { ok: false, motivo: "prospecto_inexistente" };
}
