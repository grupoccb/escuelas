// Cargar catálogo (V6): la escuela llena las plantillas en Excel y las sube aquí. Primero se REVISA (nada se guarda): si hay errores se dicen con el archivo, la fila y la columna;
// si todo está en orden aparece «Aplicar», que carga todo o nada. Volver a aplicar lo mismo no duplica nada y dice «Sin cambios». Nunca borra: solo crea y actualiza.

import { useState, type ChangeEvent, type DragEvent } from "react";
import { api } from "../../api/cliente.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina } from "../../ui/basicos.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { BotonDeIcono, ConfirmarAccion } from "./comunes.tsx";
import { VolverAAdministracion } from "./patron.tsx";
import { erroresPorArchivo, frase, leerArchivo, MAXIMO_DE_ARCHIVOS, problemaConLosArchivos, tamanoTexto, type ArchivoElegido, type InformeDeCarga } from "./catalogo.ts";

interface Plantillas {
  datos: { nombre: string; descripcion: string; ruta: string }[];
}

function Resumen({ informe }: { informe: InformeDeCarga }) {
  return (
    <div className="pila">
      {/* Tarjetas, pero con la semántica de una tabla (fila por cosa, celda por dato): así se lee con un lector de pantalla y las pruebas la recorren por fila. */}
      <div className="carga-resumen" role="table" aria-label="Lo que se va a cargar" data-prueba="resumen-carga">
        {informe.resumen.map((r) => (
          <div key={r.clave} role="row" className="carga-resumen-tarjeta">
            <div role="cell" className="carga-resumen-nombre">
              {r.nombre}
            </div>
            <div role="cell" className="carga-resumen-valor">
              {r.creados} <small>{r.creados === 1 ? "nuevo" : "nuevos"}</small>
            </div>
            <div role="cell" className="carga-resumen-resto">
              {r.actualizados} {r.actualizados === 1 ? "actualizado" : "actualizados"} · {r.sin_cambios} sin cambios
            </div>
          </div>
        ))}
      </div>
      {informe.cambios.length > 0 ? (
        <details className="mas-opciones">
          <summary>Ver cada cambio</summary>
          <ul className="lista-simple lista-detalle" data-prueba="detalle-de-cambios">
            {informe.cambios.map((c, i) => (
              <li key={i}>{c.descripcion}</li>
            ))}
            {informe.cambios_omitidos > 0 ? <li className="muted">… y {informe.cambios_omitidos} más.</li> : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Avisos({ informe }: { informe: InformeDeCarga }) {
  if (informe.avisos.length === 0) return null;
  return (
    <details className="mas-opciones" data-prueba="avisos-de-carga">
      <summary>Para tomar en cuenta ({informe.avisos.length})</summary>
      <ul className="lista-simple lista-detalle">
        {informe.avisos.map((a, i) => (
          <li key={i}>
            <span className="muted">{a.archivo}:</span> {a.texto}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Errores({ informe }: { informe: InformeDeCarga }) {
  const total = informe.errores.length + informe.errores_omitidos;
  return (
    <div className="pila" data-prueba="resultado-errores">
      <div className="carga-resultado-titulo" role="alert">
        <Icono nombre="alerta" tamano={22} />
        <h2>{`Hay ${total} ${total === 1 ? "cosa" : "cosas"} por corregir. No se guardó nada.`}</h2>
      </div>
      <p className="carga-resultado-texto">Corrige los archivos en Excel, guárdalos de nuevo y vuelve a subirlos.</p>
      {erroresPorArchivo(informe.errores).map((g) => (
        <section key={g.archivo} className="carga-errores-archivo" data-prueba={`errores-de-${g.archivo}`}>
          <h3>
            {g.archivo} <Insignia tono="peligro">{g.errores.length}</Insignia>
          </h3>
          <ul className="carga-errores">
            {g.errores.map((e, i) => (
              <li key={i} data-prueba="error-de-carga">
                {e.fila !== null ? <strong>Fila {e.fila}{e.columna ? `, columna “${e.columna}”` : ""}: </strong> : null}
                {e.fila !== null ? e.mensaje.replace(/\.?$/, ".") : e.texto}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {informe.errores_omitidos > 0 ? <p className="muted">… y {informe.errores_omitidos} más. Corrige estas primero.</p> : null}
    </div>
  );
}

export default function CargarCatalogo() {
  useTitulo("Cargar catálogo");
  const plantillas = useCarga((senal) => api.get<Plantillas>("/api/catalogo/plantillas", undefined, senal), []);
  const [archivos, setArchivos] = useState<ArchivoElegido[]>([]);
  const [informe, setInforme] = useState<InformeDeCarga | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [unaPorUna, setUnaPorUna] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const leer = useAccion();
  const revisar = useAccion();

  const cambiarArchivos = (nuevos: ArchivoElegido[]): void => {
    setArchivos(nuevos);
    setInforme(null); // lo revisado ya no corresponde a lo elegido
    setProblema(problemaConLosArchivos(nuevos));
  };

  /** Los archivos que llegan, elegidos con el selector o soltados sobre la zona (lo mismo: tocar o soltar). */
  const recibir = (elegidos: File[]): void => {
    if (elegidos.length === 0) return;
    void leer.ejecutar(async () => {
      const leidos = await Promise.all(elegidos.map(leerArchivo));
      // Un archivo con el mismo nombre reemplaza al anterior.
      cambiarArchivos([...archivos.filter((a) => !leidos.some((l) => l.nombre === a.nombre)), ...leidos]);
    });
  };

  const alElegir = (ev: ChangeEvent<HTMLInputElement>): void => {
    const elegidos = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    recibir(elegidos);
  };

  const alSoltar = (ev: DragEvent<HTMLLabelElement>): void => {
    ev.preventDefault();
    setArrastrando(false);
    recibir(Array.from(ev.dataTransfer.files));
  };

  const cuerpo = (modo: "simulacion" | "aplicar") => ({ modo, archivos: archivos.map((a) => ({ nombre: a.nombre, contenido_base64: a.base64 })) });

  const revisarAhora = (): void => {
    void revisar.ejecutar(async () => {
      setInforme(await api.post<InformeDeCarga>("/api/catalogo/importacion", cuerpo("simulacion")));
    });
  };

  const puedeAplicar = informe !== null && informe.modo === "simulacion" && informe.limpia && !informe.sin_cambios && problema === null;

  return (
    <Pagina titulo="Cargar catálogo" subtitulo="Sube tus hojas de Excel con sucursales, programas, grupos, horarios y precios. Se revisan antes de guardar: si algo está mal, no se guarda nada." encima={<VolverAAdministracion className="catalogo-volver" />}>
      <section className="carga-paso" aria-labelledby="carga-paso-1">
        <div className="carga-paso-cabeza">
          <span className="carga-paso-numero" aria-hidden="true">
            1
          </span>
          <h2 id="carga-paso-1">Descarga las plantillas y llénalas</h2>
        </div>
        <p className="muted">
          Llena en Excel solo las que necesites y guárdalas como <strong>CSV UTF-8</strong>. La segunda fila de cada una es un ejemplo inventado: puedes borrarla o dejarla, el sistema la ignora. Los nombres (de una sucursal, un programa…) se escriben igual
          en todos los archivos.
        </p>
        {plantillas.error ? <ErrorDeCarga error={plantillas.error} alReintentar={plantillas.recargar} /> : null}
        {plantillas.cargando && !plantillas.datos ? <Cargando /> : null}
        {plantillas.datos ? (
          <>
            <div className="carga-descargas">
              <a className="boton" href="/api/catalogo/plantillas/plantillas-catalogo.zip" download data-prueba="descarga-todas">
                <Icono nombre="descargar" tamano={18} />
                Descargar todas las plantillas (ZIP)
              </a>
              <Boton variante="fantasma" aria-expanded={unaPorUna} onClick={() => setUnaPorUna(!unaPorUna)}>
                Descargar una por una
              </Boton>
            </div>
            {unaPorUna ? (
              <ul className="carga-plantillas" data-prueba="catalogo-descargas">
                {plantillas.datos.datos
                  .filter((d) => d.nombre !== "plantillas-catalogo.zip")
                  .map((d) => (
                    <li key={d.nombre} className="carga-plantilla">
                      <Icono nombre="archivo" tamano={18} />
                      <span className="carga-plantilla-texto">
                        <a href={d.ruta} download data-prueba={`descarga-${d.nombre}`}>
                          {d.nombre}
                        </a>
                        <span className="muted">{d.descripcion}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="carga-paso" aria-labelledby="carga-paso-2">
        <div className="carga-paso-cabeza">
          <span className="carga-paso-numero" aria-hidden="true">
            2
          </span>
          <h2 id="carga-paso-2">Elige tus archivos</h2>
        </div>
        {/* Tocar abre el selector de archivos; soltar archivos encima hace lo mismo. Quien no puede arrastrar toca la zona (o llega a ella con el teclado). */}
        <label
          className="zona-archivos"
          {...(arrastrando ? { "data-arrastrando": "" } : {})}
          onDragOver={(ev) => {
            ev.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={alSoltar}
        >
          <input className="solo-lectores" type="file" multiple accept=".csv,.txt,text/csv,text/plain" onChange={alElegir} data-prueba="entrada-de-archivos" />
          <Icono nombre="subir" tamano={26} />
          <strong>Arrastra aquí tus archivos CSV o toca para elegirlos</strong>
          <span className="zona-archivos-ayuda">Hasta {MAXIMO_DE_ARCHIVOS} archivos y 5 MB en total. En Excel: Archivo → Guardar como → CSV UTF-8. Si eliges uno con el mismo nombre, reemplaza al anterior.</span>
        </label>
        <ErrorDeAccion error={leer.error} />
        {archivos.length > 0 ? (
          <ul className="carga-archivos" data-prueba="archivos-elegidos">
            {archivos.map((a) => (
              <li key={a.nombre} className="carga-archivo">
                <span className="archivo-nombre">
                  <Icono nombre="archivo" tamano={18} />
                  <span>
                    <strong>{a.nombre}</strong> <span className="muted">· {tamanoTexto(a.tamano)}</span>
                  </span>
                </span>
                <BotonDeIcono icono="cerrar" nombre={`Quitar ${a.nombre}`} onClick={() => cambiarArchivos(archivos.filter((x) => x.nombre !== a.nombre))} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Todavía no elegiste archivos.</p>
        )}
        {problema ? (
          <Aviso tono="alerta">
            <span data-prueba="problema-de-archivos">{problema}</span>
          </Aviso>
        ) : null}
        <div className="formulario-acciones">
          <Boton variante={puedeAplicar ? "secundario" : "primario"} onClick={revisarAhora} cargando={revisar.ocupado} disabled={archivos.length === 0 || problema !== null} data-prueba="boton-revisar">
            Revisar
          </Boton>
        </div>
        <ErrorDeAccion error={revisar.error} />
      </section>

      {informe ? (
        <section className="carga-resultado" data-estado={!informe.limpia ? "errores" : "limpio"} aria-label="Resultado de la revisión">
          <div className="pila" data-prueba="resultado-de-carga">
            {informe.archivos.length > 0 ? (
              <p className="muted">
                Archivos leídos:{" "}
                {informe.archivos.map((a, i) => (
                  <span key={a.nombre}>
                    {i > 0 ? "; " : ""}
                    {a.nombre} {a.hoja ? `(${a.hoja}, ${a.filas} ${a.filas === 1 ? "fila" : "filas"})` : "(no se reconoció)"}
                  </span>
                ))}
              </p>
            ) : null}
            {!informe.limpia ? <Errores informe={informe} /> : null}
            {informe.limpia && informe.sin_cambios ? (
              <>
                <div className="carga-resultado-titulo">
                  <Icono nombre="reactivar" tamano={22} />
                  <h2>Sin cambios</h2>
                </div>
                <p className="carga-resultado-texto">Todo lo que subiste ya está en el sistema tal cual. No hay nada que aplicar.</p>
              </>
            ) : null}
            {informe.limpia && !informe.sin_cambios ? (
              <>
                <div className="carga-resultado-titulo">
                  <Icono nombre="reactivar" tamano={22} />
                  <h2>{informe.aplicado ? "Listo: el catálogo se cargó" : "Todo está en orden"}</h2>
                </div>
                <p className="carga-resultado-texto" data-prueba="frase-de-carga">{`${frase(informe.resumen, informe.aplicado)}.`}</p>
                {informe.aplicado ? null : <p className="carga-resultado-texto">Esto es lo que se va a crear. Nada se guarda hasta que lo apliques.</p>}
                <Resumen informe={informe} />
              </>
            ) : null}
            <Avisos informe={informe} />
            {puedeAplicar ? (
              <div className="formulario-acciones carga-aplicar">
                <Boton variante="primario" grande onClick={() => setConfirmando(true)} data-prueba="boton-aplicar">
                  Aplicar los cambios
                </Boton>
                <span className="muted">Se guarda todo o nada. Si lo subes otra vez no se duplica.</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <ConfirmarAccion
        abierto={confirmando}
        titulo="¿Cargar estos cambios?"
        textoDeConfirmar="Sí, aplicar"
        peligro={false}
        alConfirmar={async () => {
          setInforme(await api.post<InformeDeCarga>("/api/catalogo/importacion", cuerpo("aplicar")));
        }}
        alCerrar={() => setConfirmando(false)}
      >
        <p>{informe ? `${frase(informe.resumen)}.` : ""}</p>
        <p className="muted">Los precios nuevos empiezan en su fecha y no cambian lo que ya se cobró. Las inscripciones que ya hiciste no se tocan.</p>
      </ConfirmarAccion>
    </Pagina>
  );
}
