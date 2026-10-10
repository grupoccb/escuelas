import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { MENSAJE_NO_ENCONTRADO, type ErrorDeApi } from "../api/cliente.ts";

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
      <p>{error.estado === 404 ? MENSAJE_NO_ENCONTRADO : error.message}</p>
      {/* Un «no se encontró» no se arregla reintentando: se ofrece volver al inicio (V7). */}
      {error.estado === 404 ? (
        <EnlaceBoton to="/" variante="secundario">
          Ir a mi inicio
        </EnlaceBoton>
      ) : alReintentar ? (
        <Boton variante="secundario" onClick={alReintentar}>
          Reintentar
        </Boton>
      ) : null}
    </Aviso>
  );
}

/**
 * El error de una acción (guardar, cobrar…): mensaje y, si hay, el detalle por campo.
 *
 * V7: `enCampos` son los campos que el formulario ya muestra junto a su caja. Un detalle de esos campos NO se repite aquí (antes el mismo texto salía dos veces: junto al campo y otra vez
 * abajo), y cuando el mensaje principal es justo uno de esos detalles se dice solo «Revisa lo marcado en rojo». Al aparecer, el error se acerca a la vista: en un diálogo largo quedaba
 * debajo de lo que se ve y parecía que «Guardar» no hacía nada.
 */
export function ErrorDeAccion({ error, enCampos }: { error: ErrorDeApi | null; enCampos?: readonly string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // `scrollIntoView` no existe en los entornos sin pantalla de las pruebas de lógica.
    if (error) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);
  if (!error) return null;
  const espera = error.reintentarEn ? ` Intenta de nuevo en ${error.reintentarEn} s.` : "";
  const enCampo = (campo: string | undefined): boolean => campo !== undefined && (enCampos ?? []).some((c) => campo === c || campo.startsWith(`${c}[`) || campo.startsWith(`${c}.`));
  const sueltos = error.detalles.filter((d) => d.mensaje && d.mensaje !== error.message && !enCampo(d.campo) && (d.campo === undefined || !["motivo", "prospecto_id"].includes(d.campo))).slice(0, 8);
  const yaJuntoAlCampo = error.detalles.some((d) => enCampo(d.campo) && d.mensaje === error.message);
  const todoJuntoAlCampo = error.detalles.length > 0 && error.detalles.every((d) => enCampo(d.campo)) && error.message === "Los datos enviados no son válidos";
  const principal = yaJuntoAlCampo || todoJuntoAlCampo ? "Revisa lo marcado en rojo." : error.message;
  return (
    <div ref={ref} data-prueba="error-de-guardado">
      <Aviso tono="peligro">
        <p>
          {principal}
          {espera}
        </p>
        {sueltos.length > 0 ? (
          <ul>
            {sueltos.map((d, i) => (
              <li key={`${d.campo ?? ""}-${i}`}>{d.mensaje}</li>
            ))}
          </ul>
        ) : null}
      </Aviso>
    </div>
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
