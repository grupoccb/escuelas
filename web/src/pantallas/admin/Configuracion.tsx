// Configuración de la organización: los topes, vigencias y umbrales que antes eran valores fijos, y quién cierra la inscripción. Los rangos salen del servidor (los mismos
// que impone la base). Cada cambio queda en el registro de cambios.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { enteroDe } from "./ayudas.ts";
import { Regreso } from "./comunes.tsx";
import type { Configuracion as Datos } from "./tipos.ts";

const NUMERICOS = ["max_automaticos_por_dia", "max_marketing_por_ventana", "ventana_marketing_dias", "cotizacion_vigencia_dias", "lista_espera_oferta_horas", "clase_muestra_anticipacion_min", "clase_muestra_horizonte_dias", "clase_muestra_correccion_horas", "umbral_faltas_consecutivas", "umbral_dias_deuda"] as const;
type Clave = (typeof NUMERICOS)[number];

const GRUPOS: { titulo: string; claves: Clave[] }[] = [
  { titulo: "Frecuencia de mensajes", claves: ["max_automaticos_por_dia", "max_marketing_por_ventana", "ventana_marketing_dias"] },
  { titulo: "Cotizaciones y lista de espera", claves: ["cotizacion_vigencia_dias", "lista_espera_oferta_horas"] },
  { titulo: "Clase muestra", claves: ["clase_muestra_anticipacion_min", "clase_muestra_horizonte_dias", "clase_muestra_correccion_horas"] },
  { titulo: "Avisos al asesor", claves: ["umbral_faltas_consecutivas", "umbral_dias_deuda"] },
];

function Formulario({ datos, alGuardar }: { datos: Datos; alGuardar: (d: Datos) => void }) {
  const [valores, setValores] = useState<Record<Clave, string>>(() => Object.fromEntries(NUMERICOS.map((k) => [k, String(datos[k])])) as Record<Clave, string>);
  const [modo, setModo] = useState<string>(datos.modo_cierre);
  const [politica, setPolitica] = useState<string>(datos.sucursal_sin_programa);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];

  return (
    <form
      className="pila"
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const cuerpo: Record<string, unknown> = { modo_cierre: modo, sucursal_sin_programa: politica };
        for (const k of NUMERICOS) {
          const l = datos.limites[k]!;
          const n = enteroDe(valores[k], l.min, l.max);
          if (n === null) e[k] = `Escribe un número de ${l.min} a ${l.max}`;
          else if (n !== datos[k]) cuerpo[k] = n;
        }
        setLocal(e);
        setGuardado(false);
        if (Object.keys(e).length > 0) return;
        void guardar.ejecutar(async () => {
          const nuevo = await api.patch<Datos>("/api/configuracion", cuerpo);
          setGuardado(true);
          alGuardar(nuevo);
        });
      }}
    >
      <Tarjeta titulo="Quién cierra la inscripción">
        <CampoSelect
          etiqueta="Modo de cierre"
          value={modo}
          opciones={[
            { valor: "asesor_whatsapp", texto: "El asesor, por WhatsApp (el maestro marca «listo para cerrar»)" },
            { valor: "maestro_en_sitio", texto: "El maestro, en sitio, al terminar la clase muestra" },
          ]}
          onChange={(e) => setModo(e.target.value)}
        />
      </Tarjeta>
      <Tarjeta titulo="Sucursal sin el programa buscado">
        <CampoSelect
          etiqueta="Qué hace el bot"
          value={politica}
          opciones={[
            { valor: "ofrecer_otra", texto: "Ofrecer la otra sucursal que sí lo tiene" },
            { valor: "avisar_asesor", texto: "Avisar al asesor directamente" },
          ]}
          onChange={(e) => setPolitica(e.target.value)}
        />
      </Tarjeta>
      {GRUPOS.map((g) => (
        <Tarjeta key={g.titulo} titulo={g.titulo}>
          <div className="pila">
            {g.claves.map((k) => (
              <CampoTexto key={k} etiqueta={datos.limites[k]!.etiqueta} inputMode="numeric" value={valores[k]} onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))} error={err(k)} ayuda={`${datos.limites[k]!.ayuda} (de ${datos.limites[k]!.min} a ${datos.limites[k]!.max})`} />
            ))}
          </div>
        </Tarjeta>
      ))}
      <Aviso>Los mensajes que inicia el sistema nunca salen fuera de las 09:00 a 20:00 de la sucursal: ese horario no se configura aquí.</Aviso>
      <ErrorDeAccion error={guardar.error} />
      {guardado ? <Aviso tono="exito">Configuración guardada.</Aviso> : null}
      <div>
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar la configuración
        </Boton>
      </div>
    </form>
  );
}

export default function Configuracion() {
  useTitulo("Configuración");
  const carga = useCarga((senal) => api.get<Datos>("/api/configuracion", undefined, senal), []);
  return (
    <Pagina titulo="Configuración de la escuela" subtitulo="Topes de mensajes, vigencias y umbrales." acciones={<Regreso />}>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos ? <Formulario datos={carga.datos} alGuardar={carga.poner} /> : null}
    </Pagina>
  );
}
