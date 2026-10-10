// Galería del rediseño (PLAN-DISENO.md, D17): UNA página con el antes y el después de cada fila del inventario, agrupada por rol, para recorrerla en una pantalla grande y en el celular.
//
//   npm run diseno:galeria        → docs/diseno/galeria.html
//
// Es un archivo estático que se abre con doble clic: las imágenes se leen de docs/diseno/capturas/{antes,despues}/ con rutas relativas. Las imágenes cargan al llegar a ellas (`loading="lazy"`).
// Colores, medidas y fuentes son las variables del sistema (docs/diseno/SISTEMA-VISUAL.md); la página no depende de ningún sitio externo.

import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cargarEscenas, type FilaDeInventario } from "./diseno-inventario.ts";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));

const ROLES: { id: string; nombre: string }[] = [
  { id: "asesor", nombre: "Asesor" },
  { id: "recepcion", nombre: "Recepción" },
  { id: "maestro", nombre: "Maestro" },
  { id: "administrador", nombre: "Administrador" },
  { id: "anonimo", nombre: "Sin sesión (acceso y páginas públicas)" },
];

const escapar = (t: string): string => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function figura(fila: FilaDeInventario, fase: "antes" | "despues", vista: "escritorio" | "celular"): string {
  if (fila.vistas && !fila.vistas.includes(vista)) return `<figure class="vacia"><figcaption>${fase === "antes" ? "Antes" : "Después"}</figcaption><div class="sin">No aplica a esta vista</div></figure>`;
  const archivo = `capturas/${fase}/${fila.id}-${vista}.jpg`;
  const hay = existsSync(join(RAIZ, "docs/diseno", archivo));
  return `<figure><figcaption>${fase === "antes" ? "Antes" : "Después"}</figcaption>${hay ? `<a href="${archivo}" target="_blank" rel="noopener"><img loading="lazy" src="${archivo}" alt="${fase === "antes" ? "Antes" : "Después"}: ${escapar(fila.titulo)} (${vista})"></a>` : `<div class="sin">Sin captura</div>`}</figure>`;
}

function seccionDeRol(rol: { id: string; nombre: string }, filas: FilaDeInventario[]): string {
  const delRol = filas.filter((f) => f.rol === rol.id);
  if (delRol.length === 0) return "";
  const grupos = [...new Set(delRol.map((f) => f.grupo))];
  const cuerpo = grupos
    .map((g) => {
      const delGrupo = delRol.filter((f) => f.grupo === g);
      const filasHtml = delGrupo
        .map(
          (f) => `<article class="fila" id="${escapar(f.id)}" data-texto="${escapar(`${f.id} ${f.titulo} ${f.ruta ?? ""}`.toLowerCase())}">
<header><h4>${escapar(f.titulo)}</h4><p><code>${escapar(f.id)}</code>${f.ruta ? ` · <code>${escapar(f.ruta)}</code>` : ""} · ${escapar(f.tipo)}</p></header>
<div class="par par-escritorio">${figura(f, "antes", "escritorio")}${figura(f, "despues", "escritorio")}</div>
<div class="par par-celular">${figura(f, "antes", "celular")}${figura(f, "despues", "celular")}</div>
</article>`,
        )
        .join("\n");
      return `<details class="grupo" open><summary><h3>${escapar(g)} <span class="cuenta">${delGrupo.length}</span></h3></summary>${filasHtml}</details>`;
    })
    .join("\n");
  return `<section class="rol" id="rol-${rol.id}"><h2>${escapar(rol.nombre)} <span class="cuenta">${delRol.length}</span></h2>${cuerpo}</section>`;
}

const ESTILOS = `
:root { color-scheme: light; --fondo: #f3f4f8; --superficie: #ffffff; --texto: #171a2c; --texto-suave: #5a6074; --borde: #dee1ea; --borde-campo: #8e95aa; --primario: #3a32d1; --primario-texto: #ffffff; --primario-suave: #ecebfc; --primario-fuerte: #2b2699; --lateral: #171a2c; --columna: #e7e9f1; --sombra: 0 1px 2px rgb(23 26 44 / 10%); --fuente-texto: "Figtree", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --fuente-titulo: "Bricolage Grotesque", "Figtree", system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--fondo); color: var(--texto); font-family: var(--fuente-texto); font-size: 14px; line-height: 20px; }
h1, h2, h3, h4 { margin: 0; }
h1 { font-family: var(--fuente-titulo); font-size: 30px; line-height: 34px; letter-spacing: -0.01em; }
h2 { font-family: var(--fuente-titulo); font-size: 24px; line-height: 28px; margin: 32px 0 12px; }
h3 { font-size: 16px; line-height: 22px; }
h4 { font-size: 15px; line-height: 22px; }
code { font-size: 12.5px; background: var(--columna); border-radius: 6px; padding: 1px 6px; }
.cuenta { font-size: 12.5px; background: var(--columna); border-radius: 999px; padding: 2px 8px; font-weight: 700; vertical-align: middle; }
header.sitio { position: sticky; top: 0; z-index: 5; background: var(--lateral); color: var(--primario-texto); padding: 12px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; }
header.sitio h1 { font-size: 20px; line-height: 26px; }
nav.roles { display: flex; flex-wrap: wrap; gap: 4px; }
nav.roles a { color: #c9cde0; text-decoration: none; padding: 8px 12px; border-radius: 10px; min-height: 44px; display: inline-flex; align-items: center; }
nav.roles a:hover, nav.roles a:focus-visible { background: rgb(255 255 255 / 12%); color: var(--primario-texto); }
.controles { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-left: auto; }
.segmento { display: inline-flex; padding: 4px; background: #2b3050; border-radius: 12px; }
.segmento label { min-height: 36px; padding: 0 16px; display: inline-flex; align-items: center; border-radius: 9px; cursor: pointer; font-weight: 600; color: #c9cde0; }
.segmento input { position: absolute; opacity: 0; }
.segmento label:has(input:checked) { background: var(--superficie); color: var(--texto); font-weight: 700; }
.segmento label:has(input:focus-visible) { outline: 2px solid var(--primario-texto); outline-offset: 2px; }
#buscar { min-height: 44px; width: 260px; max-width: 100%; padding: 0 12px; border: 1px solid var(--borde-campo); border-radius: 10px; font: inherit; }
#buscar:focus-visible { outline: 2px solid var(--primario-texto); outline-offset: 2px; }
main { padding: 8px 16px 64px; max-width: 1800px; margin: 0 auto; }
p.intro { color: var(--texto-suave); max-width: 70ch; }
details.grupo { background: var(--superficie); border: 1px solid var(--borde); border-radius: 16px; padding: 4px 20px 12px; margin: 12px 0; }
details.grupo > summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
article.fila { padding: 20px 0; border-top: 1px solid var(--borde); }
article.fila header p { margin: 2px 0 12px; color: var(--texto-suave); }
.par { display: none; gap: 16px; align-items: flex-start; }
body[data-vista="escritorio"] .par-escritorio, body[data-vista="celular"] .par-celular { display: flex; }
.par figure { flex: 1 1 0; min-width: 0; margin: 0; }
.par-celular figure { flex: 0 1 390px; }
figcaption { font-size: 12.5px; line-height: 16px; font-weight: 700; color: var(--texto-suave); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--borde); border-radius: 12px; box-shadow: var(--sombra); background: var(--superficie); }
.sin { padding: 24px; border: 1px dashed var(--borde-campo); border-radius: 12px; color: var(--texto-suave); text-align: center; }
article.fila[hidden] { display: none; }
.solo-lectores { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 900px) { .par { flex-direction: column; } .par-celular { flex-direction: row; overflow-x: auto; } .par-celular figure { flex: 0 0 min(390px, 86vw); } .controles { margin-left: 0; } }
`;

const GUION = `
(function () {
  var cuerpo = document.body;
  var saved = null;
  try { saved = localStorage.getItem("galeria-vista"); } catch (e) {}
  function poner(v) { cuerpo.setAttribute("data-vista", v); try { localStorage.setItem("galeria-vista", v); } catch (e) {} }
  poner(saved === "celular" ? "celular" : "escritorio");
  document.querySelectorAll('input[name="vista"]').forEach(function (r) {
    r.checked = r.value === cuerpo.getAttribute("data-vista");
    r.addEventListener("change", function () { poner(r.value); });
  });
  var caja = document.getElementById("buscar");
  caja.addEventListener("input", function () {
    var t = caja.value.trim().toLowerCase();
    document.querySelectorAll("article.fila").forEach(function (a) { a.hidden = t !== "" && a.getAttribute("data-texto").indexOf(t) === -1; });
  });
})();
`;

const filas = await cargarEscenas();
const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galería del rediseño</title>
<style>${ESTILOS}</style>
</head>
<body data-vista="escritorio">
<header class="sitio">
<h1>Galería del rediseño</h1>
<nav class="roles" aria-label="Roles">${ROLES.filter((r) => filas.some((f) => f.rol === r.id)).map((r) => `<a href="#rol-${r.id}">${escapar(r.nombre.split(" (")[0]!)}</a>`).join("")}</nav>
<div class="controles">
<div class="segmento" role="radiogroup" aria-label="Vista"><label><input type="radio" name="vista" value="escritorio" checked>Escritorio</label><label><input type="radio" name="vista" value="celular">Celular</label></div>
<label class="solo-lectores" for="buscar">Buscar una pantalla</label>
<input id="buscar" type="search" placeholder="Buscar una pantalla o estado">
</div>
</header>
<main>
<p class="intro">${filas.length} filas: cada cosa que una persona puede llegar a ver, con su captura de antes (a la izquierda) y de después (a la derecha), agrupadas por rol. Elige «Escritorio» (1366 px) o «Celular» (390 px) arriba. Un clic en una imagen la abre a tamaño real.</p>
${ROLES.map((r) => seccionDeRol(r, filas)).join("\n")}
</main>
<script>${GUION}</script>
</body>
</html>
`;
writeFileSync(join(RAIZ, "docs/diseno/galeria.html"), html);
console.log(`docs/diseno/galeria.html: ${filas.length} filas (${(html.length / 1024).toFixed(0)} KB)`);
