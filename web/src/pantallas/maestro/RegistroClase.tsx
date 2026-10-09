// El registro del alumno de una clase muestra (maestro, primero celular): TODOS los campos de la sección 8 del contexto — alumno, adultos (filas, con responsable
// de pago y quién recoge), salud y seguridad (solo con permiso), antecedentes, observación del maestro, y reglamento / imagen con su evidencia.
//
// Se guarda por secciones (cada una con su botón) o todo junto («Guardar borrador»). Lo que se escribe vive en la memoria de la página: si falla la red NO se pierde
// (el aviso lo dice y se reintenta); no se guarda en el navegador y se avisa antes de salir con cambios sin guardar. La salud va aparte (src/salud/).

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ErrorDeApi, type Pagina as PaginaDeApi } from "../../api/cliente.ts";
import type { ClaseMuestra, Grupo } from "../../api/tipos.ts";
import { ESTATUS_DE_CLASE, ESTATUS_DE_REGISTRO, INTERESES, MOTIVOS_DE_CLASE, SEXOS, TURNOS, etiquetaDeFaltante } from "../../lib/etiquetas.ts";
import { hoyLocal } from "../../lib/fechas.ts";
import { etiquetaDeSalud } from "../../salud/etiquetas.ts";
import { FormularioSalud } from "../../salud/FormularioSalud.tsx";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina } from "../../ui/basicos.tsx";
import { CampoArea, CampoCasilla, CampoSelect, CampoTexto, GrupoDeOpciones } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useAhora, useCarga, useTitulo, type Accion } from "../../ui/hooks.ts";
import { Aceptaciones } from "./Aceptaciones.tsx";
import {
  alumnoDesde,
  antecedentesDesde,
  cuerpoDeAlumno,
  cuerpoDeAntecedentes,
  cuerpoDeObservacion,
  cuerpoDeTutores,
  observacionDesde,
  tutorVacio,
  tutoresDesde,
  unirErrores,
  validarAlumno,
  validarAntecedentes,
  validarTutores,
  type Errores,
  type FormAlumno,
  type FormAntecedentes,
  type FormObservacion,
  type FormTutor,
} from "./formulario.ts";
import type { Registro } from "./tipos.ts";

type NombreDeSeccion = "alumno" | "tutores" | "antecedentes" | "observacion";
interface Ediciones {
  alumno?: FormAlumno;
  tutores?: FormTutor[];
  antecedentes?: FormAntecedentes;
  observacion?: FormObservacion;
}

const hora = (): string => new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

/** Un cuadro de las faltas que el servidor reporta (409 al completar o cerrar), con palabras de una persona. */
function ListaDeFaltas({ error }: { error: ErrorDeApi | null }) {
  if (!error) return null;
  const faltas = error.detalles.filter((d) => d.campo && d.campo !== "motivo");
  return (
    <Aviso tono="alerta" titulo={error.message}>
      {faltas.length > 0 ? (
        <ul>
          {[...new Set(faltas.map((d) => etiquetaDeFaltante(d.campo ?? "", etiquetaDeSalud) + (d.mensaje && d.mensaje !== "Falta" ? `: ${d.mensaje}` : "")))].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
    </Aviso>
  );
}

function Seccion({ id, titulo, estado, abierta, children }: { id: string; titulo: string; estado?: string | undefined; abierta?: boolean; children: React.ReactNode }) {
  return (
    <details className="tarjeta seccion-registro" open={abierta} data-prueba={`seccion-${id}`}>
      <summary>
        <span>{titulo}</span>
        {estado ? <Insignia tono={estado === "Sin guardar" ? "alerta" : "exito"}>{estado}</Insignia> : null}
      </summary>
      <div className="pila">{children}</div>
    </details>
  );
}

function PieDeSeccion({ accion, sucio, guardado, alGuardar, bloqueado }: { accion: Accion; sucio: boolean; guardado: string | undefined; alGuardar: () => void; bloqueado: boolean }) {
  return (
    <div className="pila">
      {accion.error ? (
        <Aviso tono="peligro">
          <p>{accion.error.message}</p>
          {accion.error.codigo === "sin_red" ? <p>Lo que escribiste sigue aquí. Cuando haya conexión, vuelve a guardar.</p> : null}
        </Aviso>
      ) : null}
      <div className="fila">
        <Boton variante="primario" disabled={bloqueado || !sucio} cargando={accion.ocupado} onClick={alGuardar}>
          {accion.error ? "Reintentar guardado" : "Guardar esta sección"}
        </Boton>
        {guardado && !sucio ? <span className="muted" role="status">Guardado a las {guardado}</span> : null}
        {sucio ? <span className="muted">Cambios sin guardar</span> : null}
      </div>
    </div>
  );
}

function Cuerpo({ registro, clase, grupos, poner, recargarClase }: { registro: Registro; clase: ClaseMuestra; grupos: Grupo[]; poner: (r: Registro) => void; recargarClase: () => void }) {
  const { puede, yo } = useSesion();
  const hoy = hoyLocal();
  const [ed, setEd] = useState<Ediciones>({});
  const [guardadoA, setGuardadoA] = useState<Partial<Record<NombreDeSeccion, string>>>({});
  const [erroresDelCliente, setErroresDelCliente] = useState<Partial<Record<NombreDeSeccion, Errores>>>({});
  const [confirmaCierre, setConfirmaCierre] = useState(false);
  const aAlumno = useAccion();
  const aTutores = useAccion();
  const aAntecedentes = useAccion();
  const aObservacion = useAccion();
  const aTodo = useAccion();
  const completar = useAccion();
  const cerrar = useAccion();
  const reabrir = useAccion();
  const asistencia = useAccion();

  const cerrado = registro.estatus === "cerrado";
  const alumno = ed.alumno ?? alumnoDesde(registro);
  const tutores = ed.tutores ?? tutoresDesde(registro);
  const antecedentes = ed.antecedentes ?? antecedentesDesde(registro);
  const observacion = ed.observacion ?? observacionDesde(registro);
  const sucio: Record<NombreDeSeccion, boolean> = {
    alumno: ed.alumno !== undefined && JSON.stringify(ed.alumno) !== JSON.stringify(alumnoDesde(registro)),
    tutores: ed.tutores !== undefined && JSON.stringify(ed.tutores) !== JSON.stringify(tutoresDesde(registro)),
    antecedentes: ed.antecedentes !== undefined && JSON.stringify(ed.antecedentes) !== JSON.stringify(antecedentesDesde(registro)),
    observacion: ed.observacion !== undefined && JSON.stringify(ed.observacion) !== JSON.stringify(observacionDesde(registro)),
  };
  const haySinGuardar = Object.values(sucio).some(Boolean);

  // Avisar antes de salir con cambios sin guardar (cerrar la pestaña, recargar).
  useEffect(() => {
    if (!haySinGuardar) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [haySinGuardar]);

  const acciones: Record<NombreDeSeccion, Accion> = { alumno: aAlumno, tutores: aTutores, antecedentes: aAntecedentes, observacion: aObservacion };

  async function guardar(seccion: NombreDeSeccion): Promise<boolean> {
    let errores: Errores = {};
    let cuerpo: unknown;
    if (seccion === "alumno") {
      errores = validarAlumno(alumno, hoy);
      cuerpo = { alumno: cuerpoDeAlumno(alumno) };
    } else if (seccion === "tutores") {
      errores = validarTutores(tutores);
      cuerpo = { tutores: cuerpoDeTutores(tutores) };
    } else if (seccion === "antecedentes") {
      errores = validarAntecedentes(antecedentes);
      cuerpo = { antecedentes: cuerpoDeAntecedentes(antecedentes) };
    } else {
      cuerpo = { observacion: cuerpoDeObservacion(observacion) };
    }
    setErroresDelCliente((e) => ({ ...e, [seccion]: errores }));
    if (Object.keys(errores).length > 0) return false;
    const nuevo = await acciones[seccion].ejecutar(() => api.patch<Registro>(`/api/clases-muestra/${registro.clase_muestra_id}/registro`, cuerpo));
    if (!nuevo) return false;
    poner(nuevo);
    setEd((actual) => {
      const resto = { ...actual };
      delete resto[seccion];
      return resto;
    });
    setGuardadoA((g) => ({ ...g, [seccion]: hora() }));
    return true;
  }

  async function guardarTodo() {
    await aTodo.ejecutar(async () => {
      for (const s of ["alumno", "tutores", "antecedentes", "observacion"] as const) {
        if (sucio[s] && !(await guardar(s))) throw new ErrorDeApi(0, "seccion", `Revisa la sección «${s === "alumno" ? "Alumno" : s === "tutores" ? "Adultos" : s === "antecedentes" ? "Antecedentes" : "Observación del maestro"}»: no se pudo guardar.`);
      }
    });
  }

  const errs = (s: NombreDeSeccion): Errores => unirErrores(erroresDelCliente[s] ?? {}, acciones[s].error?.porCampo() ?? {});
  const estadoDe = (s: NombreDeSeccion): string | undefined => (sucio[s] ? "Sin guardar" : guardadoA[s] ? "Guardado" : undefined);

  const cambiarTutor = (clave: string, cambio: Partial<FormTutor>) => setEd((a) => ({ ...a, tutores: (a.tutores ?? tutoresDesde(registro)).map((t) => (t.clave === clave ? { ...t, ...cambio } : t)) }));
  /** Responsable de pago y quien lo lleva son uno solo: marcar a uno desmarca al anterior. */
  const marcarUnico = (clave: string, campo: "es_responsable_pago" | "lo_lleva", valor: boolean) =>
    setEd((a) => ({ ...a, tutores: (a.tutores ?? tutoresDesde(registro)).map((t) => (t.clave === clave ? { ...t, [campo]: valor } : valor ? { ...t, [campo]: false } : t)) }));

  const ahora = useAhora();
  const empezo = new Date(clase.fecha_hora).getTime() <= ahora;
  const estatusClase = ESTATUS_DE_CLASE[clase.estatus] ?? { texto: clase.estatus, tono: "neutro" as const };
  const estatusRegistro = ESTATUS_DE_REGISTRO[registro.estatus] ?? { texto: registro.estatus, tono: "neutro" as const };
  const faltantes = [...new Set(registro.faltantes.map((f) => etiquetaDeFaltante(f, etiquetaDeSalud)))];
  const gruposDeLaVertical = grupos.filter((g) => g.activo && g.programa.vertical_id === grupos.find((x) => x.id === clase.grupo_id)?.programa.vertical_id);
  const puedeSalud = puede("salud:escribir");
  const marcar = (valor: "asistio" | "no_asistio") =>
    void asistencia.ejecutar(async () => {
      await api.patch(`/api/clases-muestra/${clase.id}/asistencia`, { estatus: valor });
      recargarClase();
    });

  return (
    <div className="pila">
      <div className="tarjeta pila">
        <div className="fila fila-entre">
          <strong>
            {clase.sesion.fecha} · {clase.sesion.hora}
          </strong>
          <span className="fila">
            <Insignia tono={estatusClase.tono}>{estatusClase.texto}</Insignia>
            <Insignia tono={estatusRegistro.tono}>Registro: {estatusRegistro.texto}</Insignia>
          </span>
        </div>
        <p className="muted">
          {clase.grupo} · {clase.programa} · {clase.sucursal}
        </p>
        {(clase.estatus === "agendada" || clase.estatus === "asistio" || clase.estatus === "no_asistio") && puede("clases_muestra:asistencia") ? (
          <div className="fila">
            <Boton disabled={!empezo || clase.estatus === "asistio" || cerrado} cargando={asistencia.ocupado} onClick={() => marcar("asistio")}>
              Asistió
            </Boton>
            <Boton disabled={!empezo || clase.estatus === "no_asistio" || cerrado} cargando={asistencia.ocupado} onClick={() => marcar("no_asistio")}>
              No asistió
            </Boton>
            {!empezo ? <span className="muted">La asistencia se marca desde la hora de la clase.</span> : null}
          </div>
        ) : null}
        <ErrorDeAccion error={asistencia.error} />
        {cerrado ? <Aviso tono="exito">Este registro está cerrado: ya no se edita.</Aviso> : null}
        {!cerrado && faltantes.length > 0 ? (
          <Aviso tono="info" titulo="Para completar el registro todavía falta">
            <ul data-prueba="faltantes">
              {faltantes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Aviso>
        ) : null}
      </div>

      <Seccion id="alumno" titulo="Alumno" estado={estadoDe("alumno")} abierta>
        <fieldset className="pila sin-borde" disabled={cerrado}>
          <CampoTexto etiqueta="Nombre" autoComplete="off" value={alumno.nombre} onChange={(e) => setEd((a) => ({ ...a, alumno: { ...alumno, nombre: e.target.value } }))} error={errs("alumno")["alumno.nombre"]} requerido />
          <CampoTexto etiqueta="Apellidos" autoComplete="off" value={alumno.apellidos} onChange={(e) => setEd((a) => ({ ...a, alumno: { ...alumno, apellidos: e.target.value } }))} error={errs("alumno")["alumno.apellidos"]} requerido />
          <CampoTexto etiqueta="Fecha de nacimiento (del acta)" type="date" max={hoy} value={alumno.fecha_nacimiento} onChange={(e) => setEd((a) => ({ ...a, alumno: { ...alumno, fecha_nacimiento: e.target.value } }))} error={errs("alumno")["alumno.fecha_nacimiento"]} requerido />
          <GrupoDeOpciones etiqueta="Sexo" valor={alumno.sexo} opciones={SEXOS} alCambiar={(v) => setEd((a) => ({ ...a, alumno: { ...alumno, sexo: v } }))} error={errs("alumno")["alumno.sexo"]} />
          <CampoTexto etiqueta="Escuela" autoComplete="off" value={alumno.escuela} onChange={(e) => setEd((a) => ({ ...a, alumno: { ...alumno, escuela: e.target.value } }))} error={errs("alumno")["alumno.escuela"]} />
          <CampoSelect etiqueta="Turno en la escuela" vacio="Sin elegir" value={alumno.turno_escolar} onChange={(e) => setEd((a) => ({ ...a, alumno: { ...alumno, turno_escolar: e.target.value } }))} opciones={TURNOS.map((t) => ({ valor: t.valor, texto: t.texto }))} error={errs("alumno")["alumno.turno_escolar"]} />
          <CampoTexto etiqueta="Talla de uniforme" autoComplete="off" value={alumno.talla_uniforme} onChange={(e) => setEd((a) => ({ ...a, alumno: { ...alumno, talla_uniforme: e.target.value } }))} error={errs("alumno")["alumno.talla_uniforme"]} />
        </fieldset>
        <PieDeSeccion accion={aAlumno} sucio={sucio.alumno} guardado={guardadoA.alumno} bloqueado={cerrado} alGuardar={() => void guardar("alumno")} />
      </Seccion>

      <Seccion id="tutores" titulo="Adultos de la familia" estado={estadoDe("tutores")}>
        <p className="muted">Un adulto por fila. Marca quién paga y quién lo lleva (uno solo de cada uno); agrega otra fila para el segundo adulto autorizado a recogerlo.</p>
        {errs("tutores")["tutores"] ? <p className="campo-error">{errs("tutores")["tutores"]}</p> : null}
        <fieldset className="pila sin-borde" disabled={cerrado}>
          {tutores.map((t, i) => {
            const p = `tutores[${i}]`;
            const e = errs("tutores");
            return (
              <div key={t.clave} className="tarjeta pila" data-prueba={`adulto-${i}`}>
                <div className="fila fila-entre">
                  <h3>Adulto {i + 1}</h3>
                  <Boton variante="fantasma" onClick={() => setEd((a) => ({ ...a, tutores: (a.tutores ?? tutoresDesde(registro)).filter((x) => x.clave !== t.clave) }))}>
                    Quitar
                  </Boton>
                </div>
                <CampoTexto etiqueta="Nombre" autoComplete="off" value={t.nombre} onChange={(ev) => cambiarTutor(t.clave, { nombre: ev.target.value })} error={e[`${p}.nombre`]} requerido />
                <CampoTexto etiqueta="Apellidos" autoComplete="off" value={t.apellidos} onChange={(ev) => cambiarTutor(t.clave, { apellidos: ev.target.value })} error={e[`${p}.apellidos`]} />
                <CampoTexto etiqueta="Parentesco" autoComplete="off" value={t.parentesco} onChange={(ev) => cambiarTutor(t.clave, { parentesco: ev.target.value })} ayuda="Madre, padre, abuela, tío…" error={e[`${p}.parentesco`]} requerido />
                <CampoTexto etiqueta="Teléfono" type="tel" inputMode="tel" autoComplete="off" value={t.telefono} onChange={(ev) => cambiarTutor(t.clave, { telefono: ev.target.value })} error={e[`${p}.telefono`]} requerido />
                <CampoTexto etiqueta="Correo" type="email" inputMode="email" autoComplete="off" value={t.correo} onChange={(ev) => cambiarTutor(t.clave, { correo: ev.target.value })} error={e[`${p}.correo`]} />
                <CampoCasilla etiqueta="Es el responsable de pago" checked={t.es_responsable_pago} onChange={(ev) => marcarUnico(t.clave, "es_responsable_pago", ev.target.checked)} />
                <CampoCasilla etiqueta="Es quien lo lleva" checked={t.lo_lleva} onChange={(ev) => marcarUnico(t.clave, "lo_lleva", ev.target.checked)} />
                <CampoCasilla etiqueta="Puede recogerlo" checked={t.puede_recoger} onChange={(ev) => cambiarTutor(t.clave, { puede_recoger: ev.target.checked })} />
              </div>
            );
          })}
          <div>
            <Boton onClick={() => setEd((a) => ({ ...a, tutores: [...(a.tutores ?? tutoresDesde(registro)), tutorVacio()] }))}>Agregar adulto</Boton>
          </div>
        </fieldset>
        <PieDeSeccion accion={aTutores} sucio={sucio.tutores} guardado={guardadoA.tutores} bloqueado={cerrado} alGuardar={() => void guardar("tutores")} />
      </Seccion>

      {puedeSalud ? (
        <Seccion id="salud" titulo="Salud y seguridad">
          <FormularioSalud registro={registro} bloqueado={cerrado} alGuardar={poner} />
        </Seccion>
      ) : (
        <Aviso>La salud y seguridad del alumno la captura el maestro del grupo o el administrador.</Aviso>
      )}

      <Seccion id="antecedentes" titulo="Antecedentes" estado={estadoDe("antecedentes")}>
        <fieldset className="pila sin-borde" disabled={cerrado}>
          <GrupoDeOpciones
            etiqueta="¿Ha practicado antes?"
            valor={antecedentes.practico_antes}
            opciones={[
              { valor: "si", texto: "Sí" },
              { valor: "no", texto: "No" },
            ]}
            alCambiar={(v) => setEd((a) => ({ ...a, antecedentes: { ...antecedentes, practico_antes: v === "si" ? "si" : "no" } }))}
            error={errs("antecedentes")["antecedentes.practico_antes"]}
          />
          {antecedentes.practico_antes === "si" ? (
            <>
              <CampoTexto etiqueta="¿Dónde practicó?" value={antecedentes.practico_donde} onChange={(e) => setEd((a) => ({ ...a, antecedentes: { ...antecedentes, practico_donde: e.target.value } }))} error={errs("antecedentes")["antecedentes.practico_donde"]} />
              <CampoTexto etiqueta="Nivel que alcanzó" value={antecedentes.practico_nivel} onChange={(e) => setEd((a) => ({ ...a, antecedentes: { ...antecedentes, practico_nivel: e.target.value } }))} error={errs("antecedentes")["antecedentes.practico_nivel"]} />
            </>
          ) : null}
          <CampoSelect etiqueta="¿Por qué quiere tomar la clase?" vacio="Sin elegir" value={antecedentes.motivo_clase} onChange={(e) => setEd((a) => ({ ...a, antecedentes: { ...antecedentes, motivo_clase: e.target.value } }))} opciones={MOTIVOS_DE_CLASE.map((m) => ({ valor: m.valor, texto: m.texto }))} error={errs("antecedentes")["antecedentes.motivo_clase"]} />
          {antecedentes.motivo_clase === "otro" ? (
            <CampoTexto etiqueta="Cuéntanos el motivo" value={antecedentes.motivo_clase_detalle} onChange={(e) => setEd((a) => ({ ...a, antecedentes: { ...antecedentes, motivo_clase_detalle: e.target.value } }))} error={errs("antecedentes")["antecedentes.motivo_clase_detalle"]} />
          ) : null}
        </fieldset>
        <PieDeSeccion accion={aAntecedentes} sucio={sucio.antecedentes} guardado={guardadoA.antecedentes} bloqueado={cerrado} alGuardar={() => void guardar("antecedentes")} />
      </Seccion>

      <Seccion id="observacion" titulo="Observación del maestro" estado={estadoDe("observacion")}>
        <fieldset className="pila sin-borde" disabled={cerrado}>
          <CampoTexto etiqueta="Nivel observado en la clase" value={observacion.nivel_observado} onChange={(e) => setEd((a) => ({ ...a, observacion: { ...observacion, nivel_observado: e.target.value } }))} error={errs("observacion")["observacion.nivel_observado"]} />
          <CampoSelect etiqueta="Grupo recomendado" vacio="Sin recomendar" value={observacion.grupo_recomendado_id} onChange={(e) => setEd((a) => ({ ...a, observacion: { ...observacion, grupo_recomendado_id: e.target.value } }))} opciones={gruposDeLaVertical.map((g) => ({ valor: g.id, texto: g.nombre }))} error={errs("observacion")["observacion.grupo_recomendado_id"]} />
          <GrupoDeOpciones etiqueta="Interés percibido" valor={observacion.interes_percibido} opciones={INTERESES} alCambiar={(v) => setEd((a) => ({ ...a, observacion: { ...observacion, interes_percibido: v } }))} error={errs("observacion")["observacion.interes_percibido"]} />
          <CampoArea etiqueta="Notas del maestro" value={observacion.notas} onChange={(e) => setEd((a) => ({ ...a, observacion: { ...observacion, notas: e.target.value } }))} ayuda="No anotes datos de salud aquí: van en su sección." error={errs("observacion")["observacion.notas"]} />
        </fieldset>
        <PieDeSeccion accion={aObservacion} sucio={sucio.observacion} guardado={guardadoA.observacion} bloqueado={cerrado} alGuardar={() => void guardar("observacion")} />
      </Seccion>

      <Seccion id="legal" titulo="Reglamento y autorización de imagen">
        <Aceptaciones claseId={registro.clase_muestra_id} tutores={registro.tutores} bloqueado={cerrado} alCambiar={() => undefined} />
      </Seccion>

      <div className="tarjeta pila" data-prueba="cierre-del-registro">
        <h2>Terminar el registro</h2>
        <ListaDeFaltas error={completar.error} />
        <ListaDeFaltas error={cerrar.error} />
        <ErrorDeAccion error={reabrir.error} />
        <div className="fila">
          {registro.estatus === "borrador" || registro.estatus === "sin_captura" ? (
            <Boton
              variante="primario"
              disabled={haySinGuardar || !registro.existe}
              cargando={completar.ocupado}
              onClick={() =>
                void completar.ejecutar(async () => {
                  poner(await api.post<Registro>(`/api/clases-muestra/${registro.clase_muestra_id}/registro/completar`));
                })
              }
            >
              Marcar registro como completo
            </Boton>
          ) : null}
          {registro.estatus === "completo" ? (
            <Boton variante="primario" cargando={cerrar.ocupado} onClick={() => setConfirmaCierre(true)}>
              Cerrar registro
            </Boton>
          ) : null}
          {registro.estatus === "cerrado" && puede("registro_muestra:reabrir") ? (
            <Boton
              cargando={reabrir.ocupado}
              onClick={() =>
                void reabrir.ejecutar(async () => {
                  poner(await api.post<Registro>(`/api/clases-muestra/${registro.clase_muestra_id}/registro/reabrir`));
                })
              }
            >
              Reabrir registro
            </Boton>
          ) : null}
        </div>
        {haySinGuardar && !cerrado ? <p className="muted">Guarda los cambios antes de marcar el registro como completo.</p> : null}
        {yo?.usuario.rol === "asesor" ? <p className="muted">El asesor puede capturar todo menos la salud; el registro queda completo cuando el maestro o el administrador la capturan.</p> : null}
      </div>

      {!cerrado ? (
        <div className="barra-guardado">
          <span className="muted" role="status">
            {aTodo.error ? aTodo.error.message : haySinGuardar ? "Tienes cambios sin guardar." : "Todo guardado."}
          </span>
          <Boton variante="primario" disabled={!haySinGuardar} cargando={aTodo.ocupado} onClick={() => void guardarTodo()}>
            Guardar borrador
          </Boton>
        </div>
      ) : null}

      <Dialogo abierto={confirmaCierre} titulo="¿Cerrar el registro?" alCerrar={() => setConfirmaCierre(false)}>
        <p>Al cerrarlo ya no se puede editar (solo el administrador puede reabrirlo). Se exige que la familia haya aceptado el reglamento.</p>
        <div className="formulario-acciones">
          <Boton
            variante="primario"
            cargando={cerrar.ocupado}
            onClick={() =>
              void cerrar.ejecutar(async () => {
                poner(await api.post<Registro>(`/api/clases-muestra/${registro.clase_muestra_id}/registro/cerrar`));
                setConfirmaCierre(false);
              })
            }
          >
            Sí, cerrar
          </Boton>
          <Boton onClick={() => setConfirmaCierre(false)}>Todavía no</Boton>
        </div>
      </Dialogo>
    </div>
  );
}

export default function RegistroClase() {
  useTitulo("Registro del alumno");
  const { id = "" } = useParams();
  const registro = useCarga((senal) => api.get<Registro>(`/api/clases-muestra/${id}/registro`, undefined, senal), [id]);
  const clase = useCarga((senal) => api.get<ClaseMuestra>(`/api/clases-muestra/${id}`, undefined, senal), [id]);
  const grupos = useCarga((senal) => api.get<PaginaDeApi<Grupo>>("/api/grupos", { limite: 100 }, senal), []);
  const error = registro.error ?? clase.error ?? grupos.error;
  return (
    <Pagina titulo="Registro del alumno" subtitulo={<Link to="/hoy">← Volver a «Hoy»</Link>}>
      {error ? <ErrorDeCarga error={error} alReintentar={() => { registro.recargar(); clase.recargar(); grupos.recargar(); }} /> : null}
      {!registro.datos || !clase.datos || !grupos.datos ? (
        error ? null : <Cargando />
      ) : (
        <Cuerpo registro={registro.datos} clase={clase.datos} grupos={grupos.datos.datos} poner={registro.poner} recargarClase={() => { clase.recargar(); registro.recargar(); }} />
      )}
    </Pagina>
  );
}
