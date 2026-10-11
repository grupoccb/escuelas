// Expediente del alumno (`GET /api/alumnos/:id/expediente`): trayectoria, asistencia, económico, comercial y salud en pestañas, bajo un encabezado con el color de su disciplina. Lo económico y lo
// comercial NO existen para el maestro (la API los manda en `null`): la pantalla no les deja ni la pestaña. La salud sale solo con permiso y pide un motivo (`PanelSalud`).

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { hoyLocal } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Cargando, ErrorDeCarga, Insignia, Pagina } from "../../ui/basicos.tsx";
import { ConDisciplina, iniciales } from "../../ui/disciplina.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Icono } from "../../ui/Icono.tsx";
import { Pestanas, propsDePanel } from "../../ui/Pestanas.tsx";
import { AccionesDeInscripcion } from "./AccionesDeInscripcion.tsx";
import { textoDeEdad } from "./alumnos-vista.ts";
import { estadoDelAlumno, vigentes } from "./expediente-vista.ts";
import { PanelAsistencia } from "./PanelAsistencia.tsx";
import { PanelComercial } from "./PanelComercial.tsx";
import { PanelEconomico } from "./PanelEconomico.tsx";
import { PanelSalud } from "./PanelSalud.tsx";
import { PanelTrayectoria } from "./PanelTrayectoria.tsx";
import type { AlumnoDeLista, Expediente as Datos } from "./tipos.ts";
import { useVerticales } from "./useVerticales.ts";
import { nombreCompleto } from "./vista.ts";

type Pestana = "trayectoria" | "asistencia" | "economico" | "comercial" | "salud";

export default function Expediente() {
  const { id = "" } = useParams();
  const { puede } = useSesion();
  const exp = useCarga((senal) => api.get<Datos>(`/api/alumnos/${id}/expediente`, undefined, senal), [id]);
  const alumno = useCarga((senal) => api.get<AlumnoDeLista>(`/api/alumnos/${id}`, undefined, senal), [id]);
  const { colorDe } = useVerticales();
  const [pestana, setPestana] = useState<Pestana>("trayectoria");
  useTitulo(exp.datos ? `Expediente de ${nombreCompleto(exp.datos.alumno)}` : "Expediente");

  if (exp.error) return <Pagina titulo="Expediente"><ErrorDeCarga error={exp.error} alReintentar={exp.recargar} /></Pagina>;
  if (!exp.datos) return <Pagina titulo="Expediente"><Cargando /></Pagina>;
  const d = exp.datos;
  const t = d.trayectoria;
  const hoy = hoyLocal();
  const nombreCompletoDelAlumno = nombreCompleto(d.alumno);
  const pestanas: { id: Pestana; texto: string }[] = [
    { id: "trayectoria", texto: "Trayectoria" },
    ...(d.operativo.asistencia || d.operativo.eventos || d.operativo.productos_comprados ? [{ id: "asistencia" as const, texto: "Asistencia" }] : []),
    ...(d.economico ? [{ id: "economico" as const, texto: "Económico" }] : []),
    ...(d.comercial ? [{ id: "comercial" as const, texto: "Comercial" }] : []),
    ...(puede("salud:leer") ? [{ id: "salud" as const, texto: "Salud" }] : []),
  ];
  const activas = vigentes(t);
  const principal = activas[0] ?? t.inscripciones.at(-1);
  const color = colorDe(principal?.vertical.id);
  const estado = estadoDelAlumno(d.alumno.estatus, t, hoy);
  const adultos = alumno.datos?.tutores ?? [];
  const responsable = adultos.find((x) => x.es_responsable_pago) ?? adultos[0];
  const edad = textoDeEdad(alumno.datos?.edad);

  return (
    <div className="pagina expediente-pagina">
      <Link to="/alumnos" className="enlace-atras">
        <Icono nombre="atras" tamano={16} />
        Alumnos
      </Link>
      <ConDisciplina color={color} as="section" className="expediente-cabecera">
        <div className="expediente-banda" aria-hidden="true" />
        <div className="expediente-identidad">
          <div className="expediente-quien-es">
            <span className="expediente-avatar" aria-hidden="true">
              {iniciales(nombreCompletoDelAlumno)}
            </span>
            <div className="expediente-nombre">
              <h1>{nombreCompletoDelAlumno}</h1>
              <div className="expediente-meta">
                <Insignia tono={estado.tono}>{estado.texto}</Insignia>
                <span>
                  {edad !== "" ? `${edad} · ` : ""}
                  {t.grupo_actual ? <span data-prueba="grupo-actual">{t.grupo_actual.nombre}</span> : <span>Sin grupo vigente</span>}
                  {activas[0] ? ` · ${activas[0].sucursal.nombre}` : ""}
                  {activas.length > 1 ? ` · y ${activas.length - 1} inscripción${activas.length === 2 ? "" : "es"} más` : ""}
                </span>
                {puede("tutores:leer") && responsable ? (
                  <Link className="enlace-tactil" to={`/familias/${responsable.tutor_id}`}>
                    Ver la familia
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
          {puede("inscripciones:escribir") && activas.length === 1 && activas[0] ? <AccionesDeInscripcion inscripcion={activas[0]} nombre={d.alumno.nombre} variante="cabecera" alCambiar={exp.recargar} /> : null}
        </div>
      </ConDisciplina>
      <div className="expediente-pestanas">
        <Pestanas nombre="expediente" etiqueta="Secciones del expediente" pestanas={pestanas} activa={pestana} alCambiar={setPestana} />
      </div>
      <div {...propsDePanel("expediente", pestana)}>
        {pestana === "trayectoria" ? <PanelTrayectoria t={t} eventos={d.operativo.eventos} bajas={d.comercial?.motivo_de_baja} nombre={d.alumno.nombre} puedeEscribir={puede("inscripciones:escribir")} colorDe={(v) => colorDe(v)} hoy={hoy} alCambiar={exp.recargar} /> : null}
        {pestana === "asistencia" ? <PanelAsistencia o={d.operativo} vigentes={activas} puedeVerClases={puede("asistencia:leer") && d.operativo.asistencia !== null} /> : null}
        {pestana === "economico" && d.economico ? <PanelEconomico e={d.economico} responsable={responsable} tutorDeLaCuenta={puede("estado_cuenta:leer") && responsable ? responsable.tutor_id : null} /> : null}
        {pestana === "comercial" && d.comercial ? <PanelComercial c={d.comercial} /> : null}
        {pestana === "salud" && puede("salud:leer") ? <PanelSalud alumnoId={id} nombre={nombreCompletoDelAlumno} /> : null}
      </div>
    </div>
  );
}
