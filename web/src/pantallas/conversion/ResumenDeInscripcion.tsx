// El resumen fijo a la derecha del asistente (R5a): por niño su disciplina (punto con el color de `color_marca`), grupo, inscripción y mensualidad con lo que de verdad se cobra; la promoción
// que aplica y el primer pago de la familia. Lee lo que ya sabe el asistente (la oferta del cotizador y el grupo elegido): no calcula nada propio, solo suma importes en centavos.

import { formatear } from "../../lib/dinero.ts";
import { useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { grupoEfectivo, nombreDeProspecto, preciosDeLosNinos, programaDeGrupo, type ContextoDePasos } from "./Pasos.tsx";
import { primerPago } from "./resumen.ts";

function FilaDeResumen({ c, id }: { c: ContextoDePasos; id: string }) {
  const prospecto = c.lead.prospectos.find((p) => p.id === id);
  const ref = useDisciplina<HTMLDivElement>(prospecto ? (c.colorDe?.(prospecto.vertical.id) ?? null) : null);
  const g = grupoEfectivo(c, id);
  const programa = g ? programaDeGrupo(c, id, g) : null;
  const grupo = programa?.grupos.find((x) => x.grupo_id === g);
  const prom = programa?.promociones ?? null;
  const apellidos = c.entrada.alumnos[id]?.apellidos || c.capturado[id]?.registro?.alumno.apellidos || prospecto?.apellidos || "";
  return (
    <div ref={ref} className="resumen-lateral-nino" data-prueba={`resumen-lateral-${id}`}>
      <div className="resumen-lateral-nombre">
        <span className="resumen-lateral-punto" aria-hidden="true" />
        <strong>{`${nombreDeProspecto(c, id)} ${apellidos}`.trim()}</strong>
      </div>
      <span className="resumen-lateral-grupo">{grupo ? `${programa?.nombre} · ${grupo.horario_texto}` : "Todavía sin grupo"}</span>
      {prom ? (
        <>
          <div className="resumen-lateral-fila">
            <span>Inscripción</span>
            <span className="numero">{formatear(prom.inscripcion.final_ahora)}</span>
          </div>
          <div className="resumen-lateral-fila">
            <span>Mensualidad</span>
            <span className="numero">{formatear(prom.mensualidad.final_ahora)}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ResumenDeInscripcion({ c }: { c: ContextoDePasos }) {
  const total = primerPago(preciosDeLosNinos(c));
  const promociones = [...new Set(c.pendientes.flatMap((id) => {
    const g = grupoEfectivo(c, id);
    return (g ? programaDeGrupo(c, id, g) : null)?.promociones?.aplicadas.map((a) => a.nombre) ?? [];
  }))];
  return (
    <aside className="asistente-resumen" aria-label="Resumen" data-prueba="resumen-lateral">
      <h2>Resumen</h2>
      {c.pendientes.map((id) => (
        <FilaDeResumen key={id} c={c} id={id} />
      ))}
      {promociones.length > 0 ? (
        <div className="resumen-lateral-promo">
          <Icono nombre="exito" tamano={16} />
          {promociones.map((n) => `Promoción «${n}»`).join(" · ")}
        </div>
      ) : null}
      {total !== null ? (
        <div className="resumen-lateral-total">
          <span>Primer pago</span>
          <strong className="numero">{formatear(total)}</strong>
        </div>
      ) : null}
    </aside>
  );
}
