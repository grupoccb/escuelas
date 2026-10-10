// Reglamento y autorización de imagen con evidencia (D6): qué documento rige hoy, quién lo aceptó (o rechazó, o revocó), cuándo y por qué canal.
// La evidencia (la huella del texto mostrado, la fecha, quién capturó) la pone el servidor; aquí solo se elige la versión vigente que la familia vio.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia } from "../../ui/basicos.tsx";
import { CampoArea, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import type { DocumentoVigente, EstadoLegal, TutorDeRegistro } from "./tipos.ts";

interface Aceptaciones {
  vertical_id: string | null;
  estado: EstadoLegal[];
}

const NOMBRE = { reglamento: "Reglamento", uso_imagen: "Autorización de uso de imagen", aviso_privacidad: "Aviso de privacidad" } as const;
const CANALES = [
  { valor: "presencial", texto: "En persona" },
  { valor: "telefono", texto: "Por teléfono" },
  { valor: "whatsapp", texto: "Por WhatsApp" },
  { valor: "web", texto: "En la web" },
];
const OTRA = "otra";

function TarjetaDeDocumento({ doc, estado, claseId, tutores, bloqueado, alCambiar }: { doc: DocumentoVigente; estado: EstadoLegal | undefined; claseId: string; tutores: readonly TutorDeRegistro[]; bloqueado: boolean; alCambiar: () => void }) {
  const [quien, setQuien] = useState(tutores[0]?.id ?? OTRA);
  const [nombre, setNombre] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [canal, setCanal] = useState("presencial");
  const [nota, setNota] = useState("");
  const accion = useAccion();
  const eligeOtra = quien === OTRA || !tutores.some((t) => t.id === quien);

  const responder = (resultado: "aceptada" | "rechazada" | "revocada") =>
    void accion.ejecutar(async () => {
      await api.post(`/api/clases-muestra/${claseId}/registro/aceptaciones`, {
        documento_id: doc.id,
        version: doc.version,
        resultado,
        aceptante: eligeOtra ? { nombre: nombre.trim(), ...(parentesco.trim() ? { parentesco: parentesco.trim() } : {}) } : { registro_tutor_id: quien },
        canal,
        ...(nota.trim() ? { evidencia: { nota: nota.trim() } } : {}),
      });
      setNota("");
      alCambiar();
    });

  const aceptada = estado?.estado === "aceptada";
  return (
    <div className="pila" data-prueba={`documento-${doc.tipo}`}>
      <div className="fila fila-entre">
        <h2 className="titulo-menor">
          {NOMBRE[doc.tipo]} (v{doc.version})
        </h2>
        <Insignia tono={estado?.al_corriente && aceptada ? "exito" : estado?.estado === "rechazada" || estado?.estado === "revocada" ? "peligro" : "alerta"}>
          {aceptada ? (estado?.al_corriente ? "Aceptado" : "Aceptó otra versión") : estado?.estado === "rechazada" ? "Rechazado" : estado?.estado === "revocada" ? "Revocado" : "Sin respuesta"}
        </Insignia>
      </div>
      <p className="muted" data-prueba="frase-legal">
        {estado?.texto ?? ""}
      </p>
      <details>
        <summary>Leer el texto que se le muestra a la familia</summary>
        <p className="texto-legal">
          {doc.texto ?? "(sin texto)"}
        </p>
      </details>
      <fieldset className="pila sin-borde" disabled={bloqueado}>
        <CampoSelect
          etiqueta="¿Quién responde?"
          value={eligeOtra ? OTRA : quien}
          onChange={(e) => setQuien(e.target.value)}
          opciones={[...tutores.map((t) => ({ valor: t.id, texto: `${t.nombre} (${t.parentesco})` })), { valor: OTRA, texto: "Otra persona" }]}
        />
        {eligeOtra ? (
          <>
            <CampoTexto etiqueta="Nombre de quien responde" value={nombre} onChange={(e) => setNombre(e.target.value)} requerido />
            <CampoTexto etiqueta="Parentesco" value={parentesco} onChange={(e) => setParentesco(e.target.value)} />
          </>
        ) : null}
        <CampoSelect etiqueta="¿Cómo respondió?" value={canal} onChange={(e) => setCanal(e.target.value)} opciones={CANALES} />
        <CampoArea etiqueta="Nota de evidencia (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} ayuda="Por ejemplo: «firmó la hoja impresa»." maxLength={500} />
        <div className="fila">
          <Boton variante="primario" cargando={accion.ocupado} disabled={eligeOtra && nombre.trim() === ""} onClick={() => responder("aceptada")}>
            Aceptan
          </Boton>
          <Boton cargando={accion.ocupado} disabled={eligeOtra && nombre.trim() === ""} onClick={() => responder("rechazada")}>
            No aceptan
          </Boton>
          {doc.tipo === "uso_imagen" && aceptada ? (
            <Boton variante="peligro" cargando={accion.ocupado} disabled={eligeOtra && nombre.trim() === ""} onClick={() => responder("revocada")}>
              Revocar autorización
            </Boton>
          ) : null}
        </div>
      </fieldset>
      <ErrorDeAccion error={accion.error} />
    </div>
  );
}

export function Aceptaciones({ claseId, tutores, bloqueado, alCambiar }: { claseId: string; tutores: readonly TutorDeRegistro[]; bloqueado: boolean; alCambiar: () => void }) {
  const estado = useCarga((senal) => api.get<Aceptaciones>(`/api/clases-muestra/${claseId}/registro/aceptaciones`, undefined, senal), [claseId]);
  const verticalId = estado.datos?.vertical_id ?? null;
  const vigentes = useCarga((senal) => api.get<{ datos: DocumentoVigente[] }>("/api/documentos-legales/vigentes", { vertical_id: verticalId ?? undefined }, senal), [verticalId], estado.datos !== null);

  if (estado.error) return <ErrorDeCarga error={estado.error} alReintentar={estado.recargar} />;
  if (vigentes.error) return <ErrorDeCarga error={vigentes.error} alReintentar={vigentes.recargar} />;
  if (!estado.datos || !vigentes.datos) return <Cargando />;
  const docs = vigentes.datos.datos.filter((d) => d.tipo === "reglamento" || d.tipo === "uso_imagen");
  if (docs.length === 0) return <Aviso tono="alerta">No hay reglamento ni autorización de imagen vigentes: pídele al administrador que los publique.</Aviso>;
  return (
    <div className="pila">
      {docs.map((d) => (
        <TarjetaDeDocumento
          key={d.id}
          doc={d}
          estado={estado.datos?.estado.find((e) => e.tipo === d.tipo)}
          claseId={claseId}
          tutores={tutores}
          bloqueado={bloqueado}
          alCambiar={() => {
            estado.recargar();
            alCambiar();
          }}
        />
      ))}
    </div>
  );
}
