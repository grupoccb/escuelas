// Grupos y horarios: cupo, salón, instructor, lista de espera y los días y horas de clase. Un choque de salón o de instructor lo detecta el servidor y se muestra
// como un error claro, con qué se pisa con qué.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { coincide } from "../../lib/texto.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { DIAS, enteroDe, filaDeHorario, horariosParaApi, resumenDeHorarios, type FilaDeHorario } from "./ayudas.ts";
import { Icono } from "../../ui/Icono.tsx";
import { AccionesDeTarjeta, AvisoDeBaja, ConfirmarAccion, Regreso, useEdicion, VacioDeLista } from "./comunes.tsx";
import type { GrupoAdmin, InstructorAdmin, ProgramaAdmin, SalonAdmin } from "./tipos.ts";

function Formulario({ grupo, programas, instructores, salones, alGuardar, alCerrar }: { grupo: GrupoAdmin | null; programas: ProgramaAdmin[]; instructores: InstructorAdmin[]; salones: SalonAdmin[]; alGuardar: (nombre: string) => void; alCerrar: () => void }) {
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
  // Un choque de salón o de instructor trae el detalle de qué se pisa con qué: sale COMPLETO en el aviso del guardado (junto a los botones), no repetido junto a cada campo.
  const { salon_id: _salon, instructor_id: _instructor, ...servidor } = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  const programa = programas.find((p) => p.id === programaId);
  const delaSucursal = salones.filter((s) => programa && s.sucursal_id === programa.sucursal_id && s.activo);
  const quienes = instructores.filter((i) => i.activo && (i.sucursales.length === 0 || (programa && i.sucursales.includes(programa.sucursal_id))));
  const cambiarFila = (i: number, cambio: Partial<FilaDeHorario>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  return (
    <form
      className="formulario"
      noValidate
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
          alGuardar(comun.nombre);
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
      <fieldset className="formulario-seccion">
        <legend>Horarios</legend>
        {filas.length === 0 ? <p className="muted">Sin horarios: el grupo no aparecerá en el cotizador.</p> : null}
        {filas.map((f, i) => (
          <div key={i} className="horario-fila" data-prueba={`horario-${i}`}>
            <div className={`horario-campos${err(`horarios[${i}]`) ? " horario-con-error" : ""}`}>
              <CampoSelect etiqueta={`Día ${i + 1}`} value={f.dia} vacio="Elige" opciones={DIAS.map((d, n) => ({ valor: String(n), texto: d }))} onChange={(e) => cambiarFila(i, { dia: e.target.value })} />
              <CampoTexto etiqueta="De" type="time" value={f.inicio} onChange={(e) => cambiarFila(i, { inicio: e.target.value })} />
              <CampoTexto etiqueta="A" type="time" value={f.fin} onChange={(e) => cambiarFila(i, { fin: e.target.value })} />
            </div>
            {err(`horarios[${i}]`) ? <p className="campo-error">{err(`horarios[${i}]`)}</p> : null}
            <div>
              <Boton variante="peligro" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}>
                <Icono nombre="papelera" tamano={18} />
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
      <ErrorDeAccion error={guardar.error} enCampos={["programa_id", "nombre", "cupo_maximo", "horarios"]} />
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
  const { avisar } = useAvisos();
  const [programaId, setProgramaId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const programas = useCarga((senal) => api.get<Pag<ProgramaAdmin>>("/api/programas", { limite: 100 }, senal), []);
  const instructores = useCarga((senal) => api.get<Pag<InstructorAdmin>>("/api/instructores", { limite: 100 }, senal), []);
  const salones = useCarga((senal) => api.get<Pag<SalonAdmin>>("/api/salones", { limite: 100 }, senal), []);
  const lista = useCarga((senal) => api.get<Pag<GrupoAdmin>>("/api/grupos", { ...(programaId ? { programa_id: programaId } : {}), limite: 100, pagina }, senal), [programaId, pagina]);
  const edicion = useEdicion<GrupoAdmin>();
  const [baja, setBaja] = useState<GrupoAdmin | null>(null);
  const nombreInstructor = (id: string | null) => instructores.datos?.datos.find((i) => i.id === id)?.nombre ?? "Sin instructor";
  // V7: con muchos grupos hay que poder encontrar uno escribiendo su nombre, el del programa, el salón o el instructor (sin acentos ni mayúsculas).
  const visibles = (lista.datos?.datos ?? []).filter((g) => coincide(`${g.nombre} ${g.programa.nombre} ${g.salon?.nombre ?? ""} ${nombreInstructor(g.instructor_id)}`, busqueda));
  return (
    <Pagina titulo="Grupos y horarios" subtitulo="Cupo, salón, instructor y los días de clase." acciones={<><Regreso /><Boton variante="primario" onClick={edicion.nuevo}>Nuevo grupo</Boton></>}>
      <div className="rejilla rejilla-2 rejilla-arriba">
        <CampoSelect etiqueta="Programa" value={programaId} vacio="Todos" opciones={(programas.datos?.datos ?? []).map((p) => ({ valor: p.id, texto: p.nombre }))} onChange={(e) => { setPagina(1); setProgramaId(e.target.value); }} />
        <CampoTexto etiqueta="Buscar un grupo" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} ayuda="Por nombre, programa, salón o instructor." />
      </div>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <VacioDeLista titulo="No hay grupos con ese filtro">Prueba con otro programa, o da de alta el primero con «Nuevo grupo».</VacioDeLista> : null}
      {lista.datos && lista.datos.datos.length > 0 && visibles.length === 0 ? <VacioDeLista titulo={`Ningún grupo coincide con «${busqueda.trim()}»`} icono="buscar">Prueba con otra palabra, o borra lo escrito.</VacioDeLista> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-grupos">
        {visibles.map((g) => (
          <li key={g.id} className="item-catalogo" data-prueba={`grupo-${g.id}`}>
            <div className="item-catalogo-cabeza">
              <div className="item-catalogo-titulo">
                <strong className="nombre-tarjeta">{g.nombre}</strong>
                <Insignia tono={g.activo ? "exito" : "neutro"}>{g.activo ? "Activo" : "Inactivo"}</Insignia>
                {g.permite_lista_espera ? <Insignia tono="info">Lista de espera</Insignia> : null}
                <span className="item-catalogo-contexto">{g.programa.nombre}</span>
              </div>
              <AccionesDeTarjeta alEditar={() => edicion.editar(g)} alDarDeBaja={() => setBaja(g)} />
            </div>
            <p className="item-catalogo-destacado">
              <Icono nombre="hoy" tamano={18} />
              <span>{resumenDeHorarios(g.horarios)}</span>
            </p>
            <p className="meta-linea">
              <span className="meta-destacada">Cupo {g.cupo_maximo}</span>
              <span>{g.salon?.nombre ?? "Sin salón"}</span>
              <span>{nombreInstructor(g.instructor_id)}</span>
            </p>
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
            alGuardar={(nombre) => {
              edicion.cerrar();
              lista.recargar();
              avisar(`El grupo «${nombre}» se guardó.`);
            }}
            alCerrar={edicion.cerrar}
          />
        ) : null}
      </Dialogo>
      <ConfirmarAccion abierto={baja !== null} titulo="Dar de baja el grupo" textoDeConfirmar="Dar de baja" alCerrar={() => setBaja(null)} alConfirmar={async () => { await api.delete(`/api/grupos/${baja!.id}`); lista.recargar(); avisar(`El grupo «${baja!.nombre}» se dio de baja.`); }}>
        <AvisoDeBaja cosa="grupo" genero="m" nombre={baja?.nombre} consecuencia="Si tiene alumnos inscritos, el sistema no lo dejará: pásalos antes a otro grupo." />
      </ConfirmarAccion>
    </Pagina>
  );
}
