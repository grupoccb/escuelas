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
    <form
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
      <CampoTexto etiqueta="Fecha de nacimiento" type="date" max={hoyLocal()} value={c.fecha} onChange={(e) => setC({ ...c, fecha: e.target.value, edad: e.target.value ? "" : c.edad })} error={errores["fecha_nacimiento"]} />
      {c.fecha === "" ? <CampoTexto etiqueta="Edad (si no saben la fecha)" inputMode="numeric" value={c.edad} onChange={(e) => setC({ ...c, edad: e.target.value })} error={errores["edad"] ?? (edad === null && c.edad.trim() !== "" ? "Escribe un número" : undefined)} /> : null}
      {disciplinas.length > 1 ? <CampoSelect etiqueta="Disciplina de interés" value={c.vertical} onChange={(e) => setC({ ...c, vertical: e.target.value })} opciones={disciplinas.map((d) => ({ valor: d.id, texto: d.nombre }))} error={errores["vertical_id"]} /> : null}
      <ErrorDeAccion error={accion.error && Object.keys(errores).length === 0 ? accion.error : null} />
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
      {falta ? <p className="muted">{falta}.</p> : null}
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

export function Ninos({ lead, puedeEscribir, cotizadorEncendido, alCambiar, alCotizar }: { lead: LeadDetalle; puedeEscribir: boolean; cotizadorEncendido: boolean; alCambiar: () => void; alCotizar: (prospectoId: string) => void }) {
  const [formulario, setFormulario] = useState<{ editando: ProspectoDeLead | null } | null>(null);
  const [quitando, setQuitando] = useState<ProspectoDeLead | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const disciplinas = useDisciplinas(lead, puedeEscribir);
  const nombreDeDisciplina = (id: string) => disciplinas.find((d) => d.id === id)?.nombre;
  const variasDisciplinas = disciplinas.length > 1;

  return (
    <Tarjeta titulo="Niños" acciones={puedeEscribir ? <Boton variante="primario" onClick={() => setFormulario({ editando: null })}>Agregar otro niño</Boton> : undefined}>
      {lead.prospectos.length === 0 ? <Vacio titulo="Todavía no hay niños registrados">{puedeEscribir ? <p>Usa «Agregar otro niño» para anotar al primero.</p> : null}</Vacio> : null}
      {avisos.map((a) => (
        <Aviso key={a} tono="alerta">
          {a}
        </Aviso>
      ))}
      <ul className="lista-tarjetas" data-prueba="ninos">
        {lead.prospectos.map((p) => (
          <li key={p.id} className="tarjeta pila" data-prueba={`prospecto-${p.id}`}>
            <div className="fila fila-entre">
              <span>
                <strong>{nombreCompleto(p)}</strong>
                {p.edad !== null ? ` · ${p.edad} ${p.edad === 1 ? "año" : "años"}` : ""}
                {p.edad === null && p.fecha_nacimiento === null ? <span className="muted"> · falta la edad{puedeEscribir ? ": anótala en «Corregir»" : ""}</span> : null}
                {p.fecha_nacimiento ? ` (${formatearFecha(p.fecha_nacimiento)})` : ""}
                {variasDisciplinas || p.vertical.id !== lead.vertical.id ? ` · ${nombreDeDisciplina(p.vertical.id) ?? p.vertical.nombre}` : ""}
              </span>
              {p.alumno_id ? <Insignia tono="exito">Ya es alumno</Insignia> : <Insignia>Por inscribir</Insignia>}
            </div>
            {cotizadorEncendido && p.programa_sugerido ? <p className="muted" data-prueba={`programa-sugerido-${p.id}`}>Programa sugerido: {p.programa_sugerido.nombre}</p> : null}
            {puedeEscribir && !p.alumno_id ? (
              <div className="fila">
                {cotizadorEncendido ? <Boton onClick={() => alCotizar(p.id)} aria-label={`Cotizar a ${p.nombre ?? "este niño"}`}>Cotizar</Boton> : null}
                <Boton variante="fantasma" onClick={() => setFormulario({ editando: p })} aria-label={`Corregir los datos de ${p.nombre ?? "este niño"}`}>
                  Corregir
                </Boton>
                <Boton variante="fantasma" onClick={() => setQuitando(p)} aria-label={`Quitar a ${p.nombre ?? "este niño"}`}>
                  Quitar
                </Boton>
              </div>
            ) : null}
          </li>
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
