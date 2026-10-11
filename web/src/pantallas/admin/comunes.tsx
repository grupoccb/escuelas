// Piezas que comparten las pantallas de administración: el regreso al menú, la confirmación de una baja y la lista de resultados con su estado.

import { useState, type ReactNode } from "react";
import { Aviso, EnlaceBoton, Boton, ErrorDeAccion, Vacio } from "../../ui/basicos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import type { NombreDeIcono } from "../../navegacion.ts";
import { useAccion } from "../../ui/hooks.ts";

/**
 * Una acción que se repite en cada tarjeta o fila (editar, desactivar, dar de baja): solo ícono, 44 × 44, con el MISMO nombre accesible que tenía el botón de texto.
 * `nombre` es el `aria-label` (y el texto de ayuda al pasar el ratón); `peligro` lo pinta con el color de lo destructivo, sin dejar de llevar su ícono.
 */
export function BotonDeIcono({ icono, nombre, onClick, peligro = false, disabled = false, ...resto }: { icono: NombreDeIcono; nombre: string; onClick: () => void; peligro?: boolean; disabled?: boolean; "data-prueba"?: string }) {
  return (
    <button type="button" className={`boton boton-icono${peligro ? " boton-icono-peligro" : ""}`} aria-label={nombre} title={nombre} disabled={disabled} onClick={onClick} {...resto}>
      <Icono nombre={icono} />
    </button>
  );
}

/** El estado vacío de una lista que ocupa la página (no está dentro de un panel): el recuadro lleva fondo blanco y borde punteado para distinguirse del fondo de la página. */
export function VacioDeLista({ titulo, icono, children }: { titulo: string; icono?: NombreDeIcono; children?: ReactNode }) {
  return (
    <div className="vacio-catalogo">
      <Vacio titulo={titulo} {...(icono ? { icono } : {})}>
        {children}
      </Vacio>
    </div>
  );
}

/**
 * Las acciones de una fila de catálogo (R7a), en el orden del prototipo: subir y bajar (si la lista se ordena), una acción propia (`extra`), «Activar»/«Desactivar» con texto (si aplica),
 * editar y dar de baja, estas dos de solo ícono. Los nombres accesibles son los de siempre («Editar», «Desactivar», «Dar de baja»); las listas con otro vocabulario («Cambiar», «Quitar») los pasan.
 */
export function AccionesDeTarjeta({ alEditar, nombreEditar = "Editar", alDesactivar, activo, ocupado = false, alDarDeBaja, nombreBaja = "Dar de baja", extra, ordenar }: { alEditar: () => void; nombreEditar?: string; alDesactivar?: () => void; activo?: boolean; ocupado?: boolean; alDarDeBaja?: () => void; nombreBaja?: string; extra?: ReactNode; ordenar?: { nombre: string; alSubir: (() => void) | null; alBajar: (() => void) | null; ocupado?: boolean } }) {
  return (
    <div className="acciones-fila">
      {ordenar ? (
        <>
          <BotonDeIcono icono="flecha_arriba" nombre={`Subir ${ordenar.nombre}`} disabled={!ordenar.alSubir || ordenar.ocupado === true} onClick={() => ordenar.alSubir?.()} />
          <BotonDeIcono icono="flecha_abajo" nombre={`Bajar ${ordenar.nombre}`} disabled={!ordenar.alBajar || ordenar.ocupado === true} onClick={() => ordenar.alBajar?.()} />
        </>
      ) : null}
      {extra}
      {alDesactivar ? (
        <Boton className="acciones-fila-activar" onClick={alDesactivar} disabled={ocupado}>
          {activo ? "Desactivar" : "Activar"}
        </Boton>
      ) : null}
      <BotonDeIcono icono="lapiz" nombre={nombreEditar} onClick={alEditar} />
      {alDarDeBaja ? <BotonDeIcono icono="papelera" nombre={nombreBaja} onClick={alDarDeBaja} peligro /> : null}
    </div>
  );
}

export function Regreso() {
  return (
    <EnlaceBoton to="/admin" variante="secundario">
      <Icono nombre="atras" tamano={18} />
      Administración
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
