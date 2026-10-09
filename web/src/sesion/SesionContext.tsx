// La sesión de la aplicación: quién eres, qué puedes (los permisos vienen de `GET /api/yo`) y la sucursal con la que trabajas.
// La cookie de sesión es HttpOnly: el JavaScript nunca ve el token. Aquí solo se guarda lo que `/api/yo` ya dijo, en memoria.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { alExpirarLaSesion, api, pedir } from "../api/cliente.ts";
import type { Yo } from "../api/tipos.ts";
import { tiene } from "../lib/permisos.ts";

export type EstadoDeSesion = { fase: "cargando" } | { fase: "anonima"; motivo: "nueva" | "expirada" | "salio" } | { fase: "activa"; yo: Yo };

interface Valor {
  estado: EstadoDeSesion;
  yo: Yo | null;
  entrar(datos: { organizacion?: string; correo: string; contrasena: string }): Promise<void>;
  salir(): Promise<void>;
  recargar(): Promise<void>;
  puede(permiso: string): boolean;
  /** Sucursal con la que se filtra (`null` = todas las que ves). Solo se recuerda mientras dure la pestaña. */
  sucursalId: string | null;
  elegirSucursal(id: string | null): void;
}

const Contexto = createContext<Valor | null>(null);
const LLAVE_SUCURSAL = "sucursal-elegida";

function sucursalGuardada(): string | null {
  try {
    return sessionStorage.getItem(LLAVE_SUCURSAL);
  } catch {
    return null;
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDeSesion>({ fase: "cargando" });
  const [sucursalElegida, setSucursalElegida] = useState<string | null>(sucursalGuardada);

  const cargar = useCallback(async () => {
    try {
      const yo = await pedir<Yo>("GET", "/api/yo", { sinAvisoDeSesion: true });
      setEstado({ fase: "activa", yo });
    } catch {
      // Sin sesión (401) o sin servidor: se pide iniciar sesión; el formulario mostrará el error si el servidor no responde.
      setEstado({ fase: "anonima", motivo: "nueva" });
    }
  }, []);

  useEffect(() => {
    // Una sesión que vence a media jornada devuelve a la pantalla de acceso sin perder el lugar (la URL queda como estaba).
    alExpirarLaSesion(() => setEstado((actual) => (actual.fase === "activa" ? { fase: "anonima", motivo: "expirada" } : actual)));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la carga inicial de la sesión es un efecto de montaje por naturaleza
    void cargar();
    return () => alExpirarLaSesion(null);
  }, [cargar]);

  // Al volver a la pestaña (el teléfono estuvo en el bolsillo horas) se confirma que la sesión siga viva: si venció, el 401 manda al acceso con el aviso.
  useEffect(() => {
    if (estado.fase !== "activa") return;
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      pedir<Yo>("GET", "/api/yo")
        .then((yo) => setEstado((actual) => (actual.fase === "activa" ? { fase: "activa", yo } : actual)))
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [estado.fase]);

  const entrar = useCallback(async (datos: { organizacion?: string; correo: string; contrasena: string }) => {
    await pedir("POST", "/api/sesion", { cuerpo: { ...(datos.organizacion ? { organizacion: datos.organizacion } : {}), correo: datos.correo, contrasena: datos.contrasena }, sinAvisoDeSesion: true });
    const yo = await api.get<Yo>("/api/yo");
    setEstado({ fase: "activa", yo });
  }, []);

  const salir = useCallback(async () => {
    try {
      await pedir("DELETE", "/api/sesion", { sinAvisoDeSesion: true });
    } catch {
      // Cerrar sesión nunca debe quedarse colgado: si no hubo red, igual se sale de la pantalla (la cookie vence sola).
    }
    setSucursalElegida(null);
    setEstado({ fase: "anonima", motivo: "salio" });
  }, []);

  const elegirSucursal = useCallback((id: string | null) => {
    setSucursalElegida(id);
    try {
      if (id) sessionStorage.setItem(LLAVE_SUCURSAL, id);
      else sessionStorage.removeItem(LLAVE_SUCURSAL);
    } catch {
      // Sin almacenamiento (ventana privada): la elección vale mientras la página siga abierta.
    }
  }, []);

  const yo = estado.fase === "activa" ? estado.yo : null;
  // Una sucursal recordada que ya no es tuya (otro usuario en la misma pestaña) no se usa.
  const sucursalId = yo && sucursalElegida && yo.sucursales.some((s) => s.id === sucursalElegida) ? sucursalElegida : null;

  const valor = useMemo<Valor>(() => ({ estado, yo, entrar, salir, recargar: cargar, puede: (p) => tiene(yo, p), sucursalId, elegirSucursal }), [estado, yo, entrar, salir, cargar, sucursalId, elegirSucursal]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useSesion fuera de SesionProvider");
  return v;
}

/** La sesión activa (los componentes que solo existen con sesión). */
export function useYo(): Yo {
  const { yo } = useSesion();
  if (!yo) throw new Error("useYo sin sesión activa");
  return yo;
}
