import { Icono } from "./Icono.tsx";
import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** Etiqueta visible + control + ayuda + error enlazados (`aria-describedby`, `aria-invalid`). TODO campo lleva etiqueta. */
interface Base {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string | undefined;
  requerido?: boolean;
  /** Marcado como inválido (borde rojo y `aria-invalid`) cuando el mensaje ya lo dice otra parte de la pantalla, como el aviso de «Correo o contraseña incorrectos». */
  invalido?: boolean | undefined;
}

function Envoltura({ id, etiqueta, ayuda, error, invalido, requerido, children }: Base & { id: string; children: ReactNode }) {
  return (
    <div className={`campo${error || invalido ? " campo-con-error" : ""}`}>
      <label htmlFor={id}>
        {etiqueta}
        {requerido ? <span className="requerido" aria-hidden="true"> *</span> : null}
        {requerido ? <span className="solo-lectores"> (obligatorio)</span> : null}
      </label>
      {children}
      {ayuda ? (
        <p className="campo-ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p className="campo-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const describe = (id: string, ayuda: unknown, error: unknown): string | undefined => [ayuda ? `${id}-ayuda` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;

export function CampoTexto({ etiqueta, ayuda, error, invalido, requerido, ...resto }: Base & Omit<InputHTMLAttributes<HTMLInputElement>, "required">) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} invalido={invalido} requerido={requerido}>
      <input {...resto} id={id} required={requerido} aria-invalid={error || invalido ? true : undefined} aria-describedby={describe(id, ayuda, error)} />
    </Envoltura>
  );
}

export function CampoArea({ etiqueta, ayuda, error, requerido, ...resto }: Base & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "required">) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido}>
      <textarea rows={3} {...resto} id={id} required={requerido} aria-invalid={error ? true : undefined} aria-describedby={describe(id, ayuda, error)} />
    </Envoltura>
  );
}

export interface Opcion {
  valor: string;
  texto: string;
  deshabilitada?: boolean;
  /** Para `GrupoDeOpciones`: lo que se dibuja dentro de la opción en lugar de `texto` (que sigue siendo lo que lee el lector de pantalla si no hay otra cosa). */
  contenido?: ReactNode;
}

export function CampoSelect({ etiqueta, ayuda, error, requerido, opciones, vacio, ...resto }: Base & Omit<SelectHTMLAttributes<HTMLSelectElement>, "required"> & { opciones: readonly Opcion[]; vacio?: string }) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido}>
      <select {...resto} id={id} required={requerido} aria-invalid={error ? true : undefined} aria-describedby={describe(id, ayuda, error)}>
        {vacio !== undefined ? <option value="">{vacio}</option> : null}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor} disabled={o.deshabilitada}>
            {o.texto}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}

/** Una casilla con su texto (el texto es parte de la etiqueta, también clicable). */
export function CampoCasilla({ etiqueta, ayuda, ...resto }: { etiqueta: ReactNode; ayuda?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  return (
    <div className="campo campo-casilla">
      <input {...resto} id={id} type="checkbox" aria-describedby={ayuda ? `${id}-ayuda` : undefined} />
      <label htmlFor={id}>{etiqueta}</label>
      {ayuda ? (
        <p className="campo-ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

/** Tres opciones exclusivas en botones grandes (Sí / No / Sin responder), para el celular. */
/** `segmentado`: dos o tres opciones cortas y excluyentes como selector segmentado (la pista --columna con la activa en blanco); `rejilla`: para listas largas con texto (V7: las sesiones de una clase muestra) las opciones van en columnas parejas en vez de apretarse en una fila. */
export function GrupoDeOpciones({ etiqueta, valor, opciones, alCambiar, error, rejilla = false, segmentado = false }: { etiqueta: string; valor: string; opciones: readonly Opcion[]; alCambiar: (v: string) => void; error?: string | undefined; rejilla?: boolean; segmentado?: boolean }) {
  const id = useId();
  return (
    <fieldset className={`grupo-opciones${segmentado ? " grupo-segmentado" : ""}${error ? " campo-con-error" : ""}`} aria-describedby={error ? `${id}-error` : undefined}>
      <legend>{etiqueta}</legend>
      <div className={rejilla ? "grupo-opciones-fila grupo-opciones-rejilla" : "grupo-opciones-fila"}>
        {opciones.map((o) => (
          <label key={o.valor} className={`opcion${valor === o.valor ? " opcion-activa" : ""}${o.deshabilitada ? " opcion-inactiva" : ""}`}>
            <input type="radio" name={id} value={o.valor} checked={valor === o.valor} disabled={o.deshabilitada} onChange={() => alCambiar(o.valor)} />
            <span>{o.contenido ?? o.texto}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p className="campo-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Búsqueda en una lista: lupa y campo dentro de una sola caja. La etiqueta existe para los lectores de pantalla. */
export function CampoBusqueda({ etiqueta, ...resto }: { etiqueta: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  return (
    <label className="campo-busqueda" htmlFor={id}>
      <Icono nombre="buscar" tamano={18} />
      <span className="solo-lectores">{etiqueta}</span>
      <input {...resto} id={id} type="search" />
    </label>
  );
}

/** Contraseña con «Mostrar» / «Ocultar» dentro de la caja del campo. El botón no lleva etiqueta propia con la palabra «contraseña»: la etiqueta del campo sigue apuntando solo al campo. */
export function CampoClave({ etiqueta, ayuda, error, invalido, requerido, ...resto }: Base & Omit<InputHTMLAttributes<HTMLInputElement>, "required" | "type">) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} invalido={invalido} requerido={requerido}>
      <div className="campo-clave">
        <input {...resto} id={id} type={visible ? "text" : "password"} required={requerido} aria-invalid={error || invalido ? true : undefined} aria-describedby={describe(id, ayuda, error)} />
        <button type="button" className="boton" aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </Envoltura>
  );
}
