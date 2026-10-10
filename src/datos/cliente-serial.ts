// Conexiones de `pg` que NO aceptan dos consultas a la vez: las ponen en fila (V10 / EK-27).
//
// Dentro de una transacción de Prisma hay UNA sola conexión. Prisma resuelve un `select` con relaciones anidadas (la plantilla, la vertical y la sucursal de una
// automatización, por ejemplo) con varias consultas hermanas lanzadas a la vez; sobre una transacción, `pg` las encola y avisa «Calling client.query() when the client is already
// executing a query is deprecated and will be removed in pg@9.0». Hoy funciona porque `pg` 8 las encola; en `pg` 9 dejará de hacerlo. Con esto cada consulta espera a que
// termine la anterior de SU conexión: el resultado es el mismo, sin el aviso y sin depender de esa conducta.
//
// Solo se serializa la forma con promesa (la que usa el adaptador de Prisma). La forma con `callback` o con un objeto que se envía solo (`Submittable`, p. ej. COPY) es la de
// `pg.Pool.query` y de los flujos: ahí la conexión es de quien la pidió y no se toca.

import pg from "pg";

type Consultar = (...args: unknown[]) => unknown;

/** Hace que esta conexión atienda una consulta con promesa a la vez, en el orden en que llegan. Idempotente. */
export function serializarConsultas(conexion: pg.ClientBase): void {
  const marcada = conexion as unknown as { __serial?: true; query: Consultar };
  if (marcada.__serial) return;
  marcada.__serial = true;
  const original = marcada.query.bind(conexion);
  let cola: Promise<unknown> = Promise.resolve();
  marcada.query = (...args: unknown[]): unknown => {
    const primero = args[0];
    const conCallback = typeof args[args.length - 1] === "function";
    const seEnvia = typeof primero === "object" && primero !== null && typeof (primero as { submit?: unknown }).submit === "function";
    if (conCallback || seEnvia) return original(...args);
    const turno = cola.then(() => original(...args));
    cola = turno.then(
      () => undefined,
      () => undefined,
    );
    return turno;
  };
}

/** Un pool de `pg` cuyas conexiones son seriales (ver arriba). */
export function crearPoolSerial(config: pg.PoolConfig): pg.Pool {
  const pool = new pg.Pool(config);
  pool.on("connect", (conexion) => serializarConsultas(conexion));
  return pool;
}
