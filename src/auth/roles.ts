// Los roles del sistema. Son un enum de la base (`rol_usuario`); aquí el tipo que usa el código.

export const ROLES = ["administrador", "asesor", "maestro", "recepcion"] as const;
export type Rol = (typeof ROLES)[number];

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor);
}
