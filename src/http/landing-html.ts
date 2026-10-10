// HTML de la landing pública (E1): una página sobria, accesible y primero celular, sin dependencias. Todo lo que se refleja (valores del formulario,
// parámetros de la URL, nombres y textos de las tablas) pasa por `escapar()`; los colores y el logo se validan antes de llegar aquí. Los textos
// fijos son genéricos: el nombre de la vertical, sus colores, las sucursales y el aviso de privacidad salen de las tablas.

import type { ErroresDelEnvio, Landing, ParametrosDeLanding } from "../captacion/landing.ts";

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

/** Blanco o casi negro, según cuál contrasta mejor con el color de marca (luminancia relativa, WCAG). */
export function colorSobre(fondo: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(fondo.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.4 ? "#111111" : "#ffffff";
}

export interface ValoresDelFormulario {
  nombre_alumno?: string;
  edad?: string;
  sucursal_id?: string;
  telefono?: string;
  nombre_contacto?: string;
}

/** Las dos fuentes del sistema visual, desde el propio origen (`web/public/fuentes`): la política de seguridad de la página solo permite `font-src 'self'`. */
const FUENTES = `
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url("/fuentes/figtree-latin-ext-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url("/fuentes/figtree-latin-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Bricolage Grotesque"; font-style: normal; font-weight: 200 800; font-display: swap; src: url("/fuentes/bricolage-grotesque-latin-ext-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Bricolage Grotesque"; font-style: normal; font-weight: 200 800; font-display: swap; src: url("/fuentes/bricolage-grotesque-latin-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
`;

/** Las variables de color del sistema visual (docs/diseno/SISTEMA-VISUAL.md) y la de marca de la escuela, que sale de la tabla. */
const VARIABLES = (marca: string, sobre: string): string =>
  `:root { color-scheme: light; --marca: ${marca}; --sobre-marca: ${sobre}; --texto: #171a2c; --texto-suave: #5a6074; --texto-medio: #454b60; --fondo: #f3f4f8; --superficie: #ffffff; --borde: #dee1ea; --borde-campo: #8e95aa; --error: #b3261e; --error-suave: #fdecea; --foco: #3a32d1; --fuente-texto: "Figtree", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --fuente-titulo: "Bricolage Grotesque", "Figtree", system-ui, sans-serif; }`;

const ESTILOS = (marca: string, sobre: string): string => `${FUENTES}
${VARIABLES(marca, sobre)}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: var(--fuente-texto); font-size: .9375rem; line-height: 1.375rem; color: var(--texto); background: var(--fondo); -webkit-font-smoothing: antialiased; }
main { max-width: 32rem; margin: 0 auto; padding: 1rem 1rem 3rem; display: flex; flex-direction: column; gap: 1.25rem; }
header { display: flex; align-items: center; gap: .75rem; padding: .75rem 0 0; }
header img { max-height: 3rem; max-width: 8rem; object-fit: contain; }
.monograma { flex: none; display: flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border-radius: .75rem; background: var(--marca); color: var(--sobre-marca); font-family: var(--fuente-titulo); font-weight: 700; }
h1 { font-family: var(--fuente-titulo); font-weight: 700; font-size: 1.375rem; line-height: 1.75rem; letter-spacing: -.01em; margin: 0; }
p.lead { margin: 0; font-family: var(--fuente-titulo); font-weight: 700; font-size: 2.125rem; line-height: 2.375rem; letter-spacing: -.01em; }
.panel { background: var(--superficie); border: 1px solid var(--borde); border-radius: 1rem; padding: 1.25rem; }
form { display: grid; gap: 1rem; }
label, legend { display: block; font-size: .8125rem; line-height: 1.125rem; font-weight: 600; color: var(--texto-suave); margin-bottom: .375rem; }
.ayuda { font-weight: 400; font-size: .78125rem; line-height: 1rem; display: block; margin-top: .125rem; }
input[type=text], input[type=tel], input[type=number], select { width: 100%; min-height: 3rem; padding: 0 .75rem; font: inherit; font-size: 1rem; color: var(--texto); background: var(--superficie); border: 1px solid var(--borde-campo); border-radius: .625rem; }
input:focus-visible, select:focus-visible, button:focus-visible, summary:focus-visible, a:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }
.campo.con-error input, .campo.con-error select { border: 2px solid var(--error); padding: 0 calc(.75rem - 1px); }
.error { color: var(--error); font-size: .78125rem; line-height: 1rem; margin: .375rem 0 0; font-weight: 600; }
.resumen-errores { border: 1px solid var(--error); border-left-width: 4px; background: var(--error-suave); border-radius: .75rem; padding: .75rem 1rem; color: var(--error); }
.resumen-errores h2 { font-size: 1rem; line-height: 1.375rem; margin: 0 0 .25rem; }
.resumen-errores ul { margin: 0; padding-left: 1.2rem; }
.resumen-errores a { color: inherit; font-weight: 700; }
details { background: var(--fondo); border-radius: .75rem; padding: .25rem .875rem; }
details summary { cursor: pointer; font-weight: 700; min-height: 2.75rem; display: flex; align-items: center; }
details .texto { white-space: pre-wrap; margin: 0 0 .75rem; max-height: 14rem; overflow: auto; }
.acepto { display: flex; gap: .625rem; align-items: flex-start; font-weight: 500; font-size: inherit; line-height: inherit; color: var(--texto); }
.acepto input { width: 1.25rem; height: 1.25rem; margin: .125rem 0 0; flex: none; accent-color: var(--marca); }
button { min-height: 3.25rem; padding: 0 1.25rem; font: inherit; font-size: 1rem; font-weight: 700; color: var(--sobre-marca); background: var(--marca); border: 0; border-radius: .75rem; cursor: pointer; width: 100%; }
button[disabled] { opacity: .6; cursor: progress; }
.trampa { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

interface Opciones {
  nonce: string;
}

function cabecera(l: Landing, titulo: string, o: Opciones, cuerpo: string): string {
  const marca = l.colorMarca ?? COLOR_POR_OMISION;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapar(titulo)}</title>
<style nonce="${escapar(o.nonce)}">${ESTILOS(marca, colorSobre(marca))}</style>
</head>
<body>
<main>
<header>${l.logoUrl ? `<img src="${escapar(l.logoUrl)}" alt="">` : `<span class="monograma" aria-hidden="true">${escapar(iniciales(l.nombre))}</span>`}<h1>${escapar(l.nombre)}</h1></header>
${cuerpo}
</main>
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

/** El formulario. `errores` y `valores` (de un envío anterior que falló) se repintan escapados. */
export function paginaDeFormulario(l: Landing, p: ParametrosDeLanding, o: Opciones, errores: ErroresDelEnvio | null = null, valores: ValoresDelFormulario = {}): string {
  const avisos = l.aviso!;
  const err = (campo: keyof ErroresDelEnvio["campos"]): string | undefined => errores?.campos[campo];
  const hayErrores = errores !== null && (Object.keys(errores.campos).length > 0 || errores.general);
  const campo = (id: keyof ErroresDelEnvio["campos"], etiqueta: string, control: string, ayuda?: string): string =>
    `<div class="campo${err(id) ? " con-error" : ""}"><label for="${id}">${etiqueta}${ayuda ? `<span class="ayuda">${escapar(ayuda)}</span>` : ""}</label>${control}${err(id) ? `<p class="error" id="${id}-error">${escapar(err(id))}</p>` : ""}</div>`;
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
  const cuerpo = `<p class="lead">Déjanos unos datos y te escribimos por WhatsApp con horarios y costos.</p>
${resumen}
<form method="post" novalidate class="panel">
${campo("nombre_alumno", "¿Quién tomará la clase?", `<input type="text" id="nombre_alumno" name="nombre_alumno" maxlength="120" required autocomplete="off" value="${escapar(valores.nombre_alumno ?? "")}"${atributos("nombre_alumno")}>`, "Nombre de la persona que va a clase")}
${campo("edad", "Edad", `<input type="number" id="edad" name="edad" inputmode="numeric" min="1" max="99" required value="${escapar(valores.edad ?? "")}"${atributos("edad")}>`, "En años")}
${sucursales}
${campo("telefono", "Tu teléfono de contacto", `<input type="tel" id="telefono" name="telefono" inputmode="tel" autocomplete="tel" maxlength="30" required value="${escapar(valores.telefono ?? "")}"${atributos("telefono")}>`, "Con lada, por ejemplo 55 1234 5678")}
${campo("nombre_contacto", "Tu nombre (opcional)", `<input type="text" id="nombre_contacto" name="nombre_contacto" maxlength="120" autocomplete="name" value="${escapar(valores.nombre_contacto ?? "")}"${atributos("nombre_contacto")}>`)}
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
<button type="submit" id="enviar">Enviar y continuar a WhatsApp</button>
</form>
<script nonce="${escapar(o.nonce)}">
(function () {
  var f = document.querySelector("form");
  var b = document.getElementById("enviar");
  var texto = b.textContent;
  f.addEventListener("submit", function () { b.disabled = true; b.textContent = "Enviando…"; });
  // Al volver con «atrás» desde WhatsApp el navegador restaura la página tal como quedó (EE-17): el botón vuelve a estar disponible.
  window.addEventListener("pageshow", function (e) { if (e.persisted) { b.disabled = false; b.textContent = texto; } });
  var r = document.getElementById("resumen");
  if (r) r.focus();
})();
</script>`;
  return cabecera(l, `${l.nombre}: pide información`, o, cuerpo);
}

/** Cuando no hay un número de WhatsApp al cual mandar a la persona: gracias y listo. */
export function paginaDeGracias(l: Landing, o: Opciones): string {
  return cabecera(l, `${l.nombre}: gracias`, o, `<p class="lead" role="status">¡Gracias! Recibimos tus datos. Un asesor te contactará muy pronto.</p>`);
}

/** Una página de error mínima, igual para «no existe» y «ambigua» (sin revelar nada). */
export function paginaDeError(titulo: string, mensaje: string, o: Opciones): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapar(titulo)}</title>
<style nonce="${escapar(o.nonce)}">${ESTILOS(COLOR_POR_OMISION, "#ffffff")}</style></head>
<body><main><div class="panel"><h1>${escapar(titulo)}</h1><p>${escapar(mensaje)}</p></div></main></body>
</html>
`;
}
