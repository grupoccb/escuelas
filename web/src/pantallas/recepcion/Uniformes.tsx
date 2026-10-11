// Uniformes (y demás beneficios de producto) por entregar y entregados (R5b, README «Uniformes»): lo que se liberó al saldar la primera mensualidad y recepción debe dar. Marcar «entregado»
// descuenta UNA pieza del inventario y crea la venta promocional (precio 0) en la misma transacción; sin existencia lo rechaza el servidor (y la tarjeta ya lo dice).
// El color de la tarjeta es el de la disciplina del grupo (el dato `color_marca`); sin él, el neutro del sistema.

import { useState } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import { formatear } from "../../lib/dinero.ts";
import { hoyLocal } from "../../lib/fechas.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina as Marco, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect } from "../../ui/campos.tsx";
import { useDisciplina } from "../../ui/disciplina.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Pestanas, propsDePanel } from "../../ui/Pestanas.tsx";
import type { BeneficioEntregado, BeneficioPorEntregar, Producto } from "./tipos.ts";
import { cuandoSeEntrego, existenciaDe, origenDelBeneficio, piezasDeUnBeneficio, textoDeExistencia, tituloDelBeneficio } from "./uniformes.ts";

type Vista = "por_entregar" | "entregados";

interface Disciplina {
  id: string;
  color_marca: string | null;
}

function Entregar({ beneficio, yaNoEsta, alCerrar, alEntregar, alFallar }: { beneficio: BeneficioPorEntregar | null; /** La lista ya se refrescó y este uniforme no está: otra persona (u otra pantalla) lo entregó. */ yaNoEsta: boolean; alCerrar: () => void; alEntregar: (b: BeneficioPorEntregar) => void; alFallar: () => void }) {
  const productos = useCarga((senal) => api.get<Pagina<Producto>>("/api/productos", { activo: true, con_stock: true, limite: 100 }, senal), [beneficio?.id], beneficio !== null && beneficio.producto_id === null);
  const [eleccion, setEleccion] = useState("");
  const accion = useAccion();
  // Si el beneficio ya fija el producto, no hay nada que elegir; si solo dice «Uniforme», recepción elige la pieza (la de la disciplina del grupo y la talla del alumno).
  const talla = beneficio?.alumno.talla_uniforme ?? null;
  const candidatos = beneficio ? piezasDeUnBeneficio(beneficio, productos.datos?.datos ?? [], true) : [];
  const elegido = beneficio?.producto_id ?? (candidatos.some((p) => p.id === eleccion) ? eleccion : (candidatos[0]?.id ?? ""));
  const yaEntregado = yaNoEsta || accion.error?.detalles.some((d) => d.campo === "motivo" && d.mensaje === "ya_entregado") === true;
  const cerrar = () => {
    setEleccion("");
    accion.limpiar();
    alCerrar();
  };
  return (
    <Dialogo abierto={beneficio !== null} titulo="Entregar" alCerrar={cerrar}>
      <p>
        {beneficio?.descripcion ?? "Producto"} para <strong>{beneficio?.alumno.nombre} {beneficio?.alumno.apellidos}</strong>
        {talla ? ` · talla ${talla}` : ""}
      </p>
      {beneficio && beneficio.producto_id === null && !yaEntregado ? (
        <>
          {productos.cargando ? <Cargando texto="Viendo el inventario…" /> : null}
          {productos.error ? <ErrorDeCarga error={productos.error} alReintentar={productos.recargar} /> : null}
          {productos.datos && candidatos.length === 0 ? <Aviso tono="alerta">No hay piezas con existencia{talla ? ` de la talla ${talla}` : ""}. Avisa a quien administra el sistema para que dé de alta las piezas (aquí todavía no se puede) y entrega el uniforme cuando lleguen.</Aviso> : null}
          {candidatos.length > 0 ? <CampoSelect etiqueta="Pieza que se entrega" value={elegido} onChange={(e) => setEleccion(e.target.value)} opciones={candidatos.map((p) => ({ valor: p.id, texto: `${p.nombre}${p.talla ? ` · talla ${p.talla}` : ""} · ${p.stock} en existencia` }))} /> : null}
        </>
      ) : null}
      {/* V7: si otra persona (u otra pantalla) ya lo entregó, la lista que se ve está vieja: se dice y se refresca (antes seguía ahí, con el mismo botón). */}
      {yaEntregado ? (
        <Aviso tono="alerta" titulo="Este uniforme ya se entregó">
          <p>Otra persona lo marcó como entregado hace un momento. Ya se actualizó la lista: no hay nada más que hacer aquí.</p>
        </Aviso>
      ) : (
        <ErrorDeAccion error={accion.error} />
      )}
      <div className="formulario-acciones">
        <Boton
          variante="primario"
          disabled={elegido === "" || yaEntregado}
          cargando={accion.ocupado}
          onClick={() =>
            void accion
              .ejecutar(async () => {
                await api.post(`/api/beneficios/${beneficio?.id ?? ""}/entregar`, beneficio?.producto_id ? {} : { producto_id: elegido });
                const entregado = beneficio;
                cerrar();
                if (entregado) alEntregar(entregado);
              })
              .then((r) => {
                if (r === undefined) alFallar();
              })
          }
        >
          Marcar como entregado
        </Boton>
        <Boton onClick={cerrar}>{yaEntregado ? "Cerrar" : "Todavía no"}</Boton>
      </div>
    </Dialogo>
  );
}

/** El ícono de la prenda sobre el tono suave de la disciplina, el título y para quién es; debajo, lo que importa a quien entrega. */
function Cabeza({ titulo, b }: { titulo: string; b: BeneficioPorEntregar }) {
  return (
    <div className="uniforme-cabeza">
      <span className="uniforme-icono" aria-hidden="true">
        <Icono nombre="uniforme" tamano={22} />
      </span>
      <div className="uniforme-titulo">
        <span className="uniforme-nombre">{titulo}</span>
        <span className="uniforme-para">
          Para{" "}
          <strong>
            {b.alumno.nombre} {b.alumno.apellidos}
          </strong>{" "}
          · {b.grupo}
        </span>
      </div>
    </div>
  );
}

function TarjetaPorEntregar({ b, existencia, color, hoy, alEntregar }: { b: BeneficioPorEntregar; existencia: number | null; color: string | null; hoy: string; alEntregar: () => void }) {
  const ref = useDisciplina<HTMLLIElement>(color);
  const sin = existencia === 0;
  return (
    <li ref={ref} className="uniforme-tarjeta" data-prueba={`beneficio-${b.id}`}>
      <Cabeza titulo={tituloDelBeneficio(b)} b={b} />
      <div className="uniforme-notas">
        <span>{origenDelBeneficio(b.liberado_en, hoy)}</span>
        <span>Promoción «{b.promocion}»</span>
        <span>Familia: {b.tutor ? `${b.tutor.nombre} ${b.tutor.apellidos ?? ""} (${b.tutor.telefono})` : "—"}</span>
        {b.alumno.talla_uniforme ? null : <span>Sin talla registrada</span>}
        {existencia === null ? null : <span className={sin ? "uniforme-existencia uniforme-existencia-agotada" : "uniforme-existencia"}>{textoDeExistencia(existencia)}</span>}
      </div>
      <Boton variante="primario" className="uniforme-boton" disabled={sin} onClick={alEntregar}>
        {sin ? null : <Icono nombre="exito" tamano={18} />}
        {sin ? "Sin existencia" : "Marcar entregado"}
      </Boton>
    </li>
  );
}

function TarjetaEntregada({ b, color, ahora }: { b: BeneficioEntregado; color: string | null; ahora: Date }) {
  const ref = useDisciplina<HTMLLIElement>(color);
  return (
    <li ref={ref} className="uniforme-tarjeta" data-prueba={`entregado-${b.id}`}>
      <Cabeza titulo={tituloDelBeneficio(b)} b={b} />
      <div className="uniforme-notas">
        <span>{origenDelBeneficio(b.liberado_en, hoyLocal(ahora))}</span>
        <span>Promoción «{b.promocion}»</span>
        <span>Familia: {b.tutor ? `${b.tutor.nombre} ${b.tutor.apellidos ?? ""} (${b.tutor.telefono})` : "—"}</span>
        {b.producto ? <span className="uniforme-existencia">Se descontó del inventario</span> : null}
      </div>
      <div className="uniforme-entregado">
        <Icono nombre="exito" tamano={18} />
        {cuandoSeEntrego(b.entregado_en, b.entregado_por?.nombre ?? null, ahora)}
      </div>
    </li>
  );
}

export default function Uniformes() {
  useTitulo("Uniformes");
  const { sucursalId, puede } = useSesion();
  const { avisar } = useAvisos();
  const consulta = { limite: 50, ...(sucursalId ? { sucursal_id: sucursalId } : {}) };
  const lista = useCarga((senal) => api.get<Pagina<BeneficioPorEntregar>>("/api/beneficios/por-entregar", consulta, senal), [sucursalId]);
  const entregados = useCarga((senal) => api.get<Pagina<BeneficioEntregado>>("/api/beneficios/entregados", consulta, senal), [sucursalId]);
  const stock = useCarga((senal) => api.get<Pagina<Producto>>("/api/productos", { activo: true, limite: 100 }, senal), []);
  // Los colores son de adorno: sin permiso de leer el catálogo (o si falla) las tarjetas salen en el neutro del sistema.
  const disciplinas = useCarga((senal) => api.get<{ datos: Disciplina[] }>("/api/verticales", undefined, senal), [], puede("catalogo:leer"));
  const colorDe = (verticalId: string | undefined): string | null => disciplinas.datos?.datos.find((d) => d.id === verticalId)?.color_marca ?? null;
  const [vista, setVista] = useState<Vista>("por_entregar");
  const [entregando, setEntregando] = useState<BeneficioPorEntregar | null>(null);
  const recargarTodo = () => {
    lista.recargar();
    entregados.recargar();
    stock.recargar();
  };
  const hoy = hoyLocal();
  const ahora = new Date();
  const porEntregar = lista.datos?.datos ?? [];
  const yaEntregados = entregados.datos?.datos ?? [];
  const cuentaPor = lista.datos?.paginacion.total;
  const cuentaYa = entregados.datos?.paginacion.total;
  return (
    <Marco
      titulo="Uniformes"
      subtitulo="Lo que se liberó al pagar la primera mensualidad. Entregar descuenta una pieza del inventario."
      acciones={
        <Pestanas
          nombre="uniformes"
          etiqueta="Estado"
          segmentada
          activa={vista}
          alCambiar={setVista}
          pestanas={[
            { id: "por_entregar", texto: <>Por entregar{cuentaPor === undefined ? null : <span className="uniformes-cuenta">{cuentaPor}</span>}</> },
            { id: "entregados", texto: <>Entregados{cuentaYa === undefined ? null : <span className="uniformes-cuenta">{cuentaYa}</span>}</> },
          ]}
        />
      }
    >
      <div {...propsDePanel("uniformes", vista)} className="uniformes-panel">
        {vista === "por_entregar" ? (
          <>
            {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
            {lista.cargando && !lista.datos ? <Cargando /> : null}
            {lista.datos && porEntregar.length === 0 ? (
              <Vacio icono="uniforme" titulo="No hay nada por entregar">
                Cuando una familia salde su primera mensualidad, lo que le toca aparecerá aquí.
              </Vacio>
            ) : null}
            <ul className="uniformes-rejilla">
              {porEntregar.map((b) => (
                <TarjetaPorEntregar
                  key={b.id}
                  b={b}
                  existencia={existenciaDe(b, stock.datos?.datos ?? null)}
                  color={colorDe(b.vertical_id)}
                  hoy={hoy}
                  alEntregar={() => {
                    // La lista puede estar vieja (otra persona ya lo entregó): se refresca al abrir y, si ya no está, el diálogo lo dice.
                    setEntregando(b);
                    lista.recargar();
                  }}
                />
              ))}
            </ul>
            <Tarjeta titulo="Existencia">
              {stock.datos && stock.datos.datos.length === 0 ? (
                <Vacio icono="uniforme" titulo="No hay piezas registradas.">
                  Avisa a quien administra el sistema para que dé de alta las piezas.
                </Vacio>
              ) : null}
              {stock.datos ? (
                <ul className="lista-filas" data-prueba="existencia">
                  {stock.datos.datos.map((p) => (
                    <li key={p.id} className="fila-dato">
                      <span>
                        {p.nombre}
                        {p.talla ? ` · talla ${p.talla}` : ""} · {formatear(p.precio)}
                      </span>
                      <span className="solo-lectores">: </span>
                      <span className="existencia-cantidad">
                        <span className="existencia-texto">
                          <strong className="numero">{p.stock}</strong> {p.stock === 1 ? "pieza" : "piezas"}
                        </span>
                        {p.stock === 0 ? <Insignia tono="peligro">Agotado</Insignia> : p.stock === 1 ? <Insignia tono="alerta">Última pieza</Insignia> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Tarjeta>
          </>
        ) : (
          <>
            {entregados.error ? <ErrorDeCarga error={entregados.error} alReintentar={entregados.recargar} /> : null}
            {entregados.cargando && !entregados.datos ? <Cargando /> : null}
            {entregados.datos && yaEntregados.length === 0 ? (
              <Vacio icono="uniforme" titulo="Todavía no se ha entregado nada">
                Lo que marques como entregado aparecerá aquí.
              </Vacio>
            ) : null}
            <ul className="uniformes-rejilla">
              {yaEntregados.map((b) => (
                <TarjetaEntregada key={b.id} b={b} color={colorDe(b.vertical_id)} ahora={ahora} />
              ))}
            </ul>
            {entregados.datos && entregados.datos.paginacion.total > yaEntregados.length ? <p className="muted">Se muestran los {yaEntregados.length} más recientes de {entregados.datos.paginacion.total}.</p> : null}
          </>
        )}
      </div>
      <Entregar
        key={entregando?.id ?? "ninguno"}
        beneficio={entregando}
        yaNoEsta={entregando !== null && !lista.cargando && lista.datos !== null && !lista.datos.datos.some((x) => x.id === entregando.id)}
        alCerrar={() => setEntregando(null)}
        alEntregar={(b) => {
          recargarTodo();
          avisar(`Entregado a ${b.alumno.nombre}. ${b.tipo === "producto_gratis" ? "Se descontó una pieza del inventario." : "Ya quedó registrado."}`);
        }}
        alFallar={recargarTodo}
      />
    </Marco>
  );
}
