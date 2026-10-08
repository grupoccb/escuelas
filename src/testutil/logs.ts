// Colector de logs para pruebas: captura lo que `log.*` (y cualquier console.log/error) escribe.

export interface ColectorDeLogs {
  lineas: string[];
  /** Todo lo capturado, junto. */
  texto(): string;
  detener(): void;
}

export function colectarLogs(): ColectorDeLogs {
  const lineas: string[] = [];
  const log = console.log;
  const error = console.error;
  const warn = console.warn;
  const captura = (...partes: unknown[]): void => {
    lineas.push(partes.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" "));
  };
  console.log = captura;
  console.error = captura;
  console.warn = captura;
  return {
    lineas,
    texto: () => lineas.join("\n"),
    detener: () => {
      console.log = log;
      console.error = error;
      console.warn = warn;
    },
  };
}
