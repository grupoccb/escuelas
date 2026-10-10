# Revisión del área Asesor (prefijo `asesor-`)

Revisado el 10 de octubre de 2026 contra `docs/diseno/SISTEMA-VISUAL.md` y `referencia/Main.dc.html`. Capturas «despues» regeneradas con el código actual (268 pruebas pasaron, sin fallos ajenos al área), hojas de contacto abiertas todas (22 de escritorio, 27 de celular) y ampliadas las capturas individuales de embudo (tablero y lista), ficha, tareas y diálogos; comparadas con «antes».

## Resumen

1. 133 escenas revisadas en escritorio (1366) y celular (390). El rediseño está aplicado de forma consistente: barra lateral oscura, Bricolage en títulos y cifras, Figtree en el resto, paneles con borde, tarjetas del tablero con ícono de mover, etiquetas de estado, avisos y diálogos con el mismo aspecto. No quedó ninguna pantalla con el aspecto anterior (sin azul `#1f5fbf`, sin bordes de 8 px, sin fuente del sistema).
2. No hay hallazgos de gravedad alta. Hay 8 de gravedad media y 11 de baja.
3. Lo más repetido: el precio de las cotizaciones (el dato que la asesora viene a ver) está en 15 px Figtree y no en cifra de Bricolage; las tarjetas de tareas repiten tres botones de texto en vez de acciones compactas; y en celular la acción principal mide 44 px y no 52.
4. Estados vacíos y mensajes: `asesor-embudo-sin-etapas` queda en blanco, y varios vacíos no dicen el siguiente paso o, en el caso de tareas con filtro, dicen algo que no corresponde.
5. Las demás pantallas pedidas (tablero, lista, ficha con todas sus secciones, mover/perder/recuperar, marcar como inscrito, niños, cotizar, agendar/reprogramar/cancelar) cumplen colores, medidas de campos de 44 px, error de 2 px con mensaje que dice qué hacer, botón primario único y contraste. Nota de diseño ya decidida («Sin movimiento N d», «Mover de etapa») no se reporta.

## Hallazgos

| escena | vista | qué no cumple | regla o medida de SISTEMA-VISUAL | gravedad |
|---|---|---|---|---|
| `asesor-ficha-completa`, `asesor-cotizaciones-lista`, `asesor-cotizar-con-promociones`, `asesor-cotizar-desde-nino`, `asesor-cotizar-formulario`, `asesor-cotizar-hermanos-invalido`, `asesor-cotizar-error-guardar`, `asesor-cotizar-sin-conexion` | escritorio y celular | El precio de cada cotización («Inscripción $500.00 · Mensualidad $1,000.00») y la línea «Con lo que aplica hoy: inscripción … · mensualidad …» van en Figtree 700 de unos 15 px. Es el dato que se vino a ver al cotizar y no destaca más que el nombre del programa; no usa Bricolage ni tamaño de cifra (32 a 36 la principal, 28 la de indicador). | Regla 2; Tipografía «Cifra principal» y «Títulos y cifras: Bricolage»; `tabular-nums` en dinero | media |
| todas las escenas con botón primario en celular: `asesor-ficha-*` y `asesor-clases-*`/`asesor-cotizaciones-*`/`asesor-ninos-*`/`asesor-cotizar-*` (botón «Convertir e inscribir» / «Inscribir a los niños»), y los diálogos `asesor-mover-*`, `asesor-marcar-inscrito-*`, `asesor-nino-*`, `asesor-clase-agendar-*`/`reprogramar-*` («Mover», «Continuar», «Guardar», «Agendar») | celular | El botón primario mide 44 px de alto (medido en `asesor-ficha-vacia-celular`: 44 px; el de «Mover» en el diálogo, 41 a 44 px). La especificación pide 52 en la acción principal del celular. | Medidas «Alto mínimo: 52 en la acción principal del celular» | media |
| `asesor-tareas-pendientes-datos`, `-muchos`, `-filtro-tipo`, `-todos-los-tipos`, `-resolver-error`, `-resolver-ocupado`, `-descartar-sin-conexion`, `-resueltas-datos` | escritorio y celular | Cada tarjeta repite tres botones de texto de 44 px («Abrir la ficha», «Marcar como hecha», «Descartar»; en resueltas, «Abrir la ficha»). En celular se apilan en dos filas, de modo que una lista de tareas es una pared de botones. La acción repetida en cada tarjeta debe ser compacta (solo ícono). Además el nombre de la familia queda a 15 px igual que el tipo de tarea y la instrucción («Retomar el contacto…») no destaca. | Componentes «Tarjeta de lista»: acciones repetidas en solo ícono; Regla 2 | media |
| `asesor-embudo-sin-etapas` | escritorio y celular | Con 0 etapas el tablero queda en blanco bajo los filtros: no hay estado vacío, ni ícono, ni frase de qué pasó ni qué hacer. | Componentes «Estado vacío» | media |
| `asesor-nino-agregar-fecha-mala` | escritorio y celular | Con la fecha 01/01/2099 el campo no se marca como error (sin borde de 2 px ni mensaje rojo); solo aparece «Revisa la fecha de nacimiento.» en gris como ayuda y «Guardar» queda deshabilitado. En `asesor-nino-agregar-edad-mala` el mismo tipo de error sí se pinta bien, así que es inconsistente. | Componentes «Campos»: con error, borde de 2 px `--peligro` y mensaje debajo en `--peligro`, peso 600 | media |
| `asesor-ficha-completa`, `asesor-cotizaciones-lista` | escritorio y celular | La etiqueta «Vencida» de una cotización sale neutra (gris), igual que «Del bot» y «A mano». «Vencido» está definido como etiqueta de estado con el par suave/fuerte de su color (peligro); hoy no se distingue de las etiquetas de fuente. | Componentes «Etiquetas» de estado (vencido); Regla 4 | media |
| `asesor-tareas-filtro-sin-resultados` | escritorio y celular | Con el filtro «Deuda vencida» y sin resultados dice «No hay tareas pendientes — Cuando el sistema deje algo para una persona, aparecerá aquí». No dice que es el filtro lo que no encuentra nada ni cómo quitarlo; puede leerse como que la persona no tiene tareas. | Componentes «Estado vacío»: qué pasó y siguiente paso | media |
| `asesor-embudo-filtros-sin-resultados`, `asesor-embudo-tablero-vacio`, `asesor-embudo-lista-vacio` | escritorio y celular | «No hay leads con estos filtros» no dice el siguiente paso (quitar «Solo estancados», cambiar la fuente). Además, debajo del mensaje se siguen dibujando las columnas en cero o la cabecera de la tabla sin filas, de modo que la pantalla muestra a la vez el vacío y la estructura vacía. | Componentes «Estado vacío» | media |
| `asesor-tareas-resueltas-vacio`, `asesor-ficha-vacia` (Niños), cotizaciones/clase muestra en cualquier ficha | escritorio y celular | «Todavía no hay tareas resueltas», «Todavía no se le cotiza nada», «No tiene clase muestra», «Todavía no hay cambios de etapa registrados» no incluyen la frase del siguiente paso; solo «Niños» la tiene. Inconsistente dentro de la misma ficha. | Componentes «Estado vacío» | baja |
| `asesor-embudo-lista-datos`, `asesor-embudo-lista-muchos`, `asesor-embudo-lista-inscripcion-apagada`, `asesor-embudo-lista-solo-estancados`, `asesor-mover-lista-abierto` | escritorio y celular | En la lista (tabla y tarjetas de celular) el nombre del lead va subrayado, en indigo y en peso 700 sobre 14 px; en las tarjetas del tablero el nombre va sin subrayado, 15/22. Las tarjetas de la lista de celular son tarjetas de lista con nombre subrayado. | Componentes «Tarjeta de lista»: nombre en 15/22 peso 700, sin subrayado | baja |
| `asesor-embudo-inscripcion-apagada` y `asesor-embudo-lista-inscripcion-apagada` | escritorio y celular | Cada tarjeta/fila lleva dos íconos sueltos, una palomita (marcar como inscrito) y una flecha (mover de etapa). La palomita sin texto se lee como «hecho»; no hay nada visible que distinga su función. | Regla 4 (señal por ícono más texto); Componentes «solo ícono, con nombre accesible» | baja |
| `asesor-ficha-sin-sucursal`, `asesor-cotizar-sin-sucursal`, `asesor-ficha-elegir-sucursal-error`, `asesor-ficha-chatwoot-sin-direccion`, `asesor-mover-conflicto`, `asesor-marcar-inscrito-conflicto`, `asesor-marcar-inscrito-sin-etapa`, `asesor-clase-agendar-sin-grupos`, `asesor-clase-agendar-sin-sesiones` | escritorio y celular | Los avisos (ámbar, rojo, indigo, verde) llevan una franja izquierda de 3 a 4 px en un tono más oscuro que no está definido; la especificación solo da el par suave más el borde `#F0C56A` para alertas. Es coherente en toda el área, pero es un valor fuera de la hoja del sistema. | Regla 5; Colores («alerta»: borde `#F0C56A`) | baja |
| `asesor-ficha-*` y `asesor-nino-*` | celular | «← Volver al embudo» es un enlace de unos 16 px de alto y 12.5 de tamaño; su zona táctil es menor de 44 px. En escritorio, «Salir» de la barra lateral tiene el mismo problema. | Medidas «Alto mínimo: 44 en todo lo que se toca» | baja |
| `asesor-embudo-*`, `asesor-tareas-*`, `asesor-ficha-*` | celular | En la barra inferior «Más» usa tres puntos de texto («···») y no un ícono de trazo como los demás. | Íconos de trazo, 1.6, 24 px | baja |
| `asesor-nino-agregar-edad-mala` | escritorio y celular | Se muestran a la vez el mensaje de error («Escribe un número») y una ayuda gris («La edad es un número.») que dice lo mismo. | Campos: un mensaje que dice qué hacer, sin duplicar | baja |
| `asesor-clase-agendar-*` (todas con sesiones) | escritorio y celular | Las opciones de sesión tienen el texto centrado y parten la línea dejando «· 5 lugares» huérfano al inicio de la segunda línea («lunes 12 de octubre a las 16:00 · / 5 lugares»); la etiqueta «Sesión» queda unos 4 px desalineada respecto a «Alumno» y «Grupo». | Tipografía/Espacios (jerarquía y alineación de la hoja) | baja |
| `asesor-embudo-cargando`, `asesor-ficha-cargando`, `asesor-tareas-cargando` | escritorio y celular | La pantalla completa es un «Cargando…» pequeño en gris en la esquina superior; sin título de pantalla ni estructura, y en celular casi no se ve. | Regla 2 (la pantalla pierde su título y su estructura mientras carga) | baja |
| `asesor-embudo-tablero-datos`, `asesor-embudo-tablero-muchos`, `asesor-embudo-filtro-fuente`, `asesor-embudo-solo-estancados`, `asesor-embudo-administrador-tablero` | celular | Antes de llegar al tablero (lo que la persona viene a ver) hay que pasar unos 700 px de buscador, descarga, indicadores, filtros y selector de vista; en el primer pantallazo solo se ve el encabezado del tablero. | Regla 2 | baja |
| `asesor-ficha-muchos` | escritorio y celular | Con 8 conversaciones de Chatwoot los botones se apilan en tres filas bajo el título y empujan el contenido; el primario queda al final. (Caso de estrés, pero rompe la cabecera.) | Regla 1/Regla 2 | baja |

## Escenas revisadas sin hallazgos propios

Estas escenas no tienen hallazgos adicionales a los transversales de arriba (precio, botón primario de 52 px en celular, «Volver al embudo», «Más»). Ids:

- `asesor-clase-agendar-abierto`
- `asesor-clase-agendar-buscando`
- `asesor-clase-agendar-dos-alumnos`
- `asesor-clase-agendar-error-sesiones`
- `asesor-clase-agendar-sesion-elegida`
- `asesor-clase-agendar-sin-conexion`
- `asesor-clase-agendar-sin-cupo`
- `asesor-clase-agendar-sin-horario`
- `asesor-clase-cancelar-abierto`
- `asesor-clase-cancelar-con-motivo`
- `asesor-clase-cancelar-error`
- `asesor-clase-cancelar-sin-conexion`
- `asesor-clase-reprogramar-abierto`
- `asesor-clase-reprogramar-error`
- `asesor-clases-asistida`
- `asesor-clases-cargando`
- `asesor-clases-error`
- `asesor-clases-variadas`
- `asesor-cotizaciones-cargando`
- `asesor-cotizaciones-error`
- `asesor-cotizaciones-vacio`
- `asesor-cotizar-buscando`
- `asesor-cotizar-error-carga`
- `asesor-cotizar-programa-sin-precio`
- `asesor-cotizar-sin-edad`
- `asesor-cotizar-sin-programa`
- `asesor-embudo-error`
- `asesor-ficha-administrador`
- `asesor-ficha-administrador-otra-sucursal`
- `asesor-ficha-chatwoot-dos-conversaciones`
- `asesor-ficha-con-clase-muestra`
- `asesor-ficha-contactado`
- `asesor-ficha-de-otra-sucursal`
- `asesor-ficha-error`
- `asesor-ficha-estancado`
- `asesor-ficha-historial-error`
- `asesor-ficha-inscripcion-apagada`
- `asesor-ficha-inscrito-a-mano`
- `asesor-ficha-inscrito-con-inscripcion`
- `asesor-ficha-marcar-inscrito-abierto`
- `asesor-ficha-mover-abierto`
- `asesor-ficha-no-encontrado`
- `asesor-ficha-nuevo-chatwoot-tarea`
- `asesor-ficha-perdido`
- `asesor-ficha-sin-modulos`
- `asesor-ficha-tarea-resolver-error`
- `asesor-ficha-vacia`
- `asesor-marcar-inscrito-confirmar`
- `asesor-marcar-inscrito-error-servidor`
- `asesor-marcar-inscrito-listo`
- `asesor-marcar-inscrito-nota`
- `asesor-marcar-inscrito-nota-corta`
- `asesor-marcar-inscrito-nota-vacia`
- `asesor-marcar-inscrito-sin-conexion`
- `asesor-mover-abierto`
- `asesor-mover-error-servidor`
- `asesor-mover-etapa-elegida`
- `asesor-mover-inscripcion-apagada`
- `asesor-mover-perder-con-motivo`
- `asesor-mover-perder-sin-motivo`
- `asesor-mover-recuperar-con-nota`
- `asesor-mover-recuperar-sin-nota`
- `asesor-mover-sin-conexion`
- `asesor-nino-agregado-con-aviso`
- `asesor-nino-agregar-abierto`
- `asesor-nino-agregar-error-campo`
- `asesor-nino-agregar-error-general`
- `asesor-nino-agregar-listo`
- `asesor-nino-agregar-sin-conexion`
- `asesor-nino-agregar-sin-fecha`
- `asesor-nino-agregar-varias-disciplinas`
- `asesor-nino-agregar-y-otro`
- `asesor-nino-corregir-abierto`
- `asesor-nino-corregir-error-servidor`
- `asesor-nino-corregir-sin-nombre`
- `asesor-nino-quitar-abierto`
- `asesor-nino-quitar-error`
- `asesor-nino-quitar-sin-conexion`
- `asesor-ninos-vacio`
- `asesor-ninos-variados`
- `asesor-tareas-error`
- `asesor-tareas-pendientes-vacio`
- `asesor-tareas-resueltas-error`
