# Verificación independiente de las correcciones de la auditoría D18

Método: solo lectura de `docs/diseno/capturas/despues/`. Cada dictamen sale de abrir la captura nueva con Read y, donde se indica, de medir píxeles con PIL (alto de botones, colores, franjas). Hojas de contacto de `maestro`, `recep`, `asesor` y `adminc` en `.tmp/hojas/ver-*`. No se corrió ningún servidor ni prueba, y no se tocó código, escenas ni capturas.

Limitación: la herramienta de imágenes devolvió algunas lecturas vacías por límite de peticiones. Esas se repitieron hasta verlas; las que siguen sin confirmación visual propia están marcadas («solo medición»).

## Tabla de dictámenes

| punto | ids | dictamen | evidencia |
|---|---|---|---|
| 1 | `adminc-catalogo-errores-por-fila`, `adminc-catalogo-errores-muchos` (ambas vistas) | CORREGIDO | Cada fila de error es una caja gris con borde parejo de 1 px rojo y esquinas redondeadas. Medido en escritorio: un solo píxel rojo en el borde izquierdo (x=285), antes 4 px. En celular las cajas también tienen borde completo y relleno de 12/16. |
| 2 | `asesor-marcar-inscrito-confirmar`, `-conflicto` (ambas vistas) | CORREGIDO | La nota citada es un recuadro gris `--fondo` con esquinas de 10 y sin franja índigo, en escritorio y en celular (visto). Los avisos de conflicto de abajo siguen con borde parejo. |
| 3 | `recep-pagos-cancelar-dialogo-motivo`, `recep-ventas-anular-dialogo-error` (celular); `recep-pagos-monto-parcial` (celular) | CORREGIDO | Botón destructivo medido de borde a borde: 52 px en los dos diálogos (filas 531–582 y 573–624). «Registrar pago» en `recep-pagos-monto-parcial` sigue entero (50–52 px, relleno `--primario`), con «Pagos recientes» debajo y sin romper la pantalla. |
| 4 | `acceso-error-de-carga-404`, `familia-ficha-no-encontrada` (ambas vistas) | CORREGIDO | «Ir a mi inicio» ahora es secundario: fondo blanco, borde gris `--borde-boton`, texto oscuro. Ya no lleva texto ni borde rojo. Igual que «Reintentar». |
| 5 | `admins-textos-modulos-apagados`, `acceso-marco-recepcion`, `acceso-mas-recepcion` (celular) | CORREGIDO (ver observación del alto) | En «Registrar pago» y «Estado de cuenta» (dos renglones) los íconos quedan en la misma línea que los de una sola línea. La barra empieza en y=768 en todas las capturas medidas, así que no hay barra más alta con etiqueta partida. Observación: mide 76 px, no 72. |
| 5b | `recep-pagos-monto-parcial`, `maestro-pase-guardado`, `admins-configuracion-guardada` (celular) | CORREGIDO | La barra de «Guardar pase de lista» y la de «Guardar la configuración» flotan justo encima de la barra inferior sin tapar contenido ni botones. «Registrar pago» queda con espacio debajo. En capturas de página completa la barra aparece a media altura: efecto del arnés, ya descartado antes. |
| 6 | `acceso-marco-administrador`, `familia-salud-ficha`, `recep-corte-hoy-administrador` (escritorio) | CORREGIDO | «Administración» se ve completo, en `--lateral-texto`, con ícono, sin desvanecido y separado de la línea del usuario. Las barras de asesor (`asesor-embudo-tablero-datos`) y de recepción (`recep-corte-hoy`) están íntegras, con espacios parejos. |
| 7 | `adminc-promociones-aviso-beneficio`, `tabl-gastos-aviso-capturado` (celular y escritorio) | CORREGIDO | En celular el aviso oscuro sale abajo (y≈750–830), debajo del diálogo, y el título «Nueva promoción» / «Gastos de la campaña» se lee. En escritorio sigue al lado, abajo, sin tapar el diálogo. |
| 8 | `maestro-hoy-cierre-en-sitio-listo`, `-grupo-lleno`, `conv-cierre-listo`, `conv-cierre-rechazo-grupo-lleno`, `asesor-cotizar-formulario`, `asesor-cotizar-con-promociones` (ambas vistas) | CORREGIDO | Escaneo de píxeles `#3A32D1`: 1 botón relleno por captura en las 12 (el primario «Inscribir a mi alumno» o «Guardar cotización»). «Registro del alumno» y «Convertir e inscribir» ya no son primarios. Cero rellenos `#2B2699`. |
| 9a | `tabl-gastos-con-gastos` (celular) | CORREGIDO | Las tarjetas miden unos 110–120 px (antes 270), con texto arriba y «Dar de baja» debajo, sin hueco. |
| 9b | `tabl-clases-con-datos` (escritorio) | CORREGIDO | Las tres tablas «En tabla» tienen encabezado de ~28 px y filas de ~32 px, texto centrado. Los 5 indicadores de arriba tienen la misma altura. |
| 9c | `tabl-ejecutivo-con-datos` (escritorio) | CORREGIDO | Los 5 indicadores van en una fila con la misma altura (~80 px). |
| 9d | `familia-alumnos-lista-paginacion` (celular) | CORREGIDO | «Anterior» y «Siguiente» ocupan cada uno la mitad del ancho, con el texto «Página 2 de 4 · 65 en total» centrado arriba. |
| 9e | `asesor-cotizar-formulario` (celular) | CORREGIDO | La lista dice «Programa de prueba · $1,000.00 al mes» en dos renglones, sin puntos suspensivos. |
| 9f | `asesor-embudo-inscripcion-apagada` (escritorio) | CORREGIDO | «Directo» y «Norte» van en una sola línea, con los íconos de marcar y mover a la derecha. |
| 9g | `asesor-ficha-muchos` (ambas vistas) | CORREGIDO | Escritorio: título arriba, primario «Inscribir a los niños» debajo y 8 botones de Chatwoot en rejilla de 3 columnas, cada uno en una línea. Celular: primario arriba y los botones de Chatwoot en una fila de desplazamiento horizontal (asoma el siguiente), sin empujar 460 px. |
| 9h | `asesor-ficha-elegir-sucursal-error` (escritorio) | CORREGIDO | El aviso «Esa sucursal no ofrece la disciplina…» ocupa el ancho completo de la tarjeta, en una línea. |
| 9i | `recep-corte-con-devoluciones` (escritorio) | CORREGIDO (con reserva) | Medido: «Caja» 32 px, «Todo el día» ~36, «Se devolvió» ~25, «Neto del día» 32 en panel resaltado. Hay una jerarquía legible: lo devuelto es lo menor y el neto va destacado. Pero el 25 px no está en la escala y «Caja» (32) queda menor que «Todo el día». |
| 9j | `admins-canales-con-datos` (celular) | CORREGIDO | El ícono de bandeja va en la misma línea que el texto «Bandeja: Vertical Prueba (cuenta …, bandeja …)». |
| 9k | `admins-configuracion-guardada` (celular) | CORREGIDO (con reserva) | La palomita es verde `--exito`, junto al texto, ya no gris ni aplastada a 6 px. Se ve de unos 12 px, menos que los 20 px de la escala. |
| 10a | `fuera-landing-errores-vacio` (ambas vistas) | CORREGIDO | La franja izquierda mide 1 px (x=443, antes 4). El anillo ya no es el azul del navegador: es un anillo índigo de 2 px con 2 px de separación, el `--foco` del sistema. Sigue visible porque el resumen recibe el foco; si se quería quitar, queda. |
| 10b | `fuera-landing-enviando` | CORREGIDO | El botón es gris `--fondo` con texto `#6B7085` y borde `--borde`, igual que el deshabilitado del sistema (medido ≈ 245,246,251). |
| 10c | `fuera-landing-aviso-desplegado` | CORREGIDO | El bloque del documento lleva chevron (hacia abajo cerrado, hacia arriba abierto) y el contenido abierto se ve. |
| 10d | `fuera-sin-javascript` (ambas vistas) | CORREGIDO | El aviso es un panel ámbar con borde, relleno y margen de 16/32, a 16 px de texto, ya no pegado a la esquina. |
| 10e | `fuera-pestana-ventana-chica` | CORREGIDO | Aparecen las dos filas, sobre blanco y sobre oscuro, y el título «Iniciar sesión · Gestión» ya sale en sans. Observación: la captura de celular mide 980×2121, no 390. |
| 10f | `fuera-landing-marca` (ambas vistas) | CORREGIDO | Solo un logo (píldora morada con «D») más el nombre «Vertical Prueba»; ya no hay monograma «VP» duplicado. |
| 11a | `familia-acciones-cambiar-grupo-lleno` | CORREGIDO | Ya no es igual a «cambiar-vacio». La lista muestra «Grupo E · lleno» en gris, no elegible. |
| 11b | `familia-acciones-baja-sin-motivos` | CORREGIDO | Ya no es igual a «baja-vacio»: el selector se ve como lista vacía con solo «Elige un motivo». Se ve como listbox nativo gris (ver regresiones). |
| 11c | `recep-pagos-reparto-a-mano-sobran` / `-faltan` | CORREGIDO | «Suma: $1,700.00 de $1,500.00 · sobran $200.00» y «$1,499.99 de $1,500.00 · faltan $0.01». Cada captura muestra el estado de su título. |
| 11d | `recep-pagos-pago-registrado` | CORREGIDO | El recibo lista «Diego · Inscripción $150.00» y «Valeria · Inscripción $250.00», dos hijos distintos (celular: Lucía y Mateo, solo vista parcial). |
| 11e | `asesor-clase-agendar-dos-alumnos` | CORREGIDO (con reserva) | Ahora el selector muestra «Hermano Alfa» (antes «Niña Alfa»), distinto de «agendar-abierto». El desplegable sigue cerrado: no se ven los dos nombres a la vez. |
| 11f | `adminc-inicio-muchos` | CORREGIDO | Muestra el panel con la lista de pasos abierta (Listo / Falta) en escritorio y celular. |
| 11g | `tabl-clases-cargando` | CORREGIDO | Conserva barra lateral, título «Tableros», pestañas y filtros, con «Cargando…» abajo (escritorio y celular). |
| 11h | `tabl-gastos-validacion-monto-con-decimales` | CORREGIDO | En ambas vistas se ve el campo con borde rojo `12.345` y el mensaje «Escribe un importe válido mayor que cero…». |
| 11i | `acceso-marco-saltar-al-contenido` (escritorio) | CORREGIDO | Se ve el enlace «Saltar al contenido» enfocado, con anillo completo, arriba a la izquierda sobre la barra lateral. |
| 11j | `maestro-pase-guardado` (escritorio) | CORREGIDO | La barra «Pase guardado a las 07:47 p.m.» queda sobre el aviso verde, que se lee completo («3 nuevas, 0 corregidas…», «Cira Prueba lleva 3 faltas seguidas…»). |
| 11k | `familia-alumnos-lista-cargando` (escritorio y celular) | CORREGIDO | Ahora muestra título «Alumnos», buscador y filtro con «Cargando…» abajo (visto en ambas vistas). |

## Regresiones nuevas

Revisadas las hojas completas de `maestro` (celular, 22), `recep` (celular, 20), `asesor` (celular, 27; solo 11 hojas vistas con certeza) y `adminc` (celular, primeras 6 hojas con certeza). No encontré nada roto de gravedad media o alta atribuible a esta ronda; lo que sigue es menor o persiste de la auditoría original.

| id | vista | qué se ve mal | gravedad |
|---|---|---|---|
| `recep-cuenta-buscador-resultados`, `recep-cuenta-buscador-sin-resultados`, `recep-pagos-buscador-buscando` (y la familia `recep-pagos-buscador-*`) | celular | «Buscar» sigue relleno de `#2B2699` (`--primario-fuerte`), más oscuro que el `#3A32D1` de «Registrar pago». Persiste de la auditoría original, no es nuevo. | media |
| `asesor-clase-agendar-sin-conexion`, `-sin-cupo`, `-sin-horario`; `tabl-gastos-validacion-monto-con-decimales` | celular | «Agendar» y «Capturar el gasto» salen en `#2B2699` en vez de `--primario`. Probablemente estado pulsado que quedó puesto. | baja |
| `adminc-grupos-aviso-guardado` (y `adminc-instructores-`, `-programas-`, `-promociones-`, `-verticales-aviso-guardado`) | celular | «Tareas» sale en negrita oscura en la barra inferior, como activa, aunque la pantalla cuelga de «Más». Persiste del informe original. | baja |
| `asesor-clase-agendar-abierto`, `-buscando`, `-dos-alumnos`, `-sin-conexion` | celular | El diálogo llega casi al borde de abajo y deja ver el segundo renglón cortado de la etiqueta «Estado de cuenta» de la barra («cuenta») debajo de su borde. | baja |
| todas las pantallas con barra inferior (p. ej. `acceso-marco-recepcion`, `recep-pagos-buscador-inicial`) | celular | La barra mide 76 px (empieza en y=768 de 844), no los 72 de `--alto-barra` ni los 64 fijos de la descripción. Es consistente entre pantallas, pero no coincide con la medida declarada. | baja |
| `tabl-gastos-con-gastos`, `tabl-gastos-aviso-quitado` | celular | Cada gasto repite un botón destructivo «Dar de baja» de ancho completo; la regla de tarjeta pide ícono solo para acciones repetidas. Mejor que los 270 px de antes. | baja |
| `familia-acciones-baja-sin-motivos`, `familia-acciones-cambiar-grupo-lleno` | escritorio | El selector se dibuja como listbox nativo con fila gris de selección, fuera de los campos del sistema. | baja |
| `asesor-ficha-administrador` | celular | «Abrir conversación en Chatwoot» a medio ancho justo encima del primario a ancho completo: dos anchos distintos seguidos. | baja |
| `fuera-pestana-ventana-chica` | celular | La captura mide 980×2121 en lugar de 390 de ancho. | baja |

Descartados como efecto del arnés (no se cuentan): barra inferior fija a media altura en capturas de página completa (`recep-pagos-pago-registrado`, `asesor-embudo-lista-solo-estancados`), y el tono oscuro de botones tras un clic.

## Resumen

1. Puntos verificados: 11 de 11 con dictamen CORREGIDO; 52 ids revisados (varios en ambas vistas), 0 NO CORREGIDO y 0 EMPEORÓ.
2. CORREGIDO con reserva: 4 (cifras de `recep-corte-con-devoluciones`, palomita pequeña de `admins-configuracion-guardada`, `asesor-clase-agendar-dos-alumnos` con el desplegable cerrado, anillo de foco índigo que sigue en `fuera-landing-errores-vacio`).
3. Regresiones nuevas atribuibles a esta ronda: 0 de gravedad alta, 0 de media. Hay 9 observaciones menores (8 baja, 1 media que ya estaba en la auditoría original).
4. Siguen abiertos de la auditoría original y fuera de los 11 puntos: «Buscar» en `#2B2699` (recep) y «Tareas» oscura en la barra de `adminc-*-aviso-guardado`.
5. No pude confirmar con vista propia el resto de hojas de asesor/adminc más allá de las primeras; esas partes no muestran fallos en lo visto, pero no son una revisión exhaustiva.
