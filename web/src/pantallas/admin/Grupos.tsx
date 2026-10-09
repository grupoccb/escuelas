// Grupos y horarios: cupo, salón, instructor, lista de espera y los días y horas de clase. Un choque de salón o de instructor lo detecta el servidor y se muestra
// como un error claro, con qué se pisa con qué.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { DIAS, enteroDe, filaDeHorario, horariosParaApi, resumenDeHorarios, type FilaDeHorario } from "./ayudas.ts";
import { ConfirmarAccion, Regreso, useEdicion } from "./comunes.tsx";
import type { GrupoAdmin, InstructorAdmin, ProgramaAdmin, SalonAdmin } from "./tipos.ts";

function Formulario({ grupo, programas, instructores, salones, alGuardar, alCerrar }: { grupo: GrupoAdmin | null; programas: ProgramaAdmin[]; instructores: InstructorAdmin[]; salones: SalonAdmin[]; alGuardar: () => void; alCerrar: () => void }) {
  const [programaId, setProgramaId] = useState(grupo?.programa.id ?? "");
  const [nombre, setNombre] = useState(grupo?.nombre ?? "");
  const [cupo, setCupo] = useState(grupo ? String(grupo.cupo_maximo) : "");
  const [espera, setEspera] = useState(grupo?.permite_lista_espera ?? false);
  const [salonId, setSalonId] = useState(grupo?.salon_id ?? "");
  const [instructorId, setInstructorId] = useState(grupo?.instructor_id ?? "");
  const [filas, setFilas] = useState<FilaDeHorario[]>((grupo?.horarios ?? []).map(filaDeHorario));
  const [activo, setActivo] = useState(grupo?.activo ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  const programa = programas.find((p) => p.id === programaId);
  const delaSucursal = salones.filter((s) => programa && s.sucursal_id === programa.sucursal_id && s.activo);
  const quienes = instructores.filter((i) => i.activo && (i.sucursales.length === 0 || (programa && i.sucursales.includes(programa.sucursal_id))));
  const cambiarFila = (i: number, cambio: Partial<FilaDeHorario>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  return (
    <form
      className="formulario"
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const cupoN = enteroDe(cupo, 1, 500);
        const h = horariosParaApi(filas);
        if (grupo === null && programaId === "") e["programa_id"] = "Elige el programa";
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
        if (cupoN === null) e["cupo_maximo"] = "Escribe un cupo de 1 a 500";
        for (const [i, m] of Object.entries(h.errores)) e[`horarios[${i}]`] = m;
        setLocal(e);
        if (Object.keys(e).length > 0 || cupoN === null) return;
        const comun = { nombre: nombre.trim(), cupo_maximo: cupoN, permite_lista_espera: espera, salon_id: salonId === "" ? null : salonId, instructor_id: instructorId === "" ? null : instructorId, horarios: h.horarios, activo };
        void guardar.ejecutar(async () => {
          if (grupo) await api.patch(`/api/grupos/${grupo.id}`, comun);
          else await api.post("/api/grupos", { programa_id: programaId, ...comun });
          alGuardar();
        });
      }}
    >
      {grupo === null ? (
        <CampoSelect etiqueta="Programa" requerido value={programaId} vacio="Elige un programa" opciones={programas.filter((p) => p.activo).map((p) => ({ valor: p.id, texto: p.nombre }))} onChange={(e) => { setProgramaId(e.target.value); setSalonId(""); setInstructorId(""); }} error={err("programa_id")} />
      ) : (
        <p className="muted">Programa: {grupo.programa.nombre}</p>
      )}
      <CampoTexto etiqueta="Nombre del grupo" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoTexto etiqueta="Cupo máximo" requerido inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} error={err("cupo_maximo")} ayuda="Los lugares libres se calculan siempre con las inscripciones activas." />
      <CampoCasilla etiqueta="Permite lista de espera cuando se llena" checked={espera} onChange={(e) => setEspera(e.target.checked)} />
      <CampoSelect etiqueta="Salón" value={salonId} vacio="Sin salón asignado" opciones={delaSucursal.map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => setSalonId(e.target.value)} error={err("salon_id")} ayuda="Solo los salones de la sucursal del programa." />
      <CampoSelect etiqueta="Instructor" value={instructorId} vacio="Sin instructor asignado" opciones={quienes.map((i) => ({ valor: i.id, texto: i.nombre }))} onChange={(e) => setInstructorId(e.target.value)} error={err("instructor_id")} />
      <fieldset className="pila sin-borde">
        <legend>
          <strong>Horarios</strong>
        </legend>
        {filas.length === 0 ? <p className="muted">Sin horarios: el grupo no aparecerá en el cotizador.</p> : null}
        {filas.map((f, i) => (
          <div key={i} className="pila" data-prueba={`horario-${i}`}>
            <div className="rejilla rejilla-3">
              <CampoSelect etiqueta={`Día ${i + 1}`} value={f.dia} vacio="Elige" opciones={DIAS.map((d, n) => ({ valor: String(n), texto: d }))} onChange={(e) => cambiarFila(i, { dia: e.target.value })} />
              <CampoTexto etiqueta="De" type="time" value={f.inicio} onChange={(e) => cambiarFila(i, { inicio: e.target.value })} />
              <CampoTexto etiqueta="A" type="time" value={f.fin} onChange={(e) => cambiarFila(i, { fin: e.target.value })} />
            </div>
            {err(`horarios[${i}]`) ? <p className="campo-error">{err(`horarios[${i}]`)}</p> : null}
            <div>
              <Boton variante="fantasma" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}>
                Quitar este horario
              </Boton>
            </div>
          </div>
        ))}
        <div>
          <Boton onClick={() => setFilas((fs) => [...fs, { dia: "", inicio: "16:00", fin: "17:00" }])}>Agregar un horario</Boton>
        </div>
      </fieldset>
      <CampoCasilla etiqueta="Activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
      <ErrorDeAccion error={guardar.error} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function Grupos() {
  useTitulo("Grupos y horarios");
  const [programaId, setProgramaId] = useState("");
  const [pagina, setPagina] = useState(1);
  const programas = useCarga((senal) => api.get<Pag<ProgramaAdmin>>("/api/programas", { limite: 100 }, senal), []);
  const instructores = useCarga((senal) => api.get<Pag<InstructorAdmin>>("/api/instructores", { limite: 100 }, senal), []);
  const salones = useCarga((senal) => api.get<Pag<SalonAdmin>>("/api/salones", { limite: 100 }, senal), []);
  const lista = useCarga((senal) => api.get<Pag<GrupoAdmin>>("/api/grupos", { ...(programaId ? { programa_id: programaId } : {}), limite: 25, pagina }, senal), [programaId, pagina]);
  const edicion = useEdicion<GrupoAdmin>();
  const [baja, setBaja] = useState<GrupoAdmin | null>(null);
  const nombreInstructor = (id: string | null) => instructores.datos?.datos.find((i) => i.id === id)?.nombre ?? "Sin instructor";
  return (
    <Pagina titulo="Grupos y horarios" subtitulo="Cupo, salón, instructor y los días de clase." acciones={<><Regreso /><Boton variante="primario" onClick={edicion.nuevo}>Nuevo grupo</Boton></>}>
      <CampoSelect etiqueta="Programa" value={programaId} vacio="Todos" opciones={(programas.datos?.datos ?? []).map((p) => ({ valor: p.id, texto: p.nombre }))} onChange={(e) => { setPagina(1); setProgramaId(e.target.value); }} />
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="No hay grupos con ese filtro" /> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-grupos">
        {(lista.datos?.datos ?? []).map((g) => (
          <li key={g.id} className="tarjeta pila" data-prueba={`grupo-${g.id}`}>
            <div className="fila fila-entre">
              <strong>
                {g.nombre} <span className="muted">· {g.programa.nombre}</span>
              </strong>
              <span className="fila">
                <Insignia tono={g.activo ? "exito" : "neutro"}>{g.activo ? "Activo" : "Inactivo"}</Insignia>
                {g.permite_lista_espera ? <Insignia tono="info">Lista de espera</Insignia> : null}
              </span>
            </div>
            <p className="muted">
              Cupo {g.cupo_maximo} · {g.salon?.nombre ?? "Sin salón"} · {nombreInstructor(g.instructor_id)}
            </p>
            <p>{resumenDeHorarios(g.horarios)}</p>
            <div className="fila">
              <Boton onClick={() => edicion.editar(g)}>Editar</Boton>
              <Boton variante="peligro" onClick={() => setBaja(g)}>
                Dar de baja
              </Boton>
            </div>
          </li>
        ))}
      </ul>
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Nuevo grupo" : "Editar grupo"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? (
          <Formulario
            grupo={edicion.actual === "nuevo" ? null : edicion.actual}
            programas={programas.datos?.datos ?? []}
            instructores={instructores.datos?.datos ?? []}
            salones={salones.datos?.datos ?? []}
            alGuardar={() => {
              edicion.cerrar();
              lista.recargar();
            }}
            alCerrar={edicion.cerrar}
          />
        ) : null}
      </Dialogo>
      <ConfirmarAccion abierto={baja !== null} titulo="Dar de baja el grupo" textoDeConfirmar="Dar de baja" alCerrar={() => setBaja(null)} alConfirmar={async () => { await api.delete(`/api/grupos/${baja!.id}`); lista.recargar(); }}>
        <Aviso tono="alerta">
          Baja de <strong>{baja?.nombre}</strong>. Si tiene alumnos inscritos, pásalos antes a otro grupo.
        </Aviso>
      </ConfirmarAccion>
    </Pagina>
  );
}
