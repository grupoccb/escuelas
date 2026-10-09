// Programas: la oferta de una disciplina en una sucursal para un rango de edad. El traslape de edad solo se permite entre alternativas (las dos marcadas); la fecha de
// corte dice a qué día se mide la edad de quien se inscribe.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoArea, CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { enteroDe } from "./ayudas.ts";
import { ConfirmarAccion, Regreso, useEdicion } from "./comunes.tsx";
import type { ProgramaAdmin, SucursalAdmin, Vertical } from "./tipos.ts";

function Formulario({ programa, verticales, sucursales, alGuardar, alCerrar }: { programa: ProgramaAdmin | null; verticales: Vertical[]; sucursales: SucursalAdmin[]; alGuardar: () => void; alCerrar: () => void }) {
  const [verticalId, setVerticalId] = useState(programa?.vertical_id ?? "");
  const [sucursalId, setSucursalId] = useState(programa?.sucursal_id ?? "");
  const [nombre, setNombre] = useState(programa?.nombre ?? "");
  const [edadMin, setEdadMin] = useState(programa ? String(programa.edad_min) : "");
  const [edadMax, setEdadMax] = useState(programa ? String(programa.edad_max) : "");
  const [nivel, setNivel] = useState(programa?.nivel ?? "");
  const [descripcion, setDescripcion] = useState(programa?.descripcion_publica ?? "");
  const [traslape, setTraslape] = useState(programa?.permite_traslape ?? false);
  const [corte, setCorte] = useState(programa?.fecha_corte_edad ?? "");
  const [activo, setActivo] = useState(programa?.activo ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  const ofrecidas = sucursales.filter((s) => verticalId === "" || s.verticales.some((v) => v.vertical_id === verticalId && v.activo));

  return (
    <form
      className="formulario"
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const min = enteroDe(edadMin, 0, 99);
        const max = enteroDe(edadMax, 0, 99);
        if (programa === null && verticalId === "") e["vertical_id"] = "Elige la disciplina";
        if (programa === null && sucursalId === "") e["sucursal_id"] = "Elige la sucursal";
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
        if (min === null) e["edad_min"] = "Escribe una edad de 0 a 99";
        if (max === null) e["edad_max"] = "Escribe una edad de 0 a 99";
        if (min !== null && max !== null && min > max) e["edad_max"] = "La edad máxima no puede ser menor que la mínima";
        if (corte !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(corte)) e["fecha_corte_edad"] = "Elige una fecha";
        setLocal(e);
        if (Object.keys(e).length > 0 || min === null || max === null) return;
        const comun = { nombre: nombre.trim(), edad_min: min, edad_max: max, nivel: nivel.trim() === "" ? null : nivel.trim(), descripcion_publica: descripcion.trim() === "" ? null : descripcion.trim(), permite_traslape: traslape, fecha_corte_edad: corte === "" ? null : corte, activo };
        void guardar.ejecutar(async () => {
          if (programa) await api.patch(`/api/programas/${programa.id}`, comun);
          else await api.post("/api/programas", { vertical_id: verticalId, sucursal_id: sucursalId, ...comun });
          alGuardar();
        });
      }}
    >
      {programa === null ? (
        <>
          <CampoSelect etiqueta="Disciplina" requerido value={verticalId} vacio="Elige una disciplina" opciones={verticales.map((v) => ({ valor: v.id, texto: v.nombre }))} onChange={(e) => { setVerticalId(e.target.value); setSucursalId(""); }} error={err("vertical_id")} />
          <CampoSelect etiqueta="Sucursal" requerido value={sucursalId} vacio="Elige una sucursal" opciones={ofrecidas.map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => setSucursalId(e.target.value)} error={err("sucursal_id")} ayuda="Solo aparecen las sucursales que ofrecen esa disciplina (se marca en Sucursales)." />
        </>
      ) : (
        <p className="muted">La disciplina y la sucursal de un programa no cambian: sus grupos, precios e inscripciones dependen de ellas.</p>
      )}
      <CampoTexto etiqueta="Nombre del programa" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <div className="rejilla rejilla-2">
        <CampoTexto etiqueta="Edad mínima (años cumplidos)" requerido inputMode="numeric" value={edadMin} onChange={(e) => setEdadMin(e.target.value)} error={err("edad_min")} />
        <CampoTexto etiqueta="Edad máxima (años cumplidos)" requerido inputMode="numeric" value={edadMax} onChange={(e) => setEdadMax(e.target.value)} error={err("edad_max")} />
      </div>
      <CampoTexto etiqueta="Fecha de corte de la edad (opcional)" type="date" value={corte} onChange={(e) => setCorte(e.target.value)} error={err("fecha_corte_edad")} ayuda="Si la pones, la edad se mide a ese día (por ejemplo, el inicio del ciclo) y no a hoy." />
      <CampoTexto etiqueta="Nivel (opcional)" value={nivel} onChange={(e) => setNivel(e.target.value)} />
      <CampoArea etiqueta="Descripción para el público (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <CampoCasilla etiqueta="Permite traslape de edad (es una alternativa a otro programa)" checked={traslape} onChange={(e) => setTraslape(e.target.checked)} ayuda="Dos programas de la misma disciplina y sucursal pueden aceptar la misma edad solo si AMBOS lo permiten; el bot le pregunta a la familia cuál prefiere." />
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

export default function Programas() {
  useTitulo("Programas");
  const [verticalId, setVerticalId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [pagina, setPagina] = useState(1);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal), []);
  const sucursales = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), []);
  const lista = useCarga((senal) => api.get<Pag<ProgramaAdmin>>("/api/programas", { ...(verticalId ? { vertical_id: verticalId } : {}), ...(sucursalId ? { sucursal_id: sucursalId } : {}), limite: 25, pagina }, senal), [verticalId, sucursalId, pagina]);
  const edicion = useEdicion<ProgramaAdmin>();
  const [baja, setBaja] = useState<ProgramaAdmin | null>(null);
  const nombreV = (id: string) => verticales.datos?.datos.find((v) => v.id === id)?.nombre ?? "—";
  const nombreS = (id: string) => sucursales.datos?.datos.find((s) => s.id === id)?.nombre ?? "—";
  return (
    <Pagina titulo="Programas" subtitulo="Edades, fecha de corte y traslape por disciplina y sucursal." acciones={<><Regreso /><Boton variante="primario" onClick={edicion.nuevo}>Nuevo programa</Boton></>}>
      <div className="rejilla rejilla-2">
        <CampoSelect etiqueta="Disciplina" value={verticalId} vacio="Todas" opciones={(verticales.datos?.datos ?? []).map((v) => ({ valor: v.id, texto: v.nombre }))} onChange={(e) => { setPagina(1); setVerticalId(e.target.value); }} />
        <CampoSelect etiqueta="Sucursal" value={sucursalId} vacio="Todas" opciones={(sucursales.datos?.datos ?? []).map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => { setPagina(1); setSucursalId(e.target.value); }} />
      </div>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="No hay programas con ese filtro" /> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-programas">
        {(lista.datos?.datos ?? []).map((p) => (
          <li key={p.id} className="tarjeta pila" data-prueba={`programa-${p.id}`}>
            <div className="fila fila-entre">
              <strong>{p.nombre}</strong>
              <span className="fila">
                <Insignia tono={p.activo ? "exito" : "neutro"}>{p.activo ? "Activo" : "Inactivo"}</Insignia>
                {p.permite_traslape ? <Insignia tono="info">Alternativa</Insignia> : null}
              </span>
            </div>
            <p className="muted">
              {nombreV(p.vertical_id)} · {nombreS(p.sucursal_id)} · {p.edad_min} a {p.edad_max} años{p.fecha_corte_edad ? ` · edad al ${p.fecha_corte_edad}` : ""}
            </p>
            <div className="fila">
              <Boton onClick={() => edicion.editar(p)}>Editar</Boton>
              <Boton variante="peligro" onClick={() => setBaja(p)}>
                Dar de baja
              </Boton>
            </div>
          </li>
        ))}
      </ul>
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Nuevo programa" : "Editar programa"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? (
          <Formulario
            programa={edicion.actual === "nuevo" ? null : edicion.actual}
            verticales={verticales.datos?.datos ?? []}
            sucursales={sucursales.datos?.datos ?? []}
            alGuardar={() => {
              edicion.cerrar();
              lista.recargar();
            }}
            alCerrar={edicion.cerrar}
          />
        ) : null}
      </Dialogo>
      <ConfirmarAccion abierto={baja !== null} titulo="Dar de baja el programa" textoDeConfirmar="Dar de baja" alCerrar={() => setBaja(null)} alConfirmar={async () => { await api.delete(`/api/programas/${baja!.id}`); lista.recargar(); }}>
        <Aviso tono="alerta">
          Solo se puede dar de baja un programa sin grupos ni inscripciones; si los tiene, desactívalo. Baja de <strong>{baja?.nombre}</strong>.
        </Aviso>
      </ConfirmarAccion>
    </Pagina>
  );
}
