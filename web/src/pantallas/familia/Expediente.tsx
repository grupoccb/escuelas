// Expediente del alumno (`GET /api/alumnos/:id/expediente`): trayectoria, económico, operativo y comercial en una sola respuesta. Lo económico y lo comercial
// NO existen para el maestro (la API los manda en `null`): la pantalla no les deja ni la pestaña. La salud NO está aquí: tiene su propia vista, solo con permiso.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Cargando, EnlaceBoton, ErrorDeCarga, Insignia, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { AccionesDeInscripcion } from "./AccionesDeInscripcion.tsx";
import type { AlumnoDeLista, Comercial, Economico, Expediente as Datos, Operativo, Trayectoria } from "./tipos.ts";
import { ESTATUS_DE_ALUMNO, ESTATUS_DE_INSCRIPCION, TIPOS_DE_BENEFICIO, nombreCompleto, textoDeAntiguedad, textoDeElegibilidad } from "./vista.ts";

type Pestana = "trayectoria" | "economico" | "operativo" | "comercial";

function PanelTrayectoria({ t, puedeEscribir, alCambiar }: { t: Trayectoria; puedeEscribir: boolean; alCambiar: () => void }) {
  return (
    <div className="pila" data-prueba="panel-trayectoria">
      <Tarjeta titulo="Trayectoria">
        <dl className="datos">
          <dt>Inició</dt>
          <dd>{formatearFecha(t.fecha_de_inicio)}</dd>
          <dt>Antigüedad</dt>
          <dd data-prueba="antiguedad">{textoDeAntiguedad(t.antiguedad)}</dd>
          <dt>Grupo actual</dt>
          <dd data-prueba="grupo-actual">{t.grupo_actual?.nombre ?? "—"}</dd>
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Inscripciones">
        <ul className="lista-tarjetas">
          {t.inscripciones.map((i) => (
            <li key={i.id} className="pila" data-prueba={`inscripcion-${i.id}`}>
              <div className="fila fila-entre">
                <span>
                  <strong>{i.vertical.nombre}</strong> · {i.programa.nombre} · {i.grupo.nombre}
                  <br />
                  <span className="muted">
                    {i.sucursal.nombre} · desde {formatearFecha(i.fecha_inicio)}
                    {i.fecha_baja ? ` · baja ${formatearFecha(i.fecha_baja)}` : ""}
                  </span>
                </span>
                <Insignia tono={ESTATUS_DE_INSCRIPCION[i.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_INSCRIPCION[i.estatus]?.texto ?? i.estatus}</Insignia>
              </div>
              {puedeEscribir ? <AccionesDeInscripcion inscripcion={i} alCambiar={alCambiar} /> : null}
            </li>
          ))}
        </ul>
        {t.inscripciones.length === 0 ? <p className="muted">Todavía no tiene inscripciones.</p> : null}
      </Tarjeta>
      {t.historial_de_cambios_de_grupo.length > 0 ? (
        <Tarjeta titulo="Cambios de grupo">
          <ul className="lista-historial" data-prueba="historial-de-grupo">
            {t.historial_de_cambios_de_grupo.map((h, i) => (
              <li key={`${h.inscripcion_id}-${i}`}>
                {formatearFecha(h.fecha)}: de {h.grupo_anterior?.nombre ?? "—"} a {h.grupo_nuevo?.nombre ?? "—"}
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
      {t.niveles.length > 0 ? (
        <Tarjeta titulo="Avance">
          <ul className="lista-tarjetas" data-prueba="niveles">
            {t.niveles.map((n) => (
              <li key={n.vertical.id} className="fila fila-entre">
                <span>
                  {n.vertical.etiqueta_progresion ?? "Nivel"} en {n.vertical.nombre}
                </span>
                <span>
                  <strong>{n.nivel?.nombre ?? "Sin registrar"}</strong>
                  {n.fecha_obtenido ? <span className="muted"> · desde {formatearFecha(n.fecha_obtenido)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
      {t.proximo_examen.length > 0 ? (
        <Tarjeta titulo="Próximo evento">
          <ul className="lista-tarjetas" data-prueba="proximo-evento">
            {t.proximo_examen.map((p) => (
              <li key={p.vertical.id} className="pila">
                <strong>{p.vertical.etiqueta_evento ?? "Evento"}</strong>
                <span>{p.evento ? `${p.evento.nombre} · ${formatearFecha(p.evento.fecha)}` : "Sin evento próximo"}</span>
                <span className="muted">{textoDeElegibilidad(p.elegibilidad)}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </div>
  );
}

function PanelEconomico({ e }: { e: Economico }) {
  const cuenta = e.estado_de_cuenta;
  return (
    <div className="pila" data-prueba="panel-economico">
      <Tarjeta titulo="Mensualidad">
        <p>
          Vigente: <strong data-prueba="mensualidad-total">{formatear(e.mensualidad_vigente.total)}</strong>
        </p>
        <ul className="lista-tarjetas">
          {e.mensualidad_vigente.por_inscripcion.map((m) => (
            <li key={m.inscripcion_id} className="fila fila-entre">
              <span>{m.grupo}</span>
              <span className="numero">
                lista {formatear(m.precio_de_lista)}
                {m.descuento !== "0.00" ? ` − ${formatear(m.descuento)}` : ""} = <strong>{formatear(m.mensualidad)}</strong>
              </span>
            </li>
          ))}
        </ul>
        {e.dia_de_corte.map((d) => (
          <p key={d.inscripcion_id} className="muted">
            Día de corte {d.dia} · próximo corte {formatearFecha(d.proximo_corte)}
          </p>
        ))}
      </Tarjeta>
      <Tarjeta titulo="Cuenta">
        {cuenta.disponible ? (
          <dl className="datos" data-prueba="cuenta-del-alumno">
            <dt>Saldo</dt>
            <dd data-prueba="saldo">
              <strong>{formatear(cuenta.saldo)}</strong>
            </dd>
            <dt>Vencido</dt>
            <dd data-prueba="vencido">
              <strong>{formatear(cuenta.vencido)}</strong>
            </dd>
            <dt>Atraso más antiguo</dt>
            <dd>{cuenta.antiguedadCarteraVencidaDias === null ? "Sin atrasos" : `${cuenta.antiguedadCarteraVencidaDias} días`}</dd>
          </dl>
        ) : (
          <Aviso>El estado de cuenta todavía no está disponible.</Aviso>
        )}
      </Tarjeta>
      {e.promocion_aplicada.length > 0 ? (
        <Tarjeta titulo="Promoción aplicada">
          <ul className="lista-tarjetas" data-prueba="promociones">
            {e.promocion_aplicada.map((p) => (
              <li key={p.inscripcion_id} className="pila">
                <strong>{p.promocion.nombre}</strong>
                {p.beneficios.map((b, i) => (
                  <span key={i} className="muted">
                    {TIPOS_DE_BENEFICIO[b.tipo] ?? b.tipo}
                    {b.descripcion ? `: ${b.descripcion}` : ""}
                    {b.descuento !== "0.00" ? ` (${formatear(b.descuento)})` : ""} · {b.estatus}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
      {e.beneficios_pendientes.length > 0 ? (
        <Tarjeta titulo="Beneficios pendientes">
          <ul data-prueba="beneficios-pendientes">
            {e.beneficios_pendientes.map((b, i) => (
              <li key={i}>
                {b.promocion}: {TIPOS_DE_BENEFICIO[b.tipo] ?? b.tipo}
                {b.descripcion ? ` (${b.descripcion})` : ""}
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </div>
  );
}

function PanelOperativo({ o }: { o: Operativo }) {
  const a = o.asistencia;
  return (
    <div className="pila" data-prueba="panel-operativo">
      <Tarjeta titulo="Asistencia">
        <dl className="datos">
          <dt>Últimos 30 días</dt>
          <dd data-prueba="asistencia-30">
            <strong>{a.porcentaje_30_dias === null ? "—" : `${a.porcentaje_30_dias} %`}</strong>
          </dd>
          <dt>Faltas seguidas</dt>
          <dd data-prueba="racha-de-faltas">
            {a.racha_de_faltas} {a.racha_de_faltas >= a.umbral_de_faltas ? <Insignia tono="alerta">En el umbral ({a.umbral_de_faltas})</Insignia> : null}
          </dd>
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Eventos">
        {o.eventos.length === 0 ? <p className="muted">Sin eventos todavía.</p> : null}
        <ul className="lista-tarjetas">
          {o.eventos.map((e) => (
            <li key={e.evento.id} className="fila fila-entre">
              <span>
                {e.evento.nombre} · {formatearFecha(e.evento.fecha)}
              </span>
              <span className="muted">
                {e.estatus}
                {e.resultado ? ` · ${e.resultado}` : ""}
                {e.nivel_otorgado ? ` · ${e.nivel_otorgado.nombre}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta titulo="Productos comprados">
        {o.productos_comprados.disponible ? (
          o.productos_comprados.productos.length === 0 ? (
            <p className="muted">Sin compras.</p>
          ) : (
            <ul data-prueba="productos-comprados">
              {o.productos_comprados.productos.map((p, i) => (
                <li key={i}>
                  {p.cantidad} × {p.producto} · {formatearFecha(p.fecha)}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="muted">No disponible todavía.</p>
        )}
      </Tarjeta>
    </div>
  );
}

const diasPara = (c: Comercial, leadId: string): string => {
  const d = c.dias_para_cerrar.find((x) => x.lead_id === leadId);
  return d ? `${d.dias} días` : "—";
};

function PanelComercial({ c }: { c: Comercial }) {
  return (
    <div className="pila" data-prueba="panel-comercial">
      <Tarjeta titulo="Cómo llegó">
        {c.origen_del_lead.length === 0 ? <p className="muted">Sin origen registrado (alta de mostrador).</p> : null}
        {c.origen_del_lead.map((o) => (
          <dl key={o.lead_id} className="datos">
            <dt>Campaña</dt>
            <dd>{o.campana?.nombre ?? "—"}</dd>
            <dt>Canal</dt>
            <dd>{o.canal ?? "—"}</dd>
            <dt>Fuente</dt>
            <dd>{o.fuente ?? "—"}</dd>
            <dt>Código de rastreo</dt>
            <dd>{o.codigo_de_rastreo ?? "—"}</dd>
            <dt>Tardó en cerrar</dt>
            <dd>{diasPara(c, o.lead_id)}</dd>
          </dl>
        ))}
      </Tarjeta>
      <Tarjeta titulo="Hermanos inscritos">
        {c.hermanos_inscritos.length === 0 ? <p className="muted">Sin hermanos inscritos.</p> : null}
        <ul data-prueba="hermanos">
          {c.hermanos_inscritos.map((h) => (
            <li key={h.alumno_id}>
              <Link to={`/alumnos/${h.alumno_id}`}>{h.alumno}</Link> · {h.verticales.map((v) => v.nombre).join(", ")}
            </li>
          ))}
        </ul>
      </Tarjeta>
      {c.motivo_de_baja.length > 0 ? (
        <Tarjeta titulo="Bajas">
          <ul data-prueba="motivo-de-baja">
            {c.motivo_de_baja.map((b) => (
              <li key={b.inscripcion_id}>
                {formatearFecha(b.fecha_baja)}: {b.motivo?.nombre ?? "sin motivo"}
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </div>
  );
}

export default function Expediente() {
  const { id = "" } = useParams();
  const { puede } = useSesion();
  const exp = useCarga((senal) => api.get<Datos>(`/api/alumnos/${id}/expediente`, undefined, senal), [id]);
  const alumno = useCarga((senal) => api.get<AlumnoDeLista>(`/api/alumnos/${id}`, undefined, senal), [id]);
  const [pestana, setPestana] = useState<Pestana>("trayectoria");
  useTitulo(exp.datos ? `Expediente de ${nombreCompleto(exp.datos.alumno)}` : "Expediente");

  if (exp.error) return <Pagina titulo="Expediente"><ErrorDeCarga error={exp.error} alReintentar={exp.recargar} /></Pagina>;
  if (!exp.datos) return <Pagina titulo="Expediente"><Cargando /></Pagina>;
  const d = exp.datos;
  const pestanas: { id: Pestana; texto: string }[] = [
    { id: "trayectoria", texto: "Trayectoria" },
    ...(d.economico ? [{ id: "economico" as const, texto: "Económico" }] : []),
    { id: "operativo", texto: "Operativo" },
    ...(d.comercial ? [{ id: "comercial" as const, texto: "Comercial" }] : []),
  ];
  const tutorResponsable = alumno.datos?.tutores.find((t) => t.es_responsable_pago) ?? alumno.datos?.tutores[0];

  return (
    <Pagina
      titulo={nombreCompleto(d.alumno)}
      subtitulo={
        <>
          <Insignia tono={ESTATUS_DE_ALUMNO[d.alumno.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_ALUMNO[d.alumno.estatus]?.texto ?? d.alumno.estatus}</Insignia>
          {alumno.datos?.edad !== undefined && alumno.datos.edad !== null ? ` · ${alumno.datos.edad} años` : ""}
          {alumno.datos?.tutores.length ? ` · ${alumno.datos.tutores.map((t) => nombreCompleto(t)).join(", ")}` : ""}
        </>
      }
      acciones={
        <>
          {puede("tutores:leer") && tutorResponsable ? <EnlaceBoton to={`/familias/${tutorResponsable.tutor_id}`}>Ver la familia</EnlaceBoton> : null}
          {puede("salud:leer") ? <EnlaceBoton to={`/alumnos/${id}/salud`}>Salud</EnlaceBoton> : null}
        </>
      }
    >
      <div className="pestanas" role="tablist" aria-label="Secciones del expediente">
        {pestanas.map((p) => (
          <button key={p.id} type="button" role="tab" id={`pestana-${p.id}`} aria-selected={pestana === p.id} aria-controls={`panel-${p.id}`} onClick={() => setPestana(p.id)}>
            {p.texto}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`pestana-${pestana}`}>
        {pestana === "trayectoria" ? <PanelTrayectoria t={d.trayectoria} puedeEscribir={puede("inscripciones:escribir")} alCambiar={exp.recargar} /> : null}
        {pestana === "economico" && d.economico ? <PanelEconomico e={d.economico} /> : null}
        {pestana === "operativo" ? <PanelOperativo o={d.operativo} /> : null}
        {pestana === "comercial" && d.comercial ? <PanelComercial c={d.comercial} /> : null}
      </div>
    </Pagina>
  );
}
