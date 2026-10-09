// Crea o actualiza la cuenta de base de datos de la APLICACIÓN (sin dueño, sin DELETE, sin UPDATE en las tablas de solo anexar). Se corre después de cada
// migración con la cuenta que migra: en AWS lo hace la tarea de migración (infra/ecs.tf); en local, a mano para probar el despliegue real.
//
//   DATABASE_URL=<cuenta dueña> CLAVE_ROL_APLICACION=<contraseña> node scripts/preparar-roles.ts
//   (ROL_APLICACION por omisión: inscripciones_app)

import { prepararRolDeAplicacion } from "./lib/roles-bd.ts";

const url = process.env["DATABASE_URL"];
const clave = process.env["CLAVE_ROL_APLICACION"];
if (!url || !clave) {
  console.error("Faltan DATABASE_URL (la cuenta que migra) y CLAVE_ROL_APLICACION (la contraseña de la cuenta de la aplicación).");
  process.exit(2);
}
const r = await prepararRolDeAplicacion({ urlMigrador: url, rolAplicacion: process.env["ROL_APLICACION"] ?? "inscripciones_app", claveAplicacion: clave });
console.log(JSON.stringify({ evento: "roles_preparados", rol: r.rol, tablas_solo_anexar: r.tablasSoloAnexar.length }));
