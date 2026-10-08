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

const COLOR_POR_OMISION = "#1f4e79";

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

const ESTILOS = (marca: string, sobre: string): string => `
:root { --marca: ${marca}; --sobre-marca: ${sobre}; --texto: #1d1d1f; --fondo: #ffffff; --suave: #f4f5f7; --borde: #8a8f98; --error: #b00020; }
@media (prefers-color-scheme: dark) { :root { --texto: #f2f2f3; --fondo: #17181a; --suave: #212326; --borde: #8f949c; --error: #ff8a9a; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--texto); background: var(--fondo); }
main { max-width: 32rem; margin: 0 auto; padding: 1rem 1rem 3rem; }
header { display: flex; align-items: center; gap: .75rem; padding: .5rem 0 1rem; border-bottom: 4px solid var(--marca); margin-bottom: 1rem; }
header img { max-height: 3rem; max-width: 8rem; object-fit: contain; }
h1 { font-size: 1.4rem; line-height: 1.25; margin: 0; }
p.lead { margin: 0 0 1rem; }
form { display: grid; gap: 1rem; }
label, legend { display: block; font-weight: 600; margin-bottom: .25rem; }
.ayuda { font-weight: 400; font-size: .9rem; opacity: .85; display: block; }
input[type=text], input[type=tel], input[type=number], select { width: 100%; min-height: 2.75rem; padding: .5rem .75rem; font: inherit; color: inherit; background: var(--fondo); border: 2px solid var(--borde); border-radius: .5rem; }
input:focus-visible, select:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid var(--marca); outline-offset: 2px; }
.campo.con-error input, .campo.con-error select { border-color: var(--error); }
.error { color: var(--error); font-size: .95rem; margin: .25rem 0 0; font-weight: 600; }
.resumen-errores { border: 2px solid var(--error); border-radius: .5rem; padding: .75rem 1rem; }
.resumen-errores h2 { font-size: 1rem; margin: 0 0 .25rem; color: var(--error); }
.resumen-errores ul { margin: 0; padding-left: 1.2rem; }
details { background: var(--suave); border-radius: .5rem; padding: .5rem .75rem; }
details summary { cursor: pointer; font-weight: 600; min-height: 2rem; }
details .texto { white-space: pre-wrap; margin-top: .5rem; max-height: 14rem; overflow: auto; }
.acepto { display: flex; gap: .6rem; align-items: flex-start; font-weight: 400; }
.acepto input { width: 1.4rem; height: 1.4rem; margin-top: .15rem; flex: none; }
button { min-height: 3rem; padding: .5rem 1rem; font: inherit; font-weight: 700; color: var(--sobre-marca); background: var(--marca); border: 0; border-radius: .5rem; cursor: pointer; width: 100%; }
button[disabled] { opacity: .6; cursor: progress; }
.trampa { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
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
<header>${l.logoUrl ? `<img src="${escapar(l.logoUrl)}" alt="">` : ""}<h1>${escapar(l.nombre)}</h1></header>
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
<form method="post" novalidate>
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
  f.addEventListener("submit", function () { b.disabled = true; b.textContent = "Enviando…"; });
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
<style nonce="${escapar(o.nonce)}">body{margin:0;font:1rem/1.5 system-ui,sans-serif;color:#1d1d1f;background:#fff}main{max-width:32rem;margin:0 auto;padding:2rem 1rem}@media (prefers-color-scheme:dark){body{color:#f2f2f3;background:#17181a}}</style></head>
<body><main><h1>${escapar(titulo)}</h1><p>${escapar(mensaje)}</p></main></body>
</html>
`;
}
