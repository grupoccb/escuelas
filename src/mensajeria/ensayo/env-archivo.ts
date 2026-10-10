// Edita `.env` sin tocar el resto (V9): `npm run ensayo:preparar -- --url …` solo cambia ORIGEN_PUBLICO. Las líneas, los comentarios y los secretos que ya
// están se conservan tal cual; nunca se escribe un secreto aquí (los secretos los pone la persona). El que llama es quien comprueba que `.env` está ignorado por git.

/** Pone `CLAVE=valor` en el texto de un `.env`: reemplaza la línea si existe (activa o comentada con `#`), si no la agrega al final. */
export function fusionarEnv(texto: string, pares: Record<string, string>): string {
  let lineas = texto.split("\n");
  for (const [clave, valor] of Object.entries(pares)) {
    if (/[\r\n]/.test(valor) || !/^[A-Z][A-Z0-9_]*$/.test(clave)) throw new Error(`Valor o nombre inválido para ${clave}`);
    const activa = new RegExp(`^\\s*${clave}\\s*=`);
    const i = lineas.findIndex((l) => activa.test(l));
    if (i >= 0) lineas[i] = `${clave}=${valor}`;
    else {
      // Sin línea activa: se agrega al final, antes del salto de línea final si lo hay.
      if (lineas.length > 0 && lineas[lineas.length - 1] === "") lineas = lineas.slice(0, -1);
      lineas.push(`${clave}=${valor}`, "");
    }
  }
  return lineas.join("\n");
}

/** Comenta (con `# `) las líneas activas de esas claves: regresa al modo simulado sin perder lo que escribiste (el token se queda en el archivo, apagado). */
export function apagarEnEnv(texto: string, claves: string[]): string {
  return texto
    .split("\n")
    .map((l) => (claves.some((c) => new RegExp(`^\\s*${c}\\s*=`).test(l)) ? `# ${l.trimStart()}` : l))
    .join("\n");
}
