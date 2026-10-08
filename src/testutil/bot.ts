// Escenario del bot de captación para los tests de integración del cotizador (C6 en adelante): una organización
// con su catálogo, el transporte falso y contactos que escriben por WhatsApp. Cada contacto tiene su propia
// conversación de Chatwoot y su teléfono.

import { randomInt } from "node:crypto";
import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { procesarEntrante, type DepsCaptacion } from "../captacion/entrante.ts";
import { MessagingProvider, TransporteFalso, type EnvioRegistrado, type EventoEntrante } from "../mensajeria/index.ts";
import type { FuenteOcupacion } from "../catalogo/cupo.ts";
import type { PrismaPruebas } from "./prisma-pruebas.ts";
import { sembrarEmbudo, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type ProgramaParaSembrar, type ProgramaSembrado, type TipoDeEtapa } from "./semilla.ts";

let siguienteMensaje = randomInt(1_000_000, 2_000_000_000);

export interface EscenarioBot {
  org: OrganizacionDePrueba;
  db: BaseDatos;
  /** El embudo sembrado (solo con la opción `embudo`). */
  etapas: Record<TipoDeEtapa, string> | null;
  transporte: TransporteFalso;
  programas: ProgramaSembrado[];
  /** Un contacto nuevo (su conversación y su teléfono). */
  contacto(nombre?: string): ContactoBot;
  /** Dependencias de `procesarEntrante` con el reloj de `cuando`. */
  deps(cuando?: Date): DepsCaptacion;
}

export interface ContactoBot {
  telefono: string;
  chatwootConversacionId: number;
  /** El contacto escribe; devuelve el resultado de procesarlo. */
  escribe(contenido: string, cuando?: Date, idMensaje?: string): ReturnType<typeof procesarEntrante>;
  /** El contacto escribe varios mensajes seguidos. */
  conversa(...contenidos: string[]): Promise<void>;
  conversacion(): Promise<Awaited<ReturnType<BaseDatos["conversacion"]["findFirstOrThrow"]>> & { lead: Awaited<ReturnType<BaseDatos["lead"]["findFirstOrThrow"]>> }>;
  /** Todo lo que el sistema mandó a ESTA conversación, en orden. */
  envios(): EnvioRegistrado[];
  /** Solo los mensajes al contacto (sin notas ni aperturas). */
  mensajes(): string[];
  /** Solo las notas internas. */
  notas(): string[];
}

export interface OpcionesEscenarioBot {
  nombre?: string;
  /** Enciende el cotizador de WhatsApp de la vertical (por omisión, sí: es el caso que prueban estos tests). */
  cotizador?: boolean;
  /** Enciende también la clase muestra por WhatsApp (D1). Por omisión, no. */
  claseMuestra?: boolean;
  /** Siembra el embudo con sus tipos de sistema (`sembrarEmbudo`) para que las clases muestra muevan la etapa. */
  embudo?: boolean;
  fuente?: FuenteOcupacion;
  /** Programas por sucursal: índice 0 = la primera sucursal (Norte), 1 = la segunda (Sur). */
  programas?: (Omit<ProgramaParaSembrar, "sucursalId"> & { sucursal: 0 | 1 })[];
}

export async function escenarioBot(prisma: PrismaPruebas, o: OpcionesEscenarioBot = {}): Promise<EscenarioBot> {
  const org = await sembrarOrganizacion(prisma, o.nombre ?? "Bot cotizador");
  const db = conAlcance(prisma, org.organizacionId);
  if (o.cotizador ?? true) await prisma.vertical.update({ where: { id: org.verticalId }, data: { cotizador_whatsapp_activo: true } });
  if (o.claseMuestra) await prisma.vertical.update({ where: { id: org.verticalId }, data: { clase_muestra_whatsapp_activo: true } });
  const etapas = o.embudo ? await sembrarEmbudo(prisma, org) : null;
  const programas: ProgramaSembrado[] = [];
  for (const p of o.programas ?? []) {
    const { sucursal, ...resto } = p;
    programas.push(await sembrarPrograma(prisma, org, { ...resto, sucursalId: org.sucursales[sucursal]!.id }));
  }
  const transporte = new TransporteFalso();
  const deps = (cuando?: Date): DepsCaptacion => ({
    prisma,
    mensajeria: new MessagingProvider({ transporte, ...(cuando ? { reloj: () => cuando } : {}) }),
    ...(cuando ? { reloj: () => cuando } : {}),
    ...(o.fuente ? { fuenteOcupacion: o.fuente } : {}),
  });

  const contacto = (nombre = "Mamá"): ContactoBot => {
    const chatwootConversacionId = randomInt(1, 2_000_000_000);
    const telefono = `+5255${randomInt(10_000_000, 99_999_999)}`;
    const evento = (contenido: string, idMensaje?: string): EventoEntrante => {
      const id = idMensaje ?? String(siguienteMensaje++);
      return {
        chatwootAccountId: org.chatwootAccountId,
        chatwootInboxId: org.chatwootInboxId,
        chatwootConversacionId,
        idMensaje: id,
        contenido,
        estadoConversacion: "pending",
        contacto: { nombre, telefono },
        creadoEn: null,
        llave: { proveedor: "chatwoot", id },
        numeroReceptor: null,
        crudo: null,
      };
    };
    const escribe = (contenido: string, cuando?: Date, idMensaje?: string) => procesarEntrante(deps(cuando), evento(contenido, idMensaje));
    const delContacto = (e: EnvioRegistrado): boolean => e.destino.chatwootConversacionId === chatwootConversacionId;
    return {
      telefono,
      chatwootConversacionId,
      escribe,
      async conversa(...contenidos) {
        for (const c of contenidos) await escribe(c);
      },
      conversacion: () =>
        db.conversacion.findFirstOrThrow({ where: { bandeja_chatwoot_id: org.bandejaId, chatwoot_conversacion_id: chatwootConversacionId }, include: { lead: true } }),
      envios: () => transporte.envios.filter(delContacto),
      mensajes: () => transporte.envios.filter((e) => delContacto(e) && e.tipo === "mensaje").map((e) => e.texto ?? ""),
      notas: () => transporte.envios.filter((e) => delContacto(e) && e.tipo === "nota_interna").map((e) => e.texto ?? ""),
    };
  };
  return { org, db, etapas, transporte, programas, contacto, deps };
}
