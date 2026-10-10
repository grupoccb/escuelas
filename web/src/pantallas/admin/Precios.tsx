// Precios VERSIONADOS: un precio nuevo es una vigencia nueva (la anterior se cierra el día previo). Nunca se edita el pasado: lo ya inscrito conserva su precio.
// Los importes son texto decimal exacto («1234.50»); aquí no hay números flotantes.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { formatear, normalizarCaptura } from "../../lib/dinero.ts";
import { formatearFecha, hoyLocal } from "../../lib/fechas.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Regreso } from "./comunes.tsx";
import type { PrecioAdmin, ProgramaAdmin } from "./tipos.ts";

function NuevaVigencia({ programa, alGuardar, alCerrar }: { programa: ProgramaAdmin; alGuardar: (v: { desde: string; inscripcion: string; mensualidad: string }) => void; alCerrar: () => void }) {
  const [inscripcion, setInscripcion] = useState("");
  const [mensualidad, setMensualidad] = useState("");
  const [desde, setDesde] = useState(hoyLocal());
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
        const i = normalizarCaptura(inscripcion);
        const m = normalizarCaptura(mensualidad);
        if (i === null) e["costo_inscripcion"] = "Escribe un importe válido (por ejemplo 500 o 500.50)";
        if (m === null) e["costo_mensualidad"] = "Escribe un importe válido (por ejemplo 1000 o 1000.50)";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) e["vigencia_desde"] = "Elige la fecha";
        setLocal(e);
        if (Object.keys(e).length > 0 || i === null || m === null) return;
        void guardar.ejecutar(async () => {
          await api.post("/api/precios", { programa_id: programa.id, costo_inscripcion: i, costo_mensualidad: m, vigencia_desde: desde });
          alGuardar({ desde, inscripcion: i, mensualidad: m });
        });
      }}
    >
      <p>
        Programa: <strong>{programa.nombre}</strong>
      </p>
      <Aviso>
        La vigencia anterior se cierra el día previo. Las familias ya inscritas conservan el precio con el que se inscribieron. Un precio guardado no se edita (así lo ya cobrado nunca cambia): si te equivocas, captura otro con una fecha posterior.
      </Aviso>
      <CampoTexto etiqueta="Inscripción (MXN)" requerido inputMode="decimal" value={inscripcion} onChange={(e) => setInscripcion(e.target.value)} error={err("costo_inscripcion")} />
      <CampoTexto etiqueta="Mensualidad (MXN)" requerido inputMode="decimal" value={mensualidad} onChange={(e) => setMensualidad(e.target.value)} error={err("costo_mensualidad")} />
      <CampoTexto etiqueta="Rige desde" type="date" requerido value={desde} onChange={(e) => setDesde(e.target.value)} error={err("vigencia_desde")} />
      <ErrorDeAccion error={guardar.error} enCampos={["costo_inscripcion", "costo_mensualidad", "vigencia_desde"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar la nueva vigencia
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function Precios() {
  useTitulo("Precios");
  const { avisar } = useAvisos();
  const programas = useCarga((senal) => api.get<Pag<ProgramaAdmin>>("/api/programas", { limite: 100 }, senal), []);
  const [programaId, setProgramaId] = useState("");
  const precios = useCarga((senal) => api.get<Pag<PrecioAdmin>>("/api/precios", { programa_id: programaId, limite: 100 }, senal), [programaId], programaId !== "");
  const [abierto, setAbierto] = useState(false);
  const programa = programas.datos?.datos.find((p) => p.id === programaId);
  const historial = [...(precios.datos?.datos ?? [])].sort((a, b) => (a.vigencia_desde < b.vigencia_desde ? 1 : -1));
  const hoy = hoyLocal();
  return (
    <Pagina titulo="Precios" subtitulo="Inscripción y mensualidad por programa, con vigencia." acciones={<Regreso />}>
      <CampoSelect etiqueta="Programa" value={programaId} vacio="Elige un programa" opciones={(programas.datos?.datos ?? []).map((p) => ({ valor: p.id, texto: p.nombre }))} onChange={(e) => setProgramaId(e.target.value)} />
      {programas.error ? <ErrorDeCarga error={programas.error} alReintentar={programas.recargar} /> : null}
      {programa ? (
        <Tarjeta titulo={`Historial de ${programa.nombre}`} acciones={<Boton variante="primario" onClick={() => setAbierto(true)}>Nueva vigencia</Boton>}>
          {precios.error ? <ErrorDeCarga error={precios.error} alReintentar={precios.recargar} /> : null}
          {precios.cargando && !precios.datos ? <Cargando /> : null}
          {precios.datos && historial.length === 0 ? <Vacio titulo="Este programa todavía no tiene precio">Sin precio no aparece en el cotizador ni se puede inscribir a nadie.</Vacio> : null}
          {historial.length > 0 ? (
            <div className="tabla-scroll">
              <table className="tabla" data-prueba="historial-de-precios">
                <thead>
                  <tr>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th className="derecha">Inscripción</th>
                    <th className="derecha">Mensualidad</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((p) => (
                    <tr key={p.id}>
                      <td>{formatearFecha(p.vigencia_desde)}</td>
                      <td>{p.vigencia_hasta ? formatearFecha(p.vigencia_hasta) : "Abierta"}</td>
                      <td className="derecha numero">{formatear(p.costo_inscripcion)}</td>
                      <td className="derecha numero">{formatear(p.costo_mensualidad)}</td>
                      <td>{p.vigencia_desde <= hoy && (p.vigencia_hasta === null || p.vigencia_hasta >= hoy) ? <Insignia tono="exito">Vigente</Insignia> : p.vigencia_desde > hoy ? <Insignia tono="info">Futura</Insignia> : <Insignia>Pasada</Insignia>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Tarjeta>
      ) : null}
      <Dialogo abierto={abierto} titulo="Nueva vigencia de precio" alCerrar={() => setAbierto(false)}>
        {abierto && programa ? <NuevaVigencia
            programa={programa}
            alGuardar={(v) => {
              setAbierto(false);
              precios.recargar();
              // V7: dice desde cuándo rige y qué pasa con lo ya inscrito (antes el diálogo se cerraba sin una palabra).
              avisar(`El nuevo precio de «${programa.nombre}» rige ${v.desde <= hoy ? "desde hoy" : `desde el ${formatearFecha(v.desde)}`}: inscripción ${formatear(v.inscripcion)} y mensualidad ${formatear(v.mensualidad)}. Lo ya inscrito conserva el precio con el que se inscribió.`);
            }}
            alCerrar={() => setAbierto(false)}
          /> : null}
      </Dialogo>
    </Pagina>
  );
}
