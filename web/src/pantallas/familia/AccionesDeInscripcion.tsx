// Las acciones de F5 sobre una inscripción, cada una con su confirmación: cambiar de grupo (con el cupo REAL de cada grupo del mismo programa), congelar,
// reactivar y dar de baja con un motivo del catálogo. El servidor decide: si el último lugar se ocupó mientras se miraba la pantalla, responde 409 y se dice.

import { useState } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import type { Grupo } from "../../api/tipos.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga } from "../../ui/basicos.tsx";
import { CampoSelect } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import type { FilaDeOcupacion, InscripcionDeExpediente } from "./tipos.ts";

type Cuadro = "cambiar" | "congelar" | "reactivar" | "baja" | null;

function CambiarDeGrupo({ inscripcion, alTerminar, alCerrar }: { inscripcion: InscripcionDeExpediente; alTerminar: () => void; alCerrar: () => void }) {
  const grupos = useCarga((senal) => api.get<Pagina<Grupo>>("/api/grupos", { programa_id: inscripcion.programa.id, limite: 100 }, senal), [inscripcion.programa.id]);
  const ocupacion = useCarga((senal) => api.get<{ datos: FilaDeOcupacion[] }>("/api/reportes/ocupacion", undefined, senal), []);
  const [elegido, setElegido] = useState("");
  const cambio = useAccion();
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
        Ahora está en <strong>{inscripcion.grupo.nombre}</strong>. Solo se puede cambiar a otro grupo del mismo programa ({inscripcion.programa.nombre}); el precio y las promociones no cambian.
      </p>
      {opciones.length === 0 ? <Aviso>Este programa no tiene otro grupo activo.</Aviso> : null}
      <CampoSelect etiqueta="Grupo nuevo" value={elegido} vacio="Elige un grupo" opciones={opciones} onChange={(e) => setElegido(e.target.value)} />
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

function DarDeBaja({ inscripcion, alTerminar, alCerrar }: { inscripcion: InscripcionDeExpediente; alTerminar: () => void; alCerrar: () => void }) {
  const motivos = useCarga((senal) => api.get<{ datos: { id: string; nombre: string; activo: boolean }[] }>("/api/motivos-baja", { activo: true }, senal), []);
  const [motivo, setMotivo] = useState("");
  const baja = useAccion();
  if (motivos.error) return <ErrorDeCarga error={motivos.error} alReintentar={motivos.recargar} />;
  if (!motivos.datos) return <Cargando />;
  return (
    <div className="pila">
      <Aviso tono="alerta">
        <p>
          La baja libera el lugar en <strong>{inscripcion.grupo.nombre}</strong> y detiene los cobros futuros. Lo ya cobrado y el precio congelado se conservan.
        </p>
      </Aviso>
      <CampoSelect etiqueta="Motivo de la baja" requerido value={motivo} vacio="Elige un motivo" opciones={motivos.datos.datos.map((m) => ({ valor: m.id, texto: m.nombre }))} onChange={(e) => setMotivo(e.target.value)} />
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

function Confirmar({ inscripcion, que, alTerminar, alCerrar }: { inscripcion: InscripcionDeExpediente; que: "congelar" | "reactivar"; alTerminar: () => void; alCerrar: () => void }) {
  const accion = useAccion();
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

export function AccionesDeInscripcion({ inscripcion, alCambiar }: { inscripcion: InscripcionDeExpediente; alCambiar: () => void }) {
  const [cuadro, setCuadro] = useState<Cuadro>(null);
  if (inscripcion.estatus === "baja") return null;
  const cerrar = () => setCuadro(null);
  const terminar = () => {
    setCuadro(null);
    alCambiar();
  };
  const titulos = { cambiar: "Cambiar de grupo", congelar: "Congelar la inscripción", reactivar: "Reactivar la inscripción", baja: "Dar de baja" } as const;
  return (
    <div className="inscripcion-acciones" data-prueba={`acciones-${inscripcion.id}`}>
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
      <Dialogo abierto={cuadro !== null} titulo={cuadro ? titulos[cuadro] : ""} alCerrar={cerrar}>
        {cuadro === "cambiar" ? <CambiarDeGrupo inscripcion={inscripcion} alTerminar={terminar} alCerrar={cerrar} /> : null}
        {cuadro === "baja" ? <DarDeBaja inscripcion={inscripcion} alTerminar={terminar} alCerrar={cerrar} /> : null}
        {cuadro === "congelar" || cuadro === "reactivar" ? <Confirmar inscripcion={inscripcion} que={cuadro} alTerminar={terminar} alCerrar={cerrar} /> : null}
      </Dialogo>
    </div>
  );
}
