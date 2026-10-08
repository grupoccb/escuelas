// Registro de quién cambió qué (B3). Cada endpoint de ESCRITURA llama a `registrarCambio` dentro de
// la misma transacción que el cambio: si el cambio se revierte, su registro también; si el registro
// falla, el cambio no ocurre.
//
// LISTA BLANCA: por cada entidad, los únicos campos que se guardan en `antes`/`despues`. Todo lo
// demás se descarta, aunque el llamador pase la fila completa. Nunca entran contraseñas, tokens ni
// datos sensibles: un test recorre las listas y falla si alguna trae un campo prohibido.
//
// Para auditar una entidad nueva: agrega su entrada en CAMPOS_AUDITABLES (solo campos de negocio).
//
//   await registrarCambio(tx, ctx, { entidad: "usuario", entidadId: id, accion: "actualizar", antes, despues });

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import type { ValorJson } from "../datos/tipos.ts";
import { esCampoProhibidoEnRegistro } from "../sensibles/campos.ts";
import type { ContextoApi } from "./contexto.ts";

export { esCampoProhibidoEnRegistro };

/** Campos que se guardan por entidad. Los nombres son los de la tabla (`tarea_asesor`, no «tarea»). */
export const CAMPOS_AUDITABLES = {
  usuario: ["nombre", "rol", "activo", "sucursales", "chatwoot_agent_id"],
  tarea_asesor: ["estado", "resuelta_en"],
  salon: ["sucursal_id", "nombre", "capacidad", "activo"],
  instructor: ["nombre", "telefono", "correo", "activo", "usuario_id", "sucursales"],
  precio: ["programa_id", "costo_inscripcion", "costo_mensualidad", "moneda", "vigencia_desde", "vigencia_hasta"],
  promocion: ["nombre", "codigo", "vigencia_desde", "vigencia_hasta", "condicion_tipo", "condicion_valor", "cupo_maximo", "acumulable", "prioridad", "activo", "verticales", "sucursales", "programas"],
  promocion_beneficio: ["promocion_id", "tipo", "modo", "valor", "producto_id", "descripcion", "momento_disparo"],
  grupo: ["nombre", "cupo_maximo", "permite_lista_espera", "activo", "salon_id", "instructor_id", "horarios"],
} as const satisfies Record<string, readonly string[]>;

export type EntidadAuditable = keyof typeof CAMPOS_AUDITABLES;

export type AccionDeCambio =
  | "crear"
  | "actualizar"
  | "eliminar"
  | "resolver"
  | "descartar"
  | "cambiar_contrasena"
  | "restablecer_contrasena"
  | "vincular_chatwoot"
  | "desvincular_chatwoot";

type Valor = string | number | boolean | null | Date | (string | number | boolean | null)[];
export type Instantanea = Record<string, Valor | undefined>;

// Al cargar el módulo: ninguna lista blanca puede nombrar un campo prohibido (contraseñas, tokens, salud).
for (const [entidad, campos] of Object.entries(CAMPOS_AUDITABLES)) {
  for (const campo of campos) {
    if (esCampoProhibidoEnRegistro(campo)) throw new Error(`CAMPOS_AUDITABLES.${entidad} incluye el campo prohibido «${campo}»`);
  }
}

function aJson(v: Valor): ValorJson {
  if (v instanceof Date) return v.toISOString();
  return v as ValorJson;
}

/** Solo los campos de la lista blanca, convertidos a JSON. `null`/`undefined` en la entrada → null. */
export function filtrarCampos(entidad: EntidadAuditable, datos: Instantanea | null | undefined): Record<string, ValorJson> | null {
  if (!datos) return null;
  const salida: Record<string, ValorJson> = {};
  for (const campo of CAMPOS_AUDITABLES[entidad] as readonly string[]) {
    const v = datos[campo];
    if (v !== undefined) salida[campo] = aJson(v);
  }
  return salida;
}

/** Deja en cada lado solo los campos que cambiaron (para `actualizar`). */
export function soloLoQueCambio(antes: Record<string, ValorJson>, despues: Record<string, ValorJson>): { antes: Record<string, ValorJson>; despues: Record<string, ValorJson> } {
  const a: Record<string, ValorJson> = {};
  const d: Record<string, ValorJson> = {};
  for (const campo of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (JSON.stringify(antes[campo]) !== JSON.stringify(despues[campo])) {
      if (campo in antes) a[campo] = antes[campo] as ValorJson;
      if (campo in despues) d[campo] = despues[campo] as ValorJson;
    }
  }
  return { antes: a, despues: d };
}

export interface CambioARegistrar {
  entidad: EntidadAuditable;
  entidadId: string;
  accion: AccionDeCambio;
  antes?: Instantanea | null;
  despues?: Instantanea | null;
  /** En `actualizar`, guardar solo lo que cambió (por omisión sí). */
  soloDiferencias?: boolean;
}

export async function registrarCambio(tx: Consultas, ctx: Pick<ContextoApi, "usuario">, cambio: CambioARegistrar): Promise<void> {
  let antes = filtrarCampos(cambio.entidad, cambio.antes);
  let despues = filtrarCampos(cambio.entidad, cambio.despues);
  if (cambio.accion === "actualizar" && cambio.soloDiferencias !== false && antes && despues) {
    ({ antes, despues } = soloLoQueCambio(antes, despues));
    // Nada cambió de lo que se audita (p. ej. solo una contraseña, que tiene su propio registro).
    if (Object.keys(antes).length === 0 && Object.keys(despues).length === 0) return;
  }
  await tx.registro_cambio.create({
    data: altaConAlcance({
      usuario_id: ctx.usuario.id,
      entidad_tipo: cambio.entidad,
      entidad_id: cambio.entidadId,
      accion: cambio.accion,
      ...(antes ? { antes } : {}),
      ...(despues ? { despues } : {}),
    }),
  });
}
