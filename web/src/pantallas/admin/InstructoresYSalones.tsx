// Instructores (quién imparte, en qué sucursales y con qué usuario entra) y salones (de una sucursal). Un choque de salón o de instructor se detecta al asignarlos a un grupo.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { enteroDe } from "./ayudas.ts";
import { AccionesDeTarjeta, AvisoDeBaja, ConfirmarAccion, useEdicion, VacioDeLista } from "./comunes.tsx";
import { FilaDeCatalogo, ListaDeCatalogo, PaginaDeCatalogo, unir, useAlternarActivo } from "./patron.tsx";
import type { InstructorAdmin, SalonAdmin, SucursalAdmin } from "./tipos.ts";

interface UsuarioMinimo {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
}

function FormularioInstructor({ instructor, sucursales, usuarios, alGuardar, alCerrar }: { instructor: InstructorAdmin | null; sucursales: SucursalAdmin[]; usuarios: UsuarioMinimo[]; alGuardar: (nombre: string) => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(instructor?.nombre ?? "");
  const [telefono, setTelefono] = useState(instructor?.telefono ?? "");
  const [correo, setCorreo] = useState(instructor?.correo ?? "");
  const [usuarioId, setUsuarioId] = useState(instructor?.usuario_id ?? "");
  const [donde, setDonde] = useState<string[]>(instructor?.sucursales ?? []);
  const [activo, setActivo] = useState(instructor?.activo ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        const cuerpo = { nombre: nombre.trim(), telefono: telefono.trim() === "" ? null : telefono.trim(), correo: correo.trim() === "" ? null : correo.trim(), usuario_id: usuarioId === "" ? null : usuarioId, sucursales: donde, activo };
        void guardar.ejecutar(async () => {
          if (instructor) await api.patch(`/api/instructores/${instructor.id}`, cuerpo);
          else await api.post("/api/instructores", cuerpo);
          alGuardar(cuerpo.nombre);
        });
      }}
    >
      <CampoTexto etiqueta="Nombre" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoTexto etiqueta="Teléfono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} error={err("telefono")} ayuda="Para los avisos de las clases muestra." />
      <CampoTexto etiqueta="Correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} error={err("correo")} />
      <CampoSelect etiqueta="Usuario con el que entra (maestro)" value={usuarioId} vacio="Sin usuario" opciones={usuarios.filter((u) => u.rol === "maestro" && u.activo).map((u) => ({ valor: u.id, texto: u.nombre }))} onChange={(e) => setUsuarioId(e.target.value)} error={err("usuario_id")} ayuda="De ahí sale «sus grupos» en la aplicación." />
      <fieldset className="formulario-seccion">
        <legend>Sucursales donde da clases</legend>
        <p className="campo-ayuda">Sin ninguna marcada = sin restricción.</p>
        {sucursales.map((s) => (
          <CampoCasilla key={s.id} etiqueta={s.nombre} checked={donde.includes(s.id)} onChange={(e) => setDonde((d) => (e.target.checked ? [...d, s.id] : d.filter((x) => x !== s.id)))} />
        ))}
      </fieldset>
      <CampoCasilla etiqueta="Activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
      <ErrorDeAccion error={guardar.error} enCampos={["nombre", "telefono", "correo", "usuario_id"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

function FormularioSalon({ salon, sucursales, alGuardar, alCerrar }: { salon: SalonAdmin | null; sucursales: SucursalAdmin[]; alGuardar: (nombre: string) => void; alCerrar: () => void }) {
  const [sucursalId, setSucursalId] = useState(salon?.sucursal_id ?? "");
  const [nombre, setNombre] = useState(salon?.nombre ?? "");
  const [capacidad, setCapacidad] = useState(salon?.capacidad ? String(salon.capacidad) : "");
  const [activo, setActivo] = useState(salon?.activo ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const cap = capacidad.trim() === "" ? null : enteroDe(capacidad, 1, 1000);
        if (salon === null && sucursalId === "") e["sucursal_id"] = "Elige la sucursal";
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
        if (capacidad.trim() !== "" && cap === null) e["capacidad"] = "Escribe una capacidad de 1 a 1000";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        void guardar.ejecutar(async () => {
          if (salon) await api.patch(`/api/salones/${salon.id}`, { nombre: nombre.trim(), capacidad: cap, activo });
          else await api.post("/api/salones", { sucursal_id: sucursalId, nombre: nombre.trim(), capacidad: cap, activo });
          alGuardar(nombre.trim());
        });
      }}
    >
      {salon === null ? <CampoSelect etiqueta="Sucursal" requerido value={sucursalId} vacio="Elige una sucursal" opciones={sucursales.map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => setSucursalId(e.target.value)} error={err("sucursal_id")} /> : null}
      <CampoTexto etiqueta="Nombre del salón" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoTexto etiqueta="Capacidad (opcional)" inputMode="numeric" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} error={err("capacidad")} />
      <CampoCasilla etiqueta="Activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
      <ErrorDeAccion error={guardar.error} enCampos={["sucursal_id", "nombre", "capacidad"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function InstructoresYSalones() {
  useTitulo("Instructores y salones");
  const instructores = useCarga((senal) => api.get<Pag<InstructorAdmin>>("/api/instructores", { limite: 100 }, senal), []);
  const salones = useCarga((senal) => api.get<Pag<SalonAdmin>>("/api/salones", { limite: 100 }, senal), []);
  const sucursales = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), []);
  const usuarios = useCarga((senal) => api.get<Pag<UsuarioMinimo>>("/api/usuarios", { rol: "maestro", limite: 100 }, senal), []);
  const { avisar } = useAvisos();
  const edI = useEdicion<InstructorAdmin>();
  const edS = useEdicion<SalonAdmin>();
  const [bajaI, setBajaI] = useState<InstructorAdmin | null>(null);
  const [bajaS, setBajaS] = useState<SalonAdmin | null>(null);
  const nombreSucursal = (id: string) => sucursales.datos?.datos.find((s) => s.id === id)?.nombre ?? "—";
  const alternarI = useAlternarActivo(instructores.recargar);
  const alternarS = useAlternarActivo(salones.recargar);
  return (
    <PaginaDeCatalogo titulo="Instructores y salones" ayuda="Quién imparte y dónde. El sistema avisa si un salón o un instructor se pisan en dos grupos a la misma hora.">
      <ListaDeCatalogo titulo="Instructores" cuenta={instructores.datos?.datos.length} nuevo="Nuevo instructor" alNuevo={edI.nuevo}>
        {instructores.error ? <ErrorDeCarga error={instructores.error} alReintentar={instructores.recargar} /> : null}
        {instructores.cargando && !instructores.datos ? <Cargando /> : null}
        {instructores.datos && instructores.datos.datos.length === 0 ? <VacioDeLista titulo="Todavía no hay instructores">Da de alta al primero con «Nuevo instructor».</VacioDeLista> : null}
        <ErrorDeAccion error={alternarI.error} />
        <ul className="lista-filas" data-prueba="lista-de-instructores">
          {(instructores.datos?.datos ?? []).map((i) => (
            <FilaDeCatalogo
              key={i.id}
              data-prueba={`instructor-${i.id}`}
              inactiva={!i.activo}
              titulo={i.nombre}
              etiquetas={
                <>
                  {i.activo ? null : <Insignia>Inactivo</Insignia>}
                  {i.usuario_id ? <Insignia>Tiene usuario</Insignia> : null}
                </>
              }
              detalle={i.sucursales.length === 0 ? "Sin restricción de sucursal" : i.sucursales.map(nombreSucursal).join(", ")}
              acciones={
                <AccionesDeTarjeta
                  alEditar={() => edI.editar(i)}
                  activo={i.activo}
                  ocupado={alternarI.ocupado}
                  alDesactivar={() => alternarI.alternar(`/api/instructores/${i.id}`, i.activo, { desactivada: `${i.nombre} quedó desactivado como instructor.`, activada: `${i.nombre} quedó activo otra vez como instructor.` })}
                  alDarDeBaja={() => setBajaI(i)}
                />
              }
            />
          ))}
        </ul>
      </ListaDeCatalogo>
      <ListaDeCatalogo titulo="Salones" cuenta={salones.datos?.datos.length} nuevo="Nuevo salón" alNuevo={edS.nuevo} secundaria>
        {salones.error ? <ErrorDeCarga error={salones.error} alReintentar={salones.recargar} /> : null}
        {salones.cargando && !salones.datos ? <Cargando /> : null}
        {salones.datos && salones.datos.datos.length === 0 ? <VacioDeLista titulo="Todavía no hay salones">Da de alta el primero con «Nuevo salón».</VacioDeLista> : null}
        <ErrorDeAccion error={alternarS.error} />
        <ul className="lista-filas" data-prueba="lista-de-salones">
          {(salones.datos?.datos ?? []).map((s) => (
            <FilaDeCatalogo
              key={s.id}
              data-prueba={`salon-${s.id}`}
              inactiva={!s.activo}
              titulo={s.nombre}
              etiquetas={s.activo ? null : <Insignia>Inactivo</Insignia>}
              detalle={unir([nombreSucursal(s.sucursal_id), s.capacidad ? `Capacidad ${s.capacidad}` : "Sin capacidad registrada"])}
              acciones={
                <AccionesDeTarjeta
                  alEditar={() => edS.editar(s)}
                  activo={s.activo}
                  ocupado={alternarS.ocupado}
                  alDesactivar={() => alternarS.alternar(`/api/salones/${s.id}`, s.activo, { desactivada: `El salón «${s.nombre}» quedó desactivado.`, activada: `El salón «${s.nombre}» quedó activo otra vez.` })}
                  alDarDeBaja={() => setBajaS(s)}
                />
              }
            />
          ))}
        </ul>
      </ListaDeCatalogo>
      <Dialogo abierto={edI.actual !== null} titulo={edI.actual === "nuevo" ? "Nuevo instructor" : "Editar instructor"} alCerrar={edI.cerrar}>
        {edI.actual !== null ? <FormularioInstructor instructor={edI.actual === "nuevo" ? null : edI.actual} sucursales={sucursales.datos?.datos ?? []} usuarios={usuarios.datos?.datos ?? []} alGuardar={(nombre) => { edI.cerrar(); instructores.recargar(); avisar(`${nombre} se guardó como instructor.`); }} alCerrar={edI.cerrar} /> : null}
      </Dialogo>
      <Dialogo abierto={edS.actual !== null} titulo={edS.actual === "nuevo" ? "Nuevo salón" : "Editar salón"} alCerrar={edS.cerrar}>
        {edS.actual !== null ? <FormularioSalon salon={edS.actual === "nuevo" ? null : edS.actual} sucursales={sucursales.datos?.datos ?? []} alGuardar={(nombre) => { edS.cerrar(); salones.recargar(); avisar(`El salón «${nombre}» se guardó.`); }} alCerrar={edS.cerrar} /> : null}
      </Dialogo>
      <ConfirmarAccion abierto={bajaI !== null} titulo="Dar de baja al instructor" textoDeConfirmar="Dar de baja" alCerrar={() => setBajaI(null)} alConfirmar={async () => { await api.delete(`/api/instructores/${bajaI!.id}`); instructores.recargar(); avisar(`${bajaI!.nombre} se dio de baja como instructor.`); }}>
        <AvisoDeBaja cosa="instructor" genero="m" nombre={bajaI?.nombre} consecuencia="Si todavía imparte grupos, el sistema no lo dejará: cámbiales el instructor antes." />
      </ConfirmarAccion>
      <ConfirmarAccion abierto={bajaS !== null} titulo="Dar de baja el salón" textoDeConfirmar="Dar de baja" alCerrar={() => setBajaS(null)} alConfirmar={async () => { await api.delete(`/api/salones/${bajaS!.id}`); salones.recargar(); avisar(`El salón «${bajaS!.nombre}» se dio de baja.`); }}>
        <AvisoDeBaja cosa="salón" genero="m" nombre={bajaS?.nombre} consecuencia="Si algún grupo lo usa, el sistema no lo dejará: cámbiales el salón antes." />
      </ConfirmarAccion>
    </PaginaDeCatalogo>
  );
}
