// Alumnos: buscador y lista (administrador, asesor, recepción y maestro). El maestro ve solo a SUS alumnos y no puede buscar por teléfono (no ve cómo contactar a la familia).

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { AvisoDeBusquedaIncompleta, Boton, Cargando, ErrorDeCarga, Insignia, Pagina, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoBusqueda, CampoSelect } from "../../ui/campos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { pareceTelefono } from "../recepcion/BuscadorDeFamilia.tsx";
import { iniciales } from "../recepcion/FamiliaElegida.tsx";
import type { AlumnoDeLista } from "./tipos.ts";
import { ESTATUS_DE_ALUMNO, nombreCompleto } from "./vista.ts";

const LIMITE = 20;

export default function AlumnosLista() {
  useTitulo("Alumnos");
  const { puede, sucursalId } = useSesion();
  const esMaestro = !puede("tutores:leer");
  const [escrito, setEscrito] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estatus, setEstatus] = useState("");
  const [pagina, setPagina] = useState(1);
  const lista = useCarga(
    (senal) => {
      const q = busqueda.trim();
      return api.get<Pag<AlumnoDeLista>>("/api/alumnos", { ...(q ? (pareceTelefono(q) && !esMaestro ? { telefono: q } : { nombre: q }) : {}), ...(estatus ? { estatus } : {}), ...(sucursalId ? { sucursal_id: sucursalId } : {}), limite: LIMITE, pagina }, senal);
    },
    [busqueda, estatus, sucursalId, pagina],
  );

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setPagina(1);
    setBusqueda(escrito);
  };

  return (
    <Pagina titulo="Alumnos" subtitulo={esMaestro ? "Tus alumnos (sin datos de contacto de la familia ni importes)." : "Busca por nombre del alumno o por teléfono de un adulto de la familia."}>
      <form noValidate className="tarjeta familia-buscador" onSubmit={buscar} role="search">
        <div className="familia-filtros">
          <CampoBusqueda etiqueta={esMaestro ? "Nombre del alumno" : "Nombre o teléfono"} placeholder={esMaestro ? "Nombre del alumno" : "Nombre o teléfono"} autoComplete="off" value={escrito} onChange={(e) => setEscrito(e.target.value)} />
          <CampoSelect
            etiqueta="Estatus"
            value={estatus}
            vacio="Todos"
            opciones={[
              { valor: "activo", texto: "Activos" },
              { valor: "congelado", texto: "Congelados" },
              { valor: "baja", texto: "Bajas" },
            ]}
            onChange={(e) => {
              setPagina(1);
              setEstatus(e.target.value);
            }}
          />
          <Boton type="submit" variante="primario" className="boton-accion-celular">
            Buscar
          </Boton>
        </div>
      </form>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="No hay alumnos que coincidan" icono="buscar">Cambia lo que escribiste o el estatus.</Vacio>
        </Tarjeta>
      ) : null}
      <ul className="lista-tarjetas rejilla-tarjetas" data-prueba="lista-de-alumnos">
        {(lista.datos?.datos ?? []).map((a) => (
          <li key={a.id} className="alumno-fila" data-prueba={`alumno-${a.id}`}>
            <span className="avatar-familia" aria-hidden="true">
              {iniciales(a.nombre, a.apellidos)}
            </span>
            <span className="alumno-fila-texto">
              <Link className="enlace-tactil alumno-fila-nombre" to={`/alumnos/${a.id}`}>
                {nombreCompleto(a)}
              </Link>
              <span className="muted">
                {a.edad === null ? "" : `${a.edad} años · `}
                {a.tutores.length === 0 ? "sin adultos registrados" : a.tutores.map((t) => nombreCompleto(t)).join(", ")}
              </span>
            </span>
            <Insignia tono={ESTATUS_DE_ALUMNO[a.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_ALUMNO[a.estatus]?.texto ?? a.estatus}</Insignia>
          </li>
        ))}
      </ul>
      <AvisoDeBusquedaIncompleta paginacion={lista.datos?.paginacion} />
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
    </Pagina>
  );
}
