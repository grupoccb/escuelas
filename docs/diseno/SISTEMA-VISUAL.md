# SISTEMA-VISUAL.md — La especificación del diseño

Aprobado por Eduardo el 10 de octubre de 2026. Es la única fuente de verdad del aspecto de la aplicación.

Las cinco pantallas de referencia están en `docs/diseno/referencia/`. Son archivos HTML con los estilos escritos en línea: léelos como especificación exacta de medidas, colores y jerarquía. No se copian tal cual; se traducen a las clases y variables de `web/src/estilos/base.css`.

| Archivo | Qué muestra |
|---|---|
| `Main.dc.html` | Asesor, embudo en escritorio: estructura general, barra lateral, indicadores, filtros y tablero |
| `Recepcion.dc.html` | Recepción, registrar pago: paneles, cifra principal, selector segmentado, resumen de reparto |
| `Maestro.dc.html` | Maestro, hoy, en celular de 390 px: cabecera, tarjetas de clase, barra inferior |
| `Acceso.dc.html` | Inicio de sesión: panel de marca y formulario |
| `Sistema.dc.html` | La hoja del sistema: colores, tipografía, botones, etiquetas, campos y medidas |

En los archivos de referencia el color principal aparece como `{{acento}}`. Su valor es `#3A32D1`.

## Color

Se conservan los nombres de variables que ya existen. Cambian los valores y se agregan las marcadas como nuevas.

| Variable | Valor | Uso |
|---|---|---|
| `--fondo` | `#F3F4F8` | Fondo de la aplicación |
| `--superficie` | `#FFFFFF` | Tarjetas, paneles, campos |
| `--texto` | `#171A2C` | Texto principal |
| `--texto-suave` | `#5A6074` | Texto secundario y etiquetas de campo |
| `--texto-medio` (nueva) | `#454B60` | Texto de apoyo sobre fondos grises |
| `--borde` | `#DEE1EA` | Bordes de tarjetas y separadores |
| `--borde-campo` (nueva) | `#8E95AA` | Borde de campos de texto y listas |
| `--borde-boton` (nueva) | `#C5CAD8` | Borde del botón secundario |
| `--primario` | `#3A32D1` | Acción principal, elemento activo |
| `--primario-texto` | `#FFFFFF` | Texto sobre primario |
| `--primario-suave` | `#ECEBFC` | Fondo sutil, botón sutil, etiqueta de estado |
| `--primario-fuerte` (nueva) | `#2B2699` | Texto sobre `--primario-suave`, enlaces |
| `--lateral` (nueva) | `#171A2C` | Fondo de la barra lateral y del panel de marca |
| `--lateral-texto` (nueva) | `#C9CDE0` | Texto inactivo en la barra lateral |
| `--lateral-suave` (nueva) | `#A9AEC6` | Texto secundario en la barra lateral |
| `--columna` (nueva) | `#E7E9F1` | Fondo de columna del tablero y de selector segmentado |
| `--etiqueta` (nueva) | `#ECEDF3` | Fondo de etiqueta neutra; su texto es `#3A3F52` |
| `--exito` / `--exito-suave` | `#17603A` / `#E1F3E7` | Correcto, pagado, asistió |
| `--alerta` / `--alerta-suave` | `#6B4100` / `#FFF0D2` | Atención, sin movimiento; borde `#F0C56A` |
| `--peligro` / `--peligro-suave` | `#B3261E` / `#FDECEA` | Error, vencido, acción destructiva |
| `--foco` | `#3A32D1` | Anillo de foco de 2 px con 2 px de separación |

Un solo tema, claro. Se retira el tema oscuro automático y `color-scheme` queda en `light`.

## Tipografía

- **Títulos y cifras:** Bricolage Grotesque, peso 700 (600 en casos menores).
- **Texto e interfaz:** Figtree, pesos 400, 500, 600 y 700.
- Las fuentes se sirven desde el propio origen. La política de seguridad solo permite `font-src 'self'` y no se relaja para dominios externos.
- Cifras de dinero, teléfonos y conteos con `font-variant-numeric: tabular-nums`.

| Uso | Tamaño / interlínea | Fuente y peso |
|---|---|---|
| Título de pantalla | 30 / 34 | Bricolage 700, espaciado -0.01em |
| Título de pantalla en celular | 34 / 38 | Bricolage 700 |
| Cifra principal (saldo, hora de clase) | 32 a 36 | Bricolage 700 |
| Cifra de indicador | 28 / 32 | Bricolage 700 |
| Título de sección | 16 / 22 | Figtree 700 |
| Nombre en tarjeta | 15 / 22 | Figtree 700 |
| Texto | 14 / 20 (15 / 21 en celular) | Figtree 400 |
| Etiqueta de campo, dato secundario | 12.5 / 16 | Figtree 600 |
| Etiqueta de estado | 12 a 12.5 / 16 | Figtree 600 o 700 |

## Medidas

- **Esquinas:** 10 en botones y campos, 12 en tarjetas, 14 a 16 en paneles y columnas, 999 en píldoras.
- **Alto mínimo:** 44 en todo lo que se toca. 52 en la acción principal del celular y en el botón que cierra un formulario de dinero.
- **Espacios:** 4, 8, 12, 16, 20 y 32.
- **Sombra:** una sola, `0 1px 2px rgb(23 26 44 / 10%)`, en tarjetas que se mueven o flotan. Los paneles fijos llevan borde, no sombra. Lo flotante (diálogos, menús, avisos) usa `0 12px 32px rgb(23 26 44 / 18%)`.
- **Barra lateral:** 232 px, fondo `--lateral`. En celular se reemplaza por la barra inferior.
- **Contenido:** relleno de 28 px arriba y 32 a los lados en escritorio; 16 en celular.

## Componentes

**Botones**
- Primario: fondo `--primario`, texto blanco, peso 700. Uno solo por pantalla.
- Secundario: fondo blanco, borde `--borde-boton`, peso 600.
- Sutil: fondo `--primario-suave`, texto `--primario-fuerte`, peso 700.
- Destructivo: fondo blanco, borde y texto `--peligro`.
- Deshabilitado: fondo `--fondo`, texto `#6B7085`, borde `--borde`.
- Solo ícono: 44 × 44, sin fondo, con nombre accesible.

**Campos**
- Etiqueta arriba, 12.5 / 16, peso 600, color `--texto-suave`.
- Alto 44, borde de 1 px `--borde-campo`, esquinas de 10.
- Con error: borde de 2 px `--peligro` y mensaje debajo en `--peligro`, peso 600. El mensaje dice qué hacer.
- Ayuda debajo en 12.5 / 16 `--texto-suave`.

**Selector segmentado.** Para dos o tres opciones excluyentes, en vez de una lista desplegable. Pista `--columna` con relleno de 4; la opción activa es blanca con sombra leve.

**Etiquetas**
- Neutra (fuente, sucursal): fondo `--etiqueta`, esquinas de 6.
- De estado (agendada, asistió, vencido): píldora con el par suave y fuerte de su color.
- De alerta (días sin movimiento): fondo `--alerta-suave` con borde `#F0C56A`.

**Tarjeta de lista o tablero.** Fondo blanco, esquinas de 12, relleno de 14, sombra leve. Nombre arriba en 15 / 22 peso 700, sin subrayado. Datos secundarios debajo. Las acciones repetidas en cada tarjeta son botones de solo ícono, no botones grandes.

**Panel.** Fondo blanco, borde `--borde`, esquinas de 16, relleno de 20.

**Indicador.** Panel pequeño con etiqueta arriba y cifra de 28 debajo. El que pide atención usa el par de alerta e incluye su acción.

**Estado vacío.** Recuadro `--fondo` con ícono, una frase que dice qué pasó y cuál es el siguiente paso.

**Navegación**
- Barra lateral: marca arriba (monograma en `--primario` más nombre de la escuela y sucursal), enlaces con ícono de trazo de 20 px, el activo con fondo `rgb(255 255 255 / 12%)` y texto blanco en peso 700, usuario y "Salir" abajo.
- Celular: barra inferior con ícono de 24 px y texto de 12.5; el activo en `--primario` y peso 700.

**Íconos.** De trazo, 1.6 de grosor, extremos redondeados, sin relleno. Nunca emoji.

## Movimiento

- Duraciones: 120 ms para hover y foco, 180 ms para entradas y salidas.
- Curva: `cubic-bezier(.2,.8,.2,1)`.
- Diálogos: aparecen con opacidad y un desplazamiento de 8 px. Avisos: entran desde abajo. Tarjetas del tablero: se elevan al arrastrar.
- Con `prefers-reduced-motion`, todo cambia sin animación.
- Nada se anima más de 200 ms ni se mueve solo sin que la persona haga algo.

## Reglas

1. Una acción principal por pantalla.
2. La cifra o el dato que la persona vino a ver es lo más grande de la pantalla.
3. Contraste AA en todo texto: 4.5 a 1, o 3 a 1 desde 24 px.
4. El color nunca es la única señal: un estado lleva también texto o ícono.
5. Ningún color, fuente o medida fuera de las variables.
