// Piezas que comparten las pantallas de administración: el regreso al menú, la confirmación de una baja y la lista de resultados con su estado.

import { useState, type ReactNode } from "react";
import { Aviso, EnlaceBoton, Boton, ErrorDeAccion } from "../../ui/basicos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion } from "../../ui/hooks.ts";

export function Regreso() {
  return (
    <EnlaceBoton to="/admin" variante="fantasma">
      ← Administración
    </EnlaceBoton>
  );
}

/** Un diálogo de confirmación para una baja (o cualquier acción que no se debe hacer sin querer). El error del servidor se muestra dentro, sin cerrar. */
export function ConfirmarAccion({ abierto, titulo, children, textoDeConfirmar, peligro = true, alConfirmar, alCerrar }: { abierto: boolean; titulo: string; children: ReactNode; textoDeConfirmar: string; peligro?: boolean; alConfirmar: () => Promise<unknown>; alCerrar: () => void }) {
  const accion = useAccion();
  return (
    <Dialogo abierto={abierto} titulo={titulo} alCerrar={alCerrar}>
      <div className="pila">
        {children}
        <ErrorDeAccion error={accion.error} />
        <div className="formulario-acciones">
          <Boton
            variante={peligro ? "peligro" : "primario"}
            cargando={accion.ocupado}
            onClick={() =>
              void accion.ejecutar(async () => {
                await alConfirmar();
                alCerrar();
              })
            }
          >
            {textoDeConfirmar}
          </Boton>
          <Boton onClick={alCerrar}>Cancelar</Boton>
        </div>
      </div>
    </Dialogo>
  );
}

/** El estado abierto/cerrado de un diálogo de edición: `null` cerrado, `"nuevo"` para un alta o el elemento que se edita. */
export function useEdicion<T>(): { actual: T | "nuevo" | null; nuevo: () => void; editar: (x: T) => void; cerrar: () => void } {
  const [actual, setActual] = useState<T | "nuevo" | null>(null);
  return { actual, nuevo: () => setActual("nuevo"), editar: (x) => setActual(x), cerrar: () => setActual(null) };
}

/**
 * Lo que pasa al dar de baja algo del catálogo, dicho completo (V7): se quita de todas las listas, desde aquí no hay botón para recuperarlo (no se borra nada: soporte puede) y,
 * si solo se quiere dejar de usar por ahora, desactivar sí se deshace. `consecuencia` es lo propio de cada cosa (por ejemplo, «si tiene alumnos inscritos, pásalos antes»).
 */
export function AvisoDeBaja({ cosa, genero, nombre, consecuencia }: { cosa: string; genero: "m" | "f"; nombre: string | undefined; consecuencia?: string }) {
  const [el, lo, desactivalo] = genero === "m" ? ["el", "lo", "desactívalo"] : ["la", "la", "desactívala"];
  return (
    <>
      <Aviso tono="alerta">
        Vas a dar de baja {el} {cosa} <strong>{nombre}</strong>. {consecuencia ? `${consecuencia} ` : ""}Después ya no aparecerá en ninguna lista ni pantalla, y desde aquí no hay botón para recuperar{lo}: no se borra nada, pero hay que pedirle a soporte que {lo} recupere.
      </Aviso>
      <p className="muted">Si solo quieres dejar de usar {el} {cosa} por ahora, mejor {desactivalo} (en «Editar»): eso sí se deshace cuando quieras.</p>
    </>
  );
}
