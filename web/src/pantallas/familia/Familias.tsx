// Familias: buscador y lista de tutores (por teléfono en cualquier formato o por nombre) y la lista de «familias con un solo hijo» (venta cruzada).

import { useState, type FormEvent } from "react";
import { Link, NavLink } from "react-router-dom";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, AvisoDeBusquedaIncompleta, Boton, Cargando, ErrorDeCarga, Insignia, Pagina, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoBusqueda } from "../../ui/campos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { pareceTelefono } from "../recepcion/BuscadorDeFamilia.tsx";
import { iniciales } from "../recepcion/FamiliaElegida.tsx";
import type { FamiliaUnSoloHijo } from "./tipos.ts";
import { nombreCompleto } from "./vista.ts";

const LIMITE = 20;

function ListaDeFamilias() {
  const { sucursalId } = useSesion();
  const [escrito, setEscrito] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const lista = useCarga(
    (senal) => {
      const q = busqueda.trim();
      return api.get<Pag<Tutor>>("/api/tutores", { ...(q ? (pareceTelefono(q) ? { telefono: q } : { nombre: q }) : {}), ...(sucursalId ? { sucursal_id: sucursalId } : {}), limite: LIMITE, pagina }, senal);
    },
    [busqueda, sucursalId, pagina],
  );
  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setPagina(1);
    setBusqueda(escrito);
  };
  return (
    <div className="pila">
      <form noValidate className="tarjeta familia-buscador" onSubmit={buscar} role="search">
        <div className="familia-filtros familia-filtros-sin-estatus">
          <CampoBusqueda etiqueta="Teléfono o nombre de la familia" placeholder="Teléfono o nombre" autoComplete="off" inputMode="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} aria-describedby="familias-ayuda" />
          <Boton type="submit" variante="primario" className="boton-accion-celular">
            Buscar
          </Boton>
        </div>
        <p className="campo-ayuda" id="familias-ayuda">
          El teléfono puede ir con o sin lada y con espacios o guiones.
        </p>
      </form>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="No encontré a esa familia" icono="buscar">
            Revisa el teléfono o prueba con otro nombre.
          </Vacio>
        </Tarjeta>
      ) : null}
      <ul className="lista-tarjetas rejilla-tarjetas" data-prueba="lista-de-familias">
        {(lista.datos?.datos ?? []).map((t) => (
          <li key={t.id} className="alumno-fila" data-prueba={`familia-${t.id}`}>
            <span className="avatar-familia" aria-hidden="true">
              {iniciales(t.nombre, t.apellidos)}
            </span>
            <span className="alumno-fila-texto">
              <Link className="enlace-tactil alumno-fila-nombre" to={`/familias/${t.id}`}>
                {nombreCompleto(t)}
              </Link>
              <span className="muted numero">
                {t.telefono} · {t.alumnos.length === 0 ? "sin alumnos" : t.alumnos.map((a) => a.nombre).join(", ")}
              </span>
            </span>
            <Insignia>{t.alumnos.length === 1 ? "1 hijo" : `${t.alumnos.length} hijos`}</Insignia>
          </li>
        ))}
      </ul>
      <AvisoDeBusquedaIncompleta paginacion={lista.datos?.paginacion} />
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
    </div>
  );
}

function UnSoloHijo() {
  const { sucursalId } = useSesion();
  const [pagina, setPagina] = useState(1);
  const lista = useCarga((senal) => api.get<Pag<FamiliaUnSoloHijo>>("/api/familias/un-solo-hijo", { ...(sucursalId ? { sucursal_id: sucursalId } : {}), limite: LIMITE, pagina }, senal), [sucursalId, pagina]);
  return (
    <div className="pila">
      <Aviso>Familias con un solo hijo inscrito: a quienes se les puede ofrecer otra disciplina. Aparece en qué disciplinas ya están y en cuáles no.</Aviso>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="No hay familias con un solo hijo" icono="familias">
            Cuando una familia tenga un solo hijo inscrito, aparecerá aquí para ofrecerle otra disciplina.
          </Vacio>
        </Tarjeta>
      ) : null}
      <ul className="lista-tarjetas rejilla-tarjetas" data-prueba="lista-un-solo-hijo">
        {(lista.datos?.datos ?? []).map((f) => (
          <li key={f.tutor_id} className="pila" data-prueba={`un-hijo-${f.tutor_id}`}>
            <div className="alumno-fila">
              <span className="avatar-familia" aria-hidden="true">
                {iniciales(f.nombre, f.apellidos)}
              </span>
              <span className="alumno-fila-texto">
                <Link className="enlace-tactil alumno-fila-nombre" to={`/familias/${f.tutor_id}`}>
                  {nombreCompleto(f)}
                </Link>
                <span className="muted numero">
                  {f.telefono} · hijo: {nombreCompleto(f.alumno)}
                  {f.alumno.edad === null ? "" : ` (${f.alumno.edad} años)`}
                </span>
              </span>
            </div>
            <div className="familia-verticales">
              <div className="familia-vertical-grupo">
                <span className="etiqueta-panel">Ya está en:</span>
                <div className="fila">
                  {f.verticales_inscritas.map((v) => (
                    <Insignia key={v.id} tono="exito">
                      {v.nombre}
                    </Insignia>
                  ))}
                </div>
              </div>
              <div className="familia-vertical-grupo">
                <span className="etiqueta-panel">Podría probar:</span>
                <div className="fila">
                  {f.verticales_sin.length === 0 ? <span className="muted">—</span> : null}
                  {f.verticales_sin.map((v) => (
                    <Insignia key={v.id} tono={v.disponible_en_su_sucursal ? "info" : "neutro"}>
                      {v.nombre}
                      {v.disponible_en_su_sucursal ? "" : " (otra sucursal)"}
                    </Insignia>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
    </div>
  );
}

export default function Familias({ crucada = false }: { crucada?: boolean }) {
  useTitulo(crucada ? "Familias con un solo hijo" : "Familias");
  const { puede } = useSesion();
  return (
    <Pagina titulo="Familias" subtitulo={puede("estado_cuenta:leer") ? "Quién es quién en cada familia: adultos, hijos, saldo." : "Quién es quién en cada familia: adultos e hijos."}>
      <nav className="pestanas" aria-label="Vistas de familias">
        <NavLink to="/familias" end className="pestana-enlace">
          Buscar
        </NavLink>
        <NavLink to="/familias/un-solo-hijo" className="pestana-enlace">
          Con un solo hijo
        </NavLink>
      </nav>
      {crucada ? <UnSoloHijo /> : <ListaDeFamilias />}
    </Pagina>
  );
}
