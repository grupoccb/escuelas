import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import type { ErrorDeApi } from "../api/cliente.ts";

type Variante = "primario" | "secundario" | "peligro" | "fantasma";

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  cargando?: boolean;
  ancho?: boolean;
}

/** Botón de al menos 44 px de alto. `cargando` lo desactiva y lo dice con texto (no solo con un giro). */
export function Boton({ variante = "secundario", cargando = false, ancho = false, children, disabled, className, type = "button", ...resto }: PropsBoton) {
  return (
    <button {...resto} type={type} disabled={disabled || cargando} aria-busy={cargando || undefined} className={["boton", `boton-${variante}`, ancho ? "boton-ancho" : "", className ?? ""].join(" ").trim()}>
      {cargando ? "Procesando…" : children}
    </button>
  );
}

export function EnlaceBoton({ variante = "secundario", className, ...resto }: LinkProps & { variante?: Variante }) {
  return <Link {...resto} className={["boton", `boton-${variante}`, className ?? ""].join(" ").trim()} />;
}

export function Tarjeta({ children, titulo, acciones, className }: { children: ReactNode; titulo?: ReactNode; acciones?: ReactNode; className?: string }) {
  return (
    <section className={["tarjeta", className ?? ""].join(" ").trim()}>
      {titulo || acciones ? (
        <header className="tarjeta-cabecera">
          {titulo ? <h2>{titulo}</h2> : <span />}
          {acciones}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type Tono = "neutro" | "info" | "exito" | "alerta" | "peligro";

export function Insignia({ children, tono = "neutro" }: { children: ReactNode; tono?: Tono }) {
  return <span className={`insignia insignia-${tono}`}>{children}</span>;
}

/** Un mensaje a la vista. `peligro` y `alerta` se anuncian solos a un lector de pantalla (`role="alert"`). */
export function Aviso({ children, tono = "info", titulo }: { children: ReactNode; tono?: Tono; titulo?: string }) {
  const urgente = tono === "peligro" || tono === "alerta";
  return (
    <div className={`aviso aviso-${tono}`} role={urgente ? "alert" : "status"}>
      {titulo ? <strong>{titulo}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p className="cargando" role="status">
      <span className="giro" aria-hidden="true" /> {texto}
    </p>
  );
}

export function Vacio({ children, titulo }: { children?: ReactNode; titulo: string }) {
  return (
    <div className="vacio">
      <p className="vacio-titulo">{titulo}</p>
      {children ? <div className="vacio-detalle">{children}</div> : null}
    </div>
  );
}

/** El error de una carga, con el mensaje de la API y un botón para reintentar. */
export function ErrorDeCarga({ error, alReintentar }: { error: ErrorDeApi; alReintentar?: () => void }) {
  return (
    <Aviso tono="peligro" titulo="No se pudo cargar">
      <p>{error.message}</p>
      {alReintentar ? (
        <Boton variante="secundario" onClick={alReintentar}>
          Reintentar
        </Boton>
      ) : null}
    </Aviso>
  );
}

/** El error de una acción (guardar, cobrar…): mensaje y, si hay, el detalle por campo. */
export function ErrorDeAccion({ error }: { error: ErrorDeApi | null }) {
  if (!error) return null;
  const espera = error.reintentarEn ? ` Intenta de nuevo en ${error.reintentarEn} s.` : "";
  const extras = error.detalles.filter((d) => d.mensaje && d.mensaje !== error.message && (d.campo === undefined || !["motivo", "prospecto_id"].includes(d.campo))).slice(0, 8);
  return (
    <Aviso tono="peligro">
      <p>
        {error.message}
        {espera}
      </p>
      {extras.length > 0 ? (
        <ul>
          {extras.map((d, i) => (
            <li key={`${d.campo ?? ""}-${i}`}>{d.mensaje}</li>
          ))}
        </ul>
      ) : null}
    </Aviso>
  );
}

export function Pagina({ titulo, subtitulo, acciones, children }: { titulo: string; subtitulo?: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <div>
          <h1>{titulo}</h1>
          {subtitulo ? <p className="muted">{subtitulo}</p> : null}
        </div>
        {acciones ? <div className="pagina-acciones">{acciones}</div> : null}
      </header>
      {children}
    </div>
  );
}
