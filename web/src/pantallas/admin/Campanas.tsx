// Campañas y códigos QR (V7): dónde anuncia la escuela y el QR para imprimir. Cada campaña (un anuncio, un volante, el letrero de una sucursal) lleva su propio código de rastreo: así,
// cuando una familia escribe, el sistema sabe de dónde llegó y el tablero de costo por campaña puede dividir lo gastado entre lo que produjo. Antes solo existía por la API: la escuela
// no tenía cómo dar de alta una campaña ni bajar su QR. El QR apunta a la página de la disciplina con el código de ESA campaña y ESA sucursal (cada par tiene el suyo).

import { useState } from "react";
import { api, armarConsulta, type Pagina as Pag } from "../../api/cliente.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { AccionesDeTarjeta, AvisoDeBaja, ConfirmarAccion, useEdicion, VacioDeLista } from "./comunes.tsx";
import { FilaDeCatalogo, ListaDeCatalogo, PaginaDeCatalogo, unir, useAlternarActivo } from "./patron.tsx";
import type { CampanaAdmin, SucursalAdmin, Vertical } from "./tipos.ts";

/** Dónde se anuncia (los valores son los del servidor; el texto es el de la escuela). */
export const ORIGENES_DE_CAMPANA = [
  { valor: "facebook", texto: "Facebook" },
  { valor: "instagram", texto: "Instagram" },
  { valor: "tiktok", texto: "TikTok" },
  { valor: "google", texto: "Google" },
  { valor: "referido", texto: "Recomendación de otra familia" },
  { valor: "presencial", texto: "En la sucursal (letrero o volante con QR)" },
  { valor: "otro", texto: "Otro lugar" },
] as const;
const nombreDeOrigen = (valor: string): string => ORIGENES_DE_CAMPANA.find((o) => o.valor === valor)?.texto ?? valor;

function Formulario({ campana, verticales, sucursales, alGuardar, alCerrar }: { campana: CampanaAdmin | null; verticales: Vertical[]; sucursales: SucursalAdmin[]; alGuardar: (nombre: string) => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(campana?.nombre ?? "");
  const [origen, setOrigen] = useState(campana?.origen ?? "facebook");
  const [verticalId, setVerticalId] = useState(campana?.vertical_id ?? "");
  const [sucursalId, setSucursalId] = useState(campana?.sucursal_id ?? "");
  const [activo, setActivo] = useState(campana?.activo ?? true);
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
        if (nombre.trim() === "") e["nombre"] = "Escribe un nombre que reconozcas, por ejemplo «Volantes de septiembre»";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        const cuerpo = { nombre: nombre.trim(), origen, vertical_id: verticalId === "" ? null : verticalId, sucursal_id: sucursalId === "" ? null : sucursalId, activo };
        void guardar.ejecutar(async () => {
          if (campana) await api.patch(`/api/campanas/${campana.id}`, cuerpo);
          else await api.post("/api/campanas", { ...cuerpo, vertical_id: cuerpo.vertical_id ?? undefined, sucursal_id: cuerpo.sucursal_id ?? undefined });
          alGuardar(cuerpo.nombre);
        });
      }}
    >
      <CampoTexto etiqueta="Nombre de la campaña" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} ayuda="Como la vas a reconocer en el tablero de costos." />
      <CampoSelect etiqueta="¿Dónde se anuncia?" value={origen} opciones={ORIGENES_DE_CAMPANA.map((o) => ({ valor: o.valor, texto: o.texto }))} onChange={(e) => setOrigen(e.target.value)} error={err("origen")} />
      <CampoSelect etiqueta="Disciplina" value={verticalId} vacio="Todas (la eliges al bajar el QR)" opciones={verticales.filter((v) => v.activo).map((v) => ({ valor: v.id, texto: v.nombre }))} onChange={(e) => setVerticalId(e.target.value)} error={err("vertical_id")} />
      <CampoSelect etiqueta="Sucursal" value={sucursalId} vacio="Todas (la eliges al bajar el QR)" opciones={sucursales.filter((s) => s.activo).map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => setSucursalId(e.target.value)} error={err("sucursal_id")} />
      <CampoCasilla etiqueta="Activa" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
      <ErrorDeAccion error={guardar.error} enCampos={["nombre", "origen", "vertical_id", "sucursal_id"]} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

/** El QR de una campaña para una sucursal: se ve aquí mismo y se baja en imagen (para imprimir en casa) o en vectores (para la imprenta). */
function CodigoQr({ campana, verticales, sucursales, alCerrar }: { campana: CampanaAdmin; verticales: Vertical[]; sucursales: SucursalAdmin[]; alCerrar: () => void }) {
  const activas = verticales.filter((v) => v.activo);
  const [verticalId, setVerticalId] = useState(campana.vertical_id ?? activas[0]?.id ?? "");
  // Solo las sucursales que dan esa disciplina (el servidor rechaza las demás).
  const quedan = sucursales.filter((s) => s.activo && s.verticales.some((v) => v.vertical_id === verticalId && v.activo));
  const [sucursalId, setSucursalId] = useState(campana.sucursal_id ?? "");
  const elegida = quedan.some((s) => s.id === sucursalId) ? sucursalId : (quedan[0]?.id ?? "");
  const consulta = (extra: Record<string, string | number | boolean>) => armarConsulta({ sucursal_id: elegida, vertical_id: campana.vertical_id ? undefined : verticalId, ...extra });
  const ruta = `/api/campanas/${campana.id}/qr`;
  const direccion = useCarga((senal) => api.get<{ url: string; codigo_formateado: string }>(ruta, { sucursal_id: elegida, ...(campana.vertical_id ? {} : { vertical_id: verticalId }), formato: "url" }, senal), [campana.id, elegida, verticalId], elegida !== "");
  return (
    <div className="pila">
      <p>
        Campaña: <strong>{campana.nombre}</strong>. El QR lleva a la página de la disciplina con el código de esta campaña y de la sucursal que elijas: así, cuando una familia escribe, se sabe de dónde llegó. Cada sucursal tiene su propio QR.
      </p>
      {campana.vertical_id ? null : <CampoSelect etiqueta="Disciplina" value={verticalId} opciones={activas.map((v) => ({ valor: v.id, texto: v.nombre }))} onChange={(e) => setVerticalId(e.target.value)} />}
      {quedan.length === 0 ? (
        <Vacio titulo="Ninguna sucursal da esa disciplina todavía">Márcala en Administración → Sucursales («Disciplinas que se imparten aquí») y vuelve.</Vacio>
      ) : (
        <>
          <CampoSelect etiqueta="Sucursal" value={elegida} opciones={quedan.map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => setSucursalId(e.target.value)} />
          <div className="qr-vista" data-prueba="vista-del-qr">
            <img src={`${ruta}${consulta({ formato: "svg" })}`} alt={`Código QR de ${campana.nombre}`} width={220} height={220} />
          </div>
          {direccion.error ? <ErrorDeCarga error={direccion.error} alReintentar={direccion.recargar} /> : null}
          {direccion.cargando && !direccion.datos ? <Cargando /> : null}
          {direccion.datos ? (
            <p className="muted">
              Al escanearlo abre <span data-prueba="direccion-del-qr">{direccion.datos.url}</span> (código {direccion.datos.codigo_formateado}).
            </p>
          ) : null}
          <div className="fila">
            <a className="boton boton-primario" href={`${ruta}${consulta({ formato: "png", descargar: true })}`} download>
              Descargar el QR (imagen para imprimir)
            </a>
            <a className="boton" href={`${ruta}${consulta({ formato: "svg", descargar: true, mm: 80 })}`} download>
              Descargar el QR (para la imprenta)
            </a>
          </div>
        </>
      )}
      <div className="formulario-acciones">
        <Boton onClick={alCerrar}>Cerrar</Boton>
      </div>
    </div>
  );
}

export default function Campanas() {
  useTitulo("Campañas y códigos QR");
  const { avisar } = useAvisos();
  const lista = useCarga((senal) => api.get<Pag<CampanaAdmin>>("/api/campanas", { limite: 100 }, senal), []);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal), []);
  const sucursales = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), []);
  const edicion = useEdicion<CampanaAdmin>();
  const [conQr, setConQr] = useState<CampanaAdmin | null>(null);
  const [baja, setBaja] = useState<CampanaAdmin | null>(null);
  const nombreV = (id: string | null) => (id ? (verticales.datos?.datos.find((v) => v.id === id)?.nombre ?? "—") : "Todas las disciplinas");
  const nombreS = (id: string | null) => (id ? (sucursales.datos?.datos.find((s) => s.id === id)?.nombre ?? "—") : "todas las sucursales");
  const colorV = (id: string | null) => (id ? (verticales.datos?.datos.find((v) => v.id === id)?.color_marca ?? null) : null);
  const cambiarActivo = useAlternarActivo(lista.recargar);
  return (
    <PaginaDeCatalogo titulo="Campañas y códigos QR" ayuda="Dónde anuncias y el QR para imprimir: así sabes de dónde llega cada familia y cuánto cuesta cada alumno.">
      <ListaDeCatalogo titulo="Campañas" cuenta={lista.datos?.datos.length} nuevo="Nueva campaña" alNuevo={edicion.nuevo}>
        {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
        {lista.cargando && !lista.datos ? <Cargando /> : null}
        {lista.datos && lista.datos.datos.length === 0 ? <VacioDeLista titulo="Todavía no hay campañas">Da de alta la primera con «Nueva campaña»: un anuncio, un volante o el letrero de una sucursal.</VacioDeLista> : null}
        <ErrorDeAccion error={cambiarActivo.error} />
        <ul className="lista-filas" data-prueba="lista-de-campanas">
          {(lista.datos?.datos ?? []).map((c) => (
            <FilaDeCatalogo
              key={c.id}
              data-prueba={`campana-${c.id}`}
              color={colorV(c.vertical_id)}
              inactiva={!c.activo}
              titulo={c.nombre}
              etiquetas={c.activo ? null : <Insignia>Inactiva</Insignia>}
              detalle={unir([nombreDeOrigen(c.origen), nombreV(c.vertical_id), nombreS(c.sucursal_id)])}
              acciones={
                <AccionesDeTarjeta
                  extra={
                    <Boton variante="sutil" onClick={() => setConQr(c)}>
                      <Icono nombre="qr" tamano={18} />
                      Código QR
                    </Boton>
                  }
                  alEditar={() => edicion.editar(c)}
                  activo={c.activo}
                  ocupado={cambiarActivo.ocupado}
                  alDesactivar={() => cambiarActivo.alternar(`/api/campanas/${c.id}`, c.activo, { desactivada: `La campaña «${c.nombre}» quedó desactivada.`, activada: `La campaña «${c.nombre}» quedó activa otra vez.` })}
                  alDarDeBaja={() => setBaja(c)}
                />
              }
            />
          ))}
        </ul>
      </ListaDeCatalogo>
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Nueva campaña" : "Editar campaña"} alCerrar={edicion.cerrar}>
        {edicion.actual !== null ? (
          <Formulario
            campana={edicion.actual === "nuevo" ? null : edicion.actual}
            verticales={verticales.datos?.datos ?? []}
            sucursales={sucursales.datos?.datos ?? []}
            alGuardar={(nombre) => {
              edicion.cerrar();
              lista.recargar();
              avisar(`La campaña «${nombre}» se guardó. Ya puedes bajar su código QR.`);
            }}
            alCerrar={edicion.cerrar}
          />
        ) : null}
      </Dialogo>
      <Dialogo abierto={conQr !== null} titulo="Código QR de la campaña" alCerrar={() => setConQr(null)}>
        {conQr ? <CodigoQr campana={conQr} verticales={verticales.datos?.datos ?? []} sucursales={sucursales.datos?.datos ?? []} alCerrar={() => setConQr(null)} /> : null}
      </Dialogo>
      <ConfirmarAccion
        abierto={baja !== null}
        titulo="Dar de baja la campaña"
        textoDeConfirmar="Dar de baja"
        alCerrar={() => setBaja(null)}
        alConfirmar={async () => {
          await api.delete(`/api/campanas/${baja!.id}`);
          lista.recargar();
          avisar(`La campaña «${baja!.nombre}» se dio de baja.`);
        }}
      >
        <AvisoDeBaja cosa="campaña" genero="f" nombre={baja?.nombre} consecuencia="Si ya tiene códigos QR en uso, el sistema no la dejará (los QR impresos seguirían atribuyendo a algo que ya no existe)." />
      </ConfirmarAccion>
    </PaginaDeCatalogo>
  );
}
