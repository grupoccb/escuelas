// El plan de la carga del catálogo (V6). PURO: recibe las tablas ya leídas (`lectura.ts`) y una foto de lo que ya existe en la organización, y devuelve
//   · los errores por fila y columna, en español claro, y los avisos que no bloquean;
//   · la lista ordenada de cosas por crear o actualizar (`ops`), con sus referencias ya resueltas;
//   · el resumen («3 salones nuevos, 1 actualizado, 5 sin cambios») y el detalle de cada cambio con palabras.
// No escribe nada ni toca la base: la simulación es esto y nada más; aplicar es esto más `datos.ts`, bajo un candado y dentro de una transacción.
//
// Reglas que no se rompen (CLAUDE.md y la bitácora de V6):
//   · Las referencias entre archivos son por NOMBRE (sin distinguir mayúsculas, acentos ni espacios de más). Un nombre que no existe, o que apunta a dos cosas, es un error claro.
//   · Solo crea y actualiza; NUNCA borra lo que falte en el archivo. Una celda vacía en algo que ya existe no borra su dato.
//   · Idempotente: lo que ya está igual es «sin cambios» y no genera ninguna operación.
//   · Los precios nuevos son una versión con vigencia (`planDeAlta`): jamás editan uno ya vigente con otro importe.
//   · Las verificaciones del catálogo son las de siempre (`traslapesDeEdad`, `detectarChoques`) sobre el catálogo QUE QUEDARÍA, para cuidar lo que este archivo toca.
//   · El dinero va en centavos exactos (`src/lib/dinero.ts`); los teléfonos, por `normalizarTelefono()`.

import { formatear } from "../../lib/dinero.ts";
import { NOMBRES_DE_DIA, detectarChoques, franjasSeTraslapan, horaTexto, type Franja, type OcupacionDeGrupo } from "../choques.ts";
import { PATRON_DE_SLUG, slugDe } from "../organizacion.ts";
import { planDeAlta } from "../precios.ts";
import { claveDeSalon, nombreDeSalon } from "../salones.ts";
import { traslapesDeEdad, type Catalogo, type ProgramaCatalogo } from "../verificacion.ts";
import { ESQUEMAS, TIPOS, tituloDe, type Tipo } from "./esquemas.ts";
import type { FilaLeida, Problema, TablaLeida } from "./lectura.ts";
import { claveDeNombre, leerColor, leerCorreo, leerDia, leerEntero, leerFecha, leerHora, leerImporte, leerLista, leerSiNo, leerTelefono, leerZonaHoraria, nombreLimpio, type Leido } from "./valores.ts";

// ── Lo que ya existe (foto de la organización) ───────────────────────────────────────────────────

export interface ExVertical { id: string; nombre: string; slug: string; color: string | null; activo: boolean }
export interface ExSucursal { id: string; nombre: string; direccion: string | null; zona: string; activo: boolean }
export interface ExOferta { sucursalId: string; verticalId: string }
export interface ExSalon { id: string; sucursalId: string; nombre: string; capacidad: number | null; activo: boolean }
export interface ExInstructor { id: string; nombre: string; telefono: string | null; correo: string | null; activo: boolean; sucursalIds: string[] }
export interface ExPrograma { id: string; verticalId: string; sucursalId: string; nombre: string; edadMin: number; edadMax: number; nivel: string | null; descripcion: string | null; permiteTraslape: boolean; corte: string | null; activo: boolean }
export interface ExFranja { dia: number; inicioMin: number; finMin: number }
export interface ExGrupo { id: string; programaId: string; nombre: string; salonId: string | null; instructorId: string | null; cupo: number; listaEspera: boolean; activo: boolean; ocupados: number; horarios: ExFranja[] }
export interface ExPrecio { id: string; programaId: string; inscripcion: bigint; mensualidad: bigint; desde: string; hasta: string | null }

export interface Existente {
  verticales: ExVertical[];
  sucursales: ExSucursal[];
  ofertas: ExOferta[];
  salones: ExSalon[];
  instructores: ExInstructor[];
  programas: ExPrograma[];
  grupos: ExGrupo[];
  precios: ExPrecio[];
}

export const EXISTENTE_VACIO: Existente = { verticales: [], sucursales: [], ofertas: [], salones: [], instructores: [], programas: [], grupos: [], precios: [] };

// ── Lo que sale: operaciones por aplicar ─────────────────────────────────────────────────────────

export type Accion = "crear" | "actualizar";

/** `ref` es el id de lo que ya existe, o `nuevo:…` para lo que se crea en esta carga (otras operaciones lo referencian por ese `ref`). */
export type Op =
  | { k: "disciplina"; accion: Accion; ref: string; datos: { nombre: string; slug: string; color: string | null }; antes: { color: string | null } | null }
  | { k: "sucursal"; accion: Accion; ref: string; datos: { nombre: string; direccion: string | null; zona: string }; antes: { direccion: string | null; zona: string } | null }
  | { k: "oferta"; accion: "crear"; sucursalRef: string; disciplinaRef: string }
  | { k: "salon"; accion: Accion; ref: string; sucursalRef: string; datos: { nombre: string; capacidad: number | null }; antes: { capacidad: number | null } | null }
  | { k: "instructor"; accion: Accion; ref: string; datos: { nombre: string; telefono: string | null; correo: string | null }; sucursalesNuevas: string[]; antes: { telefono: string | null; correo: string | null; sucursalIds: string[] } | null }
  | { k: "programa"; accion: Accion; ref: string; disciplinaRef: string; sucursalRef: string; datos: { nombre: string; edadMin: number; edadMax: number; nivel: string | null; descripcion: string | null; permiteTraslape: boolean; corte: string | null }; antes: { edadMin: number; edadMax: number; nivel: string | null; descripcion: string | null; permiteTraslape: boolean; corte: string | null } | null }
  | { k: "grupo"; accion: Accion; ref: string; programaRef: string; datos: { nombre: string; cupo: number; listaEspera: boolean; salonRef: string | null; instructorRef: string | null }; antes: { cupo: number; listaEspera: boolean; salonRef: string | null; instructorRef: string | null } | null; horariosNuevos: ExFranja[]; horariosAntes: ExFranja[] }
  | { k: "precio"; accion: "crear"; programaRef: string; datos: { inscripcion: bigint; mensualidad: bigint; desde: string; hasta: string | null }; cerrar: { id: string; hasta: string; antes: ExPrecio } | null };

export type ClaveDeResumen = Tipo | "oferta";
export interface ConteoDeResumen { creados: number; actualizados: number; sin_cambios: number }

export interface Cambio {
  entidad: ClaveDeResumen;
  accion: Accion;
  descripcion: string;
}

export interface Plan {
  errores: Problema[];
  avisos: Problema[];
  ops: Op[];
  resumen: Record<ClaveDeResumen, ConteoDeResumen>;
  cambios: Cambio[];
}

// ── Entidades "virtuales": lo existente más lo que el archivo crea o cambia ──────────────────────

interface VDisc { ref: string; nombre: string; clave: string; slug: string; color: string | null; activo: boolean }
interface VSuc { ref: string; nombre: string; clave: string; direccion: string | null; zona: string; activo: boolean }
interface VSalon { ref: string; sucRef: string; nombre: string; clave: string; capacidad: number | null; activo: boolean }
interface VInst { ref: string; nombre: string; clave: string; telefono: string | null; correo: string | null; activo: boolean; sucRefs: Set<string> }
interface VProg { ref: string; discRef: string; sucRef: string; nombre: string; clave: string; edadMin: number; edadMax: number; nivel: string | null; descripcion: string | null; permite: boolean; corte: string | null; activo: boolean; nuevo: boolean; tocado: boolean; fila: number | null }
interface VFranja { dia: number; inicioMin: number; finMin: number; /** null = ya existía; número = fila de horarios.csv que la agrega. */ fila: number | null }
interface VGrupo { ref: string; progRef: string; nombre: string; clave: string; cupo: number; lista: boolean; salonRef: string | null; instructorRef: string | null; activo: boolean; ocupados: number; franjas: VFranja[]; nuevo: boolean; fila: number | null; cambioSalon: boolean; cambioInstructor: boolean; tocado: boolean }
interface VPrecio { id: string | null; progRef: string; inscripcion: bigint; mensualidad: bigint; desde: string; hasta: string | null; fila: number | null }

const indexar = <T>(items: readonly T[], clave: (x: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const x of items) {
    const k = clave(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
};

const franjaTexto = (f: { dia: number; inicioMin: number; finMin: number }): string => `${NOMBRES_DE_DIA[f.dia] ?? f.dia} de ${horaTexto(f.inicioMin)} a ${horaTexto(f.finMin)}`;
const comillas = (s: string): string => `“${s}”`;

/** La fecha «AAAA-MM-DD» como la lee la escuela: día/mes/año. */
const fechaLatina = (f: string): string => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

export function planificar(tablas: Partial<Record<Tipo, TablaLeida>>, ex: Existente): Plan {
  const errores: Problema[] = [];
  const avisos: Problema[] = [];
  const ops: Op[] = [];
  const cambios: Cambio[] = [];
  const resumen = Object.fromEntries([...TIPOS, "oferta"].map((t) => [t, { creados: 0, actualizados: 0, sin_cambios: 0 }])) as Record<ClaveDeResumen, ConteoDeResumen>;
  let secuencia = 0;
  const nuevaRef = (t: string): string => `nuevo:${t}:${++secuencia}`;

  const archivoDe = (t: Tipo): string => tablas[t]?.archivo ?? ESQUEMAS[t].archivo;
  const error = (t: Tipo, fila: number | null, columna: string | null, mensaje: string): void => {
    errores.push({ archivo: archivoDe(t), tipo: t, fila, columna: columna === null ? null : tituloDe(t, columna), mensaje });
  };
  const aviso = (t: Tipo, fila: number | null, columna: string | null, mensaje: string): void => {
    avisos.push({ archivo: archivoDe(t), tipo: t, fila, columna: columna === null ? null : tituloDe(t, columna), mensaje });
  };
  const contar = (e: ClaveDeResumen, que: "creados" | "actualizados" | "sin_cambios"): void => {
    resumen[e][que] += 1;
  };
  const cambio = (entidad: ClaveDeResumen, accion: Accion, descripcion: string): void => {
    cambios.push({ entidad, accion, descripcion });
  };
  const hecho = (r: Leido<unknown>, t: Tipo, fila: number, col: string): boolean => {
    if (!r.ok) error(t, fila, col, r.mensaje);
    return r.ok;
  };

  /**
   * Lo que falló en su propia hoja (por nombre): las filas de otras hojas que dependen de ello no repiten el error («no existe el grupo…» cuando el grupo
   * sí está en el archivo pero tiene un dato mal): ya se dijo dónde está el problema.
   */
  const falla = { disc: new Set<string>(), suc: new Set<string>(), salon: new Set<string>(), instr: new Set<string>(), prog: new Set<string>(), grupo: new Set<string>() };
  let omitidos = 0;
  /** Anota el error de «no existe X» salvo que X esté en el archivo y haya fallado; en ese caso solo cuenta que la fila quedó sin resolver. */
  const noExiste = (fallidas: Set<string>, clave: string, t: Tipo, fila: number, col: string, mensaje: string): void => {
    if (fallidas.has(clave)) omitidos += 1;
    else error(t, fila, col, mensaje);
  };
  const recorrer = (t: Tipo, fallidas: Set<string>, claveDeFila: (f: FilaLeida) => string, cuerpo: (f: FilaLeida) => void): void => {
    for (const f of tablas[t]?.filas ?? []) {
      const antes = errores.length;
      const omitidosAntes = omitidos;
      cuerpo(f);
      if (errores.length > antes || omitidos > omitidosAntes) fallidas.add(claveDeFila(f));
    }
  };

  /** El texto de una celda obligatoria, o null con el error ya anotado. */
  const exigir = (t: Tipo, f: FilaLeida, clave: string, maximo: number): string | null => {
    const texto = nombreLimpio(f.v[clave] ?? "");
    if (texto === "") {
      error(t, f.numero, clave, "este dato es obligatorio y la celda está vacía");
      return null;
    }
    if (texto.length > maximo) {
      error(t, f.numero, clave, `es demasiado largo (${texto.length} caracteres; el máximo es ${maximo})`);
      return null;
    }
    return texto;
  };
  /** El texto de una celda opcional: "" si está vacía; null (con error) si se pasa del máximo. */
  const opcional = (t: Tipo, f: FilaLeida, clave: string, maximo: number): string | null => {
    const texto = nombreLimpio(f.v[clave] ?? "");
    if (texto.length > maximo) {
      error(t, f.numero, clave, `es demasiado largo (${texto.length} caracteres; el máximo es ${maximo})`);
      return null;
    }
    return texto;
  };

  /** Un nombre repetido dentro del mismo archivo: devuelve true (y anota el error) si ya salió antes. */
  const repetidoEnArchivo = (vistos: Map<string, number>, llave: string, t: Tipo, f: FilaLeida, col: string, que: string): boolean => {
    const previa = vistos.get(llave);
    if (previa !== undefined) {
      error(t, f.numero, col, `${que} ya aparece en la fila ${previa} de este archivo. Cada una va una sola vez`);
      return true;
    }
    vistos.set(llave, f.numero);
    return false;
  };

  // ── 1. Disciplinas ─────────────────────────────────────────────────────────────────────────────
  const discs: VDisc[] = ex.verticales.map((v) => ({ ref: v.id, nombre: v.nombre, clave: claveDeNombre(v.nombre), slug: v.slug, color: v.color, activo: v.activo }));
  const discPorClave = indexar(discs, (d) => d.clave);
  const slugs = new Map(discs.map((d) => [d.slug, d]));
  {
    const vistos = new Map<string, number>();
    recorrer("disciplinas", falla.disc, (f) => claveDeNombre(f.v["nombre"] ?? ""), (f) => {
      const nombre = exigir("disciplinas", f, "nombre", 80);
      const colorTexto = opcional("disciplinas", f, "color", 20);
      if (nombre === null || colorTexto === null) return;
      const color = colorTexto === "" ? null : leerColor(colorTexto);
      if (color && !hecho(color, "disciplinas", f.numero, "color")) return;
      const colorFinal = color && color.ok ? color.valor : null;
      const clave = claveDeNombre(nombre);
      if (repetidoEnArchivo(vistos, clave, "disciplinas", f, "nombre", `la disciplina ${comillas(nombre)}`)) return;
      const previas = discPorClave.get(clave) ?? [];
      if (previas.length > 1) {
        error("disciplinas", f.numero, "nombre", `hay ${previas.length} disciplinas que se llaman casi igual a ${comillas(nombre)}. Revísalas en Administración → Disciplinas`);
        return;
      }
      const previa = previas[0];
      if (previa) {
        if (colorFinal !== null && colorFinal !== (previa.color ?? "").toUpperCase()) {
          ops.push({ k: "disciplina", accion: "actualizar", ref: previa.ref, datos: { nombre: previa.nombre, slug: previa.slug, color: colorFinal }, antes: { color: previa.color } });
          cambio("disciplinas", "actualizar", `Disciplina ${comillas(previa.nombre)}: color ${previa.color ?? "(el de la escuela)"} → ${colorFinal}`);
          previa.color = colorFinal;
          contar("disciplinas", "actualizados");
        } else contar("disciplinas", "sin_cambios");
        return;
      }
      const slug = slugDe(nombre);
      if (!PATRON_DE_SLUG.test(slug)) {
        error("disciplinas", f.numero, "nombre", `con ese nombre no se pudo armar el identificador de la página de registro; usa letras o números en el nombre`);
        return;
      }
      const choca = slugs.get(slug);
      if (choca) {
        error("disciplinas", f.numero, "nombre", `queda con el mismo identificador de página que la disciplina ${comillas(choca.nombre)} (“${slug}”). Cámbiale el nombre para distinguirlas`);
        return;
      }
      const nueva: VDisc = { ref: nuevaRef("disciplina"), nombre, clave, slug, color: colorFinal, activo: true };
      discs.push(nueva);
      slugs.set(slug, nueva);
      discPorClave.set(clave, [nueva]);
      ops.push({ k: "disciplina", accion: "crear", ref: nueva.ref, datos: { nombre, slug, color: colorFinal }, antes: null });
      cambio("disciplinas", "crear", `Disciplina nueva: ${comillas(nombre)}`);
      contar("disciplinas", "creados");
    });
  }

  // ── 2. Sucursales ──────────────────────────────────────────────────────────────────────────────
  const sucs: VSuc[] = ex.sucursales.map((s) => ({ ref: s.id, nombre: s.nombre, clave: claveDeNombre(s.nombre), direccion: s.direccion, zona: s.zona, activo: s.activo }));
  const sucPorClave = indexar(sucs, (s) => s.clave);
  {
    const vistos = new Map<string, number>();
    recorrer("sucursales", falla.suc, (f) => claveDeNombre(f.v["nombre"] ?? ""), (f) => {
      const nombre = exigir("sucursales", f, "nombre", 120);
      const direccion = opcional("sucursales", f, "direccion", 300);
      const zonaTexto = exigir("sucursales", f, "zona", 64);
      if (nombre === null || direccion === null || zonaTexto === null) return;
      if (/[|;/]/.test(nombre)) {
        error("sucursales", f.numero, "nombre", "el nombre no puede llevar los signos | ; ni / (se usan para separar listas en otros archivos)");
        return;
      }
      const zona = leerZonaHoraria(zonaTexto);
      if (!hecho(zona, "sucursales", f.numero, "zona") || !zona.ok) return;
      const clave = claveDeNombre(nombre);
      if (repetidoEnArchivo(vistos, clave, "sucursales", f, "nombre", `la sucursal ${comillas(nombre)}`)) return;
      const previas = sucPorClave.get(clave) ?? [];
      if (previas.length > 1) {
        error("sucursales", f.numero, "nombre", `hay ${previas.length} sucursales que se llaman casi igual a ${comillas(nombre)}. Revísalas en Administración → Sucursales`);
        return;
      }
      const previa = previas[0];
      if (previa) {
        const cambia: string[] = [];
        const antes = { direccion: previa.direccion, zona: previa.zona };
        if (direccion !== "" && direccion !== (previa.direccion ?? "")) cambia.push(`dirección “${previa.direccion ?? ""}” → “${direccion}”`);
        if (zona.valor !== previa.zona) cambia.push(`zona horaria ${previa.zona} → ${zona.valor}`);
        if (cambia.length === 0) {
          contar("sucursales", "sin_cambios");
          return;
        }
        if (direccion !== "") previa.direccion = direccion;
        previa.zona = zona.valor;
        ops.push({ k: "sucursal", accion: "actualizar", ref: previa.ref, datos: { nombre: previa.nombre, direccion: previa.direccion, zona: previa.zona }, antes });
        cambio("sucursales", "actualizar", `Sucursal ${comillas(previa.nombre)}: ${cambia.join("; ")}`);
        contar("sucursales", "actualizados");
        return;
      }
      const nueva: VSuc = { ref: nuevaRef("sucursal"), nombre, clave, direccion: direccion === "" ? null : direccion, zona: zona.valor, activo: true };
      sucs.push(nueva);
      sucPorClave.set(clave, [nueva]);
      ops.push({ k: "sucursal", accion: "crear", ref: nueva.ref, datos: { nombre, direccion: nueva.direccion, zona: nueva.zona }, antes: null });
      cambio("sucursales", "crear", `Sucursal nueva: ${comillas(nombre)}`);
      contar("sucursales", "creados");
    });
  }

  /** Busca una sucursal por nombre; anota el error y devuelve null si no existe, es ambigua o está desactivada. */
  const buscarSucursal = (t: Tipo, f: FilaLeida, col: string, texto: string): VSuc | null => {
    const hallazgo = sucPorClave.get(claveDeNombre(texto)) ?? [];
    if (hallazgo.length === 0) {
      noExiste(falla.suc, claveDeNombre(texto), t, f.numero, col, `no existe la sucursal ${comillas(texto)}. Revisa el nombre o agrégala en el archivo de sucursales`);
      return null;
    }
    if (hallazgo.length > 1) {
      error(t, f.numero, col, `hay ${hallazgo.length} sucursales que se llaman casi igual a ${comillas(texto)}. Revísalas en Administración → Sucursales`);
      return null;
    }
    const s = hallazgo[0]!;
    if (!s.activo) {
      error(t, f.numero, col, `la sucursal ${comillas(s.nombre)} está desactivada. Actívala en Administración → Sucursales antes de cargarle datos`);
      return null;
    }
    return s;
  };

  // ── 3. Salones ─────────────────────────────────────────────────────────────────────────────────
  const salones: VSalon[] = ex.salones.map((s) => ({ ref: s.id, sucRef: s.sucursalId, nombre: s.nombre, clave: claveDeSalon(s.nombre), capacidad: s.capacidad, activo: s.activo }));
  const salonPorClave = indexar(salones, (s) => `${s.sucRef}|${s.clave}`);
  {
    const vistos = new Map<string, number>();
    recorrer("salones", falla.salon, (f) => claveDeSalon(f.v["nombre"] ?? ""), (f) => {
      const sucTexto = exigir("salones", f, "sucursal", 120);
      const nombreTexto = exigir("salones", f, "nombre", 80);
      const capTexto = opcional("salones", f, "capacidad", 12);
      if (sucTexto === null || nombreTexto === null || capTexto === null) return;
      const cap = capTexto === "" ? null : leerEntero(capTexto, 1, 1000);
      if (cap && !hecho(cap, "salones", f.numero, "capacidad")) return;
      const capacidad = cap && cap.ok ? cap.valor : null;
      const suc = buscarSucursal("salones", f, "sucursal", sucTexto);
      if (!suc) return;
      const nombre = nombreDeSalon(nombreTexto);
      const clave = claveDeSalon(nombre);
      if (repetidoEnArchivo(vistos, `${suc.ref}|${clave}`, "salones", f, "nombre", `el salón ${comillas(nombre)} de ${comillas(suc.nombre)}`)) return;
      const previa = salonPorClave.get(`${suc.ref}|${clave}`)?.[0];
      if (previa) {
        if (capacidad !== null && capacidad !== previa.capacidad) {
          ops.push({ k: "salon", accion: "actualizar", ref: previa.ref, sucursalRef: suc.ref, datos: { nombre: previa.nombre, capacidad }, antes: { capacidad: previa.capacidad } });
          cambio("salones", "actualizar", `Salón ${comillas(previa.nombre)} de ${comillas(suc.nombre)}: capacidad ${previa.capacidad ?? "(sin dato)"} → ${capacidad}`);
          previa.capacidad = capacidad;
          contar("salones", "actualizados");
        } else contar("salones", "sin_cambios");
        return;
      }
      const nuevo: VSalon = { ref: nuevaRef("salon"), sucRef: suc.ref, nombre, clave, capacidad, activo: true };
      salones.push(nuevo);
      salonPorClave.set(`${suc.ref}|${clave}`, [nuevo]);
      ops.push({ k: "salon", accion: "crear", ref: nuevo.ref, sucursalRef: suc.ref, datos: { nombre, capacidad }, antes: null });
      cambio("salones", "crear", `Salón nuevo: ${comillas(nombre)} en ${comillas(suc.nombre)}${capacidad !== null ? ` (capacidad ${capacidad})` : ""}`);
      contar("salones", "creados");
    });
  }

  // ── 4. Instructores ────────────────────────────────────────────────────────────────────────────
  const instrs: VInst[] = ex.instructores.map((i) => ({ ref: i.id, nombre: i.nombre, clave: claveDeNombre(i.nombre), telefono: i.telefono, correo: i.correo, activo: i.activo, sucRefs: new Set(i.sucursalIds) }));
  const instrPorClave = indexar(instrs, (i) => i.clave);
  {
    const vistos = new Map<string, number>();
    recorrer("instructores", falla.instr, (f) => claveDeNombre(f.v["nombre"] ?? ""), (f) => {
      const nombre = exigir("instructores", f, "nombre", 120);
      const telTexto = opcional("instructores", f, "telefono", 40);
      const correoTexto = opcional("instructores", f, "correo", 200);
      if (nombre === null || telTexto === null || correoTexto === null) return;
      let bueno = true;
      const tel = telTexto === "" ? null : leerTelefono(telTexto);
      if (tel && !hecho(tel, "instructores", f.numero, "telefono")) bueno = false;
      const correo = correoTexto === "" ? null : leerCorreo(correoTexto);
      if (correo && !hecho(correo, "instructores", f.numero, "correo")) bueno = false;
      const sucursalesNuevas: VSuc[] = [];
      for (const nombreSuc of leerLista(f.v["sucursales"] ?? "")) {
        const s = buscarSucursal("instructores", f, "sucursales", nombreSuc);
        if (!s) bueno = false;
        else if (!sucursalesNuevas.includes(s)) sucursalesNuevas.push(s);
      }
      const clave = claveDeNombre(nombre);
      if (repetidoEnArchivo(vistos, clave, "instructores", f, "nombre", `el instructor ${comillas(nombre)}`)) bueno = false;
      if (!bueno) return;
      const telefono = tel && tel.ok ? tel.valor : null;
      const correoFinal = correo && correo.ok ? correo.valor : null;
      const previas = instrPorClave.get(clave) ?? [];
      if (previas.length > 1) {
        error("instructores", f.numero, "nombre", `hay ${previas.length} instructores que se llaman casi igual a ${comillas(nombre)}; no se sabe a cuál te refieres. Revísalos en Administración → Instructores y salones`);
        return;
      }
      const previa = previas[0];
      if (previa) {
        const cambia: string[] = [];
        const antes = { telefono: previa.telefono, correo: previa.correo, sucursalIds: [...previa.sucRefs] };
        if (telefono !== null && telefono !== previa.telefono) cambia.push("teléfono");
        if (correoFinal !== null && correoFinal !== previa.correo) cambia.push("correo");
        const faltan = sucursalesNuevas.filter((s) => !previa.sucRefs.has(s.ref));
        if (faltan.length > 0) cambia.push(`sucursales (se agrega ${faltan.map((s) => comillas(s.nombre)).join(", ")})`);
        if (cambia.length === 0) {
          contar("instructores", "sin_cambios");
          return;
        }
        if (telefono !== null) previa.telefono = telefono;
        if (correoFinal !== null) previa.correo = correoFinal;
        for (const s of faltan) previa.sucRefs.add(s.ref);
        ops.push({ k: "instructor", accion: "actualizar", ref: previa.ref, datos: { nombre: previa.nombre, telefono: previa.telefono, correo: previa.correo }, sucursalesNuevas: faltan.map((s) => s.ref), antes });
        cambio("instructores", "actualizar", `Instructor ${comillas(previa.nombre)}: ${cambia.join("; ")}`);
        contar("instructores", "actualizados");
        return;
      }
      const nuevo: VInst = { ref: nuevaRef("instructor"), nombre, clave, telefono, correo: correoFinal, activo: true, sucRefs: new Set(sucursalesNuevas.map((s) => s.ref)) };
      instrs.push(nuevo);
      instrPorClave.set(clave, [nuevo]);
      ops.push({ k: "instructor", accion: "crear", ref: nuevo.ref, datos: { nombre, telefono, correo: correoFinal }, sucursalesNuevas: sucursalesNuevas.map((s) => s.ref), antes: null });
      cambio("instructores", "crear", `Instructor nuevo: ${comillas(nombre)}`);
      if (telefono === null) aviso("instructores", f.numero, "telefono", `sin teléfono, a ${comillas(nombre)} no le llegarán por WhatsApp los avisos de las clases muestra. Puedes agregarlo después`);
      contar("instructores", "creados");
    });
  }

  // ── 5. Programas ───────────────────────────────────────────────────────────────────────────────
  const ofertas = new Set(ex.ofertas.map((o) => `${o.sucursalId}|${o.verticalId}`));
  const progs: VProg[] = ex.programas.map((p) => ({ ref: p.id, discRef: p.verticalId, sucRef: p.sucursalId, nombre: p.nombre, clave: claveDeNombre(p.nombre), edadMin: p.edadMin, edadMax: p.edadMax, nivel: p.nivel, descripcion: p.descripcion, permite: p.permiteTraslape, corte: p.corte, activo: p.activo, nuevo: false, tocado: false, fila: null }));
  const progPorSuc = indexar(progs, (p) => `${p.sucRef}|${p.clave}`);
  const progPorClave = indexar(progs, (p) => p.clave);
  const discPorRef = new Map(discs.map((d) => [d.ref, d]));
  const sucPorRef = new Map(sucs.map((s) => [s.ref, s]));
  {
    const vistos = new Map<string, number>();
    recorrer("programas", falla.prog, (f) => claveDeNombre(f.v["nombre"] ?? ""), (f) => {
      const discTexto = exigir("programas", f, "disciplina", 80);
      const sucTexto = exigir("programas", f, "sucursal", 120);
      const nombre = exigir("programas", f, "nombre", 120);
      const minTexto = exigir("programas", f, "edad_min", 12);
      const maxTexto = exigir("programas", f, "edad_max", 12);
      const corteTexto = opcional("programas", f, "corte", 40);
      const nivel = opcional("programas", f, "nivel", 80);
      const descripcion = opcional("programas", f, "descripcion", 500);
      const altTexto = opcional("programas", f, "alternativa", 20);
      if ([discTexto, sucTexto, nombre, minTexto, maxTexto, corteTexto, nivel, descripcion, altTexto].some((x) => x === null)) return;
      let bueno = true;
      const min = leerEntero(minTexto!, 0, 99);
      if (!hecho(min, "programas", f.numero, "edad_min")) bueno = false;
      const max = leerEntero(maxTexto!, 0, 99);
      if (!hecho(max, "programas", f.numero, "edad_max")) bueno = false;
      if (min.ok && max.ok && min.valor > max.valor) {
        error("programas", f.numero, "edad_max", `la edad máxima (${max.valor}) no puede ser menor que la mínima (${min.valor})`);
        bueno = false;
      }
      const corte = corteTexto === "" ? null : leerFecha(corteTexto!);
      if (corte && !hecho(corte, "programas", f.numero, "corte")) bueno = false;
      const alt = altTexto === "" ? null : leerSiNo(altTexto!);
      if (alt && !hecho(alt, "programas", f.numero, "alternativa")) bueno = false;
      const disc = (discPorClave.get(claveDeNombre(discTexto!)) ?? []);
      if (disc.length === 0) {
        noExiste(falla.disc, claveDeNombre(discTexto!), "programas", f.numero, "disciplina", `no existe la disciplina ${comillas(discTexto!)}. Revisa el nombre o agrégala en el archivo de disciplinas`);
        bueno = false;
      } else if (disc.length > 1) {
        error("programas", f.numero, "disciplina", `hay ${disc.length} disciplinas que se llaman casi igual a ${comillas(discTexto!)}. Revísalas en Administración → Disciplinas`);
        bueno = false;
      } else if (!disc[0]!.activo) {
        error("programas", f.numero, "disciplina", `la disciplina ${comillas(disc[0]!.nombre)} está desactivada. Actívala en Administración → Disciplinas antes de cargarle programas`);
        bueno = false;
      }
      const suc = buscarSucursal("programas", f, "sucursal", sucTexto!);
      if (!suc) bueno = false;
      if (!bueno || !suc || disc.length !== 1 || !min.ok || !max.ok) return;
      const clave = claveDeNombre(nombre!);
      if (repetidoEnArchivo(vistos, `${suc.ref}|${clave}`, "programas", f, "nombre", `el programa ${comillas(nombre!)} de ${comillas(suc.nombre)}`)) return;
      const d = disc[0]!;
      const valores = { edadMin: min.valor, edadMax: max.valor, nivel: nivel === "" ? null : nivel!, descripcion: descripcion === "" ? null : descripcion!, permiteTraslape: alt && alt.ok ? alt.valor : false, corte: corte && corte.ok ? corte.valor : null };
      const previa = progPorSuc.get(`${suc.ref}|${clave}`)?.[0];
      if (previa) {
        if (previa.discRef !== d.ref) {
          error("programas", f.numero, "disciplina", `el programa ${comillas(previa.nombre)} de ${comillas(suc.nombre)} ya existe con la disciplina ${comillas(discPorRef.get(previa.discRef)?.nombre ?? "")}; la carga no cambia la disciplina de un programa. Dale otro nombre o corrígelo en Administración`);
          return;
        }
        if (!previa.activo) {
          error("programas", f.numero, "nombre", `el programa ${comillas(previa.nombre)} está desactivado. Actívalo en Administración → Programas antes de cargarle cambios`);
          return;
        }
        const antes = { edadMin: previa.edadMin, edadMax: previa.edadMax, nivel: previa.nivel, descripcion: previa.descripcion, permiteTraslape: previa.permite, corte: previa.corte };
        const cambia: string[] = [];
        if (valores.edadMin !== previa.edadMin || valores.edadMax !== previa.edadMax) cambia.push(`edades ${previa.edadMin}–${previa.edadMax} → ${valores.edadMin}–${valores.edadMax}`);
        if (valores.corte !== null && valores.corte !== previa.corte) cambia.push(`fecha de corte ${previa.corte ? fechaLatina(previa.corte) : "(ninguna)"} → ${fechaLatina(valores.corte)}`);
        if (valores.nivel !== null && valores.nivel !== previa.nivel) cambia.push(`nivel “${previa.nivel ?? ""}” → “${valores.nivel}”`);
        if (valores.descripcion !== null && valores.descripcion !== previa.descripcion) cambia.push("descripción");
        if (alt && alt.ok && alt.valor !== previa.permite) cambia.push(`alternativa para la misma edad: ${previa.permite ? "Sí" : "No"} → ${alt.valor ? "Sí" : "No"}`);
        if (cambia.length === 0) {
          contar("programas", "sin_cambios");
          return;
        }
        previa.edadMin = valores.edadMin;
        previa.edadMax = valores.edadMax;
        if (valores.corte !== null) previa.corte = valores.corte;
        if (valores.nivel !== null) previa.nivel = valores.nivel;
        if (valores.descripcion !== null) previa.descripcion = valores.descripcion;
        if (alt && alt.ok) previa.permite = alt.valor;
        previa.tocado = valores.edadMin !== antes.edadMin || valores.edadMax !== antes.edadMax || previa.permite !== antes.permiteTraslape;
        previa.fila = f.numero;
        ops.push({ k: "programa", accion: "actualizar", ref: previa.ref, disciplinaRef: previa.discRef, sucursalRef: previa.sucRef, datos: { nombre: previa.nombre, edadMin: previa.edadMin, edadMax: previa.edadMax, nivel: previa.nivel, descripcion: previa.descripcion, permiteTraslape: previa.permite, corte: previa.corte }, antes });
        cambio("programas", "actualizar", `Programa ${comillas(previa.nombre)} de ${comillas(suc.nombre)}: ${cambia.join("; ")}`);
        contar("programas", "actualizados");
        return;
      }
      const nuevo: VProg = { ref: nuevaRef("programa"), discRef: d.ref, sucRef: suc.ref, nombre: nombre!, clave, edadMin: valores.edadMin, edadMax: valores.edadMax, nivel: valores.nivel, descripcion: valores.descripcion, permite: valores.permiteTraslape, corte: valores.corte, activo: true, nuevo: true, tocado: true, fila: f.numero };
      progs.push(nuevo);
      progPorSuc.set(`${suc.ref}|${clave}`, [nuevo]);
      const lista = progPorClave.get(clave);
      if (lista) lista.push(nuevo);
      else progPorClave.set(clave, [nuevo]);
      if (!ofertas.has(`${suc.ref}|${d.ref}`)) {
        ofertas.add(`${suc.ref}|${d.ref}`);
        ops.push({ k: "oferta", accion: "crear", sucursalRef: suc.ref, disciplinaRef: d.ref });
        cambio("oferta", "crear", `La sucursal ${comillas(suc.nombre)} ahora imparte ${comillas(d.nombre)}`);
        contar("oferta", "creados");
      }
      ops.push({ k: "programa", accion: "crear", ref: nuevo.ref, disciplinaRef: d.ref, sucursalRef: suc.ref, datos: { nombre: nuevo.nombre, edadMin: nuevo.edadMin, edadMax: nuevo.edadMax, nivel: nuevo.nivel, descripcion: nuevo.descripcion, permiteTraslape: nuevo.permite, corte: nuevo.corte }, antes: null });
      cambio("programas", "crear", `Programa nuevo: ${comillas(nuevo.nombre)} (${comillas(d.nombre)}, ${comillas(suc.nombre)}, ${nuevo.edadMin}–${nuevo.edadMax} años)`);
      contar("programas", "creados");
    });
  }
  for (const s of sucs) sucPorRef.set(s.ref, s);

  /** Busca un programa por nombre (y sucursal, si se da). `columnaPrograma`/`columnaSucursal` son las claves de la hoja de origen. */
  const buscarPrograma = (t: Tipo, f: FilaLeida, columnaPrograma: string, columnaSucursal: string, nombre: string, sucursalTexto: string): VProg | null => {
    let candidatos = progPorClave.get(claveDeNombre(nombre)) ?? [];
    let suc: VSuc | null = null;
    if (sucursalTexto !== "") {
      suc = buscarSucursal(t, f, columnaSucursal, sucursalTexto);
      if (!suc) return null;
      candidatos = candidatos.filter((p) => p.sucRef === suc!.ref);
    }
    if (candidatos.length === 0) {
      noExiste(falla.prog, claveDeNombre(nombre), t, f.numero, columnaPrograma, `no existe el programa ${comillas(nombre)}${suc ? ` en la sucursal ${comillas(suc.nombre)}` : ""}. Revisa el nombre o agrégalo en el archivo de programas`);
      return null;
    }
    if (candidatos.length > 1) {
      const donde = candidatos.map((p) => comillas(sucPorRef.get(p.sucRef)?.nombre ?? "")).sort((a, b) => a.localeCompare(b, "es-MX")).join(", ");
      error(t, f.numero, columnaPrograma, `hay ${candidatos.length} programas que se llaman ${comillas(nombre)} (en ${donde}). Llena la columna «${tituloDe(t, columnaSucursal)}» para decir cuál`);
      return null;
    }
    const p = candidatos[0]!;
    if (!p.activo) {
      error(t, f.numero, columnaPrograma, `el programa ${comillas(p.nombre)} está desactivado. Actívalo en Administración → Programas antes de cargarle datos`);
      return null;
    }
    return p;
  };

  // ── 6. Grupos ──────────────────────────────────────────────────────────────────────────────────
  const grupos: VGrupo[] = ex.grupos.map((g) => ({ ref: g.id, progRef: g.programaId, nombre: g.nombre, clave: claveDeNombre(g.nombre), cupo: g.cupo, lista: g.listaEspera, salonRef: g.salonId, instructorRef: g.instructorId, activo: g.activo, ocupados: g.ocupados, franjas: g.horarios.map((h) => ({ dia: h.dia, inicioMin: h.inicioMin, finMin: h.finMin, fila: null })), nuevo: false, fila: null, cambioSalon: false, cambioInstructor: false, tocado: false }));
  const grupoPorProg = indexar(grupos, (g) => `${g.progRef}|${g.clave}`);
  const grupoPorClave = indexar(grupos, (g) => g.clave);
  const progPorRef = new Map(progs.map((p) => [p.ref, p]));
  const salonPorRef = new Map(salones.map((s) => [s.ref, s]));
  const instrPorRef = new Map(instrs.map((i) => [i.ref, i]));
  const opDeGrupo = new Map<string, Extract<Op, { k: "grupo" }>>();
  {
    const vistos = new Map<string, number>();
    recorrer("grupos", falla.grupo, (f) => claveDeNombre(f.v["nombre"] ?? ""), (f) => {
      const sucTexto = exigir("grupos", f, "sucursal", 120);
      const progTexto = exigir("grupos", f, "programa", 120);
      const nombre = exigir("grupos", f, "nombre", 120);
      const cupoTexto = exigir("grupos", f, "cupo", 12);
      const salonTexto = opcional("grupos", f, "salon", 80);
      const instrTexto = opcional("grupos", f, "instructor", 120);
      const listaTexto = opcional("grupos", f, "lista_espera", 20);
      if ([sucTexto, progTexto, nombre, cupoTexto, salonTexto, instrTexto, listaTexto].some((x) => x === null)) return;
      let bueno = true;
      const cupo = leerEntero(cupoTexto!, 1, 500);
      if (!hecho(cupo, "grupos", f.numero, "cupo")) bueno = false;
      const lista = listaTexto === "" ? null : leerSiNo(listaTexto!);
      if (lista && !hecho(lista, "grupos", f.numero, "lista_espera")) bueno = false;
      const prog = buscarPrograma("grupos", f, "programa", "sucursal", progTexto!, sucTexto!);
      if (!prog) return;
      const suc = sucPorRef.get(prog.sucRef)!;
      let salon: VSalon | null = null;
      if (salonTexto !== "") {
        salon = salonPorClave.get(`${prog.sucRef}|${claveDeSalon(salonTexto!)}`)?.[0] ?? null;
        if (!salon) {
          noExiste(falla.salon, claveDeSalon(salonTexto!), "grupos", f.numero, "salon", `no existe el salón ${comillas(salonTexto!)} en la sucursal ${comillas(suc.nombre)}. Revisa el nombre o agrégalo en el archivo de salones`);
          bueno = false;
        } else if (!salon.activo) {
          error("grupos", f.numero, "salon", `el salón ${comillas(salon.nombre)} está desactivado. Actívalo en Administración → Instructores y salones`);
          bueno = false;
        }
      }
      let instructor: VInst | null = null;
      if (instrTexto !== "") {
        const hallazgo = instrPorClave.get(claveDeNombre(instrTexto!)) ?? [];
        if (hallazgo.length === 0) {
          noExiste(falla.instr, claveDeNombre(instrTexto!), "grupos", f.numero, "instructor", `no existe el instructor ${comillas(instrTexto!)}. Revisa el nombre o agrégalo en el archivo de instructores`);
          bueno = false;
        } else if (hallazgo.length > 1) {
          error("grupos", f.numero, "instructor", `hay ${hallazgo.length} instructores que se llaman casi igual a ${comillas(instrTexto!)}; no se sabe a cuál te refieres. Revísalos en Administración → Instructores y salones`);
          bueno = false;
        } else {
          instructor = hallazgo[0]!;
          if (!instructor.activo) {
            error("grupos", f.numero, "instructor", `el instructor ${comillas(instructor.nombre)} está desactivado. Actívalo en Administración → Instructores y salones`);
            bueno = false;
          } else if (instructor.sucRefs.size > 0 && !instructor.sucRefs.has(prog.sucRef)) {
            error("grupos", f.numero, "instructor", `${comillas(instructor.nombre)} no da clases en la sucursal ${comillas(suc.nombre)}. Agrégala en su fila del archivo de instructores`);
            bueno = false;
          }
        }
      }
      const clave = claveDeNombre(nombre!);
      if (repetidoEnArchivo(vistos, `${prog.ref}|${clave}`, "grupos", f, "nombre", `el grupo ${comillas(nombre!)} del programa ${comillas(prog.nombre)}`)) bueno = false;
      if (!bueno || !cupo.ok) return;
      const previa = grupoPorProg.get(`${prog.ref}|${clave}`)?.[0];
      const salonFinal = salon ?? (previa ? (previa.salonRef ? salonPorRef.get(previa.salonRef) ?? null : null) : null);
      if (salonFinal && salonFinal.capacidad !== null && cupo.valor > salonFinal.capacidad) {
        error("grupos", f.numero, "cupo", `el cupo (${cupo.valor}) es mayor que la capacidad del salón ${comillas(salonFinal.nombre)} (${salonFinal.capacidad}). Baja el cupo o corrige la capacidad en el archivo de salones`);
        return;
      }
      if (previa) {
        if (!previa.activo) {
          error("grupos", f.numero, "nombre", `el grupo ${comillas(previa.nombre)} está desactivado. Actívalo en Administración → Grupos y horarios antes de cargarle cambios`);
          return;
        }
        const antes = { cupo: previa.cupo, listaEspera: previa.lista, salonRef: previa.salonRef, instructorRef: previa.instructorRef };
        const cambia: string[] = [];
        if (cupo.valor !== previa.cupo) cambia.push(`cupo ${previa.cupo} → ${cupo.valor}`);
        if (salon && salon.ref !== previa.salonRef) cambia.push(`salón ${previa.salonRef ? comillas(salonPorRef.get(previa.salonRef)?.nombre ?? "") : "(ninguno)"} → ${comillas(salon.nombre)}`);
        if (instructor && instructor.ref !== previa.instructorRef) cambia.push(`instructor ${previa.instructorRef ? comillas(instrPorRef.get(previa.instructorRef)?.nombre ?? "") : "(ninguno)"} → ${comillas(instructor.nombre)}`);
        if (lista && lista.ok && lista.valor !== previa.lista) cambia.push(`lista de espera: ${previa.lista ? "Sí" : "No"} → ${lista.valor ? "Sí" : "No"}`);
        if (cambia.length === 0) {
          contar("grupos", "sin_cambios");
          previa.fila = f.numero;
          return;
        }
        if (cupo.valor < previa.ocupados) aviso("grupos", f.numero, "cupo", `el grupo ${comillas(previa.nombre)} ya tiene ${previa.ocupados} alumnos inscritos y el cupo nuevo es ${cupo.valor}. Los inscritos no se tocan, pero el grupo queda lleno hasta que bajen`);
        if (salon && salon.ref !== previa.salonRef) {
          previa.salonRef = salon.ref;
          previa.cambioSalon = true;
        }
        if (instructor && instructor.ref !== previa.instructorRef) {
          previa.instructorRef = instructor.ref;
          previa.cambioInstructor = true;
        }
        previa.cupo = cupo.valor;
        if (lista && lista.ok) previa.lista = lista.valor;
        previa.fila = f.numero;
        previa.tocado = true;
        const op: Extract<Op, { k: "grupo" }> = { k: "grupo", accion: "actualizar", ref: previa.ref, programaRef: prog.ref, datos: { nombre: previa.nombre, cupo: previa.cupo, listaEspera: previa.lista, salonRef: previa.salonRef, instructorRef: previa.instructorRef }, antes, horariosNuevos: [], horariosAntes: previa.franjas.map((x) => ({ dia: x.dia, inicioMin: x.inicioMin, finMin: x.finMin })) };
        ops.push(op);
        opDeGrupo.set(previa.ref, op);
        cambio("grupos", "actualizar", `Grupo ${comillas(previa.nombre)} (${comillas(prog.nombre)}): ${cambia.join("; ")}`);
        contar("grupos", "actualizados");
        return;
      }
      const nuevo: VGrupo = { ref: nuevaRef("grupo"), progRef: prog.ref, nombre: nombre!, clave, cupo: cupo.valor, lista: lista && lista.ok ? lista.valor : false, salonRef: salon?.ref ?? null, instructorRef: instructor?.ref ?? null, activo: true, ocupados: 0, franjas: [], nuevo: true, fila: f.numero, cambioSalon: salon !== null, cambioInstructor: instructor !== null, tocado: true };
      grupos.push(nuevo);
      grupoPorProg.set(`${prog.ref}|${clave}`, [nuevo]);
      const l = grupoPorClave.get(clave);
      if (l) l.push(nuevo);
      else grupoPorClave.set(clave, [nuevo]);
      const op: Extract<Op, { k: "grupo" }> = { k: "grupo", accion: "crear", ref: nuevo.ref, programaRef: prog.ref, datos: { nombre: nuevo.nombre, cupo: nuevo.cupo, listaEspera: nuevo.lista, salonRef: nuevo.salonRef, instructorRef: nuevo.instructorRef }, antes: null, horariosNuevos: [], horariosAntes: [] };
      ops.push(op);
      opDeGrupo.set(nuevo.ref, op);
      cambio("grupos", "crear", `Grupo nuevo: ${comillas(nuevo.nombre)} (${comillas(prog.nombre)}, cupo ${nuevo.cupo})`);
      contar("grupos", "creados");
    });
  }

  // ── 7. Horarios ────────────────────────────────────────────────────────────────────────────────
  {
    for (const f of tablas.horarios?.filas ?? []) {
      const grupoTexto = exigir("horarios", f, "grupo", 120);
      const diaTexto = exigir("horarios", f, "dia", 30);
      const inicioTexto = exigir("horarios", f, "inicio", 30);
      const finTexto = exigir("horarios", f, "fin", 30);
      const progTexto = opcional("horarios", f, "programa", 120);
      const sucTexto = opcional("horarios", f, "sucursal", 120);
      if ([grupoTexto, diaTexto, inicioTexto, finTexto, progTexto, sucTexto].some((x) => x === null)) continue;
      let bueno = true;
      const dia = leerDia(diaTexto!);
      if (!hecho(dia, "horarios", f.numero, "dia")) bueno = false;
      const inicio = leerHora(inicioTexto!);
      if (!hecho(inicio, "horarios", f.numero, "inicio")) bueno = false;
      const fin = leerHora(finTexto!, { esFin: true });
      if (!hecho(fin, "horarios", f.numero, "fin")) bueno = false;
      if (inicio.ok && fin.ok && fin.valor <= inicio.valor) {
        error("horarios", f.numero, "fin", `la hora de fin (${horaTexto(fin.valor)}) debe ser después de la de inicio (${horaTexto(inicio.valor)})`);
        bueno = false;
      }
      let candidatos = grupoPorClave.get(claveDeNombre(grupoTexto!)) ?? [];
      let suc: VSuc | null = null;
      if (sucTexto !== "") {
        suc = buscarSucursal("horarios", f, "sucursal", sucTexto!);
        if (!suc) bueno = false;
        else candidatos = candidatos.filter((g) => progPorRef.get(g.progRef)?.sucRef === suc!.ref);
      }
      if (progTexto !== "") {
        const clave = claveDeNombre(progTexto!);
        candidatos = candidatos.filter((g) => progPorRef.get(g.progRef)?.clave === clave);
      }
      if (!bueno) continue;
      if (candidatos.length === 0) {
        const donde = `${progTexto !== "" ? ` en el programa ${comillas(progTexto!)}` : ""}${suc ? ` de la sucursal ${comillas(suc.nombre)}` : ""}`;
        noExiste(falla.grupo, claveDeNombre(grupoTexto!), "horarios", f.numero, "grupo", `no existe el grupo ${comillas(grupoTexto!)}${donde}. Revisa el nombre o agrégalo en el archivo de grupos`);
        continue;
      }
      if (candidatos.length > 1) {
        const donde = candidatos.map((g) => `${comillas(progPorRef.get(g.progRef)?.nombre ?? "")} de ${comillas(sucPorRef.get(progPorRef.get(g.progRef)?.sucRef ?? "")?.nombre ?? "")}`).sort((a, b) => a.localeCompare(b, "es-MX")).join("; ");
        error("horarios", f.numero, "grupo", `hay ${candidatos.length} grupos que se llaman ${comillas(grupoTexto!)} (${donde}). Llena las columnas «Programa» y «Sucursal» para decir cuál`);
        continue;
      }
      const g = candidatos[0]!;
      if (!g.activo) {
        error("horarios", f.numero, "grupo", `el grupo ${comillas(g.nombre)} está desactivado. Actívalo en Administración → Grupos y horarios`);
        continue;
      }
      if (!dia.ok || !inicio.ok || !fin.ok) continue;
      const nueva: ExFranja = { dia: dia.valor, inicioMin: inicio.valor, finMin: fin.valor };
      const igual = g.franjas.find((x) => x.dia === nueva.dia && x.inicioMin === nueva.inicioMin && x.finMin === nueva.finMin);
      if (igual) {
        if (igual.fila !== null) error("horarios", f.numero, "dia", `este horario del grupo ${comillas(g.nombre)} ya aparece en la fila ${igual.fila} de este archivo`);
        else contar("horarios", "sin_cambios");
        continue;
      }
      const mismoInicio = g.franjas.find((x) => x.dia === nueva.dia && x.inicioMin === nueva.inicioMin);
      if (mismoInicio) {
        error("horarios", f.numero, "fin", `el grupo ${comillas(g.nombre)} ya tiene clase ${franjaTexto(mismoInicio)}; aquí solo se agregan horarios. Para corregir uno que ya existe, usa Administración → Grupos y horarios`);
        continue;
      }
      const cruce = g.franjas.find((x) => franjasSeTraslapan(x, nueva));
      if (cruce) {
        error("horarios", f.numero, "inicio", `este horario se cruza con otro del mismo grupo (${franjaTexto(cruce)}). Un grupo no puede tener dos clases al mismo tiempo`);
        continue;
      }
      g.franjas.push({ ...nueva, fila: f.numero });
      g.tocado = true;
      let op = opDeGrupo.get(g.ref);
      if (!op) {
        // Un grupo que ya existía y el archivo de grupos no mencionó (o dejó igual): solo recibe horarios.
        const prog = progPorRef.get(g.progRef)!;
        op = { k: "grupo", accion: "actualizar", ref: g.ref, programaRef: g.progRef, datos: { nombre: g.nombre, cupo: g.cupo, listaEspera: g.lista, salonRef: g.salonRef, instructorRef: g.instructorRef }, antes: { cupo: g.cupo, listaEspera: g.lista, salonRef: g.salonRef, instructorRef: g.instructorRef }, horariosNuevos: [], horariosAntes: g.franjas.filter((x) => x.fila === null).map((x) => ({ dia: x.dia, inicioMin: x.inicioMin, finMin: x.finMin })) };
        ops.push(op);
        opDeGrupo.set(g.ref, op);
        cambio("grupos", "actualizar", `Grupo ${comillas(g.nombre)} (${comillas(prog.nombre)}): se agregan horarios`);
        contar("grupos", "actualizados");
        // El grupo se contó antes como «sin cambios» en su hoja; ahora tiene horarios nuevos.
        if (resumen.grupos.sin_cambios > 0 && g.fila !== null && !g.nuevo) resumen.grupos.sin_cambios -= 1;
      }
      op.horariosNuevos.push(nueva);
      cambio("horarios", "crear", `Horario nuevo: grupo ${comillas(g.nombre)}, ${franjaTexto(nueva)}`);
      contar("horarios", "creados");
    }
  }

  // ── 8. Precios ─────────────────────────────────────────────────────────────────────────────────
  const preciosDe = new Map<string, VPrecio[]>();
  for (const p of ex.precios) {
    const l = preciosDe.get(p.programaId) ?? [];
    l.push({ id: p.id, progRef: p.programaId, inscripcion: p.inscripcion, mensualidad: p.mensualidad, desde: p.desde, hasta: p.hasta, fila: null });
    preciosDe.set(p.programaId, l);
  }
  {
    type Fila = { f: FilaLeida; prog: VProg; ins: bigint; men: bigint; desde: string };
    const validas: Fila[] = [];
    for (const f of tablas.precios?.filas ?? []) {
      const progTexto = exigir("precios", f, "programa", 120);
      const sucTexto = opcional("precios", f, "sucursal", 120);
      const insTexto = exigir("precios", f, "inscripcion", 30);
      const menTexto = exigir("precios", f, "mensualidad", 30);
      const desdeTexto = exigir("precios", f, "desde", 40);
      if ([progTexto, sucTexto, insTexto, menTexto, desdeTexto].some((x) => x === null)) continue;
      let bueno = true;
      const ins = leerImporte(insTexto!);
      if (!hecho(ins, "precios", f.numero, "inscripcion")) bueno = false;
      const men = leerImporte(menTexto!);
      if (!hecho(men, "precios", f.numero, "mensualidad")) bueno = false;
      const desde = leerFecha(desdeTexto!);
      if (!hecho(desde, "precios", f.numero, "desde")) bueno = false;
      const prog = buscarPrograma("precios", f, "programa", "sucursal", progTexto!, sucTexto!);
      if (!prog || !bueno || !ins.ok || !men.ok || !desde.ok) continue;
      validas.push({ f, prog, ins: ins.valor, men: men.valor, desde: desde.valor });
    }
    // Se procesan por programa y fecha: un archivo con la historia de precios en cualquier orden da el mismo resultado.
    validas.sort((a, b) => a.prog.ref.localeCompare(b.prog.ref, "es", { numeric: true }) || (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : a.f.numero - b.f.numero));
    for (const { f, prog, ins, men, desde } of validas) {
      const sucNombre = sucPorRef.get(prog.sucRef)?.nombre ?? "";
      const lista = preciosDe.get(prog.ref) ?? [];
      const mismoDia = lista.find((x) => x.desde === desde);
      if (mismoDia) {
        if (mismoDia.fila !== null) error("precios", f.numero, "desde", `el programa ${comillas(prog.nombre)} ya tiene un precio con esta fecha en la fila ${mismoDia.fila} de este archivo`);
        else if (mismoDia.inscripcion === ins && mismoDia.mensualidad === men) contar("precios", "sin_cambios");
        else error("precios", f.numero, "desde", `el programa ${comillas(prog.nombre)} ya tiene un precio vigente desde el ${fechaLatina(desde)} con otros importes (inscripción ${formatear(mismoDia.inscripcion)}, mensualidad ${formatear(mismoDia.mensualidad)}). Un precio nuevo debe empezar en una fecha posterior: así lo ya cobrado no cambia`);
        continue;
      }
      const plan = planDeAlta(lista.map((x) => ({ id: x.id ?? `fila:${x.fila}`, desde: x.desde, hasta: x.hasta })), desde);
      if (!plan.ok) {
        const posterior = lista.filter((x) => x.desde >= desde).sort((a, b) => (a.desde < b.desde ? -1 : 1))[0];
        error("precios", f.numero, "desde", `el programa ${comillas(prog.nombre)} ya tiene un precio con vigencia desde el ${fechaLatina(posterior?.desde ?? desde)}; un precio nuevo debe empezar después de esa fecha. Para corregir uno anterior, usa Administración → Precios`);
        continue;
      }
      let cerrar: Extract<Op, { k: "precio" }>["cerrar"] = null;
      if (plan.cerrar) {
        const previo = lista.find((x) => (x.id ?? `fila:${x.fila}`) === plan.cerrar!.id)!;
        previo.hasta = plan.cerrar.hasta;
        if (previo.id !== null) {
          const original = ex.precios.find((x) => x.id === previo.id)!;
          cerrar = { id: previo.id, hasta: plan.cerrar.hasta, antes: original };
        } else {
          // Cierra un precio que este mismo archivo está creando: el alta nace ya cerrada.
          const opPrevia = ops.find((o) => o.k === "precio" && o.programaRef === prog.ref && o.datos.desde === previo.desde);
          if (opPrevia && opPrevia.k === "precio") opPrevia.datos.hasta = plan.cerrar.hasta;
        }
      }
      lista.push({ id: null, progRef: prog.ref, inscripcion: ins, mensualidad: men, desde, hasta: null, fila: f.numero });
      preciosDe.set(prog.ref, lista);
      ops.push({ k: "precio", accion: "crear", programaRef: prog.ref, datos: { inscripcion: ins, mensualidad: men, desde, hasta: null }, cerrar });
      cambio("precios", "crear", `Precio nuevo de ${comillas(prog.nombre)} (${comillas(sucNombre)}): inscripción ${formatear(ins)}, mensualidad ${formatear(men)}, desde el ${fechaLatina(desde)}${plan.cerrar ? `; el anterior termina el ${fechaLatina(plan.cerrar.hasta)}` : ""}`);
      contar("precios", "creados");
    }
  }

  // ── Avisos sobre programas nuevos ──────────────────────────────────────────────────────────────
  const conGrupos = new Set(grupos.filter((g) => g.activo).map((g) => g.progRef));
  for (const p of progs.filter((x) => x.nuevo && x.fila !== null)) {
    const sinPrecio = !(preciosDe.get(p.ref)?.length);
    if (sinPrecio) aviso("programas", p.fila, "nombre", `el programa ${comillas(p.nombre)} queda sin precio: no se podrá cotizar ni inscribir hasta que cargues su precio`);
    if (!conGrupos.has(p.ref)) aviso("programas", p.fila, "nombre", `el programa ${comillas(p.nombre)} queda sin grupos: las familias no verán horarios hasta que los cargues`);
  }

  // ── Verificaciones del catálogo sobre lo que quedaría ──────────────────────────────────────────
  verificarEdades();
  verificarChoques();

  function verificarEdades(): void {
    const activos = progs.filter((p) => p.activo);
    const catalogo: Catalogo = {
      programas: activos.map((p): ProgramaCatalogo => ({ id: p.ref, nombre: p.ref, verticalId: p.discRef, sucursalId: p.sucRef, edadMin: p.edadMin, edadMax: p.edadMax, permiteTraslape: p.permite })),
      grupos: [],
      horarios: [],
      salones: new Map(),
      sucursales: new Map(),
      verticales: new Map(),
    };
    const porRef = new Map(activos.map((p) => [p.ref, p]));
    for (const t of traslapesDeEdad(catalogo)) {
      const a = porRef.get(t.programaA)!;
      const b = porRef.get(t.programaB)!;
      const lados = [a, b].filter((p) => p.tocado && p.fila !== null);
      if (lados.length === 0) continue;
      const culpable = lados.sort((x, y) => (y.fila ?? 0) - (x.fila ?? 0))[0]!;
      const otro = culpable === a ? b : a;
      const donde = otro.fila !== null && otro.tocado ? `en la fila ${otro.fila} de este archivo` : "que ya existe";
      error("programas", culpable.fila, "edad_min", `las edades ${culpable.edadMin}–${culpable.edadMax} se traslapan con las del programa ${comillas(otro.nombre)} (${donde}) de la misma disciplina y sucursal. Si son opciones entre las que la familia elige, escribe Sí en «Alternativa para la misma edad» en AMBOS programas; si no, ajusta las edades`);
    }
  }

  function verificarChoques(): void {
    const franjaDe = new WeakMap<Franja, VFranja>();
    const grupoDe = new Map<string, VGrupo>();
    const ocupaciones: OcupacionDeGrupo[] = [];
    for (const g of grupos) {
      if (!g.activo) continue;
      const franjas = g.franjas.map((v) => {
        const fr: Franja = { dia: v.dia, inicioMin: v.inicioMin, finMin: v.finMin };
        franjaDe.set(fr, v);
        return fr;
      });
      grupoDe.set(g.ref, g);
      ocupaciones.push({ grupoId: g.ref, grupoNombre: g.nombre, salonId: g.salonRef, instructorId: g.instructorRef, franjas });
    }
    const dichos = new Set<string>();
    for (const c of detectarChoques(ocupaciones)) {
      const a = grupoDe.get(c.grupoId)!;
      const b = grupoDe.get(c.otroGrupoId)!;
      const lados = [
        { g: a, otro: b, franja: franjaDe.get(c.franja)!, otraFranja: c.otraFranja },
        { g: b, otro: a, franja: franjaDe.get(c.otraFranja)!, otraFranja: c.franja },
      ].filter((l) => l.franja.fila !== null || (c.tipo === "salon" ? l.g.cambioSalon : l.g.cambioInstructor));
      if (lados.length === 0) continue;
      const culpable = lados.sort((x, y) => (y.franja.fila ?? y.g.fila ?? 0) - (x.franja.fila ?? x.g.fila ?? 0))[0]!;
      const recurso = c.tipo === "salon" ? `el salón ${comillas(salonPorRef.get(culpable.g.salonRef ?? "")?.nombre ?? "")}` : `${comillas(instrPorRef.get(culpable.g.instructorRef ?? "")?.nombre ?? "")}`;
      const verbo = c.tipo === "salon" ? "ya está ocupado" : "ya da otra clase";
      const mensaje = `${recurso} ${verbo} con el grupo ${comillas(culpable.otro.nombre)} el ${franjaTexto(culpable.otraFranja)}, y este grupo (${comillas(culpable.g.nombre)}) tiene clase ${franjaTexto(culpable.franja)}. Cambia el horario${c.tipo === "salon" ? " o el salón" : " o el instructor"}`;
      if (culpable.franja.fila !== null) {
        const llave = `h|${culpable.franja.fila}|${mensaje}`;
        if (!dichos.has(llave)) error("horarios", culpable.franja.fila, "inicio", mensaje);
        dichos.add(llave);
      } else if (culpable.g.fila !== null) {
        const llave = `g|${culpable.g.fila}|${mensaje}`;
        if (!dichos.has(llave)) error("grupos", culpable.g.fila, c.tipo === "salon" ? "salon" : "instructor", mensaje);
        dichos.add(llave);
      }
    }
  }

  // Los errores salen en el orden de los archivos y de las filas.
  const orden = (p: Problema): number => TIPOS.indexOf(p.tipo ?? "disciplinas");
  const porLugar = (x: Problema, y: Problema): number => orden(x) - orden(y) || (x.fila ?? 0) - (y.fila ?? 0);
  errores.sort(porLugar);
  avisos.sort(porLugar);
  return { errores, avisos, ops, resumen, cambios };
}
