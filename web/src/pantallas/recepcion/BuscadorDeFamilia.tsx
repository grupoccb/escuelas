// Buscar a la familia por teléfono (en cualquier formato) o por nombre. La búsqueda la hace el servidor: el teléfono pasa por `normalizarTelefono()` allá
// (invariante 7); aquí solo se decide si lo escrito parece un teléfono o un nombre.

import { useState, type FormEvent } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Boton, Cargando, ErrorDeCarga, Vacio } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { useCarga } from "../../ui/hooks.ts";

/** ¿Lo escrito es un teléfono? Solo dígitos y signos de teléfono, y al menos siete dígitos. */
export function pareceTelefono(texto: string): boolean {
  const t = texto.trim();
  return /^[\d\s()+\-.]+$/.test(t) && t.replace(/\D/g, "").length >= 7;
}

export function BuscadorDeFamilia({ alElegir }: { alElegir: (t: Tutor) => void }) {
  const { sucursalId } = useSesion();
  const [escrito, setEscrito] = useState("");
  const [busqueda, setBusqueda] = useState<string | null>(null);
  const resultados = useCarga(
    (senal) => {
      const q = busqueda ?? "";
      return api.get<Pagina<Tutor>>("/api/tutores", { ...(pareceTelefono(q) ? { telefono: q.trim() } : { nombre: q.trim() }), ...(sucursalId ? { sucursal_id: sucursalId } : {}), limite: 20 }, senal);
    },
    [busqueda, sucursalId],
    busqueda !== null,
  );

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (escrito.trim().length >= 2) setBusqueda(escrito);
  };

  return (
    <div className="pila" data-prueba="buscador-de-familia">
      <form className="formulario" onSubmit={buscar} role="search">
        <CampoTexto etiqueta="Teléfono o nombre de la familia" autoComplete="off" inputMode="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} ayuda="El teléfono puede ir con o sin lada y con espacios o guiones." />
        <div>
          <Boton type="submit" variante="primario" disabled={escrito.trim().length < 2}>
            Buscar
          </Boton>
        </div>
      </form>
      {resultados.cargando ? <Cargando texto="Buscando…" /> : null}
      {resultados.error ? <ErrorDeCarga error={resultados.error} alReintentar={resultados.recargar} /> : null}
      {busqueda !== null && resultados.datos && resultados.datos.datos.length === 0 ? <Vacio titulo="No encontré a esa familia">Revisa el teléfono o prueba con otro nombre.</Vacio> : null}
      <ul className="lista-tarjetas">
        {(resultados.datos?.datos ?? []).map((t) => (
          <li key={t.id} className="tarjeta fila fila-entre" data-prueba={`familia-${t.id}`}>
            <span>
              <strong>
                {t.nombre} {t.apellidos ?? ""}
              </strong>
              <br />
              <span className="muted">
                {t.telefono} · {t.alumnos.length === 0 ? "sin alumnos" : t.alumnos.map((a) => a.nombre).join(", ")}
              </span>
            </span>
            <Boton variante="primario" onClick={() => alElegir(t)}>
              Elegir
            </Boton>
          </li>
        ))}
      </ul>
    </div>
  );
}
