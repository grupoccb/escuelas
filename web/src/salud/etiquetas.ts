// Los textos de la sección de salud. ÚNICO lugar de la interfaz (junto con FormularioSalud) donde se nombran los campos de salud de un menor (decisión 12):
// `check:sensibles` lo impone. Nada de este módulo se guarda en el navegador ni se escribe en la consola.

const ETIQUETAS: Record<string, string> = {
  alergias: "Alergias",
  condiciones_medicas: "Condiciones médicas",
  medicamentos: "Medicamentos",
  contacto_emergencia: "Contacto de emergencia",
  autorizacion_atencion_medica: "Autorización de atención médica",
};

/** «salud.alergias» → «Salud: alergias»; null si el campo no es de salud (para que `etiquetaDeFaltante` pruebe otra cosa). */
export function etiquetaDeSalud(campo: string): string | null {
  if (!campo.startsWith("salud.")) return null;
  return `Salud: ${(ETIQUETAS[campo.slice(6)] ?? campo.slice(6)).toLowerCase()}`;
}
