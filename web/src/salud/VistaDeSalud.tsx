// Vista de la salud de un alumno (administrador y maestro del grupo: `salud:leer`). Los datos sensibles de un menor (decisión 12):
//   - solo viven en la MEMORIA de este componente: nada en `localStorage`, `sessionStorage`, la URL ni la consola (`check:sensibles` lo vigila);
//   - no se piden hasta que quien mira da un MOTIVO; cada lectura queda en el registro de accesos del servidor;
//   - se ocultan solos a los 2 minutos, al cambiar de pestaña o de pantalla, o con «Ocultar»;
//   - la API los manda sin caché (`Cache-Control: no-store`) y la petición se hace con `cache: "no-store"`.

import { useEffect, useRef, useState } from "react";
import { api } from "../api/cliente.ts";
import { Aviso, Boton, ErrorDeAccion, Insignia } from "../ui/basicos.tsx";
import { CampoTexto } from "../ui/campos.tsx";
import { useAccion } from "../ui/hooks.ts";

interface Ficha {
  existe: boolean;
  campos: { alergias?: string | null; condiciones_medicas?: string | null; medicamentos?: string | null; contacto_emergencia?: { nombre?: string; telefono?: string; parentesco?: string } | null; autorizacion_atencion_medica?: boolean | null };
}

const SEGUNDOS_VISIBLE = 120;

export function VistaDeSalud({ alumnoId }: { alumnoId: string }) {
  const [motivo, setMotivo] = useState("");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [restan, setRestan] = useState(0);
  const leer = useAccion();
  const temporizador = useRef<number | undefined>(undefined);

  const ocultar = () => {
    window.clearInterval(temporizador.current);
    setFicha(null);
    setRestan(0);
  };

  // Se borra al salir de la pantalla y cuando la pestaña deja de verse.
  useEffect(() => {
    const alOcultarPagina = () => {
      if (document.hidden) {
        window.clearInterval(temporizador.current);
        setFicha(null);
        setRestan(0);
      }
    };
    document.addEventListener("visibilitychange", alOcultarPagina);
    return () => {
      document.removeEventListener("visibilitychange", alOcultarPagina);
      window.clearInterval(temporizador.current);
    };
  }, []);

  async function ver() {
    const f = await leer.ejecutar(() => api.get<Ficha>(`/api/salud/alumno/${alumnoId}`, { motivo: motivo.trim() }));
    if (!f) return;
    setFicha(f);
    setRestan(SEGUNDOS_VISIBLE);
    window.clearInterval(temporizador.current);
    temporizador.current = window.setInterval(() => {
      setRestan((r) => {
        if (r <= 1) {
          window.clearInterval(temporizador.current);
          setFicha(null);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  const c = ficha?.campos;
  const valor = (t: string | null | undefined) => (t && t.trim() !== "" ? t : "Sin registrar");

  return (
    <div className="pila" data-prueba="vista-de-salud">
      <Aviso tono="alerta" titulo="Datos sensibles de un menor">
        Cada consulta queda registrada con tu nombre y el motivo. No se guardan en este dispositivo y se ocultan solos a los {SEGUNDOS_VISIBLE / 60} minutos.
      </Aviso>
      {!ficha ? (
        <form
          className="formulario"
          onSubmit={(e) => {
            e.preventDefault();
            void ver();
          }}
        >
          <CampoTexto etiqueta="Motivo de la consulta" requerido autoComplete="off" value={motivo} onChange={(e) => setMotivo(e.target.value)} ayuda="Por ejemplo: «Clase de hoy» o «Llamada de la familia». Mínimo 3 caracteres." />
          <ErrorDeAccion error={leer.error} />
          <div>
            <Boton type="submit" variante="primario" disabled={motivo.trim().length < 3} cargando={leer.ocupado}>
              Ver datos de salud
            </Boton>
          </div>
        </form>
      ) : (
        <div className="pila" data-prueba="ficha-de-salud">
          <div className="fila fila-entre">
            <Insignia tono="info">Se ocultan en {restan} s</Insignia>
            <Boton onClick={ocultar}>Ocultar</Boton>
          </div>
          {!ficha.existe ? <Aviso>Todavía no hay ficha de salud de este alumno.</Aviso> : null}
          <dl className="datos">
            <dt>Alergias</dt>
            <dd>{valor(c?.alergias)}</dd>
            <dt>Condiciones médicas</dt>
            <dd>{valor(c?.condiciones_medicas)}</dd>
            <dt>Medicamentos</dt>
            <dd>{valor(c?.medicamentos)}</dd>
            <dt>Contacto de emergencia</dt>
            <dd>{c?.contacto_emergencia ? [c.contacto_emergencia.nombre, c.contacto_emergencia.parentesco, c.contacto_emergencia.telefono].filter(Boolean).join(" · ") : "Sin registrar"}</dd>
            <dt>Atención médica de urgencia</dt>
            <dd>{c?.autorizacion_atencion_medica === undefined || c.autorizacion_atencion_medica === null ? "Sin responder" : c.autorizacion_atencion_medica ? "Autorizada" : "No autorizada"}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
