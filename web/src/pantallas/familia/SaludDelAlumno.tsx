// Salud del alumno en una pantalla APARTE del expediente (administrador y maestro: `salud:leer`). El contenido sensible vive en `salud/VistaDeSalud.tsx`.

import { useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { VistaDeSalud } from "../../salud/VistaDeSalud.tsx";
import { Cargando, EnlaceBoton, ErrorDeCarga, Pagina } from "../../ui/basicos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import type { AlumnoDeLista } from "./tipos.ts";
import { nombreCompleto } from "./vista.ts";

export default function SaludDelAlumno() {
  useTitulo("Salud del alumno");
  const { id = "" } = useParams();
  const alumno = useCarga((senal) => api.get<AlumnoDeLista>(`/api/alumnos/${id}`, undefined, senal), [id]);
  if (alumno.error) return <Pagina titulo="Salud"><ErrorDeCarga error={alumno.error} alReintentar={alumno.recargar} /></Pagina>;
  if (!alumno.datos) return <Pagina titulo="Salud"><Cargando /></Pagina>;
  return (
    <Pagina titulo={`Salud de ${nombreCompleto(alumno.datos)}`} acciones={<EnlaceBoton to={`/alumnos/${id}`}>Volver al expediente</EnlaceBoton>}>
      <VistaDeSalud key={id} alumnoId={id} />
    </Pagina>
  );
}
