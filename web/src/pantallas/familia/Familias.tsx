// Familias (README «Familias»): el buscador (adulto, alumno o teléfono en cualquier formato) y la lista de tarjetas con los hijos en el color de su disciplina, la sucursal y el estado de la
// cuenta; y la vista «Con un solo hijo inscrito» (venta cruzada) con lo que ya toma cada familia y lo que podría probar, y su descarga en CSV.

import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { api, armarConsulta, type Pagina as Pag } from "../../api/cliente.ts";
import type { Tutor } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { AvisoDeBusquedaIncompleta, Cargando, ErrorDeCarga, Insignia, Pagina, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoBusqueda } from "../../ui/campos.tsx";
import { EtiquetaDisciplina } from "../../ui/disciplina.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Icono } from "../../ui/Icono.tsx";
import { Paginador } from "../../ui/Paginador.tsx";
import { pareceTelefono } from "../recepcion/BuscadorDeFamilia.tsx";
import { iniciales } from "../recepcion/FamiliaElegida.tsx";
import { EtiquetaDeHijo } from "./EtiquetaDeHijoEnLista.tsx";
import { FamiliaEnLista } from "./FamiliaEnLista.tsx";
import { sucursalesDeLaFamilia, textoDeConteoDeFamilias, textoDeEdad, type ResumenDeFamilia } from "./resumen-de-familia.ts";
import type { FamiliaUnSoloHijo } from "./tipos.ts";
import { useResumenDeFamilias } from "./useResumenDeFamilias.ts";
import { nombreCompleto } from "./vista.ts";

const LIMITE = 20;
/** Lo que se espera tras la última tecla antes de buscar (el prototipo filtra al escribir; el servidor compara nombres y teléfonos, así que no se le pide una búsqueda por letra). */
const ESPERA_DE_BUSQUEDA_MS = 300;

function ListaDeFamilias({ busqueda, conAtraso, alTotal }: { busqueda: string; conAtraso: boolean; alTotal: (total: number | null, buscando: boolean) => void }) {
  const { sucursalId, yo } = useSesion();
  // La página vuelve a la primera cuando cambia lo que se busca o el filtro (sin un efecto: la página elegida recuerda para qué búsqueda y filtro era).
  const [elegida, setElegida] = useState({ busqueda, conAtraso, pagina: 1 });
  const pagina = elegida.busqueda === busqueda && elegida.conAtraso === conAtraso ? elegida.pagina : 1;
  const setPagina = (n: number): void => setElegida({ busqueda, conAtraso, pagina: n });
  const lista = useCarga(
    (senal) => {
      const q = busqueda.trim();
      return api.get<Pag<Tutor>>("/api/tutores", { ...(q ? (pareceTelefono(q) ? { telefono: q } : { nombre: q }) : {}), ...(sucursalId ? { sucursal_id: sucursalId } : {}), ...(conAtraso ? { con_atraso: "true" } : {}), limite: LIMITE, pagina }, senal);
    },
    [busqueda, sucursalId, conAtraso, pagina],
  );
  const resumenes = useResumenDeFamilias((lista.datos?.datos ?? []).map((t) => t.id));
  const buscando = busqueda.trim() !== "";
  const total = lista.datos?.paginacion.total ?? null;
  useEffect(() => {
    alTotal(total, buscando);
  }, [alTotal, total, buscando]);
  const sucursalDeAlta = (t: Tutor): string | null => (t.sucursal_id ? (yo?.sucursales.find((s) => s.id === t.sucursal_id)?.nombre ?? null) : null);
  return (
    <div className="pila">
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? (
        <Tarjeta>
          {conAtraso && !buscando ? (
            <Vacio titulo="Ninguna familia tiene atraso" icono="exito">
              Ninguna familia debe un cargo que ya venció. Quita el filtro para ver todas.
            </Vacio>
          ) : (
            <Vacio titulo="No encontré a esa familia" icono="buscar">
              {conAtraso ? "Revisa el teléfono o prueba con otro nombre, o quita el filtro «Con atraso»." : "Revisa el teléfono o prueba con otro nombre."}
            </Vacio>
          )}
        </Tarjeta>
      ) : null}
      <ul className="familias-rejilla" data-prueba="lista-de-familias">
        {(lista.datos?.datos ?? []).map((t) => (
          <FamiliaEnLista key={t.id} tutor={t} resumen={resumenes.get(t.id)} sucursalDeAlta={sucursalDeAlta(t)} />
        ))}
      </ul>
      <AvisoDeBusquedaIncompleta paginacion={lista.datos?.paginacion} />
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
    </div>
  );
}

/** El color de cada disciplina de la que ya tiene al menos una inscripción activa algún hijo de la familia (por su id). */
const coloresDeDisciplinas = (r: ResumenDeFamilia | undefined): Map<string, string | null> => new Map((r?.hijos ?? []).flatMap((h) => h.inscripciones.map((i) => [i.disciplina.id, i.disciplina.color_marca] as const)));

function UnSoloHijo({ alTotal }: { alTotal: (total: number | null, buscando: boolean) => void }) {
  const { sucursalId } = useSesion();
  const [pagina, setPagina] = useState(1);
  const lista = useCarga((senal) => api.get<Pag<FamiliaUnSoloHijo>>("/api/familias/un-solo-hijo", { ...(sucursalId ? { sucursal_id: sucursalId } : {}), limite: LIMITE, pagina }, senal), [sucursalId, pagina]);
  const resumenes = useResumenDeFamilias((lista.datos?.datos ?? []).map((f) => f.tutor_id));
  const total = lista.datos?.paginacion.total ?? null;
  useEffect(() => {
    alTotal(total, false);
  }, [alTotal, total]);
  return (
    <div className="pila">
      {lista.datos && lista.datos.paginacion.total > 0 ? (
        <div className="familias-aviso" data-prueba="aviso-un-solo-hijo">
          <span>
            <strong>{lista.datos.paginacion.total === 1 ? "1 familia tiene un solo hijo inscrito." : `${lista.datos.paginacion.total} familias tienen un solo hijo inscrito.`}</strong> Se les puede ofrecer otra disciplina: aquí ves en cuáles ya están y en cuáles no.
          </span>
          <a className="boton familias-aviso-boton" href={`/api/exportaciones/familias-un-solo-hijo${armarConsulta({ sucursal_id: sucursalId ?? undefined })}`} download data-prueba="descargar-un-solo-hijo">
            <Icono nombre="descargar" tamano={18} />
            Descargar la lista (CSV)
          </a>
        </div>
      ) : null}
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="No hay familias con un solo hijo" icono="familias">
            Cuando una familia tenga un solo hijo inscrito, aparecerá aquí para ofrecerle otra disciplina.
          </Vacio>
        </Tarjeta>
      ) : null}
      <ul className="familias-rejilla" data-prueba="lista-un-solo-hijo">
        {(lista.datos?.datos ?? []).map((f) => {
          const resumen = resumenes.get(f.tutor_id);
          const colores = coloresDeDisciplinas(resumen);
          const sucursal = sucursalesDeLaFamilia(resumen, null);
          const suyo = resumen?.hijos.find((h) => h.alumno_id === f.alumno.id)?.inscripciones[0]?.disciplina ?? null;
          return (
            <li key={f.tutor_id} className="familia-tarjeta" data-prueba={`un-hijo-${f.tutor_id}`}>
              <div className="familia-tarjeta-cabeza">
                <span className="avatar-familia avatar-familia-lista" aria-hidden="true">
                  {iniciales(f.nombre, f.apellidos)}
                </span>
                <span className="familia-tarjeta-datos">
                  <Link className="familia-tarjeta-enlace" to={`/familias/${f.tutor_id}`}>
                    {nombreCompleto(f)}
                  </Link>
                  <span className="numero muted">{f.telefono}</span>
                </span>
              </div>
              <ul className="etiquetas-lista" aria-label="Hijo inscrito">
                <li>
                  <EtiquetaDeHijo etiqueta={{ clave: f.alumno.id, nombre: nombreCompleto(f.alumno), color: suyo?.color_marca ?? null, disciplina: suyo?.nombre ?? null, nota: textoDeEdad(f.alumno.edad) }} />
                </li>
              </ul>
              <div className="familia-venta">
                <div className="familia-venta-grupo">
                  <span className="etiqueta-panel">Ya está en:</span>
                  <div className="fila">
                    {f.verticales_inscritas.map((v) => (
                      <EtiquetaDisciplina key={v.id} nombre={v.nombre} color={colores.get(v.id) ?? null} />
                    ))}
                  </div>
                </div>
                <div className="familia-venta-grupo">
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
              {sucursal ? (
                <div className="familia-tarjeta-pie">
                  <span className="muted">{sucursal}</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
    </div>
  );
}

export default function Familias({ crucada = false }: { crucada?: boolean }) {
  useTitulo(crucada ? "Familias con un solo hijo" : "Familias");
  const { puede, moduloEncendido } = useSesion();
  // El filtro «Con atraso» es de cobranza: solo para quien ve el estado de cuenta y con finanzas encendido (el servidor lo exige igual). Vive en la dirección (`?con_atraso=1`) para que Tableros pueda llegar con él puesto.
  const puedeFiltrarPorAtraso = puede("estado_cuenta:leer") && moduloEncendido("finanzas");
  const navigate = useNavigate();
  const [parametros, setParametros] = useSearchParams();
  const conAtraso = !crucada && puedeFiltrarPorAtraso && parametros.get("con_atraso") === "1";
  const alternarAtraso = (): void => {
    if (crucada) navigate("/familias?con_atraso=1");
    else setParametros(conAtraso ? {} : { con_atraso: "1" });
  };
  const [conteo, setConteo] = useState<{ total: number | null; buscando: boolean }>({ total: null, buscando: false });
  const [alTotal] = useState(() => (total: number | null, buscando: boolean) => setConteo((c) => (c.total === total && c.buscando === buscando ? c : { total, buscando })));
  const [escrito, setEscrito] = useState("");
  const [busqueda, setBusqueda] = useState("");
  // Se busca al dejar de escribir (como el prototipo, que filtra al escribir); Enter busca de inmediato.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(escrito), ESPERA_DE_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [escrito]);
  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setBusqueda(escrito);
  };
  return (
    <Pagina
      titulo="Familias"
      subtitulo={conteo.total === null ? undefined : crucada ? `${conteo.total} con un solo hijo inscrito` : textoDeConteoDeFamilias(conteo.total, conteo.buscando, conAtraso)}
      acciones={
        crucada ? null : (
          <form noValidate className="familias-busqueda" onSubmit={buscar} role="search">
            <CampoBusqueda etiqueta="Teléfono o nombre de la familia" placeholder="Adulto, alumno o teléfono" autoComplete="off" inputMode="search" value={escrito} onChange={(e) => setEscrito(e.target.value)} />
          </form>
        )
      }
    >
      <div className="familias-vistas">
        <nav className="pestanas pestanas-segmentadas" aria-label="Vistas de familias">
          <Link to="/familias" className="pestana-enlace" aria-current={!crucada && !conAtraso ? "page" : undefined}>
            Todas
          </Link>
          <NavLink to="/familias/un-solo-hijo" className="pestana-enlace">
            Con un solo hijo inscrito
          </NavLink>
        </nav>
        {puedeFiltrarPorAtraso ? (
          <button type="button" className="pildora-filtro familias-pildora-atraso" aria-pressed={conAtraso} onClick={alternarAtraso}>
            Con atraso
          </button>
        ) : null}
      </div>
      {crucada ? <UnSoloHijo alTotal={alTotal} /> : <ListaDeFamilias busqueda={busqueda} conAtraso={conAtraso} alTotal={alTotal} />}
    </Pagina>
  );
}
