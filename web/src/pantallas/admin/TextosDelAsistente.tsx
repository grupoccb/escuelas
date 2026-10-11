// Textos del asistente: lo que el asistente de WhatsApp dice en cada paso, redactado a la manera de la escuela. El asistente sigue siendo el mismo (hace las mismas preguntas en el mismo orden):
// solo cambia cómo las dice. Los huecos como {nombre} los llena el sistema con los datos de la familia. Sin cambios, dice lo de siempre.
//
// R7b (`Admin-sistema.dc.html`, pestaña «Textos del asistente»): en escritorio es una lista de pasos a la izquierda y, a la derecha, el editor del paso elegido que se queda a la vista
// (con «Así lo lee la familia»); lo escrito de un paso no se pierde al pasar a otro (queda «Sin guardar» en la lista). En el celular el editor abre como hoja inferior.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoArea } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { useEscritorio } from "../../ui/useEscritorio.ts";
import { NOMBRE_DE_MODULO } from "./mensajeria.ts";
import { EncimaDeSistema } from "./sistema.tsx";
import { hayCambioDeTexto, resumenDeTexto, revisarHuecos, tituloDeTexto, vistaPrevia, type HuecoDeTexto } from "./textos.ts";

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

/** El editor de UN paso: el campo, los huecos, la vista previa y los botones. `alCancelar` solo existe cuando está dentro de la hoja del celular. */
function Editor({ t, maximo, texto, alEscribir, alGuardar, alCancelar }: { t: TextoDelBot; maximo: number; texto: string; alEscribir: (nuevo: string) => void; alGuardar: () => void; alCancelar?: () => void }) {
  const [local, setLocal] = useState<string | undefined>();
  const guardar = useAccion();
  const volver = useAccion();
  const servidor = guardar.error?.porCampo()["texto"];
  const { sobran, faltan } = revisarHuecos(texto, t.huecos.map((h) => h.nombre), t.obligatorios);
  const escribir = (nuevo: string): void => {
    alEscribir(nuevo);
    setLocal(undefined);
    guardar.limpiar();
  };
  return (
    <form
      className="formulario texto-editor"
      noValidate
      data-prueba="editor-de-texto"
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
      <h2 className="texto-editor-titulo">{tituloDeTexto(t.clave)}</h2>
      <p className="muted">{t.cuando}</p>
      <CampoArea etiqueta="Lo que dice el asistente" rows={5} value={texto} onChange={(e) => escribir(e.target.value)} error={local ?? servidor} ayuda={`Hasta ${maximo} caracteres. Sin enlaces.`} />
      <div className="pila">
        <strong>Huecos que puedes usar</strong>
        {t.huecos.length === 0 ? <p className="muted">Este mensaje no lleva huecos: escríbelo completo.</p> : null}
        <ul className="lista-simple">
          {t.huecos.map((h) => (
            <li key={h.nombre} className="hueco-fila">
              <button type="button" className="hueco-chip" onClick={() => escribir(`${texto}{${h.nombre}}`)} aria-label={`Agregar {${h.nombre}}`}>
                {`{${h.nombre}}`}
              </button>
              <span className="muted">
                {h.descripcion}
                {t.obligatorios.includes(h.nombre) ? " (obligatorio)" : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="pila">
        <strong>Así lo lee la familia</strong>
        <div className="whatsapp-fondo">
          <p className="whatsapp-burbuja texto-conservado" data-prueba="vista-previa">
            {vistaPrevia(texto)}
          </p>
        </div>
      </div>
      {/* El motivo del rechazo ya sale debajo del campo: no se repite en una caja aparte. */}
      {servidor ? null : <ErrorDeAccion error={guardar.error} />}
      <ErrorDeAccion error={volver.error} />
      <div className="formulario-acciones formulario-acciones-tres">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar texto
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
          <Boton onClick={() => escribir(t.defecto)}>Usar el texto de siempre</Boton>
        )}
        {alCancelar ? <Boton onClick={alCancelar}>Cancelar</Boton> : null}
      </div>
    </form>
  );
}

export default function TextosDelAsistente() {
  useTitulo("Textos del asistente");
  const carga = useCarga((senal) => api.get<Lista>("/api/textos-bot", undefined, senal), []);
  const { moduloEncendido } = useSesion();
  const { avisar } = useAvisos();
  const escritorio = useEscritorio();
  const [elegida, setElegida] = useState<string | null>(null);
  // Lo escrito y todavía no guardado, por paso: pasar a otro paso no lo pierde.
  const [borradores, setBorradores] = useState<Record<string, string>>({});

  const textos = carga.datos?.datos ?? [];
  // En escritorio siempre hay un paso a la vista (el primero, si nadie eligió); en el celular el editor solo existe cuando se abre uno.
  const clave = escritorio ? (elegida !== null && textos.some((t) => t.clave === elegida) ? elegida : (textos[0]?.clave ?? null)) : elegida;
  const actual = textos.find((t) => t.clave === clave);
  const textoDe = (t: TextoDelBot): string => borradores[t.clave] ?? t.texto;
  const escribir = (t: TextoDelBot, nuevo: string): void =>
    setBorradores((b) => {
      const resto = { ...b };
      if (hayCambioDeTexto(nuevo, t.texto)) resto[t.clave] = nuevo;
      else delete resto[t.clave];
      return resto;
    });
  const guardado = (t: TextoDelBot): void => {
    setBorradores((b) => {
      const resto = { ...b };
      delete resto[t.clave];
      return resto;
    });
    if (!escritorio) setElegida(null);
    carga.recargar();
    avisar("Texto guardado. El asistente lo usa desde el siguiente mensaje.");
  };
  const editor = (t: TextoDelBot, alCancelar?: () => void) => (
    <Editor key={t.clave} t={t} maximo={carga.datos?.maximo ?? 600} texto={textoDe(t)} alEscribir={(n) => escribir(t, n)} alGuardar={() => guardado(t)} {...(alCancelar ? { alCancelar } : {})} />
  );

  // El número de cada paso sigue el orden en que se ve en la lista (por sección), no el del servidor.
  const enOrden = SECCIONES.flatMap((s) => textos.filter((d) => d.modulo === s.modulo));
  return (
    <Pagina titulo="Textos del asistente" subtitulo="Lo que el asistente de WhatsApp dice en cada paso, a la manera de la escuela." encima={<EncimaDeSistema />}>
      <Aviso>El asistente hace las mismas preguntas en el mismo orden; aquí solo cambias cómo las dice. Los huecos como {"{nombre}"} los llena el sistema. Un cambio vale desde el siguiente mensaje que llegue.</Aviso>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos && carga.datos.datos.length === 0 ? <div className="vacio-admin"><Vacio titulo="Todavía no hay textos del asistente">Recarga la pantalla; si sigue vacía, avisa a soporte.</Vacio></div> : null}
      {carga.datos && textos.length > 0 ? (
        <div className="textos-maestro">
          <div className="textos-lista">
            {SECCIONES.map((s) => {
              const items = textos.filter((d) => d.modulo === s.modulo);
              if (items.length === 0) return null;
              const apagado = !moduloEncendido(s.modulo);
              return (
                <section key={s.modulo} className="seccion-admin">
                  <h2>{s.titulo}</h2>
                  {apagado ? <Aviso tono="alerta">El módulo «{NOMBRE_DE_MODULO[s.modulo]}» está apagado. Puedes dejar estos textos listos, pero el asistente no los dice hasta que lo enciendas.</Aviso> : null}
                  <ul className="textos-pasos" data-prueba={`textos-${s.modulo}`}>
                    {items.map((t) => {
                      const sinGuardar = t.clave in borradores;
                      return (
                        <li key={t.clave} data-prueba={`texto-${t.clave}`}>
                          <button type="button" className="texto-paso" aria-pressed={t.clave === clave} onClick={() => setElegida(t.clave)}>
                            <span className="texto-paso-cabecera">
                              <span className="texto-paso-numero" aria-hidden="true">
                                {enOrden.indexOf(t) + 1}
                              </span>
                              <strong className="texto-paso-nombre">{tituloDeTexto(t.clave)}</strong>
                              {sinGuardar ? <Insignia tono="alerta">Sin guardar</Insignia> : <Insignia tono={t.personalizado ? "exito" : "neutro"}>{t.personalizado ? "Personalizado" : "De siempre"}</Insignia>}
                            </span>
                            <span className="texto-paso-resumen texto-del-asistente">{resumenDeTexto(textoDe(t))}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          {escritorio && actual ? <aside className="textos-panel">{editor(actual)}</aside> : null}
        </div>
      ) : null}
      <Dialogo abierto={!escritorio && actual !== undefined} titulo="Cambiar lo que dice el asistente" alCerrar={() => setElegida(null)}>
        {!escritorio && actual ? editor(actual, () => setElegida(null)) : null}
      </Dialogo>
    </Pagina>
  );
}
