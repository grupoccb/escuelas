# Handoff: rediseño completo de la aplicación (Inscripciones)

## Overview
Rediseño de todas las pantallas de la aplicación de captación y gestión para escuelas multi-disciplina (repo `Inscripciones`, interfaz en `web/`). La dirección aprobada es **evolucionar el sistema visual actual** (`docs/diseno/SISTEMA-VISUAL.md`): misma base (índigo `#3A32D1`, Bricolage Grotesque + Figtree, barra lateral oscura), pero más audaz: color por disciplina, más profundidad, más ritmo tipográfico, y mejoras de UX puntuales (embudo con arrastrar y soltar, tableros que cuentan la historia del mes, reparto del pago visible en cada cargo, línea del día del maestro).

## About the Design Files
Los archivos de `pantallas/` son **referencias de diseño hechas en HTML** (prototipos con datos de ejemplo que muestran el aspecto y el comportamiento). **No son código para copiar.** La tarea es **recrearlas en `web/`** con su stack y sus patrones: React + Vite, `react-router-dom`, las clases y variables de `web/src/estilos/base.css`, los componentes de `web/src/ui/` (`basicos.tsx`, `campos.tsx`, `Dialogo.tsx`, `Pestanas.tsx`, `Icono.tsx`, `Shell.tsx`) y los datos reales de la API (`web/src/api/`).

Para verlas: abre `pantallas/Inicio.dc.html` en un navegador (necesita `support.js` en la misma carpeta y conexión para Google Fonts). Cada pantalla es responsiva: por debajo de 900 px cambia a su versión de celular. `En-celular.dc.html` muestra las 4 principales a 390 px.

## Fidelity
**Alta fidelidad.** Colores, tipografía, medidas, textos y comportamientos son finales. Recréalas fielmente, traduciendo cada valor a una variable de `base.css` (las reglas del repo prohíben colores y medidas sueltas: `npm run check:estilo`).

## Reglas del repo que mandan sobre este diseño
1. **`CLAUDE.md` gana siempre.** En especial el invariante 2: **cero términos de vertical en el código**. «Karate», «Ballet», «Salsa», «Águilas», «Norte», «kyu», nombres de grupos, precios y personas de los prototipos son **datos de ejemplo**: en el código vienen de la API. `npm run check:generico` debe seguir pasando.
2. **El color por disciplina viene del dato `vertical.color`** (ya existe en «Editar disciplina»). Nunca un mapa de colores por nombre en el código. De ese color se derivan el tono suave y la tinta (ver Tokens).
3. Las reglas de negocio no cambian: perder un lead exige motivo, recuperar exige nota, a «Inscrito» se llega inscribiendo, etc. Si el diseño parece contradecir una regla del servidor, la regla gana.
4. Accesibilidad: AA en todo texto, 44 px mínimo en lo que se toca, foco visible y el color nunca es la única señal. Arrastrar siempre tiene una alternativa sin arrastre (botón «Mover»).
5. Íconos: solo los de `web/src/ui/Icono.tsx` (los prototipos usan exactamente esas rutas). No agregues librerías de íconos ni de gráficas.
6. Fuentes desde el propio origen (`font-src 'self'`), como ya está en `base.css`.

## Design Tokens
Se conservan todas las variables de `base.css`. Se agregan:

**Color por disciplina** (calculado a partir de `vertical.color`, con oklch):
- `color`: el de la disciplina (ejemplos: `oklch(0.6 0.16 35)`, `oklch(0.6 0.16 355)`, `oklch(0.6 0.11 190)`).
- `suave`: `oklch(0.95 0.035 <tono>)`, fondo de etiquetas y avatares.
- `tinta`: `oklch(0.44 0.13 <tono>)`, texto sobre el suave (pasa AA).
- Sugerencia: variables CSS por elemento (`--disciplina`, `--disciplina-suave`, `--disciplina-tinta`) puestas en `style` desde el dato.

**Profundidad**
- Tarjeta que se mueve: `0 1px 2px rgb(23 26 44 / 8%), 0 2px 6px -2px rgb(23 26 44 / 10%)`; al pasar el ratón: `0 10px 24px -8px rgb(23 26 44 / 30%)` y `translateY(-1px)`.
- Tarjeta arrastrada: `rotate(2deg)` y `0 24px 48px -12px rgb(23 26 44 / 45%), 0 0 0 2px var(--primario)`.
- Panel oscuro (héroe de tableros, cierre del día, «Para empezar»): fondo `--lateral`, radio 20, `0 18px 40px -20px rgb(23 26 44 / 60%)`.
- Barra flotante de selección en lote: fondo `--lateral`, radio 16.

**Tipografía**
- Título de pantalla: Bricolage 700, **34/38**, `-0.015em` (escritorio y celular).
- Titular del héroe de tableros: Bricolage 700, 42 px (32 en celular), interlínea 1.08, `-0.02em`.
- Títulos de sección numerados («01 …»): número Bricolage 700 15 px `--primario`; título Bricolage 700 24/30.
- Cifra principal (indicador principal, saldo): Bricolage 700, 36–40 px.
- Etiquetas de grupo de la barra lateral: 12/16, 700, `0.06em`, mayúsculas, `--lateral-suave`.

**Medidas nuevas**
- Píldoras de filtro (disciplina, etapa): 44 px de alto, radio 999. Activa: fondo `--lateral`, texto blanco.
- Botones de ícono dentro de tarjetas de escritorio: 36 × 36 (44 × 44 en celular).
- Columnas del tablero: 268 px mínimo, crecen hasta 340; plegadas, 56 px.
- Hoja inferior en celular para diálogos: radio `20px 20px 0 0`, ancho completo.

**Mapa de calor y retención** (escala del primario): `#ECEBFC` (menos de 40 %) · `#CFCDF6` (40–59) · `#8C87E6` (60–79, texto `--texto`) · `#3A32D1` (80–94, texto blanco) · `#2B2699` + borde `--alerta-borde` (95 % o más) · sin clases: rayado `--fondo`/`--etiqueta`.

## Shell (todas las pantallas)
- **Barra lateral** (`Lateral.dc.html`, se traduce en `ui/Shell.tsx`): las mismas secciones y el mismo orden de `navegacion.ts`, ahora **agrupadas con etiqueta**: Clases (Hoy, Pase de lista), Captación (Embudo, Tareas), Cobranza (Registrar pago, Estado de cuenta, Uniformes, Ventas, Cierre del día), Escuela (Tableros, Alumnos, Familias, Administración). Los grupos sin secciones visibles no se muestran. Enlaces de 40 px de alto; el activo con `--lateral-activo`.
- **Celular** (`Cabecera.dc.html`, `Barra.dc.html`): se conserva la cabecera y la barra inferior actuales.
- **Avisos «ya quedó»**: el aviso global oscuro con «Entendido», abajo al centro (en celular, encima de la barra inferior).

## Screens / Views
Archivo de referencia → pantalla del repo. Usa los textos de los prototipos tal cual, salvo los datos de ejemplo.

1. **Embudo** (`Embudo.dc.html` → `pantallas/asesor/Embudo.tsx`, `MoverEtapa.tsx`, `MarcarInscrito.tsx`)
   - Indicadores: «Leads abiertos» como indicador principal; «Nuevos sin contactar»; «Clases muestra agendadas»; «Llevan días sin movimiento» con el par de alerta y el botón «Ver solo estos» (alterna con «Ver todos»).
   - Filtros: píldoras por disciplina con su punto de color y conteo, «Fuente», «Solo estancados» y el selector Tablero/Lista.
   - Tablero: una columna por etapa (de `/api/etapas`, en su orden). Las etapas de cierre (`tipo_sistema` inscrito/perdido) empiezan plegadas y tienen fondo `--exito-suave`/`--peligro-suave`. Cada columna se pliega con el botón «Plegar columna».
   - Tarjeta: avatar de 32 px con iniciales y el tono de la disciplina (también sirve para seleccionar; seleccionado: `--primario` con palomita), nombre, «N d» desde el último movimiento o la insignia de alerta «⚠ 14 d», etiqueta de disciplina + «Matías, 4 años», línea propia de la etapa (fecha de la clase, «Asistió el…», cotización, «Motivo: …») y pie con «Fuente · Sucursal» más dos botones: abrir la conversación (Chatwoot) y uno que cambia según la etapa (agendar clase muestra antes de la clase; inscribir después).
   - **Arrastrar y soltar** con pointer events (solo ratón; en táctil, botón «Mover» con hoja de etapas). Si el lead está seleccionado, se arrastra toda la selección (pila con contador). La columna destino se resalta (borde de 2 px del color de su tono y un rótulo «Suelta para mover aquí» / «Suelta para inscribir» / «Suelta y elige el motivo»). El tablero se desplaza solo cerca de los bordes.
   - Al soltar: en Perdido abre el diálogo de motivo (botones con los motivos de `/api/motivos-perdida` y nota opcional). Desde Perdido a una etapa abierta abre «Recuperar» con nota obligatoria. En Inscrito abre la inscripción en 3 pasos (Alumno con datos «Capturado» y solo lo que falta, Grupo con lugares reales, Confirmar con montos); si se sueltan varios, explica que es de uno en uno. En cualquier otra etapa mueve y muestra el aviso. Un lead ya inscrito no se mueve desde el embudo.
   - Selección: barra flotante oscura con el conteo, «Mover a…» (menú de etapas; Inscrito deshabilitado con más de uno) y «Quitar la selección». Esc la limpia.
   - Ficha lateral (460 px; pantalla completa en celular): identidad, tarea pendiente si está estancado, acción principal según la etapa, «Abrir conversación», select «Mover de etapa», para quién son las clases, clase muestra, de dónde llegó e historial en línea de tiempo. «Abrir completa» lleva a la ficha del lead.
   - Celular: píldoras de etapa y lista de la etapa elegida, modo «Seleccionar» y hoja «Mover a…».
2. **Tableros** (`Tableros.dc.html` → `pantallas/tableros/*`): una sola página narrativa con pestañas fijas que saltan a cada sección y se marcan al desplazar. Héroe oscuro con titular, 3 frases calculadas de los datos y 6 indicadores. Después, en orden: 01 embudo de conversión con la caída entre etapas (la mayor resaltada) y «Por qué se pierden»; 02 fuentes y campañas (leads, inscritos, conversión, gasto y costo por alumno, con «Lo más barato»); 03 clases muestra por disciplina (asistencia y cierre); 04 altas y bajas de 12 meses en barras divergentes con la línea de activos (al pasar el cursor por un mes se ven sus cifras); 05 retención por cohortes; 06 ingreso recurrente en área y cartera vencida por antigüedad con «Ver las familias con atraso»; 07 mapa de calor por día y hora con «A reventar» y «Con lugares»; 08 comparativo disciplina × sucursal. Filtros: sucursal y disciplina. Las gráficas son SVG o HTML propios, con texto primero (cada barra escribe su cifra) y sin librerías, como `Barras.tsx`. Las series nuevas que necesitan endpoint (12 meses, cohortes, mapa de calor) se piden a la API: si no existen, se deja anotado y se usan las que sí hay.
3. **Registrar pago** (`Registrar-pago.dc.html` → `pantallas/recepcion/RegistrarPago.tsx`, `FamiliaElegida.tsx`, `BuscadorDeFamilia.tsx`, `reparto.ts`): tarjeta de la familia con los hijos en etiquetas de su disciplina. Cargos agrupados por hijo, y cada uno con una barra que muestra **cuánto cubre el monto escrito** («Este pago lo cubre» / «Se abonan $X; quedan $Y»). Atajos «Todo el saldo» y «Solo lo vencido». Selector Efectivo/Tarjeta/Transferencia; la referencia solo aparece con tarjeta o transferencia. Validaciones: solo números con 2 decimales, mayor a cero y no mayor que el saldo. El estado «Pago registrado» incluye folio, «Imprimir recibo» y «Registrar otro pago». «Cambiar de familia» abre el buscador en un diálogo.
4. **Hoy del maestro** (`Hoy-maestro.dc.html` → `pantallas/maestro/Hoy.tsx`): línea de tiempo con puntos y la marca «Ahora 4:20 pm · siguiente en 40 min» entre clases. Cada tarjeta lleva una banda de 5 px con el color de la disciplina. Asistió/No asistió están deshabilitados hasta la hora de la clase. Después de «Asistió» aparece «Listo para cerrar la inscripción»; después de «No asistió», el aviso de la tarea al asesor. Una sola acción principal por pantalla.
5. **Tareas** (`Tareas.dc.html` → `asesor/Tareas.tsx`): Pendientes/Resueltas con conteo, filtro por tipo en un panel lateral (un select en celular), tarjetas con ícono según el tono, «Atiéndela hoy» en las urgentes, acción propia de cada tipo, «Descartar» con nota opcional y abrir la conversación.
6. **Ficha del lead** (`Ficha-lead.dc.html` → `asesor/FichaLead.tsx`, `Ninos.tsx`, `Cotizaciones.tsx`, `ClasesMuestraDeLead.tsx`): barra de avance por etapas, niños con «Cotizar a …», cotizaciones con la promoción, clases muestra, tareas, origen e historial. Diálogos: mover, cotizar y agendar.
7. **Inscripción** (`Conversion.dc.html` → `pantallas/conversion/*`): 4 pasos (Familia, Alumnos, Grupos, Confirmar) con barra de pasos, resumen fijo a la derecha y pantalla final «quedaron inscritos» que lleva a registrar el primer pago.
8. **Pase de lista** (`Pase-de-lista.dc.html` → `maestro/PaseDeLista.tsx`): conteo en vivo, «Marcar a todos presentes», Presente/Falta/Justificada por alumno y un solo guardado en una barra fija abajo.
9. **Registro del alumno** (`Registro-alumno.dc.html` → `maestro/RegistroClase.tsx`, `salud/*`): acordeón de 6 secciones con estado («Completa» / «Faltan N datos»), barra de avance, guardado por sección y «Guardar borrador». La salud lleva su aviso de permiso. Errores «Falta: …».
10. **Estado de cuenta** (`Estado-de-cuenta.dc.html` → `recepcion/EstadoDeCuenta.tsx`): indicadores, cargos por hijo con estado y pagos; «Cancelar el pago» con motivo obligatorio y el botón destructivo.
11. **Uniformes**, **Ventas** y **Cierre del día** (`Uniformes`, `Ventas`, `Cierre-del-dia` → `recepcion/*`): por entregar/entregados con existencia; productos en tarjetas con existencia, vender (cantidad −/+) y anular; héroe oscuro con lo cobrado y el efectivo a contar, por forma de pago, por persona y cada pago.
12. **Alumnos**, **Expediente**, **Familias**, **Ficha de la familia** (→ `pantallas/familia/*`): tarjetas con disciplina, asistencia y saldo; expediente con pestañas Trayectoria, Asistencia (rejilla de las últimas clases), Económico, Comercial y Salud, más los diálogos «Cambiar de grupo» y «Dar de baja» con motivo; familias con la vista «Con un solo hijo inscrito»; ficha con hijos, adultos y sus banderas, saldo y mensajes.
13. **Administración** (`Administracion`, `Admin-catalogo`, `Admin-sistema`, `Precios`, `Cargar-catalogo` → `pantallas/admin/*`): inicio con el panel oscuro «Para empezar» (N de 8 pasos y «Lo que sigue») y el buscador de `areas.ts`. Las pantallas de catálogo comparten un patrón: menú de áreas a la izquierda; filas con color o número de orden, etiquetas, Activar/Desactivar, editar y dar de baja; diálogo de nuevo/editar con validación «Falta: …»; confirmación de baja con el error del servidor dentro. Sistema: módulos con interruptores y dependencias («Primero apaga…»), configuración con barra «Cambios sin guardar», automatizaciones con interruptor y clase (Servicio/Marketing), textos del asistente con vista previa tipo WhatsApp y bandeja. Precios: historial Pasada/Vigente/Futura. Cargar catálogo: plantillas, archivos, errores por archivo/fila/columna, revisión limpia y «¿Cargar estos cambios?».
14. **Acceso**, **Mi cuenta**, **Estados** (→ `pantallas/acceso/*`): panel de marca con las tres franjas de color; errores 401, 429 y de red; cambiar la contraseña con validación; sin acceso, módulo apagado, 404, error de carga y «Abriendo la aplicación…».
15. **Página de captación** (`Pagina-captacion.dc.html`, pública): héroe, tarjetas por disciplina (datos de la API), formulario adulto/WhatsApp/para quién/disciplina/sucursal y salto a WhatsApp con el mensaje armado. Las fotos son espacios marcados: la escuela pone las suyas.

## Interactions & Behavior
- Movimiento: 120 ms para hover y foco y 180 ms para entradas, con `cubic-bezier(.2,.8,.2,1)`. Diálogos: opacidad + 8 px. Avisos: entran desde abajo. Ficha lateral: entra desde la derecha 28 px. Con `prefers-reduced-motion`, sin animación.
- Responsivo: punto de corte 900 px (como `Shell.tsx`). En celular los diálogos son hojas inferiores, las tablas se apilan en tarjetas y las acciones principales miden 52 px.
- Teclado: Enter abre la tarjeta del embudo, Espacio la selecciona y Esc cierra en este orden: diálogo, hoja, menú, ficha, selección.
- Estados vacío, cargando y error: los de `Estados.dc.html` (Vacío con ícono, ErrorDeCarga con «Reintentar»).

## State Management
Lo de siempre en el repo (`useCarga`, `useAccion`, `useSesion`). Lo nuevo en el embudo: `seleccion: Set<id>`, `arrastre: {ids, sobre}`, `plegadas: Record<etapaId, boolean>` (puede guardarse en `localStorage`), `fichaAbierta: id | null`, y `dialogo: perdido | recuperar | inscribir | agendar` con su borrador. Mover en lote son N llamadas `PATCH /api/leads/:id/etapa` (o un endpoint de lote si se agrega). Un 409 recarga y avisa.

## Assets
Íconos: los de `Icono.tsx`. Fuentes: Bricolage Grotesque y Figtree (ya en `web/public/fuentes`). No hay imágenes; los espacios para foto de la página de captación son marcadores.

## Files
`pantallas/` contiene las 31 pantallas y componentes en HTML más `support.js`. Empieza por `Inicio.dc.html`, que enlaza todas. `Lateral`, `Barra` y `Cabecera` son el marco compartido.
