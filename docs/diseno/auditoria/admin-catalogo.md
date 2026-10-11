# Auditoría D18 — Administración, catálogo, precios y carga (`adminc-`)

## (a) Resumen

- Filas revisadas: **185** (370 capturas, escritorio 1366 y celular 390; las 185 tienen ✔ en antes y después en `INVENTARIO.md` y las 370 imágenes existen). Leí las 68 hojas de contacto (31 de escritorio, 37 de celular) y abrí a tamaño real lo dudoso.
- Hallazgos: **17 filas con hallazgo**, 168 sin hallazgo. Por tipo (filas): tipo 1 = 3; tipo 2 = 5; tipo 3 = 5; tipo 4 = 4.
- Por gravedad (filas): alta = 0; media = 8; baja = 9.
- No encontré azul `#1f5fbf` como color de interfaz (el único azul parecido está en `adminc-verticales-variedad` y es el dato «Color de marca» de una disciplina, un punto de muestra), ni tipografía del sistema, ni esquinas de 8, ni sombras de tarjeta anteriores. Medí botones sobre las capturas: primario de 52 px en celular y 44 px en escritorio; en el formulario de dinero (precios) «Guardar la nueva vigencia» mide 52 y «Cancelar» 44, igual que `Recepcion.dc.html`.
- Decisiones ya tomadas (no cuentan): «Cerrar» en diálogos de promociones, fechas y horas nativas, estado vacío con borde discontinuo, `Choose Files` nativo.

## (b) Hallazgos (ordenados por gravedad)

| id de la fila | vista | tipo | qué se ve mal | dónde lo prueba | gravedad |
|---|---|---|---|---|---|
| `adminc-catalogo-errores-por-fila` | escritorio y celular | 2 | Cada error de fila («Fila 4, columna "Capacidad": …») lleva una franja gruesa roja a la izquierda (4 px, `--peligro`) sobre un fondo gris: es el patrón de aviso con franja del diseño anterior; los demás avisos de la pantalla ya son recuadros con borde completo. El relleno de cada fila es de 10 px (fuera de 4/8/12/16/20/32). Se ve en `capturas/despues/adminc-catalogo-errores-por-fila-escritorio.jpg` (y≈1100–1700) y `-celular.jpg` (y≈1500–2300). En código: `web/src/estilos/base.css` línea 1057, `.lista-errores li` con `padding: 10px` y `border-left: 4px solid var(--peligro)`. | Hallazgo tipo 2 («franjas gruesas a la izquierda de los avisos»); SISTEMA-VISUAL, Medidas: Espacios 4, 8, 12, 16, 20 y 32 | media |
| `adminc-catalogo-errores-muchos` | escritorio y celular | 2 | Igual: 13 filas de error con franja roja de 4 px a la izquierda y relleno de 10 px. | Igual | media |
| `adminc-catalogo-errores-archivo-desconocido` | escritorio y celular | 2 | Igual: las dos filas de error («En el archivo: no se parece a ninguna de las plantillas…») con franja roja gruesa. | Igual | media |
| `adminc-promociones-aviso-beneficio` | celular | 4 | El aviso «Beneficio agregado. Se guarda con la promoción.» sale arriba y tapa el título del diálogo («Nueva promoción») y la primera fila de contenido; en escritorio sale a la derecha del diálogo y no tapa nada. Se ve en `adminc-promociones-aviso-beneficio-celular.jpg`, y≈50–108. | Regla 4 (elementos montados o cortados); Movimiento: los avisos entran desde abajo | media |
| `adminc-promociones-nueva-con-beneficios-listos` | celular | 4 | Mismo aviso montado sobre el encabezado del diálogo; el título no se lee. | Regla 4 | media |
| `adminc-promociones-nueva-error-servidor` | celular | 4 | Mismo aviso sobre el encabezado del diálogo, y además queda un aviso de éxito junto al error de servidor (mensajes contradictorios en la misma pantalla). | Regla 4 | media |
| `adminc-promociones-nueva-sin-conexion` | celular | 4 | Mismo aviso sobre el encabezado del diálogo. | Regla 4 | media |
| `adminc-inicio-cargando` | escritorio y celular | 1 | El título dice «Inicio de Administración mientras carga «Para empezar» (el menú ya se ve)», pero la captura solo muestra «Cargando…» sobre fondo vacío: no hay título «Administración», ni buscador, ni las tarjetas del menú. No muestra el estado de su título. | Hallazgo tipo 1 | media |
| `adminc-grupos-aviso-guardado` | celular | 3 | En la barra inferior «Tareas» aparece en negrita y texto oscuro (ícono más oscuro), como seleccionada, aunque la pantalla es Administración (cuelga de «Más»). El activo debe ir en `--primario`; este estado no es ni activo ni inactivo (parece un estado de presión que quedó en la captura). Medido: 28 píxeles oscuros en la etiqueta «Tareas» contra 3 en las demás capturas. | SISTEMA-VISUAL, Navegación (celular): activo en `--primario` y peso 700; regla 4 | baja |
| `adminc-instructores-aviso-guardado` | celular | 3 | Igual: «Tareas» en negrita oscura. | Igual | baja |
| `adminc-programas-aviso-guardado` | celular | 3 | Igual. | Igual | baja |
| `adminc-promociones-aviso-guardada` | celular | 3 | Igual. | Igual | baja |
| `adminc-verticales-aviso-guardada` | celular | 3 | Igual. | Igual | baja |
| `adminc-inicio-muchos` | escritorio y celular | 1 | Captura idéntica byte a byte a `adminc-inicio-escuela-lista` (ambas vistas). Su título promete «la lista de pasos repetida» y no se ve ninguna lista (el panel «Para empezar» está con «Ver los pasos» cerrado). | Hallazgo tipo 1 | baja |
| `adminc-catalogo-vacio` | celular | 1 | La captura celular es idéntica a `adminc-catalogo-con-datos-celular` (el desplegable «Descargar una por una» cerrado): no muestra «la lista de plantillas vacía». En escritorio sí difieren. | Hallazgo tipo 1 | baja |
| `adminc-promociones-editar-quitar-error-servidor` | escritorio y celular | 2 | El botón de ícono de papelera del beneficio muestra relleno rosa (`--peligro-suave`) y borde suave: aspecto de «peligro con relleno suave» del diseño anterior (probablemente el estado de presión que quedó en la captura). | Botones: «Solo ícono: 44 × 44, sin fondo»; Destructivo: fondo blanco, borde y texto `--peligro` | baja |
| `adminc-promociones-editar-beneficios` | celular | 2 | Igual: la papelera de «Producto gratis (Uniforme)» con relleno rosa. | Igual | baja |

## (c) Ids sin hallazgos (168)

`adminc-aviso-primeros-pasos-embudo`
`adminc-catalogo-aplicado`
`adminc-catalogo-archivo-de-excel`
`adminc-catalogo-archivo-pesado`
`adminc-catalogo-archivos-elegidos`
`adminc-catalogo-cargando`
`adminc-catalogo-con-datos`
`adminc-catalogo-confirmar`
`adminc-catalogo-confirmar-error-servidor`
`adminc-catalogo-confirmar-sin-conexion`
`adminc-catalogo-demasiados-archivos`
`adminc-catalogo-error`
`adminc-catalogo-muchos`
`adminc-catalogo-plantillas-una-por-una`
`adminc-catalogo-revisando`
`adminc-catalogo-revisar-error-servidor`
`adminc-catalogo-revisar-sin-conexion`
`adminc-catalogo-revision-con-omitidos`
`adminc-catalogo-revision-detalle-y-avisos`
`adminc-catalogo-revision-limpia`
`adminc-catalogo-sin-cambios`
`adminc-grupos-aviso-baja`
`adminc-grupos-baja-confirmar`
`adminc-grupos-baja-error-servidor`
`adminc-grupos-busqueda`
`adminc-grupos-busqueda-sin-resultados`
`adminc-grupos-cargando`
`adminc-grupos-con-datos`
`adminc-grupos-editar`
`adminc-grupos-editar-completo`
`adminc-grupos-error`
`adminc-grupos-filtro-programa`
`adminc-grupos-muchos`
`adminc-grupos-nuevo-con-horarios`
`adminc-grupos-nuevo-error-servidor`
`adminc-grupos-nuevo-sin-conexion`
`adminc-grupos-nuevo-vacio`
`adminc-grupos-nuevo-validacion`
`adminc-grupos-nuevo-validacion-horario`
`adminc-grupos-paginado`
`adminc-grupos-vacio`
`adminc-grupos-variedad`
`adminc-inicio-busqueda`
`adminc-inicio-busqueda-sin-resultados`
`adminc-inicio-con-datos`
`adminc-inicio-error`
`adminc-inicio-escuela-lista`
`adminc-inicio-pasos-abiertos-lista`
`adminc-inicio-sin-hechos`
`adminc-inicio-vacio`
`adminc-instructores-aviso-baja`
`adminc-instructores-baja-confirmar`
`adminc-instructores-baja-error-servidor`
`adminc-instructores-cargando`
`adminc-instructores-con-datos`
`adminc-instructores-con-salones`
`adminc-instructores-editar`
`adminc-instructores-error`
`adminc-instructores-muchos`
`adminc-instructores-nuevo-error-servidor`
`adminc-instructores-nuevo-sin-conexion`
`adminc-instructores-nuevo-vacio`
`adminc-instructores-nuevo-validacion`
`adminc-instructores-vacio`
`adminc-precios-aviso-nueva-vigencia`
`adminc-precios-cargando-historial`
`adminc-precios-cargando-programas`
`adminc-precios-con-datos`
`adminc-precios-error-historial`
`adminc-precios-error-programas`
`adminc-precios-historial-completo`
`adminc-precios-muchos`
`adminc-precios-nueva-vigencia-error-servidor`
`adminc-precios-nueva-vigencia-sin-conexion`
`adminc-precios-nueva-vigencia-vacio`
`adminc-precios-nueva-vigencia-validacion`
`adminc-precios-programa-sin-precio`
`adminc-precios-sin-programa`
`adminc-programas-aviso-baja`
`adminc-programas-baja-confirmar`
`adminc-programas-baja-error-servidor`
`adminc-programas-cargando`
`adminc-programas-con-datos`
`adminc-programas-editar`
`adminc-programas-editar-completo`
`adminc-programas-error`
`adminc-programas-filtro-sucursal`
`adminc-programas-muchos`
`adminc-programas-nuevo-edades-invertidas`
`adminc-programas-nuevo-error-servidor`
`adminc-programas-nuevo-sin-conexion`
`adminc-programas-nuevo-vacio`
`adminc-programas-nuevo-validacion`
`adminc-programas-paginado`
`adminc-programas-vacio`
`adminc-programas-variedad`
`adminc-promociones-aviso-baja`
`adminc-promociones-baja-confirmar`
`adminc-promociones-baja-error-servidor`
`adminc-promociones-beneficio-tipos`
`adminc-promociones-beneficio-validacion`
`adminc-promociones-cargando`
`adminc-promociones-con-datos`
`adminc-promociones-editar`
`adminc-promociones-editar-completa`
`adminc-promociones-editar-completa-alcance`
`adminc-promociones-error`
`adminc-promociones-muchos`
`adminc-promociones-nueva-alcance-y-beneficios`
`adminc-promociones-nueva-condicion-hermanos`
`adminc-promociones-nueva-condicion-pago-anticipado`
`adminc-promociones-nueva-vacio`
`adminc-promociones-nueva-validacion`
`adminc-promociones-nueva-validacion-beneficios`
`adminc-promociones-nueva-validacion-fechas-y-cupo`
`adminc-promociones-paginado`
`adminc-promociones-vacio`
`adminc-promociones-variedad`
`adminc-salones-aviso-baja`
`adminc-salones-aviso-guardado`
`adminc-salones-baja-confirmar`
`adminc-salones-baja-error-servidor`
`adminc-salones-editar`
`adminc-salones-nuevo-error-servidor`
`adminc-salones-nuevo-sin-conexion`
`adminc-salones-nuevo-vacio`
`adminc-salones-nuevo-validacion`
`adminc-sucursales-aviso-baja`
`adminc-sucursales-aviso-guardada`
`adminc-sucursales-aviso-ofrece`
`adminc-sucursales-baja-confirmar`
`adminc-sucursales-baja-error-servidor`
`adminc-sucursales-cargando`
`adminc-sucursales-con-datos`
`adminc-sucursales-editar`
`adminc-sucursales-editar-cambia-zona`
`adminc-sucursales-editar-error-servidor`
`adminc-sucursales-editar-otra-zona`
`adminc-sucursales-error`
`adminc-sucursales-muchos`
`adminc-sucursales-nueva-error-servidor`
`adminc-sucursales-nueva-sin-conexion`
`adminc-sucursales-nueva-vacio`
`adminc-sucursales-nueva-validacion`
`adminc-sucursales-ofrece-error-servidor`
`adminc-sucursales-vacio`
`adminc-sucursales-variedad`
`adminc-verticales-aviso-activada`
`adminc-verticales-aviso-baja`
`adminc-verticales-aviso-desactivada`
`adminc-verticales-baja-confirmar`
`adminc-verticales-baja-error-servidor`
`adminc-verticales-cargando`
`adminc-verticales-con-datos`
`adminc-verticales-desactivar-error-servidor`
`adminc-verticales-desactivar-sin-conexion`
`adminc-verticales-editar`
`adminc-verticales-editar-completa`
`adminc-verticales-editar-error-servidor`
`adminc-verticales-error`
`adminc-verticales-muchos`
`adminc-verticales-nueva-error-servidor`
`adminc-verticales-nueva-sin-conexion`
`adminc-verticales-nueva-vacio`
`adminc-verticales-nueva-validacion`
`adminc-verticales-nueva-validacion-abajo`
`adminc-verticales-vacio`
`adminc-verticales-variedad`
