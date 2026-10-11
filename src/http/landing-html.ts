// HTML de la landing pública (E1, rediseñada en R8b según `Pagina-captacion.dc.html`): una página accesible y primero celular, sin dependencias ni base.css (la sirve el
// backend, no la aplicación React). Todo lo que se refleja (valores del formulario, parámetros de la URL, nombres y textos de las tablas) pasa por `escapar()`; los colores
// y el logo se validan antes de llegar aquí. Los textos fijos son genéricos: el nombre de la vertical y de la escuela, sus colores, las sucursales, las edades de las
// tarjetas y el aviso de privacidad salen de las tablas (invariante 2). Los colores de cada disciplina salen de `color_marca` (un `--disciplina` por tarjeta) y el tono
// suave y la tinta se derivan con oklch, como en `web/src/estilos/base.css`: nunca un mapa por nombre. Las fotos son espacios marcados (la escuela pone las suyas).

import type { DisciplinaPublica, ErroresDelEnvio, Landing, ParametrosDeLanding } from "../captacion/landing.ts";

/** Escapa para texto y atributos HTML. */
export function escapar(valor: unknown): string {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Las iniciales de un nombre (hasta dos letras, sin «de», «la»…): «Escuela de prueba» → «EP». */
export function iniciales(nombre: string): string {
  const menores = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);
  const palabras = nombre.split(/\s+/).filter((p) => p !== "");
  const utiles = palabras.filter((p) => !menores.has(p.toLowerCase()));
  return (utiles.length > 0 ? utiles : palabras).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

const COLOR_POR_OMISION = "#3a32d1";

/** Blanco o casi negro, el que más contraste dé con el color de marca (contraste WCAG: con cualquier color pasa de 4.5:1, AA para texto). */
export function colorSobre(fondo: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(fondo.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminancia + 0.05) >= (luminancia + 0.05) / 0.0556 ? "#ffffff" : "#111111";
}

export interface ValoresDelFormulario {
  nombre_alumno?: string;
  edad?: string;
  sucursal_id?: string;
  telefono?: string;
  nombre_contacto?: string;
  /** R8b: «¿Para quién es la clase?» (`hijo` o `yo`); solo cambia los textos de la página. */
  para_quien?: string;
}

/** Las dos fuentes del sistema visual, desde el propio origen (`web/public/fuentes`): la política de seguridad de la página solo permite `font-src 'self'`. */
const FUENTES = `
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url("/fuentes/figtree-latin-ext-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url("/fuentes/figtree-latin-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Bricolage Grotesque"; font-style: normal; font-weight: 200 800; font-display: swap; src: url("/fuentes/bricolage-grotesque-latin-ext-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Bricolage Grotesque"; font-style: normal; font-weight: 200 800; font-display: swap; src: url("/fuentes/bricolage-grotesque-latin-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
`;

/** Las variables del sistema visual (docs/diseno/SISTEMA-VISUAL.md y README «Tokens» del handoff) y la de marca de la escuela, que sale de la tabla. Una sola línea: es la única que lleva colores. */
const VARIABLES = (marca: string, sobre: string): string =>
  `:root { color-scheme: light; --marca: ${marca}; --sobre-marca: ${sobre}; --texto: #171a2c; --texto-suave: #5a6074; --texto-medio: #454b60; --fondo: #f3f4f8; --superficie: #ffffff; --borde: #dee1ea; --borde-campo: #8e95aa; --borde-boton: #c5cad8; --columna: #e7e9f1; --etiqueta: #ecedf3; --etiqueta-texto: #3a3f52; --primario-suave: #ecebfc; --primario-fuerte: #2b2699; --lateral: #171a2c; --lateral-texto: #c9cde0; --peligro: #b3261e; --peligro-suave: #fdecea; --exito: #17603a; --exito-suave: #e1f3e7; --deshabilitado-texto: #6b7085; --foco: #3a32d1; --sombra-tarjeta: 0 1px 2px rgb(23 26 44 / 8%), 0 2px 6px -2px rgb(23 26 44 / 10%); --sombra-tarjeta-hover: 0 10px 24px -8px rgb(23 26 44 / 30%); --sombra-segmento: 0 1px 2px rgb(23 26 44 / 16%); --radio: 10px; --radio-campo: 12px; --radio-boton: 14px; --radio-tarjeta: 20px; --radio-foto: 24px; --radio-segmento: 9px; --radio-pildora: 999px; --radio-marca: 12px; --radio-etiqueta: 6px; --alto-toque: 2.75rem; --alto-campo: 3rem; --curva: cubic-bezier(.2, .8, .2, 1); --fuente-texto: "Figtree", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --fuente-titulo: "Bricolage Grotesque", "Figtree", system-ui, sans-serif; --fuente-marcador: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; --margen: clamp(16px, 4vw, 48px); }`;

/** Tono suave y tinta de cada disciplina, derivados de su color con oklch (como `[data-disciplina]` en base.css); sin soporte, el neutro del sistema. */
const DERIVADOS = `.disc { --disciplina: var(--texto-suave); --disciplina-suave: var(--etiqueta); --disciplina-tinta: var(--etiqueta-texto); } @supports (color: oklch(from red l c h)) { .disc { --disciplina-suave: oklch(from var(--disciplina) 0.95 0.035 h); --disciplina-tinta: oklch(from var(--disciplina) 0.44 0.13 h); } }`;

const ESTILOS = (marca: string, sobre: string, disciplinas: readonly DisciplinaPublica[] = []): string => `${FUENTES}
${VARIABLES(marca, sobre)}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body { margin: 0; font-family: var(--fuente-texto); font-size: 1rem; line-height: 1.5rem; color: var(--texto); background: var(--superficie); -webkit-font-smoothing: antialiased; }
a { color: var(--primario-fuerte); text-decoration: none; }
a:hover { color: var(--texto); }
button, input, select { font: inherit; }
:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }
.solo-lectores { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 18px var(--margen); border-bottom: 1px solid var(--borde); }
.marca-bloque { display: flex; align-items: center; gap: 12px; min-width: 0; }
.marca-bloque img { max-height: 2.625rem; max-width: 8rem; object-fit: contain; }
.monograma { flex: none; display: flex; align-items: center; justify-content: center; width: 2.625rem; height: 2.625rem; border-radius: var(--radio-marca); background: var(--marca); color: var(--sobre-marca); font-family: var(--fuente-titulo); font-weight: 700; }
.marca-texto { display: flex; flex-direction: column; min-width: 0; }
.marca-texto strong { font-size: 1.0625rem; line-height: 1.375rem; }
.marca-texto span { color: var(--texto-suave); font-size: .8125rem; line-height: 1.125rem; }
.enlace-claro { display: inline-flex; align-items: center; min-height: var(--alto-toque); padding: 0 16px; background: var(--primario-suave); color: var(--primario-fuerte); border-radius: var(--radio); font-weight: 700; transition: background-color 120ms var(--curva); }
.enlace-claro:hover { color: var(--primario-fuerte); }
.heroe { display: flex; flex-wrap: wrap; align-items: center; gap: 32px; padding: clamp(28px, 5vw, 64px) var(--margen); }
.heroe-texto { flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
.franjas { display: flex; gap: 8px; }
.franjas span { width: 40px; height: 6px; border-radius: 3px; background: var(--disciplina, var(--marca)); }
h1 { font-family: var(--fuente-titulo); font-weight: 700; margin: 0; }
.heroe h1 { font-size: clamp(36px, 5vw, 58px); line-height: 1.04; letter-spacing: -.025em; text-wrap: balance; overflow-wrap: anywhere; }
.sub-heroe { margin: 0; color: var(--texto-medio); font-size: 1.1875rem; line-height: 1.75rem; max-width: 46ch; }
.boton-principal { display: inline-flex; align-items: center; justify-content: center; min-height: 3.5rem; padding: 0 24px; background: var(--marca); color: var(--sobre-marca); border: 0; border-radius: var(--radio-boton); font-size: 1.0625rem; font-weight: 700; cursor: pointer; transition: transform 120ms var(--curva), box-shadow 120ms var(--curva); }
.boton-principal:hover { color: var(--sobre-marca); box-shadow: var(--sombra-tarjeta-hover); transform: translateY(-1px); }
.heroe .boton-principal { align-self: flex-start; }
.foto-marcador { display: flex; align-items: flex-end; padding: 18px; background: repeating-linear-gradient(135deg, var(--fondo) 0 12px, var(--etiqueta) 12px 24px); }
.foto-marcador span { font-family: var(--fuente-marcador); font-size: .8125rem; line-height: 1.125rem; color: var(--texto-medio); background: var(--superficie); padding: 4px 10px; border-radius: var(--radio-etiqueta); overflow-wrap: anywhere; }
.heroe .foto-marcador { flex: 1 1 360px; min-height: 340px; border-radius: var(--radio-foto); }
.disciplinas { padding: 0 var(--margen) 48px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px; }
.disciplinas:has(> :only-child) { grid-template-columns: minmax(0, 28rem); }
.tarjeta-disc { display: flex; flex-direction: column; border: 1px solid var(--borde); border-radius: var(--radio-tarjeta); overflow: hidden; color: var(--texto); background: var(--superficie); box-shadow: var(--sombra-tarjeta); transition: transform 120ms var(--curva), box-shadow 120ms var(--curva); }
.tarjeta-disc:hover { color: var(--texto); box-shadow: var(--sombra-tarjeta-hover); transform: translateY(-1px); }
.tarjeta-disc[aria-current="true"] { border: 2px solid var(--disciplina); }
.tarjeta-disc .foto-marcador { height: 160px; padding: 12px; background: repeating-linear-gradient(135deg, var(--disciplina-suave) 0 10px, var(--superficie) 10px 20px); }
.tarjeta-disc .foto-marcador span { font-size: .75rem; padding: 3px 8px; }
.tarjeta-disc .banda { height: 6px; background: var(--disciplina); }
.tarjeta-cuerpo { padding: 18px 20px 22px; display: flex; flex-direction: column; gap: 8px; }
.tarjeta-cuerpo h2 { margin: 0; font-family: var(--fuente-titulo); font-weight: 700; font-size: 1.625rem; line-height: 1.875rem; overflow-wrap: anywhere; }
.tarjeta-cuerpo p { margin: 0; color: var(--texto-medio); }
.edades { color: var(--disciplina-tinta); font-weight: 700; }
.accion-tarjeta { display: inline-flex; align-items: center; gap: 6px; min-height: var(--alto-toque); margin-top: 4px; color: var(--primario-fuerte); font-weight: 700; }
.accion-tarjeta svg { flex: none; }
.pide { scroll-margin-top: 0; padding: clamp(28px, 5vw, 56px) var(--margen); background: var(--lateral); display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
.pide-texto { flex: 1 1 320px; color: var(--superficie); display: flex; flex-direction: column; gap: 12px; }
.pide-texto h2 { margin: 0; font-family: var(--fuente-titulo); font-weight: 700; font-size: clamp(30px, 4vw, 42px); line-height: 1.1; letter-spacing: -.02em; }
.pide-texto p { margin: 0; color: var(--lateral-texto); font-size: 1.0625rem; line-height: 1.625rem; max-width: 42ch; }
.panel-form { flex: 1 1 420px; min-width: 0; background: var(--superficie); border-radius: var(--radio-tarjeta); padding: 22px; }
.panel { background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio-tarjeta); padding: 1.25rem; }
.una-columna { max-width: 32rem; margin: 0 auto; padding: 1rem 1rem 3rem; }
.una-columna h1 { font-size: 1.375rem; line-height: 1.75rem; letter-spacing: -.01em; margin-bottom: .5rem; }
form { display: flex; flex-direction: column; gap: 14px; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
label, legend, .etiqueta { display: block; padding: 0; font-size: .8125rem; line-height: 1.125rem; font-weight: 600; color: var(--texto-medio); margin-bottom: 6px; }
.ayuda { font-weight: 400; font-size: .78125rem; line-height: 1rem; display: block; margin-top: 2px; color: var(--texto-suave); }
.fila-dos { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; align-items: end; }
.fila-nino { display: grid; grid-template-columns: minmax(0, 1fr) 7.5rem; gap: 12px; }
input[type=text], input[type=tel], input[type=number], select { width: 100%; min-height: var(--alto-campo); padding: 0 12px; font-size: 1rem; color: var(--texto); background: var(--superficie); border: 1px solid var(--borde-campo); border-radius: var(--radio-campo); }
input[type=tel] { font-variant-numeric: tabular-nums; }
.campo.con-error input, .campo.con-error select { border: 2px solid var(--peligro); padding: 0 11px; }
.error { color: var(--peligro); font-size: .8125rem; line-height: 1.125rem; margin: 6px 0 0; font-weight: 600; }
.resumen-errores { border: 1px solid var(--peligro); background: var(--peligro-suave); border-radius: var(--radio-campo); padding: 12px 16px; color: var(--peligro); margin-bottom: 14px; }
.resumen-errores:focus { outline: none; }
.resumen-errores:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }
.resumen-errores h2 { font-size: 1rem; line-height: 1.375rem; margin: 0 0 4px; }
.resumen-errores ul { margin: 0; padding-left: 1.2rem; }
.resumen-errores a { color: inherit; font-weight: 700; text-decoration: underline; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 8px; min-height: var(--alto-toque); padding: 0 14px; background: var(--superficie); color: var(--texto); border: 1px solid var(--borde-boton); border-radius: var(--radio-pildora); font-weight: 700; transition: background-color 120ms var(--curva); }
.chip:hover { color: var(--texto); background: var(--fondo); }
.chip .punto { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--disciplina); }
.chip svg { display: none; flex: none; }
.chip[aria-current="true"] { background: var(--disciplina-suave); color: var(--disciplina-tinta); border: 2px solid var(--disciplina); padding: 0 13px; }
.chip[aria-current="true"] svg { display: block; }
.segmentos { display: flex; padding: 4px; background: var(--columna); border-radius: var(--radio-campo); }
.segmento { position: relative; flex: 1 1 0; display: flex; margin: 0; padding: 0; }
.segmento input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.segmento span { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: var(--alto-toque); padding: 0 8px; text-align: center; border-radius: var(--radio-segmento); font-weight: 600; color: var(--texto); transition: background-color 120ms var(--curva); }
.segmento input:checked + span { background: var(--superficie); font-weight: 700; box-shadow: var(--sombra-segmento); }
.segmento input:checked + span::before { content: "\\2713"; font-weight: 700; }
.segmento input:focus-visible + span { outline: 2px solid var(--foco); outline-offset: 2px; }
details { background: var(--fondo); border-radius: var(--radio-campo); padding: 4px 14px; }
details summary { cursor: pointer; font-weight: 700; min-height: var(--alto-toque); display: flex; align-items: center; justify-content: space-between; gap: 12px; list-style: none; }
details summary::-webkit-details-marker { display: none; }
details summary::after { content: ""; flex: none; width: .5rem; height: .5rem; margin: -.25rem .25rem 0 0; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); }
details[open] summary::after { margin-top: .25rem; transform: rotate(-135deg); }
details .texto { white-space: pre-wrap; margin: 0 0 12px; max-height: 14rem; overflow: auto; }
.acepto { display: flex; gap: 10px; align-items: center; min-height: var(--alto-toque); margin: 0; font-weight: 500; font-size: inherit; line-height: inherit; color: var(--texto); }
.acepto input { width: 1.25rem; height: 1.25rem; margin: 0; flex: none; accent-color: var(--foco); }
form .boton-principal { width: 100%; }
form .boton-principal[disabled] { background: var(--fondo); color: var(--deshabilitado-texto); border: 1px solid var(--borde); cursor: progress; box-shadow: none; transform: none; }
.legal { margin: 0; color: var(--texto-suave); font-size: .8125rem; line-height: 1.125rem; }
.trampa { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
.gracias { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; padding: clamp(28px, 5vw, 64px) var(--margen) 48px; max-width: 40rem; animation: aparece 180ms var(--curva); }
.gracias .sello { display: flex; align-items: center; justify-content: center; width: 3.5rem; height: 3.5rem; border-radius: 50%; background: var(--exito-suave); color: var(--exito); }
.gracias h2 { margin: 0; font-family: var(--fuente-titulo); font-weight: 700; font-size: 1.625rem; line-height: 1.875rem; }
.gracias p { margin: 0; color: var(--texto-medio); font-size: 1.0625rem; line-height: 1.625rem; }
.pie { padding: 20px var(--margen); color: var(--texto-suave); font-size: .875rem; line-height: 1.25rem; }
@keyframes aparece { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (max-width: 520px) { .heroe .foto-marcador { min-height: 220px; } .panel-form { padding: 16px; } .boton-principal, .enlace-claro { min-height: 3.25rem; } .enlace-claro { min-height: var(--alto-toque); } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }
${DERIVADOS}
${disciplinas.map((d, i) => (d.colorMarca ? `.d-${i} { --disciplina: ${d.colorMarca}; }` : "")).join("\n")}
`;

interface Opciones {
  nonce: string;
}

const ICONO_PALOMITA = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"></path></svg>`;
const ICONO_FLECHA = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 10h10M11 6l4 4-4 4"></path></svg>`;

/** Las disciplinas de la página: las publicables de la escuela o, si no hay datos (una página armada a mano), solo esta. */
function disciplinasDe(l: Landing): DisciplinaPublica[] {
  const lista: DisciplinaPublica[] = l.disciplinas && l.disciplinas.length > 0 ? l.disciplinas : [{ slug: "", nombre: l.nombre, colorMarca: l.colorMarca, esActual: true, edadMin: null, edadMax: null, sucursales: [] }];
  // La de esta página sin color propio toma el de marca de la página (el primario del sistema si tampoco lo hay).
  return lista.map((d) => (d.esActual && !d.colorMarca ? { ...d, colorMarca: l.colorMarca ?? COLOR_POR_OMISION } : d));
}

function cabecera(l: Landing, titulo: string, o: Opciones, cuerpo: string, opciones: { pide?: boolean; pie?: boolean; disciplinas?: readonly DisciplinaPublica[] } = {}): string {
  const marca = l.colorMarca ?? COLOR_POR_OMISION;
  const escuela = l.organizacionNombre ?? l.nombre;
  const sedes = (l.sedes ?? []).map((s) => s.nombre);
  const logo = l.logoUrl ? `<img src="${escapar(l.logoUrl)}" alt="">` : `<span class="monograma" aria-hidden="true">${escapar(iniciales(escuela))}</span>`;
  const direcciones = (l.sedes ?? []).map((s) => s.direccion).filter((d): d is string => !!d);
  const pie = opciones.pie === false ? "" : `\n<footer class="pie">${[escuela, ...(direcciones.length > 0 ? direcciones : sedes)].map(escapar).join(" · ")}</footer>`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapar(titulo)}</title>
<style nonce="${escapar(o.nonce)}">${ESTILOS(marca, colorSobre(marca), opciones.disciplinas ?? [])}</style>
</head>
<body>
<header class="barra"><div class="marca-bloque">${logo}<span class="marca-texto"><strong>${escapar(escuela)}</strong>${sedes.length > 0 ? `<span>${escapar(sedes.join(" · "))}</span>` : ""}</span></div>${opciones.pide === false ? "" : `<a class="enlace-claro" href="#pide">Pide tu clase muestra</a>`}</header>
<main>
${cuerpo}
</main>${pie}
</body>
</html>
`;
}

const ETIQUETAS: Record<keyof ErroresDelEnvio["campos"], string> = {
  nombre_alumno: "nombre_alumno",
  edad: "edad",
  sucursal_id: "sucursal_id",
  telefono: "telefono",
  nombre_contacto: "nombre_contacto",
  acepta_aviso: "acepta_aviso",
};

/** El enlace a la página de otra disciplina de la misma escuela: conserva el código de campaña y los utm (la sucursal sugerida no, puede no ser de esa disciplina). */
function enlaceDeDisciplina(l: Landing, p: ParametrosDeLanding, d: DisciplinaPublica): string {
  if (d.esActual || d.slug === "") return "#pide";
  const q = new URLSearchParams();
  if (l.organizacionSlug) q.set("org", l.organizacionSlug);
  if (p.codigo) q.set("c", p.codigo);
  for (const [k, v] of Object.entries(p.utm)) q.set(k, v);
  const consulta = q.toString();
  return `/l/${encodeURIComponent(d.slug)}${consulta ? `?${consulta}` : ""}#pide`;
}

function textoDeEdades(d: DisciplinaPublica): string {
  if (d.edadMin === null || d.edadMax === null) return "";
  return d.edadMin === d.edadMax ? `${d.edadMin} años` : `De ${d.edadMin} a ${d.edadMax} años`;
}

const AYUDA_ALUMNO = { hijo: "Nombre del niño o niña", yo: "Escribe tu nombre" } as const;

/** El formulario. `errores` y `valores` (de un envío anterior que falló) se repintan escapados. */
export function paginaDeFormulario(l: Landing, p: ParametrosDeLanding, o: Opciones, errores: ErroresDelEnvio | null = null, valores: ValoresDelFormulario = {}): string {
  const avisos = l.aviso!;
  const disciplinas = disciplinasDe(l);
  const err = (campo: keyof ErroresDelEnvio["campos"]): string | undefined => errores?.campos[campo];
  const hayErrores = errores !== null && (Object.keys(errores.campos).length > 0 || errores.general);
  const para = valores.para_quien === "yo" ? "yo" : "hijo";
  const campo = (id: keyof ErroresDelEnvio["campos"], etiqueta: string, control: string, ayuda?: string, extra = ""): string =>
    `<div class="campo${err(id) ? " con-error" : ""}"${extra}><label for="${id}">${etiqueta}${ayuda ? `<span class="ayuda"${id === "nombre_alumno" ? ` id="ayuda-alumno"` : ""}>${escapar(ayuda)}</span>` : ""}</label>${control}${err(id) ? `<p class="error" id="${id}-error">${escapar(err(id))}</p>` : ""}</div>`;
  const atributos = (id: keyof ErroresDelEnvio["campos"]): string => (err(id) ? ` aria-invalid="true" aria-describedby="${id}-error"` : "");
  const sucursales =
    l.sucursales.length > 1
      ? campo(
          "sucursal_id",
          "¿En qué sucursal quieres la clase?",
          `<select id="sucursal_id" name="sucursal_id" required${atributos("sucursal_id")}><option value="">Elige una sucursal</option>${l.sucursales
            .map((s) => `<option value="${escapar(s.id)}"${(valores.sucursal_id ?? p.sucursalId) === s.id ? " selected" : ""}>${escapar(s.nombre)}</option>`)
            .join("")}</select>`,
        )
      : l.sucursales.length === 1
        ? `<input type="hidden" name="sucursal_id" value="${escapar(l.sucursales[0]!.id)}">`
        : "";
  const resumen = hayErrores
    ? `<div class="resumen-errores" role="alert" tabindex="-1" id="resumen"><h2>Revisa estos datos</h2><ul>${errores!.general ? `<li>${escapar(errores!.general)}</li>` : ""}${(Object.keys(errores!.campos) as (keyof ErroresDelEnvio["campos"])[]).map((k) => `<li><a href="#${ETIQUETAS[k]}">${escapar(errores!.campos[k])}</a></li>`).join("")}</ul></div>`
    : "";
  const ocultos = [...Object.entries(p.utm).map(([k, v]) => `<input type="hidden" name="${escapar(k)}" value="${escapar(v)}">`), p.codigo ? `<input type="hidden" name="c" value="${escapar(p.codigo)}">` : ""].join("");
  const actual = disciplinas.find((d) => d.esActual) ?? disciplinas[0]!;
  const quienes = [
    ["hijo", "Para mi hijo o hija"],
    ["yo", "Para mí"],
  ] as const;
  const elegirDisciplina =
    disciplinas.length > 1
      ? `<div><span class="etiqueta" id="etiqueta-disciplina">Disciplina</span><nav aria-labelledby="etiqueta-disciplina"><div class="chips">${disciplinas
          .map((d, i) => `<a class="chip disc d-${i}" href="${escapar(enlaceDeDisciplina(l, p, d))}"${d.esActual ? ` aria-current="true"` : ""}><span class="punto" aria-hidden="true"></span>${escapar(d.nombre)}${ICONO_PALOMITA}</a>`)
          .join("")}</div></nav></div>`
      : "";
  const tarjetas = disciplinas
    .map((d, i) => {
      const edades = textoDeEdades(d);
      return `<a class="tarjeta-disc disc d-${i}" href="${escapar(enlaceDeDisciplina(l, p, d))}"${d.esActual ? ` aria-current="true"` : ""}><div class="foto-marcador" role="img" aria-label="${escapar(`Espacio para una foto de ${d.nombre}`)}"><span>${escapar(`foto: ${d.nombre}`)}</span></div><div class="banda" aria-hidden="true"></div><div class="tarjeta-cuerpo"><h2>${escapar(d.nombre)}</h2>${edades ? `<span class="edades">${escapar(edades)}</span>` : ""}${d.sucursales.length > 0 ? `<p>${escapar(`En ${d.sucursales.join(" · ")}`)}</p>` : ""}<span class="accion-tarjeta">${d.esActual ? `${ICONO_PALOMITA}Esta es tu elección` : `Pedir informes de esta disciplina${ICONO_FLECHA}`}</span></div></a>`;
    })
    .join("");
  const franjas = disciplinas.map((_, i) => `<span class="disc d-${i}"></span>`).join("");
  const cuerpo = `<section class="heroe">
<div class="heroe-texto">
<div class="franjas" aria-hidden="true">${franjas}</div>
<h1>${escapar(l.nombre)}</h1>
<p class="sub-heroe">Cuéntanos para quién es y te escribimos por WhatsApp con los horarios que tienen lugar.</p>
<a class="boton-principal" href="#pide">Quiero mi clase muestra</a>
</div>
<div class="foto-marcador" role="img" aria-label="Espacio para una foto de clase"><span>${escapar(`foto: clase de ${actual.nombre}`)}</span></div>
</section>
<section class="disciplinas" aria-label="Disciplinas">${tarjetas}</section>
<section class="pide" id="pide">
<div class="pide-texto"><h2>Pide tu clase muestra</h2><p>Te escribimos por WhatsApp en horario de 9:00 a 20:00 con los grupos que tienen lugar para su edad.</p></div>
<div class="panel-form">
${resumen}
<form method="post" novalidate>
${elegirDisciplina}
<div class="fila-dos">
${campo("nombre_contacto", "Tu nombre (opcional)", `<input type="text" id="nombre_contacto" name="nombre_contacto" maxlength="120" autocomplete="name" value="${escapar(valores.nombre_contacto ?? "")}"${atributos("nombre_contacto")}>`, undefined, ` id="campo-contacto"${para === "yo" ? " hidden" : ""}`)}
${campo("telefono", "Tu teléfono de contacto", `<input type="tel" id="telefono" name="telefono" inputmode="tel" autocomplete="tel" maxlength="30" required placeholder="55 1234 5678" value="${escapar(valores.telefono ?? "")}"${atributos("telefono")}>`, "Con lada, por ejemplo 55 1234 5678")}
</div>
<fieldset><legend>¿Para quién es la clase?</legend><div class="segmentos">${quienes.map(([valor, texto]) => `<label class="segmento" for="para_quien_${valor}"><input type="radio" id="para_quien_${valor}" name="para_quien" value="${valor}"${para === valor ? " checked" : ""}><span>${texto}</span></label>`).join("")}</div></fieldset>
<div class="fila-nino">
${campo("nombre_alumno", "¿Quién tomará la clase?", `<input type="text" id="nombre_alumno" name="nombre_alumno" maxlength="120" required autocomplete="off" value="${escapar(valores.nombre_alumno ?? "")}"${atributos("nombre_alumno")}>`, AYUDA_ALUMNO[para])}
${campo("edad", "Edad", `<input type="number" id="edad" name="edad" inputmode="numeric" min="1" max="99" required value="${escapar(valores.edad ?? "")}"${atributos("edad")}>`, "En años")}
</div>
${sucursales}
<details>
<summary>${escapar(avisos.titulo)}</summary>
<div class="texto">${escapar(avisos.texto)}</div>
</details>
<div class="campo${err("acepta_aviso") ? " con-error" : ""}">
<label class="acepto" for="acepta_aviso"><input type="checkbox" id="acepta_aviso" name="acepta_aviso" value="on" required${atributos("acepta_aviso")}><span>He leído y acepto el ${escapar(avisos.titulo.toLowerCase())}.</span></label>
${err("acepta_aviso") ? `<p class="error" id="acepta_aviso-error">${escapar(err("acepta_aviso"))}</p>` : ""}
</div>
<input type="hidden" name="documento_id" value="${escapar(avisos.id)}">
<input type="hidden" name="version" value="${escapar(avisos.version)}">
${ocultos}
<div class="trampa" aria-hidden="true"><label for="sitio_web">No llenes este campo</label><input type="text" id="sitio_web" name="sitio_web" tabindex="-1" autocomplete="off"></div>
<button type="submit" id="enviar" class="boton-principal">Enviar y continuar a WhatsApp</button>
<p class="legal">Solo usamos tu número para darte informes; puedes pedir que no te escribamos más en cualquier momento.</p>
<p class="solo-lectores" role="status" id="estado-envio"></p>
</form>
</div>
</section>
<script nonce="${escapar(o.nonce)}">
(function () {
  var f = document.querySelector("form");
  var b = document.getElementById("enviar");
  var texto = b.textContent;
  var estado = document.getElementById("estado-envio");
  var ayudas = ${JSON.stringify(AYUDA_ALUMNO)};
  function aplicarPara() {
    var yo = f.elements["para_quien"].value === "yo";
    document.getElementById("campo-contacto").hidden = yo;
    document.getElementById("ayuda-alumno").textContent = yo ? ayudas.yo : ayudas.hijo;
  }
  var radios = f.querySelectorAll("input[name=para_quien]");
  for (var i = 0; i < radios.length; i++) radios[i].addEventListener("change", aplicarPara);
  aplicarPara();
  f.addEventListener("submit", function () {
    // «Para mí»: quien escribe es quien toma la clase; su nombre también es el del contacto.
    var c = document.getElementById("nombre_contacto");
    if (f.elements["para_quien"].value === "yo" && c.value.trim() === "") c.value = document.getElementById("nombre_alumno").value;
    b.disabled = true;
    b.textContent = "Enviando…";
    estado.textContent = "Enviando…";
  });
  // Al volver con «atrás» desde WhatsApp el navegador restaura la página tal como quedó (EE-17): el botón vuelve a estar disponible.
  window.addEventListener("pageshow", function (e) { if (e.persisted) { b.disabled = false; b.textContent = texto; estado.textContent = ""; aplicarPara(); } });
  var r = document.getElementById("resumen");
  if (r) r.focus();
})();
</script>`;
  return cabecera(l, `${l.nombre}: pide información`, o, cuerpo, { disciplinas });
}

/** Cuando no hay un número de WhatsApp al cual mandar a la persona: gracias y listo. `nombreContacto` (opcional) saluda por su nombre. */
export function paginaDeGracias(l: Landing, o: Opciones, nombreContacto?: string | null): string {
  const primero = (nombreContacto ?? "").trim().split(/\s+/)[0] ?? "";
  const cuerpo = `<div class="gracias" role="status"><span class="sello" aria-hidden="true">${ICONO_PALOMITA.replace('width="20" height="20"', 'width="28" height="28"')}</span><h1>${escapar(primero ? `Listo, ${primero}` : "Listo")}</h1><p>¡Gracias! Recibimos tus datos. Un asesor te contactará muy pronto.</p></div>`;
  return cabecera(l, `${l.nombre}: gracias`, o, cuerpo, { pide: false });
}

/** Una página de error mínima, igual para «no existe» y «ambigua» (sin revelar nada). */
export function paginaDeError(titulo: string, mensaje: string, o: Opciones): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapar(titulo)}</title>
<style nonce="${escapar(o.nonce)}">${ESTILOS(COLOR_POR_OMISION, "#ffffff")}</style></head>
<body><main class="una-columna"><div class="panel"><h1>${escapar(titulo)}</h1><p>${escapar(mensaje)}</p></div></main></body>
</html>
`;
}
