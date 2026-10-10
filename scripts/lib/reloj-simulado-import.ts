// `node --import ./scripts/lib/reloj-simulado-import.ts …`: instala el reloj simulado si el entorno trae PRUEBAS_AHORA o PRUEBAS_DESFASE_MS (ver reloj-simulado.ts).
import { instalarRelojSimulado } from "./reloj-simulado.ts";

instalarRelojSimulado();
