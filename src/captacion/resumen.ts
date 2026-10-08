// Nota interna con el resumen del lead para el asesor. Se arma desde la base, no desde el
// estado en memoria del bot: lo que ve el asesor es lo que quedó guardado.

import type { Consultas } from "../datos/alcance.ts";
import { resumenDeCotizacion } from "../cotizador/cotizacion.ts";
import { deFecha } from "../catalogo/precios.ts";
import { entradasVivasDe } from "../lista-espera/lista-espera.ts";
import { textos, type MotivoPaseAsesor } from "./maquina.ts";

export async function resumenParaAsesor(tx: Consultas, leadId: string, motivo: MotivoPaseAsesor): Promise<string> {
  const lead = await tx.lead.findFirstOrThrow({ where: { id: leadId } });
  const prospecto = await tx.prospecto.findFirst({ where: { lead_id: lead.id, origen: "bot" } });
  const sucursal = lead.sucursal_interes_id
    ? await tx.sucursal.findFirst({ where: { id: lead.sucursal_interes_id }, select: { nombre: true } })
    : null;
  const programa = prospecto?.programa_sugerido_id
    ? await tx.programa.findFirst({ where: { id: prospecto.programa_sugerido_id }, select: { nombre: true } })
    : null;
  // Lo cotizado y el horario elegido (C8). La más reciente que no venció.
  const cotizacion = prospecto
    ? await tx.cotizacion.findFirst({
        where: { prospecto_id: prospecto.id, estatus: { in: ["vigente", "aceptada"] } },
        orderBy: [{ creado_en: "desc" }, { id: "desc" }],
        select: { snapshot: true, vigente_hasta: true, grupo_elegido_id: true },
      })
    : null;
  const enLista = prospecto ? await entradasVivasDe(tx, prospecto.id) : [];
  const lineasDeCotizacion = [
    ...(cotizacion ? resumenDeCotizacion({ snapshot: cotizacion.snapshot, vigenteHasta: deFecha(cotizacion.vigente_hasta), grupoElegidoId: cotizacion.grupo_elegido_id }) : []),
    ...enLista.map((e) => `• Lista de espera: ${e.grupo} (posición ${e.posicion}${e.estatus === "ofrecido" ? ", ya se le ofreció un lugar" : ""})`),
  ];
  const campana = lead.campana_id ? await tx.campana.findFirst({ where: { id: lead.campana_id }, select: { nombre: true } }) : null;

  const origen = lead.anuncio_id
    ? `Anuncio «${lead.anuncio_titulo ?? lead.anuncio_id}»${campana ? ` · campaña «${campana.nombre}»` : ""}`
    : null;

  return textos.resumenAsesor(motivo, {
    nombre: prospecto?.nombre ?? null,
    edad: prospecto?.edad_declarada ?? null,
    sucursal: sucursal?.nombre ?? null,
    ...(prospecto?.programa_sugerido_id ? { programa: programa?.nombre ?? null } : {}),
    ...(lineasDeCotizacion.length > 0 ? { cotizacion: lineasDeCotizacion } : {}),
    telefono: lead.telefono,
    contacto: lead.nombre_contacto,
    origen,
  });
}
