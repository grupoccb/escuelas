// Módulos de la escuela (V1): qué partes del sistema tiene encendidas. La captación (el bot de tres preguntas, el pase al asesor, las tareas, el embudo y el reporte de leads) siempre
// está; los demás se encienden cuando la escuela esté lista. Un módulo apagado desaparece de la barra, sus pantallas dicen «No disponible», el bot no lo ofrece y no manda nada de él.
// Cambiar un interruptor surte efecto de inmediato (sin reiniciar). No se prende nada que necesite otro módulo apagado ni se apaga uno del que otro depende: se dice qué hacer primero.

import { api } from "../../api/cliente.ts";
import type { ModuloId } from "../../api/tipos.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { CampoCasilla } from "../../ui/campos.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Regreso } from "./comunes.tsx";
import { explicarCambioDeModulo, type ModuloDeLista } from "./modulos.ts";

interface Lista {
  modulos: ModuloDeLista[];
}

export default function Modulos() {
  useTitulo("Módulos");
  const { recargar } = useSesion();
  const carga = useCarga((senal) => api.get<Lista>("/api/modulos", undefined, senal), []);
  const cambio = useAccion();

  const cambiar = (id: ModuloId, encendido: boolean) =>
    void cambio.ejecutar(async () => {
      const nueva = await api.put<Lista>("/api/modulos", { [id]: encendido });
      carga.poner(nueva);
      // La barra y las pantallas se arman con /api/yo: se vuelve a pedir para que el cambio se vea de inmediato.
      await recargar();
    });

  const modulos = carga.datos?.modulos ?? [];
  return (
    <Pagina titulo="Módulos" subtitulo="Lo que la escuela tiene encendido. Lo apagado no aparece en pantalla y no manda mensajes." acciones={<Regreso />}>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      <ErrorDeAccion error={cambio.error} />
      {carga.datos ? (
        <>
          <Aviso>Puedes encender y apagar cuando quieras. Al apagar un módulo no se borra nada: sus datos se quedan guardados y vuelven al encenderlo.</Aviso>
          <ul className="lista-tarjetas" data-prueba="modulos">
            {modulos.map((m) => {
              const bloqueo = explicarCambioDeModulo(m, modulos);
              return (
                <li key={m.id} data-prueba={`modulo-${m.id}`}>
                  <Tarjeta
                    titulo={m.nombre}
                    acciones={<Insignia tono={m.encendido ? "exito" : "neutro"}>{m.encendido ? "Encendido" : "Apagado"}</Insignia>}
                  >
                    <div className="pila">
                      <p className="muted">{m.incluye}</p>
                      <CampoCasilla
                        etiqueta={m.obligatorio ? "Siempre encendido" : "Encendido"}
                        checked={m.encendido}
                        disabled={m.obligatorio || bloqueo !== null || cambio.ocupado}
                        onChange={(e) => cambiar(m.id, e.target.checked)}
                        data-prueba={`interruptor-${m.id}`}
                        ayuda={bloqueo}
                      />
                    </div>
                  </Tarjeta>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </Pagina>
  );
}
