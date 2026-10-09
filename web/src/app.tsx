import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { INICIO_POR_ROL } from "./navegacion.ts";
import { Acceso } from "./pantallas/acceso/Acceso.tsx";
import { NoEncontrada, Pendiente, SinAcceso } from "./pantallas/acceso/Errores.tsx";
import { Mas } from "./pantallas/acceso/Mas.tsx";
import { SesionProvider, useSesion } from "./sesion/SesionContext.tsx";
import { Cargando } from "./ui/basicos.tsx";
import { Shell } from "./ui/Shell.tsx";

// Cada pantalla se carga cuando se visita (el celular no baja lo que no usa). J2 a J5 sustituyen estos marcadores por sus pantallas.
const pendiente = (bloque: string) => lazy(() => Promise.resolve({ default: () => <Pendiente bloque={bloque} /> }));
const Hoy = pendiente("J2");
const RegistroClase = pendiente("J2");
const PaseDeLista = pendiente("J2");
const Embudo = pendiente("J3");
const Tareas = pendiente("J3");
const FichaLead = pendiente("J3");
const Conversion = pendiente("J4");
const RegistrarPago = pendiente("J5");
const EstadoDeCuenta = pendiente("J5");
const Uniformes = pendiente("J5");
const Ventas = pendiente("J5");

/** Una ruta que solo existe con el permiso. Sin él se muestra «Sin acceso» y la pantalla ni se monta: no pide nada a la API. */
function RequierePermiso({ permiso, children }: { permiso: string; children: ReactNode }) {
  const { puede } = useSesion();
  return puede(permiso) ? <>{children}</> : <SinAcceso />;
}

function Rutas() {
  const { yo } = useSesion();
  if (!yo) return null;
  const inicio = INICIO_POR_ROL[yo.usuario.rol];
  return (
    <Suspense fallback={<Cargando />}>
      <Routes>
        <Route path="/" element={<Navigate to={inicio} replace />} />
        <Route path="/hoy" element={<RequierePermiso permiso="clases_muestra:leer"><Hoy /></RequierePermiso>} />
        <Route path="/clases/:id/registro" element={<RequierePermiso permiso="registro_muestra:leer"><RegistroClase /></RequierePermiso>} />
        <Route path="/pase" element={<RequierePermiso permiso="asistencia:registrar"><PaseDeLista /></RequierePermiso>} />
        <Route path="/embudo" element={<RequierePermiso permiso="leads:escribir"><Embudo /></RequierePermiso>} />
        <Route path="/tareas" element={<RequierePermiso permiso="tareas:leer"><Tareas /></RequierePermiso>} />
        <Route path="/leads/:id" element={<RequierePermiso permiso="leads:leer"><FichaLead /></RequierePermiso>} />
        <Route path="/leads/:id/convertir" element={<RequierePermiso permiso="leads:escribir"><Conversion /></RequierePermiso>} />
        <Route path="/pagos" element={<RequierePermiso permiso="pagos:registrar"><RegistrarPago /></RequierePermiso>} />
        <Route path="/cuenta" element={<RequierePermiso permiso="estado_cuenta:leer"><EstadoDeCuenta /></RequierePermiso>} />
        <Route path="/cuenta/:tutorId" element={<RequierePermiso permiso="estado_cuenta:leer"><EstadoDeCuenta /></RequierePermiso>} />
        <Route path="/uniformes" element={<RequierePermiso permiso="beneficios:entregar"><Uniformes /></RequierePermiso>} />
        <Route path="/ventas" element={<RequierePermiso permiso="ventas:registrar"><Ventas /></RequierePermiso>} />
        <Route path="/mas" element={<Mas />} />
        <Route path="*" element={<NoEncontrada />} />
      </Routes>
    </Suspense>
  );
}

function Raiz() {
  const { estado } = useSesion();
  if (estado.fase === "cargando") return <Cargando texto="Abriendo la aplicación…" />;
  if (estado.fase === "anonima") return <Acceso motivo={estado.motivo} />;
  return (
    <Shell>
      <Rutas />
    </Shell>
  );
}

export function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Raiz />
      </BrowserRouter>
    </SesionProvider>
  );
}
