// La sección «Niños» de la ficha del lead (V3, segundo hijo): la lista de los niños de la familia, «Agregar otro niño» (formulario corto, pensado para escribirse mientras se habla
// con la familia), corregir y quitar con confirmación. Si el cotizador está encendido, cada niño se puede cotizar por separado y se ve su programa sugerido; apagado, no aparece nada
// de cotización. Las reglas (tope de niños, duplicados, edad) son del servidor (`/api/leads/:id/prospectos`): aquí solo se anticipan los mensajes.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import type { LeadDetalle, ProspectoDeLead } from "../../api/tipos.ts";
import { formatearFecha, hoyLocal } from "../../lib/fechas.ts";
import { aEntero } from "../../lib/numeros.ts";
import { Aviso, Boton, ErrorDeAccion, Insignia, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";

interface Disciplina {
  id: string;
  nombre: string;
}

interface Respuesta {
  id: string;
  avisos?: string[];
}

/** Lo que se escribe en el formulario (todo texto, como lo teclea la persona). */
interface Captura {
  nombre: string;
  apellidos: string;
  fecha: string;
  edad: string;
  vertical: string;
}

const vacia = (vertical: string): Captura => ({ nombre: "", apellidos: "", fecha: "", edad: "", vertical });

const nombreCompleto = (p: ProspectoDeLead): string => [p.nombre ?? "Sin nombre", p.apellidos].filter(Boolean).join(" ");

/** Las disciplinas que se pueden elegir para este lead: las de su sucursal; sin sucursal, todas las activas. */
function useDisciplinas(lead: LeadDetalle, activo: boolean): Disciplina[] {
  const sucursalId = lead.sucursal?.id ?? null;
  const carga = useCarga(
    async (senal) => {
      if (sucursalId) {
        const s = await api.get<{ verticales: { vertical_id: string; nombre: string; activo: boolean }[] }>(`/api/sucursales/${sucursalId}`, undefined, senal);
        return s.verticales.filter((v) => v.activo).map((v) => ({ id: v.vertical_id, nombre: v.nombre }));
      }
      const v = await api.get<{ datos: Disciplina[] }>("/api/verticales", { activo: true }, senal);
      return v.datos.map((x) => ({ id: x.id, nombre: x.nombre }));
    },
    [sucursalId],
    activo,
  );
  return carga.datos ?? [];
}

function FormularioDeNino({ lead, editando, disciplinas, alGuardar, alCerrar }: { lead: LeadDetalle; editando: ProspectoDeLead | null; disciplinas: Disciplina[]; alGuardar: (avisos: string[]) => void; alCerrar: () => void }) {
  const inicial = (): Captura => (editando ? { nombre: editando.nombre ?? "", apellidos: editando.apellidos ?? "", fecha: editando.fecha_nacimiento ?? "", edad: editando.fecha_nacimiento ? "" : String(editando.edad ?? ""), vertical: editando.vertical.id } : vacia(lead.vertical.id));
  const [c, setC] = useState<Captura>(inicial);
  // Una clave por intento de alta: si la respuesta se pierde y se reintenta, el servidor no agrega al niño dos veces.
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [agregados, setAgregados] = useState(0);
  const accion = useAccion();
  const edad = c.edad.trim() === "" ? null : aEntero(c.edad);
  const fechaMala = c.fecha !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha) || c.fecha > hoyLocal());
  const falta = c.nombre.trim() === "" ? "Escribe el nombre" : c.fecha === "" && c.edad.trim() === "" ? "Escribe la fecha de nacimiento o, si no la saben, la edad" : fechaMala ? "Revisa la fecha de nacimiento" : edad === null && c.edad.trim() !== "" ? "La edad es un número" : null;
  const errores = accion.error?.porCampo() ?? {};

  const guardar = (seguir: boolean) =>
    void accion.ejecutar(async () => {
      const apellidos = c.apellidos.trim();
      let r: Respuesta;
      if (editando) {
        r = await api.patch<Respuesta>(`/api/leads/${lead.id}/prospectos/${editando.id}`, {
          nombre: c.nombre.trim(),
          apellidos: apellidos === "" ? null : apellidos,
          ...(c.fecha !== "" ? { fecha_nacimiento: c.fecha } : { fecha_nacimiento: null, edad }),
          ...(c.vertical !== editando.vertical.id ? { vertical_id: c.vertical } : {}),
        });
      } else {
        r = await api.post<Respuesta>(`/api/leads/${lead.id}/prospectos`, {
          nombre: c.nombre.trim(),
          ...(apellidos !== "" ? { apellidos } : {}),
          ...(c.fecha !== "" ? { fecha_nacimiento: c.fecha } : { edad }),
          ...(c.vertical !== lead.vertical.id ? { vertical_id: c.vertical } : {}),
          clave_idempotencia: clave,
        });
      }
      alGuardar(r.avisos ?? []);
      if (seguir && !editando) {
        // «Guardar y agregar otro»: el formulario se queda abierto y limpio, con la misma disciplina.
        setC(vacia(c.vertical));
        setClave(crypto.randomUUID());
        setAgregados((n) => n + 1);
      } else {
        alCerrar();
      }
    });

  return (
    <form noValidate
      className="formulario"
      data-prueba="formulario-nino"
      onSubmit={(e) => {
        e.preventDefault();
        if (!falta) guardar(false);
      }}
    >
      {agregados > 0 ? <Aviso tono="exito">Listo, ya está en la ficha. Puedes escribir al siguiente.</Aviso> : null}
      <CampoTexto etiqueta="Nombre" value={c.nombre} onChange={(e) => setC({ ...c, nombre: e.target.value })} autoFocus autoComplete="off" requerido error={errores["nombre"]} />
      <CampoTexto etiqueta="Apellidos (opcional)" value={c.apellidos} onChange={(e) => setC({ ...c, apellidos: e.target.value })} autoComplete="off" error={errores["apellidos"]} />
      <CampoTexto etiqueta="Fecha de nacimiento" type="date" max={hoyLocal()} value={c.fecha} onChange={(e) => setC({ ...c, fecha: e.target.value, edad: e.target.value ? "" : c.edad })} error={errores["fecha_nacimiento"] ?? (fechaMala ? "Revisa la fecha de nacimiento: tiene que ser una fecha que ya pasó." : undefined)} />
      {c.fecha === "" ? <CampoTexto etiqueta="Edad (si no saben la fecha)" inputMode="numeric" value={c.edad} onChange={(e) => setC({ ...c, edad: e.target.value })} error={errores["edad"] ?? (edad === null && c.edad.trim() !== "" ? "Escribe un número" : undefined)} /> : null}
      {disciplinas.length > 1 ? <CampoSelect etiqueta="Disciplina de interés" value={c.vertical} onChange={(e) => setC({ ...c, vertical: e.target.value })} opciones={disciplinas.map((d) => ({ valor: d.id, texto: d.nombre }))} error={errores["vertical_id"]} /> : null}
      <ErrorDeAccion error={accion.error && Object.keys(errores).length === 0 ? accion.error : null} />
      {falta && !fechaMala && !(edad === null && c.edad.trim() !== "") ? <p className="campo-ayuda">{falta}.</p> : null}
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={falta !== null}>
          {editando ? "Guardar cambios" : "Guardar"}
        </Boton>
        {!editando ? (
          <Boton cargando={accion.ocupado} disabled={falta !== null} onClick={() => guardar(true)}>
            Guardar y agregar otro
          </Boton>
        ) : null}
        <Boton onClick={alCerrar}>{agregados > 0 ? "Terminar" : "Cancelar"}</Boton>
      </div>
    </form>
  );
}

function QuitarNino({ lead, nino, alCerrar, alQuitar }: { lead: LeadDetalle; nino: ProspectoDeLead | null; alCerrar: () => void; alQuitar: () => void }) {
  const accion = useAccion();
  return (
    <Dialogo abierto={nino !== null} titulo={`Quitar a ${nino?.nombre ?? "este niño"}`} alCerrar={() => { accion.limpiar(); alCerrar(); }}>
      <p>Ya no aparecerá en la ficha ni en la inscripción. Si lo agregaron por error, así se corrige; si la familia lo quiere de vuelta, se agrega otra vez.</p>
      <ErrorDeAccion error={accion.error} />
      <div className="formulario-acciones">
        <Boton
          variante="peligro"
          cargando={accion.ocupado}
          onClick={() =>
            void accion.ejecutar(async () => {
              if (!nino) return;
              await api.delete(`/api/leads/${lead.id}/prospectos/${nino.id}`);
              alQuitar();
              alCerrar();
            })
          }
        >
          Sí, quitar
        </Boton>
        <Boton onClick={() => { accion.limpiar(); alCerrar(); }}>No quitar</Boton>
      </div>
    </Dialogo>
  );
}

/** Un niño: su banda con el color de la disciplina, nombre y edad, disciplina y programa sugerido, y a la derecha su estado y sus botones. */
function FilaDeNino({ p, color, lead, variasDisciplinas, nombreDeDisciplina, puedeEscribir, cotizadorEncendido, yaCotizado, alCotizar, alCorregir, alQuitar }: { p: ProspectoDeLead; color: string | null; lead: LeadDetalle; variasDisciplinas: boolean; nombreDeDisciplina: (id: string) => string | undefined; puedeEscribir: boolean; cotizadorEncendido: boolean; yaCotizado: boolean; alCotizar: () => void; alCorregir: () => void; alQuitar: () => void }) {
  const ref = useDisciplina<HTMLLIElement>(color);
  const nombreDelNino = p.nombre ?? "este niño";
  const disciplina = nombreDeDisciplina(p.vertical.id) ?? p.vertical.nombre;
  const sugerido = cotizadorEncendido && p.programa_sugerido ? p.programa_sugerido.nombre : null;
  return (
    <li ref={ref} className="nino" data-prueba={`prospecto-${p.id}`}>
      <span className="nino-barra" aria-hidden="true" />
      <div className="nino-texto">
        <span className="nino-nombre">
          <strong>{nombreCompleto(p)}</strong>
          {p.edad !== null ? <span className="nino-edad">{` · ${p.edad} ${p.edad === 1 ? "año" : "años"}`}</span> : null}
          {p.edad === null && p.fecha_nacimiento === null ? <span className="muted"> · falta la edad{puedeEscribir ? ": anótala en «Corregir»" : ""}</span> : null}
          {p.fecha_nacimiento ? <span className="nino-edad">{` (${formatearFecha(p.fecha_nacimiento)})`}</span> : null}
        </span>
        {/* Con varias disciplinas (o una distinta a la del lead) el nombre de la disciplina sale siempre; con una sola, solo acompaña al programa sugerido. */}
        {sugerido !== null ? (
          <span className="muted nino-sub" data-prueba={`programa-sugerido-${p.id}`}>
            {disciplina} · Programa sugerido: {sugerido}
          </span>
        ) : variasDisciplinas || p.vertical.id !== lead.vertical.id ? (
          <span className="muted nino-sub">{disciplina}</span>
        ) : null}
      </div>
      <div className="nino-acciones">
        {p.alumno_id ? <Insignia tono="exito">Ya es alumno</Insignia> : <Insignia>Por inscribir</Insignia>}
        {puedeEscribir && !p.alumno_id ? (
          <>
            {cotizadorEncendido ? (
              <Boton variante={yaCotizado ? "secundario" : "sutil"} onClick={alCotizar} aria-label={yaCotizado ? `Cotizar otra vez a ${nombreDelNino}` : `Cotizar a ${nombreDelNino}`}>
                {yaCotizado ? "Cotizar otra vez" : `Cotizar a ${nombreDelNino}`}
              </Boton>
            ) : null}
            <span className="fila nino-iconos">
              <button type="button" className="boton boton-icono" title="Corregir" onClick={alCorregir} aria-label={`Corregir los datos de ${nombreDelNino}`}>
                <Icono nombre="lapiz" />
              </button>
              <button type="button" className="boton boton-icono boton-icono-peligro" title="Quitar" onClick={alQuitar} aria-label={`Quitar a ${nombreDelNino}`}>
                <Icono nombre="papelera" />
              </button>
            </span>
          </>
        ) : null}
      </div>
    </li>
  );
}

/**
 * `colorDe` da el color de una disciplina (`color_marca`, por `vertical.id`); `conCotizacion` son los niños que ya tienen una cotización (su botón dice «Cotizar otra vez»).
 */
export function Ninos({ lead, puedeEscribir, cotizadorEncendido, alCambiar, alCotizar, colorDe, conCotizacion }: { lead: LeadDetalle; puedeEscribir: boolean; cotizadorEncendido: boolean; alCambiar: () => void; alCotizar: (prospectoId: string) => void; colorDe: (verticalId: string) => string | null; conCotizacion: ReadonlySet<string> }) {
  const [formulario, setFormulario] = useState<{ editando: ProspectoDeLead | null } | null>(null);
  const [quitando, setQuitando] = useState<ProspectoDeLead | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const disciplinas = useDisciplinas(lead, puedeEscribir);
  const nombreDeDisciplina = (id: string) => disciplinas.find((d) => d.id === id)?.nombre;
  const variasDisciplinas = disciplinas.length > 1;

  return (
    <Tarjeta titulo="Niños" acciones={puedeEscribir ? <Boton onClick={() => setFormulario({ editando: null })}>Agregar otro niño</Boton> : undefined}>
      {lead.prospectos.length === 0 ? <Vacio icono="alumnos" titulo="Todavía no hay niños registrados">{puedeEscribir ? <p>Usa «Agregar otro niño» para anotar al primero.</p> : null}</Vacio> : null}
      {avisos.map((a) => (
        <Aviso key={a} tono="alerta">
          {a}
        </Aviso>
      ))}
      <ul className="ninos-lista" data-prueba="ninos">
        {lead.prospectos.map((p) => (
          <FilaDeNino
            key={p.id}
            p={p}
            color={colorDe(p.vertical.id)}
            lead={lead}
            variasDisciplinas={variasDisciplinas}
            nombreDeDisciplina={nombreDeDisciplina}
            puedeEscribir={puedeEscribir}
            cotizadorEncendido={cotizadorEncendido}
            yaCotizado={conCotizacion.has(p.id)}
            alCotizar={() => alCotizar(p.id)}
            alCorregir={() => setFormulario({ editando: p })}
            alQuitar={() => setQuitando(p)}
          />
        ))}
      </ul>

      <Dialogo abierto={formulario !== null} titulo={formulario?.editando ? `Corregir a ${formulario.editando.nombre ?? "este niño"}` : "Agregar otro niño"} alCerrar={() => setFormulario(null)}>
        {formulario ? (
          <FormularioDeNino
            lead={lead}
            editando={formulario.editando}
            disciplinas={disciplinas}
            alGuardar={(a) => {
              setAvisos(a);
              alCambiar();
            }}
            alCerrar={() => setFormulario(null)}
          />
        ) : null}
      </Dialogo>
      <QuitarNino lead={lead} nino={quitando} alCerrar={() => setQuitando(null)} alQuitar={alCambiar} />
    </Tarjeta>
  );
}
