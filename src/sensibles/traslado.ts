// Traslado de la ficha de salud del PROSPECTO a la de su ALUMNO (F2). Es lo único que mueve datos de salud entre sujetos, y vive aquí
// (decisión 12: nadie fuera de src/sensibles/ nombra la ficha).
//
// Los valores van cifrados y ligados a su fila y campo (datos asociados = organización|sujeto_tipo|sujeto_id|campo), así que un texto cifrado
// del prospecto no descifra bajo el alumno: se DESCIFRA con el contexto de origen y se CIFRA de nuevo con el de destino, en la misma
// transacción, sin que el valor salga de este archivo. Es una operación del sistema (la ejecuta quien convierte al lead, que no tiene por qué leer
// salud); por eso no exige `salud:leer`, y deja constancia en `acceso_dato_sensible` con la acción `trasladar` (quién, desde qué prospecto,
// hacia qué alumno, qué campos —solo sus nombres—). Lo que el alumno ya tuviera NO se pisa; la ficha del prospecto queda dada de baja y sin
// valores (el dato se mudó, no se duplicó).

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { CAMPOS_SENSIBLES, type CampoSensible } from "./campos.ts";
import { cifradorDesdeEntorno, type Cifrador } from "./cifrado.ts";

let cifradorDelProceso: Cifrador | undefined;

export interface OpcionesDeTraslado {
  organizacionId: string;
  prospectoId: string;
  alumnoId: string;
  /** Quien convierte (queda en el registro de accesos). */
  usuarioId: string;
  cifrador?: Cifrador;
  /** Por qué se traslada (queda en el registro). */
  motivo?: string;
  ruta?: string;
}

const aad = (organizacionId: string, tipo: "prospecto" | "alumno", id: string, campo: CampoSensible): string => `${organizacionId}|${tipo}|${id}|${campo}`;

/** Mueve la ficha del prospecto al alumno. Devuelve los NOMBRES de los campos que pasaron (vacío = no había ficha o no había nada nuevo). */
export async function trasladarFichaDeProspectoAAlumno(tx: Consultas, o: OpcionesDeTraslado): Promise<CampoSensible[]> {
  const cifrador = o.cifrador ?? (cifradorDelProceso ??= cifradorDesdeEntorno());
  const seleccion = Object.fromEntries(CAMPOS_SENSIBLES.map((c) => [c, true])) as Record<CampoSensible, true>;
  const origen = (await tx.ficha_salud.findFirst({ where: { sujeto_tipo: "prospecto", sujeto_id: o.prospectoId }, select: { id: true, ...seleccion } })) as ({ id: string } & Partial<Record<CampoSensible, string | null>>) | null;
  if (!origen) return [];
  const destino = (await tx.ficha_salud.findFirst({ where: { sujeto_tipo: "alumno", sujeto_id: o.alumnoId }, select: { id: true, ...seleccion } })) as ({ id: string } & Partial<Record<CampoSensible, string | null>>) | null;

  const nuevos: Partial<Record<CampoSensible, string>> = {};
  for (const c of CAMPOS_SENSIBLES) {
    const guardado = origen[c];
    if (!guardado) continue;
    if (destino?.[c]) continue; // lo que el alumno ya tenía no se pisa
    nuevos[c] = cifrador.cifrar(cifrador.descifrar(guardado, aad(o.organizacionId, "prospecto", o.prospectoId, c)), aad(o.organizacionId, "alumno", o.alumnoId, c));
  }
  const campos = Object.keys(nuevos) as CampoSensible[];
  if (campos.length > 0) {
    if (destino) await tx.ficha_salud.update({ where: { id: destino.id }, data: nuevos });
    else await tx.ficha_salud.create({ data: altaConAlcance({ sujeto_tipo: "alumno" as const, sujeto_id: o.alumnoId, ...nuevos }) });
    await tx.acceso_dato_sensible.create({
      data: altaConAlcance({
        usuario_id: o.usuarioId,
        sujeto_tipo: "alumno" as const,
        sujeto_id: o.alumnoId,
        accion: "trasladar",
        resultado: "permitido",
        campos,
        motivo: (o.motivo ?? "Conversión del lead en alumno").slice(0, 300),
        ruta: (o.ruta ?? "conversion").slice(0, 200),
      }),
    });
  }
  // El dato se mudó: la ficha del prospecto queda dada de baja y sin valores.
  await tx.ficha_salud.update({
    where: { id: origen.id },
    data: { alergias: null, condiciones_medicas: null, medicamentos: null, contacto_emergencia: null, autorizacion_atencion_medica: null, eliminado_en: new Date() },
  });
  return campos;
}
