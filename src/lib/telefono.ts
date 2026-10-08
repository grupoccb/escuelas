// Única función que toca el formato de un teléfono (invariante 7). Toda búsqueda o alta de
// contacto pasa por aquí.
//
// Salida: E.164 ("+525512345678"). En México colapsa el "1" de móvil: WhatsApp manda
// "+521…" en unos contextos y "+52…" en otros, y si no se colapsa la misma persona termina
// con dos conversaciones. Si algún día Twilio exige el "1" al enviar, se agrega en el
// adaptador de Twilio, no aquí.

/** Lada de México. */
const MX = "52";

/** Longitud de un número nacional mexicano (lada + número), sin código de país. */
const MX_NACIONAL = 10;

/**
 * Normaliza un teléfono a E.164. Devuelve `null` si no se puede interpretar.
 *
 * Acepta espacios, guiones, paréntesis y puntos, el prefijo `whatsapp:` de Twilio, el
 * prefijo internacional `00` y números mexicanos de 10 dígitos sin código de país.
 */
export function normalizarTelefono(entrada: string): string | null {
  let s = entrada.trim().replace(/^whatsapp:/i, "").trim();
  if (!/^\+?[\d\s\-().]+$/.test(s)) return null;

  const conMas = s.startsWith("+");
  s = s.replace(/\D/g, "");

  let digitos: string;
  if (conMas) {
    digitos = s;
  } else if (s.startsWith("00")) {
    digitos = s.slice(2);
  } else if (s.length === MX_NACIONAL) {
    digitos = MX + s;
  } else if (s.startsWith(MX) && (s.length === MX.length + MX_NACIONAL || s.length === MX.length + 1 + MX_NACIONAL)) {
    digitos = s;
  } else {
    return null;
  }

  if (digitos.startsWith(MX)) {
    const resto = digitos.slice(MX.length);
    if (resto.length === MX_NACIONAL + 1 && resto.startsWith("1")) return `+${MX}${resto.slice(1)}`;
    if (resto.length === MX_NACIONAL) return `+${MX}${resto}`;
    return null;
  }

  // Otros países: E.164 permite hasta 15 dígitos y ningún código de país empieza con 0.
  if (digitos.length < 8 || digitos.length > 15 || digitos.startsWith("0")) return null;
  return `+${digitos}`;
}

/**
 * Número receptor de un canal de WhatsApp en la forma canónica de `canal_whatsapp.numero_whatsapp`:
 * "whatsapp:" + E.164 de normalizarTelefono(). Devuelve `null` si no se puede interpretar.
 */
export function normalizarNumeroWhatsapp(entrada: string): string | null {
  const e164 = normalizarTelefono(entrada);
  return e164 ? `whatsapp:${e164}` : null;
}
