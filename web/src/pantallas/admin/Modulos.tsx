// Módulos de la escuela (V1): qué partes del sistema tiene encendidas. La captación (el bot de tres preguntas, el pase al asesor, las tareas, el embudo y el reporte de leads) siempre
// está; los demás se encienden cuando la escuela esté lista. Un módulo apagado desaparece de la barra, sus pantallas dicen «No disponible», el bot no lo ofrece y no manda nada de él.
// Cambiar un interruptor surte efecto de inmediato (sin reiniciar). No se prende nada que necesite otro módulo apagado ni se apaga uno del que otro depende: se dice qué hacer primero.
//
// V7: cada módulo dice qué cambia al moverlo (para quién), apagar pide confirmación y todo cambio avisa que ya surtió efecto.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { ConfirmarAccion } from "./comunes.tsx";
import { Interruptor } from "./piezas.tsx";
import { EncimaDeSistema } from "./sistema.tsx";
import { explicarCambioDeModulo, queCambia, type ModuloDeLista } from "./modulos.ts";

interface Lista {
  modulos: ModuloDeLista[];
}

export default function Modulos() {
  useTitulo("Módulos");
  const { recargar } = useSesion();
  const { avisar } = useAvisos();
  const carga = useCarga((senal) => api.get<Lista>("/api/modulos", undefined, senal), []);
  const cambio = useAccion();
  const [porApagar, setPorApagar] = useState<ModuloDeLista | null>(null);

  const cambiar = async (m: ModuloDeLista, encendido: boolean) => {
    const nueva = await api.put<Lista>("/api/modulos", { [m.id]: encendido });
    carga.poner(nueva);
    // La barra y las pantallas se arman con /api/yo: se vuelve a pedir para que el cambio se vea de inmediato.
    await recargar();
    avisar(`${m.nombre} quedó ${encendido ? "encendido" : "apagado"}. ${queCambia(m.id, encendido)}`);
  };

  const modulos = carga.datos?.modulos ?? [];
  return (
    <Pagina titulo="Módulos" subtitulo="Qué partes del sistema tiene encendidas la escuela. Un módulo apagado no aparece en la barra y sus pantallas dicen «No disponible»." encima={<EncimaDeSistema />}>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      <ErrorDeAccion error={cambio.error} />
      {carga.datos ? (
        <>
          <Aviso>Puedes encender y apagar cuando quieras. Al apagar un módulo no se borra nada: lo que ya estaba guardado se conserva. Pero mientras esté apagado el sistema no hace nada de esa parte (por ejemplo, no genera cobros ni manda avisos), y lo que pasó en ese tiempo no se pone al corriente solo al encenderlo.</Aviso>
          <ul className="lista-tarjetas" data-prueba="modulos">
            {modulos.map((m) => {
              const bloqueo = explicarCambioDeModulo(m, modulos);
              return (
                <li key={m.id} className="item-admin item-modulo" data-prueba={`modulo-${m.id}`}>
                  <div className="item-admin-principal">
                    <div className="modulo-titulo">
                      <h2 className="item-admin-nombre">{m.nombre}</h2>
                      <Insignia tono={m.encendido ? "exito" : "neutro"}>{m.obligatorio ? "Siempre encendido" : m.encendido ? "Encendido" : "Apagado"}</Insignia>
                    </div>
                    <p className="item-admin-meta">{m.incluye}</p>
                    {m.obligatorio ? (
                      <p className="modulo-bloqueo">
                        <Icono nombre="bloquear" tamano={14} />
                        <span>Es la base del sistema</span>
                      </p>
                    ) : (
                      <p className="modulo-efecto" data-prueba={`efecto-${m.id}`}>
                        <strong>{m.encendido ? "Si lo apagas:" : "Si lo enciendes:"}</strong> {queCambia(m.id, !m.encendido)}
                      </p>
                    )}
                    {bloqueo ? (
                      <p className="modulo-bloqueo" id={`bloqueo-${m.id}`}>
                        <Icono nombre="bloquear" tamano={14} />
                        <span>{bloqueo}</span>
                      </p>
                    ) : null}
                  </div>
                  <Interruptor
                    checked={m.encendido}
                    disabled={m.obligatorio || bloqueo !== null || cambio.ocupado}
                    onChange={(e) => {
                      // Apagar toca lo que ven otras personas: se confirma. Encender no quita nada: va directo.
                      if (m.encendido) setPorApagar(m);
                      else void cambio.ejecutar(() => cambiar(m, e.target.checked));
                    }}
                    data-prueba={`interruptor-${m.id}`}
                    aria-describedby={bloqueo ? `bloqueo-${m.id}` : undefined}
                  >
                    {m.obligatorio ? "Siempre encendido" : "Encendido"}
                  </Interruptor>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <ConfirmarAccion
        abierto={porApagar !== null}
        titulo={`Apagar ${porApagar?.nombre ?? ""}`}
        textoDeConfirmar={`Apagar ${porApagar?.nombre ?? ""}`}
        alCerrar={() => setPorApagar(null)}
        alConfirmar={async () => {
          if (porApagar) await cambiar(porApagar, false);
        }}
      >
        <p>{porApagar ? queCambia(porApagar.id, false) : ""}</p>
        <Aviso>Lo que ya estaba guardado se conserva y vuelve a verse cuando lo enciendas. Pero mientras esté apagado no se genera nada nuevo de esa parte (cobros del mes, avisos, recordatorios) y al encenderlo no se recupera lo que pasó en ese tiempo. Surte efecto enseguida, para todas las personas de la escuela.</Aviso>
      </ConfirmarAccion>
    </Pagina>
  );
}
