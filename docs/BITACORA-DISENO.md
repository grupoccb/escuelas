# BITACORA-DISENO.md — Rediseño de toda la interfaz

Rama `diseno-v1` (desde `v1-escuela`). Plan: `docs/PLAN-DISENO.md`. Especificación: `docs/diseno/SISTEMA-VISUAL.md`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| D0 | HECHO | 63f8e02 | Rama, bitácora y línea base de las tres validaciones |
| D1 | HECHO | 6ca1f90 | 1016 filas, capturas de antes, `npm run diseno:inventario` |
| D2 | HECHO | 614b67e | Variables de `base.css`, Figtree y Bricolage desde `/fuentes`, tema único claro, `npm run check:estilo` dentro de `validar` |
| D3 | HECHO | 614b67e | Barra lateral (marca, íconos, usuario), cabecera y barra inferior de celular, foco de 2 px |
| D4 | HECHO | 614b67e | Botones, campos, selector segmentado, etiquetas, paneles, indicadores, tablas apiladas, pestañas, vacíos |
| D5 | HECHO | 614b67e | Diálogos, avisos (sobre el diálogo), barra de guardado, menús, sesión vencida |
| D6 | HECHO | 3ff58c8 | Inicio de sesión, «Más», sin acceso, no disponible, no encontrada |
| D7 | HECHO | 5fd1172 | Embudo, tareas, ficha del lead, cotizar, agendar, mover, perder, recuperar |
| D8 | HECHO | 5dd78eb | Pasos de la conversión, hermanos, rechazos, éxito, cierre en sitio |
| D9 | HECHO | a0bffb2 | Hoy, registro del alumno, pase de lista, salud, sin señal |
| D10 | HECHO | 12d3247 | Buscar familia, pagos, estado de cuenta, uniformes, ventas, cierre; impresión |
| D11 | HECHO | a119257 | Alumnos, expediente, familias, ficha de familia, acciones de inscripción |
| D12 | HECHO | 50ed20d | Tableros con paleta del sistema, legibles sin color |
| D13 | HECHO | 124de45 | Catálogo, precios, módulos, usuarios, configuración, textos, etapas, motivos, canales, campañas, plantillas, automatizaciones, bandeja |
| D14 | HECHO | 9ef845b | Página pública de registro, favicon, título, política de seguridad con `font-src 'self'` |
| D15 | HECHO | d8d433e | Transiciones de 120/180 ms, movimiento reducido, estados; esquinas y sombras solo de variables |
| D16 | HECHO | d5db578 | axe sobre 1017 filas, recorrido con teclado, 390/1366/1920 px y texto al 200 % |
| D17 | HECHO | c3fb1ba | Guías (imágenes y PDF), capturas de la demo y de recorrido, `galeria.html` |
| D18 | HECHO | 1f6b647 | Auditoría final de 1014 filas por 8 auditores, correcciones verificadas por un agente distinto (`docs/diseno/auditoria/`) |

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


## D18 — Auditoría final

Ocho auditores nuevos recorrieron el inventario fila por fila (`docs/diseno/auditoria/<grupo>.md`): ~55 hallazgos distintos, ninguno de gravedad alta. Cuatro agentes corrigieron (estilos comunes, composición por pantalla, jerarquía de botones y landing, escenas) y un quinto, distinto, los verificó contra las capturas nuevas (`docs/diseno/auditoria/VERIFICACION.md`): 11 puntos CORREGIDO, 0 sin corregir, 0 que empeoraran, sin regresiones altas ni medias.

Evidencia, 10 de octubre de 2026 (última corrida, con el código final y las 1014 filas recapturadas):

- `npm run validar`: exit 0 (104 pruebas de la interfaz, todos los `check:*`).
- `npm run test:int`: 1448 pruebas, 1448 pasan, 0 fallan, exit 0 (453 s).
- `npm run test:navegador`: 260 pasan, 1 omitida (la misma que en la línea base), exit 0 (8.2 min).
- `npm run diseno:inventario`: «1014 filas, rutas, flotantes y clases cotejadas»; ninguna fila sin captura de después.

### Resumen en diez líneas

1. Toda la interfaz usa Figtree/Bricolage, el índigo `#3A32D1`, esquinas de 10/12/16, tarjetas con borde y la escala de espacios; ninguna pantalla conserva el aspecto anterior.
2. Se quitaron las últimas franjas gruesas (lista de errores de la carga, nota de «Marcar como inscrito», resumen de errores de la landing).
3. Una sola acción principal por pantalla en «Hoy» del maestro, el cierre en sitio y el cotizador.
4. El botón que confirma un cobro cancelado o una venta anulada mide 52 px (`grande`), como el resto de los formularios de dinero.
5. La barra inferior del celular tiene alto fijo y no mueve los íconos cuando una etiqueta parte en dos renglones; la barra lateral deja leer «Administración» a 1366×768.
6. Los avisos «ya quedó» salen siempre abajo y el diálogo se acorta para no quedar tapado.
7. Tableros: indicadores del mismo alto, tablas «En tabla» con el alto de las demás, gastos de la campaña sin tarjetas de 270 px en celular.
8. Doce escenas que no mostraban el estado de su título se rehicieron (grupo lleno, sin motivos, reparto «sobran»/«faltan», etc.); tres filas de modo oscuro se retiraron (el sistema tiene un solo tema): el inventario pasó de 1017 a 1014 filas.
9. Landing pública y página sin JavaScript con el mismo sistema (borde parejo, foco `--foco`, «Enviando…» deshabilitado del sistema, titular 30/34).
10. Las tres validaciones completas dan exit 0.

### Las cinco cosas que Eduardo debe ver primero

1. **Hoy del maestro en celular** (`maestro@demo.test`): un solo botón principal por tarjeta; tras un rechazo del cierre en sitio, «Avisar al asesor» pasa a primario (decisión mía, se revierte con una línea).
2. **Registrar pago y diálogos de cancelar pago / anular venta en recepción** (celular): campo de monto, reparto a mano y botones de 52 px.
3. **Administración en 1366×768**: barra lateral completa con «Administración» legible; después Tableros (indicadores y «En tabla»).
4. **Cotizar en la ficha del asesor**: «Guardar cotización» como único primario mientras el formulario está abierto.
5. **Página pública de registro** con errores y el aviso de privacidad desplegado (`/l/<identificador de la disciplina>`, ver `docs/ALTA-DE-CLIENTE.md`), y `docs/diseno/galeria.html` para el antes y el después de las 1014 filas.

### Decisiones para Eduardo (no se tocaron)

1. **Botones con texto repetidos en cada tarjeta** («Marcar como hecha», «Marcar atendido», «Código QR», «Cotizar» por niño, «Marcar entregado», «Elegir», «Dar de baja» de cada gasto): el sistema pide solo ícono para acciones repetidas, pero las pruebas y el sentido de cada acción dependen del texto. Cambiarlo es una decisión de producto.
2. **Color del avatar de iniciales**: la tabla de `SISTEMA-VISUAL.md` dice `--primario-suave` (`#ECEBFC`) y `Recepcion.dc.html` dibuja `#DAD8FA`. Se dejó el de la tabla.
3. **`conv-zeta-reglamento-sin-clase-muestra`**: el título dice «Siguiente bloqueado», pero el comportamiento real es que el reglamento se valida al confirmar (el servidor solo lo avisa antes cuando el lead ya tiene grupo guardado). Cambiar el título de la fila, o armar la escena con un lead con grupo guardado.
4. **`adminc-inicio-cargando`**: la pantalla no pinta «Cargando…» mientras llegan los primeros pasos, así que ese estado no existe; la fila se retituló. Si se quiere un estado de carga, requiere código.
5. **La raya bajo la «Q»** de «Quitar a Niña Alfa» es la cola plana de la «Q» de Bricolage Grotesque 700 (se comprobó sin subrayado): es un rasgo de la fuente de la referencia.
6. **Medidas menores abiertas**: la barra inferior del celular mide 76 px y `--alto-barra` declara 72; el tono más oscuro de «Buscar», «Agendar» y «Capturar el gasto» en algunas capturas es el estado pulsado que queda puesto por el arnés (variable `--primario-fuerte`); «Tareas» en negrita oscura en las cinco capturas `adminc-*-aviso-guardado` es el puntero sobre la barra.
7. **Herramienta**: el flujo de capturas en paralelo (`diseno:todo`) pisa `docs/diseno/clases-observadas.json` (las siete tandas lo escriben a la vez); hay que unir la versión anterior con la nueva antes de correr `diseno:inventario` (así se hizo aquí).
