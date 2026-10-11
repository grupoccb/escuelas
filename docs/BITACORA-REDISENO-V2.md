# BITACORA-REDISENO-V2.md — Rediseño evolutivo (handoff de diseño)

Rama `diseno-v2` (desde `diseno-v1`). Especificación: `design_handoff_rediseno_escuela/README.md` y sus `pantallas/*.dc.html` (prototipos, no código para copiar). Reglas que mandan: `CLAUDE.md`, `docs/diseno/SISTEMA-VISUAL.md`.

| Bloque | Estado | Commit | Alcance |
|---|---|---|---|
| R1 | HECHO | 471ddc5 | Tokens y marco: variables, barra lateral agrupada, aviso global, diálogos como hoja inferior en celular |
| R2 | PENDIENTE | | Embudo: arrastrar y soltar, selección en lote, columnas plegables, ficha lateral, diálogos, celular |
| R3 | PENDIENTE | | Tableros: página narrativa de 8 secciones con gráficas propias |
| R4 | PENDIENTE | | Registrar pago, Hoy del maestro, Pase de lista, Registro del alumno |
| R5 | PENDIENTE | | Tareas, Ficha del lead, Conversión, Estado de cuenta, Uniformes, Ventas, Cierre del día |
| R6 | PENDIENTE | | Alumnos, Expediente, Familias, Ficha de familia |
| R7 | PENDIENTE | | Administración: inicio, patrón de catálogo, sistema, precios, cargar catálogo |
| R8 | PENDIENTE | | Acceso, Mi cuenta, estados de error, página pública de captación |

## Decisiones tomadas

### R1 — Tokens y marco

**Color por disciplina (cómo usarlo en los bloques siguientes).** El color sale SOLO del dato `vertical.color` (hex). Archivos: `web/src/ui/disciplina.ts` (lógica pura: `iniciales`, `colorDeDisciplina`; con prueba en `disciplina.test.ts`) y `web/src/ui/disciplina.tsx` (React). Hay tres formas, de menos a más control:

1. Piezas hechas: `<EtiquetaDisciplina nombre={v.nombre} color={v.color} />` (punto + nombre, esquinas de 6) y `<AvatarDisciplina nombre="Matías Fuentes" color={v.color} grande? />` (iniciales con tono suave y tinta; 32 px, `grande` 40).
2. Un contenedor que le da el color a todo lo suyo: `<ConDisciplina color={v.color} as="li" className="…">…</ConDisciplina>`; adentro se puede usar `var(--disciplina)` (el hex, p. ej. la banda de 5 px de la tarjeta del maestro o el punto de una píldora), `var(--disciplina-suave)` (fondo) y `var(--disciplina-tinta)` (texto sobre el suave, AA).
3. Un elemento propio: `const ref = useDisciplina<HTMLLIElement>(v.color); <li ref={ref}>`.

El hook hace `el.style.setProperty("--disciplina", hex)` y pone `data-disciplina` (esto no dispara `check:estilo`); `base.css` (`[data-disciplina] { … oklch(from var(--disciplina) …) }`) deriva suave y tinta. Sin color válido pone `data-disciplina="neutra"` y las tres variables toman `--borde-campo`, `--etiqueta` y `--etiqueta-texto`. Las clases que ya leen las variables: `.etiqueta-disciplina`, `.avatar-disciplina`, `.pildora-filtro-punto` (píldora de filtro con punto de disciplina: ponle `ConDisciplina`/`useDisciplina` al propio punto o al botón). Cuando una disciplina de otra tarjeta no aplica (un avatar suelto sin color), ya cae al neutro por los `var(--x, fallback)`. NUNCA un mapa nombre→color.

**Variables nuevas en `:root` (base.css).** Sombras: `--sombra-tarjeta`, `--sombra-tarjeta-hover`, `--sombra-arrastre` (con anillo `--primario`), `--sombra-panel-oscuro`, `--sombra-barra-seleccion`, `--sombra-aviso`. Radios: `--radio-panel-oscuro` 20, `--radio-hoja` 20, `--radio-barra-seleccion` 16 (el 999 ya era `--radio-pildora`). Medidas: `--alto-pildora` 44, `--icono-tarjeta` 36, `--icono-tarjeta-movil` 44, `--columna-minima` 268, `--columna-maxima` 340, `--columna-plegada` 56, `--ancho-ficha` 460, `--alto-enlace-lateral` 40 y `--alto-enlace-lateral-bajo` 36. Tipografía: `--titulo-pantalla-*` (34/38, -0.015em; el `h1` ya los usa en escritorio y celular), `--heroe-*` (42/32, 1.08, -0.02em), `--seccion-numero-tam`, `--seccion-titulo-*` (24/30), `--cifra-*` (36/40) y `--grupo-lateral-*`. Mapa de calor: `--calor-1…5` con `--calor-3/4/5-texto` y `--calor-5-borde` (los 5 rellenos del README; el «sin clases» es el rayado `--fondo`/`--etiqueta` y no necesita variable). Solo variables: ninguna clase de calor (la escribe quien la use, R3). `--lateral-activo` ya existía con el valor del prototipo (blanco al 12 %).

**Clases genéricas nuevas (bloque `/* === R1 */` al final de base.css).** `.pildora-filtro` (botón con `aria-pressed`; la activa va en `--lateral`; hijos `.pildora-filtro-punto` y `.pildora-filtro-cuenta`), `.boton-icono-tarjeta` (36; 44 en celular), `.tarjeta-movil` (sombra de profundidad y hover con `translateY(-1px)`), `.etiqueta-disciplina`, `.avatar-disciplina`. Las tarjetas de lista ya existentes (`.lista-tarjetas > li`, `.alumno-pase`, la fila apilada de tabla y `.ficha-lead`) pasaron a `--sombra-tarjeta`; `.ficha-lead` además se levanta 1 px al pasar el ratón.

**Barra lateral.** El agrupamiento es un DATO en `navegacion.ts` (`GRUPOS`, `Seccion.grupo`, `agruparSecciones()`); permisos, rutas, módulos y orden de `SECCIONES` no cambiaron (`navegacion.test.ts` ampliado). `Shell.tsx` pinta cada grupo como `role="group"` con su etiqueta. Enlaces de 40 px. DESVIACIÓN: con alto de pantalla ≤ 820 px (1366×768) los enlaces miden 36 px y las etiquetas se aprietan, porque con 40 las 13 secciones del administrador desbordaban ~70 px (el prototipo se diseñó a 860 de alto); con 36 caben enteras sin desvanecido. Por eso `e2e-diseno/tamanos.spec.ts` ahora acepta ≥ 36 px en los enlaces de la barra lateral de escritorio (README: «el de 44 de toque aplica a celular»); todo lo demás sigue exigiendo 44.

**Cabecera y barra inferior del celular.** Se conservan (con «Salir» y el selector de sucursal, que el prototipo no muestra); solo se ajustó el relleno de la cabecera a 14/16/2 del prototipo. La barra inferior queda con 64 px de alto de enlace (el prototipo 60) porque hay etiquetas de dos renglones («Estado de cuenta») y la barra no debe cambiar de alto entre pantallas.

**Aviso «ya quedó».** Oscuro con palomita, texto y «Entendido» (`--primario-suave`/`--primario-fuerte`), abajo al centro (en celular, encima de la barra), sombra `--sombra-aviso`, entra con `sube` 180 ms. El botón mide 44 (el prototipo 40: gana el objetivo de toque).

**Diálogos como hoja inferior.** En ≤ 899 px el `<dialog>` queda anclado abajo, ancho completo, radio `20px 20px 0 0` (`--radio-hoja`), con el relleno inferior de `safe-area`. En escritorio sigue centrado. Misma animación de entrada que el prototipo (`aparece`: opacidad + 8 px, 180 ms; sin animación con `prefers-reduced-motion` por la regla global). Si hay un aviso a la vez, la hoja sube y se acorta (regla de D18) y queda con las cuatro esquinas redondas para no taparse con el aviso. `Dialogo.tsx` no cambió (foco, Esc, atrapa-foco y nombres accesibles intactos). El botón «×» de cierre del encabezado del prototipo NO se agregó: los diálogos actuales ya cierran con «Cancelar»/Esc y un segundo botón «Cerrar» chocaría con nombres accesibles que usan las pruebas.

## Endpoints que las gráficas necesitan y no existen
(se llenan en R3)


### R1 — Decisiones de coordinación y evidencia

- **El dato del color de disciplina en la API se llama `color_marca`** (`GET /api/verticales`), no `vertical.color`; el hook de `ui/disciplina.tsx` recibe `string | null`. El lead trae `vertical_interes_id`: el color se resuelve cruzando con `/api/verticales`.
- **Enlaces de la barra lateral a 36 px cuando la pantalla mide ≤ 820 px de alto** (el README fija 40; con 40 las 13 secciones del administrador desbordan ~70 px a 1366×768). `web/e2e-diseno/tamanos.spec.ts` acepta ≥ 36 en la barra lateral de escritorio y sigue exigiendo 44 en lo demás. **Decisión para Eduardo:** si prefiere 40/44 siempre, la barra tendría que desplazarse.
- **Sin botón «×» en el encabezado de los diálogos** (los nombres accesibles «Cerrar» de las pruebas chocarían); siguen cerrando con «Cancelar» y Esc.
- **Guardas de la raíz:** `design_handoff_rediseno_escuela/` (prototipos con datos de ejemplo) se agregó a las exclusiones de `scripts/check-generico.ts` y de `eslint.config.js`, igual que `docs/`. No es una relajación del código de la aplicación.
- **Las clases genéricas de R1** (`.pildora-filtro*`, `.boton-icono-tarjeta`, `.tarjeta-movil`, `.etiqueta-disciplina*`, `.avatar-disciplina*`) aún no aparecen en ninguna escena: dan 9 hallazgos `clase-sin-fila` en `npm run diseno:inventario` hasta que R2 las use. R2 no se cierra con ese inventario sucio.
- Las capturas de TODAS las filas llevan ya la barra lateral agrupada; se recapturan completas en el cierre (R8). Cada bloque recaptura sus filas.

Evidencia R1 (11 de octubre de 2026): `npm run validar` exit 0 (1026 + 109 pruebas, 0 fallas) · `npm run test:navegador` 260 pasan, 1 omitida, exit 0 (8.3 min) · `check:estilo`, `check:generico`, `lint`, `typecheck` en verde.
