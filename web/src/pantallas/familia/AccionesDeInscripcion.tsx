// Las acciones de F5 sobre una inscripción, cada una con su confirmación: cambiar de grupo (con el cupo REAL de cada grupo del mismo programa), congelar,
// reactivar y dar de baja con un motivo del catálogo. El servidor decide: si el último lugar se ocupó mientras se miraba la pantalla, responde 409 y se dice.
// R6a: el grupo y el motivo se eligen en botones grandes (los grupos llenos, apagados y punteados) y al terminar el aviso global dice qué pasó. Se ofrecen de dos formas: `iconos`
// (una fila por inscripción, para quien tiene varias) y `cabecera` (los botones con texto del encabezado del expediente, cuando solo hay una inscripción vigente).

import { useState } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Grupo } from "../../api/tipos.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga } from "../../ui/basicos.tsx";
import { useAvisos } from "../../ui/avisos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import type { FilaDeOcupacion, InscripcionDeExpediente } from "./tipos.ts";

type Cuadro = "cambiar" | "congelar" | "reactivar" | "baja" | null;

/** Un grupo o un motivo en un botón grande: el elegido va en el color de la marca; uno lleno (o sin lugar) va apagado y punteado, y lo dice con texto. */
function OpcionesGrandes<T extends { valor: string; texto: string; deshabilitada?: boolean }>({ leyenda, opciones, elegida, alElegir }: { leyenda: string; opciones: readonly T[]; elegida: string; alElegir: (v: string) => void }) {
  return (
    <fieldset className="grupo-opciones">
      <legend>{leyenda}</legend>
      <div className="opciones-rejilla">
        {opciones.map((o) => (
          <button key={o.valor} type="button" className="opcion-boton" aria-pressed={elegida === o.valor} disabled={o.deshabilitada} onClick={() => alElegir(o.valor)}>
            {o.texto}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function CambiarDeGrupo({ inscripcion, alumno, alTerminar, alCerrar }: { inscripcion: InscripcionDeExpediente; alumno: string; alTerminar: () => void; alCerrar: () => void }) {
  const grupos = useCarga((senal) => api.get<Pagina<Grupo>>("/api/grupos", { programa_id: inscripcion.programa.id, limite: 100 }, senal), [inscripcion.programa.id]);
  const ocupacion = useCarga((senal) => api.get<{ datos: FilaDeOcupacion[] }>("/api/reportes/ocupacion", undefined, senal), []);
  const [elegido, setElegido] = useState("");
  const cambio = useAccion();
  const { avisar } = useAvisos();
  if (grupos.error) return <ErrorDeCarga error={grupos.error} alReintentar={grupos.recargar} />;
  if (ocupacion.error) return <ErrorDeCarga error={ocupacion.error} alReintentar={ocupacion.recargar} />;
  if (!grupos.datos || !ocupacion.datos) return <Cargando />;
  const ocupados = new Map(ocupacion.datos.datos.map((f) => [f.grupo.id, f.ocupados]));
  const opciones = grupos.datos.datos
    .filter((g) => g.activo && g.id !== inscripcion.grupo.id)
    .map((g) => {
      const lugares = g.cupo_maximo - (ocupados.get(g.id) ?? 0);
      return { valor: g.id, texto: `${g.nombre} · ${lugares > 0 ? `${lugares} lugar${lugares === 1 ? "" : "es"}` : "lleno"}`, deshabilitada: lugares <= 0 };
    });
  return (
    <div className="pila">
      <p>
        Ahora está en <strong>{inscripcion.grupo.nombre}</strong>. Solo se puede cambiar a otro grupo del mismo programa ({inscripcion.programa.nombre}): el precio y las promociones no cambian.
      </p>
      {opciones.length === 0 ? <Aviso>Este programa no tiene otro grupo activo.</Aviso> : <OpcionesGrandes leyenda={`Nuevo horario (${inscripcion.programa.nombre} · ${inscripcion.sucursal.nombre})`} opciones={opciones} elegida={elegido} alElegir={setElegido} />}
      <ErrorDeAccion error={cambio.error} />
      <div className="formulario-acciones dialogo-acciones-familia">
        <Boton
          variante="primario"
          className="boton-accion-celular"
          disabled={elegido === ""}
          cargando={cambio.ocupado}
          onClick={() =>
            void cambio.ejecutar(async () => {
              await api.post(`/api/inscripciones/${inscripcion.id}/cambiar-grupo`, { grupo_id: elegido });
              avisar(`${alumno} cambió de grupo.`);
              alTerminar();
            })
          }
        >
          Confirmar el cambio
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </div>
  );
}

function DarDeBaja({ inscripcion, alumno, alTerminar, alCerrar }: { inscripcion: InscripcionDeExpediente; alumno: string; alTerminar: () => void; alCerrar: () => void }) {
  const motivos = useCarga((senal) => api.get<{ datos: { id: string; nombre: string; activo: boolean }[] }>("/api/motivos-baja", { activo: true }, senal), []);
  const [motivo, setMotivo] = useState("");
  const baja = useAccion();
  const { avisar } = useAvisos();
  if (motivos.error) return <ErrorDeCarga error={motivos.error} alReintentar={motivos.recargar} />;
  if (!motivos.datos) return <Cargando />;
  const motivosActivos = motivos.datos.datos.filter((m) => m.activo);
  return (
    <div className="pila">
      <p className="cancelar-advertencia">
        <Icono nombre="alerta" tamano={18} />
        <span>
          La baja libera el lugar en <strong>{inscripcion.grupo.nombre}</strong> y detiene los cobros futuros. Lo ya cobrado y el precio congelado se conservan.
        </span>
      </p>
      {motivosActivos.length === 0 ? <Aviso>No hay motivos de baja en el catálogo. Pídele al administrador que agregue uno.</Aviso> : <OpcionesGrandes leyenda="Motivo de la baja" opciones={motivosActivos.map((m) => ({ valor: m.id, texto: m.nombre }))} elegida={motivo} alElegir={setMotivo} />}
      <ErrorDeAccion error={baja.error} />
      <div className="formulario-acciones dialogo-acciones-familia">
        <Boton
          variante="peligro"
          className="boton-accion-celular"
          disabled={motivo === ""}
          cargando={baja.ocupado}
          onClick={() =>
            void baja.ejecutar(async () => {
              await api.post(`/api/inscripciones/${inscripcion.id}/baja`, { motivo_baja_id: motivo });
              avisar(`${alumno} quedó dado de baja de ${inscripcion.grupo.nombre}.`);
              alTerminar();
            })
          }
        >
          Dar de baja
        </Boton>
        <Boton onClick={alCerrar}>Conservar la inscripción</Boton>
      </div>
    </div>
  );
}

function Confirmar({ inscripcion, alumno, que, alTerminar, alCerrar }: { inscripcion: InscripcionDeExpediente; alumno: string; que: "congelar" | "reactivar"; alTerminar: () => void; alCerrar: () => void }) {
  const accion = useAccion();
  const { avisar } = useAvisos();
  const congelar = que === "congelar";
  return (
    <div className="pila">
      <p>
        {congelar
          ? `Se congelará la inscripción en ${inscripcion.grupo.nombre}: libera su lugar y se pausan los cobros mientras esté congelada.`
          : `Se reactivará la inscripción en ${inscripcion.grupo.nombre}. Necesita un lugar libre: si el grupo se llenó mientras estaba congelada, el sistema no la reactiva.`}
      </p>
      <ErrorDeAccion error={accion.error} />
      <div className="formulario-acciones dialogo-acciones-familia">
        <Boton
          variante="primario"
          className="boton-accion-celular"
          cargando={accion.ocupado}
          onClick={() =>
            void accion.ejecutar(async () => {
              await api.post(`/api/inscripciones/${inscripcion.id}/${que}`, {});
              avisar(que === "congelar" ? `La inscripción de ${alumno} en ${inscripcion.grupo.nombre} quedó congelada.` : `La inscripción de ${alumno} en ${inscripcion.grupo.nombre} quedó reactivada.`);
              alTerminar();
            })
          }
        >
          {congelar ? "Congelar" : "Reactivar"}
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </div>
  );
}

/** `nombre`: el nombre de pila del alumno (los títulos y los avisos lo dicen: «Cambiar a Santino de grupo»). */
export function AccionesDeInscripcion({ inscripcion, nombre, alCambiar, variante = "iconos" }: { inscripcion: InscripcionDeExpediente; nombre: string; alCambiar: () => void; variante?: "iconos" | "cabecera" }) {
  const [cuadro, setCuadro] = useState<Cuadro>(null);
  if (inscripcion.estatus === "baja") return null;
  const cerrar = () => setCuadro(null);
  const terminar = () => {
    setCuadro(null);
    alCambiar();
  };
  const titulos = { cambiar: `Cambiar a ${nombre} de grupo`, congelar: "Congelar la inscripción", reactivar: "Reactivar la inscripción", baja: `Dar de baja a ${nombre}` } as const;
  const botones =
    variante === "iconos" ? (
      <>
        <Boton className="boton-icono" aria-label="Cambiar de grupo" title="Cambiar de grupo" onClick={() => setCuadro("cambiar")}>
          <Icono nombre="cambiar" tamano={20} />
        </Boton>
        {inscripcion.estatus === "activa" ? (
          <Boton className="boton-icono" aria-label="Congelar" title="Congelar" onClick={() => setCuadro("congelar")}>
            <Icono nombre="pausa" tamano={20} />
          </Boton>
        ) : (
          <Boton className="boton-icono" aria-label="Reactivar" title="Reactivar" onClick={() => setCuadro("reactivar")}>
            <Icono nombre="reanudar" tamano={20} />
          </Boton>
        )}
        <Boton variante="peligro" className="boton-icono boton-icono-peligro" aria-label="Dar de baja" title="Dar de baja" onClick={() => setCuadro("baja")}>
          <Icono nombre="papelera" tamano={20} />
        </Boton>
      </>
    ) : (
      <>
        <Boton onClick={() => setCuadro("cambiar")}>
          <Icono nombre="cambiar" tamano={18} />
          Cambiar de grupo
        </Boton>
        {inscripcion.estatus === "activa" ? (
          <Boton onClick={() => setCuadro("congelar")}>
            <Icono nombre="pausa" tamano={18} />
            Congelar
          </Boton>
        ) : (
          <Boton onClick={() => setCuadro("reactivar")}>
            <Icono nombre="reanudar" tamano={18} />
            Reactivar
          </Boton>
        )}
        <Boton variante="peligro" onClick={() => setCuadro("baja")}>
          Dar de baja
        </Boton>
      </>
    );
  return (
    <div className={variante === "iconos" ? "inscripcion-acciones" : "inscripcion-acciones expediente-acciones"} data-prueba={`acciones-${inscripcion.id}`}>
      {botones}
      <Dialogo abierto={cuadro !== null} titulo={cuadro ? titulos[cuadro] : ""} alCerrar={cerrar}>
        {cuadro === "cambiar" ? <CambiarDeGrupo inscripcion={inscripcion} alumno={nombre} alTerminar={terminar} alCerrar={cerrar} /> : null}
        {cuadro === "baja" ? <DarDeBaja inscripcion={inscripcion} alumno={nombre} alTerminar={terminar} alCerrar={cerrar} /> : null}
        {cuadro === "congelar" || cuadro === "reactivar" ? <Confirmar inscripcion={inscripcion} alumno={nombre} que={cuadro} alTerminar={terminar} alCerrar={cerrar} /> : null}
      </Dialogo>
    </div>
  );
}
