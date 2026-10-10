// Textos del asistente: lo que el asistente de WhatsApp dice en cada paso, redactado a la manera de la escuela. El asistente sigue siendo el mismo (hace las mismas preguntas en el mismo orden):
// solo cambia cómo las dice. Los huecos como {nombre} los llena el sistema con los datos de la familia. Sin cambios, dice lo de siempre.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoArea } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { BotonDeIcono, Regreso, useEdicion } from "./comunes.tsx";
import { NOMBRE_DE_MODULO } from "./mensajeria.ts";
import { revisarHuecos, vistaPrevia, type HuecoDeTexto } from "./textos.ts";

interface TextoDelBot {
  clave: string;
  cuando: string;
  modulo: "captacion" | "cotizador" | "clase_muestra";
  modulo_encendido: boolean;
  huecos: HuecoDeTexto[];
  obligatorios: string[];
  defecto: string;
  texto: string;
  personalizado: boolean;
}
interface Lista {
  maximo: number;
  datos: TextoDelBot[];
}

const SECCIONES: { modulo: TextoDelBot["modulo"]; titulo: string }[] = [
  { modulo: "captacion", titulo: "Saludo, preguntas y pase con una persona" },
  { modulo: "cotizador", titulo: "Cotización, otras sucursales y lista de espera" },
  { modulo: "clase_muestra", titulo: "Clase muestra" },
];

function Formulario({ t, maximo, alGuardar, alCerrar }: { t: TextoDelBot; maximo: number; alGuardar: () => void; alCerrar: () => void }) {
  const [texto, setTexto] = useState(t.texto);
  const [local, setLocal] = useState<string | undefined>();
  const guardar = useAccion();
  const volver = useAccion();
  const servidor = guardar.error?.porCampo()["texto"];
  const { sobran, faltan } = revisarHuecos(texto, t.huecos.map((h) => h.nombre), t.obligatorios);
  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        if (texto.trim() === "") return setLocal("Escribe el mensaje. Si quieres volver al de siempre, usa «Volver al texto de siempre».");
        if (texto.trim().length > maximo) return setLocal(`El mensaje es muy largo (${texto.trim().length} caracteres). Acórtalo a ${maximo} o menos.`);
        if (sobran.length > 0) return setLocal(`«{${sobran[0]}}» no se puede usar en este mensaje.${t.huecos.length > 0 ? ` Puedes usar: ${t.huecos.map((h) => `{${h.nombre}}`).join(", ")}.` : " Escribe el mensaje completo."}`);
        if (faltan.length > 0) return setLocal(`Falta {${faltan[0]}}: sin él la persona no sabría qué responder.`);
        setLocal(undefined);
        void guardar.ejecutar(async () => {
          await api.put(`/api/textos-bot/${t.clave}`, { texto });
          alGuardar();
        });
      }}
    >
      <p className="muted">{t.cuando}</p>
      <CampoArea
        etiqueta="Lo que dice el asistente"
        rows={6}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setLocal(undefined);
          guardar.limpiar();
        }}
        error={local ?? servidor}
        ayuda={`Hasta ${maximo} caracteres. Sin enlaces.`}
      />
      <div className="pila">
        <strong>Huecos que puedes usar</strong>
        {t.huecos.length === 0 ? <p className="muted">Este mensaje no lleva huecos: escríbelo completo.</p> : null}
        <ul className="lista-simple">
          {t.huecos.map((h) => (
            <li key={h.nombre} className="hueco-fila">
              <Boton variante="sutil" onClick={() => { setTexto((x) => `${x}{${h.nombre}}`); setLocal(undefined); guardar.limpiar(); }} aria-label={`Agregar {${h.nombre}}`}>
                {`{${h.nombre}}`}
              </Boton>
              <span className="muted">
                {h.descripcion}
                {t.obligatorios.includes(h.nombre) ? " (obligatorio)" : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="pila">
        <strong>Así se vería</strong>
        <p className="vista-previa texto-conservado" data-prueba="vista-previa">
          {vistaPrevia(texto)}
        </p>
      </div>
      {/* El motivo del rechazo ya sale debajo del campo: no se repite en una caja aparte. */}
      {servidor ? null : <ErrorDeAccion error={guardar.error} />}
      <ErrorDeAccion error={volver.error} />
      <div className="formulario-acciones formulario-acciones-tres">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        {t.personalizado ? (
          <Boton
            disabled={volver.ocupado}
            onClick={() =>
              void volver.ejecutar(async () => {
                await api.delete(`/api/textos-bot/${t.clave}`);
                alGuardar();
              })
            }
          >
            Volver al texto de siempre
          </Boton>
        ) : (
          <Boton onClick={() => setTexto(t.defecto)}>Usar el texto de siempre</Boton>
        )}
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function TextosDelAsistente() {
  useTitulo("Textos del asistente");
  const carga = useCarga((senal) => api.get<Lista>("/api/textos-bot", undefined, senal), []);
  const edicion = useEdicion<TextoDelBot>();
  const { moduloEncendido } = useSesion();
  return (
    <Pagina titulo="Textos del asistente" subtitulo="Lo que el asistente de WhatsApp dice en cada paso." acciones={<Regreso />}>
      <Aviso>El asistente hace las mismas preguntas en el mismo orden; aquí solo cambias cómo las dice. Los huecos como {"{nombre}"} los llena el sistema. Un cambio vale desde el siguiente mensaje que llegue.</Aviso>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos && carga.datos.datos.length === 0 ? <div className="vacio-admin"><Vacio titulo="Todavía no hay textos del asistente">Recarga la pantalla; si sigue vacía, avisa a soporte.</Vacio></div> : null}
      {carga.datos
        ? SECCIONES.map((s) => {
            const items = carga.datos!.datos.filter((d) => d.modulo === s.modulo);
            if (items.length === 0) return null;
            const apagado = !moduloEncendido(s.modulo);
            return (
              <section key={s.modulo} className="seccion-admin">
                <h2>{s.titulo}</h2>
                {apagado ? <Aviso tono="alerta">El módulo «{NOMBRE_DE_MODULO[s.modulo]}» está apagado. Puedes dejar estos textos listos, pero el asistente no los dice hasta que lo enciendas.</Aviso> : null}
                <ul className="lista-tarjetas" data-prueba={`textos-${s.modulo}`}>
                  {items.map((t) => (
                    <li key={t.clave} className="item-admin" data-prueba={`texto-${t.clave}`}>
                      <div className="item-admin-principal">
                        <span className="item-admin-meta">{t.cuando}</span>
                        <p className="texto-conservado texto-del-asistente">{t.texto}</p>
                      </div>
                      <div className="item-admin-etiquetas">
                        <Insignia tono={t.personalizado ? "exito" : "neutro"}>{t.personalizado ? "Personalizado" : "De siempre"}</Insignia>
                      </div>
                      <div className="item-admin-acciones">
                        <BotonDeIcono icono="lapiz" nombre="Cambiar" onClick={() => edicion.editar(t)} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        : null}
      <Dialogo abierto={edicion.actual !== null} titulo="Cambiar lo que dice el asistente" alCerrar={edicion.cerrar}>
        {edicion.actual !== null && edicion.actual !== "nuevo" ? (
          <Formulario
            key={edicion.actual.clave}
            t={edicion.actual}
            maximo={carga.datos?.maximo ?? 600}
            alGuardar={() => {
              edicion.cerrar();
              carga.recargar();
            }}
            alCerrar={edicion.cerrar}
          />
        ) : null}
      </Dialogo>
    </Pagina>
  );
}
