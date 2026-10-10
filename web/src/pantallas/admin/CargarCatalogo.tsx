// Cargar catálogo (V6): la escuela llena las plantillas en Excel y las sube aquí. Primero se REVISA (nada se guarda): si hay errores se dicen con el archivo, la fila y la columna;
// si todo está en orden aparece «Aplicar», que carga todo o nada. Volver a aplicar lo mismo no duplica nada y dice «Sin cambios». Nunca borra: solo crea y actualiza.

import { useState, type ChangeEvent } from "react";
import { api } from "../../api/cliente.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Tarjeta } from "../../ui/basicos.tsx";
import { CampoTexto } from "../../ui/campos.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { ConfirmarAccion, Regreso } from "./comunes.tsx";
import { erroresPorArchivo, frase, leerArchivo, problemaConLosArchivos, tamanoTexto, type ArchivoElegido, type InformeDeCarga } from "./catalogo.ts";

interface Plantillas {
  datos: { nombre: string; descripcion: string; ruta: string }[];
}

function Resumen({ informe }: { informe: InformeDeCarga }) {
  return (
    <div className="pila">
      <div className="tabla-scroll">
        <table className="tabla" data-prueba="resumen-carga">
          <thead>
            <tr>
              <th>Qué</th>
              <th className="derecha">Nuevos</th>
              <th className="derecha">Actualizados</th>
              <th className="derecha">Sin cambios</th>
            </tr>
          </thead>
          <tbody>
            {informe.resumen.map((r) => (
              <tr key={r.clave}>
                <td>{r.nombre}</td>
                <td className="derecha">{r.creados}</td>
                <td className="derecha">{r.actualizados}</td>
                <td className="derecha">{r.sin_cambios}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {informe.cambios.length > 0 ? (
        <details>
          <summary>Ver cada cambio</summary>
          <ul className="lista-simple" data-prueba="detalle-de-cambios">
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
    <details data-prueba="avisos-de-carga">
      <summary>Para tomar en cuenta ({informe.avisos.length})</summary>
      <ul className="lista-simple">
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
      <Aviso tono="peligro" titulo={`Hay ${total} ${total === 1 ? "cosa" : "cosas"} por corregir. No se guardó nada.`}>
        <p>Corrige los archivos en Excel, guárdalos de nuevo y vuelve a subirlos.</p>
      </Aviso>
      {erroresPorArchivo(informe.errores).map((g) => (
        <section key={g.archivo} className="pila" data-prueba={`errores-de-${g.archivo}`}>
          <h3>
            {g.archivo} <Insignia tono="peligro">{g.errores.length}</Insignia>
          </h3>
          <ul className="lista-simple">
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
  const leer = useAccion();
  const revisar = useAccion();

  const cambiarArchivos = (nuevos: ArchivoElegido[]): void => {
    setArchivos(nuevos);
    setInforme(null); // lo revisado ya no corresponde a lo elegido
    setProblema(problemaConLosArchivos(nuevos));
  };

  const alElegir = (ev: ChangeEvent<HTMLInputElement>): void => {
    const elegidos = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (elegidos.length === 0) return;
    void leer.ejecutar(async () => {
      const leidos = await Promise.all(elegidos.map(leerArchivo));
      // Un archivo con el mismo nombre reemplaza al anterior.
      cambiarArchivos([...archivos.filter((a) => !leidos.some((l) => l.nombre === a.nombre)), ...leidos]);
    });
  };

  const cuerpo = (modo: "simulacion" | "aplicar") => ({ modo, archivos: archivos.map((a) => ({ nombre: a.nombre, contenido_base64: a.base64 })) });

  const revisarAhora = (): void => {
    void revisar.ejecutar(async () => {
      setInforme(await api.post<InformeDeCarga>("/api/catalogo/importacion", cuerpo("simulacion")));
    });
  };

  const puedeAplicar = informe !== null && informe.modo === "simulacion" && informe.limpia && !informe.sin_cambios && problema === null;

  return (
    <Pagina titulo="Cargar catálogo" subtitulo="Sube las hojas de Excel con tus sucursales, grupos, horarios y precios. Primero se revisan; no se guarda nada hasta que tú lo confirmes." acciones={<Regreso />}>
      <Tarjeta titulo="1. Descarga las plantillas">
        <div className="pila">
          <p>
            Llena en Excel solo las que necesites y guárdalas como <strong>CSV UTF-8</strong>. La segunda fila de cada una es un ejemplo inventado: puedes borrarla o dejarla, el sistema la ignora. Los nombres (de una sucursal, un
            programa…) se escriben igual en todos los archivos.
          </p>
          {plantillas.error ? <ErrorDeCarga error={plantillas.error} alReintentar={plantillas.recargar} /> : null}
          {plantillas.cargando && !plantillas.datos ? <Cargando /> : null}
          {plantillas.datos ? (
            <>
              <p>
                <a className="boton boton-primario" href="/api/catalogo/plantillas/plantillas-catalogo.zip" download data-prueba="descarga-todas">
                  Descargar todas las plantillas
                </a>
              </p>
              <details>
                <summary>Descargar una por una</summary>
                <ul className="lista-simple" data-prueba="catalogo-descargas">
                  {plantillas.datos.datos
                    .filter((d) => d.nombre !== "plantillas-catalogo.zip")
                    .map((d) => (
                      <li key={d.nombre}>
                        <a href={d.ruta} download data-prueba={`descarga-${d.nombre}`}>
                          {d.nombre}
                        </a>{" "}
                        <span className="muted">{d.descripcion}</span>
                      </li>
                    ))}
                </ul>
              </details>
            </>
          ) : null}
        </div>
      </Tarjeta>

      <Tarjeta titulo="2. Sube tus archivos y revísalos">
        <div className="pila">
          <CampoTexto
            etiqueta="Archivos llenos"
            type="file"
            multiple
            accept=".csv,.txt,text/csv,text/plain"
            onChange={alElegir}
            ayuda="Puedes elegir varios a la vez. Si eliges uno con el mismo nombre, reemplaza al anterior."
            data-prueba="entrada-de-archivos"
          />
          <ErrorDeAccion error={leer.error} />
          {archivos.length > 0 ? (
            <ul className="lista-simple" data-prueba="archivos-elegidos">
              {archivos.map((a) => (
                <li key={a.nombre} className="fila fila-entre">
                  <span>
                    {a.nombre} <span className="muted">({tamanoTexto(a.tamano)})</span>
                  </span>
                  <Boton variante="fantasma" onClick={() => cambiarArchivos(archivos.filter((x) => x.nombre !== a.nombre))} aria-label={`Quitar ${a.nombre}`}>
                    Quitar
                  </Boton>
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
            <Boton variante="primario" onClick={revisarAhora} cargando={revisar.ocupado} disabled={archivos.length === 0 || problema !== null} data-prueba="boton-revisar">
              Revisar
            </Boton>
          </div>
          <ErrorDeAccion error={revisar.error} />
        </div>
      </Tarjeta>

      {informe ? (
        <Tarjeta titulo="3. Resultado">
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
              <Aviso tono="exito" titulo="Sin cambios">
                <p>Todo lo que subiste ya está en el sistema tal cual. No hay nada que aplicar.</p>
              </Aviso>
            ) : null}
            {informe.limpia && !informe.sin_cambios ? (
              <>
                <Aviso tono={informe.aplicado ? "exito" : "info"} titulo={informe.aplicado ? "Listo: el catálogo se cargó" : "Todo está en orden"}>
                  <p data-prueba="frase-de-carga">{`${frase(informe.resumen, informe.aplicado)}.`}</p>
                </Aviso>
                <Resumen informe={informe} />
              </>
            ) : null}
            <Avisos informe={informe} />
            {puedeAplicar ? (
              <div className="formulario-acciones">
                <Boton variante="primario" onClick={() => setConfirmando(true)} data-prueba="boton-aplicar">
                  Aplicar
                </Boton>
                <span className="muted">Se guarda todo o nada. Si lo subes otra vez no se duplica.</span>
              </div>
            ) : null}
          </div>
        </Tarjeta>
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
