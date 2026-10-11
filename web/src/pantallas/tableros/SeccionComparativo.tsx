// Sección 08 «Por disciplina y sucursal»: una tarjeta por pareja disciplina × sucursal con sus alumnos, ingreso, ocupación y deserción del mes. El color de la disciplina (su dato
// `color_marca`) es un refuerzo: cada tarjeta escribe el nombre de la disciplina y la sucursal. También salen las parejas con grupos y sin alumnos.

import { ConDisciplina } from "../../ui/disciplina.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { Vacio } from "../../ui/basicos.tsx";
import { fraseDeComparativo, tarjetasComparativas, type NivelDeDesercion, type TarjetaComparativa } from "./graficas-b.ts";
import { SeccionNumerada } from "./SeccionNumerada.tsx";
import type { PropsDeSeccionConDatos } from "./contrato-secciones.ts";

const TEXTO_DE_NIVEL: Record<NivelDeDesercion, string> = { alta: "alta", media: "media", baja: "baja" };

function Tarjeta({ t, color }: { t: TarjetaComparativa; color: string | null }) {
  return (
    <ConDisciplina as="article" color={color} className="comparativo-tarjeta">
      <h3 className="comparativo-cabeza" data-prueba={`comparativo-${t.clave}`}>
        <span className="comparativo-disciplina">
          <span className="comparativo-punto" aria-hidden="true" />
          {t.disciplina}
        </span>
        <span className="comparativo-sucursal">
          <span className="solo-lectores"> en </span>
          {t.sucursal}
        </span>
      </h3>
      <p className="comparativo-alumnos">
        <span className="comparativo-cifra numero">{t.alumnos}</span>
        <span className="comparativo-detalle">
          {t.alumnosTexto} · {t.ingreso} al mes
        </span>
      </p>
      {t.sinAlumnos ? <p className="comparativo-nota">Todavía sin alumnos en esta sucursal.</p> : null}
      <div className="comparativo-medida">
        <div className="comparativo-fila">
          <span>Ocupación</span>
          <strong className="numero">{t.ocupacion ? t.ocupacion.texto : "Sin grupos"}</strong>
        </div>
        {t.ocupacion ? (
          <>
            <svg className="comparativo-barra" width="100%" height="10" aria-hidden="true" focusable="false">
              <rect className="comparativo-barra-riel" x="0" y="0" width="100%" height="10" />
              <rect className="comparativo-barra-valor" x="0" y="0" width={`${t.ocupacion.ancho}%`} height="10" />
            </svg>
            <span className="comparativo-nota">{t.ocupacion.lugares}</span>
          </>
        ) : null}
      </div>
      <div className="comparativo-fila">
        <span>Deserción del mes</span>
        <span className={`comparativo-desercion comparativo-desercion-${t.desercion.nivel ?? "sin"}`}>
          {t.desercion.nivel === "alta" ? <Icono nombre="alerta" tamano={14} /> : null}
          <span className="numero">{t.desercion.texto}</span>
          {t.desercion.nivel ? <span className="solo-lectores"> ({TEXTO_DE_NIVEL[t.desercion.nivel]})</span> : null}
        </span>
      </div>
      <p className="comparativo-nota">
        Altas {t.altas} · Bajas {t.bajas}
      </p>
    </ConDisciplina>
  );
}

export function SeccionComparativo({ ejecutivo, colorDeVertical }: PropsDeSeccionConDatos) {
  const tarjetas = tarjetasComparativas(ejecutivo.comparativo);
  const frase = fraseDeComparativo(ejecutivo.comparativo);
  return (
    <SeccionNumerada id="comparativo" numero="08" titulo="Por disciplina y sucursal" {...(frase ? { descripcion: frase } : {})}>
      {tarjetas.length === 0 ? (
        <Vacio titulo="Todavía no hay nada que comparar" icono="vacio">
          Cuando haya grupos activos y alumnos inscritos, aquí verás cada disciplina en cada sucursal.
        </Vacio>
      ) : (
        <div className="comparativo-rejilla">
          {tarjetas.map((t) => (
            <Tarjeta key={t.clave} t={t} color={colorDeVertical(t.verticalId)} />
          ))}
        </div>
      )}
    </SeccionNumerada>
  );
}
