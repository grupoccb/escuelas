// Plantillas de mensaje: el estado de su aprobación y la clase que DECLARA cada una (servicio o marketing, INV-6). Una de servicio sale aunque una persona atienda la
// conversación; una de marketing se bloquea. No hay valor por omisión: quien da de alta la plantilla lo decide.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { cantidad } from "../../lib/cantidad.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia } from "../../ui/basicos.tsx";
import { CampoArea, CampoCasilla, CampoSelect, CampoTexto, GrupoDeOpciones } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { enteroDe } from "./ayudas.ts";
import { AccionesDeTarjeta, AvisoDeBaja, BotonDeIcono, ConfirmarAccion, useEdicion, VacioDeLista } from "./comunes.tsx";
import { FilaDeCatalogo, ListaDeCatalogo, PaginaDeCatalogo, unir, useAlternarActivo } from "./patron.tsx";
import { TEXTO_DE_APROBACION, TONO_DE_APROBACION } from "./piezas.tsx";
import type { Vertical } from "./tipos.ts";

interface PlantillaAdmin {
  id: string;
  codigo: string;
  content_sid: string;
  vertical_id: string | null;
  categoria: string;
  clase_mensaje: "servicio" | "marketing";
  tipo_content: string;
  idioma: string;
  variables: { pos: number; nombre: string }[];
  cuerpo_referencia: string | null;
  estado_aprobacion: string;
  activo: boolean;
  automatizaciones: number;
}

const CATEGORIAS = [
  { valor: "utility", texto: "Utilidad (aviso de algo acordado)" },
  { valor: "marketing", texto: "Marketing" },
  { valor: "authentication", texto: "Autenticación" },
  { valor: "servicio", texto: "Servicio" },
];
/** El idioma de la plantilla ante el proveedor, dicho en palabras (V7: antes salía «es_MX»). */
const IDIOMAS = [
  { valor: "es_MX", texto: "Español (México)" },
  { valor: "es", texto: "Español" },
  { valor: "es_ES", texto: "Español (España)" },
  { valor: "es_AR", texto: "Español (Argentina)" },
  { valor: "en", texto: "Inglés" },
];
const nombreDeIdioma = (valor: string): string => IDIOMAS.find((i) => i.valor === valor)?.texto ?? `Otro idioma (${valor})`;
const opcionesDeIdioma = (actual: string) => (IDIOMAS.some((i) => i.valor === actual) ? IDIOMAS : [{ valor: actual, texto: nombreDeIdioma(actual) }, ...IDIOMAS]);
/** La categoría ante Meta en una palabra para la tarjeta. */
const nombreDeCategoria = (valor: string): string => ({ utility: "utilidad", marketing: "marketing", authentication: "autenticación", servicio: "servicio" })[valor] ?? valor;
const ESTADOS = [
  { valor: "pendiente", texto: "Pendiente de aprobación" },
  { valor: "aprobada", texto: "Aprobada" },
  { valor: "rechazada", texto: "Rechazada" },
  { valor: "pausada", texto: "Pausada" },
  { valor: "deshabilitada", texto: "Deshabilitada" },
];
/** El tipo de contenido ante el proveedor, en palabras (los valores son los de Twilio y no cambian). */
const TIPOS = [
  { valor: "text", texto: "Solo texto" },
  { valor: "quick-reply", texto: "Con botones de respuesta rápida" },
  { valor: "list-picker", texto: "Con una lista de opciones" },
  { valor: "call-to-action", texto: "Con un botón de acción (enlace o llamada)" },
  { valor: "media", texto: "Con imagen o archivo" },
];

function Formulario({ plantilla, verticales, alGuardar, alCerrar }: { plantilla: PlantillaAdmin | null; verticales: Vertical[]; alGuardar: (hecho: { codigo: string; estado: string }) => void; alCerrar: () => void }) {
  const [codigo, setCodigo] = useState(plantilla?.codigo ?? "");
  const [sid, setSid] = useState(plantilla?.content_sid ?? "");
  const [verticalId, setVerticalId] = useState(plantilla?.vertical_id ?? "");
  const [clase, setClase] = useState<string>(plantilla?.clase_mensaje ?? "");
  const [categoria, setCategoria] = useState(plantilla?.categoria ?? "utility");
  const [estado, setEstado] = useState(plantilla?.estado_aprobacion ?? "pendiente");
  const [tipo, setTipo] = useState(plantilla?.tipo_content ?? "text");
  const [idioma, setIdioma] = useState(plantilla?.idioma ?? "es_MX");
  const [variables, setVariables] = useState<{ pos: string; nombre: string }[]>((plantilla?.variables ?? []).map((v) => ({ pos: String(v.pos), nombre: v.nombre })));
  const [cuerpo, setCuerpo] = useState(plantilla?.cuerpo_referencia ?? "");
  const [activo, setActivo] = useState(plantilla?.activo ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];

  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const vars = variables.map((v) => ({ pos: enteroDe(v.pos, 1, 20), nombre: v.nombre.trim() }));
        if (plantilla === null && !/^[a-z][a-z0-9_]*$/.test(codigo.trim())) e["codigo"] = "Minúsculas, dígitos y guion bajo, empezando con letra";
        if (sid.trim() === "") e["content_sid"] = "Escribe el identificador de la plantilla en Twilio";
        if (clase === "") e["clase_mensaje"] = "Declara si es de servicio o de marketing";
        if (clase === "servicio" && categoria === "marketing") e["clase_mensaje"] = "Una de servicio no puede ser de categoría marketing: cambia la categoría o la clase";
        vars.forEach((v, i) => {
          if (v.pos === null || !/^[a-z][a-z0-9_]*$/.test(v.nombre)) e["variables"] = `Variable ${i + 1}: posición de 1 a 20 y un nombre en minúsculas`;
        });
        if (new Set(vars.map((v) => v.pos)).size !== vars.length) e["variables"] = "Hay dos variables con la misma posición";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        const comun = { content_sid: sid.trim(), categoria, clase_mensaje: clase, tipo_content: tipo, idioma: idioma.trim(), variables: vars.map((v) => ({ pos: v.pos as number, nombre: v.nombre })), cuerpo_referencia: cuerpo.trim() === "" ? null : cuerpo.trim(), estado_aprobacion: estado, activo };
        void guardar.ejecutar(async () => {
          if (plantilla) await api.patch(`/api/plantillas/${plantilla.id}`, comun);
          else await api.post("/api/plantillas", { codigo: codigo.trim(), vertical_id: verticalId === "" ? null : verticalId, ...comun });
          alGuardar({ codigo: plantilla ? plantilla.codigo : codigo.trim(), estado });
        });
      }}
    >
      {plantilla === null ? (
        <>
          <CampoTexto etiqueta="Código" requerido value={codigo} onChange={(e) => setCodigo(e.target.value)} error={err("codigo")} ayuda="Con él la encuentra el sistema; no se puede cambiar después." />
          <CampoSelect etiqueta="Disciplina" value={verticalId} vacio="Sirve para todas las disciplinas" opciones={verticales.map((v) => ({ valor: v.id, texto: v.nombre }))} onChange={(e) => setVerticalId(e.target.value)} error={err("vertical_id")} />
        </>
      ) : (
        <p className="muted">
          Código: <strong>{plantilla.codigo}</strong> (no cambia).
        </p>
      )}
      <CampoTexto etiqueta="Identificador en Twilio (Content SID)" requerido value={sid} onChange={(e) => setSid(e.target.value)} error={err("content_sid")} />
      <GrupoDeOpciones
        etiqueta="Clase del mensaje (la declara quien la da de alta)"
        valor={clase}
        opciones={[
          { valor: "servicio", texto: "Servicio" },
          { valor: "marketing", texto: "Marketing" },
        ]}
        alCambiar={setClase}
        error={err("clase_mensaje")}
        segmentado
      />
      <Aviso>
        <strong>Servicio</strong>: un aviso sobre algo que la familia ya acordó (recordatorio de clase, de pago, bienvenida); sale aunque una persona esté atendiendo la conversación. <strong>Marketing</strong>: promociones y
        reenganche; se bloquea si una persona atiende y tiene tope de frecuencia.
      </Aviso>
      <CampoSelect etiqueta="Categoría ante Meta" value={categoria} opciones={CATEGORIAS} onChange={(e) => setCategoria(e.target.value)} error={err("categoria")} />
      <CampoSelect etiqueta="Estado de aprobación" value={estado} opciones={ESTADOS} onChange={(e) => setEstado(e.target.value)} ayuda="Solo se envía lo aprobado y activo. Mientras no haya sincronización con el proveedor, se fija a mano." />
      <div className="rejilla rejilla-2">
        <CampoSelect etiqueta="Tipo de contenido" value={tipo} opciones={TIPOS} onChange={(e) => setTipo(e.target.value)} />
        <CampoSelect etiqueta="Idioma" value={idioma} opciones={opcionesDeIdioma(idioma)} onChange={(e) => setIdioma(e.target.value)} error={err("idioma")} />
      </div>
      <fieldset className="pila sin-borde">
        <legend>
          <strong>Variables</strong>
        </legend>
        {variables.map((v, i) => (
          <div key={i} className="variable-fila">
            <CampoTexto etiqueta={`Posición ${i + 1}`} inputMode="numeric" value={v.pos} onChange={(e) => setVariables((vs) => vs.map((x, j) => (j === i ? { ...x, pos: e.target.value } : x)))} />
            <CampoTexto etiqueta={`Nombre ${i + 1}`} value={v.nombre} onChange={(e) => setVariables((vs) => vs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
            <BotonDeIcono icono="papelera" nombre="Quitar" onClick={() => setVariables((vs) => vs.filter((_, j) => j !== i))} />
          </div>
        ))}
        {err("variables") ? <p className="campo-error">{err("variables")}</p> : null}
        <div>
          <Boton onClick={() => setVariables((vs) => [...vs, { pos: String(vs.length + 1), nombre: "" }])}>Agregar una variable</Boton>
        </div>
      </fieldset>
      <CampoArea etiqueta="Texto de referencia (no se manda)" value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} ayuda="Una copia del texto aprobado, para saber de qué trata. El proveedor manda el aprobado." />
      <CampoCasilla etiqueta="Activa" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
      <ErrorDeAccion error={guardar.error} enCampos={["codigo", "vertical_id", "content_sid", "clase_mensaje", "categoria", "idioma", "variables"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function Plantillas() {
  useTitulo("Plantillas de mensaje");
  const [clase, setClase] = useState("");
  const [pagina, setPagina] = useState(1);
  const lista = useCarga((senal) => api.get<Pag<PlantillaAdmin>>("/api/plantillas", { ...(clase ? { clase_mensaje: clase } : {}), limite: 25, pagina }, senal), [clase, pagina]);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal), []);
  const { avisar } = useAvisos();
  const edicion = useEdicion<PlantillaAdmin>();
  const [baja, setBaja] = useState<PlantillaAdmin | null>(null);
  const cambiarActivo = useAlternarActivo(lista.recargar);
  const nombreV = (id: string | null) => (id ? (verticales.datos?.datos.find((v) => v.id === id)?.nombre ?? "—") : "Todas las disciplinas");
  const colorV = (id: string | null) => (id ? (verticales.datos?.datos.find((v) => v.id === id)?.color_marca ?? null) : null);
  return (
    <PaginaDeCatalogo titulo="Plantillas de mensaje" ayuda="Estado de aprobación, clase (servicio o marketing) y variables. Fuera de la ventana de 24 horas solo salen plantillas aprobadas; con una persona atendiendo, las de marketing no salen y las de servicio sí.">
      <ListaDeCatalogo titulo="Plantillas" cuenta={lista.datos?.paginacion.total} nuevo="Nueva plantilla" alNuevo={edicion.nuevo}>
        <div className="filtros">
          <CampoSelect etiqueta="Clase" value={clase} vacio="Todas" opciones={[{ valor: "servicio", texto: "Servicio" }, { valor: "marketing", texto: "Marketing" }]} onChange={(e) => { setPagina(1); setClase(e.target.value); }} />
        </div>
        {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
        {lista.cargando && !lista.datos ? <Cargando /> : null}
        {lista.datos && lista.datos.datos.length === 0 ? <VacioDeLista titulo="No hay plantillas con ese filtro">{clase ? "Quita el filtro «Clase» para ver todas, o da de alta una con «Nueva plantilla»." : "Da de alta la primera con «Nueva plantilla»."}</VacioDeLista> : null}
        <ErrorDeAccion error={cambiarActivo.error} />
        <ul className="lista-filas" data-prueba="lista-de-plantillas">
          {(lista.datos?.datos ?? []).map((p) => (
            <FilaDeCatalogo
              key={p.id}
              data-prueba={`plantilla-${p.codigo}`}
              color={colorV(p.vertical_id)}
              inactiva={!p.activo}
              titulo={
                <>
                  {p.codigo} <span className="muted">· {nombreDeIdioma(p.idioma)}</span>
                </>
              }
              etiquetas={
                <>
                  <Insignia tono={p.clase_mensaje === "servicio" ? "info" : "neutro"}>{p.clase_mensaje === "servicio" ? "Servicio" : "Marketing"}</Insignia>
                  <Insignia tono={TONO_DE_APROBACION[p.estado_aprobacion] ?? "neutro"}>{TEXTO_DE_APROBACION[p.estado_aprobacion] ?? p.estado_aprobacion}</Insignia>
                  {!p.activo ? <Insignia>Inactiva</Insignia> : null}
                </>
              }
              detalle={unir([
                nombreV(p.vertical_id),
                `categoría ${nombreDeCategoria(p.categoria)}`,
                p.automatizaciones === 0 ? "sin automatizaciones" : cantidad(p.automatizaciones, "automatización", "automatizaciones"),
                `Variables: ${p.variables.length === 0 ? "ninguna" : p.variables.map((v) => `${v.pos}=${v.nombre}`).join(", ")}`,
              ])}
              acciones={
                <AccionesDeTarjeta
                  alEditar={() => edicion.editar(p)}
                  activo={p.activo}
                  ocupado={cambiarActivo.ocupado}
                  alDesactivar={() => cambiarActivo.alternar(`/api/plantillas/${p.id}`, p.activo, { desactivada: `La plantilla «${p.codigo}» quedó desactivada: el sistema no la manda.`, activada: `La plantilla «${p.codigo}» está activa otra vez.${p.estado_aprobacion === "aprobada" ? "" : " Mientras no esté aprobada, el sistema no la manda."}` })}
                  alDarDeBaja={() => setBaja(p)}
                />
              }
            />
          ))}
        </ul>
        {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
      </ListaDeCatalogo>
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Nueva plantilla" : "Editar plantilla"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? <Formulario plantilla={edicion.actual === "nuevo" ? null : edicion.actual} verticales={verticales.datos?.datos ?? []} alGuardar={({ codigo, estado }) => { edicion.cerrar(); lista.recargar(); avisar(`La plantilla «${codigo}» se guardó.${estado === "aprobada" ? "" : " Mientras no esté aprobada, el sistema no la manda."}`); }} alCerrar={edicion.cerrar} /> : null}
      </Dialogo>
      <ConfirmarAccion abierto={baja !== null} titulo="Dar de baja la plantilla" textoDeConfirmar="Dar de baja" alCerrar={() => setBaja(null)} alConfirmar={async () => { await api.delete(`/api/plantillas/${baja!.id}`); lista.recargar(); avisar(`La plantilla «${baja!.codigo}» se dio de baja.`); }}>
        <AvisoDeBaja cosa="plantilla" genero="f" nombre={baja?.codigo} consecuencia="Si una automatización la usa, el sistema no la dejará: cámbiala de plantilla antes." />
      </ConfirmarAccion>
    </PaginaDeCatalogo>
  );
}
