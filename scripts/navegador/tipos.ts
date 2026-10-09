// La forma del mundo de datos de las pruebas en navegador (`.tmp/navegador/mundo.json`). SIN imports del backend: la leen también los tests de web/e2e.

export type RolDelMundo = "administrador" | "asesor" | "maestro" | "recepcion";

export interface UsuarioDelMundo {
  id: string;
  correo: string;
  contrasena: string;
  nombre: string;
  rol: RolDelMundo;
}

export interface Mundo {
  base: string;
  organizacion: { id: string; slug: string };
  usuarios: { administrador: UsuarioDelMundo; asesor: UsuarioDelMundo; maestro: UsuarioDelMundo; recepcion: UsuarioDelMundo; bloqueable: UsuarioDelMundo };
  sucursales: { norte: { id: string; nombre: string }; sur: { id: string; nombre: string } };
  verticalId: string;
  etapas: Record<string, string>;
  programaId: string;
  grupos: { a: { id: string; nombre: string }; b: { id: string; nombre: string } };
  instructorId: string;
  /** J2: lo que el maestro ve. */
  maestro: {
    /** Una clase muestra que ya empezó (agendada): el maestro la registra y marca asistencia. */
    clase: ClaseDelMundo;
    /** Otra, dentro de unos días (todavía no se puede marcar asistencia). */
    claseFutura: ClaseDelMundo;
    /** De un grupo que NO es suyo: no la ve ni por URL directa. */
    claseAjena: ClaseDelMundo;
    /** Los alumnos inscritos en el grupo A (el pase de lista). */
    alumnosDelPase: { alumnoId: string; inscripcionId: string; nombre: string }[];
  };
  /** J5: recepción. */
  recepcion: {
    /** Una familia con dos hijos inscritos: inscripción y mensualidad de cada uno ($3,000.00) y un cargo vencido hace 40 días ($800.00). */
    gomez: { tutorId: string; telefono: string; nombre: string; hijos: { alumnoId: string; nombre: string }[]; cargoVencidoId: string };
    /** Una familia que ya saldó la primera mensualidad: su uniforme (talla 8) está por entregar. */
    uniforme: { tutorId: string; alumnoId: string; nombre: string; beneficioId: string };
    productos: { uniforme8: { id: string; nombre: string; talla: string }; uniforme10: { id: string; nombre: string; talla: string }; playera: { id: string; nombre: string }; gorra: { id: string; nombre: string } };
    grupoD: { id: string; nombre: string };
  };
  /** J4: conversión e inscripción. */
  conversion: {
    /** Con clase muestra y registro del maestro (falta solo el apellido y el reglamento); recomendado: un grupo de un solo lugar. */
    epsilon: LeadDelMundo & { claseId: string };
    /** Sin clase muestra y sin registro: falta casi todo. */
    zeta: LeadDelMundo;
    /** Un grupo de cupo 1. */
    grupoC: { id: string; nombre: string };
    /** Un alumno ya inscribible, para llenar el grupo C desde la API. */
    rellenoAlumnoId: string;
  };
  /** J6: familia y expediente. */
  familia: {
    /** Una familia con dos hijos inscritos en el grupo D: se les cambia de grupo, se congela y se da de baja. */
    rivera: { tutorId: string; telefono: string; nombre: string; hijos: { alumnoId: string; nombre: string; inscripcionId: string }[] };
    /** Un grupo del mismo programa con UN solo lugar libre (para la carrera) y otro con lugares de sobra. */
    grupoDeUnLugar: { id: string; nombre: string };
    grupoDestino: { id: string; nombre: string };
    /** Un alumno ya inscribible que se usa para ocupar el último lugar del grupo de un lugar desde la API. */
    rellenoAlumnoId: string;
    motivoBaja: { id: string; nombre: string };
    /** Un alumno del grupo del maestro con ficha de salud; el texto es un CENTINELA para comprobar que no se filtra a la consola, la URL ni el almacenamiento. */
    salud: { alumnoId: string; nombre: string; centinela: string };
  };
  /** J3: el embudo del asesor (sucursal norte). */
  asesor: {
    /** Nuevo, con campaña de Facebook, conversación en Chatwoot y una tarea pendiente. */
    alfa: LeadDelMundo & { tareaId: string; chatwoot: { cuentaId: number; bandejaId: number; conversacionId: number } };
    /** Contactado y reciente: para perderlo con motivo. */
    beta: LeadDelMundo;
    /** Contactado y sin movimiento hace diez días: estancado. */
    gamma: LeadDelMundo & { tareaId: string };
    /** De la sucursal sur: el asesor del norte no lo ve. */
    delta: LeadDelMundo;
    motivos: { precio: string; horario: string };
    campanaNombre: string;
  };
}

export interface LeadDelMundo {
  leadId: string;
  prospectoId: string;
  nombre: string;
}

export interface ClaseDelMundo {
  id: string;
  leadId: string;
  prospectoId: string;
  prospecto: string;
  grupoId: string;
}

