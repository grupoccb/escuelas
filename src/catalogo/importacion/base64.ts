// ¿Es base64? (V13-fix, EV-07). La validación anterior —`/^[A-Za-z0-9+/\s]*={0,2}\s*$/` con `\s` dentro de la clase repetida Y en el `\s*` final— retrocedía de forma cuadrática:
// un administrador mandaba 20 000 espacios y un «!» y el servidor (un solo hilo, todas las organizaciones) tardaba ~170 ms; con 1 M de espacios, minutos. Ahora primero se quitan los
// espacios en una sola pasada y la comprobación es una clase simple seguida de «=» opcional: tiempo lineal sin importar el contenido.

/** Quita los espacios y saltos de línea (los clientes parten el base64 en líneas) en una pasada, sin retroceso. */
export function sinEspacios(texto: string): string {
  return texto.replace(/\s+/g, "");
}

/** Base64 estándar: caracteres válidos y a lo más dos «=» al final. Espacios y saltos de línea se toleran. */
export function esBase64Valido(texto: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(sinEspacios(texto));
}
