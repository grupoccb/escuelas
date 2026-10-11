// Cotizaciones de un lead: lo que se le cotizó a la familia (por el bot o a mano), congelado con precios, promociones y horarios de ESE día, y el formulario para
// cotizar a mano. Todos los importes son texto del servidor (nunca se recalculan aquí).

import { useEffect, useState, type ReactNode } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { LeadDetalle, ProgramaCotizado } from "../../api/tipos.ts";
import { formatear, sumar } from "../../lib/dinero.ts";
import { textoDeLugares } from "../../lib/etiquetas.ts";
import { formatearDiaYMes, hoyLocal } from "../../lib/fechas.ts";
import { aEntero } from "../../lib/numeros.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, type Carga } from "../../ui/hooks.ts";

export interface Cotizacion {
  id: string;
  prospecto_id: string;
  grupo_elegido_id: string | null;
  origen: "bot" | "asesor";
  vigente_hasta: string;
  estatus: "vigente" | "aceptada" | "vencida";
  snapshot: { programa?: ProgramaCotizado; supuestos?: { hermanos_inscritos: number; meses_pagados: number } };
}

const TONO = { vigente: "exito", aceptada: "info", vencida: "peligro" } as const;

function TarjetaDeCotizacion({ c, prospectos }: { c: Cotizacion; prospectos: LeadDetalle["prospectos"] }) {
  const p = c.snapshot.programa;
  const quien = prospectos.find((x) => x.id === c.prospecto_id)?.nombre ?? "Alumno";
  const prom = p?.promociones ?? null;
  const horario = p?.grupos.find((g) => g.grupo_id === c.grupo_elegido_id)?.horario_texto ?? null;
  // Lo que se cobra: con promociones, lo que ellas dejan; sin ellas, el precio de lista. Con meses gratis no hay «primer pago» que sumar (el servidor lo calcula al inscribir).
  const inscripcion = prom ? prom.inscripcion.final_ahora : (p?.precio?.costo_inscripcion ?? null);
  const mensualidad = prom ? prom.mensualidad.final_ahora : (p?.precio?.costo_mensualidad ?? null);
  const baja = prom !== null && p?.precio && prom.mensualidad.final_ahora !== p.precio.costo_mensualidad;
  return (
    <li className="cotizacion" data-prueba={`cotizacion-${c.id}`}>
      <div className="cotizacion-cabeza">
        <strong className="cotizacion-titulo">
          {p?.nombre ?? "Programa"} · {quien}
        </strong>
        {horario ? <span className="muted">{horario}</span> : null}
      </div>
      {inscripcion !== null && mensualidad !== null ? (
        <div className="cotizacion-importes numero">
          <span>
            <span className="muted">Inscripción </span>
            <strong>{formatear(inscripcion)}</strong>
          </span>
          <span>
            <span className="muted">Mensualidad </span>
            <strong>
              {formatear(mensualidad)}
              {baja && p?.precio ? ` (antes ${formatear(p.precio.costo_mensualidad)})` : ""}
            </strong>
          </span>
          {prom === null || prom.meses_gratis_ahora === 0 ? (
            <span>
              <span className="muted">Primer pago </span>
              <strong>{formatear(sumar(inscripcion, mensualidad))}</strong>
            </span>
          ) : null}
        </div>
      ) : (
        <p className="muted dato-chico">Sin precio vigente cuando se cotizó.</p>
      )}
      {prom && prom.aplicadas.length > 0 ? (
        <div className="cotizacion-promo">
          <Icono nombre="exito" tamano={16} />
          {prom.aplicadas.map((a) => `Promoción «${a.nombre}»`).join(" · ")}
        </div>
      ) : null}
      {c.snapshot.supuestos ? (
        <p className="muted dato-chico">
          Supuestos: {c.snapshot.supuestos.hermanos_inscritos} hermano(s) inscrito(s), {c.snapshot.supuestos.meses_pagados} mes(es) por adelantado.
        </p>
      ) : null}
      {p?.grupos.length ? (
        <ul className="lista-simple">
          {p.grupos.map((g) => (
            <li key={g.grupo_id}>
              {g.horario_texto} ({g.nombre}) · {g.oferta === "lugar" ? textoDeLugares(g.lugares_disponibles) : "lista de espera"}
              {c.grupo_elegido_id === g.grupo_id ? <strong> · la familia lo eligió</strong> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="cotizacion-pie">
        <span className="fila">
          <Insignia tono={TONO[c.estatus]}>{c.estatus === "vigente" ? "Vigente" : c.estatus === "aceptada" ? "Aceptada" : "Vencida"}</Insignia>
          <Insignia>{c.origen === "bot" ? "Del bot" : "A mano"}</Insignia>
        </span>
        <span>Vigente hasta el {formatearDiaYMes(c.vigente_hasta, hoyLocal())}</span>
      </div>
    </li>
  );
}

/** Las cotizaciones de un lead. La ficha la lee una sola vez y se la pasa a «Niños» (que dice «Cotizar otra vez») y a esta tarjeta. */
export function useCotizaciones(leadId: string, activo: boolean): Carga<Pagina<Cotizacion>> {
  // Con el cotizador apagado ni se pide (módulos, V1).
  return useCarga((senal) => api.get<Pagina<Cotizacion>>(`/api/leads/${leadId}/cotizaciones`, { limite: 20 }, senal), [leadId], activo);
}

/** Los niños que se pueden cotizar: con edad (o fecha de nacimiento) y que aún no son alumnos. */
const cotizables = (lead: LeadDetalle) => lead.prospectos.filter((p) => (p.edad !== null || p.fecha_nacimiento !== null) && p.alumno_id === null);

function CotizarAMano({ lead, alCotizar, alCancelar, prospectoId, alElegirProspecto }: { lead: LeadDetalle; alCotizar: () => void; alCancelar: () => void; prospectoId: string; alElegirProspecto: (id: string) => void }) {
  const conEdad = cotizables(lead);
  const [programaId, setProgramaId] = useState("");
  // null = el sugerido (los niños que van antes en la ficha, suponiendo que se inscriben juntos); si la persona escribe, vale lo escrito.
  const [hermanos, setHermanos] = useState<string | null>(null);
  const [meses, setMeses] = useState("");
  const accion = useAccion();
  const elegido = conEdad.find((p) => p.id === prospectoId) ?? conEdad[0];
  const sugeridos = elegido ? lead.prospectos.findIndex((p) => p.id === elegido.id) : 0;
  const textoHermanos = hermanos ?? String(sugeridos);
  const sucursalId = lead.sucursal?.id ?? null;
  const verticalId = elegido?.vertical.id ?? lead.vertical.id;
  // Los programas de esa edad (o fecha de nacimiento), disciplina y sucursal los calcula el cotizador del servidor (con precio y promociones de hoy).
  const oferta = useCarga(
    (senal) => api.get<{ programas: ProgramaCotizado[] }>("/api/cotizador", { vertical_id: verticalId, sucursal_id: sucursalId ?? undefined, ...(elegido?.fecha_nacimiento ? { fecha_nacimiento: elegido.fecha_nacimiento } : { edad: elegido?.edad ?? undefined }), hermanos_inscritos: (textoHermanos.trim() === "" ? 0 : aEntero(textoHermanos)) ?? undefined }, senal),
    [verticalId, sucursalId, elegido?.id, elegido?.fecha_nacimiento, elegido?.edad, textoHermanos],
    sucursalId !== null && elegido !== undefined,
  );
  const programas = oferta.datos?.programas ?? [];
  const programa = programas.find((p) => p.programa_id === programaId) ?? programas[0];
  const nHermanos = textoHermanos.trim() === "" ? 0 : aEntero(textoHermanos);
  const nMeses = meses.trim() === "" ? 0 : aEntero(meses);

  // Sin sucursal o sin niños por cotizar no hay formulario: el diálogo solo lo dice y se cierra.
  const soloAviso = (aviso: ReactNode) => (
    <>
      {aviso}
      <div className="formulario-acciones">
        <Boton onClick={alCancelar}>Cerrar</Boton>
      </div>
    </>
  );
  if (sucursalId === null) return soloAviso(<Aviso tono="alerta">Este lead todavía no tiene sucursal: sin ella no se puede cotizar. Elígela arriba, en «Sucursal».</Aviso>);
  if (conEdad.length === 0) return soloAviso(<Aviso>No hay niños con edad por cotizar (los ya inscritos no se cotizan).</Aviso>);
  return (
    <form noValidate
      className="formulario formulario-incrustado"
      data-prueba="cotizar-a-mano"
      onSubmit={(e) => {
        e.preventDefault();
        if (!elegido || !programa || nHermanos === null || nMeses === null) return;
        void accion.ejecutar(async () => {
          await api.post(`/api/leads/${lead.id}/cotizaciones`, { prospecto_id: elegido.id, programa_id: programa.programa_id, ...(nHermanos > 0 ? { hermanos_inscritos: nHermanos } : {}), ...(nMeses > 0 ? { meses_pagados: nMeses } : {}) });
          alCotizar();
        });
      }}
    >
      <CampoSelect etiqueta="Niño" value={elegido?.id ?? ""} onChange={(e) => { alElegirProspecto(e.target.value); setProgramaId(""); setHermanos(null); }} opciones={conEdad.map((p) => ({ valor: p.id, texto: `${p.nombre ?? "Sin nombre"} (${p.edad ?? "?"} años)` }))} />
      {oferta.cargando ? <Cargando texto="Buscando programas…" /> : null}
      {oferta.error ? <ErrorDeCarga error={oferta.error} alReintentar={oferta.recargar} /> : null}
      {oferta.datos && programas.length === 0 ? <Aviso tono="alerta">No hay programas para esa edad en esta sucursal.</Aviso> : null}
      {programas.length > 0 ? (
        <CampoSelect etiqueta="Programa" value={programa?.programa_id ?? ""} onChange={(e) => setProgramaId(e.target.value)} opciones={programas.map((p) => ({ valor: p.programa_id, texto: p.precio ? `${p.nombre} · ${formatear(p.precio.costo_mensualidad)} al mes` : `${p.nombre} · sin precio`, deshabilitada: p.sin_precio }))} />
      ) : null}
      {programa?.promociones ? (
        <p className="cotizacion-simulada numero" data-prueba="precio-con-promociones">
          Con lo que aplica hoy: inscripción {formatear(programa.promociones.inscripcion.final_ahora)} · mensualidad {formatear(programa.promociones.mensualidad.final_ahora)}
        </p>
      ) : null}
      <div className="rejilla rejilla-2">
        <CampoTexto etiqueta="Hermanos ya inscritos (opcional)" inputMode="numeric" value={textoHermanos} onChange={(e) => setHermanos(e.target.value)} error={nHermanos === null ? "Escribe un número entero" : undefined} ayuda={sugeridos > 0 ? "Se supone que se inscriben juntos, contando a los niños que van antes en la ficha. Habilita la promoción por hermanos." : "Habilita la promoción por hermanos en la cotización."} />
        <CampoTexto etiqueta="Meses pagados por adelantado (opcional)" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value)} error={nMeses === null ? "Escribe un número entero" : undefined} />
      </div>
      <ErrorDeAccion error={accion.error} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={!programa || programa.sin_precio || nHermanos === null || nMeses === null}>
          Guardar cotización
        </Boton>
        <Boton onClick={alCancelar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export function Cotizaciones({ lead, puedeEscribir, cotizarA, alCambiarFormulario, carga }: { lead: LeadDetalle; puedeEscribir: boolean; cotizarA: { id: string; vez: number } | null; alCambiarFormulario?: (abierto: boolean) => void; carga: Carga<Pagina<Cotizacion>> }) {
  const [formulario, setFormulario] = useState(false);
  const [prospectoId, setProspectoId] = useState("");
  // «Cotizar a …» en la fila de un niño abre el formulario ya con ese niño elegido.
  const [vistoVez, setVistoVez] = useState(0);
  // Con el formulario abierto, «Guardar cotización» es la acción principal de la ficha: la ficha lo sabe para bajar «Convertir e inscribir» a secundario.
  useEffect(() => {
    alCambiarFormulario?.(formulario);
  }, [formulario, alCambiarFormulario]);
  if (cotizarA && cotizarA.vez !== vistoVez) {
    setVistoVez(cotizarA.vez);
    setProspectoId(cotizarA.id);
    setFormulario(true);
  }
  const conEdad = cotizables(lead);
  const elegido = conEdad.find((p) => p.id === prospectoId) ?? conEdad[0];
  const cerrar = () => setFormulario(false);
  return (
    <Tarjeta
      titulo="Cotizaciones"
      acciones={
        puedeEscribir ? (
          <Boton
            onClick={() => {
              setProspectoId("");
              setFormulario(true);
            }}
          >
            Cotizar a mano
          </Boton>
        ) : undefined
      }
    >
      <p className="muted dato-chico">Con los precios y lugares de hoy.</p>
      <Dialogo abierto={formulario} titulo={elegido ? `Cotizar a ${elegido.nombre ?? "este niño"}` : "Cotizar a mano"} alCerrar={cerrar}>
        {formulario ? (
          <>
            {elegido ? (
              <p className="muted">
                {[elegido.edad !== null ? `${elegido.edad} ${elegido.edad === 1 ? "año" : "años"}` : null, elegido.vertical.nombre, lead.sucursal?.nombre ?? null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <CotizarAMano
              lead={lead}
              prospectoId={elegido?.id ?? ""}
              alElegirProspecto={setProspectoId}
              alCancelar={cerrar}
              alCotizar={() => {
                cerrar();
                carga.recargar();
              }}
            />
          </>
        ) : null}
      </Dialogo>
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos && carga.datos.datos.length === 0 ? <Vacio icono="cuenta" titulo="Todavía no se le cotiza nada">{puedeEscribir ? <p>Usa «Cotizar a mano» para calcular el precio de un niño con los programas de hoy.</p> : null}</Vacio> : null}
      <ul className="cotizaciones-lista">
        {(carga.datos?.datos ?? []).map((c) => (
          <TarjetaDeCotizacion key={c.id} c={c} prospectos={lead.prospectos} />
        ))}
      </ul>
    </Tarjeta>
  );
}
