// Cotizaciones de un lead: lo que se le cotizó a la familia (por el bot o a mano), congelado con precios, promociones y horarios de ESE día, y el formulario para
// cotizar a mano. Todos los importes son texto del servidor (nunca se recalculan aquí).

import { useState } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { LeadDetalle, ProgramaCotizado } from "../../api/tipos.ts";
import { formatear } from "../../lib/dinero.ts";
import { formatearFecha } from "../../lib/fechas.ts";
import { aEntero } from "../../lib/numeros.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Tarjeta, Vacio } from "../../ui/basicos.tsx";
import { CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";

interface Cotizacion {
  id: string;
  prospecto_id: string;
  grupo_elegido_id: string | null;
  origen: "bot" | "asesor";
  vigente_hasta: string;
  estatus: "vigente" | "aceptada" | "vencida";
  snapshot: { programa?: ProgramaCotizado; supuestos?: { hermanos_inscritos: number; meses_pagados: number } };
}

const TONO = { vigente: "exito", aceptada: "info", vencida: "neutro" } as const;

function TarjetaDeCotizacion({ c, prospectos }: { c: Cotizacion; prospectos: LeadDetalle["prospectos"] }) {
  const p = c.snapshot.programa;
  const quien = prospectos.find((x) => x.id === c.prospecto_id)?.nombre ?? "Alumno";
  return (
    <li className="tarjeta pila" data-prueba={`cotizacion-${c.id}`}>
      <div className="fila fila-entre">
        <strong>
          {p?.nombre ?? "Programa"} · {quien}
        </strong>
        <span className="fila">
          <Insignia tono={TONO[c.estatus]}>{c.estatus === "vigente" ? "Vigente" : c.estatus === "aceptada" ? "Aceptada" : "Vencida"}</Insignia>
          <Insignia>{c.origen === "bot" ? "Del bot" : "A mano"}</Insignia>
        </span>
      </div>
      {p?.precio ? (
        <p>
          Inscripción {formatear(p.precio.costo_inscripcion)} · Mensualidad {formatear(p.precio.costo_mensualidad)}
          {p.promociones && p.promociones.aplicadas.length > 0 ? (
            <>
              <br />
              <span className="muted">
                Con {p.promociones.aplicadas.map((a) => a.nombre).join(", ")}: inscripción {formatear(p.promociones.inscripcion.final_ahora)} · mensualidad {formatear(p.promociones.mensualidad.final_ahora)}
              </span>
            </>
          ) : null}
        </p>
      ) : (
        <p className="muted">Sin precio vigente cuando se cotizó.</p>
      )}
      {c.snapshot.supuestos ? (
        <p className="muted">
          Supuestos: {c.snapshot.supuestos.hermanos_inscritos} hermano(s) inscrito(s), {c.snapshot.supuestos.meses_pagados} mes(es) por adelantado.
        </p>
      ) : null}
      {p?.grupos.length ? (
        <ul>
          {p.grupos.map((g) => (
            <li key={g.grupo_id}>
              {g.horario_texto} ({g.nombre}) · {g.oferta === "lugar" ? `${g.lugares_disponibles} lugares` : "lista de espera"}
              {c.grupo_elegido_id === g.grupo_id ? <strong> · la familia lo eligió</strong> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="muted">Vigente hasta {formatearFecha(c.vigente_hasta)}</p>
    </li>
  );
}

function CotizarAMano({ lead, alCotizar, prospectoInicial }: { lead: LeadDetalle; alCotizar: () => void; prospectoInicial: string | null }) {
  const conEdad = lead.prospectos.filter((p) => (p.edad !== null || p.fecha_nacimiento !== null) && p.alumno_id === null);
  const [prospectoId, setProspectoId] = useState(prospectoInicial ?? "");
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

  if (sucursalId === null) return <Aviso tono="alerta">Este lead todavía no eligió sucursal: sin ella no se puede cotizar. Pídele que la elija.</Aviso>;
  if (conEdad.length === 0) return <Aviso>No hay niños con edad por cotizar (los ya inscritos no se cotizan).</Aviso>;
  return (
    <form
      className="formulario"
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
      <CampoSelect etiqueta="Niño" value={elegido?.id ?? ""} onChange={(e) => { setProspectoId(e.target.value); setProgramaId(""); setHermanos(null); }} opciones={conEdad.map((p) => ({ valor: p.id, texto: `${p.nombre ?? "Sin nombre"} (${p.edad ?? "?"} años)` }))} />
      {oferta.cargando ? <Cargando texto="Buscando programas…" /> : null}
      {oferta.error ? <ErrorDeCarga error={oferta.error} alReintentar={oferta.recargar} /> : null}
      {oferta.datos && programas.length === 0 ? <Aviso tono="alerta">No hay programas para esa edad en esta sucursal.</Aviso> : null}
      {programas.length > 0 ? (
        <CampoSelect etiqueta="Programa" value={programa?.programa_id ?? ""} onChange={(e) => setProgramaId(e.target.value)} opciones={programas.map((p) => ({ valor: p.programa_id, texto: p.precio ? `${p.nombre} · ${formatear(p.precio.costo_mensualidad)} al mes` : `${p.nombre} · sin precio`, deshabilitada: p.sin_precio }))} />
      ) : null}
      {programa?.promociones ? (
        <p data-prueba="precio-con-promociones">
          Con lo que aplica hoy: inscripción {formatear(programa.promociones.inscripcion.final_ahora)} · mensualidad {formatear(programa.promociones.mensualidad.final_ahora)}
        </p>
      ) : null}
      <div className="rejilla rejilla-2">
        <CampoTexto etiqueta="Hermanos ya inscritos (opcional)" inputMode="numeric" value={textoHermanos} onChange={(e) => setHermanos(e.target.value)} error={nHermanos === null ? "Escribe un número entero" : undefined} ayuda={sugeridos > 0 ? "Se supone que se inscriben juntos, contando a los niños que van antes en la ficha. Habilita la promoción por hermanos." : "Habilita la promoción por hermanos en la cotización."} />
        <CampoTexto etiqueta="Meses pagados por adelantado (opcional)" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value)} error={nMeses === null ? "Escribe un número entero" : undefined} />
      </div>
      <ErrorDeAccion error={accion.error} />
      <div>
        <Boton type="submit" variante="primario" cargando={accion.ocupado} disabled={!programa || programa.sin_precio || nHermanos === null || nMeses === null}>
          Guardar cotización
        </Boton>
      </div>
    </form>
  );
}

export function Cotizaciones({ lead, puedeEscribir, cotizarA }: { lead: LeadDetalle; puedeEscribir: boolean; cotizarA: { id: string; vez: number } | null }) {
  const carga = useCarga((senal) => api.get<Pagina<Cotizacion>>(`/api/leads/${lead.id}/cotizaciones`, { limite: 20 }, senal), [lead.id]);
  const [formulario, setFormulario] = useState(false);
  // «Cotizar» en la fila de un niño abre el formulario ya con ese niño elegido.
  const [vistoVez, setVistoVez] = useState(0);
  if (cotizarA && cotizarA.vez !== vistoVez) {
    setVistoVez(cotizarA.vez);
    setFormulario(true);
  }
  return (
    <Tarjeta
      titulo="Cotizaciones"
      acciones={puedeEscribir ? <Boton onClick={() => setFormulario((v) => !v)}>{formulario ? "Cerrar" : "Cotizar a mano"}</Boton> : undefined}
    >
      {formulario ? (
        <CotizarAMano
          key={cotizarA?.vez ?? 0}
          prospectoInicial={cotizarA?.id ?? null}
          lead={lead}
          alCotizar={() => {
            setFormulario(false);
            carga.recargar();
          }}
        />
      ) : null}
      {carga.error ? <ErrorDeCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {carga.cargando && !carga.datos ? <Cargando /> : null}
      {carga.datos && carga.datos.datos.length === 0 ? <Vacio titulo="Todavía no se le cotiza nada" /> : null}
      <ul className="lista-tarjetas">
        {(carga.datos?.datos ?? []).map((c) => (
          <TarjetaDeCotizacion key={c.id} c={c} prospectos={lead.prospectos} />
        ))}
      </ul>
    </Tarjeta>
  );
}
