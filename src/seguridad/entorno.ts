// Revisión del entorno al arrancar (K3): en producción el backend se NIEGA a arrancar con valores de demostración o con una configuración que debilita la
// seguridad (cookie sin Secure, origen sin https, secretos cortos o conocidos). La demo local (docker compose) corre también con NODE_ENV=production, así
// que declara `ENTORNO_DEMO=si`: con esa marca arranca igual pero lo dice a gritos en el log. Quien despliega a AWS NO la define (infra/ecs.tf no lo hace).
//
// Se revisa el entorno, no los archivos: `config/demo-local.env` y las contraseñas de la demo existen solo para la demo (docs/OPERACION.md).

export interface HallazgoDeEntorno {
  codigo: string;
  mensaje: string;
  /** true: impide arrancar en producción. false: se registra como aviso. */
  grave: boolean;
}

/** La clave de cifrado que está publicada en docker-compose.yml: sirve solo para la demo. */
export const CLAVE_DE_DEMO_PUBLICADA = "I4YAELLXaPYTGc2hPt5pVkQ8r0G5MpudNuv0u31Zp28=";

/** Fragmentos que delatan un valor de demostración o de desarrollo en cualquier variable. */
const MARCAS_DE_DEMO = ["demo-local", "Demo-local", "solo-desarrollo", "solo desarrollo", "cambiar-en-produccion", "contrasena-de-prueba", "secreto-de-prueba"];

const LARGO_MINIMO_SECRETO = 24;

export function esEntornoDeDemo(env: NodeJS.ProcessEnv): boolean {
  return (env["ENTORNO_DEMO"] ?? "").trim().toLowerCase() === "si";
}

/**
 * ¿Es un entorno LOCAL (desarrollo o la demo de docker compose) y no una instalación real? Sí si `NODE_ENV` no es `production`, o si es la demo declarada (`ENTORNO_DEMO=si`:
 * corre con `NODE_ENV=production` pero en la máquina de quien la prueba). Solo ahí la aplicación acepta también `localhost` y `127.0.0.1` como origen (V2, decisión 7).
 * Una instalación real (AWS) no define `ENTORNO_DEMO` y, con `NODE_ENV=production`, solo acepta `ORIGEN_PUBLICO`.
 */
export function esEntornoLocal(env: NodeJS.ProcessEnv): boolean {
  return env["NODE_ENV"] !== "production" || esEntornoDeDemo(env);
}

export function revisarEntorno(env: NodeJS.ProcessEnv = process.env): HallazgoDeEntorno[] {
  if (env["NODE_ENV"] !== "production") return [];
  const hallazgos: HallazgoDeEntorno[] = [];
  const grave = (codigo: string, mensaje: string): void => void hallazgos.push({ codigo, mensaje, grave: true });
  const aviso = (codigo: string, mensaje: string): void => void hallazgos.push({ codigo, mensaje, grave: false });

  const clave = env["CLAVE_DATOS_SENSIBLES"];
  if (!clave) grave("clave_datos_ausente", "Falta CLAVE_DATOS_SENSIBLES: sin ella no se pueden cifrar los datos de salud de los menores.");
  else if (clave === CLAVE_DE_DEMO_PUBLICADA) grave("clave_datos_de_demo", "CLAVE_DATOS_SENSIBLES es la clave de la demo, publicada en el repositorio: cualquiera podría descifrar la salud de los alumnos. Genera una con `openssl rand -base64 32`.");

  const conMarcaDeDemo = Object.entries(env)
    .filter(([, v]) => typeof v === "string" && MARCAS_DE_DEMO.some((m) => v.includes(m)))
    .map(([k]) => k)
    .sort();
  if (conMarcaDeDemo.length > 0) grave("valores_de_demo", `Variables con valores de demostración: ${conMarcaDeDemo.join(", ")}. Son públicas (están en el repositorio).`);

  const bd = env["DATABASE_URL"];
  if (bd) {
    try {
      const u = new URL(bd);
      if (u.username === "inscripciones" && decodeURIComponent(u.password) === "inscripciones") grave("base_de_demo", "DATABASE_URL usa el usuario y la contraseña de la demo (inscripciones/inscripciones).");
      if (u.username === "postgres") aviso("base_superusuario", "DATABASE_URL usa el usuario «postgres»: la aplicación debe usar una cuenta sin dueño ni privilegios (docs/INFRA-AWS.md, scripts/preparar-roles.ts).");
    } catch {
      grave("base_ilegible", "DATABASE_URL no es una URL válida.");
    }
  } else {
    grave("base_ausente", "Falta DATABASE_URL.");
  }

  if ((env["COOKIE_SEGURA"] ?? "").trim() === "false") grave("cookie_sin_secure", "COOKIE_SEGURA=false: la cookie de sesión viajaría sin cifrar si alguien entra por http.");

  const origenes = (env["ORIGEN_PUBLICO"] ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (origenes.length === 0) grave("origen_ausente", "Falta ORIGEN_PUBLICO: sin él, la protección CSRF acepta el propio host de cada petición.");
  else if (origenes.some((o) => !o.startsWith("https://"))) grave("origen_sin_https", `ORIGEN_PUBLICO debe ser https (recibí «${origenes.find((o) => !o.startsWith("https://"))}»).`);

  // Los secretos compartidos (el del webhook del bot, el de las métricas…): no pueden ser cortos.
  for (const [nombre, v] of Object.entries(env)) {
    if (typeof v !== "string" || !/(?:SECRETO|SECRET)$|^METRICAS_TOKEN$/.test(nombre)) continue;
    if (v.length < LARGO_MINIMO_SECRETO) grave("secreto_corto", `${nombre} tiene menos de ${LARGO_MINIMO_SECRETO} caracteres.`);
  }

  if (env["TWILIO_AUTH_TOKEN"] && !(env["PUBLIC_BASE_URL"] ?? "").startsWith("https://")) aviso("twilio_sin_https", "TWILIO_AUTH_TOKEN está definido pero PUBLIC_BASE_URL no es https: Twilio firma contra la URL pública y exige https.");
  if (!(env["TRUST_PROXY"] ?? "").trim()) aviso("trust_proxy", "TRUST_PROXY no está definido: detrás del balanceador todos los clientes compartirían una IP.");
  return hallazgos;
}

/** Lo que `server.ts` hace con la revisión: devuelve los graves que impiden arrancar (vacío si todo bien o si es la demo). */
export function impedimentosParaArrancar(env: NodeJS.ProcessEnv = process.env): HallazgoDeEntorno[] {
  if (esEntornoDeDemo(env)) return [];
  return revisarEntorno(env).filter((h) => h.grave);
}
