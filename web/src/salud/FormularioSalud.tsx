// «Salud y seguridad» del registro de la clase muestra (maestro y administrador). Los datos de salud de un menor son SENSIBLES (decisión 12):
//   - viven solo en la MEMORIA de esta página: nada en `localStorage`, `sessionStorage`, la URL ni la consola (`check:sensibles` lo vigila);
//   - no se muestran los valores ya guardados: hay que pedirlos («Ver lo registrado», con un motivo; cada lectura queda registrada) y se pueden ocultar;
//   - al guardar se mandan SOLO los campos que se tocaron, y al terminar se borran de la pantalla.

import { useState } from "react";
import { api } from "../api/cliente.ts";
import type { Registro } from "../pantallas/maestro/tipos.ts";
import { Aviso, Boton, ErrorDeAccion, Insignia } from "../ui/basicos.tsx";
import { CampoArea, CampoTexto, GrupoDeOpciones } from "../ui/campos.tsx";
import { useAccion } from "../ui/hooks.ts";

interface Valores {
  alergias: string;
  condiciones_medicas: string;
  medicamentos: string;
  contacto_nombre: string;
  contacto_telefono: string;
  contacto_parentesco: string;
  autorizacion: "" | "si" | "no";
}

const VACIOS: Valores = { alergias: "", condiciones_medicas: "", medicamentos: "", contacto_nombre: "", contacto_telefono: "", contacto_parentesco: "", autorizacion: "" };
type Llave = keyof Valores;

interface FichaLeida {
  existe: boolean;
  campos: { alergias?: string | null; condiciones_medicas?: string | null; medicamentos?: string | null; contacto_emergencia?: { nombre?: string; telefono?: string; parentesco?: string } | null; autorizacion_atencion_medica?: boolean | null };
}

const digitos = (t: string): string => t.replace(/\D/g, "");
const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function FormularioSalud({ registro, bloqueado, alGuardar }: { registro: Registro; bloqueado: boolean; alGuardar: (r: Registro) => void }) {
  const [valores, setValores] = useState<Valores>(VACIOS);
  const [tocados, setTocados] = useState<ReadonlySet<Llave>>(new Set());
  const [motivo, setMotivo] = useState("Revisión del maestro antes de la clase");
  const [visto, setVisto] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [errorLocal, setErrorLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const leer = useAccion();

  const poner = (k: Llave, v: string) => {
    setValores((a) => ({ ...a, [k]: v }));
    setTocados((t) => new Set(t).add(k));
    setGuardado(false);
  };

  const estado = registro.salud;
  const yaHay = estado.contacto_registrado || estado.completa || estado.faltantes.length < 5;

  // El contacto de emergencia debe ser otra persona que los adultos del registro (el servidor lo vuelve a comprobar).
  const choca = (): string | null => {
    const tel = digitos(valores.contacto_telefono).slice(-10);
    const nom = sinAcentos(valores.contacto_nombre);
    for (const t of registro.tutores) {
      if ((tel.length === 10 && digitos(t.telefono).slice(-10) === tel) || (nom !== "" && sinAcentos([t.nombre, t.apellidos].filter(Boolean).join(" ")) === nom)) return `${t.nombre} ya está en los adultos del registro: el contacto de emergencia debe ser otra persona`;
    }
    return null;
  };

  async function guardarSeccion() {
    const e: Record<string, string> = {};
    const cuerpo: Record<string, unknown> = {};
    for (const k of ["alergias", "condiciones_medicas", "medicamentos"] as const) if (tocados.has(k)) cuerpo[k] = valores[k].trim() === "" ? null : valores[k].trim();
    if (tocados.has("contacto_nombre") || tocados.has("contacto_telefono") || tocados.has("contacto_parentesco")) {
      if (valores.contacto_nombre.trim() === "" && valores.contacto_telefono.trim() === "") cuerpo["contacto_emergencia"] = null;
      else {
        if (valores.contacto_nombre.trim() === "") e["contacto_nombre"] = "Escribe el nombre del contacto";
        if (digitos(valores.contacto_telefono).length < 10) e["contacto_telefono"] = "El teléfono debe tener 10 dígitos (con lada)";
        const c = choca();
        if (c) e["contacto_nombre"] = c;
        cuerpo["contacto_emergencia"] = { nombre: valores.contacto_nombre.trim(), telefono: valores.contacto_telefono.trim(), ...(valores.contacto_parentesco.trim() ? { parentesco: valores.contacto_parentesco.trim() } : {}) };
      }
    }
    if (tocados.has("autorizacion")) cuerpo["autorizacion_atencion_medica"] = valores.autorizacion === "" ? null : valores.autorizacion === "si";
    setErrorLocal(e);
    if (Object.keys(e).length > 0) return;
    if (Object.keys(cuerpo).length === 0) {
      setErrorLocal({ general: "No cambiaste nada de esta sección." });
      return;
    }
    const nuevo = await guardar.ejecutar(() => api.patch<Registro>(`/api/clases-muestra/${registro.clase_muestra_id}/registro`, { salud: cuerpo }));
    if (nuevo) {
      // Lo escrito sale de la pantalla en cuanto queda guardado.
      setValores(VACIOS);
      setTocados(new Set());
      setVisto(false);
      setGuardado(true);
      alGuardar(nuevo);
    }
  }

  async function verRegistrado() {
    const ficha = await leer.ejecutar(() => api.get<FichaLeida>(`/api/salud/prospecto/${registro.prospecto_id}`, { motivo: motivo.trim() }));
    if (!ficha) return;
    const c = ficha.campos;
    setValores({
      alergias: c.alergias ?? "",
      condiciones_medicas: c.condiciones_medicas ?? "",
      medicamentos: c.medicamentos ?? "",
      contacto_nombre: c.contacto_emergencia?.nombre ?? "",
      contacto_telefono: c.contacto_emergencia?.telefono ?? "",
      contacto_parentesco: c.contacto_emergencia?.parentesco ?? "",
      autorizacion: c.autorizacion_atencion_medica === undefined || c.autorizacion_atencion_medica === null ? "" : c.autorizacion_atencion_medica ? "si" : "no",
    });
    setTocados(new Set());
    setVisto(true);
  }

  const ocultar = () => {
    setValores(VACIOS);
    setTocados(new Set());
    setVisto(false);
  };

  const serv = guardar.error?.porCampo() ?? {};
  const error = (k: string, ...serverKeys: string[]): string | undefined => errorLocal[k] ?? serverKeys.map((s) => serv[s]).find(Boolean);

  return (
    <div className="pila" data-prueba="salud">
      <p className="muted">Datos sensibles del menor: solo los ven el maestro del grupo y el administrador, cada consulta queda registrada, y nunca van a mensajes ni a notas.</p>
      <div className="fila">
        <Insignia tono={estado.completa ? "exito" : "alerta"}>{estado.completa ? "Ficha completa" : "Ficha incompleta"}</Insignia>
        {estado.contacto_registrado ? <Insignia tono="info">Contacto registrado</Insignia> : null}
        {guardado ? <Insignia tono="exito">Guardado</Insignia> : null}
      </div>
      {yaHay && !visto ? (
        <Aviso>
          Ya hay datos de salud guardados y no se muestran. Escribe solo lo que quieras cambiar, o pídelos para revisarlos.
          <div className="pila">
            <CampoTexto etiqueta="Motivo de la consulta" value={motivo} onChange={(e) => setMotivo(e.target.value)} ayuda="Queda en el registro de accesos." />
            <div>
              <Boton disabled={bloqueado || motivo.trim().length < 3} cargando={leer.ocupado} onClick={() => void verRegistrado()}>
                Ver lo registrado
              </Boton>
            </div>
            <ErrorDeAccion error={leer.error} />
          </div>
        </Aviso>
      ) : null}
      {visto ? (
        <div>
          <Boton variante="fantasma" onClick={ocultar}>
            Ocultar lo registrado
          </Boton>
        </div>
      ) : null}
      <fieldset className="pila sin-borde" disabled={bloqueado}>
        <CampoArea etiqueta="Alergias" value={valores.alergias} onChange={(e) => poner("alergias", e.target.value)} ayuda="Si no tiene, escribe «Ninguna»." error={error("alergias", "salud.alergias")} />
        <CampoArea etiqueta="Condiciones médicas" value={valores.condiciones_medicas} onChange={(e) => poner("condiciones_medicas", e.target.value)} ayuda="Si no tiene, escribe «Ninguna»." error={error("condiciones_medicas", "salud.condiciones_medicas")} />
        <CampoArea etiqueta="Medicamentos" value={valores.medicamentos} onChange={(e) => poner("medicamentos", e.target.value)} ayuda="Si no toma, escribe «Ninguno»." error={error("medicamentos", "salud.medicamentos")} />
        <h3>Contacto de emergencia</h3>
        <CampoTexto etiqueta="Nombre del contacto" autoComplete="off" value={valores.contacto_nombre} onChange={(e) => poner("contacto_nombre", e.target.value)} error={error("contacto_nombre", "salud.contacto_emergencia", "salud.contacto_emergencia.nombre", "tutores")} />
        <CampoTexto etiqueta="Teléfono del contacto" type="tel" inputMode="tel" autoComplete="off" value={valores.contacto_telefono} onChange={(e) => poner("contacto_telefono", e.target.value)} error={error("contacto_telefono", "salud.contacto_emergencia.telefono")} />
        <CampoTexto etiqueta="Parentesco o relación (opcional)" autoComplete="off" value={valores.contacto_parentesco} onChange={(e) => poner("contacto_parentesco", e.target.value)} />
        <GrupoDeOpciones
          etiqueta="¿Autorizan atención médica de urgencia?"
          valor={valores.autorizacion}
          opciones={[
            { valor: "si", texto: "Sí" },
            { valor: "no", texto: "No" },
          ]}
          alCambiar={(v) => poner("autorizacion", v)}
        />
      </fieldset>
      {errorLocal["general"] ? <Aviso tono="alerta">{errorLocal["general"]}</Aviso> : null}
      <ErrorDeAccion error={guardar.error} />
      <div>
        <Boton variante="primario" disabled={bloqueado} cargando={guardar.ocupado} onClick={() => void guardarSeccion()}>
          Guardar salud y seguridad
        </Boton>
      </div>
    </div>
  );
}
