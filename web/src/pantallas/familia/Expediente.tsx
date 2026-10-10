// Expediente del alumno (`GET /api/alumnos/:id/expediente`): trayectoria, económico, operativo y comercial en una sola respuesta. Lo económico y lo comercial
// NO existen para el maestro (la API los manda en `null`): la pantalla no les deja ni la pestaña. La salud NO está aquí: tiene su propia vista, solo con permiso.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Cargando, EnlaceBoton, ErrorDeCarga, Insignia, Pagina, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Pestanas, propsDePanel } from "../../ui/Pestanas.tsx";
import { iniciales } from "../recepcion/FamiliaElegida.tsx";
import { AccionesDeInscripcion } from "./AccionesDeInscripcion.tsx";
import type { AlumnoDeLista, Comercial, Economico, Expediente as Datos, Operativo, Trayectoria } from "./tipos.ts";
import { ESTATUS_DE_ALUMNO, ESTATUS_DE_EVENTO, ESTATUS_DE_INSCRIPCION, textoLegible, TIPOS_DE_BENEFICIO, nombreCompleto, textoDeAntiguedad, textoDeElegibilidad } from "./vista.ts";

type Pestana = "trayectoria" | "economico" | "operativo" | "comercial";

/** «0.00» → false: los importes llegan como texto del servidor, sin números flotantes. */
const hayImporte = (importe: string): boolean => !/^0+(\.0+)?$/.test(importe.trim());

function PanelTrayectoria({ t, puedeEscribir, alCambiar }: { t: Trayectoria; puedeEscribir: boolean; alCambiar: () => void }) {
  return (
    <div className="pila expediente-panel" data-prueba="panel-trayectoria">
      <div className="indicadores">
        <div className="indicador indicador-principal">
          <div>Grupo actual</div>
          <div className="indicador-valor" data-prueba="grupo-actual">
            {t.grupo_actual?.nombre ?? "—"}
          </div>
        </div>
        <div className="indicador">
          <div>Antigüedad</div>
          <div className="indicador-valor" data-prueba="antiguedad">
            {textoDeAntiguedad(t.antiguedad)}
          </div>
        </div>
        <div className="indicador">
          <div>Inició</div>
          <div className="indicador-valor">{formatearFecha(t.fecha_de_inicio)}</div>
        </div>
      </div>
      <Tarjeta titulo="Inscripciones">
        <ul className="lista-tarjetas">
          {t.inscripciones.map((i) => (
            <li key={i.id} className="pila" data-prueba={`inscripcion-${i.id}`}>
              <div className="inscripcion-cabecera">
                <span className="inscripcion-texto">
                  <span className="inscripcion-titulo">
                    <strong>{i.vertical.nombre}</strong> · {i.programa.nombre} · {i.grupo.nombre}
                  </span>
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
        {t.inscripciones.length === 0 ? <Vacio titulo="Todavía no tiene inscripciones" icono="lista" /> : null}
      </Tarjeta>
      <div className="expediente-rejilla">
        {t.niveles.length > 0 ? (
          <Tarjeta titulo="Avance">
            <ul className="lista-tarjetas" data-prueba="niveles">
              {t.niveles.map((n) => (
                <li key={n.vertical.id} className="pila">
                  <span className="muted">
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
                  {/* Sin evento próximo y sin clases requeridas no hay nada que decir: «Le faltan 0 clases (0 de 0)» confundía (V7). */}
                  {p.evento || p.elegibilidad.clases_requeridas > 0 ? <span className="muted">{textoDeElegibilidad(p.elegibilidad)}</span> : null}
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
        {t.historial_de_cambios_de_grupo.length > 0 ? (
          <Tarjeta titulo="Cambios de grupo">
            <ul className="lista-filas" data-prueba="historial-de-grupo">
              {t.historial_de_cambios_de_grupo.map((h, i) => (
                <li key={`${h.inscripcion_id}-${i}`}>
                  <span className="numero">{formatearFecha(h.fecha)}</span>: de {h.grupo_anterior?.nombre ?? "—"} a {h.grupo_nuevo?.nombre ?? "—"}
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
      </div>
    </div>
  );
}

function PanelEconomico({ e }: { e: Economico }) {
  const cuenta = e.estado_de_cuenta;
  const vencido = cuenta.disponible && hayImporte(cuenta.vencido);
  return (
    <div className="pila expediente-panel" data-prueba="panel-economico">
      {cuenta.disponible ? (
        <div className="indicadores" data-prueba="cuenta-del-alumno">
          <div className="indicador indicador-principal">
            <div>Saldo</div>
            <div className="indicador-valor" data-prueba="saldo">
              {formatear(cuenta.saldo)}
            </div>
          </div>
          <div className={vencido ? "indicador indicador-alerta" : "indicador"}>
            <div>Vencido</div>
            <div className="indicador-valor" data-prueba="vencido">
              {formatear(cuenta.vencido)}
            </div>
            <div className="indicador-nota">{cuenta.antiguedadCarteraVencidaDias === null ? "Sin atrasos" : `Atraso más antiguo: ${cuenta.antiguedadCarteraVencidaDias} días`}</div>
          </div>
          <div className="indicador">
            <div>Mensualidad vigente</div>
            <div className="indicador-valor" data-prueba="mensualidad-total">
              {formatear(e.mensualidad_vigente.total)}
            </div>
          </div>
        </div>
      ) : (
        <>
          <Aviso>El estado de cuenta todavía no está disponible.</Aviso>
          <div className="indicadores">
            <div className="indicador">
              <div>Mensualidad vigente</div>
              <div className="indicador-valor" data-prueba="mensualidad-total">
                {formatear(e.mensualidad_vigente.total)}
              </div>
            </div>
          </div>
        </>
      )}
      <Tarjeta titulo="Mensualidad">
        {e.mensualidad_vigente.por_inscripcion.length === 0 ? <Vacio titulo="Todavía no hay mensualidad vigente" icono="pagos">Aparecerá aquí cuando tenga una inscripción activa.</Vacio> : null}
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
      <div className="expediente-rejilla">
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
            <ul className="lista-filas" data-prueba="beneficios-pendientes">
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
    </div>
  );
}

function PanelOperativo({ o }: { o: Operativo }) {
  const a = o.asistencia;
  const enUmbral = a ? a.racha_de_faltas >= a.umbral_de_faltas : false;
  return (
    <div className="pila expediente-panel" data-prueba="panel-operativo">
      {a ? (
        <div className="indicadores">
          <div className="indicador indicador-principal">
            <div>Asistencia, últimos 30 días</div>
            <div className="indicador-valor" data-prueba="asistencia-30">
              {a.porcentaje_30_dias === null ? "—" : `${a.porcentaje_30_dias} %`}
            </div>
          </div>
          <div className={enUmbral ? "indicador indicador-alerta" : "indicador"}>
            <div>Faltas seguidas</div>
            <div className="indicador-valor" data-prueba="racha-de-faltas">
              {a.racha_de_faltas}
            </div>
            {enUmbral ? <div className="indicador-nota">En el umbral ({a.umbral_de_faltas})</div> : null}
          </div>
        </div>
      ) : null}
      <div className="expediente-rejilla">
        {o.eventos ? (
          <Tarjeta titulo="Eventos">
            {o.eventos.length === 0 ? <Vacio titulo="Sin eventos todavía" icono="hoy" /> : null}
            <ul className="lista-tarjetas">
              {o.eventos.map((e) => (
                <li key={e.evento.id} className="pila">
                  <strong>
                    {e.evento.nombre} · {formatearFecha(e.evento.fecha)}
                  </strong>
                  <span className="fila">
                    <Insignia tono={ESTATUS_DE_EVENTO[e.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_EVENTO[e.estatus]?.texto ?? textoLegible(e.estatus)}</Insignia>
                    <span className="muted">
                      {e.resultado ? textoLegible(e.resultado) : ""}
                      {e.nivel_otorgado ? `${e.resultado ? " · " : ""}${e.nivel_otorgado.nombre}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
        {o.productos_comprados ? (
          <Tarjeta titulo="Productos comprados">
            {o.productos_comprados.disponible ? (
              o.productos_comprados.productos.length === 0 ? (
                <Vacio titulo="Sin compras" icono="ventas" />
              ) : (
                <ul className="lista-filas" data-prueba="productos-comprados">
                  {o.productos_comprados.productos.map((p, i) => (
                    <li key={i}>
                      <span className="numero">{p.cantidad}</span> × {p.producto} · {formatearFecha(p.fecha)}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <Vacio titulo="No disponible todavía" icono="info" />
            )}
          </Tarjeta>
        ) : null}
      </div>
    </div>
  );
}

const diasPara = (c: Comercial, leadId: string): string => {
  const d = c.dias_para_cerrar.find((x) => x.lead_id === leadId);
  return d ? `${d.dias} días` : "—";
};

function PanelComercial({ c }: { c: Comercial }) {
  return (
    <div className="pila expediente-panel" data-prueba="panel-comercial">
      <div className="expediente-rejilla">
        <Tarjeta titulo="Cómo llegó">
          {c.origen_del_lead.length === 0 ? <Vacio titulo="Sin origen registrado" icono="info">Es un alta de mostrador.</Vacio> : null}
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
          {c.hermanos_inscritos.length === 0 ? <Vacio titulo="Sin hermanos inscritos" icono="alumnos" /> : null}
          <ul className="lista-filas" data-prueba="hermanos">
            {c.hermanos_inscritos.map((h) => (
              <li key={h.alumno_id}>
                <Link to={`/alumnos/${h.alumno_id}`}>{h.alumno}</Link> · {h.verticales.map((v) => v.nombre).join(", ")}
              </li>
            ))}
          </ul>
        </Tarjeta>
        {c.motivo_de_baja.length > 0 ? (
          <Tarjeta titulo="Bajas">
            <ul className="lista-filas" data-prueba="motivo-de-baja">
              {c.motivo_de_baja.map((b) => (
                <li key={b.inscripcion_id}>
                  <span className="numero">{formatearFecha(b.fecha_baja)}</span>: {b.motivo?.nombre ?? "sin motivo"}
                </li>
              ))}
            </ul>
          </Tarjeta>
        ) : null}
      </div>
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
    ...(d.operativo.asistencia || d.operativo.eventos || d.operativo.productos_comprados ? [{ id: "operativo" as const, texto: "Operativo" }] : []),
    ...(d.comercial ? [{ id: "comercial" as const, texto: "Comercial" }] : []),
  ];
  const tutorResponsable = alumno.datos?.tutores.find((t) => t.es_responsable_pago) ?? alumno.datos?.tutores[0];

  return (
    <Pagina
      titulo={nombreCompleto(d.alumno)}
      subtitulo={
        <span className="expediente-quien">
          <span className="avatar-familia" aria-hidden="true">
            {iniciales(d.alumno.nombre, d.alumno.apellidos)}
          </span>
          <Insignia tono={ESTATUS_DE_ALUMNO[d.alumno.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_ALUMNO[d.alumno.estatus]?.texto ?? d.alumno.estatus}</Insignia>
          <span>
            {alumno.datos?.edad !== undefined && alumno.datos.edad !== null ? `${alumno.datos.edad} años` : ""}
            {alumno.datos?.tutores.length ? `${alumno.datos.edad !== undefined && alumno.datos.edad !== null ? " · " : ""}${alumno.datos.tutores.map((t) => nombreCompleto(t)).join(", ")}` : ""}
          </span>
        </span>
      }
      acciones={
        <>
          {puede("tutores:leer") && tutorResponsable ? <EnlaceBoton to={`/familias/${tutorResponsable.tutor_id}`}>
              <Icono nombre="familias" tamano={18} />
              Ver la familia
            </EnlaceBoton> : null}
          {puede("salud:leer") ? <EnlaceBoton to={`/alumnos/${id}/salud`}>Salud</EnlaceBoton> : null}
        </>
      }
    >
      <div className="expediente-pestanas">
        <Pestanas nombre="expediente" etiqueta="Secciones del expediente" pestanas={pestanas} activa={pestana} alCambiar={setPestana} />
      </div>
      <div {...propsDePanel("expediente", pestana)}>
        {pestana === "trayectoria" ? <PanelTrayectoria t={d.trayectoria} puedeEscribir={puede("inscripciones:escribir")} alCambiar={exp.recargar} /> : null}
        {pestana === "economico" && d.economico ? <PanelEconomico e={d.economico} /> : null}
        {pestana === "operativo" ? <PanelOperativo o={d.operativo} /> : null}
        {pestana === "comercial" && d.comercial ? <PanelComercial c={d.comercial} /> : null}
      </div>
    </Pagina>
  );
}
