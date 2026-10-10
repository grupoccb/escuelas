import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** Etiqueta visible + control + ayuda + error enlazados (`aria-describedby`, `aria-invalid`). TODO campo lleva etiqueta. */
interface Base {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string | undefined;
  requerido?: boolean;
}

function Envoltura({ id, etiqueta, ayuda, error, requerido, children }: Base & { id: string; children: ReactNode }) {
  return (
    <div className={`campo${error ? " campo-con-error" : ""}`}>
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

export function CampoTexto({ etiqueta, ayuda, error, requerido, ...resto }: Base & Omit<InputHTMLAttributes<HTMLInputElement>, "required">) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido}>
      <input {...resto} id={id} required={requerido} aria-invalid={error ? true : undefined} aria-describedby={describe(id, ayuda, error)} />
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
/** `rejilla`: para listas largas con texto (V7: las sesiones de una clase muestra) las opciones van en columnas parejas en vez de apretarse en una fila. */
export function GrupoDeOpciones({ etiqueta, valor, opciones, alCambiar, error, rejilla = false }: { etiqueta: string; valor: string; opciones: readonly Opcion[]; alCambiar: (v: string) => void; error?: string | undefined; rejilla?: boolean }) {
  const id = useId();
  return (
    <fieldset className={`grupo-opciones${error ? " campo-con-error" : ""}`} aria-describedby={error ? `${id}-error` : undefined}>
      <legend>{etiqueta}</legend>
      <div className={rejilla ? "grupo-opciones-fila grupo-opciones-rejilla" : "grupo-opciones-fila"}>
        {opciones.map((o) => (
          <label key={o.valor} className={`opcion${valor === o.valor ? " opcion-activa" : ""}${o.deshabilitada ? " opcion-inactiva" : ""}`}>
            <input type="radio" name={id} value={o.valor} checked={valor === o.valor} disabled={o.deshabilitada} onChange={() => alCambiar(o.valor)} />
            <span>{o.texto}</span>
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
