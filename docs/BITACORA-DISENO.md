# BITACORA-DISENO.md — Rediseño de toda la interfaz

Rama `diseno-v1` (desde `v1-escuela`). Plan: `docs/PLAN-DISENO.md`. Especificación: `docs/diseno/SISTEMA-VISUAL.md`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| D0 | HECHO | 63f8e02 | Rama, bitácora y línea base de las tres validaciones |
| D1 | HECHO | 6ca1f90 | 1016 filas, capturas de antes, `npm run diseno:inventario` |
| D2 | PENDIENTE | | Cimientos |
| D3 | PENDIENTE | | Estructura general |
| D4 | PENDIENTE | | Componentes base |
| D5 | PENDIENTE | | Todo lo flotante |
| D6 | PENDIENTE | | Acceso y cuenta |
| D7 | PENDIENTE | | Asesor |
| D8 | PENDIENTE | | Conversión e inscripción |
| D9 | PENDIENTE | | Maestro, en celular |
| D10 | PENDIENTE | | Recepción |
| D11 | PENDIENTE | | Familias, alumnos y expediente |
| D12 | PENDIENTE | | Tableros |
| D13 | PENDIENTE | | Administración |
| D14 | PENDIENTE | | Fuera de React |
| D15 | PENDIENTE | | Movimiento y estados |
| D16 | PENDIENTE | | Accesibilidad y tamaños |
| D17 | PENDIENTE | | Guías, demo y galería |
| D18 | PENDIENTE | | Auditoría final |

## Dependencias nuevas

| Dependencia | Dónde | Motivo |
|---|---|---|
| `@fontsource-variable/figtree` y `@fontsource-variable/bricolage-grotesque` | `web` (dev) | Origen de los archivos `.woff2` de las dos fuentes del sistema visual. Los archivos latin y latin-ext se copian con `web/scripts/copiar-fuentes.mjs` a `web/public/fuentes/` (versionados, con su licencia OFL) y se sirven desde el propio origen. La política de seguridad sigue en `font-src 'self'`. |
| `@axe-core/playwright` | `web` (dev) | Revisión automática de contraste, nombres accesibles y etiquetas sobre todas las filas del inventario en el navegador (D16). |

## Decisiones que tomé

Cada una con la alternativa que descarté.

1. **Título «Iniciar sesión» (no «Inicia sesión» como en la referencia).** Las pruebas buscan el encabezado por ese nombre y el plan dice que los nombres accesibles que usan las pruebas se conservan. Descarté cambiar el texto y las pruebas.
2. **El campo «Escuela (opcional)» sigue visible en el acceso** (la referencia muestra solo el enlace «Tengo un código de escuela»). Una prueba exige el campo visible al abrir la pantalla y otras lo llenan directo. Descarté esconderlo tras un enlace.
3. **Marca del acceso sin nombre de escuela.** Antes de iniciar sesión no se sabe de qué escuela es la persona; el panel de marca lleva el monograma «G» y «Gestión de inscripciones» (el título de la aplicación) y el lema de la referencia. Descarté inventar un nombre de escuela o consultar la API sin sesión.
4. **«Sin permiso» y «módulo apagado» no se inventarían por ruta.** Son un solo componente (`SinAcceso`, `NoDisponible`). Hay una fila por rol y una por módulo, y su campo `ruta` lista las rutas que cubre. Descarté 45 rutas × 2 estados con la misma imagen.
5. **El selector «Tablero / Lista» es un selector segmentado con rol de pestañas** (`<Pestanas segmentada>`), no botones con `aria-pressed`: hay pruebas que buscan `tab «Lista»`. Lo mismo con el selector del método de pago si una prueba lo exige: se conserva el control y se estiliza.
6. **El aviso de leads sin movimiento se conserva como aviso (`role="alert"`) dentro de la fila de indicadores**, con su texto «N leads llevan días sin movimiento» y el botón «Ver solo los estancados»: hay pruebas que lo buscan así. La referencia lo dibuja como indicador de alerta con «Ver solo estos»; se respetó el aspecto, no el texto.
7. **Un solo selector de sucursal en el DOM a la vez** (en la barra lateral en escritorio, en la cabecera en celular, según el ancho): dos con la misma etiqueta rompen `getByLabel("Sucursal")` aunque uno esté oculto con CSS.
8. **«Salir» en celular es un botón de solo ícono con el mismo nombre accesible «Salir»** (el plan lo pide) y la cuenta es el avatar con el nombre accesible «Mi cuenta (nombre)».
9. **Color por omisión de la página pública de registro: el primario del sistema (`#3A32D1`)**, antes `#1F4E79`. La prueba `landing.itest.ts` que fija ese valor se actualizó al nuevo (misma fuerza de aserción).
10. **Las capturas se guardan como JPEG** (`docs/diseno/capturas/{antes,despues}/<id>-<vista>.jpg`): son cientos de imágenes por fase y el PNG las haría pesar varias veces más. Las de «antes» salen de la interfaz compilada del commit `31cd4ec` (`.tmp/dist-antes`), no de una reconstrucción.
11. **Fuentes versionadas en `web/public/fuentes/`** y no copiadas en el build: así el servidor (página pública de registro) y la interfaz usan las mismas rutas estables `/fuentes/*.woff2`.

## D0 — Preparación

- Rama `diseno-v1` creada desde `v1-escuela`.
- Línea base (commit `31cd4ec`, antes de tocar nada), 10 de octubre de 2026:
  - `npm run validar`: exit 0.
  - `npm run test:int`: 1448 pruebas, 1448 pasan, 0 fallan (exit 0, 454 s).
  - `npm run test:navegador`: 260 pasan, 1 omitida (ya omitida antes del rediseño), exit 0 (7.9 min).
