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
}

