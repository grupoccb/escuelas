// Nota interna con el resumen del lead para el asesor. Se arma desde la base, no desde el
// estado en memoria del bot: lo que ve el asesor es lo que quedó guardado.

import type { Consultas } from "../datos/alcance.ts";
import { resumenDeCotizacion } from "../cotizador/cotizacion.ts";
import { deFecha } from "../catalogo/precios.ts";
import { describirSesion } from "../clases-muestra/sesiones.ts";
import { entradasVivasDe } from "../lista-espera/lista-espera.ts";
import { leerModulos } from "../modulos/index.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { textos, type MotivoPaseAsesor } from "./maquina.ts";

export async function resumenParaAsesor(tx: Consultas, leadId: string, motivo: MotivoPaseAsesor): Promise<string> {
  const lead = await tx.lead.findFirstOrThrow({ where: { id: leadId } });
  // V1: la nota no menciona lo de un módulo apagado (cotización, lista de espera, clase muestra), aunque haya quedado algo guardado de antes.
  const modulos = await leerModulos(tx);
  const prospecto = await tx.prospecto.findFirst({ where: { lead_id: lead.id, origen: "bot" } });
  const sucursal = lead.sucursal_interes_id
    ? await tx.sucursal.findFirst({ where: { id: lead.sucursal_interes_id }, select: { nombre: true } })
    : null;
  const programa = modulos.cotizador && prospecto?.programa_sugerido_id
    ? await tx.programa.findFirst({ where: { id: prospecto.programa_sugerido_id }, select: { nombre: true } })
    : null;
  // Lo cotizado y el horario elegido (C8). La más reciente que no venció.
  const cotizacion = modulos.cotizador && prospecto
    ? await tx.cotizacion.findFirst({
        where: { prospecto_id: prospecto.id, estatus: { in: ["vigente", "aceptada"] } },
        orderBy: [{ creado_en: "desc" }, { id: "desc" }],
        select: { snapshot: true, vigente_hasta: true, grupo_elegido_id: true },
      })
    : null;
  const enLista = modulos.cotizador && prospecto ? await entradasVivasDe(tx, prospecto.id) : [];
  const lineasDeCotizacion = [
    ...(cotizacion ? resumenDeCotizacion({ snapshot: cotizacion.snapshot, vigenteHasta: deFecha(cotizacion.vigente_hasta), grupoElegidoId: cotizacion.grupo_elegido_id }) : []),
    ...enLista.map((e) => `• Lista de espera: ${e.grupo} (posición ${e.posicion}${e.estatus === "ofrecido" ? ", ya se le ofreció un lugar" : ""})`),
  ];
  // D1: la clase muestra agendada (la más próxima), con su grupo y la hora de pared de la sucursal.
  const clase = modulos.clase_muestra && prospecto
    ? await tx.clase_muestra.findFirst({
        where: { prospecto_id: prospecto.id, estatus: "agendada" },
        orderBy: { fecha_hora: "asc" },
        select: { fecha_hora: true, grupo: { select: { nombre: true, programa: { select: { sucursal: { select: { zona_horaria: true } } } } } } },
      })
    : null;
  if (clase) lineasDeCotizacion.push(`• Clase muestra: ${describirSesion(clase.fecha_hora, clase.grupo.programa.sucursal.zona_horaria).completa} (${clase.grupo.nombre})`);
  const campana = lead.campana_id ? await tx.campana.findFirst({ where: { id: lead.campana_id }, select: { nombre: true } }) : null;

  const origen = lead.anuncio_id
    ? `Anuncio «${lead.anuncio_titulo ?? lead.anuncio_id}»${campana ? ` · campaña «${campana.nombre}»` : ""}`
    : null;

  return textos.resumenAsesor(motivo, {
    nombre: prospecto?.nombre ?? null,
    edad: prospecto?.edad_declarada ?? null,
    sucursal: sucursal?.nombre ?? null,
    ...(modulos.cotizador && prospecto?.programa_sugerido_id ? { programa: programa?.nombre ?? null } : {}),
    ...(lineasDeCotizacion.length > 0 ? { cotizacion: lineasDeCotizacion } : {}),
    telefono: lead.telefono,
    contacto: lead.nombre_contacto,
    origen,
    maxIntentos: (await leerConfiguracion(tx)).botMaxIntentos,
  });
}
