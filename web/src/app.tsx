import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ModuloId } from "./api/tipos.ts";
import { inicioDe } from "./navegacion.ts";
import { Acceso } from "./pantallas/acceso/Acceso.tsx";
import { NoDisponible, NoEncontrada, SinAcceso } from "./pantallas/acceso/Errores.tsx";
import { Mas } from "./pantallas/acceso/Mas.tsx";
import { SesionProvider, useSesion } from "./sesion/SesionContext.tsx";
import { Cargando } from "./ui/basicos.tsx";
import { Shell } from "./ui/Shell.tsx";

// Cada pantalla se carga cuando se visita (el celular no baja lo que no usa). Las pantallas de J6 a J10 se agregan aquí (ver `navegacion.ts`).
const Hoy = lazy(() => import("./pantallas/maestro/Hoy.tsx"));
const RegistroClase = lazy(() => import("./pantallas/maestro/RegistroClase.tsx"));
const PaseDeLista = lazy(() => import("./pantallas/maestro/PaseDeLista.tsx"));
const Embudo = lazy(() => import("./pantallas/asesor/Embudo.tsx"));
const Tareas = lazy(() => import("./pantallas/asesor/Tareas.tsx"));
const FichaLead = lazy(() => import("./pantallas/asesor/FichaLead.tsx"));
const Conversion = lazy(() => import("./pantallas/conversion/Conversion.tsx"));
const RegistrarPago = lazy(() => import("./pantallas/recepcion/RegistrarPago.tsx"));
const EstadoDeCuenta = lazy(() => import("./pantallas/recepcion/EstadoDeCuenta.tsx"));
const Uniformes = lazy(() => import("./pantallas/recepcion/Uniformes.tsx"));
const Ventas = lazy(() => import("./pantallas/recepcion/Ventas.tsx"));
const AlumnosLista = lazy(() => import("./pantallas/familia/AlumnosLista.tsx"));
const Expediente = lazy(() => import("./pantallas/familia/Expediente.tsx"));
const SaludDelAlumno = lazy(() => import("./pantallas/familia/SaludDelAlumno.tsx"));
const Familias = lazy(() => import("./pantallas/familia/Familias.tsx"));
const FichaFamilia = lazy(() => import("./pantallas/familia/FichaFamilia.tsx"));
const Administracion = lazy(() => import("./pantallas/admin/Administracion.tsx"));
const AdminVerticales = lazy(() => import("./pantallas/admin/Verticales.tsx"));
const AdminSucursales = lazy(() => import("./pantallas/admin/Sucursales.tsx"));
const AdminProgramas = lazy(() => import("./pantallas/admin/Programas.tsx"));
const AdminGrupos = lazy(() => import("./pantallas/admin/Grupos.tsx"));
const AdminInstructores = lazy(() => import("./pantallas/admin/InstructoresYSalones.tsx"));
const AdminPrecios = lazy(() => import("./pantallas/admin/Precios.tsx"));
const AdminPromociones = lazy(() => import("./pantallas/admin/Promociones.tsx"));
const AdminCanales = lazy(() => import("./pantallas/admin/Canales.tsx"));
const AdminConfiguracion = lazy(() => import("./pantallas/admin/Configuracion.tsx"));
const AdminPlantillas = lazy(() => import("./pantallas/admin/Plantillas.tsx"));
const AdminAutomatizaciones = lazy(() => import("./pantallas/admin/Automatizaciones.tsx"));
const AdminUsuarios = lazy(() => import("./pantallas/admin/Usuarios.tsx"));
const Tableros = lazy(() => import("./pantallas/tableros/Tableros.tsx"));
const AdminBandeja = lazy(() => import("./pantallas/admin/Bandeja.tsx"));
const AdminModulos = lazy(() => import("./pantallas/admin/Modulos.tsx"));

/**
 * Una ruta que solo existe con el permiso y con el módulo al que pertenece encendido (V1). Sin el módulo se muestra «No disponible»; sin el permiso, «Sin acceso». En los dos casos la
 * pantalla ni se monta: no pide nada a la API. Todas las rutas declaran su módulo (`navegacion.test.ts` lo comprueba).
 */
function RequierePermiso({ permiso, modulo, children }: { permiso: string; modulo: ModuloId; children: ReactNode }) {
  const { puede, moduloEncendido } = useSesion();
  if (!moduloEncendido(modulo)) return <NoDisponible />;
  return puede(permiso) ? <>{children}</> : <SinAcceso />;
}

function Rutas() {
  const { yo } = useSesion();
  if (!yo) return null;
  const inicio = inicioDe(yo.usuario.rol, yo.permisos, yo.modulos);
  return (
    <Suspense fallback={<Cargando />}>
      <Routes>
        <Route path="/" element={<Navigate to={inicio} replace />} />
        <Route path="/hoy" element={<RequierePermiso permiso="clases_muestra:leer" modulo="clase_muestra"><Hoy /></RequierePermiso>} />
        <Route path="/clases/:id/registro" element={<RequierePermiso permiso="registro_muestra:leer" modulo="clase_muestra"><RegistroClase /></RequierePermiso>} />
        <Route path="/pase" element={<RequierePermiso permiso="asistencia:registrar" modulo="operacion"><PaseDeLista /></RequierePermiso>} />
        <Route path="/embudo" element={<RequierePermiso permiso="leads:escribir" modulo="captacion"><Embudo /></RequierePermiso>} />
        <Route path="/tareas" element={<RequierePermiso permiso="tareas:leer" modulo="captacion"><Tareas /></RequierePermiso>} />
        <Route path="/leads/:id" element={<RequierePermiso permiso="leads:leer" modulo="captacion"><FichaLead /></RequierePermiso>} />
        <Route path="/leads/:id/convertir" element={<RequierePermiso permiso="leads:escribir" modulo="inscripcion"><Conversion /></RequierePermiso>} />
        <Route path="/pagos" element={<RequierePermiso permiso="pagos:registrar" modulo="finanzas"><RegistrarPago /></RequierePermiso>} />
        <Route path="/cuenta" element={<RequierePermiso permiso="estado_cuenta:leer" modulo="finanzas"><EstadoDeCuenta /></RequierePermiso>} />
        <Route path="/cuenta/:tutorId" element={<RequierePermiso permiso="estado_cuenta:leer" modulo="finanzas"><EstadoDeCuenta /></RequierePermiso>} />
        <Route path="/uniformes" element={<RequierePermiso permiso="beneficios:entregar" modulo="finanzas"><Uniformes /></RequierePermiso>} />
        <Route path="/ventas" element={<RequierePermiso permiso="ventas:registrar" modulo="finanzas"><Ventas /></RequierePermiso>} />
        <Route path="/alumnos" element={<RequierePermiso permiso="alumnos:leer" modulo="inscripcion"><AlumnosLista /></RequierePermiso>} />
        <Route path="/alumnos/:id" element={<RequierePermiso permiso="alumnos:leer" modulo="inscripcion"><Expediente /></RequierePermiso>} />
        <Route path="/alumnos/:id/salud" element={<RequierePermiso permiso="salud:leer" modulo="inscripcion"><SaludDelAlumno /></RequierePermiso>} />
        <Route path="/familias" element={<RequierePermiso permiso="tutores:leer" modulo="inscripcion"><Familias /></RequierePermiso>} />
        <Route path="/familias/un-solo-hijo" element={<RequierePermiso permiso="tutores:leer" modulo="inscripcion"><Familias crucada /></RequierePermiso>} />
        <Route path="/familias/:tutorId" element={<RequierePermiso permiso="tutores:leer" modulo="inscripcion"><FichaFamilia /></RequierePermiso>} />
        <Route path="/admin" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><Administracion /></RequierePermiso>} />
        <Route path="/admin/verticales" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminVerticales /></RequierePermiso>} />
        <Route path="/admin/sucursales" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminSucursales /></RequierePermiso>} />
        <Route path="/admin/programas" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminProgramas /></RequierePermiso>} />
        <Route path="/admin/grupos" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminGrupos /></RequierePermiso>} />
        <Route path="/admin/instructores" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminInstructores /></RequierePermiso>} />
        <Route path="/admin/precios" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminPrecios /></RequierePermiso>} />
        <Route path="/admin/promociones" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminPromociones /></RequierePermiso>} />
        <Route path="/admin/canales" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminCanales /></RequierePermiso>} />
        <Route path="/admin/configuracion" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminConfiguracion /></RequierePermiso>} />
        <Route path="/admin/plantillas" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminPlantillas /></RequierePermiso>} />
        <Route path="/admin/automatizaciones" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminAutomatizaciones /></RequierePermiso>} />
        <Route path="/admin/usuarios" element={<RequierePermiso permiso="usuarios:administrar" modulo="captacion"><AdminUsuarios /></RequierePermiso>} />
        <Route path="/admin/modulos" element={<RequierePermiso permiso="catalogo:escribir" modulo="captacion"><AdminModulos /></RequierePermiso>} />
        <Route path="/admin/bandeja" element={<RequierePermiso permiso="registro_cambios:leer" modulo="captacion"><AdminBandeja /></RequierePermiso>} />
        <Route path="/tableros" element={<RequierePermiso permiso="reportes:clases_muestra" modulo="tableros"><Tableros /></RequierePermiso>} />
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
