export { CAMPOS_SENSIBLES, esCampoSensible, esClaveSecreta, esClaveSensible, normalizarNombre, type CampoSensible } from "./campos.ts";
export { REDACTADO, Sensible, esSensible } from "./marca.ts";
export { crearCifrador, cifradorDesdeEntorno, ErrorCifrado, kidDe, type Cifrador } from "./cifrado.ts";
export {
  ErrorAccesoSensible,
  guardarSensible,
  leerSensible,
  listarAccesos,
  registrarDenegado,
  maestroDelSujetoPorDefecto,
  camposConDato,
  contactoDeEmergenciaCoincide,
  type ActorSensible,
  type FichaLeida,
  type FilaAcceso,
  type FiltroAccesos,
  type MaestroDelSujeto,
  type OpcionesSensibles,
  type Peticion,
  type SujetoSalud,
} from "./ficha.ts";
export {
  contactoDeEntradaEsTutor,
  contactoGuardadoEsTutor,
  ERROR_CONTACTO_ES_TUTOR,
  estadoDeSalud,
  guardarSaludDelRegistro,
  leerEntradaDeSalud,
  MENSAJE_SIN_SALUD,
  mencionaSalud,
  mismaPersona,
  puedeEscribirSalud,
  rechazarEscrituraDeSalud,
  type EntradaDeSalud,
  type EstadoDeSalud,
  type PersonaDelRegistro,
} from "./registro-salud.ts";
export { trasladarFichaDeProspectoAAlumno, type OpcionesDeTraslado } from "./traslado.ts";
