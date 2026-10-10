// Buscar a la familia por teléfono (en cualquier formato) o por nombre. La búsqueda la hace el servidor: el teléfono pasa por `normalizarTelefono()` allá
// (invariante 7); aquí solo se decide si lo escrito parece un teléfono o un nombre.

import { useState, type FormEvent } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeCarga, Vacio } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { useCarga } from "../../ui/hooks.ts";
import { pareceTelefono, soloTelefono } from "./telefono.ts";

export { pareceTelefono };

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
    busqueda !== null && !(soloTelefono(busqueda) && !pareceTelefono(busqueda)),
  );

  // Un teléfono incompleto lo rechaza el servidor (400): no es un fallo de carga que se arregle reintentando, es algo que Rita puede corregir al instante.
  const telefonoIncompleto = busqueda !== null && ((resultados.error?.estado === 400 && pareceTelefono(busqueda)) || (soloTelefono(busqueda) && !pareceTelefono(busqueda)));

  // Con un teléfono incompleto no se muestra lo que dejó la búsqueda anterior.
  const datos = telefonoIncompleto ? null : resultados.datos;

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (escrito.trim().length >= 2) setBusqueda(escrito);
  };

  return (
    <div className="pila" data-prueba="buscador-de-familia">
      <form noValidate className="formulario" onSubmit={buscar} role="search">
        <CampoTexto etiqueta="Teléfono o nombre de la familia" autoComplete="off" inputMode="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} ayuda={escrito.trim().length === 1 ? "Escribe al menos dos letras para buscar." : "Escribe el teléfono (con o sin +52, con espacios o guiones) o el nombre de la mamá o del niño. No importan los acentos ni las mayúsculas."} />
        <div>
          <Boton type="submit" variante="primario" disabled={escrito.trim().length < 2}>
            Buscar
          </Boton>
        </div>
      </form>
      {resultados.cargando ? <Cargando texto="Buscando…" /> : null}
      {telefonoIncompleto ? (
        <Aviso tono="alerta" titulo="Ese teléfono no está completo">
          <p>Escribe los 10 dígitos, por ejemplo 55 1234 5678 (con o sin +52). Si no lo sabes de memoria, busca por el nombre de la mamá o del niño.</p>
        </Aviso>
      ) : resultados.error ? (
        <ErrorDeCarga error={resultados.error} alReintentar={resultados.recargar} />
      ) : null}
      {busqueda !== null && !telefonoIncompleto && datos && datos.datos.length === 0 ? <Vacio titulo="No encontré a esa familia">Revisa el teléfono o prueba con otro nombre.</Vacio> : null}
      <ul className="lista-tarjetas">
        {(datos?.datos ?? []).map((t) => (
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
