// Alumnos: buscador y tarjetas (administrador, asesor, recepción y maestro). El maestro ve solo a SUS alumnos y no puede buscar por teléfono (no ve cómo contactar a la familia).
// Cada tarjeta lleva la disciplina, la sucursal, la asistencia y la cuenta; esos datos vienen de `GET /api/alumnos/resumen` (una sola petición por página). Las píldoras de disciplina filtran en el
// servidor (`vertical_id`); «Solo con atraso o faltas» se calcula con lo que trae la página que se está viendo.

import { useState, type FormEvent } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { AvisoDeBusquedaIncompleta, Boton, Cargando, ErrorDeCarga, Pagina, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoBusqueda, CampoCasilla, CampoSelect } from "../../ui/campos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { pareceTelefono } from "../recepcion/BuscadorDeFamilia.tsx";
import { pideAtencion, subtituloDeAlumnos, type ResumenDeAlumno } from "./alumnos-vista.ts";
import { PildorasDeDisciplina } from "./PildorasDeDisciplina.tsx";
import { TarjetaDeAlumno } from "./TarjetaDeAlumno.tsx";
import type { AlumnoDeLista } from "./tipos.ts";
import { useVerticales } from "./useVerticales.ts";

const LIMITE = 20;

export default function AlumnosLista() {
  useTitulo("Alumnos");
  const { puede, sucursalId } = useSesion();
  const esMaestro = !puede("tutores:leer");
  const [escrito, setEscrito] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estatus, setEstatus] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [pagina, setPagina] = useState(1);
  const { verticales } = useVerticales();
  const lista = useCarga(
    (senal) => {
      const q = busqueda.trim();
      return api.get<Pag<AlumnoDeLista>>("/api/alumnos", { ...(q ? (pareceTelefono(q) && !esMaestro ? { telefono: q } : { nombre: q }) : {}), ...(estatus ? { estatus } : {}), ...(disciplina ? { vertical_id: disciplina } : {}), ...(sucursalId ? { sucursal_id: sucursalId } : {}), limite: LIMITE, pagina }, senal);
    },
    [busqueda, estatus, disciplina, sucursalId, pagina],
  );
  const alumnos = lista.datos?.datos ?? [];
  const ids = alumnos.map((a) => a.id).join(",");
  // Disciplina, asistencia y cuenta de las tarjetas: si no llegan, las tarjetas se quedan con lo que ya saben.
  const resumen = useCarga((senal) => api.get<{ datos: ResumenDeAlumno[] }>("/api/alumnos/resumen", { ids }, senal).then((r) => r.datos).catch(() => [] as ResumenDeAlumno[]), [ids], ids !== "");
  const resumenes = new Map((resumen.datos ?? []).map((r) => [r.alumno_id, r]));
  const esperandoResumen = soloAtencion && ids !== "" && resumen.datos === null;
  const visibles = soloAtencion ? alumnos.filter((a) => pideAtencion(resumenes.get(a.id))) : alumnos;

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setPagina(1);
    setBusqueda(escrito);
  };

  return (
    <Pagina
      titulo="Alumnos"
      subtitulo={subtituloDeAlumnos({ total: lista.datos?.paginacion.total ?? null, estatus, esMaestro })}
      acciones={
        <form noValidate className="alumnos-busqueda" onSubmit={buscar} role="search">
          <CampoBusqueda etiqueta={esMaestro ? "Nombre del alumno" : "Nombre o teléfono"} placeholder={esMaestro ? "Buscar alumno" : "Buscar alumno o familia"} autoComplete="off" value={escrito} onChange={(e) => setEscrito(e.target.value)} />
          <Boton type="submit" variante="primario">
            Buscar
          </Boton>
        </form>
      }
    >
      <div className="alumnos-filtros">
        <PildorasDeDisciplina
          verticales={verticales}
          elegida={disciplina}
          alElegir={(id) => {
            setPagina(1);
            setDisciplina(id);
          }}
        />
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
        <CampoCasilla etiqueta="Solo con atraso o faltas" checked={soloAtencion} onChange={(e) => setSoloAtencion(e.target.checked)} />
      </div>
      {soloAtencion ? <p className="muted alumnos-nota-filtro">Se revisan los alumnos de esta página ({alumnos.length}); pasa a la siguiente para ver más.</p> : null}
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {(lista.cargando && !lista.datos) || esperandoResumen ? <Cargando /> : null}
      {lista.datos && !esperandoResumen && visibles.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="No hay alumnos que coincidan" icono="buscar">Borra la búsqueda o elige «Todas».</Vacio>
        </Tarjeta>
      ) : null}
      <ul className="alumnos-rejilla" data-prueba="lista-de-alumnos">
        {esperandoResumen ? null : visibles.map((a) => <TarjetaDeAlumno key={a.id} alumno={a} resumen={resumenes.get(a.id)} />)}
      </ul>
      <AvisoDeBusquedaIncompleta paginacion={lista.datos?.paginacion} />
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
    </Pagina>
  );
}
