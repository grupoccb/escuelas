// Convertir un lead en familia e inscripciones, paso a paso y SIN recaptura (asesor y administrador): familia → alumnos → grupo y horario (con lugares reales) →
// precio y promociones → reglamento e imagen → confirmación. Parte de lo ya capturado (bot, landing, registro del maestro) y de `GET /api/leads/:id/conversion`,
// que dice SOLO lo que falta. La confirmación es `POST /api/leads/:id/convertir`: una transacción, idempotente (un doble clic no inscribe dos veces).

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ErrorDeApi, type Pagina } from "../../api/cliente.ts";
import type { LeadDetalle, Tarea } from "../../api/tipos.ts";
import { hoyLocal } from "../../lib/fechas.ts";
import { aEntero } from "../../lib/numeros.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, EnlaceBoton, ErrorDeAccion, ErrorDeCarga, Pagina as Marco, Tarjeta } from "../../ui/basicos.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { cargarCapturado, cargarOferta, type Oferta, type ResultadoDeConversion, type Vista } from "./datos.ts";
import { cuerpoDeConversion, type Falta, delPaso, entradaVacia, etiquetaDeFalta, nacimientoValido, PASOS, pasoDe, restantes, type Entrada, type Paso } from "./faltantes.ts";
import { PasoAlumnos, PasoConfirmar, PasoFamilia, PasoGrupo, PasoPrecio, PasoReglamento, grupoEfectivo, programaDeGrupo, type ContextoDePasos, type Opciones } from "./Pasos.tsx";

const INDICE_DE: Record<Paso, number> = { familia: 0, alumnos: 1, grupo: 2, precio: 3, reglamento: 4, otros: 5 };
/** Qué paso corrige un rechazo de la inscripción (`detalles[motivo]`). */
const PASO_DEL_RECHAZO: Record<string, Paso> = { grupo_lleno: "grupo", fuera_de_edad: "grupo", ya_inscrito: "grupo", sin_precio: "precio", reglamento: "reglamento" };

function Asistente({ lead, vista, recargar }: { lead: LeadDetalle; vista: Vista; recargar: () => void }) {
  const { puede } = useSesion();
  const hoy = hoyLocal();
  const pendientes = vista.prospectos.filter((p) => !p.ya_convertido).map((p) => p.prospecto_id);
  const clave = pendientes.join(",");
  const [entrada, setEntrada] = useState<Entrada>(entradaVacia);
  const [opciones, setOpciones] = useState<Record<string, Opciones>>({});
  const [paso, setPaso] = useState(0);
  const [resultado, setResultado] = useState<ResultadoDeConversion | null>(null);
  const confirmar = useAccion();

  const capturado = useCarga((senal) => cargarCapturado(lead.id, pendientes, senal), [lead.id, clave]);
  const tareas = useCarga((senal) => (puede("tareas:leer") ? api.get<Pagina<Tarea>>("/api/tareas", { lead_id: lead.id, tipo: "listo_para_cerrar", estado: "pendiente", limite: 1 }, senal) : Promise.resolve(null)), [lead.id]);

  // La fecha de nacimiento (la tecleada, si es válida, o la del registro) afina la oferta: la edad al corte del programa.
  const nacimiento = (id: string): string | null => {
    const e = entrada.alumnos[id]?.fecha_nacimiento;
    if (e && nacimientoValido(e, hoy)) return e;
    return capturado.datos?.[id]?.registro?.alumno.fecha_nacimiento ?? null;
  };
  const claveDeOferta = pendientes.map((id) => `${id}:${nacimiento(id) ?? ""}`).join("|");
  const ofertas = useCarga(
    async (senal) => {
      const salida: Record<string, Oferta | null> = {};
      for (const id of pendientes) salida[id] = await cargarOferta(lead, { edad: lead.prospectos.find((p) => p.id === id)?.edad_declarada ?? null, nacimiento: nacimiento(id) }, senal);
      return salida;
    },
    [lead.id, claveDeOferta],
    capturado.datos !== null,
  );

  if (resultado) return <Resultado r={resultado} lead={lead} />;
  if (capturado.error) return <ErrorDeCarga error={capturado.error} alReintentar={capturado.recargar} />;
  if (ofertas.error) return <ErrorDeCarga error={ofertas.error} alReintentar={ofertas.recargar} />;
  if (!capturado.datos || !ofertas.datos) return <Cargando texto="Juntando lo que ya se capturó…" />;

  const ctx: ContextoDePasos = {
    lead,
    faltas: vista.faltantes,
    pendientes,
    capturado: capturado.datos,
    ofertas: ofertas.datos,
    entrada,
    opciones,
    ponerTutor: (campo, valor) => setEntrada((e) => ({ ...e, tutor: { ...e.tutor, [campo]: valor } })),
    ponerAlumno: (id, cambio) => setEntrada((e) => ({ ...e, alumnos: { ...e.alumnos, [id]: { nombre: "", apellidos: "", fecha_nacimiento: "", ...e.alumnos[id], ...cambio } } })),
    ponerGrupo: (id, grupoId) => setEntrada((e) => ({ ...e, grupos: { ...e.grupos, [id]: grupoId } })),
    ponerOpcion: (id, campo, valor) => setOpciones((o) => ({ ...o, [id]: { fecha_inicio: "", dia_corte_pago: "", meses: "", ...o[id], [campo]: valor } })),
    recargarVista: recargar,
  };
  // «Elegir» el grupo que ya traía el expediente cuenta como elegido: lo que se manda es lo que se ve.
  const entradaEfectiva: Entrada = { ...entrada, grupos: Object.fromEntries(pendientes.map((id) => [id, grupoEfectivo(ctx, id)]).filter(([, g]) => g !== "")) };
  const sinPrecio = restantes(vista.faltantes, entradaEfectiva, { hoy, grupoConPrecio: (id) => programaDeGrupo(ctx, id, grupoEfectivo(ctx, id))?.precio != null });
  // Un grupo que se llenó mientras tanto no se puede inscribir: se trata como una falta del paso «Grupo y horario».
  const llenos: Falta[] = pendientes
    .filter((id) => programaDeGrupo(ctx, id, grupoEfectivo(ctx, id))?.grupos.some((g) => g.grupo_id === grupoEfectivo(ctx, id) && g.lleno))
    .map((id) => ({ campo: `prospectos.${id}.grupo_id`, mensaje: "El grupo elegido ya no tiene lugares" }));
  const quedan = [...sinPrecio, ...llenos.filter((l) => !sinPrecio.some((f) => f.campo === l.campo))];
  const pasoActual = PASOS[paso] ?? PASOS[PASOS.length - 1]!;
  const enConfirmar = paso >= PASOS.length;
  const faltasDelPaso = enConfirmar ? [] : delPaso(quedan, pasoActual.id);
  const irAlPaso = (campo: string) => setPaso(Math.min(INDICE_DE[pasoDe(campo)], PASOS.length - 1));

  async function convertir() {
    // Lo que viaja: SOLO lo escrito o elegido. El grupo del expediente (cotización o recomendación) lo deduce el servidor igual que esta pantalla.
    const cuerpo = cuerpoDeConversion(entrada, pendientes, opciones, aEntero);
    const r = await confirmar.ejecutar(() => api.post<ResultadoDeConversion>(`/api/leads/${lead.id}/convertir`, cuerpo));
    if (r) setResultado(r);
  }

  const rechazo = confirmar.error?.detalles.find((d) => d.campo === "motivo")?.mensaje;
  const pasoDelError: Paso | null = confirmar.error ? (rechazo === "faltan_datos" ? (pasoDe(confirmar.error.detalles.find((d) => d.campo && d.campo !== "motivo")?.campo ?? "") ?? "otros") : (PASO_DEL_RECHAZO[rechazo ?? ""] ?? null)) : null;

  return (
    <div className="pila">
      {tareas.datos && tareas.datos.datos.length > 0 ? <Aviso tono="info">El maestro marcó a esta familia como «lista para cerrar».</Aviso> : null}
      <ol className="pasos" aria-label="Pasos de la inscripción">
        {PASOS.map((p, i) => (
          <li key={p.id} aria-current={i === paso ? "step" : undefined} className={i < paso ? "hecho" : undefined}>
            {i + 1}. {p.titulo}
          </li>
        ))}
        <li aria-current={enConfirmar ? "step" : undefined}>{PASOS.length + 1}. Confirmar</li>
      </ol>

      {!enConfirmar ? (
        <>
          <h2>{pasoActual.titulo}</h2>
          {pasoActual.id === "familia" ? <PasoFamilia c={ctx} /> : null}
          {pasoActual.id === "alumnos" ? <PasoAlumnos c={ctx} /> : null}
          {pasoActual.id === "grupo" ? <PasoGrupo c={ctx} /> : null}
          {pasoActual.id === "precio" ? <PasoPrecio c={ctx} /> : null}
          {pasoActual.id === "reglamento" ? <PasoReglamento c={ctx} /> : null}
        </>
      ) : (
        <>
          <h2>Confirmar</h2>
          <PasoConfirmar c={ctx} quedan={quedan} alIrAlPaso={irAlPaso}>
            {confirmar.error ? (
              <Aviso tono="peligro" titulo={confirmar.error.message}>
                {confirmar.error.detalles.filter((d) => d.campo && !["motivo", "prospecto_id"].includes(d.campo)).length > 0 ? (
                  <ul>
                    {confirmar.error.detalles.filter((d) => d.campo && !["motivo", "prospecto_id"].includes(d.campo)).map((d) => (
                      <li key={d.campo}>{etiquetaDeFalta(d.campo ?? "")}</li>
                    ))}
                  </ul>
                ) : null}
                {pasoDelError ? (
                  <Boton
                    onClick={() => {
                      confirmar.limpiar();
                      recargar();
                      ofertas.recargar();
                      setPaso(Math.min(INDICE_DE[pasoDelError], PASOS.length - 1));
                    }}
                  >
                    Volver al paso «{PASOS[Math.min(INDICE_DE[pasoDelError], PASOS.length - 1)]?.titulo}»
                  </Boton>
                ) : null}
              </Aviso>
            ) : null}
          </PasoConfirmar>
        </>
      )}

      <ErrorDeAccion error={confirmar.error && pasoDelError === null && !(confirmar.error instanceof ErrorDeApi && confirmar.error.detalles.length > 0) ? confirmar.error : null} />
      {faltasDelPaso.length > 0 ? (
        <p className="muted" data-prueba="falta-en-el-paso">
          Para seguir falta: {faltasDelPaso.map((f) => etiquetaDeFalta(f.campo)).join(", ")}.
        </p>
      ) : null}
      <div className="barra-guardado">
        <Boton onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
          Atrás
        </Boton>
        {!enConfirmar ? (
          <Boton variante="primario" onClick={() => setPaso((p) => p + 1)} disabled={faltasDelPaso.length > 0}>
            {paso === PASOS.length - 1 ? "Revisar y confirmar" : "Siguiente"}
          </Boton>
        ) : (
          <Boton variante="primario" cargando={confirmar.ocupado} disabled={quedan.length > 0} onClick={() => void convertir()}>
            Convertir e inscribir
          </Boton>
        )}
      </div>
    </div>
  );
}

function Resultado({ r, lead }: { r: ResultadoDeConversion; lead: LeadDetalle }) {
  const { puede } = useSesion();
  return (
    <Tarjeta titulo="Listo: familia e inscripción creadas" className="pila">
      <div className="pila" data-prueba="conversion-lista">
        <ul>
          {r.alumnos.map((a) => (
            <li key={a.prospecto_id}>
              {a.creado ? "Alumno creado" : "El alumno ya existía"} · {a.inscripcion ? (a.inscripcion.creada ? "inscrito" : "ya estaba inscrito en ese grupo") : "sin inscripción"}
            </li>
          ))}
        </ul>
        <div className="fila">
          <EnlaceBoton to={`/leads/${lead.id}`} variante="primario">
            Volver a la ficha
          </EnlaceBoton>
          {r.tutor_id && puede("estado_cuenta:leer") ? <EnlaceBoton to={`/cuenta/${r.tutor_id}`}>Ver el estado de cuenta</EnlaceBoton> : null}
        </div>
      </div>
    </Tarjeta>
  );
}

export default function Conversion() {
  useTitulo("Convertir e inscribir");
  const { id = "" } = useParams();
  const lead = useCarga((senal) => api.get<LeadDetalle>(`/api/leads/${id}`, undefined, senal), [id]);
  const vista = useCarga((senal) => api.get<Vista>(`/api/leads/${id}/conversion`, undefined, senal), [id]);
  const error = lead.error ?? vista.error;
  return (
    <Marco titulo="Convertir e inscribir" subtitulo={<Link to={`/leads/${id}`}>← Volver a la ficha{lead.datos ? ` de ${lead.datos.nombre_contacto ?? "este lead"}` : ""}</Link>}>
      {error ? <ErrorDeCarga error={error} alReintentar={() => { lead.recargar(); vista.recargar(); }} /> : null}
      {!error && (!lead.datos || !vista.datos) ? <Cargando /> : null}
      {lead.datos && vista.datos && vista.datos.ya_convertido ? (
        <Aviso tono="exito" titulo="Todo está convertido e inscrito">
          <p>No queda nada por hacer en este lead.</p>
        </Aviso>
      ) : null}
      {lead.datos && vista.datos && !vista.datos.ya_convertido ? <Asistente lead={lead.datos} vista={vista.datos} recargar={vista.recargar} /> : null}
    </Marco>
  );
}
