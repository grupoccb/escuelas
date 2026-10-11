// Verticales (disciplinas): alta, edición, activar/desactivar y baja. Nada de esto vive en el código: lo que la escuela imparte, cómo se llama el avance de sus alumnos,
// su color y si el bot cotiza por WhatsApp son filas que se editan aquí.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { colorDe } from "./ayudas.ts";
import { Icono } from "../../ui/Icono.tsx";
import { AccionesDeTarjeta, AvisoDeBaja, ConfirmarAccion, useEdicion, VacioDeLista } from "./comunes.tsx";
import { FilaDeCatalogo, ListaDeCatalogo, PaginaDeCatalogo, unir, useAlternarActivo } from "./patron.tsx";
import type { Vertical } from "./tipos.ts";

function Formulario({ vertical, alGuardar, alCerrar }: { vertical: Vertical | null; alGuardar: (nombre: string) => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(vertical?.nombre ?? "");
  const [slug, setSlug] = useState("");
  const [usaProgresion, setUsaProgresion] = useState(vertical?.usa_progresion ?? false);
  const [etiquetaProgresion, setEtiquetaProgresion] = useState(vertical?.etiqueta_progresion ?? "");
  const [etiquetaEvento, setEtiquetaEvento] = useState(vertical?.etiqueta_evento ?? "");
  const [color, setColor] = useState(vertical?.color_marca ?? "");
  const [logo, setLogo] = useState(vertical?.logo_url ?? "");
  const [cotizador, setCotizador] = useState(vertical?.cotizador_whatsapp_activo ?? false);
  const [muestra, setMuestra] = useState(vertical?.clase_muestra_whatsapp_activo ?? false);
  const [activo, setActivo] = useState(vertical?.activo ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];

  function enviar() {
    const e: Record<string, string> = {};
    const c = colorDe(color);
    if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
    if (c === null) e["color_marca"] = "Escribe un color como #1F5FBF";
    if (usaProgresion && etiquetaProgresion.trim() === "") e["etiqueta_progresion"] = "Di cómo se llama el avance en esta disciplina";
    if (muestra && !cotizador) e["clase_muestra_whatsapp_activo"] = "Necesita el cotizador por WhatsApp encendido";
    setLocal(e);
    if (Object.keys(e).length > 0) return;
    const cuerpo = {
      nombre: nombre.trim(),
      ...(vertical === null && slug.trim() ? { slug: slug.trim() } : {}),
      usa_progresion: usaProgresion,
      etiqueta_progresion: etiquetaProgresion.trim() === "" ? null : etiquetaProgresion.trim(),
      etiqueta_evento: etiquetaEvento.trim() === "" ? null : etiquetaEvento.trim(),
      color_marca: c === "" ? null : c,
      logo_url: logo.trim() === "" ? null : logo.trim(),
      cotizador_whatsapp_activo: cotizador,
      clase_muestra_whatsapp_activo: muestra,
      activo,
    };
    void guardar.ejecutar(async () => {
      if (vertical) await api.patch(`/api/verticales/${vertical.id}`, cuerpo);
      else await api.post("/api/verticales", cuerpo);
      alGuardar(cuerpo.nombre);
    });
  }

  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        enviar();
      }}
    >
      <CampoTexto etiqueta="Nombre de la disciplina" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      {vertical === null ? (
        <CampoTexto etiqueta="Nombre corto para la dirección de la página (opcional)" value={slug} onChange={(e) => setSlug(e.target.value)} error={err("slug")} ayuda="Va al final de la dirección de la página donde las familias dejan sus datos y en los QR impresos (por ejemplo «natacion»), y NO se puede cambiar después. Si lo dejas vacío se arma con el nombre." />
      ) : (
        <p className="muted">
          Su página termina en <strong>{vertical.slug}</strong> (no cambia: está en los QR impresos).
        </p>
      )}
      <CampoCasilla etiqueta="Lleva progresión (niveles o grados de los alumnos)" checked={usaProgresion} onChange={(e) => setUsaProgresion(e.target.checked)} />
      <CampoTexto etiqueta="Cómo se llama el avance" value={etiquetaProgresion} onChange={(e) => setEtiquetaProgresion(e.target.value)} error={err("etiqueta_progresion")} ayuda="Se usa en el expediente del alumno." />
      <CampoTexto etiqueta="Cómo se llama el evento de la disciplina" value={etiquetaEvento} onChange={(e) => setEtiquetaEvento(e.target.value)} error={err("etiqueta_evento")} ayuda="Se usa en el expediente (por ejemplo, la fecha del próximo evento)." />
      <CampoTexto etiqueta="Color de marca" value={color} onChange={(e) => setColor(e.target.value)} error={err("color_marca")} ayuda="Formato #RRGGBB. Se usa en la página de captación." />
      <CampoTexto etiqueta="Logotipo (dirección https)" type="url" value={logo} onChange={(e) => setLogo(e.target.value)} error={err("logo_url")} />
      <CampoCasilla etiqueta="El bot cotiza por WhatsApp" checked={cotizador} onChange={(e) => setCotizador(e.target.checked)} ayuda="Después de las tres preguntas propone horarios y precio en lugar de pasar directo al asesor." />
      <CampoCasilla etiqueta="El bot agenda la clase muestra" checked={muestra} onChange={(e) => setMuestra(e.target.checked)} />
      {err("clase_muestra_whatsapp_activo") ? <p className="campo-error">{err("clase_muestra_whatsapp_activo")}</p> : null}
      <CampoCasilla etiqueta="Activa" checked={activo} onChange={(e) => setActivo(e.target.checked)} ayuda="Una disciplina inactiva deja de recibir captación nueva; lo ya registrado se conserva." />
      <ErrorDeAccion error={guardar.error} enCampos={["nombre", "slug", "etiqueta_progresion", "etiqueta_evento", "color_marca", "logo_url", "clase_muestra_whatsapp_activo"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function Verticales() {
  useTitulo("Disciplinas");
  const lista = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal), []);
  const { avisar } = useAvisos();
  const edicion = useEdicion<Vertical>();
  const [baja, setBaja] = useState<Vertical | null>(null);
  const cambiarActivo = useAlternarActivo(lista.recargar);
  const filas = lista.datos?.datos ?? [];

  return (
    <PaginaDeCatalogo titulo="Disciplinas" ayuda="Lo que imparte la escuela, sus etiquetas y su color. El color se usa en el embudo, los tableros y las tarjetas de clase.">
      <ListaDeCatalogo titulo="Disciplinas" cuenta={lista.datos ? filas.length : undefined} nuevo="Nueva disciplina" alNuevo={edicion.nuevo}>
        {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
        {lista.cargando && !lista.datos ? <Cargando /> : null}
        {lista.datos && filas.length === 0 ? <VacioDeLista titulo="Todavía no hay disciplinas">Da de alta la primera con «Nueva disciplina».</VacioDeLista> : null}
        <ErrorDeAccion error={cambiarActivo.error} />
        <ul className="lista-filas" data-prueba="lista-de-verticales">
          {filas.map((v) => (
            <FilaDeCatalogo
              key={v.id}
              data-prueba={`vertical-${v.slug}`}
              color={v.color_marca}
              inactiva={!v.activo}
              titulo={v.nombre}
              etiquetas={
                <>
                  {v.activo ? null : <Insignia>Inactiva</Insignia>}
                  {v.cotizador_whatsapp_activo ? <Insignia>Cotiza por WhatsApp</Insignia> : null}
                  {v.clase_muestra_whatsapp_activo ? <Insignia>Clase muestra</Insignia> : null}
                </>
              }
              detalle={
                <>
                  <p>{unir([v.usa_progresion ? `Avance: ${v.etiqueta_progresion ?? "—"}` : "Sin progresión", v.etiqueta_evento ? `evento: ${v.etiqueta_evento}` : null])}</p>
                  <p>
                    Página para recibir familias:{" "}
                    <a className="enlace-con-icono" href={`/l/${v.slug}`} target="_blank" rel="noopener noreferrer">
                      abrir
                      <Icono nombre="enlace_externo" tamano={14} />
                    </a>
                  </p>
                </>
              }
              acciones={
                <AccionesDeTarjeta
                  alEditar={() => edicion.editar(v)}
                  activo={v.activo}
                  ocupado={cambiarActivo.ocupado}
                  alDesactivar={() =>
                    cambiarActivo.alternar(`/api/verticales/${v.id}`, v.activo, {
                      desactivada: `${v.nombre} quedó desactivada: deja de recibir captación nueva, y lo ya registrado se conserva.`,
                      activada: `${v.nombre} quedó activa otra vez.`,
                    })
                  }
                  alDarDeBaja={() => setBaja(v)}
                />
              }
            />
          ))}
        </ul>
      </ListaDeCatalogo>
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Nueva disciplina" : "Editar disciplina"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? (
          <Formulario
            vertical={edicion.actual === "nuevo" ? null : edicion.actual}
            alGuardar={(nombre) => {
              edicion.cerrar();
              lista.recargar();
              avisar(`La disciplina «${nombre}» se guardó.`);
            }}
            alCerrar={edicion.cerrar}
          />
        ) : null}
      </Dialogo>
      <ConfirmarAccion abierto={baja !== null} titulo="Dar de baja la disciplina" textoDeConfirmar="Dar de baja" alCerrar={() => setBaja(null)} alConfirmar={async () => { await api.delete(`/api/verticales/${baja!.id}`); lista.recargar(); avisar(`La disciplina «${baja!.nombre}» se dio de baja.`); }}>
        <AvisoDeBaja cosa="disciplina" genero="f" nombre={baja?.nombre} consecuencia="Solo se puede si nada la usa (sin programas, canales, campañas ni leads): si ya se usa, el sistema lo dirá." />
      </ConfirmarAccion>
    </PaginaDeCatalogo>
  );
}
