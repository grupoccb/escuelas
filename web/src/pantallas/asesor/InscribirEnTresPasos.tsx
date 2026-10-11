// «Inscribir a …» desde el embudo, en 3 pasos (R2b): Alumno (lo ya capturado se muestra con «Capturado» y solo se pide lo que FALTA), Grupo (con los lugares reales de hoy) y Confirmar (con los montos
// que calcula el servidor). Es una vista más corta de la conversión: usa sus endpoints y su lógica (`GET /api/leads/:id/conversion`, `GET /api/cotizador`, `POST /api/leads/:id/convertir`;
// `conversion/datos.ts`, `faltantes.ts`, `Pasos.tsx`) y NO cambia ninguna regla. Lo que no cabe aquí (varios niños, el reglamento, datos que solo pide la inscripción completa, un rechazo del
// servidor que no se arregla eligiendo otro grupo) se dice dentro del diálogo y se ofrece «Abrir la inscripción completa».

import { useRef, useState } from "react";
import { api } from "../../api/cliente.ts";
import type { LeadDetalle } from "../../api/tipos.ts";
import { formatear, sumar } from "../../lib/dinero.ts";
import { formatearFechaLarga, hoyLocal } from "../../lib/fechas.ts";
import { aEntero } from "../../lib/numeros.ts";
import { useYo } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import { cargarCapturado, cargarOferta, type Oferta, type ResultadoDeConversion, type Vista } from "../conversion/datos.ts";
import { cuerpoDeConversion, delPaso, entradaVacia, nacimientoValido, restantes, type Entrada } from "../conversion/faltantes.ts";
import { grupoEfectivo, nombreDeProspecto, programaDeGrupo, type ContextoDePasos } from "../conversion/Pasos.tsx";
import { nombresResumidos } from "./dialogos-embudo.ts";
import { encajeEnElDialogo, gruposDeLaOferta, problemaDeLaOferta, rechazoDeConversion, seElige, textoDeCupo, textoDeFaltaParaSeguir } from "./inscripcion-embudo.ts";

/** Lo que el embudo necesita de una inscripción recién hecha para decirlo en el aviso «ya quedó». */
export interface InscripcionHecha {
  alumno: string;
  grupo: string;
  horario: string;
}

const NOMBRES_DE_PASOS = ["Alumno", "Grupo", "Confirmar"] as const;

function FilaCapturada({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="fila-capturada" data-prueba="dato-capturado">
      <span className="fila-capturada-texto">
        <span className="muted">{etiqueta}: </span>
        <strong>{valor}</strong>
      </span>
      <Insignia tono="exito">
        <Icono nombre="exito" tamano={12} />
        Capturado
      </Insignia>
    </div>
  );
}

function IndicadorDePasos({ paso }: { paso: number }) {
  return (
    <ol className="pasos-dialogo" aria-label="Pasos">
      {NOMBRES_DE_PASOS.map((nombre, i) => {
        const k = i + 1;
        return (
          <li key={nombre} aria-current={k === paso ? "step" : undefined} data-hecho={k < paso ? "" : undefined}>
            <span className="paso-dialogo-marca" aria-hidden="true">
              {k < paso ? <Icono nombre="exito" tamano={14} /> : k}
            </span>
            <span className="paso-dialogo-nombre">{nombre}</span>
            {k < NOMBRES_DE_PASOS.length ? <span className="paso-dialogo-linea" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Los tres pasos, con el lead y lo que falta (`vista`) ya cargados y la certeza de que cabe en el diálogo. */
function Pasos({ lead, vista, prospectoId, alCerrar, alInscrito, alAbrirCompleta, alRechazo }: { lead: LeadDetalle; vista: Vista; prospectoId: string; alCerrar: () => void; alInscrito: (i: InscripcionHecha) => void; alAbrirCompleta: () => void; alRechazo: () => void }) {
  const { modulos } = useYo();
  const hoy = hoyLocal();
  const [paso, setPaso] = useState(1);
  const [entrada, setEntrada] = useState<Entrada>(entradaVacia);
  const confirmar = useAccion();
  const previsiones = Object.fromEntries(vista.previsiones.map((p) => [p.prospecto_id, { hermanos: p.hermanos_previstos, reglamentoPendiente: p.reglamento_pendiente }]));
  const pendientes = [prospectoId];

  const capturado = useCarga((senal) => cargarCapturado(lead.id, pendientes, senal, modulos), [lead.id, prospectoId]);
  const nacimiento = (): string | null => {
    const e = entrada.alumnos[prospectoId]?.fecha_nacimiento;
    if (e && nacimientoValido(e, hoy)) return e;
    return capturado.datos?.[prospectoId]?.registro?.alumno.fecha_nacimiento ?? lead.prospectos.find((p) => p.id === prospectoId)?.fecha_nacimiento ?? null;
  };
  const claveDeOferta = `${nacimiento() ?? ""}:${previsiones[prospectoId]?.hermanos ?? 0}`;
  const ofertas = useCarga(
    async (senal) => {
      const nino = lead.prospectos.find((p) => p.id === prospectoId);
      const o = await cargarOferta(lead, { edad: nino?.edad ?? nino?.edad_declarada ?? null, nacimiento: nacimiento(), verticalId: nino?.vertical.id ?? lead.vertical.id, hermanos: previsiones[prospectoId]?.hermanos ?? 0 }, senal, modulos);
      return { [prospectoId]: o } as Record<string, Oferta | null>;
    },
    [lead.id, claveDeOferta],
    capturado.datos !== null,
  );
  // Al teclear la fecha de nacimiento la oferta se recalcula: mientras llega la nueva se sigue mostrando la anterior (como en la conversión), para no perder el foco ni las teclas.
  const [ofertasVistas, setOfertasVistas] = useState<typeof ofertas.datos>(null);
  if (ofertas.datos && ofertas.datos !== ofertasVistas) setOfertasVistas(ofertas.datos);
  const ofertasActuales = ofertas.datos ?? ofertasVistas;

  if (capturado.error) return <ErrorDeCarga error={capturado.error} alReintentar={capturado.recargar} />;
  if (ofertas.error) return <ErrorDeCarga error={ofertas.error} alReintentar={ofertas.recargar} />;
  if (!capturado.datos || !ofertasActuales) return <Cargando texto="Juntando lo que ya se capturó…" />;

  const ctx: ContextoDePasos = {
    lead,
    faltas: vista.faltantes,
    pendientes,
    capturado: capturado.datos,
    ofertas: ofertasActuales,
    previsiones,
    entrada,
    opciones: {},
    ponerTutor: (campo, valor) => setEntrada((e) => ({ ...e, tutor: { ...e.tutor, [campo]: valor } })),
    ponerAlumno: (id, cambio) => setEntrada((e) => ({ ...e, alumnos: { ...e.alumnos, [id]: { nombre: "", apellidos: "", fecha_nacimiento: "", ...e.alumnos[id], ...cambio } } })),
    ponerGrupo: (id, grupoId) => setEntrada((e) => ({ ...e, grupos: { ...e.grupos, [id]: grupoId } })),
    ponerOpcion: () => undefined,
    recargarVista: () => undefined,
  };
  const reg = capturado.datos[prospectoId]?.registro ?? null;
  const prospecto = lead.prospectos.find((p) => p.id === prospectoId);
  const hay = (campo: string): boolean => vista.faltantes.some((f) => f.campo === campo);
  const ruta = (resto: string): string => `prospectos.${prospectoId}.${resto}`;
  const e = entrada.alumnos[prospectoId];

  const oferta = ofertasActuales[prospectoId] ?? null;
  const grupos = gruposDeLaOferta(oferta);
  const grupoId = grupoEfectivo(ctx, prospectoId);
  const elegido = grupos.find((g) => g.grupoId === grupoId) ?? null;
  const programa = grupoId ? programaDeGrupo(ctx, prospectoId, grupoId) : null;
  const entradaEfectiva: Entrada = { ...entrada, grupos: grupoId ? { [prospectoId]: grupoId } : {} };
  const quedan = restantes(vista.faltantes, entradaEfectiva, { hoy, grupoConPrecio: () => programa?.precio != null });
  const faltasDelAlumno = [...delPaso(quedan, "familia"), ...delPaso(quedan, "alumnos")];
  const problemaDeOferta = problemaDeLaOferta(oferta);

  const nombre = nombreDeProspecto(ctx, prospectoId);
  const apellidos = e?.apellidos || reg?.alumno.apellidos || prospecto?.apellidos || "";
  const alumno = [nombre, apellidos].filter(Boolean).join(" ");
  const adulto = entrada.tutor.nombre || (reg && reg.tutores.length > 0 ? reg.tutores.map((t) => `${t.nombre} ${t.apellidos ?? ""}`.trim()).join(", ") : (lead.nombre_contacto ?? "—"));
  const responsable = reg?.tutores.find((t) => t.es_responsable_pago) ? `${reg.tutores.find((t) => t.es_responsable_pago)!.nombre} ${reg.tutores.find((t) => t.es_responsable_pago)!.apellidos ?? ""}`.trim() : adulto;
  const falta: string | null = paso === 1 ? textoDeFaltaParaSeguir(faltasDelAlumno) : paso === 2 ? (elegido && seElige(elegido) ? null : "Elige un grupo con lugar.") : null;
  const rechazo = confirmar.error && confirmar.error.detalles.some((d) => d.campo === "motivo") ? rechazoDeConversion(confirmar.error) : null;
  const prom = programa?.promociones ?? null;
  const recomendado = reg?.observacion.grupo_recomendado_id ?? null;
  const eligioLaFamilia = capturado.datos[prospectoId]?.grupoElegido ?? null;

  const inscribir = async () => {
    const cuerpo = cuerpoDeConversion(entradaEfectiva, pendientes, {}, aEntero);
    const r = await confirmar.ejecutar(() => api.post<ResultadoDeConversion>(`/api/leads/${lead.id}/convertir`, cuerpo));
    if (r) alInscrito({ alumno: nombre, grupo: elegido?.nombre ?? "", horario: elegido?.horario ?? "" });
    else alRechazo();
  };
  const volverAlGrupo = () => {
    confirmar.limpiar();
    ofertas.recargar();
    setPaso(2);
  };

  return (
    <form
      noValidate
      className="formulario"
      data-prueba="dialogo-inscribir"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (falta) return;
        if (paso < 3) setPaso(paso + 1);
        else void inscribir();
      }}
    >
      <IndicadorDePasos paso={paso} />

      {paso === 1 ? (
        <div className="pila" data-prueba="paso-alumno">
          <p className="muted">Lo que ya capturaron el asistente, la página o el maestro no se vuelve a pedir.</p>
          {hay("tutor.nombre") ? <CampoTexto etiqueta="Nombre del adulto responsable" value={entrada.tutor.nombre} onChange={(ev) => ctx.ponerTutor("nombre", ev.target.value)} requerido autoComplete="off" /> : <FilaCapturada etiqueta="Adulto responsable" valor={adulto} />}
          {hay("tutor.parentesco") ? <CampoTexto etiqueta="Parentesco con el alumno" ayuda="Madre, padre, abuela, tío…" value={entrada.tutor.parentesco} onChange={(ev) => ctx.ponerTutor("parentesco", ev.target.value)} requerido autoComplete="off" /> : null}
          {lead.telefono ? <FilaCapturada etiqueta="Teléfono" valor={lead.telefono} /> : null}
          {hay(ruta("alumno.nombre")) ? <CampoTexto etiqueta="Nombre del alumno" value={e?.nombre ?? ""} onChange={(ev) => ctx.ponerAlumno(prospectoId, { nombre: ev.target.value })} requerido autoComplete="off" /> : <FilaCapturada etiqueta="Alumno" valor={nombre} />}
          {hay(ruta("alumno.apellidos")) ? (
            <CampoTexto etiqueta="Apellidos del alumno" placeholder="Como aparecen en el acta" value={e?.apellidos ?? ""} onChange={(ev) => ctx.ponerAlumno(prospectoId, { apellidos: ev.target.value })} requerido autoComplete="off" />
          ) : apellidos ? (
            <FilaCapturada etiqueta="Apellidos" valor={apellidos} />
          ) : null}
          {hay(ruta("alumno.fecha_nacimiento")) ? (
            <CampoTexto etiqueta="Fecha de nacimiento del alumno" type="date" value={e?.fecha_nacimiento ?? ""} onChange={(ev) => ctx.ponerAlumno(prospectoId, { fecha_nacimiento: ev.target.value })} requerido error={e?.fecha_nacimiento && !nacimientoValido(e.fecha_nacimiento, hoy) ? "Escribe una fecha real que no sea futura (de 1 a 99 años de edad)." : undefined} />
          ) : prospecto?.edad !== null && prospecto?.edad !== undefined ? (
            <FilaCapturada etiqueta="Edad" valor={`${prospecto.edad} años`} />
          ) : null}
          {hay(ruta("alumno.fecha_nacimiento")) && prospecto?.edad_declarada !== null && prospecto?.edad_declarada !== undefined ? <p className="muted">Edad que dijo la familia: {prospecto.edad_declarada} años.</p> : null}
          {lead.sucursal ? <FilaCapturada etiqueta="Sucursal" valor={lead.sucursal.nombre} /> : null}
        </div>
      ) : null}

      {paso === 2 ? (
        <div className="pila" data-prueba="paso-grupo">
          <fieldset className="grupo-opciones">
            <legend>Grupo, con los lugares que quedan hoy</legend>
            <div className="opciones-sesion">
              {grupos.map((g) => (
                <button key={g.grupoId} type="button" className="opcion-sesion" aria-pressed={g.grupoId === grupoId} disabled={!seElige(g)} onClick={() => ctx.ponerGrupo(prospectoId, g.grupoId)}>
                  <span className="opcion-sesion-texto">
                    <span className="opcion-sesion-dia">{g.nombre}</span>
                    <span className="muted">{g.programa} · {g.horario}{lead.sucursal ? ` · ${lead.sucursal.nombre}` : ""}</span>
                  </span>
                  <span className="opcion-sesion-cupo">
                    <span>{g.sinPrecio ? "Sin precio" : textoDeCupo(g)}</span>
                    {g.grupoId === recomendado ? <span className="etiqueta-recomendada">Lo recomendó el maestro</span> : g.grupoId === eligioLaFamilia ? <span className="etiqueta-recomendada">Lo eligió la familia</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          {problemaDeOferta ? (
            <Aviso tono="alerta">
              <p>{problemaDeOferta}</p>
              <Boton onClick={alAbrirCompleta}>Abrir la inscripción completa</Boton>
            </Aviso>
          ) : null}
        </div>
      ) : null}

      {paso === 3 ? (
        <div className="pila" data-prueba="paso-confirmar">
          <dl className="resumen-dialogo">
            <dt>Alumno</dt>
            <dd><strong>{alumno}</strong></dd>
            <dt>Grupo</dt>
            <dd>{elegido ? `${elegido.nombre} · ${elegido.horario}${lead.sucursal ? ` · ${lead.sucursal.nombre}` : ""}` : "—"}</dd>
            <dt>Empieza</dt>
            <dd>Hoy, {formatearFechaLarga(hoy)}</dd>
            <dt>Responsable de pago</dt>
            <dd>{responsable}</dd>
          </dl>
          {(previsiones[prospectoId]?.hermanos ?? 0) > 0 ? <Aviso tono="info">Se cotiza con {previsiones[prospectoId]!.hermanos} {previsiones[prospectoId]!.hermanos === 1 ? "hermano ya inscrito" : "hermanos ya inscritos"}.</Aviso> : null}
          {prom ? (
            <div className="montos-dialogo" data-prueba="montos">
              <div><span>Inscripción</span><strong>{formatear(prom.inscripcion.final_ahora)}</strong></div>
              <div><span>Primera mensualidad</span><strong>{formatear(prom.mensualidad.final_ahora)}</strong></div>
              {prom.meses_gratis_ahora > 0 ? <div><span>Meses gratis</span><strong>{prom.meses_gratis_ahora}</strong></div> : <div className="monto-total"><span>Primer pago</span><strong>{formatear(sumar(prom.inscripcion.final_ahora, prom.mensualidad.final_ahora))}</strong></div>}
            </div>
          ) : (
            <Aviso tono="alerta">Este programa no tiene un precio vigente: no se puede inscribir hasta que el administrador lo publique.</Aviso>
          )}
          {prom && prom.aplicadas.length > 0 ? <p className="muted">Promociones que aplican: {prom.aplicadas.map((a) => a.nombre).join(", ")}.</p> : null}
          {previsiones[prospectoId]?.reglamentoPendiente ? <Aviso tono="info" titulo="Todavía falta el reglamento">La familia no ha aceptado el reglamento de {nombre}: sin eso el sistema no inscribe. Se registra en la inscripción completa.</Aviso> : null}
          <p className="muted">La familia recibe la bienvenida por WhatsApp con el grupo, la sucursal y el primer día.</p>
        </div>
      ) : null}

      {rechazo ? (
        <Aviso tono="peligro" titulo={confirmar.error?.message ?? "No se pudo inscribir"}>
          {rechazo.faltas.length > 0 ? <ul>{rechazo.faltas.map((f) => <li key={f}>{f}</li>)}</ul> : null}
          {rechazo.salida === "grupo" ? (
            <div className="pila" data-prueba="rechazo-de-grupo">
              <p>No se inscribió a nadie. El grupo elegido ya no sirve: elige otro con lugar.</p>
              <div><Boton onClick={volverAlGrupo}>Elegir otro grupo</Boton></div>
            </div>
          ) : (
            <div className="pila" data-prueba="rechazo-a-completa">
              <p>Esto se resuelve en la inscripción completa.{rechazo.codigo === "grupo_lleno" ? " Ahí también puedes ponerlo en la lista de espera." : ""}</p>
              <div><Boton onClick={alAbrirCompleta}>Abrir la inscripción completa</Boton></div>
            </div>
          )}
        </Aviso>
      ) : (
        <ErrorDeAccion error={confirmar.error} />
      )}
      {falta ? <p className="campo-ayuda" data-prueba="falta-del-dialogo">{falta}</p> : null}

      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={confirmar.ocupado} disabled={falta !== null || (paso === 3 && prom === null)}>
          {paso < 3 ? "Siguiente" : `Inscribir a ${nombre}`}
        </Boton>
        {paso > 1 ? (
          <Boton
            onClick={() => {
              confirmar.limpiar();
              setPaso(paso - 1);
            }}
            disabled={confirmar.ocupado}
          >
            Atrás
          </Boton>
        ) : null}
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

/** El diálogo: carga al lead y lo que le falta para inscribirlo; si no cabe en 3 pasos lo dice y ofrece la inscripción completa. */
export function InscribirEnTresPasos({ leadId, abierto, alCerrar, alInscrito, alAbrirCompleta }: { leadId: string | null; abierto: boolean; alCerrar: (hayQueRecargar: boolean) => void; alInscrito: (i: InscripcionHecha) => void; alAbrirCompleta: (leadId: string) => void }) {
  const activo = abierto && leadId !== null;
  const huboRechazo = useRef(false);
  const lead = useCarga((senal) => api.get<LeadDetalle>(`/api/leads/${leadId ?? ""}`, undefined, senal), [leadId], activo);
  const vista = useCarga((senal) => api.get<Vista>(`/api/leads/${leadId ?? ""}/conversion`, undefined, senal), [leadId], activo);
  // Lo cargado de una apertura anterior (el mismo lead) no vale: hasta que llegue lo nuevo se espera.
  const d = lead.cargando ? null : lead.datos;
  const datosDeVista = vista.cargando ? null : vista.datos;
  const encaje = d && datosDeVista ? encajeEnElDialogo(d, datosDeVista) : null;
  const ninoId = encaje?.cabe ? encaje.prospectoId : (datosDeVista?.prospectos.find((p) => !p.ya_convertido)?.prospecto_id ?? null);
  const nino = d?.prospectos.find((p) => p.id === ninoId)?.nombre ?? d?.nombre_contacto ?? "";
  const titulo = nino ? `Inscribir a ${nino}` : "Inscribir";
  const error = lead.error ?? vista.error;
  const cerrar = () => {
    const recargar = huboRechazo.current || (encaje !== null && !encaje.cabe && encaje.tipo === "ya_inscrito");
    huboRechazo.current = false;
    alCerrar(recargar);
  };

  return (
    <Dialogo abierto={activo} titulo={titulo} alCerrar={cerrar} ancho>
      {d ? <p className="muted etapa-actual-dialogo">{[d.nombre_contacto, d.vertical.nombre, d.sucursal?.nombre].filter(Boolean).join(" · ")}</p> : null}
      {error ? <ErrorDeCarga error={error} alReintentar={() => { lead.recargar(); vista.recargar(); }} /> : null}
      {!error && (!d || !datosDeVista) ? <Cargando texto="Juntando lo que ya se capturó…" /> : null}
      {d && encaje && !encaje.cabe ? (
        <div className="pila" data-prueba="no-cabe-en-el-dialogo">
          <Aviso tono={encaje.tipo === "ya_inscrito" ? "exito" : "info"} titulo={encaje.tipo === "ya_inscrito" ? "Ya está inscrito" : "Esto se hace en la inscripción completa"}>
            {encaje.mensaje}
          </Aviso>
          <div className="formulario-acciones">
            {encaje.tipo === "ya_inscrito" ? null : (
              <Boton variante="primario" onClick={() => alAbrirCompleta(d.id)}>
                Abrir la inscripción completa
              </Boton>
            )}
            <Boton onClick={cerrar}>{encaje.tipo === "ya_inscrito" ? "Cerrar" : "Cancelar"}</Boton>
          </div>
        </div>
      ) : null}
      {d && datosDeVista && encaje?.cabe ? <Pasos key={d.id} lead={d} vista={datosDeVista} prospectoId={encaje.prospectoId} alCerrar={cerrar} alInscrito={alInscrito} alAbrirCompleta={() => alAbrirCompleta(d.id)} alRechazo={() => { huboRechazo.current = true; }} /> : null}
    </Dialogo>
  );
}

/** Si se sueltan varios leads sobre «Inscrito»: la inscripción es de una familia a la vez (cada una tiene sus niños, su grupo y su reglamento), y se explica en vez de hacer algo a medias. */
export function InscribirDeUnoEnUno({ nombres, abierto, alCerrar }: { nombres: readonly string[]; abierto: boolean; alCerrar: () => void }) {
  return (
    <Dialogo abierto={abierto && nombres.length > 1} titulo="Inscribir de una familia a la vez" alCerrar={alCerrar}>
      <div className="pila" data-prueba="inscribir-de-uno-en-uno">
        <Aviso tono="info">La inscripción se hace de una familia a la vez: suelta los leads uno por uno.</Aviso>
        <p className="muted">Leads que soltaste: {nombresResumidos(nombres)}.</p>
        <div className="formulario-acciones">
          <Boton variante="primario" onClick={alCerrar}>
            Entendido
          </Boton>
        </div>
      </div>
    </Dialogo>
  );
}
