// Ficha de la familia: el adulto (contacto), sus hijos con las banderas de cada relación, el saldo y los accesos al expediente de cada hijo y a sus pagos.

import { useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { formatearInstante } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Cargando, EnlaceBoton, ErrorDeCarga, Insignia, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import type { EstadoDeCuenta } from "../recepcion/tipos.ts";
import { ESTATUS_DE_ALUMNO, banderasDe, nombreCompleto } from "./vista.ts";

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

export default function FichaFamilia() {
  const { tutorId = "" } = useParams();
  const { puede } = useSesion();
  const tutor = useCarga((senal) => api.get<TutorCompleto>(`/api/tutores/${tutorId}`, undefined, senal), [tutorId]);
  const verCuenta = puede("estado_cuenta:leer");
  const cuenta = useCarga((senal) => api.get<EstadoDeCuenta>(`/api/tutores/${tutorId}/estado-cuenta`, undefined, senal), [tutorId], verCuenta);
  useTitulo(tutor.datos ? `Familia ${nombreCompleto(tutor.datos)}` : "Familia");

  if (tutor.error) return <Pagina titulo="Familia"><ErrorDeCarga error={tutor.error} alReintentar={tutor.recargar} /></Pagina>;
  if (!tutor.datos) return <Pagina titulo="Familia"><Cargando /></Pagina>;
  const t = tutor.datos;

  return (
    <Pagina
      titulo={`Familia ${nombreCompleto(t)}`}
      subtitulo={t.telefono}
      acciones={
        <>
          {verCuenta ? <EnlaceBoton to={`/cuenta/${t.id}`}>Estado de cuenta</EnlaceBoton> : null}
          {puede("pagos:registrar") ? <EnlaceBoton to={`/pagos?tutor=${t.id}`} variante="primario">Registrar pago</EnlaceBoton> : null}
        </>
      }
    >
      <Tarjeta titulo="Adulto">
        <dl className="datos" data-prueba="datos-del-tutor">
          <dt>Nombre</dt>
          <dd>{nombreCompleto(t)}</dd>
          <dt>Teléfono</dt>
          <dd>{t.telefono}</dd>
          <dt>Correo</dt>
          <dd>{t.correo ?? "—"}</dd>
          <dt>Dirección</dt>
          <dd>{t.direccion ?? "—"}</dd>
          <dt>Nos conoció por</dt>
          <dd>{t.como_nos_conocio ?? "—"}</dd>
          <dt>Alta</dt>
          <dd>{formatearInstante(t.creado_en)}</dd>
        </dl>
      </Tarjeta>

      {verCuenta ? (
        <Tarjeta titulo="Saldo">
          {cuenta.error ? <ErrorDeCarga error={cuenta.error} alReintentar={cuenta.recargar} /> : null}
          {cuenta.cargando && !cuenta.datos ? <Cargando /> : null}
          {cuenta.datos ? (
            <dl className="datos" data-prueba="saldo-de-la-familia">
              <dt>Saldo</dt>
              <dd data-prueba="saldo">
                <strong>{formatear(cuenta.datos.resumen.saldo)}</strong>
              </dd>
              <dt>Vencido</dt>
              <dd data-prueba="vencido">
                <strong>{formatear(cuenta.datos.resumen.vencido)}</strong>
              </dd>
              <dt>Pagado</dt>
              <dd>{formatear(cuenta.datos.resumen.total_pagado)}</dd>
            </dl>
          ) : null}
        </Tarjeta>
      ) : null}

      <Tarjeta titulo={`Hijos (${t.alumnos.length})`}>
        {t.alumnos.length === 0 ? <Aviso>Esta familia todavía no tiene alumnos.</Aviso> : null}
        <ul className="lista-tarjetas" data-prueba="hijos">
          {t.alumnos.map((a) => (
            <li key={a.alumno_id} className="pila" data-prueba={`hijo-${a.alumno_id}`}>
              <div className="fila fila-entre">
                <span>
                  <strong>{nombreCompleto(a)}</strong> <span className="muted">· {a.parentesco}</span>
                </span>
                <Insignia tono={ESTATUS_DE_ALUMNO[a.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_ALUMNO[a.estatus]?.texto ?? a.estatus}</Insignia>
              </div>
              <div className="fila">
                {banderasDe(a).map((b) => (
                  <Insignia key={b} tono="info">
                    {b}
                  </Insignia>
                ))}
              </div>
              <div>
                <EnlaceBoton to={`/alumnos/${a.alumno_id}`}>Ver expediente</EnlaceBoton>
              </div>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </Pagina>
  );
}
