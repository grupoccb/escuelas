// Buscar a la familia por teléfono (en cualquier formato) o por nombre. La búsqueda la hace el servidor: el teléfono pasa por `normalizarTelefono()` allá
// (invariante 7); aquí solo se decide si lo escrito parece un teléfono o un nombre.

import { useState, type FormEvent } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, AvisoDeBusquedaIncompleta, Boton, Cargando, ErrorDeCarga, Vacio } from "../../ui/basicos.tsx";
import { CampoBusqueda } from "../../ui/campos.tsx";
import { useCarga } from "../../ui/hooks.ts";
import { FamiliaElegida } from "./FamiliaElegida.tsx";
import { pareceTelefono, soloTelefono } from "./telefono.ts";

export { pareceTelefono };

/** `enDialogo` (R4a): dentro del diálogo «Buscar familia» de «Registrar pago»: sin la tarjeta ni el ancho máximo de la pantalla de búsqueda, con los resultados en filas de 64 px. */
export function BuscadorDeFamilia({ alElegir, enDialogo = false }: { alElegir: (t: Tutor) => void; enDialogo?: boolean }) {
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

  const ayuda = escrito.trim().length === 1 ? "Escribe al menos dos letras para buscar." : "Escribe el teléfono (con o sin +52, con espacios o guiones) o el nombre de la mamá o del niño. No importan los acentos ni las mayúsculas.";

  return (
    <div className={`pila buscador-familia${enDialogo ? " buscador-familia-dialogo" : ""}`} data-prueba="buscador-de-familia">
      <form noValidate className={enDialogo ? "formulario-busqueda" : "tarjeta"} onSubmit={buscar} role="search">
        <div className="busqueda-fila">
          <CampoBusqueda etiqueta="Teléfono o nombre de la familia" placeholder="Teléfono o nombre" autoComplete="off" inputMode="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} aria-describedby="buscador-familia-ayuda" />
          <Boton type="submit" variante="primario" disabled={escrito.trim().length < 2}>
            Buscar
          </Boton>
        </div>
        <p className={escrito.trim().length === 1 ? "campo-error" : "campo-ayuda"} id="buscador-familia-ayuda">
          {ayuda}
        </p>
      </form>
      {resultados.cargando ? <Cargando texto="Buscando…" /> : null}
      {telefonoIncompleto ? (
        <Aviso tono="alerta" titulo="Ese teléfono no está completo">
          <p>Escribe los 10 dígitos, por ejemplo 55 1234 5678 (con o sin +52). Si no lo sabes de memoria, busca por el nombre de la mamá o del niño.</p>
        </Aviso>
      ) : resultados.error ? (
        <ErrorDeCarga error={resultados.error} alReintentar={resultados.recargar} />
      ) : null}
      {busqueda !== null && !telefonoIncompleto && datos && datos.datos.length === 0 ? (
        <Vacio titulo="No encontré a esa familia" icono="buscar">
          Revisa el teléfono o prueba con otro nombre.
        </Vacio>
      ) : null}
      <AvisoDeBusquedaIncompleta paginacion={datos?.paginacion} />
      <ul className="lista-tarjetas">
        {(datos?.datos ?? []).map((t) => (
          <li key={t.id} className="fila fila-entre resultado-familia" data-prueba={`familia-${t.id}`}>
            <FamiliaElegida tutor={t} />
            <Boton variante="sutil" onClick={() => alElegir(t)}>
              Elegir
            </Boton>
          </li>
        ))}
      </ul>
    </div>
  );
}
