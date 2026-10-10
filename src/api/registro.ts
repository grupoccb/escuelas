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
  // V3: un niño de la ficha del lead. NADA identificable (ni nombre ni fecha de nacimiento): `campos` dice qué se tocó, no con qué valores.
  prospecto: ["lead_id", "vertical_interes_id", "origen", "campos"],
  lista_espera: ["grupo_id", "prospecto_id", "lead_id", "estatus", "posicion"],
  cotizacion: ["lead_id", "prospecto_id", "programa_id", "sucursal_id", "grupo_elegido_id", "origen", "estatus", "fecha", "vigente_hasta", "hermanos_inscritos", "meses_pagados"],
  // `notas` y `motivo_cancelacion` NO se auditan (ED-03): son texto libre, pueden llevar datos de salud («está enfermo») y el registro de
  // cambios es de solo anexar y no se purga (decisión 12). El motivo vive en la clase, con su permiso y su baja lógica.
  clase_muestra: ["lead_id", "prospecto_id", "grupo_id", "fecha_hora", "estatus", "agendada_por", "reprogramada_de_id", "asistencia_marcada_en", "listo_para_cerrar_en"],
  aviso_maestro: ["leido_en"],
  // D5: SOLO campos no identificables. El registro de cambios es de solo anexar y no se purga: nada de nombres, fechas de nacimiento,
  // teléfonos ni salud. `secciones` dice QUÉ partes del registro se tocaron (alumno, tutores, salud, antecedentes, observacion).
  // D6: el documento (sin su texto, que es público y vive en su tabla inmutable) y la aceptación (sin el nombre de quien aceptó: está en `aceptacion_legal`).
  // D7: el cambio de etapa del lead (el historial completo vive en `lead_etapa_historial`) y el catálogo de motivos de pérdida.
  lead: ["etapa_id", "motivo_perdida_id", "recuperaciones", "tutor_id", "sucursal_interes_id"],
  motivo_perdida: ["codigo", "nombre", "orden", "activo"],
  // E2: campañas y sus códigos de rastreo.
  campana: ["nombre", "origen", "vertical_id", "sucursal_id", "anuncio_id", "activo"],
  codigo_rastreo: ["codigo", "tipo", "campana_id", "sucursal_id", "vertical_id", "max_usos", "vigente_desde", "vigente_hasta", "activo"],
  documento_legal: ["tipo", "vertical_id", "version", "titulo", "vigente_desde"],
  aceptacion_legal: ["tipo", "version_aceptada", "resultado", "canal", "documento_id"],
  registro_clase_muestra: ["estatus", "motivo_clase", "practico_antes", "interes_percibido", "grupo_recomendado_id", "salud_completa", "secciones"],
  // F1: la familia. Como en el registro de la clase muestra, NADA identificable: el registro de cambios es de solo anexar y no se purga.
  // `campos` dice QUÉ campos se tocaron (nunca sus valores). Los vínculos sí guardan sus banderas y los ids (no son datos personales).
  tutor: ["sucursal_id", "campos"],
  alumno: ["estatus", "sucursal_id", "campos"],
  tutor_alumno: ["tutor_id", "alumno_id", "parentesco", "es_responsable_pago", "es_contacto_urgencia", "puede_recoger", "lo_lleva"],
  // F3: la inscripción. Nada identificable: ids, fechas, estatus y los importes congelados.
  inscripcion: ["estatus", "alumno_id", "grupo_id", "programa_id", "lead_id", "promocion_id", "fecha_inicio", "fecha_baja", "dia_corte_pago", "precio_inscripcion_aplicado", "precio_mensualidad_aplicado", "motivo_baja_id"],
  motivo_baja: ["codigo", "nombre", "orden", "activo"],
  // G1: el pase de lista. Solo ids, la fecha, el estatus y el método (nada identificable).
  asistencia: ["inscripcion_id", "grupo_id", "fecha", "estatus", "metodo"],
  // G3: los peldaños (catálogo) y lo que cada alumno obtuvo. Sin `observaciones` (texto libre que puede mencionar salud, decisión 12).
  nivel_progresion: ["vertical_id", "nombre", "orden", "color_hex", "horas_minimas", "clases_minimas", "requisitos_texto"],
  alumno_progresion: ["alumno_id", "nivel_id", "fecha_obtenido", "evento_id", "instructor_id"],
  // G4: el evento (con su cuota como texto exacto) y la participación de cada alumno. Sin observaciones.
  evento: ["vertical_id", "sucursal_id", "tipo", "nombre", "fecha", "cuota", "cupo", "requiere_vestuario", "otorga_progresion"],
  evento_alumno: ["evento_id", "alumno_id", "estatus", "resultado", "nivel_otorgado_id"],
  // H1: el cargo (lo que se debe). Ids, concepto, periodo, importes como texto exacto y estatus; nada identificable ni texto libre.
  cargo: ["tutor_id", "alumno_id", "inscripcion_id", "sucursal_id", "concepto", "periodo", "monto", "descuento", "monto_final", "fecha_vencimiento", "estatus"],
  // H2: el pago (sin `referencia` ni `motivo_cancelacion`: texto libre, no se audita) y su cancelación.
  pago: ["tutor_id", "monto", "metodo", "fecha", "estatus", "aplicaciones"],
  // H4: la entrega de un beneficio diferido (ids y estatus).
  promocion_aplicacion: ["inscripcion_id", "promocion_id", "beneficio_id", "estatus", "venta_id"],
  // H5: el catálogo de productos (precio como texto exacto) y las ventas. `stock` se audita en los ajustes de inventario.
  producto: ["vertical_id", "nombre", "talla", "precio", "stock", "activo"],
  venta: ["tutor_id", "alumno_id", "producto_id", "cantidad", "total", "estatus"],
  // I2: el gasto de una campaña (id de la campaña, fecha y monto como texto exacto; la nota es texto libre y no se audita).
  gasto_campana: ["campana_id", "fecha", "monto"],
  // J7: el catálogo administrado por pantalla. Nada identificable; los identificadores del proveedor (SID, WABA) no se guardan en el registro.
  vertical: ["nombre", "slug", "etiqueta_progresion", "etiqueta_evento", "usa_progresion", "color_marca", "logo_url", "cotizador_whatsapp_activo", "clase_muestra_whatsapp_activo", "activo"],
  sucursal: ["nombre", "direccion", "zona_horaria", "activo"],
  sucursal_vertical: ["sucursal_id", "vertical_id", "activo"],
  programa: ["vertical_id", "sucursal_id", "nombre", "edad_min", "edad_max", "nivel", "permite_traslape", "fecha_corte_edad", "activo"],
  canal_whatsapp: ["vertical_id", "sucursal_id", "numero_whatsapp", "nombre_publico", "calidad_meta", "activo"],
  bandeja_chatwoot: ["canal_whatsapp_id", "nombre", "chatwoot_account_id", "chatwoot_inbox_id"],
  // J7 (con la configuración de la organización, que usa J8 para sus topes).
  configuracion_organizacion: ["max_automaticos_por_dia", "max_marketing_por_ventana", "ventana_marketing_dias", "cotizacion_vigencia_dias", "lista_espera_oferta_horas", "clase_muestra_anticipacion_min", "clase_muestra_horizonte_dias", "clase_muestra_correccion_horas", "umbral_faltas_consecutivas", "umbral_dias_deuda", "horario_envio_inicio_min", "horario_envio_fin_min", "lead_a_medias_minutos", "bot_max_intentos", "ocupacion_a_reventar_pct", "ocupacion_vacio_pct", "sucursal_sin_programa", "modo_cierre", "modulo_cotizador", "modulo_clase_muestra", "modulo_inscripcion", "modulo_operacion", "modulo_finanzas", "modulo_tableros"],
  // V5: los textos del bot que la escuela personalizó (los escribe la escuela; sin datos de personas) y las etapas del embudo (nombres y días de alerta).
  texto_bot: ["clave", "texto"],
  etapa_pipeline: ["nombre", "orden", "dias_alerta_sin_movimiento", "tipo_sistema", "es_ganado", "es_perdido"],
  // J8: las plantillas (sin su cuerpo de referencia) y las automatizaciones.
  plantilla_mensaje: ["codigo", "vertical_id", "categoria", "clase_mensaje", "tipo_content", "idioma", "estado_aprobacion", "activo"],
  automatizacion: ["nombre", "vertical_id", "sucursal_id", "evento_disparador", "offset_minutos", "plantilla_id", "max_intentos", "espaciado_minutos", "hora_inicio_min", "hora_fin_min", "dias_permitidos", "max_atraso_dias", "activo"],
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
