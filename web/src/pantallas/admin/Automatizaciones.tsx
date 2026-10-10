// Automatizaciones: los avisos que el sistema manda solo. Aquí se encienden, se les ajusta el desfase, los intentos y el horario (siempre dentro de 09:00 a 20:00
// de la sucursal: invariante 14) y se les elige la plantilla. No se crean ni se borran desde aquí.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { cantidad } from "../../lib/cantidad.ts";
import { horaDeMinutos } from "../../lib/fechas.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { DIAS, enteroDe, horarioDeEnvio } from "./ayudas.ts";
import { Regreso, useEdicion } from "./comunes.tsx";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { EVENTOS, NOMBRE_DE_MODULO, textoDeDesfase, tituloDeEvento } from "./mensajeria.ts";

interface AutomatizacionAdmin {
  id: string;
  nombre: string;
  vertical: string | null;
  sucursal: string | null;
  evento_disparador: string;
  offset_minutos: number;
  plantilla_id: string | null;
  max_intentos: number;
  espaciado_minutos: number | null;
  hora_inicio_min: number;
  hora_fin_min: number;
  dias_permitidos: number[];
  /** Hasta cuántos días de atraso se persigue (solo lead frío y pago atrasado); nulo en los demás avisos. */
  max_atraso_dias: number | null;
  activo: boolean;
  plantilla: { codigo: string; clase_mensaje: string; estado_aprobacion: string; activo: boolean } | null;
}
interface PlantillaMinima {
  id: string;
  codigo: string;
  clase_mensaje: string;
  idioma: string;
}

function Formulario({ auto, plantillas, alGuardar, alCerrar }: { auto: AutomatizacionAdmin; plantillas: PlantillaMinima[]; alGuardar: () => void; alCerrar: () => void }) {
  const evento = EVENTOS[auto.evento_disparador];
  const [offset, setOffset] = useState(String(auto.offset_minutos));
  const [intentos, setIntentos] = useState(String(auto.max_intentos));
  const [espaciado, setEspaciado] = useState(auto.espaciado_minutos === null ? "" : String(auto.espaciado_minutos));
  const [inicio, setInicio] = useState(horaDeMinutos(auto.hora_inicio_min));
  const [fin, setFin] = useState(horaDeMinutos(auto.hora_fin_min));
  const [dias, setDias] = useState<number[]>(auto.dias_permitidos);
  const [plantillaId, setPlantillaId] = useState(auto.plantilla_id ?? "");
  const topeDeAtraso = auto.evento_disparador === "lead_frio" ? 90 : auto.evento_disparador === "cargo_vencido" ? 365 : null;
  const [atraso, setAtraso] = useState(auto.max_atraso_dias === null ? "" : String(auto.max_atraso_dias));
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  const offsetN = enteroDe(offset, -86_400, 86_400);
  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const intentosN = enteroDe(intentos, 1, 10);
        const esp = espaciado.trim() === "" ? null : enteroDe(espaciado, 60, 86_400);
        const h = horarioDeEnvio(inicio, fin);
        if (offsetN === null) e["offset_minutos"] = "Escribe un número entero de minutos";
        else if (evento?.sentido === "antes" && offsetN > 0) e["offset_minutos"] = "Este aviso sale ANTES del evento: el desfase es cero o negativo";
        else if (evento?.sentido === "despues" && offsetN < 0) e["offset_minutos"] = "Este aviso sale DESPUÉS del evento: el desfase es cero o positivo";
        if (intentosN === null) e["max_intentos"] = "Escribe un número de 1 a 10";
        if (espaciado.trim() !== "" && esp === null) e["espaciado_minutos"] = "Escribe al menos 60 minutos";
        const atrasoN = topeDeAtraso === null ? null : enteroDe(atraso, 1, topeDeAtraso);
        if (topeDeAtraso !== null && atrasoN === null) e["max_atraso_dias"] = `Escribe un número de 1 a ${topeDeAtraso}`;
        if (typeof h === "string") e["hora_inicio_min"] = h;
        if (dias.length === 0) e["dias_permitidos"] = "Elige al menos un día";
        setLocal(e);
        if (Object.keys(e).length > 0 || typeof h === "string" || offsetN === null || intentosN === null) return;
        void guardar.ejecutar(async () => {
          await api.patch(`/api/automatizaciones/${auto.id}`, { offset_minutos: offsetN, max_intentos: intentosN, espaciado_minutos: esp, hora_inicio_min: h.inicio, hora_fin_min: h.fin, dias_permitidos: [...dias].sort(), plantilla_id: plantillaId === "" ? null : plantillaId, ...(atrasoN !== null ? { max_atraso_dias: atrasoN } : {}) });
          alGuardar();
        });
      }}
    >
      <p>
        <strong>{tituloDeEvento(auto.evento_disparador)}</strong>
        <br />
        <span className="muted">{auto.nombre}</span>
      </p>
      <CampoTexto etiqueta="Desfase (minutos)" inputMode="numeric" value={offset} onChange={(e) => setOffset(e.target.value)} error={err("offset_minutos")} ayuda={`${evento?.ayuda ?? ""}${offsetN !== null ? ` Ahora: ${textoDeDesfase(offsetN)}.` : ""}`} />
      <div className="rejilla rejilla-2">
        <CampoTexto etiqueta="Intentos" inputMode="numeric" value={intentos} onChange={(e) => setIntentos(e.target.value)} error={err("max_intentos")} />
        <CampoTexto etiqueta="Minutos entre intentos (opcional)" inputMode="numeric" value={espaciado} onChange={(e) => setEspaciado(e.target.value)} error={err("espaciado_minutos")} ayuda="Mínimo 60." />
      </div>
      {topeDeAtraso !== null ? (
        <CampoTexto
          etiqueta="Máximo de días de atraso que se persigue"
          inputMode="numeric"
          value={atraso}
          onChange={(e) => setAtraso(e.target.value)}
          error={err("max_atraso_dias")}
          ayuda={
            auto.evento_disparador === "lead_frio"
              ? `Solo se avisa de los leads que se enfriaron hace menos de estos días (de 1 a ${topeDeAtraso}); a los más viejos se les ve en «Estancados», pero no se les escribe.`
              : `No se manda recordatorio de un pago vencido hace más de estos días (de 1 a ${topeDeAtraso}); esos los ve el asesor en su tarea de cobranza.`
          }
        />
      ) : null}
      <div className="rejilla rejilla-2">
        <CampoTexto etiqueta="Envía desde" type="time" min="09:00" max="20:00" value={inicio} onChange={(e) => setInicio(e.target.value)} error={err("hora_inicio_min")} />
        <CampoTexto etiqueta="Envía hasta" type="time" min="09:00" max="20:00" value={fin} onChange={(e) => setFin(e.target.value)} />
      </div>
      <Aviso>Los mensajes que inicia el sistema nunca salen fuera de las 09:00 a 20:00 (hora de la sucursal). Lo que caiga fuera se recorre al siguiente horario válido; si con eso llegaría después del evento, se descarta y se registra. También vale el horario de toda la escuela (Administración → Configuración): cuenta el más corto de los dos.</Aviso>
      <fieldset className="pila sin-borde">
        <legend>
          <strong>Días en que puede salir</strong>
        </legend>
        {DIAS.map((d, n) => (
          <CampoCasilla key={d} etiqueta={d} checked={dias.includes(n)} onChange={(e) => setDias((x) => (e.target.checked ? [...x, n] : x.filter((y) => y !== n)))} />
        ))}
        {err("dias_permitidos") ? <p className="campo-error">{err("dias_permitidos")}</p> : null}
      </fieldset>
      <CampoSelect etiqueta="Plantilla" value={plantillaId} vacio="Sin plantilla (no se manda fuera de la ventana de 24 h)" opciones={plantillas.map((p) => ({ valor: p.id, texto: `${p.codigo} · ${p.idioma} · ${p.clase_mensaje === "servicio" ? "servicio" : "marketing"}` }))} onChange={(e) => setPlantillaId(e.target.value)} error={err("plantilla_id")} />
      <ErrorDeAccion error={guardar.error} enCampos={["offset_minutos", "max_intentos", "espaciado_minutos", "max_atraso_dias", "hora_inicio_min", "dias_permitidos", "plantilla_id"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function Automatizaciones() {
  useTitulo("Automatizaciones");
  const [pagina, setPagina] = useState(1);
  const lista = useCarga((senal) => api.get<Pag<AutomatizacionAdmin>>("/api/automatizaciones", { limite: 50, pagina }, senal), [pagina]);
  const plantillas = useCarga((senal) => api.get<Pag<PlantillaMinima>>("/api/plantillas", { limite: 100, activo: true }, senal), []);
  const edicion = useEdicion<AutomatizacionAdmin>();
  const alternar = useAccion();
  const { avisar } = useAvisos();
  const { moduloEncendido } = useSesion();
  return (
    <Pagina titulo="Automatizaciones" subtitulo="Los avisos que el sistema manda solo." acciones={<Regreso />}>
      <Aviso>Apagar una automatización impide que se programen envíos NUEVOS; lo que ya estaba programado sigue su curso.</Aviso>
      <ErrorDeAccion error={alternar.error} />
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="Todavía no hay automatizaciones">Las da de alta el seed del cliente.</Vacio> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-automatizaciones">
        {(lista.datos?.datos ?? []).map((a) => (
          <li key={a.id} className="tarjeta pila" data-prueba={`automatizacion-${a.id}`}>
            <div className="fila fila-entre">
              <strong>{a.nombre}</strong>
              <span className="fila">
                {EVENTOS[a.evento_disparador] && !moduloEncendido(EVENTOS[a.evento_disparador]!.modulo) ? <Insignia tono="alerta">En pausa: {NOMBRE_DE_MODULO[EVENTOS[a.evento_disparador]!.modulo]} está apagado</Insignia> : null}
                <Insignia tono={a.activo ? "exito" : "neutro"}>{a.activo ? "Encendida" : "Apagada"}</Insignia>
              </span>
            </div>
            <p className="muted">
              {tituloDeEvento(a.evento_disparador)} · {textoDeDesfase(a.offset_minutos)} · {cantidad(a.max_intentos, "intento", "intentos")} · de {horaDeMinutos(a.hora_inicio_min)} a {horaDeMinutos(a.hora_fin_min)}
              {a.vertical ? ` · ${a.vertical}` : ""}
              {a.sucursal ? ` · ${a.sucursal}` : ""}
            </p>
            <p className="muted">
              Plantilla: {a.plantilla ? `${a.plantilla.codigo} (${a.plantilla.clase_mensaje === "servicio" ? "servicio" : "marketing"}, ${a.plantilla.estado_aprobacion})` : "ninguna"}
              {a.plantilla && a.plantilla.estado_aprobacion !== "aprobada" ? " · ¡todavía no se puede mandar!" : ""}
            </p>
            <div className="fila">
              <Boton onClick={() => edicion.editar(a)}>Ajustar</Boton>
              <Boton
                disabled={alternar.ocupado}
                onClick={() =>
                  void alternar.ejecutar(async () => {
                    await api.patch(`/api/automatizaciones/${a.id}`, { activo: !a.activo });
                    lista.recargar();
                    avisar(a.activo ? `«${a.nombre}» quedó apagada: ya no se programan envíos nuevos (lo ya programado sigue su curso).` : `«${a.nombre}» quedó encendida: desde ahora se programan sus envíos.`);
                  })
                }
              >
                {a.activo ? "Apagar" : "Encender"}
              </Boton>
            </div>
          </li>
        ))}
      </ul>
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
      <Dialogo abierto={edicion.actual !== null} titulo="Ajustar la automatización" alCerrar={edicion.cerrar}>
        {edicion.actual !== null && edicion.actual !== "nuevo" ? <Formulario key={edicion.actual.id} auto={edicion.actual} plantillas={plantillas.datos?.datos ?? []} alGuardar={() => { const nombre = edicion.actual !== null && edicion.actual !== "nuevo" ? edicion.actual.nombre : ""; edicion.cerrar(); lista.recargar(); avisar(`«${nombre}» quedó guardada. Vale para los avisos que se programen de ahora en adelante.`); }} alCerrar={edicion.cerrar} /> : null}
      </Dialogo>
    </Pagina>
  );
}
