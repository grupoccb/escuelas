// Ficha de la familia: el adulto (contacto), sus hijos con las banderas de cada relación, el saldo y los accesos al expediente de cada hijo y a sus pagos.

import { Link, useParams } from "react-router-dom";
import { api } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { formatearInstante } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Cargando, EnlaceBoton, ErrorDeCarga, Insignia, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useCarga, useTitulo } from "../../ui/hooks.ts";
import { FamiliaElegida, iniciales } from "../recepcion/FamiliaElegida.tsx";
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

/** «0.00» → false: el importe viene como texto del servidor, sin números flotantes. */
const haVencido = (importe: string): boolean => !/^0+(\.0+)?$/.test(importe.trim());

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
      subtitulo={
        <FamiliaElegida tutor={t} />
      }
      acciones={
        <>
          {verCuenta ? <EnlaceBoton to={`/cuenta/${t.id}`}>Estado de cuenta</EnlaceBoton> : null}
          {puede("pagos:registrar") ? <EnlaceBoton to={`/pagos?tutor=${t.id}`} variante="primario" className="boton-accion-celular">Registrar pago</EnlaceBoton> : null}
        </>
      }
    >
      <div className={`ficha-familia${verCuenta ? "" : " ficha-familia-sin-saldo"}`}>
        {verCuenta ? (
          <Tarjeta titulo="Saldo" className="ficha-familia-saldo">
            {cuenta.error ? <ErrorDeCarga error={cuenta.error} alReintentar={cuenta.recargar} /> : null}
            {cuenta.cargando && !cuenta.datos ? <Cargando /> : null}
            {cuenta.datos ? (
              <div className="pila" data-prueba="saldo-de-la-familia">
                <div className="fila fila-entre">
                  <p className="cifra-principal" data-prueba="saldo">
                    {formatear(cuenta.datos.resumen.saldo)}
                  </p>
                  {haVencido(cuenta.datos.resumen.vencido) ? (
                    <Insignia tono="peligro">
                      <span className="insignia-con-icono">
                        <Icono nombre="alerta" tamano={14} />
                        Con pagos vencidos
                      </span>
                    </Insignia>
                  ) : (
                    <Insignia tono="exito">
                      <span className="insignia-con-icono">
                        <Icono nombre="exito" tamano={14} />
                        Nada vencido
                      </span>
                    </Insignia>
                  )}
                </div>
                <dl className="datos">
                  <dt>Vencido</dt>
                  <dd data-prueba="vencido">{formatear(cuenta.datos.resumen.vencido)}</dd>
                  <dt>Pagado</dt>
                  <dd>{formatear(cuenta.datos.resumen.total_pagado)}</dd>
                </dl>
              </div>
            ) : null}
          </Tarjeta>
        ) : null}

        <Tarjeta titulo={`Hijos (${t.alumnos.length})`} className="ficha-familia-hijos">
          {t.alumnos.length === 0 ? <Aviso>Esta familia todavía no tiene alumnos.</Aviso> : null}
          <ul className="lista-tarjetas" data-prueba="hijos">
            {t.alumnos.map((a) => (
              <li key={a.alumno_id} className="pila" data-prueba={`hijo-${a.alumno_id}`}>
                <div className="alumno-fila">
                  <span className="avatar-familia" aria-hidden="true">
                    {iniciales(a.nombre, a.apellidos)}
                  </span>
                  <span className="alumno-fila-texto">
                    <strong className="familia-nombre">{nombreCompleto(a)}</strong>
                    <span className="muted">{a.parentesco}</span>
                  </span>
                  <Link className="boton boton-icono" to={`/alumnos/${a.alumno_id}`} aria-label={`Ver expediente de ${nombreCompleto(a)}`} title="Ver expediente">
                    <Icono nombre="siguiente" tamano={20} />
                  </Link>
                </div>
                <div className="fila">
                  <Insignia tono={ESTATUS_DE_ALUMNO[a.estatus]?.tono ?? "neutro"}>{ESTATUS_DE_ALUMNO[a.estatus]?.texto ?? a.estatus}</Insignia>
                  {banderasDe(a).map((b) => (
                    <Insignia key={b}>{b}</Insignia>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>

        <Tarjeta titulo="Adulto" className="ficha-familia-adulto">
          <dl className="datos" data-prueba="datos-del-tutor">
            <dt>Nombre</dt>
            <dd>{nombreCompleto(t)}</dd>
            <dt>Teléfono</dt>
            <dd className="numero">{t.telefono}</dd>
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
      </div>
    </Pagina>
  );
}
