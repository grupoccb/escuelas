// Canales de WhatsApp (el número al que escribe cada disciplina) y su bandeja de Chatwoot. No hay credenciales aquí: el token del proveedor vive en el entorno del servidor.

import { useState } from "react";
import { api } from "../../api/cliente.ts";
import { useAvisos } from "../../ui/avisos.tsx";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Insignia, Pagina, Vacio } from "../../ui/basicos.tsx";
import { CampoCasilla, CampoSelect, CampoTexto } from "../../ui/campos.tsx";
import { Dialogo } from "../../ui/Dialogo.tsx";
import { Icono } from "../../ui/Icono.tsx";
import { useAccion, useCarga, useTitulo } from "../../ui/hooks.ts";
import { enteroDe } from "./ayudas.ts";
import { AvisoDeBaja, BotonDeIcono, ConfirmarAccion, Regreso, useEdicion } from "./comunes.tsx";
import type { CanalAdmin, SucursalAdmin, Vertical } from "./tipos.ts";

/** Cómo califica Meta al número (lo dice el proveedor; aquí solo se lee). */
const CALIDAD: Record<string, string> = { alta: "alta", media: "media", baja: "baja", desconocida: "todavía sin medir" };

function FormularioCanal({ canal, verticales, sucursales, alGuardar, alCerrar }: { canal: CanalAdmin | null; verticales: Vertical[]; sucursales: SucursalAdmin[]; alGuardar: (nombre: string) => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(canal?.nombre_publico ?? "");
  const [verticalId, setVerticalId] = useState(canal?.vertical_id ?? "");
  const [sucursalId, setSucursalId] = useState(canal?.sucursal_id ?? "");
  const [numero, setNumero] = useState(canal?.numero_whatsapp ?? "");
  const [servicio, setServicio] = useState(canal?.messaging_service_sid ?? "");
  const [remitente, setRemitente] = useState(canal?.sender_sid ?? "");
  const [waba, setWaba] = useState(canal?.waba_id ?? "");
  const [activo, setActivo] = useState(canal?.activo ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  const nulo = (t: string) => (t.trim() === "" ? null : t.trim());
  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        if (nombre.trim() === "") e["nombre_publico"] = "Escribe el nombre";
        if (canal === null && verticalId === "") e["vertical_id"] = "Elige la disciplina";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        const comun = { nombre_publico: nombre.trim(), sucursal_id: sucursalId === "" ? null : sucursalId, numero_whatsapp: nulo(numero), messaging_service_sid: nulo(servicio), sender_sid: nulo(remitente), waba_id: nulo(waba), activo };
        void guardar.ejecutar(async () => {
          if (canal) await api.patch(`/api/canales-whatsapp/${canal.id}`, comun);
          else await api.post("/api/canales-whatsapp", { vertical_id: verticalId, ...comun });
          alGuardar(comun.nombre_publico);
        });
      }}
    >
      <CampoTexto etiqueta="Nombre del canal" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre_publico")} />
      {canal === null ? <CampoSelect etiqueta="Disciplina" requerido value={verticalId} vacio="Elige una disciplina" opciones={verticales.map((v) => ({ valor: v.id, texto: v.nombre }))} onChange={(e) => setVerticalId(e.target.value)} error={err("vertical_id")} /> : null}
      <CampoSelect etiqueta="Sucursal" value={sucursalId} vacio="Todas las sucursales de la disciplina" opciones={sucursales.map((s) => ({ valor: s.id, texto: s.nombre }))} onChange={(e) => setSucursalId(e.target.value)} error={err("sucursal_id")} />
      <CampoTexto etiqueta="Número de WhatsApp" type="tel" value={numero} onChange={(e) => setNumero(e.target.value)} error={err("numero_whatsapp")} ayuda="Con lada y código de país. Se guarda normalizado; no puede repetirse en otro canal." />
      <CampoTexto etiqueta="Servicio de mensajería (Twilio)" value={servicio} onChange={(e) => setServicio(e.target.value)} error={err("messaging_service_sid")} />
      <CampoTexto etiqueta="Remitente (Twilio)" value={remitente} onChange={(e) => setRemitente(e.target.value)} error={err("sender_sid")} />
      <CampoTexto etiqueta="Cuenta de WhatsApp Business" value={waba} onChange={(e) => setWaba(e.target.value)} error={err("waba_id")} />
      <CampoCasilla etiqueta="Activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
      <ErrorDeAccion error={guardar.error} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

function FormularioBandeja({ canal, alGuardar, alCerrar }: { canal: CanalAdmin; alGuardar: (nombre: string) => void; alCerrar: () => void }) {
  const b = canal.bandeja;
  const [nombre, setNombre] = useState(b?.nombre ?? "");
  const [cuenta, setCuenta] = useState(b?.chatwoot_account_id ? String(b.chatwoot_account_id) : "");
  const [bandeja, setBandeja] = useState(b?.chatwoot_inbox_id ? String(b.chatwoot_inbox_id) : "");
  const [local, setLocal] = useState<Record<string, string>>({});
  const guardar = useAccion();
  const servidor = guardar.error?.porCampo() ?? {};
  const err = (k: string) => local[k] ?? servidor[k];
  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const e: Record<string, string> = {};
        const c = cuenta.trim() === "" ? null : enteroDe(cuenta, 1, 2_000_000_000);
        const i = bandeja.trim() === "" ? null : enteroDe(bandeja, 1, 2_000_000_000);
        if (nombre.trim() === "") e["nombre"] = "Escribe el nombre";
        if (cuenta.trim() !== "" && c === null) e["chatwoot_account_id"] = "Escribe el número de la cuenta";
        if (bandeja.trim() !== "" && i === null) e["chatwoot_inbox_id"] = "Escribe el número de la bandeja";
        if (i !== null && c === null) e["chatwoot_account_id"] = "Si das la bandeja, da también la cuenta";
        setLocal(e);
        if (Object.keys(e).length > 0) return;
        void guardar.ejecutar(async () => {
          if (b) await api.patch(`/api/bandejas-chatwoot/${b.id}`, { nombre: nombre.trim(), chatwoot_account_id: c, chatwoot_inbox_id: i });
          else await api.post("/api/bandejas-chatwoot", { canal_whatsapp_id: canal.id, nombre: nombre.trim(), chatwoot_account_id: c, chatwoot_inbox_id: i });
          alGuardar(nombre.trim());
        });
      }}
    >
      <CampoTexto etiqueta="Nombre de la bandeja" requerido value={nombre} onChange={(e) => setNombre(e.target.value)} error={err("nombre")} />
      <CampoTexto etiqueta="Cuenta de Chatwoot (número)" inputMode="numeric" value={cuenta} onChange={(e) => setCuenta(e.target.value)} error={err("chatwoot_account_id")} />
      <CampoTexto etiqueta="Bandeja de Chatwoot (número)" inputMode="numeric" value={bandeja} onChange={(e) => setBandeja(e.target.value)} error={err("chatwoot_inbox_id")} ayuda="Con ella el sistema sabe de qué canal es cada mensaje." />
      <ErrorDeAccion error={guardar.error} />
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" cargando={guardar.ocupado}>
          Guardar
        </Boton>
        <Boton onClick={alCerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function Canales() {
  useTitulo("Canales de WhatsApp");
  const lista = useCarga((senal) => api.get<{ datos: CanalAdmin[] }>("/api/canales-whatsapp", { limite: 100 }, senal), []);
  const verticales = useCarga((senal) => api.get<{ datos: Vertical[] }>("/api/verticales", undefined, senal), []);
  const sucursales = useCarga((senal) => api.get<{ datos: SucursalAdmin[] }>("/api/sucursales", undefined, senal), []);
  const { avisar } = useAvisos();
  const edCanal = useEdicion<CanalAdmin>();
  const [conBandeja, setConBandeja] = useState<CanalAdmin | null>(null);
  const [bajaCanal, setBajaCanal] = useState<CanalAdmin | null>(null);
  const [bajaBandeja, setBajaBandeja] = useState<CanalAdmin | null>(null);
  const nombreV = (id: string) => verticales.datos?.datos.find((v) => v.id === id)?.nombre ?? "—";
  const nombreS = (id: string | null) => (id ? (sucursales.datos?.datos.find((s) => s.id === id)?.nombre ?? "—") : "Todas");
  return (
    <Pagina titulo="Canales de WhatsApp" subtitulo="A qué número escribe cada disciplina y en qué bandeja la atiende el asesor." acciones={<><Regreso /><Boton variante="primario" onClick={edCanal.nuevo}>Nuevo canal</Boton></>}>
      <Aviso>Las claves de acceso de Twilio y de Chatwoot no se capturan en esta pantalla: las pone quien instala el sistema. Aquí solo dices qué número es de cada disciplina y en qué bandeja lo atiende el asesor.</Aviso>
      {lista.error ? <ErrorDeCarga error={lista.error} alReintentar={lista.recargar} /> : null}
      {lista.cargando && !lista.datos ? <Cargando /> : null}
      {lista.datos && lista.datos.datos.length === 0 ? <div className="vacio-admin"><Vacio titulo="Todavía no hay canales">Da de alta el primero con «Nuevo canal».</Vacio></div> : null}
      <ul className="lista-tarjetas" data-prueba="lista-de-canales">
        {(lista.datos?.datos ?? []).map((c) => (
          <li key={c.id} className="item-admin" data-prueba={`canal-${c.id}`}>
            <div className="item-admin-principal">
              <strong className="item-admin-nombre">{c.nombre_publico}</strong>
              <p className="item-admin-meta">
                {nombreV(c.vertical_id)} · sucursal: {nombreS(c.sucursal_id)} · <span className="numero">{c.numero_whatsapp ?? "sin número"}</span>
              </p>
            </div>
            <div className="item-admin-etiquetas">
              <Insignia tono={c.activo ? "exito" : "neutro"}>{c.activo ? "Activo" : "Inactivo"}</Insignia>
              <Insignia>Calidad del número: {CALIDAD[c.calidad_meta] ?? c.calidad_meta}</Insignia>
            </div>
            <div className="item-admin-acciones">
              <BotonDeIcono icono="lapiz" nombre="Editar canal" onClick={() => edCanal.editar(c)} />
              <BotonDeIcono icono="chatwoot" nombre={c.bandeja ? "Editar bandeja" : "Agregar bandeja"} onClick={() => setConBandeja(c)} />
              {c.bandeja ? <BotonDeIcono icono="cerrar" nombre="Quitar bandeja" peligro onClick={() => setBajaBandeja(c)} /> : null}
              <BotonDeIcono icono="papelera" nombre="Dar de baja" peligro onClick={() => setBajaCanal(c)} />
            </div>
            <p className="item-admin-detalle item-admin-bandeja">
              <Icono nombre="chatwoot" tamano={16} />
              <span>{c.bandeja ? `Bandeja: ${c.bandeja.nombre}${c.bandeja.chatwoot_inbox_id ? ` (cuenta ${c.bandeja.chatwoot_account_id ?? "?"}, bandeja ${c.bandeja.chatwoot_inbox_id})` : ""}` : "Sin bandeja de Chatwoot"}</span>
            </p>
          </li>
        ))}
      </ul>
      <Dialogo abierto={edCanal.actual !== null} titulo={edCanal.actual === "nuevo" ? "Nuevo canal" : "Editar canal"} alCerrar={edCanal.cerrar}>
        {edCanal.actual !== null ? <FormularioCanal canal={edCanal.actual === "nuevo" ? null : edCanal.actual} verticales={verticales.datos?.datos ?? []} sucursales={sucursales.datos?.datos ?? []} alGuardar={(nombre) => { edCanal.cerrar(); lista.recargar(); avisar(`El canal «${nombre}» se guardó.`); }} alCerrar={edCanal.cerrar} /> : null}
      </Dialogo>
      <Dialogo abierto={conBandeja !== null} titulo="Bandeja de Chatwoot" alCerrar={() => setConBandeja(null)}>
        {conBandeja ? <FormularioBandeja canal={conBandeja} alGuardar={(nombre) => { setConBandeja(null); lista.recargar(); avisar(`La bandeja «${nombre}» se guardó.`); }} alCerrar={() => setConBandeja(null)} /> : null}
      </Dialogo>
      <ConfirmarAccion abierto={bajaCanal !== null} titulo="Dar de baja el canal" textoDeConfirmar="Dar de baja" alCerrar={() => setBajaCanal(null)} alConfirmar={async () => { await api.delete(`/api/canales-whatsapp/${bajaCanal!.id}`); lista.recargar(); avisar(`El canal «${bajaCanal!.nombre_publico}» se dio de baja.`); }}>
        <AvisoDeBaja cosa="canal" genero="m" nombre={bajaCanal?.nombre_publico} consecuencia="Si tiene bandeja, quítala primero. Sin canal, los mensajes de ese número dejan de llegar al sistema." />
      </ConfirmarAccion>
      <ConfirmarAccion abierto={bajaBandeja !== null} titulo="Quitar la bandeja" textoDeConfirmar="Quitar" alCerrar={() => setBajaBandeja(null)} alConfirmar={async () => { await api.delete(`/api/bandejas-chatwoot/${bajaBandeja!.bandeja!.id}`); lista.recargar(); avisar("La bandeja se quitó del canal."); }}>
        <Aviso tono="alerta">Sin bandeja, los mensajes de este número ya no llegan a los asesores. Si la bandeja ya tiene conversaciones, el sistema no la dejará quitar.</Aviso>
      </ConfirmarAccion>
    </Pagina>
  );
}
