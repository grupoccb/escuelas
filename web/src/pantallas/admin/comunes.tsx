// Piezas que comparten las pantallas de administración: el regreso al menú, la confirmación de una baja y la lista de resultados con su estado.

import { useState, type ReactNode } from "react";
import { EnlaceBoton, Boton, ErrorDeAccion } from "../../ui/basicos.tsx";
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
