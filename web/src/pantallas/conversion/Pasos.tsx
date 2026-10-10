// Los pasos del asistente de conversión. Regla de oro: lo ya capturado (por el bot, la landing, el maestro) se MUESTRA con su valor y nunca se vuelve a pedir;
// solo hay campos para lo que `GET /api/leads/:id/conversion` dice que FALTA. Corregir algo ya capturado es una acción explícita («Corregir»).

import type { ReactNode } from "react";
import { api } from "../../api/cliente.ts";
import { Link } from "react-router-dom";
import type { LeadDetalle, ProgramaCotizado } from "../../api/tipos.ts";
import { formatear } from "../../lib/dinero.ts";
import { ESTATUS_DE_CLASE, MOTIVOS_DE_CLASE, SEXOS, TURNOS } from "../../lib/etiquetas.ts";
import { formatearFecha, hoyLocal } from "../../lib/fechas.ts";
import { Aviso, Boton, ErrorDeAccion, Insignia, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { useAccion } from "../../ui/hooks.ts";
import { CampoTexto, GrupoDeOpciones } from "../../ui/campos.tsx";
import { Aceptaciones } from "../maestro/Aceptaciones.tsx";
import type { CapturadoDeProspecto, Oferta } from "./datos.ts";
import { etiquetaDeFalta, nacimientoValido, type Entrada, type EntradaDeAlumno, type Falta } from "./faltantes.ts";

export interface Opciones {
  fecha_inicio: string;
  dia_corte_pago: string;
  meses: string;
}

export interface ContextoDePasos {
  lead: LeadDetalle;
  faltas: readonly Falta[];
  pendientes: readonly string[];
  capturado: Record<string, CapturadoDeProspecto>;
  ofertas: Record<string, Oferta | null>;
  /** V3: por niño, los hermanos que tendrá ya inscritos cuando le toque y si falta el reglamento (de la vista previa del servidor). */
  previsiones: Record<string, { hermanos: number; reglamentoPendiente: boolean }>;
  entrada: Entrada;
  opciones: Record<string, Opciones>;
  ponerTutor: (campo: keyof Entrada["tutor"], valor: string) => void;
  ponerAlumno: (id: string, cambio: Partial<EntradaDeAlumno>) => void;
  ponerGrupo: (id: string, grupoId: string) => void;
  ponerOpcion: (id: string, campo: keyof Opciones, valor: string) => void;
  recargarVista: () => void;
}

const hayFalta = (c: ContextoDePasos, campo: string): boolean => c.faltas.some((f) => f.campo === campo);
export const nombreDeProspecto = (c: ContextoDePasos, id: string): string => c.entrada.alumnos[id]?.nombre || c.capturado[id]?.registro?.alumno.nombre || c.lead.prospectos.find((p) => p.id === id)?.nombre || "Alumno";

/** El grupo con el que se inscribe: lo elegido en pantalla, o el que ya eligió la familia al cotizar, o el que recomendó el maestro. */
export function grupoEfectivo(c: ContextoDePasos, id: string): string {
  return c.entrada.grupos[id] ?? c.capturado[id]?.grupoElegido ?? c.capturado[id]?.registro?.observacion.grupo_recomendado_id ?? "";
}

export function programaDeGrupo(c: ContextoDePasos, id: string, grupoId: string): ProgramaCotizado | null {
  return c.ofertas[id]?.programas.find((p) => p.grupos.some((g) => g.grupo_id === grupoId)) ?? null;
}

/** Un dato ya capturado: se ve su valor; «Corregir» abre el campo. Un dato que falta: el campo, obligatorio. */
function Dato({ etiqueta, capturado, escrito, falta, tipo = "text", error, alEscribir }: { etiqueta: string; capturado: string | null | undefined; escrito: string | undefined; falta: boolean; tipo?: string; error?: string | undefined; alEscribir: (v: string) => void }) {
  const valor = capturado && capturado.trim() !== "" ? capturado : null;
  if (valor === null && !falta) return null;
  if (valor === null || escrito !== undefined) {
    return (
      <CampoTexto etiqueta={etiqueta} type={tipo} value={escrito ?? ""} onChange={(e) => alEscribir(e.target.value)} requerido={valor === null} error={error} ayuda={valor !== null ? `Antes: ${tipo === "date" ? formatearFecha(valor) : valor}` : undefined} />
    );
  }
  return (
    <div className="dato-capturado" data-prueba="dato-capturado">
      <span className="dato-capturado-texto">
        <span className="muted">{etiqueta}: </span>
        <strong>{tipo === "date" ? formatearFecha(valor) : valor}</strong> <Insignia tono="exito">Capturado</Insignia>
      </span>
      <Boton variante="fantasma" onClick={() => alEscribir(valor)} aria-label={`Corregir ${etiqueta.toLowerCase()}`}>
        Corregir
      </Boton>
    </div>
  );
}

const textoDe = (lista: readonly { valor: string; texto: string }[], valor: string | null | undefined): string | null => lista.find((x) => x.valor === valor)?.texto ?? null;

export function PasoFamilia({ c }: { c: ContextoDePasos }) {
  const primero = c.pendientes.map((id) => c.capturado[id]?.registro).find((r) => r && r.tutores.length > 0) ?? null;
  const sinTelefono = hayFalta(c, "tutor.telefono");
  return (
    <div className="pila">
      <p className="muted">La familia (los adultos) se crea con lo que ya se capturó.</p>
      {primero ? (
        <Tarjeta titulo="Adultos que capturó el maestro">
          <ul className="adultos" data-prueba="adultos-capturados">
            {primero.tutores.map((t) => (
              <li key={t.id}>
                <span className="adulto-datos">
                  <strong>
                    {t.nombre} {t.apellidos ?? ""}
                  </strong>{" "}
                  <span className="muted numero">
                    · {t.parentesco} · {t.telefono}
                  </span>
                </span>
                {t.es_responsable_pago || t.lo_lleva || t.puede_recoger ? (
                  <span className="adulto-etiquetas">
                    {t.es_responsable_pago ? <Insignia tono="info">Responsable de pago</Insignia> : null}
                    {t.lo_lleva ? <Insignia>Lo lleva</Insignia> : null}
                    {t.puede_recoger ? <Insignia>Puede recoger</Insignia> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : (
        <Tarjeta titulo="Contacto que escribió">
          <dl className="datos resumen-datos">
            <dt>Nombre</dt>
            <dd>{c.lead.nombre_contacto ?? "—"}</dd>
            <dt>Teléfono</dt>
            <dd>{c.lead.telefono ?? "—"}</dd>
          </dl>
          {sinTelefono ? <Aviso tono="peligro">Este contacto no tiene un teléfono válido: sin él no se puede crear la familia.</Aviso> : null}
          {hayFalta(c, "tutor.nombre") ? <CampoTexto etiqueta="Nombre del adulto" value={c.entrada.tutor.nombre} onChange={(e) => c.ponerTutor("nombre", e.target.value)} requerido /> : null}
          {hayFalta(c, "tutor.parentesco") ? <CampoTexto etiqueta="Parentesco con el alumno" ayuda="Madre, padre, abuela, tío…" value={c.entrada.tutor.parentesco} onChange={(e) => c.ponerTutor("parentesco", e.target.value)} requerido /> : null}
          <details className="mas-opciones">
            <summary>Datos opcionales del adulto</summary>
            <div className="pila">
              <CampoTexto etiqueta="Apellidos del adulto" value={c.entrada.tutor.apellidos} onChange={(e) => c.ponerTutor("apellidos", e.target.value)} />
              <CampoTexto etiqueta="Correo del adulto" type="email" inputMode="email" value={c.entrada.tutor.correo} onChange={(e) => c.ponerTutor("correo", e.target.value)} />
            </div>
          </details>
        </Tarjeta>
      )}
      {!c.faltas.some((f) => f.campo.startsWith("tutor.")) ? <Aviso tono="exito">En este paso no hay nada por capturar.</Aviso> : null}
    </div>
  );
}

export function PasoAlumnos({ c }: { c: ContextoDePasos }) {
  return (
    <div className="pila">
      {c.pendientes.map((id) => {
        const reg = c.capturado[id]?.registro ?? null;
        const e = c.entrada.alumnos[id];
        const rutas = (resto: string) => hayFalta(c, `prospectos.${id}.alumno.${resto}`);
        const prospecto = c.lead.prospectos.find((p) => p.id === id);
        const nada = !["nombre", "apellidos", "fecha_nacimiento"].some(rutas);
        return (
          <Tarjeta key={id} titulo={nombreDeProspecto(c, id)} className="pila">
            <div className="pila" data-prueba={`alumno-${id}`}>
              <Dato etiqueta="Nombre" capturado={reg?.alumno.nombre ?? prospecto?.nombre} escrito={e?.nombre} falta={rutas("nombre")} alEscribir={(v) => c.ponerAlumno(id, { nombre: v })} />
              <Dato etiqueta="Apellidos" capturado={reg?.alumno.apellidos ?? prospecto?.apellidos} escrito={e?.apellidos} falta={rutas("apellidos")} alEscribir={(v) => c.ponerAlumno(id, { apellidos: v })} />
              <Dato etiqueta="Fecha de nacimiento" tipo="date" capturado={reg?.alumno.fecha_nacimiento ?? prospecto?.fecha_nacimiento} escrito={e?.fecha_nacimiento} falta={rutas("fecha_nacimiento")} error={e?.fecha_nacimiento && !nacimientoValido(e.fecha_nacimiento, hoyLocal()) ? "Escribe una fecha real que no sea futura (de 1 a 99 años de edad)." : undefined} alEscribir={(v) => c.ponerAlumno(id, { fecha_nacimiento: v })} />
              {prospecto?.edad_declarada !== null && prospecto?.edad_declarada !== undefined && !reg?.alumno.fecha_nacimiento && !prospecto?.fecha_nacimiento ? <p className="muted">Edad que dijo la familia: {prospecto.edad_declarada} años.</p> : null}
              {reg ? (
                <dl className="datos resumen-datos" data-prueba="capturado-del-maestro">
                  {textoDe(SEXOS, reg.alumno.sexo) ? (<><dt>Sexo</dt><dd>{textoDe(SEXOS, reg.alumno.sexo)}</dd></>) : null}
                  {reg.alumno.escuela ? (<><dt>Escuela</dt><dd>{reg.alumno.escuela}</dd></>) : null}
                  {textoDe(TURNOS, reg.alumno.turno_escolar) ? (<><dt>Turno</dt><dd>{textoDe(TURNOS, reg.alumno.turno_escolar)}</dd></>) : null}
                  {reg.alumno.talla_uniforme ? (<><dt>Talla de uniforme</dt><dd>{reg.alumno.talla_uniforme}</dd></>) : null}
                  {reg.antecedentes.practico_antes !== null ? (<><dt>Practicó antes</dt><dd>{reg.antecedentes.practico_antes ? `Sí${reg.antecedentes.practico_donde ? ` (${reg.antecedentes.practico_donde})` : ""}` : "No"}</dd></>) : null}
                  {textoDe(MOTIVOS_DE_CLASE, reg.antecedentes.motivo_clase) ? (<><dt>Motivo</dt><dd>{textoDe(MOTIVOS_DE_CLASE, reg.antecedentes.motivo_clase)}</dd></>) : null}
                </dl>
              ) : (
                <Vacio titulo="Todavía no hay registro del maestro de este alumno: solo se pide lo indispensable." icono="alumnos" />
              )}
              {nada ? <Aviso tono="exito">Nada por capturar de este alumno: todo salió del registro.</Aviso> : null}
            </div>
          </Tarjeta>
        );
      })}
    </div>
  );
}

export function PasoGrupo({ c }: { c: ContextoDePasos }) {
  return (
    <div className="pila">
      {c.pendientes.map((id) => {
        const oferta = c.ofertas[id];
        const elegido = grupoEfectivo(c, id);
        const reg = c.capturado[id]?.registro;
        const o = c.opciones[id] ?? { fecha_inicio: "", dia_corte_pago: "", meses: "" };
        const programas = oferta?.programas ?? [];
        return (
          <Tarjeta key={id} titulo={`Grupo de ${nombreDeProspecto(c, id)}`}>
            <div className="pila paso-grupo" data-prueba={`grupo-${id}`}>
              {!c.lead.sucursal ? <Aviso tono="alerta">Este lead no tiene sucursal: sin ella no se pueden ver los grupos.</Aviso> : null}
              {oferta === undefined || oferta === null ? (c.lead.sucursal ? <Aviso tono="alerta">No se pudo calcular la oferta de esta edad.</Aviso> : null) : null}
              {oferta && programas.length === 0 ? <Aviso tono="alerta">No hay programas para esta edad en la sucursal del lead.</Aviso> : null}
              {programas.map((p) => (
                <GrupoDeOpciones
                  key={p.programa_id}
                  etiqueta={`${p.nombre}${p.sin_precio ? " (sin precio)" : ""}`}
                  valor={elegido}
                  rejilla
                  alCambiar={(v) => c.ponerGrupo(id, v)}
                  opciones={p.grupos.map((g) => {
                    const cupo = g.lleno ? "Lleno" : `${g.lugares_disponibles} ${g.lugares_disponibles === 1 ? "lugar" : "lugares"}`;
                    const nota = g.grupo_id === c.capturado[id]?.grupoElegido ? "lo eligió la familia" : g.grupo_id === reg?.observacion.grupo_recomendado_id ? "recomendado por el maestro" : null;
                    return {
                      valor: g.grupo_id,
                      texto: `${g.nombre} · ${cupo}${nota ? ` · ${nota}` : ""} · ${g.horario_texto}`,
                      deshabilitada: g.lleno,
                      // El nombre del grupo y el cupo son lo que se elige: van arriba y en grande; el horario, debajo. Los « · » quedan solo para el lector de pantalla.
                      contenido: (
                        <span className="grupo-opcion">
                          <span className="grupo-nombre">{g.nombre}</span>
                          <span className="solo-lectores"> · </span>
                          <span className={g.lleno ? "grupo-cupo grupo-cupo-lleno" : "grupo-cupo"}>{cupo}</span>
                          {nota ? (
                            <>
                              <span className="solo-lectores"> · </span>
                              <span className="grupo-nota">{nota}</span>
                            </>
                          ) : null}
                          <span className="solo-lectores"> · </span>
                          <span className="grupo-horario">{g.horario_texto}</span>
                        </span>
                      ),
                    };
                  })}
                />
              ))}
              {elegido !== "" && programas.some((p) => p.grupos.some((g) => g.grupo_id === elegido && g.lleno)) ? <Aviso tono="alerta">El grupo elegido ya no tiene lugares: elige otro.</Aviso> : null}
              {elegido !== "" && !programas.some((p) => p.grupos.some((g) => g.grupo_id === elegido)) && oferta ? <Aviso tono="alerta">El grupo que traía el expediente ya no aplica a esta edad: elige otro.</Aviso> : null}
              <details className="mas-opciones">
                <summary>Más opciones de la inscripción</summary>
                <div className="pila">
                  <CampoTexto etiqueta="Fecha de inicio (opcional)" type="date" value={o.fecha_inicio} onChange={(e) => c.ponerOpcion(id, "fecha_inicio", e.target.value)} ayuda="Si la dejas vacía, empieza hoy." />
                  <CampoTexto etiqueta="Día de corte del pago (opcional, 1 a 31)" inputMode="numeric" value={o.dia_corte_pago} onChange={(e) => c.ponerOpcion(id, "dia_corte_pago", e.target.value)} ayuda="Si lo dejas vacío, es el día del mes en que empieza." />
                  <CampoTexto etiqueta="Meses por adelantado (opcional)" inputMode="numeric" value={o.meses} onChange={(e) => c.ponerOpcion(id, "meses", e.target.value)} />
                </div>
              </details>
            </div>
          </Tarjeta>
        );
      })}
    </div>
  );
}

/** Un importe: el original tachado y el que de verdad se cobra, cuando una promoción lo cambia. */
function Importe({ etiqueta, original, final }: { etiqueta: string; original: string; final: string }) {
  return (
    <div className="importe">
      <dt>{etiqueta}</dt>
      <dd>
        {final !== original ? (
          <>
            <s className="importe-antes">{formatear(original)}</s>
            <span className="importe-flecha">{" → "}</span>
            <span className="importe-final">{formatear(final)}</span>
          </>
        ) : (
          <span className="importe-final">{formatear(original)}</span>
        )}
      </dd>
    </div>
  );
}

export function PasoPrecio({ c }: { c: ContextoDePasos }) {
  return (
    <div className="pila">
      <p className="muted">Los importes los calcula el servidor con el precio vigente y las promociones que aplican hoy. La promoción por hermanos se aplica sola: cada niño se cotiza contando a los que se inscriben antes que él en esta misma operación, y es lo que se cobra.</p>
      {c.pendientes.map((id) => {
        const grupoId = grupoEfectivo(c, id);
        const programa = grupoId ? programaDeGrupo(c, id, grupoId) : null;
        const grupo = programa?.grupos.find((g) => g.grupo_id === grupoId);
        return (
          <Tarjeta key={id} titulo={`Precio de ${nombreDeProspecto(c, id)}`}>
            <div className="pila" data-prueba={`precio-${id}`}>
              {!programa ? <Aviso tono="alerta">Elige primero el grupo.</Aviso> : null}
              {programa ? (
                <>
                  <p className="precio-programa">
                    <strong>{programa.nombre}</strong> · {grupo?.horario_texto} ({grupo?.nombre})
                  </p>
                  {(c.previsiones[id]?.hermanos ?? 0) > 0 ? (
                    <div data-prueba={`hermanos-${id}`}>
                      <Aviso tono="info">
                        Se cotiza con {c.previsiones[id]!.hermanos} {c.previsiones[id]!.hermanos === 1 ? "hermano ya inscrito" : "hermanos ya inscritos"} (contando a los que se inscriben antes en esta operación).
                      </Aviso>
                    </div>
                  ) : null}
                  {programa.precio === null || programa.promociones === null ? (
                    <Aviso tono="peligro">Este programa no tiene un precio vigente: no se puede inscribir hasta que el administrador lo publique.</Aviso>
                  ) : (
                    <>
                      <dl className="importes">
                        <Importe etiqueta="Inscripción" original={programa.promociones.inscripcion.original} final={programa.promociones.inscripcion.final_ahora} />
                        <Importe etiqueta="Mensualidad" original={programa.promociones.mensualidad.original} final={programa.promociones.mensualidad.final_ahora} />
                        {programa.promociones.meses_gratis_ahora > 0 ? (
                          <div className="importe">
                            <dt>Meses gratis</dt>
                            <dd>
                              <span className="importe-final">{programa.promociones.meses_gratis_ahora}</span>
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      {programa.promociones.aplicadas.length > 0 ? (
                        <div className="promociones">
                          <strong>Promociones que aplican</strong>
                          <ul>
                            {programa.promociones.lineas.map((l, i) => (
                              <li key={`${l.promocion_id}-${i}`}>
                                {l.promocion_nombre}: {l.descripcion ?? l.tipo.replace(/_/g, " ")}
                                {l.descuento !== "0.00" ? ` (${formatear(l.descuento)})` : ""}
                                {l.estado !== "inmediato" ? " · al cumplirse la condición" : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="muted">No aplica ninguna promoción hoy.</p>
                      )}
                    </>
                  )}
                </>
              ) : null}
            </div>
          </Tarjeta>
        );
      })}
    </div>
  );
}

/** V3: la familia que ya aceptó el reglamento por un hermano lo acepta por este niño con un clic (queda registrado de dónde salió). */
function AceptarComoElHermano({ c, id, desde }: { c: ContextoDePasos; id: string; desde: string }) {
  const accion = useAccion();
  return (
    <div className="pila" data-prueba={`reglamento-del-hermano-${id}`}>
      <p className="muted">La misma persona, por el mismo medio y con el reglamento vigente. Queda como una aceptación nueva de este niño, con la nota de que se extendió de su hermano.</p>
      <div>
        <Boton
          cargando={accion.ocupado}
          onClick={() =>
            void accion.ejecutar(async () => {
              await api.post(`/api/leads/${c.lead.id}/prospectos/${id}/aceptaciones-del-hermano`, { desde_prospecto_id: desde });
              c.recargarVista();
            })
          }
        >
          Aceptan lo mismo que por {nombreDeProspecto(c, desde)}
        </Boton>
      </div>
      <ErrorDeAccion error={accion.error} />
    </div>
  );
}

export function PasoReglamento({ c }: { c: ContextoDePasos }) {
  return (
    <div className="pila">
      {c.pendientes.map((id) => {
        const clase = c.capturado[id]?.clase ?? null;
        const pendiente = hayFalta(c, `prospectos.${id}.reglamento`) || c.previsiones[id]?.reglamentoPendiente === true;
        const aceptado = !pendiente;
        // Un hermano de esta misma operación que ya tiene el reglamento aceptado: su aceptación se puede extender.
        // También uno que ya es alumno (un hermano tardío): el servidor comprueba que de verdad haya aceptado la versión vigente.
        const hermano = c.pendientes.find((o) => o !== id && c.previsiones[o]?.reglamentoPendiente === false && !hayFalta(c, `prospectos.${o}.reglamento`)) ?? c.lead.prospectos.find((o) => o.id !== id && o.alumno_id !== null)?.id;
        return (
          <Tarjeta key={id} titulo={`Reglamento e imagen de ${nombreDeProspecto(c, id)}`}>
            <div className="pila" data-prueba={`reglamento-${id}`}>
              {aceptado ? <Aviso tono="exito">La familia ya aceptó el reglamento vigente.</Aviso> : <Aviso tono="alerta">Falta que la familia acepte el reglamento vigente.</Aviso>}
              {!aceptado && hermano ? <AceptarComoElHermano c={c} id={id} desde={hermano} /> : null}
              {clase ? (
                <>
                  <p className="muted">
                    Clase muestra: {clase.sesion.fecha} · {ESTATUS_DE_CLASE[clase.estatus]?.texto ?? clase.estatus}
                  </p>
                  <Aceptaciones claseId={clase.id} tutores={c.capturado[id]?.registro?.tutores ?? []} bloqueado={false} alCambiar={c.recargarVista} />
                </>
              ) : !hermano || aceptado ? (
                <Aviso tono="alerta">
                  Para registrar la aceptación hace falta una clase muestra de este alumno: agéndala desde <Link to={`/leads/${c.lead.id}`}>la ficha del lead</Link>.
                </Aviso>
              ) : null}
            </div>
          </Tarjeta>
        );
      })}
    </div>
  );
}

export function PasoConfirmar({ c, quedan, hayError = false, alIrAlPaso, nombreDeFalta, children }: { c: ContextoDePasos; quedan: readonly Falta[]; hayError?: boolean; alIrAlPaso: (campo: string) => void; nombreDeFalta?: ((prospectoId: string) => string | null) | undefined; children: ReactNode }) {
  return (
    <div className="pila">
      {quedan.length > 0 ? (
        <Aviso tono="alerta" titulo="Todavía falta para poder inscribir">
          <ul className="lo-que-falta" data-prueba="lo-que-falta">
            {quedan.map((f) => (
              <li key={f.campo}>
                {etiquetaDeFalta(f.campo, nombreDeFalta)}{" "}
                <Boton variante="fantasma" onClick={() => alIrAlPaso(f.campo)}>
                  Ir a este paso
                </Boton>
              </li>
            ))}
          </ul>
        </Aviso>
      ) : hayError ? null : c.pendientes.some((id) => c.previsiones[id]?.reglamentoPendiente === true) ? (
        // V7: antes decía «Todo listo para inscribir» y el servidor lo rechazaba al confirmar por el reglamento. Se avisa aquí; el botón sigue activo porque el servidor es quien manda.
        <Aviso tono="info" titulo="Todavía falta el reglamento">
          La familia no ha aceptado el reglamento de {c.pendientes.filter((id) => c.previsiones[id]?.reglamentoPendiente === true).map((id) => nombreDeProspecto(c, id)).join(" ni de ")}: sin eso el sistema no inscribe. Se registra en el paso «Reglamento e imagen».
        </Aviso>
      ) : (
        <Aviso tono="exito">Todo listo para inscribir.</Aviso>
      )}
      <Tarjeta titulo="Resumen" className="pila">
        <div className="pila resumen" data-prueba="resumen-conversion">
          <p className="resumen-familia">
            <strong>Familia:</strong>{" "}
            {c.pendientes.map((id) => c.capturado[id]?.registro?.tutores).find((t) => t && t.length > 0)?.map((t) => `${t.nombre} (${t.parentesco})`).join(", ") ?? `${c.lead.nombre_contacto ?? "Contacto"} (${c.entrada.tutor.parentesco || "parentesco por capturar"})`}
          </p>
          {c.pendientes.map((id) => {
            const g = grupoEfectivo(c, id);
            const programa = g ? programaDeGrupo(c, id, g) : null;
            const grupo = programa?.grupos.find((x) => x.grupo_id === g);
            const apellidos = c.entrada.alumnos[id]?.apellidos || c.capturado[id]?.registro?.alumno.apellidos || c.lead.prospectos.find((p) => p.id === id)?.apellidos || "";
            return (
              <div key={id} className="resumen-alumno" data-prueba={`resumen-${id}`}>
                <div className="resumen-alumno-texto">
                  <strong>
                    {nombreDeProspecto(c, id)} {apellidos}
                  </strong>
                  <span className="muted">{grupo ? `${programa?.nombre} · ${grupo.horario_texto} (${grupo.nombre})` : "sin grupo"}</span>
                </div>
                {programa?.promociones ? (
                  <div className="resumen-importes">
                    <p className="importe-resumen">
                      <span className="importe-etiqueta">inscripción</span>{" "}
                      <strong className="importe-cifra">{formatear(programa.promociones.inscripcion.final_ahora)}</strong>
                    </p>
                    <p className="importe-resumen importe-principal">
                      <span className="importe-etiqueta">mensualidad</span>{" "}
                      <strong className="importe-cifra">{formatear(programa.promociones.mensualidad.final_ahora)}</strong>
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Tarjeta>
      {children}
    </div>
  );
}
