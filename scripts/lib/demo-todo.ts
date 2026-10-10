// `npm run demo:todo` (V12): reconstruye la demo local desde cero con UN comando y la deja lista en http://localhost:3000 con datos y los cuatro usuarios.
//
// Este archivo es la LÓGICA (probada en `demo-todo.test.ts` sin tocar Docker): leer las opciones, las guardas, el plan paso a paso, la batería de comprobaciones y el resumen.
// Todo lo que toca el mundo (Docker, procesos, la red) entra por dos piezas inyectables —el `Ejecutor` y la `Red`—, así que las pruebas usan un Docker falso.
// La capa que de verdad ejecuta es `scripts/demo-todo.ts`.
//
// QUÉ BORRA. Es un comando destructivo POR DISEÑO (reconstruir = borrar la base de la demo y volver a crearla), así que:
//   (a) exige confirmación explícita (`--si` o DEMO_CONFIRMAR=si); sin ella imprime EXACTAMENTE qué borraría y se detiene con código 2;
//   (b) solo toca el proyecto de compose que se le nombra (`--proyecto`, por omisión `inscripciones`);
//   (c) nunca toca las bases de pruebas (`*_pruebas`, `*_test`: son bases dentro del Postgres de la demo, no volúmenes) ni la base de Chatwoot, salvo `--con-chatwoot`;
//   (d) se niega a correr con NODE_ENV=production o si la URL de la base no es local.

import { FAMILIA_CON_COBRO } from "../../src/demo/constantes.ts";
import { CLAVE_DE_DEMO_PUBLICADA, esProduccion } from "../../src/seguridad/entorno.ts";

// ── Constantes de la demo ───────────────────────────────────────────────────────────────────────────────────

export const PROYECTO_PRINCIPAL = "inscripciones";
export const PUERTOS_PRINCIPAL = { backend: 3000, chatwoot: 3001, postgres: 5432 } as const;
/** La contraseña de los cuatro usuarios de la demo. SOLO demo local: es pública (está en el repositorio) y la política de contraseñas y la guarda de producción la rechazan. */
export const CONTRASENA_DE_DEMO = "Demo-local-2026!";
export const ORGANIZACION_DE_DEMO = "escuela-demo";
export const USUARIOS_DE_DEMO = [
  { rol: "administrador", correo: "admin@demo.test", nombre: "Administrador demo", inicio: "/embudo", queVer: "Administración (módulos, catálogo, plantillas) y los tableros." },
  { rol: "asesor", correo: "asesor@demo.test", nombre: "Asesor demo", inicio: "/embudo", queVer: "El embudo con leads nuevos, la ficha de un lead y la clase muestra ya asistida lista para convertir." },
  { rol: "maestro", correo: "maestro@demo.test", nombre: "Maestro demo", inicio: "/hoy", queVer: "«Hoy»: las clases muestra del día; después el pase de lista." },
  { rol: "recepcion", correo: "recepcion@demo.test", nombre: "Recepción demo", inicio: "/pagos", queVer: "Registrar un pago a la familia con cargos por cobrar; estado de cuenta, uniformes y cierre del día." },
] as const;
export const MODULOS = ["captacion", "cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas", "tableros"] as const;
/** Lo que se espera de una máquina para reconstruir la demo (con las imágenes ya descargadas y con caché de construcción). */
export const TIEMPO_OBJETIVO = "unos 3 minutos con Docker ya caliente; hasta 25 la primera vez (descarga y construye las imágenes)";
const NODE_MINIMO = [22, 18] as const;

export type Accion = "reconstruir" | "apagar" | "borrar";

export interface OpcionesDemo {
  accion: Accion;
  proyecto: string;
  puertoBackend: number;
  puertoChatwoot: number;
  puertoPostgres: number;
  conChatwoot: boolean;
  confirmado: boolean;
  simulacro: boolean;
  alumnos: number;
  meses: number;
  semilla: number;
  /** AAAA-MM-DD, fin de la historia. Si no se da, el comando usa «hoy» en la Ciudad de México (misma semilla y mismo día, misma historia). */
  hasta: string | null;
}

export class ErrorDeUso extends Error {}

const entero = (v: string | undefined, nombre: string, min: number, max: number, por: number): number => {
  if (v === undefined || v === "") return por;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErrorDeUso(`${nombre} debe ser un entero entre ${min} y ${max} (recibí «${v}»).`);
  return n;
};

/** Lee las opciones de la línea de comandos y del entorno (DEMO_CONFIRMAR, DEMO_PUERTO…). No toca nada. */
export function resolverOpciones(v: Record<string, string | boolean | undefined>, env: Record<string, string | undefined>): OpcionesDemo {
  const texto = (k: string): string | undefined => (typeof v[k] === "string" ? (v[k] as string) : undefined);
  const proyecto = texto("proyecto") ?? env["DEMO_PROYECTO"] ?? PROYECTO_PRINCIPAL;
  const esPrincipal = proyecto === PROYECTO_PRINCIPAL;
  const acciones = (["apagar", "borrar"] as const).filter((a) => v[a] === true);
  if (acciones.length > 1) throw new ErrorDeUso("Elige una sola acción: --apagar o --borrar (sin ninguna se reconstruye).");
  const crudoPuerto = texto("puerto") ?? env["DEMO_PUERTO"];
  // Otro proyecto NUNCA hereda los puertos de la demo principal: chocaría con ella. Hay que darle uno (los otros dos salen de él).
  if (!esPrincipal && !crudoPuerto) throw new ErrorDeUso(`El proyecto «${proyecto}» necesita su propio puerto (--puerto o DEMO_PUERTO) para no chocar con la demo principal («${PROYECTO_PRINCIPAL}», puerto ${PUERTOS_PRINCIPAL.backend}).`);
  const puertoBackend = entero(crudoPuerto, "El puerto", 1024, 65_533, PUERTOS_PRINCIPAL.backend);
  const porOmisionChatwoot = esPrincipal && !crudoPuerto ? PUERTOS_PRINCIPAL.chatwoot : puertoBackend + 1;
  const porOmisionPostgres = esPrincipal && !crudoPuerto ? PUERTOS_PRINCIPAL.postgres : puertoBackend + 2;
  return {
    accion: acciones[0] ?? "reconstruir",
    proyecto,
    puertoBackend,
    puertoChatwoot: entero(texto("puerto-chatwoot") ?? env["DEMO_PUERTO_CHATWOOT"], "El puerto de Chatwoot", 1024, 65_535, porOmisionChatwoot),
    puertoPostgres: entero(texto("puerto-postgres") ?? env["DEMO_PUERTO_POSTGRES"], "El puerto de Postgres", 1024, 65_535, porOmisionPostgres),
    conChatwoot: v["con-chatwoot"] === true,
    confirmado: v["si"] === true || (env["DEMO_CONFIRMAR"] ?? "").trim().toLowerCase() === "si",
    simulacro: v["simulacro"] === true,
    alumnos: entero(texto("alumnos"), "--alumnos", 1, 5000, 300),
    meses: entero(texto("meses"), "--meses", 1, 24, 6),
    semilla: entero(texto("semilla"), "--semilla", 1, 2_147_483_647, 20_261_008),
    hasta: ((): string | null => {
      const h = texto("hasta");
      if (h === undefined) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(h) || Number.isNaN(new Date(`${h}T00:00:00Z`).getTime())) throw new ErrorDeUso("--hasta debe ser AAAA-MM-DD.");
      return h;
    })(),
  };
}

// ── Lo que se deriva de las opciones ──────────────────────────────────────────────────────────────────────

export const urlBaseDeLaDemo = (o: Pick<OpcionesDemo, "puertoPostgres">): string => `postgresql://inscripciones:inscripciones@localhost:${o.puertoPostgres}/inscripciones`;
export const urlDeLaInterfaz = (o: Pick<OpcionesDemo, "puertoBackend">): string => `http://localhost:${o.puertoBackend}`;
export const urlDeChatwoot = (o: Pick<OpcionesDemo, "puertoChatwoot">): string => `http://localhost:${o.puertoChatwoot}`;
/** Las variables con que se le habla a docker compose (el compose las lee con valores por omisión que son los de la demo principal). */
export function entornoDeCompose(o: OpcionesDemo): Record<string, string> {
  return {
    DEMO_PUERTO: String(o.puertoBackend),
    DEMO_PUERTO_CHATWOOT: String(o.puertoChatwoot),
    DEMO_PUERTO_POSTGRES: String(o.puertoPostgres),
    // Otro proyecto construye su propia imagen: no retoca la etiqueta de la demo principal.
    DEMO_IMAGEN: o.proyecto === PROYECTO_PRINCIPAL ? "inscripciones-backend:local" : `inscripciones-backend:${o.proyecto}`,
  };
}
/** Servicios de compose que guardan o dependen de los datos de la APLICACIÓN (no de Chatwoot). */
export const SERVICIOS_DE_LA_APLICACION = ["backend", "demo-preparar", "postgres"] as const;
export const VOLUMENES_DE_LA_APLICACION = ["postgres-data"] as const;
export const VOLUMENES_DE_CHATWOOT = ["chatwoot-postgres-data", "chatwoot-redis-data"] as const;

// ── Guardas ────────────────────────────────────────────────────────────────────────────────────────────────

export interface Hallazgo {
  codigo: "produccion" | "proyecto_invalido" | "base_no_local" | "base_protegida" | "puertos_repetidos" | "organizacion_no_demo" | "falta_confirmacion";
  mensaje: string;
}

const ANFITRIONES_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function esUrlLocal(url: string): boolean {
  try {
    return ANFITRIONES_LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
export const esBaseProtegida = (nombre: string): boolean => /(?:_pruebas|_test)$/.test(nombre);

/** V13-fix (EV-09): producción se lee como en el arranque del servidor (`esProduccion`: sin distinguir mayúsculas y con los valores desconocidos como producción). */
function hallazgoDeProduccion(env: Record<string, string | undefined>, que: string): Hallazgo[] {
  return esProduccion(env) ? [{ codigo: "produccion", mensaje: `NODE_ENV=${env["NODE_ENV"]}: ${que}. Solo corre en la máquina de quien prueba, nunca en producción.` }] : [];
}
/** Una base que no es local (la del comando o la que el entorno trae a la vista). */
function hallazgoDeBaseNoLocal(url: string | undefined, mensaje: string): Hallazgo[] {
  return url && !esUrlLocal(url) ? [{ codigo: "base_no_local", mensaje }] : [];
}

/** Las razones por las que el comando se NIEGA a correr (vacío = puede). No toca nada. */
export function revisarGuardas(o: OpcionesDemo, env: Record<string, string | undefined>): Hallazgo[] {
  const h: Hallazgo[] = [...hallazgoDeProduccion(env, "este comando borra y recrea una base entera, y trae contraseñas públicas de demostración")];
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(o.proyecto)) h.push({ codigo: "proyecto_invalido", mensaje: `El nombre de proyecto «${o.proyecto}» no sirve: minúsculas, números, guion y guion bajo (2 a 40 caracteres).` });
  const url = urlBaseDeLaDemo(o);
  h.push(...hallazgoDeBaseNoLocal(url, `La base de la demo (${url}) no es local.`));
  // Si el entorno ya trae una base remota (un .env de otro ambiente), no se corre aunque el comando use la suya: un descuido así ya costó datos.
  h.push(...hallazgoDeBaseNoLocal(env["DATABASE_URL"], "DATABASE_URL del entorno apunta a un servidor que no es local: este comando se niega a correr con ella a la vista."));
  const nombreDeBase = decodeURIComponent(new URL(url).pathname.slice(1));
  if (esBaseProtegida(nombreDeBase)) h.push({ codigo: "base_protegida", mensaje: `La base «${nombreDeBase}» es de pruebas: nunca se toca.` });
  if (new Set([o.puertoBackend, o.puertoChatwoot, o.puertoPostgres]).size !== 3) h.push({ codigo: "puertos_repetidos", mensaje: "Los tres puertos (interfaz, Chatwoot y Postgres) deben ser distintos." });
  return h;
}

/**
 * V13-fix (EV-09, EV-37): las guardas de los guiones que ESCRIBEN datos de demostración o cargan un catálogo en la base de `DATABASE_URL` (`demo:vivo`, `demo:datos`,
 * `catalogo:importar --aplicar`). Antes solo las frenaba una bandera: con `NODE_ENV=production` y una base remota la bandera bastaba y llegaban a escribir (y `demo:vivo` da de baja
 * alumnos). Comparten con `revisarGuardas` las mismas piezas: no producción y base local. Además:
 *   · una base que NO es de pruebas solo se toca si la organización es la de la demo (`escuela-demo`): con una sola organización el guion la tomaba sin mirar cuál era;
 *   · `exigirConfirmacion` (el guion que carga catálogo): hace falta `--confirmar-base <nombre de la base>` y debe coincidir con la base a la que va a escribir.
 */
export function revisarGuardasDeScript(
  env: Record<string, string | undefined>,
  o: { organizacion?: { slug: string; nombre: string } | null; confirmarBase?: string | undefined; exigirConfirmacion?: boolean; que: string },
): Hallazgo[] {
  const url = env["DATABASE_URL"];
  const h: Hallazgo[] = [...hallazgoDeProduccion(env, o.que)];
  h.push(...hallazgoDeBaseNoLocal(url, `DATABASE_URL apunta a un servidor que no es local: ${o.que}. Solo corre contra la base de la máquina de quien prueba.`));
  const base = url ? decodeURIComponent((() => { try { return new URL(url).pathname.slice(1); } catch { return ""; } })()) : "";
  if (o.organizacion && !esBaseProtegida(base) && o.organizacion.slug !== ORGANIZACION_DE_DEMO) {
    h.push({ codigo: "organizacion_no_demo", mensaje: `La organización «${o.organizacion.nombre}» no es la de la demo («${ORGANIZACION_DE_DEMO}»): ${o.que}. Elige la de la demo con --organizacion, o usa una base de pruebas.` });
  }
  if (o.exigirConfirmacion && o.confirmarBase !== base) {
    h.push({ codigo: "falta_confirmacion", mensaje: `Para escribir en la base «${base}» confirma con --confirmar-base ${base}${o.confirmarBase ? ` (recibí «${o.confirmarBase}»)` : ""}.` });
  }
  return h;
}

/** Qué borraría el comando, en palabras. Es lo que se imprime sin confirmación. */
export function describirBorrado(o: OpcionesDemo): string[] {
  const p = o.proyecto;
  const l: string[] = [];
  if (o.accion === "apagar") {
    l.push(`Esto APAGA los contenedores del proyecto «${p}» (no borra nada: los datos quedan en sus volúmenes).`);
    return l;
  }
  l.push(`Esto va a ${o.accion === "borrar" ? "BORRAR" : "BORRAR y volver a crear"} la demo del proyecto «${p}»:`);
  l.push(`  • contenedores de la aplicación: ${SERVICIOS_DE_LA_APLICACION.join(", ")}`);
  l.push(`  • volumen con TODOS los datos de la escuela de demo: ${VOLUMENES_DE_LA_APLICACION.map((v) => `${p}_${v}`).join(", ")} (la base «inscripciones» de su Postgres)`);
  if (o.conChatwoot) {
    l.push(`  • (por --con-chatwoot) todo Chatwoot: sus contenedores y los volúmenes ${VOLUMENES_DE_CHATWOOT.map((v) => `${p}_${v}`).join(", ")} (conversaciones y bandejas de ese Chatwoot)`);
  } else {
    l.push("  • Chatwoot (contenedores y volúmenes) NO se toca: sus conversaciones y bandejas se conservan.");
  }
  l.push("No toca: ningún otro proyecto de compose, las bases de pruebas (*_pruebas, *_test) ni nada fuera de ese proyecto.");
  return l;
}

export function textoDeConfirmacion(o: OpcionesDemo): string {
  const comando = `npm run demo:todo -- ${[o.accion === "reconstruir" ? "" : `--${o.accion}`, o.proyecto === PROYECTO_PRINCIPAL ? "" : `--proyecto ${o.proyecto} --puerto ${o.puertoBackend}`, o.conChatwoot ? "--con-chatwoot" : "", "--si"].filter(Boolean).join(" ")}`;
  return [...describirBorrado(o), "", "No se ejecutó nada. Para continuar, confirma:", `  ${comando}`, "  (o define DEMO_CONFIRMAR=si)"].join("\n");
}

// ── Piezas inyectables ─────────────────────────────────────────────────────────────────────────────────────

export interface ResultadoDeComando {
  codigo: number;
  salida: string;
}
export interface OpcionesDeComando {
  env?: Record<string, string>;
  timeoutMs?: number;
  /** true: la salida se muestra en vivo (construir la imagen tarda minutos y conviene verlo). */
  enVivo?: boolean;
}
export interface Ejecutor {
  correr(cmd: string, args: string[], op?: OpcionesDeComando): Promise<ResultadoDeComando>;
}
export interface RespuestaHttp {
  estado: number;
  texto: string;
  cookie: string | null;
}
export interface Red {
  http(metodo: string, url: string, cuerpo?: unknown, cookie?: string | null): Promise<RespuestaHttp>;
  /** ¿Algo escucha ya en ese puerto del equipo? */
  puertoOcupado(puerto: number): Promise<boolean>;
  esperar(ms: number): Promise<void>;
}
export interface Entorno {
  ejecutor: Ejecutor;
  red: Red;
  /** Versión de Node (process.versions.node). */
  versionDeNode: string;
  ahora: () => number;
  /** Líneas de avance para la persona. */
  decir: (linea: string) => void;
}

// ── El plan ────────────────────────────────────────────────────────────────────────────────────────────────

export type Paso = { id: string; titulo: string; destructivo?: boolean } & (
  | { tipo: "comando"; cmd: string; args: string[]; env?: Record<string, string>; tolerarFallo?: boolean; timeoutMs?: number; enVivo?: boolean }
  | { tipo: "interno"; accion: "prerrequisitos" | "puertos" | "volumenes" | "comprobar" }
);

const compose = (o: OpcionesDemo, ...args: string[]): { cmd: string; args: string[]; env: Record<string, string> } => ({ cmd: "docker", args: ["compose", "-p", o.proyecto, ...args], env: entornoDeCompose(o) });

/** El entorno con que corren los guiones del equipo contra la base de la demo: siempre la URL de ESTE proyecto, nunca la de un .env. */
export function entornoDeGuiones(o: OpcionesDemo): Record<string, string> {
  return { DATABASE_URL: urlBaseDeLaDemo(o), NODE_ENV: "development", CLAVE_DATOS_SENSIBLES: CLAVE_DE_DEMO_PUBLICADA, CHATWOOT_URL: urlDeChatwoot(o), CHATWOOT_URL_HOST: urlDeChatwoot(o) };
}

export function construirPlan(o: OpcionesDemo): Paso[] {
  if (o.accion === "apagar") return [{ id: "apagar", titulo: `Apagar la demo «${o.proyecto}»`, tipo: "comando", ...compose(o, "stop"), timeoutMs: 180_000 }];
  const baja: Paso[] = o.conChatwoot || o.accion === "borrar"
    ? [{ id: "bajar-todo", titulo: `Borrar todo el proyecto «${o.proyecto}» (contenedores y volúmenes, también Chatwoot)`, destructivo: true, tipo: "comando", ...compose(o, "down", "--volumes", "--remove-orphans"), timeoutMs: 300_000 }]
    : [
        { id: "bajar-aplicacion", titulo: `Quitar los contenedores de la aplicación de «${o.proyecto}»`, destructivo: true, tipo: "comando", ...compose(o, "rm", "--stop", "--force", ...SERVICIOS_DE_LA_APLICACION), timeoutMs: 300_000 },
        { id: "borrar-volumen", titulo: `Borrar el volumen de datos de la aplicación (${o.proyecto}_postgres-data)`, destructivo: true, tipo: "interno", accion: "volumenes" },
      ];
  if (o.accion === "borrar") return [{ id: "prerrequisitos", titulo: "Revisar Docker", tipo: "interno", accion: "prerrequisitos" }, ...baja];
  const guion = (archivo: string, ...args: string[]): { cmd: string; args: string[]; env: Record<string, string> } => ({ cmd: process.execPath, args: [archivo, ...args], env: entornoDeGuiones(o) });
  return [
    { id: "prerrequisitos", titulo: "Revisar Docker y Node", tipo: "interno", accion: "prerrequisitos" },
    { id: "puertos", titulo: "Revisar que los puertos estén libres", tipo: "interno", accion: "puertos" },
    ...baja,
    { id: "levantar", titulo: "Construir y levantar la demo (migraciones y catálogo incluidos) y esperar a que esté sana", tipo: "comando", ...compose(o, "up", "--detach", "--build", "--wait", "--wait-timeout", "1200"), timeoutMs: 1_800_000, enVivo: true },
    { id: "chatwoot", titulo: "Dejar Chatwoot listo: bandejas conectadas al bot", tipo: "comando", cmd: process.execPath, args: ["--env-file=config/demo-local.env", "scripts/preparar-chatwoot.ts"], env: entornoDeGuiones(o), timeoutMs: 300_000 },
    // El backend de la demo corre su propio barrido (mensualidades, vencidos, recordatorios) con el reloj REAL; si estuviera encendido mientras se carga la historia (que corre con un reloj
    // simulado), su barrido se mezclaría con la carga y dos corridas darían historias distintas. Se detiene durante la carga y se vuelve a levantar al final.
    { id: "detener-backend", titulo: "Detener el backend mientras se carga la historia (para que su barrido no se mezcle con ella)", tipo: "comando", ...compose(o, "stop", "backend"), timeoutMs: 120_000 },
    { id: "datos", titulo: `Generar la historia de la escuela (${o.alumnos} alumnos, ${o.meses} meses, semilla ${o.semilla})`, tipo: "comando", ...guion("scripts/demo-datos.ts", "--confirmar-base-de-demo", "--alumnos", String(o.alumnos), "--meses", String(o.meses), "--semilla", String(o.semilla), ...(o.hasta ? ["--hasta", o.hasta] : [])), timeoutMs: 1_800_000, enVivo: true },
    { id: "vivos", titulo: "Dejar a la vista el primer día de cada rol (leads, clases de hoy, cobros)", tipo: "comando", ...guion("scripts/demo-vivo.ts", "--confirmar-base-de-demo"), timeoutMs: 600_000, enVivo: true },
    { id: "encender-backend", titulo: "Encender el backend con la historia ya cargada y esperar a que esté sano", tipo: "comando", ...compose(o, "up", "--detach", "--wait", "--wait-timeout", "300", "backend"), timeoutMs: 400_000 },
    { id: "comprobar", titulo: "Comprobar que todo responde", tipo: "interno", accion: "comprobar" },
  ];
}

// ── La batería de comprobaciones ────────────────────────────────────────────────────────────────────────

export interface Comprobacion {
  nombre: string;
  ok: boolean;
  detalle: string;
}

const json = (r: RespuestaHttp): unknown => {
  try {
    return JSON.parse(r.texto);
  } catch {
    return null;
  }
};

/** Las comprobaciones por HTTP. Una falla no corta las demás: se informan todas. */
export async function comprobacionesHttp(o: OpcionesDemo, red: Red, ahoraLocalISO: () => string): Promise<Comprobacion[]> {
  const base = urlDeLaInterfaz(o);
  const salida: Comprobacion[] = [];
  const anotar = (nombre: string, ok: boolean, detalle: string): void => void salida.push({ nombre, ok, detalle });
  const intentar = async (nombre: string, f: () => Promise<[boolean, string]>): Promise<void> => {
    try {
      const [ok, detalle] = await f();
      anotar(nombre, ok, detalle);
    } catch (e) {
      anotar(nombre, false, `no respondió (${(e as Error).message})`);
    }
  };

  await intentar("La aplicación está lista (salud)", async () => {
    const r = await red.http("GET", `${base}/salud/lista`);
    return [r.estado === 200, `GET /salud/lista → ${r.estado}`];
  });
  await intentar(`${base} sirve la interfaz`, async () => {
    const r = await red.http("GET", `${base}/`);
    return [r.estado === 200 && /id="raiz"/.test(r.texto), `GET / → ${r.estado}${/id="raiz"/.test(r.texto) ? ", con la interfaz" : ", sin la interfaz"}`];
  });

  const sesiones = new Map<string, string>();
  for (const u of USUARIOS_DE_DEMO) {
    await intentar(`Entra ${u.rol} (${u.correo})`, async () => {
      const r = await red.http("POST", `${base}/api/sesion`, { organizacion: ORGANIZACION_DE_DEMO, correo: u.correo, contrasena: CONTRASENA_DE_DEMO });
      if (r.estado !== 201 || !r.cookie) return [false, `POST /api/sesion → ${r.estado}`];
      sesiones.set(u.rol, r.cookie);
      const yo = (await red.http("GET", `${base}/api/yo`, undefined, r.cookie)).texto;
      const datos = (JSON.parse(yo) as { usuario?: { rol?: string }; modulos?: Record<string, boolean> }) ?? {};
      const apagados = MODULOS.filter((m) => datos.modulos?.[m] !== true);
      if (datos.usuario?.rol !== u.rol) return [false, `entró como «${datos.usuario?.rol ?? "?"}», no como ${u.rol}`];
      return [apagados.length === 0, apagados.length === 0 ? `rol ${u.rol} y los ${MODULOS.length} módulos encendidos` : `módulos apagados: ${apagados.join(", ")}`];
    });
  }

  const con = async (rol: string, nombre: string, ruta: string, juzgar: (cuerpo: unknown) => [boolean, string]): Promise<void> => {
    const cookie = sesiones.get(rol);
    if (!cookie) return void anotar(nombre, false, `sin sesión de ${rol}`);
    await intentar(nombre, async () => {
      const r = await red.http("GET", `${base}${ruta}`, undefined, cookie);
      if (r.estado !== 200) return [false, `GET ${ruta.split("?")[0]} → ${r.estado}`];
      return juzgar(json(r));
    });
  };
  const cuantos = (c: unknown): number => {
    const x = c as { datos?: unknown[]; paginacion?: { total?: number } } | null;
    return typeof x?.paginacion?.total === "number" ? x.paginacion.total : (x?.datos?.length ?? 0);
  };
  await con("asesor", "El asesor ve leads en su embudo", "/api/leads?limite=5", (c) => [cuantos(c) > 0, `${cuantos(c)} leads`]);
  await con("maestro", "El maestro ve clases muestra en «Hoy»", "/api/maestro/clases-muestra?limite=100", (c) => {
    const datos = ((c as { datos?: { fecha_hora?: string; estatus?: string }[] } | null)?.datos ?? []).filter((x) => x.estatus === "agendada" || x.estatus === undefined);
    const hoy = ahoraLocalISO();
    const deHoy = datos.filter((x) => (x.fecha_hora ?? "").length > 0 && new Date(x.fecha_hora!).toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }) === hoy).length;
    return [datos.length > 0, `${datos.length} clases agendadas (${deHoy} de hoy)`];
  });
  await con("recepcion", "Recepción ve cargos por cobrar", "/api/cargos?limite=1&con_saldo=true", (c) => [cuantos(c) > 0, `${cuantos(c)} cargos con saldo`]);
  await con("administrador", "El administrador ve los siete módulos", "/api/modulos", (c) => {
    const lista = (c as { modulos?: { encendido?: boolean }[] } | null)?.modulos ?? [];
    return [lista.length === MODULOS.length && lista.every((m) => m.encendido === true), `${lista.filter((m) => m.encendido).length} de ${lista.length} encendidos`];
  });
  return salida;
}

// ── El resumen ────────────────────────────────────────────────────────────────────────────────────────────

export function duracionLegible(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

export function resumenFinal(o: OpcionesDemo, comprobaciones: Comprobacion[], ms: number): string {
  const bien = comprobaciones.every((c) => c.ok);
  const l: string[] = [];
  l.push("════════════════════════════════════════════════════════════════════════════");
  l.push(bien ? ` La demo está lista (${duracionLegible(ms)})` : ` La demo quedó levantada, pero ${comprobaciones.filter((c) => !c.ok).length} comprobación(es) fallaron (${duracionLegible(ms)})`);
  l.push("════════════════════════════════════════════════════════════════════════════");
  l.push(` Interfaz:  ${urlDeLaInterfaz(o)}      Chatwoot (bandeja de asesores): ${urlDeChatwoot(o)}`);
  l.push(` Escuela:   ${ORGANIZACION_DE_DEMO} (el campo «Escuela» puede quedar vacío)`);
  l.push(` Contraseña de los cuatro usuarios: ${CONTRASENA_DE_DEMO}   (solo demo local; en un ambiente real se rechaza)`);
  l.push("");
  l.push(" Usuario                    Rol             Qué ver primero");
  for (const u of USUARIOS_DE_DEMO) l.push(` ${u.correo.padEnd(26)} ${u.rol.padEnd(15)} ${u.queVer}`);
  l.push(`\n Recepción: busca a ${FAMILIA_CON_COBRO.tutor} ${FAMILIA_CON_COBRO.apellidos} (teléfono ${FAMILIA_CON_COBRO.telefonoNacional}): tiene la primera mensualidad y un uniforme por cobrar (un solo pago se reparte entre los cargos).`);
  l.push("");
  l.push(" Comprobaciones:");
  for (const c of comprobaciones) l.push(`  ${c.ok ? "✓" : "✗"} ${c.nombre} — ${c.detalle}`);
  l.push("");
  l.push(` Repetirlo:  npm run demo:todo -- ${o.proyecto === PROYECTO_PRINCIPAL ? "--si" : `--proyecto ${o.proyecto} --puerto ${o.puertoBackend} --si`}   (misma semilla, misma historia; ${TIEMPO_OBJETIVO})`);
  l.push(` Apagarla:   npm run demo:todo -- --apagar${o.proyecto === PROYECTO_PRINCIPAL ? "" : ` --proyecto ${o.proyecto} --puerto ${o.puertoBackend}`}   (conserva los datos; para volver a encender: docker compose -p ${o.proyecto} up -d)`);
  l.push(" Recorrido narrado, sin tocar esta demo:  npm run demo:guiada");
  return l.join("\n");
}

// ── La ejecución ───────────────────────────────────────────────────────────────────────────────────────────

const versionOk = (v: string): boolean => {
  const [a = 0, b = 0] = v.split(".").map(Number);
  return a > NODE_MINIMO[0] || (a === NODE_MINIMO[0] && b >= NODE_MINIMO[1]);
};

/** De la salida de `cuadratura.ts` (una línea JSON por organización) a una frase para la persona. */
export function detalleDeCuadratura(salida: string): string {
  for (const l of salida.split("\n")) {
    try {
      const j = JSON.parse(l) as { evento?: string; cargos?: number; pagos?: number };
      if (j.evento === "cuadratura_ok") return `cuadra: ${j.cargos ?? 0} cargos y ${j.pagos ?? 0} pagos`;
    } catch {
      // no es una línea de la bitácora
    }
  }
  return "sin discrepancias";
}

/** De la salida de `demo-datos.ts` (ya con datos: solo verifica) a una frase. */
export function detalleDeCatalogo(salida: string): string {
  return salida.split("\n").find((x) => /traslapes de edad/.test(x))?.trim().replace(/^catálogo: /, "") ?? "sin traslapes ni choques";
}

export interface ResultadoDeEjecucion {
  ok: boolean;
  comprobaciones: Comprobacion[];
  /** Desde dónde falló, si falló. */
  falloEn?: { paso: string; detalle: string };
  ms: number;
}

/** Qué puertos de los tres ocupa otro (ni libre ni de ESTE proyecto). Función pura sobre lo que dijo Docker. */
export function puertosAjenos(o: OpcionesDemo, ocupados: ReadonlySet<number>, publicadosPorElProyecto: ReadonlySet<number>): number[] {
  return [o.puertoBackend, o.puertoChatwoot, o.puertoPostgres].filter((p) => ocupados.has(p) && !publicadosPorElProyecto.has(p));
}

export async function ejecutarPlan(o: OpcionesDemo, plan: Paso[], e: Entorno, hoyISO: () => string): Promise<ResultadoDeEjecucion> {
  const inicio = e.ahora();
  let comprobaciones: Comprobacion[] = [];
  const n = plan.length;
  for (let i = 0; i < n; i++) {
    const p = plan[i]!;
    e.decir(`\n[${i + 1}/${n}] ${p.titulo}`);
    const fallo = (detalle: string): ResultadoDeEjecucion => ({ ok: false, comprobaciones, falloEn: { paso: p.id, detalle }, ms: e.ahora() - inicio });
    if (p.tipo === "comando") {
      const r = await e.ejecutor.correr(p.cmd, p.args, { env: p.env ?? {}, ...(p.timeoutMs ? { timeoutMs: p.timeoutMs } : {}), ...(p.enVivo ? { enVivo: true } : {}) });
      if (r.codigo !== 0 && !p.tolerarFallo) return fallo(`${p.cmd} ${p.args.slice(0, 4).join(" ")}… terminó con código ${r.codigo}\n${r.salida.split("\n").slice(-15).join("\n")}`);
      continue;
    }
    switch (p.accion) {
      case "prerrequisitos": {
        if (!versionOk(e.versionDeNode)) return fallo(`Node ${e.versionDeNode}: se necesita ${NODE_MINIMO.join(".")} o más nuevo.`);
        const d = await e.ejecutor.correr("docker", ["info", "--format", "{{.ServerVersion}}"]);
        if (d.codigo !== 0) return fallo("Docker no responde. Ábrelo (Docker Desktop) y vuelve a intentar.");
        const c = await e.ejecutor.correr("docker", ["compose", "version", "--short"]);
        if (c.codigo !== 0) return fallo("No encuentro «docker compose». Instala Docker con Compose v2.");
        e.decir(`  Node ${e.versionDeNode}, Docker ${d.salida.trim()}, Compose ${c.salida.trim()}`);
        break;
      }
      case "puertos": {
        const ocupados = new Set<number>();
        for (const pt of [o.puertoBackend, o.puertoChatwoot, o.puertoPostgres]) if (await e.red.puertoOcupado(pt)) ocupados.add(pt);
        // Los puertos que ya publica un contenedor de ESTE proyecto no cuentan: se van a liberar al reconstruir.
        const propios = new Set<number>();
        for (const pt of ocupados) {
          const r = await e.ejecutor.correr("docker", ["ps", "--filter", `publish=${pt}`, "--format", '{{.Label "com.docker.compose.project"}}']);
          if (r.codigo === 0 && r.salida.split("\n").map((x) => x.trim()).includes(o.proyecto)) propios.add(pt);
        }
        const ajenos = puertosAjenos(o, ocupados, propios);
        if (ajenos.length > 0) return fallo(`El puerto ${ajenos.join(", ")} lo usa otra cosa. Apágala, o elige otros con --puerto, --puerto-chatwoot y --puerto-postgres.`);
        e.decir(`  Puertos libres o de este proyecto: ${o.puertoBackend}, ${o.puertoChatwoot}, ${o.puertoPostgres}`);
        break;
      }
      case "volumenes": {
        for (const v of VOLUMENES_DE_LA_APLICACION) {
          const nombre = `${o.proyecto}_${v}`;
          const hay = await e.ejecutor.correr("docker", ["volume", "ls", "--quiet", "--filter", `name=^${nombre}$`]);
          if (hay.codigo === 0 && hay.salida.split("\n").map((x) => x.trim()).includes(nombre)) {
            const r = await e.ejecutor.correr("docker", ["volume", "rm", nombre]);
            if (r.codigo !== 0) return fallo(`No pude borrar el volumen ${nombre}:\n${r.salida}`);
            e.decir(`  Volumen ${nombre} borrado.`);
          } else e.decir(`  Volumen ${nombre}: no existía.`);
        }
        break;
      }
      case "comprobar": {
        comprobaciones = await comprobacionesHttp(o, e.red, hoyISO);
        for (const [nombre, archivo, args, resumen] of [
          ["Cuadratura del dinero", "scripts/cuadratura.ts", [], detalleDeCuadratura],
          ["Catálogo sin traslapes de edad ni choques de salón", "scripts/demo-datos.ts", ["--confirmar-base-de-demo"], detalleDeCatalogo],
        ] as const) {
          const r = await e.ejecutor.correr(process.execPath, [archivo, ...args], { env: entornoDeGuiones(o), timeoutMs: 300_000 });
          comprobaciones.push({ nombre, ok: r.codigo === 0, detalle: r.codigo === 0 ? resumen(r.salida) : `terminó con código ${r.codigo}: ${r.salida.split("\n").slice(-3).join(" ")}` });
        }
        for (const c of comprobaciones) e.decir(`  ${c.ok ? "✓" : "✗"} ${c.nombre} — ${c.detalle}`);
        break;
      }
    }
  }
  return { ok: comprobaciones.every((c) => c.ok), comprobaciones, ms: e.ahora() - inicio };
}
