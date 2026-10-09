// Familias: buscador y lista de tutores (por teléfono en cualquier formato o por nombre) y la lista de «familias con un solo hijo» (venta cruzada).

import { useState, type FormEvent } from "react";
import { Link, NavLink } from "react-router-dom";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { pareceTelefono } from "../recepcion/BuscadorDeFamilia.tsx";
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
      <form className="formulario" onSubmit={buscar} role="search">
        <CampoTexto etiqueta="Teléfono o nombre de la familia" autoComplete="off" inputMode="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} ayuda="El teléfono puede ir con o sin lada y con espacios o guiones." />
        <div>
          <Boton type="submit" variante="primario">
            Buscar
          </Boton>
        </div>
      </form>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="No encontré a esa familia">Revisa el teléfono o prueba con otro nombre.</Vacio> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-familias">
        {(lista.datos?.datos ?? []).map((t) => (
          <li key={t.id} className="tarjeta fila fila-entre" data-prueba={`familia-${t.id}`}>
            <span>
              <Link to={`/familias/${t.id}`}>
                <strong>{nombreCompleto(t)}</strong>
              </Link>
              <br />
              <span className="muted">
                {t.telefono} · {t.alumnos.length === 0 ? "sin alumnos" : t.alumnos.map((a) => a.nombre).join(", ")}
              </span>
            </span>
            <Insignia>{t.alumnos.length === 1 ? "1 hijo" : `${t.alumnos.length} hijos`}</Insignia>
          </li>
        ))}
      </ul>
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
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="No hay familias con un solo hijo" /> : null}
      <ul className="lista-tarjetas" data-prueba="lista-un-solo-hijo">
        {(lista.datos?.datos ?? []).map((f) => (
          <li key={f.tutor_id} className="tarjeta pila" data-prueba={`un-hijo-${f.tutor_id}`}>
            <div className="fila fila-entre">
              <span>
                <Link to={`/familias/${f.tutor_id}`}>
                  <strong>{nombreCompleto(f)}</strong>
                </Link>
                <br />
                <span className="muted">
                  {f.telefono} · hijo: {nombreCompleto(f.alumno)}
                  {f.alumno.edad === null ? "" : ` (${f.alumno.edad} años)`}
                </span>
              </span>
            </div>
            <div className="fila">
              <span className="muted">Ya está en:</span>
              {f.verticales_inscritas.map((v) => (
                <Insignia key={v.id} tono="exito">
                  {v.nombre}
                </Insignia>
              ))}
              <span className="muted">Podría probar:</span>
              {f.verticales_sin.length === 0 ? <span className="muted">—</span> : null}
              {f.verticales_sin.map((v) => (
                <Insignia key={v.id} tono={v.disponible_en_su_sucursal ? "info" : "neutro"}>
                  {v.nombre}
                  {v.disponible_en_su_sucursal ? "" : " (otra sucursal)"}
                </Insignia>
              ))}
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
