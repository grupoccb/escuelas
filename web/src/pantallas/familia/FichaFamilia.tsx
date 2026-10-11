// Ficha de la familia (README «Ficha de la familia»): quién es la familia (monograma, nombre, teléfono, correo y desde cuándo), sus hijos con la disciplina de cada uno y lo que dicen de sus
// adultos, los adultos con sus banderas, el saldo con el acceso al estado de cuenta y los mensajes. Acciones: «Abrir conversación» (si hay conversación y Chatwoot configurado) y «Registrar pago».

import { Link, useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { urlDeConversacion } from "../../lib/chatwoot.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Cargando, EnlaceBoton, ErrorDeCarga, Pagina } from "../../ui/basicos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { Icono } from "../../ui/Icono.tsx";
import { iniciales } from "../recepcion/FamiliaElegida.tsx";
import type { EstadoDeCuenta } from "../recepcion/tipos.ts";
import { AdultosDeLaFamilia } from "./AdultosDeLaFamilia.tsx";
import { HijosDeLaFamilia, type HijoDeLaFicha } from "./HijosDeLaFamilia.tsx";
import { MensajesDeLaFamilia } from "./MensajesDeLaFamilia.tsx";
import { adultosDeLaFamilia, textoDeFamiliaDesde, type MensajesDeFamilia } from "./resumen-de-familia.ts";
import { SaldoDeLaFamilia } from "./SaldoDeLaFamilia.tsx";
import type { AlumnoDeLista, VinculoDeAlumno } from "./tipos.ts";
import { useResumenDeFamilias } from "./useResumenDeFamilias.ts";
import { nombreCompleto } from "./vista.ts";

interface TutorCompleto {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string;
  correo: string | null;
  direccion: string | null;
  como_nos_conocio: string | null;
  creado_en: string;
  alumnos: { alumno_id: string; nombre: string; apellidos: string; estatus: string; fecha_nacimiento: string; parentesco: string; es_responsable_pago: boolean; es_contacto_urgencia: boolean; puede_recoger: boolean; lo_lleva: boolean }[];
}

/** Los hijos de la ficha: los del tutor (todos los que ve), enriquecidos con la edad y los adultos de cada uno si la lista de alumnos los trae; si no, solo con lo que dice este tutor. */
function hijosDeLaFicha(t: TutorCompleto, alumnos: readonly AlumnoDeLista[] | undefined): HijoDeLaFicha[] {
  const porId = new Map((alumnos ?? []).map((a) => [a.id, a]));
  return t.alumnos.map((a) => {
    const completo = porId.get(a.alumno_id);
    const suyo: VinculoDeAlumno = { tutor_id: t.id, nombre: t.nombre, apellidos: t.apellidos, parentesco: a.parentesco, es_responsable_pago: a.es_responsable_pago, es_contacto_urgencia: a.es_contacto_urgencia, puede_recoger: a.puede_recoger, lo_lleva: a.lo_lleva, telefono: t.telefono, correo: t.correo };
    return { alumnoId: a.alumno_id, nombre: a.nombre, apellidos: a.apellidos, estatus: a.estatus, edad: completo?.edad ?? null, vinculos: completo?.tutores ?? [suyo] };
  });
}

export default function FichaFamilia() {
  const { tutorId = "" } = useParams();
  const { puede, yo, moduloEncendido } = useSesion();
  const tutor = useCarga((senal) => api.get<TutorCompleto>(`/api/tutores/${tutorId}`, undefined, senal), [tutorId]);
  const verCuenta = puede("estado_cuenta:leer");
  const cuenta = useCarga((senal) => api.get<EstadoDeCuenta>(`/api/tutores/${tutorId}/estado-cuenta`, undefined, senal), [tutorId], verCuenta);
  // Lo que enriquece la ficha es de adorno: si falla, los hijos salen con lo que dice el tutor y sin edad, grupo ni adultos de más.
  const alumnos = useCarga((senal) => api.get<{ datos: AlumnoDeLista[] }>("/api/alumnos", { tutor_id: tutorId, limite: 100 }, senal), [tutorId], puede("alumnos:leer"));
  const mensajes = useCarga((senal) => api.get<MensajesDeFamilia>(`/api/familias/${tutorId}/mensajes`, undefined, senal), [tutorId], puede("tutores:leer"));
  const resumen = useResumenDeFamilias(tutorId === "" ? [] : [tutorId]).get(tutorId);
  useTitulo(tutor.datos ? `Familia ${nombreCompleto(tutor.datos)}` : "Familia");

  if (tutor.error) return <Pagina titulo="Familia"><ErrorDeCarga error={tutor.error} alReintentar={tutor.recargar} /></Pagina>;
  if (!tutor.datos) return <Pagina titulo="Familia"><Cargando /></Pagina>;
  const t = tutor.datos;
  const hijos = hijosDeLaFicha(t, alumnos.datos?.datos);
  const adultos = adultosDeLaFamilia(hijos.map((h) => ({ id: h.alumnoId, nombre: h.nombre, tutores: h.vinculos })), t.id);
  const urlDeChat = mensajes.datos?.conversacion ? urlDeConversacion(yo?.configuracion.chatwoot_url_publica ?? null, mensajes.datos.conversacion.chatwoot) : null;
  const detalle = [t.telefono, t.correo, textoDeFamiliaDesde(t.creado_en)].filter(Boolean).join(" · ");

  return (
    <div className="pagina">
      <Link className="enlace-atras" to="/familias">
        <Icono nombre="atras" tamano={16} />
        Familias
      </Link>
      <header className="ficha-cabecera">
        <div className="ficha-identidad">
          <span className="avatar-familia avatar-ficha" aria-hidden="true">
            {iniciales(t.nombre, t.apellidos)}
          </span>
          <div className="ficha-identidad-texto">
            <h1>{nombreCompleto(t)}</h1>
            <span className="numero muted">{detalle}</span>
          </div>
        </div>
        <div className="ficha-acciones">
          {urlDeChat ? (
            <a className="boton" href={urlDeChat} target="_blank" rel="noopener noreferrer" data-prueba="enlace-chatwoot">
              <Icono nombre="chatwoot" tamano={18} />
              Abrir conversación
            </a>
          ) : null}
          {puede("pagos:registrar") ? (
            <EnlaceBoton to={`/pagos?tutor=${t.id}`} variante="primario" className="boton-accion-celular">
              Registrar pago
            </EnlaceBoton>
          ) : null}
        </div>
      </header>
      <div className="ficha-columnas">
        <div className="ficha-columna ficha-columna-principal">
          <HijosDeLaFamilia hijos={hijos} resumen={resumen} />
          <AdultosDeLaFamilia adultos={adultos} />
        </div>
        <aside className="ficha-columna ficha-columna-lateral" aria-label="Saldo y mensajes">
          {verCuenta ? <SaldoDeLaFamilia tutorId={t.id} cuenta={cuenta} /> : null}
          <MensajesDeLaFamilia mensajes={mensajes} conCobranza={verCuenta && moduloEncendido("finanzas")} />
        </aside>
      </div>
    </div>
  );
}
