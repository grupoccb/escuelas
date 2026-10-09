// Ayudantes para probar la API de punta a punta: usuarios con contraseña barata, la app real
// escuchando en un puerto libre y un cliente HTTP con su propio frasco de cookies.

import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { PARAMETROS_PRUEBA, hashContrasena } from "../auth/contrasena.ts";
import type { Rol } from "../auth/roles.ts";
import { crearApp, type AppDeps } from "../http/app.ts";
import type { ApiDepsEntrada } from "../api/index.ts";
import type { PrismaPruebas } from "./prisma-pruebas.ts";
import { escucharSinReuso, puertoDe } from "./servidor.ts";

export const CONTRASENA_DE_PRUEBA = "contrasena-de-prueba-1";

export interface UsuarioDePrueba {
  id: string;
  correo: string;
  contrasena: string;
  rol: Rol;
}

export async function sembrarUsuario(
  prisma: PrismaPruebas,
  organizacionId: string,
  opciones: { rol: Rol; correo?: string; contrasena?: string; sucursales?: string[]; activo?: boolean; nombre?: string },
): Promise<UsuarioDePrueba> {
  const contrasena = opciones.contrasena ?? CONTRASENA_DE_PRUEBA;
  const correo = opciones.correo ?? `${opciones.rol}-${randomUUID().slice(0, 8)}@prueba.test`;
  const u = await prisma.usuario.create({
    data: {
      organizacion_id: organizacionId,
      correo,
      nombre: opciones.nombre ?? `Usuario ${opciones.rol}`,
      rol: opciones.rol,
      contrasena_hash: await hashContrasena(contrasena, PARAMETROS_PRUEBA),
      activo: opciones.activo ?? true,
    },
  });
  for (const sucursalId of opciones.sucursales ?? []) {
    await prisma.usuario_sucursal.create({ data: { organizacion_id: organizacionId, usuario_id: u.id, sucursal_id: sucursalId } });
  }
  return { id: u.id, correo, contrasena, rol: opciones.rol };
}

export interface RespuestaApi<T = unknown> {
  estado: number;
  cuerpo: T;
  cabeceras: Headers;
}

/** Cliente con cookies. `cabecerasExtra` se manda en cada petición (p. ej. X-Forwarded-For). */
export class ClienteApi {
  private readonly origen: string | (() => string);
  /** El servidor ya escucha (EG-08: el puerto se conoce hasta el evento `listening`). Cada petición lo espera. */
  private readonly listo: Promise<unknown>;
  private cookies = new Map<string, string>();
  cabecerasExtra: Record<string, string> = {};

  constructor(base: string | (() => string), listo: Promise<unknown> = Promise.resolve()) {
    this.origen = base;
    this.listo = listo;
  }

  get base(): string {
    return typeof this.origen === "string" ? this.origen : this.origen();
  }

  /** La cookie de sesión, se llame `sesion` o `__Host-sesion` (con cookie segura, EB-24). */
  get cookieDeSesion(): string | undefined {
    return this.cookies.get("__Host-sesion") ?? this.cookies.get("sesion");
  }
  set cookieDeSesion(valor: string | undefined) {
    const nombre = this.cookies.has("__Host-sesion") ? "__Host-sesion" : "sesion";
    if (valor === undefined) this.cookies.delete(nombre);
    else this.cookies.set(nombre, valor);
  }

  /** Manda la petición (con las cookies de la sesión) y devuelve la respuesta cruda. */
  private async enviar(metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<Response> {
    const h: Record<string, string> = { ...this.cabecerasExtra, ...cabeceras };
    if (this.cookies.size > 0) h["cookie"] = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    let body: string | undefined;
    if (cuerpo !== undefined) {
      h["content-type"] ??= "application/json";
      body = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
    } else if (metodo !== "GET") {
      h["x-requested-with"] ??= "prueba";
    }
    await this.listo;
    const res = await fetch(`${this.base}${ruta}`, { method: metodo, headers: h, ...(body !== undefined ? { body } : {}) });
    for (const c of res.headers.getSetCookie()) {
      const [par = "", ...atributos] = c.split(";");
      const i = par.indexOf("=");
      const nombre = par.slice(0, i).trim();
      const valor = par.slice(i + 1).trim();
      const vencida = atributos.some((a) => /^\s*expires=/i.test(a) && new Date(a.split("=")[1] ?? "").getTime() < Date.now());
      if (valor === "" || vencida) this.cookies.delete(nombre);
      else this.cookies.set(nombre, valor);
    }
    return res;
  }

  /** Una descarga: los bytes TAL CUAL (`res.text()` se come el BOM UTF-8 del CSV) y las cabeceras. */
  async descargar(ruta: string): Promise<{ estado: number; cabeceras: Headers; bytes: Buffer }> {
    const res = await this.enviar("GET", ruta);
    return { estado: res.status, cabeceras: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
  }

  async pedir<T = unknown>(metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<RespuestaApi<T>> {
    const res = await this.enviar(metodo, ruta, cuerpo, cabeceras);
    const texto = await res.text();
    let json: unknown;
    try {
      json = texto === "" ? null : JSON.parse(texto);
    } catch {
      json = texto;
    }
    return { estado: res.status, cuerpo: json as T, cabeceras: res.headers };
  }

  get = <T = unknown>(ruta: string) => this.pedir<T>("GET", ruta);
  post = <T = unknown>(ruta: string, cuerpo?: unknown) => this.pedir<T>("POST", ruta, cuerpo);
  patch = <T = unknown>(ruta: string, cuerpo?: unknown) => this.pedir<T>("PATCH", ruta, cuerpo);
  delete = <T = unknown>(ruta: string) => this.pedir<T>("DELETE", ruta);

  login(slug: string | undefined, correo: string, contrasena: string) {
    return this.post<{ usuario: { id: string; rol: Rol } }>("/api/sesion", { ...(slug ? { organizacion: slug } : {}), correo, contrasena });
  }
}

export interface ApiLevantada {
  /** El origen del servidor (`http://127.0.0.1:puerto`); solo existe cuando ya escucha: espera `listo` si lo lees justo después de levantarla. */
  readonly base: string;
  /** Se cumple cuando el servidor ya escucha. */
  readonly listo: Promise<void>;
  server: Server;
  cliente(): ClienteApi;
  cerrar(): Promise<void>;
}

/** La app real con la API montada, en un puerto libre. `deps` sobrescribe lo que se quiera. */
export function levantarApi(prisma: PrismaPruebas, api: Partial<ApiDepsEntrada> = {}, deps: Partial<AppDeps> = {}): ApiLevantada {
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: "secreto-de-prueba",
    procesarEntrante: async () => ({ resultado: "procesado" }),
    registrarTomaDeConversacion: async () => "tomada",
    estadosEntrega: { interpretar: () => null },
    registrarEstadoEntrega: async () => "actualizado",
    api: { prisma, parametrosHash: PARAMETROS_PRUEBA, cookieSegura: false, origenesPermitidos: [], ...api },
    landing: { prisma },
    ...deps,
  });
  const server = escucharSinReuso(app);
  const listo = puertoDe(server).then(() => undefined);
  const base = (): string => `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    get base() {
      return base();
    },
    listo,
    server,
    cliente: () => new ClienteApi(base, listo),
    cerrar: () => new Promise((resolver) => server.close(() => resolver())),
  };
}
