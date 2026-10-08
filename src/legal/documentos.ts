// Documentos legales versionados (D6): reglamento, autorización de uso de imagen y aviso de privacidad. INMUTABLES: cambiar un texto es crear la
// versión siguiente (la base impide UPDATE y DELETE). La versión VIGENTE de un tipo es la más alta cuyo `vigente_desde` ya llegó; un documento de
// una vertical manda sobre el general (sin vertical). El código nunca trae el texto: viene de la tabla (invariante 2).

import { createHash } from "node:crypto";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";

export const TIPOS_DE_DOCUMENTO = ["reglamento", "uso_imagen", "aviso_privacidad"] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

/** Cómo se llama cada tipo en los textos de la API (genérico: el contenido de cada documento es de la escuela). */
export const NOMBRE_DE_TIPO: Record<TipoDeDocumento, string> = {
  reglamento: "el reglamento",
  uso_imagen: "la autorización de uso de imagen",
  aviso_privacidad: "el aviso de privacidad",
};

export interface DocumentoLegal {
  id: string;
  tipo: TipoDeDocumento;
  verticalId: string | null;
  version: number;
  titulo: string;
  texto: string;
  textoHash: string;
  vigenteDesde: Date;
}

/** SHA-256 en hexadecimal del texto: la huella de lo que se le mostró a quien aceptó. */
export const hashDeTexto = (texto: string): string => createHash("sha256").update(texto, "utf8").digest("hex");

const SELECCION = { id: true, tipo: true, vertical_id: true, version: true, titulo: true, texto: true, texto_hash: true, vigente_desde: true } as const;
type Fila = { id: string; tipo: TipoDeDocumento; vertical_id: string | null; version: number; titulo: string; texto: string; texto_hash: string; vigente_desde: Date };
const aDocumento = (f: Fila): DocumentoLegal => ({ id: f.id, tipo: f.tipo, verticalId: f.vertical_id, version: f.version, titulo: f.titulo, texto: f.texto, textoHash: f.texto_hash, vigenteDesde: f.vigente_desde });

/**
 * La versión vigente de un tipo para una vertical, en ese instante: la más alta de las de esa vertical cuyo `vigente_desde` ya llegó; si la
 * vertical no tiene documento propio de ese tipo, la más alta del general. null si no hay ninguno.
 */
export async function documentoVigente(tx: Consultas | BaseDatos, tipo: TipoDeDocumento, verticalId: string | null, ahora: Date): Promise<DocumentoLegal | null> {
  const donde = (vertical: string | null) => ({ tipo, vertical_id: vertical, vigente_desde: { lte: ahora } });
  if (verticalId) {
    const propio = (await tx.documento_legal.findFirst({ where: donde(verticalId), orderBy: { version: "desc" }, select: SELECCION })) as Fila | null;
    if (propio) return aDocumento(propio);
  }
  const general = (await tx.documento_legal.findFirst({ where: donde(null), orderBy: { version: "desc" }, select: SELECCION })) as Fila | null;
  return general ? aDocumento(general) : null;
}

/** Los vigentes de todos los tipos para una vertical (los que existan). */
export async function documentosVigentes(tx: Consultas | BaseDatos, verticalId: string | null, ahora: Date): Promise<DocumentoLegal[]> {
  const salida: DocumentoLegal[] = [];
  for (const tipo of TIPOS_DE_DOCUMENTO) {
    const d = await documentoVigente(tx, tipo, verticalId, ahora);
    if (d) salida.push(d);
  }
  return salida;
}

export interface EntradaDeVersion {
  tipo: TipoDeDocumento;
  verticalId: string | null;
  titulo: string;
  texto: string;
  /** Desde cuándo rige. Por omisión, ahora. No puede ser anterior a la de la versión anterior. */
  vigenteDesde?: Date;
  usuarioId: string | null;
}

export type ResultadoDeVersion = { ok: true; documento: DocumentoLegal } | { ok: false; motivo: "vertical_inexistente" | "vigente_desde_anterior" };

/**
 * Crea la versión siguiente de un documento (la anterior no se toca). La numeración es por (tipo, vertical) y se toma bajo un candado: dos
 * administradores publicando a la vez obtienen versiones distintas, nunca la misma.
 */
export async function crearVersionDeDocumento(db: BaseDatos, organizacionId: string, e: EntradaDeVersion, ahora: Date): Promise<ResultadoDeVersion> {
  return transaccionConBloqueo(db, organizacionId, `documento_legal:${e.tipo}:${e.verticalId ?? "general"}`, async (tx) => {
    if (e.verticalId && !(await tx.vertical.findFirst({ where: { id: e.verticalId }, select: { id: true } }))) return { ok: false as const, motivo: "vertical_inexistente" as const };
    const ultima = await tx.documento_legal.findFirst({ where: { tipo: e.tipo, vertical_id: e.verticalId }, orderBy: { version: "desc" }, select: { version: true, vigente_desde: true } });
    const desde = e.vigenteDesde ?? ahora;
    if (ultima && desde.getTime() < ultima.vigente_desde.getTime()) return { ok: false as const, motivo: "vigente_desde_anterior" as const };
    const creada = (await tx.documento_legal.create({
      data: altaConAlcance({ tipo: e.tipo, vertical_id: e.verticalId, version: (ultima?.version ?? 0) + 1, titulo: e.titulo, texto: e.texto, texto_hash: hashDeTexto(e.texto), vigente_desde: desde, creado_por_usuario_id: e.usuarioId }),
      select: SELECCION,
    })) as Fila;
    return { ok: true as const, documento: aDocumento(creada) };
  });
}
