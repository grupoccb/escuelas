// Piezas de las pantallas de «Administración: sistema y mensajería»: el interruptor de los módulos y el estado de aprobación de una plantilla.

import type { InputHTMLAttributes, ReactNode } from "react";

/** Un interruptor claro (encendido / apagado). Es una casilla con rol de interruptor: se lee, se alcanza con el teclado y mide al menos 44 px. `children` es su nombre accesible, que va oculto. */
export function Interruptor({ children, ...resto }: { children: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role">) {
  return (
    <label className="interruptor">
      <input {...resto} type="checkbox" role="switch" />
      <span className="solo-lectores">{children}</span>
    </label>
  );
}

/** El estado de aprobación de una plantilla ante el proveedor, en palabras y con su tono (el color nunca va solo). */
export const TEXTO_DE_APROBACION: Record<string, string> = { pendiente: "Pendiente de aprobación", aprobada: "Aprobada", rechazada: "Rechazada", pausada: "Pausada", deshabilitada: "Deshabilitada" };
export const TONO_DE_APROBACION: Record<string, "exito" | "alerta" | "peligro" | "neutro"> = { aprobada: "exito", pendiente: "alerta", rechazada: "peligro", pausada: "alerta", deshabilitada: "neutro" };
