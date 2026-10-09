// La carga del catálogo desde hojas de Excel (V6). Ver `datos.ts` (orquestación), `plan.ts` (reglas), `lectura.ts` y `csv.ts` (archivos) y `plantillas.ts` (las hojas que se descargan).

export { importarCatalogo, cargarExistente, type Informe, type ModoDeCarga, type OpcionesDeCarga, type ProblemaDeInforme } from "./datos.ts";
export { descargasDePlantillas, plantillaCsv, instrucciones, crearZip, archivosDePlantillas, NOMBRE_DEL_ZIP, NOMBRE_DE_INSTRUCCIONES } from "./plantillas.ts";
export { ESQUEMAS, TIPOS, type Tipo } from "./esquemas.ts";
export { leerArchivos, textoDeProblema, type ArchivoDeEntrada } from "./lectura.ts";
export { planificar, EXISTENTE_VACIO, type Existente, type Plan } from "./plan.ts";
