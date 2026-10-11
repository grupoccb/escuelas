// «Lo que adeuda» de «Registrar pago» (R4a): el saldo, lo vencido y los cargos agrupados por hijo. Cada cargo lleva una barra con CUÁNTO cubre el monto que se está escribiendo
// («Este pago lo cubre» / «Se abonan $X; quedan $Y»): lo que cubre sale del reparto que propone el servidor (o del que recepción ajusta a mano), no de una cuenta de la pantalla.

import { useLayoutEffect, useRef } from "react";
import { aCentavos, formatear } from "../../lib/dinero.ts";
import { formatearDiaYMes, hoyLocal } from "../../lib/fechas.ts";
import { Aviso } from "../../ui/basicos.tsx";
import { useDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { disciplinasDe, type EtiquetaDeHijo } from "./disciplinas-de-familia.ts";
import { cargosPorHijo, coberturaDeCargo, textoDeCobertura, type CoberturaDeCargo, type GrupoDeCargos } from "./reparto.ts";
import { nombreDeCargo, type CargoDeCuenta, type EstadoDeCuenta } from "./tipos.ts";

/** La barra de cuánto cubre el pago: el ancho sale de la variable `--p` (puesta con `setProperty`, sin estilos en línea), y el cambio se anima 180 ms. */
export function BarraDeCobertura({ cobertura }: { cobertura: CoberturaDeCargo }) {
  const relleno = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    relleno.current?.style.setProperty("--p", `${cobertura.porcentaje}%`);
  }, [cobertura.porcentaje]);
  return (
    <span className="cubre-barra" aria-hidden="true">
      <span ref={relleno} className={`cubre-relleno cubre-${cobertura.estado}`} />
    </span>
  );
}

function FilaDeCargo({ cargo, aplica, hoy }: { cargo: CargoDeCuenta; aplica: string | undefined; hoy: string }) {
  const cobertura = coberturaDeCargo(cargo.saldo, aplica);
  const vencido = cargo.estatus_efectivo === "vencido";
  return (
    <li className="cargo-fila" data-prueba={`cargo-${cargo.id}`}>
      <div className="cargo-datos">
        <div className="cargo-titulo-fila">
          <strong className="cargo-nombre">{nombreDeCargo(cargo)}</strong>
          <span className={vencido ? "cargo-fecha cargo-fecha-vencida" : "cargo-fecha"}>
            {vencido ? "Venció el" : "Vence el"} {formatearDiaYMes(cargo.fecha_vencimiento, hoy)}
          </span>
        </div>
        <div className="cargo-cubre">
          <BarraDeCobertura cobertura={cobertura} />
          <span className={`cargo-estado cargo-estado-${cobertura.estado}${cobertura.estado === "ninguna" && vencido ? " cargo-estado-vencido" : ""}`}>{textoDeCobertura(cobertura, cargo)}</span>
        </div>
      </div>
      <strong className="numero cargo-importe">{formatear(cargo.saldo)}</strong>
    </li>
  );
}

/** Un hijo con sus cargos: el punto y la disciplina llevan el color de su disciplina (el dato `color_marca`); el nombre de la disciplina se lee. */
function GrupoDeHijo({ grupo, aplicado, etiquetas, hoy }: { grupo: GrupoDeCargos; aplicado: Readonly<Record<string, string>>; etiquetas: readonly EtiquetaDeHijo[]; hoy: string }) {
  const disciplina = disciplinasDe(etiquetas, grupo.alumno.id);
  const ref = useDisciplina<HTMLDivElement>(disciplina?.color ?? null);
  return (
    <div ref={ref} className="deuda-grupo">
      <h3 className="deuda-grupo-titulo">
        <span className="deuda-grupo-punto" aria-hidden="true" />
        {grupo.alumno.nombre}
        {disciplina ? (
          <>
            <span aria-hidden="true"> · </span>
            <span className="solo-lectores">, </span>
            <span className="deuda-grupo-disciplina">{disciplina.texto}</span>
          </>
        ) : null}
      </h3>
      <ul className="cargo-lista">
        {grupo.cargos.map((c) => (
          <FilaDeCargo key={c.id} cargo={c} aplica={aplicado[c.id]} hoy={hoy} />
        ))}
      </ul>
    </div>
  );
}

export function DeudaDeLaFamilia({ estado, aplicado, etiquetas }: { estado: EstadoDeCuenta; aplicado: Readonly<Record<string, string>>; etiquetas: readonly EtiquetaDeHijo[] }) {
  const grupos = cargosPorHijo(estado);
  const hoy = hoyLocal();
  const hayVencido = aCentavos(estado.resumen.vencido) > 0n;
  const nVencidos = grupos.reduce((n, g) => n + g.cargos.filter((c) => c.estatus_efectivo === "vencido").length, 0);
  return (
    <section className="tarjeta cobro-deuda">
      <div className="deuda-cifra">
        <div className="deuda-total">
          <h2 className="etiqueta-panel">Lo que adeuda</h2>
          <p className="cifra-principal numero" data-prueba="saldo-total">
            {formatear(estado.resumen.saldo)}
          </p>
        </div>
        {hayVencido ? (
          <span className="insignia insignia-alerta insignia-con-icono">
            <Icono nombre="alerta" tamano={14} />
            {nVencidos === 1 ? "1 cargo vencido" : `${nVencidos} cargos vencidos`} ·{" "}
            <span className="numero" data-prueba="saldo-vencido">
              {formatear(estado.resumen.vencido)}
            </span>
          </span>
        ) : grupos.length > 0 ? (
          <span className="insignia insignia-exito insignia-con-icono">
            <Icono nombre="exito" tamano={14} />
            Nada vencido
          </span>
        ) : null}
      </div>
      {grupos.length === 0 ? (
        <Aviso tono="exito">Esta familia no debe nada.</Aviso>
      ) : (
        grupos.map((g, i) => <GrupoDeHijo key={`${g.alumno.id}-${i}`} grupo={g} aplicado={aplicado} etiquetas={etiquetas} hoy={hoy} />)
      )}
    </section>
  );
}
