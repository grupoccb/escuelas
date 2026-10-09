// Promociones: condición, alcance (vacío = todas partes), beneficios, cupo, prioridad y vigencia. Las reglas las aplica el servidor de forma determinista; aquí solo se
// capturan. El cupo usado lo mueve el sistema al aplicar la promoción: no se edita.

import { useState } from "react";
import { api, type Pagina as Pag } from "../../api/cliente.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { Paginador } from "../../ui/Paginador.tsx";
import { enteroDe } from "./ayudas.ts";
import { CONDICIONES, MOMENTOS, OPCIONES_DE_BENEFICIO, textoDeBeneficio, valorDeBeneficio } from "./beneficios.ts";
import { ConfirmarAccion, Regreso, useEdicion } from "./comunes.tsx";
import type { BeneficioAdmin, ProgramaAdmin, PromocionAdmin, SucursalAdmin, Vertical } from "./tipos.ts";

interface CuerpoDeBeneficio {
  tipo: string;
  modo: string;
  valor: string | null;
  descripcion: string | null;
  momento_disparo: string;
}

/** Captura UN beneficio. Con `alAgregar` lo entrega armado (la pantalla decide si lo manda ya o lo junta con los demás). */
function CapturaDeBeneficio({ alAgregar }: { alAgregar: (b: CuerpoDeBeneficio) => Promise<unknown> | void }) {
  const [clave, setClave] = useState(OPCIONES_DE_BENEFICIO[0]!.clave);
  const [valor, setValor] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [momento, setMomento] = useState("inmediato");
  const [error, setError] = useState<string | null>(null);
  const accion = useAccion();
  const opcion = OPCIONES_DE_BENEFICIO.find((o) => o.clave === clave)!;
  return (
    <div className="pila" data-prueba="captura-de-beneficio">
      <CampoSelect etiqueta="Qué da" value={clave} opciones={OPCIONES_DE_BENEFICIO.map((o) => ({ valor: o.clave, texto: o.texto }))} onChange={(e) => { setClave(e.target.value); setValor(""); setError(null); }} />
      {opcion.valor !== "ninguno" ? <CampoTexto etiqueta={opcion.valor === "porcentaje" ? "Porcentaje" : opcion.valor === "meses" ? "Cuántos meses" : "Monto (MXN)"} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} error={error ?? undefined} /> : null}
      <CampoTexto etiqueta="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} ayuda={opcion.tipo === "producto_gratis" ? "Qué producto se entrega (por ejemplo, «Uniforme»)." : undefined} />
      <CampoSelect etiqueta="Cuándo se da" value={momento} opciones={MOMENTOS.map((m) => ({ valor: m.valor, texto: m.texto }))} onChange={(e) => setMomento(e.target.value)} />
      <ErrorDeAccion error={accion.error} />
      <div>
        <Boton
          cargando={accion.ocupado}
          onClick={() => {
            const v = valorDeBeneficio(opcion.valor, valor);
            if ("error" in v) return setError(v.error);
            setError(null);
            void accion.ejecutar(async () => {
              await alAgregar({ tipo: opcion.tipo, modo: opcion.modo, valor: v.valor, descripcion: descripcion.trim() === "" ? null : descripcion.trim(), momento_disparo: momento });
              setValor("");
              setDescripcion("");
            });
          }}
        >
          Agregar este beneficio
        </Boton>
      </div>
    </div>
  );
}

function Formulario({ promo, verticales, sucursales, programas, alGuardar, alCerrar }: { promo: PromocionAdmin | null; verticales: Vertical[]; sucursales: SucursalAdmin[]; programas: ProgramaAdmin[]; alGuardar: () => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(promo?.nombre ?? "");
  const [codigo, setCodigo] = useState(promo?.codigo ?? "");
  const [desde, setDesde] = useState(promo?.vigencia_desde ?? "");
  const [hasta, setHasta] = useState(promo?.vigencia_hasta ?? "");
  const [condicion, setCondicion] = useState(promo?.condicion_tipo ?? "sin_condicion");
  const [hermanos, setHermanos] = useState(promo?.condicion_valor?.hermanos ? String(promo.condicion_valor.hermanos) : "2");
  const [meses, setMeses] = useState(promo?.condicion_valor?.meses ? String(promo.condicion_valor.meses) : "3");
  const [cupo, setCupo] = useState(promo?.cupo_maximo ? String(promo.cupo_maximo) : "");
  const [acumulable, setAcumulable] = useState(promo?.acumulable ?? false);
  const [prioridad, setPrioridad] = useState(promo ? String(promo.prioridad) : "0");
  const [activo, setActivo] = useState(promo?.activo ?? true);
  const [vs, setVs] = useState<string[]>(promo?.verticales ?? []);
  const [ss, setSs] = useState<string[]>(promo?.sucursales ?? []);
  const [ps, setPs] = useState<string[]>(promo?.programas ?? []);
  const [nuevos, setNuevos] = useState<CuerpoDeBeneficio[]>([]);
  const [existentes, setExistentes] = useState<BeneficioAdmin[]>(promo?.beneficios ?? []);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const quitar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  const alternar = (lista: string[], poner: (x: string[]) => void, id: string, marcado: boolean) => poner(marcado ? [...lista, id] : lista.filter((x) => x !== id));

  return (
    <form
      className="formulario"
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const cupoN = cupo.trim() === "" ? null : enteroDe(cupo, 1, 100000);
        const prio = enteroDe(prioridad, -1000, 1000);
        const h = condicion === "min_hermanos" ? enteroDe(hermanos, 2, 20) : null;
        const m = condicion === "pago_anticipado" ? enteroDe(meses, 1, 24) : null;
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
        if (!/^[A-Za-z0-9_-]{2,40}$/.test(codigo.trim())) e["codigo"] = "Escribe un código de letras, números, guion o guion bajo";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) e["vigencia_desde"] = "Elige la fecha en que empieza";
        if (hasta !== "" && hasta < desde) e["vigencia_hasta"] = "No puede ser antes del inicio";
        if (cupo.trim() !== "" && cupoN === null) e["cupo_maximo"] = "Escribe un número de 1 a 100000";
        if (prio === null) e["prioridad"] = "Escribe un número de -1000 a 1000";
        if (condicion === "min_hermanos" && h === null) e["condicion_valor"] = "Escribe cuántos hermanos inscritos (2 a 20)";
        if (condicion === "pago_anticipado" && m === null) e["condicion_valor"] = "Escribe cuántos meses (1 a 24)";
        if (promo === null && nuevos.length === 0) e["beneficios"] = "Agrega al menos un beneficio";
        setLocal(e);
        if (Object.keys(e).length > 0 || prio === null) return;
        const comun = {
          nombre: nombre.trim(),
          codigo: codigo.trim().toUpperCase(),
          vigencia_desde: desde,
          vigencia_hasta: hasta === "" ? null : hasta,
          condicion_tipo: condicion,
          condicion_valor: condicion === "min_hermanos" ? { hermanos: h } : condicion === "pago_anticipado" ? { meses: m } : null,
          cupo_maximo: cupoN,
          acumulable,
          prioridad: prio,
          activo,
          verticales: vs,
          sucursales: ss,
          programas: ps,
        };
        void guardar.ejecutar(async () => {
          if (promo) await api.patch(`/api/promociones/${promo.id}`, comun);
          else await api.post("/api/promociones", { ...comun, beneficios: nuevos });
          alGuardar();
        });
      }}
    >
      <CampoTexto etiqueta="Nombre de la promoción" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoTexto etiqueta="Código" requerido value={codigo} onChange={(e) => setCodigo(e.target.value)} error={err("codigo")} ayuda="Único entre las promociones; se guarda en mayúsculas." />
      <div className="rejilla rejilla-2">
        <CampoTexto etiqueta="Vigente desde" type="date" requerido value={desde} onChange={(e) => setDesde(e.target.value)} error={err("vigencia_desde")} />
        <CampoTexto etiqueta="Hasta (opcional)" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} error={err("vigencia_hasta")} />
      </div>
      <CampoSelect etiqueta="Condición" value={condicion} opciones={CONDICIONES.map((c) => ({ valor: c.valor, texto: c.texto }))} onChange={(e) => setCondicion(e.target.value)} />
      {condicion === "min_hermanos" ? <CampoTexto etiqueta="Hermanos inscritos mínimos" inputMode="numeric" value={hermanos} onChange={(e) => setHermanos(e.target.value)} error={err("condicion_valor")} /> : null}
      {condicion === "pago_anticipado" ? <CampoTexto etiqueta="Meses pagados por adelantado" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value)} error={err("condicion_valor")} /> : null}
      <div className="rejilla rejilla-2">
        <CampoTexto etiqueta="Cupo máximo (opcional)" inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} error={err("cupo_maximo")} ayuda={promo ? `Usado: ${promo.cupo_usado}` : "Cuántas veces se puede aplicar."} />
        <CampoTexto etiqueta="Prioridad" inputMode="numeric" value={prioridad} onChange={(e) => setPrioridad(e.target.value)} error={err("prioridad")} ayuda="Mayor número, se aplica primero. Si dos promociones no se pueden juntar, gana la de mayor número; si empatan, la que más le ahorra a la familia." />
      </div>
      <CampoCasilla etiqueta="Se puede acumular con otras promociones" ayuda="Si no la marcas, esta promoción nunca se junta con otra: cuando aplica, aplica sola." checked={acumulable} onChange={(e) => setAcumulable(e.target.checked)} />
      <CampoCasilla etiqueta="Activa" checked={activo} onChange={(e) => setActivo(e.target.checked)} />

      <fieldset className="pila sin-borde">
        <legend>
          <strong>Dónde vale</strong>
        </legend>
        <p className="campo-ayuda">Sin nada marcado en un grupo, vale en todas partes.</p>
        <strong>Disciplinas</strong>
        {verticales.map((v) => <CampoCasilla key={v.id} etiqueta={v.nombre} checked={vs.includes(v.id)} onChange={(e) => alternar(vs, setVs, v.id, e.target.checked)} />)}
        <strong>Sucursales</strong>
        {sucursales.map((s) => <CampoCasilla key={s.id} etiqueta={s.nombre} checked={ss.includes(s.id)} onChange={(e) => alternar(ss, setSs, s.id, e.target.checked)} />)}
        <strong>Programas</strong>
        {programas.map((p) => <CampoCasilla key={p.id} etiqueta={p.nombre} checked={ps.includes(p.id)} onChange={(e) => alternar(ps, setPs, p.id, e.target.checked)} />)}
      </fieldset>

      <fieldset className="pila sin-borde" data-prueba="beneficios">
        <legend>
          <strong>Beneficios</strong>
        </legend>
        {err("beneficios") ? <p className="campo-error">{err("beneficios")}</p> : null}
        <ul>
          {existentes.map((b) => (
            <li key={b.id} className="fila fila-entre">
              <span>{textoDeBeneficio(b)}</span>
              {promo ? (
                <Boton
                  variante="fantasma"
                  cargando={quitar.ocupado}
                  onClick={() =>
                    void quitar.ejecutar(async () => {
                      await api.delete(`/api/promociones/${promo.id}/beneficios/${b.id}`);
                      setExistentes((x) => x.filter((y) => y.id !== b.id));
                    })
                  }
                >
                  Quitar
                </Boton>
              ) : null}
            </li>
          ))}
          {nuevos.map((b, i) => (
            <li key={i} className="fila fila-entre">
              <span>{textoDeBeneficio(b)}</span>
              <Boton variante="fantasma" onClick={() => setNuevos((n) => n.filter((_, j) => j !== i))}>
                Quitar
              </Boton>
            </li>
          ))}
        </ul>
        <ErrorDeAccion error={quitar.error} />
        <CapturaDeBeneficio
          alAgregar={async (b) => {
            if (promo) {
              const creado = await api.post<BeneficioAdmin>(`/api/promociones/${promo.id}/beneficios`, b);
              setExistentes((x) => [...x, creado]);
            } else setNuevos((n) => [...n, b]);
          }}
        />
      </fieldset>

      <ErrorDeAccion error={guardar.error} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cerrar</Boton>
      </div>
    </form>
  );
}

export default function Promociones() {
  useTitulo("Promociones");
  const [pagina, setPagina] = useState(1);
  const lista = useCarga((senal) => api.get<Pag<PromocionAdmin>>("/api/promociones", { limite: 25, pagina }, senal), [pagina]);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal), []);
  const sucursales = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), []);
  const programas = useCarga((senal) => api.get<Pag<ProgramaAdmin>>("/api/programas", { limite: 100 }, senal), []);
  const edicion = useEdicion<PromocionAdmin>();
  const [baja, setBaja] = useState<PromocionAdmin | null>(null);
  return (
    <Pagina titulo="Promociones" subtitulo="Descuentos, meses y productos gratis con su condición y su alcance." acciones={<><Regreso /><Boton variante="primario" onClick={edicion.nuevo}>Nueva promoción</Boton></>}>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <Vacio titulo="Todavía no hay promociones" /> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-promociones">
        {(lista.datos?.datos ?? []).map((p) => (
          <li key={p.id} className="tarjeta pila" data-prueba={`promocion-${p.codigo}`}>
            <div className="fila fila-entre">
              <strong>
                {p.nombre} <span className="muted">· {p.codigo}</span>
              </strong>
              <span className="fila">
                <Insignia tono={p.activo ? "exito" : "neutro"}>{p.activo ? "Activa" : "Inactiva"}</Insignia>
                <Insignia>Prioridad {p.prioridad}</Insignia>
                {p.acumulable ? <Insignia tono="info">Acumulable</Insignia> : null}
              </span>
            </div>
            <p className="muted">
              Del {formatearFecha(p.vigencia_desde)} {p.vigencia_hasta ? `al ${formatearFecha(p.vigencia_hasta)}` : "sin fecha de fin"} · {CONDICIONES.find((c) => c.valor === p.condicion_tipo)?.texto ?? p.condicion_tipo}
              {p.cupo_maximo ? ` · cupo ${p.cupo_usado}/${p.cupo_maximo}` : ""}
            </p>
            <ul>
              {p.beneficios.map((b) => (
                <li key={b.id}>{textoDeBeneficio(b)}</li>
              ))}
            </ul>
            <div className="fila">
              <Boton onClick={() => edicion.editar(p)}>Editar</Boton>
              <Boton variante="peligro" onClick={() => setBaja(p)}>Dar de baja</Boton>
            </div>
          </li>
        ))}
      </ul>
      {lista.datos ? <Paginador pagina={lista.datos.paginacion.pagina} limite={lista.datos.paginacion.limite} total={lista.datos.paginacion.total} alCambiar={setPagina} /> : null}
      <Dialogo abierto={edicion.actual !== null} titulo={edicion.actual === "nuevo" ? "Nueva promoción" : "Editar promoción"} alCerrar={() => { edicion.cerrar(); lista.recargar(); }}>
        {edicion.actual !== null ? (
          <Formulario
            key={edicion.actual === "nuevo" ? "nuevo" : edicion.actual.id}
            promo={edicion.actual === "nuevo" ? null : edicion.actual}
            verticales={verticales.datos?.datos ?? []}
            sucursales={sucursales.datos?.datos ?? []}
            programas={programas.datos?.datos ?? []}
            alGuardar={() => { edicion.cerrar(); lista.recargar(); }}
            alCerrar={() => { edicion.cerrar(); lista.recargar(); }}
          />
        ) : null}
      </Dialogo>
      <ConfirmarAccion abierto={baja !== null} titulo="Dar de baja la promoción" textoDeConfirmar="Dar de baja" alCerrar={() => setBaja(null)} alConfirmar={async () => { await api.delete(`/api/promociones/${baja!.id}`); lista.recargar(); }}>
        <Aviso tono="alerta">Si tiene beneficios por entregar, el sistema no la dejará dar de baja. Baja de <strong>{baja?.nombre}</strong>.</Aviso>
      </ConfirmarAccion>
    </Pagina>
  );
}
