// Las DOS cuentas de la base de datos (EB-08, EF-15, K3/K6): la que MIGRA (dueña de las tablas) y la que USA la aplicación.
//
// Los disparadores que hacen «solo de anexar» a seis tablas protegen de UPDATE, DELETE y TRUNCATE, pero el dueño de una tabla puede quitarlos
// (`ALTER TABLE … DISABLE TRIGGER`). Si el backend corriera con la cuenta dueña, un error o una inyección bastaría para apagarlos. Con una cuenta que
// NO es dueña, que no puede borrar ni truncar ni alterar, la garantía es de la base y no del código.
//
// `prepararRolDeAplicacion` es idempotente y se vuelve a correr después de CADA migración (la tarea de migración de infra/ lo hace): una tabla nueva
// nace con los permisos por omisión y esta función le quita lo que no debe tener.

import pg from "pg";

/** Tablas de solo anexar: la aplicación puede leer e insertar, nunca actualizar. */
export const TABLAS_SOLO_ANEXAR = ["registro_cambio", "acceso_dato_sensible", "documento_legal", "aceptacion_legal", "lead_etapa_historial", "inscripcion_movimiento"] as const;

export interface OpcionesDeRoles {
  /** Conexión de la cuenta DUEÑA (la que migra). */
  urlMigrador: string;
  /** Nombre de la cuenta de la aplicación. */
  rolAplicacion: string;
  /** Contraseña de la cuenta de la aplicación. */
  claveAplicacion: string;
}

const NOMBRE_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/;

export async function prepararRolDeAplicacion(o: OpcionesDeRoles): Promise<{ rol: string; tablasSoloAnexar: string[] }> {
  if (!NOMBRE_VALIDO.test(o.rolAplicacion)) throw new Error(`Nombre de rol inválido: «${o.rolAplicacion}»`);
  if (o.claveAplicacion.length < 16) throw new Error("La contraseña de la cuenta de la aplicación debe tener al menos 16 caracteres");
  const cliente = new pg.Client({ connectionString: o.urlMigrador });
  await cliente.connect();
  try {
    const { rows: yo } = await cliente.query<{ usuario: string; base: string }>("SELECT current_user AS usuario, current_database() AS base");
    const migrador = yo[0]!.usuario;
    const base = yo[0]!.base;
    if (migrador === o.rolAplicacion) throw new Error("La cuenta que migra y la de la aplicación deben ser distintas");
    const q = async (sql: string, params: unknown[] = []): Promise<void> => {
      await cliente.query(sql, params);
    };
    const ident = async (nombre: string): Promise<string> => (await cliente.query<{ i: string }>("SELECT quote_ident($1) AS i", [nombre])).rows[0]!.i;
    const app = await ident(o.rolAplicacion);
    const dueno = await ident(migrador);
    const bd = await ident(base);

    const existe = (await cliente.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [o.rolAplicacion])).rowCount;
    if (!existe) await q(`CREATE ROLE ${app} LOGIN`);
    const { rows } = await cliente.query<{ sql: string }>("SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', $1::text, $2::text) AS sql", [o.rolAplicacion, o.claveAplicacion]);
    await q(rows[0]!.sql);

    await q(`GRANT CONNECT ON DATABASE ${bd} TO ${app}`);
    await q(`GRANT USAGE ON SCHEMA public TO ${app}`);
    // Sin CREATE en el esquema (no puede crear tablas ni funciones) y sin DELETE en ninguna tabla: el borrado es lógico (invariante 3).
    await q(`REVOKE CREATE ON SCHEMA public FROM ${app}`);
    await q(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${app}`);
    await q(`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ${app}`);
    await q(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
    const presentes = (await cliente.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)", [[...TABLAS_SOLO_ANEXAR]])).rows.map((r) => r.tablename);
    for (const t of presentes) await q(`REVOKE UPDATE ON ${await ident(t)} FROM ${app}`);
    // V10 (EK-29): el historial de migraciones es del que migra. La aplicación solo lo LEE (`/salud/lista` comprueba que no haya migraciones pendientes); con UPDATE podía borrar el rastro
    // de lo aplicado o marcar como aplicada una migración que no corrió.
    if ((await cliente.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations'")).rowCount) await q(`REVOKE INSERT, UPDATE ON "_prisma_migrations" FROM ${app}`);
    // Lo que las migraciones futuras creen nace con lo mismo (esta función se vuelve a correr y quita el UPDATE de las tablas de solo anexar).
    await q(`ALTER DEFAULT PRIVILEGES FOR ROLE ${dueno} IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO ${app}`);
    await q(`ALTER DEFAULT PRIVILEGES FOR ROLE ${dueno} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${app}`);
    return { rol: o.rolAplicacion, tablasSoloAnexar: presentes };
  } finally {
    await cliente.end();
  }
}
