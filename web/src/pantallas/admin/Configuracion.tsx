// Configuración de la organización: el horario de los mensajes automáticos, los topes de mensajes, los tiempos del asistente, las vigencias y los umbrales que antes eran valores fijos, y quién
// cierra la inscripción. Cada ajuste muestra su rango, su valor de siempre y qué pasa si se cambia. Los rangos salen del servidor (los mismos que impone la base). Cada cambio queda en el
// registro de cambios y surte efecto en la siguiente petición, sin reiniciar.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { horaDeMinutos } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { problemaDeAjuste } from "./ayudas.ts";
import { Regreso } from "./comunes.tsx";
import { NOMBRE_DE_MODULO } from "./mensajeria.ts";
import type { Configuracion as Datos, LimiteDeAjuste } from "./tipos.ts";

const UNIDAD: Record<LimiteDeAjuste["unidad"], string> = { dias: "días", horas: "horas", minutos: "minutos", mensajes: "mensajes", faltas: "faltas", intentos: "intentos", porcentaje: "%", hora_del_dia: "" };
const UNIDAD_EN_SINGULAR: Partial<Record<LimiteDeAjuste["unidad"], string>> = { dias: "día", horas: "hora", minutos: "minuto", mensajes: "mensaje", faltas: "falta", intentos: "intento" };
/** La unidad que acompaña a una cantidad concreta: «1 mensaje», «7 días» (V7: antes decía «1 mensajes»). */
const unidadDe = (u: LimiteDeAjuste["unidad"], n: number): string => (n === 1 ? (UNIDAD_EN_SINGULAR[u] ?? UNIDAD[u]) : UNIDAD[u]);

type Clave = Exclude<keyof Datos, "limites" | "sucursal_sin_programa" | "modo_cierre">;

const verValor = (l: LimiteDeAjuste, n: number): string => (l.unidad === "hora_del_dia" ? horaDeMinutos(n) : String(n));

function Formulario({ datos, alGuardar }: { datos: Datos; alGuardar: (d: Datos) => void }) {
  const { moduloEncendido } = useSesion();
  const claves = Object.keys(datos.limites) as Clave[];
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(claves.map((k) => [k, verValor(datos.limites[k]!, datos[k])])));
  const [modo, setModo] = useState<string>(datos.modo_cierre);
  const [politica, setPolitica] = useState<string>(datos.sucursal_sin_programa);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];

  // Los grupos, en el orden en que los trae el servidor.
  const grupos: { titulo: string; claves: Clave[] }[] = [];
  for (const k of claves) {
    const t = datos.limites[k]!.grupo;
    const g = grupos.find((x) => x.titulo === t);
    if (g) g.claves.push(k);
    else grupos.push({ titulo: t, claves: [k] });
  }

  const campo = (k: Clave) => {
    const l = datos.limites[k]!;
    const horaDelDia = l.unidad === "hora_del_dia";
    const apagado = l.modulo !== null && !moduloEncendido(l.modulo);
    return (
      <CampoTexto
        key={k}
        etiqueta={l.etiqueta}
        {...(horaDelDia ? { type: "time", min: "09:00", max: "20:00" } : { inputMode: "numeric" as const })}
        value={valores[k] ?? ""}
        onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
        error={err(k)}
        ayuda={
          <>
            {l.ayuda} {horaDelDia ? `(de ${horaDeMinutos(l.min)} a ${horaDeMinutos(l.max)})` : `(de ${l.min} a ${l.max}${UNIDAD[l.unidad] ? ` ${UNIDAD[l.unidad]}` : ""})`} De siempre: {verValor(l, l.por_omision)}
            {horaDelDia ? "" : UNIDAD[l.unidad] ? ` ${unidadDe(l.unidad, l.por_omision)}` : ""}.
            <br />
            <strong>Qué pasa si lo cambias:</strong> {l.efecto}
            {apagado ? (
              <>
                <br />
                <strong>Ojo:</strong> el módulo «{NOMBRE_DE_MODULO[l.modulo!]}» está apagado. Puedes dejar este valor listo, pero no hace nada hasta que lo enciendas.
              </>
            ) : null}
          </>
        }
      />
    );
  };

  return (
    <form
      className="pila config-formulario"
      data-prueba="formulario-configuracion"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const cuerpo: Record<string, unknown> = { modo_cierre: modo, sucursal_sin_programa: politica };
        const nuevos: Record<string, number> = {};
        for (const k of claves) {
          const r = problemaDeAjuste(datos.limites[k]!, valores[k] ?? "");
          if ("error" in r) e[k] = r.error;
          else {
            nuevos[k] = r.valor;
            if (r.valor !== datos[k]) cuerpo[k] = r.valor;
          }
        }
        // Las reglas entre dos ajustes: el servidor también las juzga, pero aquí se avisa sin ir y volver.
        if (!e["horario_envio_inicio_min"] && !e["horario_envio_fin_min"] && (nuevos["horario_envio_inicio_min"] ?? 0) >= (nuevos["horario_envio_fin_min"] ?? 0)) e["horario_envio_inicio_min"] = "La hora de inicio debe ser antes que la hora de fin. Cambia una de las dos.";
        if (!e["ocupacion_vacio_pct"] && !e["ocupacion_a_reventar_pct"] && (nuevos["ocupacion_vacio_pct"] ?? 0) >= (nuevos["ocupacion_a_reventar_pct"] ?? 0)) e["ocupacion_vacio_pct"] = "El porcentaje de «vacío» debe ser menor que el de «a reventar». Baja uno o sube el otro.";
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
      <div className="config-pares">
        <Tarjeta titulo="Quién cierra la inscripción">
          <CampoSelect
            etiqueta="Modo de cierre"
            ayuda="Con «el maestro, en sitio», a cada maestro le aparece «Inscribir a mi alumno» en su pantalla «Hoy» cuando el alumno ya tiene su registro completo y la familia aceptó el reglamento. Con «el asesor», el maestro solo avisa que la familia quedó lista."
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
            ayuda="Cuando la sucursal que eligió la familia no tiene programa para la edad. Con «ofrecer la otra sucursal», el asistente le propone la que sí lo tiene; con «avisar al asesor», pasa la conversación de inmediato."
            value={politica}
            opciones={[
              { valor: "ofrecer_otra", texto: "Ofrecer la otra sucursal que sí lo tiene" },
              { valor: "avisar_asesor", texto: "Avisar al asesor directamente" },
            ]}
            onChange={(e) => setPolitica(e.target.value)}
          />
        </Tarjeta>
      </div>
      {grupos.map((g) => (
        <Tarjeta key={g.titulo} titulo={g.titulo}>
          {g.titulo === "Horario de los mensajes automáticos" ? (
            <Aviso>Puedes dejar el horario más corto, pero nunca más largo: los mensajes que inicia el sistema (recordatorios, reenganche, avisos de pago) jamás salen antes de las 09:00 ni después de las 20:00, hora de cada sucursal. Responder a quien acaba de escribir no tiene horario. La zona horaria se ajusta en cada sucursal.</Aviso>
          ) : null}
          <div className="config-campos">{g.claves.map(campo)}</div>
        </Tarjeta>
      ))}
      <ErrorDeAccion error={guardar.error} />
      <div className="barra-guardado">
        {guardado ? (
          <p className="barra-guardado-estado barra-guardado-estado-ok" role="status">
            <Icono nombre="exito" tamano={18} />
            Configuración guardada.
          </p>
        ) : null}
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
    <Pagina titulo="Configuración de la escuela" subtitulo="Horario de los mensajes automáticos, topes de mensajes, tiempos del asistente, vigencias y umbrales." acciones={<Regreso />}>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos ? <Formulario datos={carga.datos} alGuardar={carga.poner} /> : null}
    </Pagina>
  );
}
